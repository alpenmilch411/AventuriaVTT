import { create } from 'zustand'
import useAuthStore from './authStore'

const API = '/api'

const useDashboardStore = create((set, get) => ({
  managedSessions: [],
  joinedSessions: [],
  loadingManaged: false,
  loadingJoined: false,
  error: null,
  hideCompleted: false,

  fetchManagedSessions: async () => {
    const token = useAuthStore.getState().token
    if (!token) return
    set((s) => ({ loadingManaged: true, error: s.error }))
    try {
      const res = await fetch(`${API}/sessions/managed`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Sitzungen konnten nicht geladen werden')
      const data = await res.json()
      set({ managedSessions: Array.isArray(data) ? data : [], loadingManaged: false })
    } catch (err) {
      set({ error: err.message, loadingManaged: false })
    }
  },

  fetchJoinedSessions: async () => {
    const token = useAuthStore.getState().token
    if (!token) return
    set((s) => ({ loadingJoined: true, error: s.error }))
    try {
      const res = await fetch(`${API}/sessions/joined`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Sitzungen konnten nicht geladen werden')
      const data = await res.json()
      set({ joinedSessions: Array.isArray(data) ? data : [], loadingJoined: false })
    } catch (err) {
      set({ error: err.message, loadingJoined: false })
    }
  },

  createSession: async (name) => {
    const token = useAuthStore.getState().token
    if (!token) return
    set({ error: null })
    try {
      const res = await fetch(`${API}/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || 'Sitzung konnte nicht erstellt werden')
      }
      const session = await res.json()
      set((state) => ({ managedSessions: [session, ...state.managedSessions] }))
      return session
    } catch (err) {
      set({ error: err.message })
      throw err
    }
  },

  deleteSession: async (sessionId) => {
    const token = useAuthStore.getState().token
    if (!token) return
    set({ error: null })
    try {
      const res = await fetch(`${API}/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Sitzung konnte nicht gelöscht werden')
      set((state) => ({
        managedSessions: state.managedSessions.filter((s) => s.id !== sessionId),
      }))
    } catch (err) {
      set({ error: err.message })
      throw err
    }
  },

  joinSession: async (code, characterId) => {
    const token = useAuthStore.getState().token
    if (!token) return
    set({ error: null })
    try {
      const res = await fetch(`${API}/sessions/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code, character_id: characterId }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || 'Beitreten fehlgeschlagen')
      }
      const session = await res.json()
      set((state) => ({ joinedSessions: [session, ...state.joinedSessions] }))
      return session
    } catch (err) {
      set({ error: err.message })
      throw err
    }
  },

  leaveSession: async (sessionId) => {
    const token = useAuthStore.getState().token
    if (!token) return
    set({ error: null })
    try {
      const res = await fetch(`${API}/sessions/${sessionId}/leave`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Verlassen fehlgeschlagen')
      set((state) => ({
        joinedSessions: state.joinedSessions.filter((s) => s.id !== sessionId),
      }))
    } catch (err) {
      set({ error: err.message })
      throw err
    }
  },

  removePlayer: async (sessionId, userId) => {
    const token = useAuthStore.getState().token
    if (!token) return
    set({ error: null })
    try {
      const res = await fetch(`${API}/sessions/${sessionId}/players/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Spieler konnte nicht entfernt werden')
      return true
    } catch (err) {
      set({ error: err.message })
      throw err
    }
  },

  completeSession: async (sessionId) => {
    const token = useAuthStore.getState().token
    if (!token) return
    set({ error: null })
    try {
      const res = await fetch(`${API}/sessions/${sessionId}/complete`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Sitzung konnte nicht abgeschlossen werden')
      const updated = await res.json()
      set((state) => ({
        managedSessions: state.managedSessions.map((s) =>
          s.id === sessionId ? { ...s, ...updated } : s
        ),
      }))
      return updated
    } catch (err) {
      set({ error: err.message })
      throw err
    }
  },

  fetchSessionPlayers: async (sessionId) => {
    const token = useAuthStore.getState().token
    if (!token) return []
    try {
      const res = await fetch(`${API}/sessions/${sessionId}/players`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Spieler konnten nicht geladen werden')
      return await res.json()
    } catch (err) {
      console.error('Failed to fetch session players:', err)
      return []
    }
  },

  fetchSessionStats: async (sessionId) => {
    const token = useAuthStore.getState().token
    if (!token) return null
    try {
      const res = await fetch(`${API}/sessions/${sessionId}/statistics`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Statistiken konnten nicht geladen werden')
      return await res.json()
    } catch (err) {
      console.error('Failed to fetch session stats:', err)
      return null
    }
  },

  toggleHideCompleted: () => set((state) => ({ hideCompleted: !state.hideCompleted })),
}))

export default useDashboardStore
