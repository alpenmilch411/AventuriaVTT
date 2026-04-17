import { useState, useEffect } from 'react'
import useAuthStore from '../stores/authStore'
import useSessionStore from '../stores/sessionStore'
import useCharacterStore from '../stores/characterStore'
import useCombatStore from '../stores/combatStore'
import { getConditions, getVitalsFrom, getMaxVitals } from '../utils/safeData'

/**
 * Manages GM session lifecycle: auth check, campaign data loading,
 * session setup, and store cleanup on unmount.
 */
export default function useGMSession(sessionCode) {
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  const fetchMe = useAuthStore((s) => s.fetchMe)
  const setSession = useSessionStore((s) => s.setSession)
  const [isAuthorizedGM, setIsAuthorizedGM] = useState(null) // null=loading, true/false

  const userId = user?.id

  // Ensure user is fetched if we have a token but no user
  useEffect(() => { if (!userId && token) fetchMe() }, [userId, token, fetchMe])

  // Set up session and load data when dependencies change
  useEffect(() => {
    if (!userId || !token) return
    setSession({ sessionCode, isGM: true })
    loadData()
  }, [sessionCode, token, userId])

  // Reset all stores on unmount
  useEffect(() => {
    return () => {
      useSessionStore.getState().reset()
      useCombatStore.getState().reset()
      useCharacterStore.getState().reset()
    }
  }, [])

  const loadData = async () => {
    const currentToken = useAuthStore.getState().token
    const currentUser = useAuthStore.getState().user
    if (!currentToken || !currentUser) return
    const headers = { Authorization: `Bearer ${currentToken}` }
    try {
      // Get session by code
      const sessRes = await fetch(`/api/sessions/by-code/${sessionCode}`, { headers })
      if (!sessRes.ok) return
      const sessData = await sessRes.json()

      // Verify this user is the GM
      if (sessData.gm_user_id !== currentUser.id) { setIsAuthorizedGM(false); return }
      setIsAuthorizedGM(true)

      useSessionStore.getState().setSession({ sessionCode, sessionId: sessData.id, isGM: true })

      // Get players with full character data
      const playersRes = await fetch(`/api/sessions/${sessData.id}/players-detail`, { headers }).catch(() => ({ ok: false }))
      const playersData = playersRes.ok ? await playersRes.json() : []

      if (Array.isArray(playersData) && playersData.length > 0) {
        useSessionStore.getState().setPlayers(playersData.map(p => {
          const v = getVitalsFrom(p)
          const mv = getMaxVitals(p)
          return {
            id: p.user_id, username: p.username, characterId: p.character_id, character: p.character,
            connected: p.connected,
            current_vitals: p.current_vitals || {},
            // Legacy flat fields preserved for components that still read them;
            // the safeData helpers also fall back to these, so either shape works.
            currentLeP: v.lep, maxLeP: mv.lepMax,
            currentAsP: v.asp, maxAsP: mv.aspMax,
            currentKaP: v.kap, maxKaP: mv.kapMax,
            currentSchiP: v.schip,
            conditions: getConditions(p),
          }
        }))
        useCharacterStore.getState().setAllCharacters(
          playersData.filter(p => p.character).map(p => ({
            ...p.character,
            current_vitals: p.current_vitals || {},
          }))
        )
      }
      // Talents and creatures loaded lazily on first use (see useGMDatabank)
    } catch (err) { console.error('Failed to load:', err) }
  }

  return { isAuthorizedGM }
}
