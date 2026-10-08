// P3-9 (audit of September 30, 2026): the display settings (theme, large text) were stored under one key,
// "peace-meal:ui", that both builds read. On the hosted site both builds share one web address, so turning large text
// off in the full app also turned it off in Peace Meal for one. Each build now keeps its own settings
// ("peace-meal-lite:ui", "peace-meal-full:ui"); the shared key from before is copied into a build's own key the first
// time that build runs, and is left in place.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: k => { mem.delete(k); } };
globalThis.window = { addEventListener() {}, location: { hash: '' } };
globalThis.location = { hash: '', href: 'https://example.org/' };
const { uiLoadUiPrefs, uiSaveUiPrefs } = await import('../src/ui/common.js');
const as = build => { window.__PEACE_MEAL_LITE__ = build === 'lite'; };
const LEGACY = '{"theme":"dark","largeText":false,"largeTextSet":true}';

test('P3-9: each build starts from the settings saved before, and the old copy stays', () => {
  mem.clear(); mem.set('peace-meal:ui', LEGACY);
  as('lite');
  assert.deepEqual(uiLoadUiPrefs(), { theme: 'dark', largeText: false, largeTextSet: true }, 'lite keeps what was saved');
  assert.equal(mem.get('peace-meal-lite:ui'), LEGACY, 'copied into the lite build\'s own key');
  assert.equal(mem.get('peace-meal:ui'), LEGACY, 'the old copy is left in place');
  as('full');
  assert.deepEqual(uiLoadUiPrefs(), { theme: 'dark', largeText: false, largeTextSet: true }, 'full keeps it too');
  assert.equal(mem.get('peace-meal-full:ui'), LEGACY);
});

test('P3-9: a setting changed in one build does not change the other', () => {
  mem.clear(); mem.set('peace-meal:ui', LEGACY);
  as('lite'); uiSaveUiPrefs({ ...uiLoadUiPrefs(), largeText: true, largeTextSet: true });
  as('full');
  assert.equal(uiLoadUiPrefs().largeText, false, 'large text in lite leaves the full app as it was');
  uiSaveUiPrefs({ ...uiLoadUiPrefs(), theme: 'light' });
  as('lite');
  assert.deepEqual(uiLoadUiPrefs(), { theme: 'dark', largeText: true, largeTextSet: true }, 'and the full app\'s theme leaves lite as it was');
  assert.equal(mem.get('peace-meal:ui'), LEGACY, 'the old copy is never overwritten');
});

test('P3-9: with nothing saved, lite starts with large text and the full app without', () => {
  mem.clear();
  as('lite'); assert.equal(uiLoadUiPrefs().largeText, true);
  as('full'); assert.equal(uiLoadUiPrefs().largeText, false);
});
