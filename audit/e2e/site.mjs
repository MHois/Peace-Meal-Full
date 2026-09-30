// Builds the hosted site the way .github/workflows/pages.yml does and serves it under /Peace-Meal-Full/ on localhost.
// Nothing in the app is changed: the bundler writes to dist/ (git-ignored) and the site goes to audit/results/tmp/.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';

export const ROOT = path.resolve(new URL('../../', import.meta.url).pathname);
export const TMP = path.join(ROOT, 'audit/results/tmp');
export const SITE = path.join(TMP, 'site');
export const BASE_PATH = '/Peace-Meal-Full/';

// Same steps as the workflow's "Assemble site": both pages builds, the landing page, the icon, and the build stamp.
export function buildSite({ stamp = gitSha12(), out = SITE } = {}) {
  execFileSync(process.execPath, ['tools/bundle.mjs', '--lite', '--pages'], { cwd: ROOT, stdio: 'pipe' });
  execFileSync(process.execPath, ['tools/bundle.mjs', '--pages'], { cwd: ROOT, stdio: 'pipe' });
  fs.rmSync(out, { recursive: true, force: true });
  const site = path.join(out, 'Peace-Meal-Full');
  fs.mkdirSync(site, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'site/index.html'), path.join(site, 'index.html'));
  fs.copyFileSync(path.join(ROOT, 'icon-180.png'), path.join(site, 'icon-180.png'));
  for (const b of ['lite', 'full']) {
    fs.cpSync(path.join(ROOT, 'dist/pages', b), path.join(site, b), { recursive: true });
    const sw = path.join(site, b, 'sw.js');
    fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace('__BUILD__', stamp));
  }
  return { out, stamp };
}
export function gitSha12() { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim().slice(0, 12); }

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };
// A plain static server. `state.offline` makes every request fail at the socket, like a phone with no signal.
export function serve(dir = SITE, port = 0) {
  const state = { offline: false, requests: [] };
  const server = http.createServer((req, res) => {
    state.requests.push(req.url);
    if (state.offline) { req.socket.destroy(); return; }
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(dir, p);
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(done => server.listen(port, '127.0.0.1', () => done({ server, state, origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(r => server.close(r)) })));
}

export const CHROMIUM = process.env.PM_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
export function launch(opts = {}) {
  return chromium.launch({ executablePath: fs.existsSync(CHROMIUM) ? CHROMIUM : undefined, ...opts });
}
// A phone: 390 x 844, device scale factor 3, touch. iPhone Safari's user agent so the app takes its iPhone paths.
export const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
export function phone(browser, { dark = false, ua = IPHONE_UA, standalone = null, extra = {} } = {}) {
  return browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: ua, colorScheme: dark ? 'dark' : 'light', ...extra })
    .then(async ctx => {
      if (standalone !== null) await ctx.addInitScript(v => { Object.defineProperty(Navigator.prototype, 'standalone', { get: () => v, configurable: true }); }, standalone);
      return ctx;
    });
}
export const STORE_KEY = { lite: 'peace-meal-lite:v1', full: 'peace-meal-full:v1' };
// Seeds localStorage before the app's first script runs, once per context.
export async function seed(ctx, entries) {
  await ctx.addInitScript(e => {
    try { if (sessionStorage.getItem('__audit_seeded')) return; sessionStorage.setItem('__audit_seeded', '1'); for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v); } catch { /* ignore */ }
  }, entries);
}
