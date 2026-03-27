/**
 * Pure-function combat value computation.
 * Shared by useCombatValues (player hook) and PlayerOverview (GM view).
 *
 * Takes a character object + databank templates, returns all derived combat stats.
 * No React dependencies — can be called from any context.
 */
import { getConditionModifier } from './conditionsEngine'
import { findTemplate, isWeapon, isArmor, isShield } from './itemClassification'
import { getStatModifier } from './buffSystem'

const normName = s => s.toLowerCase().replace(/[\u00e4\u00f6\u00fc\u00df]/g, m => ({ '\u00e4':'ae','\u00f6':'oe','\u00fc':'ue','\u00df':'ss' }[m]||m))

/**
 * Compute all combat stats for a character.
 *
 * @param {object} char - Full character object (attributes, combat_values, derived_values, etc.)
 * @param {object} templates - { combatTechTemplates, armorTemplates, shieldTemplates, weaponTemplates }
 * @returns {object|null} All combat stats, or null if char is falsy
 */
export function computeCombatStats(char, templates = {}, activeBuffs = []) {
  if (!char) return null

  const { combatTechTemplates = [], armorTemplates = [], shieldTemplates = [], weaponTemplates = [] } = templates

  const cv = char.combat_values || {}
  const dv = char.derived_values || {}
  const rawAttrs = char.attributes || {}
  const specials = char.special_abilities || []
  const charCT = char.combat_techniques || {}
  const weapons = cv.weapons || []
  const conditions = char.conditions || []

  // Apply attribute buffs before any derived computation
  const now = Date.now()
  const buffs = activeBuffs.filter(b => !b.expiresAt || b.expiresAt > now)
  const attrs = { ...rawAttrs }
  for (const attr of ['MU', 'KL', 'IN', 'CH', 'FF', 'GE', 'KO', 'KK']) {
    const mod = getStatModifier(buffs, attr)
    if (mod !== 0) attrs[attr] = (attrs[attr] || 0) + mod
  }

  const rawInv = char.basis_inventory || []
  const items = Array.isArray(rawInv) ? rawInv : (rawInv.items || [])

  // KTW lookup
  const lookupKTW = (tech) => {
    if (!tech) return { ktw: 6, learned: false }
    for (const [tn, ktw] of Object.entries(charCT)) {
      if (normName(tn) === normName(tech) || tn.toLowerCase() === tech.toLowerCase()) return { ktw, learned: true }
    }
    for (const tpl of combatTechTemplates) {
      if (normName(tpl.name) === normName(tech) || tpl.name.toLowerCase() === tech.toLowerCase()) return { ktw: 6, learned: false }
    }
    return { ktw: 6, learned: false }
  }

  const tplBag = { weaponTemplates, armorTemplates, shieldTemplates }

  // Find template for an item (by template_id first, then name fallback)
  const tplFor = (item) => findTemplate(item, tplBag)

  // Equipped armor, shields, weapons — classified by DB template
  const eqArmor = items.filter(i => i.equipped && isArmor(i, tplBag))
  const eqShield = items.find(i => i.equipped && isShield(i, tplBag))
  const computedRS = eqArmor.reduce((s, a) => s + (a.rs ?? tplFor(a)?.template?.rs ?? 0), 0)
  const computedBE = eqArmor.reduce((s, a) => s + (a.be ?? tplFor(a)?.template?.be ?? 0), 0)
  const beRed = specials.some(s => /stungsgew.*II/i.test(s)) ? 2 : specials.some(s => /stungsgew/i.test(s)) ? 1 : 0
  const effBE = Math.max(0, computedBE - beRed)
  const shieldTpl = eqShield ? tplFor(eqShield)?.template : null
  const shieldPA = eqShield ? (eqShield.pa_mod ?? shieldTpl?.pa_mod ?? 0) : 0
  const shieldAT = eqShield ? (eqShield.at_mod ?? shieldTpl?.at_mod ?? 0) : 0

  const rs = computedRS
  const be = effBE

  // Primary weapons (equipped only) — classified by DB template
  const eqWeapons = items.filter(i => i.equipped && isWeapon(i, tplBag))
  let primaryMelee = null
  let primaryRanged = null
  for (const inv of eqWeapons) {
    let m = weapons.find(w => inv.name.toLowerCase().includes(w.name.toLowerCase().split(' ')[0]))
    if (!m) {
      const result = tplFor(inv)
      const tpl = result?.type === 'weapon' ? result.template : null
      if (tpl) m = { name: inv.name, technique: tpl.technique || tpl.combat_technique, at_mod: 0, pa_mod: 0, ranged: tpl.ranged || false }
    }
    if (m && !m.ranged && !primaryMelee) primaryMelee = m
    if (m && m.ranged && !primaryRanged) primaryRanged = m
  }

  const kk = attrs.KK || 0
  const ko = attrs.KO || 0
  const ge = attrs.GE || 0
  const mu = attrs.MU || 0

  // Base values (with BE, without conditions)
  const baseAT = primaryMelee ? lookupKTW(primaryMelee.technique).ktw + (primaryMelee.at_mod || 0) - shieldAT - be : 0
  const basePA = primaryMelee ? Math.floor(lookupKTW(primaryMelee.technique).ktw / 2) + (primaryMelee.pa_mod || 0) + shieldPA - be : 0
  const baseFK = primaryRanged ? lookupKTW(primaryRanged.technique).ktw + (primaryRanged.at_mod || 0) : null
  const baseAW = Math.max(0, (dv.AW || Math.floor(ge / 2)) - be)
  const baseINI = (dv.INI_basis || Math.floor((mu + ge) / 2)) - be
  const baseGS = Math.max(0, (dv.GS || 8) - be)

  // Condition modifiers
  const condAT = getConditionModifier(conditions, 'AT')
  const condPA = getConditionModifier(conditions, 'PA')
  const condFK = getConditionModifier(conditions, 'FK')
  const condAW = getConditionModifier(conditions, 'AW')
  const condINI = getConditionModifier(conditions, 'INI')
  const condGS = getConditionModifier(conditions, 'GS')

  // Direct stat buffs (e.g. buff with stat:"AT" adds directly)
  const buffAT = getStatModifier(buffs, 'AT')
  const buffPA = getStatModifier(buffs, 'PA')
  const buffFK = getStatModifier(buffs, 'FK')
  const buffAW = getStatModifier(buffs, 'AW')
  const buffINI = getStatModifier(buffs, 'INI')
  const buffGS = getStatModifier(buffs, 'GS')
  const buffRS = getStatModifier(buffs, 'RS')

  // Final values (with conditions + buffs)
  const finalAT = baseAT + condAT + buffAT
  const finalPA = basePA + condPA + buffPA
  const finalFK = baseFK != null ? baseFK + condFK + buffFK : null
  const finalAW = Math.max(0, baseAW + condAW + buffAW)
  const finalINI = baseINI + condINI + buffINI
  const finalGS = Math.max(0, baseGS + condGS + buffGS)

  // Derived
  const wundschwelle = Math.ceil(ko / 2)
  const schadensbonus = Math.max(0, Math.floor((kk - 15) / 3))

  return {
    // Final (what to display)
    at: finalAT, pa: finalPA, fk: finalFK, aw: finalAW, ini: finalINI, gs: finalGS,
    // Base (before conditions, for delta display)
    baseAT, basePA, baseFK, baseAW, baseINI, baseGS,
    // Condition modifiers
    condAT, condPA, condFK, condAW, condINI, condGS,
    // Buff modifiers
    buffAT, buffPA, buffFK, buffAW, buffINI, buffGS, buffRS,
    // Armor (RS includes buff)
    rs: rs + buffRS, be: effBE, computedRS, computedBE, beRed,
    // Derived
    wundschwelle, schadensbonus,
    // Weapons
    primaryMelee, primaryRanged, shieldPA, shieldAT,
    // Helpers
    lookupKTW, eqArmor, eqShield,
    // Conditions
    conditions, hasConditions: conditions.length > 0,
    // Buffs
    activeBuffs: buffs,
    // Raw
    attrs, dv, specials, items, weapons, charCT, combatTechTemplates,
  }
}
