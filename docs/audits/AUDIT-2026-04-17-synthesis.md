# AUDIT — Synthesis — 2026-04-17

**Inputs:**
- `AUDIT-2026-04-17-claude.md` — Claude independent pass (8 HIGH / 10 MEDIUM / 5 LOW)
- `AUDIT-2026-04-17-codex.md` — Codex independent pass (6 HIGH / 11 MEDIUM / 4 LOW)

Both reviewers had the same brief and ran without access to each other's output. Findings below are cross-referenced by root cause, not by review order.

## Context caveat

Aventuria VTT is a personal, vibecoded tool used by one gaming group. Many findings below would be HIGH on a public SaaS product and are less urgent here. The synthesis reflects severity **for this project's actual use** (trusted group, not-yet-public deployment), not severity in the abstract. Where Claude and Codex disagreed on severity, the synthesis picks the one that matches the impact in context and notes the disagreement.

---

## 1. Findings BOTH caught (highest confidence)

### S1 — WebSocket endpoint has no authentication [HIGH]
**Root cause:** `backend/main.py:87-113` / `backend/ws/manager.py:44-50`. `user_id`, `role`, `session_code` are query-string params; never validated against a JWT. First connector as `role=gm` becomes the GM.
- Claude HIGH #1 — emphasises impersonation + GM-command exposure.
- Codex HIGH #1 & #5 — split into "WS auth absent" + "GM authority claim-based".

**Agreed fix:** require a signed JWT on the WS handshake; resolve user server-side; derive GM status from the authenticated session record, not the query param.

### S2 — No character-ownership check on WS mutations [HIGH]
**Root cause:** Player handlers (`vitals_update`, `conditions_update`, `schip_use`, `buff_*`, `shop_buy/sell`, more) trust `payload.character_id` without verifying it belongs to the sender.
- Claude HIGH #2 — general pattern.
- Codex HIGH #3 & HIGH #4 — split into vitals/conditions + buffs.

**Agreed fix:** resolve `user_id → owned_character_ids` at WS connect time; gate every mutable player-originated event; allow GM to bypass.

### S3 — Backend rules engine is effectively empty [HIGH ↔ MEDIUM disagreement]
**Root cause:** `backend/engine/` contains only `leveling.py`. All combat/condition/buff/maneuver logic lives in `frontend/src/engine/*.js`. Server is a relay.
- Claude HIGH #3 — "server is a relay; every rule fix in JS is advisory."
- Codex MEDIUM — same finding, categorised under tech debt.

**Synthesis:** HIGH. For this project, the critical consequence is **inconsistent state between clients on reconnect** (reconnecting client sees server's snapshot, which bypassed the JS stacking rule). Cheating-resistance argument is moot for a private group, but functional divergence is real. Paired with S1/S2, the fix is to either (a) port the critical engine modules to Python or (b) explicitly document the server as a trust-the-client relay and stop claiming otherwise in SPEC/CLAUDE.

### S4 — Condition stacking source rule only enforced in JS [HIGH ↔ MEDIUM disagreement]
**Root cause:** Magical vs physical stacking (highest-wins for magic, accumulate for physical) lives only in `frontend/src/engine/conditionsEngine.js`. Backend persists `{name, level}` without `source`. Reconnect clients get the wrong state.
- Claude HIGH #4 — functional divergence between in-session and reconnect.
- Codex MEDIUM — same finding, slightly lower severity framing.

**Synthesis:** HIGH. Special case of S3 but with a concrete reproducible failure mode.

### S5 — Manöver combination rule unsupported in UI [HIGH ↔ MEDIUM disagreement]
**Root cause:** UI text claims "Max 1 Basismanöver + 1 Spezialmanöver" but picker is single-select.
- Claude HIGH #6 — UI promises, doesn't deliver.
- Codex MEDIUM — same observation.

**Synthesis:** MEDIUM. This is a missing feature / UX mismatch, not a correctness bug — the current implementation is safe, just incomplete. The promise in the UI label is the real bug; either fix the feature or fix the label.

### S6 — Spell Zauberdauer / interruption semantics not implemented [MEDIUM]
**Root cause:** Multi-action spells take N of caster's actions; defending interrupts the spell. UI shows Zauberdauer, nothing enforces it.
- Both: MEDIUM.

**Agreed fix:** either implement (pending_spell on combatant, decrement per turn, drop on defense) or document explicitly in GOTCHAS as a deliberate simplification.

### S7 — Gap detection has no event replay / state-version bumping is incomplete [MEDIUM]
**Root cause:** Related but distinct issues in the same system.
- Claude MEDIUM — `sync_request` returns current state only; missed combat-log entries are lost.
- Codex MEDIUM — many state mutations don't call `_bump_version(state)`, so gaps go undetected in the first place.

**Synthesis:** Combine. Two halves of one feature. Fix order: first fix all missed `_bump_version` calls (Codex), then add event replay or explicitly scope gap recovery to "current state only" (Claude).

### S8 — Inventory scoping wrong in combat computation [MEDIUM]
**Root cause:** `frontend/src/engine/combatComputation.js:43-45` reads `basis_inventory` instead of campaign/session inventory (violates the project's own SSOT rule).
- Codex MEDIUM.
- Claude didn't flag this specifically, but the underlying S3 critique covers it structurally.

**Agreed fix:** feed combat computation from campaign/session inventory snapshots.

### S9 — `safeData.js` bypassed in core views [MEDIUM]
**Root cause:** Several views still read `current_vitals`, `derived_values`, `conditions` raw.
- Claude MEDIUM — `PlayerOverview.jsx:165-167,342`, `GMCockpit.jsx:838`.
- Codex MEDIUM — `PlayerDashboard.jsx:182-190,295`, `useGMSession.js:66-76`.

**Agreed fix:** route every read through `safeData`; add a simple lint rule or PR check.

### S10 — Test credentials hard-coded in seed [MEDIUM ↔ HIGH disagreement]
**Root cause:** `gm@test.de/test1234` + 4 players in `seed.py`. Published in README.md. Logged in plaintext by the seeder.
- Claude HIGH #8 — dangerous because `ENV=production` doesn't currently refuse `SEED_TEST_USERS=true`.
- Codex MEDIUM — a misconfigured public deploy is the risk.

**Synthesis:** HIGH. Claude is right — the seed gate (added earlier this session) checks only the `SEED_TEST_USERS` flag, not whether `ENV=production`. Easy to misconfigure. Fix: seed refuses test users whenever `ENV=production`, regardless of the flag.

### S11 — Dead Table View plumbing remains [MEDIUM ↔ LOW disagreement]
**Root cause:** `/table/:code` redirects away and the directories are empty, but `isTableView`, `room_tables`, `target="table"`, `target="gm_table"`, `sessionStore.isTableView` still exist.
- Claude MEDIUM — #13.
- Codex LOW.

**Synthesis:** LOW. Cosmetic + dead-code; no incorrect behaviour.

### S12 — Automated test coverage is minimal [LOW]
Both caught. No pytest suite; only Playwright `.mjs` scripts. Engine modules are pure functions — perfect fit for unit tests. Highest-value untested paths: `leveling.py`, `conditionsEngine.js` (source-stacking, pain level, incapacitation short-circuit), `combatComputation.js`.

---

## 2. Claude-only findings

### C1 — Manöver -2 SF penalty is not applied [HIGH]
Wuchtschlag/Finte/Meisterparade without the matching SF should be an extra -2. Not enforced anywhere. Non-specialist combatants materially over-perform.

### C2 — `buff_applied` payload mismatch [HIGH]
Backend broadcasts `{"buff": {...expires_at, stat, value}}`; frontend reads `payload.expires_at` / `payload.stat` / `payload.value`. Result: every WS-received buff has `expiresAt: undefined`; `isBuffActive()` returns false. Optimistic local buffs work; buffs visible to other clients or after reconnect do not.

### C3 — Snapshot debounce is leading-edge only; last mutation in a burst can be lost [MEDIUM]
After a burst of vitals updates, the final state is never persisted until the next unrelated mutation. Also SPEC says 5s, code is 2s (doc drift).

### C4 — DLQ / per-character locks are in-memory only [MEDIUM]
Dead-letter queue wiped on restart; `_character_locks` accumulates one Lock per character forever.

### C5 — CORS `allow_methods=["*"]` + `allow_credentials=True` [MEDIUM]
Permissive pairing. Fix: enumerate methods + headers explicitly.

### C6 — Wiki API endpoints entirely unauthenticated [MEDIUM]
`/api/wiki/*` has no `Depends(get_current_user)`. Likely intentional for reference data, but worth confirming.

### C7 — 16 uses of deprecated `datetime.utcnow()` [MEDIUM]
Mix of naive + aware datetimes across modules.

### C8 — `_is_current_turn` compares user_id against characterId [MEDIUM]
Category-error fallback on `backend/ws/handlers.py:688`. Edge-case "not your turn" false positives/negatives.

### C9 — `BuffPill` spawns one setInterval per buff per render [MEDIUM]
Mild CPU/battery cost on phones during combat. Fix: one shared 1 Hz tick in parent.

### C10 — `handlers.py` is a 3,391-line monolith [LOW]
Split into per-domain handler files.

### C11 — Stale SQLite files in `backend/` [LOW]
`app.db`, `aventuria.db`, `aventuria_vtt.db`, `.bak`, `-shm`, `-wal` — none tracked but confusing to new contributors.

### C12 — `ROADMAP.md` Current Milestone is empty [LOW]
Reads as abandoned; actually pending user decision. Cosmetic.

### C13 — Double `import math` in `backend/api/characters.py` [LOW]

### C14 — `_handle_session_end` cleanup race [LOW]
Clear `_session_state[code]` synchronously after broadcast; in-flight handlers may recreate empty state. Mark ended; clean up after delay.

### C15 — Wiki search is unbounded/unindexed [LOW]
`ilike '%term%'` across 8 tables, no FTS, mild DoS on public deploys.

---

## 3. Codex-only findings

### X1 — Player defense flow broken by event-name drift [HIGH]
Frontend sends `type: 'defense_result'`, backend handles only `defense_choice`. Reactions + SchiP defense handling can be silently dropped.

### X2 — Auth inputs barely validated, no brute-force controls [MEDIUM]
Unconstrained username/password length on register; unlimited login attempts. Claude caught the no-rate-limit half; Codex caught the input-validation half.

### X3 — JWTs stored in `localStorage` → XSS = full account compromise [MEDIUM]
Move to `HttpOnly` cookies.

### X4 — SchiP usages deduct without applying the effect [MEDIUM]
Only `defense_boost` writes a state flag; `halve_damage`, `ignore_condition`, `additional_reaction` are logged but not applied. Either implement or remove from UI.

### X5 — Reconnect logic is half-wired [MEDIUM]
`handle_reconnect()` exists in `handlers.py:3330-3351` but `main.py:97-101` always calls `handle_connect()`. The `player_reconnected` path is dead code.

### X6 — `sessionStore.joinSession()` is stale/dead [LOW]
Frontend posts `/api/sessions/${code}/join` with `{role}` but backend exposes `/api/sessions/join` with code+character. Probably dead.

---

## 4. Genuine disagreements (escalate or accept)

- **Severity on S3 / S4 / S10** — resolved above (HIGH wins).
- **Severity on S5 / S11** — resolved above (MEDIUM and LOW respectively).
- No open disagreements left to escalate.

---

## 5. Promotion plan (to ROADMAP.md)

Mapping to priority:

| From | Title | Priority |
|---|---|---|
| S1 | WebSocket handshake auth (JWT on connect, server-derived user + GM) | P1 |
| S2 | Character-ownership checks on WS mutations | P1 |
| S10 | Seed test-users refuse when `ENV=production` regardless of flag | P1 |
| S3 | Decide rules-engine policy: port critical modules to Python OR correct the SPEC/CLAUDE claim | P1 |
| C1 | Apply Manöver -2 SF penalty when the SF is missing | P1 |
| C2 | Fix `buff_applied` payload read (frontend reads `payload.buff.*`) | P1 |
| X1 | Align player defense event name (`defense_result` vs `defense_choice`) | P1 |
| S4 | Condition stacking `source` enforced on server side (follows from S3) | P2 |
| S5 | Manöver combination UI (1 Basis + 1 Spezial) or trim the label | P2 |
| S6 | Zauberdauer interruption enforcement or explicit GOTCHAS note | P2 |
| S7 | `_bump_version` on every state mutation + event replay (or scope-limit gap recovery) | P2 |
| S8 | Combat computation reads campaign/session inventory, not basis_inventory | P2 |
| S9 | safeData.js adoption in remaining raw-access sites | P2 |
| C3 | Snapshot debounce trailing-edge retry + doc drift fix (2s vs 5s) | P2 |
| C4 | Persist DLQ to Redis when available; sweep `_character_locks` on session close | P2 |
| C5 | Enumerate CORS methods and headers explicitly | P2 |
| C7 | Replace `datetime.utcnow()` with `datetime.now(timezone.utc)` | P2 |
| C8 | Fix `_is_current_turn` ID comparison | P2 |
| X2 | Input validation on register/login + login rate limit | P2 |
| X3 | Move JWT from localStorage to HttpOnly cookie | P2 |
| X4 | Either implement SchiP effects or remove unsupported options from UI | P2 |
| X5 | Wire `handle_reconnect()` — detect reconnects in `main.py` | P2 |
| S11 | Remove dead Table View plumbing (routes, hooks, stores, backend targets) | P3 |
| S12 | Pytest bootstrap + engine unit tests (highest-value paths) | P3 |
| C6 | Audit / document wiki endpoint authz (public-by-design or add auth) | P3 |
| C9 | BuffPill shared tick | P3 |
| C10 | Split handlers.py into per-domain modules | P3 |
| C11 | Delete stale `backend/*.db*` files from working copy | P3 |
| C12 | ROADMAP Current Milestone — fill or state "Maintenance/open backlog" explicitly | P3 |
| C13 | Remove duplicate `import math` | P3 |
| C14 | `_handle_session_end` grace period before state cleanup | P3 |
| C15 | Rate-limit wiki search + min query length 3 | P3 |
| X6 | Delete or repair `sessionStore.joinSession()` | P3 |

All agreed P1 items become the starting backlog for the next milestone cycle. Pick one to run as the Current Milestone.
