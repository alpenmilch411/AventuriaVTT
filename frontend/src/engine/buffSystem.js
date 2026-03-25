/**
 * Buff System — Manages temporary stat modifiers with duration.
 *
 * A buff is:
 *   { id, stat, value, expiresAt, source, characterId }
 *
 * Stats that can be buffed:
 *   MU, KL, IN, CH, FF, GE, KO, KK  — attributes
 *   AT, PA, AW, RS, INI, GS          — combat values
 *   Nachtsicht, Unsichtbar            — special flags
 *
 * Stored in characterStore.activeBuffs[] and synced via WS.
 */

/**
 * Create a buff object.
 */
export function createBuff({ stat, value, durationMinutes, source, characterId }) {
  return {
    id: `buff_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    stat,
    value,
    expiresAt: Date.now() + durationMinutes * 60 * 1000,
    durationMinutes,
    source: source || 'Unbekannt',
    characterId,
    createdAt: Date.now(),
  }
}

/**
 * Check if a buff is still active.
 */
export function isBuffActive(buff) {
  return buff.expiresAt > Date.now()
}

/**
 * Get remaining time in seconds.
 */
export function remainingSeconds(buff) {
  return Math.max(0, Math.floor((buff.expiresAt - Date.now()) / 1000))
}

/**
 * Format remaining time as "Xm Ys" or "X Min".
 */
export function formatRemaining(buff) {
  const sec = remainingSeconds(buff)
  if (sec <= 0) return 'abgelaufen'
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} Min`
  const hours = Math.floor(min / 60)
  return `${hours}h ${min % 60}m`
}

/**
 * Get the total modifier for a given stat from a list of active buffs.
 * Sums all active buffs that affect this stat.
 */
export function getStatModifier(buffs, stat) {
  if (!buffs || !Array.isArray(buffs)) return 0
  return buffs
    .filter(b => b.stat === stat && isBuffActive(b))
    .reduce((sum, b) => sum + (b.value || 0), 0)
}

/**
 * Check if a special flag buff is active (e.g., Nachtsicht, Unsichtbar).
 */
export function hasActiveBuff(buffs, stat) {
  if (!buffs || !Array.isArray(buffs)) return false
  return buffs.some(b => b.stat === stat && isBuffActive(b))
}

/**
 * Get all active buffs for a character, filtering out expired ones.
 */
export function getActiveBuffs(buffs, characterId) {
  if (!buffs || !Array.isArray(buffs)) return []
  return buffs.filter(b =>
    (!characterId || b.characterId === characterId) && isBuffActive(b)
  )
}

/**
 * Remove expired buffs from a list. Returns [activeBuffs, expiredBuffs].
 */
export function pruneExpired(buffs) {
  if (!buffs || !Array.isArray(buffs)) return [[], []]
  const active = []
  const expired = []
  for (const b of buffs) {
    if (isBuffActive(b)) active.push(b)
    else expired.push(b)
  }
  return [active, expired]
}

/**
 * Apply attribute buffs to a base attributes object.
 * Returns a new object with modified values.
 */
export function applyAttributeBuffs(baseAttributes, buffs) {
  if (!baseAttributes || !buffs) return baseAttributes || {}
  const result = { ...baseAttributes }
  const attrs = ['MU', 'KL', 'IN', 'CH', 'FF', 'GE', 'KO', 'KK']
  for (const attr of attrs) {
    const mod = getStatModifier(buffs, attr)
    if (mod !== 0 && result[attr] !== undefined) {
      result[attr] = result[attr] + mod
    }
  }
  return result
}

/**
 * Apply combat value buffs.
 * Returns modified { at, pa, aw, rs, ini }.
 */
export function applyCombatBuffs(baseCombat, buffs) {
  if (!baseCombat) return baseCombat
  return {
    ...baseCombat,
    at: (baseCombat.at || 0) + getStatModifier(buffs, 'AT'),
    pa: (baseCombat.pa || 0) + getStatModifier(buffs, 'PA'),
    aw: (baseCombat.aw || 0) + getStatModifier(buffs, 'AW'),
    rs: (baseCombat.rs || 0) + getStatModifier(buffs, 'RS') + getStatModifier(buffs, 'RS_Feuer'),
    ini: (baseCombat.ini || 0) + getStatModifier(buffs, 'INI'),
  }
}
