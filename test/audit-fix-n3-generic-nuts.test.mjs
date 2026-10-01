// N3 (found during the fix pass of September 30, 2026; not in the audit report): "nuts", "chopped nuts", "nut pieces",
// "nut meat", and "nut meal" passed for a peanut allergy. The dictionary's plain "nut" said the kind is unknown but marked
// only tree nuts. FARE's peanut page lists, under "Foods to avoid containing peanuts": "Artificial nuts", "Lupin (or
// lupine)", "Mixed nuts", "Nut meat or nut meal", "Nut pieces" (read September 30, 2026; docs/VERIFY-log.md, F11).
// A nut of unknown kind is now a peanut label check, as "nut butter" already was; a named nut is judged as that nut;
// artificial nuts and lupin are a stop for a peanut allergy. Every person here is made up.
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
const check = (t, p) => checkText(t, buildPlan({ person: p, conditions, dictionaries, today: new Date('2026-09-30') }), matcher, p);
const peanut = person({ allergens: ['allergen-peanut'] }), treeNut = person({ allergens: ['allergen-tree-nut'] });

test('N3: a nut of unknown kind is a peanut label check', () => {
  for (const t of ['nuts', 'chopped nuts', '1/2 cup chopped nuts', 'nut pieces', 'nut meat', 'nut meal', 'nutmeat', 'whole nuts']) {
    const r = check(t, peanut);
    assert.equal(r.verdict, 'caution', t);
    assert.ok((r.verifyLabel || []).some(v => v.tag === 'allergen-peanut'), `${t}: check the label for peanut`);
  }
});

test('N3: FARE\'s artificial nuts and lupin are a stop for a peanut allergy', () => {
  for (const t of ['artificial nuts', 'lupin flour', 'lupine']) assert.equal(check(t, peanut).verdict, 'fail', t);
});

test('N3: a named nut is judged as that nut, with no peanut check', () => {
  for (const t of ['walnuts', 'pine nuts', 'brazil nuts', 'cashew nuts', 'macadamia nuts', 'pecan nuts', 'hazel nuts', 'pistachio nuts', 'almonds', 'coconut', 'nutmeg', 'chestnuts', 'water chestnuts', 'butternut squash', 'doughnuts']) {
    assert.equal(check(t, peanut).verdict, 'pass', t);
  }
  for (const t of ['nuts', 'cashew nuts', 'pine nuts', 'tree nuts', 'Contains: Tree Nuts (Cashew, Pecan).', 'hickory nuts', '2 tbsp butter and hickory nuts']) assert.equal(check(t, treeNut).verdict, 'fail', `${t}: still a tree nut stop`);
  for (const t of ['tree nuts', 'Contains: Tree Nuts (Cashew, Pecan).', 'soy nuts']) assert.equal(check(t, peanut).verdict, 'pass', `${t}: names the kind, so no peanut check`);
  for (const t of ['peanuts', 'mixed nuts', 'beer nuts', 'monkey nuts']) assert.equal(check(t, peanut).verdict, 'fail', `${t}: still a peanut stop`);
});
