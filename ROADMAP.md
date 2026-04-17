# Aventuria VTT — Roadmap

> Active work only. The full historical phase checklist lives in `SPEC.md` Section 11 — don't duplicate it here. When a milestone completes, it drops off this file and its phase entry in SPEC.md Section 11 gets its `[x]`.

## Current Milestone

**Title:** _(none — set this at the start of the next session)_
**Goal:** _Ask the user: "What do you want to work on first?" and promote the chosen backlog item._
**Scope:** _Fill in after the user picks._
**Reference:** _SPEC.md section + any relevant DEVLOG entries or reports._

### Done when
- [ ] _(fill in once milestone is picked)_

## Backlog

Ordered by priority. P1 = must fix before any further public-facing feature work. P2 = fix next. P3 = polish / minor. Items tagged **[audit]** come from the 2026-04-17 independent Claude + Codex audits (see `docs/audits/AUDIT-2026-04-17-synthesis.md`). Promote the top P1 row to "Current Milestone" via `/log` when the current milestone closes.

### P1 — Security / correctness blockers

| Title | Goal | Source |
|--|--|--|
| **[audit] WebSocket handshake auth** | `/ws/{session_code}` takes `user_id` + `role` from query params with zero validation. Anyone claiming `role=gm` becomes GM. Fix: require a signed JWT on the WS handshake; resolve user server-side; derive GM status from the authenticated session membership record, not the client-supplied role. | Synthesis §S1 |
| **[audit] Character-ownership checks on WS mutations** | Player handlers (`vitals_update`, `conditions_update`, `schip_use`, `buff_*`, `shop_buy`, `shop_sell`) trust `payload.character_id` without verifying ownership. Any player can grief any other. Fix: resolve `user_id → owned_character_ids` at connect; gate every mutable player-originated event; GM bypass allowed. | Synthesis §S2 |
| **[audit] Seed test-users refuse when `ENV=production`** | Current gate checks only `SEED_TEST_USERS`; not `ENV`. One misconfiguration ships `gm@test.de/test1234` live. Fix: refuse `_create_test_accounts` when `ENV=production` regardless of the flag; log explicit warning. | Synthesis §S10 |
| **[audit] Rules-engine policy decision** | `backend/engine/` contains only `leveling.py`; all DSA5 rules live in JS. SPEC/CLAUDE claim a mirrored engine. Decide + execute: (a) port critical modules (conditionsEngine, combatComputation, combatManeuvers, buffSystem) to Python, or (b) update SPEC/CLAUDE/README to state the server is a trust-the-client relay. Either way, stop the false promise. | Synthesis §S3 |
| **[audit] Manöver -2 SF penalty** | Wuchtschlag/Finte/Meisterparade without the matching SF should be an additional -2 AT (or PA for Meisterparade). Not applied anywhere. Fix: look up SF possession in the maneuver-effect calculator; add -2 when missing. | Synthesis §C1 |
| **[audit] `buff_applied` payload read path** | Backend sends `payload.buff.expires_at/stat/value`; frontend reads `payload.expires_at/stat/value`. Every WS-received buff lands with `expiresAt: undefined` → immediately "inactive." Fix: read from `payload.buff` in `buff_applied` / `buff_edited` / `buff_removed` / `buff_expired`. | Synthesis §C2 |
| **[audit] Player defense event-name unification** | Frontend sends `type: 'defense_result'`; backend handles only `defense_choice`. Reactions + SchiP defense can be silently dropped. Fix: pick one name and align frontend + backend + handlers + tests. | Synthesis §X1 |

### P2 — Rules correctness, hardening, drift

| Title | Goal | Source |
|--|--|--|
| **[audit] Condition source metadata server-side** | `{name, level, source}` not just `{name, level}`. Enforce stacking (magical highest-wins, physical accumulates) on the server. Follows naturally from the S3 decision. | Synthesis §S4 |
| **[audit] Manöver combination UI (1 Basis + 1 Spezial)** | Either implement the combination picker or trim the misleading UI label on `TurnFlow.jsx:1732`. | Synthesis §S5 |
| **[audit] Zauberdauer / spell interruption** | Multi-action spells should consume N actions and be interrupted by defense. Either implement (`pending_spell` per combatant, decrement on turn, drop on `defense_choice`) or document explicitly in GOTCHAS as a deliberate simplification. | Synthesis §S6 |
| **[audit] `_bump_version` on all state mutations + replay or scope-limit gap recovery** | Many handlers mutate state without bumping the version, so gap detection misses things. Either replay events from a buffered log, or explicitly scope recovery to "current state only, log gaps not backfilled." | Synthesis §S7 |
| **[audit] Combat computation reads session inventory** | `combatComputation.js:43-45` reads `basis_inventory`; should use the campaign/session inventory snapshot. | Synthesis §S8 |
| **[audit] `safeData.js` adoption sweep** | Still-raw accesses in `PlayerDashboard.jsx`, `PlayerOverview.jsx`, `GMCockpit.jsx`, `useGMSession.js`. Route every read through `getConditions/getVitalsFrom/getMaxVitals`; consider a lint rule. | Synthesis §S9 |
| **[audit] Snapshot debounce trailing-edge retry + doc fix** | Leading-edge debounce loses the last mutation in a burst. Schedule a trailing `asyncio.call_later`, and fix SPEC's 5s claim vs code's 2s. | Synthesis §C3 |
| **[audit] DLQ + `_character_locks` lifecycle** | DLQ in-memory only (restart loses queued messages); `_character_locks` accumulates forever. Persist DLQ to Redis when `REDIS_URL` is set; sweep locks when the session is cleaned up. | Synthesis §C4 |
| **[audit] CORS methods + headers explicit** | `allow_methods=["*"]` / `allow_headers=["*"]` + `allow_credentials=True` is permissive. Enumerate methods + headers. | Synthesis §C5 |
| **[audit] `datetime.utcnow()` → `datetime.now(timezone.utc)`** | 16 sites across 6 files. Mixed naive+aware datetimes create subtle comparison bugs. One focused PR. | Synthesis §C7 |
| **[audit] `_is_current_turn` ID comparison fix** | `handlers.py:688` compares `user_id` against `characterId` (category error). Add `character_id` snake_case fallback and drop the bogus branch. | Synthesis §C8 |
| **[audit] Input validation + login rate limit** | Unconstrained username/password length on register; unlimited login attempts. Add length validation, slowapi (or fastapi-limiter) with 5/min/IP on `/api/auth/login`, per-WS message rate cap. | Synthesis §X2 |
| **[audit] JWT storage: localStorage → HttpOnly cookie** | Any XSS → full account compromise. Move session to HttpOnly cookie (+ CSRF token for state-changing REST). | Synthesis §X3 |
| **[audit] SchiP effects actually applied** | `halve_damage`, `ignore_condition`, `additional_reaction` are logged + deducted but don't affect combat. Either implement each effect end-to-end or remove unsupported options from the UI until backed. | Synthesis §X4 |
| **[audit] Wire `handle_reconnect()`** | `handle_reconnect()` is defined but `main.py:97-101` always calls `handle_connect()`. Detect reconnects in `main.py` and route through the dedicated path. | Synthesis §X5 |

### P3 — Polish / minor

| Title | Goal | Source |
|--|--|--|
| Guided combat flow (Basic complexity mode) | Step-by-step hints during combat for new GMs. Gate behind complexity level toggle. | §4 GM Cockpit / §10.10 Regelmodul |
| Session recap (AI-generated) | Backend API stub exists — wire Claude API, add UI. | §9.3 AI session recap |
| AI NPC dialog generation | Backend code exists, needs API key + live testing. | §9.2 AI NPC dialog |
| AI Import Portal (PDF upload → extraction) | Backend code exists, UI needs polish, Claude API not wired. | §9.1 AI Import |
| In-game time tracking UI | Backend handler `_handle_time_advance` exists, no frontend. | §10.2 Weather & Environment |
| Weather system UI | Backend handler `_handle_weather_change` exists, no frontend. | §10.2 Weather & Environment |
| Ranged reload tracking UI | Reload modifiers defined, no mid-combat reload state. | §4 Combat / §8 WebSocket |
| Mobile responsive header | General header needs mobile-first polish. | §5 Player Dashboard |
| Regelmodul-System (optional rules toggle) | Let GMs toggle optional DSA5 rules on/off per campaign. | §10.10 Regelmodul-System |
| Campaign achievements | Unlockable campaign-level achievements. | §10.12 Campaign Achievements |
| Complexity level switching (Basic/Standard/Advanced) | Progressive UI gating per §1.4 design principle 7. | §1.4 Core Principles / §10.10 |
| Culture metadata enrichment | Add common/uncommon adv/dis per culture (wizard guidance), commonNames, areaKnowledge. | §7 Databank |
| Curses / Elven Magical Songs / Magical Dances / Magical Melodies | Tradition-specific entity types from Optolith. | §7 Databank |
| Conditions/States from Optolith | Supplement conditionsEngine with Animosität, Berauscht, Trance, etc. | §7 Databank + engine/conditions |
| Icons and portraits | Visual asset pass on creatures / professions / species. | §7 Databank |
| **[audit] Remove dead Table View plumbing** | `isTableView`, `room_tables`, `target="table"`/`"gm_table"`, `sessionStore.isTableView`, `/table/:code` route. | Synthesis §S11 |
| **[audit] Pytest bootstrap + engine unit tests** | Add pytest + 30-50 focused tests on `leveling.py`, `conditionsEngine.js`, `combatComputation.js`, `combatManeuvers.js`. Also `vitest` on the frontend engine modules. | Synthesis §S12 |
| **[audit] Wiki endpoint authz — decide + document** | `/api/wiki/*` is unauthenticated. Intentional? Document explicitly or add auth. | Synthesis §C6 |
| **[audit] `BuffPill` shared 1 Hz tick** | Replace per-pill setInterval with one shared tick in the parent. | Synthesis §C9 |
| **[audit] Split `handlers.py` into per-domain modules** | 3,391-line monolith. Split `handlers/combat.py`, `handlers/inventory.py`, `handlers/social.py`, `handlers/lifecycle.py`. Centralise auth/halt gates at the dispatcher. | Synthesis §C10 |
| **[audit] Delete stale `backend/*.db*` files from working copy** | `app.db`, `aventuria.db`, `aventuria_vtt.db`, `.bak` / `-shm` / `-wal`. None tracked; confusing. | Synthesis §C11 |
| **[audit] ROADMAP Current Milestone policy** | Always fill or explicitly state "Maintenance / open backlog." Avoid the "abandoned" reading on public repo. | Synthesis §C12 |
| **[audit] Remove duplicate `import math`** | `backend/api/characters.py:49` redundant with the module-level import. | Synthesis §C13 |
| **[audit] `_handle_session_end` cleanup grace period** | Mark ended first, clean up after delay (e.g. 30 s), refuse mutations on ended sessions. | Synthesis §C14 |
| **[audit] Wiki search min length + rate limit** | `ilike '%term%'` across 8 tables. Bump min_length to 3; add rate limit; consider SQLite FTS5 if usage grows. | Synthesis §C15 |
| **[audit] `sessionStore.joinSession()` cleanup** | Frontend posts to `/api/sessions/${code}/join` with `{role}` but backend exposes `/api/sessions/join` with code+character. Looks dead. Delete or repair. | Synthesis §X6 |

## Completed Milestones

The full phase-by-phase history lives in `SPEC.md` Section 11 (Phase 1 MVP through Phase 5 Nice-to-Have). That section is append-only — when a milestone closes here, its `[x]` goes there, not in this file.

- **Session 15 (2026-03-28) — Character Creator UX + Combat Polish.** Full SchiP combat spending flow (SchipMenu, 4 usage types, backend validation, Protokoll logging, GM quick +/-). Combat polish: AP Award Victory Screen, CreatureEditModal (mid-combat NPC stat editing), player request withdraw. Character Creator UX overhaul: search/filter on cultures/professions/advantages/disadvantages, expandable descriptions, TipAbbr tooltips across all 10 steps, advantages/disadvantages wired into 14 derived-value effects, derivation breakdown popup, complete summary step (13 sections), auto-generated background story, beginner guidance badges. Formula fixes: AsP_max/KaP_max ceil(sum/2) per GRW. CRUD fixes: character delete actually deletes, character import accepts JSON, combat_techniques saved from wizard. 476 SA descriptions repaired. Iterative beginner+veteran testing: all 10 wizard steps rated 4-5/5.

- **Session 14 (2026-03-27) — Optolith Data Integration.** Multi-agent session, 12 agents across 4 teams. Built `backend/importers/optolith_converter.py` (1,148 lines) — reads Optolith v1.5.2 two-layer YAML into seed JSON. Data expansion 602 → 3,638 entities (6×): spells 30→332, liturgies 20→226, SAs 64→1,438, advantages 43→161, disadvantages 44→110, items 113→594, professions 46→180, weapons 245, armor 52, shields 15. Added CantripTemplate (97 Zaubertricks), BlessingTemplate (12 Segnungen), Spell/Liturgy Enhancements (1,623 upgrades), Spell Property/Merkmal, Profession Variants (56), Race Variants (Menschen 7 + Elfen 3). SA search/filter in CharacterCreator, full talent template lookup replacing hardcoded categories, backend-validated AP costs.

- **Session 13 (2026-03-27) — Architecture overhaul, buff system, character creation.** DB-ID inventory architecture (template_id + backend enrichment), shared combat computation (combatComputation.js), item classification by DB category (all regex deleted), buff system (active_buffs, WS handlers, timer UI, GM controls), structured item effects (28 items), combat items in TurnFlow, unified browser categories, seed data fixes (Zweihandhiebwaffen, umlauts, all 33 cultures + 46 professions filled), seed cross-reference validation, React infinite loop on combat start fixed. DSA5 rule fixes: AsP/KaP formula, 80 AP advantage cap, AT/PA split UI. Character viewer (9-tab read-only overlay). Advantages (43) + Disadvantages (44) DB models and wizard integration.

- **Session 12 (2026-03-26) — Characters tab: full stack build.** Characters management UI across dashboard + wizard + viewer + edit mode. Added full character lifecycle and editing flows.

- **Session 11 (2026-03-26) — Databank browser UX + full compatibility audit.** UX polish on databank navigation and cross-reference audits.

- **Session 10 (2026-03-26) — Databank UX overhaul.** Structured forms, inline expand, DSA5 abbreviation tooltips across databank views.

- **Session 9 — Battle system fixes.** Creature privacy, phone layout, maneuver values.

- **Session 8 — Architecture: Restart Resilience & Performance.** Backend restart recovery and performance pass.

- **Session 7 — Dead Code Removal (~40% of codebase).** Large cleanup pass.

- **Session 6 — Full Codebase Audit & Bug Fixes.** Audit pass with fixes across modules.

- **Session 5 — Live Sync, Data Safety & Deployment Prep.** SSOT refactor, per-character asyncio locks, server-side delta resolution, `safeData.js` utility, `ssot-lint.sh` hook, Protokoll deduplication.

- **Session 4 (2026-03-24) — Item System, Combat Maneuvers & Data Consistency.** All 13 Manöver with full modifier chains, item usage (potions, poisons, herbs, combat items, condition items), dual-wield combat, real-time inventory sync, centralized `useCombatValues` hook, equipment rules enforcement.

- **Session 3 (2026-03-23) — VitalsBar Redesign, Centralized Values & UX Polish.** VitalsBar redesign, centralized combat-value derivation, UX polish pass.

- **Session 2 (2026-03-23) — Deep Integration & Combat System.** Magie & Liturgien UI, inventory with transfers + equip + weight, NPC registry (personality, knowledge, secrets), encounter builder, map (walls/tokens/drag/zoom), HALT button, GM notification panel, loot distribution.

- **Session 1 (2026-03-22) — Full Implementation.** MVP complete: user accounts + JWT, character import (Optolith + DSA Ultimate), campaign + session creation, GM Cockpit + Player Dashboard, backend combat engine (AT/PA/AW, damage, conditions, Schmerz-Schwellen), probe resolution, Konva.js map, WebSocket realtime, Table View, initial databank (60 creatures + 42 weapons + 30 spells + 20 liturgies + 59 talents + 42 SFs + 36 rules), demo adventure with 10 scenes, test accounts.

- **Session 0 (2026-03-22) — Architecture & Design.** Initial SPEC.md, tech stack decisions, three-client-roles routing, DSA5 abbreviation conventions, vitals pattern, Zustand store layout.
