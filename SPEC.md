# Aventuria VTT — SPEC.md
**Version:** 3.0.0
**Last updated:** 2026-03-28
**Status:** Production-ready (Sessions 14-16) — 3,638 entities, full combat (SchiP, opposed probes), shop system, weather/time/rest, group inventory, character lifecycle, session feedback, exports, 10 improvement cycles completed

---

## Quick Reference
- New Claude Code session?         → Read sections 1–3, then relevant section below
- Working on GM Cockpit?           → Sections 4.1–4.15
- Working on Player Dashboard?     → Sections 5.1–5.16
- Working on Persistence/Data?     → Sections 6.1–6.14
- Working on Content/Databank?     → Sections 7.1–7.8
- Working on Realtime/WebSocket?   → Sections 8.1–8.12
- Working on AI features?          → Sections 9.1–9.3
- Working on Nice-to-Have?         → Sections 10.1–10.12
- Deployment issue?                → Section 3.4
- DSA5 Rules reference?            → Section 3.5
- Roadmap / what's next?           → Section 11

---

## 1. Product Overview

### 1.1 What This Is

Aventuria VTT is a digital toolkit for Das Schwarze Auge 5th Edition that supports — but never replaces — the human Game Master. It is not a digital game. It is infrastructure for the analogue experience: the rule book that looks itself up, the character sheet that updates itself, the map that draws itself, and the GM screen that never forgets.

The GM remains the creative authority. The app handles bookkeeping, visualization, and mechanical resolution so the GM can focus on storytelling, improvisation, and player engagement.

### 1.2 The Problem

A DSA5 GM simultaneously juggles:
- **Narrative**: story, NPCs, atmosphere, improvisation
- **Mechanics**: combat tracking, initiative, conditions, modifiers, dice resolution
- **Bookkeeping**: LeP/AsP/KaP for 4+ players and 5+ creatures, inventory, time, provisions
- **Reference**: looking up rules, spell effects, creature stats, talent probes
- **Visualization**: drawing maps, placing tokens, managing fog of war

The bookkeeping and reference work kills creative flow. A GM who spends 2 minutes flipping through the rulebook for a Fernkampf modifier loses the table's attention and immersion.

### 1.3 The Solution

Three pillars:

**Prep** (before the session): The GM builds story structure as scenes with notes, creates/imports NPCs and creatures, prepares maps, places encounters, defines handouts. Players upload or create characters, manage inventory, review spells/talents. AI assists with content import (PDFs/photos → structured data) — always as a draft the GM reviews, never auto-pilot.

**Play** (at the table): The GM steers the session from a cockpit — pushing scenes, maps, and handouts to the shared screen and player phones. Combat mechanics (initiative, probes, damage, conditions) are resolved by the app based on physical dice input. The GM controls what players see. Players interact through their personal dashboard: character stats, inventory, action selection, dice input. Everyone still talks, argues, laughs, and roleplays — the app is invisible infrastructure beneath the conversation.

**Persist** (across sessions): Everything survives between sessions — character progression, campaign lore, NPC relationships, quest status, world timeline. Characters live across campaigns, level up, retire, or die — and their history is preserved.

### 1.4 Core Design Principles

1. **The app follows the GM, not the other way around.** No workflow is mandatory. Everything works spontaneously. The GM can call a probe, spawn a creature, or push a handout at any moment without "setting up" first.
2. **2-tap maximum for common actions.** If calling a probe takes more than 2 taps, the UI is wrong. The app must be faster than flipping a book page.
3. **Physical dice, digital tracking.** Players roll real dice and input results. The app validates range and computes outcomes. The tactile experience stays.
4. **GM sees everything, players see only what their character knows.** Strict information separation. No player ever sees another player's stats, inventory, or private GM messages.
5. **AI assists, never decides.** AI is a whisper-assistant for the GM: NPC dialog suggestions, rule lookups, improv inspiration, content extraction from PDFs. Never visible to players. Never autonomous.
6. **PWA with offline cache for essentials.** Character sheet, rules reference, and notes are cached locally via PWA service worker. If WiFi drops briefly during a session, the player can still see their stats and notes. Full functionality requires internet connection to the cloud server.
7. **Progressive complexity.** Feature gating by complexity level (Basic / Standard / Advanced). A new GM sees a clean, simple interface. Features unlock as comfort grows.

### 1.5 Who It's For

- **Primary**: DSA5 groups (2-6 players + 1 GM) who play at a physical table and want digital support without losing the analogue feel
- **Secondary**: GMs preparing sessions solo (story building, encounter design, NPC management)
- **Tertiary**: New GMs who need rule guidance and encounter balancing help
- **Market**: ~300K active DSA players in the German-speaking PnP community

---

## 2. Current State

- **Status**: Fully functional — all core systems operational, SSOT refactor complete, deploying to Render
- **Last updated**: 2026-03-25 (Session 5)
- **Repository**: https://github.com/alpenmilch411/AventuriaVTT (private)
- **Key decisions locked in**:
  - Human GM, not AI GM — app is a toolkit, not a replacement
  - DSA5 rules only (no DSA4.1 or other systems in v1)
  - Physical dice with manual input as primary (camera recognition as future optional feature)
  - AI as GM whisper-assistant only, never visible to players
  - **100% browser-based** — no native app, no install. Same URL on phone, tablet, laptop, TV
  - **Account-based** — every player/GM has a personal account. Characters, campaigns, groups travel with the account across devices and groups
  - **Cloud-hosted** — deploying to Render with GitHub auto-deploy on push
  - Responsive single codebase — device size determines the view (Player Dashboard, GM Cockpit, Table View)
  - All combat/probe mechanics computed deterministically — centralized `useCombatValues` hook as single source of truth
  - **Server-side delta resolution** — backend resolves vitals deltas to absolute values before broadcasting. Frontend handles both formats as fallback.
  - **Safe data extraction** — all components use `src/utils/safeData.js` helpers (`getConditions()`, `getVitalsFrom()`, `getMaxVitals()`) instead of raw field access. API fields may be `[]`, `{}`, or `undefined`.
  - **Reactive store subscriptions** — components use `useStore((s) => s.field)` selectors, never `getState()` in render paths
- **What works end-to-end**:
  - Full combat workflow: initiative → action → target → maneuver → attack → defense → damage → conditions → off-hand (dual-wield)
  - Ranged attacks with distance brackets (nah/mittel/weit/extrem) applying correct FK penalties
  - Creature HP hidden from players — only names and turn order visible, matching DSA5 rules
  - SchiP validation for multiple reactions — additional defenses blocked when no fate points remain
  - Item usage: potions (heal/restore/buff), poisons (apply to weapon → trigger on hit), herbs (Heilkunde probe), combat throwables (AoE damage/stun/smoke), condition items (drinks → Berauscht)
  - GM quick actions: Probe (talent probes with consequences), Leben (vitals popup), Zustand (conditions popup), all with live preview and confirmation
  - Probe workflow: GM setup → player rolls 3W20 → consequence dice → results with auto-apply damage/heal
  - Real-time sync: vitals, conditions, inventory, buffs, combat state, session log — all live without refresh
  - Session state snapshots — survives server restarts, auto-restored on reconnect
  - State versioning + gap detection — clients auto-request full sync when messages are missed
  - Dead letter queue — messages queued while disconnected, replayed on reconnect
  - Message deduplication — prevents double-processing on flaky connections
  - Dynamic value computation: all AT/PA/FK/AW/INI/GS/RS/BE derived from KTW + weapon mods - BE - condition modifiers (memoized)
  - SF-gated combat maneuvers: 13 maneuvers (5 basis + 8 SF-gated) with correct DSA5 modifier values
  - Trade/transfer system between players with GM approval
  - Session Protokoll: Bloomberg-terminal style log with type labels, deduplication, auto-scroll + "Aktuell" jump button
  - Phone-responsive combat layout (stacks vertically on small screens)
  - 12 key components wrapped in React.memo for optimized rendering
  - Quest tracking with per-player objectives
  - Combat condition rules: Handlungsunfähig at level IV or sum ≥ 8, magical/physical stacking, Berauscht KL/IN penalties

---

## 3. Tech Stack & Architecture

### 3.1 Tech Stack

**Platform**
- **100% browser-based.** No app store, no install, no updates. Everyone opens the same URL on whatever device they bring to game night.
- **Responsive by device:** The app detects screen size and orientation, then serves the appropriate view:
  - Phone (portrait) → Player Dashboard
  - Tablet (landscape) → GM Cockpit or Player Dashboard (user chooses)
  - Laptop/Desktop → GM Cockpit or Prep Workshop
  - TV/Projector (via browser or Chromecast/AirPlay) → Table View
- **Any combination works.** GM on iPad + players on Android phones + Table View on a laptop connected to TV = perfectly fine. No platform lock-in.
- **PWA (Progressive Web App)**: installable to home screen for app-like experience on mobile. Offline caching for core features (character sheet, rules reference, notes).

**Accounts**
- Every player and GM has a personal account (email + password, future: OAuth with Google/Apple)
- Login once, access everything: characters, groups, campaigns, prep work — across all devices
- GM preps a campaign on PC at home on Tuesday → opens the same campaign on iPad at game night on Friday → everything synced
- A player's characters travel with their account. Guest at another group? Log in, pick your character, play.
- **No account required for quick-play**: a GM can create a session where players join with just a room code and a name (guest mode). Characters created in guest mode can later be claimed by creating an account.

**Frontend**
- React 18 + Vite + TailwindCSS
- Single codebase, responsive layouts — not separate apps per device
- Route-based view switching: `/gm` (cockpit), `/play` (player dashboard), `/table` (shared display), `/prep` (session preparation)
- Konva.js for canvas-based map rendering (grid, tokens, fog, drawing tools)

**Backend**
- Python 3.12 + FastAPI — REST API + WebSocket server
- PostgreSQL — persistent storage (accounts, characters, campaigns, adventures, databank)
- Redis — ephemeral session state, WebSocket pub/sub, combat state, timers

**AI Assist (GM-only, optional)**
- Claude API (Sonnet) — NPC suggestions, rule lookups, improv help, content extraction
- OpenAI Whisper API — optional future feature for dice camera recognition

**Infrastructure**
- **Cloud-hosted only**: hosted service at a public URL (e.g. `aventuria-vtt.de`). Players and GMs access via browser from anywhere — during sessions at the table, and between sessions from home for character management, prep work, and lore browsing.
- No self-hosting required. All data stored centrally, accessible from any device at any time.
- Domain: TBD

### 3.2 High-Level Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        CLIENTS                                │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │  GM Cockpit  │  │ Player Phone │  │  Table View (TV)  │  │
│  │  (Laptop)    │  │ (per player) │  │  (Projector)      │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬──────────┘  │
│         │   WebSocket + REST  │                │             │
└─────────┼─────────────────────┼────────────────┼─────────────┘
          │                     │                │
┌─────────┼─────────────────────┼────────────────┼─────────────┐
│         │          BACKEND (FastAPI)           │             │
│  ┌──────┴──────────────────────────────────────┴──────────┐  │
│  │                  Session Manager                       │  │
│  │  (WebSocket hub, rooms, auth, broadcast control)       │  │
│  └────────────────────────┬───────────────────────────────┘  │
│                           │                                  │
│  ┌────────────────────────┼───────────────────────────────┐  │
│  │               Game State Engine                        │  │
│  │                                                        │  │
│  │  ┌──────────┐ ┌───────────┐ ┌───────────┐ ┌────────┐ │  │
│  │  │ Combat   │ │ Probe     │ │ Inventory │ │ Map &  │ │  │
│  │  │ Manager  │ │ Resolver  │ │ Manager   │ │ Tokens │ │  │
│  │  ├──────────┤ ├───────────┤ ├───────────┤ ├────────┤ │  │
│  │  │Condition │ │ Character │ │ Time &    │ │Campaign│ │  │
│  │  │ Tracker  │ │ Manager   │ │ Weather   │ │ & Lore │ │  │
│  │  └──────────┘ └───────────┘ └───────────┘ └────────┘ │  │
│  │                                                        │  │
│  │  ┌──────────────────────────────────────────────────┐ │  │
│  │  │              Databank (Reference Data)            │ │  │
│  │  │  Creatures│Weapons│Spells│Items│Talents│Rules     │ │  │
│  │  └──────────────────────────────────────────────────┘ │  │
│  └────────────────────────┬───────────────────────────────┘  │
│                           │                                  │
│  ┌────────────────────────┼───────────────────────────────┐  │
│  │            AI Assist Layer (GM-only)                    │  │
│  │  (Claude API: NPC help, rules Q&A, improv suggestions, │  │
│  │   content extraction from PDFs/photos)                  │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                   Persistence Layer                     │  │
│  │  PostgreSQL: accounts, characters, campaigns, lore,     │  │
│  │  adventures, databank, session logs                     │  │
│  │  Redis: live session state, combat state, timers        │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### 3.3 Planned Folder Structure

```
aventuria-vtt/
├── SPEC.md
├── OVERVIEW.md
├── README.md
├── DEVLOG.md
├── GOTCHAS.md
├── docker-compose.yml
├── .env.example
│
├── backend/
│   ├── main.py                        # FastAPI app entry
│   ├── config.py                      # Settings, env vars
│   ├── requirements.txt
│   │
│   ├── api/                           # REST endpoints
│   │   ├── auth.py                    # Login, accounts
│   │   ├── sessions.py                # Session create/join/leave
│   │   ├── characters.py              # Character CRUD, import, leveling
│   │   ├── campaigns.py               # Campaign CRUD, lore, quests
│   │   ├── combat.py                  # Combat actions, initiative, damage
│   │   ├── probes.py                  # Talent/spell/liturgy probes
│   │   ├── inventory.py               # Item management, trade, shop
│   │   ├── maps.py                    # Map CRUD, tokens, fog
│   │   ├── databank.py                # Reference data browse/search
│   │   ├── adventures.py              # Adventure import, scenes
│   │   └── assist.py                  # AI assist endpoints (GM-only)
│   │
│   ├── ws/                            # WebSocket layer
│   │   ├── manager.py                 # Connection manager, rooms
│   │   ├── handlers.py                # Message routing by type
│   │   └── events.py                  # Typed event definitions
│   │
│   ├── engine/                        # DSA5 rules engine (pure functions)
│   │   ├── combat.py                  # Attack/defense resolution
│   │   ├── initiative.py              # INI calculation & ordering
│   │   ├── probes.py                  # 1W20, 3W20 probe resolution
│   │   ├── damage.py                  # Damage calculation, RS
│   │   ├── conditions.py              # Zustand/Status tracking & stacking
│   │   ├── magic.py                   # Spell resolution, AsP, Zauberdauer
│   │   ├── liturgies.py               # Liturgy resolution, KaP
│   │   ├── movement.py                # Grid pathfinding, GS, engagement
│   │   ├── inventory.py               # Weight, transfers, equip rules
│   │   ├── rest.py                    # Regeneration, healing, time passage
│   │   ├── leveling.py                # AP spending, prerequisite validation
│   │   └── modifiers.py               # Modifier aggregation (conditions, weather, etc.)
│   │
│   ├── ai/                            # AI assist (GM-only)
│   │   ├── assist.py                  # Claude API orchestration
│   │   ├── prompts.py                 # System prompt templates
│   │   ├── extraction.py              # PDF/photo → structured adventure data
│   │   └── npc_generator.py           # On-demand NPC generation
│   │
│   ├── models/                        # SQLAlchemy / Pydantic models
│   │   ├── user.py                    # User accounts
│   │   ├── character.py               # Character (full lifecycle)
│   │   ├── campaign.py                # Campaign, lore, quests, timeline
│   │   ├── session_state.py           # Live session, combat state
│   │   ├── adventure.py               # Adventure, chapters, scenes
│   │   ├── map.py                     # Maps, tokens, fog state
│   │   ├── npc.py                     # NPC registry with relationships
│   │   ├── inventory.py               # Items, equipment
│   │   └── databank.py                # Reference data tables
│   │
│   ├── databank/                      # Reference data modules
│   │   ├── seed.py                    # Idempotent seeding from JSON
│   │   ├── creatures.py
│   │   ├── weapons.py
│   │   ├── armor.py
│   │   ├── shields.py
│   │   ├── items.py
│   │   ├── spells.py
│   │   ├── liturgies.py
│   │   ├── special_abilities.py
│   │   ├── talents.py
│   │   ├── herbs_potions.py
│   │   ├── poisons_diseases.py
│   │   └── rules_reference.py         # Searchable rules snippets
│   │
│   └── importers/                     # External data import
│       ├── dsa_ultimate.py            # DSA Ultimate JSON parser
│       ├── optolith.py                # Optolith JSON parser
│       └── adventure_pdf.py           # AI-assisted PDF extraction
│
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   │
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── router.jsx                 # Route: /gm, /player, /table, /prep
│   │   │
│   │   ├── views/
│   │   │   ├── gm/                    # GM Cockpit views
│   │   │   │   ├── GMCockpit.jsx      # Main GM layout
│   │   │   │   ├── SceneManager.jsx   # Story/scene flow
│   │   │   │   ├── CombatTracker.jsx  # Combat management
│   │   │   │   ├── PlayerOverview.jsx # All players at a glance
│   │   │   │   ├── NPCRegistry.jsx    # NPC cards & relationships
│   │   │   │   ├── EncounterBuilder.jsx
│   │   │   │   ├── MapEditor.jsx      # Map + fog + drawing tools
│   │   │   │   └── AssistPanel.jsx    # AI whisper-assistant
│   │   │   │
│   │   │   ├── player/                # Player Dashboard views
│   │   │   │   ├── PlayerDashboard.jsx
│   │   │   │   ├── CharacterSheet.jsx
│   │   │   │   ├── InventoryPanel.jsx
│   │   │   │   ├── SpellBook.jsx
│   │   │   │   ├── TalentList.jsx
│   │   │   │   ├── MapView.jsx        # Player's fog-limited map
│   │   │   │   ├── CombatActions.jsx  # Action/maneuver/dice UI
│   │   │   │   ├── Journal.jsx        # Personal notes
│   │   │   │   └── QuestTracker.jsx
│   │   │   │
│   │   │   ├── table/                 # Shared screen (TV/projector)
│   │   │   │   ├── TableDisplay.jsx   # Main table layout
│   │   │   │   ├── NarrativeView.jsx  # Story text display
│   │   │   │   ├── MapDisplay.jsx     # Full map (GM-controlled visibility)
│   │   │   │   ├── HandoutDisplay.jsx # Push images/text to screen
│   │   │   │   └── CombatOverlay.jsx  # Initiative bar, combat log
│   │   │   │
│   │   │   └── prep/                  # Pre-session preparation
│   │   │       ├── StoryBuilder.jsx   # Scene/chapter editor
│   │   │       ├── NPCCreator.jsx
│   │   │       ├── EncounterPrep.jsx
│   │   │       ├── MapUploader.jsx
│   │   │       └── AdventureImport.jsx # PDF/photo import wizard
│   │   │
│   │   ├── components/                # Shared components
│   │   │   ├── map/                   # Konva.js map components
│   │   │   ├── combat/                # Combat UI components
│   │   │   ├── character/             # Character display components
│   │   │   ├── dice/                  # Dice input, probe display
│   │   │   ├── common/                # Bars, badges, modals, cards
│   │   │   └── sound/                 # Soundboard components
│   │   │
│   │   ├── hooks/
│   │   │   ├── useWebSocket.js
│   │   │   ├── useGameState.js
│   │   │   ├── useGMControls.js
│   │   │   └── useOffline.js
│   │   │
│   │   └── stores/                    # Zustand or similar
│   │       ├── sessionStore.js
│   │       ├── combatStore.js
│   │       ├── mapStore.js
│   │       ├── characterStore.js
│   │       └── campaignStore.js
│   │
│   └── public/
│       ├── tokens/                    # Default token icons
│       └── sounds/                    # Ambient loops & SFX
│
├── databank-seed/                     # JSON seed files
│   ├── creatures.json
│   ├── weapons.json
│   ├── armor.json
│   ├── shields.json
│   ├── items.json
│   ├── spells.json
│   ├── liturgies.json
│   ├── special_abilities.json
│   ├── talents.json
│   ├── herbs_potions.json
│   ├── poisons_diseases.json
│   └── rules_reference.json
│
└── adventures/                        # Example adventure packages
    └── README.md
```

### 3.4 Deployment & Repo Setup

- **GitHub repo**: TBD (likely `aventuria-vtt`)
- **Branch strategy**: `main` = stable, `dev` = active development, feature branches
- **Local dev**: `docker-compose up` for PostgreSQL + Redis, then run backend + frontend separately
- **Production**: Cloud-hosted (VPS or managed platform), Docker Compose deployment. Public URL accessible 24/7 so players can manage characters and browse lore between sessions.
- **Env vars**: `.env` file (gitignored), `.env.example` committed
- **Required env vars**: `DATABASE_URL`, `REDIS_URL`, `ANTHROPIC_API_KEY` (for AI features), `SECRET_KEY` (auth)

### 3.5 DSA5 Rules Engine — Design Principles

All DSA5 rules logic lives in `engine/` as **pure functions with no side effects**. This means:
- Every function takes input data and returns a result — no database calls, no WebSocket emits
- Fully unit-testable without infrastructure
- The API layer calls engine functions, then persists results and broadcasts updates
- AI is never involved in mechanical resolution (dice, damage, conditions, probes)
- Engine functions are the single source of truth for DSA5 rules — when in doubt, cross-reference the Ulisses Regel-Wiki

The engine handles:
- **Probe resolution**: 1W20 (AT, PA, AW, FK) and 3W20 (talent/spell/liturgy probes) with automatic modifier aggregation
- **Damage calculation**: weapon dice + modifiers - RS, with Wuchtschlag/Finte/etc. applied
- **Condition tracking**: all 8 Zustände (Stufe I-IV), stacking rules, 8-total-levels handlungsunfähig threshold, magic vs physical stacking
- **Initiative**: INI_basis + 1W6, sortable, draggable, delay/ready actions
- **Movement**: grid pathfinding (A*), GS calculation with condition/Belastung modifiers, Passierschlag detection
- **Regeneration**: LeP/AsP/KaP recovery on rest, wound treatment, provision consumption
- **Leveling**: AP cost validation, prerequisite checking, stat recalculation

---


---

## 4. GM Cockpit

The GM Cockpit is the primary interface for the Game Master — a laptop or tablet in landscape mode. It is the command center from which the GM controls the entire session: story flow, map display, combat management, probes, NPC interaction, and what players see on their phones and the shared screen.

### 4.1 Cockpit Layout

The GM Cockpit is a single-screen layout with configurable panels. The default arrangement:

```
┌─────────────────────────────────────────────────────────────┐
│  [Session: TAVERNE-42]  [Kampfrunde 3]  [Tag 4 · Abend]    │
├──────────────────┬──────────────────────┬───────────────────┤
│                  │                      │                   │
│  SCENE /         │       MAP            │   PLAYER          │
│  STORY           │    (main canvas)     │   OVERVIEW        │
│  PANEL           │                      │                   │
│                  │  tokens, grid, fog,  │   all players     │
│  current scene   │  drawing tools       │   at a glance:    │
│  notes, NPCs     │                      │   LeP, conditions │
│  transitions     │                      │   turn status     │
│                  │                      │                   │
├──────────────────┼──────────────────────┼───────────────────┤
│  QUICK ACTIONS   │    COMBAT / LOG      │   ASSIST          │
│  probe, spawn,   │    initiative bar,   │   AI whisper,     │
│  whisper, sound   │    combat log        │   rules lookup    │
└──────────────────┴──────────────────────┴───────────────────┘
```

Panels are resizable and collapsible. The GM can drag panels to rearrange. During combat, the Combat/Log panel expands. During exploration, the Scene panel dominates. The layout remembers the GM's preference per mode (exploration vs combat).

### 4.2 Scene Manager

#### 4.2.1 Scene Structure

The GM prepares sessions as a flow of scenes. A scene is a self-contained narrative unit:

```python
class Scene:
    id: str
    title: str                      # "Die Taverne zum Goldenen Keiler"
    chapter: Optional[str]          # Grouping: "Kapitel 1: Ankunft"
    
    # Content
    read_aloud: Optional[str]       # Text the GM reads/paraphrases to players
    gm_notes: str                   # Private GM notes, secrets, hints
    gm_secrets: List[str]           # Hidden info revealed by probes/actions
    
    # NPCs present
    npcs: List[str]                 # NPC IDs from NPC registry
    
    # Encounters (optional)
    encounter_id: Optional[str]     # Pre-built encounter to activate
    
    # Map
    map_id: Optional[str]           # Associated map
    initial_tokens: List[TokenPlacement]  # Where tokens start
    
    # Handouts
    handouts: List[Handout]         # Images, letters, documents to push
    
    # Transitions
    transitions: List[SceneTransition]
    
    # Metadata
    mood: Optional[str]             # "tense" | "peaceful" | "mysterious" | "urgent"
    ambient_sound: Optional[str]    # Sound preset to auto-play
    time_advance: Optional[str]     # "2 Stunden" — auto-advances world clock
    
    # Runtime
    status: str                     # "upcoming" | "active" | "completed"
    notes_during_play: List[str]    # GM notes added during session

class SceneTransition:
    target_scene_id: str
    label: str                      # "Nordpfad nehmen"
    condition: Optional[str]        # "has_key" | "persuasion_success" | None
    gm_note: Optional[str]         # "Only if they talked to the Köhler first"
```

#### 4.2.2 Scene Flow in Play

The left panel shows the scene list as draggable cards. The active scene is highlighted. The GM can:
- **Activate a scene**: tap a scene card → its read-aloud text, map, ambient sound, and NPC list load. The map pushes to Table View and player phones.
- **Jump to any scene**: scenes are not strictly linear. The GM can skip ahead, go back, or activate any scene at any time.
- **Create a scene on the fly**: a "+" button creates a blank scene mid-session. The GM types a title and notes, optionally attaches a map. For when players go completely off-script.
- **Add notes during play**: a quick-note field on the active scene. "Players befriended the innkeeper" or "TODO: consequences next session."

#### 4.2.3 Improvisation Support

When the unexpected happens (and it always does):
- **Quick Scene**: one-tap to create a blank scene. No title required, just start playing. Name it later.
- **Quick Probe**: doesn't require a scene at all. The GM taps a player → selects talent → sets difficulty → probe goes to player's phone. Works from anywhere in the app.
- **Quick Spawn**: drag a creature from the databank sidebar onto the map. No encounter setup needed. It exists now.
- **Quick Handout**: snap a photo with the GM's device camera → instantly pushed to player phones or Table View.
- **Quick Note**: a persistent scratchpad that's always accessible, tagged to the current scene automatically.

### 4.3 Combat Tracker

#### 4.3.1 Entering Combat

The GM triggers combat by:
1. **Activating a prepared encounter** (from a scene), or
2. **Tapping "Kampf starten"** — the app prompts for initiative rolls from all participants

Initiative flow:
- App sends "Würfle 1W6 für Initiative" to each player's phone
- Players roll physical dice, input results
- GM rolls for creatures (physically and inputs, or taps "Auto-Roll" for backend random)
- App calculates INI_basis + 1W6 for each combatant and displays the sorted order

#### 4.3.2 Initiative Display

Initiative is shown as **draggable cards** in a horizontal bar:

```
[Yara 18] → [Elara 16] → [★ Balgra 14] → [Ork 1 12] → [Thorben 11] → [Ork 2 10]
                           ^^^ active turn
```

The GM can:
- **Drag cards** to reorder (creature delays action, surprise round adjustments)
- **Grey out** a card (stunned, skipped, handlungsunfähig)
- **Add a card** mid-combat (reinforcements arrive)
- **Remove a card** (creature dies, flees)
- **Tap a card** to see that combatant's full stats, conditions, and available actions

#### 4.3.3 Turn Resolution Flow

When it's a **player's turn**:
1. GM sees: player's stats, equipped weapon, conditions, available maneuvers
2. Player declares action verbally at the table
3. GM confirms and selects the action type in the app (or player selects on their phone)
4. App sends dice request to player's phone with all computed modifiers
5. Player rolls physical dice, inputs result
6. App resolves: hit/miss, then prompts defender for reaction (PA/AW)
7. If hit: app computes damage, deducts from target's LeP, applies conditions
8. App generates combat log entry
9. GM narrates the outcome in their own words
10. Initiative advances to next combatant

When it's a **creature's turn**:
1. GM decides what the creature does (app can suggest based on creature's `behavior` and `tactics` fields from databank)
2. GM selects target player
3. GM rolls dice (physical or auto-roll) and inputs results
4. Targeted player gets reaction prompt on their phone (PA/AW)
5. Resolution as above

#### 4.3.4 Modifier Aggregation

Before any probe, the app automatically calculates all active modifiers:

```
AT Base (Streitaxt):           14
Wuchtschlag I:                 -2
Schmerz 1:                     -1
Dunkelheit (Sichtmod. 1):     -1
Vorteilhafte Position:         +2
                               ──
Effective Target:              12
```

The GM sees this breakdown. The player sees it on their dice prompt. Modifiers come from:
- Character conditions (Schmerz, Furcht, Belastung, etc.)
- Maneuver choice (Wuchtschlag, Finte, etc.)
- Environmental factors (lighting, weather — set by GM)
- Positional factors (vorteilhafte Position, liegend, eingeengt)
- Weapon properties
- Active buffs/debuffs (spells, liturgies)

The GM can always **manually override** by adding or removing ad-hoc modifiers with a reason ("Rutschiger Boden: -1").

#### 4.3.5 Damage & Condition Resolution

On a successful hit:
1. Attacker's damage dice request sent (e.g., "Würfle 1W6+4 für Schaden")
2. Input received, app computes: raw TP + Wuchtschlag bonus - target RS = SP (Schadenspunkte)
3. Target's LeP reduced
4. App checks thresholds:
   - LeP ≤ 75% max → Schmerz 1 (if not already at that level from damage)
   - LeP ≤ 50% max → Schmerz 2
   - LeP ≤ 25% max → Schmerz 3
   - LeP ≤ 5 → critical (Todesschwelle check needed)
   - LeP ≤ 0 → dying/dead (based on rules configuration)
5. Condition changes broadcast to all relevant clients

#### 4.3.6 Condition Tracking Panel

A dedicated area on the GM screen shows all combatants with their active conditions:

```
Balgra:     Schmerz 1  [████░] 28/34 LeP
Ork 1:      Furcht 1 | Blutend (3 KR left)  [██░░░] 8/22 LeP
Schamane:   (none)  [████░] 14/18 LeP
```

Each condition shows:
- Level (I-IV)
- Source (damage, spell, environment)
- Duration timer if applicable (countdown in KR)
- Total condition levels sum (for 8-level handlungsunfähig threshold)

Conditions auto-expire when their timer runs out. The GM gets a notification: "Ork 1: Furcht abgelaufen."

#### 4.3.7 Combat Maneuver Support

When a player declares a maneuver, the GM selects it from a context-aware menu that shows **only what this character can actually do**:

**Basismanöver** (available to all, -2 extra without SF):
- Shows each maneuver's AT modifier and effect
- Greyed out if character lacks the SF (but still selectable with penalty noted)

**Spezialmanöver** (only shown if character has the SF):
- Filtered by character's special abilities list
- Shows incompatible combinations (e.g., "Cannot combine with Klingensturm")

**Combination validation**: if the player selects Wuchtschlag (Basis) + Hammerschlag (Spezial), the app flags: "Hammerschlag already includes extra damage — sure you want both?" The GM decides — the app advises, never blocks.

### 4.4 Probe System

#### 4.4.1 Quick Probe (the most-used feature)

The GM can trigger a probe from anywhere in the app:

**Single player probe:**
1. GM taps a player in the overview panel
2. Selects talent/attribute from a searchable dropdown
3. Sets difficulty modifier (or leaves at 0)
4. Tap "Senden" — probe request appears on player's phone
5. Player rolls 3W20 (talent) or 1W20 (attribute), inputs results
6. App computes: FP* remaining, QS, success/failure
7. GM sees result, narrates accordingly

**Group probe** (e.g., "Alle Sinnesschärfe"):
1. GM taps "Gruppenprobe" button
2. Selects talent, sets difficulty
3. All players receive the probe simultaneously
4. Results stream in as players roll — GM sees who passed and with what QS
5. Individual results are private (each player sees only their own)

**Opposed probe** (e.g., Schleichen vs Sinnesschärfe):
1. GM selects both participants and their respective talents
2. Both roll, app compares QS
3. Result shown to GM: "Yara (Schleichen QS 2) vs Wache (Sinnesschärfe QS 1) — Yara wins"

#### 4.4.2 Probe Shortcuts

Persistent shortcut buttons on the GM screen for the most common probes:
- 👁️ Sinnesschärfe (all) — one tap, goes to everyone
- 💪 Selbstbeherrschung (all)
- 🏃 Körperbeherrschung (individual)
- 🎯 Custom (opens talent picker)

The GM can configure which shortcuts appear.

### 4.5 NPC Registry

#### 4.5.1 NPC Cards

Every NPC the group encounters gets a card in the registry:

```python
class NPC:
    id: str
    name: str                       # "Gregor der Wirt"
    portrait: Optional[str]         # Uploaded image
    
    # Personality
    personality_tags: List[str]     # ["grummelig", "aber gutherzig", "redselig nach Bier"]
    voice_notes: Optional[str]      # "Tiefer Bass, rollt das R"
    
    # Knowledge
    knows: List[str]                # What this NPC can tell the players
    secrets: List[str]              # What they won't say easily
    
    # Attitude
    attitude_to_party: str          # "freundlich" | "neutral" | "misstrauisch" | "feindlich"
    attitude_history: List[Dict]    # [{session: 3, change: "neutral → freundlich", reason: "Spieler halfen gegen Orks"}]
    
    # Relationships
    relationships: List[Dict]       # [{npc_id: "...", type: "Bruder"}, {npc_id: "...", type: "Feind"}]
    
    # Location
    location: Optional[str]         # "Taverne zum Goldenen Keiler, Gareth"
    scene_ids: List[str]            # Scenes where this NPC appears
    
    # Combat (if applicable)
    is_combatant: bool
    creature_template_id: Optional[str]  # Databank reference for combat stats
    
    # Metadata
    first_met_session: Optional[int]
    tags: List[str]                 # ["questgeber", "händler", "verbündeter"]
    gm_notes: str                   # Free-text GM notes
    
    # Player visibility
    known_to_players: bool          # false = GM-only until revealed
    player_visible_info: str        # What players see: "Grimmiger Wirt mit Narbe"
```

#### 4.5.2 NPC in Play

During a session, the GM taps an NPC card and sees everything at a glance: personality, knowledge, attitude, relationships. When the players talk to the NPC, the GM roleplays them using the personality notes. If stuck, the AI assist can suggest dialog lines based on the NPC profile — but the GM chooses to use them, adapt them, or ignore them.

NPCs auto-populate in the campaign's Lore Book under "Personen" when the GM marks them as `known_to_players`.

#### 4.5.3 Relationship Map

A visual diagram showing NPC connections: who knows whom, alliances, rivalries, family ties. Built automatically from the `relationships` field. The GM can view this as a network graph and spot story threads: "Oh, the innkeeper's brother is the bandit leader — the players don't know that yet."

### 4.6 Encounter Builder

#### 4.6.1 Building an Encounter

The GM opens a map and drags creatures from the databank sidebar:

1. Search "Ork" → sees Orkräuber, Orkhäuptling, Orkschamane with stat previews
2. Drag "Orkräuber" onto map → token appears, creature instance created
3. Repeat — three Orkräuber and one Schamane placed
4. App shows encounter difficulty estimate: "Herausforderung: Schwer (4 Gegner, ∅ Kampfkraft 14 vs Gruppe ∅ 16)"
5. GM can click any placed creature to adjust: more LeP, better weapon, custom behavior
6. Save as encounter → attach to a scene

#### 4.6.2 Creature Customization

Each placed creature starts as a copy of the databank template. The GM can tweak:
- Name ("Ork-Anführer Grukk" instead of generic "Orkräuber")
- Stats (more LeP for a boss, higher AT for an elite)
- Equipment (give this one a better weapon)
- Behavior notes ("Flees at 25% LeP", "Protects the shaman")
- Loot ("Carries the key to the dungeon door")

#### 4.6.3 Encounter Difficulty Estimate

A simple heuristic, not a hard rule:
- Sum of creature offensive potential (AT × avg damage) vs party defensive potential (PA, RS, LeP pool)
- Displayed as: Leicht / Mittel / Schwer / Tödlich
- Color-coded in the encounter builder
- GM can ignore it — it's guidance, not a gate

### 4.7 Map & Token Tools

#### 4.7.1 GM Map Controls

The GM's map view has a toolbar:
- **Fog brush**: paint/erase fog of war (what players can see)
- **Draw tool**: freehand drawing on the player-visible layer (paths, markers, circles)
- **Wall tool**: click cell edges to toggle walls (blocks movement/pathfinding)
- **Difficult terrain**: mark cells as double-cost movement
- **Token palette**: drag creatures, NPCs, landmarks, items onto map
- **Measure tool**: click two points → shows distance in Schritt
- **Erase**: remove tokens, drawings, walls

The GM sees everything (all tokens, all fog). Players see only revealed areas and tokens visible to them.

#### 4.7.2 Token Management

The GM can interact with any token:
- **Click**: see stats, conditions, available actions
- **Drag**: move to new position (no GS validation for GM — GM is god)
- **Right-click / long-press**: context menu → remove, hide from players, add to initiative, edit stats
- **Bulk select**: drag a selection box, move multiple tokens at once (useful for creature groups)

#### 4.7.3 Pushing Views to Players

The GM controls what appears on each client:
- **Table View**: GM selects what the TV shows — map, handout image, narrative text, "scene loading" splash, or black screen
- **Player phones**: map is auto-synced with fog. GM can push handouts to all or individual players
- **Whisper**: GM taps a player → types a private message → appears only on that player's phone

### 4.8 Whisper System

The GM can send private messages to individual players:
- Tap player in overview → "Whisper" button → type message → send
- Message appears as a notification on that player's phone only
- No other player sees it
- Use cases: "Du bemerkst Gift im Becher", "Der Händler lügt — dein Gespür sagt dir das", "Du siehst eine versteckte Tür"
- Whispers are logged in the session protocol (GM can review later)
- Players can whisper back to the GM (but not to other players — talk at the table for that)

### 4.9 Quick Actions Toolbar

A persistent toolbar at the bottom of the GM screen with one-tap actions:

| Button | Action |
|--------|--------|
| 🎲 Probe | Open probe dialog (talent picker + player selector) |
| 👁️ Sinnesschärfe | Group Sinnesschärfe probe (one tap) |
| ⚔️ Kampf starten | Enter combat mode, trigger initiative |
| 👹 Spawn | Open creature search → drag to map |
| 📜 Handout | Push image/text to players |
| 💬 Whisper | Open whisper dialog |
| 🔊 Sound | Open soundboard |
| 📝 Notiz | Quick note attached to current scene |
| ⏰ Zeit | Advance world clock |
| 📖 Regel | Open rules search |

Customizable: GM can add/remove/reorder buttons.

### 4.10 AI Assist Panel

A collapsible side panel, **only visible to the GM, never to players**.

**Input**: free-text field where the GM types questions or requests.

**Use cases**:
- "Der Spieler will den Wirt bestechen — wie würde Gregor reagieren?" → AI suggests dialog based on NPC profile
- "Generier einen zufälligen Kräuterhändler" → AI creates NPC card with personality, inventory, knowledge
- "Was sind die Regeln für Fernkampf bei Dunkelheit?" → AI looks up rules and summarizes
- "Die Spieler gehen vom geplanten Weg ab und wollen die Höhle erkunden — was könnte drin sein?" → AI suggests 3-4 options fitting the adventure's tone and setting
- "Fasse die letzte halbe Stunde zusammen für das Protokoll" → AI generates session recap from combat log and scene transitions

**Critical constraints**:
- Response time must feel instant (<3 seconds for simple queries)
- AI never auto-acts. Every suggestion requires GM confirmation
- AI has access to: current scene data, NPC profiles, campaign lore, adventure structure, active combat state
- AI does NOT have access to: player private data, other campaigns, anything outside this session's scope

### 4.11 Soundboard

A grid of ambient loops and one-shot sound effects:

**Ambient loops** (toggle on/off, crossfade between):
- Taverne (Gemurmel, Kamin)
- Wald Tag / Wald Nacht
- Stadt (Marktlärm)
- Dungeon (Tropfen, Hall)
- Kampf (Distant metal, tension)
- Regen / Sturm / Wind
- Stille (just low background hum)

**One-shot SFX** (tap to play once):
- Türknarren, Donner, Wolfsgeheul, Schwertklirren, Explosion, Schrei, Glocke, Hufgetrappel

Audio plays through the GM's device speaker (or a connected Bluetooth speaker). Optional: stream to player phones for headphone-wearing players.

The GM can assign an ambient loop to a scene in prep — it auto-plays when the scene activates.

### 4.12 Time & Weather System

#### 4.12.1 World Clock

A persistent clock showing in-game time and date:
- Aventurische Zeitrechnung (Praios 15, 1041 BF — or simplified as needed)
- Day/night cycle with automatic Sichtmodifikator calculation
- GM advances time manually: "2 Stunden vergehen", "Nachtruhe (8 Stunden)"

On time advance, the app automatically:
- Updates lighting modifiers
- Ticks condition/spell/poison timers
- Calculates regeneration on rest
- Consumes provisions
- Progresses disease stages

#### 4.12.2 Weather

The GM sets weather from a dropdown: Klar / Bewölkt / Regen / Starker Regen / Sturm / Schnee / Nebel / Hitze

The app automatically applies relevant modifiers:
- Fernkampf penalties (wind, rain)
- Sichtmodifikatoren (fog, heavy rain)
- Movement modifiers (snow, mud)
- Relevant talent modifiers (Orientierung in fog, etc.)

The GM can override any auto-applied modifier.

### 4.13 GM Screen (Digital Spielleiterschirm)

A configurable reference panel with DSA5 tables the GM needs most:

**Default tables:**
- Zustandseffekte (all conditions with per-level effects)
- Sichtmodifikatoren (lighting table)
- Fernkampf-Modifikatoren (range, movement, cover)
- Wundschwellen (damage thresholds for Schmerz)
- Qualitätsstufen-Tabelle (FP* → QS mapping)
- Kritische Treffer / Patzer (confirmation rules)

**Contextual**: during combat, combat-relevant tables sort to top. During exploration, social/travel tables appear.

**Searchable**: GM types "Gift" → sees all poison rules, or "Finte" → sees maneuver rules.

The GM configures which tables are pinned and their order.

### 4.14 Session Controls

**Start Session**: GM creates or continues a session. Players join via room code.
**Pause Session**: freezes all timers, shows "Pause" on all screens. For bathroom breaks.
**End Session**: triggers session recap generation, AP award dialog, auto-saves all state.

### 4.15 Physical Table Interaction Model

This app is designed for people sitting in the same room, talking to each other. Every design decision flows from this fact.

#### 4.15.1 Voice is Primary, App is Secondary

The conversation at the table is the game. The app is infrastructure beneath it. This means:

- **No action in the app should require silence at the table.** If the group is debating whether to open the door, the app waits. No timeouts, no "waiting for input" popups, no auto-advance.
- **The GM advances the game, not the app.** Initiative never auto-advances to the next combatant. The GM taps "next" when the table is ready — maybe after 5 seconds, maybe after a 3-minute side conversation.
- **Verbal declarations come first, app input comes second.** The player says "I attack the Ork with Wuchtschlag" at the table. The GM hears it, confirms verbally, then inputs it in the app. The app is recording what already happened socially, not initiating it.
- **Phones face down most of the time.** Players should look at each other, not their screens. The phone buzzes gently when input is needed (dice roll, reaction choice), and goes quiet otherwise.
- **The GM can input on behalf of players.** If a player doesn't have their phone handy (eating pizza, gesticulating wildly), the GM can enter their dice result from the cockpit. No flow should break because a phone is face-down.

#### 4.15.2 Guided Flow for New Players

At the same time, the app actively helps players and GMs who are learning DSA5. It does this by showing **what happens next** without forcing a rigid sequence.

**Combat guidance (on GM screen):**

When combat is active, the GM sees a persistent "Flow Guide" strip:

```
Kampfrunde 3 → Balgra ist dran
[1. Aktion wählen] → [2. Manöver?] → [3. Würfeln] → [4. Verteidigung] → [5. Schaden] → [Weiter →]
 ^^^^^^^^^^^^^^^^
 current step
```

Each step is a gentle reminder, not a gate. The GM can skip steps (player decides to just move, no attack needed), go back (wait, he changed his mind), or tap any step to jump there. It's a breadcrumb trail, not a railroad.

**Combat guidance (on player phone):**

When it's a player's turn, their phone shows a step-by-step walkthrough:

```
DEIN ZUG — Balgra

Was willst du tun?
┌─────────────┐ ┌─────────────┐ ┌──────────────┐
│ ⚔️ Angreifen │ │ 🦶 Bewegen   │ │ 🎒 Gegenstand │
└─────────────┘ └─────────────┘ └──────────────┘
┌─────────────┐ ┌─────────────┐ ┌──────────────┐
│ 💫 Manöver   │ │ 🛡️ Verteid.  │ │ 🏃 Lösen      │
└─────────────┘ └─────────────┘ └──────────────┘

💡 Du kannst in deinem Zug:
   • 1 Aktion (Angriff, Zauber, Bewegen, etc.)
   • 1 freie Aktion (kurze Sache: paar Worte, etwas fallen lassen)
   • Dich bis zu 7 Schritt bewegen (deine GS)
```

The "💡 Du kannst..." hint is shown in Basic complexity mode. In Advanced mode, it's hidden — experienced players don't need it.

**After selecting "Angreifen":**

```
ANGRIFF MIT STREITAXT

Willst du ein Manöver einsetzen?
┌───────────────────┐ ┌───────────────────┐
│ Ohne Manöver      │ │ Wuchtschlag I     │
│ AT 14             │ │ AT 12 → TP +2     │
└───────────────────┘ └───────────────────┘
┌───────────────────┐ ┌───────────────────┐
│ Finte I           │ │ Hammerschlag      │
│ AT 13 → Gegner-2  │ │ AT 10 → TP ×2    │
└───────────────────┘ └───────────────────┘

💡 Basismanöver: Wuchtschlag (mehr Schaden) oder Finte (Gegner pariert schlechter)
   Spezialmanöver: Hammerschlag (doppelter Schaden, aber keine Parade)
```

Each option shows the **computed result** — not just the rule, but what it means for THIS character with THESE modifiers right now. The player doesn't need to calculate "AT 14 minus 2 for Wuchtschlag minus 1 for Schmerz" — the app shows "AT 11" directly.

**Defense guidance (when attacked):**

The player's phone buzzes. They see:

```
⚠️ DU WIRST ANGEGRIFFEN!
Orkräuber greift dich an — Treffer!

Wie verteidigst du dich?
┌──────────────────┐ ┌──────────────────┐
│ 🛡️ Parade         │ │ 💨 Ausweichen     │
│ Zielwert: 9      │ │ Zielwert: 5      │
│ (PA 8 + Buckler)  │ │ (AW 5)           │
└──────────────────┘ └──────────────────┘

💡 Parade ist mit Schild besser. Ausweichen
   klappt immer, auch ohne Waffe.
   1. Verteidigung pro Runde: ohne Abzug
   2. Verteidigung: -3 auf den Wert
```

Again: computed values, not raw rules. The player sees "Zielwert: 9" and knows they need to roll 9 or lower. They don't need to remember that their PA base is 8, Buckler gives +1, and Schmerz gives -1 but that's already factored in.

**Exploration guidance (on player phone):**

Outside combat, the player sees context-appropriate actions:

```
ERKUNDUNG

Was möchtest du tun?
(Sag es am Tisch — oder wähle eine Schnellaktion)

┌─────────────┐ ┌─────────────┐
│ 👁️ Umschauen │ │ 🔍 Untersuchen│
│ Sinnesschärfe│ │ (Sag was!)   │
└─────────────┘ └─────────────┘
┌─────────────┐ ┌─────────────┐
│ 🗣️ Reden     │ │ 🌿 Natur     │
│ Überreden etc│ │ Pflanzenkunde│
└─────────────┘ └─────────────┘

💡 Du kannst alles versuchen — sag einfach
   dem Meister was du tun willst. Diese Buttons
   sind nur Abkürzungen für häufige Aktionen.
```

The key phrase is **"Sag es am Tisch"**. The app reminds players that talking is the primary interface. The buttons are shortcuts for when you know you want a specific probe.

#### 4.15.3 Complexity Levels

Three levels, set by the GM per campaign:

**Basic** (new groups):
- Full step-by-step guidance in combat
- 💡 hint texts visible on all screens
- Simplified action menu (fewer options, clearer labels)
- Rules explanations shown inline ("Was ist ein Wuchtschlag?")
- Auto-suggested actions based on situation ("Du stehst neben dem Ork — Angriff?")
- GM Flow Guide always visible

**Standard** (comfortable groups):
- Step indicators without explanations
- No 💡 hints
- Full action/maneuver menu
- GM Flow Guide collapsible

**Advanced** (veteran groups):
- Minimal UI — just the numbers
- No guidance, no suggestions
- All optional rules enabled (Trefferzonen, Patzertabellen, etc.)
- GM Flow Guide hidden by default

The GM can switch complexity mid-campaign. Individual players cannot override the GM's setting (prevents one veteran player from hiding hints that the group needs).

#### 4.15.4 Table View (Shared Screen) Philosophy

The TV/projector is the group's shared focal point — like a campfire everyone looks at together. It shows:

- **Maps**: the dungeon they're exploring, the battlefield, the city overview
- **Handouts**: the letter they found, the painting on the wall, the wanted poster
- **Atmosphere**: a mood image (dark forest, cozy tavern, stormy sea) during narrative moments when no map is needed
- **Combat overview**: initiative order and combat log during fights

It does NOT show:
- Individual player stats (that's private, on their phone)
- GM notes or secrets
- AI assist responses
- Any meta-game UI (buttons, forms, settings)

The Table View is a window into the game world, not a software interface. It should feel like looking through a portal into Aventurien.

#### 4.15.5 Handling "Phones Down" Moments

Sometimes the whole table should be phones-down: a dramatic narrative moment, an intense NPC conversation, a player making an emotional speech in character. The GM has a **"Aufmerksamkeit"** button that:
- Dims all player phone screens to a subtle ambient glow
- Suppresses all notifications temporarily
- Shows a small "Zuhören..." indicator on phones
- Auto-releases after 2 minutes or when GM taps again

This signals: put the phone down, look up, this moment matters.

---


---

## 5. Player Dashboard

The Player Dashboard is each player's personal window into the game — a phone in portrait mode. It shows only what their character knows and owns. It is designed to be glanced at, not stared at: the player should spend 80% of their time looking at the table and talking, 20% looking at their phone for dice input, stats checks, and inventory management.

### 5.1 Dashboard Layout

The phone screen has three persistent zones:

```
┌─────────────────────────────┐
│  HEADER                     │  Character name, phase indicator
│  (always visible)           │  (Erkundung / Kampf / Lobby)
├─────────────────────────────┤
│  VITALS BAR                 │  LeP, AsP/KaP, SchiP, conditions
│  (always visible)           │  compact, glanceable
├─────────────────────────────┤
│                             │
│                             │
│  MAIN CONTENT               │  Tabs: context-dependent
│  (scrollable)               │  Exploration: Story, Inventar,
│                             │  Zauber, Talente, Karte, Journal
│                             │  Combat: Aktion, Karte, Charakter
│                             │
├─────────────────────────────┤
│  ACTION BAR                 │  Context-dependent:
│  (always visible)           │  Combat: dice input / action select
│                             │  Exploration: quick actions / PTT idea
└─────────────────────────────┘
```

The main content area uses tabs. Tab set changes based on game phase:

**Exploration tabs:** Erzählung · Inventar · Zauber/Liturgien · Talente · Karte · Journal
**Combat tabs:** Aktion · Karte · Charakter
**Lobby tabs:** Charakter · Mitspieler · Einstellungen

### 5.2 Header

Always visible, minimal height:

```
┌─────────────────────────────────────┐
│ ⚔️ Balgra Felszorn    ERKUNDUNG 🟢 │
│    Zwerg · Krieger                   │
└─────────────────────────────────────┘
```

- Character avatar/emoji + name + species/profession
- Current phase badge (Erkundung = green, Kampf = red, Lobby = gold)
- Tap on name → expands to full attribute overview (MU, KL, IN, CH, FF, GE, KO, KK)

### 5.3 Vitals Bar

Always visible below header. Compact, designed for a 2-second glance:

```
┌──────────────────────────────────────────────────┐
│ LeP [████████░░] 28/34    SchiP ●●○              │
│ Schmerz 1                                         │
└──────────────────────────────────────────────────┘
```

For magic users, AsP bar appears. For blessed characters, KaP bar appears. Both only if max > 0:

```
┌──────────────────────────────────────────────────┐
│ LeP [████████░░] 22/24    SchiP ●●○              │
│ AsP [█████░░░░░] 18/32                            │
└──────────────────────────────────────────────────┘
```

Conditions are shown as colored badges below the bars. Tap a condition badge → shows what it does mechanically ("Schmerz 1: -1 auf alle Proben, -1 GS").

The Vitals Bar pulses red when LeP drops below 25%. Pulses gold when it's your turn in combat.

### 5.4 Character Sheet

Accessible by tapping the header (quick expand) or via the Charakter tab. Shows the full character in sections:

#### 5.4.1 Attributes (Eigenschaften)

Grid of 8 attributes with current values:

```
┌──────┬──────┬──────┬──────┐
│MU 14 │KL 15 │IN 14 │CH 13 │
├──────┼──────┼──────┼──────┤
│FF 12 │GE 13 │KO 10 │KK  9 │
└──────┴──────┴──────┴──────┘
```

Tap an attribute → shows derived values that use it, and available attribute probes.

#### 5.4.2 Derived Values (Abgeleitete Werte)

```
LeP 22/24 · AsP 18/32 · GS 8 · INI 10
AW 6 · SK 3 · ZK 1 · SchiP 2/3
```

Each value tappable for a brief explanation ("AW (Ausweichen) = GE/2 = 6. Wird als Verteidigung gegen Angriffe genutzt.").

#### 5.4.3 Combat Values (Kampfwerte)

Shows equipped weapon(s) with computed AT/PA:

```
Streitaxt (Hiebwaffen)
  AT 14 · PA 8 · TP 1W6+4 · Reichweite: mittel

Buckler
  PA +1 · AT -1
```

If multiple weapons are available (in inventory), shows a "Waffe wechseln" option.

#### 5.4.4 Armor

```
Kettenhemd
  RS 4 · BE 3
  → GS -1 (von BE), INI -1 (von BE)
```

Shows effective GS and INI after BE is applied.

### 5.5 Inventory

#### 5.5.1 Inventory List

Full item list with weight tracking:

```
INVENTAR                     7.5 / 18 Stein
[Alle] [Waffen] [Tränke] [Werkzeug] [Sonstig]

🪄 Magierstab (Geweiht)          1.5 St.  AKTIV
   1W6+2 · Lang
👗 Elfische Reiserobe             0.5 St.  AKTIV
   RS 1 · BE 0
🧪 Heiltrank (schwach) ×2        0.2 St.
   Heilt 1W6+2 LeP
🌿 Alraune (getrocknet)          0.1 St.
   Alchimie-Zutat · selten
🪢 Seil (10 Schritt)             1.0 St.
🔥 Fackel ×3                      0.5 St.
💰 47 Silbertaler                 0.3 St.
```

**Tragkraft** (carry capacity) = KK × 2 in Stein. Weight bar at top. Turns red when approaching limit (each 25% over → +1 Belastung condition, auto-applied).

**Category filters** as horizontal pill buttons. "Alle" shows everything.

#### 5.5.2 Item Interaction

Tap an item → expands with action buttons:

- **Benutzen** (if usable) — triggers effect. Heiltrank: "Würfle 1W6+2" → heals LeP
- **Übergeben** — opens player picker. Select recipient → item moves to their inventory (both see the change instantly). In combat: costs a freie Aktion if adjacent
- **Ablegen** — drops item. Creates an item token on the map at character's position. In combat: freie Aktion
- **Ausrüsten / Ablegen** — for weapons, armor, shields. Equipping in combat costs 1 Aktion (or freie Aktion with Schnellziehen SF)
- **Info** — shows full item description from databank

#### 5.5.3 Inventory Persistence (Hybrid Model)

Characters have a **Basis-Inventar** that persists across campaigns (core equipment, personal items). When joining a campaign, a **Kampagnen-Snapshot** is created. Loot and changes during the campaign are tracked in the snapshot. When the campaign ends, the GM approves which items carry over to the Basis-Inventar.

```
Basis-Inventar (persistent):
  Magierstab, Reiserobe, Schreibzeug, 20 Silbertaler

Kampagnen-Inventar (this campaign):
  Basis + Heiltrank ×2, Alraune, Seil, Fackeln, +27 Silbertaler
  
End of campaign → GM approves:
  ✓ Alraune → goes to Basis
  ✓ +10 Silbertaler → goes to Basis
  ✗ Heiltränke → consumed/lost
```

#### 5.5.4 Group Inventory

A shared inventory space for items carried collectively (on a pack mule, in the camp, etc.). Any player can view it. Moving items between personal and group inventory is a simple drag or button tap. The GM can also add/remove items from group inventory directly.

### 5.6 Spells & Liturgies

#### 5.6.1 Spell Book (Magiebegabte)

Only visible if character has AsP > 0.

```
ZAUBERSPRÜCHE                    AsP 18/32
[Alle] [Angriff] [Heilung] [Schutz] [Erkennung]

🔥 IGNIFAXIUS                    FW 12    8 AsP
   1 Akt. · 16 Schritt · MU/KL/CH
   
⚡ FULMINICTUS                   FW 10   16 AsP
   2 Akt. · 16 Schritt · MU/KL/CH
   ⚠️ Nicht genug AsP
   
💚 BALSAM SALABUNDE              FW 11    8 AsP
   4 Akt. · Berührung · KL/IN/CH
```

Spells that cost more AsP than currently available are dimmed with a warning.

Tap a spell → expanded view:

```
🔥 IGNIFAXIUS                              8 AsP
   Probe: MU 14 / KL 15 / CH 13
   Zauberdauer: 1 Aktion
   Reichweite: 16 Schritt
   Wirkung: Feuerstrahl — QS × 2 SP Feuerschaden
   Wirkungsdauer: sofort
   Modifiziert um: ZK des Ziels
   
   [  WIRKEN  ]    [ Details ]
```

Tap "WIRKEN":
1. If in combat → action is registered, probe request sent (3W20 against MU/KL/CH with FW)
2. If in exploration → GM gets notified that player wants to cast, GM confirms, probe sent
3. After successful probe → QS calculated, GM narrates effect, AsP deducted

#### 5.6.2 Liturgy Book (Geweihte)

Identical structure to Spell Book, but for KaP and liturgies. Only visible if character has KaP > 0.

#### 5.6.3 Cantrips & Blessings (Zaubertricks & Segen)

Separate sub-section for minor magic/karmal abilities that are free or very cheap. Listed simply with a "Wirken" button.

### 5.7 Talents

#### 5.7.1 Talent List

Grouped by category with collapsible headers:

```
TALENTE

📚 Wissen (4)                              ▼
  Magiekunde        KL/KL/IN      FW 11   [Probe]
  Sagen & Legenden  KL/KL/IN      FW  8   [Probe]
  Götter & Kulte    KL/KL/IN      FW  6   [Probe]
  Rechnen           KL/KL/IN      FW  7   [Probe]

🗣️ Gesellschaft (4)                        ▶ (collapsed)
🏃 Körper (5)                               ▶
🔨 Handwerk (4)                             ▶
🌿 Natur (5)                                ▶
```

Quick-reference: attribute values shown at top of the talent screen so the player can estimate chances without switching views.

```
MU 14 · KL 15 · IN 14 · CH 13 · FF 12 · GE 13 · KO 10 · KK 9
```

#### 5.7.2 Talent Probes

Tap the [Probe] button next to a talent:
- If in combat → registers as the character's action for this round
- If in exploration → sends a request to the GM: "Elara möchte eine Magiekunde-Probe ablegen"
- GM confirms (and optionally sets a difficulty modifier)
- Player receives: "Magiekunde (KL 15 / KL 15 / IN 14) — FW 11 — Erschwernis: 2 — Würfle 3W20"
- Player rolls three dice, inputs three numbers
- App computes: points used per die, FP* remaining, QS
- Result shown to player and GM

In **Basic complexity mode**, after the result, the app explains:

```
Ergebnis: 8 / 12 / 6
KL 15: 15-8 = 7 (0 FP verbraucht)
KL 15: 15-12 = 3 (0 FP verbraucht)  
IN 14: 14-6 = 8 (0 FP verbraucht)
FP* = 11 (alle übrig) → QS 4 — Herausragender Erfolg! ✓
```

In **Advanced mode**, just: "QS 4 ✓"

### 5.8 Map View (Player Perspective)

#### 5.8.1 What Players See

The player sees the map on their phone, but **only what the GM has revealed**. Unrevealed areas are covered by fog of war (dark overlay). The player's own token is always centered and highlighted.

Visible elements:
- Revealed terrain and map background
- Their own token (highlighted, always visible)
- Other player tokens that are in revealed areas
- Creature/NPC tokens that the GM has made visible to them
- Landmark and item tokens in revealed areas
- GM drawings on the player-visible layer

NOT visible:
- Fog-covered areas
- Hidden tokens (creatures the GM hasn't revealed)
- GM-only drawings and notes
- Other players' movement range overlays

#### 5.8.2 Token Interaction

The player can interact with their own token:
- **Tap own token** → shows movement range overlay (highlighted cells they can reach based on GS minus conditions)
- **Drag own token** → movement request sent to backend for validation. If valid: token moves, all clients updated. If Passierschlag triggered: player is warned before confirming. If invalid (too far, wall in the way): token snaps back with a brief explanation ("Nicht genug Bewegung — GS 7, Entfernung 9")
- **Tap other token** → shows name and public info (creature: just the name and a health indicator like "Schwer verwundet". Other players: just name. NPC: name and attitude if known)
- **Tap item token** → "Aufheben?" prompt. In combat: costs 1 Aktion

**Important: All player movement and actions go through the GM.** See 5.8.5 GM Interrupt System.

#### 5.8.3 Map in Combat

During combat, the map additionally shows:
- Initiative order indicator (small number badges on tokens showing turn order)
- Active-turn token has a glowing border
- Distance measurement: tap own token, then tap target → shows distance in Schritt
- Reach indicator: when attacking, shows whether target is in weapon reach

#### 5.8.4 Pinch-to-Zoom

The map supports standard mobile gestures:
- Pinch to zoom in/out
- Pan by dragging (when not dragging own token)
- Double-tap to re-center on own token
- The map starts centered on the player's token and follows it when moved

#### 5.8.5 GM Interrupt System

The GM can interrupt ANY player action before it resolves. This is fundamental — just like at the real table where the GM says "Moment, bevor du da hingehst..."

**How it works — Movement:**

When a player drags their token to move:
1. The move request goes to the backend
2. The backend checks rules (GS, walls, Passierschlag) AND checks if the GM has any interrupt triggers set on those cells
3. **If no triggers**: move resolves normally
4. **If the GM has set a trigger** (trap, hidden creature, event): the move is **paused mid-way**. The player's token stops at the trigger cell. The GM sees:

```
⚠️ INTERRUPT: Balgra bewegt sich über Feld (5,3)
   Trigger: Fallgrube (versteckt)
   
   [Auslösen]  [Ignorieren]  [Probe verlangen]
```

The GM chooses:
- **Auslösen**: "Der Boden bricht unter deinen Füßen weg!" → GM applies effect (damage, condition, position change)
- **Ignorieren**: player had luck, move continues normally
- **Probe verlangen**: "Würfle Sinnesschärfe" → if passed, player notices the trap before stepping on it. If failed, trigger activates

**Real-time interrupt (no pre-set trigger):**

The GM can also interrupt spontaneously. On the GM cockpit, there is always a prominent **"HALT!"** button visible during any player action. When pressed:

1. All player actions freeze immediately — movements pause, dice inputs are locked
2. Every player phone shows: "⏸️ Der Meister unterbricht..."
3. The GM now has full control: narrate what happens, call a probe, spawn a creature, push a handout, apply damage, move tokens — anything
4. When ready, the GM taps "Weiter" and the player's turn resumes (or is over, if the interrupt changed the situation)

This is the digital equivalent of the GM holding up a hand at the table and saying "Stopp."

**Pre-set triggers (Prep):**

During session prep, the GM can place invisible triggers on map cells:

```python
class MapTrigger:
    id: str
    position: Cell               # Grid position
    trigger_type: str            # "trap" | "encounter" | "event" | "discovery"
    name: str                    # "Fallgrube" / "Hinterhalt" / "Geheimtür"
    gm_description: str          # What the GM sees: "3 Schritt tief, 1W6+2 SP Sturzschaden"
    
    # Resolution options
    auto_probe: Optional[Dict]   # {"talent": "Sinnesschärfe", "difficulty": 2} — auto-prompts probe
    on_trigger: Optional[Dict]   # {"damage": "1W6+2", "condition": {"Schmerz": 1}, "status": "Liegend"}
    on_success: Optional[str]    # "Du bemerkst lose Steine — hier ist eine Falle!"
    on_failure: Optional[str]    # "Der Boden gibt nach!"
    
    # Visibility
    visible_to_gm: bool         # Always true
    revealed: bool              # False until triggered or detected
    one_shot: bool              # Disappears after triggering once?
    
    # Trigger condition
    trigger_on: str             # "any_player" | "specific_player" | "any_creature"
```

Triggers are invisible on the player map. On the GM map, they show as subtle icons (⚠️ for traps, 👁️ for discoveries, ⚔️ for ambush encounters).

**Interrupt during combat actions (not just movement):**

The HALT button works during any phase:
- Player is choosing an action → HALT freezes the action menu
- Player is about to roll dice → HALT pauses the dice input
- Player declared an attack → GM interrupts: "Actually, the Ork ducks behind the pillar — you need to reposition first"
- A creature was about to die → GM interrupts: "It cries for mercy in broken Garethi!"

**The design principle: the GM always has veto power and narrative priority.** The app resolves mechanics, but the GM can override any mechanical outcome with narrative authority at any point. The HALT button is always 1 tap away.

### 5.9 Combat Actions (Player Phone)

#### 5.9.1 "Your Turn" Flow

When it's the player's turn, the phone signals clearly:
- Vitals bar pulses gold
- A gentle vibration (if enabled)
- The Action tab auto-opens showing available actions

**Note:** At any point during this flow, the GM can press HALT to interrupt (see 5.8.5). The player's phone shows "⏸️ Der Meister unterbricht..." and all inputs freeze until the GM releases.

The player flow:

```
1. AKTION WÄHLEN
   ⚔️ Angreifen  💫 Manöver  🦶 Bewegen  🎒 Gegenstand  🛡️ Verteidigung  🏃 Lösen
   (+ Zaubern / Liturgie if applicable)

   💡 Erklärung (Basic mode): "Du hast 1 Aktion und 1 freie Aktion pro Runde."

2. TARGET WÄHLEN (if attack)
   Map highlights enemies in range. Player taps target token.
   Or: dropdown list of enemies with distance shown.

3. MANÖVER WÄHLEN (optional)
   Only available maneuvers shown (based on character's SFs, weapon, situation).
   Each option shows the computed AT value after modifier.
   "Ohne Manöver: AT 14" / "Wuchtschlag I: AT 12, TP +2" / "Finte I: AT 13, Gegner PA -2"

4. WÜRFELN
   "Würfle 1W20 — Zielwert: 12"
   Full modifier breakdown shown.
   Large input field, tap to confirm.

5. ERGEBNIS
   "12 ≤ 12 — Treffer! ✓" or "15 > 12 — Daneben! ✗"
   If hit: defender gets reaction prompt.
   If critical (1): "Kritischer Treffer! Bestätigungswurf nötig — würfle nochmal 1W20"
   If Patzer (20): "Patzer! Der Meister entscheidet was passiert..."

6. SCHADEN (if hit connected)
   "Würfle 1W6+4 für Schaden (Streitaxt)"
   Input → "9 TP - 3 RS = 6 SP! Der Ork ächzt."
```

#### 5.9.2 "You're Being Attacked" Flow

When a creature attacks this player:
- Phone buzzes
- Alert appears: "⚠️ Orkräuber greift dich an — Treffer!"
- Reaction options shown with computed values:

```
🛡️ Parade (Buckler)     Zielwert: 9
💨 Ausweichen           Zielwert: 5
🙈 Nicht verteidigen    Treffer akzeptieren

💡 Dies ist deine 1. Verteidigung diese Runde (kein Abzug).
   2. Verteidigung wäre um 3 erschwert.

⭐ Schicksalspunkt? (+4 auf Verteidigung)  [●●○]
```

After choosing defense type:
- "Würfle 1W20 — Zielwert: 9"
- Input → "7 ≤ 9 — Parade gelingt! ✓ Du blockst den Hieb mit deinem Buckler."
- Or: "14 > 9 — Parade misslingt! ✗" → damage incoming

#### 5.9.3 Schicksalspunkte

A persistent indicator shows remaining SchiP (filled/empty dots). When relevant (before a probe, when taking damage, when rolling initiative), the app offers SchiP options:

```
⭐ Schicksalspunkt einsetzen?
• Verteidigung stärken (+4)
• Probe wiederholen (neuer Wurf)
• Schaden halbieren
• Zustand ignorieren (1 Runde)
[2 SchiP übrig]
```

Using a SchiP requires one tap + confirmation. The GM is notified.

#### 5.9.4 "Waiting for Your Turn"

When it's NOT the player's turn, the combat tab shows:
- Current initiative order with active combatant highlighted
- A compact combat log (last 3-4 events): "Elara trifft Ork 1 für 11 SP", "Ork 2 greift Thorben an — Parade gelingt"
- The map (for positioning awareness)
- No action buttons (nothing to tap until it's their turn or they're attacked)
- A subtle "Du bist in X Zügen dran" indicator

This is intentional: during other turns, the player should be watching the table, listening, planning. The phone should be glanceable, not engaging.

### 5.10 Journal (Personal Notes)

A simple note-taking space for the player:

```
JOURNAL                              + Neue Notiz

📌 Session 7 (heute)
   "Wirt Gregor hat gelogen — er kennt den Schwarzmagier"
   "Schlüssel zum Turm angeblich bei Händler Praxus in Gareth"

📌 Session 6
   "Elara schuldet mir 5 Silber"
   "Der Nordpfad führt zur Ogerruine — NICHT alleine gehen"

📌 Session 4
   "Spuren von Blutmagie am Wegschrein gefunden"
```

- Notes are auto-tagged with session number and date
- Searchable
- Private to the player — the GM cannot read them (unless the player explicitly shares)
- Optional: pin a note to the top as reminder

### 5.11 Quest Tracker

Quests assigned by the GM appear here:

```
AUFGABEN

🔴 HAUPTQUEST
   Das Schwert des Königs finden
   "Der Schwarzmagier Tharnax hat das Schwert in die
    Ogerruine gebracht. Findet und bringt es zurück."

🟡 NEBENQUEST
   Die verschwundenen Ziegen
   "Der Köhler vermisst seine Ziegen. Spuren führen
    zum Nordpfad."

🔵 PERSÖNLICH
   Balgras Rache
   "Den Mörder deines Vaters finden. Letzter Hinweis:
    Er wurde in Gareth gesehen."

✅ ABGESCHLOSSEN
   Den Ork-Überfall überleben (Session 3)
```

The player can see quests but not edit them — only the GM creates, updates, and completes quests. Players see quest status changes in real-time.

### 5.12 Whisper Inbox

When the GM sends a private whisper, it appears as a subtle notification at the top of the screen and is stored in a whisper inbox:

```
💬 NACHRICHTEN VOM MEISTER

[Neu] "Du bemerkst, dass Gregor nervös auf die
       Hintertür schaut. Niemand sonst sieht es."

[Session 6] "Das Amulett in deiner Tasche wird
             warm. Es reagiert auf etwas in der Nähe."
```

The player can reply to whispers (text back to GM only). Whispers are never visible to other players.

### 5.13 Leveling & Character Development

Between sessions, the player can spend AP (Abenteuerpunkte) awarded by the GM:

```
STEIGERUNG                    Verfügbare AP: 75

Talente steigern
  Magiekunde FW 11 → 12      Kosten: 15 AP   [Steigern]
  Überreden FW 8 → 9         Kosten: 8 AP    [Steigern]

Zauber steigern  
  IGNIFAXIUS FW 12 → 13      Kosten: 15 AP   [Steigern]

Eigenschaft steigern
  KL 15 → 16                 Kosten: 75 AP   [Nicht genug AP]

Neue Sonderfertigkeit
  Wuchtschlag II              Kosten: 25 AP   [Voraussetzungen ✓]
  Finte II                    Kosten: 20 AP   [Voraussetzungen ✓]
  Ausfall                     Kosten: 30 AP   [Benötigt: AT 15 ✗]
```

The app validates:
- AP cost per DSA5 Steigerungstabelle (based on Steigerungsfaktor A-E)
- Prerequisites (minimum attribute values, required SFs, minimum KtW)
- Maximum values per Erfahrungsgrad

Changes are **staged** — the player queues upgrades and confirms. The GM can optionally review before they apply (configurable per campaign). Derived values (AT, PA, LeP, AsP, etc.) auto-recalculate.

### 5.14 Character Profile & History

Each character has a profile page that grows over time:

```
BALGRA FELSZORN
Zwerg · Krieger · Ambosszwerge · Erfahren (975 AP)

[Portrait]

Bio (player-written):
"Balgra verließ die Hallen von Xorlosch nach dem
 Mord an seinem Vater. Er sucht Gerechtigkeit —
 oder Rache."

ERRUNGENSCHAFTEN
⚔️ Den Oger von Silberberg besiegt (Session 5)
🛡️ Die Kinder aus dem brennenden Haus gerettet (Session 3)
🗡️ 14 Gegner im Kampf bezwungen
📚 3 Abenteuer abgeschlossen

BEZIEHUNGEN
👤 Gregor der Wirt — Freund (seit Session 2)
👤 Tharnax der Schwarzmagier — Erzfeind
👤 Elara — Reisegefährtin (vertraut)

KAMPAGNEN-HISTORIE
📖 "Der Turm des Orkschamanen" — aktiv (seit Session 1)
📖 "One-Shot: Die Goblinhöhle" — abgeschlossen (Balgra hat überlebt)
```

**Errungenschaften** are awarded by the GM or auto-tracked (kill count, adventures completed). They're the character's legacy — especially meaningful if the character eventually dies.

### 5.15 Character Death

When a character reaches 0 LeP or below:

1. **Critical state**: phone screen shifts to a deep red tint. App tracks Todesschwelle rules (DSA5: character dies at negative LeP equal to KO).
2. **Dying**: if not stabilized, Blutend condition ticks damage each KR. Other players see "Balgra liegt am Boden!" on their combat log.
3. **Death**: if LeP reaches -(KO), the character dies. The app shows a memorial:

```
⚔️ BALGRA FELSZORN ⚔️
Zwerg · Krieger
* Praios 3, 1009 BF  † Phex 22, 1041 BF

Gefallen im Kampf gegen den Orkschamanen
im Turm von Silberberg.

Abenteuer bestanden: 3
Gegner bezwungen: 14
AP gesammelt: 975
Letzte Worte: "Für meinen Vater!"

[Charakter archivieren]
```

The character moves to the player's archive — fully readable, never deletable. The player can then create or import a new character for the campaign. The dead character's achievements remain in the campaign lore.

### 5.16 Notifications & Attention Model

The phone stays quiet until input is needed:

| Event | Signal | Urgency |
|-------|--------|---------|
| Your turn in combat | Gold pulse on vitals + gentle vibration | High — needs input |
| You're being attacked | Red flash + stronger vibration | High — needs reaction |
| GM whisper received | Subtle notification bar at top | Medium — read when ready |
| Probe requested by GM | Blue pulse + vibration | High — needs dice input |
| Item received from another player | Brief toast notification | Low — informational |
| Quest updated | Badge on Quest tab | Low — check later |
| GM "Aufmerksamkeit" signal | Screen dims, "Zuhören..." | Put phone down |

**Between turns in combat**: no notifications, no prompts, no distractions. The phone is a passive status display showing the combat log and map.

**During exploration**: the phone is mostly passive. The player glances at it for stats, inventory, or spells, but the primary interaction is talking at the table.

---


---

## 6. Persistence Layer

Everything in Aventuria VTT survives between sessions. Characters grow, campaigns accumulate lore, NPCs evolve, quests progress, and the world remembers. This section defines what persists, how it's structured, and who owns what.

### 6.1 Entity Hierarchy

```
User Account
├── Characters (owned by this player, usable across campaigns)
│   ├── Balgra Felszorn (active in "Orkkrieg" campaign)
│   ├── Grimwald der Söldner (resting — no active campaign)
│   └── Elric der Weise (dead — archived from "Goblinplage")
│
├── Groups (player is a member)
│   ├── "Die Tavernentrinker" (weekly group)
│   └── "One-Shot Crew" (occasional)
│
└── Campaigns (as GM or player)
    ├── "Der Turm des Orkschamanen" (GM, active)
    ├── "Orkkrieg" (player as Balgra, active)
    └── "Goblinplage" (player as Elric, archived — Elric died)
```

### 6.2 User Accounts

```python
class User:
    id: str                         # UUID
    username: str                   # Display name
    email: str                      # For login
    password_hash: str
    created_at: datetime
    
    # Ownership
    characters: List[Character]     # All characters this user owns
    groups: List[GroupMembership]   # Groups they belong to
    campaigns: List[CampaignRole]  # Campaigns with role (gm / player)
    
    # Preferences
    preferred_complexity: str       # "basic" | "standard" | "advanced"
    notification_settings: Dict     # Vibration, sound, etc.
    theme: str                      # "dark" (default) | future themes
```

Users can be in multiple groups and campaigns simultaneously. A user can be GM in one campaign and player in another.

#### 6.2.1 Character Management (in User Account)

Characters are owned by the user, not by campaigns. Character import and management happens in the user's personal account area — accessible anytime, not just during sessions:

**"Meine Charaktere" section in the user account:**
- **Import character**: upload JSON from DSA Ultimate or Optolith → app parses and validates → character appears in the user's character list
- **Create from template**: pick a quick-template archetype (Kriegerin, Magier, etc.) → customize name/bio → ready to play
- **View & manage**: see all characters with their state (active/resting/retired/dead), campaign assignments, AP totals
- **Level up**: spend AP on any resting or active character (between sessions). App validates against DSA5 Steigerungstabelle.
- **Edit bio/portrait**: update character profile, upload portrait image
- **Export**: download character as JSON (Aventuria VTT format or Optolith-compatible)

This is available 24/7 via the cloud-hosted app — a player can import a character from their couch on Tuesday, level up on Thursday, and show up to game night on Friday with everything ready.

**Character import flow:**
1. Player logs in → navigates to "Meine Charaktere" → "Charakter importieren"
2. Uploads `.json` file (from DSA Ultimate or Optolith)
3. App detects format (DSA Ultimate vs Optolith) and parses accordingly
4. Validation screen: shows parsed character with all stats, highlights any warnings ("Voraussetzung für SF Ausfall nicht erfüllt — trotzdem importieren?")
5. Player confirms → character saved to their account in "Created" state
6. Character is now available to assign to any campaign

### 6.3 Groups

A group is a stable set of people who play together regularly. Groups exist independently of campaigns — the same group can play multiple campaigns sequentially or in parallel.

```python
class Group:
    id: str
    name: str                       # "Die Tavernentrinker"
    created_by: str                 # User ID of creator
    members: List[GroupMember]
    campaigns: List[str]            # Campaign IDs (active + archived)
    created_at: datetime

class GroupMember:
    user_id: str
    display_name: str               # Can differ from username
    role: str                       # "admin" | "member"
    joined_at: datetime
```

Groups are optional. A campaign can exist without a group (ad-hoc session with a room code). But groups provide continuity: shared history, recurring players, persistent roster.

### 6.4 Campaigns

A campaign is the central persistence unit. It contains everything about an ongoing story: the adventure being played, the characters involved, the accumulated lore, the world state.

```python
class Campaign:
    id: str
    name: str                       # "Der Turm des Orkschamanen"
    description: str                # Brief campaign pitch
    group_id: Optional[str]         # Linked group (optional)
    
    # Roles
    gm_user_id: str                 # Who is the Game Master
    players: List[CampaignPlayer]   # Players with assigned characters
    
    # Story
    adventure_id: Optional[str]     # Imported adventure (if any)
    chapters: List[Chapter]         # Story structure (can diverge from adventure)
    current_scene_id: Optional[str]
    
    # World State
    lore_book: LoreBook
    quest_log: List[Quest]
    world_clock: WorldClock
    weather: str
    
    # NPCs
    npc_registry: List[str]         # NPC IDs active in this campaign
    
    # Maps
    maps: List[str]                 # Map IDs used in this campaign
    
    # History
    sessions: List[SessionLog]      # Completed session records
    current_session: Optional[str]  # Active session ID (if playing now)
    
    # Settings
    complexity_level: str           # "basic" | "standard" | "advanced"
    optional_rules: Dict[str, bool] # {"trefferzonen": false, "patzertabelle": true, ...}
    
    # Lifecycle
    status: str                     # "active" | "paused" | "archived"
    created_at: datetime
    last_played: datetime

class CampaignPlayer:
    user_id: str
    character_id: str               # Which character they're playing
    joined_at: datetime
    status: str                     # "active" | "absent" | "left"
```

#### 6.4.1 Campaign Creation & Invite Flow

The GM creates a campaign and invites players. Characters stay on the player's account — the campaign only holds a reference.

**Creation:**
1. GM logs in → "Neue Kampagne erstellen"
2. Sets name, description, complexity level, optional rules
3. Optionally imports an adventure (see Batch 5)
4. Campaign is created with status "active" and a unique **Kampagnen-Code** (e.g., `ORKKRIEG-7X`)

**Inviting players — three methods:**

**Method 1: Kampagnen-Code (primary)**
- GM shares the code verbally, via chat, or shows it on screen
- Player logs into their account → "Kampagne beitreten" → enters code
- Player appears in the campaign lobby with status "eingeladen"
- GM sees the player and confirms: "Annehmen" or "Ablehnen"

**Method 2: Direct invite (if in same group)**
- GM opens campaign settings → "Spieler einladen"
- Sees list of group members → taps to invite
- Player gets a notification on their account: "Du wurdest zur Kampagne 'Orkkrieg' eingeladen"
- Player accepts or declines

**Method 3: Open lobby (for one-shots / pickup games)**
- GM creates campaign with "Offene Lobby" enabled
- Anyone with the code can join without GM approval
- GM can still kick players from the lobby before starting

**After joining — Character assignment:**
1. Player is in the campaign lobby
2. Player selects which character to play from their account:
   - Pick an existing character (Resting or Created state)
   - Import a new character (JSON upload)
   - Use a quick template (pre-built archetype for new players)
3. Selected character's state changes to "Active" and a **Kampagnen-Snapshot** is created:
   - LeP, AsP, KaP set to max
   - Conditions cleared
   - Basis-Inventar copied into the Kampagnen-Inventar
   - Campaign-specific data initialized (empty quest log, no NPC relationships yet)
4. GM sees the character in the campaign overview and approves
5. Player is ready to play

**Key principle: the character lives on the player's account, not in the campaign.** The campaign holds:
- A reference to the character (`character_id`)
- The Kampagnen-Snapshot (campaign-specific inventory, current LeP/conditions, relationships)
- Session participation history

The character's core data (attributes, talents, spells, SFs, AP total, Basis-Inventar, profile, history) stays on the player's account and is updated there when AP are spent or when campaign-end carry-over happens.

```
PLAYER ACCOUNT                      CAMPAIGN
┌─────────────────────┐             ┌──────────────────────────┐
│ Character: Balgra   │◄──ref──────│ CampaignPlayer:          │
│                     │             │   character_id: balgra   │
│ Core Data:          │             │                          │
│   Attributes        │             │ Kampagnen-Snapshot:      │
│   Talents           │             │   Current LeP: 28/34     │
│   Spells / SFs      │             │   Conditions: Schmerz 1  │
│   Total AP: 975     │             │   Kampagnen-Inventar:    │
│   Basis-Inventar    │             │     Basis + Heiltrank ×2 │
│   Profile & History │             │     + 27 Silbertaler     │
│                     │             │   NPC Relationships      │
│ Campaign History:   │             │   Quest Progress         │
│   Orkkrieg (active) │             │                          │
│   Goblinplage (done)│             │ Session Logs             │
└─────────────────────┘             └──────────────────────────┘
```

**Leaving a campaign:**
- Player can leave voluntarily → character returns to "Resting" state, Kampagnen-Snapshot is preserved (in case they rejoin)
- GM can remove a player → same effect
- Character death → character archived on player's account, player can join with a new character

**Rejoining:**
- If a player left and wants to return, the GM re-invites them
- The preserved Kampagnen-Snapshot is restored (character picks up where they left off)
- If the player wants to bring a different character, they create a new snapshot

#### 6.4.2 Session Join Flow (Game Night)

Different from campaign joining — this is the "sit down at the table and connect" flow:

1. GM opens the campaign → "Session starten"
2. A **Session-Code** is generated (short-lived, e.g., `TAVERNE-42`). This is different from the Kampagnen-Code — it's ephemeral and only valid for this game night.
3. Session-Code displayed on GM screen and Table View (TV)
4. Players open the app on their phone → already logged in → tap "Session beitreten" → enter Session-Code
5. App recognizes the player's account, finds their character in this campaign, and loads the Kampagnen-Snapshot
6. Player appears on GM's cockpit as "Verbunden ✓"
7. When all players are connected (or the GM decides to start), GM taps "Los geht's"
8. Session is live — last session's state is restored (map positions, world clock, quest status, everything)

**If a player isn't in the campaign yet** (guest, new player, someone's friend tagging along):
- They enter the Session-Code → app detects they're not in this campaign
- Quick-join flow: pick a character (from account, import, or quick template) → GM approves in real-time → player is added to the campaign and the session simultaneously

**Reconnection:**
- If a player's phone disconnects (battery, WiFi dropout), their character stays in the session
- Player reopens the app → re-enters Session-Code (or it auto-reconnects if same session) → instantly back with full state

#### 6.4.3 End-of-Campaign Flow

When a campaign concludes (story finished, group decides to stop, or TPK):

1. GM marks campaign as "Abgeschlossen"
2. **AP Final Award**: GM awards final AP for the campaign conclusion
3. **Inventory Carry-Over**: for each player character, the GM reviews what carries over to Basis-Inventar (see 6.5.2)
4. **Character state update**: 
   - Surviving characters → "Resting" state on player's account
   - Core data updated: total AP, Basis-Inventar, campaign added to history
   - Kampagnen-Snapshot preserved in the archived campaign (for reference)
5. **Campaign archived**: fully readable by all participants, not editable. Lore Book, Session Logs, Timeline, Combat Replays — all preserved.
6. **Characters are free**: players can now assign them to a new campaign or let them rest

### 6.5 Character Lifecycle

A character exists independently from any campaign. It is owned by a user and can participate in multiple campaigns over its lifetime.

#### 6.5.1 Character States

```
CREATED ──→ ACTIVE ──→ RESTING ──→ ACTIVE (new campaign)
                │                         │
                ├──→ RETIRED (voluntary)   │
                │                         │
                └──→ DEAD (in-game death) ─┘ (archived, never deleted)
```

- **Created**: freshly imported or built. Not yet in a campaign.
- **Active**: assigned to a campaign, currently being played.
- **Resting**: between campaigns. Character exists with all their stats, inventory, and history intact. Can be assigned to a new campaign.
- **Retired**: player chose to stop playing this character. Preserved in archive. Can be "un-retired" if desired.
- **Dead**: character died in-game. Permanently archived with full history and death record. Cannot be un-retired (death is final — this is DSA, not a video game).

#### 6.5.2 Character Data Across Campaigns

**What persists (travels with the character):**
- Attributes (MU, KL, etc.) and derived values
- Talents, spells, liturgies, special abilities (and their levels)
- Total AP earned and spent
- Basis-Inventar (core equipment approved by GM at campaign end)
- Character profile: bio, portrait, achievements
- Full campaign history (which campaigns, what happened, when)

**What is campaign-specific (Kampagnen-Snapshot):**
- Kampagnen-Inventar (loot, consumables, money gained during this campaign)
- Current LeP, AsP, KaP (resets to max when joining a new campaign)
- Active conditions (clear when campaign ends)
- Relationships to campaign-specific NPCs
- Quest progress within this campaign

**End-of-campaign transfer flow:**
1. Campaign ends (GM marks as complete or archived)
2. For each player character, the GM sees a "Mitnahme" (carry-over) screen:
   ```
   Balgra — Kampagnen-Ende: "Turm des Orkschamanen"
   
   AP verdient in dieser Kampagne: 150 AP
   → Automatisch übernommen ✓
   
   Inventar-Übernahme ins Basis-Inventar:
   ✓ Magisches Amulett des Praios     (GM approved)
   ✓ +30 Silbertaler                  (GM approved)
   ✗ 5× Heiltrank                     (verbraucht/zurückgelassen)
   ✗ Schlüssel zum Turm               (kampagnenspezifisch)
   
   [Bestätigen]
   ```
3. Approved items merge into Basis-Inventar. Character returns to "Resting" state.

#### 6.5.3 Character Import

Characters can enter the system via:
- **DSA Ultimate JSON**: full character export from the app
- **Optolith JSON**: full character export from the desktop tool
- **Manual creation**: step-by-step builder in the app (future feature, post-MVP)
- **Quick template**: pick a pre-made archetype (Krieger, Magierin, Geweihter) with sensible defaults (for one-shots and new players)

On import, the app validates the character against DSA5 rules: are the AP costs correct? Are prerequisites met? Any obvious errors? Warnings are shown but don't block import — the GM has final say.

### 6.6 Lore Book

Every campaign has a living Lore Book that grows as the group plays. It is the collective memory of the story.

#### 6.6.1 Structure

```python
class LoreBook:
    campaign_id: str
    
    persons: List[LoreEntry]        # NPCs the group has met
    locations: List[LoreEntry]      # Places the group has visited
    discoveries: List[LoreEntry]    # Secrets, lore, knowledge uncovered
    events: List[LoreEntry]         # Major story events
    items: List[LoreEntry]          # Notable items found/lost
    factions: List[LoreEntry]       # Organizations, cults, kingdoms

class LoreEntry:
    id: str
    category: str                   # "person" | "location" | "discovery" | ...
    title: str                      # "Gregor der Wirt"
    
    # Dual-layer visibility
    player_text: str                # What the PLAYERS know
    gm_text: str                    # What the GM knows (includes spoilers)
    
    # Metadata
    first_encountered: str          # "Session 3, Szene: Die Taverne"
    last_updated: str               # "Session 7"
    tags: List[str]                 # ["questgeber", "gareth", "verdächtig"]
    linked_entries: List[str]       # Related lore entries
    linked_npcs: List[str]          # NPC IDs
    linked_quests: List[str]        # Quest IDs
    
    # Reveal history
    reveals: List[LoreReveal]       # Track when info was revealed to players

class LoreReveal:
    session: int
    previous_player_text: str       # What they knew before
    new_player_text: str            # What they know now
    trigger: str                    # "Magiekunde-Probe QS 3" | "NPC told them" | "GM revealed"
```

#### 6.6.2 Dual-Layer Visibility

Every lore entry has two text layers:

**Player-visible** (`player_text`): what the group collectively knows. Updated when new information is discovered. This is what players see in their Lore tab.

**GM-only** (`gm_text`): the full truth, including unrevealed secrets, future plot points, and hidden connections. Only visible on the GM cockpit.

Example:
```
"Gregor der Wirt"
Player-visible: "Grimmiger Wirt der Taverne zum Goldenen Keiler in Gareth. 
                 Schien nervös als wir nach dem Nordpfad fragten."
GM-only:        "Gregor ist der Bruder des Banditenführers Rondrik.
                 Er schickt Reisende absichtlich zum Nordpfad wo Rondriks
                 Bande sie überfällt. Wird kooperieren wenn konfrontiert."
```

When the players discover the truth (through probes, NPC dialog, or story events), the GM updates the player-visible text. The reveal is logged with session number and trigger.

#### 6.6.3 Auto-Population

The Lore Book fills automatically from game events:
- **NPC met**: when the GM activates a scene with NPCs and marks them as "introduced", they appear in the Lore Book under "Personen" with their `player_visible_info`
- **Location visited**: when the GM activates a scene with a map, the location is logged
- **Combat won/lost**: major combat events logged under "Ereignisse"
- **Quest completed**: logged under "Ereignisse"
- **Item found**: notable items (GM-flagged) logged under "Gegenstände"

The GM can always edit, delete, or manually add entries. Auto-population is a convenience, not a constraint.

#### 6.6.4 Player Access

Players see the Lore Book in their dashboard (new tab: "📖 Lore"). They can browse, search, and read — but not edit. It answers "What did we learn about...?" without the GM having to remember or the players having to dig through notes.

### 6.7 Quest System

```python
class Quest:
    id: str
    campaign_id: str
    
    title: str                      # "Das Schwert des Königs finden"
    description: str                # Longer quest description
    type: str                       # "main" | "side" | "personal"
    assigned_to: Optional[str]      # Character ID (for personal quests) or None (group quest)
    
    # Progress
    status: str                     # "active" | "completed" | "failed" | "abandoned"
    objectives: List[QuestObjective]
    
    # Story
    given_by: Optional[str]         # NPC ID who gave the quest
    reward_description: Optional[str]  # "Der König verspricht 500 Dukaten"
    
    # Metadata
    created_session: int
    completed_session: Optional[int]
    gm_notes: str                   # Private GM notes about this quest

class QuestObjective:
    id: str
    description: str                # "Finde den Eingang zur Ogerruine"
    completed: bool
    completed_session: Optional[int]
    hidden: bool                    # GM can hide objectives that aren't discovered yet
```

The GM creates and manages quests. Players see active quests on their phone (see 5.11). The GM can reveal hidden objectives as the story progresses: "Ihr erfahrt, dass das Schwert in der Ogerruine liegt" → objective becomes visible.

### 6.8 Timeline

A chronological record of everything that happened in the campaign:

```python
class TimelineEvent:
    id: str
    campaign_id: str
    
    # When (in-game)
    game_date: str                  # "Praios 15, 1041 BF"
    game_time: Optional[str]       # "Abend"
    
    # When (real-world)
    session_number: int
    real_date: date
    
    # What
    event_type: str                 # "story" | "combat" | "discovery" | "death" | "quest" | "npc_met" | "level_up"
    title: str                      # "Überfall auf der Waldstraße"
    description: str                # Brief summary
    
    # Who was involved
    characters_involved: List[str]  # Character IDs
    npcs_involved: List[str]        # NPC IDs
    
    # Links
    linked_lore: List[str]          # Lore entry IDs
    linked_quest: Optional[str]     # Quest ID if related
```

The timeline auto-populates from game events (combat results, scene transitions, quest changes) and can be manually edited by the GM.

Players see the timeline in their Lore tab as a scrollable chronology. It's the definitive "what happened when" reference for the group.

### 6.9 Session Logs

Each session is automatically recorded:

```python
class SessionLog:
    id: str
    campaign_id: str
    session_number: int
    
    # Timing
    started_at: datetime
    ended_at: datetime
    duration: timedelta
    
    # Participants
    gm_user_id: str
    players_present: List[str]      # Character IDs who were at this session
    players_absent: List[str]       # Character IDs who missed this session
    
    # Content
    scenes_visited: List[str]       # Scene IDs activated during session
    combat_encounters: List[CombatRecord]
    probes_rolled: List[ProbeRecord]
    lore_revealed: List[str]        # Lore entry IDs newly revealed
    quests_updated: List[str]       # Quest IDs that changed status
    
    # Economy
    ap_awarded: Dict[str, int]      # {character_id: AP amount}
    items_gained: List[Dict]        # [{character_id, item_id, source}]
    items_lost: List[Dict]          # [{character_id, item_id, reason}]
    
    # Narrative
    gm_session_notes: str           # GM's post-session notes
    recap_text: Optional[str]       # AI-generated or GM-written recap
    
    # Replay data
    combat_logs: List[CombatLogEntry]  # Full combat replay data

class CombatRecord:
    encounter_name: str
    rounds: int
    outcome: str                    # "victory" | "defeat" | "flee" | "negotiated"
    damage_dealt: Dict[str, int]    # {character_id: total SP dealt}
    damage_taken: Dict[str, int]    # {character_id: total SP taken}
    kills: Dict[str, List[str]]     # {character_id: [creature names killed]}
    deaths: List[str]               # Character IDs who died

class ProbeRecord:
    character_id: str
    talent: str
    difficulty: int
    result: str                     # "QS 3 ✓" or "Misslungen ✗"
    context: str                    # "Versuchte den Wirt zu überreden"
```

#### 6.9.1 Session Recap

At the end of each session, the GM can:
1. **Write a recap manually**: free text describing what happened
2. **Generate a recap**: the AI assist reads the session log (scenes, combats, probes, lore) and generates a 2-3 paragraph narrative summary
3. **Edit the generated recap**: the GM tweaks the AI output
4. **Skip it**: not every session needs a formal recap

The recap is stored in the session log and can be pushed to all players' phones before the next session starts. It solves the "What happened last time?" problem.

#### 6.9.2 Combat Replay

After a session, the GM (and optionally players) can step through each combat round-by-round:
- Who attacked whom
- Dice results and outcomes
- Damage dealt and taken
- When conditions were applied/expired
- Final outcome

This is useful for: dramatic retelling ("Remember when Balgra landed that critical hit?"), rules disputes ("Was that Wuchtschlag actually allowed?"), and GM learning (analyzing encounter balance).

### 6.10 AP (Abenteuerpunkte) System

AP are the currency of character growth in DSA5.

#### 6.10.1 AP Awarding

At session end, the GM awards AP:

```
SESSION ABSCHLUSS — AP VERGABE

Basis-AP (Teilnahme):           10 AP
Gutes Rollenspiel:              +5 AP  (individuell)
Schwierigen Kampf bestanden:    +5 AP
Rätsel gelöst:                  +3 AP
Quest abgeschlossen:            +5 AP
                                ──────
Gesamt pro Spieler:             ~25-30 AP

Individuelle Anpassung:
Balgra:  28 AP  (heldenhafter Kampf)
Elara:   30 AP  (Rätsel primär gelöst)
Thorben: 25 AP  (solides Spiel)
Yara:    27 AP  (kreativer Einsatz von Fährtensuchen)

[Vergeben]
```

The GM can use a template (Basis + Bonus) or set individual amounts manually. AP are immediately added to each character's available pool.

#### 6.10.2 AP Spending (between sessions)

Players spend AP in the Leveling screen (see 5.13). The app validates all purchases against DSA5 Steigerungstabelle rules. The GM can optionally require approval for certain upgrades (configurable: "free spending" vs "GM approval needed").

### 6.11 World State Persistence

The campaign's world state persists between sessions:

| Data | Persists where | Updated by |
|------|---------------|------------|
| World clock (date, time) | Campaign | GM (manual advance) |
| Weather | Campaign | GM (manual set) |
| Map fog of war states | Per map | GM (painting) |
| Token positions | Per map | GM + players (movement) |
| NPC attitudes | NPC registry | GM (story events) |
| Quest status | Quest log | GM |
| Character LeP/AsP/KaP | Character snapshot | Engine (damage, rest, spells) |
| Character conditions | Character snapshot | Engine (combat, events) |
| Character inventory | Character snapshot | Engine (trade, loot, use) |
| Lore entries | Lore book | GM + auto-population |
| Session notes | Session log | GM |

When a new session starts, everything is exactly where it was when the last session ended. No manual re-setup needed.

### 6.12 Data Ownership & Privacy

| Data | Visible to |
|------|-----------|
| Character stats, inventory, spells | Owning player + GM |
| Character profile, achievements | All players in campaign |
| Player journal notes | Owning player only (not even GM) |
| GM whispers | Recipient player + GM |
| Lore book (player layer) | All players |
| Lore book (GM layer) | GM only |
| NPC registry (full) | GM only |
| NPC registry (player-visible) | All players |
| Quest objectives (hidden) | GM only |
| Quest objectives (revealed) | All players |
| Session recap | All players |
| Combat replay | All players (optional, GM can restrict) |
| Other player's character sheet | Never (only GM sees all) |
| Other player's inventory | Never (only GM sees all) |

This strict separation mirrors the physical table: you don't look at another player's character sheet, and you don't read the GM's notes.

### 6.13 Backup & Export

- **Campaign export**: full JSON export of entire campaign (adventure, lore, sessions, characters). Can be imported to another instance.
- **Character export**: individual character as JSON (compatible with DSA Ultimate / Optolith format where possible).
- **Session log export**: single session as PDF or Markdown for archiving.
- **Automatic backup**: PostgreSQL daily snapshots (self-hosted: user configures backup location).

### 6.14 Multi-GM Support

A user can be GM in one campaign and player in another simultaneously. Within a single campaign, the GM role can be transferred:
- "Spielleiter übergeben" → select another group member → they become the new GM
- Previous GM becomes a player (needs to assign a character)
- All GM-only data (NPC secrets, lore GM-layer, encounter prep) transfers to the new GM

This supports groups where the GM role rotates between adventures.

---


---

## 7. Content Pipeline

Content is everything the app needs to run a session: creature stats, weapon data, spell definitions, adventure structures, map assets, token icons. The Content Pipeline defines how this data enters the system, how it's stored, and how it's extended.

### 7.1 Asset Library

The app ships with a comprehensive, pre-populated library of visual assets. The GM never needs to upload a single icon to get started — everything has a default visual from day one.

#### 7.1.1 Asset Categories

| Category | Examples | Used in |
|----------|----------|---------|
| **Creature tokens** | Ork, Goblin, Wolf, Drache, Skelett, Oger, Spinne, Dämon, Bär, Schlange, Bandit, Wache, Bauer... | Map tokens, encounter builder, combat tracker |
| **Player race tokens** | Mensch (m/f), Elf (m/f), Zwerg (m/f), Halbelf (m/f) — multiple styles per race | Map tokens, character profile fallback |
| **NPC tokens** | Wirt, Händler, Schmied, Priester, Magier, Adliger, Bettler, Söldner, Kind, Bauer... | Map tokens, NPC registry |
| **Weapon icons** | Schwert, Axt, Dolch, Speer, Bogen, Armbrust, Streitkolben, Stab, Keule, Hellebarde... | Inventory, character sheet, databank |
| **Armor icons** | Lederrüstung, Kettenhemd, Plattenrüstung, Robe, Schild (klein/mittel/groß), Helm... | Inventory, character sheet |
| **Item icons** | Heiltrank, Fackel, Seil, Schlüssel, Buch, Schriftrolle, Münzen, Edelstein, Proviant, Zelt, Werkzeug, Laterne, Kräuter, Gift, Amulett, Ring... | Inventory, loot, shop, map |
| **Building/structure icons** | Taverne, Schmiede, Tempel, Turm, Ruine, Brücke, Brunnen, Tor, Mühle, Bauernhof, Hafen... | Map landmarks |
| **Environment icons** | Baum, Felsen, Busch, Wasser, Feuer, Falle, Tür (offen/geschlossen), Truhe (offen/geschlossen), Treppe, Leiter, Zaun, Lagerfeuer... | Map objects, triggers |
| **Status/condition icons** | Schmerz, Furcht, Betäubung, Blutend, Brennend, Vergiftet, Liegend, Blind... | Condition tracker, vitals bar |
| **Mood/atmosphere images** | Dunkler Wald, Taverne innen, Stadtmarkt, Gebirge, Dungeon, Sumpf, Meer, Wüste, Schnee, Schlachtfeld... | Table View atmosphere display |
| **UI icons** | Würfel, Schwert (attack), Schild (defense), Herz (LeP), Stern (SchiP), Blitz (magic), Auge (perception)... | Throughout the app |

#### 7.1.2 Pre-Population Philosophy

Every entity in the databank is linked to a default asset:

- Create a Goblin encounter → Goblin token icon already assigned
- Add a Langschwert to inventory → sword icon already there
- Place a tavern on the map → tavern building icon ready
- Assign Schmerz condition → pain icon shows on vitals bar

**The GM changes nothing unless they want to.** Defaults are sensible, consistent in style, and immediately usable. The app feels complete out of the box.

#### 7.1.3 Asset Customization

The GM can optionally:
- **Replace any default** with an uploaded image (photo, artwork, custom icon)
- **Assign a different default** from the library (pick a different wolf icon for a dire wolf)
- **Upload character portraits** — players upload their own character art, which replaces the generic race token
- **Upload map backgrounds** — photos/scans of adventure book maps or hand-drawn maps

Customizations are scoped:
- **Per-character**: player's portrait applies everywhere that character appears
- **Per-campaign**: GM replaces the Goblin icon for this campaign → only affects this campaign
- **Per-instance**: this specific Goblin ("Grukk the Boss") gets a unique icon, other Goblins keep the default

#### 7.1.4 Asset Style & Format

- **Art style**: consistent fantasy illustration style across all assets. Semi-realistic, muted colors, aventurisches Feeling. NOT cartoony, NOT photorealistic.
- **Format**: SVG for icons (scalable, small file size), PNG for tokens/portraits (with transparency), WEBP for atmosphere images (compressed, fast loading)
- **Sizes**: tokens rendered at multiple sizes (32px for map overview, 64px for map zoomed, 128px for detail views). SVG scales natively.
- **Bundled**: core assets ship with the app (included in the frontend build). Extended packs downloadable on demand.

#### 7.1.5 Asset Packs (Future)

The library is extensible via asset packs:
- **Core Pack** (ships with app): ~500 assets covering the most common DSA5 needs
- **Extended Fantasy Pack**: additional creatures, items, environments
- **Regional Packs**: Tulamidische Länder, Bornland, Horasreich — region-specific buildings, clothing, NPCs
- **Community Packs**: user-submitted assets (curated quality)

For MVP: ship the Core Pack. Everything else is post-launch.

### 7.2 Databank (Reference Data)

The databank is the app's knowledge base of all DSA5 game entities — creatures, weapons, spells, talents, items, and rules. It is pre-populated and used by every system in the app.

#### 7.2.1 Databank Entities

```python
# ── Creatures ──
class CreatureTemplate:
    id: str                         # "ork_raeuber"
    name: str                       # "Orkräuber"
    category: str                   # "humanoid" | "tier" | "daemonisch" | "magisch" | "untot"
    size: str                       # "winzig" | "klein" | "mittel" | "groß" | "riesig"
    description: str                # Brief flavor text
    icon_id: str                    # Asset library reference (pre-assigned)
    token_size: int                 # Grid cells (1=medium, 2=large)
    
    # Attributes
    MU: int; KL: int; IN: int; CH: int; FF: int; GE: int; KO: int; KK: int
    
    # Combat values
    LeP: int; AsP: Optional[int]; KaP: Optional[int]
    SK: int; ZK: int; INI_basis: int; GS: int; AW: int; RS: int
    Schip: int                      # 0 for most (limits reactions!)
    
    # Attacks
    attacks: List[CreatureAttack]   # Multiple attacks possible
    
    # Special
    special_rules: List[str]        # "Nachtsicht", "Immunität gegen Gift", etc.
    immunities: List[str]
    vulnerabilities: List[str]
    
    # AI Assist hints
    behavior: str                   # "aggressive" | "defensive" | "pack_tactics" | "cowardly"
    flee_threshold: Optional[float] # LeP % at which creature flees
    tactics: str                    # Free text: "Flanks weakest, retreats if alone"
    habitat: List[str]              # "wald" | "gebirge" | "stadt" | "dungeon"
    
    # Loot
    loot_table_id: Optional[str]
    guaranteed_loot: List[str]      # Item IDs always dropped
    
    # Difficulty
    challenge_rating: int           # 1-10 for encounter balancing

class CreatureAttack:
    name: str                       # "Orkische Axt"
    AT: int
    damage: str                     # "1W6+4"
    reach: str                      # "kurz" | "mittel" | "lang"
    damage_type: str                # "schnitt" | "stich" | "wucht"
    special: Optional[str]          # "Gift (Stufe 3)" etc.


# ── Weapons ──
class WeaponTemplate:
    id: str                         # "langschwert"
    name: str                       # "Langschwert"
    icon_id: str                    # Asset library reference
    combat_technique: str           # "Schwerter"
    damage: str                     # "1W6+4"
    AT_mod: int; PA_mod: int
    reach: str
    weight: float                   # Stein
    price: float                    # Silbertaler
    two_handed: bool
    properties: List[str]           # "Zweihandfähig", "Stumpf", etc.
    damage_type: str                # "schnitt" | "stich" | "wucht"
    # Ranged-specific
    is_ranged: bool
    range_brackets: Optional[Dict]  # {"nah": 5, "mittel": 25, "weit": 50, "extrem": 100}
    reload_time: Optional[int]      # Aktionen
    ammunition: Optional[str]       # "pfeil" | "bolzen"
    availability: str               # "überall" | "selten" | "militärisch"
    description: str


# ── Armor ──
class ArmorTemplate:
    id: str; name: str; icon_id: str
    RS: int; BE: int; weight: float; price: float
    zones: Optional[Dict[str, int]] # RS per zone (optional rule)
    properties: List[str]
    description: str


# ── Shields ──
class ShieldTemplate:
    id: str; name: str; icon_id: str
    AT_mod: int; PA_mod: int
    weight: float; price: float
    size: str                       # "klein" | "mittel" | "groß"
    description: str


# ── Items ──
class ItemTemplate:
    id: str; name: str; icon_id: str
    category: str                   # "potion" | "tool" | "food" | "container" | "treasure" | "ammunition" | "misc"
    weight: float; price: float
    stackable: bool; max_stack: Optional[int]
    usable: bool; usable_in_combat: bool
    use_action_cost: Optional[str]  # "aktion" | "freie_aktion"
    effects: Optional[Dict]         # {"heal_lep": "1W6+2"} | {"cure_condition": "Gift"}
    consumable: bool
    charges: Optional[int]
    description: str


# ── Spells ──
class SpellTemplate:
    id: str; name: str
    tradition: List[str]            # ["Gildenmagier", "Hexe", "Elf"]
    probe: List[str]                # ["MU", "KL", "CH"]
    check_mod: str                  # "SK" | "ZK" | "none"
    casting_time: str               # "1 Aktion" | "2 Aktionen" | "Ritual"
    asp_cost: str                   # "8 AsP" | "4 AsP pro QS"
    range: str                      # "Berührung" | "8 Schritt" | "Selbst"
    duration: str                   # "sofort" | "QS x 3 KR" | "aufrechterhaltend"
    target: str                     # "Einzelperson" | "Zone" | "Objekt"
    effect_per_qs: Dict[int, str]   # {1: "1W6 SP", 2: "2W6 SP", ...}
    description: str
    # Engine automation
    damage: Optional[str]
    condition_inflicted: Optional[Dict]
    buff_effect: Optional[Dict]


# ── Liturgies ──
class LiturgyTemplate:
    # Same structure as SpellTemplate but with KaP instead of AsP
    id: str; name: str
    tradition: List[str]            # ["Praios", "Rondra", "Peraine"]
    probe: List[str]; check_mod: str
    casting_time: str; kap_cost: str; range: str; duration: str; target: str
    effect_per_qs: Dict[int, str]; description: str
    damage: Optional[str]; condition_inflicted: Optional[Dict]; buff_effect: Optional[Dict]


# ── Special Abilities ──
class SpecialAbilityTemplate:
    id: str; name: str
    category: str                   # "kampf_basis" | "kampf_spezial" | "kampf_passiv" | "allgemein" | "magisch"
    prerequisites: Dict             # {"combat_technique": {"Schwerter": 10}, "SF": ["Wuchtschlag I"]}
    ap_cost: int
    at_mod: Optional[int]
    pa_mod: Optional[int]
    damage_modifier: Optional[str]
    combinable_with: Optional[List[str]]
    exclusive_with: Optional[List[str]]
    applicable_techniques: List[str]
    description: str; rules_text: str


# ── Talents ──
class TalentTemplate:
    id: str; name: str
    category: str                   # "körper" | "gesellschaft" | "natur" | "wissen" | "handwerk"
    probe: List[str]                # ["MU", "GE", "KK"]
    applications: List[str]         # Anwendungsgebiete
    encumbrance: str                # "ja" | "nein" | "evtl."
    description: str


# ── Herbs & Potions ──
class HerbTemplate:
    id: str; name: str; icon_id: str
    habitat: List[str]; rarity: str; price: float
    identification_talent: str; identification_difficulty: int
    description: str

class PotionTemplate:
    id: str; name: str; icon_id: str
    ingredients: List[Dict]; crafting_talent: str; crafting_difficulty: int
    crafting_time: str; price: float; weight: float
    effect: Dict; duration: Optional[str]; side_effects: Optional[str]
    description: str


# ── Poisons & Diseases ──
class PoisonTemplate:
    id: str; name: str
    type: str                       # "einnahme" | "kontakt" | "einatmen" | "wunde"
    level: int; onset: str; effect: Dict; duration: str
    resistance: str; antidote: Optional[str]
    description: str

class DiseaseTemplate:
    id: str; name: str
    infection: str; incubation: str; stages: List[Dict]
    resistance: str; treatment: str
    description: str


# ── Loot Tables ──
class LootTable:
    id: str; name: str
    entries: List[LootEntry]

class LootEntry:
    item_id: str
    probability: float              # 0.0 - 1.0
    quantity_min: int; quantity_max: int
    condition: Optional[str]


# ── Rules Reference ──
class RulesSnippet:
    id: str
    title: str                      # "Fernkampf bei Dunkelheit"
    category: str                   # "kampf" | "fernkampf" | "magie" | "talent" | "zustand" | "allgemein"
    keywords: List[str]             # ["fernkampf", "sicht", "dunkelheit", "modifikator"]
    content: str                    # Brief rules summary (own words, not copied from book)
    table: Optional[Dict]           # Modifier table if applicable
    source_reference: str           # "Regelwerk S. 245" (page reference, not content)
```

#### 7.2.2 Pre-Population Scope

**MVP (Phase 1):**
- ~50 most common creatures (Ork variants, Goblin, Wolf, Bär, Skelett, Zombie, Spinne, Bandit, Stadtwache, etc.)
- All core weapons (~40: Schwert, Axt, Dolch, Bogen, Armbrust, etc.)
- All core armor (~15) and shields (~6)
- ~80 common items (Heiltrank, Seil, Fackel, Proviant, etc.)
- ~30 most-used spells (Ignifaxius, Fulminictus, Balsam, Gardianum, etc.)
- ~20 most-used liturgies
- All talents (~60)
- All Kampf-Sonderfertigkeiten (~40)
- ~30 rules reference snippets for the most common questions
- Complete condition/status reference

**Phase 2 (post-MVP):**
- Expand to ~200 creatures, ~100 spells, ~60 liturgies
- Full herb/potion catalog
- Full poison/disease catalog
- All special abilities (~150+)
- Complete loot tables by creature type

**Phase 3 (community):**
- Community contribution system: users submit entries → reviewed → merged
- GM homebrew entries: per-campaign custom creatures/items/spells

#### 7.2.3 Databank Storage & Access

**Storage:** PostgreSQL tables, one per entity type. Indexed on `id`, `name`, `category` for fast lookups.

**Seeding:** `backend/databank/seed.py` reads JSON files from `databank-seed/` and upserts into PostgreSQL. Idempotent — can re-run safely. Run on first deploy and on data updates.

**Access patterns:**

| Consumer | Usage | Example |
|----------|-------|---------|
| Combat engine | Lookup creature/weapon stats | `get_creature("ork_raeuber")` → full stat block |
| Encounter builder | Browse/search creatures | GM types "Ork" → sees all Ork variants with stats and icons |
| Inventory system | Item lookup | `get_item("heiltrank")` → weight, effects, icon |
| Spell/liturgy system | Effect resolution | `get_spell("ignifaxius")` → probe, cost, damage formula |
| GM rules search | Quick reference | GM types "Finte" → sees maneuver rules + modifier table |
| Player browse | Reference on phone | Player browses their available spells with full descriptions |
| Map system | Token icons | Creature spawned → icon auto-assigned from `icon_id` |
| Encounter balancing | Difficulty estimate | Sum creature `challenge_rating` vs party stats |
| Loot generation | Post-combat drops | `roll_loot("ork_raeuber_standard")` → item list |

**API:**
```
GET    /api/databank/{type}                    # List with pagination + filter
GET    /api/databank/{type}/{id}               # Single entity
GET    /api/databank/{type}/search?q={query}   # Full-text search
POST   /api/databank/{type}                    # Add homebrew entry (GM only)
PUT    /api/databank/{type}/{id}               # Update homebrew entry
```

Types: `creatures`, `weapons`, `armor`, `shields`, `items`, `spells`, `liturgies`, `special_abilities`, `talents`, `herbs`, `potions`, `poisons`, `diseases`, `loot_tables`, `rules`

**Homebrew entries** are flagged `source: "homebrew"` and scoped to the campaign. They don't pollute the global databank.

#### 7.2.4 Legal Note

DSA5 game mechanics (stat values, dice formulas, combat rules) are usable in a tool. Verbatim text from Ulisses publications is copyrighted and cannot be reproduced. The databank stores:
- ✅ Stat values, dice formulas, modifiers, costs
- ✅ Self-written brief descriptions (1-2 sentences, own words)
- ✅ Page references ("Regelwerk S. 245")
- ❌ Full spell/creature descriptions copied from books
- ❌ Flavor text from official publications
- ❌ Complete rules text reproduced verbatim

#### 7.2.5 External Data Sources & Existing Projects

Several open-source projects and free asset libraries can accelerate databank population and asset creation. Since this is a private friend-group tool, licensing constraints are relaxed — but we still prefer open/CC0 sources where possible.

**DSA5-Specific Data Sources:**

| Source | What it provides | How we use it |
|--------|-----------------|---------------|
| **Optolith Database** (v1.5.2, installed locally) | Complete DSA5 game data: 332 spells, 246 liturgies, 97 cantrips, 12 blessings, 1,438 SAs, 257 weapons, 180 professions, 161 advantages, and more. Two-layer YAML: `de-DE/` (German text) + `univ/` (structured numerics). | **Primary data source (Session 14).** Converter at `backend/importers/optolith_converter.py` reads Optolith YAML and generates seed JSON. All seed data now sourced from Optolith. Run converter with `--dry-run` to preview, `--category` to convert specific types. |
| **DSA5 Regel-Wiki Scraper** (`theShmoo/DSA5RegelWikiParser`) | Scrapy spider that crawls `ulisses-regelwiki.de` and extracts structured data from all rule pages. | Run locally to generate initial JSON seed data for creatures, spells, talents, weapons, SFs, conditions. One-time extraction → manual review → seed files. |
| **Foundry VTT DSA5** (`Plushtoast/dsa5-foundryVTT`) | Complete DSA5 system implementation: character sheets, combat mechanics, skill rolls, condition handling. Open source (system code). Game data (creatures, spells) sold as Ulisses modules via F-Shop. | Study combat engine implementation as reference for our rules engine. Probe resolution, modifier aggregation, condition stacking logic are well-tested there. |
| **DSA5 Extension DB** (`Plushtoast/dsa5-extensiondb`) | Community-built database of ~3.000 spell/liturgy extensions with Active Effect definitions (modifier keys, cost adjustments, duration handling). | Direct reference for spell effect automation. The modifier key structure (`system.AsPCost.value`, `defenseMalus`, etc.) informs our effect system design. |
| **svrin/dsa5gen** | Backbone data models for DSA5 cultures, professions, races, talents, advantages, disadvantages, SFs. | Cross-reference for data completeness. May be outdated (2015) but useful for talent/SF lists. |
| **Optolith-to-Foundry** (`ntfoster/optolith-to-foundry`) | Import module that maps Optolith JSON fields to Foundry VTT fields. Documents name mismatches between tools. | Invaluable for building our Optolith importer — shows which fields map where and which need special handling. |

**Data Population Strategy:**

1. **Phase 1 (MVP seed):** Run the Regel-Wiki scraper locally → extract creatures, weapons, armor, spells, talents, SFs → clean up and structure into our JSON format → manual review → commit as `databank-seed/*.json`
2. **Phase 1 (character import):** Use Optolith Database Schema to build exact JSON parser. Test with exported characters from the group.
3. **Phase 2 (expansion):** Cross-reference Foundry VTT DSA5 extension DB for spell effect automation. Expand creature catalog from scraper data.
4. **Ongoing:** When new content is needed, scrape specific Regel-Wiki pages or manually enter from books.

**Free Asset Sources (Icons, Tokens, Maps):**

| Source | What it provides | License | How we use it |
|--------|-----------------|---------|---------------|
| **OpenGameArt.org** | Thousands of RPG sprites, icons, portraits: fantasy weapons, potions, armor, monsters, dungeon tiles, UI elements | CC0 / CC-BY (varies per asset) | Primary source for item icons (weapons, potions, tools), condition icons, UI elements. Filter by CC0 for attribution-free use. |
| **itch.io CC0 Map Assets** | Old-school dungeon map symbols, cave tiles, overworld hexes, fantasy buildings — PNG formatted, multiple packs | CC0 | Map landmark icons (doors, chests, traps, stairs), dungeon tiles for map templates, building icons for overworld maps. |
| **2-Minute Tabletop** | Hand-drawn battle maps, tokens, and map assets specifically designed for VTTs. Free tier available. | Free tier: personal use | Pre-built battle map backgrounds for map templates (Waldstraße, Taverne, Höhle, etc.), token ring styles. |
| **Forgotten Adventures** | 140.000+ map-making assets: tokens, objects, terrain, walls, floors — organized by biome | Free core pack, premium expansions | Large-scale asset source for map objects (furniture, vegetation, dungeon features). Core pack sufficient for MVP. |
| **game-icons.net** | 4.000+ vector game icons: swords, shields, potions, scrolls, skulls, elements, conditions — all SVG | CC-BY 3.0 | Excellent for UI icons and condition badges. SVG format means perfect scaling. Single consistent style. |
| **Token Stamp 2** (rolladvantage.com) | Online tool that creates circular VTT tokens from any image | Tool (free) | Generate consistent token borders for creature and player tokens from any portrait art. |

**Asset Integration Plan:**

1. **MVP:** Curate ~300 icons from OpenGameArt (CC0) + game-icons.net (CC-BY) covering core items, creatures, conditions, and UI. Manually assign to databank entries.
2. **MVP:** Use 2-Minute Tabletop free maps as the 10 map templates (Taverne, Waldstraße, Höhle, etc.).
3. **Post-MVP:** Expand with Forgotten Adventures core pack for richer map objects. Commission or AI-generate DSA-specific creature portraits for a consistent visual style.
4. **Post-MVP:** Build a Token Stamp-like tool into the app so GMs can create tokens from uploaded art with consistent borders.

### 7.3 Adventure Import Pipeline

Adventures are the stories the GM runs. They can be original creations or adaptations of published DSA5 adventures. The import pipeline turns unstructured content (PDFs, photos, notes) into the structured format the app understands.

#### 7.3.1 Adventure Structure

```python
class Adventure:
    id: str
    title: str                      # "Der Turm des Orkschamanen"
    description: str
    author: str                     # "Original" or "Adaptiert von [Verlag]"
    difficulty: str                 # "Leicht" | "Mittel" | "Schwer" | "Tödlich"
    player_count: str               # "3-5 Spieler"
    estimated_duration: str         # "2-3 Sessions"
    setting: str                    # "Mittelreich, Nähe Gareth"
    
    # Structure
    chapters: List[Chapter]
    
    # NPCs
    npcs: List[NPCData]            # All NPCs with personality, knowledge, stats
    
    # Maps
    maps: List[MapData]            # Map images + grid config
    
    # Encounters
    encounters: List[EncounterData] # Pre-built encounters
    
    # Handouts
    handouts: List[Handout]        # Images, letters, documents
    
    # Loot
    loot_tables: List[LootTable]   # Adventure-specific loot
    
    # Metadata
    source: str                     # "original" | "imported" | "community"
    tags: List[str]                 # ["dungeon", "ork", "einsteiger"]

class Chapter:
    id: str
    title: str                      # "Kapitel 1: Die Ankunft"
    summary: str                    # Brief chapter summary for GM
    scenes: List[Scene]             # Scenes in this chapter
    chapter_goal: str               # "Die Spieler erfahren von der Bedrohung"

class Scene:
    id: str
    title: str
    read_aloud: Optional[str]       # Text for GM to narrate
    gm_notes: str                   # Private notes, secrets, hints
    gm_secrets: List[str]           # Revealed by specific probes/actions
    
    npcs: List[str]                 # NPC IDs present in this scene
    encounter_id: Optional[str]     # Linked encounter
    map_id: Optional[str]           # Linked map
    handouts: List[str]             # Handout IDs to push
    
    transitions: List[SceneTransition]
    triggers: List[MapTrigger]      # Traps, events, discoveries
    
    mood: Optional[str]
    ambient_sound: Optional[str]
    time_advance: Optional[str]

class SceneTransition:
    target_scene_id: str
    label: str                      # "Nordpfad nehmen"
    condition: Optional[str]        # "has_item:schlüssel" | "probe_success:überreden"
    gm_note: Optional[str]

class NPCData:
    id: str; name: str
    icon_id: str                    # Asset library reference (pre-assigned)
    personality_tags: List[str]
    voice_notes: Optional[str]
    knows: List[str]
    secrets: List[str]
    attitude: str
    combat_stats: Optional[str]     # Creature template ID if combatant

class EncounterData:
    id: str; name: str
    creatures: List[Dict]           # [{"template_id": "ork_raeuber", "count": 3, "positions": [...]}]
    difficulty_estimate: str
    gm_tactics: str                 # "Die Orks flankieren, der Schamane bleibt hinten"
    loot_table_id: Optional[str]
    map_id: Optional[str]

class Handout:
    id: str; name: str
    type: str                       # "image" | "text" | "letter" | "map"
    content: str                    # URL (image) or text content
    gm_note: Optional[str]         # "Zeig das erst nach der Probe"

class MapData:
    id: str; name: str
    image_url: str                  # Background image
    grid_config: Dict               # {"type": "square", "width": 20, "height": 15, "cell_px": 50}
    walls: List[Dict]               # Wall segments
    difficult_terrain: List[Dict]   # Cells with double movement cost
    initial_fog: str                # "all_hidden" | "all_revealed" | "custom"
    landmarks: List[Dict]           # Pre-placed landmark tokens with icons
```

#### 7.3.2 Three Ways to Create an Adventure

**Method 1: Manual Creation (in-app)**

The GM uses the Prep Workshop (`/prep`) to build an adventure from scratch:
1. Create adventure shell (title, description)
2. Add chapters and scenes using a visual editor
3. Write read-aloud text and GM notes per scene
4. Create NPCs via the NPC creator (pick personality traits, assign knowledge, select icon from asset library)
5. Build encounters using the Encounter Builder (drag creatures from databank onto maps)
6. Upload or select maps, draw walls and triggers
7. Add handouts (upload images, write letters)
8. Define scene transitions (which scene leads where)

This is the most control but the most work.

**Method 2: AI-Assisted Import (from PDF/photos)**

The GM uploads content from a published adventure:
1. Upload: PDF pages, or photos of physical book pages
2. AI extraction: Claude analyzes the content and produces a **structured draft**:
   - Identifies chapters, scenes, read-aloud text
   - Extracts NPC names, descriptions, stats
   - Identifies creature encounters with stat blocks
   - Recognizes maps (if included in PDF)
   - Extracts handout content (letters, documents)
3. **Review editor**: the GM sees the draft in a side-by-side view:
   - Left: original PDF/photo page
   - Right: extracted structured data
   - GM corrects errors, fills gaps, adjusts
4. **Finalize**: GM confirms, adventure is saved and playable

**Critical: the AI draft is always a starting point, never final.** It's clearly marked as "Entwurf — bitte prüfen" throughout. Expected accuracy: ~70-80% for well-formatted PDFs, lower for photos of physical books. The GM is the final authority.

**Extraction quality by content type:**
| Content | Expected accuracy | Common issues |
|---------|------------------|---------------|
| Read-aloud text | High (90%+) | Usually clearly formatted in books |
| NPC names + descriptions | High (85%+) | Personality nuances may be missed |
| Creature stats | Medium (75%) | Table formats vary, non-standard layouts |
| Maps | Low (50%) | Can identify that a map exists, can't auto-extract walls |
| Scene structure | Medium (70%) | Chapter/scene boundaries not always clear |
| Transitions | Low (40%) | Requires understanding narrative flow |

**Method 3: Community Templates**

Pre-built adventures shared by other GMs:
1. GM browses a template library (future feature)
2. Downloads an adventure package (JSON + assets)
3. Imports into their campaign
4. Adjusts as needed (rename NPCs, adjust difficulty, change loot)

For MVP: only Methods 1 and 2. Community sharing is post-launch.

#### 7.3.3 Adventure-to-Campaign Flow

An adventure is a template. A campaign is a living instance:

```
Adventure (template, reusable)
    │
    │  GM selects "Use this adventure"
    ▼
Campaign (live instance, mutable)
    │
    │  Story progresses, choices made,
    │  scenes skipped, new scenes added,
    │  NPCs killed, loot distributed
    ▼
Archived Campaign (frozen, readable)
```

When a campaign uses an adventure, it creates a copy of the adventure structure. From that point, the campaign's story can diverge freely: scenes can be reordered, skipped, or added. The original adventure template is unchanged — it can be used again for a different group.

### 7.4 Pre-Built Encounter Templates

Quick-use encounter templates for GMs who need a combat fast:

```
ENCOUNTER TEMPLATES

🗡️ Banditenüberfall (Mittel)
   4× Bandit, 1× Banditenanführer
   Karte: Waldstraße
   Taktik: "Anführer verhandelt wenn überlegen"
   Beute: 2W6 Silber pro Bandit

🕷️ Spinnennest (Leicht)
   6× Riesenspinne
   Karte: Höhle
   Taktik: "Schwächstes Ziel zuerst, fliehen bei 50% Verlust"
   Beute: Spinnenseide (Alchimie-Zutat)

💀 Untotengruft (Schwer)
   4× Skelett, 2× Zombie, 1× Wiedergänger
   Karte: Krypta
   Taktik: "Zombies als Frontlinie, Wiedergänger greift Magier"
   Beute: Antikes Amulett + 3W6×10 Silber
```

Each template includes:
- Pre-configured creatures with positions on a generic map
- Difficulty estimate for different party sizes
- Tactical notes for the GM
- Loot table
- A default map (generic Waldstraße, Höhle, Krypta, etc.)

The GM can use them as-is or customize before activating.

### 7.5 Quick Templates for Characters

For new players or one-shots, pre-built character archetypes:

```
SCHNELL-CHARAKTERE

⚔️ Kriegerin (Mensch)
   Kampfbetonter Charakter mit Schwert & Schild
   LeP 32 · GS 8 · AT 14 · PA 10
   Talente: Körperbeherrschung, Einschüchtern, Zechen

✨ Magier (Elf)  
   Fernkampf-Zauberer mit Stab
   LeP 22 · AsP 32 · GS 8
   Zauber: Ignifaxius, Gardianum, Balsam Salabunde

🛡️ Geweihter (Mensch, Peraine)
   Heiler und Unterstützer mit Streitkolben
   LeP 28 · KaP 28 · GS 8
   Liturgien: Balsam, Heiliger Beistand, Blendstrahl

🏹 Jägerin (Halbelf)
   Fernkämpferin und Kundschafterin
   LeP 26 · GS 8 · FK 14
   Talente: Fährtensuchen, Schleichen, Sinnesschärfe

🗡️ Söldner (Zwerg)
   Nahkämpfer mit schwerer Rüstung
   LeP 36 · GS 7 · AT 13 · PA 9 · RS 4
   Talente: Einschüchtern, Zechen, Mechanik

🎭 Gauklerin (Mensch)
   Sozialcharakter mit Dolch und Charme
   LeP 24 · GS 8
   Talente: Überreden, Betören, Verbergen, Taschendiebstahl
```

Each template is a fully valid DSA5 character with all stats, talents, spells, equipment, and inventory filled in. The player can use it as-is or customize (change name, swap a few items, adjust backstory). Quick templates use the "Created" character state and can be adopted into a player's account permanently.

### 7.6 Map Templates

Pre-built generic maps for common scenarios:

| Map | Grid size | Use case |
|-----|-----------|----------|
| Waldstraße | 16×10 | Ambush, roadside encounter |
| Taverne (Erdgeschoss) | 12×10 | Tavern brawl, social scene |
| Taverne (Obergeschoss) | 10×8 | Bedroom investigation, assassination |
| Höhle | 14×12 | Spider nest, troll lair, bandit hideout |
| Krypta | 12×14 | Undead encounter, tomb exploration |
| Stadtmarkt | 20×16 | Chase, social scene, pickpocket |
| Turm (pro Stockwerk) | 8×8 | Tower assault, mage tower |
| Brücke | 16×6 | Bridge battle, toll encounter |
| Lagerplatz | 12×12 | Camp attack, night ambush |
| Arena | 14×14 | Duel, gladiatorial combat |

Each includes: background image, pre-drawn walls, default landmarks (tables, doors, stairs), and suggested token placement zones. The GM can use them as-is, modify them, or replace the background with their own map image.

### 7.7 Content Import Formats

The app accepts various input formats:

| Input | Processing | Result |
|-------|-----------|--------|
| DSA Ultimate JSON | Direct parse | Full character |
| Optolith JSON | Direct parse | Full character |
| Adventure PDF | AI extraction → GM review | Structured adventure draft |
| Adventure photos | AI extraction → GM review | Structured adventure draft |
| Map image (JPG/PNG) | Load as background | Map ready for grid overlay |
| Token image (PNG) | Store as custom asset | Custom token/portrait |
| Handout image (JPG/PNG) | Store as handout | Pushable to players |
| CSV (items/creatures) | Parse columns | Bulk databank import |
| Aventuria VTT JSON | Direct import | Adventure/campaign/character package |

### 7.8 Export Formats

| Export | Contents | Use case |
|--------|----------|----------|
| Character JSON | Full character data (Aventuria VTT format) | Backup, share, move to another instance |
| Character Optolith JSON | Converted to Optolith format | Use character in Optolith |
| Campaign JSON | Full campaign (adventure, lore, sessions, characters) | Backup, migrate |
| Adventure JSON | Adventure template (reusable) | Share with other GMs |
| Session Log PDF/Markdown | Single session record | Physical archive, blog post |
| Lore Book PDF | Campaign lore in readable format | Campaign memento |

---


---

## 8. Realtime Layer

Everything that happens at the table must be reflected instantly on all connected devices. The realtime layer handles device communication, state synchronization, and the flow of a live session.

### 8.1 WebSocket Architecture

All live communication runs over WebSocket connections. REST is used only for CRUD operations (character management, campaign editing, databank browsing) that happen outside of live sessions.

```
GM Cockpit ◄──── WebSocket ────► Backend ◄──── WebSocket ────► Player Phone 1
                                    │
                                    ├──── WebSocket ────► Player Phone 2
                                    │
                                    ├──── WebSocket ────► Player Phone 3
                                    │
                                    └──── WebSocket ────► Table View (TV)
```

**Connection model:**
- Each live session is a WebSocket "room" identified by the Session-Code
- All clients in a room receive broadcasts, but messages can be targeted (GM-only, single-player, all-players, table-view-only)
- Backend is the single source of truth — clients never communicate directly with each other
- Redis Pub/Sub handles message routing between WebSocket connections

#### 8.1.1 Message Types

Every WebSocket message is a typed JSON envelope:

```json
{
  "type": "combat_action",
  "from": "player_1",
  "target": "gm",
  "payload": { ... },
  "timestamp": "2026-03-21T19:47:12Z"
}
```

**Message categories:**

| Category | Direction | Examples |
|----------|-----------|---------|
| **GM Commands** | GM → Backend → Clients | `scene_activate`, `combat_start`, `probe_request`, `whisper`, `halt`, `token_spawn`, `fog_update`, `handout_push`, `time_advance`, `sound_play`, `attention` |
| **Player Actions** | Player → Backend → GM | `action_declare`, `dice_result`, `defense_choice`, `move_request`, `item_use`, `item_transfer`, `schip_use` |
| **State Updates** | Backend → All/Target | `state_update` (LeP, AsP, conditions changed), `initiative_update`, `token_move`, `inventory_change`, `combat_log_entry`, `quest_update`, `lore_reveal` |
| **Session Control** | GM ↔ Backend | `session_start`, `session_pause`, `session_end`, `player_connected`, `player_disconnected`, `player_reconnected` |
| **System** | Backend → Client | `error`, `validation_fail`, `sync_full` (full state resync on reconnect) |

#### 8.1.2 Broadcast Targeting

Not every message goes to everyone. The backend filters by recipient:

| Target | Who receives | Example |
|--------|-------------|---------|
| `all` | GM + all players + Table View | Map token moved, combat log entry |
| `gm` | GM only | Player wants to cast a spell (GM confirms first) |
| `players` | All players (not GM, not Table View) | "Der Meister unterbricht..." |
| `player:{id}` | Single player | Whisper, dice request, personal state update |
| `table` | Table View only | Scene image change, handout display, atmosphere update |
| `gm+table` | GM + Table View | Full initiative display (Table shows it, GM controls it) |

#### 8.1.3 State Synchronization

The backend holds the authoritative game state in Redis (ephemeral session data) and PostgreSQL (persistent campaign data).

**On connect/reconnect:** Client receives a `sync_full` message containing the entire current state relevant to their role:
- GM: full game state (all players, all creatures, all fog, all triggers)
- Player: their character state + visible map + combat status + active quests
- Table View: current display mode + visible map + initiative + combat log

**During session:** Incremental `state_update` messages push only changed fields. Clients apply patches to their local state. If a client detects inconsistency (e.g., local LeP doesn't match server), it requests a `sync_full`.

**Offline tolerance:** If a client loses connection for <30 seconds, it auto-reconnects and receives a `sync_full`. No data is lost. If >30 seconds, the player re-enters the Session-Code.

### 8.2 Session Lifecycle Flow

```
GM: "Neue Session starten"
│
├──► Backend creates session, generates Session-Code
├──► Table View shows: Session-Code + "Warte auf Spieler..."
│
│   Player 1 enters code ──► Backend: player_connected
│   Player 2 enters code ──► Backend: player_connected
│   Player 3 enters code ──► Backend: player_connected
│
├──► GM sees all players connected
├──► GM taps "Los geht's"
│
├──► Backend: session_start → loads last session state
├──► All clients: sync_full with restored state
├──► Table View: shows last scene's map/image
├──► Player phones: show character dashboard
│
│   ─── SESSION IN PROGRESS ───
│   GM activates scenes, triggers probes, runs combat
│   Players declare actions, roll dice, manage inventory
│   State continuously synced
│
├──► GM taps "Pause" ──► All: "⏸️ Pause" (timers frozen)
├──► GM taps "Weiter" ──► All: resume
│
├──► GM taps "Session beenden"
│
├──► Backend: session_end
├──► AP award dialog for GM
├──► Session log auto-generated
├──► All state persisted to PostgreSQL
├──► Clients: "Session beendet. Bis zum nächsten Mal!"
└──► WebSocket connections closed
```

### 8.3 Combat Realtime Flow

Combat is the most message-intensive phase. Here's the exact message sequence for one attack:

```
1. GM taps "Nächster Zug" (or initiative auto-advances after previous turn)
   → Backend: initiative_update {current: "player_1"}
   → Player 1 phone: "DEIN ZUG" (gold pulse, vibration)
   → Table View: Balgra's token glows
   → All: combat_log_entry "Balgra ist am Zug"

2. Player 1 selects "Angriff" + "Ork 1" + "Wuchtschlag I"
   → Player → Backend: action_declare {type: "melee_attack", target: "ork_1", maneuver: "wuchtschlag_1"}
   → Backend validates: is it player's turn? Is target in range? Does player have SF?
   → Backend computes modifiers (AT base, Wuchtschlag -2, Schmerz -1, etc.)
   → Backend → Player 1: dice_request {type: "AT", target_value: 11, dice: "1W20", modifiers: [...]}
   → GM sees: "Balgra greift Ork 1 an (Wuchtschlag I) — wartet auf Würfel"

3. Player 1 rolls physical die, enters "8"
   → Player → Backend: dice_result {roll_id: "...", value: 8}
   → Backend validates: 1 ≤ 8 ≤ 20 ✓
   → Backend resolves: 8 ≤ 11 → Hit!
   → Backend checks: is it a 1? (critical) No. Is it a 20? (Patzer) No.
   → Backend → All: combat_log_entry "Balgra trifft! (8 ≤ 11)"

4. Backend prompts Ork's defense (GM controls creatures)
   → If auto-roll: Backend rolls PA for Ork, resolves immediately
   → If physical GM roll: GM gets dice_request for Ork's PA
   → Result: Ork's PA fails (rolled 15 > PA 8)
   → All: combat_log_entry "Ork 1 kann nicht parieren (15 > 8)"

5. Backend prompts damage roll
   → Backend → Player 1: dice_request {type: "damage", dice: "1W6+4", bonus: "+2 (Wuchtschlag)"}
   → Player 1 rolls, enters "5"
   → Backend: 5 + 4 + 2 = 11 TP - 3 RS = 8 SP
   → Backend updates Ork's LeP: 22 → 14
   → Backend checks Schmerz thresholds: 14/22 = 63% → Schmerz 1 triggered
   → Backend → All: state_update {creature: "ork_1", lep: 14, conditions: {Schmerz: 1}}
   → All: combat_log_entry "8 SP! Ork 1 hat jetzt 14/22 LeP und Schmerz 1"
   → GM narrates: "Balgras Axt kracht in die Schulter des Orks! Er taumelt zurück."

6. Backend advances initiative to next combatant
   → initiative_update {current: "ork_schamane"}
   → GM's turn to control the Schamane
```

### 8.4 Probe Realtime Flow (Outside Combat)

```
1. GM taps Sinnesschärfe (Gruppenprobe)
   → Backend → All players: probe_request {talent: "Sinnesschärfe", probe: ["KL","IN","IN"], difficulty: 0}
   → Each player's phone shows: "Sinnesschärfe — Würfle 3W20"

2. Players roll and input (in any order, no turn dependency)
   → Player 1 → Backend: probe_result {values: [8, 12, 6]}
   → Player 3 → Backend: probe_result {values: [14, 17, 3]}
   → Player 2 → Backend: probe_result {values: [5, 9, 11]}

3. Backend computes each result (FP*, QS) and sends to GM
   → Backend → GM: probe_results_summary {
       "Balgra": {success: true, qs: 2, detail: "8/12/6 vs 12/14/12, FW 4, FP* 6"},
       "Elara": {success: true, qs: 4, detail: "5/9/11 vs 15/14/14, FW 11, FP* 11"},
       "Thorben": {success: false, qs: 0, detail: "14/17/3 vs 12/14/13, FW 5, FP* -3"}
     }

4. Each player sees only their own result
   → Player 1: "Sinnesschärfe QS 2 ✓"
   → Player 2: "Sinnesschärfe QS 4 ✓ — Herausragend!"
   → Player 3: "Sinnesschärfe ✗ — Misslungen"

5. GM narrates based on results (only GM knows who passed/failed)
```

### 8.5 Map Synchronization

Map state is synced incrementally:

| Event | Message | Recipients |
|-------|---------|-----------|
| GM reveals fog | `fog_update {cells: [...], revealed: true}` | All players + Table View |
| Player moves token | `move_request {token_id, target}` → validated → `token_move {token_id, from, to}` | All |
| GM spawns creature | `token_spawn {template_id, position, visible_to}` | Targeted (may be hidden from some players) |
| GM draws on map | `draw_stroke {layer: "player_visible", points: [...], color, width}` | All players + Table View |
| GM draws on GM layer | `draw_stroke {layer: "gm_only", ...}` | GM only |
| GM places trigger | `trigger_place {position, type, ...}` | GM only (invisible to players) |
| Token takes damage | `token_update {id, health_pct}` | All (players see % bar, not exact LeP) |

The map canvas on each client applies these updates in real-time. If a bulk update is needed (new map loaded), a `map_load` message sends the complete map state.

### 8.6 Whisper Flow

```
1. GM taps player → "Whisper" → types message
   → Backend: whisper {from: "gm", to: "player_2", text: "Du bemerkst Gift im Becher"}
   → Player 2 phone: subtle notification, message in whisper inbox
   → No other player sees anything

2. Player 2 can reply
   → Backend: whisper {from: "player_2", to: "gm", text: "Kann ich es heimlich ausschütten?"}
   → GM cockpit: whisper notification from Player 2
```

Whispers are stored in the session log for GM review later.

### 8.7 Table View Control

The Table View is a "dumb display" — it only shows what the backend tells it to show, controlled entirely by the GM.

**Display modes** (GM switches between these):

| Mode | What it shows |
|------|-------------|
| `map` | Current map with visible tokens, fog applied, GM drawings |
| `handout` | A single image or text filling the screen (letter, portrait, wanted poster) |
| `atmosphere` | A mood image (dark forest, cozy tavern, stormy sea) — no UI, just immersion |
| `combat_overlay` | Map + initiative bar overlay + combat log sidebar |
| `scene_splash` | "Kapitel 2: Die Ogerruine" — title card while GM prepares next scene |
| `black` | Black screen — for dramatic pauses or "lights out" moments |
| `lobby` | Session-Code + connected players (pre-session) |

The GM switches modes from the cockpit toolbar. Transitions are instant or with a brief fade.

**Table View never shows:** player stats, GM notes, AI assist responses, any form of software UI (buttons, forms, settings). It is a window into the game world.

### 8.8 HALT System (Realtime Interrupt)

The GM's HALT button (see Batch 3, Section 5.8.5) works through the realtime layer:

```
1. GM presses HALT
   → Backend: halt_broadcast {}
   → All player phones: inputs freeze, "⏸️ Der Meister unterbricht..." overlay
   → Table View: subtle "⏸️" indicator (doesn't break immersion)
   → Combat: initiative timer paused, dice inputs locked

2. GM does what they need (narrate, spawn creature, call probe, move token, etc.)

3. GM presses "Weiter"
   → Backend: halt_release {}
   → All clients: resume normal operation
   → If a player was mid-dice-input: their input field is restored, they continue
```

The HALT is instantaneous (<100ms from button press to all clients frozen). This is critical — if the GM says "Stopp!" at the table, the phones must stop accepting input before the player can finish tapping.

### 8.9 Attention Signal

```
GM presses "Aufmerksamkeit"
→ Backend: attention_signal {}
→ All player phones: screen dims to ambient glow, "Zuhören..." text
→ Table View: no change (it's already showing game content)
→ After 2 minutes or GM taps again: attention_release → phones return to normal
```

### 8.10 Sound Broadcast

```
GM taps ambient loop "Wald Nacht"
→ Backend: sound_play {type: "ambient", id: "wald_nacht", action: "start"}
→ Table View / connected speaker: starts playing loop

GM taps SFX "Donner"
→ Backend: sound_play {type: "sfx", id: "donner", action: "once"}
→ Table View / connected speaker: plays once

GM switches to "Kampf" ambient
→ Backend: sound_play {type: "ambient", id: "kampf", action: "crossfade"}
→ Audio crossfades from current ambient to new one
```

Audio plays on the Table View device (connected to speakers). Optional: stream to player phones (for headphone users in noisy environments).

### 8.11 Reconnection & Error Handling

| Scenario | Handling |
|----------|---------|
| Player phone disconnects | Character stays in session. Other players see "Balgra: Verbindung getrennt". GM can act on behalf of player. |
| Player reconnects (<30s) | Auto-reconnect, `sync_full`, seamless resume |
| Player reconnects (>30s) | Re-enter Session-Code, `sync_full`, character state fully restored |
| GM device disconnects | Session pauses automatically. All players see "Verbindung zum Meister unterbrochen — bitte warten." |
| GM reconnects | `sync_full`, session resumes. No data lost (state is in Redis/PostgreSQL, not on GM device). |
| Table View disconnects | No impact on gameplay. GM/players continue normally. TV reconnects and gets `sync_full`. |
| Backend crashes | Redis ephemeral state lost. PostgreSQL persistent state intact. On restart: session can be resumed from latest snapshot, but combat-in-progress may lose the last few actions. |

**Mitigation for backend crash:** Periodic snapshots of Redis combat state to PostgreSQL (every 30 seconds). On restart, the GM can choose "Letzte Session fortsetzen" which loads the most recent snapshot. Cloud hosting with proper monitoring minimizes crash risk.

### 8.12 Latency Requirements

| Action | Max acceptable latency | Notes |
|--------|----------------------|-------|
| HALT signal | <100ms | Must freeze before player finishes tapping |
| Dice result → outcome display | <300ms | Instant-feeling |
| Token move → all clients see it | <500ms | Smooth enough for dragging |
| Map fog reveal | <500ms | Batch update acceptable |
| Sound trigger → audio plays | <200ms | Must feel reactive |
| Whisper → recipient sees it | <500ms | Near-instant |
| Scene change → all clients update | <1000ms | Brief transition acceptable |

On a local WiFi network with a good internet connection to the cloud server, these targets are achievable. For the HALT signal, the critical path is GM device → cloud server → player device — typically <150ms on a decent connection. If the group's internet is unreliable, a mobile hotspot as backup is recommended.

---


---

## 9. AI-Powered Features

### 9.1 AI Import Portal

A dedicated workflow for converting raw adventure content (PDFs, photos, notes) into fully structured, playable campaign data. This is the GM's primary prep tool for imported adventures.

#### 9.1.1 Portal Workflow

```
┌─────────────────────────────────────────────────────────┐
│                   AI IMPORT PORTAL                        │
│                                                           │
│  ┌─────────┐    ┌──────────┐    ┌──────────┐    ┌─────┐│
│  │ UPLOAD  │ →  │ AI       │ →  │ REVIEW   │ →  │DONE ││
│  │         │    │ EXTRACT  │    │ & EDIT   │    │     ││
│  │ PDFs    │    │          │    │          │    │Ready││
│  │ Photos  │    │ Claude   │    │ GM fixes │    │to   ││
│  │ Notes   │    │ processes│    │ & adjusts│    │play ││
│  └─────────┘    └──────────┘    └──────────┘    └─────┘│
└─────────────────────────────────────────────────────────┘
```

**Step 1: Upload**

The GM uploads raw content:
- **PDF pages** from a published adventure (drag & drop, multi-page)
- **Photos** of physical book pages (camera or gallery upload)
- **Text notes** (free-form text the GM typed or copy-pasted)
- **Map images** (scans/photos of adventure maps)
- **Mixed** — any combination of the above

The portal accepts everything at once. No need to sort by type first.

**Step 2: AI Extraction**

Claude API processes the uploaded content and produces a structured draft:

```json
{
  "adventure": {
    "title": "Der Turm des Orkschamanen",
    "description": "Ein Abenteuer für 3-5 erfahrene Helden...",
    "chapters": [
      {
        "title": "Kapitel 1: Der Hilferuf",
        "scenes": [
          {
            "title": "Die Taverne zum Goldenen Keiler",
            "read_aloud": "Die schwere Eichentür knarrt auf...",
            "gm_notes": "Die Spieler treffen hier auf den Köhler...",
            "npcs": ["koehler_gregor"],
            "transitions": [
              {"target": "scene_1_2", "label": "Dem Köhler folgen"},
              {"target": "scene_1_3", "label": "In der Taverne bleiben"}
            ],
            "mood": "mysterious",
            "map_description": "Taverne: Gastraum 10x8 Schritt, Theke links, 6 Tische, Kamin hinten rechts, Treppe nach oben hinten links, Eingangstür Süden, Hintertür Osten zum Hof"
          }
        ]
      }
    ],
    "npcs": [...],
    "encounters": [...],
    "maps": [...],
    "handouts": [...]
  },
  "extraction_confidence": {
    "scenes": 0.85,
    "npcs": 0.90,
    "encounters": 0.70,
    "maps": 0.40
  },
  "warnings": [
    "Kreaturenwerte auf Seite 14 schlecht lesbar — bitte prüfen",
    "Karte auf Seite 8 erkannt aber nicht automatisch extrahierbar"
  ]
}
```

The AI also generates a `map_description` for every scene that has a location — a structured text description of the physical space. This feeds into the AI Map Generator (see 9.2).

**Processing pipeline per content type:**

| Upload type | AI processing | Output |
|-------------|--------------|--------|
| PDF (text-readable) | Direct text extraction + Claude structured analysis | Scenes, NPCs, encounters, read-aloud, transitions |
| PDF (scanned/image) | OCR first, then Claude analysis | Same, but lower confidence |
| Photo of book page | Vision API → OCR → Claude analysis | Same, lowest confidence |
| Map image | Image stored as-is + Claude describes what it sees | Map image + AI description for map generation |
| Free-form text notes | Claude structures into scenes/NPCs | Flexible — adapts to whatever format the GM writes in |

**Step 3: Review & Edit**

The GM sees a side-by-side editor:

```
┌──────────────────────┬───────────────────────┐
│ ORIGINAL (uploaded)  │ EXTRACTED (structured) │
│                      │                        │
│ [PDF page image]     │ Szene: "Die Taverne"   │
│                      │ Vorlesetext: "..."      │
│                      │ GM-Notizen: "..."       │
│                      │ NPCs: Gregor [✏️]       │
│                      │ Übergänge: [✏️]         │
│                      │ Karte: [Generieren →]   │
│                      │                        │
│ [confidence: 85%]    │ ⚠️ Kreaturenwerte       │
│                      │    bitte prüfen         │
└──────────────────────┴───────────────────────┘
```

The GM can:
- **Edit** any extracted field (fix OCR errors, adjust descriptions)
- **Delete** incorrectly extracted content
- **Add** missing content the AI didn't catch
- **Re-extract** a section ("Versuch nochmal mit Seite 14")
- **Generate map** from the scene's `map_description` (see 9.2)
- **Assign icons** to NPCs and creatures from the asset library
- **Link** scenes to each other (transition graph)
- **Mark as reviewed** — turns confidence indicator green

**Step 4: Finalize**

GM taps "Abenteuer fertigstellen" → the structured data becomes a playable Adventure in the app. It can be attached to a campaign immediately.

#### 9.1.2 AI Processing Architecture

```python
# ai/extraction.py — Pipeline

async def extract_adventure(uploads: List[Upload]) -> AdventureDraft:
    # 1. Classify each upload
    classified = [classify_content(u) for u in uploads]  # pdf_text, pdf_scan, photo, map_image, text_notes
    
    # 2. Extract text from non-text sources
    texts = []
    for item in classified:
        if item.type == "pdf_text":
            texts.append(extract_pdf_text(item))
        elif item.type in ("pdf_scan", "photo"):
            texts.append(await ocr(item))  # Whisper Vision or similar
        elif item.type == "text_notes":
            texts.append(item.content)
        elif item.type == "map_image":
            texts.append(await describe_map_image(item))  # Claude Vision
    
    # 3. Send all text to Claude with structured extraction prompt
    draft = await claude_extract(
        system_prompt=ADVENTURE_EXTRACTION_PROMPT,
        content=texts,
        output_schema=AdventureDraft.schema()
    )
    
    # 4. Post-process: validate creature stats, link NPC references, etc.
    draft = post_process(draft)
    
    # 5. Generate map descriptions for scenes that have locations
    for scene in draft.scenes:
        if scene.location_description and not scene.map_id:
            scene.map_description = await generate_map_description(scene)
    
    return draft
```

**Prompt engineering** is critical. The extraction prompt tells Claude:
- Extract in German (adventure content is German)
- Separate read-aloud text (usually italicized or boxed in books) from GM notes
- Identify NPC names and create stub NPC entries
- Parse creature stat blocks (AT, PA, LeP, RS, TP format is consistent in DSA5 books)
- Identify scene boundaries (chapter breaks, location changes)
- Generate `map_description` as a structured spatial layout
- Flag low-confidence extractions with warnings
- Never invent content that isn't in the source material

#### 9.1.3 Cost Estimate

Per adventure import (typical 30-page adventure):
- Claude API (Sonnet, ~50K tokens input, ~10K output): ~$2-5
- OCR if needed: negligible (on-device or cheap API)
- Total: ~$3-6 per adventure import

For a friend group importing a few adventures: negligible cost.

### 9.2 AI Map Generation

Maps can be generated from text descriptions — either from AI-extracted `map_description` fields or from free-form GM input.

#### 9.2.1 Two Generation Modes

**Mode 1: Structured Map (JSON-based, rendered in-app)**

Claude generates a map as structured data that the app renders natively on the Konva.js canvas:

```
GM input: "Taverne: Gastraum 10x8 Schritt, Theke links, 6 Tische, 
           Kamin hinten rechts, Treppe nach oben hinten links, 
           Eingangstür Süden, Hintertür Osten zum Hof"

Claude outputs:
```
```json
{
  "grid": {"width": 12, "height": 10, "cell_schritt": 1},
  "walls": [
    {"from": [0,0], "to": [12,0]},
    {"from": [0,0], "to": [0,10]},
    {"from": [12,0], "to": [12,10]},
    {"from": [0,10], "to": [12,10]},
    {"from": [0,3], "to": [3,3]},
    {"from": [0,3], "to": [0,7]}
  ],
  "doors": [
    {"position": [6,10], "type": "door", "label": "Eingangstür"},
    {"position": [12,5], "type": "door", "label": "Hintertür"}
  ],
  "objects": [
    {"type": "counter", "position": [1,4], "size": [1,4], "icon": "theke", "label": "Theke"},
    {"type": "furniture", "position": [4,2], "icon": "tisch", "label": "Tisch 1"},
    {"type": "furniture", "position": [7,2], "icon": "tisch", "label": "Tisch 2"},
    {"type": "furniture", "position": [4,5], "icon": "tisch", "label": "Tisch 3"},
    {"type": "furniture", "position": [7,5], "icon": "tisch", "label": "Tisch 4"},
    {"type": "furniture", "position": [4,8], "icon": "tisch", "label": "Tisch 5"},
    {"type": "furniture", "position": [7,8], "icon": "tisch", "label": "Tisch 6"},
    {"type": "feature", "position": [10,1], "icon": "kamin", "label": "Kamin"},
    {"type": "stairs", "position": [1,1], "icon": "treppe_hoch", "label": "Treppe nach oben"}
  ],
  "terrain": [
    {"type": "wood_floor", "area": "all"}
  ],
  "lighting": "warm_indoor"
}
```

The app renders this as a proper grid map with walls, objects placed from the asset library, and doors. The GM can then edit everything: move objects, add walls, change icons.

**Advantages:** fast, editable, uses existing asset library, lightweight, always consistent style.

**Mode 2: Image Generation (AI-generated artwork)**

For atmosphere and visual richness, Claude (or a dedicated image API) generates an actual map image:

```
GM input: "Düstere Waldlichtung bei Nacht. Nebelschwaden. In der Mitte 
           ein verwitterter Steinschrein der Peraine. Rechts ein schmaler 
           Pfad nach Norden. Links ein großer Felsbrocken."

→ AI generates a top-down battle map image (1024x768)
→ Image loaded as map background
→ GM overlays grid, places tokens, marks walls
```

This uses an image generation API (Dall-E, Stable Diffusion, or similar). The output is a background image that still needs the grid/wall/token overlay added manually.

**Advantages:** visually rich, atmospheric, unique per scene.
**Disadvantages:** slower, costs more, not directly editable, needs manual grid overlay.

#### 9.2.2 Recommended Approach: Structured First, Image Optional

For gameplay, **Mode 1 (structured)** is the default. It's fast, editable, cheap, and the asset library icons provide a consistent look. Every scene with a `map_description` gets an auto-generated structured map that the GM can use immediately or tweak.

**Mode 2 (image)** is optional for GMs who want prettier maps for important scenes (boss fights, dramatic locations). The GM explicitly requests "Karte als Bild generieren" in the portal or map editor.

#### 9.2.3 Map Generation from Adventure Import

When the AI Import Portal extracts an adventure, it automatically:
1. Identifies scenes that take place in a physical location
2. Generates a `map_description` for each (spatial layout in text)
3. Converts each `map_description` to a structured map JSON (Mode 1)
4. Pre-renders the map in the Review step so the GM can see and edit it
5. Objects are auto-assigned icons from the asset library (tisch → table icon, kamin → fireplace icon, etc.)

The GM never has to manually build a map unless they want to. For a 30-page adventure, the portal generates ~5-8 playable maps automatically.

#### 9.2.4 Map Description Schema

The AI generates map descriptions in a consistent format:

```python
class MapDescription:
    name: str                       # "Taverne Erdgeschoss"
    environment: str                # "indoor" | "outdoor" | "underground" | "mixed"
    size: Dict                      # {"width": 12, "height": 10, "unit": "schritt"}
    
    # Structural elements
    walls: List[WallDesc]           # Outer walls, inner walls, partial walls
    doors: List[DoorDesc]           # Doors, gates, openings with positions
    stairs: List[StairsDesc]        # Stairs, ladders, trapdoors
    windows: List[WindowDesc]       # Windows (line of sight, not movement)
    
    # Objects & furniture
    objects: List[ObjectDesc]       # Tables, chairs, counters, altars, etc.
    features: List[FeatureDesc]     # Fireplace, fountain, well, statue, etc.
    
    # Terrain
    terrain_zones: List[TerrainDesc]  # Wood floor, stone, grass, water, difficult terrain
    elevation: Optional[List[ElevationDesc]]  # Height differences, ledges, pits
    
    # Atmosphere
    lighting: str                   # "bright" | "dim" | "dark" | "mixed"
    mood: str                       # "warm" | "cold" | "eerie" | "grand"
    
    # Pre-placed tokens
    npcs: List[TokenPlacement]      # NPCs with suggested positions
    creatures: List[TokenPlacement] # Hidden creatures (GM-only visibility)
    items: List[TokenPlacement]     # Discoverable items
    triggers: List[TriggerPlacement]  # Traps, events, secrets

class ObjectDesc:
    type: str                       # "tisch" | "stuhl" | "theke" | "bett" | "truhe" | "altar"
    position: List[int]             # [x, y] grid coordinates
    size: Optional[List[int]]       # [w, h] if larger than 1 cell
    icon_hint: str                  # Suggested icon from asset library
    label: Optional[str]            # "Tisch des Wirts"
    interactable: bool              # Can players interact?
    interaction_hint: Optional[str] # "Truhe: verschlossen, Schloss Qualität 4"
```

### 9.3 AI Whisper-Assistant (GM Only)

Expanded from Batch 2 (Section 4.10). The AI assist panel has specialized modes:

#### 9.3.1 Assist Modes

**🗣️ NPC Dialog:**
```
GM: "Gregor der Wirt, die Spieler fragen ihn nach dem Nordpfad"
AI: "Gregor wird nervös, wischt sich die Hände an der Schürze ab.
     'Den Nordpfad? Nein, nein, da geht kein vernünftiger Mensch hin.
     Seit Wochen kommen Geräusche aus dem Wald. Bleibt lieber hier,
     ich mach euch einen guten Preis fürs Zimmer.'"
```
AI uses the NPC's personality tags, knowledge, and attitude from the NPC registry.

**📖 Regel-Frage:**
```
GM: "Wie funktioniert Fernkampf wenn der Schütze sich bewegt hat?"
AI: "Bewegt sich der Schütze in derselben Kampfrunde, in der er schießt,
     erhält er -2 auf FK (bei Sprinten: -4). Quelle: Regelwerk S. 245."
```
Searches the rules reference databank first, then general DSA5 knowledge.

**💡 Improvisation:**
```
GM: "Die Spieler wollen in die Kanalisation von Gareth einsteigen, 
     das war nicht geplant. Was könnte da unten sein?"
AI: "Drei Vorschläge:
     1. Ein verwahrlostes Rattenvolk-Lager (2-3 Rattenogger, Beute: Kanalplan)
     2. Ein vergessener Praios-Schrein, halb überflutet, mit einem Rätsel
     3. Die Leiche eines Händlers mit einem mysteriösen Brief in der Tasche
     Alle passen zum Mittelreich-Setting und können zum Hauptplot führen."
```

**📝 Session Recap:**
```
GM: "Fasse die heutige Session zusammen"
AI: [reads session log: scenes visited, combats, probes, lore revealed, quests updated]
    "Session 7: Die Gruppe erreichte den Turm des Orkschamanen nach 
     einem Hinterhalt auf der Waldstraße (3 Orkräuber besiegt, Balgra 
     verletzt). Elara entdeckte magische Spuren am Wegschrein. Der 
     Köhler wies ihnen den Weg. Im Turm angekommen, begann der 
     Kampf gegen den Schamanen und seine Wachen."
```

**🗺️ Karten-Generator:**
```
GM: "Generier eine Karte für eine kleine Schmiede"
AI: [generates structured map JSON] → rendered in map editor
```

#### 9.3.2 Context Management

The AI assist has access to (per API call, as needed):
- Current scene data + GM notes
- Active NPC profiles (personality, knowledge, attitude)
- Campaign lore book (player layer + GM layer)
- Recent session events (last 5-10 actions/scenes)
- Databank lookups (creature stats, spell rules)
- Full adventure structure (scene graph, if imported)

It does NOT have:
- Player private data (journal, whisper history)
- Other campaigns or groups
- Anything outside this campaign's scope

Context is managed to stay within Claude's context window (~100K tokens). For large campaigns, only relevant slices are loaded per query.

---

## 10. Extended Features (Nice-to-Have)

### 10.1 Trade & Shop System

When players visit a merchant:

1. GM opens "Handel" → creates a shop from databank or custom
2. Shop inventory appears: items with prices, filtered by availability
3. GM can adjust prices per NPC attitude: "Freundlich: -10%", "Feindlich: +30%"
4. Players see shop on their phone → browse, select items to buy
5. If Handeln talent is relevant: GM can call a probe, QS adjusts price
6. Player confirms purchase → Silbertaler deducted, item added to inventory
7. Selling works in reverse — GM sets buy-back ratio (default: 50% of base price)

All transactions are logged in the session record and affect both player inventory and wallet in real-time.

### 10.2 Weather & Environment System

Expanded from Batch 2 (Section 4.12.2):

The GM sets environment conditions. The app calculates all cascading modifiers:

```
Umgebung: Wald | Wetter: Starker Regen | Tageszeit: Nacht

Automatische Modifikatoren:
  Sicht: Stufe 2 (-2 auf Fernkampf, Sinnesschärfe)
  Nacht + Wald: Stufe 3 (-3 auf Sicht-abhängige Proben)
  Regen: -1 auf Fernkampf (Wind), -1 auf Klettern (rutschig)
  Reisegeschwindigkeit: -25% (Schlamm, Unterholz)
  Feuer: Schwer entzündbar (Probe Wildnisleben +2)
```

Modifiers auto-apply to all relevant probes and combat actions. The GM can override any individual modifier.

Environment presets: the GM picks a preset ("Wald bei Nacht im Regen") and all modifiers are calculated instantly.

### 10.3 Player Journal (Extended)

Beyond basic notes (see 5.10), extended journal features:

- **Voice memos**: player records a short audio note (stored as file, transcribed for search)
- **Photo notes**: player snaps a photo of something at the table (GM's sketch, a prop, a funny moment) and attaches it to a note
- **Shared notes**: player can share a note with the group (creates a "Gruppen-Notiz" visible to all)
- **Pinboard**: visual board of pinned notes, connected with lines (conspiracy-board style for tracking clues)

### 10.4 Session Feedback & Voting

At session end, players can anonymously provide feedback:

```
SESSION FEEDBACK (anonym)

Wie war die Session? ⭐⭐⭐⭐☆

Bester Moment?
○ Der Kampf im Turm
○ Elaras Magiekunde-Probe
○ Das Gespräch mit dem Köhler
○ [Eigener Text]

Was könnte besser sein?
○ Kampf war zu lang
○ Mehr Rätsel bitte
○ Mehr Rollenspiel-Momente
○ [Eigener Text]

Einprägsamster NPC?
○ Gregor der Wirt
○ Der Orkschamane
○ [Eigener Text]
```

Results are anonymous — the GM sees aggregated feedback, not who said what. This helps the GM improve without awkward face-to-face criticism.

### 10.5 Spotlight System (Exploration)

Outside combat, the GM can "spotlight" a player:

- GM taps a player → that player's phone shows a subtle gold border
- Table View shows the spotlighted player's name
- Signals: "You're in focus, the GM is addressing you"
- Other players can still talk, but the GM is directing attention

Useful for:
- Drawing out quiet players
- Gently redirecting when one player dominates
- Running parallel scenes ("While the others rest, Yara, you notice...")

### 10.6 Dice Camera (Future)

Optional feature: instead of typing dice results, the player holds their phone camera over the rolled dice.

- On-device ML model recognizes D6 and D20 faces
- Displays recognized value for confirmation ("Ist das eine 14?")
- Player taps confirm or corrects manually
- Eliminates typos, faster than typing

Requires: on-device TensorFlow Lite model for dice face recognition. No server roundtrip.

This is a post-MVP feature — manual input works fine and is the fallback.

### 10.7 Retrospective Cards

At session end, the app generates visual summary cards:

```
┌─────────────────────────────────┐
│  SESSION 7                      │
│  "Der Turm des Orkschamanen"    │
│                                 │
│  🗡️ 1 Kampf: Orkschamane + 3 Orks │
│  📊 12 Kampfrunden              │
│  💀 3 Gegner besiegt            │
│  🎯 Beste Probe: Elara QS 4    │
│  💔 Meister Schaden: Balgra -6  │
│  ⏱️ Dauer: 3h 12min            │
│                                 │
│  HELDEN                         │
│  ⚔️ Balgra: 24 SP ausgeteilt   │
│  ✨ Elara: 2 Zauber gewirkt     │
│  🛡️ Thorben: 3× geheilt        │
│  🏹 Yara: Kritischer Treffer!   │
│                                 │
│  NÄCHSTES MAL:                  │
│  Die Gruppe steht vor der       │
│  Kammer des Schamanen...        │
└─────────────────────────────────┘
```

Players can share these on social media or save as mementos. Generated automatically from session log data.

### 10.8 Regeneration & Rest Workflow

When the group rests:

```
GM: "Nachtruhe" (8 Stunden)

App berechnet automatisch:
┌─────────────────────────────────────────────┐
│ NACHTRUHE — 8 Stunden                        │
│                                              │
│ Balgra:                                      │
│   LeP: 28 → würfle 1W6+2 Regeneration       │
│   Schmerz 1 → bleibt (Wunde nicht behandelt) │
│   Proviant: 1 Ration verbraucht (noch 2)    │
│                                              │
│ Elara:                                       │
│   LeP: 22 → voll (24/24, nur 2 fehlten)     │
│   AsP: 18 → würfle 1W6 Regeneration         │
│   Proviant: 1 Ration verbraucht (noch 3)    │
│                                              │
│ Thorben:                                     │
│   Heilkunde Wunden auf Balgra? [Probe]       │
│   KaP: 22 → würfle 1W6 Regeneration         │
│                                              │
│ Weltzeit: +8 Stunden (jetzt: Praios 16, Morgen)│
│ Wetter morgen: Bewölkt                       │
│                                              │
│ ⚠️ Gift "Purpurblitz" auf Yara: nächste Stufe │
│    in 4 Stunden → ZK-Probe nötig             │
│                                              │
│ [Rasten durchführen]                         │
└─────────────────────────────────────────────┘
```

The GM sees everything that happens during the rest, confirms, and players roll their regeneration dice. Time, provisions, poison/disease progression, and condition timers all auto-update.

### 10.9 Soundboard (Extended)

Beyond basic ambient + SFX (see Batch 2, 4.11):

- **Custom sounds**: GM uploads own audio files (music, ambient, effects)
- **Playlists**: chain multiple ambients for automatic rotation
- **Scene-linked**: assign sounds to scenes → auto-play on scene activation
- **Player soundboard**: each player has 3-4 personal sound effects (battle cry, spell chant, etc.)
- **Volume control**: separate volume for ambient, SFX, and music
- **Fade timing**: configurable crossfade duration between ambient switches

### 10.10 Regelmodul-System

DSA5 has many optional rules. The GM configures per campaign which are active:

```
OPTIONALE REGELN

☑ Nahkampf-Patzertabelle (statt einfachem Patzer)
☑ Fernkampf-Patzertabelle
☐ Trefferzonen (Treffer auf Kopf/Torso/Arme/Beine)
☑ Kritische Treffer (erweiterte Bestätigungswurf-Regeln)
☐ Distanzklassen im Nahkampf (kurz/mittel/lang Interaktion)
☑ Schicksalspunkte (Erweiterter Einsatz)
☐ Wundschwellen (detaillierte Wundregeln)
☐ Soziale Konflikte (Regeln für Überredung/Einschüchterung)
☑ Belastung durch Ausrüstung (Tragkraft-System)
```

When a rule is disabled, the app:
- Hides related UI elements (no Trefferzonen-Buttons if disabled)
- Simplifies combat resolution (no Patzertabelle → simple "Patzer! GM entscheidet")
- Adjusts rules reference (doesn't show optional rules in search results)

This dramatically reduces complexity for new groups. Start with minimal rules, enable more as comfort grows.

### 10.11 Multi-GM Support (Extended)

Beyond basic GM transfer (see Batch 4, 6.14):

- **Co-GM mode**: two GMs control a session together. Both see the full cockpit. Useful for large groups or training a new GM.
- **GM rotation per session**: in groups where GM rotates, the app tracks who GMed which session. Campaign data is shared, but prep notes are per-GM.
- **Player-as-temporary-GM**: a player temporarily controls an NPC or creature in combat (e.g., a player's animal companion). GM grants control of specific tokens to a player.

### 10.12 Campaign Achievements

Auto-tracked achievements for the campaign:

```
KAMPAGNEN-ERFOLGE

🏆 Erste Blut — Erster Kampf gewonnen
🏆 Orkjäger — 10 Orks besiegt
🏆 Goldgrube — 1000 Silbertaler angesammelt (Gruppe)
🏆 Wunderkind — QS 6 bei einer Probe erreicht
🏆 Überlebenskünstler — Unter 5 LeP überlebt
🏆 Zungenfertig — 5 NPCs erfolgreich überredet
🏆 Kartograph — 10 verschiedene Orte besucht
🏆 Bücherratte — 20 Lore-Einträge entdeckt
🏆 Langlebig — 10 Sessions gespielt

🔒 Geheim — ???
🔒 Geheim — ???
```

Fun, nicht mechanisch relevant. Adds a meta-layer of accomplishment tracking. GM can create custom achievements for campaign-specific milestones.

---

## 11. Roadmap

**See `TODO.md` for the full roadmap, open tasks, and recently completed work.**

The roadmap was extracted from SPEC.md into a standalone file on 2026-03-27 to keep this spec focused on architecture and requirements. Claude Code reads TODO.md at session start and updates it when tasks are completed.

<!-- Everything below this line was moved to TODO.md on 2026-03-27 -->
<!-- Phase 1: Playable MVP — DONE (2026-03-22)
- [x] Browser-based app: React + Vite + TailwindCSS
- [x] User accounts (email/password login, JWT auth)
- [x] Character import (Optolith JSON + DSA Ultimate JSON parsers built)
- [x] Campaign creation, invite via Kampagnen-Code
- [x] Session creation, join via Session-Code
- [x] GM Cockpit: Global View + Scene View with collapsible sections
- [x] Player Dashboard: character sheet (desktop multi-column), vitals, dice input
- [x] Combat engine: initiative, AT/PA/AW, damage, conditions, Schmerz-Schwellen (backend engine)
- [x] Probe resolution (1W20 + 3W20 with modifier aggregation) (backend engine)
- [x] Basic map: Konva.js grid canvas, token placement, walls, triggers
- [x] WebSocket realtime: connection manager, message relay, room-based
- [x] Table View: scene display, read-aloud text, immersive mode (accessible to all users as tab)
- [x] Databank: 60 creatures, 42 weapons, 16 armor, 6 shields, 77 items, 30 spells, 20 liturgies, 59 talents, 42 SFs, 36 rules snippets
- [x] HALT button, whisper system
- [x] Demo adventure: 10 scenes, 8 NPCs, 6 maps with walls/tokens/triggers, 4 quests, 12 lore entries
- [x] Test accounts: 1 GM + 4 players with pre-built characters
- [x] SQLite database (no Docker required for dev)

### Phase 2: Full Combat & Polish — MOSTLY DONE (2026-03-24)
- [x] Magie & Liturgien UI (spell/liturgy book with probe attributes, ASP/KaP tracking)
- [x] Inventory system with transfers, equip/unequip, weight tracking, action cost awareness
- [x] NPC registry with full personality, knowledge, secrets, relationships, voice notes
- [x] Encounter builder (search databank, multi-select, spawn to map)
- [x] Map: walls render, tokens with stats on click, drag to reposition, zoom/pan
- [x] GM interrupt system (HALT button broadcasts to all clients)
- [x] GM notification panel (player requests appear with accept/decline/require-probe)
- [x] Loot distribution system (GM selects → shows to table → assigns to players)
- [x] Creature/NPC spawn panel with smart search, category filters, multi-select, visibility toggle
- [x] Player tokens on map (auto-generated from campaign roster)
- [x] Player map interaction (click to move, click creature to attack, all through GM approval)
- [x] All Kampfmanöver: 5 basis (Wuchtschlag I/II, Finte I/II) + 8 SF-gated (Hammerschlag, Sturmangriff, Klingensturm, Todesstoß, Windmühle, Niederwerfen, Gezielter Stich, Entwaffnen) — full modifier chains (halveRS, ignoreRS, doubleDamage, noDamage)
- [x] Item usage system: potions, poisons (apply to weapon → ZK-probe on hit), herbs (Heilkunde probe), combat items (Brandbombe AoE, Raucherbombe smoke, Donnerball stun), condition items (drinks → Berauscht)
- [x] Dual-wield combat: Beidhändiger Kampf detection, off-hand attack with correct AT penalty, player dice flow via WS
- [x] Real-time inventory sync: inventory_change broadcast after every item use
- [x] Centralized combat values: useCombatValues hook as single source of truth, all views use it (VitalsBar, ArmoryTab, CombatActions, CharacterSheet)
- [x] Equipment rules enforcement: 2H conflicts, shield+dual-wield, ranged limits, Beidhändiger Kampf max 2 melee
- [x] Weapon switching action in combat (1 Aktion)
- [x] Rich derivation tooltips for every combat value (full formula with named variables)
- [x] Colored tab headers across all player dashboard tabs
- [ ] Fernkampf range brackets, Ladezeit, movement penalties — engine built, UI pending
- [ ] Schicksalspunkte usage flow in combat UI
- [x] Critical hits + Patzer tables in combat UI
- [ ] Guided combat flow (Basic complexity mode with step-by-step hints)
- [ ] Group inventory
- [ ] Map editor: draw tool, difficult terrain painting, fog brush for GM

### Phase 2b: SSOT Refactor & Live Sync — DONE (2026-03-25)
- [x] Backend safety: per-character asyncio locks, `_safe_create_task` error handling, inventory persistence backup
- [x] Server-side delta resolution: backend resolves `lep_delta` to absolute before broadcast
- [x] API normalization: `players-detail` returns `current_vitals` object, consistent shapes
- [x] Frontend single store: `current_vitals` as SSOT, removed legacy `currentLeP` writes
- [x] Frontend delta fallback: handles both absolute and delta values from any backend version
- [x] Cross-store sync: vitals/conditions propagate to characterStore + sessionStore + combatStore
- [x] Reactive buff display: all 4 components subscribe to `activeBuffs` via selector
- [x] Conditions sync to sessionStore.players[] for live GM display
- [x] JournalTab + QuestSessionTab read from campaignStore (not API fetch)
- [x] CharacterSheet conditions read from reactive `myCharacter.conditions`
- [x] GMCockpit `activeProcesses` subscribed via selector
- [x] `safeData.js` utility: `getConditions()`, `getVitalsFrom()`, `getMaxVitals()`
- [x] `ssot-lint.sh` PostToolUse hook: auto-checks for unsafe conditions access, getState() in render, bare asyncio.create_task
- [x] Protokoll deduplication: backend stores without double-broadcast, frontend time-based dedup
- [x] Protokoll improved: type labels, player names in connect log, "Aktuell" jump button
- [x] Pending requests cleanup: `_handle_dice_result` clears probes so they don't reappear on refresh
- [x] REST vitals PATCH invalidates WS in-memory cache

### Phase 3: Persistence & Campaign — PARTIALLY DONE
- [x] Campaign persistence (world clock, weather in DB)
- [x] Lore Book (dual-layer: player visible + GM secrets) — DB + API
- [x] Quest tracker — DB + API + player/GM views
- [x] Timeline — DB + API
- [x] AP award dialog in session controls
- [x] Character leveling UI with cost validation
- [x] Session logs (auto-recorded from WebSocket events into session_log state, survives reconnect via sync_full)
- [ ] Session recap (AI-generated) — API stub exists
- [ ] Character death memorial + archive — model exists, UI pending
- [ ] Inventory hybrid model carry-over flow at campaign end
- [ ] Character lifecycle state machine (active→resting→retired)

### Phase 4: AI Features — STUBS BUILT
- [x] AI module architecture (prompts, assist, extraction, map gen, NPC gen)
- [x] Claude API integration code (anthropic SDK)
- [x] AI assist panel in GM cockpit with mode tabs
- [ ] AI Import Portal (PDF upload → extraction) — backend code exists, UI needs polish
- ~~[ ] AI Map Generation (structured JSON)~~ — REMOVED (maps cut from scope)
- [ ] AI NPC dialog generation — backend code exists, needs live testing with API key
- [ ] AI session recap — backend code exists

### Phase 5: Nice-to-Have — PARTIALLY DONE
- [x] Soundboard UI (ambient loops + SFX grid)
- [x] Session controls (start/pause/end)
- [x] Player journal (notes with session tagging)
- [x] Help/rules reference tab for players
- [x] Beginner explanations throughout (attributes, probes, combat, spells)
- [x] Trade system (player-to-player item + money transfer)
- [ ] Shop system (NPC merchants)
- [ ] Weather & environment modifier auto-calculation
- [ ] Regeneration & rest workflow
- [ ] Session feedback & voting
- [ ] Spotlight system
- [ ] Retrospective cards
- [ ] Regelmodul-System (optional rules toggle)
- [ ] Campaign achievements
- [ ] Complexity level switching (Basic/Standard/Advanced)
- [ ] Quick character templates (6 archetypes) — backend exists, UI pending
- [ ] Export (character, campaign, session log)
- ~~[ ] Dice camera (on-device ML)~~ — REMOVED per user request

### Open TODOs (updated 2026-03-25)

**Resolved since last update:**
- [x] Full dice flow end-to-end — working for attacks, defense, damage (GM ↔ player via WS)
- [x] Combat turn system — TurnFlow with full step-by-step wizard integrated
- [x] DSA5 rules audit — Handlungsunfähig sum>=8, condition stacking (magical/physical), critical confirmation, Wuchtschlag/Finte modifiers corrected
- [x] Security audit — auth guards on token/scene update, FK constraint fix, HALT gate covers all player actions
- [x] Fog of war — removed entirely (feature cut, all dead code cleaned from frontend + backend)
- [x] State management — store cleanup on logout/navigation, silent error catches replaced with logging
- [x] WebSocket — heartbeat timeout detection, session state memory leak fix, missing state initialization
- [x] Reaction penalties — defender reaction counter now increments, -3 cumulative penalty applies
- [x] Item give in probe consequences now persists to inventory API
- [x] Player route now requires authentication

**Resolved (2026-03-26):**
- [x] Spell/liturgy casting in combat — full 6-step wizard (select → target → modifier → 3W20 roll → result → cost deduction)
- [x] Ranged distance brackets in combat — GM picks nah/mittel/weit/extrem with FK modifiers
- [x] SchiP validation for multiple reactions — blocked when no fate points remain
- [x] Creature HP hidden from players — only names and turn order visible
- [x] Phone-responsive combat layout — stacks vertically on small screens
- [x] GM player detail view — click card for full character reference with tooltips, derivations, conditions, SFs
- [x] GM condition/health editing — quick actions work, changes sync to player cards in real-time
- [x] Infinite re-render loop eliminated — removed self-mutating Zustand subscriber, computed selectors instead
- [x] Dead WS handler crash fixed — removed references to deleted event types
- [x] Consistent dark card theme across entire app
- [x] Collapsible player cards in GM sidebar
- [x] Fixed seed data — wrong magic abilities removed from warrior characters
- [x] Collapsible subcategory sidebar in both DB browsers (DatenbankTab + SessionPrep) — replaces chip bar
- [x] DatenbankDetailModal popup on item click in both browsers and player InventoryPanel
- [x] DSA5 abbreviation hover tooltips throughout both DB browsers (AT/PA/RS/BE/LeP/AsP/KaP etc.)
- [x] Color/icon consistency across all DB browsers — CATEGORIES synced to dsa-* palette, ATTR_META per-attribute colors on probe chips
- [x] **[AUDIT] Databank entry compatibility check** — fixed 10 bugs found across 7 files:
  - `useCombatValues.js`: shield AT mod now applied to baseAT; FK no longer penalized by BE; RS/BE computed consistently from equipped armor
  - `BattleManager.jsx`: creature `attributes` + `gs` transferred to combatant object
  - `InventoryPanel.jsx`: 12 English category names (`weapon`, `shield`, `potion`, `tool`, `torch`, `bandage`, `rope`, `container`, `clothing`, `item`, `misc`) now mapped to display buckets
  - `itemEffects.js` + `databank-seed/items.json`: `stop_bleeding` → `bleeding_stop`
  - `TurnFlow.jsx`: `abilityMods` now applied to correct combatants (attacker AT, defender PA/AW); `awMod` (Verbessertes Ausweichen) no longer silently discarded; weapon field lookup covers all naming variants
  - `backend/models/databank.py` + `databank-seed/special_abilities.json`: `at_modifier`/`pa_modifier` → `at_mod`/`pa_mod` — SA combat bonuses were silently null in frontend; migration added for existing DBs

**Resolved (codebase audit 2026-03-26):**
- [x] Creature databank quick-add to battle setup — BattleManager has full databank search + multi-select spawn
- [x] Abbreviation lookup / glossary panel — TOOLTIPS object in Tooltip.jsx has all 32 entries (AT/PA/FK/AW/INI/TP/SP/RS/BE/GS/SchiP/LeP/AsP/KaP + all attributes + system terms), TipAbbr/TipIcon components used throughout app
- [x] Character level-up UI — SteigerungTab fully functional in-session (AP spend on attributes, talents, spells, combat techniques with cost validation)
- [x] Wiki tab — WikiTab.jsx + wikiStore.js: searchable, 3 content categories (App-Handbuch, DSA5 Regeln, Einschränkungen), inline data cards for creatures/weapons/spells/etc.
- [x] Dashboard Database tab — DatenbankTab.jsx: all 9 reference categories, search/filter, collapsible sidebar, GM homebrew create/edit/delete, detail modals

**Still open:**
- [ ] Combat victory screen — AP award handler + loot system exist, but no dedicated victory UI shown after combat ends
- [ ] Creature stat editing mid-combat
- [ ] Player pending requests with withdraw option — system works but dismiss/withdraw UX needs polish
- [ ] Mobile responsive header
- [x] Character import/export UI (Optolith JSON) — ImportModal + export trigger in CharakterTab
- [x] Characters tab UI — CharakterTab.jsx: card grid, import, Schnellstart, full 10-step wizard (CharacterCreator wired in Session 12 audit)
- [ ] Opposed probes UI
- [ ] In-game time tracking — backend handler exists (`_handle_time_advance`), no frontend UI
- [ ] Weather system — backend handler exists (`_handle_weather_change`), no UI or auto-modifier calculation
- [ ] Ranged reload tracking — reload modifiers defined, no mid-combat reload state UI
- [ ] Protokoll entry fix ("Singen — 0 bestanden" malformed group probe)

**Removed (cut from scope):**
- ~~GM scene view right panel~~ — scenes/maps removed from scope
- ~~WebSocket real-time scene switching~~ — scenes removed from scope
- ~~Map token spawn~~ — maps removed from scope
- ~~Soundboard~~ — cut, not core to gameplay
- ~~Multi-GM / Co-GM mode~~ — cut for v1
- ~~Spotlight system~~ — cut for v1

### Architecture & Stability (identified 2026-03-25)

- [x] Extend per-character locks to cover in-memory state + broadcast (not just DB writes) — eliminates vitals race conditions
- [x] Write-through for critical operations: loot_distribute now awaits DB write before logging; trades already write-through
- [x] State versioning: increment counter on each update, include in broadcasts and sync_full so clients can detect message gaps
- [x] Refactor GMCockpit.jsx into sub-hooks: useGMSession (auth/loading), useGMPopups (25+ UI states), useGMDatabank (lazy-load)
- [x] Dead letter queue for failed broadcasts: queue messages when send_to_user fails, flush on reconnect
- [x] Message deduplication: skip messages with identical type+timestamp to prevent double-processing on flaky connections
- [x] Lazy-load databank (creatures, talents) on first use instead of initial GMCockpit load

### Data Integration Opportunities (identified 2026-03-26)

Optolith (open-source DSA5 character generator) was integrated as the source for species/cultures/professions in Session 12. Further data that could be sourced from Optolith or other authoritative DSA5 sources:

- [ ] **Fill culture/profession AP costs + skill packages** — currently all 0/empty; character creator cannot deduct AP for culture/profession selection until this is resolved. Options in order of preference: (1) check if Optolith data is already installed locally (`~/Library/Application Support/Optolith/` on Mac) — if you own DSA5 and have run Optolith, the full licensed data is already on your machine; (2) check `Plushtoast/dsa5-foundry-tabletop` compendium packs (open-source Foundry module, may contain mechanical data); (3) scrape DSA5 Wiki (wiki.ulisses-spiele.de or aventurica.de — publicly accessible, legally grey); (4) enter manually from physical rulebook (~3h for all cultures + professions)
- [ ] **Audit species/cultures/professions seed accuracy** — verify Optolith-sourced AP costs, skill packages, and attribute values against physical DSA5 rulebook before production use
- [ ] **Expand cultures coverage** — 33 cultures seeded (GRW + Aventurischer Almanach); Optolith has more from supplements
- [ ] **Expand professions coverage** — 46 professions seeded (GRW + Wege der Götter); many supplement professions still missing
- [ ] **Richer creature data** — Optolith/DSA5 Wiki has more creatures with full stat blocks; current 60 creatures are manually curated
- [ ] **Advantages/disadvantages catalog** — Optolith has full Vor-/Nachteil list with AP costs; currently only a small preset in the character creator
- [ ] **Special abilities from Optolith** — cross-reference existing 42 seeded SAs against Optolith's full SA list for completeness
- [ ] **Icons and portraits** — investigate DSA5 community asset packs or Optolith assets for creature/profession/species icons; currently using lucide-react fallbacks
- [ ] **Spell/liturgy expansion** — Optolith has full spell/liturgy catalog with all traditions; currently 30 spells + 20 liturgies seeded
- [ ] **Talent FW costs from API** — SF category mapping per talent could come from Optolith's talent data rather than hardcoded in SteigerungTab
- [ ] **Item catalog expansion** — DSA5 has hundreds of items; current 77 items are manually selected

### Code Quality — Hardcoded Data Migration (identified 2026-03-25)

**High Priority:**
- [ ] Migrate `COMBAT_SPECIAL_ABILITIES` (weaponProperties.js:54-87) to API-driven from `/api/databank/special_abilities`
- [ ] Migrate advancement tables `SF_TABLES`, `ATTR_COST`, `GRADE_LIMITS` (SteigerungTab.jsx:8-46) to backend engine or API
- [x] ~~Replace hardcoded `SPELL_DB`/`LITURGY_DB` in spellEngine.js~~ — file deleted (dead code), SpellBook loads from API directly

**Medium Priority:**
- [ ] Centralize `ktw: 6` default into a single constant (currently in useCombatValues.js, ArmoryTab.jsx, CombatActions.jsx, TurnFlow.jsx — 5 files)
- [ ] Replace hardcoded unarmed attack stats in TurnFlow.jsx:341 (AT 10, PA 6, 1W6) with databank Raufen entry
- [ ] Deduplicate `SF_EXPLAIN` — exists in both CharacterSheet.jsx and ArmoryTab.jsx, should load from `/api/databank/special_abilities`
- [ ] Deduplicate `TALENT_SF` category→cost mapping (in TalentList.jsx and SteigerungTab.jsx)

**Low Priority (acceptable as static game rules):**
- [ ] Centralize attribute metadata (`ATTR`, `ATTR_META`, `ATTR_INFO`) — duplicated across 5+ files
- [ ] Move comprehensive rule explanations (CharacterDetail.jsx:13-100+) to `/api/databank/rules` endpoint
- [ ] Talent category definitions could come from API instead of hardcoded list

### Non-Functional UI Elements (identified 2026-03-25)

- [x] ~~QuickActions.jsx~~ — entire file deleted (dead code, replaced by individual panels)
- [x] ~~Soundboard~~ — cut from scope

### Dashboard Tabs (Post-Login)

All 4 dashboard tabs are now done.

**Characters Tab (Charaktere) — DONE (Session 12)**
- [x] Character management UI — `CharakterTab.jsx`: card grid, status badges, AP chip, action buttons
- [x] Character creator wizard — `CharacterCreator.jsx`: 10-step wizard, loads species/cultures/professions from API, live AP budget, derived values preview
- [x] Character import UI — Optolith JSON / DSA Ultimate file drop → `POST /api/characters/import`
- [x] Character export UI — download JSON via `GET /api/characters/{id}/export`
- [x] Quick character templates UI — 5 archetypes (Krieger, Magier, Geweihter, Waldläufer, Streuner) → `POST /api/characters/quick-template`
- [x] Between-session AP spend — `SteigerungModal.jsx`: full upgrade UI as modal, REST-only, calls `POST /api/characters/{id}/level-up`
- [x] Species/cultures/professions in DB — `SpeciesTemplate`, `CultureTemplate`, `ProfessionTemplate` models + seed data (6 species, 8 cultures, 11 professions) + API endpoints
- [x] `creation_finalized` + `creation_ap_spent` fields on Character model + startup migration
- [x] Derived values recomputed on level-up — `_recompute_derived()` helper called after attribute changes (fixed Session 12 audit)
- [ ] `creation_finalized` / `creation_ap_spent` dead code — fields exist but never set; finalize endpoint missing
- [ ] Optolith import missing fields — combat_techniques, derived_values, inventory not extracted from Optolith JSON
- [ ] Culture/profession seed data incomplete — all 33 cultures and 46 professions have empty skill_bonuses/combat_techniques/skills packages; profession selection is currently cosmetic only
- [ ] Languages/Scripts step missing — DSA5 step 10: languages/scripts are SF purchasable with AP; culture provides free Muttersprache; wizard shows languages but doesn't let players buy more
- [ ] Special abilities purchase step missing — DSA5 step 10: no SF purchase UI in wizard
- [ ] Spells/Liturgies customization missing — magic/blessed characters need spell selection/upgrade step; profession.spells/liturgies currently always empty
- [ ] Tradition selection missing — magic users need a magical tradition (e.g. Gildenmagie); blessed need karmic tradition
- [ ] 80 AP cap missing on advantages — wizard only caps Nachteile at 80 AP; Vorteile should also cap at 80 AP
- [ ] Vor-/Nachteile hardcoded — only 10+10 presets; DSA5 has ~60+ advantages and ~60+ disadvantages; should load from databank
- [ ] No starting equipment/capital — characters start with no items; should calculate starting money from social status/profession
- [ ] AT/PA split not calculated — melee combat techniques need attack/parry value distribution (DSA5 step 9)
- [ ] Gender-aware profession names unused — seed data has `name_f` (feminine forms) but wizard always shows masculine name
- [ ] View character history across sessions — endpoint missing, low priority
- [ ] Character portrait upload — uses `portrait_url` string; binary upload endpoint missing

**Database Tab (Datenbank) — DONE**
- [x] Browse reference data: creatures, weapons, armor, shields, items, spells, liturgies, special abilities, talents
- [x] Search and filter with collapsible subcategory sidebar
- [x] GM can create/edit/delete custom entries (homebrew)
- [x] Detail popup modals with full data display

**Wiki Tab — DONE**
- [x] Combined DSA5 rules reference and app manual (WikiTab.jsx + wikiStore.js)
- [x] Three content categories: App-Handbuch, DSA5 Regeln, Einschränkungen
- [x] Inline data cards for creatures, weapons, armor, spells, liturgies
- [x] Searchable with category filtering

---

## 12. Working with Claude on Aventuria VTT

### Dev Workflow
1. **Chat** (claude.ai): Architecture, decisions, brainstorming, open questions
2. **Claude Code** (local): Writing and editing files, running commands, debugging
3. **Git**: Commit and push to GitHub after each meaningful unit of work
4. **Server**: Cloud-hosted — deploys from GitHub (CI/CD or manual)

### Session Start Protocol (MANDATORY)

At the start of every Claude Code session, Claude MUST — without being asked:

1. **Read SPEC.md** — the architectural source of truth
2. **Read GOTCHAS.md** — avoid known implementation traps
3. **Read the last 3 entries in DEVLOG.md** — understand recent context
4. **Check the Roadmap/Phase checklist in SPEC.md** — know what's done and what's next
5. **Confirm with the user:** "I've read the spec, gotchas, and recent devlog. Last session completed [X]. The next task in the roadmap is [Y]. Want to continue with that, or work on something else?"

This takes 30 seconds and prevents the most common failure mode: Claude starting work without context and re-doing or contradicting previous decisions.

### Claude's Standing Instructions
1. Read SPEC.md before doing anything else — it is the source of truth
2. All file changes happen locally; the user pushes to GitHub
3. Ask clarifying questions before building — don't assume
4. Push back on questionable architectural decisions
5. When there's a fork (X vs Y), give a clear recommendation with reasoning
6. Remind the user to commit and push after significant changes
7. If something is better discussed in chat vs built in Claude Code, say so
8. **DSA5 rules engine must be deterministic** — no AI involvement in dice/combat resolution
9. **Always validate against DSA5 Regel-Wiki** — when implementing rules, cross-reference
10. **Test combat edge cases** — multiple reactions, Manöver combinations, condition stacking
11. **Physical table first** — every UI decision must pass the test: "Does this help or distract from the conversation at the table?"
12. **2-tap rule** — if a common GM action takes more than 2 taps, the UX is wrong

### Automatic SPEC.md Updates (MANDATORY)

Claude MUST update SPEC.md immediately — without being asked — whenever any of the following triggers occur:

| Trigger | What to update |
|---------|---------------|
| New dependency added (pip install, npm install) | Tech Stack section |
| Database schema changed (new table, column, altered type) | Data Models section |
| Config or threshold changed | Relevant section |
| New API endpoint added | Relevant component section |
| Architecture decision made during implementation | Relevant section + add rationale |
| Roadmap item completed | Phase checklist (check off `[x]`) |
| New file or module created that changes repo structure | Repo Structure section |
| Bug found that reveals a design flaw | Relevant section + Risks if systemic |
| Environment variable added or changed | README.md (also update) |

How to update:
- Edit the specific section(s) in SPEC.md directly — don't append notes at the bottom
- Bump the version number in the header (e.g., 1.0.0 → 1.0.1 for minor, 1.1.0 for major)
- Include the SPEC.md change in the same commit as the code change it describes
- Add a one-line entry to DEVLOG.md describing what changed and why

Claude should NOT wait for the user to ask. If Claude installs a package, it updates the tech stack. If Claude adds a column, it updates the schema. If Claude completes a roadmap task, it checks the box. This is not optional — SPEC.md that doesn't match the codebase is worse than no spec at all.

### GOTCHAS.md — Accumulated Implementation Traps

Claude MUST add to GOTCHAS.md immediately when discovering an API quirk, data quality issue, library bug, or non-obvious behavior during implementation. Format:

```
## Short descriptive title
Explanation of the gotcha, what goes wrong, and the workaround.
Affected: which files or modules
Found: YYYY-MM-DD
```

### Pre-Commit Protocol (MANDATORY)

Before EVERY commit and push, Claude MUST:

1. **Update SPEC.md** — Section 2 (Current State), Roadmap checkboxes, any sections affected by the changes
2. **Update DEVLOG.md** — Add a session entry or append to the current session entry describing what was built/fixed
3. **Bump the version** in SPEC.md header (patch for fixes, minor for features)
4. **Run E2E tests** — `node e2e/vitals_flow.cjs && node e2e/probe_damage_flow.cjs` — do NOT commit if tests fail
5. **Build check** — `npx vite build --mode development` — do NOT commit if build fails

This is not optional. A commit without updated docs means the next session starts with stale context.

### GitHub Hygiene
- Commit messages should be descriptive (what changed and why, not just "update")
- Never commit `.env` files or secrets
- Feature branches for anything experimental; merge to main only when stable
- SPEC.md, DEVLOG.md, and GOTCHAS.md changes go in the same commit as the code they describe — never in a separate "update docs" commit

---

## 13. Conventions Tracker

*(Append-only — never remove entries, only mark deprecated. This prevents Claude from re-introducing patterns that were already rejected in previous sessions.)*

- 2026-03-22: All DSA5 rules in `engine/` as pure functions, no side effects
- 2026-03-22: AI assists GM only, never visible to players, never decides mechanics
- 2026-03-22: Physical dice with manual input as primary, digital dice never forced
- 2026-03-22: Player Views show ONLY what the character would know
- 2026-03-22: Voice at table is primary, app is secondary — no action requires silence
- 2026-03-22: GM advances game manually, app never auto-advances
- 2026-03-22: GM can always HALT/interrupt any player action
- 2026-03-22: Databank seed data in JSON files under databank-seed/
- 2026-03-22: Runtime creatures are mutable copies of immutable databank templates
- 2026-03-22: Adventures stored as scene graphs, not linear scripts
- 2026-03-22: Characters owned by user accounts, campaigns hold references + snapshots
- 2026-03-22: Cloud-hosted only, always accessible for between-session character/lore management
- 2026-03-22: Inventory hybrid: Basis-Inventar (persistent on account) + Kampagnen-Snapshot (per campaign, GM-approved carry-over)
- 2026-03-22: WebSocket for all live session communication, REST for CRUD outside sessions
- 2026-03-22: AI-generated maps default to structured JSON (Mode 1), image generation (Mode 2) optional
- 2026-03-22: Asset library pre-populated, every databank entity has a default icon
- 2026-03-25: Server-side delta resolution — backend resolves deltas to absolute before broadcast, frontend handles both as fallback
- 2026-03-25: Never trust API field types — use `safeData.js` helpers (`getConditions()`, `getVitalsFrom()`, `getMaxVitals()`) for all data extraction
- 2026-03-25: Never use `getState()` in component render paths — use `useStore((s) => s.field)` selectors for displayed data
- 2026-03-25: All background persistence uses `_safe_create_task` with error logging, never bare `asyncio.create_task`
- 2026-03-25: Per-character locks (`_get_char_lock`) for all database write functions
- 2026-03-25: Components read from Zustand stores (live WS updates), never from API fetches during active sessions
- 2026-03-25: DEVLOG entries written in non-technical language describing user-visible changes, not implementation details
- 2026-03-25: SPEC.md + DEVLOG.md MUST be updated before every commit (Pre-Commit Protocol in section 12)
-->
<!-- End of roadmap content moved to TODO.md -->
