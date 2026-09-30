// Wave 3: component recipes never take a meal slot, snack slots, per-day cooking time, and the spice preference.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classifyComponent, fixMeal, fixBreakfast } from '../tools/lib/meal-components.mjs';
import { recipeHeat, spiceSkipped, spiceBonus } from '../src/engine/spice.js';
import { buildWeekPlan, minutesAvailable, canCookOn, snackPlan, daySlots, recipeMeal, isComponent, scoreRecipe, mealFits, repickSlots } from '../src/engine/planner.js';
import { buildPlan } from '../src/engine/plan.js';
import { buildMatcher } from '../src/engine/dictionary.js';

const read = f => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const conditions = read('conditions.json');
const dictionaries = read('dictionaries.json');
const foods = read('foods.json');
const recipes = read('recipes.json');
const open = read('recipes-open.json');
const usda = read('recipes-usda.json');
const foodsById = new Map(foods.map(f => [f.id, f]));
const matcher = buildMatcher(dictionaries);

function person(extra = {}) {
  return {
    id: 'p-test', name: 'Test', adult: true, modules: [], allergens: [], preferences: { avoid_tags: [], avoid_terms: [], patterns: [] },
    variants: {}, flags: {}, optional_rules: [], rule_settings: {}, confirmations: [], custom_modules: [], medications: {}, tier2: {},
    favorites: { recipes: [], foods: [] }, disliked: { recipes: [], foods: [] }, servings_by_day: {},
    cooking: { weekday_minutes: 30, weekend_minutes: 45, cook_days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], interest: 'simple', skill: 'comfortable', equipment: ['stove', 'oven', 'microwave', 'blender'], leftovers: 'ok' },
    ...extra
  };
}

test('component classifier: sauces, dressings, stocks, and doughs are components; dishes served with them are not', () => {
  for (const n of ['Hummus (Greek)', 'Hummus III', 'Basic Pizza Crust', 'Chicken Broth II', 'Homemade Garam Masala', 'Italian Dressing I', 'Toum (Lebanese Garlic Sauce)', 'Sweet and Sour Sauce', 'White Sauce - Thin', 'Gravy (Vegetarian)', 'Thai Green Curry Paste', 'Pastry for Cornish Pasties']) {
    assert.equal(classifyComponent(n), 'component', n);
  }
  for (const n of ['Biscuits and Gravy', 'Spaghetti with Meat Sauce', 'Cheese Spread on French Bread', 'Chicken Tikka Masala', 'Peanut Butter and Jelly Sandwich', 'Shakshuka (eggs poached in pepper tomato sauce)', 'Drop Biscuits (from Better Baking Mix)', 'Overnight oats with berries and chia', 'Salsa Pinto Beans', 'Black Bean Soup and Salsa Verde']) {
    assert.equal(classifyComponent(n), null, n);
  }
  assert.equal(classifyComponent('Hummus with carrots and cucumber'), 'snack');
  assert.equal(classifyComponent('Party Mix'), 'snack');
  assert.equal(classifyComponent('Indian Ice Cream'), 'snack');
});

test('breakfast sanity drops desserts and party food, keeps real breakfasts', () => {
  assert.deepEqual(fixBreakfast('Apple Bundt Cake', ['breakfast']), ['snack']);
  assert.deepEqual(fixBreakfast('Frittaten Soup', ['breakfast', 'snack']), ['snack', 'lunch']);
  assert.deepEqual(fixBreakfast('Chocolate Chip Coffee Cake', ['breakfast', 'snack']), ['breakfast', 'snack']);
  assert.deepEqual(fixBreakfast('Banana Pancakes', ['breakfast']), ['breakfast']);
  assert.equal(fixMeal({ name: 'Spaghetti and Spinach Pesto', meal: ['snack'] }).join('/'), 'lunch/dinner');
});

test('data on disk: no component is tagged as a meal, and no plain hummus sits in breakfast', () => {
  const all = [...recipes, ...open, ...usda];
  for (const r of all) {
    const kind = classifyComponent(r.name);
    if (kind === 'component') assert.deepEqual(r.meal, ['component'], r.name);
    else assert.ok(!(r.meal || []).includes('component'), r.name);
  }
  const hummusBreakfast = all.filter(r => /^hummus\b/i.test(r.name) && (r.meal || []).includes('breakfast'));
  assert.deepEqual(hummusBreakfast.map(r => r.name), []);
  assert.ok(all.filter(isComponent).length > 250, 'components are present in the library');
});

test('heat estimate: tiers, negation, pinches, and pepper', () => {
  const heat = (name, ings) => recipeHeat({ id: 'h-' + name, name, ingredients: ings.map(display => ({ display })) });
  assert.equal(heat('Plain oats', ['1 cup oats', 'black pepper', 'ginger']).level, 0);
  assert.equal(heat('Habanero salsa', ['3 habaneros']).level, 3);
  assert.equal(heat('Taco night', ['1 jalapeño, diced']).level, 2);
  assert.equal(heat('Chili', ['1 tbsp chili powder']).level, 1);
  assert.equal(heat('Soup', ['pinch of cayenne']).level, 1, 'a pinch of cayenne is mild');
  assert.equal(heat('Soup', ['cayenne (optional)']).level, 1, 'optional drops a tier');
  assert.equal(heat('Guacamole (Chile- and Herb-Free)', ['avocado']).level, 0);
  assert.equal(heat('Wings', ['sweet chili sauce']).level, 0, 'sweet chili sauce is sugar, not heat');
  assert.equal(heat('Fire noodles', ['gochujang', 'sriracha', 'red pepper flakes']).level, 3, 'three medium-heat ingredients add up');
  assert.ok(heat('Habanero salsa', ['3 habaneros']).terms.includes('habaneros'));
});

test('spice preference excludes above the level and nudges within it', () => {
  const hot = { id: 'r-hot', name: 'Vindaloo', ingredients: [{ display: 'vindaloo paste' }] };
  const medium = { id: 'r-med', name: 'Tacos', ingredients: [{ display: '1 jalapeño' }] };
  const mild = { id: 'r-mild', name: 'Curry', ingredients: [{ display: '1 tsp chili powder' }] };
  const none = { id: 'r-none', name: 'Oats', ingredients: [{ display: 'oats' }] };
  const p = lvl => person({ preferences: { avoid_tags: [], avoid_terms: [], patterns: [], spice: lvl } });
  assert.deepEqual([hot, medium, mild, none].map(r => spiceSkipped(r, p('none'))), [true, true, true, false]);
  assert.deepEqual([hot, medium, mild, none].map(r => spiceSkipped(r, p('mild'))), [true, true, false, false]);
  assert.deepEqual([hot, medium, mild, none].map(r => spiceSkipped(r, p('medium'))), [true, false, false, false]);
  assert.deepEqual([hot, medium, mild, none].map(r => spiceSkipped(r, p('hot'))), [false, false, false, false]);
  assert.deepEqual([hot, medium, mild, none].map(r => spiceSkipped(r, p('any'))), [false, false, false, false]);
  assert.equal(spiceBonus(hot, p('hot')).bonus, 10);
  assert.equal(spiceBonus(medium, p('medium')).bonus, 6);
  assert.equal(spiceBonus(none, p('hot')).bonus, 0);
  const check = { verdict: 'pass', hits: [], termHits: [], unknownRisk: [], preferHits: [], exceeds: [] };
  assert.equal(scoreRecipe({ recipe: medium, check, cooking: p('none').cooking, dayIdx: 1, canCook: true, recentIds: [], person: p('none'), favorites: [], disliked: [] }).score, -Infinity);
});

test('a per-date override changes that date only and never the standing weekday answer', () => {
  const c = { weekday_minutes: 20, weekend_minutes: 45, cook_days: ['mon', 'wed'] };
  assert.equal(minutesAvailable(c, 1), 20);
  assert.equal(minutesAvailable(c, 6), 45);
  assert.equal(minutesAvailable(c, 1, { minutes: 60 }), 60);
  assert.equal(minutesAvailable(c, 1), 20, 'the override is not stored on cooking');
  assert.equal(canCookOn(c, 1), true);
  assert.equal(canCookOn(c, 2), false);
  assert.equal(canCookOn(c, 2, { can_cook: true }), true);
  assert.equal(canCookOn(c, 1, { can_cook: false }), false);
  assert.equal(canCookOn({ cook_days: [] }, 2), true, 'no cook days listed means every day');
  assert.equal(c.day_minutes, undefined);
});

test('mealFits: leftovers and assembly always fit; cooked meals need the time', () => {
  const cooked = { id: 'c', active_min: 30, assembly_only: false };
  const quick = { id: 'q', active_min: 5, assembly_only: true };
  assert.equal(mealFits(cooked, { recipe: 'c', slot: 'dinner', source: 'cook' }, { canCook: true, minutes: 45, slot: 'dinner' }).fits, true);
  assert.equal(mealFits(cooked, { recipe: 'c', slot: 'dinner', source: 'cook' }, { canCook: true, minutes: 15, slot: 'dinner' }).fits, false);
  assert.equal(mealFits(cooked, { recipe: 'c', slot: 'dinner', source: 'cook' }, { canCook: false, minutes: 45, slot: 'dinner' }).fits, false);
  assert.equal(mealFits(cooked, { recipe: 'c', slot: 'dinner', source: 'leftover' }, { canCook: false, minutes: 10, slot: 'dinner' }).fits, true);
  assert.equal(mealFits(quick, { recipe: 'q', slot: 'lunch', source: 'assembly' }, { canCook: false, minutes: 10, slot: 'lunch' }).fits, true);
});

test('repickSlots replaces only the named slots of one day; every other meal in the week is untouched', () => {
  const p = person();
  const plan = buildPlan({ person: p, conditions, dictionaries });
  const all = [...recipes, ...open, ...usda];
  const week = buildWeekPlan({ person: p, plan, recipes: all, foodsById, matcher, startDate: new Date('2026-09-07T00:00:00Z'), seed: 2 });
  const before = JSON.stringify(week.days.map(d => d.meals.map(m => m.recipe)));
  const di = 2;
  const { meals } = repickSlots({ week, di, slots: ['dinner'], person: p, plan, recipes: all, foodsById, matcher, canCook: true, minutes: 10 });
  assert.equal(meals.length, 1);
  assert.equal(meals[0].slot, 'dinner');
  assert.ok(meals[0].repicked);
  const r = all.find(x => x.id === meals[0].recipe);
  assert.ok(r, 'picked a recipe');
  assert.ok((r.active_min || 0) <= 10 || r.assembly_only, `picked ${r.name} with ${r.active_min} active minutes for a 10 minute day`);
  assert.equal(JSON.stringify(week.days.map(d => d.meals.map(m => m.recipe))), before, 'repickSlots does not mutate the week');
});

test('buildWeekPlan honours a per-date override on that date only', () => {
  const p = person();
  const plan = buildPlan({ person: p, conditions, dictionaries });
  const all = [...recipes, ...open, ...usda];
  const start = new Date('2026-09-07T00:00:00Z');
  const week = buildWeekPlan({ person: p, plan, recipes: all, foodsById, matcher, startDate: start, seed: 3, dayOverrides: { '2026-09-09': { can_cook: false, minutes: 10 } }, snacksPerDay: 0 });
  const d = week.days.find(x => x.date === '2026-09-09');
  assert.equal(d.canCook, false); assert.equal(d.minutes, 10); assert.equal(d.overridden, true);
  assert.equal(week.days.find(x => x.date === '2026-09-08').canCook, true);
  assert.equal(week.days.find(x => x.date === '2026-09-08').overridden, false);
  assert.deepEqual(week.slots, ['breakfast', 'lunch', 'dinner'], 'this-week snack override of 0 removes the snack slot');
});

test('snack slots: one by default, two for reflux without an evening snack, two with a bedtime snack for GDM, and the person can override', () => {
  const p = person();
  assert.deepEqual(snackPlan(p, { modules: [] }).slots, ['snack-pm']);
  assert.deepEqual(snackPlan(p, { modules: [{ id: 'gerd' }] }).slots, ['snack-am', 'snack-pm']);
  assert.deepEqual(snackPlan(p, { modules: [{ id: 'pregnancy-gdm-breastfeeding' }] }).slots, ['snack-pm', 'snack-eve']);
  assert.deepEqual(snackPlan(person({ adult: false }), { modules: [] }).slots, ['snack-am', 'snack-pm']);
  const three = person({ cooking: { ...p.cooking, snacks_per_day: 3 } });
  assert.deepEqual(snackPlan(three, { modules: [{ id: 'gerd' }] }).slots, ['snack-am', 'snack-pm'], 'reflux still drops the evening snack');
  assert.deepEqual(snackPlan(three, { modules: [] }).slots, ['snack-am', 'snack-pm', 'snack-eve']);
  const zero = person({ cooking: { ...p.cooking, snacks_per_day: 0 } });
  assert.deepEqual(daySlots(zero, { modules: [] }), ['breakfast', 'lunch', 'dinner']);
  assert.deepEqual(daySlots(p, { modules: [] }), ['breakfast', 'lunch', 'snack-pm', 'dinner']);
});

test('week plan: snack slots are filled from snack recipes, components are never scheduled, spice setting holds', () => {
  const p = person({ preferences: { avoid_tags: [], avoid_terms: [], patterns: [], spice: 'none' } });
  const plan = buildPlan({ person: p, conditions, dictionaries });
  const all = [...recipes, ...open, ...usda];
  const week = buildWeekPlan({ person: p, plan, recipes: all, foodsById, matcher, startDate: new Date('2026-09-07T00:00:00Z'), seed: 1 });
  assert.deepEqual(week.slots, ['breakfast', 'lunch', 'snack-pm', 'dinner']);
  const byId = new Map(all.map(r => [r.id, r]));
  for (const d of week.days) {
    assert.equal(d.meals.length, 4);
    for (const m of d.meals) {
      if (!m.recipe) continue;
      const r = byId.get(m.recipe);
      assert.ok(!isComponent(r), `${r.name} is a component and was scheduled`);
      assert.ok(recipeMeal(r, m.slot), `${r.name} does not fit ${m.slot}`);
      assert.equal(recipeHeat(r).level, 0, `${r.name} has heat but the person asked for none`);
      if (m.slot === 'snack-pm') assert.ok(r.meal.includes('snack'), `${r.name} in a snack slot`);
    }
  }
  const snacks = week.days.map(d => d.meals.find(m => m.slot === 'snack-pm')).filter(m => m && m.recipe);
  assert.ok(snacks.length >= 5, `most days got a snack (${snacks.length})`);
  assert.equal(recipeMeal({ name: 'Hummus (Greek)', meal: ['component'] }, 'breakfast'), false);
  assert.equal(recipeMeal({ name: 'Trail mix', meal: ['snack'] }, 'snack-eve'), true);
  assert.equal(recipeMeal({ name: 'Trail mix', meal: ['snack'] }, 'dinner'), false);
});
