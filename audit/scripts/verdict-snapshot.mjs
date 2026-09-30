// Writes every verdict the engine gives (all recipes in the full build, every audit corpus line, and every distinct
// recipe ingredient line typed as a label) for twelve made-up profiles, so a change can be compared before and after.
//   node audit/scripts/verdict-snapshot.mjs out.json            write a snapshot
//   node audit/scripts/verdict-snapshot.mjs --compare a.json b.json   list what changed, by profile and kind
// Added with the fix pass of September 30, 2026. It changes nothing in the app.
import fs from 'node:fs';

const args = process.argv.slice(2);
if (args[0] === '--compare') {
  const [a, b] = [JSON.parse(fs.readFileSync(args[1], 'utf8')), JSON.parse(fs.readFileSync(args[2], 'utf8'))];
  const summary = {};
  const examples = {};
  for (const prof of Object.keys(b.v)) {
    for (const kind of Object.keys(b.v[prof])) {
      const A = (a.v[prof] || {})[kind] || {}, B = b.v[prof][kind];
      for (const id of new Set([...Object.keys(A), ...Object.keys(B)])) {
        if (A[id] === B[id]) continue;
        const k = `${prof} | ${kind} | ${A[id] || '-'} -> ${B[id] || '-'}`;
        summary[k] = (summary[k] || 0) + 1;
        (examples[k] ||= []).length < 5 && examples[k].push(id);
      }
    }
  }
  const keys = Object.keys(summary).sort();
  if (!keys.length) console.log('No verdict changed.');
  for (const k of keys) console.log(String(summary[k]).padStart(6), ' ', k, '  e.g.', examples[k].join(' ; '));
  process.exit(0);
}

const { J, foodsById, matcher, person, planFor, checkRecipe, checkText } = await import('../lib/engine.mjs');
const out = args[0] || 'verdicts.json';
const recipes = [...J('recipes.json'), ...J('recipes-open.json'), ...J('recipes-usda.json')];
const corpus = JSON.parse(fs.readFileSync(new URL('../corpus/allergen-labels.json', import.meta.url), 'utf8'));
const lines = [...new Set(recipes.flatMap(r => (r.ingredients || []).map(i => i.display).filter(Boolean)))].sort();
const PROFILES = {
  peanut: person({ allergens: ['allergen-peanut'] }),
  milk: person({ allergens: ['allergen-milk'] }),
  wheat: person({ allergens: ['allergen-wheat'] }),
  soy: person({ allergens: ['allergen-soy'] }),
  'shellfish+sesame': person({ allergens: ['allergen-crustacean', 'allergen-sesame'] }),
  kiwi: person({ allergens_other: ['kiwi'] }),
  celiac: person({ modules: ['celiac'] }),
  'hypertension+t2d': person({ modules: ['hypertension', 't2d'] }),
  fodmap: person({ modules: ['ibs-low-fodmap'] }),
  histamine: person({ modules: ['mcas'] }),
  vegan: person({ modules: ['vegetarian-vegan'], variants: { 'vegetarian-vegan': 'vegan' } }),
  none: person({})
};
const short = { pass: 'p', caution: 'c', fail: 'f' };
const v = {};
const t0 = Date.now();
for (const [name, p] of Object.entries(PROFILES)) {
  const plan = planFor(p);
  const R = {}, L = {}, C = {};
  for (const r of recipes) R[r.id] = short[checkRecipe(r, plan, matcher, foodsById, p).verdict];
  for (const d of lines) L[d] = short[checkText(d, plan, matcher, p).verdict];
  for (const c of corpus) C[c.id + ' ' + c.text] = short[checkText(c.text, plan, matcher, p).verdict];
  v[name] = { recipe: R, line: L, corpus: C };
}
fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), ms: Date.now() - t0, recipes: recipes.length, lines: lines.length, v }) + '\n');
console.log(`wrote ${out}: ${recipes.length} recipes, ${lines.length} ingredient lines, ${corpus.length} corpus lines, ${Object.keys(PROFILES).length} profiles, ${Date.now() - t0} ms`);
