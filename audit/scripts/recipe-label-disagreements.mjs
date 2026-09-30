// Phase 3, item 14: why a recipe can PASS while one of its own ingredient lines, typed into the label box, is a caution.
// Prints the reason by kind for four made-up profiles. Run from the repository root: node audit/scripts/recipe-label-disagreements.mjs
import { J, foodsById, matcher, person, planFor, checkRecipe, checkText } from '../lib/engine.mjs';
const all = [...J('recipes.json'), ...J('recipes-open.json'), ...J('recipes-usda.json')];
const P = { 'peanut allergy': person({ allergens: ['allergen-peanut'] }), 'IBS on low FODMAP': person({ modules: ['ibs-low-fodmap'] }), 'MCAS (low histamine)': person({ modules: ['mcas'] }), 'milk allergy': person({ allergens: ['allergen-milk'] }) };
for (const [name, p] of Object.entries(P)) {
  const plan = planFor(p); let n = 0; const why = {};
  for (const r of all) {
    const c = checkRecipe(r, plan, matcher, foodsById, p); if (c.verdict !== 'pass') continue;
    for (const i of r.ingredients || []) { if (!i.display) continue; const t = checkText(i.display, plan, matcher, p); if (t.verdict === 'caution') { n++; const k = t.unrecognized.length ? 'unrecognized words' : (t.notApproved || []).length ? 'not on the strict list' : (t.unknownRisk || []).length ? 'term that can hide something' : (t.verifyLabel || []).length ? 'check the label' : (t.hits || []).length ? 'soft avoid' : 'other'; (why[k] ||= []).push(`${r.id}: "${i.display}"${t.unrecognized.length ? ' [' + t.unrecognized.join('; ') + ']' : ''}`); break; } }
  }
  console.log(`== ${name}: ${n}`); for (const [k, v] of Object.entries(why)) console.log(`   ${k} ${v.length}: ${v.slice(0, 3).join(' | ')}`);
}
