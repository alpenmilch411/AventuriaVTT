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
import random
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
SNAPSHOT_DEBOUNCE = 2.0  # seconds


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
            "opposed_probes": {},      # probe_id -> {initiator, target, results, ...}
            "vitals": {},              # character_id -> {lep, asp, kap, schip}
            "conditions": {},          # character_id -> [{name, level}]
            "max_vitals": {},          # character_id -> {LeP_max, AsP_max, ...}
            "buffs": {},               # character_id -> [{...}]
            "shops": {},               # shop_id -> {name, items: [...], markup, owner_character_id}
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


def _sync_vitals_to_combat(state: dict, character_id: str, vitals: dict, token_id: str = None):
    """Propagate vitals changes into combat initiative_order and combatants dict.

    Without this, _handle_combat_next_turn would broadcast stale HP values
    from the original initiative_order, causing damage to appear "undone" on
    the next round.
    """
    combat = state.get("combat")
    if not combat:
        return
    vital_keys = ("lep", "asp", "kap", "schip")
    # Update initiative_order entries (match by characterId, character_id, id, or token_id)
    for c in combat.get("initiative_order", []):
        cid = c.get("characterId") or c.get("character_id") or c.get("id")
        match = (cid == character_id
                 or c.get("id") == character_id
                 or (token_id and c.get("id") == token_id))
        if match:
            for key in vital_keys:
                if key in vitals:
                    c[key] = vitals[key]
    # Also update the combatants dict if it exists
    combatants = combat.get("combatants", {})
    for lookup_id in (character_id, token_id):
        if lookup_id and lookup_id in combatants:
            for key in vital_keys:
                if key in vitals:
                    combatants[lookup_id][key] = vitals[key]


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
            # Clamp raw values to [0, max] as well
            max_key = {"lep": "LeP_max", "asp": "AsP_max", "kap": "KaP_max"}.get(key)
            max_val = max_vals.get(max_key) if max_key else None
            if max_val is not None:
                resolved[key] = max(0, min(max_val, value))
            else:
                resolved[key] = max(0, value) if isinstance(value, (int, float)) else value
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


async def _persist_buffs(character_id: str, buffs: list):
    """Persist active_buffs to Character.active_buffs in DB."""
    async with _get_char_lock(character_id):
        try:
            from database import async_session
            from sqlalchemy import select
            from models.character import Character

            async with async_session() as db:
                result = await db.execute(select(Character).where(Character.id == character_id))
                char = result.scalar_one_or_none()
                if char:
                    char.active_buffs = buffs
                    await db.commit()
                    logger.debug("Persisted buffs for %s: %d active", character_id, len(buffs))
        except Exception as e:
            logger.error("Failed to persist buffs for %s: %s", character_id, e)


async def _persist_ap_awards(session_code: str, awards: list):
    """Persist AP awards to the database — create APAward records and update Character totals.

    awards: [{character_id, amount, reason?}, ...]
    """
    try:
        from database import async_session
        from sqlalchemy import select
        from models.character import Character
        from models.session_state import GameSession, APAward

        async with async_session() as db:
            # Resolve session_id from session_code
            sess_result = await db.execute(
                select(GameSession).where(GameSession.session_code == session_code)
            )
            session_obj = sess_result.scalar_one_or_none()
            if not session_obj:
                logger.error("Cannot persist AP awards — session not found for code %s", session_code)
                return

            session_id = session_obj.id

            for award in awards:
                character_id = award.get("character_id")
                amount = award.get("amount", 0)
                reason = award.get("reason", "")
                if not character_id or amount <= 0:
                    continue

                async with _get_char_lock(character_id):
                    result = await db.execute(
                        select(Character).where(Character.id == character_id)
                    )
                    char = result.scalar_one_or_none()
                    if not char:
                        logger.warning("AP award skipped — character %s not found", character_id)
                        continue

                    # Create APAward record
                    db.add(APAward(
                        session_id=session_id,
                        character_id=character_id,
                        amount=amount,
                        reason=reason,
                    ))

                    # Update character AP totals
                    char.total_ap = (char.total_ap or 0) + amount
                    char.available_ap = (char.available_ap or 0) + amount

                    logger.info(
                        "AP award: +%d AP to character %s (total=%d, available=%d)",
                        amount, character_id, char.total_ap, char.available_ap,
                    )

            await db.commit()
            logger.info("Persisted %d AP awards for session %s", len(awards), session_code)
    except Exception as e:
        logger.error("Failed to persist AP awards for session %s: %s", session_code, e)


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
                        tid = dist.get("template_id")
                        qty = dist.get("quantity", 1)
                        # Match by template_id first, fall back to name
                        existing = None
                        if tid:
                            existing_result = await db.execute(
                                select(InventoryItem).where(
                                    InventoryItem.character_id == char_id,
                                    InventoryItem.item_template_id == tid,
                                )
                            )
                            existing = existing_result.scalar_one_or_none()
                        if not existing:
                            existing_result = await db.execute(
                                select(InventoryItem).where(
                                    InventoryItem.character_id == char_id,
                                    InventoryItem.name == item_name,
                                )
                            )
                            existing = existing_result.scalar_one_or_none()
                        if existing:
                            existing.quantity += qty
                            # Backfill template_id on legacy items
                            if tid and not existing.item_template_id:
                                existing.item_template_id = tid
                            continue
                        item = InventoryItem(
                            id=str(uuid.uuid4()),
                            character_id=char_id,
                            name=item_name,
                            quantity=qty,
                            equipped=False,
                            item_template_id=tid,
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
    """Persist basis_inventory to Character in DB (backup for frontend REST PUT).

    Expects already-thinned inventory (template_id, quantity, equipped only).
    """
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


async def _broadcast_enriched_inventory(session_code: str, event_type: str, payload: dict, from_user: str):
    """Enrich inventory items with template data and broadcast to the room."""
    try:
        from database import async_session
        from utils.inventory_enrichment import enrich_basis_inventory

        enriched_payload = dict(payload)
        async with async_session() as db:
            enriched_payload["inventory"] = await enrich_basis_inventory(payload["inventory"], db)
        msg = _msg(event_type, enriched_payload, from_user=from_user)
        await manager.broadcast_to_room(session_code, msg)
    except Exception as e:
        logger.error("Failed to enrich inventory for broadcast: %s — sending raw", e)
        msg = _msg(event_type, payload, from_user=from_user)
        await manager.broadcast_to_room(session_code, msg)


def _get_character_name(session_code: str, character_id: str) -> str:
    """Return the character's name from combat state or a fallback."""
    state = _ensure_state(session_code)
    combat = state.get("combat")
    if combat:
        combatant = combat.get("combatants", {}).get(character_id)
        if combatant:
            return combatant.get("name", character_id[:8])
        # Also check initiative_order
        for c in combat.get("initiative_order", []):
            cid = c.get("id") or c.get("characterId") or c.get("character_id")
            if cid == character_id:
                return c.get("name", character_id[:8])
    return character_id[:8]


async def _increment_session_stat(session_code: str, character_id: str, user_id: str, stat_name: str, amount: int = 1):
    """Increment a counter on SessionStatistics for this session+character.

    Creates the record if it doesn't exist.  Runs under a character lock.
    """
    async with _get_char_lock(character_id):
        try:
            from database import async_session
            from sqlalchemy import select
            from models.session_state import GameSession, SessionStatistics

            async with async_session() as db:
                sess_result = await db.execute(
                    select(GameSession).where(GameSession.session_code == session_code)
                )
                session_obj = sess_result.scalar_one_or_none()
                if not session_obj:
                    logger.warning("Cannot increment stat — session not found for code %s", session_code)
                    return

                result = await db.execute(
                    select(SessionStatistics).where(
                        SessionStatistics.session_id == session_obj.id,
                        SessionStatistics.character_id == character_id,
                    )
                )
                stats = result.scalar_one_or_none()
                if stats:
                    current = getattr(stats, stat_name, 0) or 0
                    setattr(stats, stat_name, current + amount)
                else:
                    stats = SessionStatistics(
                        session_id=session_obj.id,
                        character_id=character_id,
                        user_id=user_id,
                    )
                    setattr(stats, stat_name, amount)
                    db.add(stats)
                await db.commit()
                logger.debug("Incremented %s by %d for character %s in session %s", stat_name, amount, character_id, session_code)
        except Exception as e:
            logger.error("Failed to increment stat %s for %s: %s", stat_name, character_id, e)


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
        logger.debug("WS message: %s from %s (gm=%s)", event_type, user_id[:8], _is_gm(session_code, user_id))

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
        EventType.OPPOSED_PROBE_REQUEST: _handle_opposed_probe_request,
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
        EventType.QUEST_UPDATE: _handle_quest_update,
        EventType.LORE_REVEAL: _handle_lore_reveal,
        EventType.REST_START: _handle_rest_start,
        EventType.REST_END: _handle_rest_end,
        EventType.SESSION_START: _handle_session_start,
        EventType.SESSION_PAUSE: _handle_session_pause,
        EventType.SESSION_END: _handle_session_end,
        EventType.CHARACTER_DEATH: _handle_character_death,
        EventType.SHOP_CREATE: _handle_shop_create,
        EventType.SHOP_UPDATE: _handle_shop_update,
        EventType.SHOP_CLOSE: _handle_shop_close,
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
        EventType.SHOP_BUY: _handle_shop_buy,
        EventType.SHOP_SELL: _handle_shop_sell,
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
    halt_gated_events = {"vitals_update", "conditions_update", "inventory_change", "combat_log_entry", "buff_apply", "buff_add", "buff_remove", "buff_edit", "buff_clear_expired", "schip_use"}
    if event_type in halt_gated_events and not _is_gm(session_code, user_id) and manager.is_halted(session_code):
        await manager.send_to_user(user_id, _error("Session is halted — please wait for the GM"))
        return

    # ---- SchiP usage (player or GM) ----
    if event_type == "schip_use":
        await _handle_schip_use(session_code, user_id, payload, state)
        return

    if event_type == "vitals_update" and not _is_gm(session_code, user_id) and payload.get("character_id"):
        cid = payload["character_id"]
        raw_vitals = payload.get("vitals", {})
        token_id = payload.get("token_id")
        async with _get_char_lock(cid):
            # Ensure max_vitals are cached for delta resolution
            await _cache_character_vitals(session_code, cid)
            # Resolve any deltas to absolute values
            resolved = _resolve_deltas(session_code, cid, raw_vitals)
            # Update in-memory state with absolute values
            existing = state.setdefault("vitals", {}).get(cid, {})
            state["vitals"][cid] = {**existing, **resolved}
            # Sync vitals into combat initiative_order so next_turn broadcasts current values
            _sync_vitals_to_combat(state, cid, resolved, token_id=token_id)
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

    # Inventory change — validate, persist thin, broadcast enriched
    if event_type == "inventory_change" and payload.get("character_id"):
        from utils.inventory_enrichment import validate_inventory_payload, thin_basis_inventory
        if payload.get("inventory"):
            is_valid, err = validate_inventory_payload(payload)
            if not is_valid:
                logger.warning("Invalid inventory_change from %s: %s", user_id, err)
                await manager.send_to_user(user_id, _error(f"Invalid inventory data: {err}"))
                return
            # Persist only thin fields
            thin_inv = thin_basis_inventory(payload["inventory"])
            _safe_create_task(
                _persist_inventory(payload["character_id"], thin_inv),
                name=f"persist_inventory_{payload['character_id'][:8]}",
            )
            # Enrich before broadcasting
            _safe_create_task(
                _broadcast_enriched_inventory(session_code, event_type, payload, user_id),
                name=f"enrich_broadcast_inv_{payload['character_id'][:8]}",
            )
        else:
            msg = _msg(event_type, payload, from_user=user_id)
            await manager.broadcast_to_room(session_code, msg)
        logger.debug("Player %s broadcast inventory_change for %s", user_id, payload["character_id"])
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

    # Request withdraw — player withdraws any pending request (action, probe, spell)
    if event_type == "request_withdraw":
        request_id = payload.get("request_id", "")
        character_name = payload.get("character_name", "Spieler")
        # Remove from pending requests
        pending = state.get("pending_requests", {})
        to_remove = [k for k, v in pending.items() if v.get("from_user") == user_id and (k == request_id or v.get("request_id") == request_id)]
        for k in to_remove:
            del pending[k]
        # Notify GM
        await manager.broadcast_to_room(session_code, _msg("request_withdrawn", {
            "request_id": request_id,
            "character_name": character_name,
            "from_user": user_id,
        }, from_user=user_id), target="gm")
        # Confirm back to player
        await manager.send_to_user(user_id, _msg("request_withdraw_confirmed", {
            "request_id": request_id,
        }))
        # Log to Protokoll
        await _append_session_log(session_code, "system", f"{character_name} zieht Anfrage zurück.", icon="x")
        logger.info("Player %s withdrew request %s in %s", user_id, request_id, session_code)
        return

    relay_to_gm = {
        "action_request", "probe_request_from_player", "spell_cast_request",
        "item_use", "item_equip", "item_drop", "item_transfer",
    }
    if event_type in relay_to_gm:
        payload["from_user"] = user_id
        # Store requests in pending_requests for reconnect persistence
        if payload.get("request_id"):
            state.setdefault("pending_requests", {})[payload["request_id"]] = {
                **payload, "from_user": user_id, "type": event_type, "timestamp": datetime.utcnow().isoformat(),
            }
        elif event_type == "probe_request_from_player":
            req_id = f"probe_{user_id}_{payload.get('talent_key', '')}"
            state.setdefault("pending_requests", {})[req_id] = {
                **payload, "from_user": user_id, "type": event_type, "timestamp": datetime.utcnow().isoformat(),
            }
        msg = _msg(event_type, payload, from_user=user_id, target="gm")
        await manager.broadcast_to_room(session_code, msg, target="gm")
        logger.debug("Relayed %s from %s to GM in %s", event_type, user_id, session_code)
        return

    # GM → targeted message (dice_request, defense_request, probe_consequence go to specific player)
    if event_type in ("dice_request", "defense_request", "probe_consequence"):
        is_gm = _is_gm(session_code, user_id)
        logger.debug("dice/defense_request from %s (is_gm=%s) in %s", user_id, is_gm, session_code)
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
            logger.debug("GM broadcast %s to all players in %s", event_type, session_code)
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
                token_id = payload.get("token_id")
                await _cache_character_vitals(session_code, cid)
                resolved = _resolve_deltas(session_code, cid, raw_vitals)
                existing = state.setdefault("vitals", {}).get(cid, {})
                state["vitals"][cid] = {**existing, **resolved}
                # Sync vitals into combat initiative_order so next_turn broadcasts current values
                _sync_vitals_to_combat(state, cid, resolved, token_id=token_id)
                _bump_version(state)
                _safe_create_task(_persist_vitals(cid, resolved), name=f"persist_vitals_{cid[:8]}")
                out_payload = {**payload, "vitals": resolved, "state_version": state["state_version"]}
                msg = _msg(event_type, out_payload, from_user=user_id)
                await manager.broadcast_to_room(session_code, msg)
        elif event_type == "state_update" and cid and payload.get("current_lep") is not None:
            async with _get_char_lock(cid):
                vitals_update = {"lep": payload["current_lep"]}
                token_id = payload.get("token_id")
                existing = state.setdefault("vitals", {}).get(cid, {})
                state["vitals"][cid] = {**existing, **vitals_update}
                # Sync vitals into combat initiative_order so next_turn broadcasts current values
                _sync_vitals_to_combat(state, cid, vitals_update, token_id=token_id)
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
        logger.debug("GM broadcast %s in %s", event_type, session_code)
        # Snapshot after state-mutating GM events
        if event_type in ("vitals_update", "conditions_update", "condition_change"):
            _safe_create_task(_snapshot_session_state(session_code), name=f"snapshot_gm_{event_type}_{session_code}")
        return

    # ---- Buff system (GM + players) ----
    if event_type in ("buff_apply", "buff_add"):
        cid = payload.get("character_id") or payload.get("characterId")
        if not cid:
            await manager.send_to_user(user_id, _error("buff_apply requires character_id"))
            return
        stat = payload.get("stat")
        value = payload.get("value", 0)
        source = payload.get("source", "Unbekannt")
        duration_minutes = payload.get("duration_minutes", 0)
        now_ms = int(time.time() * 1000)
        buff = {
            "id": str(uuid.uuid4()),
            "stat": stat,
            "value": value,
            "source": source,
            "applied_at": now_ms,
            "expires_at": now_ms + (duration_minutes * 60 * 1000) if duration_minutes else None,
            "duration_minutes": duration_minutes,
        }
        async with _get_char_lock(cid):
            char_buffs = state.setdefault("buffs", {}).setdefault(cid, [])
            # Opportunistically clean expired buffs
            char_buffs[:] = [b for b in char_buffs if not b.get("expires_at") or b["expires_at"] > now_ms]
            char_buffs.append(buff)
            _bump_version(state)
            _safe_create_task(_persist_buffs(cid, list(char_buffs)), name=f"persist_buffs_{cid[:8]}")
        msg = _msg("buff_applied", {"character_id": cid, "buff": buff, "state_version": state["state_version"]}, from_user=user_id)
        await manager.broadcast_to_room(session_code, msg)
        logger.info("Buff applied to %s by %s: %s %+d (%s, %dmin)", cid, user_id, stat, value, source, duration_minutes)
        _safe_create_task(_snapshot_session_state(session_code), name=f"snapshot_buff_apply_{session_code}")
        return

    if event_type == "buff_remove":
        cid = payload.get("character_id") or payload.get("characterId")
        buff_id = payload.get("buff_id") or payload.get("id")
        if not cid or not buff_id:
            await manager.send_to_user(user_id, _error("buff_remove requires character_id and buff_id"))
            return
        async with _get_char_lock(cid):
            char_buffs = state.setdefault("buffs", {}).setdefault(cid, [])
            state["buffs"][cid] = [b for b in char_buffs if b.get("id") != buff_id]
            _bump_version(state)
            _safe_create_task(_persist_buffs(cid, list(state["buffs"][cid])), name=f"persist_buffs_{cid[:8]}")
        msg = _msg("buff_removed", {"character_id": cid, "buff_id": buff_id, "state_version": state["state_version"]}, from_user=user_id)
        await manager.broadcast_to_room(session_code, msg)
        logger.info("Buff %s removed from %s by %s", buff_id, cid, user_id)
        _safe_create_task(_snapshot_session_state(session_code), name=f"snapshot_buff_remove_{session_code}")
        return

    if event_type == "buff_edit":
        if not _is_gm(session_code, user_id):
            await manager.send_to_user(user_id, _error("Only the GM may edit buffs"))
            return
        cid = payload.get("character_id") or payload.get("characterId")
        buff_id = payload.get("buff_id") or payload.get("id")
        updates = payload.get("updates", {})
        if not cid or not buff_id:
            await manager.send_to_user(user_id, _error("buff_edit requires character_id and buff_id"))
            return
        updated_buff = None
        async with _get_char_lock(cid):
            char_buffs = state.setdefault("buffs", {}).setdefault(cid, [])
            for buff in char_buffs:
                if buff.get("id") == buff_id:
                    if "value" in updates:
                        buff["value"] = updates["value"]
                    if "stat" in updates:
                        buff["stat"] = updates["stat"]
                    if "duration_minutes" in updates:
                        buff["duration_minutes"] = updates["duration_minutes"]
                        # Recalculate expires_at from original applied_at + new duration
                        if buff.get("applied_at") and updates["duration_minutes"]:
                            buff["expires_at"] = buff["applied_at"] + (updates["duration_minutes"] * 60 * 1000)
                        elif not updates["duration_minutes"]:
                            buff["expires_at"] = None
                    if "expires_at" in updates and "duration_minutes" not in updates:
                        buff["expires_at"] = updates["expires_at"]
                    updated_buff = dict(buff)
                    break
            if updated_buff:
                _bump_version(state)
                _safe_create_task(_persist_buffs(cid, list(char_buffs)), name=f"persist_buffs_{cid[:8]}")
        if updated_buff:
            msg = _msg("buff_edited", {"character_id": cid, "buff": updated_buff, "state_version": state["state_version"]}, from_user=user_id)
            await manager.broadcast_to_room(session_code, msg)
            logger.info("Buff %s edited on %s by %s: %s", buff_id, cid, user_id, updates)
            _safe_create_task(_snapshot_session_state(session_code), name=f"snapshot_buff_edit_{session_code}")
        else:
            await manager.send_to_user(user_id, _error(f"Buff {buff_id} not found on character {cid}"))
        return

    if event_type == "buff_clear_expired":
        cid = payload.get("character_id") or payload.get("characterId")
        if not cid:
            await manager.send_to_user(user_id, _error("buff_clear_expired requires character_id"))
            return
        now_ms = int(time.time() * 1000)
        async with _get_char_lock(cid):
            char_buffs = state.setdefault("buffs", {}).setdefault(cid, [])
            expired_ids = [b["id"] for b in char_buffs if b.get("expires_at") and b["expires_at"] <= now_ms]
            if expired_ids:
                state["buffs"][cid] = [b for b in char_buffs if b["id"] not in set(expired_ids)]
                _bump_version(state)
                _safe_create_task(_persist_buffs(cid, list(state["buffs"][cid])), name=f"persist_buffs_{cid[:8]}")
        if expired_ids:
            msg = _msg("buff_expired", {"character_id": cid, "expired_ids": expired_ids, "state_version": state["state_version"]}, from_user=user_id)
            await manager.broadcast_to_room(session_code, msg)
            logger.info("Cleared %d expired buffs from %s", len(expired_ids), cid)
            _safe_create_task(_snapshot_session_state(session_code), name=f"snapshot_buff_expire_{session_code}")
        return

    # GM → all broadcast (generic relay for any GM message not in the handler map)
    if _is_gm(session_code, user_id):
        msg = _msg(event_type, payload, from_user=user_id)
        await manager.broadcast_to_room(session_code, msg, exclude=user_id)
        logger.debug("GM broadcast %s in %s", event_type, session_code)
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
        logger.debug("Player broadcast %s from %s in %s", event_type, user_id, session_code)
        return

    # Player → all broadcast (token_move etc. that aren't in the explicit map)
    msg = _msg(event_type, payload, from_user=user_id)
    await manager.broadcast_to_room(session_code, msg)
    logger.debug("Player broadcast %s from %s in %s", event_type, user_id, session_code)


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
    """End combat — forward the full payload (result, survivors, fallen, rounds) to all clients."""
    summary = payload.get("summary", "")
    state["combat"] = None
    # Forward the entire payload so players receive result/fallen/survivors/rounds for the
    # victory/defeat screen.  The GM client constructs these fields in CombatOverlay.handleNextTurn.
    broadcast_payload = {
        "summary": summary,
        "battle_id": payload.get("battle_id"),
        "result": payload.get("result"),          # 'victory' | 'defeat' | None
        "fallen": payload.get("fallen", []),
        "survivors": payload.get("survivors", []),
        "rounds": payload.get("rounds"),
    }
    msg = _msg(EventType.COMBAT_END, broadcast_payload, from_user=user_id)
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

    # Safety net: merge any tracked vitals into combatants before broadcasting.
    # This ensures HP changes from vitals_update are always reflected even if
    # _sync_vitals_to_combat missed a matching ID variant.
    session_vitals = state.get("vitals", {})
    for c in order:
        cid = c.get("characterId") or c.get("character_id")
        if cid and cid in session_vitals:
            v = session_vitals[cid]
            if "lep" in v:
                c["lep"] = v["lep"]
            if "asp" in v:
                c["asp"] = v["asp"]
            if "kap" in v:
                c["kap"] = v["kap"]
            if "schip" in v:
                c["schip"] = v["schip"]

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


async def _handle_opposed_probe_request(session_code: str, user_id: str, payload: dict, state: dict):
    """GM initiates an opposed probe (Vergleichsprobe) between two characters.

    Payload:
        initiator_id: str       — user_id (player) or character_id (NPC)
        target_id: str          — user_id (player) or character_id (NPC)
        initiator_skill: str    — talent name for initiator (e.g. Einschüchtern)
        target_skill: str       — talent name for target (e.g. Willenskraft)
        initiator_name: str     — display name
        target_name: str        — display name
        modifier: int           — optional difficulty modifier
        initiator_fw: int       — talent value for initiator
        target_fw: int          — talent value for target
        initiator_probe: list   — 3-attribute probe array (e.g. ["MU","IN","CH"])
        target_probe: list      — 3-attribute probe array
        npc_auto_roll: dict     — if set, NPC result: {side: "initiator"|"target", qs: int, success: bool}
    """
    import uuid as _uuid

    initiator_id = payload.get("initiator_id")
    target_id = payload.get("target_id")
    initiator_skill = payload.get("initiator_skill", "Probe")
    target_skill = payload.get("target_skill", "Probe")
    initiator_name = payload.get("initiator_name", "Initiator")
    target_name = payload.get("target_name", "Ziel")
    modifier = payload.get("modifier", 0)

    if not initiator_id or not target_id:
        await manager.send_to_user(user_id, _error("opposed_probe_request requires initiator_id and target_id"))
        return

    probe_id = f"opposed_{_uuid.uuid4().hex[:12]}"
    opposed = state.setdefault("opposed_probes", {})
    opposed[probe_id] = {
        "initiator_id": initiator_id,
        "target_id": target_id,
        "initiator_skill": initiator_skill,
        "target_skill": target_skill,
        "initiator_name": initiator_name,
        "target_name": target_name,
        "modifier": modifier,
        "results": {},  # side ("initiator"|"target") -> {qs, success, critical, patzer}
        "gm_user_id": user_id,
    }

    # Build dice request base
    base_request = {
        "type": "talent_probe",
        "opposed": True,
        "probe_id": probe_id,
        "difficulty": modifier,
    }

    # Handle NPC auto-roll (GM pre-rolled for NPC)
    npc_auto = payload.get("npc_auto_roll")
    if npc_auto:
        side = npc_auto.get("side", "target")
        opposed[probe_id]["results"][side] = {
            "qs": npc_auto.get("qs", 0),
            "success": npc_auto.get("success", False),
            "critical": npc_auto.get("critical", False),
            "patzer": npc_auto.get("patzer", False),
        }

    # Send dice requests to players who need to roll
    for side, uid, skill, name, fw, probe_attrs in [
        ("initiator", initiator_id, initiator_skill, initiator_name, payload.get("initiator_fw", 0), payload.get("initiator_probe", [])),
        ("target", target_id, target_skill, target_name, payload.get("target_fw", 0), payload.get("target_probe", [])),
    ]:
        if side not in opposed[probe_id]["results"]:
            # This side needs to roll — send dice_request
            req = {
                **base_request,
                "target_user_id": uid,
                "talent_name": skill,
                "label": f"Vergleichsprobe: {skill}",
                "character_name": name,
                "fw": fw,
                "probe": probe_attrs,
                "opposed_side": side,
            }
            await manager.send_to_user(uid, _msg(EventType.DICE_REQUEST, req, from_user=user_id))
            # Store in pending_requests for reconnect persistence
            state.setdefault("pending_requests", {})[f"opposed_{uid}_{probe_id}"] = {
                **req, "type": "dice_request", "timestamp": _ts(),
            }

    # Check if auto-roll already completed both sides (NPC vs NPC)
    if len(opposed[probe_id]["results"]) >= 2:
        await _resolve_opposed_probe(session_code, probe_id, state)
        return

    # Confirm to GM
    await manager.send_to_user(user_id, _msg(EventType.OPPOSED_PROBE_REQUEST, {
        "probe_id": probe_id,
        "initiator_name": initiator_name,
        "target_name": target_name,
        "initiator_skill": initiator_skill,
        "target_skill": target_skill,
        "status": "sent",
    }, from_user=user_id))

    logger.info("Opposed probe %s started in %s: %s (%s) vs %s (%s)",
                probe_id, session_code, initiator_name, initiator_skill, target_name, target_skill)


async def _resolve_opposed_probe(session_code: str, probe_id: str, state: dict):
    """Resolve an opposed probe once both sides have submitted results.

    DSA5 rules: Higher QS wins. On tie, defender (target) wins.
    Failed probes get QS 0 for comparison purposes.
    """
    opposed = state.get("opposed_probes", {})
    probe = opposed.get(probe_id)
    if not probe:
        return

    init_result = probe["results"].get("initiator", {})
    target_result = probe["results"].get("target", {})

    init_qs = init_result.get("qs", 0) if init_result.get("success") else 0
    target_qs = target_result.get("qs", 0) if target_result.get("success") else 0

    # DSA5: ties go to defender (target)
    if init_qs > target_qs:
        winner = "initiator"
        winner_name = probe["initiator_name"]
    else:
        winner = "target"
        winner_name = probe["target_name"]

    result_payload = {
        "probe_id": probe_id,
        "winner": winner,
        "winner_name": winner_name,
        "initiator_name": probe["initiator_name"],
        "target_name": probe["target_name"],
        "initiator_skill": probe["initiator_skill"],
        "target_skill": probe["target_skill"],
        "initiator_qs": init_qs,
        "target_qs": target_qs,
        "initiator_success": init_result.get("success", False),
        "target_success": target_result.get("success", False),
        "initiator_critical": init_result.get("critical", False),
        "target_critical": target_result.get("critical", False),
        "initiator_patzer": init_result.get("patzer", False),
        "target_patzer": target_result.get("patzer", False),
    }

    # Broadcast result to all
    await manager.broadcast_to_room(session_code, _msg(
        EventType.OPPOSED_PROBE_RESULT, result_payload,
    ))

    # Log to Protokoll
    init_label = f"{probe['initiator_name']} {probe['initiator_skill']} (QS {init_qs})"
    target_label = f"{probe['target_name']} {probe['target_skill']} (QS {target_qs})"
    await _append_session_log(
        session_code, "dice",
        f"Vergleichsprobe: {init_label} vs {target_label} — {winner_name} gewinnt!",
        icon="swords",
    )

    # Clean up
    del opposed[probe_id]
    # Remove pending requests for this probe
    pending = state.get("pending_requests", {})
    to_remove = [k for k in pending if probe_id in k]
    for k in to_remove:
        del pending[k]

    logger.info("Opposed probe %s resolved in %s: %s wins (QS %d vs %d)",
                probe_id, session_code, winner_name, init_qs, target_qs)


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
    """Advance the in-game clock.

    Payload:
        new_time: str            — new world time (ISO-ish, e.g. "14:30" or "1037-06-15T14:30")
        advanced_by_minutes: int — how many minutes were advanced (for logging)
    """
    new_time = payload.get("new_time")
    if not new_time or not isinstance(new_time, str):
        await manager.send_to_user(user_id, _error("time_advance requires 'new_time' (string)"))
        return
    advanced_by_minutes = payload.get("advanced_by_minutes", 0)
    if not isinstance(advanced_by_minutes, (int, float)):
        advanced_by_minutes = 0

    state["in_game_time"] = new_time
    msg = _msg(EventType.TIME_ADVANCE, {
        "new_time": new_time,
        "advanced_by_minutes": int(advanced_by_minutes),
        # Keep legacy field for frontend compatibility
        "advanced_by": payload.get("advanced_by", ""),
    }, from_user=user_id)
    await manager.broadcast_to_room(session_code, msg)

    # Log significant time changes
    if advanced_by_minutes >= 60:
        hours = int(advanced_by_minutes) // 60
        mins = int(advanced_by_minutes) % 60
        label = f"{hours}h" + (f" {mins}min" if mins else "")
        await _append_session_log(session_code, "system", f"Zeit vorgerückt um {label} → {new_time}", icon="clock")


ALLOWED_WEATHER = {"klar", "bewölkt", "bewoelkt", "regen", "sturm", "schnee", "nebel", "hagel", "gewitter"}


async def _handle_weather_change(session_code: str, user_id: str, payload: dict, state: dict):
    """Change the current weather.

    Payload:
        weather: str — one of the allowed weather types
    """
    weather = payload.get("weather")
    if not weather or not isinstance(weather, str):
        await manager.send_to_user(user_id, _error("weather_change requires 'weather' (string)"))
        return
    weather_lower = weather.lower().strip()
    if weather_lower not in ALLOWED_WEATHER:
        await manager.send_to_user(user_id, _error(
            f"Unknown weather '{weather}'. Allowed: {', '.join(sorted(ALLOWED_WEATHER))}"
        ))
        return

    state["weather"] = weather
    msg = _msg(EventType.WEATHER_CHANGE, {"weather": weather}, from_user=user_id)
    await manager.broadcast_to_room(session_code, msg)
    await _append_session_log(session_code, "system", f"Wetter: {weather}", icon="cloud")


async def _handle_rest_start(session_code: str, user_id: str, payload: dict, state: dict):
    """GM triggers a rest period for selected characters.

    Payload:
        character_ids: list[str] — characters who are resting
        duration_hours: int      — rest duration (default 8)
    """
    character_ids = payload.get("character_ids", [])
    duration_hours = payload.get("duration_hours", 8)
    if not character_ids:
        await manager.send_to_user(user_id, _error("rest_start requires 'character_ids' list"))
        return
    if not isinstance(duration_hours, (int, float)) or duration_hours < 1:
        duration_hours = 8

    state["rest"] = {
        "character_ids": character_ids,
        "duration_hours": int(duration_hours),
        "started_at": _ts(),
    }

    msg = _msg(EventType.REST_START, {
        "character_ids": character_ids,
        "duration_hours": int(duration_hours),
    }, from_user=user_id)
    await manager.broadcast_to_room(session_code, msg)
    names = []
    for cid in character_ids:
        names.append(_get_character_name(session_code, cid))
    await _append_session_log(
        session_code, "system",
        f"Rast beginnt ({duration_hours}h) — {', '.join(names)}",
        icon="moon",
    )
    logger.info("Rest started in %s for %d characters (%dh)", session_code, len(character_ids), duration_hours)


async def _handle_rest_end(session_code: str, user_id: str, payload: dict, state: dict):
    """Resolve rest: roll regeneration, heal vitals, reduce conditions.

    DSA5 regeneration (simplified):
        - LeP: +1W6 (if character has LeP < LeP_max)
        - AsP: +1W6 (if character has AsP_max > 0 and AsP < AsP_max)
        - KaP: +1W6 (if character has KaP_max > 0 and KaP < KaP_max)
        - Conditions: reduce Schmerz and Betäubung by 1 level each (if present)
    """
    rest = state.get("rest")
    character_ids = payload.get("character_ids") or (rest or {}).get("character_ids", [])
    duration_hours = payload.get("duration_hours") or (rest or {}).get("duration_hours", 8)

    if not character_ids:
        await manager.send_to_user(user_id, _error("No characters to rest"))
        return

    results = []
    for cid in character_ids:
        async with _get_char_lock(cid):
            await _cache_character_vitals(session_code, cid)
            vitals = state.setdefault("vitals", {}).get(cid, {})
            max_v = state.get("max_vitals", {}).get(cid, {})
            conditions = list(state.get("conditions", {}).get(cid, []))
            char_name = _get_character_name(session_code, cid)

            regen = {}
            regen_log = []

            # LeP regeneration: 1W6
            lep_max = max_v.get("LeP_max", 0)
            current_lep = vitals.get("lep", 0)
            if lep_max > 0 and current_lep < lep_max:
                roll = random.randint(1, 6)
                new_lep = min(lep_max, current_lep + roll)
                gained = new_lep - current_lep
                if gained > 0:
                    regen["lep"] = new_lep
                    regen_log.append(f"+{gained} LeP")

            # AsP regeneration: 1W6 (only for magic users)
            asp_max = max_v.get("AsP_max", 0)
            current_asp = vitals.get("asp", 0)
            if asp_max > 0 and current_asp < asp_max:
                roll = random.randint(1, 6)
                new_asp = min(asp_max, current_asp + roll)
                gained = new_asp - current_asp
                if gained > 0:
                    regen["asp"] = new_asp
                    regen_log.append(f"+{gained} AsP")

            # KaP regeneration: 1W6 (only for blessed)
            kap_max = max_v.get("KaP_max", 0)
            current_kap = vitals.get("kap", 0)
            if kap_max > 0 and current_kap < kap_max:
                roll = random.randint(1, 6)
                new_kap = min(kap_max, current_kap + roll)
                gained = new_kap - current_kap
                if gained > 0:
                    regen["kap"] = new_kap
                    regen_log.append(f"+{gained} KaP")

            # Condition recovery: reduce Schmerz and Betäubung by 1
            cond_log = []
            reducible = {"Schmerz", "Betäubung", "Betaeubung"}
            new_conditions = []
            for c in conditions:
                if c.get("name") in reducible and c.get("level", 1) > 0:
                    new_level = c["level"] - 1
                    if new_level > 0:
                        new_conditions.append({**c, "level": new_level})
                    cond_log.append(f"-1 {c['name']}")
                else:
                    new_conditions.append(c)

            # Apply changes
            if regen:
                state["vitals"][cid] = {**vitals, **regen}
                _safe_create_task(_persist_vitals(cid, regen), name=f"persist_rest_{cid[:8]}")
            if cond_log:
                state["conditions"][cid] = new_conditions
                _safe_create_task(_persist_conditions(cid, new_conditions), name=f"persist_rest_cond_{cid[:8]}")

            # Broadcast updated vitals and conditions
            if regen:
                _bump_version(state)
                await manager.broadcast_to_room(session_code, _msg("vitals_update", {
                    "character_id": cid,
                    "vitals": state["vitals"][cid],
                    "state_version": state["state_version"],
                }, from_user=user_id))
            if cond_log:
                await manager.broadcast_to_room(session_code, _msg("conditions_update", {
                    "character_id": cid,
                    "conditions": new_conditions,
                }, from_user=user_id))

            summary_parts = regen_log + cond_log
            results.append({
                "character_id": cid,
                "character_name": char_name,
                "regen": regen,
                "conditions_reduced": cond_log,
                "summary": ", ".join(summary_parts) if summary_parts else "keine Erholung",
            })

    # Broadcast rest results to all
    msg = _msg(EventType.REST_END, {
        "results": results,
        "duration_hours": int(duration_hours),
    }, from_user=user_id)
    await manager.broadcast_to_room(session_code, msg)

    # Log to Protokoll — one line per character
    for r in results:
        await _append_session_log(
            session_code, "system",
            f"Rast — {r['character_name']}: {r['summary']}",
            icon="heart",
        )

    # Clear rest state
    state.pop("rest", None)
    _safe_create_task(_snapshot_session_state(session_code), name=f"snapshot_rest_{session_code}")
    logger.info("Rest ended in %s: %d characters healed", session_code, len(results))



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

    # Reset SchiP to max for all characters in this session
    character_ids = payload.get("character_ids", [])
    for cid in character_ids:
        await _cache_character_vitals(session_code, cid)
        max_vals = state.get("max_vitals", {}).get(cid, {})
        schip_max = max_vals.get("Schip", 3)
        vitals = state.setdefault("vitals", {}).setdefault(cid, {})
        vitals["schip"] = schip_max
        _safe_create_task(_persist_vitals(cid, {"schip": schip_max}), name=f"reset_schip_{cid[:8]}")
    if character_ids:
        logger.info("Reset SchiP to max for %d characters in session %s", len(character_ids), session_code)

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
    # Frontend sends "awards" (QuestSessionTab) or "ap_awards" (legacy) — accept both
    ap_awards = payload.get("ap_awards") or payload.get("awards") or []
    msg = _msg(EventType.SESSION_END, {
        "summary": summary,
        "ap_awards": ap_awards,
    }, from_user=user_id)
    await manager.broadcast_to_room(session_code, msg)
    # Persist AP awards to the database
    if ap_awards:
        _safe_create_task(
            _persist_ap_awards(session_code, ap_awards),
            name=f"persist_ap_awards_{session_code}",
        )
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
    to_remove = [k for k in pending if k.startswith(f"dice_{user_id}") or k.startswith(f"probe_{user_id}") or k.startswith(f"opposed_{user_id}")]
    for k in to_remove:
        del pending[k]

    # Check if this result belongs to an opposed probe (Vergleichsprobe)
    probe_id = payload.get("probe_id")
    opposed_side = payload.get("opposed_side")
    if probe_id and opposed_side:
        opposed = state.get("opposed_probes", {})
        probe = opposed.get(probe_id)
        if probe:
            success = payload.get("result", {}).get("success") if isinstance(payload.get("result"), dict) else payload.get("success")
            qs = payload.get("result", {}).get("qs") if isinstance(payload.get("result"), dict) else payload.get("qs", 0)
            probe["results"][opposed_side] = {
                "qs": qs or 0,
                "success": bool(success),
                "critical": payload.get("critical", False),
                "patzer": payload.get("patzer", False),
            }
            # Forward result to GM so they see individual rolls
            await manager.broadcast_to_room(session_code, _msg(
                EventType.DICE_RESULT, {**payload, "user_id": user_id}, from_user=user_id,
            ), target="gm")
            # Resolve if both sides are in
            if len(probe["results"]) >= 2:
                await _resolve_opposed_probe(session_code, probe_id, state)
            return  # Don't fall through to normal dice_result handling

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

    character_id = payload.get("character_id")
    use_schip = payload.get("use_schip", False)

    # If player is spending a SchiP for defense boost, deduct and apply +4
    schip_applied = False
    if use_schip and character_id:
        async with _get_char_lock(character_id):
            await _cache_character_vitals(session_code, character_id)
            vitals = state.setdefault("vitals", {}).get(character_id, {})
            current_schip = vitals.get("schip", 0)
            if current_schip > 0:
                vitals["schip"] = current_schip - 1
                state["vitals"][character_id] = vitals
                _bump_version(state)
                schip_applied = True
                _safe_create_task(_persist_vitals(character_id, {"schip": vitals["schip"]}), name=f"persist_schip_def_{character_id[:8]}")

        if schip_applied:
            # Broadcast updated vitals
            await manager.broadcast_to_room(session_code, _msg("vitals_update", {
                "character_id": character_id,
                "vitals": state["vitals"][character_id],
                "state_version": state["state_version"],
            }))
            # Log SchiP usage
            char_name = _get_character_name(session_code, character_id)
            await _append_session_log(
                session_code, "schip",
                f"{char_name} setzt Schicksalspunkt ein: Verteidigung +4. ({vitals['schip']} SchiP verbleibend)",
                icon="star",
            )
            _safe_create_task(
                _increment_session_stat(session_code, character_id, user_id, "schip_spent"),
                name=f"stat_schip_def_{character_id[:8]}",
            )

    defense = {
        "user_id": user_id,
        "defense_type": payload.get("defense_type"),  # "parade" | "ausweichen" | "none"
        "roll": payload.get("roll"),
        "result": payload.get("result", {}),
        "schip_used": schip_applied,
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
            "schip_used": schip_applied,
        }, from_user=user_id,
    ))
    combat.setdefault("log", []).append({
        "type": "defense",
        "user_id": user_id,
        "data": defense,
        "timestamp": _ts(),
    })
    if schip_applied:
        _safe_create_task(_snapshot_session_state(session_code), name=f"snapshot_schip_def_{session_code}")


async def _handle_schip_use(session_code: str, user_id: str, payload: dict, state: dict):
    """Handle Schicksalspunkt spending.

    Payload:
        character_id: str
        usage: "reroll" | "defense_boost" | "halve_damage" | "ignore_condition" | "additional_reaction"
        condition: str (only for ignore_condition)
    """
    character_id = payload.get("character_id")
    usage = payload.get("usage")
    if not character_id or not usage:
        await manager.send_to_user(user_id, _error("schip_use requires character_id and usage"))
        return

    valid_usages = {"reroll", "defense_boost", "halve_damage", "ignore_condition", "additional_reaction"}
    if usage not in valid_usages:
        await manager.send_to_user(user_id, _error(f"Invalid SchiP usage: {usage}"))
        return

    async with _get_char_lock(character_id):
        await _cache_character_vitals(session_code, character_id)
        vitals = state.setdefault("vitals", {}).get(character_id, {})
        current_schip = vitals.get("schip", 0)

        if current_schip <= 0:
            await manager.send_to_user(user_id, _msg(EventType.SCHIP_ERROR, {
                "message": "Keine Schicksalspunkte verfügbar.",
            }))
            return

        # Deduct 1 SchiP
        vitals["schip"] = current_schip - 1
        state["vitals"][character_id] = vitals
        _bump_version(state)

        # Apply effect based on usage type
        effect_label = {
            "defense_boost": "Verteidigung +4",
            "halve_damage": "Schaden halbiert",
            "reroll": "Probe wiederholt",
            "additional_reaction": "Zusätzliche Verteidigung",
        }.get(usage, usage)

        if usage == "defense_boost":
            # Flag: next defense for this character gets +4
            state.setdefault("schip_effects", {})[character_id] = {
                "type": "defense_boost", "value": 4,
            }
        elif usage == "ignore_condition":
            condition = payload.get("condition", "")
            effect_label = f"Zustand '{condition}' ignoriert (1 KR)"

        # Persist vitals in background
        _safe_create_task(_persist_vitals(character_id, {"schip": vitals["schip"]}), name=f"persist_schip_{character_id[:8]}")

    # Broadcast updated vitals to all
    await manager.broadcast_to_room(session_code, _msg("vitals_update", {
        "character_id": character_id,
        "vitals": state["vitals"][character_id],
        "state_version": state["state_version"],
    }))

    # Broadcast SchiP usage event (for UI feedback)
    char_name = _get_character_name(session_code, character_id)
    await manager.broadcast_to_room(session_code, _msg(EventType.SCHIP_USED, {
        "character_id": character_id,
        "character_name": char_name,
        "usage": usage,
        "effect": effect_label,
        "remaining": vitals["schip"],
    }))

    # Log to session log (Protokoll)
    await _append_session_log(
        session_code, "schip",
        f"{char_name} setzt Schicksalspunkt ein: {effect_label}. ({vitals['schip']} SchiP verbleibend)",
        icon="star",
    )

    # Increment session statistics
    _safe_create_task(
        _increment_session_stat(session_code, character_id, user_id, "schip_spent"),
        name=f"stat_schip_{character_id[:8]}",
    )

    _safe_create_task(_snapshot_session_state(session_code), name=f"snapshot_schip_{session_code}")
    logger.info("SchiP used by %s (%s): %s — %d remaining", char_name, character_id, usage, vitals["schip"])


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

            # Enrich inventories before broadcasting (still inside DB session)
            from utils.inventory_enrichment import enrich_basis_inventory
            enriched_from_inv = await enrich_basis_inventory(from_inv, db)
            enriched_to_inv = await enrich_basis_inventory(to_inv, db)

        # Broadcast inventory updates to both players
        from_user_id = payload.get("from_user_id") or payload.get("proposer_user_id")
        to_user_id = payload.get("to_user_id") or payload.get("target_user_id")

        exchange_type = "trade" if (to_items or to_money) else "transfer"
        summary = payload.get("summary", "")

        if from_user_id:
            await manager.send_to_user(from_user_id, _msg("inventory_update", {
                "character_id": from_char_id,
                "inventory": enriched_from_inv,
                "reason": f"{exchange_type}_completed",
                "summary": summary,
            }, from_user=gm_user_id))

        if to_user_id:
            await manager.send_to_user(to_user_id, _msg("inventory_update", {
                "character_id": to_char_id,
                "inventory": enriched_to_inv,
                "reason": f"{exchange_type}_completed",
                "summary": summary,
            }, from_user=gm_user_id))

        # Confirm to GM
        await manager.send_to_user(gm_user_id, _msg("inventory_update", {
            "character_id": from_char_id,
            "from_inventory": enriched_from_inv,
            "to_character_id": to_char_id,
            "to_inventory": enriched_to_inv,
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
        tid = req.get("template_id")
        qty = req.get("quantity", 1)
        for idx, it in enumerate(item_list):
            # Match by template_id first, fall back to name for legacy data
            if (tid and it.get("template_id") == tid) or it.get("name") == name:
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
        tid = req.get("template_id")
        qty = req.get("quantity", 1)
        found = False
        for idx, it in enumerate(item_list):
            # Match by template_id first, fall back to name for legacy data
            if (tid and it.get("template_id") == tid) or it.get("name") == name:
                item_list[idx] = {**it, "quantity": it.get("quantity", 1) + qty}
                found = True
                break
        if not found:
            # Preserve all fields from the request (weight, category, template_id, etc.)
            new_item = {k: v for k, v in req.items()}
            new_item.setdefault("equipped", False)
            new_item["quantity"] = qty
            item_list.append(new_item)
    if money:
        purse = dict(inv.get("purse", {}))
        for d in ("dukaten", "silber", "heller", "kreuzer"):
            purse[d] = purse.get(d, 0) + (money.get(d, 0) if isinstance(money, dict) else getattr(money, d, 0))
        inv["purse"] = purse
    inv["items"] = item_list
    return inv


# ===================================================================
# Character death memorial
# ===================================================================

async def _handle_character_death(session_code: str, user_id: str, payload: dict, state: dict):
    """GM marks a character as dead.
    payload: {character_id, cause_of_death?}
    """
    character_id = payload.get("character_id")
    cause = payload.get("cause_of_death", "Unbekannt")

    if not character_id:
        await manager.send_to_user(user_id, _error("character_id required"))
        return

    async with _get_char_lock(character_id):
        from database import async_session
        from sqlalchemy import select
        from models.character import Character
        from models.session_state import SessionPlayer

        async with async_session() as db:
            result = await db.execute(select(Character).where(Character.id == character_id))
            char = result.scalar_one_or_none()
            if not char:
                await manager.send_to_user(user_id, _error("Charakter nicht gefunden"))
                return

            if char.status == "dead":
                await manager.send_to_user(user_id, _error("Charakter ist bereits tot"))
                return

            char_name = char.name

            # Count sessions played
            sp_result = await db.execute(
                select(SessionPlayer).where(SessionPlayer.character_id == character_id)
            )
            total_sessions = len(sp_result.scalars().all())

            # Build memorial record
            death_record = {
                "cause_of_death": cause,
                "death_date": datetime.utcnow().isoformat(),
                "final_vitals": char.current_vitals,
                "final_attributes": char.attributes,
                "total_ap": char.total_ap,
                "total_sessions_played": total_sessions,
            }

            char.status = "dead"
            char.death_record = death_record
            # Zero out vitals
            char.current_vitals = {"lep": 0, "asp": 0, "kap": 0, "schip": 0}
            await db.commit()

    # Update in-memory vitals
    state.setdefault("vitals", {})[character_id] = {"lep": 0, "asp": 0, "kap": 0, "schip": 0}

    # Remove from initiative order if combat is active
    combat = state.get("combat")
    if combat:
        order = combat.get("initiative_order", [])
        new_order = [
            c for c in order
            if (c.get("id") or c.get("characterId") or c.get("character_id")) != character_id
        ]
        if len(new_order) != len(order):
            combat["initiative_order"] = new_order
            # Remove from combatants dict
            combat.get("combatants", {}).pop(character_id, None)
            # Adjust turn index if needed
            if combat.get("current_turn_index", 0) >= len(new_order):
                combat["current_turn_index"] = 0
            # Broadcast updated combat state
            await manager.broadcast_to_room(session_code, _msg("initiative_update", {
                "initiative_order": new_order,
                "current_turn_index": combat.get("current_turn_index", 0),
                "round": combat.get("round", 1),
            }))

    _bump_version(state)

    # Broadcast death event
    await manager.broadcast_to_room(session_code, _msg(EventType.CHARACTER_DEATH, {
        "character_id": character_id,
        "name": char_name,
        "cause_of_death": cause,
        "death_record": death_record,
    }))

    # Protokoll entry
    await _append_session_log(
        session_code, "system",
        f"\u2620 {char_name} ist gefallen. {cause}",
        icon="skull",
        data={"character_id": character_id, "cause_of_death": cause},
    )
    await _snapshot_session_state(session_code)
    logger.info("Character %s (%s) died in session %s: %s", character_id[:8], char_name, session_code, cause)


# ===================================================================
# Shop / Merchant system
# ===================================================================

# DSA5 currency: 1 Dukaten = 10 Silbertaler = 100 Heller = 1000 Kreuzer
# Template prices are stored in Silbertaler.

def _to_kreuzer(purse: dict) -> int:
    """Convert a purse dict {dukaten, silber, heller, kreuzer} to Kreuzer."""
    return (
        purse.get("dukaten", 0) * 1000
        + purse.get("silber", 0) * 100
        + purse.get("heller", 0) * 10
        + purse.get("kreuzer", 0)
    )


def _from_kreuzer(total: int) -> dict:
    """Convert Kreuzer back to a purse dict with optimal denominations."""
    d, rem = divmod(total, 1000)
    s, rem = divmod(rem, 100)
    h, k = divmod(rem, 10)
    return {"dukaten": d, "silber": s, "heller": h, "kreuzer": k}


def _price_to_kreuzer(price_silber: float, markup: float = 1.0) -> int:
    """Convert a template price (in Silbertaler) to Kreuzer, applying markup."""
    return round(price_silber * 100 * markup)


async def _handle_shop_create(session_code: str, user_id: str, payload: dict, state: dict):
    """GM creates a shop. payload: {name, items: [{template_id, name, price, stock?, category?}], markup?}"""
    name = payload.get("name", "Händler")
    items = payload.get("items", [])
    markup = payload.get("markup", 1.0)

    if not items:
        await manager.send_to_user(user_id, _error("Shop benötigt mindestens einen Gegenstand"))
        return

    shop_id = str(uuid.uuid4())[:8]

    # Normalize shop items — ensure each has required fields
    shop_items = []
    for item in items:
        shop_items.append({
            "template_id": item.get("template_id"),
            "name": item.get("name", "Unbekannt"),
            "price": item.get("price", 0),  # in Silbertaler
            "stock": item.get("stock"),      # None = unlimited
            "category": item.get("category", ""),
            "weight": item.get("weight"),
            "properties": item.get("properties"),
        })

    shop = {
        "id": shop_id,
        "name": name,
        "items": shop_items,
        "markup": markup,
        "open": True,
    }

    state.setdefault("shops", {})[shop_id] = shop
    _bump_version(state)

    await manager.broadcast_to_room(session_code, _msg(EventType.SHOP_STATE, {
        "action": "created",
        "shop": shop,
        "shops": state["shops"],
    }))
    await _append_session_log(session_code, "system", f"Laden eröffnet: {name}", icon="store")
    await _snapshot_session_state(session_code)


async def _handle_shop_update(session_code: str, user_id: str, payload: dict, state: dict):
    """GM updates a shop. payload: {shop_id, name?, items?, markup?, add_items?, remove_items?}"""
    shop_id = payload.get("shop_id")
    shops = state.get("shops", {})
    shop = shops.get(shop_id)

    if not shop:
        await manager.send_to_user(user_id, _error("Laden nicht gefunden"))
        return

    if payload.get("name"):
        shop["name"] = payload["name"]
    if payload.get("markup") is not None:
        shop["markup"] = payload["markup"]

    # Full item list replacement
    if payload.get("items") is not None:
        shop["items"] = [
            {
                "template_id": i.get("template_id"),
                "name": i.get("name", "Unbekannt"),
                "price": i.get("price", 0),
                "stock": i.get("stock"),
                "category": i.get("category", ""),
                "weight": i.get("weight"),
                "properties": i.get("properties"),
            }
            for i in payload["items"]
        ]

    # Add items incrementally
    if payload.get("add_items"):
        for item in payload["add_items"]:
            shop["items"].append({
                "template_id": item.get("template_id"),
                "name": item.get("name", "Unbekannt"),
                "price": item.get("price", 0),
                "stock": item.get("stock"),
                "category": item.get("category", ""),
                "weight": item.get("weight"),
                "properties": item.get("properties"),
            })

    # Remove items by template_id
    if payload.get("remove_items"):
        remove_ids = set(payload["remove_items"])
        shop["items"] = [i for i in shop["items"] if i.get("template_id") not in remove_ids]

    _bump_version(state)
    await manager.broadcast_to_room(session_code, _msg(EventType.SHOP_STATE, {
        "action": "updated",
        "shop": shop,
        "shops": state["shops"],
    }))
    await _snapshot_session_state(session_code)


async def _handle_shop_close(session_code: str, user_id: str, payload: dict, state: dict):
    """GM closes a shop. payload: {shop_id}"""
    shop_id = payload.get("shop_id")
    shops = state.get("shops", {})
    shop = shops.pop(shop_id, None)

    if not shop:
        await manager.send_to_user(user_id, _error("Laden nicht gefunden"))
        return

    _bump_version(state)
    await manager.broadcast_to_room(session_code, _msg(EventType.SHOP_STATE, {
        "action": "closed",
        "shop_id": shop_id,
        "shop_name": shop.get("name", "Händler"),
        "shops": state["shops"],
    }))
    await _append_session_log(session_code, "system", f"Laden geschlossen: {shop.get('name', 'Händler')}", icon="store")
    await _snapshot_session_state(session_code)


async def _handle_shop_buy(session_code: str, user_id: str, payload: dict, state: dict):
    """Player buys an item from a shop.
    payload: {shop_id, template_id, character_id, quantity?}
    """
    shop_id = payload.get("shop_id")
    template_id = payload.get("template_id")
    character_id = payload.get("character_id")
    quantity = max(1, payload.get("quantity", 1))

    shops = state.get("shops", {})
    shop = shops.get(shop_id)
    if not shop or not shop.get("open", True):
        await manager.send_to_user(user_id, _error("Laden nicht verfügbar"))
        return

    # Find the item in the shop
    shop_item = None
    shop_item_idx = None
    for idx, si in enumerate(shop.get("items", [])):
        if si.get("template_id") == template_id:
            shop_item = si
            shop_item_idx = idx
            break

    if not shop_item:
        await manager.send_to_user(user_id, _error("Gegenstand nicht im Laden"))
        return

    # Check stock
    if shop_item.get("stock") is not None:
        if shop_item["stock"] < quantity:
            await manager.send_to_user(user_id, _error(
                f"Nicht genug auf Lager (verfügbar: {shop_item['stock']})"
            ))
            return

    # Calculate price in Kreuzer
    markup = shop.get("markup", 1.0)
    unit_price_k = _price_to_kreuzer(shop_item.get("price", 0), markup)
    total_price_k = unit_price_k * quantity

    # Load character inventory and check money
    async with _get_char_lock(character_id):
        from database import async_session
        from sqlalchemy import select
        from models.character import Character

        async with async_session() as db:
            result = await db.execute(select(Character).where(Character.id == character_id))
            char = result.scalar_one_or_none()
            if not char:
                await manager.send_to_user(user_id, _error("Charakter nicht gefunden"))
                return

            inv = _normalize_inv(char.basis_inventory)
            purse = inv.get("purse", {})
            available_k = _to_kreuzer(purse)

            if available_k < total_price_k:
                price_display = _from_kreuzer(total_price_k)
                await manager.send_to_user(user_id, _error(
                    f"Nicht genug Geld. Preis: {_format_price(price_display)}"
                ))
                return

            # Deduct money
            new_purse = _from_kreuzer(available_k - total_price_k)
            inv["purse"] = new_purse

            # Add item to inventory
            new_item = {
                "template_id": template_id,
                "name": shop_item["name"],
                "quantity": quantity,
                "equipped": False,
            }
            if shop_item.get("weight"):
                new_item["weight"] = shop_item["weight"]
            if shop_item.get("category"):
                new_item["category"] = shop_item["category"]
            inv = _inv_add(inv, [new_item], None)

            # Persist
            char.basis_inventory = inv
            await db.commit()

    # Decrement stock
    if shop_item.get("stock") is not None:
        shop["items"][shop_item_idx]["stock"] = shop_item["stock"] - quantity
        if shop["items"][shop_item_idx]["stock"] <= 0:
            shop["items"].pop(shop_item_idx)

    _bump_version(state)

    # Broadcast updated shop + inventory change
    await manager.broadcast_to_room(session_code, _msg(EventType.SHOP_STATE, {
        "action": "purchase",
        "shop": shop,
        "shops": state["shops"],
        "buyer_character_id": character_id,
        "item_name": shop_item["name"],
        "quantity": quantity,
    }))
    await manager.broadcast_to_room(session_code, _msg("inventory_change", {
        "character_id": character_id,
        "basis_inventory": inv,
    }))
    await _append_session_log(
        session_code, "system",
        f"{shop_item['name']} ×{quantity} gekauft bei {shop.get('name', 'Händler')}",
        icon="shopping-cart",
    )
    await _snapshot_session_state(session_code)


async def _handle_shop_sell(session_code: str, user_id: str, payload: dict, state: dict):
    """Player sells an item to a shop.
    payload: {shop_id, template_id, character_id, item_name?, quantity?, sell_price?}
    Sell price defaults to 50% of shop markup price (standard DSA5 resale).
    """
    shop_id = payload.get("shop_id")
    template_id = payload.get("template_id")
    item_name = payload.get("item_name", "")
    character_id = payload.get("character_id")
    quantity = max(1, payload.get("quantity", 1))

    shops = state.get("shops", {})
    shop = shops.get(shop_id)
    if not shop or not shop.get("open", True):
        await manager.send_to_user(user_id, _error("Laden nicht verfügbar"))
        return

    # Determine sell price: explicit override, or 50% of shop item price, or 0
    sell_price_silber = payload.get("sell_price")
    if sell_price_silber is None:
        # Check if item exists in shop catalog for reference price
        for si in shop.get("items", []):
            if si.get("template_id") == template_id:
                sell_price_silber = si.get("price", 0) * 0.5
                break
        if sell_price_silber is None:
            sell_price_silber = 0

    total_sell_k = round(sell_price_silber * 100 * quantity)

    # Remove item from character inventory, add money
    async with _get_char_lock(character_id):
        from database import async_session
        from sqlalchemy import select
        from models.character import Character

        async with async_session() as db:
            result = await db.execute(select(Character).where(Character.id == character_id))
            char = result.scalar_one_or_none()
            if not char:
                await manager.send_to_user(user_id, _error("Charakter nicht gefunden"))
                return

            inv = _normalize_inv(char.basis_inventory)

            # Check player actually has the item
            found = False
            for it in inv.get("items", []):
                if (template_id and it.get("template_id") == template_id) or it.get("name") == item_name:
                    if it.get("quantity", 1) < quantity:
                        await manager.send_to_user(user_id, _error(
                            f"Nicht genug Gegenstände (vorhanden: {it.get('quantity', 1)})"
                        ))
                        return
                    found = True
                    sold_item_name = it.get("name", item_name)
                    break

            if not found:
                await manager.send_to_user(user_id, _error("Gegenstand nicht im Inventar"))
                return

            # Remove item
            remove_entry = {"template_id": template_id, "name": item_name, "quantity": quantity}
            inv = _inv_remove(inv, [remove_entry], None)

            # Add money
            if total_sell_k > 0:
                money = _from_kreuzer(total_sell_k)
                inv = _inv_add(inv, [], money)

            # Persist
            char.basis_inventory = inv
            await db.commit()

    # Optionally add item back to shop stock
    if payload.get("add_to_shop", True):
        existing = None
        for si in shop.get("items", []):
            if si.get("template_id") == template_id:
                existing = si
                break
        if existing and existing.get("stock") is not None:
            existing["stock"] = existing["stock"] + quantity
        # Don't add new items to shop catalog automatically — GM controls stock

    _bump_version(state)

    await manager.broadcast_to_room(session_code, _msg(EventType.SHOP_STATE, {
        "action": "sale",
        "shop": shop,
        "shops": state["shops"],
        "seller_character_id": character_id,
        "item_name": sold_item_name,
        "quantity": quantity,
        "sell_price_kreuzer": total_sell_k,
    }))
    await manager.broadcast_to_room(session_code, _msg("inventory_change", {
        "character_id": character_id,
        "basis_inventory": inv,
    }))
    await _append_session_log(
        session_code, "system",
        f"{sold_item_name} ×{quantity} verkauft an {shop.get('name', 'Händler')}",
        icon="shopping-cart",
    )
    await _snapshot_session_state(session_code)


def _format_price(purse: dict) -> str:
    """Format a purse dict as a readable German price string."""
    parts = []
    if purse.get("dukaten"):
        parts.append(f"{purse['dukaten']}D")
    if purse.get("silber"):
        parts.append(f"{purse['silber']}S")
    if purse.get("heller"):
        parts.append(f"{purse['heller']}H")
    if purse.get("kreuzer"):
        parts.append(f"{purse['kreuzer']}K")
    return " ".join(parts) if parts else "0K"


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
    """Called when a WebSocket drops — notify survivors and clean up pending actions."""
    state = _ensure_state(session_code)
    state["connected_users"] = manager.get_connected_users(session_code)

    msg = _msg(EventType.PLAYER_DISCONNECTED, {
        "user_id": user_id,
        "connected_users": state["connected_users"],
    })
    await manager.broadcast_to_room(session_code, msg)

    # Cancel any pending requests from this user (dice, probe, action) to prevent soft-locks
    pending = state.get("pending_requests", {})
    cancelled = [k for k, v in pending.items()
                 if v.get("from_user") == user_id or k.startswith(f"dice_{user_id}") or k.startswith(f"probe_{user_id}") or k.startswith(f"opposed_{user_id}")]
    for k in cancelled:
        del pending[k]

    # Cancel any opposed probes waiting on this user
    opposed = state.get("opposed_probes", {})
    opposed_to_remove = [pid for pid, p in opposed.items()
                         if p.get("initiator_id") == user_id or p.get("target_id") == user_id]
    for pid in opposed_to_remove:
        del opposed[pid]
    if opposed_to_remove:
        cancelled.extend(opposed_to_remove)

    # Notify GM with player name if the disconnected user had pending actions or is in combat
    if cancelled or _combat_snapshot(state) is not None:
        # Resolve a human-readable name for the disconnected player
        player_name = None
        combat = _combat_snapshot(state)
        if combat:
            for c in combat.get("initiative_order", []):
                if c.get("user_id") == user_id or c.get("userId") == user_id:
                    player_name = c.get("name")
                    break
        if not player_name:
            # Fallback: look up username from DB
            try:
                from database import async_session as _async_session
                from sqlalchemy import select as _sel
                from models.user import User as _User
                async with _async_session() as _db:
                    _r = await _db.execute(_sel(_User).where(_User.id == user_id))
                    _u = _r.scalar_one_or_none()
                    if _u:
                        player_name = _u.username
            except Exception:
                pass
        player_name = player_name or user_id[:8]

        if cancelled:
            await manager.broadcast_to_room(session_code, _msg(
                "combat_log_entry", {
                    "type": "system",
                    "text": f"{player_name} hat die Verbindung verloren — offene Aktionen abgebrochen.",
                },
            ), target="gm")
            logger.info("Cancelled %d pending requests for disconnected user %s in %s", len(cancelled), user_id, session_code)

        await _append_session_log(session_code, "system", f"{player_name} hat die Verbindung verloren", icon="wifi-off")

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
        "shops": state.get("shops", {}),
        "session_log": state.get("session_log", [])[-200:],
        "pending_requests": state.get("pending_requests", {}),
        "state_version": state.get("state_version", 0),
    })
