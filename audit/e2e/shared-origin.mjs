// Phase 7, item 30: every GitHub Pages site under mchoisington.github.io is one browser origin. A page from any other
// project site of the same account (or a script that page loads from a third party) runs with the same rights as
// Peace Meal. This script proves what such a page can do, in Chromium, with made-up data: the app is served at
// /Peace-Meal-Full/ and an unrelated page at /Other-Project/ on the same local origin.
//   1. read the stored health data (both builds' keys)
//   2. change it (a restriction removed) so the app shows the changed data
//   3. replace the app's offline copy in Cache Storage, so the next launch runs a page the other site wrote
//   4. what it cannot do: control /Peace-Meal-Full/ with its own service worker
// Results: audit/results/shared-origin.json.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { buildSite, launch, phone, ROOT, SITE, STORE_KEY } from './site.mjs';
import { sampleProfile } from './screens.mjs';

buildSite();
const OTHER = '<!doctype html><title>Another project</title><p>An unrelated page on the same github.io origin.</p>';
const OTHER_SW = "self.addEventListener('fetch', e => {});";
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/Other-Project/' || p === '/Other-Project/index.html') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(OTHER); return; }
  if (p === '/Other-Project/sw.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(OTHER_SW); return; }
  let f = path.join(SITE, p); if (p.endsWith('/')) f = path.join(f, 'index.html');
  if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' }); fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await launch();
const out = {};
try {
  const ctx = await phone(browser);
  await ctx.addInitScript(([k, v]) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, v); localStorage.setItem('peace-meal-lite:home-screen-guide', '1'); } catch { /* ignore */ } }, [STORE_KEY.lite, sampleProfile('lite')]);
  const app = await ctx.newPage();
  await app.goto(`${origin}/Peace-Meal-Full/lite/`); await app.waitForTimeout(3000);
  await app.evaluate(() => Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(r, 15000))]));
  await app.reload(); await app.waitForTimeout(2500);
  const other = await ctx.newPage();
  await other.goto(`${origin}/Other-Project/`);
  // 1. read
  out.read = await other.evaluate(() => {
    const keys = Object.keys(localStorage);
    const p = JSON.parse(localStorage.getItem('peace-meal-lite:v1') || 'null');
    const person = p && p.people && p.people[0];
    return { keysVisible: keys.filter(k => k.startsWith('peace-meal') || k.startsWith('sn-')), person: person && { name: person.name, age: person.age, conditions: person.modules, allergies: person.allergens }, symptomEntries: p ? (p.log || []).length : 0, weights: p ? (p.weights || []).length : 0 };
  });
  console.log('1 another page on the origin reads:', JSON.stringify(out.read));
  // 2. change: remove the peanut allergy
  await other.evaluate(() => { const k = 'peace-meal-lite:v1'; const p = JSON.parse(localStorage.getItem(k)); p.people[0].allergens = []; localStorage.setItem(k, JSON.stringify(p)); });
  await app.goto(`${origin}/Peace-Meal-Full/lite/#/check`); await app.reload(); await app.waitForTimeout(2500);
  await app.fill('#check-text', 'roasted peanuts, salt'); await app.click('#check-run'); await app.waitForTimeout(600);
  out.changed = { peanutLabelAfterChange: (await app.$eval('#check-result', e => e.innerText)).replace(/\s+/g, ' ').slice(0, 100) };
  console.log('2 after the other page removed the allergy, the app says:', out.changed.peanutLabelAfterChange);
  // 3. replace the offline copy
  out.cache = await other.evaluate(async () => {
    const keys = await caches.keys();
    const mine = keys.find(k => k.startsWith('pm-pages-lite-'));
    if (!mine) return { keys, replaced: false };
    const c = await caches.open(mine);
    const page = new Response('<!doctype html><title>Peace Meal for one</title><h1>This is not Peace Meal</h1><p>Written by another page on the same origin.</p>', { headers: { 'content-type': 'text/html' } });
    for (const u of ['/Peace-Meal-Full/lite/', '/Peace-Meal-Full/lite/index.html']) await c.put(new Request(location.origin + u), page.clone());
    return { keys, replaced: true };
  });
  await app.goto(`${origin}/Peace-Meal-Full/lite/`); await app.waitForTimeout(2000);
  out.cache.nextLaunchShows = (await app.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 90);
  console.log('3 caches seen by the other page:', out.cache.keys.join(', '), '| next launch shows:', out.cache.nextLaunchShows);
  // 4. a service worker from the other project cannot take over the app's pages (GitHub Pages cannot send the
  //    Service-Worker-Allowed header that would widen its scope)
  out.worker = await other.evaluate(async () => {
    try { await navigator.serviceWorker.register('/Other-Project/sw.js', { scope: '/Peace-Meal-Full/' }); return 'registered over the app (bad)'; } catch (e) { return 'refused: ' + e.name; }
  });
  console.log('4 other project registering a worker over /Peace-Meal-Full/:', out.worker);
  await ctx.close();
} finally { await browser.close(); await new Promise(r => server.close(r)); }
fs.writeFileSync(path.join(ROOT, 'audit/results/shared-origin.json'), JSON.stringify(out, null, 1) + '\n');
