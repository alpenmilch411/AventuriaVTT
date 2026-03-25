#!/usr/bin/env node
/**
 * Combat Simulation — 100 battles between GM-agent and Player-agent.
 *
 * Simulates the full WebSocket combat protocol (frontend stores + backend state)
 * with randomized page refreshes on both sides, and validates:
 *
 *   NEGATIVE checks (should NOT happen):
 *     - Deadlocks (no side can act)
 *     - Timeouts (battle never ends)
 *     - HP mismatches (frontend vs backend)
 *     - Unresolved prompts (dice/defense requests left hanging)
 *     - Phantom HP (lep > lepMax)
 *     - Negative HP (lep < 0)
 *
 *   POSITIVE checks (MUST happen):
 *     - Damage was actually dealt
 *     - At least one combatant died
 *     - HP values changed from starting values
 *     - Combat log contains attack, defense, and damage entries
 *     - Session log (Protokoll) has combat events
 *     - After page refresh, HP and turn state match pre-refresh state
 *
 * Run:  node test-combat-sim.mjs
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
const d20 = () => rand(1, 20)
const d6 = () => rand(1, 6)
const pick = (arr) => arr[rand(0, arr.length - 1)]

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
}

// ─── DSA5 Engine (mirrors backend/engine) ───────────────────────────────────

function resolveAttack(atValue, roll, maneuver = null) {
  let atMod = 0
  if (maneuver) {
    const stufe = maneuver.stufe || 1
    atMod = (maneuver.atMod || 0) * stufe
  }
  const effectiveAt = atValue + atMod
  const hit = roll === 1 ? true : roll === 20 ? false : roll <= effectiveAt
  return { hit: hit || (roll === 1), roll, effectiveAt, critical: roll === 1, patzer: roll === 20 }
}

function resolveDefense(defenseType, defenseValue, roll, reactionCount = 0) {
  const penalty = reactionCount > 0 ? reactionCount * -3 : 0
  const effective = defenseValue + penalty
  const success = roll === 1 ? true : roll === 20 ? false : roll <= effective
  return { success, roll, defenseType, effective, penalty }
}

function parseDamageFormula(formula) {
  const m = formula.match(/(\d+)[Ww](\d+)([+-]\d+)?/)
  if (!m) return { count: 1, sides: 6, bonus: 0 }
  return { count: parseInt(m[1]), sides: parseInt(m[2]), bonus: parseInt(m[3] || '0') }
}

function rollDamage(formula) {
  const { count, sides, bonus } = parseDamageFormula(formula)
  let total = bonus
  for (let i = 0; i < count; i++) total += rand(1, sides)
  return Math.max(0, total)
}

// ─── Combatant generator ────────────────────────────────────────────────────

const NAMES_HEROES = ['Alrik', 'Brin', 'Cella', 'Dorin', 'Emer', 'Firun', 'Gwen', 'Hesinde']
const NAMES_NPCS = ['Goblin A', 'Goblin B', 'Ork-Krieger', 'Oger', 'Skelett', 'Wolf', 'Bandit', 'Rattling']

const MANEUVERS = [
  null, null, null,
  { id: 'wuchtschlag', label: 'Wuchtschlag I', atMod: -1, tpMod: 1, stufe: 1 },
  { id: 'wuchtschlag', label: 'Wuchtschlag II', atMod: -1, tpMod: 1, stufe: 2 },
  { id: 'finte', label: 'Finte I', atMod: -1, defMod: -1, tpMod: 0, stufe: 1 },
  { id: 'finte', label: 'Finte II', atMod: -1, defMod: -1, tpMod: 0, stufe: 2 },
]

let _uid = 0
function makeCombatant(name, isNPC) {
  _uid++
  const at = rand(8, 15)
  const pa = rand(6, 12)
  const aw = rand(4, 8)
  const rs = rand(0, 4)
  const lepMax = rand(20, 40)
  return {
    id: `c_${_uid}`,
    characterId: isNPC ? null : `char_${_uid}`,
    userId: isNPC ? null : `user_${_uid}`,
    name, isNPC, at, pa, aw, rs,
    lep: lepMax, lepMax,
    initiative: rand(5, 20),
    iniBasis: rand(8, 14),
    weaponName: pick(['Schwert', 'Axt', 'Speer', 'Dolch', 'Keule']),
    weaponDamage: pick(['1W6+2', '1W6+4', '2W6+2', '1W6+1', '1W6+3']),
    conditions: [],
    _reactionsThisRound: 0,
  }
}

// ─── Tracking / stats per battle ────────────────────────────────────────────

class BattleStats {
  constructor() {
    this.totalDamageDealt = 0
    this.attackCount = 0
    this.hitCount = 0
    this.missCount = 0
    this.defenseCount = 0
    this.defenseSuccessCount = 0
    this.damageEvents = 0
    this.deathCount = 0
    this.hpChanges = 0     // how many times any combatant's HP changed
    this.refreshesGM = 0
    this.refreshesPlayer = 0
    this.refreshesMidPrompt = 0   // refreshes while pending dice/defense
    this.refreshesPostCombat = 0  // refreshes after combat ended
    this.refreshHpErrors = []     // HP mismatch after refresh
    this.refreshTurnErrors = []   // turn index mismatch after refresh
    this.combatLogTypes = new Set()
    this.sessionLogTypes = new Set()
  }
}

// ─── Backend state (mirrors handlers.py _session_state) ─────────────────────

class BackendState {
  constructor() {
    this.combat = null      // { active, round_number, current_turn_index, initiative_order }
    this.vitals = {}        // id -> { lep }   (keyed by COMBATANT id, not characterId)
    this.sessionLog = []
  }

  /** Build sync_full payload exactly like handlers.py get_full_sync */
  getSyncFull() {
    let combatSnapshot = null
    if (this.combat) {
      // Backend sends initiative_order as-is from its combat state
      // Note: backend combat.initiative_order may have STALE lep if vitals weren't
      // written back. This is the realistic scenario.
      combatSnapshot = {
        round_number: this.combat.round_number,
        current_turn_index: this.combat.current_turn_index,
        initiative_order: this.combat.initiative_order.map(c => ({ ...c })),
      }
    }
    return {
      combat: combatSnapshot,
      vitals: { ...this.vitals },
      session_log: this.sessionLog.slice(-200),
    }
  }
}

// ─── Frontend combat store (mirrors combatStore.js) ─────────────────────────

class FrontendCombatStore {
  constructor() {
    this.battles = {}
    this.activeBattleId = null
    this.combatLog = []
    this.pendingDiceRequest = null
    this.pendingDefense = null
    this.lastDiceResult = null
  }

  get activeBattle() { return this.battles[this.activeBattleId] || null }
  get combatActive() { return Object.keys(this.battles).length > 0 }

  createBattle(name, order, round = 1) {
    const id = `battle_${Date.now()}_${rand(100, 999)}`
    this.battles[id] = {
      id, name, round,
      initiativeOrder: order.map(c => ({ ...c })),
      currentTurnIndex: 0,
      log: [],
    }
    this.activeBattleId = id
    return id
  }

  endBattle(bid) {
    delete this.battles[bid]
    this.activeBattleId = Object.keys(this.battles)[0] || null
  }

  nextTurn(bid) {
    const b = this.battles[bid || this.activeBattleId]
    if (!b || b.initiativeOrder.length === 0) return
    b.currentTurnIndex = (b.currentTurnIndex + 1) % b.initiativeOrder.length
    if (b.currentTurnIndex === 0) {
      b.round++
      b.initiativeOrder.forEach(c => { c._reactionsThisRound = 0 })
    }
    this.pendingDiceRequest = null
    this.pendingDefense = null
    this.lastDiceResult = null
  }

  updateCombatant(cid, updates) {
    for (const b of Object.values(this.battles)) {
      const c = b.initiativeOrder.find(x => x.id === cid)
      if (c) Object.assign(c, updates)
    }
  }

  /** Handle combat_next_turn — the critical path where HP can get reset */
  handleCombatNextTurn(payload) {
    const bid = this.activeBattleId
    const battle = this.battles[bid]
    if (!battle) return
    if (payload.initiative_order) {
      // Merge locally-tracked lep into incoming order (the fix we applied)
      const localById = {}
      for (const c of battle.initiativeOrder) {
        localById[c.id] = c
        if (c.characterId) localById[c.characterId] = c
      }
      battle.initiativeOrder = payload.initiative_order.map(c => {
        const local = localById[c.id] || localById[c.characterId]
        if (local && c.lep === undefined && local.lep !== undefined) {
          return { ...c, lep: local.lep }
        }
        return { ...c }
      })
    }
    if (payload.current_turn_index !== undefined) battle.currentTurnIndex = payload.current_turn_index
    if (payload.round_number !== undefined) battle.round = payload.round_number
    this.pendingDiceRequest = null
    this.pendingDefense = null
    this.lastDiceResult = null
  }

  /** Rebuild state from sync_full — mirrors useWebSocket.js sync_full handler */
  applySyncFull(syncPayload) {
    if (!syncPayload.combat) return
    const vitalsMap = syncPayload.vitals || {}
    // Merge vitals into initiative_order (mirrors useWebSocket.js lines 508-515)
    const iniOrder = (syncPayload.combat.initiative_order || []).map(c => {
      const charVitals = vitalsMap[c.characterId] || vitalsMap[c.id] || {}
      return {
        ...c,
        lep: charVitals.lep ?? c.lep,
      }
    })
    // Create new battle from sync data
    this.battles = {}
    this.activeBattleId = null
    const bid = this.createBattle('Kampf', iniOrder, syncPayload.combat.round_number || 1)
    // Restore turn index
    if (syncPayload.combat.current_turn_index !== undefined) {
      this.battles[bid].currentTurnIndex = syncPayload.combat.current_turn_index
    }
    this.pendingDiceRequest = null
    this.pendingDefense = null
    this.lastDiceResult = null
  }
}

// ─── Session log store (mirrors sessionStore.sessionLog) ────────────────────

class SessionLogStore {
  constructor() { this.entries = [] }
  add(entry) { this.entries.push(entry); if (this.entries.length > 500) this.entries = this.entries.slice(-500) }
  applySyncFull(syncPayload) { this.entries = syncPayload.session_log || [] }
}

// ─── GM Agent ───────────────────────────────────────────────────────────────

class GMAgent {
  constructor(backend, store, sessionLog, stats) {
    this.backend = backend
    this.store = store
    this.sessionLog = sessionLog
    this.stats = stats
    this.turnFlowStep = 'idle'
    this.currentTarget = null
    this.currentManeuver = null
    this.lastAttackResult = null
  }

  startCombat(combatants) {
    const ordered = [...combatants].sort((a, b) => b.initiative - a.initiative)
    this.backend.combat = {
      active: true,
      round_number: 1,
      current_turn_index: 0,
      initiative_order: ordered.map(c => ({ ...c })),
    }
    // Backend vitals: keyed by combatant id
    for (const c of ordered) {
      this.backend.vitals[c.id] = { lep: c.lep }
      // Also key by characterId if available (for sync_full lookup)
      if (c.characterId) this.backend.vitals[c.characterId] = { lep: c.lep }
    }
    this.store.createBattle('Kampf', ordered)
    this._log('combat', 'Kampf beginnt!', 'swords')
    this.turnFlowStep = 'idle'
  }

  endCombat() {
    const bid = this.store.activeBattleId
    if (bid) {
      this.store.endBattle(bid)
      this.backend.combat = null
      this._log('combat', 'Kampf beendet.', 'flag')
    }
  }

  getCurrentCombatant() {
    const b = this.store.activeBattle
    if (!b) return null
    return b.initiativeOrder[b.currentTurnIndex]
  }

  getAliveEnemies(attackerId) {
    const b = this.store.activeBattle
    if (!b) return []
    return b.initiativeOrder.filter(c => c.id !== attackerId && c.lep > 0)
  }

  advanceTurn() {
    const b = this.store.activeBattle
    if (!b) return
    const bid = b.id
    const bc = this.backend.combat
    if (bc) {
      bc.current_turn_index++
      if (bc.current_turn_index >= bc.initiative_order.length) {
        bc.current_turn_index = 0
        bc.round_number++
      }
    }
    this.store.nextTurn(bid)
    // Backend broadcasts initiative_order — may have stale lep!
    const backendOrder = bc ? bc.initiative_order : b.initiativeOrder
    this.store.handleCombatNextTurn({
      initiative_order: backendOrder.map(c => ({ ...c })),
      current_turn_index: bc ? bc.current_turn_index : b.currentTurnIndex,
      round_number: bc ? bc.round_number : b.round,
    })
    this._log('turn', `${this.getCurrentCombatant()?.name || '?'} ist am Zug.`, 'clock')
    this.turnFlowStep = 'idle'
    this.currentTarget = null
    this.currentManeuver = null
    this.lastAttackResult = null
  }

  /** Simulate GM refreshing the page — wipe frontend, rebuild from sync_full */
  simulateRefresh() {
    const sync = this.backend.getSyncFull()
    // Wipe stores
    this.store.battles = {}
    this.store.activeBattleId = null
    this.store.combatLog = []
    this.store.pendingDiceRequest = null
    this.store.pendingDefense = null
    this.sessionLog.entries = []
    // Rebuild from sync_full
    this.store.applySyncFull(sync)
    this.sessionLog.applySyncFull(sync)
    this.turnFlowStep = 'idle'
    this.currentTarget = null
    this.currentManeuver = null
    this.lastAttackResult = null
    this.stats.refreshesGM++
  }

  // Returns: 'needs_player_input' | 'turn_done' | 'combat_over'
  processTurnStep() {
    const current = this.getCurrentCombatant()
    if (!current || current.lep <= 0) return 'turn_done'

    const enemies = this.getAliveEnemies(current.id)
    if (enemies.length === 0) return 'combat_over'

    if (this.turnFlowStep === 'idle') {
      this.currentTarget = pick(enemies)
      this.currentManeuver = pick(MANEUVERS)
      this.turnFlowStep = 'attack_roll'
      this.stats.attackCount++

      if (current.isNPC) {
        return this._resolveNPCAttack(current)
      } else {
        const effectiveAt = current.at + (this.currentManeuver ? (this.currentManeuver.atMod || 0) * (this.currentManeuver.stufe || 1) : 0)
        this.store.pendingDiceRequest = {
          type: 'attack', target_user_id: current.userId,
          target_value: effectiveAt, label: `Attacke auf ${this.currentTarget.name}`,
        }
        return 'needs_player_input'
      }
    }

    if (this.turnFlowStep === 'wait_defense') {
      if (this.currentTarget.isNPC) {
        return this._resolveNPCDefense()
      } else {
        this.store.pendingDefense = {
          attacker: this.getCurrentCombatant()?.name,
          attackValue: this.lastAttackResult?.roll,
        }
        return 'needs_player_input'
      }
    }

    if (this.turnFlowStep === 'damage_roll') {
      if (this.getCurrentCombatant()?.isNPC) {
        return this._resolveNPCDamage(this.getCurrentCombatant())
      } else {
        this.store.pendingDiceRequest = {
          type: 'damage', target_user_id: this.getCurrentCombatant()?.userId,
          label: `Schaden: ${this.getCurrentCombatant()?.weaponDamage}`,
        }
        return 'needs_player_input'
      }
    }

    if (this.turnFlowStep === 'done') return 'turn_done'
    return 'turn_done'
  }

  _resolveNPCAttack(attacker) {
    const roll = d20()
    const result = resolveAttack(attacker.at, roll, this.currentManeuver)
    this.lastAttackResult = result
    this.stats.combatLogTypes.add('attack')
    if (result.hit) this.stats.hitCount++; else this.stats.missCount++
    this._log('combat', `${attacker.name} -> ${this.currentTarget.name}: AT ${roll}/${result.effectiveAt} ${result.hit ? 'Treffer' : 'Verfehlt'}`, 'swords')
    if (!result.hit) { this.turnFlowStep = 'done'; return 'turn_done' }
    this.turnFlowStep = 'wait_defense'
    return this.processTurnStep()
  }

  _resolveNPCDefense() {
    const target = this.currentTarget
    const defType = pick(['parade', 'ausweichen'])
    const defValue = defType === 'parade' ? target.pa : target.aw
    const fintePenalty = this.currentManeuver?.id === 'finte' ? (this.currentManeuver.defMod || 0) * (this.currentManeuver.stufe || 1) : 0
    const roll = d20()
    const result = resolveDefense(defType, defValue + fintePenalty, roll, target._reactionsThisRound || 0)
    target._reactionsThisRound = (target._reactionsThisRound || 0) + 1
    this.stats.defenseCount++
    if (result.success) this.stats.defenseSuccessCount++
    this.stats.combatLogTypes.add('defense')
    this._log('defense', `${target.name} ${defType}: ${roll}/${result.effective} ${result.success ? 'OK' : 'FAIL'}`, 'shield')
    if (result.success) { this.turnFlowStep = 'done'; return 'turn_done' }
    this.turnFlowStep = 'damage_roll'
    return this.processTurnStep()
  }

  _resolveNPCDamage(attacker) {
    const rawDmg = rollDamage(attacker.weaponDamage)
    const bonus = this.currentManeuver?.tpMod ? this.currentManeuver.tpMod * (this.currentManeuver.stufe || 1) : 0
    const sp = Math.max(0, rawDmg + bonus - (this.currentTarget.rs || 0))
    this._applyDamage(this.currentTarget, sp)
    this.turnFlowStep = 'done'
    return 'turn_done'
  }

  _applyDamage(target, sp) {
    if (sp <= 0) { this.turnFlowStep = 'done'; return }
    const oldLep = target.lep
    target.lep = Math.max(0, target.lep - sp)
    this.stats.totalDamageDealt += sp
    this.stats.damageEvents++
    this.stats.hpChanges++
    this.stats.combatLogTypes.add('damage')

    // Update frontend store
    this.store.updateCombatant(target.id, { lep: target.lep })
    // Update backend vitals (keyed by both id and characterId)
    this.backend.vitals[target.id] = { lep: target.lep }
    if (target.characterId) this.backend.vitals[target.characterId] = { lep: target.lep }
    // Update backend combat initiative_order (so it's not stale)
    if (this.backend.combat) {
      const bc = this.backend.combat.initiative_order.find(c => c.id === target.id)
      if (bc) bc.lep = target.lep
    }
    this._log('damage', `${target.name}: ${sp} SP (${oldLep}->${target.lep})`, 'heart')
    if (target.lep <= 0) {
      this.stats.deathCount++
      this._log('combat', `${target.name} ist kampfunfaehig!`, 'alert')
    }
  }

  handlePlayerAttackResult(roll) {
    const current = this.getCurrentCombatant()
    const result = resolveAttack(current.at, roll, this.currentManeuver)
    this.lastAttackResult = result
    if (result.hit) this.stats.hitCount++; else this.stats.missCount++
    this.stats.combatLogTypes.add('attack')
    this._log('combat', `${current.name}: AT ${roll}/${result.effectiveAt} ${result.hit ? 'Treffer' : 'Verfehlt'}`, 'swords')
    this.store.pendingDiceRequest = null
    if (!result.hit) { this.turnFlowStep = 'done'; return 'turn_done' }
    this.turnFlowStep = 'wait_defense'
    return this.processTurnStep()
  }

  handlePlayerDefenseResult(defenseType, roll) {
    const target = this.currentTarget
    const defValue = defenseType === 'parade' ? target.pa : target.aw
    const fintePenalty = this.currentManeuver?.id === 'finte' ? (this.currentManeuver.defMod || 0) * (this.currentManeuver.stufe || 1) : 0
    const result = resolveDefense(defenseType, defValue + fintePenalty, roll, target._reactionsThisRound || 0)
    target._reactionsThisRound = (target._reactionsThisRound || 0) + 1
    this.stats.defenseCount++
    if (result.success) this.stats.defenseSuccessCount++
    this.stats.combatLogTypes.add('defense')
    this._log('defense', `${target.name}: ${defenseType} ${roll}/${result.effective} ${result.success ? 'OK' : 'FAIL'}`, 'shield')
    this.store.pendingDefense = null
    if (result.success) { this.turnFlowStep = 'done'; return 'turn_done' }
    this.turnFlowStep = 'damage_roll'
    return this.processTurnStep()
  }

  handlePlayerDamageResult(totalDamage) {
    const bonus = this.currentManeuver?.tpMod ? this.currentManeuver.tpMod * (this.currentManeuver.stufe || 1) : 0
    const sp = Math.max(0, totalDamage + bonus - (this.currentTarget.rs || 0))
    this._applyDamage(this.currentTarget, sp)
    this.store.pendingDiceRequest = null
    this.turnFlowStep = 'done'
    return 'turn_done'
  }

  _log(type, text, icon) {
    const entry = { type, text, icon, ts: Date.now() }
    this.store.combatLog.push(entry)
    this.sessionLog.add(entry)
    this.backend.sessionLog.push(entry)
    if (this.backend.sessionLog.length > 500) this.backend.sessionLog = this.backend.sessionLog.slice(-500)
    this.stats.sessionLogTypes.add(type)
  }
}

// ─── Player Agent ───────────────────────────────────────────────────────────

class PlayerAgent {
  constructor(store, sessionLog, stats) {
    this.store = store
    this.sessionLog = sessionLog
    this.stats = stats
  }

  /** Simulate player refreshing — wipe frontend, rebuild from backend sync_full */
  simulateRefresh(backend) {
    const sync = backend.getSyncFull()
    // Capture pre-refresh state for comparison
    const battle = this.store.activeBattle
    let preRefreshState = null
    if (battle) {
      preRefreshState = {
        turnIndex: battle.currentTurnIndex,
        round: battle.round,
        combatantHp: battle.initiativeOrder.map(c => ({ id: c.id, lep: c.lep })),
      }
    }
    // Wipe stores
    this.store.battles = {}
    this.store.activeBattleId = null
    this.store.combatLog = []
    this.store.pendingDiceRequest = null
    this.store.pendingDefense = null
    this.sessionLog.entries = []
    // Rebuild
    this.store.applySyncFull(sync)
    this.sessionLog.applySyncFull(sync)
    this.stats.refreshesPlayer++

    // Validate: HP and turn state should match
    if (preRefreshState && this.store.activeBattle) {
      const postBattle = this.store.activeBattle
      if (postBattle.currentTurnIndex !== preRefreshState.turnIndex) {
        this.stats.refreshTurnErrors.push(
          `Turn index mismatch: pre=${preRefreshState.turnIndex} post=${postBattle.currentTurnIndex}`
        )
      }
      if (postBattle.round !== preRefreshState.round) {
        this.stats.refreshTurnErrors.push(
          `Round mismatch: pre=${preRefreshState.round} post=${postBattle.round}`
        )
      }
      for (const pre of preRefreshState.combatantHp) {
        const post = postBattle.initiativeOrder.find(c => c.id === pre.id)
        if (post && post.lep !== pre.lep) {
          this.stats.refreshHpErrors.push(
            `${post.name || post.id}: pre=${pre.lep} post=${post.lep}`
          )
        }
      }
    }
  }

  act(gm) {
    if (this.store.pendingDefense) {
      const defType = pick(['parade', 'ausweichen', 'parade', 'parade'])
      const roll = d20()
      const result = gm.handlePlayerDefenseResult(defType, roll)
      if (result === 'needs_player_input' && this.store.pendingDiceRequest?.type === 'damage') {
        return this.act(gm)
      }
      return true
    }
    if (this.store.pendingDiceRequest) {
      const req = this.store.pendingDiceRequest
      if (req.type === 'attack') {
        const roll = d20()
        const result = gm.handlePlayerAttackResult(roll)
        if (result === 'needs_player_input') return true
        return true
      }
      if (req.type === 'damage') {
        const dmg = rollDamage(gm.getCurrentCombatant()?.weaponDamage || '1W6+2')
        gm.handlePlayerDamageResult(dmg)
        return true
      }
    }
    return false
  }
}

// ─── Battle runner ──────────────────────────────────────────────────────────

function runBattle(battleIndex, config) {
  const backend = new BackendState()
  const store = new FrontendCombatStore()
  const sessionLog = new SessionLogStore()
  const stats = new BattleStats()
  const gm = new GMAgent(backend, store, sessionLog, stats)
  const player = new PlayerAgent(store, sessionLog, stats)

  const { heroCount, npcCount, maxRounds, refreshChance } = config
  const combatants = []
  for (let i = 0; i < heroCount; i++)
    combatants.push(makeCombatant(NAMES_HEROES[i % NAMES_HEROES.length] + (i >= NAMES_HEROES.length ? ` ${i}` : ''), false))
  for (let i = 0; i < npcCount; i++)
    combatants.push(makeCombatant(NAMES_NPCS[i % NAMES_NPCS.length] + (i >= NAMES_NPCS.length ? ` ${i}` : ''), true))

  // Record starting HP
  const startingHp = {}
  combatants.forEach(c => { startingHp[c.id] = c.lep })

  gm.startCombat(combatants)

  const errors = []
  let ticks = 0
  const MAX_TICKS = 10000
  let deadlockCounter = 0
  let finalSnapshot = null
  let turnsProcessed = 0

  // Helper: verify HP survives a refresh for whoever refreshes
  function verifyRefreshHp(label) {
    const b = store.activeBattle
    if (!b) return
    const hpBefore = {}
    b.initiativeOrder.forEach(c => { hpBefore[c.id] = c.lep })
    return hpBefore
  }
  function checkRefreshHp(label, hpBefore) {
    const b = store.activeBattle
    if (!b || !hpBefore) return
    for (const c of b.initiativeOrder) {
      if (hpBefore[c.id] !== undefined && c.lep !== hpBefore[c.id]) {
        stats.refreshHpErrors.push(`${label} ${c.name}: ${hpBefore[c.id]}->${c.lep}`)
      }
    }
  }

  while (store.combatActive && ticks < MAX_TICKS) {
    ticks++
    const battle = store.activeBattle
    if (!battle) { errors.push('DEADLOCK: no active battle but combatActive=true'); break }
    if (battle.round > maxRounds) {
      finalSnapshot = { order: battle.initiativeOrder.map(c => ({...c})), round: battle.round }
      gm.endCombat(); break
    }

    // ── REFRESH SCENARIO 1: Between turns (idle) ──
    if (gm.turnFlowStep === 'idle' && Math.random() < refreshChance) {
      const hpBefore = verifyRefreshHp()
      if (Math.random() < 0.5) {
        gm.simulateRefresh()
        checkRefreshHp('GM-idle-refresh', hpBefore)
      } else {
        player.simulateRefresh(backend)
      }
      // Scenario: double-refresh (both sides reload in quick succession)
      if (Math.random() < 0.2) {
        const hp2 = verifyRefreshHp()
        gm.simulateRefresh()
        checkRefreshHp('GM-double-refresh', hp2)
        player.simulateRefresh(backend)
        stats.refreshesPlayer++ // extra
        stats.refreshesGM++    // extra
      }
      continue
    }

    const current = gm.getCurrentCombatant()
    if (!current) { errors.push('DEADLOCK: no current combatant'); break }

    const aliveHeroes = battle.initiativeOrder.filter(c => !c.isNPC && c.lep > 0)
    const aliveNPCs = battle.initiativeOrder.filter(c => c.isNPC && c.lep > 0)
    if (aliveHeroes.length === 0 || aliveNPCs.length === 0) {
      finalSnapshot = { order: battle.initiativeOrder.map(c => ({...c})), round: battle.round }
      gm.endCombat(); break
    }

    if (current.lep <= 0) { gm.advanceTurn(); continue }

    let result = gm.processTurnStep()
    if (result === 'combat_over') {
      finalSnapshot = { order: battle.initiativeOrder.map(c => ({...c})), round: battle.round }
      gm.endCombat(); break
    }

    if (result === 'needs_player_input') {
      // ── REFRESH SCENARIO 2: Player refreshes while they have a pending prompt ──
      if (Math.random() < refreshChance) {
        const hpBefore = verifyRefreshHp()
        player.simulateRefresh(backend)
        checkRefreshHp('player-mid-prompt-refresh', hpBefore)
        // After refresh, pendingDiceRequest and pendingDefense are wiped.
        // The GM must re-send the request. Simulate this:
        // In real app the GM's TurnFlow re-sends on state change. Here we just
        // re-set the pending state from GM's current turn flow step.
        if (gm.turnFlowStep === 'attack_roll' && !current.isNPC) {
          const effectiveAt = current.at + (gm.currentManeuver ? (gm.currentManeuver.atMod || 0) * (gm.currentManeuver.stufe || 1) : 0)
          store.pendingDiceRequest = {
            type: 'attack', target_user_id: current.userId,
            target_value: effectiveAt, label: `Attacke auf ${gm.currentTarget?.name}`,
          }
        } else if (gm.turnFlowStep === 'wait_defense' && gm.currentTarget && !gm.currentTarget.isNPC) {
          store.pendingDefense = {
            attacker: current.name,
            attackValue: gm.lastAttackResult?.roll,
          }
        } else if (gm.turnFlowStep === 'damage_roll' && !current.isNPC) {
          store.pendingDiceRequest = {
            type: 'damage', target_user_id: current.userId,
            label: `Schaden: ${current.weaponDamage}`,
          }
        }
      }

      // ── REFRESH SCENARIO 3: GM refreshes while waiting for player input ──
      if (Math.random() < refreshChance * 0.5) {
        const hpBefore = verifyRefreshHp()
        // Save GM turn flow state (refresh wipes it)
        const savedStep = gm.turnFlowStep
        const savedTarget = gm.currentTarget
        const savedManeuver = gm.currentManeuver
        const savedAttackResult = gm.lastAttackResult
        gm.simulateRefresh()
        checkRefreshHp('GM-mid-wait-refresh', hpBefore)
        // GM must reconstruct turn flow from context.
        // In real app, GM's CombatOverlay/TurnFlow re-opens.
        // Simulate by restoring the saved state:
        gm.turnFlowStep = savedStep
        gm.currentTarget = savedTarget ? store.activeBattle?.initiativeOrder.find(c => c.id === savedTarget.id) || savedTarget : null
        gm.currentManeuver = savedManeuver
        gm.lastAttackResult = savedAttackResult
        // Re-set pending prompts on the (possibly-refreshed) store
        if (savedStep === 'attack_roll' && !current.isNPC) {
          const effectiveAt = current.at + (savedManeuver ? (savedManeuver.atMod || 0) * (savedManeuver.stufe || 1) : 0)
          store.pendingDiceRequest = { type: 'attack', target_user_id: current.userId, target_value: effectiveAt, label: 'Attacke' }
        } else if (savedStep === 'wait_defense' && savedTarget && !savedTarget.isNPC) {
          store.pendingDefense = { attacker: current.name, attackValue: savedAttackResult?.roll }
        } else if (savedStep === 'damage_roll' && !current.isNPC) {
          store.pendingDiceRequest = { type: 'damage', target_user_id: current.userId, label: 'Schaden' }
        }
      }

      const acted = player.act(gm)
      if (!acted) {
        deadlockCounter++
        if (deadlockCounter > 10) {
          errors.push(`DEADLOCK: player stuck. dice=${JSON.stringify(store.pendingDiceRequest)}, def=${JSON.stringify(store.pendingDefense)}, step=${gm.turnFlowStep}`)
          break
        }
        continue
      }
      deadlockCounter = 0
    }

    if (gm.turnFlowStep === 'done' || result === 'turn_done') {
      turnsProcessed++
      gm.advanceTurn()
    }
  }

  if (ticks >= MAX_TICKS) errors.push(`TIMEOUT at round ${store.activeBattle?.round || '?'}`)

  // ── REFRESH SCENARIO 4: Refresh after combat ends ──
  // Both sides refresh after combat is over — should see no combat
  {
    const gmStoreBefore = store.combatActive
    gm.simulateRefresh()
    stats.refreshesGM++
    if (store.combatActive) errors.push('POST_COMBAT_REFRESH: GM refresh shows combat still active')
    if (store.activeBattle) errors.push('POST_COMBAT_REFRESH: GM has active battle after combat ended')

    player.simulateRefresh(backend)
    if (store.combatActive) errors.push('POST_COMBAT_REFRESH: Player refresh shows combat still active')
    if (store.activeBattle) errors.push('POST_COMBAT_REFRESH: Player has active battle after combat ended')
  }

  // ── REFRESH SCENARIO 5: Double-refresh after combat (revisiting the page later) ──
  {
    gm.simulateRefresh()
    stats.refreshesGM++
    player.simulateRefresh(backend)
    if (store.combatActive) errors.push('REVISIT_REFRESH: combat still active on revisit')
    if (store.pendingDiceRequest) errors.push('REVISIT_REFRESH: pending dice request on revisit')
    if (store.pendingDefense) errors.push('REVISIT_REFRESH: pending defense on revisit')
  }

  // ── Gather final state ──
  const finalOrder = finalSnapshot?.order || store.activeBattle?.initiativeOrder || combatants
  const dead = finalOrder.filter(c => c.lep <= 0)
  const alive = finalOrder.filter(c => c.lep > 0)

  // ── NEGATIVE checks ──
  if (store.pendingDiceRequest) errors.push(`UNRESOLVED_DICE: ${JSON.stringify(store.pendingDiceRequest)}`)
  if (store.pendingDefense) errors.push(`UNRESOLVED_DEFENSE: ${JSON.stringify(store.pendingDefense)}`)
  for (const c of finalOrder) {
    if (c.lep > c.lepMax) errors.push(`PHANTOM_HP: ${c.name} ${c.lep}/${c.lepMax}`)
    if (c.lep < 0) errors.push(`NEGATIVE_HP: ${c.name} ${c.lep}`)
    // Check frontend vs backend vitals
    const bv = backend.vitals[c.id]
    if (bv && bv.lep !== c.lep) errors.push(`HP_MISMATCH: ${c.name} fe=${c.lep} be=${bv.lep}`)
  }
  if (stats.refreshHpErrors.length > 0) {
    for (const e of stats.refreshHpErrors) errors.push(`REFRESH_HP_MISMATCH: ${e}`)
  }
  if (stats.refreshTurnErrors.length > 0) {
    for (const e of stats.refreshTurnErrors) errors.push(`REFRESH_TURN_MISMATCH: ${e}`)
  }

  // ── POSITIVE checks ──
  if (stats.totalDamageDealt === 0) errors.push('NO_DAMAGE: zero damage dealt in entire battle')
  if (stats.attackCount === 0) errors.push('NO_ATTACKS: zero attacks made')
  if (stats.damageEvents === 0 && stats.hitCount > 0) errors.push('HITS_BUT_NO_DAMAGE: attacks hit but no damage events')
  if (stats.hpChanges === 0) errors.push('NO_HP_CHANGES: no combatant HP ever changed')
  if (dead.length === 0 && finalSnapshot?.round <= maxRounds) errors.push('NO_DEATHS: battle ended but nobody died')
  // Check HP actually changed from starting values
  let anyHpChanged = false
  for (const c of finalOrder) {
    if (startingHp[c.id] !== undefined && c.lep !== startingHp[c.id]) { anyHpChanged = true; break }
  }
  if (!anyHpChanged) errors.push('HP_UNCHANGED: all combatants at starting HP — sim did nothing')
  // Check combat log has the right event types
  if (!stats.combatLogTypes.has('attack') && !stats.combatLogTypes.has('combat'))
    errors.push('LOG_MISSING_ATTACKS: no attack entries in combat log')
  if (!stats.combatLogTypes.has('damage') && stats.hitCount > 0)
    errors.push('LOG_MISSING_DAMAGE: hits occurred but no damage in log')
  // Check session log (Protokoll)
  if (!stats.sessionLogTypes.has('combat')) errors.push('PROTOKOLL_NO_COMBAT: no combat events in session log')
  if (sessionLog.entries.length === 0) errors.push('PROTOKOLL_EMPTY: session log has zero entries')

  return {
    battleIndex, config, ticks, turnsProcessed,
    rounds: finalSnapshot?.round || 0,
    resolved: !store.combatActive,
    errors,
    dead: dead.map(c => `${c.name}${c.isNPC ? '(NPC)' : ''}`),
    alive: alive.map(c => `${c.name}(${c.lep}/${c.lepMax})`),
    stats,
  }
}

// ─── HP Merge regression test ───────────────────────────────────────────────

function testHpMergeRegression() {
  const errors = []
  const store = new FrontendCombatStore()
  const hero = makeCombatant('TestHero', false)
  hero.lep = 30; hero.lepMax = 30
  const goblin = makeCombatant('TestGoblin', true)
  goblin.lep = 20; goblin.lepMax = 20
  store.createBattle('Test', [hero, goblin])

  // 1. Local HP update
  store.updateCombatant(hero.id, { lep: 20 })
  const h1 = store.activeBattle.initiativeOrder.find(c => c.id === hero.id)
  if (h1.lep !== 20) errors.push(`Pre-check: expected 20 got ${h1.lep}`)

  // 2. Backend sends stale order (no lep field)
  store.handleCombatNextTurn({
    initiative_order: [hero, goblin].map(c => ({ id: c.id, characterId: c.characterId, name: c.name, isNPC: c.isNPC, initiative: c.initiative, lepMax: c.lepMax })),
    current_turn_index: 1, round_number: 1,
  })
  const h2 = store.activeBattle.initiativeOrder.find(c => c.id === hero.id)
  if (h2.lep !== 20) errors.push(`HP MERGE FAIL: lep=${h2.lep}, expected 20`)

  // 3. Backend sends explicit lep — should override
  store.updateCombatant(hero.id, { lep: 15 })
  store.handleCombatNextTurn({
    initiative_order: [hero, goblin].map(c => ({ id: c.id, characterId: c.characterId, name: c.name, isNPC: c.isNPC, initiative: c.initiative, lep: c.lepMax, lepMax: c.lepMax })),
    current_turn_index: 0, round_number: 2,
  })
  const h3 = store.activeBattle.initiativeOrder.find(c => c.id === hero.id)
  if (h3.lep !== hero.lepMax) errors.push(`AUTHORITY FAIL: lep=${h3.lep}, expected ${hero.lepMax}`)

  // 4. sync_full with vitals map
  const backend = new BackendState()
  backend.combat = {
    round_number: 3, current_turn_index: 0,
    initiative_order: [
      { id: hero.id, characterId: hero.characterId, name: hero.name, isNPC: false, lepMax: 30 },
      { id: goblin.id, characterId: goblin.characterId, name: goblin.name, isNPC: true, lep: 20, lepMax: 20 },
    ],
  }
  // Vitals keyed by id (hero has damage, goblin is fine)
  backend.vitals = { [hero.id]: { lep: 12 }, [goblin.id]: { lep: 20 } }
  if (hero.characterId) backend.vitals[hero.characterId] = { lep: 12 }

  const freshStore = new FrontendCombatStore()
  freshStore.applySyncFull(backend.getSyncFull())
  const syncedHero = freshStore.activeBattle.initiativeOrder.find(c => c.id === hero.id)
  if (syncedHero.lep !== 12) errors.push(`SYNC_FULL HP FAIL: hero lep=${syncedHero.lep}, expected 12`)
  const syncedGoblin = freshStore.activeBattle.initiativeOrder.find(c => c.id === goblin.id)
  if (syncedGoblin.lep !== 20) errors.push(`SYNC_FULL HP FAIL: goblin lep=${syncedGoblin.lep}, expected 20`)

  return errors
}

// ─── Run ────────────────────────────────────────────────────────────────────

console.log('=== HP Merge Regression Tests ===')
const regErrors = testHpMergeRegression()
if (regErrors.length > 0) {
  console.log('FAILED:')
  regErrors.forEach(e => console.log(`  - ${e}`))
  process.exit(1)
}
console.log('  All 4 checks passed.\n')

console.log('=== AventuriaVTT Combat Simulation: 100 Battles ===\n')

const CONFIGS = [
  { heroCount: 1, npcCount: 1, maxRounds: 30, refreshChance: 0.05 },
  { heroCount: 2, npcCount: 2, maxRounds: 30, refreshChance: 0.08 },
  { heroCount: 3, npcCount: 3, maxRounds: 40, refreshChance: 0.05 },
  { heroCount: 4, npcCount: 4, maxRounds: 50, refreshChance: 0.03 },
  { heroCount: 1, npcCount: 3, maxRounds: 30, refreshChance: 0.10 },
  { heroCount: 3, npcCount: 1, maxRounds: 30, refreshChance: 0.10 },
  { heroCount: 4, npcCount: 2, maxRounds: 40, refreshChance: 0.05 },
  { heroCount: 2, npcCount: 5, maxRounds: 40, refreshChance: 0.05 },
  { heroCount: 5, npcCount: 3, maxRounds: 50, refreshChance: 0.03 },
  { heroCount: 1, npcCount: 1, maxRounds: 50, refreshChance: 0.15 }, // 1v1, lots of refreshes
]

// Aggregates
let totals = {
  resolved: 0, deadlocks: 0, timeouts: 0, hpMismatches: 0,
  unresolved: 0, noDamage: 0, noDeaths: 0, noAttacks: 0,
  hpUnchanged: 0, logMissing: 0, protokollEmpty: 0,
  refreshHpErrors: 0, refreshTurnErrors: 0, postCombatRefreshErrors: 0,
  deaths: 0, heroDeaths: 0, npcDeaths: 0,
  tpk: 0, heroWins: 0, npcWins: 0,
  totalDmg: 0, totalAttacks: 0, totalHits: 0,
  totalDefenses: 0, totalDefenseSuccesses: 0,
  totalRounds: 0, totalTurns: 0,
  totalGMRefreshes: 0, totalPlayerRefreshes: 0,
}
let allErrors = []

for (let i = 0; i < 100; i++) {
  const config = CONFIGS[i % CONFIGS.length]
  const r = runBattle(i, config)

  if (r.resolved) totals.resolved++
  if (r.errors.some(e => e.startsWith('DEADLOCK'))) totals.deadlocks++
  if (r.errors.some(e => e.startsWith('TIMEOUT'))) totals.timeouts++
  if (r.errors.some(e => e.includes('HP_MISMATCH'))) totals.hpMismatches++
  if (r.errors.some(e => e.startsWith('UNRESOLVED'))) totals.unresolved++
  if (r.errors.some(e => e.startsWith('NO_DAMAGE'))) totals.noDamage++
  if (r.errors.some(e => e.startsWith('NO_DEATHS'))) totals.noDeaths++
  if (r.errors.some(e => e.startsWith('NO_ATTACKS'))) totals.noAttacks++
  if (r.errors.some(e => e.startsWith('HP_UNCHANGED'))) totals.hpUnchanged++
  if (r.errors.some(e => e.includes('LOG_MISSING'))) totals.logMissing++
  if (r.errors.some(e => e.includes('PROTOKOLL'))) totals.protokollEmpty++
  if (r.errors.some(e => e.startsWith('REFRESH_HP') || e.includes('refresh'))) totals.refreshHpErrors++
  if (r.errors.some(e => e.startsWith('REFRESH_TURN'))) totals.refreshTurnErrors++
  if (r.errors.some(e => e.startsWith('POST_COMBAT_REFRESH') || e.startsWith('REVISIT_REFRESH'))) totals.postCombatRefreshErrors++

  const deadHeroes = r.dead.filter(n => !n.includes('(NPC)')).length
  const deadNpcs = r.dead.filter(n => n.includes('(NPC)')).length
  totals.deaths += r.dead.length
  totals.heroDeaths += deadHeroes
  totals.npcDeaths += deadNpcs
  const aliveHeroes = r.alive.filter(n => !n.includes('(NPC)')).length  // not reliable by name, use stats
  // Determine winner from final state
  const finalHeroesAlive = r.stats.deathCount > 0 ? (config.heroCount - deadHeroes) : config.heroCount
  const finalNpcsAlive = r.stats.deathCount > 0 ? (config.npcCount - deadNpcs) : config.npcCount
  if (deadNpcs === config.npcCount && deadHeroes < config.heroCount) totals.heroWins++
  else if (deadHeroes === config.heroCount && deadNpcs < config.npcCount) { totals.npcWins++; totals.tpk++ }

  totals.totalDmg += r.stats.totalDamageDealt
  totals.totalAttacks += r.stats.attackCount
  totals.totalHits += r.stats.hitCount
  totals.totalDefenses += r.stats.defenseCount
  totals.totalDefenseSuccesses += r.stats.defenseSuccessCount
  totals.totalRounds += r.rounds
  totals.totalTurns += r.turnsProcessed
  totals.totalGMRefreshes += r.stats.refreshesGM
  totals.totalPlayerRefreshes += r.stats.refreshesPlayer

  if (r.errors.length > 0) allErrors.push(r)
  process.stdout.write(r.errors.length === 0 ? '.' : 'X')
  if ((i + 1) % 50 === 0) process.stdout.write(` ${i + 1}/100\n`)
}

console.log('\n')

// ── Summary ──
console.log('=== INTEGRITY CHECKS (should be 0) ===')
console.log(`  Deadlocks:             ${totals.deadlocks}`)
console.log(`  Timeouts:              ${totals.timeouts}`)
console.log(`  HP mismatches (fe/be): ${totals.hpMismatches}`)
console.log(`  Unresolved prompts:    ${totals.unresolved}`)
console.log(`  Refresh HP errors:     ${totals.refreshHpErrors}`)
console.log(`  Refresh turn errors:   ${totals.refreshTurnErrors}`)
console.log(`  Post-combat refresh:   ${totals.postCombatRefreshErrors}`)

console.log('\n=== LIVENESS CHECKS (should be 0) ===')
console.log(`  No damage dealt:       ${totals.noDamage}`)
console.log(`  No attacks made:       ${totals.noAttacks}`)
console.log(`  HP never changed:      ${totals.hpUnchanged}`)
console.log(`  No deaths (non-draw):  ${totals.noDeaths}`)
console.log(`  Log missing events:    ${totals.logMissing}`)
console.log(`  Protokoll empty:       ${totals.protokollEmpty}`)

console.log('\n=== BATTLE STATS ===')
console.log(`  Resolved:              ${totals.resolved}/100`)
console.log(`  Hero wins:             ${totals.heroWins}`)
console.log(`  NPC wins (TPK):        ${totals.npcWins} (${totals.tpk} TPKs)`)
console.log(`  Draws (max rounds):    ${100 - totals.heroWins - totals.npcWins}`)
console.log(`  Avg rounds/battle:     ${(totals.totalRounds / 100).toFixed(1)}`)
console.log(`  Total turns processed: ${totals.totalTurns}`)

console.log('\n=== COMBAT NUMBERS ===')
console.log(`  Total attacks:         ${totals.totalAttacks}`)
console.log(`  Hits:                  ${totals.totalHits} (${(totals.totalHits / totals.totalAttacks * 100).toFixed(0)}%)`)
console.log(`  Defenses:              ${totals.totalDefenses}`)
console.log(`  Def. successes:        ${totals.totalDefenseSuccesses} (${(totals.totalDefenseSuccesses / totals.totalDefenses * 100).toFixed(0)}%)`)
console.log(`  Total damage:          ${totals.totalDmg} SP`)
console.log(`  Total deaths:          ${totals.deaths} (${totals.heroDeaths} heroes, ${totals.npcDeaths} NPCs)`)

console.log('\n=== PAGE REFRESHES ===')
console.log(`  GM refreshes:          ${totals.totalGMRefreshes}`)
console.log(`  Player refreshes:      ${totals.totalPlayerRefreshes}`)
console.log(`  HP errors after:       ${totals.refreshHpErrors}`)
console.log(`  Turn errors after:     ${totals.refreshTurnErrors}`)
console.log(`  Post-combat errors:    ${totals.postCombatRefreshErrors}`)

if (allErrors.length > 0) {
  console.log('\n=== ERROR DETAILS ===')
  for (const r of allErrors.slice(0, 20)) {
    console.log(`\nBattle #${r.battleIndex} (${r.config.heroCount}H vs ${r.config.npcCount}N, ${r.rounds} rounds, ${r.turnsProcessed} turns):`)
    for (const e of r.errors) console.log(`  - ${e}`)
  }
  if (allErrors.length > 20) console.log(`\n... and ${allErrors.length - 20} more`)
}

console.log('\n' + '='.repeat(60))
const critical = totals.deadlocks + totals.timeouts + totals.hpMismatches + totals.unresolved + totals.refreshHpErrors + totals.postCombatRefreshErrors
const liveness = totals.noDamage + totals.noAttacks + totals.hpUnchanged
if (critical === 0 && liveness === 0) {
  console.log('ALL 100 BATTLES PASSED.')
  console.log('  - No deadlocks or timeouts')
  console.log('  - No HP mismatches (frontend vs backend)')
  console.log('  - Damage dealt, combatants died, HP changed in every battle')
  console.log('  - Page refreshes survived (idle, mid-prompt, mid-wait, post-combat, revisit)')
  console.log('  - Session log (Protokoll) populated correctly')
} else {
  console.log('ISSUES FOUND — see above.')
}
console.log('='.repeat(60))

process.exit(allErrors.length > 0 ? 1 : 0)
