import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import {
  X, ChevronLeft, ChevronRight, Check, AlertTriangle, Loader2,
  Shield, Plus, Minus, RefreshCw, Search,
} from 'lucide-react'
import clsx from 'clsx'
import useAuthStore from '../../stores/authStore'
import { TipAbbr } from '../../components/Tooltip'
import { EXPERIENCE_GRADES as ERFAHRUNGSGRADE, getAttrCost, getUpgradeCost as getSkillCost } from '../../engine/advancementCosts'

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

    // Attribute upgrades: difference between stored attributes and base (species + free points)
    // We'll compute this after a tick so species base is resolved
    setTimeout(() => {
      skipResetRef.current = false
    }, 0)
  }, [editCharacter, speciesAll, culturesAll, professionsAll])

  // ── Derived data ──
  const gradeData = grade ? ERFAHRUNGSGRADE[grade] : null
  const freeAttrPoints = species?.free_attribute_points ?? 7

  // Base attributes = species base + species attribute_adjustments + free points
  const baseAttributes = useMemo(() => {
    const specBase = species?.base_attributes || {}
    const base = ATTR_KEYS.reduce((o, k) => ({ ...o, [k]: specBase[k] ?? 8 }), {})
    // Species racial attribute adjustments (e.g. Elf: IN+1/GE+1, Zwerg: KO+1/KK+1)
    for (const [k, v] of Object.entries(species?.attribute_adjustments || {})) {
      if (ATTR_KEYS.includes(k)) base[k] = (base[k] || 8) + v
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

  // Magic/blessed flags
  const isMagic = species?.magic_capable || false
  const isBlessed = species?.blessed_capable || false

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

  // ── Derived values ──
  const derivedValues = useMemo(() => {
    const a = finalAttributes
    const lepBase = species?.lep_base || 0
    return {
      LeP_max:     lepBase + a.KO * 2,
      lep_base:    lepBase,         // persisted so server-side recompute stays accurate
      SK_modifier: species?.sk_modifier || 0,
      ZK_modifier: species?.zk_modifier || 0,
      AsP_max:   isMagic ? 20 + Math.round((a.MU + a.IN + a.CH) / 3) : 0,
      KaP_max:   isBlessed ? 20 + Math.round((a.MU + a.KL + a.IN) / 3) : 0,
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
    setProfessionVariant(null)
  }, [profession])

  // Auto-populate spells/liturgies when profession changes
  useEffect(() => {
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
      case 2: return <StepSpecies species={species} setSpecies={setSpecies} speciesVariant={speciesVariant} setSpeciesVariant={setSpeciesVariant} speciesFreePoints={speciesFreePoints} setSpeciesFreePoints={setSpeciesFreePoints} speciesFreeUsed={speciesFreeUsed} freeAttrPoints={freeAttrPoints} gradeData={gradeData} speciesAll={speciesAll} loading={apiLoading.species} error={apiError.species} onRetry={loadSpecies} />
      case 3: return <StepCulture culture={culture} setCulture={setCulture} cultures={filteredCultures} loading={apiLoading.cultures} error={apiError.cultures} onRetry={loadCultures} />
      case 4: return <StepProfession profession={profession} setProfession={setProfession} professionVariant={professionVariant} setProfessionVariant={setProfessionVariant} professions={filteredProfessions} gradeData={gradeData} loading={apiLoading.professions} error={apiError.professions} onRetry={loadProfessions} />
      case 5: return <StepVorNachteile vorteile={vorteile} setVorteile={setVorteile} nachteile={nachteile} setNachteile={setNachteile} apBudget={apBudget} species={species} advantagesAll={advantagesAll} disadvantagesAll={disadvantagesAll} loadingAdv={apiLoading.advantages} loadingDis={apiLoading.disadvantages} errorAdv={apiError.advantages} errorDis={apiError.disadvantages} onRetryAdv={loadAdvantages} onRetryDis={loadDisadvantages} />
      case 6: return <StepAttributes baseAttributes={baseAttributes} attrUpgrades={attrUpgrades} setAttrUpgrades={setAttrUpgrades} gradeData={gradeData} apBudget={apBudget} derivedValues={derivedValues} />
      case 7: return <StepTalentsKT baseSkills={baseSkills} talentUpgrades={talentUpgrades} setTalentUpgrades={setTalentUpgrades} baseKT={baseKT} ktUpgrades={ktUpgrades} setKtUpgrades={setKtUpgrades} atPaSplits={atPaSplits} setAtPaSplits={setAtPaSplits} gradeData={gradeData} apBudget={apBudget} isMagic={isMagic} isBlessed={isBlessed} professionSpells={profession?.spells} professionLiturgies={profession?.liturgies} selectedSpells={selectedSpells} setSelectedSpells={setSelectedSpells} selectedLiturgies={selectedLiturgies} setSelectedLiturgies={setSelectedLiturgies} professionSAs={profession?.special_abilities} purchasedSAs={purchasedSAs} setPurchasedSAs={setPurchasedSAs} specialAbilitiesAll={specialAbilitiesAll} loadingSAs={apiLoading.specialAbilities} errorSAs={apiError.specialAbilities} onRetrySAs={loadSpecialAbilities} talentCategories={talentCategories} ktData={ktData} />
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
function StepSpecies({ species, setSpecies, speciesVariant, setSpeciesVariant, speciesFreePoints, setSpeciesFreePoints, speciesFreeUsed, freeAttrPoints, gradeData, speciesAll, loading, error, onRetry }) {
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
function StepProfession({ profession, setProfession, professionVariant, setProfessionVariant, professions, gradeData, loading, error, onRetry }) {
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
      <HelpPanel>
        <p><strong>Was ist eine Profession?</strong> Dein Beruf/Ausbildung vor dem Abenteuerdasein. Sie gibt dir Kampftechniken, Talente und ggf. Sonderfertigkeiten und Zauber/Liturgien.</p>
        <p><strong>Kampftechniken (KT):</strong> Bestimmen, wie gut dein Held mit bestimmten Waffengattungen umgehen kann. Höhere KT-Werte = bessere AT/PA-Werte.</p>
        <p><strong>Talente:</strong> Fähigkeiten wie Klettern, Heilkunde oder Überreden. Die Profession gibt Startwerte, die du später weiter steigern kannst.</p>
        <p><strong>Sonderfertigkeiten (SF):</strong> Spezielle Fähigkeiten wie Wuchtschlag oder Rüstungsgewöhnung, die im Kampf oder Abenteuer Vorteile bringen.</p>
      </HelpPanel>
      {professions.length === 0 ? (
        <p className="text-sm text-dsa-parchment-dark">Keine passenden Professionen für diese Spezies.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {professions.map((p) => {
            const ct = p.combat_techniques || {}
            const hasOverLimit = gradeData && Object.values(ct).some(v => v > gradeData.kt)
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
                  {Array.isArray(p.variants) && p.variants.length > 0 && (
                    <p className="text-dsa-gold/60 text-[9px]">{p.variants.length} Variante(n) verfügbar</p>
                  )}
                </div>
              </button>
            )
          })}
        </div>
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
    </div>
  )
}

// ── Step 6: Vor- & Nachteile ──
function StepVorNachteile({ vorteile, setVorteile, nachteile, setNachteile, apBudget, species, advantagesAll, disadvantagesAll, loadingAdv, loadingDis, errorAdv, errorDis, onRetryAdv, onRetryDis }) {
  const autoAdvantages = species?.auto_advantages || []
  const totalVorteilCost = vorteile.reduce((s, v) => s + v.ap, 0)
  const totalNachteilRefund = nachteile.reduce((s, n) => s + n.ap, 0)
  const cappedRefund = Math.min(80, totalNachteilRefund)

  // Convert DB rows to {name, ap} format matching existing state shape
  const advPresets = useMemo(() =>
    advantagesAll.map(a => ({ name: a.name, ap: a.ap_cost, id: a.id, category: a.category, description: a.description, rules_text: a.rules_text })),
    [advantagesAll]
  )
  const disPresets = useMemo(() =>
    disadvantagesAll.map(d => ({ name: d.name, ap: d.ap_cost, id: d.id, category: d.category, description: d.description, rules_text: d.rules_text })),
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
        <p className="text-xs text-dsa-parchment-dark">Vorteile kosten AP (max. 80 AP), Nachteile geben AP zurück (max. 80 AP).</p>
      </div>
      <HelpPanel>
        <p><strong>80-AP-Deckelung:</strong> Du darfst maximal 80 AP für Vorteile ausgeben und maximal 80 AP durch Nachteile zurückbekommen. Darüber hinaus bringt es keine weiteren AP.</p>
        <p><strong>Vorteile im Spiel:</strong> Vorteile geben dauerhafte Boni (z.B. mehr LeP, Glück, bessere Sicht). Sie wirken passiv und erfordern keine Aktivierung.</p>
        <p><strong>Nachteile im Spiel:</strong> Nachteile schränken deinen Helden ein (z.B. Angst, Goldgier, niedrigere Werte). Der SL kann sie im Spiel einfordern. Sie machen den Charakter interessanter!</p>
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
          {errorAdv && <LoadError message={errorAdv} onRetry={onRetryAdv} />}
          {loadingAdv && <div className="flex items-center gap-2 py-4 text-xs text-dsa-parchment-dark"><Loader2 className="w-4 h-4 animate-spin" />Lade Vorteile...</div>}
          {!loadingAdv && !errorAdv && (
            <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
              {advPresets.map((v) => {
                const active = vorteile.some(x => x.name === v.name)
                return (
                  <button
                    key={v.name}
                    onClick={() => toggleVorteil(v)}
                    title={v.rules_text || v.description || ''}
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
          )}
        </div>

        <div>
          <h3 className="text-sm font-display font-semibold text-red-400 mb-2">Nachteile</h3>
          {errorDis && <LoadError message={errorDis} onRetry={onRetryDis} />}
          {loadingDis && <div className="flex items-center gap-2 py-4 text-xs text-dsa-parchment-dark"><Loader2 className="w-4 h-4 animate-spin" />Lade Nachteile...</div>}
          {!loadingDis && !errorDis && (
            <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
              {disPresets.map((n) => {
                const active = nachteile.some(x => x.name === n.name)
                return (
                  <button
                    key={n.name}
                    onClick={() => toggleNachteil(n)}
                    title={n.rules_text || n.description || ''}
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
          )}
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

// ── SA Selector with search & category filter ──
function SASelector({ professionSAs, purchasedSAs, setPurchasedSAs, specialAbilitiesAll, loadingSAs, errorSAs, onRetrySAs, apBudget }) {
  const [searchText, setSearchText] = useState('')
  const [activeCat, setActiveCat] = useState('alle')

  // Filter SAs by search + category, excluding profession-granted ones
  const filteredSAs = useMemo(() => {
    const query = searchText.toLowerCase().trim()
    return specialAbilitiesAll.filter(sa => {
      if (professionSAs && professionSAs.includes(sa.name)) return false
      if (activeCat !== 'alle' && sa.category !== activeCat) return false
      if (query && !sa.name.toLowerCase().includes(query)) return false
      return true
    })
  }, [specialAbilitiesAll, professionSAs, searchText, activeCat])

  const totalAvailable = specialAbilitiesAll.filter(sa => !(professionSAs && professionSAs.includes(sa.name))).length

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

            {/* Category filter tabs */}
            <div className="flex flex-wrap gap-1 mb-3">
              {SA_CATEGORY_ORDER.map(cat => {
                const meta = SA_CATEGORY_META[cat]
                const count = cat === 'alle'
                  ? totalAvailable
                  : specialAbilitiesAll.filter(sa => sa.category === cat && !(professionSAs && professionSAs.includes(sa.name))).length
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
function StepTalentsKT({ baseSkills, talentUpgrades, setTalentUpgrades, baseKT, ktUpgrades, setKtUpgrades, atPaSplits, setAtPaSplits, gradeData, apBudget, isMagic, isBlessed, professionSpells, professionLiturgies, selectedSpells, setSelectedSpells, selectedLiturgies, setSelectedLiturgies, professionSAs, purchasedSAs, setPurchasedSAs, specialAbilitiesAll, loadingSAs, errorSAs, onRetrySAs, talentCategories, ktData }) {
  const hasSpellsOrLiturgies = (isMagic && professionSpells && Object.keys(professionSpells).length > 0) || (isBlessed && professionLiturgies && Object.keys(professionLiturgies).length > 0)
  const [activeTab, setActiveTab] = useState('talents')

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-display font-semibold text-dsa-gold mb-1">Talente & Kampftechniken</h2>
        <p className="text-xs text-dsa-parchment-dark">Steigere Talente und Kampftechniken mit freien AP.</p>
      </div>
      <HelpPanel>
        <p><strong>Talentproben (3W20):</strong> Jedes Talent wird mit 3W20 gegen drei Attribute geprobt. Der Fertigkeitswert (FW) bestimmt, wie viele Punkte du zum Ausgleichen hast.</p>
        <p><strong>FW (Fertigkeitswert):</strong> Je höher, desto besser. FW 0 = ungeübt (Probe möglich, aber schwer). FW 4-8 = solide. FW 10+ = Meisterhaft.</p>
        <p><strong>Kampftechniken:</strong> Bestimmen AT (Attacke) und PA (Parade) mit einer Waffengattung. Bei Nahkampf wird der KTW in AT und PA aufgeteilt.</p>
        <p><strong>AT/PA-Verteilung:</strong> Der Kampftechnikwert (KTW) wird auf Attacke und Parade verteilt. Offensiv: mehr AT. Defensiv: mehr PA. Die Summe muss immer gleich KTW sein.</p>
        <p><strong>Steigerungsfaktor (SF):</strong> A ist am billigsten, E am teuersten. SF bestimmt die AP-Kosten pro Stufe.</p>
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
                      {kt.type === 'ranged' ? 'Fern' : 'Nah'} | SF {kt.sf}
                    </span>
                    {base > 6 && <span className="text-[10px] text-dsa-gold/60">Basis: {base}</span>}
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
                  <div className="flex items-center gap-3 mt-1.5 pl-2">
                    <span className="text-[10px] text-dsa-parchment-dark">AT/PA-Verteilung:</span>
                    <div className="flex items-center gap-1">
                      <label className="text-[10px] text-red-400 font-semibold">AT</label>
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
                      <label className="text-[10px] text-blue-400 font-semibold">PA</label>
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
        />
      ) : null}
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
      <HelpPanel>
        <p><strong>LeP (Lebenspunkte):</strong> Spezies-Basis + KO x 2. Bestimmt Überlebensfähigkeit.</p>
        <p><strong>AsP/KaP:</strong> Magische/göttliche Energie. Nur für Zauberer (AsP) bzw. Geweihte (KaP).</p>
        <p><strong>INI (Initiative):</strong> (MU+GE)/2. Bestimmt Handlungsreihenfolge im Kampf (+1W6).</p>
        <p><strong>AW (Ausweichen):</strong> GE/2. Alternative zur Parade ohne Waffe.</p>
        <p><strong>SK (Seelenkraft):</strong> Widerstand gegen Geisteszauber. ZK (Zähigkeit): Widerstand gegen Körperzauber/-gifte.</p>
        <p><strong>SchiP:</strong> 3 Schicksalspunkte. Können im Spiel für Probe wiederholen, Schaden halbieren oder Extra-Reaktion eingesetzt werden.</p>
        <p>Diese Werte können hier nicht direkt geändert werden. Gehe zurück zu Schritt 7, um Attribute anzupassen.</p>
      </HelpPanel>
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
      <HelpPanel>
        <p><strong>AP-Bilanz:</strong> Die Übersicht zeigt, wie deine AP ausgegeben wurden. Verbleibende AP stehen dir im Spiel für Steigerungen zur Verfügung.</p>
        <p><strong>Prüfe folgendes:</strong> Stimmen die Attribute? Hast du die richtigen Vor-/Nachteile? Sind die Talente sinnvoll verteilt?</p>
        <p><strong>Nach der Erstellung:</strong> Du kannst den Charakter im Nachhinein bearbeiten und mit verdienten AP weiter steigern.</p>
      </HelpPanel>

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
