import React, { useState, useEffect, useMemo } from 'react'
import { Sparkles, Clock, Send, Check, ChevronDown, ChevronUp, HelpCircle, Zap, Target, Shield, Star, Filter, Wand2 } from 'lucide-react'
import useCharacterStore from '../../stores/characterStore'
import useSessionStore from '../../stores/sessionStore'
import useAuthStore from '../../stores/authStore'
import Badge from '../../components/common/Badge'
import { ATTR_NAMES, ATTR_TEXT_COLORS, ATTR_COLORS } from '../../constants/attributes'

// Property → color mapping for Merkmal badges
const PROPERTY_COLORS = {
  'Heilung':     'bg-green-900/30 text-green-400 border-green-800/30',
  'Elementar':   'bg-orange-900/30 text-orange-400 border-orange-800/30',
  'Dämonisch':   'bg-red-900/30 text-red-400 border-red-800/30',
  'Telekinese':  'bg-cyan-900/30 text-cyan-400 border-cyan-800/30',
  'Hellsicht':   'bg-violet-900/30 text-violet-400 border-violet-800/30',
  'Illusion':    'bg-pink-900/30 text-pink-400 border-pink-800/30',
  'Einfluss':    'bg-rose-900/30 text-rose-400 border-rose-800/30',
  'Verwandlung': 'bg-amber-900/30 text-amber-400 border-amber-800/30',
  'Antimagie':   'bg-slate-900/30 text-slate-300 border-slate-800/30',
  'Sphären':     'bg-indigo-900/30 text-indigo-400 border-indigo-800/30',
  'Objekt':      'bg-yellow-900/30 text-yellow-400 border-yellow-800/30',
  'Temporal':    'bg-teal-900/30 text-teal-400 border-teal-800/30',
}
const DEFAULT_PROPERTY_COLOR = 'bg-dsa-bg-card text-dsa-parchment-dark border-dsa-bg-medium'

// Auto-paginating databank fetch
async function fetchDatabank(entityType, token) {
  let all = [], page = 1
  while (true) {
    const res = await fetch(`/api/databank/${entityType}?page_size=200&page=${page}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) break
    const data = await res.json()
    const items = data.items || []
    all = all.concat(items)
    if (items.length < 200 || page * 200 >= (data.total || Infinity)) break
    page++
  }
  return all
}

// Extract tradition name(s) from character's special_abilities list
function extractTraditions(specialAbilities) {
  if (!Array.isArray(specialAbilities)) return []
  const traditions = []
  for (const sa of specialAbilities) {
    const name = typeof sa === 'string' ? sa : sa?.name || sa?.id || ''
    const match = name.match(/^Tradition\s*\((.+)\)$/i)
    if (match) traditions.push(match[1])
  }
  return traditions
}

// Roman numeral helper for enhancement levels
const ROMAN = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V' }

function PropertyBadge({ property }) {
  if (!property) return null
  const colorClass = PROPERTY_COLORS[property] || DEFAULT_PROPERTY_COLOR
  return (
    <span className={`inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded border ${colorClass}`}>
      {property}
    </span>
  )
}

function SpellBook({ sendMessage }) {
  const myCharacter = useCharacterStore((s) => s.myCharacter)
  const getAttributes = useCharacterStore((s) => s.getAttributes)
  const getVitals = useCharacterStore((s) => s.getVitals)
  const token = useAuthStore((s) => s.token)

  const [expandedSpell, setExpandedSpell] = useState(null)
  const [requestedSpells, setRequestedSpells] = useState({})
  const [spellTemplates, setSpellTemplates] = useState({}) // name → full template object
  const [liturgyTemplates, setLiturgyTemplates] = useState({})
  const [rawSpellTemplates, setRawSpellTemplates] = useState([]) // full array for enhancement lookup
  const [rawLiturgyTemplates, setRawLiturgyTemplates] = useState([])
  const [cantripTemplates, setCantripTemplates] = useState([])
  const [blessingTemplates, setBlessingTemplates] = useState([])
  const [propertyFilter, setPropertyFilter] = useState(null) // null = show all

  // Load spell/liturgy/cantrip/blessing templates from DB
  useEffect(() => {
    if (!token) return
    Promise.all([
      fetchDatabank('spells', token),
      fetchDatabank('liturgies', token),
      fetchDatabank('cantrips', token),
      fetchDatabank('blessings', token),
    ]).then(([spells, lits, cantrips, blessings]) => {
      // Index by lowercase name for lookup
      const sMap = {}
      for (const s of spells) {
        const key = s.name.toLowerCase().replace(/\s+/g, '_')
        sMap[key] = {
          id: s.id, probe: s.probe || [], asp: parseInt(s.asp_cost) || 0,
          time: s.casting_time || '?', range: s.range || '?',
          duration: s.duration || '?', desc: s.description || s.effect || '',
          property: s.property || null,
          enhancements: s.enhancements || [],
        }
      }
      const lMap = {}
      for (const l of lits) {
        const key = l.name.toLowerCase().replace(/\s+/g, '_')
        lMap[key] = {
          id: l.id, probe: l.probe || [], kap: parseInt(l.kap_cost) || 0,
          time: l.casting_time || '?', range: l.range || '?',
          duration: l.duration || '?', desc: l.description || l.effect || '',
          enhancements: l.enhancements || [],
        }
      }
      setSpellTemplates(sMap)
      setLiturgyTemplates(lMap)
      setRawSpellTemplates(spells)
      setRawLiturgyTemplates(lits)
      setCantripTemplates(cantrips)
      setBlessingTemplates(blessings)
    })
  }, [token])

  if (!myCharacter) return <div className="text-center py-8 text-dsa-parchment-dark text-sm">Kein Charakter geladen.</div>

  const attrs = getAttributes()
  const vitals = getVitals()
  const spells = myCharacter.spells || {}
  const liturgies = myCharacter.liturgies || {}
  const charSAs = myCharacter.special_abilities || []
  const spellEnhancements = myCharacter.spell_enhancements || myCharacter.char_data?.spell_enhancements || {}
  const liturgyEnhancements = myCharacter.liturgy_enhancements || myCharacter.char_data?.liturgy_enhancements || {}
  const hasSpells = Object.keys(spells).length > 0
  const hasLiturgies = Object.keys(liturgies).length > 0

  // Detect traditions
  const allTraditions = useMemo(() => extractTraditions(charSAs), [charSAs])
  const magicTraditions = useMemo(() => {
    if (!allTraditions.length || !rawSpellTemplates.length) return allTraditions
    const spellTraditionSet = new Set(rawSpellTemplates.flatMap(s => s.tradition || []))
    return allTraditions.filter(t => spellTraditionSet.has(t))
  }, [allTraditions, rawSpellTemplates])
  const karmalTraditions = useMemo(() => {
    if (!allTraditions.length || !rawLiturgyTemplates.length) return allTraditions
    const litTraditionSet = new Set(rawLiturgyTemplates.flatMap(l => l.tradition || []))
    return allTraditions.filter(t => litTraditionSet.has(t))
  }, [allTraditions, rawLiturgyTemplates])

  const isMagic = hasSpells || magicTraditions.length > 0
  const isBlessed = hasLiturgies || karmalTraditions.length > 0

  // Filter cantrips/blessings by tradition
  const myCantrips = useMemo(() => {
    if (!isMagic || cantripTemplates.length === 0) return []
    if (magicTraditions.length === 0) return cantripTemplates
    return cantripTemplates.filter(c =>
      !Array.isArray(c.tradition) || c.tradition.length === 0 ||
      c.tradition.some(t => magicTraditions.includes(t))
    )
  }, [isMagic, cantripTemplates, magicTraditions])

  const myBlessings = useMemo(() => {
    if (!isBlessed || blessingTemplates.length === 0) return []
    if (karmalTraditions.length === 0) return blessingTemplates
    return blessingTemplates.filter(b =>
      !Array.isArray(b.tradition) || b.tradition.length === 0 ||
      b.tradition.some(t => karmalTraditions.includes(t))
    )
  }, [isBlessed, blessingTemplates, karmalTraditions])

  // Collect unique properties for filter
  const spellProperties = useMemo(() => {
    const props = new Set()
    for (const info of Object.values(spellTemplates)) {
      if (info.property) props.add(info.property)
    }
    return Array.from(props).sort()
  }, [spellTemplates])

  if (!hasSpells && !hasLiturgies && myCantrips.length === 0 && myBlessings.length === 0) {
    return (
      <div className="text-center py-12">
        <Sparkles className="w-8 h-8 text-dsa-parchment-dark/30 mx-auto mb-3" />
        <p className="text-dsa-parchment-dark">Dein Charakter hat keine Zauber oder Liturgien.</p>
        <p className="text-xs text-dsa-parchment-dark/50 mt-1">Nur Zauberer (AsP) und Geweihte (KaP) haben Zugang zu Magie.</p>
      </div>
    )
  }

  const handleRequestCast = (e, name, fw, info, type = 'spell') => {
    e.stopPropagation()
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    sendMessage?.({
      type: 'spell_cast_request',
      payload: {
        request_id: requestId,
        character_id: myCharacter.id,
        character_name: myCharacter.name,
        spell_name: name,
        fw,
        probe: info?.probe || [],
        cost: type === 'spell' ? `${info?.asp || '?'} AsP` : `${info?.kap || '?'} KaP`,
        cast_type: type,
      },
    })
    useSessionStore.getState().setPendingRequest({
      id: requestId, type: 'spell', label: `${name} wirken`, timestamp: Date.now(),
    })
    setRequestedSpells(prev => ({ ...prev, [name]: 'pending' }))
    setTimeout(() => {
      setRequestedSpells(prev => { const n = { ...prev }; if (n[name] === 'pending') delete n[name]; return n })
    }, 10000)
  }

  const renderSpellList = (spellEntries, infoMap, costLabel, colorClass, type) => {
    // Apply property filter for spells
    let entries = spellEntries
    if (type === 'spell' && propertyFilter) {
      entries = entries.filter(([name]) => {
        const info = infoMap[name]
        return info?.property === propertyFilter
      })
    }

    return (
      <div className="space-y-2">
        {entries.sort(([nameA, a], [nameB, b]) => b !== a ? b - a : nameA.localeCompare(nameB)).map(([name, fw]) => {
          const info = infoMap[name]
          const isExpanded = expandedSpell === name
          const reqState = requestedSpells[name]
          const canAfford = type === 'spell' ? vitals.asp >= (info?.asp || 0) : vitals.kap >= (info?.kap || 0)
          const enhancementsData = info?.enhancements || []
          const purchasedEnhIds = type === 'spell'
            ? (spellEnhancements[info?.id] || spellEnhancements[name] || [])
            : (liturgyEnhancements[info?.id] || liturgyEnhancements[name] || [])

          return (
            <div key={name} className={`bg-dsa-bg-card border rounded overflow-hidden transition-colors ${isExpanded ? 'border-dsa-gold/30' : 'border-dsa-bg-medium'}`}>
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-dsa-bg-light/20 transition-colors"
                onClick={() => setExpandedSpell(isExpanded ? null : name)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-dsa-parchment uppercase">{name.replace(/_/g, ' ')}</span>
                    {info?.property && <PropertyBadge property={info.property} />}
                    {!canAfford && <Badge variant="danger" size="sm">Nicht genug {costLabel}</Badge>}
                    {enhancementsData.length > 0 && purchasedEnhIds.length > 0 && (
                      <span className="text-[9px] font-mono text-dsa-gold bg-dsa-gold/10 border border-dsa-gold/20 px-1 rounded">
                        {purchasedEnhIds.length}/{enhancementsData.length} Erw.
                      </span>
                    )}
                  </div>
                  {/* Probe attributes with values */}
                  {info && (
                    <div className="flex items-center gap-1.5 mt-1">
                      {info.probe.map((attr, i) => (
                        <span key={i} className={`inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-md bg-gradient-to-b ${ATTR_COLORS[attr]} border`}>
                          <span className={`font-medium ${ATTR_TEXT_COLORS[attr]}`}>{ATTR_NAMES[attr]}</span>
                          <span className="font-mono font-bold text-dsa-parchment">{attrs[attr]}</span>
                        </span>
                      ))}
                      <span className="text-[10px] text-dsa-parchment-dark ml-1">· {info.asp || info.kap} {costLabel} · {info.time}</span>
                    </div>
                  )}
                </div>

                <div className="text-center mr-2 flex-shrink-0">
                  <div className={`text-lg font-bold font-mono ${colorClass}`}>{fw}</div>
                  <div className="text-[9px] text-dsa-parchment-dark cursor-help" title="Fertigkeitswert — je hoeher, desto besser beherrscht du diesen Zauber/diese Liturgie">FW</div>
                </div>

                <button
                  onClick={(e) => { if (!reqState && canAfford) handleRequestCast(e, name, fw, info, type) }}
                  disabled={!!reqState || !canAfford}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-sm text-xs font-medium transition-all flex-shrink-0 ${
                    reqState === 'pending' ? 'bg-yellow-900/30 text-yellow-400 border border-yellow-800/30'
                    : !canAfford ? 'bg-dsa-bg-medium text-dsa-parchment-dark/30 border border-dsa-bg-medium cursor-not-allowed'
                    : `bg-${type === 'spell' ? 'blue' : 'yellow'}-900/20 ${colorClass} border border-${type === 'spell' ? 'blue' : 'yellow'}-800/20 hover:bg-${type === 'spell' ? 'blue' : 'yellow'}-900/30`
                  }`}
                >
                  {reqState === 'pending' ? <><Clock className="w-3.5 h-3.5 animate-pulse" /> Angefragt</>
                    : <><Send className="w-3.5 h-3.5" /> Wirken</>}
                </button>

                <div className="flex-shrink-0 text-dsa-parchment-dark/30">
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </div>

              {isExpanded && (
                <div className="px-4 pb-4 border-t border-dsa-bg-medium pt-3 space-y-3">
                  {/* Description */}
                  <p className="text-sm text-dsa-parchment/70 leading-relaxed">
                    {info?.desc || `${type === 'spell' ? 'Zauberspruch' : 'Liturgie'} ${name.replace(/_/g, ' ')}.`}
                  </p>

                  {/* Stats grid */}
                  {info && (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                      <div className="bg-dsa-bg rounded-sm border border-dsa-bg-medium p-2 text-center">
                        <div className="text-[9px] text-dsa-parchment-dark">Kosten</div>
                        <div className={`text-sm font-bold font-mono ${colorClass}`}>{info.asp || info.kap} {costLabel}</div>
                      </div>
                      <div className="bg-dsa-bg rounded-sm border border-dsa-bg-medium p-2 text-center">
                        <div className="text-[9px] text-dsa-parchment-dark">Zauberdauer</div>
                        <div className="text-sm font-medium text-dsa-parchment">{info.time}</div>
                      </div>
                      <div className="bg-dsa-bg rounded-sm border border-dsa-bg-medium p-2 text-center">
                        <div className="text-[9px] text-dsa-parchment-dark">Reichweite</div>
                        <div className="text-sm font-medium text-dsa-parchment">{info.range}</div>
                      </div>
                      <div className="bg-dsa-bg rounded-sm border border-dsa-bg-medium p-2 text-center">
                        <div className="text-[9px] text-dsa-parchment-dark">Wirkungsdauer</div>
                        <div className="text-sm font-medium text-dsa-parchment">{info.duration}</div>
                      </div>
                    </div>
                  )}

                  {/* Enhancements (Erweiterungen) */}
                  {enhancementsData.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <Star className="w-3.5 h-3.5 text-dsa-gold" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-dsa-gold">Erweiterungen</span>
                      </div>
                      {enhancementsData.map((enh) => {
                        const purchased = purchasedEnhIds.includes(enh.level)
                        return (
                          <div key={enh.level} className={`ml-5 px-3 py-2 rounded-sm border text-xs ${
                            purchased
                              ? 'bg-dsa-gold/5 border-dsa-gold/20'
                              : 'bg-dsa-bg border-dsa-bg-medium'
                          }`}>
                            <div className="flex items-center gap-2">
                              <span className={`font-mono font-bold text-[10px] ${purchased ? 'text-dsa-gold' : 'text-dsa-parchment-dark'}`}>
                                {ROMAN[enh.level] || enh.level}
                              </span>
                              <span className={`font-medium ${purchased ? 'text-dsa-parchment' : 'text-dsa-parchment/70'}`}>
                                {enh.name}
                              </span>
                              {purchased && (
                                <span className="flex items-center gap-0.5 text-[9px] font-bold text-green-400 bg-green-900/20 border border-green-800/30 px-1.5 py-0.5 rounded">
                                  <Check className="w-2.5 h-2.5" /> Erworben
                                </span>
                              )}
                              <span className="ml-auto text-[9px] font-mono text-dsa-parchment-dark">{enh.cost} AP</span>
                            </div>
                            <p className="text-dsa-parchment-dark/60 mt-0.5 leading-relaxed">{enh.effect}</p>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* FW explanation */}
                  <div className="bg-dsa-bg rounded-sm border border-dsa-bg-medium px-3 py-2 text-xs text-dsa-parchment/60">
                    <strong className="text-dsa-parchment">Fertigkeitswert {fw}</strong> —
                    {fw >= 10 ? ' sehr guter Wert, du hast viel Spielraum.' : fw >= 6 ? ' solider Wert.' : ' niedriger Wert, gute Wuerfe noetig.'}
                    {' '}Probe gegen{' '}
                    {info?.probe?.map((a, i) => (
                      <span key={i}>{i > 0 && ', '}<span className={ATTR_TEXT_COLORS[a]}>{ATTR_NAMES[a]} ({attrs[a]})</span></span>
                    ))}.
                  </div>

                  {reqState === 'pending' && (
                    <div className="flex items-center gap-2 text-xs text-yellow-400 bg-yellow-900/10 rounded-sm px-3 py-2 border border-yellow-800/20">
                      <Clock className="w-4 h-4 animate-pulse" />
                      Warte auf den Spielleiter... Sag am Tisch was du zaubern moechtest!
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-5">
      {/* Current energy display */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {hasSpells && (
          <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-dsa-bg-medium/50 bg-blue-950/50">
              <Sparkles className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-blue-400">Astralpunkte</span>
            </div>
            <div className="p-4 flex items-center justify-between">
              <p className="text-[10px] text-dsa-parchment-dark">Magische Energie fuer Zauber. Regeneriert bei Rast.</p>
              <div className="text-right">
                <div className="text-2xl font-mono font-bold text-blue-400">{vitals.asp} <span className="text-sm text-dsa-parchment-dark">/ {vitals.aspMax}</span></div>
              </div>
            </div>
          </div>
        )}
        {hasLiturgies && (
          <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-dsa-bg-medium/50 bg-purple-950/50">
              <Shield className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-purple-400">Karmapunkte</span>
            </div>
            <div className="p-4 flex items-center justify-between">
              <p className="text-[10px] text-dsa-parchment-dark">Goettliche Energie fuer Liturgien. Regeneriert bei Rast.</p>
              <div className="text-right">
                <div className="text-2xl font-mono font-bold text-purple-400">{vitals.kap} <span className="text-sm text-dsa-parchment-dark">/ {vitals.kapMax}</span></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* How it works */}
      <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-dsa-bg-medium/50 bg-dsa-gold/10">
          <HelpCircle className="w-4 h-4 text-dsa-gold" />
          <span className="text-xs font-bold uppercase tracking-wider text-dsa-gold">So funktioniert Zaubern</span>
        </div>
        <div className="p-4">
          <p className="text-xs text-dsa-parchment/60 leading-relaxed">
            Tippe auf "Wirken" um den Spielleiter zu fragen ob du zaubern darfst. Er kann die Probe erschweren oder erleichtern.
            Nach Bestaetigung wuerfelst du 3W20 gegen die drei Probe-Eigenschaften. Die Astralpunkte (oder Karmapunkte) werden bei Erfolg abgezogen.
            Zauber mit "Nicht genug" koennen nicht gewirkt werden — du brauchst zuerst eine Rast um dich zu regenerieren.
          </p>
        </div>
      </div>

      {/* Cantrips (Zaubertricks) */}
      {myCantrips.length > 0 && (
        <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-dsa-bg-medium/50 bg-blue-950/30">
            <Wand2 className="w-4 h-4 text-dsa-mana" />
            <span className="text-xs font-bold uppercase tracking-wider text-dsa-mana">Zaubertricks</span>
            <span className="text-[10px] font-mono text-dsa-parchment-dark/40">{myCantrips.length}</span>
            <span className="ml-auto text-[9px] text-dsa-parchment-dark">Keine Kosten — jederzeit einsetzbar</span>
          </div>
          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {myCantrips.map(c => (
              <div key={c.id || c.name} className="bg-dsa-bg rounded-sm border border-dsa-bg-medium p-2.5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-dsa-mana">{c.name}</span>
                </div>
                <p className="text-[10px] text-dsa-parchment/60 leading-relaxed line-clamp-3">{c.effect || 'Kein Effekt angegeben.'}</p>
                <div className="flex gap-3 mt-1.5 text-[9px] text-dsa-parchment-dark">
                  {c.range && <span>Reichweite: {c.range}</span>}
                  {c.duration && <span>Dauer: {c.duration}</span>}
                  {c.target && <span>Ziel: {c.target}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Blessings (Segnungen) */}
      {myBlessings.length > 0 && (
        <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-dsa-bg-medium/50 bg-amber-950/30">
            <Shield className="w-4 h-4 text-dsa-karma" />
            <span className="text-xs font-bold uppercase tracking-wider text-dsa-karma">Segnungen</span>
            <span className="text-[10px] font-mono text-dsa-parchment-dark/40">{myBlessings.length}</span>
            <span className="ml-auto text-[9px] text-dsa-parchment-dark">Keine Kosten — jederzeit einsetzbar</span>
          </div>
          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {myBlessings.map(b => (
              <div key={b.id || b.name} className="bg-dsa-bg rounded-sm border border-dsa-bg-medium p-2.5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-dsa-karma">{b.name}</span>
                </div>
                <p className="text-[10px] text-dsa-parchment/60 leading-relaxed line-clamp-3">{b.effect || 'Kein Effekt angegeben.'}</p>
                <div className="flex gap-3 mt-1.5 text-[9px] text-dsa-parchment-dark">
                  {b.range && <span>Reichweite: {b.range}</span>}
                  {b.duration && <span>Dauer: {b.duration}</span>}
                  {b.target && <span>Ziel: {b.target}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Spells */}
      {hasSpells && (
        <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-dsa-bg-medium/50 bg-blue-950/50">
            <Sparkles className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-blue-400">Zaubersprueche</span>
            <span className="text-[10px] font-mono text-dsa-parchment-dark/40">{Object.keys(spells).length}</span>
          </div>
          {/* Property filter */}
          {spellProperties.length > 1 && (
            <div className="px-3 py-2 border-b border-dsa-bg-medium/30 flex items-center gap-1.5 flex-wrap">
              <Filter className="w-3 h-3 text-dsa-parchment-dark/40" />
              <button
                onClick={() => setPropertyFilter(null)}
                className={`text-[9px] px-1.5 py-0.5 rounded border transition ${
                  !propertyFilter ? 'bg-dsa-gold/10 border-dsa-gold/30 text-dsa-gold font-bold' : 'border-dsa-bg-medium text-dsa-parchment-dark hover:text-dsa-parchment'
                }`}
              >
                Alle
              </button>
              {spellProperties.map(prop => (
                <button
                  key={prop}
                  onClick={() => setPropertyFilter(propertyFilter === prop ? null : prop)}
                  className={`text-[9px] px-1.5 py-0.5 rounded border transition ${
                    propertyFilter === prop ? 'bg-dsa-gold/10 border-dsa-gold/30 text-dsa-gold font-bold' : 'border-dsa-bg-medium text-dsa-parchment-dark hover:text-dsa-parchment'
                  }`}
                >
                  {prop}
                </button>
              ))}
            </div>
          )}
          <div className="p-3">
            {renderSpellList(Object.entries(spells), spellTemplates, 'AsP', 'text-blue-400', 'spell')}
          </div>
        </div>
      )}

      {/* Liturgies */}
      {hasLiturgies && (
        <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-dsa-bg-medium/50 bg-purple-950/50">
            <Shield className="w-4 h-4 text-purple-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-purple-400">Liturgien</span>
            <span className="text-[10px] font-mono text-dsa-parchment-dark/40">{Object.keys(liturgies).length}</span>
          </div>
          <div className="p-3">
            {renderSpellList(Object.entries(liturgies), liturgyTemplates, 'KaP', 'text-purple-400', 'liturgy')}
          </div>
        </div>
      )}
    </div>
  )
}

export default React.memo(SpellBook)
