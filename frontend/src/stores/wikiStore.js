import { create } from 'zustand'
import useAuthStore from './authStore'

const API = '/api'

let searchTimeout = null

const useWikiStore = create((set, get) => ({
  pages: [],
  activePage: null,
  activeDataEntry: null,
  searchQuery: '',
  searchResults: [],
  searchLoading: false,
  loading: false,

  fetchPages: async () => {
    set({ loading: true })
    try {
      const res = await fetch(`${API}/wiki/pages`)
      if (!res.ok) throw new Error('Wiki-Seiten konnten nicht geladen werden')
      const data = await res.json()
      set({ pages: Array.isArray(data) ? data : [], loading: false })
    } catch (err) {
      console.error('Failed to fetch wiki pages:', err)
      set({ loading: false })
    }
  },

  fetchPage: async (slug) => {
    set({ loading: true, activeDataEntry: null })
    try {
      const res = await fetch(`${API}/wiki/pages/${slug}`)
      if (!res.ok) throw new Error('Seite konnte nicht geladen werden')
      const page = await res.json()
      set({ activePage: page, loading: false })
    } catch (err) {
      console.error('Failed to fetch wiki page:', err)
      set({ loading: false })
    }
  },

  search: (query) => {
    if (searchTimeout) clearTimeout(searchTimeout)

    if (!query || query.length < 2) {
      set({ searchResults: [], searchLoading: false })
      return
    }

    set({ searchLoading: true })

    searchTimeout = setTimeout(async () => {
      try {
        const res = await fetch(`${API}/wiki/search?q=${encodeURIComponent(query)}`)
        if (!res.ok) throw new Error('Suche fehlgeschlagen')
        const data = await res.json()
        set({ searchResults: data.results || [], searchLoading: false })
      } catch (err) {
        console.error('Wiki search failed:', err)
        set({ searchResults: [], searchLoading: false })
      }
    }, 300)
  },

  setSearchQuery: (q) => {
    set({ searchQuery: q })
    get().search(q)
  },

  clearSearch: () => {
    if (searchTimeout) clearTimeout(searchTimeout)
    set({ searchQuery: '', searchResults: [], searchLoading: false })
  },

  fetchDataEntry: async (type, id) => {
    const token = useAuthStore.getState().token
    if (!token) return
    set({ loading: true, activePage: null })
    try {
      const res = await fetch(`${API}/databank/${type}/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Eintrag konnte nicht geladen werden')
      const entry = await res.json()
      set({ activeDataEntry: { ...entry, type }, loading: false })
    } catch (err) {
      console.error('Failed to fetch databank entry:', err)
      set({ loading: false })
    }
  },
}))

export default useWikiStore
