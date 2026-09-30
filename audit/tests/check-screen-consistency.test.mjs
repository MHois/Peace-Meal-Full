// Phase 3 (items 11 and 14, conditions side): the Check screen has two boxes, "type or photograph a label" (checkText)
// and "search a food" (checkFood). The September summary says they must not disagree about the same food. For every
// USDA food in data/foods.json that checkFood flags for a person, typing that food's own name into the label box must
// not PASS. A PASS there shows a food the app's own data restricts as safe. Also: a label that is salt or soy sauce is a
// PASS for a person with a daily sodium limit. Results: audit/results/check-screen-consistency.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { foods, matcher, person, planFor, checkText, checkFood } from '../lib/engine.mjs';

const PROFILES = {
  'peanut allergy': person({ allergens: ['allergen-peanut'] }), 'milk allergy': person({ allergens: ['allergen-milk'] }), 'wheat allergy': person({ allergens: ['allergen-wheat'] }),
  'soy allergy': person({ allergens: ['allergen-soy'] }), 'tree nut allergy': person({ allergens: ['allergen-tree-nut'] }), 'fish allergy': person({ allergens: ['allergen-fish'] }),
  'shellfish allergy': person({ allergens: ['allergen-crustacean'] }), 'egg allergy': person({ allergens: ['allergen-egg'] }), 'sesame allergy': person({ allergens: ['allergen-sesame'] }),
  'celiac disease': person({ modules: ['celiac'] }), 'MCAS (low histamine)': person({ modules: ['mcas'] }), 'IBS (low FODMAP)': person({ modules: ['ibs-low-fodmap'] }), 'lactose intolerance': person({ modules: ['lactose-intolerance'] })
};
const results = { profiles: {}, sodium: null };
for (const [name, p] of Object.entries(PROFILES)) {
  const plan = planFor(p);
  const disagree = [];
  let flagged = 0;
  for (const f of foods) {
    const fv = checkFood(f, plan, matcher, p).verdict;
    if (fv === 'pass') continue;
    flagged++;
    const label = f.short || f.name;
    const t = checkText(label, plan, matcher, p);
    if (t.verdict === 'pass') disagree.push({ food: f.name, typed: label, foodVerdict: fv, foodTags: (f.tags || []).filter(x => plan.avoid && plan.avoid[x]) });
  }
  results.profiles[name] = { foodsFlagged: flagged, typedNamePasses: disagree.length, hardStopFoodPassesAsText: disagree.filter(d => d.foodVerdict === 'fail').length, examples: disagree.slice(0, 25) };
}
{
  const p = person({ modules: ['hypertension'] }), plan = planFor(p);
  results.sodium = ['salt', 'sea salt', 'kosher salt', 'garlic salt', 'celery salt', 'seasoned salt', 'soy sauce', 'fish sauce', 'baking soda', 'monosodium glutamate', 'pickles', 'olives', 'feta', 'hot dog'].map(t => ({ label: t, verdict: checkText(t, plan, matcher, p).verdict, sodiumLimit: plan.limits.sodium_mg && plan.limits.sodium_mg.value }));
}
fs.writeFileSync(new URL('../results/check-screen-consistency.json', import.meta.url), JSON.stringify(results, null, 1) + '\n');

for (const [name, r] of Object.entries(results.profiles)) {
  test(`${name}: no food the food box flags passes when its name is typed as a label (${r.foodsFlagged} foods flagged)`, () => {
    assert.equal(r.typedNamePasses, 0, `${r.typedNamePasses} pass as typed text (${r.hardStopFoodPassesAsText} of them FAIL in the food box), e.g. ${r.examples.slice(0, 4).map(e => `"${e.typed}" (food: ${e.foodVerdict})`).join(', ')}`);
  });
}
test('a label that is salt, soy sauce, or fish sauce is not a PASS for a person with a daily sodium limit', () => {
  const passes = results.sodium.filter(s => s.verdict === 'pass').map(s => s.label);
  assert.deepEqual(passes, [], `sodium limit ${results.sodium[0].sodiumLimit} mg; these pass: ${passes.join(', ')}`);
});
