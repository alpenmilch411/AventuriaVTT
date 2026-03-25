import { useState, useEffect } from 'react'
import { Shield, Swords, Heart, Sparkles, Star, Info, Eye, HelpCircle, Flame, Brain, Crown, Hand, Wind, HeartPulse, Hammer, AlertTriangle, Crosshair, Sun, User, BookOpen, X, ChevronRight } from 'lucide-react'
import useCharacterStore from '../../stores/characterStore'
import useAuthStore from '../../stores/authStore'
import { getConditionModifier, CONDITIONS } from '../../engine/conditionsEngine'
import Badge from '../../components/common/Badge'
import clsx from 'clsx'

// ── Attribute metadata ──
const ATTR = {
  MU: { name: 'Mut', icon: Flame, color: 'text-red-400', bg: 'from-red-900/30 to-red-950/10 border-red-800/20', desc: 'Tapferkeit und Entschlossenheit. Beeinflusst Kampfproben, Zauber und Selbstbeherrschung.' },
  KL: { name: 'Klugheit', icon: Brain, color: 'text-blue-400', bg: 'from-blue-900/30 to-blue-950/10 border-blue-800/20', desc: 'Logisches Denken und Wissen. Zentral für Wissenstalente und Magie.' },
  IN: { name: 'Intuition', icon: Eye, color: 'text-violet-400', bg: 'from-violet-900/30 to-violet-950/10 border-violet-800/20', desc: 'Bauchgefühl und Wahrnehmung. Wichtig für Sinnesschärfe und Menschenkenntnis.' },
  CH: { name: 'Charisma', icon: Crown, color: 'text-pink-400', bg: 'from-pink-900/30 to-pink-950/10 border-pink-800/20', desc: 'Ausstrahlung und Überzeugungskraft. Entscheidend für soziale Proben.' },
  FF: { name: 'Fingerfertigkeit', icon: Hand, color: 'text-emerald-400', bg: 'from-emerald-900/30 to-emerald-950/10 border-emerald-800/20', desc: 'Feinmotorik. Wichtig für Schlösserknacken und Handwerk.' },
  GE: { name: 'Gewandtheit', icon: Wind, color: 'text-cyan-400', bg: 'from-cyan-900/30 to-cyan-950/10 border-cyan-800/20', desc: 'Beweglichkeit und Reaktion. Beeinflusst Ausweichen und Schleichen.' },
  KO: { name: 'Konstitution', icon: HeartPulse, color: 'text-orange-400', bg: 'from-orange-900/30 to-orange-950/10 border-orange-800/20', desc: 'Widerstandskraft. Bestimmt Lebenspunkte und Zähigkeit.' },
  KK: { name: 'Körperkraft', icon: Hammer, color: 'text-amber-400', bg: 'from-amber-900/30 to-amber-950/10 border-amber-800/20', desc: 'Muskelkraft. Beeinflusst Nahkampfschaden und Tragkraft.' },
}

// ── SF Explanations ──
const SF_EXPLAIN = {
  'Wuchtschlag I': '-2 AT, +2 Schaden bei Treffer.',
  'Wuchtschlag II': '-4 AT, +4 Schaden bei Treffer.',
  'Finte I': '-1 AT, Gegner -2 PA.',
  'Schildkampf I': '+1 Parade mit Schild.',
  'Schildkampf II': '+2 Parade mit Schild.',
  'Rüstungsgewöhnung I': 'Behinderung -1.',
  'Rüstungsgewöhnung II': 'Behinderung -2.',
  'Kampfreflexe': '+2 Initiative, immun gegen Überraschung.',
  'Kampfgespür': '+1 Parade, +1 Ausweichen.',
  'Verbessertes Ausweichen I': '+2 Ausweichen.',
  'Beidhändiger Kampf I': 'Zusatzangriff Nebenhand (-4 AT).',
  'Scharfschütze': 'Distanzabzüge -2.',
  'Schnellladen (Bogen)': 'Bogen als freie Aktion laden.',
  'Tradition (Gildenmagie)': 'Gildenmagier-Zauber lernen und wirken.',
  'Tradition (Perainekirche)': 'Peraine-Liturgien wirken.',
  'Zauber verbreiten': 'Zauber auf mehrere Ziele (mehr AsP).',
  'Liturgiestil (Peraine)': 'Bonus auf Heilungs-Liturgien.',
  'Ortskenntnis': '+1 auf Gassenwissen/Orientierung am Ort.',
  'Geländekunde': '+1 auf Fährtensuchen/Orientierung/Pflanzenkunde im Gelände.',
  'Athlet': 'Körperbeherrschung/Kraftakt +1 QS.',
  'Nerven aus Stahl': 'Willenskraft gegen Einschüchtern +1 QS.',
  'Fallen entschärfen': 'Schlösserknacken für Fallen.',
  'Astrale Meditation': 'LeP in AsP umwandeln (1:1).',
  'Kraftkontrolle': 'Zauberkosten -1 AsP.',
  'Magische Regeneration I': '+1 AsP/Regeneration.',
  'Karmale Meditation': 'Verzicht auf LeP-Regen, +1W6 KaP.',
  'Karmale Regeneration I': '+1 KaP/Regeneration.',
}

const ADV_EXPLAIN = {
  'Zäher Hund': '+1 gegen Schmerz, länger stabil bei Bewusstlosigkeit.',
  'Hohe Zähigkeit': '+1 Zähigkeit (ZK).',
  'Gutaussehend': '+1 auf Aussehen-Proben.',
  'Zauberer': 'Kann zaubern, hat Astralpunkte.',
  'Geweihter': 'Kann Liturgien wirken, hat Karmapunkte.',
  'Fuchssinn': '+1 Sinnesschärfe.',
  'Dunkelsicht': 'Kein Malus bei Dämmerung, nur -1 bei Dunkelheit.',
  'Hohe Karmalkraft I': '+15 KaP Maximum.',
}

const DISADV_EXPLAIN = {
  'Jähzorn': 'Bei Provokation: Selbstbeherrschung oder blinder Angriff.',
  'Goldgier': 'Schwer Schätzen zu widerstehen.',
  'Neugier': 'Kann Geheimnisse nicht ignorieren.',
  'Prinzipientreue': 'Muss Prinzipien folgen, auch wenn nachteilig.',
  'Mitleid': 'Muss Leidenden helfen.',
  'Platzangst': 'Enge Räume: Furcht 1.',
}

// Derive condition display info from the canonical CONDITIONS engine
const COND_COLORS = {
  'körperlich': 'border-red-800/40 bg-red-950/20',
  'geistig': 'border-violet-800/40 bg-violet-950/20',
  'kampf': 'border-amber-800/40 bg-amber-950/20',
}
function getCondInfo(name) {
  const def = CONDITIONS[name]
  if (!def) return { icon: 'ℹ️', color: 'border-dsa-bg-medium bg-dsa-bg', summary: name, desc: [], modifiers: null, source: '', removal: '' }
  const mods = def.perLevel || def.flat
  const modStr = mods ? Object.entries(mods).map(([s, v]) => `${s} ${v > 0 ? '+' : ''}${v}`).join(', ') + (def.perLevel ? ' pro Stufe' : '') : (def.effect === 'incapacitated' ? 'Handlungsunfähig' : def.effect === 'dot' ? 'Schaden über Zeit' : '')
  return {
    icon: def.icon || '⚠️',
    color: COND_COLORS[def.category] || 'border-dsa-bg-medium bg-dsa-bg',
    summary: def.summary || name,
    desc: def.desc || [],
    modifiers: modStr,
    source: def.source || '',
    removal: def.removal || '',
    levels: def.levels || 1,
  }
}

function Tip({ text }) {
  const [show, setShow] = useState(false)
  if (!text) return null
  return (
    <span className="relative inline-flex">
      <button onClick={(e) => { e.stopPropagation(); setShow(!show) }} className="text-dsa-parchment-dark/40 hover:text-dsa-gold transition-colors ml-1">
        <HelpCircle className="w-3 h-3" />
      </button>
      {show && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShow(false)} />
          <div className="absolute z-50 top-full mt-1 left-1/2 -translate-x-1/2 w-60 bg-dsa-bg-light border border-dsa-gold/30 rounded-sm shadow-xl p-2.5 text-[11px] text-dsa-parchment leading-relaxed">
            {text}
          </div>
        </>
      )}
    </span>
  )
}

export default function CharacterSheet() {
  const myCharacter = useCharacterStore((s) => s.myCharacter)
  const getAttributes = useCharacterStore((s) => s.getAttributes)
  const getVitals = useCharacterStore((s) => s.getVitals)
  const token = useAuthStore((s) => s.token)
  const [sfTemplates, setSfTemplates] = useState([])
  const [sfPopup, setSfPopup] = useState(null) // sf name string

  useEffect(() => {
    if (!token) return
    fetch('/api/databank/special_abilities', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : []).then(d => setSfTemplates(Array.isArray(d) ? d : d.items || []))
      .catch(err => console.error('Failed to fetch special abilities:', err))
  }, [token])

  if (!myCharacter) return <div className="flex items-center justify-center py-12"><p className="text-dsa-parchment-dark">Kein Charakter geladen.</p></div>

  const attrs = getAttributes()
  const vitals = getVitals()
  const derived = myCharacter.derived_values || {}
  const sfs = myCharacter.special_abilities || []
  const advantages = myCharacter.advantages || []
  const disadvantages = myCharacter.disadvantages || []
  const conditions = myCharacter.conditions || []

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

  // SF categorization
  const SF_CATS = [
    { id: 'kampf', label: 'Kampf', icon: Swords, headerBg: 'bg-red-950/50', iconCls: 'text-red-400', textCls: 'text-red-400', match: sf => /wucht|finte|schild|stung|ausweich|kampf|scharf|schnell|parade|beid|reflexe|gesp|entwaffn|niederwerf|hammer|todes|sturm|windm|kreuz|gegen|halte|festnag|blind|klinge|beritte|waffen|ausfall|unterbr|eisenhag|gezielt/i.test(sf) },
    { id: 'magie', label: 'Magie', icon: Sparkles, headerBg: 'bg-blue-950/50', iconCls: 'text-blue-400', textCls: 'text-blue-400', match: sf => /tradition.*gilden|tradition.*hex|tradition.*elf|zauber|magisch|astral|arkan|kraftkontr|fernzauber|aura.*verberg|regeneration.*I/i.test(sf) },
    { id: 'karma', label: 'Karma', icon: Sun, headerBg: 'bg-purple-950/50', iconCls: 'text-purple-400', textCls: 'text-purple-400', match: sf => /tradition.*kirche|tradition.*peraine|tradition.*praios|tradition.*rondra|tradition.*boron|liturgie|karmal|geweiht|aspekt/i.test(sf) },
    { id: 'allgemein', label: 'Allgemein', icon: Star, headerBg: 'bg-dsa-gold/10', iconCls: 'text-dsa-gold', textCls: 'text-dsa-gold', match: () => true },
  ]
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
    <div className="animate-fade-in p-3 space-y-3">

      {/* ━━ Conditions + Vorteile/Nachteile (side by side) ━━ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

        {/* Zustaende */}
        <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-dsa-bg-medium/50 bg-red-950/30">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-red-400">Zustände</span>
            <span className="text-[10px] font-mono text-dsa-parchment-dark/40">{conditions.length}</span>
          </div>
          <div className="p-2.5 max-h-52 overflow-y-auto">
            {conditions.length > 0 ? (
              <div className="space-y-1.5">
                {conditions.map((cond, i) => {
                  const info = getCondInfo(cond.name)
                  const level = cond.level || 1
                  const roman = ['', 'I', 'II', 'III', 'IV'][Math.min(level, 4)]
                  const mods = ['AT', 'PA', 'AW', 'FK', 'INI', 'GS', 'MU', 'KL', 'IN', 'CH', 'FF', 'GE', 'KO', 'KK'].map(s => { const m = getConditionModifier([cond], s); return m !== 0 ? `${s} ${m > 0 ? '+' : ''}${m}` : null }).filter(Boolean)
                  const levelDesc = info.desc[Math.min(level - 1, info.desc.length - 1)]
                  return (
                    <div key={i} className={clsx('border rounded-sm p-2.5', info.color)}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{info.icon}</span>
                        <span className="text-xs font-bold text-dsa-parchment">{cond.name}{info.levels > 1 ? ` ${roman}` : ''}</span>
                        {cond.duration != null && <span className="text-[9px] text-dsa-parchment-dark">({cond.duration} KR)</span>}
                      </div>
                      {/* Current level description */}
                      {levelDesc && <p className="text-[10px] text-dsa-parchment leading-snug mb-1">{levelDesc}</p>}
                      {/* Summary */}
                      <p className="text-[10px] text-dsa-parchment-dark/70 leading-snug">{info.summary}</p>
                      {/* Active stat modifiers */}
                      {mods.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {mods.map(m => (
                            <span key={m} className={clsx('text-[9px] font-mono px-1 py-0.5 rounded-sm border',
                              m.includes('+') ? 'bg-green-900/20 border-green-800/30 text-green-400' : 'bg-red-900/20 border-red-800/30 text-red-400'
                            )}>{m}</span>
                          ))}
                        </div>
                      )}
                      {/* How to remove */}
                      {info.removal && <p className="text-[9px] text-green-400/60 mt-1">Aufhebung: {info.removal}</p>}
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs text-dsa-parchment-dark/40 italic py-2 text-center">Keine aktiven Zustände</p>
            )}
          </div>
        </div>

        {/* Vorteile & Nachteile */}
        <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-dsa-bg-medium/50 bg-dsa-gold/10">
            <Info className="w-4 h-4 text-dsa-gold" />
            <span className="text-xs font-bold uppercase tracking-wider text-dsa-gold">Vor- & Nachteile</span>
            <span className="text-[10px] font-mono text-dsa-parchment-dark/40">{(Array.isArray(advantages) ? advantages.length : Object.keys(advantages).length) + (Array.isArray(disadvantages) ? disadvantages.length : Object.keys(disadvantages).length)}</span>
          </div>
          <div className="p-2.5 max-h-52 overflow-y-auto space-y-1">
            {(Array.isArray(advantages) ? advantages : Object.keys(advantages)).map((v, i) => {
              const exp = lookupExplanation(v, ADV_EXPLAIN)
              return (
                <div key={`a${i}`} className="flex items-start gap-2 bg-green-950/20 border border-green-900/20 rounded-sm p-2">
                  <span className="text-green-400 font-bold text-xs mt-0.5">+</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-bold text-dsa-parchment">{v}</span>
                    {exp && <p className="text-[10px] text-dsa-parchment-dark/60 leading-snug">{exp}</p>}
                  </div>
                </div>
              )
            })}
            {(Array.isArray(disadvantages) ? disadvantages : Object.keys(disadvantages)).map((v, i) => {
              const exp = lookupExplanation(v, DISADV_EXPLAIN)
              return (
                <div key={`d${i}`} className="flex items-start gap-2 bg-red-950/20 border border-red-900/20 rounded-sm p-2">
                  <span className="text-red-400 font-bold text-xs mt-0.5">\u2212</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-bold text-dsa-parchment">{v}</span>
                    {exp && <p className="text-[10px] text-dsa-parchment-dark/60 leading-snug">{exp}</p>}
                  </div>
                </div>
              )
            })}
            {advantages.length === 0 && disadvantages.length === 0 && (
              <p className="text-xs text-dsa-parchment-dark/40 italic py-2 text-center">Keine Vor- oder Nachteile</p>
            )}
          </div>
        </div>
      </div>

      {/* ━━ ROW 3: Sonderfertigkeiten (always 4 cols, clickable) ━━ */}
      {sfs.length > 0 ? (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-dsa-gold" />
            <span className="text-xs font-bold uppercase tracking-wider text-dsa-gold">Sonderfertigkeiten</span>
            <span className="text-[10px] font-mono text-dsa-parchment-dark/40">{sfs.length}</span>
          </div>
          <div className={clsx('grid gap-2', activeCats.length >= 4 ? 'grid-cols-2 lg:grid-cols-4' : activeCats.length === 3 ? 'grid-cols-3' : activeCats.length === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
            {activeCats.map(cat => {
              const Icon = cat.icon
              const items = categorized[cat.id]
              return (
                <div key={cat.id} className="bg-dsa-bg-card border border-dsa-bg-medium rounded overflow-hidden">
                  <div className={clsx('flex items-center gap-1.5 px-2.5 py-1.5 border-b border-dsa-bg-medium/50', cat.headerBg)}>
                    <Icon className={clsx('w-3.5 h-3.5', cat.iconCls)} />
                    <span className={clsx('text-[10px] font-bold uppercase tracking-wider', cat.textCls)}>{cat.label}</span>
                    <span className="text-[9px] font-mono text-dsa-parchment-dark/40 ml-auto">{items.length}</span>
                  </div>
                  <div className="p-1.5 space-y-0.5 max-h-52 overflow-y-auto">
                    {items.map((sf, i) => (
                      <button
                        key={i}
                        onClick={() => setSfPopup(sf)}
                        className="w-full text-left flex items-center gap-1.5 px-2 py-1.5 rounded-sm hover:bg-dsa-bg-light/30 transition-colors"
                      >
                        <span className="text-[11px] font-medium text-dsa-parchment flex-1 truncate">{sf}</span>
                        <ChevronRight className="w-3 h-3 text-dsa-parchment-dark/20 flex-shrink-0" />
                      </button>
                    ))}
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

      {/* ━━ SF Detail Popup ━━ */}
      {sfPopup && (() => {
        const tpl = matchSfTemplate(sfPopup)
        const exp = lookupExplanation(sfPopup, SF_EXPLAIN)
        return (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setSfPopup(null)}>
            <div className="bg-dsa-bg border border-dsa-bg-medium rounded shadow-2xl w-full max-w-md overflow-hidden animate-fade-in" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-dsa-bg-medium bg-dsa-bg-light">
                <h3 className="text-sm font-display font-bold text-dsa-gold">{sfPopup}</h3>
                <button onClick={() => setSfPopup(null)} className="text-dsa-parchment-dark/40 hover:text-dsa-parchment"><X className="w-4 h-4" /></button>
              </div>
              <div className="p-4 space-y-3">
                {/* Stat modifiers */}
                {tpl && (tpl.at_modifier || tpl.pa_modifier || tpl.damage_modifier) && (
                  <div className="flex flex-wrap gap-2">
                    {tpl.at_modifier != null && tpl.at_modifier !== 0 && (
                      <div className="bg-red-900/15 border border-red-900/20 rounded-sm px-3 py-1.5 text-center">
                        <div className="text-lg font-mono font-bold text-red-400">{tpl.at_modifier > 0 ? '+' : ''}{tpl.at_modifier}</div>
                        <div className="text-[9px] text-dsa-parchment-dark/50">Attacke</div>
                      </div>
                    )}
                    {tpl.pa_modifier != null && tpl.pa_modifier !== 0 && (
                      <div className="bg-blue-900/15 border border-blue-900/20 rounded-sm px-3 py-1.5 text-center">
                        <div className="text-lg font-mono font-bold text-blue-400">{tpl.pa_modifier > 0 ? '+' : ''}{tpl.pa_modifier}</div>
                        <div className="text-[9px] text-dsa-parchment-dark/50">Parade</div>
                      </div>
                    )}
                    {tpl.damage_modifier && (
                      <div className="bg-dsa-gold/10 border border-dsa-gold/20 rounded-sm px-3 py-1.5 text-center">
                        <div className="text-lg font-mono font-bold text-dsa-gold">{tpl.damage_modifier}</div>
                        <div className="text-[9px] text-dsa-parchment-dark/50">Schaden</div>
                      </div>
                    )}
                    {tpl.ap_cost != null && (
                      <div className="bg-dsa-bg-light border border-dsa-bg-medium rounded-sm px-3 py-1.5 text-center">
                        <div className="text-lg font-mono font-bold text-dsa-parchment">{tpl.ap_cost}</div>
                        <div className="text-[9px] text-dsa-parchment-dark/50">AP-Kosten</div>
                      </div>
                    )}
                  </div>
                )}
                {/* AP cost if no modifiers shown */}
                {tpl && !tpl.at_modifier && !tpl.pa_modifier && !tpl.damage_modifier && tpl.ap_cost != null && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-dsa-parchment-dark">AP-Kosten:</span>
                    <span className="font-mono font-bold text-dsa-gold">{tpl.ap_cost}</span>
                  </div>
                )}
                {/* Description */}
                {(tpl?.description || exp) && (
                  <div className="bg-dsa-bg-light/30 border border-dsa-bg-medium rounded-sm p-3 text-xs text-dsa-parchment leading-relaxed">
                    {tpl?.description || exp}
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
                  {tpl?.prerequisites && JSON.parse(JSON.stringify(tpl.prerequisites)).length > 0 && (
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
                {!tpl && !exp && (
                  <p className="text-xs text-dsa-parchment-dark/50 italic">Keine weiteren Details in der Datenbank verfügbar.</p>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ━━ ROW 4: Bio ━━ */}
      {myCharacter.bio && (
        <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-dsa-bg-medium/50">
            <BookOpen className="w-4 h-4 text-dsa-parchment-dark" />
            <span className="text-xs font-bold uppercase tracking-wider text-dsa-parchment-dark">Hintergrund</span>
          </div>
          <div className="p-3">
            <p className="text-xs text-dsa-parchment leading-relaxed">{myCharacter.bio}</p>
          </div>
        </div>
      )}
    </div>
  )
}
