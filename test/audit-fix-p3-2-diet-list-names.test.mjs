// P3-2 (audit of September 30, 2026): four names are listed twice within one diet list (low FODMAP: lemongrass, rice
// malt syrup; low histamine: corn, coconut milk), and "french beans" carries the beans' GOS tag. Checked on October 1,
// 2026, nothing is wrong today: both copies of each name approve it at the same serve, so the answer does not depend on
// which copy the list meets first. And "french beans" is ambiguous: USDA's food data names "Beans, french, mature seeds,
// raw" (SR Legacy 173738), a dried bean, while in British use French beans are green beans. Treating it as a bean (a
// caution on low FODMAP, never a pass) is the stricter reading, so it stays (docs/DATA-REVIEW.md). These tests keep both
// true. Every person here is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMatcher } from '../src/engine/dictionary.js';
import { buildPlan } from '../src/engine/plan.js';
import { checkText } from '../src/engine/checker.js';

const J = f => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const lists = J('diet-lists.json'), conditions = J('conditions.json').modules, dictionaries = J('dictionaries.json');

test('P3-2: a name listed twice in one diet list gives the same answer from either item', () => {
  const dup = {};
  for (const [family, f] of Object.entries(lists.families)) {
    const byName = new Map();
    for (const g of f.groups || []) for (const it of g.items || []) for (const n of [it.term, ...(it.aliases || [])]) {
      const k = String(n || '').toLowerCase().trim();
      if (k) byName.set(k, [...(byName.get(k) || []), it]);
    }
    for (const [name, items] of byName) if (items.length > 1) {
      dup[`${family}: ${name}`] = items.length;
      assert.equal(new Set(items.map(i => i.portion || '')).size, 1, `${family}: "${name}" has one serve in every item`);
      assert.ok(!items.some(i => i.verified === false), `${family}: "${name}" is checked in every item`);
    }
  }
  // The four the audit found. A new one makes this fail, so someone looks at it.
  assert.deepEqual(Object.keys(dup).sort(), ['low-fodmap: lemongrass', 'low-fodmap: rice malt syrup', 'low-histamine: coconut milk', 'low-histamine: corn']);
});

test('P3-2: "french beans" is never a pass on a low FODMAP plan, while the name can mean a dried bean', () => {
  const matcher = buildMatcher(dictionaries);
  matcher.dietLists = lists;
  const p = { id: 't', name: 'Test Person', adult: true, age: 45, sex: 'female', modules: ['ibs-low-fodmap'], allergens: [], allergens_other: [], preferences: { avoid_tags: [], avoid_terms: [], patterns: [] }, medications: {}, tier2: {}, phases: {}, rule_settings: {} };
  const plan = buildPlan({ person: p, conditions, dictionaries, today: new Date('2026-10-01') });
  for (const t of ['french beans', '200 g french beans', 'dried french beans']) assert.notEqual(checkText(t, plan, matcher, p).verdict, 'pass', t);
  assert.equal(checkText('green beans', plan, matcher, p).verdict, 'pass', 'green beans, said plainly, are unchanged');
});
