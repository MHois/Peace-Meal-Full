// P3-3 (audit of September 30, 2026), one part of it: the recipe collections' standing defaults (which collections are
// on until the person changes them) were written out by hand in five places (store.js, app.js, and twice in
// settings.js; app.js also wrote partial copies), so adding a collection, or changing a default as on September 30,
// had to touch every one. They are now written once, in store.js, and read from there. No default changed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const store = await import('../src/store.js');

test('P3-3: the collection defaults are written once, with the same values as before', () => {
  assert.deepEqual({ ...store.RECIPE_COLLECTION_DEFAULTS }, { nhs: true, parentclub: true, nhlbi: true, va: true, wikibooks: true, usda: false, review_dual: true });
  const p = store.defaultProfile();
  for (const [k, v] of Object.entries(store.RECIPE_COLLECTION_DEFAULTS)) assert.equal(p.recipe_collections[k], v, `a new profile: ${k}`);
});

test('P3-3: a profile\'s own choices win, and the defaults are never changed by reading them', () => {
  const on = store.recipeCollectionsOn({ recipe_collections: { usda: true, nhs: false } });
  assert.equal(on.usda, true); assert.equal(on.nhs, false); assert.equal(on.va, true);
  on.va = false;
  assert.equal(store.RECIPE_COLLECTION_DEFAULTS.va, true, 'a copy each time');
  assert.deepEqual(store.recipeCollectionsOn(null), { ...store.RECIPE_COLLECTION_DEFAULTS });
});

test('P3-3: no other file writes the defaults out by hand', () => {
  const files = ['src/app.js', 'src/ui/settings.js'];
  for (const f of files) {
    const src = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /nhs: true, parentclub: true/, `${f}: the full object`);
    assert.doesNotMatch(src, /Object\.assign\(\{ (wikibooks: true|usda: false) \}/, `${f}: a partial copy`);
  }
});
