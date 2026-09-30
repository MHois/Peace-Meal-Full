// P1-3 (audit of September 30, 2026): salt, soy sauce, and garlic salt passed for a person with high blood pressure.
// The label check looked only at avoid tags, and the sodium limit is a daily number, so no label ever flagged salt.
// Now an ingredient that USDA FoodData Central lists above 600 mg sodium per 100 g (the UK front-of-pack "high" cutoff,
// more than 1.5 g salt per 100 g) carries the tag sodium-high. While the plan has a sodium limit, that is a caution
// that says to check the sodium on the Nutrition Facts label and cites the limit's own rule. Without a sodium limit
// nothing changes. A recipe keeps its per-serving sodium comparison; only a salty line whose sodium it cannot count (no
// linked food, no published nutrition) makes it a caution. Every person here is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMatcher } from '../src/engine/dictionary.js';
import { buildPlan } from '../src/engine/plan.js';
import { checkText, checkFood, checkRecipe, indexFoodNames } from '../src/engine/checker.js';
import { checkHeadline } from '../src/ui/check.js';

const J = f => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const conditions = J('conditions.json').modules;
const dictionaries = J('dictionaries.json');
const foods = J('foods.json');
const arr = x => (Array.isArray(x) ? x : x.recipes || []);
const allRecipes = [...arr(J('recipes.json')), ...arr(J('recipes-open.json')), ...arr(J('recipes-usda.json'))];
const foodsById = new Map(foods.map(f => [f.id, f]));
const matcher = buildMatcher(dictionaries);
matcher.dietLists = J('diet-lists.json');
matcher.foodNames = indexFoodNames(foods);
const person = extra => ({ id: 't', name: 'Test Person', adult: true, age: 64, sex: 'female', modules: [], allergens: [], allergens_other: [], preferences: { avoid_tags: [], avoid_terms: [], patterns: [] }, medications: {}, tier2: {}, phases: {}, rule_settings: {}, ...extra });
const planOf = p => buildPlan({ person: p, conditions, dictionaries, today: new Date('2026-09-30') });
const htn = person({ modules: ['hypertension'] });

// The audit's list (audit/tests/check-screen-consistency.test.mjs).
const AUDIT_LIST = ['salt', 'sea salt', 'kosher salt', 'garlic salt', 'celery salt', 'seasoned salt', 'soy sauce', 'fish sauce', 'baking soda', 'monosodium glutamate', 'pickles', 'olives', 'feta', 'hot dog'];

test('P1-3: with a sodium limit, each of the audit\'s salty labels is a caution that names the limit and its rule', () => {
  const plan = planOf(htn);
  for (const t of AUDIT_LIST) {
    const r = checkText(t, plan, matcher, htn);
    assert.equal(r.verdict, 'caution', t);
    assert.equal((r.sodium || []).length, 1, t);
    assert.equal(r.sodium[0].limit, 2300, t);
    assert.deepEqual(r.sodium[0].rules.map(x => x.rule), ['htn-sodium'], t);
  }
});

test('P1-3: every module with a sodium limit gets the caution, citing its own rule', () => {
  const expected = { t2d: 't2d-sodium', 'ckd-non-dialysis': 'ckd-sodium', 'heart-failure': 'hf-sodium', dialysis: 'dial-sodium', 'kidney-stones': 'stone-sodium', dash: 'dash-sodium' };
  for (const [m, rule] of Object.entries(expected)) {
    const p = person({ modules: [m] });
    const r = checkText('soy sauce', planOf(p), matcher, p);
    assert.equal(r.verdict, 'caution', m);
    assert.ok(r.sodium[0].rules.some(x => x.rule === rule), m);
  }
});

test('P1-3: without a sodium limit, salty labels pass as before', () => {
  for (const p of [person({}), person({ allergens: ['allergen-peanut'] })]) {
    for (const t of ['salt', 'garlic salt', 'soy sauce', 'olives', 'feta']) {
      const r = checkText(t, planOf(p), matcher, p);
      assert.equal(r.verdict, 'pass', t);
      assert.deepEqual(r.sodium, [], t);
    }
  }
});

test('P1-3: an ingredient list with salt in it gets the caution; one without stays a pass', () => {
  const plan = planOf(htn);
  const r = checkText('whole wheat flour, water, yeast, salt', plan, matcher, htn);
  assert.equal(r.verdict, 'caution');
  assert.deepEqual(r.sodium[0].terms, ['salt']);
  assert.equal(checkText('rice, water, lemon juice', plan, matcher, htn).verdict, 'pass');
  // A dictionary word and the USDA food of the same name are listed once.
  assert.deepEqual(checkText('salt, soy sauce', plan, matcher, htn).sodium[0].terms, ['salt', 'soy sauce']);
});

test('P1-3: a word that covers salty and unsalty kinds is "can be high in salt", and still a caution', () => {
  const r = checkText('cheese', planOf(htn), matcher, htn);
  assert.equal(r.verdict, 'caution');
  assert.deepEqual(r.sodium[0].terms, []);
  assert.deepEqual(r.sodium[0].mayTerms, ['cheese']);
});

test('P1-3: the food box: a USDA food above 600 mg sodium per 100 g is a caution with a sodium limit, and its typed name agrees', () => {
  const plan = planOf(htn), none = person({});
  let high = 0;
  for (const f of foods) {
    const na = f.per100g && f.per100g.sodium_mg;
    const r = checkFood(f, plan, matcher, htn);
    if (typeof na === 'number' && na > 600) {
      high++;
      assert.notEqual(r.verdict, 'pass', f.name);
      assert.equal(r.sodium[0].per100g, na, f.name);
      assert.equal(checkFood(f, planOf(none), matcher, none).verdict, 'pass', f.name + ' passes with no limit');
    } else {
      assert.deepEqual(r.sodium, [], f.name + ' at or below 600 mg gets no salt caution');
    }
  }
  assert.ok(high > 300, String(high));
  const salt = foods.find(f => f.fdcId === 746775);
  assert.equal(checkText(salt.short || salt.name, plan, matcher, htn).verdict, 'caution', 'typed USDA name');
});

test('P1-3: the Check screen headline says what to do', () => {
  const plan = planOf(htn);
  assert.equal(checkHeadline(checkText('salt', plan, matcher, htn)), 'High in salt. Check the sodium on the label.');
  assert.equal(checkHeadline(checkText('salt', plan, matcher, htn), true), 'High in salt. Check the sodium on the label.');
  assert.equal(checkHeadline(checkText('cheese', plan, matcher, htn)), 'Can be high in salt. Check the sodium on the label.');
});

test('P1-3: a recipe whose sodium is counted (every line linked, or published nutrition) gets no salt flag; its per-serving number decides', () => {
  const plan = planOf(htn);
  const counted = allRecipes.filter(r => (r.nutrition_per_serving && r.nutrition_source) || (r.ingredients || []).every(i => foodsById.has(i.food)));
  assert.ok(counted.length > 1800, String(counted.length));
  const flagged = counted.filter(r => (checkRecipe(r, plan, matcher, foodsById, htn).sodium || []).length).map(r => r.id);
  assert.deepEqual(flagged, []);
});

test('P1-3: a recipe with a salty line the app cannot count is a caution with a sodium limit, and unchanged without one', () => {
  const plan = planOf(htn), peanut = person({ allergens: ['allergen-peanut'] }), peanutPlan = planOf(peanut);
  const tapenade = allRecipes.find(r => r.id === 'wb-tapenade');
  const r = checkRecipe(tapenade, plan, matcher, foodsById, htn);
  assert.equal(r.verdict, 'caution', 'no nutrition numbers, and anchovies, capers, and olives');
  assert.equal(r.sodium[0].uncounted, true);
  assert.ok(r.sodium[0].terms.some(t => /capers/.test(t)), JSON.stringify(r.sodium[0]));
  assert.deepEqual(checkRecipe(tapenade, peanutPlan, matcher, foodsById, peanut).sodium, []);
  const uncounted = allRecipes.filter(x => !(x.nutrition_per_serving && x.nutrition_source) && !(x.ingredients || []).some(i => foodsById.has(i.food)));
  const salty = uncounted.filter(x => (x.ingredients || []).some(i => { const t = matcher.tagText(i.display || ''); return t.tags['sodium-high'] || (t.mayContain || {})['sodium-high']; }));
  assert.ok(salty.length > 1000, String(salty.length));
  for (const x of salty) assert.notEqual(checkRecipe(x, plan, matcher, foodsById, htn).verdict, 'pass', x.id);
});

// The words tagged here are the ones in docs/VERIFY-log.md, fix pass F4, each with its USDA FoodData Central records.
test('P1-3: the dictionary words marked high in salt are exactly the ones logged, with their USDA evidence', () => {
  const tagged = dictionaries.entries.filter(e => (e.tags || []).includes('sodium-high')).map(e => e.term).sort();
  const may = dictionaries.entries.filter(e => (e.may_contain || []).includes('sodium-high')).map(e => e.term).sort();
  assert.ok(tagged.length >= 100 && may.length >= 60, `${tagged.length} tagged, ${may.length} may`);
  const log = readFileSync(new URL('../docs/VERIFY-log.md', import.meta.url), 'utf8');
  const f4 = log.slice(log.indexOf('### F4.'));
  assert.ok(f4.length > 100, 'the log has an F4 section');
  for (const t of tagged) assert.match(f4, new RegExp('\\| `' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '` \\| high \\|'), t);
  for (const t of may) assert.match(f4, new RegExp('\\| `' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '` \\| can be high \\|'), t);
  assert.ok(dictionaries.tags['sodium-high'], 'the tag is declared');
});
