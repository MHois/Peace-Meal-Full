// Phase 5, item 24, measured against the two WCAG criteria separately (a11y.mjs also records the harsher combination
// of both at once):
//   A. 1.4.10 Reflow: a 320 CSS px wide screen at the app's own text size (lite starts with large text on). Does the
//      page scroll sideways? Content inside its own sideways-scrolling box (allowed for data tables) is not counted.
//   B. 1.4.4 Resize text: the phone's width (390 px) with the text doubled. The app sizes text in rem, so doubling the
//      root font size doubles every text size. Does the page scroll sideways, and is any text cut off (a box that
//      hides what does not fit)?
//   C. 1.4.3 Contrast: axe-core's color-contrast rule alone, light and dark, with the number of places axe could not
//      decide (text over an image or a gradient), which need a person to check.
// Results: audit/results/a11y-reflow.json.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildSite, serve, launch, phone, ROOT } from './site.mjs';
import { SCREENS, seededPage } from './screens.mjs';

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');
// PARTS=B (for example) reruns one part and keeps the others from the last run.
const PARTS = (process.env.PARTS || 'ABC').toUpperCase();
const FILE = path.join(ROOT, 'audit/results/a11y-reflow.json');
const prev = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const out = { reflow320: PARTS.includes('A') ? [] : prev.reflow320 || [], text200: PARTS.includes('B') ? [] : prev.text200 || [], contrast: PARTS.includes('C') ? [] : prev.contrast || [] };
buildSite();
const srv = await serve();
const browser = await launch();
const url = (b, s) => `${srv.origin}/Peace-Meal-Full/${b}/#/${s}`;
const measure = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => {
  const W = document.documentElement.clientWidth;
  const inScroller = e => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if ((o === 'auto' || o === 'scroll') && p.clientWidth <= W) return true; } return false; };
  const label = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/)[0] : '');
  const wide = [...document.querySelectorAll('body *')].filter(e => { const b = e.getBoundingClientRect(); return b.width > 0 && b.right > W + 1 && getComputedStyle(e).position !== 'fixed' && !inScroller(e); });
  // outermost offenders only
  const top = wide.filter(e => !wide.includes(e.parentElement)).slice(0, 6).map(e => `${label(e)} (${Math.round(e.getBoundingClientRect().right)}px)`);
  // Screen-reader-only text (.visually-hidden) is clipped on purpose and is not counted.
  const cut = [...document.querySelectorAll('body *')].filter(e => { const cs = getComputedStyle(e); return !e.closest('.visually-hidden') && /hidden|clip/.test(cs.overflowX + cs.overflow) && e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0 && (e.innerText || '').trim().length > 0 && cs.textOverflow !== 'ellipsis'; }).slice(0, 6).map(e => `${label(e)} "${(e.innerText || '').trim().slice(0, 30)}"`);
  const ellipsis = [...document.querySelectorAll('body *')].filter(e => getComputedStyle(e).textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1).slice(0, 6).map(e => `${label(e)} "${(e.innerText || '').trim().slice(0, 30)}"`);
  res({ width: W, scrollWidth: document.documentElement.scrollWidth, sideways: document.documentElement.scrollWidth > W + 1, offenders: top, textCutOff: cut, textShortenedWithDots: ellipsis });
})));
try {
  // A. 320 px, the app's own text size
  if (PARTS.includes('A')) for (const build of ['lite', 'full']) {
    const ctx = await phone(browser, { extra: { viewport: { width: 320, height: 640 } } });
    const page = await seededPage(ctx, build);
    for (const s of SCREENS[build]) {
      await page.goto(url(build, s)); await page.waitForTimeout(s === 'week' || s === 'grocery' ? 2500 : 1200);
      const base = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
      out.reflow320.push({ build, screen: s, rootFont: base, ...(await page.evaluate(measure)) });
    }
    await ctx.close();
  }
  // B. 390 px, text doubled
  if (PARTS.includes('B')) for (const build of ['lite', 'full']) {
    const ctx = await phone(browser);
    const page = await seededPage(ctx, build);
    for (const s of SCREENS[build]) {
      await page.goto(url(build, s)); await page.waitForTimeout(s === 'week' || s === 'grocery' ? 2500 : 1200);
      // The app does not reload between screens, so the doubled size from the last screen is cleared first.
      const base = await page.evaluate(() => { document.documentElement.style.fontSize = ''; const px = parseFloat(getComputedStyle(document.documentElement).fontSize); document.documentElement.style.fontSize = (px * 2) + 'px'; return px; });
      out.text200.push({ build, screen: s, rootFontFrom: base, rootFontTo: base * 2, ...(await page.evaluate(measure)) });
    }
    await ctx.close();
  }
  // C. contrast
  if (PARTS.includes('C')) for (const build of ['lite', 'full']) for (const dark of [false, true]) {
    const ctx = await phone(browser, { dark });
    const page = await seededPage(ctx, build);
    for (const s of SCREENS[build]) {
      await page.goto(url(build, s)); await page.waitForTimeout(s === 'week' || s === 'grocery' ? 2500 : 1200);
      if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
      const r = await page.evaluate(() => window.axe.run(document, { runOnly: { type: 'rule', values: ['color-contrast'] }, resultTypes: ['violations', 'incomplete', 'passes'] }));
      const inc = (r.incomplete[0] || { nodes: [] }).nodes;
      out.contrast.push({ build, theme: dark ? 'dark' : 'light', screen: s, passes: (r.passes[0] || { nodes: [] }).nodes.length, violations: (r.violations[0] || { nodes: [] }).nodes.length, undecided: inc.length, undecidedWhy: [...new Set(inc.map(n => ((n.any[0] || {}).message || '').replace(/\s+/g, ' ').slice(0, 80)))].slice(0, 3), undecidedSample: inc.slice(0, 2).map(n => n.target.join(' ')) });
    }
    await ctx.close();
  }
} finally { await browser.close(); await srv.close(); }
fs.writeFileSync(FILE, JSON.stringify(out, null, 1) + '\n');
const list = rows => rows.filter(r => r.sideways).map(r => `${r.build}/${r.screen} (${r.scrollWidth}px)`);
console.log('A. 320 px, own text size, sideways scrolling:', list(out.reflow320).join(', ') || 'none');
console.log('B. text doubled at 390 px, sideways scrolling:', list(out.text200).join(', ') || 'none');
console.log('B. text cut off:', out.text200.filter(r => r.textCutOff.length).map(r => `${r.build}/${r.screen}: ${r.textCutOff.join('; ')}`).join(' | ') || 'none');
const c = out.contrast.reduce((a, r) => ({ passes: a.passes + r.passes, violations: a.violations + r.violations, undecided: a.undecided + r.undecided }), { passes: 0, violations: 0, undecided: 0 });
console.log('C. contrast nodes:', JSON.stringify(c));
