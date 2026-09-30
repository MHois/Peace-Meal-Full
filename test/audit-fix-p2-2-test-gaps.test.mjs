// P2-2 (audit of September 30, 2026): places where a planted bug went unnoticed by every test (Stryker, phase 3, item
// 15), and README safety rules with no protecting test (phase 8, item 35). One test for each. Every person is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { buildMatcher } from '../src/engine/dictionary.js';
import { buildPlan } from '../src/engine/plan.js';
import { checkText, checkRecipe, planRestricts } from '../src/engine/checker.js';
import { approvedFor, strictCheckText, strictFamiliesFor } from '../src/engine/dietlists.js';

const J = f => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const conditions = J('conditions.json').modules, dictionaries = J('dictionaries.json'), lists = J('diet-lists.json');
const foodsById = new Map(J('foods.json').map(f => [f.id, f]));
const matcher = buildMatcher(dictionaries);
matcher.dietLists = lists;
const person = extra => ({ id: 't', name: 'Test Person', adult: true, age: 50, sex: 'female', modules: [], allergens: [], allergens_other: [], preferences: { avoid_tags: [], avoid_terms: [], patterns: [] }, medications: {}, tier2: {}, phases: {}, rule_settings: {}, ...extra });
const planOf = p => buildPlan({ person: p, conditions, dictionaries, today: new Date('2026-09-30') });

// 1 and 2 (checker.js:26, 31-32): README rule 7 for a person whose only restriction is a daily limit, and for a person
// whose only allergy is one they typed in.
test('P2-2: an unknown word is a caution for a person with only a daily limit, or only a typed-in allergy', () => {
  // Heart failure is the one module whose plan has a daily limit (sodium) and no avoid rules.
  const hf = person({ modules: ['heart-failure'] }), kiwi = person({ allergens_other: ['kiwi'] });
  assert.deepEqual(Object.keys(planOf(hf).avoid), [], 'a limit-only plan');
  for (const p of [hf, kiwi]) {
    const plan = planOf(p);
    assert.equal(planRestricts(plan, p), true);
    const r = checkText('xqzt blorp', plan, matcher, p);
    assert.equal(r.verdict, 'caution');
    assert.deepEqual(r.unrecognized, ['xqzt blorp']);
  }
  assert.equal(checkText('xqzt blorp', planOf(person({})), matcher, person({})).verdict, 'pass', 'nothing restricted: the word is reported, not flagged');
});

// The same gate on its own: each kind of restriction counts by itself (a real plan often has more than one kind).
test('P2-2: each kind of restriction on its own makes unknown words a caution', () => {
  const none = { avoid: {}, limits: {} };
  assert.equal(planRestricts(none, {}), false);
  assert.equal(planRestricts(none, { allergens_other: ['kiwi'] }), true, 'a typed-in allergy');
  assert.equal(planRestricts(none, { allergens: ['allergen-peanut'] }), true, 'one of the nine');
  assert.equal(planRestricts({ avoid: {}, limits: { sodium_mg: { value: 2300 } } }, {}), true, 'a daily limit');
  assert.equal(planRestricts({ avoid: {}, limits: {}, periodic: { meal: { limits: { carb_g: { value: 45 } } } } }, {}), true, 'a per-meal limit');
  assert.equal(planRestricts({ avoid: { 'red-meat': { hard: false, rules: [{ preference: true }] } }, limits: {} }, {}), false, 'a personal preference alone does not');
});

// 3 (checker.js:136-139): rule 7 for recipes.
test('P2-2: a recipe with a line the app cannot read, or a term that can hide something, is not a pass', () => {
  const celiac = person({ modules: ['celiac'] }), peanut = person({ allergens: ['allergen-peanut'] });
  const unreadable = { id: 't1', name: 'Test', servings: 1, ingredients: [{ display: 'xqzt blorp' }] };
  const noLink = { id: 't2', name: 'Test', servings: 1, ingredients: [{ food: 'no-such-food' }] };
  const hidden = { id: 't3', name: 'Test', servings: 1, ingredients: [{ display: 'natural flavors' }] };
  let r = checkRecipe(unreadable, planOf(celiac), matcher, foodsById, celiac);
  assert.equal(r.verdict, 'caution'); assert.deepEqual(r.unrecognized, ['xqzt blorp']);
  r = checkRecipe(noLink, planOf(celiac), matcher, foodsById, celiac);
  assert.equal(r.verdict, 'caution'); assert.deepEqual(r.unrecognized, ['no-such-food']);
  r = checkRecipe(hidden, planOf(peanut), matcher, foodsById, peanut);
  assert.equal(r.verdict, 'caution'); assert.ok(r.unknownRisk.length);
});

// 4 and 5 (checker.js:155-156, 164): a FAIL is never softened by a limit, and the per-serving figures are right.
test('P2-2: a recipe that fails for an allergy and is over a limit stays a fail; its limit figures are right', () => {
  const p = person({ allergens: ['allergen-peanut'], modules: ['hypertension'] }), plan = planOf(p);
  const salty = { id: 't4', name: 'Test', servings: 1, ingredients: [{ food: 'fdc-746775', grams: 10 }] };
  const both = { id: 't5', name: 'Test', servings: 1, ingredients: [{ food: 'fdc-746775', grams: 10 }, { food: 'fdc-172430', grams: 30 }] };
  let r = checkRecipe(salty, plan, matcher, foodsById, p);
  const na = r.vsLimits.find(v => v.nutrient === 'sodium_mg');
  assert.equal(na.perServing, 3870, '10 g of salt at 38,700 mg per 100 g');
  assert.equal(na.pctOfDaily, Math.round(3870 / 2300 * 100));
  assert.equal(na.exceedsInOneServing, true);
  assert.equal(na.missingData, false);
  assert.equal(r.verdict, 'caution');
  r = checkRecipe(both, plan, matcher, foodsById, p);
  assert.equal(r.exceeds.length, 1);
  assert.equal(r.verdict, 'fail', 'peanuts stay a hard stop');
});

// 6 (checker.js:104): the person's own avoid words flag only the labels that have them.
test('P2-2: a personal avoid word flags a label that has it, and only that label', () => {
  const p = person({ preferences: { avoid_tags: [], avoid_terms: ['cilantro'], patterns: [] } }), plan = planOf(p);
  const r = checkText('cilantro, lime juice', plan, matcher, p);
  assert.equal(r.verdict, 'caution');
  assert.deepEqual(r.termHits.map(t => t.term), ['cilantro']);
  assert.equal(checkText('parsley, lime juice', plan, matcher, p).verdict, 'pass');
});

// 7 (dietlists.js:111): a personal "tolerated" food counts only for itself.
test('P2-2: a tolerated food is approved for that person; other foods are not', () => {
  const p = person({ modules: ['ibs-low-fodmap'], diet_lists: { 'low-fodmap': { tolerated: [{ term: 'garlic' }], reacts: [] } } });
  const g = approvedFor('garlic', 'low-fodmap', lists, p);
  assert.equal(g.approved, true); assert.equal(g.why, 'tolerated');
  assert.equal(approvedFor('onion', 'low-fodmap', lists, p).approved, false);
  assert.equal(approvedFor('garlic', 'low-fodmap', lists, person({ modules: ['ibs-low-fodmap'] })).approved, false, 'not for someone else');
});

// 8 (dietlists.js:62): switching strict mode off for one diet leaves it on for the others.
test('P2-2: strict mode switched off for low FODMAP stays on for low histamine', () => {
  const both = { modules: ['ibs-low-fodmap', 'mcas'] };
  const plan = planOf(person(both));
  assert.deepEqual(strictFamiliesFor(plan, lists).sort(), ['low-fodmap', 'low-histamine']);
  const word = ['onion', 'garlic', 'mushroom', 'avocado', 'tomato', 'spinach', 'kidney beans', 'cashews', 'apple', 'pear', 'mango', 'cauliflower']
    .find(w => !approvedFor(w, 'low-fodmap', lists, {}).approved && !approvedFor(w, 'low-histamine', lists, {}).approved);
  assert.ok(word, 'a food on neither list');
  const fams = p => [...new Set(strictCheckText([word], plan, lists, p).notApproved.map(n => n.family))].sort();
  assert.deepEqual(fams(person(both)), ['low-fodmap', 'low-histamine']);
  assert.deepEqual(fams(person({ ...both, strict_diets: { 'low-fodmap': false } })), ['low-histamine']);
});

// 9 (checker.js:86): a typed-in allergy with brackets matches as written and never stops the check.
test('P2-2: a typed-in allergy with brackets matches as written and never throws', () => {
  const p = person({ allergens_other: ['kiwi (gold)', 'lupin ('] }), plan = planOf(p);
  assert.equal(checkText('gold kiwi (gold), sugar', plan, matcher, p).verdict, 'fail');
  assert.equal(checkText('lupin (flour), water', plan, matcher, p).verdict, 'fail');
  assert.doesNotThrow(() => checkText('sugar, water', plan, matcher, p));
});

// README rule 8: "There is no language model in the app." The built pages ask the network for the four pinned
// photo-reader files and nothing else; every other address in their code is a link or a licence notice.
test('README rule 8: the built pages request nothing but the pinned photo-reader files, and call no language model', () => {
  const root = new URL('../', import.meta.url);
  const READER = [
    'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/tesseract.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/worker.min.js',
    'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-lstm.wasm.js',
    'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-simd-lstm.wasm.js',
    'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz'
  ];
  // Shown as links or quoted as text, never requested: licence notices, recipe sources, and a reference list.
  const LINKS = [
    'https://github.com/undercasetype/Fraunces', 'http://scripts.sil.org/OFL', 'https://www.histaminintoleranz.ch/en/downloads.html',
    'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/', 'https://creativecommons.org/licenses/by-sa/4.0/',
    'https://www.nhs.uk/healthier-families/recipes/', 'https://en.wikibooks.org/wiki/Cookbook:Table_of_Contents', 'https://en.wikibooks.org/w/api.php',
    'https://en.wikibooks.org/wiki/Cookbook:20-Minute_Beef_Stroganoff', 'https://www.parentclub.scot/recipes',
    'https://www.nhlbi.nih.gov/health/heart-healthy-living/healthy-foods/healthy-eating-recipes', 'https://department.va.gov/copyright-policy/',
    'https://www.nutrition.va.gov/NUTRITION/Recipes.asp'
  ];
  for (const args of [[], ['--lite']]) {
    execFileSync(process.execPath, ['tools/bundle.mjs', ...args], { cwd: root, stdio: 'ignore' });
    const page = fs.readFileSync(new URL(args.length ? 'dist/peace-meal-lite.html' : 'dist/nutrition-app.html', root), 'utf8');
    assert.doesNotMatch(page, /api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis\.com|api\.cohere\.|api\.mistral\.ai|api-inference\.huggingface/i, 'no language-model service anywhere in the page');
    // The code: the page without its data (citations carry many links, and data never runs).
    const code = page.replace(/<script>[^<]*window\.__APP_DATA__ = [\s\S]*?<\/script>/, '').replace(/<script type="application\/json"[\s\S]*?<\/script>/g, '');
    assert.ok(code.length < page.length / 2, 'the data was taken out');
    const found = [...new Set([...code.matchAll(/https?:\/\/[^\s"'`<>)\\]+/g)].map(m => m[0]))];
    const unknown = found.filter(u => !READER.some(r => r.startsWith(u) || u.startsWith(r)) && !LINKS.includes(u));
    assert.deepEqual(unknown, [], 'a new address in the code: is it a link, or a request? Rule 8 allows no new request.');
    assert.doesNotMatch(code, /XMLHttpRequest|sendBeacon|new WebSocket|new EventSource|importScripts\(/, 'no other way to reach the network');
  }
});
