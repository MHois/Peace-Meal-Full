// P0-2 (audit of September 30, 2026): soy lecithin and soybean oil passed for a person with a soy allergy, although the
// soy rule says "Refined soybean oil and soy lecithin are excluded by default and can be relaxed only with allergist
// input". The exclusion lived only in the separate soy-free pattern. Every person here is made up.
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
const person = extra => ({ id: 't', name: 'Test Person', adult: true, age: 45, sex: 'female', modules: [], allergens: [], allergens_other: [], preferences: { avoid_tags: [], avoid_terms: [], patterns: [] }, medications: {}, tier2: {}, phases: {}, rule_settings: {}, ...extra });
const check = (p, text) => checkText(text, buildPlan({ person: p, conditions, dictionaries, today: new Date('2026-09-30') }), matcher, p);
const LINES = ['soy lecithin', 'soybean oil', 'Contains: Soy Lecithin.'];

test('P0-2: with a soy allergy, soy lecithin and soybean oil are not allowed by default', () => {
  const soy = person({ allergens: ['allergen-soy'] });
  for (const t of LINES) assert.equal(check(soy, t).verdict, 'fail', t);
});

test('P0-2: the allergist setting allows them again, and nothing else', () => {
  const relaxed = person({ allergens: ['allergen-soy'], rule_settings: { 'soy-refined-oil-lecithin': 'allow' } });
  for (const t of LINES) assert.equal(check(relaxed, t).verdict, 'pass', t);
  for (const t of ['tofu', 'soy protein isolate', 'soy sauce', 'edamame']) assert.equal(check(relaxed, t).verdict, 'fail', t + ' is still soy');
});

test('P0-2: without a soy allergy the rule does not apply', () => {
  const milk = person({ allergens: ['allergen-milk'] });
  for (const t of LINES) assert.equal(check(milk, t).verdict, 'pass', t);
});

test('P0-2: the soy tag no longer says soy lecithin is exempt from allergen labeling (FDA declares it as "lecithin (soy)")', () => {
  const d = dictionaries.tags['allergen-soy'].description;
  assert.doesNotMatch(d, /lecithin \(soy-lecithin\) are exempt/);
  assert.match(d, /soy lecithin[^.]*not exempt/i);
});
