// Owner decision, October 8, 2026: "yes to USDA being on from the start." The 1,043 USDA MyPlate Kitchen recipes were off
// until someone switched them on in Settings (with a short note about where they come from). They are now on from the
// start in both builds, for new profiles and, once, for profiles saved before; turning them off afterwards sticks. While on,
// they are read at launch, so the week plan can use them. Every person here is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('../', import.meta.url);
const R = f => fs.readFileSync(new URL(f, ROOT), 'utf8');
const J = f => JSON.parse(R('data/' + f));
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0 };
const elements = {};
globalThis.document = { readyState: 'loading', addEventListener() {}, removeEventListener() {}, getElementById: id => elements[id] || null, querySelector: () => null, querySelectorAll: () => [], activeElement: null, documentElement: { setAttribute() {}, removeAttribute() {}, classList: { toggle() {}, add() {}, remove() {}, contains: () => false } }, body: { classList: { toggle() {}, add() {}, remove() {} }, appendChild() {} } };
globalThis.window = { addEventListener() {}, location: { hash: '', protocol: 'https:' } };
globalThis.location = { hash: '', href: 'https://example.org/', protocol: 'https:' };
const store = await import('../src/store.js');
const app = await import('../src/app.js');
const { uiState } = await import('../src/ui/common.js');

test('USDA MyPlate Kitchen is on from the start for a new profile', () => {
  assert.equal(store.RECIPE_COLLECTION_DEFAULTS.usda, true);
  const p = store.defaultProfile();
  assert.equal(p.recipe_collections.usda, true);
  assert.equal(p.recipe_collections.defaults_v6, true, 'a new profile needs no switching on later');
  assert.equal(store.recipeCollectionsOn({}).usda, true);
});

test('a profile saved before gets USDA switched on once, and a later choice sticks', () => {
  const profile = { recipe_collections: { nhs: true, wikibooks: true, usda: false, defaults_v3: true, defaults_v4: true, defaults_v5: true } };
  assert.equal(app.appUsdaOnFromStart(profile), true);
  assert.equal(profile.recipe_collections.usda, true);
  profile.recipe_collections.usda = false;   // switched off in Settings
  assert.equal(app.appUsdaOnFromStart(profile), false, 'once only');
  assert.equal(profile.recipe_collections.usda, false, 'their choice stays');
  assert.equal(app.appUsdaOnFromStart({}), false, 'nothing to switch without saved collections');
});

test('at launch the switch comes before the recipes are put together, so the USDA recipes are read then', () => {
  const src = R('src/app.js');
  const boot = src.slice(src.indexOf('async function appBoot()'));
  const on = boot.indexOf('appUsdaOnFromStart(uiState.profile);'), data = boot.indexOf('await loadData()'), pool = boot.indexOf('appRefreshRecipes();');
  assert.ok(on > 0 && data > 0 && pool > 0, 'all three are in appBoot');
  assert.ok(on < data && on < pool, 'switched on first');
});

test('with the standing defaults, a launch puts every USDA recipe in the pool, at the end of the recipe order', async () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pm-usda-on-')), 'lite.html');
  execFileSync(process.execPath, ['tools/bundle.mjs', '--lite'], { cwd: ROOT, stdio: 'pipe', env: { ...process.env, PM_BUNDLE_OUT: out } });
  const html = fs.readFileSync(out, 'utf8');
  const stmt = html.match(/<script>window\.__PEACE_MEAL_LITE__ = true;window\.__APP_DATA__ = [\s\S]*?<\/script>/)[0].slice(8, -9);
  const w = {}; vm.runInNewContext(stmt, { window: w });
  window.__APP_DATA__ = w.__APP_DATA__;
  for (const m of html.matchAll(/<script type="application\/json" id="([^"]+)">([\s\S]*?)<\/script>/g)) elements[m[1]] = { textContent: m[2] };
  const person = { id: 'p-test', name: 'Test Person', adult: true, age: 60, sex: 'female', modules: [], allergens: [], allergens_other: [], preferences: { avoid_tags: [], avoid_terms: [], patterns: [] }, medications: {}, tier2: {}, phases: {}, rule_settings: {}, cooking: {} };
  uiState.profile = { ...store.defaultProfile(), people: [person], activePerson: person.id };
  uiState.deferredLoaded = false; uiState.deferredUsdaLoaded = false;
  const { data } = await app.loadData();
  uiState.data = app.appNormalizeData(data);
  uiState.baseRecipes = uiState.data.recipes;
  uiState.weekCache = new Map();
  app.appRefreshRecipes();
  const usda = J('recipes-usda.json');
  const ids = Array.from(uiState.baseRecipes, r => r.id);
  assert.equal(uiState.data.recipes.filter(r => r.source === 'USDA MyPlate Kitchen').length, usda.length, 'every USDA recipe is in the pool');
  assert.deepEqual(ids.slice(-usda.length), usda.map(r => r.id), 'at the end, where they always go');
  assert.ok(app.appDeferredInfo(), 'the Wikibooks recipes still wait for the first search');
});

test('a switch-over is saved at once, so the stored data matches a backup; a fresh start writes nothing', () => {
  const src = R('src/app.js');
  const boot = src.slice(src.indexOf('async function appBoot()'));
  const lite = boot.indexOf('const liteSwitched = appLiteAllRecipes(uiState.profile, APP_LITE);');
  const usda = boot.indexOf('const usdaSwitched = appUsdaOnFromStart(uiState.profile);');
  const save = boot.indexOf('if (liteSwitched || usdaSwitched) uiPersist();');
  assert.ok(lite > 0 && usda > lite && save > usda, 'saved right after both switch-overs');
  const fresh = store.defaultProfile();
  assert.equal(app.appUsdaOnFromStart(fresh), false, 'a new profile changes nothing');
  assert.equal(app.appLiteAllRecipes(fresh, true), false, 'in either build');
  assert.match(R('src/store.js'), /if \(u && u\.copyFailed && !u\.released\) return false;/, 'save() still never writes over the only copy of unreadable data');
});
