/**
 * Centralized combat value computation.
 * Used by VitalsBar (header), ArmoryTab, CombatActions, and CharacterSheet.
 * Single source of truth for AT, PA, FK, AW, INI, GS, RS, BE, WS, SB.
 */
import useCharacterStore from '../stores/characterStore'
import useAuthStore from '../stores/authStore'
import { getConditionModifier } from '../engine/conditionsEngine'
import { useState, useEffect } from 'react'

const normName = s => s.toLowerCase().replace(/[\u00e4\u00f6\u00fc\u00df]/g, m => ({ '\u00e4':'ae','\u00f6':'oe','\u00fc':'ue','\u00df':'ss' }[m]||m))

const isWeaponName = n => /schwert|axt|dolch|bogen|messer|stab|kolben|speer|hammer|hellebarde|morgenstern|peitsche|keule|saebel|rapier|kriegsaxt|wurfaxt|armbrust|schleuder|rondrakamm/i.test(n)
const isArmorName = n => /ruestung|hemd|harnisch|panzer|gambeson|wams|platte|kleidung|robe|pelz|knochen|schienen|helm/i.test(n)
const isShieldName = n => /schild|buckler/i.test(n)

export default function useCombatValues() {
  const myCharacter = useCharacterStore((s) => s.myCharacter)
  const token = useAuthStore((s) => s.token)
  const [combatTechTemplates, setCombatTechTemplates] = useState([])

  useEffect(() => {
    if (!token) return
    fetch('/api/databank/combat_techniques', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : []).then(d => setCombatTechTemplates(Array.isArray(d) ? d : d.items || []))
      .catch(() => {})
  }, [token])

  if (!myCharacter) return null

  const cv = myCharacter.combat_values || {}
  const dv = myCharacter.derived_values || {}
  const attrs = myCharacter.attributes || {}
  const specials = myCharacter.special_abilities || []
  const charCT = myCharacter.combat_techniques || {}
  const weapons = cv.weapons || []
  const conditions = useCharacterStore.getState().getConditions?.() || []

  const rawInv = myCharacter.basis_inventory || []
  const items = Array.isArray(rawInv) ? rawInv : (rawInv.items || [])

  // KTW lookup
  const lookupKTW = (tech) => {
    if (!tech) return { ktw: 6, learned: false }
    // Check character's learned techniques
    for (const [tn, ktw] of Object.entries(charCT)) {
      if (normName(tn) === normName(tech) || tn.toLowerCase() === tech.toLowerCase()) return { ktw, learned: true }
    }
    // Check DB templates
    for (const tpl of combatTechTemplates) {
      if (normName(tpl.name) === normName(tech) || tpl.name.toLowerCase() === tech.toLowerCase()) return { ktw: 6, learned: false }
    }
    return { ktw: 6, learned: false }
  }

  // Equipped armor
  const eqArmor = items.filter(i => isArmorName(i.name) && i.equipped)
  const eqShield = items.find(i => isShieldName(i.name) && i.equipped)
  const computedRS = eqArmor.reduce((s, a) => s + (a.rs || 0), 0)
  const computedBE = eqArmor.reduce((s, a) => s + (a.be || 0), 0)
  const beRed = specials.some(s => /stungsgew.*II/i.test(s)) ? 2 : specials.some(s => /stungsgew/i.test(s)) ? 1 : 0
  const effBE = Math.max(0, computedBE - beRed)
  const shieldPA = eqShield ? (eqShield.pa_mod || 0) : 0

  // RS/BE from equipped armor only (no stale backend fallback)
  const rs = computedRS
  const be = effBE

  // Primary weapons (equipped only)
  const eqWeapons = items.filter(i => isWeaponName(i.name) && i.equipped)
  let primaryMelee = null
  let primaryRanged = null
  for (const inv of eqWeapons) {
    const m = weapons.find(w => inv.name.toLowerCase().includes(w.name.toLowerCase().split(' ')[0]))
    if (m && !m.ranged && !primaryMelee) primaryMelee = m
    if (m && m.ranged && !primaryRanged) primaryRanged = m
  }

  const kk = attrs.KK || 0
  const ko = attrs.KO || 0
  const ge = attrs.GE || 0
  const mu = attrs.MU || 0

  // Base values (with BE, without conditions)
  const baseAT = primaryMelee ? lookupKTW(primaryMelee.technique).ktw + (primaryMelee.at_mod || 0) - be : 0
  const basePA = primaryMelee ? Math.floor(lookupKTW(primaryMelee.technique).ktw / 2) + (primaryMelee.pa_mod || 0) + shieldPA - be : 0
  const baseFK = primaryRanged ? lookupKTW(primaryRanged.technique).ktw + (primaryRanged.at_mod || 0) - be : null
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

  // Final values (with conditions)
  const finalAT = baseAT + condAT
  const finalPA = basePA + condPA
  const finalFK = baseFK != null ? baseFK + condFK : null
  const finalAW = Math.max(0, baseAW + condAW)
  const finalINI = baseINI + condINI
  const finalGS = Math.max(0, baseGS + condGS)

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
    // Armor
    rs, be: effBE, computedRS, computedBE, beRed,
    // Derived
    wundschwelle, schadensbonus,
    // Weapons
    primaryMelee, primaryRanged, shieldPA,
    // Helpers
    lookupKTW, eqArmor, eqShield,
    // Conditions
    conditions, hasConditions: conditions.length > 0,
    // Raw
    attrs, dv, specials, items, weapons, charCT, combatTechTemplates,
  }
}
