import clsx from 'clsx'

const colorPresets = {
  health: {
    getColor: (pct) => {
      if (pct <= 0.25) return 'bg-gradient-to-r from-red-600 to-red-500'
      if (pct <= 0.5) return 'bg-gradient-to-r from-yellow-600 to-yellow-500'
      return 'bg-gradient-to-r from-green-600 to-green-500'
    },
    getGlow: (pct) => {
      if (pct <= 0.25) return 'shadow-[0_0_8px_rgba(220,38,38,0.5)]'
      if (pct <= 0.5) return 'shadow-[0_0_6px_rgba(234,179,8,0.3)]'
      return ''
    },
  },
  mana: {
    getColor: () => 'bg-gradient-to-r from-blue-500 to-blue-600',
    getGlow: () => '',
  },
  karma: {
    getColor: () => 'bg-gradient-to-r from-purple-400 to-purple-600',
    getGlow: () => '',
  },
  gold: {
    getColor: () => 'bg-gradient-to-r from-amber-400 to-amber-600',
    getGlow: () => '',
  },
}

export default function ProgressBar({
  current,
  value,
  max,
  label,
  preset = 'health',
  variant,
  showValues = true,
  size = 'md',
  className,
  pulse = false,
}) {
  // Support both 'current' and legacy 'value' prop names
  const actualCurrent = current ?? value ?? 0
  // Support both 'preset' and legacy 'variant' prop names
  const actualPreset = variant || preset
  const pct = max > 0 ? Math.max(0, Math.min(1, actualCurrent / max)) : 0
  const colorConfig = colorPresets[actualPreset] || colorPresets.health
  const barColor = colorConfig.getColor(pct)
  const barGlow = colorConfig.getGlow ? colorConfig.getGlow(pct) : ''

  const sizeClasses = {
    sm: 'h-2.5',
    md: 'h-5',
    lg: 'h-7',
  }

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  }

  return (
    <div className={clsx('w-full', className)}>
      {(label || showValues) && (
        <div className="flex justify-between items-center mb-1">
          {label && (
            <span className={clsx(
              'font-medium text-dsa-parchment-dark',
              textSizeClasses[size] || 'text-sm'
            )}>{label}</span>
          )}
          {showValues && (
            <span className={clsx(
              'font-mono tabular-nums',
              textSizeClasses[size] || 'text-sm',
              pct <= 0.25 && actualPreset === 'health' ? 'text-red-400 font-bold' : 'text-dsa-parchment'
            )}>
              {actualCurrent}/{max}
            </span>
          )}
        </div>
      )}
      <div className={clsx(
        'w-full rounded-full overflow-hidden relative',
        'bg-dsa-bg shadow-inner shadow-black/40',
        'border border-dsa-bg-medium/50',
        sizeClasses[size] || sizeClasses.md,
      )}>
        {/* Inner shadow overlay */}
        <div className="absolute inset-0 rounded-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] pointer-events-none z-10" />
        {/* Fill bar */}
        <div
          className={clsx(
            'h-full rounded-full transition-all duration-700 ease-out relative',
            barColor,
            barGlow,
            pulse && pct <= 0.25 && 'animate-pulse-red',
          )}
          style={{ width: `${pct * 100}%` }}
        >
          {/* Glossy highlight on the bar */}
          {pct > 0.05 && (
            <div className="absolute inset-x-0 top-0 h-[40%] bg-gradient-to-b from-white/15 to-transparent rounded-full" />
          )}
        </div>
      </div>
    </div>
  )
}
