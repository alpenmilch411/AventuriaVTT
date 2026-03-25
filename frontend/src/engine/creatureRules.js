/**
 * DSA5 Creature Special Rules Engine
 *
 * Parses creature special_rules arrays (strings or objects) into
 * structured combat effects that TurnFlow can apply.
 */

// ── Rule Parsers ──
// Each parser checks if a rule string matches and returns a structured effect.

const RULE_PARSERS = [
  // Pack tactics: "+N AT per ally of same type"
  {
    match: /Rudelkampf\s*\(\+(\d+)\s*AT\s*pro\s*weiteren.*max\s*\+(\d+)\)/i,
    parse: (m) => ({ type: 'packTactics', atPerAlly: parseInt(m[1]), maxBonus: parseInt(m[2]) }),
  },
  // Charge attack: AT bonus when charging
  {
    match: /Sturmangriff|Überrennen/i,
    parse: () => ({ type: 'charge', atBonus: 2, desc: 'Sturmangriff: +2 AT bei 4+ Schritt Anlauf' }),
  },
  // Regeneration
  {
    match: /Regeneration\s*\((\d+)\s*LeP/i,
    parse: (m) => ({ type: 'regeneration', lepPerRound: parseInt(m[1]) }),
  },
  {
    match: /Regeneration/i,
    parse: () => ({ type: 'regeneration', lepPerRound: 1 }),
  },
  // Fear aura
  {
    match: /Furchtaura|Dunkle Aura/i,
    parse: () => ({ type: 'fearAura', condition: 'Furcht', level: 1, vsProbe: 'MU', desc: 'MU-Probe oder Furcht I bei Sichtkontakt' }),
  },
  // Paralysis on hit
  {
    match: /Paralysi.*Berührung|Paralyse.*KO-Probe/i,
    parse: () => ({ type: 'onHit', effect: 'paralyze', condition: 'Paralyse', vsProbe: 'KO', duration: '1W3 KR', desc: 'Bei Treffer: KO-Probe oder Paralyse für 1W3 KR' }),
  },
  // Poison on hit
  {
    match: /Gift.*\((\d+)[Ww](\d+).*(?:SP|Schaden).*(?:pro|für)\s*(\d+)\s*KR.*ZK([+-]\d+)?\)/i,
    parse: (m) => ({ type: 'onHit', effect: 'poison', condition: 'Vergiftet', damageFormula: `${m[1]}W${m[2]}`, durationRounds: parseInt(m[3]), vsProbe: 'ZK', vsMod: parseInt(m[4] || '0'), desc: `Gift: ${m[1]}W${m[2]} SP/KR für ${m[3]} KR (ZK${m[4] || ''}-Probe)` }),
  },
  {
    match: /Gift.*Spinnenbiss/i,
    parse: () => ({ type: 'onHit', effect: 'poison', condition: 'Vergiftet', damageFormula: '1W6', durationRounds: 3, vsProbe: 'ZK', vsMod: 0, desc: 'Spinnenbiss: 1W6 SP/KR für 3 KR (ZK-Probe)' }),
  },
  {
    match: /Gift/i,
    parse: () => ({ type: 'onHit', effect: 'poison', condition: 'Vergiftet', damageFormula: '1W6', durationRounds: 3, vsProbe: 'ZK', vsMod: 0, desc: 'Gift: 1W6 SP/KR für 3 KR (ZK-Probe)' }),
  },
  // Undead immunities
  {
    match: /^Untot$/i,
    parse: () => ({ type: 'immunity', immuneTo: ['Furcht', 'Schmerz', 'Vergiftet', 'Krankheit'], desc: 'Untot: immun gegen Furcht, Schmerz, Gift, Krankheit' }),
  },
  // Körperlos (incorporeal)
  {
    match: /Körperlos/i,
    parse: () => ({ type: 'immunity', immuneTo: ['physical'], physicalImmune: true, desc: 'Körperlos: Immun gegen physischen Schaden (nur Magie/Geweiht)' }),
  },
  // Fire immunity
  {
    match: /Feuerimmunität|Feuerimm/i,
    parse: () => ({ type: 'damageImmunity', damageType: 'feuer', desc: 'Immun gegen Feuerschaden' }),
  },
  // Fire vulnerability
  {
    match: /Feuerschwäche|Empfindlich.*Feuer/i,
    parse: () => ({ type: 'vulnerability', damageType: 'feuer', multiplier: 2, desc: 'Empfindlich gegen Feuer: doppelter Schaden' }),
  },
  // Silver weakness
  {
    match: /Silberschwäche|Silber/i,
    parse: () => ({ type: 'vulnerability', damageType: 'silber', onlyFullFrom: 'silber', desc: 'Nur Silberwaffen verursachen vollen Schaden' }),
  },
  // Holy vulnerability
  {
    match: /Empfindlich.*Heilig/i,
    parse: () => ({ type: 'vulnerability', damageType: 'heilig', multiplier: 2, desc: 'Doppelter Schaden durch geweihte Waffen' }),
  },
  // Web / Net
  {
    match: /Netzfalle|Netz.*spinnen/i,
    parse: () => ({ type: 'special', effect: 'web', vsProbe: 'IN', condition: 'Fixiert', desc: 'Netzfalle: IN-Probe oder Fixiert' }),
  },
  // Multiple attacks
  {
    match: /Mehrere\s*(?:Köpfe|Tentakel|Angriffe).*?(\d+)/i,
    parse: (m) => ({ type: 'multiAttack', count: parseInt(m[1]), desc: `${m[1]} Angriffe pro Runde` }),
  },
  // Knock-down
  {
    match: /Zu-Fall-Bringen|Niederwerfen/i,
    parse: () => ({ type: 'onHit', effect: 'knockdown', condition: 'Liegend', vsProbe: 'GE', desc: 'Kann Ziel zu Fall bringen (GE-Probe)' }),
  },
  // Grapple
  {
    match: /Umklammern|Umklammerung/i,
    parse: () => ({ type: 'onHit', effect: 'grapple', condition: 'Fixiert', vsProbe: 'KK', desc: 'Umklammerung: KK-Vergleichsprobe oder Fixiert' }),
  },
  // Blood drinking (vampire)
  {
    match: /Bluttrinken/i,
    parse: () => ({ type: 'onHit', effect: 'lifesteal', healFormula: '1W6', desc: 'Heilt 1W6 LeP bei Biss-Treffer' }),
  },
  // Vampiric gaze
  {
    match: /Vampirischer Blick/i,
    parse: () => ({ type: 'special', effect: 'stun', vsProbe: 'SK', duration: 1, desc: 'CH vs SK: Bei Misserfolg 1 KR betäubt' }),
  },
  // Night vision
  {
    match: /Nachtsicht/i,
    parse: () => ({ type: 'passive', effect: 'nightVision', desc: 'Kann im Dunkeln sehen' }),
  },
  // Scent
  {
    match: /Geruchssinn/i,
    parse: () => ({ type: 'passive', effect: 'scent', desc: 'Kann Beute erschnüffeln, Schleichen-Proben erschwert' }),
  },
  // Fire breath
  {
    match: /Feueratem/i,
    parse: () => ({ type: 'special', effect: 'breathWeapon', damageType: 'feuer', damage: '3W6', aoe: true, cooldown: 3, desc: 'Feueratem: 3W6 Feuerschaden, AoE, 3 KR Abklingzeit' }),
  },
  // Climbing (spiders)
  {
    match: /Klettern.*Wänden|Klettern.*Decken/i,
    parse: () => ({ type: 'passive', effect: 'wallClimb', desc: 'Kann an Wänden und Decken laufen' }),
  },
  // Swarm
  {
    match: /Schwarm/i,
    parse: () => ({ type: 'immunity', immuneTo: ['singleTarget'], desc: 'Immun gegen Einzelziel-Angriffe, nur AoE wirksam' }),
  },
]

/**
 * Parse a creature's special_rules array into structured effects.
 * @param {Array} specialRules - Array of strings or {name, description} objects
 * @returns {Array} Parsed effects
 */
export function parseSpecialRules(specialRules) {
  if (!specialRules || !Array.isArray(specialRules)) return []

  const effects = []
  for (const rule of specialRules) {
    const ruleText = typeof rule === 'string' ? rule : (rule.name || rule.description || '')
    let matched = false

    for (const parser of RULE_PARSERS) {
      const m = ruleText.match(parser.match)
      if (m) {
        effects.push({ ...parser.parse(m), source: ruleText })
        matched = true
        break
      }
    }

    if (!matched && ruleText) {
      effects.push({ type: 'unknown', source: ruleText, desc: ruleText })
    }
  }
  return effects
}

/**
 * Get AT modifier from creature's special rules (e.g. Rudelkampf).
 * @param {Object} attacker - Combatant object with specialRules
 * @param {Array} allCombatants - All combatants in battle (for pack tactics counting)
 * @returns {{ atMod: number, details: string[] }}
 */
export function getCreatureAttackModifiers(attacker, allCombatants) {
  const rules = parseSpecialRules(attacker.specialRules)
  let atMod = 0
  const details = []

  for (const rule of rules) {
    if (rule.type === 'packTactics') {
      // Count allies of same base name in melee range and alive
      // Extract base creature name: "Wolf 1" → "Wolf", "Giant Wolf 2" → "Giant Wolf"
      // Strip trailing numbers/spaces to get the base creature type
      const baseName = attacker.name.replace(/\s*\d+$/, '').trim()
      const allyCount = allCombatants.filter(c => {
        if (c.id === attacker.id) return false
        if (c.lep !== undefined && c.lep <= 0) return false
        const otherBase = c.name.replace(/\s*\d+$/, '').trim()
        return otherBase === baseName
      }).length
      const bonus = Math.min(allyCount * rule.atPerAlly, rule.maxBonus)
      if (bonus > 0) {
        atMod += bonus
        details.push(`Rudelkampf: +${bonus} AT (${allyCount} Verbündete)`)
      }
    }
  }

  return { atMod, details }
}

/**
 * Get on-hit effects that should trigger when this creature hits a target.
 * @returns {Array} [{effect, condition, vsProbe, ...}]
 */
export function getOnHitEffects(attacker, weaponName) {
  const rules = parseSpecialRules(attacker.specialRules)
  const effects = []

  // Also check weapon-specific effects from the attack data
  const attackData = attacker.attacks?.find(a => a.name === weaponName) || attacker.attacks?.[0]
  if (attackData?.special) {
    const weaponRuleText = attackData.special
    for (const parser of RULE_PARSERS) {
      const m = weaponRuleText.match(parser.match)
      if (m) {
        const parsed = parser.parse(m)
        if (parsed.type === 'onHit') effects.push(parsed)
      }
    }
  }

  for (const rule of rules) {
    if (rule.type === 'onHit') {
      effects.push(rule)
    }
  }

  return effects
}

/**
 * Get immunities for a creature.
 * @returns {{ conditions: Set<string>, damageTypes: Set<string>, physicalImmune: boolean }}
 */
export function getImmunities(creature) {
  const rules = parseSpecialRules(creature.specialRules)
  const conditions = new Set()
  const damageTypes = new Set()
  let physicalImmune = false

  for (const rule of rules) {
    if (rule.type === 'immunity') {
      if (rule.immuneTo) rule.immuneTo.forEach(i => {
        if (i === 'physical') physicalImmune = true
        else conditions.add(i)
      })
      if (rule.physicalImmune) physicalImmune = true
    }
    if (rule.type === 'damageImmunity') {
      damageTypes.add(rule.damageType)
    }
  }

  return { conditions, damageTypes, physicalImmune }
}

/**
 * Get vulnerabilities for a creature.
 * @returns {Array} [{damageType, multiplier}]
 */
export function getVulnerabilities(creature) {
  const rules = parseSpecialRules(creature.specialRules)
  return rules.filter(r => r.type === 'vulnerability')
}

/**
 * Get passive effects (regeneration, fear aura, etc.) to apply at round start.
 */
export function getRoundStartEffects(creature) {
  const rules = parseSpecialRules(creature.specialRules)
  return rules.filter(r => r.type === 'regeneration' || r.type === 'fearAura')
}

/**
 * Calculate damage multiplier based on creature vulnerabilities and attack damage type.
 */
export function getDamageMultiplier(creature, damageType, isHoly = false) {
  const vulns = getVulnerabilities(creature)
  const immun = getImmunities(creature)
  let mult = 1

  // Check immunity
  if (immun.damageTypes.has(damageType)) return 0
  if (immun.physicalImmune && !['feuer', 'blitz', 'heilig', 'magisch'].includes(damageType) && !isHoly) return 0

  // Check vulnerability
  for (const vuln of vulns) {
    if (vuln.damageType === damageType || (vuln.damageType === 'heilig' && isHoly)) {
      mult = Math.max(mult, vuln.multiplier || 2)
    }
  }

  return mult
}
