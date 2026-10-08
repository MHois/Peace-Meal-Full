// Owner request, October 8, 2026: "I want the lite version to have all the recipes as well." Peace Meal for one used to
// leave out the Wikibooks Cookbook (2,268 recipes, no nutrition numbers) and USDA MyPlate Kitchen (1,043) to stay small.
// It now carries both, in the same blocks the full build uses, which the browser does not run at launch: the Wikibooks
// recipes are read on the first recipe search, and the USDA recipes when that collection is switched on (it stays off
// until then, in both builds). Lite profiles saved before get the Wikibooks collection switched on once.
// Every person here is made up.
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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-lite-all-'));
const out = path.join(TMP, 'lite.html');
execFileSync(process.execPath, ['tools/bundle.mjs', '--lite'], { cwd: ROOT, stdio: 'pipe', env: { ...process.env, PM_BUNDLE_OUT: out } });
const html = fs.readFileSync(out, 'utf8');
const stmt = html.match(/<script>window\.__PEACE_MEAL_LITE__ = true;window\.__APP_DATA__ = [\s\S]*?<\/script>/)[0].slice(8, -9);
const blocks = {};
for (const m of html.matchAll(/<script type="application\/json" id="([^"]+)">([\s\S]*?)<\/script>/g)) blocks[m[1]] = m[2];
const data = (() => { const w = {}; vm.runInNewContext(stmt, { window: w }); return w.__APP_DATA__; })();
const wikibooks = J('recipes-open.json').filter(r => r.source === 'Wikibooks Cookbook');
const usda = J('recipes-usda.json');

test('the lite page carries every Wikibooks and USDA recipe, unchanged and in order', () => {
  assert.ok(blocks['pm-deferred-wikibooks'], 'a Wikibooks block');
  assert.ok(blocks['pm-deferred-usda'], 'a USDA block');
  assert.deepEqual(JSON.parse(blocks['pm-deferred-wikibooks']), wikibooks);
  assert.deepEqual(JSON.parse(blocks['pm-deferred-usda']), usda);
  assert.equal(data.deferred.wikibooks.count, wikibooks.length);
  assert.equal(data.deferred.usda.count, usda.length);
  for (const b of Object.values(blocks)) assert.ok(!b.includes('<'), 'nothing inside a block can end it early');
});

test('the lite page does not parse them at launch, so its first screen stays fast', () => {
  assert.ok(!(data['recipes-open'] || []).some(r => r.source === 'Wikibooks Cookbook'), 'no Wikibooks recipe in the launch data');
  assert.ok(!(data['recipes-usda'] || []).length, 'no USDA recipe in the launch data');
  const at = id => html.indexOf(`id="${id}"`), dataAt = html.indexOf('window.__APP_DATA__');
  for (const id of ['pm-deferred-wikibooks', 'pm-deferred-usda']) assert.ok(at(id) >= 0 && at(id) < dataAt, `${id} comes before the launch data, as in the full page`);
  assert.match(R('tools/bundle.mjs'), /^\/\/ if \(LITE && Array\.isArray\(data\['recipes-open'\]\)\)/m, 'the old lite filter is kept as a comment, not run');
});

// The app, run in Node with just enough of a page around it.
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0 };
globalThis.document = { readyState: 'loading', addEventListener() {}, removeEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], activeElement: null, documentElement: { setAttribute() {}, removeAttribute() {}, classList: { toggle() {}, add() {}, remove() {}, contains: () => false } }, body: { classList: { toggle() {}, add() {}, remove() {} }, appendChild() {} } };
globalThis.window = { addEventListener() {}, location: { hash: '', protocol: 'https:' } };
globalThis.location = { hash: '', href: 'https://example.org/', protocol: 'https:' };
const app = await import('../src/app.js');
const common = await import('../src/ui/common.js');
const settings = await import('../src/ui/settings.js');
const week = await import('../src/ui/week.js');

test('a lite profile saved before gets the Wikibooks collection switched on once, and a later choice sticks', () => {
  const profile = { people: [{ id: 'p1', name: 'Test Person' }], recipe_collections: { nhs: true, wikibooks: false, usda: false } };
  assert.equal(app.appLiteAllRecipes(profile, true), true);
  assert.equal(profile.recipe_collections.wikibooks, true);
  assert.equal(profile.recipe_collections.usda, false, 'USDA stays off until it is switched on, as in the full app');
  profile.recipe_collections.wikibooks = false;   // the person switches it off in Settings
  assert.equal(app.appLiteAllRecipes(profile, true), false, 'once only');
  assert.equal(profile.recipe_collections.wikibooks, false, 'their choice stays');
  const full = { recipe_collections: { wikibooks: false } };
  assert.equal(app.appLiteAllRecipes(full, false), false, 'the full app changes nothing');
  assert.equal(full.recipe_collections.wikibooks, false);
  assert.doesNotMatch(R('src/app.js'), /recipe_collections\.wikibooks = false/, 'a new lite profile no longer starts with it off');
});

test('Settings in Peace Meal for one lists both collections with their counts', () => {
  common.uiState.lite = true;
  common.uiState.data = { deferred: data.deferred };
  common.uiState.baseRecipes = [];
  common.uiState.deferredLoaded = false; common.uiState.deferredUsdaLoaded = false;
  const html2 = settings.settingsCollectionsHTML({ recipe_collections: {} });
  assert.match(html2, new RegExp(`Wikibooks Cookbook \\(${wikibooks.length.toLocaleString()} recipes\\)`));
  assert.match(html2, new RegExp(`USDA MyPlate Kitchen, United States \\(${usda.length.toLocaleString()} recipes\\)`));
  assert.doesNotMatch(html2, /does not include/);
  common.uiState.lite = false;
});

test('both builds name the same recipe sources, and lite Recipes offers the Wikibooks filter', () => {
  common.uiState.lite = true; const lite = common.uiRecipeSourcesText();
  common.uiState.lite = false; const full = common.uiRecipeSourcesText();
  assert.equal(lite, full);
  assert.match(lite, /Wikibooks Cookbook \(CC BY-SA 4\.0\)/);
  assert.match(lite, /USDA MyPlate Kitchen/);
  assert.doesNotMatch(R('src/ui/recipes.js'), /s === 'wikibooks' && uiState\.lite/);
});

test('lite Week leaves out the no-numbers switch only where it could do nothing', () => {
  common.uiState.lite = true;
  assert.equal(week.weekHideUnknownSwitch(true, false), true, 'a daily limit: those recipes are never planned, so no switch');
  assert.equal(week.weekHideUnknownSwitch(false, false), false, 'no daily limit: the switch can add variety');
  assert.equal(week.weekHideUnknownSwitch(true, true), false, 'a switch already on always shows, so it can be turned off');
  common.uiState.lite = false;
  assert.equal(week.weekHideUnknownSwitch(true, false), false, 'the full build always shows it, with its explanation');
});
