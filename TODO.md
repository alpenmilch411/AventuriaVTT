# Aventuria VTT — TODO
**Last updated:** 2026-03-27 (Session 13)

---

## Phase 2: Combat & Polish (remaining)
- [ ] Fernkampf range brackets UI (engine built, UI pending)
- [ ] Schicksalspunkte usage flow in combat UI
- [ ] Guided combat flow (Basic complexity mode with step-by-step hints)
- [ ] Group inventory
- [ ] Map editor: draw tool, difficult terrain painting, fog brush

## Phase 3: Persistence & Campaign (remaining)
- [ ] Session recap (AI-generated) — API stub exists
- [ ] Character death memorial + archive UI — model exists, UI pending
- [ ] Inventory carry-over flow at campaign end
- [ ] Character lifecycle state machine UI (active→resting→retired)

## Phase 4: AI Features (stubs built, nothing active)
- [ ] AI Import Portal (PDF upload → extraction) — backend code exists, UI needs polish, Claude API not wired
- [ ] AI NPC dialog generation — backend code exists, needs API key + live testing
- [ ] AI session recap — backend code exists, needs API key

## Phase 5: Nice-to-Have
- [ ] Shop system (NPC merchants)
- [ ] Weather & environment modifier auto-calculation — backend handler exists, no UI
- [ ] Regeneration & rest workflow — backend handler exists, no UI
- [ ] Session feedback & voting
- [ ] Regelmodul-System (optional rules toggle)
- [ ] Campaign achievements
- [ ] Complexity level switching (Basic/Standard/Advanced)
- [ ] Quick character templates UI — backend exists (6 archetypes), UI pending
- [ ] Export (character, campaign, session log)

## Open Bugs & Polish
- [ ] Combat victory screen — AP award + loot exist, no dedicated victory UI after combat
- [ ] Creature stat editing mid-combat
- [ ] Player pending requests withdraw option — system works, dismiss/withdraw UX needs polish
- [ ] Mobile responsive header
- [ ] Opposed probes UI — backend supports it, UI selector missing
- [ ] In-game time tracking UI — backend handler exists (`_handle_time_advance`), no frontend
- [ ] Weather system UI — backend handler exists (`_handle_weather_change`), no frontend
- [ ] Ranged reload tracking UI — reload modifiers defined, no mid-combat reload state
- [ ] Protokoll entry fix ("Singen — 0 bestanden" malformed group probe)
- [ ] Loot panel text search umlaut handling (searching "Staerke" vs "Stärke")
- [ ] DatenbankDetailModal missing Escape key support
- [ ] Session lobby→active transition has no clear UI

## Data Completeness & Optolith Integration (HIGH PRIORITY)
- [ ] **Optolith data audit** — Optolith is installed at `~/Library/Application Support/Optolith/`. Needs a thorough comparison screen: for every entity type (species, cultures, professions, advantages, disadvantages, spells, liturgies, talents, SAs, combat techniques, items, creatures), compare our seed data against Optolith's licensed data and show what can be used, replaced, or added. Build an import tool or at minimum a diff report.
- [ ] Verify ALL seed data accuracy against Optolith (AP costs, skill bonuses, attribute mods, formulas)
- [ ] Replace approximate Claude-generated values with exact Optolith values where available
- [ ] Insure compatability if with existing database, frontend and backend.
- [ ] Import missing advantages/disadvantages from Optolith (full catalog with AP costs, prerequisites, rules)
- [ ] Import missing spells/liturgies from Optolith (full catalog per tradition)
- [ ] Import missing special abilities from Optolith
- [ ] Import missing creatures from Optolith
- [ ] Expand culture/profession coverage from Optolith supplement data
- [ ] Icons and portraits for creatures/professions/species

## Removed from Scope
- ~~AI Map Generation~~ — cut
- ~~Dice camera (on-device ML)~~ — cut
- ~~GM scene view right panel~~ — scenes removed
- ~~Multi-GM / Co-GM mode~~ — cut for v1
- ~~Spotlight system~~ — cut for v1
- ~~Soundboard~~ — cut

---

## Recently Completed (Session 13, 2026-03-27)
- [x] DB-ID inventory architecture (template_id, backend enrichment)
- [x] Shared combat computation (combatComputation.js)
- [x] Item classification by DB category (itemClassification.js, all regex deleted)
- [x] Buff system (active_buffs, WS handlers, timer UI, GM controls)
- [x] Structured item effects (28 items: probe_bonus, condition_remove, etc.)
- [x] Combat items in TurnFlow, probe bonus items in talent probes
- [x] Unified browser categories (DatenbankTab, DataBrowser, LootPanel, InventoryPanel)
- [x] DatenbankTab "Alle" cross-category search
- [x] AP awards persisted to DB at session end
- [x] Character edit blocked during active session
- [x] Seed data fixes (Zweihandhiebwaffen, umlauts, 9 cultures, 10 professions)
- [x] Seed import validation (required fields + cross-references)
- [x] React infinite loop on combat start fixed
- [x] Säbel AT/PA=0 fixed, GM overview AT/PA/FK fixed
- [x] Verzückung + Bewusstlosigkeit conditions added
