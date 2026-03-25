import { create } from 'zustand'

const useMapStore = create((set, get) => ({
  currentMap: null,
  tokens: [],
  fogState: [],
  triggers: [],
  drawings: [],
  selectedToken: null,
  measureMode: false,
  measureStart: null,
  measureEnd: null,
  gridSize: 50,
  mapImage: null,
  mapWidth: 1000,
  mapHeight: 800,
  viewOffset: { x: 0, y: 0 },
  viewScale: 1,

  // ── Staged changes (GM only) ──
  // Changes accumulate here until GM clicks "push to players"
  pendingChanges: [],
  hasPendingChanges: false,

  addPendingChange: (change) => set((state) => ({
    pendingChanges: [...state.pendingChanges, change],
    hasPendingChanges: true,
  })),

  clearPendingChanges: () => set({ pendingChanges: [], hasPendingChanges: false }),

  setCurrentMap: (map) => set({
    currentMap: map,
    mapImage: map?.imageUrl || null,
    mapWidth: map?.width || 1000,
    mapHeight: map?.height || 800,
    gridSize: map?.gridSize || 50,
    tokens: map?.tokens || [],
    fogState: map?.fog || [],
    triggers: map?.triggers || [],
    drawings: map?.drawings || [],
  }),

  setTokens: (tokens) => set({ tokens }),

  moveToken: (tokenId, x, y) => set((state) => ({
    tokens: state.tokens.map(t =>
      t.id === tokenId ? { ...t, x, y } : t
    ),
  })),

  spawnToken: (token) => set((state) => ({
    tokens: [...state.tokens, token],
  })),

  removeToken: (tokenId) => set((state) => ({
    tokens: state.tokens.filter(t => t.id !== tokenId),
    selectedToken: state.selectedToken === tokenId ? null : state.selectedToken,
  })),

  updateToken: (tokenId, updates) => set((state) => ({
    tokens: state.tokens.map(t =>
      t.id === tokenId ? { ...t, ...updates } : t
    ),
  })),

  selectToken: (tokenId) => set({ selectedToken: tokenId }),

  deselectToken: () => set({ selectedToken: null }),

  updateFog: (fogUpdates) => set((state) => {
    const newFog = [...state.fogState]
    fogUpdates.forEach(({ x, y, revealed }) => {
      const idx = newFog.findIndex(f => f.x === x && f.y === y)
      if (idx >= 0) {
        newFog[idx] = { ...newFog[idx], revealed }
      } else {
        newFog.push({ x, y, revealed })
      }
    })
    return { fogState: newFog }
  }),

  clearFog: () => set({ fogState: [] }),

  addDrawing: (drawing) => set((state) => ({
    drawings: [...state.drawings, drawing],
  })),

  removeDrawing: (drawingId) => set((state) => ({
    drawings: state.drawings.filter(d => d.id !== drawingId),
  })),

  clearDrawings: () => set({ drawings: [] }),

  setMeasureMode: (active) => set({
    measureMode: active,
    measureStart: null,
    measureEnd: null,
  }),

  setMeasurePoints: (start, end) => set({
    measureStart: start,
    measureEnd: end,
  }),

  setView: (offset, scale) => set({
    viewOffset: offset || get().viewOffset,
    viewScale: scale || get().viewScale,
  }),

  isCellRevealed: (cellX, cellY) => {
    const state = get()
    const fogCell = state.fogState.find(f => f.x === cellX && f.y === cellY)
    return fogCell ? fogCell.revealed : false
  },

  handleMapMessage: (msg) => {
    const { type, payload } = msg
    switch (type) {
      case 'map_load':
        get().setCurrentMap(payload.map || payload)
        break
      case 'token_move':
        get().moveToken(payload.token_id, payload.target_x ?? payload.x, payload.target_y ?? payload.y)
        break
      case 'token_spawn':
        // Backend sends token data flat in payload, not nested under payload.token
        get().spawnToken(payload.token || payload)
        break
      case 'token_remove':
        get().removeToken(payload.token_id)
        break
      case 'token_update':
        get().updateToken(payload.token_id, payload.updates || payload)
        break
      case 'fog_update': {
        // Backend sends {action, cells, fog_revealed} — handle both formats
        if (payload.action === 'reset') {
          get().clearFog()
        } else if (payload.fog_revealed) {
          // Full state replacement
          const fogUpdates = payload.fog_revealed.map(c => ({ x: c[0], y: c[1], revealed: true }))
          set({ fogState: fogUpdates })
        } else if (payload.cells) {
          const revealed = payload.action !== 'hide'
          get().updateFog(payload.cells.map(c => ({ x: c[0] ?? c.x, y: c[1] ?? c.y, revealed })))
        } else if (payload.updates) {
          get().updateFog(payload.updates)
        }
        break
      }
      case 'fog_clear':
        get().clearFog()
        break
      case 'map_state_push': {
        // Full authoritative state from GM — replace tokens and fog
        if (payload.tokens) set({ tokens: payload.tokens })
        if (payload.fog_revealed) {
          set({ fogState: payload.fog_revealed.map(c => Array.isArray(c) ? { x: c[0], y: c[1], revealed: true } : { ...c, revealed: true }) })
        }
        break
      }
      case 'drawing_add':
        get().addDrawing(payload.drawing || payload)
        break
      case 'drawing_remove':
        get().removeDrawing(payload.drawing_id)
        break
      case 'drawings_clear':
        get().clearDrawings()
        break
      default:
        break
    }
  },
}))

export default useMapStore
