import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const out = 'output/sar-board-refresh'; mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.addInitScript(() => localStorage.setItem('sar-facility-guide-board-v1', 'done'));
const page = await context.newPage(), errors = [], modelCalls = [];
page.on('pageerror', error => errors.push(error.message));
await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('/chat/completions')) modelCalls.push(url.pathname);
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.fulfill({ status: 200, body: '', headers: { 'access-control-allow-origin': '*' } });
});
const refresh = () => page.getByRole('button', { name: '刷新布告板', exact: true });
const view = name => page.evaluate(name => window.facilityQA.setView(name), name);
try {
    await page.goto(`${process.env.SAR_QA_URL || 'http://127.0.0.1:5173'}/test/fixtures/sar-facilities.html?facility=board`);
    await page.waitForFunction(() => window.facilityQA?.os.characters.length >= 60);
    await page.evaluate(async () => {
        const os = window.facilityQA.os;
        for (const [id, activityMode] of [['qa-facility-0', 'scheduled'], ['qa-facility-1', 'manual']])
            os.updateCharacter(id, current => ({ vrState: { ...current.vrState, enabled: true, activityMode } }));
        Math.random = () => .9;
    });
    await page.waitForFunction(() => window.facilityQA.os.characters.find(char => char.id === 'qa-facility-0').vrState.enabled);
    await refresh().click(); await page.getByRole('status').filter({ hasText: '来过了' }).waitFor();
    assert.equal(await page.evaluate(() => window.facilityTripCalls?.length || 0), 0, 'default never invokes a character');
    await refresh().click(); await refresh().waitFor();
    await page.screenshot({ path: `${out}/local-npcs.png`, animations: 'disabled' });
    await view('settings');
    const toggle = page.getByRole('switch', { name: '布告板使用模型', exact: true });
    assert.equal(await toggle.getAttribute('aria-checked'), 'false');
    await toggle.click(); assert.equal(await toggle.getAttribute('aria-checked'), 'true');
    await page.screenshot({ path: `${out}/explicit-opt-in.png`, animations: 'disabled' });
    await view('board');
    await page.evaluate(() => { window.facilityTripHandler = () => new Promise(resolve => { window.finishBoardTrip = resolve; }); });
    await refresh().evaluate(button => { button.click(); button.click(); });
    await page.waitForFunction(() => window.finishBoardTrip);
    assert(await refresh().isDisabled());
    assert.deepEqual(await page.evaluate(() => window.facilityTripCalls), [{ id: 'qa-facility-0', mode: 'market' }]);
    await page.evaluate(() => window.finishBoardTrip({ ok: true }));
    await page.getByRole('status').filter({ hasText: 'Sully来过了' }).waitFor();
    await view('settings'); await toggle.click(); await view('board');
    await refresh().click();
    assert.equal(await page.evaluate(() => window.facilityTripCalls.length), 1, 'disabling immediately gates subsequent refreshes');
    await page.setViewportSize({ width: 320, height: 640 });
    await page.screenshot({ path: `${out}/board-320.png`, animations: 'disabled' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []); assert.deepEqual(modelCalls, []);
    writeFileSync(`${out}/report.json`, JSON.stringify({ defaultLocalOnly: true, explicitOptIn: true, manualCharactersExcluded: true, doubleClickGuard: true, errors, modelCalls }, null, 2));
    console.log('Board refresh passed: default local NPCs, explicit model setting, eligible visitor and double-click guard.');
} finally { await browser.close(); }
