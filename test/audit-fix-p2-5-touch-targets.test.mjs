// P2-5 (audit of September 30, 2026): 572 lite controls were 24 to 43 px, under the iPhone's 44-point guideline
// (audit/e2e/a11y.mjs). The browser run is the proof; this test keeps the rules that fixed it from being dropped.
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

test('P2-5: the lite build marks its root, and every small control there is at least 44 px', () => {
  assert.match(R('src/app.js'), /if \(APP_LITE\) document\.documentElement\.classList\.add\('lite'\)/);
  for (const sel of ['html.lite .btn.small', 'html.lite .btn.link', 'html.lite button.chip', 'html.lite a.chip', 'html.lite .topbar .brand', 'html.lite .filter-bar .filter-select select', 'html.lite .meter .meter-word .btn.link', 'html.lite .week-eaters input', 'html.lite .grocery-days input', 'html.lite .person-card .edit-row a.chip', 'html.lite .module-name', 'html.lite .heart-btn', 'html.lite .never-btn', 'html.lite .btn.small.icon']) {
    const r = css.get(sel);
    assert.ok(r, sel);
    assert.ok(px(r['min-height']) >= 44, `${sel} min-height ${r['min-height']}`);
  }
  for (const sel of ['html.lite .heart-btn', 'html.lite .never-btn', 'html.lite .btn.small.icon']) assert.ok(px(css.get(sel)['min-width']) >= 44, sel);
  assert.ok(px(css.get('.grocery-item')['min-height']) >= 44, 'a grocery row, which ticks its checkbox, is the target');
});
