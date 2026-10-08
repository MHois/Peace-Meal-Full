// UX pass, October 2026: under three conditions the setup screen asked a yes/no question that repeated the condition's
// own "Which applies?" choice right above it, and nothing read the answer. "Older adult with an acute or chronic
// illness" (higher protein), "Currently in active cancer treatment" (cancer), and gestational diabetes (pregnancy) are
// no longer asked; the pregnancy answer now follows its choice. A question a rule reads is still asked (heart failure).
// Every person here is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = { readyState: 'loading', addEventListener() {}, removeEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], activeElement: null, documentElement: { setAttribute() {}, removeAttribute() {}, classList: { toggle() {}, add() {}, remove() {}, contains: () => false } } };
globalThis.window = { addEventListener() {}, location: { hash: '' } };
globalThis.location = { hash: '', href: 'https://example.org/' };
const C = JSON.parse(fs.readFileSync(new URL('../data/conditions.json', import.meta.url), 'utf8'));
const { uiState } = await import('../src/ui/common.js');
uiState.data = { conditions: C.modules };
uiState.conditionsMeta = { flags: C.flags || {} };
const { peopleModulePanelHTML } = await import('../src/ui/people.js');
const person = () => ({ id: 't', name: 'Test Person', variants: {}, flags: {}, optional_rules: [], rule_settings: {}, confirmations: [] });
const panel = id => peopleModulePanelHTML(C.modules.find(m => m.id === id), person());

test('no rule reads the three repeated questions (the reason they are not asked)', () => {
  const read = new Set();
  for (const m of C.modules) for (const r of m.rules || []) for (const a of [r.applies_if, ...((r.applies_if && r.applies_if.any) || [])]) if (a) { if (a.flag) read.add(a.flag); if (a.flag_not) read.add(a.flag_not); }
  for (const f of ['older_adult_illness', 'active_treatment', 'gdm']) assert.equal(read.has(f), false, f);
  assert.equal(read.has('advanced_hf'), true, 'heart failure fluid rule reads its question');
});

test('higher protein asks which applies once, not twice', () => {
  const html = panel('higher-protein-older-adult');
  assert.match(html, /Which applies\?/);
  assert.doesNotMatch(html, /flag-older_adult_illness/);
  assert.match(html, /Already chosen for you\. Tap the other one if it fits better\./, 'a plain line instead of "Default: ..."');
  assert.doesNotMatch(html, /Default: /);
});

test('cancer care and pregnancy do not repeat their choice as a yes/no question', () => {
  assert.doesNotMatch(panel('cancer-nutrition'), /flag-active_treatment/);
  const preg = panel('pregnancy-gdm-breastfeeding');
  assert.doesNotMatch(preg, /flag-gdm/);
  assert.match(preg, /Which apply\? Tap all that do\./);
});

test('a question that a rule reads is still asked', () => {
  assert.match(panel('heart-failure'), /flag-advanced_hf/);
});

test('the pregnancy choice keeps the gestational diabetes answer in step', () => {
  const src = fs.readFileSync(new URL('../src/ui/people.js', import.meta.url), 'utf8');
  assert.match(src, /if \(mid === 'pregnancy-gdm-breastfeeding'\) person\.flags\.gdm = cur\.has\('gdm'\);/);
});
