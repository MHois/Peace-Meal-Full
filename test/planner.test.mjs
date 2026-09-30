import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMatcher } from '../src/engine/dictionary.js';
import { buildWeekPlan } from '../src/engine/planner.js';
import { buildGroceryList } from '../src/engine/grocery.js';

const dict = { tags: { 'allergen-peanut': { label: 'Peanut', hard: true }, vegetable: { label: 'Vegetable' }, 'sugar-sweetened-beverage': { label: 'SSB' } }, entries: [ { term: 'peanut', tags: ['allergen-peanut'] } ] };
const matcher = buildMatcher(dict);
const foods = new Map([
  ['f-oats', { id: 'f-oats', name: 'Oats', short: 'Oats', group: 'Grains', per100g: { kcal: 379, sodium_mg: 6, protein_g: 13 }, portions: [{ label: '1 cup', grams: 81 }], tags: ['whole-grain'] }],
  ['f-peanut', { id: 'f-peanut', name: 'Peanut butter', short: 'Peanut butter', group: 'Nuts', per100g: { kcal: 588, sodium_mg: 17 }, portions: [{ label: '1 tbsp', grams: 16 }], tags: ['allergen-peanut', 'nut'] }],
  ['f-broccoli', { id: 'f-broccoli', name: 'Broccoli', short: 'Broccoli', group: 'Vegetables', per100g: { kcal: 34, sodium_mg: 33 }, portions: [{ label: '1 cup', grams: 91 }], tags: ['vegetable'] }],
  ['f-chicken', { id: 'f-chicken', name: 'Chicken breast', short: 'Chicken breast', group: 'Poultry', per100g: { kcal: 165, sodium_mg: 74, protein_g: 31 }, portions: [{ label: '1 breast', grams: 172 }], tags: ['poultry'] }],
  ['f-salt', { id: 'f-salt', name: 'Salt', short: 'Salt', group: 'Spices', per100g: { kcal: 0, sodium_mg: 38758 }, portions: [{ label: '1 tsp', grams: 6 }], tags: [] }]
]);
const recipes = [
  { id: 'oatmeal', name: 'Oatmeal', meal: ['breakfast'], servings: 1, active_min: 5, total_min: 10, skill: 'beginner', equipment: ['microwave'], assembly_only: true, leftovers: 'poor', ingredients: [{ food: 'f-oats', grams: 40, display: 'oats' }], tags: ['whole-grain'] },
  { id: 'pb-toast', name: 'Peanut butter oats', meal: ['breakfast'], servings: 1, active_min: 5, total_min: 5, skill: 'beginner', equipment: [], assembly_only: true, leftovers: 'poor', ingredients: [{ food: 'f-oats', grams: 40 }, { food: 'f-peanut', grams: 32, display: 'peanut butter' }], tags: [] },
  { id: 'chicken-broccoli', name: 'Chicken and broccoli', meal: ['lunch', 'dinner'], servings: 4, active_min: 20, total_min: 35, skill: 'comfortable', equipment: ['stove'], assembly_only: false, leftovers: 'good', ingredients: [{ food: 'f-chicken', grams: 600 }, { food: 'f-broccoli', grams: 400 }, { food: 'f-salt', grams: 3 }], tags: ['vegetable', 'poultry'] },
  { id: 'salt-bomb', name: 'Very salty chicken', meal: ['dinner'], servings: 1, active_min: 10, total_min: 20, skill: 'beginner', equipment: ['stove'], assembly_only: false, leftovers: 'ok', ingredients: [{ food: 'f-chicken', grams: 200 }, { food: 'f-salt', grams: 8 }], tags: ['poultry'] }
];
const person = { id: 'p1', allergens: ['allergen-peanut'], preferences: { avoid_tags: [], avoid_terms: [] }, cooking: { weekday_minutes: 30, weekend_minutes: 60, cook_days: ['sun', 'tue', 'thu'], interest: 'simple', skill: 'comfortable', equipment: ['stove', 'microwave'], leftovers: 'ok', household: 2 } };
const plan = { avoid: { 'allergen-peanut': { hard: true, rules: [] } }, prefer: { vegetable: { rules: [] } }, limits: { sodium_mg: { value: 2300 } }, targets: {} };

test('week plan never schedules a hard-excluded recipe and respects no-cook days', () => {
  const week = buildWeekPlan({ person, plan, recipes, foodsById: foods, matcher, startDate: new Date('2026-09-06'), seed: 1 });
  assert.equal(week.days.length, 7);
  for (const d of week.days) for (const m of d.meals) assert.notEqual(m.recipe, 'pb-toast');
  assert.ok(week.excluded.some(e => e.id === 'pb-toast'));
  for (const d of week.days) if (!d.canCook) for (const m of d.meals) assert.ok(m.source !== 'cook' || m.reasons.length, `cooked on a no-cook day: ${d.day} ${m.name}`);
});

test('week plan is deterministic for the same seed and changes with a new seed', () => {
  const a = buildWeekPlan({ person, plan, recipes, foodsById: foods, matcher, startDate: new Date('2026-09-06'), seed: 1 });
  const b = buildWeekPlan({ person, plan, recipes, foodsById: foods, matcher, startDate: new Date('2026-09-06'), seed: 1 });
  assert.deepEqual(a.days.map(d => d.meals.map(m => m.recipe)), b.days.map(d => d.meals.map(m => m.recipe)));
});

test('sodium-heavy recipe is scored down when it would break the daily limit', () => {
  const week = buildWeekPlan({ person, plan, recipes, foodsById: foods, matcher, startDate: new Date('2026-09-06'), seed: 3 });
  const dinners = week.days.flatMap(d => d.meals.filter(m => m.slot === 'dinner'));
  const saltBomb = dinners.filter(m => m.recipe === 'salt-bomb');
  assert.ok(saltBomb.length < dinners.length, 'salt bomb should not win every dinner');
});

test('grocery list sums grams across cooked meals and converts to portions', () => {
  const week = buildWeekPlan({ person, plan, recipes, foodsById: foods, matcher, startDate: new Date('2026-09-06'), seed: 1 });
  const g = buildGroceryList(week, new Map(recipes.map(r => [r.id, r])), foods);
  assert.ok(g.items.length > 0);
  const oats = g.items.find(i => i.food === 'f-oats');
  assert.ok(oats && oats.grams > 0 && /x 1 cup/.test(oats.quantity));
  assert.ok(!g.items.some(i => i.food === 'f-peanut'));
});

test('favorites score up and never-again recipes are excluded', () => {
  const p2 = { ...person, favorites: { recipes: ['chicken-broccoli'] }, disliked: { recipes: ['salt-bomb'] } };
  const week = buildWeekPlan({ person: p2, plan, recipes, foodsById: foods, matcher, startDate: new Date('2026-09-06'), seed: 1 });
  for (const d of week.days) for (const m of d.meals) assert.notEqual(m.recipe, 'salt-bomb');
  const dinners = week.days.flatMap(d => d.meals.filter(m => m.slot === 'dinner' && m.source !== 'leftover'));
  assert.ok(dinners.every(m => m.recipe === 'chicken-broccoli'));
});

test('text-only ingredients from imported recipes appear on the grocery list by name', () => {
  const week = { days: [{ date: '2026-09-06', meals: [{ slot: 'dinner', recipe: 'nhs-x', source: 'cook', servings: 2, servingsMade: 2 }, { slot: 'lunch', recipe: 'oatmeal', source: 'cook', servings: 1, servingsMade: 1 }] }] };
  const rec = new Map([
    ['nhs-x', { id: 'nhs-x', name: 'Lentil soup', servings: 2, source: 'NHS website', ingredients: [{ display: '1 onion, chopped' }, { display: '200g red lentils' }, { display: '1 tbsp olive oil' }] }],
    ['oatmeal', recipes[0]]
  ]);
  const g = buildGroceryList(week, rec, foods);
  const names = g.items.map(i => i.name);
  assert.ok(names.includes('Onion') && names.includes('Red lentil') && names.includes('Olive oil'), names.join(','));
  assert.ok(g.items.some(i => i.food === 'f-oats'));
  assert.ok(!g.items.some(i => i.name === 'undefined' || i.food === 'undefined'));
  const onion = g.items.find(i => i.name === 'Onion');
  assert.equal(onion.group, 'From recipe text (check amounts)');
  assert.ok(/1 onion, chopped \(Lentil soup\)/.test(onion.quantity));
});

test('only recipes that pass every check are planned: a soft avoid, an avoid word, or a serving over a limit is left out', () => {
  // soft avoid on poultry: chicken recipes become caution, so oatmeal is the only recipe left and dinners go unfilled
  const softPlan = { ...plan, avoid: { ...plan.avoid, poultry: { hard: false, rules: [] } } };
  const week = buildWeekPlan({ person, plan: softPlan, recipes, foodsById: foods, matcher, startDate: new Date('2026-09-06'), seed: 1 });
  for (const d of week.days) for (const m of d.meals) if (m.recipe) assert.equal(m.check.verdict, 'pass', `${m.name} was planned with verdict ${m.check.verdict}`);
  const cb = week.excluded.find(e => e.id === 'chicken-broccoli');
  assert.ok(cb && cb.verdict === 'caution' && /avoid: Poultry|avoid: poultry/i.test(cb.why.join(' ')), JSON.stringify(cb));
  assert.ok(week.excluded.find(e => e.id === 'pb-toast').verdict === 'fail');
  // an avoid word from preferences is caution too
  const p2 = { ...person, preferences: { avoid_tags: [], avoid_terms: ['broccoli'] } };
  const w2 = buildWeekPlan({ person: p2, plan, recipes, foodsById: foods, matcher, startDate: new Date('2026-09-06'), seed: 1 });
  for (const d of w2.days) for (const m of d.meals) assert.notEqual(m.recipe, 'chicken-broccoli');
  // a serving over the daily sodium limit is caution: with a 1000 mg limit the salt bomb (3100 mg) is never planned
  const lowSodium = { ...plan, limits: { sodium_mg: { value: 1000 } } };
  const w3 = buildWeekPlan({ person, plan: lowSodium, recipes, foodsById: foods, matcher, startDate: new Date('2026-09-06'), seed: 1 });
  for (const d of w3.days) for (const m of d.meals) assert.notEqual(m.recipe, 'salt-bomb');
  assert.ok(/daily sodium/.test(w3.excluded.find(e => e.id === 'salt-bomb').why.join(' ')));
});
