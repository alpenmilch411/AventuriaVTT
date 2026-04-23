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
| **[audit] Rules-engine policy decision** | `backend/engine/` contains only `leveling.py`; all DSA5 rules live in JS. SPEC/CLAUDE claim a mirrored engine. Decide + execute: (a) port critical modules (conditionsEngine, combatComputation, combatManeuvers, buffSystem) to Python, or (b) update SPEC/CLAUDE/README to state the server is a trust-the-client relay. Either way, stop the false promise. | Synthesis §S3 |
| **[audit] Manöver values + SF rule — needs balance sign-off** | Two bugs, one milestone. (a) Current Basismanöver modifiers in `combatManeuvers.js` diverge from canonical DSA5 (Wuchtschlag I is -2 AT / +2 TP in the Regelwerk, code has -1 AT / +1 TP; Finte defender penalty is -2/-4 PA canonically, code has -1/-2). (b) The optional "Manövern ohne Kampfsonderfertigkeit" rule doubles the AT penalty when the matching SF is missing; unimplemented. Fixing (a) + (b) together makes maneuvers significantly costlier for everyone and rebalances every existing combat mid-campaign. Scope: `frontend/src/engine/combatManeuvers.js`, `frontend/src/views/gm/TurnFlow.jsx` (5 atMod call sites), `frontend/src/views/gm/CombatOverlay.jsx` (player self-service flow also uses raw mods — Codex flagged this). Meisterparade is NOT in the Basismanöver family per canonical rules — don't lump it in. Do not implement silently; the balance impact needs explicit buy-in first. See GOTCHAS.md entry "Basismanöver values in this codebase diverge from canonical DSA5" for the full picture. | Synthesis §C1, Codex review 2026-04-17 |
| **Remove map feature end-to-end** | Map feature is half-built: `mapStore.js` + backend `_handle_token_spawn/remove/move` + WS events (`map_load`, `token_*`, `drawing_*`, `map_state_push`) exist, but no map rendering view and no Konva.js integration in the tree. SPEC describes it extensively (~143 mentions), overstating what's delivered. Rip it out. Scope: delete `mapStore.js`, remove mapStore imports in `authStore.js` / `useWebSocket.js` / `useGMSession.js` / `PlayerDashboard.jsx`, delete backend token/map WS handlers, remove map/token/drawing dispatch cases, strip SPEC map sections. Tracked as issue #6. | Session 18 audit |

### P2 — Rules correctness, hardening, drift

| Title | Goal | Source |
|--|--|--|
| **[audit] Condition source metadata server-side** | `{name, level, source}` not just `{name, level}`. Enforce stacking (magical highest-wins, physical accumulates) on the server. Follows naturally from the S3 decision. | Synthesis §S4 |
| **[audit] Manöver combination UI (1 Basis + 1 Spezial)** | Either implement the combination picker or trim the misleading UI label on `TurnFlow.jsx:1732`. | Synthesis §S5 |
| **[audit] `_bump_version` on all state mutations + replay or scope-limit gap recovery** | Many handlers mutate state without bumping the version, so gap detection misses things. Either replay events from a buffered log, or explicitly scope recovery to "current state only, log gaps not backfilled." | Synthesis §S7 |
| **[audit] Combat computation reads session inventory** | `combatComputation.js:43-45` reads `basis_inventory`; validate this is still the right source after the Drop-Campaigns milestone (2026-04-17) — with the two-tier snapshot gone, basis_inventory IS the single source, but audit that combatComputation handles live-during-session mutations correctly. | Synthesis §S8 |
| **[audit] DLQ + `_character_locks` lifecycle** | DLQ in-memory only (restart loses queued messages); `_character_locks` accumulates forever. Persist DLQ to Redis when `REDIS_URL` is set; sweep locks when the session is cleaned up. | Synthesis §C4 |
| **[audit] JWT storage: localStorage → HttpOnly cookie** | Any XSS → full account compromise. Move session to HttpOnly cookie (+ CSRF token for state-changing REST). | Synthesis §X3 |
| **[audit] SchiP effects actually applied** | `halve_damage`, `ignore_condition`, `additional_reaction` are logged + deducted but don't affect combat. Either implement each effect end-to-end or remove unsupported options from the UI until backed. | Synthesis §X4 |
| **Remove Story + Adventures from SPEC, delete adventures/ directory** | "Story" (21 SPEC mentions) has zero code references. "Adventures" (59 SPEC mentions) has an empty `adventures/` directory, no model, no imports. Aspirational SPEC prose that never landed as code. Rip from SPEC, remove empty dir. Docs-only milestone, no behavior change. Tracked as issue #7. | Session 18 audit |

### P3 — Polish / minor

| Title | Goal | Source |
|--|--|--|
| Guided combat flow (Basic complexity mode) | Step-by-step hints during combat for new GMs. Gate behind complexity level toggle. | §4 GM Cockpit / §10.10 Regelmodul |
| In-game time tracking UI | Backend handler `_handle_time_advance` exists, no frontend. | §10.2 Weather & Environment |
| Weather system UI | Backend handler `_handle_weather_change` exists, no frontend. | §10.2 Weather & Environment |
| Ranged reload tracking UI | Reload modifiers defined, no mid-combat reload state. | §4 Combat / §8 WebSocket |
| Mobile responsive header | General header needs mobile-first polish. | §5 Player Dashboard |
| Regelmodul-System (optional rules toggle) | Let GMs toggle optional DSA5 rules on/off per session. | §10.10 Regelmodul-System |
| Complexity level switching (Basic/Standard/Advanced) | Progressive UI gating per §1.4 design principle 7. | §1.4 Core Principles / §10.10 |
| Culture metadata enrichment | Add common/uncommon adv/dis per culture (wizard guidance), commonNames, areaKnowledge. | §7 Databank |
| Curses / Elven Magical Songs / Magical Dances / Magical Melodies | Tradition-specific entity types from Optolith. | §7 Databank |
| Conditions/States from Optolith | Supplement conditionsEngine with Animosität, Berauscht, Trance, etc. | §7 Databank + engine/conditions |
| Icons and portraits | Visual asset pass on creatures / professions / species. | §7 Databank |
| **[audit] Pytest bootstrap + engine unit tests** | Add pytest + 30-50 focused tests on `leveling.py`, `conditionsEngine.js`, `combatComputation.js`, `combatManeuvers.js`. Also `vitest` on the frontend engine modules. | Synthesis §S12 |
| **[audit] Wiki endpoint authz — decide + document** | `/api/wiki/*` is unauthenticated. Intentional? Document explicitly or add auth. | Synthesis §C6 |
| **[audit] Split `handlers.py` into per-domain modules** | 3,391-line monolith. Split `handlers/combat.py`, `handlers/inventory.py`, `handlers/social.py`, `handlers/lifecycle.py`. Centralise auth/halt gates at the dispatcher. | Synthesis §C10 |

## Completed Milestones

The full phase-by-phase history lives in `SPEC.md` Section 11 (Phase 1 MVP through Phase 5 Nice-to-Have). That section is append-only — when a milestone closes here, its `[x]` goes there, not in this file.

- **Session 19 (2026-04-17) — Drop Campaigns: sessions become the only user-facing unit (issue #1).** 6 commits on branch `issue-1-drop-campaigns`. Removed Campaign / CampaignPlayer / Quest / LoreEntry / TimelineEvent / Group / GroupMember / GroupInventory end-to-end — models, `/api/campaigns/*` REST surface, scene/quest/lore WS handlers, campaignStore + QuestTab + LoreTab + GroupInventoryPanel frontend components. ~2,940 lines net removed. New session-end flow: SessionEndPanel (GM cockpit) emits `session_end` WS with `awards` + `loot`; backend `_persist_loot_awards` writes AP to `ap_awards` and appends to `characters.basis_inventory`, broadcasting `inventory_change` for live player updates. Replaced phantom REST session-end path. Migration drops 8 tables + 2 FK columns (`game_sessions.campaign_id`, `inventory_items.campaign_id`) — SQLite rebuild via `PRAGMA defer_foreign_keys=ON` + `Table.to_metadata()`, Postgres via CASCADE drop. Auth narrowings deferred to issues #2 (owner-only WS gate) + #3 (REST PATCH ownership) — TODO markers in place; mid-session REST character mutation now returns 403 (expected regression). 5 rounds of Codex review on the spec before coding; 4-6 rounds per commit during implementation. E2E test sweep: 6 stale `.mjs` scripts deleted (test-battle-full, test-e2e-battle, test-equip-rules, test-full-session, test-integration-sim, test-playwright-session) — none CI-run, all referenced removed campaign endpoints. Doc sweep: SPEC.md §5.5.4/§6.3/§6.4/§6.6/§6.7/§6.8/§10.12 tombstoned; §6.1/§6.2/§6.5/§6.9/§6.11/§6.12/§6.13/§6.14 rewired to sessions; §8 WS table stripped of scene/quest/lore; §11 gets historical note. CLAUDE.md drops Kampagnen-Inventar bullet. GOTCHAS.md rewrites snapshot-vs-base entry. README.md rewrites campaign fabric bullet. Acceptance: fresh DB seed + boot clean, demo session end-to-end (GM cockpit → player dashboard, weather/time, combat, SessionEndPanel AP + loot → player sees items live via `inventory_change`). Closes #1.

- **Session 17 (2026-04-17) — Autonomous audit-fix pass (20 items closed).** Cleared the entire low-/moderate-risk audit backlog in one session. **Trivial fixes:** S10 seed refuses test users when ENV=production regardless of flag; C2 buff_applied payload read path fixed (payload.buff.* vs payload.*); X1 player defense event name unified (defense_result → defense_choice + roll field); C8 _is_current_turn ID comparison; C5 CORS methods + headers enumerated; C7 datetime.utcnow() → datetime.now(timezone.utc) across 17 sites in 6 files; C11 stale backend/*.db* files deleted; C13 duplicate import math removed. **Mechanical cleanup:** S11 dead Table View plumbing removed end-to-end (backend target branches + is_table_view query param + frontend hook arg + store state + router redirect + useGMControls setTableView); X6 dead sessionStore.joinSession deleted; C14 _handle_session_end grace period (30s delayed cleanup); C15 wiki search min_length 1→3 + LIKE wildcard escaping; C9 BuffPill replaced per-pill setInterval with a single shared 1 Hz tick in the parent; C3 snapshot debounce gains trailing-edge retry + CLAUDE.md 5s→2s doc fix; X5 handle_reconnect wired via per-session _seen_users tracking in handle_connect. **Moderate:** X2 login rate limit (5/min) + register rate limit (10/min) + Pydantic Field constraints on RegisterRequest/LoginRequest (slowapi 0.1.9 added to requirements.txt + exception handler wired in main.py); S9 safeData.js adoption sweep across 4 call sites (PlayerOverview ×2, GMCockpit, PlayerDashboard, useGMSession). **Deferred with rationale:** C1 Manöver SF penalty — Codex review of my fix spec revealed the current Basismanöver numbers already diverge from canonical DSA5 (Wuchtschlag I is -2/+2 per Regelwerk, code has -1/+1) and the no-SF rule is "double the AT penalty", not "flat -2". Silent fix would rebalance every existing combat — queued as P1 needing explicit user sign-off on the balance impact, documented in GOTCHAS. S6 Zauberdauer documented as deliberate simplification in GOTCHAS (implementation deferred to rules-engine policy milestone). Commits e23b2e9, d415409, f3d74ce, 62b7ef0 on main (all pushed to origin via admin-bypass on the new branch protection).

- **Session 16 (2026-04-17) — Kickstart/Superpowers workflow adoption + public-repo prep + independent audits.** Restructure: /context, /log, /kickstart slash commands; ROADMAP.md Current Milestone + P1/P2/P3 backlog (from old TODO.md); CLAUDE.md Superpowers Integration + Session Workflow Heuristics (Rule 1/2/3); docs/superpowers/specs + docs/audits dirs. Public-repo prep: SECRET_KEY startup-refuse in production, SEED_TEST_USERS gate, .env.example tracked, .gitignore expanded, LICENSE (PolyForm Noncommercial 1.0.0) + NOTICE (DSA5 fan-work disclaimer). Doc accuracy: OVERVIEW.md (WIP / vibecoded / personal tool framing), README.md rewrite (role = URL not device class), SPEC.md §1-§3 rewrite dropping the outdated GM-laptop / player-phone / TV-projector three-client model. Independent audit round: Codex (6 HIGH / 11 MEDIUM / 4 LOW) + Claude (8 HIGH / 10 MEDIUM / 5 LOW) both ran blind; synthesis doc promoted 33 findings to ROADMAP as P1/P2/P3. Drop-campaigns milestone queued as P1 after confirming zero real data in lore/quests/group_inventory tables. Commit 5f67b32 + 1e9d27c pushed.

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
