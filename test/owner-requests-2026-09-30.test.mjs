// The owner's requests of September 30, 2026, after the site went live: other allergies as hard stops, foods findable
// when logging a meal, every VERIFY flag checked and cleared, and the Mediterranean diet named as the anti-inflammatory one.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildMatcher } from '../src/engine/dictionary.js';
import { buildPlan } from '../src/engine/plan.js';
import { checkText, checkRecipe, checkFood, otherAllergies, matchOtherAllergies } from '../src/engine/checker.js';
import { seatingPerson } from '../src/engine/household.js';
import { exportPersonForSharing } from '../src/engine/group.js';
import { searchGroupMatches, searchRank } from '../src/engine/search.js';

const J = f => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const conditions = J('conditions.json').modules, dictionaries = J('dictionaries.json'), lists = J('diet-lists.json'), articles = J('articles.json');
const sources = J('sources.json'), foods = J('foods.json');
const sourceList = Array.isArray(sources) ? sources : (sources.sources || Object.entries(sources).map(([id, x]) => ({ id, ...x })));
const foodsById = new Map(foods.map(f => [f.id, f]));
const matcher = buildMatcher(dictionaries); matcher.dietLists = lists;
const tester = (extra = {}) => ({ id: 't1', name: 'Test Person', adult: true, age: 50, sex: 'male', modules: [], allergens: [], allergens_other: [], preferences: { avoid_tags: [], avoid_terms: [], patterns: [] }, medications: {}, tier2: {}, phases: {}, ...extra });
const planFor = p => buildPlan({ person: p, conditions, dictionaries, today: new Date('2026-09-30') });

// ---------------------------------------------------------------- other allergies
test('other allergies: a food outside the nine is a hard stop on labels, foods, and recipes', () => {
  const p = tester({ allergens_other: ['Kiwi', ' mustard '] });
  const plan = planFor(p);
  assert.deepEqual(otherAllergies(p), ['kiwi', 'mustard']);
  const label = checkText('apple juice, kiwifruit puree, sugar', plan, matcher, p);
  assert.equal(label.verdict, 'fail');
  assert.ok(label.termHits.some(t => t.term === 'kiwi' && t.hard && t.allergy));
  assert.equal(checkText('water, Dijon mustard, vinegar', plan, matcher, p).verdict, 'fail');
  const kiwiFood = foods.find(f => /kiwi/i.test(f.name));
  assert.ok(kiwiFood, 'the food table has a kiwi');
  assert.equal(checkFood(kiwiFood, plan, matcher, p).verdict, 'fail');
  const recipe = { id: 'r-test', name: 'Fruit cup', servings: 2, ingredients: [{ display: '2 kiwis, peeled and sliced' }, { display: '1 cup blueberries' }] };
  assert.equal(checkRecipe(recipe, plan, matcher, foodsById, p).verdict, 'fail');
  // The same recipe without the allergy on file is not a fail.
  assert.notEqual(checkRecipe(recipe, planFor(tester()), matcher, foodsById, tester()).verdict, 'fail');
});

test('other allergies: a linked food with no display text is still checked by its name', () => {
  const kiwiFood = foods.find(f => /kiwi/i.test(f.name));
  const p = tester({ allergens_other: ['kiwi'] });
  const recipe = { id: 'r-linked', name: 'Snack plate', servings: 1, ingredients: [{ food: kiwiFood.id, grams: 70 }] };
  assert.equal(checkRecipe(recipe, planFor(p), matcher, foodsById, p).verdict, 'fail');
});

test('other allergies: words that can hide an allergen become a caution, as they do for the nine', () => {
  const none = tester(), withOther = tester({ allergens_other: ['mustard'] });
  assert.equal(checkText('water, salt, spices', planFor(none), matcher, none).verdict, 'pass');
  assert.equal(checkText('water, salt, spices', planFor(withOther), matcher, withOther).verdict, 'caution');
});

test('other allergies: short words must start a word ("oat" is not in "goat"); longer ones match anywhere', () => {
  const p = tester({ allergens_other: ['oat', 'corn'] });
  assert.deepEqual(matchOtherAllergies('goat cheese', p), []);
  assert.deepEqual(matchOtherAllergies('rolled oats', p).map(t => t.term), ['oat']);
  assert.deepEqual(matchOtherAllergies('popcorn', p).map(t => t.term), ['corn']);
  assert.deepEqual(matchOtherAllergies('x', tester({ allergens_other: ['x'] })), [], 'one letter is ignored');
});

test('other allergies: the plan brings in the food-allergies module and lists them; the promise in its rule is kept', () => {
  const plan = planFor(tester({ allergens_other: ['kiwi'] }));
  assert.ok(plan.modules.some(m => m.id === 'food-allergies'));
  assert.deepEqual(plan.otherAllergies, ['kiwi']);
  const rule = conditions.find(m => m.id === 'food-allergies').rules.find(r => r.id === 'allergen-custom');
  assert.match(rule.text, /beyond the nine FDA major allergens are also hard exclusions/);
});

test('other allergies: shared meals and shared profiles keep them', () => {
  const a = tester({ id: 'a', allergens_other: ['kiwi'] }), b = tester({ id: 'b', allergens_other: ['mustard'] });
  assert.deepEqual(seatingPerson([a, b], a).allergens_other.sort(), ['kiwi', 'mustard']);
  assert.deepEqual(exportPersonForSharing(a).allergens_other, ['kiwi']);
});

// ---------------------------------------------------------------- logging a meal
test('meal search: a common word still shows plain foods, closest first, beside the recipes', () => {
  const recipes = [...J('recipes.json'), ...J('recipes-open.json')];
  for (const word of ['banana', 'apple', 'rice', 'egg', 'chicken']) {
    const items = [
      ...recipes.filter(r => r.name.toLowerCase().includes(word)).map(r => ({ kind: 'recipe', name: r.name, fav: false })),
      ...foods.filter(f => (f.name + ' ' + (f.short || '')).toLowerCase().includes(word)).map(f => ({ kind: 'food', name: f.short || f.name, fav: false }))
    ];
    const g = searchGroupMatches(items, [word]);
    assert.ok(g.foods.length > 0, `${word}: foods are shown`);
    assert.ok(g.recipes.length <= 25 && g.foods.length <= 15);
  }
  assert.ok(searchRank('Banana', ['banana']) < searchRank('Banana bread', ['banana']));
  assert.ok(searchRank('Banana bread', ['banana']) < searchRank('Peanut butter banana toast', ['banana']));
  const fav = searchGroupMatches([{ kind: 'food', name: 'Zucchini', fav: false }, { kind: 'food', name: 'Zucchini bread mix', fav: true }], ['zucchini']);
  assert.equal(fav.foods[0].name, 'Zucchini bread mix', 'favorites first');
});

test('meal search: picking a result opens the amount sheet without closing it again', () => {
  // Closing the search sheet first queued a history.back() that closed the amount sheet as soon as it opened.
  const today = fs.readFileSync(new URL('../src/ui/today.js', import.meta.url), 'utf8');
  const handler = today.split('\n').find(l => l.includes("querySelectorAll('[data-pick]')"));
  assert.ok(handler, 'the pick handler is there');
  assert.doesNotMatch(handler, /\.close\(\)/);
  assert.match(handler, /todayAmountModal\(/);
});

// ---------------------------------------------------------------- VERIFY flags
test('VERIFY: no source or article reference carries a flag, and no article text says (VERIFY)', () => {
  assert.deepEqual(sourceList.filter(s => s.verify).map(s => s.id), []);
  const flagged = Object.entries(articles).flatMap(([k, a]) => (a.references || []).filter(r => r.verify).map(r => k + ':' + r.id));
  assert.deepEqual(flagged, []);
  assert.doesNotMatch(JSON.stringify(articles), /\(VERIFY\)/);
});

test('VERIFY: the four confirmed citations carry their issue numbers (A35)', () => {
  const cite = id => sourceList.find(s => s.id === id).citation;
  assert.match(cite('acr-ra-integrative-2022'), /Arthritis Care Res 2023;75\(8\):1603-1615/);
  assert.match(cite('eular-lifestyle-rmd-2021'), /Ann Rheum Dis 2023;82\(1\):48-56/);
  assert.match(cite('tre-jamshed-2022'), /JAMA Intern Med 2022;182\(9\):953-962/);
  assert.match(cite('gearry-kiwifruit-2023'), /Am J Gastroenterol 2023;118\(6\):1058-1068/);
  const ref = articles.constipation.references.find(r => r.id === 'gearry-kiwifruit-2023');
  assert.match(ref.citation, /1058-1068/);
});

test('VERIFY: the app no longer asks readers to check sources themselves', () => {
  const plan = fs.readFileSync(new URL('../src/ui/plan.js', import.meta.url), 'utf8');
  const learn = fs.readFileSync(new URL('../src/ui/learn.js', import.meta.url), 'utf8');
  assert.doesNotMatch(plan, /should be checked before the number is trusted/);
  assert.match(learn, /not by you/);
});

// ---------------------------------------------------------------- Mediterranean
test('the Mediterranean diet is named as the anti-inflammatory diet and search finds it either way', () => {
  const m = conditions.find(x => x.id === 'anti-inflammatory-mediterranean');
  assert.equal(m.name, 'Mediterranean diet (anti-inflammatory)');
  const hay = (m.name + ' ' + (m.aliases || []).join(' ')).toLowerCase();
  assert.ok(hay.includes('anti-inflammatory diet') && hay.includes('mediterranean diet'));
  assert.equal(articles['anti-inflammatory-mediterranean'].title, 'Mediterranean diet (anti-inflammatory)');
});

// ---------------------------------------------------------------- logging part of a recipe
test('recipe parts: a part written only as text is searched by its food words, never turned into numbers', () => {
  const today = fs.readFileSync(new URL('../src/ui/today.js', import.meta.url), 'utf8');
  const body = today.match(/export function todayPartQuery\(text\) \{[\s\S]*?\n\}/)[0].replace('export ', '');
  const todayPartQuery = new Function(body + '; return todayPartQuery;')();
  assert.equal(todayPartQuery('1 ½ cups (360 ml) blueberries, fresh'), 'blueberry');
  assert.equal(todayPartQuery('2 kiwis, peeled and sliced'), 'kiwi');
  assert.equal(todayPartQuery('200g porridge oats'), 'porridge oat');
  assert.equal(todayPartQuery('3 medium tomatoes'), 'tomato');
  assert.equal(todayPartQuery('1 cup asparagus'), 'asparagus');
  // A linked part is logged as its own food with grams scaled by servings eaten over servings made.
  assert.match(today, /Number\(ing\.grams\) \* share/);
  assert.match(today, /kind: 'food', ref: ing\.food, amount: grams, unit: 'g', grams/);
});

test('history: Today and lite Today have buttons for the weight history and the food and symptom history', () => {
  const today = fs.readFileSync(new URL('../src/ui/today.js', import.meta.url), 'utf8');
  const lite = fs.readFileSync(new URL('../src/ui/lite.js', import.meta.url), 'utf8');
  for (const src of [today, lite]) {
    assert.match(src, /data-weight-history/);
    assert.match(src, /data-food-history/);
  }
  assert.match(lite, /todayBindHistoryButtons\(root, person\)/);
});
