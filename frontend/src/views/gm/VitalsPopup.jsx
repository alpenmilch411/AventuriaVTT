/**
 * VitalsPopup — GM popup for managing player vitals (LeP, AsP, KaP).
 * Shows per-player current values, allows +/- individually or for all.
 * Confirm applies all changes at once.
 */
import { useState, useEffect } from 'react'
import { X, Heart, Sparkles, Sun, Check, Minus, Plus, AlertTriangle } from 'lucide-react'
import clsx from 'clsx'

const VITALS = [
  { key: 'lep', label: 'Lebenspunkte', maxKey: 'LeP_max', icon: Heart, color: 'text-green-400', barColor: 'bg-green-500' },
  { key: 'asp', label: 'Astralpunkte', maxKey: 'AsP_max', icon: Sparkles, color: 'text-blue-400', barColor: 'bg-blue-500' },
  { key: 'kap', label: 'Karmapunkte', maxKey: 'KaP_max', icon: Sun, color: 'text-purple-400', barColor: 'bg-purple-500' },
]

export default function VitalsPopup({ players, sendMessage, onClose }) {
  const [charData, setCharData] = useState({}) // characterId → { lep, asp, kap, lepMax, aspMax, kapMax, ws }
  const [deltas, setDeltas] = useState({}) // characterId → { lep: 0, asp: 0, kap: 0 }
  const [globalDelta, setGlobalDelta] = useState({ lep: 0, asp: 0, kap: 0 })
  const [applied, setApplied] = useState(false)

  // Build vitals from player data (API returns current_vitals + flat fields)
  useEffect(() => {
    if (!players.length) return
    const result = {}
    const deltaInit = {}
    for (const p of players) {
      if (!p.characterId) continue
      const dv = p.character?.derived_values || {}
      const cv = p.current_vitals || {}
      result[p.characterId] = {
        lep: cv.lep ?? p.currentLeP ?? dv.LeP_max ?? 30,
        asp: cv.asp ?? p.currentAsP ?? dv.AsP_max ?? 0,
        kap: cv.kap ?? p.currentKaP ?? dv.KaP_max ?? 0,
        lepMax: dv.LeP_max ?? 30,
        aspMax: dv.AsP_max ?? 0,
        kapMax: dv.KaP_max ?? 0,
        ws: Math.ceil((p.character?.attributes?.KO || 14) / 2),
      }
      deltaInit[p.characterId] = { lep: 0, asp: 0, kap: 0 }
    }
    setCharData(result)
    setDeltas(deltaInit)
  }, [players])

  const setDelta = (charId, key, value) => {
    setDeltas(prev => ({
      ...prev,
      [charId]: { ...prev[charId], [key]: value },
    }))
  }

  const adjustDelta = (charId, key, amount) => {
    setDeltas(prev => ({
      ...prev,
      [charId]: { ...prev[charId], [key]: (prev[charId]?.[key] || 0) + amount },
    }))
  }

  const adjustAll = (key, amount) => {
    setGlobalDelta(prev => ({ ...prev, [key]: (prev[key] || 0) + amount }))
  }

  const hasChanges = Object.values(deltas).some(d => d.lep || d.asp || d.kap) || globalDelta.lep || globalDelta.asp || globalDelta.kap

  const getEffective = (charId, key) => {
    const base = charData[charId]?.[key] ?? 0
    const individual = deltas[charId]?.[key] || 0
    const global = globalDelta[key] || 0
    const max = charData[charId]?.[`${key}Max`] ?? 999
    return Math.max(0, Math.min(max, base + individual + global))
  }

  const getTotalDelta = (charId, key) => {
    return (deltas[charId]?.[key] || 0) + (globalDelta[key] || 0)
  }

  const handleApply = () => {
    for (const p of players) {
      if (!p.characterId || !charData[p.characterId]) continue
      const vitals = {}
      for (const v of VITALS) {
        const total = getTotalDelta(p.characterId, v.key)
        if (total !== 0) {
          vitals[`${v.key}_delta`] = total
        }
      }
      if (Object.keys(vitals).length > 0) {
        sendMessage?.({ type: 'vitals_update', payload: { character_id: p.characterId, vitals } })

        // Log
        const parts = []
        for (const v of VITALS) {
          const d = getTotalDelta(p.characterId, v.key)
          if (d !== 0) parts.push(`${d > 0 ? '+' : ''}${d} ${v.label}`)
        }
        sendMessage?.({ type: 'combat_log_entry', payload: {
          type: parts.some(p => p.includes('-')) ? 'damage' : 'heal',
          text: `${p.character?.name}: ${parts.join(', ')}`,
        }})

        // Check Wundschwelle
        const newLep = getEffective(p.characterId, 'lep')
        const ws = charData[p.characterId]?.ws || 15
        const oldLep = charData[p.characterId]?.lep || 0
        if (newLep <= ws && oldLep > ws) {
          sendMessage?.({ type: 'combat_log_entry', payload: { type: 'system', text: `⚠ ${p.character?.name}: Unter Wundschwelle (${ws})! Schmerz +1` } })
        }
      }
    }
    setApplied(true)
    setTimeout(onClose, 1500)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-dsa-bg border border-dsa-bg-medium rounded shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col animate-fade-in" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-dsa-bg-medium bg-dsa-bg-card flex-shrink-0">
          <h3 className="text-sm font-display font-semibold text-red-400 flex items-center gap-2">
            <Heart className="w-5 h-5" /> Lebenspunkte & Energie verwalten
          </h3>
          <button onClick={onClose} className="text-dsa-parchment-dark hover:text-dsa-parchment"><X className="w-5 h-5" /></button>
        </div>

        {applied ? (
          <div className="p-8 text-center">
            <Check className="w-10 h-10 text-green-400 mx-auto mb-2" />
            <p className="text-sm text-green-400 font-bold">Änderungen angewendet!</p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4">
              {/* Column headers */}
              <div className="grid gap-2 mb-2" style={{ gridTemplateColumns: '140px repeat(3, 1fr)' }}>
                <div />
                {VITALS.map(v => {
                  const Icon = v.icon
                  return (
                    <div key={v.key} className="text-center">
                      <div className={clsx('text-[10px] uppercase tracking-wider font-bold flex items-center justify-center gap-1', v.color)}>
                        <Icon className="w-3.5 h-3.5" /> {v.label}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Per-player rows */}
              {players.filter(p => p.characterId && charData[p.characterId]).map(p => {
                const cd = charData[p.characterId]
                return (
                  <div key={p.characterId} className="grid gap-2 mb-2 items-center" style={{ gridTemplateColumns: '140px repeat(3, 1fr)' }}>
                    {/* Player name */}
                    <div>
                      <div className="text-xs text-dsa-parchment font-bold">{p.character?.name?.split(' ')[0]}</div>
                      <div className="text-[9px] text-dsa-parchment-dark">{p.character?.species}</div>
                    </div>

                    {/* Vitals */}
                    {VITALS.map(v => {
                      const current = cd[v.key] ?? 0
                      const max = cd[`${v.key}Max`] ?? 0
                      const delta = getTotalDelta(p.characterId, v.key)
                      const effective = getEffective(p.characterId, v.key)
                      const pct = max > 0 ? (effective / max) * 100 : 0
                      const isNA = max === 0 && v.key !== 'lep'

                      if (isNA) return <div key={v.key} className="text-center text-[10px] text-dsa-parchment-dark/30">n.a.</div>

                      return (
                        <div key={v.key} className="text-center space-y-1">
                          {/* Bar */}
                          <div className="h-2 bg-dsa-bg-medium rounded-full overflow-hidden mx-2">
                            <div className={clsx('h-full rounded-full transition-all', v.barColor)} style={{ width: `${Math.min(100, pct)}%` }} />
                          </div>
                          {/* Value */}
                          <div className="text-xs font-mono">
                            <span className={clsx('font-bold', delta < 0 ? 'text-red-400' : delta > 0 ? 'text-green-400' : 'text-dsa-parchment')}>{effective}</span>
                            <span className="text-dsa-parchment-dark">/{max}</span>
                            {delta !== 0 && <span className={clsx('text-[9px] ml-1', delta < 0 ? 'text-red-400' : 'text-green-400')}>({delta > 0 ? '+' : ''}{delta})</span>}
                          </div>
                          {/* +/- buttons */}
                          <div className="flex items-center justify-center gap-0.5">
                            {[-5, -1].map(amt => (
                              <button key={amt} onClick={() => adjustDelta(p.characterId, v.key, amt)}
                                className="w-6 h-6 rounded-sm bg-red-900/20 text-red-400 text-[9px] font-bold hover:bg-red-900/30 transition">{amt}</button>
                            ))}
                            <input type="number" value={deltas[p.characterId]?.[v.key] || 0}
                              onChange={e => setDelta(p.characterId, v.key, parseInt(e.target.value) || 0)}
                              className="w-10 h-6 text-center text-[10px] font-mono bg-dsa-bg border border-dsa-bg-medium rounded-sm" />
                            {[1, 5].map(amt => (
                              <button key={amt} onClick={() => adjustDelta(p.characterId, v.key, amt)}
                                className="w-6 h-6 rounded-sm bg-green-900/20 text-green-400 text-[9px] font-bold hover:bg-green-900/30 transition">+{amt}</button>
                            ))}
                          </div>
                          {/* Wundschwelle warning */}
                          {v.key === 'lep' && effective <= cd.ws && delta < 0 && (
                            <div className="text-[8px] text-red-400 flex items-center justify-center gap-0.5">
                              <AlertTriangle className="w-2.5 h-2.5" /> Unter Wundschwelle ({cd.ws})
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}

              {/* Global row — apply to ALL */}
              {players.filter(p => p.characterId).length > 1 && (
                <>
                  <div className="border-t border-dsa-bg-medium my-3" />
                  <div className="grid gap-2 items-center" style={{ gridTemplateColumns: '140px repeat(3, 1fr)' }}>
                    <div>
                      <div className="text-xs text-dsa-gold font-bold">Alle Spieler</div>
                      <div className="text-[9px] text-dsa-parchment-dark">Wird addiert</div>
                    </div>
                    {VITALS.map(v => (
                      <div key={v.key} className="text-center space-y-1">
                        <div className="flex items-center justify-center gap-0.5">
                          {[-5, -1].map(amt => (
                            <button key={amt} onClick={() => adjustAll(v.key, amt)}
                              className="w-6 h-6 rounded-sm bg-red-900/20 text-red-400 text-[9px] font-bold hover:bg-red-900/30 transition">{amt}</button>
                          ))}
                          <input type="number" value={globalDelta[v.key] || 0}
                            onChange={e => setGlobalDelta(prev => ({ ...prev, [v.key]: parseInt(e.target.value) || 0 }))}
                            className="w-10 h-6 text-center text-[10px] font-mono bg-dsa-bg border border-dsa-bg-medium rounded-sm" />
                          {[1, 5].map(amt => (
                            <button key={amt} onClick={() => adjustAll(v.key, amt)}
                              className="w-6 h-6 rounded-sm bg-green-900/20 text-green-400 text-[9px] font-bold hover:bg-green-900/30 transition">+{amt}</button>
                          ))}
                        </div>
                        {globalDelta[v.key] !== 0 && (
                          <div className={clsx('text-[9px] font-mono font-bold', globalDelta[v.key] < 0 ? 'text-red-400' : 'text-green-400')}>
                            {globalDelta[v.key] > 0 ? '+' : ''}{globalDelta[v.key]} für alle
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-dsa-bg-medium flex justify-between items-center flex-shrink-0 bg-dsa-bg-card">
              <button onClick={() => { setDeltas(Object.fromEntries(players.filter(p => p.characterId).map(p => [p.characterId, { lep: 0, asp: 0, kap: 0 }]))); setGlobalDelta({ lep: 0, asp: 0, kap: 0 }) }}
                className="px-3 py-1.5 text-[10px] text-dsa-parchment-dark border border-dsa-bg-medium rounded-sm hover:text-dsa-parchment transition">
                Zurücksetzen
              </button>
              <div className="flex items-center gap-2">
                <button onClick={onClose} className="px-4 py-2 text-xs text-dsa-parchment-dark border border-dsa-bg-medium rounded-sm hover:text-dsa-parchment transition">
                  Abbrechen
                </button>
                <button onClick={handleApply} disabled={!hasChanges}
                  className="px-4 py-2 text-xs bg-dsa-gold/20 border border-dsa-gold/30 text-dsa-gold rounded-sm hover:bg-dsa-gold/30 transition font-bold flex items-center gap-2 disabled:opacity-30">
                  <Check className="w-4 h-4" /> Änderungen anwenden
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
