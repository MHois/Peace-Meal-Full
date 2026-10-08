// Phase 3, item 11 (conditions): single-food labels that a condition's own article says to avoid, checked for a person
// with only that condition. A PASS here is a restricted food shown as fine. Run from the repository root:
//   node --test audit/tests/condition-labels.test.mjs
// Results: audit/results/condition-labels.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { person, planFor, matcher } from '../lib/engine.mjs';
import { checkText } from '../../src/engine/checker.js';

// Each case: the condition, the label, and where the app's own text says it should be avoided or limited.
const CASES = [
  { module: 'mcas', label: 'corned beef', basis: 'data/articles.json:780 "cured and processed meats"; foods.json tags "Beef, cured, corned beef" histamine-aged' },
  { module: 'mcas', label: 'pastrami', basis: 'same' },
  { module: 'mcas', label: 'salami', basis: 'same' },
  { module: 'mcas', label: 'beef jerky', basis: 'same' },
  { module: 'mcas', label: 'sauerkraut', basis: 'data/articles.json:780 "fermented foods (sauerkraut, ...)"' },
  { module: 'mcas', label: 'aged cheddar', basis: 'data/articles.json:780 "aged cheeses"' },
  { module: 'hypertension', label: 'salt', basis: 'data/conditions.json:368 sodium under 2,300 mg a day' },
  { module: 'hypertension', label: 'soy sauce', basis: 'same' },
  { module: 'hypertension', label: 'garlic salt', basis: 'same' },
  { module: 'celiac', label: 'malt vinegar', basis: 'celiac rules: malt is a gluten source' },
  { module: 'celiac', label: 'barley', basis: 'celiac rules' }
];
const rows = [];
for (const c of CASES) {
  test(`${c.module}: "${c.label}" is not a PASS`, () => {
    const p = person({ modules: [c.module] });
    const r = checkText(c.label, planFor(p), matcher, p);
    rows.push({ ...c, verdict: r.verdict });
    assert.notEqual(r.verdict, 'pass', `${c.label} passes for ${c.module} (${c.basis})`);
  });
}
test.after(() => fs.writeFileSync(new URL('../results/condition-labels.json', import.meta.url), JSON.stringify(rows, null, 1) + '\n'));
