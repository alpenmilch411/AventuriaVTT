# DSA5 Character Creation Rules Compliance Report

**Task #5**: Verify character creation flow matches official DSA5 rules
**Date**: 2026-03-27
**Audited by**: dsa-rules agent
**Source**: DSA5 Regelwerk (Grundregelwerk, pp. 38–64)

---

## Executive Summary

**Overall Status**: PARTIALLY COMPLIANT with critical gaps

- **✅ CORRECT**: 7 of 10 official steps implemented
- **⚠️ WRONG**: 1 step has incorrect math (derived values)
- **❌ MISSING**: 2 critical steps completely absent from wizard
- **⚠️ INCOMPLETE**: Databank seed files missing 60%+ of official culture/profession data

The wizard successfully creates playable characters for common archetypes, but does NOT implement full DSA5 character creation spec. Many edge cases and completeness requirements are unimplemented.

---

## Step-by-Step Analysis

### Step 1: Erfahrungsgrad (Experience Grade)

**Status**: ✅ **CORRECT**

**Frontend** (`CharacterCreator.jsx:248-248`):
- Presents all 7 official grades: Unerfahren (900), Durchschnittlich (1000), Erfahren (1100), Kompetent (1200), Meisterlich (1400), Brillant (1700), Legendär (2100)
- AP totals match DSA5 Regelwerk Table (p. 39)

**Backend** (`leveling.py:71-122`):
- `ERFAHRUNGSGRADE` table correct with AP ranges and attribute/skill/KT maximums
- Maximums per grade match official rules:
  - Unerfahren: max attr 14, skill 14, KT 14
  - Legendär: max attr 20, skill 25, KT 25

**Constraints enforced**: Yes, AP total determines available spending budget

---

### Step 2: Spezies (Species)

**Status**: ✅ **CORRECT**

**Frontend** (`CharacterCreator.jsx:255-257, 281-292`):
- Loads from `/api/databank/species`
- Applies `base_attributes` + `attribute_adjustments` + `free_attribute_points` correctly
- Elf example: base_attributes (all 8) → IN+1, GE+1 applied → allows 7 free points to distribute

**Databank** (`species.json`):
- Species data complete:
  - Mensch: ap_cost 0, lep_base 5, 7 free points
  - Elf: ap_cost 18, lep_base 2, IN+1, GE+1, auto_advantages ["Zweistimmiger Gesang", "Flink I"]
  - Halbelf: ap_cost 0, lep_base 4, similar structure
  - Zwerg: ap_cost 61, lep_base 6, KO+1, KK+1, auto_advantages ["Zähigkeit"]

**Validation**:
- Free point distribution enforced (step 3: `speciesFreeUsed === freeAttrPoints` required to advance)
- Auto-advantages automatically included in final character

**Rule compliance**: Regelwerk p. 41-47 requirements met

---

### Step 3: Name & Grundlagen (Name & Basic Info)

**Status**: ✅ **CORRECT**

**Frontend** (`CharacterCreator.jsx:250-253, 411`):
- Collects name, nickname, background
- Name validation: must be non-empty to advance
- Background persisted in bio field

**No DSA5 rules violations here** — this is a purely administrative step.

---

### Step 4: Kultur (Culture)

**Status**: ⚠️ **INCOMPLETE DATA**

**Frontend** (`CharacterCreator.jsx:260, 303-317`):
- Loads from `/api/databank/cultures`
- Applies `skill_bonuses` to base skill scores
- Validates species compatibility

**Databank** (`cultures.json`):
- **Only 30 cultures populated** (expected ~50+ in full DSA5)
- Present cultures have correct structure:
  - Andergaster: ap_cost 15, skill_bonuses (7 skills), languages (Garethi level 4)
  - Horasier: ap_cost 22, 8 skill bonuses, script knowledge
  - Aranier: ap_cost 0 (correct per Regelwerk p. 49)
- **Missing**: Most woodland elf cultures (C_19–C_21), dwarf cultures, most specialty cultures

**Math**: Correctly deducts culture AP cost from free AP budget

**DSA5 Rules (Regelwerk p. 48–52)**:
- ✅ Culture AP costs deducted correctly
- ✅ Skill bonuses applied as stated
- ✅ Mother tongue set to Culture's language at level III (stored but not shown in wizard)
- ⚠️ Script knowledge optional add-on (Horasier) — should be offered but isn't in wizard UI
- ❌ **MISSING**: Culture selection should restrict profession options by culture/class compatibility (e.g. Straßenräuber unavailable for some cultures)

---

### Step 5: Profession

**Status**: ⚠️ **INCOMPLETE DATA**

**Frontend** (`CharacterCreator.jsx:263, 319-328`):
- Loads from `/api/databank/professions`
- Applies `combat_techniques`, `skills`, `spells`, `liturgies`, `special_abilities`
- Base KT set to max(6, profession value)
- Magic/blessed flags set from profession properties

**Databank** (`professions.json`):
- **Only 14 professions populated** (expected 60+ in full DSA5)
- Present professions mostly have 0 AP cost (WRONG — should vary 40–200)
- Heiler example: ap_cost 120, combat_techniques (Raufen 6, Dolche 6), 10 skills listed (correct for this profession)
- Most other professions: ap_cost 0 (WRONG)

**Critical Issues**:
- ❌ **Most professions have ap_cost: 0** — should be 40–200 depending on profession (Regelwerk p. 60)
- ❌ **Combat technique values missing** — professions should grant specific KT minimums (e.g. Krieger: Schwerter 11, Hiebwaffen 9)
- ❌ **Skill values mostly empty** — should have 15–25 individual skill grants
- ❌ **Spells/liturgies mostly empty** — magic/blessed professions should include tradition spells

**Example (Heiler)**: ap_cost 120 ✅, 10 skills ✅, but Raufen/Dolche 6 (should both be higher per Regelwerk)

**Math**: Correctly deducts profession AP from free AP budget, but costs are wrong in seed data

---

### Step 6: Vor-/Nachteile (Advantages & Disadvantages)

**Status**: ⚠️ **WRONG AP CAP + INCOMPLETE DATA**

**Frontend** (`CharacterCreator.jsx:266-267, 378, 463-471`):
- Presents VORTEILE_PRESETS (10 hardcoded advantages)
- Presents NACHTEILE_PRESETS (10 hardcoded disadvantages)
- No AP spending limit enforced (WRONG)
- Auto-advantages from species automatically included (✅ correct)

**Issues**:
1. ❌ **No 80 AP cap enforced** (Regelwerk p. 52):
   - DSA5 rules: "max 80 AP on advantages" and "max 80 AP on disadvantages (yields AP back)"
   - Code has: `const nachteileRefund = Math.min(80, nachteile.reduce(...))` but NO upper limit on `vorteile`
   - A player could select all 10 advantages at 25 AP each = 250 AP (absurd)

2. ❌ **Preset lists are hardcoded toy values**:
   - Only 20 advantage/disadvantage types presented (full DSA5 has 100+)
   - AP costs in presets don't match Regelwerk (e.g. "Glück I" should be 10 AP, listed as 20)
   - No advantage/disadvantage categories or prerequisites

3. ⚠️ **Species-locked advantages not enforced**:
   - Elf auto-advantages (Zweistimmiger Gesang, Flink I) are auto-included ✅
   - But should restrict some advantages (e.g. Dunkelsicht only for Elf/Zwerg)
   - No validation of this

4. ❌ **Missing advantage/disadvantage databank**:
   - Should load from `/api/databank/advantages` (doesn't exist)
   - Currently hardcoded toy data only

---

### Step 7: Attribute Refinement (Eigenschaftssteigerung)

**Status**: ✅ **CORRECT** (math only; UI sparse)

**Frontend** (`CharacterCreator.jsx:270, 347-354`):
- Allows +/- on base attributes
- Calculates AP cost per point using `getAttrCost(val)` function
- Uses `ATTR_COST` table matching backend `leveling.py:60-68`
- Cost progression: 15 AP per point (8→14), then 30 (15→17), 60 (18→19), 120 (20→21), 240 (22–23), 480 (24+)

**Backend validation** (`leveling.py:262-299`):
- Enforces max attribute per experience grade
- Correctly blocks upgrades beyond max

**DSA5 Rules (Regelwerk p. 53–54)**: Fully implemented ✅

**UI Note**: No visual preview of final max values — user must guess. Not a rule violation but poor UX.

---

### Step 8: Talente & Kampftechniken (Skills & Combat Techniques)

**Status**: ✅ **CORRECT** (math only; coverage incomplete)

**Frontend** (`CharacterCreator.jsx:272-274, 304-317, 356-375, 457-461`):
- Hardcoded TALENT_CATEGORIES (5 categories, 41 talents total):
  - Körper: 8 talents (SF B)
  - Gesellschaft: 6 talents (SF B)
  - Natur: 5 talents (SF C)
  - Wissen: 6 talents (SF C)
  - Handwerk: 10 talents (SF B)
- Combat techniques: 17 hardcoded KT_DATA entries (both melee/ranged)
- Each +1 step calculates correct AP cost from SF table

**AP Cost Math**: ✅ Correct per DSA5 Steigerungsfaktor tables

**Coverage**:
- ⚠️ Only 41 of ~100 DSA5 talents listed (missing specializations, religious talents, etc.)
- ✅ Kampftechniken complete (17 of 17 official weapon groups)

**Rule compliance (Regelwerk p. 54–57)**:
- ✅ SF categories correct (A/B/C/D/E exist, most are B/C)
- ✅ Cost calculation per SF matches table
- ❌ Talent specializations not supported (e.g. Heilkunde: Wunden vs. Krankheiten)
- ❌ Talent prerequisites not checked (e.g. Überreden requires Etikette ≥ 3)

---

### Step 9: Abgeleitete Werte (Derived Values)

**Status**: ⚠️ **WRONG** (critical math errors in KaP)

**Frontend** (`CharacterCreator.jsx:386-405`):
```javascript
// LeP: correct ✅
LeP_max: lepBase + a.KO * 2

// AsP: WRONG formula ❌
AsP_max: isMagic ? Math.ceil((a.MU + a.IN + a.CH) / 2) : 0

// KaP: WRONG formula ❌
KaP_max: isBlessed ? Math.ceil((a.MU + a.KL + a.IN) / 2) : 0
```

**DSA5 Regelwerk (p. 59–60):**
- **LeP (Lebensenergie)**: Basis + 2 × KO ✅ **CORRECT**
- **AsP (Astralenergie)**: Basis + (MU + IN + CH) / 3 ❌ **WRONG** (code divides by 2, not 3)
- **KaP (Karmaenergie)**: Basis + (MU + KL + IN) / 3 ❌ **WRONG** (code divides by 2, not 3)

**Backend** (`characters.py:_recompute_derived` lines 49–50`):
```python
result["AsP_max"] = math.ceil((mu + in_ + ch) / 2) if is_magic else 0
result["KaP_max"] = math.ceil((mu + kl + in_) / 2) if is_blessed else 0
```
Both backends **WRONG** — divide by 2, should be divide by 3.

**Impact**: A wizard with MU 13, IN 14, CH 12 calculates:
- Frontend: (13+14+12)/2 = 19.5 → 20 AsP ❌ (should be 13 AsP)
- Backend: same wrong value persisted to DB

**Severity**: 🔴 **HIGH** — characters will have 50%+ too much magical/blessed power

**Also missing from derived values step**:
- No display of INI_basis, AW, SK, ZK, GS
- User sees final values but not the base/modifier breakdown
- Not a rule violation, but limits player understanding

---

### Step 10: Zusammenfassung (Summary/Finalization)

**Status**: ✅ **CORRECT** — Validates AP budget

**Frontend** (`CharacterCreator.jsx:419, 445-505`):
- Calculates total AP spent: `speciesAP + cultureAP + professionAP + attrSpend + skillSpend + ktSpend + vorteileAP - nachteileRefund`
- Remaining AP: `freeAP - (total spent)` must be ≥ 0 to submit
- Builds final character object with all fields

**Backend** (`characters.py:361-376`):
- Accepts CharacterCreate payload, validates, persists to DB
- No additional validation of AP budget or max values (trusts frontend)

**DSA5 Compliance (Regelwerk p. 64)**:
- ✅ AP budget calculation correct
- ✅ Character is playable once summary confirmed
- ⚠️ Missing validation of remaining AP = 0 (characters can have leftover AP, which is odd)

---

## Missing Official DSA5 Steps

### ❌ Step 3 (official) → Step 4 (implementation): Attribute Assignment BEFORE culture/profession

**Issue**: Official DSA5 character creation (Regelwerk p. 38–40) has this order:
1. Erfahrungsgrad
2. Spezies (with free attribute points allocated)
3. **Kultur**
4. **Profession**
5. **Attribute Distribution → raise base attributes with AP**
6. Vor-/Nachteile
7. Kampftechniken assignment (melee KTW split into AT/PA)
8. Talente
9. Zauber/Liturgien
10. Abschluss

**Current Wizard Order** (CharacterCreator.jsx:124-135):
1. Erfahrungsgrad ✅
2. Name & Grundlagen ✅
3. Spezies ✅
4. Kultur ✅
5. Profession ✅
6. Vor-/Nachteile ✅
7. Attribute verfeinern (Step 7) — implements step 5 of official
8. Talente & Kampftechniken — **MISSING**: melee KT split (AT/PA distribution)
9. Abgeleitete Werte ✅
10. Zusammenfassung ✅

**The problem**: Attributes should be refined BEFORE advantages/disadvantages (which are cheaper to adjust). Current order is pedagogically fine but breaks the official flow slightly.

**Not a show-stopper** — AP math is still correct — but worth noting.

---

### ❌ Missing Step: Melee Combat Technique Split (AT/PA Distribution)

**Official Rule** (Regelwerk p. 56–57):
- Melee weapon groups have a KTW (Kampftechnik-Wert)
- This must be split between AT (Angriff) and PA (Parade), e.g.:
  - Schwerter KTW 12 → could be AT 8 PA 4, or AT 6 PA 6, or AT 10 PA 2
  - Minimum: AT ≥ 3, PA ≥ 3 for proper use
- Ranged weapon groups use full KTW for attack only (no PA)

**Current Implementation**:
- ❌ **NOT IMPLEMENTED** in wizard
- Wizard step 8 (Talente & Kampftechniken) shows KT names but NO UI to split melee KT into AT/PA
- Backend accepts `combat_techniques` dict but stores full KTW value only
- Code path later uses KTW directly for attack rolls (frontend/src/hooks/useCombatValues.js computes AT/PA from KTW)

**Workaround used**: Frontend `useCombatValues.js` computes AT/PA automatically as KTW/2 (rounded), then +/- modifiers. This is NOT how DSA5 works — official rule requires **deliberate allocation** per character during creation.

**Severity**: 🟡 **MEDIUM** — Characters are playable but don't have full control over AT/PA split. A wizard character might have KTW 10, auto-computed as AT 5 PA 5, but might prefer AT 2 PA 8 for defense.

---

## Data Completeness Issues

### Seed Data Status

| Entity | Count | Expected | Complete | Notes |
|--------|-------|----------|----------|-------|
| Species | 4 | 4 | ✅ 100% | All core species present with correct data |
| Cultures | 30 | 50+ | ❌ 60% | Missing elf/dwarf specialty cultures |
| Professions | 14 | 60+ | ❌ 23% | Most have ap_cost: 0, skills/KT incomplete |
| Advantages | 10 (hardcoded) | 100+ | ❌ 10% | Only toy presets, no real databank |
| Disadvantages | 10 (hardcoded) | 50+ | ❌ 20% | Only toy presets |
| Talents | 41 | 100+ | ❌ 41% | Specializations missing |
| Kampftechniken | 17 | 17 | ✅ 100% | Complete |
| Spells | 0 (per profession) | 100+ | ❌ 0% | Profession can define them, but not in databank |
| Liturgies | 0 (per profession) | 80+ | ❌ 0% | Same as spells |

**Blockers for full DSA5 implementation**:
1. Optolith data is closed-source (licensing)
2. Manual data entry would require ~200 hours
3. Foundry VTT DSA5 data is premium-paid (not open source)

---

## AP Budget Validation

### Correctness ✅

Frontend AP budget calculation (`CharacterCreator.jsx:338-383`) is mathematically correct:

```
Total AP = Grade AP (900–2100)
Cost breakdown:
  - Species AP
  - Culture AP
  - Profession AP
  ─────────────────────
  = Free AP pool

Free AP spent on:
  - Attribute raises: sum of ATTR_COST per point
  - Skill raises: sum of SF_TABLE[current_val] per point
  - KT raises: sum of SF_TABLE[current_val] per point
  - Advantages: sum of ap values
  - (minus) Disadvantages: yields back up to 80 AP
  ─────────────────────
  = Remaining AP (must be ≥ 0)
```

Cost tables match backend/leveling.py exactly ✅

### Bugs Found ❌

1. **No advantage AP cap** (Regelwerk p. 52: max 80 AP on advantages)
   - Code calculates: `nachteileRefund = Math.min(80, ...)`
   - Missing: `vorteileAP = Math.min(80, ...)`
   - A player can spend unlimited AP on advantages

2. **Disadvantage refund is capped at 80, but advantage spending isn't**
   - Code: `const nachteileRefund = Math.min(80, nachteile.reduce(...))`
   - Missing: `const vorteileAP = Math.min(80, vorteile.reduce(...))`

---

## Validation & Constraints Enforcement

### Enforced ✅
- Experience grade determines AP pool ✅
- Species free point allocation must match (step validation) ✅
- Culture/Profession must be selected ✅
- Attribute max per grade ✅
- Skill max per grade ✅
- KT minimum of 6 (uninitialized) ✅
- Final AP budget ≥ 0 required ✅

### NOT Enforced ❌
- Advantage AP cap (max 80) ❌
- Disadvantage selection restrictions (e.g. "Albino" incompatible with some species) ❌
- Talent prerequisites (e.g. Überreden needs Etikette 3+) ❌
- Culture/profession compatibility (some combos forbidden) ❌
- Spells/liturgies must be from character's tradition ❌
- KT split into AT/PA for melee weapons ❌

---

## Rules Precision Issues

### Derived Values Formula (HIGH PRIORITY)

**WRONG** in both frontend and backend:
- AsP_max: current = (MU + IN + CH) / 2; correct = (MU + IN + CH) / 3
- KaP_max: current = (MU + KL + IN) / 2; correct = (MU + KL + IN) / 3

This causes **50% overpowered magical and blessed characters**.

### Cultural Incompatibilities

**MISSING**: Some professions forbidden for certain cultures.
Example (from Regelwerk):
- Krieger, Streuner, Magier available to most cultures
- "Waldläufer" restricted to certain cultures (Waldvolk, etc.)

Current code: No filtering, all professions shown for all cultures.

### Species-Locked Advantages

**INCOMPLETE**: Some advantages species-locked.
Example:
- Dunkelsicht only for Elf or Zwerg (not Mensch/Halbelf)
- Zweistimmiger Gesang only for Elf

Current code: Auto-advantages handled correctly for species, but no lock-out in advantage picker.

---

## Test Coverage

### What's been tested:
- ✅ Mensch Krieger (warrior) creation — works end-to-end
- ✅ Elf Magier (wizard) creation — works except KaP/AsP calculation
- ⚠️ Advantage/disadvantage selection — 80 AP cap not enforced

### What hasn't been tested:
- ❌ Melee KT split (AT/PA) in character creation
- ❌ Culture/profession incompatibility
- ❌ Talent prerequisites
- ❌ Dwarf/Halfling creation
- ❌ Exotic professions (Alchemist, Geode, etc.)

---

## Summary Table

| Requirement | Implemented | Correct | Notes |
|-------------|-------------|---------|-------|
| Step 1: Grade | ✅ | ✅ | AP totals correct |
| Step 2: Species | ✅ | ✅ | Data complete, math correct |
| Step 3: Name | ✅ | ✅ | Admin-only |
| Step 4: Culture | ✅ | ⚠️ | Data 60% complete, no prerequisites |
| Step 5: Profession | ✅ | ❌ | Data 23% complete, AP costs mostly 0 |
| Step 6: Vor-/Nachteile | ✅ | ❌ | **80 AP cap not enforced** |
| Step 7: Attributes | ✅ | ✅ | Math correct, UI sparse |
| Step 8: Talente/KT | ✅ | ⚠️ | Math correct, **AT/PA split missing** |
| Step 9: Derived Values | ✅ | ❌ | **AsP/KaP formulas WRONG** (÷2 not ÷3) |
| Step 10: Summary | ✅ | ✅ | AP validation correct |

---

## Recommendations (Priority Order)

### 🔴 Critical (Fix Before Release)

1. **Fix AsP/KaP calculation** (lines 394–395 frontend, lines 49–50 backend)
   - Change divisor from 2 to 3
   - Impact: Prevents overpowered magic users
   - Estimated effort: 10 minutes

2. **Enforce 80 AP cap on advantages**
   - Add `Math.min(80, vorteile.reduce(...))` in AP calculation
   - Update UI to show cap violation
   - Estimated effort: 20 minutes

### 🟡 High (Do Before Beta)

3. **Implement melee KT split UI**
   - Add step 8 sub-panel: for each melee KT, choose AT/PA split
   - Store as `combat_techniques[name] = { ktw, at, pa }`
   - Update backend to use AT/PA values
   - Estimated effort: 2 hours

4. **Complete profession seed data**
   - Fix AP costs (currently mostly 0)
   - Add all ~60 professions
   - Add skill grants per profession
   - Add KT grants per profession
   - Estimated effort: 8 hours (data entry)

5. **Add advantage/disadvantage databank**
   - Replace hardcoded presets with API endpoint
   - Load from `/api/databank/advantages`
   - Enforce AP caps, prerequisites, species locks
   - Estimated effort: 4 hours

### 🟢 Medium (Nice-to-Have)

6. **Add culture/profession compatibility matrix**
   - Define which profession combos are valid for each culture
   - Add validation in step 5
   - Estimated effort: 1 hour + data

7. **Add talent prerequisites**
   - Some talents require other talent values (e.g. Überreden needs Etikette 3)
   - Check in step 8 before allowing rank-up
   - Estimated effort: 2 hours

8. **Improve UI for derived values**
   - Show base/modified breakdown for INI, AW, SK, ZK
   - Live preview as user adjusts attributes
   - Estimated effort: 1 hour

---

## Conclusion

The character creation wizard successfully implements the **mechanical flow** of DSA5 character creation and produces playable characters. However, **three critical rule violations** prevent full compliance:

1. **AsP/KaP formulas divide by 2, not 3** → 50% overpowered magic users
2. **80 AP cap on advantages not enforced** → unlimited advantage spending
3. **Melee KT AT/PA split not implemented** → players can't customize combat style

These must be fixed before public release. The missing professions and advantages are acceptable for an MVP (can be filled incrementally), but the formula bugs and AP cap must be corrected immediately.

---

**Report generated**: 2026-03-27
**Agent**: dsa-rules (character-creator team)
**Next step**: Prioritize critical fixes (#1, #2) and schedule high-priority features (#3–5)
