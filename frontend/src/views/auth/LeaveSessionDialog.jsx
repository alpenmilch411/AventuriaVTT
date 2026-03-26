import { AlertTriangle } from 'lucide-react'
import Modal from '../../components/common/Modal'

export default function LeaveSessionDialog({ isOpen, onClose, onConfirm, loading = false }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Sitzung verlassen?"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost" disabled={loading}>
            Abbrechen
          </button>
          <button
            onClick={onConfirm}
            className="btn-danger flex items-center gap-2"
            disabled={loading}
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              'Verlassen'
            )}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-start gap-3 bg-dsa-danger/10 border border-dsa-danger/30 rounded-sm px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-400">
            Achtung: Wenn du die Sitzung verlässt, gehen alle Fortschritte deines Charakters
            in dieser Sitzung verloren. Diese Aktion kann nicht rückgängig gemacht werden.
          </p>
        </div>
      </div>
    </Modal>
  )
}
