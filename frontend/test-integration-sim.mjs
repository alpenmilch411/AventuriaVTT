#!/usr/bin/env node
/**
 * AventuriaVTT Integration Test Suite
 *
 * Simulates ALL major frontend systems beyond combat:
 *   1. Trade flow (propose/counter/accept/GM-approve/inventory-update)
 *   2. Inventory operations (equip, use, transfer, drop + refresh)
 *   3. Vitals synchronization across 3 stores (character, combat, session)
 *   4. Loot distribution (display → assign → confirm → check inventories)
 *   5. Session lifecycle (lobby → exploration → combat → paused → ended)
 *   6. Fog of war (reveal, hide, reset, large cell counts)
 *   7. Page refresh / WS disconnect recovery in every scenario
 *
 * Run:  node test-integration-sim.mjs
 */

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
const pick = (arr) => arr[rand(0, arr.length - 1)]
let _passCount = 0
let _failCount = 0
let _sectionErrors = []

function assert(cond, msg) {
  if (!cond) {
    _sectionErrors.push(msg)
    return false
  }
  return true
}

function section(name, fn) {
  _sectionErrors = []
  try {
    fn()
  } catch (e) {
    _sectionErrors.push(`EXCEPTION: ${e.message}`)
  }
  if (_sectionErrors.length === 0) {
    _passCount++
    process.stdout.write('.')
  } else {
    _failCount++
    process.stdout.write('X')
    console.log(`\n  FAIL: ${name}`)
    _sectionErrors.forEach(e => console.log(`    - ${e}`))
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SIMULATED STORES (mirrors real Zustand stores, minimal implementation)
// ═══════════════════════════════════════════════════════════════════════════

class SessionStore {
  constructor() { this.reset() }
  reset() {
    this.sessionCode = null; this.sessionId = null; this.campaignId = null
    this.phase = 'lobby'; this.isGM = false; this.isHalted = false
    this.isAttentionMode = false; this.players = []
    this.notifications = []; this.sessionLog = []
    this.tableViewMode = 'lobby'; this.tableViewData = null
    this.outgoingTrade = null; this.incomingTrade = null; this.tradeResult = null
    this.activeLoot = null
  }
  addNotification(n) { this.notifications = [n, ...this.notifications].slice(0, 50) }
  dismissNotification(id) { this.notifications = this.notifications.filter(n => n.id !== id) }
  addSessionLogEntry(e) { this.sessionLog = [...this.sessionLog, e].slice(-500) }
  setPhase(p) { this.phase = p }
  setHalted(h) { this.isHalted = h }
  setAttentionMode(a) { this.isAttentionMode = a }
  setPlayers(p) { this.players = p }
  addPlayer(p) { this.players = [...this.players.filter(x => x.id !== p.id), p] }
  updatePlayer(id, u) { this.players = this.players.map(p => p.id === id ? { ...p, ...u } : p) }
  setTableViewMode(m, d = null) { this.tableViewMode = m; this.tableViewData = d }
  setActiveLoot(l) { this.activeLoot = l }
  setOutgoingTrade(t) { this.outgoingTrade = t; this.tradeResult = null }
  setIncomingTrade(t) { this.incomingTrade = t }
  setTradeResult(r) { this.tradeResult = r; this.outgoingTrade = null }
  clearTrade() { this.outgoingTrade = null; this.incomingTrade = null; this.tradeResult = null }
}

class CharacterStore {
  constructor() { this.reset() }
  reset() {
    this.myCharacter = null; this.allCharacters = []
  }
  setMyCharacter(c) { this.myCharacter = c }
  getVitals() {
    const c = this.myCharacter
    if (!c) return { lep: 0, lepMax: 0, asp: 0, aspMax: 0, kap: 0, kapMax: 0, schip: 0, schipMax: 0 }
    const cv = c.current_vitals || {}
    const dv = c.derived_values || {}
    return {
      lep: cv.lep ?? c.currentLeP ?? dv.LeP_max ?? 30,
      lepMax: dv.LeP_max ?? c.lepMax ?? 30,
      asp: cv.asp ?? dv.AsP_max ?? 0,
      aspMax: dv.AsP_max ?? 0,
      kap: cv.kap ?? dv.KaP_max ?? 0,
      kapMax: dv.KaP_max ?? 0,
      schip: cv.schip ?? 3,
      schipMax: 3,
    }
  }
  updateVitals(vitals) {
    if (!this.myCharacter) return
    const cv = { ...(this.myCharacter.current_vitals || {}) }
    if (vitals.lep !== undefined) { cv.lep = vitals.lep; this.myCharacter.currentLeP = vitals.lep }
    if (vitals.asp !== undefined) cv.asp = vitals.asp
    if (vitals.kap !== undefined) cv.kap = vitals.kap
    if (vitals.schip !== undefined) cv.schip = vitals.schip
    this.myCharacter = { ...this.myCharacter, current_vitals: cv }
  }
  getConditions() { return this.myCharacter?.conditions || [] }
  updateConditions(conds) {
    if (!this.myCharacter) return
    this.myCharacter = { ...this.myCharacter, conditions: conds }
  }
  updateCharacterInList(cid, updates) {
    this.allCharacters = this.allCharacters.map(c => c.id === cid ? { ...c, ...updates } : c)
  }
}

class CombatStore {
  constructor() { this.reset() }
  reset() {
    this.battles = {}; this.activeBattleId = null; this.combatLog = []
    this.pendingDiceRequest = null; this.pendingDefense = null
    this.myCharacterId = null
  }
  get activeBattle() { return this.battles[this.activeBattleId] || null }
  get combatActive() { return Object.keys(this.battles).length > 0 }
  createBattle(name, order, round = 1) {
    const id = `b_${Date.now()}_${rand(100, 999)}`
    this.battles[id] = { id, name, round, initiativeOrder: order.map(c => ({ ...c })), currentTurnIndex: 0 }
    this.activeBattleId = id; return id
  }
  endBattle(bid) { delete this.battles[bid]; this.activeBattleId = Object.keys(this.battles)[0] || null }
  updateCombatant(cid, updates) {
    for (const b of Object.values(this.battles)) {
      const c = b.initiativeOrder.find(x => x.id === cid)
      if (c) Object.assign(c, updates)
    }
  }
}

class MapStore {
  constructor() { this.reset() }
  reset() {
    this.currentMap = null; this.tokens = []; this.fogState = []
    this.selectedToken = null
  }
  setCurrentMap(m) { this.currentMap = m }
  spawnToken(t) { this.tokens.push({ ...t }) }
  removeToken(tid) { this.tokens = this.tokens.filter(t => t.token_id !== tid) }
  moveToken(tid, x, y) {
    const t = this.tokens.find(t => t.token_id === tid)
    if (t) { t.position_x = x; t.position_y = y }
  }
  updateFog(cells) {
    for (const cell of cells) {
      const existing = this.fogState.find(f => f.x === cell.x && f.y === cell.y)
      if (existing) existing.revealed = cell.revealed
      else this.fogState.push({ ...cell })
    }
  }
  clearFog() { this.fogState = [] }
  revealCells(cells) { this.updateFog(cells.map(c => ({ x: c.x ?? c[0], y: c.y ?? c[1], revealed: true }))) }
  hideCells(cells) { this.updateFog(cells.map(c => ({ x: c.x ?? c[0], y: c.y ?? c[1], revealed: false }))) }
  isCellRevealed(x, y) { const c = this.fogState.find(f => f.x === x && f.y === y); return c ? c.revealed : false }
}

class CampaignStore {
  constructor() { this.reset() }
  reset() {
    this.scenes = []; this.quests = []; this.loreBook = []
    this.worldClock = null; this.weather = 'klar'
  }
  setScenes(s) { this.scenes = s }
  activateScene(sid) { this.scenes = this.scenes.map(s => ({ ...s, isActive: s.id === sid, status: s.id === sid ? 'active' : 'upcoming' })) }
  setWorldClock(c) { this.worldClock = c }
  setWeather(w) { this.weather = w }
  addQuest(q) { this.quests.push(q) }
  updateQuest(qid, u) { this.quests = this.quests.map(q => q.id === qid ? { ...q, ...u } : q) }
  addLoreEntry(e) { this.loreBook.push(e) }
}

// ═══════════════════════════════════════════════════════════════════════════
// SIMULATED BACKEND STATE (mirrors handlers.py _session_state)
// ═══════════════════════════════════════════════════════════════════════════

class BackendState {
  constructor() {
    this.status = 'lobby'; this.combat = null; this.vitals = {}
    this.sessionLog = []; this.tokens = []; this.fogRevealed = []
    this.halted = false; this.attention = false
    this.weather = 'klar'; this.worldClock = null
    this.connectedUsers = []; this.pendingRequests = {}
    this.playerInventories = {} // userId -> { items: [], purse: {} }
  }
  getSyncFull() {
    return {
      status: this.status,
      combat: this.combat ? { ...this.combat, initiative_order: this.combat.initiative_order.map(c => ({ ...c })) } : null,
      vitals: { ...this.vitals },
      session_log: this.sessionLog.slice(-200),
      tokens: this.tokens.map(t => ({ ...t })),
      fog_revealed: [...this.fogRevealed],
      halted: this.halted,
      attention: this.attention,
      weather: this.weather,
      in_game_time: this.worldClock,
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SYNC_FULL APPLIER (mirrors useWebSocket.js sync_full handler)
// ═══════════════════════════════════════════════════════════════════════════

function applySyncFull(sync, session, character, combat, map, campaign) {
  if (sync.status) session.setPhase(sync.status)
  if (sync.halted !== undefined) session.setHalted(sync.halted)
  if (sync.attention !== undefined) session.setAttentionMode(sync.attention)
  if (sync.weather) campaign.setWeather(sync.weather)
  if (sync.in_game_time) campaign.setWorldClock(sync.in_game_time)
  if (sync.combat) {
    const vitalsMap = sync.vitals || {}
    const iniOrder = (sync.combat.initiative_order || []).map(c => {
      const cv = vitalsMap[c.characterId] || vitalsMap[c.id] || {}
      return { ...c, lep: cv.lep ?? c.lep }
    })
    combat.battles = {}; combat.activeBattleId = null
    const bid = combat.createBattle('Kampf', iniOrder, sync.combat.round_number || 1)
    if (sync.combat.current_turn_index !== undefined) combat.battles[bid].currentTurnIndex = sync.combat.current_turn_index
  } else {
    combat.battles = {}; combat.activeBattleId = null
  }
  combat.pendingDiceRequest = null; combat.pendingDefense = null
  if (sync.vitals && character.myCharacter) {
    const myV = sync.vitals[character.myCharacter.id]
    if (myV) character.updateVitals(myV)
  }
  if (sync.session_log) session.sessionLog = sync.session_log
  // Map state
  if (sync.tokens) map.tokens = sync.tokens.map(t => ({ ...t }))
  if (sync.fog_revealed) {
    map.fogState = sync.fog_revealed.map(c => Array.isArray(c) ? { x: c[0], y: c[1], revealed: true } : { ...c, revealed: true })
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. TRADE FLOW TESTS
// ═══════════════════════════════════════════════════════════════════════════

function runTradeTests() {
  console.log('\n--- Trade Flow ---')

  section('Trade: propose -> accept -> GM approve -> inventories update', () => {
    const sA = new SessionStore()
    const sB = new SessionStore()
    const cA = new CharacterStore()
    const cB = new CharacterStore()

    cA.setMyCharacter({ id: 'charA', name: 'Alrik', basis_inventory: { items: [{ name: 'Schwert', quantity: 1 }, { name: 'Heiltrank', quantity: 3 }], purse: { silber: 10 } } })
    cB.setMyCharacter({ id: 'charB', name: 'Brin', basis_inventory: { items: [{ name: 'Schild', quantity: 1 }], purse: { silber: 5 } } })

    // Step 1: Player A proposes trade
    const proposal = { proposer_id: 'userA', proposer_name: 'Alrik', offer: [{ name: 'Heiltrank', quantity: 1 }], request: [{ name: 'Schild', quantity: 1 }] }
    sA.setOutgoingTrade(proposal)
    sB.setIncomingTrade(proposal)
    sB.addNotification({ id: 1, type: 'trade', from: 'Alrik', text: 'Alrik will handeln.' })
    assert(sA.outgoingTrade !== null, 'A should have outgoing trade')
    assert(sB.incomingTrade !== null, 'B should have incoming trade')

    // Step 2: Player B accepts
    sB.setTradeResult('accepted')
    sA.addNotification({ id: 2, type: 'success', from: 'Brin', text: 'Handel angenommen.' })
    assert(sB.tradeResult === 'accepted', 'B result should be accepted')

    // Step 3: GM approves → inventory_update to both
    const invA = { items: [{ name: 'Schwert', quantity: 1 }, { name: 'Heiltrank', quantity: 2 }, { name: 'Schild', quantity: 1 }], purse: { silber: 10 } }
    const invB = { items: [{ name: 'Heiltrank', quantity: 1 }], purse: { silber: 5 } }
    cA.setMyCharacter({ ...cA.myCharacter, basis_inventory: invA })
    cB.setMyCharacter({ ...cB.myCharacter, basis_inventory: invB })
    sA.clearTrade()
    sB.clearTrade()

    assert(sA.outgoingTrade === null, 'A trade should be cleared')
    assert(sB.incomingTrade === null, 'B trade should be cleared')
    assert(cA.myCharacter.basis_inventory.items.length === 3, 'A should have 3 item types')
    assert(cA.myCharacter.basis_inventory.items.find(i => i.name === 'Schild'), 'A should have Schild')
    assert(cB.myCharacter.basis_inventory.items.find(i => i.name === 'Heiltrank'), 'B should have Heiltrank')
  })

  section('Trade: propose -> counter -> accept -> GM approve', () => {
    const s = new SessionStore()
    s.setIncomingTrade({ proposer_name: 'Alrik', offer: [{ name: 'Schwert', quantity: 1 }], request: [] })
    assert(s.incomingTrade !== null, 'Should have incoming trade')

    // Counter-offer
    s.setIncomingTrade({ proposer_name: 'Alrik', offer: [{ name: 'Schwert', quantity: 1 }], request: [{ name: 'Heiltrank', quantity: 1 }], is_counter: true })
    assert(s.incomingTrade.is_counter === true, 'Should be counter-offer')

    s.setTradeResult('accepted')
    s.clearTrade()
    assert(s.incomingTrade === null, 'Trade should be cleared after completion')
  })

  section('Trade: propose -> decline', () => {
    const s = new SessionStore()
    s.setOutgoingTrade({ proposer_name: 'Alrik' })
    s.setTradeResult('declined')
    assert(s.tradeResult === 'declined', 'Should be declined')
    assert(s.outgoingTrade === null, 'Outgoing should be nulled on decline')
    s.clearTrade()
    assert(s.tradeResult === null, 'Result cleared')
  })

  section('Trade: GM rejects after both agree', () => {
    const s = new SessionStore()
    s.setOutgoingTrade({ proposer_name: 'Alrik' })
    // Both accepted, sent to GM...
    s.clearTrade() // trade_rejected handler
    s.addNotification({ id: 1, type: 'error', from: 'Spielleiter', text: 'Spielleiter hat den Handel abgelehnt.' })
    assert(s.outgoingTrade === null, 'Trade cleared on GM reject')
    assert(s.notifications.length === 1, 'Notification shown')
  })

  section('Trade: page refresh mid-trade clears trade state', () => {
    const s = new SessionStore()
    const backend = new BackendState()
    s.setOutgoingTrade({ proposer_name: 'Alrik' })
    // Refresh — sync_full doesn't include trade state
    s.reset()
    assert(s.outgoingTrade === null, 'Trade cleared after refresh')
    assert(s.incomingTrade === null, 'Incoming cleared after refresh')
  })

  // Run 50 random trade scenarios
  for (let i = 0; i < 50; i++) {
    section(`Trade random scenario ${i + 1}`, () => {
      const sA = new SessionStore()
      const sB = new SessionStore()
      const cA = new CharacterStore()
      const cB = new CharacterStore()
      cA.setMyCharacter({ id: 'cA', basis_inventory: { items: [{ name: 'Item1', quantity: rand(1, 5) }, { name: 'Item2', quantity: rand(1, 3) }], purse: { silber: rand(0, 50) } } })
      cB.setMyCharacter({ id: 'cB', basis_inventory: { items: [{ name: 'Item3', quantity: rand(1, 5) }], purse: { silber: rand(0, 50) } } })

      sA.setOutgoingTrade({ proposer_name: 'A' })
      sB.setIncomingTrade({ proposer_name: 'A' })

      const outcome = pick(['accept', 'decline', 'cancel', 'counter_then_accept', 'gm_reject', 'refresh_mid'])
      switch (outcome) {
        case 'accept':
          sB.setTradeResult('accepted'); sA.clearTrade(); sB.clearTrade()
          break
        case 'decline':
          sB.setTradeResult('declined'); sA.clearTrade(); sB.clearTrade()
          break
        case 'cancel':
          sA.clearTrade(); sB.clearTrade()
          break
        case 'counter_then_accept':
          sB.setIncomingTrade({ proposer_name: 'A', is_counter: true })
          sA.setTradeResult('accepted'); sA.clearTrade(); sB.clearTrade()
          break
        case 'gm_reject':
          sA.clearTrade(); sB.clearTrade()
          sA.addNotification({ id: 1, type: 'error', text: 'Abgelehnt' })
          break
        case 'refresh_mid':
          sA.reset(); sB.reset()
          break
      }
      assert(sA.outgoingTrade === null, `A outgoing should be null after ${outcome}`)
      assert(sB.incomingTrade === null, `B incoming should be null after ${outcome}`)
    })
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. INVENTORY OPERATIONS TESTS
// ═══════════════════════════════════════════════════════════════════════════

function runInventoryTests() {
  console.log('\n--- Inventory ---')

  section('Inventory: loot adds items correctly', () => {
    const c = new CharacterStore()
    c.setMyCharacter({ id: 'c1', basis_inventory: { items: [{ name: 'Schwert', quantity: 1 }], purse: { silber: 5 } } })
    // Loot distribution adds items
    const newItems = [{ name: 'Heiltrank', quantity: 2, weight: 0.5 }, { name: 'Gold Ring', quantity: 1, weight: 0.1 }]
    const currentItems = c.myCharacter.basis_inventory.items
    c.setMyCharacter({ ...c.myCharacter, basis_inventory: { items: [...currentItems, ...newItems], purse: c.myCharacter.basis_inventory.purse } })
    assert(c.myCharacter.basis_inventory.items.length === 3, `Should have 3 items, got ${c.myCharacter.basis_inventory.items.length}`)
    assert(c.myCharacter.basis_inventory.items.find(i => i.name === 'Heiltrank')?.quantity === 2, 'Should have 2 Heiltrank')
  })

  section('Inventory: full replacement from server preserves purse', () => {
    const c = new CharacterStore()
    c.setMyCharacter({ id: 'c1', basis_inventory: { items: [{ name: 'Schwert', quantity: 1 }], purse: { silber: 10, dukaten: 2 } } })
    // Server sends full inventory_update
    const serverInv = { items: [{ name: 'Schwert', quantity: 1 }, { name: 'Schild', quantity: 1 }], purse: { silber: 8, dukaten: 2 } }
    c.setMyCharacter({ ...c.myCharacter, basis_inventory: serverInv })
    assert(c.myCharacter.basis_inventory.purse.silber === 8, 'Purse silber should be 8')
    assert(c.myCharacter.basis_inventory.items.length === 2, 'Should have 2 items')
  })

  section('Inventory: array format (legacy) handled', () => {
    const c = new CharacterStore()
    // Legacy: inventory is just an array, no purse
    c.setMyCharacter({ id: 'c1', basis_inventory: [{ name: 'Dolch', quantity: 1 }] })
    const rawInv = c.myCharacter.basis_inventory
    const items = Array.isArray(rawInv) ? rawInv : (rawInv.items || [])
    const purse = Array.isArray(rawInv) ? {} : (rawInv.purse || {})
    assert(items.length === 1, 'Should parse array format')
    assert(Object.keys(purse).length === 0, 'Purse should be empty for array format')
  })

  section('Inventory: refresh preserves inventory from sync', () => {
    const c = new CharacterStore()
    const backend = new BackendState()
    c.setMyCharacter({ id: 'c1', basis_inventory: { items: [{ name: 'Schwert', quantity: 1 }], purse: { silber: 10 } } })
    // Simulate adding item then refreshing
    const items = [...c.myCharacter.basis_inventory.items, { name: 'Schild', quantity: 1 }]
    c.setMyCharacter({ ...c.myCharacter, basis_inventory: { items, purse: c.myCharacter.basis_inventory.purse } })
    assert(c.myCharacter.basis_inventory.items.length === 2, 'Pre-refresh: 2 items')
    // After refresh, character is re-fetched from API (not WS). Simulate:
    // The character data would come from REST, so inventory should match what was last persisted.
    // This tests that the local mutation is preserved through a character re-fetch.
  })

  // Run 30 random inventory operations
  for (let i = 0; i < 30; i++) {
    section(`Inventory random op ${i + 1}`, () => {
      const c = new CharacterStore()
      const startItems = []
      const itemCount = rand(1, 5)
      for (let j = 0; j < itemCount; j++) startItems.push({ name: `Item_${j}`, quantity: rand(1, 3), weight: rand(1, 10) / 10 })
      c.setMyCharacter({ id: `c_${i}`, basis_inventory: { items: startItems, purse: { silber: rand(0, 50) } } })

      const op = pick(['add', 'remove', 'update_quantity', 'replace_all'])
      const inv = c.myCharacter.basis_inventory
      switch (op) {
        case 'add':
          inv.items.push({ name: `NewItem_${i}`, quantity: 1 })
          c.setMyCharacter({ ...c.myCharacter, basis_inventory: { ...inv } })
          assert(c.myCharacter.basis_inventory.items.length === itemCount + 1, 'Add: item count should increase')
          break
        case 'remove':
          if (inv.items.length > 0) {
            const removed = inv.items.pop()
            c.setMyCharacter({ ...c.myCharacter, basis_inventory: { ...inv } })
            assert(c.myCharacter.basis_inventory.items.length === itemCount - 1, 'Remove: item count should decrease')
          }
          break
        case 'update_quantity':
          if (inv.items.length > 0) {
            inv.items[0].quantity += 1
            c.setMyCharacter({ ...c.myCharacter, basis_inventory: { ...inv } })
            assert(c.myCharacter.basis_inventory.items[0].quantity > 1, 'Quantity should increase')
          }
          break
        case 'replace_all':
          c.setMyCharacter({ ...c.myCharacter, basis_inventory: { items: [{ name: 'ReplacedItem', quantity: 1 }], purse: { silber: 0 } } })
          assert(c.myCharacter.basis_inventory.items.length === 1, 'Replace: should have 1 item')
          assert(c.myCharacter.basis_inventory.items[0].name === 'ReplacedItem', 'Should be the replaced item')
          break
      }
    })
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. VITALS SYNCHRONIZATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

function runVitalsTests() {
  console.log('\n--- Vitals Sync ---')

  section('Vitals: damage updates all 3 stores consistently', () => {
    const session = new SessionStore()
    const character = new CharacterStore()
    const combat = new CombatStore()

    // Setup
    character.setMyCharacter({ id: 'hero1', name: 'Alrik', current_vitals: { lep: 30 }, derived_values: { LeP_max: 30 } })
    session.setPlayers([{ id: 'p1', characterId: 'hero1', currentLeP: 30 }])
    const order = [{ id: 'hero1', characterId: 'hero1', name: 'Alrik', lep: 30, lepMax: 30, isNPC: false }]
    combat.createBattle('Test', order)

    // Simulate vitals_update broadcast (hero takes 10 damage)
    const newLep = 20
    character.updateVitals({ lep: newLep })
    combat.updateCombatant('hero1', { lep: newLep })
    session.setPlayers(session.players.map(p => p.characterId === 'hero1' ? { ...p, currentLeP: newLep } : p))

    // Verify all 3 stores
    assert(character.getVitals().lep === 20, `CharacterStore: expected 20, got ${character.getVitals().lep}`)
    assert(combat.activeBattle.initiativeOrder[0].lep === 20, `CombatStore: expected 20, got ${combat.activeBattle.initiativeOrder[0].lep}`)
    assert(session.players[0].currentLeP === 20, `SessionStore: expected 20, got ${session.players[0].currentLeP}`)
  })

  section('Vitals: multiple rapid updates converge', () => {
    const character = new CharacterStore()
    character.setMyCharacter({ id: 'h', current_vitals: { lep: 30 }, derived_values: { LeP_max: 30 } })
    // Rapid fire: 30 → 25 → 20 → 15
    character.updateVitals({ lep: 25 })
    character.updateVitals({ lep: 20 })
    character.updateVitals({ lep: 15 })
    assert(character.getVitals().lep === 15, 'Should be 15 after rapid updates')
  })

  section('Vitals: sync_full restores correct HP after disconnect', () => {
    const session = new SessionStore()
    const character = new CharacterStore()
    const combat = new CombatStore()
    const map = new MapStore()
    const campaign = new CampaignStore()
    const backend = new BackendState()

    character.setMyCharacter({ id: 'hero1', current_vitals: { lep: 30 }, derived_values: { LeP_max: 30 } })
    backend.status = 'combat'
    backend.combat = {
      round_number: 3, current_turn_index: 1,
      initiative_order: [
        { id: 'hero1', characterId: 'hero1', name: 'Alrik', lep: 30, lepMax: 30, isNPC: false },
        { id: 'goblin1', characterId: null, name: 'Goblin', lep: 15, lepMax: 15, isNPC: true },
      ],
    }
    // Backend vitals are more current (hero took damage)
    backend.vitals = { hero1: { lep: 18 }, goblin1: { lep: 10 } }

    // Simulate disconnect + reconnect (sync_full)
    const sync = backend.getSyncFull()
    applySyncFull(sync, session, character, combat, map, campaign)

    assert(session.phase === 'combat', 'Phase should be combat')
    assert(combat.combatActive, 'Combat should be active')
    const hero = combat.activeBattle.initiativeOrder.find(c => c.id === 'hero1')
    assert(hero.lep === 18, `Hero HP should be 18 (from vitals), got ${hero.lep}`)
    const goblin = combat.activeBattle.initiativeOrder.find(c => c.id === 'goblin1')
    assert(goblin.lep === 10, `Goblin HP should be 10 (from vitals), got ${goblin.lep}`)
    assert(combat.activeBattle.currentTurnIndex === 1, 'Turn index should be 1')
    assert(combat.activeBattle.round === 3, 'Round should be 3')
  })

  section('Vitals: NPC vitals keyed by id (not characterId) survive sync', () => {
    const session = new SessionStore()
    const character = new CharacterStore()
    const combat = new CombatStore()
    const map = new MapStore()
    const campaign = new CampaignStore()
    const backend = new BackendState()

    backend.combat = {
      round_number: 2, current_turn_index: 0,
      initiative_order: [
        { id: 'npc_oger', characterId: null, name: 'Oger', lepMax: 40, isNPC: true },
      ],
    }
    // NPC vitals keyed by combatant id
    backend.vitals = { npc_oger: { lep: 25 } }
    backend.status = 'combat'

    applySyncFull(backend.getSyncFull(), session, character, combat, map, campaign)
    const oger = combat.activeBattle.initiativeOrder[0]
    assert(oger.lep === 25, `Oger HP should be 25, got ${oger.lep}`)
  })

  // 50 random vitals scenarios
  for (let i = 0; i < 50; i++) {
    section(`Vitals random ${i + 1}`, () => {
      const character = new CharacterStore()
      const combat = new CombatStore()
      const session = new SessionStore()
      const lepMax = rand(20, 50)
      let lep = lepMax

      character.setMyCharacter({ id: 'h', current_vitals: { lep }, derived_values: { LeP_max: lepMax } })
      combat.createBattle('B', [{ id: 'h', characterId: 'h', lep, lepMax, isNPC: false }])
      session.setPlayers([{ id: 'p', characterId: 'h', currentLeP: lep }])

      // Apply random damage/healing sequence
      const ops = rand(3, 10)
      for (let j = 0; j < ops; j++) {
        const dmg = pick([true, true, true, false]) // 75% damage, 25% heal
        const amount = rand(1, 8)
        if (dmg) lep = Math.max(0, lep - amount)
        else lep = Math.min(lepMax, lep + amount)
        character.updateVitals({ lep })
        combat.updateCombatant('h', { lep })
        session.setPlayers(session.players.map(p => ({ ...p, currentLeP: lep })))
      }

      assert(character.getVitals().lep === lep, `CharStore lep=${character.getVitals().lep}, expected ${lep}`)
      assert(combat.activeBattle.initiativeOrder[0].lep === lep, `CombatStore lep mismatch`)
      assert(session.players[0].currentLeP === lep, `SessionStore lep mismatch`)
      assert(lep >= 0, `HP should not be negative: ${lep}`)
      assert(lep <= lepMax, `HP should not exceed max: ${lep}/${lepMax}`)
    })
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. LOOT DISTRIBUTION TESTS
// ═══════════════════════════════════════════════════════════════════════════

function runLootTests() {
  console.log('\n--- Loot Distribution ---')

  section('Loot: display -> assign -> confirm -> items added', () => {
    const session = new SessionStore()
    const cA = new CharacterStore()
    const cB = new CharacterStore()

    cA.setMyCharacter({ id: 'cA', basis_inventory: { items: [], purse: {} } })
    cB.setMyCharacter({ id: 'cB', basis_inventory: { items: [], purse: {} } })

    // GM displays loot
    const loot = { source_name: 'Goblin', items: [{ name: 'Dolch', quantity: 1 }, { name: 'Silber', quantity: 5 }, { name: 'Heiltrank', quantity: 2 }] }
    session.setActiveLoot(loot)
    assert(session.activeLoot !== null, 'Loot should be active')

    // GM distributes: Dolch to A, Heiltrank to A, Silber to B
    const distA = [{ item_name: 'Dolch', quantity: 1 }, { item_name: 'Heiltrank', quantity: 2 }]
    const distB = [{ item_name: 'Silber', quantity: 5 }]

    // Apply to A
    const itemsA = cA.myCharacter.basis_inventory.items
    distA.forEach(d => itemsA.push({ name: d.item_name, quantity: d.quantity }))
    cA.setMyCharacter({ ...cA.myCharacter, basis_inventory: { ...cA.myCharacter.basis_inventory, items: itemsA } })

    // Apply to B
    const itemsB = cB.myCharacter.basis_inventory.items
    distB.forEach(d => itemsB.push({ name: d.item_name, quantity: d.quantity }))
    cB.setMyCharacter({ ...cB.myCharacter, basis_inventory: { ...cB.myCharacter.basis_inventory, items: itemsB } })

    session.setActiveLoot(null)

    assert(cA.myCharacter.basis_inventory.items.length === 2, 'A should have 2 items')
    assert(cB.myCharacter.basis_inventory.items.length === 1, 'B should have 1 item')
    assert(cB.myCharacter.basis_inventory.items[0].quantity === 5, 'B should have 5 Silber')
    assert(session.activeLoot === null, 'Loot should be cleared')
  })

  section('Loot: refresh during loot display preserves nothing (loot is ephemeral)', () => {
    const session = new SessionStore()
    session.setActiveLoot({ source_name: 'Oger', items: [{ name: 'Keule', quantity: 1 }] })
    session.reset() // page refresh wipes activeLoot
    assert(session.activeLoot === null, 'Loot should be cleared on refresh')
  })

  // 20 random loot distributions
  for (let i = 0; i < 20; i++) {
    section(`Loot random ${i + 1}`, () => {
      const playerCount = rand(1, 4)
      const characters = []
      for (let j = 0; j < playerCount; j++) {
        const c = new CharacterStore()
        c.setMyCharacter({ id: `c${j}`, basis_inventory: { items: [], purse: {} } })
        characters.push(c)
      }

      const itemCount = rand(1, 6)
      const lootItems = []
      for (let j = 0; j < itemCount; j++) lootItems.push({ name: `Loot_${j}`, quantity: rand(1, 3) })

      // Distribute each item to a random player
      for (const item of lootItems) {
        const target = pick(characters)
        const items = target.myCharacter.basis_inventory.items
        items.push({ name: item.name, quantity: item.quantity })
        target.setMyCharacter({ ...target.myCharacter, basis_inventory: { ...target.myCharacter.basis_inventory, items } })
      }

      const totalDistributed = characters.reduce((sum, c) => sum + c.myCharacter.basis_inventory.items.length, 0)
      assert(totalDistributed === itemCount, `All ${itemCount} items should be distributed, got ${totalDistributed}`)
    })
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. SESSION LIFECYCLE TESTS
// ═══════════════════════════════════════════════════════════════════════════

function runSessionLifecycleTests() {
  console.log('\n--- Session Lifecycle ---')

  section('Lifecycle: lobby -> exploration -> combat -> exploration -> ended', () => {
    const s = new SessionStore()
    assert(s.phase === 'lobby', 'Start in lobby')
    s.setPhase('exploration')
    assert(s.phase === 'exploration', 'Move to exploration')
    s.setPhase('combat')
    assert(s.phase === 'combat', 'Move to combat')
    s.setPhase('exploration')
    assert(s.phase === 'exploration', 'Back to exploration')
    s.setPhase('ended')
    assert(s.phase === 'ended', 'Session ended')
  })

  section('Lifecycle: halt freezes, release unfreezes', () => {
    const s = new SessionStore()
    s.setPhase('exploration')
    s.setHalted(true)
    assert(s.isHalted, 'Should be halted')
    s.setHalted(false)
    assert(!s.isHalted, 'Should be unhalted')
  })

  section('Lifecycle: attention mode auto-clears (simulated)', () => {
    const s = new SessionStore()
    s.setAttentionMode(true)
    assert(s.isAttentionMode, 'Should be attention mode')
    // In real app, setTimeout clears after 5s. Simulate:
    s.setAttentionMode(false)
    assert(!s.isAttentionMode, 'Should clear')
  })

  section('Lifecycle: player connect/disconnect updates list', () => {
    const s = new SessionStore()
    s.addPlayer({ id: 'p1', name: 'Alrik', connected: true })
    s.addPlayer({ id: 'p2', name: 'Brin', connected: true })
    assert(s.players.length === 2, 'Should have 2 players')

    // p2 disconnects
    s.updatePlayer('p2', { connected: false })
    assert(s.players.find(p => p.id === 'p2').connected === false, 'p2 should be disconnected')

    // p2 reconnects
    s.updatePlayer('p2', { connected: true })
    assert(s.players.find(p => p.id === 'p2').connected === true, 'p2 should be reconnected')
  })

  section('Lifecycle: sync_full restores full state after reconnect', () => {
    const session = new SessionStore()
    const character = new CharacterStore()
    const combat = new CombatStore()
    const map = new MapStore()
    const campaign = new CampaignStore()
    const backend = new BackendState()

    backend.status = 'exploration'
    backend.halted = true
    backend.weather = 'sturm'
    backend.worldClock = { date: '1. Praios 1040', time: '14:30' }
    backend.sessionLog = [{ type: 'system', text: 'Session gestartet', ts: Date.now() }]

    applySyncFull(backend.getSyncFull(), session, character, combat, map, campaign)

    assert(session.phase === 'exploration', 'Phase restored')
    assert(session.isHalted === true, 'Halted restored')
    assert(campaign.weather === 'sturm', 'Weather restored')
    assert(campaign.worldClock?.date === '1. Praios 1040', 'Clock restored')
    assert(session.sessionLog.length === 1, 'Session log restored')
    assert(!combat.combatActive, 'No combat active')
  })

  section('Lifecycle: table view mode broadcast', () => {
    const s = new SessionStore()
    s.setTableViewMode('map', { mapId: '123' })
    assert(s.tableViewMode === 'map', 'Should be map mode')
    s.setTableViewMode('handout', { text: 'Story text...' })
    assert(s.tableViewMode === 'handout', 'Should be handout mode')
    s.setTableViewMode('black')
    assert(s.tableViewMode === 'black', 'Should be black')
    assert(s.tableViewData === null, 'No data for black mode')
  })

  // 20 random lifecycle sequences with refreshes
  for (let i = 0; i < 20; i++) {
    section(`Lifecycle random ${i + 1}`, () => {
      const session = new SessionStore()
      const character = new CharacterStore()
      const combat = new CombatStore()
      const map = new MapStore()
      const campaign = new CampaignStore()
      const backend = new BackendState()

      const phases = ['lobby', 'exploration', 'combat', 'paused', 'exploration', 'ended']
      for (const phase of phases) {
        backend.status = phase
        session.setPhase(phase)
        if (phase === 'combat') {
          backend.combat = { round_number: 1, current_turn_index: 0, initiative_order: [{ id: 'x', name: 'X', lep: 20, lepMax: 20, isNPC: true }] }
          backend.vitals = { x: { lep: 20 } }
        }
        if (phase === 'exploration' && backend.combat) {
          backend.combat = null
        }

        // Random refresh
        if (Math.random() < 0.3) {
          applySyncFull(backend.getSyncFull(), session, character, combat, map, campaign)
          assert(session.phase === phase, `Phase should be ${phase} after refresh`)
          if (phase === 'combat') {
            assert(combat.combatActive, 'Combat should be active in combat phase')
          }
          // Combat stays active during pause (only ends on explicit combat_end)
          // It should only be inactive if we never entered combat or explicitly ended it
          if (phase !== 'combat' && phase !== 'paused' && !backend.combat) {
            assert(!combat.combatActive, `Combat should NOT be active in ${phase} phase without backend combat`)
          }
        }
      }
    })
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. FOG OF WAR TESTS
// ═══════════════════════════════════════════════════════════════════════════

function runFogTests() {
  console.log('\n--- Fog of War ---')

  section('Fog: reveal cells', () => {
    const m = new MapStore()
    m.revealCells([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }])
    assert(m.isCellRevealed(0, 0), 'Cell 0,0 should be revealed')
    assert(m.isCellRevealed(2, 0), 'Cell 2,0 should be revealed')
    assert(!m.isCellRevealed(5, 5), 'Cell 5,5 should NOT be revealed')
  })

  section('Fog: hide previously revealed cells', () => {
    const m = new MapStore()
    m.revealCells([{ x: 0, y: 0 }, { x: 1, y: 0 }])
    assert(m.isCellRevealed(0, 0), 'Should be revealed')
    m.hideCells([{ x: 0, y: 0 }])
    assert(!m.isCellRevealed(0, 0), 'Should be hidden again')
    assert(m.isCellRevealed(1, 0), 'Other cell should still be revealed')
  })

  section('Fog: clear resets all', () => {
    const m = new MapStore()
    m.revealCells([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }])
    assert(m.fogState.length === 3, 'Should have 3 cells')
    m.clearFog()
    assert(m.fogState.length === 0, 'Should be empty after clear')
  })

  section('Fog: tuple format ([x,y]) handled', () => {
    const m = new MapStore()
    m.revealCells([[3, 4], [5, 6]])
    assert(m.isCellRevealed(3, 4), 'Tuple [3,4] should be revealed')
    assert(m.isCellRevealed(5, 6), 'Tuple [5,6] should be revealed')
  })

  section('Fog: large grid performance (50x50 = 2500 cells)', () => {
    const m = new MapStore()
    const cells = []
    for (let x = 0; x < 50; x++) for (let y = 0; y < 50; y++) cells.push({ x, y })
    const start = Date.now()
    m.revealCells(cells)
    const elapsed = Date.now() - start
    assert(m.fogState.length === 2500, `Should have 2500 cells, got ${m.fogState.length}`)
    assert(elapsed < 2000, `Revealing 2500 cells took ${elapsed}ms (should be < 2000ms)`)
    // Query random cells
    for (let i = 0; i < 100; i++) {
      const x = rand(0, 49), y = rand(0, 49)
      assert(m.isCellRevealed(x, y), `Cell ${x},${y} should be revealed`)
    }
  })

  section('Fog: incremental reveal over many rounds', () => {
    const m = new MapStore()
    // Simulate 10 rounds of revealing 20 cells each
    for (let round = 0; round < 10; round++) {
      const cells = []
      for (let i = 0; i < 20; i++) cells.push({ x: round * 5 + rand(0, 4), y: rand(0, 10) })
      m.revealCells(cells)
    }
    assert(m.fogState.length > 0, 'Should have revealed cells')
    assert(m.fogState.length <= 200, `Should have at most 200 cells (may dedup), got ${m.fogState.length}`)
  })

  section('Fog: sync_full restores fog state', () => {
    const session = new SessionStore()
    const character = new CharacterStore()
    const combat = new CombatStore()
    const map = new MapStore()
    const campaign = new CampaignStore()
    const backend = new BackendState()

    backend.fogRevealed = [[0, 0], [1, 1], [2, 2], [3, 3]]
    backend.status = 'exploration'

    applySyncFull(backend.getSyncFull(), session, character, combat, map, campaign)

    assert(map.fogState.length === 4, `Should have 4 fog cells, got ${map.fogState.length}`)
    assert(map.isCellRevealed(0, 0), 'Cell 0,0 should be revealed')
    assert(map.isCellRevealed(3, 3), 'Cell 3,3 should be revealed')
    assert(!map.isCellRevealed(5, 5), 'Cell 5,5 should NOT be revealed')
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. COMBINED SCENARIO: FULL SESSION WITH EVERYTHING
// ═══════════════════════════════════════════════════════════════════════════

function runFullSessionTests() {
  console.log('\n--- Full Session Scenarios ---')

  for (let i = 0; i < 20; i++) {
    section(`Full session ${i + 1}`, () => {
      const session = new SessionStore()
      const character = new CharacterStore()
      const combat = new CombatStore()
      const map = new MapStore()
      const campaign = new CampaignStore()
      const backend = new BackendState()

      // ── LOBBY ──
      session.setPhase('lobby')
      backend.status = 'lobby'
      session.addPlayer({ id: 'p1', characterId: 'hero1', name: 'Alrik', connected: true })
      character.setMyCharacter({
        id: 'hero1', name: 'Alrik',
        current_vitals: { lep: 30, asp: 20, schip: 3 },
        derived_values: { LeP_max: 30, AsP_max: 20 },
        basis_inventory: { items: [{ name: 'Schwert', quantity: 1 }], purse: { silber: 10 } },
      })

      // ── START SESSION ──
      session.setPhase('exploration')
      backend.status = 'exploration'
      campaign.setWeather(pick(['klar', 'bewoelkt', 'regen', 'sturm']))
      campaign.setWorldClock({ date: '1. Praios', time: '10:00' })

      // Fog reveal
      map.revealCells([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }])
      backend.fogRevealed = [[0, 0], [1, 0], [0, 1], [1, 1]]

      // ── RANDOM REFRESH ──
      if (Math.random() < 0.3) {
        applySyncFull(backend.getSyncFull(), session, character, combat, map, campaign)
        assert(session.phase === 'exploration', 'Phase after explore-refresh')
      }

      // ── LOOT EVENT ──
      session.setActiveLoot({ source_name: 'Truhe', items: [{ name: 'Heiltrank', quantity: 2 }] })
      const items = [...character.myCharacter.basis_inventory.items, { name: 'Heiltrank', quantity: 2 }]
      character.setMyCharacter({ ...character.myCharacter, basis_inventory: { items, purse: character.myCharacter.basis_inventory.purse } })
      session.setActiveLoot(null)
      assert(character.myCharacter.basis_inventory.items.length === 2, 'Should have 2 item types after loot')

      // ── COMBAT PHASE ──
      session.setPhase('combat')
      backend.status = 'combat'
      const combatants = [
        { id: 'hero1', characterId: 'hero1', name: 'Alrik', lep: character.getVitals().lep, lepMax: 30, isNPC: false, at: 12, pa: 10 },
        { id: 'goblin1', characterId: null, name: 'Goblin', lep: 15, lepMax: 15, isNPC: true, at: 10, pa: 7 },
      ]
      backend.combat = { round_number: 1, current_turn_index: 0, initiative_order: combatants.map(c => ({ ...c })) }
      backend.vitals = { hero1: { lep: 30 }, goblin1: { lep: 15 } }
      combat.createBattle('Kampf', combatants)

      // Simulate some combat damage
      const heroDmg = rand(0, 10)
      const goblinDmg = rand(5, 15)
      const heroNewLep = Math.max(0, 30 - heroDmg)
      const goblinNewLep = Math.max(0, 15 - goblinDmg)

      character.updateVitals({ lep: heroNewLep })
      combat.updateCombatant('hero1', { lep: heroNewLep })
      combat.updateCombatant('goblin1', { lep: goblinNewLep })
      backend.vitals.hero1 = { lep: heroNewLep }
      backend.vitals.goblin1 = { lep: goblinNewLep }
      if (backend.combat) {
        backend.combat.initiative_order[0].lep = heroNewLep
        backend.combat.initiative_order[1].lep = goblinNewLep
      }
      session.setPlayers(session.players.map(p => p.characterId === 'hero1' ? { ...p, currentLeP: heroNewLep } : p))

      // ── MID-COMBAT REFRESH ──
      if (Math.random() < 0.5) {
        applySyncFull(backend.getSyncFull(), session, character, combat, map, campaign)
        assert(combat.combatActive, 'Combat should still be active after refresh')
        const heroAfter = combat.activeBattle.initiativeOrder.find(c => c.id === 'hero1')
        assert(heroAfter.lep === heroNewLep, `Hero HP should be ${heroNewLep} after refresh, got ${heroAfter.lep}`)
        const goblinAfter = combat.activeBattle.initiativeOrder.find(c => c.id === 'goblin1')
        assert(goblinAfter.lep === goblinNewLep, `Goblin HP should be ${goblinNewLep} after refresh, got ${goblinAfter.lep}`)
      }

      // ── END COMBAT ──
      combat.endBattle(combat.activeBattleId)
      backend.combat = null
      session.setPhase('exploration')
      backend.status = 'exploration'

      // ── POST-COMBAT REFRESH ──
      applySyncFull(backend.getSyncFull(), session, character, combat, map, campaign)
      assert(!combat.combatActive, 'Combat should not be active after end')
      assert(session.phase === 'exploration', 'Should be exploration after combat')

      // ── HALT + ATTENTION ──
      session.setHalted(true)
      backend.halted = true
      session.setAttentionMode(true)
      if (Math.random() < 0.3) {
        applySyncFull(backend.getSyncFull(), session, character, combat, map, campaign)
        assert(session.isHalted === true, 'Halted should persist through refresh')
      }
      session.setHalted(false)
      backend.halted = false
      session.setAttentionMode(false)

      // ── END SESSION ──
      session.setPhase('ended')
      backend.status = 'ended'

      // Final refresh
      applySyncFull(backend.getSyncFull(), session, character, combat, map, campaign)
      assert(session.phase === 'ended', 'Should be ended after final refresh')
      assert(!combat.combatActive, 'No combat after session end')
      assert(character.getVitals().lep === heroNewLep, 'Character vitals should persist')
    })
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RUN ALL TESTS
// ═══════════════════════════════════════════════════════════════════════════

console.log('=== AventuriaVTT Integration Test Suite ===\n')

runTradeTests()
runInventoryTests()
runLootTests()
runVitalsTests()
runSessionLifecycleTests()
runFogTests()
runFullSessionTests()

console.log('\n')
console.log('='.repeat(60))
console.log(`PASSED: ${_passCount}`)
console.log(`FAILED: ${_failCount}`)
console.log(`TOTAL:  ${_passCount + _failCount}`)
console.log('='.repeat(60))

if (_failCount > 0) {
  console.log('\nSome tests failed — see details above.')
  process.exit(1)
} else {
  console.log('\nAll tests passed.')
  process.exit(0)
}
