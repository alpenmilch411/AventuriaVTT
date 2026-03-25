import { useState } from 'react'
import { Dice5, Check, X, HelpCircle } from 'lucide-react'
import clsx from 'clsx'

const ATTR_NAMES = {
  MU: 'Mut', KL: 'Klugheit', IN: 'Intuition', CH: 'Charisma',
  FF: 'Fingerfertigkeit', GE: 'Gewandtheit', KO: 'Konstitution', KK: 'Koerperkraft',
}

const ATTR_TEXT_COLORS = {
  MU: 'text-red-400', KL: 'text-blue-400', IN: 'text-violet-400', CH: 'text-pink-400',
  FF: 'text-emerald-400', GE: 'text-cyan-400', KO: 'text-orange-400', KK: 'text-amber-400',
}

/**
 * ProbePopup — Fullscreen dice input popup for talent/spell probes.
 *
 * Shows:
 * - What probe (talent name)
 * - 3 dice input fields (one per attribute) with target values
 * - FW as buffer with live calculation
 * - Difficulty modifier
 * - Live success/fail preview
 * - Confirm button sends result to GM
 */
export default function ProbePopup({ request, character, sendMessage, onComplete, onMinimize, canAbort = true }) {
  const [diceInputs, setDiceInputs] = useState(['', '', ''])
  const [submitted, setSubmitted] = useState(false)
  const [result, setResult] = useState(null)
  const [consequenceStep, setConsequenceStep] = useState(0)
  const [consequenceRolls, setConsequenceRolls] = useState({})
  const [consequenceInput, setConsequenceInput] = useState('')
  const [allDone, setAllDone] = useState(false)

  if (!request) return null

  const talentName = request.label || request.talent_name || 'Probe'
  const talentTechnicalName = request.talent_name && request.label && request.label !== request.talent_name ? request.talent_name : null
  const probe = request.probe || [] // ['MU', 'GE', 'KK']
  const fw = request.fw || 0
  const difficulty = request.difficulty || 0
  const bePenalty = request.be_penalty || 0
  const gmModifier = request.gm_modifier || 0
  const hasEncumbrance = request.encumbrance || false
  const attrs = character?.attributes || {}

  // For simple 1W20 probes (AT, PA, etc.)
  const isSimple = request.dice === '1W20' || request.type === 'attack' || request.type === 'defense' || request.type === 'damage' || request.type === 'initiative'

  if (isSimple) {
    return (
      <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
        <div className="bg-dsa-bg border border-dsa-gold/30 rounded shadow-2xl p-6 w-full max-w-sm text-center space-y-4 animate-fade-in relative">
          {onMinimize && <button onClick={onMinimize} className="absolute top-3 right-3 text-dsa-parchment-dark hover:text-dsa-parchment text-xs">Minimieren</button>}
          <Dice5 className="w-8 h-8 text-dsa-gold mx-auto" />
          <h2 className="text-lg font-display font-bold text-dsa-gold">{request.label || 'Wuerfeln!'}</h2>
          {request.target_value && (
            <p className="text-sm text-dsa-parchment">
              Zielwert: <span className="text-dsa-gold font-mono text-2xl font-bold">{request.target_value}</span>
            </p>
          )}
          <input
            type="number" min="1" max={request.dice === '1W6' ? 6 : 20}
            value={diceInputs[0]}
            onChange={(e) => setDiceInputs([e.target.value, '', ''])}
            className="w-20 h-20 bg-dsa-bg-light border-2 border-dsa-gold/50 rounded text-center text-4xl font-mono text-dsa-gold mx-auto focus:outline-none focus:border-dsa-gold focus:ring-4 focus:ring-dsa-gold/20"
            placeholder="—"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const val = parseInt(diceInputs[0], 10)
                if (!isNaN(val) && val >= 1) {
                  sendMessage?.({ type: 'dice_result', payload: {
                    character_id: character?.id, character_name: character?.name,
                    request_type: request.type, value: val,
                    battle_id: request.battle_id, ini_basis: request.ini_basis,
                  }})
                  onComplete?.()
                }
              }
            }}
          />
          <button
            onClick={() => {
              const val = parseInt(diceInputs[0], 10)
              if (isNaN(val) || val < 1) return
              sendMessage?.({ type: 'dice_result', payload: {
                character_id: character?.id, character_name: character?.name,
                request_type: request.type, value: val,
                battle_id: request.battle_id, ini_basis: request.ini_basis,
              }})
              onComplete?.()
            }}
            disabled={!diceInputs[0] || parseInt(diceInputs[0]) < 1}
            className="btn-primary px-8 py-3 disabled:opacity-30"
          >
            Bestätigen
          </button>
        </div>
      </div>
    )
  }

  // 3W20 Talent/Spell Probe
  if (probe.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
        <div className="bg-dsa-bg border border-red-800/50 rounded shadow-2xl p-6 w-full max-w-sm text-center space-y-3">
          <p className="text-sm text-red-400">Probe kann nicht durchgeführt werden — keine Probeneigenschaften definiert.</p>
          <button onClick={() => onComplete?.()} className="btn-primary text-xs">Schließen</button>
        </div>
      </div>
    )
  }
  const probeAttrs = probe.map(a => (attrs[a] || 0) + difficulty)
  const allFilled = probe.length === diceInputs.length && diceInputs.every(d => d && parseInt(d) >= 1 && parseInt(d) <= 20)

  // Calculate result
  let fpUsed = 0
  let detail = []
  if (allFilled) {
    const rolls = diceInputs.map(d => parseInt(d, 10))
    rolls.forEach((roll, i) => {
      const target = probeAttrs[i]
      const diff = roll > target ? roll - target : 0
      fpUsed += diff
      detail.push({ attr: probe[i], target, roll, used: diff, ok: roll <= target })
    })
  }
  const fpRemaining = fw - fpUsed
  const success = allFilled && fpRemaining >= 0
  const qs = success ? Math.max(1, Math.ceil(fpRemaining / 3)) : 0

  // Determine consequences for this result
  const activeConsequences = success ? (request.success_consequences || []) : (request.fail_consequences || [])
  const diceConsequences = activeConsequences.filter(c => c.needsRoll)
  const immediateConsequences = activeConsequences.filter(c => !c.needsRoll)

  const handleSubmit = () => {
    if (!allFilled) return
    const rolls = diceInputs.map(d => parseInt(d, 10))
    setResult({ success, qs, fpRemaining })
    setSubmitted(true)
    sendMessage?.({ type: 'dice_result', payload: {
      character_id: character?.id, character_name: character?.name,
      request_type: 'talent_probe', talent_name: talentName,
      rolls, success, qs, fp_remaining: fpRemaining, difficulty,
    }})
    // If there are dice consequences, DON'T close — transition to consequence rolling
    // If no dice consequences, show result briefly then close
    if (diceConsequences.length === 0) {
      setTimeout(() => setAllDone(true), 100)
    }
  }

  const handleConsequenceRoll = () => {
    const val = parseInt(consequenceInput)
    if (isNaN(val) || val < 1) return
    const c = diceConsequences[consequenceStep]
    // Apply the consequence directly (player-side)
    if (c.type === 'damage') {
      sendMessage?.({ type: 'vitals_update', payload: { character_id: character?.id, vitals: { lep_delta: -val } } })
    } else if (c.type === 'heal') {
      sendMessage?.({ type: 'vitals_update', payload: { character_id: character?.id, vitals: { [`${c.resource || 'lep'}_delta`]: val } } })
    }
    // Also inform GM of the roll
    sendMessage?.({ type: 'dice_result', payload: {
      character_id: character?.id, character_name: character?.name,
      request_type: 'consequence_roll', value: val,
      consequence_type: c.type, resource: c.resource,
    }})
    sendMessage?.({ type: 'combat_log_entry', payload: { type: c.type === 'damage' ? 'damage' : 'heal', text: `${character?.name}: ${c.type === 'damage' ? val + ' Schadenspunkte' : '+' + val + ' Lebenspunkte'}` } })
    setConsequenceRolls(prev => ({ ...prev, [consequenceStep]: val }))
    setConsequenceInput('')
    if (consequenceStep + 1 < diceConsequences.length) {
      setConsequenceStep(s => s + 1)
    } else {
      setAllDone(true)
    }
  }

  if (submitted && result) {
    const currentDiceCon = diceConsequences[consequenceStep]
    const needsMoreRolls = !allDone && diceConsequences.length > 0 && consequenceStep < diceConsequences.length

    return (
      <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
        <div className={clsx(
          'bg-dsa-bg border rounded shadow-2xl p-6 w-full max-w-md text-center space-y-4 animate-fade-in',
          result.success ? 'border-green-800/50' : 'border-red-800/50'
        )}>
          {/* Probe result header */}
          <div className={clsx('text-4xl font-bold', result.success ? 'text-green-400' : 'text-red-400')}>
            {result.success ? '✓' : '✗'}
          </div>
          <h2 className={clsx('text-xl font-display font-bold', result.success ? 'text-green-400' : 'text-red-400')}>
            {result.success ? `Geschafft! QS ${result.qs}` : 'Misslungen!'}
          </h2>
          <p className="text-sm text-dsa-parchment-dark">{talentName}</p>
          {talentTechnicalName && <p className="text-[10px] text-dsa-parchment-dark/60">{talentTechnicalName}-Probe</p>}

          {/* Consequence dice roll — if needed */}
          {needsMoreRolls && currentDiceCon && (
            <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded-sm p-4 space-y-3">
              <p className="text-xs text-dsa-parchment">
                <strong className={result.success ? 'text-green-400' : 'text-red-400'}>
                  {currentDiceCon.label}
                </strong>
                {' — '}Würfle <strong className="text-dsa-gold font-mono">{currentDiceCon.value}</strong>
              </p>
              <input
                type="number" min="1"
                value={consequenceInput}
                onChange={e => setConsequenceInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleConsequenceRoll()}
                className="w-16 h-16 bg-dsa-bg-light border-2 border-dsa-gold/30 rounded text-center text-3xl font-mono text-dsa-gold mx-auto focus:outline-none focus:border-dsa-gold focus:ring-2 focus:ring-dsa-gold/20"
                placeholder="—"
                autoFocus
              />
              <button onClick={handleConsequenceRoll} disabled={!consequenceInput || parseInt(consequenceInput) < 1}
                className="px-4 py-1.5 text-xs bg-dsa-gold/20 border border-dsa-gold/30 text-dsa-gold rounded-sm hover:bg-dsa-gold/30 transition font-bold disabled:opacity-30">
                Bestätigen
              </button>
              {diceConsequences.length > 1 && (
                <p className="text-[9px] text-dsa-parchment-dark">Wurf {consequenceStep + 1} von {diceConsequences.length}</p>
              )}
            </div>
          )}

          {/* Final result — all rolls done */}
          {allDone && (
            <>
              {/* Show all consequences */}
              {activeConsequences.length > 0 && (
                <div className={clsx('rounded-sm border p-3 text-left', result.success ? 'bg-green-900/10 border-green-800/20' : 'bg-red-900/10 border-red-800/20')}>
                  <div className="text-[10px] text-dsa-parchment-dark uppercase tracking-wider font-bold mb-1">
                    {result.success ? 'Folgen des Erfolgs' : 'Folgen des Misserfolgs'}
                  </div>
                  {activeConsequences.map((c, i) => {
                    const diceIdx = diceConsequences.indexOf(c)
                    const rolledVal = diceIdx >= 0 ? consequenceRolls[diceIdx] : null
                    return (
                      <div key={i} className="text-xs text-dsa-parchment flex items-center gap-1.5 py-0.5">
                        <span>{result.success ? '✦' : '⚠'}</span>
                        <span>{c.label}</span>
                        {rolledVal != null && <span className="font-mono font-bold text-dsa-gold">→ {rolledVal}</span>}
                        {!c.needsRoll && c.value && <span className="text-dsa-parchment-dark">({c.value})</span>}
                      </div>
                    )
                  })}
                </div>
              )}
              <button onClick={() => onComplete?.()} className="px-4 py-1.5 text-xs bg-dsa-bg-card border border-dsa-bg-medium rounded-sm text-dsa-parchment-dark hover:text-dsa-parchment transition">Schließen</button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-dsa-bg border border-dsa-gold/30 rounded shadow-2xl p-6 w-full max-w-lg space-y-5 animate-fade-in relative">
        <div className="absolute top-3 right-3 flex items-center gap-2">
          {onMinimize && <button onClick={onMinimize} className="text-dsa-parchment-dark hover:text-dsa-parchment text-xs bg-dsa-bg-medium rounded px-2 py-0.5">Minimieren</button>}
          {canAbort && <button onClick={() => onComplete?.()} className="text-dsa-parchment-dark hover:text-red-400 transition" title="Probe abbrechen"><X className="w-4 h-4" /></button>}
        </div>
        {/* Header */}
        <div className="text-center">
          <Dice5 className="w-8 h-8 text-dsa-gold mx-auto mb-2" />
          <h2 className="text-xl font-display font-bold text-dsa-gold">{talentName}</h2>
          {talentTechnicalName && <p className="text-xs text-dsa-parchment-dark">{talentTechnicalName}-Probe</p>}
          <p className="text-sm text-dsa-parchment-dark">Würfle 3W20 — einen pro Eigenschaft</p>
        </div>

        {/* FW + modifier info */}
        <div className="flex items-center justify-center gap-4">
          <div className="text-center">
            <span className="text-[10px] text-dsa-parchment-dark">Fertigkeitswert</span>
            <div className="text-lg font-mono font-bold text-dsa-gold">{fw}</div>
          </div>
          {difficulty !== 0 && (
            <div className="text-center">
              <span className="text-[10px] text-dsa-parchment-dark">Modifikator</span>
              <div className={clsx('text-lg font-mono font-bold', difficulty > 0 ? 'text-green-400' : 'text-red-400')}>
                {difficulty > 0 ? `+${difficulty}` : difficulty}
              </div>
            </div>
          )}
        </div>

        {/* 3 dice inputs with per-attribute derivation */}
        <div className="flex justify-center gap-4">
          {probe.map((attr, i) => {
            const baseVal = attrs[attr] || 0
            const targetVal = probeAttrs[i]
            const roll = diceInputs[i] ? parseInt(diceInputs[i], 10) : null
            const isOk = roll !== null && roll <= targetVal
            const deficit = roll !== null && roll > targetVal ? roll - targetVal : 0

            return (
              <div key={i} className="text-center space-y-1">
                <div className={`text-xs font-medium ${ATTR_TEXT_COLORS[attr]}`}>{ATTR_NAMES[attr]}</div>

                {/* Per-attribute derivation */}
                <div className="text-[9px] text-dsa-parchment-dark space-y-0.5 bg-dsa-bg-card/50 rounded-sm px-2 py-1 border border-dsa-bg-medium/50">
                  <div className="flex justify-between gap-2">
                    <span>Basis</span>
                    <span className="font-mono text-dsa-parchment">{baseVal}</span>
                  </div>
                  {hasEncumbrance && bePenalty !== 0 && (
                    <div className="flex justify-between gap-2">
                      <span>Behinderung</span>
                      <span className="font-mono text-red-400">{bePenalty}</span>
                    </div>
                  )}
                  {gmModifier !== 0 && (
                    <div className="flex justify-between gap-2">
                      <span>{gmModifier > 0 ? 'Erleichterung' : 'Erschwernis'}</span>
                      <span className={clsx('font-mono', gmModifier > 0 ? 'text-green-400' : 'text-red-400')}>{gmModifier > 0 ? `+${gmModifier}` : gmModifier}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-2 border-t border-dsa-bg-medium/50 pt-0.5">
                    <span className="font-bold text-dsa-parchment">Zielwert</span>
                    <span className="font-mono font-bold text-dsa-gold">{targetVal}</span>
                  </div>
                </div>

                <input
                  type="number" min="1" max="20"
                  value={diceInputs[i]}
                  onChange={(e) => { const n = [...diceInputs]; n[i] = e.target.value; setDiceInputs(n) }}
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
                    {isOk ? '✓ Geschafft' : `−${deficit} FP`}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Live result */}
        {allFilled && (
          <div className={clsx(
            'text-center py-3 rounded',
            success ? 'bg-green-900/20 border border-green-800/30' : 'bg-red-900/20 border border-red-800/30'
          )}>
            <p className={clsx('text-xl font-bold', success ? 'text-green-400' : 'text-red-400')}>
              {success ? `Geschafft! Qualitaetsstufe ${qs}` : 'Misslungen!'}
            </p>
            <p className="text-xs text-dsa-parchment-dark mt-1">
              {fpUsed > 0 ? `${fpUsed} von ${fw} Fertigkeitspunkten verbraucht` : 'Keine Fertigkeitspunkte verbraucht'}
              {success && fpRemaining > 0 ? ` — ${fpRemaining} uebrig` : ''}
              {!success ? ` — ${Math.abs(fpRemaining)} zu wenig` : ''}
            </p>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!allFilled}
          className="btn-primary w-full py-3 text-sm disabled:opacity-30 flex items-center justify-center gap-2"
        >
          <Check className="w-4 h-4" /> Ergebnis bestätigen
        </button>
      </div>
    </div>
  )
}
