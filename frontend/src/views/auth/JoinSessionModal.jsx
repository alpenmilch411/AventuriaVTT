import { useState, useEffect } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import Modal from '../../components/common/Modal'
import useDashboardStore from '../../stores/dashboardStore'
import useAuthStore from '../../stores/authStore'

export default function JoinSessionModal({ isOpen, onClose }) {
  const joinSession = useDashboardStore((s) => s.joinSession)
  const token = useAuthStore((s) => s.token)

  const [code, setCode] = useState('')
  const [characterId, setCharacterId] = useState('')
  const [characters, setCharacters] = useState([])
  const [loadingChars, setLoadingChars] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Fetch unlocked characters when modal opens
  useEffect(() => {
    if (!isOpen || !token) return
    let cancelled = false
    const fetchCharacters = async () => {
      setLoadingChars(true)
      try {
        const res = await fetch('/api/characters?unlocked_only=true', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          const chars = Array.isArray(data) ? data : []
          // Filter to only unlocked characters (not locked to a session)
          const unlocked = chars.filter((c) => !c.locked_session_id)
          if (!cancelled) {
            setCharacters(unlocked)
            if (unlocked.length === 1) setCharacterId(unlocked[0].id)
          }
        }
      } catch (err) {
        console.error('Failed to fetch characters:', err)
      }
      if (!cancelled) setLoadingChars(false)
    }
    fetchCharacters()
    return () => { cancelled = true }
  }, [isOpen, token])

  const handleSubmit = async () => {
    const trimmedCode = code.trim().toUpperCase()
    if (!trimmedCode || !characterId) return
    setLoading(true)
    setError('')
    try {
      await joinSession(trimmedCode, characterId)
      setCode('')
      setCharacterId('')
      onClose()
    } catch (err) {
      setError(err.message || 'Beitreten fehlgeschlagen')
    }
    setLoading(false)
  }

  const handleClose = () => {
    setCode('')
    setCharacterId('')
    setError('')
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Sitzung beitreten"
      footer={
        <>
          <button onClick={handleClose} className="btn-ghost" disabled={loading}>
            Abbrechen
          </button>
          <button
            onClick={handleSubmit}
            className="btn-primary flex items-center gap-2"
            disabled={loading || !code.trim() || !characterId}
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-dsa-bg/30 border-t-dsa-bg rounded-full animate-spin" />
            ) : (
              'Beitreten'
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
        <div>
          <label className="label">Session-Code</label>
          <input
            type="text"
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setError('') }}
            className="input-field text-center text-xl font-mono tracking-widest"
            placeholder="TAVERNE-42"
            maxLength={20}
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && characterId && handleSubmit()}
          />
        </div>
        <div>
          <label className="label">Charakter auswählen</label>
          {loadingChars ? (
            <div className="flex items-center gap-2 text-dsa-parchment-dark text-sm py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Charaktere laden...
            </div>
          ) : characters.length === 0 ? (
            <p className="text-sm text-dsa-parchment-dark py-2">
              Keine verfügbaren Charaktere. Erstelle oder importiere zuerst einen Charakter,
              der nicht bereits in einer aktiven Sitzung gesperrt ist.
            </p>
          ) : (
            <select
              value={characterId}
              onChange={(e) => setCharacterId(e.target.value)}
              className="input-field"
            >
              <option value="">Charakter wählen...</option>
              {characters.map((char) => (
                <option key={char.id} value={char.id}>
                  {char.name} ({char.species} - {char.profession})
                </option>
              ))}
            </select>
          )}
        </div>
        <p className="text-xs text-dsa-parchment-dark text-center">
          Dein Charakter wird für die Dauer der Sitzung gesperrt.
        </p>
      </div>
    </Modal>
  )
}
