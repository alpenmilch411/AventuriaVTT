/**
 * DSA5 Kritische Treffer und Patzer Tabellen
 *
 * Kritischer Treffer (Angriff):
 *   Wurf von 1 → Bestätigungswurf (nochmal 1W20 gegen AT)
 *   - Bestätigt (≤ AT): Schaden wird verdoppelt (nach RS-Abzug)
 *   - Nicht bestätigt: Normaler Treffer (kein Bonus)
 *
 * Patzer (Angriff):
 *   Wurf von 20 → Bestätigungswurf (nochmal 1W20 gegen AT)
 *   - Bestätigt (> AT): Patzer-Tabelle → 2W6 würfeln
 *   - Nicht bestätigt: Einfacher Fehlschlag (kein Patzer-Effekt)
 *
 * Kritische Verteidigung:
 *   Wurf von 1 bei Parade/Ausweichen → Automatisch erfolgreich, Angreifer muss Patzer-Bestätigung ablegen
 *
 * Patzer bei Verteidigung:
 *   Wurf von 20 bei Parade/Ausweichen → Bestätigungswurf, bei Bestätigung Patzer-Tabelle
 */

// Angriffs-Patzer-Tabelle (2W6)
export const ATTACK_FUMBLE_TABLE = {
  2: {
    name: 'Waffe zerstört',
    desc: 'Die Waffe zerbricht (nur bei primitiven Waffen). Normale Waffen: wie Ergebnis 5.',
    effect: 'weapon_damaged',
    condition: 'primitive_only',
    fallback: 5,
  },
  3: {
    name: 'Eigentreffer schwer',
    desc: 'Du triffst dich selbst! Voller Waffenschaden (eigenen Schadenswurf anwenden, RS gilt).',
    effect: 'self_hit_full',
  },
  4: {
    name: 'Eigentreffer leicht',
    desc: 'Du triffst dich selbst leicht. Halber Waffenschaden (aufgerundet, RS gilt).',
    effect: 'self_hit_half',
  },
  5: {
    name: 'Waffe verloren',
    desc: 'Die Waffe fällt zu Boden. 1 Aktion nötig um sie aufzuheben, oder Schnellziehen-SF als freie Aktion.',
    effect: 'drop_weapon',
  },
  6: {
    name: 'Waffe verloren',
    desc: 'Die Waffe fällt zu Boden. 1 Aktion nötig um sie aufzuheben.',
    effect: 'drop_weapon',
  },
  7: {
    name: 'Stolpern',
    desc: 'Du stolperst und verlierst das Gleichgewicht. Nächste Aktion ist verloren (keine Attacke in der nächsten Kampfrunde).',
    effect: 'lose_next_action',
  },
  8: {
    name: 'Stolpern',
    desc: 'Du stolperst. Nächste Aktion ist verloren.',
    effect: 'lose_next_action',
  },
  9: {
    name: 'Beule',
    desc: 'Du schlägst dir selbst eine Beule. 1 Stufe Betäubung für 3 Kampfrunden.',
    effect: 'stun_1',
    condition_add: 'Betäubung',
    condition_level: 1,
    duration_rounds: 3,
  },
  10: {
    name: 'Fehlschritt',
    desc: 'Du verlierst das Gleichgewicht und bist für 1 Kampfrunde Liegend (alle Angriffe und Verteidigungen -2).',
    effect: 'prone',
    condition_add: 'Liegend',
  },
  11: {
    name: 'Mitstreiter getroffen',
    desc: 'Du triffst versehentlich einen Verbündeten in der Nähe (der nächste Verbündete). Normaler Schadenswurf.',
    effect: 'hit_ally',
  },
  12: {
    name: 'Schwerer Eigentreffer',
    desc: 'Voller Waffenschaden gegen dich selbst, RS wird ignoriert! Außerdem 1 Stufe Schmerz.',
    effect: 'self_hit_ignore_rs',
    condition_add: 'Schmerz',
    condition_level: 1,
  },
}

// Verteidigungs-Patzer-Tabelle (2W6)
export const DEFENSE_FUMBLE_TABLE = {
  2: {
    name: 'Waffe zerstört',
    desc: 'Parierwaffe/Schild zerbricht (nur bei primitiven Waffen). Normale Waffen: wie Ergebnis 5.',
    effect: 'weapon_damaged',
    condition: 'primitive_only',
    fallback: 5,
  },
  3: {
    name: 'Schwerer Treffer einstecken',
    desc: 'Der Angriff trifft besonders hart. Schaden wird verdoppelt (nach RS).',
    effect: 'double_damage',
  },
  4: {
    name: 'Sturz',
    desc: 'Du fällst hin und bist Liegend. Aufstehen kostet 1 Aktion.',
    effect: 'prone',
    condition_add: 'Liegend',
  },
  5: {
    name: 'Waffe verloren',
    desc: 'Parierwaffe fällt zu Boden. 1 Aktion zum Aufheben. Ohne Waffe: keine Parade mehr möglich.',
    effect: 'drop_weapon',
  },
  6: {
    name: 'Waffe verloren',
    desc: 'Parierwaffe oder Schild fällt zu Boden.',
    effect: 'drop_weapon',
  },
  7: {
    name: 'Stolpern',
    desc: 'Du stolperst. Nächste Verteidigung hat -2.',
    effect: 'defense_penalty',
    penalty: -2,
  },
  8: {
    name: 'Stolpern',
    desc: 'Du stolperst. Nächste Verteidigung hat -2.',
    effect: 'defense_penalty',
    penalty: -2,
  },
  9: {
    name: 'Bein verdreht',
    desc: 'Du verdrehst dir das Bein. Geschwindigkeit halbiert für den Rest des Kampfes.',
    effect: 'half_gs',
  },
  10: {
    name: 'Deckung verloren',
    desc: 'Du bist für 1 Kampfrunde offen. Keine Parade/Ausweichen möglich in der nächsten KR.',
    effect: 'no_defense_next_round',
  },
  11: {
    name: 'Verbündeten behindert',
    desc: 'Du stolperst in einen Verbündeten. Beide erhalten -2 auf die nächste Aktion.',
    effect: 'hinder_ally',
  },
  12: {
    name: 'Schwerer Sturz',
    desc: 'Du stürzt schwer. Liegend + 1 Stufe Betäubung + 1W6 Schadenspunkte (RS gilt).',
    effect: 'heavy_fall',
    condition_add: 'Liegend',
    extra_damage: '1W6',
  },
}

// Fernkampf-Patzer-Tabelle (2W6)
export const RANGED_FUMBLE_TABLE = {
  2: {
    name: 'Waffe zerstört',
    desc: 'Die Fernkampfwaffe ist beschädigt und unbrauchbar (Sehne gerissen, Armbrustarm gebrochen).',
    effect: 'weapon_destroyed',
  },
  3: {
    name: 'Verbündeten getroffen',
    desc: 'Du triffst einen Verbündeten nahe dem Ziel. Normaler Schadenswurf.',
    effect: 'hit_ally',
  },
  4: {
    name: 'Fehlschuss — Munition verloren',
    desc: 'Der Schuss geht weit daneben. 1W6 Munition ist verloren oder zerbrochen.',
    effect: 'ammo_lost',
  },
  5: {
    name: 'Sehne/Mechanismus klemmt',
    desc: 'Die Waffe klemmt. 1 Aktion zum Reparieren nötig bevor weiter geschossen werden kann.',
    effect: 'weapon_jammed',
  },
  6: {
    name: 'Sehne/Mechanismus klemmt',
    desc: 'Die Waffe klemmt. 1 Aktion zum Reparieren.',
    effect: 'weapon_jammed',
  },
  7: {
    name: 'Gleichgewicht verloren',
    desc: 'Du verlierst kurz das Gleichgewicht. Nächste Aktion ist verloren.',
    effect: 'lose_next_action',
  },
  8: {
    name: 'Gleichgewicht verloren',
    desc: 'Nächste Aktion verloren.',
    effect: 'lose_next_action',
  },
  9: {
    name: 'Finger verletzt',
    desc: 'Die Sehne schneidet in den Finger. 1 Stufe Schmerz für den Rest des Kampfes.',
    effect: 'pain',
    condition_add: 'Schmerz',
    condition_level: 1,
  },
  10: {
    name: 'Ziel verwechselt',
    desc: 'Du zielst kurz auf das falsche Ziel. Nächster Fernkampfangriff hat -4.',
    effect: 'fk_penalty',
    penalty: -4,
  },
  11: {
    name: 'Eigentreffer',
    desc: 'Du triffst dich selbst (z.B. Armbrustbolzen prallt zurück). 1W6 Schadenspunkte (RS gilt).',
    effect: 'self_hit',
    extra_damage: '1W6',
  },
  12: {
    name: 'Waffe zerstört + Verletzung',
    desc: 'Die Waffe zerbricht und verletzt dich dabei. 1W6+2 Schadenspunkte + Waffe unbrauchbar.',
    effect: 'weapon_destroyed_injury',
    extra_damage: '1W6+2',
  },
}

/**
 * Check if a roll is a critical hit or Patzer.
 * @param {number} roll - The 1W20 result
 * @returns {{ critical: boolean, patzer: boolean }}
 */
export function checkCritical(roll) {
  return {
    critical: roll === 1,
    patzer: roll === 20,
  }
}

/**
 * Determine if a confirmation roll confirms the critical/Patzer.
 *
 * Critical hit confirmation: confirmation roll ≤ AT → confirmed (double damage)
 * Patzer confirmation: confirmation roll > AT → confirmed (fumble table)
 *
 * @param {number} confirmRoll - The confirmation 1W20 result
 * @param {number} targetValue - The AT/PA/AW value
 * @param {'critical'|'patzer'} type - What we're confirming
 * @returns {boolean} Whether the critical/Patzer is confirmed
 */
export function confirmCritical(confirmRoll, targetValue, type) {
  if (type === 'critical') {
    return confirmRoll <= targetValue
  }
  // Patzer: confirmed if confirmation roll also fails (> target)
  return confirmRoll > targetValue
}

/**
 * Look up a fumble table result.
 * @param {number} roll2d6 - The 2W6 result (2-12)
 * @param {'attack'|'defense'|'ranged'} tableType
 * @returns {object} The fumble result with name, desc, effect
 */
export function lookupFumble(roll2d6, tableType = 'attack') {
  const table = tableType === 'defense' ? DEFENSE_FUMBLE_TABLE
    : tableType === 'ranged' ? RANGED_FUMBLE_TABLE
    : ATTACK_FUMBLE_TABLE
  const clamped = Math.max(2, Math.min(12, roll2d6))
  const result = table[clamped]
  // Handle fallback for primitive-only effects
  if (result?.condition === 'primitive_only' && result.fallback) {
    return { ...result, note: 'Nur bei primitiven Waffen. Bei normalen Waffen:' , normalResult: table[result.fallback] }
  }
  return result
}
