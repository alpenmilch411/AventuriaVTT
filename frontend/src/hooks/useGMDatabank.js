import { useState, useRef, useCallback, useEffect } from 'react'
import useAuthStore from '../stores/authStore'

/**
 * Lazy-loads talent and creature data from the databank API.
 * Data is fetched once on first access and cached for the session.
 */
export default function useGMDatabank({ showBattleSetup, showProbePopup }) {
  const [talentList, setTalentList] = useState([])
  const [creatureList, setCreatureList] = useState([])
  const talentsLoaded = useRef(false)
  const creaturesLoaded = useRef(false)

  const loadTalentsIfNeeded = useCallback(async () => {
    if (talentsLoaded.current || talentList.length > 0) return
    talentsLoaded.current = true
    const token = useAuthStore.getState().token
    try {
      const res = await fetch('/api/databank/talents', { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const data = await res.json()
        setTalentList(Array.isArray(data) ? data : (data.items || []))
      }
    } catch (err) { console.error('Failed to load talents:', err) }
  }, [talentList.length])

  const loadCreaturesIfNeeded = useCallback(async () => {
    if (creaturesLoaded.current || creatureList.length > 0) return
    creaturesLoaded.current = true
    const token = useAuthStore.getState().token
    try {
      const res = await fetch('/api/databank/creatures', { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const data = await res.json()
        setCreatureList(Array.isArray(data) ? data : (data.items || []))
      }
    } catch (err) { console.error('Failed to load creatures:', err) }
  }, [creatureList.length])

  // Lazy-load databank when features that need them are opened
  useEffect(() => { if (showBattleSetup) loadCreaturesIfNeeded() }, [showBattleSetup, loadCreaturesIfNeeded])
  useEffect(() => { if (showProbePopup) loadTalentsIfNeeded() }, [showProbePopup, loadTalentsIfNeeded])

  return { talentList, creatureList, loadTalentsIfNeeded, loadCreaturesIfNeeded }
}
