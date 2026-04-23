# Drop Campaigns — Design

**Date:** 2026-04-17
**GitHub issue:** [#1](https://github.com/alpenmilch411/AventuriaVTT/issues/1)
**Milestone:** Session 19 (P1 — Security / correctness blocker)
**Status:** v5 — Codex rounds 1-5 complete. Round 5 returned zero HIGH + zero MEDIUM findings; one LOW (handler-name correction) applied. Awaiting user approval.

## 0. Changelog

**v1:** Initial spec.

**v2 — fixes Codex round 1 (4 HIGH):**
- Auth-bypass location corrected: `PATCH /vitals`, `PATCH /conditions`, `POST /death`, `_verify_character_access()` + `execute_exchange()` in inventory (not `GET/PUT/DELETE` on characters, which were already owner-only).
- `/loot-award` REST endpoint dropped; session-end loot goes through WS `_handle_session_end` + new `_persist_loot_awards`.
- Auth narrowings deferred to issues #2 and #3 (strip bypass blocks, owner-only + TODO, don't design a parallel auth model).
- Migration is dialect-branched (SQLite rebuild / Postgres CASCADE). FK-holder columns drop before campaign tables.
- Commits merged to 6 (eliminated loot-award commit; models+migration+seed atomic).
- E2E test breakage listed.

**v5 — fixes Codex round 4 (1 HIGH, 2 MEDIUM):**
- `execute_exchange()` self-exchange hole: if `from_character_id == to_character_id`, the endpoint loads the same Character twice, mutates both "sides" independently, commits — can duplicate or corrupt inventory. v5 adds an explicit guard: `if body.from_character_id == body.to_character_id: raise HTTPException(400, "Cannot exchange with self")`. Mirrored on the WS `_execute_exchange` handler (`ws/handlers.py:2556`).
- §3.6 / changelog claim about WS trade flow "having its own consent mechanism" softened. The WS trade handler forwards payloads with minimal ownership checks; it's a legacy GM-mediated flow. Hardening it is out of scope here and shouldn't be cited as authorization replacement.
- §5 Commit 4 bullet for `execute_exchange()` was stale (still said "owner-of-from_char only"). Aligned with §2.4 + §3.6 (both-sides-owned + self-exchange rejection).

**v4 — fixes Codex round 3 (1 HIGH, 3 MEDIUM, 0 LOW):**
- `execute_exchange()` two-sided-trade hole: one-sided narrowing to `from_char.user_id == current_user.id` still permits attacker to drain assets from a `to_char` they don't own via `to_items`/`to_money`. v4 tightens: `from_char.user_id == current_user.id` AND `to_char.user_id == current_user.id` (same owner both sides — no GM-of-campaign fallback, no cross-owner trades via REST). Cross-owner trades continue via the existing WS trade flow (`TradeTab.jsx` + `trade_accept` WS handler), which has its own consent mechanism.
- §3.6 auth-regression list recalibrated: no live frontend callers remain after the narrowing. `useWebSocket.js:635` + `:640` are player-on-own-character (owner-only passes). `ProbeSetupPopup.jsx:378` targets a nonexistent route (pre-existing dead code). No frontend source calls `PATCH /vitals|/conditions` or `POST /death`. Regressions are limited to E2E test scripts (already covered in Commit 6) and out-of-band tooling.
- Frontend group-inventory cleanup expanded: `InventoryPanel.jsx` lines 355/367/379 call `/api/inventory/group/:campaignId*` and `PlayerDashboard.jsx:403` mounts a group-inventory block. Both stripped in Commit 2.
- SQLite rebuild uses `Table.to_metadata(MetaData(), name=tmp_name)` to produce a proper named Table, avoiding SQL string surgery.

**v3 — fixes Codex round 2 (2 HIGH, 5 MEDIUM, 2 LOW):**
- `_persist_loot_awards` must broadcast `inventory_change` per affected character (existing WS event shape `{ character_id, inventory }`). Without it, connected clients don't see loot until refetch.
- SQLite rebuild uses `PRAGMA defer_foreign_keys=ON` (transaction-safe), not `PRAGMA foreign_keys=OFF` (which is a no-op inside an open transaction). Migration runs inside `init_db()`'s `engine.begin()` — can't open a sideband connection.
- Migration builds `CREATE TABLE` statements via SQLAlchemy reflection of the live post-rip model metadata (`from sqlalchemy.schema import CreateTable; str(CreateTable(NewTable))`), not hand-written SQL. Avoids schema drift.
- Pydantic schemas `SessionResponse.campaign_id` (`api/sessions.py:163`) and `InventoryItemResponse.campaign_id` (`api/inventory.py:28`) stripped in addition to ORM fields.
- `_verify_character_access()` consumer audit added: per-endpoint migrate/defer decisions. Two REST paths are still active in live session flow (`useWebSocket.js:635`, `ProbeSetupPopup.jsx:378`) — their breakage is acknowledged, acceptable.
- `_handle_scene_activate` at `handlers.py:1298` references `session_obj.campaign_id` — Commit 3 must land before Commit 5 (explicit dependency now called out).
- `SessionEndPanel` loot UI contract tightened: zero initial rows, `+` adds blank row, empty names and `quantity <= 0` stripped pre-dispatch, duplicates merge client-side per character.
- Loot payload validation in `_persist_loot_awards`: reject non-dict rows, trim names, coerce quantity to positive int, log-and-skip malformed entries.
- SQLite version note replaced with verified procedure risk framing.

## 1. Goal

Remove Campaign / CampaignPlayer / Quest / LoreEntry / TimelineEvent / Group / GroupMember / GroupInventory end-to-end. Make `GameSession` the only user-facing unit. These tables carry zero real data (`lore=0`, `quests=0`, `group_inventories=0`). The frontend UI around them is either dead or broken (phantom REST calls that 404 silently, phantom item-reward UI that never renders). SPEC promises features the code never delivered.

After this milestone:
- GMs create sessions directly; players join by code.
- "Campaign" concepts (persistent story arc, shared inventory across sessions, GM-of-campaign authorization) are gone.
- `SEED_TEST_USERS=1` gives a ready-to-run demo `GameSession`.
- Session-end loot distribution goes through WS (`_handle_session_end` → `_persist_loot_awards`), consistent with how AP awards already work.

## 2. Scope

### 2.1 Full-file deletions (6 files)

| File | Lines |
|---|---|
| `backend/api/campaigns.py` | 1,166 |
| `backend/models/campaign.py` | 338 |
| `frontend/src/stores/campaignStore.js` | 129 |
| `frontend/src/views/gm/GroupInventoryPanel.jsx` | 247 |
| `frontend/src/views/gm/QuestSessionTab.jsx` | 591 (replaced by `SessionEndPanel.jsx` ~240 lines) |
| `frontend/src/views/auth/CampaignManager.jsx` | 289 (dead file, no importers) |

### 2.2 Database tables dropped (8)

`campaigns`, `campaign_players`, `quests`, `lore_entries`, `timeline_events`, `groups`, `group_members`, `group_inventories`.

### 2.3 Columns dropped (2)

`game_sessions.campaign_id`, `inventory_items.campaign_id`.

### 2.4 Code removed / narrowed in existing files

**Backend — REST:**

- `api/__init__.py` — campaigns router import + registration.
- `api/sessions.py`:
  - `SessionResponse` Pydantic schema (line 159-174): remove `campaign_id: Optional[str] = None` field.
  - `complete_session()` (line 513): strip `CampaignPlayer.campaign_snapshot` write block (~lines 547, 586-604).
  - Response builders: strip `campaign_id=session.campaign_id` from all `SessionResponse(...)` constructor call sites (verify count during implementation — approx 5-7 sites at lines 163, 259, 383, 454, 629, 738, 776).
- `api/inventory.py`:
  - `InventoryItemResponse` Pydantic schema (line 25-36): remove `campaign_id: Optional[str] = None` field.
  - `get_inventory()` item dict build (line 175-189): remove `"campaign_id": it.campaign_id` line.
  - Delete `GroupInventoryResponse`, `get_group_inventory` (GET `/api/inventory/group/:campaign_id`), `move_group_item` (POST `/api/inventory/group/:campaign_id/move`) (~150 lines).
  - `_verify_character_access()` (line 118): remove `from models.campaign import Campaign, CampaignPlayer` + campaign-GM bypass. Narrow to owner-only. Add `# TODO(#2/#3): GM mid-session auth via SessionPlayer membership`.
  - `execute_exchange()` (line 635): strip `CampaignPlayer`/`Campaign` query + `is_gm` flag (lines 658-669). Narrow to **`from_char.user_id == current_user.id` AND `to_char.user_id == current_user.id`** (same owner both sides). **Also reject self-exchange early:** `if body.from_character_id == body.to_character_id: raise HTTPException(400, "Cannot exchange with self")`. Single-owner REST transfers only. Cross-owner trades route through the legacy GM-mediated WS trade flow (hardening that flow is out of scope — see §3.6).

**Backend — WS (mirror):**

- `ws/handlers.py` `_execute_exchange` (line 2556) — the WS-side sibling of the REST `execute_exchange`. Currently trusts the GM user_id from the WS connection with zero ownership checks. **Add the same self-exchange guard:** `if from_char_id == to_char_id: await manager.send_to_user(gm_user_id, _error("Cannot exchange with self")); return`. The broader WS trust issue (GM can move items between arbitrary characters) is not fixed here — that's issue #3's scope.
- `api/characters.py`:
  - `PATCH /api/characters/:id/vitals` (line 842): strip bypass block at ~line 866. Owner-only + TODO(#2/#3).
  - `PATCH /api/characters/:id/conditions` (line 904): strip bypass block at ~line 918. Owner-only + TODO.
  - `POST /api/characters/:id/death` (line 1080): strip bypass block at ~line 1097. Owner-only + TODO.

**Backend — WS:**

- `ws/handlers.py`:
  - Delete `_handle_scene_activate` (1285-1322), `_handle_quest_update` (1950-1969), `_handle_lore_reveal` (1972-1985). **Note:** `_handle_scene_activate` references `session_obj.campaign_id` at line 1298 — this handler MUST be deleted (Commit 3) before Commit 5 removes the `GameSession.campaign_id` field.
  - Dispatch table: drop `EventType.SCENE_ACTIVATE`, `QUEST_UPDATE`, `LORE_REVEAL` entries (~lines 755, 770-771).
  - `_ensure_state()` (lines 201-226): remove `active_scene`, `tokens`, `quests`, `lore_entries` keys.
  - `SYNC_FULL` payload (lines 3383-3402): remove the same four fields.
  - `_handle_session_end` (line 2061): extend to accept `payload.loot`. Call new `_persist_loot_awards(session_code, loot)` in parallel with existing `_persist_ap_awards`.
  - **New function `_persist_loot_awards(session_code, loot)`** — see §2.5.
- `ws/events.py` — drop `SCENE_ACTIVATE`, `QUEST_UPDATE`, `LORE_REVEAL` from `EventType`.

**Backend — models:**

- `models/__init__.py` — drop the campaign-module import block + 7 `__all__` entries.
- `models/user.py` — drop `gm_campaigns`, `campaign_players`, `created_groups`, `group_memberships` relationships.
- `models/character.py` — drop `campaign_players` relationship.
- `models/session_state.py`:
  - Drop `GameSession.campaign_id` field + `campaign` relationship.
  - Update `SessionLog.entry_type` comment: remove `"scene" | "lore" | "quest"` → `"combat" | "probe" | "whisper" | "system"`.
- `models/inventory.py`:
  - Drop `InventoryItem.campaign_id` field + `campaign` relationship.
  - Delete entire `GroupInventory` class.

**Backend — seed:**

- `databank/seed.py`:
  - Drop `from models.campaign import Campaign, CampaignPlayer, Group, GroupMember` (line 53).
  - Replace `_create_test_campaign()` with `_create_test_session()` (creates demo `GameSession` in lobby + 4 `SessionPlayer` rows).
  - Drop Group/GroupMember seed rows.
  - Update log messages.

**Frontend:**

- `hooks/useWebSocket.js` — ~10 `useCampaignStore.getState()` sites: scene/quest/lore dispatch deleted; `time_advance`/`weather_change`/`rest_end`/`sync_full` redirected to `sessionStore`.
- `hooks/useGMSession.js`, `useGameState.js` — drop `useCampaignStore` imports.
- `hooks/useGMPopups.js` — drop `showGroupInventory`/`setShowGroupInventory`; add `showSessionEnd`/`setShowSessionEnd`.
- `stores/authStore.js` — drop `useCampaignStore.reset()` call in `logout()`.
- `stores/characterStore.js` — drop `/api/campaigns/:id/characters` fetch path.
- `views/gm/GMCockpit.jsx` — drop `GroupInventoryPanel` import/button/modal; rename `showQuests` → `showSessionEnd`, target `SessionEndPanel`.
- `views/gm/SessionControls.jsx`, `views/player/PlayerDashboard.jsx` — redirect `weather`/`worldClock` selectors to `sessionStore`.
- `views/player/InventoryPanel.jsx` — remove lines 355, 367, 379 (`/api/inventory/group/:campaignId*` calls) and the surrounding group-inventory block. Drop `campaignId` prop dependency.
- `views/player/PlayerDashboard.jsx` (~line 403) — remove the `<GroupInventory*>` mount in the player dashboard render tree.

### 2.5 New code

#### 2.5.1 WS loot persistence (Commit 1)

**`_handle_session_end` payload extension:**

```json
{
  "message": "Session beendet...",
  "awards": [{ "character_id": "...", "amount": 10, "reason": "..." }],
  "loot":   [{ "character_id": "...", "items": [{ "name": "Heiltrank", "quantity": 2, "template_id": "..." }] }]
}
```

Both `awards` and `loot` are optional. Backward-compatible with payloads that omit `loot`.

**`_persist_loot_awards(session_code: str, loot: list) -> None`** (new, added to `handlers.py`, mirrors `_persist_ap_awards` at line 449):

1. Input validation (log-and-skip on malformed entries; don't fail the batch):
   - `loot = loot or []`; skip if empty.
   - Each row: require `dict` type with `character_id: str` and `items: list`.
   - Each item: require `dict` with `name: str` (after `.strip()`, must be non-empty) and `quantity: int` (coerce, require `> 0`). Optional `template_id: str`.
2. Resolve session via `GameSession.session_code == session_code`; log-and-return if not found.
3. For each loot row, per-character asyncio lock (`_get_char_lock(character_id)`):
   - Load `Character` (skip if not found).
   - Normalize `basis_inventory` shape (dict-with-items vs. bare list — helper `_normalize_inv` already exists in `api/inventory.py:671`, or inline the logic).
   - For each item: stack quantity if same `name` (+ same `template_id` if present) exists; else append.
   - Write back in the same shape the character originally had.
   - Commit within the lock.
4. **Broadcast `inventory_change`** per affected character after commit (not per item — one message per character). Payload: `{ character_id, inventory: <new basis_inventory> }`. Use `manager.broadcast_to_room(session_code, msg)`. This matches the existing `inventory_change` handler at `frontend/src/hooks/useWebSocket.js:465` which updates `characterStore.myCharacter.basis_inventory` and the GM's `allCharacters[id].basis_inventory`.
5. Do NOT bump `state_version` — session is ending, gap-detection is not relevant.

**`_handle_session_end` additions:**

- After `_persist_ap_awards` call, also call `_persist_loot_awards(session_code, payload.get("loot") or [])`.
- Order: loot before session_end broadcast (same order as awards today — persist, then notify). Actually AP uses a background task; loot should too: `_safe_create_task(_persist_loot_awards(session_code, loot), name=f"persist_loot_{session_code}")`.

#### 2.5.2 `SessionEndPanel.jsx` (Commit 2)

**Contract:**

- Props: `{ sessionId, players, sendMessage, onClose }`.
- State:
  - `apRewards: { [characterId]: { base, quest, bonus } }` — defaults `{ base: 10, quest: 0, bonus: 0 }` initialized from `players` on open. User edits inputs. Same layout as current `QuestSessionTab` lines 380-408.
  - `lootRows: { [characterId]: Array<{ name: string, quantity: number }> }` — **starts empty per character**. A `+` button per-character appends `{ name: "", quantity: 1 }`. An `x` button on each row removes it.
  - `dispatched: boolean` — set `true` after button click, shows confirmation screen, disables re-dispatch.

- Dispatch handler:
  1. Build `awards = [{ character_id, amount: base+quest+bonus, reason: "Session: ..." }]` filtering `amount > 0`.
  2. Build `loot` per character: filter out rows with empty `name.trim()` or `quantity <= 0`. Merge duplicate `name.trim()` entries (sum quantities). Skip characters with no valid rows. Shape: `[{ character_id, items: [{ name, quantity }] }]`.
  3. `sendMessage({ type: "session_end", payload: { message: "Session beendet!", awards, loot } })`.
  4. `setDispatched(true)`. Confirmation renders: "Session beendet. AP + Loot verteilt." + Schliessen button.

- No `fetch()` calls. All persistence via WS.

#### 2.5.3 `sessionStore` additions (Commit 2)

```js
// new fields
weather: 'klar',
worldClock: { date: '1. Praios 1040 BF', time: '12:00', dayNight: 'day' },
restResults: null,

// new actions
setWeather: (weather) => set({ weather }),
setWorldClock: (clock) => set({ worldClock: clock }),
setRestResults: (results) => set({ restResults: results }),
```

`sessionStore.reset()` clears these three back to defaults.

#### 2.5.4 Migration (Commit 5)

See §4 — dialect-branched, SQLAlchemy-reflection-based.

#### 2.5.5 Seed (Commit 5)

`_create_test_session()` in `backend/databank/seed.py`. Creates demo `GameSession` (`session_code="ORKTURM-42"`, `status="lobby"`) + 4 `SessionPlayer` rows (one per `playerN@test.de`).

### 2.6 Net code change

- Deleted: ~2,760 lines (full files) + ~520 lines (partial — includes Pydantic schema updates, per-endpoint bypass strips, response builder cleanup)
- Added: ~330 lines (WS loot persistence + validation + broadcast, SessionEndPanel with loot UI, sessionStore extensions, migration, seed, E2E test updates)
- **Net: ~2,950 lines removed** (~5.4% of total source; ~12% of backend).

## 3. Architectural decisions

### 3.1 GroupInventory — deleted

No working add-item flow (phantom backend endpoint), give-to-player flow rarely used. Delete entirely. Group loot handled GM-side through character inventory transfers. (Unchanged since v1.)

### 3.2 QuestSessionTab — extract session-end; loot UI is NEW

`SessionEndPanel.jsx` replaces `QuestSessionTab.jsx` but is not a simple extraction:
- AP reward UI: carried over.
- Loot UI: **new work** — current `QuestSessionTab` has `itemRewards` state but no UI populates it.
- Persistence: **new** — WS `session_end` payload carries `loot`; backend `_persist_loot_awards` writes to `basis_inventory` and broadcasts `inventory_change`. Current code attempts REST PUTs that 404 silently.

### 3.3 Group / GroupMember / TimelineEvent — deleted

Orphaned dead code after Campaign goes. (Unchanged since v1.)

### 3.4 `campaign_id` columns — dropped via SQLite rebuild / Postgres CASCADE

SQLite needs the rebuild pattern (indexed + FK column). Migration uses `PRAGMA defer_foreign_keys=ON` (transaction-safe) and builds new tables via SQLAlchemy reflection. See §4.

### 3.5 Test-user seed — new demo `GameSession`

`SEED_TEST_USERS=1` → 5 users + 5 characters + 1 demo `GameSession` (lobby) + 4 `SessionPlayer` rows. (Unchanged since v1.)

### 3.6 Auth narrowings deferred to issues #2 + #3

Don't design a parallel auth model in this milestone. Strip campaign-GM bypass blocks and replace with owner-only + `# TODO(#2/#3)`. Per-endpoint disposition:

| Endpoint | Bypass-removal effect on live session flow |
|---|---|
| `PATCH /api/characters/:id/vitals` | **No live frontend caller.** WS `vitals_update` is the real mid-session path. E2E test scripts break (covered in Commit 6). |
| `PATCH /api/characters/:id/conditions` | **No live frontend caller.** Same as vitals. |
| `POST /api/characters/:id/death` | **No live frontend caller.** |
| `_verify_character_access()` gating `GET/POST /api/inventory/:character_id/*` | **Owner-only is sufficient for all current frontend callers.** `useWebSocket.js:635` + `:640` are player-on-own-character (refetch + use-item). `ProbeSetupPopup.jsx:378` hits a nonexistent route (pre-existing dead code — flag for cleanup but not a narrowing-caused regression). No GM-on-other-player REST call sites in `frontend/src`. |
| `POST /api/inventory/execute-exchange` | Same-owner narrowing (both `from_char` and `to_char` owner-checked) + explicit self-exchange rejection closes the two-sided trade hole. Cross-owner trades route through the legacy GM-mediated WS trade flow (`TradeTab.jsx` + WS `trade_accept`). **That WS flow does not have hardened participant auth** — it forwards payloads with minimal ownership checks. Hardening it is explicitly out of scope for this milestone and is covered by issue #2 (WS handshake auth) + #3 (character-ownership WS checks). Do not cite the WS flow as an authorization replacement. |

**Material finding:** After recalibration, the narrowings have **zero impact on live frontend code paths**. The only regressions are in E2E test scripts (Commit 6 handles those) and out-of-band tooling. Issues #2 + #3 build session-membership-based GM primitives that replace all TODO markers.

### 3.7 Session-end flow — WS-only, with post-persist broadcast

- AP persistence: existing `_persist_ap_awards` (handlers.py:449). Unchanged.
- Loot persistence: new `_persist_loot_awards`. Shape-normalized merge into `basis_inventory`. Per-character asyncio lock.
- Live update: post-persist `inventory_change` broadcast per affected character. Frontend handler already exists (`useWebSocket.js:465`) — no new client code beyond the one in SessionEndPanel.
- Current REST phantoms (`/ap-award`, `/end`) disappear with `QuestSessionTab.jsx`.

### 3.8 PR structure — single PR, 6 ordered commits

(Unchanged structure from v2.)

### 3.9 SPEC §11 phase archive — historical note, no rewrite

(Unchanged since v1.)

## 4. Data Model + Migration

### 4.1 Why the SQLite path is tricky

- `_migrate_*` functions run inside `init_db()`'s `engine.begin()` (open transaction).
- **`PRAGMA foreign_keys=OFF` is a no-op inside an open SQLite transaction.** Must use `PRAGMA defer_foreign_keys=ON` instead — it's transaction-scoped and actually defers the FK check to commit time.
- `ALTER TABLE ... DROP COLUMN` doesn't work on indexed + FK-referenced columns in SQLite (even 3.35+).
- Table-rebuild pattern: create `*_new`, copy, drop old, rename. FK checks on commit must pass — so `*_new` must have the identical schema minus the dropped column, and all child-table FKs referencing the renamed table must still resolve (they do, because FK resolution is by name).

### 4.2 Migration function structure

```python
def _migrate_drop_campaign_tables(connection):
    """Drop Campaign/Group/Quest/Lore/Timeline tables and FK columns.

    Two-phase, FK-safe, idempotent.

    Phase 1: drop campaign_id columns on game_sessions and inventory_items.
      SQLite: table-rebuild via SQLAlchemy reflection of post-rip models.
      Postgres: ALTER TABLE ... DROP COLUMN CASCADE.
    Phase 2: drop campaign tables in FK-child-first order.

    Safe on fresh DB (nothing to drop). Safe to re-run.
    """
    from sqlalchemy import text, inspect
    from sqlalchemy.schema import CreateTable, CreateIndex

    insp = inspect(connection)
    existing_tables = set(insp.get_table_names())
    dialect = connection.engine.dialect.name  # "sqlite" | "postgresql"

    # --- Phase 1: drop campaign_id columns ---
    if dialect == "sqlite":
        # defer_foreign_keys=ON works inside open transactions, unlike foreign_keys
        connection.execute(text("PRAGMA defer_foreign_keys=ON"))

        for table_name, model_cls in [
            ("game_sessions", GameSession),   # imported from models.session_state
            ("inventory_items", InventoryItem),  # imported from models.inventory
        ]:
            if table_name not in existing_tables:
                continue
            cols = {c["name"] for c in insp.get_columns(table_name)}
            if "campaign_id" not in cols:
                continue
            _sqlite_table_rebuild_drop_col(connection, table_name, model_cls, "campaign_id")
    else:  # postgresql
        for table_name in ("game_sessions", "inventory_items"):
            if table_name not in existing_tables:
                continue
            cols = {c["name"] for c in insp.get_columns(table_name)}
            if "campaign_id" in cols:
                connection.execute(text(
                    f"ALTER TABLE {table_name} DROP COLUMN campaign_id CASCADE"
                ))

    # --- Phase 2: drop campaign tables ---
    drop_order = [
        "group_inventories", "campaign_players", "quests", "lore_entries",
        "timeline_events", "campaigns", "group_members", "groups",
    ]
    for tbl in drop_order:
        if tbl in existing_tables:
            connection.execute(text(f"DROP TABLE IF EXISTS {tbl}"))


def _sqlite_table_rebuild_drop_col(connection, old_table: str, model_cls, drop_col: str):
    """Rebuild a SQLite table without one column, using SQLAlchemy reflection
    of the current (post-rip) model's metadata to construct the new schema.

    Requires defer_foreign_keys=ON on the current transaction.
    Preserves all non-dropped columns, their defaults, nullability, indexes.
    No SQL string surgery — uses Table.to_metadata() to produce a properly
    named temp Table object.
    """
    from sqlalchemy import text, inspect, MetaData
    from sqlalchemy.schema import CreateTable, CreateIndex

    insp = inspect(connection)
    existing_cols = [c["name"] for c in insp.get_columns(old_table)]
    keep_cols = [c for c in existing_cols if c != drop_col]
    col_list_sql = ", ".join(keep_cols)

    # Build a proper temp-named Table from the current (post-field-removal) model.
    # to_metadata() produces a Table object bound to a fresh MetaData with the
    # given name — compiles cleanly, no string surgery needed.
    tmp_name = f"{old_table}__rebuild"
    tmp_metadata = MetaData()
    tmp_table = model_cls.__table__.to_metadata(tmp_metadata, name=tmp_name)

    connection.execute(CreateTable(tmp_table))
    connection.execute(text(
        f"INSERT INTO {tmp_name} ({col_list_sql}) SELECT {col_list_sql} FROM {old_table}"
    ))
    connection.execute(text(f"DROP TABLE {old_table}"))
    connection.execute(text(f"ALTER TABLE {tmp_name} RENAME TO {old_table}"))

    # Recreate indexes on the renamed table. Iterate indexes declared on the
    # original model (not the temp-metadata copy, which carries indexes against
    # the temp name). After the rename, the original index definitions resolve
    # against the now-renamed table.
    for idx in model_cls.__table__.indexes:
        try:
            connection.execute(CreateIndex(idx))
        except Exception:
            # Index may already exist on the rebuilt table if defer_foreign_keys
            # caused a retry; harmless.
            pass
```

**Notes:**

- `GameSession` and `InventoryItem` models are imported at the top of the migration. By Commit 5, these models no longer declare `campaign_id`, so `model_cls.__table__` reflects the post-rip schema. `CreateTable(new_table)` produces the correct CREATE SQL.
- `defer_foreign_keys=ON` makes the transient DROP TABLE + RENAME window acceptable (FK checks happen at commit).
- Indexes listed in `new_table.indexes` include all `__table_args__` Index() declarations on the model. `CreateIndex(idx)` produces the CREATE INDEX statement.
- Child tables (`session_players`, `combat_states`, `session_logs`, `ap_awards`, `session_feedback`, `session_statistics` — all FK `game_sessions.id`) are untouched. Their FK declarations reference the table by name `game_sessions`, which survives the rebuild via the rename.

### 4.3 Boot-safety invariants

- **Fresh DB:** Model metadata defines no `campaign_id`, no campaign tables. `create_all` skips them. Migration sees no tables to modify. No-op.
- **Existing dev DB:** Tables + columns exist. Migration runs Phase 1 (rebuild each target), Phase 2 (drops). FK-check at transaction commit passes because `defer_foreign_keys=ON` delayed checks until after the full migration completed with consistent schema.
- **Postgres:** Single-phase, `DROP COLUMN CASCADE` + `DROP TABLE IF EXISTS`. Simpler path.
- **Idempotence:** All `if table_name in existing_tables` + `if column in cols` guards.
- **CASCADE deletion:** All historical campaign/quest/lore/group data is irreversibly lost on migration run. User accepted (dev DB only).

## 5. Commit Plan

Six commits within a single PR. Each commit boots cleanly.

**Critical dependency:** Commit 3 must land before Commit 5 because `_handle_scene_activate` at `handlers.py:1298` reads `session_obj.campaign_id` — Commit 3 deletes the handler, then Commit 5 removes the column. Reversing the order would leave a dangling field access in a still-registered handler.

### Commit 1 — WS loot persistence (additive)

- Add `_persist_loot_awards()` in `ws/handlers.py` with validation + inventory_change broadcast (see §2.5.1).
- Extend `_handle_session_end` to schedule the loot task alongside `_persist_ap_awards`.
- No schema changes, no deletions.

**Boot check:** `uvicorn` starts. Send a `session_end` WS message with a `loot` payload via curl/manual. Target character's `basis_inventory` gets the items. Connected client receives `inventory_change` and UI updates live. Absence of `loot` field: backwards-compatible (no-op).

**Dispatch:** Sonnet 4.6 subagent — crisp spec, one file, ~60 lines.

### Commit 2 — Frontend rewire

- Add `weather`/`worldClock`/`restResults` to `sessionStore` (fields, setters, reset).
- Create `SessionEndPanel.jsx` (AP table + new loot UI per §2.5.2).
- Delete `GroupInventoryPanel.jsx`, `QuestSessionTab.jsx`, `CampaignManager.jsx`.
- Update `useWebSocket.js` (delete scene/quest/lore dispatch; redirect campaign-store sites to `sessionStore`).
- Update `useGMSession.js`, `useGMPopups.js`, `useGameState.js`, `authStore.js`, `characterStore.js`, `GMCockpit.jsx`, `SessionControls.jsx`, `PlayerDashboard.jsx`.
- Strip player-side group-inventory block: `views/player/InventoryPanel.jsx` remove the group-inventory fetch/render block (lines ~355, 367, 379); drop `campaignId` prop dependency. `views/player/PlayerDashboard.jsx` (~line 403) remove the group-inventory mount.
- `campaignStore.js` remains in tree (no imports); deleted in Commit 4.

**Boot check:** `npm run build` clean. Start backend (still campaign-aware but unused from frontend). Load demo session, change weather/time, end session with AP + loot. Player receives `inventory_change`, sees items appear live.

**Dispatch:** Opus inline (SessionEndPanel is novel). Mechanical cleanup (`useWebSocket.js` site-swaps) can split to Sonnet subagent if desired.

### Commit 3 — Backend WS handlers rip

- Delete `_handle_scene_activate`, `_handle_quest_update`, `_handle_lore_reveal`.
- Drop `SCENE_ACTIVATE`/`QUEST_UPDATE`/`LORE_REVEAL` from `EventType` + dispatch table.
- Strip `active_scene`/`tokens`/`quests`/`lore_entries` from `_ensure_state` + `SYNC_FULL` payload.
- Update `SessionLog.entry_type` comment.

**Boot check:** `uvicorn` starts, `/ws/ORKTURM-42` handshake succeeds, `sync_full` payload shape correct, no stale field references.

**Dispatch:** Sonnet 4.6 subagent.

### Commit 4 — Backend REST rip + auth narrowings

- Delete `backend/api/campaigns.py`.
- Drop campaigns_router in `api/__init__.py`.
- Delete `get_group_inventory`/`move_group_item`/`GroupInventoryResponse` in `api/inventory.py`.
- Strip `campaign_id` from `InventoryItemResponse` Pydantic schema.
- Remove `"campaign_id": it.campaign_id` from `get_inventory()` item dict.
- Narrow `_verify_character_access()`: remove campaign import + bypass; owner-only + TODO.
- Narrow REST `execute_exchange()`: strip lines 658-669. Require BOTH `from_char.user_id == current_user.id` AND `to_char.user_id == current_user.id`. Add early `if body.from_character_id == body.to_character_id: raise HTTPException(400, "Cannot exchange with self")`. TODO(#2/#3) marker.
- Add matching self-exchange guard to WS `_execute_exchange` (`ws/handlers.py:2556`): `if from_char_id == to_char_id: await manager.send_to_user(gm_user_id, _error("Cannot exchange with self")); return`.
- Narrow `PATCH /vitals`, `PATCH /conditions`, `POST /death` in `characters.py`: strip bypass blocks; owner-only + TODO.
- Strip `campaign_id` from `SessionResponse` Pydantic schema.
- Strip `CampaignPlayer.campaign_snapshot` write in `api/sessions.py:complete_session()`.
- Strip `campaign_id=session.campaign_id` from `SessionResponse(...)` call sites in `api/sessions.py`.
- Delete `frontend/src/stores/campaignStore.js` (dead after Commit 2).

**Boot check:** `uvicorn` starts. OpenAPI shows `/api/campaigns/*` gone, `/api/inventory/group/*` gone. Demo session runs end-to-end. Player inventory mutations via WS still work. `curl` with player token `PATCH /api/characters/<other-player-char>/vitals` → 403.

**Dispatch:** Opus inline for the narrowings (multiple endpoints, slight judgment); Sonnet subagent for the pure deletions.

### Commit 5 — Models + migration + seed (atomic)

- Delete `backend/models/campaign.py`.
- Update `backend/models/__init__.py`.
- Drop relationships: `User.gm_campaigns`, `User.campaign_players`, `User.created_groups`, `User.group_memberships`; `Character.campaign_players`; `GameSession.campaign`; `InventoryItem.campaign`.
- Remove `GameSession.campaign_id` field.
- Remove `InventoryItem.campaign_id` field.
- Delete `GroupInventory` class from `models/inventory.py`.
- Add `_migrate_drop_campaign_tables` + `_sqlite_table_rebuild_drop_col` in `database.py`; wire into `init_db()` after existing migrations.
- Rewrite `_create_test_campaign` → `_create_test_session` in `seed.py`. Drop Group/GroupMember seeds. Update callsite + log messages.

**Boot check:**
1. Fresh DB: `rm aventuria_vtt.db`, boot. Migration no-op. `.tables` shows no campaign tables, no campaign_id columns. FK check at boot clean.
2. Existing dev DB: boot. Migration logs rebuild + drops. Re-boot: no-op (idempotent).
3. `python -m databank.seed --seed-test-users` → demo `GameSession` (lobby) + 4 `SessionPlayer` rows.

**Dispatch:** Opus inline. Migration is subtle, model-integrity-sensitive.

### Commit 6 — E2E tests + docs

- **E2E test sweep** (6 files flagged by Codex): `test-battle-full.mjs`, `test-e2e-battle.mjs`, `test-equip-rules.mjs`, `test-full-session.mjs`, `test-integration-sim.mjs`, `test-playwright-session.mjs`. For each: audit for `/api/campaigns/*` or bypassed REST calls (`PATCH /vitals`, `PATCH /conditions`, `POST /death` with GM token). Migrate to WS-based flow, or delete if the test is aspirational scaffolding not in CI. `test-combat-sim.mjs` (CLAUDE.md's official playwright test) is unaffected per grep — verify.
- **Docs:** SPEC tombstones (§5.5.4, §7 scenes/quests/lore, §10.12), §11 historical note, §6 data model updates, §8 WS event table strip. CLAUDE.md drop Kampagnen-Inventar bullet. GOTCHAS.md rewrite or delete "snapshot vs base" entry. README.md sweep. ROADMAP.md move to Completed. DEVLOG.md Session 19 entry.
- **GH issue #1:** `gh issue close 1 --comment "..."`; PR body `Closes #1`.

**Boot check:** `grep -ri "campaign" SPEC.md CLAUDE.md GOTCHAS.md README.md` — zero surprise hits. Remaining E2E tests (not deleted) pass against rebuilt backend.

**Dispatch:** E2E sweep → Sonnet 4.6 subagent with per-file specs. Docs → inline or Sonnet depending on section.

## 6. End-to-end verification (PR-ready gate)

Run on a fresh clone:

1. `rm backend/aventuria_vtt.db && cd backend && python -m databank.seed --seed-test-users`
2. `uvicorn main:app` — clean startup; migration log shows drops on re-run against an existing DB.
3. `cd frontend && npm run build` — clean.
4. GM logs in (`gm@test.de`) → dashboard → click ORKTURM-42 → `/gm/ORKTURM-42`.
5. Player logs in (`player1@test.de`, separate browser) → `/play/ORKTURM-42`.
6. GM changes weather, advances time → player sees updates.
7. GM starts combat → defense flow → HP updates.
8. GM opens `SessionEndPanel` → awards 10 AP + "Heiltrank x2" + "Seil" to Player 1 → confirm.
9. Player 1 browser: sees `inventory_change` arrive, `basis_inventory` updates live; AP count updates after refetch.
10. Inspect DB: `ap_awards` table has record; Player 1's `basis_inventory` contains potion + rope.
11. `sqlite3 aventuria_vtt.db ".tables"` — no `campaign*`, `quest*`, `lore*`, `timeline*`, `group*`, `group_inventor*` tables.
12. `sqlite3 aventuria_vtt.db "PRAGMA table_info(game_sessions)" | grep campaign_id` — empty.
13. `sqlite3 aventuria_vtt.db "PRAGMA table_info(inventory_items)" | grep campaign_id` — empty.
14. `curl` with player token `PATCH /api/characters/<other-player-char>/vitals` → 403.
15. `npm run build` + remaining E2E tests pass.
16. GitHub issue #1 closed, PR body references `Closes #1`.

## 7. Known risks / call-outs

- **Dev DB wipe:** CASCADE drops erase historical campaign/quest/lore/group data.
- **Auth regressions (§3.6):** Narrowings have **zero live frontend-caller impact** after recalibration. Only E2E test scripts and out-of-band tooling are affected. Fixed by issues #2 + #3 in full generality.
- **Pre-existing broken REST call:** `ProbeSetupPopup.jsx:378` does `POST /api/inventory/:id` against a nonexistent route. Unrelated to campaigns but worth noting for cleanup — not in scope for this milestone, add a TODO comment or a ROADMAP P3 entry.
- **Migration correctness risk (replaces the naive "SQLite 3.35+" framing):** The SQLite rebuild relies on (a) `defer_foreign_keys=ON` being active inside the migration's transaction, and (b) `SQLAlchemy.CreateTable` producing a compilable CREATE statement that yields identical post-rebuild schema. Implementation plan must verify the rebuild procedure on a populated dev DB before merging. If the CreateTable-emitted SQL drifts from what `create_all` would produce fresh, FK checks at commit will fail.
- **Loot persistence async timing:** `_persist_loot_awards` runs as a background task (same pattern as `_persist_ap_awards`). The `session_end` broadcast fires immediately. If a player disconnects between broadcast and loot persistence completion, they won't receive the `inventory_change` — they'd need a refetch on next connect. Acceptable: session is ending, offline players fetch on next login.
- **Bundle size / LOC:** ~1,200 fewer frontend lines; ~1,800 fewer backend lines (net).

## 8. Out of scope

- WebSocket handshake auth (issue #2).
- Character-ownership checks on WS mutations (issue #3).
- Rules-engine policy decision (issue #4).
- Manöver values + SF rule (issue #5).
- GroupInventory resurrection as session-scoped feature (deferred).
- Party-roster feature (deferred).
- Template-based loot picker in SessionEndPanel (free-text matches current flow; deferred).
- GM-mid-session REST auth replacement (covered by #2 + #3).
