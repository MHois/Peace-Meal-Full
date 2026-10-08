// P3-10 (audit of September 30, 2026): when the device's storage is full, a grocery tick, a display setting, and the
// Home Screen guide's "done" mark failed to save without a word, so the person found the tick gone or the guide back
// the next time. The main profile already said "Not saved". These three now say so too, in plain words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mem = new Map();
let full = false;
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { if (full) { const e = new Error('The quota has been exceeded.'); e.name = 'QuotaExceededError'; throw e; } mem.set(k, String(v)); }, removeItem: k => { mem.delete(k); } };
const toast = { textContent: '', classList: { add() {}, remove() {}, toggle() {} } };
globalThis.document = { readyState: 'loading', addEventListener() {}, removeEventListener() {}, getElementById: id => (id === 'toast' ? toast : null), querySelector: () => null, querySelectorAll: () => [], activeElement: null, documentElement: { setAttribute() {}, removeAttribute() {}, classList: { toggle() {}, add() {}, remove() {}, contains: () => false } } };
globalThis.window = { addEventListener() {}, location: { hash: '' } };
globalThis.location = { hash: '', href: 'https://example.org/' };
const common = await import('../src/ui/common.js');

test('P3-10: a small save that fails says so, and a save that works says nothing', () => {
  assert.equal(typeof common.uiSaveSmall, 'function', 'common.js has one helper for small saves');
  full = false; toast.textContent = '';
  assert.equal(common.uiSaveSmall('k', 'v', 'That tick was not saved.'), true);
  assert.equal(mem.get('k'), 'v');
  assert.equal(toast.textContent, '');
  full = true;
  assert.equal(common.uiSaveSmall('k', 'w', 'That tick was not saved.'), false);
  assert.match(toast.textContent, /^That tick was not saved\. .*storage/, 'the person is told, with what to do');
  assert.equal(mem.get('k'), 'v', 'nothing half-written');
  full = false;
});

test('P3-10: a display setting that cannot be saved says so, and still applies for now', () => {
  full = true; toast.textContent = '';
  assert.equal(common.uiSaveUiPrefs({ theme: 'dark', largeText: true, largeTextSet: true }), false);
  assert.match(toast.textContent, /setting/i);
  full = false;
  assert.equal(common.uiSaveUiPrefs({ theme: 'dark', largeText: true, largeTextSet: true }), true);
});

test('P3-10: the grocery tick and the Home Screen guide use the helper', () => {
  const grocery = fs.readFileSync(new URL('../src/ui/grocery.js', import.meta.url), 'utf8');
  const install = fs.readFileSync(new URL('../src/ui/install.js', import.meta.url), 'utf8');
  assert.match(grocery, /function grocerySaveChecked[^]*?uiSaveSmall\(/, 'grocery ticks');
  assert.match(install, /const close = \(\) => \{[^\n]*uiSaveSmall\(/, 'the guide\'s "Got it"');
  assert.doesNotMatch(grocery + install, /setItem\([^)]*\)[^;\n]*\); \} catch \{ \/\* ignore \*\/ \}/, 'no silent catch left around these saves');
});
