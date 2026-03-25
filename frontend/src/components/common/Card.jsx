import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import clsx from 'clsx'

export default function Card({
  title,
  children,
  collapsible = false,
  defaultOpen = true,
  className,
  headerRight,
  icon: Icon,
  variant = 'default',
  onClick,
  active = false,
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  const variantClasses = {
    default: 'bg-dsa-bg-card border-dsa-bg-medium',
    highlighted: 'bg-dsa-bg-card border-dsa-gold/30',
    danger: 'bg-dsa-bg-card border-dsa-danger/30',
    transparent: 'bg-transparent border-transparent',
  }

  return (
    <div
      className={clsx(
        'border rounded overflow-hidden transition-colors duration-200',
        variantClasses[variant] || variantClasses.default,
        active && 'ring-1 ring-dsa-gold shadow-lg shadow-dsa-gold/10',
        onClick && 'cursor-pointer hover:border-dsa-gold/50',
        className
      )}
      onClick={onClick}
    >
      {title && (
        <div
          className={clsx(
            'flex items-center justify-between px-4 py-3',
            collapsible && 'cursor-pointer hover:bg-dsa-bg-medium/50',
            (children || collapsible) && 'border-b border-dsa-bg-medium'
          )}
          onClick={collapsible ? (e) => { e.stopPropagation(); setIsOpen(!isOpen) } : undefined}
        >
          <div className="flex items-center gap-2">
            {Icon && <Icon className="w-4 h-4 text-dsa-gold" />}
            <h3 className="text-sm font-semibold text-dsa-parchment">{title}</h3>
          </div>
          <div className="flex items-center gap-2">
            {headerRight}
            {collapsible && (
              isOpen
                ? <ChevronUp className="w-4 h-4 text-dsa-parchment-dark" />
                : <ChevronDown className="w-4 h-4 text-dsa-parchment-dark" />
            )}
          </div>
        </div>
      )}
      {(!collapsible || isOpen) && children && (
        <div className="p-4">
          {children}
        </div>
      )}
    </div>
  )
}
