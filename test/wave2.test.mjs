import test from 'node:test';
import assert from 'node:assert/strict';
import { energyTarget, restingEnergy, activityCalories, lbToKg, kgToLb, ftInToCm, cmToFtIn } from '../src/engine/energy.js';
import { buildGroupPlan, exportPersonForSharing } from '../src/engine/group.js';
import { matchRecipes } from '../src/engine/pantry.js';
import { diffGrocery, applyAdjustments, groceryText } from '../src/engine/grocery.js';
import { buildPlan } from '../src/engine/plan.js';
import fs from 'node:fs';

const conditions = JSON.parse(fs.readFileSync(new URL('../data/conditions.json', import.meta.url), 'utf8'));

test('units convert both ways', () => {
  assert.equal(lbToKg(165), 74.8);
  assert.equal(kgToLb(74.8), 165);
  assert.equal(ftInToCm(5, 6), 168);
  assert.deepEqual(cmToFtIn(168), { ft: 5, inch: 6 });
});

test('Mifflin-St Jeor and targets', () => {
  const p = { sex: 'female', age: 45, weight_kg: 70, height_cm: 165, activity: 'light' };
  assert.equal(restingEnergy(p), Math.round(10 * 70 + 6.25 * 165 - 5 * 45 - 161));
  const t = energyTarget(p, { goal: 'loss', deficit: 600 });
  assert.equal(t.kcal, Math.max(1200, Math.round(restingEnergy(p) * 1.375) - 600));
  assert.equal(energyTarget({ sex: 'female' }).kcal, null);
  assert.equal(activityCalories('walk-moderate', 60, 70), Math.round(4.3 * 70));
});

test('group plan takes the strictest of everyone and keeps allergens hard', () => {
  const a = { id: 'a', name: 'Ann', adult: true, modules: ['hypertension'], allergens: [], preferences: { avoid_tags: [], avoid_terms: [] }, medications: {}, tier2: {}, phases: {}, modes: {}, acknowledged: [] };
  const b = { id: 'b', name: 'Bo', adult: true, modules: ['ckd-non-dialysis'], allergens: ['allergen-peanut'], preferences: { avoid_tags: ['red-meat'], avoid_terms: [] }, medications: {}, tier2: { potassium_mg_max: 2000 }, phases: {}, modes: {}, acknowledged: [], weight_kg: 70 };
  const g = buildGroupPlan({ people: [a, b], conditions });
  assert.equal(g.avoid['allergen-peanut'].hard, true);
  assert.deepEqual(g.avoid['allergen-peanut'].people, ['Bo']);
  assert.equal(g.limits.sodium_mg.value, 2300);
  assert.equal(g.limits.potassium_mg.value, 2000);
});

test('group plan sodium is the lowest limit among people', () => {
  const a = { id: 'a', name: 'Ann', adult: true, modules: ['hypertension'], allergens: [], preferences: { avoid_tags: [], avoid_terms: [] }, medications: {}, tier2: {}, phases: {}, modes: {}, acknowledged: [] };
  const c = { id: 'c', name: 'Cy', adult: true, modules: [], allergens: [], preferences: { avoid_tags: [], avoid_terms: [] }, medications: {}, tier2: {}, phases: {}, modes: {}, acknowledged: [], custom_modules: [{ id: 'custom-low-salt', name: 'Low salt', limits: { sodium_mg: 1800 } }] };
  const g = buildGroupPlan({ people: [a, c], conditions });
  assert.equal(g.limits.sodium_mg.value, 1800);
  assert.deepEqual(g.limits.sodium_mg.people, ['Cy']);
});

test('custom user-defined pattern becomes rules with the user-defined source', () => {
  const p = { id: 'p', name: 'P', adult: true, modules: [], allergens: [], preferences: { avoid_tags: [], avoid_terms: [] }, medications: {}, tier2: {}, phases: {}, modes: {}, acknowledged: [], custom_modules: [{ id: 'custom-x', name: 'My diet', avoid_tags: ['fried'], prefer_tags: ['vegetable'], limits: { added_sugar_g: 20 } }] };
  const plan = buildPlan({ person: p, conditions });
  assert.ok(plan.avoid.fried);
  assert.equal(plan.limits.added_sugar_g.value, 20);
  assert.ok(plan.modules.some(m => m.id === 'custom-x' && m.category === 'custom'));
});

test('shared profile excludes logs and keeps rules', () => {
  const s = exportPersonForSharing({ id: 'x', name: 'Zed', modules: ['celiac'], allergens: ['allergen-milk'], weight_kg: 80, log: [1, 2], favorites: { recipes: ['r'] } });
  assert.equal(s.shared, true);
  assert.deepEqual(s.modules, ['celiac']);
  assert.equal(s.weight_kg, undefined);
  assert.equal(s.favorites, undefined);
});

test('pantry matching ranks by missing ingredients and treats staples as on hand', () => {
  const foods = new Map([
    ['f1', { id: 'f1', name: 'Chicken, broilers or fryers, breast, meat only, raw', short: 'Chicken breast' }],
    ['f2', { id: 'f2', name: 'Rice, white, long-grain, cooked', short: 'White rice' }],
    ['f3', { id: 'f3', name: 'Broccoli, raw', short: 'Broccoli' }],
    ['f4', { id: 'f4', name: 'Salt, table', short: 'Salt' }],
    ['f5', { id: 'f5', name: 'Salmon, Atlantic, farmed, raw', short: 'Salmon' }]
  ]);
  const recipes = [
    { id: 'a', name: 'Chicken rice bowl', ingredients: [{ food: 'f1' }, { food: 'f2' }, { food: 'f3' }, { food: 'f4' }] },
    { id: 'b', name: 'Salmon and broccoli', ingredients: [{ food: 'f5' }, { food: 'f3' }, { food: 'f4' }] }
  ];
  const r = matchRecipes({ have: 'chicken, rice, broccoli', recipes, foodsById: foods, minCoverage: 0.3 });
  assert.equal(r[0].recipe.id, 'a');
  assert.equal(r[0].missingCount, 0);
  assert.deepEqual(r[1].missing, ['Salmon']);
});

test('grocery adjustments and change log', () => {
  const prev = { items: [{ food: 'f1', name: 'Eggs', group: 'Dairy', grams: 300, quantity: '6 x 1 large (300 g)' }, { food: 'f2', name: 'Milk', group: 'Dairy', grams: 500, quantity: '500 g' }], groups: {} };
  const next = { items: [{ food: 'f1', name: 'Eggs', group: 'Dairy', grams: 600, quantity: '12 x 1 large (600 g)' }, { food: 'f3', name: 'Oats', group: 'Grains', grams: 80, quantity: '1 x 1 cup (80 g)' }], groups: {} };
  const ch = diffGrocery(prev, next, 'Added 2 eaters on Saturday');
  assert.deepEqual(ch.map(c => c.type + ':' + c.name).sort(), ['added:Oats', 'changed:Eggs', 'removed:Milk']);
  const adj = applyAdjustments({ items: next.items, groups: {} }, { f1: { quantity: '1 dozen', note: 'only dozens sold' } });
  assert.equal(adj.items[0].quantity, '1 dozen');
  assert.equal(adj.items[0].original.quantity, '12 x 1 large (600 g)');
  const text = groceryText(adj, { changes: ch });
  assert.ok(text.includes('CHANGES') && text.includes('1 dozen'));
});
