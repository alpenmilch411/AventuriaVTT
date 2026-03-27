import { useState, useEffect, useMemo } from 'react'
import {
  Package, X, Trash2, ChevronDown, ChevronUp, Check,
  Send, Users, Coins, Search, Loader2, Swords, Shield,
} from 'lucide-react'
import useSessionStore from '../../stores/sessionStore'
import useAuthStore from '../../stores/authStore'
import Badge from '../../components/common/Badge'
import { ITEM_SUBCATEGORIES } from '../../components/DatenbankDetail'
import clsx from 'clsx'

// ---------------------------------------------------------------------------
// Inventory-matching categories — derived from shared ITEM_SUBCATEGORIES
// ---------------------------------------------------------------------------

const LOOT_CATEGORIES = [
  { id: 'weapons',  label: 'Waffen',  icon: '\u2694\uFE0F' },
  { id: 'armor',    label: 'Rüstung', icon: '\uD83D\uDEE1\uFE0F' },
  { id: 'shields',  label: 'Schilde', icon: '\uD83D\uDEE1\uFE0F' },
  ...Object.entries(ITEM_SUBCATEGORIES)
    .filter(([k]) => k !== 'krankheit') // krankheit is not lootable
    .map(([id, { label, icon }]) => ({ id, label, icon })),
  { id: 'sonstiges', label: 'Sonstiges', icon: '\uD83D\uDCE6' },
]

function categorizeItem(item) {
  const c = (item.category || '').toLowerCase()
  const t = (item._type || '').toLowerCase()

  // _type from databank endpoint (weapons, armor, shields)
  if (t === 'weapon' || t === 'weapons') return 'weapons'
  if (t === 'armor') return 'armor'
  if (t === 'shield' || t === 'shields') return 'shields'

  // Use raw DB category directly — matches LOOT_CATEGORIES ids
  const directCategories = ['trank', 'heilkraut', 'alchemie', 'gift', 'munition', 'werkzeug', 'licht', 'proviant', 'ausruestung', 'behaelter', 'schatz', 'unterhaltung', 'verbrauchsmaterial']
  if (directCategories.includes(c)) return c

  return 'sonstiges'
}

// ---------------------------------------------------------------------------
// Currency helpers (1 Dukaten = 10 Silber = 100 Heller = 1000 Kreuzer)
// ---------------------------------------------------------------------------

const CURRENCIES = [
  { key: 'dukaten', label: 'Duk', fullLabel: 'Dukaten', inSilber: 10 },
  { key: 'silber',  label: 'Sil', fullLabel: 'Silbertaler', inSilber: 1 },
  { key: 'heller',  label: 'Hel', fullLabel: 'Heller', inSilber: 0.1 },
  { key: 'kreuzer', label: 'Kre', fullLabel: 'Kreuzer', inSilber: 0.01 },
]

const EMPTY_PURSE = { dukaten: 0, silber: 0, heller: 0, kreuzer: 0 }

function totalInSilber(purse) {
  return (purse.dukaten || 0) * 10
       + (purse.silber  || 0)
       + (purse.heller  || 0) * 0.1
       + (purse.kreuzer || 0) * 0.01
}

function splitPurse(purse, n) {
  if (n <= 0) return []
  const splits = Array.from({ length: n }, () => ({ ...EMPTY_PURSE }))
  for (const { key } of CURRENCIES) {
    const total = purse[key] || 0
    const each = Math.floor(total / n)
    const rem = total % n
    for (let i = 0; i < n; i++) splits[i][key] = each
    if (rem > 0) splits[0][key] += rem
  }
  return splits
}

function hasMoney(purse) {
  return CURRENCIES.some(c => (purse[c.key] || 0) > 0)
}

// ---------------------------------------------------------------------------
// Currency row input
// ---------------------------------------------------------------------------

function PurseInput({ purse, onChange, compact = false }) {
  return (
    <div className={clsx('flex gap-2', compact && 'gap-1.5')}>
      {CURRENCIES.map(({ key, label, fullLabel }) => (
        <label key={key} className="flex flex-col items-center gap-0.5 flex-1 min-w-0" title={fullLabel}>
          <span className="text-[9px] text-dsa-parchment-dark/60 uppercase tracking-wide">{label}</span>
          <input
            type="number"
            min="0"
            value={purse[key] || ''}
            placeholder="0"
            onChange={(e) => onChange({ ...purse, [key]: Math.max(0, parseInt(e.target.value) || 0) })}
            className="input-field text-sm font-mono text-center py-1 px-1 w-full"
          />
        </label>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function LootPanel({ sourceName, sourceItems, onClose, sendMessage }) {
  const players = useSessionStore((s) => s.players)
  const token = useAuthStore((s) => s.token)

  // Phase: 'select' → 'distribute' → 'done'
  const [phase, setPhase] = useState('select')

  // Selected loot items
  const [lootItems, setLootItems] = useState(
    (sourceItems || []).map((item, i) => ({
      id: `loot_${i}`,
      name: typeof item === 'string' ? item : item.name,
      quantity: typeof item === 'object' ? (item.quantity || 1) : 1,
      category: typeof item === 'object' ? (item.category || '') : '',
      desc: typeof item === 'object' ? (item.desc || '') : '',
      weight: typeof item === 'object' ? (item.weight || 0) : 0,
    }))
  )

  // Currency to distribute
  const [lootCurrency, setLootCurrency] = useState({ ...EMPTY_PURSE })

  // DB browser
  const [dbCategory, setDbCategory] = useState('weapons')
  const [dbSearch, setDbSearch] = useState('')
  const [dbLoading, setDbLoading] = useState(false)
  const [allDbItems, setAllDbItems] = useState([])

  // Distribute phase state
  const [itemAssignments, setItemAssignments] = useState({}) // itemId → playerId
  const [moneyAssignments, setMoneyAssignments] = useState({}) // playerId → purse
  const [moneySplitMode, setMoneySplitMode] = useState('even') // 'even' | 'manual'
  const [expandedItem, setExpandedItem] = useState(null)

  // DB item detail expansion
  const [expandedDbItem, setExpandedDbItem] = useState(null) // `${_type}_${id}`

  // ---------------------------------------------------------------------------
  // Fetch all DB items (items + weapons + armor), merge + tag with _type
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!token) return
    setDbLoading(true)
    const headers = { Authorization: `Bearer ${token}` }
    const load = (cat) => fetch(`/api/databank/${cat}?page_size=200`, { headers })
      .then(r => r.ok ? r.json() : [])
      .then(data => (Array.isArray(data) ? data : (data.items || [])).map(i => ({ ...i, _type: cat })))
      .catch(() => [])

    Promise.all([load('items'), load('weapons'), load('armor'), load('shields')])
      .then(([items, weapons, armor, shields]) => {
        setAllDbItems([...items, ...weapons, ...armor, ...shields])
      })
      .finally(() => setDbLoading(false))
  }, [token])

  // ---------------------------------------------------------------------------
  // Derived lists
  // ---------------------------------------------------------------------------

  const categorizedDb = useMemo(() => {
    const groups = {}
    for (const cat of LOOT_CATEGORIES) groups[cat.id] = []
    for (const item of allDbItems) groups[categorizeItem(item)]?.push(item)
    return groups
  }, [allDbItems])

  const filteredItems = useMemo(() => {
    if (dbSearch.trim()) {
      const q = dbSearch.toLowerCase()
      return allDbItems.filter(i => i.name?.toLowerCase().includes(q))
    }
    return categorizedDb[dbCategory] || []
  }, [dbSearch, dbCategory, categorizedDb, allDbItems])

  const categoryCounts = useMemo(() => {
    const out = {}
    for (const [id, items] of Object.entries(categorizedDb)) out[id] = items.length
    return out
  }, [categorizedDb])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const addFromDb = (item) => {
    if (lootItems.some(l => l.name === item.name)) return
    setLootItems(prev => [...prev, {
      id: `loot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: item.name,
      quantity: 1,
      category: item.category || item._type || '',
      desc: item.description || '',
      weight: item.weight || 0,
      template_id: item.id || null,
      _type: item._type || '',
    }])
  }

  const removeLootItem = (id) => {
    setLootItems(prev => prev.filter(i => i.id !== id))
    setItemAssignments(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  const updateLootQty = (id, qty) =>
    setLootItems(prev => prev.map(i => i.id === id ? { ...i, quantity: Math.max(1, qty) } : i))

  // Initialize distribute phase state
  const enterDistribute = () => {
    // Auto-split currency evenly
    const splits = splitPurse(lootCurrency, players.length)
    const init = {}
    players.forEach((p, i) => { init[p.id] = splits[i] || { ...EMPTY_PURSE } })
    setMoneyAssignments(init)
    setMoneySplitMode('even')
    // Auto-assign all items to the single player
    if (players.length === 1) {
      const autoAssign = {}
      lootItems.forEach(item => { autoAssign[item.id] = players[0].id })
      setItemAssignments(autoAssign)
    }
    setPhase('distribute')

    sendMessage?.({
      type: 'loot_display',
      payload: {
        source_name: sourceName,
        items: lootItems.map(i => ({ name: i.name, quantity: i.quantity, category: i.category, desc: i.desc })),
        currency: hasMoney(lootCurrency) ? lootCurrency : null,
      },
    })
  }

  const applyEvenSplit = () => {
    const splits = splitPurse(lootCurrency, players.length)
    const next = {}
    players.forEach((p, i) => { next[p.id] = splits[i] || { ...EMPTY_PURSE } })
    setMoneyAssignments(next)
  }

  const handleConfirmDistribution = () => {
    const distributions = []
    for (const [itemId, playerId] of Object.entries(itemAssignments)) {
      const item = lootItems.find(i => i.id === itemId)
      const player = players.find(p => p.id === playerId)
      if (!item || !player) continue
      distributions.push({
        player_id: playerId,
        character_id: player.characterId,
        player_name: player.character?.name || player.username,
        item_name: item.name,
        quantity: item.quantity,
        weight: item.weight || 0,
        category: item.category || '',
        template_id: item.template_id || null,
        _type: item._type || '',
      })
    }

    const moneyDistributions = []
    if (hasMoney(lootCurrency)) {
      for (const player of players) {
        const money = moneyAssignments[player.id] || EMPTY_PURSE
        if (hasMoney(money)) {
          moneyDistributions.push({
            player_id: player.id,
            character_id: player.characterId,
            player_name: player.character?.name || player.username,
            ...money,
          })
        }
      }
    }

    sendMessage?.({
      type: 'loot_distribute',
      payload: {
        source_name: sourceName,
        distributions,
        money_distributions: moneyDistributions,
      },
    })
    setPhase('done')
  }

  const assignedCount = lootItems.filter(i => itemAssignments[i.id]).length
  const unassignedCount = lootItems.length - assignedCount
  const canConfirm = lootItems.length === 0
    || lootItems.every(i => itemAssignments[i.id])
    || hasMoney(lootCurrency)
  const silverTotal = totalInSilber(lootCurrency)

  // ── SELECT PHASE ──────────────────────────────────────────────────────────

  if (phase === 'select') {
    return (
      <div className="bg-dsa-bg-card border border-dsa-gold/20 rounded-lg overflow-hidden flex flex-col" style={{ maxHeight: '82vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-dsa-gold/10 border-b border-dsa-gold/20 flex-shrink-0">
          <h3 className="text-sm font-semibold text-dsa-gold flex items-center gap-2">
            <Package className="w-4 h-4" /> Beute: {sourceName}
          </h3>
          <button onClick={onClose} className="text-dsa-parchment-dark hover:text-dsa-parchment">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Currency bar */}
        <div className="px-4 py-3 border-b border-dsa-bg-medium bg-dsa-bg-light/30 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-dsa-gold shrink-0">
              <Coins className="w-4 h-4" />
              <span className="text-xs font-semibold">Geld</span>
            </div>
            <PurseInput purse={lootCurrency} onChange={setLootCurrency} compact />
            {silverTotal > 0 && (
              <span className="text-xs text-dsa-parchment-dark/60 whitespace-nowrap shrink-0">
                ≈ {silverTotal % 1 === 0 ? silverTotal : silverTotal.toFixed(1)} Sil
              </span>
            )}
          </div>
        </div>

        {/* Two-column body */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Left: selected items */}
          <div className="w-52 flex-shrink-0 border-r border-dsa-bg-medium flex flex-col">
            <div className="px-3 py-1.5 border-b border-dsa-bg-medium flex-shrink-0">
              <span className="text-[10px] font-semibold text-dsa-parchment-dark uppercase tracking-wider">
                Ausgewählt ({lootItems.length})
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {lootItems.length === 0 && (
                <p className="text-[10px] text-dsa-parchment-dark/50 text-center py-4 leading-relaxed">
                  Noch keine Items.<br />Rechts wählen oder eingeben.
                </p>
              )}
              {lootItems.map((item) => (
                <div key={item.id} className="flex items-center gap-1 bg-dsa-bg rounded border border-dsa-bg-medium px-2 py-1">
                  <span className="text-xs text-dsa-parchment flex-1 truncate">{item.name}</span>
                  <button onClick={() => updateLootQty(item.id, item.quantity - 1)} className="w-4 h-4 text-[10px] bg-dsa-bg-medium rounded text-dsa-parchment-dark hover:text-dsa-parchment leading-none">−</button>
                  <span className="text-[10px] font-mono text-dsa-gold w-4 text-center">{item.quantity}</span>
                  <button onClick={() => updateLootQty(item.id, item.quantity + 1)} className="w-4 h-4 text-[10px] bg-dsa-bg-medium rounded text-dsa-parchment-dark hover:text-dsa-parchment leading-none">+</button>
                  <button onClick={() => removeLootItem(item.id)} className="text-dsa-parchment-dark/30 hover:text-red-400 ml-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Right: category sidebar + DB items */}
          <div className="flex-1 flex min-w-0">
            {/* Category sidebar */}
            <div className="w-32 flex-shrink-0 border-r border-dsa-bg-medium flex flex-col overflow-y-auto">
              <div className="px-2 py-1.5 border-b border-dsa-bg-medium flex-shrink-0">
                <span className="text-[9px] font-semibold text-dsa-parchment-dark/50 uppercase tracking-wider">Kategorien</span>
              </div>
              {LOOT_CATEGORIES.filter(cat => (categoryCounts[cat.id] || 0) > 0).map(cat => (
                <button
                  key={cat.id}
                  onClick={() => { setDbCategory(cat.id); setDbSearch('') }}
                  className={clsx(
                    'w-full text-left px-2 py-1.5 flex items-center gap-1.5 text-[10px] border-l-2 transition-colors flex-shrink-0',
                    !dbSearch && dbCategory === cat.id
                      ? 'bg-dsa-gold/10 text-dsa-gold border-l-dsa-gold'
                      : 'text-dsa-parchment-dark border-l-transparent hover:bg-dsa-bg-medium/40 hover:text-dsa-parchment'
                  )}
                >
                  <span className="text-[11px]">{cat.icon}</span>
                  <span className="flex-1 truncate">{cat.label}</span>
                  <span className="text-[9px] text-dsa-parchment-dark/40">{categoryCounts[cat.id]}</span>
                </button>
              ))}
            </div>

            {/* Items column */}
            <div className="flex-1 flex flex-col min-w-0">
              {/* Search */}
              <div className="px-2 pt-2 pb-1 flex-shrink-0">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-dsa-parchment-dark/40" />
                  <input
                    type="text"
                    value={dbSearch}
                    onChange={(e) => setDbSearch(e.target.value)}
                    placeholder="Suchen..."
                    className="input-field text-[10px] pl-6 py-1 w-full"
                  />
                  {dbSearch && (
                    <button onClick={() => setDbSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-dsa-parchment-dark/40 hover:text-dsa-parchment">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Item list */}
              <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
                {dbLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-4 h-4 animate-spin text-dsa-gold" />
                  </div>
                ) : filteredItems.length === 0 ? (
                  <p className="text-[10px] text-dsa-parchment-dark/50 text-center py-6">
                    {dbSearch ? 'Keine Treffer' : 'Keine Einträge'}
                  </p>
                ) : (
                  filteredItems.map((item) => {
                    const itemKey = `${item._type}_${item.id}`
                    const alreadyAdded = lootItems.some(l => l.name === item.name)
                    const isExpanded = expandedDbItem === itemKey
                    const fmtMod = (v) => v == null ? null : (v >= 0 ? `+${v}` : `${v}`)
                    return (
                      <div
                        key={itemKey}
                        className={clsx(
                          'rounded border transition-colors',
                          alreadyAdded ? 'opacity-50 bg-dsa-bg border-dsa-bg-medium' : 'bg-dsa-bg border-dsa-bg-medium',
                          isExpanded && 'border-dsa-gold/25',
                        )}
                      >
                        {/* Row */}
                        <div className="flex items-center gap-1.5 px-2 py-1.5">
                          <button
                            onClick={() => !alreadyAdded && addFromDb(item)}
                            disabled={alreadyAdded}
                            className="flex-1 flex items-center gap-1.5 min-w-0 text-left disabled:cursor-default"
                          >
                            {alreadyAdded
                              ? <Check className="w-3 h-3 text-dsa-gold flex-shrink-0" />
                              : <span className="w-3 flex-shrink-0 text-center text-[10px]">
                                  {LOOT_CATEGORIES.find(c => c.id === categorizeItem(item))?.icon || '📦'}
                                </span>
                            }
                            <span className="text-[10px] text-dsa-parchment flex-1 truncate">{item.name}</span>
                            {item._type === 'weapons' && item.damage && (
                              <span className="text-[8px] text-dsa-rust-light flex-shrink-0">{item.damage}</span>
                            )}
                            {(item._type === 'armor' || item._type === 'shields') && item.rs != null && (
                              <span className="text-[8px] text-dsa-parchment-dark/70 flex-shrink-0">RS {item.rs}</span>
                            )}
                          </button>
                          <button
                            onClick={() => setExpandedDbItem(isExpanded ? null : itemKey)}
                            className={clsx(
                              'w-4 h-4 flex items-center justify-center rounded flex-shrink-0 transition-colors',
                              isExpanded ? 'text-dsa-gold' : 'text-dsa-parchment-dark/30 hover:text-dsa-parchment-dark'
                            )}
                          >
                            <ChevronDown className={clsx('w-3 h-3 transition-transform duration-150', isExpanded && 'rotate-180')} />
                          </button>
                        </div>
                        {/* Expanded details */}
                        {isExpanded && (
                          <div className="px-3 pb-2.5 pt-1.5 border-t border-dsa-bg-medium/60 space-y-1.5">
                            {/* Weapon stats */}
                            {item._type === 'weapons' && (
                              <div className="flex flex-wrap gap-1">
                                {item.damage && <span className="stat-pill px-1.5 py-0.5 text-[9px] text-dsa-rust-light">TP {item.damage}</span>}
                                {item.combat_technique && <span className="stat-pill px-1.5 py-0.5 text-[9px]">{item.combat_technique}</span>}
                                {fmtMod(item.at_mod) && <span className="stat-pill px-1.5 py-0.5 text-[9px]">AT {fmtMod(item.at_mod)}</span>}
                                {fmtMod(item.pa_mod) && <span className="stat-pill px-1.5 py-0.5 text-[9px]">PA {fmtMod(item.pa_mod)}</span>}
                                {item.reach && <span className="stat-pill px-1.5 py-0.5 text-[9px]">RW {item.reach}</span>}
                                {item.two_handed && <span className="stat-pill px-1.5 py-0.5 text-[9px] text-dsa-parchment-dark">2-händig</span>}
                                {item.is_ranged && item.range_brackets && (
                                  <span className="stat-pill px-1.5 py-0.5 text-[9px]">
                                    {[item.range_brackets.short, item.range_brackets.medium, item.range_brackets.long].filter(Boolean).join('/')}m
                                  </span>
                                )}
                                {Array.isArray(item.properties) && item.properties.map((p, i) => (
                                  <span key={i} className="stat-pill px-1.5 py-0.5 text-[9px] text-dsa-gold/80">{p}</span>
                                ))}
                              </div>
                            )}
                            {/* Armor/shield stats */}
                            {(item._type === 'armor' || item._type === 'shields') && (
                              <div className="flex flex-wrap gap-1">
                                {item.rs != null && <span className="stat-pill px-1.5 py-0.5 text-[9px]">RS {item.rs}</span>}
                                {item.be != null && <span className="stat-pill px-1.5 py-0.5 text-[9px] text-dsa-parchment-dark">BE {item.be}</span>}
                                {fmtMod(item.at_mod) && <span className="stat-pill px-1.5 py-0.5 text-[9px]">AT {fmtMod(item.at_mod)}</span>}
                                {fmtMod(item.pa_mod) && <span className="stat-pill px-1.5 py-0.5 text-[9px]">PA {fmtMod(item.pa_mod)}</span>}
                                {item.size && <span className="stat-pill px-1.5 py-0.5 text-[9px]">{item.size}</span>}
                              </div>
                            )}
                            {/* Weight / price row */}
                            {(item.weight != null || item.price != null) && (
                              <div className="flex gap-3 text-[9px] text-dsa-parchment-dark/50">
                                {item.weight != null && <span>⚖ {item.weight} Stein</span>}
                                {item.price != null && <span>⬤ {item.price} Sil</span>}
                              </div>
                            )}
                            {/* Description */}
                            {item.description && (
                              <p className="text-[9px] text-dsa-parchment-dark/70 italic leading-relaxed border-l border-dsa-gold/20 pl-2">
                                {item.description}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-4 py-3 border-t border-dsa-bg-medium flex-shrink-0">
          <button onClick={onClose} className="btn-ghost flex-1 text-xs">Abbrechen</button>
          <button
            onClick={enterDistribute}
            disabled={lootItems.length === 0 && !hasMoney(lootCurrency)}
            className="btn-primary flex-1 text-xs flex items-center justify-center gap-1.5 disabled:opacity-30"
          >
            <Send className="w-3.5 h-3.5" /> Den Spielern zeigen
          </button>
        </div>
      </div>
    )
  }

  // ── DISTRIBUTE PHASE ──────────────────────────────────────────────────────

  if (phase === 'distribute') {
    return (
      <div className="bg-dsa-bg-card border border-dsa-gold/20 rounded-lg overflow-hidden flex flex-col" style={{ maxHeight: '82vh' }}>
        <div className="flex items-center justify-between px-4 py-3 bg-dsa-gold/10 border-b border-dsa-gold/20 flex-shrink-0">
          <h3 className="text-sm font-semibold text-dsa-gold flex items-center gap-2">
            <Users className="w-4 h-4" /> Beute verteilen: {sourceName}
          </h3>
          <button onClick={() => setPhase('select')} className="text-xs text-dsa-parchment-dark hover:text-dsa-parchment">
            Zurück
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Currency section */}
          {hasMoney(lootCurrency) && (
            <div className="bg-dsa-bg rounded-lg border border-dsa-gold/20 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-dsa-gold/8 border-b border-dsa-gold/15">
                <div className="flex items-center gap-2">
                  <Coins className="w-3.5 h-3.5 text-dsa-gold" />
                  <span className="text-xs font-semibold text-dsa-gold">Geld verteilen</span>
                  <span className="text-[10px] text-dsa-parchment-dark/60">
                    ≈ {silverTotal % 1 === 0 ? silverTotal : silverTotal.toFixed(1)} Silbertaler gesamt
                  </span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => { setMoneySplitMode('even'); applyEvenSplit() }}
                    className={clsx('text-[10px] px-2 py-0.5 rounded border transition',
                      moneySplitMode === 'even'
                        ? 'bg-dsa-gold/15 text-dsa-gold border-dsa-gold/30'
                        : 'text-dsa-parchment-dark border-dsa-bg-medium hover:text-dsa-parchment'
                    )}
                  >
                    Gleich aufteilen
                  </button>
                  <button
                    onClick={() => setMoneySplitMode('manual')}
                    className={clsx('text-[10px] px-2 py-0.5 rounded border transition',
                      moneySplitMode === 'manual'
                        ? 'bg-dsa-gold/15 text-dsa-gold border-dsa-gold/30'
                        : 'text-dsa-parchment-dark border-dsa-bg-medium hover:text-dsa-parchment'
                    )}
                  >
                    Manuell
                  </button>
                </div>
              </div>
              <div className="p-3 space-y-3">
                {players.map((p) => {
                  const pMoney = moneyAssignments[p.id] || EMPTY_PURSE
                  const pSilver = totalInSilber(pMoney)
                  return (
                    <div key={p.id} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-dsa-parchment">
                          {p.character?.name || p.username}
                        </span>
                        {pSilver > 0 && (
                          <span className="text-[10px] text-dsa-gold">
                            ≈ {pSilver % 1 === 0 ? pSilver : pSilver.toFixed(1)} Sil
                          </span>
                        )}
                      </div>
                      <PurseInput
                        purse={pMoney}
                        onChange={(next) => setMoneyAssignments(prev => ({ ...prev, [p.id]: next }))}
                        compact
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Item assignments */}
          {lootItems.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] text-dsa-parchment-dark uppercase tracking-wider font-semibold">
                Gegenstände zuweisen
              </span>
              {lootItems.map((item) => {
                const assignedPlayer = players.find(p => p.id === itemAssignments[item.id])
                const isExpanded = expandedItem === item.id
                return (
                  <div key={item.id} className="bg-dsa-bg rounded-lg border border-dsa-bg-medium overflow-hidden">
                    <div
                      className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-dsa-bg-light/30"
                      onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                    >
                      <span className="text-sm text-dsa-parchment flex-1">
                        {item.quantity > 1 ? `${item.quantity}× ` : ''}{item.name}
                      </span>
                      {assignedPlayer ? (
                        <Badge variant="success" size="sm">{assignedPlayer.character?.name || assignedPlayer.username}</Badge>
                      ) : (
                        <Badge variant="warning" size="sm">Nicht zugewiesen</Badge>
                      )}
                      {isExpanded ? <ChevronUp className="w-3 h-3 text-dsa-parchment-dark/40" /> : <ChevronDown className="w-3 h-3 text-dsa-parchment-dark/40" />}
                    </div>
                    {isExpanded && (
                      <div className="px-3 pb-3 border-t border-dsa-bg-medium pt-2">
                        {item.desc && <p className="text-[10px] text-dsa-parchment-dark/60 italic mb-2">{item.desc}</p>}
                        <div className="grid grid-cols-2 gap-1">
                          {players.map((p) => (
                            <button
                              key={p.id}
                              onClick={() => setItemAssignments(prev => ({ ...prev, [item.id]: p.id }))}
                              className={clsx(
                                'text-left px-2 py-1.5 rounded text-xs transition-colors',
                                itemAssignments[item.id] === p.id
                                  ? 'bg-green-900/30 text-green-400 border border-green-800/30'
                                  : 'bg-dsa-bg-light text-dsa-parchment-dark border border-dsa-bg-medium hover:border-dsa-gold/20'
                              )}
                            >
                              {itemAssignments[item.id] === p.id && <Check className="w-3 h-3 inline mr-1" />}
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
          )}
        </div>

        <div className="flex gap-2 px-4 py-3 border-t border-dsa-bg-medium flex-shrink-0">
          <button onClick={() => setPhase('select')} className="btn-ghost flex-1 text-xs">Zurück</button>
          <button
            onClick={handleConfirmDistribution}
            disabled={!canConfirm}
            className="btn-primary flex-1 text-xs flex items-center justify-center gap-1 disabled:opacity-30"
          >
            <Check className="w-3.5 h-3.5" /> Verteilen bestätigen
          </button>
        </div>
        {unassignedCount > 0 && (
          <p className="text-[9px] text-yellow-400 text-center pb-2">
            {unassignedCount} Gegenstand{unassignedCount > 1 ? 'e' : ''} nicht zugewiesen — {canConfirm ? 'wird übersprungen' : 'bitte zuweisen oder entfernen'}.
          </p>
        )}
      </div>
    )
  }

  // ── DONE ──────────────────────────────────────────────────────────────────

  return (
    <div className="bg-dsa-bg-card border border-green-800/30 rounded-lg p-6 text-center">
      <Check className="w-8 h-8 text-green-400 mx-auto mb-2" />
      <h3 className="text-sm font-semibold text-green-400 mb-1">Beute verteilt!</h3>
      <p className="text-xs text-dsa-parchment-dark">Die Gegenstände wurden den Spielern zugewiesen.</p>
      <button onClick={onClose} className="btn-ghost text-xs mt-3">Schließen</button>
    </div>
  )
}
