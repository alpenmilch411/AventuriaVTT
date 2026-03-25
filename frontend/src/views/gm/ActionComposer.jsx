import { useState, useEffect } from 'react'
import {
  Dice5, Send, X, Plus, Minus, Check, Heart, AlertTriangle,
  Package, MessageSquare, ChevronDown, ChevronUp, Search, Sparkles, Star
} from 'lucide-react'
import useSessionStore from '../../stores/sessionStore'
import useAuthStore from '../../stores/authStore'
import Badge from '../../components/common/Badge'
import Modal from '../../components/common/Modal'

/**
 * ActionComposer — GM tool to set up probes with predefined outcomes.
 *
 * Flow:
 * 1. GM selects target player(s)
 * 2. GM chooses: just a message, or a probe
 * 3. If probe: select talent, set difficulty
 * 4. Define outcomes:
 *    - On success: message, item gained, health change, condition, etc.
 *    - On failure: message, damage, condition, item lost, etc.
 * 5. GM sends → player gets dice prompt → result auto-applies outcome
 *
 * Props:
 * - isOpen: bool
 * - onClose: () => void
 * - sendMessage: WebSocket send
 * - presetTarget: optional player to pre-select
 */

const COMMON_TALENTS = [
  { name: 'Sinnesschaerfe', probe: ['KL', 'IN', 'IN'] },
  { name: 'Koerperbeherrschung', probe: ['MU', 'GE', 'KO'] },
  { name: 'Klettern', probe: ['MU', 'GE', 'KK'] },
  { name: 'Schleichen', probe: ['MU', 'IN', 'GE'] },
  { name: 'Selbstbeherrschung', probe: ['MU', 'MU', 'KO'] },
  { name: 'Ueberreden', probe: ['MU', 'IN', 'CH'] },
  { name: 'Einschuechtern', probe: ['MU', 'IN', 'CH'] },
  { name: 'Menschenkenntnis', probe: ['KL', 'IN', 'CH'] },
  { name: 'Willenskraft', probe: ['MU', 'IN', 'CH'] },
  { name: 'Faehrtensuchen', probe: ['MU', 'IN', 'GE'] },
  { name: 'Orientierung', probe: ['KL', 'IN', 'IN'] },
  { name: 'Wildnisleben', probe: ['MU', 'GE', 'KO'] },
  { name: 'Mechanik', probe: ['KL', 'FF', 'KK'] },
  { name: 'Heilkunde Wunden', probe: ['KL', 'FF', 'FF'] },
  { name: 'Magiekunde', probe: ['KL', 'KL', 'IN'] },
  { name: 'Kraftakt', probe: ['KO', 'KK', 'KK'] },
  { name: 'Schwimmen', probe: ['GE', 'KO', 'KK'] },
  { name: 'Zechen', probe: ['KL', 'KO', 'KK'] },
  { name: 'Pflanzenkunde', probe: ['KL', 'FF', 'KO'] },
  { name: 'Tierkunde', probe: ['MU', 'MU', 'CH'] },
]

const CONDITION_OPTIONS = [
  'Schmerz 1', 'Schmerz 2', 'Furcht 1', 'Furcht 2',
  'Betaeubung 1', 'Paralyse 1', 'Verwirrung 1', 'Belastung 1',
  'Berauscht 1', 'Liegend', 'Blind', 'Blutend',
]

function EffectSection({ title, color, effects, message, onMessageChange, onRemoveEffect, onPickEffect, messagePlaceholder }) {
  const isGreen = color === 'green'
  return (
    <div className={`${isGreen ? 'bg-green-950/10 border-green-900/20' : 'bg-red-950/10 border-red-900/20'} border rounded p-3 space-y-2`}>
      <h5 className={`text-xs font-semibold ${isGreen ? 'text-green-400' : 'text-red-400'}`}>{title}</h5>
      <textarea value={message} onChange={(e) => onMessageChange(e.target.value)}
        className="input-field text-xs h-14 resize-none" placeholder={messagePlaceholder} />
      {effects.map((eff, i) => (
        <div key={i} className={`flex items-center gap-1 text-[10px] ${isGreen ? 'bg-green-900/20' : 'bg-red-900/20'} rounded px-2 py-1`}>
          <span className={`${isGreen ? 'text-green-400' : 'text-red-400'} flex-1`}>{eff.type}: {eff.value}</span>
          <button onClick={() => onRemoveEffect(i)} className="text-dsa-parchment-dark/40 hover:text-red-400"><X className="w-3 h-3" /></button>
        </div>
      ))}
      <div className="flex flex-wrap gap-1">
        {isGreen ? (
          <>
            <button onClick={() => onPickEffect('heal')} className="text-[9px] bg-green-900/20 text-green-400 px-2 py-1 rounded hover:bg-green-900/30 flex items-center gap-0.5"><Heart className="w-2.5 h-2.5" /> Heilung</button>
            <button onClick={() => onPickEffect('item')} className="text-[9px] bg-green-900/20 text-green-400 px-2 py-1 rounded hover:bg-green-900/30 flex items-center gap-0.5"><Package className="w-2.5 h-2.5" /> Gegenstand</button>
            <button onClick={() => onPickEffect('removeCondition')} className="text-[9px] bg-green-900/20 text-green-400 px-2 py-1 rounded hover:bg-green-900/30 flex items-center gap-0.5"><Check className="w-2.5 h-2.5" /> Zustand entfernen</button>
          </>
        ) : (
          <>
            <button onClick={() => onPickEffect('damage')} className="text-[9px] bg-red-900/20 text-red-400 px-2 py-1 rounded hover:bg-red-900/30 flex items-center gap-0.5"><Heart className="w-2.5 h-2.5" /> Schaden</button>
            <button onClick={() => onPickEffect('condition')} className="text-[9px] bg-red-900/20 text-red-400 px-2 py-1 rounded hover:bg-red-900/30 flex items-center gap-0.5"><AlertTriangle className="w-2.5 h-2.5" /> Zustand</button>
            <button onClick={() => onPickEffect('loseItem')} className="text-[9px] bg-red-900/20 text-red-400 px-2 py-1 rounded hover:bg-red-900/30 flex items-center gap-0.5"><Package className="w-2.5 h-2.5" /> Verlust</button>
          </>
        )}
      </div>
    </div>
  )
}

export default function ActionComposer({ isOpen, onClose, sendMessage, presetTarget }) {
  const players = useSessionStore((s) => s.players)
  const token = useAuthStore((s) => s.token)

  // Step state
  const [step, setStep] = useState('target') // target → type → probe → outcomes → confirm
  const [selectedPlayers, setSelectedPlayers] = useState({}) // playerId → bool
  const [actionType, setActionType] = useState(null) // 'message' | 'probe'

  // Probe config
  const [talentName, setTalentName] = useState('')
  const [difficulty, setDifficulty] = useState(0)
  const [talentSearch, setTalentSearch] = useState('')

  // Outcomes
  const [successMessage, setSuccessMessage] = useState('')
  const [failureMessage, setFailureMessage] = useState('')
  const [successEffects, setSuccessEffects] = useState([]) // { type, value }
  const [failureEffects, setFailureEffects] = useState([]) // { type, value }

  // Items from library
  const [itemSearch, setItemSearch] = useState('')
  const [itemResults, setItemResults] = useState([])
  const [showEffectPicker, setShowEffectPicker] = useState(null) // { target: 'success'|'failure', type: 'heal'|'damage'|'item'|'condition'|'removeCondition'|'loseItem' }

  useEffect(() => {
    if (presetTarget) {
      setSelectedPlayers({ [presetTarget.id]: true })
    }
  }, [presetTarget])

  useEffect(() => {
    if (!isOpen) {
      setStep('target')
      setSelectedPlayers(presetTarget ? { [presetTarget.id]: true } : {})
      setActionType(null)
      setTalentName('')
      setDifficulty(0)
      setSuccessMessage('')
      setFailureMessage('')
      setSuccessEffects([])
      setFailureEffects([])
    }
  }, [isOpen])

  const selectedCount = Object.values(selectedPlayers).filter(Boolean).length
  const selectedPlayerList = players.filter(p => selectedPlayers[p.id])

  const searchItems = async (query) => {
    if (!query.trim() || !token) return
    try {
      const res = await fetch(`/api/databank/items/search?q=${encodeURIComponent(query)}&page_size=20`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setItemResults(data.items || [])
      }
    } catch (e) { console.error(e) }
  }

  const addEffect = (target, effect) => {
    if (target === 'success') setSuccessEffects(prev => [...prev, effect])
    else setFailureEffects(prev => [...prev, effect])
    setShowEffectPicker(null)
    setItemSearch('')
    setItemResults([])
  }

  const removeEffect = (target, idx) => {
    if (target === 'success') setSuccessEffects(prev => prev.filter((_, i) => i !== idx))
    else setFailureEffects(prev => prev.filter((_, i) => i !== idx))
  }

  // Get player inventory items for "lose item" picker
  const playerInventoryItems = selectedPlayerList.flatMap(p => {
    const rawInv = p.character?.basis_inventory || {}
    const inv = Array.isArray(rawInv) ? rawInv : (rawInv.items || [])
    return inv.map(i => ({ ...i, playerName: p.character?.name || p.username }))
  })

  const handleSend = () => {
    for (const player of selectedPlayerList) {
      // Get player's FW for this talent
      const charTalents = player.character?.talents || {}
      const talentKey = talentName.toLowerCase().replace(/ /g, '_')
      const fw = charTalents[talentKey] || charTalents[talentName.toLowerCase()] || 0

      sendMessage?.({
        type: 'dice_request',
        payload: {
          target_user_id: player.id,
          type: 'talent_probe',
          label: `${talentName} — Wuerfle 3W20${difficulty !== 0 ? ` (${difficulty > 0 ? '+' : ''}${difficulty})` : ''}`,
          dice: '3W20',
          talent_name: talentName,
          probe: selectedTalent?.probe || [],
          fw,
          difficulty,
          character_name: player.character?.name || player.username,
          outcomes: {
            success: { message: successMessage, effects: successEffects },
            failure: { message: failureMessage, effects: failureEffects },
          },
        },
      })
    }
    onClose()
  }

  const filteredTalents = COMMON_TALENTS.filter(t =>
    !talentSearch || t.name.toLowerCase().includes(talentSearch.toLowerCase())
  )
  const selectedTalent = COMMON_TALENTS.find(t => t.name === talentName)

  if (!isOpen) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Aktion einrichten" size="lg"
      footer={
        step === 'confirm' ? <>
          <button onClick={() => setStep(actionType === 'probe' ? 'outcomes' : 'type')} className="btn-ghost">Zurueck</button>
          <button onClick={handleSend} className="btn-primary flex items-center gap-1"><Send className="w-4 h-4" /> Absenden</button>
        </> : null
      }
    >
      <div className="space-y-4">
        {/* ── STEP: Target ── */}
        {step === 'target' && (
          <>
            <h4 className="text-sm font-semibold text-dsa-gold">An wen?</h4>
            <div className="space-y-1">
              {players.map(p => (
                <button key={p.id} onClick={() => setSelectedPlayers(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-sm text-sm transition-colors text-left ${selectedPlayers[p.id] ? 'bg-dsa-gold/10 border border-dsa-gold/30' : 'bg-dsa-bg border border-dsa-bg-medium hover:border-dsa-gold/20'}`}>
                  <span className={`w-5 h-5 rounded border flex items-center justify-center text-xs ${selectedPlayers[p.id] ? 'bg-dsa-gold border-dsa-gold text-dsa-bg' : 'border-dsa-bg-medium'}`}>{selectedPlayers[p.id] && '✓'}</span>
                  <span className="text-dsa-parchment">{p.character?.name || p.username}</span>
                  <span className="text-xs text-dsa-parchment-dark ml-auto">{p.character?.species}</span>
                </button>
              ))}
              <button onClick={() => { const all = {}; players.forEach(p => all[p.id] = true); setSelectedPlayers(all) }}
                className="text-[10px] text-dsa-parchment-dark hover:text-dsa-parchment">Alle auswaehlen</button>
            </div>
            <button onClick={() => setStep('type')} disabled={selectedCount === 0}
              className="btn-primary w-full disabled:opacity-30">Weiter ({selectedCount} Spieler)</button>
          </>
        )}

        {/* ── STEP: Type — skip straight to probe setup ── */}
        {step === 'type' && (() => {
          // No type selection needed — go directly to probe config
          setActionType('probe')
          setStep('probe')
          return null
        })()}

        {/* ── STEP: Probe config ── */}
        {step === 'probe' && (
          <>
            <h4 className="text-sm font-semibold text-dsa-gold">Probe einrichten</h4>
            {/* Talent selection */}
            <div>
              <label className="label">Talent / Eigenschaft</label>
              <div className="relative mb-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dsa-parchment-dark/50" />
                <input type="text" value={talentSearch} onChange={(e) => setTalentSearch(e.target.value)}
                  className="input-field text-sm pl-7" placeholder="Talent suchen..." />
              </div>
              <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                {filteredTalents.map(t => (
                  <button key={t.name} onClick={() => { setTalentName(t.name); setTalentSearch('') }}
                    className={`px-2 py-1 rounded text-[10px] transition-colors ${talentName === t.name ? 'bg-dsa-gold text-dsa-bg font-bold' : 'bg-dsa-bg border border-dsa-bg-medium text-dsa-parchment-dark hover:text-dsa-parchment'}`}>
                    {t.name} <span className="text-[8px] opacity-50">{t.probe.join('/')}</span>
                  </button>
                ))}
              </div>
              {talentName && (
                <div className="mt-2 bg-dsa-bg rounded-sm border border-dsa-gold/20 p-2">
                  <p className="text-xs text-dsa-gold font-semibold mb-1">Probe: {talentName}</p>
                  {/* Show each selected player's talent value */}
                  {selectedPlayerList.map(p => {
                    const char = p.character || {}
                    const talents = char.talents || {}
                    const talentKey = talentName.toLowerCase().replace(/ /g, '_').replace(/ae/g, 'ae').replace(/oe/g, 'oe').replace(/ue/g, 'ue')
                    const fw = talents[talentKey] ?? talents[talentName.toLowerCase()] ?? '?'
                    const attrs = char.attributes || {}
                    return (
                      <div key={p.id} className="flex items-center justify-between text-[10px] py-0.5">
                        <span className="text-dsa-parchment">{char.name || p.username}</span>
                        <span className="text-dsa-parchment-dark">
                          FW <span className="font-mono text-dsa-gold">{fw}</span>
                          {attrs.MU && <span className="ml-1 text-dsa-parchment-dark/50">(MU {attrs.MU} KL {attrs.KL} IN {attrs.IN} CH {attrs.CH} FF {attrs.FF} GE {attrs.GE} KO {attrs.KO} KK {attrs.KK})</span>}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Difficulty */}
            <div>
              <label className="label">Erschwernis / Erleichterung</label>
              <div className="flex items-center gap-3">
                <button onClick={() => setDifficulty(d => d - 1)} className="w-8 h-8 rounded-sm bg-dsa-bg border border-dsa-bg-medium flex items-center justify-center text-dsa-parchment hover:border-dsa-gold/30">−</button>
                <span className={`text-2xl font-mono font-bold w-12 text-center ${difficulty > 0 ? 'text-green-400' : difficulty < 0 ? 'text-red-400' : 'text-dsa-parchment'}`}>
                  {difficulty > 0 ? `+${difficulty}` : difficulty}
                </span>
                <button onClick={() => setDifficulty(d => d + 1)} className="w-8 h-8 rounded-sm bg-dsa-bg border border-dsa-bg-medium flex items-center justify-center text-dsa-parchment hover:border-dsa-gold/30">+</button>
              </div>
              <p className="text-[9px] text-dsa-parchment-dark mt-1">Positiv = einfacher, negativ = schwerer</p>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setStep('type')} className="btn-ghost flex-1">Zurueck</button>
              <button onClick={() => setStep('outcomes')} disabled={!talentName} className="btn-primary flex-1 disabled:opacity-30">Weiter: Ergebnisse</button>
            </div>
          </>
        )}

        {/* ── STEP: Outcomes ── */}
        {step === 'outcomes' && (
          <>
            <h4 className="text-sm font-semibold text-dsa-gold">
              {actionType === 'message' ? 'Was passiert?' : 'Ergebnisse festlegen'}
            </h4>

            {(
              /* Probe outcomes */
              <>
                {/* Success */}
                <EffectSection
                  title="Bei Erfolg" color="green" effects={successEffects} message={successMessage}
                  onMessageChange={setSuccessMessage} onRemoveEffect={(i) => removeEffect('success', i)}
                  onPickEffect={(type) => setShowEffectPicker({ target: 'success', type })}
                  messagePlaceholder="Was passiert bei Erfolg? z.B. Du entdeckst eine versteckte Tuer..."
                />

                {/* Failure */}
                <EffectSection
                  title="Bei Misserfolg" color="red" effects={failureEffects} message={failureMessage}
                  onMessageChange={setFailureMessage} onRemoveEffect={(i) => removeEffect('failure', i)}
                  onPickEffect={(type) => setShowEffectPicker({ target: 'failure', type })}
                  messagePlaceholder="Was passiert bei Misserfolg? z.B. Du trittst auf eine lose Fliese..."
                />

              {/* Effect picker sub-panel */}
              {showEffectPicker && (
                <div className="bg-dsa-bg-card border border-dsa-gold/20 rounded p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-semibold text-dsa-gold">
                      {showEffectPicker.type === 'heal' ? 'Heilung waehlen' :
                       showEffectPicker.type === 'damage' ? 'Schaden waehlen' :
                       showEffectPicker.type === 'item' ? 'Gegenstand waehlen' :
                       showEffectPicker.type === 'condition' ? 'Zustand waehlen' :
                       showEffectPicker.type === 'removeCondition' ? 'Zustand entfernen' :
                       'Gegenstand zum Verlieren'}
                    </h5>
                    <button onClick={() => setShowEffectPicker(null)} className="text-dsa-parchment-dark hover:text-dsa-parchment"><X className="w-3.5 h-3.5" /></button>
                  </div>

                  {/* Heal / Damage — preset amounts */}
                  {(showEffectPicker.type === 'heal' || showEffectPicker.type === 'damage') && (
                    <div className="grid grid-cols-4 gap-1">
                      {[1, 2, 3, 5, 8, 10, '1W6', '2W6', '1W6+2', '1W6+4', '2W6+2', '3W6'].map(val => (
                        <button key={val} onClick={() => addEffect(showEffectPicker.target, { type: showEffectPicker.type === 'heal' ? 'Heilung' : 'Schaden', value: String(val) })}
                          className={`px-2 py-1.5 rounded text-[10px] font-mono transition-colors ${showEffectPicker.type === 'heal' ? 'bg-green-900/20 text-green-400 hover:bg-green-900/40' : 'bg-red-900/20 text-red-400 hover:bg-red-900/40'}`}>
                          {val}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Condition — from list */}
                  {(showEffectPicker.type === 'condition' || showEffectPicker.type === 'removeCondition') && (
                    <div className="grid grid-cols-2 gap-1 max-h-40 overflow-y-auto">
                      {CONDITION_OPTIONS.map(c => (
                        <button key={c} onClick={() => addEffect(showEffectPicker.target, { type: showEffectPicker.type === 'condition' ? 'Zustand' : 'Zustand entfernt', value: c })}
                          className={`px-2 py-1.5 rounded text-[10px] text-left transition-colors ${showEffectPicker.type === 'condition' ? 'bg-red-900/20 text-red-400 hover:bg-red-900/40' : 'bg-green-900/20 text-green-400 hover:bg-green-900/40'}`}>
                          {c}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Item gain — search from databank */}
                  {showEffectPicker.type === 'item' && (
                    <div className="space-y-1">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-dsa-parchment-dark/50" />
                        <input type="text" value={itemSearch} onChange={(e) => { setItemSearch(e.target.value); searchItems(e.target.value) }}
                          className="input-field text-xs pl-7" placeholder="Gegenstand suchen..." autoFocus />
                      </div>
                      <div className="max-h-32 overflow-y-auto space-y-0.5">
                        {itemResults.map(item => (
                          <button key={item.id} onClick={() => addEffect(showEffectPicker.target, { type: 'Gegenstand', value: item.name })}
                            className="w-full text-left px-2 py-1 rounded text-[10px] bg-green-900/10 text-green-400 hover:bg-green-900/30 transition-colors">
                            {item.name} <span className="text-green-400/40">{item.category}</span>
                          </button>
                        ))}
                        {itemSearch && itemResults.length === 0 && <p className="text-[9px] text-dsa-parchment-dark">Keine Ergebnisse</p>}
                      </div>
                    </div>
                  )}

                  {/* Item lose — from player inventory */}
                  {showEffectPicker.type === 'loseItem' && (
                    <div className="max-h-40 overflow-y-auto space-y-0.5">
                      {playerInventoryItems.length > 0 ? playerInventoryItems.map((item, i) => (
                        <button key={i} onClick={() => addEffect(showEffectPicker.target, { type: 'Gegenstand verloren', value: `${item.name} (${item.playerName})` })}
                          className="w-full text-left px-2 py-1 rounded text-[10px] bg-red-900/10 text-red-400 hover:bg-red-900/30 transition-colors flex items-center justify-between">
                          <span>{item.name}</span>
                          <span className="text-red-400/40">{item.playerName}</span>
                        </button>
                      )) : <p className="text-[9px] text-dsa-parchment-dark">Kein Inventar verfuegbar</p>}
                    </div>
                  )}
                </div>
              )}
              </>
            )}

            <div className="flex gap-2">
              <button onClick={() => setStep(actionType === 'probe' ? 'probe' : 'type')} className="btn-ghost flex-1">Zurueck</button>
              <button onClick={() => setStep('confirm')} className="btn-primary flex-1">Vorschau</button>
            </div>
          </>
        )}

        {/* ── STEP: Confirm ── */}
        {step === 'confirm' && (
          <>
            <h4 className="text-sm font-semibold text-dsa-gold">Zusammenfassung</h4>
            <div className="bg-dsa-bg rounded border border-dsa-bg-medium p-3 space-y-2 text-xs">
              <div><span className="text-dsa-parchment-dark">An:</span> <span className="text-dsa-parchment">{selectedPlayerList.map(p => p.character?.name || p.username).join(', ')}</span></div>
              <div><span className="text-dsa-parchment-dark">Probe:</span> <span className="text-dsa-parchment">{talentName} ({difficulty >= 0 ? '+' : ''}{difficulty})</span></div>
              {successMessage && <div><span className="text-green-400">Erfolg:</span> <span className="text-dsa-parchment">{successMessage}</span></div>}
              {successEffects.length > 0 && <div className="text-green-400 text-[10px]">Effekte: {successEffects.map(e => `${e.type}: ${e.value}`).join(', ')}</div>}
              {failureMessage && <div><span className="text-red-400">Misserfolg:</span> <span className="text-dsa-parchment">{failureMessage}</span></div>}
              {failureEffects.length > 0 && <div className="text-red-400 text-[10px]">Effekte: {failureEffects.map(e => `${e.type}: ${e.value}`).join(', ')}</div>}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
