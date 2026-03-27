/**
 * DatenbankDetail — shared category config, detail renderers, and popup modal.
 * Used by DatenbankTab (dashboard) and DataBrowser (GM view).
 */
import { Fragment } from 'react'
import {
  Skull, Swords, Shield, ShieldHalf, Package, Sparkles, Star, Zap, BookOpen,
  Heart, Wind, Eye, X, Coins, Pencil, Trash2, Loader2,
  Brain, Hand, HeartPulse, Hammer, Crown, Target, Flame, Clock,
} from 'lucide-react'
import clsx from 'clsx'
import { Tooltip, TipAbbr } from './Tooltip'

// ---------------------------------------------------------------------------
// Category config
// ---------------------------------------------------------------------------

export const CATEGORIES = [
  {
    id: 'creatures',
    label: 'Kreaturen',
    icon: Skull,
    titleColor: 'text-dsa-gold',
    borderAccent: 'border-l-4 border-l-dsa-gold',
    heroBg: 'from-dsa-gold/15 via-dsa-gold/5 to-transparent',
    iconColor: 'text-dsa-gold/60',
    tagBg: 'bg-dsa-gold/15 text-dsa-gold border border-dsa-gold/20',
    activeStyle: 'bg-dsa-gold/10 text-dsa-gold border-l-4 border-l-dsa-gold font-medium',
  },
  {
    id: 'weapons',
    label: 'Waffen',
    icon: Swords,
    titleColor: 'text-dsa-rust-light',
    borderAccent: 'border-l-4 border-l-dsa-rust',
    heroBg: 'from-dsa-rust/15 via-dsa-rust/5 to-transparent',
    iconColor: 'text-dsa-rust/60',
    tagBg: 'bg-dsa-rust/15 text-dsa-rust-light border border-dsa-rust/20',
    activeStyle: 'bg-dsa-rust/10 text-dsa-rust-light border-l-4 border-l-dsa-rust font-medium',
  },
  {
    id: 'armor',
    label: 'Rüstungen',
    icon: Shield,
    titleColor: 'text-dsa-parchment',
    borderAccent: 'border-l-4 border-l-dsa-parchment-dark',
    heroBg: 'from-dsa-parchment/8 via-dsa-parchment/3 to-transparent',
    iconColor: 'text-dsa-parchment/40',
    tagBg: 'bg-dsa-parchment/10 text-dsa-parchment border border-dsa-parchment/15',
    activeStyle: 'bg-dsa-parchment/8 text-dsa-parchment border-l-4 border-l-dsa-parchment-dark font-medium',
  },
  {
    id: 'shields',
    label: 'Schilde',
    icon: ShieldHalf,
    titleColor: 'text-dsa-parchment',
    borderAccent: 'border-l-4 border-l-dsa-parchment-dark',
    heroBg: 'from-dsa-parchment/8 via-dsa-parchment/3 to-transparent',
    iconColor: 'text-dsa-parchment/40',
    tagBg: 'bg-dsa-parchment/10 text-dsa-parchment border border-dsa-parchment/15',
    activeStyle: 'bg-dsa-parchment/8 text-dsa-parchment border-l-4 border-l-dsa-parchment-dark font-medium',
  },
  {
    id: 'items',
    label: 'Gegenstände',
    icon: Package,
    titleColor: 'text-dsa-forest-light',
    borderAccent: 'border-l-4 border-l-dsa-forest',
    heroBg: 'from-dsa-forest/15 via-dsa-forest/5 to-transparent',
    iconColor: 'text-dsa-forest/60',
    tagBg: 'bg-dsa-forest/15 text-dsa-forest-light border border-dsa-forest/20',
    activeStyle: 'bg-dsa-forest/10 text-dsa-forest-light border-l-4 border-l-dsa-forest font-medium',
  },
  {
    id: 'spells',
    label: 'Zauber',
    icon: Sparkles,
    titleColor: 'text-dsa-mana-light',
    borderAccent: 'border-l-4 border-l-dsa-mana',
    heroBg: 'from-dsa-mana/15 via-dsa-mana/5 to-transparent',
    iconColor: 'text-dsa-mana/60',
    tagBg: 'bg-dsa-mana/15 text-dsa-mana-light border border-dsa-mana/20',
    activeStyle: 'bg-dsa-mana/10 text-dsa-mana-light border-l-4 border-l-dsa-mana font-medium',
  },
  {
    id: 'liturgies',
    label: 'Liturgien',
    icon: Star,
    titleColor: 'text-dsa-karma-light',
    borderAccent: 'border-l-4 border-l-dsa-karma',
    heroBg: 'from-dsa-karma/15 via-dsa-karma/5 to-transparent',
    iconColor: 'text-dsa-karma/60',
    tagBg: 'bg-dsa-karma/15 text-dsa-karma-light border border-dsa-karma/20',
    activeStyle: 'bg-dsa-karma/10 text-dsa-karma-light border-l-4 border-l-dsa-karma font-medium',
  },
  {
    id: 'special_abilities',
    label: 'Sonderfertigkeiten',
    icon: Zap,
    titleColor: 'text-dsa-gold-light',
    borderAccent: 'border-l-4 border-l-dsa-gold',
    heroBg: 'from-dsa-gold/10 via-dsa-gold/4 to-transparent',
    iconColor: 'text-dsa-gold/50',
    tagBg: 'bg-dsa-gold/10 text-dsa-gold-light border border-dsa-gold/15',
    activeStyle: 'bg-dsa-gold/8 text-dsa-gold-light border-l-4 border-l-dsa-gold font-medium',
  },
  {
    id: 'talents',
    label: 'Talente',
    icon: BookOpen,
    titleColor: 'text-dsa-parchment',
    borderAccent: 'border-l-4 border-l-dsa-parchment-dark',
    heroBg: 'from-dsa-parchment/6 via-transparent to-transparent',
    iconColor: 'text-dsa-parchment/30',
    tagBg: 'bg-dsa-bg-medium text-dsa-parchment-dark border border-dsa-bg-medium',
    activeStyle: 'bg-dsa-bg-medium text-dsa-parchment border-l-4 border-l-dsa-parchment-dark font-medium',
  },
]

export const CAT = Object.fromEntries(CATEGORIES.map(c => [c.id, c]))
export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map(c => [c.id, c.label]))

// ---------------------------------------------------------------------------
// Shared subcategory definitions — used by DatenbankTab, DataBrowser, LootPanel
// ---------------------------------------------------------------------------

/** Item subcategories (DB `category` field values for items table) */
export const ITEM_SUBCATEGORIES = {
  trank:              { label: 'Tränke',            icon: '\uD83D\uDC8A' },
  heilkraut:          { label: 'Heilkräuter',       icon: '\uD83C\uDF3F' },
  alchemie:           { label: 'Alchemie',          icon: '\u2697\uFE0F' },
  gift:               { label: 'Gifte',             icon: '\u2620\uFE0F' },
  munition:           { label: 'Munition',          icon: '\uD83C\uDFF9' },
  werkzeug:           { label: 'Werkzeug',          icon: '\uD83D\uDD27' },
  licht:              { label: 'Licht & Feuer',     icon: '\uD83D\uDD25' },
  proviant:           { label: 'Proviant',          icon: '\uD83C\uDF56' },
  ausruestung:        { label: 'Ausrüstung',        icon: '\uD83C\uDF92' },
  behaelter:          { label: 'Behälter',          icon: '\uD83D\uDCE6' },
  schatz:             { label: 'Schätze',           icon: '\u2728' },
  unterhaltung:       { label: 'Unterhaltung',      icon: '\uD83C\uDFB5' },
  verbrauchsmaterial: { label: 'Verbrauchsmaterial', icon: '\uD83E\uDDEA' },
  krankheit:          { label: 'Krankheit',         icon: '\uD83E\uDE7A' },
}

/** All subcategory labels — maps lowercase DB values to display strings.
 *  Superset of DatenbankTab SUBCAT_LABELS + DataBrowser CATEGORY_LABELS. */
export const SUBCATEGORY_LABELS = {
  // Creature types
  humanoid: 'Humanoid', tier: 'Tier', untot: 'Untot', daemon: 'Dämon',
  magisch: 'Magisch', feenwesen: 'Feenwesen', elementar: 'Elementar',
  konstrukt: 'Konstrukt', pflanze: 'Pflanze',
  // Item categories (singular form for subcategory labels in browsing)
  trank: 'Trank', heilkraut: 'Heilkraut', alchemie: 'Alchemie', gift: 'Gift',
  munition: 'Munition', werkzeug: 'Werkzeug', licht: 'Licht', proviant: 'Proviant',
  schatz: 'Schatz', ausruestung: 'Ausrüstung', behaelter: 'Behälter',
  verbrauchsmaterial: 'Verbrauchsmaterial', unterhaltung: 'Unterhaltung', krankheit: 'Krankheit',
  // Special ability categories
  nahkampf: 'Nahkampf', fernkampf: 'Fernkampf', allgemein: 'Allgemein',
  allgemein_nichtkampf: 'Allgemein (NK)', karmal: 'Karmal', kampf: 'Kampf',
  // Talent categories
  'körper': 'Körper', koerper: 'Körper', gesellschaft: 'Gesellschaft',
  natur: 'Natur', wissen: 'Wissen', handwerk: 'Handwerk',
  // Weapon combat techniques
  schwerter: 'Schwerter', stangenwaffen: 'Stangenwaffen', hiebwaffen: 'Hiebwaffen',
  wurfwaffen: 'Wurfwaffen', 'bögen': 'Bögen', 'armbrüste': 'Armbrüste',
  dolche: 'Dolche', fechtwaffen: 'Fechtwaffen', kettenwaffen: 'Kettenwaffen',
  zweihandschwerter: 'Zweihandschwerter', 'äxte': 'Äxte', blasrohre: 'Blasrohre',
  raufen: 'Raufen', 'zweihandäxte': 'Zweihandäxte',
  // Equipment meta categories
  waffe: 'Waffen', ruestung: 'Rüstung',
}

/** Resolve a DB subcategory value to its display label */
export function subcategoryLabel(val) {
  return SUBCATEGORY_LABELS[val] || SUBCATEGORY_LABELS[val?.toLowerCase()] || val
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const ATTR_META = {
  MU: { icon: Flame,      color: 'text-red-400',     bg: 'bg-red-400/10 border-red-400/20' },
  KL: { icon: Brain,      color: 'text-blue-400',    bg: 'bg-blue-400/10 border-blue-400/20' },
  IN: { icon: Eye,        color: 'text-violet-400',  bg: 'bg-violet-400/10 border-violet-400/20' },
  CH: { icon: Crown,      color: 'text-pink-400',    bg: 'bg-pink-400/10 border-pink-400/20' },
  FF: { icon: Hand,       color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20' },
  GE: { icon: Wind,       color: 'text-cyan-400',    bg: 'bg-cyan-400/10 border-cyan-400/20' },
  KO: { icon: HeartPulse, color: 'text-orange-400',  bg: 'bg-orange-400/10 border-orange-400/20' },
  KK: { icon: Hammer,     color: 'text-amber-400',   bg: 'bg-amber-400/10 border-amber-400/20' },
}

function StatChip({ label, value, className = '' }) {
  return (
    <span className={clsx('inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px]', className)}>
      <Tooltip term={label}>
        <span className="font-semibold opacity-70 cursor-help">{label}</span>
      </Tooltip>
      <span className="font-bold">{value}</span>
    </span>
  )
}

function ModChip({ label, value }) {
  const isPos = value > 0
  const isNeg = value < 0
  return (
    <span className={clsx(
      'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-semibold',
      isPos ? 'bg-dsa-success/10 text-dsa-success border border-dsa-success/20' :
      isNeg ? 'bg-dsa-danger/10 text-dsa-danger border border-dsa-danger/20' :
              'bg-dsa-bg-medium text-dsa-parchment-dark border border-dsa-bg-medium'
    )}>
      <Tooltip term={label}><span className="cursor-help">{label}</span></Tooltip>
      {' '}{value >= 0 ? '+' : ''}{value}
    </span>
  )
}

export function CustomBadge({ username, mini = false }) {
  if (mini) {
    return (
      <span className="inline-flex items-center bg-dsa-mana/15 text-dsa-mana-light text-[10px] rounded-full px-1.5 py-0.5 border border-dsa-mana/20 shrink-0">
        Spieler
      </span>
    )
  }
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-dsa-mana/10 border border-dsa-mana/25">
      <Eye className="w-3.5 h-3.5 text-dsa-mana-light shrink-0" />
      <span className="text-xs text-dsa-mana-light">
        Spieler-Beitrag von <span className="font-semibold">{username}</span>
      </span>
    </div>
  )
}

function DetailSection({ title, icon: Icon, children, accent = false }) {
  return (
    <div className="mb-5">
      <div className={clsx(
        'flex items-center gap-2 mb-3 pb-1.5',
        accent ? 'border-b border-dsa-gold/20' : 'border-b border-dsa-bg-medium'
      )}>
        {Icon && <Icon className={clsx('w-4 h-4', accent ? 'text-dsa-gold' : 'text-dsa-parchment-dark')} />}
        <h3 className={clsx(
          'text-sm font-semibold uppercase tracking-wide',
          accent ? 'text-dsa-gold' : 'text-dsa-parchment-dark'
        )}>
          {title}
        </h3>
      </div>
      {children}
    </div>
  )
}

function StatPill({ label, value, accent = '' }) {
  return (
    <span className={clsx(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm',
      accent || 'bg-dsa-bg-medium border border-dsa-bg-medium/80'
    )}>
      <TipAbbr term={label} className="text-dsa-gold font-semibold text-xs" />
      <span className="text-dsa-parchment font-medium">{value}</span>
    </span>
  )
}

function InfoRow({ label, value }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex items-baseline gap-2 py-1 border-b border-dsa-bg-medium/50 last:border-0">
      <span className="text-xs text-dsa-parchment-dark w-36 shrink-0">{label}</span>
      <span className="text-sm text-dsa-parchment font-medium">{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detail renderers — one per category
// ---------------------------------------------------------------------------

function CreatureDetail({ data }) {
  const attrs = data.attributes || {}
  const cv = data.combat_values || {}
  const ATTR_KEYS = ['MU', 'KL', 'IN', 'CH', 'FF', 'GE', 'KO', 'KK']
  const hasAttrs = ATTR_KEYS.some(k => attrs[k] !== undefined)
  const { LeP, RS, GS, INI, ...otherCv } = cv

  return (
    <>
      {(LeP !== undefined || RS !== undefined || GS !== undefined) && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          {LeP !== undefined && (
            <div className="bg-dsa-blood/10 border border-dsa-blood/20 rounded-lg p-3 text-center">
              <Heart className="w-4 h-4 text-red-400 mx-auto mb-1" />
              <div className="text-xl font-bold text-red-400">{LeP}</div>
              <TipAbbr term="LeP" className="text-[10px] text-dsa-parchment-dark uppercase tracking-wide" />
            </div>
          )}
          {RS !== undefined && (
            <div className="bg-dsa-bg-medium/60 border border-dsa-bg-medium rounded-lg p-3 text-center">
              <Shield className="w-4 h-4 text-dsa-parchment-dark mx-auto mb-1" />
              <div className="text-xl font-bold text-dsa-parchment">{RS}</div>
              <TipAbbr term="RS" className="text-[10px] text-dsa-parchment-dark uppercase tracking-wide" />
            </div>
          )}
          {GS !== undefined && (
            <div className="bg-dsa-bg-medium/60 border border-dsa-bg-medium rounded-lg p-3 text-center">
              <Wind className="w-4 h-4 text-dsa-parchment-dark mx-auto mb-1" />
              <div className="text-xl font-bold text-dsa-parchment">{GS}</div>
              <TipAbbr term="GS" className="text-[10px] text-dsa-parchment-dark uppercase tracking-wide" />
            </div>
          )}
        </div>
      )}

      {data.description && (
        <p className="text-sm text-dsa-parchment-dark mb-5 leading-relaxed italic border-l-2 border-dsa-gold/30 pl-3">
          {data.description}
        </p>
      )}

      {data.category && (
        <div className="mb-4">
          <InfoRow label="Kategorie" value={data.category} />
        </div>
      )}

      {(Object.keys(otherCv).length > 0 || INI !== undefined) && (
        <DetailSection title="Kampfwerte">
          <div className="flex flex-wrap gap-2">
            {INI !== undefined && <StatPill label="INI" value={INI} accent="bg-dsa-gold/8 border border-dsa-gold/20" />}
            {Object.entries(otherCv).map(([k, v]) => (
              <StatPill key={k} label={k} value={v} accent="bg-dsa-gold/8 border border-dsa-gold/20" />
            ))}
          </div>
        </DetailSection>
      )}

      {hasAttrs && (
        <DetailSection title="Attribute">
          <div className="flex flex-wrap gap-1.5">
            {ATTR_KEYS.map(k => {
              if (attrs[k] === undefined) return null
              const meta = ATTR_META[k]
              const AttrIcon = meta?.icon
              return (
                <Tooltip key={k} term={k}>
                  <span className={clsx(
                    'inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border cursor-help',
                    meta ? meta.bg : 'bg-dsa-bg-medium border-dsa-bg-medium'
                  )}>
                    {AttrIcon && <AttrIcon className={clsx('w-3 h-3', meta.color)} />}
                    <span className={clsx('font-semibold text-[10px]', meta?.color || 'text-dsa-parchment-dark')}>{k}</span>
                    <span className={clsx('font-bold text-xs', meta?.color || 'text-dsa-parchment')}>{attrs[k]}</span>
                  </span>
                </Tooltip>
              )
            })}
          </div>
        </DetailSection>
      )}

      {data.attacks && data.attacks.length > 0 && (
        <DetailSection title="Angriffe" icon={Swords}>
          <div className="space-y-2">
            {data.attacks.map((atk, i) => (
              <div key={i} className="flex items-center gap-2 p-2 bg-dsa-bg-medium/30 rounded-lg">
                <span className="text-sm font-medium text-dsa-parchment flex-1">
                  {atk.name || `Angriff ${i + 1}`}
                </span>
                {atk.AT && <StatChip label="AT" value={atk.AT} className="bg-dsa-gold/10 text-dsa-gold border border-dsa-gold/20" />}
                {atk.PA !== undefined && <StatChip label="PA" value={atk.PA} className="bg-dsa-gold/10 text-dsa-gold border border-dsa-gold/20" />}
                {atk.TP && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-dsa-rust/15 border border-dsa-rust/25 text-dsa-rust-light text-xs font-bold">
                    <Flame className="w-3 h-3" />{atk.TP}
                  </span>
                )}
                {atk.reach && <span className="text-xs text-dsa-parchment-dark"><TipAbbr term="RW" />: {atk.reach}</span>}
                {atk.type && <span className="text-xs text-dsa-parchment-dark/60">{atk.type}</span>}
              </div>
            ))}
          </div>
        </DetailSection>
      )}

      {data.special_rules && data.special_rules.length > 0 && (
        <DetailSection title="Sonderregeln">
          <ul className="space-y-1.5">
            {data.special_rules.map((rule, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-dsa-parchment-dark">
                <span className="text-dsa-gold/60 mt-0.5">◆</span>
                {typeof rule === 'string' ? rule : rule.name || JSON.stringify(rule)}
              </li>
            ))}
          </ul>
        </DetailSection>
      )}

      {data.behavior && (
        <DetailSection title="Verhalten">
          <p className="text-sm text-dsa-parchment-dark leading-relaxed">{data.behavior}</p>
        </DetailSection>
      )}

      {data.tactics && (
        <DetailSection title="Taktik">
          <p className="text-sm text-dsa-parchment-dark leading-relaxed">{data.tactics}</p>
        </DetailSection>
      )}
    </>
  )
}

function WeaponDetail({ data }) {
  return (
    <>
      {data.damage && (
        <div className="flex items-center gap-4 mb-5 p-4 bg-dsa-rust/10 border border-dsa-rust/25 rounded-xl">
          <Flame className="w-8 h-8 text-dsa-rust-light/60 shrink-0" />
          <div>
            <div className="text-2xl font-display font-bold text-dsa-rust-light">{data.damage}</div>
            <div className="text-xs text-dsa-parchment-dark uppercase tracking-wide">Trefferpunkte</div>
          </div>
          <div className="flex gap-2 ml-auto">
            {data.at_mod !== undefined && <ModChip label="AT" value={data.at_mod} />}
            {data.pa_mod !== undefined && <ModChip label="PA" value={data.pa_mod} />}
          </div>
        </div>
      )}

      <DetailSection title="Details">
        <div className="space-y-0">
          <InfoRow label="Kampftechnik" value={data.combat_technique} />
          <InfoRow label="Reichweite" value={data.reach} />
          <InfoRow label="Schadenstyp" value={data.damage_type} />
          <InfoRow label="Zweihändig" value={data.two_handed ? 'Ja' : undefined} />
          <InfoRow label="Fernkampf" value={data.is_ranged ? 'Ja' : undefined} />
          <InfoRow label="Ladezeit" value={data.reload_time ? `${data.reload_time} Aktionen` : undefined} />
          <InfoRow label="Munition" value={data.ammunition} />
          <InfoRow label="Gewicht" value={data.weight ? `${data.weight} Stn` : undefined} />
          <InfoRow label="Preis" value={data.price ? `${data.price} Silber` : undefined} />
        </div>
      </DetailSection>

      {data.range_brackets && Object.keys(data.range_brackets).length > 0 && (
        <DetailSection title="Schussdistanzen">
          <div className="flex flex-wrap gap-2">
            {Object.entries(data.range_brackets).map(([k, v]) => (
              <StatPill key={k} label={k} value={v} />
            ))}
          </div>
        </DetailSection>
      )}

      {data.properties && data.properties.length > 0 && (
        <DetailSection title="Eigenschaften">
          <div className="flex flex-wrap gap-1.5">
            {data.properties.map((p, i) => (
              <span key={i} className="text-xs bg-dsa-bg-medium border border-dsa-bg-medium text-dsa-parchment-dark px-2 py-0.5 rounded">
                {p}
              </span>
            ))}
          </div>
        </DetailSection>
      )}

      {data.description && (
        <p className="text-sm text-dsa-parchment-dark leading-relaxed italic border-l-2 border-dsa-rust/30 pl-3 mt-2">
          {data.description}
        </p>
      )}
    </>
  )
}

function ArmorDetail({ data }) {
  return (
    <>
      {(data.rs !== undefined || data.be !== undefined) && (
        <div className="flex gap-3 mb-5">
          {data.rs !== undefined && (
            <div className="flex-1 bg-dsa-bg-medium/60 border border-dsa-bg-medium rounded-xl p-4 text-center">
              <Shield className="w-5 h-5 text-dsa-parchment-dark mx-auto mb-1" />
              <div className="text-2xl font-bold text-dsa-parchment">{data.rs}</div>
              <div className="text-[10px] text-dsa-parchment-dark uppercase tracking-wide">Rüstungsschutz</div>
            </div>
          )}
          {data.be !== undefined && (
            <div className="flex-1 bg-dsa-bg-medium/60 border border-dsa-bg-medium rounded-xl p-4 text-center">
              <Wind className="w-5 h-5 text-dsa-parchment-dark mx-auto mb-1" />
              <div className="text-2xl font-bold text-dsa-parchment">{data.be}</div>
              <div className="text-[10px] text-dsa-parchment-dark uppercase tracking-wide">Behinderung</div>
            </div>
          )}
        </div>
      )}

      <DetailSection title="Details">
        <div className="space-y-0">
          <InfoRow label="Gewicht" value={data.weight ? `${data.weight} Stn` : undefined} />
          <InfoRow label="Preis" value={data.price ? `${data.price} Silber` : undefined} />
        </div>
      </DetailSection>

      {data.zones && Object.keys(data.zones).length > 0 && (
        <DetailSection title="Zonen-RS">
          <div className="flex flex-wrap gap-2">
            {Object.entries(data.zones).map(([k, v]) => (
              <StatPill key={k} label={k} value={v} />
            ))}
          </div>
        </DetailSection>
      )}

      {data.properties && data.properties.length > 0 && (
        <DetailSection title="Eigenschaften">
          <div className="flex flex-wrap gap-1.5">
            {data.properties.map((p, i) => (
              <span key={i} className="text-xs bg-dsa-bg-medium border border-dsa-bg-medium text-dsa-parchment-dark px-2 py-0.5 rounded">{p}</span>
            ))}
          </div>
        </DetailSection>
      )}

      {data.description && (
        <p className="text-sm text-dsa-parchment-dark mt-2 leading-relaxed italic border-l-2 border-dsa-parchment/20 pl-3">
          {data.description}
        </p>
      )}
    </>
  )
}

function ShieldDetail({ data }) {
  return (
    <>
      {(data.at_mod !== undefined || data.pa_mod !== undefined) && (
        <div className="flex gap-3 mb-5">
          {data.at_mod !== undefined && (
            <div className={clsx(
              'flex-1 border rounded-xl p-4 text-center',
              data.at_mod >= 0 ? 'bg-dsa-success/8 border-dsa-success/20' : 'bg-dsa-danger/8 border-dsa-danger/20'
            )}>
              <div className={clsx('text-2xl font-bold', data.at_mod >= 0 ? 'text-dsa-success' : 'text-dsa-danger')}>
                {data.at_mod >= 0 ? '+' : ''}{data.at_mod}
              </div>
              <div className="text-[10px] text-dsa-parchment-dark uppercase tracking-wide"><TipAbbr term="AT" />-Mod</div>
            </div>
          )}
          {data.pa_mod !== undefined && (
            <div className={clsx(
              'flex-1 border rounded-xl p-4 text-center',
              data.pa_mod >= 0 ? 'bg-dsa-success/8 border-dsa-success/20' : 'bg-dsa-danger/8 border-dsa-danger/20'
            )}>
              <div className={clsx('text-2xl font-bold', data.pa_mod >= 0 ? 'text-dsa-success' : 'text-dsa-danger')}>
                {data.pa_mod >= 0 ? '+' : ''}{data.pa_mod}
              </div>
              <div className="text-[10px] text-dsa-parchment-dark uppercase tracking-wide"><TipAbbr term="PA" />-Mod</div>
            </div>
          )}
        </div>
      )}

      <DetailSection title="Details">
        <div className="space-y-0">
          <InfoRow label="Größe" value={data.size} />
          <InfoRow label="Gewicht" value={data.weight ? `${data.weight} Stn` : undefined} />
          <InfoRow label="Preis" value={data.price ? `${data.price} Silber` : undefined} />
        </div>
      </DetailSection>

      {data.description && (
        <p className="text-sm text-dsa-parchment-dark mt-2 leading-relaxed italic border-l-2 border-dsa-parchment/20 pl-3">
          {data.description}
        </p>
      )}
    </>
  )
}

function ItemDetail({ data }) {
  return (
    <>
      <DetailSection title="Details">
        <div className="space-y-0">
          <InfoRow label="Kategorie" value={data.category} />
          <InfoRow label="Gewicht" value={data.weight ? `${data.weight} Stn` : undefined} />
          <InfoRow label="Preis" value={data.price ? `${data.price} Silber` : undefined} />
          <InfoRow label="Stapelbar" value={data.stackable ? (data.max_stack ? `Ja (max ${data.max_stack})` : 'Ja') : undefined} />
          <InfoRow label="Benutzbar" value={data.usable ? 'Ja' : undefined} />
          <InfoRow label="Im Kampf nutzbar" value={data.usable_in_combat ? 'Ja' : undefined} />
          <InfoRow label="Aktionskosten" value={data.use_action_cost} />
          <InfoRow label="Verbrauchbar" value={data.consumable ? 'Ja' : undefined} />
          <InfoRow label="Ladungen" value={data.charges} />
        </div>
      </DetailSection>

      {data.effects && Object.keys(data.effects).length > 0 && (
        <DetailSection title="Effekte" icon={Sparkles}>
          <div className="flex flex-wrap gap-2">
            {Object.entries(data.effects).map(([k, v]) => (
              <StatPill key={k} label={k} value={typeof v === 'object' ? JSON.stringify(v) : v} accent="bg-dsa-forest/10 border border-dsa-forest/25" />
            ))}
          </div>
        </DetailSection>
      )}

      {data.description && (
        <p className="text-sm text-dsa-parchment-dark mt-2 leading-relaxed italic border-l-2 border-dsa-forest/30 pl-3">
          {data.description}
        </p>
      )}
    </>
  )
}

function SpellDetail({ data }) {
  const probe = Array.isArray(data.probe) ? data.probe : (data.probe ? data.probe.split('/') : [])
  return (
    <>
      <div className="flex items-center gap-4 mb-5 p-4 bg-dsa-mana/8 border border-dsa-mana/20 rounded-xl">
        <div>
          {probe.length > 0 && (
            <div className="flex gap-1 mb-1">
              {probe.map((attr, i) => {
                const meta = ATTR_META[attr]
                const AttrIcon = meta?.icon
                return (
                  <Fragment key={i}>
                    {i > 0 && <span className="text-dsa-parchment-dark/30 self-center">/</span>}
                    <Tooltip term={attr}>
                      <span className={clsx(
                        'inline-flex items-center gap-1 px-2 py-1 rounded-lg text-sm border cursor-help',
                        meta ? meta.bg : 'bg-dsa-mana/15 border-dsa-mana/30'
                      )}>
                        {AttrIcon && <AttrIcon className={clsx('w-3.5 h-3.5', meta?.color)} />}
                        <span className={clsx('font-bold', meta?.color || 'text-dsa-mana-light')}>{attr}</span>
                      </span>
                    </Tooltip>
                  </Fragment>
                )
              })}
            </div>
          )}
          <div className="text-[10px] text-dsa-parchment-dark uppercase tracking-wide">Probe</div>
        </div>
        {data.asp_cost && (
          <div className="ml-auto text-right">
            <div className="flex items-center gap-1 justify-end">
              <Sparkles className="w-4 h-4 text-dsa-mana-light" />
              <span className="text-xl font-bold text-dsa-mana-light">{data.asp_cost}</span>
            </div>
            <div className="text-[10px] text-dsa-parchment-dark uppercase tracking-wide"><TipAbbr term="AsP" />-Kosten</div>
          </div>
        )}
      </div>

      <DetailSection title="Wirkung">
        <div className="space-y-0">
          <InfoRow label="Zauberdauer" value={data.casting_time} />
          <InfoRow label="Reichweite" value={data.range} />
          <InfoRow label="Wirkungsdauer" value={data.duration} />
          <InfoRow label="Ziel" value={data.target} />
          <InfoRow label="Schaden" value={data.damage} />
          <InfoRow label="Probenmod." value={data.check_mod !== undefined ? `${data.check_mod >= 0 ? '+' : ''}${data.check_mod}` : undefined} />
        </div>
      </DetailSection>

      {data.tradition && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {(Array.isArray(data.tradition) ? data.tradition : [data.tradition]).map((t, i) => (
            <span key={i} className="text-xs bg-dsa-mana/10 text-dsa-mana-light border border-dsa-mana/20 px-2 py-0.5 rounded">
              {t}
            </span>
          ))}
        </div>
      )}

      {data.description && (
        <p className="text-sm text-dsa-parchment-dark leading-relaxed italic border-l-2 border-dsa-mana/30 pl-3">
          {data.description}
        </p>
      )}
    </>
  )
}

function LiturgyDetail({ data }) {
  const probe = Array.isArray(data.probe) ? data.probe : (data.probe ? data.probe.split('/') : [])
  return (
    <>
      <div className="flex items-center gap-4 mb-5 p-4 bg-dsa-karma/8 border border-dsa-karma/20 rounded-xl">
        <div>
          {probe.length > 0 && (
            <div className="flex gap-1 mb-1">
              {probe.map((attr, i) => {
                const meta = ATTR_META[attr]
                const AttrIcon = meta?.icon
                return (
                  <Fragment key={i}>
                    {i > 0 && <span className="text-dsa-parchment-dark/30 self-center">/</span>}
                    <Tooltip term={attr}>
                      <span className={clsx(
                        'inline-flex items-center gap-1 px-2 py-1 rounded-lg text-sm border cursor-help',
                        meta ? meta.bg : 'bg-dsa-karma/15 border-dsa-karma/30'
                      )}>
                        {AttrIcon && <AttrIcon className={clsx('w-3.5 h-3.5', meta?.color)} />}
                        <span className={clsx('font-bold', meta?.color || 'text-dsa-karma-light')}>{attr}</span>
                      </span>
                    </Tooltip>
                  </Fragment>
                )
              })}
            </div>
          )}
          <div className="text-[10px] text-dsa-parchment-dark uppercase tracking-wide">Probe</div>
        </div>
        {data.kap_cost && (
          <div className="ml-auto text-right">
            <div className="flex items-center gap-1 justify-end">
              <Star className="w-4 h-4 text-dsa-karma-light" />
              <span className="text-xl font-bold text-dsa-karma-light">{data.kap_cost}</span>
            </div>
            <div className="text-[10px] text-dsa-parchment-dark uppercase tracking-wide"><TipAbbr term="KaP" />-Kosten</div>
          </div>
        )}
      </div>

      <DetailSection title="Wirkung">
        <div className="space-y-0">
          <InfoRow label="Liturgiedauer" value={data.casting_time} />
          <InfoRow label="Reichweite" value={data.range} />
          <InfoRow label="Wirkungsdauer" value={data.duration} />
          <InfoRow label="Ziel" value={data.target} />
          <InfoRow label="Schaden" value={data.damage} />
        </div>
      </DetailSection>

      {data.tradition && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {(Array.isArray(data.tradition) ? data.tradition : [data.tradition]).map((t, i) => (
            <span key={i} className="text-xs bg-dsa-karma/10 text-dsa-karma-light border border-dsa-karma/20 px-2 py-0.5 rounded">
              {t}
            </span>
          ))}
        </div>
      )}

      {data.description && (
        <p className="text-sm text-dsa-parchment-dark leading-relaxed italic border-l-2 border-dsa-karma/30 pl-3">
          {data.description}
        </p>
      )}
    </>
  )
}

function SpecialAbilityDetail({ data }) {
  return (
    <>
      {data.ap_cost && (
        <div className="flex items-center gap-3 mb-5 p-3 bg-dsa-gold/8 border border-dsa-gold/20 rounded-xl">
          <Coins className="w-5 h-5 text-dsa-gold/60" />
          <div>
            <span className="text-xl font-bold text-dsa-gold">{data.ap_cost}</span>
            <span className="text-sm text-dsa-parchment-dark ml-1.5">Abenteuerpunkte</span>
          </div>
          {data.category && (
            <span className="ml-auto text-xs bg-dsa-bg-medium text-dsa-parchment-dark border border-dsa-bg-medium px-2 py-0.5 rounded">
              {data.category}
            </span>
          )}
        </div>
      )}

      {(data.at_mod || data.pa_mod || data.damage_modifier) && (
        <DetailSection title="Kampfmodifikatoren">
          <div className="flex gap-2">
            {data.at_mod && <ModChip label="AT" value={data.at_mod} />}
            {data.pa_mod && <ModChip label="PA" value={data.pa_mod} />}
            {data.damage_modifier && <StatPill label="TP" value={data.damage_modifier} />}
          </div>
        </DetailSection>
      )}

      {data.prerequisites && data.prerequisites.length > 0 && (
        <DetailSection title="Voraussetzungen">
          <ul className="space-y-1.5">
            {data.prerequisites.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-dsa-parchment-dark">
                <span className="text-dsa-gold/60 mt-0.5">◆</span>
                {typeof p === 'string' ? p : JSON.stringify(p)}
              </li>
            ))}
          </ul>
        </DetailSection>
      )}

      {data.applicable_techniques && data.applicable_techniques.length > 0 && (
        <DetailSection title="Kampftechniken">
          <div className="flex flex-wrap gap-1.5">
            {data.applicable_techniques.map((t, i) => (
              <span key={i} className="text-xs bg-dsa-bg-medium text-dsa-parchment-dark border border-dsa-bg-medium px-2 py-0.5 rounded">
                {t}
              </span>
            ))}
          </div>
        </DetailSection>
      )}

      {data.rules_text && (
        <DetailSection title="Regeln">
          <p className="text-sm text-dsa-parchment-dark leading-relaxed">{data.rules_text}</p>
        </DetailSection>
      )}

      {data.description && (
        <p className="text-sm text-dsa-parchment-dark mt-2 leading-relaxed italic border-l-2 border-dsa-gold/20 pl-3">
          {data.description}
        </p>
      )}
    </>
  )
}

function TalentDetail({ data }) {
  const probe = Array.isArray(data.probe) ? data.probe : (data.probe ? data.probe.split('/') : [])
  return (
    <>
      {probe.length > 0 && (
        <div className="flex items-center gap-3 mb-5 p-3 bg-dsa-bg-medium/60 border border-dsa-bg-medium rounded-xl">
          <Target className="w-5 h-5 text-dsa-parchment-dark/60" />
          <div className="flex gap-1">
            {probe.map((attr, i) => {
              const meta = ATTR_META[attr]
              const AttrIcon = meta?.icon
              return (
                <Fragment key={i}>
                  {i > 0 && <span className="text-dsa-parchment-dark/30 self-center text-sm">/</span>}
                  <Tooltip term={attr}>
                    <span className={clsx(
                      'inline-flex items-center gap-1 px-2 py-1 rounded-lg text-sm border cursor-help',
                      meta ? meta.bg : 'bg-dsa-bg border-dsa-bg-medium'
                    )}>
                      {AttrIcon && <AttrIcon className={clsx('w-3.5 h-3.5', meta?.color)} />}
                      <span className={clsx('font-bold', meta?.color || 'text-dsa-parchment')}>{attr}</span>
                    </span>
                  </Tooltip>
                </Fragment>
              )
            })}
          </div>
          {data.category && (
            <span className="ml-auto text-xs bg-dsa-bg text-dsa-parchment-dark border border-dsa-bg-medium px-2 py-0.5 rounded">
              {data.category}
            </span>
          )}
        </div>
      )}

      <DetailSection title="Details">
        <div className="space-y-0">
          <InfoRow label="Belastung" value={data.encumbrance} />
        </div>
      </DetailSection>

      {data.applications && data.applications.length > 0 && (
        <DetailSection title="Anwendungsgebiete">
          <div className="flex flex-wrap gap-1.5">
            {data.applications.map((app, i) => (
              <span key={i} className="text-xs bg-dsa-bg-medium text-dsa-parchment-dark border border-dsa-bg-medium px-2 py-1 rounded">
                {typeof app === 'string' ? app : app.name || JSON.stringify(app)}
              </span>
            ))}
          </div>
        </DetailSection>
      )}

      {data.description && (
        <p className="text-sm text-dsa-parchment-dark mt-2 leading-relaxed italic border-l-2 border-dsa-parchment-dark/20 pl-3">
          {data.description}
        </p>
      )}
    </>
  )
}

const DETAIL_RENDERERS = {
  creatures: CreatureDetail,
  weapons: WeaponDetail,
  armor: ArmorDetail,
  shields: ShieldDetail,
  items: ItemDetail,
  spells: SpellDetail,
  liturgies: LiturgyDetail,
  special_abilities: SpecialAbilityDetail,
  talents: TalentDetail,
}

// ---------------------------------------------------------------------------
// Detail popup modal — shared between DatenbankTab and DataBrowser
// ---------------------------------------------------------------------------

/**
 * @param {object}   data       Full item data object (from individual API fetch)
 * @param {string}   name       Display name (shown while data loads)
 * @param {string}   category   Category key (creatures, weapons, etc.)
 * @param {boolean}  loading    Show spinner while fetching
 * @param {boolean}  isOwn      Show edit/delete buttons
 * @param {function} onClose    Close callback
 * @param {function} [onEdit]   Edit callback (optional)
 * @param {function} [onDelete] Delete callback (optional)
 * @param {function} [onSelect] "Auswählen" callback for picker mode (optional)
 */
export default function DatenbankDetailModal({ data, name, category, loading, isOwn, onClose, onEdit, onDelete, onSelect }) {
  const cat = CAT[category] || CAT.items
  const Icon = cat.icon
  const Renderer = DETAIL_RENDERERS[category]
  const customUsername = data?.created_by_username

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="relative z-10 bg-dsa-bg border border-dsa-bg-medium rounded-xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Hero header */}
        <div className={clsx('px-5 py-4 bg-gradient-to-r flex-shrink-0 rounded-t-xl border-b border-dsa-bg-medium', cat.heroBg)}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="p-2 rounded-xl bg-dsa-bg/40 border border-dsa-bg-medium shrink-0">
                <Icon className={clsx('w-6 h-6', cat.titleColor)} />
              </div>
              <div className="min-w-0">
                <h2 className={clsx('text-xl font-display font-bold leading-tight mb-1 truncate', cat.titleColor)}>
                  {name}
                </h2>
                <span className={clsx('text-xs px-2 py-0.5 rounded-full', cat.tagBg)}>
                  {CATEGORY_LABEL[category] || category}
                </span>
                {data?.category && data.category !== CATEGORY_LABEL[category] && (
                  <span className="ml-2 text-xs text-dsa-parchment-dark">{data.category}</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {onSelect && (
                <button
                  onClick={onSelect}
                  className="btn-primary text-xs py-1 px-3 mr-1"
                >
                  Auswählen
                </button>
              )}
              {isOwn && onEdit && (
                <button
                  onClick={onEdit}
                  className="p-1.5 text-dsa-parchment-dark hover:text-dsa-gold transition-colors rounded"
                  title="Bearbeiten"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              )}
              {isOwn && onDelete && (
                <button
                  onClick={onDelete}
                  className="p-1.5 text-dsa-parchment-dark hover:text-dsa-danger transition-colors rounded"
                  title="Löschen"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1.5 text-dsa-parchment-dark hover:text-dsa-parchment transition-colors rounded"
                title="Schließen"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {customUsername && (
            <div className="mt-3">
              <CustomBadge username={customUsername} />
            </div>
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center gap-2 py-6 justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-dsa-gold" />
              <span className="text-sm text-dsa-parchment-dark">Lade Details…</span>
            </div>
          ) : Renderer && data ? (
            <Renderer data={data} />
          ) : data ? (
            <pre className="text-xs text-dsa-parchment-dark overflow-auto whitespace-pre-wrap">
              {JSON.stringify(data, null, 2)}
            </pre>
          ) : null}
        </div>
      </div>
    </div>
  )
}
