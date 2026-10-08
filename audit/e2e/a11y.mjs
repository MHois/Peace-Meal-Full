// Phase 5, items 23 and 24: accessibility of both builds in Chromium at phone size.
//   23. axe-core 4.13 on every main screen, light and dark, WCAG 2.0/2.1/2.2 A and AA rules
//   24. touch targets (24 x 24 minimum; lite controls under 44 x 44 listed), 200% text and a 320 px wide screen
//       (no sideways scrolling), keyboard only (every control reachable, focus visible, a sheet keeps focus inside and
//       Escape closes it), accessible names (axe), reduced motion, and announcements of the verdict, the Undo toast,
//       and a failed save.
// Results: audit/results/a11y.json.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildSite, serve, launch, phone, ROOT } from './site.mjs';
import { SCREENS, seededPage, KEY } from './screens.mjs';

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const out = { axe: [], targets: {}, reflow: [], keyboard: [], motion: {}, announcements: [] };
buildSite();
const srv = await serve();
const browser = await launch();
const url = (b, s) => `${srv.origin}/Peace-Meal-Full/${b}/#/${s}`;
try {
  // 23. axe on every main screen, light and dark
  for (const build of ['lite', 'full']) for (const dark of [false, true]) {
    const ctx = await phone(browser, { dark });
    const page = await seededPage(ctx, build);
    for (const s of SCREENS[build]) {
      await page.goto(url(build, s)); await page.waitForTimeout(s === 'week' || s === 'grocery' ? 2500 : 1200);
      if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
      const r = await page.evaluate(tags => window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] }), TAGS);
      for (const v of r.violations) out.axe.push({ build, theme: dark ? 'dark' : 'light', screen: s, rule: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, sample: v.nodes.slice(0, 3).map(n => n.target.join(' ')), detail: v.nodes[0] && (v.nodes[0].any[0] || v.nodes[0].all[0] || {}).message });
    }
    // 24a. touch targets (light only; sizes do not change with the theme)
    if (!dark) {
      const small = [];
      for (const s of SCREENS[build]) {
        await page.goto(url(build, s)); await page.waitForTimeout(1000);
        const found = await page.evaluate(() => [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button], summary, label[for]')]
          .filter(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !e.closest('[hidden]'); })
          .map(e => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), what: (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + ' ' + (e.getAttribute('aria-label') || e.innerText || e.value || '').trim().slice(0, 30)).trim() }; })
          .filter(x => x.w < 44 || x.h < 44));
        for (const f of found) small.push({ screen: s, ...f });
      }
      out.targets[build] = { under24: small.filter(x => x.w < 24 || x.h < 24), under44: small.filter(x => x.w >= 24 && x.h >= 24) };
    }
    await ctx.close();
  }
  // 24b. 200% text and a 320 px wide screen: sideways scrolling on any screen?
  for (const build of ['lite', 'full']) {
    const ctx = await phone(browser, { extra: { viewport: { width: 320, height: 640 } } });
    const page = await seededPage(ctx, build);
    for (const s of SCREENS[build]) {
      await page.goto(url(build, s)); await page.waitForTimeout(1200);
      const r = await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; document.body.style.fontSize = ''; return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => {
        const W = document.documentElement.clientWidth;
        const wide = [...document.querySelectorAll('body *')].filter(e => { const b = e.getBoundingClientRect(); return b.width > 0 && b.right > W + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('.table-wrap, pre, .x-scroll, [data-scroll-x]'); }).slice(0, 5).map(e => (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.split(/\s+/)[0] : '')));
        res({ scrollWidth: document.documentElement.scrollWidth, clientWidth: W, sideways: document.documentElement.scrollWidth > W + 1, wide });
      }))); });
      out.reflow.push({ build, screen: s, ...r });
    }
    await ctx.close();
  }
  // 24c. keyboard only, on the screens a person uses most
  for (const [build, s] of [['lite', 'today'], ['lite', 'check'], ['lite', 'settings'], ['full', 'home'], ['full', 'week'], ['full', 'people']]) {
    const ctx = await phone(browser, { extra: { isMobile: false, hasTouch: false } });
    const page = await seededPage(ctx, build);
    await page.goto(url(build, s)); await page.waitForTimeout(1500);
    const seen = [], invisible = [];
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press('Tab');
      const f = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const cs = getComputedStyle(e); const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none'); return { what: e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + ' ' + (e.getAttribute('aria-label') || e.innerText || '').trim().slice(0, 25), ring }; });
      if (!f) continue;
      if (seen.length && seen[0] === f.what && i > 3) break;   // wrapped round
      seen.push(f.what); if (!f.ring) invisible.push(f.what);
    }
    const all = await page.evaluate(() => [...document.querySelectorAll('main a[href], main button:not([disabled]), main input:not([type=hidden]):not([disabled]), main select, main textarea')].filter(e => e.getBoundingClientRect().width > 0 && !e.closest('[hidden]') && e.tabIndex >= 0).length);
    out.keyboard.push({ build, screen: s, reached: seen.length, focusableInMain: all, noVisibleFocus: invisible.slice(0, 10), noVisibleFocusCount: invisible.length });
    await ctx.close();
  }
  // Focus stays inside a sheet, and Escape closes it (the lite symptom sheet)
  {
    const ctx = await phone(browser, { extra: { isMobile: false, hasTouch: false } });
    const page = await seededPage(ctx, 'lite');
    await page.goto(url('lite', 'today')); await page.waitForTimeout(1500);
    await page.click('#lite-feel'); await page.waitForTimeout(600);
    let escaped = 0;
    for (let i = 0; i < 40; i++) { await page.keyboard.press('Tab'); if (!(await page.evaluate(() => !!document.activeElement.closest('.modal, [role=dialog]')))) escaped++; }
    await page.keyboard.press('Escape'); await page.waitForTimeout(500);
    const open = await page.evaluate(() => !!document.querySelector('.modal, [role=dialog][aria-modal=true]'));
    out.keyboard.push({ build: 'lite', screen: 'symptom sheet', focusLeftTheSheet: escaped, escapeCloses: !open });
    await ctx.close();
  }
  // 24d. reduced motion: CSS media queries, and what still animates on Breathe
  {
    const css = fs.readFileSync(path.join(ROOT, 'src/app.css'), 'utf8'), breathe = fs.readFileSync(path.join(ROOT, 'breathe.html'), 'utf8');
    out.motion.cssReducedMotionRules = (css.match(/prefers-reduced-motion/g) || []).length;
    out.motion.breatheReducedMotionRules = (breathe.match(/prefers-reduced-motion/g) || []).length;
    const ctx = await phone(browser, { extra: { reducedMotion: 'reduce' } });
    const page = await seededPage(ctx, 'lite');
    await page.goto(url('lite', 'breathe')); await page.waitForTimeout(1500);
    const start = await page.$('button:has-text("Start"), [data-start], .btn--primary');
    if (start) { await start.click().catch(() => {}); await page.waitForTimeout(1500); }
    out.motion.breatheRunningAnimations = await page.evaluate(() => { const docs = [document, ...[...document.querySelectorAll('iframe')].map(f => { try { return f.contentDocument; } catch { return null; } }).filter(Boolean)]; return docs.flatMap(d => d.getAnimations ? d.getAnimations() : []).filter(a => a.playState === 'running').map(a => ({ name: a.animationName || a.transitionProperty || 'animation', ms: a.effect && a.effect.getTiming ? a.effect.getTiming().duration : null })).slice(0, 10); });
    await ctx.close();
  }
  // 24e. announcements: the verdict, the Undo toast, a failed save
  {
    const ctx = await phone(browser);
    const page = await seededPage(ctx, 'lite');
    await page.goto(url('lite', 'check')); await page.waitForTimeout(1200);
    await page.fill('#check-text', 'peanuts'); await page.click('#check-run'); await page.waitForTimeout(500);
    out.announcements.push({ what: 'label verdict', ...(await page.$eval('#check-result', e => ({ live: e.getAttribute('aria-live'), atomic: e.getAttribute('aria-atomic'), role: e.getAttribute('role'), hasText: e.innerText.length > 0 }))) });
    await page.goto(url('lite', 'today')); await page.waitForTimeout(1200);
    const rm = await page.$('[data-lite-remove]');
    if (rm) { await rm.click(); await page.waitForTimeout(400); out.announcements.push({ what: 'Undo toast', ...(await page.$eval('#undo-toast', e => ({ role: e.getAttribute('role'), live: e.getAttribute('aria-live'), text: e.innerText.slice(0, 60) })).catch(() => ({ missing: true }))) }); }
    await page.evaluate(k => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function (a, b) { if (a === k) throw new DOMException('full', 'QuotaExceededError'); return o.call(this, a, b); }; }, KEY.lite);
    await page.goto(url('lite', 'settings')); await page.waitForTimeout(800);
    await page.click('label[for="coll-va"]'); await page.waitForTimeout(500);
    out.announcements.push({ what: 'failed save', ...(await page.$eval('#save-alert', e => ({ role: e.getAttribute('role'), text: e.innerText.slice(0, 40) })).catch(() => ({ missing: true }))) });
    await ctx.close();
  }
} finally { await browser.close(); await srv.close(); }
fs.writeFileSync(path.join(ROOT, 'audit/results/a11y.json'), JSON.stringify(out, null, 1) + '\n');
const byRule = {}; for (const v of out.axe) { const k = `${v.rule} (${v.impact})`; byRule[k] = (byRule[k] || 0) + v.nodes; }
console.log('axe violations (nodes) by rule:', byRule);
console.log('touch targets under 24:', Object.fromEntries(Object.entries(out.targets).map(([b, t]) => [b, t.under24.length])), 'lite 24-43:', out.targets.lite && out.targets.lite.under44.length);
console.log('sideways scrolling at 320 px and 200% text:', out.reflow.filter(r => r.sideways).map(r => `${r.build}/${r.screen}`));
console.log('keyboard:', out.keyboard.map(k => JSON.stringify(k)).join('\n  '));
console.log('motion:', JSON.stringify(out.motion)); console.log('announcements:', JSON.stringify(out.announcements));
