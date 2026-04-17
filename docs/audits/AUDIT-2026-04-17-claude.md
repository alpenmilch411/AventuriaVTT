# Aventuria VTT — Independent Audit (Claude pass)

Date: 2026-04-17
Reviewer: Claude (Opus 4.7, 1M context)
Scope: holistic review of bugs, tech debt, inconsistencies, security, accumulated drift across the whole repo.

Severity guide:
- **HIGH** — security exposure, data loss, or rule-engine error that breaks fairness in play.
- **MEDIUM** — wrong behavior, hidden bug, drift between layers, fixable without architectural change.
- **LOW** — polish, hygiene, documentation accuracy, dead code.

---

### [HIGH] WebSocket endpoint accepts unauthenticated `user_id` and `role` from query string
**File:** `backend/main.py:101-113`, `backend/ws/manager.py:47-50`
**Issue:** The `/ws/{session_code}` endpoint takes `user_id` and `role` as query parameters and passes them straight to `manager.connect`. There is no JWT verification, no token check, no validation that the claimed `user_id` matches the authenticated bearer. Whoever first connects with `role=gm` becomes the GM of that session in `manager.room_gms` and can issue every GM-only WS command. Any authenticated user can also impersonate any other player by passing their `user_id`.
**Impact:** Total auth bypass on the realtime layer. Anyone who can reach the websocket can read all session state, send GM commands, drain SchiP from any character, mutate vitals, fake dice results, etc. This is the single biggest issue in the repo and was not caught earlier because the REST layer is properly auth-gated.
**Fix:** Require a JWT in the WS handshake (e.g. `?token=<jwt>` or a subprotocol). Decode it with `python-jose`, derive the real `user_id` from `sub`, and check that the session/campaign membership matches before granting `role=gm`.

### [HIGH] No ownership check on WebSocket character mutations
**File:** `backend/ws/handlers.py:814-875` (`vitals_update`, `conditions_update`), `2232-2318` (`schip_use`), `2979-3091` (`shop_buy`), `3094-3200` (`shop_sell`)
**Issue:** Player handlers trust `payload.character_id` without verifying it belongs to the sending `user_id`. Any connected player can edit any other player's HP, SchiP, conditions, or buy/sell items from another player's purse. The only existing check is `_is_gm` for GM-restricted events; once the auth layer is fixed (HIGH above), this layer also needs the per-character ownership gate.
**Impact:** Even with proper JWT auth, one player can grief another by depleting LeP/SchiP, applying conditions, or emptying their purse via a shop. NPCs are also unprotected — a player can heal an enemy mid-combat.
**Fix:** Resolve `user_id` → owned `character_id` set at WS connect time (cache from `SessionPlayer`), then in each handler: `if not _is_gm(...) and cid not in owned_characters[user_id]: return _error(...)`.

### [HIGH] Backend rules engine is effectively empty — all combat math lives only in the browser
**File:** `backend/engine/__init__.py:11-15`, `backend/engine/leveling.py` (the only module), vs `frontend/src/engine/*.js` (~2,465 lines: combat computation, conditions, maneuvers, weapon properties, item effects, buffs, creature rules, critical tables)
**Issue:** SPEC.md / CLAUDE.md describe a mirrored DSA5 rules engine on both sides ("Pure-function modules in both `frontend/src/engine/` and `backend/engine/`"). Reality: backend/engine/ contains only `leveling.py` (AP cost tables). Conditions, combat values, weapon properties, maneuver penalties, reaction stacking, condition stacking rules — none of these exist on the server. The server is a relay that trusts whatever the client sends.
**Impact:** Any malicious client can claim an attack with arbitrary AT/PA/TP and the server has no way to validate. All "rule fixes" applied to the JS engine (Wundschwelle, condition stacking source rules, Handlungsunfähig at sum≥8, ceil((MU+IN+CH)/2) for AsP) are advisory — the server accepts whatever number reaches it. Drift between frontend behavior and authoritative truth is structurally unfixable without porting the engine. Calling `backend/engine/` "the rules engine" in SPEC/CLAUDE is misleading.
**Fix:** Either (a) port the critical rule modules (`conditionsEngine`, `combatComputation`, `combatManeuvers`, `buffSystem`) to Python and validate AT/damage/conditions on the server, or (b) update SPEC/CLAUDE/README to be honest that the server is a trust-the-client relay and DSA5 rules are GM-enforced via the cockpit UI only. The status quo is the worst of both worlds.

### [HIGH] Condition stacking source rule (magical vs physical) only enforced in JS, server-side `conditions_update` ignores `source`
**File:** `frontend/src/engine/conditionsEngine.js:340-366` (correct logic) vs `backend/ws/handlers.py:849-875` and `1064-1087`
**Issue:** GOTCHAS.md documents that magical condition sources don't stack (highest wins) and physical sources do. The frontend `addCondition()` implements this. Backend `conditions_update` and `condition_change` handlers store conditions as `{name, level}` only — no `source` field. They simply add or replace levels on `add_condition`, ignoring stacking rules entirely. A reconnecting client will see whatever the server happened to record.
**Impact:** Inconsistent condition levels between clients depending on which path applied them. Magical and physical Schmerz from different sources will silently double-stack on the server's snapshot, then get applied to a fresh client on reconnect, even though the in-session client showed the correct value. Combat fairness diverges.
**Fix:** Either propagate `source` through `conditions_update` payload and reuse the same stacking logic on both sides, or strip the source rule from the JS engine and treat it as a GM judgment call. (Per HIGH above, the real fix is a shared engine.)

### [HIGH] Manöver -2 SF penalty is not applied
**File:** `frontend/src/engine/combatManeuvers.js:13-16`, `frontend/src/views/gm/TurnFlow.jsx:1734-1746`
**Issue:** GOTCHAS.md states "Without the corresponding SF, Basismanöver (Wuchtschlag, Finte, Meisterparade) are an additional -2 harder." The maneuver definitions hard-code `atMod: -1` for Wuchtschlag I etc., and the maneuver picker in TurnFlow shows all Basismanöver to all combatants without checking SF possession or applying any extra -2. Spezialmanöver are SF-gated correctly, Basismanöver are not.
**Impact:** Players without "Wuchtschlag I" SF still get -1 AT / +1 TP instead of the correct -3 AT / +1 TP. Combat is materially easier for non-specialists than the rules allow.
**Fix:** In the maneuver-effect calculator, look up whether the actor has the matching SF; if not, add -2 to `atMod` (or add `paMod -2` for Meisterparade-style defensive maneuvers).

### [HIGH] Manöver combination limit (1 Basis + 1 Spezial per attack) is not enforced — only one maneuver can be picked at all
**File:** `frontend/src/views/gm/TurnFlow.jsx:1727-1776`
**Issue:** The maneuver step uses a single-select picker (`setSelectedManeuver(m); setStep('attack')`). There's no UI for combining one Basis + one Spezial as the rules permit. The UI text on line 1732 advertises the rule but the actual flow doesn't support it.
**Impact:** Players can never legally combine e.g. Wuchtschlag + Hammerschlag on the same attack, even though that's a legal DSA5 combination. The UI promises a feature it doesn't deliver, and skilled-character optimization is unavailable.
**Fix:** Allow selecting one Basis + one Spezial in the picker, sum the modifiers, and validate the no-Klingensturm-with-Vorstoß restriction.

### [HIGH] `buff_applied` payload mismatch: backend sends `payload.buff.expires_at`, frontend reads `payload.expires_at`
**File:** `backend/ws/handlers.py:1138-1156` vs `frontend/src/stores/characterStore.js:220-233`
**Issue:** Backend broadcasts `_msg("buff_applied", {"character_id": cid, "buff": buff, ...})` where `buff` is `{id, stat, value, expires_at, ...}`. The `handleCharacterMessage` `case 'buff_applied'` builds the local buff from `payload.expires_at`, `payload.stat`, `payload.value`, `payload.id` — all of which are `undefined` because the actual fields are nested under `payload.buff`.
**Impact:** Every buff received via WS lands in `activeBuffs` with `expiresAt: undefined`. `isBuffActive()` returns `undefined > Date.now()` → false, so server-confirmed buffs immediately appear inactive. Buffs applied locally (via `addBuff` from optimistic flow) work; buffs from other clients or after reconnect do not. Combat stat computation silently drops them.
**Fix:** Read from `payload.buff` in the `buff_applied` case. Same for `buff_edited`, `buff_removed`, `buff_expired`.

### [HIGH] Test account credentials and demo campaign code are committed in the public seed script
**File:** `backend/databank/seed.py:380-411` and `846-853`, `README.md:71-78`
**Issue:** `gm@test.de` / `test1234` and four player accounts are hard-coded in the seeder. README acknowledges "Never enable test users on a public deployment". But on a fresh public clone, an operator who runs `python -m databank.seed --seed-test-users` once for local testing and later flips `ENV=production` without wiping the DB will ship known credentials. There's also no idempotency check that refuses to seed test users when `ENV=production`.
**Impact:** A misconfigured deployment ships with five known logins (one is GM) and a known campaign code. This is one operator mistake away from total takeover.
**Fix:** Refuse to run `_create_test_accounts` when `ENV=production`, regardless of `SEED_TEST_USERS`. Log an explicit warning. Optionally generate per-install random passwords and print them once.

### [MEDIUM] No rate limiting on REST or WebSocket
**File:** `backend/main.py`, `backend/api/auth.py`, `backend/requirements.txt`
**Issue:** No rate-limit middleware (slowapi/fastapi-limiter) is installed. `/api/auth/login` is unrestricted — brute-forcing the bcrypt-hashed test passwords is trivial. The WebSocket has no per-connection or per-IP cap; one client can spam `vitals_update` to flood the broadcast pipeline.
**Impact:** Login brute force; trivial DoS on a public deployment by opening many WS connections or hammering `dice_result` floods to all rooms.
**Fix:** Add slowapi (or fastapi-limiter with Redis when REDIS_URL is set, in-memory fallback otherwise). At minimum: 5 login attempts/min/IP, and a per-WS message rate cap (e.g. 30 msg/s with burst).

### [MEDIUM] Snapshot debounce can permanently lose the last mutation in a burst
**File:** `backend/ws/handlers.py:80-123`
**Issue:** `_snapshot_session_state` is leading-edge debounced — if it was called <2s ago, the new call returns immediately. There is no trailing-edge retry. After a burst of vitals updates, the final state of the burst may never be persisted until *another* mutation comes in later.
**Impact:** Server restart between bursts loses the last few seconds of session state. SPEC.md also says the debounce is 5s — actual code is 2s. Documentation drift.
**Fix:** Schedule a trailing snapshot (`asyncio.call_later`) when a call is suppressed, cancelling+rescheduling on each subsequent call. Update SPEC to match (or restore 5s and accept the slightly higher data-loss window).

### [MEDIUM] WebSocket dead-letter queue and per-character locks are in-memory only — restart loses queued messages and the locks dict grows unbounded
**File:** `backend/ws/manager.py:31-33,132-147`, `backend/ws/handlers.py:31-38, 65-69`
**Issue:** `_dead_letters` is a dict that's wiped on restart; any queued messages for offline players are lost. `_character_locks` is created lazily and never cleaned (the comment says "they're cheap" — they accumulate one Lock object per character ever touched, across the lifetime of the process).
**Impact:** Dead-letter resilience promises in SPEC don't survive a backend restart. The lock dict will grow to thousands of entries on a long-running process; not catastrophic but a small leak that violates the cleanup model used for `_session_state`.
**Fix:** Persist DLQ to Redis when REDIS_URL is set; sweep `_character_locks` when their session is cleaned up (track which session each character belongs to).

### [MEDIUM] CORS configured for `*` methods/headers with `allow_credentials=True`
**File:** `backend/main.py:35-41`
**Issue:** `allow_origins` is locked to `CORS_ORIGINS` (good), but `allow_methods=["*"]` and `allow_headers=["*"]` combined with `allow_credentials=True` is permissive. Per the FastAPI/Starlette docs and CORS spec, when credentials are enabled, the response actually echoes one origin, but the wildcard methods/headers still mean any auth-bearing request from the configured origin is accepted regardless of method.
**Impact:** Low risk while the only origin is `http://localhost:5173`, but in production this lets any new HTTP method ride through middleware additions without explicit thought.
**Fix:** Enumerate methods explicitly (`["GET", "POST", "PUT", "DELETE", "PATCH"]`) and headers (`["Authorization", "Content-Type"]`).

### [MEDIUM] Wiki API endpoints are entirely unauthenticated
**File:** `backend/api/wiki.py:87-182`
**Issue:** `GET /api/wiki/pages`, `GET /api/wiki/pages/{slug}`, `GET /api/wiki/search` have no `Depends(get_current_user)`. Anyone can list, fetch, or search wiki content without an account.
**Impact:** Likely intentional (DSA5 reference data is public and the wiki probably doesn't contain campaign secrets), but worth confirming. The DB-side search also matches creature/weapon/spell names — if any user-contributed entries leak personal text, they'd be enumerable by anonymous users.
**Fix:** Either add `Depends(get_current_user)` for consistency with the rest of the API, or document explicitly that `/api/wiki/*` is intentionally public.

### [MEDIUM] Empty `views/table` and `views/prep` directories suggest dead-code cleanup is incomplete
**File:** `frontend/src/views/table/` (empty), `frontend/src/views/prep/` (empty), `frontend/src/hooks/useWebSocket.js:17, 987, 1038` (`isTableView` plumbing), `backend/ws/manager.py:23, 49-50, 88-90, 107-110` (table-view broadcast targeting)
**Issue:** ROADMAP/CLAUDE describe table view as removed, the route in `router.jsx:41-43` redirects `/table/...` to `/dashboard`, and the directories are empty — but the supporting plumbing on both sides is still wired up. `isTableView` is sent on WS connect, the manager tracks `room_tables`, and `target="table"` and `target="gm_table"` broadcast paths still exist in `handle_message`.
**Impact:** Dead code; reads as a feature that exists but never fires. New contributors will be confused. Unused targeting branches in `broadcast_to_room` increase the surface to maintain.
**Fix:** Remove `isTableView` from `useWebSocket`, drop the `is_table_view` query param in `main.py`, delete `room_tables` and the `table` / `gm_table` branches in `manager.py`, drop the empty directories, and remove the legacy `/table/:sessionCode` route.

### [MEDIUM] Multi-action spell `Zauberdauer` is displayed but not enforced
**File:** `frontend/src/views/player/SpellBook.jsx:306` (label only); no enforcement anywhere; backend `_handle_spell_cast` (handlers.py:2379-2417) is fire-and-forget
**Issue:** Per GOTCHAS, multi-action spells take N of the caster's actions and are interrupted if the caster defends. The codebase only renders the Zauberdauer label on the spell card. There's no in-progress spell state on the caster, no interruption logic when they parry/dodge, no skip of subsequent action turns.
**Impact:** Long spells can be cast in a single round with full defense available, contrary to DSA5 rules. Combat balance for Magier characters tilts toward casters.
**Fix:** Track `pending_spell` per combatant in `combat` state, decrement remaining actions on each of their turns, drop the spell on `defense_choice`. Or document this as a deliberate simplification in GOTCHAS.

### [MEDIUM] `datetime.utcnow()` is deprecated in Python 3.12 and used in 16 places across the backend
**File:** `backend/ws/handlers.py` (7), `backend/api/campaigns.py` (4), `backend/api/sessions.py` (2), `backend/api/characters.py` (1), `backend/models/session_state.py` (1), `backend/ws/events.py` (1)
**Issue:** Python 3.12 deprecates `datetime.utcnow()` in favor of `datetime.now(timezone.utc)`. The codebase mixes both styles (auth.py correctly uses the timezone-aware variant). Currently emits `DeprecationWarning`; will start raising in a future Python release.
**Impact:** Currently warnings only. Mixed naive/aware datetimes can also bite when comparing or serializing (timestamps become inconsistent across modules).
**Fix:** Search-and-replace `datetime.utcnow()` → `datetime.now(timezone.utc)` and import `timezone` where needed. Best done in one focused PR with no other changes.

### [MEDIUM] `BuffPill` spawns one `setInterval` per active buff, per render, on every client
**File:** `frontend/src/components/common/ActiveBuffs.jsx:11-27`
**Issue:** Each rendered buff pill creates its own 1Hz timer. With several buffs across multiple combatants in a long session, dozens of timers run continuously. The cleanup is correct (returns `clearInterval`), but every effect re-creates the timer when the buff object identity changes (new array each WS message), causing a constant churn of interval registration during combat.
**Impact:** Mild CPU/UI thrash, especially noticeable on phones during dense combat. Battery cost on the player dashboard.
**Fix:** Use a single shared 1Hz tick (e.g. a `useState(now)` in the parent `ActiveBuffs` updated once per second) and have each pill compute its own remaining time from props. One timer per panel instead of per-buff.

### [MEDIUM] Frontend WS gap detection requests sync_full but server doesn't enforce a buffered replay
**File:** `frontend/src/hooks/useWebSocket.js:48-54`, `backend/ws/handlers.py:721-723, 3358-3391`
**Issue:** When the client detects a `state_version` gap, it sends `sync_request`; the server responds with the *current* full state. There's no event log replay — anything that happened *between* the last seen version and now (e.g. mid-combat dice results) is silently dropped, only the resulting state survives. Per-event timestamps in the dropped events are lost from logs.
**Impact:** The Protokoll on the recovering client will be missing entries from the gap window. Combat log entries from other players that triggered the gap will not appear.
**Fix:** Either (a) buffer recent broadcasts per session and replay events newer than the requesting client's `state_version`, or (b) document explicitly that gap recovery is "current state only, log gaps not backfilled".

### [MEDIUM] `_is_current_turn` matches on the wrong identity — compares user_id against characterId
**File:** `backend/ws/handlers.py:675-688`
**Issue:** The function checks if the active combatant's `user_id`/`userId` field equals the calling user. But the OR fallback on line 688 also checks `current.get("characterId") == user_id`, which is a category error (character UUIDs and user UUIDs are different ID spaces; this branch will never match correctly). Combined with the missing camelCase variant `current.get("character_id")`, edge cases of the initiative-order shape will silently fail the turn check.
**Impact:** Subtle bug — under one of the data shapes a player might be denied their action ("It is not your turn") even though it is, or vice versa, depending on what `combatants[]` came from. Very hard to repro without seeing the exact JSON.
**Fix:** Drop the `characterId == user_id` comparison. Add `character_id` (snake_case) as a fallback, but route through user_id for the actual check.

### [MEDIUM] Several character/player-shape access sites bypass `safeData` helpers
**File:** `frontend/src/views/gm/PlayerOverview.jsx:165-167, 342`, `frontend/src/views/gm/GMCockpit.jsx:838`
**Issue:** `safeData.js` exists specifically because conditions/vitals come in inconsistent shapes (object vs array, snake_case vs camelCase, top-level vs nested). Most call sites use `getConditions()/getVitalsFrom()/getMaxVitals()` correctly, but `PlayerOverview.jsx:165` reads `player.conditions.length` directly (this happens to be safe in current code because the parent normalises via `getConditions(...)` on line 45, but the contract is fragile and a future refactor that drops the normalisation will crash). `GMCockpit.jsx:838` reads `player.current_vitals || char.current_vitals` raw.
**Impact:** Mostly latent — works today by accident. Refactors are landmines.
**Fix:** Either route every read through `safeData`, or document that `PlayerOverview` builds a normalised player object once and pass that through everywhere downstream.

### [LOW] Backend ships four leftover SQLite database files not in git but living in `backend/`
**File:** `backend/app.db`, `backend/aventuria.db`, `backend/aventuria_vtt.db`, `backend/aventuria_vtt.db.bak` (also `backend/aventuria_vtt.db-shm`, `-wal`)
**Issue:** Repeated DB filenames suggest naming churn over time. None are tracked (`.gitignore` covers `*.db*`), but they live under the working copy and confuse new contributors about which file is the active one. The `.bak` is a stale backup.
**Impact:** Cosmetic / documentation. New devs run the wrong DB or commit the wrong one.
**Fix:** Delete the stale dbs from the working copy. Keep only one canonical filename and update README/CLAUDE if the project root db is the dev-default (currently `aventuria_vtt.db` exists in both root and `backend/`).

### [LOW] Wiki API search is unbounded and unindexed
**File:** `backend/api/wiki.py:130-182`
**Issue:** Each search query runs `ilike '%term%'` against `WikiPage.title`, `WikiPage.content`, plus 8 databank tables. SQLite has no full-text index on these. With a public anonymous search endpoint, a few users hammering search will spike CPU.
**Impact:** Mild DoS vector on public deployments. Not a security issue, but pairs badly with the no-rate-limit finding.
**Fix:** Add SQLite FTS5 virtual tables for wiki content, or at least add `LIMIT` and require min query length (already enforced as `min_length=1` — bump to 3). Combine with rate limiting.

### [LOW] `ws/handlers.py` is a 3,391-line monolith; difficult to navigate and audit
**File:** `backend/ws/handlers.py`
**Issue:** The single file contains in-memory state, snapshot persistence, deltas resolution, vitals/conditions/buffs handlers, combat handlers, trade/exchange flow, shop CRUD + buy/sell, character death, scene/quest/lore handlers, sync/connect/disconnect lifecycle. The dispatch in `handle_message` is a long if/elif chain with implicit fallthroughs and inconsistent permission checks (some inline `_is_gm`, some via the `gm_commands` dict, some none).
**Impact:** Every change touches a high-blast-radius file. New permission checks are easy to forget for a newly-added event.
**Fix:** Split into `handlers/combat.py`, `handlers/inventory.py`, `handlers/social.py` (whisper/lore/quest), `handlers/lifecycle.py`, etc. Centralise the auth/halt gates at the dispatcher level, not per-branch.

### [LOW] Test coverage is essentially zero for backend and engine code
**File:** `backend/` (no `tests/` dir, no pytest), `frontend/` (only `test-*.mjs` Playwright scripts)
**Issue:** README acknowledges this. Risk-prioritised highest-value untested paths:
1. `backend/engine/leveling.py` — AP cost tables and prerequisite validation; bugs here change character progression silently.
2. `backend/ws/handlers.py:_resolve_deltas`, `_handle_combat_next_turn`, `_handle_rest_end`, `_handle_schip_use`, `_handle_shop_buy/_sell` — all touch persistent state and are reachable from clients.
3. `frontend/src/engine/conditionsEngine.js:addCondition` (magical/physical source rule), `calculatePainLevel`, `getConditionModifier` (the -999 incapacitation short-circuit and Berauscht level2Extra are easy to break).
4. `frontend/src/engine/combatComputation.js` — derived AT/PA/AW with shield/BE/buff/condition stacks; refactors break combat displays silently.
**Impact:** Regressions land without warning. The Codex per-milestone reviews catch some, but unit tests would catch them earlier and document expected behaviour.
**Fix:** Add `pytest` to backend deps, write 30-50 focused unit tests for the engine modules listed above. Frontend: add `vitest` and unit-test the engine modules — they are pure functions, perfect for it.

### [LOW] `ROADMAP.md` "Current Milestone" is empty; current state is unclear from the file alone
**File:** `ROADMAP.md:5-13`
**Issue:** The Current Milestone block reads `_(none — set this at the start of the next session)_`, so a new contributor opening the repo can't see what's actively being worked on. The Backlog table is rich but the heading reads as if the project is paused.
**Impact:** Public-repo first-impression is "abandoned". The recent git log shows active work, so this is a doc lag, not a real status.
**Fix:** Either always have a current milestone filled in (or `Maintenance / open backlog` as an explicit value), or remove the section when no milestone is active and state that the next session will pick from the backlog.

### [LOW] `python -c 'import math'` is imported twice in `_recompute_derived`
**File:** `backend/api/characters.py:4, 49`
**Issue:** Module-level `import math` already exists at line 4. Line 49 has `import math` again *inside* the function body. Harmless but indicates the function was patched without checking imports.
**Impact:** Code smell; suggests other small inconsistencies elsewhere from incremental edits.
**Fix:** Drop the inner `import math`.

### [LOW] `_handle_session_end` cleans `_session_state` synchronously while clients may still receive the broadcast
**File:** `backend/ws/handlers.py:2036-2057`
**Issue:** After broadcasting `SESSION_END`, the handler immediately `_session_state.pop(session_code, None)`. Any in-flight handler that touches `_ensure_state` afterwards will recreate a fresh empty state for the same session_code, potentially racing with clients still draining their queues.
**Impact:** Edge-case state pollution if a player's `vitals_update` arrives microseconds after `session_end`. Rare but real.
**Fix:** Mark the session as ended in-place first (e.g. set a `_session_state[code]["ended"] = True`), have handlers refuse to mutate ended sessions, and clean up after a delay (e.g. 30s).

---

## Summary by severity

- **HIGH (8):** WS auth bypass, no character ownership check, empty backend rules engine, condition stacking source not enforced server-side, Manöver SF -2 penalty missing, Manöver combination not supported, buff_applied payload mismatch, test credentials hard-coded.
- **MEDIUM (10):** No rate limiting, snapshot debounce data loss, DLQ/locks not durable, CORS too permissive, wiki unauthenticated, dead `views/table`+`views/prep`, Zauberdauer not enforced, deprecated datetime.utcnow, BuffPill timer churn, gap detection has no replay, `_is_current_turn` ID confusion, raw player-shape reads bypass safeData (counted as one finding).
- **LOW (5):** Stale db files in backend/, unbounded wiki search, handlers.py monolith, no test coverage, ROADMAP empty milestone, double `import math`, session_state cleanup race.

The two structural issues that swallow most of the smaller ones are: **(1) the WS layer has no real auth and no per-character ownership checks**, and **(2) the "rules engine" only really exists in JS**. Almost every other rule-correctness finding becomes moot if both are addressed — and remains exploitable until they are. Recommend pursuing both in the next milestone cycle before further feature work.
