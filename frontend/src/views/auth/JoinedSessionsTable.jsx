import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogIn, LogOut, Eye, Lock } from 'lucide-react'
import Badge from '../../components/common/Badge'
import LeaveSessionDialog from './LeaveSessionDialog'
import useDashboardStore from '../../stores/dashboardStore'

const STATUS_MAP = {
  lobby: { label: 'Lobby', variant: 'gold' },
  active: { label: 'Aktiv', variant: 'success' },
  paused: { label: 'Pausiert', variant: 'warning' },
  complete: { label: 'Abgeschlossen', variant: 'default' },
}

export default function JoinedSessionsTable({ sessions }) {
  const navigate = useNavigate()
  const leaveSession = useDashboardStore((s) => s.leaveSession)

  const [leaveTarget, setLeaveTarget] = useState(null)
  const [leaving, setLeaving] = useState(false)

  const handleLeave = async () => {
    if (!leaveTarget) return
    setLeaving(true)
    try {
      await leaveSession(leaveTarget.id)
      setLeaveTarget(null)
    } catch (err) {
      // Error handled by store
    }
    setLeaving(false)
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center py-8 text-dsa-parchment-dark text-sm">
        <LogIn className="w-8 h-8 mx-auto mb-2 opacity-30" />
        Du bist noch keiner Sitzung beigetreten.
      </div>
    )
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-dsa-bg-medium text-dsa-parchment-dark text-left">
              <th className="py-2 px-3 font-medium">Name</th>
              <th className="py-2 px-3 font-medium hidden sm:table-cell">Spielleiter</th>
              <th className="py-2 px-3 font-medium">Status</th>
              <th className="py-2 px-3 font-medium hidden sm:table-cell">Dein Charakter</th>
              <th className="py-2 px-3 font-medium text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => {
              const status = STATUS_MAP[session.status] || STATUS_MAP.lobby
              const isComplete = session.status === 'complete'
              const isActive = session.status === 'active'

              return (
                <tr
                  key={session.id}
                  className="border-b border-dsa-bg-medium/50 hover:bg-dsa-bg-light/30 transition-colors"
                >
                  <td className="py-2.5 px-3">
                    <span className="text-dsa-parchment font-medium">{session.name}</span>
                  </td>
                  <td className="py-2.5 px-3 text-dsa-parchment-dark hidden sm:table-cell">
                    {session.gm_name || session.gm_username || '-'}
                  </td>
                  <td className="py-2.5 px-3">
                    <Badge variant={status.variant} size="sm">
                      {status.label}
                    </Badge>
                  </td>
                  <td className="py-2.5 px-3 hidden sm:table-cell">
                    <div className="flex items-center gap-1.5">
                      <span className="text-dsa-parchment text-xs">
                        {session.character_name || '-'}
                      </span>
                      {isActive && session.character_name && (
                        <Lock className="w-3 h-3 text-dsa-gold/60" title="Charakter gesperrt" />
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-1 justify-end">
                      {isComplete ? (
                        <button
                          onClick={() => navigate(`/session/${session.id}/complete`)}
                          className="text-xs px-2 py-1 border border-dsa-gold text-dsa-gold rounded hover:bg-dsa-gold/10 transition-colors flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" />
                          Ansehen
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => navigate(`/play/${session.session_code || session.code}`)}
                            className="text-xs px-2 py-1 bg-dsa-gold text-dsa-bg font-semibold rounded hover:bg-dsa-gold-light transition-colors flex items-center gap-1"
                          >
                            <LogIn className="w-3 h-3" />
                            Beitreten
                          </button>
                          <button
                            onClick={() => setLeaveTarget(session)}
                            className="text-xs p-1 text-dsa-parchment-dark hover:text-red-400 transition-colors"
                            title="Sitzung verlassen"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <LeaveSessionDialog
        isOpen={!!leaveTarget}
        onClose={() => setLeaveTarget(null)}
        onConfirm={handleLeave}
        loading={leaving}
      />
    </>
  )
}
