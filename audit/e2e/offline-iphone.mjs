// Phase 4, items 20 and 21.
//   20. service worker registers; the app reloads with no network; a changed build shows "Update ready, tap to reload"
//       and the tap switches to it; the lite and full offline copies both survive an update of one of them.
//   21. iPhone Safari tab (navigator.standalone false) against the Home Screen app (true): the Add to Home Screen guide
//       only in the tab; a "Not saved safely" banner only in the tab; "Move my data" end to end (Save a backup in the tab,
//       Bring my data in the Home Screen app, which on an iPhone has its own storage: a separate browser context here).
// Results: audit/results/offline-iphone.json.
import fs from 'node:fs';
import path from 'node:path';
import { buildSite, serve, launch, phone, STORE_KEY, TMP, ROOT } from './site.mjs';

const results = [];
const rec = (build, name, pass, detail = {}) => { results.push({ build, name, pass: !!pass, ...detail }); console.log(`${pass ? 'PASS' : 'FAIL'} [${build}] ${name} ${Object.keys(detail).length ? JSON.stringify(detail) : ''}`); };
const wait = (p, ms) => p.waitForTimeout(ms);
const profile = name => JSON.stringify({ version: 2, created: '2026-09-01T12:00:00.000Z', activePerson: 'p1', people: [{ id: 'p1', name, adult: true, sex: 'female', age: 70, modules: ['celiac'], allergens: ['allergen-peanut'], allergens_other: [], preferences: { avoid_tags: [], avoid_terms: [], patterns: [] }, setup_complete: true }], log: [{ id: 'l1', date: '2026-09-29', person: 'p1', meal: 'day', symptoms: {}, notes: 'Feeling fine', fine: true, at: '2026-09-29T12:00:00.000Z', logged_at: '2026-09-29T12:00:00.000Z' }], diary: [], weights: [] });

let stamp1 = 'aaaaaaaaaaaa', stamp2 = 'bbbbbbbbbbbb';
buildSite({ stamp: stamp1 });
const srv = await serve();
const browser = await launch();
const url = (b, h = '') => `${srv.origin}/Peace-Meal-Full/${b}/${h}`;
try {
  // ---------------------------------------------------------------- 20
  for (const build of ['lite', 'full']) {
    buildSite({ stamp: stamp1 });
    const ctx = await phone(browser, { ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36' });
    await ctx.addInitScript(([k, v]) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, v); localStorage.setItem('peace-meal-lite:home-screen-guide', '1'); localStorage.setItem('peace-meal-full:home-screen-guide', '1'); } catch { /* ignore */ } }, [STORE_KEY[build], profile('Test Person')]);
    const page = await ctx.newPage();
    await page.goto(url(build)); await wait(page, 2500);
    const reg = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return { scope: r.scope, active: !!r.active, script: r.active && r.active.scriptURL }; }).catch(e => ({ error: e.message }));
    const keys0 = await page.evaluate(() => caches.keys());
    rec(build, '20.1 the service worker registers and caches this build', reg.active && keys0.includes(`pm-pages-${build}-${stamp1}`), { scope: reg.scope, caches: keys0 });
    await page.reload(); await wait(page, 1500);   // now controlled
    srv.state.offline = true;
    await page.reload().catch(() => {}); await wait(page, 2500);
    const offlineOk = await page.evaluate(() => ({ title: document.title, text: document.body.innerText.length, name: document.body.innerText.includes('Test Person') }));
    rec(build, '20.2 with no network, a reload opens the app from its offline copy', offlineOk.text > 200 && offlineOk.name, offlineOk);
    srv.state.offline = false;
    // Open the other build once too, so both offline copies exist in the shared cache store.
    const other = build === 'lite' ? 'full' : 'lite';
    const p2 = await ctx.newPage(); await p2.goto(url(other)); await wait(p2, 2500); await p2.close();
    // A changed build: new stamp, same URLs.
    buildSite({ stamp: stamp2 });
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r && r.update())).catch(() => {});
    let shown = false;
    for (let i = 0; i < 20 && !shown; i++) { await wait(page, 500); shown = !!(await page.$('#update-ready')); }
    rec(build, '20.3 a changed build shows "Update ready, tap to reload"', shown);
    if (shown) {
      await Promise.all([page.waitForNavigation({ timeout: 10000 }).catch(() => null), page.click('#update-ready')]);
      await wait(page, 2500);
      const after = await page.evaluate(async () => ({ keys: await caches.keys(), text: document.body.innerText.length }));
      rec(build, '20.4 the tap switches to the new build and reloads, data intact', after.keys.includes(`pm-pages-${build}-${stamp2}`) && !after.keys.includes(`pm-pages-${build}-${stamp1}`) && after.text > 200, { caches: after.keys });
      rec(build, `20.5 the ${other} build's offline copy survives this build's update`, after.keys.some(k => k.startsWith(`pm-pages-${other}-`)), { caches: after.keys });
    }
    await ctx.close();
  }
  buildSite({ stamp: stamp1 });
  // ---------------------------------------------------------------- 21
  for (const build of ['lite', 'full']) {
    const tab = await phone(browser, { standalone: false });
    await tab.addInitScript(([k, v]) => { try { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem(k, v); } } catch { /* ignore */ } }, [STORE_KEY[build], profile('Tab Person')]);
    const tp = await tab.newPage(); tp.on('dialog', d => d.accept());
    await tp.goto(url(build)); await wait(tp, 2500);
    const guideTab = await tp.$('#install-guide');
    const tabText = await tp.evaluate(() => document.body.innerText);
    rec(build, '21.1 in a Safari tab, the Add to Home Screen guide shows', !!guideTab);
    rec(build, '21.2 in a Safari tab, a "Not saved safely" banner warns that data here is kept apart', /not saved safely/i.test(tabText), { note: 'the code has no such banner; the guide shows once and Settings has a line' });
    // Move my data: Save a backup from the guide
    const saveBtn = await tp.$('[data-install-backup]');
    rec(build, '21.3 the guide offers "Save a backup" when there is data in the tab', !!saveBtn);
    let file = null;
    if (saveBtn) {
      const [dl] = await Promise.all([tp.waitForEvent('download', { timeout: 8000 }).catch(() => null), saveBtn.click()]);
      if (dl) { file = path.join(TMP, `move-${build}.json`); await dl.saveAs(file); }
    }
    rec(build, '21.4 "Save a backup" gives a file', !!file);
    await tp.click('[data-install-done]').catch(() => {}); await wait(tp, 500);
    await tp.reload(); await wait(tp, 2000);
    rec(build, '21.5 the guide shows once: not again after "Got it"', !(await tp.$('#install-guide')));
    await tab.close();
    // The Home Screen app: its own storage, standalone true
    const home = await phone(browser, { standalone: true });
    const hp = await home.newPage(); hp.on('dialog', d => d.accept());
    await hp.goto(url(build)); await wait(hp, 2500);
    rec(build, '21.6 in the Home Screen app, no Add to Home Screen guide', !(await hp.$('#install-guide')));
    const imp = await hp.$('#welcome-import');
    rec(build, '21.7 the Home Screen app\'s first screen has "Bring my data"', !!imp);
    if (imp && file) {
      await imp.setInputFiles(file); await wait(hp, 2500);
      const saved = await hp.evaluate(k => localStorage.getItem(k), STORE_KEY[build]);
      const shownName = await hp.evaluate(() => document.body.innerText.includes('Tab Person'));
      rec(build, '21.8 "Bring my data" brings the tab\'s data into the Home Screen app', saved && saved.includes('Tab Person') && shownName);
    }
    const setText = await (async () => { await hp.goto(url(build, '#/settings')); await wait(hp, 1200); return hp.evaluate(() => document.body.innerText); })();
    rec(build, '21.9 the Home Screen app does not show the Safari-tab line in Settings', !/open in a Safari tab/i.test(setText));
    await home.close();
  }
} finally { await browser.close(); await srv.close(); buildSite(); }
fs.writeFileSync(path.join(ROOT, 'audit/results/offline-iphone.json'), JSON.stringify(results, null, 1) + '\n');
const failed = results.filter(r => !r.pass);
console.log(`${results.length - failed.length} of ${results.length} checks pass`);
if (failed.length) process.exitCode = 1;
