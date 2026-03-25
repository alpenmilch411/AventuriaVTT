import { Sword, Shield, Dice5, Heart, AlertTriangle, Info } from 'lucide-react'
import clsx from 'clsx'

const typeConfig = {
  attack: { icon: Sword, color: 'text-dsa-danger', label: 'Angriff' },
  defense: { icon: Shield, color: 'text-dsa-mana', label: 'Verteidigung' },
  damage: { icon: Heart, color: 'text-red-400', label: 'Schaden' },
  roll: { icon: Dice5, color: 'text-dsa-gold', label: 'Wurf' },
  system: { icon: Info, color: 'text-dsa-parchment-dark', label: 'System' },
  critical: { icon: AlertTriangle, color: 'text-dsa-warning', label: 'Kritisch' },
  fumble: { icon: AlertTriangle, color: 'text-dsa-danger', label: 'Patzer' },
}

export default function CombatLogEntry({ entry, compact = false }) {
  const { type = 'system', text, actor, target, value, timestamp } = entry
  const config = typeConfig[type] || typeConfig.system
  const Icon = config.icon

  const time = timestamp
    ? new Date(timestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    : ''

  if (compact) {
    return (
      <div className="flex items-start gap-1.5 py-1 text-xs">
        <Icon className={clsx('w-3 h-3 flex-shrink-0 mt-0.5', config.color)} />
        <span className="text-dsa-parchment-dark">
          {actor && <span className="font-semibold text-dsa-parchment">{actor}</span>}
          {' '}{text}
          {target && <span className="font-semibold text-dsa-parchment"> {target}</span>}
          {value != null && <span className="font-mono text-dsa-gold"> ({value})</span>}
        </span>
      </div>
    )
  }

  return (
    <div className={clsx(
      'flex items-start gap-2 py-2 px-3 rounded-sm',
      type === 'critical' && 'bg-dsa-warning/10',
      type === 'fumble' && 'bg-dsa-danger/10'
    )}>
      <Icon className={clsx('w-4 h-4 flex-shrink-0 mt-0.5', config.color)} />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-dsa-parchment">
          {actor && <span className="font-semibold">{actor}</span>}
          {actor && ' '}
          {text}
          {target && <span> gegen <span className="font-semibold">{target}</span></span>}
        </div>
        {value != null && (
          <span className="text-xs font-mono text-dsa-gold">Ergebnis: {value}</span>
        )}
      </div>
      {time && (
        <span className="text-[10px] text-dsa-parchment-dark/50 flex-shrink-0">{time}</span>
      )}
    </div>
  )
}
