// P2-1, part 2 (audit of September 30, 2026): lite took 24.5 s to show Today on a phone 4 times slower than a laptop, and
// the whole week was rebuilt on every launch. Every save cleared the built week too, so each tap on Today ("I ate this",
// a symptom, a weight) rebuilt it again. Now the week is rebuilt only when something it depends on changes (the person,
// the recipe collections, linked ingredients, the person's own recipes, the recipe pool), and lite Today shows at once
// and fills in the planned meals right after. Every person here is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = { readyState: 'loading', addEventListener() {}, removeEventListener() {}, getElementById() { return null; }, querySelector() { return null; }, activeElement: null, documentElement: { setAttribute() {}, removeAttribute() {}, classList: { toggle() {}, add() {} } } };
globalThis.window = { addEventListener() {}, location: { hash: '' } };
globalThis.location = { hash: '', href: 'https://example.org/' };
const { uiState, uiPersist, uiPlanFor } = await import('../src/ui/common.js');
const week = await import('../src/ui/week.js');
const { buildMatcher } = await import('../src/engine/dictionary.js');

const J = f => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const recipes = J('recipes.json'), foods = J('foods.json');
uiState.data = { recipes, foods, conditions: J('conditions.json').modules, dictionaries: J('dictionaries.json'), sources: [] };
uiState.matcher = buildMatcher(uiState.data.dictionaries);
uiState.foodsById = new Map(foods.map(f => [f.id, f]));
uiState.recipesById = new Map(recipes.map(r => [r.id, r]));
const person = { id: 'p-test', name: 'Test Person', adult: true, age: 70, sex: 'female', modules: ['hypertension'], allergens: [], allergens_other: [], preferences: { avoid_tags: [], avoid_terms: [], patterns: [] }, medications: {}, tier2: {}, phases: {}, rule_settings: {}, cooking: { weekday_minutes: 30, weekend_minutes: 60, cook_days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], interest: 'simple', skill: 'comfortable', equipment: ['stove', 'oven'], leftovers: 'ok', household: 1 }, planSeed: 0, setup_complete: true };
uiState.profile = { version: 2, people: [person], activePerson: person.id, diary: [], log: [], weights: [], recipe_collections: {} };

test('P2-1: a save that does not change the week keeps the built week', () => {
  const w1 = week.weekGet(person, uiPlanFor(person));
  uiState.profile.diary.push({ id: 'd1', date: '2026-09-30', person: person.id, meal: 'lunch', kind: 'custom', name: 'Soup', amount: 1, unit: 'serving' });
  uiPersist();
  assert.equal(week.weekGet(person, uiPlanFor(person)), w1, 'logging a meal does not rebuild the week');
});

test('P2-1: a change the week depends on rebuilds it', () => {
  const w1 = week.weekGet(person, uiPlanFor(person));
  person.allergens = ['allergen-peanut'];
  uiPersist();
  const w2 = week.weekGet(person, uiPlanFor(person));
  assert.notEqual(w2, w1, 'a new allergy rebuilds the week');
  uiState.profile.recipe_collections = { usda: true };
  assert.notEqual(week.weekGet(person, uiPlanFor(person)), w2, 'a recipe collection change rebuilds the week');
});

test('P2-1: a recipe pool put together again rebuilds the week, and one week is kept per person', () => {
  const w1 = week.weekGet(person, uiPlanFor(person));
  uiState.data.recipes = uiState.data.recipes.slice();   // linking a recipe's ingredients builds a new list of the same length
  const w2 = week.weekGet(person, uiPlanFor(person));
  assert.notEqual(w2, w1, 'the new pool rebuilds the week');
  person.planSeed = 1;
  week.weekGet(person, uiPlanFor(person));
  person.planSeed = 2;
  week.weekGet(person, uiPlanFor(person));
  assert.equal([...uiState.weekCache.keys()].filter(k => k.startsWith(person.id + '|')).length, 1, 'older weeks for the same person are dropped');
  person.planSeed = 0;
});

test('P2-1: lite Today shows before the week is built, then fills it in', () => {
  assert.equal(typeof week.weekCached, 'function', 'week.js says whether a built week is ready');
  const fresh = { ...person, id: 'p-other' };
  assert.equal(week.weekCached(fresh, uiPlanFor(fresh)), null, 'nothing built yet');
  const lite = readFileSync(new URL('../src/ui/lite.js', import.meta.url), 'utf8');
  assert.match(lite, /weekCached\(person, plan\)/, 'Today asks for a ready week instead of building it');
  assert.match(lite, /Working out today's plan/, 'and says the plan is coming');
  assert.match(lite, /liteBuildWeekSoon\(/, 'and builds it after the first paint');
});
