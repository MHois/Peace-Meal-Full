// "What can I make": rank recipes by how many of their ingredients the household already has.
// Matching is by food name words and dictionary terms, case-insensitive. Pantry staples (salt, oil, water, spices) are assumed on hand.
const STAPLE = /\b(salt|pepper|water|ice|oil|vinegar|spice|cumin|paprika|cinnamon|oregano|basil|thyme|garlic powder|onion powder|baking|flour|sugar|honey)\b/i;

function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }
function words(s) { return norm(s).split(' ').filter(w => w.length > 2 && !['raw', 'cooked', 'fresh', 'canned', 'with', 'without', 'and', 'the', 'skin', 'meat', 'only', 'boneless', 'skinless'].includes(w)); }

export function matchRecipes({ have, recipes, foodsById, minCoverage = 0.5 }) {
  const haveTerms = (Array.isArray(have) ? have : String(have || '').split(/[,\n;]+/)).map(norm).filter(Boolean);
  const haveWords = new Set(haveTerms.flatMap(words));
  const results = [];
  for (const r of recipes) {
    const missing = [], present = [];
    for (const ing of r.ingredients || []) {
      const food = foodsById.get(ing.food);
      const label = ing.display || (food ? food.short || food.name : ing.food);
      if (STAPLE.test(label) || (food && STAPLE.test(food.short || food.name))) { present.push({ label, staple: true }); continue; }
      const candidates = [label, food ? food.short : '', food ? food.name : ''].map(norm).filter(Boolean);
      const hit = candidates.some(c => haveTerms.some(h => c.includes(h) || h.includes(c))) || candidates.some(c => { const ws = words(c); return ws.length && ws.some(w => haveWords.has(w) || haveWords.has(w.replace(/s$/, '')) || haveWords.has(w + 's')); });
      (hit ? present : missing).push({ label });
    }
    const total = present.length + missing.length;
    const nonStaple = present.filter(p => !p.staple).length + missing.length;
    const coverage = nonStaple ? (nonStaple - missing.length) / nonStaple : 1;
    if (coverage >= minCoverage) results.push({ recipe: r, coverage, missing: missing.map(m => m.label), present: present.map(p => p.label), missingCount: missing.length, total });
  }
  results.sort((a, b) => a.missingCount - b.missingCount || b.coverage - a.coverage || (a.recipe.active_min || 0) - (b.recipe.active_min || 0));
  return results;
}
