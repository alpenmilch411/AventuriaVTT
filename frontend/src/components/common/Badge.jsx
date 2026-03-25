import clsx from 'clsx'

const variantClasses = {
  default: 'bg-dsa-bg-medium text-dsa-parchment-dark',
  gold: 'bg-dsa-gold/20 text-dsa-gold border border-dsa-gold/30',
  danger: 'bg-dsa-danger/20 text-red-400 border border-dsa-danger/30',
  warning: 'bg-dsa-warning/20 text-yellow-400 border border-dsa-warning/30',
  success: 'bg-dsa-success/20 text-green-400 border border-dsa-success/30',
  mana: 'bg-dsa-mana/20 text-blue-400 border border-dsa-mana/30',
  karma: 'bg-dsa-karma/20 text-purple-400 border border-dsa-karma/30',
  rust: 'bg-dsa-rust/20 text-orange-400 border border-dsa-rust/30',
  info: 'bg-blue-900/30 text-blue-300 border border-blue-700/30',
}

const sizeClasses = {
  sm: 'px-1.5 py-0.5 text-[10px]',
  md: 'px-2 py-0.5 text-xs',
  lg: 'px-3 py-1 text-sm',
}

export default function Badge({
  children,
  variant = 'default',
  size = 'md',
  className,
  onClick,
  icon: Icon,
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap',
        variantClasses[variant] || variantClasses.default,
        sizeClasses[size] || sizeClasses.md,
        onClick && 'cursor-pointer hover:opacity-80',
        className
      )}
      onClick={onClick}
    >
      {Icon && <Icon className="w-3 h-3" />}
      {children}
    </span>
  )
}
