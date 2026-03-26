import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Search, BookOpen, Scroll, AlertTriangle, ChevronDown, ChevronRight,
  Loader2, X, Swords, Wand2, Shield, Package, Sparkles, ListTree,
  Menu, Heart, Wind, Flame, Star,
} from 'lucide-react'
import clsx from 'clsx'
import useWikiStore from '../../stores/wikiStore'
import MarkdownRenderer, { extractHeadings } from '../../components/common/MarkdownRenderer'

const CATEGORY_META = {
  'app-guide': { label: 'App-Handbuch', icon: BookOpen },
  rules: { label: 'DSA5 Regeln', icon: Scroll },
  limitations: { label: 'Einschränkungen', icon: AlertTriangle },
}

const TYPE_BADGES = {
  wiki: { label: 'Wiki', color: 'bg-dsa-gold/20 text-dsa-gold' },
  creature: { label: 'Kreatur', color: 'bg-dsa-blood/30 text-red-400' },
  creatures: { label: 'Kreatur', color: 'bg-dsa-blood/30 text-red-400' },
  spell: { label: 'Zauber', color: 'bg-dsa-mana/30 text-dsa-mana-light' },
  spells: { label: 'Zauber', color: 'bg-dsa-mana/30 text-dsa-mana-light' },
  liturgy: { label: 'Liturgie', color: 'bg-dsa-karma/30 text-dsa-karma-light' },
  liturgies: { label: 'Liturgie', color: 'bg-dsa-karma/30 text-dsa-karma-light' },
  weapon: { label: 'Waffe', color: 'bg-dsa-rust/30 text-dsa-rust-light' },
  weapons: { label: 'Waffe', color: 'bg-dsa-rust/30 text-dsa-rust-light' },
  armor: { label: 'Rüstung', color: 'bg-dsa-bg-medium text-dsa-parchment' },
  shield: { label: 'Schild', color: 'bg-dsa-bg-medium text-dsa-parchment' },
  shields: { label: 'Schild', color: 'bg-dsa-bg-medium text-dsa-parchment' },
  item: { label: 'Gegenstand', color: 'bg-dsa-forest/30 text-dsa-forest-light' },
  items: { label: 'Gegenstand', color: 'bg-dsa-forest/30 text-dsa-forest-light' },
  special_ability: { label: 'SF', color: 'bg-dsa-gold/20 text-dsa-gold-light' },
  special_abilities: { label: 'SF', color: 'bg-dsa-gold/20 text-dsa-gold-light' },
  talent: { label: 'Talent', color: 'bg-dsa-bg-medium text-dsa-parchment-dark' },
  talents: { label: 'Talent', color: 'bg-dsa-bg-medium text-dsa-parchment-dark' },
  combat_technique: { label: 'KT', color: 'bg-dsa-rust/20 text-dsa-rust-light' },
  combat_techniques: { label: 'KT', color: 'bg-dsa-rust/20 text-dsa-rust-light' },
  rules: { label: 'Regel', color: 'bg-dsa-gold/20 text-dsa-gold' },
}

function TypeBadge({ type }) {
  const badge = TYPE_BADGES[type] || { label: type, color: 'bg-dsa-bg-medium text-dsa-parchment-dark' }
  return (
    <span className={clsx('text-[10px] px-1.5 py-0.5 rounded font-medium', badge.color)}>
      {badge.label}
    </span>
  )
}

// --- DataBank Detail Cards ---

function InfoRow({ label, value }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex items-baseline gap-2 py-1 border-b border-dsa-bg-medium/50 last:border-0">
      <span className="text-xs text-dsa-parchment-dark w-32 shrink-0">{label}</span>
      <span className="text-sm text-dsa-parchment font-medium">{value}</span>
    </div>
  )
}

function CreatureCard({ entry }) {
  const { name, data } = entry
  const attrs = data.attributes || {}
  const cv = data.combat_values || {}
  const ATTR_KEYS = ['MU', 'KL', 'IN', 'CH', 'FF', 'GE', 'KO', 'KK']
  const { LeP, RS, GS, ...otherCv } = cv

  return (
    <div className="fantasy-card-gold max-w-2xl overflow-hidden">
      {/* Hero */}
      <div className="px-6 pt-6 pb-4 bg-gradient-to-r from-dsa-gold/10 via-dsa-gold/5 to-transparent border-b border-dsa-bg-medium">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-dsa-bg/40 border border-dsa-bg-medium">
            <Skull className="w-6 h-6 text-dsa-gold/60" />
          </div>
          <div>
            <h2 className="text-xl font-display font-bold text-dsa-gold">{name}</h2>
            {data.category && (
              <p className="text-xs text-dsa-parchment-dark">
                {data.category}{data.size ? ` · Größe ${data.size}` : ''}
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="p-6">
        {(LeP !== undefined || RS !== undefined || GS !== undefined) && (
          <div className="grid grid-cols-3 gap-3 mb-5">
            {LeP !== undefined && (
              <div className="bg-dsa-blood/10 border border-dsa-blood/20 rounded-lg p-3 text-center">
                <Heart className="w-4 h-4 text-red-400 mx-auto mb-1" />
                <div className="text-2xl font-bold text-red-400">{LeP}</div>
                <div className="text-[10px] text-dsa-parchment-dark uppercase">LeP</div>
              </div>
            )}
            {RS !== undefined && (
              <div className="bg-dsa-bg-medium/60 border border-dsa-bg-medium rounded-lg p-3 text-center">
                <Shield className="w-4 h-4 text-dsa-parchment-dark mx-auto mb-1" />
                <div className="text-2xl font-bold text-dsa-parchment">{RS}</div>
                <div className="text-[10px] text-dsa-parchment-dark uppercase">RS</div>
              </div>
            )}
            {GS !== undefined && (
              <div className="bg-dsa-bg-medium/60 border border-dsa-bg-medium rounded-lg p-3 text-center">
                <Wind className="w-4 h-4 text-dsa-parchment-dark mx-auto mb-1" />
                <div className="text-2xl font-bold text-dsa-parchment">{GS}</div>
                <div className="text-[10px] text-dsa-parchment-dark uppercase">GS</div>
              </div>
            )}
          </div>
        )}
        {data.description && (
          <p className="text-sm text-dsa-parchment-dark mb-4 leading-relaxed italic border-l-2 border-dsa-gold/30 pl-3">
            {data.description}
          </p>
        )}
        {Object.keys(otherCv).length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-dsa-parchment-dark uppercase tracking-wide mb-2 border-b border-dsa-bg-medium pb-1">Kampfwerte</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(otherCv).map(([k, v]) => (
                <span key={k} className="stat-pill">
                  <span className="text-dsa-gold font-semibold">{k}</span> {v}
                </span>
              ))}
            </div>
          </div>
        )}
        {Object.keys(attrs).length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-dsa-parchment-dark uppercase tracking-wide mb-2 border-b border-dsa-bg-medium pb-1">Attribute</h3>
            <div className="flex flex-wrap gap-2">
              {ATTR_KEYS.map(k => attrs[k] !== undefined && (
                <span key={k} className="stat-pill"><span className="text-dsa-gold font-semibold">{k}</span> {attrs[k]}</span>
              ))}
            </div>
          </div>
        )}
        {data.attacks && data.attacks.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-dsa-parchment-dark uppercase tracking-wide mb-2 border-b border-dsa-bg-medium pb-1">Angriffe</h3>
            <div className="space-y-2">
              {data.attacks.map((atk, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-dsa-bg-medium/30 rounded-lg">
                  <span className="text-sm font-medium text-dsa-parchment flex-1">{atk.name || `Angriff ${i + 1}`}</span>
                  {atk.AT && <span className="stat-pill"><span className="text-dsa-gold font-semibold">AT</span> {atk.AT}</span>}
                  {atk.TP && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-dsa-rust/15 border border-dsa-rust/25 text-dsa-rust-light text-xs font-bold"><Flame className="w-3 h-3" />{atk.TP}</span>}
                  {atk.reach && <span className="text-xs text-dsa-parchment-dark">RW {atk.reach}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
        {data.special_rules && data.special_rules.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-dsa-parchment-dark uppercase tracking-wide mb-2 border-b border-dsa-bg-medium pb-1">Sonderregeln</h3>
            <ul className="space-y-1">
              {data.special_rules.map((rule, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-dsa-parchment-dark">
                  <span className="text-dsa-gold/60 mt-0.5">◆</span>
                  {typeof rule === 'string' ? rule : rule.name || JSON.stringify(rule)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

function SpellCard({ entry }) {
  const { name, data } = entry
  const probe = Array.isArray(data.probe) ? data.probe : (data.probe ? data.probe.split('/') : [])
  return (
    <div className="fantasy-card max-w-2xl overflow-hidden">
      <div className="px-6 pt-6 pb-4 bg-gradient-to-r from-dsa-mana/12 via-dsa-mana/5 to-transparent border-b border-dsa-bg-medium">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-dsa-bg/40 border border-dsa-bg-medium">
            <Sparkles className="w-6 h-6 text-dsa-mana/60" />
          </div>
          <div>
            <h2 className="text-xl font-display font-bold text-dsa-mana-light">{name}</h2>
            {data.tradition && (
              <div className="flex flex-wrap gap-1 mt-1">
                {(Array.isArray(data.tradition) ? data.tradition : [data.tradition]).map((t, i) => (
                  <span key={i} className="text-[10px] bg-dsa-mana/10 text-dsa-mana-light border border-dsa-mana/20 px-1.5 py-0.5 rounded">{t}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="p-6">
        {(probe.length > 0 || data.asp_cost) && (
          <div className="flex items-center gap-4 mb-5 p-3 bg-dsa-mana/8 border border-dsa-mana/20 rounded-xl">
            {probe.length > 0 && (
              <div className="flex gap-1">
                {probe.map((attr, i) => (
                  <span key={i} className="px-2 py-1 bg-dsa-mana/15 border border-dsa-mana/30 rounded text-dsa-mana-light font-bold text-sm">
                    {attr}
                  </span>
                ))}
              </div>
            )}
            {data.asp_cost && (
              <div className="ml-auto flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-dsa-mana-light" />
                <span className="text-lg font-bold text-dsa-mana-light">{data.asp_cost}</span>
                <span className="text-xs text-dsa-parchment-dark">AsP</span>
              </div>
            )}
          </div>
        )}
        <div className="space-y-0 mb-4">
          <InfoRow label="Zauberdauer" value={data.casting_time} />
          <InfoRow label="Reichweite" value={data.range} />
          <InfoRow label="Wirkungsdauer" value={data.duration} />
          <InfoRow label="Ziel" value={data.target} />
          <InfoRow label="Schaden" value={data.damage} />
        </div>
        {data.description && (
          <p className="text-sm text-dsa-parchment-dark leading-relaxed italic border-l-2 border-dsa-mana/30 pl-3">
            {data.description}
          </p>
        )}
      </div>
    </div>
  )
}

function LiturgyCard({ entry }) {
  const { name, data } = entry
  const probe = Array.isArray(data.probe) ? data.probe : (data.probe ? data.probe.split('/') : [])
  return (
    <div className="fantasy-card max-w-2xl overflow-hidden">
      <div className="px-6 pt-6 pb-4 bg-gradient-to-r from-dsa-karma/12 via-dsa-karma/5 to-transparent border-b border-dsa-bg-medium">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-dsa-bg/40 border border-dsa-bg-medium">
            <Star className="w-6 h-6 text-dsa-karma/60" />
          </div>
          <h2 className="text-xl font-display font-bold text-dsa-karma-light">{name}</h2>
        </div>
      </div>
      <div className="p-6">
        {(probe.length > 0 || data.kap_cost) && (
          <div className="flex items-center gap-4 mb-5 p-3 bg-dsa-karma/8 border border-dsa-karma/20 rounded-xl">
            {probe.length > 0 && (
              <div className="flex gap-1">
                {probe.map((attr, i) => (
                  <span key={i} className="px-2 py-1 bg-dsa-karma/15 border border-dsa-karma/30 rounded text-dsa-karma-light font-bold text-sm">
                    {attr}
                  </span>
                ))}
              </div>
            )}
            {data.kap_cost && (
              <div className="ml-auto flex items-center gap-1.5">
                <Star className="w-4 h-4 text-dsa-karma-light" />
                <span className="text-lg font-bold text-dsa-karma-light">{data.kap_cost}</span>
                <span className="text-xs text-dsa-parchment-dark">KaP</span>
              </div>
            )}
          </div>
        )}
        <div className="space-y-0 mb-4">
          <InfoRow label="Liturgiedauer" value={data.casting_time} />
          <InfoRow label="Reichweite" value={data.range} />
          <InfoRow label="Wirkungsdauer" value={data.duration} />
          <InfoRow label="Ziel" value={data.target} />
        </div>
        {data.description && (
          <p className="text-sm text-dsa-parchment-dark leading-relaxed italic border-l-2 border-dsa-karma/30 pl-3">
            {data.description}
          </p>
        )}
      </div>
    </div>
  )
}

function WeaponCard({ entry }) {
  const { name, data } = entry
  return (
    <div className="fantasy-card max-w-2xl overflow-hidden">
      <div className="px-6 pt-6 pb-4 bg-gradient-to-r from-dsa-rust/12 via-dsa-rust/5 to-transparent border-b border-dsa-bg-medium">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-dsa-bg/40 border border-dsa-bg-medium">
            <Swords className="w-6 h-6 text-dsa-rust/60" />
          </div>
          <h2 className="text-xl font-display font-bold text-dsa-rust-light">{name}</h2>
        </div>
      </div>
      <div className="p-6">
        {data.damage && (
          <div className="flex items-center gap-4 mb-5 p-3 bg-dsa-rust/8 border border-dsa-rust/20 rounded-xl">
            <Flame className="w-6 h-6 text-dsa-rust-light/60" />
            <div>
              <div className="text-2xl font-bold text-dsa-rust-light">{data.damage}</div>
              <div className="text-[10px] text-dsa-parchment-dark uppercase tracking-wide">Trefferpunkte</div>
            </div>
            <div className="flex gap-2 ml-auto">
              {data.at_mod !== undefined && (
                <span className={clsx('text-sm font-bold px-2 py-1 rounded', data.at_mod >= 0 ? 'bg-dsa-success/10 text-dsa-success' : 'bg-dsa-danger/10 text-dsa-danger')}>
                  AT {data.at_mod >= 0 ? '+' : ''}{data.at_mod}
                </span>
              )}
              {data.pa_mod !== undefined && (
                <span className={clsx('text-sm font-bold px-2 py-1 rounded', data.pa_mod >= 0 ? 'bg-dsa-success/10 text-dsa-success' : 'bg-dsa-danger/10 text-dsa-danger')}>
                  PA {data.pa_mod >= 0 ? '+' : ''}{data.pa_mod}
                </span>
              )}
            </div>
          </div>
        )}
        <div className="space-y-0 mb-4">
          <InfoRow label="Kampftechnik" value={data.combat_technique} />
          <InfoRow label="Reichweite" value={data.reach} />
          <InfoRow label="Gewicht" value={data.weight ? `${data.weight} Stn` : undefined} />
          <InfoRow label="Preis" value={data.price ? `${data.price} Silber` : undefined} />
        </div>
        {data.properties && data.properties.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {data.properties.map((p, i) => (
              <span key={i} className="text-xs bg-dsa-bg-medium text-dsa-parchment-dark border border-dsa-bg-medium px-2 py-0.5 rounded">{p}</span>
            ))}
          </div>
        )}
        {data.description && (
          <p className="text-sm text-dsa-parchment-dark mt-3 leading-relaxed italic border-l-2 border-dsa-rust/30 pl-3">
            {data.description}
          </p>
        )}
      </div>
    </div>
  )
}

function ArmorCard({ entry }) {
  const { name, data } = entry
  return (
    <div className="fantasy-card max-w-2xl overflow-hidden">
      <div className="px-6 pt-6 pb-4 bg-gradient-to-r from-dsa-parchment/6 to-transparent border-b border-dsa-bg-medium">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-dsa-bg/40 border border-dsa-bg-medium">
            <Shield className="w-6 h-6 text-dsa-parchment/40" />
          </div>
          <h2 className="text-xl font-display font-bold text-dsa-parchment">{name}</h2>
        </div>
      </div>
      <div className="p-6">
        {(data.rs !== undefined || data.be !== undefined) && (
          <div className="flex gap-3 mb-5">
            {data.rs !== undefined && (
              <div className="flex-1 bg-dsa-bg-medium/60 border border-dsa-bg-medium rounded-xl p-4 text-center">
                <Shield className="w-5 h-5 text-dsa-parchment-dark mx-auto mb-1" />
                <div className="text-2xl font-bold text-dsa-parchment">{data.rs}</div>
                <div className="text-[10px] text-dsa-parchment-dark uppercase">RS</div>
              </div>
            )}
            {data.be !== undefined && (
              <div className="flex-1 bg-dsa-bg-medium/60 border border-dsa-bg-medium rounded-xl p-4 text-center">
                <Wind className="w-5 h-5 text-dsa-parchment-dark mx-auto mb-1" />
                <div className="text-2xl font-bold text-dsa-parchment">{data.be}</div>
                <div className="text-[10px] text-dsa-parchment-dark uppercase">BE</div>
              </div>
            )}
          </div>
        )}
        <div className="space-y-0">
          <InfoRow label="Gewicht" value={data.weight ? `${data.weight} Stn` : undefined} />
          <InfoRow label="Preis" value={data.price ? `${data.price} Silber` : undefined} />
        </div>
        {data.description && (
          <p className="text-sm text-dsa-parchment-dark mt-3 leading-relaxed italic border-l-2 border-dsa-parchment/20 pl-3">
            {data.description}
          </p>
        )}
      </div>
    </div>
  )
}

function GenericCard({ entry }) {
  const { name, data, type } = entry
  return (
    <div className="fantasy-card max-w-2xl overflow-hidden">
      <div className="px-6 pt-6 pb-4 bg-gradient-to-r from-dsa-gold/8 to-transparent border-b border-dsa-bg-medium">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-display font-bold text-dsa-gold">{name}</h2>
          <TypeBadge type={type} />
        </div>
      </div>
      <div className="p-6">
        {data.probe && (
          <div className="mb-4 p-3 bg-dsa-bg-medium/60 border border-dsa-bg-medium rounded-xl">
            <div className="text-xs text-dsa-parchment-dark mb-1">Probe</div>
            <div className="font-bold text-dsa-parchment">
              {Array.isArray(data.probe) ? data.probe.join('/') : data.probe}
            </div>
          </div>
        )}
        {data.description && <p className="text-sm text-dsa-parchment-dark mb-3 leading-relaxed">{data.description}</p>}
        {data.rules_text && <p className="text-sm text-dsa-parchment-dark mb-3 leading-relaxed">{data.rules_text}</p>}
        {data.category && <p className="text-xs text-dsa-parchment-dark">Kategorie: {data.category}</p>}
      </div>
    </div>
  )
}

function DataEntryCard({ entry }) {
  if (!entry) return null
  const t = entry.type
  if (t === 'creatures' || t === 'creature') return <CreatureCard entry={entry} />
  if (t === 'spells' || t === 'spell') return <SpellCard entry={entry} />
  if (t === 'liturgies' || t === 'liturgy') return <LiturgyCard entry={entry} />
  if (t === 'weapons' || t === 'weapon') return <WeaponCard entry={entry} />
  if (t === 'armor' || t === 'shields' || t === 'shield') return <ArmorCard entry={entry} />
  return <GenericCard entry={entry} />
}

// --- Main WikiTab ---

export default function WikiTab() {
  const pages = useWikiStore((s) => s.pages)
  const activePage = useWikiStore((s) => s.activePage)
  const activeDataEntry = useWikiStore((s) => s.activeDataEntry)
  const searchQuery = useWikiStore((s) => s.searchQuery)
  const searchResults = useWikiStore((s) => s.searchResults)
  const searchLoading = useWikiStore((s) => s.searchLoading)
  const loading = useWikiStore((s) => s.loading)
  const fetchPages = useWikiStore((s) => s.fetchPages)
  const fetchPage = useWikiStore((s) => s.fetchPage)
  const fetchDataEntry = useWikiStore((s) => s.fetchDataEntry)
  const setSearchQuery = useWikiStore((s) => s.setSearchQuery)
  const clearSearch = useWikiStore((s) => s.clearSearch)

  const [collapsedCategories, setCollapsedCategories] = useState({})
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const contentRef = useRef(null)

  useEffect(() => {
    fetchPages()
  }, [fetchPages])

  const toggleCategory = (cat) => {
    setCollapsedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }))
  }

  const handlePageClick = useCallback((slug) => {
    fetchPage(slug)
    setSidebarOpen(false)
  }, [fetchPage])

  const handleSearchResultClick = useCallback((result) => {
    if (result.type === 'wiki') {
      fetchPage(result.slug)
    } else {
      // Databank entry — map singular types to plural for the API
      const typeMap = {
        creature: 'creatures', spell: 'spells', weapon: 'weapons',
        armor: 'armor', shield: 'shields', item: 'items',
        liturgy: 'liturgies', special_ability: 'special_abilities',
        talent: 'talents', combat_technique: 'combat_techniques', rules: 'rules',
      }
      const apiType = typeMap[result.type] || result.type
      fetchDataEntry(apiType, result.id)
    }
    clearSearch()
    setSidebarOpen(false)
  }, [fetchPage, fetchDataEntry, clearSearch])

  const handleTocClick = useCallback((id) => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  // Group pages by category
  const grouped = {}
  for (const cat of Object.keys(CATEGORY_META)) {
    grouped[cat] = []
  }
  for (const page of pages) {
    if (grouped[page.category]) {
      grouped[page.category].push(page)
    }
  }
  // Sort each group by sort_order
  for (const cat of Object.keys(grouped)) {
    grouped[cat].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  }

  const headings = activePage ? extractHeadings(activePage.content) : []
  const isSearching = searchQuery.length >= 2

  return (
    <div className="flex -mx-4 -mt-6" style={{ height: 'calc(100vh - 120px)' }}>
      {/* Mobile menu button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed bottom-4 right-4 z-30 bg-dsa-gold text-dsa-bg p-3 rounded-full shadow-lg"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Sidebar */}
      <aside
        className={clsx(
          'w-64 flex-shrink-0 bg-dsa-bg border-r border-dsa-bg-medium flex flex-col overflow-hidden',
          'fixed lg:static inset-y-0 left-0 z-20 transition-transform lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        style={{ top: 'auto', height: '100%' }}
      >
        {/* Search */}
        <div className="p-3 border-b border-dsa-bg-medium">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-dsa-parchment-dark/50" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Suchen..."
              className="input-field pl-9 pr-8 py-1.5 text-sm"
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-dsa-parchment-dark/50 hover:text-dsa-parchment"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Search results */}
          {isSearching ? (
            <div className="p-2">
              {searchLoading ? (
                <div className="flex items-center justify-center py-6 text-dsa-parchment-dark">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  <span className="text-sm">Suche...</span>
                </div>
              ) : searchResults.length === 0 ? (
                <p className="text-sm text-dsa-parchment-dark/50 text-center py-6">Keine Ergebnisse</p>
              ) : (
                <div className="space-y-0.5">
                  {searchResults.map((result, i) => (
                    <button
                      key={`${result.type}-${result.slug || result.id}-${i}`}
                      onClick={() => handleSearchResultClick(result)}
                      className="w-full text-left px-3 py-2 rounded hover:bg-dsa-bg-medium transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <TypeBadge type={result.type} />
                        <span className="text-sm text-dsa-parchment truncate">
                          {result.title || result.name}
                        </span>
                      </div>
                      {result.excerpt && (
                        <p className="text-xs text-dsa-parchment-dark/60 mt-0.5 line-clamp-2">{result.excerpt}</p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Page list grouped by category */}
              <nav className="py-2">
                {Object.entries(CATEGORY_META).map(([cat, meta]) => {
                  const catPages = grouped[cat] || []
                  if (catPages.length === 0) return null
                  const Icon = meta.icon
                  const collapsed = collapsedCategories[cat]

                  return (
                    <div key={cat} className="mb-1">
                      <button
                        onClick={() => toggleCategory(cat)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-dsa-parchment-dark uppercase tracking-wider hover:text-dsa-parchment transition-colors"
                      >
                        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        <Icon className="w-3.5 h-3.5" />
                        {meta.label}
                      </button>
                      {!collapsed && (
                        <div className="space-y-0.5">
                          {catPages.map((page) => (
                            <button
                              key={page.slug}
                              onClick={() => handlePageClick(page.slug)}
                              className={clsx(
                                'w-full text-left px-6 py-1.5 text-sm transition-colors',
                                activePage?.slug === page.slug
                                  ? 'bg-dsa-bg-medium text-dsa-gold font-medium'
                                  : 'text-dsa-parchment-dark hover:text-dsa-parchment hover:bg-dsa-bg-medium/50'
                              )}
                            >
                              {page.title}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </nav>

              {/* Table of Contents for active page */}
              {headings.length > 0 && (
                <>
                  <div className="mx-3 border-t border-dsa-bg-medium" />
                  <div className="p-3">
                    <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-dsa-parchment-dark uppercase tracking-wider">
                      <ListTree className="w-3.5 h-3.5" />
                      Inhalt
                    </div>
                    <div className="space-y-0.5">
                      {headings.map((h, i) => (
                        <button
                          key={i}
                          onClick={() => handleTocClick(h.id)}
                          className={clsx(
                            'w-full text-left text-xs text-dsa-parchment-dark hover:text-dsa-gold transition-colors py-0.5',
                            h.level === 3 ? 'pl-4' : 'pl-1 font-medium'
                          )}
                        >
                          {h.text}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </aside>

      {/* Sidebar overlay on mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-10 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main ref={contentRef} className="flex-1 overflow-y-auto px-8 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-dsa-gold" />
          </div>
        ) : activeDataEntry ? (
          <DataEntryCard entry={activeDataEntry} />
        ) : activePage ? (
          <article className="max-w-3xl">
            <h1 className="text-2xl font-display font-bold text-dsa-gold mb-6">
              {activePage.title}
            </h1>
            <MarkdownRenderer content={activePage.content} />
          </article>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <BookOpen className="w-16 h-16 text-dsa-gold/20 mb-6" />
            <h2 className="text-2xl font-display font-bold text-dsa-gold mb-3">
              Willkommen im Wiki
            </h2>
            <p className="text-sm text-dsa-parchment-dark max-w-md leading-relaxed">
              Hier findest du Anleitungen zur App, DSA5-Regeln und weitere Informationen.
              Wähle eine Seite aus dem Menü oder nutze die Suche.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
