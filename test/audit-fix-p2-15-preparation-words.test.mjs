// P2-15 (audit of September 30, 2026): the label box raised false alarms on preparation words that recipes add after
// a comma ("1 English muffin, split", "4 carrots, cut in sticks"). A piece made only of preparation words names no
// food, so it is neither "not recognized" nor, in strict mode, "not on the approved list". Every person is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMatcher } from '../src/engine/dictionary.js';
import { buildPlan } from '../src/engine/plan.js';
import { checkText } from '../src/engine/checker.js';

const J = f => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const conditions = J('conditions.json').modules;
const dictionaries = J('dictionaries.json');
const matcher = buildMatcher(dictionaries);
matcher.dietLists = J('diet-lists.json');
const person = extra => ({ id: 't', name: 'Test Person', adult: true, age: 45, sex: 'female', modules: [], allergens: [], allergens_other: [], preferences: { avoid_tags: [], avoid_terms: [], patterns: [] }, medications: {}, tier2: {}, phases: {}, ...extra });
const planOf = p => buildPlan({ person: p, conditions, dictionaries, today: new Date('2026-09-30') });

test('P2-15: preparation words after a comma are not reported as unknown ingredients', () => {
  for (const text of ['1 English muffin, split', '1 slice whole-wheat toast, on the side', '2 slices whole-wheat bread, toasted', '1 tbsp butter, melted, plus a little for the pan',
    '1 tbsp fresh ginger, cut into thin matchsticks', '1 red bell pepper, fresh-roasted and sliced', '1 cup edamame, shelled', '2 tbsp almonds, slivered and toasted', '1 scallion, green tops sliced'])
    assert.deepEqual(matcher.tagText(text).unrecognized, [], text);
});

test('P2-15: a peanut allergy gets PASS, not "Not sure", for those lines', () => {
  const p = person({ allergens: ['allergen-peanut'] }), plan = planOf(p);
  for (const text of ['1 English muffin, split', '2 slices whole-wheat bread, toasted', '1 tbsp fresh ginger, cut into thin matchsticks'])
    assert.equal(checkText(text, plan, matcher, p).verdict, 'pass', text);
});

test('P2-15: in strict mode, a piece of only preparation words is not "not on the approved list"', () => {
  const p = person({ modules: ['ibs-low-fodmap'] }), plan = planOf(p);
  for (const text of ['4 carrots, cut in sticks', '1 lb salmon fillet, cut in 4 pieces', '2 carrots, cut into thin sticks']) {
    const r = checkText(text, plan, matcher, p);
    assert.deepEqual(r.notApproved.map(n => n.label), [], text);
    assert.equal(r.verdict, 'pass', text);
  }
  // The leave-out examples still apply to such a piece: "jar" on a low histamine plan.
  const h = person({ modules: ['mcas'] });
  assert.notEqual(checkText('1 jar (7 ounces) roasted red peppers', planOf(h), matcher, h).verdict, 'pass');
});

test('P2-15: words that can stand for a food on their own are still reported', () => {
  for (const text of ['2 cups skim', 'oil of your choice', '1 cup juice', '2 tbsp powder', '1 lb meat'])
    assert.ok(matcher.tagText(text).unrecognized.length, text);
});

test('P2-15: a food whose name is made of noise words is not skipped in strict mode ("half-and-half" is cream)', () => {
  const h = person({ modules: ['mcas'] });
  const r = checkText('half-and-half', planOf(h), matcher, h);
  assert.notEqual(r.verdict, 'pass');
  const m = person({ allergens: ['allergen-milk'] });
  assert.equal(checkText('half-and-half', planOf(m), matcher, m).verdict, 'fail');
});
