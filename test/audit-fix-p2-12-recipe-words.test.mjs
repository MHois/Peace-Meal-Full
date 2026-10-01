// P2-12 (audit of September 30, 2026): 526 of 841 lite recipes were "Not sure" for a peanut allergy, almost all because of
// imported ingredient lines with words the dictionary could not place. Many were everyday UK and US names for foods the
// dictionary already knew (chilli powder, cornflour, rapeseed oil, sultanas, swede, passata, low fat spread), and some
// were equipment ("nonstick", "wooden skewers"). Each new name carries the tags and label checks of the entry it is
// another name for, so no food is judged differently; a word that can hide something (curry paste, dressing, a plain
// "oil") stays "not recognized". Every person here is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMatcher } from '../src/engine/dictionary.js';
import { buildPlan } from '../src/engine/plan.js';
import { checkText } from '../src/engine/checker.js';

const J = f => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const conditions = J('conditions.json').modules, dictionaries = J('dictionaries.json');
const matcher = buildMatcher(dictionaries);
matcher.dietLists = J('diet-lists.json');
const person = extra => ({ id: 't', name: 'Test Person', adult: true, age: 66, sex: 'female', modules: [], allergens: [], allergens_other: [], preferences: { avoid_tags: [], avoid_terms: [], patterns: [] }, medications: {}, tier2: {}, phases: {}, rule_settings: {}, ...extra });
const check = (t, p) => checkText(t, buildPlan({ person: p, conditions, dictionaries, today: new Date('2026-09-30') }), matcher, p);
const entry = term => dictionaries.entries.find(e => e.term === term);

// new name -> the entry it is another name for
const SAME_AS = {
  'chilli powder': 'chili powder', cornflour: 'cornstarch', 'rapeseed oil': 'canola oil', sultana: 'raisin', swede: 'rutabaga',
  cannellini: 'cannellini bean', 'haricot bean': 'navy bean', 'french stick': 'bread', baguette: 'bread', 'forest fruits': 'mixed berries',
  passata: 'tomato paste', tagliatelle: 'spaghetti', linguine: 'spaghetti', linguini: 'spaghetti', iceberg: 'lettuce', 'cos lettuce': 'lettuce',
  'salad leaves': 'lettuce', 'bay leaves': 'bay leaf', 'fat spread': 'margarine', wholewheat: 'whole wheat', wholegrain: 'whole grain'
};

test('P2-12: each new name carries exactly the tags and label checks of the food it names', () => {
  for (const [term, from] of Object.entries(SAME_AS)) {
    const e = entry(term), f = entry(from);
    assert.ok(e, `${term} is in the dictionary`);
    assert.deepEqual([...e.tags].sort(), [...f.tags].sort(), term);
    assert.deepEqual([...(e.may_contain || [])].sort(), [...(f.may_contain || [])].sort(), term);
    assert.equal(e.risk, f.risk, term);
  }
});

const LINES = ['2 teaspoons chilli powder', '1 tablespoon cornflour', '30ml rapeseed oil', '25g sultanas', '1 swede, peeled and diced', '400g tin cannellini, drained', '400g haricot beans', '150g frozen forest fruits', '500g passata', '250g tagliatelle', '200g linguine', '½ iceberg lettuce, shredded', '1 cos lettuce', '2 handfuls mixed salad leaves', '2 bay leaves', '25g low fat spread', 'nonstick cooking spray', '4 wooden skewers', '1 french stick'];

test('P2-12: everyday recipe lines that were "not recognized" are placed now', () => {
  const peanut = person({ allergens: ['allergen-peanut'] });
  for (const t of LINES) {
    const r = check(t, peanut);
    assert.deepEqual(r.unrecognized, [], t);
    assert.equal(r.verdict, 'pass', `${t}: nothing to do with peanuts`);
  }
});

test('P2-12: the same lines are judged as the foods they name', () => {
  const wheat = person({ allergens: ['allergen-wheat'] }), milk = person({ allergens: ['allergen-milk'] }), soy = person({ allergens: ['allergen-soy'] }), celiac = person({ modules: ['celiac'] });
  for (const t of ['1 french stick', '250g tagliatelle', '200g linguine']) { assert.equal(check(t, wheat).verdict, 'fail', t); assert.equal(check(t, celiac).verdict, 'fail', t); }
  for (const p of [milk, soy]) assert.equal(check('25g low fat spread', p).verdict, 'caution', 'a spread is a label check, like margarine');
  assert.equal(check('1 tablespoon cornflour', celiac).verdict, 'pass', 'cornflour is cornstarch');
  assert.equal(check('nonstick cooking spray', soy).verdict, 'caution', 'cooking spray stays a soy label check (N2)');
  const t2d = person({ modules: ['t2d'] });
  for (const t of ['12 oz whole-wheat linguine', '250g wholewheat tagliatelle']) assert.ok(!check(t, t2d).hits.some(h => h.tag === 'refined-grain'), `${t} is whole grain, not refined`);
});

test('P2-12: words that can hide something stay "not recognized"', () => {
  const peanut = person({ allergens: ['allergen-peanut'] });
  for (const t of ['2 tablespoons curry paste', '1 tablespoon oil', 'dressing', '4 crumpets', '2 teaspoons tikka masala curry paste', '2 tablespoons sweet chilli sauce']) {
    assert.notEqual(check(t, peanut).verdict, 'pass', t);
  }
});
