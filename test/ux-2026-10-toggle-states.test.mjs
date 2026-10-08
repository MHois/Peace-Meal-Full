// UX pass, October 2026 (owner item 3): under a chosen condition (weight management, higher protein, pregnancy, and the
// others with choices), the selected option was a pale green pill on a pale green panel, the same color, so a person
// could not tell on from off. Every selected choice, filter, and symptom pick now has a solid fill, contrasting text, and
// a check mark, and every switch says On or Off in words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = { readyState: 'loading', addEventListener() {}, removeEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], activeElement: null, documentElement: { setAttribute() {}, removeAttribute() {}, classList: { toggle() {}, add() {}, remove() {}, contains: () => false } } };
globalThis.window = { addEventListener() {}, location: { hash: '' } };
globalThis.location = { hash: '', href: 'https://example.org/' };
const common = await import('../src/ui/common.js');

const css = fs.readFileSync(new URL('../src/app.css', import.meta.url), 'utf8');
// The declarations of the first rule whose selector list is exactly `sel`.
function rule(sel) {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp('(^|\\n)' + esc + '\\s*\\{([^}]*)\\}'));
  assert.ok(m, `the stylesheet has a rule for ${sel}`);
  return Object.fromEntries(m[2].split(';').map(d => d.split(':').map(s => s.trim())).filter(([k, v]) => k && v));
}

test('a selected choice is not the same color as the panel it sits on', () => {
  const on = rule('.seg label.on'), off = rule('.seg label'), panel = rule('.subpanel');
  assert.notEqual(on.background, panel.background, 'selected pill background differs from the sub-panel');
  assert.notEqual(on.background, off.background, 'selected pill background differs from an unselected pill');
  assert.equal(on.background, 'var(--primary)');
  assert.equal(on.color, 'var(--on-primary)', 'text on the solid fill uses the paired contrast color');
});

test('a selected choice also has a check mark, so it never depends on color alone', () => {
  assert.match(css, /\.seg label\.on::before[^{]*\{[^}]*content:\s*"\\2713"/);
  for (const sel of ['.filter-chip[aria-pressed="true"]::before', '.today-chip.on::before', '.lite-sym.on::before']) assert.ok(css.includes(sel), sel);
});

test('filters, the Favorites chip, symptom picks, and household seats use a solid fill when on', () => {
  assert.equal(rule('.chip.filter-chip[aria-pressed="true"]').background, 'var(--accent)');
  assert.equal(rule('.today-chip.on').background, 'var(--accent)');
  assert.equal(rule('.lite-sym.on').background, 'var(--accent)');
  assert.equal(rule('.roster-btn.on').background, 'var(--primary)');
});

test('Yes and No, and every segmented choice, mark the current one', () => {
  const html = common.uiYesNo('flag-x', true);
  assert.match(html, /<label class="on"><input type="radio" name="flag-x" value="yes" checked/);
  assert.match(html, /<label class=""><input type="radio" name="flag-x" value="no"/);
});

test('every switch shows On or Off in words, drawn from its live state', () => {
  const html = common.uiSwitch('s1', 'Save money', 'Reuse ingredients', true);
  assert.match(html, /<span class="switch-state" aria-hidden="true"><\/span>/);
  assert.doesNotMatch(html, /aria-checked/, 'no fixed aria-checked that goes stale after a tap');
  assert.match(css, /\.switch \.switch-state::after\s*\{\s*content:\s*"Off"/);
  assert.match(css, /\.switch:has\(input:checked\) \.switch-state::after\s*\{\s*content:\s*"On"/);
});
