/**
 * Shared item classification via DB template_id lookups.
 * Replaces all regex/name-based item classification across the codebase.
 *
 * Every inventory item carries a `template_id` referencing its databank entry.
 * Classification uses the DB entry's category/type, NOT regex on the name.
 */

/**
 * Find the template for an item across all template arrays.
 * Returns { template, type } or null.
 *
 * @param {object} item - Inventory item (must have template_id or name)
 * @param {object} templates - { weaponTemplates, armorTemplates, shieldTemplates }
 */
export function findTemplate(item, templates) {
  const { weaponTemplates = [], armorTemplates = [], shieldTemplates = [] } = templates

  // Primary: lookup by template_id
  if (item.template_id) {
    const wt = weaponTemplates.find(t => t.id === item.template_id)
    if (wt) return { template: wt, type: 'weapon' }
    const at = armorTemplates.find(t => t.id === item.template_id)
    if (at) return { template: at, type: 'armor' }
    const st = shieldTemplates.find(t => t.id === item.template_id)
    if (st) return { template: st, type: 'shield' }
  }

  // Legacy fallback: match by name across template arrays
  if (item.name) {
    const norm = s => s.toLowerCase().replace(/[\u00e4\u00f6\u00fc\u00df]/g, m => ({ '\u00e4':'ae','\u00f6':'oe','\u00fc':'ue','\u00df':'ss' }[m]||m))
    const itemNorm = norm(item.name)

    const nameMatch = (tpl) => {
      const tplNorm = norm(tpl.name)
      return itemNorm.includes(tplNorm.split(' ')[0]) || tplNorm.includes(itemNorm.split(' ')[0])
    }

    const wt = weaponTemplates.find(nameMatch)
    if (wt) return { template: wt, type: 'weapon' }
    const st = shieldTemplates.find(t => {
      const tplNorm = norm(t.name)
      return itemNorm.includes(tplNorm.split('/')[0].trim()) || tplNorm.includes(itemNorm.split(' ')[0])
    })
    if (st) return { template: st, type: 'shield' }
    const at = armorTemplates.find(nameMatch)
    if (at) return { template: at, type: 'armor' }
  }

  return null
}

/**
 * Classify an item as 'weapon', 'armor', 'shield', or 'other'.
 */
export function classifyItem(item, templates) {
  return findTemplate(item, templates)?.type || 'other'
}

/**
 * Check if item is a weapon. Enriched items have _type === 'weapon'.
 */
export function isWeapon(item, templates) {
  if (item._type === 'weapon') return true
  return classifyItem(item, templates) === 'weapon'
}

/**
 * Check if item is armor. Enriched items have _type === 'armor'.
 */
export function isArmor(item, templates) {
  if (item._type === 'armor') return true
  return classifyItem(item, templates) === 'armor'
}

/**
 * Check if item is a shield. Enriched items have _type === 'shield'.
 */
export function isShield(item, templates) {
  if (item._type === 'shield') return true
  return classifyItem(item, templates) === 'shield'
}

/**
 * Check if item is a helm. Helms are a subset of armor templates
 * where the name contains 'helm'. Enriched items have _type === 'armor'
 * and can be checked by name.
 */
export function isHelm(item, templates) {
  if (item._type === 'armor' && /helm/i.test(item.name)) return true
  const result = findTemplate(item, templates)
  if (!result || result.type !== 'armor') return false
  return /helm/i.test(result.template.name)
}

/**
 * Check if item is a magic focus (Magierstab, Zauberstab, etc.).
 * Enriched items carry `is_focus: true` from the backend. Falls back to
 * template name matching for unenriched items.
 */
export function isFocus(item, templates) {
  if (item.is_focus === true) return true
  const result = findTemplate(item, templates)
  if (!result || result.type !== 'weapon') return false
  return /magierstab|zauberstab|kristallkugel|fokus/i.test(result.template.name)
}
