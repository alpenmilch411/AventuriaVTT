import { useState } from 'react'
import { X, Loader2, Plus } from 'lucide-react'
import useDatenbankStore from '../../stores/datenbankStore'

// ---------------------------------------------------------------------------
// Normalized option lists (from DB)
// ---------------------------------------------------------------------------

const ATTR_KEYS = ['MU', 'KL', 'IN', 'CH', 'FF', 'GE', 'KO', 'KK']

const COMBAT_TECHNIQUES = [
  'Armbrüste', 'Äxte', 'Blasrohre', 'Bögen', 'Dolche', 'Fechtwaffen',
  'Hiebwaffen', 'Kettenwaffen', 'Raufen', 'Schwerter', 'Stangenwaffen',
  'Wurfwaffen', 'Zweihandäxte', 'Zweihandschwerter',
]

const WEAPON_PROPERTIES = [
  'anderthalbhändig', 'elfisch', 'fesselnd', 'flexibel', 'geweiht',
  'improvisiert', 'primitiv', 'tulamidisch', 'wuchtig', 'zwergisch',
]

const SPELL_TRADITIONS = [
  'Gildenmagier', 'Hexen', 'Elfen', 'Druiden', 'Scharlatane',
  'Kristallomanten', 'Schelmenzauberer', 'Geoden', 'Zauberbarden',
  'Zaubertänzer', 'Animisten',
]

const LITURGY_TRADITIONS = [
  'Praios', 'Rondra', 'Efferd', 'Travia', 'Phex', 'Peraine',
  'Ingerimm', 'Firun', 'Tsade', 'Hesinde', 'Rahja', 'Boron',
  'Nandus', 'Tsa', 'Aves', 'alle Kirchen',
]

const ITEM_CATEGORY_OPTIONS = [
  { value: 'trank',           label: 'Trank' },
  { value: 'heilkraut',       label: 'Heilkraut' },
  { value: 'alchemie',        label: 'Alchemie' },
  { value: 'munition',        label: 'Munition' },
  { value: 'werkzeug',        label: 'Werkzeug' },
  { value: 'licht',           label: 'Licht' },
  { value: 'proviant',        label: 'Proviant' },
  { value: 'schatz',          label: 'Schatz' },
  { value: 'ausruestung',     label: 'Ausrüstung' },
  { value: 'behaelter',       label: 'Behälter' },
  { value: 'gift',            label: 'Gift' },
  { value: 'verbrauchsmaterial', label: 'Verbrauchsmaterial' },
  { value: 'unterhaltung',    label: 'Unterhaltung' },
  { value: 'krankheit',       label: 'Krankheit' },
]

// These categories auto-enable the usable/consumable flags
const USABLE_ITEM_CATEGORIES = ['trank', 'alchemie', 'gift', 'heilkraut']

const TALENT_CATEGORY_OPTIONS = [
  { value: 'körper',      label: 'Körper' },
  { value: 'gesellschaft', label: 'Gesellschaft' },
  { value: 'natur',       label: 'Natur' },
  { value: 'wissen',      label: 'Wissen' },
  { value: 'handwerk',    label: 'Handwerk' },
]

const SA_CATEGORY_OPTIONS = [
  { value: 'nahkampf',           label: 'Nahkampf' },
  { value: 'fernkampf',          label: 'Fernkampf' },
  { value: 'allgemein',          label: 'Allgemein' },
  { value: 'allgemein_nichtkampf', label: 'Allgemein (Nichtkampf)' },
  { value: 'magisch',            label: 'Magisch' },
  { value: 'karmal',             label: 'Karmal' },
]

// Structured combat-value fields for creatures (all 10 from DB)
const COMBAT_VALUE_FIELDS = [
  { key: 'LeP',      label: 'LeP' },
  { key: 'INI_basis', label: 'INI' },
  { key: 'GS',       label: 'GS' },
  { key: 'AW',       label: 'AW' },
  { key: 'RS',       label: 'RS' },
  { key: 'SK',       label: 'SK' },
  { key: 'ZK',       label: 'ZK' },
  { key: 'Schip',    label: 'SchiP' },
  { key: 'AsP',      label: 'AsP' },
  { key: 'KaP',      label: 'KaP' },
]

// Effect definitions for the EffectsBuilder
export const EFFECT_DEFS = [
  { key: 'heal_lep',       label: 'Heilt LeP',                 type: 'dice' },
  { key: 'restore_asp',    label: 'Stellt AsP wieder her',     type: 'number' },
  { key: 'restore_kap',    label: 'Stellt KaP wieder her',     type: 'number' },
  { key: 'cure_poison',    label: 'Heilt Vergiftung',          type: 'bool' },
  { key: 'cure_disease',   label: 'Heilt Krankheit',           type: 'bool' },
  { key: 'kk_bonus',       label: 'KK-Bonus',                  type: 'number' },
  { key: 'ge_bonus',       label: 'GE-Bonus',                  type: 'number' },
  { key: 'mu_bonus',       label: 'MU-Bonus',                  type: 'number' },
  { key: 'in_bonus',       label: 'IN-Bonus',                  type: 'number' },
  { key: 'kl_bonus',       label: 'KL-Bonus',                  type: 'number' },
  { key: 'ch_bonus',       label: 'CH-Bonus',                  type: 'number' },
  { key: 'ko_bonus',       label: 'KO-Bonus',                  type: 'number' },
  { key: 'ff_bonus',       label: 'FF-Bonus',                  type: 'number' },
  { key: 'fire_damage',    label: 'Feuerschaden (TP)',         type: 'dice' },
  { key: 'stun_damage',    label: 'Betäubungsschaden (TP)',    type: 'dice' },
  { key: 'poison_damage',  label: 'Giftschaden (TP)',          type: 'dice' },
  { key: 'smoke_cloud',    label: 'Rauchschwade',              type: 'bool' },
  { key: 'light_radius',   label: 'Lichtradius (Schritt)',     type: 'number' },
  { key: 'bleed',          label: 'Blutung',                   type: 'bool' },
  { key: 'nightvision',    label: 'Nachtsicht',                type: 'bool' },
  { key: 'heal_bonus',     label: 'Heilung-Bonus',             type: 'number' },
  { key: 'antitoxin',      label: 'Entgiftend',                type: 'bool' },
  { key: 'bleeding_stop',  label: 'Stoppt Blutung',            type: 'bool' },
]

// ---------------------------------------------------------------------------
// Dice helpers
// ---------------------------------------------------------------------------

export function parseDice(str) {
  if (!str) return { count: 1, die: 6, flat: 0 }
  const m = String(str).match(/^(\d+)[Ww](\d+)([+-]\d+)?$/)
  if (!m) return { count: 1, die: 6, flat: 0 }
  return { count: parseInt(m[1]), die: parseInt(m[2]), flat: m[3] ? parseInt(m[3]) : 0 }
}

export function formatDice({ count, die, flat }) {
  const c = Number(count) || 1
  const d = Number(die) || 6
  const f = Number(flat) || 0
  if (f === 0) return `${c}W${d}`
  return `${c}W${d}${f > 0 ? '+' : ''}${f}`
}

// ---------------------------------------------------------------------------
// Field definitions per category
// ---------------------------------------------------------------------------

export const CATEGORY_LABELS = {
  creatures:        'Kreatur',
  weapons:          'Waffe',
  armor:            'Rüstung',
  shields:          'Schild',
  items:            'Gegenstand',
  spells:           'Zauber',
  liturgies:        'Liturgie',
  special_abilities: 'Sonderfertigkeit',
  talents:          'Talent',
}

export function getFieldDefs(category) {
  switch (category) {
    case 'creatures':
      return [
        { key: 'name',          label: 'Name',           type: 'text',   required: true },
        { key: 'category',      label: 'Typ',            type: 'text',   placeholder: 'Tier, Chimäre, Dämon, Untot …' },
        { key: 'size',          label: 'Größe',          type: 'select',
          options: ['winzig','klein','mittel','groß','riesig'].map(v => ({ value: v, label: v.charAt(0).toUpperCase()+v.slice(1) })) },
        { key: 'attributes',    label: 'Attribute',      type: 'attributes' },
        { key: 'combat_values', label: 'Kampfwerte',     type: 'combat_grid' },
        { key: 'attacks',       label: 'Angriffe',       type: 'json',
          placeholder: '[{"name":"Biss","AT":12,"TP":"1W6+4","reach":"kurz"}]' },
        { key: 'special_rules', label: 'Sonderregeln',   type: 'tags',   placeholder: 'Nachtsicht, Natürlicher RS 2' },
        { key: 'challenge_rating', label: 'Herausforderung', type: 'number' },
        { key: 'behavior',      label: 'Verhalten',      type: 'textarea' },
        { key: 'tactics',       label: 'Taktik',         type: 'textarea' },
        { key: 'description',   label: 'Beschreibung',   type: 'textarea' },
      ]

    case 'weapons':
      return [
        { key: 'name',           label: 'Name',              type: 'text',   required: true },
        { key: 'combat_technique', label: 'Kampftechnik',    type: 'select', required: true,
          options: COMBAT_TECHNIQUES.map(v => ({ value: v, label: v })) },
        { key: 'damage',         label: 'TP (Schaden)',      type: 'dice',   required: true },
        { key: 'damage_type',    label: 'Schadensart',       type: 'select',
          options: ['schnitt','stich','stumpf'].map(v => ({ value: v, label: v.charAt(0).toUpperCase()+v.slice(1) })) },
        { key: 'reach',          label: 'Reichweite',        type: 'select',
          options: ['kurz','mittel','lang'].map(v => ({ value: v, label: v.charAt(0).toUpperCase()+v.slice(1) })) },
        { key: 'at_mod',         label: 'AT-Modifikator',    type: 'number', placeholder: '0' },
        { key: 'pa_mod',         label: 'PA-Modifikator',    type: 'number', placeholder: '0' },
        { key: 'two_handed',     label: 'Zweihändig',        type: 'checkbox' },
        { key: 'is_ranged',      label: 'Fernkampfwaffe',    type: 'checkbox' },
        { key: 'range_brackets', label: 'Entfernungsstufen', type: 'text',   placeholder: 'Nah/Mittel/Weit',
          showIf: (fd) => !!fd.is_ranged },
        { key: 'reload_time',    label: 'Ladezeit',          type: 'select',
          options: ['sofort','1 Aktion','2 Aktionen','3 Aktionen','1 KR','2 KR'].map(v => ({ value: v, label: v })),
          showIf: (fd) => !!fd.is_ranged },
        { key: 'ammunition',     label: 'Munitionstyp',      type: 'text',   placeholder: 'Pfeile',
          showIf: (fd) => !!fd.is_ranged },
        { key: 'availability',   label: 'Verfügbarkeit',     type: 'select',
          options: ['überall','häufig','selten'].map(v => ({ value: v, label: v.charAt(0).toUpperCase()+v.slice(1) })) },
        { key: 'weight',         label: 'Gewicht (Stein)',   type: 'number', step: '0.25' },
        { key: 'price',          label: 'Preis (Silber)',    type: 'number', step: '0.5' },
        { key: 'properties',     label: 'Eigenschaften',     type: 'multiselect', options: WEAPON_PROPERTIES },
        { key: 'description',    label: 'Beschreibung',      type: 'textarea' },
      ]

    case 'armor':
      return [
        { key: 'name',        label: 'Name',                  type: 'text',   required: true },
        { key: 'rs',          label: 'RS (Rüstungsschutz)',   type: 'number', required: true },
        { key: 'be',          label: 'BE (Behinderung)',      type: 'number' },
        { key: 'weight',      label: 'Gewicht (Stein)',       type: 'number', step: '0.25' },
        { key: 'price',       label: 'Preis (Silber)',        type: 'number', step: '0.5' },
        { key: 'description', label: 'Beschreibung',         type: 'textarea' },
      ]

    case 'shields':
      return [
        { key: 'name',    label: 'Name',            type: 'text',   required: true },
        { key: 'size',    label: 'Größe',           type: 'select',
          options: ['klein','mittel','groß'].map(v => ({ value: v, label: v.charAt(0).toUpperCase()+v.slice(1) })) },
        { key: 'at_mod',  label: 'AT-Modifikator',  type: 'number' },
        { key: 'pa_mod',  label: 'PA-Modifikator',  type: 'number' },
        { key: 'weight',  label: 'Gewicht (Stein)', type: 'number', step: '0.25' },
        { key: 'price',   label: 'Preis (Silber)',  type: 'number', step: '0.5' },
        { key: 'description', label: 'Beschreibung', type: 'textarea' },
      ]

    case 'items':
      return [
        { key: 'name',           label: 'Name',                      type: 'text',   required: true },
        { key: 'category',       label: 'Kategorie',                 type: 'select', required: true,
          options: ITEM_CATEGORY_OPTIONS },
        { key: 'weight',         label: 'Gewicht (Stein)',           type: 'number', step: '0.25' },
        { key: 'price',          label: 'Preis (Silber)',            type: 'number', step: '0.5' },
        { key: 'stackable',      label: 'Stapelbar',                 type: 'checkbox' },
        { key: 'max_stack',      label: 'Max. Stapelgröße',          type: 'number',
          showIf: (fd) => !!fd.stackable },
        { key: 'usable',         label: 'Benutzbar (im Inventar)',   type: 'checkbox' },
        { key: 'usable_in_combat', label: 'Im Kampf nutzbar',        type: 'checkbox',
          showIf: (fd) => !!fd.usable },
        { key: 'use_action_cost', label: 'Aktionskosten',            type: 'select',
          options: ['sofort','1 Aktion','2 Aktionen','3 Aktionen','1 KR','2 KR'].map(v => ({ value: v, label: v })),
          showIf: (fd) => !!fd.usable },
        { key: 'consumable',     label: 'Verbrauchbar (einmalig)',   type: 'checkbox',
          showIf: (fd) => !!fd.usable },
        { key: 'charges',        label: 'Ladungen',                  type: 'number',
          showIf: (fd) => !!fd.usable && !!fd.consumable },
        { key: 'effects',        label: 'Effekte',                   type: 'effects',
          showIf: (fd) => !!fd.usable },
        { key: 'description',    label: 'Beschreibung',              type: 'textarea' },
      ]

    case 'spells':
      return [
        { key: 'name',         label: 'Name',           type: 'text',        required: true },
        { key: 'probe',        label: 'Probe',          type: 'probe',       required: true },
        { key: 'tradition',    label: 'Tradition',      type: 'multiselect', options: SPELL_TRADITIONS },
        { key: 'check_mod',    label: 'Erschwernis',    type: 'number',      placeholder: '0' },
        { key: 'asp_cost',     label: 'AsP-Kosten',     type: 'text', required: true, placeholder: '8 AsP' },
        { key: 'casting_time', label: 'Zauberdauer',    type: 'text', required: true, placeholder: '2 Aktionen' },
        { key: 'range',        label: 'Reichweite',     type: 'text',                  placeholder: '8 Schritt' },
        { key: 'duration',     label: 'Wirkungsdauer',  type: 'text', required: true, placeholder: 'QS × 3 KR' },
        { key: 'target',       label: 'Ziel',           type: 'text', required: true, placeholder: 'Zone' },
        { key: 'damage',       label: 'Schaden',        type: 'text',        placeholder: 'QS × 1W6 SP' },
        { key: 'description',  label: 'Beschreibung',   type: 'textarea' },
      ]

    case 'liturgies':
      return [
        { key: 'name',         label: 'Name',              type: 'text',        required: true },
        { key: 'probe',        label: 'Probe',             type: 'probe',       required: true },
        { key: 'tradition',    label: 'Gottheit',          type: 'multiselect', options: LITURGY_TRADITIONS },
        { key: 'check_mod',    label: 'Erschwernis',       type: 'number',      placeholder: '0' },
        { key: 'kap_cost',     label: 'KaP-Kosten',        type: 'text', required: true, placeholder: '8 KaP' },
        { key: 'casting_time', label: 'Liturgiedauer',     type: 'text', required: true, placeholder: '4 Aktionen' },
        { key: 'range',        label: 'Reichweite',        type: 'text',                  placeholder: 'Berührung' },
        { key: 'duration',     label: 'Wirkungsdauer',     type: 'text', required: true, placeholder: 'sofort' },
        { key: 'target',       label: 'Ziel',              type: 'text',        placeholder: 'Kulturschaffende' },
        { key: 'damage',       label: 'Schaden',           type: 'text' },
        { key: 'description',  label: 'Beschreibung',      type: 'textarea' },
      ]

    case 'special_abilities':
      return [
        { key: 'name',                  label: 'Name',                       type: 'text',        required: true },
        { key: 'category',             label: 'Kategorie',                  type: 'select',      required: true, options: SA_CATEGORY_OPTIONS },
        { key: 'ap_cost',              label: 'AP-Kosten',                  type: 'number' },
        { key: 'at_mod',               label: 'AT-Modifikator',             type: 'number' },
        { key: 'pa_mod',               label: 'PA-Modifikator',             type: 'number' },
        { key: 'damage_modifier',      label: 'TP-Modifikator',             type: 'text',        placeholder: '+2' },
        { key: 'applicable_techniques', label: 'Anwendbare Kampftechniken', type: 'multiselect', options: COMBAT_TECHNIQUES },
        { key: 'rules_text',           label: 'Regeltext',                  type: 'textarea' },
        { key: 'description',          label: 'Beschreibung',               type: 'textarea' },
      ]

    case 'talents':
      return [
        { key: 'name',        label: 'Name',                 type: 'text',        required: true },
        { key: 'category',    label: 'Kategorie',            type: 'select',      required: true, options: TALENT_CATEGORY_OPTIONS },
        { key: 'probe',       label: 'Probe',                type: 'probe',       required: true },
        { key: 'encumbrance', label: 'Belastung',            type: 'select',
          options: ['ja','nein','evtl.'].map(v => ({ value: v, label: v })) },
        { key: 'applications', label: 'Anwendungsgebiete',  type: 'tags',        placeholder: 'Klettern, Springen' },
        { key: 'description', label: 'Beschreibung',        type: 'textarea' },
      ]

    default:
      return [
        { key: 'name',        label: 'Name',        type: 'text',     required: true },
        { key: 'description', label: 'Beschreibung', type: 'textarea' },
      ]
  }
}

// ---------------------------------------------------------------------------
// Serialize form data → API payload
// ---------------------------------------------------------------------------

export function serializeFormData(fields, formData) {
  const activeFields = fields.filter(f => !f.showIf || f.showIf(formData))
  const data = {}
  let error = null

  for (const field of activeFields) {
    if (field.key === 'name') continue
    const val = formData[field.key]

    if (field.type === 'dice') {
      if (val) data[field.key] = formatDice(val)
      else if (field.required) { error = `"${field.label}" ist erforderlich`; break }

    } else if (field.type === 'effects') {
      if (!val || Object.keys(val).length === 0) continue
      const serialized = {}
      for (const [k, v] of Object.entries(val)) {
        const def = EFFECT_DEFS.find(d => d.key === k)
        serialized[k] = def?.type === 'dice' ? formatDice(v) : v
      }
      data[field.key] = serialized

    } else if (field.type === 'combat_grid') {
      if (!val) continue
      const clean = Object.fromEntries(
        Object.entries(val).filter(([, v]) => v !== undefined && v !== null && v !== '')
      )
      if (Object.keys(clean).length > 0) data[field.key] = clean

    } else if (field.type === 'tags') {
      const arr = (val || '').split(',').map(s => s.trim()).filter(Boolean)
      if (arr.length > 0) data[field.key] = arr

    } else if (field.type === 'probe') {
      const arr = Array.isArray(val) ? val.filter(Boolean) : []
      if (field.required && arr.length < 3) { error = 'Probe: Bitte alle 3 Attribute auswählen'; break }
      if (arr.length === 3) data[field.key] = arr

    } else if (field.type === 'multiselect') {
      if (Array.isArray(val) && val.length > 0) data[field.key] = val

    } else if (field.type === 'json') {
      if (val === undefined || val === '' || val === null) continue
      try { data[field.key] = JSON.parse(val) }
      catch { error = `Ungültiges JSON im Feld "${field.label}"`; break }

    } else if (field.type === 'number') {
      if (val === undefined || val === '' || val === null) {
        if (field.required) { error = `"${field.label}" ist erforderlich`; break }
        continue
      }
      data[field.key] = Number(val)

    } else if (field.type === 'checkbox') {
      if (val) data[field.key] = true

    } else if (field.type === 'attributes') {
      if (formData.attributes && Object.keys(formData.attributes).length > 0)
        data.attributes = formData.attributes

    } else {
      // text, textarea, select
      if (val === undefined || val === '' || val === null) {
        if (field.required) { error = `"${field.label}" ist erforderlich`; break }
        continue
      }
      data[field.key] = val
    }
  }

  return { data, error }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CreateEntryModal({ category, onClose }) {
  const createEntry = useDatenbankStore((s) => s.createEntry)
  const [formData, setFormData] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const fields = getFieldDefs(category)
  const categoryLabel = CATEGORY_LABELS[category] || category
  const activeFields = fields.filter(f => !f.showIf || f.showIf(formData))

  const handleChange = (key, value) => {
    setFormData((prev) => {
      const next = { ...prev, [key]: value }
      // Auto-configure usable/consumable/stackable for potion-like categories
      if (key === 'category' && category === 'items' && USABLE_ITEM_CATEGORIES.includes(value)) {
        next.usable = true
        next.consumable = true
        next.usable_in_combat = true
        next.stackable = true
        if (!next.charges) next.charges = 1
        if (!next.max_stack) next.max_stack = 10
        if (!next.use_action_cost) next.use_action_cost = '1 Aktion'
      }
      return next
    })
  }

  const handleAttrChange = (attr, value) => {
    setFormData((prev) => ({
      ...prev,
      attributes: { ...(prev.attributes || {}), [attr]: value === '' ? undefined : Number(value) },
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    const name = (formData.name || '').trim()
    if (!name) { setError('Name ist erforderlich'); return }

    const { data, error: serErr } = serializeFormData(fields, formData)
    if (serErr) { setError(serErr); return }

    const id = `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`
    setSubmitting(true)
    try {
      await createEntry(category, { id, name, data })
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-dsa-bg-light border border-dsa-bg-medium rounded-lg shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-dsa-bg-medium">
          <h2 className="text-lg font-display font-bold text-dsa-gold">
            Neuer Eintrag: {categoryLabel}
          </h2>
          <button onClick={onClose} className="text-dsa-parchment-dark hover:text-dsa-parchment">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <div className="p-3 bg-dsa-danger/10 border border-dsa-danger/30 rounded text-sm text-dsa-danger">
              {error}
            </div>
          )}
          {activeFields.map((field) => (
            <FormField
              key={field.key}
              field={field}
              value={field.type === 'attributes' ? formData.attributes : formData[field.key]}
              onChange={field.type === 'attributes' ? handleAttrChange : (val) => handleChange(field.key, val)}
            />
          ))}
        </form>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-dsa-bg-medium">
          <button type="button" onClick={onClose} className="btn-ghost text-sm">Abbrechen</button>
          <button onClick={handleSubmit} disabled={submitting} className="btn-primary flex items-center gap-2 text-sm">
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Erstellen
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DiceInput({ value, onChange }) {
  const d = (value && typeof value === 'object') ? value : parseDice(value)
  const set = (k, v) => onChange({ ...d, [k]: v })
  const preview = formatDice(d)
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <select value={d.count} onChange={e => set('count', Number(e.target.value))} className="input-field text-sm w-14">
        {[1, 2, 3].map(n => <option key={n} value={n}>{n}</option>)}
      </select>
      <span className="text-dsa-parchment-dark text-sm font-semibold">W</span>
      <select value={d.die} onChange={e => set('die', Number(e.target.value))} className="input-field text-sm w-14">
        {[3, 6, 20].map(n => <option key={n} value={n}>{n}</option>)}
      </select>
      <input
        type="number"
        value={d.flat}
        onChange={e => set('flat', Number(e.target.value))}
        className="input-field text-sm w-16 text-center"
        placeholder="+0"
      />
      <span className="text-xs text-dsa-gold font-mono bg-dsa-bg px-2 py-0.5 rounded border border-dsa-bg-medium">
        {preview}
      </span>
    </div>
  )
}

function EffectsBuilder({ value, onChange }) {
  const effects = value || {}
  const activeKeys = Object.keys(effects)
  const available = EFFECT_DEFS.filter(d => !activeKeys.includes(d.key))

  const set = (key, val) => onChange({ ...effects, [key]: val })
  const remove = (key) => { const n = { ...effects }; delete n[key]; onChange(n) }
  const add = (key) => {
    const def = EFFECT_DEFS.find(d => d.key === key)
    if (!def) return
    const init = def.type === 'dice' ? { count: 1, die: 6, flat: 0 } : def.type === 'bool' ? true : 1
    onChange({ ...effects, [key]: init })
  }

  return (
    <div className="space-y-1.5">
      {activeKeys.map(key => {
        const def = EFFECT_DEFS.find(d => d.key === key)
        const label = def?.label || key
        const type = def?.type || 'number'
        const val = effects[key]
        return (
          <div key={key} className="flex items-center gap-2 px-2 py-1.5 bg-dsa-bg rounded border border-dsa-bg-medium">
            <span className="text-xs text-dsa-parchment-dark w-36 shrink-0">{label}</span>
            {type === 'dice' && <DiceInput value={val} onChange={v => set(key, v)} />}
            {type === 'number' && (
              <input type="number" value={val ?? 0}
                onChange={e => set(key, Number(e.target.value))}
                className="input-field text-sm w-20" />
            )}
            {type === 'bool' && (
              <span className="text-xs text-dsa-success font-medium">aktiv</span>
            )}
            <button type="button" onClick={() => remove(key)} className="ml-auto text-dsa-parchment-dark/30 hover:text-red-400 flex-shrink-0">
              <X className="w-3 h-3" />
            </button>
          </div>
        )
      })}
      {available.length > 0 && (
        <select
          value=""
          onChange={e => { if (e.target.value) add(e.target.value) }}
          className="input-field text-sm w-full"
        >
          <option value="">+ Effekt hinzufügen …</option>
          {available.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>
      )}
    </div>
  )
}

function CombatGridField({ value, onChange }) {
  const grid = value || {}
  const set = (k, v) => onChange({ ...grid, [k]: v === '' ? undefined : Number(v) })
  return (
    <div className="grid grid-cols-5 gap-2">
      {COMBAT_VALUE_FIELDS.map(f => (
        <div key={f.key} className="flex flex-col items-center">
          <span className="text-xs text-dsa-gold font-semibold mb-0.5">{f.label}</span>
          <input
            type="number"
            value={grid[f.key] ?? ''}
            onChange={e => set(f.key, e.target.value)}
            className="input-field w-full text-center text-sm py-1"
            placeholder="—"
          />
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared FormField — also imported by EditEntryModal
// ---------------------------------------------------------------------------

export function FormField({ field, value, onChange }) {
  const optional = !field.required
    ? <span className="text-dsa-parchment-dark/50 text-xs font-normal ml-1">optional</span>
    : <span className="text-dsa-danger ml-1">*</span>

  if (field.type === 'attributes') {
    return (
      <div>
        <label className="block text-sm font-medium text-dsa-parchment mb-1">{field.label} {optional}</label>
        <div className="grid grid-cols-4 gap-2">
          {ATTR_KEYS.map((attr) => (
            <div key={attr} className="flex flex-col items-center">
              <span className="text-xs text-dsa-gold font-semibold mb-0.5">{attr}</span>
              <input
                type="number"
                value={value?.[attr] ?? ''}
                onChange={(e) => onChange(attr, e.target.value)}
                className="input-field w-full text-center text-sm py-1"
                placeholder="—"
              />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (field.type === 'combat_grid') {
    return (
      <div>
        <label className="block text-sm font-medium text-dsa-parchment mb-1">{field.label} {optional}</label>
        <CombatGridField value={value} onChange={onChange} />
      </div>
    )
  }

  if (field.type === 'checkbox') {
    return (
      <label className="flex items-center gap-2 text-sm text-dsa-parchment cursor-pointer">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          className="rounded border-dsa-bg-medium bg-dsa-bg-card text-dsa-gold focus:ring-dsa-gold/50"
        />
        {field.label}
      </label>
    )
  }

  if (field.type === 'textarea') {
    return (
      <div>
        <label className="block text-sm font-medium text-dsa-parchment mb-1">{field.label} {optional}</label>
        <textarea
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="input-field w-full text-sm"
          placeholder={field.placeholder}
        />
      </div>
    )
  }

  if (field.type === 'json') {
    return (
      <div>
        <label className="block text-sm font-medium text-dsa-parchment mb-1">
          {field.label} <span className="text-dsa-parchment-dark/50 text-xs font-normal">optional · JSON</span>
        </label>
        <textarea
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="input-field w-full text-sm font-mono"
          placeholder={field.placeholder}
        />
      </div>
    )
  }

  if (field.type === 'select') {
    return (
      <div>
        <label className="block text-sm font-medium text-dsa-parchment mb-1">{field.label} {optional}</label>
        <select value={value || ''} onChange={(e) => onChange(e.target.value)} className="input-field w-full text-sm">
          <option value="">— auswählen —</option>
          {field.options.map((opt) => (
            <option key={opt.value ?? opt} value={opt.value ?? opt}>{opt.label ?? opt}</option>
          ))}
        </select>
      </div>
    )
  }

  if (field.type === 'probe') {
    const arr = Array.isArray(value) ? value : []
    return (
      <div>
        <label className="block text-sm font-medium text-dsa-parchment mb-1">{field.label} {optional}</label>
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <select key={i} value={arr[i] || ''} onChange={(e) => {
              const next = [...arr]; next[i] = e.target.value; onChange(next)
            }} className="input-field text-sm">
              <option value="">—</option>
              {ATTR_KEYS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          ))}
        </div>
      </div>
    )
  }

  if (field.type === 'dice') {
    return (
      <div>
        <label className="block text-sm font-medium text-dsa-parchment mb-1">{field.label} {optional}</label>
        <DiceInput value={value} onChange={onChange} />
      </div>
    )
  }

  if (field.type === 'effects') {
    return (
      <div>
        <label className="block text-sm font-medium text-dsa-parchment mb-1">{field.label} {optional}</label>
        <EffectsBuilder value={value} onChange={onChange} />
      </div>
    )
  }

  if (field.type === 'tags') {
    return (
      <div>
        <label className="block text-sm font-medium text-dsa-parchment mb-1">
          {field.label} <span className="text-dsa-parchment-dark/50 text-xs font-normal">optional · kommagetrennt</span>
        </label>
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className="input-field w-full text-sm"
          placeholder={field.placeholder}
        />
      </div>
    )
  }

  if (field.type === 'multiselect') {
    const arr = Array.isArray(value) ? value : []
    return (
      <div>
        <label className="block text-sm font-medium text-dsa-parchment mb-1">{field.label} {optional}</label>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 p-2 bg-dsa-bg rounded border border-dsa-bg-medium">
          {field.options.map((opt) => {
            const checked = arr.includes(opt)
            return (
              <label key={opt} className="flex items-center gap-1.5 text-xs text-dsa-parchment-dark cursor-pointer hover:text-dsa-parchment">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onChange(checked ? arr.filter(v => v !== opt) : [...arr, opt])}
                  className="rounded border-dsa-bg-medium bg-dsa-bg-card text-dsa-gold focus:ring-dsa-gold/50"
                />
                {opt}
              </label>
            )
          })}
        </div>
      </div>
    )
  }

  // text / number
  return (
    <div>
      <label className="block text-sm font-medium text-dsa-parchment mb-1">{field.label} {optional}</label>
      <input
        type={field.type === 'number' ? 'number' : 'text'}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        step={field.step}
        className="input-field w-full text-sm"
        placeholder={field.placeholder}
        required={field.required}
      />
    </div>
  )
}
