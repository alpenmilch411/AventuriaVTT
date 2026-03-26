import { useState, useEffect, useRef } from 'react'
import {
  Swords, Shield, ShieldHalf, Package, Sparkles, BookOpen, Search, Plus, X, Check,
  ChevronDown, ChevronRight, Star, Skull, Zap, Scroll
} from 'lucide-react'
import useAuthStore from '../../stores/authStore'
import { getCreatureIcon, getItemIcon, getSpellIcon } from '../../utils/icons'
import Badge from '../../components/common/Badge'
import DatenbankDetailModal from '../../components/DatenbankDetail'
import clsx from 'clsx'

// Subcategory field per entity type
const SUBCAT_FIELD = {
  creatures: 'category', weapons: 'combat_technique', items: 'category',
  spells: 'tradition', liturgies: 'tradition',
  special_abilities: 'category', talents: 'category',
}

const SUBCAT_LABELS = {
  humanoid: 'Humanoid', tier: 'Tier', untot: 'Untot', daemon: 'Dämon',
  magisch: 'Magisch', feenwesen: 'Feenwesen', elementar: 'Elementar',
  konstrukt: 'Konstrukt', pflanze: 'Pflanze',
  trank: 'Trank', heilkraut: 'Heilkraut', alchemie: 'Alchemie', munition: 'Munition',
  werkzeug: 'Werkzeug', licht: 'Licht', proviant: 'Proviant', schatz: 'Schatz',
  ausruestung: 'Ausrüstung', behaelter: 'Behälter', gift: 'Gift',
  verbrauchsmaterial: 'Verbrauchsmaterial', unterhaltung: 'Unterhaltung', krankheit: 'Krankheit',
  nahkampf: 'Nahkampf', fernkampf: 'Fernkampf', allgemein: 'Allgemein',
  allgemein_nichtkampf: 'Allgemein (NK)', karmal: 'Karmal',
  körper: 'Körper', gesellschaft: 'Gesellschaft', natur: 'Natur',
  wissen: 'Wissen', handwerk: 'Handwerk',
}

function getSubcatValues(item, catField) {
  const raw = item[catField]
  if (!raw) return []
  if (catField === 'tradition') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.map(String) : [String(parsed)]
    } catch { return [String(raw)] }
  }
  return [String(raw)]
}

/**
 * Session Prep Dashboard — GM prepares everything needed for the session.
 *
 * Categories map to databank tables:
 *   creatures, weapons, armor, shields, items, spells, liturgies,
 *   special_abilities, talents, rules
 *
 * The GM browses/searches each category, picks entries, and can create custom ones.
 * Selected items are stored in the session pool for quick access during play.
 */

const CATEGORIES = [
  { id: 'creatures',         label: 'Kreaturen & NSCs',  icon: Skull,      color: 'text-dsa-gold' },
  { id: 'weapons',           label: 'Waffen',             icon: Swords,     color: 'text-dsa-rust-light' },
  { id: 'armor',             label: 'Rüstungen',          icon: Shield,     color: 'text-dsa-parchment' },
  { id: 'shields',           label: 'Schilde',            icon: ShieldHalf, color: 'text-dsa-parchment' },
  { id: 'items',             label: 'Gegenstände',        icon: Package,    color: 'text-dsa-forest-light' },
  { id: 'spells',            label: 'Zauber',             icon: Sparkles,   color: 'text-dsa-mana-light' },
  { id: 'liturgies',         label: 'Liturgien',          icon: Star,       color: 'text-dsa-karma-light' },
  { id: 'special_abilities', label: 'Sonderfertigkeiten', icon: Zap,        color: 'text-dsa-gold-light' },
  { id: 'talents',           label: 'Talente',            icon: BookOpen,   color: 'text-dsa-parchment' },
  { id: 'rules',             label: 'Regeln',             icon: Scroll,     color: 'text-dsa-parchment-dark' },
]

// Field display config per type
const DISPLAY_FIELDS = {
  creatures: (item) => {
    const cv = item.combat_values || {}
    const atk = (item.attacks || [])[0] || {}
    return `LeP ${cv.LeP || '?'} · AT ${atk.AT || '?'} · RS ${cv.RS || 0} · INI ${cv.INI_basis || '?'} · ${atk.name || 'Angriff'} (${atk.damage || '?'})`
  },
  weapons: (item) => `${item.damage || '?'} · ${item.reach || '?'} · ${item.is_ranged ? 'Fernkampf' : 'Nahkampf'}${item.two_handed ? ' · Zweihand' : ''}`,
  armor: (item) => `RS ${item.rs || 0} · BE ${item.be || 0} · ${item.weight || '?'} Stein`,
  shields: (item) => `AT ${item.at_mod || 0} · PA ${item.pa_mod || 0}`,
  items: (item) => {
    const parts = []
    if (item.category) parts.push(item.category)
    if (item.usable_in_combat) parts.push('Kampf')
    if (item.consumable) parts.push('Verbrauchbar')
    if (item.effects?.heal_lep) parts.push(`Heilt ${item.effects.heal_lep}`)
    return parts.join(' · ') || item.description?.substring(0, 60) || ''
  },
  spells: (item) => `${item.probe ? (Array.isArray(item.probe) ? item.probe.join('/') : item.probe) : '?'} · AsP ${item.asp_cost || '?'} · ${item.range || '?'}`,
  liturgies: (item) => `${item.probe ? (Array.isArray(item.probe) ? item.probe.join('/') : item.probe) : '?'} · KaP ${item.kap_cost || '?'} · ${item.range || '?'}`,
  special_abilities: (item) => `${item.category || '?'} · AP ${item.ap_cost || '?'}`,
  talents: (item) => `${item.probe ? (Array.isArray(item.probe) ? item.probe.join('/') : item.probe) : '?'} · ${item.category || '?'}`,
  rules: (item) => `${item.category || '?'}`,
}

const STORAGE_KEY = 'aventuria_session_pool'

function loadPool() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } catch { return {} }
}

function savePool(pool) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pool))
}

export default function SessionPrep({ onClose }) {
  const token = useAuthStore((s) => s.token)
  const [activeCategory, setActiveCategory] = useState('creatures')
  const [databankItems, setDatabankItems] = useState({}) // { category: items[] }
  const [search, setSearch] = useState('')
  const [pool, setPool] = useState(loadPool) // { category: [item, ...] }
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customData, setCustomData] = useState('{}')
  const [loading, setLoading] = useState(false)
  const [expandedPoolCat, setExpandedPoolCat] = useState(null)
  const [selectedSubcat, setSelectedSubcat] = useState(null)
  const [subcatsExpanded, setSubcatsExpanded] = useState(true)

  // Detail popup state
  const [detailItem, setDetailItem] = useState(null)
  const [detailData, setDetailData] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const detailCacheRef = useRef({})

  // Fetch databank items for active category
  useEffect(() => {
    if (databankItems[activeCategory]) return // already loaded
    fetchCategory(activeCategory)
  }, [activeCategory])

  // Reset subcat filter when category changes
  useEffect(() => { setSelectedSubcat(null); setSubcatsExpanded(true) }, [activeCategory])

  const fetchCategory = async (cat) => {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch(`/api/databank/${cat}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        const items = Array.isArray(data) ? data : (data.items || [])
        setDatabankItems(prev => ({ ...prev, [cat]: items }))
      }
    } catch (e) { console.error('Failed to fetch:', cat, e) }
    setLoading(false)
  }

  const addToPool = (item) => {
    const updated = { ...pool }
    if (!updated[activeCategory]) updated[activeCategory] = []
    // Don't add duplicates
    if (updated[activeCategory].some(i => i.id === item.id)) return
    updated[activeCategory] = [...updated[activeCategory], item]
    setPool(updated)
    savePool(updated)
  }

  const removeFromPool = (cat, itemId) => {
    const updated = { ...pool }
    updated[cat] = (updated[cat] || []).filter(i => i.id !== itemId)
    if (updated[cat].length === 0) delete updated[cat]
    setPool(updated)
    savePool(updated)
  }

  const addCustomToPool = () => {
    if (!customName.trim()) return
    let extra = {}
    try { extra = JSON.parse(customData) } catch {}
    const item = { id: `custom_${Date.now()}`, name: customName.trim(), custom: true, ...extra }
    addToPool(item)
    setCustomName('')
    setCustomData('{}')
    setShowCustomForm(false)
  }

  const clearPool = () => { setPool({}); savePool({}) }

  const handleOpenDetail = async (item) => {
    setDetailItem(item)
    setDetailData(null)
    const cacheKey = `${activeCategory}/${item.id}`
    if (detailCacheRef.current[cacheKey]) {
      setDetailData(detailCacheRef.current[cacheKey])
      return
    }
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/databank/${activeCategory}/${item.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        detailCacheRef.current[cacheKey] = data
        setDetailData(data)
      }
    } finally {
      setDetailLoading(false)
    }
  }

  const items = databankItems[activeCategory] || []

  // Derive subcategory counts from loaded items
  const catField = SUBCAT_FIELD[activeCategory]
  const subcatCounts = {}
  for (const item of items) {
    for (const val of getSubcatValues(item, catField)) {
      subcatCounts[val] = (subcatCounts[val] || 0) + 1
    }
  }
  const subcats = Object.entries(subcatCounts)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)

  // Filter by search and subcategory
  let filtered = items
  if (search) {
    filtered = filtered.filter(i => (i.name || i.title || i.id || '').toLowerCase().includes(search.toLowerCase()))
  }
  if (selectedSubcat) {
    filtered = filtered.filter(item => getSubcatValues(item, catField).some(v => v.toLowerCase() === selectedSubcat.toLowerCase()))
  }
  const poolItems = pool[activeCategory] || []
  const poolIds = new Set(poolItems.map(i => i.id))
  const totalPoolCount = Object.values(pool).reduce((sum, arr) => sum + arr.length, 0)
  const displayFn = DISPLAY_FIELDS[activeCategory] || (() => '')

  return (
    <>
    <div className="h-full flex flex-col bg-dsa-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dsa-bg-medium bg-dsa-bg-light flex-shrink-0">
        <h1 className="text-sm font-display font-bold text-dsa-gold">Session-Material</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-dsa-parchment-dark">{totalPoolCount} vorbereitet</span>
          {totalPoolCount > 0 && <button onClick={clearPool} className="text-[10px] text-red-400/60 hover:text-red-400">Alles leeren</button>}
          {onClose && <button onClick={onClose} className="text-dsa-parchment-dark hover:text-dsa-parchment"><X className="w-4 h-4" /></button>}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Category tabs */}
        <div className="w-48 flex-shrink-0 border-r border-dsa-bg-medium bg-dsa-bg-light overflow-y-auto">
          {CATEGORIES.map(cat => {
            const count = (pool[cat.id] || []).length
            const Icon = cat.icon
            const isActive = activeCategory === cat.id
            const hasSubs = isActive && subcats.length > 0
            return (
              <div key={cat.id}>
                <button
                  onClick={() => {
                    if (isActive && hasSubs) {
                      setSubcatsExpanded(v => !v)
                    } else {
                      setActiveCategory(cat.id)
                      setSearch('')
                    }
                  }}
                  className={clsx(
                    'w-full text-left px-3 py-2 flex items-center gap-2 text-xs transition border-l-2',
                    isActive ? `border-dsa-gold bg-dsa-gold/5 ${cat.color}` : 'border-transparent text-dsa-parchment-dark hover:text-dsa-parchment hover:bg-dsa-bg-medium/30'
                  )}
                >
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="flex-1 truncate">{cat.label}</span>
                  {count > 0 && <span className="text-[9px] bg-dsa-gold/20 text-dsa-gold rounded-full px-1.5">{count}</span>}
                  {hasSubs && <ChevronDown className={clsx('w-3 h-3 flex-shrink-0 transition-transform', subcatsExpanded ? '' : '-rotate-90')} />}
                </button>

                {/* Collapsible subcategory items */}
                {hasSubs && subcatsExpanded && (
                  <div>
                    <button
                      onClick={() => setSelectedSubcat(null)}
                      className={clsx(
                        'w-full text-left pl-8 pr-3 py-1 text-[10px] transition border-l-2',
                        !selectedSubcat ? `border-dsa-gold ${cat.color} font-semibold` : 'border-transparent text-dsa-parchment-dark/60 hover:text-dsa-parchment',
                      )}
                    >
                      Alle ({items.length})
                    </button>
                    {subcats.map(({ value, count: cnt }) => (
                      <button
                        key={value}
                        onClick={() => setSelectedSubcat(selectedSubcat === value ? null : value)}
                        className={clsx(
                          'w-full text-left pl-8 pr-3 py-1 text-[10px] transition border-l-2',
                          selectedSubcat === value ? `border-dsa-gold ${cat.color} font-semibold` : 'border-transparent text-dsa-parchment-dark/60 hover:text-dsa-parchment',
                        )}
                      >
                        {SUBCAT_LABELS[value] || SUBCAT_LABELS[value?.toLowerCase()] || value}
                        <span className="ml-1 opacity-40">{cnt}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {/* Session pool summary */}
          <div className="border-t border-dsa-bg-medium mt-2 pt-2 px-3">
            <h3 className="text-[10px] text-dsa-gold uppercase tracking-wider mb-1">Session Pool</h3>
            {Object.entries(pool).map(([cat, items]) => {
              if (items.length === 0) return null
              const catConfig = CATEGORIES.find(c => c.id === cat)
              return (
                <div key={cat}>
                  <button onClick={() => setExpandedPoolCat(expandedPoolCat === cat ? null : cat)}
                    className="w-full text-left text-[10px] text-dsa-parchment-dark py-0.5 flex items-center gap-1 hover:text-dsa-parchment">
                    {expandedPoolCat === cat ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
                    {catConfig?.label || cat} ({items.length})
                  </button>
                  {expandedPoolCat === cat && items.map(item => (
                    <div key={item.id} className="flex items-center justify-between pl-4 py-0.5">
                      <span className="text-[9px] text-dsa-parchment truncate">{item.name || item.title}</span>
                      <button onClick={() => removeFromPool(cat, item.id)} className="text-red-400/30 hover:text-red-400"><X className="w-2.5 h-2.5" /></button>
                    </div>
                  ))}
                </div>
              )
            })}
            {totalPoolCount === 0 && <p className="text-[9px] text-dsa-parchment-dark/50">Noch nichts ausgewaehlt</p>}
          </div>
        </div>

        {/* Right: Databank browser */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search + Add custom */}
          <div className="flex gap-2 px-4 py-2 border-b border-dsa-bg-medium flex-shrink-0">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-dsa-parchment-dark/40" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={`In ${CATEGORIES.find(c => c.id === activeCategory)?.label || ''} suchen...`}
                className="input-field text-xs w-full pl-8"
              />
            </div>
            <button onClick={() => setShowCustomForm(!showCustomForm)}
              className="flex items-center gap-1 px-3 py-1 bg-dsa-gold/10 text-dsa-gold rounded-sm text-xs hover:bg-dsa-gold/20 transition">
              <Plus className="w-3.5 h-3.5" /> Eigenes
            </button>
          </div>

          {/* Creator form — structured per type */}
          {showCustomForm && (
            <div className="px-4 py-3 bg-dsa-bg-card/50 border-b border-dsa-bg-medium flex-shrink-0 max-h-[60vh] overflow-y-auto">
              <CreatorForm
                type={activeCategory}
                onSave={(item) => { addToPool(item); setShowCustomForm(false) }}
                onCancel={() => setShowCustomForm(false)}
                token={token}
                existingItems={databankItems[activeCategory] || []}
              />
            </div>
          )}

          {/* Item list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-dsa-parchment-dark text-xs">Lade...</div>
            ) : filtered.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-dsa-parchment-dark text-xs">
                {search ? 'Keine Treffer' : 'Keine Eintraege'}
              </div>
            ) : (
              <div className="divide-y divide-dsa-bg-medium/30">
                {filtered.map(item => {
                  const isInPool = poolIds.has(item.id)
                  return (
                    <div key={item.id}
                      className={clsx('flex items-center gap-3 px-4 py-2 hover:bg-dsa-bg-card/30 transition group', isInPool && 'bg-dsa-gold/5')}
                    >
                      <button
                        onClick={() => isInPool ? removeFromPool(activeCategory, item.id) : addToPool(item)}
                        className={clsx('w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition',
                          isInPool ? 'bg-dsa-gold border-dsa-gold' : 'border-dsa-bg-medium hover:border-dsa-gold/50'
                        )}
                      >
                        {isInPool && <Check className="w-3 h-3 text-dsa-bg" />}
                      </button>
                      <button className="flex-1 min-w-0 text-left" onClick={() => handleOpenDetail(item)}>
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{
                            activeCategory === 'creatures' ? getCreatureIcon(item.name, item.category) :
                            activeCategory === 'items' || activeCategory === 'weapons' || activeCategory === 'armor' || activeCategory === 'shields' ? getItemIcon(item.name, item.category) :
                            activeCategory === 'spells' || activeCategory === 'liturgies' ? getSpellIcon(item.name) :
                            '📋'
                          }</span>
                          <span className="text-xs font-semibold text-dsa-parchment group-hover:text-dsa-gold transition-colors">{item.name || item.title}</span>
                          {item.category && <span className="text-[8px] text-dsa-parchment-dark bg-dsa-bg-medium rounded px-1">{item.category}</span>}
                          {item.custom && <Badge variant="warning" size="sm">Eigenes</Badge>}
                        </div>
                        <div className="text-[9px] text-dsa-parchment-dark/60 mt-0.5 truncate">
                          {displayFn(item)}
                        </div>
                        {item.description && (
                          <div className="text-[9px] text-dsa-parchment-dark/40 mt-0.5 line-clamp-1">{item.description}</div>
                        )}
                      </button>
                      <ChevronRight className="w-3 h-3 text-dsa-parchment-dark/20 group-hover:text-dsa-parchment-dark/50 flex-shrink-0 transition-colors" />
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Footer: count */}
          <div className="px-4 py-1.5 border-t border-dsa-bg-medium text-[10px] text-dsa-parchment-dark/50 flex-shrink-0">
            {filtered.length} von {items.length} Eintraegen · {poolItems.length} ausgewaehlt
          </div>
        </div>
      </div>
    </div>

    {/* Detail popup */}
    {detailItem && (
      <DatenbankDetailModal
        data={detailData?.data || detailData}
        name={detailItem.name || detailItem.title || detailItem.id}
        category={activeCategory}
        loading={detailLoading && !detailData}
        isOwn={false}
        onClose={() => { setDetailItem(null); setDetailData(null) }}
        onSelect={() => { addToPool(detailItem); setDetailItem(null); setDetailData(null) }}
      />
    )}
    </>
  )
}

/**
 * Get the current session pool from localStorage.
 */
export function getSessionPool() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } catch { return {} }
}

// ═══════════════════════════════════════════════════════════════
// CreatorForm — Structured forms per entity type
// ═══════════════════════════════════════════════════════════════

const CREATURE_CATEGORIES = ['humanoid', 'tier', 'untot', 'magisch', 'elementar', 'daemon', 'feenwesen', 'pflanze', 'konstrukt']
const ITEM_CATEGORIES = ['trank', 'werkzeug', 'licht', 'proviant', 'alchemie', 'munition', 'ausruestung', 'schatz', 'gift', 'heilkraut', 'verbrauchsmaterial', 'behaelter']
const REACH_OPTIONS = ['kurz', 'mittel', 'lang', 'weit']
const SF_CATEGORIES = ['nahkampf', 'fernkampf', 'allgemein']
const TALENT_CATEGORIES = ['koerper', 'gesellschaft', 'natur', 'wissen', 'handwerk']
const ATTRIBUTES = ['MU', 'KL', 'IN', 'CH', 'FF', 'GE', 'KO', 'KK']

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="text-[10px] text-dsa-parchment-dark block mb-0.5">{label}</label>
      {children}
      {hint && <span className="text-[8px] text-dsa-parchment-dark/40">{hint}</span>}
    </div>
  )
}

function TextInput({ value, onChange, placeholder, className = '' }) {
  return <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={`input-field text-xs w-full ${className}`} />
}

function NumberInput({ value, onChange, placeholder, min, className = '' }) {
  return <input type="number" min={min} value={value} onChange={e => onChange(e.target.value === '' ? '' : parseInt(e.target.value) || 0)} placeholder={placeholder} className={`input-field text-xs w-20 text-center ${className}`} />
}

function SelectInput({ value, onChange, options, placeholder }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className="input-field text-xs">
      <option value="">{placeholder || 'Waehlen...'}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

const TYPE_DESCRIPTIONS = {
  creatures: 'Erstelle einen Gegner, ein Tier oder einen NSC mit Kampfwerten. Wird in der Kampfvorbereitung als Gegner verfuegbar.',
  weapons: 'Erstelle eine Nah- oder Fernkampfwaffe. AT/PA-Modifikatoren aendern die Grundwerte des Traegers.',
  armor: 'Erstelle eine Ruestung. RS (Ruestungsschutz) reduziert Schaden, BE (Behinderung) erschwert koerperliche Proben.',
  shields: 'Erstelle einen Schild. PA-Mod verbessert die Parade, AT-Mod verschlechtert den Angriff.',
  items: 'Erstelle einen Gegenstand — Trank, Werkzeug, Alchemieprodukt etc. Effekte werden automatisch angewendet wenn der Gegenstand benutzt wird.',
  spells: 'Erstelle einen Zauberspruch. Probe = 3 Attribute (z.B. MU/KL/CH). Kosten in AsP (Astralenergie).',
  liturgies: 'Erstelle eine Liturgie (Goetterwirken). Probe = 3 Attribute. Kosten in KaP (Karmaenergie).',
  special_abilities: 'Erstelle eine Sonderfertigkeit — Kampfmanoever, passive Boni, oder allgemeine Faehigkeiten.',
  talents: 'Erstelle ein Talent mit Proben-Attributen. Talente werden bei Proben verwendet (3W20 gegen Attribute).',
  rules: 'Erstelle eine Regel-Notiz als Schnellreferenz waehrend der Session.',
}

function CreatorForm({ type, onSave, onCancel, token, existingItems }) {
  const [form, setForm] = useState({ name: '' })
  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  // Extract unique values from existing DB items for dropdown suggestions
  const uniqueValues = (field) => {
    if (!existingItems?.length) return []
    return [...new Set(existingItems.map(i => i[field]).filter(Boolean))].sort()
  }
  const uniqueCategories = uniqueValues('category')
  const uniqueTechniques = uniqueValues('combat_technique')
  const uniqueReach = uniqueValues('reach')
  const uniqueSizes = uniqueValues('size')

  const row = "grid grid-cols-2 gap-2"
  const row3 = "grid grid-cols-3 gap-2"
  const row4 = "grid grid-cols-4 gap-2"

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-dsa-gold">
        {CATEGORIES.find(c => c.id === type)?.label || type} erstellen
      </h3>
      <p className="text-[10px] text-dsa-parchment-dark/70 leading-relaxed">{TYPE_DESCRIPTIONS[type]}</p>

      {/* Common: name */}
      <Field label="Name *" hint="Eindeutiger Name fuer diesen Eintrag">
        <TextInput value={form.name || ''} onChange={v => set('name', v)} placeholder="Name..." />
      </Field>

      {/* ── Creature ── */}
      {type === 'creatures' && (<>
        <div className={row}>
          <Field label="Kategorie" hint="Art der Kreatur">
            <SelectInput value={form.category || ''} onChange={v => set('category', v)} options={uniqueCategories.length > 0 ? uniqueCategories : CREATURE_CATEGORIES} />
          </Field>
          <Field label="Groesse" hint="Beeinflusst Trefferzone">
            <SelectInput value={form.size || ''} onChange={v => set('size', v)} options={uniqueSizes.length > 0 ? uniqueSizes : ['winzig', 'klein', 'mittel', 'gross', 'riesig']} />
          </Field>
        </div>
        <h4 className="text-[10px] text-dsa-gold mt-2">Kampfwerte</h4>
        <div className={row4}>
          <Field label="LeP" hint="Lebenspunkte"><NumberInput value={form._lep ?? ''} onChange={v => set('_lep', v)} min={1} /></Field>
          <Field label="RS" hint="Ruestungsschutz"><NumberInput value={form._rs ?? ''} onChange={v => set('_rs', v)} min={0} /></Field>
          <Field label="INI Basis" hint="(MU+GE)/2"><NumberInput value={form._ini ?? ''} onChange={v => set('_ini', v)} /></Field>
          <Field label="GS" hint="Geschwindigkeit"><NumberInput value={form._gs ?? ''} onChange={v => set('_gs', v)} /></Field>
        </div>
        <div className={row4}>
          <Field label="AW" hint="Ausweichen"><NumberInput value={form._aw ?? ''} onChange={v => set('_aw', v)} /></Field>
          <Field label="SK" hint="Seelenkraft"><NumberInput value={form._sk ?? ''} onChange={v => set('_sk', v)} /></Field>
          <Field label="ZK" hint="Zaehigkeit"><NumberInput value={form._zk ?? ''} onChange={v => set('_zk', v)} /></Field>
          <Field label="AsP" hint="Astralenergie (0=keine)"><NumberInput value={form._asp ?? ''} onChange={v => set('_asp', v)} /></Field>
        </div>
        <h4 className="text-[10px] text-dsa-gold mt-2">Attribute (optional)</h4>
        <div className={row4}>
          {ATTRIBUTES.map(attr => (
            <Field key={attr} label={attr}>
              <NumberInput value={form[`_attr_${attr}`] ?? ''} onChange={v => set(`_attr_${attr}`, v)} />
            </Field>
          ))}
        </div>
        <h4 className="text-[10px] text-dsa-gold mt-2">Angriff 1</h4>
        <div className={row3}>
          <Field label="Waffenname" hint="z.B. Orkische Axt"><TextInput value={form._atk1_name ?? ''} onChange={v => set('_atk1_name', v)} placeholder="Schwert" /></Field>
          <Field label="AT-Wert" hint="Attacke (1W20 darunter)"><NumberInput value={form._atk1_at ?? ''} onChange={v => set('_atk1_at', v)} /></Field>
          <Field label="Schaden (TP)" hint="z.B. 1W6+4"><TextInput value={form._atk1_dmg ?? ''} onChange={v => set('_atk1_dmg', v)} placeholder="1W6+4" /></Field>
        </div>
        <div className={row3}>
          <Field label="Reichweite"><SelectInput value={form._atk1_reach ?? ''} onChange={v => set('_atk1_reach', v)} options={REACH_OPTIONS} /></Field>
          <Field label="PA-Wert" hint="Parade (nur Nahkampf)"><NumberInput value={form._atk1_pa ?? ''} onChange={v => set('_atk1_pa', v)} /></Field>
          <Field label="Schadenstyp"><SelectInput value={form._atk1_type ?? ''} onChange={v => set('_atk1_type', v)} options={['schnitt', 'stumpf', 'stich', 'feuer', 'heilig']} /></Field>
        </div>
        <h4 className="text-[10px] text-dsa-gold mt-2">Angriff 2 (optional)</h4>
        <div className={row3}>
          <Field label="Waffenname"><TextInput value={form._atk2_name ?? ''} onChange={v => set('_atk2_name', v)} placeholder="z.B. Biss" /></Field>
          <Field label="AT"><NumberInput value={form._atk2_at ?? ''} onChange={v => set('_atk2_at', v)} /></Field>
          <Field label="Schaden"><TextInput value={form._atk2_dmg ?? ''} onChange={v => set('_atk2_dmg', v)} placeholder="1W6+2" /></Field>
        </div>
        <h4 className="text-[10px] text-dsa-gold mt-2">Sonstiges</h4>
        <Field label="Beute (kommagetrennt)" hint="Gegenstaende die bei Sieg gefunden werden">
          <TextInput value={form._loot ?? ''} onChange={v => set('_loot', v)} placeholder="Dolch, 5 Silbertaler, Heiltrank" />
        </Field>
        <Field label="Verhalten / Taktik" hint="Wie kaempft diese Kreatur?">
          <textarea value={form.behavior ?? ''} onChange={e => set('behavior', e.target.value)} className="input-field text-[10px] w-full h-12" placeholder="Greift schwaechstes Ziel an, flieht unter 5 LeP..." />
        </Field>
        <Field label="Fluchtgrenze (LeP)" hint="Ab welchen LeP flieht die Kreatur? (0 = nie)">
          <NumberInput value={form.flee_threshold ?? ''} onChange={v => set('flee_threshold', v)} />
        </Field>
      </>)}

      {/* ── Weapon ── */}
      {type === 'weapons' && (<>
        <div className={row}>
          <Field label="Kampftechnik" hint="z.B. Schwerter, Hiebwaffen, Boegen, Dolche, Raufen">
            <SelectInput value={form.combat_technique ?? ''} onChange={v => set('combat_technique', v)}
              options={uniqueTechniques.length > 0 ? uniqueTechniques : ['Dolche', 'Hiebwaffen', 'Schwerter', 'Stangenwaffen', 'Zweihandhiebwaffen', 'Zweihandschwerter', 'Boegen', 'Armbrueste', 'Wurfwaffen', 'Raufen']}
            />
          </Field>
          <Field label="Trefferpunkte (TP)" hint="Schadenswurf, z.B. 1W6+4">
            <TextInput value={form.damage ?? ''} onChange={v => set('damage', v)} placeholder="1W6+4" />
          </Field>
        </div>
        <div className={row3}>
          <Field label="AT Modifikator" hint="Aendert AT des Traegers (+/-)"><NumberInput value={form.at_mod ?? ''} onChange={v => set('at_mod', v)} /></Field>
          <Field label="PA Modifikator" hint="Aendert PA des Traegers (+/-)"><NumberInput value={form.pa_mod ?? ''} onChange={v => set('pa_mod', v)} /></Field>
          <Field label="Reichweite" hint="kurz=1m, mittel=2m, lang=3m">
            <SelectInput value={form.reach ?? ''} onChange={v => set('reach', v)} options={REACH_OPTIONS} />
          </Field>
        </div>
        <div className={row3}>
          <Field label="Gewicht (Stein)" hint="1 Stein ≈ 1kg"><NumberInput value={form.weight ?? ''} onChange={v => set('weight', v)} /></Field>
          <Field label="Preis (Silber)"><NumberInput value={form.price ?? ''} onChange={v => set('price', v)} /></Field>
          <Field label="Schadenstyp"><SelectInput value={form.damage_type ?? ''} onChange={v => set('damage_type', v)} options={['schnitt', 'stumpf', 'stich']} /></Field>
        </div>
        <div className="flex flex-wrap gap-4 text-xs">
          <label className="flex items-center gap-1"><input type="checkbox" checked={!!form.is_ranged} onChange={e => set('is_ranged', e.target.checked)} /> Fernkampfwaffe</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={!!form.two_handed} onChange={e => set('two_handed', e.target.checked)} /> Zweihaendig</label>
        </div>
        {form.is_ranged && (
          <div className={row3}>
            <Field label="Nah (Schritt)" hint="Kein Abzug"><NumberInput value={form._range_close ?? ''} onChange={v => set('_range_close', v)} /></Field>
            <Field label="Mittel (Schritt)" hint="-2 FK"><NumberInput value={form._range_mid ?? ''} onChange={v => set('_range_mid', v)} /></Field>
            <Field label="Weit (Schritt)" hint="-4 FK"><NumberInput value={form._range_far ?? ''} onChange={v => set('_range_far', v)} /></Field>
          </div>
        )}
        {form.is_ranged && (
          <div className={row}>
            <Field label="Nachladezeit (Aktionen)" hint="0 = keine Nachladezeit"><NumberInput value={form.reload_time ?? ''} onChange={v => set('reload_time', v)} /></Field>
            <Field label="Munitionstyp" hint="z.B. Pfeil, Bolzen"><TextInput value={form.ammunition ?? ''} onChange={v => set('ammunition', v)} placeholder="Pfeil" /></Field>
          </div>
        )}
      </>)}

      {/* ── Armor ── */}
      {type === 'armor' && (<>
        <div className={row3}>
          <Field label="RS"><NumberInput value={form.rs ?? ''} onChange={v => set('rs', v)} /></Field>
          <Field label="BE"><NumberInput value={form.be ?? ''} onChange={v => set('be', v)} /></Field>
          <Field label="Gewicht"><NumberInput value={form.weight ?? ''} onChange={v => set('weight', v)} /></Field>
        </div>
        <Field label="Preis (Silber)"><NumberInput value={form.price ?? ''} onChange={v => set('price', v)} /></Field>
      </>)}

      {/* ── Shield ── */}
      {type === 'shields' && (<>
        <div className={row3}>
          <Field label="AT Mod"><NumberInput value={form.at_mod ?? ''} onChange={v => set('at_mod', v)} /></Field>
          <Field label="PA Mod"><NumberInput value={form.pa_mod ?? ''} onChange={v => set('pa_mod', v)} /></Field>
          <Field label="Groesse"><SelectInput value={form.size ?? ''} onChange={v => set('size', v)} options={['klein', 'mittel', 'gross']} /></Field>
        </div>
      </>)}

      {/* ── Item ── */}
      {type === 'items' && (<>
        <div className={row}>
          <Field label="Kategorie" hint="Bestimmt Icon und Sortierung">
            <SelectInput value={form.category ?? ''} onChange={v => set('category', v)} options={uniqueCategories.length > 0 ? uniqueCategories : ITEM_CATEGORIES} />
          </Field>
          <Field label="Gewicht (Stein)" hint="Pro Stueck, 1 Stein ≈ 1kg"><NumberInput value={form.weight ?? ''} onChange={v => set('weight', v)} /></Field>
        </div>
        <div className={row}>
          <Field label="Preis (Silber)"><NumberInput value={form.price ?? ''} onChange={v => set('price', v)} /></Field>
          <Field label="Aktionskosten" hint="z.B. '1 Aktion', 'freie Aktion', '2 Aktionen'">
            <TextInput value={form.use_action_cost ?? ''} onChange={v => set('use_action_cost', v)} placeholder="1 Aktion" />
          </Field>
        </div>
        <div className="flex flex-wrap gap-4 text-xs">
          <label className="flex items-center gap-1" title="Wird nach Benutzung aus dem Inventar entfernt"><input type="checkbox" checked={!!form.consumable} onChange={e => set('consumable', e.target.checked)} /> Verbrauchbar</label>
          <label className="flex items-center gap-1" title="Kann waehrend des Kampfes benutzt werden"><input type="checkbox" checked={!!form.usable_in_combat} onChange={e => set('usable_in_combat', e.target.checked)} /> Im Kampf nutzbar</label>
          <label className="flex items-center gap-1" title="Kann gestapelt werden (mehrere auf einem Slot)"><input type="checkbox" checked={!!form.stackable} onChange={e => set('stackable', e.target.checked)} /> Stapelbar</label>
        </div>
        <h4 className="text-[10px] text-dsa-gold mt-2">Effekte (alle optional)</h4>
        <div className={row}>
          <Field label="Heilung (LeP)" hint="Wuerfelformel, z.B. 1W6+2, 2W6+4">
            <TextInput value={form._heal ?? ''} onChange={v => set('_heal', v)} placeholder="1W6+2" />
          </Field>
          <Field label="AsP wiederherstellen" hint="z.B. 2W6+2">
            <TextInput value={form._restore_asp ?? ''} onChange={v => set('_restore_asp', v)} placeholder="2W6+2" />
          </Field>
        </div>
        <div className={row}>
          <Field label="Attribut-Buff" hint="z.B. GE, KK, MU — temporaerer Bonus">
            <TextInput value={form._buff_stat ?? ''} onChange={v => set('_buff_stat', v)} placeholder="GE" />
          </Field>
          <Field label="Buff-Wert / Dauer" hint="Bonus und Minuten, z.B. +2 / 30">
            <div className="flex gap-1">
              <NumberInput value={form._buff_value ?? ''} onChange={v => set('_buff_value', v)} className="w-12" />
              <NumberInput value={form._buff_duration ?? ''} onChange={v => set('_buff_duration', v)} className="w-16" />
              <span className="text-[9px] text-dsa-parchment-dark self-center">Min</span>
            </div>
          </Field>
        </div>
        <div className={row}>
          <Field label="Schaden (Wurfgegenstand)" hint="z.B. 2W6 Feuer">
            <TextInput value={form._damage ?? ''} onChange={v => set('_damage', v)} placeholder="2W6 SP Feuer" />
          </Field>
          <Field label="Radius (AoE)" hint="Schritt, 0 = Einzelziel">
            <NumberInput value={form._radius ?? ''} onChange={v => set('_radius', v)} />
          </Field>
        </div>
        <Field label="Effekt-Beschreibung" hint="Freitext, wird dem SL und Spieler angezeigt">
          <TextInput value={form._effect_detail ?? ''} onChange={v => set('_effect_detail', v)} placeholder="Entfernt 1 Stufe Betaeubung..." />
        </Field>
      </>)}

      {/* ── Spell ── */}
      {type === 'spells' && (<>
        <div className={row}>
          <Field label="Probe (3 Attribute)" hint="z.B. MU/KL/CH">
            <TextInput value={form._probe ?? ''} onChange={v => set('_probe', v)} placeholder="MU/KL/CH" />
          </Field>
          <Field label="AsP Kosten"><TextInput value={form.asp_cost ?? ''} onChange={v => set('asp_cost', v)} placeholder="4 AsP" /></Field>
        </div>
        <div className={row3}>
          <Field label="Reichweite"><TextInput value={form.range ?? ''} onChange={v => set('range', v)} placeholder="8 Schritt" /></Field>
          <Field label="Zauberdauer"><TextInput value={form.casting_time ?? ''} onChange={v => set('casting_time', v)} placeholder="2 Aktionen" /></Field>
          <Field label="Wirkungsdauer"><TextInput value={form.duration ?? ''} onChange={v => set('duration', v)} placeholder="QS KR" /></Field>
        </div>
        <Field label="Schaden"><TextInput value={form.damage ?? ''} onChange={v => set('damage', v)} placeholder="2W6+QS TP" /></Field>
      </>)}

      {/* ── Liturgy (same as spell but KaP) ── */}
      {type === 'liturgies' && (<>
        <div className={row}>
          <Field label="Probe (3 Attribute)">
            <TextInput value={form._probe ?? ''} onChange={v => set('_probe', v)} placeholder="MU/IN/CH" />
          </Field>
          <Field label="KaP Kosten"><TextInput value={form.kap_cost ?? ''} onChange={v => set('kap_cost', v)} placeholder="4 KaP" /></Field>
        </div>
        <div className={row3}>
          <Field label="Reichweite"><TextInput value={form.range ?? ''} onChange={v => set('range', v)} placeholder="Beruehrung" /></Field>
          <Field label="Liturgiedauer"><TextInput value={form.casting_time ?? ''} onChange={v => set('casting_time', v)} placeholder="4 Aktionen" /></Field>
          <Field label="Wirkungsdauer"><TextInput value={form.duration ?? ''} onChange={v => set('duration', v)} placeholder="QS x 5 Min" /></Field>
        </div>
      </>)}

      {/* ── Special Ability ── */}
      {type === 'special_abilities' && (<>
        <div className={row}>
          <Field label="Kategorie"><SelectInput value={form.category ?? ''} onChange={v => set('category', v)} options={uniqueCategories.length > 0 ? uniqueCategories : SF_CATEGORIES} /></Field>
          <Field label="AP Kosten"><NumberInput value={form.ap_cost ?? ''} onChange={v => set('ap_cost', v)} /></Field>
        </div>
        <div className={row3}>
          <Field label="AT Mod"><NumberInput value={form.at_mod ?? ''} onChange={v => set('at_mod', v)} /></Field>
          <Field label="PA Mod"><NumberInput value={form.pa_mod ?? ''} onChange={v => set('pa_mod', v)} /></Field>
          <Field label="TP Mod"><TextInput value={form.damage_modifier ?? ''} onChange={v => set('damage_modifier', v)} placeholder="+2" /></Field>
        </div>
        <Field label="Regeltext">
          <textarea value={form.rules_text ?? ''} onChange={e => set('rules_text', e.target.value)} className="input-field text-[10px] w-full h-16" placeholder="Regelbeschreibung..." />
        </Field>
      </>)}

      {/* ── Talent ── */}
      {type === 'talents' && (<>
        <div className={row}>
          <Field label="Kategorie"><SelectInput value={form.category ?? ''} onChange={v => set('category', v)} options={uniqueCategories.length > 0 ? uniqueCategories : TALENT_CATEGORIES} /></Field>
          <Field label="Probe (3 Attribute)" hint="z.B. MU/GE/KK">
            <TextInput value={form._probe ?? ''} onChange={v => set('_probe', v)} placeholder="MU/GE/KK" />
          </Field>
        </div>
      </>)}

      {/* ── Rules ── */}
      {type === 'rules' && (<>
        <Field label="Kategorie">
          <TextInput value={form.category ?? ''} onChange={v => set('category', v)} placeholder="kampf_allgemein, proben, ..." />
        </Field>
        <Field label="Inhalt">
          <textarea value={form.content ?? ''} onChange={e => set('content', e.target.value)} className="input-field text-[10px] w-full h-24" placeholder="Regeltext..." />
        </Field>
      </>)}

      {/* Common: description */}
      <Field label="Beschreibung">
        <textarea value={form.description ?? ''} onChange={e => set('description', e.target.value)} className="input-field text-[10px] w-full h-12" placeholder="Optionale Beschreibung..." />
      </Field>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button onClick={() => {
          // Pre-process form into proper structure before saving
          const processed = { ...form }
          // Creature: build combat_values and attacks
          if (type === 'creatures') {
            processed.combat_values = { LeP: form._lep || 20, RS: form._rs || 0, INI_basis: form._ini || 10, GS: form._gs || 7, AW: form._aw || 5, SK: form._sk || 0, ZK: form._zk || 0 }
            if (form._atk1_name) {
              processed.attacks = [{ name: form._atk1_name, AT: form._atk1_at || 12, PA: form._atk1_pa, damage: form._atk1_dmg || '1W6+4', reach: form._atk1_reach || 'mittel' }]
            }
            if (form._loot) processed.guaranteed_loot = form._loot.split(',').map(s => s.trim()).filter(Boolean)
          }
          // Creature: build attributes
          if (type === 'creatures') {
            const attrs = {}
            for (const a of ATTRIBUTES) {
              if (form[`_attr_${a}`]) attrs[a] = form[`_attr_${a}`]
            }
            if (Object.keys(attrs).length > 0) processed.attributes = attrs
            if (form._asp) processed.combat_values.AsP = form._asp
            // Second attack
            if (form._atk2_name) {
              if (!processed.attacks) processed.attacks = []
              processed.attacks.push({ name: form._atk2_name, AT: form._atk2_at || 10, damage: form._atk2_dmg || '1W6+2', reach: 'mittel' })
            }
          }
          // Weapon: build range_brackets for ranged
          if (type === 'weapons' && form.is_ranged) {
            processed.range_brackets = { close: form._range_close, medium: form._range_mid, far: form._range_far }
          }
          // Item: build effects
          if (type === 'items') {
            const effects = {}
            if (form._heal) effects.heal_lep = form._heal
            if (form._restore_asp) effects.restore_asp = form._restore_asp
            if (form._buff_stat && form._buff_value) {
              effects[`${form._buff_stat.toLowerCase()}_bonus`] = form._buff_value
              effects.duration_minutes = form._buff_duration || 30
            }
            if (form._damage) effects.fire_damage = form._damage
            if (form._radius) effects.radius = form._radius
            if (form._effect_detail) effects.detail = form._effect_detail
            if (Object.keys(effects).length > 0) processed.effects = effects
          }
          // Spell/Liturgy/Talent: parse probe string
          if (form._probe) {
            processed.probe = form._probe.split('/').map(s => s.trim()).filter(Boolean)
          }
          // Clean underscore prefixed temp fields
          for (const key of Object.keys(processed)) {
            if (key.startsWith('_')) delete processed[key]
          }
          processed.id = `custom_${Date.now()}`
          processed.custom = true
          onSave(processed)
        }}
        disabled={!form.name?.trim()}
        className="btn-primary text-xs flex-1 disabled:opacity-30">
          <Check className="w-3 h-3 inline mr-1" />Erstellen & Hinzufuegen
        </button>
        <button onClick={onCancel} className="btn-ghost text-xs">Abbrechen</button>
      </div>
    </div>
  )
}
