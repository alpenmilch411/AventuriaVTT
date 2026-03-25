import { useRef } from 'react'
import { Swords } from 'lucide-react'
import ProgressBar from './ProgressBar'
import Badge from './Badge'
import clsx from 'clsx'

export default function InitiativeBar({
  combatants = [],
  currentIndex = 0,
  onSelect,
  onReorder,
  draggable = false,
  compact = false,
}) {
  const scrollRef = useRef(null)

  const handleDragStart = (e, idx) => {
    if (!draggable) return
    e.dataTransfer.setData('text/plain', idx.toString())
  }

  const handleDrop = (e, targetIdx) => {
    if (!draggable) return
    e.preventDefault()
    const sourceIdx = parseInt(e.dataTransfer.getData('text/plain'))
    if (sourceIdx === targetIdx) return
    const newOrder = [...combatants]
    const [moved] = newOrder.splice(sourceIdx, 1)
    newOrder.splice(targetIdx, 0, moved)
    onReorder?.(newOrder)
  }

  const handleDragOver = (e) => {
    if (!draggable) return
    e.preventDefault()
  }

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin"
        style={{ scrollbarWidth: 'thin' }}
      >
        {combatants.map((combatant, idx) => {
          const isActive = idx === currentIndex
          const lepPct = combatant.lepMax > 0
            ? combatant.lep / combatant.lepMax
            : 1

          return (
            <div
              key={combatant.id}
              draggable={draggable}
              onDragStart={(e) => handleDragStart(e, idx)}
              onDrop={(e) => handleDrop(e, idx)}
              onDragOver={handleDragOver}
              onClick={() => onSelect?.(combatant)}
              className={clsx(
                'flex-shrink-0 rounded-sm border p-2 transition-all cursor-pointer',
                compact ? 'w-20' : 'w-28',
                isActive
                  ? 'border-dsa-gold bg-dsa-gold/10 animate-glow-gold'
                  : 'border-dsa-bg-medium bg-dsa-bg-card hover:border-dsa-gold/30',
                combatant.isNPC && 'border-dsa-rust/50',
                lepPct <= 0 && 'opacity-40'
              )}
            >
              {/* Initiative number */}
              <div className="flex items-center justify-between mb-1">
                <span className={clsx(
                  'text-[10px] font-mono',
                  isActive ? 'text-dsa-gold' : 'text-dsa-parchment-dark'
                )}>
                  INI {combatant.initiative}
                </span>
                {isActive && (
                  <Swords className="w-3 h-3 text-dsa-gold" />
                )}
              </div>

              {/* Name */}
              <div className={clsx(
                'text-xs font-semibold truncate mb-1',
                isActive ? 'text-dsa-gold' : 'text-dsa-parchment'
              )}>
                {combatant.name}
              </div>

              {/* LeP bar */}
              <ProgressBar
                current={combatant.lep || 0}
                max={combatant.lepMax || 1}
                preset="health"
                size="sm"
                showValues={!compact}
              />

              {/* Conditions */}
              {!compact && combatant.conditions?.length > 0 && (
                <div className="flex flex-wrap gap-0.5 mt-1">
                  {combatant.conditions.slice(0, 2).map((c, i) => (
                    <Badge key={i} size="sm" variant="danger">
                      {typeof c === 'string' ? c.slice(0, 3) : c.name?.slice(0, 3)}
                    </Badge>
                  ))}
                  {combatant.conditions.length > 2 && (
                    <Badge size="sm" variant="default">+{combatant.conditions.length - 2}</Badge>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
