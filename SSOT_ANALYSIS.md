# Single Source of Truth — Full Codebase Analysis

**Date:** 2026-03-25
**Status:** Complete
**Purpose:** Identify all data duplication, sync issues, race conditions, and migration plan for single source of truth

---

## Executive Summary

The AventuriaVTT codebase has **critical data duplication** where the same vitals (LeP/AsP/KaP) exist in 3+ frontend stores with independent update paths. This causes UI desync, stale reads, and potential data loss under concurrent updates. The backend compounds this with fire-and-forget persistence, no database locking, and inconsistent API response shapes.

**Impact:** GM and player can see different HP values for the same character. Combat HP bars can disagree with character sheet. Concurrent damage (GM + player potion) can lose one update.

---

## 1. CRITICAL: Triple-Store Vitals Problem

The same LeP/AsP/KaP values exist in **4 locations** across 3 stores:

| Location | Store | Fields | Used By |
|----------|-------|--------|---------|
| Player's own character | `characterStore.myCharacter.current_vitals` | `{lep, asp, kap, schip}` | Player header, character sheet |
| Player's own character (legacy) | `characterStore.myCharacter.currentLeP/AsP/KaP` | Flat fields | Fallback reads |
| GM's player list | `sessionStore.players[].currentLeP/AsP/KaP` | Flat fields | VitalsPopup, GM player cards |
| Combat combatants | `combatStore.battles[].initiativeOrder[].lep` | `lep` only | Combat HP bars, TurnFlow |

### Why This Is Broken

1. **VitalsPopup reads from sessionStore** (`VitalsPopup.jsx:33`) — this data is loaded once at session start and becomes stale
2. **Combat HP bars read from combatStore** — when combat ends, these values are not synced back to characterStore
3. **characterStore has DUAL backing fields** — both `currentLeP` and `current_vitals.lep` exist, with a 3-layer fallback in `getVitals()` (line 62-78)
4. **Delta resolution happens independently** per store — `resolveVitals()` in useWebSocket.js reads different base values from each store and computes different results

### Write Sources Per Location

| Location | Write Sources | Count |
|----------|--------------|-------|
| `characterStore.myCharacter` | `updateVitals()`, `handleCharacterMessage()`, `setMyCharacter()`, WS hook direct update | 4+ |
| `sessionStore.players[]` | WS hook `setPlayers()`, `updatePlayer()` | 2 |
| `combatStore.combatants[]` | `updateCombatant()`, WS hook, TurnFlow damage, CombatOverlay | 4+ |

---

## 2. CRITICAL: Backend Race Conditions

### 2a. Vitals Persistence (Read-Modify-Write Without Locking)

**File:** `backend/ws/handlers.py:111-140`

`_persist_vitals()` does SELECT → read current → apply delta → UPDATE without `FOR UPDATE` lock.

```
T0: Request A reads lep=30, applies -5
T1: Request B reads lep=30, applies -10
T2: A commits lep=25
T3: B commits lep=20 ← A's damage LOST! Should be 15.
```

### 2b. Fire-and-Forget Async Persistence

6 locations use `asyncio.create_task()` without awaiting or error tracking:

| Line | Function | What It Persists |
|------|----------|-----------------|
| 329 | `_persist_vitals()` | Player vitals |
| 359 | `_persist_conditions()` | Player conditions |
| 481 | `_persist_vitals()` | GM vitals update |
| 486 | `_persist_vitals()` | GM state_update |
| 508 | `_persist_conditions()` | GM conditions |
| 519 | `_persist_loot()` | Loot distribution |

If DB is down: clients see updated values (from WS broadcast), but DB never persists. On reconnect, values revert.

### 2c. Inventory Changes Not Persisted

**File:** `backend/ws/handlers.py:366-370`

`inventory_change` messages are broadcast-only — no `_persist_inventory()` call. Inventory changes are lost on page refresh.

### 2d. Conditions Full-Replacement Race

`_persist_conditions()` (line 142-158) does `char.conditions = conditions` without merge. Two simultaneous condition updates will overwrite each other.

---

## 3. HIGH: API Response Shape Inconsistency

The same vitals data is returned in **5 different shapes**:

| Source | Shape | Field Names |
|--------|-------|-------------|
| `GET /api/characters/:id` | Nested object | `current_vitals: {lep, asp, kap}` |
| `GET /api/campaigns/:id/players-detail` | Flat fields | `current_lep, current_asp, current_kap` |
| WS `vitals_update` | Nested in payload | `vitals: {lep, asp, kap}` or `{lep_delta, asp_delta}` |
| WS `state_update` | Single flat field | `current_lep` |
| WS `sync_full` | Dict of dicts | `vitals: {charId: {lep, asp, kap}}` |

**Impact:** Frontend has extensive normalization code with fallback chains. `characterStore.getVitals()` tries 3 field paths. `useWebSocket.js` handles 4+ message formats.

Conditions have a similar problem with 3 message formats (add_condition, remove_condition, full array replace) plus different container types (array vs dict keyed by character ID).

---

## 4. HIGH: Derived State Duplication

### CombatActions Duplicates useCombatValues

- `useCombatValues.js` (lines 17-132): Declared combat value calculator (AT, PA, damage, armor)
- `CombatActions.jsx` (lines 41-81): **Reimplements the same calculations inline**
- Both compute KTW lookup, BE adjustment, armor values independently

### Conditions in Combat Store Never Sync

- `combatStore.battles[].initiativeOrder[].conditions` initialized empty, never updated from `condition_change` WS messages
- Conditions applied during combat don't appear on combatants
- `useWebSocket.js:169` handles `conditions_update` for characterStore but **skips combatStore**

---

## 5. MEDIUM: Missing Test Coverage

### Untested Critical Flows

| Flow | Impact | Why Untested |
|------|--------|-------------|
| Conditions add/remove | UI desync | Complex WS interaction |
| Item use with effects | Vitals not applied | Multi-step dice flow |
| Trade workflow | Items lost | Two-player coordination |
| Combat damage persistence | HP reverts | Async persist timing |
| AP award at session end | AP lost | Session lifecycle |
| Buff application/expiry | Stats wrong | Time-based mechanics |
| Level-up/Steigerung | AP spent, no effect | API + store sync |
| Character import | Data corruption | Large payload handling |
| Quest objective tracking | Quest state lost | Multi-player sync |

### Existing Tests (2 passing)

| Test | File | Checks |
|------|------|--------|
| Probe damage flow | `e2e/probe_damage_flow.cjs` | 50 checks |
| Vitals management | `e2e/vitals_flow.cjs` | 19 checks |

---

## 6. Architecture Diagram

```
                    ┌─────────────────────────────────────┐
                    │           Backend (FastAPI)          │
                    │                                     │
                    │  REST API          WebSocket         │
                    │  ┌──────┐    ┌──────────────┐      │
                    │  │chars │    │  handlers.py  │      │
                    │  │camps │    │               │      │
                    │  └──┬───┘    │ in-memory     │      │
                    │     │        │ state["vitals"]│     │
                    │     │        │               │      │
                    │     └────────┤ _persist_*()  │      │
                    │              │ (fire&forget) │      │
                    │              └───────┬───────┘      │
                    │                      │              │
                    │              ┌───────▼───────┐      │
                    │              │   PostgreSQL   │      │
                    │              │ Character.     │      │
                    │              │ current_vitals │      │
                    │              └───────────────┘      │
                    └──────────────────┬──────────────────┘
                                       │
                              WS messages + REST responses
                                       │
                    ┌──────────────────▼──────────────────┐
                    │        Frontend (React/Zustand)      │
                    │                                      │
                    │  useWebSocket.js (message router)    │
                    │        │                             │
                    │        ├──► characterStore            │
                    │        │    ├─ myCharacter.           │
                    │        │    │  current_vitals ◄─┐    │
                    │        │    ├─ myCharacter.     │    │
                    │        │    │  currentLeP  ◄────┤    │
                    │        │    │  (DUPLICATE!)     │    │
                    │        │    └─ allCharacters[]  │    │
                    │        │                        │    │
                    │        ├──► sessionStore         │    │
                    │        │    └─ players[].        │    │
                    │        │       currentLeP  ◄────┤    │
                    │        │       (STALE COPY)     │    │
                    │        │                        │    │
                    │        └──► combatStore          │    │
                    │             └─ combatants[].     │    │
                    │                lep          ◄────┘    │
                    │                (COMBAT ONLY)         │
                    │                                      │
                    │  Components read from DIFFERENT      │
                    │  stores depending on context!        │
                    └──────────────────────────────────────┘
```

---

## 7. Migration Plan (Prioritized)

### Phase 1: Backend Safety (1-2 days)

**Goal:** Prevent data loss from concurrent writes.

| Task | File | Change |
|------|------|--------|
| Add `SELECT ... FOR UPDATE` to `_persist_vitals()` | `handlers.py:122` | Row-level locking |
| Add `SELECT ... FOR UPDATE` to `_persist_conditions()` | `handlers.py:146` | Row-level locking |
| Add error callback to `asyncio.create_task()` | `handlers.py:329,359,481,486,508,519` | Log + retry on failure |
| Add `_persist_inventory()` for inventory_change | `handlers.py:366-370` | Actually persist inventory |
| Standardize vitals persistence to always use absolute values | `handlers.py:111-140` | Resolve deltas server-side, broadcast absolute |

### Phase 2: Backend API Normalization (1 day)

**Goal:** One shape for vitals everywhere.

| Task | File | Change |
|------|------|--------|
| Normalize `players-detail` to use `current_vitals: {lep, asp, kap}` | `campaigns.py:936-964` | Match character endpoint shape |
| Normalize `sync_full` to use same vitals shape | `handlers.py:1695-1715` | Consistent dict structure |
| Resolve deltas server-side before broadcast | `handlers.py:325-332,468-486` | Always broadcast absolute values |

### Phase 3: Frontend Single Store (2-3 days)

**Goal:** One authoritative location per data type.

| Task | Change |
|------|--------|
| Remove `currentLeP/AsP/KaP` legacy fields from characterStore | Use only `current_vitals` |
| Make characterStore the single source for all character data | Remove vitals from sessionStore.players[] |
| Add `characterStore.allCharacters[].current_vitals` as GM source | VitalsPopup/ConditionPopup read from here |
| Add vitals selector that works for both player and GM | `useVitals(characterId)` hook |
| Sync combat HP from characterStore, not independently | combatStore reads from characterStore |
| Add conditions to combatStore sync | WS hook updates combatStore conditions |

### Phase 4: Frontend Cleanup (1 day)

**Goal:** Remove normalization hacks and duplicated logic.

| Task | Change |
|------|--------|
| Remove `resolveVitals()` from useWebSocket.js | Backend sends absolute values |
| Remove fallback chains from `getVitals()` | Single field path |
| Delete `CombatActions` inline calculations | Use `useCombatValues()` hook |
| Simplify `handleCharacterMessage()` | One format to handle |

### Phase 5: Test Coverage (1-2 days)

**Goal:** E2E tests for all critical flows.

| Test | Covers |
|------|--------|
| Concurrent vitals update (GM + player) | Race condition regression |
| Conditions add/remove during combat | Combat sync |
| Item use with healing effect | Vitals persistence |
| Session end AP distribution | Session lifecycle |
| Trade workflow complete | Two-player coordination |
| Combat damage → character sheet sync | Cross-store sync |

---

## 8. Implementation Agent Roles

For the implementation phase, the following agent roles are needed:

### Tech Lead Agent (Coordinator)
- Reviews all changes before merge
- Ensures phases execute in order
- Validates cross-cutting concerns (e.g., WS message format changes need both frontend + backend)

### Backend Safety Agent
- Phase 1: Add locking, error handling, inventory persistence
- Phase 2: Normalize API shapes
- Must coordinate with Frontend Agent on message format changes

### Frontend Store Agent
- Phase 3: Refactor stores to single source
- Phase 4: Cleanup normalization code
- Must wait for Phase 2 (backend sends consistent shapes)

### Test Agent
- Phase 5: Write E2E tests
- Can start writing test scaffolding during Phase 1-2
- Runs full suite after each phase

### Communication Protocol
- Backend Agent signals "Phase 1 complete" → Tech Lead validates → Frontend Agent starts Phase 3
- Backend Agent signals "Phase 2 complete" → Frontend Agent starts Phase 4
- Test Agent runs after each phase, blocks next phase on failures

---

## Appendix A: All Files Involved

### Backend
| File | Role |
|------|------|
| `backend/ws/handlers.py` | WS message routing, vitals/conditions persistence, sync_full |
| `backend/api/characters.py` | Character REST endpoints, vitals PATCH |
| `backend/api/campaigns.py` | Campaign endpoints, players-detail |
| `backend/database.py` | DB engine config (no isolation level set) |

### Frontend — Stores
| File | Role |
|------|------|
| `frontend/src/stores/characterStore.js` | Character data, vitals, conditions, buffs |
| `frontend/src/stores/sessionStore.js` | Session state, player list (stale vitals copy) |
| `frontend/src/stores/combatStore.js` | Battle state, combatant HP, dice requests |
| `frontend/src/stores/campaignStore.js` | Campaign metadata (no vitals) |

### Frontend — Hooks
| File | Role |
|------|------|
| `frontend/src/hooks/useWebSocket.js` | WS message dispatcher, multi-store vitals sync |
| `frontend/src/hooks/useCombatValues.js` | Combat value calculator (authoritative) |

### Frontend — Components (Vitals Writers)
| File | Role |
|------|------|
| `frontend/src/views/gm/VitalsPopup.jsx` | GM vitals management (reads stale sessionStore) |
| `frontend/src/views/gm/TurnFlow.jsx` | Combat damage resolution |
| `frontend/src/views/gm/CombatTracker.jsx` | Combat HP display |
| `frontend/src/views/gm/GMCockpit.jsx` | Quick damage/heal actions |
| `frontend/src/views/gm/ProbeSetupPopup.jsx` | Probe consequence application |
| `frontend/src/views/player/InventoryPanel.jsx` | Item use healing |
| `frontend/src/views/player/ProbePopup.jsx` | Player consequence dice |
| `frontend/src/views/player/PlayerDashboard.jsx` | Initial character load |

### Frontend — Components (Vitals Readers)
| File | Role |
|------|------|
| `frontend/src/views/player/CharacterSheet.jsx` | Player vitals display |
| `frontend/src/views/gm/PlayerOverview.jsx` | GM player cards |
| `frontend/src/views/player/CombatActions.jsx` | Combat UI (duplicates useCombatValues) |
