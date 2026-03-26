import { create } from 'zustand'
import useAuthStore from './authStore'

const API = '/api'

const useDatenbankStore = create((set, get) => ({
  category: 'creatures',
  entries: [],
  totalEntries: 0,
  page: 1,
  perPage: 50,
  searchQuery: '',
  customOnly: false,
  selectedEntry: null,
  loading: false,
  error: null,

  setCategory: (cat) => {
    set({ category: cat, entries: [], page: 1, selectedEntry: null, error: null })
    get().fetchEntries()
  },

  setSearch: (query) => {
    set({ searchQuery: query, page: 1 })
    get().fetchEntries()
  },

  setCustomOnly: (bool) => {
    set({ customOnly: bool, page: 1 })
    get().fetchEntries()
  },

  setPage: (page) => {
    set({ page })
    get().fetchEntries()
  },

  clearSelectedEntry: () => set({ selectedEntry: null }),

  fetchEntries: async () => {
    const { category, page, perPage, searchQuery, customOnly } = get()
    const token = useAuthStore.getState().token
    if (!token) return

    set({ loading: true, error: null })
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(perPage),
      })
      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim())
      }
      if (customOnly) {
        params.set('custom_only', 'true')
      }

      const res = await fetch(`${API}/databank/${category}?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Einträge konnten nicht geladen werden')
      const data = await res.json()
      set({
        entries: data.items || [],
        totalEntries: data.total || 0,
        loading: false,
      })
    } catch (err) {
      set({ error: err.message, loading: false })
    }
  },

  fetchEntry: async (category, id) => {
    const token = useAuthStore.getState().token
    if (!token) return

    set({ loading: true, error: null })
    try {
      const res = await fetch(`${API}/databank/${category}/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Eintrag konnte nicht geladen werden')
      const data = await res.json()
      set({ selectedEntry: { ...data, _category: category }, loading: false })
    } catch (err) {
      set({ error: err.message, loading: false })
    }
  },

  createEntry: async (category, entryData) => {
    const token = useAuthStore.getState().token
    if (!token) return

    set({ error: null })
    try {
      const res = await fetch(`${API}/databank/${category}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(entryData),
      })
      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.detail || 'Eintrag konnte nicht erstellt werden')
      }
      const created = await res.json()
      // Refresh list
      get().fetchEntries()
      return created
    } catch (err) {
      set({ error: err.message })
      throw err
    }
  },

  updateEntry: async (category, id, entryData) => {
    const token = useAuthStore.getState().token
    if (!token) return

    set({ error: null })
    try {
      const res = await fetch(`${API}/databank/${category}/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(entryData),
      })
      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.detail || 'Eintrag konnte nicht aktualisiert werden')
      }
      const updated = await res.json()
      // Refresh the selected entry and list
      set({ selectedEntry: { ...updated, _category: category } })
      get().fetchEntries()
      return updated
    } catch (err) {
      set({ error: err.message })
      throw err
    }
  },

  deleteEntry: async (category, id) => {
    const token = useAuthStore.getState().token
    if (!token) return

    set({ error: null })
    try {
      const res = await fetch(`${API}/databank/${category}/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        let detail = 'Eintrag konnte nicht gelöscht werden'
        try { detail = (await res.json()).detail || detail } catch {}
        throw new Error(detail)
      }
      set({ selectedEntry: null })
      get().fetchEntries()
    } catch (err) {
      set({ error: err.message })
      throw err
    }
  },
}))

export default useDatenbankStore
