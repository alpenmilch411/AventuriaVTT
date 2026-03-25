# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Aventuria VTT — browser-based GM toolkit for Das Schwarze Auge 5th Edition (DSA5). This is the **frontend** (React SPA). The backend is a separate FastAPI project in `../backend/`.

Three client roles render different UIs from the same app: **GM Cockpit** (laptop), **Player Dashboard** (phone), **Table View** (TV/projector). All communication flows through WebSocket messages dispatched by `useWebSocket`.

## Commands

```bash
npm run dev       # Vite dev server (proxies /api and /ws to localhost:8000)
npm run build     # Production build → dist/
npm run preview   # Preview production build
```

No linter or test runner is configured in package.json. E2E tests live in `e2e/` and the root-level `test-*.mjs` files; they use Playwright but are run manually (e.g. `npx playwright test e2e/`).

## Architecture

### Routing (`src/router.jsx`)
- `/` — Login
- `/dashboard` — Campaign/character management
- `/gm/:sessionCode` — GM Cockpit (GMCockpit.jsx)
- `/play/:sessionCode` — Player Dashboard (PlayerDashboard.jsx)

### State Management (Zustand stores in `src/stores/`)
All stores are standalone Zustand slices (no combined root store). Each store exposes a `handle*Message(msg)` method that the WebSocket hook dispatches to.

| Store | Responsibility |
|-------|---------------|
| `authStore` | JWT auth, token in localStorage (`avtt_token`) |
| `sessionStore` | Session lifecycle, phase (lobby/exploration/combat), HALT, player list, session log, trade state |
| `combatStore` | **Multi-battle** tracker (battles map keyed by battleId), initiative order, turn flow, dice requests. Legacy flat fields (`combatActive`, `currentRound`, etc.) auto-sync from the active battle via a subscriber |
| `characterStore` | Player's own character + GM's `allCharacters`. Vitals live in `current_vitals`, max in `derived_values`. Conditions are an array of `{name, level}` |
| `campaignStore` | Campaign metadata, scenes, NPCs, quests, lore book, world clock, weather |
| `mapStore` | Map state, tokens, fog-of-war cells, drawings, measure tool. GM changes accumulate in `pendingChanges` until pushed |

### WebSocket Hub (`src/hooks/useWebSocket.js`)
Single hook manages the WS connection with auto-reconnect + heartbeat. `dispatchMessage` routes incoming messages by `type` prefix to the appropriate store's handler. Messages are `{ type: string, payload: object }`.

### DSA5 Rules Engine (`src/engine/`)
Pure-function modules implementing DSA5 mechanics — usable without React:

- **`spellEngine.js`** — 3d20-vs-attributes probe resolution (`resolveProbe`), spell/liturgy databases and resolution
- **`conditionsEngine.js`** — Condition definitions (Furcht, Schmerz, Belastung, etc.), modifier calculation, pain from HP thresholds, condition lifecycle (add/remove/tick)
- **`weaponProperties.js`** — Weapon properties, reach modifiers, ranged brackets, combat special abilities (Wuchtschlag, Finte, etc.), maneuver modifiers
- **`creatureRules.js`** — Parses creature `special_rules` strings into structured effects (pack tactics, regeneration, poison, immunities, etc.)
- **`buffSystem.js`** — Temporary stat modifiers with real-time expiry
- **`itemEffects.js`** — Resolves item `effects` objects into game actions (heal, damage, buff, condition, etc.)

### Computed Values (`src/hooks/useCombatValues.js`)
Single source of truth for derived combat stats (AT, PA, FK, AW, INI, GS, RS, BE). Composes equipped items + combat techniques + conditions + special abilities. Used by VitalsBar, ArmoryTab, CombatActions, CharacterSheet.

### Data Shape Normalization (`src/utils/safeData.js`)
API, WS, and stores return the same data in different shapes. `safeData.js` provides `getConditions()`, `getVitalsFrom()`, `getMaxVitals()` to safely extract from any player-like object.

## Key Conventions

- **German UI text**: All user-facing strings are in German. Variable names and code comments are in English.
- **DSA5 abbreviations**: MU/KL/IN/CH/FF/GE/KO/KK (attributes), AT/PA/AW/FK (combat), LeP/AsP/KaP/SchiP (vitals), RS/BE (armor), TP/SP (damage), KR (combat round), QS (quality level), FW/ZfW (skill value).
- **Vitals pattern**: `current_vitals` holds mutable values (lep, asp, kap, schip). `derived_values` holds maximums (LeP_max, AsP_max, etc.). Always read current from `current_vitals`, fall back to `derived_values` for max.
- **Tailwind theme**: Custom `dsa-*` color palette defined in `tailwind.config.js` (dsa-bg, dsa-gold, dsa-parchment, dsa-blood, dsa-forest, dsa-mana, dsa-karma, etc.). Dark mode only.
- **Icons**: Uses `lucide-react` for all icons.

## DSA5 Rules Gotchas (from GOTCHAS.md)

These are easy to get wrong — read `../GOTCHAS.md` when touching engine code:

- Condition stacking: magical sources don't stack (highest wins), physical sources do stack with each other and with magical
- Handlungsunfähig triggers at condition level IV **or** when sum of all condition levels >= 8
- Multiple reactions per Kampfrunde require Schicksalspunkte; cumulative -3 per additional reaction
- Manöver limits: max 1 Basismanöver + 1 Spezialmanöver per attack
- Spell Zauberdauer counts only the caster's own actions; defending interrupts the spell
- Character inventory: always read from Kampagnen-Inventar during sessions, never Basis-Inventar
