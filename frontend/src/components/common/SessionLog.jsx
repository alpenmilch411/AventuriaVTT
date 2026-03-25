import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  Swords, Heart, Droplet, Shield, Dice5, Zap, Flag, Clock,
  Map, User, Info, Repeat, Package, AlertTriangle, Star, Sparkles,
  ChevronsDown
} from 'lucide-react'

const ICON_MAP = {
  swords: Swords,
  heart: Heart,
  droplet: Droplet,
  shield: Shield,
  dice: Dice5,
  zap: Zap,
  flag: Flag,
  clock: Clock,
  map: Map,
  user: User,
  info: Info,
  repeat: Repeat,
  package: Package,
  alert: AlertTriangle,
  star: Star,
  sparkles: Sparkles,
}

const TYPE_COLORS = {
  combat: 'text-red-400',
  damage: 'text-red-400',
  heal: 'text-green-400',
  critical: 'text-yellow-300',
  fumble: 'text-orange-400',
  dice: 'text-blue-400',
  turn: 'text-amber-400',
  scene: 'text-purple-400',
  trade: 'text-orange-400',
  connect: 'text-green-500',
  disconnect: 'text-red-500',
  defense: 'text-cyan-400',
  roll: 'text-blue-300',
  loot: 'text-amber-300',
  item_use: 'text-teal-400',
  system: 'text-neutral-400',
}

const TYPE_LABELS = {
  combat: 'KAMPF',
  damage: 'SCHADEN',
  heal: 'HEILUNG',
  critical: 'KRITISCH',
  fumble: 'PATZER',
  turn: 'RUNDE',
  scene: 'SZENE',
  roll: 'WURF',
  defense: 'VERT.',
  loot: 'BEUTE',
  item_use: 'ITEM',
  trade: 'HANDEL',
  system: 'SYS',
}

/**
 * SessionLog — Bloomberg-terminal style event log.
 *
 * Renders a monospace, dark-themed scrolling log of session events.
 * Used in both the Table view (left panel) and GM Cockpit (Steuerung > Protokoll).
 *
 * Props:
 *   entries: Array of { type, text, icon, ts, data }
 *   maxHeight: CSS max-height (default: '100%')
 *   compact: boolean — smaller text for embedded use
 */
function SessionLog({ entries = [], maxHeight = '100%', compact = false }) {
  const bottomRef = useRef(null)
  const containerRef = useRef(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const userScrolledRef = useRef(false)

  // Track scroll position to show/hide "jump to recent" button
  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    setIsAtBottom(nearBottom)
    if (!nearBottom) userScrolledRef.current = true
  }, [])

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    userScrolledRef.current = false
    setIsAtBottom(true)
  }, [])

  useEffect(() => {
    // Auto-scroll to bottom when new entries arrive, unless user scrolled up
    if (!userScrolledRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [entries.length])

  const formatTime = (ts) => {
    if (!ts) return ''
    try {
      const d = new Date(ts)
      return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    } catch { return '' }
  }

  const textSize = compact ? 'text-[10px]' : 'text-xs'
  const iconSize = compact ? 'w-3 h-3' : 'w-3.5 h-3.5'
  const tsSize = compact ? 'text-[8px]' : 'text-[10px]'
  const gap = compact ? 'gap-1' : 'gap-1.5'
  const py = compact ? 'py-0.5' : 'py-1'

  return (
    <div className="relative h-full" style={{ maxHeight }}>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="bg-black/90 rounded-sm border border-neutral-800 overflow-y-auto font-mono"
        style={{ maxHeight, height: '100%' }}
      >
        {entries.length === 0 ? (
          <div className={`${textSize} text-neutral-600 text-center py-6`}>
            Keine Eintraege.
          </div>
        ) : (
          <div className="divide-y divide-neutral-800/50">
            {entries.map((entry, i) => {
              const IconComp = ICON_MAP[entry.icon] || Info
              const color = TYPE_COLORS[entry.type] || TYPE_COLORS.system
              const label = TYPE_LABELS[entry.type] || ''
              return (
                <div key={i} className={`flex items-start ${gap} px-2.5 ${py} hover:bg-neutral-900/60 transition-colors`}>
                  <span className={`${tsSize} text-neutral-600 flex-shrink-0 w-14 pt-0.5 tabular-nums`}>
                    {formatTime(entry.ts)}
                  </span>
                  <span className={`${tsSize} ${color} flex-shrink-0 w-14 pt-0.5 font-bold opacity-60 uppercase`}>
                    {label}
                  </span>
                  <IconComp className={`${iconSize} ${color} flex-shrink-0 mt-0.5`} />
                  <span className={`${textSize} ${color} leading-relaxed break-words flex-1`}>
                    {entry.text}
                  </span>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
      {!isAtBottom && entries.length > 0 && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-2 right-3 bg-dsa-gold/90 text-black rounded-full px-2.5 py-1 text-[10px] font-bold flex items-center gap-1 shadow-lg hover:bg-dsa-gold transition animate-pulse"
        >
          <ChevronsDown className="w-3 h-3" /> Aktuell
        </button>
      )}
    </div>
  )
}

export default React.memo(SessionLog)
