// N1 (found during the fix pass of September 30, 2026; not in the audit report): "red wine vinegar", "white wine
// vinegar", and "champagne vinegar" were a hard stop for a pregnant person, tagged as alcohol, while "wine vinegar",
// "sherry vinegar", and "rice wine vinegar" passed. The dictionary's "wine", "sherry", and "rice wine" entries already
// say a vinegar made from them is not the drink (their except lists); "red wine", "white wine", "champagne", and four
// other wine entries lacked the same. Wine vinegar is "obtained exclusively by acetous fermentation of wine" (the EU
// definition), the fermentation that turns the wine's alcohol into acetic acid. The histamine tags stay: every vinegar
// is still fermented on a low histamine plan. Every person here is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMatcher } from '../src/engine/dictionary.js';
import { buildPlan } from '../src/engine/plan.js';
import { checkText, indexFoodNames } from '../src/engine/checker.js';

const J = f => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const conditions = J('conditions.json').modules, dictionaries = J('dictionaries.json');
const matcher = buildMatcher(dictionaries);
matcher.dietLists = J('diet-lists.json');
matcher.foodNames = indexFoodNames(J('foods.json'));
const person = extra => ({ id: 't', name: 'Test Person', adult: true, age: 31, sex: 'female', modules: [], allergens: [], allergens_other: [], preferences: { avoid_tags: [], avoid_terms: [], patterns: [] }, medications: {}, tier2: {}, phases: {}, rule_settings: {}, ...extra });
const who = extra => { const p = person(extra); return { p, plan: buildPlan({ person: p, conditions, dictionaries, today: new Date('2026-09-30') }) }; };
const check = (w, t) => checkText(t, w.plan, matcher, w.p);
const pregnant = who({ pregnancy: true }), htn = who({ modules: ['hypertension'] }), mcas = who({ modules: ['mcas'] }), celiac = who({ modules: ['celiac'] });

const WINE_VINEGARS = ['red wine vinegar', 'white wine vinegar', 'champagne vinegar', 'champagne wine vinegar', 'sparkling wine vinegar', 'prosecco vinegar', 'cava vinegar', 'port wine vinegar'];

test('N1: a wine vinegar is not alcohol, so it passes in pregnancy and carries no alcohol tag', () => {
  for (const t of WINE_VINEGARS) {
    assert.ok(!matcher.tagText(t).tags.alcohol, `${t} is tagged alcohol`);
    assert.equal(check(pregnant, t).verdict, 'pass', t);
  }
  assert.equal(check(pregnant, 'water, red wine vinegar, extra virgin olive oil, salt').verdict, 'pass', 'a dressing label');
  for (const t of ['wine vinegar', 'sherry vinegar', 'rice wine vinegar']) assert.equal(check(pregnant, t).verdict, 'pass', `${t}, as before`);
});

test('N1: the drinks themselves are still a hard stop in pregnancy, including beside a vinegar', () => {
  for (const t of ['red wine', 'white wine', 'champagne', 'sparkling wine', 'prosecco', 'cava', 'port wine', 'wine', 'sherry', 'beer', 'red wine and red wine vinegar', 'white wine vinegar and white wine']) {
    const r = check(pregnant, t);
    assert.equal(r.verdict, 'fail', t);
    assert.ok(r.hits.some(h => h.tag === 'alcohol' && h.hard), t);
  }
});

test('N1: a wine vinegar is no longer an alcohol caution for high blood pressure', () => {
  for (const t of ['red wine vinegar', 'white wine vinegar', 'champagne vinegar']) assert.equal(check(htn, t).verdict, 'pass', t);
  assert.equal(check(htn, 'red wine').verdict, 'caution', 'the drink still is');
});

test('N1: every wine vinegar stays left out on a low histamine plan, and beer and malt vinegar keep their gluten', () => {
  for (const t of WINE_VINEGARS) {
    const r = check(mcas, t);
    assert.notEqual(r.verdict, 'pass', t);
    assert.ok(r.hits.some(h => h.tag === 'histamine-fermented'), `${t} keeps the fermented tag`);
  }
  for (const t of ['malt vinegar', 'beer vinegar']) assert.notEqual(check(celiac, t).verdict, 'pass', t);
});
