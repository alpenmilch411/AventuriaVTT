import { useState, useRef, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import clsx from 'clsx'

export default function SearchInput({
  placeholder = 'Suchen...',
  value,
  onChange,
  options = [],
  onSelect,
  className,
  renderOption,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [localValue, setLocalValue] = useState(value || '')
  const inputRef = useRef(null)
  const dropdownRef = useRef(null)

  const controlledValue = value !== undefined ? value : localValue
  const handleChange = (v) => {
    if (value === undefined) setLocalValue(v)
    onChange?.(v)
  }

  const filteredOptions = options.filter((opt) => {
    const label = typeof opt === 'string' ? opt : opt.label || opt.name || ''
    return label.toLowerCase().includes(controlledValue.toLowerCase())
  })

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        inputRef.current && !inputRef.current.contains(e.target)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className={clsx('relative', className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dsa-parchment-dark/50" />
        <input
          ref={inputRef}
          type="text"
          value={controlledValue}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="input-field pl-9 pr-8"
        />
        {controlledValue && (
          <button
            onClick={() => { handleChange(''); setIsOpen(false) }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-dsa-parchment-dark/50 hover:text-dsa-parchment"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {isOpen && filteredOptions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-dsa-bg-card border border-dsa-bg-medium rounded-sm shadow-xl max-h-60 overflow-y-auto"
        >
          {filteredOptions.map((opt, idx) => {
            const label = typeof opt === 'string' ? opt : opt.label || opt.name || ''
            return (
              <button
                key={idx}
                className="w-full text-left px-3 py-2 text-sm text-dsa-parchment hover:bg-dsa-bg-medium transition-colors first:rounded-t-lg last:rounded-b-lg"
                onClick={() => {
                  onSelect?.(opt)
                  setIsOpen(false)
                }}
              >
                {renderOption ? renderOption(opt) : label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
