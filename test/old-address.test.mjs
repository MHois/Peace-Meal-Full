// P1-6 (audit of September 30, 2026): the "Peace Meal has moved" page and the replacement service worker for the
// retired address (tools/old-address/). Publishing them is the owner's decision; these tests keep the kit correct until
// then. The page runs inside an old Home Screen icon's own storage: it must save the old data's text exactly, change and
// delete nothing, load nothing from the internet, and send each icon to the matching new app. The data is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

const html = fs.readFileSync(new URL('../tools/old-address/index.html', import.meta.url), 'utf8');
const swCode = fs.readFileSync(new URL('../tools/old-address/sw.js', import.meta.url), 'utf8');
const script = html.slice(html.indexOf('<script>') + '<script>'.length, html.indexOf('</script>'));
const NEW = 'https://mchoisington.github.io/Peace-Meal-Full/';

function runPage({ stored = {}, pathname = '/specialty-nutrition-app/', share = null } = {}) {
  const writes = [];
  const localStorage = {
    getItem: k => (Object.prototype.hasOwnProperty.call(stored, k) ? stored[k] : null),
    setItem: k => writes.push('set ' + k), removeItem: k => writes.push('remove ' + k), clear: () => writes.push('clear')
  };
  const els = {};
  const el = id => (els[id] ||= { id, hidden: true, href: '', textContent: '', children: [], listeners: {}, addEventListener(t, f) { this.listeners[t] = f; }, appendChild(c) { this.children.push(c); } });
  const downloads = [], blobs = new Map();
  const document = { getElementById: el, createElement: tag => ({ tag, textContent: '', href: '', download: '', click() { downloads.push(this); }, remove() {} }), body: { appendChild() {} } };
  const URLx = { createObjectURL: b => { const u = 'blob:' + blobs.size; blobs.set(u, b); return u; } };
  vm.runInNewContext(script, { localStorage, document, location: { pathname }, navigator: share || {}, URL: URLx, Blob, File });
  return { els, writes, downloads, blobs };
}
const person = JSON.stringify({ version: 2, people: [{ id: 'p1', name: 'Test Person', allergens: ['allergen-peanut'] }], log: [{ date: '2026-09-01', text: 'soup' }] });

test('P1-6 kit: the page\'s Content Security Policy allows exactly its own script', () => {
  const want = /script-src 'sha256-([^']+)'/.exec(html)[1];
  assert.equal(crypto.createHash('sha256').update(script, 'utf8').digest('base64'), want, 'recompute the hash in the page if the script changes');
  assert.match(html, /default-src 'none'/);
  assert.doesNotMatch(html, /\ssrc=/, 'no file is loaded from anywhere');
  for (const [, href] of html.matchAll(/href="([^"]+)"/g)) assert.ok(href.startsWith(NEW), href);
});

test('P1-6 kit: "Save my information" saves the old data\'s text exactly and changes nothing', async () => {
  for (const key of ['peace-meal:v1', 'specialty-nutrition-app:v1']) {
    const p = runPage({ stored: { [key]: person } });
    assert.equal(p.els['has-data'].hidden, false, key);
    p.els.save.listeners.click();
    assert.equal(p.downloads.length, 1);
    assert.match(p.downloads[0].download, /^peace-meal-backup-\d{4}-\d{2}-\d{2}\.json$/);
    assert.equal(await p.blobs.get(p.downloads[0].href).text(), person, 'byte for byte');
    assert.deepEqual(p.writes, [], 'nothing written or deleted');
  }
});

test('P1-6 kit: on an iPhone the share sheet gets the same file, and nothing changes', async () => {
  let shared = null;
  const share = { canShare: () => true, share: async x => { shared = x; } };
  const p = runPage({ stored: { 'peace-meal:v1': person }, share });
  p.els.save.listeners.click();
  assert.ok(shared && shared.files && shared.files.length === 1);
  assert.equal(await shared.files[0].text(), person);
  assert.deepEqual(p.writes, []);
});

test('P1-6 kit: each old icon is sent to the matching new app', () => {
  for (const [path, target] of [['/specialty-nutrition-app/', ''], ['/specialty-nutrition-app/index.html', ''], ['/specialty-nutrition-app/lite/', 'lite/'], ['/specialty-nutrition-app/full/index.html', 'full/']]) {
    const p = runPage({ pathname: path });
    assert.equal(p.els['new-link'].href, NEW + target, path);
    assert.equal(p.els['new-link-2'].href, NEW + target, path);
  }
});

test('P1-6 kit: with nothing saved, or saved data that cannot be read, it says so and still changes nothing', () => {
  const none = runPage();
  assert.equal(none.els['no-data'].hidden, false);
  assert.deepEqual(none.writes, []);
  const bad = runPage({ stored: { 'peace-meal:v1': '{"people": [' } });
  assert.equal(bad.els['no-data'].hidden, false);
  assert.match(bad.els['no-data'].children.map(c => c.textContent).join(' '), /could not be read/);
  assert.deepEqual(bad.writes, []);
});

test('P1-6 kit: the replacement worker asks the network first, falls back to the stored copy, and deletes nothing', async () => {
  assert.doesNotMatch(swCode, /\.delete\(|\.clear\(|removeItem|localStorage/);
  const listeners = {};
  let online = true;
  const stored = { page: 'stored old app' };
  const ctx = {
    self: { addEventListener: (t, f) => { listeners[t] = f; }, skipWaiting() {}, clients: { claim: async () => {} } },
    fetch: async () => { if (!online) throw new TypeError('offline'); return 'moved page'; },
    caches: { match: async () => stored.page },
    Response: { error: () => 'error' }
  };
  vm.runInNewContext(swCode, ctx);
  const nav = async () => { let p = null; listeners.fetch({ request: { method: 'GET', mode: 'navigate' }, respondWith: x => { p = x; } }); return p; };
  assert.equal(await nav(), 'moved page');
  online = false;
  assert.equal(await nav(), 'stored old app', 'no connection: the stored copy, with the data');
  let responded = false;
  listeners.fetch({ request: { method: 'GET', mode: 'no-cors' }, respondWith: () => { responded = true; } });
  assert.equal(responded, false, 'only pages go through it');
});
