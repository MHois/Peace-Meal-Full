// P3-1 (audit of September 30, 2026): 29 sources in data/sources.json are cited by no rule, article, dictionary entry,
// diet list, or swap. Most belong to conditions removed on September 9 (POTS, CRPS, migraine, non-celiac gluten
// sensitivity), to the Phase 1 regulatory research, or to the eating-disorder screen that is no longer shown; two are
// cited only from code. They stay (nothing is deleted without the owner; docs/DATA-REVIEW.md lists them by group). This
// test keeps the list from growing: a new source must be cited somewhere, or be added here on purpose.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const T = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const J = p => JSON.parse(T(p));
const KNOWN_UNCITED = ['hrs-pots-2015', 'ccs-pots-2020', 'vernino-pots-2021', 'garland-2021', 'nct05924646', 'pen-pots-2023', 'crps-sr-2025', 'zhu-crps-2024', 'vitamin-c-crps-2021', 'rsdsa-budapest', 'skodje-2018', 'biesiekierski-2013', 'catassi-2017', 'lebwohl-2017', 'fda-cds-2026', 'fda-whoop-warning-2025', 'fda-tempo-pilot-2025', 'colorado-hb25-1220', 'michigan-mnt-licensure-2026', 'california-bpc-2586', 'scoff-questionnaire', 'national-alliance-eating-disorders', 'ajh-dash-delivery-2026', 'ahs-ihs-materials', 'ramsden-2021', 'mifflin-1990', 'ainsworth-compendium-2011', 'user-defined', 'glim-2019'];

// The same walk as audit/scripts/data-quality.mjs (33a).
function citedIds() {
  const cited = new Set();
  const walk = (v, key = '') => {
    if (Array.isArray(v)) { if (/sources$|^basis_sources$|^source_ids$/.test(key)) v.forEach(x => cited.add(typeof x === 'string' ? x : x && x.id)); else v.forEach(x => walk(x)); }
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (k === 'references' && Array.isArray(x)) x.forEach(r => cited.add(r.id)); walk(x, k); }
  };
  const dict = J('data/dictionaries.json');
  for (const v of [J('data/conditions.json'), dict.entries, dict.tags, J('data/diet-lists.json'), J('data/swaps.json'), J('data/articles.json')]) walk(v);
  return cited;
}

test('P3-1: every source is cited somewhere, apart from the 29 the audit listed', () => {
  const cited = citedIds();
  const uncited = J('data/sources.json').map(s => s.id).filter(id => !cited.has(id));
  assert.deepEqual(uncited.filter(id => !KNOWN_UNCITED.includes(id)), [], 'a new source nothing cites');
});

test('P3-1: the 29 are still in data/sources.json (kept, not deleted)', () => {
  const ids = new Set(J('data/sources.json').map(s => s.id));
  assert.deepEqual(KNOWN_UNCITED.filter(id => !ids.has(id)), []);
});
