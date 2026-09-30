// Phase 7, item 31: what a person who still uses the old address (mchoisington.github.io/specialty-nutrition-app/)
// sees, and whether the proposed "moved" page gets their data across. Simulated in Chromium on this machine; iPhone
// Safari was not run (see REPORT, Not checked). Made-up data only.
//
// The old site is rebuilt from the last commit the old repository published (b77787f, the last "Deploy to GitHub
// Pages" run: audit/results/old-address-deploys.json), assembled the way that commit's workflow did it: the module
// app at the root plus single-file copies at lite/ and full/, each with its own service worker. It is served under
// /specialty-nutrition-app/ on the same local origin as the new site (/Peace-Meal-Full/), as on GitHub Pages.
// Modes: live (as before), gone (every path 404, as today), offline (no connection), moved (the proposal in
// tools/old-address/ (first proposed in audit/proposals/old-address/) at /, lite/ and full/; with or without the replacement front-page worker).
// Needs the old repository's history: set PM_OLD_REPO to its checkout (default ../specialty-nutrition-app).
// Results: audit/results/old-address.json.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { buildSite, launch, phone, ROOT, TMP, SITE, STORE_KEY } from './site.mjs';
import { sampleProfile } from './screens.mjs';

const OLD_REPO = process.env.PM_OLD_REPO || path.resolve(ROOT, '../specialty-nutrition-app');
const OLD_SHA = 'b77787f';
const OLD = path.join(TMP, 'old-site');
const PROPOSAL = path.join(ROOT, 'tools/old-address');   // moved from audit/proposals/old-address/ in the fix pass (P1-6)
const out = { oldCommit: OLD_SHA, scenarios: {} };
try { execFileSync('git', ['-C', OLD_REPO, 'cat-file', '-e', OLD_SHA + '^{commit}']); } catch {
  console.log(`Skipped: the old repository's commit ${OLD_SHA} is not available (set PM_OLD_REPO).`);
  fs.writeFileSync(path.join(ROOT, 'audit/results/old-address.json'), JSON.stringify({ skipped: 'old repository not available' }, null, 1) + '\n');
  process.exit(0);
}
// Build the old site exactly as its workflow's "Assemble site" step did (stamp: a made-up commit id).
const src = path.join(TMP, 'old-src');
fs.rmSync(src, { recursive: true, force: true }); fs.mkdirSync(src, { recursive: true });
execSync(`git -C "${OLD_REPO}" archive ${OLD_SHA} | tar -x -C "${src}"`);
execFileSync(process.execPath, ['tools/bundle.mjs', '--lite', '--pages'], { cwd: src, stdio: 'pipe' });
execFileSync(process.execPath, ['tools/bundle.mjs', '--pages'], { cwd: src, stdio: 'pipe' });
fs.rmSync(OLD, { recursive: true, force: true }); fs.mkdirSync(OLD, { recursive: true });
for (const e of fs.readdirSync(src)) if (!['.git', 'node_modules', 'dist', '_site'].includes(e)) fs.cpSync(path.join(src, e), path.join(OLD, e), { recursive: true });
for (const b of ['lite', 'full']) {
  fs.cpSync(path.join(src, 'dist/pages', b), path.join(OLD, b), { recursive: true });
  const f = path.join(OLD, b, 'sw.js'); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('__BUILD__', 'aaaaaaaaaaaa'));
}
{ const f = path.join(OLD, 'sw.js'); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/const VERSION = 'pm-v[^']*'/, "const VERSION = 'pm-aaaaaaaaaaaa'")); }
buildSite();   // the new site, for the same-origin and "Bring my data" steps

// One origin, two sites: the old one (switchable) and the new one.
const state = { mode: 'live', replacementWorker: false };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css', '.woff2': 'font/woff2' };
const NOT_FOUND = '<!doctype html><title>Site not found · GitHub Pages</title><h1>404</h1><p>There isn\'t a GitHub Pages site here.</p>';
const sendFile = (res, file) => { res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' }); fs.createReadStream(file).pipe(res); };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.startsWith('/specialty-nutrition-app/')) {
    if (state.mode === 'offline') { req.socket.destroy(); return; }
    const rel = p.slice('/specialty-nutrition-app/'.length);
    if (state.mode === 'moved') {
      if (/^((lite|full)\/)?(index\.html)?$/.test(rel)) return sendFile(res, path.join(PROPOSAL, 'index.html'));
      if (rel === 'sw.js' && state.replacementWorker) return sendFile(res, path.join(PROPOSAL, 'sw.js'));
    }
    if (state.mode !== 'live') { res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }); res.end(NOT_FOUND); return; }
    let f = path.join(OLD, rel); if (p.endsWith('/')) f = path.join(f, 'index.html');
    if (!f.startsWith(OLD) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(NOT_FOUND); return; }
    return sendFile(res, f);
  }
  let f = path.join(SITE, p); if (p.endsWith('/')) f = path.join(f, 'index.html');
  if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(NOT_FOUND); return; }
  sendFile(res, f);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await launch();
const NAME = 'Sample Person';   // the made-up person in screens.mjs
const OLD_PROFILE = sampleProfile('lite');
const look = async page => page.evaluate(n => ({ title: document.title, notFound: /There isn't a GitHub Pages site here/.test(document.body.innerText), moved: /Peace Meal has moved/.test(document.body.innerText), appShown: !!document.querySelector('main h1, #app h1, nav'), personShown: document.body.innerText.includes(n), text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 90) }), NAME).catch(e => ({ error: String(e.message).split('\n')[0] }));
const reload = async page => { await page.reload({ timeout: 30000 }).catch(e => e); await page.waitForTimeout(2500); return look(page); };
async function download(page, click) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }).catch(() => null), click()]);
  if (!dl) return null;
  const f = path.join(TMP, 'old-address-' + Date.now() + '.json'); await dl.saveAs(f);
  const text = fs.readFileSync(f, 'utf8'); return { file: f, hasPerson: text.includes(NAME), bytes: text.length };
}
async function device() {
  const ctx = await phone(browser, { standalone: true });
  await ctx.addInitScript(v => { try { if (!localStorage.getItem('peace-meal:v1') && !sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('peace-meal:v1', v); } } catch { /* ignore */ } }, OLD_PROFILE);
  const page = await ctx.newPage(); page.on('dialog', d => d.accept());
  return { ctx, page };
}
const rec = (scenario, step, r) => { (out.scenarios[scenario] ||= []).push({ step, ...r }); console.log(`[${scenario}] ${step}: ${JSON.stringify(r).slice(0, 220)}`); };
try {
  // S1. A Home Screen icon made from /specialty-nutrition-app/lite/ (the old network-first worker).
  for (const b of ['lite', 'full']) {
    const S = `icon from old ${b}/`;
    state.mode = 'live'; state.replacementWorker = false;
    const { ctx, page } = await device();
    await page.goto(`${origin}/specialty-nutrition-app/${b}/`); await page.waitForTimeout(3000);
    await page.evaluate(() => Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(r, 15000))]));
    rec(S, '1 as before (site up)', await reload(page));
    state.mode = 'gone'; rec(S, '2 today, online (every path 404)', await reload(page));
    state.mode = 'offline'; const off = await reload(page); rec(S, '3 today, no connection (Airplane Mode)', off);
    if (off.appShown) {
      await page.evaluate(() => { location.hash = '#/settings'; }); await page.waitForTimeout(1500);
      const saved = await download(page, () => page.click('#set-export').catch(() => {}));
      rec(S, '4 no connection: Settings, Save a backup', { backup: saved && { hasPerson: saved.hasPerson, bytes: saved.bytes } });
      out.airplaneBackup = out.airplaneBackup || (saved && saved.file);
    }
    state.mode = 'moved'; const mv = await reload(page); rec(S, '5 proposal published, online', mv);
    if (mv.moved) {
      const saved = await download(page, () => page.click('#save'));
      rec(S, '6 proposal: Save my information', { backup: saved && { hasPerson: saved.hasPerson, bytes: saved.bytes }, link: await page.$eval('#new-link', a => a.href) });
      out.movedBackup = out.movedBackup || (saved && saved.file);
    }
    state.mode = 'offline'; rec(S, '7 after the proposal was seen, no connection', await reload(page));
    await ctx.close();
  }
  // S2. A Home Screen icon made from the old front page (its worker answers pages from its stored copy first).
  {
    const S = 'icon from the old front page';
    state.mode = 'live'; state.replacementWorker = false;
    const { ctx, page } = await device();
    await page.goto(`${origin}/specialty-nutrition-app/`); await page.waitForTimeout(3500);
    await page.evaluate(() => Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(r, 15000))]));
    rec(S, '1 as before (site up)', await reload(page));
    state.mode = 'gone'; rec(S, '2 today, online (every path 404)', await reload(page));
    state.mode = 'offline'; rec(S, '3 today, no connection', await reload(page));
    state.mode = 'moved'; state.replacementWorker = false; rec(S, '4 proposal page only, online', await reload(page));
    state.replacementWorker = true; await reload(page); rec(S, '5 proposal page plus the replacement worker, online (second open)', await reload(page));
    await ctx.close();
  }
  // S3. A Safari tab (one storage for the whole origin): the new address picks up the old data by itself.
  {
    const S = 'Safari tab';
    state.mode = 'gone';
    const { ctx, page } = await device();
    await page.goto(`${origin}/Peace-Meal-Full/lite/`); await page.waitForTimeout(3500);
    const newKey = await page.evaluate(k => !!localStorage.getItem(k), STORE_KEY.lite);
    rec(S, 'open the new address in the same browser storage', { ...(await look(page)), copiedToNewKey: newKey });
    await ctx.close();
  }
  // S4. The new address as a new Home Screen icon (its own, empty storage): "Bring my data" with each saved file.
  for (const [label, file] of [['file saved in Airplane Mode', out.airplaneBackup], ['file saved by the proposal page', out.movedBackup]]) {
    if (!file) { rec('new icon, Bring my data', label, { skipped: 'no file' }); continue; }
    const ctx = await phone(browser, { standalone: true });
    const page = await ctx.newPage(); page.on('dialog', d => d.accept());
    await page.goto(`${origin}/Peace-Meal-Full/lite/`); await page.waitForTimeout(3000);
    const input = await page.$('#welcome-import');
    if (input) { await input.setInputFiles(file); await page.waitForTimeout(3000); }
    rec('new icon, Bring my data', label, { importControl: !!input, ...(await look(page)), saved: await page.evaluate(([k, n]) => (localStorage.getItem(k) || '').includes(n), [STORE_KEY.lite, NAME]) });
    await ctx.close();
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); }
for (const k of ['airplaneBackup', 'movedBackup']) if (out[k]) out[k] = path.basename(out[k]);
fs.writeFileSync(path.join(ROOT, 'audit/results/old-address.json'), JSON.stringify(out, null, 1) + '\n');
