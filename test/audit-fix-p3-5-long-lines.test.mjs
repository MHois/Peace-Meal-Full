// P3-5 (audit of September 30, 2026): five number-and-unit patterns in the recipe line reader (stated grams, kilograms,
// millilitres, litres, and the "(15 oz)" inside a line) re-read a run of digits from every position in it, so one
// pasted line of 80,000 digits froze the editor for 2.7 seconds. They now look at the first 500 characters of a line.
// The longest ingredient line in the recipe data is 218 characters, so every real line is read exactly as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = { readyState: 'loading', addEventListener() {}, removeEventListener() {}, getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; }, activeElement: null, documentElement: { setAttribute() {}, removeAttribute() {}, classList: { toggle() {}, add() {}, remove() {}, contains: () => false } } };
globalThis.window = { addEventListener() {}, location: { hash: '' } };
globalThis.location = { hash: '', href: 'https://example.org/' };
const { recipesEdParseQuantity } = await import('../src/ui/recipes-edit.js');

test('P3-5: a pasted line of 80,000 digits is read in well under a second', () => {
  const lines = ['1' + '0'.repeat(80000), '9'.repeat(80000) + ' x', '2 ' + '7'.repeat(80000) + ' kg', '1 (' + '5'.repeat(80000) + ')', '1,'.repeat(40000) + 'g'];
  for (const line of lines) {
    const t0 = process.hrtime.bigint();
    recipesEdParseQuantity(line);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    assert.ok(ms < 250, `${line.slice(0, 12)}... took ${ms.toFixed(0)} ms`);
  }
});

test('P3-5: every ingredient line in the recipe data is shorter than the limit, so each is read as before', () => {
  let longest = 0;
  for (const f of ['recipes', 'recipes-open', 'recipes-usda']) for (const r of JSON.parse(fs.readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'))) for (const i of r.ingredients || []) longest = Math.max(longest, String(i.display || '').length);
  assert.ok(longest > 100 && longest < 500, `longest line ${longest}`);
});

test('P3-5: ordinary lines are read as before', () => {
  assert.equal(recipesEdParseQuantity('250g plain flour').stated, 250);
  assert.equal(recipesEdParseQuantity('1.5 kg potatoes').stated, 1500);
  assert.equal(recipesEdParseQuantity('400ml coconut milk').ml, 400);
  assert.equal(recipesEdParseQuantity('1 litre stock').ml, 1000);
  assert.deepEqual(recipesEdParseQuantity('1 can (15 oz) black beans').inner, { qty: 15, unit: 'oz' });
  assert.equal(recipesEdParseQuantity('2 x 250g tubs').stated, 250);
});
