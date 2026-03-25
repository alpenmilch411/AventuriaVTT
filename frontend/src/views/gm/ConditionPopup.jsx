/**
 * ConditionPopup — GM modal for managing player conditions.
 * Collect changes, show preview, apply on confirm.
 */
import { useState, useEffect } from 'react'
import { X, Plus, Minus, AlertTriangle, Info, Check, Undo } from 'lucide-react'
import { CONDITIONS } from '../../engine/conditionsEngine'
import { getConditions } from '../../utils/safeData'
import clsx from 'clsx'

const CONDITION_LIST = Object.entries(CONDITIONS).filter(([name]) => !['Betaeubung', 'Betaeubt'].includes(name))

export default function ConditionPopup({ players, sendMessage, onClose }) {
  const [originalConditions, setOriginalConditions] = useState({}) // characterId → [{name, level}]
  const [pendingConditions, setPendingConditions] = useState({})   // characterId → [{name, level}] (working copy)
  const [detailName, setDetailName] = useState(null)
  const [applied, setApplied] = useState(false)

  // Read conditions from player data (live-synced via WS → sessionStore)
  useEffect(() => {
    if (!players.length) return
    const result = {}
    for (const p of players) {
      if (!p.characterId) continue
      result[p.characterId] = getConditions(p).map(c => ({ ...c }))
    }
    setOriginalConditions(JSON.parse(JSON.stringify(result)))
    setPendingConditions(JSON.parse(JSON.stringify(result)))
  }, [players])

  // Local change functions — only modify pendingConditions
  const addCondition = (characterId, condName) => {
    setPendingConditions(prev => {
      const conds = [...(prev[characterId] || [])].map(c => ({ ...c }))
      const existing = conds.find(c => c.name === condName)
      const def = CONDITIONS[condName]
      if (existing) {
        if ((existing.level || 1) < (def?.levels || 4)) existing.level = (existing.level || 1) + 1
      } else {
        conds.push({ name: condName, level: 1 })
      }
      return { ...prev, [characterId]: conds }
    })
  }

  const removeCondition = (characterId, condName) => {
    setPendingConditions(prev => {
      const conds = (prev[characterId] || []).map(c =>
        c.name === condName ? { ...c, level: (c.level || 1) - 1 } : { ...c }
      ).filter(c => (c.level || 0) > 0)
      return { ...prev, [characterId]: conds }
    })
  }

  const addToAll = (condName) => {
    for (const p of players) {
      if (p.characterId) addCondition(p.characterId, condName)
    }
  }

  const resetAll = () => {
    setPendingConditions(JSON.parse(JSON.stringify(originalConditions)))
  }

  // Compute diffs
  const getDiff = (characterId) => {
    const orig = originalConditions[characterId] || []
    const pending = pendingConditions[characterId] || []
    const changes = []
    // Added or increased
    for (const pc of pending) {
      const oc = orig.find(o => o.name === pc.name)
      if (!oc) changes.push({ name: pc.name, type: 'add', level: pc.level })
      else if (pc.level > oc.level) changes.push({ name: pc.name, type: 'increase', from: oc.level, to: pc.level })
    }
    // Removed or decreased
    for (const oc of orig) {
      const pc = pending.find(p => p.name === oc.name)
      if (!pc) changes.push({ name: oc.name, type: 'remove', level: oc.level })
      else if (pc.level < oc.level) changes.push({ name: oc.name, type: 'decrease', from: oc.level, to: pc.level })
    }
    return changes
  }

  const hasChanges = players.some(p => p.characterId && getDiff(p.characterId).length > 0)

  // Apply all changes
  const handleApply = () => {
    for (const p of players) {
      if (!p.characterId) continue
      const diff = getDiff(p.characterId)
      for (const change of diff) {
        if (change.type === 'add') {
          sendMessage?.({ type: 'conditions_update', payload: { character_id: p.characterId, add_condition: change.name, level: change.level } })
        } else if (change.type === 'increase') {
          const delta = change.to - change.from
          for (let i = 0; i < delta; i++) {
            sendMessage?.({ type: 'conditions_update', payload: { character_id: p.characterId, add_condition: change.name, level: 1 } })
          }
        } else if (change.type === 'remove') {
          sendMessage?.({ type: 'conditions_update', payload: { character_id: p.characterId, remove_condition: change.name, reduce_level: change.level } })
        } else if (change.type === 'decrease') {
          const delta = change.from - change.to
          sendMessage?.({ type: 'conditions_update', payload: { character_id: p.characterId, remove_condition: change.name, reduce_level: delta } })
        }
      }
      // Log
      if (diff.length > 0) {
        const charName = p.character?.name || p.username
        const summary = diff.map(d => {
          if (d.type === 'add') return `+${d.name} ${d.level > 1 ? ['','I','II','III','IV'][d.level] : ''}`
          if (d.type === 'increase') return `${d.name} ${['','I','II','III','IV'][d.from]}→${['','I','II','III','IV'][d.to]}`
          if (d.type === 'remove') return `-${d.name}`
          if (d.type === 'decrease') return `${d.name} ${['','I','II','III','IV'][d.from]}→${['','I','II','III','IV'][d.to]}`
          return ''
        }).join(', ')
        sendMessage?.({ type: 'combat_log_entry', payload: { type: 'system', text: `${charName}: ${summary}` } })
      }
    }
    setApplied(true)
    setTimeout(onClose, 1500)
  }

  const detailDef = detailName ? CONDITIONS[detailName] : null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-dsa-bg border border-dsa-bg-medium rounded shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col animate-fade-in" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-dsa-bg-medium bg-dsa-bg-card flex-shrink-0">
          <h3 className="text-sm font-display font-semibold text-amber-400 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" /> Zustände verwalten
          </h3>
          <button onClick={onClose} className="text-dsa-parchment-dark hover:text-dsa-parchment"><X className="w-5 h-5" /></button>
        </div>

        {/* Applied success */}
        {applied && (
          <div className="p-8 text-center">
            <Check className="w-10 h-10 text-green-400 mx-auto mb-2" />
            <p className="text-sm text-green-400 font-bold">Änderungen angewendet!</p>
          </div>
        )}

        {!applied && (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Per player sections */}
              {players.filter(p => p.characterId).map(p => {
                const conds = pendingConditions[p.characterId] || []
                const diff = getDiff(p.characterId)
                return (
                  <div key={p.characterId} className={clsx('border rounded-sm p-3', diff.length > 0 ? 'bg-amber-900/5 border-amber-800/30' : 'bg-dsa-bg-card/50 border-dsa-bg-medium')}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-full bg-dsa-bg border border-dsa-bg-medium flex items-center justify-center text-dsa-parchment-dark text-xs font-bold">
                        {(p.character?.name || p.username || '?')[0]}
                      </div>
                      <div className="flex-1">
                        <div className="text-xs text-dsa-parchment font-bold">{p.character?.name || p.username}</div>
                        <div className="text-[9px] text-dsa-parchment-dark">{p.character?.species} {p.character?.profession}</div>
                      </div>
                      {diff.length > 0 && <span className="text-[9px] text-amber-400 bg-amber-900/20 border border-amber-800/30 rounded-sm px-1.5 py-0.5">{diff.length} Änderung{diff.length > 1 ? 'en' : ''}</span>}
                    </div>

                    {/* Active + pending conditions */}
                    {conds.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {conds.map((cond, ci) => {
                          const def = CONDITIONS[cond.name]
                          const maxLevel = def?.levels || 1
                          const roman = ['', 'I', 'II', 'III', 'IV'][Math.min(cond.level || 1, 4)]
                          const origCond = (originalConditions[p.characterId] || []).find(c => c.name === cond.name)
                          const isNew = !origCond
                          const isChanged = origCond && origCond.level !== cond.level
                          return (
                            <div key={ci} className={clsx('flex items-center gap-1 border rounded-sm px-2 py-1',
                              isNew ? 'bg-green-900/25 border-green-800/30' : isChanged ? 'bg-amber-900/25 border-amber-800/30' : 'bg-dsa-bg-card border-dsa-bg-medium'
                            )}>
                              <span className="text-sm">{def?.icon || '⚠️'}</span>
                              <button onClick={() => setDetailName(cond.name)} className="text-[11px] text-dsa-parchment hover:text-dsa-gold transition font-medium">
                                {cond.name}{maxLevel > 1 ? ` ${roman}` : ''}
                              </button>
                              <button onClick={() => removeCondition(p.characterId, cond.name)}
                                className="w-5 h-5 rounded bg-red-900/40 text-red-400 flex items-center justify-center hover:bg-red-900/60 transition">
                                <Minus className="w-3 h-3" />
                              </button>
                              {maxLevel > 1 && (cond.level || 1) < maxLevel && (
                                <button onClick={() => addCondition(p.characterId, cond.name)}
                                  className="w-5 h-5 rounded bg-green-900/40 text-green-400 flex items-center justify-center hover:bg-green-900/60 transition">
                                  <Plus className="w-3 h-3" />
                                </button>
                              )}
                              {isNew && <span className="text-[8px] text-green-400">NEU</span>}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="text-[10px] text-dsa-parchment-dark/40 italic mb-2">Keine aktiven Zustände</p>
                    )}

                    {/* Change preview */}
                    {diff.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {diff.map((d, i) => (
                          <span key={i} className={clsx('text-[9px] px-1.5 py-0.5 rounded-sm border',
                            d.type === 'add' ? 'bg-green-900/20 border-green-800/30 text-green-400' :
                            d.type === 'remove' ? 'bg-red-900/20 border-red-800/30 text-red-400' :
                            'bg-amber-900/20 border-amber-800/30 text-amber-400'
                          )}>
                            {d.type === 'add' ? `+ ${d.name}${d.level > 1 ? ` ${['','I','II','III','IV'][d.level]}` : ''}` :
                             d.type === 'remove' ? `- ${d.name}` :
                             `${d.name} ${['','I','II','III','IV'][d.from]} → ${['','I','II','III','IV'][d.to]}`}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Add condition grid */}
              <div>
                <div className="text-[10px] text-dsa-parchment-dark uppercase tracking-wider font-bold mb-1.5">
                  Zustand hinzufügen {players.length > 1 ? '(für alle ausgewählten Spieler)' : ''}
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1">
                  {CONDITION_LIST.map(([name, def]) => (
                    <div key={name} className="flex items-center gap-1 text-[10px] py-1 px-1.5 rounded-sm border bg-dsa-bg-card border-dsa-bg-medium text-left">
                      <button
                        onClick={() => players.length > 1 ? addToAll(name) : addCondition(players[0]?.characterId, name)}
                        className="flex items-center gap-1 flex-1 min-w-0 text-dsa-parchment-dark hover:text-amber-400 transition"
                        title={`${name} hinzufügen`}
                      >
                        <span>{def.icon || '⚠️'}</span>
                        <span className="truncate">{name}</span>
                      </button>
                      <button onClick={() => setDetailName(name)}
                        className="text-dsa-parchment-dark/30 hover:text-dsa-gold transition flex-shrink-0 p-0.5" title="Details anzeigen">
                        <Info className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Detail panel */}
              {detailDef && (
                <div className="bg-dsa-bg-card border border-amber-800/30 rounded-sm p-4 space-y-3 sticky bottom-0">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-amber-400 flex items-center gap-2">
                      <span className="text-lg">{detailDef.icon || '⚠️'}</span> {detailName}
                      {detailDef.category && <span className="text-[9px] px-1.5 py-0.5 bg-dsa-bg border border-dsa-bg-medium rounded-sm text-dsa-parchment-dark font-normal">{detailDef.category}</span>}
                    </h4>
                    <button onClick={() => setDetailName(null)} className="text-dsa-parchment-dark hover:text-dsa-parchment"><X className="w-4 h-4" /></button>
                  </div>
                  <p className="text-xs text-dsa-parchment">{detailDef.summary}</p>
                  <div className="space-y-1">
                    <div className="text-[10px] text-dsa-gold uppercase tracking-wider font-bold">Stufeneffekte</div>
                    {detailDef.desc.map((d, i) => (
                      <div key={i} className="text-[11px] text-dsa-parchment/80 bg-dsa-bg/50 border border-dsa-bg-medium rounded-sm px-2 py-1">{d}</div>
                    ))}
                  </div>
                  {(detailDef.perLevel || detailDef.flat) && (
                    <div>
                      <div className="text-[10px] text-dsa-gold uppercase tracking-wider font-bold mb-1">Werteveränderungen</div>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(detailDef.perLevel || detailDef.flat || {}).map(([stat, mod]) => (
                          <span key={stat} className={clsx('text-[10px] font-mono px-1.5 py-0.5 rounded-sm border',
                            mod > 0 ? 'bg-green-900/20 border-green-800/30 text-green-400' : 'bg-red-900/20 border-red-800/30 text-red-400'
                          )}>
                            {stat} {mod > 0 ? '+' : ''}{mod}{detailDef.perLevel ? ' pro Stufe' : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    {detailDef.source && (
                      <div>
                        <div className="text-[10px] text-dsa-parchment-dark uppercase font-bold">Ursachen</div>
                        <p className="text-[10px] text-dsa-parchment-dark/70">{detailDef.source}</p>
                      </div>
                    )}
                    {detailDef.removal && (
                      <div>
                        <div className="text-[10px] text-green-400 uppercase font-bold">Aufhebung</div>
                        <p className="text-[10px] text-dsa-parchment-dark/70">{detailDef.removal}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer with confirm/cancel */}
            <div className="px-5 py-3 border-t border-dsa-bg-medium flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                {hasChanges && (
                  <button onClick={resetAll} className="flex items-center gap-1 px-3 py-1.5 text-[10px] text-dsa-parchment-dark border border-dsa-bg-medium rounded-sm hover:text-dsa-parchment transition">
                    <Undo className="w-3 h-3" /> Zurücksetzen
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={onClose} className="px-4 py-2 text-xs text-dsa-parchment-dark border border-dsa-bg-medium rounded-sm hover:text-dsa-parchment transition">
                  Abbrechen
                </button>
                <button onClick={handleApply} disabled={!hasChanges}
                  className="px-4 py-2 text-xs bg-dsa-gold/20 border border-dsa-gold/30 text-dsa-gold rounded-sm hover:bg-dsa-gold/30 transition font-bold flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed">
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
