import React, { useState } from 'react'
import { Star, Dice6, Shield, Swords, RotateCcw, X } from 'lucide-react'
import useCharacterStore from '../../stores/characterStore'
import clsx from 'clsx'

const SCHIP_USAGES = [
  { id: 'reroll', icon: Dice6, label: 'Probe wiederholen', desc: 'Einen Wurf sofort wiederholen.' },
  { id: 'defense_boost', icon: Shield, label: 'Verteidigung stärken', desc: '+4 auf die nächste Verteidigung.' },
  { id: 'halve_damage', icon: Swords, label: 'Schaden halbieren', desc: 'Den letzten erlittenen Schaden halbieren.' },
  { id: 'ignore_condition', icon: RotateCcw, label: 'Zustand ignorieren', desc: 'Einen Zustand 1 Runde lang ignorieren.' },
]

function SchipMenu({ sendMessage, onClose, characterId }) {
  const getVitals = useCharacterStore((s) => s.getVitals)
  const conditions = useCharacterStore((s) => s.myCharacter?.conditions || [])
  const updateVitals = useCharacterStore((s) => s.updateVitals)
  const vitals = getVitals()
  const [pickCondition, setPickCondition] = useState(false)
  const [spent, setSpent] = useState(null) // flash feedback

  const charId = characterId || useCharacterStore.getState().myCharacter?.id

  const handleUse = (usage, condition) => {
    if (vitals.schip <= 0) return
    sendMessage?.({
      type: 'schip_use',
      payload: {
        character_id: charId,
        usage,
        ...(condition ? { condition } : {}),
      },
    })
    // Optimistic deduct
    updateVitals({ schip: Math.max(0, vitals.schip - 1) })
    setSpent(usage)
    setTimeout(() => {
      setSpent(null)
      onClose?.()
    }, 1200)
  }

  if (vitals.schip <= 0) return null

  // Condition sub-picker
  if (pickCondition) {
    const activeConditions = conditions.filter(c => (c.level || 1) > 0)
    return (
      <div className="bg-dsa-bg-card border border-dsa-gold/20 rounded-sm p-3 space-y-2 animate-fade-in">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-dsa-gold uppercase tracking-wider">Zustand wählen</span>
          <button onClick={() => setPickCondition(false)} className="text-dsa-parchment-dark hover:text-dsa-parchment">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        {activeConditions.length === 0 ? (
          <p className="text-[10px] text-dsa-parchment-dark">Keine aktiven Zustände.</p>
        ) : (
          <div className="space-y-1">
            {activeConditions.map((cond, i) => (
              <button
                key={i}
                onClick={() => handleUse('ignore_condition', cond.name)}
                className="w-full text-left px-2 py-1.5 bg-dsa-bg border border-dsa-bg-medium rounded-sm hover:border-dsa-gold/30 transition text-xs text-dsa-parchment"
              >
                {cond.name}{cond.level > 1 ? ` ${cond.level}` : ''} — 1 Runde ignorieren
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Spent flash
  if (spent) {
    const usageLabel = SCHIP_USAGES.find(u => u.id === spent)?.label || spent
    return (
      <div className="bg-dsa-gold/10 border border-dsa-gold/30 rounded-sm p-3 text-center animate-fade-in">
        <Star className="w-5 h-5 text-dsa-gold mx-auto mb-1 animate-pulse" />
        <p className="text-xs text-dsa-gold font-semibold">{usageLabel}</p>
        <p className="text-[10px] text-dsa-parchment-dark mt-0.5">{vitals.schip} SchiP verbleibend</p>
      </div>
    )
  }

  return (
    <div className="bg-dsa-bg-card border border-dsa-gold/20 rounded-sm p-3 space-y-2 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Star className="w-3.5 h-3.5 text-dsa-gold" />
          <span className="text-[10px] font-semibold text-dsa-gold uppercase tracking-wider">
            Schicksalspunkt einsetzen
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex gap-0.5">
            {Array.from({ length: vitals.schipMax }, (_, i) => (
              <div
                key={i}
                className={clsx(
                  'w-2 h-2 rounded-sm transition-all',
                  i < vitals.schip
                    ? 'bg-dsa-gold shadow-[0_0_4px_rgba(201,168,76,0.4)]'
                    : 'bg-dsa-bg-medium/60'
                )}
              />
            ))}
          </div>
          {onClose && (
            <button onClick={onClose} className="text-dsa-parchment-dark hover:text-dsa-parchment ml-1">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="space-y-1">
        {SCHIP_USAGES.map(({ id, icon: Icon, label, desc }) => (
          <button
            key={id}
            onClick={() => {
              if (id === 'ignore_condition') {
                setPickCondition(true)
              } else {
                handleUse(id)
              }
            }}
            className="w-full flex items-center gap-2 px-2 py-1.5 bg-dsa-bg border border-dsa-bg-medium rounded-sm hover:border-dsa-gold/20 transition-colors text-left active:scale-[0.98]"
          >
            <Icon className="w-3.5 h-3.5 text-dsa-gold flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-xs text-dsa-parchment font-medium">{label}</span>
              <p className="text-[9px] text-dsa-parchment-dark leading-tight">{desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

export default React.memo(SchipMenu)
