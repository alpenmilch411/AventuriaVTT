import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import {
  X, ChevronLeft, ChevronRight, Check, AlertTriangle, Loader2,
  Shield, Plus, Minus, RefreshCw, Search, ChevronDown, ChevronUp, Sparkles,
  Info, Swords, BookOpen, Coins,
} from 'lucide-react'
import clsx from 'clsx'
import useAuthStore from '../../stores/authStore'
import { TipAbbr } from '../../components/Tooltip'
import { EXPERIENCE_GRADES as ERFAHRUNGSGRADE, getAttrCost, getUpgradeCost as getSkillCost } from '../../engine/advancementCosts'
import { composeBackgroundDraft } from '../../engine/backgroundSnippets'

const ATTR_KEYS = ['MU','KL','IN','CH','FF','GE','KO','KK']

const ATTR_META = {
  MU: { name: 'Mut',              color: 'text-red-400',     desc: 'Willenskraft & Furchtlosigkeit. Beeinflusst Initiative und Seelenkraft.' },
  KL: { name: 'Klugheit',         color: 'text-blue-400',    desc: 'Logik & Wissen. Beeinflusst Seelenkraft und Karmapunkte.' },
  IN: { name: 'Intuition',        color: 'text-violet-400',  desc: 'Bauchgefühl & Wahrnehmung. Beeinflusst AsP, KaP und Seelenkraft.' },
  CH: { name: 'Charisma',         color: 'text-pink-400',    desc: 'Ausstrahlung & Überzeugungskraft. Beeinflusst Astralpunkte.' },
  FF: { name: 'Fingerfertigkeit', color: 'text-emerald-400', desc: 'Feinmotorik & Präzision. Für Schlösserknacken, Taschendiebstahl, Handwerk.' },
  GE: { name: 'Gewandtheit',      color: 'text-cyan-400',    desc: 'Beweglichkeit & Reflexe. Beeinflusst Initiative, Ausweichen und GS.' },
  KO: { name: 'Konstitution',     color: 'text-orange-400',  desc: 'Ausdauer & Widerstandskraft. Bestimmt Lebenspunkte und Zähigkeit.' },
  KK: { name: 'Körperkraft',      color: 'text-amber-400',   desc: 'Rohe Stärke. Beeinflusst Schadensbonus und Zähigkeit.' },
}

// ── Beginner-recommended professions (shown first, with badge) ──
const BEGINNER_PROFESSIONS = new Set([
  'Krieger', 'Jäger', 'Streuner', 'Praiosgeweihter', 'Weißmagier',
])

// ── Short gameplay taglines for profession cards (UI flavor, not game data) ──
const PROFESSION_GAMEPLAY_TAGS = {
  'Krieger':           'Nahkämpfer in schwerer Rüstung — stark im direkten Gefecht.',
  'Jäger':             'Fernkämpfer und Wildnisexperte — stark in Natur und Überleben.',
  'Streuner':          'Schlitzohr und Taschendieb — stark in Heimlichkeit und Gesellschaft.',
  'Praiosgeweihter':   'Priester des Sonnengottes — heilt, schützt und bekämpft Dämonen.',
  'Weißmagier':        'Gildenmagier — vielseitiger Zauberer mit breitem Spruchrepertoire.',
  'Söldner':           'Kampferprobter Klingenträger — flexibel und erfahren im Gefecht.',
  'Gardist':           'Stadtwache und Ordnungshüter — solider Nahkämpfer.',
  'Ritter':            'Ehrenhafter Kämpfer — schwere Rüstung, Reiten, Kodex.',
  'Gladiator':         'Arenakämpfer — spektakulärer und unberechenbarer Kampfstil.',
  'Soldat':            'Militärisch ausgebildet — disziplinierter Nahkämpfer.',
  'Barde':             'Musiker und Geschichtenerzähler — stark in Gesellschaft und Wissen.',
  'Händler':           'Reisender Kaufmann — stark in Gesellschaft und Handwerk.',
  'Heiler':            'Kräuterkundiger — heilt ohne Magie mit Wissen und Geschick.',
  'Gelehrter':         'Forscher und Wissender — stark in Wissens- und Handwerkstalenten.',
  'Seefahrer':         'Matrose und Entdecker — zu Hause auf See und in der Wildnis.',
  'Höfling':           'Meister der Intrige und Diplomatie — stark in Gesellschaft.',
  'Rondrageweihter':   'Krieger-Priester — kampfstark mit göttlichem Segen.',
  'Borongeweihter':    'Totenhüter — Geweihter gegen Untote und dunkle Mächte.',
  'Graumagier':        'Gelehrter Magier — breites Wissen und vielseitige Zauberkunst.',
  'Schwarzmagier':     'Dunkler Magier — mächtig, aber gefährlich und umstritten.',
  'Druide':            'Naturhüter — erdverbundene Magie jenseits der Gilden.',
  'Wildnisläufer':     'Naturmagier und Überlebenskünstler — Magie der Wildnis.',
  'Adliger':           'Von edlem Geblüt — Autorität, Reiten und Gesellschaftstalente.',
}

// Vorteile/Nachteile presets are now fetched from the DB at runtime
// (see advantagesAll / disadvantagesAll state in CharacterCreator)

// ── Talent category metadata (for display; talents come from DB) ──
const TALENT_CATEGORY_META = {
  'körper':       { label: 'Körpertalente',       color: 'text-orange-400', sf: 'B' },
  'gesellschaft': { label: 'Gesellschaftstalente', color: 'text-pink-400',  sf: 'B' },
  'natur':        { label: 'Naturtalente',         color: 'text-green-400',  sf: 'C' },
  'wissen':       { label: 'Wissenstalente',       color: 'text-blue-400',   sf: 'C' },
  'handwerk':     { label: 'Handwerkstalente',     color: 'text-amber-400',  sf: 'B' },
}
const TALENT_CATEGORY_ORDER = ['körper', 'gesellschaft', 'natur', 'wissen', 'handwerk']

// ── Extract total level from advantage/disadvantage names matching a base pattern ──
function sumAdvantageLevel(names, baseName) {
  let total = 0
  const pattern = baseName.toLowerCase()
  for (const name of names) {
    const lower = name.toLowerCase()
    if (lower === pattern || lower.startsWith(pattern + ' ')) {
      const match = name.match(/\s+(I{1,3}|IV|V)$/i)
      if (match) {
        const romanMap = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5 }
        total += romanMap[match[1].toUpperCase()] || 1
      } else {
        total += 1
      }
    }
  }
  return total
}

// ────────────────────────────────────────────────────────────────────────────
// Step titles
// ────────────────────────────────────────────────────────────────────────────

const STEPS = [
  'Erfahrungsgrad',
  'Name & Grundlagen',
  'Spezies',
  'Kultur',
  'Profession',
  'Vor- & Nachteile',
  'Attribute verfeinern',
  'Talente & Kampftechniken',
  'Abgeleitete Werte',
  'Zusammenfassung',
]

// ────────────────────────────────────────────────────────────────────────────
// API helper
// ────────────────────────────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────────────────────
// Helper: +/- button
// ────────────────────────────────────────────────────────────────────────────

function IncDec({ value, onInc, onDec, disableInc, disableDec, cost }) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={onDec}
        disabled={disableDec}
        className="w-6 h-6 flex items-center justify-center rounded bg-dsa-bg-medium text-dsa-parchment-dark hover:text-dsa-parchment disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <Minus className="w-3 h-3" />
      </button>
      <span className="w-8 text-center text-sm font-mono text-dsa-parchment font-semibold">{value}</span>
      <button
        onClick={onInc}
        disabled={disableInc}
        className="w-6 h-6 flex items-center justify-center rounded bg-dsa-bg-medium text-dsa-parchment-dark hover:text-dsa-gold disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <Plus className="w-3 h-3" />
      </button>
      {cost != null && cost > 0 && (
        <span className="text-[10px] text-dsa-parchment-dark/60 ml-1">{cost} AP</span>
      )}
    </div>
  )
}

// ── Error state with retry ──
function LoadError({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <AlertTriangle className="w-8 h-8 text-dsa-danger" />
      <p className="text-sm text-dsa-parchment">{message}</p>
      <button onClick={onRetry} className="btn-secondary flex items-center gap-2 text-sm">
        <RefreshCw className="w-4 h-4" />
        Erneut versuchen
      </button>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────────────────────────────────────

export default function CharacterCreator({ onClose, onCreated, editCharacter }) {
  const token = useAuthStore((s) => s.token)
  const isEdit = !!editCharacter

  // ── API data ──
  const [speciesAll, setSpeciesAll] = useState([])
  const [culturesAll, setCulturesAll] = useState([])
  const [professionsAll, setProfessionsAll] = useState([])
  const [advantagesAll, setAdvantagesAll] = useState([])
  const [disadvantagesAll, setDisadvantagesAll] = useState([])
  const [specialAbilitiesAll, setSpecialAbilitiesAll] = useState([])
  const [talentsAll, setTalentsAll] = useState([])
  const [combatTechAll, setCombatTechAll] = useState([])
  const [apiLoading, setApiLoading] = useState({ species: false, cultures: false, professions: false, advantages: false, disadvantages: false, specialAbilities: false, talents: false, combatTech: false })
  const [apiError, setApiError] = useState({ species: null, cultures: null, professions: null, advantages: null, disadvantages: null, specialAbilities: null, talents: null, combatTech: null })

  const loadSpecies = useCallback(async () => {
    setApiLoading(l => ({ ...l, species: true }))
    setApiError(e => ({ ...e, species: null }))
    try {
      setSpeciesAll(await fetchDatabank('species', token))
    } catch (err) {
      setApiError(e => ({ ...e, species: err.message }))
    }
    setApiLoading(l => ({ ...l, species: false }))
  }, [token])

  const loadCultures = useCallback(async () => {
    setApiLoading(l => ({ ...l, cultures: true }))
    setApiError(e => ({ ...e, cultures: null }))
    try {
      setCulturesAll(await fetchDatabank('cultures', token))
    } catch (err) {
      setApiError(e => ({ ...e, cultures: err.message }))
    }
    setApiLoading(l => ({ ...l, cultures: false }))
  }, [token])

  const loadProfessions = useCallback(async () => {
    setApiLoading(l => ({ ...l, professions: true }))
    setApiError(e => ({ ...e, professions: null }))
    try {
      setProfessionsAll(await fetchDatabank('professions', token))
    } catch (err) {
      setApiError(e => ({ ...e, professions: err.message }))
    }
    setApiLoading(l => ({ ...l, professions: false }))
  }, [token])

  const loadAdvantages = useCallback(async () => {
    setApiLoading(l => ({ ...l, advantages: true }))
    setApiError(e => ({ ...e, advantages: null }))
    try {
      setAdvantagesAll(await fetchDatabank('advantages', token))
    } catch (err) {
      setApiError(e => ({ ...e, advantages: err.message }))
    }
    setApiLoading(l => ({ ...l, advantages: false }))
  }, [token])

  const loadDisadvantages = useCallback(async () => {
    setApiLoading(l => ({ ...l, disadvantages: true }))
    setApiError(e => ({ ...e, disadvantages: null }))
    try {
      setDisadvantagesAll(await fetchDatabank('disadvantages', token))
    } catch (err) {
      setApiError(e => ({ ...e, disadvantages: err.message }))
    }
    setApiLoading(l => ({ ...l, disadvantages: false }))
  }, [token])

  const loadSpecialAbilities = useCallback(async () => {
    setApiLoading(l => ({ ...l, specialAbilities: true }))
    setApiError(e => ({ ...e, specialAbilities: null }))
    try {
      setSpecialAbilitiesAll(await fetchDatabank('special_abilities', token))
    } catch (err) {
      setApiError(e => ({ ...e, specialAbilities: err.message }))
    }
    setApiLoading(l => ({ ...l, specialAbilities: false }))
  }, [token])

  const loadTalents = useCallback(async () => {
    setApiLoading(l => ({ ...l, talents: true }))
    setApiError(e => ({ ...e, talents: null }))
    try {
      setTalentsAll(await fetchDatabank('talents', token))
    } catch (err) {
      setApiError(e => ({ ...e, talents: err.message }))
    }
    setApiLoading(l => ({ ...l, talents: false }))
  }, [token])

  const loadCombatTech = useCallback(async () => {
    setApiLoading(l => ({ ...l, combatTech: true }))
    setApiError(e => ({ ...e, combatTech: null }))
    try {
      setCombatTechAll(await fetchDatabank('combat_techniques', token))
    } catch (err) {
      setApiError(e => ({ ...e, combatTech: err.message }))
    }
    setApiLoading(l => ({ ...l, combatTech: false }))
  }, [token])

  useEffect(() => { loadSpecies(); loadCultures(); loadProfessions(); loadAdvantages(); loadDisadvantages(); loadSpecialAbilities(); loadTalents(); loadCombatTech() }, [loadSpecies, loadCultures, loadProfessions, loadAdvantages, loadDisadvantages, loadSpecialAbilities, loadTalents, loadCombatTech])

  // ── Wizard state ──
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // Step 1: Grade
  const [grade, setGrade] = useState(null)

  // Step 2: Name & basics
  const [name, setName] = useState('')
  const [nickname, setNickname] = useState('')
  const [background, setBackground] = useState('')

  // Step 3: Species + free points
  const [species, setSpecies] = useState(null)
  const [speciesVariant, setSpeciesVariant] = useState(null) // selected species variant (if any)
  const [speciesFreePoints, setSpeciesFreePoints] = useState({}) // {attr: delta}

  // Step 4: Culture
  const [culture, setCulture] = useState(null)

  // Step 5: Profession
  const [profession, setProfession] = useState(null)
  const [professionVariant, setProfessionVariant] = useState(null) // selected profession variant (if any)

  // Step 6: Vor-/Nachteile
  const [vorteile, setVorteile] = useState([])
  const [nachteile, setNachteile] = useState([])

  // Step 7: Attribute upgrades (deltas over base)
  const [attrUpgrades, setAttrUpgrades] = useState({})

  // Step 8: Talent & KT upgrades (deltas over base)
  const [talentUpgrades, setTalentUpgrades] = useState({})
  const [ktUpgrades, setKtUpgrades] = useState({})

  // AT/PA splits for melee combat techniques: { ktName: { at: number, pa: number } }
  const [atPaSplits, setAtPaSplits] = useState({})

  // Spell/liturgy selection (subset of profession offerings)
  const [selectedSpells, setSelectedSpells] = useState({})     // { name: fw }
  const [selectedLiturgies, setSelectedLiturgies] = useState({}) // { name: fw }

  // Purchased SAs (in addition to profession-granted ones)
  const [purchasedSAs, setPurchasedSAs] = useState([])  // [{name, ap_cost}]

  // ── Edit mode: populate state from editCharacter once databank loads ──
  const editPopulatedRef = useRef(false)
  const skipResetRef = useRef(false)

  useEffect(() => {
    if (!editCharacter || editPopulatedRef.current) return
    if (speciesAll.length === 0) return // wait for API data

    editPopulatedRef.current = true
    skipResetRef.current = true

    // Grade
    if (editCharacter.experience_grade) setGrade(editCharacter.experience_grade)

    // Name & bio
    if (editCharacter.name) setName(editCharacter.name)
    if (editCharacter.bio) {
      const lines = editCharacter.bio.split('\n\n')
      const spitzLine = lines.find(l => l.startsWith('Spitzname: '))
      if (spitzLine) setNickname(spitzLine.replace('Spitzname: ', ''))
      const rest = lines.filter(l => !l.startsWith('Spitzname: ')).join('\n\n')
      if (rest) setBackground(rest)
    }

    // Species (match by name from databank)
    const matchedSpecies = speciesAll.find(s => s.name === editCharacter.species) || null
    if (matchedSpecies) setSpecies(matchedSpecies)

    // Culture
    const matchedCulture = culturesAll.find(c => c.name === editCharacter.culture) || null
    if (matchedCulture) setCulture(matchedCulture)

    // Profession
    const matchedProfession = professionsAll.find(p => p.name === editCharacter.profession) || null
    if (matchedProfession) setProfession(matchedProfession)

    // Advantages / Disadvantages
    if (editCharacter.advantages) {
      const advObj = typeof editCharacter.advantages === 'object' && !Array.isArray(editCharacter.advantages)
        ? editCharacter.advantages : {}
      const vList = Object.entries(advObj)
        .filter(([, v]) => !v?.auto)
        .map(([k, v]) => ({ name: k, ap: v?.ap || 0 }))
      setVorteile(vList)
    }
    if (editCharacter.disadvantages) {
      const disObj = typeof editCharacter.disadvantages === 'object' && !Array.isArray(editCharacter.disadvantages)
        ? editCharacter.disadvantages : {}
      const nList = Object.entries(disObj).map(([k, v]) => ({ name: k, ap: v?.ap || 0 }))
      setNachteile(nList)
    }

    // Defer skipResetRef so reset-effects don't fire on this cycle
    setTimeout(() => {
      skipResetRef.current = false
    }, 0)
  }, [editCharacter, speciesAll, culturesAll, professionsAll])

  // ── Derived data ──
  const gradeData = grade ? ERFAHRUNGSGRADE[grade] : null
  const freeAttrPoints = species?.free_attribute_points ?? 7

  // Base attributes = species base + fixed species attribute adjustments + free points
  const baseAttributes = useMemo(() => {
    const specBase = species?.base_attributes || {}
    const base = ATTR_KEYS.reduce((o, k) => ({ ...o, [k]: specBase[k] ?? 8 }), {})
    // Species racial attribute adjustments (e.g. Elf: IN+1/GE+1, Zwerg: KO+1/KK+1)
    const adjustments = species?.attribute_adjustments || []
    if (Array.isArray(adjustments)) {
      // Array format: [{attr:"IN", value:1}, {choice:true, ...}]
      for (const adj of adjustments) {
        if (!adj.choice && adj.attr && ATTR_KEYS.includes(adj.attr)) {
          base[adj.attr] = (base[adj.attr] || 8) + (adj.value || 0)
        }
      }
    } else if (typeof adjustments === 'object') {
      // Dict format fallback: {IN: 1, GE: 1}
      for (const [k, v] of Object.entries(adjustments)) {
        if (ATTR_KEYS.includes(k)) base[k] = (base[k] || 8) + v
      }
    }
    for (const [k, v] of Object.entries(speciesFreePoints)) {
      base[k] = (base[k] || 8) + v
    }
    return base
  }, [species, speciesFreePoints])

  // Final attributes = base + upgrades
  const finalAttributes = useMemo(() => {
    const result = { ...baseAttributes }
    for (const [k, v] of Object.entries(attrUpgrades)) {
      result[k] = (result[k] || 8) + v
    }
    return result
  }, [baseAttributes, attrUpgrades])

  // Base skills (from culture skill_bonuses + profession skills + profession variant adjustments)
  const baseSkills = useMemo(() => {
    const skills = {}
    if (culture?.skill_bonuses) {
      for (const [k, v] of Object.entries(culture.skill_bonuses)) {
        skills[k] = (skills[k] || 0) + v
      }
    }
    if (profession?.skills) {
      for (const [k, v] of Object.entries(profession.skills)) {
        skills[k] = (skills[k] || 0) + v
      }
    }
    // Apply profession variant skill adjustments
    if (professionVariant?.skills) {
      for (const [k, v] of Object.entries(professionVariant.skills)) {
        skills[k] = (skills[k] || 0) + v
      }
    }
    return skills
  }, [culture, profession, professionVariant])

  // Base KT (from profession, min 6)
  const baseKT = useMemo(() => {
    const kt = {}
    if (profession?.combat_techniques) {
      for (const [k, v] of Object.entries(profession.combat_techniques)) {
        kt[k] = Math.max(6, v)
      }
    }
    return kt
  }, [profession])

  // ── Edit mode: compute upgrades after base values stabilize ──
  const editUpgradesComputedRef = useRef(false)
  useEffect(() => {
    if (!editCharacter || !editPopulatedRef.current || editUpgradesComputedRef.current) return
    if (!species || !profession) return // wait for base values to resolve

    editUpgradesComputedRef.current = true

    // Attribute upgrades = stored attributes minus species base
    const storedAttrs = editCharacter.attributes || {}
    const upgrades = {}
    for (const k of ATTR_KEYS) {
      const stored = storedAttrs[k] || 8
      const base = baseAttributes[k] || 8
      const diff = stored - base
      if (diff !== 0) upgrades[k] = diff
    }
    setAttrUpgrades(upgrades)

    // Talent upgrades = stored talents minus culture+profession base
    const storedTalents = editCharacter.talents || {}
    const tUpgrades = {}
    for (const [k, v] of Object.entries(storedTalents)) {
      const base = baseSkills[k] || 0
      const diff = v - base
      if (diff > 0) tUpgrades[k] = diff
    }
    setTalentUpgrades(tUpgrades)

    // KT upgrades = stored combat techniques minus profession base
    const storedKT = editCharacter.combat_techniques || {}
    const ktUpg = {}
    const splits = {}
    for (const [k, v] of Object.entries(storedKT)) {
      const val = typeof v === 'number' ? v : v?.ktw || 6
      const base = baseKT[k] || 6
      const diff = val - base
      if (diff > 0) ktUpg[k] = diff
      if (typeof v === 'object' && v.at != null && v.pa != null) {
        splits[k] = { at: v.at, pa: v.pa }
      }
    }
    setKtUpgrades(ktUpg)
    if (Object.keys(splits).length > 0) setAtPaSplits(splits)

    // Spells & liturgies
    if (editCharacter.spells && Object.keys(editCharacter.spells).length > 0) {
      setSelectedSpells(editCharacter.spells)
    }
    if (editCharacter.liturgies && Object.keys(editCharacter.liturgies).length > 0) {
      setSelectedLiturgies(editCharacter.liturgies)
    }

    // Special abilities (subtract profession-granted ones)
    if (editCharacter.special_abilities) {
      const profSAs = new Set(profession?.special_abilities || [])
      const purchased = editCharacter.special_abilities
        .filter(sa => !profSAs.has(sa))
        .map(sa => {
          const tmpl = specialAbilitiesAll.find(t => t.name === sa)
          return { name: sa, ap_cost: tmpl?.ap_cost || 0 }
        })
      if (purchased.length > 0) setPurchasedSAs(purchased)
    }

    // Profession variant
    if (editCharacter.profession_variant && profession?.variants) {
      const matchedVar = profession.variants.find(v => v.name === editCharacter.profession_variant)
      if (matchedVar) setProfessionVariant(matchedVar)
    }

    // Species variant
    if (editCharacter.species_variant && species?.variants) {
      const matchedVar = species.variants.find(v => v.name === editCharacter.species_variant)
      if (matchedVar) setSpeciesVariant(matchedVar)
    }
  }, [editCharacter, species, profession, baseAttributes, baseSkills, baseKT, specialAbilitiesAll])



  // Dynamic talent categories from DB templates
  const talentCategories = useMemo(() => {
    if (talentsAll.length === 0) return []
    const grouped = {}
    for (const t of talentsAll) {
      const cat = t.category || 'handwerk'
      if (!grouped[cat]) grouped[cat] = []
      grouped[cat].push(t.name)
    }
    return TALENT_CATEGORY_ORDER
      .filter(id => grouped[id])
      .map(id => ({
        id,
        ...(TALENT_CATEGORY_META[id] || { label: id, color: 'text-dsa-parchment', sf: 'B' }),
        talents: grouped[id].sort(),
      }))
  }, [talentsAll])

  // Dynamic KT data from DB templates
  const ktData = useMemo(() => {
    if (combatTechAll.length === 0) return []
    return combatTechAll.map(ct => ({
      name: ct.name,
      sf: ct.improvement_cost || 'C',
      type: ct.category === 'fernkampf' ? 'ranged' : 'melee',
    }))
  }, [combatTechAll])

  // Talent SF lookup from DB data (for AP calculation)
  const talentSFMap = useMemo(() => {
    const map = {}
    for (const t of talentsAll) {
      const cat = t.category || 'handwerk'
      map[t.name] = t.improvement_cost || TALENT_CATEGORY_META[cat]?.sf || 'B'
    }
    return map
  }, [talentsAll])

  // Species free points total used
  const speciesFreeUsed = Object.values(speciesFreePoints).reduce((s, v) => s + v, 0)

  // Species-level flags for profession filtering
  const speciesMagicCapable = species?.magic_capable || false
  const speciesBlessedCapable = species?.blessed_capable || false

  // Character-level magic/blessed: determined by profession (not species)
  const isMagic = profession?.requires_magic || (!!profession?.spells && Object.keys(profession.spells).length > 0)
  const isBlessed = profession?.requires_blessed || (!!profession?.liturgies && Object.keys(profession.liturgies).length > 0)

  // ── AP Computation ──
  const apBudget = useMemo(() => {
    if (!gradeData) return { total: 0, speciesAP: 0, cultureAP: 0, professionAP: 0, freeAP: 0, attrSpend: 0, skillSpend: 0, ktSpend: 0, vorteileAP: 0, nachteileRefund: 0, remaining: 0 }

    const total = gradeData.ap
    const speciesAP = species?.ap_cost || 0
    const cultureAP = culture?.ap_cost || 0
    const professionAP = (profession?.ap_cost || 0) + (professionVariant?.ap_cost || 0)
    const freeAP = total - speciesAP - cultureAP - professionAP

    // Attr spend
    let attrSpend = 0
    for (const [attr, delta] of Object.entries(attrUpgrades)) {
      const base = baseAttributes[attr] || 8
      for (let i = 0; i < delta; i++) {
        attrSpend += getAttrCost(base + i)
      }
    }

    // Skill spend
    let skillSpend = 0
    for (const [talentName, delta] of Object.entries(talentUpgrades)) {
      const base = baseSkills[talentName] || 0
      const sf = talentSFMap[talentName] || 'B'
      for (let i = 0; i < delta; i++) {
        skillSpend += getSkillCost(base + i, sf)
      }
    }

    // KT spend
    let ktSpend = 0
    for (const [ktName, delta] of Object.entries(ktUpgrades)) {
      const base = baseKT[ktName] || 6
      const ktd = ktData.find(k => k.name === ktName)
      const sf = ktd?.sf || 'C'
      for (let i = 0; i < delta; i++) {
        ktSpend += getSkillCost(base + i, sf)
      }
    }

    const vorteileAPRaw = vorteile.reduce((s, v) => s + v.ap, 0)
    const vorteileAP = Math.min(80, vorteileAPRaw)
    const nachteileRefund = Math.min(80, nachteile.reduce((s, n) => s + n.ap, 0))

    // Purchased SAs cost
    const saSpend = purchasedSAs.reduce((s, sa) => s + (sa.ap_cost || 0), 0)

    const remaining = freeAP - attrSpend - skillSpend - ktSpend - vorteileAP + nachteileRefund - saSpend

    return { total, speciesAP, cultureAP, professionAP, freeAP, attrSpend, skillSpend, ktSpend, vorteileAP, vorteileAPRaw, nachteileRefund, saSpend, remaining }
  }, [gradeData, species, culture, profession, professionVariant, attrUpgrades, baseAttributes, talentUpgrades, baseSkills, ktUpgrades, baseKT, vorteile, nachteile, purchasedSAs, talentSFMap, ktData])

  // ── Derived values (with advantage/disadvantage modifiers + breakdown) ──
  const derivedComputed = useMemo(() => {
    const a = finalAttributes
    const lepBase = species?.lep_base || 0
    const gsBase = species?.gs_base || 8
    const skMod = species?.sk_modifier || 0
    const zkMod = species?.zk_modifier || 0

    // Combine user-selected + species auto-advantages
    const allAdvNames = [...vorteile.map(v => v.name), ...(species?.auto_advantages || [])]
    const allDisNames = nachteile.map(n => n.name)

    // Extract level-based modifiers from advantages/disadvantages
    const hoheLK  = sumAdvantageLevel(allAdvNames, 'Hohe Lebenskraft')
    const niedLK  = sumAdvantageLevel(allDisNames, 'Niedrige Lebenskraft')
    const hoheSK  = sumAdvantageLevel(allAdvNames, 'Hohe Seelenkraft')
    const niedSK  = sumAdvantageLevel(allDisNames, 'Niedrige Seelenkraft')
    const hoheZK  = sumAdvantageLevel(allAdvNames, 'Hohe Zähigkeit')
    const niedZK  = sumAdvantageLevel(allDisNames, 'Niedrige Zähigkeit')
    const flink   = sumAdvantageLevel(allAdvNames, 'Flink')
    const glueck  = sumAdvantageLevel(allAdvNames, 'Glück')
    const pech    = sumAdvantageLevel(allDisNames, 'Pech')
    const hoheAK  = sumAdvantageLevel(allAdvNames, 'Hohe Astralkraft')
    const niedAK  = sumAdvantageLevel(allDisNames, 'Niedrige Astralkraft')
    const hoheKK  = sumAdvantageLevel(allAdvNames, 'Hohe Karmalkraft')
    const niedKK  = sumAdvantageLevel(allDisNames, 'Niedrige Karmalkraft')

    // Attribute-based parts
    const lepAttr = a.KO * 2
    const aspAttrPart = Math.ceil((a.MU + a.IN + a.CH) / 2)
    const kapAttrPart = Math.ceil((a.MU + a.KL + a.IN) / 2)
    const iniBasis = Math.floor((a.MU + a.GE) / 2)
    const awBasis = Math.floor(a.GE / 2)
    const wsBasis = Math.ceil(a.KO / 2)
    const sbBasis = Math.max(0, Math.floor((a.KK - 15) / 3))
    const skAttr = Math.floor((a.MU + a.KL + a.IN) / 3)
    const zkAttr = Math.floor((a.KO + a.KO + a.KK) / 3)

    const values = {
      LeP_max:     lepBase + lepAttr + hoheLK - niedLK,
      lep_base:    lepBase,
      SK_modifier: skMod,
      ZK_modifier: zkMod,
      AsP_max:     isMagic ? 20 + aspAttrPart + hoheAK - niedAK : 0,
      KaP_max:     isBlessed ? 20 + kapAttrPart + hoheKK - niedKK : 0,
      GS:          gsBase + flink,
      INI_basis:   iniBasis,
      AW:          awBasis,
      WS:          wsBasis,
      SB:          sbBasis,
      SK:          skAttr + skMod + hoheSK - niedSK,
      ZK:          zkAttr + zkMod + hoheZK - niedZK,
      SchiP:       3 + glueck - pech,
    }

    // Build step-by-step breakdown for each derived value
    const b = (steps) => steps.filter(Boolean)
    const breakdown = {
      LeP_max: b([
        { label: 'Spezies-Basis', value: lepBase },
        { label: `2 × KO (${a.KO})`, value: lepAttr },
        hoheLK > 0 && { label: 'Hohe Lebenskraft', value: hoheLK, bonus: true },
        niedLK > 0 && { label: 'Niedrige Lebenskraft', value: -niedLK, penalty: true },
      ]),
      AsP_max: b([
        { label: 'Basis (Zauberer)', value: 20 },
        { label: `⌀ MU+IN+CH`, value: aspAttrPart },
        hoheAK > 0 && { label: 'Hohe Astralkraft', value: hoheAK, bonus: true },
        niedAK > 0 && { label: 'Niedrige Astralkraft', value: -niedAK, penalty: true },
      ]),
      KaP_max: b([
        { label: 'Basis (Geweihter)', value: 20 },
        { label: `⌀ MU+KL+IN`, value: kapAttrPart },
        hoheKK > 0 && { label: 'Hohe Karmalkraft', value: hoheKK, bonus: true },
        niedKK > 0 && { label: 'Niedrige Karmalkraft', value: -niedKK, penalty: true },
      ]),
      GS: b([
        { label: 'Spezies-Basis', value: gsBase },
        flink > 0 && { label: 'Flink', value: flink, bonus: true },
      ]),
      INI_basis: b([
        { label: '⌊(MU + GE) / 2⌋', value: iniBasis },
      ]),
      AW: b([
        { label: '⌊GE / 2⌋', value: awBasis },
      ]),
      WS: b([
        { label: '⌈KO / 2⌉', value: wsBasis },
      ]),
      SB: b([
        { label: '⌊(KK − 15) / 3⌋', value: sbBasis },
      ]),
      SK: b([
        { label: '⌊(MU+KL+IN) / 3⌋', value: skAttr },
        skMod !== 0 && { label: 'Spezies-Mod.', value: skMod, bonus: skMod > 0, penalty: skMod < 0 },
        hoheSK > 0 && { label: 'Hohe Seelenkraft', value: hoheSK, bonus: true },
        niedSK > 0 && { label: 'Niedrige Seelenkraft', value: -niedSK, penalty: true },
      ]),
      ZK: b([
        { label: '⌊(2×KO+KK) / 3⌋', value: zkAttr },
        zkMod !== 0 && { label: 'Spezies-Mod.', value: zkMod, bonus: zkMod > 0, penalty: zkMod < 0 },
        hoheZK > 0 && { label: 'Hohe Zähigkeit', value: hoheZK, bonus: true },
        niedZK > 0 && { label: 'Niedrige Zähigkeit', value: -niedZK, penalty: true },
      ]),
      SchiP: b([
        { label: 'Basis', value: 3 },
        glueck > 0 && { label: 'Glück', value: glueck, bonus: true },
        pech > 0 && { label: 'Pech', value: -pech, penalty: true },
      ]),
    }

    return { values, breakdown }
  }, [finalAttributes, species, isMagic, isBlessed, vorteile, nachteile])

  const derivedValues = derivedComputed.values
  const derivationBreakdown = derivedComputed.breakdown

  // ── Step validation ──
  const canAdvance = useMemo(() => {
    switch (step) {
      case 0: return !!grade
      case 1: return name.trim().length > 0
      case 2: return !!species && speciesFreeUsed === freeAttrPoints
      case 3: return !!culture
      case 4: return !!profession
      case 5: return true
      case 6: return true
      case 7: return true
      case 8: return true
      case 9: return apBudget.remaining >= 0
      default: return false
    }
  }, [step, grade, name, species, speciesFreeUsed, freeAttrPoints, culture, profession, apBudget])

  // ── Navigation ──
  const goNext = useCallback(() => {
    if (canAdvance && step < STEPS.length - 1) setStep(s => s + 1)
  }, [canAdvance, step])

  const goBack = useCallback(() => {
    if (step > 0) setStep(s => s - 1)
  }, [step])

  // Reset dependent state when changing species
  useEffect(() => {
    if (skipResetRef.current) return
    setSpeciesFreePoints({})
    setSpeciesVariant(null)
    setCulture(null)
    setProfession(null)
    setProfessionVariant(null)
  }, [species])

  useEffect(() => {
    if (skipResetRef.current) return
    setProfession(null)
    setProfessionVariant(null)
  }, [culture])

  // Reset profession variant when profession changes
  useEffect(() => {
    if (skipResetRef.current) return
    setProfessionVariant(null)
  }, [profession])

  // Auto-populate spells/liturgies when profession changes
  useEffect(() => {
    if (skipResetRef.current) return
    if (profession?.spells) {
      setSelectedSpells({ ...profession.spells })
    } else {
      setSelectedSpells({})
    }
    if (profession?.liturgies) {
      setSelectedLiturgies({ ...profession.liturgies })
    } else {
      setSelectedLiturgies({})
    }
  }, [profession])

  // ── Submit ──
  const handleSubmit = async () => {
    setSubmitting(true)
    setSubmitError('')

    // Build final skills dict
    const skills = { ...baseSkills }
    for (const [k, v] of Object.entries(talentUpgrades)) {
      skills[k] = (skills[k] || 0) + v
    }

    // Build final KT dict with AT/PA splits for melee
    const combatTechniques = {}
    for (const ktd of ktData) {
      const base = baseKT[ktd.name] || 6
      const upgrade = ktUpgrades[ktd.name] || 0
      const ktw = base + upgrade
      if (ktd.type === 'melee' && atPaSplits[ktd.name]) {
        combatTechniques[ktd.name] = { ktw, at: atPaSplits[ktd.name].at, pa: atPaSplits[ktd.name].pa }
      } else {
        combatTechniques[ktd.name] = ktw
      }
    }

    // Build advantages/disadvantages as dicts
    // Species auto-advantages are free (0 AP) and always present
    const advantages = {}
    for (const adv of (species?.auto_advantages || [])) {
      advantages[adv] = { ap: 0, auto: true }
    }
    for (const v of vorteile) advantages[v.name] = { ap: v.ap }
    const disadvantages = {}
    for (const n of nachteile) disadvantages[n.name] = { ap: n.ap }

    // Initialize current_vitals to max values
    const currentVitals = {
      lep: derivedValues.LeP_max,
      asp: derivedValues.AsP_max || 0,
      kap: derivedValues.KaP_max || 0,
      schip: derivedValues.SchiP || 3,
    }

    const payload = {
      name: name.trim(),
      species: species?.name || null,
      species_variant: speciesVariant?.name || null,
      culture: culture?.name || null,
      profession: profession?.name || null,
      profession_variant: professionVariant?.name || null,
      experience_grade: grade,
      total_ap: apBudget.total,
      available_ap: apBudget.remaining,
      bio: [nickname && `Spitzname: ${nickname}`, background].filter(Boolean).join('\n\n') || null,
      attributes: finalAttributes,
      derived_values: derivedValues,
      combat_values: { weapons: [] },
      combat_techniques: combatTechniques,
      talents: skills,
      spells: Object.keys(selectedSpells).length > 0 ? selectedSpells : (isEdit ? editCharacter.spells : {}) || {},
      liturgies: Object.keys(selectedLiturgies).length > 0 ? selectedLiturgies : (isEdit ? editCharacter.liturgies : {}) || {},
      special_abilities: [
        ...(profession?.special_abilities || []),
        ...purchasedSAs.map(sa => sa.name),
      ],
      advantages,
      disadvantages,
      languages: culture?.languages || (isEdit ? editCharacter.languages : []) || [],
      basis_inventory: profession?.starting_equipment
        ? { items: profession.starting_equipment, purse: profession.starting_money || {} }
        : (isEdit ? editCharacter.basis_inventory : null) || { items: [] },
      current_vitals: isEdit ? undefined : currentVitals,
    }

    try {
      const url = isEdit ? `/api/characters/${editCharacter.id}` : '/api/characters'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `Fehler ${res.status}`)
      }
      const created = await res.json()
      onCreated?.(created)
    } catch (err) {
      setSubmitError(err.message || 'Charakter konnte nicht gespeichert werden')
    }
    setSubmitting(false)
  }

  // ── Filter helpers ──
  const filteredCultures = useMemo(() => {
    if (!species) return []
    return culturesAll.filter(c => {
      const compat = c.compatible_species || []
      return compat.length === 0 || compat.includes(species.name)
    })
  }, [species, culturesAll])

  const filteredProfessions = useMemo(() => {
    if (!species) return []
    return professionsAll.filter(p => {
      const compat = p.compatible_species || []
      if (compat.length > 0 && !compat.includes(species.name)) return false
      if (p.requires_magic && !speciesMagicCapable) return false
      if (p.requires_blessed && !speciesBlessedCapable) return false
      return true
    })
  }, [species, speciesMagicCapable, speciesBlessedCapable, professionsAll])

  // ────────────────────────────────────────────────────────────────────────
  // Render steps
  // ────────────────────────────────────────────────────────────────────────

  // Default "Nur Grundregeln" toggle: on for beginners, off for experienced
  const defaultGrw = grade === 'unerfahren' || grade === 'durchschnittlich'

  const renderStep = () => {
    switch (step) {
      case 0: return <StepGrade grade={grade} setGrade={setGrade} />
      case 1: return <StepName name={name} setName={setName} nickname={nickname} setNickname={setNickname} />
      case 2: return <StepSpecies species={species} setSpecies={setSpecies} speciesVariant={speciesVariant} setSpeciesVariant={setSpeciesVariant} speciesFreePoints={speciesFreePoints} setSpeciesFreePoints={setSpeciesFreePoints} speciesFreeUsed={speciesFreeUsed} freeAttrPoints={freeAttrPoints} gradeData={gradeData} speciesAll={speciesAll} loading={apiLoading.species} error={apiError.species} onRetry={loadSpecies} />
      case 3: return <StepCulture culture={culture} setCulture={setCulture} cultures={filteredCultures} loading={apiLoading.cultures} error={apiError.cultures} onRetry={loadCultures} />
      case 4: return <StepProfession profession={profession} setProfession={setProfession} professionVariant={professionVariant} setProfessionVariant={setProfessionVariant} professions={filteredProfessions} gradeData={gradeData} loading={apiLoading.professions} error={apiError.professions} onRetry={loadProfessions} talentsAll={talentsAll} defaultGrw={defaultGrw} />
      case 5: return <StepVorNachteile vorteile={vorteile} setVorteile={setVorteile} nachteile={nachteile} setNachteile={setNachteile} apBudget={apBudget} species={species} advantagesAll={advantagesAll} disadvantagesAll={disadvantagesAll} loadingAdv={apiLoading.advantages} loadingDis={apiLoading.disadvantages} errorAdv={apiError.advantages} errorDis={apiError.disadvantages} onRetryAdv={loadAdvantages} onRetryDis={loadDisadvantages} defaultGrw={defaultGrw} />
      case 6: return <StepAttributes baseAttributes={baseAttributes} attrUpgrades={attrUpgrades} setAttrUpgrades={setAttrUpgrades} gradeData={gradeData} apBudget={apBudget} derivedValues={derivedValues} />
      case 7: return <StepTalentsKT baseSkills={baseSkills} talentUpgrades={talentUpgrades} setTalentUpgrades={setTalentUpgrades} baseKT={baseKT} ktUpgrades={ktUpgrades} setKtUpgrades={setKtUpgrades} atPaSplits={atPaSplits} setAtPaSplits={setAtPaSplits} gradeData={gradeData} apBudget={apBudget} isMagic={isMagic} isBlessed={isBlessed} professionSpells={profession?.spells} professionLiturgies={profession?.liturgies} selectedSpells={selectedSpells} setSelectedSpells={setSelectedSpells} selectedLiturgies={selectedLiturgies} setSelectedLiturgies={setSelectedLiturgies} professionSAs={profession?.special_abilities} purchasedSAs={purchasedSAs} setPurchasedSAs={setPurchasedSAs} specialAbilitiesAll={specialAbilitiesAll} loadingSAs={apiLoading.specialAbilities} errorSAs={apiError.specialAbilities} onRetrySAs={loadSpecialAbilities} talentCategories={talentCategories} ktData={ktData} talentsAll={talentsAll} defaultGrw={defaultGrw} />
      case 8: return <StepDerived derivedValues={derivedValues} derivationBreakdown={derivationBreakdown} isMagic={isMagic} isBlessed={isBlessed} />
      case 9: return <StepSummary name={name} nickname={nickname} species={species} culture={culture} profession={profession} grade={grade} gradeData={gradeData} finalAttributes={finalAttributes} derivedValues={derivedValues} derivationBreakdown={derivationBreakdown} apBudget={apBudget} vorteile={vorteile} nachteile={nachteile} isMagic={isMagic} isBlessed={isBlessed} submitError={submitError} baseSkills={baseSkills} talentUpgrades={talentUpgrades} talentCategories={talentCategories} baseKT={baseKT} ktUpgrades={ktUpgrades} ktData={ktData} atPaSplits={atPaSplits} selectedSpells={selectedSpells} selectedLiturgies={selectedLiturgies} purchasedSAs={purchasedSAs} background={background} setBackground={setBackground} />
      default: return null
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // Main layout
  // ────────────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 bg-dsa-bg flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 bg-dsa-bg-light border-b border-dsa-bg-medium px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-dsa-gold" />
            <h1 className="text-base font-display font-bold text-dsa-gold">{isEdit ? 'Charakter bearbeiten' : 'Charakter erstellen'}</h1>
          </div>
          <div className="flex items-center gap-4">
            {gradeData && (
              <div className="text-xs font-mono">
                <span className="text-dsa-parchment-dark">AP: </span>
                <span className={clsx('font-bold', apBudget.remaining < 0 ? 'text-red-400' : 'text-dsa-gold')}>
                  {apBudget.remaining}
                </span>
                <span className="text-dsa-parchment-dark"> verbleibend ({apBudget.total} gesamt)</span>
              </div>
            )}
            <button onClick={onClose} className="p-1 text-dsa-parchment-dark hover:text-dsa-parchment transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Step indicator */}
      <div className="flex-shrink-0 bg-dsa-bg border-b border-dsa-bg-medium px-4 py-2">
        <div className="max-w-3xl mx-auto">
          <div className="relative h-1 bg-dsa-bg-medium rounded-full mb-2">
            <div
              className="absolute h-1 bg-dsa-gold rounded-full transition-all duration-300"
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </div>
          <div className="flex overflow-x-auto gap-1 pb-1 -mb-1">
            {STEPS.map((label, i) => (
              <button
                key={i}
                onClick={() => (isEdit || i < step) && setStep(i)}
                disabled={!isEdit && i > step}
                className={clsx(
                  'text-[10px] whitespace-nowrap px-2 py-1 rounded transition-colors',
                  i === step
                    ? 'bg-dsa-gold/20 text-dsa-gold font-semibold'
                    : i < step
                    ? 'text-dsa-parchment-dark hover:text-dsa-parchment cursor-pointer'
                    : 'text-dsa-parchment-dark/30 cursor-not-allowed'
                )}
              >
                {i + 1}. {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {renderStep()}
        </div>
      </div>

      {/* Footer nav */}
      <footer className="flex-shrink-0 border-t border-dsa-bg-medium bg-dsa-bg-light px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <button
            onClick={goBack}
            disabled={step === 0}
            className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
            Zurück
          </button>
          {step < STEPS.length - 1 ? (
            <button
              onClick={goNext}
              disabled={!canAdvance}
              className="btn-primary flex items-center gap-2 text-sm disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Weiter
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting || apBudget.remaining < 0}
              className="btn-primary flex items-center gap-2 text-sm disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {isEdit ? 'Änderungen speichern' : 'Charakter erstellen'}
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}

// ============================================================================
// Step Components
// ============================================================================

// ── Contextual Help Panel ──
function HelpPanel({ children }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 text-[11px] text-dsa-parchment-dark hover:text-dsa-gold transition-colors"
      >
        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-dsa-bg-medium border border-dsa-bg-medium text-[9px] font-bold">?</span>
        {open ? 'Hilfe ausblenden' : 'Hilfe anzeigen'}
      </button>
      {open && (
        <div className="mt-2 bg-dsa-bg-card border border-dsa-gold/20 rounded p-3 text-xs text-dsa-parchment leading-relaxed space-y-2 animate-fade-in">
          {children}
        </div>
      )}
    </div>
  )
}

// ── Reusable search input ──
function SearchInput({ value, onChange, placeholder }) {
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dsa-parchment-dark/50" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-8 pr-3 py-2 text-xs bg-dsa-bg-card border border-dsa-bg-medium rounded text-dsa-parchment placeholder:text-dsa-parchment-dark/40 focus:outline-none focus:border-dsa-gold/50"
      />
      {value && (
        <button onClick={() => onChange('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-dsa-parchment-dark/50 hover:text-dsa-parchment">
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

// ── Reusable category filter tabs ──
function CategoryTabs({ activeCat, setActiveCat, categoryOrder, categoryMeta, items, getCat }) {
  return (
    <div className="flex flex-wrap gap-1">
      {categoryOrder.map(cat => {
        const meta = categoryMeta[cat]
        const count = cat === 'alle' ? items.length : items.filter(i => getCat(i) === cat).length
        if (cat !== 'alle' && count === 0) return null
        return (
          <button
            key={cat}
            onClick={() => setActiveCat(cat)}
            className={clsx(
              'px-2 py-1 text-[10px] rounded border transition-colors',
              activeCat === cat
                ? 'border-dsa-gold/50 bg-dsa-gold/10 text-dsa-gold font-semibold'
                : 'border-dsa-bg-medium bg-dsa-bg-card text-dsa-parchment-dark hover:border-dsa-gold/30 hover:text-dsa-parchment'
            )}
          >
            {meta.label} ({count})
          </button>
        )
      })}
    </div>
  )
}

// ── Step 1: Erfahrungsgrad ──
function StepGrade({ grade, setGrade }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-display font-semibold text-dsa-gold mb-1">Erfahrungsgrad wählen</h2>
        <p className="text-xs text-dsa-parchment-dark">Der Erfahrungsgrad bestimmt dein Start-AP-Budget und die maximalen Werte.</p>
      </div>
      <HelpPanel>
        <p><strong>Was ist der Erfahrungsgrad?</strong> Er bestimmt, wie viele Abenteuerpunkte (AP) du bei der Erstellung zu verteilen hast. Mehr AP bedeutet ein mächtigerer Held.</p>
        <p><strong>AP verteilen:</strong> Deine AP werden auf Spezies, Kultur, Profession und freie Steigerungen (Attribute, Talente, Kampftechniken, Vor-/Nachteile) aufgeteilt.</p>
        <p><strong>Maximale Werte:</strong> Der Erfahrungsgrad begrenzt auch, wie hoch du Eigenschaften und Talente steigern darfst. "Erfahren" ist ein guter Einstieg.</p>
      </HelpPanel>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Object.entries(ERFAHRUNGSGRADE).map(([key, data]) => (
          <button
            key={key}
            onClick={() => setGrade(key)}
            className={clsx(
              'text-left p-4 rounded border transition-all',
              grade === key
                ? 'border-dsa-gold bg-dsa-gold/10 ring-1 ring-dsa-gold/30'
                : 'border-dsa-bg-medium bg-dsa-bg-card hover:border-dsa-gold/40'
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="font-display font-semibold text-dsa-parchment">{data.label}</span>
                {key === 'erfahren' && (
                  <span className="text-[9px] bg-green-900/30 text-green-400 border border-green-700/30 rounded px-1.5 py-0.5">Empfohlen</span>
                )}
              </div>
              <span className="text-sm font-mono font-bold text-dsa-gold">{data.ap} AP</span>
            </div>
            <div className="text-[10px] text-dsa-parchment-dark space-y-0.5">
              <p>Max. Eigenschaft: {data.attr}</p>
              <p>Max. Talent: {data.skill}</p>
              <p>Max. Kampftechnik: {data.kt}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Step 2: Name & Basics ──
function StepName({ name, setName, nickname, setNickname }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-display font-semibold text-dsa-gold mb-1">Name & Grundlagen</h2>
        <p className="text-xs text-dsa-parchment-dark">Gib deinem Charakter einen Namen.</p>
      </div>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-dsa-parchment mb-1">Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z.B. Alrik von Gareth"
            className="input-field w-full"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-dsa-parchment mb-1">Spitzname</label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Optional"
            className="input-field w-full"
          />
        </div>
      </div>
    </div>
  )
}

// ── Step 3: Species (from API) ──
function StepSpecies({ species, setSpecies, speciesVariant, setSpeciesVariant, speciesFreePoints, setSpeciesFreePoints, speciesFreeUsed, freeAttrPoints, gradeData, speciesAll, loading, error, onRetry }) {
  const [detailSpecies, setDetailSpecies] = useState(null)

  if (error) return <LoadError message={error} onRetry={onRetry} />
  if (loading && speciesAll.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-dsa-parchment-dark">
        <Loader2 className="w-5 h-5 animate-spin" />
        Spezies laden...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-display font-semibold text-dsa-gold mb-1">Spezies wählen</h2>
        <p className="text-xs text-dsa-parchment-dark">Wähle eine Spezies und verteile {freeAttrPoints} freie Eigenschaftspunkte.</p>
      </div>
      <HelpPanel>
        <p><strong>Spezies-Unterschiede:</strong> Jede Spezies hat andere Basis-Attribute, GS (Geschwindigkeit), SK/ZK-Modifikatoren und kostet unterschiedlich viele AP.</p>
        <p><strong>Attributs-Modifikatoren:</strong> Die Zahlenwerte zeigen die Startwerte der 8 Attribute. Goldene Werte weichen vom Menschenstandard (8) ab.</p>
        <p><strong>Freie Punkte:</strong> Nach der Wahl verteilst du freie Eigenschaftspunkte auf beliebige Attribute. Diese erhöhen den Startwert vor weiteren Steigerungen.</p>
        <p><strong>Magisch/Geweiht:</strong> Manche Spezies können Magie wirken (AsP) oder sind geweiht (KaP). Dies bestimmt, welche Professionen dir offenstehen.</p>
      </HelpPanel>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {speciesAll.map((sp) => {
          const baseAttrs = sp.base_attributes || {}
          return (
            <div
              key={sp.id || sp.name}
              onClick={() => setSpecies(sp)}
              className={clsx(
                'text-left p-4 rounded border transition-all cursor-pointer',
                species?.name === sp.name
                  ? 'border-dsa-gold bg-dsa-gold/10 ring-1 ring-dsa-gold/30'
                  : 'border-dsa-bg-medium bg-dsa-bg-card hover:border-dsa-gold/40'
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-display font-semibold text-dsa-parchment">{sp.name}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); setDetailSpecies(sp) }}
                    className="p-1 rounded text-dsa-parchment-dark/50 hover:text-dsa-parchment hover:bg-dsa-bg-medium transition-colors"
                    title="Details anzeigen"
                  >
                    <Info className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-xs font-mono text-dsa-gold">{sp.ap_cost || 0} AP</span>
                </div>
              </div>
              <div className="text-[10px] text-dsa-parchment-dark space-y-0.5">
                <p><TipAbbr term="GS" /> {sp.gs_base || 8} | <TipAbbr term="SK" />-Mod {sp.sk_modifier || 0} | <TipAbbr term="ZK" />-Mod {sp.zk_modifier || 0}</p>
                <p className="flex flex-wrap gap-1">
                  {ATTR_KEYS.map(k => (
                    <span key={k} className={clsx('font-mono', (baseAttrs[k] || 8) !== 8 && 'text-dsa-gold')}>
                      {k}:{baseAttrs[k] || 8}
                    </span>
                  ))}
                </p>
                {sp.magic_capable && <p className="text-dsa-mana">Magisch begabt</p>}
                {sp.blessed_capable && <p className="text-dsa-karma">Geweiht</p>}
                {sp.description && <p className="text-dsa-parchment-dark/50 italic line-clamp-2">{sp.description}</p>}
              </div>
            </div>
          )
        })}
      </div>

      {/* Species Detail Modal */}
      {detailSpecies && <SpeciesDetailModal sp={detailSpecies} onClose={() => setDetailSpecies(null)} />}

      {/* Species Variant picker */}
      {species && Array.isArray(species.variants) && species.variants.length > 0 && (
        <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4 space-y-3">
          <div>
            <h3 className="text-sm font-display font-semibold text-dsa-parchment">Variante wählen</h3>
            <p className="text-[10px] text-dsa-parchment-dark">Optional: Wähle eine Untervariante deiner Spezies.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              onClick={() => setSpeciesVariant(null)}
              className={clsx(
                'text-left p-3 rounded border transition-all text-xs',
                !speciesVariant
                  ? 'border-dsa-gold bg-dsa-gold/10 ring-1 ring-dsa-gold/30'
                  : 'border-dsa-bg-medium bg-dsa-bg hover:border-dsa-gold/40'
              )}
            >
              <span className="font-semibold text-dsa-parchment">Keine Variante</span>
              <p className="text-[10px] text-dsa-parchment-dark mt-0.5">Standard-{species.name}</p>
            </button>
            {species.variants.map(v => (
              <button
                key={v.id || v.name}
                onClick={() => setSpeciesVariant(v)}
                className={clsx(
                  'text-left p-3 rounded border transition-all text-xs',
                  speciesVariant?.id === v.id
                    ? 'border-dsa-gold bg-dsa-gold/10 ring-1 ring-dsa-gold/30'
                    : 'border-dsa-bg-medium bg-dsa-bg hover:border-dsa-gold/40'
                )}
              >
                <span className="font-semibold text-dsa-parchment">{v.name}</span>
                {v.common_advantages && (
                  <p className="text-[10px] text-green-400/70 mt-0.5">Übliche Vorteile: {v.common_advantages}</p>
                )}
                {v.common_disadvantages && (
                  <p className="text-[10px] text-red-400/70">Übliche Nachteile: {v.common_disadvantages}</p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Free point allocation */}
      {species && (
        <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-display font-semibold text-dsa-parchment">Freie Eigenschaftspunkte</h3>
            <span className={clsx('text-xs font-mono font-bold', speciesFreeUsed === freeAttrPoints ? 'text-green-400' : 'text-dsa-gold')}>
              {speciesFreeUsed}/{freeAttrPoints} verteilt
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {ATTR_KEYS.map(attr => {
              const specBase = species.base_attributes?.[attr] || 8
              const delta = speciesFreePoints[attr] || 0
              const val = specBase + delta
              const atMax = gradeData && val >= gradeData.attr
              return (
                <div key={attr} className="flex items-center justify-between bg-dsa-bg rounded p-2">
                  <div>
                    <span className={clsx('text-xs font-semibold', ATTR_META[attr].color)}>{attr}</span>
                    <span className="text-xs text-dsa-parchment-dark ml-1">{val}</span>
                  </div>
                  <IncDec
                    value={delta}
                    onInc={() => setSpeciesFreePoints(p => ({ ...p, [attr]: delta + 1 }))}
                    onDec={() => {
                      setSpeciesFreePoints(p => {
                        const next = { ...p, [attr]: delta - 1 }
                        if (next[attr] <= 0) delete next[attr]
                        return next
                      })
                    }}
                    disableInc={speciesFreeUsed >= freeAttrPoints || atMax}
                    disableDec={delta <= 0}
                  />
                </div>
              )
            })}
          </div>
          {gradeData && Object.entries(speciesFreePoints).some(([attr, d]) => {
            const val = (species.base_attributes?.[attr] || 8) + d
            return val > gradeData.attr
          }) && (
            <div className="flex items-center gap-2 text-xs text-red-400">
              <AlertTriangle className="w-3.5 h-3.5" />
              Eigenschaft überschreitet Grenzwert des Erfahrungsgrads!
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Step 4: Culture (from API) ──
function StepCulture({ culture, setCulture, cultures, loading, error, onRetry }) {
  const [searchText, setSearchText] = useState('')
  const [detailCulture, setDetailCulture] = useState(null)

  const filtered = useMemo(() => {
    const q = searchText.toLowerCase().trim()
    if (!q) return cultures
    return cultures.filter(c => c.name.toLowerCase().includes(q))
  }, [cultures, searchText])

  if (error) return <LoadError message={error} onRetry={onRetry} />
  if (loading && cultures.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-dsa-parchment-dark">
        <Loader2 className="w-5 h-5 animate-spin" />
        Kulturen laden...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-display font-semibold text-dsa-gold mb-1">Kultur wählen</h2>
        <p className="text-xs text-dsa-parchment-dark">Wähle die Kultur, in der dein Charakter aufgewachsen ist.</p>
      </div>
      <HelpPanel>
        <p><strong>Was ist eine Kultur?</strong> Sie repräsentiert, wo und wie dein Held aufgewachsen ist. Die Kultur gibt Boni auf bestimmte Talente und bestimmt die Muttersprache.</p>
        <p><strong>Talent-Boni:</strong> Die angezeigten Talent-Boni werden automatisch als Basiswerte übernommen. Du kannst diese Talente später noch weiter steigern.</p>
        <p><strong>Sprachen:</strong> Sprachen bestimmen, mit wem sich dein Held verständigen kann. Die meisten Kulturen geben Garethi (Handelssprache) als Muttersprache.</p>
      </HelpPanel>
      {cultures.length === 0 ? (
        <p className="text-sm text-dsa-parchment-dark">Keine passenden Kulturen für diese Spezies.</p>
      ) : (
        <>
          <SearchInput value={searchText} onChange={setSearchText} placeholder="Kultur suchen..." />
          <p className="text-[10px] text-dsa-parchment-dark/60">
            {filtered.length} von {cultures.length} Kulturen
          </p>
          {filtered.length === 0 ? (
            <p className="text-xs text-dsa-parchment-dark/60 py-4 text-center">Keine Treffer für diese Suche.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filtered.map((c) => {
                const langs = (c.languages || []).map(l => typeof l === 'string' ? l : `${l.name} (${l.level})`).join(', ')
                return (
                  <div
                    key={c.id || c.name}
                    onClick={() => setCulture(c)}
                    className={clsx(
                      'text-left p-4 rounded border transition-all cursor-pointer',
                      culture?.name === c.name
                        ? 'border-dsa-gold bg-dsa-gold/10 ring-1 ring-dsa-gold/30'
                        : 'border-dsa-bg-medium bg-dsa-bg-card hover:border-dsa-gold/40'
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-display font-semibold text-dsa-parchment">{c.name}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); setDetailCulture(c) }}
                          className="p-1 rounded text-dsa-parchment-dark/50 hover:text-dsa-parchment hover:bg-dsa-bg-medium transition-colors"
                          title="Details anzeigen"
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-xs font-mono text-dsa-gold">{c.ap_cost || 0} <TipAbbr term="AP" /></span>
                      </div>
                    </div>
                    <div className="text-[10px] text-dsa-parchment-dark space-y-0.5">
                      {c.skill_bonuses && Object.keys(c.skill_bonuses).length > 0 && (
                        <p>Talente: {Object.entries(c.skill_bonuses).map(([k,v]) => `${k} +${v}`).join(', ')}</p>
                      )}
                      {langs && <p>Sprachen: {langs}</p>}
                      {c.description && <p className="text-dsa-parchment-dark/50 italic line-clamp-2">{c.description}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Culture Detail Modal */}
      {detailCulture && <CultureDetailModal c={detailCulture} onClose={() => setDetailCulture(null)} />}
    </div>
  )
}

// ── Profession Detail Modal ──
function ProfessionDetailModal({ prof, onClose, talentsAll }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  if (!prof) return null

  const ct = prof.combat_techniques || {}
  const skills = prof.skills || {}
  const sas = prof.special_abilities || []
  const spells = prof.spells || {}
  const liturgies = prof.liturgies || {}
  const equipment = prof.starting_equipment || []
  const money = prof.starting_money || {}
  const variants = prof.variants || []
  const catMeta = PROF_CATEGORY_META[getProfCategory(prof)]

  // Build talent name → category lookup from talentsAll
  const talentCatMap = useMemo(() => {
    const m = {}
    for (const t of talentsAll) m[t.name] = t.category || 'handwerk'
    return m
  }, [talentsAll])

  // Group skills by talent category
  const skillsByCategory = useMemo(() => {
    const grouped = {}
    for (const [name, fw] of Object.entries(skills)) {
      const cat = talentCatMap[name] || 'handwerk'
      if (!grouped[cat]) grouped[cat] = []
      grouped[cat].push({ name, fw })
    }
    // Sort within each category
    for (const cat of Object.keys(grouped)) grouped[cat].sort((a, b) => a.name.localeCompare(b.name))
    return grouped
  }, [skills, talentCatMap])

  // Money display helper
  const moneyParts = []
  if (money.dukaten) moneyParts.push(`${money.dukaten} D`)
  if (money.silber) moneyParts.push(`${money.silber} S`)
  if (money.heller) moneyParts.push(`${money.heller} H`)
  if (money.kreuzer) moneyParts.push(`${money.kreuzer} K`)

  // Prerequisites
  const prereqs = []
  if (prof.requires_magic) prereqs.push('Magiebegabung erforderlich')
  if (prof.requires_blessed) prereqs.push('Weihe erforderlich')
  if (prof.compatible_species && prof.compatible_species.length > 0) {
    prereqs.push(`Spezies: ${prof.compatible_species.join(', ')}`)
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="relative z-10 bg-dsa-bg border border-dsa-bg-medium rounded-xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Hero header */}
        <div className="px-5 py-4 bg-gradient-to-r from-dsa-gold/15 via-dsa-gold/5 to-transparent flex-shrink-0 rounded-t-xl border-b border-dsa-bg-medium">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-display font-bold leading-tight mb-1 text-dsa-gold truncate">
                {prof.name}
              </h2>
              {prof.name_f && prof.name_f !== prof.name && (
                <p className="text-xs text-dsa-parchment-dark mb-1">weiblich: {prof.name_f}</p>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={clsx('text-xs px-2 py-0.5 rounded-full border', catMeta.color, 'border-current/20 bg-current/5')}
                  style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
                >
                  {catMeta.label}
                </span>
                <span className="text-xs font-mono text-dsa-gold">{prof.ap_cost || 0} AP</span>
                {BEGINNER_PROFESSIONS.has(prof.name) && (
                  <span className="text-[9px] bg-green-900/30 text-green-400 border border-green-700/30 rounded px-1.5 py-0.5">Einsteiger</span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-dsa-parchment-dark hover:text-dsa-parchment transition-colors rounded shrink-0"
              title="Schließen"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4 text-xs">
          {/* Description */}
          {prof.description && (
            <div>
              <p className="text-dsa-parchment/80 italic">{prof.description}</p>
            </div>
          )}

          {/* Prerequisites */}
          {prereqs.length > 0 && (
            <Section title="Voraussetzungen">
              <ul className="space-y-0.5">
                {prereqs.map((r, i) => (
                  <li key={i} className="text-dsa-parchment-dark flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3 text-yellow-500 shrink-0" />
                    {r}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Combat Techniques */}
          {Object.keys(ct).length > 0 && (
            <Section title="Kampftechniken" icon={<Swords className="w-3.5 h-3.5 text-red-400" />}>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                {Object.entries(ct).sort(([,a],[,b]) => b - a).map(([name, val]) => (
                  <div key={name} className="flex items-center justify-between">
                    <span className="text-dsa-parchment">{name}</span>
                    <span className="font-mono text-dsa-gold">{val}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Talents grouped by category */}
          {Object.keys(skills).length > 0 && (
            <Section title="Talente" icon={<BookOpen className="w-3.5 h-3.5 text-blue-400" />}>
              {TALENT_CATEGORY_ORDER.filter(cat => skillsByCategory[cat]).map(cat => {
                const meta = TALENT_CATEGORY_META[cat]
                return (
                  <div key={cat} className="mb-2 last:mb-0">
                    <p className={clsx('text-[10px] font-semibold mb-0.5', meta?.color || 'text-dsa-parchment')}>{meta?.label || cat}</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                      {skillsByCategory[cat].map(({ name, fw }) => (
                        <div key={name} className="flex items-center justify-between">
                          <span className="text-dsa-parchment truncate">{name}</span>
                          <span className="font-mono text-dsa-gold shrink-0 ml-1">{fw}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
              {/* Uncategorized talents */}
              {Object.keys(skillsByCategory).filter(c => !TALENT_CATEGORY_ORDER.includes(c)).map(cat => (
                <div key={cat} className="mb-2 last:mb-0">
                  <p className="text-[10px] font-semibold mb-0.5 text-dsa-parchment">{cat}</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                    {skillsByCategory[cat].map(({ name, fw }) => (
                      <div key={name} className="flex items-center justify-between">
                        <span className="text-dsa-parchment truncate">{name}</span>
                        <span className="font-mono text-dsa-gold shrink-0 ml-1">{fw}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </Section>
          )}

          {/* Special Abilities */}
          {sas.length > 0 && (
            <Section title="Sonderfertigkeiten" icon={<Shield className="w-3.5 h-3.5 text-cyan-400" />}>
              <div className="flex flex-wrap gap-1.5">
                {sas.map((sa, i) => (
                  <span key={i} className="px-2 py-0.5 rounded bg-dsa-bg-medium text-dsa-parchment border border-dsa-bg-medium">
                    {sa}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Spells */}
          {Object.keys(spells).length > 0 && (
            <Section title="Zauber" icon={<Sparkles className="w-3.5 h-3.5 text-dsa-mana" />}>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                {Object.entries(spells).sort(([a],[b]) => a.localeCompare(b)).map(([name, fw]) => (
                  <div key={name} className="flex items-center justify-between">
                    <span className="text-dsa-mana-light truncate">{name}</span>
                    <span className="font-mono text-dsa-mana shrink-0 ml-1">FW {fw}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Liturgies */}
          {Object.keys(liturgies).length > 0 && (
            <Section title="Liturgien" icon={<Sparkles className="w-3.5 h-3.5 text-dsa-karma" />}>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                {Object.entries(liturgies).sort(([a],[b]) => a.localeCompare(b)).map(([name, fw]) => (
                  <div key={name} className="flex items-center justify-between">
                    <span className="text-dsa-karma-light truncate">{name}</span>
                    <span className="font-mono text-dsa-karma shrink-0 ml-1">FW {fw}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Starting Equipment */}
          {equipment.length > 0 && (
            <Section title="Startausrüstung" icon={<Shield className="w-3.5 h-3.5 text-dsa-forest-light" />}>
              <div className="flex flex-wrap gap-1.5">
                {equipment.map((item, i) => {
                  const label = typeof item === 'string' ? item
                    : item.name || item.template_id || 'Gegenstand'
                  const qty = typeof item === 'object' && item.quantity > 1 ? ` x${item.quantity}` : ''
                  return (
                    <span key={i} className="px-2 py-0.5 rounded bg-dsa-bg-medium text-dsa-parchment border border-dsa-bg-medium text-[10px]">
                      {label}{qty}
                    </span>
                  )
                })}
              </div>
            </Section>
          )}

          {/* Starting Money */}
          {moneyParts.length > 0 && (
            <Section title="Startgeld" icon={<Coins className="w-3.5 h-3.5 text-dsa-gold" />}>
              <p className="text-dsa-gold font-mono">{moneyParts.join(' / ')}</p>
            </Section>
          )}

          {/* Variants */}
          {variants.length > 0 && (
            <Section title={`Varianten (${variants.length})`}>
              <div className="space-y-2">
                {variants.map((v, i) => (
                  <div key={v.id || i} className="p-2 rounded border border-dsa-bg-medium bg-dsa-bg-card">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-semibold text-dsa-parchment">{v.name}</span>
                      {v.ap_cost != null && v.ap_cost !== 0 && (
                        <span className={clsx('font-mono text-[10px]', v.ap_cost > 0 ? 'text-red-400' : 'text-green-400')}>
                          {v.ap_cost > 0 ? '+' : ''}{v.ap_cost} AP
                        </span>
                      )}
                    </div>
                    {v.skills && Object.keys(v.skills).length > 0 && (
                      <p className="text-[10px] text-dsa-parchment-dark">
                        Talente: {Object.entries(v.skills).map(([k, val]) => `${k} ${val > 0 ? '+' : ''}${val}`).join(', ')}
                      </p>
                    )}
                    {v.combat_techniques && Object.keys(v.combat_techniques).length > 0 && (
                      <p className="text-[10px] text-dsa-parchment-dark">
                        KT: {Object.entries(v.combat_techniques).map(([k, val]) => `${k} ${val > 0 ? '+' : ''}${val}`).join(', ')}
                      </p>
                    )}
                    {v.note && <p className="text-[10px] text-dsa-parchment-dark/60 italic">{v.note}</p>}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Source */}
          {prof.source_book && (
            <p className="text-[10px] text-dsa-parchment-dark/40 pt-2 border-t border-dsa-bg-medium">Quelle: {prof.source_book}</p>
          )}
        </div>
      </div>
    </div>
  )
}

// Small helper for modal sections
function Section({ title, icon, children }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon}
        <h3 className="text-[11px] font-semibold text-dsa-parchment uppercase tracking-wide">{title}</h3>
      </div>
      {children}
    </div>
  )
}

// ── Reusable detail modal shell ──
function DetailModalShell({ onClose, title, subtitle, headerExtra, children }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="relative z-10 bg-dsa-bg border border-dsa-bg-medium rounded-xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 bg-gradient-to-r from-dsa-gold/15 via-dsa-gold/5 to-transparent flex-shrink-0 rounded-t-xl border-b border-dsa-bg-medium">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-display font-bold leading-tight mb-1 text-dsa-gold truncate">{title}</h2>
              {subtitle && <p className="text-xs text-dsa-parchment-dark mb-1">{subtitle}</p>}
              {headerExtra}
            </div>
            <button onClick={onClose} className="p-1.5 text-dsa-parchment-dark hover:text-dsa-parchment transition-colors rounded shrink-0" title="Schließen">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4 text-xs">
          {children}
        </div>
      </div>
    </div>
  )
}

// ── Species Detail Modal ──
function SpeciesDetailModal({ sp, onClose }) {
  if (!sp) return null
  const baseAttrs = sp.base_attributes || {}
  const adjustments = sp.attribute_adjustments || []
  const autoAdvs = sp.auto_advantages || []
  const variants = sp.variants || []

  return (
    <DetailModalShell
      onClose={onClose}
      title={sp.name}
      headerExtra={
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-dsa-gold">{sp.ap_cost || 0} AP</span>
        </div>
      }
    >
      {sp.description && <p className="text-dsa-parchment/80 italic">{sp.description}</p>}

      <Section title="Grundwerte">
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          <div className="flex justify-between"><span className="text-dsa-parchment-dark"><TipAbbr term="LeP" /> Basis</span><span className="font-mono text-dsa-gold">{sp.lep_base || 0}</span></div>
          <div className="flex justify-between"><span className="text-dsa-parchment-dark"><TipAbbr term="GS" /> Basis</span><span className="font-mono text-dsa-gold">{sp.gs_base || 8}</span></div>
          <div className="flex justify-between"><span className="text-dsa-parchment-dark"><TipAbbr term="SK" /> Mod.</span><span className="font-mono text-dsa-gold">{sp.sk_modifier ?? sp.sk_base ?? 0}</span></div>
          <div className="flex justify-between"><span className="text-dsa-parchment-dark"><TipAbbr term="ZK" /> Mod.</span><span className="font-mono text-dsa-gold">{sp.zk_modifier ?? sp.zk_base ?? 0}</span></div>
        </div>
      </Section>

      <Section title="Basisattribute">
        <div className="grid grid-cols-4 gap-2">
          {ATTR_KEYS.map(k => (
            <div key={k} className="flex items-center justify-between bg-dsa-bg rounded px-2 py-1">
              <span className={clsx('font-semibold', ATTR_META[k].color)}>{k}</span>
              <span className={clsx('font-mono', (baseAttrs[k] || 8) !== 8 ? 'text-dsa-gold' : 'text-dsa-parchment')}>{baseAttrs[k] || 8}</span>
            </div>
          ))}
        </div>
      </Section>

      {adjustments.length > 0 && (
        <Section title="Eigenschaftsmodifikatoren">
          <div className="space-y-0.5">
            {adjustments.map((adj, i) =>
              adj.choice ? (
                <p key={i} className="text-dsa-parchment-dark">Wahl: +{adj.value} auf {(adj.options || []).join(', ')}</p>
              ) : (
                <p key={i} className="text-dsa-parchment-dark">{adj.attr} {adj.value > 0 ? '+' : ''}{adj.value}</p>
              )
            )}
          </div>
        </Section>
      )}

      {autoAdvs.length > 0 && (
        <Section title="Automatische Vorteile">
          <div className="flex flex-wrap gap-1.5">
            {autoAdvs.map(name => (
              <span key={name} className="px-2 py-0.5 rounded bg-green-900/20 text-green-400 border border-green-800/30">{name}</span>
            ))}
          </div>
        </Section>
      )}

      {sp.common_cultures && sp.common_cultures.length > 0 && (
        <Section title="Kompatible Kulturen">
          <p className="text-dsa-parchment-dark">{sp.common_cultures.length} Kulturen verfügbar</p>
        </Section>
      )}

      {variants.length > 0 && (
        <Section title={`Varianten (${variants.length})`}>
          <div className="space-y-2">
            {variants.map((v, i) => (
              <div key={v.id || i} className="p-2 rounded border border-dsa-bg-medium bg-dsa-bg-card">
                <span className="font-semibold text-dsa-parchment">{v.name}</span>
                {v.common_advantages && <p className="text-[10px] text-green-400/70 mt-0.5">Übliche Vorteile: {v.common_advantages}</p>}
                {v.common_disadvantages && <p className="text-[10px] text-red-400/70">Übliche Nachteile: {v.common_disadvantages}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}

      <div className="flex items-center gap-3 text-[10px] text-dsa-parchment-dark/50 pt-2 border-t border-dsa-bg-medium">
        {sp.magic_capable && <span className="text-dsa-mana">Magisch begabt</span>}
        {sp.blessed_capable && <span className="text-dsa-karma">Geweiht</span>}
      </div>
    </DetailModalShell>
  )
}

// ── Culture Detail Modal ──
function CultureDetailModal({ c, onClose }) {
  if (!c) return null
  const langs = (c.languages || []).map(l => typeof l === 'string' ? l : `${l.name} (Stufe ${l.level})`).join(', ')
  const scripts = (c.scripts || []).join(', ')
  const skills = c.skill_bonuses || {}

  return (
    <DetailModalShell
      onClose={onClose}
      title={c.name}
      headerExtra={
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-dsa-gold">{c.ap_cost || 0} AP</span>
          {c.source_book && <span className="text-[10px] text-dsa-parchment-dark/50">{c.source_book}</span>}
        </div>
      }
    >
      {c.description && <p className="text-dsa-parchment/80 italic">{c.description}</p>}

      {Object.keys(skills).length > 0 && (
        <Section title="Kulturpaket (Talentboni)" icon={<BookOpen className="w-3.5 h-3.5 text-blue-400" />}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            {Object.entries(skills).sort(([a],[b]) => a.localeCompare(b)).map(([name, val]) => (
              <div key={name} className="flex items-center justify-between">
                <span className="text-dsa-parchment truncate">{name}</span>
                <span className="font-mono text-dsa-gold shrink-0 ml-1">+{val}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {langs && (
        <Section title="Sprachen">
          <p className="text-dsa-parchment">{langs}</p>
        </Section>
      )}

      {scripts && (
        <Section title="Schriften">
          <p className="text-dsa-parchment">{scripts}</p>
        </Section>
      )}

      {c.compatible_species && c.compatible_species.length > 0 && (
        <Section title="Kompatible Spezies">
          <div className="flex flex-wrap gap-1.5">
            {c.compatible_species.map(name => (
              <span key={name} className="px-2 py-0.5 rounded bg-dsa-bg-medium text-dsa-parchment border border-dsa-bg-medium">{name}</span>
            ))}
          </div>
        </Section>
      )}
    </DetailModalShell>
  )
}

// ── Advantage/Disadvantage Detail Modal ──
function AdvDisDetailModal({ item, onClose, isAdvantage }) {
  if (!item) return null
  const catMeta = ADV_CATEGORY_META[item.category] || ADV_CATEGORY_META.allgemein

  return (
    <DetailModalShell
      onClose={onClose}
      title={item.name}
      headerExtra={
        <div className="flex items-center gap-2 flex-wrap">
          <span className={clsx('text-xs px-2 py-0.5 rounded-full border', catMeta.color, 'border-current/20')} style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
            {catMeta.label}
          </span>
          <span className={clsx('text-xs font-mono', isAdvantage ? 'text-red-400' : 'text-green-400')}>
            {item.ap_cost || item.ap || 0} AP
          </span>
          {item.levels > 1 && (
            <span className="text-[10px] text-dsa-parchment-dark">bis Stufe {item.levels}</span>
          )}
        </div>
      }
    >
      {item.rules_text && (
        <Section title="Regel">
          <p className="text-dsa-parchment/80 leading-relaxed whitespace-pre-line">{item.rules_text}</p>
        </Section>
      )}

      {!item.rules_text && item.description && (
        <Section title="Beschreibung">
          <p className="text-dsa-parchment/80 leading-relaxed">{item.description}</p>
        </Section>
      )}

      {item.prerequisites && typeof item.prerequisites === 'object' && Object.keys(item.prerequisites).length > 0 && (
        <Section title="Voraussetzungen">
          <p className="text-dsa-parchment-dark">{JSON.stringify(item.prerequisites)}</p>
        </Section>
      )}

      {item.source_book && (
        <p className="text-[10px] text-dsa-parchment-dark/40 pt-2 border-t border-dsa-bg-medium">Quelle: {item.source_book}</p>
      )}
    </DetailModalShell>
  )
}

// ── Talent Detail Modal ──
function TalentDetailModal({ talent, onClose }) {
  if (!talent) return null
  const catMeta = TALENT_CATEGORY_META[talent.category] || { label: talent.category, color: 'text-dsa-parchment' }

  return (
    <DetailModalShell
      onClose={onClose}
      title={talent.name}
      headerExtra={
        <div className="flex items-center gap-2 flex-wrap">
          <span className={clsx('text-xs', catMeta.color)}>{catMeta.label}</span>
          {talent.improvement_cost && <span className="text-[10px] text-dsa-parchment-dark"><TipAbbr term="SF" /> {talent.improvement_cost}</span>}
        </div>
      }
    >
      {talent.probe && talent.probe.length > 0 && (
        <Section title="Probe (3W20)">
          <div className="flex items-center gap-2">
            {talent.probe.map((attr, i) => (
              <span key={i} className={clsx('font-mono font-semibold px-2 py-1 rounded bg-dsa-bg-medium', ATTR_META[attr]?.color || 'text-dsa-parchment')}>
                {attr}
              </span>
            ))}
          </div>
        </Section>
      )}

      {talent.applications && talent.applications.length > 0 && (
        <Section title="Einsatzgebiete">
          <div className="flex flex-wrap gap-1.5">
            {talent.applications.map((app, i) => (
              <span key={i} className="px-2 py-0.5 rounded bg-dsa-bg-medium text-dsa-parchment border border-dsa-bg-medium">
                {typeof app === 'string' ? app : app.name || app}
              </span>
            ))}
          </div>
        </Section>
      )}

      <Section title="Behinderung">
        <p className="text-dsa-parchment">{talent.encumbrance === 'ja' ? 'Ja (BE wirkt als Erschwernis)' : talent.encumbrance === 'nein' ? 'Nein' : talent.encumbrance || 'Nein'}</p>
      </Section>

      {talent.description && (
        <Section title="Beschreibung">
          <p className="text-dsa-parchment/80 leading-relaxed">{talent.description}</p>
        </Section>
      )}
    </DetailModalShell>
  )
}

// ── GRW (Grundregeln) Toggle ──
function GrwToggle({ checked, onChange }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <span className="relative">
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-8 h-4 rounded-full bg-dsa-bg-medium peer-checked:bg-dsa-gold/40 transition-colors" />
        <div className="absolute left-0.5 top-0.5 w-3 h-3 rounded-full bg-dsa-parchment-dark peer-checked:bg-dsa-gold peer-checked:translate-x-4 transition-all" />
      </span>
      <span className="text-[10px] text-dsa-parchment-dark">Nur Grundregeln</span>
    </label>
  )
}

// ── Helper: check if entity is from core rulebook ──
function isGrundregeln(entity) {
  const sb = entity?.source_book
  if (!sb) return false
  return sb === 'Regelwerk' || sb === 'Grundregelwerk' || sb.includes('US25001')
}

// ── Step 5: Profession (from API) ──
function StepProfession({ profession, setProfession, professionVariant, setProfessionVariant, professions, gradeData, loading, error, onRetry, talentsAll, defaultGrw }) {
  const [searchText, setSearchText] = useState('')
  const [activeCat, setActiveCat] = useState('alle')
  const [detailProf, setDetailProf] = useState(null)
  const [grwOnly, setGrwOnly] = useState(defaultGrw ?? false)

  const displayProfs = useMemo(() => {
    if (!grwOnly) return professions
    return professions.filter(p => isGrundregeln(p))
  }, [professions, grwOnly])

  const filtered = useMemo(() => {
    const q = searchText.toLowerCase().trim()
    const result = displayProfs.filter(p => {
      if (activeCat !== 'alle' && getProfCategory(p) !== activeCat) return false
      if (q && !p.name.toLowerCase().includes(q)) return false
      return true
    })
    // Sort beginner-recommended professions first when no search is active
    if (!q) {
      result.sort((a, b) => {
        const aB = BEGINNER_PROFESSIONS.has(a.name) ? 0 : 1
        const bB = BEGINNER_PROFESSIONS.has(b.name) ? 0 : 1
        return aB - bB
      })
    }
    return result
  }, [displayProfs, searchText, activeCat])

  if (error) return <LoadError message={error} onRetry={onRetry} />
  if (loading && professions.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-dsa-parchment-dark">
        <Loader2 className="w-5 h-5 animate-spin" />
        Professionen laden...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-display font-semibold text-dsa-gold mb-1">Profession wählen</h2>
        <p className="text-xs text-dsa-parchment-dark">Wähle die Profession deines Charakters. Klicke auf <Info className="inline w-3 h-3 text-dsa-parchment-dark/60" /> für alle Details.</p>
      </div>
      <HelpPanel>
        <p><strong>Was ist eine Profession?</strong> Dein Beruf/Ausbildung vor dem Abenteuerdasein. Sie gibt dir Kampftechniken, Talente und ggf. Sonderfertigkeiten und Zauber/Liturgien.</p>
        <p><strong>Kampftechniken (<TipAbbr term="KT" className="text-dsa-parchment" />):</strong> Bestimmen, wie gut dein Held mit bestimmten Waffengattungen umgehen kann. Höhere KT-Werte = bessere <TipAbbr term="AT" className="text-dsa-parchment" />/<TipAbbr term="PA" className="text-dsa-parchment" />-Werte.</p>
        <p><strong>Talente:</strong> Fähigkeiten wie Klettern, Heilkunde oder Überreden. Die Profession gibt Startwerte, die du später weiter steigern kannst.</p>
        <p><strong>Sonderfertigkeiten (<TipAbbr term="SF" className="text-dsa-parchment" />):</strong> Spezielle Fähigkeiten wie Wuchtschlag oder Rüstungsgewöhnung, die im Kampf oder Abenteuer Vorteile bringen.</p>
      </HelpPanel>
      {professions.length === 0 ? (
        <p className="text-sm text-dsa-parchment-dark">Keine passenden Professionen für diese Spezies.</p>
      ) : (
        <>
          <SearchInput value={searchText} onChange={setSearchText} placeholder="Profession suchen..." />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CategoryTabs
              activeCat={activeCat}
              setActiveCat={setActiveCat}
              categoryOrder={PROF_CATEGORY_ORDER}
              categoryMeta={PROF_CATEGORY_META}
              items={displayProfs}
              getCat={getProfCategory}
            />
            <GrwToggle checked={grwOnly} onChange={setGrwOnly} />
          </div>
          <p className="text-[10px] text-dsa-parchment-dark/60">
            {filtered.length} von {displayProfs.length} Professionen
          </p>
          {filtered.length === 0 ? (
            <p className="text-xs text-dsa-parchment-dark/60 py-4 text-center">Keine Treffer für diese Suche.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filtered.map((p) => {
                const ct = p.combat_techniques || {}
                const hasOverLimit = gradeData && Object.values(ct).some(v => v > gradeData.kt)
                const skillEntries = p.skills ? Object.keys(p.skills) : []
                const catMeta = PROF_CATEGORY_META[getProfCategory(p)]
                return (
                  <div
                    key={p.id || p.name}
                    className={clsx(
                      'text-left p-4 rounded border transition-all cursor-pointer',
                      profession?.name === p.name
                        ? 'border-dsa-gold bg-dsa-gold/10 ring-1 ring-dsa-gold/30'
                        : 'border-dsa-bg-medium bg-dsa-bg-card hover:border-dsa-gold/40'
                    )}
                    onClick={() => setProfession(p)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <span className="font-display font-semibold text-dsa-parchment">{p.name}</span>
                        <span className={clsx('text-[9px] shrink-0', catMeta.color)}>{catMeta.label}</span>
                        {BEGINNER_PROFESSIONS.has(p.name) && (
                          <span className="text-[9px] bg-green-900/30 text-green-400 border border-green-700/30 rounded px-1.5 py-0.5 shrink-0">Einsteiger</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); setDetailProf(p) }}
                          className="p-1 rounded text-dsa-parchment-dark/50 hover:text-dsa-parchment hover:bg-dsa-bg-medium transition-colors"
                          title="Details anzeigen"
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-xs font-mono text-dsa-gold">{p.ap_cost || 0} <TipAbbr term="AP" /></span>
                      </div>
                    </div>
                    {PROFESSION_GAMEPLAY_TAGS[p.name] && (
                      <p className="text-[10px] text-dsa-parchment/70 mb-1">{PROFESSION_GAMEPLAY_TAGS[p.name]}</p>
                    )}
                    <div className="text-[10px] text-dsa-parchment-dark space-y-0.5">
                      {Object.keys(ct).length > 0 && (
                        <p>KT: {Object.entries(ct).map(([k,v]) => `${k} ${v}`).join(', ')}</p>
                      )}
                      {skillEntries.length > 0 && (
                        <p className="line-clamp-1">Talente: {skillEntries.join(', ')}</p>
                      )}
                      {(p.special_abilities || []).length > 0 && (
                        <p className="line-clamp-1">SF: {p.special_abilities.join(', ')}</p>
                      )}
                      {p.requires_magic && <p className="text-dsa-mana">Erfordert Magiebegabung</p>}
                      {p.requires_blessed && <p className="text-dsa-karma">Erfordert Weihe</p>}
                      {hasOverLimit && (
                        <p className="flex items-center gap-1 text-yellow-400">
                          <AlertTriangle className="w-3 h-3" />
                          Wert überschreitet Grenzwert des Erfahrungsgrads
                        </p>
                      )}
                      {p.description && <p className="text-dsa-parchment-dark/50 italic line-clamp-2">{p.description}</p>}
                      {Array.isArray(p.variants) && p.variants.length > 0 && (
                        <p className="text-dsa-gold/60 text-[9px]">{p.variants.length} Variante(n) verfügbar</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Profession Variant picker */}
      {profession && Array.isArray(profession.variants) && profession.variants.length > 0 && (
        <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4 space-y-3">
          <div>
            <h3 className="text-sm font-display font-semibold text-dsa-parchment">Professionsvariante wählen</h3>
            <p className="text-[10px] text-dsa-parchment-dark">Optional: Wähle eine Spezialisierung der Profession. Dies kann die AP-Kosten und Talentwerte ändern.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              onClick={() => setProfessionVariant(null)}
              className={clsx(
                'text-left p-3 rounded border transition-all text-xs',
                !professionVariant
                  ? 'border-dsa-gold bg-dsa-gold/10 ring-1 ring-dsa-gold/30'
                  : 'border-dsa-bg-medium bg-dsa-bg hover:border-dsa-gold/40'
              )}
            >
              <span className="font-semibold text-dsa-parchment">Keine Variante</span>
              <p className="text-[10px] text-dsa-parchment-dark mt-0.5">Standard-{profession.name}</p>
            </button>
            {profession.variants.map(v => (
              <button
                key={v.id || v.name}
                onClick={() => setProfessionVariant(v)}
                className={clsx(
                  'text-left p-3 rounded border transition-all text-xs',
                  professionVariant?.id === v.id
                    ? 'border-dsa-gold bg-dsa-gold/10 ring-1 ring-dsa-gold/30'
                    : 'border-dsa-bg-medium bg-dsa-bg hover:border-dsa-gold/40'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-dsa-parchment">{v.name}</span>
                  {v.ap_cost !== 0 && v.ap_cost != null && (
                    <span className={clsx('font-mono text-[10px]', v.ap_cost > 0 ? 'text-red-400' : 'text-green-400')}>
                      {v.ap_cost > 0 ? '+' : ''}{v.ap_cost} AP
                    </span>
                  )}
                </div>
                {v.skills && Object.keys(v.skills).length > 0 && (
                  <p className="text-[10px] text-dsa-parchment-dark mt-0.5">
                    Talentänderungen: {Object.entries(v.skills).map(([k, val]) => `${k} ${val > 0 ? '+' : ''}${val}`).join(', ')}
                  </p>
                )}
                {v.note && <p className="text-[10px] text-dsa-parchment-dark/60 italic mt-0.5">{v.note}</p>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Profession Detail Modal */}
      {detailProf && (
        <ProfessionDetailModal
          prof={detailProf}
          onClose={() => setDetailProf(null)}
          talentsAll={talentsAll || []}
        />
      )}
    </div>
  )
}

// ── Expandable advantage/disadvantage card ──
function AdvDisCard({ item, active, onToggle, apColor, activeClass, inactiveClass, onDetail }) {
  const [expanded, setExpanded] = useState(false)
  const rulesText = item.rules_text || item.description || ''
  const catMeta = ADV_CATEGORY_META[item.category] || ADV_CATEGORY_META.allgemein

  return (
    <div className={clsx(
      'rounded border text-xs transition-all',
      active ? activeClass : inactiveClass
    )}>
      <button
        onClick={onToggle}
        className="w-full text-left px-3 py-2 flex items-center justify-between"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={clsx('truncate', active ? '' : 'text-dsa-parchment')}>{item.name}</span>
          <span className={clsx('text-[9px] shrink-0', catMeta.color)}>{catMeta.label}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          <span className={clsx('font-mono text-[11px]', apColor)}>{item.ap} <TipAbbr term="AP" /></span>
          {onDetail && (
            <button
              onClick={e => { e.stopPropagation(); onDetail(item) }}
              className="text-dsa-parchment-dark/50 hover:text-dsa-parchment transition-colors"
              title="Details anzeigen"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          )}
          {rulesText && (
            <button
              onClick={e => { e.stopPropagation(); setExpanded(!expanded) }}
              className="text-dsa-parchment-dark/50 hover:text-dsa-gold transition-colors"
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </button>
      {rulesText && !expanded && (
        <div className="px-3 pb-1.5 text-[10px] text-dsa-parchment-dark/50 line-clamp-1">{rulesText}</div>
      )}
      {expanded && rulesText && (
        <div className="px-3 pb-2 text-[10px] text-dsa-parchment-dark/70 leading-relaxed border-t border-dsa-bg-medium/50 pt-1.5">
          {rulesText}
        </div>
      )}
    </div>
  )
}

// ── Filterable advantage/disadvantage list ──
function AdvDisList({ items, selected, onToggle, loading, error, onRetry, loadingLabel, accentColor, defaultGrw }) {
  const [searchText, setSearchText] = useState('')
  const [activeCat, setActiveCat] = useState('alle')
  const [grwOnly, setGrwOnly] = useState(defaultGrw ?? false)
  const [detailItem, setDetailItem] = useState(null)

  const displayItems = useMemo(() => {
    let result = items
    if (grwOnly) result = result.filter(v => isGrundregeln(v))
    return result
  }, [items, grwOnly])

  const filtered = useMemo(() => {
    const q = searchText.toLowerCase().trim()
    return displayItems.filter(v => {
      if (activeCat !== 'alle' && v.category !== activeCat) return false
      if (q && !v.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [displayItems, searchText, activeCat])

  if (error) return <LoadError message={error} onRetry={onRetry} />
  if (loading) return <div className="flex items-center gap-2 py-4 text-xs text-dsa-parchment-dark"><Loader2 className="w-4 h-4 animate-spin" />{loadingLabel}</div>

  const isAdvantage = accentColor === 'green'
  const activeClass = isAdvantage ? 'border-green-700 bg-green-900/20 text-green-300' : 'border-red-700 bg-red-900/20 text-red-300'
  const inactiveClass = isAdvantage ? 'border-dsa-bg-medium bg-dsa-bg-card hover:border-green-800' : 'border-dsa-bg-medium bg-dsa-bg-card hover:border-red-800'
  const apColor = isAdvantage ? 'text-red-400' : 'text-green-400'

  return (
    <div className="space-y-2">
      <SearchInput value={searchText} onChange={setSearchText} placeholder={isAdvantage ? 'Vorteil suchen...' : 'Nachteil suchen...'} />
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <CategoryTabs
          activeCat={activeCat}
          setActiveCat={setActiveCat}
          categoryOrder={ADV_CATEGORY_ORDER}
          categoryMeta={ADV_CATEGORY_META}
          items={displayItems}
          getCat={v => v.category}
        />
        <GrwToggle checked={grwOnly} onChange={setGrwOnly} />
      </div>
      <p className="text-[10px] text-dsa-parchment-dark/60">
        {filtered.length} von {displayItems.length} {isAdvantage ? 'Vorteile' : 'Nachteile'}
        {selected.length > 0 && <span className="text-dsa-gold ml-2">&middot; {selected.length} gewählt</span>}
      </p>
      <div className="space-y-1 max-h-[50vh] overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <p className="text-xs text-dsa-parchment-dark/60 py-4 text-center">Keine Treffer für diese Suche.</p>
        ) : filtered.map(v => {
          const active = selected.some(x => x.name === v.name)
          const displayItem = { ...v, ap: v.ap }
          return (
            <AdvDisCard
              key={v.name}
              item={displayItem}
              active={active}
              onToggle={() => onToggle(v)}
              apColor={apColor}
              activeClass={activeClass}
              inactiveClass={inactiveClass}
              onDetail={setDetailItem}
            />
          )
        })}
      </div>
      {detailItem && <AdvDisDetailModal item={detailItem} onClose={() => setDetailItem(null)} isAdvantage={isAdvantage} />}
    </div>
  )
}

// ── Step 6: Vor- & Nachteile ──
function StepVorNachteile({ vorteile, setVorteile, nachteile, setNachteile, apBudget, species, advantagesAll, disadvantagesAll, loadingAdv, loadingDis, errorAdv, errorDis, onRetryAdv, onRetryDis, defaultGrw }) {
  const autoAdvantages = species?.auto_advantages || []
  const totalVorteilCost = vorteile.reduce((s, v) => s + v.ap, 0)
  const totalNachteilRefund = nachteile.reduce((s, n) => s + n.ap, 0)
  const cappedRefund = Math.min(80, totalNachteilRefund)

  const advPresets = useMemo(() =>
    advantagesAll.map(a => ({ name: a.name, ap: a.ap_cost, id: a.id, category: a.category, description: a.description, rules_text: a.rules_text, source_book: a.source_book, levels: a.levels, prerequisites: a.prerequisites })),
    [advantagesAll]
  )
  const disPresets = useMemo(() =>
    disadvantagesAll.map(d => ({ name: d.name, ap: d.ap_cost, id: d.id, category: d.category, description: d.description, rules_text: d.rules_text, source_book: d.source_book, levels: d.levels, prerequisites: d.prerequisites })),
    [disadvantagesAll]
  )

  const toggleVorteil = (v) => {
    const idx = vorteile.findIndex(x => x.name === v.name)
    if (idx >= 0) setVorteile(vorteile.filter((_, i) => i !== idx))
    else setVorteile([...vorteile, { name: v.name, ap: v.ap }])
  }

  const toggleNachteil = (n) => {
    const idx = nachteile.findIndex(x => x.name === n.name)
    if (idx >= 0) setNachteile(nachteile.filter((_, i) => i !== idx))
    else setNachteile([...nachteile, { name: n.name, ap: n.ap }])
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-display font-semibold text-dsa-gold mb-1">Vor- & Nachteile</h2>
        <p className="text-xs text-dsa-parchment-dark">Vorteile kosten <TipAbbr term="AP" /> (max. 80), Nachteile geben <TipAbbr term="AP" /> zurück (max. 80).</p>
      </div>
      <HelpPanel>
        <p><strong>80-AP-Deckelung:</strong> Du darfst maximal 80 <TipAbbr term="AP" className="text-dsa-parchment" /> für Vorteile ausgeben und maximal 80 AP durch Nachteile zurückbekommen. Darüber hinaus bringt es keine weiteren AP.</p>
        <p><strong>Vorteile im Spiel:</strong> Vorteile geben dauerhafte Boni (z.B. mehr <TipAbbr term="LeP" className="text-dsa-parchment" />, Glück, bessere Sicht). Sie wirken passiv und erfordern keine Aktivierung.</p>
        <p><strong>Nachteile im Spiel:</strong> Nachteile schränken deinen Helden ein (z.B. Angst, Goldgier, niedrigere Werte). Der SL kann sie im Spiel einfordern. Sie machen den Charakter interessanter!</p>
        <p><strong>Beschreibungen:</strong> Klicke auf den Pfeil neben dem AP-Wert, um die Regelbeschreibung zu lesen.</p>
        <p><strong>Dieser Schritt ist optional.</strong> Du kannst ohne Vor-/Nachteile weitergehen und AP anderweitig ausgeben.</p>
      </HelpPanel>

      {/* Species auto-advantages */}
      {autoAdvantages.length > 0 && (
        <div className="bg-dsa-bg-card border border-dsa-gold/20 rounded p-3">
          <h3 className="text-xs font-semibold text-dsa-gold mb-1.5">Spezies-Vorteile (automatisch, kostenlos)</h3>
          <div className="flex flex-wrap gap-2">
            {autoAdvantages.map(name => (
              <span key={name} className="text-xs bg-dsa-gold/10 text-dsa-gold border border-dsa-gold/30 rounded px-2 py-1">
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-3 flex flex-wrap gap-4 text-xs">
        <div>
          <span className="text-dsa-parchment-dark">Vorteile: </span>
          <span className="font-mono font-bold text-red-400">-{apBudget.vorteileAP} AP</span>
          {totalVorteilCost > 80 && (
            <span className="ml-2 text-yellow-400 inline-flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Max 80 AP Deckelung!
            </span>
          )}
        </div>
        <div>
          <span className="text-dsa-parchment-dark">Nachteile: </span>
          <span className="font-mono font-bold text-green-400">+{cappedRefund} AP</span>
          {totalNachteilRefund > 80 && (
            <span className="ml-2 text-yellow-400 inline-flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Max 80 AP Deckelung!
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <h3 className="text-sm font-display font-semibold text-green-400 mb-2">Vorteile</h3>
          <AdvDisList
            items={advPresets}
            selected={vorteile}
            onToggle={toggleVorteil}
            loading={loadingAdv}
            error={errorAdv}
            onRetry={onRetryAdv}
            loadingLabel="Lade Vorteile..."
            accentColor="green"
            defaultGrw={defaultGrw}
          />
        </div>
        <div>
          <h3 className="text-sm font-display font-semibold text-red-400 mb-2">Nachteile</h3>
          <AdvDisList
            items={disPresets}
            selected={nachteile}
            onToggle={toggleNachteil}
            loading={loadingDis}
            error={errorDis}
            onRetry={onRetryDis}
            loadingLabel="Lade Nachteile..."
            accentColor="red"
            defaultGrw={defaultGrw}
          />
        </div>
      </div>
    </div>
  )
}

// ── Step 7: Attribute verfeinern ──
function StepAttributes({ baseAttributes, attrUpgrades, setAttrUpgrades, gradeData, apBudget, derivedValues }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-display font-semibold text-dsa-gold mb-1">Attribute verfeinern</h2>
        <p className="text-xs text-dsa-parchment-dark">Steigere deine Attribute mit freien AP. Max: {gradeData?.attr || '?'}</p>
      </div>
      <HelpPanel>
        <p><strong>Die 8 Attribute:</strong> MU (Mut), KL (Klugheit), IN (Intuition), CH (Charisma), FF (Fingerfertigkeit), GE (Gewandtheit), KO (Konstitution), KK (Körperkraft).</p>
        <p><strong>Kostenabstufung:</strong> Steigerungen werden teurer, je höher der Wert. Bis 14: 15 AP. Ab 15: 30 AP. Ab 18: 60 AP. Plane dein Budget!</p>
        <p><strong>Was beeinflusst was?</strong> KO bestimmt LeP. MU+GE bestimmen INI. GE bestimmt AW/GS. KK bestimmt Schadensbonus. MU/KL/IN bestimmen SK.</p>
        <p><strong>Dieser Schritt ist optional.</strong> Du kannst die Basiswerte aus Spezies und Freipunkten beibehalten.</p>
      </HelpPanel>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ATTR_KEYS.map(attr => {
          const base = baseAttributes[attr] || 8
          const delta = attrUpgrades[attr] || 0
          const val = base + delta
          const atMax = gradeData && val >= gradeData.attr
          const nextCost = getAttrCost(val)
          return (
            <div
              key={attr}
              className={clsx(
                'flex items-center justify-between bg-dsa-bg-card border rounded p-3',
                atMax ? 'border-red-800/40' : 'border-dsa-bg-medium'
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <TipAbbr term={attr} className={clsx('text-sm font-semibold', ATTR_META[attr].color)} />
                  <span className="text-xs text-dsa-parchment-dark">{ATTR_META[attr].name}</span>
                </div>
                <p className="text-[10px] text-dsa-parchment-dark/50 leading-tight mt-0.5">{ATTR_META[attr].desc}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-dsa-parchment-dark/50">Basis: {base}</span>
                <IncDec
                  value={val}
                  onInc={() => setAttrUpgrades(p => ({ ...p, [attr]: delta + 1 }))}
                  onDec={() => {
                    setAttrUpgrades(p => {
                      const next = { ...p, [attr]: delta - 1 }
                      if (next[attr] <= 0) delete next[attr]
                      return next
                    })
                  }}
                  disableInc={atMax || apBudget.remaining < nextCost}
                  disableDec={delta <= 0}
                  cost={nextCost}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-3">
        <h3 className="text-xs font-semibold text-dsa-parchment-dark mb-2">Abgeleitete Werte (Vorschau)</h3>
        <div className="flex flex-wrap gap-3 text-xs">
          <DerivedChip label="LeP" value={derivedValues.LeP_max} />
          {derivedValues.AsP_max > 0 && <DerivedChip label="AsP" value={derivedValues.AsP_max} />}
          {derivedValues.KaP_max > 0 && <DerivedChip label="KaP" value={derivedValues.KaP_max} />}
          <DerivedChip label="INI" value={derivedValues.INI_basis} />
          <DerivedChip label="AW" value={derivedValues.AW} />
          <DerivedChip label="SK" value={derivedValues.SK} />
          <DerivedChip label="ZK" value={derivedValues.ZK} />
        </div>
      </div>
    </div>
  )
}

// ── Derivation breakdown panel (reused in StepDerived + StepSummary) ──
function DerivationBreakdownPanel({ steps, total }) {
  return (
    <div className="bg-dsa-bg border border-dsa-bg-medium rounded p-2.5 text-xs space-y-0.5 animate-fade-in">
      {steps.map((s, i) => (
        <div key={i} className="flex justify-between gap-4">
          <span className="text-dsa-parchment-dark">{s.label}</span>
          <span className={clsx(
            'font-mono',
            s.bonus ? 'text-green-400' : s.penalty ? 'text-red-400' : 'text-dsa-parchment'
          )}>
            {s.bonus ? '+' : ''}{s.value}
          </span>
        </div>
      ))}
      <div className="flex justify-between gap-4 border-t border-dsa-bg-medium pt-1 mt-1">
        <span className="text-dsa-parchment font-semibold">Gesamt</span>
        <span className="font-mono font-bold text-dsa-parchment">{total}</span>
      </div>
    </div>
  )
}

// ── Collapsible section for Summary ──
function SummarySection({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5"
      >
        <h3 className="text-sm font-display font-semibold text-dsa-gold">{title}</h3>
        <ChevronRight className={clsx('w-4 h-4 text-dsa-parchment-dark transition-transform', open && 'rotate-90')} />
      </button>
      {open && <div className="px-4 pb-3 border-t border-dsa-bg-medium">{children}</div>}
    </div>
  )
}

function DerivedChip({ label, value, breakdown }) {
  const [showBreakdown, setShowBreakdown] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => breakdown && setShowBreakdown(!showBreakdown)}
        className={clsx(
          'flex items-center gap-1 bg-dsa-bg rounded px-2 py-1',
          breakdown ? 'cursor-pointer hover:bg-dsa-bg-medium/50 transition-colors' : 'cursor-default'
        )}
      >
        <TipAbbr term={label} className="text-dsa-gold font-semibold" />
        <span className="font-mono text-dsa-parchment">{value}</span>
      </button>
      {showBreakdown && breakdown && (
        <div className="absolute z-50 top-full left-0 mt-1 min-w-[200px]">
          <DerivationBreakdownPanel steps={breakdown} total={value} />
        </div>
      )}
    </div>
  )
}

// ── SA category metadata ──
const SA_CATEGORY_META = {
  alle:                { label: 'Alle',          color: 'text-dsa-parchment' },
  nahkampf:            { label: 'Nahkampf',      color: 'text-red-400' },
  fernkampf:           { label: 'Fernkampf',     color: 'text-emerald-400' },
  allgemein:           { label: 'Allgemein',      color: 'text-dsa-gold' },
  allgemein_nichtkampf:{ label: 'Nichtkampf',    color: 'text-cyan-400' },
  magisch:             { label: 'Magisch',        color: 'text-violet-400' },
  karmal:              { label: 'Karmal',         color: 'text-amber-400' },
}
const SA_CATEGORY_ORDER = ['alle', 'nahkampf', 'fernkampf', 'allgemein', 'allgemein_nichtkampf', 'magisch', 'karmal']

// ── Advantage/Disadvantage category metadata ──
const ADV_CATEGORY_META = {
  alle:       { label: 'Alle',       color: 'text-dsa-parchment' },
  allgemein:  { label: 'Allgemein',  color: 'text-dsa-gold' },
  kampf:      { label: 'Kampf',      color: 'text-red-400' },
  magisch:    { label: 'Magisch',    color: 'text-violet-400' },
  karmal:     { label: 'Karmal',     color: 'text-amber-400' },
  sozial:     { label: 'Sozial',     color: 'text-pink-400' },
}
const ADV_CATEGORY_ORDER = ['alle', 'allgemein', 'kampf', 'magisch', 'karmal', 'sozial']

// ── Profession category metadata (DSA5-authentic subcategories) ──
const PROF_CATEGORY_META = {
  alle:            { label: 'Alle',                 color: 'text-dsa-parchment' },
  kaempfer:        { label: 'Kämpfer',              color: 'text-red-400' },
  wildnis:         { label: 'Wildnis & Reise',      color: 'text-green-400' },
  gesellschaft:    { label: 'Gesellschaft',         color: 'text-pink-400' },
  streuner:        { label: 'Streuner & Schatten',  color: 'text-slate-400' },
  handwerk:        { label: 'Handwerk & Gelehrte',  color: 'text-amber-400' },
  gildenmagier:    { label: 'Gildenmagier',         color: 'text-violet-400' },
  hexen_druiden:   { label: 'Hexen & Druiden',      color: 'text-emerald-400' },
  andere_zauberer: { label: 'Andere Zauberwirker',  color: 'text-fuchsia-400' },
  geweihte:        { label: 'Geweihte',             color: 'text-dsa-karma-light' },
}
const PROF_CATEGORY_ORDER = ['alle', 'kaempfer', 'wildnis', 'gesellschaft', 'streuner', 'handwerk', 'gildenmagier', 'hexen_druiden', 'andere_zauberer', 'geweihte']

// Name-based classification sets for mundane professions
const _KAEMPFER_NAMES = new Set([
  'Krieger', 'Söldner', 'Gardist', 'Ritter', 'Amazone', 'Gladiator', 'Soldat',
  'Schaukämpfer', 'Lanisto', 'Sappeur', 'Landwehrsoldat', 'Seekrieger', 'Seesoldat',
  'Stutzer', 'Heckenreiter', 'Distelritter', 'Ritter der Streitenden Königreiche',
])
const _KAEMPFER_PATTERNS = ['Krieger', 'Schwertgeselle', 'Lanzer', 'Sippenkrieger', 'Drachenkämpfer', 'Balayan', 'Buskur', 'Zwergenkrieger']

const _WILDNIS_NAMES = new Set([
  'Jäger', 'Wildniskundiger', 'Seefahrer', 'Bote', 'Entdecker', 'Stammeskrieger',
  'Fallensteller', 'Hirte', 'Viehtreiber', 'Karawanenführer', 'Prospektor',
  'Holzfäller', 'Albernischer Seefahrer', 'Schatzsucher der Siebenwindküste',
])

const _GESELLSCHAFT_NAMES = new Set([
  'Barde', 'Gaukler', 'Händler', 'Höfling', 'Adliger', 'Künstler', 'Herrscher',
  'Patrizier', 'Schauspieler', 'Erotikkünstler', 'Prostituierter', 'Koscher Almgreve',
  'Logenmitglied', 'Wirt', 'Schankbursche',
])

const _STREUNER_NAMES = new Set([
  'Streuner', 'Auftragsmörder', 'Spitzel', 'Diener', 'Kammerdiener (Zofe)',
  'Taschendieb', 'Räuber', 'Schmuggler', 'Küstenschmuggler',
  'Küstenschmuggler aus Havena', 'Sklave', 'Tagelöhner',
])

const _GILDENMAGIER_NAMES = new Set([
  'Weißmagier', 'Graumagier', 'Schwarzmagier', 'Gildenloser Magier',
  'Mehrer der Macht', 'Bewahrer', 'Former', 'Hüter der Kraft',
  'Rashduler Dämonologe', 'Zauberalchimist', 'Scharlatan',
])

const _HEXEN_DRUIDEN_PATTERNS = ['hexer', 'hexe', 'Hexer', 'Hexe', 'Druide', 'Geode', 'Haindruide']

function getProfCategory(p) {
  const n = p.name
  // Blessed professions
  if (p.requires_blessed) return 'geweihte'
  // Magic professions — subcategorize
  if (p.requires_magic) {
    if (_GILDENMAGIER_NAMES.has(n)) return 'gildenmagier'
    // Hexen & Druiden: check patterns
    if (_HEXEN_DRUIDEN_PATTERNS.some(pat => n.includes(pat))) return 'hexen_druiden'
    // Also: Konzildruide, Brobim-Geode, Diener der Erdmutter, Herr der Erde, Sumudiener
    if (['Konzildruide', 'Brobim-Geode', 'Diener der Erdmutter', 'Herr der Erde', 'Sumudiener'].includes(n)) return 'hexen_druiden'
    return 'andere_zauberer'
  }
  // Mundane professions — subcategorize by name
  if (_KAEMPFER_NAMES.has(n)) return 'kaempfer'
  if (_KAEMPFER_PATTERNS.some(pat => n.includes(pat))) return 'kaempfer'
  if (_WILDNIS_NAMES.has(n)) return 'wildnis'
  if (_GESELLSCHAFT_NAMES.has(n)) return 'gesellschaft'
  if (_STREUNER_NAMES.has(n)) return 'streuner'
  // Everything else mundane → Handwerk & Gelehrte
  return 'handwerk'
}

// ── SA Selector with search & category filter ──
function SASelector({ professionSAs, purchasedSAs, setPurchasedSAs, specialAbilitiesAll, loadingSAs, errorSAs, onRetrySAs, apBudget, defaultGrw }) {
  const [searchText, setSearchText] = useState('')
  const [activeCat, setActiveCat] = useState('alle')
  const [grwOnly, setGrwOnly] = useState(defaultGrw ?? false)

  // Filter SAs by GRW, search + category, excluding profession-granted ones
  const displaySAs = useMemo(() => {
    let base = specialAbilitiesAll.filter(sa => !(professionSAs && professionSAs.includes(sa.name)))
    if (grwOnly) base = base.filter(sa => isGrundregeln(sa))
    return base
  }, [specialAbilitiesAll, professionSAs, grwOnly])

  const filteredSAs = useMemo(() => {
    const query = searchText.toLowerCase().trim()
    return displaySAs.filter(sa => {
      if (activeCat !== 'alle' && sa.category !== activeCat) return false
      if (query && !sa.name.toLowerCase().includes(query)) return false
      return true
    })
  }, [displaySAs, searchText, activeCat])

  const totalAvailable = displaySAs.length

  return (
    <div className="space-y-4">
      {/* Profession-granted SAs (non-removable) */}
      {professionSAs && professionSAs.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-dsa-gold/70 mb-2">Von Profession (inklusive)</h3>
          <div className="space-y-1">
            {professionSAs.map(sa => (
              <div
                key={sa}
                className="w-full text-left px-3 py-2 rounded border border-dsa-gold/30 bg-dsa-gold/5 text-xs flex items-center justify-between"
              >
                <span className="text-dsa-parchment">{sa}</span>
                <span className="text-[10px] text-dsa-parchment-dark/50 flex items-center gap-1">
                  <Shield className="w-3 h-3" /> Profession
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Purchasable SAs with search/filter */}
      <div>
        <h3 className="text-xs font-semibold text-dsa-gold mb-2">Zusätzliche Sonderfertigkeiten</h3>
        {loadingSAs ? (
          <div className="flex items-center justify-center gap-2 py-6 text-dsa-parchment-dark">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">Lade Sonderfertigkeiten...</span>
          </div>
        ) : errorSAs ? (
          <div className="text-center py-4">
            <p className="text-xs text-red-400 mb-2">Fehler beim Laden der Sonderfertigkeiten</p>
            <button onClick={onRetrySAs} className="text-xs text-dsa-gold hover:underline flex items-center gap-1 mx-auto">
              <RefreshCw className="w-3 h-3" /> Erneut versuchen
            </button>
          </div>
        ) : specialAbilitiesAll.length === 0 ? (
          <p className="text-xs text-dsa-parchment-dark py-4">Keine Sonderfertigkeiten in der Datenbank vorhanden.</p>
        ) : (
          <>
            {/* Search input */}
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dsa-parchment-dark/50" />
              <input
                type="text"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="Sonderfertigkeit suchen..."
                className="w-full pl-8 pr-3 py-2 text-xs bg-dsa-bg-card border border-dsa-bg-medium rounded text-dsa-parchment placeholder:text-dsa-parchment-dark/40 focus:outline-none focus:border-dsa-gold/50"
              />
              {searchText && (
                <button onClick={() => setSearchText('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-dsa-parchment-dark/50 hover:text-dsa-parchment">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Category filter tabs + GRW toggle */}
            <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
              <div className="flex flex-wrap gap-1">
              {SA_CATEGORY_ORDER.map(cat => {
                const meta = SA_CATEGORY_META[cat]
                const count = cat === 'alle'
                  ? totalAvailable
                  : displaySAs.filter(sa => sa.category === cat).length
                if (cat !== 'alle' && count === 0) return null
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCat(cat)}
                    className={clsx(
                      'px-2 py-1 text-[10px] rounded border transition-colors',
                      activeCat === cat
                        ? 'border-dsa-gold/50 bg-dsa-gold/10 text-dsa-gold font-semibold'
                        : 'border-dsa-bg-medium bg-dsa-bg-card text-dsa-parchment-dark hover:border-dsa-gold/30 hover:text-dsa-parchment'
                    )}
                  >
                    {meta.label} ({count})
                  </button>
                )
              })}
              </div>
              <GrwToggle checked={grwOnly} onChange={setGrwOnly} />
            </div>

            {/* Result count */}
            <p className="text-[10px] text-dsa-parchment-dark/60 mb-2">
              {filteredSAs.length} von {totalAvailable} Sonderfertigkeiten
              {purchasedSAs.length > 0 && (
                <span className="text-dsa-gold ml-2">&middot; {purchasedSAs.length} gewählt</span>
              )}
            </p>

            {/* SA list */}
            <div className="space-y-1 max-h-[50vh] overflow-y-auto">
              {filteredSAs.length === 0 ? (
                <p className="text-xs text-dsa-parchment-dark/60 py-4 text-center">Keine Treffer für diese Suche.</p>
              ) : filteredSAs.map(sa => {
                const isPurchased = purchasedSAs.some(p => p.id === sa.id)
                const canAfford = isPurchased || apBudget.remaining >= (sa.ap_cost || 0)
                const catMeta = SA_CATEGORY_META[sa.category] || SA_CATEGORY_META.allgemein
                return (
                  <button
                    key={sa.id}
                    disabled={!isPurchased && !canAfford}
                    onClick={() => {
                      setPurchasedSAs(prev =>
                        isPurchased
                          ? prev.filter(p => p.id !== sa.id)
                          : [...prev, sa]
                      )
                    }}
                    className={clsx(
                      'w-full text-left px-3 py-2 rounded border text-xs transition-all flex items-center justify-between',
                      isPurchased
                        ? 'border-dsa-gold/50 bg-dsa-gold/10 text-dsa-gold'
                        : canAfford
                          ? 'border-dsa-bg-medium bg-dsa-bg-card text-dsa-parchment-dark hover:border-dsa-gold/30'
                          : 'border-dsa-bg-medium bg-dsa-bg-card text-dsa-parchment-dark/40 cursor-not-allowed'
                    )}
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={clsx('truncate', isPurchased ? 'text-dsa-gold' : 'text-dsa-parchment')}>{sa.name}</span>
                        <span className={clsx('text-[9px] shrink-0', catMeta.color)}>{catMeta.label}</span>
                      </div>
                      {sa.description && (
                        <span className="text-[10px] text-dsa-parchment-dark/60 line-clamp-1">{sa.description}</span>
                      )}
                    </div>
                    <span className={clsx('font-mono text-[11px] shrink-0 ml-2', isPurchased ? 'text-dsa-gold' : 'text-dsa-parchment-dark')}>
                      {sa.ap_cost || 0} AP
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Step 8: Talente & Kampftechniken ──
function StepTalentsKT({ baseSkills, talentUpgrades, setTalentUpgrades, baseKT, ktUpgrades, setKtUpgrades, atPaSplits, setAtPaSplits, gradeData, apBudget, isMagic, isBlessed, professionSpells, professionLiturgies, selectedSpells, setSelectedSpells, selectedLiturgies, setSelectedLiturgies, professionSAs, purchasedSAs, setPurchasedSAs, specialAbilitiesAll, loadingSAs, errorSAs, onRetrySAs, talentCategories, ktData, talentsAll, defaultGrw }) {
  const hasSpellsOrLiturgies = (isMagic && professionSpells && Object.keys(professionSpells).length > 0) || (isBlessed && professionLiturgies && Object.keys(professionLiturgies).length > 0)
  const [activeTab, setActiveTab] = useState('talents')
  const [detailTalent, setDetailTalent] = useState(null)

  // Lookup map for talent details
  const talentLookup = useMemo(() => {
    const m = {}
    for (const t of (talentsAll || [])) m[t.name] = t
    return m
  }, [talentsAll])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-display font-semibold text-dsa-gold mb-1">Talente & Kampftechniken</h2>
        <p className="text-xs text-dsa-parchment-dark">Steigere Talente und Kampftechniken mit freien AP.</p>
      </div>
      <HelpPanel>
        <p><strong>Talentproben (3W20):</strong> Jedes Talent wird mit 3W20 gegen drei Attribute geprobt. Der <TipAbbr term="FW" className="text-dsa-parchment" /> bestimmt, wie viele Punkte du zum Ausgleichen hast.</p>
        <p><strong><TipAbbr term="FW" className="text-dsa-parchment" /> (Fertigkeitswert):</strong> FW 0 = ungeübt (Probe möglich, aber schwer). FW 4 = Anfänger. FW 10 = Experte. FW 18+ = Meister.</p>
        <p><strong>Kampftechniken:</strong> Bestimmen <TipAbbr term="AT" className="text-dsa-parchment" /> (Attacke) und <TipAbbr term="PA" className="text-dsa-parchment" /> (Parade) mit einer Waffengattung. Bei Nahkampf wird der KTW in AT und PA aufgeteilt.</p>
        <p><strong><TipAbbr term="AT" className="text-dsa-parchment" />/<TipAbbr term="PA" className="text-dsa-parchment" />-Verteilung:</strong> Der Kampftechnikwert (KTW) wird auf Attacke und Parade verteilt. Offensiv: mehr AT. Defensiv: mehr PA. Die Summe muss immer gleich KTW sein.</p>
        <p><strong>Steigerungsfaktor (<TipAbbr term="SF" className="text-dsa-parchment" />):</strong> Bestimmt <TipAbbr term="AP" className="text-dsa-parchment" />-Kosten pro Stufe: A = 1 AP, B = 2 AP, C = 3 AP, D = 4 AP, E = 5 AP (bei FW 0–7; darüber wird es progressiv teurer).</p>
        <p><strong>Beruf-Werte:</strong> Werte mit dem Tag <span className="inline-flex items-center gap-0.5 text-[9px] text-dsa-gold/70 bg-dsa-gold/10 rounded px-1"><Shield className="w-2.5 h-2.5" />Beruf</span> wurden durch Kultur oder Profession vergeben.</p>
      </HelpPanel>

      <div className="flex border-b border-dsa-bg-medium">
        <button
          onClick={() => setActiveTab('talents')}
          className={clsx(
            'px-4 py-2 text-sm border-b-2 transition-colors',
            activeTab === 'talents'
              ? 'text-dsa-gold border-dsa-gold'
              : 'text-dsa-parchment-dark border-transparent hover:text-dsa-parchment'
          )}
        >
          Talente
        </button>
        <button
          onClick={() => setActiveTab('kt')}
          className={clsx(
            'px-4 py-2 text-sm border-b-2 transition-colors',
            activeTab === 'kt'
              ? 'text-dsa-gold border-dsa-gold'
              : 'text-dsa-parchment-dark border-transparent hover:text-dsa-parchment'
          )}
        >
          Kampftechniken
        </button>
        {hasSpellsOrLiturgies && (
          <button
            onClick={() => setActiveTab('magic')}
            className={clsx(
              'px-4 py-2 text-sm border-b-2 transition-colors',
              activeTab === 'magic'
                ? 'text-dsa-gold border-dsa-gold'
                : 'text-dsa-parchment-dark border-transparent hover:text-dsa-parchment'
            )}
          >
            {isMagic ? 'Zauber' : 'Liturgien'}
          </button>
        )}
        <button
          onClick={() => setActiveTab('sa')}
          className={clsx(
            'px-4 py-2 text-sm border-b-2 transition-colors',
            activeTab === 'sa'
              ? 'text-dsa-gold border-dsa-gold'
              : 'text-dsa-parchment-dark border-transparent hover:text-dsa-parchment'
          )}
        >
          Sonderfertigkeiten
        </button>
      </div>

      {activeTab === 'talents' ? (
        <div className="space-y-4">
          {talentCategories.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-6 text-dsa-parchment-dark">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Lade Talente...</span>
            </div>
          ) : talentCategories.map(cat => (
            <div key={cat.id}>
              <h3 className={clsx('text-xs font-semibold mb-2', cat.color)}>{cat.label}</h3>
              <div className="space-y-1">
                {cat.talents.map(talent => {
                  const base = baseSkills[talent] || 0
                  const delta = talentUpgrades[talent] || 0
                  const val = base + delta
                  const atMax = gradeData && val >= gradeData.skill
                  const nextCost = getSkillCost(val, cat.sf)
                  const talentObj = talentLookup[talent]
                  return (
                    <div key={talent} className="flex items-center justify-between bg-dsa-bg-card border border-dsa-bg-medium rounded px-3 py-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-dsa-parchment truncate">{talent}</span>
                        {talentObj && (
                          <button
                            onClick={() => setDetailTalent(talentObj)}
                            className="p-0.5 rounded text-dsa-parchment-dark/40 hover:text-dsa-parchment hover:bg-dsa-bg-medium transition-colors shrink-0"
                            title="Details anzeigen"
                          >
                            <Info className="w-3 h-3" />
                          </button>
                        )}
                        {base > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] text-dsa-gold/70 bg-dsa-gold/10 rounded px-1 shrink-0">
                            <Shield className="w-2.5 h-2.5" />Beruf {base}
                          </span>
                        )}
                      </div>
                      <IncDec
                        value={val}
                        onInc={() => setTalentUpgrades(p => ({ ...p, [talent]: delta + 1 }))}
                        onDec={() => {
                          setTalentUpgrades(p => {
                            const next = { ...p, [talent]: delta - 1 }
                            if (next[talent] <= 0) delete next[talent]
                            return next
                          })
                        }}
                        disableInc={atMax || apBudget.remaining < nextCost}
                        disableDec={delta <= 0}
                        cost={nextCost}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      ) : activeTab === 'kt' ? (
        <div className="space-y-1">
          {ktData.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-6 text-dsa-parchment-dark">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Lade Kampftechniken...</span>
            </div>
          ) : ktData.map(kt => {
            const base = baseKT[kt.name] || 6
            const delta = ktUpgrades[kt.name] || 0
            const val = base + delta
            const atMax = gradeData && val >= gradeData.kt
            const nextCost = getSkillCost(val, kt.sf)
            const isMelee = kt.type === 'melee'
            const split = atPaSplits[kt.name]
            const needsSplit = isMelee && val > 6
            const splitValid = !needsSplit || (split && split.at + split.pa === val)
            return (
              <div key={kt.name} className={clsx('bg-dsa-bg-card border rounded px-3 py-1.5', !splitValid ? 'border-yellow-700/50' : 'border-dsa-bg-medium')}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-dsa-parchment truncate">{kt.name}</span>
                    <span className="text-[10px] text-dsa-parchment-dark/50">
                      {kt.type === 'ranged' ? 'Fern' : 'Nah'} | <TipAbbr term="SF" /> {kt.sf}
                    </span>
                    {base > 6 && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] text-dsa-gold/70 bg-dsa-gold/10 rounded px-1 shrink-0">
                        <Shield className="w-2.5 h-2.5" />Beruf {base}
                      </span>
                    )}
                  </div>
                  <IncDec
                    value={val}
                    onInc={() => {
                      setKtUpgrades(p => ({ ...p, [kt.name]: delta + 1 }))
                      // Auto-update split when KTW changes
                      if (isMelee) {
                        const newKtw = val + 1
                        const currentAt = split?.at || Math.ceil(newKtw / 2)
                        const newPa = newKtw - currentAt
                        if (newPa >= 0) {
                          setAtPaSplits(p => ({ ...p, [kt.name]: { at: currentAt, pa: newPa } }))
                        } else {
                          setAtPaSplits(p => ({ ...p, [kt.name]: { at: Math.ceil(newKtw / 2), pa: Math.floor(newKtw / 2) } }))
                        }
                      }
                    }}
                    onDec={() => {
                      setKtUpgrades(p => {
                        const next = { ...p, [kt.name]: delta - 1 }
                        if (next[kt.name] <= 0) delete next[kt.name]
                        return next
                      })
                      // Auto-update split when KTW changes
                      if (isMelee) {
                        const newKtw = val - 1
                        if (newKtw <= 6) {
                          setAtPaSplits(p => { const n = { ...p }; delete n[kt.name]; return n })
                        } else {
                          const currentAt = Math.min(split?.at || Math.ceil(newKtw / 2), newKtw)
                          setAtPaSplits(p => ({ ...p, [kt.name]: { at: currentAt, pa: newKtw - currentAt } }))
                        }
                      }
                    }}
                    disableInc={atMax || apBudget.remaining < nextCost}
                    disableDec={delta <= 0 || val <= 6}
                    cost={nextCost}
                  />
                </div>
                {/* AT/PA split for melee techniques with KTW > 6 */}
                {needsSplit && (
                  <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1.5 pl-2">
                    <span className="text-[10px] text-dsa-parchment-dark"><TipAbbr term="AT" />/<TipAbbr term="PA" />-Verteilung:</span>
                    <div className="flex items-center gap-1">
                      <label className="text-[10px] text-red-400 font-semibold"><TipAbbr term="AT" /></label>
                      <input
                        type="number"
                        min={0}
                        max={val}
                        value={split?.at ?? Math.ceil(val / 2)}
                        onChange={(e) => {
                          const newAt = Math.max(0, Math.min(val, parseInt(e.target.value) || 0))
                          setAtPaSplits(p => ({ ...p, [kt.name]: { at: newAt, pa: val - newAt } }))
                        }}
                        className="w-10 text-center text-xs font-mono bg-dsa-bg border border-dsa-bg-medium rounded px-1 py-0.5 text-dsa-parchment"
                      />
                    </div>
                    <span className="text-[10px] text-dsa-parchment-dark">/</span>
                    <div className="flex items-center gap-1">
                      <label className="text-[10px] text-blue-400 font-semibold"><TipAbbr term="PA" /></label>
                      <input
                        type="number"
                        min={0}
                        max={val}
                        value={split?.pa ?? Math.floor(val / 2)}
                        onChange={(e) => {
                          const newPa = Math.max(0, Math.min(val, parseInt(e.target.value) || 0))
                          setAtPaSplits(p => ({ ...p, [kt.name]: { at: val - newPa, pa: newPa } }))
                        }}
                        className="w-10 text-center text-xs font-mono bg-dsa-bg border border-dsa-bg-medium rounded px-1 py-0.5 text-dsa-parchment"
                      />
                    </div>
                    {!splitValid && (
                      <span className="text-[10px] text-yellow-400 flex items-center gap-0.5">
                        <AlertTriangle className="w-3 h-3" />
                        Summe muss {val} ergeben
                      </span>
                    )}
                    {splitValid && (
                      <span className="text-[10px] text-dsa-parchment-dark/40">(Offensiv: mehr AT — Defensiv: mehr PA)</span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : activeTab === 'magic' ? (
        <div className="space-y-4">
          {isMagic && professionSpells && Object.keys(professionSpells).length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-dsa-mana mb-2">Zauber (Profession)</h3>
              <div className="space-y-1">
                {Object.entries(professionSpells).map(([spellName, fw]) => {
                  const isSelected = spellName in selectedSpells
                  return (
                    <button
                      key={spellName}
                      onClick={() => {
                        setSelectedSpells(p => {
                          const next = { ...p }
                          if (isSelected) { delete next[spellName] } else { next[spellName] = fw }
                          return next
                        })
                      }}
                      className={clsx(
                        'w-full text-left px-3 py-2 rounded border text-xs transition-all flex items-center justify-between',
                        isSelected
                          ? 'border-dsa-mana/50 bg-dsa-mana/10 text-dsa-mana'
                          : 'border-dsa-bg-medium bg-dsa-bg-card text-dsa-parchment-dark hover:border-dsa-mana/30'
                      )}
                    >
                      <span>{spellName}</span>
                      <span className="font-mono">FW {fw}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {isBlessed && professionLiturgies && Object.keys(professionLiturgies).length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-dsa-karma mb-2">Liturgien (Profession)</h3>
              <div className="space-y-1">
                {Object.entries(professionLiturgies).map(([litName, fw]) => {
                  const isSelected = litName in selectedLiturgies
                  return (
                    <button
                      key={litName}
                      onClick={() => {
                        setSelectedLiturgies(p => {
                          const next = { ...p }
                          if (isSelected) { delete next[litName] } else { next[litName] = fw }
                          return next
                        })
                      }}
                      className={clsx(
                        'w-full text-left px-3 py-2 rounded border text-xs transition-all flex items-center justify-between',
                        isSelected
                          ? 'border-dsa-karma/50 bg-dsa-karma/10 text-dsa-karma'
                          : 'border-dsa-bg-medium bg-dsa-bg-card text-dsa-parchment-dark hover:border-dsa-karma/30'
                      )}
                    >
                      <span>{litName}</span>
                      <span className="font-mono">FW {fw}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {!((isMagic && professionSpells && Object.keys(professionSpells).length > 0) || (isBlessed && professionLiturgies && Object.keys(professionLiturgies).length > 0)) && (
            <p className="text-xs text-dsa-parchment-dark py-4">Keine Zauber oder Liturgien von der Profession verfügbar.</p>
          )}
        </div>
      ) : activeTab === 'sa' ? (
        <SASelector
          professionSAs={professionSAs}
          purchasedSAs={purchasedSAs}
          setPurchasedSAs={setPurchasedSAs}
          specialAbilitiesAll={specialAbilitiesAll}
          loadingSAs={loadingSAs}
          errorSAs={errorSAs}
          onRetrySAs={onRetrySAs}
          apBudget={apBudget}
          defaultGrw={defaultGrw}
        />
      ) : null}

      {/* Talent Detail Modal */}
      {detailTalent && <TalentDetailModal talent={detailTalent} onClose={() => setDetailTalent(null)} />}
    </div>
  )
}

// ── Step 9: Abgeleitete Werte ──
function StepDerived({ derivedValues, derivationBreakdown, isMagic, isBlessed }) {
  const [expanded, setExpanded] = useState(null)

  const rows = [
    { term: 'LeP', key: 'LeP_max', label: 'Lebenspunkte', value: derivedValues.LeP_max, show: true },
    { term: 'AsP', key: 'AsP_max', label: 'Astralpunkte', value: derivedValues.AsP_max, show: isMagic },
    { term: 'KaP', key: 'KaP_max', label: 'Karmapunkte', value: derivedValues.KaP_max, show: isBlessed },
    { term: 'GS', key: 'GS', label: 'Geschwindigkeit', value: derivedValues.GS, show: true },
    { term: 'INI', key: 'INI_basis', label: 'Initiative (Basis)', value: derivedValues.INI_basis, show: true },
    { term: 'AW', key: 'AW', label: 'Ausweichen', value: derivedValues.AW, show: true },
    { term: 'WS', key: 'WS', label: 'Wundschwelle', value: derivedValues.WS, show: true },
    { term: 'SB', key: 'SB', label: 'Schadensbonus', value: derivedValues.SB, show: true },
    { term: 'SK', key: 'SK', label: 'Seelenkraft', value: derivedValues.SK, show: true },
    { term: 'ZK', key: 'ZK', label: 'Zähigkeit', value: derivedValues.ZK, show: true },
    { term: 'SchiP', key: 'SchiP', label: 'Schicksalspunkte', value: derivedValues.SchiP, show: true },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-display font-semibold text-dsa-gold mb-1">Abgeleitete Werte</h2>
        <p className="text-xs text-dsa-parchment-dark">Diese Werte ergeben sich aus Attributen, Spezies und Vor-/Nachteilen. Klicke auf einen Wert für die Herleitung.</p>
      </div>
      <HelpPanel>
        <p><strong>LeP (Lebenspunkte):</strong> Spezies-Basis + KO x 2. Bestimmt Überlebensfähigkeit.</p>
        <p><strong>AsP/KaP:</strong> Magische/göttliche Energie. Nur für Zauberer (AsP) bzw. Geweihte (KaP).</p>
        <p><strong>INI (Initiative):</strong> (MU+GE)/2. Bestimmt Handlungsreihenfolge im Kampf (+1W6).</p>
        <p><strong>AW (Ausweichen):</strong> GE/2. Alternative zur Parade ohne Waffe.</p>
        <p><strong>SK (Seelenkraft):</strong> Widerstand gegen Geisteszauber. ZK (Zähigkeit): Widerstand gegen Körperzauber/-gifte.</p>
        <p><strong>SchiP:</strong> Schicksalspunkte. Basis 3, modifiziert durch Glück/Pech. Im Spiel für Probe wiederholen, Schaden halbieren oder Extra-Reaktion.</p>
        <p>Diese Werte können hier nicht direkt geändert werden. Gehe zurück zu Schritt 7, um Attribute anzupassen.</p>
      </HelpPanel>
      <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded divide-y divide-dsa-bg-medium">
        {rows.filter(r => r.show).map(r => (
          <div key={r.term}>
            <button
              onClick={() => setExpanded(expanded === r.key ? null : r.key)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-dsa-bg-medium/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <TipAbbr term={r.term} className="text-sm font-semibold text-dsa-gold" />
                <span className="text-xs text-dsa-parchment-dark">{r.label}</span>
              </div>
              <span className="text-sm font-mono font-bold text-dsa-parchment">{r.value}</span>
            </button>
            {expanded === r.key && derivationBreakdown[r.key] && (
              <div className="px-4 pb-3">
                <DerivationBreakdownPanel steps={derivationBreakdown[r.key]} total={r.value} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Step 10: Zusammenfassung ──
function StepSummary({
  name, nickname, species, culture, profession, grade, gradeData,
  finalAttributes, derivedValues, derivationBreakdown, apBudget,
  vorteile, nachteile, isMagic, isBlessed, submitError,
  baseSkills, talentUpgrades, talentCategories,
  baseKT, ktUpgrades, ktData, atPaSplits,
  selectedSpells, selectedLiturgies,
  purchasedSAs,
  background, setBackground,
}) {
  // Final talent values grouped by category (only FW > 0)
  const talentsByCategory = useMemo(() => {
    const finalSkills = {}
    for (const [k, v] of Object.entries(baseSkills || {})) {
      const fw = v + (talentUpgrades?.[k] || 0)
      if (fw > 0) finalSkills[k] = fw
    }
    for (const [k, v] of Object.entries(talentUpgrades || {})) {
      if (!finalSkills[k] && v > 0) finalSkills[k] = (baseSkills?.[k] || 0) + v
    }
    return (talentCategories || []).map(cat => ({
      ...cat,
      talents: cat.talents
        .filter(t => finalSkills[t])
        .map(t => ({ name: t, fw: finalSkills[t] }))
    })).filter(cat => cat.talents.length > 0)
  }, [baseSkills, talentUpgrades, talentCategories])

  // Final KT values (only > 6)
  const finalKTs = useMemo(() => {
    return (ktData || []).map(kt => {
      const ktw = (baseKT?.[kt.name] || 6) + (ktUpgrades?.[kt.name] || 0)
      const split = atPaSplits?.[kt.name]
      return { name: kt.name, ktw, type: kt.type, at: split?.at, pa: split?.pa }
    }).filter(kt => kt.ktw > 6)
  }, [ktData, baseKT, ktUpgrades, atPaSplits])

  // All special abilities
  const allSAs = useMemo(() => {
    const profSAs = profession?.special_abilities || []
    const purchased = (purchasedSAs || []).map(sa => sa.name)
    return [...profSAs, ...purchased]
  }, [profession, purchasedSAs])

  const languages = culture?.languages || []
  const equipment = profession?.starting_equipment || []
  const spells = selectedSpells || {}
  const liturgies = selectedLiturgies || {}

  // Auto-generated background draft
  const backgroundDraft = useMemo(() => {
    return composeBackgroundDraft({
      species, culture, profession,
      advantages: vorteile,
      disadvantages: nachteile,
      characterName: name,
    })
  }, [species, culture, profession, vorteile, nachteile, name])

  // Track whether user has manually edited the background
  // If background already has content on mount (edit mode), treat as user-edited
  const userEditedRef = useRef(background.length > 0 && background !== backgroundDraft)

  // Auto-fill background with draft when it changes (unless user has edited)
  useEffect(() => {
    if (!userEditedRef.current && backgroundDraft) {
      setBackground(backgroundDraft)
    }
  }, [backgroundDraft, setBackground])

  const handleBackgroundChange = (e) => {
    userEditedRef.current = true
    setBackground(e.target.value)
  }

  const handleResetDraft = () => {
    userEditedRef.current = false
    setBackground(backgroundDraft)
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-display font-semibold text-dsa-gold mb-1">Zusammenfassung</h2>
        <p className="text-xs text-dsa-parchment-dark">Prüfe deinen Charakter vor dem Erstellen.</p>
      </div>
      <HelpPanel>
        <p><strong>AP-Bilanz:</strong> Die Übersicht zeigt, wie deine AP ausgegeben wurden. Verbleibende AP stehen dir im Spiel für Steigerungen zur Verfügung.</p>
        <p><strong>Prüfe folgendes:</strong> Stimmen die Attribute? Hast du die richtigen Vor-/Nachteile? Sind die Talente sinnvoll verteilt?</p>
        <p><strong>Nach der Erstellung:</strong> Du kannst den Charakter im Nachhinein bearbeiten und mit verdienten AP weiter steigern.</p>
      </HelpPanel>

      {/* Character identity card */}
      <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-display font-bold text-dsa-parchment">{name}</h3>
          {nickname && <span className="text-xs text-dsa-parchment-dark italic">"{nickname}"</span>}
        </div>
        <div className="text-xs text-dsa-parchment-dark space-y-0.5">
          <p>Spezies: <span className="text-dsa-parchment">{species?.name}</span></p>
          <p>Kultur: <span className="text-dsa-parchment">{culture?.name}</span></p>
          <p>Profession: <span className="text-dsa-parchment">{profession?.name}</span></p>
          <p>Erfahrungsgrad: <span className="text-dsa-parchment">{gradeData?.label}</span></p>
        </div>
      </div>

      {/* Background / Hintergrund */}
      <SummarySection title="Hintergrundgeschichte" defaultOpen>
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-dsa-parchment-dark">
              <Sparkles className="w-3 h-3 text-dsa-gold" />
              <span>Automatisch erstellt — frei editierbar</span>
            </div>
            {userEditedRef.current && (
              <button
                onClick={handleResetDraft}
                className="flex items-center gap-1 text-xs text-dsa-gold hover:text-dsa-gold/80 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Entwurf zurücksetzen
              </button>
            )}
          </div>
          <textarea
            value={background}
            onChange={handleBackgroundChange}
            placeholder="Hintergrundgeschichte (optional)"
            rows={6}
            className="input-field w-full resize-none text-sm leading-relaxed"
            style={{ fontFamily: 'Georgia, serif', color: '#e8dcc8' }}
          />
        </div>
      </SummarySection>

      {/* Attributes */}
      <SummarySection title="Attribute" defaultOpen>
        <div className="grid grid-cols-4 gap-2 pt-2">
          {ATTR_KEYS.map(attr => (
            <div key={attr} className="text-center bg-dsa-bg rounded p-2">
              <div className={clsx('text-xs font-semibold', ATTR_META[attr].color)}>{attr}</div>
              <div className="text-lg font-mono font-bold text-dsa-parchment">{finalAttributes[attr]}</div>
            </div>
          ))}
        </div>
      </SummarySection>

      {/* Vor-/Nachteile */}
      {(vorteile.length > 0 || nachteile.length > 0) && (
        <SummarySection title={`Vor- & Nachteile (${vorteile.length + nachteile.length})`} defaultOpen>
          <div className="grid grid-cols-2 gap-4 text-xs pt-2">
            <div className="space-y-0.5">
              {vorteile.map(v => (
                <div key={v.name} className="flex justify-between text-green-400">
                  <span>{v.name}</span>
                  <span className="font-mono">{v.ap} AP</span>
                </div>
              ))}
            </div>
            <div className="space-y-0.5">
              {nachteile.map(n => (
                <div key={n.name} className="flex justify-between text-red-400">
                  <span>{n.name}</span>
                  <span className="font-mono">+{n.ap} AP</span>
                </div>
              ))}
            </div>
          </div>
        </SummarySection>
      )}

      {/* Talente */}
      {talentsByCategory.length > 0 && (
        <SummarySection title="Talente">
          <div className="space-y-3 pt-2">
            {talentsByCategory.map(cat => (
              <div key={cat.id}>
                <h4 className={clsx('text-xs font-semibold mb-1', cat.color)}>{cat.label}</h4>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                  {cat.talents.map(t => (
                    <span key={t.name} className="text-xs text-dsa-parchment">
                      {t.name}: <span className="font-mono text-dsa-gold">{t.fw}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SummarySection>
      )}

      {/* Kampftechniken */}
      {finalKTs.length > 0 && (
        <SummarySection title="Kampftechniken">
          <div className="space-y-1 pt-2">
            {finalKTs.map(kt => (
              <div key={kt.name} className="flex items-center justify-between text-xs">
                <span className="text-dsa-parchment">{kt.name}</span>
                <span className="font-mono text-dsa-gold">
                  {kt.ktw}
                  {kt.type === 'melee' && kt.at != null && (
                    <span className="text-dsa-parchment-dark ml-2">AT {kt.at} / PA {kt.pa}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </SummarySection>
      )}

      {/* Zauber */}
      {isMagic && Object.keys(spells).length > 0 && (
        <SummarySection title="Zauber">
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 pt-2">
            {Object.entries(spells).map(([name, fw]) => (
              <span key={name} className="text-xs text-dsa-parchment">
                {name}: <span className="font-mono text-violet-400">{fw}</span>
              </span>
            ))}
          </div>
        </SummarySection>
      )}

      {/* Liturgien */}
      {isBlessed && Object.keys(liturgies).length > 0 && (
        <SummarySection title="Liturgien">
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 pt-2">
            {Object.entries(liturgies).map(([name, fw]) => (
              <span key={name} className="text-xs text-dsa-parchment">
                {name}: <span className="font-mono text-amber-400">{fw}</span>
              </span>
            ))}
          </div>
        </SummarySection>
      )}

      {/* Sonderfertigkeiten */}
      {allSAs.length > 0 && (
        <SummarySection title={`Sonderfertigkeiten (${allSAs.length})`}>
          <div className="flex flex-wrap gap-x-3 gap-y-1 pt-2">
            {allSAs.map(sa => (
              <span key={sa} className="text-xs text-dsa-parchment bg-dsa-bg rounded px-1.5 py-0.5">{sa}</span>
            ))}
          </div>
        </SummarySection>
      )}

      {/* Sprachen */}
      {languages.length > 0 && (
        <SummarySection title="Sprachen">
          <div className="flex flex-wrap gap-x-3 gap-y-1 pt-2">
            {languages.map(lang => (
              <span key={lang} className="text-xs text-dsa-parchment bg-dsa-bg rounded px-1.5 py-0.5">{lang}</span>
            ))}
          </div>
        </SummarySection>
      )}

      {/* Startausrüstung */}
      {equipment.length > 0 && (
        <SummarySection title="Startausrüstung">
          <div className="space-y-0.5 pt-2">
            {equipment.map((item, i) => (
              <div key={i} className="text-xs text-dsa-parchment">{typeof item === 'string' ? item : item.name || JSON.stringify(item)}</div>
            ))}
          </div>
        </SummarySection>
      )}

      {/* Abgeleitete Werte with clickable breakdown */}
      <SummarySection title="Abgeleitete Werte" defaultOpen>
        <div className="flex flex-wrap gap-2 pt-2">
          <DerivedChip label="LeP" value={derivedValues.LeP_max} breakdown={derivationBreakdown?.LeP_max} />
          {isMagic && <DerivedChip label="AsP" value={derivedValues.AsP_max} breakdown={derivationBreakdown?.AsP_max} />}
          {isBlessed && <DerivedChip label="KaP" value={derivedValues.KaP_max} breakdown={derivationBreakdown?.KaP_max} />}
          <DerivedChip label="GS" value={derivedValues.GS} breakdown={derivationBreakdown?.GS} />
          <DerivedChip label="INI" value={derivedValues.INI_basis} breakdown={derivationBreakdown?.INI_basis} />
          <DerivedChip label="AW" value={derivedValues.AW} breakdown={derivationBreakdown?.AW} />
          <DerivedChip label="WS" value={derivedValues.WS} breakdown={derivationBreakdown?.WS} />
          <DerivedChip label="SK" value={derivedValues.SK} breakdown={derivationBreakdown?.SK} />
          <DerivedChip label="ZK" value={derivedValues.ZK} breakdown={derivationBreakdown?.ZK} />
          <DerivedChip label="SchiP" value={derivedValues.SchiP} breakdown={derivationBreakdown?.SchiP} />
        </div>
      </SummarySection>

      {/* AP Budget */}
      <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4">
        <h3 className="text-sm font-display font-semibold text-dsa-parchment mb-2">AP-Bilanz</h3>
        <div className="space-y-1 text-xs">
          <ApRow label="Gesamt" value={apBudget.total} />
          {apBudget.speciesAP > 0 && <ApRow label="Spezies" value={-apBudget.speciesAP} negative />}
          {apBudget.cultureAP > 0 && <ApRow label="Kultur" value={-apBudget.cultureAP} negative />}
          {apBudget.professionAP > 0 && <ApRow label="Profession" value={-apBudget.professionAP} negative />}
          {apBudget.attrSpend > 0 && <ApRow label="Attribute" value={-apBudget.attrSpend} negative />}
          {apBudget.skillSpend > 0 && <ApRow label="Talente" value={-apBudget.skillSpend} negative />}
          {apBudget.ktSpend > 0 && <ApRow label="Kampftechniken" value={-apBudget.ktSpend} negative />}
          {apBudget.saSpend > 0 && <ApRow label="Sonderfertigkeiten" value={-apBudget.saSpend} negative />}
          {apBudget.vorteileAP > 0 && <ApRow label="Vorteile" value={-apBudget.vorteileAP} negative />}
          {apBudget.nachteileRefund > 0 && <ApRow label="Nachteile" value={apBudget.nachteileRefund} positive />}
          <div className="flex justify-between border-t border-dsa-bg-medium pt-1 mt-1">
            <span className="text-dsa-parchment font-semibold">Verbleibend</span>
            <span className={clsx('font-mono font-bold', apBudget.remaining < 0 ? 'text-red-400' : 'text-dsa-gold')}>
              {apBudget.remaining} AP
            </span>
          </div>
        </div>
      </div>

      {apBudget.remaining < 0 && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-dsa-danger/10 border border-dsa-danger/30 rounded px-4 py-3">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          Du hast {Math.abs(apBudget.remaining)} AP zu viel ausgegeben. Gehe zurück und reduziere Steigerungen.
        </div>
      )}

      {submitError && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-dsa-danger/10 border border-dsa-danger/30 rounded px-4 py-3">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {submitError}
        </div>
      )}
    </div>
  )
}

function ApRow({ label, value, negative, positive }) {
  return (
    <div className="flex justify-between">
      <span className="text-dsa-parchment-dark">{label}</span>
      <span className={clsx('font-mono', negative ? 'text-red-400' : positive ? 'text-green-400' : 'text-dsa-parchment')}>
        {value > 0 && !negative ? '+' : ''}{value}
      </span>
    </div>
  )
}
