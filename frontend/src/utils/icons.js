/**
 * RPG Icon Mapping — Maps creature types, item categories, and entity types
 * to emoji icons for use throughout the app.
 *
 * Usage:
 *   getCreatureIcon('Orkräuber')     → '🪓'
 *   getCreatureIcon(null, 'humanoid') → '🧑'
 *   getItemIcon('Heiltrank')          → '🧪'
 *   getItemIcon(null, 'trank')        → '🧪'
 *   getEntityIcon('creature')         → '💀'
 */

// ── Creature icons by name keyword ──
const CREATURE_NAME_ICONS = {
  // Orcs
  'ork': '🪓', 'orc': '🪓',
  // Goblins
  'goblin': '👺',
  // Undead
  'skelett': '💀', 'zombie': '🧟', 'geist': '👻', 'vampir': '🧛', 'mumie': '🧟', 'lich': '💀',
  // Animals
  'wolf': '🐺', 'ratte': '🐀', 'rat': '🐀', 'baer': '🐻', 'bear': '🐻',
  'schlange': '🐍', 'snake': '🐍', 'spinne': '🕷️', 'spider': '🕷️',
  'adler': '🦅', 'eagle': '🦅', 'fledermaus': '🦇', 'bat': '🦇',
  'wildschwein': '🐗', 'boar': '🐗', 'pferd': '🐴', 'horse': '🐴',
  'hund': '🐕', 'dog': '🐕', 'katze': '🐈', 'cat': '🐈',
  'krokodil': '🐊', 'crocodile': '🐊', 'hai': '🦈', 'shark': '🦈',
  'skorpion': '🦂', 'scorpion': '🦂',
  // Magical
  'drache': '🐉', 'dragon': '🐉', 'wyrm': '🐉', 'lindwurm': '🐉',
  'daemon': '👿', 'demon': '👿', 'teufel': '😈',
  'elementar': '🌀', 'elemental': '🌀',
  'golem': '🗿', 'konstrukt': '🗿',
  'fee': '🧚', 'fairy': '🧚', 'nixe': '🧜', 'kobold': '🧝',
  'troll': '👹', 'oger': '👹', 'riese': '👹', 'giant': '👹',
  'werwolf': '🐺', 'werewolf': '🐺',
  'basilisk': '🦎', 'hydra': '🐉',
  'chimae': '🦁', 'greif': '🦅', 'griffin': '🦅',
  // Plants
  'pflanze': '🌿', 'plant': '🌿', 'ranke': '🌿',
  // Humanoids
  'bandit': '🗡️', 'raeuber': '🗡️', 'dieb': '🗡️',
  'ritter': '⚔️', 'knight': '⚔️', 'soldat': '⚔️', 'wache': '💂',
  'magier': '🧙', 'mage': '🧙', 'schamane': '🧙', 'hexe': '🧙',
  'priester': '⛪', 'priest': '⛪',
  'haendler': '🏪', 'merchant': '🏪', 'wirt': '🍺',
  'bauer': '👨‍🌾', 'koehler': '🪓',
}

// ── Creature icons by category ──
const CREATURE_CATEGORY_ICONS = {
  'humanoid': '🧑', 'tier': '🐾', 'untot': '💀', 'magisch': '✨',
  'elementar': '🌀', 'daemon': '👿', 'feenwesen': '🧚', 'pflanze': '🌿', 'konstrukt': '🗿',
}

// ── Item icons by name keyword ──
const ITEM_NAME_ICONS = {
  // Potions
  'heiltrank': '❤️‍🩹', 'astraltrank': '💜', 'gegengift': '🧬', 'fiebertrank': '🤒',
  'weihwasser': '💧', 'schlaftrank': '😴', 'unsichtbarkeit': '👻',
  'elixier': '⚗️', 'trank': '🧪', 'nachtsicht': '👁️',
  // Weapons
  'schwert': '⚔️', 'axt': '🪓', 'dolch': '🗡️', 'keule': '🏏',
  'speer': '🔱', 'stab': '🪄', 'hammer': '🔨',
  'bogen': '🏹', 'armbrust': '🏹', 'schleuder': '🏹',
  'pfeil': '🏹', 'bolzen': '🏹',
  // Armor
  'kettenhemd': '🛡️', 'lederruestung': '🦺', 'ruestung': '🛡️',
  'helm': '⛑️', 'schild': '🛡️',
  // Tools
  'seil': '🪢', 'fackel': '🔥', 'laterne': '🏮', 'kerze': '🕯️',
  'dietrich': '🔓', 'fernglas': '🔭', 'kompass': '🧭',
  'verbandszeug': '🩹', 'heilkraeuter': '🌿',
  'brecheisen': '🔧', 'schreibzeug': '✒️',
  'kletterausruestung': '🧗', 'tierfalle': '🪤',
  // Food/drink
  'proviant': '🍖', 'brot': '🍞', 'wasser': '💧',
  'bier': '🍺', 'wein': '🍷', 'schnaps': '🥃',
  // Treasure
  'silber': '🪙', 'gold': '💰', 'dukat': '💰',
  'edelstein': '💎', 'schmuck': '💍', 'ring': '💍',
  'krone': '👑', 'muenz': '🪙',
  // Misc
  'schluessel': '🔑', 'karte': '🗺️', 'schriftrolle': '📜', 'brief': '✉️',
  'buch': '📖', 'pergament': '📜',
  'alraune': '🌱', 'kraut': '🌿', 'pflanze': '🌱',
  // Alchemy
  'brandbombe': '💣', 'donnerball': '💥', 'raucherbombe': '💨',
  'gift': '☠️', 'lampenoel': '🛢️',
}

// ── Item icons by category ──
const ITEM_CATEGORY_ICONS = {
  'trank': '🧪', 'werkzeug': '🔧', 'licht': '🔥', 'proviant': '🍖',
  'alchemie': '⚗️', 'munition': '🏹', 'ausruestung': '🎒', 'schatz': '💎',
  'gift': '☠️', 'heilkraut': '🌿', 'verbrauchsmaterial': '📦', 'behaelter': '🎒',
  'unterhaltung': '🎲', 'krankheit': '🤒',
  'Waffe': '⚔️', 'weapon': '⚔️', 'waffe': '⚔️',
}

// ── Entity type icons ──
const ENTITY_ICONS = {
  'player': '🧝', 'creature': '💀', 'npc': '🧑', 'item': '📦', 'landmark': '📍',
}

// ── Spell/Liturgy icons ──
const SPELL_ICONS = {
  'feuer': '🔥', 'eis': '❄️', 'blitz': '⚡', 'heilung': '💚',
  'schutz': '🛡️', 'illusion': '🌀', 'beschwor': '👿', 'verwandlung': '🔄',
  'telekinese': '🫳', 'hellsicht': '👁️', 'angst': '😱', 'schlaf': '😴',
  'laehm': '⛓️', 'gift': '☠️',
}

/**
 * Get icon for a creature by name and/or category.
 */
export function getCreatureIcon(name, category) {
  if (name) {
    const lower = name.toLowerCase()
    for (const [key, icon] of Object.entries(CREATURE_NAME_ICONS)) {
      if (lower.includes(key)) return icon
    }
  }
  if (category) return CREATURE_CATEGORY_ICONS[category] || '💀'
  return '💀'
}

/**
 * Get icon for an item by name and/or category.
 */
export function getItemIcon(name, category) {
  if (name) {
    const lower = name.toLowerCase()
    for (const [key, icon] of Object.entries(ITEM_NAME_ICONS)) {
      if (lower.includes(key)) return icon
    }
  }
  if (category) return ITEM_CATEGORY_ICONS[category] || ITEM_CATEGORY_ICONS[category?.toLowerCase()] || '📦'
  return '📦'
}

/**
 * Get icon for an entity type.
 */
export function getEntityIcon(entityType) {
  return ENTITY_ICONS[entityType] || '📍'
}

/**
 * Get icon for a spell/liturgy by name.
 */
export function getSpellIcon(name) {
  if (!name) return '✨'
  const lower = name.toLowerCase()
  for (const [key, icon] of Object.entries(SPELL_ICONS)) {
    if (lower.includes(key)) return icon
  }
  return '✨'
}

