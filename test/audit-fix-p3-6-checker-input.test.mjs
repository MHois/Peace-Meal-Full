// P3-6 (audit of September 30, 2026): checkText assumed it was given a string. The screens always pass the text box's
// string, but an object that cannot be turned into text (its toString is not a function) made it throw "Cannot convert
// object to primitive value" (audit/tests/checker-fuzz.test.mjs, property C). Now anything the checker cannot read as
// text counts as an ingredient it does not recognize: "Not sure" for a restricted plan, never PASS (README rule 7), and
// no throw. Every person here is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMatcher } from '../src/engine/dictionary.js';
import { buildPlan } from '../src/engine/plan.js';
import { checkText } from '../src/engine/checker.js';

const J = f => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const conditions = J('conditions.json').modules, dictionaries = J('dictionaries.json');
const matcher = buildMatcher(dictionaries);
const person = { id: 't', name: 'Test Person', adult: true, age: 40, sex: 'female', modules: [], allergens: ['allergen-peanut'], allergens_other: [], preferences: { avoid_tags: [], avoid_terms: [], patterns: [] }, medications: {}, tier2: {}, phases: {}, rule_settings: {} };
const plan = buildPlan({ person, conditions, dictionaries, today: new Date('2026-10-01') });

test('P3-6: input that cannot be read as text does not throw and is not a pass', () => {
  const unreadable = [{ toString: [] }, { toString() { throw new Error('no text'); } }, Object.assign(Object.create(null), { valueOf: [] })];
  for (const x of unreadable) {
    let r;
    assert.doesNotThrow(() => { r = checkText(x, plan, matcher, person); });
    assert.notEqual(r.verdict, 'pass', 'Not sure, never PASS');
    assert.ok(r.unrecognized.length, 'counted as not recognized');
  }
});

test('P3-6: text is checked exactly as before', () => {
  assert.equal(checkText('peanuts', plan, matcher, person).verdict, 'fail');
  assert.equal(checkText('water', plan, matcher, person).verdict, 'pass');
  assert.equal(checkText(['peanuts'], plan, matcher, person).verdict, 'fail', 'a list of words is read as its text');
  assert.equal(checkText({}, plan, matcher, person).verdict, 'caution', 'a plain object reads as "[object Object]", which is not recognized');
});
