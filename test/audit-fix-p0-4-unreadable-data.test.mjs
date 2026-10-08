// P0-4 (audit of September 30, 2026): saved data the app could not read (a cut-off save, or a person that is not an
// object) was replaced by an empty profile with no message, and the first new entry overwrote it for good.
// Now the unreadable text is copied to its own key before anything is saved, the app says so, and nothing overwrites
// the only copy. The test storage is a plain object; every person is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, save, clearAll, storeState, STORE_KEYS, UNREADABLE_MARK, releaseUnreadable } from '../src/store.js';

function fakeStorage(init = {}, failOn = null) {
  const m = new Map(Object.entries(init));
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (failOn && failOn(k)) throw new Error('QuotaExceededError'); m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    key: i => [...m.keys()][i] ?? null,
    get length() { return m.size; },
    _map: m
  };
}
const KEY = STORE_KEYS.full;
const person = name => ({ id: 'p1', name, adult: true, modules: [], allergens: [] });
const good = JSON.stringify({ version: 2, people: [person('Test Person')], diary: [{ date: '2026-09-01', text: 'soup' }] });
const cut = good.slice(0, good.length - 40);
const copies = s => [...s._map.keys()].filter(k => k.includes(UNREADABLE_MARK));

test('P0-4: a cut-off save is copied aside before anything else, and the app knows it could not be read', () => {
  const s = fakeStorage({ [KEY]: cut, [KEY + ':migrated']: '{}' });
  const p = load(s, false);
  assert.deepEqual(p.people, []);
  assert.ok(storeState.unreadable, 'the app state says the data could not be read');
  assert.equal(storeState.unreadable.repaired, false);
  assert.equal(copies(s).length, 1);
  assert.equal(s.getItem(copies(s)[0]), cut, 'the copy is the original text, byte for byte');
  p.people.push(person('New Person'));
  assert.equal(save(p, s), true);
  assert.equal(s.getItem(copies(s)[0]), cut, 'the first new save leaves the copy alone');
});

test('P0-4: a person that is null is dropped, everything else is kept, and the original is copied aside', () => {
  const raw = JSON.stringify({ version: 2, people: [null, person('Test Person')], diary: [{ date: '2026-09-01', text: 'soup' }] });
  const s = fakeStorage({ [KEY]: raw, [KEY + ':migrated']: '{}' });
  const p = load(s, false);
  assert.deepEqual(p.people.map(x => x.name), ['Test Person']);
  assert.equal(p.diary.length, 1);
  assert.equal(storeState.unreadable.repaired, true);
  assert.equal(s.getItem(copies(s)[0]), raw);
});

test('P0-4: the same unreadable text is copied once, not again on every launch', () => {
  const s = fakeStorage({ [KEY]: cut, [KEY + ':migrated']: '{}' });
  load(s, false);
  load(s, false);
  assert.equal(copies(s).length, 1);
});

test('P0-4: when the copy cannot be written, nothing is saved over the only copy until the person lets it go', () => {
  const s = fakeStorage({ [KEY]: cut, [KEY + ':migrated']: '{}' }, k => k.includes(UNREADABLE_MARK));
  const p = load(s, false);
  assert.equal(storeState.unreadable.copyFailed, true);
  assert.equal(save(p, s), false, 'the save is refused, and the app shows it as not saved');
  assert.equal(s.getItem(KEY), cut);
  releaseUnreadable();
  assert.equal(save(p, s), true, 'after "Start fresh" the app saves again');
});

test('P0-4: Clear data leaves the kept copy alone', () => {
  const s = fakeStorage({ [KEY]: cut, [KEY + ':migrated']: '{}' });
  load(s, false);
  clearAll(s, false);
  assert.equal(copies(s).length, 1);
  assert.equal(s.getItem(copies(s)[0]), cut);
});

test('P0-4: readable data is not copied and no notice is raised', () => {
  const s = fakeStorage({ [KEY]: good, [KEY + ':migrated']: '{}' });
  const p = load(s, false);
  assert.equal(p.people.length, 1);
  assert.equal(storeState.unreadable, null);
  assert.equal(copies(s).length, 0);
});
