import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Loader2, AlertCircle, Trophy, Swords, Shield,
  Skull, Sparkles, Target, Zap, TrendingUp, Download, Star, Home,
  MessageSquare, Send, Check
} from 'lucide-react'
import useAuthStore from '../../stores/authStore'
import useDashboardStore from '../../stores/dashboardStore'
import SteigerungModal from './SteigerungModal'

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
  const user = useAuthStore((s) => s.user)
  const fetchSessionStats = useDashboardStore((s) => s.fetchSessionStats)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sessionData, setSessionData] = useState(null)
  const [stats, setStats] = useState([])
  const [playerChar, setPlayerChar] = useState(null)
  const [showLevelUp, setShowLevelUp] = useState(false)

  // Feedback state
  const [feedbackRating, setFeedbackRating] = useState(0)
  const [feedbackMvp, setFeedbackMvp] = useState('')
  const [feedbackComment, setFeedbackComment] = useState('')
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)
  const [feedbackSending, setFeedbackSending] = useState(false)
  const [feedbackAgg, setFeedbackAgg] = useState(null) // aggregate results

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
            const loadedStats = Array.isArray(data.stats) ? data.stats : []
            setStats(loadedStats)
            // Fetch the player's character for SteigerungModal / export
            const myStats = loadedStats.find((s) => s.user_id === user?.id)
            if (myStats?.character_id) {
              try {
                const charRes = await fetch(`/api/characters/${myStats.character_id}`, {
                  headers: { Authorization: `Bearer ${token}` },
                })
                if (charRes.ok && !cancelled) {
                  setPlayerChar(await charRes.json())
                }
              } catch { /* non-critical */ }
            }
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
  }, [sessionId, token, user, navigate, fetchSessionStats])

  const handleExport = async () => {
    if (!playerChar?.id) return
    try {
      const res = await fetch(`/api/characters/${playerChar.id}/export`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(playerChar.name || 'charakter').replace(/[^a-zA-Z0-9äöüÄÖÜß\s-]/g, '')}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch { /* ignore */ }
  }

  const handleLevelUpSaved = (updatedChar) => {
    setPlayerChar(updatedChar)
    setShowLevelUp(false)
  }

  // Load existing feedback
  useEffect(() => {
    if (!sessionId || !token) return
    fetch(`/api/sessions/${sessionId}/feedback`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        setFeedbackAgg(data)
        // Check if current user already submitted
        const mine = (data.feedback || []).find(f => f.user_id === user?.id)
        if (mine) {
          setFeedbackRating(mine.rating)
          setFeedbackMvp(mine.mvp_character_id || '')
          setFeedbackComment(mine.comment || '')
          setFeedbackSubmitted(true)
        }
      })
      .catch(() => {})
  }, [sessionId, token, user?.id])

  const handleSubmitFeedback = async () => {
    if (feedbackRating < 1) return
    setFeedbackSending(true)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/feedback`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: feedbackRating,
          mvp_character_id: feedbackMvp || null,
          comment: feedbackComment || null,
        }),
      })
      if (res.ok) {
        setFeedbackSubmitted(true)
        // Refresh aggregate
        const aggRes = await fetch(`/api/sessions/${sessionId}/feedback`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (aggRes.ok) setFeedbackAgg(await aggRes.json())
      }
    } catch { /* ignore */ }
    setFeedbackSending(false)
  }

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

        {/* Session Feedback */}
        <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded overflow-hidden">
          <div className="px-4 py-3 border-b border-dsa-bg-medium flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-dsa-gold" />
            <h2 className="font-semibold text-dsa-parchment">Sitzungs-Feedback</h2>
          </div>
          <div className="p-4 space-y-4">
            {/* Star rating */}
            <div>
              <label className="text-xs text-dsa-parchment-dark block mb-1.5">Bewertung</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    onClick={() => !feedbackSubmitted && setFeedbackRating(n)}
                    disabled={feedbackSubmitted}
                    className="p-0.5 transition-transform hover:scale-110 disabled:hover:scale-100"
                  >
                    <Star
                      className={`w-7 h-7 transition-colors ${
                        n <= feedbackRating ? 'text-dsa-gold fill-dsa-gold' : 'text-dsa-bg-medium'
                      }`}
                    />
                  </button>
                ))}
                {feedbackRating > 0 && (
                  <span className="text-xs text-dsa-parchment-dark self-center ml-2">
                    {feedbackRating}/5
                  </span>
                )}
              </div>
            </div>

            {/* MVP vote */}
            {stats.length > 1 && (
              <div>
                <label className="text-xs text-dsa-parchment-dark block mb-1.5">MVP — Bester Rollenspieler</label>
                <select
                  value={feedbackMvp}
                  onChange={e => setFeedbackMvp(e.target.value)}
                  disabled={feedbackSubmitted}
                  className="input-field text-xs w-full max-w-xs"
                >
                  <option value="">— Keiner gewählt —</option>
                  {stats
                    .filter(s => s.character_id !== playerChar?.id)
                    .map(s => (
                      <option key={s.character_id} value={s.character_id}>
                        {s.character_name || 'Unbekannt'}
                      </option>
                    ))}
                </select>
              </div>
            )}

            {/* Comment */}
            <div>
              <label className="text-xs text-dsa-parchment-dark block mb-1.5">Kommentar (optional)</label>
              <textarea
                value={feedbackComment}
                onChange={e => setFeedbackComment(e.target.value.slice(0, 500))}
                disabled={feedbackSubmitted}
                placeholder="Was hat dir an der Sitzung gefallen? Was kann verbessert werden?"
                rows={2}
                className="input-field text-xs w-full resize-none"
              />
              <span className="text-[9px] text-dsa-parchment-dark/40">{feedbackComment.length}/500</span>
            </div>

            {/* Submit / Status */}
            {feedbackSubmitted ? (
              <div className="flex items-center gap-2 text-xs text-green-400">
                <Check className="w-4 h-4" /> Feedback gespeichert!
              </div>
            ) : (
              <button
                onClick={handleSubmitFeedback}
                disabled={feedbackRating < 1 || feedbackSending}
                className="btn-primary text-xs flex items-center gap-2 disabled:opacity-30"
              >
                {feedbackSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Feedback senden
              </button>
            )}

            {/* Aggregate results (shown after submission or if data available) */}
            {feedbackAgg && feedbackAgg.count > 0 && (
              <div className="border-t border-dsa-bg-medium pt-3 mt-3 space-y-2">
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-dsa-parchment-dark">
                    Durchschnitt: <strong className="text-dsa-gold">{feedbackAgg.average_rating}/5</strong>
                  </span>
                  <span className="text-dsa-parchment-dark">
                    {feedbackAgg.count} {feedbackAgg.count === 1 ? 'Bewertung' : 'Bewertungen'}
                  </span>
                  {feedbackAgg.mvp && (
                    <span className="text-dsa-parchment-dark">
                      MVP: <strong className="text-dsa-gold">{feedbackAgg.mvp}</strong>
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* AP earned badge + action buttons */}
        {playerChar && (
          <div className="bg-gradient-to-r from-amber-900/40 to-amber-950/20 border border-amber-800/30 rounded-sm px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Star className="w-5 h-5 text-dsa-gold" />
              <span className="text-sm font-display font-bold text-dsa-gold">{playerChar.name}</span>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-dsa-parchment-dark uppercase">Verfügbare AP</div>
              <div className="text-lg font-mono font-bold text-green-400">
                {playerChar.available_ap || 0} <span className="text-[10px] text-dsa-parchment-dark font-normal">AP</span>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3">
          {playerChar && (playerChar.available_ap || 0) > 0 && (
            <button
              onClick={() => setShowLevelUp(true)}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              <TrendingUp className="w-4 h-4" />
              AP ausgeben
            </button>
          )}
          <button
            onClick={() => navigate('/dashboard')}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <Home className="w-4 h-4" />
            Zum Dashboard
          </button>
          {playerChar && (
            <button
              onClick={handleExport}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              <Download className="w-4 h-4" />
              Exportieren
            </button>
          )}
        </div>
      </div>

      {/* SteigerungModal */}
      {showLevelUp && playerChar && (
        <SteigerungModal
          character={playerChar}
          onClose={() => setShowLevelUp(false)}
          onSaved={handleLevelUpSaved}
        />
      )}
    </div>
  )
}
