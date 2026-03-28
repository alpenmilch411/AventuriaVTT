# Aventuria VTT — TODO
**Last updated:** 2026-03-27 (Session 14)

---

## Phase 2: Combat & Polish (remaining)
- [x] Schicksalspunkte usage flow in combat UI — SchipMenu component, 4 usage types (reroll, defense boost, halve damage, ignore condition), auto-deduct on additional reactions, GM quick +/-, SchiP reset at session start, Protokoll logging, session statistics
- [ ] Guided combat flow (Basic complexity mode with step-by-step hints)
- [ ] Group inventory

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
- [ ] Export (character, campaign, session log)

## Open Bugs & Polish
- [x] InventoryPanel.jsx JSX syntax error (stray brackets causing DOM render issue) — fixed Session 14
- [x] Stale "Äxte" combat technique in CreateEntryModal.jsx — removed, added all 21 DSA5 CTs
- [x] Stale "Äxte"/"Zweihandäxte" in DatenbankDetail.jsx + combatManeuvers.js — removed/renamed to Zweihandhiebwaffen (Hammerschlag/Windmühle maneuvers were broken)
- [x] Missing model exports in backend/models/__init__.py — 8 Session 13-14 models not exported
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

**Audit completed 2026-03-27.** Reports: `reports/optolith-audit-report.md`, `reports/feature-unlock-report.md`, `reports/optolith-integration-plan.md`. Converter: `backend/importers/optolith_converter.py`. Optolith v1.5.2 data extracted to `/tmp/optolith-data/`. Two-layer architecture: `de-DE/` (German text) + `univ/` (structured numeric data). Converter merges both.

**Final result: 602 → 3,638 entities (6x increase) — all phases complete**

- [x] Optolith data audit — full diff report per entity type (see `reports/optolith-audit-report.md`)
- [x] Verify seed data accuracy against Optolith — 3 critical talent name bugs, ~8 naming mismatches, spell accuracy issues found
- [x] Compatibility analysis — app broadly compatible; 4 page_size truncation fixes + 2 schema additions needed (see `reports/feature-unlock-report.md`)
- [x] Build Optolith YAML → seed JSON converter (`backend/importers/optolith_converter.py`, 1148 lines, --dry-run/--category flags)

### Phase 1: Bug Fixes + Clean Import — DONE (2026-03-27)
- [x] **P0: Fix talent name bugs** — "Sinnenschärfe"→"Sinnesschärfe", "Kochen"→"Lebensmittelbearbeitung", "Fesseln/Entfesseln"→"Fesseln" (+ updated all culture/profession/item/SA/spell references)
- [x] **P0: Fix advantage/disadvantage naming** — "Eisenaffin"→"Eisenaffine Aura", "Unempfindlich gegen Hitze/Kälte"→"Hitzeresistenz"/"Kälteresistenz", "Angst vor ..."→"Angst vor", "Persönlichkeitsschwäche"→"Persönlichkeitsschwächen"
- [x] **P0: Fix page_size=200 truncation** — auto-pagination in CharacterCreator, SpellBook, LootPanel, DataBrowser (fetches all pages in a loop)
- [x] **P0: Remove "Äxte" combat technique** — removed from seed.py, remapped weapons/professions/SAs to "Hiebwaffen"
- [x] **P0: Remove "Kampfrausch" from advantages** — was misclassified (it's a Special Ability in DSA5)
- [x] **P0: Replace all 30 spells** with Optolith values — now 330 spells with correct casting times/costs/durations
- [x] **P0: Replace all 20 liturgies** with Optolith values — now 226 liturgies with correct DSA5 names
- [x] **P0: Replace weapons/armor/shields** with Optolith values — 245 weapons, 52 armor, 15 shields
- [x] Ran converter + `python -m databank.seed` — DB now at 1,404 databank rows (was 602, +802)

### Phase 2: Schema + High-Impact Features — DONE (2026-03-27)
- [x] Add `improvement_cost` column to `SpellTemplate` + `LiturgyTemplate` — added column + startup migration, all 330 spells + 226 liturgies have SF populated from Optolith
- [x] Run converter for: advantages (43→161), disadvantages (44→110), items (113→594), professions (46→180)
- [x] Add SA search/filter to CharacterCreator Step 8 — `SASelector` component with text search, category tabs, filtered count
- [x] Replace hardcoded `TALENT_CATEGORIES` in CharacterCreator with DB talent template lookups — all 59 talents now shown, grouped by category
- [x] Replace hardcoded `KT_SF` in SteigerungTab with `ct.improvement_cost` from template data

### Phase 3: Full Expansion — DONE (2026-03-27)
- [x] Import 1,438 special abilities from Optolith (64→1,438)
- [x] Add "Learn New Spell/Liturgy" feature to SteigerungTab — tradition-filtered browser, backend validates against DB templates, dynamic tradition detection from SA names
- [x] Add SA purchase interface to SteigerungTab — category tabs derived from data, search, filters out owned SAs, backend validates AP cost against DB
- [x] Restructure disadvantages: 11 "Schlechte Eigenschaft" sub-options with correct DSA5 naming and AP costs from Optolith
- [x] Fix profession equipment ID mismatches — 19 broken template_ids remapped, 34 missing mundane items + 3 armor pieces added
- [x] Fix test character data — liturgy names, talent key mismatches, inventory template_ids corrected
- [x] Fix wiki pages — 3 fabricated liturgy names replaced with real DSA5 names
- [x] Remove all hardcoded values — activation costs validated by backend, tradition detection dynamic, SA categories derived from data
- [x] DB now at 3,529 databank rows (was 602 at session start, **5.9x increase**)

### Phase 4: Enrichment — DONE (2026-03-27)
- [x] Cantrips table (97 Zaubertricks) + Blessings table (12 Segnungen) — new CantripTemplate + BlessingTemplate models, API endpoints, SpellBook display, DatenbankTab categories, DataBrowser support
- [x] Spell Enhancements (330 spells × 3 levels = 990 upgrades) — JSON field on SpellTemplate, SpellBook shows per-spell, SteigerungTab lets players purchase, backend validates AP cost
- [x] Liturgy Enhancements (211 liturgies × 3 levels = 633 upgrades) — same pattern on LiturgyTemplate
- [x] Spell Property (Merkmal) — property column on SpellTemplate, PropertyBadge component, filter bar in SpellBook, badge in DatenbankDetail
- [x] Profession Variants (56 professions with variants) — variants JSON on ProfessionTemplate, variant picker in CharacterCreator Step 5, detail display in DatenbankTab
- [x] Race Variants (Menschen 7 + Elfen 3) — variants JSON on SpeciesTemplate, variant picker in CharacterCreator Step 2, detail display in DatenbankTab
- [x] DB now at 3,638 databank rows

### Phase 5: Remaining Enrichment (future)
- [ ] Add culture metadata: common/uncommon advantages/disadvantages (wizard guidance), commonNames (name generator), areaKnowledge
- [ ] Add Curses (24), Elven Magical Songs (18), Magical Dances (26), Magical Melodies (24), and other tradition-specific entity types
- [ ] Add Conditions/States from Optolith to supplement conditionsEngine (Animosität, Berauscht, Trance, etc.)
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
- [x] Seed data fixes (Zweihandhiebwaffen, umlauts, all 33 cultures, all 46 professions filled)
- [x] Seed import validation (required fields + cross-references)
- [x] React infinite loop on combat start fixed (3 fixes: batched store, useRef guard, useEffect)
- [x] Säbel AT/PA=0 fixed, GM overview AT/PA/FK fixed
- [x] Verzückung + Bewusstlosigkeit conditions added
- [x] Languages support (DB column, wizard save, player + GM display)
- [x] Character creation: Bearbeiten opens wizard in edit mode, available_ap fix
- [x] DSA5 rules fixes: AsP/KaP formula, 80 AP advantage cap, AT/PA split UI
- [x] Character viewer (9-tab read-only overlay with formula explanations, portrait upload)
- [x] Wizard help text on all 10 creation steps
- [x] Advantages DB (43 entries) + Disadvantages DB (44 entries) — models, seed, API
- [x] Starting equipment per profession (46 professions mapped to existing item template_ids)
- [x] SA purchase step in wizard (browse + toggle from DB)
- [x] Wizard fetches advantages/disadvantages from API instead of hardcoded arrays
