// Deterministic nutrient math. Values come from foods.json (USDA) by grams. Nothing is estimated.

export const NUTRIENT_KEYS = ['kcal','protein_g','carb_g','fiber_g','sugar_g','added_sugar_g','fat_g','satfat_g','transfat_g','cholesterol_mg','sodium_mg','potassium_mg','phosphorus_mg','calcium_mg','iron_mg','magnesium_mg','vitamin_c_mg','vitamin_d_iu','vitamin_b12_ug','folate_ug','zinc_mg','caffeine_mg','alcohol_g'];

export function emptyTotals() {
  const t = {};
  for (const k of NUTRIENT_KEYS) t[k] = 0;
  t._missing = {}; // nutrient -> count of ingredients with null value
  return t;
}

export function nutrientsForGrams(food, grams) {
  const out = emptyTotals();
  const f = grams / 100;
  for (const k of NUTRIENT_KEYS) {
    const v = food.per100g ? food.per100g[k] : null;
    if (v == null) { out._missing[k] = (out._missing[k] || 0) + 1; continue; }
    out[k] = v * f;
  }
  return out;
}

export function addTotals(a, b) {
  const out = emptyTotals();
  for (const k of NUTRIENT_KEYS) out[k] = (a[k] || 0) + (b[k] || 0);
  for (const k of new Set([...Object.keys(a._missing || {}), ...Object.keys(b._missing || {})])) out._missing[k] = (a._missing?.[k] || 0) + (b._missing?.[k] || 0);
  return out;
}

export function scaleTotals(a, factor) {
  const out = emptyTotals();
  for (const k of NUTRIENT_KEYS) out[k] = (a[k] || 0) * factor;
  out._missing = { ...(a._missing || {}) };
  return out;
}

export function recipeTotals(recipe, foodsById) {
  let total = emptyTotals();
  const missingFoods = [];
  // Imported recipes (for example USDA MyPlate Kitchen) carry USDA-computed per-serving nutrition instead of food links.
  if (recipe.nutrition_per_serving && recipe.nutrition_source && !(recipe.ingredients || []).some(i => i.food)) {
    const per = emptyTotals();
    for (const k of NUTRIENT_KEYS) { const v = recipe.nutrition_per_serving[k]; if (v == null) per._missing[k] = 1; else per[k] = Number(v) || 0; }
    return { total: scaleTotals(per, recipe.servings || 1), perServing: per, missingFoods, imported: recipe.nutrition_source };
  }
  for (const ing of recipe.ingredients || []) {
    const food = foodsById.get(ing.food);
    if (!food) { missingFoods.push(ing.food); continue; }
    total = addTotals(total, nutrientsForGrams(food, Number(ing.grams) || 0));
  }
  return { total, perServing: scaleTotals(total, 1 / (recipe.servings || 1)), missingFoods };
}

export function derived(totals) {
  const kcal = totals.kcal || 0;
  return {
    satfat_pct_kcal: kcal ? (totals.satfat_g * 9) / kcal * 100 : null,
    carb_pct_kcal: kcal ? (totals.carb_g * 4) / kcal * 100 : null,
    added_sugar_pct_kcal: kcal && totals.added_sugar_g ? (totals.added_sugar_g * 4) / kcal * 100 : null,
    fiber_g_per_1000kcal: kcal ? totals.fiber_g / kcal * 1000 : null
  };
}

export function round(v, d = 0) {
  if (v == null || Number.isNaN(v)) return null;
  const m = Math.pow(10, d);
  return Math.round(v * m) / m;
}

// Compare a day's totals to plan limits and targets.
export function compareToPlan(totals, plan) {
  const out = { over: [], under: [], ok: [] };
  const d = derived(totals);
  for (const [nut, lim] of Object.entries(plan.limits || {})) {
    const v = nut in d ? d[nut] : totals[nut];
    if (v == null) continue;
    (v > lim.value ? out.over : out.ok).push({ nutrient: nut, value: round(v, 1), limit: lim.value, pct: round(v / lim.value * 100) });
  }
  for (const [nut, tg] of Object.entries(plan.targets || {})) {
    const v = nut in d ? d[nut] : totals[nut];
    if (v == null) continue;
    if (v < tg.min) out.under.push({ nutrient: nut, value: round(v, 1), min: tg.min, pct: round(v / tg.min * 100) });
    else if (tg.max != null && v > tg.max) out.over.push({ nutrient: nut, value: round(v, 1), limit: tg.max, pct: round(v / tg.max * 100) });
    else out.ok.push({ nutrient: nut, value: round(v, 1), min: tg.min });
  }
  return out;
}
