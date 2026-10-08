// Phase 3, item 14: every recipe in both builds against typical made-up profiles.
//   - checkRecipe never throws
//   - checkRecipe and checkText agree: no recipe passes, or cautions, while one of its own ingredient lines is a hard
//     stop on the label checker (and every disagreement of the milder kind is counted)
//   - swaps: no adapted copy fails, or is less than a pass, for the diet it was adapted for
// Results: audit/results/recipes-profiles.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { J, foodsById, matcher, person, planFor, checkRecipe, checkText } from '../lib/engine.mjs';
import { buildAdaptedRecipes } from '../../src/engine/swaps.js';
import { buildPlan } from '../../src/engine/plan.js';

const own = J('recipes.json'), open = J('recipes-open.json'), usda = J('recipes-usda.json');
const full = [...own, ...open, ...usda];
const liteIds = new Set([...own, ...open.filter(r => r.source !== 'Wikibooks Cookbook')].map(r => r.id));
const PROFILES = {
  'peanut allergy': person({ allergens: ['allergen-peanut'] }),
  'milk allergy': person({ allergens: ['allergen-milk'] }),
  'shellfish and sesame allergies': person({ allergens: ['allergen-crustacean', 'allergen-sesame'] }),
  'kiwi (an allergy outside the nine)': person({ allergens_other: ['kiwi'] }),
  'celiac disease': person({ modules: ['celiac'] }),
  'high blood pressure and type 2 diabetes': person({ modules: ['hypertension', 't2d'] }),
  'IBS on low FODMAP': person({ modules: ['ibs-low-fodmap'] }),
  'MCAS (low histamine)': person({ modules: ['mcas'] }),
  'vegan': person({ modules: ['vegetarian-vegan'], variants: { 'vegetarian-vegan': 'vegan' } }),
  'kidney disease (stages 1 to 4)': person({ modules: ['ckd-non-dialysis'] })
};
const results = { recipes: { full: full.length, lite: liteIds.size }, profiles: {}, crashes: [], hardIngredientNotFail: [], swaps: {} };
for (const [name, p] of Object.entries(PROFILES)) {
  const plan = planFor(p);
  const textCache = new Map();
  const lineVerdict = d => { if (!textCache.has(d)) textCache.set(d, checkText(d, plan, matcher, p).verdict); return textCache.get(d); };
  const counts = { full: { pass: 0, caution: 0, fail: 0 }, lite: { pass: 0, caution: 0, fail: 0 }, lineCautionRecipePass: 0 };
  for (const r of full) {
    let c;
    try { c = checkRecipe(r, plan, matcher, foodsById, p); } catch (e) { results.crashes.push({ profile: name, recipe: r.id, error: String(e.message) }); continue; }
    counts.full[c.verdict]++;
    if (liteIds.has(r.id)) counts.lite[c.verdict]++;
    const lines = (r.ingredients || []).map(i => i.display).filter(Boolean);
    const hard = lines.filter(d => lineVerdict(d) === 'fail');
    if (hard.length && c.verdict !== 'fail') results.hardIngredientNotFail.push({ profile: name, recipe: r.id, name: r.name, verdict: c.verdict, lines: hard.slice(0, 3) });
    if (c.verdict === 'pass' && lines.some(d => lineVerdict(d) === 'caution')) counts.lineCautionRecipePass++;
  }
  results.profiles[name] = counts;
}

// Swaps: build the adapted copies the way src/app.js does (a plan from the family's module alone), then check each copy
// against that same diet for a made-up person.
const swapsData = J('swaps.json'), conditions = J('conditions.json').modules, dictionaries = J('dictionaries.json');
const withNutrition = full.filter(r => (r.nutrition_per_serving && r.nutrition_source) || (r.ingredients || []).some(i => i.food));
for (const [family, fam] of Object.entries(swapsData.families)) {
  const pseudo = { id: 'family:' + family, name: family, adult: true, modules: [fam.module], allergens: [], preferences: { avoid_tags: [], avoid_terms: [] }, medications: {}, tier2: {}, phases: {}, modes: {}, acknowledged: [], flags: {}, variants: {} };
  const famPlan = buildPlan({ person: pseudo, conditions, dictionaries, today: new Date('2026-09-30') });
  const adapted = buildAdaptedRecipes({ recipes: withNutrition, families: [family], swapsData, matcher, foodsById, checkRecipe, familyPlans: { [family]: famPlan } });
  const p = person({ modules: [fam.module] }), plan = planFor(p);
  const notPass = adapted.map(a => ({ a, v: checkRecipe(a, plan, matcher, foodsById, p).verdict })).filter(x => x.v !== 'pass');
  results.swaps[family] = { adapted: adapted.length, notPassForItsDiet: notPass.length, examples: notPass.slice(0, 10).map(x => ({ id: x.a.id, verdict: x.v })) };
}
fs.mkdirSync(new URL('../results/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../results/recipes-profiles.json', import.meta.url), JSON.stringify(results, null, 1) + '\n');

test('checkRecipe never throws for any recipe in either build, for any profile', () => {
  assert.deepEqual(results.crashes, []);
});
test('no recipe passes or cautions while one of its own ingredient lines is a hard stop on the label checker', () => {
  assert.deepEqual(results.hardIngredientNotFail.map(x => `[${x.profile}] ${x.recipe}: ${x.verdict} although "${x.lines[0]}" fails`), []);
});
test('every adapted copy passes the diet it was adapted for', () => {
  for (const [family, s] of Object.entries(results.swaps)) assert.equal(s.notPassForItsDiet, 0, `${family}: ${JSON.stringify(s.examples)}`);
});
