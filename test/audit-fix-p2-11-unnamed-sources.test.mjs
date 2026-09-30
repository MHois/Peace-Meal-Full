// P2-11 (audit of September 30, 2026): ingredients whose allergen source a label can leave to a separate "Contains"
// statement passed when only the ingredient list was checked. FDA: the allergen's name must appear "In parentheses
// following the name of the ingredient. Examples: lecithin (soy), flour (wheat), and whey (milk) - OR - Immediately
// after or next to the list of ingredients in a contains statement" (FDA, Food Allergies page). FARE lists "modified
// food starch" under "Wheat is sometimes found in the following" and "Caramel candies" under "Other Possible Sources of
// Milk". These are now "check the label". Maltodextrin stays a pass: wheat-based maltodextrins are exempt from allergen
// labelling in Regulation (EU) No 1169/2011, Annex II, 1(b), and FARE's wheat list does not name it
// (docs/VERIFY-log.md, F5). Every person here is made up.
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
const person = extra => ({ id: 't', name: 'Test Person', adult: true, age: 40, sex: 'female', modules: [], allergens: [], allergens_other: [], preferences: { avoid_tags: [], avoid_terms: [], patterns: [] }, medications: {}, tier2: {}, phases: {}, rule_settings: {}, ...extra });
const check = (text, p) => checkText(text, buildPlan({ person: p, conditions, dictionaries, today: new Date('2026-09-30') }), matcher, p);
const soy = person({ allergens: ['allergen-soy'] }), wheat = person({ allergens: ['allergen-wheat'] }), milk = person({ allergens: ['allergen-milk'] }), celiac = person({ modules: ['celiac'] });
const labelTags = r => (r.verifyLabel || []).map(v => v.tag).sort();

test('P2-11: plain "lecithin" asks for a label check for soy; a named source is settled', () => {
  const r = check('lecithin', soy);
  assert.equal(r.verdict, 'caution');
  assert.deepEqual(labelTags(r), ['soy-lecithin']);
  assert.equal(check('lecithin (soy)', soy).verdict, 'fail', 'the source named: soy');
  assert.equal(check('sunflower lecithin', soy).verdict, 'pass', 'the source named: not soy');
  const allowed = person({ allergens: ['allergen-soy'], rule_settings: { 'soy-refined-oil-lecithin': 'allow' } });
  assert.equal(check('lecithin', allowed).verdict, 'pass', 'soy lecithin allowed with an allergist: nothing to check');
});

test('P2-11: "modified food starch" asks for a label check for wheat, and for gluten in celiac disease', () => {
  for (const t of ['modified food starch', 'modified starch']) {
    const w = check(t, wheat), c = check(t, celiac);
    assert.equal(w.verdict, 'caution', t); assert.ok(labelTags(w).includes('allergen-wheat'), t);
    assert.equal(c.verdict, 'caution', t); assert.ok(labelTags(c).includes('gluten'), t);
  }
  assert.equal(check('modified food starch', person({ allergens: ['allergen-peanut'] })).verdict, 'pass', 'nothing to do with peanuts');
});

test('P2-11: "caramel" asks for a label check for milk; caramel color does not', () => {
  const r = check('caramel', milk);
  assert.equal(r.verdict, 'caution');
  assert.deepEqual(labelTags(r), ['allergen-milk']);
  assert.equal(check('caramel color', milk).verdict, 'pass');
});

test('P2-11: maltodextrin stays a pass for a wheat allergy and for celiac disease (exempt from allergen labelling; not on FARE\'s wheat list)', () => {
  assert.equal(check('maltodextrin', wheat).verdict, 'pass');
  assert.equal(check('maltodextrin', celiac).verdict, 'pass');
});
