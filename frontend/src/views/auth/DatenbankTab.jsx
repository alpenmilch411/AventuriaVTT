import React, { useState, useCallback, useRef, useEffect } from 'react'
import {
  Search, Skull, Swords, Shield, ShieldHalf, Package, Sparkles, Star,
  Zap, BookOpen, Plus, Loader2, X, ChevronLeft, ChevronRight, ChevronDown,
  Pencil, Trash2, Menu, Database, Flame, Clock,
} from 'lucide-react'
import clsx from 'clsx'
import useDatenbankStore from '../../stores/datenbankStore'
import useAuthStore from '../../stores/authStore'
import CreateEntryModal from './CreateEntryModal'
import EditEntryModal from './EditEntryModal'
import DatenbankDetailModal, { CATEGORIES, CAT, CATEGORY_LABEL, CustomBadge } from '../../components/DatenbankDetail'

// ---------------------------------------------------------------------------
// Subcategory label mapping and field-name per top-level category
// ---------------------------------------------------------------------------

const SUBCAT_FIELD_LABEL = {
  creatures:         'Typ',
  weapons:           'Kampftechnik',
  items:             'Kategorie',
  spells:            'Tradition',
  liturgies:         'Gottheit',
  special_abilities: 'Kategorie',
  talents:           'Kategorie',
  combat_techniques: 'Typ',
}

const SUBCAT_LABELS = {
  // Creature types
  humanoid: 'Humanoid', tier: 'Tier', untot: 'Untot', daemon: 'Dämon',
  magisch: 'Magisch', feenwesen: 'Feenwesen', elementar: 'Elementar',
  konstrukt: 'Konstrukt', pflanze: 'Pflanze',
  // Item categories
  trank: 'Trank', heilkraut: 'Heilkraut', alchemie: 'Alchemie', munition: 'Munition',
  werkzeug: 'Werkzeug', licht: 'Licht', proviant: 'Proviant', schatz: 'Schatz',
  ausruestung: 'Ausrüstung', behaelter: 'Behälter', gift: 'Gift',
  verbrauchsmaterial: 'Verbrauchsmaterial', unterhaltung: 'Unterhaltung', krankheit: 'Krankheit',
  // Special ability categories
  nahkampf: 'Nahkampf', fernkampf: 'Fernkampf', allgemein: 'Allgemein',
  allgemein_nichtkampf: 'Allgemein (NK)', karmal: 'Karmal',
  // Talent categories
  körper: 'Körper', gesellschaft: 'Gesellschaft', natur: 'Natur',
  wissen: 'Wissen', handwerk: 'Handwerk',
}

function subcatLabel(val) {
  return SUBCAT_LABELS[val] || SUBCAT_LABELS[val?.toLowerCase()] || val
}

// ---------------------------------------------------------------------------
// Per-category preview text for list rows
// ---------------------------------------------------------------------------

function getPreviewText(category, entry) {
  switch (category) {
    case 'creatures': {
      const cv = entry.combat_values || {}
      const parts = []
      if (cv.LeP !== undefined) parts.push(`LeP ${cv.LeP}`)
      if (cv.RS !== undefined) parts.push(`RS ${cv.RS}`)
      if (cv.AT !== undefined) parts.push(`AT ${cv.AT}`)
      if (cv.GS !== undefined) parts.push(`GS ${cv.GS}`)
      return parts.join(' · ') || entry.category || ''
    }
    case 'weapons': {
      const parts = []
      if (entry.damage) parts.push(`TP ${entry.damage}`)
      if (entry.at_mod !== undefined) parts.push(`AT ${entry.at_mod >= 0 ? '+' : ''}${entry.at_mod}`)
      if (entry.reach) parts.push(`RW ${entry.reach}`)
      if (entry.combat_technique) parts.push(entry.combat_technique)
      return parts.join(' · ')
    }
    case 'armor': {
      const parts = []
      if (entry.rs !== undefined) parts.push(`RS ${entry.rs}`)
      if (entry.be !== undefined) parts.push(`BE ${entry.be}`)
      if (entry.weight) parts.push(`${entry.weight} Stn`)
      return parts.join(' · ')
    }
    case 'shields': {
      const parts = []
      if (entry.at_mod !== undefined) parts.push(`AT ${entry.at_mod >= 0 ? '+' : ''}${entry.at_mod}`)
      if (entry.pa_mod !== undefined) parts.push(`PA ${entry.pa_mod >= 0 ? '+' : ''}${entry.pa_mod}`)
      return parts.join(' · ')
    }
    case 'items': {
      const parts = []
      if (entry.category) parts.push(entry.category)
      if (entry.price) parts.push(`${entry.price} Silber`)
      return parts.join(' · ')
    }
    case 'spells': {
      const parts = []
      if (entry.probe) parts.push(Array.isArray(entry.probe) ? entry.probe.join('/') : entry.probe)
      if (entry.asp_cost) parts.push(`${entry.asp_cost} AsP`)
      if (entry.casting_time) parts.push(entry.casting_time)
      return parts.join(' · ')
    }
    case 'liturgies': {
      const parts = []
      if (entry.probe) parts.push(Array.isArray(entry.probe) ? entry.probe.join('/') : entry.probe)
      if (entry.kap_cost) parts.push(`${entry.kap_cost} KaP`)
      return parts.join(' · ')
    }
    case 'special_abilities': {
      const parts = []
      if (entry.category) parts.push(entry.category)
      if (entry.ap_cost) parts.push(`${entry.ap_cost} AP`)
      return parts.join(' · ')
    }
    case 'talents': {
      const parts = []
      if (entry.probe) parts.push(Array.isArray(entry.probe) ? entry.probe.join('/') : entry.probe)
      if (entry.category) parts.push(entry.category)
      return parts.join(' · ')
    }
    default: return ''
  }
}

// ---------------------------------------------------------------------------
// Compact list row — matches DataBrowser visual style
// ---------------------------------------------------------------------------

function EntryRow({ entry, category, onOpenDetail, onEdit, onDelete, isOwn }) {
  const cat = CAT[category] || CAT.items
  const CatIcon = cat.icon
  const preview = getPreviewText(category, entry)

  return (
    <button
      onClick={() => onOpenDetail(entry)}
      className="w-full text-left px-3 py-2.5 hover:bg-dsa-bg-light/20 transition-colors group"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <CatIcon className={clsx('w-3.5 h-3.5 flex-shrink-0', cat.iconColor)} />
          <span className={clsx('text-xs font-medium truncate', cat.titleColor)}>
            {entry.name}
          </span>
          {entry.is_custom && <CustomBadge mini />}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {isOwn && (
            <div className="hidden group-hover:flex items-center gap-0.5">
              <button
                onClick={(e) => { e.stopPropagation(); onEdit() }}
                className="p-1 text-dsa-parchment-dark/50 hover:text-dsa-gold transition-colors rounded"
                title="Bearbeiten"
              >
                <Pencil className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete() }}
                className="p-1 text-dsa-parchment-dark/50 hover:text-dsa-danger transition-colors rounded"
                title="Löschen"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          )}
          <ChevronRight className="w-3.5 h-3.5 text-dsa-parchment-dark/30 group-hover:text-dsa-parchment-dark/60 transition-colors" />
        </div>
      </div>
      {preview && (
        <p className="text-[10px] text-dsa-parchment-dark/60 ml-5 mt-0.5 truncate">{preview}</p>
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function DatenbankTab() {
  const category        = useDatenbankStore((s) => s.category)
  const entries         = useDatenbankStore((s) => s.entries)
  const totalEntries    = useDatenbankStore((s) => s.totalEntries)
  const page            = useDatenbankStore((s) => s.page)
  const perPage         = useDatenbankStore((s) => s.perPage)
  const searchQuery     = useDatenbankStore((s) => s.searchQuery)
  const customOnly      = useDatenbankStore((s) => s.customOnly)
  const subcategory     = useDatenbankStore((s) => s.subcategory)
  const subcategories   = useDatenbankStore((s) => s.subcategories)
  const loading         = useDatenbankStore((s) => s.loading)
  const error           = useDatenbankStore((s) => s.error)
  const setCategory     = useDatenbankStore((s) => s.setCategory)
  const setSearch       = useDatenbankStore((s) => s.setSearch)
  const setCustomOnly   = useDatenbankStore((s) => s.setCustomOnly)
  const setPage         = useDatenbankStore((s) => s.setPage)
  const setSubcategory  = useDatenbankStore((s) => s.setSubcategory)
  const fetchEntries    = useDatenbankStore((s) => s.fetchEntries)
  const fetchSubcategories = useDatenbankStore((s) => s.fetchSubcategories)
  const deleteEntry     = useDatenbankStore((s) => s.deleteEntry)

  const user = useAuthStore((s) => s.user)

  const [sidebarOpen, setSidebarOpen]     = useState(false)
  const [subcatsExpanded, setSubcatsExpanded] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingEntry, setEditingEntry]   = useState(null)
  const [localSearch, setLocalSearch]     = useState('')
  const debounceRef = useRef(null)

  // Detail modal state
  const [detailEntry, setDetailEntry]   = useState(null)   // list item (has name/id)
  const [detailData, setDetailData]     = useState(null)   // full fetched data
  const [detailLoading, setDetailLoading] = useState(false)
  const detailCacheRef = useRef({})

  useEffect(() => { fetchEntries(); fetchSubcategories() }, [fetchEntries, fetchSubcategories])

  // Reset detail when switching categories
  useEffect(() => {
    setDetailEntry(null)
    setDetailData(null)
  }, [category])

  const handleSearchChange = useCallback((e) => {
    const val = e.target.value
    setLocalSearch(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setSearch(val), 300)
  }, [setSearch])

  const handleClearSearch = useCallback(() => {
    setLocalSearch('')
    setSearch('')
  }, [setSearch])

  const handleCategoryClick = useCallback((catId) => {
    setCategory(catId)
    setLocalSearch('')
    setSidebarOpen(false)
  }, [setCategory])

  const handleOpenDetail = useCallback(async (entry) => {
    setDetailEntry(entry)
    setDetailData(null)

    const cacheKey = `${category}/${entry.id}`
    if (detailCacheRef.current[cacheKey]) {
      setDetailData(detailCacheRef.current[cacheKey])
      return
    }

    setDetailLoading(true)
    try {
      const token = useAuthStore.getState().token
      const res = await fetch(`/api/databank/${category}/${entry.id}`, {
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
  }, [category])

  const handleCloseDetail = useCallback(() => {
    setDetailEntry(null)
    setDetailData(null)
  }, [])

  const handleDelete = useCallback(async (entry) => {
    if (!window.confirm(`"${entry.name}" wirklich löschen?`)) return
    await deleteEntry(category, entry.id)
  }, [deleteEntry, category])

  const totalPages = Math.max(1, Math.ceil(totalEntries / perPage))
  const activeCat = CAT[category] || CAT.items

  return (
    <div className="flex -mx-4 -mt-6" style={{ height: 'calc(100vh - 120px)' }}>
      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed bottom-4 right-4 z-30 bg-dsa-gold text-dsa-bg p-3 rounded-full shadow-lg"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Category sidebar */}
      <aside
        className={clsx(
          'w-48 flex-shrink-0 bg-dsa-bg border-r border-dsa-bg-medium flex flex-col overflow-hidden',
          'fixed lg:static inset-y-0 left-0 z-20 transition-transform lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        style={{ top: 'auto', height: '100%' }}
      >
        <div className="px-3 py-2.5 border-b border-dsa-bg-medium">
          <div className="flex items-center gap-2">
            <Database className="w-3.5 h-3.5 text-dsa-gold/60" />
            <span className="text-[10px] font-semibold text-dsa-gold uppercase tracking-wider">Datenbank</span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-1">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon
            const isActive = category === cat.id
            const hasSubs = isActive && subcategories.length > 0
            return (
              <div key={cat.id}>
                <button
                  onClick={() => {
                    if (isActive && hasSubs) {
                      setSubcatsExpanded(v => !v)
                    } else {
                      handleCategoryClick(cat.id)
                      setSubcatsExpanded(true)
                    }
                  }}
                  className={clsx(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors',
                    isActive
                      ? cat.activeStyle
                      : 'text-dsa-parchment-dark border-l-4 border-l-transparent hover:bg-dsa-bg-medium/50 hover:text-dsa-parchment',
                  )}
                >
                  <Icon className={clsx('w-3.5 h-3.5 flex-shrink-0', isActive ? cat.titleColor : 'text-dsa-parchment-dark/60')} />
                  <span className="flex-1 text-left">{cat.label}</span>
                  {hasSubs && (
                    <ChevronDown className={clsx('w-3 h-3 transition-transform flex-shrink-0', subcatsExpanded ? '' : '-rotate-90')} />
                  )}
                </button>

                {/* Collapsible subcategory sub-items */}
                {hasSubs && subcatsExpanded && (
                  <div className="border-l-4 border-l-transparent ml-0">
                    <button
                      onClick={() => setSubcategory(null)}
                      className={clsx(
                        'w-full text-left pl-8 pr-3 py-1 text-[10px] transition-colors',
                        !subcategory
                          ? `${cat.titleColor} font-semibold bg-dsa-bg-medium/30`
                          : 'text-dsa-parchment-dark/60 hover:text-dsa-parchment',
                      )}
                    >
                      Alle ({subcategories.reduce((s, x) => s + x.count, 0)})
                    </button>
                    {subcategories.map(({ value, count }) => (
                      <button
                        key={value}
                        onClick={() => setSubcategory(subcategory === value ? null : value)}
                        className={clsx(
                          'w-full text-left pl-8 pr-3 py-1 text-[10px] transition-colors',
                          subcategory === value
                            ? `${cat.titleColor} font-semibold bg-dsa-bg-medium/30`
                            : 'text-dsa-parchment-dark/60 hover:text-dsa-parchment',
                        )}
                      >
                        {subcatLabel(value)}
                        <span className="ml-1 opacity-40">{count}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <div className="px-3 py-2 border-t border-dsa-bg-medium">
          <p className="text-[10px] text-dsa-parchment-dark/50 text-center">
            {totalEntries} {totalEntries === 1 ? 'Eintrag' : 'Einträge'}
          </p>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-10 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-dsa-bg-medium bg-dsa-bg-light/20">
          <activeCat.icon className={clsx('w-4 h-4 shrink-0', activeCat.titleColor)} />
          <span className={clsx('text-xs font-medium shrink-0', activeCat.titleColor)}>
            {CATEGORY_LABEL[category]}
          </span>
          <div className="w-px h-4 bg-dsa-bg-medium mx-0.5" />
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dsa-parchment-dark/40" />
            <input
              type="text"
              value={localSearch}
              onChange={handleSearchChange}
              placeholder="Suchen..."
              className="input-field pl-7 pr-7 py-1 text-xs w-full"
            />
            {localSearch && (
              <button
                onClick={handleClearSearch}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-dsa-parchment-dark/50 hover:text-dsa-parchment"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <label className="flex items-center gap-1.5 text-[10px] text-dsa-parchment-dark cursor-pointer whitespace-nowrap">
            <input
              type="checkbox"
              checked={customOnly}
              onChange={(e) => setCustomOnly(e.target.checked)}
              className="rounded border-dsa-bg-medium bg-dsa-bg-card text-dsa-gold focus:ring-dsa-gold/50"
            />
            Spieler
          </label>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary flex items-center gap-1 py-1 px-2 text-xs whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Neu</span>
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="m-3 p-2.5 bg-dsa-danger/10 border border-dsa-danger/30 rounded-lg text-xs text-dsa-danger">
              {error}
            </div>
          )}

          {entries.length === 0 && loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-7 h-7 animate-spin text-dsa-gold mb-3" />
              <p className="text-xs text-dsa-parchment-dark">Lade {CATEGORY_LABEL[category]}…</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-4">
              <activeCat.icon className="w-12 h-12 text-dsa-gold/15 mb-4" />
              <p className={clsx('text-base font-display font-semibold mb-1.5', activeCat.titleColor)}>
                {searchQuery || customOnly ? 'Keine Treffer' : `Keine ${CATEGORY_LABEL[category]}`}
              </p>
              <p className="text-xs text-dsa-parchment-dark/60 max-w-xs">
                {searchQuery
                  ? `Keine Einträge für „${searchQuery}" gefunden.`
                  : customOnly
                  ? 'Noch keine Spieler-Beiträge in dieser Kategorie.'
                  : `Noch keine ${CATEGORY_LABEL[category]} in der Datenbank.`}
              </p>
              {!searchQuery && !customOnly && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="btn-secondary mt-4 flex items-center gap-1.5 text-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Ersten Eintrag anlegen
                </button>
              )}
            </div>
          ) : (
            <>
              {(searchQuery || customOnly) && (
                <p className="text-[10px] text-dsa-parchment-dark/50 px-3 pt-2 pb-1">
                  {totalEntries} {totalEntries === 1 ? 'Ergebnis' : 'Ergebnisse'}
                  {searchQuery && <> für „{searchQuery}"</>}
                </p>
              )}

              <div className="divide-y divide-dsa-bg-medium/40">
                {entries.map((entry) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    category={category}
                    onOpenDetail={handleOpenDetail}
                    onEdit={() => setEditingEntry(entry)}
                    onDelete={() => handleDelete(entry)}
                    isOwn={entry.is_custom && entry.created_by_user_id === user?.id}
                  />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 py-4 border-t border-dsa-bg-medium/40">
                  <button
                    onClick={() => setPage(page - 1)}
                    disabled={page <= 1}
                    className="p-1.5 text-dsa-parchment-dark hover:text-dsa-gold disabled:opacity-30 disabled:cursor-not-allowed transition-colors hover:bg-dsa-bg-medium rounded"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      const p = totalPages <= 7 ? i + 1 : i < 3 ? i + 1 : i === 3 ? null : totalPages - 6 + i
                      if (p === null) return <span key="ellipsis" className="text-dsa-parchment-dark/40 px-1 text-xs">…</span>
                      return (
                        <button
                          key={p}
                          onClick={() => setPage(p)}
                          className={clsx(
                            'w-7 h-7 rounded text-xs transition-colors',
                            p === page
                              ? 'bg-dsa-gold text-dsa-bg font-semibold'
                              : 'text-dsa-parchment-dark hover:text-dsa-parchment hover:bg-dsa-bg-medium'
                          )}
                        >
                          {p}
                        </button>
                      )
                    })}
                  </div>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={page >= totalPages}
                    className="p-1.5 text-dsa-parchment-dark hover:text-dsa-gold disabled:opacity-30 disabled:cursor-not-allowed transition-colors hover:bg-dsa-bg-medium rounded"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Detail popup modal */}
      {detailEntry && (
        <DatenbankDetailModal
          data={detailData?.data || detailData}
          name={detailEntry.name}
          category={category}
          loading={detailLoading && !detailData}
          isOwn={detailEntry.is_custom && detailEntry.created_by_user_id === user?.id}
          onClose={handleCloseDetail}
          onEdit={() => { handleCloseDetail(); setEditingEntry(detailEntry) }}
          onDelete={() => { handleCloseDetail(); handleDelete(detailEntry) }}
        />
      )}

      {/* Create / Edit modals */}
      {showCreateModal && (
        <CreateEntryModal category={category} onClose={() => setShowCreateModal(false)} />
      )}
      {editingEntry && (
        <EditEntryModal category={category} entry={editingEntry} onClose={() => setEditingEntry(null)} />
      )}
    </div>
  )
}
