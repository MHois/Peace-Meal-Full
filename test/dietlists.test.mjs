// Strict mode: approved-food lists, per-person tolerated and reacts lists, and the checker wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildMatcher } from '../src/engine/dictionary.js';
import { buildPlan } from '../src/engine/plan.js';
import { checkRecipe } from '../src/engine/checker.js';
import { approvedFor, strictCheck, strictFamiliesFor, strictOn, dietNormalize } from '../src/engine/dietlists.js';

const J = f => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const conditions = J('conditions.json').modules, dictionaries = J('dictionaries.json'), lists = J('diet-lists.json');
const foodsById = new Map(J('foods.json').map(f => [f.id, f]));
const matcher = buildMatcher(dictionaries); matcher.dietLists = lists;
const bare = buildMatcher(dictionaries);
const person = (mods, extra = {}) => ({ id: 'x', name: 'x', adult: true, age: 50, modules: mods, allergens: [], preferences: { avoid_tags: [], avoid_terms: [] }, medications: {}, tier2: {}, phases: {}, modes: {}, acknowledged: [], flags: {}, variants: {}, ...extra });
const fodmap = person(['ibs-low-fodmap']);
const plan = buildPlan({ person: fodmap, conditions, dictionaries, today: new Date('2026-09-10') });
const plainPlan = buildPlan({ person: person([]), conditions, dictionaries, today: new Date('2026-09-10') });

const rice = { id: 't-rice', name: 'Rice bowl', meal: ['lunch'], servings: 1, active_min: 5, total_min: 15, skill: 'beginner', equipment: ['stove'], assembly_only: false, leftovers: 'ok', tags: [],
  ingredients: [{ food: 'fdc-168877', grams: 80, display: '½ cup white rice' }, { food: 'fdc-2258586', grams: 100, display: '1 carrot, grated' }, { food: 'fdc-171413', grams: 10, display: '2 tsp olive oil' }, { food: 'fdc-746775', grams: 1, display: 'pinch of salt' }], steps: ['Cook.'] };
const gum = { ...rice, id: 't-gum', ingredients: rice.ingredients.concat([{ display: '1 tsp xanthan gum' }]) };

test('list matching strips amounts and matches word or phrase, singular or plural', () => {
  assert.equal(dietNormalize('2 large carrots, finely chopped'), 'carrots');
  assert.equal(approvedFor('2 large carrots, finely chopped', 'low-fodmap', lists, {}).approved, true);
  assert.equal(approvedFor('3 spring onion green tops, sliced', 'low-fodmap', lists, {}).approved, true);
  assert.equal(approvedFor('1 tsp xanthan gum', 'low-fodmap', lists, {}).why, 'unlisted');
  assert.equal(approvedFor('1 cup lactose-free milk', 'low-fodmap', lists, {}).approved, true);
});

test('strict mode: an unlisted ingredient is a caution named in the check; off, the avoid list alone decides', () => {
  assert.deepEqual(strictFamiliesFor(plan, lists), ['low-fodmap']);
  assert.deepEqual(strictFamiliesFor(plainPlan, lists), []);
  const ok = checkRecipe(rice, plan, matcher, foodsById, fodmap);
  assert.equal(ok.verdict, 'pass');
  assert.deepEqual(ok.strictFamilies, ['low-fodmap']);
  const c = checkRecipe(gum, plan, matcher, foodsById, fodmap);
  assert.equal(c.verdict, 'caution');
  assert.equal(c.notApproved.length, 1);
  assert.equal(c.notApproved[0].label, '1 tsp xanthan gum');
  assert.equal(c.notApproved[0].why, 'unlisted');
  const off = person(['ibs-low-fodmap'], { strict_diets: { 'low-fodmap': false } });
  assert.equal(strictOn(off, 'low-fodmap'), false);
  assert.equal(checkRecipe(gum, plan, matcher, foodsById, off).verdict, 'pass', 'strict off: no tag hit, so it passes');
  assert.equal(checkRecipe(gum, plan, bare, foodsById, fodmap).verdict, 'pass', 'a matcher without lists never applies strict mode');
  assert.equal(checkRecipe(gum, plainPlan, matcher, foodsById, person([])).verdict, 'pass', 'no restricted family: strict does not apply');
});

test('per-person lists: a tolerated food is approved; a food the person reacts to is a caution even though the list allows it', () => {
  const tol = person(['ibs-low-fodmap'], { diet_lists: { 'low-fodmap': { tolerated: [{ term: 'xanthan gum', note: 'fine for me' }], reacts: [] } } });
  assert.equal(checkRecipe(gum, plan, matcher, foodsById, tol).verdict, 'pass');
  const re = person(['ibs-low-fodmap'], { diet_lists: { 'low-fodmap': { tolerated: [], reacts: [{ term: 'carrot', note: 'bloating' }] } } });
  const c = checkRecipe(rice, plan, matcher, foodsById, re);
  assert.equal(c.verdict, 'caution');
  assert.equal(c.notApproved[0].why, 'reacts');
  assert.ok(/carrot/.test(c.notApproved[0].label));
  const s = strictCheck(rice, plan, lists, foodsById, re);
  assert.equal(s.notApproved.length, 1);
});

test('every Peace Meal diet recipe passes strict mode for the diets it was written for', () => {
  const recipes = J('recipes.json').filter(r => Array.isArray(r.diet_written_for));
  assert.ok(recipes.length >= 60);
  const plans = { 'low-fodmap': plan, 'low-histamine': buildPlan({ person: person(['mcas']), conditions, dictionaries, today: new Date('2026-09-10') }) };
  const people = { 'low-fodmap': fodmap, 'low-histamine': person(['mcas']) };
  for (const r of recipes) for (const fam of r.diet_written_for) {
    const c = checkRecipe(r, plans[fam], matcher, foodsById, people[fam]);
    assert.equal(c.verdict, 'pass', `${r.id} for ${fam}: ${JSON.stringify(c.notApproved)} ${c.hits.map(h => h.label).join(',')}`);
  }
});
