import { useState, useEffect, useMemo } from 'react'
import { TrendingUp, Brain, Swords, Sparkles, Sun, ChevronDown, ChevronUp, Check, X, HelpCircle, Star, AlertTriangle, Search, BookOpen, Plus, Shield, Zap } from 'lucide-react'
import useCharacterStore from '../../stores/characterStore'
import useAuthStore from '../../stores/authStore'
import { SF_TABLES, EXPERIENCE_GRADES as GRADE_LIMITS, TALENT_SF, getUpgradeCost, getAttrCost, getActivationCost } from '../../engine/advancementCosts'
import clsx from 'clsx'

// Auto-paginating databank fetch (reused from CharacterCreator)
async function fetchDatabank(entityType, token) {
  let all = [], page = 1
  while (true) {
    const res = await fetch(`/api/databank/${entityType}?page_size=200&page=${page}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error(`Fehler beim Laden von ${entityType}`)
    const data = await res.json()
    const items = data.items || []
    all = all.concat(items)
    if (items.length < 200 || page * 200 >= (data.total || Infinity)) break
    page++
  }
  return all
}

// Extract tradition name from character's special_abilities list
// Extract all tradition names from character SAs via pattern matching
// e.g. "Tradition (Gildenmagier)" → "Gildenmagier"
// Works for both magical and karmal traditions — downstream filtering
// against spell/liturgy tradition arrays handles the distinction.
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

// Derive unique SA categories from fetched data (called inside component)
function buildSaCategoryTabs(saTemplates) {
  if (!saTemplates.length) return [{ id: 'alle', label: 'Alle' }]
  const counts = {}
  for (const sa of saTemplates) {
    const cat = (sa.category || '').toLowerCase()
    if (cat) counts[cat] = (counts[cat] || 0) + 1
  }
  // Sort by count descending, take top categories as individual tabs
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
  const tabs = [{ id: 'alle', label: 'Alle' }]
  for (const [cat] of sorted.slice(0, 10)) {
    tabs.push({ id: cat, label: cat.charAt(0).toUpperCase() + cat.slice(1) })
  }
  return tabs
}

const ATTR_META = {
  MU: { name: 'Mut', color: 'text-red-400' },
  KL: { name: 'Klugheit', color: 'text-blue-400' },
  IN: { name: 'Intuition', color: 'text-violet-400' },
  CH: { name: 'Charisma', color: 'text-pink-400' },
  FF: { name: 'Fingerfertigkeit', color: 'text-emerald-400' },
  GE: { name: 'Gewandtheit', color: 'text-cyan-400' },
  KO: { name: 'Konstitution', color: 'text-orange-400' },
  KK: { name: 'Körperkraft', color: 'text-amber-400' },
}

const TALENT_CATEGORIES = [
  { id: 'körper', label: 'Körpertalente', color: 'text-orange-400', borderColor: 'border-orange-800/30' },
  { id: 'gesellschaft', label: 'Gesellschaftstalente', color: 'text-pink-400', borderColor: 'border-pink-800/30' },
  { id: 'natur', label: 'Naturtalente', color: 'text-green-400', borderColor: 'border-green-800/30' },
  { id: 'wissen', label: 'Wissenstalente', color: 'text-blue-400', borderColor: 'border-blue-800/30' },
  { id: 'handwerk', label: 'Handwerkstalente', color: 'text-amber-400', borderColor: 'border-amber-800/30' },
]


// ── Confirmation Modal ──
function ConfirmModal({ title, description, cost, available, onConfirm, onCancel, confirmLabel = 'Steigern' }) {
  const affordable = cost <= available
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-dsa-bg border border-dsa-bg-medium rounded shadow-2xl w-full max-w-sm animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-dsa-bg-medium bg-dsa-bg-card">
          <h3 className="text-sm font-display font-semibold text-dsa-gold">{title}</h3>
          <button onClick={onCancel} className="text-dsa-parchment-dark/40 hover:text-dsa-parchment"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-dsa-parchment">{description}</p>
          <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded-sm p-3 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-dsa-parchment-dark">Kosten</span>
              <span className={clsx('font-mono font-bold', affordable ? 'text-dsa-gold' : 'text-red-400')}>{cost} Abenteuerpunkte</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-dsa-parchment-dark">Verfügbar</span>
              <span className="font-mono font-bold text-green-400">{available} Abenteuerpunkte</span>
            </div>
            <div className="flex justify-between text-xs border-t border-dsa-bg-medium pt-1">
              <span className="text-dsa-parchment-dark">Danach übrig</span>
              <span className={clsx('font-mono font-bold', affordable ? 'text-dsa-parchment' : 'text-red-400')}>{available - cost} Abenteuerpunkte</span>
            </div>
          </div>
          {!affordable && (
            <div className="flex items-center gap-2 text-red-400 text-xs bg-red-900/20 border border-red-800/30 rounded-sm p-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>Nicht genügend Abenteuerpunkte! Du brauchst {cost - available} weitere.</span>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={onCancel} className="flex-1 px-3 py-2 text-xs bg-dsa-bg-card border border-dsa-bg-medium rounded-sm text-dsa-parchment-dark hover:text-dsa-parchment transition">
              Abbrechen
            </button>
            <button
              onClick={onConfirm}
              disabled={!affordable}
              className="flex-1 px-3 py-2 text-xs bg-dsa-gold/20 border border-dsa-gold/30 rounded-sm text-dsa-gold font-bold hover:bg-dsa-gold/30 transition disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Check className="w-3.5 h-3.5 inline mr-1" />
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Collapsible Section ──
function Section({ title, icon: Icon, color, children, count, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-dsa-bg-medium rounded-sm overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-2 bg-dsa-bg-card hover:bg-dsa-bg-light transition text-left">
        <Icon className={clsx('w-4 h-4', color)} />
        <span className={clsx('text-xs font-bold uppercase tracking-wider flex-1', color)}>{title}</span>
        {count != null && <span className="text-[10px] font-mono text-dsa-parchment-dark">{count}</span>}
        {open ? <ChevronUp className="w-3.5 h-3.5 text-dsa-parchment-dark" /> : <ChevronDown className="w-3.5 h-3.5 text-dsa-parchment-dark" />}
      </button>
      {open && <div className="p-2 space-y-1">{children}</div>}
    </div>
  )
}

// ── Upgrade Row ──
function UpgradeRow({ name, currentValue, cost, maxReached, affordable, sf, probeAttrs, onUpgrade, detail }) {
  return (
    <div className={clsx(
      'flex items-center gap-2 px-2 py-1.5 rounded-sm transition',
      maxReached ? 'opacity-40' : 'hover:bg-dsa-bg-card/50'
    )}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-dsa-parchment truncate">{name}</span>
          {sf && <span className="text-[9px] font-mono text-dsa-parchment-dark/50 bg-dsa-bg-card px-1 rounded" title={`Steigerungsfaktor ${sf} — bestimmt die Kosten pro Stufe. A ist am günstigsten, E am teuersten.`}>{sf}</span>}
        </div>
        {probeAttrs && <div className="text-[9px] text-dsa-parchment-dark/50">{probeAttrs}</div>}
        {detail && <div className="text-[9px] text-dsa-parchment-dark/40">{detail}</div>}
      </div>
      <div className="text-sm font-mono font-bold text-dsa-parchment w-8 text-center">{currentValue}</div>
      {maxReached ? (
        <div className="text-[9px] text-dsa-parchment-dark/40 w-20 text-center">Maximum</div>
      ) : (
        <button
          onClick={onUpgrade}
          className={clsx(
            'flex items-center gap-1 px-2 py-1 rounded-sm text-[10px] font-bold border transition min-w-[72px] justify-center',
            affordable
              ? 'bg-dsa-gold/10 border-dsa-gold/30 text-dsa-gold hover:bg-dsa-gold/20'
              : 'bg-dsa-bg-card border-dsa-bg-medium text-dsa-parchment-dark/40 cursor-not-allowed'
          )}
          disabled={!affordable}
          title={affordable ? `${name} von ${currentValue} auf ${currentValue + 1} steigern für ${cost} Abenteuerpunkte` : `Nicht genug Abenteuerpunkte (${cost} benötigt)`}
        >
          <TrendingUp className="w-3 h-3" />
          {cost} AP
        </button>
      )}
    </div>
  )
}

// ── Main Component ──
export default function SteigerungTab() {
  const myCharacter = useCharacterStore((s) => s.myCharacter)
  const token = useAuthStore((s) => s.token)
  const [confirm, setConfirm] = useState(null) // { title, desc, cost, type, id, sf? }
  const [result, setResult] = useState(null) // success/error message
  const [loading, setLoading] = useState(false)
  const [talentTemplates, setTalentTemplates] = useState([])
  const [combatTechTemplates, setCombatTechTemplates] = useState([])
  const [spellTemplates, setSpellTemplates] = useState([])
  const [liturgyTemplates, setLiturgyTemplates] = useState([])
  const [saTemplates, setSaTemplates] = useState([])

  const [spellSearch, setSpellSearch] = useState('')
  const [liturgySearch, setLiturgySearch] = useState('')
  const [showSpellBrowser, setShowSpellBrowser] = useState(false)
  const [showLiturgyBrowser, setShowLiturgyBrowser] = useState(false)
  const [saSearch, setSaSearch] = useState('')
  const [saFilterGroup, setSaFilterGroup] = useState('alle')
  const [showSaBrowser, setShowSaBrowser] = useState(false)
  const [showSpellEnhBrowser, setShowSpellEnhBrowser] = useState(false)
  const [showLitEnhBrowser, setShowLitEnhBrowser] = useState(false)

  // Load databank templates (with auto-pagination for large collections)
  useEffect(() => {
    if (!token) return
    Promise.all([
      fetchDatabank('talents', token),
      fetchDatabank('combat_techniques', token),
      fetchDatabank('spells', token),
      fetchDatabank('liturgies', token),
      fetchDatabank('special_abilities', token),
    ]).then(([t, ct, s, l, sa]) => {
      setTalentTemplates(t)
      setCombatTechTemplates(ct)
      setSpellTemplates(s)
      setLiturgyTemplates(l)
      setSaTemplates(sa)
    }).catch(err => console.error('Failed to fetch databank:', err))
  }, [token])

  if (!myCharacter) return <div className="p-4 text-dsa-parchment-dark text-sm">Kein Charakter geladen.</div>

  const attrs = myCharacter.attributes || {}
  const talents = myCharacter.talents || {}
  const charCT = myCharacter.combat_techniques || {}
  const spells = myCharacter.spells || {}
  const liturgies = myCharacter.liturgies || {}
  const totalAP = myCharacter.total_ap || 0
  const availableAP = myCharacter.available_ap || 0
  const grade = (myCharacter.experience_grade || 'erfahren').toLowerCase()
  const limits = GRADE_LIMITS[grade] || GRADE_LIMITS.erfahren
  const charSAs = myCharacter.special_abilities || []

  // Detect character's magic/karmal traditions from SAs
  // Extract all traditions — same list is matched against spell traditions (magic)
  // and liturgy traditions (karmal) separately, so no need to distinguish here
  const allTraditions = useMemo(() => extractTraditions(charSAs), [charSAs])

  // Separate magic vs karmal by checking which tradition names appear in spell vs liturgy template data
  const magicTraditions = useMemo(() => {
    if (!allTraditions.length || !spellTemplates.length) return allTraditions
    const spellTraditionSet = new Set(spellTemplates.flatMap(s => s.tradition || []))
    return allTraditions.filter(t => spellTraditionSet.has(t))
  }, [allTraditions, spellTemplates])

  const karmalTraditions = useMemo(() => {
    if (!allTraditions.length || !liturgyTemplates.length) return allTraditions
    const liturgyTraditionSet = new Set(liturgyTemplates.flatMap(l => l.tradition || []))
    return allTraditions.filter(t => liturgyTraditionSet.has(t))
  }, [allTraditions, liturgyTemplates])
  const isMagic = Object.keys(spells).length > 0 || magicTraditions.length > 0
  const isBlessed = Object.keys(liturgies).length > 0 || karmalTraditions.length > 0

  // Filter spells the character can learn (not already known, matching tradition)
  const learnableSpells = useMemo(() => {
    if (!isMagic || spellTemplates.length === 0) return []
    const normName = (n) => n.toLowerCase().replace(/[äöüß]/g, m => ({ 'ä':'ae','ö':'oe','ü':'ue','ß':'ss' }[m]||m))
    const knownNorm = new Set(Object.keys(spells).map(normName))
    return spellTemplates.filter(s => {
      // Exclude already known
      if (knownNorm.has(normName(s.name))) return false
      // Filter by tradition if we can detect it
      if (magicTraditions.length > 0 && Array.isArray(s.tradition) && s.tradition.length > 0) {
        return s.tradition.some(t => magicTraditions.includes(t))
      }
      return true // can't filter — show all
    })
  }, [isMagic, spellTemplates, spells, magicTraditions])

  // Filter liturgies the character can learn (not already known, matching tradition)
  const learnableLiturgies = useMemo(() => {
    if (!isBlessed || liturgyTemplates.length === 0) return []
    const normName = (n) => n.toLowerCase().replace(/[äöüß]/g, m => ({ 'ä':'ae','ö':'oe','ü':'ue','ß':'ss' }[m]||m))
    const knownNorm = new Set(Object.keys(liturgies).map(normName))
    return liturgyTemplates.filter(l => {
      if (knownNorm.has(normName(l.name))) return false
      if (karmalTraditions.length > 0 && Array.isArray(l.tradition) && l.tradition.length > 0) {
        return l.tradition.some(t => karmalTraditions.includes(t))
      }
      return true
    })
  }, [isBlessed, liturgyTemplates, liturgies, karmalTraditions])

  // Filtered by search
  const filteredLearnableSpells = useMemo(() => {
    if (!spellSearch.trim()) return learnableSpells
    const q = spellSearch.trim().toLowerCase()
    return learnableSpells.filter(s => s.name.toLowerCase().includes(q))
  }, [learnableSpells, spellSearch])

  const filteredLearnableLiturgies = useMemo(() => {
    if (!liturgySearch.trim()) return learnableLiturgies
    const q = liturgySearch.trim().toLowerCase()
    return learnableLiturgies.filter(l => l.name.toLowerCase().includes(q))
  }, [learnableLiturgies, liturgySearch])

  // Build dynamic SA category tabs from fetched data
  const saCategoryTabs = useMemo(() => buildSaCategoryTabs(saTemplates), [saTemplates])

  // Filter purchasable SAs (exclude already owned)
  const purchasableSAs = useMemo(() => {
    if (saTemplates.length === 0) return []
    const ownedNames = new Set(
      (charSAs || []).map(sa => (typeof sa === 'string' ? sa : sa?.name || sa?.id || '').toLowerCase())
    )
    return saTemplates.filter(sa => !ownedNames.has(sa.name.toLowerCase()))
  }, [saTemplates, charSAs])

  const filteredSAs = useMemo(() => {
    let items = purchasableSAs
    // Category filter — direct match against actual DB category
    if (saFilterGroup !== 'alle') {
      items = items.filter(sa => (sa.category || '').toLowerCase() === saFilterGroup)
    }
    // Text search
    if (saSearch.trim()) {
      const q = saSearch.trim().toLowerCase()
      items = items.filter(sa => sa.name.toLowerCase().includes(q))
    }
    return items
  }, [purchasableSAs, saFilterGroup, saSearch])

  // Spell/liturgy enhancements from character data
  const spellEnhancements = myCharacter.spell_enhancements || myCharacter.char_data?.spell_enhancements || {}
  const liturgyEnhancements = myCharacter.liturgy_enhancements || myCharacter.char_data?.liturgy_enhancements || {}

  // Known spells that have enhancements available
  const spellsWithEnhancements = useMemo(() => {
    if (!spellTemplates.length) return []
    const normName = (n) => n.toLowerCase().replace(/[äöüß]/g, m => ({ 'ä':'ae','ö':'oe','ü':'ue','ß':'ss' }[m]||m))
    return spellTemplates.filter(s => {
      if (!Array.isArray(s.enhancements) || s.enhancements.length === 0) return false
      return Object.keys(spells).some(k => normName(k) === normName(s.name) || k.toLowerCase() === s.name.toLowerCase())
    })
  }, [spellTemplates, spells])

  // Known liturgies that have enhancements available
  const liturgiesWithEnhancements = useMemo(() => {
    if (!liturgyTemplates.length) return []
    const normName = (n) => n.toLowerCase().replace(/[äöüß]/g, m => ({ 'ä':'ae','ö':'oe','ü':'ue','ß':'ss' }[m]||m))
    return liturgyTemplates.filter(l => {
      if (!Array.isArray(l.enhancements) || l.enhancements.length === 0) return false
      return Object.keys(liturgies).some(k => normName(k) === normName(l.name) || k.toLowerCase() === l.name.toLowerCase())
    })
  }, [liturgyTemplates, liturgies])

  // ── Execute upgrade via API ──
  const doUpgrade = async () => {
    if (!confirm) return
    setLoading(true)
    try {
      const res = await fetch(`/api/characters/${myCharacter.id}/level-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          upgrades: [{
            type: confirm.type,
            id: confirm.id,
            ...(confirm.sf ? { steigerungsfaktor: confirm.sf } : {}),
            ...(confirm.apCost != null ? { ap_cost: confirm.apCost } : {}),
            ...(confirm.enhLevel != null ? { enhancement_level: confirm.enhLevel } : {}),
          }],
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Steigerung fehlgeschlagen')
      }
      const data = await res.json()
      // Re-fetch the full character to get updated attributes/talents/etc.
      const charRes = await fetch(`/api/characters/${myCharacter.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (charRes.ok) {
        const updatedChar = await charRes.json()
        useCharacterStore.getState().setMyCharacter(updatedChar)
      } else {
        // Fallback: just update AP locally
        useCharacterStore.getState().setMyCharacter({
          ...myCharacter,
          available_ap: data.remaining_ap ?? (availableAP - confirm.cost),
        })
      }
      setResult({ ok: true, text: `${confirm.title} erfolgreich! (${confirm.cost} Abenteuerpunkte ausgegeben)` })
    } catch (err) {
      setResult({ ok: false, text: err.message })
    } finally {
      setLoading(false)
      setConfirm(null)
      setTimeout(() => setResult(null), 6000)
    }
  }

  const requestUpgrade = (title, desc, cost, type, id, sf) => {
    setConfirm({ title, desc, cost, type, id, sf })
  }

  const requestLearn = (template, learnType) => {
    const sf = template.improvement_cost || 'C'
    const cost = getActivationCost(sf)
    const typeLabel = learnType === 'learn_spell' ? 'Zauber' : 'Liturgie'
    const probe = template.probe ? (Array.isArray(template.probe) ? template.probe.join('/') : template.probe) : ''
    setConfirm({
      title: `${template.name} lernen`,
      desc: `${typeLabel} „${template.name}" neu erlernen (Aktivierung auf FW 0).${probe ? ` Probe: ${probe}.` : ''} Steigerungsfaktor ${sf}. ${template.description || ''}`.trim(),
      cost,
      type: learnType,
      id: template.id || template.name,
      sf,
    })
  }

  const requestPurchaseSA = (sa) => {
    const cost = sa.ap_cost || 0
    setConfirm({
      title: `${sa.name} erwerben`,
      desc: `Sonderfertigkeit „${sa.name}" erwerben.${sa.category ? ` Kategorie: ${sa.category}.` : ''} ${sa.description || sa.rules_text || ''}`.trim(),
      cost,
      type: 'special_ability',
      id: sa.name,
      apCost: cost,
    })
  }

  const requestEnhancement = (template, enhancement, enhType) => {
    const cost = enhancement.cost || 0
    const typeLabel = enhType === 'learn_spell_enhancement' ? 'Zaubererweiterung' : 'Liturgieerweiterung'
    const roman = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V' }
    setConfirm({
      title: `${template.name} — Erweiterung ${roman[enhancement.level] || enhancement.level}`,
      desc: `${typeLabel} „${enhancement.name}" (Stufe ${roman[enhancement.level] || enhancement.level}) für „${template.name}" erwerben. Effekt: ${enhancement.effect || 'Kein Effekt angegeben.'}`,
      cost,
      type: enhType,
      id: template.id || template.name,
      apCost: cost,
      enhLevel: enhancement.level,
    })
  }

  return (
    <div className="animate-fade-in space-y-3">
      {/* ── Header ── */}
      <div className="bg-gradient-to-r from-amber-900/40 to-amber-950/20 border border-amber-800/30 rounded-sm px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Star className="w-5 h-5 text-dsa-gold" />
            <h2 className="text-sm font-display font-bold text-dsa-gold uppercase tracking-wider">Steigerung</h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[10px] text-dsa-parchment-dark uppercase">Verfügbar</div>
              <div className="text-lg font-mono font-bold text-green-400">{availableAP} <span className="text-[10px] text-dsa-parchment-dark font-normal">Abenteuerpunkte</span></div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-dsa-parchment-dark uppercase">Gesamt</div>
              <div className="text-sm font-mono text-dsa-parchment">{totalAP}</div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 mt-2 text-[10px] text-dsa-parchment-dark">
          <span>Erfahrungsgrad: <strong className="text-dsa-parchment">{limits.label}</strong></span>
          <span>Maximalwert Eigenschaften: <strong className="text-dsa-parchment">{limits.attr}</strong></span>
          <span>Maximalwert Fertigkeiten: <strong className="text-dsa-parchment">{limits.skill}</strong></span>
        </div>
      </div>

      {/* ── Info Box ── */}
      <div className="bg-dsa-bg-card/50 border border-dsa-bg-medium rounded-sm px-3 py-2 text-[10px] text-dsa-parchment-dark leading-relaxed flex items-start gap-2">
        <HelpCircle className="w-4 h-4 text-dsa-gold/50 flex-shrink-0 mt-0.5" />
        <div>
          <strong className="text-dsa-parchment">So funktioniert Steigerung:</strong> Dein Held sammelt Abenteuerpunkte durch das Bestehen von Abenteuern.
          Diese kannst du hier ausgeben, um Eigenschaften, Talente, Kampftechniken und Zauber zu verbessern.
          Die Kosten hängen vom aktuellen Wert und dem Steigerungsfaktor ab — niedrige Werte sind günstig zu steigern, hohe Werte werden teuer.
          Dein Erfahrungsgrad bestimmt den Maximalwert, den du erreichen kannst.
        </div>
      </div>

      {/* ── Result Message ── */}
      {result && (
        <div className={clsx(
          'px-3 py-2 rounded-sm text-xs border flex items-center gap-2',
          result.ok ? 'bg-green-900/20 border-green-800/30 text-green-400' : 'bg-red-900/20 border-red-800/30 text-red-400'
        )}>
          {result.ok ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {result.text}
        </div>
      )}

      {/* ── 1. Eigenschaften ── */}
      <Section title="Eigenschaften" icon={Brain} color="text-dsa-gold" count={`8 Werte`} defaultOpen>
        <div className="text-[10px] text-dsa-parchment-dark px-2 pb-1">
          Eigenschaften sind die Grundwerte deines Helden. Sie beeinflussen alle abgeleiteten Werte (Lebenspunkte, Initiative, Ausweichen usw.)
          und sind die Basis für Talentproben. Eigenschaftssteigerungen haben eigene Kosten, die nicht vom Steigerungsfaktor abhängen.
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-0.5">
          {Object.entries(ATTR_META).map(([key, meta]) => {
            const val = attrs[key] || 8
            const cost = getAttrCost(val)
            const maxReached = val >= limits.attr
            return (
              <div key={key} className={clsx(
                'flex items-center gap-2 px-2 py-1.5 rounded-sm transition',
                maxReached ? 'opacity-40' : 'hover:bg-dsa-bg-card/50'
              )}>
                <div className={clsx('text-xs font-bold w-16', meta.color)}>{meta.name}</div>
                <div className="text-sm font-mono font-bold text-dsa-parchment w-8 text-center">{val}</div>
                <div className="text-[9px] text-dsa-parchment-dark/40 flex-1">→ {val + 1}</div>
                {maxReached ? (
                  <div className="text-[9px] text-dsa-parchment-dark/40 w-20 text-center">Maximum ({limits.attr})</div>
                ) : (
                  <button
                    onClick={() => requestUpgrade(
                      `${meta.name} steigern`,
                      `${meta.name} von ${val} auf ${val + 1} steigern. Dieser Wert beeinflusst alle Talentproben, die ${meta.name} als Probeneigenschaft verwenden, sowie abgeleitete Werte wie Lebenspunkte oder Initiative.`,
                      cost, 'attribute', key
                    )}
                    disabled={cost > availableAP}
                    className={clsx(
                      'flex items-center gap-1 px-2 py-1 rounded-sm text-[10px] font-bold border transition min-w-[72px] justify-center',
                      cost <= availableAP
                        ? 'bg-dsa-gold/10 border-dsa-gold/30 text-dsa-gold hover:bg-dsa-gold/20'
                        : 'bg-dsa-bg-card border-dsa-bg-medium text-dsa-parchment-dark/40 cursor-not-allowed'
                    )}
                    title={cost <= availableAP ? `${meta.name} auf ${val+1} steigern für ${cost} Abenteuerpunkte` : `Nicht genug Abenteuerpunkte (${cost} benötigt)`}
                  >
                    <TrendingUp className="w-3 h-3" />
                    {cost} AP
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </Section>

      {/* ── 2. Talente ── */}
      <Section title="Talente" icon={Brain} color="text-blue-400" count={`${Object.keys(talents).length} gelernt`}>
        <div className="text-[10px] text-dsa-parchment-dark px-2 pb-1">
          Talente repräsentieren das Können deines Helden in verschiedenen Bereichen — von Klettern über Überreden bis Heilkunde.
          Der Fertigkeitswert bestimmt, wie viele Punkte du bei einer Probe als Puffer hast. Höherer Wert = sicherere Proben.
          Der Steigerungsfaktor (Buchstabe neben dem Namen) bestimmt die Kosten pro Stufe.
        </div>
        {TALENT_CATEGORIES.map(cat => {
          // Match talents from DB + character
          const catTalents = talentTemplates
            .filter(t => (t.category || '').toLowerCase() === cat.id || (t.category || '').toLowerCase().replace(/ö/g, 'oe') === cat.id)
          if (catTalents.length === 0 && !Object.entries(talents).some(([k]) => true)) return null
          const sf = TALENT_SF[cat.id] || 'B'
          return (
            <div key={cat.id} className="mb-2">
              <div className={clsx('text-[9px] uppercase tracking-wider font-bold px-2 py-1 border-b', cat.color, cat.borderColor)}>{cat.label} (Steigerungsfaktor {sf})</div>
              {catTalents.map(t => {
                const normName = t.name.toLowerCase().replace(/[äöüß]/g, m => ({ 'ä':'ae','ö':'oe','ü':'ue','ß':'ss' }[m]||m))
                const charVal = Object.entries(talents).find(([k]) => k.toLowerCase().replace(/[äöüß]/g, m => ({ 'ä':'ae','ö':'oe','ü':'ue','ß':'ss' }[m]||m)) === normName || k.toLowerCase() === t.name.toLowerCase())?.[1] || 0
                const val = typeof charVal === 'object' ? (charVal.fw || charVal.value || 0) : (charVal || 0)
                const cost = getUpgradeCost(val, sf)
                const maxReached = val >= limits.skill
                const probe = t.probe ? t.probe.join('/') : ''
                return (
                  <UpgradeRow
                    key={t.id}
                    name={t.name}
                    currentValue={val}
                    cost={cost}
                    maxReached={maxReached}
                    affordable={cost <= availableAP}
                    sf={sf}
                    probeAttrs={probe ? `Probe: ${probe}` : null}
                    onUpgrade={() => requestUpgrade(
                      `${t.name} steigern`,
                      `Talent „${t.name}" von Fertigkeitswert ${val} auf ${val + 1} steigern.${probe ? ` Dieses Talent wird mit einer Probe auf ${probe} gewürfelt.` : ''} ${t.description || ''}`,
                      cost, 'talent', t.id || t.name, sf
                    )}
                  />
                )
              })}
            </div>
          )
        })}
      </Section>

      {/* ── 3. Kampftechniken ── */}
      <Section title="Kampftechniken" icon={Swords} color="text-red-400" count={`${Object.keys(charCT).length} gelernt`}>
        <div className="text-[10px] text-dsa-parchment-dark px-2 pb-1">
          Kampftechniken bestimmen, wie gut dein Held mit einer bestimmten Waffengattung umgehen kann.
          Der Kampftechnikwert fließt direkt in Attacke und Parade ein. Ein höherer Wert bedeutet bessere Trefferchancen und Verteidigung.
          Ungelernte Kampftechniken haben den Basiswert 6.
        </div>
        {combatTechTemplates.map(ct => {
          const normName = (n) => n.toLowerCase().replace(/[äöüß]/g, m => ({ 'ä':'ae','ö':'oe','ü':'ue','ß':'ss' }[m]||m))
          const charVal = Object.entries(charCT).find(([k]) => normName(k) === normName(ct.name) || k.toLowerCase() === ct.name.toLowerCase())?.[1] || 0
          const val = typeof charVal === 'object' ? (charVal.ktw || charVal.value || 6) : (charVal || 6)
          const sf = ct.improvement_cost || 'C'
          const cost = getUpgradeCost(val, sf)
          const maxReached = val >= limits.kt
          const leAttr = ct.primary_attribute ? ct.primary_attribute.join('/') : ''
          const isRanged = ct.category === 'fernkampf'
          return (
            <UpgradeRow
              key={ct.id}
              name={ct.name}
              currentValue={val}
              cost={cost}
              maxReached={maxReached}
              affordable={cost <= availableAP}
              sf={sf}
              probeAttrs={leAttr ? `Leiteigenschaft: ${leAttr}` : null}
              detail={isRanged ? 'Fernkampf' : 'Nahkampf'}
              onUpgrade={() => requestUpgrade(
                `${ct.name} steigern`,
                `Kampftechnik „${ct.name}" von Kampftechnikwert ${val} auf ${val + 1} steigern.${leAttr ? ` Leiteigenschaft: ${leAttr}.` : ''} ${isRanged ? 'Fernkampftechnik — beeinflusst den Fernkampfwert.' : 'Nahkampftechnik — beeinflusst Attacke und Parade.'}`,
                cost, 'combat_technique', ct.id || ct.name, sf
              )}
            />
          )
        })}
      </Section>

      {/* ── 4. Zauber (only if character has spells) ── */}
      {Object.keys(spells).length > 0 && (
        <Section title="Zaubersprüche" icon={Sparkles} color="text-purple-400" count={`${Object.keys(spells).length} gelernt`}>
          <div className="text-[10px] text-dsa-parchment-dark px-2 pb-1">
            Zauber werden wie Talente gesteigert — der Fertigkeitswert bestimmt die Qualitätsstufen bei einer gelungenen Probe.
            Ein höherer Wert gibt dir mehr Puffer und erhöht die Chance auf hohe Qualitätsstufen.
            Die meisten Zauber haben Steigerungsfaktor C oder D.
          </div>
          {(spellTemplates.length > 0 ? spellTemplates : Object.keys(spells).map(s => ({ id: s, name: s }))).filter(s => {
            const normName = (n) => n.toLowerCase().replace(/[äöüß]/g, m => ({ 'ä':'ae','ö':'oe','ü':'ue','ß':'ss' }[m]||m))
            return Object.keys(spells).some(k => normName(k) === normName(s.name) || k.toLowerCase() === s.name.toLowerCase())
          }).map(s => {
            const normName = (n) => n.toLowerCase().replace(/[äöüß]/g, m => ({ 'ä':'ae','ö':'oe','ü':'ue','ß':'ss' }[m]||m))
            const charVal = Object.entries(spells).find(([k]) => normName(k) === normName(s.name) || k.toLowerCase() === s.name.toLowerCase())?.[1] || 0
            const val = typeof charVal === 'object' ? (charVal.fw || charVal.value || 0) : (charVal || 0)
            const sf = s.improvement_cost || 'C'
            const cost = getUpgradeCost(val, sf)
            const maxReached = val >= limits.spell
            const probe = s.probe ? (Array.isArray(s.probe) ? s.probe.join('/') : s.probe) : ''
            return (
              <UpgradeRow
                key={s.id}
                name={s.name}
                currentValue={val}
                cost={cost}
                maxReached={maxReached}
                affordable={cost <= availableAP}
                sf={sf}
                probeAttrs={probe ? `Probe: ${probe}` : null}
                onUpgrade={() => requestUpgrade(
                  `${s.name} steigern`,
                  `Zauber „${s.name}" von Fertigkeitswert ${val} auf ${val + 1} steigern.${probe ? ` Probe: ${probe}.` : ''} ${s.description || ''}`,
                  cost, 'spell', s.id || s.name, sf
                )}
              />
            )
          })}
        </Section>
      )}

      {/* ── 5. Liturgien (only if character has liturgies) ── */}
      {Object.keys(liturgies).length > 0 && (
        <Section title="Liturgien" icon={Sun} color="text-yellow-400" count={`${Object.keys(liturgies).length} gelernt`}>
          <div className="text-[10px] text-dsa-parchment-dark px-2 pb-1">
            Liturgien sind die göttlichen Fähigkeiten geweihter Helden. Sie funktionieren wie Zauber, werden aber mit Karmapunkten gewirkt.
            Steigerung erhöht den Fertigkeitswert und damit die Qualitätsstufen und den Puffer bei Proben.
          </div>
          {(liturgyTemplates.length > 0 ? liturgyTemplates : Object.keys(liturgies).map(l => ({ id: l, name: l }))).filter(l => {
            const normName = (n) => n.toLowerCase().replace(/[äöüß]/g, m => ({ 'ä':'ae','ö':'oe','ü':'ue','ß':'ss' }[m]||m))
            return Object.keys(liturgies).some(k => normName(k) === normName(l.name) || k.toLowerCase() === l.name.toLowerCase())
          }).map(l => {
            const normName = (n) => n.toLowerCase().replace(/[äöüß]/g, m => ({ 'ä':'ae','ö':'oe','ü':'ue','ß':'ss' }[m]||m))
            const charVal = Object.entries(liturgies).find(([k]) => normName(k) === normName(l.name) || k.toLowerCase() === l.name.toLowerCase())?.[1] || 0
            const val = typeof charVal === 'object' ? (charVal.fw || charVal.value || 0) : (charVal || 0)
            const sf = l.improvement_cost || 'C'
            const cost = getUpgradeCost(val, sf)
            const maxReached = val >= limits.spell
            const probe = l.probe ? (Array.isArray(l.probe) ? l.probe.join('/') : l.probe) : ''
            return (
              <UpgradeRow
                key={l.id}
                name={l.name}
                currentValue={val}
                cost={cost}
                maxReached={maxReached}
                affordable={cost <= availableAP}
                sf={sf}
                probeAttrs={probe ? `Probe: ${probe}` : null}
                onUpgrade={() => requestUpgrade(
                  `${l.name} steigern`,
                  `Liturgie „${l.name}" von Fertigkeitswert ${val} auf ${val + 1} steigern.${probe ? ` Probe: ${probe}.` : ''} ${l.description || ''}`,
                  cost, 'liturgy', l.id || l.name, sf
                )}
              />
            )
          })}
        </Section>
      )}

      {/* ── 5b. Zaubererweiterungen erwerben ── */}
      {spellsWithEnhancements.length > 0 && (
        <Section title="Zaubererweiterung erwerben" icon={Zap} color="text-blue-400" count={`${spellsWithEnhancements.length} Zauber`}>
          <div className="text-[10px] text-dsa-parchment-dark px-2 pb-1">
            Erweiterungen verbessern deine bekannten Zauber mit zusätzlichen Effekten.
            Jede Erweiterung hat eine Stufe (I, II, III) und eigene AP-Kosten.
          </div>
          <div className="px-2">
            <button
              onClick={() => setShowSpellEnhBrowser(!showSpellEnhBrowser)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold border rounded-sm transition bg-blue-900/20 border-blue-800/30 text-blue-300 hover:bg-blue-900/30"
            >
              <Plus className="w-3 h-3" />
              {showSpellEnhBrowser ? 'Erweiterungen schließen' : 'Erweiterungen anzeigen'}
            </button>
          </div>
          {showSpellEnhBrowser && (
            <div className="px-2 pt-1 space-y-2">
              {spellsWithEnhancements.map(s => {
                const purchased = spellEnhancements[s.id] || spellEnhancements[s.name] || []
                const unpurchased = (s.enhancements || []).filter(e => !purchased.includes(e.level))
                if (unpurchased.length === 0) return null
                return (
                  <div key={s.id} className="bg-dsa-bg-card/50 border border-dsa-bg-medium rounded-sm p-2 space-y-1">
                    <div className="text-xs font-medium text-blue-400">{s.name}</div>
                    {unpurchased.map(enh => {
                      const cost = enh.cost || 0
                      const affordable = cost <= availableAP
                      const roman = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V' }
                      return (
                        <div key={enh.level} className="flex items-center gap-2 pl-2 py-1 hover:bg-dsa-bg-card/50 rounded-sm transition">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-mono font-bold text-dsa-parchment-dark">{roman[enh.level] || enh.level}</span>
                              <span className="text-[11px] text-dsa-parchment">{enh.name}</span>
                            </div>
                            <p className="text-[9px] text-dsa-parchment-dark/50 truncate">{enh.effect}</p>
                          </div>
                          <button
                            onClick={() => requestEnhancement(s, enh, 'learn_spell_enhancement')}
                            disabled={!affordable}
                            className={clsx(
                              'flex items-center gap-1 px-2 py-1 rounded-sm text-[10px] font-bold border transition min-w-[72px] justify-center flex-shrink-0',
                              affordable
                                ? 'bg-blue-900/20 border-blue-800/30 text-blue-300 hover:bg-blue-900/30'
                                : 'bg-dsa-bg-card border-dsa-bg-medium text-dsa-parchment-dark/40 cursor-not-allowed'
                            )}
                          >
                            <Zap className="w-3 h-3" />
                            {cost} AP
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}
        </Section>
      )}

      {/* ── 5c. Liturgieerweiterungen erwerben ── */}
      {liturgiesWithEnhancements.length > 0 && (
        <Section title="Liturgieerweiterung erwerben" icon={Zap} color="text-yellow-400" count={`${liturgiesWithEnhancements.length} Liturgien`}>
          <div className="text-[10px] text-dsa-parchment-dark px-2 pb-1">
            Erweiterungen verbessern deine bekannten Liturgien mit zusätzlichen Effekten.
            Jede Erweiterung hat eine Stufe (I, II, III) und eigene AP-Kosten.
          </div>
          <div className="px-2">
            <button
              onClick={() => setShowLitEnhBrowser(!showLitEnhBrowser)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold border rounded-sm transition bg-yellow-900/20 border-yellow-800/30 text-yellow-300 hover:bg-yellow-900/30"
            >
              <Plus className="w-3 h-3" />
              {showLitEnhBrowser ? 'Erweiterungen schließen' : 'Erweiterungen anzeigen'}
            </button>
          </div>
          {showLitEnhBrowser && (
            <div className="px-2 pt-1 space-y-2">
              {liturgiesWithEnhancements.map(l => {
                const purchased = liturgyEnhancements[l.id] || liturgyEnhancements[l.name] || []
                const unpurchased = (l.enhancements || []).filter(e => !purchased.includes(e.level))
                if (unpurchased.length === 0) return null
                return (
                  <div key={l.id} className="bg-dsa-bg-card/50 border border-dsa-bg-medium rounded-sm p-2 space-y-1">
                    <div className="text-xs font-medium text-yellow-400">{l.name}</div>
                    {unpurchased.map(enh => {
                      const cost = enh.cost || 0
                      const affordable = cost <= availableAP
                      const roman = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V' }
                      return (
                        <div key={enh.level} className="flex items-center gap-2 pl-2 py-1 hover:bg-dsa-bg-card/50 rounded-sm transition">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-mono font-bold text-dsa-parchment-dark">{roman[enh.level] || enh.level}</span>
                              <span className="text-[11px] text-dsa-parchment">{enh.name}</span>
                            </div>
                            <p className="text-[9px] text-dsa-parchment-dark/50 truncate">{enh.effect}</p>
                          </div>
                          <button
                            onClick={() => requestEnhancement(l, enh, 'learn_liturgy_enhancement')}
                            disabled={!affordable}
                            className={clsx(
                              'flex items-center gap-1 px-2 py-1 rounded-sm text-[10px] font-bold border transition min-w-[72px] justify-center flex-shrink-0',
                              affordable
                                ? 'bg-yellow-900/20 border-yellow-800/30 text-yellow-300 hover:bg-yellow-900/30'
                                : 'bg-dsa-bg-card border-dsa-bg-medium text-dsa-parchment-dark/40 cursor-not-allowed'
                            )}
                          >
                            <Zap className="w-3 h-3" />
                            {cost} AP
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}
        </Section>
      )}

      {/* ── 6. Neuen Zauber lernen (magic characters only) ── */}
      {isMagic && (
        <Section title="Neuen Zauber lernen" icon={BookOpen} color="text-purple-400" count={`${learnableSpells.length} verfügbar`}>
          <div className="text-[10px] text-dsa-parchment-dark px-2 pb-1">
            Hier kannst du neue Zauber erlernen, die deiner Tradition entsprechen.
            Die Aktivierungskosten hängen vom Steigerungsfaktor des Zaubers ab (A=1, B=2, C=3, D=4 Abenteuerpunkte).
            Der Zauber startet bei Fertigkeitswert 0 — danach kannst du ihn oben normal steigern.
            {magicTraditions.length > 0 && (
              <span className="text-dsa-mana"> Deine Tradition: <strong>{magicTraditions.join(', ')}</strong></span>
            )}
          </div>
          {/* Toggle browser */}
          <div className="px-2">
            <button
              onClick={() => setShowSpellBrowser(!showSpellBrowser)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold border rounded-sm transition bg-purple-900/20 border-purple-800/30 text-purple-300 hover:bg-purple-900/30"
            >
              <Plus className="w-3 h-3" />
              {showSpellBrowser ? 'Zauber-Browser schließen' : 'Zauber-Browser öffnen'}
            </button>
          </div>
          {showSpellBrowser && (
            <div className="px-2 pt-1 space-y-1">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dsa-parchment-dark/40" />
                <input
                  type="text"
                  value={spellSearch}
                  onChange={e => setSpellSearch(e.target.value)}
                  placeholder="Zauber suchen..."
                  className="w-full pl-7 pr-3 py-1.5 bg-dsa-bg-card border border-dsa-bg-medium rounded-sm text-xs text-dsa-parchment placeholder:text-dsa-parchment-dark/30 focus:outline-none focus:border-purple-600/50"
                />
              </div>
              {magicTraditions.length === 0 && (
                <div className="flex items-center gap-2 text-amber-400 text-[10px] bg-amber-900/20 border border-amber-800/30 rounded-sm p-2">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Keine Tradition erkannt — es werden alle Zauber angezeigt.</span>
                </div>
              )}
              <div className="text-[9px] text-dsa-parchment-dark px-1">{filteredLearnableSpells.length} Zauber gefunden</div>
              <div className="max-h-64 overflow-y-auto space-y-0.5">
                {filteredLearnableSpells.map(s => {
                  const sf = s.improvement_cost || 'C'
                  const cost = getActivationCost(sf)
                  const affordable = cost <= availableAP
                  const probe = s.probe ? (Array.isArray(s.probe) ? s.probe.join('/') : s.probe) : ''
                  return (
                    <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-dsa-bg-card/50 transition">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-dsa-parchment truncate">{s.name}</span>
                          <span className="text-[9px] font-mono text-dsa-parchment-dark/50 bg-dsa-bg-card px-1 rounded">{sf}</span>
                        </div>
                        {probe && <div className="text-[9px] text-dsa-parchment-dark/50">Probe: {probe}</div>}
                        {s.asp_cost && <div className="text-[9px] text-dsa-parchment-dark/40">{s.asp_cost}</div>}
                      </div>
                      <button
                        onClick={() => requestLearn(s, 'learn_spell')}
                        disabled={!affordable}
                        className={clsx(
                          'flex items-center gap-1 px-2 py-1 rounded-sm text-[10px] font-bold border transition min-w-[72px] justify-center',
                          affordable
                            ? 'bg-purple-900/20 border-purple-800/30 text-purple-300 hover:bg-purple-900/30'
                            : 'bg-dsa-bg-card border-dsa-bg-medium text-dsa-parchment-dark/40 cursor-not-allowed'
                        )}
                      >
                        <Sparkles className="w-3 h-3" />
                        {cost} AP
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* ── 7. Neue Liturgie lernen (blessed characters only) ── */}
      {isBlessed && (
        <Section title="Neue Liturgie lernen" icon={BookOpen} color="text-yellow-400" count={`${learnableLiturgies.length} verfügbar`}>
          <div className="text-[10px] text-dsa-parchment-dark px-2 pb-1">
            Hier kannst du neue Liturgien erlernen, die deiner karmalen Tradition entsprechen.
            Die Aktivierungskosten hängen vom Steigerungsfaktor ab (A=1, B=2, C=3, D=4 Abenteuerpunkte).
            Die Liturgie startet bei Fertigkeitswert 0 — danach kannst du sie oben normal steigern.
            {karmalTraditions.length > 0 && (
              <span className="text-dsa-karma"> Deine Tradition: <strong>{karmalTraditions.join(', ')}</strong></span>
            )}
          </div>
          <div className="px-2">
            <button
              onClick={() => setShowLiturgyBrowser(!showLiturgyBrowser)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold border rounded-sm transition bg-yellow-900/20 border-yellow-800/30 text-yellow-300 hover:bg-yellow-900/30"
            >
              <Plus className="w-3 h-3" />
              {showLiturgyBrowser ? 'Liturgie-Browser schließen' : 'Liturgie-Browser öffnen'}
            </button>
          </div>
          {showLiturgyBrowser && (
            <div className="px-2 pt-1 space-y-1">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dsa-parchment-dark/40" />
                <input
                  type="text"
                  value={liturgySearch}
                  onChange={e => setLiturgySearch(e.target.value)}
                  placeholder="Liturgie suchen..."
                  className="w-full pl-7 pr-3 py-1.5 bg-dsa-bg-card border border-dsa-bg-medium rounded-sm text-xs text-dsa-parchment placeholder:text-dsa-parchment-dark/30 focus:outline-none focus:border-yellow-600/50"
                />
              </div>
              {karmalTraditions.length === 0 && (
                <div className="flex items-center gap-2 text-amber-400 text-[10px] bg-amber-900/20 border border-amber-800/30 rounded-sm p-2">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Keine karmale Tradition erkannt — es werden alle Liturgien angezeigt.</span>
                </div>
              )}
              <div className="text-[9px] text-dsa-parchment-dark px-1">{filteredLearnableLiturgies.length} Liturgien gefunden</div>
              <div className="max-h-64 overflow-y-auto space-y-0.5">
                {filteredLearnableLiturgies.map(l => {
                  const sf = l.improvement_cost || 'C'
                  const cost = getActivationCost(sf)
                  const affordable = cost <= availableAP
                  const probe = l.probe ? (Array.isArray(l.probe) ? l.probe.join('/') : l.probe) : ''
                  return (
                    <div key={l.id} className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-dsa-bg-card/50 transition">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-dsa-parchment truncate">{l.name}</span>
                          <span className="text-[9px] font-mono text-dsa-parchment-dark/50 bg-dsa-bg-card px-1 rounded">{sf}</span>
                        </div>
                        {probe && <div className="text-[9px] text-dsa-parchment-dark/50">Probe: {probe}</div>}
                        {l.kap_cost && <div className="text-[9px] text-dsa-parchment-dark/40">{l.kap_cost}</div>}
                      </div>
                      <button
                        onClick={() => requestLearn(l, 'learn_liturgy')}
                        disabled={!affordable}
                        className={clsx(
                          'flex items-center gap-1 px-2 py-1 rounded-sm text-[10px] font-bold border transition min-w-[72px] justify-center',
                          affordable
                            ? 'bg-yellow-900/20 border-yellow-800/30 text-yellow-300 hover:bg-yellow-900/30'
                            : 'bg-dsa-bg-card border-dsa-bg-medium text-dsa-parchment-dark/40 cursor-not-allowed'
                        )}
                      >
                        <Sun className="w-3 h-3" />
                        {cost} AP
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* ── 8. Sonderfertigkeit erwerben ── */}
      <Section title="Sonderfertigkeit erwerben" icon={Shield} color="text-emerald-400" count={`${purchasableSAs.length} verfügbar`}>
        <div className="text-[10px] text-dsa-parchment-dark px-2 pb-1">
          Sonderfertigkeiten verleihen deinem Helden besondere Fähigkeiten — Kampfmanöver, magische Techniken oder allgemeine Vorteile.
          Die Abenteuerpunkte-Kosten sind je nach Sonderfertigkeit unterschiedlich.
        </div>
        <div className="px-2">
          <button
            onClick={() => setShowSaBrowser(!showSaBrowser)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold border rounded-sm transition bg-emerald-900/20 border-emerald-800/30 text-emerald-300 hover:bg-emerald-900/30"
          >
            <Plus className="w-3 h-3" />
            {showSaBrowser ? 'SF-Browser schließen' : 'SF-Browser öffnen'}
          </button>
        </div>
        {showSaBrowser && (
          <div className="px-2 pt-1 space-y-1">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dsa-parchment-dark/40" />
              <input
                type="text"
                value={saSearch}
                onChange={e => setSaSearch(e.target.value)}
                placeholder="Sonderfertigkeit suchen..."
                className="w-full pl-7 pr-3 py-1.5 bg-dsa-bg-card border border-dsa-bg-medium rounded-sm text-xs text-dsa-parchment placeholder:text-dsa-parchment-dark/30 focus:outline-none focus:border-emerald-600/50"
              />
            </div>
            {/* Category filter tabs */}
            <div className="flex flex-wrap gap-1">
              {saCategoryTabs.map(g => (
                <button
                  key={g.id}
                  onClick={() => setSaFilterGroup(g.id)}
                  className={clsx(
                    'px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-sm border transition',
                    saFilterGroup === g.id
                      ? 'bg-emerald-900/30 border-emerald-700/50 text-emerald-300'
                      : 'bg-dsa-bg-card border-dsa-bg-medium text-dsa-parchment-dark hover:text-dsa-parchment'
                  )}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <div className="text-[9px] text-dsa-parchment-dark px-1">{filteredSAs.length} Sonderfertigkeiten gefunden</div>
            <div className="max-h-72 overflow-y-auto space-y-0.5">
              {filteredSAs.map(sa => {
                const cost = sa.ap_cost || 0
                const affordable = cost <= availableAP
                return (
                  <div key={sa.id} className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-dsa-bg-card/50 transition">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-dsa-parchment truncate">{sa.name}</span>
                        {sa.category && (
                          <span className="text-[9px] text-dsa-parchment-dark/40 bg-dsa-bg-card px-1 rounded truncate max-w-[80px]" title={sa.category}>{sa.category}</span>
                        )}
                      </div>
                      {sa.description && <div className="text-[9px] text-dsa-parchment-dark/50 truncate">{sa.description.slice(0, 80)}{sa.description.length > 80 ? '…' : ''}</div>}
                    </div>
                    <button
                      onClick={() => requestPurchaseSA(sa)}
                      disabled={!affordable || cost === 0}
                      className={clsx(
                        'flex items-center gap-1 px-2 py-1 rounded-sm text-[10px] font-bold border transition min-w-[72px] justify-center flex-shrink-0',
                        affordable && cost > 0
                          ? 'bg-emerald-900/20 border-emerald-800/30 text-emerald-300 hover:bg-emerald-900/30'
                          : 'bg-dsa-bg-card border-dsa-bg-medium text-dsa-parchment-dark/40 cursor-not-allowed'
                      )}
                      title={cost === 0 ? 'AP-Kosten unbekannt' : undefined}
                    >
                      <Shield className="w-3 h-3" />
                      {cost > 0 ? `${cost} AP` : '? AP'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </Section>

      {/* ── Steigerungsfaktor Explanation ── */}
      <div className="bg-dsa-bg-card/30 border border-dsa-bg-medium rounded-sm px-3 py-2 text-[10px] text-dsa-parchment-dark leading-relaxed">
        <div className="font-bold text-dsa-parchment mb-1">Steigerungsfaktor-Tabelle</div>
        <div className="text-[9px]">
          Die Kosten pro Stufe hängen vom Steigerungsfaktor (A–E) und dem aktuellen Wert ab.
          Niedrige Werte (0–7) sind günstig, mittlere (8–12) moderat, hohe (13+) zunehmend teurer.
        </div>
        <div className="grid grid-cols-6 gap-1 mt-1.5 text-[9px] font-mono">
          <div className="text-dsa-parchment-dark">Wert</div>
          {['A', 'B', 'C', 'D', 'E'].map(f => <div key={f} className="text-dsa-gold text-center">{f}</div>)}
          {[0, 8, 13, 16, 18, 20, 24].map(v => (
            <div key={v} className="contents">
              <div className="text-dsa-parchment-dark">{v}–{v === 0 ? 7 : v === 8 ? 12 : v === 13 ? 15 : v === 16 ? 17 : v === 18 ? 19 : v === 20 ? 23 : '+'}</div>
              {['A', 'B', 'C', 'D', 'E'].map(f => <div key={f} className="text-center text-dsa-parchment">{SF_TABLES[f][v]}</div>)}
            </div>
          ))}
        </div>
      </div>

      {/* ── Confirmation Modal ── */}
      {confirm && (
        <ConfirmModal
          title={confirm.title}
          description={confirm.desc}
          cost={confirm.cost}
          available={availableAP}
          onConfirm={doUpgrade}
          onCancel={() => setConfirm(null)}
          confirmLabel={confirm.type.includes('enhancement') ? 'Erwerben' : confirm.type.startsWith('learn_') ? 'Lernen' : confirm.type === 'special_ability' ? 'Erwerben' : 'Steigern'}
        />
      )}
    </div>
  )
}

