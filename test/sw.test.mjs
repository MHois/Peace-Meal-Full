// Service workers (audit item 9): cache first, a new version waits for "Update ready, tap to reload", and the root
// worker's lists cover every file the app loads. The workers run here in a small stand-in for the browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const rootSW = read('sw.js');
const bundle = read('tools/bundle.mjs');
const pagesSW = bundle.slice(bundle.indexOf("fs.writeFileSync(new URL(dir + 'sw.js', root), `") + "fs.writeFileSync(new URL(dir + 'sw.js', root), `".length, bundle.indexOf('`);', bundle.indexOf("fs.writeFileSync(new URL(dir + 'sw.js', root), `")));

function runWorker(code, base = 'https://example.org/app/', store = new Map()) {
  const listeners = {};
  const state = { network: 0, body: 'version one', skipped: 0, claimed: 0 };
  const key = (u, ignoreSearch) => { const x = new URL(u, base); if (ignoreSearch) x.search = ''; return x.href; };
  const res = body => ({ ok: true, body, clone() { return res(body); }, text: async () => body });
  class Request { constructor(u, init = {}) { this.url = new URL(u, base).href; this.method = 'GET'; this.mode = init.mode; this.cache = init.cache; } }
  const fetch = async req => { state.network++; return res(state.body + ' of ' + (req.url || req)); };
  const caches = {
    open: async name => {
      if (!store.has(name)) store.set(name, new Map());
      const m = store.get(name);
      return {
        add: async req => { m.set(key(req.url || req, true), await fetch(req)); },
        put: async (req, r) => { m.set(key(req.url || req, true), r); },
        match: async (req, opts = {}) => { const r = m.get(key(req.url || req, opts.ignoreSearch)); return r ? r.clone() : undefined; }
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
  vm.runInNewContext(code, { self, caches, fetch, Request, URL, location: new URL(base), Promise, console });
  const fire = async (type, extra = {}) => { let p = null; const ev = { waitUntil: x => { p = x; }, respondWith: x => { p = x; }, ...extra }; listeners[type](ev); return p; };
  return { state, fire, store, base };
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
  const as = (app, build) => pagesSW.replace('${PAGES_APP}', app).replace('__BUILD__', build);
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
