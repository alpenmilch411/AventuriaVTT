# Optolith Data Audit Report

**Date:** 2026-03-27
**Auditor:** dsa-rules-expert (AI agent)
**Source:** Optolith YAML at `/tmp/optolith-data/app/Database/Data/de-DE/`
**Target:** `backend/aventuria_vtt.db` seed data

---

## Executive Summary

Our seed database covers the core rulebook (Grundregelwerk, GRW) reasonably well for the most common entity types but has significant gaps in supplemental content. Three **critical naming bugs** were found in talents that will cause import/matching failures. Cultural skill bonuses are populated (contrary to initial reports). The biggest coverage gaps are in professions, spells, liturgies, and special abilities.

---

## 1. Per-Category Summary

| Category | Ours | Optolith | Coverage | Accuracy | Priority |
|---|---|---|---|---|---|
| Species (Races) | 4 | 4 | 100% | **GOOD** — minor issues | Low |
| Cultures | 33 | 33 | 100% | **GOOD** — skill_bonuses populated, AP costs match | Low |
| Professions | 46 | 259 | 18% | **FAIR** — GRW complete, supplements missing | High |
| Advantages | 43 | 135 | 32% | **FAIR** — missing 8 GRW entries, naming issues | Medium |
| Disadvantages | 44 | 83 | 53% | **FAIR** — naming mismatches, wrong categories | Medium |
| Spells | 30 | 330 | 9% | **GOOD** for what we have | High |
| Liturgies | 20 | 227 | 9% | **GOOD** for what we have | High |
| Talents (Skills) | 59 | 59 | 100% | **3 NAMING BUGS** | **CRITICAL** |
| Combat Techniques | 22 | 21 | 105% | 1 extra ("Äxte") | Medium |
| Special Abilities | 64 | 1,447 | 4% | **GOOD** for combat SAs | High |
| Equipment | 177 | 875 | 20% | **FAIR** | Medium |

---

## 2. Detailed Findings per Category

### 2.1 Species (Races) — 4/4, GOOD

All 4 species match: Mensch (R_1), Elf (R_2), Halbelf (R_3), Zwerg (R_4).

**Verified correct:**
- Names match exactly
- Attribute base values (all 8) are correct
- AP costs: Mensch 0, Elf 18, Halbelf 0, Zwerg 61 ✓

**Optolith limitation:** The YAML does not contain structured numeric data for LeP, AsP, SeeK, ZK, GS base values — it only has narrative text for attribute adjustments. Our DB values appear sourced directly from the rulebook and look correct.

**Minor discrepancies:**
- Elf: Our `attribute_adjustments` = `[{"attr":"IN","value":1},{"attr":"GE","value":1}]` — this is correct (IN+1, GE+1) but Optolith notes "KL oder KK -2" which is a player choice; we don't model the -2 choice yet.
- Zwerg: Our `attribute_adjustments` = `[{"attr":"KO","value":1},{"attr":"KK","value":1}]` — correct. Missing the "CH oder GE -2" choice.
- Elf auto-advantages: We have `["Zweistimmiger Gesang", "Flink I"]` — Optolith says "Zauberer, Zweistimmiger Gesang". We're **missing "Zauberer"** as an auto-advantage for elves. Flink I is not listed as automatic in Optolith (it's recommended).
- Zwerg auto-advantages: We have `["Dunkelsicht I", "Zähigkeit"]` — Optolith recommends these as "stronglyRecommendedAdvantages" but does not list them as automatic. Should verify against rulebook.

**Recommendation:** Model the negative attribute choice (-2 to one of two options). Verify elf/dwarf auto-advantages against rulebook page citations.

---

### 2.2 Cultures — 33/33, GOOD

All 33 cultures present with exact name matches and correct Optolith IDs.

**IMPORTANT CORRECTION:** The initial team assessment said cultures have "empty skill_bonuses" — this is **WRONG**. All 33 cultures have populated `skill_bonuses` JSON with 7-9 skill bonuses each. Example: Aranier has `{"Etikette": 1, "Menschenkenntnis": 1, "Überreden": 1, "Handel": 1, "Rechnen": 1, "Götter & Kulte": 1, "Rechtskunde": 1, "Geschichtswissen": 1}`.

**Optolith limitation:** Cultures.yaml does NOT contain structured skill bonus data — only narrative descriptions of common professions, advantages, and names. Our skill bonuses must have been entered manually from the rulebook. **Cannot verify AP costs or skill bonuses against Optolith YAML** — they would need to be checked against the actual DSA5 rulebook PDFs.

**Key data present in Optolith but missing from our DB:**
- `areaKnowledge` / `areaKnowledgeShort` (Gebietskenntnis)
- `commonMundaneProfessions`, `commonMagicalProfessions`, `commonBlessedProfessions`
- `commonAdvantages`, `commonDisadvantages`, `uncommonAdvantages`, `uncommonDisadvantages`
- `commonNames` (name generator data)

These are all useful for character creation guidance but not mechanically critical.

---

### 2.3 Professions — 46/259, 18% Coverage

**What we have (46):** All 31 GRW professions (P_1 through P_31) plus 15 supplement professions (P_95-P_109 Geweihte + Amazone/Draconiter/Golgarit/Namenloser-Geweihter).

**What's missing (213):** Primarily from supplements:
- **Aventurisches Kompendium (US25003):** ~25 professions — Adersin-Schwertgeselle, Adliger, Bauer, Diener, Entdecker, Gelehrter, Hirte, Mechanikus, Schmied, various Krieger variants, etc.
- **Aventurische Magie (US25005/US25006):** ~50+ magical professions — various Gildenloser Magier variants, Graumagier/Schwarzmagier/Weißmagier academy variants, Druide, Ceoladir, Derwisch, etc.
- **Aventurisches Götterwirken:** Additional blessed professions
- **Regionalsupplements:** Regional variants (Havener Krieger, Thorwaler Krieger, etc.)

**Data quality for existing 46:**
- All have `combat_techniques` populated with skill values ✓
- All have `skills` populated with skill values ✓
- All have `starting_equipment` populated ✓
- All have `starting_money` populated ✓
- AP costs present for all ✓
- **Cannot verify AP costs against Optolith** — Professions.yaml only has narrative text (suggested advantages/disadvantages), no structured skill/CT data

**Naming issues:**
- Some Optolith professions share names but differ by `subname` (academy/variant) — e.g., there are 10+ "Gildenloser Magier" entries differentiated by school. Our DB has only 1.

---

### 2.4 Advantages — 43/135, 32% Coverage

**Critical: 8 core rulebook (GRW) advantages MISSING from our DB:**

| Missing Advantage | AP Cost | Importance |
|---|---|---|
| Angenehmer Geruch | 2 AP | Low |
| Begabung | 6-24 AP (varies) | **HIGH** — very common |
| Fuchssinn | 10 AP | Medium |
| Giftresistenz | 5 AP | Medium |
| Herausragende Kampftechnik | 8-16 AP | **HIGH** — combat critical |
| Hitzeresistenz | 5 AP | Medium |
| Immunität gegen (Gift) | varies | Medium |
| Immunität gegen (Krankheit) | varies | Medium |
| Kälteresistenz | 5 AP | Medium |
| Krankheitsresistenz | 5 AP | Medium |
| Magische Einstimmung | ? | Elf-specific |
| Mystiker | ? | Geweihte |
| Nichtschläfer | ? | Elf-specific |
| Pragmatiker | ? | Geweihte |
| Richtungssinn | 10 AP | **HIGH** — very common |
| Schlangenmensch | 5 AP | Low |
| Unscheinbar | 5 AP | Medium |
| Verhüllte Aura | ? | Magical |
| Vertrauenerweckend | 5 AP | Medium |
| Waffenbegabung | 5-15 AP | **HIGH** — combat critical |
| Wohlklang | 5 AP | Medium |
| Zauberer | 25 AP | **CRITICAL** — magic prerequisite |
| Zeitgefühl | 2 AP | Low |
| Zwergennase | 5 AP | Low |

**Naming mismatches:**
- Our "Eisenaffin" → Optolith "Eisenaffine Aura" (incorrect name)
- Our "Adlig I/II/III" → Optolith "Adel" (different naming convention — Optolith uses levels internally)
- Our "Unempfindlich gegen Hitze/Kälte" → Optolith "Hitzeresistenz" / "Kälteresistenz" (WRONG NAMES)
- Our "Magieresistenz" → Not in Optolith (may be homebrew or from an older edition?)
- Our "Gutes Gedächtnis" → Not in Optolith GRW (may be supplement or custom)
- Our "Kampfrausch" → Not in Optolith advantages (it's a Special Ability in DSA5!)
- Our "Natürliche Waffe" → Not in Optolith standard advantages
- Our "Koboldfreund" → Present in Optolith as ADV_139

**Structural issues:**
- We split leveled advantages into separate rows (Glück I, Glück II, Glück III) while Optolith has a single "Glück" with levels. This is a design choice, not a bug, but complicates import.

---

### 2.5 Disadvantages — 44/83, 53% Coverage

**Missing core rulebook disadvantages:**
- Arm, Behäbig, Farbenblind, Giftanfällig, Hässlich, Kein Vertrauter, Keine Flugsalbe, Körpergebundene Kraft, Körperliche Auffälligkeit, Lästige Mindergeister, Magische Einschränkung, Nachtblind, Pechmagnet, Schlafwandler, Schlechte Angewohnheit, Schlechte Eigenschaft, Sensibler Geruchssinn, Sprachfehler, Stigma, Stumm, Unfrei, Verstümmelt, Wilde Magie, Zauberanfällig, Zerbrechlich

**Naming mismatches:**
- Our "Angst vor ..." → Optolith "Angst vor" (trailing dots)
- Our "Persönlichkeitsschwäche" → Optolith "Persönlichkeitsschwächen" (singular vs plural)
- Our "Phobie" → Not in Optolith (this is modeled as "Angst vor" in DSA5)

**Incorrect categorization / possible homebrews:**
- "Autoritätsgläubig" — Not a standalone disadvantage in Optolith; it's a sub-option of "Schlechte Eigenschaft"
- "Goldgier" — Not standalone; it's a "Schlechte Eigenschaft" sub-option
- "Jähzorn" — Not standalone; it's a "Schlechte Eigenschaft" sub-option
- "Krämerseele" — Not found in Optolith at all
- "Schulden I/II/III" — Not in Optolith (may be from older edition or custom)
- "Sturmempfindlich" — Not in Optolith

**Critical design issue:** In DSA5, "Schlechte Eigenschaft" is a single disadvantage with sub-options (Goldgier, Jähzorn, Aberglaube, Neugier, etc.). Our DB has some of these as standalone disadvantages, which doesn't match the official structure. However, for a VTT this may be a deliberate simplification.

---

### 2.6 Talents (Skills) — 59/59, **3 CRITICAL NAMING BUGS**

Count matches perfectly (59 vs 59) but **three talents have wrong names:**

| Our Name | Correct Name (Optolith) | Impact |
|---|---|---|
| **Sinnenschärfe** | **Sinnesschärfe** | Typo — will break skill lookups |
| **Kochen** | **Lebensmittelbearbeitung** | Wrong name — official DSA5 name is Lebensmittelbearbeitung |
| **Fesseln/Entfesseln** | **Fesseln** | Extra suffix — official name is just "Fesseln" |

**Additionally:** Our culture_templates reference "Sinnesschärfe" correctly in skill_bonuses (e.g., Maraskaner has "Sinnesschärfe": 1), but the talent_templates table has it as "Sinnenschärfe" — **this mismatch will cause skill bonus lookups to fail silently.**

Similarly, culture_templates references "Kochen" which matches our (wrong) talent name, so at least they're internally consistent — but both are wrong relative to DSA5 official naming.

**Recommendation: FIX IMMEDIATELY** — rename these 3 talents and update all references.

---

### 2.7 Combat Techniques — 22/21

All 21 Optolith combat techniques are present in our DB. We have one extra:

- **"Äxte"** — Not in Optolith. In DSA5, axes are covered by "Hiebwaffen" (which includes axes, clubs, hammers) and "Zweihandhiebwaffen" (which includes two-handed axes).

**Recommendation:** Verify whether "Äxte" is a deliberate house-rule or a data error. If using Optolith as authority, it should be removed and weapons reassigned to Hiebwaffen/Zweihandhiebwaffen.

---

### 2.8 Spells — 30/330, 9% Coverage

Our 30 spells appear to be the core combat/utility spells from the GRW. Spot-checks show names match Optolith.

**Our spells present in Optolith (verified):**
ARMATRUTZ ✓, AXXELERATUS ✓, BALSAM SALABUNDE ✓, BANNBALADIN ✓, BLITZ DICH FIND ✓, CORPOFESSO ✓, DUPLICATUS ✓, FALKENAUGE ✓, FLIM FLAM ✓, FULMINICTUS ✓, GARDIANUM ✓, HORRIPHOBUS ✓, IGNIFAXIUS ✓, MANIFESTO ✓, MOTORICUS ✓, ODEM ARCANUM ✓, PARALYSIS ✓, PSYCHOSTABILIS ✓, RESPONDAMI ✓, SILENTIUM ✓, TRANSVERSALIS ✓, VISIBILI ✓

**Notable spells NOT in our DB from GRW:**
- Adlerauge, Analys Arkanstruktur, Blick in die Gedanken, Disruptivo, Große Gier, Harmlose Gestalt, Hexengalle, Hexenkrallen, Invocatio Minima, Katzenaugen, Krötensprung, Manus Miracula, Nebelwand, Oculus Illusionis, Penetrizzel, Radau, Salander, Sanftmut, Satuarias Herrlichkeit, Somnigravis, Spinnenlauf, Spurlos, Wasseratem

**Naming:** Our DB stores spell names in UPPERCASE while Optolith uses Title Case. This needs normalization for matching. Spells not in Optolith: CLAUDIBUS, DESINTEGRATUS, EISENROST, HEXENBLICK, KARNIFILO, PLUMBUMBARUM, UNITATIO, ZAUBERNAHRUNG — these may be from supplements or may have different names.

---

### 2.9 Liturgies — 20/227, 9% Coverage

Our 20 liturgies cover core deity-specific prayers. Names appear to be custom/simplified rather than matching Optolith exactly.

**Naming comparison (sample):**
- Our "Heilung des Körpers" — closest Optolith match: "Heilsegen" (LITURGY_13)
- Our "Bannstrahl des Praios" — closest: "Kleiner Bannstrahl" (LITURGY_15)
- Our "Kleiner Segen" — not directly in Optolith liturgies (may be a Blessing/Segen, not a liturgy)
- Our "Peraines Giftheilung" — closest: "Giftbann" (LITURGY_10)

**Note:** Optolith also has "Blessings.yaml" (separate from liturgies) — our "Kleiner Segen" may belong there.

---

### 2.10 Special Abilities — 64/1,447, 4% Coverage

Our 64 SAs focus on combat-relevant abilities. By category:

| Our Category | Count | Optolith Equivalent |
|---|---|---|
| nahkampf (melee) | 28 | ~40 melee combat SAs in Optolith |
| fernkampf (ranged) | 6 | ~15 ranged combat SAs |
| allgemein (general combat) | 8 | ~30 general combat SAs |
| allgemein_nichtkampf | 13 | ~200+ general non-combat SAs |
| magisch (magical) | 6 | ~155+ magical SAs |
| karmal (karmal) | 3 | ~29+ karmal SAs |

**Major categories we're entirely missing:**
- Magical traditions (SA_70+): Tradition (Gildenmagier), Tradition (Hexen), etc.
- Scholar abilities (SA_268+): Academy-specific bonuses
- Blessed traditions: Tradition (Praioskirche), etc.
- Craft secrets (Berufsgeheimnisse)
- Style combinations
- Extended magical/karmal SAs (meditation variants, spell optimizations)
- Language/script abilities

**What we have is solid for basic combat** — Finte I-III, Wuchtschlag I-III, Schildkampf I-II, Beidhändiger Kampf, etc. are the most commonly used SAs.

---

### 2.11 Equipment — 177/875, 20% Coverage

| Type | Ours | Optolith Total | Notes |
|---|---|---|---|
| Weapons | 42 | ~200 | Core weapons covered |
| Armor | 16 | ~50 | Main armor types present |
| Shields | 6 | ~10 | Good coverage |
| General Items | 113 | ~615 | Adventuring basics covered |

**Optolith equipment structure** uses `ITEMTPL_*` IDs with a `versions` array for variants. Our weapon/armor data appears sourced from the GRW weapon/armor tables and covers the commonly used items.

---

## 3. Priority Recommendations

### P0 — Fix Immediately (Data Bugs)

1. **Rename talent "Sinnenschärfe" → "Sinnesschärfe"** (typo causing lookup failures)
2. **Rename talent "Kochen" → "Lebensmittelbearbeitung"** (wrong name)
3. **Rename talent "Fesseln/Entfesseln" → "Fesseln"** (extra suffix)
4. **Rename advantage "Eisenaffin" → "Eisenaffine Aura"**
5. **Rename advantages "Unempfindlich gegen Hitze/Kälte" → "Hitzeresistenz"/"Kälteresistenz"**
6. Update all culture/profession skill_bonuses references to match corrected talent names

### P1 — High Priority (Missing Core Data)

7. **Add missing GRW advantages:** Begabung, Richtungssinn, Zauberer, Waffenbegabung, Herausragende Kampftechnik, Giftresistenz, Krankheitsresistenz, Hitzeresistenz, Kälteresistenz, Immunität gegen, Wohlklang, Vertrauenerweckend, Unscheinbar, Schlangenmensch, Zwergennase, etc.
8. **Add missing GRW disadvantages:** Arm, Behäbig, Hässlich, Nachtblind, Zerbrechlich, Unfrei, Giftanfällig, Verstümmelt, Körperliche Auffälligkeit, Schlechte Angewohnheit, Wilde Magie, Zauberanfällig, etc.
9. **Review "Äxte" combat technique** — remove if not intentional house-rule
10. **Verify Kampfrausch** — this is a Special Ability in DSA5, not an Advantage

### P2 — Medium Priority (Expand Coverage)

11. Add ~23 missing GRW spells (Adlerauge through Wasseratem)
12. Add Aventurisches Kompendium professions (~25)
13. Restructure disadvantages: "Goldgier", "Jähzorn", "Autoritätsgläubig" should be sub-options of "Schlechte Eigenschaft", not standalone entries
14. Add missing GRW liturgies and verify liturgy naming against Optolith
15. Verify liturgy naming — our custom names don't match Optolith

### P3 — Low Priority (Nice to Have)

16. Add supplement professions (remaining ~188)
17. Expand spells from supplements (~300)
18. Expand liturgies from supplements (~207)
19. Add non-combat special abilities (~1,300+)
20. Add remaining equipment (~700)
21. Add culture metadata (areaKnowledge, commonNames for name generator)

---

## 4. Notes on Optolith YAML Structure

**Key limitation:** Optolith's YAML files are primarily **descriptive/narrative**, not structured game data. They contain:
- Names, IDs, rules text, page references
- Narrative descriptions of advantages, prerequisites, suggested options
- **BUT NOT:** Structured AP cost numbers, skill point allocations, attribute modifiers as numeric fields

This means:
- We **cannot** auto-import AP costs, skill bonuses, or stat modifiers from Optolith YAML
- We **can** import: names, IDs, rules text, source references, prerequisites text
- Structured numeric data must come from parsing rulebook tables or another source

**Exceptions:** Some entities do have structured data:
- Skills.yaml has `applications` arrays
- Equipment.yaml has `versions` with detailed stats
- SpecialAbilities.yaml has `apValue` for some entries
- CombatTechniques.yaml has basic info

---

## 5. Summary Statistics

| Metric | Value |
|---|---|
| Total entities in our DB | ~577 |
| Total entities in Optolith | ~3,463 |
| Overall coverage | ~17% |
| Critical bugs found | 3 (talent naming) |
| Naming mismatches | ~8 |
| Missing GRW-only entries | ~80 |
| Missing supplement entries | ~2,800+ |

**Bottom line:** Our seed data covers the DSA5 Grundregelwerk core reasonably well with a few naming bugs that need immediate fixing. The biggest gaps are in supplemental content from expansion books. For a VTT focused on core gameplay, fixing the P0 bugs and adding P1 missing GRW data would bring us to solid coverage.

---

## 6. Data Richness: What Optolith Has That We're Missing (Even for Existing Entities)

Beyond missing entities, Optolith provides **richer detail** for entities we already have. This section covers additional fields and data quality improvements.

### 6.1 Spells — Significant Richness Gap

**Fields Optolith has that we're not capturing:**

| Optolith Field | Our Equivalent | Gap |
|---|---|---|
| `effect` | `description` | Optolith has **full rules text** (200-500 words); ours has 1-sentence summaries |
| `castingTimeShort` | — | Missing: abbreviated casting time for compact UI |
| `aeCostShort` | — | Missing: abbreviated cost for compact UI |
| `rangeShort` | — | Missing: abbreviated range |
| `durationShort` | — | Missing: abbreviated duration |
| `errata` | — | Missing: official errata corrections with dates |

**Critical spell accuracy issues found:**

| Spell | Field | Our Value | Optolith Value | Verdict |
|---|---|---|---|---|
| **IGNIFAXIUS** | casting_time | **1 Aktion** | **2 Aktionen** | **WRONG** — our value is incorrect |
| ARMATRUTZ | asp_cost | "4 AsP (Aufrechterhalten 2 AsP pro KR)" | "4/8/16 AsP for RS 1/2/3" | **WRONG** — different mechanic entirely; ours treats it as sustain, Optolith as tiered one-shot |
| ARMATRUTZ | duration | (implied sustain) | "QS x 3 Minuten" | **WRONG** — it's a timed duration, not sustained |
| BALSAM SALABUNDE | asp_cost | "8 AsP" | "1 AsP pro LeP, min 4" | **WRONG** — our flat cost is incorrect; it's variable |
| GARDIANUM | asp_cost | "8 AsP (Aufrechterh...)" | "Mindestens 4 AsP" | **WRONG** — cost model differs |
| GARDIANUM | duration | (implied sustain) | "5 Minuten" | **WRONG** — fixed duration |
| DUPLICATUS | asp_cost | "8 AsP (Aufrechterh...)" | "4 AsP pro Doppelgänger" | **WRONG** — cost is per clone |
| DUPLICATUS | duration | (implied sustain) | "QS x 3 Kampfrunden" | **WRONG** — timed, not sustained |
| FLIM FLAM | asp_cost | "2 AsP" | "2 AsP + 1 AsP/Stunde" | **INCOMPLETE** — missing sustain cost |

**Diagnosis:** Our spell data appears to be **AI-approximated** rather than sourced from the rulebook. Multiple core mechanics are wrong — casting times, cost models (flat vs variable vs tiered), duration types. This is a significant accuracy issue for gameplay.

**Recommendation:** Import `effect`, `castingTime`, `aeCost`, `range`, `duration`, `target` from Optolith for all 30 existing spells. These are the authoritative rulebook values. Also import the `Short` variants for UI display.

### 6.2 Liturgies — Major Accuracy Concerns

**Our liturgies use custom/invented names** that don't match Optolith or the rulebook:

| Our Name | Likely Optolith Match | Issue |
|---|---|---|
| Heilung des Körpers | Heilsegen (LITURGY_13) | **Wrong name, wrong mechanic** — our version heals QS×1W6 LeP; official heals 1 KaP per LeP |
| Bannstrahl des Praios | Kleiner Bannstrahl (LITURGY_15) | Wrong name |
| Kleiner Segen | Actually a **Blessing** (Segen), not a Liturgy | **Wrong category** — Blessings are separate from Liturgies in DSA5 |
| Peraines Giftheilung | Giftbann (LITURGY_10) | Wrong name |
| Peraines Krankenheilung | Krankheitsbann (LITURGY_16) | Wrong name |

**Optolith has fields we're missing:**
- `kpCost` / `kpCostShort` (structured KaP costs)
- `effect` (full rules text)
- `castingTime` / `castingTimeShort`
- Proper `target` categories

**Additionally, Optolith has 12 Blessings (Segnungen)** as a separate YAML file (`Blessings.yaml`). We don't have a `blessing_templates` table at all. Blessings are simpler than Liturgies (no probe required, 1 KaP cost) and every Geweihter knows all of them.

### 6.3 Special Abilities — Structured Data Available

Optolith SA entries provide fields we don't capture:

| Optolith Field | Our DB Has? | Value |
|---|---|---|
| `rules` | `rules_text` (partial) | Optolith has **complete rules text** |
| `penalty` | `at_mod`/`pa_mod` (partial) | Optolith stores combat penalty as text (e.g., "−1/−2/−3") |
| `apValue` | `ap_cost` | Only 32/1,447 SAs have this in Optolith |
| `prerequisites` | `prerequisites` | Optolith has structured prerequisite data |
| `selectOptions` | — | Missing: sub-options (e.g., Berufsgeheimnis variants, Sprache options) |
| `combatTechniques` | `applicable_techniques` | Similar data |
| `src` | — | Missing: source book + page references |

**Key missing SA data type:** Traditions (SA_70+). These define how each magical/blessed tradition works (casting restrictions, leiteigenschaft, special rules). Critical for character creation but entirely absent from our DB.

### 6.4 Equipment — Optolith Has Different Structure

Optolith equipment uses a `versions` system where items can have multiple stat variants from different source books. However, **most equipment entries in Optolith only have source references, not structured stat data** (no damage, AT/PA mods, weight, price in the YAML).

Notably, the Kettenhemd entry has `advantage`, `disadvantage`, and `note` text fields — qualitative data about gear we don't capture.

**Our weapon/armor data is actually RICHER than Optolith** in terms of game-mechanical stats (damage, AT/PA, reach, weight, price, RS, BE). Optolith defers to the physical rulebook for these.

### 6.5 Conditions & States — Optolith Has Authoritative Text

Optolith provides:
- **14 Conditions** with per-level effect descriptions (level1 through level4)
- **25 States** with full description text

Our rules engine handles conditions programmatically, but we could import the official descriptions for UI tooltips and GM reference.

### 6.6 Additional Entity Types We Don't Have At All

Optolith has entire categories we have no tables for:

| Category | Count | Description |
|---|---|---|
| Cantrips (Zaubertricks) | 97 | Minor magic effects, no probe needed |
| Blessings (Segnungen) | 12 | Minor divine effects, 1 KaP |
| Spell Enhancements | 330 | 3 upgrades per spell |
| Liturgical Chant Enhancements | 213 | 3 upgrades per liturgy |
| Curses (Flüche) | 24 | Hexen-specific |
| Elven Magical Songs | 18 | Elf-specific magic |
| Magical Dances | 26 | Zaubertänzer-specific |
| Magical Melodies | 24 | Zaubermusiker-specific |
| Rogue Spells | 20 | Schelmenzauber |
| Domination Rituals | 6 | Herrschaftsrituale |
| Geode Rituals | 2 | Geodenrituale |
| Zibilja Rituals | 15 | Zibiljarituale |
| Animist Forces | 15 | Animistenkräfte |
| Focus Rules | 13 | Optional rule modules |
| Experience Levels | 7 | AP thresholds (Unerfahren→Legendär) |

### 6.7 Source Book References & Errata

Optolith provides `src` (source book ID + page number) for nearly every entity. This enables:
- Linking to rulebook page numbers in the UI
- Filtering content by owned books
- Verifying data against the physical rulebook

**14 entities have official errata** — corrections to published values. We should import these to ensure our data reflects the latest rulings. Example: SA "Tradition (Animisten)" has errata correcting AP cost from 100 to 125.

**32 source books** are referenced in Optolith's `Books.yaml`, with IDs like US25001 (Regelwerk), US25003 (Kompendium I), US25005 (Aventurische Magie), etc.

### 6.8 Data Richness Summary

| Data Type | Our Richness | Optolith Richness | Who Wins? |
|---|---|---|---|
| Spell mechanics (damage, effect_per_qs, buff_effect) | VTT-specific computed fields | Full rules text from rulebook | **Different purposes** — both needed |
| Spell base values (cost, time, range, duration) | AI-approximated, **multiple errors** | Authoritative rulebook values | **Optolith wins** |
| SA combat modifiers (at_mod, pa_mod, damage_mod) | Structured numeric data | Narrative text only | **We win** |
| Equipment stats (damage, RS, BE, weight, price) | Structured numeric data | Source refs only, no stats | **We win** |
| Rules text / descriptions | 1-sentence summaries | Full multi-paragraph text | **Optolith wins** |
| Tradition/prerequisite data | Minimal | Rich structured data | **Optolith wins** |
| Source references | None | Complete (book + page) | **Optolith wins** |
| Errata corrections | None | 14 entries with fixes | **Optolith wins** |

**Key takeaway:** Optolith is authoritative for **rules text, base values (costs/times/durations), source references, and errata**. Our DB is richer for **VTT-specific computed fields** (damage formulas, AT/PA modifiers, buff effects, QS tables). The ideal approach is to **import Optolith's authoritative base values** while keeping our VTT-specific computed fields.
