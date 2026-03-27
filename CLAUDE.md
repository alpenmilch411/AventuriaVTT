# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Aventuria VTT — browser-based GM toolkit for Das Schwarze Auge 5th Edition (DSA5). A GM runs sessions from a cockpit (laptop), players join from phones, and a shared screen shows the map. Everything syncs in real-time via WebSocket.

**Key docs:** `SPEC.md` is the authoritative technical specification. `TODO.md` is the roadmap and task list — read it at session start, update it when completing tasks. `GOTCHAS.md` lists DSA5 rules implementation traps — read it before touching engine code. `DEVLOG.md` tracks development sessions.

## Session Start (MANDATORY)
At the start of every conversation, read these files before doing anything:
1. `TODO.md` — current roadmap, open tasks, what was recently completed
2. `SPEC.md` sections 1-3 — architecture refresher (skip if already familiar)
3. `GOTCHAS.md` — DSA5 implementation traps
4. Last 3 entries in `DEVLOG.md` — recent session context

Then confirm: "Last session completed [X]. Open tasks: [Y]. What do you want to work on?"

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

## DSA5 Rules Gotchas

Read `GOTCHAS.md` for the full list. Critical ones:
- Condition stacking: magical sources don't stack (highest wins), physical sources do
- Handlungsunfähig at condition level IV **or** sum of all levels >= 8
- Multiple reactions per KR require SchiP; cumulative -3 per additional
- Manöver: max 1 Basismanöver + 1 Spezialmanöver per attack; -2 without SF
- Spell Zauberdauer counts only caster's actions; defending interrupts
