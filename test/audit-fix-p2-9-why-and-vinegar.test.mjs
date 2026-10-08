// P2-9 (audit of September 30, 2026): two claims in the September summary did not hold.
// P7b: "A plain-words 'why' under every number on the Plan, taken word for word from each condition's own article." The
// two fish numbers had no why, and four whys were reworded (they were in the module's short education text, not its
// article). Each number now carries a sentence copied from its own article; no number, rule, or source changed.
// Q9c: distilled white and apple cider vinegar are on the low histamine approved list (VERIFY-log A20, SIGHI leaflet:
// "spirit vinegar = distilled white vinegar, apple cider vinegar" well tolerated), yet a label naming them was still a
// caution, because the dictionary's plain "vinegar" fired inside every vinegar name. The food box said the same about
// USDA's "Vinegar, distilled" and "Vinegar, cider". Other vinegars stay left out. Every person here is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMatcher } from '../src/engine/dictionary.js';
import { buildPlan } from '../src/engine/plan.js';
import { checkText, checkFood, checkRecipe, indexFoodNames } from '../src/engine/checker.js';

const J = f => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const conditions = J('conditions.json').modules, dictionaries = J('dictionaries.json'), articles = J('articles.json');
const foods = J('foods.json');
const foodsById = new Map(foods.map(f => [f.id, f]));
const matcher = buildMatcher(dictionaries);
matcher.dietLists = J('diet-lists.json');
matcher.foodNames = indexFoodNames(foods);
const person = extra => ({ id: 't', name: 'Test Person', adult: true, age: 58, sex: 'female', modules: [], allergens: [], allergens_other: [], preferences: { avoid_tags: [], avoid_terms: [], patterns: [] }, medications: {}, tier2: {}, phases: {}, rule_settings: {}, ...extra });
const planOf = p => buildPlan({ person: p, conditions, dictionaries, today: new Date('2026-09-30') });
const mcas = person({ modules: ['mcas'] }), mcasPlan = planOf(mcas);
const fodmap = person({ modules: ['ibs-low-fodmap'] }), fodmapPlan = planOf(fodmap);
const label = t => checkText(t, mcasPlan, matcher, mcas);

// One paragraph of the article: a summary line or a section paragraph. The validator joins these with line breaks, so a
// why must sit inside one of them.
const paragraphs = id => { const a = articles[id] || {}; return [...(a.summary || []), ...(a.sections || []).flatMap(s => s.paragraphs || [])].map(p => p.replace(/\s+/g, ' ')); };

test('P2-9 (P7b): every number on the Plan has a plain-words why copied word for word from its own article', () => {
  const missing = [];
  for (const m of conditions) for (const r of m.rules || []) {
    if (!((r.kind === 'limit' || r.kind === 'target') && typeof (r.value ?? r.min ?? r.max) === 'number')) continue;
    if (!r.why) { missing.push(`${m.id}:${r.id} has no why`); continue; }
    const why = r.why.replace(/\s+/g, ' ').trim();
    if (!paragraphs(m.id).some(p => p.includes(why))) missing.push(`${m.id}:${r.id} why is not in one paragraph of the article`);
  }
  assert.deepEqual(missing, []);
});

test('P2-9 (P7b): the two fish numbers explain themselves; the numbers did not change', () => {
  const rule = (m, id) => conditions.find(x => x.id === m).rules.find(r => r.id === id);
  const med = rule('anti-inflammatory-mediterranean', 'med-fish'), preg = rule('pregnancy-gdm-breastfeeding', 'preg-fish');
  assert.match(med.why || '', /fish/i);
  assert.match(preg.why || '', /mercury/i);
  assert.equal(med.value, 2); assert.equal(med.per, 'week');
  assert.equal(preg.min, 8); assert.equal(preg.max, 12); assert.equal(preg.unit, 'oz');
});

const APPROVED = ['distilled white vinegar', 'white vinegar', 'distilled vinegar', 'spirit vinegar', 'apple cider vinegar', 'cider vinegar'];

test('P2-9 (Q9c): a label naming one of the six approved vinegars passes on a low histamine plan', () => {
  for (const t of APPROVED) assert.equal(label(t).verdict, 'pass', t);
  assert.equal(label('water, distilled white vinegar, salt').verdict, 'pass', 'inside a longer label');
  assert.equal(label('2 tbsp apple cider vinegar').verdict, 'pass', 'with an amount');
});

test('P2-9 (Q9c): every other vinegar, and vinegar with no kind named, stays left out', () => {
  for (const t of ['vinegar', 'wine vinegar', 'red wine vinegar', 'white wine vinegar', 'balsamic vinegar', 'rice vinegar', 'rice wine vinegar', 'malt vinegar', 'sherry vinegar', 'pickled cucumbers', 'white vinegar and wine vinegar', 'balsamic vinegar and white vinegar']) {
    assert.notEqual(label(t).verdict, 'pass', t);
  }
  assert.ok(label('wine vinegar').hits.some(h => h.tag === 'histamine-fermented'), 'plain vinegar words keep the fermented tag');
  assert.ok(label('white vinegar and wine vinegar').hits.some(h => h.tag === 'histamine-fermented'), 'a second, unnamed vinegar in the same piece is still seen');
});

test('P2-9 (Q9c): the food box agrees for USDA\'s two approved vinegars, and not for the others', () => {
  const food = id => checkFood(foodsById.get(id), mcasPlan, matcher, mcas);
  assert.equal(food('fdc-172237').verdict, 'pass', 'Vinegar, distilled');
  assert.equal(food('fdc-173469').verdict, 'pass', 'Vinegar, cider');
  assert.notEqual(food('fdc-172240').verdict, 'pass', 'Vinegar, red wine');
  assert.notEqual(food('fdc-172241').verdict, 'pass', 'Vinegar, balsamic');
  assert.notEqual(food('fdc-171417').verdict, 'pass', 'vinegar and oil dressing');
});

test('P2-9 (Q9c): a recipe line follows its own words first, then its linked food', () => {
  const line = (display, food) => checkRecipe({ id: 't', name: 'Test', ingredients: [{ food, display }] }, mcasPlan, matcher, foodsById, mcas);
  assert.equal(line('2 tbsp apple cider vinegar', 'fdc-173469').verdict, 'pass');
  assert.equal(line(undefined, 'fdc-173469').verdict, 'pass', 'no wording: the linked food decides');
  assert.equal(line(undefined, 'fdc-172237').verdict, 'pass', 'no wording: the linked food decides');
  assert.notEqual(line('balsamic vinegar', 'fdc-172237').verdict, 'pass', 'the wording names a left-out vinegar');
  assert.notEqual(line('1 tbsp vinegar', 'fdc-172237').verdict, 'pass', 'the wording does not say which vinegar');
});

test('P2-9 (Q9c): low FODMAP is unchanged for vinegar', () => {
  for (const t of ['apple cider vinegar', 'white vinegar', 'rice vinegar', 'red wine vinegar']) assert.equal(checkText(t, fodmapPlan, matcher, fodmap).verdict, 'pass', t);
});
