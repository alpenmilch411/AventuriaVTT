/**
 * ConsequenceBuilder — Reusable component for building probe/event consequences.
 * Used by ProbePopup, session end rewards, and ad-hoc GM actions.
 *
 * Each consequence: { id, type, label, target, value, details }
 * Types: damage, heal, condition_add, condition_remove, item_give, item_take,
 *        money, info, quest, ap, sf_learn, talent_up, spell_learn, combat_tech_up
 */
import { useState } from 'react'
import {
  Heart, AlertTriangle, Package, Coins, MessageSquare, Target,
  Star, Award, Swords, BookOpen, Sparkles, Sun, Plus, X, ChevronDown, Search
} from 'lucide-react'
import { CONDITIONS } from '../../engine/conditionsEngine'
import DataBrowser from './DataBrowser'
import clsx from 'clsx'

const CONSEQUENCE_TYPES = [
  { id: 'damage', label: 'Schaden', icon: Heart, color: 'text-red-400', desc: 'Lebenspunkte abziehen' },
  { id: 'heal', label: 'Heilung', icon: Heart, color: 'text-green-400', desc: 'Lebenspunkte oder Astral-/Karmapunkte wiederherstellen' },
  { id: 'condition_add', label: 'Zustand hinzufügen', icon: AlertTriangle, color: 'text-amber-400', desc: 'Einen Zustand auferlegen (Furcht, Schmerz, etc.)' },
  { id: 'condition_remove', label: 'Zustand entfernen', icon: AlertTriangle, color: 'text-green-400', desc: 'Einen aktiven Zustand senken oder entfernen' },
  { id: 'item_give', label: 'Gegenstand geben', icon: Package, color: 'text-emerald-400', desc: 'Einen Gegenstand ins Inventar legen' },
  { id: 'item_take', label: 'Gegenstand nehmen', icon: Package, color: 'text-red-400', desc: 'Einen Gegenstand aus dem Inventar entfernen' },
  { id: 'money', label: 'Geld geben/nehmen', icon: Coins, color: 'text-dsa-gold', desc: 'Dukaten, Silbertaler oder Heller verteilen oder abziehen' },
  { id: 'info', label: 'Information (Flüstern)', icon: MessageSquare, color: 'text-blue-400', desc: 'Eine private Nachricht an den Spieler senden' },
  { id: 'quest', label: 'Quest-Ziel', icon: Target, color: 'text-purple-400', desc: 'Ein Quest-Ziel als abgeschlossen markieren' },
  { id: 'ap', label: 'Abenteuerpunkte', icon: Star, color: 'text-dsa-gold', desc: 'Bonus-Abenteuerpunkte vergeben' },
  { id: 'sf_learn', label: 'Sonderfertigkeit lernen', icon: Award, color: 'text-orange-400', desc: 'Eine neue Sonderfertigkeit freischalten' },
  { id: 'talent_up', label: 'Talent steigern', icon: BookOpen, color: 'text-blue-400', desc: 'Fertigkeitswert eines Talents um 1 erhöhen' },
  { id: 'spell_learn', label: 'Zauber/Liturgie lernen', icon: Sparkles, color: 'text-purple-400', desc: 'Einen neuen Zauber oder eine Liturgie freischalten' },
  { id: 'combat_tech_up', label: 'Kampftechnik steigern', icon: Swords, color: 'text-red-400', desc: 'Kampftechnikwert um 1 erhöhen' },
]

const TARGET_OPTIONS = [
  { id: 'all', label: 'Alle Spieler' },
  { id: 'succeeded', label: 'Nur wer bestanden hat' },
  { id: 'failed', label: 'Nur wer gescheitert ist' },
  { id: 'best_qs', label: 'Bester Qualitätsstufe' },
  { id: 'worst_qs', label: 'Schlechtester Qualitätsstufe' },
  { id: 'specific', label: 'Bestimmter Spieler' },
]

const CONDITION_NAMES = Object.keys(CONDITIONS).filter(n => !['Betaeubung', 'Betaeubt'].includes(n))

// Browse field — shows selected value + button to open DataBrowser
function BrowseField({ value, dbType, label, onChange, extra }) {
  const [showBrowser, setShowBrowser] = useState(false)
  return (
    <div className="flex items-center gap-2">
      {value ? (
        <div className="flex items-center gap-1.5 flex-1 bg-dsa-bg border border-dsa-bg-medium rounded-sm px-2 py-1">
          <span className="text-[10px] text-dsa-parchment flex-1">{value}</span>
          <button onClick={() => onChange('')} className="text-dsa-parchment-dark hover:text-red-400"><X className="w-3 h-3" /></button>
        </div>
      ) : (
        <button onClick={() => setShowBrowser(true)}
          className="flex items-center gap-1.5 flex-1 text-[10px] py-1.5 px-2 border border-dashed border-dsa-bg-medium text-dsa-parchment-dark hover:text-dsa-gold hover:border-dsa-gold/30 rounded-sm transition">
          <Search className="w-3 h-3" /> {label} durchsuchen...
        </button>
      )}
      {extra}
      {showBrowser && (
        <DataBrowser type={dbType} title={`${label} auswählen`}
          onSelect={item => { onChange(item.name || item.id); setShowBrowser(false) }}
          onClose={() => setShowBrowser(false)} />
      )}
    </div>
  )
}

// Inventory picker — browses actual player inventory
function InventoryPicker({ value, players, onChange }) {
  const [showList, setShowList] = useState(false)
  const token = typeof window !== 'undefined' ? localStorage.getItem('avtt_token') : null
  const [inventories, setInventories] = useState({}) // characterId → items[]

  const fetchInventories = async () => {
    if (!token || !players?.length) return
    const result = {}
    for (const p of players) {
      if (!p.characterId) continue
      try {
        const res = await fetch(`/api/characters/${p.characterId}`, { headers: { Authorization: `Bearer ${token}` } })
        if (res.ok) {
          const char = await res.json()
          const inv = char.basis_inventory || {}
          result[p.characterId] = (Array.isArray(inv) ? inv : inv.items || []).filter(i => (i.quantity || 1) > 0)
        }
      } catch {}
    }
    setInventories(result)
  }

  // Merge inventories — show all unique items across selected players
  const allItems = []
  const seen = new Set()
  for (const [charId, items] of Object.entries(inventories)) {
    const playerName = players.find(p => p.characterId === charId)?.character?.name?.split(' ')[0] || '?'
    for (const item of items) {
      const key = item.name
      if (!seen.has(key)) {
        seen.add(key)
        allItems.push({ ...item, owners: [{ playerName, quantity: item.quantity || 1 }] })
      } else {
        allItems.find(i => i.name === key)?.owners?.push({ playerName, quantity: item.quantity || 1 })
      }
    }
  }

  return (
    <div className="flex items-center gap-2">
      {value ? (
        <div className="flex items-center gap-1.5 flex-1 bg-dsa-bg border border-dsa-bg-medium rounded-sm px-2 py-1">
          <span className="text-[10px] text-dsa-parchment flex-1">{value}</span>
          <button onClick={() => onChange('', 1)} className="text-dsa-parchment-dark hover:text-red-400"><X className="w-3 h-3" /></button>
        </div>
      ) : (
        <button onClick={() => { setShowList(true); fetchInventories() }}
          className="flex items-center gap-1.5 flex-1 text-[10px] py-1.5 px-2 border border-dashed border-dsa-bg-medium text-dsa-parchment-dark hover:text-red-400 hover:border-red-800/30 rounded-sm transition">
          <Search className="w-3 h-3" /> Aus Spieler-Inventar wählen...
        </button>
      )}
      {showList && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4" onClick={() => setShowList(false)}>
          <div className="relative z-10 bg-dsa-bg border border-dsa-bg-medium rounded shadow-2xl w-full max-w-md max-h-[60vh] flex flex-col animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-dsa-bg-medium bg-dsa-bg-card flex-shrink-0">
              <h4 className="text-xs font-display font-semibold text-red-400">Gegenstand aus Inventar nehmen</h4>
              <button onClick={() => setShowList(false)} className="text-dsa-parchment-dark hover:text-dsa-parchment"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-dsa-bg-medium/30">
              {allItems.length === 0 ? (
                <p className="p-4 text-xs text-dsa-parchment-dark">Lade Inventar...</p>
              ) : (
                allItems.map((item, i) => (
                  <button key={i} onClick={() => { onChange(item.name, 1); setShowList(false) }}
                    className="w-full text-left px-3 py-2 hover:bg-dsa-bg-light/20 transition">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-dsa-parchment">{item.name}</span>
                      <span className="text-[10px] font-mono text-dsa-parchment-dark">
                        {item.owners.map(o => `${o.playerName}: ${o.quantity}x`).join(', ')}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Individual consequence editor
function ConsequenceCard({ consequence, onChange, onRemove, players }) {
  const typeDef = CONSEQUENCE_TYPES.find(t => t.id === consequence.type)
  const Icon = typeDef?.icon || Package

  return (
    <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded-sm p-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <Icon className={clsx('w-4 h-4', typeDef?.color)} />
        <span className={clsx('text-xs font-bold flex-1', typeDef?.color)}>{typeDef?.label || consequence.type}</span>
        <button onClick={onRemove} className="text-dsa-parchment-dark hover:text-red-400 transition"><X className="w-3.5 h-3.5" /></button>
      </div>

      {/* Label */}
      <input value={consequence.label || ''} onChange={e => onChange({ ...consequence, label: e.target.value })}
        className="input-field text-[10px] w-full" placeholder="Beschreibung (z.B. 'Sturz vom Felsen')" />

      {/* Type-specific value input */}

      {/* ── Damage: quick buttons + free input ── */}
      {consequence.type === 'damage' && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1">
            {['1', '2', '3', '5', '10', '1W6', '2W6', '1W6+2', '2W6+4'].map(v => (
              <button key={v} onClick={() => onChange({ ...consequence, value: v })}
                className={clsx('text-[9px] px-2 py-1 rounded-sm border transition font-mono',
                  consequence.value === v ? 'bg-red-900/30 text-red-400 border-red-800/30' : 'bg-dsa-bg border-dsa-bg-medium text-dsa-parchment-dark hover:text-red-400')}>
                {v}
              </button>
            ))}
          </div>
          <input type="text" value={consequence.value || ''} onChange={e => onChange({ ...consequence, value: e.target.value })}
            className="input-field text-[10px] w-full" placeholder="Eigener Wert (z.B. 3W6+5)" />
        </div>
      )}

      {/* ── Heal: quick buttons + resource selector ── */}
      {consequence.type === 'heal' && (
        <div className="space-y-1.5">
          <select value={consequence.resource || 'lep'} onChange={e => onChange({ ...consequence, resource: e.target.value })}
            className="input-field text-[10px] w-full">
            <option value="lep">Lebenspunkte wiederherstellen</option>
            <option value="asp">Astralpunkte wiederherstellen</option>
            <option value="kap">Karmapunkte wiederherstellen</option>
          </select>
          <div className="flex flex-wrap gap-1">
            {['1', '2', '3', '5', '10', '1W6', '1W6+2', '2W6'].map(v => (
              <button key={v} onClick={() => onChange({ ...consequence, value: v })}
                className={clsx('text-[9px] px-2 py-1 rounded-sm border transition font-mono',
                  consequence.value === v ? 'bg-green-900/30 text-green-400 border-green-800/30' : 'bg-dsa-bg border-dsa-bg-medium text-dsa-parchment-dark hover:text-green-400')}>
                +{v}
              </button>
            ))}
          </div>
          <input type="text" value={consequence.value || ''} onChange={e => onChange({ ...consequence, value: e.target.value })}
            className="input-field text-[10px] w-full" placeholder="Eigener Wert" />
        </div>
      )}

      {/* ── Condition add: dropdown + level selector ── */}
      {consequence.type === 'condition_add' && (() => {
        const selectedDef = consequence.condition ? CONDITIONS[consequence.condition] : null
        const maxLevel = selectedDef?.levels || 4
        return (
          <div className="space-y-1.5">
            <select value={consequence.condition || ''} onChange={e => onChange({ ...consequence, condition: e.target.value, level: 1 })}
              className="input-field text-[10px] w-full">
              <option value="">Zustand wählen...</option>
              {CONDITION_NAMES.map(c => {
                const def = CONDITIONS[c]
                return <option key={c} value={c}>{def?.icon || '⚠️'} {c} — {def?.summary?.slice(0, 50) || ''}</option>
              })}
            </select>
            {selectedDef && maxLevel > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-dsa-parchment-dark">Stufe:</span>
                {Array.from({ length: maxLevel }, (_, i) => i + 1).map(l => (
                  <button key={l} onClick={() => onChange({ ...consequence, level: l })}
                    className={clsx('w-7 h-7 rounded-sm text-[10px] font-bold border transition',
                      consequence.level === l ? 'bg-amber-900/30 text-amber-400 border-amber-800/30' : 'bg-dsa-bg border-dsa-bg-medium text-dsa-parchment-dark hover:text-amber-400')}>
                    {['', 'I', 'II', 'III', 'IV'][l]}
                  </button>
                ))}
              </div>
            )}
            {selectedDef && <p className="text-[9px] text-dsa-parchment-dark/60">{selectedDef.desc[Math.min((consequence.level || 1) - 1, selectedDef.desc.length - 1)]}</p>}
          </div>
        )
      })()}

      {/* ── Condition remove: dropdown + level ── */}
      {consequence.type === 'condition_remove' && (
        <div className="space-y-1.5">
          <select value={consequence.condition || ''} onChange={e => onChange({ ...consequence, condition: e.target.value, level: 1 })}
            className="input-field text-[10px] w-full">
            <option value="">Zustand wählen...</option>
            {CONDITION_NAMES.map(c => <option key={c} value={c}>{CONDITIONS[c]?.icon || '⚠️'} {c}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-dsa-parchment-dark">Stufen entfernen:</span>
            {[1, 2, 3, 4].map(l => (
              <button key={l} onClick={() => onChange({ ...consequence, level: l })}
                className={clsx('w-7 h-7 rounded-sm text-[10px] font-bold border transition',
                  consequence.level === l ? 'bg-green-900/30 text-green-400 border-green-800/30' : 'bg-dsa-bg border-dsa-bg-medium text-dsa-parchment-dark hover:text-green-400')}>
                {l}
              </button>
            ))}
            <span className="text-[9px] text-dsa-parchment-dark/40">oder</span>
            <button onClick={() => onChange({ ...consequence, level: 99 })}
              className={clsx('px-2 h-7 rounded-sm text-[9px] border transition',
                consequence.level === 99 ? 'bg-green-900/30 text-green-400 border-green-800/30' : 'bg-dsa-bg border-dsa-bg-medium text-dsa-parchment-dark hover:text-green-400')}>
              Komplett
            </button>
          </div>
        </div>
      )}

      {/* ── Item give: DataBrowser (from databank) ── */}
      {consequence.type === 'item_give' && (
        <BrowseField value={consequence.itemName} dbType="items" label="Gegenstand"
          onChange={name => onChange({ ...consequence, itemName: name })}
          extra={<>
            <input type="number" min="1" value={consequence.quantity || 1} onChange={e => onChange({ ...consequence, quantity: parseInt(e.target.value) || 1 })}
              className="input-field text-[10px] w-12 text-center" />
            <span className="text-[9px] text-dsa-parchment-dark">Stück</span>
          </>}
        />
      )}

      {/* ── Item take: from player's actual inventory ── */}
      {consequence.type === 'item_take' && (
        <InventoryPicker
          value={consequence.itemName}
          players={players}
          onChange={(name, qty) => onChange({ ...consequence, itemName: name, quantity: qty || 1 })}
        />
      )}

      {/* ── Money: labeled inputs ── */}
      {consequence.type === 'money' && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="text-[8px] text-dsa-gold uppercase">Dukaten</label>
              <input type="number" value={consequence.dukaten || 0} onChange={e => onChange({ ...consequence, dukaten: parseInt(e.target.value) || 0 })}
                className="input-field text-[10px] w-full text-center" />
            </div>
            <div className="flex-1">
              <label className="text-[8px] text-dsa-parchment uppercase">Silbertaler</label>
              <input type="number" value={consequence.silber || 0} onChange={e => onChange({ ...consequence, silber: parseInt(e.target.value) || 0 })}
                className="input-field text-[10px] w-full text-center" />
            </div>
            <div className="flex-1">
              <label className="text-[8px] text-dsa-parchment-dark uppercase">Heller</label>
              <input type="number" value={consequence.heller || 0} onChange={e => onChange({ ...consequence, heller: parseInt(e.target.value) || 0 })}
                className="input-field text-[10px] w-full text-center" />
            </div>
          </div>
          <p className="text-[8px] text-dsa-parchment-dark/40">Negative Werte = Geld abziehen. 1 Dukaten = 10 Silber = 100 Heller.</p>
        </div>
      )}

      {/* ── Info: templates + textarea ── */}
      {consequence.type === 'info' && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1">
            {['Du hörst...', 'Du siehst...', 'Du spürst...', 'Du erinnerst dich...', 'Nur du bemerkst...', 'Du findest...'].map(t => (
              <button key={t} onClick={() => onChange({ ...consequence, text: (consequence.text || '') + (consequence.text ? ' ' : '') + t })}
                className="text-[8px] px-1.5 py-0.5 bg-blue-900/20 text-blue-400/70 rounded hover:text-blue-400 transition">{t}</button>
            ))}
          </div>
          <textarea value={consequence.text || ''} onChange={e => onChange({ ...consequence, text: e.target.value })}
            className="input-field text-[10px] w-full h-16 resize-none" placeholder="Nachricht an den Spieler..." />
        </div>
      )}

      {/* ── Quest objective ── */}
      {consequence.type === 'quest' && (
        <input value={consequence.questObjective || ''} onChange={e => onChange({ ...consequence, questObjective: e.target.value })}
          className="input-field text-[10px] w-full" placeholder="Quest-Ziel Beschreibung" />
      )}

      {/* ── AP: number with label ── */}
      {consequence.type === 'ap' && (
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {[1, 2, 3, 5, 10, 15].map(v => (
              <button key={v} onClick={() => onChange({ ...consequence, amount: v })}
                className={clsx('text-[9px] px-2 py-1 rounded-sm border transition font-mono',
                  consequence.amount === v ? 'bg-dsa-gold/20 text-dsa-gold border-dsa-gold/30' : 'bg-dsa-bg border-dsa-bg-medium text-dsa-parchment-dark hover:text-dsa-gold')}>
                {v}
              </button>
            ))}
          </div>
          <input type="number" min="1" value={consequence.amount || 5} onChange={e => onChange({ ...consequence, amount: parseInt(e.target.value) || 1 })}
            className="input-field text-[10px] w-16 text-center" />
          <span className="text-[9px] text-dsa-parchment-dark">Abenteuerpunkte</span>
        </div>
      )}

      {/* ── SF learn: DataBrowser ── */}
      {consequence.type === 'sf_learn' && (
        <BrowseField value={consequence.abilityName} dbType="special_abilities" label="Sonderfertigkeit"
          onChange={name => onChange({ ...consequence, abilityName: name })} />
      )}

      {/* ── Spell/Liturgy learn: two browse options ── */}
      {consequence.type === 'spell_learn' && (
        <div className="space-y-1.5">
          <div className="flex gap-1.5">
            <BrowseField value={consequence.subtype === 'liturgy' ? null : consequence.abilityName} dbType="spells" label="Zauber"
              onChange={name => onChange({ ...consequence, abilityName: name, subtype: 'spell' })} />
            <BrowseField value={consequence.subtype === 'spell' ? null : consequence.abilityName} dbType="liturgies" label="Liturgie"
              onChange={name => onChange({ ...consequence, abilityName: name, subtype: 'liturgy' })} />
          </div>
          {consequence.abilityName && <p className="text-[9px] text-dsa-parchment-dark">Gewählt: <strong className="text-dsa-parchment">{consequence.abilityName}</strong> ({consequence.subtype === 'liturgy' ? 'Liturgie' : 'Zauber'})</p>}
        </div>
      )}

      {/* ── Talent up: DataBrowser ── */}
      {consequence.type === 'talent_up' && (
        <BrowseField value={consequence.skillName} dbType="talents" label="Talent"
          onChange={name => onChange({ ...consequence, skillName: name })} />
      )}

      {/* ── Combat tech up: DataBrowser ── */}
      {consequence.type === 'combat_tech_up' && (
        <BrowseField value={consequence.skillName} dbType="combat_techniques" label="Kampftechnik"
          onChange={name => onChange({ ...consequence, skillName: name })} />
      )}

      {consequence.type === 'quest' && (
        <input value={consequence.questObjective || ''} onChange={e => onChange({ ...consequence, questObjective: e.target.value })}
          className="input-field text-[10px] w-full" placeholder="Quest-Ziel Beschreibung" />
      )}

    </div>
  )
}

// Main component
export default function ConsequenceBuilder({ consequences, onChange, players, compact = false }) {
  const [showAdd, setShowAdd] = useState(false)

  const addConsequence = (type) => {
    const id = `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const newC = { id, type, label: '', target: 'all', value: '' }
    onChange([...consequences, newC])
    setShowAdd(false)
  }

  const updateConsequence = (index, updated) => {
    const next = [...consequences]
    next[index] = updated
    onChange(next)
  }

  const removeConsequence = (index) => {
    onChange(consequences.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      {/* Existing consequences */}
      {consequences.map((c, i) => (
        <ConsequenceCard key={c.id} consequence={c} onChange={u => updateConsequence(i, u)} onRemove={() => removeConsequence(i)} players={players} />
      ))}

      {/* Add button */}
      {!showAdd ? (
        <button onClick={() => setShowAdd(true)}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-[10px] border border-dashed border-dsa-bg-medium text-dsa-parchment-dark hover:text-dsa-gold hover:border-dsa-gold/30 rounded-sm transition">
          <Plus className="w-3.5 h-3.5" /> Konsequenz hinzufügen
        </button>
      ) : (
        <div className="border border-dsa-bg-medium rounded-sm p-2">
          <div className="text-[9px] text-dsa-parchment-dark uppercase tracking-wider font-bold mb-1.5">Konsequenz-Typ wählen</div>
          <div className="grid grid-cols-2 gap-1">
            {CONSEQUENCE_TYPES.map(t => {
              const Icon = t.icon
              return (
                <button key={t.id} onClick={() => addConsequence(t.id)}
                  className="flex items-center gap-1.5 text-[10px] py-1.5 px-2 rounded-sm border bg-dsa-bg-card border-dsa-bg-medium hover:border-dsa-gold/30 hover:bg-dsa-bg-light transition text-left">
                  <Icon className={clsx('w-3.5 h-3.5', t.color)} />
                  <div className="flex-1 min-w-0">
                    <div className={clsx('font-medium', t.color)}>{t.label}</div>
                    <div className="text-[8px] text-dsa-parchment-dark/50 truncate">{t.desc}</div>
                  </div>
                </button>
              )
            })}
          </div>
          <button onClick={() => setShowAdd(false)} className="mt-1.5 text-[9px] text-dsa-parchment-dark hover:text-dsa-parchment transition">Abbrechen</button>
        </div>
      )}

      {consequences.length === 0 && !showAdd && (
        <p className="text-[9px] text-dsa-parchment-dark/40 italic text-center py-2">
          Keine Konsequenzen definiert. Die Probe kann auch ohne vordefinierte Konsequenzen gesendet werden — du kannst nach dem Ergebnis entscheiden.
        </p>
      )}
    </div>
  )
}

export { CONSEQUENCE_TYPES }
