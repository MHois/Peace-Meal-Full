// P0-1 (audit of September 30, 2026): a misspelled or badly scanned allergen word next to a word the app knows passed
// ("penut butter" for a peanut allergy), because a piece of the ingredient list counted as "not recognized" only when
// nothing in it matched. README rule 7: text the app cannot place is never a pass while anything is restricted.
// Every person here is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMatcher, isNoiseOnly } from '../src/engine/dictionary.js';
import { buildPlan } from '../src/engine/plan.js';
import { checkText } from '../src/engine/checker.js';

const J = f => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const conditions = J('conditions.json').modules;
const dictionaries = J('dictionaries.json');
const matcher = buildMatcher(dictionaries);
matcher.dietLists = J('diet-lists.json');
const person = extra => ({ id: 't', name: 'Test Person', adult: true, age: 45, sex: 'female', modules: [], allergens: [], allergens_other: [], preferences: { avoid_tags: [], avoid_terms: [], patterns: [] }, medications: {}, tier2: {}, phases: {}, ...extra });
const PEOPLE = {
  milk: person({ allergens: ['allergen-milk'] }), crustacean: person({ allergens: ['allergen-crustacean'] }), 'tree-nut': person({ allergens: ['allergen-tree-nut'] }),
  peanut: person({ allergens: ['allergen-peanut'] }), soy: person({ allergens: ['allergen-soy'] }), sesame: person({ allergens: ['allergen-sesame'] }),
  celiac: person({ modules: ['celiac'] }), hypertension: person({ modules: ['hypertension'] }), ibs: person({ modules: ['ibs-low-fodmap'] }), mcas: person({ modules: ['mcas'] })
};
const plans = Object.fromEntries(Object.entries(PEOPLE).map(([k, p]) => [k, buildPlan({ person: p, conditions, dictionaries, today: new Date('2026-09-30') })]));
const check = (who, text) => checkText(text, plans[who], matcher, PEOPLE[who]);

// The 25 typo, scanning-error, and masked lines from the audit corpus (audit/corpus/allergen-labels.json) that passed.
const LINES = [
  ['crustacean', 'craw fish'], ['peanut', 'penut butter'], ['peanut', 'pea nut'], ['sesame', 'sesami seeds'],
  ['peanut', 'pean ut butter'], ['peanut', 'pea nuts'], ['peanut', 'salt, pea nut, sugar'], ['soy', 's0y protein isolate'], ['soy', 'so y lecithin'], ['sesame', 'sesarne seeds'],
  ['milk', 'sugar, rnilk chocolate'], ['milk', 'sweetened condensed rni1k'], ['tree-nut', 'almnd milk'], ['tree-nut', 'cashw butter'], ['tree-nut', 'alrnond butter'],
  ['tree-nut', 'sugar, a1mond flour'], ['peanut', 'penut butter'], ['peanut', 'pean ut butter'], ['peanut', 'sugar, penut flour'], ['soy', 's0y protein isolate, sugar'],
  ['soy', 'sugar, s0y lecithin'], ['soy', 'organic s0y milk'], ['sesame', 'sugar, sesme seeds'], ['sesame', 'roasted sesarne seeds, salt'], ['celiac', 'ma1t vinegar, salt']
];

test('P0-1: the 25 misspelled, badly scanned, and masked allergen lines are never a PASS for that allergy', () => {
  assert.equal(LINES.length, 25);
  const passed = LINES.filter(([who, text]) => check(who, text).verdict === 'pass').map(([who, text]) => `[${who}] ${text}`);
  assert.deepEqual(passed, []);
});

test('P0-1: the unknown word is named, with the piece it sits in', () => {
  const r = check('peanut', 'penut butter');
  assert.equal(r.verdict, 'caution');
  assert.deepEqual(r.unrecognized, ['penut butter']);
  assert.deepEqual(r.unplaced, [{ segment: 'penut butter', words: ['penut'] }]);
  const r2 = check('milk', 'sugar, rnilk chocolate');
  assert.deepEqual(r2.unplaced, [{ segment: 'rnilk chocolate', words: ['rnilk'] }]);
});

// A made-up word: 3 to 9 letters that the dictionary does not know on its own. Seeded, so every run draws the same words.
function madeUpWords(n, seed) {
  const out = [];
  let s = seed;
  const rnd = k => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s % k; };
  while (out.length < n) {
    const len = 3 + rnd(7);
    let w = '';
    for (let i = 0; i < len; i++) w += String.fromCharCode(97 + rnd(26));
    const r = matcher.tagText(w);
    if (r.unrecognized.length === 1 && !Object.keys(r.tags).length && !isNoiseOnly(w) && !matcher.isDescriptor(w)) out.push(w);
  }
  return out;
}
const KNOWN = ['sugar', 'salt', 'water', 'rice', 'corn starch', 'apple', 'carrot', 'onion', 'garlic', 'olive oil', 'vinegar', 'chicken', 'potato', 'tomato', 'lemon juice', 'honey', 'seeds', 'flakes', 'powder', 'chocolate', 'oil'];

test('P0-1: a made-up word next to a known word is never a PASS while anything is restricted (1,000 seeded draws)', () => {
  const words = madeUpWords(1000, 20260930);
  const who = Object.keys(PEOPLE);
  const bad = [];
  words.forEach((w, i) => {
    const known = KNOWN[i % KNOWN.length];
    const text = i % 2 ? `${w} ${known}` : `${known} ${w}`;
    const p = who[i % who.length];
    if (check(p, text).verdict === 'pass') bad.push(`[${p}] ${text}`);
  });
  assert.deepEqual(bad.slice(0, 10), [], `${bad.length} of 1000 passed`);
});

// Found while fixing P0-1: only the first place a term appeared in a piece was judged, so when that place sat inside an
// exception ("butter" inside "peanut butter"), a second, plain "butter" in the same piece was never seen.
test('P0-1: a term that appears twice in one piece is seen both times', () => {
  for (const text of ['peanut butter and butter', 'almond milk with milk', 'peanut butter with butter and sugar']) {
    assert.ok(matcher.tagText(text).tags['allergen-milk'], text + ' carries milk');
    assert.equal(check('milk', text).verdict, 'fail', text);
  }
  assert.deepEqual(matcher.tagText('garlic powder or minced garlic to taste').unrecognized, [], 'the second garlic is placed too');
  // an unknown-kind term stays unknown when only one of its places is settled by a longer term
  assert.ok(matcher.tagText('corn tortilla and tortilla').unknownRisk.some(u => u.term === 'tortilla'));
  assert.ok(!matcher.tagText('corn tortilla').unknownRisk.some(u => u.term === 'tortilla'));
});

test('P0-1: words the app knows, with amounts and preparation words around them, still pass', () => {
  for (const text of ['2 boneless skinless chicken breasts', '1 cup cooked rice', '2 tablespoons olive oil', 'sugar, salt, water', '1 large onion, finely chopped']) {
    const r = check('peanut', text);
    assert.equal(r.verdict, 'pass', text);
    assert.deepEqual(r.unrecognized, [], text);
  }
  // A word the app knows next to another word it knows: both placed, so nothing is reported.
  assert.deepEqual(matcher.tagText('peanut butter').unrecognized, []);
  assert.equal(check('milk', 'peanut butter').verdict, 'pass');
});
