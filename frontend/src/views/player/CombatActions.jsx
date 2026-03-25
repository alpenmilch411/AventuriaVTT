import React, { useState, useEffect } from 'react'
import {
  Swords, Shield, Skull, Clock, AlertTriangle, ChevronRight,
  Star, Move, SkipForward
} from 'lucide-react'
import useCombatStore from '../../stores/combatStore'
import useCharacterStore from '../../stores/characterStore'
import { getConditionModifier } from '../../engine/conditionsEngine'
import InitiativeBar from '../../components/common/InitiativeBar'
import ProgressBar from '../../components/common/ProgressBar'
import DiceInput from '../../components/common/DiceInput'
import Badge from '../../components/common/Badge'
import ActiveBuffs from '../../components/common/ActiveBuffs'
import TurnFlow from '../gm/TurnFlow'
import { getCreatureIcon } from '../../utils/icons'
import clsx from 'clsx'

const DEFENSE_OPTIONS = [
  { id: 'parry', label: 'Parade', icon: Shield, desc: 'Angriff mit Waffe abwehren' },
  { id: 'dodge', label: 'Ausweichen', icon: Move, desc: 'Dem Angriff ausweichen' },
  { id: 'none', label: 'Nicht verteidigen', icon: AlertTriangle, desc: 'Schaden vollständig hinnehmen' },
]

function CombatActions({ sendMessage }) {
  const combatActive = useCombatStore((s) => s.combatActive)
  const combatResult = useCombatStore((s) => s.combatResult)
  const isMyTurn = useCombatStore((s) => s.isMyTurn)
  const turnsUntilMine = useCombatStore((s) => s.turnsUntilMine)
  const activeBattleId = useCombatStore((s) => s.activeBattleId)
  const initiativeOrder = useCombatStore((s) => s.initiativeOrder)
  const currentTurnIndex = useCombatStore((s) => s.currentTurnIndex)
  const currentRound = useCombatStore((s) => s.currentRound)
  const pendingDefense = useCombatStore((s) => s.pendingDefense)
  const clearPendingDefense = useCombatStore((s) => s.clearPendingDefense)

  const myCharacter = useCharacterStore((s) => s.myCharacter)
  const getVitals = useCharacterStore((s) => s.getVitals)
  const conditions = useCharacterStore((s) => s.myCharacter?.conditions || [])
  const vitals = getVitals()

  // Dynamic combat values (not stale backend data)
  const dynCombat = (() => {
    if (!myCharacter) return { pa: 0, aw: 0 }
    const cv = myCharacter.combat_values || {}
    const dv = myCharacter.derived_values || {}
    const attrs = myCharacter.attributes || {}
    const specials = myCharacter.special_abilities || []
    const charCT = myCharacter.combat_techniques || {}
    const weapons = cv.weapons || []
    const rawInv = myCharacter.basis_inventory || []
    const items = Array.isArray(rawInv) ? rawInv : (rawInv.items || [])

    // BE from equipped armor
    const isArmor = n => /ruestung|hemd|harnisch|panzer|gambeson|wams|platte|kleidung|robe|pelz|knochen|schienen|helm/i.test(n)
    const isShield = n => /schild|buckler/i.test(n)
    const eqArmor = items.filter(i => isArmor(i.name) && i.equipped)
    const eqShield = items.find(i => isShield(i.name) && i.equipped)
    const computedBE = eqArmor.reduce((s, a) => s + (a.be || 0), 0)
    const beRed = specials.some(s => /stungsgew.*II/i.test(s)) ? 2 : specials.some(s => /stungsgew/i.test(s)) ? 1 : 0
    const effBE = Math.max(0, computedBE - beRed)
    const shieldPA = eqShield ? (eqShield.pa_mod || 0) : 0

    // KTW lookup (learned or base 6)
    const normN = s => s.toLowerCase().replace(/[\u00e4\u00f6\u00fc\u00df]/g, m => ({ '\u00e4':'ae','\u00f6':'oe','\u00fc':'ue','\u00df':'ss' }[m]||m))
    const getKTW = (tech) => {
      if (!tech) return 6
      for (const [tn, ktw] of Object.entries(charCT)) { if (normN(tn) === normN(tech) || tn.toLowerCase() === tech.toLowerCase()) return ktw }
      return 6
    }

    // Primary melee weapon (equipped)
    const isWeapon = n => /schwert|axt|dolch|bogen|messer|stab|kolben|speer|hammer|hellebarde|morgenstern|peitsche|keule|saebel|rapier|kriegsaxt|wurfaxt|armbrust|schleuder|rondrakamm/i.test(n)
    const eqWeapons = items.filter(i => isWeapon(i.name) && i.equipped)
    let primaryW = null
    for (const inv of eqWeapons) { const m = weapons.find(w => inv.name.toLowerCase().includes(w.name.toLowerCase().split(' ')[0])); if (m && !m.ranged) { primaryW = m; break } }

    // Apply condition modifiers (Schmerz, Belastung, Furcht, etc.)
    const conds = conditions
    const pa = primaryW ? Math.floor(getKTW(primaryW.technique) / 2) + (primaryW.pa_mod || 0) + shieldPA - effBE + getConditionModifier(conds, 'PA') : 0
    const aw = Math.max(0, (dv.AW || 0) - effBE + getConditionModifier(conds, 'AW'))
    return { pa, aw }
  })()

  const [selectedDefense, setSelectedDefense] = useState(null)
  const [useSchip, setUseSchip] = useState(false)
  const [showTurnFlow, setShowTurnFlow] = useState(false)

  const currentCombatant = initiativeOrder[currentTurnIndex]
  const turnsLeft = turnsUntilMine()
  const heroes = initiativeOrder.filter(c => !c.isNPC)
  const enemies = initiativeOrder.filter(c => c.isNPC)

  // Find my combatant entry
  const myCombatant = initiativeOrder.find(c => c.characterId === myCharacter?.id)

  // Auto-open TurnFlow when it's my turn
  useEffect(() => {
    if (isMyTurn() && !pendingDefense) {
      setShowTurnFlow(true)
    } else {
      setShowTurnFlow(false)
    }
  }, [currentTurnIndex, initiativeOrder])

  // ── No combat ──
  if (!combatActive) {
    if (combatResult) {
      const isVictory = combatResult.result === 'victory'
      return (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-sm">
            <div className={clsx('w-20 h-20 rounded-full flex items-center justify-center mb-4 mx-auto',
              isVictory ? 'bg-dsa-gold/20 ring-2 ring-dsa-gold/30' : 'bg-red-900/20 ring-2 ring-red-900/30')}>
              {isVictory ? <Star className="w-10 h-10 text-dsa-gold" /> : <Skull className="w-10 h-10 text-red-400" />}
            </div>
            <h3 className={clsx('text-xl font-display font-bold mb-2', isVictory ? 'text-dsa-gold' : 'text-red-400')}>
              {combatResult.summary || (isVictory ? 'Sieg der Helden!' : 'Niederlage...')}
            </h3>
            {combatResult.rounds && <p className="text-xs text-dsa-parchment-dark mb-4">{combatResult.rounds} Runden</p>}
            <div className="flex gap-3 justify-center mb-4">
              {combatResult.fallen?.length > 0 && (
                <div className="bg-red-900/10 border border-red-900/20 rounded px-4 py-2">
                  <p className="text-[10px] text-red-400 font-semibold mb-1">Gefallen</p>
                  <p className="text-sm text-red-300">{combatResult.fallen.join(', ')}</p>
                </div>
              )}
              {combatResult.survivors?.length > 0 && (
                <div className="bg-dsa-gold/5 border border-dsa-gold/20 rounded px-4 py-2">
                  <p className="text-[10px] text-dsa-gold font-semibold mb-1">Überlebende</p>
                  <p className="text-sm text-dsa-parchment">{combatResult.survivors.join(', ')}</p>
                </div>
              )}
            </div>
            <button onClick={() => useCombatStore.getState().clearCombatResult?.()}
              className="text-xs text-dsa-parchment-dark hover:text-dsa-parchment transition px-4 py-2 border border-dsa-bg-medium rounded-sm">
              Schließen
            </button>
          </div>
        </div>
      )
    }
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Swords className="w-12 h-12 text-dsa-parchment-dark/20 mx-auto mb-3" />
          <p className="text-dsa-parchment-dark">Kein aktiver Kampf</p>
        </div>
      </div>
    )
  }

  // ── Render right panel content ──
  const renderActionPanel = () => {
    // Defense request — highest priority, interrupts everything
    if (pendingDefense) {
      return (
        <div className="space-y-4 animate-slide-up">
          <div className="bg-red-900/10 border border-red-900/30 rounded p-5 text-center">
            <div className="w-14 h-14 bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-8 h-8 text-red-400" />
            </div>
            <h3 className="text-xl font-display font-bold text-red-400">Angriff!</h3>
            <p className="text-sm text-dsa-parchment mt-2">
              <span className="font-semibold">{pendingDefense.attacker}</span> greift dich an!
            </p>
            {pendingDefense.attackValue && (
              <span className="inline-block mt-2 text-xs font-mono bg-red-900/20 text-red-300 px-2 py-0.5 rounded-full">
                Angriffswert: {pendingDefense.attackValue}
              </span>
            )}
          </div>

          {!selectedDefense ? (
            <div className="space-y-2">
              <p className="text-sm text-dsa-parchment-dark text-center font-medium">Wie verteidigst du dich?</p>
              {DEFENSE_OPTIONS.map((opt) => {
                const Icon = opt.icon
                return (
                  <button key={opt.id} onClick={() => setSelectedDefense(opt.id)}
                    className="w-full p-3 bg-dsa-bg-card border border-dsa-bg-medium rounded flex items-center gap-3 hover:border-dsa-gold/30 transition-all active:scale-[0.98]">
                    <div className="w-8 h-8 rounded-sm bg-dsa-bg-medium flex items-center justify-center">
                      <Icon className="w-4 h-4 text-dsa-parchment" />
                    </div>
                    <div className="flex-1 text-left">
                      <span className="text-sm font-semibold text-dsa-parchment">{opt.label}</span>
                      <p className="text-[10px] text-dsa-parchment-dark">{opt.desc}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-dsa-parchment-dark" />
                  </button>
                )
              })}
              {vitals.schip > 0 && (
                <label className="flex items-center gap-2 p-3 text-sm text-dsa-gold bg-dsa-gold/5 border border-dsa-gold/20 rounded cursor-pointer">
                  <input type="checkbox" checked={useSchip} onChange={(e) => setUseSchip(e.target.checked)} className="rounded border-dsa-gold" />
                  <Star className="w-4 h-4" /> Schicksalspunkt einsetzen (noch {vitals.schip})
                </label>
              )}
            </div>
          ) : (
            <DiceInput
              label={selectedDefense === 'parry' ? 'Parade würfeln' : selectedDefense === 'dodge' ? 'Ausweichen würfeln' : ''}
              targetValue={selectedDefense === 'parry' ? dynCombat.pa : selectedDefense === 'dodge' ? dynCombat.aw : null}
              onSubmit={(value) => {
                sendMessage?.({ category: 'combat', type: 'defense_result', payload: { defense_type: selectedDefense, value, use_schip: useSchip } })
                clearPendingDefense(); setSelectedDefense(null); setUseSchip(false)
              }}
              onCancel={() => setSelectedDefense(null)}
            />
          )}
        </div>
      )
    }

    // My turn — use TurnFlow (same as GM)
    if (isMyTurn() && showTurnFlow && myCombatant) {
      return (
        <TurnFlow
          combatant={myCombatant}
          battleId={activeBattleId}
          allCombatants={initiativeOrder}
          onComplete={() => {
            setShowTurnFlow(false)
            // Player doesn't advance turn — GM does that
          }}
          sendMessage={sendMessage}
        />
      )
    }

    // My turn but TurnFlow closed
    if (isMyTurn()) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <Swords className="w-8 h-8 text-dsa-gold mx-auto mb-2" />
          <h3 className="text-lg font-display font-bold text-dsa-gold mb-1">Du bist am Zug!</h3>
          <span className="text-[10px] font-mono text-dsa-parchment-dark bg-dsa-bg-medium px-2 py-0.5 rounded-full mb-4">Runde {currentRound}</span>
          <button onClick={() => setShowTurnFlow(true)}
            className="px-4 py-2 bg-dsa-gold/10 text-dsa-gold border border-dsa-gold/30 rounded text-xs font-medium hover:bg-dsa-gold/20 transition flex items-center gap-1.5">
            <Swords className="w-3.5 h-3.5" /> Zug ausführen
          </button>
        </div>
      )
    }

    // Waiting for turn
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">{getCreatureIcon(currentCombatant?.name)}</span>
          <Clock className="w-5 h-5 text-dsa-parchment-dark" />
        </div>
        <p className="text-sm text-dsa-parchment">
          <span className="font-semibold">{currentCombatant?.name}</span> ist am Zug
        </p>
        {turnsLeft > 0 && (
          <p className="text-xs text-dsa-parchment-dark mt-1">
            Noch {turnsLeft} {turnsLeft === 1 ? 'Zug' : 'Züge'} bis du dran bist
          </p>
        )}
        <span className="inline-block mt-2 text-[10px] font-mono text-dsa-parchment-dark bg-dsa-bg-medium px-2 py-0.5 rounded-full">
          Runde {currentRound}
        </span>
      </div>
    )
  }

  // ── Main layout — same as GM CombatTracker ──
  return (
    <div className="flex-1 flex flex-col overflow-hidden h-full">
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
        <div className="flex items-center gap-2">
          {isMyTurn() && <Badge variant="warning" size="sm">Dein Zug!</Badge>}
          {pendingDefense && <Badge variant="danger" size="sm">Verteidigung!</Badge>}
        </div>
      </div>

      {/* ── Responsive: stacked on phone, side-by-side on wider screens ── */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
        {/* LEFT: Combatant Lists */}
        <div className="w-full md:w-64 flex-shrink-0 border-b md:border-b-0 md:border-r border-dsa-bg-medium/50 overflow-y-auto p-3 space-y-3 max-h-[35vh] md:max-h-none">
          <div>
            <h4 className="text-[10px] font-semibold text-dsa-gold uppercase tracking-wider mb-1.5 flex items-center gap-1 bg-dsa-gold/10 rounded px-2 py-1">
              <Shield className="w-3 h-3" /> Helden ({heroes.length})
            </h4>
            <div className="space-y-1">
              {heroes.map(c => <CombatantCard key={c.id} combatant={c} isActive={c.id === currentCombatant?.id} isMe={c.characterId === myCharacter?.id} />)}
            </div>
          </div>
          <div>
            <h4 className="text-[10px] font-semibold text-red-400 uppercase tracking-wider mb-1.5 flex items-center gap-1 bg-red-950/50 rounded px-2 py-1">
              <Skull className="w-3 h-3" /> Gegner ({enemies.length})
            </h4>
            <div className="space-y-1">
              {enemies.map(c => <CombatantCard key={c.id} combatant={c} isActive={c.id === currentCombatant?.id} />)}
            </div>
          </div>
        </div>

        {/* RIGHT: Action Panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4">
            {renderActionPanel()}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Combatant Card (player version — hides NPC/creature stats) ──

function CombatantCard({ combatant, isActive, isMe }) {
  const c = combatant
  const isNPC = c.isNPC || c.isCreature || (!c.userId && !c.characterId)
  const isDead = c.lep !== undefined && c.lep <= 0
  const activeBuffs = useCharacterStore((s) => s.activeBuffs)
  const buffs = isNPC ? [] : activeBuffs.filter(b => b.characterId === (c.characterId || c.id) && b.expiresAt > Date.now())

  return (
    <div className={clsx(
      'rounded-sm border p-2 transition-all',
      isDead && 'opacity-40',
      isMe && 'ring-1 ring-dsa-gold/20',
      isActive ? 'border-dsa-gold bg-dsa-gold/5' : 'border-dsa-bg-medium bg-dsa-bg-card'
    )}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-sm">{getCreatureIcon(c.name)}</span>
        <span className={clsx('text-[11px] font-semibold truncate flex-1',
          isDead ? 'text-dsa-parchment-dark line-through' : isActive ? 'text-dsa-gold' : 'text-dsa-parchment')}>
          {c.name}{isMe ? ' (Du)' : ''}
        </span>
        {isActive && <Swords className="w-3 h-3 text-dsa-gold flex-shrink-0" />}
        {isDead && <Skull className="w-3 h-3 text-red-400 flex-shrink-0" />}
      </div>
      {/* Players see their own party's HP, but NOT creature/NPC HP */}
      {!isNPC ? (
        <>
          <ProgressBar current={c.lep || 0} max={c.lepMax || 1} preset="health" size="sm" />
          <div className="flex items-center justify-between mt-0.5">
            <span className="text-[8px] font-mono text-dsa-parchment-dark">LeP {c.lep ?? '?'}/{c.lepMax ?? '?'}</span>
            <span className="text-[8px] font-mono text-dsa-parchment-dark">INI {c.initiative}</span>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-[8px] font-mono text-dsa-parchment-dark">{isDead ? 'Kampfunfähig' : 'Gegner'}</span>
          <span className="text-[8px] font-mono text-dsa-parchment-dark">INI {c.initiative}</span>
        </div>
      )}
      {buffs.length > 0 && <div className="mt-1"><ActiveBuffs characterId={c.characterId || c.id} compact /></div>}
    </div>
  )
}

export default React.memo(CombatActions)
