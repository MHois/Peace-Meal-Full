// Service workers (audit item 9): cache first, a new version waits for "Update ready, tap to reload", and the root
// worker's lists cover every file the app loads. The workers run here in a small stand-in for the browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const rootSW = read('sw.js');
// The Pages worker's code comes from tools/lib/pages-sw.mjs, the same function tools/bundle.mjs --pages writes it with.
const { pagesServiceWorker } = await import('../tools/lib/pages-sw.mjs');
const pagesSW = pagesServiceWorker({ app: 'lite' });

function runWorker(code, base = 'https://example.org/app/', store = new Map()) {
  const listeners = {};
  // files: exact bodies by URL (strings or Buffers); offline: every network request fails.
  const state = { network: 0, body: 'version one', skipped: 0, claimed: 0, files: null, offline: false };
  // As in browsers, the part after # is never part of a cache key or sent to the site.
  const key = (u, ignoreSearch) => { const x = new URL(u, base); x.hash = ''; if (ignoreSearch) x.search = ''; return x.href; };
  const res = body => {
    const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : new Uint8Array(body);
    return { ok: true, body, clone() { return res(body); }, text: async () => (typeof body === 'string' ? body : Buffer.from(body).toString('utf8')), arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  };
  class Request { constructor(u, init = {}) { this.url = new URL(u, base).href; this.method = 'GET'; this.mode = init.mode; this.cache = init.cache; } }
  const fetch = async req => {
    if (state.offline) throw new TypeError('Failed to fetch');
    state.network++;
    const x = new URL(req.url || req, base); x.hash = ''; const u = x.href;
    return res(state.files && u in state.files ? state.files[u] : state.body + ' of ' + (req.url || req));
  };
  const caches = {
    open: async name => {
      if (!store.has(name)) store.set(name, new Map());
      const m = store.get(name);
      return {
        add: async req => { m.set(key(req.url || req, true), await fetch(req)); },
        put: async (req, r) => { m.set(key(req.url || req, true), r); },
        match: async (req, opts = {}) => { const r = m.get(key(req.url || req, opts.ignoreSearch)); return r ? r.clone() : undefined; },
        delete: async (req, opts = {}) => m.delete(key(req.url || req, opts.ignoreSearch))
      };
    },
    keys: async () => [...store.keys()],
    delete: async k => store.delete(k)
  };
  const self = {
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting: () => { state.skipped++; },
    clients: { claim: async () => { state.claimed++; } }
  };
  vm.runInNewContext(code, { self, caches, fetch, Request, Response, URL, location: new URL(base), Promise, console, crypto: globalThis.crypto, btoa });
  const fire = async (type, extra = {}) => { let p = null; const ev = { waitUntil: x => { p = x; }, respondWith: x => { p = x; }, ...extra }; listeners[type](ev); return p; };
  return { state, fire, store, base, res };
}

for (const [name, code] of [['root sw.js', rootSW], ['the Pages worker for /lite/ and /full/', pagesSW]]) {
  test(`${name}: serves the cached copy first; the network is not asked`, async () => {
    const w = runWorker(code);
    await w.fire('install');
    assert.equal(w.state.skipped, 0, 'a new version waits: it does not take over on its own');
    await w.fire('activate');
    const before = w.state.network;
    w.state.body = 'version two';
    const r = await w.fire('fetch', { request: { url: w.base + 'index.html', method: 'GET', mode: 'navigate' } });
    assert.match(await r.text(), /^version one/);
    assert.equal(w.state.network, before, 'no network request for a cached file');
    const nav = await w.fire('fetch', { request: { url: w.base + '#/today', method: 'GET', mode: 'navigate' } });
    assert.ok(nav, 'a navigation falls back to the cached page');
  });
  test(`${name}: switches to a waiting version only when the page asks`, async () => {
    const w = runWorker(code);
    await w.fire('install');
    w.fire('message', { data: 'something else' });
    assert.equal(w.state.skipped, 0);
    w.fire('message', { data: 'skip-waiting' });
    assert.equal(w.state.skipped, 1);
  });
  test(`${name}: files that are not cached yet come from the network and are kept`, async () => {
    const w = runWorker(code);
    await w.fire('activate');
    const r = await w.fire('fetch', { request: { url: w.base + 'extra.png', method: 'GET', mode: 'no-cors' } });
    assert.match(await r.text(), /extra\.png/);
    const n = w.state.network;
    await w.fire('fetch', { request: { url: w.base + 'extra.png', method: 'GET', mode: 'no-cors' } });
    assert.equal(w.state.network, n, 'second time from the cache');
  });
}

test('the Pages workers for /full/ and /lite/ share one origin and never delete each other\'s copy', async () => {
  // One origin has one set of caches. Updating the full app used to delete the lite app's offline copy, and the reverse.
  const store = new Map();
  const as = (app, build) => pagesServiceWorker({ app }).replace('__BUILD__', build);
  const lite = runWorker(as('lite', 'aaaaaaaaaaaa'), 'https://example.org/site/lite/', store);
  await lite.fire('install'); await lite.fire('activate');
  const full1 = runWorker(as('full', 'aaaaaaaaaaaa'), 'https://example.org/site/full/', store);
  await full1.fire('install'); await full1.fire('activate');
  store.set('pm-pages-0123456789ab', new Map());   // left by an older build that did not name its caches
  const full2 = runWorker(as('full', 'bbbbbbbbbbbb'), 'https://example.org/site/full/', store);
  await full2.fire('install'); await full2.fire('activate');
  assert.deepEqual([...store.keys()].sort(), ['pm-pages-full-bbbbbbbbbbbb', 'pm-pages-lite-aaaaaaaaaaaa']);
  assert.ok(store.get('pm-pages-lite-aaaaaaaaaaaa').has('https://example.org/site/lite/index.html'), 'the lite copy is still there');
});

test('root sw.js lists every module, stylesheet, font, and data file the app loads', () => {
  const listed = new Set([...rootSW.matchAll(/'\.\/([^']+)'/g)].map(m => m[1]));
  const walk = d => fs.readdirSync(new URL('../' + d, import.meta.url), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(d + '/' + e.name) : [d + '/' + e.name]);
  const need = [...walk('src').filter(f => /\.(js|css|woff2)$/.test(f)), ...walk('data').filter(f => f.endsWith('.json')), 'index.html', 'breathe.html', 'manifest.webmanifest'];
  const missing = need.filter(f => !listed.has(f));
  assert.deepEqual(missing, []);
});

// P1-4 (fix pass of September 30, 2026): another site under the same GitHub Pages address is the same origin and can
// rewrite this app's saved copy in Cache Storage (audit/e2e/shared-origin.mjs, step 3). The worker the site ships must
// never run a changed copy. This builds the hosted lite app and runs its own sw.js.
test('P1-4: the hosted lite worker, as built, refuses a saved page that another site on the address changed', async () => {
  execFileSync(process.execPath, ['tools/bundle.mjs', '--lite', '--pages'], { cwd: new URL('../', import.meta.url), stdio: 'ignore' });
  const dir = 'dist/pages/lite/';
  const code = read(dir + 'sw.js');
  const page = read(dir + 'index.html');
  const base = 'https://example.org/Peace-Meal-Full/lite/';
  const w = runWorker(code, base);
  w.state.files = { [base]: page, [base + 'index.html']: page };
  for (const f of ['manifest.webmanifest', 'icon-180.png', 'icon-512.png']) w.state.files[base + f] = fs.readFileSync(new URL('../' + dir + f, import.meta.url));
  await w.fire('install'); await w.fire('activate');
  const navigate = u => ({ request: { url: u, method: 'GET', mode: 'navigate' } });
  const n0 = w.state.network;
  let r = await w.fire('fetch', navigate(base));
  const same = async x => (await x.text()) === page;   // compared as a yes or no: the page is 6 MB
  assert.ok(await same(r), 'the saved page opens');
  assert.equal(w.state.network, n0, 'from the saved copy, without the network');
  // Another page on the origin writes its own page over the saved copy.
  const [name] = [...w.store.keys()];
  const other = '<!doctype html><title>Peace Meal for one</title><h1>This is not Peace Meal</h1>';
  for (const u of [base, base + 'index.html']) w.store.get(name).set(u, w.res(other));
  r = await w.fire('fetch', navigate(base + '#/today'));
  assert.ok(await same(r), 'the changed copy is not run: a fresh copy comes from the site');
  assert.ok(w.state.network > n0);
  r = await w.fire('fetch', navigate(base));
  assert.ok(await same(r), 'and the fresh copy is saved again');
  // With no connection, a changed copy is still never run: a short notice shows instead.
  for (const u of [base, base + 'index.html']) w.store.get(name).set(u, w.res(other));
  w.state.offline = true;
  r = await w.fire('fetch', navigate(base));
  assert.equal(r.status, 503);
  assert.match(await r.text(), /Peace Meal did not open/);
});

test('P1-4: while a newer build is on the site, its page is served but not saved under the old version; install saves only matching files', async () => {
  const { pagesServiceWorker, fingerprint } = await import('../tools/lib/pages-sw.mjs');
  const base = 'https://example.org/Peace-Meal-Full/full/';
  const v1 = '<!doctype html><title>Peace Meal</title><p>build one</p>', v2 = '<!doctype html><title>Peace Meal</title><p>build two</p>';
  const w = runWorker(pagesServiceWorker({ app: 'full', fingerprints: { '': fingerprint(v1), 'index.html': fingerprint(v1) } }), base);
  w.state.files = { [base]: v2, [base + 'index.html']: v2 };   // the site already has build two when build one's worker installs
  await w.fire('install'); await w.fire('activate');
  const saved = w.store.get([...w.store.keys()][0]);
  assert.equal(saved.has(base + 'index.html'), false, 'a file that does not match this version is not saved at install');
  const r = await w.fire('fetch', { request: { url: base, method: 'GET', mode: 'navigate' } });
  assert.equal(await r.text(), v2, 'the site\'s newer page is served');
  assert.equal(saved.has(base), false, 'and not saved under the old version');
});
