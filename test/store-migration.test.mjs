// Storage keys: each build keeps its own key; the first launch after the update copies the old shared key, verifies
// the copy, and leaves the old key in place. Nothing is lost if the copy fails partway (audit item 7).
import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateStorage, load, save, clearAll, storeState, STORE_KEYS, LEGACY_KEYS, exportJSON, importJSON } from '../src/store.js';

// An in-memory stand-in for localStorage that can be told to fail.
function fakeStorage(initial = {}, { failSetFor = null, corruptReadFor = null, quotaAfter = Infinity } = {}) {
  const m = new Map(Object.entries(initial));
  let writes = 0;
  return {
    map: m,
    getItem: k => (corruptReadFor === k && m.has(k) ? m.get(k).slice(0, -5) : (m.has(k) ? m.get(k) : null)),
    setItem: (k, v) => { if (failSetFor === k || ++writes > quotaAfter) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } m.set(k, String(v)); },
    removeItem: k => { m.delete(k); }
  };
}
const OLD = LEGACY_KEYS[0];
// A made-up profile. Not based on anyone real.
const profile = { version: 2, people: [{ id: 'p-test', name: 'Test Adult A', modules: ['osteoarthritis'], allergens: [] }], log: [{ date: '2026-09-01', person: 'p-test', meal: 'symptom', symptoms: { bloating: 1 } }], diary: [], activePerson: 'p-test' };
const raw = JSON.stringify(profile);

test('the lite build copies the shared key to its own key, verifies it, and leaves the shared key in place', () => {
  const s = fakeStorage({ [OLD]: raw });
  const r = migrateStorage(true, s);
  assert.equal(r.migrated, true);
  assert.equal(r.key, STORE_KEYS.lite);
  assert.equal(s.map.get(STORE_KEYS.lite), raw, 'exact copy');
  assert.equal(s.map.get(OLD), raw, 'old key untouched');
  const p = load(s, true);
  assert.equal(p.people[0].name, 'Test Adult A');
  assert.equal(p.log.length, 1);
  assert.equal(storeState.key, STORE_KEYS.lite);
});

test('lite and full on the same address each get their own copy and stop overwriting each other', () => {
  const s = fakeStorage({ [OLD]: raw });
  const lite = load(s, true);
  lite.people[0].name = 'Changed in lite';
  assert.equal(save(lite, s), true);
  const full = load(s, false);
  assert.equal(full.people[0].name, 'Test Adult A', 'the full build copied the shared key, not the lite change');
  assert.equal(JSON.parse(s.map.get(STORE_KEYS.lite)).people[0].name, 'Changed in lite');
  assert.equal(s.map.get(OLD), raw, 'old key still untouched');
});

test('nothing is lost when the copy fails partway: the build keeps using the old key and tries again next time', () => {
  const s = fakeStorage({ [OLD]: raw }, { failSetFor: STORE_KEYS.lite });
  const r = migrateStorage(true, s);
  assert.equal(r.migrated, false);
  assert.equal(r.key, OLD);
  assert.match(r.error, /could not be written/);
  assert.equal(s.map.has(STORE_KEYS.lite), false, 'no half copy left behind');
  const p = load(s, true);
  assert.equal(p.people[0].name, 'Test Adult A', 'the data still loads from the old key');
  p.log.push({ date: '2026-09-02', person: 'p-test', meal: 'day', fine: true });
  assert.equal(save(p, s), true, 'saves keep going to the old key');
  assert.equal(JSON.parse(s.map.get(OLD)).log.length, 2);
});

test('a copy that does not read back the same is thrown away and the old key stays in use', () => {
  const s = fakeStorage({ [OLD]: raw }, { corruptReadFor: STORE_KEYS.lite });
  const r = migrateStorage(true, s);
  assert.equal(r.migrated, false);
  assert.equal(r.key, OLD);
  assert.match(r.error, /did not read back/);
  assert.equal(s.map.has(STORE_KEYS.lite), false);
  assert.equal(s.map.get(OLD), raw);
});

test('the copy is verified even when the note that records it cannot be written', () => {
  const s = fakeStorage({ [OLD]: raw }, { failSetFor: STORE_KEYS.lite + ':migrated' });
  const r = migrateStorage(true, s);
  assert.equal(r.migrated, true);
  assert.equal(s.map.get(STORE_KEYS.lite), raw);
});

test('unreadable old data is left where it is and never overwritten', () => {
  const s = fakeStorage({ [OLD]: '{"people": [broken' });
  const p = load(s, true);
  assert.deepEqual(p.people, []);
  assert.equal(save(p, s), true);
  assert.equal(s.map.get(OLD), '{"people": [broken', 'the old key was not written over');
});

test('a build that already has its own key is left alone; a new install starts empty', () => {
  const own = JSON.stringify({ ...profile, people: [{ id: 'p2', name: 'Test Adult B' }] });
  const s = fakeStorage({ [OLD]: raw, [STORE_KEYS.full]: own });
  assert.equal(migrateStorage(false, s).migrated, false);
  assert.equal(load(s, false).people[0].name, 'Test Adult B');
  const fresh = fakeStorage();
  assert.deepEqual(load(fresh, true).people, []);
});

test('Clear all data does not bring the old copy back, and removes it only when the other build no longer needs it', () => {
  const s = fakeStorage({ [OLD]: raw });
  load(s, true);
  clearAll(s, true);
  assert.equal(s.map.has(STORE_KEYS.lite), false);
  assert.equal(s.map.get(OLD), raw, 'the full build has not copied it yet, so it stays');
  assert.deepEqual(load(s, true).people, [], 'cleared stays cleared');
  load(s, false);                      // the full build copies it
  load(s, true); clearAll(s, true);
  assert.equal(s.map.has(OLD), false, 'the full build has its own copy now, so the old key goes');
  assert.equal(load(s, false).people[0].name, 'Test Adult A', 'the full build keeps its data');
});

test('the backup file format is unchanged: an export imports back to the same people and log', () => {
  const back = importJSON(exportJSON(profile));
  assert.equal(back.people[0].name, 'Test Adult A');
  assert.equal(back.log.length, 1);
});

test('the backup reminder comes up a month after the last backup, or a month after first use when there has been none', async () => {
  const { backupDue } = await import('../src/store.js');
  const now = new Date('2026-09-29T12:00:00Z');
  const base = { people: [{ id: 'p-test', name: 'Test Adult A' }], created: '2026-09-20T00:00:00Z', diary: [], log: [], weights: [] };
  assert.equal(backupDue({ ...base, people: [] }, now).due, false, 'nobody set up yet');
  assert.equal(backupDue(base, now).due, false, 'nine days of use');
  assert.deepEqual(backupDue({ ...base, created: '2026-08-01T00:00:00Z' }, now), { due: true, days: 59, never: true });
  assert.equal(backupDue({ ...base, created: '2026-09-28T00:00:00Z', log: [{ date: '2026-07-01' }] }, now).due, true, 'counts from the oldest entry');
  assert.equal(backupDue({ ...base, last_backup_at: '2026-09-10T00:00:00Z' }, now).due, false);
  assert.deepEqual(backupDue({ ...base, last_backup_at: '2026-08-29T00:00:00Z' }, now), { due: true, days: 31, never: false });
  assert.equal(backupDue({ ...base, last_backup_at: '2026-08-01T00:00:00Z', backup_snooze_until: '2026-10-03T00:00:00Z' }, now).due, false, 'snoozed for a week');
  assert.equal(backupDue({ ...base, last_backup_at: '2026-08-01T00:00:00Z', backup_snooze_until: '2026-09-28T00:00:00Z' }, now).due, true, 'the snooze ran out');
});
