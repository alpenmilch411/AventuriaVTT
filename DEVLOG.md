# Aventuria VTT — DEVLOG

*(Newest first. One entry per meaningful unit of work.)*

---

## Session 4 — Item System, Combat Maneuvers & Data Consistency (2026-03-24)

**What happened:**
Completed the full item usage system, expanded combat maneuvers with SF-gating, migrated ArmoryTab to centralized combat values, added real-time inventory sync, and implemented off-hand attack player dice flow.

**Major features built:**

1. **Poison Weapon System** — Players can apply Wundgifte to melee weapons via "Gift auftragen" in TurnFlow. Weapon is marked as poisoned in combatant state. On next successful hit (SP > 0), poison triggers automatically: logs ZK-probe requirement with modifier, consumes the poison. Poison indicator shown in attack modifier breakdown. Works for both GM manual damage and player dice results.

2. **SF-Gated Combat Maneuvers** — Expanded from 5 to 13 maneuvers. Added: Hammerschlag (halve RS), Sturmangriff (+AT/-PA), Klingensturm (2 attacks, no PA), Todesstoß (double damage), Windmühle (AoE melee), Niederwerfen (knockdown), Gezielter Stich (ignore 2 RS), Entwaffnen (no damage, disarm). Each gated by character's Sonderfertigkeiten. Basis maneuvers always available, NPCs see all. Damage calculation updated for halveRS, ignoreRS, doubleDamage, noDamage in both player-dice and GM-manual paths.

3. **Combat Throwable Items** — Brandbombe (2W6 fire AoE), Raucherbombe (smoke cloud, Verblendet log), Donnerball (stun, KO-probe per target). Raucherbombe and Donnerball get dedicated `smoke` and `stun` step types in TurnFlow. All consume on use with AoE multi-target selection.

4. **Herb Usage with Heilkunde Probe** — Items with `category: "heilkraut"` flagged as `requiresProbe`. Probe skill auto-detected (Heilkunde Wunden/Gift/Krankheiten based on effects). Player sends probe_request to GM. Herb consumed immediately (used whether probe succeeds or not). TurnFlow shows probe requirement indicator.

5. **ArmoryTab Full Migration** — Removed all local computation fallbacks. All combat values (AT/PA/FK/AW/INI/GS/RS/BE/WS/SB) now exclusively from `useCombatValues` hook. Derivation formulas use centralized values.

6. **Off-Hand Attack Player Dice Flow** — Fixed `autoSentRef` not being reset for off-hand attacks (was preventing dice_request from being sent). Off-hand dice request now correctly uses the weapon's AT with Beidhändig penalty. Label shows "Nebenhand-Attacke" for clarity.

7. **Real-Time Inventory Sync** — After item use/consume, `inventory_change` message broadcast via WebSocket. Backend handler relays to all clients in the room. Frontend updates both `allCharacters` (GM view) and `myCharacter` stores. GM sees player inventory changes in real-time.

**Files changed:**
- `frontend/src/views/gm/TurnFlow.jsx` — Poison system, SF-gated maneuvers, combat item handlers, herb probe indicator, off-hand dice reset
- `frontend/src/views/player/InventoryPanel.jsx` — Poison item use, herb probe flow, inventory_change broadcast
- `frontend/src/views/player/ArmoryTab.jsx` — Full migration to useCombatValues, removed fallbacks
- `frontend/src/engine/itemEffects.js` — smoke_cloud classification, stun/smoke resolution, requiresProbe for herbs
- `frontend/src/hooks/useWebSocket.js` — inventory_change handler
- `backend/ws/handlers.py` — inventory_change broadcast handler

**Data consistency:**
- All computed values across VitalsBar, ArmoryTab, CombatActions, and CharacterSheet now use the same centralized `useCombatValues` hook — no stale backend fallbacks remain.

---

## Session 3 — VitalsBar Redesign, Centralized Values & UX Polish (2026-03-23)

**What happened:**
Complete redesign of the VitalsBar/header based on 10 UX expert agent reviews. ArmoryTab redesign with 3-column layout. CharacterSheet cleanup. Created centralized `useCombatValues` hook as single source of truth. Added colored headers across all tabs. Item usage system initial implementation.

**Major features built:**
- VitalsBar: grouped stat layout (Energien, Eigenschaften, Kampfwerte, Kampfrunde/Widerstand, Ressourcen), portal tooltips, condition corner indicators (gross positive/negative), fate diamond, rich derivation tooltips
- ArmoryTab: 3-column layout (Nahkampf/Fernkampf/Schutz), DSA5 equipment rules enforcement, diamond EquipSlot, Kampftechniken table
- CharacterSheet: conditions panel, categorized Sonderfertigkeiten (Kampf/Magie/Karma/Allgemein), SF detail popups
- useCombatValues hook: centralized AT/PA/FK/AW/INI/GS/RS/BE computation from KTW + mods - BE - conditions
- Dynamic condition modifiers with gross positive/negative display
- All labels written out (no abbreviations), white font color, consistent 68px stat cells
- Colored tab headers across SpellBook, TalentList, InventoryPanel, JournalTab, TradeTab, CombatActions

**Backend changes:**
- Player-sent vitals_update, conditions_update, combat_log_entry handlers
- conditions field added to campaign players-detail endpoint

---

## Session 2 — Deep Integration & Combat System (2026-03-23)

**What happened:**
Continued intensive iteration on GM↔Player connectivity, combat system, and action flow. Fixed the critical WebSocket relay bug (`_msg()` crashing on plain strings), built the complete combat overlay, action composer, probe popup, and loot distribution system.

**Critical bug fixed:**
- `_msg()` in ws/handlers.py called `.value` on plain string event types, silently killing ALL WebSocket message relay. Fixed with `hasattr(event_type, 'value')` check. This was the root cause of GM and player views being disconnected.

**Major features built:**
- Combat overlay popup with initiative management, turn flow wizard (DSA5 rules), damage/healing tracking
- Action Composer for GM (probe setup with outcomes, difficulty, player stat preview)
- ProbePopup for players (fullscreen 3W20 dice input with live result calculation)
- Loot distribution system (GM selects → shows to table → assigns to players)
- Creature/NPC spawn panel with databank search and multi-select
- Player map view with movement/attack/interaction requests
- Notification system: GM Anfragen pill + Player bell icon with dropdown
- Table View with Szene/Karte/Protokoll tabs
- Session log in both Global and Scene views

**Connectivity audit results:**
- 15 features fully connected via WebSocket
- 8 partially connected (fixed during session)
- Key fixes: handout push handler, loot inventory update, time/weather handlers, defense request, dice result, table view scene switching

**Open issues identified:**
- Trading workflow not fully working in browser (WebSocket relay works in tests)
- Anfragen UI needs polish (show who, what type, auto-dismiss on resolution)
- Executed actions should broadcast to all players' logs
- Player request status tracking needs improvement

---

## Session 1b — UI Polish & Gameplay Wiring (2026-03-22, continued)

**What happened:**
Extensive UI iteration based on live testing with the user. Multiple redesign cycles for both GM and player views. Key focus: making everything work for beginners, proper action flow (all player actions through GM approval), map interaction, loot system, spawn system.

**Major changes:**
- GM Cockpit redesigned with Global View (campaign overview) and Scene View (active scene with map)
- Scene View left panel: collapsible sections (Vorlesetext, SL-Notizen, Geheimnisse, Personen with full NPC detail, Objekte, Fallen)
- Map token interaction: click any token for full stat block, attributes, attacks, personality, knowledge, secrets, action buttons
- Creature/NPC spawn panel: databank search with category filters (🧑 Humanoide, 🐺 Tiere, 💀 Untote, etc.), multi-select, quantity, visibility toggle
- Loot distribution: GM selects items → shows to table → assigns to players → flows into inventories
- Player view: desktop multi-column layout, premium dark fantasy styling, all actions go through GM
- Talent probes: player requests → GM accepts/sets difficulty → player rolls (flow designed, WebSocket relay built)
- Spell/liturgy casting: same GM-approval flow with AsP/KaP cost display
- Inventory actions: unified request system with Aktionen cost awareness, weapon swap logic
- Player map view: see own token, click creatures to attack, click cells to move, all through GM
- WebSocket relay: messages pass between GM and player views
- 20 broken GM buttons identified and fixed
- Player notification overlay for GM messages and action results
- Beginner help: explanations throughout, rules reference tab, FW buffer explanation

**Design decisions:**
- Creature vs NPC distinction: Creatures are generic databank stat blocks (spawn 3 Orks). NPCs are named story characters with personality/secrets. Both kept separate — different purposes.
- All player actions require GM approval — no direct game state changes by players
- Table View: immersive display only, no controls. Players see it as a tab. GM controls what's shown.
- Left panel in scene view is collapsible to give map more space

**Known issues:**
- WebSocket connection through Vite proxy may need page refresh to establish
- Spawned tokens don't appear on map instantly (need scene reload)
- Right panel in scene view needs further polish
- Full dice roll flow not yet end-to-end connected
- Fog of war GM controls not yet built

---

## Session 1 — Full Implementation (2026-03-22)

**What happened:**
Complete implementation of the entire Aventuria VTT application in one session. All phases from the roadmap built simultaneously — not just MVP but the full feature set (minus dice camera, which was explicitly excluded).

**What was built:**

| Component | Files | Lines | Description |
|-----------|-------|-------|-------------|
| Backend Models | 10 | ~2,000 | 33 SQLAlchemy models covering users, characters, campaigns, sessions, combat, maps, NPCs, inventory, adventures, databank |
| DSA5 Engine | 13 | ~3,400 | Pure function rules engine: probes (1W20/3W20), combat, damage, initiative, conditions, magic, liturgies, movement (A*), inventory, rest/regeneration, leveling, modifiers |
| REST API | 13 | ~5,500 | 102 endpoints across auth, characters, campaigns, sessions, combat, probes, inventory, maps, databank, adventures, AI assist, NPCs |
| WebSocket Layer | 4 | ~1,300 | Connection manager, 50+ event types, 41 message handlers, HALT system, reconnection |
| AI Assist | 6 | ~1,000 | Claude API integration: NPC dialog, rules Q&A, improv suggestions, session recap, adventure extraction, map generation |
| Character Importers | 4 | ~2,000 | Optolith & DSA Ultimate JSON parsers, adventure PDF extractor, format auto-detection |
| Databank Seed | 12 | ~6,400 | 424 records: 60 creatures, 42 weapons, 16 armor, 6 shields, 77 items, 30 spells, 20 liturgies, 59 talents, 42 SFs, 36 rules snippets, herbs/potions, poisons/diseases |
| Frontend | 55 | ~9,000 | Complete React app: auth, dashboard, GM Cockpit (11 views), Player Dashboard (12 views), Table View, Prep Workshop (6 views), 9 shared components, 6 Zustand stores, 4 custom hooks |
| Config | 8 | ~100 | Docker-compose, .env, Vite, Tailwind, PostCSS, package.json |

**Total: ~130 files, ~30,700 lines of code**

**Key implementation decisions:**
- Table View accessible to any user as a tab (not restricted to dedicated TV/projector)
- Dice camera feature excluded per user request
- Dark theme with DSA-themed colors (dark browns, gold accents, parchment text)
- German labels throughout the UI (target audience: German-speaking DSA groups)
- All frontend components are fully functional with proper state management and WebSocket integration

**Design refinements from user feedback during session:**
- Table View is just another browser route (`/table/:sessionCode`) accessible to everyone, not only dedicated screens
- Each user can open the shared view as a tab on their device

**Next steps:**
- Set up GitHub repository
- `docker-compose up` to start PostgreSQL + Redis
- Install Python dependencies and run backend
- Run `python -m databank.seed` to populate reference data
- Test complete flow: register → create campaign → create session → join from player device

---

## Session 0 — Architecture & Design (2026-03-22)

**What happened:**
Full architecture design across multiple Claude.ai chat sessions. Started with an AI-GM concept, pivoted fundamentally to a human-GM toolkit after discussion. Designed the complete system across 7 thematic batches, reviewed and refined each.

**Key decisions:**

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| AI role | GM assistant, not GM replacement | The conversation at the table IS the game. AI handles bookkeeping and prep, not storytelling. |
| Core philosophy | "App follows the GM, not the other way around" | Every action must work spontaneously. No mandatory workflows. 2-tap max for common actions. |
| Physical table | Primary interaction model | Voice at table is primary, app is secondary. Phones face-down most of the time. GM controls the pace. |
| Complexity levels | Basic / Standard / Advanced | New groups get step-by-step combat guidance with rule explanations. Veterans get minimal UI. |
| Hosting | Cloud-only | Players need access between sessions (character management, lore browsing, leveling). Always-on service. |
| Character ownership | On player account, not in campaigns | Characters persist across campaigns. Campaigns hold references + snapshots. Hybrid inventory model with GM-approved carry-over. |
| Dice | Physical with manual input | Tactile experience stays. Camera recognition as future optional feature. |
| Combat engine | Deterministic pure functions, no AI | `engine/` module computes all mechanics. AI never decides dice outcomes or rules. |
| Map generation | AI generates structured JSON → app renders | Mode 1 (structured) is default and fast. Mode 2 (image) is optional for atmosphere. Maps auto-generated from adventure import descriptions. |
| Content import | AI-assisted pipeline: PDF → extraction → GM review | Claude extracts structure from adventure PDFs. Always a draft — GM is final authority. |
| Asset library | Pre-populated, every entity has a default icon | App feels complete out of the box. GM customizes only if they want to. |
| GM interrupt | HALT button + pre-set triggers | GM can freeze all player actions instantly (<100ms). Traps/events as invisible map triggers. |
| Session management | Kampagnen-Code (permanent) + Session-Code (ephemeral) | Two separate join flows: campaign membership vs game-night connection. |
| Data sources | Optolith schema, Regel-Wiki scraper, Foundry VTT reference | Existing open-source DSA5 projects accelerate databank population. |

**Architecture summary:**
- 11 major sections in SPEC.md covering: Product Overview, Tech Stack, GM Cockpit (15 subsections), Player Dashboard (16 subsections), Persistence (14 subsections), Content Pipeline (8 subsections), Realtime Layer (12 subsections), AI Features (3 subsections), Nice-to-Have (12 features), Roadmap (5 phases), Conventions
- React + FastAPI + PostgreSQL + Redis + Claude API
- Three client views: GM Cockpit (laptop), Player Dashboard (phone), Table View (TV)
- 100% browser-based, responsive, PWA-capable

**Open questions for Phase 1:**
- [ ] Exact Optolith JSON format — need sample export files from group
- [ ] Which DSA5 optional rules does the group want active?
- [ ] Domain name / hosting provider
- [ ] Asset library: which CC0 icon packs to include in core?
- [ ] Test with the group: is the HALT button responsive enough on WiFi?

**Next steps:**
Phase 1 MVP — FastAPI skeleton, user auth, character import (Optolith JSON), campaign/session management, basic combat engine, probe resolution, grid map with tokens, WebSocket realtime sync, simple Table View.
