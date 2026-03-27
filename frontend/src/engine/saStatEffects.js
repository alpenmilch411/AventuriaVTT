/**
 * DSA5 Special Ability → Derived Stat Effects.
 *
 * Detects passive combat stat modifiers from a character's special abilities list.
 * E.g. Kampfreflexe → +2 INI, Verbessertes Ausweichen I → +2 AW.
 *
 * Used by VitalsBar (player side) and PlayerOverview (GM side).
 */

/** SA effect rules keyed by stat. Higher-level SFs can supersede lower ones. */
const SA_STAT_CHECKS = {
  'INI': [
    { match: /kampfreflexe/i, val: 2, label: 'Kampfreflexe' },
  ],
  'AW': [
    { match: /verbessertes ausweichen.*II|verbessertes ausweichen.*2/i, val: 4, label: 'Verbessertes Ausweichen II' },
    { match: /verbessertes ausweichen.*I|verbessertes ausweichen(?!.*II)/i, val: 2, label: 'Verbessertes Ausweichen I' },
    { match: /kampfgesp/i, val: 1, label: 'Kampfgespür' },
  ],
  'PA': [
    { match: /schildkampf.*II/i, val: 2, label: 'Schildkampf II', supersedes: /schildkampf.*I/i },
    { match: /schildkampf.*I/i, val: 1, label: 'Schildkampf I' },
    { match: /kampfgesp/i, val: 1, label: 'Kampfgespür' },
  ],
  'BE': [
    { match: /stungsgew.*II|stungsgewöhnung.*II/i, val: -2, label: 'Rüstungsgewöhnung II', supersedes: /stungsgew.*I/i },
    { match: /stungsgew.*I|stungsgewöhnung.*I/i, val: -1, label: 'Rüstungsgewöhnung I' },
  ],
}

/**
 * Get SA-based stat modifiers for a given stat.
 * @param {string} stat - 'INI', 'AW', 'PA', or 'BE'
 * @param {string[]} specialAbilities - character's SA name list
 * @returns {{ val: number, label: string }[]} matching effects
 */
export function getSAStatEffects(stat, specialAbilities) {
  const checks = SA_STAT_CHECKS[stat]
  if (!checks || !specialAbilities?.length) return []

  const results = []
  const superseded = new Set()

  // First pass: find superseding SFs
  for (const sf of specialAbilities) {
    for (const c of checks) {
      if (c.match.test(sf) && c.supersedes) {
        for (const sf2 of specialAbilities) {
          if (c.supersedes.test(sf2) && sf2 !== sf) superseded.add(sf2)
        }
      }
    }
  }

  // Second pass: collect matching effects
  for (const sf of specialAbilities) {
    if (superseded.has(sf)) continue
    for (const c of checks) {
      if (c.match.test(sf)) {
        results.push({ val: c.val, label: c.label })
        break
      }
    }
  }
  return results
}
