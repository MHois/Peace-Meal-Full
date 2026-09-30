// P0-3 (audit of September 30, 2026): the Check screen's two boxes disagreed. A food the food box flags ("Caramels" for
// a milk allergy, "Grape-Nuts" for a wheat allergy) passed when its name was typed into the label box, because the label
// box used only the dictionary. And on a low histamine plan "corned beef" passed, because the list's alias "beef"
// matched a word inside a longer name (P2-13). Every person here is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMatcher } from '../src/engine/dictionary.js';
import { buildPlan } from '../src/engine/plan.js';
import { checkText, checkFood, indexFoodNames } from '../src/engine/checker.js';
import { approvedFor } from '../src/engine/dietlists.js';

const J = f => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const conditions = J('conditions.json').modules;
const dictionaries = J('dictionaries.json');
const foods = J('foods.json');
const lists = J('diet-lists.json');
const matcher = buildMatcher(dictionaries);
matcher.dietLists = lists;
matcher.foodNames = indexFoodNames(foods);
const person = extra => ({ id: 't', name: 'Test Person', adult: true, age: 45, sex: 'female', modules: [], allergens: [], allergens_other: [], preferences: { avoid_tags: [], avoid_terms: [], patterns: [] }, medications: {}, tier2: {}, phases: {}, rule_settings: {}, ...extra });
const planOf = p => buildPlan({ person: p, conditions, dictionaries, today: new Date('2026-09-30') });

const PROFILES = {
  'milk allergy': person({ allergens: ['allergen-milk'] }), 'wheat allergy': person({ allergens: ['allergen-wheat'] }), 'celiac disease': person({ modules: ['celiac'] }),
  'low histamine': person({ modules: ['mcas'] }), 'low FODMAP': person({ modules: ['ibs-low-fodmap'] }), 'peanut allergy': person({ allergens: ['allergen-peanut'] }),
  'egg allergy': person({ allergens: ['allergen-egg'] }), 'soy allergy': person({ allergens: ['allergen-soy'] }), 'lactose intolerance': person({ modules: ['lactose-intolerance'] })
};

for (const [name, p] of Object.entries(PROFILES)) {
  test(`P0-3: ${name}: no food the food box flags passes when its name is typed into the label box`, () => {
    const plan = planOf(p);
    const passes = [];
    for (const f of foods) {
      if (checkFood(f, plan, matcher, p).verdict === 'pass') continue;
      const typed = f.short || f.name;
      if (checkText(typed, plan, matcher, p).verdict === 'pass') passes.push(typed);
    }
    assert.deepEqual(passes.slice(0, 10), [], `${passes.length} typed names pass`);
  });
}

test('P0-3: the named foods from the audit, and controls that must still pass', () => {
  const milk = PROFILES['milk allergy'], wheat = PROFILES['wheat allergy'], celiac = PROFILES['celiac disease'], hist = PROFILES['low histamine'];
  assert.equal(checkText('Caramels', planOf(milk), matcher, milk).verdict, 'fail');
  assert.equal(checkText('Grape-Nuts', planOf(wheat), matcher, wheat).verdict, 'fail');
  assert.equal(checkText('1 cup Grape-Nuts', planOf(celiac), matcher, celiac).verdict, 'fail', 'an amount in front of the name');
  assert.notEqual(checkText('corned beef', planOf(hist), matcher, hist).verdict, 'pass');
  assert.equal(checkText('chicken', planOf(wheat), matcher, wheat).verdict, 'pass');
  assert.equal(checkText('beef', planOf(hist), matcher, hist).verdict, 'pass');
  assert.equal(checkText('fresh beef', planOf(hist), matcher, hist).verdict, 'pass');
});

test('P2-13: a list name approves a text only when it covers the whole name, not one word inside a longer one', () => {
  assert.equal(approvedFor('corned beef', 'low-histamine', lists, {}).approved, false);
  assert.equal(approvedFor('beef', 'low-histamine', lists, {}).approved, true);
  assert.equal(approvedFor('4 carrots, cut in sticks', 'low-fodmap', lists, {}).approved, true, 'preparation words do not count');
  assert.equal(approvedFor('2 boneless skinless chicken breasts', 'low-fodmap', lists, {}).approved, true, 'descriptors do not count');
  // Words that change a food for these diets are not ignored.
  assert.equal(approvedFor('orange juice concentrate', 'low-fodmap', lists, {}).approved, false, 'juice and concentrate are not ignored');
  assert.equal(approvedFor('smoked chicken', 'low-histamine', lists, {}).approved, false, 'smoked is not ignored');
});

// The audit counted 100 (low FODMAP) and 98 (low histamine) such foods. Six remain, each for a reason that is not a
// word inside a longer name: the low FODMAP list approves tempeh by name (the list is the diet's own source; the food
// data's GOS tag comes from soy), USDA's four "Pork, leg (ham)" records are fresh pork leg that the food data tags from the word
// "ham", and USDA's "Salmon, pink, canned" puts "canned" last, where the "canned fish" leave-out cannot see it; its own
// histamine tag still makes it a caution in both boxes.
test('P2-13: no USDA food that carries a low FODMAP or low histamine avoid tag is approved by the list through a word inside its name', () => {
  const expected = { 'low-fodmap': ['Tempeh, cooked'], 'low-histamine': ['Pork, leg (ham), whole, raw', 'Pork, leg (ham), whole, cooked, roasted', 'Pork, leg (ham), rump half, raw', 'Pork, leg (ham), rump half, cooked, roasted', 'Salmon, pink, canned'] };
  for (const [family, fam] of Object.entries(lists.families)) {
    const famTags = new Set(fam.tags || []);
    const risky = foods.filter(f => (f.tags || []).some(t => famTags.has(t))).filter(f => { const a = approvedFor(f.short || f.name, family, lists, {}, {}); return a.approved && a.why === 'list'; }).map(f => f.short || f.name);
    assert.deepEqual([...risky].sort(), [...expected[family]].sort(), family);
  }
  const h = PROFILES['low histamine'];
  const salmon = foods.find(f => (f.short || f.name) === 'Salmon, pink, canned');
  assert.notEqual(checkFood(salmon, planOf(h), matcher, h).verdict, 'pass', 'its histamine tag still flags it');
});

test('P2-13: "fresh cheese" and "young cheese" no longer approve any cheese; aging words count', () => {
  for (const t of ['cheese', 'blue cheese', 'sharp cheese', 'mature cheese']) assert.equal(approvedFor(t, 'low-histamine', lists, {}).approved, false, t);
  for (const t of ['fresh cheese', 'young cheese', 'ricotta', 'fresh mozzarella', 'chicken', 'fresh chicken', 'fresh basil']) assert.equal(approvedFor(t, 'low-histamine', lists, {}).approved, true, t);
  for (const t of ['canned tuna', '1 can tuna in water', 'tinned sardines']) assert.equal(approvedFor(t, 'low-histamine', lists, {}).why, 'avoid', t);
});
