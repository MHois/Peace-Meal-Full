// Swap layer: adapted copies for one diet family, built from the real dictionary, swap list, and food table.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildMatcher } from '../src/engine/dictionary.js';
import { buildPlan } from '../src/engine/plan.js';
import { checkRecipe } from '../src/engine/checker.js';
import { adaptRecipe, adaptedApplies, familiesFor, buildAdaptedRecipes } from '../src/engine/swaps.js';
import { buildWeekPlan, planNoLeftovers } from '../src/engine/planner.js';

const J = f => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const conditions = J('conditions.json').modules, dictionaries = J('dictionaries.json'), swaps = J('swaps.json');
const foodsById = new Map(J('foods.json').map(f => [f.id, f]));
const matcher = buildMatcher(dictionaries);
const person = mods => ({ id: 'x', name: 'x', adult: true, age: 50, modules: mods, allergens: [], preferences: { avoid_tags: [], avoid_terms: [] }, medications: {}, tier2: {}, phases: {}, modes: {}, acknowledged: [], flags: {}, variants: {}, cooking: { weekday_minutes: 45, weekend_minutes: 60, cook_days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], leftovers: 'good', household: 2, equipment: ['stove', 'oven'] } });
const fodmapPlan = buildPlan({ person: person(['ibs-low-fodmap']), conditions, dictionaries, today: new Date('2026-09-10') });
const histPlan = buildPlan({ person: person(['mcas']), conditions, dictionaries, today: new Date('2026-09-10') });
const plainPlan = buildPlan({ person: person([]), conditions, dictionaries, today: new Date('2026-09-10') });

const garlicPasta = { id: 't-garlic', name: 'Garlic pasta', meal: ['dinner'], servings: 2, active_min: 15, total_min: 20, skill: 'beginner', equipment: ['stove'], assembly_only: false, leftovers: 'ok', tags: [],
  ingredients: [{ food: 'fdc-169736', grams: 160, display: '160 g pasta' }, { food: 'fdc-169230', grams: 6, display: '2 cloves garlic, minced' }, { food: 'fdc-171413', grams: 15, display: '1 tbsp olive oil' }, { food: 'fdc-746782', grams: 100, display: '½ cup milk' }], steps: ['Cook.'] };
const tomatoCheddar = { id: 't-tom', name: 'Tomato cheddar toast', meal: ['lunch'], servings: 1, active_min: 5, total_min: 10, skill: 'beginner', equipment: ['none'], assembly_only: true, leftovers: 'poor', tags: [],
  ingredients: [{ display: '2 slices bread' }, { display: '1 tomato, sliced' }, { display: '30 g cheddar' }, { display: '1 tsp balsamic vinegar' }], steps: ['Assemble.'], source: 'NHS website', nutrition_source: 'nhs-website', nutrition_per_serving: { kcal: 300, sodium_mg: 400 } };
const avocadoBowl = { id: 't-avo', name: 'Avocado bowl', meal: ['lunch'], servings: 1, active_min: 5, total_min: 5, skill: 'beginner', equipment: ['none'], assembly_only: true, leftovers: 'poor', tags: [],
  ingredients: [{ food: 'fdc-168878', grams: 150, display: '1 cup cooked rice' }, { food: 'fdc-2710824', grams: 100, display: '1 avocado' }], steps: ['Assemble.'] };

test('a garlic, wheat, and milk recipe gets a low FODMAP copy that passes; nutrition is recomputed from linked foods', () => {
  assert.equal(checkRecipe(garlicPasta, fodmapPlan, matcher, foodsById, {}).verdict, 'caution');
  const a = adaptRecipe(garlicPasta, 'low-fodmap', swaps, matcher, foodsById);
  assert.ok(a, 'adapted');
  assert.equal(a.id, 't-garlic~low-fodmap');
  assert.equal(checkRecipe(a, fodmapPlan, matcher, foodsById, {}).verdict, 'pass');
  assert.equal(a.adapted.swaps.length, 3);
  assert.ok(a.ingredients.every(i => i.food && i.grams > 0), 'stays linked');
  assert.ok(a.ingredients.some(i => i.replaces && /garlic/.test(i.replaces) && /infused/.test(i.display)));
  assert.ok(!a.nutrition_per_serving && !a.nutrition_approx);
  assert.ok(a.adapted.swaps.every(s => Array.isArray(s.sources) && s.sources.length), 'every swap cites a source');
});

test('a published-nutrition recipe with tomato, cheddar, and vinegar gets a low histamine copy marked approximate; vinegar is left out', () => {
  assert.equal(checkRecipe(tomatoCheddar, histPlan, matcher, foodsById, {}).verdict, 'caution');
  const a = adaptRecipe(tomatoCheddar, 'low-histamine', swaps, matcher, foodsById);
  assert.ok(a);
  assert.equal(checkRecipe(a, histPlan, matcher, foodsById, {}).verdict, 'pass');
  assert.equal(a.nutrition_approx, true);
  assert.equal(a.ingredients.length, 3, 'vinegar removed');
  assert.ok(a.adapted.swaps.some(s => s.to === null && /vinegar/.test(s.from)));
});

test('an offending ingredient with no swap leaves the recipe alone; a recipe with nothing to swap returns null', () => {
  assert.equal(adaptRecipe(avocadoBowl, 'low-fodmap', swaps, matcher, foodsById), null);
  const clean = { ...garlicPasta, id: 't-clean', ingredients: [{ food: 'fdc-168878', grams: 150, display: '1 cup cooked rice' }] };
  assert.equal(adaptRecipe(clean, 'low-fodmap', swaps, matcher, foodsById), null);
});

test('adapted copies belong only to pools whose plan restricts that family', () => {
  const a = adaptRecipe(garlicPasta, 'low-fodmap', swaps, matcher, foodsById);
  assert.deepEqual(familiesFor(fodmapPlan, swaps), ['low-fodmap']);
  assert.deepEqual(familiesFor(plainPlan, swaps), []);
  assert.equal(adaptedApplies(a, fodmapPlan, swaps), true);
  assert.equal(adaptedApplies(a, plainPlan, swaps), false);
  assert.equal(adaptedApplies(a, histPlan, swaps), false);
  assert.equal(adaptedApplies(garlicPasta, plainPlan, swaps), true, 'a base recipe applies everywhere');
});

test('buildAdaptedRecipes keeps only copies that pass the family plan', () => {
  const out = buildAdaptedRecipes({ recipes: [garlicPasta, tomatoCheddar, avocadoBowl], families: ['low-fodmap', 'low-histamine'], swapsData: swaps, matcher, foodsById, checkRecipe, familyPlans: { 'low-fodmap': fodmapPlan, 'low-histamine': histPlan } });
  assert.deepEqual(out.map(r => r.id).sort(), ['t-garlic~low-fodmap', 't-tom~low-histamine']);
});

test('a plan with the MCAS freshness rule schedules no leftovers and batches nothing', () => {
  assert.equal(planNoLeftovers(histPlan), true);
  assert.equal(planNoLeftovers(fodmapPlan), false);
  const recipes = J('recipes.json').filter(r => Array.isArray(r.diet_written_for) && r.diet_written_for.includes('low-histamine'));
  const week = buildWeekPlan({ person: person(['mcas']), plan: histPlan, recipes, foodsById, matcher, startDate: new Date('2026-09-06'), seed: 2 });
  assert.equal(week.noLeftovers, true);
  for (const d of week.days) for (const m of d.meals) { assert.notEqual(m.source, 'leftover'); if (m.recipe) assert.equal(m.servingsMade, m.servings, `${m.name} was batched`); }
});
