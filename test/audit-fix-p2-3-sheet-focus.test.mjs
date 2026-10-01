// P2-3 (audit of September 30, 2026): keyboard focus left an open sheet. Only Escape was handled, so on the lite symptom
// sheet 21 of 40 Tab presses landed on the screen behind it (audit/e2e/a11y.mjs). Every sheet now keeps Tab and
// Shift+Tab inside it: the app's sheets (uiModal), the yes/no pop-up over a sheet (uiConfirmSheet), and the Home Screen
// guide. The browser proof is audit/e2e/a11y.mjs ("focusLeftTheSheet").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// common.js runs in a page; with a page that is still loading it only waits for it.
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = { readyState: 'loading', addEventListener() {}, removeEventListener() {}, getElementById() { return null; }, activeElement: null, documentElement: { setAttribute() {}, removeAttribute() {}, classList: { toggle() {}, add() {} } } };
const common = await import('../src/ui/common.js');

// A made-up sheet: focusable controls that are shown (getClientRects) or hidden (a closed details, display none).
const el = (name, shown = true) => ({ name, getClientRects: () => (shown ? [1] : []), focus() { document.activeElement = this; } });
const sheet = items => ({ querySelectorAll: () => items, contains: x => items.includes(x) || x === 'inside-not-focusable' });
const key = (shiftKey = false) => { const e = { key: 'Tab', shiftKey, prevented: false, preventDefault() { this.prevented = true; } }; return e; };

test('P2-3: Tab on the last control goes back to the first; Shift+Tab on the first goes to the last', () => {
  assert.equal(typeof common.uiTrapTab, 'function');
  const a = el('a'), b = el('b'), c = el('c'), box = sheet([a, b, c]);
  document.activeElement = c;
  let e = key(); common.uiTrapTab(e, box);
  assert.equal(document.activeElement, a); assert.equal(e.prevented, true);
  document.activeElement = a;
  e = key(true); common.uiTrapTab(e, box);
  assert.equal(document.activeElement, c); assert.equal(e.prevented, true);
});

test('P2-3: in the middle of a sheet, Tab is left to the browser', () => {
  const a = el('a'), b = el('b'), c = el('c'), box = sheet([a, b, c]);
  document.activeElement = b;
  const e = key(); common.uiTrapTab(e, box);
  assert.equal(e.prevented, false); assert.equal(document.activeElement, b);
});

test('P2-3: focus outside the sheet, or on a heading inside it, is brought back to the sheet', () => {
  const a = el('a'), b = el('b'), box = sheet([a, b]);
  document.activeElement = el('behind the sheet');
  let e = key(); common.uiTrapTab(e, box);
  assert.equal(document.activeElement, a);
  document.activeElement = 'inside-not-focusable';
  e = key(true); common.uiTrapTab(e, box);
  assert.equal(document.activeElement, b);
});

test('P2-3: hidden controls are skipped, and other keys are left alone', () => {
  const a = el('a'), hidden = el('in a closed section', false), box = sheet([a, hidden]);
  document.activeElement = a;
  const e = key(); common.uiTrapTab(e, box);
  assert.equal(document.activeElement, a, 'the only shown control keeps focus');
  assert.equal(e.prevented, true);
  const esc = { key: 'Escape', preventDefault() { throw new Error('not for Escape'); } };
  assert.equal(common.uiTrapTab(esc, box), false);
});

test('P2-3: every kind of sheet uses it', () => {
  const src = f => readFileSync(new URL('../src/ui/' + f, import.meta.url), 'utf8');
  const modal = src('common.js').slice(src('common.js').indexOf('export function uiModal('));
  assert.match(modal.slice(0, 2500), /uiTrapTab\(/, 'uiModal');
  const confirm = src('common.js').slice(src('common.js').indexOf('export function uiConfirmSheet('));
  assert.match(confirm.slice(0, 2000), /uiTrapTab\(/, 'uiConfirmSheet');
  assert.match(src('install.js'), /uiTrapTab\(/, 'the Home Screen guide');
});
