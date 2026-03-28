import { useState, useEffect, useRef } from 'react'
import {
  Swords, X, SkipForward, Plus, Heart, LogOut, Dice5,
  Shield, ChevronRight, AlertTriangle, Trophy, Users,
  Sparkles, Package, Footprints, Clock, Star, Target, Send, Pencil
} from 'lucide-react'
import useCharacterStore from '../../stores/characterStore'
import useCombatStore from '../../stores/combatStore'
import useSessionStore from '../../stores/sessionStore'
import TurnFlow from './TurnFlow'
import CreatureEditModal from './CreatureEditModal'
import Badge from '../../components/common/Badge'
import ProgressBar from '../../components/common/ProgressBar'
import { getCreatureIcon } from '../../utils/icons'
import ActiveBuffs from '../../components/common/ActiveBuffs'
import Modal from '../../components/common/Modal'
import { PLAYER_MANEUVERS } from '../../engine/combatManeuvers'
import { tickConditions, calculatePainLevel, addCondition } from '../../engine/conditionsEngine'
import clsx from 'clsx'

/**
 * CombatOverlay — Fullscreen combat management window.
 *
 * Single battle, single initiative order (correct DSA5).
 * Appears as an overlay on top of the GM cockpit.
 *
 * Layout:
 * ┌─────────────────────────────────────────────────────┐
 * │  HEADER: Battle name, round, end button             │
 * ├────────────────────────────┬────────────────────────┤
 * │                            │                        │
 * │  INITIATIVE ORDER          │   TURN FLOW            │
 * │  (left, scrollable)        │   (right, main area)   │
 * │                            │                        │
 * │  All combatants listed     │   Action selection     │
 * │  Active highlighted        │   Target picking       │
 * │  HP bars, conditions       │   Dice inputs          │
 * │  Quick damage/heal         │   Results              │
 * │                            │                        │
 * ├────────────────────────────┴────────────────────────┤
 * │  COMBAT LOG (bottom, scrollable)                    │
 * └─────────────────────────────────────────────────────┘
 */
export default function CombatOverlay({ battleId, onClose, onVictoryLoot, sendMessage, mapTokens = [], isGM = true, myCharacterId = null }) {
  const battles = useCombatStore((s) => s.battles)
  const endBattle = useCombatStore((s) => s.endBattle)
  const nextTurn = useCombatStore((s) => s.nextTurn)
  const addCombatant = useCombatStore((s) => s.addCombatant)
  const removeCombatant = useCombatStore((s) => s.removeCombatant)
  const updateCombatant = useCombatStore((s) => s.updateCombatant)
  const addBattleLogEntry = useCombatStore((s) => s.addBattleLogEntry)
  const players = useSessionStore((s) => s.players)

  const notifications = useSessionStore((s) => s.notifications)
  const dismissNotification = useSessionStore((s) => s.dismissNotification)
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const [showAddCombatant, setShowAddCombatant] = useState(false)
  const [addSelection, setAddSelection] = useState({}) // tokenId → bool
  const [showTurnFlow, setShowTurnFlow] = useState(false)
  const [approvedAction, setApprovedAction] = useState(null)
  const [editingCreature, setEditingCreature] = useState(null)
  const [victoryData, setVictoryData] = useState(null) // { survivors, fallen, rounds, deadNPCs, summary }
  const pendingPlayerAction = useCombatStore((s) => s.pendingPlayerAction)
  const clearPendingPlayerAction = useCombatStore((s) => s.clearPendingPlayerAction)

  // Player-specific state
  const myCharacter = useCharacterStore((s) => s.myCharacter)
  const pendingDiceRequest = useCombatStore((s) => s.pendingDiceRequest)
  const pendingDefense = useCombatStore((s) => s.pendingDefense)
  const clearPendingDiceRequest = useCombatStore((s) => s.clearPendingDiceRequest)
  const clearPendingDefense = useCombatStore((s) => s.clearPendingDefense)
  const [playerAction, setPlayerAction] = useState(null)
  const [playerTarget, setPlayerTarget] = useState(null)
  const [playerManeuver, setPlayerManeuver] = useState(null)
  const [playerAttackStep, setPlayerAttackStep] = useState(null) // 'roll_at' | 'wait_defense' | 'roll_damage' | 'done'
  const [playerDiceValue, setPlayerDiceValue] = useState('')
  const [playerAttackHit, setPlayerAttackHit] = useState(null)
  const [playerDefenseChoice, setPlayerDefenseChoice] = useState(null)
  const [playerDefenseRoll, setPlayerDefenseRoll] = useState('')
  const [playerDamageValue, setPlayerDamageValue] = useState('')

  // PLAYER_MANEUVERS imported from '../../engine/combatManeuvers'

  // Find first available battle if battleId not provided (player side)
  const effectiveBattleId = battleId || Object.keys(battles)[0]
  const battle = battles[effectiveBattleId]

  const current = battle?.initiativeOrder?.[battle?.currentTurnIndex]
  const myId = myCharacterId || myCharacter?.id
  const isMyTurn = !isGM && !!current && current.characterId === myId

  // Reset player turn state when turn changes
  useEffect(() => {
    if (!isMyTurn) {
      setPlayerAction(null); setPlayerTarget(null); setPlayerManeuver(null)
      setPlayerAttackStep(null); setPlayerAttackHit(null); setPlayerDiceValue('')
      setPlayerDamageValue('')
    }
  }, [isMyTurn])

  // When damage dice_request arrives, transition from wait_defense to roll_damage
  useEffect(() => {
    if (pendingDiceRequest?.type === 'damage' && playerAttackStep === 'wait_defense') {
      setPlayerAttackStep('roll_damage')
      clearPendingDiceRequest()
    }
  }, [pendingDiceRequest, playerAttackStep])

  // Auto-react to player action declarations (attack/spell)
  useEffect(() => {
    if (!pendingPlayerAction || showTurnFlow) return
    if (pendingPlayerAction.action_type === 'attack') {
      setApprovedAction({
        type: 'attack',
        target_name: pendingPlayerAction.target_name,
        target_id: pendingPlayerAction.target_id,
        maneuver: pendingPlayerAction.maneuver,
      })
      setShowTurnFlow(true)
      clearPendingPlayerAction()
    }
  }, [pendingPlayerAction])

  // ── Victory Screen ──
  if (victoryData) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
        <div className="bg-dsa-bg border border-dsa-gold/30 rounded shadow-2xl w-full max-w-lg overflow-hidden">
          <div className="bg-gradient-to-r from-dsa-gold/20 to-dsa-gold/5 border-b border-dsa-gold/20 px-6 py-4 text-center">
            <div className="w-16 h-16 rounded-full bg-dsa-gold/20 ring-2 ring-dsa-gold/30 flex items-center justify-center mx-auto mb-3">
              <Star className="w-8 h-8 text-dsa-gold" fill="currentColor" />
            </div>
            <h2 className="text-xl font-display font-bold text-dsa-gold">Sieg der Helden!</h2>
            <p className="text-xs text-dsa-parchment-dark mt-1">{victoryData.rounds} Runden · {victoryData.fallen.length > 0 ? `${victoryData.fallen.length} Gefallene` : 'Keine Verluste'}</p>
          </div>

          <div className="p-6 space-y-3">
            {victoryData.survivors.length > 0 && (
              <div>
                <p className="text-[10px] text-dsa-gold font-semibold uppercase tracking-wider mb-1">Überlebende</p>
                <p className="text-sm text-dsa-parchment">{victoryData.survivors.filter(c => c.name).map(c => c.name).join(', ')}</p>
              </div>
            )}
            {victoryData.fallen.length > 0 && (
              <div>
                <p className="text-[10px] text-red-400 font-semibold uppercase tracking-wider mb-1">Gefallen</p>
                <p className="text-sm text-red-300">{victoryData.fallen.join(', ')}</p>
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-dsa-bg-medium flex justify-end">
            <button
              onClick={() => { setVictoryData(null); onClose() }}
              className="px-5 py-2 bg-dsa-gold/10 text-dsa-gold border border-dsa-gold/30 rounded text-sm font-medium hover:bg-dsa-gold/20 transition"
            >
              Schliessen
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!battle) return null

  // Combat-relevant notifications (only Sonstiges still needs approval)
  const combatNotifs = notifications.filter(n =>
    n.type === 'action_request'
  )
  const allSorted = [...battle.initiativeOrder].sort((a, b) => (b.initiative || 0) - (a.initiative || 0))

  const handleNextTurn = () => {
    setShowTurnFlow(false)

    // Check if combat should auto-end (all NPCs or all PCs down)
    const aliveNPCs = battle.initiativeOrder.filter(c => c.isNPC && (c.lep === undefined || c.lep > 0))
    const alivePCs = battle.initiativeOrder.filter(c => !c.isNPC && (c.lep === undefined || c.lep > 0))
    if (aliveNPCs.length === 0 || alivePCs.length === 0) {
      const heroesWon = aliveNPCs.length === 0
      const deadNPCs = battle.initiativeOrder.filter(c => c.isNPC && c.lep !== undefined && c.lep <= 0)
      const fallen = battle.initiativeOrder.filter(c => c.lep !== undefined && c.lep <= 0).map(c => c.name)
      const survivors = battle.initiativeOrder.filter(c => c.lep === undefined || c.lep > 0).map(c => c.name)
      const summary = heroesWon ? 'Sieg der Helden!' : 'Die Helden sind gefallen...'
      sendMessage?.({ type: 'combat_log_entry', payload: { type: 'system', text: `Kampf vorbei — ${summary}` } })
      // Send combat_end with result summary so players see a proper ending
      const survivorPCs = battle.initiativeOrder.filter(c => !c.isNPC && (c.lep === undefined || c.lep > 0))
      endBattle(battleId)
      sendMessage?.({
        type: 'combat_end',
        payload: {
          battle_id: battleId,
          result: heroesWon ? 'victory' : 'defeat',
          summary,
          fallen,
          survivors,
          rounds: battle.round,
        },
      })
      // On hero victory, show victory screen before closing
      if (heroesWon) {
        setVictoryData({ survivors: survivorPCs, fallen, rounds: battle.round, deadNPCs, summary })
        // Trigger loot distribution
        if (onVictoryLoot) {
          const deadNPCLoot = deadNPCs.map(npc => {
            const token = mapTokens.find(t => t.id === npc.id)
            const loot = token?.guaranteed_loot || token?.stats?.guaranteed_loot || []
            return { name: npc.name, items: loot }
          }).filter(l => l.items.length > 0)
          const deadNPCNames = deadNPCs.map(c => c.name)
          onVictoryLoot({ deadNPCs: deadNPCNames, loot: deadNPCLoot })
        }
      } else {
        onClose()
      }
      return
    }

    const prevRound = battle.round
    nextTurn(battleId)
    // Broadcast full combat state to all players
    const updatedBattle = useCombatStore.getState().battles[battleId]
    if (updatedBattle) {
      // Tick conditions at round start: reduce durations, apply poison DoT, remove expired
      if (updatedBattle.round > prevRound) {
        for (const c of updatedBattle.initiativeOrder) {
          if (!c.conditions || c.conditions.length === 0) continue
          const { conditions: remaining, poisonDamage, expired } = tickConditions([...c.conditions])
          if (expired.length > 0) {
            addBattleLogEntry(battleId, { type: 'system', text: `${c.name}: ${expired.join(', ')} abgeklungen.` })
            sendMessage?.({ type: 'combat_log_entry', payload: { type: 'system', text: `${c.name}: ${expired.join(', ')} abgeklungen.` } })
          }
          if (poisonDamage > 0) {
            const oldLep = c.lep ?? c.lepMax ?? 30
            const newLep = Math.max(0, oldLep - poisonDamage)
            updateCombatant(c.id, { lep: newLep, conditions: remaining })
            addBattleLogEntry(battleId, { type: 'damage', text: `${c.name}: ${poisonDamage} Giftschaden (LeP ${oldLep} → ${newLep})` })
            sendMessage?.({ type: 'vitals_update', payload: { character_id: c.characterId || c.id, token_id: c.id, vitals: { lep: newLep } } })
            sendMessage?.({ type: 'combat_log_entry', payload: { type: 'damage', text: `${c.name}: ${poisonDamage} Giftschaden` } })
          } else if (expired.length > 0) {
            updateCombatant(c.id, { conditions: remaining })
          }
          if (c.characterId) {
            sendMessage?.({ type: 'conditions_update', payload: { character_id: c.characterId, conditions: remaining } })
          }
        }
      }

      const nextCombatant = updatedBattle.initiativeOrder[updatedBattle.currentTurnIndex]
      sendMessage?.({
        type: 'combat_next_turn',
        payload: {
          battle_id: battleId,
          round: updatedBattle.round,
          current_turn_index: updatedBattle.currentTurnIndex,
          combatant_name: nextCombatant?.name,
          combatant_id: nextCombatant?.characterId || nextCombatant?.id,
          initiative_order: updatedBattle.initiativeOrder,
        },
      })
    }
  }

  const handleEnd = () => {
    endBattle(battleId)
    sendMessage?.({ type: 'combat_end', payload: { battle_id: battleId } })
    onClose()
  }

  const handleDamage = (c) => {
    const input = prompt(`${c.name}: Schaden (positiv) oder Heilung (negativ)`)
    if (input === null) return
    const val = parseInt(input, 10)
    if (isNaN(val)) return
    const oldLep = c.lep ?? c.lepMax ?? 30
    const newLep = Math.max(0, Math.min(c.lepMax || 30, oldLep - val))
    updateCombatant(c.id, { lep: newLep })
    addBattleLogEntry(battleId, {
      type: val > 0 ? 'damage' : 'heal',
      text: val > 0 ? `${c.name}: ${val} Schaden (LeP ${oldLep} → ${newLep})` : `${c.name}: ${Math.abs(val)} geheilt (LeP ${oldLep} → ${newLep})`,
    })
    // Broadcast to all — updates map tokens, player vitals, and combat display
    sendMessage?.({ type: 'vitals_update', payload: { character_id: c.characterId || c.id, token_id: c.id, vitals: { lep: newLep } } })
    sendMessage?.({ type: 'combat_log_entry', payload: { text: val > 0 ? `${c.name} erleidet ${val} Schadenspunkte!` : `${c.name} wird um ${Math.abs(val)} geheilt.`, type: val > 0 ? 'damage' : 'heal' } })
    // Pain thresholds — calculate using DSA5 Wundschwelle when KO is available
    if (val > 0 && c.lepMax) {
      const allChars = useCharacterStore.getState().allCharacters || []
      const charData = allChars.find(ch => ch.id === c.characterId)
      const targetKO = charData?.attributes?.KO
      const painLevel = calculatePainLevel(newLep, c.lepMax, targetKO)
      const oldPainLevel = calculatePainLevel(oldLep, c.lepMax, targetKO)
      if (newLep <= 0) {
        addBattleLogEntry(effectiveBattleId, { type: 'critical', text: `${c.name} ist bewusstlos!` })
        const updConds = addCondition(c.conditions || [], 'Bewusstlos', 1)
        updateCombatant(c.id, { conditions: updConds })
        if (c.characterId) {
          sendMessage?.({ type: 'conditions_update', payload: { character_id: c.characterId, conditions: updConds } })
        }
      } else if (painLevel > oldPainLevel) {
        addBattleLogEntry(effectiveBattleId, { type: 'system', text: `${c.name}: Schmerz ${['','I','II','III','IV'][painLevel]}` })
        sendMessage?.({ type: 'combat_log_entry', payload: { type: 'system', text: `${c.name}: Schmerz ${['','I','II','III','IV'][painLevel]}` } })
        let updConds = [...(c.conditions || [])]
        const existingPain = updConds.find(cond => cond.name === 'Schmerz')
        if (existingPain) {
          existingPain.level = Math.max(existingPain.level || 1, painLevel)
        } else {
          updConds.push({ name: 'Schmerz', level: painLevel })
        }
        updateCombatant(c.id, { conditions: updConds })
        if (c.characterId) {
          sendMessage?.({ type: 'conditions_update', payload: { character_id: c.characterId, conditions: updConds } })
        }
      }
    }
  }

  // Available tokens not yet in this battle
  const availableTokens = mapTokens.filter(t =>
    (t.entity_type === 'creature' || t.entity_type === 'npc' || t.entity_type === 'player') &&
    !battle.initiativeOrder.some(c => c.id === t.id)
  )

  const addTokenToBattle = (t) => {
    const dv = t.derived_values || t.stats || {}
    addCombatant(battleId, {
      id: t.id, name: t.name,
      userId: t.user_id || null,
      characterId: t.character_id || null,
      initiative: 0, iniBasis: dv.INI_basis || dv.ini_basis || 10, iniRoll: null,
      isNPC: t.entity_type !== 'player',
      lep: t.current_lep || t.max_lep || 30, lepMax: t.max_lep || 30,
      at: dv.AT || 12, pa: dv.PA || 8, aw: dv.AW || 5, rs: dv.RS || 0,
      weaponName: t.attacks?.[0]?.name || 'Waffe',
      weaponDamage: t.attacks?.[0]?.damage || '1W6+4',
      attacks: t.attacks || [],
      conditions: [], position: { x: t.position_x, y: t.position_y },
      entityType: t.entity_type,
    })
  }

  const handleConfirmAdd = () => {
    const toAdd = availableTokens.filter(t => addSelection[t.id])
    for (const t of toAdd) {
      addTokenToBattle(t)
    }
    if (toAdd.length > 0) {
      addBattleLogEntry(battleId, { type: 'system', text: `${toAdd.length} Kaempfer hinzugefuegt. Initiative wuerfeln!` })
      sendMessage?.({ type: 'combat_log_entry', payload: { text: `${toAdd.length} neue Kaempfer treten dem Kampf bei!` } })
    }
    setAddSelection({})
    setShowAddCombatant(false)
  }

  // When new tokens are spawned during combat, they appear in the add-combatant list via mapTokens

  return (
    <div className={isGM ? "fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" : "h-full flex flex-col"}>
      <div className={isGM ? "bg-dsa-bg border border-dsa-bg-medium rounded shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden" : "bg-dsa-bg flex-1 flex flex-col overflow-hidden"}>
        {/* ── HEADER ── */}
        <div className="flex items-center justify-between px-5 py-3 bg-red-950/30 border-b border-red-900/30">
          <div className="flex items-center gap-3">
            <Swords className="w-5 h-5 text-red-400" />
            <h2 className="text-lg font-display font-bold text-dsa-gold">{battle.name}</h2>
            <Badge variant="danger" size="sm">Runde {battle.round}</Badge>
            <span className="text-xs text-dsa-parchment-dark">{battle.initiativeOrder.length} Kaempfer</span>
          </div>
          <div className="flex items-center gap-2">
            {isGM && (
              <button onClick={() => setShowEndConfirm(true)} className="text-xs text-dsa-parchment-dark hover:text-red-400 transition-colors">
                Kampf beenden
              </button>
            )}
            {isMyTurn && <Badge variant="gold" size="sm">Dein Zug!</Badge>}
            <button onClick={onClose} className="text-dsa-parchment-dark hover:text-dsa-parchment">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── MAIN CONTENT ── */}
        <div className="flex-1 flex overflow-hidden">
          {/* LEFT: Initiative Order */}
          <div className="w-72 flex-shrink-0 border-r border-dsa-bg-medium bg-dsa-bg-light overflow-y-auto p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-dsa-gold">Initiative-Reihenfolge</h3>
              {isGM && (
                <button onClick={() => setShowAddCombatant(true)} className="text-dsa-parchment-dark hover:text-dsa-gold" title="Kaempfer hinzufuegen">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              {allSorted.map((c, idx) => {
                const isCurrent = c.id === current?.id
                const isDead = (c.lep ?? c.lepMax ?? 0) <= 0
                const lepPct = c.lepMax > 0 ? (c.lep ?? c.lepMax) / c.lepMax : 1
                const typeIcon = c.isNPC ? getCreatureIcon(c.name) : '🧝'

                return (
                  <div key={c.id} className={clsx(
                    'rounded border p-2.5 transition-all',
                    isCurrent ? 'border-dsa-gold/50 bg-dsa-gold/10 shadow-lg shadow-dsa-gold/10' :
                    isDead ? 'border-red-900/30 bg-red-950/10 opacity-40' :
                    'border-dsa-bg-medium bg-dsa-bg'
                  )}>
                    <div className="flex items-center gap-2">
                      {/* Turn indicator */}
                      <span className={clsx('w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0',
                        isCurrent ? 'bg-dsa-gold text-dsa-bg' : 'bg-dsa-bg-medium text-dsa-parchment-dark'
                      )}>
                        {isCurrent ? '▶' : c.initiative || '?'}
                      </span>

                      {/* Name */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px]">{typeIcon}</span>
                          <span className={clsx('text-xs font-medium truncate', isCurrent ? 'text-dsa-gold' : isDead ? 'line-through text-red-400' : 'text-dsa-parchment')}>
                            {c.name}
                          </span>
                        </div>
                        {/* INI roll if not set */}
                        {c.iniRoll === null || c.iniRoll === undefined ? (
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-[8px] text-dsa-parchment-dark">Basis {c.iniBasis || '?'} +</span>
                            <input
                              type="number" min="1" max="6"
                              className="w-7 h-4 bg-dsa-bg border border-dsa-gold/30 rounded text-center text-[9px] font-mono text-dsa-gold focus:outline-none focus:border-dsa-gold"
                              placeholder="W6"
                              onBlur={(e) => {
                                const roll = parseInt(e.target.value, 10)
                                if (!isNaN(roll) && roll >= 1 && roll <= 6) {
                                  const total = (c.iniBasis || 10) + roll
                                  updateCombatant(c.id, { iniRoll: roll, initiative: total })
                                  addBattleLogEntry(battleId, { type: 'system', text: `${c.name}: INI ${c.iniBasis || '?'} + ${roll} = ${total}` })
                                }
                              }}
                              onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
                            />
                            {!c.isNPC && (
                              <button onClick={() => sendMessage?.({ type: 'dice_request', payload: { target_user_id: c.userId || c.characterId, type: 'initiative', label: `Initiative wuerfeln: 1W6 (dein INI-Basis: ${c.iniBasis || '?'})`, dice: '1W6' } })}
                                className="text-blue-400 hover:text-blue-300" title="Spieler 1W6 wuerfeln lassen">
                                <Dice5 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="text-[8px] text-dsa-parchment-dark mt-0.5">
                            INI {c.iniBasis || '?'} + {c.iniRoll} = <span className="text-dsa-gold font-mono">{c.initiative}</span>
                          </div>
                        )}
                      </div>

                      {/* HP */}
                      <div className="flex-shrink-0 w-10">
                        <ProgressBar value={c.lep ?? c.lepMax ?? 0} max={c.lepMax || 30} variant="health" size="sm" />
                        <div className="text-[7px] text-center text-dsa-parchment-dark font-mono">{c.lep ?? c.lepMax ?? 0}/{c.lepMax}</div>
                      </div>
                    </div>
                    {/* Active buffs */}
                    <ActiveBuffs characterId={c.characterId || c.id} compact />

                    {/* Actions row — GM only */}
                    {isGM && (
                      <div className="flex gap-1 mt-1.5">
                        <button onClick={() => handleDamage(c)} className="flex-1 flex items-center justify-center gap-0.5 py-0.5 rounded bg-dsa-bg-medium text-[8px] text-dsa-parchment-dark hover:text-red-400 transition-colors" title="Schaden/Heilen">
                          <Heart className="w-2.5 h-2.5" /> SP
                        </button>
                        {c.isNPC && (
                          <button onClick={() => setEditingCreature(c)} className="flex-1 flex items-center justify-center gap-0.5 py-0.5 rounded bg-dsa-bg-medium text-[8px] text-dsa-parchment-dark hover:text-dsa-gold transition-colors" title="Stats bearbeiten">
                            <Pencil className="w-2.5 h-2.5" /> Edit
                          </button>
                        )}
                        <button onClick={() => { removeCombatant(effectiveBattleId, c.id); addBattleLogEntry(effectiveBattleId, { type: 'system', text: `${c.name} verlaesst den Kampf.` }) }}
                          className="flex-1 flex items-center justify-center gap-0.5 py-0.5 rounded bg-dsa-bg-medium text-[8px] text-dsa-parchment-dark hover:text-red-400 transition-colors" title="Entfernen">
                          <LogOut className="w-2.5 h-2.5" /> Raus
                        </button>
                      </div>
                    )}
                    {/* "DU" indicator for player */}
                    {!isGM && c.characterId === myId && (
                      <div className="text-[8px] text-green-400 font-bold text-center mt-1">DU</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* RIGHT: Turn Flow (GM) or Player Actions */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Turn area */}
            <div className="flex-1 overflow-y-auto p-5">

              {/* ═══ PLAYER VIEW ═══ */}
              {!isGM ? (
                <div className="h-full flex flex-col">
                  {/* Pending defense — top priority */}
                  {pendingDefense ? (
                    <div className="space-y-3">
                      {!playerDefenseChoice ? (
                        <div className="bg-red-950/20 border-2 border-red-800/40 rounded p-5 text-center space-y-3">
                          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" />
                          <h3 className="text-lg font-display font-bold text-red-400">Du wirst angegriffen!</h3>
                          <p className="text-sm text-dsa-parchment">{pendingDefense.attacker_name} greift dich an!</p>
                          <div className="flex justify-center gap-3">
                            <button onClick={() => setPlayerDefenseChoice('parade')} className="px-4 py-3 bg-blue-900/30 text-blue-400 border border-blue-800/30 rounded hover:bg-blue-900/50">
                              <Shield className="w-5 h-5 mx-auto mb-1" /><div className="text-xs font-medium">Parade</div>
                              <div className="text-[10px] text-blue-400/60">PA {myCharacter?.combat_values?.weapons?.[0]?.PA || '?'}</div>
                            </button>
                            <button onClick={() => setPlayerDefenseChoice('ausweichen')} className="px-4 py-3 bg-cyan-900/30 text-cyan-400 border border-cyan-800/30 rounded hover:bg-cyan-900/50">
                              <Footprints className="w-5 h-5 mx-auto mb-1" /><div className="text-xs font-medium">Ausweichen</div>
                              <div className="text-[10px] text-cyan-400/60">AW {myCharacter?.derived_values?.AW || '?'}</div>
                            </button>
                            <button onClick={() => { sendMessage?.({ type: 'dice_result', payload: { request_type: 'defense', defense_type: 'accept', value: 99, character_name: myCharacter?.name, character_id: myId } }); clearPendingDefense(); setPlayerDefenseChoice(null) }} className="px-4 py-3 bg-dsa-bg text-dsa-parchment-dark border border-dsa-bg-medium rounded hover:text-dsa-parchment">
                              <Heart className="w-5 h-5 mx-auto mb-1" /><div className="text-xs font-medium">Hinnehmen</div>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-blue-950/20 border-2 border-blue-800/40 rounded p-5 text-center space-y-3">
                          <Shield className="w-8 h-8 text-blue-400 mx-auto" />
                          <h3 className="text-lg font-display font-bold text-blue-400">{playerDefenseChoice === 'parade' ? 'Parade' : 'Ausweichen'}</h3>
                          <p className="text-xs text-dsa-parchment">Wuerfle <span className="text-dsa-gold font-bold">1W20</span> — Zielwert: <span className="text-dsa-gold font-mono font-bold text-2xl">{playerDefenseChoice === 'parade' ? (myCharacter?.combat_values?.weapons?.[0]?.PA || '?') : (myCharacter?.derived_values?.AW || '?')}</span></p>
                          <input type="number" min="1" max="20" value={playerDefenseRoll} onChange={(e) => setPlayerDefenseRoll(e.target.value)} className="w-20 h-20 bg-dsa-bg-light border-2 border-blue-500/50 rounded text-center text-4xl font-mono text-blue-400 mx-auto focus:outline-none focus:border-blue-400" placeholder="—" autoFocus />
                          <button onClick={() => {
                            const roll = parseInt(playerDefenseRoll); if (isNaN(roll) || roll < 1 || roll > 20) return
                            sendMessage?.({ type: 'dice_result', payload: { request_type: 'defense', defense_type: playerDefenseChoice, value: roll, character_name: myCharacter?.name, character_id: myId } })
                            clearPendingDefense(); setPlayerDefenseChoice(null); setPlayerDefenseRoll('')
                          }} disabled={!playerDefenseRoll || parseInt(playerDefenseRoll) < 1 || parseInt(playerDefenseRoll) > 20} className="btn-primary px-8 py-2 disabled:opacity-30">Bestaetigen</button>
                        </div>
                      )}
                    </div>
                  ) : pendingDiceRequest && !isMyTurn ? (
                    /* Generic dice prompt (initiative, etc.) */
                    <div className="bg-dsa-gold/10 border-2 border-dsa-gold/40 rounded p-5 text-center space-y-3">
                      <Dice5 className="w-8 h-8 text-dsa-gold mx-auto" />
                      <h3 className="text-lg font-display font-bold text-dsa-gold">{pendingDiceRequest.label || 'Wuerfeln!'}</h3>
                      <input type="number" min="1" max={pendingDiceRequest.dice === '1W6' ? 6 : 20} value={playerDiceValue} onChange={(e) => setPlayerDiceValue(e.target.value)} className="w-20 h-20 bg-dsa-bg-light border-2 border-dsa-gold/50 rounded text-center text-4xl font-mono text-dsa-gold mx-auto focus:outline-none focus:border-dsa-gold" placeholder="—" autoFocus />
                      <button onClick={() => {
                        const val = parseInt(playerDiceValue); if (isNaN(val) || val < 1) return
                        sendMessage?.({ type: 'dice_result', payload: { request_type: pendingDiceRequest.type, value: val, character_id: myId, character_name: myCharacter?.name, battle_id: pendingDiceRequest.battle_id, ini_basis: pendingDiceRequest.ini_basis } })
                        setPlayerDiceValue(''); clearPendingDiceRequest()
                      }} disabled={!playerDiceValue} className="btn-primary px-8 py-2 disabled:opacity-30">Bestaetigen</button>
                    </div>
                  ) : isMyTurn ? (
                    /* Player's turn — action selection */
                    <div className="space-y-4">
                      {!playerAction ? (
                        <>
                          <div className="text-center"><h3 className="text-xl font-display font-bold text-dsa-gold mb-1">Dein Zug!</h3>
                            <p className="text-xs text-dsa-parchment-dark">1 Aktion + 1 Freie Aktion + Bewegung</p></div>
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { id: 'attack', icon: Swords, label: 'Angreifen', cls: 'text-red-400 bg-red-950/10 border-red-900/20 hover:border-red-800/40' },
                              { id: 'spell', icon: Sparkles, label: 'Zaubern', cls: 'text-blue-400 bg-blue-950/10 border-blue-900/20 hover:border-blue-800/40', show: (myCharacter?.derived_values?.AsP_max || 0) > 0 },
                              { id: 'item', icon: Package, label: 'Gegenstand', cls: 'text-green-400 bg-green-950/10 border-green-900/20 hover:border-green-800/40' },
                              { id: 'move', icon: Footprints, label: 'Bewegen', cls: 'text-cyan-400 bg-cyan-950/10 border-cyan-900/20 hover:border-cyan-800/40' },
                              { id: 'ready', icon: Clock, label: 'Warten', cls: 'text-dsa-parchment-dark bg-dsa-bg border-dsa-bg-medium hover:border-dsa-gold/20' },
                              { id: 'custom', icon: Star, label: 'Sonstiges', cls: 'text-purple-400 bg-purple-950/10 border-purple-900/20 hover:border-purple-800/40' },
                            ].filter(a => a.show !== false).map(a => (
                              <button key={a.id} onClick={() => setPlayerAction(a.id)} className={`flex items-center gap-2 p-3 rounded border transition-all ${a.cls}`}>
                                <a.icon className="w-5 h-5" /><span className="text-sm font-medium">{a.label}</span>
                              </button>
                            ))}
                          </div>
                        </>
                      ) : playerAction === 'attack' && !playerTarget ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between"><h4 className="text-sm font-semibold text-red-400">Wen angreifen?</h4><button onClick={() => setPlayerAction(null)} className="text-[10px] text-dsa-parchment-dark hover:text-dsa-parchment">Zurueck</button></div>
                          <div className="space-y-1">{battle.initiativeOrder.filter(c => c.characterId !== myId && c.id !== myId && (c.lep ?? c.lepMax ?? 0) > 0).map(t => (
                            <button key={t.id} onClick={() => setPlayerTarget(t)} className="w-full flex items-center gap-2 px-3 py-2 bg-dsa-bg rounded border border-dsa-bg-medium hover:border-red-800/30 text-left">
                              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${t.isNPC ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'}`}>{(t.name||'?')[0]}</span>
                              <span className="text-xs text-dsa-parchment flex-1">{t.name}</span>
                              <span className="text-[9px] text-dsa-parchment-dark">LeP {t.lep || t.lepMax}/{t.lepMax}</span>
                            </button>
                          ))}</div>
                        </div>
                      ) : playerAction === 'attack' && playerTarget && !playerManeuver ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between"><h4 className="text-sm font-semibold text-red-400">Manoever</h4><button onClick={() => setPlayerTarget(null)} className="text-[10px] text-dsa-parchment-dark hover:text-dsa-parchment">Zurueck</button></div>
                          <p className="text-[10px] text-dsa-parchment-dark">Angriff auf <span className="text-dsa-gold">{playerTarget.name}</span></p>
                          <div className="space-y-1">{PLAYER_MANEUVERS.map(m => (
                            <button key={m.id} onClick={() => {
                              setPlayerManeuver(m); setPlayerAttackStep('roll_at')
                              sendMessage?.({ type: 'action_declare', payload: { character_name: myCharacter?.name, action_type: 'attack', action_label: `Angriff auf ${playerTarget.name}${m.id !== 'none' ? ` (${m.label})` : ''}`, target_name: playerTarget.name, target_id: playerTarget.id, maneuver: m.id !== 'none' ? m : null } })
                            }} className="w-full flex items-center gap-2 px-3 py-2 bg-dsa-bg rounded border border-dsa-bg-medium hover:border-red-800/30 text-left">
                              <span className="text-xs text-dsa-parchment flex-1">{m.label} <span className="text-dsa-parchment-dark text-[9px]">{m.desc}</span></span>
                              {m.id !== 'none' && <span className="text-[9px] text-red-400">AT{m.atMod >= 0 ? '+' : ''}{m.atMod}{m.tpMod > 0 ? ` TP+${m.tpMod}` : ''}</span>}
                            </button>
                          ))}</div>
                        </div>
                      ) : playerAction === 'attack' && playerAttackStep === 'roll_at' ? (
                        (() => {
                          const baseAT = myCharacter?.combat_values?.weapons?.[0]?.AT || 12
                          const effAT = baseAT + (playerManeuver?.atMod || 0)
                          return (
                            <div className="space-y-3">
                              <h4 className="text-sm font-semibold text-red-400">Attacke auf {playerTarget?.name}</h4>
                              <div className="bg-dsa-bg rounded border border-dsa-bg-medium p-4 text-center space-y-3">
                                <p className="text-xs text-dsa-parchment">Wuerfle <span className="text-dsa-gold font-bold">1W20</span> — Zielwert: <span className="text-dsa-gold font-mono font-bold text-2xl">{effAT}</span></p>
                                <input type="number" min="1" max="20" value={playerDiceValue} onChange={(e) => setPlayerDiceValue(e.target.value)} className="w-20 h-20 bg-dsa-bg-light border-2 border-dsa-gold/50 rounded text-center text-4xl font-mono text-dsa-gold mx-auto focus:outline-none focus:border-dsa-gold" placeholder="—" autoFocus />
                                {playerDiceValue && parseInt(playerDiceValue) >= 1 && parseInt(playerDiceValue) <= 20 && (() => { const r = parseInt(playerDiceValue); const hit = r <= effAT; return <div className={clsx('py-2 px-4 rounded inline-block', hit ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400')}><span className="font-bold">{r === 1 ? 'KRITISCH!' : r === 20 ? 'PATZER!' : hit ? 'Treffer!' : 'Daneben!'}</span></div> })()}
                                <button onClick={() => {
                                  const roll = parseInt(playerDiceValue); if (isNaN(roll) || roll < 1 || roll > 20) return
                                  const hit = roll <= effAT; setPlayerAttackHit(hit)
                                  sendMessage?.({ type: 'dice_result', payload: { request_type: 'attack', value: roll, character_name: myCharacter?.name, character_id: myId, target_name: playerTarget?.name, target_id: playerTarget?.id, maneuver: playerManeuver?.id !== 'none' ? playerManeuver : null } })
                                  if (hit) { setPlayerAttackStep('wait_defense'); setPlayerDiceValue('') } else { setPlayerAttackStep('done'); setTimeout(() => { setPlayerAction(null); setPlayerTarget(null); setPlayerManeuver(null); setPlayerAttackStep(null) }, 2000) }
                                }} disabled={!playerDiceValue || parseInt(playerDiceValue) < 1 || parseInt(playerDiceValue) > 20} className="btn-primary px-8 py-2 disabled:opacity-30">Bestaetigen</button>
                              </div>
                            </div>
                          )
                        })()
                      ) : playerAction === 'attack' && playerAttackStep === 'wait_defense' ? (
                        <div className="text-center py-8">
                          <Shield className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                          <p className="text-sm text-dsa-parchment">Treffer auf {playerTarget?.name}!</p>
                          <p className="text-xs text-dsa-parchment-dark animate-pulse mt-1">Warte auf Verteidigung...</p>
                        </div>
                      ) : playerAction === 'attack' && playerAttackStep === 'roll_damage' ? (
                        (() => {
                          const wpn = myCharacter?.combat_values?.weapons?.[0]; const dmg = wpn?.TP || wpn?.damage || '1W6+4'; const rs = playerTarget?.rs || 0
                          return (
                            <div className="space-y-3">
                              <h4 className="text-sm font-semibold text-red-400">Schaden an {playerTarget?.name}</h4>
                              <div className="bg-dsa-bg rounded border border-dsa-bg-medium p-4 text-center space-y-3">
                                <p className="text-xs text-dsa-parchment">Wuerfle <span className="text-dsa-gold font-bold font-mono">{dmg}</span>{playerManeuver?.tpMod > 0 && <span className="text-green-400"> +{playerManeuver.tpMod}</span>}</p>
                                <p className="text-[10px] text-dsa-parchment-dark">RS des Ziels: {rs}</p>
                                <input type="number" min="1" value={playerDamageValue} onChange={(e) => setPlayerDamageValue(e.target.value)} className="w-20 h-20 bg-dsa-bg-light border-2 border-dsa-gold/50 rounded text-center text-4xl font-mono text-dsa-gold mx-auto focus:outline-none focus:border-dsa-gold" placeholder="—" autoFocus />
                                {playerDamageValue && parseInt(playerDamageValue) >= 1 && (() => { const raw = parseInt(playerDamageValue) + (playerManeuver?.tpMod || 0); const sp = Math.max(0, raw - rs); return <div className="text-xs text-red-400 font-bold">{sp} Schadenspunkte</div> })()}
                                <button onClick={() => {
                                  const raw = parseInt(playerDamageValue) + (playerManeuver?.tpMod || 0); const sp = Math.max(0, raw - (playerTarget?.rs || 0))
                                  sendMessage?.({ type: 'dice_result', payload: { request_type: 'damage', value: parseInt(playerDamageValue), character_name: myCharacter?.name, character_id: myId, total_damage: sp, target_name: playerTarget?.name, target_id: playerTarget?.id } })
                                  setPlayerAttackStep('done'); setTimeout(() => { setPlayerAction(null); setPlayerTarget(null); setPlayerManeuver(null); setPlayerAttackStep(null); setPlayerDamageValue('') }, 2000)
                                }} disabled={!playerDamageValue || parseInt(playerDamageValue) < 1} className="btn-primary px-8 py-2 disabled:opacity-30">Schaden anwenden</button>
                              </div>
                            </div>
                          )
                        })()
                      ) : playerAction === 'attack' && playerAttackStep === 'done' ? (
                        <div className="text-center py-8"><p className={clsx('text-lg font-bold', playerAttackHit ? 'text-green-400' : 'text-red-400')}>{playerAttackHit ? 'Treffer! Schaden angewendet.' : 'Daneben!'}</p></div>
                      ) : playerAction === 'custom' ? (
                        <div className="text-center space-y-3"><Star className="w-6 h-6 text-purple-400 mx-auto" /><p className="text-sm text-dsa-parchment">Sag am Tisch was du tun moechtest!</p>
                          <div className="flex justify-center gap-2"><button onClick={() => setPlayerAction(null)} className="btn-ghost text-xs">Zurueck</button>
                          <button onClick={() => { const rId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; sendMessage?.({ type: 'action_request', payload: { request_id: rId, character_id: myId, character_name: myCharacter?.name, action_type: 'combat_custom', action_label: 'Sonstige Aktion' } }); useSessionStore.getState().setPendingRequest({ id: rId, type: 'action', label: 'Sonstige Aktion', timestamp: Date.now() }); setPlayerAction(null) }} className="btn-primary text-xs"><Send className="w-3 h-3 inline mr-1" />Anfrage senden</button></div>
                        </div>
                      ) : (
                        (() => { const labels = { spell: 'Zaubern', item: 'Gegenstand', move: 'Bewegen', ready: 'Warten' }; const l = labels[playerAction] || playerAction; return (
                          <div className="text-center space-y-3"><p className="text-sm text-dsa-parchment">{l}</p>
                            <div className="flex justify-center gap-2"><button onClick={() => setPlayerAction(null)} className="btn-ghost text-xs">Zurueck</button>
                            <button onClick={() => { sendMessage?.({ type: 'action_declare', payload: { character_name: myCharacter?.name, action_type: playerAction, action_label: l } }); setPlayerAction(null) }} className="btn-primary text-xs"><Send className="w-3 h-3 inline mr-1" />Ausfuehren</button></div>
                          </div>
                        )})()
                      )}
                    </div>
                  ) : (
                    /* Not my turn — waiting */
                    <div className="flex flex-col items-center justify-center h-full text-center">
                      <p className="text-sm text-dsa-parchment-dark"><span className="text-dsa-gold font-medium">{current?.name}</span> ist am Zug.</p>
                      <p className="text-xs text-dsa-parchment-dark/50 mt-1">Warte bis du dran bist oder angegriffen wirst.</p>
                    </div>
                  )}
                </div>

              ) : showTurnFlow && current ? (
                <TurnFlow
                  combatant={current}
                  battleId={battleId}
                  allCombatants={battle.initiativeOrder}
                  sendMessage={sendMessage}
                  approvedAction={approvedAction}
                  onComplete={() => {
                    setShowTurnFlow(false)
                    setApprovedAction(null)
                    handleNextTurn()
                  }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  {current ? (
                    <>
                      <div className={clsx('w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold mb-4',
                        current.isNPC ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
                      )}>
                        {(current.name || '?')[0]}
                      </div>
                      <h3 className="text-xl font-display font-bold text-dsa-gold mb-1">{current.name} ist dran</h3>
                      <p className="text-xs text-dsa-parchment-dark/50 mb-4">
                        Runde {battle.round} · Initiative {current.initiative || '?'} · LeP {current.lep || current.lepMax}/{current.lepMax}
                      </p>

                      {current.isNPC ? (
                        /* NPC turn — GM controls everything */
                        <>
                          <p className="text-sm text-dsa-parchment-dark mb-4">NSC/Kreatur — du steuerst diesen Kaempfer.</p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setShowTurnFlow(true)}
                              className="px-6 py-3 bg-red-900/30 text-red-400 border border-red-800/30 rounded text-sm font-medium hover:bg-red-900/50 transition-colors flex items-center gap-2"
                            >
                              <Swords className="w-4 h-4" /> Zug ausfuehren
                            </button>
                            <button
                              onClick={handleNextTurn}
                              className="px-6 py-3 bg-dsa-bg-card text-dsa-parchment-dark border border-dsa-bg-medium rounded text-sm hover:text-dsa-parchment transition-colors flex items-center gap-2"
                            >
                              <SkipForward className="w-4 h-4" /> Ueberspringen
                            </button>
                          </div>
                        </>
                      ) : (
                        /* Player turn — player decides, GM waits or intervenes */
                        <>
                          <p className="text-sm text-dsa-parchment-dark mb-2">Spieler-Charakter — {current.name} waehlt die Aktion.</p>

                          {/* Show incoming player action requests inline */}
                          {combatNotifs.length > 0 ? (
                            <div className="w-full max-w-md space-y-2 mb-4">
                              {combatNotifs.map(notif => (
                                <div key={notif.id} className="bg-dsa-gold/10 border border-dsa-gold/30 rounded p-3 text-left">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-semibold text-dsa-gold">{notif.payload?.character_name || notif.from}</span>
                                    <span className="text-[9px] text-dsa-parchment-dark">{notif.type === 'probe_request_from_player' ? 'Probe' : notif.type === 'spell_cast_request' ? 'Zauber' : 'Aktion'}</span>
                                  </div>
                                  <p className="text-xs text-dsa-parchment mb-2">{notif.payload?.action_label || notif.text}</p>
                                  <div className="flex gap-2">
                                    <button onClick={() => {
                                      sendMessage?.({ type: 'action_approved', payload: { ...notif.payload, approved: true } })
                                      dismissNotification(notif.id)
                                      // Open TurnFlow pre-set to the right step
                                      if (notif.payload?.action_type?.includes('attack')) {
                                        setApprovedAction({
                                          type: 'attack',
                                          target_name: notif.payload.target_name,
                                          target_id: notif.payload.target_id,
                                          maneuver: notif.payload.maneuver,
                                        })
                                        setShowTurnFlow(true)
                                      } else if (notif.payload?.action_type?.includes('spell')) {
                                        setApprovedAction({ type: 'spell', spell_name: notif.payload.spell_name })
                                        setShowTurnFlow(true)
                                      } else {
                                        // Non-combat action (move, item, etc.) — just advance
                                        handleNextTurn()
                                      }
                                    }} className="flex-1 px-3 py-1.5 bg-green-900/30 text-green-400 border border-green-800/20 rounded-sm text-xs hover:bg-green-900/50 transition-colors">
                                      Genehmigen
                                    </button>
                                    <button onClick={() => {
                                      sendMessage?.({ type: 'action_declined', payload: { ...notif.payload, approved: false, reason: 'Vom Spielleiter abgelehnt' } })
                                      dismissNotification(notif.id)
                                    }} className="px-3 py-1.5 bg-red-900/30 text-red-400 border border-red-800/20 rounded-sm text-xs hover:bg-red-900/50 transition-colors">
                                      Ablehnen
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="px-6 py-3 bg-green-900/20 text-green-400 border border-green-800/20 rounded text-sm flex items-center gap-2 animate-pulse mb-4">
                              <Users className="w-4 h-4" /> Warte auf Spieler...
                            </div>
                          )}

                          <div className="flex gap-2">
                            <button
                              onClick={() => setShowTurnFlow(true)}
                              className="px-4 py-3 bg-dsa-bg-card text-dsa-parchment-dark border border-dsa-bg-medium rounded text-xs hover:text-dsa-parchment transition-colors flex items-center gap-2"
                              title="Als SL den Zug fuer den Spieler ausfuehren"
                            >
                              <Swords className="w-3.5 h-3.5" /> Eingreifen
                            </button>
                            <button
                              onClick={handleNextTurn}
                              className="px-4 py-3 bg-dsa-bg-card text-dsa-parchment-dark border border-dsa-bg-medium rounded text-xs hover:text-dsa-parchment transition-colors flex items-center gap-2"
                            >
                              <SkipForward className="w-3.5 h-3.5" /> Weiter
                            </button>
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <Swords className="w-12 h-12 text-dsa-parchment-dark/20 mb-4" />
                      <p className="text-sm text-dsa-parchment-dark">Initiative eintragen um den Kampf zu beginnen.</p>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Combat log */}
            <div className="border-t border-dsa-bg-medium bg-dsa-bg-light px-4 py-2 max-h-36 overflow-y-auto">
              <h4 className="text-[9px] text-dsa-parchment-dark uppercase tracking-wider mb-1">Kampflog</h4>
              <div className="space-y-0.5">
                {battle.log.slice(-10).reverse().map((entry, i) => (
                  <div key={i} className={clsx('text-[10px] py-0.5',
                    entry.type === 'damage' ? 'text-red-400' :
                    entry.type === 'heal' ? 'text-green-400' :
                    entry.type === 'critical' ? 'text-red-500 font-bold' :
                    entry.type === 'attack' ? 'text-dsa-parchment' :
                    entry.type === 'miss' ? 'text-dsa-parchment-dark' :
                    entry.type === 'defense' ? 'text-blue-400' :
                    'text-dsa-parchment-dark/60'
                  )}>
                    {entry.text}
                  </div>
                ))}
                {battle.log.length === 0 && <p className="text-[9px] text-dsa-parchment-dark/40">Kampf beginnt...</p>}
              </div>
            </div>
          </div>
        </div>

        {/* End confirm */}
        <Modal isOpen={showEndConfirm} onClose={() => setShowEndConfirm(false)} title="Kampf beenden?"
          footer={<>
            <button onClick={() => setShowEndConfirm(false)} className="btn-ghost">Abbrechen</button>
            <button onClick={handleEnd} className="btn-danger flex items-center gap-1"><Trophy className="w-4 h-4" /> Kampf beenden</button>
          </>}
        >
          <p className="text-sm text-dsa-parchment">Bist du sicher? Die Initiative wird aufgeloest. Lebenspunkte und Zustaende bleiben erhalten.</p>
        </Modal>

        {/* Add combatant selection */}
        <Modal isOpen={showAddCombatant} onClose={() => { setShowAddCombatant(false); setAddSelection({}) }} title="Kaempfer hinzufuegen"
          footer={<>
            <button onClick={() => { setShowAddCombatant(false); setAddSelection({}) }} className="btn-ghost">Abbrechen</button>
            <button onClick={handleConfirmAdd} disabled={Object.values(addSelection).filter(Boolean).length === 0}
              className="btn-primary flex items-center gap-1 disabled:opacity-30">
              <Plus className="w-4 h-4" /> Hinzufuegen ({Object.values(addSelection).filter(Boolean).length})
            </button>
          </>}
        >
          <div className="space-y-3">
            {availableTokens.length > 0 ? (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {availableTokens.map(t => {
                  const sel = addSelection[t.id]
                  const icon = t.entity_type === 'player' ? '🟢' : t.entity_type === 'creature' ? '🔴' : '🟡'
                  return (
                    <button key={t.id} onClick={() => setAddSelection(prev => ({ ...prev, [t.id]: !prev[t.id] }))}
                      className={clsx('w-full flex items-center gap-2 px-3 py-2 rounded-sm text-sm transition-colors text-left',
                        sel ? 'bg-dsa-gold/10 border border-dsa-gold/30 text-dsa-parchment' : 'bg-dsa-bg border border-dsa-bg-medium text-dsa-parchment-dark hover:text-dsa-parchment'
                      )}>
                      <span className={clsx('w-5 h-5 rounded border flex items-center justify-center text-xs', sel ? 'bg-dsa-gold border-dsa-gold text-dsa-bg' : 'border-dsa-bg-medium')}>{sel && '✓'}</span>
                      <span>{icon}</span>
                      <span className="flex-1 truncate">{t.name}</span>
                      {t.max_lep > 0 && <span className="text-xs text-dsa-parchment-dark">LeP {t.current_lep || t.max_lep}</span>}
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-dsa-parchment-dark text-center py-2">Keine weiteren Kaempfer auf der Karte.</p>
            )}
            <div className="border-t border-dsa-bg-medium pt-2">
              <p className="text-xs text-dsa-parchment-dark mb-2">Oder neue Kreatur/NSC spawnen — wird automatisch auf die Karte gesetzt und dem Kampf hinzugefuegt:</p>
              <button onClick={() => { setShowAddCombatant(false); setAddSelection({}); window.dispatchEvent(new CustomEvent('open-spawn-panel')) }}
                className="w-full px-3 py-2 bg-red-900/20 text-red-400 border border-red-800/20 rounded-sm text-sm hover:bg-red-900/30 transition-colors flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" /> Kreatur/NSC spawnen
              </button>
            </div>
          </div>
        </Modal>

        {/* Creature/NPC stat editor */}
        <CreatureEditModal
          creature={editingCreature}
          isOpen={!!editingCreature}
          onClose={() => setEditingCreature(null)}
          onSave={(creatureId, updates) => {
            updateCombatant(creatureId, updates)
            addBattleLogEntry(battleId, { type: 'system', text: `${updates.name || editingCreature?.name}: Stats bearbeitet.` })
            sendMessage?.({ type: 'combatant_update', payload: { battle_id: battleId, combatant_id: creatureId, updates } })
          }}
        />
      </div>
    </div>
  )
}
