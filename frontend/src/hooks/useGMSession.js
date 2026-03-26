import { useState, useEffect } from 'react'
import useAuthStore from '../stores/authStore'
import useSessionStore from '../stores/sessionStore'
import useCampaignStore from '../stores/campaignStore'
import useCharacterStore from '../stores/characterStore'
import useCombatStore from '../stores/combatStore'
import useMapStore from '../stores/mapStore'
import { getConditions } from '../utils/safeData'

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
      useCampaignStore.getState().reset()
      useMapStore.getState().reset()
    }
  }, [])

  const loadData = async () => {
    const currentToken = useAuthStore.getState().token
    const currentUser = useAuthStore.getState().user
    if (!currentToken || !currentUser) return
    const headers = { Authorization: `Bearer ${currentToken}` }
    try {
      const sessRes = await fetch(`/api/sessions/by-code/${sessionCode}`, { headers })
      let campaignId = null
      if (sessRes.ok) {
        const sessData = await sessRes.json()
        campaignId = sessData.campaign_id
        useSessionStore.getState().setSession({ sessionCode, sessionId: sessData.id, campaignId, isGM: true })
      }
      if (!campaignId) {
        const campRes = await fetch('/api/campaigns', { headers })
        if (campRes.ok) { const c = await campRes.json(); if (c.length) campaignId = c[0].id }
      }
      // Verify this user is the GM of this campaign
      if (campaignId) {
        const campCheck = await fetch(`/api/campaigns/${campaignId}`, { headers })
        if (campCheck.ok) {
          const campData = await campCheck.json()
          if (campData.gm_user_id !== currentUser.id) { setIsAuthorizedGM(false); return }
          setIsAuthorizedGM(true)
        }
      }
      if (!campaignId) return

      const [campRes, playersRes] = await Promise.all([
        fetch(`/api/campaigns/${campaignId}`, { headers }),
        fetch(`/api/campaigns/${campaignId}/players-detail`, { headers }).catch(() => ({ ok: false })),
      ])

      const campaignData = campRes.ok ? await campRes.json() : null
      const playersData = playersRes.ok ? await playersRes.json() : []

      if (campaignData) {
        useCampaignStore.getState().setCampaignData({ campaign: campaignData, scenes: [], npcs: [], quests: [], loreBook: [] })
      }
      if (Array.isArray(playersData) && playersData.length > 0) {
        const cv = (p) => p.current_vitals || {}
        useSessionStore.getState().setPlayers(playersData.map(p => ({
          id: p.user_id, username: p.username, characterId: p.character_id, character: p.character,
          connected: p.connected,
          current_vitals: cv(p),
          currentLeP: cv(p).lep ?? p.current_lep, maxLeP: p.character?.derived_values?.LeP_max,
          currentAsP: cv(p).asp ?? p.current_asp, maxAsP: p.character?.derived_values?.AsP_max,
          currentKaP: cv(p).kap ?? p.current_kap, maxKaP: p.character?.derived_values?.KaP_max,
          currentSchiP: cv(p).schip ?? p.current_schip,
          conditions: getConditions(p),
        })))
        useCharacterStore.getState().setAllCharacters(
          playersData.filter(p => p.character).map(p => ({
            ...p.character,
            current_vitals: cv(p),
          }))
        )
      }
      // Talents and creatures loaded lazily on first use (see useGMDatabank)
    } catch (err) { console.error('Failed to load:', err) }
  }

  return { isAuthorizedGM }
}
