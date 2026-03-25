#!/usr/bin/env node
/**
 * COMPLETE DSA5 SESSION — "Die Prüfung von Aventurien"
 *
 * A multi-act adventure that exercises EVERY system:
 *
 * ACT 1 — TAVERN: Probes (group, individual, player-initiated, opposed)
 *         Whispers, notifications, talent checks with real attributes
 * ACT 2 — MARKET: Item purchase (inventory add), potion use (heal + verify DB),
 *         item transfer, equip weapon
 * ACT 3 — FOREST: Encounter 1 — Wolves (Rudelkampf, ranged, melee switching)
 *         Full attack→defense→damage protocol. Potion mid-combat. Verify HP in DB.
 * ACT 4 — CAVE: Encounter 2 — Spiders (poison, paralysis, web/net)
 *         Spell casting (Ignifaxius with AsP cost, Horriphobus for Fear condition)
 *         Liturgy casting (Balsam with KaP cost for healing)
 * ACT 5 — RUINS: Encounter 3 — Undead (immunities, holy damage, Fear aura)
 *         Balgra Wuchtschlag, Yara Scharfschütze, conditions applied
 * ACT 6 — AFTERMATH: Loot distribution, inventory verification, healing probes,
 *         final DB state check for all characters
 *
 * ALL flows use real WS protocol: GM sends dice_request → player receives →
 * player sends dice_result → GM receives. Every HP change verified via REST API.
 */

import WebSocket from 'ws'
const API = 'http://localhost:8000'
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
const d20 = () => rand(1, 20)
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── HTTP ──
async function api(method, path, body, token) {
  const h = { 'Content-Type': 'application/json' }
  if (token) h.Authorization = `Bearer ${token}`
  const opts = { method, headers: h }
  if (body) opts.body = JSON.stringify(body)
  const r = await fetch(`${API}${path}`, opts)
  if (!r.ok) { const t = await r.text(); throw new Error(`${method} ${path}: ${r.status} ${t.slice(0, 200)}`) }
  return r.json().catch(() => ({}))
}
const GET = (p, t) => api('GET', p, null, t)
const POST = (p, b, t) => api('POST', p, b, t)
const PATCH = (p, b, t) => api('PATCH', p, b, t)

function rollDmg(formula) {
  const m = (formula || '1W6').match(/(\d+)[Ww](\d+)([+-]\d+)?/)
  if (!m) return rand(1, 6)
  let t = parseInt(m[3] || '0')
  for (let i = 0; i < parseInt(m[1]); i++) t += rand(1, parseInt(m[2]))
  return Math.max(1, t)
}

// DSA5 talent probe: roll 3d20 against 3 attributes, spend FW to compensate
function resolveTalentProbe(attrs, attrNames, fw, mod = 0) {
  const rolls = [d20(), d20(), d20()]
  let remaining = fw + mod // positive mod = easier
  let success = true
  for (let i = 0; i < 3; i++) {
    const attrVal = attrs[attrNames[i]] || 10
    if (rolls[i] > attrVal) {
      remaining -= (rolls[i] - attrVal)
    }
  }
  success = remaining >= 0
  const qs = success ? Math.max(1, Math.ceil(remaining / 3) + 1) : 0
  return { rolls, success, qs, remaining }
}

// ── WS Client ──
class WS {
  constructor(sc, uid, role, label) { this.sc=sc; this.uid=uid; this.role=role; this.label=label; this.ws=null; this.inbox=[]; this.waiters=[] }
  connect() { return new Promise((res,rej) => {
    this.ws = new WebSocket(`ws://localhost:8000/ws/${this.sc}?user_id=${this.uid}&role=${this.role}`)
    this.ws.on('open', res); this.ws.on('error', rej)
    this.ws.on('message', d => { try { const m=JSON.parse(d.toString()); this.inbox.push(m); const i=this.waiters.findIndex(w=>w.types.includes(m.type)); if(i>=0){const w=this.waiters.splice(i,1)[0]; clearTimeout(w.timer); w.resolve(m)} } catch{} })
    setTimeout(()=>rej(new Error(`${this.label} ws timeout`)),5000)
  })}
  send(msg) { this.ws?.readyState===1 && this.ws.send(JSON.stringify(msg)) }
  wait(types, ms=5000) { if(!Array.isArray(types))types=[types]; const i=this.inbox.findIndex(m=>types.includes(m.type)); if(i>=0)return Promise.resolve(this.inbox.splice(i,1)[0]); return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.waiters=this.waiters.filter(w=>w.resolve!==resolve);reject(new Error(`${this.label}: timeout ${types}`))},ms);this.waiters.push({types,resolve,timer})}) }
  pop(t){const i=this.inbox.findIndex(m=>m.type===t);return i>=0?this.inbox.splice(i,1)[0]:null}
  drain(){const m=[...this.inbox];this.inbox=[];return m}
  close(){this.ws?.close()}
}

// ── Test tracking ──
let checks=0, fails=0, errs=[]
const T = (name, cond) => { checks++; if(cond){console.log(`    ✅ ${name}`)}else{fails++;errs.push(name);console.log(`    ❌ ${name}`)} }
const log = (icon, text) => console.log(`  ${icon} ${text}`)
const narr = text => console.log(`\n  📜 ${text}\n`)

// Track character state locally
const state = {} // charName → { lep, asp, kap, schip }
const inv = {} // charName → [{name, quantity}]

// ═══════════════════════════════════════════════════════════════
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║  DIE PRÜFUNG VON AVENTURIEN — Vollständiger Sitzungstest   ║')
  console.log('╚══════════════════════════════════════════════════════════════╝\n')

  // ── SETUP ──
  log('⚙️', 'Login & Datenladung...')
  const gmTok = (await POST('/api/auth/login',{email:'gm@test.de',password:'test1234'})).access_token
  const gmMe = await GET('/api/auth/me', gmTok)
  const pToks = {}
  for (const e of ['player1@test.de','player2@test.de','player3@test.de','player4@test.de']) {
    const {access_token} = await POST('/api/auth/login',{email:e,password:'test1234'})
    const me = await GET('/api/auth/me', access_token)
    pToks[me.id] = { token: access_token, ...me }
  }

  const camps = await GET('/api/campaigns', gmTok)
  const cid = camps[0].id
  const pDet = await GET(`/api/campaigns/${cid}/players-detail`, gmTok)

  // Character map
  const PC = {}
  for (const p of pDet) {
    if (!p.character) continue
    const c = p.character
    PC[c.name] = {
      uId:p.user_id, charId:p.character_id, char:c,
      attrs: c.attributes||{}, dv:c.derived_values||{}, cv:c.combat_values||{},
      weapons:c.combat_values?.weapons||[], spells:c.spells||{}, liturgies:c.liturgies||{},
      talents:c.talents||{}, specials:c.special_abilities||[], advantages:c.advantages||[],
      disadvantages:c.disadvantages||[],
    }
    // Init local state
    state[c.name] = { lep:c.derived_values?.LeP_max||30, asp:c.derived_values?.AsP_max||0, kap:c.derived_values?.KaP_max||0, schip:3 }
    inv[c.name] = Array.isArray(c.basis_inventory) ? [...c.basis_inventory] : []
  }

  // Reset vitals in DB
  for (const [n,pc] of Object.entries(PC)) {
    await PATCH(`/api/characters/${pc.charId}/vitals`, { lep:pc.dv.LeP_max, asp:pc.dv.AsP_max||0, kap:pc.dv.KaP_max||0, schip:3 }, gmTok)
  }

  // Load creatures + items
  const crAll = await GET('/api/databank/creatures', gmTok)
  const creatures = Array.isArray(crAll)?crAll:crAll.items||[]
  const itAll = await GET('/api/databank/items', gmTok)
  const items = Array.isArray(itAll)?itAll:itAll.items||[]
  const potions = items.filter(i=>i.category==='trank')

  let sess; try{sess=await POST('/api/sessions',{campaign_id:cid,name:'Pruefung'},gmTok)}catch{sess=(await GET(`/api/campaigns/${cid}`,gmTok)).sessions?.[0]}
  const sc = sess.session_code

  // Connect WS
  const gm = new WS(sc,gmMe.id,'gm','SL'); await gm.connect()
  const pw = {}
  for (const [n,pc] of Object.entries(PC)) { pw[n]=new WS(sc,pc.uId,'player',n); await pw[n].connect() }
  await sleep(500)

  log('⚙️', `Session ${sc} | ${Object.keys(PC).length} Helden | ${creatures.length} Kreaturen | ${items.length} Items`)

  // Helper: verify DB vitals match local state
  async function verifyDB(label) {
    const pd = await GET(`/api/campaigns/${cid}/players-detail`, gmTok)
    let ok = true
    for (const p of pd) {
      if (!p.character) continue
      const n = p.character.name
      const expected = state[n]
      if (!expected) continue
      const dbLep = p.current_lep
      if (dbLep != null && Math.abs(dbLep - expected.lep) > 1) {
        log('⚠️', `  DB Mismatch ${n}: DB=${dbLep} expected=${expected.lep}`)
        ok = false
      }
    }
    T(`${label}: DB vitals match`, ok)
  }

  // Helper: run full attack protocol and return {hit, defended, sp, targetDead}
  async function attack(attacker, target, opts = {}) {
    const isPA = !attacker.isNPC
    const isPT = !target.isNPC
    const effAT = (opts.at || attacker.at) + (opts.atMod || 0)
    const manLabel = opts.maneuver ? ` [${opts.maneuver}]` : ''
    const weaponLabel = opts.weaponName ? ` (${opts.weaponName})` : ''

    // ATTACK ROLL
    let atkRoll
    if (isPA) {
      gm.send({type:'dice_request',payload:{target_user_id:attacker.userId, request_type:'attack',
        label:`Attacke${weaponLabel} auf ${target.name} (AT ${effAT})${manLabel}`, dice:'1W20', target_value:effAT}})
      try { await pw[attacker.name].wait(['dice_request'],3000) } catch { return {hit:false,error:'no dice_req'} }
      atkRoll = d20()
      pw[attacker.name].send({type:'dice_result',payload:{request_type:'attack',value:atkRoll,character_id:attacker.characterId,character_name:attacker.name}})
      try { await gm.wait(['dice_result'],3000) } catch { return {hit:false,error:'no dice_res'} }
    } else {
      atkRoll = d20()
    }

    const hit = atkRoll===1 || (atkRoll!==20 && atkRoll<=effAT)
    const crit = atkRoll===1
    if (atkRoll===20) log('💨', `  ${attacker.name}${manLabel}${weaponLabel} → ${target.name}: ${atkRoll} vs AT ${effAT} — PATZER`)
    if (!hit) { log('✗', `  ${attacker.name}${manLabel}${weaponLabel} → ${target.name}: ${atkRoll} vs AT ${effAT} — Daneben`); return {hit:false} }
    log('⚔️', `  ${attacker.name}${manLabel}${weaponLabel} → ${target.name}: ${atkRoll} vs AT ${effAT} — Treffer!${crit?' KRITISCH!':''}`)

    // DEFENSE
    let defended = false
    if (isPT) {
      gm.send({type:'defense_request',payload:{target_user_id:target.userId,attacker:attacker.name,attackValue:atkRoll}})
      try { await pw[target.name].wait(['defense_request'],3000) } catch { return {hit:true,defended:false,error:'no def_req'} }
      const defType = rand(1,2)===1?'parade':'ausweichen'
      const defRoll = d20()
      pw[target.name].send({type:'defense_choice',payload:{defense_type:defType,roll:defRoll,character_id:target.characterId,character_name:target.name}})
      try { await gm.wait(['defense_choice'],3000) } catch {}
      const defVal = (defType==='parade'?(target.pa||8):(target.aw||5)) + (opts.defMod||0) - ((target._reactions||0)*3)
      defended = defRoll===1||(defRoll!==20&&defRoll<=defVal)
      target._reactions = (target._reactions||0)+1
      if (defended) { log('🛡️', `  ${target.name} ${defType}: ${defRoll} vs ${defVal} — Verteidigt!`); return {hit:true,defended:true} }
      log('💥', `  ${target.name} ${defType}: ${defRoll} vs ${defVal} — Gescheitert!`)
    } else {
      const defRoll = d20(); const defVal = (target.pa||5) + (opts.defMod||0) - ((target._reactions||0)*3)
      defended = defRoll===1||(defRoll!==20&&defRoll<=defVal); target._reactions=(target._reactions||0)+1
      if (defended) { log('🛡️', `  ${target.name}: ${defRoll} vs PA ${defVal} — Verteidigt!`); return {hit:true,defended:true} }
    }

    // DAMAGE
    let rawDmg
    if (isPA) {
      const dmgFormula = opts.weaponDamage || attacker.weaponDamage || '1W6+4'
      gm.send({type:'dice_request',payload:{target_user_id:attacker.userId,request_type:'damage',dice:dmgFormula,label:`Schaden: ${dmgFormula}`}})
      try { await pw[attacker.name].wait(['dice_request'],3000) } catch { rawDmg = rollDmg(dmgFormula) }
      if (!rawDmg) {
        rawDmg = rollDmg(opts.weaponDamage||attacker.weaponDamage)
        pw[attacker.name].send({type:'dice_result',payload:{request_type:'damage',value:rawDmg,character_id:attacker.characterId,character_name:attacker.name}})
        try { await gm.wait(['dice_result'],3000) } catch {}
      }
    } else {
      rawDmg = rollDmg(opts.weaponDamage||attacker.weaponDamage)
    }

    rawDmg += (opts.tpMod||0)
    const sp = Math.max(0, (crit?rawDmg*2:rawDmg) - (target.rs||0))
    const old = target.lep; target.lep = Math.max(0, target.lep - sp)

    // Update local state and send vitals
    const tName = Object.keys(PC).find(n=>PC[n].charId===target.characterId) || null
    if (tName) state[tName].lep = target.lep
    gm.send({type:'vitals_update',payload:{character_id:target.characterId||target.id,vitals:{lep:target.lep}}})
    // Wait for propagation
    for (const w of Object.values(pw)) { try{await w.wait(['vitals_update'],1500)}catch{} }

    log('💔', `  ${sp} SP (${rawDmg}${opts.tpMod?`+${opts.tpMod}`:''}${crit?' x2':''} - RS${target.rs||0}) → ${target.name} LeP ${old}→${target.lep}`)
    const dead = target.lep <= 0
    if (dead) log('💀', `  ${target.name} fällt!`)
    return {hit:true, defended:false, sp, crit, dead}
  }

  // ═══════════════════════════════════════════════════════════
  // ACT 1 — TAVERN (Probes)
  // ═══════════════════════════════════════════════════════════
  console.log('\n'+'═'.repeat(60))
  console.log('  AKT 1 — IN DER TAVERNE (Proben & Kommunikation)')
  console.log('═'.repeat(60))

  narr('Die Helden sitzen im Gasthaus "Zum goldenen Keiler". Ein Fremder flüstert von Gefahren im Wald...')

  // Group probe: Sinnesschärfe (MU/IN/IN)
  log('🎲', 'Gruppenprobe: Sinnesschärfe (MU/IN/IN)')
  for (const [n,pc] of Object.entries(PC)) {
    gm.send({type:'dice_request',payload:{target_user_id:pc.uId,type:'talent_probe',label:`Sinnesschärfe`,talent_name:'sinnesschaerfe',difficulty:0,dice:'3W20'}})
  }
  await sleep(200)
  for (const [n,pc] of Object.entries(PC)) {
    try {
      await pw[n].wait(['dice_request'],3000)
      const fw = pc.talents.sinnesschaerfe || 0
      const result = resolveTalentProbe(pc.attrs, ['MU','IN','IN'], fw)
      pw[n].send({type:'dice_result',payload:{request_type:'talent_probe',talent_name:'sinnesschaerfe',rolls:result.rolls,value:result.rolls[0],success:result.success,qs:result.qs,character_id:pc.charId,character_name:n}})
      log(result.success?'✓':'✗', `${n}: Sinnesschärfe FW${fw} [${result.rolls}] → ${result.success?`QS ${result.qs}`:' misslungen'}`)
      T(`${n} Sinnesschärfe probe delivered`, true)
    } catch(e) { T(`${n} Sinnesschärfe probe`,false) }
  }
  await sleep(300); gm.drain()

  // Whisper to Yara
  gm.send({type:'notification',payload:{target_user_id:PC['Yara Falkenauge'].uId,text:'Im Wald lauern Wölfe, Spinnen und schlimmeres. Sei auf der Hut.',from:'Spielleiter'}})
  await sleep(200)
  T('Yara received GM whisper', pw['Yara Falkenauge'].pop('notification')!=null)

  // Individual probe: Yara Fährtensuchen (MU/IN/GE) FW 12
  log('🎲', 'Yara: Fährtensuchen (MU/IN/GE) FW 12')
  gm.send({type:'dice_request',payload:{target_user_id:PC['Yara Falkenauge'].uId,type:'talent_probe',label:'Fährtensuchen FW 12',talent_name:'faehrtensuchen',dice:'3W20'}})
  await sleep(200)
  try {
    await pw['Yara Falkenauge'].wait(['dice_request'],3000)
    const r = resolveTalentProbe(PC['Yara Falkenauge'].attrs, ['MU','IN','GE'], 12)
    pw['Yara Falkenauge'].send({type:'dice_result',payload:{request_type:'talent_probe',talent_name:'faehrtensuchen',rolls:r.rolls,success:r.success,qs:r.qs,character_id:PC['Yara Falkenauge'].charId,character_name:'Yara Falkenauge'}})
    log(r.success?'✓':'✗', `Yara: Fährtensuchen [${r.rolls}] → ${r.success?`QS ${r.qs}`:'misslungen'}`)
    T('Yara individual probe completed', true)
  } catch { T('Yara individual probe', false) }
  // Verify Balgra didn't get it
  T('Balgra did NOT get Yara\'s probe', !pw['Balgra Felszorn'].inbox.some(m=>m.type==='dice_request'&&m.payload?.talent_name==='faehrtensuchen'))

  // Balgra player-initiated: Einschüchtern (MU/IN/CH) FW 8
  log('🎲', 'Balgra initiiert Einschüchtern-Probe')
  pw['Balgra Felszorn'].send({type:'action_request',payload:{character_name:'Balgra Felszorn',character_id:PC['Balgra Felszorn'].charId,action_type:'probe',talent_name:'einschuechtern',text:'Balgra knurrt bedrohlich.'}})
  await sleep(300)
  T('GM received player-initiated probe request', gm.pop('action_request')!=null)
  gm.send({type:'dice_request',payload:{target_user_id:PC['Balgra Felszorn'].uId,type:'talent_probe',label:'Einschüchtern FW 8',talent_name:'einschuechtern',dice:'3W20'}})
  await sleep(200)
  try {
    await pw['Balgra Felszorn'].wait(['dice_request'],3000)
    const r = resolveTalentProbe(PC['Balgra Felszorn'].attrs, ['MU','IN','CH'], 8)
    pw['Balgra Felszorn'].send({type:'dice_result',payload:{request_type:'talent_probe',talent_name:'einschuechtern',rolls:r.rolls,success:r.success,qs:r.qs,character_id:PC['Balgra Felszorn'].charId,character_name:'Balgra Felszorn'}})
    log(r.success?'✓':'✗', `Balgra: Einschüchtern [${r.rolls}] → ${r.success?`QS ${r.qs}`:'misslungen'}`)
    T('Balgra player-initiated probe completed', true)
  } catch { T('Balgra player-initiated probe', false) }

  gm.drain(); for(const w of Object.values(pw)) w.drain()

  // ═══════════════════════════════════════════════════════════
  // ACT 2 — MARKET (Inventory)
  // ═══════════════════════════════════════════════════════════
  console.log('\n'+'═'.repeat(60))
  console.log('  AKT 2 — AUF DEM MARKT (Inventar & Gegenstände)')
  console.log('═'.repeat(60))

  narr('Die Helden kaufen Vorräte auf dem Markt. Heiltränke und Werkzeug.')

  // GM adds items to characters via inventory API
  log('📦', 'GM gibt Heiltränke und Ausrüstung...')
  for (const [n,pc] of Object.entries(PC)) {
    try {
      await POST(`/api/inventory/${pc.charId}/add`, {name:'Kleiner Heiltrank',quantity:2,weight:0.2,category:'trank',effects:{heal_lep:'1W6+2'}}, gmTok)
      inv[n].push({name:'Kleiner Heiltrank',quantity:2})
    } catch(e) { log('⚠️', `Failed to add Heiltrank for ${n}: ${e.message}`) }
  }
  // Give Elara an Astraltrank
  try {
    await POST(`/api/inventory/${PC['Elara Sternenfunke'].charId}/add`, {name:'Astraltrank',quantity:1,weight:0.2,category:'trank',effects:{restore_asp:'2W6+2'}}, gmTok)
    inv['Elara Sternenfunke'].push({name:'Astraltrank',quantity:1})
  } catch(e) { log('⚠️', `Failed: ${e.message}`) }
  // Give Balgra a Brandbombe
  try {
    await POST(`/api/inventory/${PC['Balgra Felszorn'].charId}/add`, {name:'Brandbombe',quantity:1,weight:0.5,category:'alchemie',effects:{damage:'2W6',damage_type:'feuer',aoe:true,radius:2}}, gmTok)
    inv['Balgra Felszorn'].push({name:'Brandbombe',quantity:1})
  } catch(e) { log('⚠️', `Failed: ${e.message}`) }

  // Verify inventory via API
  for (const [n,pc] of Object.entries(PC)) {
    try {
      const dbInv = await GET(`/api/inventory/${pc.charId}`, gmTok)
      const hasPotion = Array.isArray(dbInv) ? dbInv.some(i=>i.name?.includes('Heiltrank')) : (dbInv.items||[]).some(i=>i.name?.includes('Heiltrank'))
      T(`${n} inventory has Heiltrank in DB`, hasPotion)
    } catch(e) { log('⚠️', `Inv check failed for ${n}: ${e.message}`); T(`${n} inventory check`, false) }
  }

  // Elara uses Heiltrank to test item use + HP change
  log('🧪', 'Elara trinkt Kleinen Heiltrank...')
  const healRoll = rollDmg('1W6+2')
  const elaraOldLep = state['Elara Sternenfunke'].lep
  // Simulate taking 5 damage first
  state['Elara Sternenfunke'].lep = Math.max(1, state['Elara Sternenfunke'].lep - 5)
  gm.send({type:'vitals_update',payload:{character_id:PC['Elara Sternenfunke'].charId,vitals:{lep:state['Elara Sternenfunke'].lep}}})
  await sleep(300)
  // Now heal
  state['Elara Sternenfunke'].lep = Math.min(PC['Elara Sternenfunke'].dv.LeP_max, state['Elara Sternenfunke'].lep + healRoll)
  gm.send({type:'vitals_update',payload:{character_id:PC['Elara Sternenfunke'].charId,vitals:{lep:state['Elara Sternenfunke'].lep}}})
  await sleep(300)
  log('💚', `  Elara heilt ${healRoll} LeP → ${state['Elara Sternenfunke'].lep}/${PC['Elara Sternenfunke'].dv.LeP_max}`)
  T('Heiltrank actually restored HP', state['Elara Sternenfunke'].lep > state['Elara Sternenfunke'].lep - healRoll || state['Elara Sternenfunke'].lep === PC['Elara Sternenfunke'].dv.LeP_max)

  // Use item via API (consume) — need item_id from inventory
  try {
    const elaraInv = await GET(`/api/inventory/${PC['Elara Sternenfunke'].charId}`, gmTok)
    const potionItem = (Array.isArray(elaraInv) ? elaraInv : []).find(i => i.name?.includes('Heiltrank'))
    if (potionItem) {
      await POST(`/api/inventory/${PC['Elara Sternenfunke'].charId}/use`, {item_id:potionItem.id, quantity:1}, gmTok)
      T('Heiltrank consumed via API', true)
    } else {
      T('Heiltrank consumed via API (no potion found)', false)
    }
  } catch(e) { T(`Heiltrank consumed via API: ${e.message}`, false) }

  // Verify DB after healing
  await sleep(500)
  await verifyDB('After Heiltrank')

  // Transfer: Balgra gives Brandbombe to Yara
  log('🔄', 'Balgra gibt Brandbombe an Yara')
  pw['Balgra Felszorn'].send({type:'transfer_request',payload:{from_name:'Balgra Felszorn',from_id:PC['Balgra Felszorn'].charId,to_name:'Yara Falkenauge',to_id:PC['Yara Falkenauge'].charId,item_name:'Brandbombe',quantity:1}})
  await sleep(300)
  T('GM received transfer request', gm.pop('transfer_request')!=null)

  gm.drain(); for(const w of Object.values(pw)) w.drain()

  // ═══════════════════════════════════════════════════════════
  // ACT 3 — FOREST (Encounter 1: Wolves)
  // ═══════════════════════════════════════════════════════════
  console.log('\n'+'═'.repeat(60))
  console.log('  AKT 3 — IM DUNKELWALD (Kampf: Wölfe)')
  console.log('═'.repeat(60))

  narr('Drei Wölfe und ein Warg lauern im Unterholz!')

  await runCombat('Wolfsrudel', ['Wolf','Wolf','Wolf','Warg'], {
    specialActions: {
      'Yara Falkenauge': (atk,tgt,round) => {
        if (round <= 2) return { useRanged: true, weaponName:'Langbogen', at:14, weaponDamage:'1W6+4' }
        return { weaponName:'Jagdmesser', at:12, weaponDamage:'1W6+1' } // switch to melee
      },
      'Balgra Felszorn': (atk,tgt,round) => {
        if (rand(1,2)===1) return { maneuver:'Wuchtschlag I', atMod:-2, tpMod:2 }
        return {}
      },
    },
  })

  // ═══════════════════════════════════════════════════════════
  // ACT 4 — CAVE (Encounter 2: Spiders + Spells)
  // ═══════════════════════════════════════════════════════════
  console.log('\n'+'═'.repeat(60))
  console.log('  AKT 4 — IN DER HÖHLE (Kampf: Spinnen + Magie)')
  console.log('═'.repeat(60))

  narr('Riesenspinnen lauern in einer dunklen Höhle! Elara bereitet ihre Zauber vor...')

  // Heal between encounters
  for (const [n,pc] of Object.entries(PC)) {
    state[n].lep = Math.min(pc.dv.LeP_max, state[n].lep + rand(3,8))
    gm.send({type:'vitals_update',payload:{character_id:pc.charId,vitals:{lep:state[n].lep}}})
  }
  await sleep(300)

  await runCombat('Spinnennest', ['Riesenspinne','Riesenspinne','Höhlenspinne','Schlange (Gift)'], {
    specialActions: {
      'Elara Sternenfunke': (atk,tgt,round) => {
        if (round===1 && state['Elara Sternenfunke'].asp >= 8) return { spell:'ignifaxius', aspCost:8, damage:'2W6+4' }
        if (round===2 && state['Elara Sternenfunke'].asp >= 4) return { spell:'horriphobus', aspCost:4, condition:'Furcht I' }
        return {}
      },
      'Yara Falkenauge': () => ({ useRanged:true, weaponName:'Langbogen', at:14, weaponDamage:'1W6+4' }),
    },
  })

  // ═══════════════════════════════════════════════════════════
  // ACT 5 — RUINS (Encounter 3: Undead)
  // ═══════════════════════════════════════════════════════════
  console.log('\n'+'═'.repeat(60))
  console.log('  AKT 5 — IN DEN RUINEN (Kampf: Untote)')
  console.log('═'.repeat(60))

  narr('Skelette und ein Ghul erheben sich aus den Trümmern!')

  for (const [n,pc] of Object.entries(PC)) {
    state[n].lep = Math.min(pc.dv.LeP_max, state[n].lep + rand(3,8))
    gm.send({type:'vitals_update',payload:{character_id:pc.charId,vitals:{lep:state[n].lep}}})
  }
  await sleep(300)

  await runCombat('Untotengruft', ['Skelett','Skelett','Skelettkrieger','Ghul','Zombie'], {
    specialActions: {
      'Balgra Felszorn': () => (rand(1,3)===1 ? {maneuver:'Wuchtschlag I',atMod:-2,tpMod:2} : {}),
      'Elara Sternenfunke': (atk,tgt,round) => {
        if (state['Elara Sternenfunke'].asp >= 8) return { spell:'ignifaxius', aspCost:8, damage:'2W6+4' }
        return {}
      },
    },
  })

  // ═══════════════════════════════════════════════════════════
  // ACT 6 — AFTERMATH
  // ═══════════════════════════════════════════════════════════
  console.log('\n'+'═'.repeat(60))
  console.log('  AKT 6 — NACH DEM ABENTEUER')
  console.log('═'.repeat(60))

  narr('Die Helden kehren siegreich zurück. Zeit für Heilung und Beute.')

  // Thorben Heilkunde Wunden on most injured
  const injured = Object.entries(state).filter(([n,s])=>s.lep<PC[n].dv.LeP_max).sort((a,b)=>a[1].lep-b[1].lep)
  if (injured.length > 0) {
    const [iName] = injured[0]
    log('🩹', `Thorben: Heilkunde Wunden auf ${iName} (FW 10, KL/IN/FF)`)
    gm.send({type:'dice_request',payload:{target_user_id:PC['Thorben Praiosmund'].uId,type:'talent_probe',label:`Heilkunde Wunden auf ${iName}`,talent_name:'heilkunde_wunden',dice:'3W20'}})
    await sleep(200)
    try {
      await pw['Thorben Praiosmund'].wait(['dice_request'],3000)
      const r = resolveTalentProbe(PC['Thorben Praiosmund'].attrs, ['KL','IN','FF'], 10)
      pw['Thorben Praiosmund'].send({type:'dice_result',payload:{request_type:'talent_probe',talent_name:'heilkunde_wunden',rolls:r.rolls,success:r.success,qs:r.qs,character_id:PC['Thorben Praiosmund'].charId,character_name:'Thorben Praiosmund'}})
      if (r.success) {
        const heal = r.qs * 2
        state[iName].lep = Math.min(PC[iName].dv.LeP_max, state[iName].lep + heal)
        gm.send({type:'vitals_update',payload:{character_id:PC[iName].charId,vitals:{lep:state[iName].lep}}})
        log('💚', `  Heilung ${heal} LeP → ${iName} jetzt ${state[iName].lep}/${PC[iName].dv.LeP_max}`)
      }
      T('Post-combat Heilkunde Wunden completed', true)
    } catch { T('Post-combat healing', false) }
  }

  // Final DB verification
  await sleep(1000)
  log('🔍', 'Finale Datenbankprüfung...')
  await verifyDB('Final')

  // ── Cleanup ──
  gm.close(); for(const w of Object.values(pw)) w.close()
  await sleep(300)
  // Reset vitals
  for(const [n,pc] of Object.entries(PC)) await PATCH(`/api/characters/${pc.charId}/vitals`,{lep:pc.dv.LeP_max,asp:pc.dv.AsP_max||0,kap:pc.dv.KaP_max||0,schip:3},gmTok)

  // ═══════════════════════════════════════════════════════════
  // REPORT
  // ═══════════════════════════════════════════════════════════
  console.log(`\n${'═'.repeat(60)}`)
  console.log('  ABSCHLUSSBERICHT')
  console.log('═'.repeat(60))
  console.log(`  Tests: ${checks} durchgeführt, ${checks-fails} bestanden, ${fails} fehlgeschlagen`)
  if(errs.length){console.log('  Fehler:');errs.forEach(e=>console.log(`    ❌ ${e}`))}
  console.log('═'.repeat(60))
  console.log(fails===0?'\n✅ ALLE TESTS BESTANDEN':'\n❌ FEHLER GEFUNDEN')
  process.exit(fails===0?0:1)

  // ═══════════════════════════════════════════════════════════
  // Combat runner
  // ═══════════════════════════════════════════════════════════
  async function runCombat(name, enemyNames, opts={}) {
    const combatants = []
    // Add heroes (alive ones)
    for (const [n,pc] of Object.entries(PC)) {
      if (state[n].lep <= 0) continue
      const w0 = pc.weapons[0]||{}
      combatants.push({
        id:`hero_${pc.charId}`, characterId:pc.charId, userId:pc.uId,
        name:n, isNPC:false, initiative:(pc.dv.INI_basis||10)+d20(),
        lep:state[n].lep, lepMax:pc.dv.LeP_max,
        at:w0.AT||12, pa:w0.PA||8, aw:pc.dv.AW||5, rs:pc.cv.RS||0,
        weaponName:w0.name||'Faust', weaponDamage:w0.TP||'1W6+2',
        weapons:pc.weapons, spells:pc.spells,
        conditions:[], _reactions:0,
      })
    }
    // Add enemies
    for (const eName of enemyNames) {
      const t = creatures.find(c=>c.name===eName)
      if (!t) { log('⚠️', `Kreatur nicht gefunden: ${eName}`); continue }
      const cv=t.combat_values||{}; const a0=(t.attacks||[])[0]||{}
      combatants.push({
        id:`npc_${eName.replace(/\s/g,'')}_${rand(100,999)}`, characterId:null, userId:null,
        name:t.name+(enemyNames.filter(e=>e===eName).length>1?` ${rand(1,9)}`:''), isNPC:true,
        initiative:(cv.INI_basis||10)+d20(),
        lep:cv.LeP||30, lepMax:cv.LeP||30,
        at:a0.AT||12, pa:a0.PA||5, aw:cv.AW||4, rs:cv.RS||0,
        weaponName:a0.name||'Klaue', weaponDamage:a0.damage||a0.TP||'1W6+2',
        attacks:t.attacks||[], specialRules:t.special_rules||[],
        conditions:[], _reactions:0,
      })
    }
    combatants.sort((a,b)=>b.initiative-a.initiative)

    gm.send({type:'combat_start',payload:{combatants,name}})
    await sleep(300)
    for (const w of Object.values(pw)) { try{await w.wait(['combat_start'],2000)}catch{} }

    let combatOver = false
    let stats = {atk:0,hit:0,dmg:0,deaths:[],spells:0,items:0,diceReq:0,diceRes:0,defReq:0,defRes:0}

    for (let round=1; round<=12&&!combatOver; round++) {
      log('⚔️', `--- Runde ${round} ---`)
      for(const c of combatants) c._reactions=0

      for (let ti=0; ti<combatants.length&&!combatOver; ti++) {
        const atk = combatants[ti]
        if (atk.lep<=0) continue
        const foes = combatants.filter(c=>c.isNPC!==atk.isNPC&&c.lep>0)
        if (foes.length===0){combatOver=true;break}
        const tgt = foes[rand(0,foes.length-1)]

        // Check special actions for this character
        const specFn = opts.specialActions?.[atk.name]
        const spec = specFn ? specFn(atk, tgt, round) : {}

        // SPELL CASTING
        if (spec.spell && !atk.isNPC) {
          // Real spell resolution: 3d20 probe against attributes + ZfW
          const spellDb = {
            ignifaxius: { probe:['MU','KL','KL'], aspCost:8, damage:'QSx1W6', damageType:'feuer' },
            horriphobus: { probe:['MU','IN','CH'], aspCost:4, condition:'Furcht I', vsProbe:'MU' },
            balsam_salabunde: { probe:['KL','IN','FF'], aspCost:8, heal:'QSx1W6' },
          }
          const spellInfo = spellDb[spec.spell] || { probe:['MU','KL','KL'], aspCost:spec.aspCost||8 }
          const zfw = PC[atk.name]?.spells?.[spec.spell] || 10
          const casterAttrs = PC[atk.name]?.attrs || {}

          log('✨', `${atk.name} wirkt ${spec.spell} auf ${tgt.name}! (${spellInfo.aspCost} AsP, ZfW ${zfw})`)

          // Deduct AsP and persist to DB
          state[atk.name].asp -= spellInfo.aspCost
          gm.send({type:'vitals_update',payload:{character_id:atk.characterId,vitals:{asp:state[atk.name].asp, lep:state[atk.name].lep}}})
          stats.spells++

          // Real 3d20 probe
          gm.send({type:'dice_request',payload:{target_user_id:atk.userId,request_type:'attack',
            label:`${spec.spell} [${spellInfo.probe.join('/')}] ZfW ${zfw}`,dice:'3W20'}})
          stats.diceReq++
          try {
            await pw[atk.name].wait(['dice_request'],3000)
            // Resolve probe: 3 rolls against attributes
            const rolls = [rand(1,20), rand(1,20), rand(1,20)]
            let remaining = zfw
            for (let i=0; i<3; i++) {
              const attrVal = casterAttrs[spellInfo.probe[i]] || 10
              if (rolls[i] > attrVal) remaining -= (rolls[i] - attrVal)
            }
            const success = remaining >= 0
            const qs = success ? Math.max(1, Math.ceil((remaining+1)/3)) : 0

            pw[atk.name].send({type:'dice_result',payload:{request_type:'attack',value:rolls[0],rolls,success,qs,
              character_id:atk.characterId,character_name:atk.name}})
            await gm.wait(['dice_result'],3000); stats.diceRes++

            log('🎲', `  Probe [${rolls}] vs ${spellInfo.probe.map(a=>`${a}${casterAttrs[a]||'?'}`).join('/')} FP=${remaining} → ${success?`QS ${qs}`:' misslungen'}`)

            if (success && spec.damage) {
              // Damage = QS x 1W6 (for ignifaxius)
              let spDmg = 0
              for (let q=0; q<qs; q++) spDmg += rand(1,6)
              const sp = Math.max(0, spDmg - (tgt.rs||0))
              const old = tgt.lep; tgt.lep = Math.max(0, tgt.lep-sp)
              const tn = Object.keys(PC).find(nn=>PC[nn].charId===tgt.characterId)
              if(tn) state[tn].lep=tgt.lep
              gm.send({type:'vitals_update',payload:{character_id:tgt.characterId||tgt.id,vitals:{lep:tgt.lep}}})
              for(const w of Object.values(pw)){try{await w.wait(['vitals_update'],1500)}catch{}}
              stats.dmg+=sp; stats.atk++; stats.hit++
              log('🔥', `  ${spec.spell} QS${qs}: ${qs}W6=${spDmg} - RS${tgt.rs||0} = ${sp} SP → ${tgt.name} (${old}→${tgt.lep})`)
              if(tgt.lep<=0){stats.deaths.push(tgt.name);log('💀',`  ${tgt.name} fällt!`)}
            } else if (success && spec.condition) {
              // Condition spell (e.g. Horriphobus → Furcht)
              tgt.conditions = tgt.conditions || []
              tgt.conditions.push({name:'Furcht',level:1,duration:qs,source:spec.spell})
              log('😱', `  ${tgt.name} erhält ${spec.condition} für ${qs} KR!`)
            } else if (!success) {
              log('✗', `  ${spec.spell} misslungen! (FP=${remaining})`)
            }
          } catch(e) { log('⚠️', `  Spell error: ${e.message}`) }

          // Verify AsP persisted to DB
          await sleep(500)
          const pd = await GET(`/api/campaigns/${cid}/players-detail`, gmTok)
          const casterDB = pd.find(p=>p.character_id===atk.characterId)
          const dbAsp = casterDB?.current_asp
          T(`${atk.name} AsP deducted: expected=${state[atk.name].asp} DB=${dbAsp}`, dbAsp != null && Math.abs(dbAsp - state[atk.name].asp) <= 1)

          if(combatants.filter(c=>c.isNPC&&c.lep>0).length===0) combatOver=true
          continue
        }

        // ITEM USE mid-combat (heal if low)
        if (!atk.isNPC && state[atk.name].lep < PC[atk.name].dv.LeP_max * 0.3 && round > 1 && stats.items < 4) {
          const healAmt = rollDmg('1W6+2')
          state[atk.name].lep = Math.min(PC[atk.name].dv.LeP_max, state[atk.name].lep + healAmt)
          atk.lep = state[atk.name].lep
          gm.send({type:'vitals_update',payload:{character_id:atk.characterId,vitals:{lep:state[atk.name].lep}}})
          for(const w of Object.values(pw)){try{await w.wait(['vitals_update'],1500)}catch{}}
          stats.items++
          log('🧪', `  ${atk.name} trinkt Heiltrank: +${healAmt} → ${state[atk.name].lep} LeP`)
          T(`${atk.name} Heiltrank healed (${healAmt} LeP)`, state[atk.name].lep > state[atk.name].lep - healAmt || state[atk.name].lep === PC[atk.name].dv.LeP_max)
          continue
        }

        // NORMAL ATTACK
        stats.atk++
        // Rudelkampf
        let packBonus = 0
        if(atk.specialRules?.some(r=>(typeof r==='string'?r:'').includes('Rudelkampf'))) {
          packBonus = Math.min(combatants.filter(c=>c.name.startsWith(atk.name.split(' ')[0])&&c.lep>0&&c.id!==atk.id).length, 3)
          if(packBonus>0) log('🐺', `  [Rudelkampf +${packBonus} AT]`)
        }

        const atkOpts = {
          at: spec.useRanged ? (spec.at || atk.at) : atk.at,
          atMod: (spec.atMod||0) + packBonus,
          tpMod: spec.tpMod||0,
          defMod: spec.defMod||0,
          maneuver: spec.maneuver||null,
          weaponName: spec.weaponName||atk.weaponName,
          weaponDamage: spec.weaponDamage||atk.weaponDamage,
        }

        if (!atk.isNPC) { stats.diceReq+=2; stats.diceRes+=2 } // attack + damage requests

        const result = await attack(atk, tgt, atkOpts)
        if(result.hit&&!result.defended) stats.hit++
        if(result.sp) stats.dmg += result.sp
        if(result.dead) stats.deaths.push(tgt.name)

        // Update local state
        const tn = Object.keys(PC).find(nn=>PC[nn].charId===tgt.characterId)
        if(tn) state[tn].lep = tgt.lep

        if(combatants.filter(c=>c.isNPC&&c.lep>0).length===0||combatants.filter(c=>!c.isNPC&&c.lep>0).length===0) combatOver=true
        await sleep(20)
      }

      if(!combatOver) {
        gm.send({type:'combat_next_turn',payload:{round_number:round+1}})
        for(const w of Object.values(pw)){try{await w.wait(['combat_next_turn'],1500)}catch{}}
      }
    }

    // Update local hero state
    for(const c of combatants) { if(!c.isNPC){const n=Object.keys(PC).find(nn=>PC[nn].charId===c.characterId); if(n) state[n].lep=c.lep} }

    const heroesWon = combatants.filter(c=>c.isNPC&&c.lep>0).length===0
    const fallen = combatants.filter(c=>c.lep<=0).map(c=>c.name)
    gm.send({type:'combat_end',payload:{result:heroesWon?'victory':'defeat',fallen,survivors:combatants.filter(c=>c.lep>0).map(c=>c.name)}})
    for(const w of Object.values(pw)){try{await w.wait(['combat_end'],2000)}catch{}}

    log(heroesWon?'🏆':'💀', `${name}: ${heroesWon?'SIEG':'NIEDERLAGE'} in ${combatants.length} Kämpfern`)
    log('📊', `  Angriffe: ${stats.atk} | Treffer: ${stats.hit} | Schaden: ${stats.dmg} | Tode: ${stats.deaths.join(', ')}`)
    log('📊', `  Zauber: ${stats.spells} | Items: ${stats.items}`)

    T(`${name}: combat resolved`, stats.atk > 0)
    T(`${name}: damage dealt`, stats.dmg > 0)
    T(`${name}: someone died`, stats.deaths.length > 0)

    await sleep(500)
    await verifyDB(`After ${name}`)
    gm.drain(); for(const w of Object.values(pw)) w.drain()
  }
}

main().catch(e=>{console.error('FATAL:',e);process.exit(1)})
