import React, { useState, useEffect } from 'react'
import { getItemIcon as getItemEmoji } from '../../utils/icons'
import {
  Package, ChevronDown, ChevronUp, FlaskConical, Swords, Shield,
  Gem, Apple, Check, Flame, Compass, Tent, HelpCircle, Send, Clock,
  ArrowRightLeft, Trash2, X, Minus, Plus, Handshake, Coins, Backpack
} from 'lucide-react'
import useCharacterStore from '../../stores/characterStore'
import { resolveItemEffect, rollFormula } from '../../engine/itemEffects'
import clsx from 'clsx'
import useSessionStore from '../../stores/sessionStore'
import useAuthStore from '../../stores/authStore'
import Badge from '../../components/common/Badge'
import Modal from '../../components/common/Modal'
import DatenbankDetailModal, { ITEM_SUBCATEGORIES } from '../../components/DatenbankDetail'

// Databank categories to search when looking up an item by name
const DB_SEARCH_CATS = ['items', 'weapons', 'armor', 'shields']

const normUmlaut = s => s.toLowerCase().replace(/[äöüß]/g, m => ({ 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' }[m] || m))

async function lookupItemInDatabank(name, token) {
  const encoded = encodeURIComponent(name)
  for (const cat of DB_SEARCH_CATS) {
    try {
      const res = await fetch(`/api/databank/${cat}?search=${encoded}&page_size=5`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) continue
      const data = await res.json()
      const items = data.items || []
      const nameNorm = normUmlaut(name)
      const match = items.find(i => i.name?.toLowerCase() === name.toLowerCase())
        || items.find(i => normUmlaut(i.name || '') === nameNorm)
        || items[0]
      if (match) {
        const { id, name: n, ...rest } = match
        return { id, name: n, data: rest, category: cat }
      }
    } catch {}
  }
  return null
}

// Categorize an inventory item — aligned with LootPanel's categorizeItem().
// Uses enriched `_type` and raw DB `category` to match INVENTORY_CATEGORIES ids.
function categorizeItem(item) {
  const c = (item.category || '').toLowerCase()
  const t = (item._type || '').toLowerCase()

  // _type from databank enrichment (weapons, armor, shields)
  if (t === 'weapon' || t === 'weapons') return 'weapons'
  if (t === 'armor') return 'armor'
  if (t === 'shield' || t === 'shields') return 'shields'

  // Use raw DB category directly — matches INVENTORY_CATEGORIES ids
  const directCategories = ['trank', 'heilkraut', 'alchemie', 'gift', 'munition', 'werkzeug', 'licht', 'proviant', 'ausruestung', 'behaelter', 'schatz', 'unterhaltung', 'verbrauchsmaterial']
  if (directCategories.includes(c)) return c

  return 'sonstiges'
}

// Icon based on enriched _type and category fields
function getItemIcon(item) {
  const t = (item._type || '').toLowerCase()
  const cat = (item.category || '').toLowerCase()

  if (t === 'weapon' || t === 'weapons') return Swords
  if (t === 'armor' || t === 'shield' || t === 'shields') return Shield
  if (cat === 'trank' || cat === 'heilkraut') return FlaskConical
  if (cat === 'proviant') return Apple
  if (cat === 'licht') return Flame
  if (cat === 'werkzeug') return Compass
  if (cat === 'munition') return Swords
  if (cat === 'gift' || cat === 'alchemie') return FlaskConical
  if (cat === 'schatz') return Gem
  // Fallback for unenriched items
  const n = (typeof item === 'string' ? item : item.name || '').toLowerCase()
  if (n.includes('silber') || n.includes('gold') || n.includes('dukaten')) return Gem
  return Package
}

// Color based on enriched _type and category fields
function getCategoryColor(item) {
  const t = (item._type || '').toLowerCase()
  const cat = (item.category || '').toLowerCase()

  if (t === 'weapon' || t === 'weapons') return 'text-red-400'
  if (t === 'armor' || t === 'shield' || t === 'shields') return 'text-blue-400'
  if (cat === 'trank' || cat === 'heilkraut') return 'text-green-400'
  if (cat === 'gift') return 'text-red-400'
  if (cat === 'alchemie') return 'text-purple-400'
  if (cat === 'munition' || cat === 'verbrauchsmaterial') return 'text-orange-400'
  if (cat === 'schatz') return 'text-dsa-gold'
  return 'text-dsa-parchment-dark'
}

// Determine which actions are available for an item using enriched fields
function getAvailableActions(item, inventory, specialAbilities) {
  const t = (item._type || '').toLowerCase()
  const actions = []

  const isWeapon = t === 'weapon' || t === 'weapons'
  const isArmor = t === 'armor'
  const isShield = t === 'shield' || t === 'shields'
  const isEquippable = isWeapon || isArmor || isShield
  const hasSchnellziehen = (specialAbilities || []).some(sf => sf.toLowerCase().includes('schnellziehen'))
  const eff = item.effects || {}
  const hasProbeBonusOnly = !!eff.probe_bonus
  const hasCombatDamageOnly = item.usable_in_combat && (eff.fire_damage || eff.holy_damage || eff.smoke_cloud || eff.stun_damage)
  const isUsable = !hasProbeBonusOnly && !hasCombatDamageOnly && (item.usable === true || item.usable_in_combat === true)

  // Use/consume — enriched items carry usable / usable_in_combat flags
  // Excluded: combat damage items (used via TurnFlow) and probe bonus items (auto-offered during probes)
  if (isUsable) {
    actions.push({ id: 'use', label: 'Benutzen', icon: FlaskConical, desc: 'Den Gegenstand einsetzen oder verbrauchen' })
  }

  // Equip/unequip with proper context
  if (isEquippable) {
    if (item.equipped) {
      if (isWeapon) {
        actions.push({
          id: 'unequip', label: 'Waffe wegstecken', icon: Shield,
          desc: 'Waffe ablegen. Kostet: Freie Aktion (fallen lassen) oder 1 Aktion (wegstecken).',
          actionCostOverride: 'Freie Aktion (fallen lassen) oder 1 Aktion',
        })
      } else {
        actions.push({
          id: 'unequip', label: 'Ablegen', icon: Shield,
          desc: isArmor ? 'Rüstung ablegen — dauert mehrere Minuten, nicht im Kampf möglich.' : 'Schild ablegen.',
          actionCostOverride: isArmor ? 'Mehrere Minuten (nicht im Kampf)' : '1 Aktion',
        })
      }
    } else {
      if (isWeapon) {
        // Check what's currently equipped in this slot
        const currentWeapon = inventory.filter(i => i.equipped && i.name !== item.name).find(i => {
          const iType = (i._type || '').toLowerCase()
          return iType === 'weapon' || iType === 'weapons'
        })
        const cost = hasSchnellziehen ? 'Freie Aktion (Schnellziehen)' : '1 Aktion'
        actions.push({
          id: 'equip', label: 'Waffe ziehen', icon: Swords,
          desc: currentWeapon
            ? `Wechsel: ${currentWeapon.name} wird weggesteckt, ${item.name} wird gezogen.`
            : `${item.name} ziehen und kampfbereit machen.`,
          actionCostOverride: cost,
          swapFrom: currentWeapon?.name || null,
          hasSchnellziehen,
        })
      } else if (isArmor) {
        actions.push({
          id: 'equip', label: 'Rüstung anlegen', icon: Shield,
          desc: 'Rüstung anlegen — dauert mehrere Minuten. Nicht im Kampf möglich.',
          actionCostOverride: 'Mehrere Minuten (nicht im Kampf)',
        })
      } else {
        actions.push({
          id: 'equip', label: 'Schild anlegen', icon: Shield,
          desc: 'Schild anlegen und kampfbereit machen.',
          actionCostOverride: '1 Aktion',
        })
      }
    }
  }

  // Transfer
  actions.push({ id: 'transfer', label: 'Übergeben', icon: ArrowRightLeft, desc: 'Einem anderen Spieler schenken. Kostet: Freie Aktion (wenn nebeneinander).' })

  // Trade
  actions.push({ id: 'trade', label: 'Handeln', icon: Handshake, desc: 'Mit einem anderen Spieler tauschen — Gegenstände gegen Gegenstände oder Geld.' })

  // Drop
  actions.push({ id: 'drop', label: 'Fallen lassen', icon: Trash2, desc: 'Auf den Boden legen. Kostet: Freie Aktion.' })

  return actions
}

// ── Money Box with total + currency converter ──
function MoneyBox({ purse, moneyItems, currencies, totalKreuzer, getItemEmoji }) {
  const [summaryUnit, setSummaryUnit] = useState('silber')
  const [convFrom, setConvFrom] = useState('dukaten')
  const [convTo, setConvTo] = useState('silber')
  const [convAmount, setConvAmount] = useState('')

  const summaryInfo = currencies.find(c => c.key === summaryUnit)
  const totalInUnit = summaryInfo ? totalKreuzer / summaryInfo.inKreuzer : 0
  const displayTotal = totalInUnit % 1 === 0 ? totalInUnit : totalInUnit.toFixed(2)

  const convFromInfo = currencies.find(c => c.key === convFrom)
  const convToInfo = currencies.find(c => c.key === convTo)
  const convResult = (parseFloat(convAmount) || 0) * (convFromInfo?.inKreuzer || 1) / (convToInfo?.inKreuzer || 1)

  return (
    <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-dsa-bg-medium/50 bg-dsa-gold/10">
        <Gem className="w-4 h-4 text-dsa-gold" />
        <span className="text-xs font-bold uppercase tracking-wider text-dsa-gold">Geldbeutel</span>
      </div>
      <div className="px-4 py-4 space-y-3">

      {/* Currency rows */}
      <div className="space-y-0.5">
        {currencies.filter(d => (purse[d.key] || 0) > 0).map(d => (
          <div key={d.key} className="flex items-center justify-between py-1">
            <span className="text-sm text-dsa-parchment">{d.label}</span>
            <span className="text-lg font-mono font-bold text-dsa-gold">{purse[d.key]}</span>
          </div>
        ))}
        {moneyItems.map((item, i) => (
          <div key={i} className="flex items-center justify-between py-1">
            <span className="text-sm">{getItemEmoji(item.name, item.category)} <span className="text-dsa-parchment">{item.name}</span></span>
            <span className="text-lg font-mono font-bold text-dsa-gold">{item.quantity || 1}</span>
          </div>
        ))}
      </div>

      {/* Total with currency selector */}
      {totalKreuzer > 0 && (
        <div className="pt-2 border-t border-dsa-gold/15">
          <div className="flex items-center justify-between">
            <span className="text-xs text-dsa-parchment-dark">Gesamtwert in</span>
            <div className="flex items-center gap-1">
              {currencies.map(c => (
                <button
                  key={c.key}
                  onClick={() => setSummaryUnit(c.key)}
                  className={clsx(
                    'text-[10px] px-1.5 py-0.5 rounded-sm border transition-colors',
                    summaryUnit === c.key
                      ? 'bg-dsa-gold/20 text-dsa-gold border-dsa-gold/30 font-bold'
                      : 'text-dsa-parchment-dark/50 border-dsa-bg-medium hover:text-dsa-parchment-dark'
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div className="text-right mt-1">
            <span className="text-lg font-mono font-bold text-dsa-gold">{displayTotal}</span>
            <span className="text-xs text-dsa-parchment-dark ml-1">{summaryInfo?.label}</span>
          </div>
        </div>
      )}

      {/* Currency converter — always visible */}
      <div className="pt-2 border-t border-dsa-bg-medium/30">
        <div className="text-[10px] text-dsa-parchment-dark/50 uppercase font-bold mb-1.5">Umrechner</div>
        <div className="space-y-1.5">
          {/* From */}
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min="0"
              step="any"
              value={convAmount}
              onChange={e => setConvAmount(e.target.value)}
              placeholder="0"
              className="w-16 bg-dsa-bg/50 border border-dsa-bg-medium rounded-sm px-2 py-1 text-sm font-mono font-bold text-dsa-parchment outline-none focus:border-dsa-gold/50 placeholder-dsa-parchment-dark/30"
            />
            <div className="flex gap-px flex-1">
              {currencies.map(c => (
                <button key={c.key} onClick={() => { setConvFrom(c.key); if (c.key === convTo) setConvTo(currencies.find(x => x.key !== c.key)?.key || 'kreuzer') }}
                  className={clsx('flex-1 text-[9px] py-1 transition-colors first:rounded-l-sm last:rounded-r-sm', convFrom === c.key ? 'bg-dsa-gold/20 text-dsa-gold font-bold border border-dsa-gold/30' : 'bg-dsa-bg-medium/50 text-dsa-parchment-dark/50 border border-dsa-bg-medium hover:text-dsa-parchment-dark')}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          {/* Result */}
          <div className="flex items-center gap-1.5">
            <div className="w-16 text-center">
              <span className="text-sm font-mono font-bold text-dsa-gold">{convAmount ? (convResult % 1 === 0 ? convResult : convResult.toFixed(2)) : '\u2014'}</span>
            </div>
            <div className="flex gap-px flex-1">
              {currencies.map(c => (
                <button key={c.key} onClick={() => { setConvTo(c.key); if (c.key === convFrom) setConvFrom(currencies.find(x => x.key !== c.key)?.key || 'kreuzer') }}
                  className={clsx('flex-1 text-[9px] py-1 transition-colors first:rounded-l-sm last:rounded-r-sm', convTo === c.key ? 'bg-dsa-gold/20 text-dsa-gold font-bold border border-dsa-gold/30' : 'bg-dsa-bg-medium/50 text-dsa-parchment-dark/50 border border-dsa-bg-medium hover:text-dsa-parchment-dark')}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="text-[9px] text-dsa-parchment-dark/40">1 Dukaten = 10 Silbertaler = 100 Heller = 1000 Kreuzer</p>
      </div>
    </div>
  )
}

function InventoryPanel({ sendMessage }) {
  const myCharacter = useCharacterStore((s) => s.myCharacter)
  const getAttributes = useCharacterStore((s) => s.getAttributes)
  const players = useSessionStore((s) => s.players)
  const currentUser = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  const incomingTrade = useSessionStore((s) => s.incomingTrade)
  const setIncomingTrade = useSessionStore((s) => s.setIncomingTrade)
  const outgoingTrade = useSessionStore((s) => s.outgoingTrade)
  const setOutgoingTrade = useSessionStore((s) => s.setOutgoingTrade)
  const tradeResult = useSessionStore((s) => s.tradeResult)
  const clearTrade = useSessionStore((s) => s.clearTrade)

  const [expandedItem, setExpandedItem] = useState(null)
  const [openCategory, setOpenCategory] = useState(null) // only 1 category open at a time
  const [actionResult, setActionResult] = useState(null)
  const [pendingRequests, setPendingRequests] = useState({})

  // Action request modal
  const [actionModal, setActionModal] = useState(null) // { item, action, quantity, targetPlayer }
  const [itemDiceRoll, setItemDiceRoll] = useState('') // player's dice roll for item use

  // Trade modal
  const [tradeModal, setTradeModal] = useState(null) // { step, targetPlayer, offeredItems, offeredMoney, requestedMoney }

  // Counter-offer state for incoming trades
  const [counterOffer, setCounterOffer] = useState(null) // { items: [], money: {} }

  // Databank detail popup
  const [dbDetail, setDbDetail] = useState(null) // { name, data, category } | null
  const [dbDetailLoading, setDbDetailLoading] = useState(false)

  const handleOpenDbDetail = async (item) => {
    const token = useAuthStore.getState().token
    if (!token) return
    setDbDetailLoading(true)
    setDbDetail({ name: item.name, data: null, category: 'items' })
    const result = await lookupItemInDatabank(item.name, token)
    setDbDetailLoading(false)
    if (result) {
      setDbDetail(result)
    } else {
      // Build fallback from local inventory data
      const fallback = {}
      if (item.weight) fallback.weight = item.weight
      if (item.category) fallback.category = item.category
      if (item.effects && Object.keys(item.effects).length > 0) fallback.effects = item.effects
      setDbDetail({ name: item.name, data: fallback, category: 'items' })
    }
  }

  // Auto-open first non-empty category on mount (hook must be before early returns)
  const inventoryForEffect = myCharacter?.basis_inventory || myCharacter?.campaign_inventory || {}
  const inventoryItemsForEffect = Array.isArray(inventoryForEffect) ? inventoryForEffect : (inventoryForEffect.items || [])
  const otherItemsCount = inventoryItemsForEffect.filter(i => {
    const n = (i.name || '').toLowerCase()
    return !i.equipped && !(n.includes('silber') || n.includes('dukaten') || n.includes('heller') || n.includes('kreuzer'))
  }).length
  useEffect(() => {
    if (!myCharacter || openCategory) return
    const rawInv = myCharacter.basis_inventory || myCharacter.campaign_inventory || {}
    const inv = Array.isArray(rawInv) ? rawInv : (rawInv.items || [])
    const others = inv.filter(i => {
      const n = (i.name || '').toLowerCase()
      return !i.equipped && !(n.includes('silber') || n.includes('dukaten') || n.includes('heller') || n.includes('kreuzer'))
    })
    const cats = {}
    for (const item of others) {
      const cat = categorizeItem(item)
      if (!cats[cat]) cats[cat] = []
      cats[cat].push(item)
    }
    const CATEGORIES_ORDER = ['weapons', 'armor', 'shields', 'trank', 'heilkraut', 'alchemie', 'gift', 'munition', 'werkzeug', 'licht', 'proviant', 'ausruestung', 'behaelter', 'schatz', 'unterhaltung', 'verbrauchsmaterial', 'sonstiges']
    const first = CATEGORIES_ORDER.find(c => (cats[c] || []).length > 0)
    if (first) setOpenCategory(first)
  }, [otherItemsCount])

  if (!myCharacter) {
    return <div className="text-center py-8 text-dsa-parchment-dark text-sm">Kein Charakter geladen.</div>
  }

  const attrs = getAttributes()
  const rawInv = myCharacter.basis_inventory || myCharacter.campaign_inventory || {}
  const inventory = Array.isArray(rawInv) ? rawInv : (rawInv.items || [])
  const purse = Array.isArray(rawInv) ? {} : (rawInv.purse || {})
  const maxCarry = (attrs.KK || 0) * 2
  const totalWeight = inventory.reduce((sum, item) => sum + (item.weight || 0) * (item.quantity || 1), 0)
  const weightPercent = maxCarry > 0 ? Math.min(100, (totalWeight / maxCarry) * 100) : 0

  const equippedItems = inventory.filter(i => i.equipped)
  const moneyItems = inventory.filter(i => {
    const n = (i.name || '').toLowerCase()
    return n.includes('silber') || n.includes('dukaten') || n.includes('heller') || n.includes('kreuzer')
  })
  const otherItems = inventory.filter(i => {
    const n = (i.name || '').toLowerCase()
    return !i.equipped && !(n.includes('silber') || n.includes('dukaten') || n.includes('heller') || n.includes('kreuzer'))
  })

  // Categorize items (excluding equipped + money which have their own sections)
  // Uses module-level categorizeItem() — DB category + effects, no regex on names.

  const CATEGORIES = [
    { id: 'weapons',  label: 'Waffen',  icon: '\u2694\uFE0F' },
    { id: 'armor',    label: 'Rüstung', icon: '\uD83D\uDEE1\uFE0F' },
    { id: 'shields',  label: 'Schilde', icon: '\uD83D\uDEE1\uFE0F' },
    ...Object.entries(ITEM_SUBCATEGORIES)
      .filter(([k]) => k !== 'krankheit')
      .map(([id, { label, icon }]) => ({ id, label, icon })),
    { id: 'sonstiges', label: 'Sonstiges', icon: '\uD83D\uDCE6' },
  ]

  const categorizedItems = {}
  for (const item of otherItems) {
    const cat = categorizeItem(item)
    if (!categorizedItems[cat]) categorizedItems[cat] = []
    categorizedItems[cat].push(item)
  }

  const otherPlayers = players.filter(p => p.characterId !== myCharacter.id)

  const openActionModal = (item, action) => {
    // Transfer: Player → GM approval → execute
    if (action.id === 'transfer') {
      setTradeModal({
        mode: 'transfer',
        step: 'select_partner',
        targetPlayer: null,
        offeredItems: [{ name: item.name, quantity: 1, maxQuantity: item.quantity || 1 }],
        offeredMoney: { silber: 0, dukaten: 0, heller: 0 },
      })
      return
    }
    // Trade: Player A → Player B negotiation → GM approval → execute
    if (action.id === 'trade') {
      setTradeModal({
        mode: 'trade',
        step: 'select_partner',
        targetPlayer: null,
        offeredItems: [{ name: item.name, quantity: 1, maxQuantity: item.quantity || 1 }],
        offeredMoney: { silber: 0, dukaten: 0, heller: 0 },
      })
      return
    }
    setItemDiceRoll('')
    setActionModal({
      item,
      action,
      quantity: 1,
      maxQuantity: item.quantity || 1,
      targetPlayer: null,
    })
  }

  const submitActionRequest = () => {
    if (!actionModal) return
    const { item, action, quantity } = actionModal

    // For "use" actions, execute with the player's dice roll
    if (action.id === 'use') {
      const resolved = resolveItemEffect(item)
      const rolledValue = resolved.diceFormula ? parseInt(itemDiceRoll) || 0 : 0
      executeItemUse(item, rolledValue)
      setActionModal(null)
      setItemDiceRoll('')
      return
    }

    // For other actions (drop, transfer), send to GM
    const ACTION_LABELS = { use: 'Benutzen', equip: 'Anlegen', unequip: 'Ablegen', transfer: 'Übergeben', drop: 'Fallen lassen' }
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    sendMessage?.({
      type: 'action_request',
      payload: {
        request_id: requestId,
        character_id: myCharacter.id,
        character_name: myCharacter.name,
        action_type: action.id,
        action_label: ACTION_LABELS[action.id] || action.label || action.id,
        item_name: item.name,
        quantity,
        effects: item.effects || null,
      },
    })
    useSessionStore.getState().setPendingRequest({
      id: requestId, type: 'action', label: `${ACTION_LABELS[action.id]}: ${item.name}`, timestamp: Date.now(),
    })
    setActionResult(`Aktion angefragt: ${quantity}x ${item.name} — ${ACTION_LABELS[action.id]}`)
    setActionModal(null)
    setTimeout(() => setActionResult(null), 5000)
  }

  // ── Execute item use: resolve effects, roll dice, apply, consume, persist ──
  const executeItemUse = (item, playerRolledValue = 0) => {
    const resolved = resolveItemEffect(item)
    let resultText = ''

    // Herbs require a Heilkunde probe — send request to GM and consume
    if (resolved.requiresProbe) {
      resultText = `${item.name}: ${resolved.probeSkill}-Probe erforderlich. ${resolved.description}`
      const probeReqId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      sendMessage?.({
        type: 'probe_request_from_player',
        payload: {
          request_id: probeReqId,
          character_id: myCharacter.id,
          character_name: myCharacter.name,
          probe_type: resolved.probeSkill,
          item_name: item.name,
          item_effects: item.effects,
          description: `${myCharacter.name} möchte ${item.name} anwenden (${resolved.probeSkill})`,
        },
      })
      useSessionStore.getState().setPendingRequest({
        id: probeReqId, type: 'probe', label: `${item.name} anwenden`, timestamp: Date.now(),
      })
      // Consume the herb (used whether probe succeeds or not)
      if (resolved.consumed) {
        const rawInv = myCharacter.basis_inventory || []
        const invObj = Array.isArray(rawInv) ? { items: rawInv } : rawInv
        const items = [...(invObj.items || [])]
        const idx = items.findIndex(i => i.name === item.name)
        if (idx >= 0) {
          if ((items[idx].quantity || 1) <= 1) items.splice(idx, 1)
          else items[idx] = { ...items[idx], quantity: (items[idx].quantity || 1) - 1 }
          const newInv = { ...invObj, items }
          useCharacterStore.getState().setMyCharacter({ ...myCharacter, basis_inventory: newInv })
          const token = useAuthStore.getState().token
          if (token && myCharacter.id) {
            fetch(`/api/characters/${myCharacter.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ basis_inventory: newInv }),
            }).catch(err => console.error('Failed to persist inventory:', err))
          }
          sendMessage?.({ type: 'inventory_change', payload: { character_id: myCharacter.id, inventory: newInv } })
        }
      }
      sendMessage?.({ type: 'combat_log_entry', payload: { type: 'item_use', text: resultText } })
      setActionResult(resultText)
      setTimeout(() => setActionResult(null), 8000)
      return
    }

    // Use the player's manually entered dice roll
    let rolledValue = playerRolledValue
    if (resolved.diceFormula && rolledValue > 0) {
      resultText = `${item.name}: ${resolved.diceFormula} gewürfelt → ${rolledValue}`
    } else {
      resultText = resolved.description
    }

    // Apply effects based on category
    const vitals = useCharacterStore.getState().getVitals()
    const dv = myCharacter.derived_values || {}
    let vitalsUpdate = {}

    switch (resolved.category) {
      case 'heal': {
        const newLep = Math.min(dv.LeP_max || 30, (vitals.lep || 0) + rolledValue)
        vitalsUpdate.lep = newLep
        resultText += ` → ${rolledValue} Lebenspunkte geheilt (${vitals.lep} → ${newLep})`
        break
      }
      case 'restore': {
        if (resolved.steps[0]?.resource === 'asp') {
          const newAsp = Math.min(dv.AsP_max || 0, (vitals.asp || 0) + rolledValue)
          vitalsUpdate.asp = newAsp
          resultText += ` → ${rolledValue} Astralpunkte wiederhergestellt (${vitals.asp} → ${newAsp})`
        } else if (resolved.steps[0]?.resource === 'kap') {
          const newKap = Math.min(dv.KaP_max || 0, (vitals.kap || 0) + rolledValue)
          vitalsUpdate.kap = newKap
          resultText += ` → ${rolledValue} Karmapunkte wiederhergestellt`
        }
        break
      }
      case 'condition': {
        const eff = item.effects || {}
        if (eff.pain_relief) {
          resultText = `${item.name}: 1 Stufe Schmerz entfernt`
          sendMessage?.({ type: 'conditions_update', payload: { character_id: myCharacter.id, remove_condition: 'Schmerz', reduce_level: 1 } })
        } else if (eff.remove_betaeubung) {
          resultText = `${item.name}: ${eff.remove_betaeubung} Stufe Betäubung entfernt`
          sendMessage?.({ type: 'conditions_update', payload: { character_id: myCharacter.id, remove_condition: 'Betäubung', reduce_level: eff.remove_betaeubung } })
        } else if (eff.cure_poison) {
          resultText = `${item.name}: Gegengift eingenommen (${eff.bonus || '+4'} auf ZK-Probe gegen Gift)`
        } else if (eff.cure_disease) {
          resultText = `${item.name}: Fiebertrank eingenommen (${eff.bonus || '+3'} auf KO-Probe gegen Krankheit)`
        } else if (eff.sleep) {
          resultText = `${item.name}: Schlaftrank — Bewusstlosigkeit für ${eff.duration_hours || 4} Stunden`
        } else if (eff.nightvision) {
          resultText = `${item.name}: Nachtsicht für ${eff.duration_hours || 2} Stunden`
        } else if (eff.invisibility) {
          resultText = `${item.name}: Unsichtbar für ${eff.duration_minutes || 10} Minuten`
        }
        break
      }
      case 'buff': {
        const eff = item.effects || {}
        const buffs = []
        if (eff.kk_bonus) buffs.push({ stat: 'Körperkraft', abbr: 'KK', val: typeof eff.kk_bonus === 'number' ? eff.kk_bonus : 1 })
        if (eff.ge_bonus) buffs.push({ stat: 'Gewandtheit', abbr: 'GE', val: typeof eff.ge_bonus === 'number' ? eff.ge_bonus : 1 })
        if (eff.kl_bonus) buffs.push({ stat: 'Klugheit', abbr: 'KL', val: typeof eff.kl_bonus === 'number' ? eff.kl_bonus : 1 })
        if (eff.in_bonus) buffs.push({ stat: 'Intuition', abbr: 'IN', val: typeof eff.in_bonus === 'number' ? eff.in_bonus : 1 })
        if (eff.mu_bonus || eff.courage_bonus) buffs.push({ stat: 'Mut', abbr: 'MU', val: typeof (eff.mu_bonus || eff.courage_bonus) === 'number' ? (eff.mu_bonus || eff.courage_bonus) : 1 })
        const dur = eff.duration_minutes || (eff.duration_hours ? eff.duration_hours * 60 : 30)
        const durationText = dur >= 60 ? `${dur / 60} Stunden` : `${dur} Minuten`
        resultText = `${item.name}: ${buffs.map(b => `+${b.val} ${b.stat}`).join(', ')} für ${durationText}`
        if (eff.penalty) resultText += `. Nachteil: ${eff.penalty}`
        // Send buff via WS (in-memory for real-time display)
        for (const b of buffs) {
          sendMessage?.({ type: 'buff_add', payload: { character_id: myCharacter.id, stat: b.abbr, value: b.val, duration_minutes: dur, source: item.name } })
        }
        break
      }
      case 'poison': {
        const poisonEff = item.effects || {}
        // Send poison application to GM via WS — GM's TurnFlow will mark weapon as poisoned
        sendMessage?.({
          type: 'item_use',
          payload: {
            character_id: myCharacter.id,
            item_name: item.name,
            action: 'apply_poison',
            poison: {
              name: item.name,
              stufe: poisonEff.stufe || 1,
              zk_mod: poisonEff.zk_mod || 0,
              damage: poisonEff.damage || '',
              detail: poisonEff.detail || '',
            },
          },
        })
        resultText = `${item.name}: Gift bereit zum Auftragen auf eine Waffe (Stufe ${poisonEff.stufe || '?'})`
        break
      }
      default:
        resultText = resolved.description
    }

    // Handle condition_add from any item (drinks, special items)
    const eff = item.effects || {}
    if (eff.condition_add) {
      sendMessage?.({ type: 'conditions_update', payload: { character_id: myCharacter.id, add_condition: eff.condition_add, level: eff.condition_level || 1 } })
      if (!resultText.includes(eff.condition_add)) {
        resultText += ` — Zustand: ${eff.condition_add} ${eff.condition_level || 1}`
      }
    }

    // Update vitals if changed
    if (Object.keys(vitalsUpdate).length > 0) {
      // Update local store
      const char = useCharacterStore.getState().myCharacter
      if (char) {
        useCharacterStore.getState().setMyCharacter({
          ...char,
          current_vitals: { ...char.current_vitals, ...vitalsUpdate },
        })
      }
      // Persist to backend
      sendMessage?.({ type: 'vitals_update', payload: { character_id: myCharacter.id, vitals: vitalsUpdate } })
    }

    // Consume item (reduce quantity or remove)
    if (resolved.consumed) {
      const rawInv = myCharacter.basis_inventory || []
      const invObj = Array.isArray(rawInv) ? { items: rawInv } : rawInv
      const items = [...(invObj.items || [])]
      const idx = items.findIndex(i => i.name === item.name)
      if (idx >= 0) {
        if ((items[idx].quantity || 1) <= 1) {
          items.splice(idx, 1)
        } else {
          items[idx] = { ...items[idx], quantity: (items[idx].quantity || 1) - 1 }
        }
        const newInv = { ...invObj, items }
        useCharacterStore.getState().setMyCharacter({ ...myCharacter, basis_inventory: newInv })
        // Persist inventory change
        const token = useAuthStore.getState().token
        if (token && myCharacter.id) {
          fetch(`/api/characters/${myCharacter.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ basis_inventory: newInv }),
          }).catch(err => console.error('Failed to persist inventory:', err))
        }
        // Broadcast inventory change so GM and other players see updated counts
        sendMessage?.({ type: 'inventory_change', payload: { character_id: myCharacter.id, inventory: newInv } })
      }
    }

    // Log to combat protocol
    sendMessage?.({ type: 'combat_log_entry', payload: { type: 'item_use', text: resultText } })

    // Show result
    setActionResult(resultText)
    setTimeout(() => setActionResult(null), 8000)
  }

  // ── Trade functions ──

  const toggleTradeItem = (item) => {
    if (!tradeModal) return
    const existing = tradeModal.offeredItems.find(i => i.name === item.name)
    if (existing) {
      setTradeModal(prev => ({
        ...prev,
        offeredItems: prev.offeredItems.filter(i => i.name !== item.name),
      }))
    } else {
      setTradeModal(prev => ({
        ...prev,
        offeredItems: [...prev.offeredItems, { name: item.name, quantity: 1, maxQuantity: item.quantity || 1 }],
      }))
    }
  }

  const updateTradeItemQty = (name, qty) => {
    setTradeModal(prev => ({
      ...prev,
      offeredItems: prev.offeredItems.map(i =>
        i.name === name ? { ...i, quantity: Math.max(1, Math.min(qty, i.maxQuantity)) } : i
      ),
    }))
  }

  const submitTradeProposal = () => {
    if (!tradeModal?.targetPlayer) return

    if (tradeModal.mode === 'transfer') {
      // Transfer: send directly to GM for approval
      const payload = {
        from_character_id: myCharacter?.id,
        from_user_id: currentUser?.id,
        from_name: myCharacter?.name || 'Spieler',
        to_character_id: tradeModal.targetPlayer.characterId || tradeModal.targetPlayer.character?.id,
        to_user_id: tradeModal.targetPlayer.id,
        to_name: tradeModal.targetPlayer.character?.name || tradeModal.targetPlayer.username,
        from_items: tradeModal.offeredItems.filter(i => i.quantity > 0).map(i => ({ name: i.name, quantity: i.quantity })),
        from_money: tradeModal.offeredMoney,
        summary: `${myCharacter?.name} gibt ${tradeModal.offeredItems.filter(i => i.quantity > 0).map(i => `${i.quantity}x ${i.name}`).join(', ')} an ${tradeModal.targetPlayer.character?.name || tradeModal.targetPlayer.username}`,
      }
      sendMessage?.({ type: 'transfer_request', payload })
      setTradeModal(null)
      setActionResult(`Übergabe beantragt — warte auf Spielleiter`)
      setTimeout(() => setActionResult(null), 8000)
      return
    }

    // Trade: send proposal to other player
    const tradeId = `trade_${Date.now()}`
    const proposal = {
      trade_id: tradeId,
      proposer_id: myCharacter?.id,
      proposer_user_id: currentUser?.id || '',
      proposer_name: myCharacter?.name || 'Spieler',
      target_id: tradeModal.targetPlayer.id,
      target_character_id: tradeModal.targetPlayer.characterId || tradeModal.targetPlayer.character?.id,
      target_name: tradeModal.targetPlayer.character?.name || tradeModal.targetPlayer.username,
      offered_items: tradeModal.offeredItems.filter(i => i.quantity > 0).map(i => ({ name: i.name, quantity: i.quantity })),
      offered_money: tradeModal.offeredMoney,
    }
    sendMessage?.({ type: 'trade_propose', payload: proposal })
    setOutgoingTrade(proposal)
    setTradeModal(null)
    setActionResult(`Handelsangebot an ${proposal.target_name} gesendet`)
    setTimeout(() => setActionResult(null), 5000)
  }

  const respondToTrade = (accept) => {
    if (!incomingTrade) return
    if (accept) {
      // Send trade_accept with counter-offer → goes to Player A + GM
      sendMessage?.({
        type: 'trade_accept',
        payload: {
          trade_id: incomingTrade.trade_id,
          // WS routing IDs
          proposer_user_id: incomingTrade.proposer_user_id || incomingTrade.from_user,
          target_user_id: currentUser?.id,
          // Character IDs (for DB exchange execution)
          from_character_id: incomingTrade.proposer_id,
          to_character_id: myCharacter?.id,
          // User IDs (for WS routing in _execute_exchange)
          from_user_id: incomingTrade.proposer_user_id || incomingTrade.from_user,
          to_user_id: currentUser?.id,
          // What A gives to B
          from_items: incomingTrade.offered_items || [],
          from_money: incomingTrade.offered_money || {},
          // What B gives to A (counter-offer)
          to_items: counterOffer?.items || [],
          to_money: counterOffer?.money || {},
          // Display
          from_name: incomingTrade.proposer_name,
          to_name: myCharacter?.name || 'Spieler',
          summary: `Handel: ${incomingTrade.proposer_name} gibt ${(incomingTrade.offered_items || []).map(i => `${i.quantity}x ${i.name}`).join(', ')}; ${myCharacter?.name} gibt ${(counterOffer?.items || []).map(i => `${i.quantity}x ${i.name}`).join(', ') || 'nichts'}`,
        },
      })
      setActionResult('Handel angenommen — warte auf Spielleiter')
    } else {
      sendMessage?.({
        type: 'trade_decline',
        payload: {
          trade_id: incomingTrade.trade_id,
          proposer_id: incomingTrade.proposer_user_id || incomingTrade.from_user,
          from_name: myCharacter?.name || 'Spieler',
        },
      })
      setActionResult('Handel abgelehnt')
    }
    setIncomingTrade(null)
    setCounterOffer(null)
    setTimeout(() => setActionResult(null), 5000)
  }

  const renderItemCard = (item, i, showActions = true) => {
    const Icon = getItemIcon(item)
    const isExpanded = expandedItem === `${item.name}_${i}`
    const catColor = getCategoryColor(item)
    const actions = showActions ? getAvailableActions(item, inventory, myCharacter?.special_abilities) : []

    return (
      <div
        key={`${item.name}_${i}`}
        className={`bg-dsa-bg-card border rounded overflow-hidden transition-colors ${isExpanded ? 'border-dsa-gold/30' : 'border-dsa-bg-medium'}`}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => handleOpenDbDetail(item)}
            className="flex items-center gap-3 flex-1 min-w-0 text-left group"
          >
            <div className={`w-8 h-8 rounded-sm bg-dsa-bg flex items-center justify-center flex-shrink-0 ${catColor}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-dsa-parchment group-hover:text-dsa-gold transition-colors">{item.name}</span>
                <Badge variant="default" size="sm">x{item.quantity || 1}</Badge>
                {item.equipped && <Badge variant="gold" size="sm">Angelegt</Badge>}
              </div>
              {item.category && <p className="text-[10px] text-dsa-parchment-dark/60 mt-0.5">{item.category}</p>}
            </div>
          </button>
          <div className="flex items-center gap-2 flex-shrink-0">
            {item.weight != null && <span className="text-xs text-dsa-parchment-dark">{item.weight} Stein</span>}
            <button
              onClick={() => setExpandedItem(isExpanded ? null : `${item.name}_${i}`)}
              className="p-1 text-dsa-parchment-dark/40 hover:text-dsa-parchment transition-colors"
            >
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="px-4 pb-4 border-t border-dsa-bg-medium pt-3 space-y-3">
            {item.description ? (
              <p className="text-sm text-dsa-parchment/70 leading-relaxed">{item.description}</p>
            ) : (
              <p className="text-sm text-dsa-parchment-dark italic">Keine Beschreibung verfügbar.</p>
            )}

            {item.effects && Object.keys(item.effects).length > 0 && (
              <div className="bg-dsa-bg rounded-sm border border-dsa-bg-medium px-3 py-2">
                <span className="text-[10px] text-dsa-parchment-dark uppercase tracking-wider">Wirkung: </span>
                <span className="text-xs text-dsa-parchment">
                  {Object.entries(item.effects).filter(([k]) => k !== 'detail').map(([k, v]) => typeof v === 'boolean' ? k.replace(/_/g, ' ') : `${k.replace(/_/g,' ')}: ${v}`).join(', ')}
                </span>
              </div>
            )}

            {/* Action buttons */}
            {showActions && actions.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {actions.map((action) => {
                  const key = `${item.name}_${action.id}`
                  const isPending = pendingRequests[key]
                  return (
                    <button
                      key={action.id}
                      onClick={(e) => { e.stopPropagation(); openActionModal(item, action) }}
                      disabled={isPending}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-sm text-xs font-medium transition-all ${
                        isPending
                          ? 'bg-yellow-900/30 text-yellow-400 border border-yellow-800/30'
                          : 'bg-dsa-bg text-dsa-parchment-dark border border-dsa-bg-medium hover:text-dsa-parchment hover:border-dsa-gold/20'
                      }`}
                    >
                      {isPending ? (
                        <><Clock className="w-3.5 h-3.5 animate-pulse" /> Angefragt</>
                      ) : (
                        <><action.icon className="w-3.5 h-3.5" /> {action.label}</>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
    {dbDetail && (
      <DatenbankDetailModal
        data={dbDetail.data}
        name={dbDetail.name}
        category={dbDetail.category}
        loading={dbDetailLoading}
        isOwn={false}
        onClose={() => setDbDetail(null)}
      />
    )}
    <div className="animate-fade-in">
      {/* Toast */}
      {actionResult && (
        <div className="bg-yellow-900/20 border border-yellow-800/30 rounded px-4 py-3 text-sm text-yellow-400 flex items-center gap-2 mb-4 animate-fade-in">
          <Clock className="w-4 h-4 flex-shrink-0 animate-pulse" />
          {actionResult}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* LEFT column */}
        <div className="lg:col-span-1 space-y-4">
          {/* Tragkraft */}
          <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-dsa-bg-medium/50 bg-amber-950/50">
              <Package className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400">Tragkraft</span>
              <span className="text-[10px] font-mono text-dsa-parchment-dark/40 ml-auto">{totalWeight.toFixed(1)} / {maxCarry} Stein</span>
            </div>
            <div className="p-4">
            <div className="w-full h-3 bg-dsa-bg rounded-full overflow-hidden">
              <div className={clsx('h-full rounded-full transition-all', weightPercent > 100 ? 'bg-red-500' : weightPercent > 75 ? 'bg-yellow-500' : 'bg-dsa-gold/60')} style={{ width: `${Math.min(100, weightPercent)}%` }} />
            </div>
            {weightPercent > 100 && <p className="text-xs text-red-400 mt-1 font-medium">Überladen! Zustand Belastung.</p>}
            {/* Detail */}
            <div className="mt-3 space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-dsa-parchment-dark">Berechnung</span>
                <span className="font-mono text-dsa-parchment">Körperkraft ({attrs.KK || '?'}) x 2 = <strong className="text-dsa-gold">{maxCarry}</strong> Stein</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dsa-parchment-dark">Getragen</span>
                <span className={clsx('font-mono font-bold', weightPercent > 100 ? 'text-red-400' : 'text-dsa-parchment')}>{totalWeight.toFixed(1)} Stein</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dsa-parchment-dark">Frei</span>
                <span className={clsx('font-mono', (maxCarry - totalWeight) < 0 ? 'text-red-400' : 'text-green-400')}>{(maxCarry - totalWeight).toFixed(1)} Stein</span>
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-dsa-bg-medium/30 text-[10px] text-dsa-parchment-dark/50 leading-relaxed">
              Tragkraft = Körperkraft x 2 (in Stein, ca. 1 kg). Bei Überschreitung erhältst du den Zustand <strong className="text-amber-400">Belastung</strong> — das reduziert Attacke, Parade, Ausweichen, Initiative und Geschwindigkeit pro Stufe um 1.
            </div>
            </div>
          </div>


          {(moneyItems.length > 0 || Object.values(purse).some(v => v > 0)) && (() => {
            const CURRENCIES = [
              { key: 'dukaten', label: 'Dukaten', inKreuzer: 1000 },
              { key: 'silber', label: 'Silbertaler', inKreuzer: 100 },
              { key: 'heller', label: 'Heller', inKreuzer: 10 },
              { key: 'kreuzer', label: 'Kreuzer', inKreuzer: 1 },
            ]
            const totalKreuzer = (purse.dukaten || 0) * 1000 + (purse.silber || 0) * 100 + (purse.heller || 0) * 10 + (purse.kreuzer || 0)
            return (
              <MoneyBox
                purse={purse}
                moneyItems={moneyItems}
                currencies={CURRENCIES}
                totalKreuzer={totalKreuzer}
                getItemEmoji={getItemEmoji}
              />
            )
          })()}
        </div>

        {/* RIGHT column — categorized (lean accordion) */}
        <div className="lg:col-span-2">
          <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-dsa-bg-medium/50 bg-emerald-950/50">
            <Backpack className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Inventar</span>
            <span className="text-[10px] font-mono text-dsa-parchment-dark/40">{inventory.length}</span>
          </div>
          <div className="divide-y divide-dsa-bg-medium/30">
          {CATEGORIES.map(cat => {
            const isOpen = openCategory === cat.id
            const catItems = categorizedItems[cat.id] || []
            const isEmpty = catItems.length === 0
            return (
              <div key={cat.id}>
                <button onClick={() => !isEmpty && setOpenCategory(isOpen ? null : cat.id)}
                  className={clsx('w-full flex items-center gap-2 px-3 py-1.5 text-left transition',
                    isEmpty ? 'opacity-30 cursor-default' : 'hover:bg-dsa-bg-light/30 cursor-pointer',
                    isOpen && !isEmpty && 'bg-dsa-bg-light')}>
                  <span className="text-xs">{cat.icon}</span>
                  <span className={clsx('text-[11px] flex-1', isEmpty ? 'text-dsa-parchment-dark' : 'text-dsa-parchment font-medium')}>{cat.label}</span>
                  <span className="text-[10px] font-mono text-dsa-parchment-dark w-5 text-right">{catItems.length || '—'}</span>
                  {!isEmpty && <ChevronDown className={clsx('w-3 h-3 text-dsa-parchment-dark/50 transition-transform', isOpen && 'rotate-180')} />}
                </button>
                {isOpen && catItems.length > 0 && (
                  <div className="bg-dsa-bg/50">
                    {/* Compact table header */}
                    <div className="grid grid-cols-12 gap-1 px-3 py-0.5 text-[8px] text-dsa-parchment-dark/50 uppercase tracking-wider">
                      <div className="col-span-4">Name</div>
                      <div className="col-span-1 text-center">Anz.</div>
                      <div className="col-span-1 text-center">Gew.</div>
                      <div className="col-span-4">Wirkung</div>
                      <div className="col-span-2 text-center"></div>
                    </div>
                    {catItems.map((item, i) => {
                      const resolved = resolveItemEffect(item)
                      const effectDesc = resolved.category === 'probe_bonus' ? resolved.effectSummary
                        : resolved.diceFormula ? `${resolved.diceFormula} ${resolved.category === 'heal' ? 'LeP' : resolved.category === 'restore' ? 'AsP' : resolved.category === 'damage' ? 'SP' : ''}`
                        : resolved.effectSummary || ''
                      const pb = item.effects?.probe_bonus
                      const isCombatOnly = item.usable_in_combat && (resolved.category === 'damage' || resolved.steps?.some(s => s.type === 'smoke' || s.type === 'stun'))
                      const isProbeOnly = !!pb
                      const isUsable = !isCombatOnly && !isProbeOnly && (item.usable === true || item.usable_in_combat === true || !!(item.effects && Object.keys(item.effects).length > 0))
                      return (
                        <div key={i} className="grid grid-cols-12 gap-1 px-3 py-1 hover:bg-dsa-bg-light/10 transition items-center border-t border-dsa-bg-medium/20">
                          <button
                            onClick={() => handleOpenDbDetail(item)}
                            className="col-span-4 flex items-center gap-1.5 min-w-0 text-left group"
                          >
                            <span className="text-xs">{getItemEmoji(item.name)}</span>
                            <div className="min-w-0">
                              <span className="text-[11px] text-dsa-parchment group-hover:text-dsa-gold transition-colors truncate block">{item.name}</span>
                              <div className="flex items-center gap-1 flex-wrap">
                                {item.usable_in_combat && (
                                  <span className="text-[8px] px-1 py-px rounded bg-red-900/30 text-red-400 border border-red-800/20 leading-tight">Kampf</span>
                                )}
                                {pb && (
                                  <span className="text-[8px] px-1 py-px rounded bg-blue-900/30 text-blue-400 border border-blue-800/20 leading-tight">Probe: {pb.talent}</span>
                                )}
                                {item.consumable && (
                                  <span className="text-[8px] px-1 py-px rounded bg-amber-900/30 text-amber-400 border border-amber-800/20 leading-tight">Verbrauch</span>
                                )}
                                {item.usable && !item.usable_in_combat && !pb && !item.consumable && (
                                  <span className="text-[8px] px-1 py-px rounded bg-dsa-bg-medium text-dsa-parchment-dark border border-dsa-bg-light/20 leading-tight">Nutzbar</span>
                                )}
                              </div>
                            </div>
                          </button>
                          <div className="col-span-1 text-center text-[11px] font-mono text-dsa-parchment">{item.quantity || 1}</div>
                          <div className="col-span-1 text-center text-[10px] font-mono text-dsa-parchment-dark/50">{item.weight ? ((item.weight * (item.quantity || 1)) === item.weight ? `${item.weight}` : `${(item.weight * (item.quantity || 1)).toFixed(1)}`) : '\u2014'}</div>
                          <div className="col-span-4 text-[10px] text-dsa-parchment-dark truncate">{effectDesc.slice(0, 60)}</div>
                          <div className="col-span-2 flex items-center justify-end gap-0.5">
                            {isUsable && (
                              <button onClick={() => openActionModal(item, { id: 'use', label: 'Benutzen' })}
                                className="text-[8px] px-1 py-0.5 bg-dsa-gold/10 text-dsa-gold rounded hover:bg-dsa-gold/20 transition">
                                Nutzen
                              </button>
                            )}
                            <button onClick={() => openActionModal(item, { id: 'drop', label: 'Ablegen' })}
                              className="text-[8px] px-1 py-0.5 bg-dsa-bg-medium text-dsa-parchment-dark rounded hover:text-dsa-parchment transition">
                              Ablegen
                            </button>
                          </div>
                          </div>
                        )
                      })}
                    </div>
                )}
              </div>
            )
          })}
          </div>
          </div>
        </div>
      </div>

      {/* Aktionen explanation */}
      <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4 mt-4">
        <h3 className="text-xs font-semibold text-dsa-parchment-dark mb-1 flex items-center gap-1"><HelpCircle className="w-3.5 h-3.5" /> Aktionen und Gegenstände</h3>
        <p className="text-[10px] text-dsa-parchment-dark/60 leading-relaxed">
          Im Kampf hast du pro Runde <strong className="text-dsa-parchment">1 Aktion</strong> (Angriff, Zauber, Gegenstand benutzen) und <strong className="text-dsa-parchment">1 freie Aktion</strong> (kurze Handlung wie etwas fallen lassen).
          Wähle eine Aktion für den Gegenstand, bestätige die Details, und der Spielleiter entscheidet ob es klappt.
          Außerhalb des Kampfes sind Aktionen frei, aber der Spielleiter muss trotzdem zustimmen.
        </p>
      </div>

      {/* ── Action Request Modal ── */}
      <Modal
        isOpen={!!actionModal}
        onClose={() => { setActionModal(null); setItemDiceRoll('') }}
        title="Aktion anfragen"
        size="md"
        footer={
          <>
            <button onClick={() => { setActionModal(null); setItemDiceRoll('') }} className="btn-ghost">Abbrechen</button>
            <button
              onClick={submitActionRequest}
              disabled={
                (actionModal?.action?.id === 'transfer' && !actionModal?.targetPlayer) ||
                (actionModal?.action?.id === 'use' && resolveItemEffect(actionModal?.item)?.diceFormula && (!itemDiceRoll || parseInt(itemDiceRoll) < 1))
              }
              className="btn-primary flex items-center gap-2 disabled:opacity-30"
            >
              <Send className="w-4 h-4" /> {actionModal?.action?.id === 'use' ? 'Benutzen' : 'Anfrage senden'}
            </button>
          </>
        }
      >
        {actionModal && (() => {
          const { item, action, quantity, maxQuantity } = actionModal

          return (
            <div className="space-y-4">
              {/* What */}
              <div className="bg-dsa-bg rounded border border-dsa-bg-medium p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-sm bg-dsa-bg-light flex items-center justify-center ${getCategoryColor(item)}`}>
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-dsa-parchment">{item.name}</div>
                  {item.category && <div className="text-[10px] text-dsa-parchment-dark">{item.category}</div>}
                </div>
              </div>

              {/* Action type */}
              <div>
                <label className="text-xs text-dsa-parchment-dark mb-1 block">Aktion</label>
                <div className="bg-dsa-bg rounded-sm border border-dsa-bg-medium px-3 py-2 flex items-center gap-2">
                  {action.icon ? <action.icon className="w-4 h-4 text-dsa-gold" /> : <Package className="w-4 h-4 text-dsa-gold" />}
                  <span className="text-sm text-dsa-parchment font-medium">{action.label}</span>
                  <Badge variant="default" size="sm" className="ml-auto">
                    {action.actionCostOverride || '1 Aktion'}
                  </Badge>
                </div>
                {action.desc && <p className="text-xs text-dsa-parchment/60 mt-1">{action.desc}</p>}
              </div>

              {/* Weapon swap info */}
              {action.swapFrom && (
                <div className="bg-orange-950/20 border border-orange-800/20 rounded-sm px-3 py-2">
                  <p className="text-xs text-orange-400">
                    <Swords className="w-3.5 h-3.5 inline mr-1" />
                    <strong>{action.swapFrom}</strong> wird dabei weggesteckt und durch <strong>{item.name}</strong> ersetzt.
                  </p>
                  {action.hasSchnellziehen && (
                    <p className="text-[10px] text-green-400 mt-1">
                      Deine Sonderfertigkeit <strong>Schnellziehen</strong> erlaubt das als Freie Aktion!
                    </p>
                  )}
                </div>
              )}

              {/* Quantity (if item has multiple) */}
              {maxQuantity > 1 && (
                <div>
                  <label className="text-xs text-dsa-parchment-dark mb-1 block">Anzahl (verfügbar: {maxQuantity})</label>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setActionModal(prev => ({ ...prev, quantity: Math.max(1, prev.quantity - 1) }))}
                      className="w-8 h-8 rounded-sm bg-dsa-bg border border-dsa-bg-medium flex items-center justify-center text-dsa-parchment-dark hover:text-dsa-parchment"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="text-xl font-mono font-bold text-dsa-gold w-8 text-center">{quantity}</span>
                    <button
                      onClick={() => setActionModal(prev => ({ ...prev, quantity: Math.min(maxQuantity, prev.quantity + 1) }))}
                      className="w-8 h-8 rounded-sm bg-dsa-bg border border-dsa-bg-medium flex items-center justify-center text-dsa-parchment-dark hover:text-dsa-parchment"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Target player (for transfer) */}
              {action.id === 'transfer' && (
                <div>
                  <label className="text-xs text-dsa-parchment-dark mb-1 block">An wen übergeben?</label>
                  <div className="space-y-1">
                    {otherPlayers.length > 0 ? otherPlayers.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setActionModal(prev => ({ ...prev, targetPlayer: p }))}
                        className={`w-full text-left px-3 py-2 rounded-sm border text-sm transition-colors ${
                          actionModal.targetPlayer?.id === p.id
                            ? 'border-dsa-gold/50 bg-dsa-gold/10 text-dsa-gold'
                            : 'border-dsa-bg-medium bg-dsa-bg text-dsa-parchment hover:border-dsa-gold/20'
                        }`}
                      >
                        {p.character?.name || p.username}
                        <span className="text-[10px] text-dsa-parchment-dark ml-2">{p.character?.species} {p.character?.profession}</span>
                      </button>
                    )) : (
                      <p className="text-xs text-dsa-parchment-dark">Keine anderen Spieler in der Session.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Dice roll input — for consumable items with a dice formula */}
              {action.id === 'use' && (() => {
                const resolved = resolveItemEffect(item)
                if (!resolved.diceFormula) return null
                return (
                  <div className="bg-dsa-bg rounded-sm border border-dsa-gold/20 p-4 text-center">
                    <p className="text-xs text-dsa-parchment mb-1">Würfle <strong className="text-dsa-gold font-mono">{resolved.diceFormula}</strong> und gib das Ergebnis ein:</p>
                    <p className="text-[10px] text-dsa-parchment-dark mb-3">{resolved.description}</p>
                    <input
                      type="number" min="1"
                      value={itemDiceRoll}
                      onChange={(e) => setItemDiceRoll(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && submitActionRequest()}
                      className="w-20 h-16 bg-dsa-bg-light border-2 border-dsa-gold/30 rounded text-center text-3xl font-mono text-dsa-gold mx-auto focus:outline-none focus:border-dsa-gold focus:ring-2 focus:ring-dsa-gold/20"
                      placeholder="—"
                      autoFocus
                    />
                    {itemDiceRoll && parseInt(itemDiceRoll) > 0 && (
                      <p className="text-sm text-green-400 font-bold mt-2">
                        {resolved.effectSummary?.replace('{value}', itemDiceRoll) || `${itemDiceRoll} Punkte`}
                      </p>
                    )}
                  </div>
                )
              })()}

              {/* Summary */}
              <div className="bg-dsa-gold/5 border border-dsa-gold/20 rounded-sm p-3">
                <p className="text-xs text-dsa-parchment">
                  <strong>Zusammenfassung:</strong>{' '}
                  {quantity > 1 ? `${quantity}x ` : ''}{item.name} — {action.label}
                  {actionModal.targetPlayer && ` an ${actionModal.targetPlayer.character?.name || actionModal.targetPlayer.username}`}
                </p>
                <p className="text-[10px] text-dsa-parchment-dark mt-1">
                  Diese Anfrage wird an den Spielleiter gesendet. Sag am Tisch was du tun möchtest!
                </p>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* ── Trade Proposal Modal ── */}
      <Modal
        isOpen={!!tradeModal}
        onClose={() => setTradeModal(null)}
        title={tradeModal?.step === 'select_partner'
          ? (tradeModal?.mode === 'transfer' ? 'Empfänger wählen' : 'Handelspartner wählen')
          : (tradeModal?.mode === 'transfer' ? 'Übergabe vorbereiten' : 'Handelsangebot erstellen')
        }
        size="md"
        footer={
          tradeModal?.step === 'configure' ? (
            <>
              <button onClick={() => setTradeModal(prev => ({ ...prev, step: 'select_partner' }))} className="btn-ghost">Zurück</button>
              <button
                onClick={submitTradeProposal}
                disabled={tradeModal?.offeredItems.length === 0 && tradeModal?.offeredMoney.silber === 0 && tradeModal?.offeredMoney.dukaten === 0 && tradeModal?.offeredMoney.heller === 0}
                className="btn-primary flex items-center gap-2 disabled:opacity-30"
              >
                <Handshake className="w-4 h-4" /> {tradeModal?.mode === 'transfer' ? 'Übergabe beantragen' : 'Angebot senden'}
              </button>
            </>
          ) : (
            <button onClick={() => setTradeModal(null)} className="btn-ghost">Abbrechen</button>
          )
        }
      >
        {tradeModal && tradeModal.step === 'select_partner' && (
          <div className="space-y-2">
            <p className="text-xs text-dsa-parchment-dark mb-2">Mit wem möchtest du handeln?</p>
            {otherPlayers.length > 0 ? otherPlayers.map((p) => (
              <button
                key={p.id}
                onClick={() => setTradeModal(prev => ({ ...prev, step: 'configure', targetPlayer: p }))}
                className="w-full text-left px-4 py-3 rounded border border-dsa-bg-medium bg-dsa-bg text-dsa-parchment hover:border-dsa-gold/30 hover:bg-dsa-bg-light/20 transition-colors flex items-center gap-3"
              >
                <div className="w-8 h-8 rounded-sm bg-dsa-gold/10 flex items-center justify-center text-dsa-gold font-bold text-sm">
                  {(p.character?.name || p.username || '?')[0]}
                </div>
                <div>
                  <div className="text-sm font-medium">{p.character?.name || p.username}</div>
                  <div className="text-[10px] text-dsa-parchment-dark">{p.character?.species} {p.character?.profession}</div>
                </div>
              </button>
            )) : (
              <p className="text-sm text-dsa-parchment-dark text-center py-4">Keine anderen Spieler in der Session.</p>
            )}
          </div>
        )}

        {tradeModal && tradeModal.step === 'configure' && (() => {
          const allItems = inventory.filter(i => {
            const n = (i.name || '').toLowerCase()
            return !(n.includes('silber') || n.includes('dukaten') || n.includes('heller') || n.includes('kreuzer'))
          })
          return (
            <div className="space-y-5">
              {/* Partner */}
              <div className="bg-dsa-bg rounded border border-dsa-bg-medium p-3 flex items-center gap-3">
                <Handshake className="w-5 h-5 text-dsa-gold" />
                <div>
                  <div className="text-sm font-medium text-dsa-parchment">Handel mit {tradeModal.targetPlayer?.character?.name || tradeModal.targetPlayer?.username}</div>
                  <div className="text-[10px] text-dsa-parchment-dark">Beide Seiten müssen zustimmen. Der Spielleiter genehmigt den Handel.</div>
                </div>
              </div>

              {/* Items to offer */}
              <div>
                <label className="text-xs text-dsa-gold font-semibold mb-2 block flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5" /> Du bietest (Gegenstände)
                </label>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {allItems.map((item, i) => {
                    const selected = tradeModal.offeredItems.find(oi => oi.name === item.name)
                    return (
                      <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-sm border transition-colors cursor-pointer ${
                        selected ? 'border-dsa-gold/40 bg-dsa-gold/10' : 'border-dsa-bg-medium bg-dsa-bg hover:border-dsa-bg-medium/80'
                      }`} onClick={() => toggleTradeItem(item)}>
                        <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                          selected ? 'border-dsa-gold bg-dsa-gold/20' : 'border-dsa-bg-medium'
                        }`}>
                          {selected && <Check className="w-3 h-3 text-dsa-gold" />}
                        </div>
                        <span className="text-sm text-dsa-parchment flex-1">{item.name}</span>
                        <span className="text-[10px] text-dsa-parchment-dark">x{item.quantity || 1}</span>
                        {selected && (
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <button onClick={() => updateTradeItemQty(item.name, selected.quantity - 1)} className="w-5 h-5 rounded bg-dsa-bg-light flex items-center justify-center text-dsa-parchment-dark hover:text-dsa-parchment">
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="text-xs font-mono text-dsa-gold w-6 text-center">{selected.quantity}/{item.quantity || 1}</span>
                            <button onClick={() => updateTradeItemQty(item.name, selected.quantity + 1)} className="w-5 h-5 rounded bg-dsa-bg-light flex items-center justify-center text-dsa-parchment-dark hover:text-dsa-parchment">
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {allItems.length === 0 && <p className="text-xs text-dsa-parchment-dark text-center py-2">Keine Gegenstände verfügbar.</p>}
                </div>
              </div>

              {/* Money to offer */}
              <div>
                <label className="text-xs text-dsa-gold font-semibold mb-2 block flex items-center gap-1.5">
                  <Coins className="w-3.5 h-3.5" /> Du bietest (Geld)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {['dukaten', 'silber', 'heller'].map(currency => {
                    const label = currency === 'dukaten' ? 'Dukaten' : currency === 'silber' ? 'Silber' : 'Heller'
                    const available = moneyItems.find(m => m.name.toLowerCase().includes(currency))?.quantity || 0
                    return (
                      <div key={currency}>
                        <label className="text-[10px] text-dsa-parchment-dark block mb-1">{label} ({available})</label>
                        <input
                          type="number"
                          min={0}
                          max={available}
                          value={tradeModal.offeredMoney[currency]}
                          onChange={e => setTradeModal(prev => ({
                            ...prev,
                            offeredMoney: { ...prev.offeredMoney, [currency]: Math.min(available, Math.max(0, parseInt(e.target.value) || 0)) },
                          }))}
                          className="w-full bg-dsa-bg border border-dsa-bg-medium rounded-sm px-2 py-1.5 text-sm font-mono text-dsa-gold text-center focus:border-dsa-gold/50 focus:outline-none"
                        />
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Summary */}
              <div className="bg-dsa-gold/5 border border-dsa-gold/20 rounded-sm p-3 space-y-1">
                <p className="text-xs font-semibold text-dsa-gold">Zusammenfassung</p>
                {tradeModal.offeredItems.length > 0 && (
                  <p className="text-xs text-dsa-parchment">
                    Du gibst: {tradeModal.offeredItems.map(i => `${i.quantity > 1 ? `${i.quantity}x ` : ''}${i.name}`).join(', ')}
                  </p>
                )}
                {(tradeModal.offeredMoney.silber > 0 || tradeModal.offeredMoney.dukaten > 0 || tradeModal.offeredMoney.heller > 0) && (
                  <p className="text-xs text-dsa-parchment">
                    Du zahlst: {[
                      tradeModal.offeredMoney.dukaten > 0 && `${tradeModal.offeredMoney.dukaten} Dukaten`,
                      tradeModal.offeredMoney.silber > 0 && `${tradeModal.offeredMoney.silber} Silber`,
                      tradeModal.offeredMoney.heller > 0 && `${tradeModal.offeredMoney.heller} Heller`,
                    ].filter(Boolean).join(', ')}
                  </p>
                )}
                {tradeModal.offeredItems.length === 0 && tradeModal.offeredMoney.silber === 0 && tradeModal.offeredMoney.dukaten === 0 && tradeModal.offeredMoney.heller === 0 && (
                  <p className="text-xs text-dsa-parchment-dark italic">Wähle mindestens einen Gegenstand oder Geld zum Anbieten.</p>
                )}
                <p className="text-[10px] text-dsa-parchment-dark mt-1">
                  {tradeModal.mode === 'transfer'
                    ? 'Der Spielleiter muss die Übergabe genehmigen.'
                    : 'Dein Handelspartner kann ein Gegenangebot machen.'}
                </p>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* ── Incoming Trade Modal ── */}
      <Modal
        isOpen={!!incomingTrade}
        onClose={() => setIncomingTrade(null)}
        title="Handelsangebot erhalten"
        size="md"
        footer={
          <>
            <button onClick={() => respondToTrade(false)} className="btn-ghost flex items-center gap-1.5">
              <X className="w-4 h-4" /> Ablehnen
            </button>
            <button onClick={() => respondToTrade(true)} className="btn-primary flex items-center gap-2">
              <Check className="w-4 h-4" /> Annehmen
            </button>
          </>
        }
      >
        {incomingTrade && (
          <div className="space-y-4">
            {/* Who is proposing */}
            <div className="bg-dsa-bg rounded border border-dsa-gold/20 p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-sm bg-dsa-gold/10 flex items-center justify-center text-dsa-gold font-bold">
                {(incomingTrade.proposer_name || '?')[0]}
              </div>
              <div>
                <div className="text-sm font-semibold text-dsa-parchment">{incomingTrade.proposer_name}</div>
                <div className="text-[10px] text-dsa-parchment-dark">möchte mit dir handeln</div>
              </div>
            </div>

            {/* What they offer */}
            <div>
              <h4 className="text-xs font-semibold text-green-400 mb-2 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5" /> Du bekommst
              </h4>
              <div className="space-y-1">
                {(incomingTrade.offered_items || []).map((item, i) => (
                  <div key={i} className="flex items-center justify-between bg-green-950/20 border border-green-800/20 rounded-sm px-3 py-2">
                    <span className="text-sm">{getItemEmoji(item.name, item.category)}</span>
                  <span className="text-sm text-dsa-parchment">{item.name}</span>
                    {item.quantity > 1 && <span className="text-xs font-mono text-green-400">x{item.quantity}</span>}
                  </div>
                ))}
                {(() => {
                  const m = incomingTrade.offered_money || {}
                  const parts = [
                    m.dukaten > 0 && `${m.dukaten} Dukaten`,
                    m.silber > 0 && `${m.silber} Silber`,
                    m.heller > 0 && `${m.heller} Heller`,
                  ].filter(Boolean)
                  return parts.length > 0 ? (
                    <div className="flex items-center gap-2 bg-green-950/20 border border-green-800/20 rounded-sm px-3 py-2">
                      <Coins className="w-4 h-4 text-dsa-gold" />
                      <span className="text-sm text-dsa-gold">{parts.join(', ')}</span>
                    </div>
                  ) : null
                })()}
                {(incomingTrade.offered_items || []).length === 0 && !(incomingTrade.offered_money?.silber || incomingTrade.offered_money?.dukaten || incomingTrade.offered_money?.heller) && (
                  <p className="text-xs text-dsa-parchment-dark italic">Keine Gegenstände oder Geld angeboten.</p>
                )}
              </div>
            </div>

            {/* Counter-offer: What Player B gives in return */}
            <div>
              <h4 className="text-xs font-semibold text-orange-400 mb-2 flex items-center gap-1.5">
                <ArrowRightLeft className="w-3.5 h-3.5" /> Dein Gegenangebot (optional)
              </h4>
              <div className="space-y-2">
                {/* Select items to give */}
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {inventory.filter(i => !i.equipped).map((item, i) => {
                    const selected = (counterOffer?.items || []).find(ci => ci.name === item.name)
                    return (
                      <button
                        key={i}
                        onClick={() => {
                          setCounterOffer(prev => {
                            const items = prev?.items || []
                            if (selected) return { ...prev, items: items.filter(ci => ci.name !== item.name) }
                            return { ...prev, items: [...items, { name: item.name, quantity: 1 }] }
                          })
                        }}
                        className={`w-full flex items-center justify-between px-3 py-1.5 rounded-sm text-xs transition-colors ${selected ? 'bg-orange-900/30 border border-orange-700/30 text-dsa-parchment' : 'bg-dsa-bg border border-dsa-bg-medium text-dsa-parchment-dark hover:text-dsa-parchment'}`}
                      >
                        <span>{item.name} {item.quantity > 1 ? `(x${item.quantity})` : ''}</span>
                        {selected && (
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <button onClick={() => setCounterOffer(prev => ({ ...prev, items: prev.items.map(ci => ci.name === item.name ? { ...ci, quantity: Math.max(1, ci.quantity - 1) } : ci) }))} className="px-1 text-dsa-parchment-dark hover:text-dsa-parchment"><Minus className="w-3 h-3" /></button>
                            <span className="font-mono w-4 text-center">{selected.quantity}</span>
                            <button onClick={() => setCounterOffer(prev => ({ ...prev, items: prev.items.map(ci => ci.name === item.name ? { ...ci, quantity: Math.min(item.quantity || 1, ci.quantity + 1) } : ci) }))} className="px-1 text-dsa-parchment-dark hover:text-dsa-parchment"><Plus className="w-3 h-3" /></button>
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
                {/* Money counter-offer */}
                <div className="flex gap-2">
                  {['dukaten', 'silber', 'heller'].map(cur => (
                    <div key={cur} className="flex-1">
                      <label className="text-[9px] text-dsa-parchment-dark capitalize">{cur}</label>
                      <input
                        type="number" min="0"
                        value={counterOffer?.money?.[cur] || 0}
                        onChange={e => setCounterOffer(prev => ({ items: prev?.items || [], money: { ...(prev?.money || {}), [cur]: parseInt(e.target.value) || 0 } }))}
                        className="w-full bg-dsa-bg border border-dsa-bg-medium rounded px-2 py-1 text-xs text-dsa-parchment"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Info */}
            <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded-sm p-3">
              <p className="text-[10px] text-dsa-parchment-dark leading-relaxed">
                Wähle optional Gegenstände oder Geld als Gegenangebot.
                Wenn du annimmst, wird der Spielleiter den Handel genehmigen.
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
    </>
  )
}

export default React.memo(InventoryPanel)
