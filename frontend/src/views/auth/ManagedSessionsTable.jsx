import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Copy, Check, Trash2, CheckCircle, ChevronDown,
  ChevronRight, Users, Crown
} from 'lucide-react'
import Badge from '../../components/common/Badge'
import SessionPlayerList from './SessionPlayerList'
import useDashboardStore from '../../stores/dashboardStore'

const STATUS_MAP = {
  lobby: { label: 'Lobby', variant: 'gold' },
  active: { label: 'Aktiv', variant: 'success' },
  paused: { label: 'Pausiert', variant: 'warning' },
  complete: { label: 'Abgeschlossen', variant: 'default' },
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '-'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}.${mm}.${yyyy}`
}

export default function ManagedSessionsTable({ sessions }) {
  const navigate = useNavigate()
  const deleteSession = useDashboardStore((s) => s.deleteSession)
  const completeSession = useDashboardStore((s) => s.completeSession)

  const [expandedId, setExpandedId] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [confirmComplete, setConfirmComplete] = useState(null)
  const [actionLoading, setActionLoading] = useState(null)

  const handleCopy = async (code, sessionId) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedId(sessionId)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (err) {
      console.error('Copy failed:', err)
    }
  }

  const handleDelete = async (sessionId) => {
    setActionLoading(sessionId)
    try {
      await deleteSession(sessionId)
      setConfirmDelete(null)
    } catch (err) {
      // Error handled by store
    }
    setActionLoading(null)
  }

  const handleComplete = async (sessionId) => {
    setActionLoading(sessionId)
    try {
      await completeSession(sessionId)
      setConfirmComplete(null)
    } catch (err) {
      // Error handled by store
    }
    setActionLoading(null)
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center py-8 text-dsa-parchment-dark text-sm">
        <Crown className="w-8 h-8 mx-auto mb-2 opacity-30" />
        Du hast noch keine Sitzungen erstellt.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-dsa-bg-medium text-dsa-parchment-dark text-left">
            <th className="py-2 px-3 font-medium"></th>
            <th className="py-2 px-3 font-medium">Name</th>
            <th className="py-2 px-3 font-medium">Code</th>
            <th className="py-2 px-3 font-medium hidden sm:table-cell">Erstellt</th>
            <th className="py-2 px-3 font-medium">Status</th>
            <th className="py-2 px-3 font-medium hidden sm:table-cell">Spieler</th>
            <th className="py-2 px-3 font-medium text-right">Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => {
            const status = STATUS_MAP[session.status] || STATUS_MAP.lobby
            const isExpanded = expandedId === session.id
            const isComplete = session.status === 'complete'

            return (
              <tr key={session.id} className="group">
                <td colSpan={7} className="p-0">
                  <div
                    className={`border-b border-dsa-bg-medium/50 ${
                      isExpanded ? 'bg-dsa-bg-light/50' : 'hover:bg-dsa-bg-light/30'
                    } transition-colors`}
                  >
                    {/* Main row */}
                    <div className="flex items-center">
                      <div className="py-2.5 px-3 w-8">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : session.id)}
                          className="text-dsa-parchment-dark hover:text-dsa-parchment transition-colors"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      <div className="py-2.5 px-3 flex-1 min-w-0">
                        <span className="text-dsa-parchment font-medium truncate block">
                          {session.name}
                        </span>
                      </div>
                      <div className="py-2.5 px-3 shrink-0">
                        <div className="flex items-center gap-1">
                          <code className="text-xs font-mono text-dsa-gold/80 bg-dsa-bg px-1.5 py-0.5 rounded">
                            {session.session_code || session.code}
                          </code>
                          <button
                            onClick={() => handleCopy(session.session_code || session.code, session.id)}
                            className="p-1 text-dsa-parchment-dark hover:text-dsa-gold transition-colors"
                            title="Code kopieren"
                          >
                            {copiedId === session.id ? (
                              <Check className="w-3 h-3 text-dsa-success" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                          {copiedId === session.id && (
                            <span className="text-[10px] text-dsa-success">Kopiert!</span>
                          )}
                        </div>
                      </div>
                      <div className="py-2.5 px-3 shrink-0 hidden sm:block text-dsa-parchment-dark text-xs">
                        {formatDate(session.created_at)}
                      </div>
                      <div className="py-2.5 px-3 shrink-0">
                        <Badge variant={status.variant} size="sm">
                          {status.label}
                        </Badge>
                      </div>
                      <div className="py-2.5 px-3 shrink-0 hidden sm:block">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : session.id)}
                          className="flex items-center gap-1 text-xs text-dsa-parchment-dark hover:text-dsa-parchment transition-colors"
                        >
                          <Users className="w-3 h-3" />
                          {session.player_count ?? '?'}
                        </button>
                      </div>
                      <div className="py-2.5 px-3 shrink-0 flex items-center gap-1 justify-end">
                        {!isComplete && (
                          <button
                            onClick={() => navigate(`/gm/${session.session_code || session.code}`)}
                            className="text-xs px-2 py-1 bg-dsa-gold text-dsa-bg font-semibold rounded hover:bg-dsa-gold-light transition-colors"
                          >
                            Betreten
                          </button>
                        )}
                        {session.status === 'active' && (
                          <>
                            {confirmComplete === session.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleComplete(session.id)}
                                  disabled={actionLoading === session.id}
                                  className="text-xs px-2 py-1 bg-dsa-success/20 text-green-400 rounded hover:bg-dsa-success/30 transition-colors disabled:opacity-50"
                                >
                                  Ja
                                </button>
                                <button
                                  onClick={() => setConfirmComplete(null)}
                                  className="text-xs px-2 py-1 text-dsa-parchment-dark hover:text-dsa-parchment transition-colors"
                                >
                                  Nein
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmComplete(session.id)}
                                className="text-xs px-2 py-1 text-dsa-parchment-dark hover:text-dsa-success transition-colors flex items-center gap-1"
                                title="Sitzung abschließen"
                              >
                                <CheckCircle className="w-3 h-3" />
                                <span className="hidden md:inline">Abschließen</span>
                              </button>
                            )}
                          </>
                        )}
                        {!isComplete && (
                          <>
                            {confirmDelete === session.id ? (
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-red-400">Löschen?</span>
                                <button
                                  onClick={() => handleDelete(session.id)}
                                  disabled={actionLoading === session.id}
                                  className="text-xs px-2 py-1 bg-dsa-danger text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50"
                                >
                                  Ja
                                </button>
                                <button
                                  onClick={() => setConfirmDelete(null)}
                                  className="text-xs px-2 py-1 text-dsa-parchment-dark hover:text-dsa-parchment transition-colors"
                                >
                                  Nein
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmDelete(session.id)}
                                className="text-xs p-1 text-dsa-parchment-dark hover:text-red-400 transition-colors"
                                title="Sitzung löschen"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Expanded player list */}
                    {isExpanded && (
                      <div className="border-t border-dsa-bg-medium/50 bg-dsa-bg/30">
                        <SessionPlayerList sessionId={session.id} isGM={true} />
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
