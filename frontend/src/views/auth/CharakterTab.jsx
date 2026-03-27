import { useState, useEffect, useRef } from 'react'
import {
  Plus, Upload, Download, Pencil, TrendingUp, Trash2,
  Loader2, AlertCircle, User, X, Check, FileUp, Swords, Wand2, Shield
} from 'lucide-react'
import clsx from 'clsx'
import useAuthStore from '../../stores/authStore'
import Modal from '../../components/common/Modal'
import Badge from '../../components/common/Badge'
import CharacterCreator from './CharacterCreator'
import SteigerungModal from './SteigerungModal'

const GRADE_COLORS = {
  unerfahren: 'default',
  durchschnittlich: 'default',
  erfahren: 'gold',
  kompetent: 'gold',
  meisterlich: 'gold',
  brillant: 'gold',
  legendaer: 'gold',
}

const GRADE_LABELS = {
  unerfahren: 'Unerfahren',
  durchschnittlich: 'Durchschnittlich',
  erfahren: 'Erfahren',
  kompetent: 'Kompetent',
  meisterlich: 'Meisterlich',
  brillant: 'Brillant',
  legendaer: 'Legendar',
}

const STATUS_BADGE = {
  active: { variant: 'success', label: 'Aktiv' },
  retired: { variant: 'default', label: 'Im Ruhestand' },
  dead: { variant: 'danger', label: 'Verstorben' },
}

const ARCHETYPES = [
  { id: 'krieger', name: 'Krieger', desc: 'Nahkampfspezialist mit schwerer Rustung und Waffe.', icon: Swords },
  { id: 'magier', name: 'Magier', desc: 'Gelehrter Zauberwirker der Gildenmagie.', icon: Wand2 },
  { id: 'geweihter', name: 'Geweihter', desc: 'Diener einer Gottheit mit Liturgien und Segen.', icon: Shield },
  { id: 'waldlaeufer', name: 'Waldläufer', desc: 'Kundschafter und Fernkämpfer in der Wildnis.', icon: User },
  { id: 'streuner', name: 'Streuner', desc: 'Geschickter Dieb und Trickster in der Stadt.', icon: User },
]

const EXPERIENCE_GRADES = [
  { id: 'unerfahren', label: 'Unerfahren (900 AP)' },
  { id: 'durchschnittlich', label: 'Durchschnittlich (1000 AP)' },
  { id: 'erfahren', label: 'Erfahren (1100 AP)' },
  { id: 'kompetent', label: 'Kompetent (1200 AP)' },
  { id: 'meisterlich', label: 'Meisterlich (1400 AP)' },
  { id: 'brillant', label: 'Brillant (1700 AP)' },
  { id: 'legendaer', label: 'Legendar (2100 AP)' },
]

// ── Import Modal ──

function ImportModal({ isOpen, onClose, onImported }) {
  const token = useAuthStore((s) => s.token)
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef(null)

  const handleFile = (f) => {
    if (!f || !f.name.endsWith('.json')) {
      setError('Nur .json Dateien werden akzeptiert.')
      return
    }
    setFile(f)
    setError('')
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleFile(f)
  }

  const handleSubmit = async () => {
    if (!file) return
    setLoading(true)
    setError('')
    try {
      const text = await file.text()
      const json = JSON.parse(text)
      const res = await fetch('/api/characters/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(json),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || 'Import fehlgeschlagen')
      }
      const character = await res.json()
      onImported(character)
      handleClose()
    } catch (err) {
      setError(err.message || 'Import fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setFile(null)
    setError('')
    setDragOver(false)
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Charakter importieren"
      footer={
        <>
          <button onClick={handleClose} className="btn-ghost" disabled={loading}>
            Abbrechen
          </button>
          <button
            onClick={handleSubmit}
            className="btn-primary flex items-center gap-2"
            disabled={loading || !file}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Importieren
              </>
            )}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={clsx(
            'border-2 border-dashed rounded p-8 text-center cursor-pointer transition',
            dragOver
              ? 'border-dsa-gold bg-dsa-gold/5'
              : 'border-dsa-bg-medium hover:border-dsa-parchment-dark'
          )}
        >
          <FileUp className="w-8 h-8 mx-auto mb-3 text-dsa-parchment-dark" />
          {file ? (
            <div className="text-sm text-dsa-parchment">
              <span className="font-medium">{file.name}</span>
              <span className="text-dsa-parchment-dark ml-2">({(file.size / 1024).toFixed(1)} KB)</span>
            </div>
          ) : (
            <>
              <p className="text-sm text-dsa-parchment">JSON-Datei hierher ziehen</p>
              <p className="text-xs text-dsa-parchment-dark mt-1">oder klicken zum Durchsuchen</p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </div>
      </div>
    </Modal>
  )
}

// ── Quick Template Modal ──

function QuickTemplateModal({ isOpen, onClose, onCreated }) {
  const token = useAuthStore((s) => s.token)
  const [selectedArchetype, setSelectedArchetype] = useState(null)
  const [name, setName] = useState('')
  const [grade, setGrade] = useState('erfahren')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!selectedArchetype || !name.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/characters/quick-template', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          archetype: ARCHETYPES.find(a => a.id === selectedArchetype)?.name || selectedArchetype,
          name: name.trim(),
          experience_grade: grade,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || 'Erstellen fehlgeschlagen')
      }
      const character = await res.json()
      onCreated(character)
      handleClose()
    } catch (err) {
      setError(err.message || 'Erstellen fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setSelectedArchetype(null)
    setName('')
    setGrade('erfahren')
    setError('')
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Schnellvorlage"
      size="lg"
      footer={
        <>
          <button onClick={handleClose} className="btn-ghost" disabled={loading}>
            Abbrechen
          </button>
          <button
            onClick={handleSubmit}
            className="btn-primary flex items-center gap-2"
            disabled={loading || !selectedArchetype || !name.trim()}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Erstellen'
            )}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Archetype selection */}
        <div>
          <label className="label">Archetyp</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
            {ARCHETYPES.map((arch) => {
              const Icon = arch.icon
              const selected = selectedArchetype === arch.id
              return (
                <button
                  key={arch.id}
                  onClick={() => setSelectedArchetype(arch.id)}
                  className={clsx(
                    'flex items-start gap-3 p-3 rounded border text-left transition',
                    selected
                      ? 'border-dsa-gold bg-dsa-gold/10'
                      : 'border-dsa-bg-medium bg-dsa-bg-card hover:border-dsa-parchment-dark'
                  )}
                >
                  <Icon className={clsx('w-5 h-5 mt-0.5 flex-shrink-0', selected ? 'text-dsa-gold' : 'text-dsa-parchment-dark')} />
                  <div>
                    <div className={clsx('text-sm font-medium', selected ? 'text-dsa-gold' : 'text-dsa-parchment')}>{arch.name}</div>
                    <div className="text-xs text-dsa-parchment-dark mt-0.5">{arch.desc}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Name */}
        <div>
          <label className="label">Name des Charakters</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-field"
            placeholder="z.B. Alrik von Gareth"
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
        </div>

        {/* Experience grade */}
        <div>
          <label className="label">Erfahrungsgrad</label>
          <select
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            className="input-field"
          >
            {EXPERIENCE_GRADES.map((g) => (
              <option key={g.id} value={g.id}>{g.label}</option>
            ))}
          </select>
        </div>
      </div>
    </Modal>
  )
}

// ── Delete Confirmation Modal ──

function DeleteModal({ isOpen, character, onClose, onConfirm, loading }) {
  if (!isOpen || !character) return null
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Charakter loschen"
      size="sm"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost" disabled={loading}>
            Abbrechen
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm bg-red-900/40 border border-red-700/40 text-red-400 rounded hover:bg-red-900/60 transition flex items-center gap-2"
            disabled={loading}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Endgultig loschen
          </button>
        </>
      }
    >
      <p className="text-sm text-dsa-parchment">
        Mochtest du <strong>{character.name}</strong> wirklich loschen?
        Dieser Vorgang kann nicht ruckgangig gemacht werden.
      </p>
    </Modal>
  )
}

// ── Character Card ──

function CharacterCard({ character, onEdit, onLevelUp, onExport, onDelete }) {
  const grade = (character.experience_grade || 'erfahren').toLowerCase()
  const gradeLabel = GRADE_LABELS[grade] || character.experience_grade || 'Erfahren'
  const gradeVariant = GRADE_COLORS[grade] || 'default'
  const statusInfo = STATUS_BADGE[character.status] || STATUS_BADGE.active
  const availableAP = character.available_ap || 0

  return (
    <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded overflow-hidden hover:border-dsa-parchment-dark/50 transition group">
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Portrait / Avatar */}
          {character.portrait_url ? (
            <img
              src={character.portrait_url}
              alt={character.name}
              className="w-14 h-14 rounded object-cover border border-dsa-bg-medium flex-shrink-0"
            />
          ) : (
            <div className="w-14 h-14 rounded bg-dsa-bg-medium border border-dsa-bg-medium flex items-center justify-center flex-shrink-0">
              <User className="w-6 h-6 text-dsa-parchment-dark/40" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            {/* Name */}
            <h3 className="text-base font-display font-semibold text-dsa-parchment truncate">
              {character.name}
            </h3>

            {/* Species + Profession */}
            <p className="text-xs text-dsa-parchment-dark truncate mt-0.5">
              {[character.species, character.profession].filter(Boolean).join(' \u2022 ') || 'Unbekannt'}
            </p>

            {/* Badges row */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <Badge variant={gradeVariant} size="sm">{gradeLabel}</Badge>
              <Badge variant={statusInfo.variant} size="sm">{statusInfo.label}</Badge>
              {availableAP > 0 && (
                <Badge variant="gold" size="sm">{availableAP} AP</Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex border-t border-dsa-bg-medium divide-x divide-dsa-bg-medium">
        <button
          onClick={() => onEdit(character)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs text-dsa-parchment-dark hover:text-dsa-parchment hover:bg-dsa-bg-light transition"
          title="Bearbeiten"
        >
          <Pencil className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Bearbeiten</span>
        </button>
        <button
          onClick={() => onLevelUp(character)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs text-dsa-parchment-dark hover:text-dsa-gold hover:bg-dsa-gold/5 transition"
          title="AP ausgeben"
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">AP</span>
        </button>
        <button
          onClick={() => onExport(character)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs text-dsa-parchment-dark hover:text-dsa-parchment hover:bg-dsa-bg-light transition"
          title="Exportieren"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Export</span>
        </button>
        <button
          onClick={() => onDelete(character)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs text-dsa-parchment-dark hover:text-red-400 hover:bg-red-900/10 transition"
          title="Loschen"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── Main Tab ──

export default function CharakterTab() {
  const token = useAuthStore((s) => s.token)

  const [characters, setCharacters] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const [showImport, setShowImport] = useState(false)
  const [showTemplate, setShowTemplate] = useState(false)
  const [showCreator, setShowCreator] = useState(false)
  const [showDelete, setShowDelete] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [levelUpChar, setLevelUpChar] = useState(null)

  // Fetch characters on mount
  useEffect(() => {
    if (!token) return
    setLoading(true)
    fetch('/api/characters', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Charaktere konnten nicht geladen werden')
        return res.json()
      })
      .then((data) => {
        setCharacters(Array.isArray(data) ? data : data.items || [])
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [token])

  const showSuccess = (msg) => {
    setResult({ ok: true, text: msg })
    setTimeout(() => setResult(null), 4000)
  }

  const showError = (msg) => {
    setResult({ ok: false, text: msg })
    setTimeout(() => setResult(null), 6000)
  }

  // ── Actions ──

  const handleImported = (character) => {
    setCharacters((prev) => [...prev, character])
    showSuccess(`${character.name} erfolgreich importiert!`)
  }

  const handleCreated = (character) => {
    setCharacters((prev) => [...prev, character])
    showSuccess(`${character.name} erstellt!`)
  }

  const [editCharacter, setEditCharacter] = useState(null)
  const [editLoading, setEditLoading] = useState(false)

  const handleEdit = async (character) => {
    // Fetch full character data then open creator in edit mode
    setEditLoading(true)
    try {
      const res = await fetch(`/api/characters/${character.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Charakter konnte nicht geladen werden')
      const fullChar = await res.json()
      setEditCharacter(fullChar)
    } catch (err) {
      showError(err.message)
    } finally {
      setEditLoading(false)
    }
  }

  const handleEdited = (updatedCharacter) => {
    setCharacters((prev) =>
      prev.map((c) => (c.id === updatedCharacter.id ? updatedCharacter : c))
    )
    setEditCharacter(null)
    showSuccess(`${updatedCharacter.name} aktualisiert!`)
  }

  const handleExport = async (character) => {
    try {
      const res = await fetch(`/api/characters/${character.id}/export`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Export fehlgeschlagen')
      const data = await res.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${character.name.replace(/[^a-zA-Z0-9äöüÄÖÜß\s-]/g, '')}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      showSuccess(`${character.name} exportiert!`)
    } catch (err) {
      showError(err.message)
    }
  }

  const handleDelete = async () => {
    if (!showDelete) return
    setDeleteLoading(true)
    try {
      const res = await fetch(`/api/characters/${showDelete.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || 'Loschen fehlgeschlagen')
      }
      setCharacters((prev) => prev.filter((c) => c.id !== showDelete.id))
      showSuccess(`${showDelete.name} geloscht.`)
      setShowDelete(null)
    } catch (err) {
      showError(err.message)
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleLevelUpSaved = (updatedCharacter) => {
    setCharacters((prev) =>
      prev.map((c) => (c.id === updatedCharacter.id ? updatedCharacter : c))
    )
    setLevelUpChar(null)
  }

  return (
    <div className="space-y-6">
      {/* Actions bar */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setShowCreator(true)}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          Neuer Charakter
        </button>
        <button
          onClick={() => setShowTemplate(true)}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <Swords className="w-4 h-4" />
          Schnellstart
        </button>
        <button
          onClick={() => setShowImport(true)}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <Upload className="w-4 h-4" />
          Importieren
        </button>
      </div>

      {/* Edit loading */}
      {editLoading && (
        <div className="flex items-center gap-2 text-dsa-parchment-dark text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Charakter laden...
        </div>
      )}

      {/* Result toast */}
      {result && (
        <div className={clsx(
          'flex items-center gap-2 text-sm rounded-sm px-4 py-3 border',
          result.ok
            ? 'bg-green-900/20 border-green-800/30 text-green-400'
            : 'bg-red-900/20 border-red-800/30 text-red-400'
        )}>
          {result.ok ? <Check className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          {result.text}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-dsa-danger/10 border border-dsa-danger/30 rounded-sm px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && characters.length === 0 && (
        <div className="flex items-center justify-center gap-2 py-12 text-dsa-parchment-dark">
          <Loader2 className="w-5 h-5 animate-spin" />
          Charaktere laden...
        </div>
      )}

      {/* Empty state */}
      {!loading && characters.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-dsa-parchment-dark">
          <User className="w-12 h-12 mb-4 opacity-30" />
          <p className="text-lg font-display">Noch keine Charaktere</p>
          <p className="text-sm mt-1 mb-4">Erstelle deinen ersten Helden oder importiere einen bestehenden.</p>
          <button
            onClick={() => setShowCreator(true)}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            Neuer Charakter
          </button>
        </div>
      )}

      {/* Character grid */}
      {characters.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {characters.map((char) => (
            <CharacterCard
              key={char.id}
              character={char}
              onEdit={handleEdit}
              onLevelUp={setLevelUpChar}
              onExport={handleExport}
              onDelete={setShowDelete}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <ImportModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onImported={handleImported}
      />
      <QuickTemplateModal
        isOpen={showTemplate}
        onClose={() => setShowTemplate(false)}
        onCreated={handleCreated}
      />
      <DeleteModal
        isOpen={!!showDelete}
        character={showDelete}
        onClose={() => setShowDelete(null)}
        onConfirm={handleDelete}
        loading={deleteLoading}
      />
      {levelUpChar && (
        <SteigerungModal
          character={levelUpChar}
          onClose={() => setLevelUpChar(null)}
          onSaved={handleLevelUpSaved}
        />
      )}
      {showCreator && (
        <CharacterCreator
          onClose={() => setShowCreator(false)}
          onCreated={(character) => {
            handleCreated(character)
            setShowCreator(false)
          }}
        />
      )}
      {editCharacter && (
        <CharacterCreator
          editCharacter={editCharacter}
          onClose={() => setEditCharacter(null)}
          onCreated={(character) => {
            handleEdited(character)
          }}
        />
      )}
    </div>
  )
}
