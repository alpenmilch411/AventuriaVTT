/**
 * DSA5 Spell & Liturgy Resolution Engine
 *
 * Resolves spell/liturgy probes using the real 3d20-vs-attributes system:
 *   Roll 3d20, each against one attribute. Overshoot is compensated by FW/ZfW.
 *   If total overshoot > FW, the probe fails.
 *   QS = ceil(remaining FW / 3), min 1 on success.
 */

// ── Spell Database ──
// Maps spell key → { name, probe: [attr1, attr2, attr3], aspCost, damage?, effect?, tradition }
export const SPELL_DB = {
  ignifaxius:       { name: 'Ignifaxius', probe: ['MU','KL','KL'], aspCost: 8, damage: 'QSx1W6', damageType: 'feuer', tradition: 'Gildenmagie', desc: 'Feuerstrahl — QS x 1W6 Feuerschaden' },
  fulminictus:      { name: 'Fulminictus', probe: ['MU','KL','KL'], aspCost: 8, damage: 'QSx1W6+2', damageType: 'blitz', tradition: 'Gildenmagie', desc: 'Blitzschlag — QS x (1W6+2), +1 pro QS vs Metall' },
  balsam_salabunde: { name: 'Balsam Salabunde', probe: ['KL','IN','FF'], aspCost: 8, heal: 'QSx1W6', tradition: 'Gildenmagie', desc: 'Heilzauber — heilt QS x 1W6 LeP' },
  gardianum:        { name: 'Gardianum', probe: ['MU','KL','KL'], aspCost: 8, effect: 'magicShield', shieldRS: 'QSx2', tradition: 'Gildenmagie', desc: 'Magischer Schild — RS +QS*2 vs Magie' },
  odem_arcanum:     { name: 'Odem Arcanum', probe: ['KL','IN','IN'], aspCost: 2, effect: 'detectMagic', tradition: 'Gildenmagie', desc: 'Magie spüren in 8 Schritt Radius' },
  flim_flam:        { name: 'Flim Flam', probe: ['KL','IN','FF'], aspCost: 2, effect: 'light', tradition: 'Gildenmagie', desc: 'Magisches Licht erzeugen' },
  horriphobus:      { name: 'Horriphobus', probe: ['MU','IN','CH'], aspCost: 4, effect: 'fear', condition: 'Furcht I', vsProbe: 'MU', tradition: 'Gildenmagie', desc: 'Verursacht Furcht — Ziel MU-Probe oder Furcht I' },
  paralysis:        { name: 'Paralysis', probe: ['MU','KL','KL'], aspCost: 8, effect: 'paralyze', condition: 'Paralyse', duration: 'QS KR', vsProbe: 'ZK', tradition: 'Gildenmagie', desc: 'Lähmt Ziel — ZK-Probe oder QS KR gelähmt' },
}

// ── Liturgy Database ──
export const LITURGY_DB = {
  balsam:           { name: 'Balsam', probe: ['MU','IN','CH'], kapCost: 8, heal: '1W6+QS', tradition: 'Perainekirche', desc: 'Göttliche Heilung — 1W6+QS LeP' },
  heiliger_beistand:{ name: 'Heiliger Beistand', probe: ['MU','IN','CH'], kapCost: 4, effect: 'buff', buffStat: 'MU', buffValue: 'QS', duration: 'QS KR', tradition: 'Perainekirche', desc: 'MU +QS für QS Kampfrunden' },
  blendstrahl:      { name: 'Blendstrahl', probe: ['MU','KL','CH'], kapCost: 4, damage: '1W6', damageType: 'heilig', effect: 'blind', condition: 'Verblendet', duration: '1 KR', tradition: 'Praioskirche', desc: 'Heiliger Lichtstrahl — 1W6 heiligen Schaden, 1 KR verblendet' },
  friedvolle_aura:  { name: 'Friedvolle Aura', probe: ['MU','IN','CH'], kapCost: 8, effect: 'calmAura', tradition: 'Perainekirche', desc: 'Beruhigt Wesen in 5 Schritt — MU-Probe oder Kampfunfähig 1 KR' },
}

/**
 * Resolve a 3d20 talent/spell/liturgy probe.
 * @param {Object} attrs - Character attributes {MU:14, KL:15, ...}
 * @param {string[]} attrNames - Which 3 attributes to check, e.g. ['MU','KL','KL']
 * @param {number} fw - Fertigkeitswert (skill value / ZfW)
 * @param {number} mod - Modifier (positive = easier, negative = harder)
 * @param {Function} rollFn - Optional dice roller, defaults to random d20
 * @returns {{ rolls: number[], success: boolean, qs: number, remaining: number, details: string[] }}
 */
export function resolveProbe(attrs, attrNames, fw, mod = 0, rollFn = null) {
  const roll = rollFn || (() => Math.floor(Math.random() * 20) + 1)
  const rolls = [roll(), roll(), roll()]
  const details = []
  let remaining = fw

  // Apply modification to effective attribute values (DSA5: mod adjusts attributes, not rolls)
  for (let i = 0; i < 3; i++) {
    const attrVal = (attrs[attrNames[i]] || 10) + mod
    const overshoot = rolls[i] - attrVal
    if (overshoot > 0) {
      remaining -= overshoot
      details.push(`${attrNames[i]} ${attrs[attrNames[i]]}${mod ? (mod > 0 ? `+${mod}` : mod) : ''}: ${rolls[i]} → ${overshoot} über (${remaining} FP übrig)`)
    } else {
      details.push(`${attrNames[i]} ${attrs[attrNames[i]]}${mod ? (mod > 0 ? `+${mod}` : mod) : ''}: ${rolls[i]} ✓`)
    }
  }

  // Critical: triple-1 = automatic critical success
  if (rolls.filter(r => r === 1).length === 3) {
    return { rolls, success: true, qs: Math.max(1, Math.ceil(fw / 3)), remaining: fw, critical: true, details: [...details, 'Dreifach-1: Kritischer Erfolg!'] }
  }
  // Two 1s: critical only if the third die confirms (<= its modified attribute)
  const onesIndices = rolls.map((r, i) => r === 1 ? i : -1).filter(i => i >= 0)
  if (onesIndices.length === 2) {
    const thirdIdx = [0, 1, 2].find(i => !onesIndices.includes(i))
    const thirdAttrVal = (attrs[attrNames[thirdIdx]] || 10) + mod
    if (rolls[thirdIdx] <= thirdAttrVal) {
      return { rolls, success: true, qs: Math.max(1, Math.ceil(fw / 3)), remaining: fw, critical: true, details: [...details, `Doppel-1 bestätigt (${rolls[thirdIdx]} ≤ ${thirdAttrVal}): Kritischer Erfolg!`] }
    }
    // Unconfirmed double-1: still counts as a normal success (the probe itself may still pass or fail normally)
    details.push(`Doppel-1 nicht bestätigt (${rolls[thirdIdx]} > ${thirdAttrVal})`)
  }
  // Patzer: two or more 20s
  if (rolls.filter(r => r === 20).length >= 2) { return { rolls, success: false, qs: 0, remaining: -1, patzer: true, details: [...details, 'Doppel-20: Patzer!'] } }

  const success = remaining >= 0
  // DSA5 QS: FP 0 → QS1, FP 1-3 → QS1, FP 4-6 → QS2, FP 7-9 → QS3, etc.
  const qs = success ? Math.min(6, Math.max(1, remaining <= 0 ? 1 : Math.ceil(remaining / 3))) : 0

  return { rolls, success, qs, remaining, details }
}

/**
 * Resolve a spell cast: probe + AsP deduction + effect calculation.
 */
export function resolveSpell(spellKey, casterAttrs, zfw, mod = 0) {
  const spell = SPELL_DB[spellKey]
  if (!spell) return { error: `Unknown spell: ${spellKey}` }

  const probe = resolveProbe(casterAttrs, spell.probe, zfw, mod)

  const result = {
    spell,
    probe,
    aspCost: spell.aspCost,
    success: probe.success,
    qs: probe.qs,
  }

  if (probe.success && spell.damage) {
    // Calculate damage based on QS
    result.damageFormula = spell.damage.replace('QS', String(probe.qs))
    result.damageType = spell.damageType
  }
  if (probe.success && spell.heal) {
    result.healFormula = spell.heal.replace('QS', String(probe.qs))
  }
  if (probe.success && spell.condition) {
    result.condition = spell.condition
    result.conditionDuration = spell.duration?.replace('QS', String(probe.qs))
    result.vsProbe = spell.vsProbe
  }

  return result
}

/**
 * Resolve a liturgy cast: probe + KaP deduction + effect calculation.
 */
export function resolveLiturgy(liturgyKey, casterAttrs, lfw, mod = 0) {
  const lit = LITURGY_DB[liturgyKey]
  if (!lit) return { error: `Unknown liturgy: ${liturgyKey}` }

  const probe = resolveProbe(casterAttrs, lit.probe, lfw, mod)

  const result = {
    liturgy: lit,
    probe,
    kapCost: lit.kapCost,
    success: probe.success,
    qs: probe.qs,
  }

  if (probe.success && lit.heal) {
    result.healFormula = lit.heal.replace('QS', String(probe.qs))
  }
  if (probe.success && lit.damage) {
    result.damageFormula = lit.damage
    result.damageType = lit.damageType
  }
  if (probe.success && lit.effect === 'buff') {
    result.buff = { stat: lit.buffStat, value: probe.qs, duration: lit.duration?.replace('QS', String(probe.qs)) }
  }
  if (probe.success && lit.condition) {
    result.condition = lit.condition
    result.conditionDuration = lit.duration
  }

  return result
}

/**
 * Roll damage from a formula like "2x1W6" or "1W6+3" or "QS*1W6"
 */
export function rollSpellDamage(formula) {
  // Handle "NxMWS+B" patterns (e.g. "2x1W6+2" or "3x1W6")
  const multiMatch = formula.match(/(\d+)[x*](\d+)[Ww](\d+)([+-]\d+)?/)
  if (multiMatch) {
    const [, mult, count, sides, bonus] = multiMatch
    let total = parseInt(bonus || '0')
    for (let m = 0; m < parseInt(mult); m++) {
      for (let i = 0; i < parseInt(count); i++) {
        total += Math.floor(Math.random() * parseInt(sides)) + 1
      }
    }
    return Math.max(0, total)
  }

  // Standard "NWS+B" (e.g. "1W6+2")
  const stdMatch = formula.match(/(\d+)[Ww](\d+)([+-]\d+)?/)
  if (stdMatch) {
    let total = parseInt(stdMatch[3] || '0')
    for (let i = 0; i < parseInt(stdMatch[1]); i++) {
      total += Math.floor(Math.random() * parseInt(stdMatch[2])) + 1
    }
    return Math.max(0, total)
  }

  // Plain number
  return parseInt(formula) || 0
}
