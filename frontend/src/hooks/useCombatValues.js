/**
 * Centralized combat value computation hook.
 * Used by VitalsBar (header), ArmoryTab, CombatActions, and CharacterSheet.
 * Single source of truth for AT, PA, FK, AW, INI, GS, RS, BE, WS, SB.
 *
 * Delegates to the pure function in engine/combatComputation.js so that
 * the same logic can be reused by the GM overview without React hooks.
 */
const EMPTY_CONDITIONS = [] // stable reference to avoid re-render loops
const EMPTY_BUFFS = []
import useCharacterStore from '../stores/characterStore'
import useAuthStore from '../stores/authStore'
import { computeCombatStats } from '../engine/combatComputation'
import { useState, useEffect, useMemo } from 'react'

export default function useCombatValues() {
  const myCharacter = useCharacterStore((s) => s.myCharacter)
  const token = useAuthStore((s) => s.token)
  const [combatTechTemplates, setCombatTechTemplates] = useState([])
  const [armorTemplates, setArmorTemplates] = useState([])
  const [shieldTemplates, setShieldTemplates] = useState([])
  const [weaponTemplates, setWeaponTemplates] = useState([])

  useEffect(() => {
    if (!token) return
    const h = { Authorization: `Bearer ${token}` }
    const load = (path, setter) => fetch(`/api/databank/${path}`, { headers: h })
      .then(r => r.ok ? r.json() : []).then(d => setter(Array.isArray(d) ? d : d.items || []))
      .catch(() => {})
    load('combat_techniques', setCombatTechTemplates)
    load('armor', setArmorTemplates)
    load('shields', setShieldTemplates)
    load('weapons', setWeaponTemplates)
  }, [token])

  const conditions = useCharacterStore((s) => s.myCharacter?.conditions || EMPTY_CONDITIONS)
  const activeBuffs = useCharacterStore((s) => s.activeBuffs || EMPTY_BUFFS)
  const characterId = myCharacter?.id

  // Filter buffs for this character
  const charBuffs = useMemo(() => {
    if (!characterId || !activeBuffs.length) return EMPTY_BUFFS
    return activeBuffs.filter(b => b.characterId === characterId)
  }, [activeBuffs, characterId])

  return useMemo(() => {
    return computeCombatStats(myCharacter, { combatTechTemplates, armorTemplates, shieldTemplates, weaponTemplates }, charBuffs)
  }, [myCharacter, combatTechTemplates, armorTemplates, shieldTemplates, weaponTemplates, conditions, charBuffs])
}
