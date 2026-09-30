// Adapted recipes: a recipe blocked for one diet family only by ingredients on the swap list gets an adapted copy with
// those ingredients replaced or removed. Every swap cites its source (data/swaps.json). The copy is checked again by the
// caller; a copy that still trips a rule is thrown away. Nothing here overrides an allergen or a hard rule: the checker
// runs on the adapted ingredients exactly as it does on any recipe.

// Family tags that a plan avoids. A family applies to a person when the plan avoids at least one of its tags.
export function familiesFor(plan, swapsData) {
  const avoid = (plan && plan.avoid) || {};
  return Object.entries((swapsData && swapsData.families) || {}).filter(([, f]) => f.tags.some(t => avoid[t])).map(([id]) => id);
}

// True when an adapted recipe belongs in this person's pool: its family is one the plan restricts.
export function adaptedApplies(recipe, plan, swapsData) {
  if (!recipe || !recipe.adapted) return true;
  return familiesFor(plan, swapsData).includes(recipe.adapted.family);
}

function ingredientTags(ing, matcher, foodsById) {
  const tags = new Set();
  const food = ing.food ? foodsById.get(ing.food) : null;
  if (food) for (const t of food.tags || []) tags.add(t);
  if (matcher && ing.display) for (const t of Object.keys(matcher.tagText(ing.display).tags)) tags.add(t);
  return tags;
}

function swapFor(text, family, swapsData) {
  const t = String(text || '').toLowerCase();
  for (const s of swapsData.swaps) {
    if (s.family !== family) continue;
    if (!new RegExp(s.match, 'i').test(t)) continue;
    if (s.except && new RegExp(s.except, 'i').test(t)) continue;
    return s;
  }
  return null;
}

// Returns an adapted copy of the recipe for the family, or null when nothing needed swapping or when an offending
// ingredient has no swap (the recipe then stays as it is, a caution the planner leaves out).
export function adaptRecipe(recipe, family, swapsData, matcher, foodsById) {
  const fam = swapsData && swapsData.families && swapsData.families[family];
  if (!fam || !recipe || recipe.adapted) return null;
  const famTags = new Set(fam.tags);
  const out = [];
  const applied = [];
  let touched = false;
  for (const ing of recipe.ingredients || []) {
    const tags = ingredientTags(ing, matcher, foodsById);
    const text = ing.display || (ing.food && foodsById.get(ing.food) ? foodsById.get(ing.food).name : '');
    const offending = [...tags].some(t => famTags.has(t));
    const swap = swapFor(text, family, swapsData);
    if (!offending) { out.push(ing); continue; }
    if (!swap) return null;                      // an offending ingredient with no swap: leave the recipe alone
    touched = true;
    if (!swap.to) { applied.push({ id: swap.id, from: text, to: null, how: swap.how, sources: swap.sources }); continue; }
    const grams = Number(ing.grams) > 0 ? Math.max(swap.to.grams_min || 0, Math.round(Number(ing.grams) * (swap.to.grams_per_gram || 1))) : null;
    // The replaced ingredient's name must not appear in the display text, or the dictionary would tag it again; it is kept in `replaces` for the screen.
    // For a recipe without linked foods the amount ("same amount", "a small handful per onion") goes in its own field:
    // it is shown with the ingredient but never checked, so "same amount" is not an unrecognized ingredient and
    // "per onion" does not read as onion.
    const next = { display: swap.to.display, replaces: text };
    if (!(ing.grams && ing.food)) next.amount_text = swap.to.amount_text || 'same amount';
    if (recipe.ingredients.some(i => i.food)) { next.food = swap.to.food; next.grams = grams || swap.to.grams_min || 10; }
    out.push(next);
    applied.push({ id: swap.id, from: text, to: swap.to.display, how: swap.how, sources: swap.sources });
  }
  if (!touched) return null;
  // An adapted copy must still pass the family's own tags on the new ingredients; the caller re-checks with the full plan.
  for (const ing of out) { const tags = ingredientTags(ing, matcher, foodsById); if ([...tags].some(t => famTags.has(t))) return null; }
  const linked = out.some(i => i.food);
  const adapted = {
    ...recipe,
    id: `${recipe.id}~${family}`,
    name: `${recipe.name} (${fam.label} version)`,
    ingredients: out,
    adapted: { from: recipe.id, fromName: recipe.name, family, label: fam.label, swaps: applied, sources: fam.sources },
    tags: recipe.tags || []
  };
  // Nutrition: linked recipes recompute from the new ingredients; published-number recipes keep their numbers, marked approximate.
  if (linked) { delete adapted.nutrition_per_serving; delete adapted.nutrition_source; delete adapted.conversion_note; }
  else if (recipe.nutrition_per_serving) adapted.nutrition_approx = true;
  delete adapted.featured;
  return adapted;
}

// Builds every adapted copy for the given families over a pool of base recipes, keeping only copies that pass the
// family plan (a plan built from that family's module alone), so a copy never lands in the pool while still tripping a rule.
export function buildAdaptedRecipes({ recipes, families, swapsData, matcher, foodsById, checkRecipe, familyPlans }) {
  const out = [];
  for (const family of families) {
    const plan = familyPlans[family];
    if (!plan) continue;
    for (const r of recipes) {
      if (r.adapted || r.custom) continue;
      const a = adaptRecipe(r, family, swapsData, matcher, foodsById);
      if (!a) continue;
      const c = checkRecipe(a, plan, matcher, foodsById, {});
      if (c.verdict !== 'pass') continue;
      out.push(a);
    }
  }
  return out;
}
