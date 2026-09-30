import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCuisine, cuisineSkipped, cuisineLoved } from '../src/engine/cuisine.js';
import { buildWeekPlan } from '../src/engine/planner.js';
import { buildMatcher } from '../src/engine/dictionary.js';

test('cuisine comes from source categories first, then a keyword guess, marked as such', () => {
  assert.deepEqual(classifyCuisine({ name: 'Rice', wikibooks_categories: ['Indian recipes', 'Rice recipes'] }), { id: 'indian', label: 'Indian and South Asian', source: 'category' });
  assert.equal(classifyCuisine({ name: 'Chicken tikka masala', ingredients: [{ display: 'garam masala' }] }).id, 'indian');
  assert.equal(classifyCuisine({ name: 'Beef tacos', ingredients: [{ display: 'corn tortillas' }, { display: 'salsa' }] }).source, 'guess');
  assert.equal(classifyCuisine({ name: 'Pad thai', ingredients: [{ display: 'fish sauce' }] }).id, 'thai');
  assert.equal(classifyCuisine({ name: 'Plain rice', ingredients: [{ display: 'rice' }, { display: 'water' }] }).id, 'other');
  assert.equal(classifyCuisine({ name: 'Sheet-pan salmon', ingredients: [{ display: 'salmon' }] }).id, 'american');
});

test('skip removes a cuisine from the week; love boosts it', () => {
  const matcher = buildMatcher({ tags: {}, entries: [] });
  const foods = new Map([['f', { id: 'f', name: 'Chicken', short: 'Chicken', group: 'Poultry', per100g: { kcal: 165, sodium_mg: 74 }, portions: [], tags: [] }]]);
  const recipes = [
    { id: 'tacos', name: 'Chicken tacos', meal: ['dinner'], servings: 2, active_min: 15, total_min: 20, skill: 'beginner', equipment: ['stove'], leftovers: 'ok', ingredients: [{ food: 'f', grams: 300, display: 'chicken' }, { food: 'f', grams: 1, display: 'corn tortillas' }] },
    { id: 'curry', name: 'Chicken curry', meal: ['dinner'], servings: 2, active_min: 15, total_min: 20, skill: 'beginner', equipment: ['stove'], leftovers: 'ok', ingredients: [{ food: 'f', grams: 300, display: 'chicken' }, { food: 'f', grams: 1, display: 'garam masala' }] }
  ];
  const base = { id: 'p', allergens: [], cooking: { weekday_minutes: 30, weekend_minutes: 30, skill: 'beginner', equipment: ['stove'], leftovers: 'poor', household: 1 }, medications: {}, tier2: {} };
  const plan = { avoid: {}, prefer: {}, limits: {}, targets: {} };
  const skip = buildWeekPlan({ person: { ...base, preferences: { cuisines_skip: ['indian'], avoid_tags: [], avoid_terms: [] } }, plan, recipes, foodsById: foods, matcher, startDate: new Date('2026-09-06'), seed: 1, slots: ['dinner'] });
  assert.ok(skip.days.every(d => d.meals.every(m => m.recipe !== 'curry')));
  const love = buildWeekPlan({ person: { ...base, preferences: { cuisines_love: ['indian'], avoid_tags: [], avoid_terms: [] } }, plan, recipes, foodsById: foods, matcher, startDate: new Date('2026-09-06'), seed: 1, slots: ['dinner'] });
  const curries = love.days.filter(d => d.meals[0].recipe === 'curry').length;
  assert.ok(curries >= 4, 'loved cuisine should win most nights, got ' + curries);
  assert.equal(cuisineSkipped(recipes[1], { preferences: { cuisines_skip: ['indian'] } }), true);
  assert.equal(cuisineLoved(recipes[0], { preferences: { cuisines_love: ['mexican'] } }), true);
});
