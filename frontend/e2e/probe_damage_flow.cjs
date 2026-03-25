/**
 * E2E Test: Probe with 1W6 Damage Consequence
 *
 * Scenario: GM creates Klettern probe with 1W6 damage on success.
 * Player rolls and succeeds. Player rolls damage. HP decreases.
 *
 * Checks after EVERY interaction:
 * - No page errors
 * - No "Unexpected Application Error"
 * - Expected UI state
 */
const { chromium } = require('playwright');

const BASE = 'http://localhost:5173';
const API = 'http://localhost:8000';
const GM_EMAIL = 'gm@test.de';
const PLAYER_EMAIL = 'player1@test.de';
const PASSWORD = 'test1234';
const SESSION = 'DEMO-42';
const CHAR_ID = 'd1d2d6f3-6864-4127-8bfb-26c6f6e5bee2';

let passed = 0, failed = 0, step = 0;
const errors = [];

function check(name, condition, detail = '') {
  step++;
  const label = `[${step}] ${name}`;
  if (condition) { passed++; console.log(`  ✅ ${label}`) }
  else { failed++; errors.push({ step, name, detail }); console.log(`  ❌ ${label}${detail ? ': ' + detail : ''}`) }
}

async function noError(page, label) {
  const appError = await page.$('text=Unexpected Application Error');
  check(`${label} — no app error`, !appError, appError ? 'Application error on screen!' : '');
}

async function getLeP() {
  const token = await getToken(PLAYER_EMAIL);
  const res = await fetch(`${API}/api/characters/${CHAR_ID}`, { headers: { Authorization: `Bearer ${token}` } });
  const char = await res.json();
  return char.current_vitals?.lep ?? char.derived_values?.LeP_max ?? 0;
}

async function getToken(email) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  return (await res.json()).access_token;
}

async function login(page, email, name) {
  await page.goto(`${BASE}/`);
  await page.waitForTimeout(1000);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  check(`${name} logged in`, page.url().includes('/dashboard'));
}

async function test() {
  const browser = await chromium.launch({ headless: true });

  // Separate contexts for isolation
  const gmCtx = await browser.newContext();
  const plCtx = await browser.newContext();
  const gm = await gmCtx.newPage();
  const pl = await plCtx.newPage();

  // Track ALL errors in real-time
  const gmErrors = [], plErrors = [];
  gm.on('pageerror', e => gmErrors.push(e.message.slice(0, 100)));
  pl.on('pageerror', e => plErrors.push(e.message.slice(0, 100)));

  try {
    // ═══════════════════════════════════════
    console.log('\n═══ PHASE 1: Setup & Login ═══');
    // ═══════════════════════════════════════

    const lepBefore = await getLeP();
    console.log(`  📊 LeP before test: ${lepBefore}`);

    await login(gm, GM_EMAIL, 'GM');
    await login(pl, PLAYER_EMAIL, 'Player');

    // Navigate to session
    await gm.goto(`${BASE}/gm/${SESSION}`);
    await gm.waitForTimeout(5000);
    check('GM session loads', gm.url().includes(`/gm/${SESSION}`));
    await noError(gm, 'GM after load');

    await pl.goto(`${BASE}/play/${SESSION}`);
    await pl.waitForTimeout(5000);
    check('Player session loads', pl.url().includes(`/play/${SESSION}`));
    await noError(pl, 'Player after load');

    // Verify WS connected
    await gm.waitForTimeout(2000);
    await pl.waitForTimeout(2000);

    // ═══════════════════════════════════════
    console.log('\n═══ PHASE 2: GM Creates Probe ═══');
    // ═══════════════════════════════════════

    // Select player
    const balgra = await gm.$('button:has-text("Balgra")');
    check('Balgra button found', !!balgra);
    if (balgra) { await balgra.click(); await gm.waitForTimeout(500) }
    await noError(gm, 'GM after player select');

    // Open probe popup
    const probeBtn = await gm.$('button:has-text("Probe")');
    check('Probe button found', !!probeBtn);
    if (probeBtn) { await probeBtn.click(); await gm.waitForTimeout(2000) }
    await noError(gm, 'GM after probe click');

    const probePopup = await gm.$('text=Probe vorbereiten');
    check('Probe popup opens', !!probePopup);
    await gm.screenshot({ path: '/tmp/e2e_01_probe_popup.png' });

    // Search and select Klettern
    const searchInput = await gm.$('input[placeholder="Talent suchen..."]');
    check('Talent search input exists', !!searchInput);
    if (searchInput) { await searchInput.fill('Kletter'); await gm.waitForTimeout(800) }
    await noError(gm, 'GM after talent search');

    const kletternBtn = await gm.$('button:has-text("Klettern")');
    check('Klettern found in search', !!kletternBtn);
    if (kletternBtn) { await kletternBtn.click(); await gm.waitForTimeout(500) }
    await noError(gm, 'GM after talent select');

    // Verify talent selected
    const gmBody1 = await gm.evaluate(() => document.body.innerText);
    check('Klettern selected (FW shown)', gmBody1.includes('FW'));
    await gm.screenshot({ path: '/tmp/e2e_02_talent_selected.png' });

    // ═══════════════════════════════════════
    console.log('\n═══ PHASE 3: Add Damage Consequence ═══');
    // ═══════════════════════════════════════

    // Find the "Bei Erfolg" section and add consequence
    const addBtns = await gm.$$('button:has-text("Konsequenz hinzufügen")');
    check('Consequence add buttons exist', addBtns.length >= 1);
    if (addBtns[0]) { await addBtns[0].click(); await gm.waitForTimeout(500) }
    await noError(gm, 'GM after add consequence click');

    // Select Schaden type
    const schadenType = await gm.$('button:has-text("Schaden")');
    check('Schaden type button found', !!schadenType);
    if (schadenType) { await schadenType.click(); await gm.waitForTimeout(500) }
    await noError(gm, 'GM after Schaden type select');

    // Click 1W6 quick button
    const w6Btn = await gm.$('button:has-text("1W6")');
    check('1W6 quick button found', !!w6Btn);
    if (w6Btn) { await w6Btn.click(); await gm.waitForTimeout(300) }

    // Add label
    const labelInput = await gm.$('input[placeholder*="Beschreibung"]');
    if (labelInput) { await labelInput.fill('Sturzschaden'); await gm.waitForTimeout(200) }
    check('Label input filled', !!labelInput);

    await gm.screenshot({ path: '/tmp/e2e_03_consequence_added.png' });
    await noError(gm, 'GM after consequence setup');

    // ═══════════════════════════════════════
    console.log('\n═══ PHASE 4: Send Probe ═══');
    // ═══════════════════════════════════════

    const sendBtn = await gm.$('button:has-text("Probe senden")');
    check('Send button found', !!sendBtn);
    const sendDisabled = sendBtn ? await sendBtn.isDisabled() : true;
    check('Send button enabled', !sendDisabled);
    if (sendBtn && !sendDisabled) { await sendBtn.click(); await gm.waitForTimeout(1000) }
    await noError(gm, 'GM after send');

    // GM should show waiting
    const gmBody2 = await gm.evaluate(() => document.body.innerText);
    check('GM shows "Warte"', gmBody2.includes('Warte'));
    await gm.screenshot({ path: '/tmp/e2e_04_gm_waiting.png' });

    // ═══════════════════════════════════════
    console.log('\n═══ PHASE 5: Player Rolls Probe ═══');
    // ═══════════════════════════════════════

    await pl.waitForTimeout(3000);
    await noError(pl, 'Player after receiving probe');

    // Player should see probe popup
    const plBody1 = await pl.evaluate(() => document.body.innerText);
    check('Player sees Klettern', plBody1.includes('Klettern'));
    check('Player sees Würfle', plBody1.includes('Würfle'));
    await pl.screenshot({ path: '/tmp/e2e_05_player_probe.png' });

    // Find 3W20 dice inputs
    const diceInputs = await pl.$$('input[type="number"][min="1"][max="20"]');
    check('Player has 3 dice inputs', diceInputs.length === 3, `found ${diceInputs.length}`);

    // Fill with low values (guaranteed success for most FWs)
    for (let i = 0; i < Math.min(diceInputs.length, 3); i++) {
      await diceInputs[i].fill('5');
      await pl.waitForTimeout(200);
    }
    await noError(pl, 'Player after filling dice');

    // Submit probe
    const confirmBtn = await pl.$('button:has-text("Ergebnis bestätigen")');
    check('Confirm button found', !!confirmBtn);
    if (confirmBtn) { await confirmBtn.click(); await pl.waitForTimeout(2000) }
    await noError(pl, 'Player after probe submit');

    // Player should see result — either the success/fail screen or already the consequence dice screen
    const plBody2 = await pl.evaluate(() => document.body.innerText);
    const probeSuccess = plBody2.includes('Geschafft') || plBody2.includes('QS') || plBody2.includes('Sturzschaden') || plBody2.includes('1W6');
    const probeFailed = plBody2.includes('Misslungen');
    check('Player sees probe result or consequence dice', probeSuccess || probeFailed);
    await pl.screenshot({ path: '/tmp/e2e_06_player_result.png' });

    // ═══════════════════════════════════════
    console.log('\n═══ PHASE 6: Player Rolls Consequence Dice ═══');
    // ═══════════════════════════════════════

    if (probeSuccess && !probeFailed) {
      // Player should see consequence dice input (may already be showing)
      const plBody3 = await pl.evaluate(() => document.body.innerText);
      const seesConDice = plBody3.includes('Sturzschaden') || plBody3.includes('1W6') || plBody3.includes('Würfle');
      check('Player sees consequence dice prompt', seesConDice);
      await pl.screenshot({ path: '/tmp/e2e_07_consequence_dice.png' });

      // Find consequence dice input
      const conInput = await pl.$('input[placeholder="—"]');
      check('Consequence dice input found', !!conInput);
      if (conInput) {
        await conInput.fill('4');
        await pl.waitForTimeout(300);
      }
      await noError(pl, 'Player after consequence dice fill');

      // Submit consequence
      const conConfirm = await pl.$('button:has-text("Bestätigen")');
      check('Consequence confirm button found', !!conConfirm);
      if (conConfirm) { await conConfirm.click(); await pl.waitForTimeout(2000) }
      await noError(pl, 'Player after consequence submit');

      // Player should see final result
      const plBody4 = await pl.evaluate(() => document.body.innerText);
      check('Player sees final result with rolled value', plBody4.includes('4'));
      check('Player sees Schließen button', plBody4.includes('Schließen'));
      await pl.screenshot({ path: '/tmp/e2e_08_player_final.png' });

      // Close player popup
      const closeBtn = await pl.$('button:has-text("Schließen")');
      if (closeBtn) { await closeBtn.click(); await pl.waitForTimeout(1000) }
      await noError(pl, 'Player after close');
    } else {
      console.log('  ⚠️ Probe failed — skipping consequence dice');
    }

    // ═══════════════════════════════════════
    console.log('\n═══ PHASE 7: GM Sees Results ═══');
    // ═══════════════════════════════════════

    await gm.waitForTimeout(3000);
    const gmBody3 = await gm.evaluate(() => document.body.innerText);
    check('GM sees Probenergebnisse', gmBody3.includes('Probenergebnisse') || gmBody3.includes('QS'));
    if (probeSuccess) {
      check('GM sees consequence result', gmBody3.includes('Schaden') || gmBody3.includes('Konsequenz'));
    }
    await gm.screenshot({ path: '/tmp/e2e_09_gm_result.png' });
    await noError(gm, 'GM results view');

    // ═══════════════════════════════════════
    console.log('\n═══ PHASE 8: Verify Backend State ═══');
    // ═══════════════════════════════════════

    // Poll for persistence (async DB write may take a moment)
    let lepAfter = lepBefore;
    for (let attempt = 0; attempt < 10; attempt++) {
      await gm.waitForTimeout(1000);
      lepAfter = await getLeP();
      if (lepAfter !== lepBefore) break;
    }
    console.log(`  📊 LeP after test: ${lepAfter}`);

    if (probeSuccess && !probeFailed) {
      check('LeP decreased', lepAfter < lepBefore, `before=${lepBefore} after=${lepAfter}`);
      check('LeP decreased by 4 (rolled value)', lepAfter === lepBefore - 4, `expected ${lepBefore - 4}, got ${lepAfter}`);
    } else {
      check('LeP unchanged (probe failed)', lepAfter === lepBefore, `before=${lepBefore} after=${lepAfter}`);
    }

    // ═══════════════════════════════════════
    console.log('\n═══ PHASE 9: Error Summary ═══');
    // ═══════════════════════════════════════

    check('GM: no JS errors during test', gmErrors.length === 0, gmErrors.join('; '));
    check('Player: no JS errors during test', plErrors.length === 0, plErrors.join('; '));

  } catch (e) {
    console.error('\n🔥 TEST CRASHED:', e.message);
    await gm.screenshot({ path: '/tmp/e2e_crash_gm.png' }).catch(() => {});
    await pl.screenshot({ path: '/tmp/e2e_crash_pl.png' }).catch(() => {});
    failed++;
    errors.push({ step: step + 1, name: 'Test execution', detail: e.message });
  } finally {
    await browser.close();
  }

  // ═══════════════════════════════════════
  console.log('\n' + '═'.repeat(50));
  console.log(`TOTAL: ${passed + failed} checks | ✅ ${passed} passed | ❌ ${failed} failed`);
  if (errors.length > 0) {
    console.log('\nFailed:');
    errors.forEach(e => console.log(`  [${e.step}] ❌ ${e.name}${e.detail ? ': ' + e.detail : ''}`));
  }
  console.log('═'.repeat(50));
  console.log('\nScreenshots saved to /tmp/e2e_*.png');
}

test();
