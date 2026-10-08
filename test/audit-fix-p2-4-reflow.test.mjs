// P2-4 (audit of September 30, 2026): with text doubled at phone width, 12 of 27 screens scrolled sideways, and at
// 320 px the lite Report did (audit/e2e/a11y-reflow.mjs). The browser run is the proof; this test keeps the rules that
// fixed it from being dropped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const R = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
// Every selector in the stylesheet (media blocks flattened) with its declarations, last one winning.
function cssRules(css) {
  const out = new Map();
  const flat = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g, '$1');
  for (const m of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decls = Object.fromEntries(m[2].split(';').map(d => d.split(':').map(x => x.trim())).filter(d => d.length >= 2 && d[0]).map(([k, ...v]) => [k, v.join(':')]));
    for (const sel of m[1].split(',').map(x => x.trim().replace(/\s+/g, ' '))) out.set(sel, { ...(out.get(sel) || {}), ...decls });
  }
  return out;
}
const css = cssRules(R('src/app.css'));
const px = v => parseFloat(v);

test('P2-4: the lite report tables scroll in their own box, so the page does not', () => {
  const lite = R('src/ui/lite.js');
  assert.equal((lite.match(/<table class="report-table">/g) || []).length, 2);
  assert.equal((lite.match(/<div class="table-wrap" role="region" aria-label="[^"]+" tabindex="0"><table class="report-table">/g) || []).length, 2, "each in its own labeled box that the keyboard can scroll");
  assert.equal(css.get('.table-wrap')['overflow-x'], 'auto');
});

test('P2-4: rows that pushed the page wide can wrap or shrink', () => {
  assert.equal(css.get('.chip')['white-space'], 'normal');
  assert.equal(css.get('.meter')['grid-template-columns'], 'minmax(0, 1fr) auto');
  assert.equal(css.get('.entry-row .entry-main')['grid-template-columns'], 'minmax(0, 1fr) auto');
  assert.equal(css.get('.lite-slots')['grid-template-columns'].startsWith('repeat(2, minmax(0, 1fr))') || css.get('.lite-slots')['grid-template-columns'] === 'minmax(0, 1fr)', true);
  assert.equal(css.get('.lite-slot .lite-slot-head')['flex-wrap'], 'wrap');
  assert.equal(css.get('.lite-logged-row')['flex-wrap'], 'wrap');
  assert.equal(css.get('.tile')['overflow-wrap'], 'anywhere');
  assert.equal(css.get('.quick-action')['overflow-wrap'], 'anywhere');
  assert.equal(css.get('.tabbar a')['min-width'], '0');
  assert.equal(css.get('.page-head .page-head-actions select')['max-width'], '100%');
});
