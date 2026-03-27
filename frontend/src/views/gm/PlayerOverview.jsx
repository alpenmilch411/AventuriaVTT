import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { User, MessageSquare, Heart, Sparkles, Sun, Shield, ShieldAlert, Swords, Footprints, Plus, Minus, Send, Star, Flame, Brain, Eye, Crown, Hand, Wind, HeartPulse, Hammer, AlertTriangle, Crosshair, Gauge, Timer, ChevronRight, ChevronDown, X, Info, HelpCircle, BookOpen, Clock, Pencil, Check } from 'lucide-react'
import useSessionStore from '../../stores/sessionStore'
import useCharacterStore from '../../stores/characterStore'
import useAuthStore from '../../stores/authStore'
import { getConditions, getVitalsFrom, getMaxVitals } from '../../utils/safeData'
import { getConditionModifier, getConditionModifierGross, CONDITIONS as CONDITIONS_REF } from '../../engine/conditionsEngine'
import { computeCombatStats } from '../../engine/combatComputation'
import { COMBAT_SPECIAL_ABILITIES } from '../../engine/weaponProperties'
import { isBuffActive } from '../../engine/buffSystem'
import { getSAStatEffects } from '../../engine/saStatEffects'
import { SF_TOOLTIPS as SF_EXPLAIN, ADV_TOOLTIPS as ADV_EXPLAIN, DISADV_TOOLTIPS as DISADV_EXPLAIN } from '../../engine/tooltips'
import ProgressBar from '../../components/common/ProgressBar'
import Badge from '../../components/common/Badge'
import ActiveBuffs from '../../components/common/ActiveBuffs'
import Modal from '../../components/common/Modal'
import clsx from 'clsx'

function PlayerOverview({ sendMessage, gmControls }) {
  const players = useSessionStore((s) => s.players)
  const allCharacters = useCharacterStore((s) => s.allCharacters)
  const token = useAuthStore((s) => s.token)

  const [selectedPlayer, setSelectedPlayer] = useState(null)

  // Load databank templates once for combat stat computation (shared across all player views)
  const [databankTemplates, setDatabankTemplates] = useState({ combatTechTemplates: [], armorTemplates: [], shieldTemplates: [], weaponTemplates: [] })
  useEffect(() => {
    if (!token) return
    const h = { Authorization: `Bearer ${token}` }
    const load = (path) => fetch(`/api/databank/${path}`, { headers: h })
      .then(r => r.ok ? r.json() : []).then(d => Array.isArray(d) ? d : d.items || [])
      .catch(() => [])
    Promise.all([load('combat_techniques'), load('armor'), load('shields'), load('weapons')])
      .then(([ct, ar, sh, wp]) => setDatabankTemplates({ combatTechTemplates: ct, armorTemplates: ar, shieldTemplates: sh, weaponTemplates: wp }))
  }, [token])

  // All players who have joined — merge with character data, connected first
  const allPlayers = players
    .map(player => {
      const char = allCharacters.find(c => c.id === player.characterId) || player.character || {}
      const vitals = getVitalsFrom({ ...player, ...char, current_vitals: player.current_vitals || char.current_vitals })
      const maxVitals = getMaxVitals(char)
      const conditions = getConditions({ ...player, ...char })
      return { ...player, character: char, vitals, maxVitals, conditions }
    })
    .sort((a, b) => (b.connected ? 1 : 0) - (a.connected ? 1 : 0))

  const onlineCount = allPlayers.filter(p => p.connected).length

  return (
    <div className="space-y-3">
      <h2 className="section-title text-sm flex items-center gap-2">
        <User className="w-4 h-4" />
        Spieler ({onlineCount}/{allPlayers.length})
      </h2>

      <div className="space-y-1.5">
        {allPlayers.map(player => (
          <PlayerCard
            key={player.id}
            player={player}
            onClick={() => setSelectedPlayer(player)}
          />
        ))}

        {allPlayers.length === 0 && (
          <div className="text-center py-8">
            <User className="w-8 h-8 text-dsa-parchment-dark/30 mx-auto mb-2" />
            <p className="text-sm text-dsa-parchment-dark">Noch keine Spieler beigetreten</p>
            <p className="text-[10px] text-dsa-parchment-dark/60 mt-1">Spieler verbinden sich über den Session-Code</p>
          </div>
        )}
      </div>

      {/* Player Detail Panel */}
      <Modal
        isOpen={!!selectedPlayer}
        onClose={() => setSelectedPlayer(null)}
        title={selectedPlayer?.character?.name || selectedPlayer?.username || 'Spieler'}
        size="lg"
      >
        {selectedPlayer && (
          <PlayerDetailView
            player={selectedPlayer}
            sendMessage={sendMessage}
            gmControls={gmControls}
            onClose={() => setSelectedPlayer(null)}
            databankTemplates={databankTemplates}
          />
        )}
      </Modal>
    </div>
  )
}

// ── Compact player card — what the GM sees at a glance ──

function PlayerCard({ player, onClick }) {
  const char = player.character || {}
  const v = player.vitals
  const mv = player.maxVitals
  const allBuffs = useCharacterStore((s) => s.activeBuffs)
  const charBuffs = allBuffs.filter(b => b.characterId === player.characterId && isBuffActive(b))
  const lepPct = mv.lepMax > 0 ? v.lep / mv.lepMax : 1
  const isCritical = lepPct < 0.25
  const isOnline = !!player.connected

  return (
    <div
      onClick={onClick}
      className={clsx(
        'border rounded-sm px-3 py-2 cursor-pointer transition-colors',
        isOnline
          ? 'bg-dsa-bg-card border-dsa-bg-medium hover:border-dsa-gold/30'
          : 'bg-dsa-bg-card/40 border-dsa-bg-medium/40 opacity-50'
      )}
    >
      {/* Row 1: Status dot + Name + Username */}
      <div className="flex items-center gap-2 mb-1.5">
        <div className={clsx(
          'w-2 h-2 rounded-full flex-shrink-0',
          isOnline ? 'bg-dsa-success animate-pulse' : 'bg-dsa-parchment-dark/30'
        )} />
        <span className="text-sm font-semibold text-dsa-parchment truncate">
          {char.name || 'Unbekannt'}
        </span>
        <span className="text-[9px] text-dsa-parchment-dark truncate ml-auto flex-shrink-0">
          {player.username || ''}
          {!isOnline && ' (Offline)'}
        </span>
      </div>

      {/* Row 2: Vitals bars — LeP always, AsP/KaP only for casters */}
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <Heart className={clsx('w-3 h-3 flex-shrink-0', isCritical ? 'text-red-500' : 'text-dsa-blood')} />
          <div className="flex-1 h-2 bg-dsa-bg rounded-full overflow-hidden">
            <div className={clsx('h-full rounded-full transition-all duration-500', lepPct <= 0.25 ? 'bg-red-500' : lepPct <= 0.5 ? 'bg-yellow-500' : 'bg-green-600')} style={{ width: `${Math.max(0, lepPct * 100)}%` }} />
          </div>
          <span className={clsx('text-[9px] font-mono w-10 text-right flex-shrink-0', isCritical ? 'text-red-400 font-bold' : 'text-dsa-parchment-dark')}>{v.lep}/{mv.lepMax}</span>
        </div>
        {mv.aspMax > 0 && (
          <div className="flex items-center gap-2">
            <Sparkles className="w-3 h-3 flex-shrink-0 text-dsa-mana" />
            <div className="flex-1 h-1.5 bg-dsa-bg rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${mv.aspMax > 0 ? Math.max(0, v.asp / mv.aspMax * 100) : 0}%` }} />
            </div>
            <span className="text-[9px] font-mono text-dsa-parchment-dark w-10 text-right flex-shrink-0">{v.asp}/{mv.aspMax}</span>
          </div>
        )}
        {mv.kapMax > 0 && (
          <div className="flex items-center gap-2">
            <Star className="w-3 h-3 flex-shrink-0 text-dsa-karma" />
            <div className="flex-1 h-1.5 bg-dsa-bg rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-purple-500 transition-all duration-500" style={{ width: `${mv.kapMax > 0 ? Math.max(0, v.kap / mv.kapMax * 100) : 0}%` }} />
            </div>
            <span className="text-[9px] font-mono text-dsa-parchment-dark w-10 text-right flex-shrink-0">{v.kap}/{mv.kapMax}</span>
          </div>
        )}
      </div>

      {/* Row 3: Conditions (only if any) */}
      {player.conditions.length > 0 && (
        <div className="flex flex-wrap gap-0.5 mt-1">
          {player.conditions.map((cond, i) => {
            const name = typeof cond === 'string' ? cond : cond.name
            const level = typeof cond === 'string' ? 1 : (cond.level || 1)
            return (
              <span key={i} className="text-[8px] px-1 py-0.5 rounded bg-yellow-900/40 text-yellow-400 border border-yellow-800/30">
                {name}{level > 1 ? ` ${level}` : ''}
              </span>
            )
          })}
        </div>
      )}

      {charBuffs.length > 0 && (
        <div className="flex flex-wrap gap-0.5 mt-1">
          {charBuffs.map(b => (
            <span key={b.id} className={clsx(
              'text-[8px] px-1 py-0.5 rounded border inline-flex items-center gap-0.5',
              (b.value || 0) > 0
                ? 'bg-dsa-gold/10 border-dsa-gold/30 text-dsa-gold'
                : 'bg-dsa-mana/10 border-dsa-mana/30 text-dsa-mana',
            )}>
              <Sparkles className="w-2 h-2" />
              {b.value > 0 ? '+' : ''}{b.value} {b.stat}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Attribute metadata (mirrors VitalsBar / CharacterSheet) ──
const ATTR_META = {
  MU: { name: 'Mut', icon: Flame, color: 'text-red-400', bg: 'from-red-900/30 to-red-950/10 border-red-800/20',
    desc: 'Tapferkeit und Entschlossenheit. Beeinflusst Kampfproben, Zauber und Selbstbeherrschung.',
    derives: (v, a) => [
      { label: 'Initiative', formula: `(Mut ${v} + Gewandtheit ${a?.GE||'?'}) / 2 = ${Math.floor(((v||0)+(a?.GE||0))/2)}`, desc: 'Mut fließt zur Hälfte in die Initiative ein' },
    ] },
  KL: { name: 'Klugheit', icon: Brain, color: 'text-blue-400', bg: 'from-blue-900/30 to-blue-950/10 border-blue-800/20',
    desc: 'Logisches Denken und Wissen. Zentral für Wissenstalente, Magie und Heilkunde.',
    derives: () => [] },
  IN: { name: 'Intuition', icon: Eye, color: 'text-violet-400', bg: 'from-violet-900/30 to-violet-950/10 border-violet-800/20',
    desc: 'Bauchgefühl und Wahrnehmung. Wichtig für Sinnesschärfe und Menschenkenntnis.',
    derives: () => [] },
  CH: { name: 'Charisma', icon: Crown, color: 'text-pink-400', bg: 'from-pink-900/30 to-pink-950/10 border-pink-800/20',
    desc: 'Ausstrahlung und Überzeugungskraft. Entscheidend für soziale Proben.',
    derives: () => [] },
  FF: { name: 'Fingerfertigkeit', icon: Hand, color: 'text-emerald-400', bg: 'from-emerald-900/30 to-emerald-950/10 border-emerald-800/20',
    desc: 'Feinmotorik. Wichtig für Schlösserknacken, Taschendiebstahl und Handwerk.',
    derives: () => [] },
  GE: { name: 'Gewandtheit', icon: Wind, color: 'text-cyan-400', bg: 'from-cyan-900/30 to-cyan-950/10 border-cyan-800/20',
    desc: 'Beweglichkeit und Reaktion. Beeinflusst Ausweichen, Schleichen und akrobatische Aktionen.',
    derives: (v, a) => [
      { label: 'Ausweichen', formula: `Gewandtheit ${v} / 2 = ${Math.floor((v||0)/2)}`, desc: 'Gewandtheit bestimmt den Ausweichen-Grundwert' },
      { label: 'Initiative', formula: `(Mut ${a?.MU||'?'} + Gewandtheit ${v}) / 2 = ${Math.floor(((a?.MU||0)+(v||0))/2)}`, desc: 'Gewandtheit fließt zur Hälfte in die Initiative ein' },
    ] },
  KO: { name: 'Konstitution', icon: HeartPulse, color: 'text-orange-400', bg: 'from-orange-900/30 to-orange-950/10 border-orange-800/20',
    desc: 'Widerstandskraft und körperliche Belastbarkeit. Bestimmt Lebenspunkte und Wundschwelle.',
    derives: (v) => [
      { label: 'Wundschwelle', formula: `Konstitution ${v} / 2 (aufgerundet) = ${Math.ceil((v||0)/2)}`, desc: 'Einzeltreffer ab diesem Schaden: Konstitutionsprobe oder Schmerz' },
    ] },
  KK: { name: 'Körperkraft', icon: Hammer, color: 'text-amber-400', bg: 'from-amber-900/30 to-amber-950/10 border-amber-800/20',
    desc: 'Muskelkraft. Bestimmt Nahkampf-Schadensbonus und Tragkraft.',
    derives: (v) => [
      { label: 'Schadensbonus', formula: `(Körperkraft ${v} - 15) / 3 = +${Math.max(0,Math.floor(((v||0)-15)/3))}`, desc: 'Wird auf jeden Nahkampftreffer addiert' },
      { label: 'Traglast', formula: `Körperkraft ${v} x 2 = ${(v||0)*2} Stein`, desc: 'Maximales Tragegewicht' },
    ] },
}

// ── Condition display colors by category ──
const COND_COLORS = {
  'körperlich': 'border-red-800/40 bg-red-950/20',
  'geistig': 'border-violet-800/40 bg-violet-950/20',
  'kampf': 'border-amber-800/40 bg-amber-950/20',
}

// SF_EXPLAIN, ADV_EXPLAIN, DISADV_EXPLAIN imported from engine/tooltips

// ── SF categorization rules (same as CharacterSheet) ──
const SF_CATS = [
  { id: 'kampf', label: 'Kampf', icon: Swords, headerBg: 'bg-red-950/50', iconCls: 'text-red-400', textCls: 'text-red-400', match: sf => /wucht|finte|schild|stung|ausweich|kampf|scharf|schnell|parade|beid|reflexe|gesp|entwaffn|niederwerf|hammer|todes|sturm|windm|kreuz|gegen|halte|festnag|blind|klinge|beritte|waffen|ausfall|unterbr|eisenhag|gezielt/i.test(sf) },
  { id: 'magie', label: 'Magie', icon: Sparkles, headerBg: 'bg-blue-950/50', iconCls: 'text-blue-400', textCls: 'text-blue-400', match: sf => /tradition.*gilden|tradition.*hex|tradition.*elf|zauber|magisch|astral|arkan|kraftkontr|fernzauber|aura.*verberg|regeneration.*I/i.test(sf) },
  { id: 'karma', label: 'Karma', icon: Sun, headerBg: 'bg-purple-950/50', iconCls: 'text-purple-400', textCls: 'text-purple-400', match: sf => /tradition.*kirche|tradition.*peraine|tradition.*praios|tradition.*rondra|tradition.*boron|liturgie|karmal|geweiht|aspekt/i.test(sf) },
  { id: 'allgemein', label: 'Allgemein', icon: Star, headerBg: 'bg-dsa-gold/10', iconCls: 'text-dsa-gold', textCls: 'text-dsa-gold', match: () => true },
]

// ── Portal tooltip (self-contained, same pattern as VitalsBar) ──
function DetailPortalTip({ anchor, children, onClose }) {
  const [pos, setPos] = useState({ top: 0, left: 0 })
  useEffect(() => {
    if (anchor) {
      const r = anchor.getBoundingClientRect()
      const tipW = 280
      let left = Math.max(8, Math.min(r.left, window.innerWidth - tipW - 8))
      let top = r.bottom + 4
      // If it would go off-screen bottom, place above
      if (top + 200 > window.innerHeight) top = Math.max(8, r.top - 200)
      setPos({ top, left })
    }
  }, [anchor])
  return createPortal(
    <>
      <div className="fixed inset-0 z-[100]" onClick={onClose} />
      <div className="fixed z-[101] w-[280px] max-h-[70vh] overflow-y-auto bg-dsa-bg-light border border-dsa-gold/30 rounded-sm shadow-2xl p-2.5 text-[11px] text-dsa-parchment leading-relaxed animate-fade-in" style={{ top: pos.top, left: pos.left }}>
        {children}
      </div>
    </>,
    document.body
  )
}

// ── Derivation tooltip content block ──
function TipBlock({ title, desc, lines, result, interpret, warning }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-bold text-dsa-gold">{title}</div>
      {desc && <div className="text-[11px] text-dsa-parchment-dark">{desc}</div>}
      {warning && <div className="text-[10px] font-bold text-amber-400 bg-amber-950/30 rounded-sm px-2 py-1">{warning}</div>}
      {lines && lines.length > 0 && (
        <div className="bg-dsa-bg/50 border border-dsa-bg-medium rounded-sm p-2 space-y-0.5">
          <div className="text-[10px] text-dsa-parchment-dark/50 uppercase font-bold">Berechnung</div>
          {lines.map((l, i) => (
            <div key={i} className="flex justify-between text-[10px]">
              <span className="text-dsa-parchment-dark">{l.label}</span>
              <span className={clsx('font-mono font-bold', l.val > 0 ? 'text-green-400' : l.val < 0 ? 'text-red-400' : 'text-dsa-parchment')}>{typeof l.val === 'number' ? (l.val > 0 ? '+' : '') : ''}{l.val}</span>
            </div>
          ))}
          {result != null && (
            <div className="flex justify-between text-[11px] border-t border-dsa-bg-medium/50 pt-0.5 mt-0.5">
              <span className="text-dsa-parchment font-bold">Endwert</span>
              <span className="font-mono font-bold text-dsa-gold">{result}</span>
            </div>
          )}
        </div>
      )}
      {interpret && <div className="text-[10px] text-dsa-parchment-dark italic">{interpret}</div>}
    </div>
  )
}

// ── Clickable stat cell with gross condition modifier corners ──
function DetailStatCell({ label, val, icon: Icon, iconCls, conditions, statKey, children }) {
  const [show, setShow] = useState(false)
  const ref = useRef(null)
  const cg = getConditionModifierGross(conditions || [], statKey)
  return (
    <>
      <button
        ref={ref}
        onClick={(e) => { e.stopPropagation(); setShow(!show) }}
        className="flex flex-col items-center w-full py-1.5 border rounded-sm border-dsa-bg-medium bg-dsa-bg-card relative cursor-help hover:border-dsa-gold/30 transition-colors"
      >
        {cg.neg < 0 && <span className="absolute top-0.5 right-0.5 text-[7px] font-mono font-bold text-red-400 leading-none">{cg.neg}</span>}
        {cg.pos > 0 && <span className="absolute top-0.5 left-0.5 text-[7px] font-mono font-bold text-green-400 leading-none">+{cg.pos}</span>}
        {Icon && <Icon className={clsx('w-3 h-3', iconCls || 'text-dsa-parchment-dark/40')} />}
        <span className={clsx('text-base font-mono font-bold leading-tight', iconCls || 'text-dsa-parchment')}>{val ?? '-'}</span>
        <span className="text-[7px] text-dsa-parchment leading-tight text-center w-full truncate px-0.5">{label}</span>
      </button>
      {show && children && (
        <DetailPortalTip anchor={ref.current} onClose={() => setShow(false)}>
          {children}
        </DetailPortalTip>
      )}
    </>
  )
}

// ── Full detail view — GM's deep reference + quick actions ──

function PlayerDetailView({ player, sendMessage, gmControls, onClose, databankTemplates }) {
  const char = player.character || {}
  const v = player.vitals
  const mv = player.maxVitals
  const attrs = char.attributes || {}
  const dv = char.derived_values || {}
  const conditions = player.conditions || []
  const allBuffs = useCharacterStore((s) => s.activeBuffs)
  const charBuffs = allBuffs.filter(b => b.characterId === player.characterId)

  // Compute combat stats using the same pure function as the player-side hook
  const charWithConditions = { ...char, conditions }
  const computed = computeCombatStats(charWithConditions, databankTemplates || {}, charBuffs) || {}
  const isOnline = !!player.connected
  const sfs = char.special_abilities || []
  const advantages = char.advantages || []
  const disadvantages = char.disadvantages || []

  // Quick action state
  const [whisperText, setWhisperText] = useState('')
  const [lepDelta, setLepDelta] = useState('')
  const [expandedCond, setExpandedCond] = useState(null)
  const [sfPopup, setSfPopup] = useState(null)
  const [sfTemplates, setSfTemplates] = useState([])
  const [sfTemplatesLoaded, setSfTemplatesLoaded] = useState(false)
  const armorTemplates = databankTemplates?.armorTemplates || []

  const token = useAuthStore((s) => s.token)

  const handleWhisper = () => {
    if (!whisperText.trim()) return
    gmControls?.whisper(player.id, whisperText)
    setWhisperText('')
  }

  const handleLepChange = (delta) => {
    const val = parseInt(delta)
    if (isNaN(val) || val === 0) return
    sendMessage?.({
      type: 'vitals_update',
      payload: { character_id: player.characterId, vitals: { lep_delta: val } }
    })
    setLepDelta('')
  }

  // Lazy-load SF templates on first SF click
  const ensureSfTemplates = () => {
    if (sfTemplatesLoaded || !token) return
    setSfTemplatesLoaded(true)
    fetch('/api/databank/special_abilities', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : []).then(d => setSfTemplates(Array.isArray(d) ? d : d.items || []))
      .catch(err => console.error('Failed to fetch special abilities:', err))
  }

  const matchSfTemplate = (sfName) => {
    const n = sfName.toLowerCase().replace(/[\u00e4\u00f6\u00fc\u00df]/g, m => ({ '\u00e4':'ae','\u00f6':'oe','\u00fc':'ue','\u00df':'ss' }[m]||m))
    return sfTemplates.find(t => {
      const tn = t.name.toLowerCase().replace(/[\u00e4\u00f6\u00fc\u00df]/g, m => ({ '\u00e4':'ae','\u00f6':'oe','\u00fc':'ue','\u00df':'ss' }[m]||m))
      return tn === n || n.includes(tn) || tn.includes(n)
    })
  }

  const lookupExplanation = (name, map) => {
    for (const [key, val] of Object.entries(map)) {
      if (name.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(name.toLowerCase())) return val
    }
    return null
  }

  // Extract equipped weapons from inventory
  const inventory = char.basis_inventory || char.campaign_inventory || {}
  const items = Array.isArray(inventory) ? inventory : (inventory.items || [])
  const equippedWeapons = items.filter(i => i.equipped && (i.category === 'weapon' || i.category === 'waffe' || i.at_mod !== undefined))
  const equippedArmor = items.filter(i => i.equipped && (i.category === 'armor' || i.category === 'rüstung' || i.rs !== undefined))

  // Compute condition modifier lines for a given stat
  const condLines = (stat) => conditions.filter(c => {
    const def = CONDITIONS_REF[c.name]; if (!def) return false
    const l = c.level || 1; let val = 0
    if (def.perLevel?.[stat]) val += def.perLevel[stat] * l
    if (def.level2Extra?.[stat] && l >= 2) val += def.level2Extra[stat]
    if (def.flat?.[stat]) val += def.flat[stat]
    return val !== 0
  }).map(c => {
    const def = CONDITIONS_REF[c.name]; const l = c.level || 1
    let val = 0
    if (def.perLevel?.[stat]) val += def.perLevel[stat] * l
    if (def.level2Extra?.[stat] && l >= 2) val += def.level2Extra[stat]
    if (def.flat?.[stat]) val += def.flat[stat]
    return { label: `${c.name} ${['','I','II','III','IV'][Math.min(l,4)]}`, val }
  })

  // SF passive effects on specific combat stats
  const sfLines = (stat) => getSAStatEffects(stat, sfs)

  // Compute BE from armor (with template fallback for items without inline rs/be)
  const matchArmorTpl = (name) => armorTemplates.find(t => name.toLowerCase().includes(t.name.toLowerCase().split(' ')[0]) || t.name.toLowerCase().includes(name.toLowerCase().split(' ')[0]))
  const rawBE = equippedArmor.reduce((s, a) => s + (a.be ?? matchArmorTpl(a.name)?.be ?? 0), 0)
  const beRed = sfs.some(s => /stungsgew.*II/i.test(s)) ? 2 : sfs.some(s => /stungsgew/i.test(s)) ? 1 : 0
  const effBE = Math.max(0, rawBE - beRed)
  const computedRS = equippedArmor.reduce((s, a) => s + (a.rs ?? matchArmorTpl(a.name)?.rs ?? 0), 0)

  // Combat values from shared computation (same formulas as player-side useCombatValues)
  const combatAT = computed.at ?? 0
  const combatPA = computed.pa ?? 0
  const combatFK = computed.fk
  const combatAW = computed.aw ?? 0
  const combatINI = computed.ini ?? 0
  const combatGS = computed.gs ?? 0
  const rs = computed.rs ?? (computedRS || dv.RS || 0)
  const be = computed.be ?? (effBE || dv.BE || 0)

  // Effective val quality interpretation
  const valInterpret = (val) => {
    if (val == null) return ''
    if (val <= 0) return 'Nicht möglich \u2014 Wert zu niedrig.'
    if (val >= 16) return 'Hervorragend \u2014 trifft fast immer (80%+).'
    if (val >= 12) return 'Gut \u2014 gelingt meistens (60%).'
    if (val >= 8) return 'Durchschnittlich \u2014 etwa jeder zweite Versuch (40%).'
    if (val >= 4) return 'Schwach \u2014 gelingt selten (20%).'
    return 'Sehr schlecht \u2014 fast unmöglich.'
  }

  // SF categorization
  const categorized = {}
  for (const cat of SF_CATS) categorized[cat.id] = []
  for (const sf of sfs) {
    let placed = false
    for (const cat of SF_CATS) {
      if (cat.id !== 'allgemein' && cat.match(sf)) { categorized[cat.id].push(sf); placed = true; break }
    }
    if (!placed) categorized.allgemein.push(sf)
  }
  const activeCats = SF_CATS.filter(c => categorized[c.id].length > 0)

  return (
    <div className="space-y-4 -mx-6 -my-4 px-6 py-4 bg-dsa-bg">
      {/* Identity + Status */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-dsa-parchment-dark">
          {[char.species, char.culture, char.profession].filter(Boolean).join(' \u00B7 ')}
        </div>
        <div className="flex items-center gap-1.5">
          <div className={clsx('w-2 h-2 rounded-full', isOnline ? 'bg-dsa-success' : 'bg-dsa-parchment-dark/30')} />
          <span className="text-[10px] text-dsa-parchment-dark">{isOnline ? 'Online' : 'Offline'}</span>
        </div>
      </div>

      {/* ── Energien ── */}
      <div className="bg-dsa-bg-card rounded p-3 space-y-2">
        <h3 className="text-[10px] font-semibold text-dsa-gold uppercase tracking-wider mb-1">Energien</h3>
        <div className="flex items-center gap-2">
          <Heart className="w-4 h-4 text-dsa-blood flex-shrink-0" />
          <span className="text-[9px] text-dsa-parchment-dark w-16">Lebensenergie</span>
          <ProgressBar current={v.lep} max={mv.lepMax} preset="health" size="sm" showValues={false} className="flex-1" />
          <span className="text-xs font-mono text-dsa-parchment w-14 text-right">{v.lep}/{mv.lepMax}</span>
        </div>
        {mv.aspMax > 0 && (
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-dsa-mana flex-shrink-0" />
            <span className="text-[9px] text-dsa-parchment-dark w-16">Astralenergie</span>
            <ProgressBar current={v.asp} max={mv.aspMax} preset="mana" size="sm" showValues={false} className="flex-1" />
            <span className="text-xs font-mono text-dsa-parchment w-14 text-right">{v.asp}/{mv.aspMax}</span>
          </div>
        )}
        {mv.kapMax > 0 && (
          <div className="flex items-center gap-2">
            <Sun className="w-4 h-4 text-dsa-karma flex-shrink-0" />
            <span className="text-[9px] text-dsa-parchment-dark w-16">Karmaenergie</span>
            <ProgressBar current={v.kap} max={mv.kapMax} preset="karma" size="sm" showValues={false} className="flex-1" />
            <span className="text-xs font-mono text-dsa-parchment w-14 text-right">{v.kap}/{mv.kapMax}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-dsa-gold flex-shrink-0" />
          <span className="text-[9px] text-dsa-parchment-dark">Schicksalspunkte: {v.schip}/{mv.schipMax}</span>
          <span className="text-[9px] text-dsa-parchment-dark ml-auto">Abenteuerpunkte: {char.total_ap ?? '-'} ({char.available_ap ?? 0} frei)</span>
        </div>
      </div>

      {/* ── Quick HP action ── */}
      <div className="flex items-center gap-2">
        <button onClick={() => handleLepChange(-1)} className="p-1.5 bg-red-900/30 text-red-400 rounded hover:bg-red-900/50 transition" title="-1 LeP">
          <Minus className="w-3.5 h-3.5" />
        </button>
        <input
          type="number"
          value={lepDelta}
          onChange={e => setLepDelta(e.target.value)}
          placeholder="LeP +/-"
          className="flex-1 text-center text-sm bg-dsa-bg border border-dsa-bg-medium rounded px-2 py-1.5 text-dsa-parchment placeholder:text-dsa-parchment-dark/40"
          onKeyDown={e => e.key === 'Enter' && handleLepChange(lepDelta)}
        />
        <button onClick={() => handleLepChange(1)} className="p-1.5 bg-green-900/30 text-green-400 rounded hover:bg-green-900/50 transition" title="+1 LeP">
          <Plus className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => handleLepChange(lepDelta)} className="px-3 py-1.5 bg-dsa-gold/10 text-dsa-gold text-xs rounded hover:bg-dsa-gold/20 transition">
          Anwenden
        </button>
      </div>

      {/* ── Whisper ── */}
      <div>
        <h3 className="text-[10px] font-semibold text-dsa-gold uppercase tracking-wider mb-1">Nachricht flüstern</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={whisperText}
            onChange={e => setWhisperText(e.target.value)}
            placeholder="Geheime Nachricht..."
            className="flex-1 text-sm bg-dsa-bg border border-dsa-bg-medium rounded px-2 py-1.5 text-dsa-parchment placeholder:text-dsa-parchment-dark/40"
            onKeyDown={e => e.key === 'Enter' && handleWhisper()}
          />
          <button onClick={handleWhisper} className="px-3 py-1.5 bg-dsa-gold/10 text-dsa-gold text-xs rounded hover:bg-dsa-gold/20 transition flex items-center gap-1">
            <Send className="w-3 h-3" /> Senden
          </button>
        </div>
      </div>

      {/* ── Eigenschaften (with condition modifiers + tooltips) ── */}
      <div>
        <h3 className="text-[10px] font-semibold text-dsa-gold uppercase tracking-wider mb-1.5">Eigenschaften</h3>
        <div className="grid grid-cols-8 gap-1">
          {Object.entries(ATTR_META).map(([key, meta]) => {
            const val = attrs[key] || 0
            const modLines = condLines(key)
            const totalMod = modLines.reduce((s, m) => s + m.val, 0)
            const effectiveVal = val + totalMod
            return (
              <DetailStatCell
                key={key}
                label={meta.name}
                val={val}
                icon={meta.icon}
                iconCls={meta.color}
                conditions={conditions}
                statKey={key}
              >
                <div className="space-y-2">
                  <div>
                    <div className="text-xs font-bold text-dsa-gold">{meta.name}</div>
                    <div className="text-[11px] text-dsa-parchment-dark mt-0.5">{meta.desc}</div>
                  </div>
                  <div className="bg-dsa-bg/50 border border-dsa-bg-medium rounded-sm p-2 space-y-0.5">
                    <div className="text-[10px] text-dsa-parchment-dark/50 uppercase font-bold">Berechnung</div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-dsa-parchment-dark">Basiswert (Charakterbogen)</span>
                      <span className="font-mono font-bold text-dsa-parchment">{val}</span>
                    </div>
                    {modLines.map((m, j) => (
                      <div key={j} className="flex justify-between text-[10px]">
                        <span className="text-dsa-parchment-dark">{m.label}</span>
                        <span className={clsx('font-mono font-bold', m.val > 0 ? 'text-green-400' : 'text-red-400')}>{m.val > 0 ? '+' : ''}{m.val}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-[11px] border-t border-dsa-bg-medium/50 pt-0.5 mt-0.5">
                      <span className="text-dsa-parchment font-bold">Effektiver Wert</span>
                      <span className="font-mono font-bold text-dsa-gold">{effectiveVal}</span>
                    </div>
                  </div>
                  <div className="text-[10px] text-dsa-parchment-dark italic">
                    {effectiveVal >= 16 ? 'Hervorragend \u2014 Proben gelingen fast immer (80%+).'
                    : effectiveVal >= 12 ? 'Gut \u2014 Proben gelingen meistens (60%).'
                    : effectiveVal >= 8 ? 'Durchschnittlich \u2014 etwa jede zweite Probe (40%).'
                    : effectiveVal >= 4 ? 'Schwach \u2014 Proben gelingen selten (20%).'
                    : 'Sehr schlecht \u2014 Proben fast unmöglich.'}
                  </div>
                  {meta.derives(val, attrs).length > 0 && (
                    <div className="border-t border-dsa-bg-medium/50 pt-1.5">
                      <div className="text-[10px] text-dsa-parchment-dark/50 uppercase font-bold mb-1">Beeinflusst folgende Werte</div>
                      {meta.derives(val, attrs).map((d, j) => (
                        <div key={j} className="mb-1">
                          <div className="text-[10px] font-bold text-dsa-parchment">{d.label}</div>
                          <div className="text-[9px] text-dsa-parchment-dark/60 font-mono">{d.formula}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </DetailStatCell>
            )
          })}
        </div>
      </div>

      {/* ── Kampfwerte (with condition modifier corners + derivation tooltips) ── */}
      <div>
        <h3 className="text-[10px] font-semibold text-dsa-gold uppercase tracking-wider mb-1.5">Kampfwerte</h3>
        <div className="grid grid-cols-8 gap-1">
          {/* AT */}
          <DetailStatCell label="Attacke" val={combatAT ?? 0} icon={Swords} iconCls="text-red-400" conditions={conditions} statKey="AT">
            <TipBlock title="Attacke" desc="Nahkampf-Angriffswert. 1W20 kleiner/gleich = Treffer." lines={[
              ...(equippedWeapons.length > 0 ? [{ label: `Waffe (${equippedWeapons[0].name})`, val: `AT${(equippedWeapons[0].at_mod||0) >= 0 ? '+' : ''}${equippedWeapons[0].at_mod||0}` }] : []),
              ...(be > 0 ? [{ label: 'Behinderung (Rüstung)', val: -be }] : []),
              ...condLines('AT'),
            ]} result={combatAT ?? 0} interpret={valInterpret(combatAT)} />
          </DetailStatCell>

          {/* PA */}
          <DetailStatCell label="Parade" val={combatPA ?? 0} icon={Shield} iconCls="text-blue-400" conditions={conditions} statKey="PA">
            <TipBlock title="Parade" desc="Verteidigung mit Waffe. 1W20 kleiner/gleich = pariert." lines={[
              ...(equippedWeapons.length > 0 ? [{ label: `Waffe (${equippedWeapons[0].name})`, val: `PA${(equippedWeapons[0].pa_mod||0) >= 0 ? '+' : ''}${equippedWeapons[0].pa_mod||0}` }] : []),
              ...sfLines('PA'),
              ...(be > 0 ? [{ label: 'Behinderung (Rüstung)', val: -be }] : []),
              ...condLines('PA'),
            ]} result={combatPA ?? 0} interpret={valInterpret(combatPA)} />
          </DetailStatCell>

          {/* AW */}
          <DetailStatCell label="Ausweichen" val={combatAW ?? 0} icon={Wind} iconCls="text-cyan-400" conditions={conditions} statKey="AW">
            <TipBlock title="Ausweichen" desc="Verteidigung ohne Waffe. Alternative zur Parade, funktioniert auch gegen Fernkampf." lines={[
              { label: `Gewandtheit (${attrs.GE || '?'}) / 2`, val: Math.floor((attrs.GE || 0) / 2) },
              ...sfLines('AW'),
              ...(be > 0 ? [{ label: 'Behinderung (Rüstung)', val: -be }] : []),
              ...condLines('AW'),
            ]} result={combatAW ?? 0} interpret={valInterpret(combatAW)} />
          </DetailStatCell>

          {/* FK */}
          <DetailStatCell label="Fernkampf" val={combatFK ?? 0} icon={Crosshair} iconCls="text-emerald-400" conditions={conditions} statKey="FK">
            <TipBlock title="Fernkampf" desc="Fernkampf-Angriffswert. Distanzmodifikatoren kommen zusätzlich hinzu." lines={[
              ...(be > 0 ? [{ label: 'Behinderung (Rüstung)', val: -be }] : []),
              ...condLines('FK'),
            ]} result={combatFK ?? 0} interpret={valInterpret(combatFK)} />
          </DetailStatCell>

          {/* INI */}
          <DetailStatCell label="Initiative" val={combatINI ?? 0} icon={Timer} iconCls="text-amber-400" conditions={conditions} statKey="INI">
            <TipBlock title="Initiative" desc="Reihenfolge im Kampf. Zu Kampfbeginn +1W6." lines={[
              { label: `(Mut ${attrs.MU||'?'} + Gewandtheit ${attrs.GE||'?'}) / 2`, val: Math.floor(((attrs.MU||0)+(attrs.GE||0))/2) },
              ...sfLines('INI'),
              ...(be > 0 ? [{ label: 'Behinderung (Rüstung)', val: -be }] : []),
              ...condLines('INI'),
            ]} result={`${combatINI ?? 0} (+1W6)`} />
          </DetailStatCell>

          {/* GS */}
          <DetailStatCell label="Geschwind." val={combatGS ?? 0} icon={Footprints} iconCls="text-teal-400" conditions={conditions} statKey="GS">
            <TipBlock title="Geschwindigkeit" desc="Schritt (Meter) pro Kampfrunde." lines={[
              { label: 'Basiswert (Spezies)', val: dv.GS ?? '?' },
              ...(be > 0 ? [{ label: 'Behinderung (Rüstung)', val: -be }] : []),
              ...condLines('GS'),
            ]} result={`${combatGS ?? 0} Schritt/KR`} />
          </DetailStatCell>

          {/* RS */}
          <DetailStatCell label="Rüstung" val={rs} icon={ShieldAlert} iconCls="text-dsa-gold" conditions={conditions} statKey="RS">
            <TipBlock title="Rüstungsschutz" desc="Schadensreduktion durch angelegte Rüstung." lines={
              equippedArmor.length > 0
                ? equippedArmor.map(a => ({ label: a.name, val: a.rs || 0 }))
                : [{ label: 'Keine Rüstung angelegt', val: 0 }]
            } result={rs} interpret={`Effektiver Schaden = Trefferpunkte - ${rs}.`} />
          </DetailStatCell>

          {/* BE */}
          <DetailStatCell label="Behind." val={be} icon={Gauge} iconCls="text-amber-400" conditions={conditions} statKey="BE">
            <TipBlock title="Behinderung" desc="Abzug durch Rüstungsgewicht auf AT, PA, AW, INI, GS." lines={[
              { label: 'Summe Rüstungs-BE', val: rawBE },
              ...sfLines('BE'),
            ]} result={be} interpret={be > 0 ? `${be} wird von AT, PA, AW, INI, GS abgezogen.` : 'Keine Behinderung.'} />
          </DetailStatCell>
        </div>
      </div>

      {/* ── Equipped gear ── */}
      {(equippedWeapons.length > 0 || equippedArmor.length > 0) && (
        <div>
          <h3 className="text-[10px] font-semibold text-dsa-gold uppercase tracking-wider mb-1">Ausrüstung</h3>
          <div className="space-y-0.5">
            {equippedWeapons.map((w, i) => (
              <div key={i} className="flex items-center justify-between text-[10px]">
                <span className="text-dsa-parchment flex items-center gap-1">
                  <Swords className="w-3 h-3 text-dsa-gold/60" />{w.name}
                </span>
                <span className="text-dsa-parchment-dark font-mono">
                  {w.damage || '-'} · AT{w.at_mod >= 0 ? '+' : ''}{w.at_mod ?? 0} PA{w.pa_mod >= 0 ? '+' : ''}{w.pa_mod ?? 0}
                </span>
              </div>
            ))}
            {equippedArmor.map((a, i) => (
              <div key={i} className="flex items-center justify-between text-[10px]">
                <span className="text-dsa-parchment flex items-center gap-1">
                  <Shield className="w-3 h-3 text-dsa-gold/60" />{a.name}
                </span>
                <span className="text-dsa-parchment-dark font-mono">RS {a.rs ?? 0} · BE {a.be ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Conditions (full detail, matching player view) ── */}
      <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-dsa-bg-medium/50 bg-red-950/30">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-red-400">Zustände</span>
          <span className="text-[10px] font-mono text-dsa-parchment-dark/40">{conditions.length}</span>
        </div>
        <div className="p-2.5 max-h-60 overflow-y-auto">
          {conditions.length > 0 ? (
            <div className="space-y-1.5">
              {conditions.map((cond, i) => {
                const name = typeof cond === 'string' ? cond : cond.name
                const level = typeof cond === 'string' ? 1 : (cond.level || 1)
                const def = CONDITIONS_REF[name]
                const icon = def?.icon || '\u26A0\uFE0F'
                const catColor = COND_COLORS[def?.category] || 'border-dsa-bg-medium bg-dsa-bg'
                const summary = def?.summary || name
                const descArr = def?.desc || []
                const levelDesc = descArr[Math.min(level - 1, descArr.length - 1)]
                const roman = ['', 'I', 'II', 'III', 'IV'][Math.min(level, 4)]
                const levels = def?.levels || 1
                const removal = def?.removal || ''
                const source = def?.source || ''
                const isExpanded = expandedCond === i

                // Active stat modifier badges
                const mods = ['AT', 'PA', 'AW', 'FK', 'INI', 'GS', 'MU', 'KL', 'IN', 'CH', 'FF', 'GE', 'KO', 'KK']
                  .map(s => { const m = getConditionModifier([cond], s); return m !== 0 ? { stat: s, val: m } : null })
                  .filter(Boolean)

                return (
                  <div key={i} className={clsx('border rounded-sm p-2.5 cursor-pointer transition-colors hover:border-dsa-gold/20', catColor)} onClick={() => setExpandedCond(isExpanded ? null : i)}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{icon}</span>
                      <span className="text-xs font-bold text-dsa-parchment">{name}{levels > 1 ? ` ${roman}` : ''}</span>
                      {cond.duration != null && <span className="text-[9px] text-dsa-parchment-dark">({cond.duration} KR)</span>}
                      <ChevronDown className={clsx('w-3 h-3 text-dsa-parchment-dark/40 ml-auto transition-transform', isExpanded && 'rotate-180')} />
                    </div>
                    {/* Current level description */}
                    {levelDesc && <p className="text-[10px] text-dsa-parchment leading-snug mb-1">{levelDesc}</p>}
                    {/* Summary */}
                    <p className="text-[10px] text-dsa-parchment-dark/70 leading-snug">{summary}</p>
                    {/* Active stat modifier badges */}
                    {mods.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {mods.map(m => (
                          <span key={m.stat} className={clsx('text-[9px] font-mono px-1 py-0.5 rounded-sm border',
                            m.val > 0 ? 'bg-green-900/20 border-green-800/30 text-green-400' : 'bg-red-900/20 border-red-800/30 text-red-400'
                          )}>{m.stat} {m.val > 0 ? '+' : ''}{m.val}</span>
                        ))}
                      </div>
                    )}
                    {/* Expanded: all levels + source + removal */}
                    {isExpanded && (
                      <div className="mt-2 pt-2 border-t border-dsa-bg-medium/30 space-y-1.5">
                        {levels > 1 && descArr.length > 1 && (
                          <div className="space-y-0.5">
                            {descArr.map((d, li) => (
                              <p key={li} className={clsx('text-[9px] leading-snug', li === level - 1 ? 'text-dsa-parchment font-bold' : 'text-dsa-parchment-dark/50')}>{d}</p>
                            ))}
                          </div>
                        )}
                        {source && <p className="text-[9px] text-amber-400/60">Quelle: {source}</p>}
                        {removal && <p className="text-[9px] text-green-400/60">Aufhebung: {removal}</p>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-dsa-parchment-dark/40 italic py-2 text-center">Keine aktiven Zustände</p>
          )}
        </div>
      </div>

      {/* ── Active Buffs + GM Controls ── */}
      <GmBuffPanel characterId={player.characterId} charBuffs={charBuffs} sendMessage={sendMessage} />

      {/* ── Vorteile & Nachteile ── */}
      {((Array.isArray(advantages) ? advantages.length : Object.keys(advantages).length) > 0 || (Array.isArray(disadvantages) ? disadvantages.length : Object.keys(disadvantages).length) > 0) && (
        <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-dsa-bg-medium/50 bg-dsa-gold/10">
            <Info className="w-4 h-4 text-dsa-gold" />
            <span className="text-xs font-bold uppercase tracking-wider text-dsa-gold">Vor- & Nachteile</span>
          </div>
          <div className="p-2.5 max-h-52 overflow-y-auto space-y-1">
            {(Array.isArray(advantages) ? advantages : Object.keys(advantages)).map((adv, i) => {
              const exp = lookupExplanation(adv, ADV_EXPLAIN)
              return (
                <div key={`a${i}`} className="flex items-start gap-2 bg-green-950/20 border border-green-900/20 rounded-sm p-2">
                  <span className="text-green-400 font-bold text-xs mt-0.5">+</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-bold text-dsa-parchment">{adv}</span>
                    {exp && <p className="text-[10px] text-dsa-parchment-dark/60 leading-snug">{exp}</p>}
                  </div>
                </div>
              )
            })}
            {(Array.isArray(disadvantages) ? disadvantages : Object.keys(disadvantages)).map((dis, i) => {
              const exp = lookupExplanation(dis, DISADV_EXPLAIN)
              return (
                <div key={`d${i}`} className="flex items-start gap-2 bg-red-950/20 border border-red-900/20 rounded-sm p-2">
                  <span className="text-red-400 font-bold text-xs mt-0.5">{'\u2212'}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-bold text-dsa-parchment">{dis}</span>
                    {exp && <p className="text-[10px] text-dsa-parchment-dark/60 leading-snug">{exp}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Sonderfertigkeiten (categorized, with detail popups) ── */}
      {sfs.length > 0 ? (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-dsa-gold" />
            <span className="text-xs font-bold uppercase tracking-wider text-dsa-gold">Sonderfertigkeiten</span>
            <span className="text-[10px] font-mono text-dsa-parchment-dark/40">{sfs.length}</span>
          </div>
          <div className={clsx('grid gap-2', activeCats.length >= 4 ? 'grid-cols-2 lg:grid-cols-4' : activeCats.length === 3 ? 'grid-cols-3' : activeCats.length === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
            {activeCats.map(cat => {
              const CatIcon = cat.icon
              const catItems = categorized[cat.id]
              return (
                <div key={cat.id} className="bg-dsa-bg-card border border-dsa-bg-medium rounded overflow-hidden">
                  <div className={clsx('flex items-center gap-1.5 px-2.5 py-1.5 border-b border-dsa-bg-medium/50', cat.headerBg)}>
                    <CatIcon className={clsx('w-3.5 h-3.5', cat.iconCls)} />
                    <span className={clsx('text-[10px] font-bold uppercase tracking-wider', cat.textCls)}>{cat.label}</span>
                    <span className="text-[9px] font-mono text-dsa-parchment-dark/40 ml-auto">{catItems.length}</span>
                  </div>
                  <div className="p-1.5 space-y-0.5 max-h-52 overflow-y-auto">
                    {catItems.map((sf, i) => {
                      const exp = lookupExplanation(sf, SF_EXPLAIN)
                      const csaEntry = COMBAT_SPECIAL_ABILITIES[sf]
                      return (
                        <button
                          key={i}
                          onClick={() => { ensureSfTemplates(); setSfPopup(sf) }}
                          className="w-full text-left px-2 py-1.5 rounded-sm hover:bg-dsa-bg-light/30 transition-colors"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-medium text-dsa-parchment flex-1 truncate">{sf}</span>
                            <ChevronRight className="w-3 h-3 text-dsa-parchment-dark/20 flex-shrink-0" />
                          </div>
                          {exp && <p className="text-[9px] text-dsa-parchment-dark/50 leading-snug truncate mt-0.5">{exp}</p>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4 text-center">
          <Shield className="w-5 h-5 text-dsa-parchment-dark/20 mx-auto mb-1" />
          <p className="text-xs text-dsa-parchment-dark/40">Keine Sonderfertigkeiten erlernt.</p>
        </div>
      )}

      {/* ── SF Detail Popup ── */}
      {sfPopup && (() => {
        const tpl = matchSfTemplate(sfPopup)
        const exp = lookupExplanation(sfPopup, SF_EXPLAIN)
        const csaEntry = COMBAT_SPECIAL_ABILITIES[sfPopup]
        return (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setSfPopup(null)}>
            <div className="bg-dsa-bg border border-dsa-bg-medium rounded shadow-2xl w-full max-w-md overflow-hidden animate-fade-in" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-dsa-bg-medium bg-dsa-bg-light">
                <h3 className="text-sm font-display font-bold text-dsa-gold">{sfPopup}</h3>
                <button onClick={() => setSfPopup(null)} className="text-dsa-parchment-dark/40 hover:text-dsa-parchment"><X className="w-4 h-4" /></button>
              </div>
              <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
                {/* Stat modifiers from template or CSA engine */}
                {(tpl || csaEntry) && (() => {
                  const at = tpl?.at_mod ?? csaEntry?.atMod
                  const pa = tpl?.pa_mod ?? csaEntry?.paMod ?? (csaEntry?.paBonus ? csaEntry.paBonus : null)
                  const dmg = tpl?.damage_modifier ?? (csaEntry?.tpMod ? `+${csaEntry.tpMod}` : null)
                  const aw = csaEntry?.awBonus
                  const ini = csaEntry?.iniBonus
                  const hasMods = (at != null && at !== 0) || (pa != null && pa !== 0) || dmg || (aw != null && aw !== 0) || (ini != null && ini !== 0)
                  if (!hasMods) return null
                  return (
                    <div className="flex flex-wrap gap-2">
                      {at != null && at !== 0 && (
                        <div className="bg-red-900/15 border border-red-900/20 rounded-sm px-3 py-1.5 text-center">
                          <div className="text-lg font-mono font-bold text-red-400">{at > 0 ? '+' : ''}{at}</div>
                          <div className="text-[9px] text-dsa-parchment-dark/50">Attacke</div>
                        </div>
                      )}
                      {pa != null && pa !== 0 && (
                        <div className="bg-blue-900/15 border border-blue-900/20 rounded-sm px-3 py-1.5 text-center">
                          <div className="text-lg font-mono font-bold text-blue-400">{pa > 0 ? '+' : ''}{pa}</div>
                          <div className="text-[9px] text-dsa-parchment-dark/50">Parade</div>
                        </div>
                      )}
                      {dmg && (
                        <div className="bg-dsa-gold/10 border border-dsa-gold/20 rounded-sm px-3 py-1.5 text-center">
                          <div className="text-lg font-mono font-bold text-dsa-gold">{dmg}</div>
                          <div className="text-[9px] text-dsa-parchment-dark/50">Schaden</div>
                        </div>
                      )}
                      {aw != null && aw !== 0 && (
                        <div className="bg-cyan-900/15 border border-cyan-900/20 rounded-sm px-3 py-1.5 text-center">
                          <div className="text-lg font-mono font-bold text-cyan-400">+{aw}</div>
                          <div className="text-[9px] text-dsa-parchment-dark/50">Ausweichen</div>
                        </div>
                      )}
                      {ini != null && ini !== 0 && (
                        <div className="bg-amber-900/15 border border-amber-900/20 rounded-sm px-3 py-1.5 text-center">
                          <div className="text-lg font-mono font-bold text-amber-400">+{ini}</div>
                          <div className="text-[9px] text-dsa-parchment-dark/50">Initiative</div>
                        </div>
                      )}
                      {tpl?.ap_cost != null && (
                        <div className="bg-dsa-bg-light border border-dsa-bg-medium rounded-sm px-3 py-1.5 text-center">
                          <div className="text-lg font-mono font-bold text-dsa-parchment">{tpl.ap_cost}</div>
                          <div className="text-[9px] text-dsa-parchment-dark/50">AP-Kosten</div>
                        </div>
                      )}
                    </div>
                  )
                })()}
                {/* AP cost if no modifiers shown */}
                {tpl && !tpl.at_mod && !tpl.pa_mod && !tpl.damage_modifier && !COMBAT_SPECIAL_ABILITIES[sfPopup] && tpl.ap_cost != null && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-dsa-parchment-dark">AP-Kosten:</span>
                    <span className="font-mono font-bold text-dsa-gold">{tpl.ap_cost}</span>
                  </div>
                )}
                {/* Description */}
                {(tpl?.description || exp || csaEntry?.desc) && (
                  <div className="bg-dsa-bg-light/30 border border-dsa-bg-medium rounded-sm p-3 text-xs text-dsa-parchment leading-relaxed">
                    {tpl?.description || exp || csaEntry?.desc}
                  </div>
                )}
                {/* Rules text */}
                {tpl?.rules_text && (
                  <div className="bg-dsa-bg/50 border border-dsa-bg-medium rounded-sm p-3 text-[11px] font-mono text-dsa-parchment-dark leading-relaxed">
                    {tpl.rules_text}
                  </div>
                )}
                {/* Detail fields */}
                <div className="space-y-1.5 text-xs">
                  {tpl?.category && (
                    <div className="flex justify-between"><span className="text-dsa-parchment-dark">Kategorie</span><span className="text-dsa-parchment capitalize">{tpl.category.replace(/_/g, ' ')}</span></div>
                  )}
                  {tpl?.prerequisites && (Array.isArray(tpl.prerequisites) ? tpl.prerequisites : []).length > 0 && (
                    <div className="flex justify-between"><span className="text-dsa-parchment-dark">Voraussetzungen</span><span className="text-dsa-parchment">{(Array.isArray(tpl.prerequisites) ? tpl.prerequisites : []).join(', ') || '\u2014'}</span></div>
                  )}
                  {tpl?.applicable_techniques && (Array.isArray(tpl.applicable_techniques) ? tpl.applicable_techniques : []).length > 0 && (
                    <div>
                      <span className="text-dsa-parchment-dark">Anwendbar auf: </span>
                      <span className="text-dsa-parchment">{tpl.applicable_techniques.join(', ')}</span>
                    </div>
                  )}
                  {tpl?.exclusive_with && (Array.isArray(tpl.exclusive_with) ? tpl.exclusive_with : []).length > 0 && (
                    <div className="text-[10px] text-red-400/60">Nicht kombinierbar mit: {tpl.exclusive_with.join(', ')}</div>
                  )}
                  {tpl?.combinable_with && (Array.isArray(tpl.combinable_with) ? tpl.combinable_with : []).length > 0 && (
                    <div className="text-[10px] text-green-400/60">Kombinierbar mit: {tpl.combinable_with.join(', ')}</div>
                  )}
                </div>
                {/* No template found */}
                {!tpl && !exp && !csaEntry && (
                  <p className="text-xs text-dsa-parchment-dark/50 italic">Keine weiteren Details in der Datenbank verfügbar.</p>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Sprachen ── */}
      {char.languages?.length > 0 && (
        <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-dsa-bg-medium/50">
            <span className="text-xs font-bold uppercase tracking-wider text-dsa-mana">Sprachen</span>
          </div>
          <div className="p-3 flex flex-wrap gap-2">
            {char.languages.map((lang, i) => {
              const name = typeof lang === 'string' ? lang : lang.name
              const level = typeof lang === 'object' ? lang.level : null
              return (
                <span key={i} className="bg-dsa-mana/10 border border-dsa-mana/20 rounded-sm px-2 py-1 text-xs text-dsa-mana-light">
                  {name}{level != null && <span className="text-dsa-parchment-dark/50 ml-1">({level})</span>}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Bio ── */}
      {char.bio && (
        <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-dsa-bg-medium/50">
            <BookOpen className="w-4 h-4 text-dsa-parchment-dark" />
            <span className="text-xs font-bold uppercase tracking-wider text-dsa-parchment-dark">Hintergrund</span>
          </div>
          <div className="p-3">
            <p className="text-xs text-dsa-parchment leading-relaxed">{char.bio}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── GM Buff Management Panel (inline, not a modal) ──
const BUFF_STATS = ['MU', 'KL', 'IN', 'CH', 'FF', 'GE', 'KO', 'KK', 'AT', 'PA', 'AW', 'FK', 'INI', 'GS', 'RS']

function GmBuffPanel({ characterId, charBuffs, sendMessage }) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingBuff, setEditingBuff] = useState(null) // buff object being edited
  const [formStat, setFormStat] = useState('KK')
  const [formValue, setFormValue] = useState('2')
  const [formDuration, setFormDuration] = useState('60')
  const [formSource, setFormSource] = useState('')

  const resetForm = () => {
    setFormStat('KK')
    setFormValue('2')
    setFormDuration('60')
    setFormSource('')
    setShowAddForm(false)
    setEditingBuff(null)
  }

  const handleAdd = () => {
    const val = parseInt(formValue)
    const dur = parseInt(formDuration)
    if (isNaN(val) || val === 0 || isNaN(dur) || dur <= 0) return
    sendMessage?.({
      type: 'buff_apply',
      payload: {
        character_id: characterId,
        stat: formStat,
        value: val,
        source: formSource.trim() || 'GM',
        duration_minutes: dur,
      },
    })
    resetForm()
  }

  const handleEdit = () => {
    if (!editingBuff) return
    const val = parseInt(formValue)
    const dur = parseInt(formDuration)
    if (isNaN(val) || val === 0 || isNaN(dur) || dur <= 0) return
    // Remove old buff, apply new one
    sendMessage?.({
      type: 'buff_remove',
      payload: { character_id: characterId, buff_id: editingBuff.id },
    })
    sendMessage?.({
      type: 'buff_apply',
      payload: {
        character_id: characterId,
        stat: formStat,
        value: val,
        source: formSource.trim() || editingBuff.source || 'GM',
        duration_minutes: dur,
      },
    })
    resetForm()
  }

  const handleRemove = (buffId) => {
    sendMessage?.({
      type: 'buff_remove',
      payload: { character_id: characterId, buff_id: buffId },
    })
  }

  const startEdit = (buff) => {
    setEditingBuff(buff)
    setFormStat(buff.stat)
    setFormValue(String(buff.value))
    // Compute remaining minutes
    const remainMin = Math.max(1, Math.round((buff.expiresAt - Date.now()) / 60000))
    setFormDuration(String(remainMin))
    setFormSource(buff.source || '')
    setShowAddForm(true)
  }

  return (
    <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-dsa-bg-medium/50 bg-dsa-gold/10">
        <Sparkles className="w-4 h-4 text-dsa-gold" />
        <span className="text-xs font-bold uppercase tracking-wider text-dsa-gold">Aktive Effekte</span>
        <span className="text-[10px] font-mono text-dsa-parchment-dark/40">{charBuffs.length}</span>
        <button
          onClick={() => { if (showAddForm && !editingBuff) resetForm(); else { setEditingBuff(null); setShowAddForm(true) } }}
          className="ml-auto text-dsa-gold/60 hover:text-dsa-gold transition-colors"
          title="Buff hinzufuegen"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
      <div className="p-2.5 space-y-2">
        {/* Active buffs with edit/remove controls */}
        {charBuffs.length > 0 ? (
          <ActiveBuffs
            characterId={characterId}
            detailed
            sendMessage={sendMessage}
            onRemove={handleRemove}
            onEdit={startEdit}
          />
        ) : !showAddForm && (
          <p className="text-xs text-dsa-parchment-dark/40 italic py-1 text-center">Keine aktiven Effekte</p>
        )}

        {/* Inline add/edit form */}
        {showAddForm && (
          <div className="border border-dsa-gold/20 rounded-sm p-2.5 bg-dsa-gold/5 space-y-2">
            <div className="text-[10px] text-dsa-gold font-bold uppercase tracking-wider">
              {editingBuff ? 'Effekt bearbeiten' : 'Neuer Effekt'}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {/* Stat selector */}
              <div>
                <label className="text-[9px] text-dsa-parchment-dark/60 uppercase">Wert</label>
                <select
                  value={formStat}
                  onChange={(e) => setFormStat(e.target.value)}
                  className="w-full mt-0.5 text-xs bg-dsa-bg border border-dsa-bg-medium rounded-sm px-2 py-1 text-dsa-parchment focus:border-dsa-gold/50 outline-none"
                >
                  {BUFF_STATS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {/* Value */}
              <div>
                <label className="text-[9px] text-dsa-parchment-dark/60 uppercase">Modifikator</label>
                <input
                  type="number"
                  value={formValue}
                  onChange={(e) => setFormValue(e.target.value)}
                  className="w-full mt-0.5 text-xs bg-dsa-bg border border-dsa-bg-medium rounded-sm px-2 py-1 text-dsa-parchment font-mono focus:border-dsa-gold/50 outline-none"
                  placeholder="+2"
                />
              </div>
              {/* Duration */}
              <div>
                <label className="text-[9px] text-dsa-parchment-dark/60 uppercase">Dauer (Min)</label>
                <input
                  type="number"
                  value={formDuration}
                  onChange={(e) => setFormDuration(e.target.value)}
                  min="1"
                  className="w-full mt-0.5 text-xs bg-dsa-bg border border-dsa-bg-medium rounded-sm px-2 py-1 text-dsa-parchment font-mono focus:border-dsa-gold/50 outline-none"
                  placeholder="60"
                />
              </div>
              {/* Source */}
              <div>
                <label className="text-[9px] text-dsa-parchment-dark/60 uppercase">Quelle</label>
                <input
                  type="text"
                  value={formSource}
                  onChange={(e) => setFormSource(e.target.value)}
                  className="w-full mt-0.5 text-xs bg-dsa-bg border border-dsa-bg-medium rounded-sm px-2 py-1 text-dsa-parchment focus:border-dsa-gold/50 outline-none"
                  placeholder="z.B. Elixier der Staerke"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={editingBuff ? handleEdit : handleAdd}
                className="flex items-center gap-1 px-3 py-1 text-[10px] font-bold text-dsa-bg bg-dsa-gold rounded-sm hover:bg-dsa-gold/80 transition-colors"
              >
                <Check className="w-3 h-3" />
                {editingBuff ? 'Speichern' : 'Hinzufuegen'}
              </button>
              <button
                onClick={resetForm}
                className="text-[10px] text-dsa-parchment-dark/60 hover:text-dsa-parchment"
              >
                Abbrechen
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export { PlayerDetailView }
export default React.memo(PlayerOverview)
