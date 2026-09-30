// Phase 3, item 11: every realistic label line that contains an allergen (or gluten) must not PASS for a person with
// only that allergy (or celiac disease). A PASS here is a P0: the app would show a restricted food as safe.
// The test fails while any such PASS exists. Results: audit/results/allergen-corpus.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkFor } from '../lib/engine.mjs';

const corpus = JSON.parse(fs.readFileSync(new URL('../corpus/allergen-labels.json', import.meta.url), 'utf8'));
const rows = corpus.map(l => {
  const r = checkFor(l.profile, l.text);
  return { ...l, verdict: r.verdict, unrecognized: r.unrecognized, tags: Object.keys(r.tags), mayContain: Object.keys(r.mayContain || {}) };
});
const falsePass = rows.filter(r => r.expect === 'not-pass' && r.verdict === 'pass');
const byKind = {};
for (const r of rows.filter(r => r.expect === 'not-pass')) {
  const k = byKind[r.kind] ||= { lines: 0, pass: 0, caution: 0, fail: 0 };
  k.lines++; k[r.verdict]++;
}
const byProfile = {};
for (const r of rows.filter(r => r.expect === 'not-pass')) {
  const k = byProfile[r.profile] ||= { lines: 0, pass: 0, caution: 0, fail: 0 };
  k.lines++; k[r.verdict]++;
}
fs.mkdirSync(new URL('../results/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../results/allergen-corpus.json', import.meta.url), JSON.stringify({
  lines: rows.length, asserted: rows.filter(r => r.expect === 'not-pass').length, falsePass: falsePass.length, byKind, byProfile,
  falsePasses: falsePass.map(r => ({ id: r.id, profile: r.profile, kind: r.kind, text: r.text, tags: r.tags })),
  controls: rows.filter(r => r.expect === 'control').map(r => ({ id: r.id, profile: r.profile, text: r.text, verdict: r.verdict }))
}, null, 1) + '\n');

test('corpus has at least 300 realistic lines across the nine allergens and gluten', () => {
  assert.ok(corpus.length >= 300);
  assert.deepEqual([...new Set(corpus.map(l => l.profile))].sort(), ['celiac', 'crustacean', 'egg', 'fish', 'milk', 'peanut', 'sesame', 'soy', 'tree-nut', 'wheat']);
});

test('the checker never throws on a corpus line', () => {
  for (const l of corpus) assert.doesNotThrow(() => checkFor(l.profile, l.text), l.id);
});

for (const kind of ['plain', 'hidden', 'case', 'plural', 'typo', 'ocr', 'masked', 'may', 'contains', 'label', 'source']) {
  test(`no false PASS: ${kind} lines`, () => {
    const bad = falsePass.filter(r => r.kind === kind).map(r => `${r.id} [${r.profile}] ${JSON.stringify(r.text)}`);
    assert.deepEqual(bad, [], `${bad.length} line(s) PASS for a person with that allergy`);
  });
}
