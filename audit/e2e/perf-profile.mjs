// Phase 6, item 27: where the lite build's launch time goes, and how much the biggest candidate change would save.
//   A. Inclusive CPU time (the function and everything it calls) for the main launch steps, from one sampled profile of
//      a 4x-slowed lite cold start on Today.
//   B. The same cold start opened on screens that do not need the week plan (Check, Report), median of 5 at 4x. The
//      difference from Today is a measured stand-in for "show Today first and build the week after", without changing
//      the app. Made-up profile (the same as perf.mjs).
// Results: audit/results/perf-profile.json.
import fs from 'node:fs';
import path from 'node:path';
import { buildSite, serve, launch, phone, ROOT } from './site.mjs';
import { seededPage } from './screens.mjs';

const RUNS = Number(process.env.PERF_RUNS || 5);
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const WATCH = ['appBoot', 'loadData', 'appNormalizeData', 'buildMatcher', 'appAssembleRecipes', 'appPrebuildAdapted', 'annotateCuisines', 'appRender', 'renderLiteTodayScreen', 'weekGet', 'buildWeekPlan', 'buildPlan', 'uiPlanFor', 'checkRecipe', 'strictCheck', 'portionCheck', 'recipeTotals', 'tagText', 'tagTextUncached', 'matchSegment', 'fires', 'scoreRecipe'];
buildSite();
const srv = await serve();
const browser = await launch();
const out = { cpuSlowdown: 4, inclusiveMs: {}, totalSampledMs: 0, firstScreenByStart: {} };
const firstScreen = async (hash) => {
  const ctx = await phone(browser);
  // The same marker as perf.mjs. The document element does not exist yet when this runs, so the observer is attached
  // at DOMContentLoaded, which also checks whether the heading is already there.
  await ctx.addInitScript(() => {
    window.__pm = {};
    const hit = () => { if (!window.__pm.seen && document.querySelector('main h1, #app h1')) { window.__pm.seen = true; requestAnimationFrame(() => requestAnimationFrame(() => { window.__pm.first = performance.now(); })); return true; } return false; };
    const mo = new MutationObserver(() => { if (hit()) mo.disconnect(); });
    document.addEventListener('DOMContentLoaded', () => { if (!hit()) mo.observe(document.body, { childList: true, subtree: true }); });
  });
  const page = await seededPage(ctx, 'lite');
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto(`${srv.origin}/Peace-Meal-Full/lite/${hash}`, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__pm && window.__pm.first, null, { timeout: 180000, polling: 50 });
  const ms = await page.evaluate(() => window.__pm.first);
  await ctx.close();
  return ms;
};
try {
  // A. one profile, inclusive time
  {
    const ctx = await phone(browser);
    const page = await seededPage(ctx, 'lite');
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start');
    await page.goto(`${srv.origin}/Peace-Meal-Full/lite/#/today`);
    await page.waitForSelector('main h1, #app h1', { timeout: 180000 }); await page.waitForTimeout(300);
    const { profile } = await cdp.send('Profiler.stop');
    await ctx.close();
    const parent = new Map(); const byId = new Map(profile.nodes.map(n => [n.id, n]));
    for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
    const incl = Object.fromEntries(WATCH.map(f => [f, 0]));
    let total = 0;
    profile.samples.forEach((id, i) => {
      const dt = (profile.timeDeltas[i] || 0) / 1000; total += dt;
      const seen = new Set();
      for (let n = id; n != null; n = parent.get(n)) { const f = byId.get(n).callFrame.functionName; if (f in incl && !seen.has(f)) { incl[f] += dt; seen.add(f); } }
    });
    out.totalSampledMs = Math.round(total);
    out.inclusiveMs = Object.fromEntries(Object.entries(incl).map(([k, v]) => [k, Math.round(v)]));
    console.log('A. inclusive ms at 4x:', JSON.stringify(out.inclusiveMs), 'of', out.totalSampledMs, 'sampled');
  }
  // B. first screen by start screen, median of RUNS at 4x
  for (const hash of ['#/today', '#/check', '#/report']) {
    const all = []; for (let i = 0; i < RUNS; i++) all.push(Math.round(await firstScreen(hash)));
    out.firstScreenByStart[hash] = { medianMs: median(all), all };
    console.log(`B. lite opened on ${hash}: median ${median(all)} ms (${all.join(', ')})`);
  }
} finally { await browser.close(); await srv.close(); }
fs.writeFileSync(path.join(ROOT, 'audit/results/perf-profile.json'), JSON.stringify(out, null, 1) + '\n');
