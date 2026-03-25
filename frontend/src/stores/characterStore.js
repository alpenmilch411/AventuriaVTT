import { create } from 'zustand'

const useCharacterStore = create((set, get) => ({
  myCharacter: null,
  allCharacters: [],
  activeBuffs: [],  // [{ id, stat, value, expiresAt, source, characterId }]
  loading: false,
  error: null,

  addBuff: (buff) => set((state) => ({
    activeBuffs: [...state.activeBuffs, buff],
  })),

  removeBuff: (buffId) => set((state) => ({
    activeBuffs: state.activeBuffs.filter(b => b.id !== buffId),
  })),

  pruneExpiredBuffs: () => set((state) => ({
    activeBuffs: state.activeBuffs.filter(b => b.expiresAt > Date.now()),
  })),

  getBuffsForCharacter: (characterId) => {
    return get().activeBuffs.filter(b => b.characterId === characterId && b.expiresAt > Date.now())
  },

  setMyCharacter: (character) => set({ myCharacter: character }),

  setAllCharacters: (characters) => set({ allCharacters: characters }),

  fetchMyCharacter: async (characterId) => {
    set({ loading: true })
    try {
      const res = await fetch(`/api/characters/${characterId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('avtt_token')}` },
      })
      if (!res.ok) throw new Error('Charakter konnte nicht geladen werden')
      const character = await res.json()
      set({ myCharacter: character, loading: false })
      return character
    } catch (err) {
      set({ error: err.message, loading: false })
      throw err
    }
  },

  fetchAllCharacters: async (campaignId) => {
    set({ loading: true })
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/characters`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('avtt_token')}` },
      })
      if (!res.ok) throw new Error('Charaktere konnten nicht geladen werden')
      const characters = await res.json()
      set({ allCharacters: characters, loading: false })
      return characters
    } catch (err) {
      set({ error: err.message, loading: false })
      throw err
    }
  },

  // Vitals — single source: current_vitals (falls back to derived_values for max)
  getVitals: () => {
    const char = get().myCharacter
    if (!char) return { lep: 0, lepMax: 0, asp: 0, aspMax: 0, kap: 0, kapMax: 0, schip: 0, schipMax: 0 }
    const dv = char.derived_values || {}
    const cv = char.current_vitals || {}
    return {
      lep: cv.lep ?? dv.LeP_max ?? 0,
      lepMax: dv.LeP_max ?? 0,
      asp: cv.asp ?? dv.AsP_max ?? 0,
      aspMax: dv.AsP_max ?? 0,
      kap: cv.kap ?? dv.KaP_max ?? 0,
      kapMax: dv.KaP_max ?? 0,
      schip: cv.schip ?? dv.Schip ?? 0,
      schipMax: dv.Schip ?? 3,
    }
  },

  getConditions: () => {
    const char = get().myCharacter
    return char?.conditions || []
  },

  getAttributes: () => {
    const char = get().myCharacter
    if (!char) return {}
    const attrs = char.attributes || {}
    return {
      MU: attrs.MU ?? 0,
      KL: attrs.KL ?? 0,
      IN: attrs.IN ?? 0,
      CH: attrs.CH ?? 0,
      FF: attrs.FF ?? 0,
      GE: attrs.GE ?? 0,
      KO: attrs.KO ?? 0,
      KK: attrs.KK ?? 0,
    }
  },

  updateVitals: (vitals) => set((state) => {
    if (!state.myCharacter) return { myCharacter: null }
    const cv = { ...(state.myCharacter.current_vitals || {}) }
    const dv = state.myCharacter.derived_values || {}
    // Handle both absolute values and deltas (backend should send absolute, but handle deltas as fallback)
    if (vitals.lep !== undefined) cv.lep = vitals.lep
    else if (vitals.lep_delta !== undefined) cv.lep = Math.max(0, Math.min(dv.LeP_max || 999, (cv.lep ?? dv.LeP_max ?? 0) + vitals.lep_delta))
    if (vitals.asp !== undefined) cv.asp = vitals.asp
    else if (vitals.asp_delta !== undefined) cv.asp = Math.max(0, Math.min(dv.AsP_max || 999, (cv.asp ?? dv.AsP_max ?? 0) + vitals.asp_delta))
    if (vitals.kap !== undefined) cv.kap = vitals.kap
    else if (vitals.kap_delta !== undefined) cv.kap = Math.max(0, Math.min(dv.KaP_max || 999, (cv.kap ?? dv.KaP_max ?? 0) + vitals.kap_delta))
    if (vitals.schip !== undefined) cv.schip = vitals.schip
    return {
      myCharacter: {
        ...state.myCharacter,
        current_vitals: cv,
      },
    }
  }),

  updateConditions: (conditions) => set((state) => ({
    myCharacter: state.myCharacter ? {
      ...state.myCharacter,
      conditions,
    } : null,
  })),

  updateCharacterField: (field, value) => set((state) => ({
    myCharacter: state.myCharacter ? {
      ...state.myCharacter,
      [field]: value,
    } : null,
  })),

  // GM: update a specific character in allCharacters
  updateCharacterInList: (characterId, updates) => set((state) => ({
    allCharacters: state.allCharacters.map(c => {
      if (c.id !== characterId) return c
      const merged = { ...c, ...updates }
      const hasVitals = updates.lep !== undefined || updates.asp !== undefined || updates.kap !== undefined || updates.schip !== undefined
      const hasDeltas = updates.lep_delta !== undefined || updates.asp_delta !== undefined || updates.kap_delta !== undefined
      if (hasVitals || hasDeltas) {
        const cv = { ...(c.current_vitals || {}) }
        const dv = c.derived_values || {}
        if (updates.lep !== undefined) cv.lep = updates.lep
        else if (updates.lep_delta !== undefined) cv.lep = Math.max(0, Math.min(dv.LeP_max || 999, (cv.lep ?? dv.LeP_max ?? 0) + updates.lep_delta))
        if (updates.asp !== undefined) cv.asp = updates.asp
        else if (updates.asp_delta !== undefined) cv.asp = Math.max(0, Math.min(dv.AsP_max || 999, (cv.asp ?? dv.AsP_max ?? 0) + updates.asp_delta))
        if (updates.kap !== undefined) cv.kap = updates.kap
        else if (updates.kap_delta !== undefined) cv.kap = Math.max(0, Math.min(dv.KaP_max || 999, (cv.kap ?? dv.KaP_max ?? 0) + updates.kap_delta))
        if (updates.schip !== undefined) cv.schip = updates.schip
        merged.current_vitals = cv
      }
      return merged
    }),
  })),

  handleCharacterMessage: (msg) => {
    const { type, payload } = msg
    switch (type) {
      case 'vitals_update': {
        // Backend sends absolute values: {lep, asp, kap, schip}
        const vitals = payload.vitals || {}
        if (payload.character_id === get().myCharacter?.id) {
          get().updateVitals(vitals)
        }
        get().updateCharacterInList(payload.character_id, vitals)
        break
      }
      case 'state_update': {
        // state_update from combat — may contain current_lep for a token/character
        if (payload.character_id && payload.current_lep !== undefined) {
          const vitals = { lep: payload.current_lep }
          if (payload.character_id === get().myCharacter?.id) {
            get().updateVitals(vitals)
          }
          get().updateCharacterInList(payload.character_id, vitals)
        }
        break
      }
      case 'conditions_update':
      case 'condition_change': {
        // Handle both full-replace and add/remove formats
        const applyConditionChange = (conds) => {
          let result = [...(conds || [])]
          if (payload.add_condition) {
            const existing = result.find(c => c.name === payload.add_condition)
            if (existing) existing.level = (existing.level || 1) + (payload.level || 1)
            else result.push({ name: payload.add_condition, level: payload.level || 1 })
          }
          if (payload.remove_condition) {
            result = result.map(c =>
              c.name === payload.remove_condition ? { ...c, level: (c.level || 1) - (payload.reduce_level || 1) } : c
            ).filter(c => (c.level || 0) > 0)
          }
          if (payload.conditions && !payload.add_condition && !payload.remove_condition) {
            result = payload.conditions
          }
          return result
        }
        if (payload.character_id === get().myCharacter?.id) {
          const current = get().myCharacter?.conditions || []
          get().updateConditions(applyConditionChange(current))
        }
        // Update in allCharacters list
        const charInList = (get().allCharacters || []).find(c => c.id === payload.character_id)
        if (charInList) {
          get().updateCharacterInList(payload.character_id, { conditions: applyConditionChange(charInList.conditions || []) })
        }
        break
      }
      case 'character_update':
        if (payload.character_id === get().myCharacter?.id) {
          set((state) => ({
            myCharacter: { ...state.myCharacter, ...payload.updates },
          }))
        }
        get().updateCharacterInList(payload.character_id, payload.updates)
        break
      default:
        break
    }
  },

  reset: () => set({
    myCharacter: null, allCharacters: [], activeBuffs: [],
    loading: false, error: null,
  }),
}))

export default useCharacterStore
