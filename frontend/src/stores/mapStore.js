import { create } from 'zustand'

const useMapStore = create((set, get) => ({
  currentMap: null,
  tokens: [],
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
      case 'map_state_push': {
        // Full authoritative state from GM — replace tokens
        if (payload.tokens) set({ tokens: payload.tokens })
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

  reset: () => set({
    currentMap: null, tokens: [], triggers: [], drawings: [],
    selectedToken: null, measureMode: false, measureStart: null, measureEnd: null,
    gridSize: 50, mapImage: null, mapWidth: 1000, mapHeight: 800,
    viewOffset: { x: 0, y: 0 }, viewScale: 1,
    pendingChanges: [], hasPendingChanges: false,
  }),
}))

export default useMapStore
