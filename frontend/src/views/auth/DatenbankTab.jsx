import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import {
  Search, Skull, Swords, Shield, ShieldHalf, Package, Sparkles, Star,
  Zap, BookOpen, Plus, Loader2, ArrowLeft, Pencil, Trash2, Menu, X,
  ChevronLeft, ChevronRight, Heart, Coins, Clock, Target, Flame,
  Wind, Eye, ChevronDown, Database, Brain, Hand, HeartPulse, Hammer, Crown,
} from 'lucide-react'
import clsx from 'clsx'
import useDatenbankStore from '../../stores/datenbankStore'
import useAuthStore from '../../stores/authStore'
import CreateEntryModal from './CreateEntryModal'
import EditEntryModal from './EditEntryModal'
import { Tooltip } from '../../components/Tooltip'

// ---------------------------------------------------------------------------
// Category config — every token is a static string for Tailwind JIT
// ---------------------------------------------------------------------------

const CATEGORIES = [
  {
    id: 'creatures',
    label: 'Kreaturen',
    icon: Skull,
    titleColor: 'text-dsa-gold',
    borderAccent: 'border-l-4 border-l-dsa-gold',
    cardHover: 'hover:border-dsa-gold/40 hover:shadow-dsa-gold/5',
    heroBg: 'from-dsa-gold/15 via-dsa-gold/5 to-transparent',
    iconColor: 'text-dsa-gold/60',
    tagBg: 'bg-dsa-gold/15 text-dsa-gold border border-dsa-gold/20',
    pillBg: 'bg-dsa-gold/10 border border-dsa-gold/25 text-dsa-gold',
    activeStyle: 'bg-dsa-gold/10 text-dsa-gold border-l-4 border-l-dsa-gold font-medium',
    statColor: 'text-dsa-gold',
  },
  {
    id: 'weapons',
    label: 'Waffen',
    icon: Swords,
    titleColor: 'text-dsa-rust-light',
    borderAccent: 'border-l-4 border-l-dsa-rust',
    cardHover: 'hover:border-dsa-rust/40',
    heroBg: 'from-dsa-rust/15 via-dsa-rust/5 to-transparent',
    iconColor: 'text-dsa-rust/60',
    tagBg: 'bg-dsa-rust/15 text-dsa-rust-light border border-dsa-rust/20',
    pillBg: 'bg-dsa-rust/10 border border-dsa-rust/25 text-dsa-rust-light',
    activeStyle: 'bg-dsa-rust/10 text-dsa-rust-light border-l-4 border-l-dsa-rust font-medium',
    statColor: 'text-dsa-rust-light',
  },
  {
    id: 'armor',
    label: 'Rüstungen',
    icon: Shield,
    titleColor: 'text-dsa-parchment',
    borderAccent: 'border-l-4 border-l-dsa-parchment-dark',
    cardHover: 'hover:border-dsa-parchment-dark/30',
    heroBg: 'from-dsa-parchment/8 via-dsa-parchment/3 to-transparent',
    iconColor: 'text-dsa-parchment/40',
    tagBg: 'bg-dsa-parchment/10 text-dsa-parchment border border-dsa-parchment/15',
    pillBg: 'bg-dsa-bg-medium border border-dsa-bg-medium text-dsa-parchment',
    activeStyle: 'bg-dsa-parchment/8 text-dsa-parchment border-l-4 border-l-dsa-parchment-dark font-medium',
    statColor: 'text-dsa-parchment',
  },
  {
    id: 'shields',
    label: 'Schilde',
    icon: ShieldHalf,
    titleColor: 'text-dsa-parchment',
    borderAccent: 'border-l-4 border-l-dsa-parchment-dark',
    cardHover: 'hover:border-dsa-parchment-dark/30',
    heroBg: 'from-dsa-parchment/8 via-dsa-parchment/3 to-transparent',
    iconColor: 'text-dsa-parchment/40',
    tagBg: 'bg-dsa-parchment/10 text-dsa-parchment border border-dsa-parchment/15',
    pillBg: 'bg-dsa-bg-medium border border-dsa-bg-medium text-dsa-parchment',
    activeStyle: 'bg-dsa-parchment/8 text-dsa-parchment border-l-4 border-l-dsa-parchment-dark font-medium',
    statColor: 'text-dsa-parchment',
  },
  {
    id: 'items',
    label: 'Gegenstände',
    icon: Package,
    titleColor: 'text-dsa-forest-light',
    borderAccent: 'border-l-4 border-l-dsa-forest',
    cardHover: 'hover:border-dsa-forest/40',
    heroBg: 'from-dsa-forest/15 via-dsa-forest/5 to-transparent',
    iconColor: 'text-dsa-forest/60',
    tagBg: 'bg-dsa-forest/15 text-dsa-forest-light border border-dsa-forest/20',
    pillBg: 'bg-dsa-forest/10 border border-dsa-forest/25 text-dsa-forest-light',
    activeStyle: 'bg-dsa-forest/10 text-dsa-forest-light border-l-4 border-l-dsa-forest font-medium',
    statColor: 'text-dsa-forest-light',
  },
  {
    id: 'spells',
    label: 'Zauber',
    icon: Sparkles,
    titleColor: 'text-dsa-mana-light',
    borderAccent: 'border-l-4 border-l-dsa-mana',
    cardHover: 'hover:border-dsa-mana/40',
    heroBg: 'from-dsa-mana/15 via-dsa-mana/5 to-transparent',
    iconColor: 'text-dsa-mana/60',
    tagBg: 'bg-dsa-mana/15 text-dsa-mana-light border border-dsa-mana/20',
    pillBg: 'bg-dsa-mana/10 border border-dsa-mana/25 text-dsa-mana-light',
    activeStyle: 'bg-dsa-mana/10 text-dsa-mana-light border-l-4 border-l-dsa-mana font-medium',
    statColor: 'text-dsa-mana-light',
  },
  {
    id: 'liturgies',
    label: 'Liturgien',
    icon: Star,
    titleColor: 'text-dsa-karma-light',
    borderAccent: 'border-l-4 border-l-dsa-karma',
    cardHover: 'hover:border-dsa-karma/40',
    heroBg: 'from-dsa-karma/15 via-dsa-karma/5 to-transparent',
    iconColor: 'text-dsa-karma/60',
    tagBg: 'bg-dsa-karma/15 text-dsa-karma-light border border-dsa-karma/20',
    pillBg: 'bg-dsa-karma/10 border border-dsa-karma/25 text-dsa-karma-light',
    activeStyle: 'bg-dsa-karma/10 text-dsa-karma-light border-l-4 border-l-dsa-karma font-medium',
    statColor: 'text-dsa-karma-light',
  },
  {
    id: 'special_abilities',
    label: 'Sonderfertigkeiten',
    icon: Zap,
    titleColor: 'text-dsa-gold-light',
    borderAccent: 'border-l-4 border-l-dsa-gold',
    cardHover: 'hover:border-dsa-gold/30',
    heroBg: 'from-dsa-gold/10 via-dsa-gold/4 to-transparent',
    iconColor: 'text-dsa-gold/50',
    tagBg: 'bg-dsa-gold/10 text-dsa-gold-light border border-dsa-gold/15',
    pillBg: 'bg-dsa-gold/8 border border-dsa-gold/20 text-dsa-gold-light',
    activeStyle: 'bg-dsa-gold/8 text-dsa-gold-light border-l-4 border-l-dsa-gold font-medium',
    statColor: 'text-dsa-gold-light',
  },
  {
    id: 'talents',
    label: 'Talente',
    icon: BookOpen,
    titleColor: 'text-dsa-parchment',
    borderAccent: 'border-l-4 border-l-dsa-parchment-dark',
    cardHover: 'hover:border-dsa-parchment-dark/30',
    heroBg: 'from-dsa-parchment/6 via-transparent to-transparent',
    iconColor: 'text-dsa-parchment/30',
    tagBg: 'bg-dsa-bg-medium text-dsa-parchment-dark border border-dsa-bg-medium',
    pillBg: 'bg-dsa-bg-medium border border-dsa-bg-medium text-dsa-parchment-dark',
    activeStyle: 'bg-dsa-bg-medium text-dsa-parchment border-l-4 border-l-dsa-parchment-dark font-medium',
    statColor: 'text-dsa-parchment-dark',
  },
]

const CAT = Object.fromEntries(CATEGORIES.map(c => [c.id, c]))
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map(c => [c.id, c.label]))

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

// ---------------------------------------------------------------------------
// Mini stat chips for list cards
// ---------------------------------------------------------------------------

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
      {label} {value >= 0 ? '+' : ''}{value}
    </span>
  )
}

// ---------------------------------------------------------------------------
// List card preview — per category
// ---------------------------------------------------------------------------

function CreatureListCard({ entry, cat }) {
  const cv = entry.combat_values || {}
  return (
    <>
      <div className="flex items-center gap-1.5 mb-1">
        <cat.icon className={clsx('w-3.5 h-3.5 flex-shrink-0', cat.iconColor)} />
        <span className="font-semibold text-dsa-parchment group-hover:text-dsa-gold transition-colors text-xs leading-tight">
          {entry.name}
        </span>
        {entry.is_custom && entry.created_by_username && (
          <CustomBadge username={entry.created_by_username} mini />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1 ml-5">
        {entry.category && (
          <span className="text-[10px] text-dsa-parchment-dark/60 italic">{entry.category}</span>
        )}
        {cv.LeP !== undefined && (
          <StatChip label="LeP" value={cv.LeP} className="bg-dsa-blood/15 text-red-400 border border-dsa-blood/20" />
        )}
        {cv.RS !== undefined && (
          <StatChip label="RS" value={cv.RS} className="bg-dsa-bg-medium text-dsa-parchment border border-dsa-bg-medium" />
        )}
        {cv.AT !== undefined && (
          <StatChip label="AT" value={cv.AT} className="bg-dsa-gold/10 text-dsa-gold border border-dsa-gold/20" />
        )}
        {cv.PA !== undefined && (
          <StatChip label="PA" value={cv.PA} className="bg-dsa-gold/10 text-dsa-gold border border-dsa-gold/20" />
        )}
        {cv.GS !== undefined && (
          <StatChip label="GS" value={cv.GS} className="bg-dsa-bg-medium text-dsa-parchment-dark border border-dsa-bg-medium" />
        )}
      </div>
    </>
  )
}

function WeaponListCard({ entry, cat }) {
  return (
    <>
      <div className="flex items-center gap-1.5 mb-1">
        <cat.icon className={clsx('w-3.5 h-3.5 flex-shrink-0', cat.iconColor)} />
        <span className="font-semibold text-dsa-parchment group-hover:text-dsa-rust-light transition-colors text-xs leading-tight">
          {entry.name}
        </span>
        {entry.is_ranged && (
          <span className="text-[10px] bg-dsa-mana/10 text-dsa-mana-light border border-dsa-mana/20 px-1 py-px rounded">FK</span>
        )}
        {entry.is_custom && entry.created_by_username && (
          <CustomBadge username={entry.created_by_username} mini />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1 ml-5">
        {entry.damage && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-dsa-rust/15 border border-dsa-rust/25 text-dsa-rust-light text-xs font-bold">
            <Flame className="w-3 h-3" />
            {entry.damage}
          </span>
        )}
        {entry.at_mod !== undefined && <ModChip label="AT" value={entry.at_mod} />}
        {entry.pa_mod !== undefined && <ModChip label="PA" value={entry.pa_mod} />}
        {entry.reach && (
          <span className="text-[10px] bg-dsa-bg-medium text-dsa-parchment-dark border border-dsa-bg-medium px-1.5 py-0.5 rounded">
            RW {entry.reach}
          </span>
        )}
      </div>
    </>
  )
}

function ArmorListCard({ entry, cat }) {
  return (
    <>
      <div className="flex items-center gap-1.5 mb-1">
        <cat.icon className={clsx('w-3.5 h-3.5 flex-shrink-0', cat.iconColor)} />
        <span className="font-semibold text-dsa-parchment group-hover:text-dsa-parchment-dark transition-colors text-xs">
          {entry.name}
        </span>
        {entry.is_custom && entry.created_by_username && (
          <CustomBadge username={entry.created_by_username} mini />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1 ml-5">
        {entry.rs !== undefined && (
          <StatChip label="RS" value={entry.rs} className="bg-dsa-bg-medium text-dsa-parchment border border-dsa-bg-medium font-bold" />
        )}
        {entry.be !== undefined && (
          <StatChip label="BE" value={entry.be} className="bg-dsa-bg-medium text-dsa-parchment-dark border border-dsa-bg-medium" />
        )}
        {entry.weight && (
          <span className="text-[10px] text-dsa-parchment-dark/60">{entry.weight} Stn</span>
        )}
      </div>
    </>
  )
}

function SpellListCard({ entry, cat }) {
  const probe = Array.isArray(entry.probe) ? entry.probe : (entry.probe ? [entry.probe] : [])
  return (
    <>
      <div className="flex items-center gap-1.5 mb-1">
        <cat.icon className={clsx('w-3.5 h-3.5 flex-shrink-0', cat.iconColor)} />
        <span className="font-semibold text-dsa-parchment group-hover:text-dsa-mana-light transition-colors text-xs">
          {entry.name}
        </span>
        {entry.is_custom && entry.created_by_username && (
          <CustomBadge username={entry.created_by_username} mini />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1 ml-5">
        {probe.length > 0 && (
          <div className="flex items-center gap-0.5">
            {probe.map((attr, i) => (
              <span key={i} className="text-[10px] bg-dsa-mana/10 text-dsa-mana-light border border-dsa-mana/20 px-1.5 py-0.5 rounded font-bold">
                {attr}
              </span>
            ))}
          </div>
        )}
        {entry.asp_cost && (
          <span className="inline-flex items-center gap-1 text-xs bg-dsa-mana/15 text-dsa-mana-light border border-dsa-mana/25 px-1.5 py-0.5 rounded">
            <Sparkles className="w-2.5 h-2.5" />
            {entry.asp_cost} AsP
          </span>
        )}
        {entry.casting_time && (
          <span className="text-[10px] text-dsa-parchment-dark/60 flex items-center gap-0.5">
            <Clock className="w-2.5 h-2.5" />{entry.casting_time}
          </span>
        )}
      </div>
    </>
  )
}

function LiturgyListCard({ entry, cat }) {
  const probe = Array.isArray(entry.probe) ? entry.probe : (entry.probe ? [entry.probe] : [])
  return (
    <>
      <div className="flex items-center gap-1.5 mb-1">
        <cat.icon className={clsx('w-3.5 h-3.5 flex-shrink-0', cat.iconColor)} />
        <span className="font-semibold text-dsa-parchment group-hover:text-dsa-karma-light transition-colors text-xs">
          {entry.name}
        </span>
        {entry.is_custom && entry.created_by_username && (
          <CustomBadge username={entry.created_by_username} mini />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1 ml-5">
        {probe.length > 0 && (
          <div className="flex items-center gap-0.5">
            {probe.map((attr, i) => (
              <span key={i} className="text-[10px] bg-dsa-karma/10 text-dsa-karma-light border border-dsa-karma/20 px-1.5 py-0.5 rounded font-bold">
                {attr}
              </span>
            ))}
          </div>
        )}
        {entry.kap_cost && (
          <span className="inline-flex items-center gap-1 text-xs bg-dsa-karma/15 text-dsa-karma-light border border-dsa-karma/25 px-1.5 py-0.5 rounded">
            <Star className="w-2.5 h-2.5" />
            {entry.kap_cost} KaP
          </span>
        )}
      </div>
    </>
  )
}

function GenericListCard({ entry, cat, previewText }) {
  const Icon = cat.icon
  return (
    <>
      <div className="flex items-center gap-1.5 mb-0.5">
        <Icon className={clsx('w-3.5 h-3.5 flex-shrink-0', cat.iconColor)} />
        <span className={clsx('font-semibold text-dsa-parchment transition-colors text-xs group-hover:', cat.titleColor)}>
          {entry.name}
        </span>
        {entry.is_custom && entry.created_by_username && (
          <CustomBadge username={entry.created_by_username} mini />
        )}
      </div>
      {previewText && (
        <p className="text-[10px] text-dsa-parchment-dark/70 ml-5 truncate">{previewText}</p>
      )}
    </>
  )
}

function EntryListCard({ entry, category, onToggleExpand, expanded, expandedData, expandedLoading, onEdit, onDelete, isOwn }) {
  const cat = CAT[category] || CAT.items
  const preview = getPreviewText(category, entry)
  // DETAIL_RENDERERS is defined later in the file but accessed at render time (fine in JS)
  const Renderer = DETAIL_RENDERERS[category]

  return (
    <div className={clsx(
      'fantasy-card border border-dsa-bg-medium transition-all duration-150 animate-fade-in overflow-hidden',
      cat.borderAccent,
      cat.cardHover,
    )}>
      {/* Clickable header row */}
      <div
        onClick={() => onToggleExpand(entry)}
        className="px-3 py-2 cursor-pointer group flex items-start justify-between gap-2"
      >
        <div className="flex-1 min-w-0">
          {category === 'creatures' && <CreatureListCard entry={entry} cat={cat} />}
          {category === 'weapons' && <WeaponListCard entry={entry} cat={cat} />}
          {(category === 'armor' || category === 'shields') && <ArmorListCard entry={entry} cat={cat} />}
          {category === 'spells' && <SpellListCard entry={entry} cat={cat} />}
          {category === 'liturgies' && <LiturgyListCard entry={entry} cat={cat} />}
          {(category === 'items' || category === 'special_abilities' || category === 'talents') && (
            <GenericListCard entry={entry} cat={cat} previewText={preview} />
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
          {isOwn && (
            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
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
          <ChevronDown className={clsx(
            'w-3.5 h-3.5 text-dsa-parchment-dark/30 transition-transform duration-150 ml-0.5',
            expanded && 'rotate-180'
          )} />
        </div>
      </div>

      {/* Inline expanded detail */}
      {expanded && (
        <div className="border-t border-dsa-bg-medium/50 px-3 pb-3 pt-2.5 bg-dsa-bg/40">
          {expandedLoading ? (
            <div className="flex items-center gap-2 py-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-dsa-gold" />
              <span className="text-xs text-dsa-parchment-dark">Lade…</span>
            </div>
          ) : Renderer && expandedData ? (
            <Renderer data={expandedData.data || expandedData} cat={cat} />
          ) : null}
        </div>
      )}
    </div>
  )
}

function getPreviewText(category, entry) {
  switch (category) {
    case 'creatures': {
      const cv = entry.combat_values || {}
      const parts = []
      if (cv.LeP) parts.push(`LeP ${cv.LeP}`)
      if (cv.RS !== undefined) parts.push(`RS ${cv.RS}`)
      if (cv.GS) parts.push(`GS ${cv.GS}`)
      return parts.join(' | ') || entry.category || ''
    }
    case 'weapons': {
      const parts = []
      if (entry.damage) parts.push(`TP ${entry.damage}`)
      if (entry.at_mod !== undefined) parts.push(`AT ${entry.at_mod >= 0 ? '+' : ''}${entry.at_mod}`)
      if (entry.reach) parts.push(`RW ${entry.reach}`)
      return parts.join(' | ')
    }
    case 'armor': {
      const parts = []
      if (entry.rs !== undefined) parts.push(`RS ${entry.rs}`)
      if (entry.be !== undefined) parts.push(`BE ${entry.be}`)
      return parts.join(' | ')
    }
    case 'shields': {
      const parts = []
      if (entry.at_mod !== undefined) parts.push(`AT ${entry.at_mod >= 0 ? '+' : ''}${entry.at_mod}`)
      if (entry.pa_mod !== undefined) parts.push(`PA ${entry.pa_mod >= 0 ? '+' : ''}${entry.pa_mod}`)
      return parts.join(' | ')
    }
    case 'items': {
      const parts = []
      if (entry.category) parts.push(entry.category)
      if (entry.price) parts.push(`${entry.price} S`)
      return parts.join(' · ')
    }
    case 'spells': {
      const parts = []
      if (entry.probe) parts.push(Array.isArray(entry.probe) ? entry.probe.join('/') : entry.probe)
      if (entry.asp_cost) parts.push(`AsP ${entry.asp_cost}`)
      return parts.join(' | ')
    }
    case 'liturgies': {
      const parts = []
      if (entry.probe) parts.push(Array.isArray(entry.probe) ? entry.probe.join('/') : entry.probe)
      if (entry.kap_cost) parts.push(`KaP ${entry.kap_cost}`)
      return parts.join(' | ')
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
      return parts.join(' | ')
    }
    default: return ''
  }
}

// ---------------------------------------------------------------------------
// Shared detail UI helpers
// ---------------------------------------------------------------------------

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
      <span className="text-dsa-gold font-semibold text-xs">{label}</span>
      <span className="text-dsa-parchment font-medium">{value}</span>
    </span>
  )
}

function InfoRow({ label, value }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex items-baseline gap-2 py-1 border-b border-dsa-bg-medium/50 last:border-0">
      <span className="text-xs text-dsa-parchment-dark w-32 shrink-0">{label}</span>
      <span className="text-sm text-dsa-parchment font-medium">{value}</span>
    </div>
  )
}

function CustomBadge({ username, mini = false }) {
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

// ---------------------------------------------------------------------------
// Detail renderers per category
// ---------------------------------------------------------------------------

function CreatureDetail({ data, cat }) {
  const attrs = data.attributes || {}
  const cv = data.combat_values || {}
  const ATTR_KEYS = ['MU', 'KL', 'IN', 'CH', 'FF', 'GE', 'KO', 'KK']
  const hasAttrs = ATTR_KEYS.some(k => attrs[k] !== undefined)
  const hasCombat = Object.keys(cv).length > 0

  // Vital stats to highlight separately
  const { LeP, RS, GS, INI, ...otherCv } = cv

  return (
    <>
      {/* Vital strip */}
      {(LeP !== undefined || RS !== undefined || GS !== undefined) && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          {LeP !== undefined && (
            <div className="bg-dsa-blood/10 border border-dsa-blood/20 rounded-lg p-3 text-center">
              <Heart className="w-4 h-4 text-red-400 mx-auto mb-1" />
              <div className="text-xl font-bold text-red-400">{LeP}</div>
              <div className="text-[10px] text-dsa-parchment-dark uppercase tracking-wide">LeP</div>
            </div>
          )}
          {RS !== undefined && (
            <div className="bg-dsa-bg-medium/60 border border-dsa-bg-medium rounded-lg p-3 text-center">
              <Shield className="w-4 h-4 text-dsa-parchment-dark mx-auto mb-1" />
              <div className="text-xl font-bold text-dsa-parchment">{RS}</div>
              <div className="text-[10px] text-dsa-parchment-dark uppercase tracking-wide">RS</div>
            </div>
          )}
          {GS !== undefined && (
            <div className="bg-dsa-bg-medium/60 border border-dsa-bg-medium rounded-lg p-3 text-center">
              <Wind className="w-4 h-4 text-dsa-parchment-dark mx-auto mb-1" />
              <div className="text-xl font-bold text-dsa-parchment">{GS}</div>
              <div className="text-[10px] text-dsa-parchment-dark uppercase tracking-wide">GS</div>
            </div>
          )}
        </div>
      )}

      {data.description && (
        <p className="text-sm text-dsa-parchment-dark mb-5 leading-relaxed italic border-l-2 border-dsa-gold/30 pl-3">
          {data.description}
        </p>
      )}

      {/* Other combat values */}
      {Object.keys(otherCv).length > 0 && (
        <DetailSection title="Kampfwerte">
          <div className="flex flex-wrap gap-2">
            {Object.entries(otherCv).map(([k, v]) => (
              <StatPill key={k} label={k} value={v} accent="bg-dsa-gold/8 border border-dsa-gold/20" />
            ))}
            {INI !== undefined && <StatPill label="INI" value={INI} accent="bg-dsa-gold/8 border border-dsa-gold/20" />}
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
                {atk.TP && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-dsa-rust/15 border border-dsa-rust/25 text-dsa-rust-light text-xs font-bold">
                    <Flame className="w-3 h-3" />{atk.TP}
                  </span>
                )}
                {atk.reach && <span className="text-xs text-dsa-parchment-dark">RW {atk.reach}</span>}
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
      {/* Prominent TP display */}
      {data.damage && (
        <div className="flex items-center gap-4 mb-5 p-4 bg-dsa-rust/10 border border-dsa-rust/25 rounded-xl">
          <Flame className="w-8 h-8 text-dsa-rust-light/60" />
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
              <span key={i} className="text-xs bg-dsa-bg-medium border border-dsa-bg-medium text-dsa-parchment-dark px-2 py-0.5 rounded">
                {p}
              </span>
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
              <div className="text-[10px] text-dsa-parchment-dark uppercase tracking-wide">AT-Mod</div>
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
              <div className="text-[10px] text-dsa-parchment-dark uppercase tracking-wide">PA-Mod</div>
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

function SpellDetail({ data }) {
  const probe = Array.isArray(data.probe) ? data.probe : (data.probe ? data.probe.split('/') : [])
  return (
    <>
      {/* Probe + cost header */}
      <div className="flex items-center gap-4 mb-5 p-4 bg-dsa-mana/8 border border-dsa-mana/20 rounded-xl">
        <div>
          {probe.length > 0 && (
            <div className="flex gap-1 mb-1">
              {probe.map((attr, i) => (
                <Fragment key={i}>
                  {i > 0 && <span className="text-dsa-mana/40 self-center">/</span>}
                  <span className="px-2 py-1 bg-dsa-mana/15 border border-dsa-mana/30 rounded text-dsa-mana-light font-bold text-sm">
                    {attr}
                  </span>
                </Fragment>
              ))}
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
            <div className="text-[10px] text-dsa-parchment-dark uppercase tracking-wide">AsP-Kosten</div>
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
              {probe.map((attr, i) => (
                <Fragment key={i}>
                  {i > 0 && <span className="text-dsa-karma/40 self-center">/</span>}
                  <span className="px-2 py-1 bg-dsa-karma/15 border border-dsa-karma/30 rounded text-dsa-karma-light font-bold text-sm">
                    {attr}
                  </span>
                </Fragment>
              ))}
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
            <div className="text-[10px] text-dsa-parchment-dark uppercase tracking-wide">KaP-Kosten</div>
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

      {(data.at_modifier || data.pa_modifier || data.damage_modifier) && (
        <DetailSection title="Kampfmodifikatoren">
          <div className="flex gap-2">
            {data.at_modifier && <ModChip label="AT" value={data.at_modifier} />}
            {data.pa_modifier && <ModChip label="PA" value={data.pa_modifier} />}
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
            {probe.map((attr, i) => (
              <Fragment key={i}>
                {i > 0 && <span className="text-dsa-parchment-dark/30 self-center text-sm">/</span>}
                <span className="px-2 py-1 bg-dsa-bg border border-dsa-bg-medium rounded text-dsa-parchment font-bold text-sm">
                  {attr}
                </span>
              </Fragment>
            ))}
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
// Detail view container with hero header
// ---------------------------------------------------------------------------

function EntryDetailView({ entry, category, user, onBack, onEdit }) {
  const cat = CAT[category] || CAT.items
  const Icon = cat.icon
  const Renderer = DETAIL_RENDERERS[category]
  const isOwn = entry.data?.is_custom && entry.data?.created_by_user_id === user?.id

  return (
    <div className="max-w-2xl animate-slide-up">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-dsa-parchment-dark hover:text-dsa-gold transition-colors mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Zurück zur Liste
      </button>

      <div className="fantasy-card overflow-hidden">
        {/* Hero header */}
        <div className={clsx('px-6 pt-6 pb-5 bg-gradient-to-r', cat.heroBg)}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-4">
              <div className="p-2.5 rounded-xl bg-dsa-bg/40 border border-dsa-bg-medium">
                <Icon className={clsx('w-7 h-7', cat.titleColor)} />
              </div>
              <div>
                <h2 className={clsx('text-2xl font-display font-bold leading-tight mb-1', cat.titleColor)}>
                  {entry.name}
                </h2>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={clsx('text-xs px-2 py-0.5 rounded-full', cat.tagBg)}>
                    {CATEGORY_LABEL[category]}
                  </span>
                  {entry.data?.category && entry.data.category !== CATEGORY_LABEL[category] && (
                    <span className="text-xs text-dsa-parchment-dark">
                      {entry.data.category}
                      {entry.data.size ? ` · ${entry.data.size}` : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {isOwn && (
              <button
                onClick={onEdit}
                className="flex items-center gap-1.5 text-xs text-dsa-parchment-dark hover:text-dsa-gold transition-colors bg-dsa-bg/40 border border-dsa-bg-medium px-2.5 py-1.5 rounded-lg shrink-0"
              >
                <Pencil className="w-3.5 h-3.5" />
                Bearbeiten
              </button>
            )}
          </div>

          {entry.data?.is_custom && entry.data?.created_by_username && (
            <div className="mt-4">
              <CustomBadge username={entry.data.created_by_username} />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="px-6 pb-6 pt-4 border-t border-dsa-bg-medium">
          {Renderer ? (
            <Renderer data={entry.data || {}} cat={cat} />
          ) : (
            <pre className="text-xs text-dsa-parchment-dark overflow-auto">
              {JSON.stringify(entry.data, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

import React from 'react'

export default function DatenbankTab() {
  const category = useDatenbankStore((s) => s.category)
  const entries = useDatenbankStore((s) => s.entries)
  const totalEntries = useDatenbankStore((s) => s.totalEntries)
  const page = useDatenbankStore((s) => s.page)
  const perPage = useDatenbankStore((s) => s.perPage)
  const searchQuery = useDatenbankStore((s) => s.searchQuery)
  const customOnly = useDatenbankStore((s) => s.customOnly)
  const loading = useDatenbankStore((s) => s.loading)
  const error = useDatenbankStore((s) => s.error)
  const setCategory = useDatenbankStore((s) => s.setCategory)
  const setSearch = useDatenbankStore((s) => s.setSearch)
  const setCustomOnly = useDatenbankStore((s) => s.setCustomOnly)
  const setPage = useDatenbankStore((s) => s.setPage)
  const fetchEntries = useDatenbankStore((s) => s.fetchEntries)
  const deleteEntry = useDatenbankStore((s) => s.deleteEntry)

  const user = useAuthStore((s) => s.user)

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingEntry, setEditingEntry] = useState(null)
  const [localSearch, setLocalSearch] = useState('')
  const debounceRef = useRef(null)

  // Inline expand state
  const [expandedId, setExpandedId] = useState(null)
  const [expandedCache, setExpandedCache] = useState({})
  const [expandedLoading, setExpandedLoading] = useState(false)

  useEffect(() => { fetchEntries() }, [fetchEntries])

  // Reset expansion when switching categories
  useEffect(() => {
    setExpandedId(null)
    setExpandedCache({})
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

  const handleToggleExpand = useCallback(async (entry) => {
    if (expandedId === entry.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(entry.id)
    if (expandedCache[entry.id]) return
    setExpandedLoading(true)
    try {
      const token = useAuthStore.getState().token
      const res = await fetch(`/api/databank/${category}/${entry.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setExpandedCache(prev => ({ ...prev, [entry.id]: data }))
      }
    } finally {
      setExpandedLoading(false)
    }
  }, [expandedId, expandedCache, category])

  const handleDelete = useCallback(async (entry) => {
    if (!window.confirm(`"${entry.name}" wirklich löschen?`)) return
    await deleteEntry(category, entry.id)
  }, [deleteEntry, category])

  const totalPages = Math.max(1, Math.ceil(totalEntries / perPage))
  const activeCat = CAT[category] || CAT.items

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
          'w-60 flex-shrink-0 bg-dsa-bg border-r border-dsa-bg-medium flex flex-col overflow-hidden',
          'fixed lg:static inset-y-0 left-0 z-20 transition-transform lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        style={{ top: 'auto', height: '100%' }}
      >
        {/* Sidebar header */}
        <div className="px-4 py-3 border-b border-dsa-bg-medium">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-dsa-gold/60" />
            <h3 className="text-xs font-semibold text-dsa-gold uppercase tracking-wider">
              Datenbank
            </h3>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon
            const isActive = category === cat.id
            return (
              <button
                key={cat.id}
                onClick={() => handleCategoryClick(cat.id)}
                className={clsx(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                  isActive
                    ? cat.activeStyle
                    : `text-dsa-parchment-dark border-l-4 border-l-transparent hover:bg-dsa-bg-medium/50 hover:text-dsa-parchment`,
                )}
              >
                <Icon className={clsx(
                  'w-4 h-4 flex-shrink-0 transition-colors',
                  isActive ? cat.titleColor : 'text-dsa-parchment-dark/60'
                )} />
                <span className="flex-1 text-left">{cat.label}</span>
              </button>
            )
          })}
        </nav>

        {/* Stats footer */}
        <div className="px-4 py-3 border-t border-dsa-bg-medium">
          <div className="text-xs text-dsa-parchment-dark/50 text-center">
            {totalEntries} {totalEntries === 1 ? 'Eintrag' : 'Einträge'}
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-10 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-dsa-bg-medium bg-dsa-bg-light/30">
          {/* Category breadcrumb */}
          <div className="flex items-center gap-1.5 text-sm min-w-0">
            <activeCat.icon className={clsx('w-4 h-4 shrink-0', activeCat.titleColor)} />
            <span className={clsx('font-medium shrink-0', activeCat.titleColor)}>
              {CATEGORY_LABEL[category]}
            </span>
          </div>

          <div className="w-px h-5 bg-dsa-bg-medium mx-1" />

          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-dsa-parchment-dark/40" />
            <input
              type="text"
              value={localSearch}
              onChange={handleSearchChange}
              placeholder="Suchen..."
              className="input-field pl-9 pr-8 py-1.5 text-sm w-full"
            />
            {localSearch && (
              <button
                onClick={handleClearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-dsa-parchment-dark/50 hover:text-dsa-parchment"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <label className="flex items-center gap-2 text-xs text-dsa-parchment-dark cursor-pointer whitespace-nowrap">
            <input
              type="checkbox"
              checked={customOnly}
              onChange={(e) => setCustomOnly(e.target.checked)}
              className="rounded border-dsa-bg-medium bg-dsa-bg-card text-dsa-gold focus:ring-dsa-gold/50"
            />
            Spieler-Beiträge
          </label>

          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary flex items-center gap-1.5 py-1.5 text-sm whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Neuer Eintrag</span>
          </button>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {error && (
            <div className="mb-4 p-3 bg-dsa-danger/10 border border-dsa-danger/30 rounded-lg text-sm text-dsa-danger">
              {error}
            </div>
          )}

          {entries.length === 0 && loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-dsa-gold mb-3" />
              <p className="text-sm text-dsa-parchment-dark">Lade {CATEGORY_LABEL[category]}...</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <activeCat.icon className="w-16 h-16 text-dsa-gold/15 mb-5" />
              <p className={clsx('text-lg font-display font-semibold mb-2', activeCat.titleColor)}>
                {searchQuery || customOnly ? 'Keine Treffer' : `Keine ${CATEGORY_LABEL[category]}`}
              </p>
              <p className="text-sm text-dsa-parchment-dark/60 max-w-xs">
                {searchQuery
                  ? `Keine Einträge für "${searchQuery}" gefunden.`
                  : customOnly
                  ? 'Noch keine Spieler-Beiträge in dieser Kategorie.'
                  : `Noch keine ${CATEGORY_LABEL[category]} in der Datenbank.`}
              </p>
              {!searchQuery && !customOnly && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="btn-secondary mt-4 flex items-center gap-2 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Ersten Eintrag anlegen
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Result count */}
              {(searchQuery || customOnly) && (
                <p className="text-xs text-dsa-parchment-dark/50 mb-3">
                  {totalEntries} {totalEntries === 1 ? 'Ergebnis' : 'Ergebnisse'}
                  {searchQuery && <> für „{searchQuery}"</>}
                </p>
              )}

              <div className="space-y-1.5">
                {entries.map((entry) => (
                  <EntryListCard
                    key={entry.id}
                    entry={entry}
                    category={category}
                    onToggleExpand={handleToggleExpand}
                    expanded={expandedId === entry.id}
                    expandedData={expandedCache[entry.id] || null}
                    expandedLoading={expandedLoading && expandedId === entry.id}
                    onEdit={() => setEditingEntry(entry)}
                    onDelete={() => handleDelete(entry)}
                    isOwn={entry.is_custom && entry.created_by_user_id === user?.id}
                  />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-6 py-2">
                  <button
                    onClick={() => setPage(page - 1)}
                    disabled={page <= 1}
                    className="p-2 text-dsa-parchment-dark hover:text-dsa-gold disabled:opacity-30 disabled:cursor-not-allowed transition-colors hover:bg-dsa-bg-medium rounded-lg"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div className="flex items-center gap-1.5">
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      const p = totalPages <= 7 ? i + 1 : i < 3 ? i + 1 : i === 3 ? null : totalPages - 6 + i
                      if (p === null) return <span key="ellipsis" className="text-dsa-parchment-dark/40 px-1">…</span>
                      return (
                        <button
                          key={p}
                          onClick={() => setPage(p)}
                          className={clsx(
                            'w-8 h-8 rounded-lg text-sm transition-colors',
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
                    className="p-2 text-dsa-parchment-dark hover:text-dsa-gold disabled:opacity-30 disabled:cursor-not-allowed transition-colors hover:bg-dsa-bg-medium rounded-lg"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateEntryModal category={category} onClose={() => setShowCreateModal(false)} />
      )}
      {editingEntry && (
        <EditEntryModal category={category} entry={editingEntry} onClose={() => setEditingEntry(null)} />
      )}
    </div>
  )
}
