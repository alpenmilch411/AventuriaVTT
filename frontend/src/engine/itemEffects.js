/**
 * Item Effect Resolution Engine
 *
 * Takes an item's `effects` object (from the databank ItemTemplate)
 * and resolves it into concrete game actions.
 *
 * Usage:
 *   const result = resolveItemEffect(item, { user, target, allCombatants })
 *   // result = { type, description, actions: [...] }
 *
 * Action types returned:
 *   { type: 'heal',        target, formula, roll? }
 *   { type: 'restore',     target, resource: 'asp'|'kap', formula }
 *   { type: 'damage',      target, formula, damageType }
 *   { type: 'buff',        target, stat, value, durationMinutes }
 *   { type: 'condition',   target, condition, action: 'add'|'remove', level? }
 *   { type: 'probe_bonus', talent, value }
 *   { type: 'utility',     description }
 */

// Dice formula roller: "1W6+2" → random number
export function rollFormula(formula) {
  if (typeof formula === 'number') return formula
  if (!formula || typeof formula !== 'string') return 0
  const m = formula.match(/(\d+)[Ww](\d+)([+-]\d+)?/)
  if (!m) return parseInt(formula) || 0
  const count = parseInt(m[1])
  const sides = parseInt(m[2])
  const bonus = parseInt(m[3] || '0')
  let total = bonus
  const rolls = []
  for (let i = 0; i < count; i++) {
    const r = Math.floor(Math.random() * sides) + 1
    rolls.push(r)
    total += r
  }
  return { total: Math.max(0, total), rolls, formula }
}

/**
 * Classify an item into an effect category based on its effects object.
 * Returns: 'heal' | 'restore' | 'damage' | 'buff' | 'condition' | 'poison' | 'probe_bonus' | 'utility' | 'none'
 */
export function classifyItem(effects) {
  if (!effects) return 'none'
  if (effects.probe_bonus) return 'probe_bonus'
  if (effects.condition_remove) return 'condition'
  if (effects.heal_per_rest) return 'buff'
  if (effects.restraint || effects.trap_damage) return 'utility'
  if (effects.carry_bonus || effects.shelter_persons || effects.warmth_bonus) return 'utility'
  if (effects.utility_action) return 'utility'
  if (effects.material) return 'utility'
  if (effects.heal_lep) return 'heal'
  if (effects.restore_asp || effects.asp_restore || effects.restore_kap || effects.kap_restore) return 'restore'
  if (effects.fire_damage || effects.holy_damage) return 'damage'
  if (effects.stun_damage || effects.smoke_cloud) return 'damage' // combat throwables
  if (effects.type === 'gift') return 'poison'
  if (effects.ge_bonus || effects.kk_bonus || effects.kl_bonus || effects.in_bonus ||
      effects.mu_bonus || effects.courage_bonus || effects.fire_resistance) return 'buff'
  if (effects.remove_betaeubung || effects.sleep || effects.charm ||
      effects.pain_relief || effects.cure_poison || effects.cure_disease ||
      effects.condition_add) return 'condition'
  return 'utility'
}

/**
 * Determine if this item needs a target to use.
 */
export function needsTarget(effects) {
  if (!effects) return false
  const cls = classifyItem(effects)
  return cls === 'damage' || cls === 'poison'
}

/**
 * Determine if this item needs a dice roll.
 */
export function needsRoll(effects) {
  if (!effects) return false
  if (effects.heal_lep && typeof effects.heal_lep === 'string' && effects.heal_lep.includes('W')) return true
  if (effects.restore_asp && typeof effects.restore_asp === 'string' && effects.restore_asp.includes('W')) return true
  if (effects.asp_restore && typeof effects.asp_restore === 'string' && effects.asp_restore.includes('W')) return true
  if (effects.restore_kap && typeof effects.restore_kap === 'string' && effects.restore_kap.includes('W')) return true
  if (effects.kap_restore && typeof effects.kap_restore === 'string' && effects.kap_restore.includes('W')) return true
  if (effects.fire_damage && typeof effects.fire_damage === 'string' && effects.fire_damage.includes('W')) return true
  if (effects.holy_damage && typeof effects.holy_damage === 'string' && effects.holy_damage.includes('W')) return true
  if (effects.trap_damage && typeof effects.trap_damage === 'string' && effects.trap_damage.includes('W')) return true
  return false
}

/**
 * Resolve an item's effects into a structured description of what will happen.
 * Does NOT roll dice or apply effects — that's the GM/player's job.
 *
 * Returns info the UI needs: what to show, whether targets/rolls are needed,
 * what the formula is, and what actions to perform once rolls are entered.
 *
 * @param {object} item - { name, effects, category, ... }
 * @returns {{ description, diceFormula?, isAoE, radius?, needsTarget, steps: [] }}
 */
export function resolveItemEffect(item) {
  const effects = item.effects || {}
  const cls = classifyItem(effects)
  const isHerb = (item.category || '').toLowerCase() === 'heilkraut'
  const result = {
    itemName: item.name,
    category: cls,
    description: '',
    diceFormula: null,     // e.g. "1W6+2" — GM/player rolls this
    isAoE: false,
    radius: null,
    needsTarget: needsTarget(effects),
    consumed: item.consumable !== false,
    effectSummary: '',     // short text for log after roll
    steps: [],             // what to do after roll: [{ type, ... }]
    // Herbs require a Heilkunde probe before effect applies
    requiresProbe: isHerb,
    probeSkill: isHerb ? (effects.antitoxin ? 'Heilkunde Gift' : effects.fever_reduction ? 'Heilkunde Krankheiten' : 'Heilkunde Wunden') : null,
  }

  switch (cls) {
    case 'probe_bonus': {
      const pb = effects.probe_bonus
      result.description = `${item.name}: +${pb.value} auf ${pb.talent}`
      if (pb.applies_to) result.description += ` (${pb.applies_to})`
      result.effectSummary = `+${pb.value} ${pb.talent}`
      result.steps = [{ type: 'probe_bonus', talent: pb.talent, value: pb.value }]
      break
    }

    case 'heal': {
      const formula = effects.heal_lep
      result.diceFormula = formula
      result.description = `${item.name}: Heilt ${formula} LeP`
      result.effectSummary = `heilt {value} LeP`
      result.steps = [{ type: 'heal', target: 'self', resource: 'lep' }]
      if (effects.bleeding_stop) {
        result.steps.push({ type: 'condition', target: 'self', condition: 'Blutend', action: 'remove' })
        result.description += ', stoppt Blutungen'
      }
      break
    }

    case 'restore': {
      const aspFormula = effects.restore_asp || effects.asp_restore
      const kapFormula = effects.restore_kap || effects.kap_restore
      if (aspFormula) {
        result.diceFormula = aspFormula
        result.description = `${item.name}: Stellt ${aspFormula} AsP wieder her`
        result.effectSummary = `stellt {value} AsP wieder her`
        result.steps = [{ type: 'restore', target: 'self', resource: 'asp' }]
      }
      if (kapFormula) {
        result.diceFormula = kapFormula
        result.description = `${item.name}: Stellt ${kapFormula} KaP wieder her`
        result.effectSummary = `stellt {value} KaP wieder her`
        result.steps = [{ type: 'restore', target: 'self', resource: 'kap' }]
      }
      break
    }

    case 'damage': {
      // Smoke cloud (Raucherbombe) — no damage, applies Verblendet-like effect
      if (effects.smoke_cloud) {
        result.needsTarget = true
        result.isAoE = true
        result.radius = effects.radius || 3
        result.description = `${item.name}: Rauchbombe — Sicht blockiert im Radius ${result.radius} Schritt für ${effects.duration_rounds || 5} KR`
        if (effects.detail) result.description += `. ${effects.detail}`
        result.effectSummary = 'Rauchwolke erzeugt'
        result.steps = [{ type: 'smoke', durationRounds: effects.duration_rounds || 5 }]
        break
      }
      // Stun damage (Donnerball) — no dice, condition-based
      if (effects.stun_damage === true) {
        result.needsTarget = true
        result.isAoE = !!effects.radius
        result.radius = effects.radius || null
        result.description = `${item.name}: Alle im Radius${result.radius ? ` ${result.radius} Schritt` : ''} — KO-Probe oder Betäubung`
        if (effects.detail) result.description += `. ${effects.detail}`
        result.effectSummary = 'Betäubung'
        result.steps = [{ type: 'stun', durationRounds: effects.duration_rounds || 1 }]
        break
      }
      const dmgFormula = effects.fire_damage || effects.holy_damage || (typeof effects.stun_damage === 'string' ? effects.stun_damage : null)
      const dmgType = effects.fire_damage ? 'Feuer' : effects.holy_damage ? 'Heilig' : 'Betäubung'
      result.diceFormula = typeof dmgFormula === 'string' ? dmgFormula : null
      result.needsTarget = true
      result.isAoE = !!effects.radius
      result.radius = effects.radius || null
      result.description = `${item.name}: ${dmgFormula || 'Schaden'} (${dmgType})`
      if (result.isAoE) result.description += ` — Radius ${result.radius} Schritt (alle Ziele im Bereich)`
      if (effects.detail) result.description += `. ${effects.detail}`
      result.effectSummary = `verursacht {value} ${dmgType}-SP`
      result.steps = [{ type: 'damage', damageType: dmgType }]
      break
    }

    case 'buff': {
      if (effects.heal_per_rest) {
        const days = effects.duration_days || 1
        result.description = `${item.name}: +${effects.heal_per_rest} LeP-Regeneration pro Nacht für ${days} Tage`
        result.effectSummary = `+${effects.heal_per_rest} LeP/Nacht`
        result.steps = [{ type: 'buff', buffs: [`+${effects.heal_per_rest} LeP-Regen`], durationMinutes: days * 24 * 60 }]
        break
      }
      const buffs = []
      if (effects.ge_bonus) buffs.push(`+${effects.ge_bonus} GE`)
      if (effects.kk_bonus) buffs.push(`+${effects.kk_bonus} KK`)
      if (effects.kl_bonus) buffs.push(`+${effects.kl_bonus} KL`)
      if (effects.in_bonus) buffs.push(`+${effects.in_bonus} IN`)
      if (effects.mu_bonus || effects.courage_bonus) buffs.push(`+${effects.mu_bonus || effects.courage_bonus} MU`)
      if (effects.fire_resistance) buffs.push('RS +4 vs Feuer')
      const duration = effects.duration_minutes || (effects.duration_hours ? effects.duration_hours * 60 : 30)
      const durationText = duration >= 60 ? `${duration / 60} Stunden` : `${duration} Minuten`
      result.description = `${item.name}: ${buffs.join(', ')} für ${durationText}`
      if (effects.penalty) result.description += `. Nachteil: ${effects.penalty}`
      result.effectSummary = buffs.join(', ')
      result.steps = [{ type: 'buff', buffs, durationMinutes: duration }]
      break
    }

    case 'condition': {
      if (effects.condition_remove) {
        const cr = effects.condition_remove
        result.description = `${item.name}: Entfernt ${cr.levels || 1} Stufe ${cr.condition}`
        result.steps = [{ type: 'condition', condition: cr.condition, action: 'remove', level: cr.levels || 1 }]
        result.effectSummary = result.description
        break
      }
      if (effects.pain_relief) result.description = `${item.name}: Entfernt 1 Stufe Schmerz`
      else if (effects.remove_betaeubung) result.description = `${item.name}: Entfernt ${effects.remove_betaeubung} Stufe Betäubung`
      else if (effects.cure_poison) result.description = `${item.name}: ${effects.bonus || '+4 auf Zähigkeitsprobe gegen Gift'}`
      else if (effects.cure_disease) result.description = `${item.name}: ${effects.bonus || '+3 auf Konstitutionsprobe gegen Krankheit'}`
      else if (effects.sleep) { result.description = `${item.name}: Bewusstlosigkeit ${effects.duration_hours || 4}h`; result.needsTarget = true }
      else if (effects.nightvision) result.description = `${item.name}: Nachtsicht ${effects.duration_hours || 2}h`
      else if (effects.invisibility) result.description = `${item.name}: Unsichtbar ${effects.duration_minutes || 10} Min`
      else if (effects.condition_add) result.description = `${item.name}: ${effects.condition_add} ${effects.condition_level || 1}${effects.detail ? ` — ${effects.detail}` : ''}`
      else result.description = `${item.name}: ${effects.detail || 'Effekt'}`
      result.effectSummary = result.description
      result.steps = [{ type: 'condition', effects }]
      break
    }

    case 'poison': {
      result.description = `${item.name}: Gift Stufe ${effects.stufe || '?'} (${effects.application || '?'})`
      result.description += `. ${effects.damage || ''} — Zähigkeitsprobe ${effects.zk_mod || 0}`
      if (effects.detail) result.description += `. ${effects.detail}`
      result.needsTarget = true
      result.steps = [{ type: 'poison', stufe: effects.stufe, zkMod: effects.zk_mod }]
      break
    }

    default:
      result.description = `${item.name}: ${effects.detail || item.description || 'Benutzt'}`
      result.effectSummary = result.description
      result.steps = [{ type: 'utility' }]
  }

  return result
}

/**
 * Apply resolved actions to the game state via WebSocket messages.
 *
 * @param {Array} actions - from resolveItemEffect().actions
 * @param {Function} sendMessage - WS send function
 * @param {Function} updateCombatant - combatStore.updateCombatant
 * @param {object} context - { userId, characterId, characterName }
 */
export function applyActions(actions, sendMessage, updateCombatant, context) {
  const messages = []

  for (const action of actions) {
    switch (action.type) {
      case 'heal': {
        // Update combatant LeP in store
        if (action.target && updateCombatant) {
          updateCombatant(action.target, { lep: undefined }) // will be set by vitals_update
        }
        // Send vitals_update
        sendMessage?.({
          type: 'vitals_update',
          payload: {
            character_id: action.target,
            vitals: { lep_delta: action.value }, // delta, not absolute — backend should add
          },
        })
        break
      }

      case 'restore': {
        sendMessage?.({
          type: 'vitals_update',
          payload: {
            character_id: action.target,
            vitals: { [`${action.resource}_delta`]: action.value },
          },
        })
        break
      }

      case 'damage': {
        if (action.target && updateCombatant) {
          // We don't know current HP here — let the GM handle
        }
        sendMessage?.({
          type: 'vitals_update',
          payload: {
            character_id: action.target,
            vitals: { lep_delta: -action.value },
          },
        })
        break
      }

      case 'condition': {
        sendMessage?.({
          type: 'conditions_update',
          payload: {
            character_id: action.target,
            condition: action.condition,
            action: action.action,
            level: action.level,
            bonus: action.bonus,
          },
        })
        break
      }

      case 'buff': {
        // Parse buff entries: "+2 KK", "+1 GE", etc.
        for (const buff of (action.buffs || [])) {
          const match = buff.match(/\+?(-?\d+)\s*(\w+)/)
          if (match) {
            sendMessage?.({
              type: 'buff_apply',
              payload: {
                character_id: context.characterId,
                stat: match[2],
                value: parseInt(match[1]),
                source: context.itemName || 'Buff',
                duration_minutes: action.durationMinutes || 60,
              },
            })
          }
        }
        break
      }

      case 'probe_bonus': {
        // Display only — the actual probe is handled separately by the GM
        break
      }

      // poison and utility are logged only — GM handles manually
      default:
        break
    }
  }

  return messages
}
