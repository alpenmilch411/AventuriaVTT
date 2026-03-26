"""WebSocket message routing and handler functions.

This is the heart of the realtime layer.  Every inbound message is dispatched
by ``handle_message`` to a specialised async handler.  Handlers validate the
request, apply game logic, and broadcast responses via the ConnectionManager.

In-memory session state is maintained in ``_session_state`` so that
reconnecting clients can receive a full sync without a database round-trip.
Persistence to PostgreSQL happens asynchronously where appropriate but is
**not** blocking for the realtime path.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from datetime import datetime
from typing import Any, Optional

from ws.events import EventType, BroadcastTarget, WSMessage
from ws.manager import manager

logger = logging.getLogger("aventuria.ws")

# ---------------------------------------------------------------------------
# Per-character asyncio locks — serialise DB writes to prevent race conditions
# ---------------------------------------------------------------------------
_character_locks: dict[str, asyncio.Lock] = {}


def _get_char_lock(character_id: str) -> asyncio.Lock:
    """Return (and lazily create) an asyncio lock for a specific character."""
    if character_id not in _character_locks:
        _character_locks[character_id] = asyncio.Lock()
    return _character_locks[character_id]


def _safe_create_task(coro, *, name: str = ""):
    """Wrapper around asyncio.create_task that logs exceptions instead of silently dropping them."""
    task = asyncio.create_task(coro)  # safe: this IS the wrapper

    def _on_done(t: asyncio.Task):
        if t.cancelled():
            return
        exc = t.exception()
        if exc:
            logger.error("Background task %s failed: %s", name or t.get_name(), exc)

    task.add_done_callback(_on_done)
    return task


# ---------------------------------------------------------------------------
# Lightweight in-memory session state (per session_code)
# ---------------------------------------------------------------------------
# Keyed by session_code.  Each entry is a dict that mirrors the live game
# state so we can serve SYNC_FULL without touching the database.

_session_state: dict[str, dict[str, Any]] = {}


def cleanup_session_state(session_code: str) -> None:
    """Remove in-memory state for a session when all clients disconnect."""
    _session_state.pop(session_code, None)
    # Clean up character locks for this session to prevent unbounded growth
    # (locks are per-character, not per-session, so we leave them — they're cheap)


# ---------------------------------------------------------------------------
# Snapshot persistence — debounced upsert of full session state to DB
# ---------------------------------------------------------------------------

_last_snapshot: dict[str, float] = {}
SNAPSHOT_DEBOUNCE = 5.0  # seconds


async def _snapshot_session_state(session_code: str) -> None:
    """Persist a full copy of the in-memory session state to the DB.

    Debounced: skips if fewer than SNAPSHOT_DEBOUNCE seconds have elapsed
    since the last snapshot for this session.
    """
    now = time.monotonic()
    if session_code in _last_snapshot and (now - _last_snapshot[session_code]) < SNAPSHOT_DEBOUNCE:
        return

    state = _session_state.get(session_code)
    if state is None:
        return

    try:
        from database import async_session
        from sqlalchemy import select, delete
        from models.session_state import SessionSnapshot

        # Make a shallow copy of the state dict so the JSON serialiser
        # sees a stable snapshot even if the live dict mutates.
        snapshot_data = dict(state)

        async with async_session() as db:
            result = await db.execute(
                select(SessionSnapshot).where(SessionSnapshot.session_code == session_code)
            )
            existing = result.scalar_one_or_none()
            if existing:
                existing.snapshot_json = snapshot_data
                existing.updated_at = datetime.utcnow()
            else:
                db.add(SessionSnapshot(
                    id=str(uuid.uuid4()),
                    session_code=session_code,
                    snapshot_json=snapshot_data,
                    updated_at=datetime.utcnow(),
                ))
            await db.commit()

        _last_snapshot[session_code] = time.monotonic()
        logger.debug("Snapshot saved for session %s", session_code)
    except Exception as e:
        logger.error("Failed to save snapshot for session %s: %s", session_code, e)


async def _delete_session_snapshot(session_code: str) -> None:
    """Remove the persisted snapshot for a session (called on session end)."""
    try:
        from database import async_session
        from sqlalchemy import delete
        from models.session_state import SessionSnapshot

        async with async_session() as db:
            await db.execute(
                delete(SessionSnapshot).where(SessionSnapshot.session_code == session_code)
            )
            await db.commit()
        _last_snapshot.pop(session_code, None)
        logger.info("Snapshot deleted for ended session %s", session_code)
    except Exception as e:
        logger.error("Failed to delete snapshot for session %s: %s", session_code, e)


async def _restore_state_from_snapshot(session_code: str) -> bool:
    """Try to restore in-memory session state from a DB snapshot.

    Returns True if a snapshot was found and restored, False otherwise.
    """
    try:
        from database import async_session
        from sqlalchemy import select
        from models.session_state import SessionSnapshot

        async with async_session() as db:
            result = await db.execute(
                select(SessionSnapshot).where(SessionSnapshot.session_code == session_code)
            )
            snap = result.scalar_one_or_none()
            if snap:
                _session_state[session_code] = snap.snapshot_json
                logger.info("Restored session state from snapshot for %s", session_code)
                return True
    except Exception as e:
        logger.error("Failed to restore snapshot for session %s: %s", session_code, e)
    return False


def _ensure_state(session_code: str) -> dict[str, Any]:
    """Return (and lazily create) the in-memory state dict for a session."""
    if session_code not in _session_state:
        _session_state[session_code] = {
            "status": "lobby",
            "active_scene": None,
            "combat": None,           # None | CombatSnapshot dict
            "tokens": [],
            "in_game_time": None,
            "weather": None,
            "halted": False,
            "attention": False,
            "connected_users": [],
            "quests": [],
            "lore_entries": [],
            "pending_requests": {},    # request_id -> request data
            "vitals": {},              # character_id -> {lep, asp, kap, schip}
            "conditions": {},          # character_id -> [{name, level}]
            "max_vitals": {},          # character_id -> {LeP_max, AsP_max, ...}
            "buffs": {},               # character_id -> [{...}]
            "session_log": [],         # unified log: [{type, text, icon, ts}] — last 500 entries
            "state_version": 0,        # monotonic counter, incremented on every state change
        }
    return _session_state[session_code]


def _bump_version(state: dict) -> int:
    """Increment and return the session state version counter."""
    state["state_version"] = state.get("state_version", 0) + 1
    return state["state_version"]


def _combat_snapshot(state: dict) -> Optional[dict]:
    """Return the current combat sub-state, or None."""
    return state.get("combat")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ts() -> str:
    return datetime.utcnow().isoformat()


def _error(detail: str) -> dict:
    return {"type": EventType.ERROR, "payload": {"detail": detail}, "timestamp": _ts()}


def _msg(event_type, payload: dict, *, from_user: str = None, target: str = "all") -> dict:
    return {
        "type": event_type.value if hasattr(event_type, 'value') else str(event_type),
        "from_user": from_user,
        "target": target,
        "payload": payload,
        "timestamp": _ts(),
    }


def _is_gm(session_code: str, user_id: str) -> bool:
    return manager.get_gm_id(session_code) == user_id


async def _append_session_log(session_code: str, entry_type: str, text: str, *, icon: str = None, data: dict = None):
    """Append to the in-memory session log and broadcast to all clients."""
    state = _ensure_state(session_code)
    entry = {
        "type": entry_type,
        "text": text,
        "icon": icon,
        "ts": _ts(),
    }
    if data:
        entry["data"] = data
    log = state["session_log"]
    log.append(entry)
    # Keep last 500 entries
    if len(log) > 500:
        state["session_log"] = log[-500:]
    # Broadcast to all clients
    await manager.broadcast_to_room(session_code, _msg("session_log_entry", entry))


def _resolve_deltas(session_code: str, character_id: str, vitals: dict) -> dict:
    """Convert any delta values (lep_delta etc.) to absolute values using in-memory state.

    This runs synchronously in the event loop (no awaits) so there is no
    interleaving risk for the in-memory state.  The result is a dict with
    only absolute keys (lep, asp, kap, schip — never *_delta).
    """
    state = _ensure_state(session_code)
    current = state.get("vitals", {}).get(character_id, {})
    max_vals = state.get("max_vitals", {}).get(character_id, {})

    resolved = {}
    for key, value in vitals.items():
        if value is None:
            continue
        if key.endswith("_delta"):
            base_key = key.replace("_delta", "")
            max_key = {"lep": "LeP_max", "asp": "AsP_max", "kap": "KaP_max"}.get(base_key)
            max_val = max_vals.get(max_key) if max_key else None
            if max_val is None:
                logger.warning(
                    "max_vitals not cached for %s key=%s — clamping to 999. "
                    "Ensure _cache_character_vitals ran before delta resolution.",
                    character_id, max_key,
                )
                max_val = 999
            current_val = current.get(base_key, max_val)
            resolved[base_key] = max(0, min(max_val, current_val + value))
        else:
            resolved[key] = value
    return resolved


async def _cache_character_vitals(session_code: str, character_id: str):
    """Ensure in-memory vitals and max-vitals are populated from DB.

    Max vitals (derived_values) are cached permanently — they rarely change.
    Current vitals are loaded from DB if not yet in memory, so that delta
    resolution always has the correct base value.
    """
    state = _ensure_state(session_code)
    have_max = character_id in state.get("max_vitals", {})
    have_current = character_id in state.get("vitals", {})
    if have_max and have_current:
        return
    try:
        from database import async_session
        from sqlalchemy import select
        from models.character import Character

        async with async_session() as db:
            result = await db.execute(select(Character).where(Character.id == character_id))
            char = result.scalar_one_or_none()
            if char:
                if char.derived_values and not have_max:
                    state.setdefault("max_vitals", {})[character_id] = char.derived_values
                if not have_current:
                    if char.current_vitals:
                        state.setdefault("vitals", {})[character_id] = dict(char.current_vitals)
                    else:
                        # No current vitals in DB — seed from max values
                        dv = char.derived_values or {}
                        state.setdefault("vitals", {})[character_id] = {
                            "lep": dv.get("LeP_max", 0),
                            "asp": dv.get("AsP_max", 0),
                            "kap": dv.get("KaP_max", 0),
                            "schip": dv.get("Schip", 3),
                        }
                    logger.debug("Loaded vitals for %s from DB: %s", character_id, state["vitals"][character_id])
    except Exception as e:
        logger.error("Failed to cache vitals for %s: %s", character_id, e)


async def _persist_vitals(character_id: str, vitals: dict):
    """Persist absolute vitals to the database, serialised per character."""
    async with _get_char_lock(character_id):
        try:
            from database import async_session
            from sqlalchemy import select
            from models.character import Character

            async with async_session() as db:
                result = await db.execute(select(Character).where(Character.id == character_id))
                char = result.scalar_one_or_none()
                if char:
                    current = dict(char.current_vitals or {})
                    current.update({k: v for k, v in vitals.items() if v is not None})
                    char.current_vitals = current
                    await db.commit()
                    logger.info("Persisted vitals for character %s: %s", character_id, current)
        except Exception as e:
            logger.error("Failed to persist vitals for %s: %s", character_id, e)


async def _persist_conditions(character_id: str, conditions: list):
    """Persist conditions to Character.conditions in DB, serialised per character."""
    async with _get_char_lock(character_id):
        try:
            from database import async_session
            from sqlalchemy import select
            from models.character import Character

            async with async_session() as db:
                result = await db.execute(select(Character).where(Character.id == character_id))
                char = result.scalar_one_or_none()
                if char:
                    char.conditions = conditions
                    await db.commit()
                    logger.debug("Persisted conditions for %s: %s", character_id, conditions)
        except Exception as e:
            logger.error("Failed to persist conditions for %s: %s", character_id, e)


async def _persist_loot(distributions: list):
    """Persist loot items to character inventories in DB. Stacks with existing items.

    Acquires per-character locks so concurrent loot for the same character
    does not lose quantity.
    """
    # Group by character to minimise lock contention
    by_char: dict[str, list] = {}
    for dist in distributions:
        cid = dist.get("character_id")
        if cid:
            by_char.setdefault(cid, []).append(dist)

    for char_id, char_dists in by_char.items():
        async with _get_char_lock(char_id):
            try:
                from database import async_session
                from sqlalchemy import select
                from models.inventory import InventoryItem
                import uuid

                async with async_session() as db:
                    for dist in char_dists:
                        item_name = dist.get("item_name", "Unbekannt")
                        qty = dist.get("quantity", 1)
                        existing_result = await db.execute(
                            select(InventoryItem).where(
                                InventoryItem.character_id == char_id,
                                InventoryItem.name == item_name,
                            )
                        )
                        existing = existing_result.scalar_one_or_none()
                        if existing:
                            existing.quantity += qty
                            continue
                        item = InventoryItem(
                            id=str(uuid.uuid4()),
                            character_id=char_id,
                            name=item_name,
                            quantity=qty,
                            equipped=False,
                            properties=dist.get("properties"),
                        )
                        db.add(item)
                    await db.commit()
                    logger.info("Persisted %d loot items for character %s", len(char_dists), char_id)
            except Exception as e:
                logger.error("Failed to persist loot for %s: %s", char_id, e)


async def _persist_money_distributions(money_distributions: list):
    """Add currency to character purses in DB."""
    by_char: dict[str, dict] = {}
    for dist in money_distributions:
        cid = dist.get("character_id")
        if cid:
            by_char[cid] = dist

    for char_id, dist in by_char.items():
        async with _get_char_lock(char_id):
            try:
                from database import async_session
                from sqlalchemy import select
                from models.character import Character

                async with async_session() as db:
                    result = await db.execute(select(Character).where(Character.id == char_id))
                    char = result.scalar_one_or_none()
                    if char:
                        inv = _inv_add(char.basis_inventory or {}, [], dist)
                        char.basis_inventory = inv
                        await db.commit()
                        logger.info("Persisted money for character %s", char_id)
            except Exception as e:
                logger.error("Failed to persist money for %s: %s", char_id, e)


async def _persist_inventory(character_id: str, inventory: dict):
    """Persist basis_inventory to Character in DB (backup for frontend REST PUT)."""
    async with _get_char_lock(character_id):
        try:
            from database import async_session
            from sqlalchemy import select
            from models.character import Character

            async with async_session() as db:
                result = await db.execute(select(Character).where(Character.id == character_id))
                char = result.scalar_one_or_none()
                if char:
                    char.basis_inventory = inventory
                    await db.commit()
                    logger.debug("Persisted inventory for %s", character_id)
        except Exception as e:
            logger.error("Failed to persist inventory for %s: %s", character_id, e)


def _is_current_turn(state: dict, user_id: str) -> bool:
    """Check whether *user_id* is the active combatant."""
    combat = _combat_snapshot(state)
    if combat is None:
        return False
    order = combat.get("initiative_order", [])
    idx = combat.get("current_turn_index", 0)
    if not order or idx >= len(order):
        return False
    current = order[idx]
    # Check multiple possible ID fields (JS camelCase vs Python snake_case)
    return (current.get("user_id") == user_id or
            current.get("userId") == user_id or
            current.get("characterId") == user_id)


# ===================================================================
# Main dispatcher
# ===================================================================

async def handle_message(websocket, user_id: str, session_code: str, raw: dict):
    """Route an incoming WebSocket message to the correct handler.

    Parameters
    ----------
    websocket : FastAPI WebSocket (kept for possible per-connection replies)
    user_id   : Authenticated user id string
    session_code : The room / session code
    raw       : Parsed JSON dict from the client
    """
    event_type = raw.get("type")
    payload = raw.get("payload", {})
    state = _ensure_state(session_code)
    if event_type not in ("ping",):
        import sys
        print(f"[WS-MSG] {event_type} from {user_id[:8]} (gm={_is_gm(session_code, user_id)})", flush=True)

    # Quick sanity check
    if event_type is None:
        await manager.send_to_user(user_id, _error("Missing 'type' field"))
        return

    # ---- System events (no auth gate) ---------------------------------
    if event_type == EventType.PING:
        await manager.send_to_user(user_id, _msg(EventType.PONG, {}))
        return

    if event_type == "sync_request":
        await manager.send_to_user(user_id, get_full_sync(session_code))
        return

    # ---- GM-only commands ---------------------------------------------
    gm_commands = {
        EventType.SCENE_ACTIVATE: _handle_scene_activate,
        EventType.COMBAT_START: _handle_combat_start,
        EventType.COMBAT_END: _handle_combat_end,
        EventType.COMBAT_NEXT_TURN: _handle_combat_next_turn,
        EventType.PROBE_REQUEST: _handle_probe_request,
        EventType.GROUP_PROBE_REQUEST: _handle_group_probe_request,
        EventType.WHISPER: _handle_whisper,
        EventType.HALT: _handle_halt,
        EventType.HALT_RELEASE: _handle_halt_release,
        EventType.TOKEN_SPAWN: _handle_token_spawn,
        EventType.TOKEN_REMOVE: _handle_token_remove,
        EventType.HANDOUT_PUSH: _handle_handout_push,
        EventType.TIME_ADVANCE: _handle_time_advance,
        EventType.WEATHER_CHANGE: _handle_weather_change,
        EventType.ATTENTION: _handle_attention,
        EventType.ATTENTION_RELEASE: _handle_attention_release,
        EventType.AP_AWARD: _handle_ap_award,
        EventType.QUEST_UPDATE: _handle_quest_update,
        EventType.LORE_REVEAL: _handle_lore_reveal,
        EventType.SESSION_START: _handle_session_start,
        EventType.SESSION_PAUSE: _handle_session_pause,
        EventType.SESSION_END: _handle_session_end,
    }

    if event_type in gm_commands:
        if not _is_gm(session_code, user_id):
            await manager.send_to_user(user_id, _error("Only the GM may issue this command"))
            return
        await gm_commands[event_type](session_code, user_id, payload, state)
        return

    # ---- Player actions -----------------------------------------------
    player_actions = {
        EventType.ACTION_DECLARE: _handle_action_declare,
        EventType.DICE_RESULT: _handle_dice_result,
        EventType.DEFENSE_CHOICE: _handle_defense_choice,
        EventType.ITEM_USE: _handle_item_use,
        EventType.ITEM_TRANSFER: _handle_item_transfer,
        EventType.SPELL_CAST: _handle_spell_cast,
        EventType.TOKEN_MOVE: _handle_token_move,
    }

    if event_type in player_actions:
        # Halt gate — players cannot act while session is halted
        if manager.is_halted(session_code):
            await manager.send_to_user(user_id, _error("Session is halted — please wait for the GM"))
            return
        await player_actions[event_type](session_code, user_id, payload, state)
        return

    # ---- Trade / transfer messages ----
    trade_events = {
        "trade_propose", "trade_accept", "trade_decline", "trade_cancel",
        "trade_counter", "trade_approved", "trade_rejected", "trade_gm_request",
        "transfer_request", "transfer_approved", "transfer_rejected",
    }
    if event_type in trade_events:
        if manager.is_halted(session_code):
            await manager.send_to_user(user_id, _error("Session is halted — please wait for the GM"))
            return
        await _handle_trade_message(session_code, user_id, event_type, payload, state)
        return

    # ---- Relay messages that don't have specific handlers ----
    # Player → GM requests (action_request, probe_request_from_player, spell_cast_request)
    # These get forwarded to the GM
    # Player self-updates (item use effects) — persist and broadcast

    # Halt gate — block player state mutations while session is halted
    halt_gated_events = {"vitals_update", "conditions_update", "inventory_change", "combat_log_entry"}
    if event_type in halt_gated_events and not _is_gm(session_code, user_id) and manager.is_halted(session_code):
        await manager.send_to_user(user_id, _error("Session is halted — please wait for the GM"))
        return

    if event_type == "vitals_update" and not _is_gm(session_code, user_id) and payload.get("character_id"):
        cid = payload["character_id"]
        raw_vitals = payload.get("vitals", {})
        async with _get_char_lock(cid):
            # Ensure max_vitals are cached for delta resolution
            await _cache_character_vitals(session_code, cid)
            # Resolve any deltas to absolute values
            resolved = _resolve_deltas(session_code, cid, raw_vitals)
            # Update in-memory state with absolute values
            existing = state.setdefault("vitals", {}).get(cid, {})
            state["vitals"][cid] = {**existing, **resolved}
            _bump_version(state)
            _safe_create_task(_persist_vitals(cid, resolved), name=f"persist_vitals_{cid[:8]}")
            out_payload = {**payload, "vitals": resolved, "state_version": state["state_version"]}
            msg = _msg(event_type, out_payload, from_user=user_id)
            await manager.broadcast_to_room(session_code, msg)
        logger.info("Player %s updated vitals for %s: %s", user_id, cid, resolved)
        _safe_create_task(_snapshot_session_state(session_code), name=f"snapshot_vitals_{session_code}")
        return

    if event_type == "combat_log_entry" and not _is_gm(session_code, user_id):
        msg = _msg(event_type, payload, from_user=user_id)
        await manager.broadcast_to_room(session_code, msg)
        # Store in session_log for reconnect persistence (no separate broadcast)
        etype = payload.get("type", "system")
        icon_map = {"damage": "droplet", "heal": "heart", "critical": "zap", "system": "info", "roll": "dice", "defense": "shield", "fumble": "alert", "item_use": "package"}
        log = state["session_log"]
        log.append({"type": etype, "text": payload.get("text", ""), "icon": icon_map.get(etype, "info"), "ts": _ts()})
        if len(log) > 500:
            state["session_log"] = log[-500:]
        return

    if event_type == "conditions_update" and not _is_gm(session_code, user_id) and payload.get("character_id"):
        cid = payload["character_id"]
        async with _get_char_lock(cid):
            # Handle add/remove conditions from player (e.g. item use)
            conds = list(state.setdefault("conditions", {}).get(cid, []))
            if payload.get("add_condition"):
                existing = next((c for c in conds if c["name"] == payload["add_condition"]), None)
                if existing:
                    existing["level"] = existing.get("level", 1) + payload.get("level", 1)
                else:
                    conds.append({"name": payload["add_condition"], "level": payload.get("level", 1)})
            if payload.get("remove_condition"):
                reduce = payload.get("reduce_level", 1)
                for c in conds:
                    if c["name"] == payload["remove_condition"]:
                        c["level"] = max(0, c.get("level", 1) - reduce)
                        if c["level"] <= 0:
                            conds.remove(c)
                        break
            state["conditions"][cid] = conds
            _bump_version(state)
            _safe_create_task(_persist_conditions(cid, conds), name=f"persist_conditions_{cid[:8]}")
            msg = _msg(event_type, {**payload, "state_version": state["state_version"]}, from_user=user_id)
            await manager.broadcast_to_room(session_code, msg)
        logger.info("Player %s updated conditions for %s", user_id, cid)
        _safe_create_task(_snapshot_session_state(session_code), name=f"snapshot_conditions_{session_code}")
        return

    # Inventory change — broadcast to all and persist as backup
    if event_type == "inventory_change" and payload.get("character_id"):
        msg = _msg(event_type, payload, from_user=user_id)
        await manager.broadcast_to_room(session_code, msg)
        # Also persist inventory to DB as backup (frontend does REST PUT, but this covers failures)
        if payload.get("inventory"):
            _safe_create_task(
                _persist_inventory(payload["character_id"], payload["inventory"]),
                name=f"persist_inventory_{payload['character_id'][:8]}",
            )
        logger.info("Player %s broadcast inventory_change for %s", user_id, payload["character_id"])
        return

    # Probe cancel — player withdraws their probe request
    if event_type == "probe_cancel":
        request_id = payload.get("request_id") or payload.get("talent_key") or ""
        # Remove from pending requests
        pending = state.get("pending_requests", {})
        to_remove = [k for k, v in pending.items() if v.get("from_user") == user_id and (k == request_id or v.get("talent_key") == request_id)]
        for k in to_remove:
            del pending[k]
        # Notify GM
        msg = _msg("probe_cancel", {**payload, "from_user": user_id}, from_user=user_id)
        await manager.broadcast_to_room(session_code, msg, target="gm")
        logger.info("Player %s cancelled probe %s in %s", user_id, request_id, session_code)
        return

    relay_to_gm = {
        "action_request", "probe_request_from_player", "spell_cast_request",
        "item_use", "item_equip", "item_drop", "item_transfer",
    }
    if event_type in relay_to_gm:
        payload["from_user"] = user_id
        # Store probe requests in pending_requests for reconnect persistence
        if event_type == "probe_request_from_player":
            req_id = f"probe_{user_id}_{payload.get('talent_key', '')}"
            state.setdefault("pending_requests", {})[req_id] = {
                **payload, "from_user": user_id, "type": event_type, "timestamp": datetime.utcnow().isoformat(),
            }
        msg = _msg(event_type, payload, from_user=user_id, target="gm")
        await manager.broadcast_to_room(session_code, msg, target="gm")
        logger.info("Relayed %s from %s to GM in %s", event_type, user_id, session_code)
        return

    # GM → targeted message (dice_request, defense_request, probe_consequence go to specific player)
    if event_type in ("dice_request", "defense_request", "probe_consequence"):
        is_gm = _is_gm(session_code, user_id)
        logger.info("dice/defense_request from %s (is_gm=%s) in %s", user_id, is_gm, session_code)
        if is_gm:
            target_user = payload.get("target_user_id")
            if target_user:
                # Store dice_request in pending state for reconnect persistence
                if event_type == "dice_request":
                    req_id = f"dice_{target_user}"
                    state.setdefault("pending_requests", {})[req_id] = {
                        **payload, "type": event_type, "timestamp": datetime.utcnow().isoformat(),
                    }
                msg = _msg(event_type, payload, from_user=user_id)
                await manager.send_to_user(target_user, msg)
                logger.info("GM sent %s to %s in %s", event_type, target_user, session_code)
                return
            # Fallback: broadcast to all players if no target
            msg = _msg(event_type, payload, from_user=user_id)
            await manager.broadcast_to_room(session_code, msg, target="players")
            logger.info("GM broadcast %s to all players in %s", event_type, session_code)
            return
        else:
            # Player sending dice_request — relay to GM
            payload["from_user"] = user_id
            msg = _msg(event_type, payload, from_user=user_id)
            await manager.broadcast_to_room(session_code, msg, target="gm")
            logger.info("Player relayed %s to GM in %s", event_type, session_code)
            return

    # GM → targeted approval/decline (action_approved, action_declined go to requesting player)
    if _is_gm(session_code, user_id) and event_type in ("action_approved", "action_declined"):
        target_user = payload.get("from_user") or payload.get("target_user_id")
        msg = _msg(event_type, payload, from_user=user_id)
        if target_user:
            await manager.send_to_user(target_user, msg)
        # Also broadcast to all for combat log
        await manager.broadcast_to_room(session_code, msg, exclude=user_id)
        logger.info("GM %s action for %s in %s", event_type, target_user, session_code)
        return

    # GM → item_transferred (notify both sender and receiver)
    if _is_gm(session_code, user_id) and event_type == "item_transferred":
        msg = _msg(event_type, payload, from_user=user_id)
        # Send to both involved players
        from_player = payload.get("from_player_id")
        to_player = payload.get("to_player_id")
        if from_player:
            await manager.send_to_user(from_player, msg)
        if to_player:
            await manager.send_to_user(to_player, msg)
        logger.info("GM transferred item in %s", session_code)
        return

    # GM → map_state_push (batched map update — update backend state + broadcast)
    if _is_gm(session_code, user_id) and event_type == "map_state_push":
        if payload.get("tokens"):
            state["tokens"] = payload["tokens"]
        msg = _msg(event_type, payload, from_user=user_id)
        await manager.broadcast_to_room(session_code, msg)
        logger.info("GM pushed map state to players in %s (%d tokens)", session_code, len(payload.get("tokens", [])))
        return

    # GM → vitals_update / conditions_update / state_update (broadcast to all)
    if _is_gm(session_code, user_id) and event_type in (
        "vitals_update", "conditions_update", "state_update", "condition_change",
        "loot_display", "loot_distribute", "combat_log_entry",
    ):
        # --- Vitals: resolve deltas to absolute before broadcast ---
        out_payload = payload
        cid = payload.get("character_id")
        if event_type == "vitals_update" and cid:
            async with _get_char_lock(cid):
                raw_vitals = payload.get("vitals", {})
                await _cache_character_vitals(session_code, cid)
                resolved = _resolve_deltas(session_code, cid, raw_vitals)
                existing = state.setdefault("vitals", {}).get(cid, {})
                state["vitals"][cid] = {**existing, **resolved}
                _bump_version(state)
                _safe_create_task(_persist_vitals(cid, resolved), name=f"persist_vitals_{cid[:8]}")
                out_payload = {**payload, "vitals": resolved, "state_version": state["state_version"]}
                msg = _msg(event_type, out_payload, from_user=user_id)
                await manager.broadcast_to_room(session_code, msg)
        elif event_type == "state_update" and cid and payload.get("current_lep") is not None:
            async with _get_char_lock(cid):
                vitals_update = {"lep": payload["current_lep"]}
                existing = state.setdefault("vitals", {}).get(cid, {})
                state["vitals"][cid] = {**existing, **vitals_update}
                _bump_version(state)
                _safe_create_task(_persist_vitals(cid, vitals_update), name=f"persist_vitals_{cid[:8]}")
                msg = _msg(event_type, {**out_payload, "state_version": state["state_version"]}, from_user=user_id)
                await manager.broadcast_to_room(session_code, msg)
        else:
            msg = _msg(event_type, out_payload, from_user=user_id)
            await manager.broadcast_to_room(session_code, msg)

        # --- Conditions ---
        if event_type == "conditions_update" and cid:
            async with _get_char_lock(cid):
                conds = list(state.setdefault("conditions", {}).get(cid, []))
                if payload.get("add_condition"):
                    existing = next((c for c in conds if c["name"] == payload["add_condition"]), None)
                    if existing:
                        existing["level"] = existing.get("level", 1) + payload.get("level", 1)
                    else:
                        conds.append({"name": payload["add_condition"], "level": payload.get("level", 1)})
                elif payload.get("remove_condition"):
                    reduce = payload.get("reduce_level", 1)
                    for c in conds:
                        if c["name"] == payload["remove_condition"]:
                            c["level"] = max(0, c.get("level", 1) - reduce)
                            if c["level"] <= 0:
                                conds.remove(c)
                            break
                elif payload.get("conditions") is not None:
                    conds = payload["conditions"]
                state["conditions"][cid] = conds
                _safe_create_task(_persist_conditions(cid, conds), name=f"persist_conditions_{cid[:8]}")
            logger.info("GM updated conditions for %s: %s", cid, conds)
        if event_type == "condition_change" and cid:
            async with _get_char_lock(cid):
                conds = state.setdefault("conditions", {}).get(cid, [])
                if payload.get("action") == "add":
                    conds.append({"name": payload.get("condition"), "level": payload.get("level", 1)})
                elif payload.get("action") == "remove":
                    conds = [c for c in conds if c.get("name") != payload.get("condition")]
                state["conditions"][cid] = conds
        # Persist loot to inventory DB — write-through (await before log)
        if event_type == "loot_distribute":
            if payload.get("distributions"):
                try:
                    await _persist_loot(payload["distributions"])
                except Exception as e:
                    logger.error("Failed to persist loot distribution: %s", e)
            if payload.get("money_distributions"):
                try:
                    await _persist_money_distributions(payload["money_distributions"])
                except Exception as e:
                    logger.error("Failed to persist money distributions: %s", e)
            await _append_session_log(session_code, "loot", f"Beute verteilt: {payload.get('source_name', 'Unbekannt')}", icon="package")
        # Store combat_log_entry in session_log state for reconnect persistence
        # Do NOT call _append_session_log here — it would broadcast a SECOND
        # session_log_entry message, causing duplicates.  The combat_log_entry
        # broadcast above is already received by all clients.
        if event_type == "combat_log_entry":
            etype = payload.get("type", "system")
            icon_map = {"damage": "droplet", "heal": "heart", "critical": "zap", "system": "info", "roll": "dice", "defense": "shield", "fumble": "alert", "item_use": "package"}
            entry = {"type": etype, "text": payload.get("text", ""), "icon": icon_map.get(etype, "info"), "ts": _ts()}
            if payload.get("data"):
                entry["data"] = payload["data"]
            log = state["session_log"]
            log.append(entry)
            if len(log) > 500:
                state["session_log"] = log[-500:]
        logger.info("GM broadcast %s in %s", event_type, session_code)
        # Snapshot after state-mutating GM events
        if event_type in ("vitals_update", "conditions_update", "condition_change"):
            _safe_create_task(_snapshot_session_state(session_code), name=f"snapshot_gm_{event_type}_{session_code}")
        return

    # GM → buff tracking
    if _is_gm(session_code, user_id) and event_type in ("buff_add", "buff_remove"):
        msg = _msg(event_type, payload, from_user=user_id)
        await manager.broadcast_to_room(session_code, msg)
        # Track buffs in session state for sync_full
        char_id = payload.get("character_id") or payload.get("characterId")
        if char_id:
            buffs = state.setdefault("buffs", {}).setdefault(char_id, [])
            if event_type == "buff_add":
                buffs.append(payload.get("buff", payload))
            elif event_type == "buff_remove":
                buff_id = payload.get("buff_id") or payload.get("id")
                state["buffs"][char_id] = [b for b in buffs if b.get("id") != buff_id]
        logger.info("GM %s for %s in %s", event_type, char_id, session_code)
        return

    # GM → all broadcast (generic relay for any GM message not in the handler map)
    if _is_gm(session_code, user_id):
        msg = _msg(event_type, payload, from_user=user_id)
        await manager.broadcast_to_room(session_code, msg, exclude=user_id)
        logger.info("GM broadcast %s in %s", event_type, session_code)
        return

    # Player → GM + all broadcast (dice_result, defense_choice, action_declare go to everyone)
    if event_type in ("dice_result", "defense_choice", "action_declare", "combat_log_entry"):
        payload["from_user"] = user_id
        # Clear pending requests on dice_result (probe completed)
        if event_type == "dice_result":
            pending = state.get("pending_requests", {})
            # Clear both the dice_request and the original probe_request for this user
            to_remove = [k for k in pending if k.startswith(f"dice_{user_id}") or k.startswith(f"probe_{user_id}")]
            for k in to_remove:
                del pending[k]
        msg = _msg(event_type, payload, from_user=user_id)
        await manager.broadcast_to_room(session_code, msg)
        logger.info("Player broadcast %s from %s in %s", event_type, user_id, session_code)
        return

    # Player → all broadcast (token_move etc. that aren't in the explicit map)
    msg = _msg(event_type, payload, from_user=user_id)
    await manager.broadcast_to_room(session_code, msg)
    logger.info("Player broadcast %s from %s in %s", event_type, user_id, session_code)


# ===================================================================
# GM command handlers
# ===================================================================

async def _handle_scene_activate(session_code: str, user_id: str, payload: dict, state: dict):
    """Activate a scene/map for all players."""
    scene_id = payload.get("scene_id")
    scene_name = payload.get("scene_name", "")
    state["active_scene"] = {"scene_id": scene_id, "scene_name": scene_name}
    state["tokens"] = payload.get("tokens", [])
    msg = _msg(EventType.SCENE_ACTIVATE, {
        "scene_id": scene_id,
        "scene_name": scene_name,
        "tokens": state["tokens"],
    }, from_user=user_id)
    await manager.broadcast_to_room(session_code, msg)
    await _append_session_log(session_code, "scene", f"Szene: {scene_name}", icon="map")
    # Persist current_scene_id to database so REST endpoints serve the right map
    if scene_id:
        try:
            from database import async_session
            from sqlalchemy import select, update
            from models.session_state import GameSession
            from models.campaign import Campaign

            async with async_session() as db:
                sess_result = await db.execute(
                    select(GameSession).where(GameSession.session_code == session_code)
                )
                session_obj = sess_result.scalar_one_or_none()
                if session_obj and session_obj.campaign_id:
                    await db.execute(
                        update(Campaign)
                        .where(Campaign.id == session_obj.campaign_id)
                        .values(current_scene_id=scene_id)
                    )
                    await db.commit()
                    logger.debug("Persisted current_scene_id=%s for campaign of session %s", scene_id, session_code)
        except Exception as e:
            logger.error("Failed to persist scene activation: %s", e)
    logger.info("Scene activated: %s in session %s", scene_name, session_code)
    _safe_create_task(_snapshot_session_state(session_code), name=f"snapshot_scene_{session_code}")


async def _handle_combat_start(session_code: str, user_id: str, payload: dict, state: dict):
    """Start combat — expects combatants with pre-rolled initiative."""
    combatants = payload.get("combatants", [])
    initiative_order = sorted(
        combatants,
        key=lambda c: (-c.get("initiative", 0), -c.get("ini_basis", 0), c.get("name", "")),
    )
    combat = {
        "active": True,
        "round_number": 1,
        "current_turn_index": 0,
        "initiative_order": initiative_order,
        "combatants": {c.get("id", c.get("name")): c for c in combatants},
        "log": [],
    }
    state["combat"] = combat
    msg = _msg(EventType.COMBAT_START, {
        "name": payload.get("name", "Kampf"),
        "battle_id": payload.get("battle_id"),
        "round_number": 1,
        "initiative_order": initiative_order,
        "current_turn": initiative_order[0] if initiative_order else None,
    }, from_user=user_id)
    await manager.broadcast_to_room(session_code, msg)
    names = ", ".join(c.get("name", "?") for c in initiative_order[:5])
    await _append_session_log(session_code, "combat", f"Kampf beginnt! Teilnehmer: {names}", icon="swords")
    logger.info("Combat started in session %s with %d combatants", session_code, len(combatants))
    _safe_create_task(_snapshot_session_state(session_code), name=f"snapshot_combat_start_{session_code}")


async def _handle_combat_end(session_code: str, user_id: str, payload: dict, state: dict):
    """End combat."""
    summary = payload.get("summary", "")
    state["combat"] = None
    msg = _msg(EventType.COMBAT_END, {"summary": summary}, from_user=user_id)
    await manager.broadcast_to_room(session_code, msg)
    await _append_session_log(session_code, "combat", f"Kampf beendet. {summary}", icon="flag")
    logger.info("Combat ended in session %s", session_code)
    _safe_create_task(_snapshot_session_state(session_code), name=f"snapshot_combat_end_{session_code}")


async def _handle_combat_next_turn(session_code: str, user_id: str, payload: dict, state: dict):
    """Advance combat to the next turn."""
    combat = _combat_snapshot(state)
    if combat is None:
        await manager.send_to_user(user_id, _error("No active combat"))
        return

    order = combat.get("initiative_order", [])
    if not order:
        await manager.send_to_user(user_id, _error("Empty initiative order"))
        return

    idx = combat.get("current_turn_index", 0) + 1
    round_number = combat.get("round_number", 1)
    if idx >= len(order):
        idx = 0
        round_number += 1

    combat["current_turn_index"] = idx
    combat["round_number"] = round_number

    current = order[idx]
    msg = _msg(EventType.COMBAT_NEXT_TURN, {
        "round_number": round_number,
        "current_turn_index": idx,
        "current_turn": current,
        "combatant_name": current.get("name"),
        "initiative_order": order,
    }, from_user=user_id)
    await manager.broadcast_to_room(session_code, msg)
    cname = current.get("name", "?")
    await _append_session_log(session_code, "turn", f"Runde {round_number} — {cname} ist am Zug", icon="clock")
    _safe_create_task(_snapshot_session_state(session_code), name=f"snapshot_combat_turn_{session_code}")


async def _handle_probe_request(session_code: str, user_id: str, payload: dict, state: dict):
    """GM requests a probe (skill/attribute check) from a specific player."""
    target_user = payload.get("target_user")
    probe_type = payload.get("probe_type")  # "1w20" | "3w20"
    skill = payload.get("skill")
    difficulty = payload.get("difficulty", 0)
    reason = payload.get("reason", "")

    request_payload = {
        "probe_type": probe_type,
        "skill": skill,
        "difficulty": difficulty,
        "reason": reason,
        "requested_by": user_id,
    }

    # Send the request to the target player
    if target_user:
        await manager.send_to_user(target_user, _msg(EventType.DICE_REQUEST, request_payload, from_user=user_id))
    # Also inform the GM (confirmation)
    await manager.send_to_user(user_id, _msg(EventType.PROBE_REQUEST, {
        **request_payload, "target_user": target_user, "status": "sent",
    }, from_user=user_id))


async def _handle_group_probe_request(session_code: str, user_id: str, payload: dict, state: dict):
    """GM requests a probe from all players simultaneously."""
    probe_type = payload.get("probe_type")
    skill = payload.get("skill")
    difficulty = payload.get("difficulty", 0)
    reason = payload.get("reason", "")

    request_payload = {
        "probe_type": probe_type,
        "skill": skill,
        "difficulty": difficulty,
        "reason": reason,
        "requested_by": user_id,
        "group": True,
    }

    msg = _msg(EventType.DICE_REQUEST, request_payload, from_user=user_id, target="players")
    await manager.broadcast_to_room(session_code, msg, target="players")
    # Confirm to GM
    await manager.send_to_user(user_id, _msg(EventType.GROUP_PROBE_REQUEST, {
        **request_payload, "status": "sent",
    }, from_user=user_id))


async def _handle_whisper(session_code: str, user_id: str, payload: dict, state: dict):
    """GM sends a private whisper to a player."""
    target_user = payload.get("target_user")
    text = payload.get("text", "")
    if not target_user:
        await manager.send_to_user(user_id, _error("Whisper requires target_user"))
        return

    whisper = _msg(EventType.WHISPER, {"text": text, "from_name": "Spielleiter"}, from_user=user_id)
    await manager.send_to_user(target_user, whisper)
    # Echo to GM so they see it in their log
    await manager.send_to_user(user_id, _msg(EventType.WHISPER, {
        "text": text, "target_user": target_user, "echo": True,
    }, from_user=user_id))


async def _handle_halt(session_code: str, user_id: str, payload: dict, state: dict):
    """Halt the session — blocks all player actions."""
    manager.set_halt(session_code, True)
    state["halted"] = True
    msg = _msg(EventType.HALT, {"reason": payload.get("reason", "")}, from_user=user_id)
    await manager.broadcast_to_room(session_code, msg)
    logger.info("Session %s halted", session_code)


async def _handle_halt_release(session_code: str, user_id: str, payload: dict, state: dict):
    """Release the halt — players may act again."""
    manager.set_halt(session_code, False)
    state["halted"] = False
    msg = _msg(EventType.HALT_RELEASE, {}, from_user=user_id)
    await manager.broadcast_to_room(session_code, msg)
    logger.info("Session %s halt released", session_code)


async def _handle_token_spawn(session_code: str, user_id: str, payload: dict, state: dict):
    """Spawn a new token on the active map."""
    token = {
        "token_id": payload.get("token_id"),
        "entity_type": payload.get("entity_type", "creature"),
        "entity_id": payload.get("entity_id"),
        "name": payload.get("name", "Unknown"),
        "position_x": payload.get("position_x", 0),
        "position_y": payload.get("position_y", 0),
        "token_size": payload.get("token_size", 1),
        "visible_to_players": payload.get("visible_to_players", True),
        "icon_id": payload.get("icon_id"),
        "conditions": payload.get("conditions", []),
        "current_lep": payload.get("current_lep"),
        "max_lep": payload.get("max_lep"),
    }
    state["tokens"].append(token)

    # Everyone sees visible tokens; GM-only tokens go to gm_table
    if token["visible_to_players"]:
        msg = _msg(EventType.TOKEN_SPAWN, token, from_user=user_id)
        await manager.broadcast_to_room(session_code, msg)
    else:
        msg = _msg(EventType.TOKEN_SPAWN, token, from_user=user_id)
        await manager.broadcast_to_room(session_code, msg, target="gm_table")


async def _handle_token_remove(session_code: str, user_id: str, payload: dict, state: dict):
    """Remove a token from the active map."""
    token_id = payload.get("token_id")
    state["tokens"] = [t for t in state["tokens"] if t.get("token_id") != token_id]
    msg = _msg(EventType.TOKEN_REMOVE, {"token_id": token_id}, from_user=user_id)
    await manager.broadcast_to_room(session_code, msg)


async def _handle_handout_push(session_code: str, user_id: str, payload: dict, state: dict):
    """Push a handout (image, text, note) to players or specific player."""
    target = payload.get("target", "all")
    msg = _msg(EventType.HANDOUT_PUSH, {
        "handout_id": payload.get("handout_id"),
        "title": payload.get("title", ""),
        "content_type": payload.get("content_type", "text"),
        "content": payload.get("content", ""),
        "image_url": payload.get("image_url"),
    }, from_user=user_id)
    await manager.broadcast_to_room(session_code, msg, target=target)


async def _handle_time_advance(session_code: str, user_id: str, payload: dict, state: dict):
    """Advance the in-game clock."""
    state["in_game_time"] = payload.get("new_time")
    msg = _msg(EventType.TIME_ADVANCE, {
        "new_time": state["in_game_time"],
        "advanced_by": payload.get("advanced_by", ""),
    }, from_user=user_id)
    await manager.broadcast_to_room(session_code, msg)


async def _handle_weather_change(session_code: str, user_id: str, payload: dict, state: dict):
    """Change the current weather."""
    state["weather"] = payload.get("weather")
    msg = _msg(EventType.WEATHER_CHANGE, {"weather": state["weather"]}, from_user=user_id)
    await manager.broadcast_to_room(session_code, msg)



async def _handle_attention(session_code: str, user_id: str, payload: dict, state: dict):
    """Enter attention mode — all players should look at the GM screen."""
    manager.set_attention(session_code, True)
    state["attention"] = True
    msg = _msg(EventType.ATTENTION, {"reason": payload.get("reason", "")}, from_user=user_id)
    await manager.broadcast_to_room(session_code, msg)


async def _handle_attention_release(session_code: str, user_id: str, payload: dict, state: dict):
    """Release attention mode."""
    manager.set_attention(session_code, False)
    state["attention"] = False
    msg = _msg(EventType.ATTENTION_RELEASE, {}, from_user=user_id)
    await manager.broadcast_to_room(session_code, msg)


async def _handle_ap_award(session_code: str, user_id: str, payload: dict, state: dict):
    """Award adventure points to one or more characters."""
    awards = payload.get("awards", [])
    # awards: [{character_id, amount, reason}, ...]
    msg = _msg(EventType.AP_AWARD, {"awards": awards}, from_user=user_id)
    # Notify each player individually about their award
    for award in awards:
        target_user = award.get("user_id")
        if target_user:
            await manager.send_to_user(target_user, _msg(EventType.AP_AWARD, {
                "character_id": award.get("character_id"),
                "amount": award.get("amount", 0),
                "reason": award.get("reason", ""),
            }, from_user=user_id))
    # Also broadcast summary to everyone
    await manager.broadcast_to_room(session_code, msg)


async def _handle_quest_update(session_code: str, user_id: str, payload: dict, state: dict):
    """Add, update, or complete a quest."""
    action = payload.get("action", "add")  # "add" | "update" | "complete" | "remove"
    quest = payload.get("quest", {})
    quest_id = quest.get("quest_id")

    if action == "add":
        state["quests"].append(quest)
    elif action == "update":
        state["quests"] = [q if q.get("quest_id") != quest_id else {**q, **quest}
                           for q in state["quests"]]
    elif action == "complete":
        for q in state["quests"]:
            if q.get("quest_id") == quest_id:
                q["status"] = "completed"
    elif action == "remove":
        state["quests"] = [q for q in state["quests"] if q.get("quest_id") != quest_id]

    msg = _msg(EventType.QUEST_UPDATE, {"action": action, "quest": quest}, from_user=user_id)
    await manager.broadcast_to_room(session_code, msg)


async def _handle_lore_reveal(session_code: str, user_id: str, payload: dict, state: dict):
    """Reveal a lore/knowledge entry to the players."""
    entry = {
        "lore_id": payload.get("lore_id"),
        "title": payload.get("title", ""),
        "text": payload.get("text", ""),
        "category": payload.get("category", "general"),
        "image_url": payload.get("image_url"),
    }
    state["lore_entries"].append(entry)
    target = payload.get("target", "all")
    msg = _msg(EventType.LORE_REVEAL, entry, from_user=user_id)
    await manager.broadcast_to_room(session_code, msg, target=target)




# ===================================================================
# Session control handlers (GM only)
# ===================================================================

async def _handle_session_start(session_code: str, user_id: str, payload: dict, state: dict):
    """Transition the session from lobby to active."""
    state["status"] = "active"
    state["connected_users"] = manager.get_connected_users(session_code)
    msg = _msg(EventType.SESSION_START, {
        "session_code": session_code,
        "connected_users": state["connected_users"],
    }, from_user=user_id)
    await manager.broadcast_to_room(session_code, msg)
    logger.info("Session %s started", session_code)


async def _handle_session_pause(session_code: str, user_id: str, payload: dict, state: dict):
    """Pause the session."""
    state["status"] = "paused"
    msg = _msg(EventType.SESSION_PAUSE, {"reason": payload.get("reason", "")}, from_user=user_id)
    await manager.broadcast_to_room(session_code, msg)
    logger.info("Session %s paused", session_code)


async def _handle_session_end(session_code: str, user_id: str, payload: dict, state: dict):
    """End the session."""
    state["status"] = "ended"
    summary = payload.get("summary", "")
    ap_awards = payload.get("ap_awards", [])
    msg = _msg(EventType.SESSION_END, {
        "summary": summary,
        "ap_awards": ap_awards,
    }, from_user=user_id)
    await manager.broadcast_to_room(session_code, msg)
    # Clean up in-memory state after a short delay to allow clients to process
    _session_state.pop(session_code, None)
    # Delete the persisted snapshot — session is over, no need to restore
    _safe_create_task(_delete_session_snapshot(session_code), name=f"snapshot_delete_{session_code}")
    logger.info("Session %s ended", session_code)


# ===================================================================
# Player action handlers
# ===================================================================

async def _handle_action_declare(session_code: str, user_id: str, payload: dict, state: dict):
    """Player declares an action (attack, skill use, free action, etc.)."""
    combat = _combat_snapshot(state)
    if combat and not _is_current_turn(state, user_id):
        await manager.send_to_user(user_id, _error("It is not your turn"))
        return

    # Forward the full payload so GM gets target_name, maneuver, etc.
    declaration = {**payload, "user_id": user_id}

    # Broadcast to everyone (action declarations are public in DSA5)
    msg = _msg(EventType.ACTION_DECLARE, declaration, from_user=user_id)
    await manager.broadcast_to_room(session_code, msg)


async def _handle_dice_result(session_code: str, user_id: str, payload: dict, state: dict):
    """Player submits dice roll results (for a probe or attack)."""
    # Clear pending requests so probe doesn't reappear on reconnect/refresh
    pending = state.get("pending_requests", {})
    to_remove = [k for k in pending if k.startswith(f"dice_{user_id}") or k.startswith(f"probe_{user_id}")]
    for k in to_remove:
        del pending[k]

    # Forward the full payload to GM — don't strip fields
    result = {**payload, "user_id": user_id}
    # Send full result to GM
    await manager.broadcast_to_room(session_code, _msg(
        EventType.DICE_RESULT, result, from_user=user_id,
    ), target="gm")
    # Send to table view
    await manager.broadcast_to_room(session_code, _msg(
        EventType.DICE_RESULT, result, from_user=user_id,
    ), target="table")
    # Broadcast a summarised probe result to all players (only for talent probes)
    if result.get("request_type") == "talent_probe" or result.get("skill"):
        probe_result = _msg(EventType.PROBE_RESULT, {
            "user_id": user_id,
            "skill": result.get("skill") or result.get("talent_name", ""),
            "success": result.get("result", {}).get("success") if isinstance(result.get("result"), dict) else result.get("success"),
            "qs": result.get("result", {}).get("qs") if isinstance(result.get("result"), dict) else result.get("qs"),
            "critical": result.get("critical", False),
            "patzer": result.get("patzer", False),
            "character_name": result.get("character_name", ""),
        }, from_user=user_id)
        await manager.broadcast_to_room(session_code, probe_result, target="players")

    # Log dice result to session log
    rtype = result.get("request_type", "dice")
    char_name = result.get("character_name", "Spieler")
    value = result.get("value", "?")
    if rtype == "talent_probe":
        skill = result.get("skill") or result.get("talent_name", "Probe")
        success = result.get("result", {}).get("success") if isinstance(result.get("result"), dict) else result.get("success")
        await _append_session_log(session_code, "dice", f"{char_name} wuerfelt {skill}: {value} {'Erfolg' if success else 'Misserfolg'}", icon="dice")
    elif rtype in ("attack", "initiative"):
        await _append_session_log(session_code, "dice", f"{char_name} wuerfelt {rtype}: {value}", icon="dice")

    # If in combat, log the entry
    combat = _combat_snapshot(state)
    if combat is not None:
        combat.setdefault("log", []).append({
            "type": "dice_result",
            "user_id": user_id,
            "data": result,
            "timestamp": _ts(),
        })


async def _handle_defense_choice(session_code: str, user_id: str, payload: dict, state: dict):
    """Player chooses a defense action (parade, ausweichen, or no defense)."""
    combat = _combat_snapshot(state)
    if combat is None:
        await manager.send_to_user(user_id, _error("No active combat"))
        return

    defense = {
        "user_id": user_id,
        "defense_type": payload.get("defense_type"),  # "parade" | "ausweichen" | "none"
        "roll": payload.get("roll"),
        "result": payload.get("result", {}),
    }
    # Send to GM
    await manager.broadcast_to_room(session_code, _msg(
        EventType.DEFENSE_CHOICE, defense, from_user=user_id,
    ), target="gm")
    # Broadcast result to all
    await manager.broadcast_to_room(session_code, _msg(
        EventType.COMBAT_LOG_ENTRY, {
            "entry_type": "defense",
            "user_id": user_id,
            "defense_type": defense["defense_type"],
            "success": defense["result"].get("success"),
            "critical": defense["result"].get("critical", False),
            "patzer": defense["result"].get("patzer", False),
        }, from_user=user_id,
    ))
    combat.setdefault("log", []).append({
        "type": "defense",
        "user_id": user_id,
        "data": defense,
        "timestamp": _ts(),
    })


async def _handle_item_use(session_code: str, user_id: str, payload: dict, state: dict):
    """Player uses an item from their inventory."""
    item_data = {
        "user_id": user_id,
        "item_id": payload.get("item_id"),
        "item_name": payload.get("item_name", ""),
        "target": payload.get("target"),
        "effect": payload.get("effect", {}),
    }
    # Notify GM for validation/resolution
    await manager.broadcast_to_room(session_code, _msg(
        EventType.ITEM_USE, item_data, from_user=user_id,
    ), target="gm")
    # Broadcast to all (visible action)
    await manager.broadcast_to_room(session_code, _msg(
        EventType.COMBAT_LOG_ENTRY, {
            "entry_type": "item_use",
            "user_id": user_id,
            "item_name": item_data["item_name"],
        }, from_user=user_id,
    ))


async def _handle_item_transfer(session_code: str, user_id: str, payload: dict, state: dict):
    """Player transfers an item to another player or the group inventory."""
    transfer = {
        "from_user": user_id,
        "to_user": payload.get("to_user"),          # None = group inventory
        "item_id": payload.get("item_id"),
        "item_name": payload.get("item_name", ""),
        "quantity": payload.get("quantity", 1),
    }
    # Notify GM
    await manager.broadcast_to_room(session_code, _msg(
        EventType.ITEM_TRANSFER, transfer, from_user=user_id,
    ), target="gm")
    # Notify recipient
    to_user = transfer["to_user"]
    if to_user:
        await manager.send_to_user(to_user, _msg(
            EventType.INVENTORY_CHANGE, {
                "action": "received",
                "from_user": user_id,
                "item_name": transfer["item_name"],
                "quantity": transfer["quantity"],
            }, from_user=user_id,
        ))
    # Notify sender of confirmation
    await manager.send_to_user(user_id, _msg(
        EventType.INVENTORY_CHANGE, {
            "action": "transferred",
            "to_user": to_user,
            "item_name": transfer["item_name"],
            "quantity": transfer["quantity"],
        }, from_user=user_id,
    ))


async def _handle_spell_cast(session_code: str, user_id: str, payload: dict, state: dict):
    """Player casts a spell (Zauber)."""
    combat = _combat_snapshot(state)
    if combat and not _is_current_turn(state, user_id):
        await manager.send_to_user(user_id, _error("It is not your turn"))
        return

    spell_data = {
        "user_id": user_id,
        "spell_id": payload.get("spell_id"),
        "spell_name": payload.get("spell_name", ""),
        "target": payload.get("target"),
        "asp_cost": payload.get("asp_cost", 0),
        "modification": payload.get("modification", {}),
        "rolls": payload.get("rolls", []),
        "result": payload.get("result", {}),
    }
    # Notify GM with full details
    await manager.broadcast_to_room(session_code, _msg(
        EventType.SPELL_CAST, spell_data, from_user=user_id,
    ), target="gm")
    # Broadcast to everyone (spells are visible)
    await manager.broadcast_to_room(session_code, _msg(
        EventType.COMBAT_LOG_ENTRY, {
            "entry_type": "spell_cast",
            "user_id": user_id,
            "spell_name": spell_data["spell_name"],
            "success": spell_data["result"].get("success"),
            "qs": spell_data["result"].get("qs"),
        }, from_user=user_id,
    ))

    if combat is not None:
        combat.setdefault("log", []).append({
            "type": "spell_cast",
            "user_id": user_id,
            "data": spell_data,
            "timestamp": _ts(),
        })


async def _handle_token_move(session_code: str, user_id: str, payload: dict, state: dict):
    """Player moves their own token (validated against ownership)."""
    token_id = payload.get("token_id")
    target_x = payload.get("target_x")
    target_y = payload.get("target_y")
    path = payload.get("path", [])

    # Verify the player owns this token
    token_found = False
    for token in state.get("tokens", []):
        if token.get("token_id") == token_id:
            # Only allow move if the token belongs to this player
            if token.get("entity_type") == "player" and str(token.get("entity_id")) == user_id:
                token["position_x"] = target_x
                token["position_y"] = target_y
                token_found = True
            else:
                await manager.send_to_user(user_id, _error("You do not control this token"))
                return
            break

    if not token_found:
        await manager.send_to_user(user_id, _error("Token not found"))
        return

    msg = _msg(EventType.TOKEN_MOVE, {
        "token_id": token_id,
        "user_id": user_id,
        "target_x": target_x,
        "target_y": target_y,
        "path": path,
    }, from_user=user_id)
    await manager.broadcast_to_room(session_code, msg)


# ===================================================================
# Trade handlers
# ===================================================================

async def _handle_trade_message(session_code: str, user_id: str, event_type: str, payload: dict, state: dict):
    """Route trade/transfer messages.

    Transfer flow (one-way give):
    1. Player A sends transfer_request → GM gets approval prompt
    2. GM sends transfer_approved → backend executes, both players get inventory_update
    3. GM sends transfer_rejected → Player A notified

    Trade flow (two-way exchange):
    1. Player A sends trade_propose → Player B receives offer
    2. Player B sends trade_counter → Player A sees counter-offer
    3. Player A sends trade_accept → GM gets approval prompt with full deal
    4. GM sends trade_approved → backend executes, both players get inventory_update
    5. At any point, either party can trade_decline or trade_cancel
    """
    et = event_type.value if hasattr(event_type, "value") else str(event_type)
    gm_id = manager.get_gm_id(session_code)

    # ── Transfer: Player → GM for approval ──
    if et == "transfer_request":
        payload["from_user"] = user_id
        msg = _msg("transfer_request", payload, from_user=user_id, target="gm")
        if gm_id:
            await manager.send_to_user(gm_id, msg)
        logger.info("Transfer request: %s in %s", user_id, session_code)

    # ── Transfer approved: GM executes exchange ──
    elif et == "transfer_approved":
        if not _is_gm(session_code, user_id):
            await manager.send_to_user(user_id, _error("Only GM may approve transfers"))
            return
        await _execute_exchange(session_code, user_id, payload, state)

    elif et == "transfer_rejected":
        if not _is_gm(session_code, user_id):
            return
        target_user = payload.get("from_user") or payload.get("proposer_user_id")
        if target_user:
            await manager.send_to_user(target_user, _msg("transfer_rejected", payload, from_user=user_id))
        logger.info("Transfer rejected by GM in %s", session_code)

    # ── Trade propose: Player A → Player B ──
    elif et == "trade_propose":
        target_user = payload.get("target_id")
        if not target_user:
            await manager.send_to_user(user_id, _error("trade_propose requires target_id"))
            return
        payload["from_user"] = user_id
        msg = {"type": et, "from_user": user_id, "payload": payload, "timestamp": _ts()}
        await manager.send_to_user(target_user, msg)
        logger.info("Trade proposed: %s → %s in %s", user_id, target_user, session_code)

    # ── Trade counter: Player B proposes what they give in return ──
    elif et == "trade_counter":
        target_user = payload.get("proposer_user_id") or payload.get("proposer_id")
        if not target_user:
            await manager.send_to_user(user_id, _error("trade_counter requires proposer_user_id"))
            return
        payload["from_user"] = user_id
        msg = {"type": et, "from_user": user_id, "payload": payload, "timestamp": _ts()}
        await manager.send_to_user(target_user, msg)
        logger.info("Trade counter: %s → %s in %s", user_id, target_user, session_code)

    # ── Trade accept: Both agreed → send to GM for approval ──
    elif et == "trade_accept":
        # Notify the other party
        target_user = payload.get("proposer_user_id") or payload.get("proposer_id") or payload.get("target_id")
        if target_user:
            payload["from_user"] = user_id
            await manager.send_to_user(target_user, {"type": et, "from_user": user_id, "payload": payload, "timestamp": _ts()})
        # Forward the full deal to GM for approval
        if gm_id and gm_id != user_id:
            gm_msg = _msg("trade_gm_request", payload, from_user=user_id, target="gm")
            await manager.send_to_user(gm_id, gm_msg)
        logger.info("Trade accepted, forwarded to GM: %s in %s", user_id, session_code)

    # ── Trade approved by GM → execute ──
    elif et == "trade_approved":
        if not _is_gm(session_code, user_id):
            await manager.send_to_user(user_id, _error("Only GM may approve trades"))
            return
        await _execute_exchange(session_code, user_id, payload, state)

    elif et == "trade_rejected":
        if not _is_gm(session_code, user_id):
            return
        # Notify both parties
        for uid_key in ("proposer_user_id", "target_user_id", "from_user"):
            uid = payload.get(uid_key)
            if uid and uid != user_id:
                await manager.send_to_user(uid, _msg("trade_rejected", payload, from_user=user_id))
        logger.info("Trade rejected by GM in %s", session_code)

    elif et in ("trade_decline", "trade_cancel"):
        target_user = payload.get("proposer_id") or payload.get("proposer_user_id") or payload.get("target_id")
        if target_user:
            payload["from_user"] = user_id
            msg = {"type": et, "from_user": user_id, "payload": payload, "timestamp": _ts()}
            await manager.send_to_user(target_user, msg)
        logger.info("Trade %s: %s in %s", et, user_id, session_code)

    else:
        logger.warning("Unknown trade event: %s from %s", et, user_id)


async def _execute_exchange(session_code: str, gm_user_id: str, payload: dict, state: dict):
    """Execute an inventory exchange via the REST API and broadcast results."""
    try:
        from database import async_session
        from sqlalchemy import select
        from models.character import Character

        from_char_id = payload.get("from_character_id")
        to_char_id = payload.get("to_character_id")

        if not from_char_id or not to_char_id:
            await manager.send_to_user(gm_user_id, _error("Exchange requires from_character_id and to_character_id"))
            return

        from_items = payload.get("from_items", [])
        from_money = payload.get("from_money")
        to_items = payload.get("to_items", [])
        to_money = payload.get("to_money")

        async with async_session() as db:
            from_result = await db.execute(select(Character).where(Character.id == from_char_id))
            from_char = from_result.scalar_one_or_none()
            to_result = await db.execute(select(Character).where(Character.id == to_char_id))
            to_char = to_result.scalar_one_or_none()

            if not from_char or not to_char:
                await manager.send_to_user(gm_user_id, _error("Character not found"))
                return

            from_inv = _normalize_inv(from_char.basis_inventory)
            to_inv = _normalize_inv(to_char.basis_inventory)

            # A gives to B
            from_inv = _inv_remove(from_inv, from_items, from_money)
            to_inv = _inv_add(to_inv, from_items, from_money)

            # B gives to A (trade)
            if to_items or to_money:
                to_inv = _inv_remove(to_inv, to_items, to_money)
                from_inv = _inv_add(from_inv, to_items, to_money)

            from_char.basis_inventory = from_inv
            to_char.basis_inventory = to_inv
            await db.commit()

        # Broadcast inventory updates to both players
        from_user_id = payload.get("from_user_id") or payload.get("proposer_user_id")
        to_user_id = payload.get("to_user_id") or payload.get("target_user_id")

        exchange_type = "trade" if (to_items or to_money) else "transfer"
        summary = payload.get("summary", "")

        if from_user_id:
            await manager.send_to_user(from_user_id, _msg("inventory_update", {
                "character_id": from_char_id,
                "inventory": from_inv,
                "reason": f"{exchange_type}_completed",
                "summary": summary,
            }, from_user=gm_user_id))

        if to_user_id:
            await manager.send_to_user(to_user_id, _msg("inventory_update", {
                "character_id": to_char_id,
                "inventory": to_inv,
                "reason": f"{exchange_type}_completed",
                "summary": summary,
            }, from_user=gm_user_id))

        # Confirm to GM
        await manager.send_to_user(gm_user_id, _msg("inventory_update", {
            "character_id": from_char_id,
            "from_inventory": from_inv,
            "to_character_id": to_char_id,
            "to_inventory": to_inv,
            "reason": f"{exchange_type}_completed",
        }, from_user=gm_user_id))

        await _append_session_log(session_code, "trade", summary or f"Tausch: {from_char_id} und {to_char_id}", icon="repeat")
        logger.info("Exchange executed: %s ↔ %s in %s", from_char_id, to_char_id, session_code)

    except Exception as e:
        logger.error("Failed to execute exchange: %s", e)
        await manager.send_to_user(gm_user_id, _error(f"Exchange failed: {str(e)}"))


def _normalize_inv(raw) -> dict:
    """Normalize basis_inventory to {items: [...], purse: {...}} format."""
    if raw is None:
        return {"items": [], "purse": {}}
    if isinstance(raw, list):
        return {"items": list(raw), "purse": {}}
    inv = dict(raw)
    if "items" not in inv:
        inv["items"] = []
    if "purse" not in inv:
        inv["purse"] = {}
    return inv


def _inv_remove(inv, items: list, money) -> dict:
    """Remove items/money from a basis_inventory dict."""
    inv = _normalize_inv(inv)
    item_list = list(inv["items"])
    for req in items:
        name = req.get("name", "")
        qty = req.get("quantity", 1)
        for idx, it in enumerate(item_list):
            if it.get("name") == name:
                current_qty = it.get("quantity", 1)
                if current_qty <= qty:
                    item_list.pop(idx)
                else:
                    item_list[idx] = {**it, "quantity": current_qty - qty}
                break
    if money:
        purse = dict(inv.get("purse", {}))
        for d in ("dukaten", "silber", "heller", "kreuzer"):
            purse[d] = purse.get(d, 0) - (money.get(d, 0) if isinstance(money, dict) else getattr(money, d, 0))
        inv["purse"] = purse
    inv["items"] = item_list
    return inv


def _inv_add(inv, items: list, money) -> dict:
    """Add items/money to a basis_inventory dict."""
    inv = _normalize_inv(inv)
    item_list = list(inv["items"])
    for req in items:
        name = req.get("name", "")
        qty = req.get("quantity", 1)
        found = False
        for idx, it in enumerate(item_list):
            if it.get("name") == name:
                item_list[idx] = {**it, "quantity": it.get("quantity", 1) + qty}
                found = True
                break
        if not found:
            item_list.append({"name": name, "quantity": qty, "equipped": False})
    if money:
        purse = dict(inv.get("purse", {}))
        for d in ("dukaten", "silber", "heller", "kreuzer"):
            purse[d] = purse.get(d, 0) + (money.get(d, 0) if isinstance(money, dict) else getattr(money, d, 0))
        inv["purse"] = purse
    inv["items"] = item_list
    return inv


# ===================================================================
# Connection lifecycle handlers
# ===================================================================

async def handle_connect(session_code: str, user_id: str, role: str, is_table_view: bool = False):
    """Called after a WebSocket is accepted — notify the room and send full sync."""
    # If this session has no in-memory state, try to restore from a DB snapshot
    # (e.g. after a server restart while a session was active).
    if session_code not in _session_state:
        await _restore_state_from_snapshot(session_code)
    state = _ensure_state(session_code)
    state["connected_users"] = manager.get_connected_users(session_code)

    msg = _msg(EventType.PLAYER_CONNECTED, {
        "user_id": user_id,
        "role": role,
        "connected_users": state["connected_users"],
    })
    await manager.broadcast_to_room(session_code, msg, exclude=user_id)

    # Send full sync to the connecting client so they have current state
    sync = get_full_sync(session_code)
    await manager.send_to_user(user_id, sync)
    # Flush any messages that were queued while this user was disconnected
    await manager.flush_dead_letters(user_id)
    # Store connect event in session_log (no broadcast — player_connected message handles UI)
    if role == "player":
        # Try to get player name for a meaningful log entry
        name = "Spieler"
        try:
            from database import async_session as _as
            from sqlalchemy import select as _sel
            from models.user import User as _User
            async with _as() as _db:
                _r = await _db.execute(_sel(_User).where(_User.id == user_id))
                _u = _r.scalar_one_or_none()
                if _u:
                    name = _u.username
        except Exception as e:
            logger.warning("Failed to load user: %s", e)
        log = state["session_log"]
        log.append({"type": "connect", "text": f"{name} verbunden", "icon": "user", "ts": _ts()})
        if len(log) > 500:
            state["session_log"] = log[-500:]
    logger.info("User %s connected to session %s as %s — sync sent", user_id, session_code, role)


async def handle_disconnect(session_code: str, user_id: str):
    """Called when a WebSocket drops — notify survivors."""
    state = _ensure_state(session_code)
    state["connected_users"] = manager.get_connected_users(session_code)

    msg = _msg(EventType.PLAYER_DISCONNECTED, {
        "user_id": user_id,
        "connected_users": state["connected_users"],
    })
    await manager.broadcast_to_room(session_code, msg)
    logger.info("User %s disconnected from session %s", user_id, session_code)


async def handle_reconnect(session_code: str, user_id: str):
    """Called when a previously-connected user reconnects.

    Sends a SYNC_FULL to the reconnecting client so they catch up.
    """
    # Restore from snapshot if in-memory state was lost (e.g. server restart)
    if session_code not in _session_state:
        await _restore_state_from_snapshot(session_code)
    state = _ensure_state(session_code)
    state["connected_users"] = manager.get_connected_users(session_code)

    # Notify others
    msg = _msg(EventType.PLAYER_RECONNECTED, {
        "user_id": user_id,
        "connected_users": state["connected_users"],
    })
    await manager.broadcast_to_room(session_code, msg, exclude=user_id)

    # Send full sync to the reconnecting client
    sync = get_full_sync(session_code)
    await manager.send_to_user(user_id, sync)
    logger.info("User %s reconnected to session %s — full sync sent", user_id, session_code)


# ===================================================================
# Full sync
# ===================================================================

def get_full_sync(session_code: str) -> dict:
    """Build a SYNC_FULL message containing the complete live state.

    This is sent to reconnecting clients so they can restore their UI
    without having missed any events while disconnected.
    """
    state = _ensure_state(session_code)

    # Strip the combat log from the sync payload to keep it lean
    combat_snapshot = None
    combat = _combat_snapshot(state)
    if combat is not None:
        combat_snapshot = {k: v for k, v in combat.items() if k != "log"}

    return _msg(EventType.SYNC_FULL, {
        "status": state["status"],
        "active_scene": state["active_scene"],
        "combat": combat_snapshot,
        "tokens": state["tokens"],
        "in_game_time": state["in_game_time"],
        "weather": state["weather"],
        "halted": state["halted"],
        "attention": state["attention"],
        "connected_users": state["connected_users"],
        "quests": state["quests"],
        "lore_entries": state["lore_entries"],
        "vitals": state.get("vitals", {}),
        "conditions": state.get("conditions", {}),
        "buffs": state.get("buffs", {}),
        "session_log": state.get("session_log", [])[-200:],
        "pending_requests": state.get("pending_requests", {}),
        "state_version": state.get("state_version", 0),
    })
