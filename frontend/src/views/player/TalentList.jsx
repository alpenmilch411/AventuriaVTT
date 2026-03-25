import React, { useState, useEffect } from 'react'
import {
  Send, Check, Clock, HelpCircle, ChevronDown, ChevronUp,
  Flame, Brain, Eye, Crown, Hand, Wind, HeartPulse, Hammer,
  Activity, Users, TreePine, BookOpen, Wrench, ClipboardList,
  Dice5, X, Shield
} from 'lucide-react'
import useCharacterStore from '../../stores/characterStore'
import useCombatStore from '../../stores/combatStore'
import useAuthStore from '../../stores/authStore'
import useCombatValues from '../../hooks/useCombatValues'
import clsx from 'clsx'

const ATTR_NAMES = {
  MU: 'Mut', KL: 'Klugheit', IN: 'Intuition', CH: 'Charisma',
  FF: 'Fingerfertigkeit', GE: 'Gewandtheit', KO: 'Konstitution', KK: 'Körperkraft',
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
const ATTR_ICONS = {
  MU: Flame, KL: Brain, IN: Eye, CH: Crown,
  FF: Hand, GE: Wind, KO: HeartPulse, KK: Hammer,
}

// Talent-Kategorien → Standard-Steigerungsfaktor (DSA5 Regelwerk)
const TALENT_SF = {
  'körper': 'B', 'gesellschaft': 'B', 'natur': 'C', 'wissen': 'C', 'handwerk': 'B',
  'koerper': 'B', 'body': 'B', 'social': 'B', 'nature': 'C', 'knowledge': 'C', 'craft': 'B',
}

const CATEGORIES = [
  { id: 'körper', label: 'Körpertalente', icon: Activity, color: 'text-orange-400', bgActive: 'bg-orange-900/30 border-orange-700/40', desc: 'Körperliche Fähigkeiten — Klettern, Schleichen, Schwimmen, Selbstbeherrschung und mehr' },
  { id: 'gesellschaft', label: 'Gesellschaftstalente', icon: Users, color: 'text-pink-400', bgActive: 'bg-pink-900/30 border-pink-700/40', desc: 'Soziale Fähigkeiten — Überreden, Einschüchtern, Menschenkenntnis, Willenskraft' },
  { id: 'natur', label: 'Naturtalente', icon: TreePine, color: 'text-green-400', bgActive: 'bg-green-900/30 border-green-700/40', desc: 'Naturtalente — Fährtensuchen, Wildnisleben, Orientierung, Tierkunde' },
  { id: 'wissen', label: 'Wissenstalente', icon: BookOpen, color: 'text-blue-400', bgActive: 'bg-blue-900/30 border-blue-700/40', desc: 'Wissenstalente — Magiekunde, Götter & Kulte, Sagen & Legenden, Rechnen' },
  { id: 'handwerk', label: 'Handwerkstalente', icon: Wrench, color: 'text-amber-400', bgActive: 'bg-amber-900/30 border-amber-700/40', desc: 'Handwerkstalente — Heilkunde, Mechanik, Alchimie, Schlösserknacken' },
]

const normName = s => s.toLowerCase().replace(/[äöüß]/g, m => ({ 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' }[m] || m)).replace(/\s+/g, '_')

function TalentList({ sendMessage }) {
  const myCharacter = useCharacterStore((s) => s.myCharacter)
  const getAttributes = useCharacterStore((s) => s.getAttributes)
  const pendingDiceRequest = useCombatStore((s) => s.pendingDiceRequest)
  const cv = useCombatValues()
  const user = useAuthStore((s) => s.user)
  const token = typeof window !== 'undefined' ? localStorage.getItem('avtt_token') : null

  const [selectedCat, setSelectedCat] = useState('körper')
  const [expandedTalent, setExpandedTalent] = useState(null)
  const [requestedTalents, setRequestedTalents] = useState({})
  const [dbTalents, setDbTalents] = useState([])

  // Load all talents from databank
  useEffect(() => {
    if (!token) return
    fetch('/api/databank/talents', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(d => setDbTalents(Array.isArray(d) ? d : d.items || []))
      .catch(err => console.error('Failed to fetch talents:', err))
  }, [token])

  // Auto-mark talent as approved when dice_request arrives
  useEffect(() => {
    if (pendingDiceRequest?.type === 'talent_probe' && pendingDiceRequest?.talent_name) {
      const talentKey = normName(pendingDiceRequest.talent_name)
      setRequestedTalents(prev => ({ ...prev, [talentKey]: 'approved' }))
    }
  }, [pendingDiceRequest])

  if (!myCharacter) return <div className="p-4 text-dsa-parchment-dark text-sm">Kein Charakter geladen.</div>

  const attrs = getAttributes()
  const talents = myCharacter.talents || {}
  const be = cv?.be || 0

  // Build talent list for selected category
  const buildCategoryTalents = (catId) => {
    const result = []
    const seen = new Set()

    // DB talents for this category
    for (const t of dbTalents) {
      const catRaw = (t.category || '').toLowerCase()
      const matchesCat = catRaw === catId || (catId === 'körper' && (catRaw === 'koerper' || catRaw === 'körper' || catRaw === 'body'))
      if (!matchesCat) continue

      const charEntry = Object.entries(talents).find(([k]) => normName(k) === normName(t.name) || k.toLowerCase() === t.id)
      const fw = charEntry ? (typeof charEntry[1] === 'object' ? (charEntry[1].fw || charEntry[1].value || 0) : (charEntry[1] || 0)) : 0
      const key = t.id || normName(t.name)
      const sf = TALENT_SF[catId] || 'B'

      result.push({
        key, fw, name: t.name,
        probe: t.probe || [],
        desc: t.description || '',
        encumbrance: t.encumbrance === 'ja',
        sf,
        applications: t.applications || [],
      })
      seen.add(normName(t.name))
    }

    // Character talents not in DB for this category
    for (const [key, val] of Object.entries(talents)) {
      if (seen.has(normName(key))) continue
      const fwVal = typeof val === 'object' ? (val.fw || val.value || 0) : (val || 0)
      // Can't determine category without DB — skip (they'll appear in their DB category)
    }

    // Sort: learned first, then by FW desc, then alphabetical
    result.sort((a, b) => {
      if (a.fw > 0 && b.fw === 0) return -1
      if (a.fw === 0 && b.fw > 0) return 1
      if (b.fw !== a.fw) return b.fw - a.fw
      return a.name.localeCompare(b.name)
    })

    return result
  }

  const categoryTalents = buildCategoryTalents(selectedCat)
  const activeCatConfig = CATEGORIES.find(c => c.id === selectedCat)
  const learnedCount = categoryTalents.filter(t => t.fw > 0).length

  const handleRequestProbe = (e, talent) => {
    e.stopPropagation()
    sendMessage?.({
      type: 'probe_request_from_player',
      payload: {
        character_id: myCharacter.id,
        user_id: user?.id,
        character_name: myCharacter.name,
        talent_key: talent.key,
        talent_name: talent.name,
        probe: talent.probe,
        fw: talent.fw,
        attribute_values: talent.probe.map(a => attrs[a] || 0),
        encumbrance: talent.encumbrance,
        be: talent.encumbrance ? be : 0,
      },
    })
    setRequestedTalents(prev => ({ ...prev, [talent.key]: 'pending' }))
    setTimeout(() => {
      setRequestedTalents(prev => {
        const next = { ...prev }
        if (next[talent.key] === 'pending') delete next[talent.key]
        return next
      })
    }, 60000) // 60s timeout — proper cancel clears it earlier
  }

  const handleCancelProbe = (e, talent) => {
    e.stopPropagation()
    sendMessage?.({
      type: 'probe_cancel',
      payload: {
        character_id: myCharacter.id,
        talent_key: talent.key,
        talent_name: talent.name,
      },
    })
    setRequestedTalents(prev => {
      const next = { ...prev }
      delete next[talent.key]
      return next
    })
  }

  return (
    <div className="animate-fade-in">
      {/* ── Header ── */}
      <div className="bg-gradient-to-r from-blue-900/40 to-blue-950/20 border border-blue-800/30 rounded-sm px-4 py-3 mb-3">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-blue-400" />
          <h2 className="text-sm font-display font-bold text-blue-400 uppercase tracking-wider">Talente</h2>
        </div>
        <p className="text-[10px] text-dsa-parchment-dark mt-1">
          Jedes Talent wird mit einer Probe auf drei Eigenschaften gewürfelt (3W20).
          Der Fertigkeitswert ist dein Puffer gegen Fehlpunkte — je höher, desto sicherer die Probe.
          Talente mit Fertigkeitswert 0 sind ungelernt, aber trotzdem versuchbar.
        </p>
      </div>

      {/* ── Main layout: categories left, talents right ── */}
      <div className="flex gap-3">

        {/* ── Category sidebar ── */}
        <div className="flex-shrink-0 w-36 space-y-1">
          {CATEGORIES.map(cat => {
            const catTalents = buildCategoryTalents(cat.id)
            const learned = catTalents.filter(t => t.fw > 0).length
            const isActive = selectedCat === cat.id
            const CatIcon = cat.icon
            return (
              <button
                key={cat.id}
                onClick={() => { setSelectedCat(cat.id); setExpandedTalent(null) }}
                className={clsx(
                  'w-full flex items-center gap-2 px-2.5 py-2 rounded-sm border text-left transition',
                  isActive ? cat.bgActive : 'bg-dsa-bg-card border-dsa-bg-medium hover:border-dsa-bg-light'
                )}
              >
                <CatIcon className={clsx('w-4 h-4', isActive ? cat.color : 'text-dsa-parchment-dark/50')} />
                <div className="flex-1 min-w-0">
                  <div className={clsx('text-xs font-bold truncate', isActive ? cat.color : 'text-dsa-parchment-dark')}>{cat.label}</div>
                  <div className="text-[9px] text-dsa-parchment-dark/40">{learned}/{catTalents.length}</div>
                </div>
              </button>
            )
          })}

          {/* BE info */}
          {be > 0 && (
            <div className="mt-2 px-2.5 py-2 bg-amber-900/15 border border-amber-800/25 rounded-sm">
              <div className="flex items-center gap-1.5 text-[10px] text-amber-400 font-bold">
                <Shield className="w-3.5 h-3.5" />
                Behinderung {be}
              </div>
              <p className="text-[9px] text-dsa-parchment-dark mt-0.5">
                Körperliche Talente mit Behinderung werden um {be} Punkte erschwert.
              </p>
            </div>
          )}
        </div>

        {/* ── Talent list ── */}
        <div className="flex-1 min-w-0">
          {/* Category description */}
          <div className="flex items-center gap-2 mb-2">
            <span className={clsx('text-xs font-bold uppercase tracking-wider', activeCatConfig?.color)}>{activeCatConfig?.label}</span>
            <span className="text-[10px] text-dsa-parchment-dark/40">Steigerungsfaktor {TALENT_SF[selectedCat] || 'B'}</span>
            <span className="text-[10px] text-dsa-parchment-dark/40 ml-auto">{learnedCount} gelernt / {categoryTalents.length} gesamt</span>
          </div>

          {/* Column headers */}
          <div className="flex items-center gap-2 px-3 py-1 text-[9px] text-dsa-parchment-dark/40 uppercase tracking-wider border-b border-dsa-bg-medium/50">
            <span className="flex-1">Talent</span>
            <span className="w-24 text-center">Probe</span>
            <span className="w-6 text-center">StF</span>
            <span className="w-10 text-center">FW</span>
            <span className="w-8 text-center" title="Behinderung — Abzug durch Rüstung auf diese Probe">BE</span>
            <span className="w-16 text-center">Aktion</span>
          </div>

          {/* Talent rows */}
          <div className="divide-y divide-dsa-bg-medium/30 max-h-[60vh] overflow-y-auto">
            {categoryTalents.map(talent => {
              const isExpanded = expandedTalent === talent.key
              const reqState = requestedTalents[talent.key]
              const hasEncumbrance = talent.encumbrance && be > 0

              return (
                <div key={talent.key}>
                  {/* Row */}
                  <div
                    className={clsx(
                      'flex items-center gap-2 px-3 py-1.5 cursor-pointer transition',
                      isExpanded ? 'bg-dsa-bg-light/30' : 'hover:bg-dsa-bg-card/50',
                      talent.fw === 0 && 'opacity-60'
                    )}
                    onClick={() => setExpandedTalent(isExpanded ? null : talent.key)}
                  >
                    {/* Name + encumbrance marker */}
                    <div className="flex-1 min-w-0 flex items-center gap-1.5">
                      <span className={clsx('text-xs truncate', talent.fw > 0 ? 'text-dsa-parchment' : 'text-dsa-parchment-dark/60')}>{talent.name}</span>
                      {talent.encumbrance && (
                        <span className={clsx('text-[8px] flex-shrink-0', be > 0 ? 'text-red-400' : 'text-dsa-parchment-dark/30')} title={be > 0 ? `Wird durch Behinderung ${be} erschwert — alle Teilproben -${be}` : 'Wird durch Behinderung erschwert (aktuell keine Rüstung)'}>⛓</span>
                      )}
                    </div>

                    {/* Probe attrs — icon + abbreviation */}
                    <div className="w-24 flex items-center justify-center gap-1 flex-shrink-0">
                      {talent.probe.map((attr, i) => {
                        const AttrIcon = ATTR_ICONS[attr]
                        return (
                          <span key={i} className={clsx('inline-flex items-center gap-0.5 text-[9px]', ATTR_TEXT_COLORS[attr])} title={`${ATTR_NAMES[attr]} ${attrs[attr]}`}>
                            <AttrIcon className="w-3 h-3" />
                            <span className="font-mono">{attr}</span>
                          </span>
                        )
                      })}
                    </div>

                    {/* Steigerungsfaktor */}
                    <div className="w-6 text-center text-[10px] font-mono text-dsa-parchment-dark/40 flex-shrink-0">{talent.sf}</div>

                    {/* FW */}
                    <div className={clsx('w-10 text-center text-sm font-mono font-bold flex-shrink-0', talent.fw > 0 ? 'text-dsa-gold' : 'text-dsa-parchment-dark/25')}>
                      {talent.fw}
                    </div>

                    {/* BE penalty */}
                    <div className={clsx('w-8 text-center text-[10px] font-mono flex-shrink-0',
                      talent.encumbrance && be > 0 ? 'text-red-400 font-bold' : 'text-dsa-parchment-dark/20'
                    )} title={talent.encumbrance ? `Behinderung ${be} — alle drei Teilproben werden um ${be} erschwert` : 'Nicht betroffen'}>
                      {talent.encumbrance ? (be > 0 ? `-${be}` : '—') : '—'}
                    </div>

                    {/* Probe button / Cancel */}
                    {reqState === 'pending' ? (
                      <button
                        onClick={(e) => handleCancelProbe(e, talent)}
                        className="w-16 flex items-center justify-center gap-1 px-1.5 py-1 rounded-sm text-[10px] font-medium transition-all flex-shrink-0 border bg-yellow-900/30 text-yellow-400 border-yellow-800/30 hover:bg-red-900/30 hover:text-red-400 hover:border-red-800/30"
                        title="Proben-Anfrage zurückziehen"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); if (!reqState) handleRequestProbe(e, talent) }}
                      disabled={reqState === 'approved'}
                      className={clsx(
                        'w-16 flex items-center justify-center gap-1 px-1.5 py-1 rounded-sm text-[10px] font-medium transition-all flex-shrink-0 border',
                        reqState === 'approved' ? 'bg-blue-900/30 text-blue-400 border-blue-800/30 animate-pulse' :
                        reqState && typeof reqState === 'object' ? (reqState.success ? 'bg-green-900/30 text-green-400 border-green-800/30' : 'bg-red-900/30 text-red-400 border-red-800/30') :
                        'bg-dsa-gold/10 text-dsa-gold border-dsa-gold/30 hover:bg-dsa-gold/20'
                      )}
                    >
                      {reqState === 'approved' ? <Dice5 className="w-3 h-3" /> :
                       reqState && typeof reqState === 'object' ? (reqState.success ? <><Check className="w-3 h-3" /> QS{reqState.qs}</> : <X className="w-3 h-3" />) :
                       <><Send className="w-3 h-3" /> Probe</>}
                    </button>
                    )}
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-3 pb-3 pt-1 bg-dsa-bg-card/30 border-t border-dsa-bg-medium/30">
                      {/* Description */}
                      <p className="text-[11px] text-dsa-parchment/70 leading-relaxed mb-3">{talent.desc}</p>

                      {/* Probe derivation */}
                      <div className="bg-dsa-bg/50 border border-dsa-bg-medium rounded-sm p-2.5 mb-2 space-y-2">
                        <div className="text-[10px] text-dsa-gold font-bold uppercase">Probenberechnung</div>

                        {/* Three probe attributes */}
                        <div className="flex items-center gap-2">
                          {talent.probe.map((attr, i) => {
                            const AttrIcon = ATTR_ICONS[attr]
                            const val = attrs[attr] || 0
                            const effectiveVal = hasEncumbrance ? Math.max(0, val - be) : val
                            return (
                              <div key={i} className={clsx('flex-1 rounded-sm border px-2 py-1.5 bg-gradient-to-b', ATTR_COLORS[attr])}>
                                <div className="flex items-center gap-1 mb-0.5">
                                  <AttrIcon className={clsx('w-3 h-3', ATTR_TEXT_COLORS[attr])} />
                                  <span className={clsx('text-[10px] font-medium', ATTR_TEXT_COLORS[attr])}>{ATTR_NAMES[attr]}</span>
                                </div>
                                <div className="text-center">
                                  <span className="text-sm font-mono font-bold text-dsa-parchment">{val}</span>
                                  {hasEncumbrance && (
                                    <span className="text-[9px] text-amber-400 ml-1">(-{be}→{effectiveVal})</span>
                                  )}
                                </div>
                                <div className="text-[9px] text-dsa-parchment-dark text-center">Würfle ≤ {hasEncumbrance ? effectiveVal : val}</div>
                              </div>
                            )
                          })}
                        </div>

                        {/* FW derivation */}
                        <div className="bg-dsa-bg rounded-sm border border-dsa-bg-medium p-2 space-y-1">
                          <div className="flex justify-between text-[10px]">
                            <span className="text-dsa-parchment-dark">Fertigkeitswert</span>
                            <span className={clsx('font-mono font-bold', talent.fw > 0 ? 'text-dsa-gold' : 'text-dsa-parchment-dark/40')}>{talent.fw}</span>
                          </div>
                          {talent.fw === 0 && (
                            <div className="text-[9px] text-dsa-parchment-dark/60 italic">
                              Ungelernt — kein Puffer gegen Fehlpunkte. Jeder Teilwurf über dem Eigenschaftswert führt direkt zum Scheitern.
                            </div>
                          )}
                          {talent.fw > 0 && talent.fw < 4 && (
                            <div className="text-[9px] text-dsa-parchment-dark/60">
                              Niedriger Fertigkeitswert — du brauchst gute Würfe. Nur {talent.fw} Punkt{talent.fw > 1 ? 'e' : ''} Puffer.
                            </div>
                          )}
                          {talent.fw >= 4 && talent.fw < 10 && (
                            <div className="text-[9px] text-dsa-parchment-dark/60">
                              Solider Fertigkeitswert — ein bisschen Pech verkraftest du.
                            </div>
                          )}
                          {talent.fw >= 10 && (
                            <div className="text-[9px] text-green-400/60">
                              Hoher Fertigkeitswert — du kannst dir einige schlechte Würfe leisten.
                            </div>
                          )}
                        </div>

                        {/* Behinderung */}
                        {talent.encumbrance && (
                          <div className={clsx('rounded-sm border p-2', be > 0 ? 'bg-amber-900/10 border-amber-800/25' : 'bg-dsa-bg border-dsa-bg-medium')}>
                            <div className="flex items-center gap-1.5 text-[10px]">
                              <Shield className="w-3.5 h-3.5 text-amber-400" />
                              <span className="text-amber-400 font-bold">Behinderung</span>
                              {be > 0 ? (
                                <span className="text-amber-400 font-mono ml-auto">-{be} auf alle Teilproben</span>
                              ) : (
                                <span className="text-dsa-parchment-dark/40 ml-auto">Keine Rüstung angelegt</span>
                              )}
                            </div>
                            {be > 0 && (
                              <p className="text-[9px] text-dsa-parchment-dark mt-1">
                                Deine Rüstung erschwert dieses Talent. Alle drei Eigenschaftswerte werden für diese Probe um {be} gesenkt.
                                {be >= 3 && ' Das ist ein erheblicher Abzug — überlege ob du die Rüstung ablegen kannst.'}
                              </p>
                            )}
                            {!be && (
                              <p className="text-[9px] text-dsa-parchment-dark/40 mt-0.5">
                                Dieses Talent wird durch Rüstung erschwert. Aktuell trägst du keine Rüstung, daher kein Abzug.
                              </p>
                            )}
                          </div>
                        )}
                        {!talent.encumbrance && (
                          <div className="text-[9px] text-dsa-parchment-dark/30 italic">
                            Dieses Talent wird nicht durch Behinderung beeinflusst.
                          </div>
                        )}

                        {/* Steigerungsfaktor explanation */}
                        <div className="text-[9px] text-dsa-parchment-dark/40">
                          Steigerungsfaktor <strong className="text-dsa-parchment-dark">{talent.sf}</strong> — bestimmt die Kosten beim Steigern dieses Talents mit Abenteuerpunkten.
                          {talent.sf === 'A' && ' (Günstigste Kategorie)'}
                          {talent.sf === 'B' && ' (Günstige Kategorie)'}
                          {talent.sf === 'C' && ' (Mittlere Kategorie)'}
                          {talent.sf === 'D' && ' (Teure Kategorie)'}
                          {talent.sf === 'E' && ' (Teuerste Kategorie)'}
                        </div>
                      </div>

                      {/* Applications */}
                      {talent.applications?.length > 0 && (
                        <div className="text-[10px] text-dsa-parchment-dark">
                          <span className="text-dsa-parchment-dark/50">Einsatzgebiete: </span>
                          {talent.applications.join(', ')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {categoryTalents.length === 0 && (
            <p className="text-xs text-dsa-parchment-dark/40 text-center py-8">Keine Talente in dieser Kategorie gefunden.</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default React.memo(TalentList)
