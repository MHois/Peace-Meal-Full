// P2-6 (audit of September 30, 2026): both builds kept grocery ticks under the same keys (sn-grocery:<week>), so Clear
// data in one build wiped the other build's ticks (audit/e2e/data-safety.mjs, c2). Clear data also left this device's
// shared-store key (peace-meal:device) behind. Each build now keeps its own ticks, copied once from the shared keys
// with each copy checked and the shared keys left in place (the same way as the profile key), and Clear data removes
// this build's ticks and the device key. Nothing here is a real person's data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as store from '../src/store.js';

// An in-memory stand-in for localStorage, with key enumeration, that can be told to fail on one key.
function fakeStorage(initial = {}, { failSetFor = null } = {}) {
  const m = new Map(Object.entries(initial));
  return {
    map: m,
    get length() { return m.size; },
    key: i => [...m.keys()][i] ?? null,
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (failSetFor && k.startsWith(failSetFor)) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } m.set(k, String(v)); },
    removeItem: k => { m.delete(k); }
  };
}
const WEEK = '2026-09-28', OLD = 'sn-grocery:' + WEEK;

test('P2-6: each build has its own grocery keys', () => {
  assert.equal(typeof store.groceryKeyPrefix, 'function');
  assert.notEqual(store.groceryKeyPrefix(true), store.groceryKeyPrefix(false));
  for (const lite of [true, false]) assert.ok(!store.groceryKeyPrefix(lite).startsWith('sn-grocery:'));
});

test('P2-6: the first launch copies the shared ticks to the build\'s own key, checks the copy, and leaves the shared key', () => {
  const s = fakeStorage({ [OLD]: '["milk","oats"]' });
  const r = store.migrateGroceryKeys(true, s);
  assert.equal(r.migrated, true); assert.equal(r.copied, 1);
  assert.equal(s.map.get(store.groceryKeyPrefix(true) + WEEK), '["milk","oats"]');
  assert.equal(s.map.get(OLD), '["milk","oats"]', 'shared key untouched');
  assert.equal(store.migrateGroceryKeys(true, s).copied, 0, 'once only');
  const f = store.migrateGroceryKeys(false, s);
  assert.equal(f.copied, 1, 'the other build makes its own copy');
  s.map.set(store.groceryKeyPrefix(true) + WEEK, '["milk"]');
  assert.equal(s.map.get(store.groceryKeyPrefix(false) + WEEK), '["milk","oats"]', 'a tick in one build does not change the other');
});

test('P2-6: a copy that cannot be written is tried again next launch, and nothing is lost', () => {
  const s = fakeStorage({ [OLD]: '["milk"]' }, { failSetFor: 'peace-meal-lite' });
  const r = store.migrateGroceryKeys(true, s);
  assert.equal(r.migrated, false);
  assert.equal(s.map.get(OLD), '["milk"]');
  const ok = fakeStorage(Object.fromEntries(s.map));
  assert.equal(store.migrateGroceryKeys(true, ok).copied, 1, 'tried again');
});

test('P2-6: Clear data removes this build\'s ticks and leaves the other build\'s, and the shared copy while the other build still needs it', () => {
  const s = fakeStorage({ [OLD]: '["x"]', [store.STORE_KEYS.full]: '{"people":[]}' });
  store.load(s, true);                                   // the lite build launches and copies
  s.map.set(store.groceryKeyPrefix(true) + '2026-10-05', '["y"]');
  store.clearAll(s, true);
  assert.equal([...s.map.keys()].filter(k => k.startsWith(store.groceryKeyPrefix(true))).length, 0, 'lite ticks gone');
  assert.equal(s.map.get(OLD), '["x"]', 'the full build has not copied it yet, so it stays (data-safety c2)');
  store.load(s, true);
  assert.equal([...s.map.keys()].filter(k => k.startsWith(store.groceryKeyPrefix(true))).length, 0, 'cleared ticks do not come back');
  store.load(s, false);                                  // the full build copies
  assert.equal(s.map.get(store.groceryKeyPrefix(false) + WEEK), '["x"]');
  store.clearAll(s, true);
  assert.equal(s.map.has(OLD), false, 'both builds have their own now, so the shared copy goes');
  assert.equal(s.map.get(store.groceryKeyPrefix(false) + WEEK), '["x"]', 'the full build keeps its ticks');
});

test('P2-6: Clear data removes this device\'s shared-store key', () => {
  const s = fakeStorage({ 'peace-meal:device': '{"fingerprint":"test-only"}' });
  store.load(s, true);
  store.clearAll(s, true);
  assert.equal(s.map.has('peace-meal:device'), false);
  const sync = readFileSync(new URL('../src/engine/sync.js', import.meta.url), 'utf8');
  assert.match(sync, /const LS_KEY = 'peace-meal:device';/, 'the key the shared store uses');
});

test('P2-6: the grocery screen reads and writes the build\'s own keys', () => {
  const src = readFileSync(new URL('../src/ui/grocery.js', import.meta.url), 'utf8');
  assert.ok(!src.includes("'sn-grocery:'"), 'no shared key in the grocery screen');
  assert.match(src, /groceryKeyPrefix\(/);
  const settings = readFileSync(new URL('../src/ui/settings.js', import.meta.url), 'utf8');
  assert.ok(!settings.includes("startsWith('sn-grocery:')"), 'Clear data no longer wipes every build\'s ticks');
});
