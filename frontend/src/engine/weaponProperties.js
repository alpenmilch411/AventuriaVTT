/**
 * DSA5 Weapon Properties Engine
 *
 * Handles weapon properties, reach modifiers, ranged distance penalties,
 * and special abilities that modify combat values.
 */

// ── Weapon Properties ──
export const WEAPON_PROPERTIES = {
  geweiht: { desc: 'Geweihte Waffe — Doppelter Schaden gegen Untote/Dämonen', damageType: 'heilig', vsUndead: 2, vsDemon: 2 },
  wuchtig: { desc: 'Wuchtige Waffe — Schwer zu parieren', paMod: -1 }, // enemy gets -1 PA
  elfisch: { desc: 'Elfische Waffe — Leicht und präzise', atMod: 1 },
  zweihaendig: { desc: 'Zweihändig — Kein Schild möglich, höherer Schaden', tpMod: 1 },
  flexibel: { desc: 'Flexible Waffe (Kette) — Schild ignorieren', ignoreShield: true },
  improvisiert: { desc: 'Improvisierte Waffe — AT/PA -2', atMod: -2, paMod: -2 },
}

// ── Reach Modifiers ──
// When two combatants have different reach, the longer weapon has advantage on first attack
export const REACH_ORDER = ['kurz', 'mittel', 'lang', 'weit']

/**
 * Get reach advantage modifier.
 * Longer reach: +1 AT on first attack in engagement.
 * Shorter reach: -1 AT on first attack (must close distance).
 */
export function getReachModifier(attackerReach, defenderReach) {
  const atkIdx = REACH_ORDER.indexOf(attackerReach || 'mittel')
  const defIdx = REACH_ORDER.indexOf(defenderReach || 'mittel')
  if (atkIdx < 0 || defIdx < 0) return 0
  const diff = atkIdx - defIdx
  if (diff > 0) return 1 // longer reach = advantage
  if (diff < 0) return -1 // shorter reach = disadvantage
  return 0
}

// ── Ranged Distance Brackets ──
// DSA5: ranged weapons have distance brackets that modify FK/AT
const RANGED_BRACKETS = {
  nah:    { mod: -2, desc: 'Nah: -2 FK (zu nah)' },
  mittel: { mod: 0, desc: 'Mittlere Distanz: keine Modifikation' },
  weit:   { mod: -4, desc: 'Weit: -4 FK' },
  extrem: { mod: -8, desc: 'Extreme Distanz: -8 FK' },
}

/**
 * Get ranged attack modifier based on distance bracket.
 */
export function getRangedDistanceMod(bracket = 'mittel') {
  return RANGED_BRACKETS[bracket]?.mod || 0
}

// ── Special Abilities that affect weapon use ──
export const COMBAT_SPECIAL_ABILITIES = {
  // Melee offense
  'Wuchtschlag I':     { atMod: -1, tpMod: 1, desc: 'Wuchtschlag I: -1 AT, +1 TP' },
  'Wuchtschlag II':    { atMod: -2, tpMod: 2, desc: 'Wuchtschlag II: -2 AT, +2 TP' },
  'Wuchtschlag III':   { atMod: -3, tpMod: 3, desc: 'Wuchtschlag III: -3 AT, +3 TP' },
  'Finte I':           { atMod: -1, defMod: -1, desc: 'Finte I: -1 AT, Gegner -1 PA' },
  'Finte II':          { atMod: -2, defMod: -2, desc: 'Finte II: -2 AT, Gegner -2 PA' },
  'Finte III':         { atMod: -3, defMod: -3, desc: 'Finte III: -3 AT, Gegner -3 PA' },
  'Hammerschlag':      { atMod: -4, tpMod: 4, halveRS: true, desc: 'Hammerschlag: -4 AT, +4 TP, RS halbiert' },
  'Todesstoss':        { atMod: -8, tpMultiplier: 2, oncePerCombat: true, desc: 'Todesstoss: -8 AT, Schaden x2 (1x pro Kampf)' },
  'Niederwerfen':      { atMod: -2, onHit: 'knockdown', desc: 'Niederwerfen: -2 AT, bei Treffer KK-Vergleich → Liegend' },
  'Ausfall':           { atMod: -2, reachBonus: 1, desc: 'Ausfall: -2 AT, Reichweite +1 Stufe' },

  // Defense
  'Meisterparade':     { extraParade: true, extraParadeMod: -4, desc: 'Meisterparade: Zusätzliche Parade in derselben KR (-4)' },
  'Schildkampf I':     { paBonus: 1, desc: 'Schildkampf I: +1 PA mit Schild' },
  'Schildkampf II':    { paBonus: 2, desc: 'Schildkampf II: +2 PA mit Schild' },
  'Rüstungsgewöhnung I': { beReduction: 1, desc: 'Rüstungsgewöhnung I: BE -1' },
  'Rüstungsgewöhnung II': { beReduction: 2, desc: 'Rüstungsgewöhnung II: BE -2' },
  'Verbessertes Ausweichen I': { awBonus: 2, desc: 'Verbessertes Ausweichen I: +2 AW' },
  'Verbessertes Ausweichen II': { awBonus: 4, desc: 'Verbessertes Ausweichen II: +4 AW' },
  'Kampfreflexe':      { iniBonus: 2, surpriseImmune: true, desc: 'Kampfreflexe: INI +2, immun gegen Überraschung' },
  'Kampfgespür':       { paBonus: 1, awBonus: 1, desc: 'Kampfgespür: +1 PA/AW' },

  // Ranged
  'Scharfschütze':     { fkMod: 2, desc: 'Scharfschütze: Distanzabzüge um 2 reduziert' },
  'Schnellladen (Bogen)': { reloadReduction: 1, desc: 'Schnellladen: Nachladen -1 Aktion' },
  'Präziser Schuss I': { fkMod: -4, tpMod: 2, desc: 'Präziser Schuss I: -4 FK, +2 TP' },
  'Schnellschuss':     { extraShot: true, fkMod: -4, desc: 'Schnellschuss: 2 Schüsse pro KR (je -4 FK)' },

  // Dual wield
  'Beidhändiger Kampf I': { offhandAttack: true, offhandMod: -4, desc: 'Beidhändig I: Zusatzangriff mit Nebenhand (AT-4)' },
  'Beidhändiger Kampf II': { offhandAttack: true, offhandMod: -2, desc: 'Beidhändig II: Zusatzangriff mit Nebenhand (AT-2)' },
}

/**
 * Get all combat modifiers from a character's special abilities.
 * @param {string[]} abilities - Array of ability names
 * @returns {{ atMod: number, paMod: number, awMod: number, tpMod: number, iniMod: number, beMod: number, details: string[] }}
 */
export function getAbilityModifiers(abilities) {
  if (!abilities || abilities.length === 0) return { atMod: 0, paMod: 0, awMod: 0, tpMod: 0, iniMod: 0, beMod: 0, details: [] }

  let atMod = 0, paMod = 0, awMod = 0, tpMod = 0, iniMod = 0, beMod = 0
  const details = []

  for (const name of abilities) {
    const ab = COMBAT_SPECIAL_ABILITIES[name]
    if (!ab) continue
    // Only apply passive bonuses here (not maneuvers — those are chosen per attack)
    if (ab.paBonus) { paMod += ab.paBonus; details.push(`${name}: +${ab.paBonus} PA`) }
    if (ab.awBonus) { awMod += ab.awBonus; details.push(`${name}: +${ab.awBonus} AW`) }
    if (ab.iniBonus) { iniMod += ab.iniBonus; details.push(`${name}: +${ab.iniBonus} INI`) }
    if (ab.beReduction) { beMod -= ab.beReduction; details.push(`${name}: BE -${ab.beReduction}`) }
    if (ab.fkMod && ab.fkMod > 0) { details.push(`${name}: Distanzabzüge -${ab.fkMod}`) }
  }

  return { atMod, paMod, awMod, tpMod, iniMod, beMod, details }
}

/**
 * Get maneuver modifiers for a specific chosen maneuver.
 */
export function getManeuverModifiers(maneuverName) {
  const ab = COMBAT_SPECIAL_ABILITIES[maneuverName]
  if (!ab) return null
  return {
    atMod: ab.atMod || 0,
    tpMod: ab.tpMod || 0,
    defMod: ab.defMod || 0,
    halveRS: ab.halveRS || false,
    tpMultiplier: ab.tpMultiplier || 1,
    desc: ab.desc,
  }
}

/**
 * Check if a weapon is holy (geweiht) and calculate damage multiplier vs target.
 */
export function getHolyDamageMultiplier(weapon, targetCategory) {
  const isHoly = weapon.properties?.includes('geweiht') || weapon.name?.toLowerCase().includes('geweiht')
  if (!isHoly) return 1
  if (targetCategory === 'untot' || targetCategory === 'daemon') return 2
  return 1
}

/**
 * Get weapon-specific AT/PA modifiers from properties.
 */
export function getWeaponPropertyModifiers(weapon) {
  const mods = { atMod: 0, paMod: 0, tpMod: 0, details: [] }
  const props = weapon.properties || []

  for (const prop of props) {
    const p = WEAPON_PROPERTIES[prop.toLowerCase?.() || prop]
    if (!p) continue
    if (p.atMod) { mods.atMod += p.atMod; mods.details.push(p.desc) }
    if (p.paMod) { mods.paMod += p.paMod; mods.details.push(p.desc) }
    if (p.tpMod) { mods.tpMod += p.tpMod; mods.details.push(p.desc) }
  }

  return mods
}
