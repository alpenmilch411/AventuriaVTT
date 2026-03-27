import { useState } from 'react'
import {
  Check, X, Dice5, ChevronDown, ChevronUp,
  Swords, FlaskConical, Sparkles, Package, ArrowRightLeft, Send
} from 'lucide-react'
import clsx from 'clsx'
import useSessionStore from '../../stores/sessionStore'
import Badge from '../../components/common/Badge'
import Modal from '../../components/common/Modal'

const TYPE_CONFIG = {
  action_request: { icon: Package, color: 'text-dsa-gold', label: 'Aktion' },
  probe_request_from_player: { icon: Dice5, color: 'text-blue-400', label: 'Probe' },
  spell_cast_request: { icon: Sparkles, color: 'text-purple-400', label: 'Zauber' },
  transfer_request: { icon: ArrowRightLeft, color: 'text-orange-400', label: 'Uebergabe' },
  trade_gm_request: { icon: ArrowRightLeft, color: 'text-purple-400', label: 'Handel' },
}

export default function NotificationPanel({ sendMessage }) {
  const notifications = useSessionStore((s) => s.notifications)
  const dismissNotification = useSessionStore((s) => s.dismissNotification)

  const [expandedId, setExpandedId] = useState(null)
  const [probeModal, setProbeModal] = useState(null)
  const [probeDifficulty, setProbeDifficulty] = useState(0)

  // Only show actionable requests (not results, not system messages)
  const actionableNotifs = notifications.filter(n =>
    n.type === 'action_request' || n.type === 'probe_request_from_player' || n.type === 'spell_cast_request'
    || n.type === 'transfer_request' || n.type === 'trade_gm_request'
  )

  const handleAccept = (notif) => {
    const p = notif.payload
    // Probes/spells: always go through difficulty dialog
    if (notif.type === 'probe_request_from_player' || notif.type === 'spell_cast_request') {
      setProbeModal(notif)
      setProbeDifficulty(0)
      return
    }
    // Transfer request: execute via backend
    if (notif.type === 'transfer_request') {
      sendMessage?.({ type: 'transfer_approved', payload: p })
      sendMessage?.({ type: 'combat_log_entry', payload: { type: 'system', text: `${p.from_name} gibt ${(p.from_items || []).map(i => `${i.quantity}x ${i.name}`).join(', ')} an ${p.to_name}.` } })
      dismissNotification(notif.id)
      return
    }
    // Trade request: execute via backend
    if (notif.type === 'trade_gm_request') {
      sendMessage?.({ type: 'trade_approved', payload: p })
      sendMessage?.({ type: 'combat_log_entry', payload: { type: 'system', text: p.summary || `Handel zwischen ${p.from_name} und ${p.to_name} genehmigt.` } })
      dismissNotification(notif.id)
      return
    }
    // Legacy transfers: send item_transferred to both players
    if (p.action_type === 'transfer' && p.target_player_id) {
      sendMessage?.({
        type: 'item_transferred',
        payload: {
          from_player_id: p.from_user || p.character_id,
          from_name: p.character_name,
          to_player_id: p.target_player_id,
          to_name: p.target_player_name,
          item_name: p.item_name,
          quantity: p.quantity || 1,
        },
      })
    }
    // Broadcast approval
    sendMessage?.({ type: 'action_approved', payload: { ...p, approved: true } })
    if (p.action_type === 'transfer' && p.target_player_name) {
      sendMessage?.({ type: 'combat_log_entry', payload: { type: 'system', text: `${p.character_name} gibt ${p.item_name} an ${p.target_player_name}.` } })
    }
    // If "use" action and item has a dice formula, send dice_request so player rolls
    if (p.action_type === 'use' && p.item_name) {
      // Look up item effects from the inventory data sent in the payload
      const effects = p.effects || null
      const formula = effects?.heal_lep || effects?.restore_asp || effects?.fire_damage || effects?.holy_damage
      if (formula && typeof formula === 'string' && formula.includes('W')) {
        const userId = p.from_user || notif.payload?.from_user
        if (userId) {
          sendMessage?.({
            type: 'dice_request',
            payload: {
              target_user_id: userId,
              type: 'item_use',
              label: `${p.item_name}: Wuerfle ${formula}`,
              dice: formula,
              item_name: p.item_name,
              item_effects: effects,
            },
          })
        }
      }
    }
    dismissNotification(notif.id)
  }

  const handleDecline = (notif) => {
    const p = notif.payload
    if (notif.type === 'transfer_request') {
      sendMessage?.({ type: 'transfer_rejected', payload: p })
    } else if (notif.type === 'trade_gm_request') {
      sendMessage?.({ type: 'trade_rejected', payload: p })
    } else {
      sendMessage?.({ type: 'action_declined', payload: { ...p, approved: false, reason: 'Vom Spielleiter abgelehnt' } })
    }
    dismissNotification(notif.id)
  }

  const handleSendProbe = () => {
    if (!probeModal) return
    const p = probeModal.payload
    // Auto-include Behinderung for talents affected by encumbrance
    const bePenalty = p.encumbrance && p.be ? -Math.abs(p.be) : 0
    const totalDifficulty = probeDifficulty + bePenalty
    sendMessage?.({
      type: 'dice_request',
      payload: {
        target_user_id: p.from_user || p.character_id,
        character_name: p.character_name,
        type: probeModal.type === 'spell_cast_request' ? 'spell_probe' : 'talent_probe',
        talent_name: p.talent_name || p.spell_name,
        probe: p.probe || [],
        fw: p.fw || 0,
        difficulty: totalDifficulty,
        be_penalty: bePenalty,
        gm_modifier: probeDifficulty,
        encumbrance: !!p.encumbrance,
      },
    })
    // No log entry here — the result will be logged when the player rolls
    dismissNotification(probeModal.id)
    setProbeModal(null)
  }

  if (actionableNotifs.length === 0) return null

  return (
    <>
      <div className="space-y-1.5">
        {actionableNotifs.map((notif) => {
          const config = TYPE_CONFIG[notif.type] || TYPE_CONFIG.action_request
          const Icon = config.icon
          const isExpanded = expandedId === notif.id
          const p = notif.payload || {}

          // Build a clean summary line
          const summary = notif.type === 'probe_request_from_player'
            ? `${p.talent_name} proben (FW ${p.fw}${p.item_bonus ? `, +${p.item_bonus.value} durch ${p.item_bonus.item_name}` : ''})`
            : notif.type === 'spell_cast_request'
            ? `${p.spell_name} wirken`
            : notif.type === 'transfer_request'
            ? `${(p.from_items || []).map(i => `${i.quantity}x ${i.name}`).join(', ')} → ${p.to_name}`
            : notif.type === 'trade_gm_request'
            ? p.summary || `Handel: ${p.from_name} ↔ ${p.to_name}`
            : `${p.action_label || p.action_type}${p.item_name ? `: ${p.item_name}` : ''}${p.target_player_name ? ` → ${p.target_player_name}` : ''}`

          const ageMs = Date.now() - (notif.timestamp ? new Date(notif.timestamp).getTime() : parseInt(String(notif.id).split('_')[0]) || Date.now())
          const ageMin = Math.floor(ageMs / 60000)
          const ageStr = ageMin < 1 ? 'gerade eben' : ageMin < 60 ? `vor ${ageMin} Min` : `vor ${Math.floor(ageMin / 60)}h`
          const isStale = ageMin > 5

          return (
            <div key={notif.id} className={clsx('bg-dsa-bg rounded border overflow-hidden', isStale ? 'border-dsa-bg-medium/50 opacity-70' : 'border-dsa-bg-medium')}>
              {/* Compact row */}
              <div className="flex items-center gap-2 px-3 py-2">
                <Icon className={`w-4 h-4 flex-shrink-0 ${config.color}`} />
                <div className="flex-1 min-w-0" onClick={() => setExpandedId(isExpanded ? null : notif.id)}>
                  <div className="text-xs text-dsa-parchment font-medium truncate">
                    {p.character_name || notif.from}
                    <span className={clsx('ml-2 text-[9px] font-normal', isStale ? 'text-amber-400/60' : 'text-dsa-parchment-dark/40')}>{ageStr}</span>
                  </div>
                  <div className="text-[10px] text-dsa-parchment-dark truncate">{summary}</div>
                </div>

                {/* Quick action buttons — always visible */}
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => handleAccept(notif)}
                    className="w-7 h-7 rounded-sm bg-green-900/30 text-green-400 flex items-center justify-center hover:bg-green-900/50 transition-colors" title="Genehmigen">
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  {(notif.type === 'probe_request_from_player' || notif.type === 'spell_cast_request') && (
                    <button onClick={() => { setProbeModal(notif); setProbeDifficulty(0) }}
                      className="w-7 h-7 rounded-sm bg-blue-900/30 text-blue-400 flex items-center justify-center hover:bg-blue-900/50 transition-colors" title="Probe mit Erschwernis">
                      <Dice5 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button onClick={() => handleDecline(notif)}
                    className="w-7 h-7 rounded-sm bg-red-900/30 text-red-400 flex items-center justify-center hover:bg-red-900/50 transition-colors" title="Ablehnen">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Expanded details (optional) */}
              {isExpanded && (
                <div className="px-3 pb-2 border-t border-dsa-bg-medium/50 pt-1.5 text-[10px] text-dsa-parchment-dark space-y-0.5">
                  {p.action_cost && <div>Aktionskosten: <span className="text-dsa-parchment">{p.action_cost}</span></div>}
                  {p.swap_from && <div>Tauscht: <span className="text-orange-400">{p.swap_from}</span></div>}
                  {p.probe && p.probe.length > 0 && <div>Probe: <span className="text-dsa-parchment">{p.probe.join('/')}</span> FW {p.fw}</div>}
                  {p.quantity > 1 && <div>Anzahl: <span className="text-dsa-parchment">{p.quantity}</span></div>}
                  {/* Transfer/Trade details */}
                  {(notif.type === 'transfer_request' || notif.type === 'trade_gm_request') && (
                    <>
                      {p.from_items?.length > 0 && <div><span className="text-green-400">{p.from_name || 'A'} gibt:</span> {p.from_items.map(i => `${i.quantity}x ${i.name}`).join(', ')}</div>}
                      {p.from_money && Object.values(p.from_money).some(v => v > 0) && (
                        <div><span className="text-green-400">+ Geld:</span> {['dukaten', 'silber', 'heller'].filter(d => p.from_money[d] > 0).map(d => `${p.from_money[d]} ${d}`).join(', ')}</div>
                      )}
                      {p.to_items?.length > 0 && <div><span className="text-orange-400">{p.to_name || 'B'} gibt:</span> {p.to_items.map(i => `${i.quantity}x ${i.name}`).join(', ')}</div>}
                      {p.to_money && Object.values(p.to_money).some(v => v > 0) && (
                        <div><span className="text-orange-400">+ Geld:</span> {['dukaten', 'silber', 'heller'].filter(d => p.to_money[d] > 0).map(d => `${p.to_money[d]} ${d}`).join(', ')}</div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Probe difficulty modal */}
      <Modal isOpen={!!probeModal} onClose={() => setProbeModal(null)} title="Probe genehmigen"
        footer={<>
          <button onClick={() => setProbeModal(null)} className="btn-ghost">Abbrechen</button>
          <button onClick={handleSendProbe} className="btn-primary flex items-center gap-1"><Send className="w-4 h-4" /> Probe senden</button>
        </>}
      >
        {probeModal && (() => {
          const p = probeModal.payload
          const bePenalty = p.encumbrance && p.be ? -Math.abs(p.be) : 0
          const totalMod = probeDifficulty + bePenalty
          return (
            <div className="space-y-4">
              <div className="bg-dsa-bg rounded-sm border border-dsa-bg-medium p-3 space-y-2">
                <p className="text-sm text-dsa-parchment">
                  <strong>{p.character_name}</strong> möchte <strong className="text-dsa-gold">{p.talent_name || p.spell_name}</strong> proben.
                </p>

                {/* Probe attributes with values */}
                {p.probe && p.probe.length > 0 && (
                  <div className="flex items-center gap-2">
                    {p.probe.map((attr, i) => {
                      const val = p.attribute_values?.[i] ?? '?'
                      const effVal = totalMod !== 0 ? Math.max(0, val + totalMod) : val
                      return (
                        <div key={i} className="flex-1 bg-dsa-bg-card border border-dsa-bg-medium rounded-sm p-2 text-center">
                          <div className="text-[9px] text-dsa-parchment-dark uppercase">{attr}</div>
                          <div className="text-lg font-mono font-bold text-dsa-parchment">{val}</div>
                          {totalMod !== 0 && (
                            <div className={`text-[10px] font-mono ${totalMod < 0 ? 'text-red-400' : 'text-green-400'}`}>
                              → {effVal}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    <div className="flex-1 bg-dsa-gold/10 border border-dsa-gold/30 rounded-sm p-2 text-center">
                      <div className="text-[9px] text-dsa-gold uppercase">FW</div>
                      <div className="text-lg font-mono font-bold text-dsa-gold">{p.fw || 0}</div>
                      <div className="text-[10px] text-dsa-parchment-dark">Puffer</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Modifier breakdown — clear step-by-step derivation */}
              <div className="bg-dsa-bg rounded-sm border border-dsa-bg-medium p-3 space-y-0">

                {/* Row 1: Basiswerte */}
                <div className="flex justify-between items-center text-xs py-1.5">
                  <span className="text-dsa-parchment">Basiswerte (Eigenschaftswerte)</span>
                  <span className="font-mono text-dsa-parchment">{(p.attribute_values || []).join(' / ') || '?'}</span>
                </div>

                {/* Row 2: Behinderung (automatic) */}
                {p.encumbrance && (
                  <div className="flex justify-between items-center text-xs py-1.5 border-t border-dsa-bg-medium/50">
                    <span className="text-dsa-parchment-dark">Behinderung (Rüstung)</span>
                    <span className={`font-mono font-bold ${bePenalty ? 'text-red-400' : 'text-dsa-parchment-dark/40'}`}>
                      {bePenalty ? bePenalty : '0'}
                    </span>
                  </div>
                )}

                {/* Row 3: Zwischenwert nach Behinderung */}
                {bePenalty !== 0 && (
                  <div className="flex justify-between items-center text-xs py-1.5 border-t border-dsa-bg-medium/50 bg-dsa-bg-card/30 px-1 -mx-1 rounded-sm">
                    <span className="text-dsa-parchment-dark">Effektive Werte nach Behinderung</span>
                    <span className="font-mono font-bold text-dsa-parchment">
                      {(p.attribute_values || []).map(v => Math.max(0, v + bePenalty)).join(' / ')}
                    </span>
                  </div>
                )}

                {/* Row 4: GM Erschwernis / Erleichterung */}
                <div className="border-t border-dsa-bg-medium/50 pt-2 mt-1">
                  <div className="text-[10px] text-dsa-parchment-dark mb-1.5">Erschwernis oder Erleichterung durch den Spielleiter</div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setProbeDifficulty(d => d - 1)} className="w-9 h-9 rounded-sm bg-red-900/20 border border-red-800/30 flex items-center justify-center text-red-400 hover:bg-red-900/30 text-lg font-bold" title="Probe erschweren (schwieriger für den Spieler)">−</button>
                    <div className="text-center flex-1">
                      <div className={`text-2xl font-mono font-bold ${probeDifficulty > 0 ? 'text-green-400' : probeDifficulty < 0 ? 'text-red-400' : 'text-dsa-parchment-dark/30'}`}>
                        {probeDifficulty > 0 ? `+${probeDifficulty}` : probeDifficulty}
                      </div>
                      <div className="text-[9px] text-dsa-parchment-dark/40">
                        {probeDifficulty > 0 ? 'Erleichtert' : probeDifficulty < 0 ? 'Erschwert' : 'Keine Anpassung'}
                      </div>
                    </div>
                    <button onClick={() => setProbeDifficulty(d => d + 1)} className="w-9 h-9 rounded-sm bg-green-900/20 border border-green-800/30 flex items-center justify-center text-green-400 hover:bg-green-900/30 text-lg font-bold" title="Probe erleichtern (einfacher für den Spieler)">+</button>
                  </div>
                </div>

                {/* Row 5: Endwerte */}
                <div className="flex justify-between items-center text-xs py-2 border-t border-dsa-gold/20 mt-2">
                  <span className="text-dsa-gold font-bold">Endwerte für die Probe</span>
                  <span className={`font-mono font-bold text-dsa-gold`}>
                    {(p.attribute_values || []).map(v => Math.max(0, v + totalMod)).join(' / ')}
                  </span>
                </div>
                <div className="text-[9px] text-dsa-parchment-dark/50 pb-1">
                  Der Spieler würfelt 3W20 gegen diese Werte. Fertigkeitswert {p.fw || 0} dient als Puffer gegen Fehlpunkte.
                  {totalMod !== 0 && ` Gesamt-Modifikator ${totalMod > 0 ? '+' : ''}${totalMod} auf alle drei Teilproben.`}
                </div>
              </div>
            </div>
          )
        })()}
      </Modal>
    </>
  )
}
