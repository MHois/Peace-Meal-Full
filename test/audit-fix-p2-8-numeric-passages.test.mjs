// P2-8 (audit of September 30, 2026): 43 of the 44 numeric rules (a limit or target with a number) had no supporting
// passage logged under their rule id in docs/VERIFY-log.md or docs/DATA-REVIEW.md, although every number appears in the
// Phase 1 evidence. docs/VERIFY-log.md now has a row per rule with its passage, quoted word for word. No number changed.
// This test keeps the log honest: every numeric rule has a row, the row's passage states the rule's number, and each
// quote is found where the row says it comes from (the Phase 1 evidence file at that line, or the condition's article).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const T = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const conditions = JSON.parse(T('data/conditions.json'));
const articles = JSON.parse(T('data/articles.json'));
const phase1 = T('docs/PHASE-1-evidence-and-regulatory-foundation.md').split('\n');
const log = T('docs/VERIFY-log.md');
// The same selection as audit/scripts/data-quality.mjs (33e).
const numeric = conditions.modules.flatMap(m => (m.rules || []).filter(r => ['limit', 'target'].includes(r.kind) && [r.value, r.min, r.max].some(v => typeof v === 'number')));
const section = log.split(/^## /m).find(s => s.startsWith('P2-8')) || '';
const rowFor = id => section.split('\n').find(l => l.startsWith(`| \`${id}\` |`));
// Numbers written another way in a passage: 0 g of trans fat is "eliminate"; 2 servings a week is "twice a week";
// 1,500 to 2,000 ml is "1.5 to 2 L"; 1 g/kg is "1.0".
const SAME = { 0: ['Eliminate'], 2: ['twice a week'], 1500: ['1.5'], 2000: ['2 L'], 1: ['1.0'] };

test('P2-8: every numeric rule has a row in the P2-8 section of the VERIFY log', () => {
  assert.ok(section, 'docs/VERIFY-log.md has a "## P2-8" section');
  assert.equal(numeric.length, 44);
  assert.deepEqual(numeric.filter(r => !rowFor(r.id)).map(r => r.id), []);
});

test('P2-8: each row\'s passage states the rule\'s own number', () => {
  const bad = [];
  for (const r of numeric) {
    const cells = (rowFor(r.id) || '').split(' | ');
    const passage = cells[4] || '';
    for (const v of [r.value, r.min, r.max].filter(x => typeof x === 'number')) {
      const forms = [String(v), v.toLocaleString('en-US'), ...(SAME[v] || [])];
      if (!forms.some(f => passage.includes(f))) bad.push(`${r.id}: ${v}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('P2-8: each Phase 1 quote is word for word at the line it names, and each article quote is in that article', () => {
  const bad = [];
  for (const r of numeric) {
    const row = rowFor(r.id) || '';
    for (const m of row.matchAll(/Phase 1, line (\d+): "((?:[^"\\]|\\.)*)"/g)) {
      const line = phase1[Number(m[1]) - 1] || '';
      for (const piece of m[2].split('...').map(s => s.trim().replace(/^;\s*|;\s*$/g, '')).filter(Boolean)) if (!line.includes(piece)) bad.push(`${r.id}: line ${m[1]}: ${piece.slice(0, 60)}`);
    }
    for (const m of row.matchAll(/([A-Z][^."|]*?) article: "([^"]*)"/g)) {
      const a = Object.values(articles).find(x => x.title === m[1].trim());
      if (!a || !JSON.stringify(a).includes(m[2])) bad.push(`${r.id}: article "${m[1]}": ${m[2].slice(0, 60)}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('P2-8: the audit\'s own check finds every numeric rule logged', () => {
  const logs = log + '\n' + T('docs/DATA-REVIEW.md');
  assert.deepEqual(numeric.filter(r => !logs.includes(r.id)).map(r => r.id), []);
});
