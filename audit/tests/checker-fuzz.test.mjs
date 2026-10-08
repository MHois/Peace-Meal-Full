// Phase 3, item 12: property and fuzz tests for the label checker.
//   A. an allergen term present never yields PASS for a person with that allergy
//   B. text the dictionary does not recognize never yields PASS while any restriction is on file (README rule 7)
//   C. the checker never throws, whatever it is given
// Seeded, so every run draws the same inputs. Failing inputs are saved to audit/corpus/fuzz-failures.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fc from 'fast-check';
import { checkFor, profilePlan, matcher, dictionaries, checkText, person, planFor } from '../lib/engine.mjs';

const SEED = 20260930;
const RUNS = 3000;
const ALLERGEN_TAG = { milk: 'allergen-milk', egg: 'allergen-egg', fish: 'allergen-fish', crustacean: 'allergen-crustacean', 'tree-nut': 'allergen-tree-nut', peanut: 'allergen-peanut', wheat: 'allergen-wheat', soy: 'allergen-soy', sesame: 'allergen-sesame', celiac: 'gluten' };
const PROFILE_KEYS = Object.keys(ALLERGEN_TAG);
const termsFor = tag => dictionaries.entries.filter(e => (e.tags || []).includes(tag)).map(e => e.term);

// Plain safe words the dictionary knows (so a segment can hold a known word next to an unknown one).
const KNOWN = ['sugar', 'salt', 'water', 'rice', 'corn starch', 'apple', 'carrot', 'onion', 'garlic', 'olive oil', 'vinegar', 'chicken', 'potato', 'tomato', 'lemon juice', 'honey', 'seeds', 'flakes', 'powder', 'chocolate', 'oil'];
const knownNow = KNOWN.filter(w => matcher.tagText(w).unrecognized.length === 0);
// A made-up word: letters only, not a dictionary term, not a quantity or preparation word.
const gib = fc.stringMatching(/^[a-z]{3,9}$/).filter(w => { const r = matcher.tagText(w); return r.unrecognized.length === 1 && Object.keys(r.tags).length === 0; });
const casing = fc.constantFrom('lower', 'upper', 'title');
const applyCase = (s, c) => c === 'upper' ? s.toUpperCase() : c === 'title' ? s.replace(/\b\w/g, x => x.toUpperCase()) : s;

const failures = {};
function sampleAndCheck(name, arb, holds, runs = RUNS) {
  const bad = [];
  for (const v of fc.sample(arb, { numRuns: runs, seed: SEED })) {
    let ok;
    try { ok = holds(v); } catch (e) { ok = false; v.error = String(e && e.message || e); }
    if (!ok) bad.push(v);
  }
  failures[name] = { runs, failed: bad.length, examples: bad.slice(0, 40) };
  return bad;
}

test('A1. an allergen term as its own ingredient never passes (any case)', () => {
  const arb = fc.record({ profile: fc.constantFrom(...PROFILE_KEYS), c: casing, before: fc.array(fc.constantFrom(...knownNow), { maxLength: 3 }), after: fc.array(fc.constantFrom(...knownNow), { maxLength: 3 }) })
    .chain(x => fc.constantFrom(...termsFor(ALLERGEN_TAG[x.profile])).map(term => ({ ...x, term })));
  const bad = sampleAndCheck('A1-term-own-segment', arb, v => {
    v.text = applyCase([...v.before, v.term, ...v.after].join(', '), v.c);
    return checkFor(v.profile, v.text).verdict !== 'pass';
  });
  assert.equal(bad.length, 0, bad.slice(0, 5).map(b => `[${b.profile}] ${b.text}`).join(' | '));
});

test('A2. an allergen term inside a segment with made-up words around it never passes', () => {
  const arb = fc.record({ profile: fc.constantFrom(...PROFILE_KEYS), pre: gib, post: gib })
    .chain(x => fc.constantFrom(...termsFor(ALLERGEN_TAG[x.profile])).map(term => ({ ...x, term })));
  const bad = sampleAndCheck('A2-term-with-unknown-words', arb, v => {
    v.text = `sugar, ${v.pre} ${v.term} ${v.post}, salt`;
    return checkFor(v.profile, v.text).verdict !== 'pass';
  });
  assert.equal(bad.length, 0, bad.slice(0, 5).map(b => `[${b.profile}] ${b.text}`).join(' | '));
});

test('B1. a made-up ingredient on its own never passes while a restriction is on file (rule 7)', () => {
  const arb = fc.record({ profile: fc.constantFrom(...PROFILE_KEYS, 'hypertension', 'ibs', 'mcas'), words: fc.array(gib, { minLength: 1, maxLength: 3 }), known: fc.array(fc.constantFrom(...knownNow), { maxLength: 3 }) });
  const bad = sampleAndCheck('B1-unknown-own-segment', arb, v => {
    v.text = [...v.known, v.words.join(' ')].join(', ');
    return extraCheck(v.profile, v.text).verdict !== 'pass';
  });
  assert.equal(bad.length, 0, bad.slice(0, 5).map(b => `[${b.profile}] ${b.text}`).join(' | '));
});

test('B2. a made-up word next to a known word in the same ingredient never passes while a restriction is on file (rule 7)', () => {
  const arb = fc.record({ profile: fc.constantFrom(...PROFILE_KEYS, 'hypertension', 'ibs', 'mcas'), word: gib, known: fc.constantFrom(...knownNow), order: fc.boolean() });
  const bad = sampleAndCheck('B2-unknown-beside-known-word', arb, v => {
    v.text = v.order ? `${v.word} ${v.known}` : `${v.known} ${v.word}`;
    return extraCheck(v.profile, v.text).verdict !== 'pass';
  });
  assert.equal(bad.length, 0, `${bad.length} of ${RUNS} passed, e.g. ` + bad.slice(0, 5).map(b => `[${b.profile}] ${JSON.stringify(b.text)}`).join(' | '));
});

test('C. the checker never throws, for any string or value', () => {
  const p = person({ allergens: ['allergen-milk', 'allergen-peanut'], allergens_other: ['kiwi', 'oat'], modules: ['celiac', 'hypertension'], preferences: { avoid_tags: [], avoid_terms: ['cilantro', '(', '.*'], patterns: [] } });
  const plan = planFor(p);
  const arb = fc.oneof(fc.string({ maxLength: 400 }), fc.string({ unit: 'grapheme', maxLength: 200 }), fc.string({ unit: 'binary', maxLength: 200 }), fc.anything());
  const bad = sampleAndCheck('C-never-throws', arb.map(x => ({ x })), v => { checkText(v.x, plan, matcher, p); return true; }, 5000);
  assert.equal(bad.length, 0, bad.slice(0, 3).map(b => b.error).join(' | '));
});

test('C2. a very long label is checked in reasonable time (no runaway pattern)', () => {
  const p = person({ allergens: ['allergen-milk'] });
  const plan = planFor(p);
  const long = Array.from({ length: 2000 }, (_, i) => ['sugar', 'wheat flour', 'xqzt blorp', '(((', 'a'.repeat(50)][i % 5]).join(', ');
  const t0 = performance.now();
  const r = checkText(long, plan, matcher, p);
  const ms = performance.now() - t0;
  failures['C2-long-label'] = { chars: long.length, ms: Math.round(ms), verdict: r.verdict };
  assert.ok(ms < 5000, `took ${ms} ms`);
});

// Profiles beyond the allergies, for rule 7.
const EXTRA = { hypertension: () => person({ modules: ['hypertension'] }), ibs: () => person({ modules: ['ibs-low-fodmap'] }), mcas: () => person({ modules: ['mcas'] }) };
const extraPlans = {};
function extraCheck(key, text) {
  if (!EXTRA[key]) return checkFor(key, text);
  if (!extraPlans[key]) { const p = EXTRA[key](); extraPlans[key] = { p, plan: planFor(p) }; }
  return checkText(text, extraPlans[key].plan, matcher, extraPlans[key].p);
}

test.after(() => {
  fs.writeFileSync(new URL('../corpus/fuzz-failures.json', import.meta.url), JSON.stringify({ seed: SEED, generated: 'by audit/tests/checker-fuzz.test.mjs', ...failures }, null, 1) + '\n');
});
