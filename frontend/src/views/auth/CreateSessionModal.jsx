import { useState } from 'react'
import { AlertCircle } from 'lucide-react'
import Modal from '../../components/common/Modal'
import useDashboardStore from '../../stores/dashboardStore'

export default function CreateSessionModal({ isOpen, onClose }) {
  const createSession = useDashboardStore((s) => s.createSession)

  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setLoading(true)
    setError('')
    try {
      await createSession(trimmed)
      setName('')
      onClose()
    } catch (err) {
      setError(err.message || 'Erstellen fehlgeschlagen')
    }
    setLoading(false)
  }

  const handleClose = () => {
    setName('')
    setError('')
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Neue Sitzung erstellen"
      footer={
        <>
          <button onClick={handleClose} className="btn-ghost" disabled={loading}>
            Abbrechen
          </button>
          <button
            onClick={handleSubmit}
            className="btn-primary flex items-center gap-2"
            disabled={loading || !name.trim()}
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-dsa-bg/30 border-t-dsa-bg rounded-full animate-spin" />
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
        <div>
          <label className="label">Name der Sitzung</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-field"
            placeholder="z.B. Sitzung 12 - Der Turm des Orkschamanen"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
        </div>
      </div>
    </Modal>
  )
}
