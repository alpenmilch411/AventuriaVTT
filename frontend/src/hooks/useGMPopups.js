import { useState, useEffect } from 'react'
import useCombatStore from '../stores/combatStore'

/**
 * Manages all popup/modal visibility states and selection states for the GM Cockpit.
 */
export default function useGMPopups() {
  const battles = useCombatStore((s) => s.battles)
  const activeBattleId = useCombatStore((s) => s.activeBattleId)

  const [showPrep, setShowPrep] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showCombatOverlay, setShowCombatOverlay] = useState(null)
  const [victoryLoot, setVictoryLoot] = useState(null)
  const [showLoot, setShowLoot] = useState(null)
  const [showBattleSetup, setShowBattleSetup] = useState(false)
  const [combatMinimized, setCombatMinimized] = useState(false)
  const [selectedPlayerIds, setSelectedPlayerIds] = useState(new Set())
  const [quickAction, setQuickAction] = useState(null) // 'probe' | 'health' | 'items' | 'whisper' | null
  const [probeTalent, setProbeTalent] = useState('')
  const [probeDifficulty, setProbeDifficulty] = useState(0)
  const [probeSearch, setProbeSearch] = useState('')
  const [whisperText, setWhisperText] = useState('')
  const [healthInput, setHealthInput] = useState('')
  const [npcDetail, setNpcDetail] = useState(null) // creature object for detail modal
  const [showCampaignManager, setShowCampaignManager] = useState(false)
  const [showDiceRoller, setShowDiceRoller] = useState(false)
  const [diceFormula, setDiceFormula] = useState('1W6')
  const [diceResult, setDiceResult] = useState(null)
  const [showNotes, setShowNotes] = useState(false)
  const [showQuests, setShowQuests] = useState(false)
  const [showConditionPopup, setShowConditionPopup] = useState(false)
  const [showProbePopup, setShowProbePopup] = useState(false)
  const [showVitalsPopup, setShowVitalsPopup] = useState(false)
  const [gmNotes, setGmNotes] = useState(() => { try { return localStorage.getItem('aventuria_gm_notes') || '' } catch { return '' } })
  const [detailPlayer, setDetailPlayer] = useState(null) // player object for detail modal

  // Clear stale overlays when combat ends
  useEffect(() => {
    if (showCombatOverlay && !battles[showCombatOverlay]) setShowCombatOverlay(null)
    if (!activeBattleId) { setCombatMinimized(false) }
  }, [activeBattleId, battles, showCombatOverlay])

  return {
    showPrep, setShowPrep,
    showNotifications, setShowNotifications,
    showCombatOverlay, setShowCombatOverlay,
    victoryLoot, setVictoryLoot,
    showLoot, setShowLoot,
    showBattleSetup, setShowBattleSetup,
    combatMinimized, setCombatMinimized,
    selectedPlayerIds, setSelectedPlayerIds,
    quickAction, setQuickAction,
    probeTalent, setProbeTalent,
    probeDifficulty, setProbeDifficulty,
    probeSearch, setProbeSearch,
    whisperText, setWhisperText,
    healthInput, setHealthInput,
    npcDetail, setNpcDetail,
    showCampaignManager, setShowCampaignManager,
    showDiceRoller, setShowDiceRoller,
    diceFormula, setDiceFormula,
    diceResult, setDiceResult,
    showNotes, setShowNotes,
    showQuests, setShowQuests,
    showConditionPopup, setShowConditionPopup,
    showProbePopup, setShowProbePopup,
    showVitalsPopup, setShowVitalsPopup,
    gmNotes, setGmNotes,
    detailPlayer, setDetailPlayer,
  }
}
