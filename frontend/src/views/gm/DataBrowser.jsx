/**
 * DataBrowser — Reusable searchable, categorized picker for DB entities.
 * Used for talents, spells, items, SFs, combat techniques, etc.
 * Clicking an item opens a full detail popup; "Auswählen" calls onSelect.
 */
import { useState, useEffect } from 'react'
import { Search, X, ChevronRight } from 'lucide-react'
import useAuthStore from '../../stores/authStore'
import DatenbankDetailModal from '../../components/DatenbankDetail'
import clsx from 'clsx'

const ENDPOINTS = {
  talents:           { url: '/api/databank/talents',           categoryField: 'category',  nameField: 'name', label: 'Talent',            category: 'talents' },
  spells:            { url: '/api/databank/spells',            categoryField: 'tradition', nameField: 'name', label: 'Zauber',             category: 'spells' },
  liturgies:         { url: '/api/databank/liturgies',         categoryField: 'tradition', nameField: 'name', label: 'Liturgie',           category: 'liturgies' },
  combat_techniques: { url: '/api/databank/combat_techniques', categoryField: 'category',  nameField: 'name', label: 'Kampftechnik',       category: 'talents' },
  special_abilities: { url: '/api/databank/special_abilities', categoryField: 'category',  nameField: 'name', label: 'Sonderfertigkeit',   category: 'special_abilities' },
  items:             { url: '/api/databank/items',             categoryField: 'category',  nameField: 'name', label: 'Gegenstand',         category: 'items' },
  creatures:         { url: '/api/databank/creatures',         categoryField: 'category',  nameField: 'name', label: 'Kreatur',            category: 'creatures' },
}

const CATEGORY_LABELS = {
  // Talent categories
  'körper': 'Körper', 'koerper': 'Körper', 'gesellschaft': 'Gesellschaft',
  'natur': 'Natur', 'wissen': 'Wissen', 'handwerk': 'Handwerk',
  // Combat technique categories
  'nahkampf': 'Nahkampf', 'fernkampf': 'Fernkampf',
  // Special ability categories
  'kampf': 'Kampf', 'allgemein': 'Allgemein', 'allgemein_nichtkampf': 'Allgemein (NK)',
  'karmal': 'Karmal',
  // Item categories
  'trank': 'Trank', 'heilkraut': 'Heilkraut', 'alchemie': 'Alchemie',
  'munition': 'Munition', 'werkzeug': 'Werkzeug', 'licht': 'Licht',
  'proviant': 'Proviant', 'schatz': 'Schatz', 'ausruestung': 'Ausrüstung',
  'behaelter': 'Behälter', 'gift': 'Gift', 'verbrauchsmaterial': 'Verbrauchsmaterial',
  'unterhaltung': 'Unterhaltung', 'krankheit': 'Krankheit',
  'waffe': 'Waffen', 'ruestung': 'Rüstung',
  // Creature types
  'humanoid': 'Humanoid', 'tier': 'Tier', 'untot': 'Untot', 'daemon': 'Dämon',
  'magisch': 'Magisch', 'feenwesen': 'Feenwesen', 'elementar': 'Elementar',
  'konstrukt': 'Konstrukt', 'pflanze': 'Pflanze',
  // Weapon combat techniques (stored capitalized — mapped lowercase for lookup)
  'schwerter': 'Schwerter', 'stangenwaffen': 'Stangenwaffen', 'hiebwaffen': 'Hiebwaffen',
  'wurfwaffen': 'Wurfwaffen', 'bögen': 'Bögen', 'armbrüste': 'Armbrüste',
  'dolche': 'Dolche', 'fechtwaffen': 'Fechtwaffen', 'kettenwaffen': 'Kettenwaffen',
  'zweihandschwerter': 'Zweihandschwerter', 'äxte': 'Äxte', 'blasrohre': 'Blasrohre',
  'raufen': 'Raufen', 'zweihandäxte': 'Zweihandäxte',
}

export default function DataBrowser({ type, onSelect, onClose, title }) {
  const token = useAuthStore((s) => s.token)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(null)

  // Detail popup state
  const [detailItem, setDetailItem] = useState(null)
  const [detailData, setDetailData] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const detailCache = {}

  const config = ENDPOINTS[type]

  useEffect(() => {
    if (!token || !config) return
    fetch(config.url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(d => { setItems(Array.isArray(d) ? d : d.items || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [token, type])

  // Parse tradition JSON arrays, or return single-element array for plain values
  function getCategoryValues(item) {
    const raw = item[config?.categoryField]
    if (!raw) return ['sonstig']
    if (config?.categoryField === 'tradition') {
      try {
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed.map(String) : [String(parsed)]
      } catch {
        return [String(raw)]
      }
    }
    return [String(raw)]
  }

  // Group by category — items with multiple traditions appear under each
  const categories = {}
  for (const item of items) {
    for (const cat of getCategoryValues(item)) {
      const key = cat.toLowerCase()
      if (!categories[key]) categories[key] = []
      categories[key].push(item)
    }
  }
  const categoryKeys = Object.keys(categories).sort()

  // Filter
  const filtered = search
    ? items.filter(i => (i[config?.nameField] || '').toLowerCase().includes(search.toLowerCase()))
    : selectedCategory
    ? items.filter(item => getCategoryValues(item).some(v => v.toLowerCase() === selectedCategory))
    : items

  const handleOpenDetail = async (item) => {
    setDetailItem(item)
    setDetailData(null)

    const cacheKey = item.id
    if (detailCache[cacheKey]) {
      setDetailData(detailCache[cacheKey])
      return
    }

    setDetailLoading(true)
    try {
      const res = await fetch(`${config.url}/${item.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        detailCache[cacheKey] = data
        setDetailData(data)
      }
    } finally {
      setDetailLoading(false)
    }
  }

  const handleSelect = () => {
    if (detailItem) {
      onSelect(detailItem)
      onClose()
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
        <div className="relative z-10 bg-dsa-bg border border-dsa-bg-medium rounded shadow-2xl w-full max-w-lg max-h-[70vh] flex flex-col animate-fade-in" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-dsa-bg-medium bg-dsa-bg-card flex-shrink-0">
            <h4 className="text-xs font-display font-semibold text-dsa-gold">{title || `${config?.label || type} auswählen`}</h4>
            <button onClick={onClose} className="text-dsa-parchment-dark hover:text-dsa-parchment"><X className="w-4 h-4" /></button>
          </div>

          {/* Search */}
          <div className="px-3 py-2 border-b border-dsa-bg-medium/50 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dsa-parchment-dark/40" />
              <input value={search} onChange={e => { setSearch(e.target.value); setSelectedCategory(null) }}
                className="input-field text-xs w-full pl-8" placeholder="Suchen..." autoFocus />
            </div>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Category sidebar */}
            {!search && categoryKeys.length > 1 && (
              <div className="w-32 border-r border-dsa-bg-medium overflow-y-auto flex-shrink-0">
                <button onClick={() => setSelectedCategory(null)}
                  className={clsx('w-full text-left px-2 py-1.5 text-[10px] transition border-b border-dsa-bg-medium/30',
                    !selectedCategory ? 'bg-dsa-gold/10 text-dsa-gold font-bold' : 'text-dsa-parchment-dark hover:text-dsa-parchment')}>
                  Alle ({items.length})
                </button>
                {categoryKeys.map(cat => (
                  <button key={cat} onClick={() => setSelectedCategory(cat)}
                    className={clsx('w-full text-left px-2 py-1.5 text-[10px] transition border-b border-dsa-bg-medium/30',
                      selectedCategory === cat ? 'bg-dsa-gold/10 text-dsa-gold font-bold' : 'text-dsa-parchment-dark hover:text-dsa-parchment')}>
                    {CATEGORY_LABELS[cat] || cat} ({categories[cat].length})
                  </button>
                ))}
              </div>
            )}

            {/* Item list */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <p className="p-4 text-xs text-dsa-parchment-dark">Lade Daten...</p>
              ) : filtered.length === 0 ? (
                <p className="p-4 text-xs text-dsa-parchment-dark">Keine Einträge gefunden.</p>
              ) : (
                <div className="divide-y divide-dsa-bg-medium/30">
                  {filtered.map((item, i) => (
                    <button key={item.id || i} onClick={() => handleOpenDetail(item)}
                      className="w-full text-left px-3 py-2 hover:bg-dsa-bg-light/20 transition group">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-dsa-parchment">{item[config?.nameField] || item.id}</span>
                        <ChevronRight className="w-3 h-3 text-dsa-parchment-dark/30 group-hover:text-dsa-parchment-dark/60 transition-colors" />
                      </div>
                      {item.description && <p className="text-[9px] text-dsa-parchment-dark/60 truncate mt-0.5">{item.description.slice(0, 80)}</p>}
                      {item.probe && <span className="text-[9px] text-dsa-gold">{Array.isArray(item.probe) ? item.probe.join('/') : item.probe}</span>}
                      {item.ap_cost && <span className="text-[9px] text-dsa-parchment-dark ml-2">{item.ap_cost} AP</span>}
                      {item.price != null && <span className="text-[9px] text-dsa-parchment-dark ml-2">{item.price} Silber</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Detail popup — z-[80] sits above the DataBrowser modal */}
      {detailItem && (
        <DatenbankDetailModal
          data={detailData?.data || detailData}
          name={detailItem[config?.nameField] || detailItem.id}
          category={config?.category || 'items'}
          loading={detailLoading && !detailData}
          isOwn={false}
          onClose={() => { setDetailItem(null); setDetailData(null) }}
          onSelect={onSelect ? handleSelect : undefined}
        />
      )}
    </>
  )
}
