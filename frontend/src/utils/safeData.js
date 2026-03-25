/**
 * Safe data extractors for player/character objects.
 *
 * The API, WS messages, and different stores return the same data in
 * different shapes.  These helpers normalise the access so components
 * never crash on unexpected types ({} instead of [], undefined, etc.).
 */

/** Extract conditions as a guaranteed array from any player-like object. */
export function getConditions(playerOrChar) {
  if (!playerOrChar) return []
  // sessionStore.players[].conditions may be {} (object) from old API fallback
  if (Array.isArray(playerOrChar.conditions)) return playerOrChar.conditions
  if (Array.isArray(playerOrChar.character?.conditions)) return playerOrChar.character.conditions
  return []
}

/** Extract current vitals as {lep, asp, kap, schip} from any player-like object. */
export function getVitalsFrom(playerOrChar) {
  if (!playerOrChar) return { lep: 0, asp: 0, kap: 0, schip: 0 }
  const cv = playerOrChar.current_vitals || {}
  const dv = playerOrChar.derived_values || playerOrChar.character?.derived_values || {}
  return {
    lep: cv.lep ?? playerOrChar.currentLeP ?? dv.LeP_max ?? 0,
    asp: cv.asp ?? playerOrChar.currentAsP ?? dv.AsP_max ?? 0,
    kap: cv.kap ?? playerOrChar.currentKaP ?? dv.KaP_max ?? 0,
    schip: cv.schip ?? playerOrChar.currentSchiP ?? dv.Schip ?? 0,
  }
}

/** Extract max vitals from any player-like object. */
export function getMaxVitals(playerOrChar) {
  if (!playerOrChar) return { lepMax: 0, aspMax: 0, kapMax: 0, schipMax: 3 }
  const dv = playerOrChar.derived_values || playerOrChar.character?.derived_values || {}
  return {
    lepMax: dv.LeP_max ?? 0,
    aspMax: dv.AsP_max ?? 0,
    kapMax: dv.KaP_max ?? 0,
    schipMax: dv.Schip ?? 3,
  }
}
