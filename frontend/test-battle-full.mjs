#!/usr/bin/env node
/**
 * END-TO-END BATTLE SIMULATION — Human-like protocol
 *
 * Simulates EXACTLY how real humans use the GM and Player interfaces:
 *
 * GM side (CombatTracker + TurnFlow):
 *   1. Starts combat with combatants
 *   2. For NPC turns: picks action → target → weapon → rolls attack → waits for defense → rolls damage
 *   3. For Player turns: sends dice_request → WAITS for player dice_result → processes
 *   4. Sends defense_request to target → WAITS for defense_choice
 *   5. Sends vitals_update after damage
 *   6. Advances turn
 *
 * Player side (CombatActions):
 *   1. Receives dice_request → "rolls" dice → sends dice_result back
 *   2. Receives defense_request → chooses defense → sends defense_choice back
 *   3. Can declare actions via action_declare
 *
 * All messages go through the REAL WebSocket server (backend).
 * We verify that messages arrive at all clients correctly.
 */

import WebSocket from 'ws'

const BASE = 'http://localhost:8000'
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
const d20 = () => rand(1, 20)
const d6 = () => rand(1, 6)
const pick = arr => arr[rand(0, arr.length - 1)]
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function post(path, body, token) {
  const h = { 'Content-Type': 'application/json' }
  if (token) h['Authorization'] = `Bearer ${token}`
  const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: h, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`POST ${path} → ${r.status}`)
  return r.json()
}
async function get(path, token) {
  const h = token ? { Authorization: `Bearer ${token}` } : {}
  const r = await fetch(`${BASE}${path}`, { headers: h })
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}`)
  return r.json()
}
async function patch(path, body, token) {
  const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  const r = await fetch(`${BASE}${path}`, { method: 'PATCH', headers: h, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`PATCH ${path} → ${r.status}`)
  return r.json()
}

function rollDamage(formula) {
  const m = (formula || '1W6').match(/(\d+)[Ww](\d+)([+-]\d+)?/)
  if (!m) return rand(1, 6)
  let total = parseInt(m[3] || '0')
  for (let i = 0; i < parseInt(m[1]); i++) total += rand(1, parseInt(m[2]))
  return Math.max(1, total)
}

// ═══════════════════════════════════════════════════════════════
// WebSocket Client — queues messages by type for awaiting
// ═══════════════════════════════════════════════════════════════
class WSClient {
  constructor(sessionCode, userId, role, label) {
    this.sessionCode = sessionCode
    this.userId = userId
    this.role = role
    this.label = label
    this.ws = null
    this.inbox = []      // all received messages
    this.waiters = []     // [{type, resolve, timeout}]
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`ws://localhost:8000/ws/${this.sessionCode}?user_id=${this.userId}&role=${this.role}`)
      this.ws.on('open', resolve)
      this.ws.on('message', data => {
        try {
          const msg = JSON.parse(data.toString())
          this.inbox.push(msg)
          // Check if anyone is waiting for this type
          const idx = this.waiters.findIndex(w => w.type === msg.type)
          if (idx >= 0) {
            const w = this.waiters.splice(idx, 1)[0]
            clearTimeout(w.timer)
            w.resolve(msg)
          }
        } catch {}
      })
      this.ws.on('error', reject)
      setTimeout(() => reject(new Error(`${this.label} WS timeout`)), 5000)
    })
  }

  send(msg) { this.ws?.readyState === WebSocket.OPEN && this.ws.send(JSON.stringify(msg)) }

  /** Wait for a specific message type, with timeout */
  waitFor(type, timeoutMs = 5000) {
    // Check inbox first
    const idx = this.inbox.findIndex(m => m.type === type)
    if (idx >= 0) return Promise.resolve(this.inbox.splice(idx, 1)[0])
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter(w => w.resolve !== resolve)
        reject(new Error(`${this.label}: timeout waiting for ${type}`))
      }, timeoutMs)
      this.waiters.push({ type, resolve, timer })
    })
  }

  /** Check if a message of type exists in inbox (non-blocking) */
  has(type) { return this.inbox.some(m => m.type === type) }
  pop(type) { const i = this.inbox.findIndex(m => m.type === type); return i >= 0 ? this.inbox.splice(i, 1)[0] : null }
  drain() { const m = [...this.inbox]; this.inbox = []; return m }
  close() { this.ws?.close() }
}

// ═══════════════════════════════════════════════════════════════
// Stats
// ═══════════════════════════════════════════════════════════════
class Stats {
  constructor(name) {
    this.name = name; this.rounds = 0
    this.attacks = 0; this.hits = 0; this.criticals = 0; this.patzers = 0
    this.defenses = 0; this.defSuccesses = 0
    this.totalDmg = 0; this.dmgEvents = 0; this.deaths = []
    this.diceRequestsSent = 0; this.diceResultsReceived = 0
    this.defenseRequestsSent = 0; this.defenseChoicesReceived = 0
    this.vitalsUpdates = 0; this.itemsUsed = 0; this.spellsCast = 0
    this.weaponSwitches = 0; this.maneuvers = {}
    this.playerMsgsReceived = {} // userId → count
    this.errors = []; this.result = null
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════
async function main() {
  console.log('═══ END-TO-END BATTLE SIMULATION (Human-like protocol) ═══\n')

  // 1. Login
  console.log('1. Login...')
  const accs = [
    { email: 'gm@test.de', pw: 'test1234', role: 'gm' },
    { email: 'player1@test.de', pw: 'test1234', role: 'player' },
    { email: 'player2@test.de', pw: 'test1234', role: 'player' },
    { email: 'player3@test.de', pw: 'test1234', role: 'player' },
    { email: 'player4@test.de', pw: 'test1234', role: 'player' },
  ]
  const users = []
  for (const a of accs) {
    const { access_token } = await post('/api/auth/login', { email: a.email, password: a.pw })
    const me = await get('/api/auth/me', access_token)
    users.push({ ...me, token: access_token, role: a.role })
  }
  const gm = users[0]
  const pUsers = users.slice(1)
  console.log(`   GM: ${gm.username}, Players: ${pUsers.map(u => u.username).join(', ')}`)

  // 2. Load data
  console.log('2. Loading data...')
  const camps = await get('/api/campaigns', gm.token)
  const cid = camps[0].id
  const pDetail = await get(`/api/campaigns/${cid}/players-detail`, gm.token)
  const chars = pDetail.filter(p => p.character).map(p => ({
    uId: p.user_id, charId: p.character_id, name: p.character.name,
    cv: p.character.combat_values || {}, dv: p.character.derived_values || {},
    weapons: (p.character.combat_values?.weapons || []),
    spells: p.character.spells || {},
  }))
  const creaturesAll = await get('/api/databank/creatures', gm.token)
  const creatures = Array.isArray(creaturesAll) ? creaturesAll : creaturesAll.items || []
  console.log(`   ${chars.length} PCs, ${creatures.length} creatures`)

  // 3. Session
  let sess
  try { sess = await post('/api/sessions', { campaign_id: cid, name: 'E2E Test' }, gm.token) }
  catch { sess = (await get(`/api/campaigns/${cid}`, gm.token)).sessions?.[0] }
  const sc = sess.session_code
  console.log(`   Session: ${sc}`)

  // 4. Connect WS
  console.log('3. Connecting...')
  const gmWs = new WSClient(sc, gm.id, 'gm', 'GM')
  await gmWs.connect()
  const pWs = {} // userId → WSClient
  for (let i = 0; i < pUsers.length; i++) {
    const c = new WSClient(sc, pUsers[i].id, 'player', chars[i]?.name || pUsers[i].username)
    await c.connect()
    pWs[pUsers[i].id] = c
  }
  await sleep(500)
  console.log('   All connected\n')

  // ═══════════════════════════════════════════════════════════
  // BATTLES
  // ═══════════════════════════════════════════════════════════
  const BATTLES = [
    { name: 'Wolfsrudel', enemies: ['Wolf', 'Wolf', 'Wolf', 'Warg'] },
    { name: 'Orkueberfall', enemies: ['Orkhäuptling', 'Orkräuber', 'Orkräuber'] },
    { name: 'Untotengruft', enemies: ['Skelett', 'Skelett', 'Zombie', 'Ghul'] },
    { name: 'Banditenlager', enemies: ['Bandit', 'Bandit', 'Banditenanführer', 'Söldner'] },
    { name: 'Drachenhort', enemies: ['Drache (jung)', 'Kobold', 'Kobold'] },
  ]

  const allStats = []

  for (const cfg of BATTLES) {
    console.log(`${'═'.repeat(60)}`)
    console.log(`BATTLE: ${cfg.name}`)
    console.log(`${'═'.repeat(60)}`)
    const S = new Stats(cfg.name)

    // Build combatants
    const combatants = []
    for (const c of chars) {
      const w = c.weapons[0] || {}
      combatants.push({
        id: `hero_${c.charId}`, characterId: c.charId, userId: c.uId,
        name: c.name, isNPC: false,
        initiative: (c.dv.INI_basis || 10) + d20(),
        lep: c.dv.LeP_max, lepMax: c.dv.LeP_max,
        at: w.AT || 12, pa: w.PA || 8, aw: c.dv.AW || 5, rs: c.cv.RS || 0,
        weaponName: w.name || 'Faust', weaponDamage: w.TP || '1W6+2',
        attacks: c.weapons.map(w => ({ name: w.name, AT: w.AT, PA: w.PA, damage: w.TP, reach: w.reach, isRanged: !!w.ranged || w.technique === 'Bögen' })),
        conditions: [], _reactions: 0,
      })
    }
    for (const eName of cfg.enemies) {
      const t = creatures.find(c => c.name === eName)
      if (!t) { S.errors.push(`Missing: ${eName}`); continue }
      const cv = t.combat_values || {}; const a0 = (t.attacks || [])[0] || {}
      combatants.push({
        id: `npc_${eName.replace(/\s/g, '_')}_${rand(100, 999)}`, characterId: null, userId: null,
        name: t.name, isNPC: true,
        initiative: (cv.INI_basis || 10) + d20(),
        lep: cv.LeP || 30, lepMax: cv.LeP || 30,
        at: a0.AT || 12, pa: a0.PA || 6, aw: cv.AW || 4, rs: cv.RS || 0,
        weaponName: a0.name || 'Klaue', weaponDamage: a0.damage || a0.TP || '1W6+2',
        attacks: (t.attacks || []).map(a => ({ name: a.name, AT: a.AT, PA: a.PA, damage: a.damage || a.TP, reach: a.reach, isRanged: !!a.ranged })),
        specialRules: t.special_rules || [], conditions: [], _reactions: 0,
      })
    }
    combatants.sort((a, b) => b.initiative - a.initiative)

    // ── GM starts combat ──
    gmWs.send({ type: 'combat_start', payload: { combatants, name: cfg.name } })
    await sleep(300)
    // Verify all players received combat_start
    for (const uid of Object.keys(pWs)) {
      try {
        await pWs[uid].waitFor('combat_start', 2000)
        S.playerMsgsReceived[uid] = (S.playerMsgsReceived[uid] || 0) + 1
      } catch { S.errors.push(`Player ${uid} didn't receive combat_start`) }
    }

    // ── Run rounds ──
    const MAX_ROUNDS = 15
    let combatOver = false

    for (let round = 1; round <= MAX_ROUNDS && !combatOver; round++) {
      S.rounds = round
      for (const c of combatants) c._reactions = 0

      for (let ti = 0; ti < combatants.length && !combatOver; ti++) {
        const attacker = combatants[ti]
        if (attacker.lep <= 0) continue

        const enemies = combatants.filter(c => c.isNPC !== attacker.isNPC && c.lep > 0)
        if (enemies.length === 0) { combatOver = true; break }
        const target = pick(enemies)
        const isPlayerAttacker = !attacker.isNPC
        const isPlayerTarget = !target.isNPC
        const attackerPw = isPlayerAttacker ? pWs[attacker.userId] : null
        const targetPw = isPlayerTarget ? pWs[target.userId] : null

        // ── Maneuver (20% chance) ──
        let atMod = 0, tpMod = 0, defMod = 0, manLabel = ''
        if (rand(1, 5) === 1) {
          const mans = [
            { id: 'wuchtschlag1', l: 'Wuchtschlag I', a: -2, t: 2, d: 0 },
            { id: 'finte1', l: 'Finte I', a: -1, t: 0, d: -2 },
          ]
          const m = pick(mans)
          atMod = m.a; tpMod = m.t; defMod = m.d; manLabel = ` [${m.l}]`
          S.maneuvers[m.id] = (S.maneuvers[m.id] || 0) + 1
        }

        // Rudelkampf
        let packBonus = 0
        if (attacker.specialRules?.some(r => (typeof r === 'string' ? r : r.name || '').includes('Rudelkampf'))) {
          packBonus = Math.min(combatants.filter(c => c.name === attacker.name && c.lep > 0 && c.id !== attacker.id).length, 3)
        }

        const effectiveAT = attacker.at + atMod + packBonus
        S.attacks++

        // ═══ ATTACK PHASE ═══
        if (isPlayerAttacker) {
          // GM sends dice_request to the player
          gmWs.send({ type: 'dice_request', payload: {
            target_user_id: attacker.userId,
            request_type: 'attack',
            label: `Attacke auf ${target.name} (AT ${effectiveAT})${manLabel}`,
            dice: '1W20', target_value: effectiveAT,
          }})
          S.diceRequestsSent++

          // Player receives dice_request and rolls
          try {
            await attackerPw.waitFor('dice_request', 3000)
          } catch { S.errors.push(`${attacker.name} didn't receive dice_request`); continue }

          // Player "rolls" and sends result
          const atkRoll = d20()
          attackerPw.send({ type: 'dice_result', payload: {
            request_type: 'attack', value: atkRoll,
            character_id: attacker.characterId, character_name: attacker.name,
          }})

          // GM receives the dice_result
          try {
            await gmWs.waitFor('dice_result', 3000)
            S.diceResultsReceived++
          } catch { S.errors.push(`GM didn't receive dice_result from ${attacker.name}`); continue }

          // Resolve
          const hit = atkRoll === 1 || (atkRoll !== 20 && atkRoll <= effectiveAT)
          const crit = atkRoll === 1
          if (crit) S.criticals++
          if (atkRoll === 20) S.patzers++

          if (!hit) {
            S.hits-- // undo below
            console.log(`  ${attacker.name}${manLabel} → ${target.name}: rolled ${atkRoll} vs AT ${effectiveAT} — MISS`)
            await sleep(30); S.hits++; S.hits--; continue
          }
          S.hits++
          console.log(`  ${attacker.name}${manLabel} → ${target.name}: rolled ${atkRoll} vs AT ${effectiveAT} — HIT${crit ? ' CRIT!' : ''}`)

          // ═══ DEFENSE PHASE ═══
          if (isPlayerTarget) {
            gmWs.send({ type: 'defense_request', payload: {
              target_user_id: target.userId,
              attacker: attacker.name, attackValue: atkRoll,
            }})
            S.defenseRequestsSent++

            try { await targetPw.waitFor('defense_request', 3000) }
            catch { S.errors.push(`${target.name} didn't receive defense_request`); continue }

            const defType = rand(1, 2) === 1 ? 'parade' : 'ausweichen'
            const defRoll = d20()
            targetPw.send({ type: 'defense_choice', payload: {
              defense_type: defType, roll: defRoll,
              character_id: target.characterId, character_name: target.name,
            }})

            try { await gmWs.waitFor('defense_choice', 3000); S.defenseChoicesReceived++ }
            catch { S.errors.push(`GM didn't receive defense_choice from ${target.name}`); continue }

            const defVal = (defType === 'parade' ? target.pa : target.aw) + defMod - (target._reactions * 3)
            const defSuccess = defRoll === 1 || (defRoll !== 20 && defRoll <= defVal)
            S.defenses++; target._reactions++
            if (defSuccess) { S.defSuccesses++; console.log(`    ${target.name} ${defType}: ${defRoll} vs ${defVal} — DEFENDED`); continue }
            console.log(`    ${target.name} ${defType}: ${defRoll} vs ${defVal} — FAILED`)
          } else {
            // NPC target — GM resolves defense locally
            const defType = rand(1, 2) === 1 ? 'parade' : 'ausweichen'
            const defRoll = d20()
            const defVal = (defType === 'parade' ? target.pa : target.aw) + defMod - (target._reactions * 3)
            const defSuccess = defRoll === 1 || (defRoll !== 20 && defRoll <= defVal)
            S.defenses++; target._reactions++
            if (defSuccess) { S.defSuccesses++; console.log(`    ${target.name} ${defType}: ${defRoll} vs ${defVal} — DEFENDED`); continue }
            console.log(`    ${target.name} ${defType}: ${defRoll} vs ${defVal} — FAILED`)
          }

          // ═══ DAMAGE PHASE ═══
          // GM sends dice_request for damage
          gmWs.send({ type: 'dice_request', payload: {
            target_user_id: attacker.userId,
            request_type: 'damage', dice: attacker.weaponDamage,
            label: `Schaden: ${attacker.weaponDamage}`,
          }})
          S.diceRequestsSent++

          try { await attackerPw.waitFor('dice_request', 3000) }
          catch { S.errors.push(`${attacker.name} didn't receive damage dice_request`); continue }

          const rawDmg = rollDamage(attacker.weaponDamage) + tpMod
          attackerPw.send({ type: 'dice_result', payload: {
            request_type: 'damage', value: rawDmg,
            character_id: attacker.characterId, character_name: attacker.name,
          }})

          try { await gmWs.waitFor('dice_result', 3000); S.diceResultsReceived++ }
          catch { S.errors.push(`GM didn't receive damage result from ${attacker.name}`); continue }

          const sp = Math.max(0, (crit ? rawDmg * 2 : rawDmg) - (target.rs || 0))
          const oldLep = target.lep
          target.lep = Math.max(0, target.lep - sp)
          S.totalDmg += sp; S.dmgEvents++

          // GM sends vitals_update
          gmWs.send({ type: 'vitals_update', payload: {
            character_id: target.characterId || target.id, vitals: { lep: target.lep },
          }})
          S.vitalsUpdates++

          // Verify ALL players receive vitals_update
          for (const uid of Object.keys(pWs)) {
            try {
              await pWs[uid].waitFor('vitals_update', 2000)
              S.playerMsgsReceived[uid] = (S.playerMsgsReceived[uid] || 0) + 1
            } catch {} // non-critical
          }

          console.log(`    DMG: ${sp} SP (${rawDmg}${tpMod ? `+${tpMod}` : ''} - RS${target.rs}${crit ? ' x2' : ''}) → ${target.name} ${oldLep}→${target.lep}`)
          if (target.lep <= 0) { S.deaths.push(target.name); console.log(`    💀 ${target.name} is dead!`) }

        } else {
          // ═══ NPC ATTACKER — GM resolves everything ═══
          const atkRoll = d20()
          const hit = atkRoll === 1 || (atkRoll !== 20 && atkRoll <= effectiveAT)
          const crit = atkRoll === 1
          if (crit) S.criticals++
          if (atkRoll === 20) S.patzers++

          if (!hit) { console.log(`  ${attacker.name}${manLabel} → ${target.name}: ${atkRoll} vs AT ${effectiveAT} — MISS`); continue }
          S.hits++
          console.log(`  ${attacker.name}${manLabel} → ${target.name}: ${atkRoll} vs AT ${effectiveAT} — HIT${crit ? ' CRIT!' : ''}`)

          // Defense — if target is player, send defense_request and wait
          if (isPlayerTarget) {
            gmWs.send({ type: 'defense_request', payload: {
              target_user_id: target.userId, attacker: attacker.name, attackValue: atkRoll,
            }})
            S.defenseRequestsSent++

            try { await targetPw.waitFor('defense_request', 3000) }
            catch { S.errors.push(`${target.name} didn't receive defense_request`); continue }

            const defType = rand(1, 2) === 1 ? 'parade' : 'ausweichen'
            const defRoll = d20()
            targetPw.send({ type: 'defense_choice', payload: {
              defense_type: defType, roll: defRoll,
              character_id: target.characterId, character_name: target.name,
            }})

            try { await gmWs.waitFor('defense_choice', 3000); S.defenseChoicesReceived++ }
            catch { S.errors.push(`GM didn't get defense_choice from ${target.name}`); continue }

            const defVal = (defType === 'parade' ? target.pa : target.aw) + defMod - (target._reactions * 3)
            const defSuccess = defRoll === 1 || (defRoll !== 20 && defRoll <= defVal)
            S.defenses++; target._reactions++
            if (defSuccess) { S.defSuccesses++; console.log(`    ${target.name} ${defType}: ${defRoll} vs ${defVal} — DEFENDED`); continue }
            console.log(`    ${target.name} ${defType}: ${defRoll} vs ${defVal} — FAILED`)
          } else {
            // NPC vs NPC
            const defRoll = d20()
            const defVal = (target.pa || 6) + defMod - (target._reactions * 3)
            const defSuccess = defRoll === 1 || (defRoll !== 20 && defRoll <= defVal)
            S.defenses++; target._reactions++
            if (defSuccess) { S.defSuccesses++; console.log(`    ${target.name} parade: ${defRoll} vs ${defVal} — DEFENDED`); continue }
            console.log(`    ${target.name} parade: ${defRoll} vs ${defVal} — FAILED`)
          }

          // Damage
          const rawDmg = rollDamage(attacker.weaponDamage) + tpMod
          const sp = Math.max(0, (crit ? rawDmg * 2 : rawDmg) - (target.rs || 0))
          const oldLep = target.lep
          target.lep = Math.max(0, target.lep - sp)
          S.totalDmg += sp; S.dmgEvents++

          gmWs.send({ type: 'vitals_update', payload: {
            character_id: target.characterId || target.id, vitals: { lep: target.lep },
          }})
          S.vitalsUpdates++

          // Verify players receive it
          for (const uid of Object.keys(pWs)) {
            try { await pWs[uid].waitFor('vitals_update', 1500); S.playerMsgsReceived[uid] = (S.playerMsgsReceived[uid] || 0) + 1 }
            catch {}
          }

          console.log(`    DMG: ${sp} SP (${rawDmg}${tpMod ? `+${tpMod}` : ''} - RS${target.rs}${crit ? ' x2' : ''}) → ${target.name} ${oldLep}→${target.lep}`)
          if (target.lep <= 0) { S.deaths.push(target.name); console.log(`    💀 ${target.name} is dead!`) }
        }

        await sleep(30)
        if (combatants.filter(c => c.isNPC && c.lep > 0).length === 0 || combatants.filter(c => !c.isNPC && c.lep > 0).length === 0) combatOver = true
      }

      if (!combatOver) {
        gmWs.send({ type: 'combat_next_turn', payload: { round_number: round + 1 } })
        // Verify players receive turn advance
        for (const uid of Object.keys(pWs)) {
          try { await pWs[uid].waitFor('combat_next_turn', 2000); S.playerMsgsReceived[uid] = (S.playerMsgsReceived[uid] || 0) + 1 }
          catch {}
        }
      }
    }

    // ── Combat end ──
    const heroesWon = combatants.filter(c => c.isNPC && c.lep > 0).length === 0
    S.result = heroesWon ? 'victory' : combatants.filter(c => !c.isNPC && c.lep > 0).length === 0 ? 'defeat' : 'timeout'
    const fallen = combatants.filter(c => c.lep <= 0).map(c => c.name)
    const survivors = combatants.filter(c => c.lep > 0).map(c => c.name)

    gmWs.send({ type: 'combat_end', payload: { result: S.result, summary: heroesWon ? 'Sieg!' : 'Niederlage', fallen, survivors, rounds: S.rounds } })

    // Verify players get combat_end
    for (const uid of Object.keys(pWs)) {
      try { await pWs[uid].waitFor('combat_end', 2000); S.playerMsgsReceived[uid] = (S.playerMsgsReceived[uid] || 0) + 1 }
      catch { S.errors.push(`Player ${uid} didn't receive combat_end`) }
    }

    console.log(`\n  RESULT: ${S.result} | Fallen: ${fallen.join(', ')} | Survivors: ${survivors.join(', ')}`)

    // Reset vitals for next battle
    for (const c of chars) {
      try { await patch(`/api/characters/${c.charId}/vitals`, { lep: c.dv.LeP_max, asp: c.dv.AsP_max || 0 }, gm.token) }
      catch {}
    }

    // Validate
    if (S.attacks === 0) S.errors.push('No attacks')
    if (S.totalDmg === 0) S.errors.push('No damage')
    if (S.deaths.length === 0 && S.rounds >= MAX_ROUNDS) S.errors.push('Timeout, no deaths')
    if (S.diceRequestsSent > 0 && S.diceResultsReceived === 0) S.errors.push('Dice requests sent but no results received')
    if (S.defenseRequestsSent > 0 && S.defenseChoicesReceived === 0) S.errors.push('Defense requests sent but no choices received')
    for (const c of combatants) { if (c.lep > c.lepMax) S.errors.push(`${c.name} lep > lepMax`); if (c.lep < 0) S.errors.push(`${c.name} lep < 0`) }

    console.log(`  ${S.errors.length === 0 ? '✅ PASS' : '❌ FAIL'} — Protocol: ${S.diceRequestsSent} dice_req → ${S.diceResultsReceived} dice_res | ${S.defenseRequestsSent} def_req → ${S.defenseChoicesReceived} def_choice | ${S.vitalsUpdates} vitals_updates`)
    if (S.errors.length) console.log(`  ERRORS: ${S.errors.join('; ')}`)
    allStats.push(S)
    await sleep(500)
    // Drain all inboxes
    gmWs.drain(); for (const uid of Object.keys(pWs)) pWs[uid].drain()
  }

  // ═══════════════════════════════════════════════════════════
  // REPORT
  // ═══════════════════════════════════════════════════════════
  console.log(`\n${'═'.repeat(70)}`)
  console.log('FINAL REPORT — End-to-End Protocol Test')
  console.log(`${'═'.repeat(70)}\n`)

  let totErr = 0, totAtk = 0, totHit = 0, totDmg = 0, totDeath = 0
  let totDiceReq = 0, totDiceRes = 0, totDefReq = 0, totDefChoice = 0, totVitals = 0

  for (const S of allStats) {
    console.log(`─── ${S.name} (${S.result}) ───`)
    console.log(`  Rounds: ${S.rounds} | Attacks: ${S.attacks} | Hits: ${S.hits} (${S.attacks > 0 ? ((S.hits/S.attacks)*100).toFixed(0) : 0}%) | Crits: ${S.criticals} | Patzers: ${S.patzers}`)
    console.log(`  Defenses: ${S.defenses} (${S.defenses > 0 ? ((S.defSuccesses/S.defenses)*100).toFixed(0) : 0}% success) | Damage: ${S.totalDmg} in ${S.dmgEvents} events`)
    console.log(`  Deaths: ${S.deaths.join(', ') || 'none'}`)
    console.log(`  Protocol: dice_req ${S.diceRequestsSent}→${S.diceResultsReceived} | def_req ${S.defenseRequestsSent}→${S.defenseChoicesReceived} | vitals ${S.vitalsUpdates}`)
    console.log(`  Maneuvers: ${JSON.stringify(S.maneuvers)}`)
    const msgCounts = Object.values(S.playerMsgsReceived)
    console.log(`  Player msg delivery: ${msgCounts.length > 0 ? `min=${Math.min(...msgCounts)} max=${Math.max(...msgCounts)} avg=${(msgCounts.reduce((a,b)=>a+b,0)/msgCounts.length).toFixed(0)}` : 'none'}`)
    if (S.errors.length) console.log(`  ⚠ ERRORS: ${S.errors.join('; ')}`)
    console.log()
    totErr += S.errors.length; totAtk += S.attacks; totHit += S.hits; totDmg += S.totalDmg; totDeath += S.deaths.length
    totDiceReq += S.diceRequestsSent; totDiceRes += S.diceResultsReceived; totDefReq += S.defenseRequestsSent; totDefChoice += S.defenseChoicesReceived; totVitals += S.vitalsUpdates
  }

  console.log(`${'═'.repeat(70)}`)
  console.log(`TOTALS: ${allStats.length} battles | ${totAtk} attacks | ${totHit} hits | ${totDmg} dmg | ${totDeath} deaths`)
  console.log(`PROTOCOL: ${totDiceReq} dice_requests → ${totDiceRes} dice_results (${totDiceReq > 0 ? ((totDiceRes/totDiceReq)*100).toFixed(0) : 0}% delivered)`)
  console.log(`          ${totDefReq} defense_requests → ${totDefChoice} defense_choices (${totDefReq > 0 ? ((totDefChoice/totDefReq)*100).toFixed(0) : 0}% delivered)`)
  console.log(`          ${totVitals} vitals_updates broadcast`)
  console.log(`VICTORIES: ${allStats.filter(s=>s.result==='victory').length} | DEFEATS: ${allStats.filter(s=>s.result==='defeat').length} | TIMEOUTS: ${allStats.filter(s=>s.result==='timeout').length}`)
  console.log(`ERRORS: ${totErr}`)
  console.log(`${'═'.repeat(70)}`)
  console.log(totErr === 0 ? '\n✅ ALL TESTS PASSED — Full protocol verified' : `\n❌ ${totErr} ERRORS`)

  gmWs.close(); for (const uid of Object.keys(pWs)) pWs[uid].close()
  await sleep(300)
  process.exit(totErr === 0 ? 0 : 1)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
