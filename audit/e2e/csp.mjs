// Phase 7, item 29: GitHub Pages cannot send security headers, so the only Content Security Policy available is a
// <meta http-equiv="Content-Security-Policy"> tag. This script works out a policy from the built pages, puts it into a
// TEST COPY of the hosted site (the app and its build are not changed), and runs both builds under it:
//   A. every main screen, a typed label check, a food search, a recipe search and one recipe, Breathe, a backup
//   B. a photo of a label (needs the internet for the reader's files)
//   C. the Phase 2 script-injection path (a backup whose age field carries an event handler), with and without the
//      policy, to show what the policy would have stopped
// Every policy violation Chromium reports is recorded. Results: audit/results/csp.json; the policy itself is written
// to audit/results/csp-policy.txt.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright-core';
import { buildSite, serve, CHROMIUM, phone, ROOT, TMP, SITE, STORE_KEY } from './site.mjs';
import { SCREENS, seededPage, sampleProfile } from './screens.mjs';

const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || '';
const SPKI = (() => {
  const f = ['/root/.ccr/agent-proxy-ca.crt', process.env.PM_PROXY_CA].filter(Boolean).find(p => fs.existsSync(p));
  if (!f) return [];
  return (fs.readFileSync(f, 'utf8').match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || [])
    .map(p => crypto.createHash('sha256').update(new crypto.X509Certificate(p).publicKey.export({ type: 'spki', format: 'der' })).digest('base64'));
})();
const sha256 = s => 'sha256-' + crypto.createHash('sha256').update(s, 'utf8').digest('base64');
// Inline scripts the browser runs: <script> with no src and no type, or a JavaScript type. JSON blocks are not run.
function runnableInline(html) {
  return [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .filter(m => !/\ssrc\s*=/.test(m[1] || '') && (!/\stype\s*=/.test(m[1] || '') || /type\s*=\s*["']?(text|application)\/(javascript|ecmascript)|type\s*=\s*["']?module/i.test(m[1] || '')))
    .map(m => m[2]);
}
function appData(html) {
  const a = html.indexOf('window.__APP_DATA__ = ');
  if (a < 0) return {};
  const b = html.indexOf(';</script>', a);
  return JSON.parse(html.slice(a + 'window.__APP_DATA__ = '.length, b).replace(/<\\\/script/gi, '</script'));
}
const OCR = {
  script: 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/tesseract.min.js',
  connect: ['https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/worker.min.js', 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/', 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz']
};
function policyFor(html) {
  const breathe = appData(html).breatheHtml || '';
  const hashes = [...new Set([...runnableInline(html), ...runnableInline(breathe)].map(sha256))];
  return {
    hashes: hashes.length,
    policy: [
      "default-src 'none'",
      `script-src ${hashes.map(h => `'${h}'`).join(' ')} ${OCR.script} 'wasm-unsafe-eval'`,
      "style-src 'unsafe-inline'",
      "img-src 'self' data: blob:",
      'font-src data:',
      `connect-src 'self' data: ${OCR.connect.join(' ')}`,
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "frame-src 'self'",
      "base-uri 'none'",
      "form-action 'none'",
      "object-src 'none'"
    ].join('; ')
  };
}
// The test copy: the same site with the policy as the first element of <head>.
buildSite();
const CSP_SITE = path.join(TMP, 'site-csp');
fs.rmSync(CSP_SITE, { recursive: true, force: true });
fs.cpSync(SITE, CSP_SITE, { recursive: true });
const policies = {};
for (const b of ['lite', 'full']) {
  const f = path.join(CSP_SITE, 'Peace-Meal-Full', b, 'index.html');
  const html = fs.readFileSync(f, 'utf8');
  const p = policyFor(html);
  policies[b] = p;
  const at = html.search(/<head[^>]*>/i);
  const end = html.indexOf('>', at) + 1;
  fs.writeFileSync(f, html.slice(0, end) + `\n<meta http-equiv="Content-Security-Policy" content="${p.policy.replace(/"/g, '&quot;')}">` + html.slice(end));
}
fs.writeFileSync(path.join(ROOT, 'audit/results/csp-policy.txt'), Object.entries(policies).map(([b, p]) => `# ${b} (${p.hashes} script hashes)\n${p.policy.replace(/'sha256-[^']+'( 'sha256-[^']+')*/, `<${p.hashes} sha256 hashes, one per inline script, computed at build time>`)}\n`).join('\n'));

const plain = await serve(SITE), strict = await serve(CSP_SITE);
// The proxy goes to Chromium directly (Playwright's proxy option would send the local test servers through it too).
const browser = await chromium.launch({ executablePath: fs.existsSync(CHROMIUM) ? CHROMIUM : undefined, args: [...(PROXY ? ['--proxy-server=' + PROXY, '--proxy-bypass-list=127.0.0.1;localhost'] : []), ...(SPKI.length ? ['--ignore-certificate-errors-spki-list=' + SPKI.join(',')] : [])] });
const out = { policies: Object.fromEntries(Object.entries(policies).map(([b, p]) => [b, { scriptHashes: p.hashes, length: p.policy.length }])), use: {}, photo: {}, injection: {} };
function watch(page) {
  const v = [];
  page.on('console', m => { const t = m.text(); if (/Content Security Policy|Refused to/i.test(t)) v.push(t.replace(/'sha256-[^']+'/g, "'sha256-…'").slice(0, 300)); });
  page.on('pageerror', e => v.push('page error: ' + String(e.message).slice(0, 200)));
  return v;
}
try {
  // A. normal use under the policy
  for (const build of ['lite', 'full']) {
    const ctx = await phone(browser);
    const page = await seededPage(ctx, build);
    const v = watch(page);
    const u = (h = '') => `${strict.origin}/Peace-Meal-Full/${build}/${h}`;
    await page.goto(u()); await page.waitForTimeout(2500);
    const booted = await page.evaluate(() => !!document.querySelector('main h1, #app h1'));
    const sw = await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => !!(r && (r.active || r.installing || r.waiting)))).catch(() => false);
    for (const s of SCREENS[build]) { await page.goto(u('#/' + s)); await page.waitForTimeout(s === 'week' || s === 'grocery' ? 2500 : 900); }
    await page.goto(u('#/check')); await page.waitForTimeout(800);
    await page.fill('#check-text', 'enriched wheat flour, peanuts, salt'); await page.click('#check-run'); await page.waitForTimeout(500);
    const verdict = (await page.$eval('#check-result', e => e.innerText)).replace(/\s+/g, ' ').slice(0, 80);
    await page.fill('#check-search', 'banana'); await page.waitForTimeout(800);
    await page.goto(u('#/recipes')); await page.waitForTimeout(1200);
    await page.fill('#rc-q', 'chicken'); await page.waitForTimeout(2500);
    const found = await page.$$eval('[data-open]', xs => xs.length);
    const first = await page.$('[data-open]'); if (first) { await first.click(); await page.waitForTimeout(1000); }
    await page.goto(u('#/breathe')); await page.waitForTimeout(3000);
    const breathe = await page.evaluate(() => { const f = document.querySelector('#breathe-iframe'); try { const d = f && f.contentDocument; return d ? { text: d.body.innerText.slice(0, 60), scripted: !!d.querySelector('script') } : null; } catch (e) { return { error: e.message }; } });
    await page.goto(u('#/settings')); await page.waitForTimeout(1000);
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), page.click('#set-export').catch(() => {})]);
    await ctx.close();
    out.use[build] = { booted, serviceWorkerRegistered: sw, verdict, recipeResults: found, breathe, backupDownloaded: !!dl, violations: [...new Set(v)] };
    console.log(`A [${build}] booted ${booted}, service worker ${sw}, verdict "${verdict.slice(0, 40)}", ${found} recipes, backup ${!!dl}, ${out.use[build].violations.length} distinct violations`);
    for (const x of out.use[build].violations.slice(0, 8)) console.log('   ' + x);
  }
  // B. a photo under the policy (lite)
  {
    const png = path.join(TMP, 'label-photo.png');
    if (!fs.existsSync(png)) {
      const c0 = await browser.newContext(); const p0 = await c0.newPage();
      const b64 = await p0.evaluate(() => { const c = document.createElement('canvas'); c.width = 1400; c.height = 360; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#000'; g.font = 'bold 60px sans-serif'; ['INGREDIENTS: WHEAT FLOUR, SUGAR,', 'PEANUTS, SALT, SOY LECITHIN.'].forEach((t, i) => g.fillText(t, 40, 130 + i * 120)); return c.toDataURL('image/png').split(',')[1]; });
      fs.writeFileSync(png, Buffer.from(b64, 'base64')); await c0.close();
    }
    const ctx = await phone(browser);
    const page = await seededPage(ctx, 'lite');
    const v = watch(page);
    await page.goto(`${strict.origin}/Peace-Meal-Full/lite/#/check`); await page.waitForTimeout(1500);
    await page.setInputFiles('#check-photo', png);
    let r;
    try {
      await page.waitForFunction(() => /^(Text added|Could not read|The label reader could not load)/.test(document.querySelector('#check-ocr-status').textContent), null, { timeout: 240000, polling: 250 });
      r = await page.evaluate(() => ({ status: document.querySelector('#check-ocr-status').textContent, text: document.querySelector('#check-text').value }));
    } catch (e) { r = { error: String(e.message).split('\n')[0] }; }
    await ctx.close();
    out.photo = { ...r, works: /^Text added/.test(r.status || ''), violations: [...new Set(v)] };
    console.log(`B photo under the policy: ${out.photo.works ? 'WORKS' : 'BROKEN'} (${(r.status || r.error || '').slice(0, 80)}); ${out.photo.violations.length} violations`);
    for (const x of out.photo.violations.slice(0, 8)) console.log('   ' + x);
  }
  // C. the Phase 2 injection path: an age field carrying an event handler, shown on the lite report and the full
  //    profile screen. Without the policy it runs (Phase 2 proved this); with it, it should be refused.
  const PAYLOAD = '70"><img src=x onerror="__xss(1)">';
  for (const [build, route] of [['lite', '#/report'], ['full', '#/people/p1/basics']]) {
    for (const [label, srv] of [['without policy', plain], ['with policy', strict]]) {
      const ctx = await phone(browser);
      const prof = JSON.parse(sampleProfile(build)); prof.people[0].age = PAYLOAD;
      await ctx.addInitScript(([k, val]) => { window.__ran = 0; window.__xss = () => { window.__ran++; }; try { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem(k, val); localStorage.setItem('peace-meal-lite:home-screen-guide', '1'); localStorage.setItem('peace-meal-full:home-screen-guide', '1'); } } catch { /* ignore */ } }, [STORE_KEY[build], JSON.stringify(prof)]);
      const page = await ctx.newPage();
      const v = watch(page);
      await page.goto(`${srv.origin}/Peace-Meal-Full/${build}/${route}`); await page.waitForTimeout(2500);
      const ran = await page.evaluate(() => window.__ran);
      out.injection[`${build} ${label}`] = { route, injectedHandlerRan: ran > 0, violations: [...new Set(v)].slice(0, 3) };
      console.log(`C [${build}] ${label}: the injected handler ${ran > 0 ? 'RAN' : 'did not run'}${v.length ? ' (' + v.length + ' violation reports)' : ''}`);
      await ctx.close();
    }
  }
} finally { await browser.close(); await plain.close(); await strict.close(); }
fs.writeFileSync(path.join(ROOT, 'audit/results/csp.json'), JSON.stringify(out, null, 1) + '\n');
