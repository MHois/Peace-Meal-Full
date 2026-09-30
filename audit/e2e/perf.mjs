// Phase 6, items 25 and 27: cold start of both builds in Chromium at phone size, median of 9, at 1x, 4x, and 6x CPU
// slowdown (a mid-range and an older phone): time to the first screen, time for the first tap to show the next screen,
// and JavaScript memory after launch. Then one CPU profile of a 4x cold start per build, to see where launch time goes,
// and a size breakdown of each file by content. WebKit is not installed here, so there is no WebKit number.
// Every run is a new browser context: nothing cached, no service worker. Results: audit/results/perf.json.
import fs from 'node:fs';
import path from 'node:path';
import { buildSite, serve, launch, phone, ROOT } from './site.mjs';
import { seededPage } from './screens.mjs';

const RUNS = Number(process.env.PERF_RUNS || 9);
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const FIRST = { lite: { hash: '#/today', tapTo: 'recipes', heading: 'Recipes' }, full: { hash: '#/home', tapTo: 'recipes', heading: 'Recipes' } };
buildSite();
const srv = await serve();
const browser = await launch();
const out = { runs: RUNS, cold: [], profile: {}, sizes: {} };
try {
  for (const build of ['lite', 'full']) for (const rate of [1, 4, 6]) {
    const firsts = [], taps = [], mems = [], fcps = [];
    for (let i = 0; i < RUNS; i++) {
      const ctx = await phone(browser);
      // Mark the moment the first screen's heading is on the page and painted.
      await ctx.addInitScript(() => {
        window.__pm = {};
        const done = () => requestAnimationFrame(() => requestAnimationFrame(() => { window.__pm.first = performance.now(); }));
        const mo = new MutationObserver(() => { if (!window.__pm.seen && document.querySelector('main h1, #app h1')) { window.__pm.seen = true; mo.disconnect(); done(); } });
        document.addEventListener('DOMContentLoaded', () => mo.observe(document.body, { childList: true, subtree: true }));
        mo.observe(document.documentElement, { childList: true, subtree: true });
      });
      const page = await seededPage(ctx, build);
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate });
      await cdp.send('Performance.enable');
      await page.goto(`${srv.origin}/Peace-Meal-Full/${build}/${FIRST[build].hash}`, { waitUntil: 'commit' });
      await page.waitForFunction(() => window.__pm && window.__pm.first, null, { timeout: 120000, polling: 50 });
      const first = await page.evaluate(() => window.__pm.first);
      const fcp = await page.evaluate(() => (performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || null);
      await page.waitForTimeout(1000);
      const metrics = (await cdp.send('Performance.getMetrics')).metrics;
      const heap = (metrics.find(m => m.name === 'JSHeapUsedSize') || {}).value;
      // First tap: the Recipes tab, until its heading is painted.
      const tap = await page.evaluate(({ to, heading }) => new Promise(res => {
        const a = document.querySelector(`a[href="#/${to}"]`);
        const t0 = performance.now();
        if (a) a.click(); else location.hash = '#/' + to;
        const check = () => { const h = document.querySelector('main h1, #app h1'); if (h && h.textContent.trim().startsWith(heading)) requestAnimationFrame(() => requestAnimationFrame(() => res(performance.now() - t0))); else setTimeout(check, 10); };
        check();
      }), { to: FIRST[build].tapTo, heading: FIRST[build].heading });
      firsts.push(first); taps.push(tap); mems.push(heap / 1048576); if (fcp) fcps.push(fcp);
      await ctx.close();
    }
    const row = { build, cpuSlowdown: rate, firstScreenMs: Math.round(median(firsts)), firstContentfulPaintMs: fcps.length ? Math.round(median(fcps)) : null, firstTapMs: Math.round(median(taps)), heapMB: Math.round(median(mems) * 10) / 10, all: { first: firsts.map(Math.round), tap: taps.map(Math.round) } };
    out.cold.push(row); console.log(JSON.stringify({ ...row, all: undefined }));
  }
  // Where launch time goes: one sampled CPU profile of a 4x cold start per build, self time by function.
  for (const build of ['lite', 'full']) {
    const ctx = await phone(browser);
    const page = await seededPage(ctx, build);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start');
    await page.goto(`${srv.origin}/Peace-Meal-Full/${build}/${FIRST[build].hash}`);
    await page.waitForSelector('main h1, #app h1', { timeout: 120000 }); await page.waitForTimeout(500);
    const { profile } = await cdp.send('Profiler.stop');
    const byId = new Map(profile.nodes.map(n => [n.id, n]));
    const self = new Map();
    const dts = profile.timeDeltas; let total = 0;
    profile.samples.forEach((id, i) => { const n = byId.get(id); const k = n.callFrame.functionName || `(${n.callFrame.url ? 'anonymous' : n.callFrame.functionName || 'program'})`; const t = (dts[i] || 0) / 1000; total += t; self.set(k, (self.get(k) || 0) + t); });
    out.profile[build] = { totalMs: Math.round(total), topSelfMs: [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([f, ms]) => ({ fn: f, ms: Math.round(ms) })) };
    console.log(build, JSON.stringify(out.profile[build]));
    await ctx.close();
  }
} finally { await browser.close(); await srv.close(); }
// Size breakdown of the single-file builds by content.
for (const [build, file] of [['lite', 'dist/peace-meal-lite.html'], ['full', 'dist/nutrition-app.html']]) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const sizes = { total: Buffer.byteLength(html) };
  const dataStart = html.indexOf('window.__APP_DATA__ = ');
  const dataEnd = html.indexOf(';</script>', dataStart);
  const data = JSON.parse(html.slice(dataStart + 'window.__APP_DATA__ = '.length, dataEnd).replace(/<\\\/script/gi, '</script'));
  for (const [k, v] of Object.entries(data)) sizes['data: ' + k] = Buffer.byteLength(JSON.stringify(v));
  const wb = html.match(/<script type="application\/json" id="pm-deferred-wikibooks">([\s\S]*?)<\/script>/);
  if (wb) sizes['deferred Wikibooks JSON (not run at launch)'] = Buffer.byteLength(wb[1]);
  const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]);
  sizes['fonts (base64 in CSS)'] = styles.reduce((n, s) => n + [...s.matchAll(/url\(data:font\/woff2;base64,[^)]+\)/g)].reduce((a, m) => a + m[0].length, 0), 0);
  sizes['CSS without fonts'] = styles.reduce((n, s) => n + Buffer.byteLength(s), 0) - sizes['fonts (base64 in CSS)'];
  const js = html.match(/<script>\n\(function\(\)\{([\s\S]*?)\}\)\(\);\n<\/script>/);
  sizes['app code (JavaScript)'] = js ? Buffer.byteLength(js[1]) : null;
  out.sizes[build] = sizes;
}
fs.writeFileSync(path.join(ROOT, 'audit/results/perf.json'), JSON.stringify(out, null, 1) + '\n');
for (const [b, s] of Object.entries(out.sizes)) console.log(b, Object.entries(s).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${(v / 1024).toFixed(0)} KB`).join('; '));
