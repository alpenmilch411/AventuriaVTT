import { create } from 'zustand'

const useCampaignStore = create((set, get) => ({
  campaign: null,
  loreBook: [],
  quests: [],
  timeline: [],
  npcs: [],
  scenes: [],
  worldClock: { date: '1. Praios 1040 BF', time: '12:00', dayNight: 'day' },
  weather: 'klar',
  restResults: null, // { results: [...], duration_hours: int } — set by rest_end WS
  loading: false,
  error: null,

  setCampaign: (campaign) => set({ campaign }),

  setCampaignData: (data) => set({
    campaign: data.campaign || null,
    scenes: data.scenes || [],
    npcs: data.npcs || [],
    quests: data.quests || [],
    loreBook: data.loreBook || [],
    timeline: data.timeline || [],
    worldClock: data.worldClock || {},
    weather: data.weather || 'klar',
  }),

  fetchCampaign: async (campaignId) => {
    set({ loading: true })
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('avtt_token')}` },
      })
      if (!res.ok) throw new Error('Kampagne konnte nicht geladen werden')
      const campaign = await res.json()
      set({
        campaign,
        scenes: campaign.scenes || [],
        npcs: campaign.npcs || [],
        quests: campaign.quests || [],
        loreBook: campaign.lore_book || [],
        timeline: campaign.timeline || [],
        loading: false,
      })
      return campaign
    } catch (err) {
      set({ error: err.message, loading: false })
      throw err
    }
  },

  setScenes: (scenes) => set({ scenes }),
  addScene: (scene) => set((state) => ({ scenes: [...state.scenes, scene] })),
  updateScene: (sceneId, updates) => set((state) => ({
    scenes: state.scenes.map(s => s.id === sceneId ? { ...s, ...updates } : s),
  })),
  removeScene: (sceneId) => set((state) => ({
    scenes: state.scenes.filter(s => s.id !== sceneId),
  })),
  reorderScenes: (newScenes) => set({ scenes: newScenes }),

  setNPCs: (npcs) => set({ npcs }),
  addNPC: (npc) => set((state) => ({ npcs: [...state.npcs, npc] })),
  updateNPC: (npcId, updates) => set((state) => ({
    npcs: state.npcs.map(n => n.id === npcId ? { ...n, ...updates } : n),
  })),
  removeNPC: (npcId) => set((state) => ({
    npcs: state.npcs.filter(n => n.id !== npcId),
  })),

  setQuests: (quests) => set({ quests }),
  addQuest: (quest) => set((state) => ({ quests: [...state.quests, quest] })),
  updateQuest: (questId, updates) => set((state) => ({
    quests: state.quests.map(q => q.id === questId ? { ...q, ...updates } : q),
  })),

  setWorldClock: (clock) => set({ worldClock: clock }),
  setWeather: (weather) => set({ weather }),
  setRestResults: (results) => set({ restResults: results }),

  addLoreEntry: (entry) => set((state) => ({
    loreBook: [...state.loreBook, entry],
  })),

  addTimelineEntry: (entry) => set((state) => ({
    timeline: [...state.timeline, entry],
  })),

  handleCampaignMessage: (msg) => {
    const { type, payload } = msg
    switch (type) {
      case 'scene_update':
        get().updateScene(payload.scene_id, payload.updates)
        break
      case 'scene_activate':
        set((state) => ({
          scenes: state.scenes.map(s => ({
            ...s,
            isActive: s.id === payload.scene_id,
          })),
        }))
        break
      case 'npc_update':
        get().updateNPC(payload.npc_id, payload.updates)
        break
      case 'quest_update':
        get().updateQuest(payload.quest_id, payload.updates)
        break
      case 'world_clock':
        set({ worldClock: payload })
        break
      case 'weather_change':
        set({ weather: payload.weather })
        break
      default:
        break
    }
  },

  reset: () => set({
    campaign: null, loreBook: [], quests: [], timeline: [],
    npcs: [], scenes: [],
    worldClock: { date: '1. Praios 1040 BF', time: '12:00', dayNight: 'day' },
    weather: 'klar', restResults: null, loading: false, error: null,
  }),
}))

export default useCampaignStore
