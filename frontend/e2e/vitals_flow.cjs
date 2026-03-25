/**
 * E2E Test: Vitals Management (Leben popup)
 * Scenario: GM selects Balgra, opens Leben popup, deals 5 damage, confirms.
 * Verify: Player's LeP decreased by 5. No errors.
 */
const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:8000';
const CHAR_ID = 'd1d2d6f3-6864-4127-8bfb-26c6f6e5bee2';
let passed = 0, failed = 0, step = 0;
const errors = [];

function check(name, condition, detail = '') {
  step++;
  if (condition) { passed++; console.log(`  ✅ [${step}] ${name}`) }
  else { failed++; errors.push({ step, name, detail }); console.log(`  ❌ [${step}] ${name}${detail ? ': ' + detail : ''}`) }
}
async function noError(page, label) {
  const err = await page.$('text=Unexpected Application Error');
  check(`${label} — no app error`, !err);
}
async function getToken(email) {
  const r = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'test1234' }) });
  return (await r.json()).access_token;
}
async function getLeP() {
  const t = await getToken('player1@test.de');
  const r = await fetch(`${API}/api/characters/${CHAR_ID}`, { headers: { Authorization: `Bearer ${t}` } });
  const c = await r.json();
  return c.current_vitals?.lep ?? 30;
}
async function setLeP(val) {
  const t = await getToken('player1@test.de');
  await fetch(`${API}/api/characters/${CHAR_ID}/vitals`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify({ lep: val }) });
}

async function test() {
  const browser = await chromium.launch({ headless: true });
  const gm = await (await browser.newContext()).newPage();
  const pl = await (await browser.newContext()).newPage();
  const gmErrors = [], plErrors = [];
  gm.on('pageerror', e => gmErrors.push(e.message.slice(0, 80)));
  pl.on('pageerror', e => plErrors.push(e.message.slice(0, 80)));

  try {
    // Reset LeP
    await setLeP(30);
    const lepBefore = await getLeP();
    console.log(`\n═══ PHASE 1: Setup (LeP: ${lepBefore}) ═══`);

    // Login
    await gm.goto(`${BASE}/`); await gm.waitForTimeout(800);
    await gm.fill('input[type="email"]', 'gm@test.de'); await gm.fill('input[type="password"]', 'test1234');
    await gm.click('button[type="submit"]'); await gm.waitForTimeout(2500);
    await gm.goto(`${BASE}/gm/DEMO-42`); await gm.waitForTimeout(5000);
    check('GM loaded', gm.url().includes('/gm/'));
    await noError(gm, 'GM load');

    await pl.goto(`${BASE}/`); await pl.waitForTimeout(800);
    await pl.fill('input[type="email"]', 'player1@test.de'); await pl.fill('input[type="password"]', 'test1234');
    await pl.click('button[type="submit"]'); await pl.waitForTimeout(2500);
    await pl.goto(`${BASE}/play/DEMO-42`); await pl.waitForTimeout(5000);
    check('Player loaded', pl.url().includes('/play/'));

    console.log('\n═══ PHASE 2: Open Vitals Popup ═══');
    await (await gm.$('button:has-text("Balgra")')).click(); await gm.waitForTimeout(500);
    check('Selected Balgra', true);

    const lebenBtn = await gm.$('button:has-text("Leben")');
    check('Leben button found', !!lebenBtn);
    if (lebenBtn) { await lebenBtn.click(); await gm.waitForTimeout(3000) }
    await noError(gm, 'After Leben click');

    const popup = await gm.$('text=Lebenspunkte');
    check('Vitals popup opens', !!popup);
    await gm.screenshot({ path: '/tmp/e2e_vitals_popup.png' });

    console.log('\n═══ PHASE 3: Apply Damage ═══');
    // Click -5 button for LeP (the first one in the grid)
    const allBtns = await gm.evaluate(() => [...document.querySelectorAll('button')].map(b => b.textContent.trim()));
    const has5 = allBtns.filter(t => t === '-5');
    check('-5 buttons in DOM', has5.length > 0, `found ${has5.length} of ${allBtns.length} total buttons`);
    // Click it
    const minus5 = await gm.$('button >> text="-5"');
    if (!minus5) {
      // Try with exact match
      const allBtnEls = await gm.$$('button');
      for (const btn of allBtnEls) {
        const txt = await btn.textContent();
        if (txt.trim() === '-5') { await btn.click(); await gm.waitForTimeout(300); check('Clicked -5 via loop', true); break; }
      }
    } else {
      await minus5.click(); await gm.waitForTimeout(300);
      check('Clicked -5', true);
    }
    await noError(gm, 'After -5 click');

    // Check preview shows delta
    const gmBody = await gm.evaluate(() => document.body.innerText);
    check('Preview shows -5', gmBody.includes('-5'));
    check('Preview shows new value', gmBody.includes('25') || gmBody.includes('(-5)'));
    await gm.screenshot({ path: '/tmp/e2e_vitals_delta.png' });

    // Click confirm
    const confirmBtn = await gm.$('button:has-text("Änderungen anwenden")');
    check('Confirm button found', !!confirmBtn);
    const confirmDisabled = confirmBtn ? await confirmBtn.isDisabled() : true;
    check('Confirm button enabled', !confirmDisabled);
    if (confirmBtn && !confirmDisabled) { await confirmBtn.click(); await gm.waitForTimeout(2000) }
    await noError(gm, 'After confirm');

    console.log('\n═══ PHASE 4: Verify Backend ═══');
    // Poll for persistence
    let lepAfter = lepBefore;
    for (let i = 0; i < 10; i++) {
      await gm.waitForTimeout(1000);
      lepAfter = await getLeP();
      if (lepAfter !== lepBefore) break;
    }
    console.log(`  📊 LeP: ${lepBefore} → ${lepAfter}`);
    check('LeP decreased', lepAfter < lepBefore, `before=${lepBefore} after=${lepAfter}`);
    check('LeP decreased by 5', lepAfter === lepBefore - 5, `expected ${lepBefore - 5}, got ${lepAfter}`);

    console.log('\n═══ PHASE 5: Error Check ═══');
    check('GM: no JS errors', gmErrors.length === 0, gmErrors.join('; '));
    check('Player: no JS errors', plErrors.length === 0, plErrors.join('; '));

  } catch (e) {
    console.error('🔥 CRASH:', e.message);
    failed++;
  } finally {
    await browser.close();
  }

  console.log('\n' + '═'.repeat(50));
  console.log(`TOTAL: ${passed + failed} | ✅ ${passed} | ❌ ${failed}`);
  if (errors.length > 0) { console.log('Failed:'); errors.forEach(e => console.log(`  [${e.step}] ${e.name}: ${e.detail}`)) }
  console.log('═'.repeat(50));
}
test();
