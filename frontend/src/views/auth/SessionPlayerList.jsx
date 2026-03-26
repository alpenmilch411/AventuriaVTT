import { useState, useEffect } from 'react'
import { Users, UserMinus, AlertCircle, Loader2 } from 'lucide-react'
import useDashboardStore from '../../stores/dashboardStore'

export default function SessionPlayerList({ sessionId, isGM = false }) {
  const fetchSessionPlayers = useDashboardStore((s) => s.fetchSessionPlayers)
  const removePlayer = useDashboardStore((s) => s.removePlayer)

  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [confirmRemove, setConfirmRemove] = useState(null)
  const [removing, setRemoving] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const data = await fetchSessionPlayers(sessionId)
      if (!cancelled) {
        setPlayers(Array.isArray(data) ? data : [])
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [sessionId, fetchSessionPlayers])

  const handleRemove = async (userId) => {
    setRemoving(true)
    try {
      await removePlayer(sessionId, userId)
      setPlayers((prev) => prev.filter((p) => p.user_id !== userId))
      setConfirmRemove(null)
    } catch (err) {
      // Error is shown via store
    }
    setRemoving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 px-4 text-dsa-parchment-dark text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Spieler laden...
      </div>
    )
  }

  if (players.length === 0) {
    return (
      <div className="py-3 px-4 text-dsa-parchment-dark text-sm">
        Noch keine Spieler in dieser Sitzung.
      </div>
    )
  }

  return (
    <div className="px-4 py-2 space-y-1">
      <div className="flex items-center gap-2 text-xs text-dsa-parchment-dark mb-2">
        <Users className="w-3 h-3" />
        <span>{players.length} Spieler</span>
      </div>
      {players.map((player) => (
        <div
          key={player.user_id || player.id}
          className="flex items-center justify-between py-1.5 px-2 rounded bg-dsa-bg/50"
        >
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                player.online ? 'bg-dsa-success' : 'bg-dsa-parchment-dark/30'
              }`}
            />
            <span className="text-sm text-dsa-parchment">{player.username}</span>
            {player.character_name && (
              <span className="text-xs text-dsa-parchment-dark">
                ({player.character_name})
              </span>
            )}
          </div>
          {isGM && (
            <>
              {confirmRemove === (player.user_id || player.id) ? (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-red-400 mr-1">Entfernen?</span>
                  <button
                    onClick={() => handleRemove(player.user_id || player.id)}
                    disabled={removing}
                    className="text-xs px-2 py-0.5 bg-dsa-danger text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    Ja
                  </button>
                  <button
                    onClick={() => setConfirmRemove(null)}
                    className="text-xs px-2 py-0.5 text-dsa-parchment-dark hover:text-dsa-parchment transition-colors"
                  >
                    Nein
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmRemove(player.user_id || player.id)}
                  className="text-xs text-dsa-parchment-dark hover:text-red-400 transition-colors flex items-center gap-1"
                  title="Spieler entfernen"
                >
                  <UserMinus className="w-3 h-3" />
                  Entfernen
                </button>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  )
}
