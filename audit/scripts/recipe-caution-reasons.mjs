// Phase 3, item 14: where the recipe cautions come from, by collection, for a made-up peanut-allergy profile.
// Run from the repository root: node audit/scripts/recipe-caution-reasons.mjs
import { J, foodsById, matcher, person, planFor, checkRecipe } from '../lib/engine.mjs';
const all = [...J('recipes.json').map(r => ({ ...r, src: 'own' })), ...J('recipes-open.json').map(r => ({ ...r, src: r.source })), ...J('recipes-usda.json').map(r => ({ ...r, src: 'USDA' }))];
const p = person({ allergens: ['allergen-peanut'] }), plan = planFor(p);
const t = {};
for (const r of all) { const c = checkRecipe(r, plan, matcher, foodsById, p); const k = t[r.src] ||= { recipes: 0, caution: 0, cautionWithUnrecognized: 0, cautionUnknownRiskOnly: 0 }; k.recipes++; if (c.verdict === 'caution') { k.caution++; if (c.unrecognized.length) k.cautionWithUnrecognized++; else if (c.unknownRisk.length) k.cautionUnknownRiskOnly++; } }
console.log(JSON.stringify(t, null, 1));
