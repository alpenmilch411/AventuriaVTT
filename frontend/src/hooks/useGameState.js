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

  // Computed from battles — no legacy fields, no subscriber
  const battles = useCombatStore((s) => s.battles)
  const activeBattleId = useCombatStore((s) => s.activeBattleId)
  const activeBattle = battles[activeBattleId]
  const combatActive = Object.keys(battles).length > 0
  const currentRound = activeBattle?.round || 0
  const initiativeOrder = activeBattle?.initiativeOrder || []
  const currentTurnIndex = activeBattle?.currentTurnIndex || 0
  const isMyTurn = useCombatStore((s) => s.isMyTurn)
  const pendingDiceRequest = useCombatStore((s) => s.pendingDiceRequest)
  const pendingDefense = useCombatStore((s) => s.pendingDefense)

  const myCharacter = useCharacterStore((s) => s.myCharacter)
  const myConditions = myCharacter?.conditions || []

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
    phase, isGM, isHalted, isAttentionMode, players, sessionCode,
    combatActive, currentRound, initiativeOrder, currentTurnIndex,
    currentCombatant, isMyTurn: isMyTurn(),
    pendingDiceRequest, pendingDefense, pendingAction,
    myCharacter, conditions: myConditions,
    worldClock, weather,
  }
}
