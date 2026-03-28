import { useState, useEffect } from 'react'
import { Pencil } from 'lucide-react'
import Modal from '../../components/common/Modal'
import clsx from 'clsx'

const REACH_OPTIONS = ['kurz', 'mittel', 'lang']

/**
 * CreatureEditModal — Edit NPC/creature stats mid-combat.
 *
 * Props:
 * - creature: combatant object (id, name, lep, lepMax, at, pa, aw, rs, initiative, weaponName, weaponDamage, weaponReach)
 * - isOpen: boolean
 * - onClose: callback
 * - onSave: (creatureId, updates) => void
 */
export default function CreatureEditModal({ creature, isOpen, onClose, onSave }) {
  const [form, setForm] = useState({})

  // Reset form when creature changes or modal opens
  useEffect(() => {
    if (creature && isOpen) {
      setForm({
        name: creature.name || '',
        lep: creature.lep ?? creature.lepMax ?? 0,
        lepMax: creature.lepMax || 30,
        at: creature.at || 12,
        pa: creature.pa || 8,
        aw: creature.aw || 5,
        rs: creature.rs || 0,
        initiative: creature.initiative || 0,
        weaponName: creature.weaponName || '',
        weaponDamage: creature.weaponDamage || '',
        weaponReach: creature.weaponReach || 'mittel',
      })
    }
  }, [creature, isOpen])

  if (!creature) return null

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  const handleSave = () => {
    // Build updates — only include changed fields
    const updates = {}
    if (form.name !== creature.name) updates.name = form.name
    if (form.lep !== (creature.lep ?? creature.lepMax)) updates.lep = form.lep
    if (form.lepMax !== (creature.lepMax || 30)) updates.lepMax = form.lepMax
    if (form.at !== (creature.at || 12)) updates.at = form.at
    if (form.pa !== (creature.pa || 8)) updates.pa = form.pa
    if (form.aw !== (creature.aw || 5)) updates.aw = form.aw
    if (form.rs !== (creature.rs || 0)) updates.rs = form.rs
    if (form.initiative !== (creature.initiative || 0)) updates.initiative = form.initiative
    if (form.weaponName !== (creature.weaponName || '')) updates.weaponName = form.weaponName
    if (form.weaponDamage !== (creature.weaponDamage || '')) updates.weaponDamage = form.weaponDamage
    if (form.weaponReach !== (creature.weaponReach || 'mittel')) updates.weaponReach = form.weaponReach

    if (Object.keys(updates).length > 0) {
      onSave(creature.id, updates)
    }
    onClose()
  }

  const lepLow = form.lepMax > 0 && form.lep / form.lepMax <= 0.25

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${creature.name} bearbeiten`}
      size="sm"
      footer={<>
        <button onClick={onClose} className="btn-ghost">Abbrechen</button>
        <button onClick={handleSave} className="btn-primary flex items-center gap-1">
          <Pencil className="w-3.5 h-3.5" /> Speichern
        </button>
      </>}
    >
      <div className="space-y-3">
        {/* Name */}
        <div>
          <label className="text-[10px] font-semibold text-dsa-parchment-dark uppercase tracking-wider">Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            className="w-full mt-0.5 px-2 py-1.5 bg-dsa-bg border border-dsa-bg-medium rounded text-sm text-dsa-parchment focus:outline-none focus:border-dsa-gold/50"
          />
        </div>

        {/* LeP: current / max */}
        <div>
          <label className="text-[10px] font-semibold text-dsa-parchment-dark uppercase tracking-wider">LeP</label>
          <div className="flex items-center gap-2 mt-0.5">
            <input
              type="number"
              value={form.lep}
              onChange={(e) => set('lep', parseInt(e.target.value) || 0)}
              className={clsx(
                'w-20 px-2 py-1.5 bg-dsa-bg border rounded text-sm text-center font-mono focus:outline-none',
                lepLow ? 'border-red-600/50 text-red-400 focus:border-red-500' : 'border-dsa-bg-medium text-dsa-parchment focus:border-dsa-gold/50'
              )}
            />
            <span className="text-dsa-parchment-dark text-sm">/</span>
            <input
              type="number"
              value={form.lepMax}
              onChange={(e) => set('lepMax', parseInt(e.target.value) || 1)}
              min="1"
              className="w-20 px-2 py-1.5 bg-dsa-bg border border-dsa-bg-medium rounded text-sm text-center font-mono text-dsa-parchment focus:outline-none focus:border-dsa-gold/50"
            />
          </div>
        </div>

        {/* Combat stats — 2-column grid */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <NumField label="AT" value={form.at} onChange={(v) => set('at', v)} />
          <NumField label="PA" value={form.pa} onChange={(v) => set('pa', v)} />
          <NumField label="AW" value={form.aw} onChange={(v) => set('aw', v)} />
          <NumField label="RS" value={form.rs} onChange={(v) => set('rs', v)} />
          <NumField label="INI" value={form.initiative} onChange={(v) => set('initiative', v)} />
        </div>

        {/* Weapon */}
        <div className="border-t border-dsa-bg-medium pt-3">
          <label className="text-[10px] font-semibold text-dsa-parchment-dark uppercase tracking-wider">Waffe</label>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-1">
            <div className="col-span-2">
              <input
                type="text"
                value={form.weaponName}
                onChange={(e) => set('weaponName', e.target.value)}
                placeholder="Waffenname"
                className="w-full px-2 py-1.5 bg-dsa-bg border border-dsa-bg-medium rounded text-sm text-dsa-parchment focus:outline-none focus:border-dsa-gold/50"
              />
            </div>
            <div>
              <label className="text-[9px] text-dsa-parchment-dark">Schaden</label>
              <input
                type="text"
                value={form.weaponDamage}
                onChange={(e) => set('weaponDamage', e.target.value)}
                placeholder="1W6+4"
                className="w-full px-2 py-1.5 bg-dsa-bg border border-dsa-bg-medium rounded text-sm font-mono text-dsa-parchment focus:outline-none focus:border-dsa-gold/50"
              />
            </div>
            <div>
              <label className="text-[9px] text-dsa-parchment-dark">Reichweite</label>
              <select
                value={form.weaponReach}
                onChange={(e) => set('weaponReach', e.target.value)}
                className="w-full px-2 py-1.5 bg-dsa-bg border border-dsa-bg-medium rounded text-sm text-dsa-parchment focus:outline-none focus:border-dsa-gold/50"
              >
                {REACH_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function NumField({ label, value, onChange, min = 0 }) {
  return (
    <div>
      <label className="text-[9px] text-dsa-parchment-dark">{label}</label>
      <div className="flex items-center gap-1 mt-0.5">
        <button
          onClick={() => onChange(Math.max(min, (value || 0) - 1))}
          className="w-6 h-7 flex items-center justify-center bg-dsa-bg-medium rounded text-dsa-parchment-dark hover:text-dsa-parchment text-xs"
        >−</button>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value) || 0)}
          min={min}
          className="flex-1 px-1 py-1 bg-dsa-bg border border-dsa-bg-medium rounded text-sm text-center font-mono text-dsa-gold focus:outline-none focus:border-dsa-gold/50"
        />
        <button
          onClick={() => onChange((value || 0) + 1)}
          className="w-6 h-7 flex items-center justify-center bg-dsa-bg-medium rounded text-dsa-parchment-dark hover:text-dsa-parchment text-xs"
        >+</button>
      </div>
    </div>
  )
}
