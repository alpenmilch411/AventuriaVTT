import { useState } from 'react'
import {
  Swords, Plus, X, Check, ChevronDown, ChevronUp, Play,
  Shield, Heart, Skull, Dice5, Target, LogOut, Users
} from 'lucide-react'
import useCombatStore from '../../stores/combatStore'
import useSessionStore from '../../stores/sessionStore'
import Badge from '../../components/common/Badge'
import ProgressBar from '../../components/common/ProgressBar'
import clsx from 'clsx'

/**
 * BattleManager — Setup and manage a single combat encounter.
 *
 * Phases:
 * 1. IDLE — no fight, "Kampf starten" button
 * 2. SELECT — pick combatants from map
 * 3. INITIATIVE — roll initiative for everyone
 * 4. READY — all INI set, "Kampf beginnen" opens overlay
 *
 * Props:
 * - sendMessage: WebSocket send
 * - mapTokens: current tokens on the map
 * - onOpenCombat: (battleId) => opens the CombatOverlay
 */
export default function BattleManager({ sendMessage, mapTokens = [], onOpenCombat }) {
  const battles = useCombatStore((s) => s.battles)
  const createBattle = useCombatStore((s) => s.createBattle)
  const addCombatant = useCombatStore((s) => s.addCombatant)
  const updateCombatant = useCombatStore((s) => s.updateCombatant)
  const addBattleLogEntry = useCombatStore((s) => s.addBattleLogEntry)
  const endBattle = useCombatStore((s) => s.endBattle)
  const players = useSessionStore((s) => s.players)

  const [phase, setPhase] = useState('idle') // idle | select | initiative | ready
  const [battleName, setBattleName] = useState('')
  const [selectedTokens, setSelectedTokens] = useState({}) // tokenId → bool
  const [currentBattleId, setCurrentBattleId] = useState(null)
  const [npcIniRolls, setNpcIniRolls] = useState({}) // combatantId → W6 roll
  const [iniRequestsSent, setIniRequestsSent] = useState(false)

  const battleList = Object.values(battles)
  const hasBattles = battleList.length > 0
  const currentBattle = currentBattleId ? battles[currentBattleId] : null

  // Combatable tokens from the map
  const combatTokens = mapTokens.filter(t =>
    t.entity_type === 'player' || t.entity_type === 'creature' || t.entity_type === 'npc'
  )

  const toggleToken = (id) => setSelectedTokens(prev => ({ ...prev, [id]: !prev[id] }))
  const selectedCount = Object.values(selectedTokens).filter(Boolean).length

  // ── PHASE: Select combatants ──
  const handleProceedToInitiative = () => {
    const name = battleName.trim() || `Kampf ${battleList.length + 1}`
    const id = createBattle(name)
    setCurrentBattleId(id)

    const selected = combatTokens.filter(t => selectedTokens[t.id])
    for (const t of selected) {
      const dv = t.derived_values || t.stats || {}
      const cv = t.combat_values || {}
      const weapons = cv.weapons || t.attacks || []
      const primaryWeapon = weapons[0] || {}
      // For player characters, use weapon-specific AT/PA from combat_values
      // For creatures/NPCs, use derived_values (which are per-creature)
      const at = primaryWeapon.AT || primaryWeapon.at || dv.AT || 12
      const pa = primaryWeapon.PA || primaryWeapon.pa || dv.PA || 8
      addCombatant(id, {
        id: t.id,
        name: t.name,
        userId: t.user_id || null,
        characterId: t.character_id || null,
        iniBasis: dv.INI_basis || dv.ini_basis || 10,
        iniRoll: null,
        initiative: 0,
        isNPC: t.entity_type !== 'player',
        lep: t.current_lep || t.max_lep || 30,
        lepMax: t.max_lep || 30,
        at, pa, aw: dv.AW || 5, rs: cv.RS || dv.RS || 0,
        weaponName: t.weaponName || primaryWeapon.name || 'Waffe',
        weaponDamage: t.weaponDamage || primaryWeapon.TP || primaryWeapon.damage || '1W6+4',
        weaponReach: t.weaponReach || primaryWeapon.reach || 'mittel',
        attacks: weapons.map(w => ({
          name: w.name, damage: w.TP || w.damage, at: w.AT || w.at,
          pa: w.PA || w.pa, reach: w.reach, isRanged: w.ranged || false,
          technique: w.technique,
        })),
        conditions: [],
        position: { x: t.position_x, y: t.position_y },
        entityType: t.entity_type,
      })
    }

    setPhase('initiative')
  }

  // ── Send INI request to all players at once ──
  const handleSendIniRequests = () => {
    if (!currentBattle) return
    const playerCombatants = currentBattle.initiativeOrder.filter(c => !c.isNPC)
    for (const c of playerCombatants) {
      sendMessage?.({
        type: 'dice_request',
        payload: {
          target_user_id: c.userId || c.characterId || c.id,
          type: 'initiative',
          label: `Kampf beginnt! Wuerfle 1W6 fuer Initiative (dein Basiswert: ${c.iniBasis})`,
          dice: '1W6',
          ini_basis: c.iniBasis,
          combatant_name: c.name,
          battle_id: currentBattleId,
        },
      })
    }
    setIniRequestsSent(true)
    addBattleLogEntry(currentBattleId, { type: 'system', text: `Initiative-Aufforderung an ${playerCombatants.length} Spieler gesendet.` })
  }

  // ── Set NPC ini roll ──
  const handleNpcIniRoll = (combatantId, roll) => {
    if (isNaN(roll) || roll < 1 || roll > 6) return
    setNpcIniRolls(prev => ({ ...prev, [combatantId]: roll }))
    const c = currentBattle?.initiativeOrder.find(x => x.id === combatantId)
    if (c) {
      const total = (c.iniBasis || 10) + roll
      updateCombatant(combatantId, { iniRoll: roll, initiative: total })
      addBattleLogEntry(currentBattleId, { type: 'system', text: `${c.name}: INI ${c.iniBasis} + ${roll} = ${total}` })
    }
  }

  // Check if all initiatives are set
  const allIniSet = currentBattle?.initiativeOrder.every(c => c.initiative > 0) && (currentBattle?.initiativeOrder.length || 0) > 0

  // ── Open combat overlay ──
  const handleStartFight = () => {
    // Re-sort by initiative before starting (all rolls are in now)
    const sorted = [...(currentBattle?.initiativeOrder || [])].sort((a, b) => (b.initiative || 0) - (a.initiative || 0))
    useCombatStore.getState().reorderInitiative(currentBattleId, sorted)
    sendMessage?.({
      type: 'combat_start',
      payload: {
        battle_id: currentBattleId,
        name: currentBattle?.name,
        combatants: sorted,
        round: 1,
      },
    })
    onOpenCombat?.(currentBattleId)
    setPhase('idle')
    setBattleName('')
    setSelectedTokens({})
    setNpcIniRolls({})
    setIniRequestsSent(false)
  }

  // ── Render existing battles (can reopen overlay) ──
  if (phase === 'idle') {
    return (
      <div className="space-y-2">
        {/* Existing battles */}
        {battleList.map(battle => (
          <button
            key={battle.id}
            onClick={() => onOpenCombat?.(battle.id)}
            className="w-full flex items-center gap-2 px-3 py-2 bg-red-950/10 border border-red-900/20 rounded text-left hover:border-red-800/30 transition-colors"
          >
            <Swords className="w-4 h-4 text-red-400" />
            <div className="flex-1">
              <div className="text-xs font-semibold text-dsa-parchment">{battle.name}</div>
              <div className="text-[9px] text-dsa-parchment-dark">Runde {battle.round} · {battle.initiativeOrder.length} Kaempfer</div>
            </div>
            <Badge variant="danger" size="sm">Oeffnen</Badge>
          </button>
        ))}

        {/* Start new */}
        <button
          onClick={() => setPhase('select')}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-red-900/20 text-red-400 border border-red-800/20 rounded text-xs hover:bg-red-900/30 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Kampf vorbereiten
        </button>

        {!hasBattles && (
          <p className="text-[9px] text-dsa-parchment-dark text-center">Kein aktiver Kampf.</p>
        )}
      </div>
    )
  }

  // ── SELECT PHASE ──
  if (phase === 'select') {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-dsa-gold">Kampf vorbereiten</h4>
          <button onClick={() => { setPhase('idle'); setSelectedTokens({}); setIniRequestsSent(false) }} className="text-[9px] text-dsa-parchment-dark hover:text-dsa-parchment">Abbrechen</button>
        </div>

        <input
          type="text"
          value={battleName}
          onChange={(e) => setBattleName(e.target.value)}
          className="input-field text-xs py-1.5"
          placeholder="Name (z.B. Hinterhalt im Wald)"
        />

        <div>
          <p className="text-[10px] text-dsa-parchment-dark mb-1.5">Wer nimmt teil?</p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {combatTokens.map(t => {
              const sel = selectedTokens[t.id]
              const icon = t.entity_type === 'player' ? '🟢' : t.entity_type === 'creature' ? '🔴' : '🟡'
              return (
                <button key={t.id} onClick={() => toggleToken(t.id)}
                  className={clsx('w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-[10px] transition-colors text-left',
                    sel ? 'bg-red-900/20 border border-red-800/30 text-dsa-parchment' : 'bg-dsa-bg border border-dsa-bg-medium text-dsa-parchment-dark hover:text-dsa-parchment'
                  )}>
                  <span className={clsx('w-4 h-4 rounded border flex items-center justify-center text-[8px]', sel ? 'bg-red-500 border-red-500 text-white' : 'border-dsa-bg-medium')}>{sel && '✓'}</span>
                  <span>{icon}</span>
                  <span className="flex-1 truncate">{t.name}</span>
                  {t.max_lep > 0 && <span className="text-[8px] text-dsa-parchment-dark">LeP {t.current_lep || t.max_lep}</span>}
                </button>
              )
            })}
          </div>
          <div className="flex gap-2 mt-1 text-[9px]">
            <button onClick={() => { const all = {}; combatTokens.forEach(t => all[t.id] = true); setSelectedTokens(all) }} className="text-dsa-parchment-dark hover:text-dsa-parchment">Alle</button>
            <button onClick={() => setSelectedTokens({})} className="text-dsa-parchment-dark hover:text-dsa-parchment">Keine</button>
          </div>
        </div>

        <button onClick={handleProceedToInitiative} disabled={selectedCount === 0}
          className="w-full btn-primary text-xs py-2 flex items-center justify-center gap-1.5 disabled:opacity-30">
          <Dice5 className="w-3.5 h-3.5" /> Weiter: Initiative ({selectedCount} Kaempfer)
        </button>
      </div>
    )
  }

  // ── INITIATIVE PHASE ──
  if (phase === 'initiative' && currentBattle) {
    const npcCombatants = currentBattle.initiativeOrder.filter(c => c.isNPC)
    const playerCombatants = currentBattle.initiativeOrder.filter(c => !c.isNPC)

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-dsa-gold">Initiative wuerfeln</h4>
          <button onClick={() => { setPhase('idle'); endBattle(currentBattleId); setCurrentBattleId(null); setIniRequestsSent(false); setNpcIniRolls({}); setSelectedTokens({}) }} className="text-[9px] text-dsa-parchment-dark hover:text-dsa-parchment">Abbrechen</button>
        </div>

        <p className="text-[10px] text-dsa-parchment-dark">Jeder Kaempfer wuerfelt 1W6. Das Ergebnis wird zum INI-Basiswert addiert.</p>

        {/* Players: one button to request from all */}
        {playerCombatants.length > 0 && (
          <div className="bg-green-950/10 border border-green-900/20 rounded p-2.5">
            <h5 className="text-[10px] text-green-400 font-semibold mb-1.5">🟢 Spieler ({playerCombatants.length})</h5>
            {playerCombatants.map(c => (
              <div key={c.id} className="flex items-center justify-between text-[10px] py-1">
                <span className="text-dsa-parchment">{c.name}</span>
                <span className="text-dsa-parchment-dark">
                  Basis <span className="font-mono text-dsa-gold">{c.iniBasis}</span>
                  {c.initiative > 0 && <span className="ml-1 text-green-400">+ {c.iniRoll} = <span className="font-bold">{c.initiative}</span> ✓</span>}
                </span>
              </div>
            ))}
            {!iniRequestsSent ? (
              <button onClick={handleSendIniRequests}
                className="w-full mt-2 px-3 py-1.5 bg-green-900/20 text-green-400 border border-green-800/20 rounded-sm text-[10px] hover:bg-green-900/30 transition-colors flex items-center justify-center gap-1">
                <Dice5 className="w-3 h-3" /> Alle Spieler: "Wuerfelt 1W6 fuer Initiative!"
              </button>
            ) : (
              <p className="text-[9px] text-green-400/60 text-center mt-1">Aufforderung gesendet — warte auf Eingabe der Spieler...</p>
            )}
          </div>
        )}

        {/* NPCs: GM enters W6 for each */}
        {npcCombatants.length > 0 && (
          <div className="bg-red-950/10 border border-red-900/20 rounded p-2.5">
            <h5 className="text-[10px] text-red-400 font-semibold mb-1.5">{npcCombatants.some(c => c.entityType === 'creature') ? '🔴' : '🟡'} NSC & Kreaturen ({npcCombatants.length})</h5>
            <p className="text-[9px] text-dsa-parchment-dark mb-1.5">Wuerfle 1W6 fuer jeden und trage das Ergebnis ein:</p>
            <div className="space-y-1">
              {npcCombatants.map(c => (
                <div key={c.id} className="flex items-center gap-2 text-[10px]">
                  <span className="text-dsa-parchment flex-1 truncate">{c.name}</span>
                  <span className="text-dsa-parchment-dark text-[9px]">Basis {c.iniBasis} +</span>
                  {c.initiative > 0 ? (
                    <span className="text-dsa-gold font-mono text-xs text-center">+ {c.iniRoll} = <span className="font-bold">{c.initiative}</span> ✓</span>
                  ) : (
                    <input
                      type="number" min="1" max="6"
                      className="w-10 h-6 bg-dsa-bg border-2 border-dsa-gold/40 rounded-sm text-center text-sm font-mono text-dsa-gold focus:outline-none focus:border-dsa-gold focus:ring-1 focus:ring-dsa-gold/30"
                      placeholder="1-6"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const v = parseInt(e.target.value, 10)
                          if (v >= 1 && v <= 6) handleNpcIniRoll(c.id, v)
                        }
                      }}
                      onBlur={(e) => {
                        const v = parseInt(e.target.value, 10)
                        if (v >= 1 && v <= 6) handleNpcIniRoll(c.id, v)
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Start button — only when all INI set */}
        <button onClick={handleStartFight} disabled={!allIniSet}
          className="w-full btn-primary text-xs py-2.5 flex items-center justify-center gap-2 disabled:opacity-30">
          <Play className="w-4 h-4" /> {allIniSet ? 'Kampf beginnen!' : `Warte auf Initiative... (${currentBattle.initiativeOrder.filter(c => c.initiative > 0).length}/${currentBattle.initiativeOrder.length})`}
        </button>
      </div>
    )
  }

  return null
}
