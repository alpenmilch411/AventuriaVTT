import { useState, useMemo, useCallback, useEffect } from 'react'
import {
  X, ChevronLeft, ChevronRight, Check, AlertTriangle, Loader2,
  Shield, Plus, Minus, RefreshCw,
} from 'lucide-react'
import clsx from 'clsx'
import useAuthStore from '../../stores/authStore'
import { TipAbbr } from '../../components/Tooltip'

// ────────────────────────────────────────────────────────────────────────────
// DSA5 Cost Tables (rules constants, not DB data)
// ────────────────────────────────────────────────────────────────────────────

const SF_TABLES = {
  A: { 0:1,1:1,2:1,3:1,4:1,5:1,6:1,7:1, 8:2,9:2,10:2,11:2,12:2, 13:3,14:3,15:3, 16:4,17:4, 18:5,19:6,20:7,21:8,22:9,23:10,24:12 },
  B: { 0:2,1:2,2:2,3:2,4:2,5:2,6:2,7:2, 8:4,9:4,10:4,11:4,12:4, 13:6,14:6,15:6, 16:8,17:8, 18:10,19:12,20:14,21:16,22:18,23:20,24:24 },
  C: { 0:3,1:3,2:3,3:3,4:3,5:3,6:3,7:3, 8:6,9:6,10:6,11:6,12:6, 13:9,14:9,15:9, 16:12,17:12, 18:15,19:18,20:21,21:24,22:27,23:30,24:36 },
  D: { 0:4,1:4,2:4,3:4,4:4,5:4,6:4,7:4, 8:8,9:8,10:8,11:8,12:8, 13:12,14:12,15:12, 16:16,17:16, 18:20,19:24,20:28,21:32,22:36,23:40,24:48 },
  E: { 0:5,1:5,2:5,3:5,4:5,5:5,6:5,7:5, 8:10,9:10,10:10,11:10,12:10, 13:15,14:15,15:15, 16:20,17:20, 18:25,19:30,20:35,21:40,22:45,23:50,24:60 },
}

const ATTR_COST = {
  8:15, 9:15, 10:15, 11:15, 12:15, 13:15, 14:15,
  15:30, 16:30, 17:30, 18:60, 19:60, 20:120, 21:120, 22:240, 23:240, 24:480,
}

function getAttrCost(val) { return ATTR_COST[val] || (val < 8 ? 15 : 480) }

function getSkillCost(val, sf) {
  const table = SF_TABLES[sf]
  if (!table) return 999
  return table[val] ?? (val > 24 ? table[24] * Math.pow(2, val - 24) : 999)
}

const ERFAHRUNGSGRADE = {
  unerfahren:       { label: 'Unerfahren',      ap: 900,  maxAttr: 14, maxSkill: 14, maxKt: 14 },
  durchschnittlich: { label: 'Durchschnittlich', ap: 1000, maxAttr: 15, maxSkill: 16, maxKt: 16 },
  erfahren:         { label: 'Erfahren',         ap: 1100, maxAttr: 16, maxSkill: 18, maxKt: 18 },
  kompetent:        { label: 'Kompetent',        ap: 1200, maxAttr: 17, maxSkill: 20, maxKt: 20 },
  meisterlich:      { label: 'Meisterlich',      ap: 1400, maxAttr: 18, maxSkill: 22, maxKt: 22 },
  brillant:         { label: 'Brillant',         ap: 1700, maxAttr: 19, maxSkill: 24, maxKt: 24 },
  legendaer:        { label: 'Legendär',         ap: 2100, maxAttr: 20, maxSkill: 25, maxKt: 25 },
}

const ATTR_KEYS = ['MU','KL','IN','CH','FF','GE','KO','KK']

const ATTR_META = {
  MU: { name: 'Mut',              color: 'text-red-400' },
  KL: { name: 'Klugheit',         color: 'text-blue-400' },
  IN: { name: 'Intuition',        color: 'text-violet-400' },
  CH: { name: 'Charisma',         color: 'text-pink-400' },
  FF: { name: 'Fingerfertigkeit', color: 'text-emerald-400' },
  GE: { name: 'Gewandtheit',      color: 'text-cyan-400' },
  KO: { name: 'Konstitution',     color: 'text-orange-400' },
  KK: { name: 'Körperkraft',      color: 'text-amber-400' },
}

// ── Vorteile & Nachteile presets (rules constants) ──
const VORTEILE_PRESETS = [
  { name: 'Hohe Lebenskraft I',  ap: 25 },
  { name: 'Hohe Lebenskraft II', ap: 25 },
  { name: 'Glück I',             ap: 20 },
  { name: 'Zäher Hund',          ap: 20 },
  { name: 'Hohe Astralkraft I',  ap: 25 },
  { name: 'Hohe Karmalkraft I',  ap: 25 },
  { name: 'Gutaussehend',        ap: 20 },
  { name: 'Eisern',              ap: 15 },
  { name: 'Geborener Krieger',   ap: 25 },
  { name: 'Dunkelsicht I',       ap: 10 },
]

const NACHTEILE_PRESETS = [
  { name: 'Niedrige Lebenskraft I',  ap: 25 },
  { name: 'Niedrige Lebenskraft II', ap: 25 },
  { name: 'Pech I',                  ap: 20 },
  { name: 'Arroganz',                ap: 5 },
  { name: 'Vorurteile',              ap: 5 },
  { name: 'Goldgier',                ap: 10 },
  { name: 'Angst vor (wählen)',      ap: 10 },
  { name: 'Schlechte Eigenschaft',   ap: 5 },
  { name: 'Neugier',                 ap: 10 },
  { name: 'Hitzeempfindlich',        ap: 5 },
]

// ── Talent categories with default SF (rules constants) ──
const TALENT_CATEGORIES = [
  { id: 'körper', label: 'Körpertalente', color: 'text-orange-400', sf: 'B',
    talents: ['Klettern','Körperbeherrschung','Kraftakt','Schwimmen','Selbstbeherrschung','Sinnesschärfe','Verbergen','Zechen'] },
  { id: 'gesellschaft', label: 'Gesellschaftstalente', color: 'text-pink-400', sf: 'B',
    talents: ['Betören','Einschüchtern','Etikette','Gassenwissen','Menschenkenntnis','Überreden'] },
  { id: 'natur', label: 'Naturtalente', color: 'text-green-400', sf: 'C',
    talents: ['Fährtensuchen','Orientierung','Pflanzenkunde','Tierkunde','Wildnisleben'] },
  { id: 'wissen', label: 'Wissenstalente', color: 'text-blue-400', sf: 'C',
    talents: ['Geschichtswissen','Götter & Kulte','Magiekunde','Mechanik','Rechtskunde','Sagen & Legenden'] },
  { id: 'handwerk', label: 'Handwerkstalente', color: 'text-amber-400', sf: 'B',
    talents: ['Alchemie','Heilkunde Krankheiten','Heilkunde Wunden','Holzbearbeitung','Kochen','Lederbearbeitung','Metallbearbeitung','Musizieren','Schlösserknacken','Steinbearbeitung','Taschendiebstahl'] },
]

// ── Kampftechniken with SF (rules constants) ──
const KT_DATA = [
  { name: 'Dolche',           sf: 'B', type: 'melee' },
  { name: 'Fechtwaffen',      sf: 'C', type: 'melee' },
  { name: 'Hiebwaffen',       sf: 'C', type: 'melee' },
  { name: 'Kettenwaffen',     sf: 'C', type: 'melee' },
  { name: 'Lanzen',           sf: 'B', type: 'melee' },
  { name: 'Raufen',           sf: 'B', type: 'melee' },
  { name: 'Schilde',          sf: 'C', type: 'melee' },
  { name: 'Schwerter',        sf: 'C', type: 'melee' },
  { name: 'Stangenwaffen',    sf: 'C', type: 'melee' },
  { name: 'Zweihandschwerter',sf: 'C', type: 'melee' },
  { name: 'Zweihandäxte',     sf: 'C', type: 'melee' },
  { name: 'Äxte',             sf: 'C', type: 'melee' },
  { name: 'Armbrüste',        sf: 'B', type: 'ranged' },
  { name: 'Bögen',            sf: 'C', type: 'ranged' },
  { name: 'Blasrohre',        sf: 'B', type: 'ranged' },
  { name: 'Schleudern',       sf: 'B', type: 'ranged' },
  { name: 'Wurfwaffen',       sf: 'B', type: 'ranged' },
]

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
  const res = await fetch(`/api/databank/${entityType}?page_size=200`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Fehler beim Laden von ${entityType}`)
  const data = await res.json()
  return data.items || []
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

export default function CharacterCreator({ onClose, onCreated }) {
  const token = useAuthStore((s) => s.token)

  // ── API data ──
  const [speciesAll, setSpeciesAll] = useState([])
  const [culturesAll, setCulturesAll] = useState([])
  const [professionsAll, setProfessionsAll] = useState([])
  const [apiLoading, setApiLoading] = useState({ species: false, cultures: false, professions: false })
  const [apiError, setApiError] = useState({ species: null, cultures: null, professions: null })

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

  useEffect(() => { loadSpecies(); loadCultures(); loadProfessions() }, [loadSpecies, loadCultures, loadProfessions])

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
  const [speciesFreePoints, setSpeciesFreePoints] = useState({}) // {attr: delta}

  // Step 4: Culture
  const [culture, setCulture] = useState(null)

  // Step 5: Profession
  const [profession, setProfession] = useState(null)

  // Step 6: Vor-/Nachteile
  const [vorteile, setVorteile] = useState([])
  const [nachteile, setNachteile] = useState([])

  // Step 7: Attribute upgrades (deltas over base)
  const [attrUpgrades, setAttrUpgrades] = useState({})

  // Step 8: Talent & KT upgrades (deltas over base)
  const [talentUpgrades, setTalentUpgrades] = useState({})
  const [ktUpgrades, setKtUpgrades] = useState({})

  // ── Derived data ──
  const gradeData = grade ? ERFAHRUNGSGRADE[grade] : null
  const freeAttrPoints = species?.free_attribute_points ?? 7

  // Base attributes = species base + free points
  const baseAttributes = useMemo(() => {
    const specBase = species?.base_attributes || {}
    const base = ATTR_KEYS.reduce((o, k) => ({ ...o, [k]: specBase[k] ?? 8 }), {})
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

  // Base skills (from culture skill_bonuses + profession skills)
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
    return skills
  }, [culture, profession])

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

  // Species free points total used
  const speciesFreeUsed = Object.values(speciesFreePoints).reduce((s, v) => s + v, 0)

  // Magic/blessed flags
  const isMagic = species?.magic_capable || false
  const isBlessed = species?.blessed_capable || false

  // ── AP Computation ──
  const apBudget = useMemo(() => {
    if (!gradeData) return { total: 0, speciesAP: 0, cultureAP: 0, professionAP: 0, freeAP: 0, attrSpend: 0, skillSpend: 0, ktSpend: 0, vorteileAP: 0, nachteileRefund: 0, remaining: 0 }

    const total = gradeData.ap
    const speciesAP = species?.ap_cost || 0
    const cultureAP = culture?.ap_cost || 0
    const professionAP = profession?.ap_cost || 0
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
      const sf = TALENT_CATEGORIES.find(c => c.talents.includes(talentName))?.sf || 'B'
      for (let i = 0; i < delta; i++) {
        skillSpend += getSkillCost(base + i, sf)
      }
    }

    // KT spend
    let ktSpend = 0
    for (const [ktName, delta] of Object.entries(ktUpgrades)) {
      const base = baseKT[ktName] || 6
      const ktd = KT_DATA.find(k => k.name === ktName)
      const sf = ktd?.sf || 'C'
      for (let i = 0; i < delta; i++) {
        ktSpend += getSkillCost(base + i, sf)
      }
    }

    const vorteileAP = vorteile.reduce((s, v) => s + v.ap, 0)
    const nachteileRefund = Math.min(80, nachteile.reduce((s, n) => s + n.ap, 0))

    const remaining = freeAP - attrSpend - skillSpend - ktSpend - vorteileAP + nachteileRefund

    return { total, speciesAP, cultureAP, professionAP, freeAP, attrSpend, skillSpend, ktSpend, vorteileAP, nachteileRefund, remaining }
  }, [gradeData, species, culture, profession, attrUpgrades, baseAttributes, talentUpgrades, baseSkills, ktUpgrades, baseKT, vorteile, nachteile])

  // ── Derived values ──
  const derivedValues = useMemo(() => {
    const a = finalAttributes
    return {
      LeP_max:   a.KO * 2,
      AsP_max:   isMagic ? Math.ceil((a.MU + a.IN + a.CH) / 2) : 0,
      KaP_max:   isBlessed ? Math.ceil((a.MU + a.KL + a.IN) / 2) : 0,
      GS:        species?.gs_base || 8,
      INI_basis: Math.floor((a.MU + a.GE) / 2),
      AW:        Math.floor(a.GE / 2),
      WS:        Math.ceil(a.KO / 2),
      SB:        Math.max(0, Math.floor((a.KK - 15) / 3)),
      SK:        Math.floor((a.MU + a.KL + a.IN) / 3) + (species?.sk_modifier || 0),
      ZK:        Math.floor((a.KO + a.KO + a.KK) / 3) + (species?.zk_modifier || 0),
      SchiP:     3,
    }
  }, [finalAttributes, species, isMagic, isBlessed])

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
    setSpeciesFreePoints({})
    setCulture(null)
    setProfession(null)
  }, [species])

  useEffect(() => {
    setProfession(null)
  }, [culture])

  // ── Submit ──
  const handleSubmit = async () => {
    setSubmitting(true)
    setSubmitError('')

    // Build final skills dict
    const skills = { ...baseSkills }
    for (const [k, v] of Object.entries(talentUpgrades)) {
      skills[k] = (skills[k] || 0) + v
    }

    // Build final KT dict
    const combatTechniques = {}
    for (const ktd of KT_DATA) {
      const base = baseKT[ktd.name] || 6
      const upgrade = ktUpgrades[ktd.name] || 0
      combatTechniques[ktd.name] = base + upgrade
    }

    // Build advantages/disadvantages as dicts
    const advantages = {}
    for (const v of vorteile) advantages[v.name] = { ap: v.ap }
    const disadvantages = {}
    for (const n of nachteile) disadvantages[n.name] = { ap: n.ap }

    const payload = {
      name: name.trim(),
      species: species?.name || null,
      culture: culture?.name || null,
      profession: profession?.name || null,
      experience_grade: grade,
      total_ap: apBudget.total,
      available_ap: apBudget.remaining,
      bio: [nickname && `Spitzname: ${nickname}`, background].filter(Boolean).join('\n\n') || null,
      attributes: finalAttributes,
      derived_values: derivedValues,
      combat_values: { weapons: [] },
      talents: skills,
      spells: profession?.spells || {},
      liturgies: profession?.liturgies || {},
      special_abilities: profession?.special_abilities || [],
      advantages,
      disadvantages,
      basis_inventory: { items: [] },
    }

    try {
      const res = await fetch('/api/characters', {
        method: 'POST',
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
      setSubmitError(err.message || 'Charakter konnte nicht erstellt werden')
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
      if (p.requires_magic && !isMagic) return false
      if (p.requires_blessed && !isBlessed) return false
      return true
    })
  }, [species, isMagic, isBlessed, professionsAll])

  // ────────────────────────────────────────────────────────────────────────
  // Render steps
  // ────────────────────────────────────────────────────────────────────────

  const renderStep = () => {
    switch (step) {
      case 0: return <StepGrade grade={grade} setGrade={setGrade} />
      case 1: return <StepName name={name} setName={setName} nickname={nickname} setNickname={setNickname} background={background} setBackground={setBackground} />
      case 2: return <StepSpecies species={species} setSpecies={setSpecies} speciesFreePoints={speciesFreePoints} setSpeciesFreePoints={setSpeciesFreePoints} speciesFreeUsed={speciesFreeUsed} freeAttrPoints={freeAttrPoints} gradeData={gradeData} speciesAll={speciesAll} loading={apiLoading.species} error={apiError.species} onRetry={loadSpecies} />
      case 3: return <StepCulture culture={culture} setCulture={setCulture} cultures={filteredCultures} loading={apiLoading.cultures} error={apiError.cultures} onRetry={loadCultures} />
      case 4: return <StepProfession profession={profession} setProfession={setProfession} professions={filteredProfessions} gradeData={gradeData} loading={apiLoading.professions} error={apiError.professions} onRetry={loadProfessions} />
      case 5: return <StepVorNachteile vorteile={vorteile} setVorteile={setVorteile} nachteile={nachteile} setNachteile={setNachteile} apBudget={apBudget} />
      case 6: return <StepAttributes baseAttributes={baseAttributes} attrUpgrades={attrUpgrades} setAttrUpgrades={setAttrUpgrades} gradeData={gradeData} apBudget={apBudget} derivedValues={derivedValues} />
      case 7: return <StepTalentsKT baseSkills={baseSkills} talentUpgrades={talentUpgrades} setTalentUpgrades={setTalentUpgrades} baseKT={baseKT} ktUpgrades={ktUpgrades} setKtUpgrades={setKtUpgrades} gradeData={gradeData} apBudget={apBudget} />
      case 8: return <StepDerived derivedValues={derivedValues} isMagic={isMagic} isBlessed={isBlessed} />
      case 9: return <StepSummary name={name} nickname={nickname} species={species} culture={culture} profession={profession} grade={grade} gradeData={gradeData} finalAttributes={finalAttributes} derivedValues={derivedValues} apBudget={apBudget} vorteile={vorteile} nachteile={nachteile} isMagic={isMagic} isBlessed={isBlessed} submitError={submitError} />
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
            <h1 className="text-base font-display font-bold text-dsa-gold">Charakter erstellen</h1>
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
                onClick={() => i < step && setStep(i)}
                disabled={i > step}
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
              Charakter erstellen
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

// ── Step 1: Erfahrungsgrad ──
function StepGrade({ grade, setGrade }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-display font-semibold text-dsa-gold mb-1">Erfahrungsgrad wählen</h2>
        <p className="text-xs text-dsa-parchment-dark">Der Erfahrungsgrad bestimmt dein Start-AP-Budget und die maximalen Werte.</p>
      </div>
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
              <span className="font-display font-semibold text-dsa-parchment">{data.label}</span>
              <span className="text-sm font-mono font-bold text-dsa-gold">{data.ap} AP</span>
            </div>
            <div className="text-[10px] text-dsa-parchment-dark space-y-0.5">
              <p>Max. Eigenschaft: {data.maxAttr}</p>
              <p>Max. Talent: {data.maxSkill}</p>
              <p>Max. Kampftechnik: {data.maxKt}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Step 2: Name & Basics ──
function StepName({ name, setName, nickname, setNickname, background, setBackground }) {
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
        <div>
          <label className="block text-xs font-medium text-dsa-parchment mb-1">Hintergrund</label>
          <textarea
            value={background}
            onChange={(e) => setBackground(e.target.value)}
            placeholder="Hintergrundgeschichte (optional)"
            rows={4}
            className="input-field w-full resize-none"
          />
        </div>
      </div>
    </div>
  )
}

// ── Step 3: Species (from API) ──
function StepSpecies({ species, setSpecies, speciesFreePoints, setSpeciesFreePoints, speciesFreeUsed, freeAttrPoints, gradeData, speciesAll, loading, error, onRetry }) {
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {speciesAll.map((sp) => {
          const baseAttrs = sp.base_attributes || {}
          return (
            <button
              key={sp.id || sp.name}
              onClick={() => setSpecies(sp)}
              className={clsx(
                'text-left p-4 rounded border transition-all',
                species?.name === sp.name
                  ? 'border-dsa-gold bg-dsa-gold/10 ring-1 ring-dsa-gold/30'
                  : 'border-dsa-bg-medium bg-dsa-bg-card hover:border-dsa-gold/40'
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-display font-semibold text-dsa-parchment">{sp.name}</span>
                <span className="text-xs font-mono text-dsa-gold">{sp.ap_cost || 0} AP</span>
              </div>
              <div className="text-[10px] text-dsa-parchment-dark space-y-0.5">
                <p>GS {sp.gs_base || 8} | SK-Mod {sp.sk_modifier || 0} | ZK-Mod {sp.zk_modifier || 0}</p>
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
            </button>
          )
        })}
      </div>

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
              const atMax = gradeData && val >= gradeData.maxAttr
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
            return val > gradeData.maxAttr
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
      {cultures.length === 0 ? (
        <p className="text-sm text-dsa-parchment-dark">Keine passenden Kulturen für diese Spezies.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {cultures.map((c) => {
            const langs = (c.languages || []).map(l => typeof l === 'string' ? l : `${l.name} (${l.level})`).join(', ')
            return (
              <button
                key={c.id || c.name}
                onClick={() => setCulture(c)}
                className={clsx(
                  'text-left p-4 rounded border transition-all',
                  culture?.name === c.name
                    ? 'border-dsa-gold bg-dsa-gold/10 ring-1 ring-dsa-gold/30'
                    : 'border-dsa-bg-medium bg-dsa-bg-card hover:border-dsa-gold/40'
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-display font-semibold text-dsa-parchment">{c.name}</span>
                  <span className="text-xs font-mono text-dsa-gold">{c.ap_cost || 0} AP</span>
                </div>
                <div className="text-[10px] text-dsa-parchment-dark space-y-0.5">
                  {c.skill_bonuses && Object.keys(c.skill_bonuses).length > 0 && (
                    <p>Talente: {Object.entries(c.skill_bonuses).map(([k,v]) => `${k} +${v}`).join(', ')}</p>
                  )}
                  {langs && <p>Sprachen: {langs}</p>}
                  {c.description && <p className="text-dsa-parchment-dark/50 italic line-clamp-2">{c.description}</p>}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Step 5: Profession (from API) ──
function StepProfession({ profession, setProfession, professions, gradeData, loading, error, onRetry }) {
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
        <p className="text-xs text-dsa-parchment-dark">Wähle die Profession deines Charakters.</p>
      </div>
      {professions.length === 0 ? (
        <p className="text-sm text-dsa-parchment-dark">Keine passenden Professionen für diese Spezies.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {professions.map((p) => {
            const ct = p.combat_techniques || {}
            const hasOverLimit = gradeData && Object.values(ct).some(v => v > gradeData.maxKt)
            const skillEntries = p.skills ? Object.keys(p.skills) : []
            return (
              <button
                key={p.id || p.name}
                onClick={() => setProfession(p)}
                className={clsx(
                  'text-left p-4 rounded border transition-all',
                  profession?.name === p.name
                    ? 'border-dsa-gold bg-dsa-gold/10 ring-1 ring-dsa-gold/30'
                    : 'border-dsa-bg-medium bg-dsa-bg-card hover:border-dsa-gold/40'
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-display font-semibold text-dsa-parchment">{p.name}</span>
                  <span className="text-xs font-mono text-dsa-gold">{p.ap_cost || 0} AP</span>
                </div>
                <div className="text-[10px] text-dsa-parchment-dark space-y-0.5">
                  {Object.keys(ct).length > 0 && (
                    <p>KT: {Object.entries(ct).map(([k,v]) => `${k} ${v}`).join(', ')}</p>
                  )}
                  {skillEntries.length > 0 && (
                    <p>Talente: {skillEntries.join(', ')}</p>
                  )}
                  {(p.special_abilities || []).length > 0 && (
                    <p>SF: {p.special_abilities.join(', ')}</p>
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
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Step 6: Vor- & Nachteile ──
function StepVorNachteile({ vorteile, setVorteile, nachteile, setNachteile, apBudget }) {
  const totalNachteilRefund = nachteile.reduce((s, n) => s + n.ap, 0)
  const cappedRefund = Math.min(80, totalNachteilRefund)

  const toggleVorteil = (v) => {
    const idx = vorteile.findIndex(x => x.name === v.name)
    if (idx >= 0) setVorteile(vorteile.filter((_, i) => i !== idx))
    else setVorteile([...vorteile, v])
  }

  const toggleNachteil = (n) => {
    const idx = nachteile.findIndex(x => x.name === n.name)
    if (idx >= 0) setNachteile(nachteile.filter((_, i) => i !== idx))
    else setNachteile([...nachteile, n])
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-display font-semibold text-dsa-gold mb-1">Vor- & Nachteile</h2>
        <p className="text-xs text-dsa-parchment-dark">Vorteile kosten AP, Nachteile geben AP zurück (max. 80 AP).</p>
      </div>

      <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-3 flex flex-wrap gap-4 text-xs">
        <div>
          <span className="text-dsa-parchment-dark">Vorteile: </span>
          <span className="font-mono font-bold text-red-400">-{apBudget.vorteileAP} AP</span>
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
          <div className="space-y-1">
            {VORTEILE_PRESETS.map((v) => {
              const active = vorteile.some(x => x.name === v.name)
              return (
                <button
                  key={v.name}
                  onClick={() => toggleVorteil(v)}
                  className={clsx(
                    'w-full text-left px-3 py-2 rounded border text-xs transition-all flex items-center justify-between',
                    active
                      ? 'border-green-700 bg-green-900/20 text-green-300'
                      : 'border-dsa-bg-medium bg-dsa-bg-card text-dsa-parchment-dark hover:border-green-800'
                  )}
                >
                  <span>{v.name}</span>
                  <span className="font-mono text-red-400">{v.ap} AP</span>
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-display font-semibold text-red-400 mb-2">Nachteile</h3>
          <div className="space-y-1">
            {NACHTEILE_PRESETS.map((n) => {
              const active = nachteile.some(x => x.name === n.name)
              return (
                <button
                  key={n.name}
                  onClick={() => toggleNachteil(n)}
                  className={clsx(
                    'w-full text-left px-3 py-2 rounded border text-xs transition-all flex items-center justify-between',
                    active
                      ? 'border-red-700 bg-red-900/20 text-red-300'
                      : 'border-dsa-bg-medium bg-dsa-bg-card text-dsa-parchment-dark hover:border-red-800'
                  )}
                >
                  <span>{n.name}</span>
                  <span className="font-mono text-green-400">+{n.ap} AP</span>
                </button>
              )
            })}
          </div>
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
        <p className="text-xs text-dsa-parchment-dark">Steigere deine Attribute mit freien AP. Max: {gradeData?.maxAttr || '?'}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ATTR_KEYS.map(attr => {
          const base = baseAttributes[attr] || 8
          const delta = attrUpgrades[attr] || 0
          const val = base + delta
          const atMax = gradeData && val >= gradeData.maxAttr
          const nextCost = getAttrCost(val)
          return (
            <div
              key={attr}
              className={clsx(
                'flex items-center justify-between bg-dsa-bg-card border rounded p-3',
                atMax ? 'border-red-800/40' : 'border-dsa-bg-medium'
              )}
            >
              <div className="flex items-center gap-2">
                <TipAbbr term={attr} className={clsx('text-sm font-semibold', ATTR_META[attr].color)} />
                <span className="text-xs text-dsa-parchment-dark">{ATTR_META[attr].name}</span>
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

function DerivedChip({ label, value }) {
  return (
    <div className="flex items-center gap-1 bg-dsa-bg rounded px-2 py-1">
      <TipAbbr term={label} className="text-dsa-gold font-semibold" />
      <span className="font-mono text-dsa-parchment">{value}</span>
    </div>
  )
}

// ── Step 8: Talente & Kampftechniken ──
function StepTalentsKT({ baseSkills, talentUpgrades, setTalentUpgrades, baseKT, ktUpgrades, setKtUpgrades, gradeData, apBudget }) {
  const [activeTab, setActiveTab] = useState('talents')

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-display font-semibold text-dsa-gold mb-1">Talente & Kampftechniken</h2>
        <p className="text-xs text-dsa-parchment-dark">Steigere Talente und Kampftechniken mit freien AP.</p>
      </div>

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
      </div>

      {activeTab === 'talents' ? (
        <div className="space-y-4">
          {TALENT_CATEGORIES.map(cat => (
            <div key={cat.id}>
              <h3 className={clsx('text-xs font-semibold mb-2', cat.color)}>{cat.label}</h3>
              <div className="space-y-1">
                {cat.talents.map(talent => {
                  const base = baseSkills[talent] || 0
                  const delta = talentUpgrades[talent] || 0
                  const val = base + delta
                  const atMax = gradeData && val >= gradeData.maxSkill
                  const nextCost = getSkillCost(val, cat.sf)
                  return (
                    <div key={talent} className="flex items-center justify-between bg-dsa-bg-card border border-dsa-bg-medium rounded px-3 py-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-dsa-parchment truncate">{talent}</span>
                        {base > 0 && <span className="text-[10px] text-dsa-parchment-dark/50">Basis: {base}</span>}
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
      ) : (
        <div className="space-y-1">
          {KT_DATA.map(kt => {
            const base = baseKT[kt.name] || 6
            const delta = ktUpgrades[kt.name] || 0
            const val = base + delta
            const atMax = gradeData && val >= gradeData.maxKt
            const nextCost = getSkillCost(val, kt.sf)
            return (
              <div key={kt.name} className="flex items-center justify-between bg-dsa-bg-card border border-dsa-bg-medium rounded px-3 py-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-dsa-parchment truncate">{kt.name}</span>
                  <span className="text-[10px] text-dsa-parchment-dark/50">
                    {kt.type === 'ranged' ? 'Fern' : 'Nah'} | SF {kt.sf}
                  </span>
                  {base > 6 && <span className="text-[10px] text-dsa-gold/60">Basis: {base}</span>}
                </div>
                <IncDec
                  value={val}
                  onInc={() => setKtUpgrades(p => ({ ...p, [kt.name]: delta + 1 }))}
                  onDec={() => {
                    setKtUpgrades(p => {
                      const next = { ...p, [kt.name]: delta - 1 }
                      if (next[kt.name] <= 0) delete next[kt.name]
                      return next
                    })
                  }}
                  disableInc={atMax || apBudget.remaining < nextCost}
                  disableDec={delta <= 0 || val <= 6}
                  cost={nextCost}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Step 9: Abgeleitete Werte ──
function StepDerived({ derivedValues, isMagic, isBlessed }) {
  const rows = [
    { term: 'LeP', label: 'Lebenspunkte', value: derivedValues.LeP_max, show: true },
    { term: 'AsP', label: 'Astralpunkte', value: derivedValues.AsP_max, show: isMagic },
    { term: 'KaP', label: 'Karmapunkte', value: derivedValues.KaP_max, show: isBlessed },
    { term: 'GS', label: 'Geschwindigkeit', value: derivedValues.GS, show: true },
    { term: 'INI', label: 'Initiative (Basis)', value: derivedValues.INI_basis, show: true },
    { term: 'AW', label: 'Ausweichen', value: derivedValues.AW, show: true },
    { term: 'WS', label: 'Wundschwelle', value: derivedValues.WS, show: true },
    { term: 'SB', label: 'Schadensbonus', value: derivedValues.SB, show: true },
    { term: 'SK', label: 'Seelenkraft', value: derivedValues.SK, show: true },
    { term: 'ZK', label: 'Zähigkeit', value: derivedValues.ZK, show: true },
    { term: 'SchiP', label: 'Schicksalspunkte', value: derivedValues.SchiP, show: true },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-display font-semibold text-dsa-gold mb-1">Abgeleitete Werte</h2>
        <p className="text-xs text-dsa-parchment-dark">Diese Werte ergeben sich aus deinen Attributen und der Spezies.</p>
      </div>
      <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded divide-y divide-dsa-bg-medium">
        {rows.filter(r => r.show).map(r => (
          <div key={r.term} className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <TipAbbr term={r.term} className="text-sm font-semibold text-dsa-gold" />
              <span className="text-xs text-dsa-parchment-dark">{r.label}</span>
            </div>
            <span className="text-sm font-mono font-bold text-dsa-parchment">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Step 10: Zusammenfassung ──
function StepSummary({ name, nickname, species, culture, profession, grade, gradeData, finalAttributes, derivedValues, apBudget, vorteile, nachteile, isMagic, isBlessed, submitError }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-display font-semibold text-dsa-gold mb-1">Zusammenfassung</h2>
        <p className="text-xs text-dsa-parchment-dark">Prüfe deinen Charakter vor dem Erstellen.</p>
      </div>

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

      <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4">
        <h3 className="text-sm font-display font-semibold text-dsa-parchment mb-2">Attribute</h3>
        <div className="grid grid-cols-4 gap-2">
          {ATTR_KEYS.map(attr => (
            <div key={attr} className="text-center bg-dsa-bg rounded p-2">
              <div className={clsx('text-xs font-semibold', ATTR_META[attr].color)}>{attr}</div>
              <div className="text-lg font-mono font-bold text-dsa-parchment">{finalAttributes[attr]}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4">
        <h3 className="text-sm font-display font-semibold text-dsa-parchment mb-2">Abgeleitete Werte</h3>
        <div className="flex flex-wrap gap-2">
          <DerivedChip label="LeP" value={derivedValues.LeP_max} />
          {isMagic && <DerivedChip label="AsP" value={derivedValues.AsP_max} />}
          {isBlessed && <DerivedChip label="KaP" value={derivedValues.KaP_max} />}
          <DerivedChip label="GS" value={derivedValues.GS} />
          <DerivedChip label="INI" value={derivedValues.INI_basis} />
          <DerivedChip label="AW" value={derivedValues.AW} />
          <DerivedChip label="WS" value={derivedValues.WS} />
          <DerivedChip label="SK" value={derivedValues.SK} />
          <DerivedChip label="ZK" value={derivedValues.ZK} />
          <DerivedChip label="SchiP" value={derivedValues.SchiP} />
        </div>
      </div>

      {(vorteile.length > 0 || nachteile.length > 0) && (
        <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4">
          <h3 className="text-sm font-display font-semibold text-dsa-parchment mb-2">Vor- & Nachteile</h3>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              {vorteile.map(v => (
                <div key={v.name} className="flex justify-between text-green-400">
                  <span>{v.name}</span>
                  <span className="font-mono">{v.ap} AP</span>
                </div>
              ))}
            </div>
            <div>
              {nachteile.map(n => (
                <div key={n.name} className="flex justify-between text-red-400">
                  <span>{n.name}</span>
                  <span className="font-mono">+{n.ap} AP</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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
