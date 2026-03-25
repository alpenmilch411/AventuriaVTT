import React, { useState, useEffect } from 'react'
import { Sparkles, Clock, Send, Check, ChevronDown, ChevronUp, HelpCircle, Zap, Target, Shield } from 'lucide-react'
import useCharacterStore from '../../stores/characterStore'
import useAuthStore from '../../stores/authStore'
import Badge from '../../components/common/Badge'

const ATTR_NAMES = {
  MU: 'Mut', KL: 'Klugheit', IN: 'Intuition', CH: 'Charisma',
  FF: 'Fingerfertigkeit', GE: 'Gewandtheit', KO: 'Konstitution', KK: 'Koerperkraft',
}

const ATTR_TEXT_COLORS = {
  MU: 'text-red-400', KL: 'text-blue-400', IN: 'text-violet-400', CH: 'text-pink-400',
  FF: 'text-emerald-400', GE: 'text-cyan-400', KO: 'text-orange-400', KK: 'text-amber-400',
}

const ATTR_COLORS = {
  MU: 'from-red-900/30 to-red-950/10 border-red-800/20',
  KL: 'from-blue-900/30 to-blue-950/10 border-blue-800/20',
  IN: 'from-violet-900/30 to-violet-950/10 border-violet-800/20',
  CH: 'from-pink-900/30 to-pink-950/10 border-pink-800/20',
  FF: 'from-emerald-900/30 to-emerald-950/10 border-emerald-800/20',
  GE: 'from-cyan-900/30 to-cyan-950/10 border-cyan-800/20',
  KO: 'from-orange-900/30 to-orange-950/10 border-orange-800/20',
  KK: 'from-amber-900/30 to-amber-950/10 border-amber-800/20',
}

// SPELL_INFO and LITURGY_INFO are now loaded from DB spell/liturgy templates
// Hardcoded maps removed — data comes from /api/databank/spells and /api/databank/liturgies

function SpellBook({ sendMessage }) {
  const myCharacter = useCharacterStore((s) => s.myCharacter)
  const getAttributes = useCharacterStore((s) => s.getAttributes)
  const getVitals = useCharacterStore((s) => s.getVitals)
  const token = useAuthStore((s) => s.token)

  const [expandedSpell, setExpandedSpell] = useState(null)
  const [requestedSpells, setRequestedSpells] = useState({})
  const [spellTemplates, setSpellTemplates] = useState({}) // name → {probe, asp_cost, range, duration, ...}
  const [liturgyTemplates, setLiturgyTemplates] = useState({})

  // Load spell/liturgy templates from DB
  useEffect(() => {
    if (!token) return
    const h = { Authorization: `Bearer ${token}` }
    Promise.all([
      fetch('/api/databank/spells', { headers: h }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/databank/liturgies', { headers: h }).then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([sl, ll]) => {
      const spells = Array.isArray(sl) ? sl : sl.items || []
      const lits = Array.isArray(ll) ? ll : ll.items || []
      // Index by lowercase name for lookup
      const sMap = {}
      for (const s of spells) {
        const key = s.name.toLowerCase().replace(/\s+/g, '_')
        sMap[key] = { probe: s.probe || [], asp: parseInt(s.asp_cost) || 0, time: s.casting_time || '?', range: s.range || '?', duration: s.duration || '?', desc: s.description || s.effect || '' }
      }
      const lMap = {}
      for (const l of lits) {
        const key = l.name.toLowerCase().replace(/\s+/g, '_')
        lMap[key] = { probe: l.probe || [], kap: parseInt(l.kap_cost) || 0, time: l.casting_time || '?', range: l.range || '?', duration: l.duration || '?', desc: l.description || l.effect || '' }
      }
      setSpellTemplates(sMap)
      setLiturgyTemplates(lMap)
    })
  }, [token])

  if (!myCharacter) return <div className="text-center py-8 text-dsa-parchment-dark text-sm">Kein Charakter geladen.</div>

  const attrs = getAttributes()
  const vitals = getVitals()
  const spells = myCharacter.spells || {}
  const liturgies = myCharacter.liturgies || {}
  const hasSpells = Object.keys(spells).length > 0
  const hasLiturgies = Object.keys(liturgies).length > 0

  if (!hasSpells && !hasLiturgies) {
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
    sendMessage?.({
      type: 'spell_cast_request',
      payload: {
        character_id: myCharacter.id,
        character_name: myCharacter.name,
        spell_name: name,
        fw,
        probe: info?.probe || [],
        cost: type === 'spell' ? `${info?.asp || '?'} AsP` : `${info?.kap || '?'} KaP`,
        cast_type: type,
      },
    })
    setRequestedSpells(prev => ({ ...prev, [name]: 'pending' }))
    setTimeout(() => {
      setRequestedSpells(prev => { const n = { ...prev }; if (n[name] === 'pending') delete n[name]; return n })
    }, 10000)
  }

  const renderSpellList = (spellEntries, infoMap, costLabel, colorClass, type) => (
    <div className="space-y-2">
      {spellEntries.sort(([,a], [,b]) => b - a).map(([name, fw]) => {
        const info = infoMap[name]
        const isExpanded = expandedSpell === name
        const reqState = requestedSpells[name]
        const canAfford = type === 'spell' ? vitals.asp >= (info?.asp || 0) : vitals.kap >= (info?.kap || 0)

        return (
          <div key={name} className={`bg-dsa-bg-card border rounded overflow-hidden transition-colors ${isExpanded ? 'border-dsa-gold/30' : 'border-dsa-bg-medium'}`}>
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-dsa-bg-light/20 transition-colors"
              onClick={() => setExpandedSpell(isExpanded ? null : name)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-dsa-parchment uppercase">{name.replace(/_/g, ' ')}</span>
                  {!canAfford && <Badge variant="danger" size="sm">Nicht genug {costLabel}</Badge>}
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

      {/* Spells */}
      {hasSpells && (
        <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-dsa-bg-medium/50 bg-blue-950/50">
            <Sparkles className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-blue-400">Zaubersprueche</span>
            <span className="text-[10px] font-mono text-dsa-parchment-dark/40">{Object.keys(spells).length}</span>
          </div>
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
