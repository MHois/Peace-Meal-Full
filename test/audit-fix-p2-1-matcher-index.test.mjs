// P2-1 (audit of September 30, 2026): the matcher tried all 1,619 dictionary patterns on every piece of every
// ingredient line, which is most of the lite app's 5-second start. The fix looks up only the patterns whose first word
// appears in the piece. These tests hold it to two things: it gives exactly the same answer as trying every pattern,
// on every recipe line in the app and on awkward text, and it tries far fewer patterns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMatcher } from '../src/engine/dictionary.js';

const J = f => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const dictionaries = J('dictionaries.json');
const recipes = [...J('recipes.json'), ...J('recipes-open.json'), ...J('recipes-usda.json')];
const lines = [...new Set(recipes.flatMap(r => (r.ingredients || []).map(i => i.display).filter(Boolean)))];

// Text built to probe the edges of the lookup: plurals (berry -> berries), terms that start with a digit or a symbol
// ("1% milk", "fd&c"), the three substring terms, letters outside a-z next to a term, hyphens, slashes, and case.
const awkward = [
  '', ' ', 'Ingredients:', 'berries', 'strawberrys', 'blueberries, raspberrys', '1% milk', '2% MILK, 1% milk fat', 'FD&C Yellow No. 5', 'fd&c red 40',
  'jalapeños', 'crème fraîche', 'piñon nuts', 'purée of peas', 'açaí', 'naïve eggs', 'wheat-free', 'soy/wheat', 'EGG—WHITES',
  'peanut butter (peanuts, salt)', 'milk chocolate [sugar, cocoa butter]', 'and/or soybean oil', 'e.g. chicken, pork, tofu',
  'Contains: Milk, Wheat, Soy.', 'MAY CONTAIN TREE NUTS', 'cashews; almonds; pecans', 'shrimp paste', 'fish sauce (anchovy)',
  'sesame seeds', 'tahini', 'rice malt syrup', 'malt vinegar', 'barley malt extract', 'buckwheat', 'cream of tartar',
  'x'.repeat(300), 'milk '.repeat(200), '½ cup 2% milk', '3 x 400g tins chopped tomatoes', 'İstanbul spice', 'ſoy'
];

test('P2-1: the indexed matcher gives exactly the same result as trying every pattern, on every recipe line', () => {
  const fast = buildMatcher(dictionaries);
  const full = buildMatcher(dictionaries, { index: false });
  let compared = 0;
  for (const text of [...lines, ...awkward]) {
    assert.deepEqual(fast.tagText(text), full.tagText(text), JSON.stringify(text));
    compared++;
  }
  assert.ok(compared > 20000, `compared ${compared} lines`);
});

test('P2-1: the same on 3,000 random mixes of dictionary words, noise words, and junk', () => {
  const fast = buildMatcher(dictionaries);
  const full = buildMatcher(dictionaries, { index: false });
  const words = dictionaries.entries.map(e => e.term);
  const extra = ['chopped', '2 cups', 'fresh', 'penut', 's0y', 'xqzt', '-', '/', '(', ')', ',', ';', '&', '%', 'ñ', 'é', 'ies', 's', 'es'];
  let seed = 7;
  const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let i = 0; i < 3000; i++) {
    const parts = [];
    const n = 1 + rnd(6);
    for (let k = 0; k < n; k++) parts.push(rnd(3) ? words[rnd(words.length)] : extra[rnd(extra.length)]);
    const text = parts.join(rnd(2) ? ' ' : (rnd(2) ? ', ' : ''));
    assert.deepEqual(fast.tagText(text), full.tagText(text), JSON.stringify(text));
  }
});

test('P2-1: tagging every recipe line tries under 3% of the patterns that a full scan tries', () => {
  const fast = buildMatcher(dictionaries);
  const full = buildMatcher(dictionaries, { index: false });
  for (const text of lines) { fast.tagText(text); full.tagText(text); }
  const f = fast.stats().patternChecks, s = full.stats().patternChecks;
  assert.ok(s > 0, 'the full scan counted its checks');
  assert.ok(f < s * 0.03, `indexed ${f} checks vs full ${s} (${(f / s * 100).toFixed(2)}%)`);
});
