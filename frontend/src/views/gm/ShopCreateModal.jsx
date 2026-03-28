import { useState } from 'react'
import {
  X, Trash2, Loader2, Store, Package, Sword, Shield, ShieldHalf, Search
} from 'lucide-react'
import useAuthStore from '../../stores/authStore'
import Badge from '../../components/common/Badge'
import DataBrowser from './DataBrowser'
import clsx from 'clsx'

function formatPrice(priceSilber) {
  if (!priceSilber) return '—'
  const d = Math.floor(priceSilber / 10)
  const s = Math.floor(priceSilber % 10)
  const h = Math.round((priceSilber % 1) * 10)
  const parts = []
  if (d > 0) parts.push(`${d} D`)
  if (s > 0) parts.push(`${s} S`)
  if (h > 0) parts.push(`${h} H`)
  return parts.join(' ') || '0 S'
}

const BROWSE_CATEGORIES = [
  { type: 'items',   label: 'Gegenstände', icon: Package },
  { type: 'weapons', label: 'Waffen',      icon: Sword },
  { type: 'armor',   label: 'Rüstungen',   icon: Shield },
  { type: 'shields', label: 'Schilde',     icon: ShieldHalf },
]

export default function ShopCreateModal({ sendMessage, onClose }) {
  const token = useAuthStore((s) => s.token)

  const [shopName, setShopName] = useState('Händler')
  const [markup, setMarkup] = useState(1.0)
  const [shopItems, setShopItems] = useState([])
  const [sending, setSending] = useState(false)
  const [browseType, setBrowseType] = useState(null)

  const addItem = (item) => {
    if (shopItems.some(si => si.template_id === item.id)) return
    setShopItems(prev => [...prev, {
      template_id: item.id,
      name: item.name,
      price: item.price || 1,
      stock: null,
      category: item.category || item._type || 'sonstiges',
      weight: item.weight || 0,
    }])
  }

  const removeItem = (idx) => setShopItems(prev => prev.filter((_, i) => i !== idx))

  const updateItem = (idx, field, value) =>
    setShopItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))

  const handleCreate = () => {
    if (!shopName.trim() || shopItems.length === 0) return
    setSending(true)
    sendMessage?.({ type: 'shop_create', payload: { name: shopName.trim(), items: shopItems, markup } })
    setTimeout(() => { setSending(false); onClose() }, 300)
  }

  // If browsing, show DataBrowser full-screen
  if (browseType) {
    return (
      <div className="bg-dsa-bg border border-dsa-bg-medium rounded shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        <DataBrowser
          type={browseType}
          title={BROWSE_CATEGORIES.find(c => c.type === browseType)?.label + ' zum Sortiment hinzufügen'}
          onSelect={(item) => { addItem({ ...item, _type: browseType }); setBrowseType(null) }}
          onClose={() => setBrowseType(null)}
        />
      </div>
    )
  }

  return (
    <div className="bg-dsa-bg border border-dsa-bg-medium rounded shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-dsa-bg-medium">
        <h2 className="text-sm font-display font-bold text-dsa-gold flex items-center gap-2">
          <Store className="w-4 h-4" /> Laden eröffnen
        </h2>
        <button onClick={onClose} className="text-dsa-parchment-dark hover:text-dsa-parchment"><X className="w-4 h-4" /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Shop name + markup */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-dsa-parchment-dark mb-1 block">Name</label>
            <input type="text" value={shopName} onChange={e => setShopName(e.target.value)}
              className="input-field text-xs w-full" placeholder="Händler..." />
          </div>
          <div>
            <label className="text-[10px] text-dsa-parchment-dark mb-1 block">Aufschlag</label>
            <div className="flex items-center gap-2">
              <input type="number" value={markup}
                onChange={e => setMarkup(Math.max(0.1, parseFloat(e.target.value) || 1))}
                className="input-field text-xs w-20 text-center" step={0.1} min={0.1} max={5} />
              <span className="text-[10px] text-dsa-parchment-dark">×{markup.toFixed(1)}</span>
            </div>
          </div>
        </div>

        {/* Browse databank — primary action */}
        <div>
          <label className="text-[10px] text-dsa-parchment-dark mb-2 block font-semibold uppercase tracking-wider">Sortiment aus Datenbank wählen</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {BROWSE_CATEGORIES.map(({ type, label, icon: Icon }) => (
              <button key={type} onClick={() => setBrowseType(type)}
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-dsa-bg-medium bg-dsa-bg-light hover:border-dsa-gold/30 hover:bg-dsa-gold/5 transition group">
                <Icon className="w-5 h-5 text-dsa-parchment-dark group-hover:text-dsa-gold transition" />
                <span className="text-[10px] text-dsa-parchment-dark group-hover:text-dsa-parchment transition">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Shop items list */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-dsa-parchment-dark font-semibold uppercase tracking-wider">
              Sortiment ({shopItems.length} {shopItems.length === 1 ? 'Gegenstand' : 'Gegenstände'})
            </span>
          </div>
          {shopItems.length === 0 ? (
            <p className="text-xs text-dsa-parchment-dark/50 text-center py-6">
              Wähle Gegenstände aus der Datenbank oben aus.
            </p>
          ) : (
            <div className="space-y-1">
              <div className="grid grid-cols-12 gap-1 px-2 text-[8px] text-dsa-parchment-dark/50 uppercase tracking-wider">
                <div className="col-span-5">Name</div>
                <div className="col-span-3 text-center">Preis (S)</div>
                <div className="col-span-2 text-center">Vorrat</div>
                <div className="col-span-2"></div>
              </div>
              {shopItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-1 items-center bg-dsa-bg-light border border-dsa-bg-medium rounded px-2 py-1.5">
                  <div className="col-span-5 text-[11px] text-dsa-parchment truncate" title={item.name}>{item.name}</div>
                  <div className="col-span-3 flex items-center justify-center gap-1">
                    <input type="number" value={item.price}
                      onChange={e => updateItem(idx, 'price', Math.max(0, parseFloat(e.target.value) || 0))}
                      className="input-field text-[10px] w-16 text-center py-0.5" step={0.1} min={0} />
                    <span className="text-[8px] text-dsa-parchment-dark/40">{formatPrice(item.price * markup)}</span>
                  </div>
                  <div className="col-span-2 flex items-center justify-center">
                    <input type="number" value={item.stock ?? ''}
                      onChange={e => {
                        const val = e.target.value
                        updateItem(idx, 'stock', val === '' ? null : Math.max(0, parseInt(val) || 0))
                      }}
                      className="input-field text-[10px] w-14 text-center py-0.5" placeholder="∞" min={0} />
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <button onClick={() => removeItem(idx)} className="p-1 text-dsa-parchment-dark hover:text-red-400 transition">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-dsa-bg-medium">
        <button onClick={onClose} className="btn-ghost text-xs">Abbrechen</button>
        <button onClick={handleCreate}
          disabled={!shopName.trim() || shopItems.length === 0 || sending}
          className="btn-primary text-xs flex items-center gap-2 disabled:opacity-30">
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Store className="w-3.5 h-3.5" />}
          Laden eröffnen ({shopItems.length})
        </button>
      </div>
    </div>
  )
}
