import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMatcher } from '../src/engine/dictionary.js';
import { checkText, checkRecipe } from '../src/engine/checker.js';
import { recipeTotals } from '../src/engine/nutrition.js';

const dict = { tags: { 'allergen-milk': { label: 'Milk', hard: true }, 'allergen-wheat': { label: 'Wheat', hard: true }, gluten: { label: 'Gluten' }, 'added-sugar': { label: 'Added sugar' }, 'fodmap-fructan': { label: 'Fructans' } },
  entries: [
    { term: 'whey', tags: ['allergen-milk'], match: 'word' },
    { term: 'wheat flour', tags: ['allergen-wheat', 'gluten'], match: 'phrase' },
    { term: 'sugar', tags: ['added-sugar'], match: 'word' },
    { term: 'garlic', tags: ['fodmap-fructan'], match: 'word' },
    { term: 'natural flavors', tags: [], match: 'phrase', note: 'may hide allergens' },
    { term: 'caseinate', tags: ['allergen-milk'], match: 'substring' }
  ] };
const matcher = buildMatcher(dict);

function plan(avoid) { return { avoid, prefer: {}, limits: {}, targets: {} }; }

test('word matching respects boundaries and plurals', () => {
  const r = matcher.tagText('sugars, sugarcane juice, garlic cloves, wheat flour');
  assert.deepEqual(r.tags['added-sugar'], ['sugar']);
  assert.ok(r.tags['fodmap-fructan']);
  assert.ok(r.tags['allergen-wheat']);
  assert.ok(r.unrecognized.includes('sugarcane juice'));
});

test('hard hit fails; unknown-risk term is caution when allergens are selected', () => {
  const p = plan({ 'allergen-milk': { hard: true, rules: [] } });
  assert.equal(checkText('water, whey', p, matcher, { allergens: ['allergen-milk'] }).verdict, 'fail');
  assert.equal(checkText('water, natural flavors', p, matcher, { allergens: ['allergen-milk'] }).verdict, 'caution');
  // Nothing restricted, nothing to protect: an unknown-risk term alone passes.
  assert.equal(checkText('water, natural flavors', plan({}), matcher, { allergens: [] }).verdict, 'pass');
  // Until the 2026-09 audit this plan (it avoids milk as a hard rule) let the term pass when the person had no allergen
  // on file. A plan that restricts anything now makes it a caution (README safety rule 7).
  assert.equal(checkText('water, natural flavors', p, matcher, { allergens: [] }).verdict, 'caution');
  assert.equal(checkText('sodium caseinate', p, matcher, { allergens: ['allergen-milk'] }).verdict, 'fail');
});

test('unrecognized text is caution when allergens are selected, never silently pass', () => {
  const p = plan({ 'allergen-milk': { hard: true, rules: [] } });
  const r = checkText('xanthum gum, mystery powder', p, matcher, { allergens: ['allergen-milk'] });
  assert.equal(r.verdict, 'caution');
  assert.equal(r.unrecognized.length, 2);
});

test('recipe nutrients are summed by grams and compared to daily limits', () => {
  const foods = new Map([
    ['f1', { id: 'f1', name: 'Salt', per100g: { sodium_mg: 38758, kcal: 0 }, tags: [] }],
    ['f2', { id: 'f2', name: 'Chicken', per100g: { sodium_mg: 74, kcal: 165, protein_g: 31 }, tags: ['poultry'] }]
  ]);
  const recipe = { id: 'r', name: 'Salty chicken', servings: 2, ingredients: [{ food: 'f1', grams: 10, display: 'salt' }, { food: 'f2', grams: 400, display: 'chicken breast' }] };
  const t = recipeTotals(recipe, foods);
  assert.equal(Math.round(t.perServing.sodium_mg), Math.round((38758 * 0.10 + 74 * 4) / 2));
  const p = { avoid: {}, prefer: { poultry: { rules: [] } }, limits: { sodium_mg: { value: 1500 } }, targets: {} };
  const c = checkRecipe(recipe, p, matcher, foods, {});
  assert.equal(c.verdict, 'caution');
  assert.ok(c.exceeds.some(e => e.nutrient === 'sodium_mg'));
  assert.ok(c.preferHits.some(h => h.tag === 'poultry'));
});

test('except phrases: butter does not fire inside peanut butter; milk not inside coconut milk', () => {
  const d = { tags: { 'allergen-milk': { label: 'Milk', hard: true }, 'allergen-peanut': { label: 'Peanut', hard: true }, 'allergen-tree-nut': { label: 'Tree nut', hard: true } }, entries: [
    { term: 'butter', tags: ['allergen-milk'], except: ['peanut butter', 'almond butter'] },
    { term: 'milk', tags: ['allergen-milk'], except: ['coconut milk', 'oat milk'] },
    { term: 'peanut butter', tags: ['allergen-peanut'] },
    { term: 'coconut milk', tags: ['allergen-tree-nut'] },
    { term: 'sausage', tags: [], may_contain: ['allergen-milk'], risk: 'unknown' },
    { term: 'berry', tags: ['fruit'] }
  ] };
  const m = buildMatcher(d);
  const r1 = m.tagText('peanut butter, coconut milk');
  assert.equal(r1.tags['allergen-milk'], undefined);
  assert.ok(r1.tags['allergen-peanut'] && r1.tags['allergen-tree-nut']);
  const r2 = m.tagText('butter, whole milk');
  assert.ok(r2.tags['allergen-milk']);
  const r3 = m.tagText('mixed berries, cranberries');
  assert.deepEqual(r3.tags['fruit'], ['berry']);
  assert.ok(r3.unrecognized.includes('cranberries'));
  const p = { avoid: { 'allergen-milk': { hard: true, rules: [] } }, prefer: {}, limits: {}, targets: {} };
  const c = checkText('pork sausage', p, m, { allergens: ['allergen-milk'] });
  assert.equal(c.verdict, 'caution');
  assert.ok(c.verifyLabel.some(v => v.tag === 'allergen-milk'));
});

test('hyphen and apostrophe normalization', () => {
  const m = buildMatcher({ tags: { 'added-sugar': { label: 'Added sugar' } }, entries: [{ term: 'high-fructose corn syrup', tags: ['added-sugar'] }, { term: "confectioner's sugar", tags: ['added-sugar'] }] });
  assert.ok(m.tagText('HIGH FRUCTOSE CORN SYRUP').tags['added-sugar']);
  assert.ok(m.tagText('high-fructose corn syrup').tags['added-sugar']);
  assert.ok(m.tagText("confectioners sugar").tags['added-sugar']);
});

test('quantity and prep words alone are not reported as unrecognized', () => {
  const m = buildMatcher({ tags: { legume: { label: 'Legume' } }, entries: [{ term: 'black bean', tags: ['legume'] }] });
  const r = m.tagText('1 can (15 oz) black beans, rinsed and drained');
  assert.ok(r.tags['legume']);
  assert.deepEqual(r.unrecognized, []);
  const r2 = m.tagText('2 cups mystery powder, diced');
  assert.deepEqual(r2.unrecognized, ['2 cups mystery powder']);
});

test('imported recipes use their USDA per-serving nutrition and dictionary-tag their ingredient text', () => {
  const r = { id: 'mp-1', name: 'Bean soup', servings: 4, nutrition_source: 'usda-myplate-kitchen', source_url: 'https://example.org', nutrition_per_serving: { kcal: 210, sodium_mg: 480, fiber_g: 9 }, ingredients: [{ display: '1 can black beans, rinsed' }, { display: '1 cup wheat flour' }] };
  const t = recipeTotals(r, new Map());
  assert.equal(t.perServing.kcal, 210);
  assert.equal(Math.round(t.total.sodium_mg), 1920);
  const p = { avoid: { 'allergen-wheat': { hard: true, rules: [] } }, prefer: {}, limits: {}, targets: {} };
  const c = checkRecipe(r, p, matcher, new Map(), { allergens: ['allergen-wheat'] });
  assert.equal(c.verdict, 'fail');
});
