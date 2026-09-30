// Phase 4, item 19 (and Phase 2, item 8): data safety in both builds, in Chromium at phone size.
//   a. backup: export through Send a backup, import into an empty browser, compare the JSON: nothing lost
//   b. one-time move from the old storage key (peace-meal:v1) to each build's own key, old copy left in place
//   c. Clear data in one build leaves the other build's data
//   d. storage full: the "Not saved" alert shows, nothing already saved is lost, Try again saves once there is room
//   e. saved data the app cannot read: is the person told, and is it kept?
// Results: audit/results/data-safety.json. Exit code 1 when a check fails.
import fs from 'node:fs';
import path from 'node:path';
import { buildSite, serve, launch, phone, STORE_KEY, TMP, ROOT } from './site.mjs';

const results = [];
const check = (build, name, pass, details = {}) => { results.push({ build, name, pass: !!pass, ...details }); console.log(`${pass ? 'PASS' : 'FAIL'} [${build}] ${name}${Object.keys(details).length ? ' ' + JSON.stringify(details) : ''}`); };
const GUIDE = { 'peace-meal-lite:home-screen-guide': '1', 'peace-meal-full:home-screen-guide': '1' };
const today = new Date().toISOString().slice(0, 10);
const STAMP = today + 'T12:00:00.000Z';   // fixed, so a profile built twice is the same text
function richProfile(tag) {
  return {
    version: 2, created: '2026-09-01T12:00:00.000Z', activePerson: 'p1',
    people: [{ id: 'p1', name: 'Test ' + tag, adult: true, sex: 'female', age: 71, weight_kg: 68, height_cm: 160, activity: 'light', modules: ['celiac', 'hypertension'], allergens: ['allergen-peanut'], allergens_other: ['kiwi'], preferences: { avoid_tags: [], avoid_terms: ['olive'], patterns: [] }, variants: {}, flags: {}, optional_rules: [], rule_settings: {}, confirmations: [], custom_modules: [], goals: { calorie_target: 'off', deficit: 500 }, manual_kcal: null, favorites: { recipes: [], foods: [] }, disliked: { recipes: [], foods: [] }, servings_by_day: {}, medications: { potassium_retaining: false, insulin_or_su: false, sglt2: false, levothyroxine: true }, pregnancy: false, breastfeeding: false, tier2: {}, phases: {}, modes: {}, acknowledged: [], cooking: { weekday_minutes: 20, weekend_minutes: 40, cook_days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], interest: 'simple', skill: 'comfortable', equipment: ['stove', 'oven', 'microwave'], leftovers: 'ok', household: 1, grocery: 'supermarket', budget: false }, planSeed: 0, setup_complete: true, custom_symptoms: ['itchy skin'] }],
    log: [{ id: 'l1', date: today, person: 'p1', meal: 'symptom', recipe: null, name: null, text: null, symptoms: { bloating: 2 }, notes: 'after lunch ' + tag, at: STAMP, logged_at: STAMP }],
    diary: [{ id: 'd1', date: today, person: 'p1', meal: 'lunch', kind: 'custom', ref: null, amount: 1, unit: 'serving', grams: null, note: '', name: 'Soup ' + tag, nutrients: null, no_numbers: true }],
    weights: [{ date: today, person: 'p1', kg: 68 }], exercise: [], pantry: [], grocery_adjustments: {}, grocery_changes: {},
    custom_recipes: [{ id: 'mine-test', name: 'My soup ' + tag, source: 'Peace Meal', custom: true, meal: ['lunch'], servings: 2, active_min: 10, total_min: 20, skill: 'beginner', equipment: ['stove'], assembly_only: false, leftovers: 'good', ingredients: [{ display: 'rice' }], steps: ['Cook.'], tags: [], notes: {} }],
    recipe_collections: { nhs: true, parentclub: true, nhlbi: true, va: true, wikibooks: true, usda: false, review_dual: true, defaults_v3: true, defaults_v4: true, defaults_v5: true },
    household: { cook: null, cook_by_date: {}, pattern: {}, roster: {}, snacks_per_day: 1, budget: true, seed: 0, day_overrides: {}, meal_overrides: {}, week_snapshot: null }
  };
}
async function withContext(browser, seedEntries, fn) {
  const ctx = await phone(browser);
  await ctx.addInitScript(e => { try { if (!sessionStorage.getItem('__s')) { sessionStorage.setItem('__s', '1'); for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v); } } catch { /* ignore */ } }, { ...GUIDE, ...seedEntries });
  try { return await fn(ctx); } finally { await ctx.close(); }
}
// Deep differences between two JSON values, as paths.
function diff(a, b, p = '', out = []) {
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], p + '/' + k, out);
    return out;
  }
  out.push(p || '/'); return out;
}

buildSite();
const srv = await serve();
const browser = await launch();
const url = (build, hash = '') => `${srv.origin}/Peace-Meal-Full/${build}/${hash}`;
try {
  for (const build of ['lite', 'full']) {
    const key = STORE_KEY[build];
    // a. backup round trip
    let exported = null, before = null;
    await withContext(browser, { [key]: JSON.stringify(richProfile('A')) }, async ctx => {
      const page = await ctx.newPage();
      await page.goto(url(build, '#/settings')); await page.waitForTimeout(1500);
      before = JSON.parse(await page.evaluate(k => localStorage.getItem(k), key));
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), page.click('#set-share')]);
      if (dl) { const f = path.join(TMP, `backup-${build}.json`); await dl.saveAs(f); exported = JSON.parse(fs.readFileSync(f, 'utf8')); }
    });
    check(build, 'a1. Send a backup produces a file', exported);
    if (exported) {
      // Loss = a value that was saved but is missing or different in the file. Fields the app adds on the way are fine.
      const lostPaths = [];
      const walk = (a, b, p) => { if (a && typeof a === 'object') { for (const k of Object.keys(a)) walk(a[k], b && typeof b === 'object' ? b[k] : undefined, p + '/' + k); } else if (JSON.stringify(a) !== JSON.stringify(b)) lostPaths.push(p); };
      walk(before, exported, '');
      check(build, 'a2. the backup file holds everything that was saved', lostPaths.length === 0, { lost: lostPaths.slice(0, 10), added: diff(before, exported).filter(p => !lostPaths.includes(p) && p !== '/exported').slice(0, 5) });
      await withContext(browser, {}, async ctx => {
        const page = await ctx.newPage();
        page.on('dialog', dlg => dlg.accept());
        await page.goto(url(build, '#/settings')); await page.waitForTimeout(1500);
        await (await page.$('input[type=file]')).setInputFiles(path.join(TMP, `backup-${build}.json`)); await page.waitForTimeout(1500);
        const after = JSON.parse(await page.evaluate(k => localStorage.getItem(k), key) || 'null');
        const lost = diff(exported, after || {}).filter(p => !['/last_backup_at', '/backup_snooze_until'].includes(p));
        check(build, 'a3. importing the backup in an empty browser restores it with nothing lost', after && lost.length === 0, { differences: lost.slice(0, 10) });
      });
    }
    // b. one-time move from the old shared key
    await withContext(browser, { 'peace-meal:v1': JSON.stringify(richProfile('legacy')) }, async ctx => {
      const page = await ctx.newPage();
      await page.goto(url(build, '#/today')); await page.waitForTimeout(1800);
      const s = await page.evaluate(k => ({ own: localStorage.getItem(k), marker: localStorage.getItem(k + ':migrated'), legacy: localStorage.getItem('peace-meal:v1') }), key);
      const legacy = JSON.stringify(richProfile('legacy'));
      check(build, 'b1. the old key is copied to this build\'s own key', s.own && JSON.parse(s.own).people[0].name === 'Test legacy');
      check(build, 'b2. the copy is recorded and the old copy is left in place', s.marker && s.legacy === legacy);
      const shown = await page.evaluate(() => document.body.innerText.includes('Test legacy'));
      check(build, 'b3. the moved data is what the app shows', shown);
    });
    // c. Clear data here leaves the other build's data
    const other = build === 'lite' ? 'full' : 'lite';
    await withContext(browser, { [key]: JSON.stringify(richProfile('mine')), [STORE_KEY[other]]: JSON.stringify(richProfile('other')), 'sn-grocery:2026-09-28': '["x"]', 'peace-meal:ui': '{"theme":"dark","largeText":true,"largeTextSet":true}' }, async ctx => {
      const page = await ctx.newPage();
      page.on('dialog', dlg => dlg.accept());
      await page.goto(url(build, '#/settings')); await page.waitForTimeout(1500);
      await page.click('#set-clear'); await page.waitForTimeout(1200);
      const s = await page.evaluate(([k, o]) => ({ mine: localStorage.getItem(k), other: localStorage.getItem(o), grocery: localStorage.getItem('sn-grocery:2026-09-28'), ui: localStorage.getItem('peace-meal:ui') }), [key, STORE_KEY[other]]);
      check(build, `c1. Clear data here leaves the ${other} build's saved profile`, s.other === JSON.stringify(richProfile('other')));
      check(build, `c2. Clear data here leaves the ${other} build's grocery ticks`, s.grocery === '["x"]', { note: 'sn-grocery:* keys are shared by both builds' });
      check(build, 'c3. Clear data here removes this build\'s own profile', !s.mine || !JSON.parse(s.mine).people.length);
      // Not a pass or fail: display settings are shared by both builds and are not health data. Recorded for the report.
      results.push({ build, name: 'c4 (observation). display settings after Clear data', pass: true, observation: s.ui === null ? 'removed' : 'kept (shared by both builds)' });
    });
    // d. storage full
    await withContext(browser, { [key]: JSON.stringify(richProfile('quota')) }, async ctx => {
      const page = await ctx.newPage();
      await page.goto(url(build, '#/settings')); await page.waitForTimeout(1500);
      const saved0 = await page.evaluate(k => localStorage.getItem(k), key);
      await page.evaluate(k => { const orig = Storage.prototype.setItem; window.__restoreSetItem = () => { Storage.prototype.setItem = orig; }; Storage.prototype.setItem = function (kk, v) { if (kk === k) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); return orig.call(this, kk, v); }; }, key);
      await page.click('label[for="coll-va"]'); await page.waitForTimeout(700);
      const banner = await page.$('#save-alert');
      const s = await page.evaluate(k => ({ role: document.getElementById('save-alert')?.getAttribute('role'), text: document.getElementById('save-alert')?.innerText || '', stored: localStorage.getItem(k) }), key);
      check(build, 'd1. a failed save shows the "Not saved" alert', banner && /Not saved/.test(s.text) && s.role === 'alert');
      check(build, 'd2. nothing already saved is lost when a save fails', s.stored === saved0);
      await page.evaluate(() => window.__restoreSetItem());
      if (banner) { await page.click('[data-save-retry]'); await page.waitForTimeout(600); }
      const s2 = await page.evaluate(k => ({ alert: !!document.getElementById('save-alert'), va: JSON.parse(localStorage.getItem(k)).recipe_collections.va }), key);
      check(build, 'd3. Try again saves once there is room, and the alert goes away', !s2.alert && s2.va === false);
    });
    // e. saved data the app cannot read
    const good = JSON.stringify(richProfile('damaged'));
    for (const [label, value] of [['a cut-off save', good.slice(0, good.length - 40)], ['a null person entry', JSON.stringify({ ...richProfile('damaged'), people: [null, richProfile('damaged').people[0]] })]]) {
      await withContext(browser, { [key]: value }, async ctx => {
        const page = await ctx.newPage();
        await page.goto(url(build)); await page.waitForTimeout(2000);
        const text = await page.evaluate(() => document.body.innerText);
        const warned = /could not be read|couldn't be read|damaged|corrupt|not read/i.test(text);
        await page.goto(url(build, '#/people/new')); await page.waitForTimeout(700);
        await page.fill('#people-new-name', 'Ann'); await page.click('#people-new-form button[type=submit]'); await page.waitForTimeout(700);
        const s = await page.evaluate(([k, v]) => ({ kept: localStorage.getItem(k) === v, copy: Object.keys(localStorage).some(x => localStorage.getItem(x) === v) }), [key, value]);
        check(build, `e1. ${label}: the person is told the saved data could not be read`, warned);
        check(build, `e2. ${label}: the unreadable data survives the first new entry (kept, or copied aside)`, s.kept || s.copy);
      });
    }
  }
} finally { await browser.close(); await srv.close(); }
fs.writeFileSync(path.join(ROOT, 'audit/results/data-safety.json'), JSON.stringify(results, null, 1) + '\n');
const failed = results.filter(r => !r.pass);
console.log(`${results.length - failed.length} of ${results.length} checks pass`);
if (failed.length) process.exitCode = 1;
