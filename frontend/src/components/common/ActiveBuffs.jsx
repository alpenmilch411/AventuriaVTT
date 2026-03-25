import { useState, useEffect } from 'react'
import { Sparkles, X } from 'lucide-react'
import useCharacterStore from '../../stores/characterStore'
import { formatRemaining, isBuffActive } from '../../engine/buffSystem'
import clsx from 'clsx'

/**
 * ActiveBuffs — Shows active temporary buffs for a character.
 *
 * Props:
 *   characterId: string — which character's buffs to show
 *   compact: boolean — smaller display for combat UI
 *   onRemove: (buffId) => void — optional callback to remove a buff early
 */
export default function ActiveBuffs({ characterId, compact = false, onRemove }) {
  const activeBuffs = useCharacterStore((s) => s.activeBuffs)
  const pruneExpiredBuffs = useCharacterStore((s) => s.pruneExpiredBuffs)
  const [, forceUpdate] = useState(0)

  // Tick every 10 seconds to update remaining time and prune expired
  useEffect(() => {
    const interval = setInterval(() => {
      pruneExpiredBuffs()
      forceUpdate(n => n + 1)
    }, 10000)
    return () => clearInterval(interval)
  }, [])

  const buffs = activeBuffs.filter(b => b.characterId === characterId && isBuffActive(b))

  if (buffs.length === 0) return null

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1">
        {buffs.map(b => (
          <span
            key={b.id}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-purple-900/30 border border-purple-800/30 text-[9px] text-purple-300"
            title={`${b.source}: +${b.value} ${b.stat} (${formatRemaining(b)})`}
          >
            <Sparkles className="w-2.5 h-2.5" />
            +{b.value} {b.stat}
            <span className="text-purple-400/50 ml-0.5">{formatRemaining(b)}</span>
          </span>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <h4 className="text-[10px] text-purple-400 uppercase tracking-wider flex items-center gap-1">
        <Sparkles className="w-3 h-3" /> Aktive Effekte
      </h4>
      {buffs.map(b => (
        <div key={b.id} className="flex items-center justify-between px-2 py-1.5 bg-purple-900/10 border border-purple-900/20 rounded-sm">
          <div>
            <span className="text-xs text-purple-300 font-semibold">+{b.value} {b.stat}</span>
            <span className="text-[9px] text-purple-400/60 ml-2">{b.source}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={clsx(
              'text-[10px] font-mono',
              remainingMinutes(b) <= 5 ? 'text-red-400 animate-pulse' : 'text-purple-400/70'
            )}>
              {formatRemaining(b)}
            </span>
            {onRemove && (
              <button onClick={() => onRemove(b.id)} className="text-purple-400/30 hover:text-red-400">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function remainingMinutes(buff) {
  return Math.max(0, Math.floor((buff.expiresAt - Date.now()) / 60000))
}
