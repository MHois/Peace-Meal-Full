// N2 (found during the fix pass of September 30, 2026; not in the audit report): "cooking spray" passed for a soy
// allergy, and "baking spray" was not recognized. In USDA FoodData Central's branded records, 266 of 327 cooking sprays
// list soy lecithin and 80 list soybean oil; 18 of 20 baking sprays list soy lecithin and most list wheat flour (searched
// September 30, 2026; docs/VERIFY-log.md, F9). A soy allergy leaves out soy lecithin and refined soybean oil by default
// (P0-2), so both sprays are now a label check for them, and a baking spray for wheat and gluten too. Every person here
// is made up.
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
const person = extra => ({ id: 't', name: 'Test Person', adult: true, age: 50, sex: 'female', modules: [], allergens: [], allergens_other: [], preferences: { avoid_tags: [], avoid_terms: [], patterns: [] }, medications: {}, tier2: {}, phases: {}, rule_settings: {}, ...extra });
const check = (t, p) => checkText(t, buildPlan({ person: p, conditions, dictionaries, today: new Date('2026-09-30') }), matcher, p);
const labelTags = r => (r.verifyLabel || []).map(v => v.tag).sort();
const soy = person({ allergens: ['allergen-soy'] }), wheat = person({ allergens: ['allergen-wheat'] }), celiac = person({ modules: ['celiac'] }), peanut = person({ allergens: ['allergen-peanut'] });

test('N2: cooking spray asks for a soy label check with a soy allergy', () => {
  for (const t of ['cooking spray', 'canola oil cooking spray', 'olive oil cooking spray']) {
    const r = check(t, soy);
    assert.equal(r.verdict, 'caution', t);
    assert.ok(labelTags(r).includes('soy-lecithin'), t);
  }
  const allowed = person({ allergens: ['allergen-soy'], rule_settings: { 'soy-refined-oil-lecithin': 'allow' } });
  assert.equal(check('cooking spray', allowed).verdict, 'pass', 'with the allergist\'s allowance, nothing to check');
  assert.equal(check('cooking spray', peanut).verdict, 'pass', 'nothing to do with peanuts');
});

test('N2: baking spray is recognized, and is a label check for soy, wheat, and gluten', () => {
  assert.ok(labelTags(check('baking spray', soy)).includes('soy-lecithin'));
  assert.equal(check('baking spray', wheat).verdict, 'caution'); assert.ok(labelTags(check('baking spray', wheat)).includes('allergen-wheat'));
  assert.equal(check('baking spray', celiac).verdict, 'caution'); assert.ok(labelTags(check('baking spray', celiac)).includes('gluten'));
  assert.deepEqual(check('baking spray', peanut).unrecognized, [], 'no longer "not recognized"');
  assert.equal(check('baking spray with flour', wheat).verdict, 'fail', 'flour named: wheat, as before');
});
