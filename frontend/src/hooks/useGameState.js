import { useMemo } from 'react'
import useSessionStore from '../stores/sessionStore'
import useCombatStore from '../stores/combatStore'
import useCharacterStore from '../stores/characterStore'
import useCampaignStore from '../stores/campaignStore'

export default function useGameState() {
  const phase = useSessionStore((s) => s.phase)
  const isGM = useSessionStore((s) => s.isGM)
  const isHalted = useSessionStore((s) => s.isHalted)
  const isAttentionMode = useSessionStore((s) => s.isAttentionMode)
  const players = useSessionStore((s) => s.players)
  const sessionCode = useSessionStore((s) => s.sessionCode)

  const combatActive = useCombatStore((s) => s.combatActive)
  const currentRound = useCombatStore((s) => s.currentRound)
  const initiativeOrder = useCombatStore((s) => s.initiativeOrder)
  const currentTurnIndex = useCombatStore((s) => s.currentTurnIndex)
  const isMyTurn = useCombatStore((s) => s.isMyTurn)
  const pendingDiceRequest = useCombatStore((s) => s.pendingDiceRequest)
  const pendingDefense = useCombatStore((s) => s.pendingDefense)

  const myCharacter = useCharacterStore((s) => s.myCharacter)
  const vitals = useCharacterStore((s) => s.getVitals)
  const conditions = useCharacterStore((s) => s.getConditions)

  const worldClock = useCampaignStore((s) => s.worldClock)
  const weather = useCampaignStore((s) => s.weather)

  const pendingAction = useMemo(() => {
    if (pendingDefense) return 'defense'
    if (pendingDiceRequest) return 'dice'
    if (combatActive && isMyTurn()) return 'my_turn'
    return null
  }, [pendingDefense, pendingDiceRequest, combatActive, isMyTurn])

  const currentCombatant = useMemo(() => {
    if (!combatActive || initiativeOrder.length === 0) return null
    return initiativeOrder[currentTurnIndex] || null
  }, [combatActive, initiativeOrder, currentTurnIndex])

  return {
    // Session
    phase,
    isGM,
    isHalted,
    isAttentionMode,
    players,
    sessionCode,

    // Combat
    combatActive,
    currentRound,
    initiativeOrder,
    currentTurnIndex,
    currentCombatant,
    isMyTurn: isMyTurn(),
    pendingDiceRequest,
    pendingDefense,
    pendingAction,

    // Character
    myCharacter,
    vitals: vitals(),
    conditions: conditions(),

    // World
    worldClock,
    weather,
  }
}
