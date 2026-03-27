import { useState } from 'react'
import {
  X, Shield, Heart, Sparkles, Star, Swords, ScrollText, Award,
  Package, BookOpen, Languages, ChevronDown, ChevronUp, Eye,
  Wind, Zap, Brain, Target,
} from 'lucide-react'
import clsx from 'clsx'
import { SF_TOOLTIPS as SF_INFO, ADV_TOOLTIPS as ADV_INFO, DISADV_TOOLTIPS as DISADV_INFO } from '../../engine/tooltips'
import Badge from '../../components/common/Badge'
import ProgressBar from '../../components/common/ProgressBar'
import { TipAbbr } from '../../components/Tooltip'

// ── DSA5 Attribute explanations ──

const ATTR_INFO = {
  MU: { name: 'Mut', color: 'text-red-400', desc: 'Bestimmt Tapferkeit, Willenskraft und Entschlossenheit.', affects: 'INI-Basis, Seelenkraft (SK), viele Zauberproben, Selbstbeherrschung' },
  KL: { name: 'Klugheit', color: 'text-blue-400', desc: 'Steht für logisches Denken, Wissen und Lernfähigkeit.', affects: 'SK, Wissenstalente, Alchemie, viele Zauberproben' },
  IN: { name: 'Intuition', color: 'text-violet-400', desc: 'Bauchgefühl, Wahrnehmung und Menschenkenntnis.', affects: 'SK, Sinnesschärfe, Fährtensuchen, AsP-Berechnung' },
  CH: { name: 'Charisma', color: 'text-pink-400', desc: 'Ausstrahlung, Überzeugungskraft und persönliche Anziehung.', affects: 'Gesellschaftstalente, Betören, AsP-Berechnung' },
  FF: { name: 'Fingerfertigkeit', color: 'text-emerald-400', desc: 'Feinmotorik und Geschicklichkeit der Hände.', affects: 'Schlösserknacken, Taschendiebstahl, Handwerksproben' },
  GE: { name: 'Gewandtheit', color: 'text-cyan-400', desc: 'Körperliche Beweglichkeit und Reaktionsschnelligkeit.', affects: 'GS, AW, INI-Basis, Körperbeherrschung, Schleichen' },
  KO: { name: 'Konstitution', color: 'text-orange-400', desc: 'Körperliche Widerstandskraft und Ausdauer.', affects: 'LeP (KO x 2), ZK, Wundschwelle, Regeneration' },
  KK: { name: 'Körperkraft', color: 'text-amber-400', desc: 'Reine Muskelkraft und Tragvermögen.', affects: 'Schadensbonus, LeP, ZK, Tragkraft (KK x 2 Stein)' },
}

// ── Derived value formulas (with dynamic number insertion) ──

function getDerivedFormulas(attrs, derived, species) {
  const mu = attrs.MU || 0, kl = attrs.KL || 0, inn = attrs.IN || 0
  const ch = attrs.CH || 0, ge = attrs.GE || 0, ko = attrs.KO || 0, kk = attrs.KK || 0
  const skMod = species?.sk_modifier || derived?.SK_modifier || 0
  const zkMod = species?.zk_modifier || derived?.ZK_modifier || 0
  const lepBase = derived?.lep_base || 0

  return {
    LeP: { label: 'Lebenspunkte', icon: Heart, iconColor: 'text-red-400',
      desc: 'Wie viel Schaden dein Held aushalten kann. Bei 0 bewusstlos.',
      formula: `Spezies-Basis (${lepBase}) + KO (${ko}) x 2 = ${lepBase + ko * 2}`,
      affects: 'Unter Hälfte: Erschöpfung. Unter 0: Bewusstlos/Sterbend.' },
    AsP: { label: 'Astralpunkte', icon: Sparkles, iconColor: 'text-blue-400',
      desc: 'Magische Energie für Zauberwirken.',
      formula: `20 + (MU ${mu} + IN ${inn} + CH ${ch}) / 3 = ${20 + Math.round((mu + inn + ch) / 3)}`,
      affects: 'Werden bei Zaubern abgezogen. Regenerieren bei Rast.' },
    KaP: { label: 'Karmapunkte', icon: Star, iconColor: 'text-yellow-400',
      desc: 'Göttliche Energie für Liturgien.',
      formula: `20 + (MU ${mu} + KL ${kl} + IN ${inn}) / 3 = ${20 + Math.round((mu + kl + inn) / 3)}`,
      affects: 'Werden bei Liturgien abgezogen. Regenerieren durch Gebet.' },
    GS: { label: 'Geschwindigkeit', icon: Wind, iconColor: 'text-cyan-400',
      desc: 'Schritt pro Bewegungsaktion im Kampf.',
      formula: `Spezies-Basis = ${derived?.GS || 8}`,
      affects: 'Wird durch BE und Zustände reduziert. 1 Bewegungsaktion = GS Schritt.' },
    INI_basis: { label: 'Initiative (Basis)', icon: Zap, iconColor: 'text-yellow-400',
      desc: 'Handlungsreihenfolge zu Beginn jeder Kampfrunde.',
      formula: `(MU ${mu} + GE ${ge}) / 2 = ${Math.floor((mu + ge) / 2)}`,
      affects: 'Im Kampf: INI-Basis + 1W6. Höherer Wert handelt zuerst.' },
    AW: { label: 'Ausweichen', icon: Shield, iconColor: 'text-green-400',
      desc: 'Verteidigungswert ohne Waffe/Schild.',
      formula: `GE ${ge} / 2 = ${Math.floor(ge / 2)}`,
      affects: 'Alternative zu Parade. Erste Reaktion pro KR ohne SchiP-Kosten.' },
    WS: { label: 'Wundschwelle', icon: Heart, iconColor: 'text-red-400',
      desc: 'Ab diesem SP-Wert bei einem Treffer droht eine Wunde.',
      formula: `KO ${ko} / 2 (aufger.) = ${Math.ceil(ko / 2)}`,
      affects: 'Bei SP >= WS: KO-Probe oder 1 Stufe Schmerz.' },
    SB: { label: 'Schadensbonus', icon: Swords, iconColor: 'text-orange-400',
      desc: 'Zusätzlicher Nahkampfschaden durch Körperkraft.',
      formula: `max(0, (KK ${kk} - 15) / 3) = ${Math.max(0, Math.floor((kk - 15) / 3))}`,
      affects: 'Wird zu TP im Nahkampf addiert.' },
    SK: { label: 'Seelenkraft', icon: Brain, iconColor: 'text-purple-400',
      desc: 'Widerstand gegen mentale und magische Angriffe.',
      formula: `(MU ${mu} + KL ${kl} + IN ${inn}) / 3${skMod ? ` + Spezies-Mod (${skMod})` : ''} = ${Math.floor((mu + kl + inn) / 3) + skMod}`,
      affects: 'Erschwert feindliche Geistzauber und Beherrschungs-Liturgien.' },
    ZK: { label: 'Zähigkeit', icon: Shield, iconColor: 'text-orange-400',
      desc: 'Widerstand gegen körperliche Sondereffekte.',
      formula: `(KO ${ko} + KO ${ko} + KK ${kk}) / 3${zkMod ? ` + Spezies-Mod (${zkMod})` : ''} = ${Math.floor((ko + ko + kk) / 3) + zkMod}`,
      affects: 'Erschwert Vergiftungen, körperliche Zauber, Verwandlungen.' },
    SchiP: { label: 'Schicksalspunkte', icon: Star, iconColor: 'text-dsa-gold',
      desc: 'Glückspunkte für Extrareaktionen oder Würfelwurf-Wiederholungen.',
      formula: '3 (Standard)',
      affects: 'Zusatzreaktion, Probe wiederholen, Schaden halbieren, Zustand ignorieren.' },
  }
}

// ── Combat technique info ──
const COMBAT_INFO = {
  AT: 'Attackewert — Würfle 1W20 <= AT für einen Treffer.',
  PA: 'Paradewert — Würfle 1W20 <= PA um einen Angriff abzuwehren.',
  TP: 'Trefferpunkte — Schadenswürfel der Waffe.',
  RS: 'Rüstungsschutz — Wird von jedem erlittenen Schaden abgezogen.',
  BE: 'Behinderung — Malus durch schwere Rüstung auf GS, INI und körperliche Proben.',
}

// SF_INFO, ADV_INFO, DISADV_INFO imported from engine/tooltips

// ── Talent category info ──
const TALENT_CATEGORIES = {
  'Körpertalente': { color: 'text-orange-400', borderColor: 'border-l-orange-400' },
  'Gesellschaftstalente': { color: 'text-pink-400', borderColor: 'border-l-pink-400' },
  'Naturtalente': { color: 'text-green-400', borderColor: 'border-l-green-400' },
  'Wissenstalente': { color: 'text-blue-400', borderColor: 'border-l-blue-400' },
  'Handwerkstalente': { color: 'text-amber-400', borderColor: 'border-l-amber-400' },
}

const TALENT_MAPPING = {
  'Klettern': 'Körpertalente', 'Körperbeherrschung': 'Körpertalente', 'Kraftakt': 'Körpertalente',
  'Schwimmen': 'Körpertalente', 'Selbstbeherrschung': 'Körpertalente', 'Sinnesschärfe': 'Körpertalente',
  'Verbergen': 'Körpertalente', 'Zechen': 'Körpertalente',
  'Betören': 'Gesellschaftstalente', 'Einschüchtern': 'Gesellschaftstalente', 'Etikette': 'Gesellschaftstalente',
  'Gassenwissen': 'Gesellschaftstalente', 'Menschenkenntnis': 'Gesellschaftstalente', 'Überreden': 'Gesellschaftstalente',
  'Fährtensuchen': 'Naturtalente', 'Orientierung': 'Naturtalente', 'Pflanzenkunde': 'Naturtalente',
  'Tierkunde': 'Naturtalente', 'Wildnisleben': 'Naturtalente',
  'Geschichtswissen': 'Wissenstalente', 'Götter & Kulte': 'Wissenstalente', 'Magiekunde': 'Wissenstalente',
  'Mechanik': 'Wissenstalente', 'Rechtskunde': 'Wissenstalente', 'Sagen & Legenden': 'Wissenstalente',
  'Alchemie': 'Handwerkstalente', 'Heilkunde Krankheiten': 'Handwerkstalente', 'Heilkunde Wunden': 'Handwerkstalente',
  'Holzbearbeitung': 'Handwerkstalente', 'Kochen': 'Handwerkstalente', 'Lederbearbeitung': 'Handwerkstalente',
  'Metallbearbeitung': 'Handwerkstalente', 'Musizieren': 'Handwerkstalente', 'Schlösserknacken': 'Handwerkstalente',
  'Steinbearbeitung': 'Handwerkstalente', 'Taschendiebstahl': 'Handwerkstalente',
}

// ── Grade labels ──
const GRADE_LABELS = {
  unerfahren: 'Unerfahren', durchschnittlich: 'Durchschnittlich', erfahren: 'Erfahren',
  kompetent: 'Kompetent', meisterlich: 'Meisterlich', brillant: 'Brillant', legendaer: 'Legendär',
}

// ── Helper: Clickable info popup ──

function InfoPopup({ title, children, className = '' }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`relative inline-flex ${className}`}>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open) }}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-dsa-bg-medium/80 text-dsa-parchment-dark/60 hover:text-dsa-gold hover:bg-dsa-gold/10 transition-colors text-[9px] font-bold cursor-help"
      >
        ?
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 left-0 top-full mt-1 w-72 bg-dsa-bg-light border border-dsa-gold/30 rounded shadow-xl p-3 text-xs">
            {title && <div className="font-semibold text-dsa-gold mb-1">{title}</div>}
            <div className="text-dsa-parchment leading-relaxed">{children}</div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Expandable row ──

function ExpandRow({ label, value, badge, badgeVariant = 'gold', explanation, extra }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className={clsx(
      'rounded border transition-colors',
      expanded ? 'bg-dsa-bg-light border-dsa-gold/20' : 'bg-dsa-bg border-dsa-bg-medium hover:border-dsa-gold/10'
    )}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm text-dsa-parchment truncate">{label}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {badge && <Badge variant={badgeVariant} size="sm">{badge}</Badge>}
          {value != null && <span className="text-sm font-mono font-bold text-dsa-parchment">{value}</span>}
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-dsa-parchment-dark" /> : <ChevronDown className="w-3.5 h-3.5 text-dsa-parchment-dark" />}
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-dsa-bg-medium">
          <p className="text-xs text-dsa-parchment/80 mt-2 leading-relaxed">{explanation || 'Keine Beschreibung verfügbar.'}</p>
          {extra && <div className="mt-2">{extra}</div>}
        </div>
      )}
    </div>
  )
}

// ── Section tabs ──

const SECTIONS = [
  { id: 'overview', label: 'Übersicht', icon: Eye },
  { id: 'attributes', label: 'Eigenschaften', icon: Target },
  { id: 'derived', label: 'Abgeleitet', icon: Zap },
  { id: 'combat', label: 'Kampf', icon: Swords },
  { id: 'talents', label: 'Talente', icon: ScrollText },
  { id: 'magic', label: 'Magie', icon: Sparkles },
  { id: 'abilities', label: 'SF/Vor/Nach', icon: Award },
  { id: 'equipment', label: 'Ausrüstung', icon: Package },
  { id: 'profile', label: 'Profil', icon: BookOpen },
]

// ============================================================================
// Main CharacterViewer component
// ============================================================================

export default function CharacterViewer({ character, onClose }) {
  const [activeTab, setActiveTab] = useState('overview')

  if (!character) return null

  const attrs = character.attributes || {}
  const derived = character.derived_values || {}
  const combat = character.combat_values || {}
  const weapons = combat.weapons || []
  const talents = character.talents || {}
  const spells = character.spells || {}
  const liturgies = character.liturgies || {}
  const sfs = character.special_abilities || []
  const advantages = character.advantages || {}
  const disadvantages = character.disadvantages || {}
  const rawInv = character.basis_inventory || {}
  const inventory = Array.isArray(rawInv) ? rawInv : (rawInv.items || [])
  const languages = character.languages || []
  const gradeLabel = GRADE_LABELS[(character.experience_grade || '').toLowerCase()] || character.experience_grade || '—'

  const hasSpells = Object.keys(spells).length > 0
  const hasLiturgies = Object.keys(liturgies).length > 0

  // Filter sections based on character
  const visibleSections = SECTIONS.filter(s => {
    if (s.id === 'magic' && !hasSpells && !hasLiturgies) return false
    return true
  })

  const derivedFormulas = getDerivedFormulas(attrs, derived, null)

  // ── Render advantage/disadvantage entries ──
  const renderAdvDisadv = (obj, infoMap, variant) => {
    const entries = typeof obj === 'object' && !Array.isArray(obj)
      ? Object.entries(obj)
      : (Array.isArray(obj) ? obj.map(v => [v, {}]) : [])

    if (entries.length === 0) return <div className="text-xs text-dsa-parchment-dark">Keine</div>

    return entries.map(([name, data], i) => {
      const apStr = data?.ap ? `${data.ap} AP` : null
      const autoStr = data?.auto ? ' (automatisch)' : ''
      const info = Object.entries(infoMap).find(([k]) => name.toLowerCase().includes(k.toLowerCase()))?.[1]
      return (
        <ExpandRow
          key={`${name}-${i}`}
          label={`${name}${autoStr}`}
          badge={apStr}
          badgeVariant={variant}
          explanation={info || `${name}: Tippe für Details.`}
        />
      )
    })
  }

  // ── Group talents by category ──
  const groupedTalents = {}
  for (const [name, fw] of Object.entries(talents)) {
    const cat = TALENT_MAPPING[name] || 'Sonstige'
    if (!groupedTalents[cat]) groupedTalents[cat] = []
    groupedTalents[cat].push({ name, fw })
  }
  // Sort each group by FW descending
  for (const cat of Object.keys(groupedTalents)) {
    groupedTalents[cat].sort((a, b) => b.fw - a.fw)
  }

  return (
    <div className="fixed inset-0 z-50 bg-dsa-bg flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 bg-dsa-bg-light border-b border-dsa-bg-medium px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {character.portrait_url ? (
              <img src={character.portrait_url} alt={character.name}
                className="w-10 h-10 rounded object-cover border border-dsa-bg-medium flex-shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded bg-dsa-bg-medium border border-dsa-bg-medium flex items-center justify-center flex-shrink-0">
                <Shield className="w-5 h-5 text-dsa-gold" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-base font-display font-bold text-dsa-gold truncate">{character.name}</h1>
              <p className="text-xs text-dsa-parchment-dark truncate">
                {[character.species, character.profession].filter(Boolean).join(' · ')} · {gradeLabel}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs font-mono text-dsa-parchment-dark hidden sm:block">
              <span className="text-dsa-gold font-bold">{character.available_ap || 0}</span>
              <span> / {character.total_ap || 0} AP</span>
            </div>
            <button onClick={onClose} className="p-1 text-dsa-parchment-dark hover:text-dsa-parchment transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Vitals bar */}
      <div className="flex-shrink-0 bg-dsa-bg-card border-b border-dsa-bg-medium px-4 py-2">
        <div className="max-w-4xl mx-auto space-y-1.5">
          <div className="flex items-center gap-2">
            <Heart className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
            <TipAbbr term="LeP" className="text-[10px] text-dsa-parchment-dark w-7" />
            <div className="flex-1"><ProgressBar current={derived.LeP_max} max={derived.LeP_max} variant="health" size="sm" showValues={false} /></div>
            <span className="text-[10px] text-dsa-parchment font-mono w-14 text-right">{derived.LeP_max}/{derived.LeP_max}</span>
            <InfoPopup title="Lebenspunkte (LeP)">{derivedFormulas.LeP.formula}</InfoPopup>
          </div>
          {derived.AsP_max > 0 && (
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
              <TipAbbr term="AsP" className="text-[10px] text-dsa-parchment-dark w-7" />
              <div className="flex-1"><ProgressBar current={derived.AsP_max} max={derived.AsP_max} variant="mana" size="sm" showValues={false} /></div>
              <span className="text-[10px] text-dsa-parchment font-mono w-14 text-right">{derived.AsP_max}/{derived.AsP_max}</span>
              <InfoPopup title="Astralpunkte (AsP)">{derivedFormulas.AsP.formula}</InfoPopup>
            </div>
          )}
          {derived.KaP_max > 0 && (
            <div className="flex items-center gap-2">
              <Star className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
              <TipAbbr term="KaP" className="text-[10px] text-dsa-parchment-dark w-7" />
              <div className="flex-1"><ProgressBar current={derived.KaP_max} max={derived.KaP_max} variant="karma" size="sm" showValues={false} /></div>
              <span className="text-[10px] text-dsa-parchment font-mono w-14 text-right">{derived.KaP_max}/{derived.KaP_max}</span>
              <InfoPopup title="Karmapunkte (KaP)">{derivedFormulas.KaP.formula}</InfoPopup>
            </div>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex-shrink-0 bg-dsa-bg border-b border-dsa-bg-medium px-4">
        <div className="max-w-4xl mx-auto flex overflow-x-auto gap-1 py-1 scrollbar-hide">
          {visibleSections.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveTab(s.id)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap transition-colors',
                activeTab === s.id
                  ? 'bg-dsa-gold/20 text-dsa-gold'
                  : 'text-dsa-parchment-dark hover:text-dsa-parchment'
              )}
            >
              <s.icon className="w-3.5 h-3.5" />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-4">

          {/* ── OVERVIEW ── */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Character identity card */}
              <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4">
                <div className="flex items-start gap-4">
                  {character.portrait_url ? (
                    <img src={character.portrait_url} alt={character.name}
                      className="w-20 h-20 rounded object-cover border border-dsa-bg-medium flex-shrink-0" />
                  ) : (
                    <div className="w-20 h-20 rounded bg-dsa-bg-medium border border-dsa-bg-medium flex items-center justify-center flex-shrink-0">
                      <Shield className="w-8 h-8 text-dsa-gold/40" />
                    </div>
                  )}
                  <div className="space-y-1">
                    <h2 className="text-xl font-display font-bold text-dsa-parchment">{character.name}</h2>
                    <div className="text-xs text-dsa-parchment-dark space-y-0.5">
                      <p>Spezies: <span className="text-dsa-parchment">{character.species || '—'}</span></p>
                      <p>Kultur: <span className="text-dsa-parchment">{character.culture || '—'}</span></p>
                      <p>Profession: <span className="text-dsa-parchment">{character.profession || '—'}</span></p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <Badge variant="gold" size="sm">{gradeLabel}</Badge>
                      <Badge variant="gold" size="sm">{character.total_ap || 0} AP gesamt</Badge>
                      {(character.available_ap || 0) > 0 && (
                        <Badge variant="success" size="sm">{character.available_ap} AP frei</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Attributes quick view */}
              <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4">
                <h3 className="text-sm font-semibold text-dsa-gold mb-3">Eigenschaften</h3>
                <div className="grid grid-cols-4 gap-2">
                  {Object.entries(ATTR_INFO).map(([key, info]) => (
                    <div key={key} className="text-center bg-dsa-bg rounded p-2 cursor-help group relative">
                      <div className={clsx('text-[10px] font-semibold', info.color)}>{key}</div>
                      <div className="text-xl font-mono font-bold text-dsa-parchment">{attrs[key] || '—'}</div>
                      <div className="text-[9px] text-dsa-parchment-dark">{info.name}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Derived values quick view */}
              <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4">
                <h3 className="text-sm font-semibold text-dsa-gold mb-3">Abgeleitete Werte</h3>
                <div className="flex flex-wrap gap-2">
                  {[
                    ['GS', derived.GS], ['INI', derived.INI_basis], ['AW', derived.AW],
                    ['WS', derived.WS], ['SK', derived.SK], ['ZK', derived.ZK],
                    ['SchiP', derived.SchiP ?? derived.Schip], ['SB', derived.SB],
                  ].map(([label, val]) => (
                    <div key={label} className="flex items-center gap-1.5 bg-dsa-bg rounded px-2.5 py-1.5">
                      <TipAbbr term={label} className="text-xs text-dsa-gold font-semibold" />
                      <span className="text-sm font-mono font-bold text-dsa-parchment">{val ?? '—'}</span>
                      <InfoPopup title={derivedFormulas[label]?.label || label}>
                        <div className="space-y-1">
                          <p>{derivedFormulas[label]?.desc}</p>
                          <div className="font-mono bg-dsa-bg px-2 py-1 rounded text-dsa-parchment-dark/80 border border-dsa-bg-medium text-[10px]">
                            = {derivedFormulas[label]?.formula}
                          </div>
                          <p className="text-dsa-parchment-dark/60 italic">{derivedFormulas[label]?.affects}</p>
                        </div>
                      </InfoPopup>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── ATTRIBUTES ── */}
          {activeTab === 'attributes' && (
            <div className="space-y-4">
              <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4">
                <h3 className="text-sm font-semibold text-dsa-gold mb-1">Eigenschaften</h3>
                <p className="text-xs text-dsa-parchment-dark mb-3">Antippen für Erklärung, was die Eigenschaft beeinflusst.</p>
                <div className="space-y-2">
                  {Object.entries(ATTR_INFO).map(([key, info]) => (
                    <ExpandRow
                      key={key}
                      label={
                        <span className="flex items-center gap-2">
                          <TipAbbr term={key} className={clsx('font-semibold', info.color)} />
                          <span className="text-dsa-parchment-dark text-xs">{info.name}</span>
                        </span>
                      }
                      value={attrs[key] || '—'}
                      explanation={
                        <div className="space-y-1.5">
                          <p>{info.desc}</p>
                          <p className="text-dsa-parchment-dark/60 italic">Beeinflusst: {info.affects}</p>
                        </div>
                      }
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── DERIVED VALUES ── */}
          {activeTab === 'derived' && (
            <div className="space-y-4">
              <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4">
                <h3 className="text-sm font-semibold text-dsa-gold mb-1">Abgeleitete Werte</h3>
                <p className="text-xs text-dsa-parchment-dark mb-3">Antippen zeigt die Formel mit deinen aktuellen Werten.</p>
                <div className="space-y-2">
                  {[
                    ['LeP', derived.LeP_max, true],
                    ['AsP', derived.AsP_max, derived.AsP_max > 0],
                    ['KaP', derived.KaP_max, derived.KaP_max > 0],
                    ['GS', derived.GS, true],
                    ['INI_basis', derived.INI_basis, true],
                    ['AW', derived.AW, true],
                    ['WS', derived.WS, true],
                    ['SB', derived.SB, true],
                    ['SK', derived.SK, true],
                    ['ZK', derived.ZK, true],
                    ['SchiP', derived.SchiP ?? derived.Schip, true],
                  ].filter(([,, show]) => show).map(([key, val]) => {
                    const info = derivedFormulas[key]
                    if (!info) return null
                    const Icon = info.icon
                    return (
                      <ExpandRow
                        key={key}
                        label={
                          <span className="flex items-center gap-2">
                            <Icon className={clsx('w-4 h-4', info.iconColor)} />
                            <TipAbbr term={key === 'INI_basis' ? 'INI' : key} className="font-semibold text-dsa-gold" />
                            <span className="text-dsa-parchment-dark text-xs">{info.label}</span>
                          </span>
                        }
                        value={val ?? '—'}
                        explanation={
                          <div className="space-y-1.5">
                            <p>{info.desc}</p>
                            <div className="font-mono bg-dsa-bg px-2 py-1 rounded text-dsa-parchment-dark/80 border border-dsa-bg-medium text-[10px]">
                              = {info.formula}
                            </div>
                            <p className="text-dsa-parchment-dark/60 italic">{info.affects}</p>
                          </div>
                        }
                      />
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── COMBAT ── */}
          {activeTab === 'combat' && (
            <div className="space-y-4">
              <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4">
                <h3 className="text-sm font-semibold text-dsa-gold mb-3">Waffen</h3>
                {weapons.length === 0 ? (
                  <div className="text-xs text-dsa-parchment-dark">Keine Waffen ausgerüstet</div>
                ) : (
                  <div className="space-y-2">
                    {weapons.map((w, i) => (
                      <div key={i} className="bg-dsa-bg rounded p-3 border border-dsa-bg-medium">
                        <div className="font-semibold text-dsa-parchment text-sm">{w.name}</div>
                        {w.technique && <div className="text-[10px] text-dsa-parchment-dark mt-0.5">{w.technique}</div>}
                        <div className="flex flex-wrap gap-3 mt-2 text-xs">
                          {[
                            ['AT', w.AT, COMBAT_INFO.AT],
                            w.PA != null ? ['PA', w.PA, COMBAT_INFO.PA] : null,
                            ['TP', w.TP, COMBAT_INFO.TP],
                            w.reach ? ['RW', w.reach, 'Reichweite der Waffe: kurz/mittel/lang'] : null,
                          ].filter(Boolean).map(([label, val]) => (
                            <span key={label} className="flex items-center gap-1 text-dsa-parchment">
                              <TipAbbr term={label} className="text-dsa-parchment-dark" />
                              <span className="font-mono font-bold text-dsa-gold">{val}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4">
                <h3 className="text-sm font-semibold text-dsa-gold mb-2">Rüstung</h3>
                <div className="flex gap-6 text-sm">
                  <span className="flex items-center gap-1.5 text-dsa-parchment">
                    <TipAbbr term="RS" className="text-dsa-parchment" /> <span className="font-mono font-bold text-dsa-gold">{combat.RS || 0}</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-dsa-parchment">
                    <TipAbbr term="BE" className="text-dsa-parchment" /> <span className="font-mono font-bold text-dsa-gold">{combat.BE || 0}</span>
                  </span>
                </div>
              </div>

              {/* Combat techniques from character data */}
              {character.combat_techniques && Object.keys(character.combat_techniques).length > 0 && (
                <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4">
                  <h3 className="text-sm font-semibold text-dsa-gold mb-2">Kampftechniken</h3>
                  <div className="space-y-1">
                    {Object.entries(character.combat_techniques).map(([name, data]) => {
                      const ktw = typeof data === 'number' ? data : data?.ktw
                      const at = typeof data === 'object' ? data?.at : null
                      const pa = typeof data === 'object' ? data?.pa : null
                      return (
                        <div key={name} className="flex items-center justify-between bg-dsa-bg rounded px-3 py-1.5 border border-dsa-bg-medium">
                          <span className="text-xs text-dsa-parchment">{name}</span>
                          <div className="flex items-center gap-3 text-xs">
                            <span className="text-dsa-parchment-dark">KTW <span className="font-mono font-bold text-dsa-parchment">{ktw}</span></span>
                            {at != null && <span className="text-red-400">AT <span className="font-mono font-bold">{at}</span></span>}
                            {pa != null && <span className="text-blue-400">PA <span className="font-mono font-bold">{pa}</span></span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── TALENTS ── */}
          {activeTab === 'talents' && (
            <div className="space-y-4">
              <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4">
                <h3 className="text-sm font-semibold text-dsa-gold mb-1">Talente</h3>
                <p className="text-xs text-dsa-parchment-dark mb-3">FW = Fertigkeitswert. Proben werden mit 3W20 gegen drei Eigenschaften gewürfelt.</p>
                {Object.keys(talents).length === 0 ? (
                  <div className="text-xs text-dsa-parchment-dark">Keine Talente</div>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(groupedTalents).map(([cat, items]) => {
                      const catInfo = TALENT_CATEGORIES[cat] || { color: 'text-dsa-parchment', borderColor: 'border-l-dsa-parchment-dark' }
                      return (
                        <div key={cat}>
                          <h4 className={clsx('text-xs font-semibold mb-1.5', catInfo.color)}>{cat}</h4>
                          <div className="space-y-1">
                            {items.map(({ name, fw }) => (
                              <div
                                key={name}
                                className={clsx('flex items-center justify-between bg-dsa-bg rounded px-3 py-1.5 border border-dsa-bg-medium border-l-2', catInfo.borderColor)}
                              >
                                <span className="text-xs text-dsa-parchment">{name}</span>
                                <Badge variant="gold" size="sm">FW {fw}</Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── MAGIC (Spells + Liturgies) ── */}
          {activeTab === 'magic' && (
            <div className="space-y-4">
              {hasSpells && (
                <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4">
                  <h3 className="text-sm font-semibold text-dsa-mana-light mb-1">Zaubersprüche</h3>
                  <p className="text-xs text-dsa-parchment-dark mb-3">Kosten AsP. Werden mit 3W20 geprobt.</p>
                  <div className="space-y-1">
                    {Object.entries(spells).sort(([, a], [, b]) => b - a).map(([name, fw]) => (
                      <div key={name} className="flex items-center justify-between bg-dsa-bg rounded px-3 py-1.5 border border-dsa-bg-medium border-l-2 border-l-dsa-mana">
                        <span className="text-xs text-dsa-parchment capitalize">{name.replace(/_/g, ' ')}</span>
                        <Badge variant="mana" size="sm">FW {fw}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {hasLiturgies && (
                <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4">
                  <h3 className="text-sm font-semibold text-dsa-karma-light mb-1">Liturgien</h3>
                  <p className="text-xs text-dsa-parchment-dark mb-3">Kosten KaP. Werden mit 3W20 geprobt.</p>
                  <div className="space-y-1">
                    {Object.entries(liturgies).sort(([, a], [, b]) => b - a).map(([name, fw]) => (
                      <div key={name} className="flex items-center justify-between bg-dsa-bg rounded px-3 py-1.5 border border-dsa-bg-medium border-l-2 border-l-dsa-karma">
                        <span className="text-xs text-dsa-parchment capitalize">{name.replace(/_/g, ' ')}</span>
                        <Badge variant="karma" size="sm">FW {fw}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── SF / ADVANTAGES / DISADVANTAGES ── */}
          {activeTab === 'abilities' && (
            <div className="space-y-4">
              <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4">
                <h3 className="text-sm font-semibold text-dsa-gold mb-2">Sonderfertigkeiten</h3>
                <div className="space-y-1">
                  {sfs.length === 0 ? (
                    <div className="text-xs text-dsa-parchment-dark">Keine</div>
                  ) : (
                    sfs.map((sf, i) => {
                      const info = Object.entries(SF_INFO).find(([k]) => sf.toLowerCase().includes(k.toLowerCase()))?.[1]
                      return (
                        <ExpandRow
                          key={`${sf}-${i}`}
                          label={sf}
                          badgeVariant="gold"
                          explanation={info || `Sonderfertigkeit: ${sf}`}
                        />
                      )
                    })
                  )}
                </div>
              </div>

              <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4">
                <h3 className="text-sm font-semibold text-green-400 mb-2">Vorteile</h3>
                <div className="space-y-1">
                  {renderAdvDisadv(advantages, ADV_INFO, 'success')}
                </div>
              </div>

              <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4">
                <h3 className="text-sm font-semibold text-red-400 mb-2">Nachteile</h3>
                <div className="space-y-1">
                  {renderAdvDisadv(disadvantages, DISADV_INFO, 'danger')}
                </div>
              </div>
            </div>
          )}

          {/* ── EQUIPMENT ── */}
          {activeTab === 'equipment' && (
            <div className="space-y-4">
              <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-dsa-gold">Inventar</h3>
                  <div className="text-xs text-dsa-parchment-dark">
                    Tragkraft: <span className="text-dsa-parchment font-mono">{(attrs.KK || 0) * 2} Stein</span>
                    <InfoPopup title="Tragkraft">
                      Maximales Gewicht = KK x 2 in Stein. Jede 25% über dem Limit gibt +1 Belastung (BE).
                    </InfoPopup>
                  </div>
                </div>
                {inventory.length === 0 ? (
                  <div className="text-xs text-dsa-parchment-dark">Keine Gegenstände</div>
                ) : (
                  <div className="space-y-1">
                    {inventory.map((item, i) => (
                      <div key={i} className="flex items-center justify-between py-2 px-2 rounded hover:bg-dsa-bg transition-colors">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-sm text-dsa-parchment truncate">{item.name}</span>
                          {item.quantity > 1 && <Badge variant="default" size="sm">x{item.quantity}</Badge>}
                          {item.equipped && <Badge variant="gold" size="sm">Angelegt</Badge>}
                        </div>
                        {item.weight != null && (
                          <span className="text-xs text-dsa-parchment-dark flex-shrink-0 ml-2">{item.weight} Stn.</span>
                        )}
                      </div>
                    ))}
                    <div className="border-t border-dsa-bg-medium pt-2 mt-2 flex justify-between text-xs">
                      <span className="text-dsa-parchment-dark">Gesamtgewicht:</span>
                      <span className="text-dsa-parchment font-mono">
                        {inventory.reduce((sum, item) => sum + (item.weight || 0) * (item.quantity || 1), 0).toFixed(1)} Stein
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── PROFILE (Languages, Background) ── */}
          {activeTab === 'profile' && (
            <div className="space-y-4">
              {/* Languages */}
              <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4">
                <h3 className="text-sm font-semibold text-dsa-gold mb-2 flex items-center gap-2">
                  <Languages className="w-4 h-4" />
                  Sprachen & Schriften
                </h3>
                {languages.length === 0 ? (
                  <div className="text-xs text-dsa-parchment-dark">Keine Sprachen hinterlegt</div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {languages.map((lang, i) => {
                      const str = typeof lang === 'string' ? lang : `${lang.name} (${lang.level})`
                      return (
                        <Badge key={i} variant="default" size="md">{str}</Badge>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Background */}
              <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4">
                <h3 className="text-sm font-semibold text-dsa-gold mb-2 flex items-center gap-2">
                  <BookOpen className="w-4 h-4" />
                  Hintergrund
                </h3>
                {character.bio ? (
                  <p className="text-sm text-dsa-parchment leading-relaxed italic border-l-2 border-dsa-gold/30 pl-3">
                    {character.bio}
                  </p>
                ) : (
                  <div className="text-xs text-dsa-parchment-dark">Keine Biographie hinterlegt.</div>
                )}
              </div>

              {/* Character details */}
              <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4">
                <h3 className="text-sm font-semibold text-dsa-gold mb-2">Details</h3>
                <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                  <div><span className="text-dsa-parchment-dark text-xs">Spezies:</span> <span className="text-dsa-parchment text-xs">{character.species || '—'}</span></div>
                  <div><span className="text-dsa-parchment-dark text-xs">Kultur:</span> <span className="text-dsa-parchment text-xs">{character.culture || '—'}</span></div>
                  <div><span className="text-dsa-parchment-dark text-xs">Profession:</span> <span className="text-dsa-parchment text-xs">{character.profession || '—'}</span></div>
                  <div><span className="text-dsa-parchment-dark text-xs">Erfahrungsgrad:</span> <span className="text-dsa-parchment text-xs">{gradeLabel}</span></div>
                  <div><span className="text-dsa-parchment-dark text-xs">AP gesamt:</span> <span className="text-dsa-parchment text-xs">{character.total_ap || 0}</span></div>
                  <div><span className="text-dsa-parchment-dark text-xs">AP verfügbar:</span> <span className="text-dsa-gold font-semibold text-xs">{character.available_ap || 0}</span></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
