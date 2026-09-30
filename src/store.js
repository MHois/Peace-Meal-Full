// On-device persistence. Nothing leaves the device unless the user exports it.
//
// Storage keys (2026-09 audit). The lite and full builds can run from the same web address (GitHub Pages /lite/ and
// /full/) and used to share one key, peace-meal:v1, so each could overwrite the other's data. Each build now keeps its
// own key. On the first launch after the update, migrateStorage() copies the shared key to the build's own key, reads
// the copy back to verify it, and records that it did. The shared key is left in place. If anything fails partway,
// the build keeps reading and writing the shared key exactly as before and tries again on the next launch, so nothing
// is lost.
export const LEGACY_KEYS = ['peace-meal:v1', 'specialty-nutrition-app:v1'];
export const STORE_KEYS = { lite: 'peace-meal-lite:v1', full: 'peace-meal-full:v1' };
const STORE_MIGRATED_SUFFIX = ':migrated';

// The key this session reads and writes, what the last migration attempt did (Settings shows it), and saved data that
// could not be read on this launch (P0-4; every screen shows it).
export const storeState = { key: null, migration: null, unreadable: null };

// P0-4 (fix pass of September 30, 2026): saved data this build cannot read. Before anything else is saved, the text is
// copied once to its own key, <key>:unreadable:<time>, which nothing in the app overwrites or removes without asking.
// When even that copy cannot be written, save() refuses to write over the only copy until the person has saved it as a
// file and chosen Start fresh (releaseUnreadable).
export const UNREADABLE_MARK = ':unreadable:';
export function unreadableCopies(storage = storeLocal()) {
  const out = [];
  if (!storage) return out;
  try {
    for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k && k.includes(UNREADABLE_MARK)) out.push({ key: k, text: storage.getItem(k) }); }
  } catch { /* storage not readable */ }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}
function storeKeepUnreadable(storage, key, raw, reason, repaired) {
  const at = new Date().toISOString();
  let copyKey = null, copyFailed = false;
  const same = unreadableCopies(storage).find(c => c.key.startsWith(key + UNREADABLE_MARK) && c.text === raw);
  if (same) copyKey = same.key;
  else {
    const k = key + UNREADABLE_MARK + at;
    try { storage.setItem(k, raw); copyKey = storage.getItem(k) === raw ? k : null; } catch { copyKey = null; }
    if (!copyKey) { copyFailed = true; try { storage.removeItem(k); } catch { /* nothing more to do */ } }
  }
  storeState.unreadable = { key, copyKey, copyFailed, reason, repaired: !!repaired, chars: raw.length, at, text: raw, released: false };
}
// "Start fresh": the person has the text as a file, or chose to let it go. Saves may write over the key again.
export function releaseUnreadable() { if (storeState.unreadable) storeState.unreadable.released = true; }

function storeIsLite() { return typeof window !== 'undefined' && !!window.__PEACE_MEAL_LITE__; }
function storeLocal() { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } }
export function storeKeyFor(lite = storeIsLite()) { return lite ? STORE_KEYS.lite : STORE_KEYS.full; }

// Returns { key, migrated, from?, error? }. key is the key to use from now on.
export function migrateStorage(lite = storeIsLite(), storage = storeLocal()) {
  const key = storeKeyFor(lite);
  if (!storage) return { key, migrated: false };
  let from = null, raw = null;
  try {
    if (storage.getItem(key) != null) return { key, migrated: false };            // already on its own key
    if (storage.getItem(key + STORE_MIGRATED_SUFFIX) != null) return { key, migrated: false };  // copied before, then cleared: do not copy again
    for (const k of LEGACY_KEYS) { const v = storage.getItem(k); if (v != null) { from = k; raw = v; break; } }
  } catch (e) { return { key: LEGACY_KEYS[0], migrated: false, error: 'storage could not be read: ' + e.message }; }
  if (raw == null) return { key, migrated: false };                                // a new install: nothing to copy
  let ok = false;
  try { const p = JSON.parse(raw); ok = !!(p && Array.isArray(p.people)); } catch { ok = false; }
  if (!ok) return { key, migrated: false, from, error: 'the saved data under ' + from + ' could not be read; it was left where it is' };
  try {
    storage.setItem(key, raw);
  } catch (e) {
    try { storage.removeItem(key); } catch { /* nothing more to do */ }
    return { key: from, migrated: false, from, error: 'the copy could not be written (' + e.message + '); still using ' + from };
  }
  let back = null;
  try { back = storage.getItem(key); } catch { back = null; }
  if (back !== raw) {
    try { storage.removeItem(key); } catch { /* nothing more to do */ }
    return { key: from, migrated: false, from, error: 'the copy did not read back the same; still using ' + from };
  }
  try { storage.setItem(key + STORE_MIGRATED_SUFFIX, JSON.stringify({ from, at: new Date().toISOString(), chars: raw.length })); } catch { /* the copy is verified; the note only stops a cleared build from copying again */ }
  return { key, migrated: true, from };
}

export function defaultProfile() {
  return { version: 2, people: [], log: [], diary: [], weights: [], exercise: [], pantry: [], grocery_adjustments: {}, grocery_changes: {}, custom_recipes: [], recipe_collections: { nhs: true, parentclub: true, nhlbi: true, va: true, wikibooks: true, usda: false, review_dual: true, defaults_v3: true, defaults_v4: true, defaults_v5: true }, household: { cook: null, cook_by_date: {}, pattern: {}, roster: {}, snacks_per_day: 1, budget: true, seed: 0, day_overrides: {}, meal_overrides: {}, week_snapshot: null }, activePerson: null, created: new Date().toISOString() };
}

export function newPerson(name = 'Me') {
  const id = 'p' + Math.random().toString(36).slice(2, 8);
  return {
    id, name, adult: true, sex: '', age: null, weight_kg: null, height_cm: null, activity: 'light',
    modules: [], allergens: [], allergens_other: [], preferences: { avoid_tags: [], avoid_terms: [], patterns: [] },
    variants: {}, flags: {}, optional_rules: [], rule_settings: {}, confirmations: [], custom_modules: [],
    goals: { calorie_target: 'off', deficit: 500 },   // calorie_target: 'off' | 'maintain' | 'loss' | 'manual'; manual_kcal when manual
    manual_kcal: null,
    favorites: { recipes: [], foods: [] },
    disliked: { recipes: [], foods: [] },
    servings_by_day: {},
    medications: { potassium_retaining: false, insulin_or_su: false, sglt2: false, levothyroxine: false },
    pregnancy: false, breastfeeding: false, tier2: {},
    phases: {}, modes: {}, acknowledged: [],
    cooking: { weekday_minutes: 20, weekend_minutes: 40, cook_days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], interest: 'simple', skill: 'comfortable', equipment: ['stove', 'oven', 'microwave'], leftovers: 'ok', household: 1, grocery: 'supermarket', budget: false },
    planSeed: 0,
    setup_complete: false
  };
}

export function load(storage = storeLocal(), lite = storeIsLite()) {
  const m = migrateStorage(lite, storage);
  storeState.key = m.key;
  storeState.migration = m;
  storeState.unreadable = null;
  let raw = null;
  try { raw = storage ? storage.getItem(m.key) : null; } catch { return defaultProfile(); }
  if (!raw) return defaultProfile();
  let p;
  try { p = JSON.parse(raw); } catch {
    storeKeepUnreadable(storage, m.key, raw, 'The saved text is cut off or damaged.', false);
    return defaultProfile();
  }
  if (!p || typeof p !== 'object' || !Array.isArray(p.people)) {
    storeKeepUnreadable(storage, m.key, raw, 'The saved data is not in the form this app reads.', false);
    return defaultProfile();
  }
  // A person that is not an object (null, a number) holds nothing to keep: drop it and keep everyone else, with the
  // original copied aside first.
  const bad = p.people.filter(x => !x || typeof x !== 'object' || Array.isArray(x)).length;
  if (bad) {
    storeKeepUnreadable(storage, m.key, raw, bad === 1 ? 'One entry in the list of people was empty.' : `${bad} entries in the list of people were empty.`, true);
    p.people = p.people.filter(x => x && typeof x === 'object' && !Array.isArray(x));
  }
  try { return migrate(p); } catch {
    if (!storeState.unreadable) storeKeepUnreadable(storage, m.key, raw, 'Part of the saved data is not in the form this app reads.', false);
    else storeState.unreadable.repaired = false;
    return defaultProfile();
  }
}

// Fill in fields added after a profile was first saved. Never removes anything.
export function migrate(p) {
  const d = defaultProfile();
  for (const k of Object.keys(d)) if (p[k] === undefined) p[k] = d[k];
  const np = newPerson('x');
  for (const person of p.people) {
    for (const k of Object.keys(np)) if (person[k] === undefined && k !== 'id' && k !== 'name') person[k] = JSON.parse(JSON.stringify(np[k]));
    if (person.cooking && person.cooking.budget === undefined) person.cooking.budget = false;
    if (person.setup_complete === undefined) person.setup_complete = !!(person.modules && person.modules.length);
    if (person.cooking && person.cooking.day_minutes) delete person.cooking.day_minutes;   // v1.6 stored Week-screen minutes per weekday; now per date, this week only
  }
  p.version = 2;
  return p;
}

// Returns true when the profile was written. The caller tells the person when it was not (uiPersist).
export function save(profile, storage = storeLocal()) {
  try {
    if (!storage) return false;
    const u = storeState.unreadable;
    if (u && u.copyFailed && !u.released) return false;   // never write over the only copy of unreadable data
    storage.setItem(storeState.key || storeKeyFor(), JSON.stringify(profile));
    return true;
  } catch { return false; }
}

export function exportJSON(profile) {
  return JSON.stringify({ ...profile, exported: new Date().toISOString() }, null, 2);
}

export function importJSON(text) {
  const p = JSON.parse(text);
  if (!p || !Array.isArray(p.people)) throw new Error('Not a valid export file.');
  return migrate(p);
}

// Clears this build's data. The shared key from before the update is removed only when the other build (lite or full)
// already has its own copy, or when this build was still using it; otherwise the other build may still need it.
export function clearAll(storage = storeLocal(), lite = storeIsLite()) {
  if (!storage) return;
  const own = storeKeyFor(lite), other = storeKeyFor(!lite);
  const key = storeState.key || own;
  try { storage.removeItem(key); } catch { /* ignore */ }
  try { if (key === own) storage.setItem(own + STORE_MIGRATED_SUFFIX, JSON.stringify({ cleared: new Date().toISOString() })); } catch { /* ignore */ }
  let otherHasOwn = false;
  try { otherHasOwn = storage.getItem(other) != null || storage.getItem(other + STORE_MIGRATED_SUFFIX) != null; } catch { /* ignore */ }
  if (otherHasOwn || LEGACY_KEYS.includes(key)) for (const k of LEGACY_KEYS) { try { storage.removeItem(k); } catch { /* ignore */ } }
  if (LEGACY_KEYS.includes(key)) storeState.key = own;
}

// Monthly backup reminder (2026-09 audit). Due 30 days after the last backup, or, when there has never been one, 30 days
// after the first thing was saved. "Remind me in a week" sets backup_snooze_until. Returns { due, days, never }.
export function backupDue(profile, now = new Date()) {
  const p = profile || {};
  if (!(p.people || []).length) return { due: false, days: null, never: !p.last_backup_at };
  const day = 86400000;
  const t = x => { const v = new Date(x).getTime(); return Number.isFinite(v) ? v : null; };
  if (p.backup_snooze_until && t(p.backup_snooze_until) != null && now.getTime() < t(p.backup_snooze_until)) return { due: false, days: null, never: !p.last_backup_at };
  if (p.last_backup_at && t(p.last_backup_at) != null) {
    const days = Math.floor((now.getTime() - t(p.last_backup_at)) / day);
    return { due: days >= 30, days, never: false };
  }
  const stamps = [p.created, ...(p.diary || []).map(e => e.date), ...(p.log || []).map(e => e.date), ...(p.weights || []).map(e => e.date)].map(t).filter(v => v != null);
  if (!stamps.length) return { due: false, days: null, never: true };
  const days = Math.floor((now.getTime() - Math.min(...stamps)) / day);
  return { due: days >= 30, days, never: true };
}
