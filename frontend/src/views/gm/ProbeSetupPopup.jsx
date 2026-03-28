/**
 * ProbeSetupPopup — Full GM probe workflow.
 * Step 1: Configure probe (talent, difficulty, group mode, consequences)
 * Step 2: Wait for player results
 * Step 3: View results, apply consequences
 */
import { useState, useEffect } from 'react'
import {
  X, Send, Search, ChevronDown, ChevronUp, Check, Dice5,
  Users, User, Trophy, AlertTriangle, Clock
} from 'lucide-react'
import useAuthStore from '../../stores/authStore'
import useCharacterStore from '../../stores/characterStore'
import useCombatStore from '../../stores/combatStore'
import useSessionStore from '../../stores/sessionStore'
import ConsequenceBuilder from './ConsequenceBuilder'
import DataBrowser from './DataBrowser'
import clsx from 'clsx'

const GROUP_MODES = [
  { id: 'individual', label: 'Einzelprobe', icon: User, desc: 'Jeder Spieler hat sein eigenes Ergebnis — unabhängig voneinander.' },
  { id: 'group', label: 'Gruppenprobe', icon: Users, desc: 'Die Probe gilt nur als bestanden, wenn ALLE Spieler bestehen.' },
  { id: 'best_wins', label: 'Wettbewerb (Bester)', icon: Trophy, desc: 'Wer die höchste Qualitätsstufe würfelt, gewinnt.' },
  { id: 'worst_wins', label: 'Wettbewerb (Schlechtester)', icon: AlertTriangle, desc: 'Wer am schlechtesten würfelt, "gewinnt" — z.B. wer löst die Falle aus?' },
]

export default function ProbeSetupPopup({ players, sendMessage, onClose, onMinimize, talentList }) {
  const token = useAuthStore((s) => s.token)

  // Step state
  const [step, setStep] = useState('setup') // 'setup' | 'waiting' | 'results'

  // Setup state
  const [talentSearch, setTalentSearch] = useState('')
  const [selectedTalent, setSelectedTalent] = useState(null)
  const [showTalentBrowser, setShowTalentBrowser] = useState(false)
  const [probeName, setProbeName] = useState('') // optional custom name
  const [difficulty, setDifficulty] = useState(0)
  const [groupMode, setGroupMode] = useState('individual')
  const [successConsequences, setSuccessConsequences] = useState([])
  const [failConsequences, setFailConsequences] = useState([])

  // Results state
  const [results, setResults] = useState({}) // characterId → { success, qs, rolls, ... }
  const [appliedConsequences, setAppliedConsequences] = useState([]) // consequences the GM chose to apply
  const [pendingDiceConsequences, setPendingDiceConsequences] = useState(0) // count of dice consequences waiting for player rolls
  const [consequenceResults, setConsequenceResults] = useState([]) // { charName, label, value }

  // Listen for dice results from players
  const lastDiceResult = useCombatStore((s) => s.lastDiceResult)
  useEffect(() => {
    if (!lastDiceResult) return

    // Handle consequence dice rolls (damage/heal with dice formula)
    console.log('[PROBE-EFFECT] lastDiceResult changed:', lastDiceResult?.request_type, 'step:', step)
    if (lastDiceResult.request_type === 'consequence_roll' && step === 'results') {
      const charId = lastDiceResult.character_id
      const charName = lastDiceResult.character_name || 'Spieler'
      const val = lastDiceResult.value || 0
      const cType = lastDiceResult.consequence_type
      const resource = lastDiceResult.resource || 'lep'
      if (cType === 'damage') {
        console.log('[PROBE] Applying damage:', charId, val, 'lep_delta:', -val)
        sendMessage?.({ type: 'vitals_update', payload: { character_id: charId, vitals: { lep_delta: -val } } })
        sendMessage?.({ type: 'combat_log_entry', payload: { type: 'damage', text: `${charName}: ${val} Schadenspunkte` } })
        setConsequenceResults(prev => [...prev, { charName, label: 'Schaden', value: val }])
      } else if (cType === 'heal') {
        sendMessage?.({ type: 'vitals_update', payload: { character_id: charId, vitals: { [`${resource}_delta`]: val } } })
        const resName = resource === 'asp' ? 'Astralpunkte' : resource === 'kap' ? 'Karmapunkte' : 'Lebenspunkte'
        sendMessage?.({ type: 'combat_log_entry', payload: { type: 'heal', text: `${charName}: +${val} ${resName}` } })
        setConsequenceResults(prev => [...prev, { charName, label: resName, value: val }])
      }
      setPendingDiceConsequences(prev => {
        const newCount = Math.max(0, prev - 1)
        // If this was the last pending consequence, close after brief delay
        if (newCount === 0) {
          setTimeout(() => {
            const procs = useSessionStore.getState().activeProcesses.filter(p => p.type === 'probe')
            procs.forEach(p => useSessionStore.getState().removeActiveProcess(p.id))
          }, 500)
        }
        return newCount
      })
      useCombatStore.getState().clearLastDiceResult()
      return
    }

    if (step !== 'waiting') return
    if (lastDiceResult.request_type !== 'talent_probe') return

    // Match by character_id OR from_user (backend adds from_user)
    const charId = lastDiceResult.character_id || players.find(p => p.id === lastDiceResult.from_user)?.characterId
    if (charId) {
      setResults(prev => {
        const next = {
          ...prev,
          [charId]: {
            success: lastDiceResult.success,
            qs: lastDiceResult.qs || 0,
            rolls: lastDiceResult.rolls || [],
            fp_remaining: lastDiceResult.fp_remaining,
            talent_name: lastDiceResult.talent_name,
            character_name: lastDiceResult.character_name,
          },
        }
        // Check if all results are now in — auto-apply consequences and show results
        const allIn = players.filter(p => p.characterId).every(p => next[p.characterId])
        if (allIn) setTimeout(() => {
          setStep('results')
          // Auto-apply consequences if any were pre-defined
          if (successConsequences.length > 0 || failConsequences.length > 0) {
            setTimeout(() => autoApplyConsequences(next), 200)
          }
        }, 100)
        return next
      })
      useCombatStore.getState().clearLastDiceResult()
    }
  }, [lastDiceResult])

  const allResultsIn = players.filter(p => p.characterId).every(p => results[p.characterId])

  // Get player talent FW
  const getPlayerFW = (player) => {
    if (!selectedTalent || !player.character?.talents) return 0
    const talents = player.character.talents
    const normName = s => s.toLowerCase().replace(/[äöüß]/g, m => ({ 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' }[m] || m))
    for (const [k, v] of Object.entries(talents)) {
      if (normName(k) === normName(selectedTalent.name) || k.toLowerCase() === selectedTalent.id) {
        return typeof v === 'object' ? (v.fw || v.value || 0) : (v || 0)
      }
    }
    return 0
  }

  // Build merged talent list: character-specific entries first, then databank entries not already present
  const mergedTalentList = (() => {
    // Collect every talent name that appears in any selected player's character
    const charTalents = []
    const seenNames = new Set()
    for (const p of players) {
      const rawTalents = p.character?.talents || {}
      for (const [name, val] of Object.entries(rawTalents)) {
        const key = name.toLowerCase()
        if (!seenNames.has(key)) {
          seenNames.add(key)
          // Build a minimal databank-compatible shape so the popup can render and send it
          const fw = typeof val === 'object' ? (val.fw || val.value || 0) : (val || 0)
          charTalents.push({
            id: key,
            name,
            probe: typeof val === 'object' ? (val.probe || []) : [],
            category: typeof val === 'object' ? (val.category || '') : '',
            encumbrance: typeof val === 'object' ? (val.encumbrance || 'nein') : 'nein',
            _fw: fw,
            _fromCharacter: true,
          })
        }
      }
    }
    // Append databank entries whose name isn't already covered by a character entry
    const databankExtras = (talentList || []).filter(
      t => !seenNames.has((t.name || '').toLowerCase())
    )
    return [...charTalents, ...databankExtras]
  })()

  // Filter talents
  const filteredTalents = talentSearch
    ? mergedTalentList.filter(t => (t.name || '').toLowerCase().includes(talentSearch.toLowerCase())).slice(0, 12)
    : []

  // Send probe to players
  const handleSend = () => {
    for (const p of players) {
      if (!p.characterId) continue
      const fw = getPlayerFW(p)
      const talent = selectedTalent
      sendMessage?.({
        type: 'dice_request',
        payload: {
          target_user_id: p.id,
          character_name: p.character?.name,
          type: 'talent_probe',
          talent_name: talent.name,
          label: probeName || talent.name,
          probe: talent.probe || [],
          fw,
          difficulty,
          encumbrance: talent.encumbrance === 'ja',
          be_penalty: talent.encumbrance === 'ja' ? (p._be || 0) : 0,
          gm_modifier: difficulty,
          // Include full consequence data so player's result screen can handle dice rolls
          success_consequences: successConsequences.map(c => ({
            type: c.type,
            label: c.label || c.condition || c.itemName || c.skillName || c.abilityName || c.type,
            value: c.value || c.amount || c.level || '',
            resource: c.resource || 'lep',
            needsRoll: (c.type === 'damage' || c.type === 'heal') && typeof c.value === 'string' && /\d*[Ww]\d+/.test(c.value),
          })),
          fail_consequences: failConsequences.map(c => ({
            type: c.type,
            label: c.label || c.condition || c.itemName || c.skillName || c.abilityName || c.type,
            value: c.value || c.amount || c.level || '',
            resource: c.resource || 'lep',
            needsRoll: (c.type === 'damage' || c.type === 'heal') && typeof c.value === 'string' && /\d*[Ww]\d+/.test(c.value),
          })),
        },
      })
    }
    // Build smart log message — only include what's set
    const displayName = probeName || selectedTalent.name
    const logParts = [`Probe: ${displayName}${probeName ? ` (${selectedTalent.name})` : ''}`]
    if (difficulty) logParts.push(`(${difficulty > 0 ? '+' : ''}${difficulty})`)
    if (groupMode !== 'individual') logParts.push(`[${GROUP_MODES.find(m => m.id === groupMode)?.label}]`)
    if (players.length > 1) logParts.push(`— ${players.map(p => p.character?.name?.split(' ')[0] || p.username).join(', ')}`)
    else logParts.push(`— ${players[0]?.character?.name || players[0]?.username}`)
    sendMessage?.({ type: 'combat_log_entry', payload: { type: 'system', text: logParts.join(' ') } })
    // Register as active process so GM can recover after minimize/refresh
    useSessionStore.getState().addActiveProcess({
      id: `probe_${Date.now()}`,
      type: 'probe',
      label: `Probe: ${displayName}`,
      timestamp: Date.now(),
    })
    setStep('waiting')
  }

  // Compute group result (accepts optional results override for auto-apply)
  const computeGroupResult = (resultsOverride = null) => {
    const r = resultsOverride || results
    const playerResults = players.filter(p => p.characterId && r[p.characterId])
    const successes = playerResults.filter(p => r[p.characterId]?.success)
    const failures = playerResults.filter(p => !r[p.characterId]?.success)

    // QS for sorting — failed players get -1 so they're always worst
    const getQS = (p) => r[p.characterId]?.success ? (r[p.characterId]?.qs || 0) : -1

    switch (groupMode) {
      case 'group':
        return { passed: failures.length === 0, summary: `${successes.length}/${playerResults.length} bestanden — ${failures.length === 0 ? 'Gruppenprobe bestanden!' : 'Gruppenprobe gescheitert!'}` }
      case 'best_wins': {
        const bestQS = Math.max(...playerResults.map(p => getQS(p)))
        const winners = playerResults.filter(p => getQS(p) === bestQS)
        const names = winners.map(p => p.character?.name?.split(' ')[0]).join(' & ')
        return { winners, summary: `Beste${winners.length > 1 ? 'n' : 'r'}: ${names} (QS ${bestQS})` }
      }
      case 'worst_wins': {
        const worstQS = Math.min(...playerResults.map(p => getQS(p)))
        const losers = playerResults.filter(p => getQS(p) === worstQS)
        const names = losers.map(p => p.character?.name?.split(' ')[0]).join(' & ')
        return { losers, summary: `Schlechteste${losers.length > 1 ? 'n' : 'r'}: ${names} (${worstQS >= 0 ? `QS ${worstQS}` : 'Gescheitert'})` }
      }
      default:
        return { summary: `${successes.length} bestanden, ${failures.length} gescheitert` }
    }
  }

  // Apply consequences — logic depends on group mode
  // Can be called automatically (with resultsData) or manually
  const autoApplyConsequences = (resultsData = null) => {
    const r = resultsData || results
    const playerResults = players.filter(p => p.characterId && r[p.characterId])
    const succeededPlayers = playerResults.filter(p => r[p.characterId]?.success)
    const failedPlayers = playerResults.filter(p => !r[p.characterId]?.success)
    const gr = computeGroupResult(r)

    // Determine who gets success/fail consequences based on group mode
    let successTargets, failTargets
    switch (groupMode) {
      case 'group':
        // Gruppenprobe: all succeed or all fail together
        if (failedPlayers.length === 0) { successTargets = playerResults; failTargets = [] }
        else { successTargets = []; failTargets = playerResults }
        break
      case 'best_wins':
        // Best QS player(s) get success, everyone else gets fail (ties share the win)
        successTargets = gr.winners || []
        failTargets = playerResults.filter(p => !successTargets.includes(p))
        break
      case 'worst_wins':
        // Worst player(s) get fail consequences, rest get success (ties share the loss)
        failTargets = gr.losers || []
        successTargets = playerResults.filter(p => !failTargets.includes(p))
        break
      default:
        // Einzelprobe: individual results
        successTargets = succeededPlayers
        failTargets = failedPlayers
    }

    const allToApply = [
      ...successConsequences.map(c => ({ ...c, _targets: successTargets })),
      ...failConsequences.map(c => ({ ...c, _targets: failTargets })),
      ...appliedConsequences.map(c => ({ ...c, _targets: playerResults })),
    ]

    // Helper: check if a value is a dice formula
    const isDiceFormula = (v) => typeof v === 'string' && /\d*[Ww]\d+/.test(v)

    for (const c of allToApply) {
      const targetPlayers = c._targets || playerResults

      for (const p of targetPlayers) {
        const charId = p.characterId

        // If damage/heal has a dice formula → player rolls it in their ProbePopup (already has the data)
        // We just need to wait for the consequence_roll dice_result to come back
        if ((c.type === 'damage' || c.type === 'heal') && isDiceFormula(c.value)) {
          setPendingDiceConsequences(prev => prev + 1)
          continue // Don't apply now — player's ProbePopup handles the dice roll, we wait for result
        }

        // Apply based on type (immediate — fixed values only)
        switch (c.type) {
          case 'damage': {
            const val = parseInt(c.value) || 0
            sendMessage?.({ type: 'vitals_update', payload: { character_id: charId, vitals: { lep_delta: -val } } })
            break
          }
          case 'heal': {
            const val = parseInt(c.value) || 0
            sendMessage?.({ type: 'vitals_update', payload: { character_id: charId, vitals: { [`${c.resource || 'lep'}_delta`]: val } } })
            break
          }
          case 'condition_add':
            sendMessage?.({ type: 'conditions_update', payload: { character_id: charId, add_condition: c.condition, level: c.level || 1 } })
            break
          case 'condition_remove':
            sendMessage?.({ type: 'conditions_update', payload: { character_id: charId, remove_condition: c.condition, reduce_level: c.level || 1 } })
            break
          case 'item_give':
            sendMessage?.({ type: 'combat_log_entry', payload: { type: 'system', text: `${p.character?.name} erhält: ${c.quantity || 1}x ${c.itemName}` } })
            if (token && charId) {
              fetch(`/api/inventory/${charId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ item_name: c.itemName, quantity: c.quantity || 1 }),
              }).catch(err => console.error('Failed to add item to inventory:', err))
            }
            break
          case 'money':
            sendMessage?.({ type: 'combat_log_entry', payload: { type: 'system', text: `${p.character?.name} erhält: ${c.dukaten || 0}D ${c.silber || 0}S ${c.heller || 0}H` } })
            break
          case 'info':
            sendMessage?.({ type: 'whisper', payload: { target_user_id: p.id, text: c.text || '' } })
            break
          case 'ap':
            sendMessage?.({ type: 'combat_log_entry', payload: { type: 'system', text: `${p.character?.name}: +${c.amount || 0} Abenteuerpunkte` } })
            break
          case 'sf_learn':
            sendMessage?.({ type: 'combat_log_entry', payload: { type: 'system', text: `${p.character?.name} lernt Sonderfertigkeit: ${c.abilityName}` } })
            break
          case 'talent_up':
            sendMessage?.({ type: 'combat_log_entry', payload: { type: 'system', text: `${p.character?.name}: ${c.skillName} +1 Fertigkeitswert` } })
            break
          case 'spell_learn':
            sendMessage?.({ type: 'combat_log_entry', payload: { type: 'system', text: `${p.character?.name} lernt: ${c.abilityName}` } })
            break
          case 'combat_tech_up':
            sendMessage?.({ type: 'combat_log_entry', payload: { type: 'system', text: `${p.character?.name}: ${c.skillName} +1 Kampftechnikwert` } })
            break
        }
      }
    }

    // Broadcast consequence results to all — players see it in their result screen and Protokoll
    const perPlayerConsequences = {}
    for (const c of allToApply) {
      for (const p of (c._targets || [])) {
        if (!perPlayerConsequences[p.characterId]) perPlayerConsequences[p.characterId] = { name: p.character?.name, userId: p.id, descs: [] }
        const desc = c.label || c.condition || c.itemName || c.skillName || c.abilityName || c.text?.slice(0, 40) || c.type
        perPlayerConsequences[p.characterId].descs.push(desc)
      }
    }
    for (const [charId, info] of Object.entries(perPlayerConsequences)) {
      const r = (resultsData || results)[charId]
      const resultLabel = r?.success ? `✓ QS ${r.qs}` : '✗ Gescheitert'
      // Send to Protokoll
      sendMessage?.({ type: 'combat_log_entry', payload: { type: r?.success ? 'heal' : 'damage', text: `${info.name}: ${resultLabel} — ${info.descs.join(', ')}` } })
      // Send structured result to the specific player so their popup shows consequences
      sendMessage?.({ type: 'probe_consequence', payload: {
        target_user_id: info.userId,
        character_id: charId,
        probe_name: probeName || selectedTalent?.name,
        success: r?.success,
        qs: r?.qs,
        consequences: info.descs,
      }})
    }

    setAppliedConsequences(allToApply)
    // Smart result log — structured format: "Gruppenprobe Singen (3 TN): bestanden, QS 2"
    const grLog = computeGroupResult(resultsData)
    const pCount = players.filter(p => p.characterId && r[p.characterId]).length
    const modeLabel = groupMode === 'group' ? 'Gruppenprobe' : groupMode !== 'individual' ? GROUP_MODES.find(m => m.id === groupMode)?.label || 'Probe' : 'Probe'
    const skillName = probeName || selectedTalent?.name
    const resultParts = [`${modeLabel} ${skillName} (${pCount} TN)`]
    // Compute average QS of successes for group/individual summary
    const successResults = players.filter(p => p.characterId && r[p.characterId]?.success).map(p => r[p.characterId])
    const avgQS = successResults.length > 0 ? Math.round(successResults.reduce((s, x) => s + (x.qs || 0), 0) / successResults.length) : 0
    if (groupMode === 'group') {
      resultParts.push(grLog.passed ? `bestanden, QS ${avgQS}` : `gescheitert (${successResults.length}/${pCount} bestanden)`)
    } else if (grLog.summary) {
      resultParts.push(grLog.summary)
    }
    const allC = [...successConsequences, ...failConsequences, ...appliedConsequences]
    if (allC.length > 0) {
      const cSummary = allC.map(c => c.label || c.condition || c.itemName || c.skillName || c.abilityName || c.text?.slice(0, 20) || c.type).filter(Boolean).join(', ')
      if (cSummary) resultParts.push(`[${cSummary}]`)
    }
    sendMessage?.({ type: 'combat_log_entry', payload: { type: 'system', text: resultParts.join(': ') } })
    // Only auto-close if no pending dice consequences — otherwise stay open and wait
    if (pendingDiceConsequences <= 0) {
      const procs = useSessionStore.getState().activeProcesses.filter(p => p.type === 'probe')
      procs.forEach(p => useSessionStore.getState().removeActiveProcess(p.id))
      setTimeout(onClose, 2000)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => onMinimize ? onMinimize() : onClose()}>
      <div className="bg-dsa-bg border border-dsa-bg-medium rounded shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-fade-in" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-dsa-bg-medium bg-dsa-bg-card flex-shrink-0">
          <h3 className="text-sm font-display font-semibold text-dsa-gold flex items-center gap-2">
            <Dice5 className="w-5 h-5" />
            {step === 'setup' ? 'Probe vorbereiten' : step === 'waiting' ? 'Warte auf Ergebnisse...' : 'Probenergebnisse'}
          </h3>
          <div className="flex items-center gap-2">
            {onMinimize && step !== 'setup' && (
              <button onClick={onMinimize} className="text-[10px] text-dsa-parchment-dark hover:text-dsa-parchment bg-dsa-bg-medium rounded px-2 py-0.5" title="Minimieren — Probe bleibt aktiv">Minimieren</button>
            )}
            <button onClick={() => {
              // Abort — remove active process and close
              const procs = useSessionStore.getState().activeProcesses.filter(p => p.type === 'probe')
              procs.forEach(p => useSessionStore.getState().removeActiveProcess(p.id))
              onClose()
            }} className="text-dsa-parchment-dark hover:text-red-400 transition" title="Probe abbrechen"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* ── STEP 1: SETUP ── */}
          {step === 'setup' && (
            <>
              {/* Talent search */}
              <div>
                <label className="text-[10px] text-dsa-parchment-dark uppercase tracking-wider font-bold">Talent auswählen</label>
                <div className="relative mt-1 flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dsa-parchment-dark/40" />
                    <input value={selectedTalent ? selectedTalent.name : talentSearch}
                      onChange={e => { setTalentSearch(e.target.value); setSelectedTalent(null) }}
                      onFocus={() => { if (selectedTalent) { setTalentSearch(selectedTalent.name); setSelectedTalent(null) } }}
                      className="input-field text-xs w-full pl-8" placeholder="Talent suchen..." />
                  </div>
                  <button onClick={() => setShowTalentBrowser(true)}
                    className="px-3 py-1.5 text-[10px] bg-dsa-bg-card border border-dsa-bg-medium text-dsa-parchment-dark hover:text-dsa-gold hover:border-dsa-gold/30 rounded-sm transition whitespace-nowrap">
                    Durchsuchen
                  </button>
                  {showTalentBrowser && (
                    <DataBrowser type="talents" title="Talent auswählen"
                      onSelect={t => { setSelectedTalent(t); setTalentSearch(''); setShowTalentBrowser(false) }}
                      onClose={() => setShowTalentBrowser(false)} />
                  )}
                  {filteredTalents.length > 0 && !selectedTalent && (
                    <div className="absolute z-20 top-full left-0 right-0 mt-0.5 bg-dsa-bg-card border border-dsa-bg-medium rounded-sm shadow-xl max-h-48 overflow-y-auto">
                      {filteredTalents.map(t => (
                        <button key={t.id || t.name} onClick={() => { setSelectedTalent(t); setTalentSearch('') }}
                          className="w-full text-left px-3 py-1.5 hover:bg-dsa-bg-medium/50 transition text-xs border-b border-dsa-bg-medium/30">
                          <div className="flex items-center justify-between">
                            <span className="text-dsa-parchment">{t.name}</span>
                            <span className="text-[9px] text-dsa-parchment-dark">{t.category}</span>
                          </div>
                          {t.probe && <span className="text-[9px] text-dsa-gold">{Array.isArray(t.probe) ? t.probe.join('/') : t.probe}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Optional probe name */}
              <div>
                <label className="text-[10px] text-dsa-parchment-dark uppercase tracking-wider font-bold">Probenname (optional)</label>
                <input value={probeName} onChange={e => setProbeName(e.target.value)}
                  className="input-field text-xs w-full mt-1" placeholder="z.B. 'Den Felsen hinaufklettern' — wird den Spielern angezeigt" />
              </div>

              {/* Selected talent + player FWs */}
              {selectedTalent && (
                <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded-sm p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="text-sm font-bold text-dsa-gold">{selectedTalent.name}</span>
                      {selectedTalent.probe && <span className="text-xs text-dsa-parchment-dark ml-2">{selectedTalent.probe.join('/')}</span>}
                    </div>
                    {selectedTalent.encumbrance === 'ja' && <span className="text-[9px] text-amber-400 bg-amber-900/20 border border-amber-800/30 rounded-sm px-1.5 py-0.5">Behinderung</span>}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {players.filter(p => p.characterId).map(p => (
                      <div key={p.characterId} className="text-[10px] bg-dsa-bg border border-dsa-bg-medium rounded-sm px-2 py-1">
                        <span className="text-dsa-parchment">{p.character?.name?.split(' ')[0]}</span>
                        <span className="font-mono font-bold text-dsa-gold ml-1">FW {getPlayerFW(p)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Difficulty */}
              <div>
                <label className="text-[10px] text-dsa-parchment-dark uppercase tracking-wider font-bold">Erschwernis / Erleichterung</label>
                <div className="flex items-center gap-2 mt-1">
                  <button onClick={() => setDifficulty(d => d - 1)} className="w-8 h-8 rounded-sm bg-red-900/20 border border-red-800/30 text-red-400 flex items-center justify-center hover:bg-red-900/30 text-lg font-bold">−</button>
                  <div className="text-center flex-1">
                    <div className={clsx('text-xl font-mono font-bold', difficulty > 0 ? 'text-green-400' : difficulty < 0 ? 'text-red-400' : 'text-dsa-parchment-dark/30')}>
                      {difficulty > 0 ? `+${difficulty}` : difficulty}
                    </div>
                    <div className="text-[9px] text-dsa-parchment-dark">{difficulty > 0 ? 'Erleichtert' : difficulty < 0 ? 'Erschwert' : 'Normal'}</div>
                  </div>
                  <button onClick={() => setDifficulty(d => d + 1)} className="w-8 h-8 rounded-sm bg-green-900/20 border border-green-800/30 text-green-400 flex items-center justify-center hover:bg-green-900/30 text-lg font-bold">+</button>
                </div>
              </div>

              {/* Group mode */}
              <div>
                <label className="text-[10px] text-dsa-parchment-dark uppercase tracking-wider font-bold">Proben-Modus</label>
                <div className="grid grid-cols-2 gap-1.5 mt-1">
                  {GROUP_MODES.map(m => {
                    const Icon = m.icon
                    return (
                      <button key={m.id} onClick={() => setGroupMode(m.id)}
                        className={clsx('flex items-start gap-2 text-left px-3 py-2 rounded-sm border transition',
                          groupMode === m.id ? 'bg-dsa-gold/10 border-dsa-gold/30 text-dsa-gold' : 'bg-dsa-bg-card border-dsa-bg-medium text-dsa-parchment-dark hover:text-dsa-parchment')}>
                        <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <div>
                          <div className="text-[10px] font-bold">{m.label}</div>
                          <div className="text-[8px] opacity-60">{m.desc}</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Consequences (optional) — separated by success/fail */}
              <div className="space-y-3">
                <p className="text-[9px] text-dsa-parchment-dark/50">Definiere vorab, was bei Erfolg oder Misserfolg passieren soll. Beides ist optional — du kannst auch nach dem Ergebnis entscheiden.</p>

                <div className="bg-green-900/10 border border-green-800/20 rounded-sm p-2.5">
                  <label className="text-[10px] text-green-400 uppercase tracking-wider font-bold flex items-center gap-1">
                    <Check className="w-3 h-3" /> Bei Erfolg
                  </label>
                  <ConsequenceBuilder consequences={successConsequences} onChange={setSuccessConsequences} players={players} />
                </div>

                <div className="bg-red-900/10 border border-red-800/20 rounded-sm p-2.5">
                  <label className="text-[10px] text-red-400 uppercase tracking-wider font-bold flex items-center gap-1">
                    <X className="w-3 h-3" /> Bei Misserfolg
                  </label>
                  <ConsequenceBuilder consequences={failConsequences} onChange={setFailConsequences} players={players} />
                </div>
              </div>
            </>
          )}

          {/* ── STEP 2: WAITING ── */}
          {step === 'waiting' && (
            <div className="text-center py-6">
              <Dice5 className="w-10 h-10 text-dsa-gold mx-auto mb-3 animate-pulse" />
              <p className="text-sm text-dsa-parchment mb-4">Warte auf Würfelergebnisse...</p>
              <div className="space-y-1.5">
                {players.filter(p => p.characterId).map(p => {
                  const r = results[p.characterId]
                  return (
                    <div key={p.characterId} className={clsx('flex items-center gap-3 px-4 py-2 rounded-sm border',
                      r ? (r.success ? 'bg-green-900/10 border-green-800/30' : 'bg-red-900/10 border-red-800/30') : 'bg-dsa-bg-card border-dsa-bg-medium')}>
                      <span className="text-xs text-dsa-parchment flex-1">{p.character?.name || p.username}</span>
                      {r ? (
                        <span className={clsx('text-xs font-bold', r.success ? 'text-green-400' : 'text-red-400')}>
                          {r.success ? `✓ QS ${r.qs}` : '✗ Misslungen'}
                        </span>
                      ) : (
                        <span className="text-[10px] text-dsa-parchment-dark animate-pulse flex items-center gap-1"><Clock className="w-3 h-3" /> Würfelt...</span>
                      )}
                    </div>
                  )
                })}
              </div>
              {allResultsIn && <p className="text-xs text-dsa-gold mt-3">Alle Ergebnisse eingegangen!</p>}
            </div>
          )}

          {/* ── STEP 3: RESULTS ── */}
          {step === 'results' && (
            <>
              {/* Group result summary */}
              {(() => {
                const gr = computeGroupResult()
                return (
                  <div className={clsx('rounded-sm border p-3 text-center',
                    gr.passed === true ? 'bg-green-900/15 border-green-800/30' :
                    gr.passed === false ? 'bg-red-900/15 border-red-800/30' :
                    'bg-dsa-bg-card border-dsa-bg-medium'
                  )}>
                    <p className="text-sm font-bold text-dsa-parchment">{selectedTalent?.name}{difficulty ? ` (${difficulty > 0 ? '+' : ''}${difficulty})` : ''}</p>
                    <p className={clsx('text-xs font-bold mt-1', gr.passed === true ? 'text-green-400' : gr.passed === false ? 'text-red-400' : 'text-dsa-gold')}>
                      {gr.summary}
                    </p>
                  </div>
                )
              })()}

              {/* Per-player results */}
              <div className="space-y-1">
                {players.filter(p => p.characterId && results[p.characterId]).map(p => {
                  const r = results[p.characterId]
                  return (
                    <div key={p.characterId} className={clsx('flex items-center gap-3 px-3 py-2 rounded-sm border',
                      r.success ? 'bg-green-900/10 border-green-800/30' : 'bg-red-900/10 border-red-800/30')}>
                      <span className="text-xs text-dsa-parchment font-medium flex-1">{p.character?.name}</span>
                      <span className="text-[10px] text-dsa-parchment-dark font-mono">FW {getPlayerFW(p)}</span>
                      <span className={clsx('text-xs font-bold', r.success ? 'text-green-400' : 'text-red-400')}>
                        {r.success ? `✓ QS ${r.qs}` : '✗ Misslungen'}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Pre-defined consequences — show what will be applied */}
              {(successConsequences.length > 0 || failConsequences.length > 0) && (() => {
                const typeDef = { damage: '❤️ Schaden', heal: '💚 Heilung', condition_add: '⚠️ Zustand+', condition_remove: '✅ Zustand-', item_give: '📦 Item+', money: '💰 Geld', info: '💬 Info', ap: '⭐ AP', sf_learn: '🏆 SF', talent_up: '📖 Talent+', spell_learn: '✨ Zauber', combat_tech_up: '⚔️ KT+' }
                // Determine who counts as succeeded/failed based on group mode
                const gr2 = computeGroupResult()
                let hasSucceeded, hasFailed, successNames, failNames
                if (groupMode === 'group') {
                  const allPassed = !players.some(p => p.characterId && !results[p.characterId]?.success)
                  hasSucceeded = allPassed; hasFailed = !allPassed
                  successNames = allPassed ? 'Alle' : ''; failNames = !allPassed ? 'Alle' : ''
                } else if (groupMode === 'best_wins') {
                  hasSucceeded = (gr2.winners || []).length > 0; hasFailed = true
                  successNames = (gr2.winners || []).map(p => p.character?.name?.split(' ')[0]).join(' & '); failNames = 'Rest'
                } else if (groupMode === 'worst_wins') {
                  hasSucceeded = true; hasFailed = (gr2.losers || []).length > 0
                  successNames = 'Rest'; failNames = (gr2.losers || []).map(p => p.character?.name?.split(' ')[0]).join(' & ')
                } else {
                  hasSucceeded = players.some(p => results[p.characterId]?.success)
                  hasFailed = players.some(p => p.characterId && !results[p.characterId]?.success)
                  successNames = players.filter(p => results[p.characterId]?.success).map(p => p.character?.name?.split(' ')[0]).join(', ')
                  failNames = players.filter(p => p.characterId && !results[p.characterId]?.success).map(p => p.character?.name?.split(' ')[0]).join(', ')
                }
                return (
                  <div className="space-y-2">
                    {successConsequences.length > 0 && hasSucceeded && (
                      <div>
                        <div className="text-[10px] text-green-400 uppercase tracking-wider font-bold mb-1">Konsequenzen bei Erfolg {successNames && <span className="font-normal text-dsa-parchment-dark">→ {successNames}</span>}</div>
                        <div className="space-y-1">
                          {successConsequences.map(c => (
                            <div key={c.id} className="flex items-center gap-2 bg-green-900/10 border border-green-800/20 rounded-sm px-2 py-1.5">
                              <span className="text-[10px]">{typeDef[c.type] || c.type}</span>
                              <span className="text-[10px] text-dsa-parchment flex-1">{c.label || c.value || c.condition || c.itemName || c.text?.slice(0, 30) || '—'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {failConsequences.length > 0 && hasFailed && (
                      <div>
                        <div className="text-[10px] text-red-400 uppercase tracking-wider font-bold mb-1">Konsequenzen bei Misserfolg {failNames && <span className="font-normal text-dsa-parchment-dark">→ {failNames}</span>}</div>
                        <div className="space-y-1">
                          {failConsequences.map(c => (
                            <div key={c.id} className="flex items-center gap-2 bg-red-900/10 border border-red-800/20 rounded-sm px-2 py-1.5">
                              <span className="text-[10px]">{typeDef[c.type] || c.type}</span>
                              <span className="text-[10px] text-dsa-parchment flex-1">{c.label || c.value || c.condition || c.itemName || c.text?.slice(0, 30) || '—'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {successConsequences.length > 0 && !hasSucceeded && (
                      <p className="text-[9px] text-dsa-parchment-dark/40 italic">Erfolgs-Konsequenzen nicht anwendbar — niemand hat bestanden.</p>
                    )}
                    {failConsequences.length > 0 && !hasFailed && (
                      <p className="text-[9px] text-dsa-parchment-dark/40 italic">Misserfolgs-Konsequenzen nicht anwendbar — alle haben bestanden.</p>
                    )}
                  </div>
                )
              })()}

              {/* Pending dice consequence rolls */}
              {pendingDiceConsequences > 0 && (
                <div className="bg-dsa-gold/10 border border-dsa-gold/30 rounded-sm p-3 text-center animate-pulse">
                  <Dice5 className="w-6 h-6 text-dsa-gold mx-auto mb-1" />
                  <p className="text-xs text-dsa-gold font-bold">Warte auf Würfelwurf für Konsequenzen...</p>
                  <p className="text-[10px] text-dsa-parchment-dark">{pendingDiceConsequences} Wurf{pendingDiceConsequences > 1 ? 'würfe' : ''} ausstehend</p>
                </div>
              )}

              {/* Consequence dice results */}
              {consequenceResults.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] text-dsa-parchment-dark uppercase tracking-wider font-bold">Konsequenz-Ergebnisse</div>
                  {consequenceResults.map((cr, i) => (
                    <div key={i} className="flex items-center gap-2 bg-dsa-bg-card border border-dsa-bg-medium rounded-sm px-2 py-1.5">
                      <span className="text-xs text-dsa-parchment">{cr.charName}</span>
                      <span className="text-xs text-dsa-parchment-dark">{cr.label}</span>
                      <span className="font-mono font-bold text-dsa-gold ml-auto">{cr.value}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Ad-hoc consequences */}
              <div>
                <div className="text-[10px] text-dsa-parchment-dark uppercase tracking-wider font-bold mb-1.5">Weitere Konsequenzen hinzufügen</div>
                <ConsequenceBuilder consequences={appliedConsequences} onChange={setAppliedConsequences} players={players} />
              </div>
            </>
          )}
        </div>

        {/* Footer — always visible at bottom */}
        <div className="px-5 py-3 border-t border-dsa-bg-medium flex justify-between items-center flex-shrink-0 bg-dsa-bg-card z-10">
          <button onClick={onClose} className="px-4 py-2 text-xs text-dsa-parchment-dark border border-dsa-bg-medium rounded-sm hover:text-dsa-parchment transition">
            {step === 'results' ? 'Schließen' : 'Abbrechen'}
          </button>
          {step === 'setup' && (
            <button onClick={handleSend} disabled={!selectedTalent}
              className="px-4 py-2 text-xs bg-dsa-gold/20 border border-dsa-gold/30 text-dsa-gold rounded-sm hover:bg-dsa-gold/30 transition font-bold flex items-center gap-2 disabled:opacity-30">
              <Send className="w-4 h-4" /> Probe senden
            </button>
          )}
          {step === 'waiting' && allResultsIn && (
            <button onClick={() => setStep('results')}
              className="px-4 py-2 text-xs bg-dsa-gold/20 border border-dsa-gold/30 text-dsa-gold rounded-sm hover:bg-dsa-gold/30 transition font-bold flex items-center gap-2">
              <Check className="w-4 h-4" /> Ergebnisse ansehen
            </button>
          )}
          {step === 'results' && appliedConsequences.length > 0 && (
            <button onClick={() => autoApplyConsequences()}
              className="px-4 py-2 text-xs bg-dsa-gold/20 border border-dsa-gold/30 text-dsa-gold rounded-sm hover:bg-dsa-gold/30 transition font-bold flex items-center gap-2">
              <Check className="w-4 h-4" /> Nachträgliche Konsequenzen anwenden
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
