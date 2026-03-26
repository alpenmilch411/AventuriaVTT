/**
 * DSA5 Conditions Engine
 *
 * Manages combat conditions (Zustände) and their mechanical effects.
 * Each condition has levels (I-IV) and modifies combat values.
 *
 * Pain (Schmerz) is auto-calculated from HP thresholds.
 */

// ── Condition Definitions ──
export const CONDITIONS = {
  // ── Gestufte Zustände (haben mehrere Stufen) ──
  'Furcht': {
    levels: 4, category: 'geistig', icon: '😨',
    perLevel: { MU: -1, IN: -1, CH: -1, AT: -1, FK: -1 },
    summary: 'Angst und Panik — erschwert Mut, Intuition, Charisma und Angriffswerte.',
    source: 'Einschüchterung, Dämonen, Untote, Zauber (Horriphobus), übernatürliche Wesen.',
    removal: 'Abklingen nach Bedrohungsende (Spielleiterentscheidung), Selbstbeherrschung-Probe, Mut-Zuspruch durch Verbündete.',
    desc: [
      'Furcht I: -1 auf Mut/Intuition/Charisma-Proben und Angriff. Leichtes Unbehagen.',
      'Furcht II: -2 auf Mut/Intuition/Charisma-Proben und Angriff. Flucht wenn möglich.',
      'Furcht III: -3 auf alles. Held muss fliehen, Kampf nur zur Selbstverteidigung.',
      'Furcht IV: Handlungsunfähig vor Angst. Kann weder handeln noch sich verteidigen.',
    ],
  },
  'Schmerz': {
    levels: 4, category: 'körperlich', icon: '🩸',
    perLevel: { AT: -1, PA: -1, AW: -1, FK: -1, INI: -1, GS: -1 },
    summary: 'Körperlicher Schmerz — erschwert alle Kampfwerte und Bewegung.',
    source: 'Schwere Verletzungen (automatisch bei Unterschreiten der Wundschwelle), Folter, bestimmte Zauber.',
    removal: 'Heilkunde Wunden-Probe, Heiltränke, Donf-Kraut, Rast (1 Stufe pro 24h Ruhe).',
    desc: [
      'Schmerz I: -1 auf alle Kampfwerte (Attacke, Parade, Ausweichen, Fernkampf, Initiative, Geschwindigkeit).',
      'Schmerz II: -2 auf alle Kampfwerte. Deutliche Beeinträchtigung.',
      'Schmerz III: -3 auf alle Kampfwerte, Geschwindigkeit halbiert. Schwer kampffähig.',
      'Schmerz IV: Handlungsunfähig vor Schmerz. Bewusstlosigkeit oder Zusammenbruch.',
    ],
  },
  'Belastung': {
    levels: 4, category: 'körperlich', icon: '🏋️',
    perLevel: { AT: -1, PA: -1, AW: -1, INI: -1, GS: -1 },
    summary: 'Erschöpfung durch Überlast oder Anstrengung — erschwert Kampf und Bewegung.',
    source: 'Überschreitung der Traglast, extreme Anstrengung, Schlafentzug, Hunger/Durst.',
    removal: 'Last ablegen, ausreichende Rast, Essen und Trinken.',
    desc: [
      'Belastung I: -1 auf Kampfwerte und Geschwindigkeit.',
      'Belastung II: -2 auf Kampfwerte und Geschwindigkeit.',
      'Belastung III: -3 auf Kampfwerte und Geschwindigkeit. Kaum noch kampffähig.',
      'Belastung IV: Handlungsunfähig. Zusammenbruch vor Erschöpfung.',
    ],
  },
  'Berauscht': {
    levels: 2, category: 'geistig', icon: '🍺',
    perLevel: { AT: -1, PA: -1, AW: -1, FF: -1, MU: 1 },
    // DSA5: at level 2, additionally -1 KL and -1 IN (not per-level, only at II)
    level2Extra: { KL: -1, IN: -1 },
    summary: 'Alkoholrausch — senkt Kampfwerte und Fingerfertigkeit, erhöht aber den Mut.',
    source: 'Alkoholkonsum (Bier, Wein, Zwergenschnaps). Zechen-Probe kann Stufe reduzieren.',
    removal: 'Abklingen mit der Zeit (ca. 1 Stufe pro 2 Stunden), Kaffee beschleunigt.',
    desc: [
      'Berauscht I: -1 Attacke/Parade/Ausweichen/Fingerfertigkeit, +1 Mut. Leicht angetrunken.',
      'Berauscht II: -2 Attacke/Parade/Ausweichen/Fingerfertigkeit, +2 Mut, zusätzlich -1 Klugheit/Intuition. Deutlich betrunken.',
    ],
  },
  'Verwirrt': {
    levels: 4, category: 'geistig', icon: '😵',
    perLevel: { AT: -1, PA: -1, AW: -1, FK: -1, KL: -1, IN: -1 },
    summary: 'Geistige Verwirrung — erschwert Kampf, Klugheit und Intuition.',
    source: 'Illusionszauber, Kopfverletzungen, Drogen, Schlafentzug, übernatürliche Effekte.',
    removal: 'Willenskraft-Probe, Rast, Ende des auslösenden Effekts.',
    desc: [
      'Verwirrt I: -1 auf alle geistigen Proben und Kampfwerte.',
      'Verwirrt II: -2 auf alle geistigen Proben und Kampfwerte.',
      'Verwirrt III: -3, handelt teilweise zufällig (Spielleiterentscheidung).',
      'Verwirrt IV: Handlungsunfähig. Vollständige Desorientierung.',
    ],
  },

  // ── Einstufige Zustände (aktiv oder nicht) ──
  'Paralyse': {
    levels: 1, category: 'körperlich', icon: '🧊',
    effect: 'incapacitated',
    summary: 'Vollständige Lähmung — der Held kann sich nicht bewegen oder handeln.',
    source: 'Lähmungszauber (Horriphobus Lähmung), Gifte (Basiliskengift), magische Effekte.',
    removal: 'Ende der Wirkungsdauer, Gegenzauber, Gegengift.',
    desc: ['Paralyse: Kann nicht handeln, keine Verteidigung möglich. Gilt als wehrlos.'],
  },
  'Betäubt': {
    levels: 1, category: 'körperlich', icon: '💫',
    effect: 'incapacitated',
    summary: 'Bewusstlosigkeit oder Benommenheit — keine Handlungen möglich.',
    source: 'Betäubungsgifte, Kopftreffer, Donnerball, Schlaftränke, Erschöpfung.',
    removal: 'Abklingen nach Wirkungsdauer, Aufwecken durch Verbündete (1 Aktion), Heiltrank.',
    desc: ['Betäubt: Kann nicht handeln, keine Verteidigung. Wehrlos gegen Angriffe.'],
  },
  'Betaeubung': {
    levels: 1, category: 'körperlich', icon: '💫',
    effect: 'incapacitated',
    summary: 'Bewusstlosigkeit oder Benommenheit — keine Handlungen möglich.',
    source: 'Betäubungsgifte, Kopftreffer, Donnerball.',
    removal: 'Abklingen, Aufwecken.',
    desc: ['Betäubung: Kann nicht handeln, keine Verteidigung.'],
  },
  'Betaeubt': {
    levels: 1, category: 'körperlich', icon: '💫',
    effect: 'incapacitated',
    summary: 'Alias für Betäubt.',
    source: 'Siehe Betäubt.',
    removal: 'Siehe Betäubt.',
    desc: ['Betäubt: Kann nicht handeln, keine Verteidigung.'],
  },
  'Vergiftet': {
    levels: 1, category: 'körperlich', icon: '☠️',
    effect: 'dot',
    summary: 'Vergiftung — erleidet Schaden pro Kampfrunde oder Zeitintervall.',
    source: 'Giftwaffen, Giftfallen, vergiftetes Essen/Trinken, Giftbisse von Kreaturen.',
    removal: 'Gegengift, Heilkunde Gift-Probe, Gulmond-Kraut, einige Zauber. Zähigkeitsprobe kann Gift widerstehen.',
    desc: ['Vergiftet: Erleidet Schaden pro Kampfrunde (je nach Giftstufe und -art). Giftstärke und Wirkung variieren.'],
  },
  'Verblendet': {
    levels: 1, category: 'körperlich', icon: '🙈',
    flat: { AT: -3, PA: -3, AW: -3, FK: -6 },
    summary: 'Eingeschränkte Sicht — stark erschwerte Kampfwerte, besonders Fernkampf.',
    source: 'Rauchbomben, Sand in die Augen, Blendungszauber, Nebel, Dunkelheit.',
    removal: 'Rauch verzieht sich, Augen auswaschen (1 Aktion), Ende des Zaubers.',
    desc: ['Verblendet: -3 Attacke/Parade/Ausweichen, -6 Fernkampf. Kann kaum etwas sehen.'],
  },
  'Liegend': {
    levels: 1, category: 'körperlich', icon: '🔻',
    flat: { AT: -4, PA: -2, AW: -4 },
    summary: 'Am Boden liegend — stark erschwerte Kampfwerte. Aufstehen kostet 1 Aktion.',
    source: 'Niederwerfen-Manöver, Sturz, Patzer bei Verteidigung, Schlüpfriger Boden.',
    removal: 'Aufstehen als Aktion (1 Aktion). Während des Liegens stark verwundbar.',
    desc: ['Liegend: -4 Attacke, -2 Parade, -4 Ausweichen. Aufstehen erfordert 1 Aktion.'],
  },
  'Fixiert': {
    levels: 1, category: 'körperlich', icon: '⛓️',
    flat: { AT: -4, PA: -4, AW: -4, GS: -99 },
    summary: 'Festgehalten oder gefesselt — kann sich nicht bewegen, stark eingeschränkt im Kampf.',
    source: 'Fesselmanöver, Netz, Klebezauber, Umklammerung durch Kreaturen.',
    removal: 'Entfesselung-Probe, Kraftakt um sich zu befreien, Hilfe durch Verbündete.',
    desc: ['Fixiert: -4 auf alle Kampfwerte, kann sich nicht bewegen. Muss sich erst befreien.'],
  },
  'Bewusstlos': {
    levels: 1, category: 'körperlich', icon: '😴',
    effect: 'incapacitated',
    summary: 'Ohnmacht — der Held ist nicht ansprechbar und völlig wehrlos.',
    source: 'Lebenspunkte auf 0, Schlafzauber, Betäubungsgift, schwere Kopfverletzung.',
    removal: 'Stabilisierung durch Heilkunde Wunden, Heilmagie, natürliches Erwachen nach 1W6 Kampfrunden.',
    desc: ['Bewusstlos: Kann nicht handeln, nicht verteidigen, nicht wahrnehmen. Völlig wehrlos.'],
  },
  'Blutend': {
    levels: 1, category: 'körperlich', icon: '🩸',
    effect: 'dot',
    summary: 'Offene Wunde — verliert jede Kampfrunde Lebenspunkte bis die Blutung gestoppt wird.',
    source: 'Schwere Wunden, kritische Treffer, bestimmte Waffentypen.',
    removal: 'Heilkunde Wunden-Probe, Verbandszeug, Heiltrank, Heilzauber.',
    desc: ['Blutend: Verliert 1 Lebenspunkt pro Kampfrunde. Muss gestoppt werden, sonst verblutet der Held.'],
  },
  'Brennend': {
    levels: 1, category: 'körperlich', icon: '🔥',
    effect: 'dot',
    summary: 'Steht in Flammen — erleidet Feuerschaden pro Kampfrunde.',
    source: 'Brandbomben, Feuerzauber (Ignifaxius), brennende Umgebung, Öl + Funken.',
    removal: 'Auf dem Boden wälzen (1 Aktion, Körperbeherrschung-Probe), Wasser, Löschzauber.',
    desc: ['Brennend: 1W6 Feuerschaden pro Kampfrunde (Rüstungsschutz gilt). Löschen als Aktion möglich.'],
  },
  'Krank': {
    levels: 4, category: 'körperlich', icon: '🤒',
    perLevel: { AT: -1, PA: -1, AW: -1, KO: -1 },
    summary: 'Krankheit — schwächt den Körper über längere Zeit.',
    source: 'Ansteckung, unhygienische Bedingungen, Flüche, magische Krankheiten.',
    removal: 'Heilkunde Krankheiten-Probe, Bettruhe, Fiebertrank, bestimmte Kräuter.',
    desc: [
      'Krank I: -1 auf körperliche Proben und Kampfwerte. Leichtes Fieber.',
      'Krank II: -2 auf körperliche Proben und Kampfwerte. Deutlich geschwächt.',
      'Krank III: -3 auf alles, bettlägerig. Schwer krank.',
      'Krank IV: Handlungsunfähig, lebensbedrohlich ohne Behandlung.',
    ],
  },
  'Entrückt': {
    levels: 1, category: 'geistig', icon: '✨',
    summary: 'In Trance oder mystischer Verzückung — kann nicht normal handeln.',
    source: 'Göttliche Visionen, tiefe Meditation, mächtige Liturgien, Artefaktberührung.',
    removal: 'Abklingen des Effekts, Ansprechen/Berühren durch Verbündete.',
    desc: ['Entrückt: Kann nicht handeln oder reagieren. Erhält möglicherweise Visionen oder göttliche Botschaften.'],
  },
  'Überrascht': {
    levels: 1, category: 'kampf', icon: '❗',
    flat: { AT: -4, PA: -4, AW: -4 },
    summary: 'Im ersten Moment eines Hinterhalts überrumpelt.',
    source: 'Fehlgeschlagene Sinnenschärfe-Probe gegen Hinterhalt, Überraschungsangriff.',
    removal: 'Endet automatisch nach der ersten Kampfrunde.',
    desc: ['Überrascht: -4 auf alle Kampfwerte in der ersten Kampfrunde. Danach normal handlungsfähig.'],
  },
}

/**
 * Calculate total combat modifier from all active conditions.
 * @param {Array} conditions - [{name: 'Furcht', level: 2}, {name: 'Schmerz', level: 1}]
 * @param {string} stat - Which stat to get modifier for: 'AT', 'PA', 'AW', 'INI', 'GS', etc.
 * @returns {number} Total modifier (negative or positive)
 */
export function getConditionModifier(conditions, stat) {
  if (!conditions || conditions.length === 0) return 0

  let total = 0
  let totalLevel = 0
  for (const cond of conditions) {
    const def = CONDITIONS[cond.name]
    if (!def) continue
    const level = cond.level || 1
    totalLevel += level

    // Check if incapacitated (level IV of most conditions, or Paralyse/Betäubt)
    if (def.effect === 'incapacitated') return -999
    if (level >= 4 && def.levels === 4) return -999

    // Per-level stacking
    if (def.perLevel && def.perLevel[stat]) {
      total += def.perLevel[stat] * level
    }
    // Level-threshold extras (e.g. Berauscht II adds -1 KL/IN)
    if (def.level2Extra && def.level2Extra[stat] && level >= 2) {
      total += def.level2Extra[stat]
    }
    // Flat modifiers
    if (def.flat && def.flat[stat]) {
      total += def.flat[stat]
    }
  }
  // DSA5: sum of all condition levels >= 8 also causes Handlungsunfähig
  if (totalLevel >= 8) return -999
  return total
}

/**
 * Get gross positive and negative condition modifiers separately.
 * @returns {{ pos: number, neg: number }}
 */
export function getConditionModifierGross(conditions, stat) {
  if (!conditions || conditions.length === 0) return { pos: 0, neg: 0 }
  let pos = 0, neg = 0
  for (const cond of conditions) {
    const def = CONDITIONS[cond.name]
    if (!def) continue
    const level = cond.level || 1
    // Always compute real modifiers (don't short-circuit with -999)
    let val = 0
    if (def.perLevel && def.perLevel[stat]) val += def.perLevel[stat] * level
    if (def.level2Extra && def.level2Extra[stat] && level >= 2) val += def.level2Extra[stat]
    if (def.flat && def.flat[stat]) val += def.flat[stat]
    if (val > 0) pos += val
    if (val < 0) neg += val
  }
  return { pos, neg }
}

/**
 * Check if a combatant is incapacitated (cannot act at all).
 */
export function isIncapacitated(conditions) {
  if (!conditions || conditions.length === 0) return false
  let totalLevel = 0
  for (const cond of conditions) {
    const def = CONDITIONS[cond.name]
    if (!def) continue
    const level = cond.level || 1
    if (def.effect === 'incapacitated') return true
    if (level >= 4 && def.levels === 4) return true
    totalLevel += level
  }
  // DSA5: sum of all condition levels >= 8 also causes Handlungsunfähig
  if (totalLevel >= 8) return true
  return false
}

/**
 * Calculate Schmerz (pain) level from current HP.
 * DSA5: Pain thresholds at 75%, 50%, 25%, 5 LeP remaining.
 * @returns {number} Pain level 0-4
 */
export function calculatePainLevel(currentLeP, maxLeP) {
  if (maxLeP <= 0) return 0
  const pct = currentLeP / maxLeP
  if (currentLeP <= 5) return 4
  if (pct <= 0.25) return 3
  if (pct <= 0.50) return 2
  if (pct <= 0.75) return 1
  return 0
}

/**
 * Add a condition, stacking levels if it already exists.
 * @returns {Array} Updated conditions array
 */
export function addCondition(conditions, name, level = 1, duration = null, source = null) {
  const def = CONDITIONS[name]
  const maxLevel = def?.levels || 4

  // DSA5: magical sources don't stack (highest wins), physical sources stack
  const existing = conditions.find(c => c.name === name && c.source === source)

  if (source === 'magical') {
    // Magical + magical: take the higher level (don't stack)
    const magicalExisting = conditions.find(c => c.name === name && c.source === 'magical')
    if (magicalExisting) {
      magicalExisting.level = Math.min(Math.max(magicalExisting.level || 1, level), maxLevel)
      if (duration) magicalExisting.duration = duration
      return [...conditions]
    }
    // New magical entry (physical may already exist separately)
    return [...conditions, { name, level: Math.min(level, maxLevel), duration, source, addedRound: null }]
  }

  // Physical or unspecified source: stack normally
  if (existing) {
    existing.level = Math.min((existing.level || 1) + level, maxLevel)
    if (duration) existing.duration = duration
    return [...conditions]
  }
  return [...conditions, { name, level: Math.min(level, maxLevel), duration, source, addedRound: null }]
}

/**
 * Remove a condition entirely.
 */
export function removeCondition(conditions, name) {
  return conditions.filter(c => c.name !== name)
}

/**
 * Tick conditions at round start: reduce durations, remove expired.
 * Also processes damage-over-time (poison).
 * @returns {{ conditions: Array, poisonDamage: number, expired: string[] }}
 */
export function tickConditions(conditions) {
  let poisonDamage = 0
  const expired = []
  const remaining = []

  for (const cond of conditions) {
    if (cond.duration != null) {
      cond.duration--
      if (cond.duration <= 0) {
        expired.push(cond.name)
        continue
      }
    }
    // Poison DoT
    if (cond.name === 'Vergiftet' && cond.damagePerRound) {
      poisonDamage += cond.damagePerRound
    }
    remaining.push(cond)
  }

  return { conditions: remaining, poisonDamage, expired }
}

/**
 * Format all active conditions as a readable string.
 */
export function formatConditions(conditions) {
  if (!conditions || conditions.length === 0) return ''
  return conditions.map(c => {
    const def = CONDITIONS[c.name]
    const levelStr = (def?.levels || 1) > 1 ? ` ${['', 'I', 'II', 'III', 'IV'][c.level || 1]}` : ''
    const durStr = c.duration != null ? ` (${c.duration} KR)` : ''
    return `${c.name}${levelStr}${durStr}`
  }).join(', ')
}

/**
 * Get a human-readable breakdown of all condition effects on combat values.
 */
export function getConditionBreakdown(conditions) {
  if (!conditions || conditions.length === 0) return []
  const lines = []
  for (const cond of conditions) {
    const def = CONDITIONS[cond.name]
    if (!def) continue
    const level = cond.level || 1
    const desc = def.desc?.[level - 1] || `${cond.name} ${level}`
    lines.push(desc)
  }
  return lines
}
