import { useCallback } from 'react'
import useSessionStore from '../stores/sessionStore'
import useCombatStore from '../stores/combatStore'

export default function useGMControls(sendMessage) {
  const setPhase = useSessionStore((s) => s.setPhase)
  const setHalted = useSessionStore((s) => s.setHalted)

  const halt = useCallback(() => {
    setHalted(true)
    sendMessage?.({ type: 'halt', payload: {} })
  }, [sendMessage, setHalted])

  const releaseHalt = useCallback(() => {
    setHalted(false)
    sendMessage?.({ type: 'halt_release', payload: {} })
  }, [sendMessage, setHalted])

  const attention = useCallback(() => {
    sendMessage?.({ type: 'attention', payload: {} })
  }, [sendMessage])

  const releaseAttention = useCallback(() => {
    sendMessage?.({ type: 'attention_release', payload: {} })
  }, [sendMessage])

  const changePhase = useCallback((phase) => {
    setPhase(phase)
    sendMessage?.({ type: 'phase_change', payload: { phase } })
  }, [sendMessage, setPhase])

  const sendProbe = useCallback((targetUserId, probeData) => {
    sendMessage?.({
      type: 'dice_request',
      payload: {
        target_user_id: targetUserId,
        ...probeData,
      },
    })
  }, [sendMessage])

  const sendGroupProbe = useCallback((probeData) => {
    sendMessage?.({
      type: 'group_probe_request',
      payload: probeData,
    })
  }, [sendMessage])

  const whisper = useCallback((targetUserId, text) => {
    sendMessage?.({
      type: 'whisper',
      payload: {
        target_user: targetUserId,
        text,
      },
    })
  }, [sendMessage])

  const startCombat = useCallback((initiativeOrder) => {
    useCombatStore.getState().startCombat(initiativeOrder)
    sendMessage?.({
      type: 'combat_start',
      payload: { combatants: initiativeOrder },
    })
    changePhase('combat')
  }, [sendMessage, changePhase])

  const endCombat = useCallback((battleId) => {
    const bid = battleId || useCombatStore.getState().activeBattleId
    useCombatStore.getState().endCombat()
    sendMessage?.({ type: 'combat_end', payload: { battle_id: bid } })
    changePhase('exploration')
  }, [sendMessage, changePhase])

  const advanceTurn = useCallback((battleId) => {
    const state = useCombatStore.getState()
    const bid = battleId || state.activeBattleId
    useCombatStore.getState().nextTurn(bid)
    const updated = useCombatStore.getState()
    const battle = updated.battles[bid]
    sendMessage?.({
      type: 'combat_next_turn',
      payload: {
        battle_id: bid,
        current_turn_index: battle?.currentTurnIndex,
        round_number: battle?.round,
        current_turn: battle?.initiativeOrder?.[battle?.currentTurnIndex],
      },
    })
  }, [sendMessage])

  const addCombatant = useCallback((battleId, combatant) => {
    useCombatStore.getState().addCombatant(battleId, combatant)
    sendMessage?.({
      type: 'combatant_added',
      payload: { battle_id: battleId, combatant },
    })
  }, [sendMessage])

  const removeCombatant = useCallback((battleId, combatantId) => {
    useCombatStore.getState().removeCombatant(battleId, combatantId)
    sendMessage?.({
      type: 'combatant_removed',
      payload: { battle_id: battleId, combatant_id: combatantId },
    })
  }, [sendMessage])

  const setTableView = useCallback((mode, data = null) => {
    useSessionStore.getState().setTableViewMode(mode, data)
    sendMessage?.({
      type: 'table_view_mode',
      payload: { mode, data },
    })
  }, [sendMessage])

  const awardAP = useCallback((playerIdOrAwards, amount) => {
    // Support both old API (playerId, amount) and new API (awards array)
    if (Array.isArray(playerIdOrAwards)) {
      sendMessage?.({ type: 'ap_award', payload: { awards: playerIdOrAwards } })
    } else {
      sendMessage?.({ type: 'ap_award', payload: { awards: [{ user_id: playerIdOrAwards, amount }] } })
    }
  }, [sendMessage])

  const setWorldClock = useCallback((clock) => {
    sendMessage?.({
      type: 'time_advance',
      payload: { new_time: clock },
    })
  }, [sendMessage])

  const setWeather = useCallback((weather) => {
    sendMessage?.({
      type: 'weather_change',
      payload: { weather },
    })
  }, [sendMessage])

  const spawnToken = useCallback((tokenData) => {
    sendMessage?.({
      type: 'token_spawn',
      payload: tokenData,
    })
  }, [sendMessage])

  const moveToken = useCallback((tokenId, x, y) => {
    sendMessage?.({
      type: 'token_move',
      payload: { token_id: tokenId, target_x: x, target_y: y },
    })
  }, [sendMessage])

  const removeToken = useCallback((tokenId) => {
    sendMessage?.({
      type: 'token_remove',
      payload: { token_id: tokenId },
    })
  }, [sendMessage])

  const pushHandout = useCallback((handout) => {
    sendMessage?.({
      type: 'handout_push',
      payload: handout,
    })
  }, [sendMessage])

  const sceneActivate = useCallback((sceneId, sceneName) => {
    sendMessage?.({
      type: 'scene_activate',
      payload: { scene_id: sceneId, scene_name: sceneName },
    })
  }, [sendMessage])

  const sendVitalsUpdate = useCallback((characterId, vitals) => {
    sendMessage?.({
      type: 'vitals_update',
      payload: { character_id: characterId, vitals },
    })
  }, [sendMessage])

  const sendConditionChange = useCallback((characterId, conditions) => {
    sendMessage?.({
      type: 'conditions_update',
      payload: { character_id: characterId, conditions },
    })
  }, [sendMessage])

  const sendLootDisplay = useCallback((sourceName, items) => {
    sendMessage?.({
      type: 'loot_display',
      payload: { source_name: sourceName, items },
    })
  }, [sendMessage])

  const sendLootDistribute = useCallback((distributions) => {
    sendMessage?.({
      type: 'loot_distribute',
      payload: { distributions },
    })
  }, [sendMessage])

  const sendCombatLogEntry = useCallback((entry) => {
    sendMessage?.({
      type: 'combat_log_entry',
      payload: entry,
    })
  }, [sendMessage])

  return {
    halt,
    releaseHalt,
    attention,
    releaseAttention,
    changePhase,
    sendProbe,
    sendGroupProbe,
    whisper,
    startCombat,
    endCombat,
    advanceTurn,
    addCombatant,
    removeCombatant,
    setTableView,
    awardAP,
    setWorldClock,
    setWeather,
    spawnToken,
    moveToken,
    removeToken,
    pushHandout,
    sceneActivate,
    sendVitalsUpdate,
    sendConditionChange,
    sendLootDisplay,
    sendLootDistribute,
    sendCombatLogEntry,
  }
}
