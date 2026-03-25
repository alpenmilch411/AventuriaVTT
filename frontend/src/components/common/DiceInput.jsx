import { useState } from 'react'
import { Dice5, Check, X } from 'lucide-react'
import clsx from 'clsx'

export default function DiceInput({
  label = 'Würfle 1W20',
  targetValue,
  modifiers = [],
  onSubmit,
  onCancel,
  showNumpad = true,
}) {
  const [value, setValue] = useState('')

  const totalMod = modifiers.reduce((sum, m) => sum + m.value, 0)
  const effectiveTarget = targetValue != null ? targetValue + totalMod : null

  const handleNumpad = (num) => {
    if (num === 'clear') {
      setValue('')
    } else if (num === 'back') {
      setValue(v => v.slice(0, -1))
    } else {
      setValue(v => {
        const newVal = v + String(num)
        return parseInt(newVal) <= 20 ? newVal : v
      })
    }
  }

  const handleSubmit = () => {
    const numVal = parseInt(value)
    if (isNaN(numVal) || numVal < 1) return
    onSubmit?.(numVal)
  }

  const numpadButtons = [1, 2, 3, 4, 5, 6, 7, 8, 9, 'clear', 0, 'back']

  return (
    <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded p-4 animate-slide-up">
      {/* Label */}
      <div className="text-center mb-4">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Dice5 className="w-5 h-5 text-dsa-gold" />
          <span className="text-lg font-display font-semibold text-dsa-gold">{label}</span>
        </div>
        {effectiveTarget != null && (
          <div className="text-sm text-dsa-parchment-dark">
            Zielwert: <span className="font-mono font-bold text-dsa-parchment">{effectiveTarget}</span>
          </div>
        )}
      </div>

      {/* Modifier breakdown */}
      {modifiers.length > 0 && (
        <div className="mb-4 space-y-1">
          {modifiers.map((mod, idx) => (
            <div key={idx} className="flex justify-between text-xs text-dsa-parchment-dark">
              <span>{mod.label}</span>
              <span className={clsx(
                'font-mono',
                mod.value > 0 && 'text-dsa-success',
                mod.value < 0 && 'text-dsa-danger'
              )}>
                {mod.value > 0 ? '+' : ''}{mod.value}
              </span>
            </div>
          ))}
          <div className="border-t border-dsa-bg-medium pt-1 flex justify-between text-xs font-semibold">
            <span>Gesamt-Modifikator</span>
            <span className="font-mono">{totalMod > 0 ? '+' : ''}{totalMod}</span>
          </div>
        </div>
      )}

      {/* Value display */}
      <div className="text-center mb-4">
        <div className={clsx(
          'inline-flex items-center justify-center w-24 h-16 rounded-sm border-2 text-3xl font-mono font-bold transition-colors',
          value
            ? 'border-dsa-gold text-dsa-parchment bg-dsa-bg'
            : 'border-dsa-bg-medium text-dsa-parchment-dark/30 bg-dsa-bg'
        )}>
          {value || '--'}
        </div>
      </div>

      {/* Numpad */}
      {showNumpad && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {numpadButtons.map((btn) => (
            <button
              key={btn}
              onClick={() => handleNumpad(btn)}
              className={clsx(
                'py-3 rounded-sm text-lg font-semibold transition-colors',
                btn === 'clear'
                  ? 'bg-dsa-bg text-dsa-parchment-dark hover:bg-dsa-bg-medium text-sm'
                  : btn === 'back'
                  ? 'bg-dsa-bg text-dsa-parchment-dark hover:bg-dsa-bg-medium text-sm'
                  : 'bg-dsa-bg-medium text-dsa-parchment hover:bg-dsa-bg-card active:bg-dsa-gold/20'
              )}
            >
              {btn === 'clear' ? 'C' : btn === 'back' ? '<' : btn}
            </button>
          ))}
        </div>
      )}

      {/* Text input fallback */}
      {!showNumpad && (
        <div className="mb-4">
          <input
            type="number"
            min="1"
            max="20"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Ergebnis eingeben"
            className="input-field text-center text-2xl font-mono"
            autoFocus
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {onCancel && (
          <button onClick={onCancel} className="btn-ghost flex-1 flex items-center justify-center gap-2">
            <X className="w-4 h-4" />
            Abbrechen
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={!value || parseInt(value) < 1}
          className="btn-primary flex-1 flex items-center justify-center gap-2"
        >
          <Check className="w-4 h-4" />
          Bestätigen
        </button>
      </div>
    </div>
  )
}
