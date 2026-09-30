// Phase 7, item 28: every network request both builds make in normal use and while reading a photo of a label,
// compared with what the README says leaves the device ("All data stays in the browser on that device", README.md:19).
// Chromium at phone size. The photo reader's files come from the internet (cdnjs and jsDelivr), so parts B to D need
// it. Behind a proxy (HTTPS_PROXY set), Chromium is pointed at the proxy and told to trust the proxy's certificate
// authority; the key hash is computed here from the CA file, nothing is hard-coded.
//   A. normal use: every main screen, a typed label check, a food search, a recipe search, a backup, Breathe
//   B. a photo of a label (a picture drawn here with printed ingredient text) read by the app's photo reader
//   C. tampered reader files (one byte changed in the language data; a comment added to the main script): refused?
//   D. a second photo with the internet cut off (same browser profile, proxy pointed at a closed port): does it work?
// Every request is recorded twice: by the page (who asked) and by Chromium's own network log (everything the browser
// sent, including service-worker and worker requests). Results: audit/results/network.json.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright-core';
import { buildSite, serve, CHROMIUM, phone, IPHONE_UA, ROOT, TMP } from './site.mjs';
import { SCREENS, seededPage, sampleProfile, KEY } from './screens.mjs';

const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || '';
function caSpkiHashes() {
  const f = ['/root/.ccr/agent-proxy-ca.crt', process.env.PM_PROXY_CA].filter(Boolean).find(p => fs.existsSync(p));
  if (!f) return [];
  const pems = fs.readFileSync(f, 'utf8').match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || [];
  return pems.map(p => crypto.createHash('sha256').update(new crypto.X509Certificate(p).publicKey.export({ type: 'spki', format: 'der' })).digest('base64'));
}
const SPKI = caSpkiHashes();
// The proxy is given to Chromium directly: Playwright's own proxy option also sends the local test server through the
// proxy (it adds "<-loopback>" to the bypass list), which the proxy does not serve.
function launchOpts(netlog, { proxy = PROXY } = {}) {
  const args = [];
  if (proxy) args.push('--proxy-server=' + proxy, '--proxy-bypass-list=127.0.0.1;localhost');
  if (SPKI.length) args.push('--ignore-certificate-errors-spki-list=' + SPKI.join(','));
  if (netlog) args.push('--log-net-log=' + netlog, '--net-log-capture-mode=Default');
  return { executablePath: fs.existsSync(CHROMIUM) ? CHROMIUM : undefined, args };
}
// Chromium's network log: every URL request the browser started, whoever started it.
function netlogUrls(file) {
  if (!fs.existsSync(file)) return { error: 'no network log written' };
  const raw = fs.readFileSync(file, 'utf8').trim();
  let log;
  try { log = JSON.parse(raw); } catch { log = JSON.parse(raw.replace(/,?\s*$/, '') + ']}'); }   // a log cut off at exit
  const T = log.constants.logEventTypes;
  const start = T.URL_REQUEST_START_JOB;
  // The network isolation key names the top-level site a request was made for: the app's own requests (page, workers,
  // service worker) carry the local test site; anything else is Chromium's own background traffic, not the app's.
  const app = new Map(), browserOwn = new Map();
  for (const e of log.events) if (e.type === start && e.params && e.params.url) {
    const p = e.params; const k = `${p.method} ${p.url.length > 160 ? p.url.slice(0, 160) + '...' : p.url}`;
    const m = /^http:\/\/127\.0\.0\.1(:\d+)? /.test(p.network_isolation_key || '') ? app : browserOwn;
    m.set(k, (m.get(k) || 0) + 1);
  }
  const hostsOf = m => [...new Set([...m.keys()].map(k => { try { return new URL(k.split(' ')[1]).host; } catch { return '?'; } }))];
  return { app: Object.fromEntries(app), appHosts: hostsOf(app), browserOwnHosts: hostsOf(browserOwn), browserOwnRequests: [...browserOwn.values()].reduce((a, b) => a + b, 0) };
}
const host = u => { try { return new URL(u).host; } catch { return u.slice(0, 40); } };
function recorder(ctx, phase) {
  const list = [];
  ctx.on('request', r => {
    const pd = r.postDataBuffer();
    list.push({ phase: phase.name, method: r.method(), url: r.url().length > 160 ? r.url().slice(0, 160) + '...' : r.url(), host: host(r.url()), type: r.resourceType(), bodyBytes: pd ? pd.length : 0, fromServiceWorker: !!r.serviceWorker() });
  });
  return list;
}
async function waitForOcr(page, timeout = 240000) {
  await page.waitForFunction(() => /^(Text added|Could not read|The label reader could not load)/.test((document.querySelector('#check-ocr-status') || {}).textContent || ''), null, { timeout, polling: 250 });
  return page.evaluate(() => ({ status: document.querySelector('#check-ocr-status').textContent, text: document.querySelector('#check-text').value }));
}
const LABEL_LINES = ['INGREDIENTS: WHEAT FLOUR, SUGAR,', 'PEANUTS, SALT, SOY LECITHIN.'];
async function labelPng(browser) {
  const ctx = await browser.newContext(); const p = await ctx.newPage();
  const b64 = await p.evaluate(lines => { const c = document.createElement('canvas'); c.width = 1400; c.height = 360; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#000'; g.font = 'bold 60px sans-serif'; lines.forEach((t, i) => g.fillText(t, 40, 130 + i * 120)); return c.toDataURL('image/png').split(',')[1]; }, LABEL_LINES);
  await ctx.close();
  const f = path.join(TMP, 'label-photo.png'); fs.writeFileSync(f, Buffer.from(b64, 'base64')); return f;
}

process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';   // service-worker requests on the context too (Chromium)
buildSite();
const srv = await serve();
const url = (b, h = '') => `${srv.origin}/Peace-Meal-Full/${b}/${h}`;
const out = { proxy: PROXY ? 'yes' : 'no', spkiPinned: SPKI.length, normal: {}, photo: {}, tamper: {}, offlineSecondPhoto: {}, netlog: {} };
const netlogA = path.join(TMP, 'netlog-a.json'), netlogB = path.join(TMP, 'netlog-b.json');
fs.rmSync(netlogA, { force: true }); fs.rmSync(netlogB, { force: true });
// ------------------------------------------------------------------ A. normal use, no photo
{
  const browser = await chromium.launch(launchOpts(netlogA));
  try {
    for (const build of ['lite', 'full']) {
      const phase = { name: 'normal' };
      const ctx = await phone(browser);
      const reqs = recorder(ctx, phase);
      const before = srv.state.requests.length;
      const page = await seededPage(ctx, build);
      await page.goto(url(build)); await page.waitForTimeout(2500);
      const swReady = await page.evaluate(() => Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise(r => setTimeout(() => r(false), 15000))])).catch(() => false);
      console.log(`A [${build}] app open, service worker ready: ${swReady}`);
      for (const s of SCREENS[build]) { await page.goto(url(build, '#/' + s)); await page.waitForTimeout(s === 'week' || s === 'grocery' ? 2500 : 900); }
      console.log(`A [${build}] ${SCREENS[build].length} screens visited`);
      await page.goto(url(build, '#/check')); await page.waitForTimeout(800);
      await page.fill('#check-text', 'enriched wheat flour, peanuts, salt'); await page.click('#check-run'); await page.waitForTimeout(500);
      await page.fill('#check-search', 'banana'); await page.waitForTimeout(800);
      await page.goto(url(build, '#/recipes')); await page.waitForTimeout(1200);
      await page.fill('#rc-q', 'chicken'); await page.waitForTimeout(2500);
      const first = await page.$('[data-open]'); if (first) { await first.click(); await page.waitForTimeout(1000); }
      await page.goto(url(build, '#/settings')); await page.waitForTimeout(1000);
      await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), page.click('#set-export').catch(() => {})]);
      await page.goto(url(build, '#/breathe')); await page.waitForTimeout(1500);
      await ctx.close();
      const other = reqs.filter(r => !r.url.startsWith(srv.origin) && !/^(data|blob):/.test(r.url));
      out.normal[build] = { pageRequests: reqs.length, sameOriginServed: srv.state.requests.slice(before), crossOrigin: other, dataOrBlob: reqs.filter(r => /^(data|blob):/.test(r.url)).length, withBody: reqs.filter(r => r.bodyBytes).map(r => ({ url: r.url, bytes: r.bodyBytes })) };
      console.log(`A [${build}] ${reqs.length} requests seen by the page; ${other.length} to another site; same-origin paths served: ${[...new Set(out.normal[build].sameOriginServed)].join(', ')}`);
    }
  } finally { await browser.close(); }
  out.netlog.normalUse = netlogUrls(netlogA);
}
// ------------------------------------------------------------------ B and C. photo of a label; tampered files
{
  const browser = await chromium.launch(launchOpts(netlogB));
  try {
    const png = await labelPng(browser);
    for (const build of ['lite', 'full']) {
      const phase = { name: 'photo' };
      const ctx = await phone(browser);
      const reqs = recorder(ctx, phase);
      const page = await seededPage(ctx, build);
      await page.goto(url(build, '#/check')); await page.waitForTimeout(1500);
      const t0 = Date.now();
      console.log(`B [${build}] reading the photo...`);
      await page.setInputFiles('#check-photo', png);
      let r; try { r = await waitForOcr(page); } catch (e) { r = { error: String(e.message).split('\n')[0] }; }
      const ms = Date.now() - t0;
      let verdict = null;
      if (r.text) { await page.click('#check-run'); await page.waitForTimeout(600); verdict = (await page.$eval('#check-result', e => e.innerText)).replace(/\s+/g, ' ').slice(0, 140); }
      await ctx.close();
      const cross = reqs.filter(q => !q.url.startsWith(srv.origin) && !/^(data|blob):/.test(q.url));
      out.photo[build] = { ms, ...r, verdictAfterCheck: verdict, crossOrigin: cross, hosts: [...new Set(cross.map(q => q.host))], nonGet: reqs.filter(q => q.method !== 'GET' && !/^(data|blob):/.test(q.url)), withBody: reqs.filter(q => q.bodyBytes).map(q => ({ url: q.url, bytes: q.bodyBytes })) };
      console.log(`B [${build}] photo read in ${ms} ms: ${JSON.stringify(r).slice(0, 200)}; ${cross.length} requests to ${out.photo[build].hosts.join(', ')}`);
    }
    // C. tampered files: the language data with one byte changed; the main script with a comment added.
    const tampers = [
      { name: 'language data, one byte changed', pattern: '**/@tesseract.js-data/eng@1.0.0/**', change: b => { const c = Buffer.from(b); c[c.length - 1] ^= 1; return c; } },
      { name: 'main script, a comment added', pattern: '**/tesseract.js/5.1.1/tesseract.min.js', change: b => Buffer.concat([Buffer.from(b), Buffer.from('\n/* changed */\n')]) }
    ];
    for (const t of tampers) {
      const ctx = await phone(browser);
      let served = 0;
      await ctx.route(t.pattern, async route => { const res = await route.fetch(); const body = t.change(await res.body()); served++; await route.fulfill({ response: res, body }); });
      const page = await seededPage(ctx, 'lite');
      await page.goto(url('lite', '#/check')); await page.waitForTimeout(1500);
      await page.setInputFiles('#check-photo', png);
      let r; try { r = await waitForOcr(page, 120000); } catch (e) { r = { error: String(e.message).split('\n')[0] }; }
      out.tamper[t.name] = { changedFileServed: served, ...r, refused: /could not load/.test(r.status || '') && !(r.text || '').trim() };
      console.log(`C ${t.name}: ${out.tamper[t.name].refused ? 'REFUSED' : 'NOT REFUSED'} (${(r.status || r.error || '').slice(0, 90)})`);
      await ctx.close();
    }
  } finally { await browser.close(); }
  out.netlog.photo = netlogUrls(netlogB);
}
// ------------------------------------------------------------------ D. a second photo with no internet
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-profile-'));
  const ctxOpts = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: IPHONE_UA };
  const png = path.join(TMP, 'label-photo.png');
  const seedIt = async ctx => { await ctx.addInitScript(([k, v]) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, v); localStorage.setItem('peace-meal-lite:home-screen-guide', '1'); } catch { /* ignore */ } }, [KEY.lite, sampleProfile('lite')]); };
  try {
    let ctx = await chromium.launchPersistentContext(dir, { ...launchOpts(null), ...ctxOpts });
    await seedIt(ctx);
    let page = await ctx.newPage();
    await page.goto(url('lite', '#/check')); await page.waitForTimeout(1500);
    await page.setInputFiles('#check-photo', png);
    const first = await waitForOcr(page).catch(e => ({ error: String(e.message).split('\n')[0] }));
    await ctx.close();
    ctx = await chromium.launchPersistentContext(dir, { ...launchOpts(null, { proxy: 'http://127.0.0.1:9' }), ...ctxOpts });
    await seedIt(ctx);
    page = await ctx.newPage();
    await page.goto(url('lite', '#/check')); await page.waitForTimeout(1500);
    const internet = await page.evaluate(() => fetch('https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/package.json', { cache: 'no-store' }).then(() => 'reachable', () => 'unreachable'));
    await page.setInputFiles('#check-photo', png);
    const second = await waitForOcr(page, 120000).catch(e => ({ error: String(e.message).split('\n')[0] }));
    await ctx.close();
    out.offlineSecondPhoto = { firstPhotoOnline: first, internetDuringSecond: internet, secondPhoto: second, works: /^Text added/.test(second.status || '') };
    console.log(`D second photo with the internet ${internet}: ${out.offlineSecondPhoto.works ? 'WORKS' : 'DOES NOT WORK'} (${(second.status || second.error || '').slice(0, 90)})`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
await srv.close();
fs.writeFileSync(path.join(ROOT, 'audit/results/network.json'), JSON.stringify(out, null, 1) + '\n');
