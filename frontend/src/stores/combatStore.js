import { create } from 'zustand'

// Stable empty references — avoids infinite re-render loops from subscriber
const EMPTY_ORDER = []
const EMPTY_LOG = []

/**
 * Multi-battle combat store.
 *
 * battles: { [battleId]: { id, name, round, initiativeOrder, currentTurnIndex, log } }
 * activeBattleId: which battle the GM is currently managing
 */
const useCombatStore = create((set, get) => ({
  battles: {},        // { battleId: BattleState }
  activeBattleId: null,
  combatLog: EMPTY_LOG,
  combatResult: null,       // { result: 'victory'|'defeat', summary, fallen, survivors, rounds } — shown after combat ends
  pendingDiceRequest: null,
  pendingDefense: null,
  myCharacterId: null,

  getCombatActive: () => Object.keys(get().battles).length > 0,

  isMyTurn: () => {
    const state = get()
    const battle = state.battles[state.activeBattleId]
    if (!battle || battle.initiativeOrder.length === 0) return false
    return battle.initiativeOrder[battle.currentTurnIndex]?.characterId === state.myCharacterId
  },

  turnsUntilMine: () => {
    const state = get()
    const battle = state.battles[state.activeBattleId]
    if (!battle || battle.initiativeOrder.length === 0) return 0
    const order = battle.initiativeOrder
    const idx = battle.currentTurnIndex
    for (let i = 1; i < order.length; i++) {
      const check = (idx + i) % order.length
      if (order[check]?.characterId === state.myCharacterId) return i
    }
    return 0
  },

  getCurrentRound: () => {
    const battle = get().battles[get().activeBattleId]
    return battle?.round || 0
  },

  getAllCombatants: () => {
    return Object.values(get().battles).flatMap(b => b.initiativeOrder)
  },

  setMyCharacterId: (id) => set({ myCharacterId: id }),

  // ── Battle lifecycle ──

  createBattle: (name) => {
    const id = `battle_${Date.now()}`
    set((state) => ({
      battles: {
        ...state.battles,
        [id]: {
          id,
          name: name || `Kampf ${Object.keys(state.battles).length + 1}`,
          round: 1,
          initiativeOrder: [],
          currentTurnIndex: 0,
          log: [{ type: 'system', text: `${name || 'Kampf'} beginnt!`, timestamp: Date.now() }],
        },
      },
      activeBattleId: id,
    }))
    return id
  },

  endBattle: (battleId) => set((state) => {
    const newBattles = { ...state.battles }
    delete newBattles[battleId]
    const remaining = Object.keys(newBattles)
    return {
      battles: newBattles,
      activeBattleId: remaining.length > 0 ? remaining[0] : null,
      combatLog: [...state.combatLog, { type: 'system', text: `Kampf beendet.`, timestamp: Date.now() }],
    }
  }),

  setActiveBattle: (battleId) => set({ activeBattleId: battleId }),

  // ── Combatants ──

  addCombatant: (battleId, combatant) => set((state) => {
    const battle = state.battles[battleId]
    if (!battle) return state
    return {
      battles: {
        ...state.battles,
        [battleId]: {
          ...battle,
          initiativeOrder: [...battle.initiativeOrder, combatant].sort((a, b) => (b.initiative || 0) - (a.initiative || 0)),
        },
      },
    }
  }),

  removeCombatant: (battleId, combatantId) => set((state) => {
    const battle = state.battles[battleId]
    if (!battle) return state
    const newOrder = battle.initiativeOrder.filter(c => c.id !== combatantId)
    return {
      battles: {
        ...state.battles,
        [battleId]: {
          ...battle,
          initiativeOrder: newOrder,
          currentTurnIndex: Math.min(battle.currentTurnIndex, Math.max(0, newOrder.length - 1)),
        },
      },
    }
  }),

  updateCombatant: (combatantId, updates) => set((state) => {
    const newBattles = {}
    for (const [bid, battle] of Object.entries(state.battles)) {
      let newOrder = battle.initiativeOrder.map(c =>
        c.id === combatantId ? { ...c, ...updates } : c
      )
      // Re-sort if initiative changed
      if (updates.initiative !== undefined) {
        newOrder = [...newOrder].sort((a, b) => (b.initiative || 0) - (a.initiative || 0))
      }
      newBattles[bid] = { ...battle, initiativeOrder: newOrder }
    }
    return { battles: newBattles }
  }),

  // Move combatant between battles (disengage from one, join another)
  moveCombatant: (fromBattleId, toBattleId, combatantId) => set((state) => {
    const fromBattle = state.battles[fromBattleId]
    const toBattle = state.battles[toBattleId]
    if (!fromBattle || !toBattle) return state
    const combatant = fromBattle.initiativeOrder.find(c => c.id === combatantId)
    if (!combatant) return state
    return {
      battles: {
        ...state.battles,
        [fromBattleId]: {
          ...fromBattle,
          initiativeOrder: fromBattle.initiativeOrder.filter(c => c.id !== combatantId),
        },
        [toBattleId]: {
          ...toBattle,
          initiativeOrder: [...toBattle.initiativeOrder, combatant].sort((a, b) => (b.initiative || 0) - (a.initiative || 0)),
        },
      },
    }
  }),

  // ── Turn flow ──

  nextTurn: (battleId) => set((state) => {
    const battle = state.battles[battleId || state.activeBattleId]
    if (!battle || battle.initiativeOrder.length === 0) return state
    const bid = battleId || state.activeBattleId
    const len = battle.initiativeOrder.length
    let nextIndex = (battle.currentTurnIndex + 1) % len
    let newRound = nextIndex === 0 ? battle.round + 1 : battle.round
    // Skip dead combatants (lep <= 0), but stop after one full cycle to avoid infinite loop.
    // Combatants with lep === undefined are considered alive (they haven't taken damage yet).
    let skipped = 0
    while (skipped < len) {
      const c = battle.initiativeOrder[nextIndex]
      if (!c) break // safety: null combatant
      if (c.lep === undefined || c.lep > 0) break // alive or never-damaged
      nextIndex = (nextIndex + 1) % len
      if (nextIndex === 0) newRound++
      skipped++
    }
    // Reset _reactionsThisRound at the start of each new round (DSA5: reactions reset per KR)
    let updatedOrder = battle.initiativeOrder
    if (newRound > battle.round) {
      updatedOrder = battle.initiativeOrder.map(c => ({ ...c, _reactionsThisRound: 0 }))
    }
    return {
      battles: {
        ...state.battles,
        [bid]: { ...battle, initiativeOrder: updatedOrder, currentTurnIndex: nextIndex, round: newRound },
      },
      // Only clear combat-related dice requests, not talent/spell probes
      pendingDiceRequest: state.pendingDiceRequest && ['talent_probe', 'spell_probe'].includes(state.pendingDiceRequest.type) ? state.pendingDiceRequest : null,
      pendingDefense: null,
    }
  }),

  reorderInitiative: (battleId, newOrder) => set((state) => {
    const battle = state.battles[battleId]
    if (!battle) return state
    return {
      battles: {
        ...state.battles,
        [battleId]: { ...battle, initiativeOrder: newOrder },
      },
    }
  }),

  // ── Log ──

  addLogEntry: (entry) => set((state) => ({
    combatLog: [...state.combatLog, { ...entry, timestamp: Date.now() }].slice(-200),
  })),

  addCombatLogEntry: (entry) => set((state) => ({
    combatLog: [...state.combatLog, entry].slice(-200),
  })),

  addBattleLogEntry: (battleId, entry) => set((state) => {
    const battle = state.battles[battleId]
    if (!battle) return state
    return {
      battles: {
        ...state.battles,
        [battleId]: { ...battle, log: [...battle.log, { ...entry, timestamp: Date.now() }].slice(-100) },
      },
    }
  }),

  // ── Dice ──

  pendingPlayerAction: null,
  lastDiceResult: null,
  setPendingDiceRequest: (request) => set({ pendingDiceRequest: request }),
  probeConsequences: [],
  setProbeConsequences: (consequences) => set({ probeConsequences: consequences }),
  setPendingDefense: (defense) => set({ pendingDefense: defense }),
  setPendingPlayerAction: (action) => set({ pendingPlayerAction: action }),
  clearPendingDiceRequest: () => set({ pendingDiceRequest: null }),
  clearPendingDefense: () => set({ pendingDefense: null }),
  clearPendingPlayerAction: () => set({ pendingPlayerAction: null }),
  setLastDiceResult: (result) => set({ lastDiceResult: result }),
  clearLastDiceResult: () => set({ lastDiceResult: null }),
  clearCombatResult: () => set({ combatResult: null }),

  startCombat: (initiativeOrder) => {
    const id = get().createBattle('Kampf')
    set((state) => ({
      battles: {
        ...state.battles,
        [id]: { ...state.battles[id], initiativeOrder },
      },
    }))
  },

  endCombat: () => {
    const activeId = get().activeBattleId
    if (activeId) get().endBattle(activeId)
  },

  // ── WebSocket handler ──

  handleCombatMessage: (msg) => {
    const { type, payload } = msg
    switch (type) {
      case 'combat_start': {
        const iniOrder = payload.initiative_order || payload.combatants || []
        const name = payload.name || 'Kampf'
        // If GM already created this battle locally (via BattleManager.createBattle),
        // just update the existing active battle with initiative data instead of creating a duplicate
        const existing = get().activeBattleId
        if (existing && get().battles[existing]) {
          set((state) => ({
            battles: {
              ...state.battles,
              [existing]: {
                ...state.battles[existing],
                initiativeOrder: iniOrder.length > 0 ? iniOrder : state.battles[existing].initiativeOrder,
                round: iniOrder.length > 0 ? (payload.round_number || payload.round || 1) : state.battles[existing].round,
              },
            },
            combatResult: null,
          }))
        } else {
          // Player receiving combat_start — create the battle fresh
          const id = payload.battle_id || `battle_${Date.now()}`
          set((state) => ({
            battles: {
              ...state.battles,
              [id]: {
                id,
                name,
                round: iniOrder.length > 0 ? (payload.round_number || payload.round || 1) : 1,
                initiativeOrder: iniOrder,
                currentTurnIndex: 0,
                log: [{ type: 'system', text: `${name} beginnt!`, timestamp: Date.now() }],
              },
            },
            activeBattleId: id,
            combatResult: null,
          }))
        }
        break
      }
      case 'combat_end':
        // Store combat result for end-of-combat screen (victory/defeat)
        if (payload?.result) {
          set({
            combatResult: {
              result: payload.result,
              summary: payload.summary,
              fallen: payload.fallen || [],
              survivors: payload.survivors || [],
              rounds: payload.rounds,
            },
          })
        }
        if (payload?.battle_id) get().endBattle(payload.battle_id)
        else get().endCombat()
        break
      case 'next_turn':
      case 'combat_next_turn': {
        // Find the battle to update — use battle_id from payload or active battle
        const bid = payload?.battle_id || get().activeBattleId
        const battle = bid ? get().battles[bid] : null
        if (battle) {
          const updates = {}
          if (payload?.initiative_order) {
            // Merge locally-tracked vitals (lep) into incoming order so HP isn't reset
            const localById = {}
            for (const c of battle.initiativeOrder) {
              localById[c.id] = c
              if (c.characterId) localById[c.characterId] = c
            }
            updates.initiativeOrder = payload.initiative_order.map(c => {
              const local = localById[c.id] || localById[c.characterId]
              if (local && c.lep === undefined && local.lep !== undefined) {
                return { ...c, lep: local.lep }
              }
              return c
            })
          }
          if (payload?.current_turn_index !== undefined) updates.currentTurnIndex = payload.current_turn_index
          if (payload?.round !== undefined) updates.round = payload.round
          if (payload?.round_number !== undefined) updates.round = payload.round_number
          if (Object.keys(updates).length > 0) {
            set((state) => ({
              battles: { ...state.battles, [bid]: { ...state.battles[bid], ...updates } },
            }))
          } else {
            get().nextTurn(bid)
          }
        } else {
          get().nextTurn()
        }
        // Log
        const turnName = payload?.combatant_name || payload?.current_turn?.name
        if (turnName) {
          get().addCombatLogEntry({ type: 'system', text: `${turnName} ist am Zug.` })
        }
        break
      }
      case 'combatant_added':
        get().addCombatant(payload.battle_id || get().activeBattleId, payload.combatant)
        break
      case 'combatant_removed':
        get().removeCombatant(payload.battle_id || get().activeBattleId, payload.combatant_id)
        break
      case 'combatant_update':
        get().updateCombatant(payload.combatant_id, payload.updates)
        break
      case 'initiative_reorder':
        get().reorderInitiative(payload.battle_id || get().activeBattleId, payload.order)
        break
      case 'combat_log':
        get().addLogEntry(payload)
        break
      case 'dice_request':
        set({ pendingDiceRequest: payload })
        break
      case 'defense_request':
        set({ pendingDefense: payload })
        break
      default:
        break
    }
  },

  reset: () => set({
    battles: {}, activeBattleId: null,
    combatLog: EMPTY_LOG, combatResult: null,
    pendingDiceRequest: null, pendingDefense: null, myCharacterId: null,
  }),
}))

// NOTE: No subscriber that calls setState — this was the root cause of infinite loops.
// Legacy fields (combatActive, currentRound, initiativeOrder, currentTurnIndex) are
// replaced by computed selectors that derive from battles on read, not on write.

export default useCombatStore
