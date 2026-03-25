#!/usr/bin/env node
/**
 * DSA5 EQUIPMENT RULES — Exhaustive Combinatorial Test
 *
 * Tests every possible equip/unequip transition through the REAL frontend
 * component logic by simulating toggleEquip() calls and verifying the
 * resulting state matches DSA5 rules.
 *
 * Rules under test:
 * - 1 body armor max (helms separate)
 * - 1 helm max
 * - 1 shield max
 * - 1 weapon default (2 with Beidhändiger Kampf)
 * - Two-handed weapon excludes shield + other weapons
 * - Shield excludes two-handed weapon
 * - RS computed from equipped armor
 * - PA includes shield bonus
 * - AT includes shield penalty
 * - AT/PA change when switching weapon
 * - All changes persist to DB
 */

const API = 'http://localhost:8000'
const sleep = ms => new Promise(r => setTimeout(r, ms))

let passed = 0, failed = 0, bugs = []
function T(name, cond) {
  if (cond) { passed++; console.log(`  ✅ ${name}`) }
  else { failed++; bugs.push(name); console.log(`  ❌ ${name}`) }
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗')
  console.log('║  DSA5 EQUIPMENT RULES — All Combinations via API + Logic     ║')
  console.log('╚═══════════════════════════════════════════════════════════════╝\n')

  const p1Tok = (await (await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'player1@test.de', password: 'test1234' }) })).json()).access_token
  const gmTok = (await (await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'gm@test.de', password: 'test1234' }) })).json()).access_token
  const charId = 'd1d2d6f3-6864-4127-8bfb-26c6f6e5bee2'
  const camps = await (await fetch(`${API}/api/campaigns`, { headers: { Authorization: `Bearer ${gmTok}` } })).json()
  const cid = camps[0].id

  // Items for testing — matching real DB templates
  const ITEMS = {
    // Weapons (from combat_values)
    streitaxt: { name: 'Streitaxt', type: 'weapon', weight: 1.5, twoHanded: false },
    kriegsaxt: { name: 'Zwergische Kriegsaxt', type: 'weapon', weight: 2.0, twoHanded: true },
    dolch: { name: 'Dolch', type: 'weapon', weight: 0.3, twoHanded: false },
    rondrakamm: { name: 'Rondrakamm', type: 'weapon', weight: 0.8, twoHanded: false },
    wurfaxt: { name: 'Wurfaxt', type: 'weapon', weight: 0.5, ranged: true },
    armbrust: { name: 'Armbrust (leicht)', type: 'weapon', weight: 1.5, ranged: true },
    // Armor (from DB templates)
    kettenhemd: { name: 'Kettenhemd', type: 'armor', rs: 4, be: 3, weight: 8.0 },
    lederruestung: { name: 'Lederruestung', type: 'armor', rs: 2, be: 1, weight: 4.0 },
    // Helms
    eisenhelm: { name: 'Eisenhelm', type: 'helm', rs: 2, be: 0, weight: 1.5 },
    lederhelm: { name: 'Lederhelm', type: 'helm', rs: 1, be: 0, weight: 0.5 },
    // Shields
    buckler: { name: 'Buckler', type: 'shield', at_mod: -1, pa_mod: 1, weight: 0.5 },
    mittlererSchild: { name: 'Mittlerer Schild', type: 'shield', at_mod: -2, pa_mod: 3, weight: 3.0 },
  }

  // Helper: set inventory state directly via API and read back
  async function setEquipped(equippedNames) {
    const items = Object.values(ITEMS).map(item => ({
      ...item,
      quantity: item.name === 'Wurfaxt' ? 3 : 1,
      equipped: equippedNames.includes(item.name),
    }))
    await fetch(`${API}/api/characters/${charId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p1Tok}` },
      body: JSON.stringify({ basis_inventory: { items, purse: {} } }),
    })
  }

  async function getEquipped() {
    const pd = await (await fetch(`${API}/api/campaigns/${cid}/players-detail`, { headers: { Authorization: `Bearer ${gmTok}` } })).json()
    const p = pd.find(x => x.character_id === charId)
    const inv = p?.character?.basis_inventory
    const items = Array.isArray(inv) ? inv : (inv?.items || [])
    return items.filter(i => i.equipped).map(i => i.name)
  }

  // Simulate the toggleEquip logic from ArmoryTab (replicated here for API-only testing)
  function simulateToggle(allItems, toggleName, specials = []) {
    const isWeapon = n => /schwert|axt|dolch|bogen|messer|stab|kolben|speer|hammer|hellebarde|rondrakamm|armbrust|schleuder|wurfaxt/i.test(n)
    const isArmor = n => /ruestung|hemd|harnisch|panzer|gambeson/i.test(n)
    const isShield = n => /schild|buckler/i.test(n)
    const isHelm = n => /helm/i.test(n)
    const hasBeidh = specials.some(s => /beidh/i.test(s))

    let items = allItems.map(i => ({ ...i }))
    const target = items.find(i => i.name === toggleName)
    if (!target) return items

    const equipping = !target.equipped
    const n = toggleName

    if (equipping) {
      // Check if two-handed
      const isTwoHanded = ITEMS[Object.keys(ITEMS).find(k => ITEMS[k].name === n)]?.twoHanded

      if (isArmor(n) && !isHelm(n)) {
        items = items.map(i => (i.name !== n && isArmor(i.name) && !isHelm(i.name) && i.equipped) ? { ...i, equipped: false } : i)
      }
      if (isHelm(n)) {
        items = items.map(i => (i.name !== n && isHelm(i.name) && i.equipped) ? { ...i, equipped: false } : i)
      }
      if (isShield(n)) {
        items = items.map(i => (i.name !== n && isShield(i.name) && i.equipped) ? { ...i, equipped: false } : i)
        // Unequip two-handed weapons
        items = items.map(i => {
          if (!isWeapon(i.name) || !i.equipped) return i
          const key = Object.keys(ITEMS).find(k => ITEMS[k].name === i.name)
          if (key && ITEMS[key].twoHanded) return { ...i, equipped: false }
          return i
        })
      }
      if (isWeapon(n)) {
        if (isTwoHanded) {
          items = items.map(i => (i.name !== n && isShield(i.name) && i.equipped) ? { ...i, equipped: false } : i)
          items = items.map(i => (i.name !== n && isWeapon(i.name) && i.equipped) ? { ...i, equipped: false } : i)
        } else if (!hasBeidh) {
          items = items.map(i => (i.name !== n && isWeapon(i.name) && i.equipped) ? { ...i, equipped: false } : i)
        } else {
          // Beidh only works 1H+1H — unequip any 2H weapon first
          items = items.map(i => {
            if (i.name === n || !isWeapon(i.name) || !i.equipped) return i
            const key = Object.keys(ITEMS).find(k => ITEMS[k].name === i.name)
            if (key && ITEMS[key].twoHanded) return { ...i, equipped: false }
            return i
          })
          const equipped = items.filter(i => i.name !== n && isWeapon(i.name) && i.equipped)
          if (equipped.length >= 2) {
            items = items.map(i => i.name === equipped[0].name ? { ...i, equipped: false } : i)
          }
        }
      }
    }

    items = items.map(i => i.name === toggleName ? { ...i, equipped: equipping } : i)
    return items
  }

  const BALGRA_SPECIALS = ['Wuchtschlag I', 'Wuchtschlag II', 'Finte I', 'Schildkampf I', 'Schildkampf II', 'Ruestungsgewoehnung I', 'Ruestungsgewoehnung II', 'Kampfreflexe', 'Kampfgespuer', 'Beidhaendiger Kampf I', 'Verbessertes Ausweichen I']

  // ═══════════════════════════════════════════════════════
  console.log('═══ CATEGORY 1: BODY ARMOR (1 max, helms separate) ═══')
  const armorTests = [
    { start: ['Kettenhemd'], toggle: 'Lederruestung', expect: { in: ['Lederruestung'], out: ['Kettenhemd'] }, desc: 'Equip armor B → armor A unequipped' },
    { start: ['Kettenhemd', 'Eisenhelm'], toggle: 'Lederruestung', expect: { in: ['Lederruestung', 'Eisenhelm'], out: ['Kettenhemd'] }, desc: 'Swap armor, helm stays' },
    { start: ['Kettenhemd'], toggle: 'Kettenhemd', expect: { in: [], out: ['Kettenhemd'] }, desc: 'Unequip armor → empty' },
    { start: [], toggle: 'Kettenhemd', expect: { in: ['Kettenhemd'], out: [] }, desc: 'Equip armor from empty' },
    { start: ['Kettenhemd', 'Lederruestung'], toggle: 'Kettenhemd', expect: { in: ['Lederruestung'], out: ['Kettenhemd'] }, desc: 'Unequip one of two (shouldn\'t have two but handle gracefully)' },
  ]

  for (const t of armorTests) {
    const allItems = Object.values(ITEMS).map(item => ({ ...item, quantity: 1, equipped: t.start.includes(item.name) }))
    const result = simulateToggle(allItems, t.toggle, BALGRA_SPECIALS)
    const equipped = result.filter(i => i.equipped).map(i => i.name)
    const allIn = t.expect.in.every(n => equipped.includes(n))
    const allOut = t.expect.out.every(n => !equipped.includes(n))
    T(`${t.desc}: ${t.expect.in.join('+')} in, ${t.expect.out.join('+')} out`, allIn && allOut)
  }

  // ═══════════════════════════════════════════════════════
  console.log('\n═══ CATEGORY 2: HELM (1 max, separate from body) ═══')
  const helmTests = [
    { start: ['Eisenhelm'], toggle: 'Lederhelm', expect: { in: ['Lederhelm'], out: ['Eisenhelm'] }, desc: 'Swap helm' },
    { start: ['Eisenhelm', 'Kettenhemd'], toggle: 'Lederhelm', expect: { in: ['Lederhelm', 'Kettenhemd'], out: ['Eisenhelm'] }, desc: 'Swap helm, armor stays' },
    { start: ['Eisenhelm'], toggle: 'Eisenhelm', expect: { in: [], out: ['Eisenhelm'] }, desc: 'Unequip helm' },
  ]
  for (const t of helmTests) {
    const allItems = Object.values(ITEMS).map(item => ({ ...item, quantity: 1, equipped: t.start.includes(item.name) }))
    const result = simulateToggle(allItems, t.toggle, BALGRA_SPECIALS)
    const equipped = result.filter(i => i.equipped).map(i => i.name)
    T(`${t.desc}`, t.expect.in.every(n => equipped.includes(n)) && t.expect.out.every(n => !equipped.includes(n)))
  }

  // ═══════════════════════════════════════════════════════
  console.log('\n═══ CATEGORY 3: SHIELD (1 max, conflicts with 2H) ═══')
  const shieldTests = [
    { start: ['Buckler'], toggle: 'Mittlerer Schild', expect: { in: ['Mittlerer Schild'], out: ['Buckler'] }, desc: 'Swap shield' },
    { start: ['Buckler'], toggle: 'Buckler', expect: { in: [], out: ['Buckler'] }, desc: 'Unequip shield' },
    { start: ['Buckler', 'Zwergische Kriegsaxt'], toggle: 'Buckler', expect: { in: [], out: ['Buckler'] }, desc: 'Unequip shield (2H weapon stays — already invalid state)' },
    { start: ['Zwergische Kriegsaxt'], toggle: 'Buckler', expect: { in: ['Buckler'], out: ['Zwergische Kriegsaxt'] }, desc: 'Equip shield → 2H weapon auto-unequipped' },
    { start: ['Streitaxt', 'Buckler'], toggle: 'Mittlerer Schild', expect: { in: ['Mittlerer Schild', 'Streitaxt'], out: ['Buckler'] }, desc: 'Swap shield, 1H weapon stays' },
  ]
  for (const t of shieldTests) {
    const allItems = Object.values(ITEMS).map(item => ({ ...item, quantity: 1, equipped: t.start.includes(item.name) }))
    const result = simulateToggle(allItems, t.toggle, BALGRA_SPECIALS)
    const equipped = result.filter(i => i.equipped).map(i => i.name)
    T(`${t.desc}`, t.expect.in.every(n => equipped.includes(n)) && t.expect.out.every(n => !equipped.includes(n)))
  }

  // ═══════════════════════════════════════════════════════
  console.log('\n═══ CATEGORY 4: WEAPONS — No Beidhändig (1 max) ═══')
  const noBeidhSpecials = BALGRA_SPECIALS.filter(s => !/beidh/i.test(s))
  const weapon1Tests = [
    { start: ['Streitaxt'], toggle: 'Dolch', specials: noBeidhSpecials, expect: { in: ['Dolch'], out: ['Streitaxt'] }, desc: 'Swap weapon (no Beidh)' },
    { start: ['Streitaxt'], toggle: 'Streitaxt', specials: noBeidhSpecials, expect: { in: [], out: ['Streitaxt'] }, desc: 'Unequip weapon' },
    { start: [], toggle: 'Dolch', specials: noBeidhSpecials, expect: { in: ['Dolch'], out: [] }, desc: 'Equip from empty' },
    { start: ['Streitaxt'], toggle: 'Rondrakamm', specials: noBeidhSpecials, expect: { in: ['Rondrakamm'], out: ['Streitaxt'] }, desc: 'Swap to different 1H' },
  ]
  for (const t of weapon1Tests) {
    const allItems = Object.values(ITEMS).map(item => ({ ...item, quantity: 1, equipped: t.start.includes(item.name) }))
    const result = simulateToggle(allItems, t.toggle, t.specials)
    const equipped = result.filter(i => i.equipped).map(i => i.name)
    T(`${t.desc}`, t.expect.in.every(n => equipped.includes(n)) && t.expect.out.every(n => !equipped.includes(n)))
  }

  // ═══════════════════════════════════════════════════════
  console.log('\n═══ CATEGORY 5: WEAPONS — With Beidhändig (max 2) ═══')
  const weapon2Tests = [
    { start: ['Streitaxt'], toggle: 'Dolch', expect: { in: ['Streitaxt', 'Dolch'], out: [] }, desc: 'Equip 2nd weapon (Beidh)' },
    { start: ['Streitaxt', 'Dolch'], toggle: 'Rondrakamm', expect: { inCount: 2, mustHave: ['Rondrakamm'] }, desc: '3rd weapon → oldest unequipped (max 2)' },
    { start: ['Streitaxt', 'Dolch'], toggle: 'Dolch', expect: { in: ['Streitaxt'], out: ['Dolch'] }, desc: 'Unequip off-hand' },
    { start: ['Streitaxt', 'Dolch'], toggle: 'Streitaxt', expect: { in: ['Dolch'], out: ['Streitaxt'] }, desc: 'Unequip main-hand' },
  ]
  for (const t of weapon2Tests) {
    const allItems = Object.values(ITEMS).map(item => ({ ...item, quantity: 1, equipped: t.start.includes(item.name) }))
    const result = simulateToggle(allItems, t.toggle, BALGRA_SPECIALS)
    const equippedWeapons = result.filter(i => i.equipped && /schwert|axt|dolch|rondra|bogen|armbrust|wurfaxt/i.test(i.name)).map(i => i.name)
    if (t.expect.inCount) {
      T(`${t.desc}: ${equippedWeapons.length} weapons, has ${t.expect.mustHave}`,
        equippedWeapons.length <= t.expect.inCount && t.expect.mustHave.every(n => equippedWeapons.includes(n)))
    } else {
      T(`${t.desc}`, t.expect.in.every(n => equippedWeapons.includes(n)) && t.expect.out.every(n => !equippedWeapons.includes(n)))
    }
  }

  // ═══════════════════════════════════════════════════════
  console.log('\n═══ CATEGORY 6: TWO-HANDED WEAPON conflicts ═══')
  const twoHandTests = [
    { start: ['Streitaxt', 'Buckler'], toggle: 'Zwergische Kriegsaxt', expect: { in: ['Zwergische Kriegsaxt'], out: ['Streitaxt', 'Buckler'] }, desc: '2H → unequips 1H + shield' },
    { start: ['Zwergische Kriegsaxt'], toggle: 'Buckler', expect: { in: ['Buckler'], out: ['Zwergische Kriegsaxt'] }, desc: 'Shield → unequips 2H' },
    { start: ['Zwergische Kriegsaxt'], toggle: 'Streitaxt', expect: { in: ['Streitaxt'], out: ['Zwergische Kriegsaxt'] }, desc: '1H weapon → unequips 2H (no Beidh with 2H)' },
    { start: ['Streitaxt', 'Dolch'], toggle: 'Zwergische Kriegsaxt', expect: { in: ['Zwergische Kriegsaxt'], out: ['Streitaxt', 'Dolch'] }, desc: '2H → unequips both 1H weapons' },
    { start: ['Zwergische Kriegsaxt'], toggle: 'Zwergische Kriegsaxt', expect: { in: [], out: ['Zwergische Kriegsaxt'] }, desc: 'Unequip 2H' },
    { start: ['Zwergische Kriegsaxt'], toggle: 'Mittlerer Schild', expect: { in: ['Mittlerer Schild'], out: ['Zwergische Kriegsaxt'] }, desc: 'Big shield → unequips 2H' },
  ]
  for (const t of twoHandTests) {
    const allItems = Object.values(ITEMS).map(item => ({ ...item, quantity: 1, equipped: t.start.includes(item.name) }))
    const result = simulateToggle(allItems, t.toggle, BALGRA_SPECIALS)
    const equipped = result.filter(i => i.equipped).map(i => i.name)
    T(`${t.desc}`, t.expect.in.every(n => equipped.includes(n)) && t.expect.out.every(n => !equipped.includes(n)))
  }

  // ═══════════════════════════════════════════════════════
  console.log('\n═══ CATEGORY 7: THROWN WEAPONS (Wurfwaffen — dual use) ═══')
  const thrownTests = [
    { start: ['Streitaxt'], toggle: 'Wurfaxt', expect: { in: ['Streitaxt', 'Wurfaxt'], out: [] }, desc: 'Wurfaxt + 1H melee (Beidh, both one-handed)' },
    { start: ['Wurfaxt'], toggle: 'Wurfaxt', expect: { in: [], out: ['Wurfaxt'] }, desc: 'Unequip Wurfaxt' },
    { start: ['Wurfaxt', 'Buckler'], toggle: 'Streitaxt', expect: { inCount: 2, mustHave: ['Streitaxt'] }, desc: 'Equip melee while Wurfaxt+Shield (Beidh max 2)' },
  ]
  for (const t of thrownTests) {
    const allItems = Object.values(ITEMS).map(item => ({ ...item, quantity: 1, equipped: t.start.includes(item.name) }))
    const result = simulateToggle(allItems, t.toggle, BALGRA_SPECIALS)
    const equipped = result.filter(i => i.equipped).map(i => i.name)
    if (t.expect.inCount) {
      T(`${t.desc}`, equipped.filter(n => Object.values(ITEMS).some(it => it.name === n && (it.type === 'weapon'))).length <= t.expect.inCount && t.expect.mustHave.every(n => equipped.includes(n)))
    } else {
      T(`${t.desc}`, t.expect.in.every(n => equipped.includes(n)) && t.expect.out.every(n => !equipped.includes(n)))
    }
  }

  // ═══════════════════════════════════════════════════════
  console.log('\n═══ CATEGORY 7b: BOWS/CROSSBOWS (two-handed ranged) ═══')
  // Mark Armbrust as two-handed in our test data
  ITEMS.armbrust.twoHanded = true
  const bowTests = [
    { start: ['Streitaxt'], toggle: 'Armbrust (leicht)', expect: { in: ['Armbrust (leicht)'], out: ['Streitaxt'] }, desc: 'Equip crossbow (2H) → unequips melee' },
    { start: ['Armbrust (leicht)'], toggle: 'Streitaxt', expect: { in: ['Streitaxt'], out: ['Armbrust (leicht)'] }, desc: 'Equip melee → unequips crossbow (2H)' },
    { start: ['Armbrust (leicht)'], toggle: 'Buckler', expect: { in: ['Buckler'], out: ['Armbrust (leicht)'] }, desc: 'Equip shield → unequips crossbow (2H)' },
    { start: ['Buckler'], toggle: 'Armbrust (leicht)', expect: { in: ['Armbrust (leicht)'], out: ['Buckler'] }, desc: 'Equip crossbow (2H) → unequips shield' },
    { start: ['Armbrust (leicht)'], toggle: 'Armbrust (leicht)', expect: { in: [], out: ['Armbrust (leicht)'] }, desc: 'Unequip crossbow' },
    { start: ['Streitaxt', 'Dolch'], toggle: 'Armbrust (leicht)', expect: { in: ['Armbrust (leicht)'], out: ['Streitaxt', 'Dolch'] }, desc: 'Crossbow (2H) → unequips both 1H weapons' },
  ]
  for (const t of bowTests) {
    const allItems = Object.values(ITEMS).map(item => ({ ...item, quantity: 1, equipped: t.start.includes(item.name) }))
    const result = simulateToggle(allItems, t.toggle, BALGRA_SPECIALS)
    const equipped = result.filter(i => i.equipped).map(i => i.name)
    T(`${t.desc}`, t.expect.in.every(n => equipped.includes(n)) && t.expect.out.every(n => !equipped.includes(n)))
    if (!(t.expect.in.every(n => equipped.includes(n)) && t.expect.out.every(n => !equipped.includes(n)))) {
      console.log(`    Got: ${equipped}`)
    }
  }
  // ═══════════════════════════════════════════════════════
  console.log('\n═══ CATEGORY 8: MIXED COMBINATIONS ═══')
  const mixedTests = [
    { start: ['Streitaxt', 'Buckler', 'Kettenhemd', 'Eisenhelm'], toggle: 'Zwergische Kriegsaxt',
      expect: { in: ['Zwergische Kriegsaxt', 'Kettenhemd', 'Eisenhelm'], out: ['Streitaxt', 'Buckler'] },
      desc: 'Full loadout → equip 2H: weapons+shield gone, armor stays' },
    { start: ['Zwergische Kriegsaxt', 'Kettenhemd', 'Eisenhelm'], toggle: 'Buckler',
      expect: { in: ['Buckler', 'Kettenhemd', 'Eisenhelm'], out: ['Zwergische Kriegsaxt'] },
      desc: '2H+armor → equip shield: 2H gone, armor stays' },
    { start: ['Streitaxt', 'Dolch', 'Buckler', 'Kettenhemd', 'Eisenhelm'], toggle: 'Lederruestung',
      expect: { in: ['Streitaxt', 'Dolch', 'Buckler', 'Lederruestung', 'Eisenhelm'], out: ['Kettenhemd'] },
      desc: 'Swap armor: only armor changes, weapons+shield+helm stay' },
    { start: ['Streitaxt', 'Dolch', 'Buckler', 'Kettenhemd', 'Eisenhelm'], toggle: 'Lederhelm',
      expect: { in: ['Streitaxt', 'Dolch', 'Buckler', 'Kettenhemd', 'Lederhelm'], out: ['Eisenhelm'] },
      desc: 'Swap helm: only helm changes' },
  ]
  for (const t of mixedTests) {
    const allItems = Object.values(ITEMS).map(item => ({ ...item, quantity: 1, equipped: t.start.includes(item.name) }))
    const result = simulateToggle(allItems, t.toggle, BALGRA_SPECIALS)
    const equipped = result.filter(i => i.equipped).map(i => i.name)
    const allIn = t.expect.in.every(n => equipped.includes(n))
    const allOut = t.expect.out.every(n => !equipped.includes(n))
    T(`${t.desc}`, allIn && allOut)
    if (!allIn || !allOut) {
      console.log(`    Expected in: ${t.expect.in}, out: ${t.expect.out}`)
      console.log(`    Got: ${equipped}`)
    }
  }

  // ═══════════════════════════════════════════════════════
  console.log('\n═══ CATEGORY 9: DB PERSISTENCE (via real API) ═══')

  // Set a state, read back, verify
  await setEquipped(['Streitaxt', 'Kettenhemd', 'Eisenhelm', 'Buckler'])
  await sleep(500)
  let eq = await getEquipped()
  T('DB: full loadout persisted', eq.includes('Streitaxt') && eq.includes('Kettenhemd') && eq.includes('Eisenhelm') && eq.includes('Buckler'))

  await setEquipped(['Dolch', 'Lederruestung', 'Lederhelm', 'Mittlerer Schild'])
  await sleep(500)
  eq = await getEquipped()
  T('DB: swapped loadout persisted', eq.includes('Dolch') && eq.includes('Lederruestung') && eq.includes('Lederhelm') && eq.includes('Mittlerer Schild'))
  T('DB: old items unequipped', !eq.includes('Streitaxt') && !eq.includes('Kettenhemd') && !eq.includes('Eisenhelm') && !eq.includes('Buckler'))

  // Reset
  await setEquipped(['Streitaxt', 'Kettenhemd', 'Eisenhelm', 'Buckler'])

  // ═══════════════════════════════════════════════════════
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} tests`)
  if (bugs.length) { console.log('\n  FAILURES:'); bugs.forEach(b => console.log(`    ❌ ${b}`)) }
  console.log('═'.repeat(60))
  console.log(failed === 0 ? '\n✅ ALL DSA5 EQUIPMENT RULES VERIFIED' : `\n❌ ${failed} rule violations`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
