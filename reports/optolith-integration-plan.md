# Optolith Integration Plan — Final Report

**Date:** 2026-03-27
**Team:** optolith-integration (dsa-rules-expert, data-importer, feature-analyst)
**Input:** Optolith v1.5.2 YAML data (extracted to `/tmp/optolith-data/`)

---

## 1. Current State vs Optolith

| Category | Ours | Optolith | Importable | Growth |
|---|---|---|---|---|
| Species | 4 | 4 | 4 | same |
| Cultures | 33 | 33 | 33 | same (richer data) |
| Professions | 46 | 259 | 180 | **+134** |
| Advantages | 43 | 135 | 132 | **+89** |
| Disadvantages | 44 | 83 | 82 | **+38** |
| Spells | 30 | 330 | 330 | **+300** |
| Liturgies | 20 | 227 | 226 | **+206** |
| Special Abilities | 64 | 1,447 | 1,438 | **+1,374** |
| Talents | 59 | 59 | 59 | same |
| Combat Techniques | 22 | 21 | 21 | same |
| Weapons | 42 | ~200 | 245 | **+203** |
| Armor | 16 | ~50 | 52 | **+36** |
| Shields | 6 | ~10 | 15 | **+9** |
| Items | 77 | ~615 | 500 | **+423** |
| **TOTAL** | **505** | **~3,463** | **3,317** | **+2,812** |

---

## 1b. Spell/Liturgy Accuracy Alert

**Our existing 30 spells have incorrect base values** — these are AI-approximated, not from the rulebook. Confirmed errors:

| Spell | Our Value | Correct Value |
|---|---|---|
| IGNIFAXIUS | Zauberdauer: 1 Aktion | **2 Aktionen** |
| ARMATRUTZ | Sustained (Aufrechterhalten) | **Timed: QS×3 min, tiered cost 4/8/16 AsP** |
| BALSAM SALABUNDE | Flat 8 AsP | **1 AsP per LeP healed, min 4** |
| GARDIANUM | Incorrect cost model | Needs verification |
| DUPLICATUS | Incorrect duration | Needs verification |

**All 30 existing spells should be replaced with Optolith's authoritative values**, not just supplemented with new ones.

**Liturgy names are entirely custom** — don't match DSA5 names at all. "Kleiner Segen" is actually a Blessing (separate entity type), not a Liturgy. All 20 liturgies need renaming/replacement.

**Additional entity types in Optolith we have no tables for:**
- 97 Cantrips (Zaubertricks) — minor spells every mage knows
- 12 Blessings (Segnungen) — minor prayers every Geweihter knows
- 330 Spell Enhancements (Zaubererweiterungen)
- 213 Liturgy Enhancements (Liturgieerweiterungen)
- 24 Curses (Flüche)
- 18 Elven Magical Songs

---

## 2. Data Accuracy Issues (Fix Before Import)

### P0 — Critical Bugs (3 talent naming errors)

These cause silent lookup failures between culture_templates and talent_templates:

| Table | Current Name | Correct Name | Impact |
|---|---|---|---|
| talent_templates | Sinnenschärfe | **Sinnesschärfe** | Culture skill_bonuses use correct spelling → mismatch |
| talent_templates | Kochen | **Lebensmittelbearbeitung** | Wrong DSA5 name entirely |
| talent_templates | Fesseln/Entfesseln | **Fesseln** | Extra suffix |

Also rename in any culture/profession that references these.

### P0 — Naming Mismatches (advantages/disadvantages)

| Current | Correct (Optolith) |
|---|---|
| Eisenaffin | Eisenaffine Aura |
| Unempfindlich gegen Hitze | Hitzeresistenz |
| Unempfindlich gegen Kälte | Kälteresistenz |
| Angst vor ... | Angst vor (no dots) |
| Persönlichkeitsschwäche | Persönlichkeitsschwächen |

### P0 — Misclassified Entries

- **Kampfrausch** is listed as an Advantage but is a Special Ability in DSA5
- **Goldgier, Jähzorn, Autoritätsgläubig** are standalone disadvantages but should be sub-options of "Schlechte Eigenschaft"
- **Äxte** combat technique doesn't exist in DSA5 (axes use Hiebwaffen/Zweihandhiebwaffen)

### P1 — Missing Core Rulebook (GRW) Data

Missing GRW advantages (critical): **Zauberer** (magic prerequisite!), **Begabung**, **Waffenbegabung**, **Herausragende Kampftechnik**, **Richtungssinn**, plus ~19 more.

Missing GRW disadvantages: **Arm**, **Behäbig**, **Hässlich**, **Nachtblind**, **Zerbrechlich**, **Wilde Magie**, **Zauberanfällig**, plus ~18 more.

Missing GRW spells (~23): Adlerauge, Analys Arkanstruktur, Blick in die Gedanken, Disruptivo, Katzenaugen, and more.

---

## 3. What Can Be Imported Immediately vs Needs Review

### Import immediately (converter handles these cleanly)
- **Spells** (330) — names, traditions, check attributes, AsP cost, range, duration, description
- **Liturgies** (226) — names, traditions, check attributes, KaP cost, range, duration
- **Combat Techniques** (21) — names, primary attribute, improvement cost
- **Talents** (59) — names, category, check attributes, applications
- **Weapons** (245) — names, damage, AT/PA mod, reach, combat technique, weight, price
- **Armor** (52) — names, RS, BE, weight, price
- **Shields** (15) — names, AT/PA mod, weight, price

### Import with manual review needed
- **Professions** (180) — skill/CT packages auto-mapped but some variants are deduped; starting equipment/money not in Optolith (keep existing)
- **Advantages** (132) — names and AP costs auto-mapped; leveled advantages need review (we split into rows, Optolith uses single entry with levels)
- **Disadvantages** (82) — same leveled-entry issue
- **Special Abilities** (1,438) — names, AP costs, prerequisites text imported; combat modifiers (at_mod, pa_mod) require manual rules parsing
- **Items** (500) — general items mapped; some Optolith categories may not match our schema perfectly

### Cannot import from YAML (manual entry needed)
- Spell effect_per_qs tables (free-text in Optolith `effect` field)
- SA combat modifiers (at_mod, pa_mod, damage values — require manual rules parsing)
- Profession starting_equipment and starting_money (not in Optolith data)

**CORRECTION:** Initial audit reported Optolith YAML as "narrative only" — this was only true for the `de-DE/` text layer. Optolith has a **two-layer architecture**: `de-DE/` (German text) + `univ/` (structured numeric data). The converter merges both. Structured AP costs, probe attributes, improvement costs, skill values, weapon stats, armor RS/BE, and spell traditions ARE available and imported.

---

## 4. Features Unlocked by Data Expansion

### Unlocked for free (no code changes, 10 features)
1. **Character Creator Culture step** — Kulturpakete already wired, skill bonuses already populated (false alarm on empty data)
2. **Character Creator Profession step** — combat_techniques + skills merge already coded
3. **Character Creator spell/liturgy auto-population** — works with any number of spells
4. **Character Creator advantage/disadvantage selection** — more variety, AP budget already correct
5. **Player SpellBook** — spell details auto-populate from templates
6. **GM Session Prep** — browse 330 spells, 227 liturgies, 875 items, 1,447 SAs
7. **GM Loot Panel** — 5x more items to distribute
8. **Dashboard Databank Browser** — already paginated and searchable
9. **Steigerung spell/liturgy upgrades** — correct SF from expanded templates
10. **GM DataBrowser picker** — larger catalog with existing search

### Needs code fixes first (4 P0 items)

| Fix | File(s) | Effort |
|---|---|---|
| `page_size=200` truncation | `CharacterCreator.jsx:118`, `SpellBook.jsx:47`, `LootPanel.jsx:152`, `DataBrowser.jsx:39` | 1 line each |
| Talent name typos (3) | DB migration or seed update | 10 min |
| Advantage/disadvantage renames | DB migration or seed update | 10 min |
| Remove "Äxte" combat technique | DB + any weapon references | 5 min |

### Needs backend additions (2 P1 items)

| Change | File | Effort |
|---|---|---|
| Add `improvement_cost` column to SpellTemplate | `backend/models/databank.py:312` | Migration + seed |
| Add `improvement_cost` column to LiturgyTemplate | `backend/models/databank.py:346` | Migration + seed |

### Needs UI work (4 P1-P2 items)

| Feature | File | Effort |
|---|---|---|
| SA search/filter in creator Step 8 | `CharacterCreator.jsx:663` — reuse DataBrowser | Medium |
| "Learn New Spell" in SteigerungTab | `SteigerungTab.jsx` — add DataBrowser + learn flow | Medium |
| Replace hardcoded TALENT_CATEGORIES with DB lookup | `CharacterCreator.jsx:62-93` | Small |
| Replace hardcoded KT_SF with template.improvement_cost | `SteigerungTab.jsx:40-46` | Small |

### New features enabled (P2-P3)

- SA purchase interface for players between sessions
- Tradition-filtered spell browsing
- Equipment shop in TradeTab
- Culture name generator (Optolith has `commonNames` data)

---

## 5. Compatibility Assessment

### Fully Compatible (no changes)
- **Battle workflow** — combat resolution works with in-memory data, doesn't reference databank
- **Probes (skill checks)** — work against character data, not templates
- **Inventory system** — items stored as character instances, not template references
- **WebSocket protocol** — no changes needed
- **Backend API pagination** — already supports page/page_size/search/subcategory
- **Mobile player views** — render character-owned items (5-20), not full catalog

### Breaks Without Fix
- **page_size=200 truncation** — data silently lost in 4 frontend files (P0, one-line fixes)
- **Talent name mismatches** — culture skill bonus lookups fail silently (P0)

### Degraded Without Enhancement
- **Spell/liturgy AP costs** — wrong fallback "C" without `improvement_cost` column (P1)
- **SA selection UX** — unusable flat list of 1,447 entries without search (P1)

---

## 6. Converter Tool

**File:** `backend/importers/optolith_converter.py` (1,148 lines)

```bash
# Dry run — see what would be generated
cd backend && python -m importers.optolith_converter --dry-run

# Convert all categories to databank-seed/
cd backend && python -m importers.optolith_converter

# Convert specific categories
cd backend && python -m importers.optolith_converter --category spells liturgies weapons

# Output to different directory
cd backend && python -m importers.optolith_converter --output-dir /tmp/seed-test
```

The converter reads from `/tmp/optolith-data/app/Database/Data/` (both `de-DE` for German text and `univ` for structured numeric data). It does NOT modify the database — only generates JSON files.

---

## 7. Prioritized Action Plan

### Phase 1: Fix Bugs + Import Ready Data (1-2 hours)

1. Fix 3 talent name typos in DB
2. Fix advantage/disadvantage naming mismatches
3. Fix page_size=200 truncation in 4 files
4. Remove "Äxte" combat technique
5. Move "Kampfrausch" from advantages to special abilities
6. Run converter for: spells, liturgies, weapons, armor, shields, combat_techniques, talents — **NOTE: this REPLACES all 30 existing spells and 20 liturgies with correct Optolith values** (our originals have wrong casting times, costs, and durations)
7. Verify converted spell data against rulebook for the 5 confirmed-wrong spells (IGNIFAXIUS, ARMATRUTZ, BALSAM SALABUNDE, GARDIANUM, DUPLICATUS)
8. Run `python -m databank.seed` to load new data

### Phase 2: Schema + High-Impact Features (2-3 hours)

8. Add `improvement_cost` column to SpellTemplate + LiturgyTemplate
9. Run converter for: advantages, disadvantages, items, professions (with manual review)
10. Add SA search/filter to CharacterCreator Step 8
11. Replace hardcoded talent/KT lists with DB lookups

### Phase 3: Full Expansion (3-4 hours)

12. Run converter for: special_abilities (full 1,438)
13. Run `python -m databank.seed` for complete data refresh
14. Add "Learn New Spell" feature to SteigerungTab
15. Add SA purchase to SteigerungTab
16. Manual review pass: verify AP costs for advantages/disadvantages against rulebook

### Phase 4: Polish (optional)

17. Tradition-filtered spell browsing
18. Equipment shop in TradeTab
19. Culture name generator from Optolith commonNames
20. Add culture metadata (areaKnowledge, compatible professions)

---

## 8. Detailed Reports

- **Rules Audit:** `reports/optolith-audit-report.md`
- **Feature Analysis:** `reports/feature-unlock-report.md`
- **This Plan:** `reports/optolith-integration-plan.md`
