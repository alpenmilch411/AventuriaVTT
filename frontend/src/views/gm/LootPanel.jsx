import { useState, useEffect } from 'react'
import {
  Package, Plus, X, Trash2, ChevronDown, ChevronUp, Check,
  Send, Users, Gem, Swords, Shield, FlaskConical
} from 'lucide-react'
import useSessionStore from '../../stores/sessionStore'
import useAuthStore from '../../stores/authStore'
import Badge from '../../components/common/Badge'
import Modal from '../../components/common/Modal'

// Common loot items with descriptions
const COMMON_LOOT = [
  { name: 'Silbertaler', category: 'Geld', desc: 'Gaengige aventurische Waehrung.', defaultQty: 10, weight: 0.01 },
  { name: 'Heiltrank (schwach)', category: 'Trank', desc: 'Heilt 1W6+2 Lebenspunkte.', defaultQty: 1, weight: 0.2 },
  { name: 'Heiltrank (mittel)', category: 'Trank', desc: 'Heilt 2W6+2 Lebenspunkte.', defaultQty: 1, weight: 0.2 },
  { name: 'Proviant (1 Tag)', category: 'Verbrauchsgut', desc: 'Trockenfleisch und Brot fuer einen Tag.', defaultQty: 1, weight: 1.0 },
  { name: 'Fackel', category: 'Werkzeug', desc: 'Brennt ca. 1 Stunde.', defaultQty: 2, weight: 0.5 },
  { name: 'Seil (10 Schritt)', category: 'Werkzeug', desc: 'Stabiles Hanfseil.', defaultQty: 1, weight: 1.0 },
  { name: 'Dolch', category: 'Waffe', desc: 'Einfacher Dolch. TP 1W6+1, Reichweite kurz.', defaultQty: 1, weight: 0.3 },
  { name: 'Langschwert', category: 'Waffe', desc: 'Vielseitige Klingenwaffe. TP 1W6+4, Reichweite mittel.', defaultQty: 1, weight: 0.75 },
  { name: 'Lederruestung', category: 'Ruestung', desc: 'Leichte Ruestung. RS 2, BE 1.', defaultQty: 1, weight: 4.0 },
  { name: 'Kettenhemd', category: 'Ruestung', desc: 'Solide Ruestung. RS 4, BE 3.', defaultQty: 1, weight: 8.0 },
  { name: 'Edelstein (klein)', category: 'Schatz', desc: 'Ein kleiner geschliffener Stein. Wert: ca. 5-20 Silber.', defaultQty: 1, weight: 0.01 },
  { name: 'Schluessel', category: 'Quest', desc: 'Ein Schluessel. Wozu er passt, weiss nur der Spielleiter.', defaultQty: 1, weight: 0.05 },
  { name: 'Schriftrolle', category: 'Quest', desc: 'Eine beschriebene Pergamentrolle. Inhalt vom SL bestimmt.', defaultQty: 1, weight: 0.1 },
  { name: 'Alraune', category: 'Alchemie', desc: 'Seltene Wurzel. Wichtige Zutat fuer Traenke.', defaultQty: 1, weight: 0.1 },
  { name: 'Orkisches Amulett', category: 'Magisch', desc: 'Ein raues Amulett orkischer Machart. Magisch?', defaultQty: 1, weight: 0.1 },
]

function getItemIcon(cat) {
  const c = (cat || '').toLowerCase()
  if (c.includes('waffe')) return Swords
  if (c.includes('ruestung') || c.includes('schild')) return Shield
  if (c.includes('trank') || c.includes('alchemie')) return FlaskConical
  if (c.includes('geld') || c.includes('schatz')) return Gem
  return Package
}

/**
 * Loot Panel — Full loot distribution flow for the GM.
 *
 * Props:
 * - sourceName: name of the creature/source
 * - sourceItems: initial suggested items from creature's loot table (optional)
 * - onClose: close the panel
 * - sendMessage: WebSocket send function
 */
export default function LootPanel({ sourceName, sourceItems, onClose, sendMessage }) {
  const players = useSessionStore((s) => s.players)
  const token = useAuthStore((s) => s.token)

  // Phase: 'select' → 'distribute' → 'done'
  const [phase, setPhase] = useState('select')

  // Items the GM has selected for this loot drop
  const [lootItems, setLootItems] = useState(
    (sourceItems || []).map((name, i) => ({
      id: `loot_${i}`,
      name: typeof name === 'string' ? name : name.name,
      quantity: typeof name === 'object' ? (name.quantity || 1) : 1,
      category: typeof name === 'object' ? (name.category || '') : '',
      desc: typeof name === 'object' ? (name.desc || '') : '',
      weight: typeof name === 'object' ? (name.weight || 0) : 0,
    }))
  )

  // Custom item input
  const [customName, setCustomName] = useState('')
  const [customQty, setCustomQty] = useState(1)
  const [showCommonItems, setShowCommonItems] = useState(false)

  // Distribution: item_id → player_id
  const [assignments, setAssignments] = useState({})
  const [expandedLootItem, setExpandedLootItem] = useState(null)

  const addLootItem = (item) => {
    setLootItems(prev => [...prev, {
      id: `loot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: item.name,
      quantity: item.defaultQty || item.quantity || 1,
      category: item.category || '',
      desc: item.desc || '',
      weight: item.weight || 0,
    }])
  }

  const removeLootItem = (id) => {
    setLootItems(prev => prev.filter(i => i.id !== id))
    setAssignments(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  const updateLootQty = (id, qty) => {
    setLootItems(prev => prev.map(i => i.id === id ? { ...i, quantity: Math.max(1, qty) } : i))
  }

  const addCustomItem = () => {
    if (!customName.trim()) return
    addLootItem({ name: customName.trim(), quantity: customQty, category: '', desc: '', weight: 0 })
    setCustomName('')
    setCustomQty(1)
  }

  const assignToPlayer = (itemId, playerId) => {
    setAssignments(prev => ({ ...prev, [itemId]: playerId }))
  }

  const handleShowToPlayers = () => {
    // Broadcast loot to table view and all players
    sendMessage?.({
      type: 'loot_display',
      payload: {
        source_name: sourceName,
        items: lootItems.map(i => ({ name: i.name, quantity: i.quantity, category: i.category, desc: i.desc })),
      },
    })
    setPhase('distribute')
  }

  const handleConfirmDistribution = () => {
    // Send each assigned item to the player's inventory
    const distributions = []
    for (const [itemId, playerId] of Object.entries(assignments)) {
      const item = lootItems.find(i => i.id === itemId)
      const player = players.find(p => p.id === playerId)
      if (!item || !player) continue
      distributions.push({
        player_id: playerId,
        player_name: player.character?.name || player.username,
        item_name: item.name,
        quantity: item.quantity,
        weight: item.weight,
      })
    }

    sendMessage?.({
      type: 'loot_distribute',
      payload: {
        source_name: sourceName,
        distributions,
      },
    })

    setPhase('done')
  }

  const allAssigned = lootItems.length > 0 && lootItems.every(i => assignments[i.id])

  // ── SELECT PHASE: GM picks what's in the loot ──
  if (phase === 'select') {
    return (
      <div className="bg-dsa-bg-card border border-dsa-gold/20 rounded overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-dsa-gold/10 border-b border-dsa-gold/20">
          <h3 className="text-sm font-semibold text-dsa-gold flex items-center gap-2">
            <Package className="w-4 h-4" /> Beute: {sourceName}
          </h3>
          <button onClick={onClose} className="text-dsa-parchment-dark hover:text-dsa-parchment"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-dsa-parchment-dark">Waehle die Gegenstaende die als Beute verfuegbar sind. Du kannst Gegenstaende hinzufuegen, entfernen oder die Menge aendern.</p>

          {/* Current loot items */}
          {lootItems.length > 0 && (
            <div className="space-y-1.5">
              {lootItems.map((item) => {
                const Icon = getItemIcon(item.category)
                return (
                  <div key={item.id} className="flex items-center gap-2 bg-dsa-bg rounded-sm border border-dsa-bg-medium p-2">
                    <Icon className="w-4 h-4 text-dsa-gold flex-shrink-0" />
                    <span className="text-sm text-dsa-parchment flex-1 truncate">{item.name}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => updateLootQty(item.id, item.quantity - 1)} className="w-6 h-6 rounded bg-dsa-bg-medium text-dsa-parchment-dark text-xs hover:text-dsa-parchment">−</button>
                      <span className="text-sm font-mono text-dsa-gold w-6 text-center">{item.quantity}</span>
                      <button onClick={() => updateLootQty(item.id, item.quantity + 1)} className="w-6 h-6 rounded bg-dsa-bg-medium text-dsa-parchment-dark text-xs hover:text-dsa-parchment">+</button>
                    </div>
                    <button onClick={() => removeLootItem(item.id)} className="text-dsa-parchment-dark/40 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                )
              })}
            </div>
          )}

          {lootItems.length === 0 && (
            <div className="text-center py-4 text-dsa-parchment-dark text-xs">Noch keine Beute hinzugefuegt.</div>
          )}

          {/* Add custom item */}
          <div className="flex gap-2">
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className="input-field text-xs flex-1"
              placeholder="Gegenstand hinzufuegen..."
              onKeyDown={(e) => e.key === 'Enter' && addCustomItem()}
            />
            <input
              type="number" min="1" value={customQty}
              onChange={(e) => setCustomQty(Math.max(1, parseInt(e.target.value) || 1))}
              className="input-field text-xs w-14 text-center"
            />
            <button onClick={addCustomItem} className="px-2 py-1 bg-dsa-gold/10 text-dsa-gold rounded-sm hover:bg-dsa-gold/20"><Plus className="w-4 h-4" /></button>
          </div>

          {/* Common items quick-add */}
          <button onClick={() => setShowCommonItems(!showCommonItems)} className="text-xs text-dsa-parchment-dark hover:text-dsa-gold flex items-center gap-1 w-full">
            {showCommonItems ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Haeufige Gegenstaende
          </button>
          {showCommonItems && (
            <div className="grid grid-cols-2 gap-1 max-h-48 overflow-y-auto">
              {COMMON_LOOT.map((item, i) => (
                <button key={i} onClick={() => addLootItem(item)}
                  className="text-left px-2 py-1.5 bg-dsa-bg rounded border border-dsa-bg-medium text-[10px] text-dsa-parchment hover:border-dsa-gold/20 transition-colors truncate">
                  {item.name}
                </button>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t border-dsa-bg-medium">
            <button onClick={onClose} className="btn-ghost flex-1 text-xs">Abbrechen</button>
            <button
              onClick={handleShowToPlayers}
              disabled={lootItems.length === 0}
              className="btn-primary flex-1 text-xs flex items-center justify-center gap-1 disabled:opacity-30"
            >
              <Send className="w-3.5 h-3.5" /> Den Spielern zeigen
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── DISTRIBUTE PHASE: GM assigns items to players ──
  if (phase === 'distribute') {
    return (
      <div className="bg-dsa-bg-card border border-dsa-gold/20 rounded overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-dsa-gold/10 border-b border-dsa-gold/20">
          <h3 className="text-sm font-semibold text-dsa-gold flex items-center gap-2">
            <Users className="w-4 h-4" /> Beute verteilen: {sourceName}
          </h3>
          <button onClick={() => setPhase('select')} className="text-xs text-dsa-parchment-dark hover:text-dsa-parchment">Zurueck</button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-dsa-parchment-dark">Die Spieler sehen die Beute jetzt auf dem Tisch-Bildschirm. Weise jedem Gegenstand einen Spieler zu.</p>

          <div className="space-y-2">
            {lootItems.map((item) => {
              const Icon = getItemIcon(item.category)
              const assignedPlayer = players.find(p => p.id === assignments[item.id])
              const isExpanded = expandedLootItem === item.id

              return (
                <div key={item.id} className="bg-dsa-bg rounded border border-dsa-bg-medium overflow-hidden">
                  <div
                    className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-dsa-bg-light/30"
                    onClick={() => setExpandedLootItem(isExpanded ? null : item.id)}
                  >
                    <Icon className="w-4 h-4 text-dsa-gold flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-dsa-parchment">{item.quantity > 1 ? `${item.quantity}x ` : ''}{item.name}</span>
                    </div>
                    {assignedPlayer ? (
                      <Badge variant="success" size="sm">{assignedPlayer.character?.name || assignedPlayer.username}</Badge>
                    ) : (
                      <Badge variant="warning" size="sm">Nicht zugewiesen</Badge>
                    )}
                    {isExpanded ? <ChevronUp className="w-3 h-3 text-dsa-parchment-dark/40" /> : <ChevronDown className="w-3 h-3 text-dsa-parchment-dark/40" />}
                  </div>

                  {isExpanded && (
                    <div className="px-3 pb-3 border-t border-dsa-bg-medium pt-2 space-y-2">
                      {item.desc && <p className="text-[10px] text-dsa-parchment/60">{item.desc}</p>}
                      <div className="grid grid-cols-2 gap-1">
                        {players.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => assignToPlayer(item.id, p.id)}
                            className={`text-left px-2 py-1.5 rounded-sm text-xs transition-colors ${
                              assignments[item.id] === p.id
                                ? 'bg-green-900/30 text-green-400 border border-green-800/30'
                                : 'bg-dsa-bg-light text-dsa-parchment-dark border border-dsa-bg-medium hover:border-dsa-gold/20'
                            }`}
                          >
                            {assignments[item.id] === p.id && <Check className="w-3 h-3 inline mr-1" />}
                            {p.character?.name || p.username}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex gap-2 pt-2 border-t border-dsa-bg-medium">
            <button onClick={() => setPhase('select')} className="btn-ghost flex-1 text-xs">Zurueck</button>
            <button
              onClick={handleConfirmDistribution}
              disabled={!allAssigned}
              className="btn-primary flex-1 text-xs flex items-center justify-center gap-1 disabled:opacity-30"
            >
              <Check className="w-3.5 h-3.5" /> Verteilen bestaetigen
            </button>
          </div>
          {!allAssigned && (
            <p className="text-[9px] text-yellow-400 text-center">Alle Gegenstaende muessen einem Spieler zugewiesen werden.</p>
          )}
        </div>
      </div>
    )
  }

  // ── DONE PHASE ──
  return (
    <div className="bg-dsa-bg-card border border-green-800/30 rounded p-4 text-center">
      <Check className="w-8 h-8 text-green-400 mx-auto mb-2" />
      <h3 className="text-sm font-semibold text-green-400">Beute verteilt!</h3>
      <p className="text-xs text-dsa-parchment-dark mt-1">Die Gegenstaende wurden den Spielern zugewiesen.</p>
      <button onClick={onClose} className="btn-ghost text-xs mt-3">Schliessen</button>
    </div>
  )
}
