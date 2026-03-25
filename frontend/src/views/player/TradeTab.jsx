import { useState } from 'react'
import {
  Handshake, ArrowRight, ChevronRight, Plus, Minus, X,
  Check, Clock, Send, Package, Coins, User, Gift
} from 'lucide-react'
import useCharacterStore from '../../stores/characterStore'
import useSessionStore from '../../stores/sessionStore'
import useAuthStore from '../../stores/authStore'
import Badge from '../../components/common/Badge'
import { getItemIcon as getItemEmoji } from '../../utils/icons'
import clsx from 'clsx'

export default function TradeTab({ sendMessage }) {
  const myCharacter = useCharacterStore((s) => s.myCharacter)
  const players = useSessionStore((s) => s.players)
  const currentUser = useAuthStore((s) => s.user)
  const incomingTrade = useSessionStore((s) => s.incomingTrade)
  const outgoingTrade = useSessionStore((s) => s.outgoingTrade)
  const clearIncomingTrade = useSessionStore((s) => s.clearIncomingTrade)
  const clearOutgoingTrade = useSessionStore((s) => s.clearOutgoingTrade)

  const [step, setStep] = useState('idle') // idle | select_partner | select_items | review | sent
  const [mode, setMode] = useState('trade') // trade | give
  const [targetPlayer, setTargetPlayer] = useState(null)
  const [offeredItems, setOfferedItems] = useState([])
  const [offeredMoney, setOfferedMoney] = useState({ dukaten: 0, silber: 0, heller: 0 })
  const [counterItems, setCounterItems] = useState([])
  const [counterMoney, setCounterMoney] = useState({ dukaten: 0, silber: 0, heller: 0 })

  if (!myCharacter) return <div className="text-center py-8 text-dsa-parchment-dark text-sm">Kein Charakter geladen.</div>

  const rawInv = myCharacter.basis_inventory || []
  const inventory = Array.isArray(rawInv) ? rawInv : (rawInv.items || [])
  const purse = Array.isArray(rawInv) ? {} : (rawInv.purse || {})
  const otherPlayers = players.filter(p => p.id !== currentUser?.id && p.characterId)

  const reset = () => { setStep('idle'); setMode('trade'); setTargetPlayer(null); setOfferedItems([]); setOfferedMoney({ dukaten: 0, silber: 0, heller: 0 }); setCounterItems([]); setCounterMoney({ dukaten: 0, silber: 0, heller: 0 }) }

  const toggleItem = (item) => {
    const existing = offeredItems.find(i => i.name === item.name)
    if (existing) {
      setOfferedItems(offeredItems.filter(i => i.name !== item.name))
    } else {
      setOfferedItems([...offeredItems, { name: item.name, quantity: 1 }])
    }
  }

  const setItemQty = (name, qty) => {
    const max = inventory.find(i => i.name === name)?.quantity || 1
    setOfferedItems(offeredItems.map(i => i.name === name ? { ...i, quantity: Math.max(1, Math.min(max, qty)) } : i))
  }

  const submitTrade = () => {
    if (!targetPlayer) return
    if (mode === 'give') {
      sendMessage?.({
        type: 'transfer_request',
        payload: {
          from_character_id: myCharacter.id,
          from_user_id: currentUser?.id,
          from_name: myCharacter.name,
          to_character_id: targetPlayer.characterId || targetPlayer.character?.id,
          to_user_id: targetPlayer.id,
          to_name: targetPlayer.character?.name || targetPlayer.username,
          from_items: offeredItems.filter(i => i.quantity > 0),
          from_money: offeredMoney,
          summary: `${myCharacter.name} gibt ${offeredItems.map(i => `${i.quantity}x ${i.name}`).join(', ')} an ${targetPlayer.character?.name}`,
        },
      })
    } else {
      const tradeId = `trade_${Date.now()}`
      sendMessage?.({
        type: 'trade_propose',
        payload: {
          trade_id: tradeId,
          proposer_id: myCharacter.id,
          proposer_user_id: currentUser?.id,
          proposer_name: myCharacter.name,
          target_id: targetPlayer.id,
          target_character_id: targetPlayer.characterId || targetPlayer.character?.id,
          target_name: targetPlayer.character?.name || targetPlayer.username,
          offered_items: offeredItems.filter(i => i.quantity > 0),
          offered_money: offeredMoney,
        },
      })
    }
    setStep('sent')
  }

  const respondToIncoming = (accept) => {
    if (!incomingTrade) return
    if (accept) {
      sendMessage?.({
        type: 'trade_accept',
        payload: {
          trade_id: incomingTrade.trade_id,
          accepted: true,
          proposer_user_id: incomingTrade.proposer_user_id,
          from_items: incomingTrade.offered_items || [],
          from_money: incomingTrade.offered_money || {},
          to_items: counterItems,
          to_money: counterMoney,
          from_name: incomingTrade.proposer_name,
          to_name: myCharacter.name,
          summary: `Handel akzeptiert`,
        },
      })
    } else {
      sendMessage?.({ type: 'trade_decline', payload: { trade_id: incomingTrade.trade_id, proposer_id: incomingTrade.proposer_user_id } })
    }
    clearIncomingTrade?.()
    setCounterItems([])
    setCounterMoney({ dukaten: 0, silber: 0, heller: 0 })
  }

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      {/* ── INCOMING TRADE (highest priority) ── */}
      {incomingTrade && (
        <div className="border border-green-800/30 rounded overflow-hidden animate-fade-in">
          <div className="bg-green-950/50 px-4 py-2.5 flex items-center gap-2">
            <Handshake className="w-5 h-5 text-green-400" />
            <h3 className="text-sm font-semibold text-green-400">Handelsangebot von {incomingTrade.proposer_name}</h3>
          </div>
          <div className="px-4 py-4 space-y-3">

          {/* What they offer */}
          <div className="bg-dsa-bg rounded p-3 border border-dsa-bg-medium">
            <p className="text-[10px] text-dsa-parchment-dark uppercase tracking-wider mb-2">{incomingTrade.proposer_name} bietet:</p>
            {(incomingTrade.offered_items || []).map((item, i) => (
              <div key={i} className="flex items-center justify-between py-1">
                <span className="text-xs text-dsa-parchment">{getItemEmoji(item.name)} {item.name}</span>
                <span className="text-xs font-mono text-dsa-gold">{item.quantity > 1 ? `${item.quantity}x` : ''}</span>
              </div>
            ))}
            {(() => {
              const m = incomingTrade.offered_money || {}
              const parts = [m.dukaten && `${m.dukaten} Dukaten`, m.silber && `${m.silber} Silber`, m.heller && `${m.heller} Heller`].filter(Boolean)
              return parts.length > 0 ? <p className="text-xs text-dsa-gold mt-1">{parts.join(', ')}</p> : null
            })()}
          </div>

          {/* What you offer back (counter) */}
          <div className="bg-dsa-bg rounded p-3 border border-dsa-bg-medium">
            <p className="text-[10px] text-dsa-parchment-dark uppercase tracking-wider mb-2">Dein Gegenangebot (optional):</p>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {inventory.filter(i => !i.equipped).map((item, i) => {
                const selected = counterItems.find(ci => ci.name === item.name)
                return (
                  <div key={i} className="flex items-center justify-between py-0.5">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={!!selected}
                        onChange={() => selected ? setCounterItems(counterItems.filter(ci => ci.name !== item.name)) : setCounterItems([...counterItems, { name: item.name, quantity: 1 }])}
                        className="rounded-sm border-dsa-bg-medium" />
                      <span className="text-[11px] text-dsa-parchment">{item.name}</span>
                    </label>
                    {selected && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => setCounterItems(counterItems.map(ci => ci.name === item.name ? { ...ci, quantity: Math.max(1, ci.quantity - 1) } : ci))} className="px-1 text-dsa-parchment-dark"><Minus className="w-3 h-3" /></button>
                        <span className="text-[11px] font-mono w-4 text-center">{selected.quantity}</span>
                        <button onClick={() => setCounterItems(counterItems.map(ci => ci.name === item.name ? { ...ci, quantity: Math.min(item.quantity || 1, ci.quantity + 1) } : ci))} className="px-1 text-dsa-parchment-dark"><Plus className="w-3 h-3" /></button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={() => respondToIncoming(true)} className="flex-1 py-2 bg-green-900/20 text-green-400 border border-green-800/20 rounded text-xs font-semibold hover:bg-green-900/30 transition flex items-center justify-center gap-1.5">
              <Check className="w-3.5 h-3.5" /> Annehmen
            </button>
            <button onClick={() => respondToIncoming(false)} className="flex-1 py-2 bg-red-900/20 text-red-400 border border-red-800/20 rounded text-xs font-semibold hover:bg-red-900/30 transition flex items-center justify-center gap-1.5">
              <X className="w-3.5 h-3.5" /> Ablehnen
            </button>
          </div>
          </div>
        </div>
      )}

      {/* ── OUTGOING TRADE STATUS ── */}
      {outgoingTrade && step !== 'sent' && (
        <div className="bg-blue-900/10 border border-blue-800/20 rounded p-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-400 animate-pulse" />
          <span className="text-xs text-blue-400">Warte auf Antwort von {outgoingTrade.target_name}...</span>
        </div>
      )}

      {/* ── IDLE: Start new trade ── */}
      {step === 'idle' && !incomingTrade && (
        <div className="space-y-3">
          <div className="bg-dsa-gold/10 rounded px-3 py-2.5 flex items-center gap-2">
            <Handshake className="w-4 h-4 text-dsa-gold" />
            <h3 className="text-sm font-semibold text-dsa-gold">Handel & Uebergabe</h3>
          </div>
          <p className="text-xs text-dsa-parchment-dark">Tausche Gegenstaende und Geld mit anderen Spielern. Der Spielleiter muss den Handel genehmigen.</p>

          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { setMode('trade'); setStep('select_partner') }}
              className="p-3 bg-dsa-bg-card border border-dsa-bg-medium rounded hover:border-dsa-gold/30 transition text-left">
              <Handshake className="w-5 h-5 text-dsa-gold mb-1" />
              <span className="text-xs font-medium text-dsa-parchment block">Handeln</span>
              <span className="text-[9px] text-dsa-parchment-dark">Gegenstaende tauschen</span>
            </button>
            <button onClick={() => { setMode('give'); setStep('select_partner') }}
              className="p-3 bg-dsa-bg-card border border-dsa-bg-medium rounded hover:border-dsa-gold/30 transition text-left">
              <Gift className="w-5 h-5 text-emerald-400 mb-1" />
              <span className="text-xs font-medium text-dsa-parchment block">Geben</span>
              <span className="text-[9px] text-dsa-parchment-dark">Einseitig uebergeben</span>
            </button>
          </div>

          {otherPlayers.length === 0 && (
            <p className="text-[10px] text-dsa-parchment-dark/50 text-center py-4">Keine anderen Spieler verbunden.</p>
          )}
        </div>
      )}

      {/* ── STEP 1: Select partner ── */}
      {step === 'select_partner' && (
        <div className="space-y-3">
          <div className="bg-dsa-gold/10 rounded px-3 py-2.5 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-dsa-gold flex items-center gap-2"><User className="w-4 h-4" /> {mode === 'give' ? 'Empfaenger waehlen' : 'Handelspartner waehlen'}</h3>
            <button onClick={reset} className="text-[10px] text-dsa-parchment-dark hover:text-dsa-parchment">Abbrechen</button>
          </div>
          <div className="space-y-1">
            {otherPlayers.map(p => (
              <button key={p.id} onClick={() => { setTargetPlayer(p); setStep('select_items') }}
                className="w-full flex items-center gap-3 p-3 bg-dsa-bg-card border border-dsa-bg-medium rounded hover:border-dsa-gold/30 transition text-left">
                <div className="w-8 h-8 bg-dsa-bg-medium rounded-sm flex items-center justify-center">
                  <User className="w-4 h-4 text-dsa-parchment-dark" />
                </div>
                <div>
                  <span className="text-xs font-medium text-dsa-parchment">{p.character?.name || p.username}</span>
                  <span className="text-[9px] text-dsa-parchment-dark block">{p.connected ? 'Verbunden' : 'Nicht verbunden'}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-dsa-parchment-dark ml-auto" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── STEP 2: Select items ── */}
      {step === 'select_items' && (
        <div className="space-y-3">
          <div className="bg-dsa-gold/10 rounded px-3 py-2.5 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-dsa-gold flex items-center gap-2"><Package className="w-4 h-4" /> {mode === 'give' ? 'Was gibst du?' : 'Was bietest du an?'}</h3>
            <button onClick={() => setStep('select_partner')} className="text-[10px] text-dsa-parchment-dark hover:text-dsa-parchment">Zurueck</button>
          </div>
          <p className="text-[10px] text-dsa-parchment-dark">An: <span className="text-dsa-parchment font-medium">{targetPlayer?.character?.name}</span></p>

          {/* Item selection */}
          <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded divide-y divide-dsa-bg-medium/30 max-h-60 overflow-y-auto">
            {inventory.filter(i => !i.equipped).map((item, i) => {
              const selected = offeredItems.find(oi => oi.name === item.name)
              return (
                <div key={i} className={clsx('flex items-center gap-2 px-3 py-1.5 transition', selected ? 'bg-dsa-gold/5' : 'hover:bg-dsa-bg-light/10')}>
                  <input type="checkbox" checked={!!selected} onChange={() => toggleItem(item)} className="rounded-sm border-dsa-bg-medium flex-shrink-0" />
                  <span className="text-xs">{getItemEmoji(item.name)}</span>
                  <span className="text-[11px] text-dsa-parchment flex-1 truncate">{item.name}</span>
                  <span className="text-[10px] font-mono text-dsa-parchment-dark">{item.quantity || 1}x</span>
                  {selected && (item.quantity || 1) > 1 && (
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => setItemQty(item.name, selected.quantity - 1)} className="px-0.5"><Minus className="w-3 h-3 text-dsa-parchment-dark" /></button>
                      <span className="text-[10px] font-mono w-4 text-center text-dsa-gold">{selected.quantity}</span>
                      <button onClick={() => setItemQty(item.name, selected.quantity + 1)} className="px-0.5"><Plus className="w-3 h-3 text-dsa-parchment-dark" /></button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Money */}
          <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-3">
            <p className="text-[10px] text-dsa-parchment-dark mb-2">Geld mitgeben:</p>
            <div className="grid grid-cols-3 gap-2">
              {[{ key: 'dukaten', label: 'Dukaten', max: purse.dukaten || 0 }, { key: 'silber', label: 'Silber', max: purse.silber || 0 }, { key: 'heller', label: 'Heller', max: purse.heller || 0 }].map(c => (
                <div key={c.key}>
                  <label className="text-[9px] text-dsa-parchment-dark">{c.label} (max {c.max})</label>
                  <input type="number" min={0} max={c.max} value={offeredMoney[c.key]}
                    onChange={e => setOfferedMoney({ ...offeredMoney, [c.key]: Math.min(c.max, Math.max(0, parseInt(e.target.value) || 0)) })}
                    className="input-field text-[11px] w-full mt-0.5" />
                </div>
              ))}
            </div>
          </div>

          {/* Summary + Submit */}
          <div className="flex items-center justify-between">
            <div className="text-[10px] text-dsa-parchment-dark">
              {offeredItems.length > 0 && <span>{offeredItems.map(i => `${i.quantity}x ${i.name}`).join(', ')}</span>}
              {offeredItems.length === 0 && offeredMoney.dukaten === 0 && offeredMoney.silber === 0 && offeredMoney.heller === 0 && <span>Nichts ausgewaehlt</span>}
            </div>
            <button onClick={submitTrade}
              disabled={offeredItems.length === 0 && offeredMoney.dukaten === 0 && offeredMoney.silber === 0 && offeredMoney.heller === 0}
              className={clsx('px-4 py-2 rounded text-xs font-semibold transition flex items-center gap-1.5',
                offeredItems.length > 0 || offeredMoney.dukaten > 0 || offeredMoney.silber > 0 || offeredMoney.heller > 0
                  ? 'bg-dsa-gold/20 text-dsa-gold hover:bg-dsa-gold/30' : 'bg-dsa-bg-medium text-dsa-parchment-dark/40 cursor-not-allowed')}>
              <Send className="w-3.5 h-3.5" /> {mode === 'give' ? 'Uebergabe beantragen' : 'Angebot senden'}
            </button>
          </div>
        </div>
      )}

      {/* ── SENT: Waiting ── */}
      {step === 'sent' && (
        <div className="text-center py-8 space-y-3">
          <Clock className="w-8 h-8 text-dsa-gold mx-auto animate-pulse" />
          <h3 className="text-sm font-semibold text-dsa-gold">{mode === 'give' ? 'Uebergabe beantragt' : 'Handelsangebot gesendet'}</h3>
          <p className="text-xs text-dsa-parchment-dark">
            {mode === 'give' ? 'Der Spielleiter muss die Uebergabe genehmigen.' : `Warte auf Antwort von ${targetPlayer?.character?.name}...`}
          </p>
          <button onClick={reset} className="text-[10px] text-dsa-parchment-dark hover:text-dsa-parchment transition">
            Neuer Handel starten
          </button>
        </div>
      )}
    </div>
  )
}
