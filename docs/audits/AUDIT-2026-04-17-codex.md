# AUDIT — Codex pass — 2026-04-17

**Reviewer:** Codex (gpt-5.x via `codex-companion.mjs task`)
**Scope:** Holistic pass on `/Users/yannik/Projects/AventuriaVTT` — bugs, tech debt, inconsistencies, security drift. Codex had no access to Claude's independent pass; the two were run in parallel.
**Emphasis:** auth, DSA5 rules-engine drift, WebSocket trust boundaries, data-shape consistency, dead code, test coverage, public-repo hygiene.

---

## HIGH

- **WebSocket authentication is effectively absent.** `backend/main.py:87-101` accepts `user_id`, `role`, and `session_code` from query params and immediately calls `manager.connect()`, so any client can impersonate any user or the GM. Recommended fix: require a signed auth token on the WebSocket handshake, resolve the user server-side, and reject unauthenticated or unauthorized joins before `accept()`.

- **Session membership is never checked before full-state sync.** `backend/ws/handlers.py:721-723` serves `sync_request` blindly, and `backend/ws/handlers.py:3221-3241` sends `sync_full` on every connect without verifying the socket belongs to that session. Recommended fix: validate that the authenticated user is the GM, a joined player, or an allowed table-view identity before any sync or room registration.

- **Player WebSocket vitals/condition updates can target arbitrary characters.** `backend/ws/handlers.py:814-875` trusts `payload.character_id` for `vitals_update` and `conditions_update` and never checks that the sender owns that character. Recommended fix: enforce `character_id -> user_id` ownership or GM authority on every mutable player-originated WS message.

- **Buff mutations are open to any connected player.** `backend/ws/handlers.py:1128-1176` and `1220-1237` let non-GM clients apply, remove, and clear buffs for any `character_id`, then rebroadcast the result to the room. Recommended fix: restrict buff creation/removal to GM or character owner, and validate the target character against the sender.

- **GM authority is claim-based, not authenticated.** `backend/ws/manager.py:44-48` marks the GM purely from the claimed `role`, `_is_gm()` in `backend/ws/handlers.py:259-260` trusts that mapping, and `backend/ws/handlers.py:1240-1245` gives any "GM" arbitrary relay power. Recommended fix: derive GM status from the authenticated session record, not from client-supplied query params.

- **Player defense flow is broken by event-name drift.** `frontend/src/views/player/CombatActions.jsx:168-178` sends `type: 'defense_result'`, but the backend only handles `defense_choice` in `backend/ws/handlers.py:765-783` and `2156-2229`, so reactions and SchiP defense handling can be dropped silently. Recommended fix: unify on one event contract and add a regression test for player defense submission.

## MEDIUM

- **Auth inputs are barely validated and login has no brute-force controls.** `backend/api/auth.py:74-89` accepts unconstrained usernames/passwords and `backend/api/auth.py:119-152` exposes unlimited login attempts. Recommended fix: add length/complexity validation and rate-limit or lock out repeated failed logins.

- **JWTs are stored in `localStorage`.** `frontend/src/stores/authStore.js:10-14`, `29-35`, and `121-124` keep the bearer token in browser storage, making any XSS a full-account compromise. Recommended fix: move auth to secure `HttpOnly` cookies or another non-JS-readable session mechanism.

- **Public test credentials are weak and logged in plaintext.** `backend/databank/seed.py:380-431` seeds `gm@test.de` and four player accounts with `test1234`, and `backend/databank/seed.py:847-851` prints them again; `.env.example:29-30` documents the same credentials. Recommended fix: remove fixed public passwords, never log credentials, and require an explicit one-time dev bootstrap flow.

- **The backend "rules engine" no longer exists as a rules engine.** `backend/engine/__init__.py:7-15` exports only `leveling`, while combat/conditions/spell handling have drifted into `backend/ws/handlers.py` and the frontend engines. Recommended fix: re-centralize DSA5 mechanics into shared pure backend modules and make WS/UI layers consume them.

- **Condition source semantics are lost server-side, so magical vs physical stacking cannot be enforced.** `backend/models/character.py:69-72` persists only `[{name, level}]`, and `backend/ws/handlers.py:853-860` / `1067-1084` merge purely by condition name, while `frontend/src/engine/conditionsEngine.js:344-366` expects `source`. Recommended fix: persist condition source/duration metadata and move stacking logic into one shared backend implementation.

- **Maneuver-combination rules are documented but not representable in the UI.** `frontend/src/views/gm/TurnFlow.jsx:1732-1750` says "Max 1 Basismanöver + 1 Spezialmanöver" but only allows selecting a single maneuver object, and `frontend/src/engine/combatManeuvers.js:10-26` models maneuvers as mutually exclusive choices. Recommended fix: model basis and special maneuvers separately and validate legal combinations server-side.

- **Spell Zauberdauer/interruption semantics are not implemented.** `backend/ws/handlers.py:2379-2417` treats spell casting as an immediate relay/log event and does not track multi-action casting, interruptions, or action consumption. Recommended fix: add explicit casting state with remaining actions, interrupt rules, and round-based resolution on the backend.

- **Several SchiP usages deduct points without applying the actual rule effect.** `backend/ws/handlers.py:2267-2283` logs `halve_damage`, `ignore_condition`, and `additional_reaction`, but only `defense_boost` writes a state flag, and that flag is not consumed anywhere meaningful. Recommended fix: implement each SchiP effect end-to-end or remove unsupported options from the UI until backed by server logic.

- **State-version gap detection is incomplete because many state changes never bump the version.** `backend/ws/handlers.py:1673-1705`, `1016-1023`, and `2420-2452` mutate map/token state without `_bump_version(state)`, while the frontend relies on version gaps in `frontend/src/hooks/useWebSocket.js:47-54`. Recommended fix: bump `state_version` on every state mutation that can affect reconnect correctness.

- **Reconnect logic is only half wired.** `backend/ws/handlers.py:3330-3351` defines `handle_reconnect()`, but `backend/main.py:97-101` always calls `handle_connect()`, so reconnect-specific flows and `player_reconnected` semantics are dead code. Recommended fix: explicitly detect reconnects and route them through one tested reconnect path.

- **Session combat computations still read base inventory instead of campaign/session inventory.** `frontend/src/engine/combatComputation.js:43-45` derives equipped combat gear from `basis_inventory`, which conflicts with the repo's own session-inventory rule. Recommended fix: feed combat computation from campaign/session inventory snapshots during active play.

- **`safeData.js` exists, but core views still bypass it.** `frontend/src/views/player/PlayerDashboard.jsx:182-190,295`, `frontend/src/hooks/useGMSession.js:66-76`, and multiple other views still manually read `current_vitals`, `derived_values`, and `conditions`. Recommended fix: standardize all player/character reads on `getConditions()`, `getVitalsFrom()`, and `getMaxVitals()` and lint against raw access in session views.

## LOW

- **Table View cleanup is incomplete.** `frontend/src/router.jsx:39-43` redirects `/table/:sessionCode` away, but `frontend/src/hooks/useGMControls.js:108-111`, `frontend/src/stores/sessionStore.js:12-13,214-216`, and the README/SPEC still describe a living table client. Recommended fix: either restore a real table client or remove the remaining route/state/docs references.

- **`sessionStore.joinSession()` is stale and appears dead.** `frontend/src/stores/sessionStore.js:105-125` posts to `/api/sessions/${sessionCode}/join` with `{role}`, but the backend only exposes `POST /api/sessions/join` with code+character in `backend/api/sessions.py:646-689`. Recommended fix: delete the dead store action or update every caller to the current API contract.

- **Public-facing docs still describe a different product shape.** `SPEC.md:76,85,124-125` still says the repo is private and Table View is active, while `README.md:17-21,27-32` still implies PostgreSQL/Redis-only local setup despite `backend/config.py:14-21` supporting SQLite and in-memory fallbacks. (Partially resolved in the same session — README.md and SPEC.md §1-§3 rewritten before this audit was synthesized. Remaining: `/table/:code` leftover state/hooks.) Recommended fix: do a public-docs pass and align README/SPEC with the actual current repo.

- **Automated test coverage is too thin for the current risk profile.** `frontend/package.json:20-29` shows only Playwright dev deps, the repo contains only ad hoc frontend `.mjs` scripts, and there are no backend tests for auth, WS authz, or rules logic. Recommended fix: add pytest coverage for auth/session/WS handlers first, then snapshot tests around rules-engine cases and one WS reconnect/idempotency test suite.

---

**Top priority per Codex:** WebSocket trust boundary (first 5 HIGH findings), player defense event-name drift, rules-engine centralization gap. Codex did not implement any fixes.
