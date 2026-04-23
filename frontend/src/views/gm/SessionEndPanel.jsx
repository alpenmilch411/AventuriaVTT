/**
 * SessionEndPanel — GM view for session-end AP + loot distribution.
 *
 * Dispatches a single WS `session_end` message carrying both awards and
 * loot payloads. Backend _handle_session_end schedules
 * _persist_ap_awards + _persist_loot_awards; broadcasts inventory_change
 * so connected clients see loot live.
 *
 * No REST calls.
 */
import { useState, useEffect } from 'react'
import { X, Plus, Trash2, Award, AlertTriangle } from 'lucide-react'
import useSessionStore from '../../stores/sessionStore'

export default function SessionEndPanel({ sessionId, sendMessage, onClose }) {
  const players = useSessionStore((s) => s.players) || []

  // AP rewards: character_id -> { base, quest, bonus }
  const [apRewards, setApRewards] = useState({})
  // Loot rows: character_id -> Array<{ name, quantity }>
  // Starts EMPTY per character. + button adds a blank row.
  const [lootRows, setLootRows] = useState({})
  const [dispatched, setDispatched] = useState(false)

  // Top up AP defaults + empty loot for newly-arrived players without wiping
  // GM-entered values for already-initialized characters.
  useEffect(() => {
    if (players.length === 0) return
    setApRewards(prev => {
      const next = { ...prev }
      for (const p of players) {
        if (p.characterId && !(p.characterId in next)) {
          next[p.characterId] = { base: 10, quest: 0, bonus: 0 }
        }
      }
      return next
    })
    setLootRows(prev => {
      const next = { ...prev }
      for (const p of players) {
        if (p.characterId && !(p.characterId in next)) {
          next[p.characterId] = []
        }
      }
      return next
    })
  }, [players])

  const addLootRow = (charId) => {
    setLootRows(prev => ({
      ...prev,
      [charId]: [...(prev[charId] || []), { name: '', quantity: 1 }],
    }))
  }

  const updateLootRow = (charId, idx, field, value) => {
    setLootRows(prev => ({
      ...prev,
      [charId]: prev[charId].map((r, i) => i === idx ? { ...r, [field]: value } : r),
    }))
  }

  const removeLootRow = (charId, idx) => {
    setLootRows(prev => ({
      ...prev,
      [charId]: prev[charId].filter((_, i) => i !== idx),
    }))
  }

  const setAP = (charId, field, val) => {
    setApRewards(prev => ({
      ...prev,
      [charId]: { ...prev[charId], [field]: parseInt(val) || 0 },
    }))
  }

  const totalAP = (charId) => {
    const ap = apRewards[charId]
    return ap ? (ap.base || 0) + (ap.quest || 0) + (ap.bonus || 0) : 0
  }

  const handleEndSession = () => {
    // Build awards array (amount > 0 only)
    const awards = Object.entries(apRewards)
      .map(([charId, ap]) => ({
        character_id: charId,
        amount: (ap.base || 0) + (ap.quest || 0) + (ap.bonus || 0),
        reason: `Session: ${ap.base} Basis + ${ap.quest} Quests + ${ap.bonus} Bonus`,
      }))
      .filter(a => a.amount > 0)

    // Build loot per character: filter empty names + zero qty, merge duplicates
    const loot = Object.entries(lootRows)
      .map(([charId, rows]) => {
        const cleaned = []
        for (const r of rows) {
          const name = (r.name || '').trim()
          const qty = parseInt(r.quantity) || 0
          if (!name || qty <= 0) continue
          // Merge duplicates (same name)
          const existing = cleaned.find(c => c.name === name)
          if (existing) {
            existing.quantity += qty
          } else {
            cleaned.push({ name, quantity: qty })
          }
        }
        return cleaned.length > 0 ? { character_id: charId, items: cleaned } : null
      })
      .filter(Boolean)

    sendMessage?.({
      type: 'session_end',
      payload: {
        summary: 'Session beendet! Abenteuerpunkte wurden verteilt.',
        awards,
        loot,
      },
    })

    setDispatched(true)
  }

  if (dispatched) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8">
        <Award className="w-12 h-12 text-dsa-gold mb-4" />
        <h2 className="text-lg font-display font-bold text-dsa-gold mb-2">Session beendet</h2>
        <p className="text-sm text-dsa-parchment-dark mb-6 text-center">
          Abenteuerpunkte und Beute wurden verteilt.
        </p>
        <button onClick={onClose}
          className="px-4 py-2 text-xs bg-dsa-gold/20 border border-dsa-gold/40 text-dsa-gold rounded-sm hover:bg-dsa-gold/30 transition">
          Schliessen
        </button>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dsa-bg-medium bg-dsa-bg-card flex-shrink-0">
        <h2 className="text-sm font-display font-bold text-dsa-gold uppercase tracking-wider">
          Session beenden
        </h2>
        <button onClick={onClose} className="text-dsa-parchment-dark hover:text-dsa-parchment">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* AP rewards table */}
        <div>
          <h3 className="text-xs font-bold text-dsa-gold mb-2">Abenteuerpunkte</h3>
          <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded-sm">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 border-b border-dsa-bg-medium text-[10px] text-dsa-parchment-dark uppercase">
              <div className="col-span-3">Charakter</div>
              <div className="col-span-2 text-center">Basis</div>
              <div className="col-span-2 text-center">Quests</div>
              <div className="col-span-2 text-center">Bonus</div>
              <div className="col-span-3 text-center">Summe</div>
            </div>
            {players.filter(p => p.characterId).map(p => {
              const ap = apRewards[p.characterId] || { base: 10, quest: 0, bonus: 0 }
              return (
                <div key={p.characterId} className="grid grid-cols-12 gap-2 px-3 py-2 items-center border-b border-dsa-bg-medium/30">
                  <div className="col-span-3">
                    <div className="text-xs text-dsa-parchment font-medium">{p.character?.name || p.username}</div>
                  </div>
                  <div className="col-span-2 text-center">
                    <input type="number" min="0" value={ap.base} onChange={e => setAP(p.characterId, 'base', e.target.value)}
                      className="w-14 text-center text-sm font-mono bg-dsa-bg border border-dsa-bg-medium rounded-sm px-1 py-0.5 text-dsa-parchment" />
                  </div>
                  <div className="col-span-2 text-center">
                    <input type="number" min="0" value={ap.quest} onChange={e => setAP(p.characterId, 'quest', e.target.value)}
                      className="w-14 text-center text-sm font-mono bg-dsa-bg border border-dsa-bg-medium rounded-sm px-1 py-0.5 text-dsa-parchment" />
                  </div>
                  <div className="col-span-2 text-center">
                    <input type="number" min="0" value={ap.bonus} onChange={e => setAP(p.characterId, 'bonus', e.target.value)}
                      className="w-14 text-center text-sm font-mono bg-dsa-bg border border-dsa-bg-medium rounded-sm px-1 py-0.5 text-dsa-parchment" />
                  </div>
                  <div className="col-span-3 text-center">
                    <span className="text-lg font-mono font-bold text-dsa-gold">{totalAP(p.characterId)}</span>
                    <span className="text-[9px] text-dsa-parchment-dark ml-1">AP</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Loot distribution */}
        <div>
          <h3 className="text-xs font-bold text-dsa-gold mb-2">Beute</h3>
          <div className="space-y-3">
            {players.filter(p => p.characterId).map(p => {
              const rows = lootRows[p.characterId] || []
              return (
                <div key={p.characterId} className="bg-dsa-bg-card border border-dsa-bg-medium rounded-sm p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs text-dsa-parchment font-medium">{p.character?.name || p.username}</div>
                    <button onClick={() => addLootRow(p.characterId)}
                      className="text-[10px] px-2 py-0.5 bg-dsa-gold/15 border border-dsa-gold/30 text-dsa-gold rounded-sm hover:bg-dsa-gold/25 transition flex items-center gap-1">
                      <Plus className="w-3 h-3" /> Gegenstand
                    </button>
                  </div>
                  {rows.length === 0 ? (
                    <div className="text-[10px] text-dsa-parchment-dark/70 italic">Keine Beute.</div>
                  ) : (
                    <div className="space-y-1">
                      {rows.map((r, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input type="text" value={r.name} placeholder="Name..."
                            onChange={e => updateLootRow(p.characterId, idx, 'name', e.target.value)}
                            className="flex-1 text-xs bg-dsa-bg border border-dsa-bg-medium rounded-sm px-2 py-1 text-dsa-parchment" />
                          <input type="number" min="1" value={r.quantity}
                            onChange={e => updateLootRow(p.characterId, idx, 'quantity', parseInt(e.target.value) || 1)}
                            className="w-14 text-center text-xs font-mono bg-dsa-bg border border-dsa-bg-medium rounded-sm px-1 py-1 text-dsa-parchment" />
                          <button onClick={() => removeLootRow(p.characterId, idx)}
                            className="text-red-400 hover:text-red-300">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Warning */}
        <div className="bg-amber-900/15 border border-amber-800/25 rounded-sm p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-[10px] text-dsa-parchment-dark">
            <strong className="text-amber-400">Achtung:</strong> Nach dem Beenden werden die Abenteuerpunkte
            und Beute permanent auf die Charaktere gebucht. Die Session wird archiviert.
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-dsa-bg-medium flex justify-between items-center flex-shrink-0">
        <button onClick={onClose} className="px-4 py-2 text-xs text-dsa-parchment-dark border border-dsa-bg-medium rounded-sm hover:text-dsa-parchment transition">
          Abbrechen
        </button>
        <button onClick={handleEndSession}
          className="px-4 py-2 text-xs bg-red-900/30 border border-red-800/40 text-red-400 rounded-sm hover:bg-red-900/50 transition font-bold flex items-center gap-2">
          <Award className="w-4 h-4" /> Session beenden & Belohnungen verteilen
        </button>
      </div>
    </div>
  )
}
