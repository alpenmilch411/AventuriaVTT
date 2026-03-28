import { useState, useEffect } from 'react'
import { Store, Coins, Package, ShoppingCart, X, Loader2, ArrowRightLeft } from 'lucide-react'
import useShopStore from '../../stores/shopStore'
import useCharacterStore from '../../stores/characterStore'
import Badge from '../../components/common/Badge'
import clsx from 'clsx'

// Currency conversion helpers
const CURRENCY_RATES = { dukaten: 1000, silber: 100, heller: 10, kreuzer: 1 }

function purseToKreuzer(purse) {
  if (!purse) return 0
  return (purse.dukaten || 0) * 1000 + (purse.silber || 0) * 100 + (purse.heller || 0) * 10 + (purse.kreuzer || 0)
}

function formatKreuzer(total) {
  const d = Math.floor(total / 1000)
  const s = Math.floor((total % 1000) / 100)
  const h = Math.floor((total % 100) / 10)
  const k = total % 10
  const parts = []
  if (d > 0) parts.push(`${d} D`)
  if (s > 0) parts.push(`${s} S`)
  if (h > 0) parts.push(`${h} H`)
  if (k > 0) parts.push(`${k} K`)
  return parts.join(' ') || '0 K'
}

function priceToKreuzer(priceSilber, markup = 1.0) {
  return Math.round(priceSilber * 100 * markup)
}

function formatPriceSilber(priceSilber, markup = 1.0) {
  return formatKreuzer(priceToKreuzer(priceSilber, markup))
}

export default function ShopTab({ sendMessage }) {
  const shops = useShopStore((s) => s.shops)
  const activeShopId = useShopStore((s) => s.activeShopId)
  const setActiveShop = useShopStore((s) => s.setActiveShop)
  const lastAction = useShopStore((s) => s.lastAction)
  const clearLastAction = useShopStore((s) => s.clearLastAction)
  const myCharacter = useCharacterStore((s) => s.myCharacter)

  const [buyingItem, setBuyingItem] = useState(null)
  const [sellMode, setSellMode] = useState(false)
  const [toast, setToast] = useState(null)

  const shopList = Object.values(shops)
  const activeShop = activeShopId ? shops[activeShopId] : shopList[0] || null

  // Auto-select first shop
  useEffect(() => {
    if (!activeShopId && shopList.length > 0) {
      setActiveShop(shopList[0].id)
    }
  }, [shopList.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Toast on purchase/sale result
  useEffect(() => {
    if (!lastAction) return
    const { action, item_name, quantity } = lastAction
    if (action === 'purchase') {
      setToast(`${item_name} x${quantity || 1} gekauft!`)
    } else if (action === 'sale') {
      setToast(`${item_name} x${quantity || 1} verkauft!`)
    }
    clearLastAction()
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [lastAction]) // eslint-disable-line react-hooks/exhaustive-deps

  // Get player's current money
  const rawInv = myCharacter?.basis_inventory || myCharacter?.campaign_inventory || {}
  const purse = Array.isArray(rawInv) ? {} : (rawInv.purse || {})
  const totalMoney = purseToKreuzer(purse)

  // Get sellable inventory items
  const inventory = Array.isArray(rawInv) ? rawInv : (rawInv.items || [])

  const handleBuy = (item) => {
    if (!myCharacter?.id || !activeShop) return
    sendMessage?.({
      type: 'shop_buy',
      payload: {
        shop_id: activeShop.id,
        template_id: item.template_id,
        character_id: myCharacter.id,
        quantity: 1,
      },
    })
    setBuyingItem(null)
  }

  const handleSell = (invItem) => {
    if (!myCharacter?.id || !activeShop) return
    sendMessage?.({
      type: 'shop_sell',
      payload: {
        shop_id: activeShop.id,
        template_id: invItem.item_template_id || invItem.template_id || '',
        character_id: myCharacter.id,
        item_name: invItem.name,
        quantity: 1,
      },
    })
  }

  if (shopList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Store className="w-12 h-12 text-dsa-bg-medium mb-3" />
        <p className="text-sm text-dsa-parchment-dark">Kein Laden geöffnet.</p>
        <p className="text-[10px] text-dsa-parchment-dark/50 mt-1">Der Spielleiter kann einen Laden eröffnen.</p>
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-4">
      {/* Toast */}
      {toast && (
        <div className="bg-green-900/20 border border-green-800/30 rounded px-4 py-2 text-xs text-green-400 flex items-center gap-2 animate-fade-in">
          <ShoppingCart className="w-3.5 h-3.5" /> {toast}
        </div>
      )}

      {/* Shop selector (if multiple) */}
      {shopList.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {shopList.map(shop => (
            <button
              key={shop.id}
              onClick={() => setActiveShop(shop.id)}
              className={clsx(
                'px-3 py-1.5 rounded text-xs border transition',
                activeShop?.id === shop.id
                  ? 'bg-dsa-gold/10 text-dsa-gold border-dsa-gold/30'
                  : 'bg-dsa-bg-light text-dsa-parchment-dark border-dsa-bg-medium hover:border-dsa-gold/20'
              )}
            >
              <Store className="w-3 h-3 inline mr-1" /> {shop.name}
            </button>
          ))}
        </div>
      )}

      {activeShop && (
        <>
          {/* Shop header + money display */}
          <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Store className="w-5 h-5 text-dsa-gold" />
                <h3 className="text-sm font-display font-bold text-dsa-gold">{activeShop.name}</h3>
                <Badge variant="default" size="sm">{(activeShop.items || []).length} Waren</Badge>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSellMode(!sellMode)}
                  className={clsx(
                    'text-[10px] px-2 py-1 rounded border transition flex items-center gap-1',
                    sellMode
                      ? 'bg-amber-900/20 text-amber-400 border-amber-800/30'
                      : 'bg-dsa-bg text-dsa-parchment-dark border-dsa-bg-medium hover:text-dsa-parchment'
                  )}
                >
                  <ArrowRightLeft className="w-3 h-3" /> Verkaufen
                </button>
                <div className="text-right">
                  <span className="text-[9px] text-dsa-parchment-dark block">Geld</span>
                  <span className="text-xs font-mono text-dsa-gold font-semibold">{formatKreuzer(totalMoney)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Sell mode: player inventory */}
          {sellMode && (
            <div className="bg-dsa-bg-card border border-amber-800/30 rounded overflow-hidden">
              <div className="px-3 py-2 bg-amber-950/30 border-b border-amber-800/20">
                <span className="text-xs font-semibold text-amber-400">Eigene Gegenstände verkaufen</span>
                <span className="text-[9px] text-amber-400/60 ml-2">(50% des Ladenpreises)</span>
              </div>
              <div className="max-h-48 overflow-y-auto divide-y divide-dsa-bg-medium/30">
                {inventory.filter(i => {
                  const n = (i.name || '').toLowerCase()
                  return !n.includes('silber') && !n.includes('dukaten') && !n.includes('heller') && !n.includes('kreuzer')
                }).map((item, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5 hover:bg-dsa-bg-light/30 transition">
                    <span className="text-[11px] text-dsa-parchment flex-1 truncate">{item.name}</span>
                    <span className="text-[10px] font-mono text-dsa-parchment-dark">x{item.quantity || 1}</span>
                    <button
                      onClick={() => handleSell(item)}
                      className="text-[9px] px-2 py-0.5 bg-amber-900/20 text-amber-400 border border-amber-800/20 rounded hover:bg-amber-900/30 transition"
                    >
                      Verkaufen
                    </button>
                  </div>
                ))}
                {inventory.length === 0 && (
                  <p className="text-xs text-dsa-parchment-dark/50 text-center py-4">Keine Gegenstände zum Verkaufen.</p>
                )}
              </div>
            </div>
          )}

          {/* Shop items */}
          <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded overflow-hidden">
            <div className="px-3 py-2 bg-emerald-950/30 border-b border-dsa-bg-medium/50">
              <span className="text-xs font-semibold text-emerald-400">Waren</span>
            </div>
            <div className="divide-y divide-dsa-bg-medium/30">
              {(activeShop.items || []).map((item, i) => {
                const priceK = priceToKreuzer(item.price, activeShop.markup || 1)
                const canAfford = totalMoney >= priceK
                const outOfStock = item.stock !== null && item.stock !== undefined && item.stock <= 0
                return (
                  <div key={i} className={clsx(
                    'flex items-center gap-2 px-3 py-2 transition',
                    outOfStock ? 'opacity-40' : 'hover:bg-dsa-bg-light/30'
                  )}>
                    <Package className="w-3.5 h-3.5 text-dsa-parchment-dark/50 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] text-dsa-parchment font-medium truncate block">{item.name}</span>
                      {item.category && (
                        <span className="text-[9px] text-dsa-parchment-dark">{item.category}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {item.stock !== null && item.stock !== undefined && (
                        <span className="text-[9px] text-dsa-parchment-dark">
                          {item.stock > 0 ? `${item.stock}×` : 'Ausverkauft'}
                        </span>
                      )}
                      <span className={clsx(
                        'text-[10px] font-mono font-semibold',
                        canAfford ? 'text-dsa-gold' : 'text-red-400'
                      )}>
                        {formatPriceSilber(item.price, activeShop.markup || 1)}
                      </span>
                      <button
                        onClick={() => handleBuy(item)}
                        disabled={!canAfford || outOfStock}
                        className="text-[9px] px-2 py-0.5 bg-emerald-900/20 text-emerald-400 border border-emerald-800/20 rounded hover:bg-emerald-900/30 disabled:opacity-30 disabled:cursor-not-allowed transition"
                      >
                        Kaufen
                      </button>
                    </div>
                  </div>
                )
              })}
              {(activeShop.items || []).length === 0 && (
                <p className="text-xs text-dsa-parchment-dark/50 text-center py-6">Laden ist leer.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
