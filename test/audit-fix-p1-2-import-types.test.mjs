// P1-2 (audit of September 30, 2026): a crafted backup file could run script through the age field, which two screens
// wrote into the page without escaping (the lite Report, the profile's Basics step). Both are escaped now, and an
// imported file's values are checked by type: numbers become numbers or empty, text stays text, and anything else is
// dropped and counted. Every person here is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { importJSON } from '../src/store.js';

const base = extra => JSON.stringify({ version: 2, people: [{ id: 'p1', name: 'Test Person', adult: true, age: 72, modules: ['celiac'], allergens: ['allergen-peanut'], preferences: { avoid_tags: [], avoid_terms: ['cilantro'], patterns: [] }, ...extra }], log: [], diary: [] });

test('P1-2: markup in the age field is dropped on import, and counted', () => {
  const p = importJSON(base({ age: '<img src=x onerror="window.__xss(1)">' }));
  assert.equal(p.people[0].age, null);
  assert.ok(p._importDropped >= 1);
});

test('P1-2: numbers written as text become numbers; real numbers stay', () => {
  assert.equal(importJSON(base({ age: '72' })).people[0].age, 72);
  assert.equal(importJSON(base({ weight_kg: 70.5 })).people[0].weight_kg, 70.5);
  assert.equal(importJSON(base({})).people[0].age, 72);
  assert.equal(importJSON(base({})).people[0]._x, undefined);
});

test('P1-2: lists keep only text, and a wrong kind of value is dropped and counted', () => {
  const p = importJSON(base({ modules: ['celiac', 123, { x: 1 }], allergens: 'allergen-peanut', name: { first: 'x' } }));
  assert.deepEqual(p.people[0].modules, ['celiac']);
  assert.deepEqual(p.people[0].allergens, []);
  assert.equal(typeof p.people[0].name, 'string');
  assert.ok(p._importDropped >= 4, String(p._importDropped));
});

test('P1-2: a clean file drops nothing', () => {
  assert.equal(importJSON(base({})).__proto__ === Object.prototype, true);
  assert.equal(importJSON(base({}))._importDropped, 0);
});

test('P1-2: no screen writes a person\'s age into the page without escaping it', () => {
  const dir = new URL('../src/ui/', import.meta.url);
  const bad = [];
  for (const f of readdirSync(dir).filter(f => f.endsWith('.js'))) {
    // ${person.age}, ${person.age ?? ''}, and ${person.age || ''} write the value itself; "${person.age ? ..." only tests it.
    readFileSync(new URL(f, dir), 'utf8').split('\n').forEach((line, i) => { if (/\$\{\s*person\.age\s*(\}|\?\?|\|\|)/.test(line)) bad.push(`${f}:${i + 1}`); });
  }
  assert.deepEqual(bad, []);
});
