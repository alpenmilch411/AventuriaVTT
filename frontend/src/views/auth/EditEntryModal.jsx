import { useState, useMemo } from 'react'
import { X, Loader2 } from 'lucide-react'
import useDatenbankStore from '../../stores/datenbankStore'
import { getFieldDefs, CATEGORY_LABELS, serializeFormData, FormField, parseDice, EFFECT_DEFS } from './CreateEntryModal'

export default function EditEntryModal({ category, entry, onClose }) {
  const updateEntry = useDatenbankStore((s) => s.updateEntry)

  const initialData = useMemo(() => {
    const init = {}
    const fields = getFieldDefs(category)
    const source = entry.data ? { ...entry.data, name: entry.name } : entry

    for (const field of fields) {
      const val = source[field.key]
      if (val === undefined || val === null) continue

      if (field.type === 'dice') {
        init[field.key] = parseDice(String(val))
      } else if (field.type === 'effects') {
        // Convert stored dice strings back to dice objects for the builder
        const eff = {}
        const src = typeof val === 'object' ? val : {}
        for (const [k, v] of Object.entries(src)) {
          const def = EFFECT_DEFS.find(d => d.key === k)
          eff[k] = def?.type === 'dice' ? parseDice(String(v)) : v
        }
        init[field.key] = eff
      } else if (field.type === 'combat_grid') {
        init[field.key] = typeof val === 'object' ? val : {}
      } else if (field.type === 'tags') {
        init[field.key] = Array.isArray(val) ? val.join(', ') : String(val)
      } else if (field.type === 'probe' || field.type === 'multiselect') {
        init[field.key] = Array.isArray(val) ? val : (typeof val === 'string' ? JSON.parse(val) : [])
      } else if (field.type === 'json') {
        init[field.key] = JSON.stringify(val, null, 2)
      } else if (field.type === 'attributes') {
        init.attributes = val
      } else {
        init[field.key] = val
      }
    }
    return init
  }, [category, entry])

  const [formData, setFormData] = useState(initialData)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const fields = getFieldDefs(category)
  const categoryLabel = CATEGORY_LABELS[category] || category
  const entryId = entry.id
  const activeFields = fields.filter(f => !f.showIf || f.showIf(formData))

  const handleChange = (key, value) => setFormData((prev) => ({ ...prev, [key]: value }))

  const handleAttrChange = (attr, value) => {
    setFormData((prev) => ({
      ...prev,
      attributes: { ...(prev.attributes || {}), [attr]: value === '' ? undefined : Number(value) },
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    const name = (formData.name?.trim ? formData.name.trim() : formData.name) || ''
    if (!name) { setError('Name ist erforderlich'); return }

    const { data, error: serErr } = serializeFormData(fields, formData)
    if (serErr) { setError(serErr); return }

    setSubmitting(true)
    try {
      await updateEntry(category, entryId, { name, data })
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
            Bearbeiten: {categoryLabel}
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
            Speichern
          </button>
        </div>
      </div>
    </div>
  )
}
