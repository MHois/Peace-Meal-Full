// VA Healthy Teaching Kitchen recipes (owner request, September 30, 2026): American recipes from a US government source
// that is not copyright protected. docs/RECIPE-SOURCES.md, section 3; tools/import-va.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildMatcher } from '../src/engine/dictionary.js';
import { buildPlan } from '../src/engine/plan.js';
import { checkRecipe } from '../src/engine/checker.js';

const J = f => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const R = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const open = J('recipes-open.json');
const va = open.filter(r => r.source === 'VA Healthy Teaching Kitchen');

test('VA recipes: about two hundred, each with its source, licence, attribution, and published nutrition', () => {
  assert.ok(va.length >= 200, `${va.length} recipes`);
  const ids = new Set();
  for (const r of va) {
    assert.match(r.id, /^va-[a-z0-9-]+$/, r.name);
    assert.ok(!ids.has(r.id), 'unique id ' + r.id); ids.add(r.id);
    assert.match(r.source_url, /^https:\/\/www\.nutrition\.va\.gov\/NUTRITION\/docs\/Recipes\/.+\.pdf$/, r.name);
    assert.match(r.license, /17 U\.S\.C\. section 105/);
    assert.match(r.attribution, /VA Healthy Teaching Kitchen.*nutrition\.va\.gov/);
    assert.equal(r.nutrition_source, 'va');
    for (const k of ['kcal', 'sodium_mg']) assert.equal(typeof r.nutrition_per_serving[k], 'number', `${r.name}: ${k}`);
    assert.ok(r.ingredients.length >= 2 && r.ingredients.every(i => typeof i.display === 'string' && i.display.trim()), r.name);
    assert.ok(r.steps.length >= 1, r.name);
    assert.ok(r.meal.length && r.meal.every(m => ['breakfast', 'lunch', 'dinner', 'snack', 'component'].includes(m)), r.name);
  }
});

test('VA recipes: no card adapted from another source, and no staff names stored', () => {
  const text = JSON.stringify(va);
  assert.doesNotMatch(text, /adapted from/i);
  assert.doesNotMatch(text, /submitted by|inspired by/i);
  // Dietitians' credentials mark a person's name on the cards ("..., MS, RDN, LDN"); none may be stored.
  assert.doesNotMatch(text, /\b(RDN?|DTR|LDN?|LD\/N|CDE|CDCES|CSO|CSSD|LMNT|VAMC|VAHCS)\b/);
});

test('VA recipes: the titles left out for cultural fit or for not being a dish stay out', () => {
  const names = new Set(va.map(r => r.name));
  for (const n of ['Apricot Chicken Tagine', 'Calabacitas con Elote', 'Chickpea Shakshuka', 'White Bean and Egg Shakshuka', 'Roasted Kohlrabi, Beets, and Fennel', 'Roasted Red Pepper Romesco', 'Homemade Ricotta', 'Pico de Gallo (Salsa Fresca)', 'Quick-Pickled Onions']) assert.ok(!names.has(n), n);
});

test('VA recipes: a collection switch in Settings, on by default, in both builds', () => {
  assert.match(R('src/app.js'), /'VA Healthy Teaching Kitchen': 'va'/);
  assert.match(R('src/ui/settings.js'), /uiSwitch\('coll-va'/);
  // Changed on purpose October 1, 2026 (P3-3): the defaults are written once, in RECIPE_COLLECTION_DEFAULTS, instead of
  // inline in the new-profile object. Same expectation: VA is on by default.
  assert.match(R('src/store.js'), /RECIPE_COLLECTION_DEFAULTS = Object\.freeze\(\{[^}]*\bva: true/);
  // Changed on purpose (owner request, October 8, 2026). Old: the lite build leaves out the Wikibooks recipes (the filter
  // line in tools/bundle.mjs runs). New: that line is kept as a comment and no longer runs; both builds carry every recipe
  // in recipes-open.json (see test/ux-2026-10-lite-all-recipes.test.mjs). Why: the owner asked for lite to have them all.
  assert.match(R('tools/bundle.mjs'), /^\/\/ if \(LITE && Array\.isArray\(data\['recipes-open'\]\)\) data\['recipes-open'\] = data\['recipes-open'\]\.filter\(r => r\.source !== 'Wikibooks Cookbook'\);$/m);
  assert.doesNotMatch(R('tools/bundle.mjs'), /^if \(LITE && Array\.isArray\(data\['recipes-open'\]\)\)/m);
  // The Wikibooks recipes stay together, so the full build can still defer them (tools/bundle.mjs).
  const wb = open.map((r, i) => r.source === 'Wikibooks Cookbook' ? i : -1).filter(i => i >= 0);
  assert.equal(wb[wb.length - 1] - wb[0] + 1, wb.length);
});

test('VA recipes: checked like every other recipe (a peanut dressing fails for a peanut allergy)', () => {
  const dictionaries = J('dictionaries.json'), conditions = J('conditions.json').modules, foods = J('foods.json');
  const matcher = buildMatcher(dictionaries); matcher.dietLists = J('diet-lists.json');
  const person = { id: 't1', name: 'Test Person', adult: true, age: 50, sex: 'female', modules: [], allergens: ['allergen-peanut'], allergens_other: [], preferences: { avoid_tags: [], avoid_terms: [], patterns: [] }, medications: {}, tier2: {}, phases: {} };
  const plan = buildPlan({ person, conditions, dictionaries, today: new Date('2026-09-30') });
  const slaw = va.find(r => /peanut dressing/i.test(r.name));
  assert.ok(slaw, 'a VA recipe with a peanut dressing');
  assert.equal(checkRecipe(slaw, plan, matcher, new Map(foods.map(f => [f.id, f])), person).verdict, 'fail');
});

test('VA wording: "e.g." and percentages are not ingredients, and the foods after "e.g." are still checked', () => {
  const matcher = buildMatcher(J('dictionaries.json'));
  assert.deepEqual(matcher.tagText('4 cups vegetables (e.g. carrots, onions)').unrecognized, []);
  assert.deepEqual(matcher.tagText('1 pound lean ground turkey (90% lean or higher)').unrecognized, []);
  assert.ok(!matcher.tagText('1 cup lowfat (1%) milk').unrecognized.includes('1%'));
  assert.ok(matcher.tagText('2 tablespoons nut butter (e.g. peanut butter)').tags['allergen-peanut'], 'peanut after e.g. still tags');
  assert.ok(matcher.tagText('e.g. xqzt blorp').unrecognized.length, 'an unknown word after e.g. is still reported');
});
