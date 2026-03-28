import { useState, useEffect, useRef } from 'react'
import {
  Swords, Shield, Footprints, Sparkles, Package, ArrowRight,
  LogOut, Dice5, ChevronRight, X, Heart, AlertTriangle,
  Target, Crosshair, Eye, Zap, Check, Sun, Clock
} from 'lucide-react'
import useCombatStore from '../../stores/combatStore'
import useCharacterStore from '../../stores/characterStore'
import useAuthStore from '../../stores/authStore'
import { resolveItemEffect, classifyItem } from '../../engine/itemEffects'
import { confirmCritical, lookupFumble } from '../../engine/criticalTables'
import { createBuff, getStatModifier } from '../../engine/buffSystem'
import { getConditionModifier, isIncapacitated, calculatePainLevel, addCondition, formatConditions, getConditionBreakdown } from '../../engine/conditionsEngine'
import { getCreatureAttackModifiers, getOnHitEffects, getImmunities, getDamageMultiplier, getRoundStartEffects } from '../../engine/creatureRules'
import { getReachModifier, getAbilityModifiers, getManeuverModifiers, getHolyDamageMultiplier, getRangedDistanceMod } from '../../engine/weaponProperties'
import { MANEUVERS } from '../../engine/combatManeuvers'
import Badge from '../../components/common/Badge'
import { ATTR_NAMES, ATTR_TEXT_COLORS } from '../../constants/attributes'
import clsx from 'clsx'

/**
 * DSA5 Turn Flow — Step-by-step combat turn resolution.
 *
 * Steps:
 * 1. AKTION WAEHLEN — what does this combatant do?
 * 2. TARGET — who/what is the target?
 * 3. MANOEVER — optional combat maneuver
 * 4. ANGRIFF — roll AT (attacker rolls 1W20)
 * 5. VERTEIDIGUNG — defender reacts (Parade/Ausweichen)
 * 6. SCHADEN — roll damage, apply RS, deduct LeP
 * 7. ZUSTAENDE — check pain thresholds, death
 *
 * Props:
 * - combatant: the active combatant object
 * - battleId: current battle
 * - allCombatants: all combatants in this battle (for target selection)
 * - onComplete: called when turn is resolved
 * - sendMessage: WebSocket send
 */

const ACTIONS = [
  { id: 'melee', icon: Swords, label: 'Nahkampfangriff', desc: 'Greife ein Ziel in Waffenreichweite an.', cost: '1 Aktion' },
  { id: 'ranged', icon: Target, label: 'Fernkampfangriff', desc: 'Schieße auf ein Ziel mit einer Fernkampfwaffe.', cost: '1 Aktion' },
  { id: 'spell', icon: Sparkles, label: 'Zauber wirken', desc: 'Wirke einen Zauberspruch (kostet AsP).', cost: '1+ Aktionen' },
  { id: 'liturgy', icon: Sun, label: 'Liturgie wirken', desc: 'Wirke eine Liturgie oder Zeremonie (kostet KaP).', cost: '1+ Aktionen' },
  { id: 'item', icon: Package, label: 'Gegenstand benutzen', desc: 'Einen Gegenstand einsetzen (Trank, Werkzeug).', cost: '1 Aktion' },
  { id: 'move', icon: Footprints, label: 'Volle Bewegung', desc: 'Bewege dich bis zu doppelter GS (statt Angriff).', cost: '1 Aktion' },
  { id: 'ready', icon: Eye, label: 'Bereithalten', desc: 'Spare deine Aktion auf und reagiere später.', cost: '1 Aktion' },
  { id: 'disengage', icon: LogOut, label: 'Vom Kampf lösen', desc: 'Körperbeherrschung-Probe um ohne Passierschlag zu fliehen.', cost: '1 Aktion + Probe' },
  { id: 'nothing', icon: X, label: 'Nichts tun', desc: 'Dieser Kämpfer wartet ab oder ist handlungsunfähig.', cost: 'Keine' },
  { id: 'switch_weapon', icon: ArrowRight, label: 'Waffe wechseln', desc: 'Waffe ziehen oder wechseln.', cost: '1 Aktion' },
]

// MANEUVERS imported from '../../engine/combatManeuvers'

const DEFENSE_OPTIONS = [
  { id: 'parade', icon: Shield, label: 'Parade', desc: 'Verteidigung mit der Waffe. Würfle 1W20 gegen PA-Wert.' },
  { id: 'ausweichen', icon: Footprints, label: 'Ausweichen', desc: 'Dem Angriff ausweichen. Würfle 1W20 gegen AW-Wert. Funktioniert immer, auch ohne Waffe.' },
  { id: 'accept', icon: X, label: 'Treffer akzeptieren', desc: 'Keine Verteidigung — der Angriff trifft automatisch.' },
]

export default function TurnFlow({ combatant, battleId, allCombatants, onComplete, sendMessage, approvedAction }) {
  const updateCombatant = useCombatStore((s) => s.updateCombatant)
  const addBattleLogEntry = useCombatStore((s) => s.addBattleLogEntry)

  const enemies = allCombatants.filter(c => c.id !== combatant.id && (c.lep ?? c.lepMax ?? 0) > 0)

  // If player already chose an action, skip to the right step
  const getInitialTarget = () => {
    if (approvedAction?.target_id) {
      return enemies.find(c => c.id === approvedAction.target_id || c.name === approvedAction.target_name) || null
    }
    return null
  }
  const getInitialManeuver = () => {
    if (approvedAction?.maneuver) {
      return MANEUVERS.find(m => m.id === approvedAction.maneuver.id) || approvedAction.maneuver
    }
    return MANEUVERS[0]
  }
  const getInitialStep = () => {
    if (!approvedAction) return 'action'
    if (approvedAction.type === 'attack' && approvedAction.target_id) return 'attack' // Skip to dice roll
    if (approvedAction.type === 'attack') return 'target'
    return 'action'
  }

  // Step state
  const [step, setStep] = useState(getInitialStep)
  const [selectedAction, setSelectedAction] = useState(approvedAction?.type === 'attack' ? ACTIONS.find(a => a.id === 'melee') : null)
  const [selectedTarget, setSelectedTarget] = useState(getInitialTarget)
  const [selectedWeapon, setSelectedWeapon] = useState(null) // { name, damage, at, pa, reach, isRanged }
  const [rangeDistance, setRangeDistance] = useState('mittel') // nah, mittel, weit, extrem
  const [selectedManeuver, setSelectedManeuver] = useState(getInitialManeuver)
  const [attackRoll, setAttackRoll] = useState('')
  const [attackResult, setAttackResult] = useState(null) // { hit, critical, patzer }
  const [defenseType, setDefenseType] = useState(null)
  const [defenseRoll, setDefenseRoll] = useState('')
  const [defenseResult, setDefenseResult] = useState(null)
  const [damageRoll, setDamageRoll] = useState('')
  const [damageResult, setDamageResult] = useState(null)
  const [offHandDone, setOffHandDone] = useState(false) // tracks if off-hand attack has been used this turn
  const [confirmRoll, setConfirmRoll] = useState('') // confirmation roll for critical/Patzer
  const [gmIntervene, setGmIntervene] = useState(false) // GM takes over player turn
  const [confirmResult, setConfirmResult] = useState(null) // { confirmed, type: 'critical'|'patzer' }
  const [fumbleRoll, setFumbleRoll] = useState('') // 2W6 roll for fumble table
  const [fumbleResult, setFumbleResult] = useState(null) // lookupFumble result
  const [criticalConfirmed, setCriticalConfirmed] = useState(false) // doubles damage in damage step

  // Spell/liturgy casting state
  const [selectedSpell, setSelectedSpell] = useState(null) // { name, fw, probe, cost, template }
  const [spellModifier, setSpellModifier] = useState(0)
  const [spellRolls, setSpellRolls] = useState(['', '', ''])
  const [spellResult, setSpellResult] = useState(null) // { success, qs, fpRemaining, rolls, details }
  const [isLiturgy, setIsLiturgy] = useState(false)
  const [spellTemplates, setSpellTemplates] = useState({}) // name → template from databank
  const [liturgyTemplates, setLiturgyTemplates] = useState({})
  const [spellTemplatesLoaded, setSpellTemplatesLoaded] = useState(false)

  // Item use state (declared here to satisfy React hooks rules — used in 'use_item' step)
  const [selectedItem, setSelectedItem] = useState(null)
  const [itemEffect, setItemEffect] = useState(null) // resolveItemEffect result
  const [itemRoll, setItemRoll] = useState('')
  const [itemTargets, setItemTargets] = useState([]) // for AoE: array of target IDs
  const [poisonApplyMode, setPoisonApplyMode] = useState(false) // selecting weapon for poison

  // Track reactions this round
  const targetReactionCount = selectedTarget
    ? (selectedTarget._reactionsThisRound || 0)
    : 0

  const isPlayerTurn = !combatant.isNPC
  const isTargetPlayer = selectedTarget && !selectedTarget.isNPC
  const autoSentRef = useRef({}) // track which auto-sends we've done
  const spellCostDeductedRef = useRef(false) // track if spell cost was deducted
  const lastDiceResult = useCombatStore((s) => s.lastDiceResult)

  // Clean up stale dice results on unmount
  useEffect(() => {
    return () => { useCombatStore.getState().clearLastDiceResult() }
  }, [])

  // Lazy-load spell/liturgy templates from databank when entering spell steps
  const token = useAuthStore((s) => s.token)
  useEffect(() => {
    if (spellTemplatesLoaded || !token) return
    if (step !== 'spell_select') return
    const h = { Authorization: `Bearer ${token}` }
    Promise.all([
      fetch('/api/databank/spells', { headers: h }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/databank/liturgies', { headers: h }).then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([sl, ll]) => {
      const spells = Array.isArray(sl) ? sl : sl.items || []
      const lits = Array.isArray(ll) ? ll : ll.items || []
      const sMap = {}
      for (const s of spells) {
        const key = s.name.toLowerCase().replace(/\s+/g, '_')
        sMap[key] = { probe: s.probe || [], cost: parseInt(s.asp_cost) || 0, time: s.casting_time || '?', range: s.range || '?', duration: s.duration || '?', desc: s.description || s.effect || '', target: s.target || '', damage: s.damage || '', effect_per_qs: s.effect_per_qs || null }
      }
      const lMap = {}
      for (const l of lits) {
        const key = l.name.toLowerCase().replace(/\s+/g, '_')
        lMap[key] = { probe: l.probe || [], cost: parseInt(l.kap_cost) || 0, time: l.casting_time || '?', range: l.range || '?', duration: l.duration || '?', desc: l.description || l.effect || '', target: l.target || '', damage: l.damage || '', effect_per_qs: l.effect_per_qs || null }
      }
      setSpellTemplates(sMap)
      setLiturgyTemplates(lMap)
      setSpellTemplatesLoaded(true)
    })
  }, [step, token, spellTemplatesLoaded])

  // Auto-process incoming dice results from players
  useEffect(() => {
    if (!lastDiceResult) return
    // Process results from: attacking player (isPlayerTurn) OR defending player (isTargetPlayer)
    if (!isPlayerTurn && !isTargetPlayer) return
    const r = lastDiceResult

    if (step === 'attack' && r.request_type === 'attack' && !attackResult) {
      const roll = r.value
      if (roll >= 1 && roll <= 20) {
        setAttackRoll(String(roll))
        const effectiveATVal = (combatant.at || 12) + (selectedManeuver?.atMod || 0)
        const hit = roll <= effectiveATVal
        const critical = roll === 1
        const patzer = roll === 20
        setAttackResult({ hit, critical, patzer, roll })
        addBattleLogEntry(battleId, {
          type: critical ? 'critical' : patzer ? 'fumble' : hit ? 'attack' : 'miss',
          text: `${combatant.name} greift ${selectedTarget?.name} an: ${roll} ${hit ? '≤' : '>'} ${effectiveATVal} — ${critical ? 'KRITISCH!' : patzer ? 'PATZER!' : hit ? 'Treffer!' : 'Daneben!'}`,
        })
        useCombatStore.getState().clearLastDiceResult()
        if (hit) {
          setStep('defense')
        } else {
          setTimeout(onComplete, 1500)
        }
      }
    } else if (step === 'defense' && r.request_type === 'defense' && !defenseResult) {
      const roll = r.value
      if (roll >= 1 && roll <= 20) {
        setDefenseRoll(String(roll))
        const defType = r.defense_type || defenseType?.id || 'parade'
        const pa = (selectedTarget?.pa || 8) + (selectedTarget?._reactionsThisRound || 0) * -3 + (selectedManeuver?.defMod || 0)
        const aw = (selectedTarget?.aw || 5) + (selectedTarget?._reactionsThisRound || 0) * -3
        const targetVal = defType === 'ausweichen' ? aw : pa
        const defLabel = defType === 'ausweichen' ? 'Ausweichen' : 'Parade'
        const success = roll <= targetVal
        setDefenseResult({ success, roll })
        addBattleLogEntry(battleId, {
          type: success ? 'defense' : 'damage',
          text: `${selectedTarget?.name} ${defLabel}: ${roll} ${success ? '≤' : '>'} ${targetVal} — ${success ? 'Gelingt!' : 'Misslingt!'}`,
        })
        sendMessage?.({ type: 'combat_log_entry', payload: {
          type: success ? 'defense' : 'damage',
          text: `${selectedTarget?.name} ${defLabel}: ${success ? 'Verteidigung gelingt!' : 'Verteidigung misslingt!'}`,
        }})
        if (selectedTarget) {
          selectedTarget._reactionsThisRound = (selectedTarget._reactionsThisRound || 0) + 1
        }
        useCombatStore.getState().clearLastDiceResult()
        if (success) {
          setTimeout(onComplete, 1500)
        } else {
          setStep('damage')
          // If the attacker is a player, send them a damage dice_request
          if (isPlayerTurn) {
            sendMessage?.({
              type: 'dice_request',
              payload: {
                target_user_id: combatant.userId || combatant.characterId || combatant.id,
                type: 'damage',
                dice: weaponDamage,
                label: `Schaden würfeln: ${weaponDamage}`,
              },
            })
          }
        }
      }
    } else if (step === 'damage' && r.request_type === 'damage' && !damageResult) {
      const total = r.value
      if (total >= 1) {
        useCombatStore.getState().clearLastDiceResult()
        // Auto-apply damage from player rolls — with multipliers from engines
        const maneuverTP = selectedManeuver?.tpMod || 0
        const halveRS = selectedManeuver?.halveRS || false
        const ignoreRS = selectedManeuver?.ignoreRS || 0
        const effectiveRS = Math.max(0, (halveRS ? Math.floor(targetRS / 2) : targetRS) - ignoreRS)
        const raw = total + maneuverTP
        // Apply highest applicable multiplier (holy OR vulnerability, not both — DSA5)
        let dmgMult = creatureDmgMult === 0 ? 0 : Math.max(1, holyMultiplier, creatureDmgMult)
        if (selectedManeuver?.doubleDamage) dmgMult = Math.max(dmgMult, 2)
        if (criticalConfirmed) dmgMult = Math.max(dmgMult, 2)
        const noDamage = selectedManeuver?.noDamage || false
        const sp = noDamage ? 0 : (creatureDmgMult === 0 ? 0 : Math.max(0, Math.floor((raw - effectiveRS) * dmgMult)))
        const oldLep = selectedTarget?.lep ?? selectedTarget?.lepMax ?? 30
        const newLep = Math.max(0, oldLep - sp)

        updateCombatant(selectedTarget.id, { lep: newLep })

        // Build damage log with modifier details + damage type
        const dmgType = activeWeapon.damageType || (holyMultiplier > 1 ? 'heilig' : '')
        const dmgParts = [`${raw} TP`]
        if (dmgType) dmgParts.push(`[${dmgType}]`)
        if (maneuverTP) dmgParts.push(`(+${maneuverTP} Manöver)`)
        dmgParts.push(`- ${effectiveRS} RS${halveRS ? ' (halbiert)' : ''}${ignoreRS ? ` (-${ignoreRS} ignoriert)` : ''}`)
        if (noDamage) dmgParts.push('(kein Schaden — Entwaffnen)')
        if (dmgMult > 1) dmgParts.push(`x${dmgMult}${holyMultiplier > 1 ? ' geweiht' : ''}${selectedManeuver?.doubleDamage ? ' Todesstoß' : ''}${criticalConfirmed ? ' KRITISCH' : ''}`)
        if (creatureDmgMult === 0) dmgParts.push('(IMMUN)')
        const dmgText = `${combatant.name} trifft ${selectedTarget.name} für ${sp} SP! [${dmgParts.join(' ')}] (LeP: ${oldLep} → ${newLep})`

        addBattleLogEntry(battleId, { type: 'damage', text: dmgText })
        sendMessage?.({ type: 'vitals_update', payload: { character_id: selectedTarget.characterId || selectedTarget.id, token_id: selectedTarget.id, vitals: { lep: newLep } } })
        sendMessage?.({ type: 'combat_log_entry', payload: { type: 'damage', text: dmgText } })

        // Apply on-hit effects (poison, paralysis, knockdown)
        for (const eff of onHitEffects) {
          if (eff.condition) {
            const logText = `${eff.desc || eff.condition} — ${selectedTarget.name} muss ${eff.vsProbe}-Probe bestehen!`
            addBattleLogEntry(battleId, { type: 'system', text: logText })
            sendMessage?.({ type: 'combat_log_entry', payload: { type: 'system', text: logText } })
          }
        }

        // Weapon poison trigger — if the weapon is poisoned and hit dealt SP > 0
        if (combatant.poisonedWeapon && sp > 0) {
          const pw = combatant.poisonedWeapon
          if (pw.weaponName === activeWeapon.name || !pw.weaponName) {
            const poisonLog = `☠ ${selectedTarget.name} wurde mit ${pw.poisonName} (Stufe ${pw.stufe}) vergiftet! ZK-Probe${pw.zkMod ? ` ${pw.zkMod}` : ''} nötig. ${pw.damage || ''}`
            addBattleLogEntry(battleId, { type: 'system', text: poisonLog })
            sendMessage?.({ type: 'combat_log_entry', payload: { type: 'system', text: poisonLog } })
            // Consume one application
            const remaining = (pw.hitsRemaining || 1) - 1
            if (remaining <= 0) {
              updateCombatant(combatant.id, { poisonedWeapon: null })
              addBattleLogEntry(battleId, { type: 'system', text: `Gift auf ${pw.weaponName} verbraucht.` })
            } else {
              updateCombatant(combatant.id, { poisonedWeapon: { ...pw, hitsRemaining: remaining } })
            }
          }
        }

        // Check pain threshold and apply Schmerz condition
        {
          const targetCharData = useCharacterStore.getState().allCharacters.find(c => c.id === selectedTarget?.characterId)
          const targetKO = targetCharData?.attributes?.KO
          const painLevel = calculatePainLevel(newLep, selectedTarget?.lepMax || 30, targetKO)
          const oldPainLevel = calculatePainLevel(oldLep, selectedTarget?.lepMax || 30, targetKO)
          if (newLep <= 0) {
            addBattleLogEntry(battleId, { type: 'critical', text: `${selectedTarget.name} fällt bewusstlos!` })
            const updConds = addCondition(selectedTarget?.conditions || [], 'Bewusstlos', 1)
            updateCombatant(selectedTarget.id, { conditions: updConds })
            if (selectedTarget?.characterId) {
              sendMessage?.({ type: 'conditions_update', payload: { character_id: selectedTarget.characterId, conditions: updConds } })
            }
          } else if (painLevel > oldPainLevel) {
            addBattleLogEntry(battleId, { type: 'system', text: `${selectedTarget.name}: Schmerz ${['','I','II','III','IV'][painLevel]} (Wundschwelle überschritten)` })
            sendMessage?.({ type: 'combat_log_entry', payload: { type: 'system', text: `${selectedTarget.name}: Schmerz ${['','I','II','III','IV'][painLevel]}` } })
            let updConds = [...(selectedTarget?.conditions || [])]
            const existingPain = updConds.find(c => c.name === 'Schmerz')
            if (existingPain) {
              existingPain.level = Math.max(existingPain.level || 1, painLevel)
            } else {
              updConds.push({ name: 'Schmerz', level: painLevel })
            }
            updateCombatant(selectedTarget.id, { conditions: updConds })
            if (selectedTarget?.characterId) {
              sendMessage?.({ type: 'conditions_update', payload: { character_id: selectedTarget.characterId, conditions: updConds } })
            }
          }
        }

        setDamageResult({ sp, newLep, dmgMult, onHitEffects })
        // If dual-wielding and off-hand not used yet, offer off-hand attack instead of ending turn
        if (canDualAttack && !activeWeapon._isOffHand) {
          setTimeout(() => setStep('offhand_prompt'), 1500)
        } else {
          setTimeout(onComplete, 1500)
        }
      }
    } else if (step === 'spell_roll' && r.request_type === 'spell_probe' && !spellResult && selectedSpell) {
      // Player sent their 3W20 spell probe rolls
      const rolls = r.rolls || []
      if (rolls.length === 3 && rolls.every(v => v >= 1 && v <= 20)) {
        useCombatStore.getState().clearLastDiceResult()
        const charData = useCharacterStore.getState().allCharacters.find(c => c.id === combatant.characterId)
          || useCharacterStore.getState().myCharacter
        const attrs = combatant.attributes || charData?.attributes || {}
        const probeAttrs = selectedSpell.probe
        const targets = probeAttrs.map(a => (attrs[a] || 10) + spellModifier)
        let fpUsed = 0
        const details = rolls.map((roll, i) => {
          const target = targets[i]
          const over = Math.max(0, roll - target)
          fpUsed += over
          return { attr: probeAttrs[i], target, roll, over, ok: roll <= target }
        })
        const fpRemaining = selectedSpell.fw - fpUsed
        const success = fpRemaining >= 0
        const qs = success ? Math.max(1, Math.ceil(Math.max(0, fpRemaining) / 3)) : 0
        const ones = rolls.filter(v => v === 1).length
        const twenties = rolls.filter(v => v === 20).length
        const critical = ones >= 2
        const patzer = twenties >= 2
        setSpellRolls(rolls.map(String))
        setSpellResult({ success, qs, fpRemaining, rolls, details, critical, patzer })
        const resultText = critical ? 'KRITISCHER ERFOLG!' : patzer ? 'PATZER!' : success ? `Gelungen! QS ${qs}` : 'Misslungen!'
        addBattleLogEntry(battleId, { type: success ? 'system' : 'miss', text: `${combatant.name} ${isLiturgy ? 'Liturgie' : 'Zauber'} "${selectedSpell.name}": [${rolls.join(', ')}] — ${resultText}` })
        sendMessage?.({ type: 'combat_log_entry', payload: { type: success ? 'system' : 'miss', text: `${combatant.name} ${isLiturgy ? 'Liturgie' : 'Zauber'} "${selectedSpell.name}": ${resultText}` } })
        setStep('spell_result')
      }
    }
  }, [lastDiceResult])

  // Auto-send dice requests to players when entering relevant steps
  useEffect(() => {
    if (!isPlayerTurn || !selectedTarget) return
    const maneuver = selectedManeuver?.id !== 'none' ? selectedManeuver : null
    // Use selectedWeapon AT if available (important for off-hand attacks with penalty)
    const weaponAT = selectedWeapon?.at || combatant.at || 12
    const effectiveATVal = weaponAT + (maneuver?.atMod || 0)
    const isOffHand = selectedWeapon?._isOffHand

    if (step === 'attack' && !autoSentRef.current.attack) {
      autoSentRef.current.attack = true
      sendMessage?.({
        type: 'dice_request',
        payload: {
          target_user_id: combatant.userId || combatant.characterId || combatant.id,
          type: 'attack',
          label: `${isOffHand ? 'Nebenhand-' : ''}Attacke auf ${selectedTarget?.name} — Würfle 1W20 (Zielwert: ${effectiveATVal})${maneuver ? ` [${maneuver.label}]` : ''}${isOffHand ? ' [Nebenhand]' : ''}`,
          dice: '1W20',
          target_value: effectiveATVal,
        },
      })
    }
  }, [step, isPlayerTurn, selectedTarget])

  // Damage dice_request to player is sent from the defense-failure handler above,
  // not here, to avoid duplicates.

  // Defense dice_request is NOT sent here — the defense_request auto-send
  // in the defense step already prompts the player to pick Parade/Ausweichen and roll.

  // Build available weapons from combatant data
  const availableWeapons = (() => {
    const weapons = []
    // Primary weapon
    if (combatant.weaponName || combatant.at) {
      weapons.push({
        name: combatant.weaponName || 'Waffe',
        damage: combatant.weaponDamage || combatant.damage || '1W6+4',
        at: combatant.at || 12,
        pa: combatant.pa || 8,
        reach: combatant.weaponReach || 'mittel',
        isRanged: false,
      })
    }
    // Additional attacks (from creatures/NPCs with multiple weapons)
    if (combatant.attacks?.length > 0) {
      for (const atk of combatant.attacks) {
        // Skip if it's the same as primary
        if (atk.name === combatant.weaponName && weapons.length > 0) continue
        weapons.push({
          name: atk.name || 'Angriff',
          damage: atk.damage || atk.TP || atk.tp || '1W6+4',
          at: atk.at || atk.AT || combatant.at || 12,
          pa: atk.pa || atk.PA || combatant.pa || 8,
          reach: atk.reach || atk.reichweite || 'mittel',
          isRanged: atk.is_ranged || atk.isRanged || (atk.reach === 'fern') || false,
        })
      }
    }
    // If no weapons at all, create a default
    if (weapons.length === 0) {
      weapons.push({ name: 'Unbewaffnet', damage: '1W6', at: combatant.at || 10, pa: combatant.pa || 6, reach: 'kurz', isRanged: false })
    }
    return weapons
  })()

  // Use selected weapon or fall back to first
  const activeWeapon = selectedWeapon || availableWeapons[0]

  // Dual-wield detection
  const combatantSpecials = combatant.specialAbilities || combatant.specials || []
  const hasBeidhaendigSF = combatantSpecials.some(s => /beidh/i.test(s))
  const beidhaendigPenalty = combatantSpecials.some(s => /beidh.*II|beidh.*2/i.test(s)) ? -2 : hasBeidhaendigSF ? -4 : 0
  const meleeWeaponsList = availableWeapons.filter(w => !w.isRanged)
  const canDualAttack = hasBeidhaendigSF && meleeWeaponsList.length >= 2 && !offHandDone

  // Active buffs for attacker and defender (subscribe reactively)
  const activeBuffs = useCharacterStore((s) => s.activeBuffs)
  const attackerBuffs = activeBuffs.filter(b => b.characterId === (combatant.characterId || combatant.id) && b.expiresAt > Date.now())
  const defenderBuffs = selectedTarget ? activeBuffs.filter(b => b.characterId === (selectedTarget.characterId || selectedTarget.id) && b.expiresAt > Date.now()) : []

  // Conditions
  const attackerConditions = combatant.conditions || []
  const defenderConditions = selectedTarget?.conditions || []
  const atkCondMod = getConditionModifier(attackerConditions, 'AT')
  const defCondModPA = getConditionModifier(defenderConditions, 'PA')
  const defCondModAW = getConditionModifier(defenderConditions, 'AW')

  // Creature special rules (pack tactics, etc.)
  const creatureMods = getCreatureAttackModifiers(combatant, allCombatants)

  // Weapon properties + special abilities
  const abilityMods = getAbilityModifiers(combatant.specialAbilities || combatant.specials || [])
  const defenderAbilityMods = selectedTarget ? getAbilityModifiers(selectedTarget.specialAbilities || selectedTarget.specials || []) : { atMod: 0, paMod: 0, awMod: 0, tpMod: 0, iniMod: 0, beMod: 0, details: [] }
  const reachMod = selectedTarget ? getReachModifier(activeWeapon.reach, selectedTarget.weaponReach || 'mittel') : 0

  // Combatant stats — weapon + buffs + conditions + creature rules + abilities
  const weaponDamage = activeWeapon.damage
  const weaponName = activeWeapon.name
  const weaponReach = activeWeapon.reach
  const baseAT = activeWeapon.at + getStatModifier(attackerBuffs, 'AT')
  const rangeMod = activeWeapon.isRanged ? getRangedDistanceMod(rangeDistance) : 0
  const effectiveAT = baseAT + (selectedManeuver?.atMod || 0) + atkCondMod + creatureMods.atMod + reachMod + rangeMod + (abilityMods?.atMod || 0)

  const basePA = (selectedTarget?.pa || 8) + getStatModifier(defenderBuffs, 'PA') + defCondModPA + (defenderAbilityMods?.paMod || 0)
  const baseAW = (selectedTarget?.aw || 5) + getStatModifier(defenderBuffs, 'AW') + defCondModAW + (defenderAbilityMods?.awMod || 0)
  const targetRS = (selectedTarget?.rs || 0) + getStatModifier(defenderBuffs, 'RS')
  const reactionPenalty = targetReactionCount > 0 ? targetReactionCount * -3 : 0
  const fintePenalty = selectedManeuver?.defMod || 0

  // Holy weapon check (Geweiht → 2x vs undead/demons)
  const holyMultiplier = getHolyDamageMultiplier(activeWeapon, selectedTarget?.category)
  // Creature vulnerability/immunity to damage type
  const creatureDmgMult = selectedTarget ? getDamageMultiplier(selectedTarget, activeWeapon.damageType || 'physisch', holyMultiplier > 1) : 1

  // On-hit effects (poison, paralysis, knockdown)
  const onHitEffects = getOnHitEffects(combatant, weaponName)

  // Build modifier breakdown for transparency
  const modBreakdown = []
  if (selectedManeuver?.atMod) modBreakdown.push(`${selectedManeuver.label || 'Manöver'}: ${selectedManeuver.atMod > 0 ? '+' : ''}${selectedManeuver.atMod} AT`)
  if (atkCondMod) modBreakdown.push(`Zustände: ${atkCondMod} AT`)
  if (creatureMods.atMod) modBreakdown.push(...creatureMods.details)
  if (reachMod) modBreakdown.push(`Reichweite: ${reachMod > 0 ? '+' : ''}${reachMod} AT`)
  if (fintePenalty) modBreakdown.push(`Finte: ${fintePenalty} PA des Gegners`)
  if (holyMultiplier > 1) modBreakdown.push('Geweihte Waffe: x2 Schaden')
  if (creatureDmgMult === 0) modBreakdown.push('Ziel ist immun gegen diesen Schadenstyp!')
  if (creatureDmgMult > 1 && holyMultiplier <= 1) modBreakdown.push(`Schwäche: x${creatureDmgMult} Schaden`)
  if (onHitEffects.length > 0) modBreakdown.push(...onHitEffects.map(e => `Bei Treffer: ${e.desc}`))
  if (combatant.poisonedWeapon && (combatant.poisonedWeapon.weaponName === activeWeapon.name || !combatant.poisonedWeapon.weaponName)) {
    modBreakdown.push(`☠ Vergiftete Waffe: ${combatant.poisonedWeapon.poisonName} (Stufe ${combatant.poisonedWeapon.stufe}) — ZK${combatant.poisonedWeapon.zkMod || ''}`)
  }

  // Who enters the dice?
  const attackerLabel = isPlayerTurn ? `${combatant.name} (Spieler würfelt)` : `${combatant.name} (SL würfelt)`
  const defenderLabel = isTargetPlayer ? `${selectedTarget?.name} (Spieler würfelt)` : `${selectedTarget?.name} (SL würfelt)`

  // ── Player turn: GM waits unless intervening ──
  if (isPlayerTurn && !gmIntervene && step === 'action') {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-green-400 flex items-center gap-1">
            <Clock className="w-3 h-3 animate-pulse" /> {combatant.name} ist am Zug
          </h4>
          <button onClick={onComplete} className="text-[9px] text-dsa-parchment-dark hover:text-dsa-parchment">Überspringen</button>
        </div>
        <div className="bg-green-900/10 border border-green-800/20 rounded-lg p-4 text-center">
          <p className="text-sm text-dsa-parchment mb-1">Warte auf Spieleraktion...</p>
          <p className="text-[10px] text-dsa-parchment-dark">Der Spieler wählt seine Aktion auf seinem Gerät.</p>
        </div>
        <button
          onClick={() => setGmIntervene(true)}
          className="btn-ghost text-[10px] w-full text-yellow-400 border-yellow-800/30 hover:bg-yellow-900/10"
        >
          Eingreifen (SL übernimmt Steuerung)
        </button>
      </div>
    )
  }

  // ── Step: ACTION ──
  if (step === 'action') {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-dsa-gold flex items-center gap-1">
            <ArrowRight className="w-3 h-3" /> {combatant.name} ist dran
          </h4>
          <button onClick={onComplete} className="text-[9px] text-dsa-parchment-dark hover:text-dsa-parchment">Überspringen</button>
        </div>
        <p className="text-[9px] text-dsa-parchment-dark">Wähle die Aktion für diese Kampfrunde. Jeder Kämpfer hat 1 Aktion + 1 Freie Aktion + Bewegung (bis GS Schritt).</p>
        <div className="space-y-1">
          {ACTIONS.map(action => (
            <button
              key={action.id}
              onClick={() => {
                setSelectedAction(action)
                if (action.id === 'melee' || action.id === 'ranged') {
                  // Filter weapons by type
                  const isRanged = action.id === 'ranged'
                  const matchingWeapons = availableWeapons.filter(w => isRanged ? w.isRanged : !w.isRanged)
                  const weaponsToShow = matchingWeapons.length > 0 ? matchingWeapons : availableWeapons
                  if (weaponsToShow.length === 1) {
                    setSelectedWeapon(weaponsToShow[0])
                    setStep('target')
                  } else {
                    setStep('weapon')
                  }
                  return
                }
                if (false) {
                  // dead branch — original target was here
                  setStep('target')
                } else if (action.id === 'item') {
                  setStep('use_item')
                  return
                } else if (action.id === 'switch_weapon') {
                  addBattleLogEntry(battleId, { type: 'system', text: `${combatant.name} wechselt die Waffe.` })
                  sendMessage?.({ type: 'combat_log_entry', payload: { type: 'system', text: `${combatant.name} wechselt die Waffe (1 Aktion).` } })
                  setStep('switch_weapon')
                  return
                } else if (action.id === 'spell' || action.id === 'liturgy') {
                  const isLit = action.id === 'liturgy'
                  setIsLiturgy(isLit)
                  setSelectedSpell(null)
                  setSpellModifier(0)
                  setSpellRolls(['', '', ''])
                  setSpellResult(null)
                  setSelectedTarget(null)
                  spellCostDeductedRef.current = false
                  addBattleLogEntry(battleId, { type: 'system', text: `${combatant.name} bereitet ${isLit ? 'eine Liturgie' : 'einen Zauber'} vor.` })
                  sendMessage?.({ type: 'combat_log_entry', payload: { type: 'system', text: `${combatant.name} bereitet ${isLit ? 'eine Liturgie' : 'einen Zauber'} vor.` } })
                  setStep('spell_select')
                  return
                } else {
                  addBattleLogEntry(battleId, { type: 'system', text: `${combatant.name}: ${action.label}` })
                  if (action.id === 'disengage') {
                    addBattleLogEntry(battleId, { type: 'system', text: `Körperbeherrschung-Probe nötig! Misslungen = Passierschlag.` })
                  }
                  onComplete()
                }
              }}
              className="w-full flex items-center gap-2 px-2 py-2 bg-dsa-bg rounded-sm border border-dsa-bg-medium hover:border-dsa-gold/20 transition-colors text-left"
            >
              <action.icon className="w-4 h-4 text-dsa-gold flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-dsa-parchment font-medium">{action.label}</div>
                <div className="text-[9px] text-dsa-parchment-dark">{action.desc}</div>
              </div>
              <Badge variant="default" size="sm">{action.cost}</Badge>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── Step: WEAPON SELECTION ──
  if (step === 'weapon') {
    const isRanged = selectedAction?.id === 'ranged'
    const matchingWeapons = availableWeapons.filter(w => isRanged ? w.isRanged : !w.isRanged)
    const weaponsToShow = matchingWeapons.length > 0 ? matchingWeapons : availableWeapons
    return (
      <div className="space-y-2">
        <StepHeader title="Waffe wählen" step="1b/6" onBack={() => { setStep('action'); setSelectedWeapon(null) }} />
        <p className="text-[9px] text-dsa-parchment-dark">
          Welche Waffe benutzt {combatant.name}?
          {combatant._lastWeapon && combatant._lastWeapon !== weaponsToShow[0]?.name && (
            <span className="text-orange-400 ml-1">(Waffenwechsel kostet 1 Aktion oder Freie Aktion mit Schnellziehen)</span>
          )}
        </p>
        <div className="space-y-1">
          {weaponsToShow.map((wpn, i) => (
            <button
              key={i}
              onClick={() => { setSelectedWeapon(wpn); setStep('target') }}
              className="w-full text-left px-3 py-2 bg-dsa-bg rounded border border-dsa-bg-medium hover:border-dsa-gold/30 transition flex items-center justify-between"
            >
              <div>
                <span className="text-sm text-dsa-parchment font-semibold">{wpn.name}</span>
                {wpn.isRanged && <Badge variant="info" size="sm" className="ml-2">Fernkampf</Badge>}
              </div>
              <div className="flex gap-3 text-[10px] font-mono">
                <span className="text-orange-300">AT {wpn.at}</span>
                <span className="text-blue-300">PA {wpn.pa}</span>
                <span className="text-red-300">TP {wpn.damage}</span>
                <span className="text-dsa-parchment-dark">{wpn.reach}</span>
              </div>
            </button>
          ))}
        </div>
        {weaponsToShow.length === 0 && (
          <p className="text-xs text-red-400">Keine passende Waffe für {isRanged ? 'Fernkampf' : 'Nahkampf'} verfügbar.</p>
        )}
      </div>
    )
  }

  // ── Step: USE ITEM ──
  if (step === 'use_item') {
    // Get character's inventory
    const allChars = useCharacterStore.getState().allCharacters || [] // safe: item use is one-shot action
    const myChar = useCharacterStore.getState().myCharacter // safe: item use is one-shot action
    const charData = allChars.find(c => c.id === combatant.characterId) || (combatant.characterId === myChar?.id ? myChar : null)
    const rawInv = charData?.basis_inventory || charData?.campaign_inventory || {}
    const invItems = Array.isArray(rawInv) ? rawInv : (rawInv.items || [])

    // Categorize items using the effect engine
    const consumables = invItems.filter(i => {
      const cls = classifyItem(i.effects)
      return cls === 'heal' || cls === 'restore' || cls === 'buff' || cls === 'condition'
    })
    const throwables = invItems.filter(i => {
      const cls = classifyItem(i.effects)
      return cls === 'damage'
    })
    const poisons = invItems.filter(i => {
      const cls = classifyItem(i.effects)
      return cls === 'poison' && i.effects?.application === 'wunde'
    })
    const weapons = invItems.filter(i => {
      const cat = (i.category || '').toLowerCase()
      return cat === 'waffe' || cat === 'weapon' || i.equipped === true
    })
    const combatItems = invItems.filter(i =>
      !consumables.includes(i) && !throwables.includes(i) && !poisons.includes(i) && !weapons.includes(i) &&
      i.usable_in_combat === true
    )
    const otherUsable = invItems.filter(i =>
      !consumables.includes(i) && !throwables.includes(i) && !poisons.includes(i) && !weapons.includes(i) && !combatItems.includes(i) &&
      (i.usable || i.effects)
    )

    const handleSelectItem = (item) => {
      const effect = resolveItemEffect(item)
      setSelectedItem(item)
      setItemEffect(effect)
      setItemRoll('')
      setItemTargets([])
    }

    const handleConfirmItem = () => {
      if (!selectedItem || !itemEffect) return
      const rollValue = parseInt(itemRoll) || 0

      // Build log text
      let logText = `${combatant.name}: ${selectedItem.name}`
      if (itemEffect.diceFormula && rollValue > 0) {
        logText += ` — ${itemEffect.effectSummary.replace('{value}', rollValue)}`
      } else {
        logText += ` — ${itemEffect.description}`
      }
      const logType = itemEffect.category === 'heal' ? 'heal' : itemEffect.category === 'damage' ? 'damage' : 'system'

      // Apply effects based on type
      for (const step of itemEffect.steps) {
        if (step.type === 'heal' && rollValue > 0) {
          const oldLep = combatant.lep ?? combatant.lepMax ?? 30
          const newLep = Math.min(combatant.lepMax || 30, oldLep + rollValue)
          updateCombatant(combatant.id, { lep: newLep })
          sendMessage?.({ type: 'vitals_update', payload: { character_id: combatant.characterId || combatant.id, token_id: combatant.id, vitals: { lep: newLep } } })
        }
        if (step.type === 'restore' && rollValue > 0) {
          sendMessage?.({ type: 'combat_log_entry', payload: { type: 'heal', text: `${combatant.name}: +${rollValue} ${step.resource === 'asp' ? 'AsP' : 'KaP'}` } })
        }
        if (step.type === 'damage' && rollValue > 0) {
          // Apply to each target (AoE or single)
          const targets = itemTargets.length > 0 ? itemTargets : (selectedTarget ? [selectedTarget.id] : [])
          for (const tid of targets) {
            const target = allCombatants.find(c => c.id === tid)
            if (target) {
              const rs = target.rs || 0
              const sp = Math.max(0, rollValue - rs)
              const newLep = Math.max(0, (target.lep ?? target.lepMax ?? 30) - sp)
              updateCombatant(tid, { lep: newLep })
              sendMessage?.({ type: 'vitals_update', payload: { character_id: target.characterId || tid, token_id: tid, vitals: { lep: newLep } } })
            }
          }
        }
        if (step.type === 'condition') {
          sendMessage?.({ type: 'conditions_update', payload: { character_id: combatant.characterId || combatant.id, ...step.effects } })
        }
        if (step.type === 'smoke') {
          // Smoke cloud: log the effect, GM handles the zone manually
          const smokeTargets = itemTargets.length > 0 ? itemTargets : []
          for (const tid of smokeTargets) {
            const target = allCombatants.find(c => c.id === tid)
            if (target) {
              addBattleLogEntry(battleId, { type: 'system', text: `${target.name}: Verblendet durch Rauchwolke (-4 FK, Sicht blockiert) für ${step.durationRounds} KR` })
            }
          }
          if (smokeTargets.length === 0) {
            addBattleLogEntry(battleId, { type: 'system', text: `Rauchwolke erzeugt — Sicht blockiert für ${step.durationRounds} KR` })
          }
        }
        if (step.type === 'stun') {
          // Stun: each target must make a KO-probe or get Betäubt
          const stunTargets = itemTargets.length > 0 ? itemTargets : []
          for (const tid of stunTargets) {
            const target = allCombatants.find(c => c.id === tid)
            if (target) {
              addBattleLogEntry(battleId, { type: 'system', text: `${target.name}: KO-Probe nötig oder Betäubung für ${step.durationRounds} KR!` })
              sendMessage?.({ type: 'combat_log_entry', payload: { type: 'system', text: `${target.name}: KO-Probe oder Betäubung (${selectedItem?.name})` } })
            }
          }
        }
        if (step.type === 'buff' && step.buffs) {
          // Create real tracked buffs with expiry timers
          for (const buffDesc of step.buffs) {
            // Parse "+2 GE" format
            const m = buffDesc.match?.(/\+(\d+)\s+(\w+)/)
            if (m) {
              const buff = createBuff({
                stat: m[2],
                value: parseInt(m[1]),
                durationMinutes: step.durationMinutes || 30,
                source: selectedItem.name,
                characterId: combatant.characterId || combatant.id,
              })
              useCharacterStore.getState().addBuff(buff)
              // Broadcast to all clients
              sendMessage?.({
                type: 'buff_add',
                payload: buff,
              })
            }
          }
        }
      }

      // Log
      addBattleLogEntry(battleId, { type: logType, text: logText })
      sendMessage?.({ type: 'combat_log_entry', payload: { type: logType, text: logText } })

      // Consume from inventory
      if (itemEffect.consumed && charData) {
        const updatedItems = invItems.map(i => {
          if (i.name === selectedItem.name && (i.quantity || 1) > 1) return { ...i, quantity: (i.quantity || 1) - 1 }
          if (i.name === selectedItem.name) return null
          return i
        }).filter(Boolean)
        const updatedInv = Array.isArray(rawInv) ? updatedItems : { ...rawInv, items: updatedItems }
        if (combatant.characterId) {
          useCharacterStore.getState().updateCharacterInList(combatant.characterId, { basis_inventory: updatedInv })
          sendMessage?.({ type: 'inventory_change', payload: { character_id: combatant.characterId, inventory: updatedInv } })
        }
      }

      setSelectedItem(null)
      setItemEffect(null)
      onComplete()
    }

    const handleApplyPoison = (weaponName) => {
      if (!selectedItem) return
      const poison = selectedItem.effects || {}
      // Mark weapon as poisoned on this combatant
      updateCombatant(combatant.id, {
        poisonedWeapon: {
          weaponName,
          poisonName: selectedItem.name,
          stufe: poison.stufe || 1,
          zkMod: poison.zk_mod || 0,
          damage: poison.damage || '',
          detail: poison.detail || '',
          hitsRemaining: 1, // one application = one hit
        },
      })
      const logText = `${combatant.name} trägt ${selectedItem.name} (Stufe ${poison.stufe || '?'}) auf ${weaponName} auf.`
      addBattleLogEntry(battleId, { type: 'system', text: logText })
      sendMessage?.({ type: 'combat_log_entry', payload: { type: 'system', text: logText } })

      // Consume poison from inventory
      if (charData) {
        const updatedItems = invItems.map(i => {
          if (i.name === selectedItem.name && (i.quantity || 1) > 1) return { ...i, quantity: (i.quantity || 1) - 1 }
          if (i.name === selectedItem.name) return null
          return i
        }).filter(Boolean)
        const updatedInv = Array.isArray(rawInv) ? updatedItems : { ...rawInv, items: updatedItems }
        if (combatant.characterId) {
          useCharacterStore.getState().updateCharacterInList(combatant.characterId, { basis_inventory: updatedInv })
          sendMessage?.({ type: 'inventory_change', payload: { character_id: combatant.characterId, inventory: updatedInv } })
        }
      }

      setSelectedItem(null)
      setItemEffect(null)
      setPoisonApplyMode(false)
      onComplete()
    }

    const handleEquipWeapon = (weapon) => {
      const wpnName = weapon.name
      const charWeapons = charData?.combat_values?.weapons || []
      const wpnStats = charWeapons.find(w => (w.name || '').toLowerCase() === wpnName.toLowerCase())
      updateCombatant(combatant.id, {
        weaponName: wpnName,
        weaponDamage: wpnStats?.damage || wpnStats?.TP || weapon.damage || '1W6+4',
        at: wpnStats?.at_mod != null ? (combatant.at || 12) + wpnStats.at_mod : wpnStats?.AT || combatant.at || 12,
        pa: wpnStats?.pa_mod != null ? (combatant.pa || 8) + wpnStats.pa_mod : wpnStats?.PA || combatant.pa || 8,
        weaponReach: wpnStats?.reach || 'mittel',
      })
      addBattleLogEntry(battleId, { type: 'system', text: `${combatant.name} zieht ${wpnName}. (1 Aktion)` })
      sendMessage?.({ type: 'combat_log_entry', payload: { type: 'system', text: `${combatant.name} zieht ${wpnName}.` } })
      onComplete()
    }

    return (
      <div className="space-y-2">
        <StepHeader title="Gegenstand benutzen" step="Aktion" onBack={() => setStep('action')} />

        {/* Item detail view — after selecting an item */}
        {selectedItem && itemEffect && (
          <div className="space-y-3 bg-dsa-bg-card/50 rounded p-3 border border-dsa-bg-medium">
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-semibold text-dsa-gold">{selectedItem.name}</h5>
              <button onClick={() => { setSelectedItem(null); setItemEffect(null) }} className="text-dsa-parchment-dark hover:text-dsa-parchment"><X className="w-3.5 h-3.5" /></button>
            </div>
            <p className="text-[11px] text-dsa-parchment/80">{itemEffect.description}</p>

            {/* Herb probe requirement */}
            {itemEffect.requiresProbe && (
              <div className="bg-amber-900/20 border border-amber-800/30 rounded px-2 py-1.5 text-[10px] text-amber-300">
                ⚠ Erfordert {itemEffect.probeSkill}-Probe vor Anwendung
              </div>
            )}

            {/* Dice input — if item has a formula */}
            {itemEffect.diceFormula && (
              <div>
                <label className="text-[10px] text-dsa-parchment-dark">Würfle {itemEffect.diceFormula}:</label>
                <input
                  type="number" min="0" autoFocus
                  value={itemRoll}
                  onChange={(e) => setItemRoll(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleConfirmItem()}
                  className="input-field text-sm w-20 mt-1 text-center font-mono"
                  placeholder="Ergebnis"
                />
              </div>
            )}

            {/* Target selection for AoE */}
            {itemEffect.isAoE && (
              <div>
                <label className="text-[10px] text-dsa-parchment-dark mb-1 block">
                  Ziele im Radius ({itemEffect.radius} Schritt) — mehrere anklicken:
                </label>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {allCombatants.filter(c => c.id !== combatant.id && (c.lep ?? c.lepMax ?? 0) > 0).map(c => (
                    <button
                      key={c.id}
                      onClick={() => setItemTargets(prev => prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id])}
                      className={clsx(
                        'w-full text-left px-2 py-1 rounded text-xs transition',
                        itemTargets.includes(c.id) ? 'bg-red-900/30 text-red-400 border border-red-800/30' : 'bg-dsa-bg border border-dsa-bg-medium text-dsa-parchment-dark hover:text-dsa-parchment'
                      )}
                    >
                      {itemTargets.includes(c.id) && <Check className="w-3 h-3 inline mr-1" />}
                      {c.name} <span className="text-[9px] font-mono ml-1">LeP {c.lep}/{c.lepMax}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Single target selection for targeted items */}
            {itemEffect.needsTarget && !itemEffect.isAoE && (
              <div>
                <label className="text-[10px] text-dsa-parchment-dark mb-1 block">Ziel wählen:</label>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {allCombatants.filter(c => c.id !== combatant.id && (c.lep ?? c.lepMax ?? 0) > 0).map(c => (
                    <button
                      key={c.id}
                      onClick={() => setItemTargets([c.id])}
                      className={clsx(
                        'w-full text-left px-2 py-1 rounded text-xs transition',
                        itemTargets.includes(c.id) ? 'bg-dsa-gold/20 text-dsa-gold border border-dsa-gold/30' : 'bg-dsa-bg border border-dsa-bg-medium text-dsa-parchment-dark hover:text-dsa-parchment'
                      )}
                    >
                      {c.name} <span className="text-[9px] font-mono ml-1">LeP {c.lep}/{c.lepMax}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={handleConfirmItem}
              disabled={itemEffect.diceFormula && !itemRoll}
              className="btn-primary text-xs w-full disabled:opacity-30"
            >
              {itemEffect.diceFormula ? 'Effekt anwenden' : 'Benutzen'}
            </button>
          </div>
        )}

        {!selectedItem && !charData ? (
          <p className="text-xs text-dsa-parchment-dark">Kein Inventar verfügbar für {combatant.name} (NSC ohne Charakter-Daten).</p>
        ) : !selectedItem && invItems.length === 0 ? (
          <p className="text-xs text-dsa-parchment-dark">Inventar ist leer.</p>
        ) : (
          <div className="space-y-3 max-h-[50vh] overflow-y-auto">
            {/* Consumables (potions, herbs, elixirs) */}
            {consumables.length > 0 && (
              <div>
                <h5 className="text-[10px] text-green-400 uppercase tracking-wider mb-1">Tränke & Verbrauchsgüter</h5>
                {consumables.map((item, i) => {
                  const cls = classifyItem(item.effects)
                  const effectHint = item.effects?.heal_lep ? `Heilt ${item.effects.heal_lep}` :
                                     item.effects?.restore_asp ? `+${item.effects.restore_asp} AsP` :
                                     item.effects?.detail || ''
                  return (
                    <button key={i} onClick={() => handleSelectItem(item)}
                      className="w-full text-left px-3 py-2 bg-green-900/10 border border-green-900/20 rounded-sm mb-1 hover:border-green-500/30 transition">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs text-dsa-parchment">{item.name}</span>
                          {effectHint && <span className="text-[9px] text-green-400/60 ml-2">{effectHint}</span>}
                        </div>
                        <span className="text-[10px] font-mono text-green-400">{(item.quantity || 1) > 1 ? `${item.quantity}x` : ''}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Throwable combat items (bombs, holy water) */}
            {throwables.length > 0 && (
              <div>
                <h5 className="text-[10px] text-red-400 uppercase tracking-wider mb-1">Wurfgegenstände (Ziel nötig)</h5>
                {throwables.map((item, i) => (
                  <button key={i} onClick={() => handleSelectItem(item)}
                    className="w-full text-left px-3 py-2 bg-red-900/10 border border-red-900/20 rounded-sm mb-1 hover:border-red-500/30 transition">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs text-dsa-parchment">{item.name}</span>
                        {item.effects?.detail && <span className="text-[9px] text-red-400/60 ml-2">{item.effects.detail}</span>}
                      </div>
                      <span className="text-[10px] font-mono text-red-400">{(item.quantity || 1) > 1 ? `${item.quantity}x` : ''}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Combat-usable items (flagged usable_in_combat but not damage/heal) */}
            {combatItems.length > 0 && (
              <div>
                <h5 className="text-[10px] text-amber-400 uppercase tracking-wider mb-1">Kampfgegenstände</h5>
                {combatItems.map((item, i) => {
                  const effect = resolveItemEffect(item)
                  return (
                    <button key={i} onClick={() => handleSelectItem(item)}
                      className="w-full text-left px-3 py-2 bg-amber-900/10 border border-amber-900/20 rounded-sm mb-1 hover:border-amber-500/30 transition">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs text-dsa-parchment">{item.name}</span>
                          {effect.description && <span className="text-[9px] text-amber-400/60 ml-2">{effect.description}</span>}
                        </div>
                        <span className="text-[10px] font-mono text-amber-400">{(item.quantity || 1) > 1 ? `${item.quantity}x` : ''}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Poisons to apply to weapons */}
            {poisons.length > 0 && (
              <div>
                <h5 className="text-[10px] text-purple-400 uppercase tracking-wider mb-1">Gifte (auf Waffe auftragen)</h5>
                {!poisonApplyMode ? (
                  poisons.map((item, i) => (
                    <button key={i} onClick={() => { setSelectedItem(item); setPoisonApplyMode(true) }}
                      className="w-full text-left px-3 py-2 bg-purple-900/10 border border-purple-900/20 rounded-sm mb-1 hover:border-purple-500/30 transition">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs text-dsa-parchment">{item.name}</span>
                          <span className="text-[9px] text-purple-400/60 ml-2">Stufe {item.effects?.stufe || '?'} — {item.effects?.detail || ''}</span>
                        </div>
                        <span className="text-[10px] font-mono text-purple-400">{(item.quantity || 1) > 1 ? `${item.quantity}x` : ''}</span>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="space-y-2">
                    <p className="text-[10px] text-purple-300">Waffe wählen für {selectedItem?.name}:</p>
                    {availableWeapons.filter(w => !w.isRanged).map((w, i) => (
                      <button key={i} onClick={() => handleApplyPoison(w.name)}
                        className="w-full text-left px-3 py-2 bg-purple-900/20 border border-purple-800/30 rounded-sm hover:border-purple-500/40 transition">
                        <span className="text-xs text-dsa-parchment">{w.name}</span>
                        {combatant.poisonedWeapon?.weaponName === w.name && (
                          <span className="text-[9px] text-purple-400 ml-2">(bereits vergiftet)</span>
                        )}
                      </button>
                    ))}
                    <button onClick={() => { setPoisonApplyMode(false); setSelectedItem(null) }}
                      className="text-[9px] text-dsa-parchment-dark hover:text-dsa-parchment">Abbrechen</button>
                  </div>
                )}
              </div>
            )}

            {/* Weapons to equip */}
            {weapons.length > 0 && (
              <div>
                <h5 className="text-[10px] text-orange-400 uppercase tracking-wider mb-1">Waffen (Wechsel = 1 Aktion)</h5>
                {weapons.map((w, i) => (
                  <button key={i} onClick={() => handleEquipWeapon(w)}
                    className="w-full text-left px-3 py-2 bg-orange-900/10 border border-orange-900/20 rounded-sm mb-1 hover:border-orange-500/30 transition">
                    <span className="text-xs text-dsa-parchment">{w.name}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Other usable items */}
            {otherUsable.length > 0 && (
              <div>
                <h5 className="text-[10px] text-blue-400 uppercase tracking-wider mb-1">Andere Gegenstände</h5>
                {otherUsable.map((item, i) => (
                  <button key={i} onClick={() => handleSelectItem(item)}
                    className="w-full text-left px-3 py-2 bg-blue-900/10 border border-blue-900/20 rounded-sm mb-1 hover:border-blue-500/30 transition">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-dsa-parchment">{item.name}</span>
                      <span className="text-[10px] font-mono text-blue-400">{(item.quantity || 1) > 1 ? `${item.quantity}x` : ''}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {consumables.length === 0 && throwables.length === 0 && combatItems.length === 0 && poisons.length === 0 && weapons.length === 0 && otherUsable.length === 0 && (
              <p className="text-xs text-dsa-parchment-dark">Keine verwendbaren Gegenstände im Inventar.</p>
            )}
          </div>
        )}

        <button onClick={onComplete} className="text-[9px] text-dsa-parchment-dark hover:text-dsa-parchment mt-2">Abbrechen</button>
      </div>
    )
  }

  // ── Step: SPELL SELECT ──
  if (step === 'spell_select') {
    const charData = useCharacterStore.getState().allCharacters.find(c => c.id === combatant.characterId)
      || useCharacterStore.getState().myCharacter
    const spellList = isLiturgy ? (charData?.liturgies || {}) : (charData?.spells || {})
    const templateMap = isLiturgy ? liturgyTemplates : spellTemplates
    const costLabel = isLiturgy ? 'KaP' : 'AsP'
    const colorClass = isLiturgy ? 'text-purple-400' : 'text-blue-400'
    const bgClass = isLiturgy ? 'bg-purple-950/50' : 'bg-blue-950/50'
    const IconComp = isLiturgy ? Sun : Sparkles
    const currentEnergy = isLiturgy
      ? (combatant.kap ?? charData?.current_vitals?.kap ?? 0)
      : (combatant.asp ?? charData?.current_vitals?.asp ?? 0)
    const entries = Object.entries(spellList)

    return (
      <div className="space-y-2">
        <StepHeader title={isLiturgy ? 'Liturgie wählen' : 'Zauber wählen'} step="1/4" onBack={() => setStep('action')} />
        <p className="text-[9px] text-dsa-parchment-dark">
          Welch{isLiturgy ? 'e Liturgie' : 'en Zauber'} wirkt {combatant.name}?
          {currentEnergy > 0 && <span className={colorClass}> ({currentEnergy} {costLabel} verfügbar)</span>}
        </p>
        {!spellTemplatesLoaded && entries.length > 0 && (
          <div className="text-[10px] text-dsa-parchment-dark animate-pulse">Lade Datenbank...</div>
        )}
        {entries.length === 0 ? (
          <div className="text-center py-6">
            <IconComp className={`w-6 h-6 ${colorClass} mx-auto mb-2 opacity-30`} />
            <p className="text-xs text-dsa-parchment-dark">
              {isLiturgy ? 'Keine Liturgien bekannt' : 'Keine Zauber bekannt'}
            </p>
          </div>
        ) : (
          <div className="space-y-1 max-h-[50vh] overflow-y-auto">
            {entries.sort(([,a], [,b]) => b - a).map(([name, fw]) => {
              const tmpl = templateMap[name] || null
              const cost = tmpl?.cost || 0
              const canAfford = cost <= 0 || currentEnergy >= cost
              const probe = tmpl?.probe || []
              const attrs = combatant.attributes || charData?.attributes || {}

              return (
                <button
                  key={name}
                  onClick={() => {
                    if (!canAfford) return
                    setSelectedSpell({ name, fw, probe, cost, template: tmpl })
                    setStep('spell_target')
                  }}
                  disabled={!canAfford}
                  className={clsx(
                    'w-full text-left px-3 py-2 rounded-sm border transition-colors',
                    canAfford
                      ? `bg-dsa-bg border-dsa-bg-medium hover:border-${isLiturgy ? 'purple' : 'blue'}-800/40`
                      : 'bg-dsa-bg-medium/50 border-dsa-bg-medium opacity-50 cursor-not-allowed'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <IconComp className={`w-3.5 h-3.5 ${colorClass} flex-shrink-0`} />
                        <span className="text-xs text-dsa-parchment font-medium uppercase">{name.replace(/_/g, ' ')}</span>
                        {!canAfford && <span className="text-[8px] text-red-400">Nicht genug {costLabel}</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 ml-5">
                        {probe.length > 0 && (
                          <span className="text-[9px] text-dsa-parchment-dark">
                            {probe.map((a, i) => (
                              <span key={i}>
                                {i > 0 && '/'}
                                <span className={ATTR_TEXT_COLORS[a]}>{a}</span>
                                <span className="text-dsa-parchment-dark/60 font-mono">({attrs[a] || '?'})</span>
                              </span>
                            ))}
                          </span>
                        )}
                        {tmpl && (
                          <span className="text-[9px] text-dsa-parchment-dark">
                            · {cost} {costLabel} · {tmpl.time}
                            {tmpl.range && tmpl.range !== '?' && <span> · {tmpl.range}</span>}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-center flex-shrink-0 ml-2">
                      <div className={`text-sm font-bold font-mono ${colorClass}`}>{fw}</div>
                      <div className="text-[8px] text-dsa-parchment-dark">FW</div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
        <button onClick={onComplete} className="text-[9px] text-dsa-parchment-dark hover:text-dsa-parchment mt-2">Abbrechen</button>
      </div>
    )
  }

  // ── Step: SPELL TARGET ──
  if (step === 'spell_target') {
    const tmpl = selectedSpell?.template
    const selfTarget = tmpl?.target && /selbst|self/i.test(tmpl.target)
    const zoneTarget = tmpl?.target && /zone|fläche|area/i.test(tmpl.target)
    const colorClass = isLiturgy ? 'text-purple-400' : 'text-blue-400'
    const allTargets = allCombatants.filter(c => c.id !== combatant.id && (c.lep ?? c.lepMax ?? 0) > 0)

    // Auto-skip target for self/zone spells
    if (selfTarget || zoneTarget) {
      // Render a skip UI
      return (
        <div className="space-y-2">
          <StepHeader title="Ziel" step="2/4" onBack={() => { setSelectedSpell(null); setStep('spell_select') }} />
          <div className="bg-dsa-bg rounded border border-dsa-bg-medium p-3 text-center">
            <p className="text-xs text-dsa-parchment mb-2">
              {selfTarget
                ? `"${selectedSpell.name.replace(/_/g, ' ')}" wirkt auf den Zaubernden selbst.`
                : `"${selectedSpell.name.replace(/_/g, ' ')}" wirkt als Flächenzauber.`}
            </p>
            <button
              onClick={() => setStep('spell_modifier')}
              className="btn-primary text-xs"
            >
              Weiter zum Modifikator
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="space-y-2">
        <StepHeader title="Ziel wählen" step="2/4" onBack={() => { setSelectedSpell(null); setStep('spell_select') }} />
        <p className="text-[9px] text-dsa-parchment-dark">
          Auf wen wirkt {combatant.name} "{selectedSpell?.name?.replace(/_/g, ' ')}"?
          {isLiturgy ? ' Liturgien' : ' Zauber'} können auf Verbündete und Feinde wirken.
        </p>
        <button
          onClick={() => { setSelectedTarget(null); setStep('spell_modifier') }}
          className="w-full text-left px-3 py-2 bg-dsa-bg rounded-sm border border-dsa-bg-medium hover:border-dsa-gold/20 transition-colors"
        >
          <span className="text-xs text-dsa-parchment font-medium">Ohne Ziel / Selbst</span>
          <span className="text-[9px] text-dsa-parchment-dark ml-2">Zauber ohne spezifisches Ziel</span>
        </button>
        <div className="space-y-1 max-h-[40vh] overflow-y-auto">
          {allTargets.map(target => (
            <button
              key={target.id}
              onClick={() => { setSelectedTarget(target); setStep('spell_modifier') }}
              className="w-full flex items-center gap-2 px-2 py-2 bg-dsa-bg rounded-sm border border-dsa-bg-medium hover:border-dsa-gold/20 transition-colors text-left"
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${target.isNPC ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}`}>
                {(target.name || '?')[0]}
              </span>
              <div className="flex-1">
                <div className="text-xs text-dsa-parchment">{target.name}</div>
                <div className="text-[8px] text-dsa-parchment-dark">
                  LeP {target.lep ?? target.lepMax ?? 0}/{target.lepMax}
                  {target.isNPC ? ' · NSC' : ' · Spieler'}
                </div>
              </div>
            </button>
          ))}
          {allTargets.length === 0 && <p className="text-[10px] text-dsa-parchment-dark text-center">Keine Ziele verfügbar.</p>}
        </div>
      </div>
    )
  }

  // ── Step: SPELL MODIFIER ──
  if (step === 'spell_modifier') {
    const charData = useCharacterStore.getState().allCharacters.find(c => c.id === combatant.characterId)
      || useCharacterStore.getState().myCharacter
    const attrs = combatant.attributes || charData?.attributes || {}
    const probeAttrs = selectedSpell?.probe || []
    const colorClass = isLiturgy ? 'text-purple-400' : 'text-blue-400'
    const borderClass = isLiturgy ? 'border-purple-800/30' : 'border-blue-800/30'
    const IconComp = isLiturgy ? Sun : Sparkles
    const costLabel = isLiturgy ? 'KaP' : 'AsP'

    return (
      <div className="space-y-3">
        <StepHeader title="Modifikator festlegen" step="3/4" onBack={() => setStep('spell_target')} />

        {/* Spell summary */}
        <div className={`bg-dsa-bg rounded border ${borderClass} p-3`}>
          <div className="flex items-center gap-2 mb-2">
            <IconComp className={`w-4 h-4 ${colorClass}`} />
            <span className={`text-sm font-bold uppercase ${colorClass}`}>{selectedSpell?.name?.replace(/_/g, ' ')}</span>
            <span className="text-[9px] text-dsa-parchment-dark">FW {selectedSpell?.fw}</span>
          </div>
          {selectedTarget && (
            <p className="text-[10px] text-dsa-parchment-dark mb-1">Ziel: <span className="text-dsa-parchment">{selectedTarget.name}</span></p>
          )}
          <p className="text-[10px] text-dsa-parchment-dark">Kosten: <span className={colorClass}>{selectedSpell?.cost || '?'} {costLabel}</span></p>
        </div>

        {/* Probe attributes with modified values */}
        {probeAttrs.length > 0 && (
          <div className="flex justify-center gap-4">
            {probeAttrs.map((attr, i) => {
              const baseVal = attrs[attr] || 10
              const modifiedVal = baseVal + spellModifier
              return (
                <div key={i} className="text-center">
                  <div className={`text-xs font-medium ${ATTR_TEXT_COLORS[attr]}`}>{ATTR_NAMES[attr]}</div>
                  <div className="text-[9px] text-dsa-parchment-dark">{attr}</div>
                  <div className="text-lg font-mono font-bold text-dsa-gold">{modifiedVal}</div>
                  {spellModifier !== 0 && (
                    <div className="text-[8px] text-dsa-parchment-dark">
                      ({baseVal} {spellModifier > 0 ? '+' : ''}{spellModifier})
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Modifier input */}
        <div className="bg-dsa-bg rounded border border-dsa-bg-medium p-3 text-center">
          <label className="text-[10px] text-dsa-parchment-dark block mb-1">
            Erleichterung/Erschwernis (positiv = leichter, negativ = schwerer)
          </label>
          <input
            type="number"
            value={spellModifier}
            onChange={(e) => setSpellModifier(parseInt(e.target.value) || 0)}
            className="w-20 h-10 bg-dsa-bg-light border-2 border-dsa-gold/30 rounded text-center text-lg font-mono text-dsa-gold mx-auto focus:outline-none focus:border-dsa-gold focus:ring-2 focus:ring-dsa-gold/20"
            autoFocus
          />
          <div className="flex justify-center gap-2 mt-2">
            {[-6, -3, -1, 0, 1, 3, 6].map(v => (
              <button
                key={v}
                onClick={() => setSpellModifier(v)}
                className={clsx(
                  'px-2 py-1 text-[9px] font-mono rounded-sm border transition',
                  spellModifier === v
                    ? 'bg-dsa-gold/20 border-dsa-gold/30 text-dsa-gold'
                    : 'bg-dsa-bg border-dsa-bg-medium text-dsa-parchment-dark hover:text-dsa-parchment'
                )}
              >
                {v > 0 ? `+${v}` : v}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => {
            setSpellRolls(['', '', ''])
            setSpellResult(null)
            setStep('spell_roll')
          }}
          disabled={probeAttrs.length === 0}
          className="btn-primary text-xs w-full disabled:opacity-30"
        >
          Würfeln
        </button>
      </div>
    )
  }

  // ── Step: SPELL ROLL ──
  if (step === 'spell_roll') {
    const charData = useCharacterStore.getState().allCharacters.find(c => c.id === combatant.characterId)
      || useCharacterStore.getState().myCharacter
    const attrs = combatant.attributes || charData?.attributes || {}
    const probeAttrs = selectedSpell?.probe || []
    const targets = probeAttrs.map(a => (attrs[a] || 10) + spellModifier)
    const colorClass = isLiturgy ? 'text-purple-400' : 'text-blue-400'
    const IconComp = isLiturgy ? Sun : Sparkles

    const allFilled = spellRolls.length === 3 && spellRolls.every(d => d && parseInt(d) >= 1 && parseInt(d) <= 20)

    // Live calculation
    let fpUsed = 0
    let details = []
    if (allFilled) {
      const rolls = spellRolls.map(Number)
      details = rolls.map((roll, i) => {
        const target = targets[i]
        const over = Math.max(0, roll - target)
        fpUsed += over
        return { attr: probeAttrs[i], target, roll, over, ok: roll <= target }
      })
    }
    const fpRemaining = (selectedSpell?.fw || 0) - fpUsed
    const success = allFilled && fpRemaining >= 0
    const qs = success ? Math.max(1, Math.ceil(Math.max(0, fpRemaining) / 3)) : 0

    // Check criticals
    const rollsNum = allFilled ? spellRolls.map(Number) : []
    const ones = rollsNum.filter(r => r === 1).length
    const twenties = rollsNum.filter(r => r === 20).length
    const critical = ones >= 2
    const patzer = twenties >= 2

    // For player turns, send dice request
    if (isPlayerTurn && !autoSentRef.current.spellProbe) {
      autoSentRef.current.spellProbe = true
      sendMessage?.({
        type: 'dice_request',
        payload: {
          target_user_id: combatant.userId || combatant.characterId || combatant.id,
          type: 'spell_probe',
          label: `${isLiturgy ? 'Liturgie' : 'Zauber'} "${selectedSpell?.name?.replace(/_/g, ' ')}" — Würfle 3W20`,
          dice: '3W20',
          probe: probeAttrs,
          fw: selectedSpell?.fw,
          difficulty: spellModifier,
        },
      })
    }

    // Waiting for player
    if (isPlayerTurn && !spellResult) {
      return (
        <div className="space-y-3">
          <StepHeader title={`${selectedSpell?.name?.replace(/_/g, ' ')} — Probe`} step="4/4" onBack={() => setStep('spell_modifier')} />
          <div className="text-center py-4">
            <IconComp className={`w-8 h-8 ${colorClass} mx-auto mb-2`} />
            <p className="text-sm text-dsa-parchment mb-1">{combatant.name} würfelt die {isLiturgy ? 'Liturgie' : 'Zauber'}-Probe</p>
            <p className="text-[9px] text-dsa-parchment-dark mb-2">
              Probe: {probeAttrs.join('/')} · FW {selectedSpell?.fw}{spellModifier !== 0 ? ` · Mod ${spellModifier > 0 ? '+' : ''}${spellModifier}` : ''}
            </p>
            <div className={`px-6 py-3 ${isLiturgy ? 'bg-purple-900/20 text-purple-400 border-purple-800/20' : 'bg-blue-900/20 text-blue-400 border-blue-800/20'} border rounded text-sm flex items-center justify-center gap-2 animate-pulse`}>
              Warte auf Würfelwurf des Spielers...
            </div>
            <button
              onClick={() => {
                // Fall back to GM entering rolls manually
                autoSentRef.current.spellProbe = false
              }}
              className="mt-3 text-[9px] text-dsa-parchment-dark hover:text-dsa-parchment transition"
            >
              Spieler antwortet nicht — SL würfelt selbst
            </button>
          </div>
        </div>
      )
    }

    // NPC turn (or GM entering manually)
    return (
      <div className="space-y-3">
        <StepHeader title={`${selectedSpell?.name?.replace(/_/g, ' ')} — Probe`} step="4/4" onBack={() => setStep('spell_modifier')} />
        <div className="bg-dsa-bg rounded border border-dsa-bg-medium p-3">
          <p className="text-[9px] text-dsa-parchment-dark mb-1 text-center">
            {isPlayerTurn ? `${combatant.name} (Spieler)` : `${combatant.name} (SL würfelt)`}
          </p>
          <p className="text-xs text-dsa-parchment mb-1 text-center">
            Würfle <span className={`font-bold ${colorClass}`}>3W20</span> — einen pro Eigenschaft
          </p>
          <p className="text-[9px] text-dsa-parchment-dark mb-3 text-center">
            FW <span className={`font-mono font-bold ${colorClass}`}>{selectedSpell?.fw}</span>
            {spellModifier !== 0 && <span className={spellModifier > 0 ? ' text-green-400' : ' text-red-400'}> (Mod {spellModifier > 0 ? '+' : ''}{spellModifier})</span>}
          </p>

          {/* 3 dice inputs */}
          <div className="flex justify-center gap-4">
            {probeAttrs.map((attr, i) => {
              const baseVal = attrs[attr] || 10
              const targetVal = targets[i]
              const roll = spellRolls[i] ? parseInt(spellRolls[i], 10) : null
              const isOk = roll !== null && roll <= targetVal
              const deficit = roll !== null && roll > targetVal ? roll - targetVal : 0

              return (
                <div key={i} className="text-center space-y-1">
                  <div className={`text-xs font-medium ${ATTR_TEXT_COLORS[attr]}`}>{ATTR_NAMES[attr]}</div>
                  <div className="text-[9px] text-dsa-parchment-dark">
                    Ziel: <span className="font-mono text-dsa-gold">{targetVal}</span>
                  </div>
                  <input
                    type="number" min="1" max="20"
                    value={spellRolls[i]}
                    onChange={(e) => { const n = [...spellRolls]; n[i] = e.target.value; setSpellRolls(n) }}
                    className={clsx(
                      'w-16 h-16 rounded text-center text-3xl font-mono focus:outline-none focus:ring-4 transition-all',
                      roll === null ? 'bg-dsa-bg-light border-2 border-dsa-bg-medium text-dsa-parchment focus:border-dsa-gold focus:ring-dsa-gold/20' :
                      isOk ? 'bg-green-950/30 border-2 border-green-700 text-green-400 focus:ring-green-400/20' :
                      'bg-red-950/30 border-2 border-red-700 text-red-400 focus:ring-red-400/20'
                    )}
                    placeholder="—"
                    autoFocus={i === 0}
                  />
                  {roll !== null && (
                    <div className={clsx('text-xs font-bold', isOk ? 'text-green-400' : 'text-red-400')}>
                      {isOk ? 'Geschafft' : `−${deficit} FP`}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Live result */}
          {allFilled && (
            <div className={clsx(
              'text-center py-3 rounded mt-3',
              critical ? 'bg-green-900/30 border border-green-700/40' :
              patzer ? 'bg-red-900/30 border border-red-700/40' :
              success ? 'bg-green-900/20 border border-green-800/30' : 'bg-red-900/20 border border-red-800/30'
            )}>
              <p className={clsx('text-sm font-bold', critical ? 'text-green-400' : patzer ? 'text-red-400' : success ? 'text-green-400' : 'text-red-400')}>
                {critical ? 'Kritischer Erfolg!' : patzer ? 'Patzer!' : success ? `Gelungen! QS ${qs}` : 'Misslungen!'}
              </p>
              <p className="text-xs text-dsa-parchment-dark mt-1">
                {fpUsed > 0 ? `${fpUsed} von ${selectedSpell?.fw} FP verbraucht` : 'Keine FP verbraucht'}
                {success && fpRemaining > 0 ? ` — ${fpRemaining} übrig` : ''}
                {!success ? ` — ${Math.abs(fpRemaining)} zu wenig` : ''}
              </p>
              {critical && <p className="text-[9px] text-green-400/60 mt-1">Zwei oder mehr Einsen — der Effekt ist besonders stark!</p>}
              {patzer && <p className="text-[9px] text-red-400/60 mt-1">Zwei oder mehr Zwanziger — die Magie geht fehl!</p>}
            </div>
          )}

          <button
            onClick={() => {
              if (!allFilled) return
              const rolls = spellRolls.map(Number)
              setSpellResult({ success, qs, fpRemaining, rolls, details, critical, patzer })
              const resultText = critical ? 'KRITISCHER ERFOLG!' : patzer ? 'PATZER!' : success ? `Gelungen! QS ${qs}` : 'Misslungen!'
              addBattleLogEntry(battleId, { type: success ? 'system' : 'miss', text: `${combatant.name} ${isLiturgy ? 'Liturgie' : 'Zauber'} "${selectedSpell.name.replace(/_/g, ' ')}": [${rolls.join(', ')}] vs ${probeAttrs.join('/')} (${targets.join('/')}) — ${resultText} (FP: ${fpRemaining}/${selectedSpell.fw})` })
              sendMessage?.({ type: 'combat_log_entry', payload: { type: success ? 'system' : 'miss', text: `${combatant.name} ${isLiturgy ? 'Liturgie' : 'Zauber'} "${selectedSpell.name.replace(/_/g, ' ')}": ${resultText}` } })
              setStep('spell_result')
            }}
            disabled={!allFilled}
            className="btn-primary text-xs w-full mt-3 disabled:opacity-30"
          >
            <Check className="w-3.5 h-3.5 inline mr-1" /> Ergebnis bestätigen
          </button>
        </div>
      </div>
    )
  }

  // ── Step: SPELL RESULT ──
  if (step === 'spell_result') {
    const colorClass = isLiturgy ? 'text-purple-400' : 'text-blue-400'
    const costLabel = isLiturgy ? 'KaP' : 'AsP'
    const IconComp = isLiturgy ? Sun : Sparkles
    const result = spellResult
    const tmpl = selectedSpell?.template

    // Check if spell does damage
    const hasDamage = tmpl?.damage || tmpl?.effect_per_qs?.damage

    // Deduct cost on first render of success result
    if (result?.success && !spellCostDeductedRef.current) {
      spellCostDeductedRef.current = true
      const cost = parseInt(selectedSpell?.cost) || 0
      if (cost > 0) {
        const costField = isLiturgy ? 'kap_delta' : 'asp_delta'
        sendMessage?.({ type: 'vitals_update', payload: {
          character_id: combatant.characterId || combatant.id,
          vitals: { [costField]: -cost }
        }})
        addBattleLogEntry(battleId, { type: 'system', text: `${combatant.name}: -${cost} ${costLabel}` })
      }
    }

    return (
      <div className="space-y-3">
        <StepHeader title={`${selectedSpell?.name?.replace(/_/g, ' ')} — Ergebnis`} step="Ergebnis" />

        {/* Result banner */}
        <div className={clsx(
          'rounded-sm border p-4 text-center',
          result?.critical ? 'bg-green-900/30 border-green-700/40' :
          result?.patzer ? 'bg-red-900/30 border-red-700/40' :
          result?.success ? 'bg-green-900/20 border-green-800/30' : 'bg-red-900/20 border-red-800/30'
        )}>
          <IconComp className={clsx('w-8 h-8 mx-auto mb-2', result?.success ? colorClass : 'text-red-400')} />
          <p className={clsx('text-xl font-bold', result?.critical ? 'text-green-400' : result?.patzer ? 'text-red-400' : result?.success ? 'text-green-400' : 'text-red-400')}>
            {result?.critical ? 'Kritischer Erfolg!' : result?.patzer ? 'Patzer!' : result?.success ? `Gelungen! QS ${result.qs}` : 'Misslungen!'}
          </p>
          <p className="text-sm text-dsa-parchment mt-1">{selectedSpell?.name?.replace(/_/g, ' ')}</p>
          {selectedTarget && <p className="text-[10px] text-dsa-parchment-dark">Ziel: {selectedTarget.name}</p>}
        </div>

        {/* Roll details */}
        {result?.details && (
          <div className="bg-dsa-bg-card/50 rounded border border-dsa-bg-medium p-2">
            <div className="flex justify-center gap-3">
              {result.details.map((d, i) => (
                <div key={i} className="text-center">
                  <div className={`text-[10px] ${d.ok ? 'text-green-400' : 'text-red-400'}`}>{d.attr}</div>
                  <div className="text-xs text-dsa-parchment-dark">Ziel {d.target}</div>
                  <div className={clsx('text-lg font-mono font-bold', d.ok ? 'text-green-400' : 'text-red-400')}>{d.roll}</div>
                  {d.over > 0 && <div className="text-[9px] text-red-400">−{d.over} FP</div>}
                </div>
              ))}
            </div>
            <div className="text-center mt-1 text-[9px] text-dsa-parchment-dark">
              FP: {result.fpRemaining}/{selectedSpell?.fw}
              {result.success && <span className={` ml-1 ${colorClass}`}>· QS {result.qs}</span>}
            </div>
          </div>
        )}

        {/* Cost deduction info */}
        {result?.success && (selectedSpell?.cost > 0) && (
          <div className={clsx('rounded-sm border px-3 py-2 text-xs', isLiturgy ? 'bg-purple-900/10 border-purple-800/20 text-purple-300' : 'bg-blue-900/10 border-blue-800/20 text-blue-300')}>
            −{selectedSpell.cost} {costLabel} abgezogen
          </div>
        )}

        {/* Spell description / effect note */}
        {tmpl?.desc && (
          <div className="bg-dsa-bg-card/50 rounded border border-dsa-bg-medium p-2">
            <p className="text-[10px] text-dsa-parchment/70 leading-relaxed">{tmpl.desc}</p>
          </div>
        )}

        {/* Damage hint */}
        {result?.success && hasDamage && (
          <div className="bg-red-900/10 border border-red-800/20 rounded-sm px-3 py-2">
            <p className="text-xs text-red-400">
              Schaden: <span className="font-mono font-bold">{tmpl.damage || tmpl.effect_per_qs?.damage}</span>
              {result.qs && tmpl.effect_per_qs?.damage && <span className="text-dsa-parchment-dark"> (QS {result.qs} beachten)</span>}
            </p>
            <p className="text-[9px] text-dsa-parchment-dark mt-0.5">Schaden manuell anwenden oder Zustandseffekte im Zustands-Tab eintragen.</p>
          </div>
        )}

        {/* Patzer warning */}
        {result?.patzer && (
          <div className="bg-red-900/20 border border-red-800/30 rounded-sm px-3 py-2">
            <p className="text-xs text-red-400 font-bold">Magischer Patzer!</p>
            <p className="text-[9px] text-dsa-parchment-dark">
              Der SL bestimmt den Patzer-Effekt. Mögliche Folgen: unkontrollierter Effekt, doppelte AsP-Kosten,
              Zustandsstufen, oder schlimmeres.
            </p>
          </div>
        )}

        {/* Critical success note */}
        {result?.critical && (
          <div className="bg-green-900/20 border border-green-800/30 rounded-sm px-3 py-2">
            <p className="text-xs text-green-400 font-bold">Kritischer Erfolg!</p>
            <p className="text-[9px] text-dsa-parchment-dark">
              Der Zauber gelingt besonders gut. Die {costLabel}-Kosten halbieren sich (auf Minimum 1).
              Der SL kann zusätzliche positive Effekte bestimmen.
            </p>
          </div>
        )}

        <button
          onClick={onComplete}
          className="btn-primary text-xs w-full"
        >
          Nächster Zug
        </button>
      </div>
    )
  }

  // ── Step: TARGET ──
  if (step === 'target') {
    return (
      <div className="space-y-2">
        <StepHeader title="Ziel wählen" step="2/6" onBack={() => availableWeapons.length > 1 ? setStep('weapon') : setStep('action')} />
        <p className="text-[9px] text-dsa-parchment-dark">Wen greift {combatant.name} an?</p>
        <div className="space-y-1">
          {enemies.map(target => (
            <button
              key={target.id}
              onClick={() => { setSelectedTarget(target); setStep(activeWeapon?.isRanged ? 'range' : 'maneuver') }}
              className="w-full flex items-center gap-2 px-2 py-2 bg-dsa-bg rounded-sm border border-dsa-bg-medium hover:border-dsa-gold/20 transition-colors text-left"
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${target.isNPC ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}`}>
                {(target.name || '?')[0]}
              </span>
              <div className="flex-1">
                <div className="text-xs text-dsa-parchment">{target.name}</div>
                <div className="text-[8px] text-dsa-parchment-dark">
                  LeP {target.lep ?? target.lepMax ?? 0}/{target.lepMax}
                  {target.position && combatant.position && (() => {
                    const dx = (target.position.x || 0) - (combatant.position.x || 0)
                    const dy = (target.position.y || 0) - (combatant.position.y || 0)
                    const dist = Math.round(Math.sqrt(dx * dx + dy * dy))
                    return <span className="ml-1">· {dist} Schritt entfernt</span>
                  })()}
                </div>
              </div>
            </button>
          ))}
          {enemies.length === 0 && <p className="text-[10px] text-dsa-parchment-dark text-center">Keine Ziele verfügbar.</p>}
        </div>
      </div>
    )
  }

  // ── Step: RANGE DISTANCE (ranged attacks only) ──
  if (step === 'range') {
    const RANGE_BRACKETS = [
      { id: 'nah', label: 'Nah', mod: -2, desc: 'Unter 5 Schritt — Ziel ist zu nah' },
      { id: 'mittel', label: 'Mittel', mod: 0, desc: 'Normale Schussdistanz — keine Modifikation' },
      { id: 'weit', label: 'Weit', mod: -4, desc: 'Weite Entfernung — erschwerter Schuss' },
      { id: 'extrem', label: 'Extrem', mod: -8, desc: 'Extreme Distanz — fast unmöglich' },
    ]
    return (
      <div className="space-y-2">
        <StepHeader title="Entfernung wählen" step="3/6" onBack={() => setStep('target')} />
        <p className="text-[9px] text-dsa-parchment-dark">Wie weit ist das Ziel entfernt? Die Distanz beeinflusst den Fernkampfwert.</p>
        <div className="space-y-1">
          {RANGE_BRACKETS.map(b => (
            <button key={b.id} onClick={() => { setRangeDistance(b.id); setStep('maneuver') }}
              className="w-full flex items-center justify-between px-3 py-2 bg-dsa-bg rounded-sm border border-dsa-bg-medium hover:border-dsa-gold/20 transition-colors text-left">
              <div>
                <span className="text-xs text-dsa-parchment font-semibold">{b.label}</span>
                <span className="text-[9px] text-dsa-parchment-dark ml-2">{b.desc}</span>
              </div>
              <span className={`text-xs font-mono ${b.mod === 0 ? 'text-dsa-gold' : 'text-red-400'}`}>
                {b.mod === 0 ? '±0' : b.mod}
              </span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── Step: MANEUVER ──
  if (step === 'maneuver') {
    return (
      <div className="space-y-2">
        <StepHeader title="Manöver wählen" step="3/6" onBack={() => setStep('target')} />
        <p className="text-[9px] text-dsa-parchment-dark">Optional: Ein Basismanöver verändert AT und/oder Schaden. Max 1 Basismanöver + 1 Spezialmanöver pro Angriff.</p>
        <div className="space-y-1">
          {MANEUVERS.filter(m => {
            if (m.id === 'none') return true
            // Basis maneuvers (Wuchtschlag, Finte) are available to all combatants
            if (m.type === 'basis') return true
            // SF-gated maneuvers: check if combatant has the required SF
            if (!m.requiredSF) return true
            const abilities = combatant.specialAbilities || combatant.specials || combatant.special_abilities || []
            if (combatant.isNPC) return true // NPCs: show all maneuvers
            const hasSF = abilities.some(a => {
              const aName = (typeof a === 'string' ? a : a.name || '').toLowerCase()
              return aName === m.requiredSF.toLowerCase() || aName.includes(m.requiredSF.toLowerCase())
            })
            return hasSF
          }).map(m => (
            <button
              key={m.id}
              onClick={() => { setSelectedManeuver(m); setStep('attack') }}
              className={clsx(
                'w-full flex items-center gap-2 px-2 py-2 rounded-sm border transition-colors text-left',
                m.id === 'none' ? 'bg-dsa-bg border-dsa-bg-medium hover:border-dsa-gold/20' : 'bg-dsa-bg border-dsa-bg-medium hover:border-dsa-gold/20'
              )}
            >
              <div className="flex-1">
                <div className="text-xs text-dsa-parchment font-medium">{m.label}</div>
                <div className="text-[9px] text-dsa-parchment-dark">{m.desc}</div>
              </div>
              {m.id !== 'none' && (
                <div className="text-[9px] text-right flex-shrink-0">
                  <div className={m.atMod < 0 ? 'text-red-400' : m.atMod > 0 ? 'text-green-400' : 'text-dsa-parchment-dark'}>AT {m.atMod >= 0 ? '+' : ''}{m.atMod}</div>
                  {m.tpMod !== 0 && <div className="text-green-400">TP +{m.tpMod}</div>}
                  {m.defMod && <div className="text-blue-400">Gegner {m.defMod}</div>}
                  {m.halveRS && <div className="text-orange-400">RS ½</div>}
                  {m.ignoreRS && <div className="text-orange-400">-{m.ignoreRS} RS</div>}
                  {m.doubleDamage && <div className="text-red-400">SP x2</div>}
                  {m.noDamage && <div className="text-yellow-400">Kein SP</div>}
                  {m.requiredSF && <div className="text-purple-400 text-[8px]">SF</div>}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── Step: ATTACK ROLL ──
  if (step === 'attack') {
    // Send dice request to player if it's their turn
    const sendAttackDiceToPlayer = () => {
      sendMessage?.({
        type: 'dice_request',
        payload: {
          target_user_id: combatant.userId || combatant.characterId || combatant.id,
          type: 'attack',
          label: `Attacke auf ${selectedTarget?.name} — Würfle 1W20 (Zielwert: ${effectiveAT})`,
          dice: '1W20',
          target_value: effectiveAT,
          modifiers: selectedManeuver?.id !== 'none' ? [{ source: selectedManeuver.label, value: selectedManeuver.atMod }] : [],
        },
      })
    }

    return (
      <div className="space-y-3">
        <StepHeader title={`Angriff auf ${selectedTarget?.name}`} step="4/6" onBack={() => setStep('maneuver')} />
        <div className="bg-dsa-bg rounded border border-dsa-bg-medium p-3 text-center">
          <p className="text-[9px] text-dsa-parchment-dark mb-1">{attackerLabel}</p>
          {isPlayerTurn && (
            <button onClick={sendAttackDiceToPlayer} className="text-[9px] text-blue-400 bg-blue-900/20 rounded px-2 py-1 border border-blue-800/20 mb-2 hover:bg-blue-900/30">
              <Dice5 className="w-3 h-3 inline mr-1" /> Würfelaufforderung an Spieler senden
            </button>
          )}
          <p className="text-xs text-dsa-parchment mb-1">Würfle <span className="text-dsa-gold font-bold">1W20</span></p>
          <p className="text-[9px] text-dsa-parchment-dark mb-2">
            Zielwert: <span className="text-dsa-gold font-mono font-bold text-lg">{effectiveAT}</span>
            <span className="text-dsa-parchment-dark/50 ml-1">(AT {baseAT}{selectedManeuver?.atMod ? ` ${selectedManeuver.atMod >= 0 ? '+' : ''}${selectedManeuver.atMod} ${selectedManeuver.label}` : ''})</span>
          </p>
          <p className="text-[8px] text-dsa-parchment-dark/50">Ergebnis muss ≤ {effectiveAT} sein für einen Treffer. 1 = Kritisch. 20 = Patzer.</p>
          {modBreakdown.length > 0 && (
            <div className="mt-2 bg-dsa-bg-medium/30 rounded-sm px-2 py-1.5 text-left">
              <p className="text-[8px] text-dsa-parchment-dark/60 font-semibold mb-0.5">Modifikatoren:</p>
              {modBreakdown.map((m, i) => (
                <p key={i} className="text-[8px] text-dsa-parchment-dark">{m}</p>
              ))}
            </div>
          )}
          <input
            type="number" min="1" max="20"
            value={attackRoll}
            onChange={(e) => setAttackRoll(e.target.value)}
            className="w-16 h-16 bg-dsa-bg-light border-2 border-dsa-gold/30 rounded text-center text-3xl font-mono text-dsa-gold mx-auto mt-2 focus:outline-none focus:border-dsa-gold focus:ring-2 focus:ring-dsa-gold/20"
            placeholder="—"
            autoFocus
          />
          {attackRoll && parseInt(attackRoll) >= 1 && parseInt(attackRoll) <= 20 && (
            <div className="mt-2">
              {(() => {
                const roll = parseInt(attackRoll)
                const hit = roll <= effectiveAT
                const critical = roll === 1
                const patzer = roll === 20
                return (
                  <div className={clsx('py-2 px-3 rounded-sm', hit ? 'bg-green-900/20 border border-green-800/30' : 'bg-red-900/20 border border-red-800/30')}>
                    <p className={clsx('text-sm font-bold', hit ? 'text-green-400' : 'text-red-400')}>
                      {critical ? '⚡ Kritischer Treffer!' : patzer ? '💥 Patzer!' : hit ? '✓ Treffer!' : '✗ Daneben!'}
                    </p>
                    {critical && <p className="text-[9px] text-green-400/60">Bestätigung: Nochmal 1W20 würfeln. Bei ≤ AT: doppelter Schaden!</p>}
                    {patzer && <p className="text-[9px] text-red-400/60">Bestätigung: Nochmal 1W20 würfeln. Bei &gt; AT: Waffe fällt, Eigentreffer, etc.</p>}
                  </div>
                )
              })()}
            </div>
          )}
          <button
            onClick={() => {
              const roll = parseInt(attackRoll)
              if (isNaN(roll) || roll < 1 || roll > 20) return
              const hit = roll <= effectiveAT
              const critical = roll === 1
              const patzer = roll === 20
              setAttackResult({ hit, critical, patzer, roll })
              addBattleLogEntry(battleId, {
                type: critical ? 'critical' : patzer ? 'fumble' : hit ? 'attack' : 'miss',
                text: `${combatant.name} greift ${selectedTarget.name} an: ${roll} ${hit ? '≤' : '>'} ${effectiveAT} — ${critical ? 'KRITISCH!' : patzer ? 'PATZER!' : hit ? 'Treffer!' : 'Daneben!'}${selectedManeuver.id !== 'none' ? ` (${selectedManeuver.label})` : ''}`,
              })
              // Critical or Patzer → confirmation step
              if (critical || patzer) {
                setConfirmRoll('')
                setConfirmResult(null)
                setFumbleRoll('')
                setFumbleResult(null)
                setStep('confirm_attack')
              } else if (hit) {
                setStep('defense')
              } else {
                setTimeout(onComplete, 1500)
              }
            }}
            disabled={!attackRoll || parseInt(attackRoll) < 1 || parseInt(attackRoll) > 20}
            className="btn-primary text-xs mt-3 disabled:opacity-30"
          >
            Bestätigen
          </button>
        </div>
      </div>
    )
  }

  // ── Step: DEFENSE ──
  if (step === 'defense') {
    const effectivePA = basePA + reactionPenalty + fintePenalty
    const effectiveAW = baseAW + reactionPenalty

    // Auto-send defense_request to player target
    if (isTargetPlayer && !autoSentRef.current.defenseRequest) {
      autoSentRef.current.defenseRequest = true
      sendMessage?.({
        type: 'defense_request',
        payload: {
          target_user_id: selectedTarget.userId || selectedTarget.characterId || selectedTarget.id,
          attacker_name: combatant.name,
          pa: effectivePA, aw: effectiveAW,
        },
      })
    }

    // For player targets: show "waiting for player" (defense handled on player's screen)
    if (isTargetPlayer && !defenseResult) {
      return (
        <div className="space-y-3">
          <StepHeader title={`${selectedTarget?.name} verteidigt sich`} step="5/6" />
          <div className="text-center py-4">
            <Shield className="w-8 h-8 text-blue-400 mx-auto mb-2" />
            <p className="text-sm text-dsa-parchment mb-1">{selectedTarget?.name} wurde getroffen!</p>
            <div className="px-6 py-3 bg-blue-900/20 text-blue-400 border border-blue-800/20 rounded text-sm flex items-center justify-center gap-2 animate-pulse">
              Warte auf Verteidigung des Spielers...
            </div>
            <p className="text-[9px] text-dsa-parchment-dark mt-2">PA {effectivePA} · AW {effectiveAW}</p>
            <button onClick={() => { setDefenseResult({ success: false, roll: 0, timeout: true }); setStep('damage') }}
              className="mt-3 text-[9px] text-dsa-parchment-dark hover:text-dsa-parchment transition">
              Spieler antwortet nicht — Treffer akzeptieren
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="space-y-3">
        <StepHeader title={`${selectedTarget?.name} verteidigt sich`} step="5/6" />
        <p className="text-[9px] text-dsa-parchment-dark">
          {selectedTarget?.name} wurde getroffen! Wie verteidigt {selectedTarget?.isNPC ? 'er/sie' : 'der Spieler'} sich?
          {targetReactionCount > 0 && <span className="text-yellow-400"> ({targetReactionCount + 1}. Verteidigung: {reactionPenalty} Malus, kostet 1 SchiP)</span>}
        </p>
        {/* SchiP requirement: additional reactions (2+) require Schicksalspunkte */}
        {targetReactionCount > 0 && (selectedTarget?.schip ?? selectedTarget?.currentSchiP ?? 1) <= 0 && (
          <div className="px-3 py-2 bg-red-900/20 border border-red-800/30 rounded text-[10px] text-red-400">
            Keine Schicksalspunkte übrig — keine weitere Verteidigung möglich! Treffer wird akzeptiert.
          </div>
        )}
        <div className="space-y-1">
          {DEFENSE_OPTIONS.map(opt => {
            // Block Parade/Ausweichen if no SchiP left for additional reactions
            const needsSchiP = targetReactionCount > 0 && opt.id !== 'accept'
            const hasSchiP = (selectedTarget?.schip ?? selectedTarget?.currentSchiP ?? 1) > 0
            const blocked = needsSchiP && !hasSchiP
            return (
            <button
              key={opt.id}
              disabled={blocked}
              onClick={() => {
                if (blocked) return
                setDefenseType(opt)
                if (opt.id === 'accept') {
                  setDefenseResult({ success: false })
                  addBattleLogEntry(battleId, { type: 'defense', text: `${selectedTarget.name} akzeptiert den Treffer.` })
                  setStep('damage')
                }
              }}
              className={clsx(
                'w-full flex items-center gap-2 px-2 py-2 rounded-sm border transition-colors text-left',
                blocked ? 'bg-dsa-bg-medium/50 border-dsa-bg-medium opacity-40 cursor-not-allowed' : 'bg-dsa-bg border-dsa-bg-medium hover:border-dsa-gold/20'
              )}
            >
              <opt.icon className="w-4 h-4 text-dsa-gold flex-shrink-0" />
              <div className="flex-1">
                <div className="text-xs text-dsa-parchment font-medium">{opt.label}</div>
                <div className="text-[9px] text-dsa-parchment-dark">{opt.desc}</div>
              </div>
              {opt.id === 'parade' && <span className="text-xs font-mono text-dsa-gold">{effectivePA}</span>}
              {opt.id === 'ausweichen' && <span className="text-xs font-mono text-dsa-gold">{effectiveAW}</span>}
            </button>
          )})}
        </div>

        {/* Defense roll input */}
        {defenseType && defenseType.id !== 'accept' && (
          <div className="bg-dsa-bg rounded border border-dsa-bg-medium p-3 text-center">
            <p className="text-[9px] text-dsa-parchment-dark mb-1">{defenderLabel}</p>
            {isTargetPlayer && (
              <button
                onClick={() => {
                  const target = defenseType.id === 'parade' ? effectivePA : effectiveAW
                  sendMessage?.({
                    type: 'dice_request',
                    payload: {
                      target_user_id: selectedTarget.userId || selectedTarget.characterId || selectedTarget.id,
                      type: 'defense',
                      label: `${defenseType.label} — Würfle 1W20 (Zielwert: ${target})`,
                      dice: '1W20',
                      target_value: target,
                      defense_type: defenseType.id,
                    },
                  })
                }}
                className="text-[9px] text-blue-400 bg-blue-900/20 rounded px-2 py-1 border border-blue-800/20 mb-2 hover:bg-blue-900/30"
              >
                <Dice5 className="w-3 h-3 inline mr-1" /> Würfelaufforderung an {selectedTarget?.name} senden
              </button>
            )}
            <p className="text-xs text-dsa-parchment mb-1">
              {defenseType.id === 'parade' ? 'Parade' : 'Ausweichen'}: Würfle <span className="text-dsa-gold font-bold">1W20</span>
            </p>
            <p className="text-[9px] text-dsa-parchment-dark mb-2">
              Zielwert: <span className="text-dsa-gold font-mono font-bold text-lg">{defenseType.id === 'parade' ? effectivePA : effectiveAW}</span>
            </p>
            <input
              type="number" min="1" max="20"
              value={defenseRoll}
              onChange={(e) => setDefenseRoll(e.target.value)}
              className="input-field text-center text-3xl font-mono w-20 mx-auto"
              placeholder="?"
              autoFocus
            />
            <button
              onClick={() => {
                const roll = parseInt(defenseRoll)
                if (isNaN(roll) || roll < 1 || roll > 20) return
                const target = defenseType.id === 'parade' ? effectivePA : effectiveAW
                const success = roll <= target
                const defCritical = roll === 1
                const defPatzer = roll === 20
                setDefenseResult({ success, roll, critical: defCritical, patzer: defPatzer })
                // SchiP deduction for additional reactions (2nd+ defense in same round)
                const wasAdditionalReaction = targetReactionCount > 0
                if (selectedTarget) {
                  selectedTarget._reactionsThisRound = (selectedTarget._reactionsThisRound || 0) + 1
                }
                if (wasAdditionalReaction && selectedTarget) {
                  const cid = selectedTarget.characterId || selectedTarget.id
                  const curSchip = selectedTarget.schip ?? selectedTarget.currentSchiP ?? 0
                  if (curSchip > 0) {
                    sendMessage?.({
                      type: 'schip_use',
                      payload: { character_id: cid, usage: 'additional_reaction' },
                    })
                  }
                }
                addBattleLogEntry(battleId, {
                  type: defCritical ? 'critical' : success ? 'defense' : 'damage',
                  text: `${selectedTarget.name} ${defenseType.label}: ${roll} ${success ? '≤' : '>'} ${target} — ${defCritical ? 'Kritische Verteidigung!' : defPatzer ? 'Patzer bei Verteidigung!' : success ? 'Verteidigung gelingt!' : 'Verteidigung misslingt!'}${wasAdditionalReaction ? ' (1 SchiP verbraucht)' : ''}`,
                })
                sendMessage?.({ type: 'combat_log_entry', payload: {
                  type: defCritical ? 'critical' : success ? 'defense' : 'damage',
                  text: `${selectedTarget.name} ${defenseType.label}: ${defCritical ? 'Kritische Verteidigung!' : defPatzer ? 'Verteidigungspatzer!' : success ? 'Verteidigung gelingt!' : 'Verteidigung misslingt!'}${wasAdditionalReaction ? ' (1 SchiP verbraucht)' : ''}`,
                }})
                // Defense critical/Patzer → confirmation step
                if (defPatzer) {
                  setConfirmRoll('')
                  setConfirmResult(null)
                  setFumbleRoll('')
                  setFumbleResult(null)
                  setStep('confirm_defense')
                } else if (defCritical) {
                  addBattleLogEntry(battleId, { type: 'system', text: `${selectedTarget.name}: Kritische Verteidigung! Angriff geht ins Leere — Angreifer ist offen.` })
                  setTimeout(onComplete, 1500)
                } else if (success) {
                  setTimeout(onComplete, 1500)
                } else {
                  setStep('damage')
                  // If attacker is a player, send them a damage dice_request
                  if (isPlayerTurn) {
                    sendMessage?.({
                      type: 'dice_request',
                      payload: {
                        target_user_id: combatant.userId || combatant.characterId || combatant.id,
                        type: 'damage',
                        dice: weaponDamage,
                        label: `Schaden würfeln: ${weaponDamage}`,
                      },
                    })
                  }
                }
              }}
              disabled={!defenseRoll || parseInt(defenseRoll) < 1 || parseInt(defenseRoll) > 20}
              className="btn-primary text-xs mt-2 disabled:opacity-30"
            >
              Bestätigen
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Step: CONFIRM ATTACK (critical or Patzer) ──
  if (step === 'confirm_attack') {
    const isCrit = attackResult?.critical
    const isPatzer = attackResult?.patzer
    const isRanged = selectedAction?.id === 'ranged'

    return (
      <div className="space-y-3">
        <StepHeader title={isCrit ? 'Kritischen Treffer bestätigen' : 'Patzer bestätigen'} step="Bestätigung" onBack={() => setStep('attack')} />
        <div className={clsx('rounded-sm border p-3 text-center', isCrit ? 'bg-green-900/20 border-green-800/30' : 'bg-red-900/20 border-red-800/30')}>
          <p className={clsx('text-lg font-bold mb-1', isCrit ? 'text-green-400' : 'text-red-400')}>
            {isCrit ? '⚡ Kritischer Treffer!' : '💥 Patzer!'}
          </p>
          <p className="text-xs text-dsa-parchment-dark mb-3">
            {isCrit
              ? `Würfle nochmal 1W20. Bei ≤ ${effectiveAT} (Attackewert) wird der Schaden verdoppelt (nach Rüstungsschutz). Bei > ${effectiveAT} ist es ein normaler Treffer.`
              : `Würfle nochmal 1W20. Bei > ${effectiveAT} (Attackewert) wird der Patzer bestätigt und die Patzer-Tabelle kommt zum Einsatz. Bei ≤ ${effectiveAT} ist es nur ein normaler Fehlschlag.`}
          </p>

          {/* Confirmation roll input */}
          {!confirmResult && (
            <div className="space-y-2">
              <p className="text-xs text-dsa-parchment">Bestätigungswurf: 1W20</p>
              <input
                type="number" min="1" max="20"
                value={confirmRoll}
                onChange={(e) => setConfirmRoll(e.target.value)}
                className="w-16 h-16 bg-dsa-bg-light border-2 border-dsa-gold/30 rounded text-center text-3xl font-mono text-dsa-gold mx-auto focus:outline-none focus:border-dsa-gold focus:ring-2 focus:ring-dsa-gold/20"
                placeholder="—"
                autoFocus
              />
              <button
                onClick={() => {
                  const roll = parseInt(confirmRoll)
                  if (isNaN(roll) || roll < 1 || roll > 20) return
                  const confirmed = confirmCritical(roll, effectiveAT, isCrit ? 'critical' : 'patzer')
                  setConfirmResult({ confirmed, type: isCrit ? 'critical' : 'patzer' })
                  if (isCrit && confirmed) {
                    setCriticalConfirmed(true)
                    addBattleLogEntry(battleId, { type: 'critical', text: `Kritischer Treffer bestätigt! (${roll} ≤ ${effectiveAT}) — Schaden wird verdoppelt!` })
                    sendMessage?.({ type: 'combat_log_entry', payload: { type: 'critical', text: `${combatant.name}: Kritischer Treffer bestätigt! Schaden verdoppelt!` } })
                  } else if (isCrit && !confirmed) {
                    addBattleLogEntry(battleId, { type: 'attack', text: `Kritischer Treffer nicht bestätigt (${roll} > ${effectiveAT}) — normaler Treffer.` })
                  } else if (isPatzer && confirmed) {
                    addBattleLogEntry(battleId, { type: 'fumble', text: `Patzer bestätigt! (${roll} > ${effectiveAT}) — Patzer-Tabelle!` })
                    sendMessage?.({ type: 'combat_log_entry', payload: { type: 'fumble', text: `${combatant.name}: Patzer bestätigt! Würfle 2W6 auf der Patzer-Tabelle.` } })
                  } else {
                    addBattleLogEntry(battleId, { type: 'miss', text: `Patzer nicht bestätigt (${roll} ≤ ${effectiveAT}) — einfacher Fehlschlag.` })
                  }
                }}
                disabled={!confirmRoll || parseInt(confirmRoll) < 1}
                className="btn-primary text-xs mt-2 disabled:opacity-30"
              >
                Bestätigen
              </button>
            </div>
          )}

          {/* Result */}
          {confirmResult && (
            <div className="mt-3 space-y-2">
              <p className={clsx('text-sm font-bold', confirmResult.confirmed ? (isCrit ? 'text-green-400' : 'text-red-400') : 'text-dsa-parchment')}>
                {confirmResult.confirmed
                  ? (isCrit ? '✓ Bestätigt — Schaden x2!' : '✗ Patzer bestätigt!')
                  : (isCrit ? 'Nicht bestätigt — normaler Treffer' : 'Nicht bestätigt — einfacher Fehlschlag')}
              </p>

              {/* Fumble table — only if Patzer confirmed */}
              {isPatzer && confirmResult.confirmed && !fumbleResult && (
                <div className="mt-2 bg-red-900/30 border border-red-800/40 rounded-sm p-3">
                  <p className="text-xs text-red-400 font-bold mb-2">Patzer-Tabelle — würfle 2W6</p>
                  <input
                    type="number" min="2" max="12"
                    value={fumbleRoll}
                    onChange={(e) => setFumbleRoll(e.target.value)}
                    className="w-16 h-12 bg-dsa-bg-light border-2 border-red-700 rounded text-center text-2xl font-mono text-red-400 mx-auto focus:outline-none focus:ring-2 focus:ring-red-400/20"
                    placeholder="—"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      const roll = parseInt(fumbleRoll)
                      if (isNaN(roll) || roll < 2 || roll > 12) return
                      const result = lookupFumble(roll, isRanged ? 'ranged' : 'attack')
                      setFumbleResult(result)
                      addBattleLogEntry(battleId, { type: 'fumble', text: `Patzer-Tabelle (${roll}): ${result.name} — ${result.desc}` })
                      sendMessage?.({ type: 'combat_log_entry', payload: { type: 'fumble', text: `${combatant.name} Patzer: ${result.name} — ${result.desc}` } })
                    }}
                    disabled={!fumbleRoll || parseInt(fumbleRoll) < 2}
                    className="btn-primary text-xs mt-2 bg-red-900/50 border-red-700 text-red-400 hover:bg-red-900/70 disabled:opacity-30"
                  >
                    Ergebnis nachschlagen
                  </button>
                </div>
              )}

              {/* Fumble result display */}
              {fumbleResult && (
                <div className="bg-red-900/20 border border-red-800/30 rounded-sm p-3 text-left">
                  <p className="text-sm font-bold text-red-400">{fumbleResult.name}</p>
                  <p className="text-xs text-dsa-parchment mt-1">{fumbleResult.desc}</p>
                  {fumbleResult.normalResult && (
                    <p className="text-[10px] text-dsa-parchment-dark mt-1 italic">
                      Bei normalen Waffen: {fumbleResult.normalResult.name} — {fumbleResult.normalResult.desc}
                    </p>
                  )}
                </div>
              )}

              {/* Continue button */}
              <button
                onClick={() => {
                  if (isCrit) {
                    // Critical → always a hit, go to defense
                    setStep('defense')
                  } else if (isPatzer && confirmResult.confirmed) {
                    // Confirmed Patzer → turn ends (attacker suffers fumble effect)
                    setTimeout(onComplete, 500)
                  } else {
                    // Unconfirmed Patzer → simple miss
                    setTimeout(onComplete, 500)
                  }
                }}
                disabled={isPatzer && confirmResult.confirmed && !fumbleResult}
                className="btn-primary text-xs mt-2 disabled:opacity-30"
              >
                {isCrit ? 'Weiter zur Verteidigung' : 'Zug beenden'}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Step: CONFIRM DEFENSE (Patzer on defense) ──
  if (step === 'confirm_defense') {
    const defTarget = defenseType?.id === 'parade' ? effectivePA : effectiveAW

    return (
      <div className="space-y-3">
        <StepHeader title="Verteidigungs-Patzer bestätigen" step="Bestätigung" />
        <div className="bg-red-900/20 border border-red-800/30 rounded-sm p-3 text-center">
          <p className="text-lg font-bold text-red-400 mb-1">💥 Patzer bei der Verteidigung!</p>
          <p className="text-xs text-dsa-parchment-dark mb-3">
            {selectedTarget?.name} hat eine 20 bei der {defenseType?.label || 'Verteidigung'} gewürfelt.
            Bestätigungswurf: 1W20 — bei &gt; {defTarget} wird der Patzer bestätigt.
          </p>

          {!confirmResult && (
            <div className="space-y-2">
              <input
                type="number" min="1" max="20"
                value={confirmRoll}
                onChange={(e) => setConfirmRoll(e.target.value)}
                className="w-16 h-16 bg-dsa-bg-light border-2 border-red-700 rounded text-center text-3xl font-mono text-red-400 mx-auto focus:outline-none focus:ring-2 focus:ring-red-400/20"
                placeholder="—"
                autoFocus
              />
              <button
                onClick={() => {
                  const roll = parseInt(confirmRoll)
                  if (isNaN(roll) || roll < 1 || roll > 20) return
                  const confirmed = confirmCritical(roll, defTarget, 'patzer')
                  setConfirmResult({ confirmed, type: 'patzer' })
                  if (confirmed) {
                    addBattleLogEntry(battleId, { type: 'fumble', text: `Verteidigungs-Patzer bestätigt! (${roll} > ${defTarget})` })
                  } else {
                    addBattleLogEntry(battleId, { type: 'damage', text: `Verteidigungs-Patzer nicht bestätigt (${roll} ≤ ${defTarget}) — Verteidigung misslingt normal.` })
                  }
                }}
                disabled={!confirmRoll || parseInt(confirmRoll) < 1}
                className="btn-primary text-xs mt-2 bg-red-900/50 border-red-700 text-red-400 hover:bg-red-900/70 disabled:opacity-30"
              >
                Bestätigen
              </button>
            </div>
          )}

          {confirmResult && (
            <div className="mt-3 space-y-2">
              <p className={clsx('text-sm font-bold', confirmResult.confirmed ? 'text-red-400' : 'text-dsa-parchment')}>
                {confirmResult.confirmed ? '✗ Patzer bestätigt!' : 'Nicht bestätigt — normale Verteidigungsniederlage'}
              </p>

              {/* Fumble table */}
              {confirmResult.confirmed && !fumbleResult && (
                <div className="mt-2 bg-red-900/30 border border-red-800/40 rounded-sm p-3">
                  <p className="text-xs text-red-400 font-bold mb-2">Verteidigungs-Patzer-Tabelle — würfle 2W6</p>
                  <input
                    type="number" min="2" max="12"
                    value={fumbleRoll}
                    onChange={(e) => setFumbleRoll(e.target.value)}
                    className="w-16 h-12 bg-dsa-bg-light border-2 border-red-700 rounded text-center text-2xl font-mono text-red-400 mx-auto focus:outline-none focus:ring-2 focus:ring-red-400/20"
                    placeholder="—"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      const roll = parseInt(fumbleRoll)
                      if (isNaN(roll) || roll < 2 || roll > 12) return
                      const result = lookupFumble(roll, 'defense')
                      setFumbleResult(result)
                      addBattleLogEntry(battleId, { type: 'fumble', text: `Verteidigungs-Patzer (${roll}): ${result.name} — ${result.desc}` })
                      sendMessage?.({ type: 'combat_log_entry', payload: { type: 'fumble', text: `${selectedTarget?.name} Verteidigungs-Patzer: ${result.name}` } })
                    }}
                    disabled={!fumbleRoll || parseInt(fumbleRoll) < 2}
                    className="btn-primary text-xs mt-2 bg-red-900/50 border-red-700 text-red-400 hover:bg-red-900/70 disabled:opacity-30"
                  >
                    Ergebnis nachschlagen
                  </button>
                </div>
              )}

              {fumbleResult && (
                <div className="bg-red-900/20 border border-red-800/30 rounded-sm p-3 text-left">
                  <p className="text-sm font-bold text-red-400">{fumbleResult.name}</p>
                  <p className="text-xs text-dsa-parchment mt-1">{fumbleResult.desc}</p>
                  {fumbleResult.normalResult && (
                    <p className="text-[10px] text-dsa-parchment-dark mt-1 italic">
                      Bei normalen Waffen: {fumbleResult.normalResult.name} — {fumbleResult.normalResult.desc}
                    </p>
                  )}
                </div>
              )}

              <button
                onClick={() => {
                  // Defense failed (Patzer or not) → go to damage
                  setStep('damage')
                  if (isPlayerTurn) {
                    sendMessage?.({
                      type: 'dice_request',
                      payload: {
                        target_user_id: combatant.userId || combatant.characterId || combatant.id,
                        type: 'damage',
                        dice: weaponDamage,
                        label: `Schaden würfeln: ${weaponDamage}`,
                      },
                    })
                  }
                }}
                disabled={confirmResult.confirmed && !fumbleResult}
                className="btn-primary text-xs mt-2 disabled:opacity-30"
              >
                Weiter zum Schaden
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Step: DAMAGE ──
  if (step === 'damage') {
    const targetRS = selectedTarget?.rs || 0

    // Player attack → player rolls damage on their screen, auto-applied via lastDiceResult
    if (isPlayerTurn && !damageResult) {
      return (
        <div className="space-y-3">
          <StepHeader title="Schaden berechnen" step="6/6" />
          <div className="text-center py-4">
            <Swords className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-sm text-dsa-parchment mb-1">{combatant.name} würfelt Schaden gegen {selectedTarget?.name}</p>
            <p className="text-[9px] text-dsa-parchment-dark mb-1">Waffe: {weaponName} ({weaponDamage}) — RS Ziel: {targetRS}</p>
            <div className="px-6 py-3 bg-red-900/20 text-red-400 border border-red-800/20 rounded text-sm flex items-center justify-center gap-2 animate-pulse">
              Warte auf Schadenswurf des Spielers...
            </div>
          </div>
        </div>
      )
    }

    // Show result after auto-apply
    if (damageResult) {
      return (
        <div className="space-y-3">
          <StepHeader title="Schaden" step="6/6" />
          <div className="text-center py-4">
            <p className="text-lg font-bold text-red-400">{damageResult.sp} Schadenspunkte!</p>
            <p className="text-sm text-dsa-parchment">{selectedTarget?.name}: LeP → {damageResult.newLep}</p>
            {damageResult.newLep <= 0 && <p className="text-red-500 font-bold mt-1">Bewusstlos!</p>}
          </div>
        </div>
      )
    }

    // NPC attack → GM enters damage manually
    return (
      <div className="space-y-3">
        <StepHeader title="Schaden berechnen" step="6/6" />
        <p className="text-[9px] text-dsa-parchment-dark">
          Treffer mit <span className="text-dsa-gold">{weaponName}</span>!
          Schadenswürfel: <span className="text-dsa-gold font-mono font-bold">{weaponDamage}</span>
          {selectedManeuver?.tpMod > 0 && <span className="text-green-400"> + {selectedManeuver.tpMod} ({selectedManeuver.label})</span>}
          {' '}— Rüstungsschutz des Ziels: <span className="font-mono">{targetRS}</span>
        </p>
        <div className="bg-dsa-bg rounded border border-dsa-bg-medium p-3 text-center">
          <p className="text-xs text-dsa-parchment mb-1">Würfle <span className="text-dsa-gold font-bold font-mono">{weaponDamage}</span> und gib das Gesamtergebnis ein:</p>
          <input
            type="number" min="1"
            value={damageRoll}
            onChange={(e) => setDamageRoll(e.target.value)}
            className="input-field text-center text-3xl font-mono w-20 mx-auto"
            placeholder="?"
            autoFocus
          />
          {damageRoll && parseInt(damageRoll) >= 1 && (() => {
            const raw = parseInt(damageRoll) + (selectedManeuver?.tpMod || 0)
            const _halveRS = selectedManeuver?.halveRS || false
            const _ignoreRS = selectedManeuver?.ignoreRS || 0
            const _effRS = Math.max(0, (_halveRS ? Math.floor(targetRS / 2) : targetRS) - _ignoreRS)
            let _mult = 1
            if (selectedManeuver?.doubleDamage) _mult = 2
            if (criticalConfirmed) _mult = Math.max(_mult, 2)
            const _noDmg = selectedManeuver?.noDamage || false
            const sp = _noDmg ? 0 : Math.max(0, Math.floor((raw - _effRS) * _mult))
            const oldLep = selectedTarget?.lep ?? selectedTarget?.lepMax ?? 30
            const newLep = Math.max(0, oldLep - sp)
            return (
              <div className="mt-2 space-y-1 text-xs">
                <div className="text-dsa-parchment-dark">Roh: {parseInt(damageRoll)}{selectedManeuver?.tpMod > 0 ? ` + ${selectedManeuver.tpMod}` : ''} = {raw} TP</div>
                <div className="text-dsa-parchment-dark">Minus RS {_effRS}{_halveRS ? ' (halbiert)' : ''}{_ignoreRS ? ` (-${_ignoreRS})` : ''}: <span className="text-red-400 font-bold">{sp} Schadenspunkte</span></div>
                {_mult > 1 && <div className="text-red-400">x{_mult} (Todesstoß)</div>}
                {_noDmg && <div className="text-yellow-400">Kein Schaden (Entwaffnen)</div>}
                <div className="text-dsa-parchment">LeP: {oldLep} → <span className={newLep <= 0 ? 'text-red-500 font-bold' : 'text-dsa-gold'}>{newLep}</span></div>
              </div>
            )
          })()}
          <button
            onClick={() => {
              const raw = parseInt(damageRoll) + (selectedManeuver?.tpMod || 0)
              const _halveRS = selectedManeuver?.halveRS || false
              const _ignoreRS = selectedManeuver?.ignoreRS || 0
              const _effRS = Math.max(0, (_halveRS ? Math.floor(targetRS / 2) : targetRS) - _ignoreRS)
              let _mult = 1
              if (selectedManeuver?.doubleDamage) _mult = 2
              const _noDmg = selectedManeuver?.noDamage || false
              const sp = _noDmg ? 0 : Math.max(0, Math.floor((raw - _effRS) * _mult))
              const oldLep = selectedTarget?.lep ?? selectedTarget?.lepMax ?? 30
              const newLep = Math.max(0, oldLep - sp)
              updateCombatant(selectedTarget.id, { lep: newLep })
              const dmgLogText = `${combatant.name} trifft ${selectedTarget.name} für ${sp} SP! (LeP: ${oldLep} → ${newLep})`
              addBattleLogEntry(battleId, { type: 'damage', text: dmgLogText })
              // Calculate and apply Schmerz condition based on Wundschwelle
              {
                const targetCharData = useCharacterStore.getState().allCharacters.find(c => c.id === selectedTarget.characterId)
                const targetKO = targetCharData?.attributes?.KO
                const painLevel = calculatePainLevel(newLep, selectedTarget.lepMax || 30, targetKO)
                const oldPainLevel = calculatePainLevel(oldLep, selectedTarget.lepMax || 30, targetKO)
                if (newLep <= 0) {
                  addBattleLogEntry(battleId, { type: 'critical', text: `${selectedTarget.name} fällt bewusstlos!` })
                  const updConds = addCondition(selectedTarget.conditions || [], 'Bewusstlos', 1)
                  updateCombatant(selectedTarget.id, { conditions: updConds })
                  if (selectedTarget.characterId) {
                    sendMessage?.({ type: 'conditions_update', payload: { character_id: selectedTarget.characterId, conditions: updConds } })
                  }
                } else if (painLevel > oldPainLevel) {
                  addBattleLogEntry(battleId, { type: 'system', text: `${selectedTarget.name}: Schmerz ${['','I','II','III','IV'][painLevel]} (Wundschwelle überschritten)` })
                  sendMessage?.({ type: 'combat_log_entry', payload: { type: 'system', text: `${selectedTarget.name}: Schmerz ${['','I','II','III','IV'][painLevel]}` } })
                  // Apply Schmerz condition at the new level (set, not stack)
                  let updConds = [...(selectedTarget.conditions || [])]
                  const existingPain = updConds.find(c => c.name === 'Schmerz')
                  if (existingPain) {
                    existingPain.level = Math.max(existingPain.level || 1, painLevel)
                  } else {
                    updConds.push({ name: 'Schmerz', level: painLevel })
                  }
                  updateCombatant(selectedTarget.id, { conditions: updConds })
                  if (selectedTarget.characterId) {
                    sendMessage?.({ type: 'conditions_update', payload: { character_id: selectedTarget.characterId, conditions: updConds } })
                  }
                }
              }
              sendMessage?.({ type: 'vitals_update', payload: { character_id: selectedTarget.characterId || selectedTarget.id, token_id: selectedTarget.id, vitals: { lep: newLep } } })
              sendMessage?.({ type: 'combat_log_entry', payload: { type: 'damage', text: dmgLogText } })
              // Weapon poison trigger
              if (combatant.poisonedWeapon && sp > 0) {
                const pw = combatant.poisonedWeapon
                if (pw.weaponName === activeWeapon.name || !pw.weaponName) {
                  const poisonLog = `☠ ${selectedTarget.name} wurde mit ${pw.poisonName} (Stufe ${pw.stufe}) vergiftet! ZK-Probe${pw.zkMod ? ` ${pw.zkMod}` : ''} nötig. ${pw.damage || ''}`
                  addBattleLogEntry(battleId, { type: 'system', text: poisonLog })
                  sendMessage?.({ type: 'combat_log_entry', payload: { type: 'system', text: poisonLog } })
                  const remaining = (pw.hitsRemaining || 1) - 1
                  if (remaining <= 0) updateCombatant(combatant.id, { poisonedWeapon: null })
                  else updateCombatant(combatant.id, { poisonedWeapon: { ...pw, hitsRemaining: remaining } })
                }
              }
              setDamageResult({ sp, newLep })
              if (canDualAttack && !activeWeapon._isOffHand) {
                setTimeout(() => setStep('offhand_prompt'), 2000)
              } else {
                setTimeout(onComplete, 2000)
              }
            }}
            disabled={!damageRoll || parseInt(damageRoll) < 1}
            className="btn-primary text-xs mt-3 disabled:opacity-30"
          >
            Schaden anwenden
          </button>
        </div>
      </div>
    )
  }

  // ── Off-hand attack prompt ──
  if (step === 'offhand_prompt') {
    const offHandWeapon = meleeWeaponsList.find(w => w.name !== activeWeapon.name) || meleeWeaponsList[1]
    return (
      <div className="space-y-3">
        <StepHeader title="Nebenhand-Angriff" step="Bonus" />
        <div className="bg-dsa-gold/10 border border-dsa-gold/20 rounded p-3 text-center">
          <Swords className="w-6 h-6 text-dsa-gold mx-auto mb-2" />
          <p className="text-sm font-bold text-dsa-gold mb-1">Beidhändiger Kampf — Zusatzangriff!</p>
          <p className="text-xs text-dsa-parchment mb-2">
            Du kannst mit deiner Nebenhand (<strong>{offHandWeapon?.name || 'Zweitwaffe'}</strong>) einen zusätzlichen Angriff ausführen.
            Dieser Angriff hat einen Abzug von <strong className="text-red-400">{beidhaendigPenalty}</strong> auf die Attacke.
          </p>
          <p className="text-[10px] text-dsa-parchment-dark mb-3">Du kannst ein anderes Ziel wählen als beim Hauptangriff.</p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => {
                // Set up off-hand attack: reset attack state, use off-hand weapon with penalty
                const ohWeapon = { ...offHandWeapon, at: (offHandWeapon?.at || 6) + beidhaendigPenalty, _isOffHand: true }
                setSelectedWeapon(ohWeapon)
                setSelectedTarget(null)
                setAttackRoll('')
                setAttackResult(null)
                setDefenseType(null)
                setDefenseRoll('')
                setDefenseResult(null)
                setDamageRoll('')
                setDamageResult(null)
                setOffHandDone(true)
                // Reset auto-sent flags so dice requests are sent for the off-hand attack
                autoSentRef.current = {}
                setStep('target')
              }}
              className="btn-primary text-xs px-4"
            >
              Nebenhand-Angriff ausführen
            </button>
            <button
              onClick={() => { setOffHandDone(true); onComplete() }}
              className="btn-secondary text-xs px-4"
            >
              Verzichten
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Weapon switch action ──
  if (step === 'switch_weapon') {
    return (
      <div className="space-y-3">
        <StepHeader title="Waffe wechseln" step="Aktion" onBack={() => setStep('action')} />
        <p className="text-xs text-dsa-parchment-dark">Waffe wechseln kostet eine Aktion. Wechsel erfolgt im Ausrüstungs-Tab.</p>
        <button onClick={onComplete} className="btn-primary text-xs">Zug beenden</button>
      </div>
    )
  }

  return null
}

function StepHeader({ title, step, onBack }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {onBack && (
          <button onClick={onBack} className="text-dsa-parchment-dark hover:text-dsa-parchment">
            <ChevronRight className="w-3 h-3 rotate-180" />
          </button>
        )}
        <h4 className="text-xs font-semibold text-dsa-gold">{title}</h4>
      </div>
      {step && <span className="text-[8px] text-dsa-parchment-dark bg-dsa-bg-medium rounded px-1.5 py-0.5">Schritt {step}</span>}
    </div>
  )
}
