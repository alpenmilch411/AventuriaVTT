/**
 * DSA5 Advancement Cost Tables — single source of truth.
 *
 * Steigerungsfaktor (SF) cost tables, attribute costs,
 * experience grade limits, and talent category → SF mapping.
 *
 * Used by SteigerungTab, SteigerungModal, CharacterCreator.
 */

// ── SF cost tables (AP cost per skill point, by Steigerungsfaktor A–E) ──
export const SF_TABLES = {
  A: { 0:1,1:1,2:1,3:1,4:1,5:1,6:1,7:1, 8:2,9:2,10:2,11:2,12:2, 13:3,14:3,15:3, 16:4,17:4, 18:5,19:6,20:7,21:8,22:9,23:10,24:12 },
  B: { 0:2,1:2,2:2,3:2,4:2,5:2,6:2,7:2, 8:4,9:4,10:4,11:4,12:4, 13:6,14:6,15:6, 16:8,17:8, 18:10,19:12,20:14,21:16,22:18,23:20,24:24 },
  C: { 0:3,1:3,2:3,3:3,4:3,5:3,6:3,7:3, 8:6,9:6,10:6,11:6,12:6, 13:9,14:9,15:9, 16:12,17:12, 18:15,19:18,20:21,21:24,22:27,23:30,24:36 },
  D: { 0:4,1:4,2:4,3:4,4:4,5:4,6:4,7:4, 8:8,9:8,10:8,11:8,12:8, 13:12,14:12,15:12, 16:16,17:16, 18:20,19:24,20:28,21:32,22:36,23:40,24:48 },
  E: { 0:5,1:5,2:5,3:5,4:5,5:5,6:5,7:5, 8:10,9:10,10:10,11:10,12:10, 13:15,14:15,15:15, 16:20,17:20, 18:25,19:30,20:35,21:40,22:45,23:50,24:60 },
}

// ── Attribute advancement costs (own table, not SF-based) ──
export const ATTR_COST = {
  8:15, 9:15, 10:15, 11:15, 12:15, 13:15, 14:15,
  15:30, 16:30, 17:30, 18:60, 19:60, 20:120, 21:120, 22:240, 23:240, 24:480,
}

// ── Experience grades with AP budget and max values ──
export const EXPERIENCE_GRADES = {
  unerfahren:       { label: 'Unerfahren',      ap: 900,  attr: 14, skill: 14, kt: 14, spell: 14 },
  durchschnittlich: { label: 'Durchschnittlich', ap: 1000, attr: 15, skill: 16, kt: 16, spell: 16 },
  erfahren:         { label: 'Erfahren',         ap: 1100, attr: 16, skill: 18, kt: 18, spell: 18 },
  kompetent:        { label: 'Kompetent',        ap: 1200, attr: 17, skill: 20, kt: 20, spell: 20 },
  meisterlich:      { label: 'Meisterlich',      ap: 1400, attr: 18, skill: 22, kt: 22, spell: 22 },
  brillant:         { label: 'Brillant',         ap: 1700, attr: 19, skill: 24, kt: 24, spell: 24 },
  legendaer:        { label: 'Legendär',         ap: 2100, attr: 20, skill: 25, kt: 25, spell: 25 },
}

// ── Talent category → default Steigerungsfaktor ──
export const TALENT_SF = {
  'körper': 'B', 'gesellschaft': 'B', 'natur': 'C', 'wissen': 'C', 'handwerk': 'B',
  // ASCII aliases
  'koerper': 'B', 'body': 'B', 'social': 'B', 'nature': 'C', 'knowledge': 'C', 'craft': 'B',
}

// ── Helper functions ──

/** AP cost to raise a skill/spell/KT from currentValue to currentValue+1 */
export function getUpgradeCost(currentValue, sf) {
  const table = SF_TABLES[sf]
  if (!table) return 999
  if (currentValue in table) return table[currentValue]
  if (currentValue > 24) return table[24] * Math.pow(2, currentValue - 24)
  return 999
}

/** AP cost to raise an attribute from currentValue to currentValue+1 */
export function getAttrCost(currentValue) {
  return ATTR_COST[currentValue] || (currentValue < 8 ? 15 : 480)
}

/** AP cost to activate (learn) a new spell/liturgy = SF table cost at FW 0 */
export function getActivationCost(sf) {
  const table = SF_TABLES[sf]
  return table ? table[0] : SF_TABLES['C'][0]
}
