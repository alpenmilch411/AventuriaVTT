import { create } from 'zustand'
import useSessionStore from './sessionStore'
import useCombatStore from './combatStore'
import useCharacterStore from './characterStore'

const API = '/api'

const useAuthStore = create((set, get) => ({
  user: null,
  token: localStorage.getItem('avtt_token') || null,
  loading: false,
  error: null,

  login: async (email, password) => {
    set({ loading: true, error: null })
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || 'Login fehlgeschlagen')
      }
      const data = await res.json()
      const token = data.access_token
      localStorage.setItem('avtt_token', token)

      // Fetch user profile with the new token
      const meRes = await fetch(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      let user = null
      if (meRes.ok) {
        user = await meRes.json()
      }

      set({ token, user, loading: false })
      return data
    } catch (err) {
      set({ error: err.message, loading: false })
      throw err
    }
  },

  register: async (username, email, password) => {
    set({ loading: true, error: null })
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || 'Registrierung fehlgeschlagen')
      }
      // Registration succeeded, now login to get token
      const loginRes = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!loginRes.ok) throw new Error('Auto-Login nach Registrierung fehlgeschlagen')
      const loginData = await loginRes.json()
      const token = loginData.access_token
      localStorage.setItem('avtt_token', token)

      const meRes = await fetch(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      let user = null
      if (meRes.ok) {
        user = await meRes.json()
      }

      set({ token, user, loading: false })
      return loginData
    } catch (err) {
      set({ error: err.message, loading: false })
      throw err
    }
  },

  logout: () => {
    localStorage.removeItem('avtt_token')
    set({ user: null, token: null, error: null })
    useSessionStore.getState().reset()
    useCombatStore.getState().reset()
    useCharacterStore.getState().reset()
  },

  fetchMe: async () => {
    const token = get().token
    if (!token) return
    set({ loading: true })
    try {
      const res = await fetch(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem('avtt_token')
          set({ user: null, token: null, loading: false })
          return
        }
        throw new Error('Benutzer konnte nicht geladen werden')
      }
      const user = await res.json()
      set({ user, loading: false })
    } catch (err) {
      set({ error: err.message, loading: false })
    }
  },

  getAuthHeaders: () => {
    const token = get().token
    return token ? { Authorization: `Bearer ${token}` } : {}
  },

  clearError: () => set({ error: null }),
}))

export default useAuthStore
