import { useState, useEffect } from 'react'
import { Plus, LogIn, Loader2, AlertCircle, EyeOff } from 'lucide-react'
import useDashboardStore from '../../stores/dashboardStore'
import ManagedSessionsTable from './ManagedSessionsTable'
import JoinedSessionsTable from './JoinedSessionsTable'
import CreateSessionModal from './CreateSessionModal'
import JoinSessionModal from './JoinSessionModal'

export default function SessionsTab() {
  const managedSessions = useDashboardStore((s) => s.managedSessions)
  const joinedSessions = useDashboardStore((s) => s.joinedSessions)
  const loadingManaged = useDashboardStore((s) => s.loadingManaged)
  const loadingJoined = useDashboardStore((s) => s.loadingJoined)
  const error = useDashboardStore((s) => s.error)
  const hideCompleted = useDashboardStore((s) => s.hideCompleted)
  const toggleHideCompleted = useDashboardStore((s) => s.toggleHideCompleted)
  const fetchManagedSessions = useDashboardStore((s) => s.fetchManagedSessions)
  const fetchJoinedSessions = useDashboardStore((s) => s.fetchJoinedSessions)

  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)

  useEffect(() => {
    fetchManagedSessions()
    fetchJoinedSessions()
  }, [fetchManagedSessions, fetchJoinedSessions])

  const filteredManaged = hideCompleted
    ? managedSessions.filter((s) => s.status !== 'complete')
    : managedSessions

  const filteredJoined = hideCompleted
    ? joinedSessions.filter((s) => s.status !== 'complete')
    : joinedSessions

  const loading = loadingManaged || loadingJoined

  return (
    <div className="space-y-6">
      {/* Actions bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreate(true)}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            Neue Sitzung
          </button>
          <button
            onClick={() => setShowJoin(true)}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <LogIn className="w-4 h-4" />
            Sitzung beitreten
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm text-dsa-parchment-dark cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hideCompleted}
            onChange={toggleHideCompleted}
            className="w-4 h-4 rounded border-dsa-bg-medium bg-dsa-bg text-dsa-gold focus:ring-dsa-gold/50 focus:ring-offset-0"
          />
          <EyeOff className="w-3.5 h-3.5" />
          Abgeschlossene ausblenden
        </label>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-dsa-danger/10 border border-dsa-danger/30 rounded-sm px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && managedSessions.length === 0 && joinedSessions.length === 0 && (
        <div className="flex items-center justify-center gap-2 py-12 text-dsa-parchment-dark">
          <Loader2 className="w-5 h-5 animate-spin" />
          Sitzungen laden...
        </div>
      )}

      {/* Managed sessions */}
      <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-dsa-bg-medium">
          <h2 className="font-semibold text-dsa-parchment flex items-center gap-2">
            Meine Sitzungen
            <span className="text-xs text-dsa-parchment-dark font-normal">
              (als Spielleiter)
            </span>
          </h2>
        </div>
        <ManagedSessionsTable sessions={filteredManaged} />
      </div>

      {/* Joined sessions */}
      <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-dsa-bg-medium">
          <h2 className="font-semibold text-dsa-parchment flex items-center gap-2">
            Beigetretene Sitzungen
            <span className="text-xs text-dsa-parchment-dark font-normal">
              (als Spieler)
            </span>
          </h2>
        </div>
        <JoinedSessionsTable sessions={filteredJoined} />
      </div>

      {/* Modals */}
      <CreateSessionModal isOpen={showCreate} onClose={() => setShowCreate(false)} />
      <JoinSessionModal isOpen={showJoin} onClose={() => setShowJoin(false)} />
    </div>
  )
}
