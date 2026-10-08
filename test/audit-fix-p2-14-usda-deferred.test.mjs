// P2-14 (audit of September 30, 2026): the full page carried the 1,043 USDA MyPlate Kitchen recipes (2.4 MB) in its
// launch data, so every launch parsed them, though the collection is off by default. They now ship in the same file as
// a JSON block the browser does not run, as the Wikibooks recipes already did, and the app reads them only when the
// collection is on (at launch, or when it is switched on in Settings). They go back at the end of the recipe order,
// where they were, so a week plan comes out the same. Lite never carried them (until October 8, 2026, when the owner asked
// for Peace Meal for one to have all the recipes; it now carries the same block). Every person here is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('../', import.meta.url);
const J = f => JSON.parse(fs.readFileSync(new URL('data/' + f, ROOT), 'utf8'));
// Built into a folder of this test's own (PM_BUNDLE_OUT), so other tests that build dist/ at the same time are not disturbed.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-p2-14-'));
function build(lite) {
  const out = path.join(TMP, lite ? 'lite.html' : 'full.html');
  execFileSync(process.execPath, ['tools/bundle.mjs', ...(lite ? ['--lite'] : [])], { cwd: ROOT, stdio: 'pipe', env: { ...process.env, PM_BUNDLE_OUT: out } });
  const html = fs.readFileSync(out, 'utf8');
  const stmt = html.match(/<script>(?:window\.__PEACE_MEAL_LITE__ = true;)?window\.__APP_DATA__ = [\s\S]*?<\/script>/)[0].slice(8, -9);
  const blocks = {};
  for (const m of html.matchAll(/<script type="application\/json" id="([^"]+)">([\s\S]*?)<\/script>/g)) blocks[m[1]] = m[2];
  const fresh = () => { const w = {}; vm.runInNewContext(stmt, { window: w }); return w.__APP_DATA__; };
  return { html, stmt, blocks, fresh };
}
const full = build(false), lite = build(true);
const usda = J('recipes-usda.json'), open = J('recipes-open.json'), base = J('recipes.json');

test('P2-14: the full page keeps the USDA recipes out of the launch data, in a block the browser does not run', () => {
  const d = full.fresh();
  assert.ok(!(d['recipes-usda'] || []).length, 'no USDA recipe in the launch data');
  assert.ok(!full.stmt.includes('"usda-2-step-chicken"'), 'not even one');
  const block = full.blocks['pm-deferred-usda'];
  assert.ok(block, 'the USDA recipes are in their own block');
  assert.ok(!block.includes('<'), 'nothing inside can end the block early');
  assert.deepEqual(JSON.parse(block), usda, 'every USDA recipe, unchanged and in order');
  assert.equal(d.deferred.usda.count, usda.length);
  assert.equal(d.deferred.usda.element, 'pm-deferred-usda');
  assert.ok(full.html.indexOf('id="pm-deferred-usda"') < full.html.indexOf('window.__APP_DATA__'), 'before the launch data, like the Wikibooks block');
  // Changed on purpose (owner request, October 8, 2026). Old: lite had no USDA block ("lite never had them"). New: lite
  // carries the same block as the full page. Why: the owner asked for Peace Meal for one to have all the recipes. The
  // second check is unchanged: they stay out of the lite launch data too.
  assert.deepEqual(JSON.parse(lite.blocks['pm-deferred-usda']), usda, 'lite carries the same block');
  assert.ok(!lite.stmt.includes('"usda-2-step-chicken"'));
});

// The app, run in Node with just enough of a page around it.
const elements = {};
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0 };
globalThis.document = { readyState: 'loading', addEventListener() {}, removeEventListener() {}, getElementById: id => elements[id] || null, querySelector: () => null, querySelectorAll: () => [], activeElement: null, documentElement: { setAttribute() {}, removeAttribute() {}, classList: { toggle() {}, add() {}, remove() {}, contains: () => false } }, body: { classList: { toggle() {}, add() {}, remove() {} }, appendChild() {} } };
globalThis.window = { addEventListener() {}, location: { hash: '', protocol: 'https:' } };
globalThis.location = { hash: '', href: 'https://example.org/', protocol: 'https:' };
const app = await import('../src/app.js');
const { uiState } = await import('../src/ui/common.js');

// One launch: the page's data and blocks, a saved profile, and the recipe pool put together the way appBoot does it.
function launch(collections, extraPerson = {}) {
  window.__APP_DATA__ = full.fresh();
  for (const k of Object.keys(elements)) delete elements[k];
  for (const [id, text] of Object.entries(full.blocks)) elements[id] = { textContent: text };
  const person = { id: 'p-test', name: 'Test Person', adult: true, age: 50, sex: 'female', modules: [], allergens: [], allergens_other: [], preferences: { avoid_tags: [], avoid_terms: [], patterns: [] }, medications: {}, tier2: {}, phases: {}, rule_settings: {}, cooking: {}, ...extraPerson };
  uiState.profile = { version: 2, people: [person], activePerson: person.id, diary: [], log: [], weights: [], custom_recipes: [], recipe_collections: { nhs: true, parentclub: true, nhlbi: true, va: true, wikibooks: true, usda: false, review_dual: true, ...collections } };
  uiState.deferredLoaded = false;
  uiState.deferredUsdaLoaded = false;
  return app.loadData().then(({ data }) => {
    uiState.data = app.appNormalizeData(data);
    uiState.baseRecipes = uiState.data.recipes;
    uiState.weekCache = new Map();
    app.appRefreshRecipes();
  });
}
const isUsda = r => r.source === 'USDA MyPlate Kitchen';
const ids = list => Array.from(list, r => r.id);   // a plain array here: the page's own arrays come from another context
// The order of the unsplit data: every recipe file in turn, an id that came earlier wins.
const UNSPLIT = (() => { const seen = new Set(), out = []; for (const r of [...base, ...open, ...usda]) if (!seen.has(r.id)) { seen.add(r.id); out.push(r.id); } return out; })();

test('P2-14: the app does not read them while the collection is off, and still counts them', async () => {
  await launch({});
  assert.equal(uiState.data.recipes.filter(isUsda).length, 0, 'not in the recipe pool');
  assert.equal(elements['pm-deferred-usda'].textContent, full.blocks['pm-deferred-usda'], 'the block was not read');
  assert.equal(app.appCollectionCounts().usda, usda.length, 'Settings still says how many there are');
});

test('P2-14: switched on, they are read and go back at the end of the recipe order', async () => {
  await launch({});
  uiState.profile.recipe_collections.usda = true;   // what the Settings switch does before it calls refreshRecipes
  app.appRefreshRecipes();
  assert.equal(uiState.data.recipes.filter(isUsda).length, usda.length, 'all of them are in the pool');
  assert.equal(elements['pm-deferred-usda'].textContent, '', 'the parsed copy is the one in use');
  assert.equal(app.appCollectionCounts().usda, usda.length, 'counted once, not twice');
  app.appRefreshRecipes();
  assert.equal(uiState.baseRecipes.filter(isUsda).length, usda.length, 'read once');
});

test('P2-14: the recipe order is the same as the unsplit data, whichever block is read first', async () => {
  // USDA at launch (it is on), then the Wikibooks block on the first search
  await launch({ usda: true });
  assert.equal(uiState.data.recipes.filter(isUsda).length, usda.length, 'on at launch: read at launch');
  assert.ok(app.appDeferredInfo(), 'the Wikibooks recipes are not read yet');
  uiState.profile.people[0].cooking.include_unknown_nutrition = true;   // one of the ways the Wikibooks block gets read
  app.appRefreshRecipes();
  assert.equal(app.appDeferredInfo(), null);
  assert.deepEqual(ids(uiState.baseRecipes), UNSPLIT);
  // the Wikibooks block at launch (saved data needs it), then USDA switched on
  await launch({}, { cooking: { include_unknown_nutrition: true } });
  assert.equal(app.appDeferredInfo(), null, 'the Wikibooks recipes were read at launch');
  uiState.profile.recipe_collections.usda = true;
  app.appRefreshRecipes();
  assert.deepEqual(ids(uiState.baseRecipes), UNSPLIT);
});

test('P2-14: no USDA recipe id is shared with another collection, so putting them back loses none', () => {
  const others = new Set([...base, ...open].map(r => r.id));
  assert.deepEqual(usda.filter(r => others.has(r.id)).map(r => r.id), []);
  assert.ok(usda.every(r => r.id.startsWith('usda-') && isUsda(r)));
});
