// Ready to publish; publishing is the owner's decision (tools/old-address/README.md). First proposed by the audit of
// September 30, 2026 (phase 7, item 31). Replacement service worker for the retired address's front page
// (/specialty-nutrition-app/sw.js). The worker published there before September answered pages from its stored copy
// first, so an icon made from the front page would keep opening the stored old app and never see the "moved" page.
// A browser checks this file for changes when the page is opened; this version asks the network first and falls back
// to whatever is stored when there is no connection. It deletes nothing: the old stored copy stays as the offline
// fallback until the person removes the icon.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(async () => (await caches.match(e.request, { ignoreSearch: true })) || (await caches.match('./index.html')) || Response.error()));
});
