# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Aventuria VTT — browser-based GM toolkit for Das Schwarze Auge 5th Edition (DSA5). A GM runs sessions from a cockpit (laptop), players join from phones, and a shared screen shows the map. Everything syncs in real-time via WebSocket.

## Superpowers Integration
This project uses the Superpowers plugin for coding discipline. Project memory lives in the kickstart files alongside it.
- **Superpowers** handles: brainstorming, implementation plans, TDD, code review, git worktrees, verification, systematic debugging.
- **Kickstart files** handle: what to build next (`ROADMAP.md`), architecture (`SPEC.md`), session history (`DEVLOG.md`), traps (`GOTCHAS.md`).
- Long-form phase archive lives in `SPEC.md` Section 11. Active work lives in `ROADMAP.md`.

If Superpowers isn't installed: `/plugin install superpowers@claude-plugins-official`.

## Session Workflow
- **Start of session:** run `/context`. It reads this file, `GOTCHAS.md`, the last 3 `DEVLOG.md` entries, recent git log, and the Current Milestone from `ROADMAP.md`.
- **Before touching code**, spot-check the relevant `SPEC.md` section (use the Quick Reference at the top). Don't re-read all of SPEC — it's big.
- **End of session:** run `/log`. It checks off Done items in `ROADMAP.md`, prepends a DEVLOG entry, updates `GOTCHAS.md`/`SPEC.md` where needed, and stages the doc changes. Do not skip this.
- **If code and SPEC disagree**, fix one of them. SPEC is source of truth for architecture; update it immediately when you change something that affects one of its sections.

## Session Workflow Heuristics (adopted 2026-04-17)
Process rules to avoid unnecessary overhead on routine changes. Revisit these empirically — if bugs slip through or context is lost, revert. **To reset to the prior flow:** `git revert` the commit that added this section, or delete the section.

### Rule 1 — Codex two-round cap
Cap `codex-companion.mjs task` spec-review iterations at **2 rounds**, then proceed to implementation, UNLESS any of the following apply:
- Current round returned a HIGH or MEDIUM finding.
- The change touches a **novel library** (first time using the library in this codebase — e.g. a new crypto lib, a new middleware framework).
- The change crosses a **security boundary** (auth, session management, CSRF, encryption, input validation, secrets handling, WebSocket message authz).
- The change crosses a **performance/DoS boundary** (resource caps, concurrency limits, streaming/chunking, rate limiting).
- The change touches the **DSA5 rules engine** (`backend/engine/` or `frontend/src/engine/`) — rule bugs cascade and are hard to retroactively detect. Always want the deeper review.

If any of those trigger, rounds are uncapped and continue until Codex returns zero HIGH/MEDIUM findings.

### Rule 2 — Plan-skip for small inline changes
When **all** of the following hold, skip `superpowers:writing-plans` entirely and go spec → code:
- Execution is **inline** (not subagent-driven — subagents need the plan for context).
- Change touches **≤3 files**.
- Change is **≤100 lines added/modified**.
- Spec already contains exact file paths, code blocks, and verification steps.
- Change does NOT touch `backend/engine/` or `frontend/src/engine/` (rules engine always gets a plan).

For subagent-driven execution, or changes larger than the above thresholds, continue using `superpowers:writing-plans` normally.

### Rule 3 — Decennial audit (every 10th closed milestone)
Every 10 closed milestones (counting from 2026-04-17 onward), trigger an independent in-depth audit before `/log` on the 10th milestone's session.

**Procedure:**
1. **Independent Claude pass.** Holistic review for bugs, tech debt, inconsistencies, DSA5-rule drift, security issues, accumulated frontend/backend divergence. Write to `docs/audits/AUDIT-YYYY-MM-DD-claude.md` with HIGH/MEDIUM/LOW severities. Do NOT consult Codex before finishing.
2. **Independent Codex pass.** Dispatch `node codex-companion.mjs task "..."` with the same brief (no reference to Claude's findings). Save to `docs/audits/AUDIT-YYYY-MM-DD-codex.md`.
3. **Synthesis.** `docs/audits/AUDIT-YYYY-MM-DD-synthesis.md` with: (a) both-caught, (b) Claude-only, (c) Codex-only, (d) genuine disagreements (escalate to user).
4. **Promote to ROADMAP.** Agreed HIGH/MEDIUM → new P1/P2 items. LOW → P3 or deferred with reasoning.

**Counter:** count entries in `ROADMAP.md` § Completed Milestones dated `2026-04-17` or later (including the entry about to be written). When the count is a non-zero multiple of 10, run the audit before writing the DEVLOG entry.

**Rationale:** Per-milestone Codex reviews catch milestone-scoped bugs but miss cross-cutting drift (accumulated tech debt, rule-engine inconsistencies, architectural erosion, outdated SPEC sections). DSA5 rules are especially prone to slow drift as new maneuvers/conditions/items get added one at a time.

## Codex as Reviewer
`node codex-companion.mjs task "..."` via Bash is the default pattern for getting a second opinion on specs or code. It's mature and reliable.

**Known workaround — the `codex:rescue` slash command rejects non-trivial prompts.** Always invoke Codex through Bash, not the slash command. Full path:

```bash
node "/Users/yannik/.claude/plugins/cache/openai-codex/codex/1.0.3/scripts/codex-companion.mjs" task "..."
```

**Parser quirk:** if a prompt contains a word that looks like a model name (e.g. "unittest" interpreted as a model), Codex errors with `The 'unittest' model is not supported`. Rephrase the prompt — it's not a real failure.

## Automatic SPEC.md / GOTCHAS.md Updates
Don't wait to be asked — `/log` handles the end-of-session sweep, but during work you should already update these files the moment a trigger fires:

| Trigger | What to update |
|---|---|
| New dependency added (pip/npm install) | `SPEC.md` Tech Stack (§3) |
| DB schema changed (new table, column, type change) | `SPEC.md` Data Models + migration |
| Env var added/changed | `SPEC.md` External Dependencies + `README.md` |
| New API endpoint or WS message type | `SPEC.md` relevant Architecture section (§4-§8) |
| Architecture decision made during implementation | `SPEC.md` with rationale |
| New file or module changes repo structure | `SPEC.md` Architecture (§4) |
| Non-obvious behavior / DSA5 rule trap / library quirk | `GOTCHAS.md` immediately |
| Roadmap milestone item completed | `ROADMAP.md` checkbox (and `SPEC.md` §11 archive `[x]`) |

When adding to `GOTCHAS.md`, use this format:
```
## Short descriptive title
Explanation of the trap, what goes wrong, the workaround.
Affected: files / modules
Found: YYYY-MM-DD
```

## Commands

### Frontend (`frontend/`)
```bash
npm run dev       # Vite dev server on :5173 (proxies /api and /ws to localhost:8000)
npm run build     # Production build → dist/
npm run preview   # Preview production build
```

### Backend (`backend/`)
```bash
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
python -m databank.seed   # Populate reference data from databank-seed/ JSON files
```

### Tests
No unit test framework. E2E tests use Playwright, run manually:
```bash
cd frontend && npx playwright test test-combat-sim.mjs
```

### Infrastructure
```bash
docker-compose up -d   # PostgreSQL 16 + Redis 7 (optional — SQLite works for dev)
```

## Repo Structure
```
AventuriaVTT/
├── CLAUDE.md        # This file — project rules, workflow
├── SPEC.md          # Technical spec + phase archive (Section 11)
├── ROADMAP.md       # Current milestone + active backlog
├── DEVLOG.md        # Session history, newest first
├── GOTCHAS.md       # DSA5 + implementation traps
├── README.md        # Setup / env vars
├── .claude/commands/{context,log,kickstart}.md
├── backend/         # Python 3.12 + FastAPI + async SQLAlchemy + WebSockets
│   ├── main.py, config.py, database.py
│   ├── engine/      # DSA5 rules engine (conditions, combat, magic, inventory)
│   ├── ws/          # WebSocket manager + handlers (bulk of game logic)
│   ├── models/      # SQLAlchemy + Pydantic models
│   ├── databank/    # seed.py loads databank-seed/ JSON → DB
│   └── importers/   # Optolith + DSA Ultimate JSON importers
├── frontend/        # React 18 + Vite + TailwindCSS + Zustand
│   ├── src/App.jsx, main.jsx
│   ├── src/engine/          # Mirrors backend DSA5 rules for computed values
│   ├── src/hooks/           # useCombatValues, useWebSocket, ...
│   ├── src/stores/          # Zustand slices (auth, session, combat, character, campaign, map)
│   ├── src/components/      # GM Cockpit, Player Dashboard, Wizards, Databank
│   └── src/utils/safeData.js
├── databank-seed/   # JSON reference data (creatures, weapons, spells, ...)
└── adventures/      # Demo adventure content
```

## Architecture

### Stack
- **Frontend:** React 18 + Vite + TailwindCSS + Zustand + lucide-react
- **Backend:** Python 3.12 + FastAPI + async SQLAlchemy + WebSockets
- **Database:** SQLite (dev default, auto-creates `aventuria_vtt.db`), PostgreSQL (production)
- **Config:** `backend/config.py` — Pydantic BaseSettings, all overridable via env vars or `.env`

### Three Client Roles (one React app)
| Route | Role | Device |
|-------|------|--------|
| `/gm/:sessionCode` | GM Cockpit | Laptop/tablet |
| `/play/:sessionCode` | Player Dashboard | Phone |
| `/dashboard` | Campaign/character management | Any |

### Frontend State (Zustand)
All stores are independent slices in `src/stores/`. Each exposes a `handle*Message(msg)` method that the WebSocket hook dispatches to by message `type` prefix.

Key stores: `authStore` (JWT), `sessionStore` (phase, HALT, players), `combatStore` (multi-battle tracker keyed by `battleId`), `characterStore` (player character + GM's allCharacters), `campaignStore` (scenes, NPCs, quests, lore), `mapStore` (tokens, fog, drawings).

### WebSocket (`src/hooks/useWebSocket.js`)
Single hook managing the WS connection. Auto-reconnect with exponential backoff (1s→30s), 30s heartbeat, message deduplication by `type:timestamp`, state versioning with gap detection, dead letter queue for offline buffering.

All messages follow `{ type: string, payload: object, timestamp: ms }`.

### Backend WebSocket (`ws/handlers.py`, `ws/manager.py`)
`manager.py` manages session rooms with per-user connections and broadcast targeting (all, gm, players, table, specific player). `handlers.py` contains the bulk of game logic — combat resolution, vitals sync, condition management, dice, spells, inventory. Per-character asyncio locks prevent race conditions. In-memory session state with debounced (5s) DB snapshots.

### DSA5 Rules Engine
Pure-function modules in both `frontend/src/engine/` and `backend/engine/`:
- Conditions (16 types with level modifiers, stacking rules)
- Weapon properties, reach, ranged brackets, combat special abilities
- Buff system with real-time expiry
- Item effects resolution
- Creature special rules parsing

Frontend computed values: `src/hooks/useCombatValues.js` is the single source of truth for derived combat stats (AT, PA, FK, AW, INI, GS, RS, BE).

### Data Shape Safety (`src/utils/safeData.js`)
API, WS, and stores return player data in different shapes. Always use `getConditions()`, `getVitalsFrom()`, `getMaxVitals()` instead of raw field access.

## Key Conventions

- **German UI, English code:** All user-facing text is German. Variable names, comments, and commit messages are English.
- **DSA5 abbreviations:** MU/KL/IN/CH/FF/GE/KO/KK (attributes), AT/PA/AW/FK (combat), LeP/AsP/KaP/SchiP (vitals), RS/BE (armor), TP/SP (damage), KR (combat round), QS (quality level), FW/ZfW (skill value).
- **Vitals pattern:** `current_vitals` = mutable values (lep, asp, kap, schip). `derived_values` = maximums (LeP_max, AsP_max, etc.).
- **Tailwind theme:** Custom `dsa-*` color palette (dsa-bg, dsa-gold, dsa-parchment, dsa-blood, dsa-forest, dsa-mana, dsa-karma). Dark mode only.
- **Zustand selectors:** Components use `useStore((s) => s.field)` selectors. Never call `getState()` in render paths. Never call `setState()` inside a subscriber on the same store (infinite loop).
- **Inventory scoping:** Always read from Kampagnen-Inventar during sessions, never Basis-Inventar directly.
- **No emojis in code** unless the user asks.

## DSA5 Rules Gotchas

Read `GOTCHAS.md` for the full list. Critical ones:
- Condition stacking: magical sources don't stack (highest wins), physical sources do
- Handlungsunfähig at condition level IV **or** sum of all levels >= 8
- Multiple reactions per KR require SchiP; cumulative -3 per additional
- Manöver: max 1 Basismanöver + 1 Spezialmanöver per attack; -2 without SF
- Spell Zauberdauer counts only caster's actions; defending interrupts
