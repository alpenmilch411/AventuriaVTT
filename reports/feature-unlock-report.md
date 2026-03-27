# Feature Unlock Analysis: Expanded Optolith Data

**Analyst:** feature-analyst | **Date:** 2026-03-27

## Current Data Gaps vs Optolith

| Category | Current | Optolith | Gap |
|----------|---------|----------|-----|
| Cultures | 33 (all have `skill_bonuses`) | 33+ with full Kulturpakete | **Quantity OK, quality gap** |
| Professions | 46 (all have `skills`/`combat_techniques`) | 259 with full packages | **5.6x quantity** |
| Advantages | 43 | 135 | **3.1x** |
| Disadvantages | 44 | 83 | **1.9x** |
| Spells | 30 | 330 | **11x** |
| Liturgies | 20 | 227 | **11.4x** |
| Special Abilities | 64 | 1,447 | **22.6x** |
| Equipment (items+weapons+armor+shields) | 141 | 875 | **6.2x** |

**Note on seed data quality:** Our current seed data is Claude-generated approximations, NOT sourced from Optolith. Analysis of the JSON files shows:
- Cultures: all 33 have `skill_bonuses` populated (not empty as originally reported), but values may be approximations
- Professions: all 46 have `skills` and `combat_techniques` populated, 37 have `special_abilities`, 8 have `spells`
- Spells: all 30 have probe/asp_cost/casting_time/range/duration, but missing `improvement_cost` and `enhancements`
- SAs: all 64 have `ap_cost`, `prerequisites`, `rules_text`, but missing Optolith's richer structure

---

## 1. Unlocked for Free

These features **already work** in the code and will automatically improve once data is populated. No code changes needed.

### 1.1 Character Creator: Culture Step (Step 4)
- **File:** `frontend/src/views/auth/CharacterCreator.jsx:386-398`
- **Current state:** `StepCulture` renders each culture's `skill_bonuses` — but all 33 cultures have `skill_bonuses: null/{}`, making the step cosmetic (only name + AP cost shown).
- **What unlocks:** `baseSkills` (line 386-398) merges `culture.skill_bonuses` into the character's starting talents. When Kulturpakete are populated (e.g. Andergaster: Tierkunde +2, Wildnisleben +3), the talent step (Step 8) will show correct base values, and the AP budget (line 420-468) will be accurate.
- **Impact:** **Critical** — currently culture selection has no mechanical effect. With real Kulturpakete, culture becomes the primary way characters differentiate their starting skills.

### 1.2 Character Creator: Profession Step (Step 5)
- **File:** `frontend/src/views/auth/CharacterCreator.jsx:400-410, 532-543`
- **Current state:** `StepProfession` renders `profession.combat_techniques` and `profession.skills` — but existing professions have these as `null/{}`.
- **What unlocks:** `baseKT` (line 401-410) pulls from `profession.combat_techniques`, and `baseSkills` (line 386-398) merges `profession.skills`. Spells/liturgies auto-populate (line 532-543). Starting equipment is wired (line 602-604).
- **Impact:** **Critical** — professions currently don't affect combat techniques, talents, or starting gear. With 259 real professions, this is the backbone of character differentiation.

### 1.3 Character Creator: Spell/Liturgy Auto-Population
- **File:** `frontend/src/views/auth/CharacterCreator.jsx:532-543`
- **Current state:** When a profession with `spells` or `liturgies` is selected, `selectedSpells`/`selectedLiturgies` are auto-populated. This works but only 30 spells exist, limiting magical profession variety.
- **What unlocks:** With 330 spells and 227 liturgies, magical/blessed professions can offer their full spell/liturgy packages. Players will see their starting spells pre-selected.

### 1.4 Character Creator: Advantage/Disadvantage Selection (Step 6)
- **File:** `frontend/src/views/auth/CharacterCreator.jsx:661`
- **Current state:** `StepVorNachteile` fetches all advantages/disadvantages from `/api/databank/advantages` and `/api/databank/disadvantages`. The UI renders them with AP costs and supports selection. Works today with 43+44 entries.
- **What unlocks:** 135 advantages and 83 disadvantages. The AP budget (line 459-461, capped at 80 AP each) is correct. No changes needed — just more variety.

### 1.5 Player SpellBook: Spell/Liturgy Details
- **File:** `frontend/src/views/player/SpellBook.jsx:43-66`
- **Current state:** Loads ALL spells from `/api/databank/spells` and indexes by lowercase name. When a character has a spell, it looks up probe, asp_cost, range, duration, description from the template.
- **What unlocks:** With 330 spells, most character spells will find a matching template and show full details (probe, AsP, Zauberdauer, Reichweite, Wirkungsdauer) instead of "?" fallbacks.

### 1.6 GM Session Prep: Browsing Expanded Data
- **File:** `frontend/src/views/gm/SessionPrep.jsx:55-67`
- **Current state:** SessionPrep already lists all categories (creatures, weapons, armor, shields, items, spells, liturgies, SAs, talents, rules) with search, subcategory sidebar, and per-item detail display.
- **What unlocks:** GM gets access to 330 spells, 227 liturgies, 875 items, 1,447 SAs for session prep without any code changes.

### 1.7 GM Loot Panel: Item Selection
- **File:** `frontend/src/views/gm/LootPanel.jsx:148-161`
- **Current state:** Loads items, weapons, armor, shields from databank with `page_size=200`. Categorizes by type, supports search, category tabs, and drag-to-loot-pool.
- **What unlocks:** 875 items available for loot distribution. Categories like Trank, Heilkraut, Alchemie, Munition, Werkzeug, etc. will have meaningful populations.

### 1.8 Dashboard Databank Browser
- **File:** `frontend/src/views/auth/DatenbankTab.jsx` + `frontend/src/stores/datenbankStore.js`
- **Current state:** Already has full pagination (50/page), search, subcategory filtering, custom-only toggle. Uses `datenbankStore` with proper server-side pagination.
- **What unlocks:** Works out of the box with any data volume. The backend API (`backend/api/databank.py:148-212`) already supports pagination, search, and subcategory filters.

### 1.9 Steigerung (Level-Up): Spell & Liturgy Upgrades
- **File:** `frontend/src/views/player/SteigerungTab.jsx:200-210, 460-510`
- **Current state:** Loads spell and liturgy templates from databank. Matches character's known spells against templates to get the `steigerungsfaktor` for AP cost calculation.
- **What unlocks:** With 330 spells having proper Steigerungsfaktor values, players can level up spells with correct AP costs instead of fallback "C".

### 1.10 DataBrowser (GM Picker)
- **File:** `frontend/src/views/gm/DataBrowser.jsx`
- **Current state:** Generic modal picker with search, category sidebar, and detail popup. Used for spell/item/SA selection in various GM flows.
- **What unlocks:** Larger catalog browsable with existing search/category infrastructure.

---

## 2. Needs UI Changes

These features need frontend modifications to fully leverage the expanded data.

### 2.1 Character Creator: `page_size=200` Cap on Data Fetching
- **File:** `frontend/src/views/auth/CharacterCreator.jsx:118`
- **Problem:** `fetchDatabank()` uses `page_size=200` for ALL categories. With 1,447 SAs and 330 spells, this will silently truncate results, and the user will only see the first 200.
- **Categories affected:**
  - Special Abilities: 1,447 — **only first 200 shown** in wizard Step 8
  - Spells: 330 — **only first 200 shown**
  - Liturgies: 227 — **only first 200 shown**
  - Professions: 259 — **only first 200 shown** in Step 5
- **Fix required:** Add client-side pagination or auto-pagination (fetch all pages), or switch to search-based selection for large categories. The wizard currently renders all items in a flat grid, which won't work for 1,447 SAs anyway (see 2.2).
- **Priority:** **P0** — data will be silently lost

### 2.2 Character Creator: SA Selection Needs Search/Filter UI
- **File:** `frontend/src/views/auth/CharacterCreator.jsx:663` (StepTalentsKT)
- **Problem:** Step 8 currently shows professionSAs as a flat list and lets users purchase SAs from `specialAbilitiesAll`. With 1,447 SAs, the flat list is unusable — especially on mobile.
- **Fix required:** Add a `DataBrowser`-style modal with search and category filtering for SA selection. The `DataBrowser` component already exists and supports SAs (`DataBrowser.jsx:17`).
- **Priority:** **P1** — functional but unusable UX with 1,447 entries

### 2.3 SpellBook: `page_size=200` Truncation
- **File:** `frontend/src/views/player/SpellBook.jsx:47-48`
- **Problem:** Fetches ALL spells/liturgies with no page_size param (defaults to 50 on backend). Only first page of templates will be indexed, so spells beyond page 1 won't get probe/cost/description.
- **Fix required:** Either fetch with `page_size=500` or auto-paginate. Since it's a name-lookup map (not displayed), fetching all is fine.
- **Priority:** **P1** — player spells may show "?" for details

### 2.4 LootPanel: `page_size=200` for Items
- **File:** `frontend/src/views/gm/LootPanel.jsx:152`
- **Problem:** Loads items+weapons+armor+shields with `page_size=200` each. With 875 items total, items alone could exceed 200.
- **Fix required:** Increase to `page_size=500` or implement search-first approach instead of loading all items upfront.
- **Priority:** **P2** — GM may miss some items

### 2.5 SessionPrep: No Page Size Specified
- **File:** `frontend/src/views/gm/SessionPrep.jsx` (fetches via DataBrowser or direct)
- **Problem:** Session prep category browsing likely hits the same `page_size=200` limit.
- **Fix required:** Ensure all category browsers support server-side search instead of client-side filtering of truncated data.
- **Priority:** **P2**

### 2.6 SteigerungTab/SteigerungModal: Spell/Liturgy SF Fallback
- **Files:**
  - `frontend/src/views/player/SteigerungTab.jsx:468, 507`
  - `frontend/src/views/auth/SteigerungModal.jsx:419`
- **Problem:** Uses `ct.steigerungsfaktor || 'C'` as fallback. The `SpellTemplate` and `LiturgyTemplate` models don't have a `steigerungsfaktor` column — the improvement cost would need to come from an added DB column or be derived from Optolith data.
- **Fix required:** Either:
  - (a) Add `improvement_cost` column to `SpellTemplate`/`LiturgyTemplate` (preferred — matches `CombatTechniqueTemplate.improvement_cost`)
  - (b) Hardcode SF in the seed data's JSON (e.g. in description or a new field)
- **Priority:** **P1** — incorrect AP costs for spell/liturgy upgrades

### 2.7 Character Creator: Hardcoded Talent/KT Lists
- **File:** `frontend/src/views/auth/CharacterCreator.jsx:62-93`
- **Problem:** `TALENT_CATEGORIES` and `KT_DATA` are hardcoded arrays with specific talent/KT names and SF values. When professions grant talents not in these lists (e.g. profession-specific talents), they won't appear in the wizard's talent step.
- **Current coverage:** 8+6+5+6+11 = 36 hardcoded talents. DSA5 has ~59 core talents — the missing ones (Fliegen, Gaukeleien, Geographie, Kriegskunst, etc.) won't be upgradable in the wizard.
- **Fix required:** Fetch talent list from `/api/databank/talents` and use `improvement_cost` from template, falling back to category-based SF. The talent templates already have `category` and could have `improvement_cost` added.
- **Priority:** **P2** — some talents invisible in creator, but SteigerungTab already uses DB templates

### 2.8 SteigerungTab: KT SF Hardcoded
- **File:** `frontend/src/views/player/SteigerungTab.jsx:40-46`
- **Problem:** `KT_SF` is a hardcoded map of KT name → Steigerungsfaktor. Should use `improvement_cost` from `CombatTechniqueTemplate` model (which already has this column).
- **Fix required:** Use `ct.improvement_cost` instead of looking up `KT_SF[ct.name]`. The template data already flows through, just needs the right field name.
- **Priority:** **P2** — minor, correct for core KTs but won't handle custom ones

---

## 3. Needs Backend Changes

### 3.1 Add `improvement_cost` to SpellTemplate and LiturgyTemplate
- **File:** `backend/models/databank.py:312-339, 346-373`
- **Problem:** `SpellTemplate` and `LiturgyTemplate` lack an `improvement_cost` (Steigerungsfaktor) column. `CombatTechniqueTemplate` already has it (line 449-451). Without it, spell/liturgy upgrade costs use wrong fallback "C".
- **Change:** Add to both models:
  ```python
  improvement_cost: Mapped[Optional[str]] = mapped_column(
      String(4), nullable=True, comment="Steigerungsfaktor: A, B, C, or D"
  )
  ```
- **Migration:** Add column to existing tables. Seed data should populate from Optolith.
- **Priority:** **P1**

### 3.2 Add `improvement_cost` to TalentTemplate
- **File:** `backend/models/databank.py:412-431`
- **Problem:** `TalentTemplate` has no `improvement_cost` column. The creator and SteigerungTab derive SF from talent category (B for Körper/Gesellschaft/Handwerk, C for Natur/Wissen). This is correct for most talents but should be explicit in the DB.
- **Change:** Add column (same as above). Optional — falls back to category-based derivation.
- **Priority:** **P3** (nice to have)

### 3.3 Add `improvement_cost` to AdvantageTemplate and DisadvantageTemplate
- **File:** `backend/models/databank.py:464-520`
- **Problem:** `AdvantageTemplate` has `levels` (max tiers) but no per-level AP cost. The current `ap_cost` is flat. Some advantages like Zauberer/Geweihter have complex, tiered costs.
- **Current state:** Works well enough. The wizard uses `ap_cost` from DB. Tiered advantages (levels > 1) multiply `ap_cost * level` on the frontend.
- **Priority:** **P3** (fine for now)

### 3.4 Backend API: Pagination Already Sufficient
- **File:** `backend/api/databank.py:148-212`
- **Assessment:** The backend already supports:
  - `page` + `page_size` (max 200 per page)
  - `search` (ILIKE on name, description, category)
  - `subcategory` filtering
  - `custom_only` flag
  - Separate `/search` endpoint
  - `/subcategories` endpoint with counts
- **No backend changes needed** for pagination. The 200 max `page_size` is reasonable — the frontend needs to either paginate or use search.

### 3.5 No WS Handler Changes Needed
- **File:** `backend/ws/handlers.py`
- **Assessment:** Combat resolution in the WS handlers does NOT reference the databank at all — it works with in-memory combatant data passed from the frontend. Spell casting requests (`spell_cast_request`) pass spell details inline. Expanding databank data doesn't require WS changes.

---

## 4. Needs New Features

### 4.1 Spell/Liturgy Browser for Players (New Spells Between Sessions)
- **Current state:** Players can only see spells they already know (in SpellBook). There's no way to browse the full spell catalog to learn new spells.
- **What's needed:** A DataBrowser-style interface in the Player Dashboard or SteigerungTab that lets players:
  1. Browse spells/liturgies filtered by their tradition
  2. See full details (probe, cost, description)
  3. "Learn" a new spell by spending AP (activating from FW -4 or FW 0)
- **Where:** Add to `SteigerungTab.jsx` as a new "Neuen Zauber lernen" section, or as a button that opens `DataBrowser` with type="spells".
- **Backend:** The `/api/characters/{id}/level-up` endpoint already supports `type: "spell"` and `type: "liturgy"` — but currently only upgrades existing spells. Need to also support learning new ones (setting FW from 0 to activation cost).
- **Priority:** **P1** — major unlock from 330 spells. Without this, players can only improve what they started with.

### 4.2 SA Purchase Interface for Players
- **Current state:** Players can buy SAs during character creation (Step 8) but not between sessions.
- **What's needed:** Add SA browsing + purchase to SteigerungTab, filtered by prerequisites the character meets.
- **Backend:** Already supported — `level-up` endpoint handles `type: "special_ability"` with `ap_cost`.
- **Priority:** **P2** — valuable with 1,447 SAs, but many SAs are combat-specific and rarely purchased mid-campaign.

### 4.3 Tradition-Filtered Spell Selection
- **Current state:** SpellBook shows all known spells. DataBrowser shows all spells regardless of tradition.
- **What's needed:** When browsing spells (for learning or reference), filter by character's tradition. The `SpellTemplate.tradition` column is a JSON array of tradition names. Character's tradition should be derivable from their advantages (e.g. "Zauberer (Gildenmagier)").
- **Priority:** **P2** — nice UX improvement, prevents confusion from seeing spells from wrong traditions.

### 4.4 Equipment Shop / Trade Enhancement
- **File:** `frontend/src/views/player/TradeTab.jsx`
- **Current state:** TradeTab handles player-to-player trading. With 875 items, a "shop" feature where GMs pre-populate a store from the databank would be valuable.
- **Priority:** **P3** — nice to have, GMs can use LootPanel as workaround.

---

## 5. Performance Concerns

### 5.1 CRITICAL: `page_size=200` Truncation (Not a Performance Issue — a Correctness Issue)
- **Affected files:**
  - `CharacterCreator.jsx:118` — fetches species, cultures, professions, advantages, disadvantages, SAs all at `page_size=200`
  - `DataBrowser.jsx:39` — fetches with `page_size=200`
  - `LootPanel.jsx:152` — fetches items/weapons/armor/shields at `page_size=200`
  - `SpellBook.jsx:47-48` — no page_size specified (defaults to 50!)
- **Problem:** With 1,447 SAs, 330 spells, 259 professions, and 875 items, data is **silently truncated**. Users see no indication that they're missing entries.
- **Fix:** Either auto-paginate (fetch all pages in a loop) or switch affected components to server-side search.

### 5.2 LOW: In-Memory Filtering in DataBrowser/LootPanel
- **File:** `frontend/src/views/gm/DataBrowser.jsx:72-76`, `LootPanel.jsx:175-181`
- **Problem:** These components fetch all items into memory and filter client-side. With 875 items this is fine (< 100KB JSON). Even 1,447 SAs is manageable (~200KB).
- **Assessment:** Not a real concern for current data volumes. Would only matter at 10,000+ entries.

### 5.3 LOW: SpellBook Template Indexing
- **File:** `frontend/src/views/player/SpellBook.jsx:53-65`
- **Problem:** Builds name→template maps for all spells and liturgies on mount. With 330 spells + 227 liturgies, this is ~557 map entries — trivial.
- **Assessment:** No performance concern.

### 5.4 LOW: Mobile Phone Rendering (Player Dashboard)
- **Problem:** Player Dashboard is phone-first. The SpellBook, SteigerungTab, and TalentList render character-owned items (typically 5-20 spells, 30-40 talents). These counts don't grow with expanded databank.
- **Assessment:** No concern — mobile performance depends on character complexity, not databank size.

### 5.5 MEDIUM: DatenbankTab Global Search
- **File:** `frontend/src/views/auth/DatenbankTab.jsx:194-229`
- **Problem:** Global search fires parallel requests across ALL entity types (`page_size=20` each). With more data, these requests return faster (indexed by name), but there are ~10 parallel requests.
- **Assessment:** Already well-designed (uses request ID to discard stale results, limits to 20 per category). No changes needed.

---

## 6. Priority Ranking

### Tier 0: Do First (Data Correctness)
1. **Fix `page_size=200` truncation** in `CharacterCreator.jsx:118` — add auto-pagination or increase limits. This is the only thing preventing expanded data from working correctly. Affects professions (259), spells (330), liturgies (227), SAs (1,447).
2. **Fix `SpellBook.jsx` default page size** — currently defaults to 50 (no param). Add `?page_size=500` or auto-paginate the lookup map.

### Tier 1: High Impact (Functionality Unlocks)
3. **Add `improvement_cost` column** to `SpellTemplate` and `LiturgyTemplate` (`backend/models/databank.py`) — enables correct AP costs for spell/liturgy upgrades.
4. **Add SA search/filter UI** to CharacterCreator Step 8 — use existing `DataBrowser` component for 1,447 SAs.
5. **Add "Learn New Spell" feature** to SteigerungTab — opens DataBrowser filtered by tradition, lets player activate a new spell.

### Tier 2: Quality of Life
6. **Use DB talent templates** instead of hardcoded `TALENT_CATEGORIES` in CharacterCreator — ensures all talents appear in wizard.
7. **Use `improvement_cost` from CT templates** instead of hardcoded `KT_SF` in SteigerungTab.
8. **Fix LootPanel `page_size=200`** truncation for items.
9. **Add tradition filtering** to spell/liturgy browsing.

### Tier 3: Nice to Have
10. Add `improvement_cost` to `TalentTemplate` model.
11. Equipment shop feature in TradeTab.
12. SA purchase interface for player between sessions.

---

## 7. Data Richness: What Optolith Provides Beyond Our Current Schema

Our seed data was generated by Claude and contains reasonable approximations. Optolith data is community-sourced from the official DSA5 rulebooks and is **authoritative**. Beyond just more entries, Optolith provides richer, more structured, and more accurate data for fields we already have — plus entirely new fields we're not capturing.

### 7.1 Spells & Liturgies: Missing Fields

**Fields we have that Optolith improves:**
| Our Field | Our Quality | Optolith Quality |
|-----------|------------|-----------------|
| `probe` | Correct for most (3 attributes) | Verified against rulebook |
| `asp_cost`/`kap_cost` | String like "8 AsP" | Structured: base cost + sustain cost + modifiable flag |
| `casting_time` | String like "1 Aktion" | Structured: numeric value + unit + modifiable flag |
| `range` | String like "16 Schritt" | Structured: numeric + unit + modifiable flag |
| `duration` | String like "aufrechterhaltend" | Structured: type (instant/sustained/fixed) + value |
| `description` | Brief Claude-generated summary | Full rulebook text (may be paraphrased for copyright) |
| `effect_per_qs` | Manual QS→effect mapping | Same, but verified |
| `tradition` | Array of tradition names | Array of Optolith tradition IDs (more precise) |

**Fields Optolith has that we're NOT storing:**
| Optolith Field | Description | Impact |
|---------------|-------------|--------|
| **`improvement_cost`** (Steigerungsfaktor) | A/B/C/D for spell level-up costs | **Critical** — SteigerungTab uses fallback "C" for all spells |
| **`property`** (Merkmal) | Spell property (Antimagie, Hellsicht, Telekinese, etc.) | Useful for GM rules reference and tradition filtering |
| **`enhancements`** (Zaubererweiterungen) | 1-3 upgradeable modifications per spell (e.g. increased range, reduced cost) | **High value** — entirely new gameplay dimension, not supported in our schema |
| **`castingTimeNoMod`** | Whether casting time can be modified by QS/advantages | Rules accuracy for combat casting |
| **`costNoMod`** | Whether cost can be modified | Same |
| **`src`** (source references) | Book + page number (e.g. "GRW p.286") | Useful for GM quick-reference |
| **`prerequisites`** | Required advantages/SAs to learn the spell | Needed for "Learn New Spell" feature |
| **`gr`** (spell group) | Thematic category (e.g. Heilung, Illusion, Telekinese) | Better organization in DataBrowser |

**Schema change needed:**
```python
# Add to SpellTemplate / LiturgyTemplate
improvement_cost: Mapped[Optional[str]] = mapped_column(String(4))  # A/B/C/D
property: Mapped[Optional[str]] = mapped_column(String(64))  # Merkmal
spell_group: Mapped[Optional[str]] = mapped_column(String(64))  # thematic category
enhancements: Mapped[Optional[list]] = mapped_column(JSON)  # Zaubererweiterungen
prerequisites: Mapped[Optional[list]] = mapped_column(JSON)  # learning prerequisites
source_book: Mapped[Optional[str]] = mapped_column(String(64))
```

### 7.2 Special Abilities: Missing Structure

**Our current SA data** has: `name`, `category`, `prerequisites` (text list), `ap_cost`, `at_mod`, `pa_mod`, `damage_modifier`, `combinable_with`, `exclusive_with`, `applicable_techniques`, `description`, `rules_text`.

**Optolith provides additionally:**
| Optolith Field | Description | Impact |
|---------------|-------------|--------|
| **`tiers`/`levels`** | Multi-level SAs (e.g. Wuchtschlag I/II/III) with per-level AP costs | We handle this by having separate entries (wuchtschlag_1, wuchtschlag_2, etc.) — functional but verbose |
| **`selectOptions`** | Parameterized SAs (e.g. "Kampfreflexe" applies to one combat technique) | **Medium** — we can't model SAs that require a choice |
| **`extended`** | SA chains and upgrade paths | Better UX for SA purchase in character creator |
| **`effect`** | Structured game effect (AT mod, PA mod, damage, initiative) | We have `at_mod`/`pa_mod`/`damage_modifier` but not all effect types |
| **`combatTechniqueGroupRestriction`** | Melee-only vs ranged-only vs specific techniques | More precise than our `applicable_techniques` list |
| **`src`** | Source book + page | Reference for GMs |

**Assessment:** Our SA schema is adequate for combat SAs (the most impactful category). The biggest gap is `selectOptions` — SAs like "Kampfreflexe" or "Waffenspezialisierung" require the player to choose a specific combat technique to apply them to. Our current schema has no way to model this parameterization.

**Schema change recommended:**
```python
# Add to SpecialAbilityTemplate
select_options: Mapped[Optional[dict]] = mapped_column(JSON)  # {type: "combat_technique"|"talent"|"spell", options: [...]}
source_book: Mapped[Optional[str]] = mapped_column(String(64))
```

### 7.3 Advantages & Disadvantages: Per-Level AP Costs

**Our current data:** Single `ap_cost` field with `levels` count. We handle tiered advantages (Adlig I/II/III) as separate entries with escalating AP costs.

**Optolith provides:**
| Optolith Field | Description | Impact |
|---------------|-------------|--------|
| **Per-level cost array** | Different AP cost per tier (e.g. Adlig: 5/10/15) | We already model this with separate entries — correct approach |
| **`selectOptions`** | Parameterized advantages (e.g. "Begabung" for a specific talent) | Same gap as SAs — can't model parameterized choices |
| **`range`** | What the advantage applies to | Precision for prerequisites |
| **`src`** | Source book references | GM reference |
| **`erpirations`** | Errata corrections | **High value** — our Claude-generated AP costs may be wrong |

**Assessment:** Our advantage/disadvantage schema is functional. The main risk is **accuracy** — Claude-generated AP costs and rules_text may diverge from official errata. Optolith tracks errata corrections, so importing their values would correct any mistakes.

### 7.4 Cultures: Missing Optolith Fields

**Our current data:** `skill_bonuses`, `languages`, `scripts`, `compatible_species`, `ap_cost`, `description`.

**Optolith provides additionally:**
| Optolith Field | Description | Impact |
|---------------|-------------|--------|
| **`socialStatus`** | Available social statuses for this culture | Nice for roleplay flavor |
| **`commonProfessions`** | List of typical/atypical professions | Could auto-filter profession step in wizard |
| **`commonAdvantages`/`commonDisadvantages`** | Culturally typical traits | Could highlight in character creator |
| **`commonNames`** | Name suggestions by gender | **Nice UX** — name generator in Step 2 of wizard |
| **`areaKnowledge`** | Default area knowledge | Flavor text for character background |

**Assessment:** Low priority for gameplay, but `commonProfessions` would improve the character creator UX by highlighting "recommended" professions for each culture.

### 7.5 Professions: Missing Optolith Fields

**Our current data:** `skills`, `combat_techniques`, `special_abilities`, `spells`, `liturgies`, `starting_equipment`, `starting_money`, `ap_cost`.

**Optolith provides additionally:**
| Optolith Field | Description | Impact |
|---------------|-------------|--------|
| **`suggestedAdvantages`/`suggestedDisadvantages`** | Recommended traits | UX improvement in character creator |
| **`unsuitableAdvantages`/`unsuitableDisadvantages`** | Traits that shouldn't be combined | Validation in character creator |
| **`variants`** | Profession sub-variants (e.g. different specializations of Krieger) | **High value** — some professions have 3-5 variants with different packages |
| **`prerequisite`** | Required advantages/cultures/sex for the profession | Validation |
| **`src`** | Source book | Reference |

**Assessment:** The biggest gap is **profession variants**. In DSA5, many professions (especially magical/blessed ones) have sub-variants with different spell/liturgy packages. Our single-entry approach loses this granularity. However, modeling variants can be done by creating separate entries per variant (e.g. "Magier (Gildenmagier)", "Magier (Elf)").

### 7.6 Weapons & Equipment: Accuracy Concerns

**Our current weapon data** matches the DSA5 schema well: damage, AT/PA mods, reach, weight, price, properties, two-handed flag, ranged, range brackets.

**Optolith provides additionally:**
| Optolith Field | Description | Impact |
|---------------|-------------|--------|
| **`structurePoints`** (Strukturpunkte) | How much damage the weapon can take | Niche (weapon breakage rules) |
| **`damageThreshold`** (Bruchfaktor) | Related to above | Same |
| **`primaryAttribute`** (Leiteigenschaft) | Which attribute bonus applies to damage | **Medium** — we derive this from combat technique, but explicit is better |
| **`improvised`** flag | Whether it's an improvised weapon | Edge case |
| **`src`** | Source book | Reference |

**Assessment:** Our weapon schema is solid for gameplay. The main value of Optolith weapons is **accuracy of numeric values** (damage dice, AT/PA mods, prices) — our Claude-generated values might have errors that Optolith's community-verified data would correct.

### 7.7 Creatures: Good but Static

**Our current creature data** has: attributes, combat_values, attacks, special_rules, immunities, vulnerabilities, behavior, tactics, flee_threshold, habitat, loot_table, challenge_rating.

**Optolith assessment:** Optolith doesn't cover creatures extensively — creature data comes from the Aventurisches Bestiarium and other supplements. Our creature schema is actually **richer** than what Optolith provides for creatures, since Optolith focuses on character creation data.

### 7.8 Talents: Missing Improvement Cost

**Our current data:** `name`, `category`, `probe`, `applications`, `encumbrance`, `description`. All 59 core talents present.

**Optolith provides additionally:**
| Optolith Field | Description | Impact |
|---------------|-------------|--------|
| **`ic`** (improvement cost) | Steigerungsfaktor A/B/C/D | **Medium** — we derive from category (Körper→B, Natur→C, etc.), which is correct for core talents |
| **`uses`** (Anwendungsgebiete) | More structured than our `applications` | Minor improvement |
| **`src`** | Source book | Reference |
| **`check`** (Probe) | Same as our `probe` | Verification of accuracy |

**Assessment:** Our talent data is complete for core talents. Adding `improvement_cost` is low priority since the category-based derivation is correct for all 59 core talents.

### 7.9 Overall Data Accuracy Assessment

**Risk of Claude-generated data inaccuracy:**

| Category | Accuracy Risk | Why |
|----------|--------------|-----|
| Spell probes (3 attributes) | **High risk** | Easy to get wrong — each spell has a unique combination. IGNIFAXIUS is MU/KL/CH in our data but may be wrong |
| Spell AsP costs | **Medium risk** | Most are standard (4/8/16 AsP) but some have complex costs |
| Advantage/Disadvantage AP costs | **Medium risk** | Errata have changed several AP costs since first printing |
| Weapon damage/mods | **Medium risk** | Most standard weapons are well-known, but exotic weapons may be wrong |
| Culture skill_bonuses | **High risk** | Kulturpakete are complex — each has ~8-12 skill bonuses. Easy to approximate incorrectly |
| Profession skill/CT values | **High risk** | Profession packages have very specific values (e.g. "Schwerter 10, Stangenwaffen 8"). Getting one wrong cascades into wrong AP calculations |
| SA prerequisites | **Low risk** | Simple chain prerequisites (KT 10, KT 12, etc.) are well-documented |
| Talent probes | **Medium risk** | Some probes are non-obvious (e.g. Tierkunde is MU/MU/CH, not IN/KL/CH as one might guess) |

**Recommendation:** Even for entities we already have, **replacing our Claude-generated data with Optolith-sourced data is strongly recommended** for any field that affects AP calculations or game mechanics. Optolith's community has cross-verified this data against the official rulebooks and tracked errata.

### 7.10 Data Richness Priority

1. **Replace existing data with Optolith values** for: spell probes, AP costs, culture Kulturpakete, profession packages — even where we have data, Optolith's is more reliable
2. **Add `improvement_cost`** to Spell, Liturgy, and Talent templates — directly affects AP spending calculations
3. **Add `enhancements`** to Spell/Liturgy templates — unlocks Zaubererweiterungen, a significant gameplay feature
4. **Add `selectOptions`** to SA, Advantage, Disadvantage templates — enables parameterized choices
5. **Add `source_book`** to all templates — low effort, high GM reference value
6. **Add `commonProfessions`/`commonNames`** to Culture templates — nice UX touches

---

## Summary: What the GM/Player Actually Gains

### Immediate (Data Population Only)
- **Character Creator:** Culture step becomes mechanically meaningful (Kulturpakete with real talent bonuses). Profession step provides combat techniques, talents, spells, liturgies, starting equipment, and SAs. 259 professions instead of 46.
- **Players:** SpellBook shows full details (probe, AsP, range, duration) for most spells. 135 advantages and 83 disadvantages to choose from.
- **GM:** Session prep has 330 spells, 227 liturgies, 875 items, 1,447 SAs to browse. Loot panel has 5x more items to distribute.

### With Code Changes (Tier 0-1)
- **Character Creator:** All data visible (no truncation), SAs browsable with search, AP costs correct.
- **Players:** Can learn new spells between sessions from a catalog of 330. Spell upgrade costs use correct Steigerungsfaktor.
- **GM:** Full access to all items in loot panel, all spells for NPC reference.

### Key Metric
The single highest-impact change is **fixing `page_size=200` truncation** — it's a one-line change in 4 files that unlocks 100% of the expanded data across all views.
