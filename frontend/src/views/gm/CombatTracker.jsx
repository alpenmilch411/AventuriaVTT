import React, { useState, useEffect } from 'react'
import {
  Swords, SkipForward, Plus, Trash2, Play, Square, Minimize2,
  Shield, Heart, Skull, Zap, Clock, ChevronRight, Users, Send
} from 'lucide-react'
import useCombatStore from '../../stores/combatStore'
import useCharacterStore from '../../stores/characterStore'
import useSessionStore from '../../stores/sessionStore'
import InitiativeBar from '../../components/common/InitiativeBar'
import ProgressBar from '../../components/common/ProgressBar'
import ActiveBuffs from '../../components/common/ActiveBuffs'
import Modal from '../../components/common/Modal'
import TurnFlow from './TurnFlow'
import { getCreatureIcon } from '../../utils/icons'
import clsx from 'clsx'

function CombatTracker({ sendMessage, gmControls, onMinimize }) {
  const activeBattleId = useCombatStore((s) => s.activeBattleId)
  const battles = useCombatStore((s) => s.battles)
  const activeBattle = battles[activeBattleId]
  const combatActive = Object.keys(battles).length > 0
  const currentRound = activeBattle?.round || 0
  const initiativeOrder = activeBattle?.initiativeOrder || []
  const currentTurnIndex = activeBattle?.currentTurnIndex || 0
  const reorderInitiative = useCombatStore((s) => s.reorderInitiative)
  const pendingPlayerAction = useCombatStore((s) => s.pendingPlayerAction)
  const clearPendingPlayerAction = useCombatStore((s) => s.clearPendingPlayerAction)
  const nextTurn = useCombatStore((s) => s.nextTurn)
  const endBattle = useCombatStore((s) => s.endBattle)

  const [showStartDialog, setShowStartDialog] = useState(false)
  const [showTurnFlow, setShowTurnFlow] = useState(true)
  const [approvedAction, setApprovedAction] = useState(null)
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const [newCombatants, setNewCombatants] = useState([
    { name: '', initiative: 0, lep: 0, lepMax: 0, isNPC: false },
  ])

  const battle = battles[activeBattleId]
  const currentCombatant = initiativeOrder[currentTurnIndex]

  // Auto-react to player action declarations
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

  const handleNextTurn = () => {
    setShowTurnFlow(false)
    setApprovedAction(null)

    if (!battle) return

    // Check auto-end
    const aliveNPCs = battle.initiativeOrder.filter(c => c.isNPC && (c.lep === undefined || c.lep > 0))
    const alivePCs = battle.initiativeOrder.filter(c => !c.isNPC && (c.lep === undefined || c.lep > 0))
    if (aliveNPCs.length === 0 || alivePCs.length === 0) {
      const heroesWon = aliveNPCs.length === 0
      const fallen = battle.initiativeOrder.filter(c => c.lep !== undefined && c.lep <= 0).map(c => c.name)
      const survivors = battle.initiativeOrder.filter(c => c.lep === undefined || c.lep > 0).map(c => c.name)
      const summary = heroesWon ? 'Sieg der Helden!' : 'Die Helden sind gefallen...'
      endBattle(activeBattleId)
      sendMessage?.({
        type: 'combat_end',
        payload: { battle_id: activeBattleId, result: heroesWon ? 'victory' : 'defeat', summary, fallen, survivors, rounds: battle.round },
      })
      return
    }

    nextTurn(activeBattleId)
    const updated = useCombatStore.getState().battles[activeBattleId] // safe: event handler
    if (updated) {
      sendMessage?.({
        type: 'combat_next_turn',
        payload: {
          battle_id: activeBattleId,
          current_turn_index: updated.currentTurnIndex,
          round_number: updated.round,
          current_turn: updated.initiativeOrder?.[updated.currentTurnIndex],
          initiative_order: updated.initiativeOrder,
        },
      })
    }
    // Re-open TurnFlow for the next combatant
    setTimeout(() => setShowTurnFlow(true), 100)
  }

  const handleEndCombat = () => {
    endBattle(activeBattleId)
    sendMessage?.({ type: 'combat_end', payload: { battle_id: activeBattleId } })
    gmControls.changePhase?.('exploration')
  }

  // ── Start dialog helpers ──
  const handleStartCombat = () => {
    const valid = newCombatants.filter((c) => c.name.trim())
    if (valid.length === 0) return
    const ordered = valid
      .map((c, i) => ({
        id: `combatant_${Date.now()}_${i}`,
        characterId: c.characterId || null,
        name: c.name,
        initiative: parseInt(c.initiative) || 0,
        lep: parseInt(c.lep) || 30,
        lepMax: parseInt(c.lepMax) || 30,
        isNPC: c.isNPC,
        conditions: [],
      }))
      .sort((a, b) => b.initiative - a.initiative)
    gmControls.startCombat(ordered)
    setShowStartDialog(false)
    setNewCombatants([{ name: '', initiative: 0, lep: 0, lepMax: 0, isNPC: false }])
  }

  if (!combatActive) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Swords className="w-12 h-12 text-dsa-parchment-dark/20 mx-auto mb-3" />
          <p className="text-sm text-dsa-parchment-dark mb-4">Kein aktiver Kampf</p>
          <button onClick={() => setShowStartDialog(true)} className="btn-primary flex items-center gap-2 mx-auto">
            <Play className="w-4 h-4" /> Kampf starten
          </button>
        </div>
        <Modal isOpen={showStartDialog} onClose={() => setShowStartDialog(false)} title="Kampf starten" size="lg"
          footer={<><button onClick={() => setShowStartDialog(false)} className="btn-ghost">Abbrechen</button><button onClick={handleStartCombat} className="btn-primary">Starten</button></>}>
          <div className="space-y-3">
            {newCombatants.map((c, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <input type="text" value={c.name} onChange={(e) => setNewCombatants(newCombatants.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                  placeholder="Name" className="input-field flex-1" />
                <input type="number" value={c.initiative} onChange={(e) => setNewCombatants(newCombatants.map((x, i) => i === idx ? { ...x, initiative: e.target.value } : x))}
                  placeholder="INI" className="input-field w-16 text-center" />
                <input type="number" value={c.lepMax} onChange={(e) => setNewCombatants(newCombatants.map((x, i) => i === idx ? { ...x, lepMax: e.target.value } : x))}
                  placeholder="LeP" className="input-field w-16 text-center" />
                <label className="flex items-center gap-1 text-xs text-dsa-parchment-dark whitespace-nowrap">
                  <input type="checkbox" checked={c.isNPC} onChange={(e) => setNewCombatants(newCombatants.map((x, i) => i === idx ? { ...x, isNPC: e.target.checked } : x))}
                    className="rounded border-dsa-bg-medium" /> NSC
                </label>
                <button onClick={() => setNewCombatants(newCombatants.filter((_, i) => i !== idx))} className="text-dsa-parchment-dark hover:text-dsa-danger">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button onClick={() => setNewCombatants([...newCombatants, { name: '', initiative: 0, lep: 0, lepMax: 0, isNPC: false }])}
              className="btn-ghost text-sm flex items-center gap-1">
              <Plus className="w-4 h-4" /> Hinzufuegen
            </button>
          </div>
        </Modal>
      </div>
    )
  }

  const heroes = initiativeOrder.filter(c => !c.isNPC)
  const enemies = initiativeOrder.filter(c => c.isNPC)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-dsa-bg-medium bg-dsa-bg-light/50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Swords className="w-4 h-4 text-red-400" />
          <span className="text-sm font-display font-bold text-dsa-parchment">Kampf</span>
          <span className="text-xs font-mono text-dsa-gold bg-dsa-gold/10 px-2 py-0.5 rounded-full">Runde {currentRound}</span>
          {currentCombatant && (
            <span className="text-xs text-dsa-parchment-dark">
              {getCreatureIcon(currentCombatant.name)} <span className="font-semibold text-dsa-parchment">{currentCombatant.name}</span> am Zug
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {onMinimize && (
            <button onClick={onMinimize} className="text-xs py-1 px-2 bg-dsa-bg-medium text-dsa-parchment-dark rounded-sm hover:text-dsa-parchment transition flex items-center gap-1">
              <Minimize2 className="w-3 h-3" /> Minimieren
            </button>
          )}
          <button onClick={() => setShowEndConfirm(true)} className="text-xs py-1 px-2.5 bg-red-900/30 text-red-400 border border-red-900/30 rounded-sm hover:bg-red-900/40 transition flex items-center gap-1">
            <Square className="w-3 h-3" /> Beenden
          </button>
        </div>
      </div>

      {/* ── Initiative Bar ── */}
      <div className="px-4 py-2 border-b border-dsa-bg-medium/50 flex-shrink-0">
        <InitiativeBar combatants={initiativeOrder} currentIndex={currentTurnIndex} draggable onReorder={(newOrder) => reorderInitiative(activeBattleId, newOrder)} />
      </div>

      {/* ── Main: Two columns ── */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* LEFT: Combatant Lists */}
        <div className="w-64 flex-shrink-0 border-r border-dsa-bg-medium/50 overflow-y-auto p-3 space-y-3">
          {/* Heroes */}
          <div>
            <h4 className="text-[10px] font-semibold text-dsa-gold uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Shield className="w-3 h-3" /> Helden ({heroes.length})
            </h4>
            <div className="space-y-1">
              {heroes.map(c => <CombatantCard key={c.id} combatant={c} isActive={c.id === currentCombatant?.id} />)}
            </div>
          </div>
          {/* Enemies */}
          <div>
            <h4 className="text-[10px] font-semibold text-red-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Skull className="w-3 h-3" /> Gegner ({enemies.length})
            </h4>
            <div className="space-y-1">
              {enemies.map(c => <CombatantCard key={c.id} combatant={c} isActive={c.id === currentCombatant?.id} />)}
            </div>
          </div>
        </div>

        {/* RIGHT: Turn Flow / Waiting */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {showTurnFlow && currentCombatant ? (
            <div className="flex-1 overflow-y-auto p-4">
              <TurnFlow
                combatant={currentCombatant}
                battleId={activeBattleId}
                allCombatants={initiativeOrder}
                onComplete={handleNextTurn}
                sendMessage={sendMessage}
                approvedAction={approvedAction}
              />
            </div>
          ) : currentCombatant && !currentCombatant.isNPC && !showTurnFlow ? (
            /* Player turn — wait for action or approve */
            <PlayerTurnWaiting
              combatant={currentCombatant}
              sendMessage={sendMessage}
              onIntervene={() => setShowTurnFlow(true)}
              onSkip={handleNextTurn}
              onApproveAction={(action) => { setApprovedAction(action); setShowTurnFlow(true) }}
            />
          ) : (
            /* NPC or idle — open TurnFlow or skip */
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-3">
                {currentCombatant && (
                  <>
                    <div className="text-3xl mb-1">{getCreatureIcon(currentCombatant.name)}</div>
                    <h3 className="text-base font-display font-bold text-dsa-parchment">{currentCombatant.name} ist dran</h3>
                    <p className="text-xs text-dsa-parchment-dark">
                      {currentCombatant.isNPC ? 'NSC — du steuerst diesen Kaempfer.' : 'Spieler-Charakter'}
                    </p>
                    <div className="flex gap-2 justify-center">
                      <button onClick={() => setShowTurnFlow(true)}
                        className="px-4 py-2 bg-red-900/20 text-red-400 border border-red-900/30 rounded text-xs font-medium hover:bg-red-900/30 transition flex items-center gap-1.5">
                        <Swords className="w-3.5 h-3.5" /> Zug ausfuehren
                      </button>
                      <button onClick={handleNextTurn}
                        className="px-4 py-2 bg-dsa-bg-card text-dsa-parchment-dark border border-dsa-bg-medium rounded text-xs hover:text-dsa-parchment transition flex items-center gap-1.5">
                        <SkipForward className="w-3.5 h-3.5" /> Ueberspringen
                      </button>
                    </div>
                  </>
                )}
                {!currentCombatant && (
                  <>
                    <Clock className="w-8 h-8 text-dsa-parchment-dark/30 mx-auto" />
                    <p className="text-xs text-dsa-parchment-dark">Kein Kaempfer aktiv</p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Advance button always visible at bottom */}
          <div className="px-4 py-2 border-t border-dsa-bg-medium flex-shrink-0">
            <button
              onClick={handleNextTurn}
              className="w-full py-2 bg-gradient-to-r from-dsa-gold/20 to-dsa-gold/10 text-dsa-gold border border-dsa-gold/30 rounded font-semibold text-sm hover:from-dsa-gold/30 hover:to-dsa-gold/20 transition flex items-center justify-center gap-2"
            >
              <SkipForward className="w-4 h-4" /> Naechster Zug
            </button>
          </div>
        </div>
      </div>

      {/* End Combat Confirm */}
      {showEndConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowEndConfirm(false)}>
          <div className="bg-dsa-bg border border-dsa-bg-medium rounded shadow-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-display font-bold text-dsa-gold mb-2">Kampf beenden?</h3>
            <p className="text-xs text-dsa-parchment-dark mb-4">Der laufende Kampf wird sofort beendet. Alle Spieler werden benachrichtigt.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowEndConfirm(false)} className="btn-ghost text-xs">Abbrechen</button>
              <button onClick={() => { setShowEndConfirm(false); handleEndCombat() }}
                className="text-xs py-1.5 px-4 bg-red-900/30 text-red-400 border border-red-900/30 rounded-sm hover:bg-red-900/40 transition">
                Kampf beenden
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Combatant Card ──

function CombatantCard({ combatant, isActive }) {
  const c = combatant
  const isDead = c.lep !== undefined && c.lep <= 0
  const activeBuffs = useCharacterStore((s) => s.activeBuffs)
  const buffs = activeBuffs.filter(b => b.characterId === (c.characterId || c.id) && b.expiresAt > Date.now())

  return (
    <div className={clsx(
      'rounded-sm border p-2 transition-all',
      isDead && 'opacity-40',
      isActive ? 'border-dsa-gold bg-dsa-gold/5 ring-1 ring-dsa-gold/20' : 'border-dsa-bg-medium bg-dsa-bg-card'
    )}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-sm">{getCreatureIcon(c.name)}</span>
        <span className={clsx('text-[11px] font-semibold truncate flex-1',
          isDead ? 'text-dsa-parchment-dark line-through' : isActive ? 'text-dsa-gold' : 'text-dsa-parchment')}>
          {c.name}
        </span>
        {isActive && <Swords className="w-3 h-3 text-dsa-gold flex-shrink-0" />}
        {isDead && <Skull className="w-3 h-3 text-red-400 flex-shrink-0" />}
      </div>
      <ProgressBar current={c.lep || 0} max={c.lepMax || 1} preset="health" size="sm" />
      <div className="flex items-center justify-between mt-0.5">
        <span className="text-[8px] font-mono text-dsa-parchment-dark">LeP {c.lep ?? '?'}/{c.lepMax ?? '?'}</span>
        <span className="text-[8px] font-mono text-dsa-parchment-dark">INI {c.initiative}</span>
      </div>
      {buffs.length > 0 && <div className="mt-1"><ActiveBuffs characterId={c.characterId || c.id} compact /></div>}
      {(Array.isArray(c.conditions) && c.conditions.length > 0) && (
        <div className="flex flex-wrap gap-0.5 mt-1">
          {c.conditions.map((cond, i) => { // safe: guarded by Array.isArray above
            const name = typeof cond === 'string' ? cond : cond.name
            const level = typeof cond === 'object' ? cond.level : 1
            const levelStr = level > 1 ? ` ${['','I','II','III','IV'][level]}` : ''
            return <span key={i} className="text-[7px] bg-amber-900/30 text-amber-400 rounded px-1 py-0.5">{name}{levelStr}</span>
          })}
        </div>
      )}
    </div>
  )
}

// ── Player Turn Waiting — GM waits for player to declare action ──

function PlayerTurnWaiting({ combatant, sendMessage, onIntervene, onSkip, onApproveAction }) {
  const notifications = useSessionStore((s) => s.notifications)
  const dismissNotification = useSessionStore((s) => s.dismissNotification)

  // Filter for combat-relevant action requests from this player
  const combatNotifs = notifications.filter(n =>
    n.type === 'action_request' || n.type === 'probe_request_from_player' || n.type === 'spell_cast_request'
  )

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
      {/* Player info */}
      <div className="text-3xl mb-2">{getCreatureIcon(combatant.name)}</div>
      <h3 className="text-base font-display font-bold text-dsa-gold mb-1">{combatant.name} ist dran</h3>
      <p className="text-xs text-dsa-parchment-dark mb-4">Spieler-Charakter — {combatant.name} waehlt die Aktion.</p>

      {/* Incoming action requests */}
      {combatNotifs.length > 0 ? (
        <div className="w-full max-w-md space-y-2 mb-4">
          {combatNotifs.map(notif => (
            <div key={notif.id} className="bg-dsa-gold/10 border border-dsa-gold/30 rounded p-3 text-left">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-dsa-gold">{notif.payload?.character_name || notif.from}</span>
                <span className="text-[9px] text-dsa-parchment-dark">
                  {notif.type === 'spell_cast_request' ? 'Zauber' : 'Aktion'}
                </span>
              </div>
              <p className="text-xs text-dsa-parchment mb-2">{notif.payload?.action_label || notif.text}</p>
              <div className="flex gap-2">
                <button onClick={() => {
                  sendMessage?.({ type: 'action_approved', payload: { ...notif.payload, approved: true } })
                  dismissNotification(notif.id)
                  if (notif.payload?.action_type?.includes('attack')) {
                    onApproveAction({ type: 'attack', target_name: notif.payload.target_name, target_id: notif.payload.target_id, maneuver: notif.payload.maneuver })
                  } else if (notif.payload?.action_type?.includes('spell')) {
                    onApproveAction({ type: 'spell', spell_name: notif.payload.spell_name })
                  } else {
                    onSkip()
                  }
                }} className="flex-1 px-3 py-1.5 bg-green-900/30 text-green-400 border border-green-800/20 rounded-sm text-xs hover:bg-green-900/50 transition">
                  Genehmigen
                </button>
                <button onClick={() => {
                  sendMessage?.({ type: 'action_declined', payload: { ...notif.payload, approved: false, reason: 'Vom Spielleiter abgelehnt' } })
                  dismissNotification(notif.id)
                }} className="px-3 py-1.5 bg-red-900/30 text-red-400 border border-red-800/20 rounded-sm text-xs hover:bg-red-900/50 transition">
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

      {/* GM actions */}
      <div className="flex gap-2">
        <button onClick={onIntervene}
          className="px-4 py-2 bg-dsa-bg-card text-dsa-parchment-dark border border-dsa-bg-medium rounded text-xs hover:text-dsa-parchment transition flex items-center gap-1.5"
          title="Als SL den Zug fuer den Spieler ausfuehren">
          <Swords className="w-3.5 h-3.5" /> Eingreifen
        </button>
        <button onClick={onSkip}
          className="px-4 py-2 bg-dsa-bg-card text-dsa-parchment-dark border border-dsa-bg-medium rounded text-xs hover:text-dsa-parchment transition flex items-center gap-1.5">
          <SkipForward className="w-3.5 h-3.5" /> Ueberspringen
        </button>
      </div>
    </div>
  )
}

export default React.memo(CombatTracker)
