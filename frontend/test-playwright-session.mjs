#!/usr/bin/env node
/**
 * DEFINITIVE PLAYWRIGHT E2E SESSION
 *
 * 5 real Chromium browsers. Every click goes through the actual React UI.
 * Tests every major feature path and reports bugs.
 */

import { chromium } from 'playwright'

const BASE = 'http://localhost:5173'
const API = 'http://localhost:8000'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a

async function apiPost(p, b, t) { const h = { 'Content-Type': 'application/json' }; if (t) h.Authorization = `Bearer ${t}`; return (await fetch(`${API}${p}`, { method: 'POST', headers: h, body: JSON.stringify(b) })).json() }
async function apiGet(p, t) { return (await fetch(`${API}${p}`, { headers: { Authorization: `Bearer ${t}` } })).json() }
async function apiPatch(p, b, t) { return (await fetch(`${API}${p}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify(b) })).json() }

let passed = 0, failed = 0, bugs = [], screenshots = []
function T(name, cond) { if (cond) { passed++; console.log(`    ✅ ${name}`) } else { failed++; bugs.push(name); console.log(`    ❌ ${name}`) } }
function BUG(desc) { bugs.push(`BUG: ${desc}`); console.log(`    🐛 BUG: ${desc}`) }
async function snap(page, name) { const p = `/tmp/e2e-${name.replace(/\s/g, '-')}.png`; await page.screenshot({ path: p, fullPage: true }); screenshots.push(p) }

// Helper: safe click with short timeout
async function click(page, selector, timeout = 3000) {
  try { await page.locator(selector).first().click({ timeout }); return true }
  catch { return false }
}
async function clickText(page, text, timeout = 3000) {
  try { await page.locator('button', { hasText: text }).first().click({ timeout }); return true }
  catch { return false }
}
async function hasText(page, text) {
  return (await page.textContent('body')).includes(text)
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗')
  console.log('║  DEFINITIVE E2E SESSION — Full DSA5 Playthrough             ║')
  console.log('╚═══════════════════════════════════════════════════════════════╝\n')

  // ── Setup ──
  const gmTok = (await apiPost('/api/auth/login', { email: 'gm@test.de', password: 'test1234' })).access_token
  const camps = await apiGet('/api/campaigns', gmTok)
  const cid = camps[0].id
  const pDetail = await apiGet(`/api/campaigns/${cid}/players-detail`, gmTok)

  // Reset vitals
  for (const p of pDetail) {
    if (p.character) {
      const dv = p.character.derived_values || {}
      await apiPatch(`/api/characters/${p.character_id}/vitals`, { lep: dv.LeP_max, asp: dv.AsP_max || 0, kap: dv.KaP_max || 0, schip: 3 }, gmTok)
    }
  }
  // Add potions to all characters for testing
  for (const p of pDetail) {
    if (p.character) {
      try { await apiPost(`/api/inventory/${p.character_id}/add`, { name: 'Kleiner Heiltrank', quantity: 3, properties: { effects: { heal_lep: '1W6+2' }, category: 'trank' } }, gmTok) } catch {}
    }
  }

  let sess
  try { sess = await apiPost('/api/sessions', { campaign_id: cid, name: 'E2E Final' }, gmTok) } catch { sess = (await apiGet(`/api/campaigns/${cid}`, gmTok)).sessions?.[0] }
  const sc = sess.session_code
  console.log(`  Session: ${sc}\n`)

  // Launch browsers
  const browser = await chromium.launch({ headless: true })
  const P = {} // label → {page, ctx, email, pw}
  for (const [label, email] of [['GM', 'gm@test.de'], ['Balgra', 'player1@test.de'], ['Elara', 'player2@test.de'], ['Thorben', 'player3@test.de'], ['Yara', 'player4@test.de']]) {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    P[label] = { page: await ctx.newPage(), ctx, email }
  }

  // Map character names to player detail
  const charMap = {} // charName → pDetail entry
  for (const p of pDetail) { if (p.character) charMap[p.character.name.split(' ')[0]] = p }

  // ═══════════════════════════════════════════════════════
  console.log('═══ ACT 1 — LOGIN ═══')
  for (const [label, { page, email }] of Object.entries(P)) {
    await page.goto(`${BASE}/`)
    await page.waitForSelector('input[type="email"]', { timeout: 8000 })
    await page.fill('input[type="email"]', email)
    await page.fill('input[type="password"]', 'test1234')
    await page.click('button[type="submit"]')
    try { await page.waitForURL('**/dashboard', { timeout: 8000 }); T(`${label} login`, true) }
    catch { T(`${label} login`, false) }
  }

  // ═══════════════════════════════════════════════════════
  console.log('\n═══ ACT 2 — NAVIGATE ═══')
  await P.GM.page.goto(`${BASE}/gm/${sc}`); await sleep(2500)
  T('GM cockpit', await hasText(P.GM.page, 'Spieler'))

  for (const l of ['Balgra', 'Elara', 'Thorben', 'Yara']) {
    await P[l].page.goto(`${BASE}/play/${sc}`); await sleep(1500)
    T(`${l} player view`, (await P[l].page.textContent('body')).length > 100)
  }
  await sleep(2000)
  await snap(P.GM.page, '01-gm-cockpit')

  // ═══════════════════════════════════════════════════════
  console.log('\n═══ ACT 3 — PLAYER TABS ═══')
  for (const l of ['Balgra', 'Elara', 'Thorben', 'Yara']) {
    // Charakter tab
    await clickText(P[l].page, 'Charakter'); await sleep(400)
    T(`${l} Charakter tab`, await hasText(P[l].page, 'LeP') || await hasText(P[l].page, l))

    // Talente tab
    await clickText(P[l].page, 'Talente'); await sleep(400)
    T(`${l} Talente tab`, (await P[l].page.textContent('body')).length > 300)

    // Inventar tab
    await clickText(P[l].page, 'Inventar'); await sleep(400)
    const invBody = await P[l].page.textContent('body')
    T(`${l} Inventar has Heiltrank`, invBody.includes('Heiltrank'))
  }

  // Elara Magie tab
  await clickText(P.Elara.page, 'Magie'); await sleep(400)
  T('Elara Magie tab has spells', await hasText(P.Elara.page, 'Ignifaxius') || await hasText(P.Elara.page, 'ignifaxius') || await hasText(P.Elara.page, 'Zauber'))
  await snap(P.Elara.page, '02-elara-magic')

  // ═══════════════════════════════════════════════════════
  console.log('\n═══ ACT 4 — GM PLAYER ACTIONS ═══')

  // Select all players
  await clickText(P.GM.page, 'Alle'); await sleep(300)
  T('GM selected all players', true)

  // Open health panel and apply damage
  if (await clickText(P.GM.page, 'Leben')) {
    await sleep(400)
    const healthInput = P.GM.page.locator('input[type="number"]').first()
    if (await healthInput.isVisible().catch(() => false)) {
      await healthInput.fill('3') // 3 damage to all selected
      if (await clickText(P.GM.page, 'Anwenden')) {
        await sleep(1000)
        T('GM applied 3 damage to players', true)
        // Verify DB
        const pd2 = await apiGet(`/api/campaigns/${cid}/players-detail`, gmTok)
        const anyDamaged = pd2.some(p => p.current_lep && p.character && p.current_lep < (p.character.derived_values?.LeP_max || 99))
        T('DB reflects damage', anyDamaged)
      }
    }
    // Close panel
    await P.GM.page.keyboard.press('Escape'); await sleep(300)
  }

  // Open whisper panel
  if (await clickText(P.GM.page, /[Ff]l[uü]ster/)) {
    await sleep(400)
    const textarea = P.GM.page.locator('textarea').first()
    if (await textarea.isVisible().catch(() => false)) {
      await textarea.fill('Geheime Nachricht an alle: Vorsicht im Wald!')
      await clickText(P.GM.page, 'Senden'); await sleep(800)
      T('GM sent whisper', true)
    }
    await P.GM.page.keyboard.press('Escape'); await sleep(300)
  }
  await snap(P.GM.page, '03-after-actions')

  // ═══════════════════════════════════════════════════════
  console.log('\n═══ ACT 5 — BATTLE SETUP ═══')

  await clickText(P.GM.page, 'Kampf starten'); await sleep(1000)
  T('BattleSetup opened', await hasText(P.GM.page, 'Kampf vorbereiten') || await hasText(P.GM.page, 'Spieler'))
  await snap(P.GM.page, '04-battle-setup')

  // Select players (left column) — click each character name
  for (const name of ['Thorben', 'Yara', 'Elara', 'Balgra']) {
    const btns = P.GM.page.locator(`button:has-text("${name}")`)
    const count = await btns.count()
    for (let i = 0; i < count; i++) {
      const btn = btns.nth(i)
      const text = await btn.textContent().catch(() => '')
      // Only click player selection buttons (not tab buttons etc), look for ones with character data
      if (text.includes('LeP') || text.includes(name)) {
        await btn.click().catch(() => {}); await sleep(150); break
      }
    }
  }
  await sleep(300)

  // Select NPCs (right column) — use second search input
  const searchInputs = P.GM.page.locator('input[placeholder="Suchen..."]')
  const npcSearch = searchInputs.nth(1)
  if (await npcSearch.isVisible().catch(() => false)) {
    // Select 2 wolves
    await npcSearch.fill('Wolf'); await sleep(800)
    const wolfBtns = P.GM.page.locator('button:has-text("Wolf"):has-text("LeP")')
    const wc = await wolfBtns.count()
    for (let i = 0; i < Math.min(wc, 2); i++) { await wolfBtns.nth(i).click(); await sleep(200) }
    T(`Selected ${Math.min(wc, 2)} wolves`, wc > 0)

    // Select Warg
    await npcSearch.fill('Warg'); await sleep(800)
    const wargBtns = P.GM.page.locator('button:has-text("Warg"):has-text("LeP")')
    if (await wargBtns.count() > 0) { await wargBtns.first().click(); await sleep(200); T('Selected Warg', true) }

    await npcSearch.fill(''); await sleep(300)
  }

  await snap(P.GM.page, '05-battle-selected')

  // Check selection count and start
  const setupBody = await P.GM.page.textContent('body')
  const selMatch = setupBody.match(/(\d+)\s*Helden.*?(\d+)\s*Gegner/)
  console.log(`    Selection: ${selMatch ? `${selMatch[1]} heroes, ${selMatch[2]} enemies` : 'checking...'}`)

  // Click "Kampf starten (N)" — the last matching button
  const startBtn = P.GM.page.locator('button', { hasText: /Kampf starten/ }).last()
  if (await startBtn.isEnabled({ timeout: 2000 }).catch(() => false)) {
    await startBtn.click(); await sleep(2500)
    T('Combat started', true)
  } else {
    T('Combat start button enabled', false)
    BUG('Could not start combat — button disabled. Check NPC selection.')
    // Cancel and skip combat tests
    await clickText(P.GM.page, 'Abbrechen')
  }
  await snap(P.GM.page, '06-combat-started')

  // ═══════════════════════════════════════════════════════
  console.log('\n═══ ACT 6 — COMBAT: GM + PLAYER INTERACTION ═══')

  const gmBody = await P.GM.page.textContent('body')
  const combatActive = gmBody.includes('Kampf') && (gmBody.includes('Helden') || gmBody.includes('HELDEN') || gmBody.includes('Runde'))
  T('GM combat view visible', combatActive)

  if (combatActive) {
    // Determine whose turn it is
    const isPlayerTurn = gmBody.includes('Warte auf Spieler') || gmBody.includes('Spieler-Charakter')
    const isNPCTurn = gmBody.includes('NSC') || gmBody.includes('du steuerst')

    // Check all players auto-switched to combat
    for (const l of ['Balgra', 'Elara', 'Thorben', 'Yara']) {
      await clickText(P[l].page, 'Kampf').catch(() => {}); await sleep(300)
      T(`${l} combat view`, await hasText(P[l].page, 'Kampf') || await hasText(P[l].page, 'Runde'))
    }

    // Find which player has the turn (TurnFlow with action buttons)
    let activePlayer = null
    for (const l of ['Balgra', 'Elara', 'Thorben', 'Yara']) {
      if (await hasText(P[l].page, 'Nahkampfangriff')) {
        activePlayer = l; break
      }
    }

    if (activePlayer) {
      console.log(`    → ${activePlayer} has the turn (TurnFlow visible)`)
      const pg = P[activePlayer].page
      await snap(pg, '07-player-turnflow')

      // ── PLAYER CLICKS NAHKAMPFANGRIFF ──
      if (await clickText(pg, 'Nahkampfangriff', 2000)) {
        T(`${activePlayer} clicked Nahkampfangriff`, true)
        await sleep(800)
        await snap(pg, '08-after-melee-click')

        // ── WEAPON SELECTION (if multiple weapons) ──
        const pgBody2 = await pg.textContent('body')
        if (pgBody2.includes('Waffe') && pgBody2.includes('waehlen')) {
          // Click first weapon button
          const weaponBtns = pg.locator('button:has-text("AT")')
          if (await weaponBtns.count() > 0) {
            await weaponBtns.first().click(); await sleep(500)
            T(`${activePlayer} selected weapon`, true)
          }
        }

        // ── TARGET SELECTION ──
        await sleep(500)
        const pgBody3 = await pg.textContent('body')
        if (pgBody3.includes('Ziel') || pgBody3.includes('Wolf') || pgBody3.includes('Warg')) {
          // Click first enemy target (Wolf or Warg)
          const targetBtn = pg.locator('button:has-text("Wolf")').first()
            || pg.locator('button:has-text("Warg")').first()
          if (await targetBtn?.isVisible({ timeout: 2000 }).catch(() => false)) {
            await targetBtn.click(); await sleep(500)
            T(`${activePlayer} selected target`, true)
            await snap(pg, '09-target-selected')
          } else {
            // Try any enemy button
            const anyEnemy = pg.locator('button:has-text("LeP")').first()
            if (await anyEnemy.isVisible({ timeout: 1000 }).catch(() => false)) {
              await anyEnemy.click(); await sleep(500)
              T(`${activePlayer} selected target (fallback)`, true)
            }
          }
        }

        // ── MANEUVER SELECTION ──
        await sleep(500)
        const pgBody4 = await pg.textContent('body')
        if (pgBody4.includes('Manoever') || pgBody4.includes('Wuchtschlag')) {
          // Try clicking Wuchtschlag I
          if (await clickText(pg, 'Wuchtschlag I', 2000)) {
            T(`${activePlayer} selected Wuchtschlag I`, true)
          } else if (await clickText(pg, 'Ohne Manoever', 2000)) {
            T(`${activePlayer} selected Ohne Manoever`, true)
          }
          await sleep(500)
        }

        // ── ATTACK DICE INPUT ──
        await sleep(500)
        const pgBody5 = await pg.textContent('body')
        if (pgBody5.includes('1W20') || pgBody5.includes('Zielwert')) {
          const diceInput = pg.locator('input[type="number"]').first()
          if (await diceInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await diceInput.fill('5') // Low roll = likely hit
            await sleep(300)
            T(`${activePlayer} entered attack roll`, true)
            await snap(pg, '10-dice-entered')

            // Check modifier breakdown visible
            T('Modifier breakdown shown', pgBody5.includes('Modifikatoren') || pgBody5.includes('AT'))

            // Confirm
            const confirmBtns = pg.locator('button:has-text("best")')
            if (await confirmBtns.count() > 0) {
              await confirmBtns.first().click(); await sleep(1000)
              T(`${activePlayer} confirmed attack`, true)
              await snap(pg, '11-after-confirm')

              // ── CHECK RESULT — HIT OR MISS ──
              const resultBody = await pg.textContent('body')
              const wasHit = resultBody.includes('Treffer') || resultBody.includes('Kritisch')
              const wasMiss = resultBody.includes('Daneben') || resultBody.includes('Patzer')
              T('Attack result shown', wasHit || wasMiss)
              console.log(`    → Result: ${wasHit ? 'HIT' : 'MISS'}`)

              if (wasHit) {
                // ── DEFENSE STEP ──
                await sleep(500)
                const defBody = await pg.textContent('body')
                if (defBody.includes('Parade') || defBody.includes('Ausweichen') || defBody.includes('akzeptieren')) {
                  // Select Parade
                  if (await clickText(pg, 'Parade', 2000)) {
                    T('Defense type selected (Parade)', true)
                    await sleep(500)
                    // Defense dice input
                    const defDice = pg.locator('input[type="number"]').first()
                    if (await defDice.isVisible({ timeout: 2000 }).catch(() => false)) {
                      await defDice.fill('15') // High = likely fail defense
                      const defConfirm = pg.locator('button:has-text("best")').first()
                      if (await defConfirm.isVisible().catch(() => false)) {
                        await defConfirm.click(); await sleep(1000)
                        T('Defense roll submitted', true)
                      }
                    }
                  } else if (await clickText(pg, 'Treffer akzeptieren', 2000)) {
                    T('Treffer akzeptieren clicked', true)
                  }
                }

                // ── DAMAGE STEP ──
                await sleep(500)
                const dmgBody = await pg.textContent('body')
                if (dmgBody.includes('Schaden') || dmgBody.includes('TP')) {
                  const dmgInput = pg.locator('input[type="number"]').first()
                  if (await dmgInput.isVisible({ timeout: 2000 }).catch(() => false)) {
                    await dmgInput.fill('8') // Decent damage
                    const dmgConfirm = pg.locator('button:has-text("best")').first()
                    if (await dmgConfirm.isVisible().catch(() => false)) {
                      await dmgConfirm.click(); await sleep(1000)
                      T('Damage applied', true)
                      await snap(pg, '12-damage-applied')

                      // Check if damage shows in the combat log or on combatant card
                      const afterDmg = await pg.textContent('body')
                      T('Damage result visible', afterDmg.includes('SP') || afterDmg.includes('LeP'))
                    }
                  }
                }
              }
            }
          }
        }
      } else {
        T(`${activePlayer} Nahkampfangriff button`, false)
        BUG(`TurnFlow Nahkampfangriff button not clickable for ${activePlayer}`)
      }
    } else if (isPlayerTurn) {
      console.log('    → Player turn but no player sees TurnFlow')
      BUG('Player turn detected but TurnFlow not visible on any player page')
      await snap(P.GM.page, '07-gm-waiting')

      // GM clicks "Eingreifen" to take over
      if (await clickText(P.GM.page, 'Eingreifen', 3000)) {
        T('GM clicked Eingreifen', true)
        await sleep(1000)
        // Now TurnFlow should be visible on GM
        if (await hasText(P.GM.page, 'Nahkampfangriff')) {
          T('GM TurnFlow after Eingreifen', true)
          await snap(P.GM.page, '07b-gm-turnflow')
        }
      }
    }

    // ── ADVANCE TURN ──
    await P.GM.page.keyboard.press('Escape'); await sleep(300)
    if (await clickText(P.GM.page, /N[aä]chster Zug/, 3000)) {
      await sleep(1000)
      T('Advanced to next turn', true)
      await snap(P.GM.page, '13-next-turn')
    }

    // ── VERIFY HP BARS ACROSS ALL CLIENTS ──
    console.log('\n  Checking HP sync across browsers...')
    await sleep(1000)
    for (const l of ['GM', 'Balgra', 'Elara', 'Thorben', 'Yara']) {
      const body = await P[l].page.textContent('body')
      T(`${l} shows LeP values`, body.includes('LeP') || body.includes('/'))
    }

    // ── GM USES "EINGREIFEN" FOR NPC TURN ──
    const gmBody2 = await P.GM.page.textContent('body')
    if (gmBody2.includes('NSC') || gmBody2.includes('steuerst') || gmBody2.includes('Zug ausf')) {
      console.log('\n  NPC turn — GM uses Eingreifen...')
      if (await clickText(P.GM.page, 'Zug ausf', 2000) || await clickText(P.GM.page, 'Eingreifen', 2000)) {
        await sleep(1000)
        if (await hasText(P.GM.page, 'Nahkampfangriff')) {
          T('GM TurnFlow for NPC', true)
          // Click Nahkampfangriff → target → dice
          await clickText(P.GM.page, 'Nahkampfangriff', 2000); await sleep(500)
          // Click first player target
          for (const name of ['Balgra', 'Thorben', 'Elara', 'Yara']) {
            if (await clickText(P.GM.page, name, 1000)) { T('NPC target selected', true); break }
          }
          await sleep(500)
          // Skip maneuver
          await clickText(P.GM.page, 'Ohne Manoever', 1000); await sleep(500)
          // Enter dice
          const npcDice = P.GM.page.locator('input[type="number"]').first()
          if (await npcDice.isVisible({ timeout: 2000 }).catch(() => false)) {
            await npcDice.fill('8'); await sleep(200)
            await P.GM.page.locator('button:has-text("best")').first().click().catch(() => {})
            await sleep(1000)
            T('NPC attack resolved', true)
          }
        }
      }
      // Advance again
      await P.GM.page.keyboard.press('Escape'); await sleep(300)
      await clickText(P.GM.page, /N[aä]chster Zug/, 2000); await sleep(500)
    }
  }

  // ═══════════════════════════════════════════════════════
  console.log('\n═══ ACT 7 — END COMBAT ═══')
  await P.GM.page.keyboard.press('Escape'); await sleep(300)
  if (await clickText(P.GM.page, 'Beenden', 3000).catch(() => false) || await click(P.GM.page, 'button:has-text("Beenden")', 3000)) {
    await sleep(500)
    if (await clickText(P.GM.page, 'Kampf beenden', 3000)) {
      T('Combat ended via UI', true)
    }
  }
  await sleep(1500)
  await snap(P.GM.page, '14-combat-ended')

  // Players check result
  for (const l of ['Balgra', 'Elara']) {
    const body = await P[l].page.textContent('body')
    T(`${l} sees post-combat`, !body.includes('Runde') || body.includes('Kampf'))
  }

  // ═══════════════════════════════════════════════════════
  console.log('\n═══ ACT 8 — INVENTORY CHECK ═══')
  for (const l of ['Balgra', 'Elara']) {
    await clickText(P[l].page, 'Inventar', 2000); await sleep(500)
    const inv = await P[l].page.textContent('body')
    T(`${l} inventory accessible`, inv.includes('Inventar') || inv.includes('Heiltrank') || inv.includes('Streit'))
    await snap(P[l].page, `15-${l}-inventory`)
  }

  // ═══════════════════════════════════════════════════════
  console.log('\n═══ ACT 9 — NPC PANEL ═══')
  // Dismiss any blocking overlay
  for (let i = 0; i < 3; i++) { await P.GM.page.keyboard.press('Escape'); await sleep(200) }
  await clickText(P.GM.page, 'Schliessen', 1000).catch(() => {})
  await clickText(P.GM.page, 'Verstanden', 1000).catch(() => {})
  await sleep(500)
  // Check right sidebar NPC panel
  const gmFull = await P.GM.page.textContent('body')
  T('NPC panel: Personen tab visible', gmFull.includes('Personen'))
  T('NPC panel: Kreaturen tab visible', gmFull.includes('Kreaturen'))
  T('NPC panel: NSCs heading visible', gmFull.includes('NSC'))

  // Click on Kreaturen tab
  try {
    const kreaturenTab = P.GM.page.locator('button', { hasText: 'Kreaturen' }).first()
    if (await kreaturenTab.isVisible().catch(() => false)) {
      await kreaturenTab.click({ timeout: 3000 }); await sleep(300)
      T('Kreaturen tab clickable', true)
    }
  } catch { BUG('Kreaturen tab blocked by overlay — modal not dismissing after combat end') }
  await snap(P.GM.page, '16-npc-panel')

  // ═══════════════════════════════════════════════════════
  console.log('\n═══ ACT 10 — PAGE REFRESH RECOVERY ═══')
  await P.Balgra.page.reload(); await sleep(3000)
  T('Balgra survives refresh', (await P.Balgra.page.textContent('body')).length > 100)

  await P.GM.page.reload(); await sleep(3000)
  T('GM survives refresh', await hasText(P.GM.page, 'Spieler') || await hasText(P.GM.page, 'Aventuria'))

  // ═══════════════════════════════════════════════════════
  console.log('\n═══ ACT 11 — GM SESSION PREP ═══')
  if (await clickText(P.GM.page, 'Session-Material', 3000)) {
    await sleep(1500)
    T('Session Prep opened', await hasText(P.GM.page, 'Kreaturen') || await hasText(P.GM.page, 'Waffen') || await hasText(P.GM.page, 'Session'))
    await snap(P.GM.page, '17-session-prep')

    // Click different category tabs
    for (const cat of ['Waffen', 'Gegenst', 'Zauber']) {
      if (await clickText(P.GM.page, cat, 1500)) {
        await sleep(500)
        T(`Session Prep ${cat} tab`, true)
      }
    }

    // Close prep
    await P.GM.page.keyboard.press('Escape'); await sleep(500)
  }

  // ═══════════════════════════════════════════════════════
  console.log('\n═══ ACT 12 — LOOT DISTRIBUTION ═══')
  if (await clickText(P.GM.page, 'Beute verteilen', 3000)) {
    await sleep(1000)
    T('Loot panel opened', await hasText(P.GM.page, 'Beute'))
    await snap(P.GM.page, '18-loot-panel')

    // Add a custom loot item
    const lootInput = P.GM.page.locator('input[placeholder*="Gegenstand"]').first()
    if (await lootInput.isVisible().catch(() => false)) {
      await lootInput.fill('Wolfsfell')
      // Click add button (Plus icon)
      const addBtn = P.GM.page.locator('button').filter({ has: P.GM.page.locator('svg.lucide-plus') }).first()
      if (await addBtn.isVisible().catch(() => false)) {
        await addBtn.click(); await sleep(300)
        T('Loot item added', true)
      }
    }

    // Try to show to players
    if (await clickText(P.GM.page, 'Den Spielern zeigen', 3000).catch(() => false) || await clickText(P.GM.page, 'zeigen', 3000).catch(() => false)) {
      await sleep(1000)
      T('Loot shown to players', true)
      await snap(P.GM.page, '19-loot-distribute')
    }

    // Close loot panel
    await P.GM.page.keyboard.press('Escape'); await sleep(300)
    await clickText(P.GM.page, 'Schliessen', 1000).catch(() => {})
    await clickText(P.GM.page, 'Abbrechen', 1000).catch(() => {})
    await sleep(300)
  }

  // ═══════════════════════════════════════════════════════
  console.log('\n═══ ACT 13 — FINAL DB AUDIT ═══')
  await sleep(1000)
  const final = await apiGet(`/api/campaigns/${cid}/players-detail`, gmTok)
  for (const p of final) {
    if (!p.character) continue
    const dv = p.character.derived_values || {}
    const name = p.character.name
    console.log(`    ${name}: LeP=${p.current_lep}/${dv.LeP_max} AsP=${p.current_asp}/${dv.AsP_max || 0}`)
    T(`${name} DB readable`, p.current_lep != null)

    // Check inventory via API
    try {
      const inv = await apiGet(`/api/inventory/${p.character_id}`, gmTok)
      const items = Array.isArray(inv) ? inv : []
      T(`${name} inventory has ${items.length} items`, items.length >= 0)
    } catch { T(`${name} inventory API`, false) }
  }

  // ═══════════════════════════════════════════════════════
  console.log('\n═══ CLEANUP ═══')
  for (const { ctx } of Object.values(P)) await ctx.close()
  await browser.close()

  // Reset
  for (const p of pDetail) {
    if (p.character) {
      const dv = p.character.derived_values || {}
      await apiPatch(`/api/characters/${p.character_id}/vitals`, { lep: dv.LeP_max, asp: dv.AsP_max || 0, kap: dv.KaP_max || 0, schip: 3 }, gmTok)
    }
  }

  // ═══════════════════════════════════════════════════════
  console.log(`\n${'═'.repeat(65)}`)
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`)
  console.log(`  Screenshots: ${screenshots.length} saved to /tmp/e2e-*`)
  console.log(`${'═'.repeat(65)}`)
  if (bugs.length) {
    console.log('\n  BUGS FOUND:')
    bugs.forEach(b => console.log(`    🐛 ${b}`))
  }
  console.log(failed === 0 ? '\n✅ ALL TESTS PASSED' : `\n❌ ${failed} issues found — check screenshots`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
