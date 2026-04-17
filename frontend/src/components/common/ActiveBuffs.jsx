import { useState, useEffect, useRef } from 'react'
import { Sparkles, X, Clock, Pencil } from 'lucide-react'
import useCharacterStore from '../../stores/characterStore'
import { isBuffActive } from '../../engine/buffSystem'
import clsx from 'clsx'

/**
 * Shared 1 Hz ticker. One component-level interval drives the countdown for
 * every visible buff pill / card — previously each pill created its own
 * setInterval (mild CPU/battery cost during combat on phones).
 * `now` resets when the component unmounts.
 */
function useNowTick() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

/**
 * Fire buff_remove exactly once when a buff expires locally.
 * Parent drives the shared `now`; child only decides whether to fire.
 */
function useBuffExpiryFire(buff, now, sendMessage) {
  const firedRef = useRef(false)
  useEffect(() => {
    if (firedRef.current) return
    if (!buff.expiresAt || buff.expiresAt > now) return
    firedRef.current = true
    sendMessage?.({
      type: 'buff_remove',
      payload: { character_id: buff.characterId, buff_id: buff.id },
    })
  }, [buff.expiresAt, buff.id, buff.characterId, now, sendMessage])
}

/** Single buff pill with live countdown (compact VitalsBar view). */
function BuffPill({ buff, now, sendMessage }) {
  useBuffExpiryFire(buff, now, sendMessage)
  const remaining = buff.expiresAt - now
  if (remaining <= 0) return null

  const isPositive = (buff.value || 0) > 0
  const isLow = remaining < 5 * 60 * 1000
  const sign = isPositive ? '+' : ''
  const sec = Math.max(0, Math.floor(remaining / 1000))
  const min = Math.floor(sec / 60)
  const timeStr = sec < 60 ? `${sec}s` : min < 60 ? `${min}m ${sec % 60}s` : `${Math.floor(min / 60)}h ${min % 60}m`

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] border',
        isPositive
          ? 'bg-dsa-gold/10 border-dsa-gold/30 text-dsa-gold'
          : 'bg-dsa-mana/10 border-dsa-mana/30 text-dsa-mana',
      )}
      title={`${buff.source}: ${sign}${buff.value} ${buff.stat} (${timeStr})`}
    >
      <Sparkles className="w-2.5 h-2.5" />
      {sign}{buff.value} {buff.stat}
      <span className={clsx('ml-0.5', isLow ? 'text-red-400 animate-pulse' : 'opacity-50')}>{timeStr}</span>
    </span>
  )
}

/** Detailed buff card for CharacterSheet / GM detail view. */
function BuffCard({ buff, now, onRemove, onEdit, sendMessage }) {
  useBuffExpiryFire(buff, now, sendMessage)
  const remaining = buff.expiresAt - now
  if (remaining <= 0) return null

  const isPositive = (buff.value || 0) > 0
  const sign = isPositive ? '+' : ''
  const totalDuration = (buff.durationMinutes || 60) * 60 * 1000
  const pct = Math.max(0, Math.min(100, (remaining / totalDuration) * 100))
  const isLow = remaining < 5 * 60 * 1000
  const sec = Math.max(0, Math.floor(remaining / 1000))
  const min = Math.floor(sec / 60)
  const hrs = Math.floor(min / 60)
  const timeStr = hrs > 0 ? `${hrs}h ${min % 60}m ${sec % 60}s` : min > 0 ? `${min}m ${sec % 60}s` : `${sec}s`

  return (
    <div className={clsx(
      'border rounded-sm p-2.5 relative overflow-hidden',
      isPositive ? 'bg-dsa-gold/5 border-dsa-gold/20' : 'bg-dsa-mana/5 border-dsa-mana/20',
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Sparkles className={clsx('w-3.5 h-3.5 flex-shrink-0', isPositive ? 'text-dsa-gold' : 'text-dsa-mana')} />
            <span className={clsx('text-xs font-bold', isPositive ? 'text-dsa-gold' : 'text-dsa-mana')}>
              {sign}{buff.value} {buff.stat}
            </span>
          </div>
          <div className="text-[10px] text-dsa-parchment-dark/60 mt-0.5 truncate">{buff.source}</div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <div className="flex items-center gap-1">
            <Clock className={clsx('w-3 h-3', isLow ? 'text-red-400' : 'text-dsa-parchment-dark/40')} />
            <span className={clsx(
              'text-[10px] font-mono',
              isLow ? 'text-red-400 animate-pulse' : isPositive ? 'text-dsa-gold/70' : 'text-dsa-mana/70',
            )}>
              {timeStr}
            </span>
          </div>
          {onEdit && (
            <button onClick={() => onEdit(buff)} className="text-dsa-parchment-dark/30 hover:text-dsa-gold p-0.5">
              <Pencil className="w-3 h-3" />
            </button>
          )}
          {onRemove && (
            <button onClick={() => onRemove(buff.id)} className="text-dsa-parchment-dark/30 hover:text-red-400 p-0.5">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      <div className="mt-1.5 h-1 rounded-full bg-dsa-bg-medium/50 overflow-hidden">
        <div
          className={clsx(
            'h-full rounded-full transition-all duration-1000',
            isLow ? 'bg-red-500' : pct > 50 ? (isPositive ? 'bg-dsa-gold/60' : 'bg-dsa-mana/60') : 'bg-amber-500/60',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

/**
 * ActiveBuffs — Shows active temporary buffs for a character.
 *
 * Props:
 *   characterId: string — which character's buffs to show
 *   compact: boolean — small pills for VitalsBar
 *   detailed: boolean — full cards with progress bars for CharacterSheet
 *   onRemove: (buffId) => void — optional callback to remove a buff early
 *   onEdit: (buff) => void — optional callback to edit a buff (GM only)
 *   sendMessage: (msg) => void — WS send function for auto-expiry
 */
export default function ActiveBuffs({ characterId, compact = false, detailed = false, onRemove, onEdit, sendMessage }) {
  const activeBuffs = useCharacterStore((s) => s.activeBuffs)
  const now = useNowTick()

  const buffs = activeBuffs.filter(b => b.characterId === characterId && isBuffActive(b))

  if (buffs.length === 0) return null

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1">
        {buffs.map(b => (
          <BuffPill key={b.id} buff={b} now={now} sendMessage={sendMessage} />
        ))}
      </div>
    )
  }

  // detailed + default both render BuffCards
  return (
    <div className="space-y-1.5">
      {buffs.map(b => (
        <BuffCard key={b.id} buff={b} now={now} onRemove={onRemove} onEdit={onEdit} sendMessage={sendMessage} />
      ))}
    </div>
  )
}
