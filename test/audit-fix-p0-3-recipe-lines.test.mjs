// P0-3 follow-up (fix pass of September 30, 2026): since P0-3, a label typed as a food's plain name ("Ranch dressing",
// "Bran Flakes") carries that food's tags on the Check screen, but the same words as a recipe line did not, so the recipe
// was only a caution while its own line was a hard stop (audit/tests/recipes-profiles.test.mjs, test 2). A recipe line
// now gets the same food-name tags as the label box. Every person here is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMatcher } from '../src/engine/dictionary.js';
import { buildPlan } from '../src/engine/plan.js';
import { checkText, checkRecipe, indexFoodNames } from '../src/engine/checker.js';

const J = f => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const conditions = J('conditions.json').modules;
const dictionaries = J('dictionaries.json');
const foods = J('foods.json');
const foodsById = new Map(foods.map(f => [f.id, f]));
const arr = x => (Array.isArray(x) ? x : x.recipes || []);
const recipes = [...arr(J('recipes.json')), ...arr(J('recipes-open.json')), ...arr(J('recipes-usda.json'))];
const byId = new Map(recipes.map(r => [r.id, r]));
const matcher = buildMatcher(dictionaries);
matcher.dietLists = J('diet-lists.json');
matcher.foodNames = indexFoodNames(foods);
const person = extra => ({ id: 't', name: 'Test Person', adult: true, age: 45, sex: 'female', modules: [], allergens: [], allergens_other: [], preferences: { avoid_tags: [], avoid_terms: [], patterns: [] }, medications: {}, tier2: {}, phases: {}, rule_settings: {}, ...extra });
const planOf = p => buildPlan({ person: p, conditions, dictionaries, today: new Date('2026-09-30') });

test('P0-3 follow-up: the four recipes from the audit fail, as their own lines do', () => {
  const milk = person({ allergens: ['allergen-milk'] }), celiac = person({ modules: ['celiac'] });
  for (const [p, id] of [[milk, 'wb-pasta-salad-with-chicken'], [milk, 'usda-chicken-rice-and-fruit-salad'], [celiac, 'pcs-banana-dippers'], [celiac, 'pcs-bran-flakes-fruit']]) {
    assert.equal(checkRecipe(byId.get(id), planOf(p), matcher, foodsById, p).verdict, 'fail', id);
  }
});

for (const [name, p] of Object.entries({ 'milk allergy': person({ allergens: ['allergen-milk'] }), 'wheat allergy': person({ allergens: ['allergen-wheat'] }), 'celiac disease': person({ modules: ['celiac'] }), 'soy allergy': person({ allergens: ['allergen-soy'] }), 'egg allergy': person({ allergens: ['allergen-egg'] }) })) {
  test(`P0-3 follow-up: ${name}: no recipe is milder than a line of its own that is a hard stop on the Check screen`, () => {
    const plan = planOf(p), cache = new Map();
    const line = d => { if (!cache.has(d)) cache.set(d, checkText(d, plan, matcher, p).verdict); return cache.get(d); };
    const bad = recipes.filter(r => (r.ingredients || []).some(i => i.display && line(i.display) === 'fail') && checkRecipe(r, plan, matcher, foodsById, p).verdict !== 'fail').map(r => r.id);
    assert.deepEqual(bad, []);
  });
}

// A commercial product's USDA record ("Salad dressing, italian dressing, commercial, regular") cannot vouch for every
// brand: some Italian dressings have cheese or egg yolk. Its name adds its tags but stays "not recognized", so a
// restricted plan gets "Not sure", as before P0-3. A single-ingredient food named exactly ("saffron") is known.
test('P0-3 refinement: a commercial product named exactly stays "not sure" for an allergy; a single-ingredient food is known', () => {
  const milk = person({ allergens: ['allergen-milk'] }), peanut = person({ allergens: ['allergen-peanut'] });
  assert.notEqual(checkText('Italian dressing', planOf(milk), matcher, milk).verdict, 'pass', 'label box');
  assert.notEqual(checkRecipe(byId.get('wb-crispy-chicken'), planOf(milk), matcher, foodsById, milk).verdict, 'pass', 'recipe with an Italian dressing line');
  assert.equal(checkText('Ranch dressing', planOf(milk), matcher, milk).verdict, 'fail', 'its tags still apply');
  assert.equal(checkText('saffron', planOf(peanut), matcher, peanut).verdict, 'pass');
  assert.equal(checkText('1/2 teaspoon celery seed', planOf(peanut), matcher, peanut).verdict, 'pass');
});
