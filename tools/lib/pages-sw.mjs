// The service worker for the hosted apps at /full/ and /lite/ (tools/bundle.mjs --pages writes it next to index.html).
// Kept here so test/sw.test.mjs runs the same code the site ships.
//
// Cache first (2026-09 audit): the saved copy opens at once, online or not; a new version (__BUILD__ is stamped by the
// Pages workflow with the commit) installs in the background and waits until the person taps "Update ready, tap to
// reload", or until the app is next opened after every copy of it was closed. /full/ and /lite/ share one origin, so
// they share one set of caches: each app names its caches after itself and clears only its own old versions (and the
// unnamed ones older builds left), never the other app's copy.
//
// P1-4 (fix pass of September 30, 2026): every GitHub Pages site under the same account address is the same origin, so
// a page on any of them can rewrite this app's Cache Storage (audit/e2e/shared-origin.mjs). Each file this version
// saves has its SHA-256 fingerprint, taken when the site was built, written into this worker, which other pages cannot
// change. A saved copy that does not match is never run: it is deleted and fetched fresh; with no connection, a short
// notice shows instead of the changed page.
import crypto from 'node:crypto';

// SHA-256 of a file's bytes, base64, the same form the worker computes in the browser.
export function fingerprint(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('base64');
}

// app: 'full' or 'lite'. fingerprints: { 'index.html': ..., '': (the folder, which serves index.html), ... }, paths
// relative to the app's folder.
export function pagesServiceWorker({ app, fingerprints = {} }) {
  return `// Cache first; a new version installs in the background and waits for the app's "Update ready, tap to reload".
// Every saved file is checked against the fingerprint this version was built with; a changed copy is never run.
const APP = 'pm-pages-${app}-';
const VERSION = APP + '__BUILD__';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-512.png'];
const FP = ${JSON.stringify(fingerprints)};
const BASE = new URL('./', location).pathname;
const REFUSED = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Peace Meal</title><body style="font: 20px/1.5 system-ui, sans-serif; margin: 24px; max-width: 34em; color: #1f2a1f; background: #fbfaf7"><h1 style="font-size: 1.3em">Peace Meal did not open</h1><p>The copy of Peace Meal saved on this device was changed by something other than Peace Meal, so it was not opened.</p><p>Connect to the internet (Wi-Fi or data) and open Peace Meal again. It will load a fresh copy.</p><p>If you see this again, tell the person who set up Peace Meal for you.</p></body></html>';
const pathOf = u => { const p = new URL(u, location).pathname; return p.startsWith(BASE) ? p.slice(BASE.length) : null; };
async function sha(res) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', await res.clone().arrayBuffer()));
  let s = '';
  for (let i = 0; i < d.length; i++) s += String.fromCharCode(d[i]);
  return btoa(s);
}
// True when the file has no fingerprint (not part of this version) or matches it.
async function intact(res, path) { const want = path == null ? undefined : FP[path]; return !want || (await sha(res)) === want; }
self.addEventListener('install', e => { e.waitUntil((async () => {
  const c = await caches.open(VERSION);
  await Promise.all(SHELL.map(async u => {
    try { const r = await fetch(new Request(u, { cache: 'reload' })); if (r && r.ok && await intact(r, pathOf(u))) await c.put(u, r); } catch (err) { /* stays unsaved; fetched when first needed */ }
  }));
})()); });
self.addEventListener('message', e => { if (e.data === 'skip-waiting') self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil((async () => { for (const k of await caches.keys()) if (k !== VERSION && (k.startsWith(APP) || /^pm-pages-[0-9a-f]{12}$/.test(k))) await caches.delete(k); await self.clients.claim(); })()); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(VERSION);
    let key = req, path = pathOf(req.url);
    let hit = await c.match(req, { ignoreSearch: true });
    if (!hit && req.mode === 'navigate') { key = './index.html'; path = 'index.html'; hit = await c.match(key); }
    if (hit) {
      if (await intact(hit, path)) return hit;
      await c.delete(key, { ignoreSearch: true });
    }
    let fresh = null, failure = null;
    try { fresh = await fetch(hit ? new Request(req.url, { cache: 'reload' }) : req); } catch (err) { failure = err; }
    if (fresh && fresh.ok) {
      // A copy from the site itself is served. It is saved only when it is this version's file; a newer build's file
      // (the site was updated and the new worker has not taken over yet) is served without being saved.
      if (await intact(fresh, path)) await c.put(key, fresh.clone());
      return fresh;
    }
    if (hit) return new Response(REFUSED, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    if (failure) throw failure;
    return fresh;
  })());
});
`;
}
