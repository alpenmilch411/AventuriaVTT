import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Loader2, AlertCircle, Trophy, Swords, Shield,
  Skull, Sparkles, Target, Zap
} from 'lucide-react'
import useAuthStore from '../../stores/authStore'
import useDashboardStore from '../../stores/dashboardStore'

function formatDate(dateStr) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '-'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}.${mm}.${yyyy}`
}

// Determine awards from stats
function computeAwards(stats) {
  if (!stats || !Array.isArray(stats) || stats.length === 0) return []
  const awards = []

  const charName = (s) => s.character_name || 'Unbekannt'

  // Most kills
  const byKills = [...stats].sort((a, b) => (b.kills || 0) - (a.kills || 0))
  if (byKills[0]?.kills > 0) {
    awards.push({
      label: 'Tödlichster Held',
      character: charName(byKills[0]),
      value: `${byKills[0].kills} Kills`,
      icon: Skull,
      variant: 'danger',
    })
  }

  // Most damage dealt
  const byDamage = [...stats].sort((a, b) => (b.damage_dealt || 0) - (a.damage_dealt || 0))
  if (byDamage[0]?.damage_dealt > 0) {
    awards.push({
      label: 'Meister Schaden',
      character: charName(byDamage[0]),
      value: `${byDamage[0].damage_dealt} TP`,
      icon: Swords,
      variant: 'gold',
    })
  }

  // Most damage taken (resilient)
  const byTaken = [...stats].sort((a, b) => (b.damage_taken || 0) - (a.damage_taken || 0))
  if (byTaken[0]?.damage_taken > 0) {
    awards.push({
      label: 'Zähester Held',
      character: charName(byTaken[0]),
      value: `${byTaken[0].damage_taken} SP eingesteckt`,
      icon: Shield,
      variant: 'rust',
    })
  }

  // Luckiest (best crit ratio)
  const withRolls = stats.filter((s) => (s.dice_rolls || 0) > 0)
  if (withRolls.length > 0) {
    const byCritRatio = withRolls
      .map((s) => ({ ...s, critRatio: (s.critical_successes || 0) / s.dice_rolls }))
      .sort((a, b) => b.critRatio - a.critRatio)
    if (byCritRatio[0]?.critical_successes > 0) {
      awards.push({
        label: 'Glückspilz',
        character: charName(byCritRatio[0]),
        value: `${byCritRatio[0].critical_successes} Krits bei ${byCritRatio[0].dice_rolls} Würfen`,
        icon: Sparkles,
        variant: 'gold',
      })
    }
  }

  // Most spells cast
  const bySpells = [...stats].sort((a, b) => (b.spells_cast || 0) - (a.spells_cast || 0))
  if (bySpells[0]?.spells_cast > 0) {
    awards.push({
      label: 'Meister der Magie',
      character: charName(bySpells[0]),
      value: `${bySpells[0].spells_cast} Zauber`,
      icon: Zap,
      variant: 'mana',
    })
  }

  return awards
}

export default function CompletionView() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)
  const fetchSessionStats = useDashboardStore((s) => s.fetchSessionStats)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sessionData, setSessionData] = useState(null)
  const [stats, setStats] = useState([])

  useEffect(() => {
    if (!token) {
      navigate('/')
      return
    }
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await fetchSessionStats(sessionId)
        if (!cancelled) {
          if (data) {
            setSessionData(data.session || null)
            setStats(Array.isArray(data.stats) ? data.stats : [])
          } else {
            setError('Statistiken konnten nicht geladen werden')
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [sessionId, token, navigate, fetchSessionStats])

  const awards = computeAwards(stats)

  if (loading) {
    return (
      <div className="min-h-screen bg-dsa-bg flex items-center justify-center">
        <div className="flex items-center gap-2 text-dsa-parchment-dark">
          <Loader2 className="w-6 h-6 animate-spin" />
          Statistiken laden...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-dsa-bg flex flex-col items-center justify-center gap-4">
        <div className="flex items-center gap-2 text-red-400">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
        <button onClick={() => navigate('/dashboard')} className="btn-secondary text-sm">
          Zurück zum Dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-dsa-bg">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-dsa-bg-light border-b border-dsa-bg-medium">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-1 text-dsa-parchment-dark hover:text-dsa-parchment transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-display font-bold text-dsa-gold">
              {sessionData?.name || 'Sitzung'}
            </h1>
            <p className="text-xs text-dsa-parchment-dark">
              Abgeschlossen am {formatDate(sessionData?.completed_at || sessionData?.updated_at)}
            </p>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Awards */}
        {awards.length > 0 && (
          <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded overflow-hidden">
            <div className="px-4 py-3 border-b border-dsa-bg-medium flex items-center gap-2">
              <Trophy className="w-4 h-4 text-dsa-gold" />
              <h2 className="font-semibold text-dsa-parchment">Auszeichnungen</h2>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {awards.map((award, i) => (
                <div
                  key={i}
                  className="bg-dsa-bg border border-dsa-bg-medium rounded-lg p-3 flex items-start gap-3"
                >
                  <div className="w-10 h-10 bg-dsa-bg-medium rounded-full flex items-center justify-center flex-shrink-0">
                    <award.icon className="w-5 h-5 text-dsa-gold" />
                  </div>
                  <div>
                    <div className="text-xs text-dsa-parchment-dark">{award.label}</div>
                    <div className="text-sm font-semibold text-dsa-parchment">{award.character}</div>
                    <div className="text-xs text-dsa-gold">{award.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats table */}
        <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded overflow-hidden">
          <div className="px-4 py-3 border-b border-dsa-bg-medium flex items-center gap-2">
            <Target className="w-4 h-4 text-dsa-gold" />
            <h2 className="font-semibold text-dsa-parchment">Charakter-Statistiken</h2>
          </div>
          {stats.length === 0 ? (
            <div className="text-center py-8 text-dsa-parchment-dark text-sm">
              Keine Statistiken verfügbar.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dsa-bg-medium text-dsa-parchment-dark text-left">
                    <th className="py-2 px-3 font-medium">Charakter</th>
                    <th className="py-2 px-3 font-medium text-center">Kills</th>
                    <th className="py-2 px-3 font-medium text-center">TP verursacht</th>
                    <th className="py-2 px-3 font-medium text-center">SP erhalten</th>
                    <th className="py-2 px-3 font-medium text-center">Würfe</th>
                    <th className="py-2 px-3 font-medium text-center">Krits</th>
                    <th className="py-2 px-3 font-medium text-center">Patzer</th>
                    <th className="py-2 px-3 font-medium text-center">Zauber</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((s, i) => (
                    <tr
                      key={s.character_id || i}
                      className="border-b border-dsa-bg-medium/50 hover:bg-dsa-bg-light/30 transition-colors"
                    >
                      <td className="py-2.5 px-3 font-medium text-dsa-parchment">
                        {s.character_name || 'Unbekannt'}
                      </td>
                      <td className="py-2.5 px-3 text-center text-dsa-parchment-dark">
                        {s.kills ?? 0}
                      </td>
                      <td className="py-2.5 px-3 text-center text-dsa-parchment-dark">
                        {s.damage_dealt ?? 0}
                      </td>
                      <td className="py-2.5 px-3 text-center text-dsa-parchment-dark">
                        {s.damage_taken ?? 0}
                      </td>
                      <td className="py-2.5 px-3 text-center text-dsa-parchment-dark">
                        {s.dice_rolls ?? 0}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={s.critical_successes > 0 ? 'text-dsa-success' : 'text-dsa-parchment-dark'}>
                          {s.critical_successes ?? 0}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={s.critical_failures > 0 ? 'text-red-400' : 'text-dsa-parchment-dark'}>
                          {s.critical_failures ?? 0}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={s.spells_cast > 0 ? 'text-dsa-mana-light' : 'text-dsa-parchment-dark'}>
                          {s.spells_cast ?? 0}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Back button */}
        <div className="text-center">
          <button
            onClick={() => navigate('/dashboard')}
            className="btn-secondary flex items-center gap-2 mx-auto"
          >
            <ArrowLeft className="w-4 h-4" />
            Zurück zum Dashboard
          </button>
        </div>
      </div>
    </div>
  )
}
