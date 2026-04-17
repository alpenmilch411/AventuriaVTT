import { useEffect, useRef, useState, useCallback } from 'react'
import useSessionStore from '../stores/sessionStore'
import useCombatStore from '../stores/combatStore'
import useMapStore from '../stores/mapStore'
import useCharacterStore from '../stores/characterStore'
import useCampaignStore from '../stores/campaignStore'
import useAuthStore from '../stores/authStore'
import useShopStore from '../stores/shopStore'
import { createBuff } from '../engine/buffSystem'
import { classifyItem } from '../engine/itemEffects'

const RECONNECT_BASE_DELAY = 1000
const RECONNECT_MAX_DELAY = 30000
const HEARTBEAT_INTERVAL = 30000
const PONG_TIMEOUT = 10000

export default function useWebSocket(sessionCode, userId, role = 'player') {
  const wsRef = useRef(null)
  const reconnectAttempts = useRef(0)
  const reconnectTimeout = useRef(null)
  const heartbeatInterval = useRef(null)
  const pongTimeout = useRef(null)
  const lastStateVersion = useRef(0)
  const recentMessages = useRef(new Set())
  const [connected, setConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState(null)

  const dispatchMessage = useCallback((msg) => {
    try {
    const type = msg.type
    const payload = msg.payload || {}

    // Deduplicate: skip messages with identical type+timestamp (can happen on reconnect replay)
    if (msg.timestamp && type !== 'sync_full' && type !== 'pong') {
      const key = `${type}:${msg.timestamp}`
      if (recentMessages.current.has(key)) return
      recentMessages.current.add(key)
      // Keep set bounded (last 200 messages)
      if (recentMessages.current.size > 200) {
        const first = recentMessages.current.values().next().value
        recentMessages.current.delete(first)
      }
    }

    setLastMessage(msg)

    // Track state version for gap detection
    if (payload.state_version && payload.state_version > lastStateVersion.current + 1 && lastStateVersion.current > 0) {
      console.warn('[WS] State version gap detected:', lastStateVersion.current, '→', payload.state_version, '— requesting full sync')
      wsRef.current?.send(JSON.stringify({ type: 'sync_request', payload: {} }))
    }
    if (payload.state_version) {
      lastStateVersion.current = payload.state_version
    }

    // Helper: log to both combatLog and sessionLog (Protokoll)
    const logCombatAndSession = (entry) => {
      useCombatStore.getState().addCombatLogEntry(entry)
      useSessionStore.getState().addSessionLogEntry({
        type: entry.type === 'system' ? 'combat' : entry.type,
        text: entry.text,
        icon: entry.type === 'roll' ? 'dice' : entry.type === 'defense' ? 'shield' : 'swords',
        ts: entry.timestamp,
      })
    }

    // ── Scene events ──
    if (type === 'scene_activate') {
      useCampaignStore.getState().handleCampaignMessage(msg)
      const scenes = useCampaignStore.getState().scenes
      scenes.forEach(s => {
        useCampaignStore.getState().updateScene(s.id, {
          isActive: s.id === payload.scene_id,
          status: s.id === payload.scene_id ? 'active' : 'upcoming',
        })
      })
    }

    // ── Combat events ──
    else if (type === 'combat_start' || type === 'combat_end' || type === 'combat_next_turn' || type === 'initiative_update') {
      useCombatStore.getState().handleCombatMessage(msg)
      // Mirror combat lifecycle events to Protokoll
      if (type === 'combat_start') {
        useSessionStore.getState().setPhase('combat')
        useSessionStore.getState().addSessionLogEntry({
          type: 'combat', text: `Kampf beginnt: ${payload.name || 'Kampf'}`, icon: 'swords', ts: Date.now(),
        })
      } else if (type === 'combat_end') {
        useSessionStore.getState().setPhase('exploration')
        useSessionStore.getState().addSessionLogEntry({
          type: 'combat', text: 'Kampf beendet.', icon: 'flag', ts: Date.now(),
        })
      } else if (type === 'combat_next_turn') {
        const turnName = payload?.combatant_name || payload?.current_turn?.name
        if (turnName) {
          useSessionStore.getState().addSessionLogEntry({
            type: 'turn', text: `${turnName} ist am Zug.`, icon: 'swords', ts: Date.now(),
          })
        }
      }
    }

    // ── Combat log entry (from GM or other players) ──
    else if (type === 'combat_log_entry') {
      logCombatAndSession({
        type: payload.type || 'system',
        text: payload.text || '',
        timestamp: msg.timestamp,
      })
    }

    // ── Unified session log entry ──
    else if (type === 'session_log_entry') {
      useSessionStore.getState().addSessionLogEntry(payload)
    }

    // ── Probe flow ──
    else if (type === 'dice_request' || type === 'probe_request') {
      // Player receives a dice prompt from the GM
      useCombatStore.getState().setPendingDiceRequest(payload)
      // GM sent a dice request — our pending request was implicitly approved
      useSessionStore.getState().clearPendingRequest()
    }
    else if (type === 'probe_result') {
      // Broadcast probe result — log it
      logCombatAndSession({
        type: 'roll',
        text: `${payload.character_name || payload.user_id}: ${payload.talent_name || payload.skill} — ${payload.success ? `QS ${payload.qs} ✓` : 'Misslungen ✗'}`,
        timestamp: msg.timestamp,
      })
    }

    // ── Transfer/Trade requests (player → GM) ──
    else if (type === 'transfer_request') {
      useSessionStore.getState().addNotification({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'transfer_request',
        from: payload.from_name || 'Spieler',
        text: payload.summary || `${payload.from_name} moechte Gegenstaende an ${payload.to_name} uebergeben.`,
        payload,
        timestamp: msg.timestamp,
      })
    }
    else if (type === 'trade_gm_request') {
      useSessionStore.getState().addNotification({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'trade_gm_request',
        from: payload.from_name || 'Spieler',
        text: payload.summary || `Handel zwischen ${payload.from_name} und ${payload.to_name}.`,
        payload,
        timestamp: msg.timestamp,
      })
    }

    // ── Action requests (player → GM) ──
    else if (type === 'action_request' || type === 'probe_request_from_player' || type === 'spell_cast_request') {
      // GM receives a request from a player — use request_id as notification id for withdraw matching
      useSessionStore.getState().addNotification({
        id: payload.request_id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: msg.type,
        from: payload.character_name || payload.from_user || 'Spieler',
        text: type === 'probe_request_from_player'
          ? `${payload.character_name} moechte ${payload.talent_name} proben (FW ${payload.fw})`
          : type === 'spell_cast_request'
          ? `${payload.character_name} moechte ${payload.spell_name} wirken (${payload.cost})`
          : `${payload.character_name}: ${payload.action_label || 'Aktion'} — ${payload.item_name || ''}`,
        payload,
        timestamp: msg.timestamp,
      })
    }

    // ── Map events ──
    else if (type === 'token_move' || type === 'token_spawn' || type === 'token_remove') {
      useMapStore.getState().handleMapMessage(msg)
    }

    // ── Buff add/remove (syncs temporary stat modifiers) ──
    else if (type === 'buff_add') {
      useCharacterStore.getState().addBuff(payload)
    }
    else if (type === 'buff_remove') {
      useCharacterStore.getState().removeBuff(payload.buff_id)
    }
    // Backend-confirmed buff lifecycle (from buff_apply flow)
    else if (type === 'buff_applied' || type === 'buff_removed') {
      useCharacterStore.getState().handleCharacterMessage(msg)
    }

    // ── Scene content push (GM sends visible scene items to players) ──
    else if (type === 'scene_content_push') {
      useSessionStore.getState().setSceneContent(payload.items || [])
    }

    // ── Map state push (GM batched update to players) ──
    else if (type === 'map_state_push') {
      useMapStore.getState().handleMapMessage({ type: 'map_state_push', payload })
    }

    // ── Character/vitals updates ──
    // Backend now always sends absolute values (deltas resolved server-side).
    else if (type === 'state_update' || type === 'vitals_update' || type === 'conditions_update' || type === 'condition_change') {
      const combatState = useCombatStore.getState()
      const sessionState = useSessionStore.getState()
      const charState = useCharacterStore.getState()

      charState.handleCharacterMessage(msg)
      // Sync vitals to combatStore (combat HP bars) and sessionStore (GM player list)
      // Handles both absolute values (from new backend) and deltas (fallback for old backend)
      if (type === 'vitals_update' || type === 'state_update') {
        const rawVitals = type === 'vitals_update' ? (payload.vitals || {}) : {}
        const cid = payload.character_id
        const tid = payload.token_id
        if (type === 'state_update' && payload.current_lep !== undefined) {
          rawVitals.lep = payload.current_lep
        }

        // Helper: resolve deltas to absolute using a base value and max
        const resolve = (abs, delta, current, max) => {
          if (abs !== undefined) return abs
          if (delta !== undefined) return Math.max(0, Math.min(max || 999, (current || 0) + delta))
          return undefined
        }

        // Update combatStore combatants (HP bars)
        const battles = combatState.battles
        for (const battle of Object.values(battles)) {
          const match = battle.initiativeOrder.find(c =>
            (cid && (c.characterId === cid || c.id === cid)) || (tid && c.id === tid)
          )
          if (match) {
            const newLep = resolve(rawVitals.lep, rawVitals.lep_delta, match.lep, match.lepMax)
            if (newLep !== undefined) combatState.updateCombatant(match.id, { lep: newLep })
          }
        }

        // Update sessionStore players (GM's player list)
        if (cid) {
          const players = sessionState.players || []
          const playerIdx = players.findIndex(p => p.characterId === cid || p.character?.id === cid)
          if (playerIdx !== -1) {
            const updated = [...players]
            const p = updated[playerIdx]
            const dv = p.character?.derived_values || {}
            const cv = p.current_vitals || {}
            const up = { ...p }
            const newLep = resolve(rawVitals.lep, rawVitals.lep_delta, cv.lep ?? p.currentLeP, dv.LeP_max)
            const newAsp = resolve(rawVitals.asp, rawVitals.asp_delta, cv.asp ?? p.currentAsP, dv.AsP_max)
            const newKap = resolve(rawVitals.kap, rawVitals.kap_delta, cv.kap ?? p.currentKaP, dv.KaP_max)
            if (newLep !== undefined) up.currentLeP = newLep
            if (newAsp !== undefined) up.currentAsP = newAsp
            if (newKap !== undefined) up.currentKaP = newKap
            if (rawVitals.schip !== undefined) up.currentSchiP = rawVitals.schip
            up.current_vitals = {
              ...(up.current_vitals || {}),
              ...(newLep !== undefined ? { lep: newLep } : {}),
              ...(newAsp !== undefined ? { asp: newAsp } : {}),
              ...(newKap !== undefined ? { kap: newKap } : {}),
              ...(rawVitals.schip !== undefined ? { schip: rawVitals.schip } : {}),
            }
            updated[playerIdx] = up
            sessionState.setPlayers(updated)
          }
        }
      }

      // Sync conditions to combatStore AND sessionStore (GM player cards show conditions)
      if (type === 'conditions_update' || type === 'condition_change') {
        const cid = payload.character_id
        if (cid) {
          // Re-read ALL stores fresh AFTER handleCharacterMessage has applied the update
          const freshChars = useCharacterStore.getState().allCharacters
          const freshMyChar = useCharacterStore.getState().myCharacter
          const charMatch = freshChars.find(c => c.id === cid) || (freshMyChar?.id === cid ? freshMyChar : null)
          const conditions = charMatch?.conditions || payload.conditions || []

          // Sync to combatStore combatants (condition icons on HP bars)
          const freshBattles = useCombatStore.getState().battles
          for (const battle of Object.values(freshBattles)) {
            const match = battle.initiativeOrder?.find(c => c.characterId === cid || c.id === cid)
            if (match) {
              useCombatStore.getState().updateCombatant(match.id, { conditions })
            }
          }

          // Sync to sessionStore players (GM player cards show condition badges)
          const freshPlayers = useSessionStore.getState().players || []
          const playerIdx = freshPlayers.findIndex(p => p.characterId === cid || p.character?.id === cid)
          if (playerIdx !== -1) {
            const updated = [...freshPlayers]
            updated[playerIdx] = { ...updated[playerIdx], conditions }
            useSessionStore.getState().setPlayers(updated)
          }
        }
      }
    }

    // ── Handout push (GM → all) ──
    else if (type === 'handout_push') {
      useSessionStore.getState().addNotification({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, type: 'handout', from: 'Spielleiter',
        text: payload.text ? 'Neues Handout vom Spielleiter' : 'Handout empfangen',
        payload, timestamp: msg.timestamp,
      })
    }

    // ── Time & Weather (GM → all) ──
    else if (type === 'time_advance') {
      useCampaignStore.getState().setWorldClock(payload.new_time || payload.world_clock || payload)
    }
    else if (type === 'weather_change') {
      useCampaignStore.getState().setWeather(payload.weather || payload)
    }

    // ── Rest (GM → all) ──
    else if (type === 'rest_end') {
      useCampaignStore.getState().setRestResults(payload)
    }

    // ── Shop state (created/updated/closed/purchase/sale) ──
    else if (type === 'shop_state') {
      useShopStore.getState().handleShopState(payload)
    }

    // ── Defense request (GM → specific player) ──
    else if (type === 'defense_request') {
      useCombatStore.getState().setPendingDefense(payload)
    }

    // ── Dice result (player → GM, or broadcast) ──
    else if (type === 'dice_result') {
      if (payload.request_type === 'talent_probe') {
        const resultText = `${payload.character_name}: ${payload.talent_name} — ${payload.success ? `QS ${payload.qs} ✓` : '✗ Misslungen'}`
        useSessionStore.getState().addNotification({
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, type: payload.success ? 'success' : 'declined',
          from: payload.character_name || 'Spieler', text: resultText, timestamp: msg.timestamp,
        })
        logCombatAndSession({ type: 'roll', text: resultText, timestamp: msg.timestamp })
        // Store result so GM's ProbeSetupPopup can auto-process it
        useCombatStore.getState().setLastDiceResult(payload)
      }
      // Consequence dice roll (damage/heal from probe consequences)
      if (payload.request_type === 'consequence_roll') {
        const label = payload.consequence_type === 'damage' ? 'Schaden' : 'Heilung'
        logCombatAndSession({ type: 'roll', text: `${payload.character_name}: ${label} — ${payload.value}`, timestamp: msg.timestamp })
        useCombatStore.getState().setLastDiceResult(payload)
      }
      // Initiative result — update combatant
      if (payload.request_type === 'initiative' && payload.battle_id) {
        const battles = useCombatStore.getState().battles
        const battle = battles[payload.battle_id]
        if (battle) {
          const combatant = battle.initiativeOrder.find(c => c.characterId === payload.character_id || c.id === payload.character_id)
          if (combatant) {
            const total = (combatant.iniBasis || 10) + payload.value
            useCombatStore.getState().updateCombatant(combatant.id, { iniRoll: payload.value, initiative: total })
          }
        }
      }
      // Attack/defense/damage result — log it and store for TurnFlow auto-processing
      if (payload.request_type === 'attack' || payload.request_type === 'defense' || payload.request_type === 'damage') {
        const label = payload.request_type === 'attack' ? 'Attacke' : payload.request_type === 'defense' ? 'Verteidigung' : 'Schaden'
        logCombatAndSession({
          type: 'roll',
          text: `${payload.character_name || 'Kaempfer'}: ${label} — ${payload.value}`,
          timestamp: msg.timestamp,
        })
        // Store result so GM's TurnFlow can auto-process it
        useCombatStore.getState().setLastDiceResult(payload)
      }
    }

    // ── Action declare in combat (player → all) ──
    else if (type === 'action_declare') {
      logCombatAndSession({
        type: 'system', text: `${payload.character_name || 'Kaempfer'}: ${payload.action_label || payload.action || 'Aktion'}`,
        timestamp: msg.timestamp,
      })
      // Store the declaration so GM's CombatOverlay can auto-react
      if (payload.action_type === 'attack' || payload.action_type === 'spell') {
        useCombatStore.getState().setPendingPlayerAction(payload)
      }
    }

    // ── Defense choice (player → GM) ──
    else if (type === 'defense_choice') {
      const typeLabel = payload.type === 'parade' ? 'Parade' : payload.type === 'ausweichen' ? 'Ausweichen' : 'Akzeptiert'
      logCombatAndSession({
        type: 'defense', text: `${payload.character_name || 'Verteidiger'} waehlt: ${typeLabel}`,
        timestamp: msg.timestamp,
      })
    }

    // ── Player connected/disconnected — update player count silently ──
    else if (type === 'player_connected' || type === 'player_disconnected' || type === 'player_reconnected') {
      useSessionStore.getState().handleSessionMessage(msg)
    }

    // ── Loot display (GM → players/table) ──
    else if (type === 'loot_display') {
      useSessionStore.getState().addNotification({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'loot',
        from: 'Spielleiter',
        text: `Beute von ${payload.source_name}: ${(payload.items || []).map(i => i.name).join(', ')}`,
        payload,
        timestamp: msg.timestamp,
      })
      useSessionStore.getState().setActiveLoot(payload)
    }
    else if (type === 'loot_distribute') {
      const myId = useAuthStore?.getState?.()?.user?.id
      const myDistributions = (payload.distributions || []).filter(d => d.player_id === myId)
      if (myDistributions.length > 0) {
        useSessionStore.getState().addNotification({
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: 'loot_received',
          from: 'Spielleiter',
          text: `Du erhaeltst: ${myDistributions.map(d => `${d.quantity}x ${d.item_name}`).join(', ')}`,
          payload: myDistributions,
          timestamp: msg.timestamp,
        })
        // Set loot received for player popup
        useSessionStore.getState().setLootReceived({
          source_name: payload.source_name,
          items: myDistributions.map(d => ({ name: d.item_name, quantity: d.quantity || 1, weight: d.weight || 0 })),
        })
        const char = useCharacterStore.getState().myCharacter
        if (char) {
          const rawInv = char.basis_inventory || char.campaign_inventory || {}
          const currentItems = Array.isArray(rawInv) ? rawInv : (rawInv.items || [])
          const purse = Array.isArray(rawInv) ? {} : (rawInv.purse || {})
          const newItems = myDistributions.map(d => ({
            name: d.item_name, quantity: d.quantity || 1, weight: d.weight || 0, equipped: false,
            ...(d.category ? { category: d.category } : {}),
          }))
          useCharacterStore.getState().setMyCharacter({
            ...char,
            basis_inventory: { items: [...currentItems, ...newItems], purse },
          })
        }
      }
      // Currency distribution
      const myMoney = (payload.money_distributions || []).find(d => d.player_id === myId)
      if (myMoney) {
        const char = useCharacterStore.getState().myCharacter
        if (char) {
          const rawInv = char.basis_inventory || {}
          const currentItems = Array.isArray(rawInv) ? rawInv : (rawInv.items || [])
          const purse = Array.isArray(rawInv) ? {} : { ...(rawInv.purse || {}) }
          for (const key of ['dukaten', 'silber', 'heller', 'kreuzer']) {
            purse[key] = (purse[key] || 0) + (myMoney[key] || 0)
          }
          useCharacterStore.getState().setMyCharacter({
            ...char,
            basis_inventory: { items: currentItems, purse },
          })
        }
        const moneyParts = ['dukaten', 'silber', 'heller', 'kreuzer']
          .filter(k => myMoney[k] > 0)
          .map(k => `${myMoney[k]} ${k.charAt(0).toUpperCase() + k.slice(1)}`)
        if (moneyParts.length > 0) {
          useSessionStore.getState().addNotification({
            id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            type: 'loot_received',
            from: 'Spielleiter',
            text: `Du erhaeltst: ${moneyParts.join(', ')}`,
            payload: myMoney,
            timestamp: msg.timestamp,
          })
        }
      }
      useSessionStore.getState().setActiveLoot(null)
    }

    // ── Inventory update (from exchange/transfer/trade execution) ──
    // ── Inventory change broadcast (player used/consumed an item) ──
    else if (type === 'inventory_change') {
      // Update the character data in allCharacters (GM sees all) and myCharacter (if self)
      if (payload.character_id && payload.inventory) {
        const myChar = useCharacterStore.getState().myCharacter
        if (myChar && myChar.id === payload.character_id) {
          useCharacterStore.getState().setMyCharacter({ ...myChar, basis_inventory: payload.inventory })
        }
        useCharacterStore.getState().updateCharacterInList?.(payload.character_id, { basis_inventory: payload.inventory })
      }
    }

    else if (type === 'inventory_update') {
      const char = useCharacterStore.getState().myCharacter
      if (char && payload.character_id === char.id && payload.inventory) {
        useCharacterStore.getState().setMyCharacter({
          ...char,
          basis_inventory: payload.inventory,
        })
      }
      const reason = payload.reason || ''
      if (reason.includes('completed')) {
        const isTrade = reason.includes('trade')
        const summary = payload.summary || ''
        useSessionStore.getState().addNotification({
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: 'inventory_completed',
          from: 'Spielleiter',
          text: summary || (isTrade ? 'Handel abgeschlossen — Inventar aktualisiert.' : 'Uebergabe abgeschlossen — Inventar aktualisiert.'),
          timestamp: msg.timestamp,
          dismissAfter: 8000,
        })
      }
      // Clear any pending trade state
      useSessionStore.getState().clearTrade?.()
    }

    // ── Trade negotiation messages ──
    else if (type === 'trade_propose') {
      useSessionStore.getState().setIncomingTrade?.(payload)
      useSessionStore.getState().addNotification({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, type: 'trade', from: payload.proposer_name || 'Spieler',
        text: `${payload.proposer_name} moechte mit dir handeln.`,
        payload, timestamp: msg.timestamp,
      })
    }
    else if (type === 'trade_counter') {
      useSessionStore.getState().setIncomingTrade?.({ ...payload, is_counter: true })
      useSessionStore.getState().addNotification({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, type: 'trade', from: payload.counter_name || 'Spieler',
        text: `Gegenangebot erhalten.`,
        payload, timestamp: msg.timestamp,
      })
    }
    else if (type === 'trade_accept') {
      useSessionStore.getState().setTradeResult?.('accepted')
      useSessionStore.getState().addNotification({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, type: 'success', from: payload.from_name || 'Spieler',
        text: 'Handel angenommen — warte auf Spielleiter.',
        timestamp: msg.timestamp,
      })
    }
    else if (type === 'trade_decline' || type === 'trade_cancel') {
      useSessionStore.getState().setTradeResult?.(type === 'trade_decline' ? 'declined' : 'cancelled')
      useSessionStore.getState().clearTrade?.()
      useSessionStore.getState().addNotification({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, type: 'info', from: payload.from_name || 'Spieler',
        text: type === 'trade_decline' ? 'Handel abgelehnt.' : 'Handel abgebrochen.',
        timestamp: msg.timestamp,
      })
    }
    else if (type === 'trade_rejected' || type === 'transfer_rejected') {
      useSessionStore.getState().clearTrade?.()
      useSessionStore.getState().addNotification({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, type: 'error', from: 'Spielleiter',
        text: type === 'trade_rejected' ? 'Spielleiter hat den Handel abgelehnt.' : 'Spielleiter hat die Uebergabe abgelehnt.',
        timestamp: msg.timestamp,
      })
    }

    // ── Legacy item transfer (keep for backward compat) ──
    else if (type === 'item_transferred') {
      const myId = useAuthStore?.getState?.()?.user?.id
      if (payload.to_player_id === myId) {
        const char = useCharacterStore.getState().myCharacter
        if (char) {
          const rawInv = char.basis_inventory || {}
          const currentItems = Array.isArray(rawInv) ? rawInv : (rawInv.items || [])
          const purse = Array.isArray(rawInv) ? {} : (rawInv.purse || {})
          useCharacterStore.getState().setMyCharacter({
            ...char,
            basis_inventory: { items: [...currentItems, { name: payload.item_name, quantity: payload.quantity || 1, weight: payload.weight || 0, equipped: false }], purse },
          })
        }
        useSessionStore.getState().addNotification({
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, type: 'loot_received', from: payload.from_name || 'Spieler',
          text: `${payload.from_name} hat dir ${payload.quantity || 1}x ${payload.item_name} gegeben.`,
          timestamp: msg.timestamp,
        })
      }
      if (payload.from_player_id === myId) {
        useSessionStore.getState().addNotification({
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, type: 'success', from: 'System',
          text: `${payload.item_name} an ${payload.to_name} uebergeben.`,
          timestamp: msg.timestamp,
        })
      }
    }

    // ── Action approved/declined (GM → player) ──
    else if (type === 'action_approved') {
      useSessionStore.getState().addNotification({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'action_result',
        from: 'Spielleiter',
        text: `Aktion genehmigt: ${payload.action_label || payload.item_name || 'Aktion'}`,
        timestamp: msg.timestamp,
      })
      // If it's a "use" action, apply the item effect and consume from inventory
      if (payload.action_type === 'use' && payload.item_name) {
        const char = useCharacterStore.getState().myCharacter
        if (char) {
          const rawInv = char.basis_inventory || {}
          const items = Array.isArray(rawInv) ? rawInv : (rawInv.items || [])
          const purse = Array.isArray(rawInv) ? {} : (rawInv.purse || {})
          // Find the item and check if it has effects
          const item = items.find(i => i.name === payload.item_name)
          if (item) {
            // Apply buff effects if item has them
            if (item.effects) {
              const cls = classifyItem(item.effects)
              // Buffs: create tracked buff with timer
              if (cls === 'buff') {
                const buffEntries = []
                if (item.effects.ge_bonus) buffEntries.push({ stat: 'GE', value: item.effects.ge_bonus })
                if (item.effects.kk_bonus) buffEntries.push({ stat: 'KK', value: item.effects.kk_bonus })
                if (item.effects.kl_bonus) buffEntries.push({ stat: 'KL', value: item.effects.kl_bonus })
                if (item.effects.in_bonus) buffEntries.push({ stat: 'IN', value: item.effects.in_bonus })
                if (item.effects.mu_bonus || item.effects.courage_bonus) buffEntries.push({ stat: 'MU', value: item.effects.mu_bonus || item.effects.courage_bonus })
                const dur = item.effects.duration_minutes || (item.effects.duration_hours ? item.effects.duration_hours * 60 : 30)
                for (const b of buffEntries) {
                  useCharacterStore.getState().addBuff(createBuff({ stat: b.stat, value: b.value, durationMinutes: dur, source: item.name, characterId: char.id }))
                }
              }
              // Special conditions: nightvision, invisibility, pain relief
              if (cls === 'condition') {
                if (item.effects.pain_relief) useSessionStore.getState().addNotification({ id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, type: 'success', from: item.name, text: '-1 Stufe Schmerz', timestamp: msg.timestamp })
                if (item.effects.nightvision) {
                  useCharacterStore.getState().addBuff(createBuff({ stat: 'Nachtsicht', value: 1, durationMinutes: (item.effects.duration_hours || 2) * 60, source: item.name, characterId: char.id }))
                }
                if (item.effects.invisibility) {
                  useCharacterStore.getState().addBuff(createBuff({ stat: 'Unsichtbar', value: 1, durationMinutes: item.effects.duration_minutes || 10, source: item.name, characterId: char.id }))
                }
              }
              // Heal: GM needs to send a dice_request for the formula roll
              // The heal is applied when the dice_result comes back, not here
            }
            // Consume from inventory (frontend + persist to DB)
            if (item.consumable !== false) {
              const updatedItems = items.map(i => {
                if (i.name === payload.item_name && (i.quantity || 1) > 1) return { ...i, quantity: (i.quantity || 1) - 1 }
                if (i.name === payload.item_name) return null
                return i
              }).filter(Boolean)
              useCharacterStore.getState().setMyCharacter({
                ...char,
                basis_inventory: Array.isArray(rawInv) ? updatedItems : { items: updatedItems, purse },
              })
              // Persist: try to consume via REST API (fire-and-forget)
              const token = useAuthStore.getState().token
              if (token) {
                fetch(`/api/inventory/${char.id}`, { headers: { Authorization: `Bearer ${token}` } })
                  .then(r => r.json())
                  .then(inv => {
                    const dbItem = (Array.isArray(inv) ? inv : []).find(i => i.name === payload.item_name)
                    if (dbItem) {
                      fetch(`/api/inventory/${char.id}/use`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ item_id: dbItem.id, quantity: 1 })
                      }).catch(err => console.error('Failed to consume item:', err))
                    }
                  }).catch(err => console.error('Failed to fetch inventory:', err))
              }
            }
          }
        }
      }
      // Clear player's pending request on approval
      useSessionStore.getState().clearPendingRequest()
    }
    // ── Probe consequence (GM applied consequences after probe) ──
    else if (type === 'probe_consequence') {
      // Store so player's ProbePopup result screen can show consequences
      useCombatStore.getState().setProbeConsequences?.(payload.consequences || [])
      useSessionStore.getState().addNotification({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: payload.success ? 'success' : 'declined',
        from: 'Spielleiter',
        text: `${payload.probe_name}: ${payload.success ? `✓ QS ${payload.qs}` : '✗ Gescheitert'} — ${(payload.consequences || []).join(', ')}`,
        timestamp: msg.timestamp,
      })
    }

    // ── Probe cancel (player withdrew their probe request) ──
    else if (type === 'probe_cancel') {
      // GM: remove the notification for this probe
      const notifs = useSessionStore.getState().notifications || []
      const matchingNotif = notifs.find(n =>
        n.type === 'probe_request_from_player' &&
        n.payload?.from_user === payload.from_user &&
        (n.payload?.talent_key === payload.talent_key || n.payload?.talent_name === payload.talent_name)
      )
      if (matchingNotif) {
        useSessionStore.getState().dismissNotification(matchingNotif.id)
      }
    }

    // ── Request withdrawn (player withdrew any request — GM side) ──
    else if (type === 'request_withdrawn') {
      const reqId = payload.request_id
      if (reqId) {
        useSessionStore.getState().dismissNotification(reqId)
      }
    }

    // ── Request withdraw confirmed (backend → player) ──
    else if (type === 'request_withdraw_confirmed') {
      useSessionStore.getState().clearPendingRequest()
    }

    else if (type === 'action_declined') {
      useSessionStore.getState().addNotification({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'action_result',
        from: 'Spielleiter',
        text: `Aktion abgelehnt: ${payload.reason || payload.action_label || 'Aktion'}`,
        timestamp: msg.timestamp,
      })
      // Clear pending dice request if the declined action was a probe
      if (payload.talent_name || payload.type === 'probe_request_from_player') {
        useCombatStore.getState().setPendingDiceRequest(null)
      }
      // Clear player's pending request
      useSessionStore.getState().clearPendingRequest()
    }

    // ── Session control ──
    else if (type === 'halt') {
      useSessionStore.getState().setHalted(true)
    }
    else if (type === 'halt_release') {
      useSessionStore.getState().setHalted(false)
    }
    else if (type === 'attention') {
      useSessionStore.getState().setAttentionMode(true)
    }
    else if (type === 'attention_release') {
      useSessionStore.getState().setAttentionMode(false)
    }
    else if (type === 'whisper') {
      useSessionStore.getState().addNotification({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'whisper',
        from: payload.from_name || 'Spielleiter',
        text: payload.text,
        timestamp: msg.timestamp,
      })
    }

    // ── Spotlight ──
    else if (type === 'spotlight') {
      useSessionStore.getState().addNotification({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, type: 'spotlight', from: 'Spielleiter',
        text: payload.reason || 'Du stehst im Rampenlicht!',
        timestamp: msg.timestamp,
      })
    }
    else if (type === 'spotlight_release') {
      // silently clear spotlight
    }

    // ── Quest update ──
    else if (type === 'quest_update') {
      useCampaignStore.getState().handleCampaignMessage(msg)
    }

    // ── Lore reveal ──
    else if (type === 'lore_reveal') {
      useCampaignStore.getState().addLoreEntry(payload)
      useSessionStore.getState().addNotification({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, type: 'lore', from: 'Spielleiter',
        text: `Neues Wissen: ${payload.title || 'Entdeckung'}`,
        timestamp: msg.timestamp,
      })
    }

    // ── Full sync (on reconnect) ──
    else if (type === 'sync_full') {
      // Reset version tracking to server's current version
      if (payload.state_version) lastStateVersion.current = payload.state_version
      // Update connected status from server's authoritative list
      if (payload.connected_users) {
        const connIds = payload.connected_users
        const curPlayers = useSessionStore.getState().players
        if (curPlayers.length > 0) {
          useSessionStore.getState().setPlayers(curPlayers.map(p => ({ ...p, connected: connIds.includes(p.id) })))
        }
      }
      // Restore all state from server
      if (payload.halted !== undefined) useSessionStore.getState().setHalted(payload.halted)
      if (payload.attention !== undefined) useSessionStore.getState().setAttentionMode(payload.attention)
      if (payload.status) useSessionStore.getState().setPhase(payload.status)
      if (payload.weather) useCampaignStore.getState().setWeather(payload.weather)
      if (payload.in_game_time) useCampaignStore.getState().setWorldClock(payload.in_game_time)
      if (payload.active_scene) {
        useCampaignStore.getState().handleCampaignMessage({
          type: 'scene_activate', payload: payload.active_scene,
        })
      }
      if (payload.combat) {
        // Merge vitals into initiative_order combatants so HP bars are correct
        const vitalsMap = payload.vitals || {}
        const iniOrder = (payload.combat.initiative_order || []).map(c => {
          const charVitals = vitalsMap[c.characterId] || vitalsMap[c.id] || {}
          return {
            ...c,
            lep: charVitals.lep ?? c.lep,
          }
        })
        useCombatStore.getState().handleCombatMessage({
          type: 'combat_start', payload: {
            name: 'Kampf',
            initiative_order: iniOrder,
            round: payload.combat.round_number,
          },
        })
        // Also update current turn index if available
        if (payload.combat.current_turn_index !== undefined) {
          const activeBid = useCombatStore.getState().activeBattleId
          if (activeBid) {
            const battle = useCombatStore.getState().battles[activeBid]
            if (battle) {
              useCombatStore.setState((state) => ({
                battles: { ...state.battles, [activeBid]: { ...state.battles[activeBid], currentTurnIndex: payload.combat.current_turn_index } },
              }))
            }
          }
        }
        useSessionStore.getState().setPhase('combat')
      }
      // Restore vitals to characterStore (for player's own character)
      if (payload.vitals) {
        const myChar = useCharacterStore.getState().myCharacter
        if (myChar && payload.vitals[myChar.id]) {
          useCharacterStore.getState().updateVitals(payload.vitals[myChar.id])
        }
        // Also update sessionStore players with vitals
        const players = useSessionStore.getState().players || []
        if (players.length > 0) {
          const updated = players.map(p => {
            const cid = p.characterId || p.character?.id
            const v = cid ? payload.vitals[cid] : null
            if (!v) return p
            return {
              ...p,
              current_vitals: { ...(p.current_vitals || {}), ...v },
              currentLeP: v.lep ?? p.currentLeP,
              currentAsP: v.asp ?? p.currentAsP,
              currentKaP: v.kap ?? p.currentKaP,
              currentSchiP: v.schip ?? p.currentSchiP,
            }
          })
          useSessionStore.getState().setPlayers(updated)
        }
      }
      // Restore conditions to characterStore and combatStore
      if (payload.conditions) {
        const myChar = useCharacterStore.getState().myCharacter
        if (myChar && payload.conditions[myChar.id]) {
          useCharacterStore.getState().updateConditions(payload.conditions[myChar.id])
        }
        // Update allCharacters conditions
        for (const [cid, conds] of Object.entries(payload.conditions)) {
          useCharacterStore.getState().updateCharacterInList(cid, { conditions: conds })
          // Also sync to combatStore combatants
          const battles = useCombatStore.getState().battles
          for (const battle of Object.values(battles)) {
            const match = battle.initiativeOrder.find(c => c.characterId === cid || c.id === cid)
            if (match) {
              useCombatStore.getState().updateCombatant(match.id, { conditions: conds })
            }
          }
        }
      }
      // Restore session log
      if (payload.session_log) {
        useSessionStore.getState().setSessionLog(payload.session_log)
      }
      // Restore pending dice requests (survives browser refresh)
      if (payload.pending_requests) {
        const myUserId = useAuthStore.getState().user?.id
        // For players: check if there's a pending dice_request targeting me
        for (const [key, req] of Object.entries(payload.pending_requests)) {
          if (key.startsWith('dice_') && key === `dice_${myUserId}`) {
            useCombatStore.getState().setPendingDiceRequest(req)
          }
        }
        // For GM: restore pending probe requests as notifications
        if (role === 'gm') {
          for (const [key, req] of Object.entries(payload.pending_requests)) {
            if (req.type === 'probe_request_from_player') {
              useSessionStore.getState().addNotification({
                id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                type: req.type,
                from: req.character_name || 'Spieler',
                text: `${req.character_name} möchte ${req.talent_name} proben (FW ${req.fw})`,
                payload: req,
                timestamp: req.timestamp,
              })
            }
          }
        }
      }
    }

    // ── SchiP usage confirmation/error ──
    else if (type === 'schip_used') {
      // Update vitals (remaining SchiP)
      const cid = payload.character_id
      if (cid) {
        const charState = useCharacterStore.getState()
        if (charState.myCharacter?.id === cid && payload.remaining !== undefined) {
          charState.updateVitals({ schip: payload.remaining })
        }
        if (payload.remaining !== undefined) {
          charState.updateCharacterInList(cid, { schip: payload.remaining })
          // Also sync to sessionStore players
          const players = useSessionStore.getState().players || []
          const pidx = players.findIndex(p => p.characterId === cid || p.character?.id === cid)
          if (pidx !== -1) {
            const updated = [...players]
            updated[pidx] = {
              ...updated[pidx],
              currentSchiP: payload.remaining,
              current_vitals: { ...(updated[pidx].current_vitals || {}), schip: payload.remaining },
            }
            useSessionStore.getState().setPlayers(updated)
          }
        }
      }
      // Log to Protokoll
      const effectLabels = {
        reroll: 'Probe wiederholen',
        defense_boost: 'Verteidigung stärken (+4)',
        halve_damage: 'Schaden halbieren',
        ignore_condition: 'Zustand ignorieren',
        additional_reaction: 'Zusätzliche Verteidigung',
      }
      const effectText = effectLabels[payload.usage] || payload.effect || payload.usage
      const name = payload.character_name || 'Held'
      logCombatAndSession({
        type: 'system',
        text: `${name} setzt SchiP ein: ${effectText}. (${payload.remaining ?? '?'} SchiP verbleibend)`,
        timestamp: msg.timestamp,
      })
    }
    else if (type === 'schip_error') {
      useSessionStore.getState().addNotification({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'error',
        from: 'System',
        text: payload.message || 'Schicksalspunkt konnte nicht eingesetzt werden.',
        timestamp: msg.timestamp,
        dismissAfter: 5000,
      })
    }

    // ── Sound play ──
    else if (type === 'sound_play') {
      // Could trigger audio playback here if implemented
    }

    // ── Session lifecycle ──
    else if (type === 'session_start' || type === 'session_pause' || type === 'session_resume' || type === 'session_end') {
      useSessionStore.getState().handleSessionMessage(msg)
    }

    // ── Fallback: try all handlers ──
    else {
      try { useSessionStore.getState().handleSessionMessage(msg) } catch(e) { console.error('Unhandled session message:', e) }
      try { useCampaignStore.getState().handleCampaignMessage(msg) } catch(e) { console.error('Unhandled campaign message:', e) }
    }
    } catch (error) {
      console.error('[WS] Message dispatch error:', error, 'Message:', msg.type)
    }
  }, [])

  const connect = useCallback(() => {
    if (!sessionCode || !userId) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const params = new URLSearchParams({
      user_id: userId,
      role,
    })
    const url = `${protocol}//${host}/ws/${sessionCode}?${params}`

    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        reconnectAttempts.current = 0
        heartbeatInterval.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }))
            pongTimeout.current = setTimeout(() => {
              console.warn('[WS] Pong timeout — triggering reconnect')
              ws.close(4000, 'Pong timeout')
            }, PONG_TIMEOUT)
          }
        }, HEARTBEAT_INTERVAL)
        // Flush queued messages on reconnect
        if (messageQueueRef.current.length > 0) {
          const queue = [...messageQueueRef.current]
          messageQueueRef.current = []
          for (const msg of queue) {
            ws.send(JSON.stringify(msg))
          }
        }
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'pong') { clearTimeout(pongTimeout.current); return }
          dispatchMessage(msg)
        } catch (err) {
          console.error('[WS] Parse error:', err)
        }
      }

      ws.onclose = (event) => {
        setConnected(false)
        clearInterval(heartbeatInterval.current)
        if (!event.wasClean) scheduleReconnect()
      }

      ws.onerror = () => {} // onclose will fire after this
    } catch (err) {
      console.error('[WS] Connection error:', err)
      scheduleReconnect()
    }
  }, [sessionCode, userId, role, dispatchMessage])

  const scheduleReconnect = useCallback(() => {
    const delay = Math.min(RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts.current), RECONNECT_MAX_DELAY)
    reconnectAttempts.current += 1
    reconnectTimeout.current = setTimeout(connect, delay)
  }, [connect])

  // Message queue for critical messages when disconnected
  const messageQueueRef = useRef([])

  const sendMessage = useCallback((message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    } else {
      // Queue critical messages for retry on reconnect
      const criticalTypes = ['dice_result', 'probe_request_from_player', 'vitals_update', 'conditions_update', 'inventory_change', 'probe_cancel', 'request_withdraw']
      if (criticalTypes.includes(message.type)) {
        messageQueueRef.current.push(message)
        console.warn('[WS] Queued for retry:', message.type, `(${messageQueueRef.current.length} queued)`)
      } else {
        console.warn('[WS] Not connected, dropped:', message.type)
      }
    }
  }, [])

  const disconnect = useCallback(() => {
    clearTimeout(reconnectTimeout.current)
    clearInterval(heartbeatInterval.current)
    clearTimeout(pongTimeout.current)
    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnect')
      wsRef.current = null
    }
    setConnected(false)
  }, [])

  useEffect(() => {
    connect()
    return () => disconnect()
  }, [connect, disconnect])

  return { connected, sendMessage, lastMessage, disconnect }
}
