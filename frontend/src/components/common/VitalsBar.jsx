import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Heart, Sparkles, Sun, Weight, Coins, Shield, Swords, Crosshair, Zap, Flame, Brain, Eye, Crown, Hand, Wind, HeartPulse, Hammer, ChevronDown, AlertTriangle, Star, Footprints, Timer, Activity, ShieldAlert, Gauge, User } from 'lucide-react'
import useCharacterStore from '../../stores/characterStore'
import ProgressBar from './ProgressBar'
import { getConditionModifierGross, CONDITIONS as CONDITIONS_REF } from '../../engine/conditionsEngine'
import Badge from './Badge'
import ActiveBuffs from './ActiveBuffs'
import clsx from 'clsx'

// ── Attribute config ──
const ATTR_META = {
  MU: { name: 'Mut', icon: Flame, color: 'text-red-400',
    desc: 'Tapferkeit und Entschlossenheit. Beeinflusst Kampfproben, Zauber und Selbstbeherrschung. Helden mit hohem Mut lassen sich nicht so leicht einschüchtern.',
    derives: (v, a) => [
      { label: 'Initiative', formula: `(Mut ${v} + Gewandtheit ${a?.GE||'?'}) / 2 = ${Math.floor(((v||0)+(a?.GE||0))/2)}`, desc: 'Mut fließt zur Hälfte in die Initiative ein' },
    ] },
  KL: { name: 'Klugheit', icon: Brain, color: 'text-blue-400',
    desc: 'Logisches Denken und Wissen. Zentral für Wissenstalente, Magie und Heilkunde. Bestimmt wie viel dein Held weiß und wie schnell er lernt.',
    derives: () => [] },
  IN: { name: 'Intuition', icon: Eye, color: 'text-violet-400',
    desc: 'Bauchgefühl und Wahrnehmung. Wichtig für Sinnesschärfe, Menschenkenntnis und Fährtensuche. Bestimmt ob dein Held Gefahren früh bemerkt.',
    derives: () => [] },
  CH: { name: 'Charisma', icon: Crown, color: 'text-pink-400',
    desc: 'Ausstrahlung und Überzeugungskraft. Entscheidend für soziale Proben wie Überreden, Betören und Handel. Bestimmt wie andere auf deinen Helden reagieren.',
    derives: () => [] },
  FF: { name: 'Fingerfert.', icon: Hand, color: 'text-emerald-400',
    desc: 'Feinmotorik und Geschicklichkeit der Hände. Wichtig für Schlösserknacken, Taschendiebstahl, Handwerk und präzise Arbeiten.',
    derives: () => [] },
  GE: { name: 'Gewandth.', icon: Wind, color: 'text-cyan-400',
    desc: 'Beweglichkeit und Reaktionsschnelle des gesamten Körpers. Beeinflusst Ausweichen, Schleichen und akrobatische Aktionen.',
    derives: (v, a) => [
      { label: 'Ausweichen', formula: `Gewandtheit ${v} / 2 = ${Math.floor((v||0)/2)}`, desc: 'Gewandtheit bestimmt den Ausweichen-Grundwert' },
      { label: 'Initiative', formula: `(Mut ${a?.MU||'?'} + Gewandtheit ${v}) / 2 = ${Math.floor(((a?.MU||0)+(v||0))/2)}`, desc: 'Gewandtheit fließt zur Hälfte in die Initiative ein' },
    ] },
  KO: { name: 'Konstitution', icon: HeartPulse, color: 'text-orange-400',
    desc: 'Widerstandskraft und körperliche Belastbarkeit. Bestimmt deine Lebenspunkte, Wundschwelle und Zähigkeit. Helden mit hoher Konstitution halten mehr aus.',
    derives: (v) => [
      { label: 'Wundschwelle', formula: `Konstitution ${v} / 2 (aufgerundet) = ${Math.ceil((v||0)/2)}`, desc: 'Einzeltreffer ab diesem Schaden: Konstitutionsprobe oder Schmerz' },
    ] },
  KK: { name: 'Körperkraft', icon: Hammer, color: 'text-amber-400',
    desc: 'Muskelkraft und körperliche Stärke. Bestimmt den Nahkampf-Schadensbonus und wie viel dein Held tragen kann.',
    derives: (v) => [
      { label: 'Schadensbonus', formula: `(Körperkraft ${v} - 15) / 3 = +${Math.max(0,Math.floor(((v||0)-15)/3))}`, desc: 'Wird auf jeden Nahkampftreffer addiert' },
      { label: 'Traglast', formula: `Körperkraft ${v} x 2 = ${(v||0)*2} Stein`, desc: 'Maximales Tragegewicht' },
    ] },
}

// ── Portal tooltip ──
function PortalTip({ anchor, children, onClose }) {
  const [pos, setPos] = useState({ top: 0, left: 0 })
  useEffect(() => {
    if (anchor) {
      const r = anchor.getBoundingClientRect()
      setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - 260)) })
    }
  }, [anchor])
  return createPortal(
    <>
      <div className="fixed inset-0 z-[100]" onClick={onClose} />
      <div className="fixed z-[101] w-60 bg-dsa-bg-light border border-dsa-gold/30 rounded-sm shadow-2xl p-2.5 text-[11px] text-dsa-parchment leading-relaxed animate-fade-in" style={{ top: pos.top, left: pos.left }}>
        {children}
      </div>
    </>,
    document.body
  )
}

function TipLabel({ label, tip, className }) {
  const [show, setShow] = useState(false)
  const ref = useRef(null)
  return (
    <>
      <span ref={ref} className={clsx('cursor-help', className)} onClick={e => { e.stopPropagation(); setShow(!show) }}>{label}</span>
      {show && <PortalTip anchor={ref.current} onClose={() => setShow(false)}>{tip}</PortalTip>}
    </>
  )
}

// ── Value quality color ──
function valColor(val) {
  if (val == null) return 'text-dsa-parchment-dark/30'
  if (val <= 0) return 'text-red-500'
  if (val >= 14) return 'text-green-400'
  if (val >= 10) return 'text-dsa-parchment'
  if (val >= 6) return 'text-amber-400'
  return 'text-red-400'
}

// ── Stat cell (icon color = value color, gross condition indicators in corners) ──
function StatCell({ label, val, icon: Icon, iconCls, tip, condPos = 0, condNeg = 0 }) {
  const valCls = iconCls || 'text-dsa-parchment'
  return (
    <TipLabel label={
      <span className="flex flex-col items-center w-[68px] py-1 border rounded-sm border-dsa-bg-medium bg-dsa-bg-card relative">
        {condNeg < 0 && <span className="absolute top-0.5 right-0.5 text-[7px] font-mono font-bold text-red-400 leading-none">{condNeg}</span>}
        {condPos > 0 && <span className="absolute top-0.5 left-0.5 text-[7px] font-mono font-bold text-green-400 leading-none">+{condPos}</span>}
        {Icon && <Icon className={clsx('w-3 h-3', iconCls || 'text-dsa-parchment-dark/40')} />}
        <span className={clsx('text-base font-mono font-bold leading-tight', valCls)}>{val ?? 0}</span>
        <span className="text-[7px] text-dsa-parchment leading-tight text-center w-full">{label}</span>
      </span>
    } tip={tip} />
  )
}

// ── Fate diamond SVG ──
function FateDiamond() {
  return (
    <svg viewBox="0 0 12 12" className="w-4 h-4 text-dsa-gold">
      <polygon points="6,1 11,6 6,11 1,6" fill="currentColor" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

function VitalsBar({
  portraitUrl = null, characterName = null,
  lep = 0, lepMax = 30, asp = 0, aspMax = 0, kap = 0, kapMax = 0,
  schip = 0, schipMax = 3, conditions = [], characterId = null,
  compact = false, className,
  weight = null, weightMax = null, money = null,
  sk = null, zk = null, rs = null, be = null,
  ap = null, apAvailable = null, experienceGrade = null, attributes = null,
  combatAT = null, combatPA = null, combatFK = null, combatAW = null,
  combatINI = null, combatGS = null,
  baseAT = null, basePA = null, baseFK = null, baseAW = null,
  baseINI = null, baseGS = null,
  wundschwelle = null, schadensbonus = null,
  primaryMelee = null, primaryRanged = null, shieldPA = 0, lookupKTW = null, derivedValues = {},
  rawBE = 0, beReduction = 0,
}) {
  const lepPct = lepMax > 0 ? lep / lepMax : 0
  const showAsp = aspMax > 0
  const showKap = kapMax > 0
  const ko = attributes?.KO || 0
  const ws = wundschwelle ?? Math.ceil(ko / 2)
  const sb = schadensbonus ?? Math.max(0, Math.floor(((attributes?.KK || 0) - 15) / 3))

  // Gross condition modifiers per stat
  const cg = (stat) => getConditionModifierGross(conditions, stat)

  // SF effects on derived stats
  const charSpecials = useCharacterStore?.getState?.()?.myCharacter?.special_abilities || []
  const sfLines = (stat) => {
    const results = []
    const superseded = new Set()
    const checks = {
      'INI': [
        { match: /kampfreflexe/i, val: 2, label: 'Kampfreflexe' },
      ],
      'AW': [
        { match: /verbessertes ausweichen.*II|verbessertes ausweichen.*2/i, val: 4, label: 'Verbessertes Ausweichen II' },
        { match: /verbessertes ausweichen.*I|verbessertes ausweichen(?!.*II)/i, val: 2, label: 'Verbessertes Ausweichen I' },
        { match: /kampfgesp/i, val: 1, label: 'Kampfgespür' },
      ],
      'BE': [
        // II supersedes I — only show the highest level, not both
        { match: /stungsgew.*II|stungsgewöhnung.*II/i, val: -2, label: 'Rüstungsgewöhnung II', supersedes: /stungsgew.*I/i },
        { match: /stungsgew.*I|stungsgewöhnung.*I/i, val: -1, label: 'Rüstungsgewöhnung I' },
      ],
    }
    // First pass: find superseding SFs
    for (const sf of charSpecials) {
      for (const c of (checks[stat] || [])) {
        if (c.match.test(sf) && c.supersedes) {
          // Mark lower-level SFs as superseded
          for (const sf2 of charSpecials) { if (c.supersedes.test(sf2) && sf2 !== sf) superseded.add(sf2) }
        }
      }
    }
    // Second pass: collect non-superseded SFs
    for (const sf of charSpecials) {
      if (superseded.has(sf)) continue
      for (const c of (checks[stat] || [])) {
        if (c.match.test(sf)) { results.push({ label: sf, val: c.val }); break }
      }
    }
    return results
  }

  // Build rich tooltip with full derivation
  const condBreakdown = (stat) => {
    if (!conditions || conditions.length === 0) return ''
    const parts = []
    for (const c of conditions) {
      const def = CONDITIONS_REF[c.name]
      if (!def) continue
      const level = c.level || 1
      let val = 0
      if (def.perLevel?.[stat]) val += def.perLevel[stat] * level
      if (def.flat?.[stat]) val += def.flat[stat]
      if (val !== 0) parts.push(`${c.name} ${['','I','II','III','IV'][Math.min(level,4)]}: ${val > 0 ? '+' : ''}${val}`)
    }
    return parts.length > 0 ? '\nZustände: ' + parts.join(', ') : ''
  }

  const valInterpret = (val, type) => {
    if (type === 'roll') {
      if (val <= 0) return 'Nicht möglich — Wert zu niedrig.'
      if (val >= 16) return 'Hervorragend — trifft fast immer (80%+).'
      if (val >= 12) return 'Gut — gelingt meistens (60%).'
      if (val >= 8) return 'Durchschnittlich — etwa jeder zweite Versuch (40%).'
      if (val >= 4) return 'Schwach — gelingt selten (20%).'
      return 'Sehr schlecht — fast unmöglich.'
    }
    return ''
  }

  const noiseStyle = {
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='64' height='64' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E")`
  }

  return (
    <div className={clsx('relative border border-dsa-gold/15 rounded-sm px-3 py-2', className)} style={noiseStyle}>
      <span className="absolute top-0.5 left-1.5 text-dsa-gold/20 text-[8px]">{'\u25C6'}</span>
      <span className="absolute top-0.5 right-1.5 text-dsa-gold/20 text-[8px]">{'\u25C6'}</span>

      {/* ━━ ALL STATS IN ONE ROW ━━ */}
      <div className="flex items-end gap-2 flex-wrap">

        {/* ── Portrait ── */}
        <div className="flex-shrink-0 w-[68px] h-[68px] rounded-sm border border-dsa-bg-medium overflow-hidden bg-dsa-bg-card self-center">
          {portraitUrl ? (
            <img src={portraitUrl} alt={characterName || 'Held'} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-dsa-parchment-dark/30">
              <User className="w-8 h-8" />
            </div>
          )}
        </div>

        {/* ── Energien (grouped: LeP, AsP, KaP, SchiP) ── */}
        <div className="flex flex-col flex-shrink-0 border border-dsa-bg-medium rounded-sm overflow-hidden min-w-[160px] max-w-[200px] flex-1 self-stretch">
          <div className="text-[8px] text-dsa-gold uppercase tracking-wider font-bold text-center bg-dsa-bg-card px-2 py-0.5 border-b border-dsa-bg-medium">Energien</div>
          <div className="flex flex-col gap-1 p-1.5 flex-1 justify-center">
            {/* All 4 energy bars — same style */}
            {[
              { icon: Heart, color: 'green', activeColor: lepPct > 0.5 ? 'bg-green-500' : lepPct > 0.25 ? 'bg-amber-500' : 'bg-red-500', iconCls: lepPct <= 0.25 ? 'text-red-400 animate-pulse' : 'text-green-400', cur: lep, max: lepMax, active: true, label: 'Lebenspunkte', pulse: lepPct <= 0.25 },
              ...(showAsp ? [{ icon: Sparkles, color: 'blue', activeColor: 'bg-blue-500', iconCls: 'text-blue-400', cur: asp, max: aspMax, active: true, label: 'Astralpunkte' }] : []),
              ...(showKap ? [{ icon: Sun, color: 'purple', activeColor: 'bg-purple-500', iconCls: 'text-purple-400', cur: kap, max: kapMax, active: true, label: 'Karmapunkte' }] : []),
            ].map(({ icon: BarIcon, color, activeColor, iconCls, cur, max, active, label, pulse }) => (
              <TipLabel key={label} label={
                <div className="flex items-center gap-1">
                  <BarIcon className={clsx('w-3.5 h-3.5 flex-shrink-0', active ? iconCls : `text-${color}-400/30`)} />
                  <div className="flex-1 h-2.5 rounded-full bg-dsa-bg-medium/50 relative overflow-hidden">
                    {active ? (
                      <div className={clsx('h-full rounded-full transition-all', activeColor, pulse && 'animate-pulse')} style={{ width: `${max > 0 ? Math.max(0, Math.min(100, (cur/max)*100)) : 0}%` }} />
                    ) : (
                      <div className="absolute inset-0 opacity-30" style={{ backgroundImage: `repeating-linear-gradient(135deg, transparent, transparent 3px, var(--stripe-color) 3px, var(--stripe-color) 6px)`, '--stripe-color': color === 'blue' ? 'rgba(96,165,250,0.15)' : 'rgba(168,85,247,0.15)' }} />
                    )}
                  </div>
                  <span className="text-[9px] text-dsa-parchment font-mono w-[32px] text-right">{active ? `${cur}/${max}` : 'n.a.'}</span>
                </div>
              } tip={`${label}${active ? ` = ${cur} / ${max}.` : ' — nicht verfügbar für diesen Charakter.'}`} />
            ))}
            {/* Schicksalspunkte — segmented bar */}
            <TipLabel label={
              <div className="flex items-center gap-1">
                <FateDiamond />
                <div className="flex-1 flex gap-0.5">
                  {Array.from({ length: schipMax }, (_, i) => (
                    <div key={i} className={clsx('flex-1 h-2.5 rounded-sm transition-all', i < schip ? 'bg-dsa-gold shadow-[0_0_4px_rgba(201,168,76,0.4)]' : 'bg-dsa-bg-medium/60')} />
                  ))}
                </div>
                <span className="text-[9px] text-dsa-parchment font-mono w-[32px] text-right">{schip}/{schipMax}</span>
              </div>
            } tip="Schicksalspunkte: Wurf wiederholen, Schaden halbieren, +4 Verteidigung, Zustand 1 Runde ignorieren." />
          </div>
        </div>

        {/* ── Eigenschaften 4x2 (grouped with title + border) ── */}
        {attributes && (
          <div className="flex flex-col flex-shrink-0 border border-dsa-bg-medium rounded-sm overflow-hidden">
            <div className="text-[8px] text-dsa-gold uppercase tracking-wider font-bold text-center bg-dsa-bg-card px-2 py-0.5 border-b border-dsa-bg-medium">Eigenschaften</div>
            <div className="grid grid-cols-4 gap-0.5 p-0.5">
              {Object.entries(ATTR_META).map(([k, { name, icon: Icon, color, tipFn }]) => {
                const v = attributes[k] || 0
                const quality = v >= 16 ? 'border-green-900/20 bg-green-950/30' : v <= 9 ? 'border-red-900/20 bg-red-950/30' : 'border-dsa-bg-medium bg-dsa-bg-card'
                const acg = cg(k)
                return (
                  <TipLabel key={k} label={
                    <span className={clsx('flex flex-col items-center w-[68px] py-1 border rounded-sm relative', quality)}>
                      {acg.neg < 0 && <span className="absolute top-0.5 right-0.5 text-[7px] font-mono font-bold text-red-400 leading-none">{acg.neg}</span>}
                      {acg.pos > 0 && <span className="absolute top-0.5 left-0.5 text-[7px] font-mono font-bold text-green-400 leading-none">+{acg.pos}</span>}
                      <Icon className={clsx('w-3 h-3', color)} />
                      <span className={clsx('text-base font-mono font-bold leading-tight', color)}>{v || '\u2014'}</span>
                      <span className="text-[7px] text-dsa-parchment leading-tight truncate w-full text-center">{name}</span>
                    </span>
                  } tip={(() => {
                    const condMods = conditions.filter(c => { const def = CONDITIONS_REF[c.name]; if (!def) return false; const l = c.level||1; let val=0; if(def.perLevel?.[k]) val+=def.perLevel[k]*l; if(def.flat?.[k]) val+=def.flat[k]; return val!==0 }).map(c => {
                      const def = CONDITIONS_REF[c.name]; const l=c.level||1; let val=0; if(def.perLevel?.[k]) val+=def.perLevel[k]*l; if(def.flat?.[k]) val+=def.flat[k]
                      return { label: `${c.name} ${['','I','II','III','IV'][Math.min(l,4)]}`, val }
                    })
                    const totalMod = condMods.reduce((s, m) => s + m.val, 0)
                    const effectiveVal = v + totalMod
                    return (
                      <div className="space-y-2">
                        <div>
                          <div className="text-xs font-bold text-dsa-gold">{name}</div>
                          <div className="text-[11px] text-dsa-parchment-dark mt-0.5">{ATTR_META[k].desc}</div>
                        </div>
                        <div className="bg-dsa-bg/50 border border-dsa-bg-medium rounded-sm p-2 space-y-0.5">
                          <div className="text-[10px] text-dsa-parchment-dark/50 uppercase font-bold">Berechnung</div>
                          <div className="flex justify-between text-[10px]">
                            <span className="text-dsa-parchment-dark">Basiswert (Charakterbogen)</span>
                            <span className="font-mono font-bold text-dsa-parchment">{v}</span>
                          </div>
                          {condMods.map((m, j) => (
                            <div key={j} className="flex justify-between text-[10px]">
                              <span className="text-dsa-parchment-dark">{m.label}</span>
                              <span className={clsx('font-mono font-bold', m.val > 0 ? 'text-green-400' : 'text-red-400')}>{m.val > 0 ? '+' : ''}{m.val}</span>
                            </div>
                          ))}
                          <div className="flex justify-between text-[11px] border-t border-dsa-bg-medium/50 pt-0.5 mt-0.5">
                            <span className="text-dsa-parchment font-bold">Effektiver Wert (für Proben)</span>
                            <span className="font-mono font-bold text-dsa-gold">{effectiveVal}</span>
                          </div>
                        </div>
                        <div className="text-[10px] text-dsa-parchment-dark italic">
                          {effectiveVal >= 16 ? 'Hervorragend — Proben mit diesem Wert gelingen fast immer (80%+).'
                          : effectiveVal >= 12 ? 'Gut — Proben gelingen meistens (60%).'
                          : effectiveVal >= 8 ? 'Durchschnittlich — etwa jede zweite Probe gelingt (40%).'
                          : effectiveVal >= 4 ? 'Schwach — Proben gelingen selten (20%).'
                          : 'Sehr schlecht — Proben fast unmöglich.'}
                        </div>
                        {ATTR_META[k].derives(v, attributes).length > 0 && (
                          <div className="border-t border-dsa-bg-medium/50 pt-1.5">
                            <div className="text-[10px] text-dsa-parchment-dark/50 uppercase font-bold mb-1">Beeinflusst folgende Werte</div>
                            {ATTR_META[k].derives(v, attributes).map((d, j) => (
                              <div key={j} className="mb-1">
                                <div className="text-[10px] font-bold text-dsa-parchment">{d.label}</div>
                                <div className="text-[9px] text-dsa-parchment-dark/60 font-mono">{d.formula}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })()} />
                )
              })}
            </div>
          </div>
        )}

        {/* ── Kampfwerte (Angriff + Verteidigung stacked, grouped) ── */}
        <div className="flex flex-col flex-shrink-0 border border-dsa-bg-medium rounded-sm overflow-hidden">
          <div className="text-[8px] text-dsa-gold uppercase tracking-wider font-bold text-center bg-dsa-bg-card px-2 py-0.5 border-b border-dsa-bg-medium">Kampfwerte</div>
          {(() => {
            // Build structured condition lines for tooltips
            const condLines = (stat) => conditions.filter(c => {
              const def = CONDITIONS_REF[c.name]; if (!def) return false
              const l = c.level || 1; let v = 0
              if (def.perLevel?.[stat]) v += def.perLevel[stat] * l
              if (def.flat?.[stat]) v += def.flat[stat]
              return v !== 0
            }).map(c => {
              const def = CONDITIONS_REF[c.name]; const l = c.level || 1
              let v = 0; if (def.perLevel?.[stat]) v += def.perLevel[stat] * l; if (def.flat?.[stat]) v += def.flat[stat]
              return { label: `${c.name} ${['','I','II','III','IV'][Math.min(l,4)]}`, val: v }
            })
            const TipBlock = ({ title, desc, lines, result, interpret, warning }) => (
              <div className="space-y-1.5">
                <div className="text-xs font-bold text-dsa-gold">{title}</div>
                <div className="text-[11px] text-dsa-parchment-dark">{desc}</div>
                {warning && <div className="text-[10px] font-bold text-amber-400 bg-amber-950/30 rounded-sm px-2 py-1">{warning}</div>}
                <div className="bg-dsa-bg/50 border border-dsa-bg-medium rounded-sm p-2 space-y-0.5">
                  <div className="text-[10px] text-dsa-parchment-dark/50 uppercase font-bold">Berechnung</div>
                  {lines.map((l, i) => (
                    <div key={i} className="flex justify-between text-[10px]">
                      <span className="text-dsa-parchment-dark">{l.label}</span>
                      <span className={clsx('font-mono font-bold', l.val > 0 ? 'text-green-400' : l.val < 0 ? 'text-red-400' : 'text-dsa-parchment')}>{typeof l.val === 'number' ? (l.val > 0 ? '+' : '') : ''}{l.val}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-[11px] border-t border-dsa-bg-medium/50 pt-0.5 mt-0.5">
                    <span className="text-dsa-parchment font-bold">Endwert</span>
                    <span className="font-mono font-bold text-dsa-gold">{result}</span>
                  </div>
                </div>
                {interpret && <div className="text-[10px] text-dsa-parchment-dark italic">{interpret}</div>}
              </div>
            )
            const beVal = be ?? 0
            const pw = primaryMelee; const pr = primaryRanged
            // Off-hand detection for Beidhändiger Kampf
            const allMelee = useCharacterStore?.getState?.()?.myCharacter?.combat_values?.weapons?.filter(w => !w.ranged) || []
            const allEquippedItems = useCharacterStore?.getState?.()?.myCharacter?.basis_inventory
            const eqItems = Array.isArray(allEquippedItems) ? allEquippedItems : allEquippedItems?.items || []
            const eqWeaponNames = eqItems.filter(i => i.equipped && /schwert|axt|dolch|bogen|messer|stab|kolben|speer|hammer|hellebarde|morgenstern|peitsche|keule|saebel|rapier|kriegsaxt|rondrakamm/i.test(i.name)).map(i => i.name)
            const secondWeapon = eqWeaponNames.length >= 2 ? allMelee.find(w => pw && !w.name.toLowerCase().includes(pw.name.toLowerCase().split(' ')[0]) && eqWeaponNames.some(n => n.toLowerCase().includes(w.name.toLowerCase().split(' ')[0]))) : null
            const hasBeidhaendig = charSpecials.some(s => /beidh/i.test(s))
            const beidhPenalty = charSpecials.some(s => /beidh.*II|beidh.*2/i.test(s)) ? -2 : hasBeidhaendig ? -4 : 0
            const offHandAT = secondWeapon && lookupKTW ? lookupKTW(secondWeapon.technique)?.ktw + (secondWeapon.at_mod || 0) + beidhPenalty - beVal : null
            const pwKTW = pw ? (baseAT??0) + beVal - (pw.at_mod||0) : 0
            const prKTW = pr ? (baseFK??0) + beVal - (pr.at_mod||0) : 0
            const paKTWhalf = pw ? (basePA??0) + beVal - (pw.pa_mod||0) - (shieldPA||0) : 0
            const atLines = pw ? [
              { label: `Kampftechnikwert (${pw.technique})`, val: pwKTW },
              { label: `Waffenmodifikator (${pw.name})`, val: pw.at_mod || 0 },
              ...(beVal > 0 ? [{ label: 'Behinderung (Rüstung)', val: -beVal }] : []),
              ...condLines('AT'),
            ] : [{ label: 'Keine Waffe angelegt', val: 0 }, ...(beVal > 0 ? [{ label: 'Behinderung', val: -beVal }] : []), ...condLines('AT')]
            const fkLines = pr ? [
              { label: `Kampftechnikwert (${pr.technique})`, val: prKTW },
              { label: `Waffenmodifikator (${pr.name})`, val: pr.at_mod || 0 },
              ...(beVal > 0 ? [{ label: 'Behinderung (Rüstung)', val: -beVal }] : []),
              ...condLines('FK'),
            ] : [{ label: 'Keine Fernkampfwaffe angelegt', val: 0 }, ...condLines('FK')]
            const paLines = pw ? [
              { label: `Kampftechnikwert/2 (${pw.technique})`, val: paKTWhalf },
              { label: `Waffenmodifikator (${pw.name})`, val: pw.pa_mod || 0 },
              ...(shieldPA > 0 ? [{ label: 'Schildbonus', val: shieldPA }] : []),
              ...(beVal > 0 ? [{ label: 'Behinderung (Rüstung)', val: -beVal }] : []),
              ...condLines('PA'),
            ] : [{ label: 'Keine Waffe angelegt', val: 0 }, ...condLines('PA')]
            const awLines = [
              { label: `Gewandtheit (${attributes?.GE||'?'}) / 2`, val: Math.floor((attributes?.GE||0)/2) },
              ...sfLines('AW'),
              ...(beVal > 0 ? [{ label: 'Behinderung (Rüstung)', val: -beVal }] : []),
              ...condLines('AW'),
            ]
            return (<>
              <div className="flex gap-0.5 p-0.5">
                <StatCell label="Attacke" val={combatAT ?? 0} icon={Swords} iconCls="text-red-400" condPos={cg('AT').pos} condNeg={cg('AT').neg}
                  tip={<TipBlock title="Attacke (Haupthand)" desc={`Dein Nahkampf-Angriffswert mit der Hauptwaffe${pw ? ` (${pw.name})` : ''}. Würfle 1W20: Ergebnis muss kleiner oder gleich diesem Wert sein für einen Treffer.`} lines={atLines} result={combatAT ?? 0} interpret={(() => {
                    let text = valInterpret(combatAT ?? 0, 'roll')
                    if (secondWeapon && hasBeidhaendig) {
                      const condTotal = condLines('AT').reduce((s, l) => s + (typeof l.val === 'number' ? l.val : 0), 0)
                      const offHandFinal = (offHandAT ?? 0) + condTotal
                      text += `\n\nNebenhand (${secondWeapon.name}): Du kannst mit Beidhändiger Kampf einen Zusatzangriff ausführen. Nebenhand-Attacke = ${offHandFinal} (Kampftechnikwert ${lookupKTW?.(secondWeapon.technique)?.ktw ?? 6} + Waffenmod ${secondWeapon.at_mod ?? 0} + Beidhändiger Kampf ${beidhPenalty}${beVal > 0 ? ` - Behinderung ${beVal}` : ''}${condTotal !== 0 ? ` + Zustände ${condTotal}` : ''}).`
                    }
                    return text
                  })()} warning={pw && lookupKTW && !lookupKTW(pw.technique)?.learned ? `Kampftechnik "${pw.technique}" nicht gelernt! Basiswert 6 wird verwendet.` : null} />} />
                <StatCell label="Fernkampf" val={combatFK ?? 0} icon={Crosshair} iconCls="text-emerald-400" condPos={cg('FK').pos} condNeg={cg('FK').neg}
                  tip={<TipBlock title="Fernkampf" desc="Dein Fernkampf-Angriffswert. Würfle 1W20 kleiner/gleich. Distanzmodifikatoren kommen zusätzlich hinzu." lines={fkLines} result={combatFK ?? 0} interpret={valInterpret(combatFK ?? 0, 'roll')} warning={pr && lookupKTW && !lookupKTW(pr.technique)?.learned ? `Kampftechnik "${pr.technique}" nicht gelernt! Basiswert 6 wird verwendet.` : null} />} />
                <StatCell label="Schadens-bonus" val={`+${sb}`} icon={Zap} iconCls="text-green-400"
                  tip={<TipBlock title="Schadensbonus" desc="Zusätzlicher Schaden bei jedem Nahkampftreffer durch hohe Körperkraft." lines={[{ label: `Körperkraft (${attributes?.KK||'?'})`, val: attributes?.KK||0 }, { label: 'Schwellenwert', val: -15 }, { label: 'Geteilt durch 3', val: sb }]} result={`+${sb}`} interpret={sb > 0 ? `+${sb} Schaden auf jeden Nahkampftreffer.` : 'Kein Bonus — Körperkraft unter 16.'} />} />
              </div>
              <div className="flex gap-0.5 p-0.5 pt-0 border-t border-dsa-bg-medium/50">
                <StatCell label="Parade" val={combatPA ?? 0} icon={Shield} iconCls="text-blue-400" condPos={cg('PA').pos} condNeg={cg('PA').neg}
                  tip={<TipBlock title="Parade" desc="Verteidigung mit deiner Waffe. Würfle 1W20: Ergebnis muss kleiner oder gleich diesem Wert sein." lines={paLines} result={combatPA ?? 0} interpret={valInterpret(combatPA ?? 0, 'roll')} warning={pw && lookupKTW && !lookupKTW(pw.technique)?.learned ? `Kampftechnik "${pw.technique}" nicht gelernt! Basiswert 6 wird verwendet.` : null} />} />
                <StatCell label="Ausweichen" val={combatAW ?? 0} icon={Wind} iconCls="text-cyan-400" condPos={cg('AW').pos} condNeg={cg('AW').neg}
                  tip={<TipBlock title="Ausweichen" desc="Verteidigung ohne Waffe. Alternative zur Parade. Kann auch gegen Fernkampfangriffe genutzt werden." lines={awLines} result={combatAW ?? 0} interpret={valInterpret(combatAW ?? 0, 'roll')} />} />
                <StatCell label="Rüstungs-schutz" val={rs ?? 0} icon={ShieldAlert} iconCls="text-dsa-gold"
                  tip={<TipBlock title="Rüstungsschutz" desc="Schadensreduktion durch angelegte Rüstung. Wird bei jedem Treffer automatisch vom Schaden abgezogen." lines={[{ label: 'Summe angelegter Rüstung', val: rs ?? 0 }]} result={rs ?? 0} interpret={`Effektiver Schaden = Trefferpunkte des Gegners - ${rs ?? 0}.`} />} />
              </div>
            </>)
          })()}
        </div>

        {/* ── Kampfrunde + Widerstand (merged, stacked) ── */}
        <div className="flex flex-col flex-shrink-0 border border-dsa-bg-medium rounded-sm overflow-hidden self-stretch">
          <div className="text-[8px] text-dsa-gold uppercase tracking-wider font-bold text-center bg-dsa-bg-card px-2 py-0.5 border-b border-dsa-bg-medium">Kampfrunde & Widerstand</div>
          <div className="flex gap-0.5 p-0.5">
          {(() => {
            const beVal = be ?? 0
            const condLinesFor = (stat) => conditions.filter(c => {
              const def = CONDITIONS_REF[c.name]; if (!def) return false; const l = c.level || 1; let v = 0
              if (def.perLevel?.[stat]) v += def.perLevel[stat] * l; if (def.flat?.[stat]) v += def.flat[stat]; return v !== 0
            }).map(c => { const def = CONDITIONS_REF[c.name]; const l = c.level || 1; let v = 0; if (def.perLevel?.[stat]) v += def.perLevel[stat] * l; if (def.flat?.[stat]) v += def.flat[stat]; return { label: `${c.name} ${['','I','II','III','IV'][Math.min(l,4)]}`, val: v } })
            const beVal2 = be ?? 0
            const TipBlock = ({ title, desc, lines, result, interpret, warning }) => (
              <div className="space-y-1.5">
                <div className="text-xs font-bold text-dsa-gold">{title}</div>
                <div className="text-[11px] text-dsa-parchment-dark">{desc}</div>
                {warning && <div className="text-[10px] font-bold text-amber-400 bg-amber-950/30 rounded-sm px-2 py-1">{warning}</div>}
                <div className="bg-dsa-bg/50 border border-dsa-bg-medium rounded-sm p-2 space-y-0.5">
                  <div className="text-[10px] text-dsa-parchment-dark/50 uppercase font-bold">Berechnung</div>
                  {lines.map((l, i) => (
                    <div key={i} className="flex justify-between text-[10px]">
                      <span className="text-dsa-parchment-dark">{l.label}</span>
                      <span className={clsx('font-mono font-bold', l.val > 0 ? 'text-green-400' : l.val < 0 ? 'text-red-400' : 'text-dsa-parchment')}>{typeof l.val === 'number' ? (l.val > 0 ? '+' : '') : ''}{l.val}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-[11px] border-t border-dsa-bg-medium/50 pt-0.5 mt-0.5">
                    <span className="text-dsa-parchment font-bold">Endwert</span>
                    <span className="font-mono font-bold text-dsa-gold">{result}</span>
                  </div>
                </div>
                {interpret && <div className="text-[10px] text-dsa-parchment-dark italic">{interpret}</div>}
              </div>
            )
            return (<>
              <StatCell label="Initiative" val={combatINI ?? 0} icon={Timer} iconCls="text-amber-400" condPos={cg('INI').pos} condNeg={cg('INI').neg}
                tip={<TipBlock title="Initiative" desc="Bestimmt die Reihenfolge im Kampf. Höher = früher dran. Zu Kampfbeginn wird 1W6 dazugewürfelt." lines={[
                  { label: `(Mut ${attributes?.MU||'?'} + Gewandtheit ${attributes?.GE||'?'}) / 2`, val: Math.floor(((attributes?.MU||0)+(attributes?.GE||0))/2) },
                  ...sfLines('INI'),
                  ...(beVal2 > 0 ? [{ label: 'Behinderung (Rüstung)', val: -beVal2 }] : []),
                  ...condLinesFor('INI'),
                ]} result={`${combatINI ?? 0} (+1W6 im Kampf)`} />} />
              <StatCell label="Geschwin-digkeit" val={combatGS ?? 0} icon={Footprints} iconCls="text-teal-400" condPos={cg('GS').pos} condNeg={cg('GS').neg}
                tip={<TipBlock title="Geschwindigkeit" desc="So viele Schritt (= Meter) kannst du dich pro Kampfrunde bewegen. Grundwert hängt von der Spezies ab (Mensch: 8, Zwerg: 6, Elf: 8)." lines={[
                  { label: `Basiswert`, val: derivedValues.GS ?? '?' },
                  ...(beVal2 > 0 ? [{ label: 'Behinderung (Rüstung)', val: -beVal2 }] : []),
                  ...condLinesFor('GS'),
                ]} result={`${combatGS ?? 0} Schritt pro Kampfrunde`} />} />
              <StatCell label="Wund-schwelle" val={ws} icon={Activity} iconCls="text-orange-400"
                tip={<TipBlock title="Wundschwelle" desc={`Wenn du durch einen einzelnen Angriff ${ws} oder mehr Schadenspunkte verlierst (nachdem dein Rüstungsschutz abgezogen wurde), musst du eine Probe auf Konstitution bestehen. Misslingt die Probe, erhältst du eine zusätzliche Stufe des Zustands Schmerz. Beispiel: Ein Gegner trifft dich für 12 Schaden. Dein Rüstungsschutz beträgt ${rs ?? 0}. Du verlierst ${Math.max(0, 12 - (rs ?? 0))} Lebenspunkte. ${Math.max(0, 12 - (rs ?? 0)) >= ws ? `Das sind ${ws} oder mehr — du musst eine Konstitutionsprobe würfeln!` : `Das sind weniger als ${ws} — keine Konstitutionsprobe nötig.`}`} lines={[{ label: `Konstitution (${ko}) / 2 aufgerundet`, val: ws }]} result={ws} interpret="Jeder Treffer wird einzeln geprüft, auch wenn du mehrfach in einer Kampfrunde getroffen wirst." />} />
            </>)
          })()}
          </div>
          <div className="flex gap-0.5 p-0.5 pt-0 border-t border-dsa-bg-medium/50">
            <StatCell label="Seelenkraft" val={sk ?? 0} icon={Brain} iconCls="text-violet-400"
              tip={<div className="space-y-1.5"><div className="text-xs font-bold text-dsa-gold">Seelenkraft</div><div className="text-[11px] text-dsa-parchment-dark">Widerstand gegen Geistesmagie, Furcht, Beherrschung und Illusionen.</div><div className="bg-dsa-bg/50 border border-dsa-bg-medium rounded-sm p-2 space-y-0.5"><div className="text-[10px] text-dsa-parchment-dark/50 uppercase font-bold">Berechnung</div><div className="flex justify-between text-[10px]"><span className="text-dsa-parchment-dark">(Mut {attributes?.MU||'?'} + Klugheit {attributes?.KL||'?'} + Intuition {attributes?.IN||'?'}) / 6</span><span className="font-mono font-bold text-dsa-parchment">{sk}</span></div></div><div className="text-[10px] text-dsa-parchment-dark italic">Je höher, desto besser gegen mentale Angriffe geschützt.</div></div>} />
            <StatCell label="Zähigkeit" val={zk ?? 0} icon={HeartPulse} iconCls="text-pink-400"
              tip={<div className="space-y-1.5"><div className="text-xs font-bold text-dsa-gold">Zähigkeit</div><div className="text-[11px] text-dsa-parchment-dark">Widerstand gegen Gift, Krankheit und körperliche Magie.</div><div className="bg-dsa-bg/50 border border-dsa-bg-medium rounded-sm p-2 space-y-0.5"><div className="text-[10px] text-dsa-parchment-dark/50 uppercase font-bold">Berechnung</div><div className="flex justify-between text-[10px]"><span className="text-dsa-parchment-dark">(Konstitution {attributes?.KO||'?'} x 2 + Körperkraft {attributes?.KK||'?'}) / 6</span><span className="font-mono font-bold text-dsa-parchment">{zk}</span></div></div><div className="text-[10px] text-dsa-parchment-dark italic">Je höher, desto widerstandsfähiger gegen körperliche Effekte.</div></div>} />
            <StatCell label="Behinde-rung" val={be ?? 0} icon={Gauge} iconCls="text-amber-400"
              tip={
                <div className="space-y-1.5">
                  <div className="text-xs font-bold text-dsa-gold">Behinderung</div>
                  <div className="text-[11px] text-dsa-parchment-dark">Abzug durch das Gewicht deiner Rüstung. Wird automatisch von Attacke, Parade, Ausweichen, Initiative und Geschwindigkeit abgezogen.</div>
                  <div className="bg-dsa-bg/50 border border-dsa-bg-medium rounded-sm p-2 space-y-0.5">
                    <div className="text-[10px] text-dsa-parchment-dark/50 uppercase font-bold">Berechnung</div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-dsa-parchment-dark">Summe Rüstungs-BE</span>
                      <span className="font-mono font-bold text-dsa-parchment">{rawBE}</span>
                    </div>
                    {sfLines('BE').map((sf, j) => (
                      <div key={j} className="flex justify-between text-[10px]">
                        <span className="text-dsa-parchment-dark">{sf.label}</span>
                        <span className="font-mono font-bold text-green-400">{sf.val}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-[11px] border-t border-dsa-bg-medium/50 pt-0.5 mt-0.5">
                      <span className="text-dsa-parchment font-bold">Effektive Behinderung</span>
                      <span className="font-mono font-bold text-dsa-gold">{be ?? 0}</span>
                    </div>
                  </div>
                  <div className="text-[10px] text-dsa-parchment-dark italic">Bereits in allen Kampfwerten verrechnet — du musst sie nicht nochmal abziehen.</div>
                </div>
              } />
          </div>
        </div>

        {/* ── Ressourcen (Traglast + Geld, stacked like Widerstand) ── */}
        <div className="flex flex-col flex-shrink-0 border border-dsa-bg-medium rounded-sm overflow-hidden self-stretch">
          <div className="text-[8px] text-dsa-gold uppercase tracking-wider font-bold text-center bg-dsa-bg-card px-2 py-0.5 border-b border-dsa-bg-medium">Ressourcen</div>
          <div className="flex flex-col gap-0.5 p-0.5 flex-1 justify-center">
            <div className="flex gap-0.5">
              {weight != null && weightMax != null && (
                <StatCell label="Traglast" val={`${weight.toFixed(0)}/${weightMax}`} icon={Weight} iconCls={weight > weightMax ? 'text-red-400' : 'text-dsa-parchment-dark/60'}
                  tip={<div className="space-y-1.5">
                    <div className="text-xs font-bold text-dsa-gold">Traglast</div>
                    <div className="text-[11px] text-dsa-parchment-dark">Wie viel dein Held tragen kann. Bei Überschreitung: Zustand Belastung.</div>
                    <div className="bg-dsa-bg/50 border border-dsa-bg-medium rounded-sm p-2 space-y-0.5">
                      <div className="flex justify-between text-[10px]"><span className="text-dsa-parchment-dark">Körperkraft ({attributes?.KK||'?'}) x 2</span><span className="font-mono font-bold text-dsa-parchment">{weightMax} Stein</span></div>
                      <div className="flex justify-between text-[10px]"><span className="text-dsa-parchment-dark">Aktuell getragen</span><span className={clsx('font-mono font-bold', weight > weightMax ? 'text-red-400' : 'text-dsa-parchment')}>{weight.toFixed(1)} Stein</span></div>
                      <div className="flex justify-between text-[10px]"><span className="text-dsa-parchment-dark">Auslastung</span><span className={clsx('font-mono font-bold', weight > weightMax ? 'text-red-400' : weight > weightMax*0.75 ? 'text-amber-400' : 'text-green-400')}>{Math.round(weight/weightMax*100)}%</span></div>
                    </div>
                  </div>} />
              )}
              {money != null && (
                <StatCell label="Geld" val={(() => { const d=money.dukaten||0,s=money.silber||0,h=money.heller||0; if(d>0) return `${d}D ${s}S`; if(s>0) return `${s}S ${h}H`; return `${h}H` })()} icon={Coins} iconCls="text-dsa-gold"
                  tip={<div className="space-y-1.5">
                    <div className="text-xs font-bold text-dsa-gold">Geldbeutel</div>
                    <div className="bg-dsa-bg/50 border border-dsa-bg-medium rounded-sm p-2 space-y-0.5">
                      {(money.dukaten||0) > 0 && <div className="flex justify-between text-[10px]"><span className="text-dsa-parchment-dark">Dukaten</span><span className="font-mono font-bold text-dsa-gold">{money.dukaten}</span></div>}
                      {(money.silber||0) > 0 && <div className="flex justify-between text-[10px]"><span className="text-dsa-parchment-dark">Silbertaler</span><span className="font-mono font-bold text-dsa-parchment">{money.silber}</span></div>}
                      {(money.heller||0) > 0 && <div className="flex justify-between text-[10px]"><span className="text-dsa-parchment-dark">Heller</span><span className="font-mono font-bold text-dsa-parchment-dark">{money.heller}</span></div>}
                    </div>
                    <div className="text-[9px] text-dsa-parchment-dark italic">1 Dukaten = 10 Silber = 100 Heller = 1000 Kreuzer.</div>
                  </div>} />
              )}
            </div>
            {ap != null && (
              <StatCell label="Abenteuerpunkte" val={ap} icon={Star} iconCls="text-dsa-gold"
                tip={<div className="space-y-1.5">
                  <div className="text-xs font-bold text-dsa-gold">Abenteuerpunkte</div>
                  <div className="text-[11px] text-dsa-parchment-dark">Erfahrungspunkte zum Steigern von Talenten, Zaubern, Kampftechniken und Eigenschaften.</div>
                  <div className="bg-dsa-bg/50 border border-dsa-bg-medium rounded-sm p-2 space-y-0.5">
                    <div className="flex justify-between text-[10px]"><span className="text-dsa-parchment-dark">Gesamt</span><span className="font-mono font-bold text-dsa-gold">{ap}</span></div>
                    {apAvailable != null && <div className="flex justify-between text-[10px]"><span className="text-dsa-parchment-dark">Verfügbar</span><span className="font-mono font-bold text-green-400">{apAvailable}</span></div>}
                    {experienceGrade && <div className="flex justify-between text-[10px]"><span className="text-dsa-parchment-dark">Erfahrungsgrad</span><span className="text-dsa-parchment">{experienceGrade}</span></div>}
                  </div>
                </div>} />
            )}
          </div>
        </div>
      </div>

      {characterId && <div className="mt-1"><ActiveBuffs characterId={characterId} compact={compact} /></div>}
    </div>
  )
}

export default React.memo(VitalsBar)
