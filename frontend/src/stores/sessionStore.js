import { create } from 'zustand'

const useSessionStore = create((set, get) => ({
  sessionCode: null,
  sessionId: null,
  campaignId: null,
  phase: 'lobby', // lobby | exploration | combat
  isGM: false,
  isHalted: false,
  isAttentionMode: false,
  players: [],
  sessionInfo: null,

  notifications: [],
  activeProcesses: [], // { id, type: 'probe'|'trade', label, data, timestamp }
  pendingRequest: null, // { id, type, label, timestamp } — player's pending request awaiting GM

  // ── World state (formerly in campaignStore; owned by the session now) ──
  weather: 'klar',
  worldClock: { date: '1. Praios 1040 BF', time: '12:00', dayNight: 'day' },
  restResults: null, // { results: [...], duration_hours: int } — set by rest_end WS

  setWeather: (weather) => set({ weather }),
  setWorldClock: (clock) => set({ worldClock: clock }),
  setRestResults: (results) => set({ restResults: results }),

  setPendingRequest: (request) => set({ pendingRequest: request }),
  clearPendingRequest: () => set({ pendingRequest: null }),

  addActiveProcess: (process) => set((state) => ({
    activeProcesses: [process, ...state.activeProcesses.filter(p => p.id !== process.id)],
  })),
  removeActiveProcess: (id) => set((state) => ({
    activeProcesses: state.activeProcesses.filter(p => p.id !== id),
  })),

  addNotification: (notif) => set((state) => ({
    notifications: [notif, ...state.notifications].slice(0, 50),
  })),

  dismissNotification: (id) => set((state) => ({
    notifications: state.notifications.filter(n => n.id !== id),
  })),

  activeLoot: null,
  setActiveLoot: (loot) => set({ activeLoot: loot }),

  lootReceived: null, // { source_name, items: [{ name, quantity, weight }] } — shown as player popup
  setLootReceived: (loot) => set({ lootReceived: loot }),
  clearLootReceived: () => set({ lootReceived: null }),

  sceneContent: [], // Items pushed by GM via scene_content_push
  setSceneContent: (items) => set({ sceneContent: items }),

  // ── Unified session log (Bloomberg terminal) ──
  sessionLog: [],
  addSessionLogEntry: (entry) => set((state) => {
    // Deduplicate: skip if last entry has identical text within 2 seconds
    const last = state.sessionLog[state.sessionLog.length - 1]
    if (last && last.text === entry.text && last.type === entry.type) {
      const lastTs = typeof last.ts === 'string' ? new Date(last.ts).getTime() : (last.ts || 0)
      const entryTs = typeof entry.ts === 'string' ? new Date(entry.ts).getTime() : (entry.ts || Date.now())
      if (Math.abs(entryTs - lastTs) < 2000) return {}
    }
    return { sessionLog: [...state.sessionLog, entry].slice(-500) }
  }),
  setSessionLog: (log) => set({ sessionLog: log }),

  // ── Trade state ──
  outgoingTrade: null,   // trade I proposed, waiting for response
  incomingTrade: null,    // trade proposed to me, needs my response
  tradeResult: null,      // 'accepted' | 'declined' | 'cancelled' | null

  setOutgoingTrade: (trade) => set({ outgoingTrade: trade, tradeResult: null }),
  setIncomingTrade: (trade) => set({ incomingTrade: trade }),
  setTradeResult: (result) => set({ tradeResult: result, outgoingTrade: null }),

  clearTrade: () => set({ outgoingTrade: null, incomingTrade: null, tradeResult: null }),

  setSession: (data) => set({
    sessionCode: data.sessionCode,
    sessionId: data.sessionId,
    campaignId: data.campaignId,
    isGM: data.isGM || false,
  }),

  setPhase: (phase) => set({ phase }),

  setHalted: (isHalted) => set({ isHalted }),

  setAttentionMode: (isAttentionMode) => set({ isAttentionMode }),

  setPlayers: (players) => set({ players }),

  addPlayer: (player) => set((state) => ({
    players: [...state.players.filter(p => p.id !== player.id), player],
  })),

  removePlayer: (playerId) => set((state) => ({
    players: state.players.filter(p => p.id !== playerId),
  })),

  updatePlayer: (playerId, updates) => set((state) => ({
    players: state.players.map(p => p.id === playerId ? { ...p, ...updates } : p),
  })),

  // joinSession was removed 2026-04-17 — it posted to a non-existent endpoint
  // (/api/sessions/<code>/join with {role}). The real join flow lives in
  // dashboardStore.joinSession + POST /api/sessions/join (code + character_id).

  reset: () => set({
    sessionCode: null, sessionId: null, campaignId: null,
    phase: 'lobby', isGM: false, isHalted: false, isAttentionMode: false,
    players: [], sessionInfo: null,
    notifications: [], activeProcesses: [], pendingRequest: null, activeLoot: null,
    lootReceived: null, sceneContent: [], sessionLog: [],
    outgoingTrade: null, incomingTrade: null, tradeResult: null,
    weather: 'klar',
    worldClock: { date: '1. Praios 1040 BF', time: '12:00', dayNight: 'day' },
    restResults: null,
  }),

  leaveSession: () => set({
    sessionCode: null,
    sessionId: null,
    campaignId: null,
    phase: 'lobby',
    isGM: false,
    isHalted: false,
    isAttentionMode: false,
    players: [],
    outgoingTrade: null,
    incomingTrade: null,
    tradeResult: null,
  }),

  handleSessionMessage: (msg) => {
    const { type, payload } = msg
    switch (type) {
      case 'phase_change':
        set({ phase: payload.phase })
        break
      case 'halt':
        set({ isHalted: true })
        break
      case 'halt_release':
      case 'release_halt':
        set({ isHalted: false })
        break
      case 'attention':
        set({ isAttentionMode: true })
        setTimeout(() => set({ isAttentionMode: false }), 5000)
        break
      case 'attention_release':
        set({ isAttentionMode: false })
        break
      case 'player_joined':
      case 'player_connected': {
        // Mark which players are connected without wiping rich data
        const connectedIds = payload.connected_users || []
        const existing = get().players
        if (existing.length > 0 && connectedIds.length > 0) {
          // Update connected status on existing rich player data
          set({ players: existing.map(p => ({ ...p, connected: connectedIds.includes(p.id) })) })
        } else if (payload.player) {
          get().addPlayer(payload.player)
        }
        break
      }
      case 'player_left':
      case 'player_disconnected': {
        const connIds = payload.connected_users || []
        const curr = get().players
        if (curr.length > 0 && connIds.length > 0) {
          set({ players: curr.map(p => ({ ...p, connected: connIds.includes(p.id) })) })
        } else if (payload.user_id) {
          get().updatePlayer(payload.user_id, { connected: false })
        } else if (payload.player_id) {
          get().updatePlayer(payload.player_id, { connected: false })
        }
        break
      }
      case 'player_reconnected': {
        const reconIds = payload.connected_users || []
        const curPlayers = get().players
        if (curPlayers.length > 0 && reconIds.length > 0) {
          set({ players: curPlayers.map(p => ({ ...p, connected: reconIds.includes(p.id) })) })
        }
        break
      }
      case 'player_update':
        get().updatePlayer(payload.player_id, payload.updates)
        break
      case 'session_start': {
        set({ phase: 'active' })
        const startConnIds = payload.connected_users || []
        const startPlayers = get().players
        if (startPlayers.length > 0 && startConnIds.length > 0) {
          set({ players: startPlayers.map(p => ({ ...p, connected: startConnIds.includes(p.id) })) })
        }
        break
      }
      case 'session_pause':
        set({ phase: 'paused' })
        break
      case 'session_resume':
        set({ phase: 'active' })
        break
      case 'session_end':
        set({ phase: 'ended' })
        break
      default:
        break
    }
  },
}))

export default useSessionStore
