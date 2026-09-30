// Service worker for the module app at the site root. Cache first (2026-09 audit): every file the app needs is stored
// when this version installs and is served from the cache after that, so the app opens at once, with or without a
// connection. A new version (the Pages workflow stamps VERSION with the commit) downloads and installs in the
// background and then waits; the app shows "Update ready, tap to reload", and the tap switches to it. Until then the
// running version keeps serving its own files, so code and data never mix across versions.
// Serving the folder locally (npm run serve): change VERSION, or tick "Update on reload" in the browser's developer
// tools, to see edits. test/sw.test.mjs checks that SHELL and DATA list every file the app loads.
const VERSION = 'pm-v1.3.0';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './icon.svg', './icon-180.png', './icon-512.png', './breathe.html', './src/app.css', './src/app.js', './src/store.js',
  './src/fonts/fonts.css', './src/fonts/atkinson-hyperlegible-400-latin.woff2', './src/fonts/atkinson-hyperlegible-400-latin-ext.woff2', './src/fonts/atkinson-hyperlegible-400-italic-latin.woff2', './src/fonts/atkinson-hyperlegible-400-italic-latin-ext.woff2', './src/fonts/atkinson-hyperlegible-700-latin.woff2', './src/fonts/atkinson-hyperlegible-700-latin-ext.woff2', './src/fonts/fraunces-latin.woff2', './src/fonts/fraunces-latin-ext.woff2', './src/fonts/fraunces-vietnamese.woff2',
  './src/engine/checker.js', './src/engine/crypto.js', './src/engine/cuisine.js', './src/engine/dictionary.js', './src/engine/dietlists.js', './src/engine/energy.js', './src/engine/grocery.js', './src/engine/group.js', './src/engine/household.js', './src/engine/nutrition.js', './src/engine/pantry.js', './src/engine/plan.js', './src/engine/planner.js', './src/engine/report.js', './src/engine/screen.js', './src/engine/spice.js', './src/engine/swaps.js', './src/engine/sync.js',
  './src/ui/breathe.js', './src/ui/check.js', './src/ui/common.js', './src/ui/dietlist.js', './src/ui/grocery.js', './src/ui/home.js', './src/ui/household.js', './src/ui/install.js', './src/ui/learn.js', './src/ui/lite.js', './src/ui/log.js', './src/ui/owner.js', './src/ui/pantry.js', './src/ui/people.js', './src/ui/plan.js', './src/ui/recipes-edit.js', './src/ui/recipes.js', './src/ui/settings.js', './src/ui/sharing.js', './src/ui/today.js', './src/ui/together.js', './src/ui/week.js'
];
const DATA = ['./data/sources.json', './data/conditions.json', './data/dictionaries.json', './data/diet-lists.json', './data/foods.json', './data/recipes.json', './data/recipes-open.json', './data/recipes-usda.json', './data/articles.json', './data/swaps.json'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // cache: 'reload' skips the browser's own HTTP cache, so a new version never stores an older file.
    await Promise.all([...SHELL, ...DATA].map(u => cache.add(new Request(u, { cache: 'reload' })).catch(() => null)));
  })());
});

// The page sends this when the person taps "Update ready, tap to reload".
self.addEventListener('message', event => { if (event.data === 'skip-waiting') self.skipWaiting(); });

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await cache.match('./index.html') : null);
    if (hit) return hit;
    const fresh = await fetch(req);
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  })());
});
