import { create } from 'zustand'

const useShopStore = create((set, get) => ({
  shops: {},        // { shopId: { id, name, items, markup, open } }
  activeShopId: null, // currently viewed shop
  lastAction: null, // { action, item_name, quantity, ... } for toasts

  setShops: (shops) => set({ shops }),

  handleShopState: (payload) => {
    const { action, shop, shops, shop_id } = payload
    const updates = {}

    if (shops) {
      updates.shops = shops
    }

    if (action === 'created' || action === 'updated') {
      if (shops) {
        updates.shops = shops
      } else if (shop) {
        updates.shops = { ...get().shops, [shop.id]: shop }
      }
      // Auto-open first shop for players
      if (action === 'created' && shop) {
        updates.activeShopId = shop.id
      }
    } else if (action === 'closed') {
      const next = { ...get().shops }
      delete next[shop_id]
      updates.shops = next
      if (get().activeShopId === shop_id) {
        updates.activeShopId = null
      }
    } else if (action === 'purchase' || action === 'sale') {
      if (shops) updates.shops = shops
    }

    updates.lastAction = payload
    set(updates)
  },

  setActiveShop: (id) => set({ activeShopId: id }),
  clearLastAction: () => set({ lastAction: null }),

  reset: () => set({ shops: {}, activeShopId: null, lastAction: null }),
}))

export default useShopStore
