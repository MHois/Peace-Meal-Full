// Weekly meal plan. Deterministic given a seed. Hard exclusions are never scheduled.
// Scoring blends: hard/soft avoid, prefer tags, time fit, skill and equipment fit, leftovers tolerance, variety, spice, cuisine, and daily nutrient limits.
import { checkRecipe } from './checker.js';
import { emptyTotals, addTotals, scaleTotals, recipeTotals, derived } from './nutrition.js';
import { cuisineSkipped, cuisineLoved } from './cuisine.js';
import { spiceSkipped, spiceBonus } from './spice.js';

export const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const SKILL = { beginner: 0, comfortable: 1, confident: 2 };

// Snack slots, in the order they fall in a day. A snack slot draws from recipes tagged "snack".
export const SNACK_SLOTS = [
  { id: 'snack-am', label: 'Morning snack' },
  { id: 'snack-pm', label: 'Afternoon snack' },
  { id: 'snack-eve', label: 'Evening snack' }
];
export const SLOT_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', 'snack-am': 'Morning snack', 'snack-pm': 'Afternoon snack', 'snack-eve': 'Evening snack' };
export function isSnackSlot(slot) { return typeof slot === 'string' && slot.startsWith('snack'); }

// Conditions where smaller, more frequent eating is part of the plan (each cites its rule in conditions.json):
// gestational diabetes (three meals and two to three snacks, gdm-carb), reflux (gerd-small-meals), gastroparesis
// (gp-small-meals, 4 to 6 a day), GLP-1 users (wm-glp1-meals), cancer treatment nausea (ca-tx-symptoms).
const FREQUENT_MODULES = { 'pregnancy-gdm-breastfeeding': 'gdm', gerd: 'gerd', gastroparesis: 'frequent', 'weight-management-glp1': 'frequent', 'cancer-nutrition': 'frequent' };

// How many snacks a day the plan should carry and why. The person's own setting wins; otherwise the conditions decide.
export function snackPlan(person, plan, weekOverride) {
  const set = typeof weekOverride === 'number' ? weekOverride : person && person.cooking && person.cooking.snacks_per_day;
  const mods = new Set(((plan && plan.modules) || []).map(m => m.id));
  let kind = null;
  for (const [id, k] of Object.entries(FREQUENT_MODULES)) if (mods.has(id)) { kind = kind === 'gdm' ? kind : k; }
  let count, why;
  if (typeof set === 'number' && set >= 0 && set <= 3) { count = set; why = 'your setting'; }
  else if (kind === 'gdm') { count = 2; why = 'gestational diabetes guidance: three meals and two to three snacks, including one before bed'; }
  else if (kind === 'gerd') { count = 2; why = 'reflux guidance: smaller meals, and nothing close to lying down'; }
  else if (kind === 'frequent') { count = 2; why = 'your plan calls for smaller, more frequent meals'; }
  else if (person && person.adult === false) { count = 2; why = 'children do well with regular snacks between meals'; }
  else if (person && person.goals && person.goals.calorie_target === 'gain') { count = 2; why = 'weight-gain goal: snacks between meals add calories without bigger plates'; }
  else { count = 1; why = 'one afternoon snack by default'; }
  let slots;
  if (count === 0) slots = [];
  else if (count === 1) slots = ['snack-pm'];
  else if (count === 2) slots = kind === 'gdm' ? ['snack-pm', 'snack-eve'] : ['snack-am', 'snack-pm'];
  else slots = ['snack-am', 'snack-pm', 'snack-eve'];
  if (kind === 'gerd') slots = slots.filter(s => s !== 'snack-eve');   // no evening snack with reflux
  return { count: slots.length, slots, why: typeof weekOverride === 'number' ? 'your setting for this week' : why, auto: why !== 'your setting' && typeof weekOverride !== 'number' };
}

// The day's slots in order: breakfast, morning snack, lunch, afternoon snack, dinner, evening snack.
export function daySlots(person, plan, weekOverride) {
  const snacks = new Set(snackPlan(person, plan, weekOverride).slots);
  const order = ['breakfast', 'snack-am', 'lunch', 'snack-pm', 'dinner', 'snack-eve'];
  return order.filter(s => !isSnackSlot(s) || snacks.has(s));
}

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hashStr(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

// Minutes the person can cook on a given weekday. `override` is this week's change for that one date ({ minutes }),
// made on the Week screen; it never touches the standing weekday/weekend answer from the Cooking step.
export function minutesAvailable(cooking, dayIdx, override) {
  if (override && typeof override.minutes === 'number' && override.minutes > 0) return override.minutes;
  const weekend = dayIdx === 0 || dayIdx === 6;
  const m = weekend ? cooking.weekend_minutes : cooking.weekday_minutes;
  return Number(m) || 20;
}

// Whether the person can cook on a given weekday. An empty cook_days list means every day. `override` as above ({ can_cook }).
export function canCookOn(cooking, dayIdx, override) {
  if (override && typeof override.can_cook === 'boolean') return override.can_cook;
  const days = cooking && cooking.cook_days;
  if (!days || !days.length) return true;
  return days.includes(DAYS[dayIdx]);
}

// Does a scheduled meal still fit a day's cooking time? Leftovers and assembly meals always fit; a cooked meal needs the
// day to allow cooking and its active minutes to fit. Returns { fits, why }.
export function mealFits(recipe, meal, { canCook, minutes, slot }) {
  if (!recipe || !meal || !meal.recipe) return { fits: true, why: '' };
  if (meal.source === 'leftover') return { fits: true, why: 'leftovers, no cooking' };
  const snack = isSnackSlot(slot || meal.slot);
  const active = Number(recipe.active_min) || 0;
  if (!canCook && !snack && !recipe.assembly_only && active > 10) return { fits: false, why: `needs ${active} minutes of cooking on a no-cooking day` };
  const avail = snack ? Math.min(15, minutes) : minutes;
  if (active > avail) return { fits: false, why: `needs ${active} active minutes, the day now has ${avail}` };
  return { fits: true, why: '' };
}

// allowCaution: only the swap sheet passes this, to rank the caution list a person can choose from by hand. The planner never does.
export function scoreRecipe({ recipe, check, cooking, dayIdx, canCook, minutes, recentIds, dayTotals, plan, foodsById, weekFoods, favorites, disliked, person, slot, allowCaution }) {
  if (check.verdict === 'fail') return { score: -Infinity, reasons: ['hard exclusion'] };
  if (check.verdict !== 'pass' && !allowCaution) return { score: -Infinity, reasons: ['not fully safe: ' + cautionWhy(check)] };
  if (disliked && disliked.includes(recipe.id)) return { score: -Infinity, reasons: ['marked never again'] };
  if (person && cuisineSkipped(recipe, person)) return { score: -Infinity, reasons: ['cuisine skipped'] };
  if (person && spiceSkipped(recipe, person)) return { score: -Infinity, reasons: ['too spicy for your setting'] };
  const reasons = [];
  let score = 100;
  // taste: the only signal that matters for a family. Favorites get a solid bonus.
  if (favorites && favorites.includes(recipe.id)) { score += 35; reasons.push('a favorite'); }
  if (person && cuisineLoved(recipe, person)) { score += 12; reasons.push('a cuisine you love'); }
  if (person) { const sb = spiceBonus(recipe, person); if (sb.bonus) { score += sb.bonus; reasons.push(sb.reason); } }
  // weight-gain goal: lean toward meals that carry more energy per serving
  if (person && person.goals && person.goals.calorie_target === 'gain') {
    const kcal = recipeTotals(recipe, foodsById).perServing.kcal || 0;
    if (kcal >= 550) { score += 10; reasons.push('a filling, energy-dense meal for your weight-gain goal'); }
    else if (kcal >= 400) { score += 5; reasons.push('a solid meal for your weight-gain goal'); }
  }
  // soft avoid
  for (const h of check.hits) { score -= 25; reasons.push(`contains ${h.label} (avoid)`); }
  for (const t of (check.termHits || []).filter(t => !t.hard)) { score -= 15; reasons.push(`contains "${t.term}" (your preference)`); }
  if (check.unknownRisk.length) { score -= 5; }
  // prefer
  score += Math.min(30, check.preferHits.length * 6);
  // time. Snacks are held to a short assembly window whatever the day allows.
  const snack = isSnackSlot(slot);
  const dayMinutes = typeof minutes === 'number' ? minutes : minutesAvailable(cooking, dayIdx);
  const avail = snack ? Math.min(15, dayMinutes) : dayMinutes;
  if (!canCook && !snack) {
    if (!recipe.assembly_only && (recipe.active_min || 0) > 10) { score -= 60; reasons.push('no time to cook that day'); }
  } else if ((recipe.active_min || 0) > avail) { score -= 40 + ((recipe.active_min - avail) * 1.5); reasons.push(`needs ${recipe.active_min} active minutes, you have ${avail}`); }
  // interest
  if (cooking.interest === 'assembly' && !recipe.assembly_only) { score -= 50; reasons.push('you asked for assembly-only meals'); }
  if (cooking.interest === 'minimal' && (recipe.active_min || 0) > 15) { score -= 20; }
  // skill
  const need = SKILL[recipe.skill] ?? 1, have = SKILL[cooking.skill] ?? 1;
  if (need > have) { score -= 30 * (need - have); reasons.push(`skill level ${recipe.skill}`); }
  // equipment
  const eq = new Set(cooking.equipment || []);
  for (const e of recipe.equipment || []) if (e !== 'none' && !eq.has(e)) { score -= 45; reasons.push(`needs ${e}`); }
  // budget: reward recipes that reuse ingredients already on this week's list (fewer distinct items to buy)
  if (cooking.budget && weekFoods && weekFoods.size) {
    const ings = (recipe.ingredients || []).map(i => i.food);
    const shared = ings.filter(f => weekFoods.has(f)).length;
    const bonus = Math.min(20, Math.round((shared / Math.max(1, ings.length)) * 25));
    score += bonus;
    if (shared) reasons.push(`reuses ${shared} ingredient${shared === 1 ? '' : 's'} already on the list`);
  }
  // variety
  const seen = recentIds.filter(id => id === recipe.id).length;
  const tol = cooking.leftovers === 'good' ? 6 : cooking.leftovers === 'poor' ? 40 : 18;
  score -= seen * tol;
  // daily nutrient limits: project the day's total with this recipe added
  if (plan && dayTotals) {
    const per = recipeTotals(recipe, foodsById).perServing;
    const projected = addTotals(dayTotals, per);
    const d = derived(projected);
    for (const [nut, lim] of Object.entries(plan.limits || {})) {
      const v = nut in d ? d[nut] : projected[nut];
      if (v == null) continue;
      if (v > lim.value) { score -= 35; reasons.push(`would push the day over the ${nut.replace(/_/g, ' ')} limit`); }
    }
  }
  return { score, reasons };
}

// A component (sauce, dressing, stock, dough, spice mix) is never a meal on its own.
// Why a recipe is caution rather than pass, in plain words. Only recipes that pass every check are ever planned.
export function cautionWhy(check) {
  const parts = [];
  const soft = (check.hits || []).filter(h => !h.hard).map(h => h.label);
  if (soft.length) parts.push('avoid: ' + soft.join(', '));
  const terms = (check.termHits || []).filter(t => !t.hard).map(t => t.term || t.label).filter(Boolean);
  if (terms.length) parts.push('avoid word: ' + [...new Set(terms)].join(', '));
  if (check.verifyLabel && check.verifyLabel.length) parts.push('label must be checked for ' + check.verifyLabel.map(v => v.label).join(', '));
  // P1-3: salt while the plan has a daily sodium limit: a food or label high in salt, or a recipe line whose sodium is not counted.
  if (check.sodium && check.sodium.length) {
    const s = check.sodium[0], limit = Number(s.limit).toLocaleString('en-US');
    parts.push(s.uncounted ? 'salty ingredients with no sodium numbers (' + [...s.terms, ...s.mayTerms].slice(0, 3).join(', ') + '): the app cannot count this toward the ' + limit + ' mg a day sodium limit'
      : (s.terms.length ? 'high in salt' : 'can be high in salt') + ': count its sodium toward the ' + limit + ' mg a day limit');
  }
  if (check.exceeds && check.exceeds.length) parts.push('one serving is over the daily ' + check.exceeds.map(e => String(e.nutrient).replace(/_(mg|mcg|g|kcal)$/, '').replace(/_/g, ' ')).join(', '));
  if (check.notApproved && check.notApproved.length) parts.push('not on the approved list: ' + [...new Set(check.notApproved.map(n => n.label))].slice(0, 3).join(', ') + (check.notApproved.some(n => n.why === 'reacts') ? ' (you reacted to it)' : ''));
  if (check.smallServe && check.smallServe.length) parts.push('several small serves in one meal: ' + [...new Set(check.smallServe.flatMap(s => s.terms))].join(', '));
  if (check.unknownRisk && check.unknownRisk.length) parts.push('could hide something: ' + [...new Set(check.unknownRisk.map(u => u.term))].slice(0, 3).join(', '));
  // raw ingredient lines can be long; keep the first few words of each
  if (check.unrecognized && check.unrecognized.length) parts.push('ingredient not recognized: ' + check.unrecognized.slice(0, 3).map(u => { const w = String(u).split(/\s+/); return w.length > 5 ? w.slice(0, 5).join(' ') + '…' : u; }).join(', '));
  return parts.join('; ') || 'needs a look';
}

// True when the plan carries a freshness rule (mcas-freshness): cook fresh, no planned leftovers.
export function planNoLeftovers(plan) { return !!(plan && (plan.behavior || []).some(b => (b.rule || b.id) === 'mcas-freshness')); }
export function isComponent(r) { return Array.isArray(r.meal) && r.meal.length === 1 && r.meal[0] === 'component'; }

// Recipes without nutrition numbers (2026-09 audit, owner question 5, September 30): the app cannot count them toward
// a daily limit, so the planner never schedules them for anyone whose plan carries one, even when the person has
// favorited them or switched on "Also use recipes that have no nutrition numbers". Without a limit, they are used only
// when favorited or switched on. A person can still pick one by hand for a meal.
export function plannerHasNutrition(r) { return !!(r.nutrition_per_serving && r.nutrition_source) || (r.ingredients || []).some(i => i.food); }
export function plannerHasLimits(plan) { return Object.keys((plan && plan.limits) || {}).length > 0; }
export function plannerMayUse(r, person, plan) {
  if (plannerHasNutrition(r)) return true;
  if (plannerHasLimits(plan)) return false;
  const favorites = (person && person.favorites && person.favorites.recipes) || [];
  return favorites.includes(r.id) || !!(person && person.cooking && person.cooking.include_unknown_nutrition);
}

// dayOverrides: { 'YYYY-MM-DD': { can_cook, minutes } } for this week only; snacksPerDay: this week's snack count, if set.
export function buildWeekPlan({ person, plan, recipes, foodsById, matcher, startDate = new Date(), seed = 0, slots, dayOverrides, snacksPerDay }) {
  const cooking = person.cooking || {};
  const overrides = dayOverrides || {};
  const favorites = (person.favorites && person.favorites.recipes) || [];
  const disliked = (person.disliked && person.disliked.recipes) || [];
  const rnd = mulberry32(hashStr(person.id + '|' + startDate.toISOString().slice(0, 10) + '|' + seed));
  const daySlotList = slots || daySlots(person, plan, snacksPerDay);
  // Only recipes with known nutrition can be held to daily limits. Recipes without it (community imports whose
  // ingredients are not yet linked to foods) are scheduled only when the person has favorited them or switched them on,
  // and never when the plan has a daily limit (plannerMayUse).
  const hasNutrition = plannerHasNutrition;
  const meals = recipes.filter(r => !isComponent(r));
  const pool = meals.filter(r => plannerMayUse(r, person, plan) && !cuisineSkipped(r, person) && !spiceSkipped(r, person));
  const checks = new Map(pool.map(r => [r.id, checkRecipe(r, plan, matcher, foodsById, person)]));
  // Only recipes that pass every check are planned. Caution recipes (a soft avoid, a label to verify, an unrecognized
  // ingredient, a serving over a daily limit) stay in the library but never land on the table by default.
  const eligible = pool.filter(r => checks.get(r.id).verdict === 'pass' && !disliked.includes(r.id));
  const excluded = pool.filter(r => checks.get(r.id).verdict !== 'pass').map(r => {
    const c = checks.get(r.id);
    return c.verdict === 'fail'
      ? { id: r.id, name: r.name, verdict: 'fail', why: c.hits.filter(h => h.hard).map(h => h.label) }
      : { id: r.id, name: r.name, verdict: 'caution', why: [cautionWhy(c)] };
  });
  const skippedNoNutrition = meals.filter(r => !hasNutrition(r) && !plannerMayUse(r, person, plan)).length;   // only the no-numbers recipes, not those skipped for spice or cuisine
  const days = [];
  const recentIds = [];
  const leftovers = []; // {recipeId, servings, madeOn}
  const household = Math.max(1, Number(cooking.household) || 1);
  const perDay = person.servings_by_day || {}; // { 'sun': 4 } overrides for guests
  const unmet = [];
  const weekFoods = new Set();
  // A freshness rule (low histamine trial) means no planned leftovers: histamine rises in cooked food that sits.
  const noLeftovers = planNoLeftovers(plan);

  for (let i = 0; i < 7; i++) {
    const date = new Date(startDate.getTime() + i * 86400000);
    const dayIdx = date.getDay();
    const dateKey = date.toISOString().slice(0, 10);
    const ov = overrides[dateKey];
    const canCook = canCookOn(cooking, dayIdx, ov);
    const minutes = minutesAvailable(cooking, dayIdx, ov);
    const eaters = Math.max(1, Number(perDay[dateKey] || perDay[DAYS[dayIdx]] || household));
    let dayTotals = emptyTotals();
    const dayMeals = [];
    for (const slot of daySlotList) {
      const snack = isSnackSlot(slot);
      // use leftovers first on no-cook days, or when leftovers tolerance is good (never as a snack)
      const lo = snack || noLeftovers ? null : leftovers.find(l => l.servings >= eaters && (i - l.madeOn) <= 3 && recipeMeal(l.recipe, slot));
      if (lo && (!canCook || cooking.leftovers === 'good' && rnd() < 0.5)) {
        lo.servings -= eaters;
        const per = recipeTotals(lo.recipe, foodsById).perServing;
        dayTotals = addTotals(dayTotals, per);
        dayMeals.push({ slot, recipe: lo.recipe.id, name: lo.recipe.name, source: 'leftover', servings: eaters, check: summarize(checks.get(lo.recipe.id)) });
        recentIds.push(lo.recipe.id);
        continue;
      }
      const candidates = eligible.filter(r => recipeMeal(r, slot));
      const scored = candidates.map(r => {
        const check = checks.get(r.id);
        const s = scoreRecipe({ recipe: r, check, cooking, dayIdx, canCook, minutes, recentIds, dayTotals, plan, foodsById, weekFoods, favorites, disliked, person, slot });
        return { r, check, score: s.score + rnd() * 4, reasons: s.reasons };
      }).filter(x => x.score > -Infinity).sort((a, b) => b.score - a.score);
      if (!scored.length) { unmet.push({ date: dateKey, slot, why: 'no recipe fits' }); dayMeals.push({ slot, recipe: null, source: 'none' }); continue; }
      const pick = scored[0];
      const per = recipeTotals(pick.r, foodsById).perServing;
      dayTotals = addTotals(dayTotals, per);
      const batch = !noLeftovers && !snack && canCook && (cooking.leftovers !== 'poor') && (pick.r.leftovers === 'good' || pick.r.leftovers === 'ok');
      const servingsMade = batch ? Math.max(pick.r.servings || eaters, eaters * 2) : eaters;
      if (servingsMade > eaters) leftovers.push({ recipe: pick.r, servings: servingsMade - eaters, madeOn: i });
      for (const ing of pick.r.ingredients || []) if (ing.food) weekFoods.add(ing.food);
      dayMeals.push({ slot, recipe: pick.r.id, name: pick.r.name, source: pick.r.assembly_only ? 'assembly' : 'cook', servings: eaters, servingsMade, score: Math.round(pick.score), reasons: pick.reasons, check: summarize(pick.check) });
      recentIds.push(pick.r.id);
    }
    days.push({ date: dateKey, day: DAYS[dayIdx], canCook, eaters, minutes, overridden: !!ov, meals: dayMeals, totals: dayTotals });
  }
  return { days, excluded, unmet, eligibleCount: eligible.length, skippedNoNutrition, seed, slots: daySlotList, snacks: snackPlan(person, plan, snacksPerDay), noLeftovers };
}

// Picks new meals for the named slots of one day, leaving every other meal in the week exactly as it is.
// Used when a day's cooking time changes and only the meals that no longer fit are replaced. Returns
// { meals: [{slot, recipe, name, source, servings, servingsMade, score, reasons, check, repicked: true}], unmet: [slot] }.
export function repickSlots({ week, di, slots, person, plan, recipes, foodsById, matcher, canCook, minutes }) {
  const cooking = person.cooking || {};
  const favorites = (person.favorites && person.favorites.recipes) || [];
  const disliked = (person.disliked && person.disliked.recipes) || [];
  const day = week.days[di];
  const dayIdx = new Date(day.date + 'T00:00:00').getDay();
  const cc = typeof canCook === 'boolean' ? canCook : day.canCook;
  const mins = typeof minutes === 'number' ? minutes : day.minutes;
  const want = new Set(slots);
  const recentIds = week.days.flatMap(d => d.meals.filter(m => m.recipe && !(d === day && want.has(m.slot))).map(m => m.recipe));
  let dayTotals = emptyTotals();
  const byId = new Map(recipes.map(r => [r.id, r]));
  for (const m of day.meals) { if (want.has(m.slot) || !m.recipe) continue; const r = byId.get(m.recipe); if (r) dayTotals = addTotals(dayTotals, recipeTotals(r, foodsById).perServing); }
  const weekFoods = new Set();
  for (const d of week.days) for (const m of d.meals) { if (!m.recipe || (d === day && want.has(m.slot))) continue; const r = byId.get(m.recipe); for (const ing of (r && r.ingredients) || []) if (ing.food) weekFoods.add(ing.food); }
  const pool = recipes.filter(r => !isComponent(r) && plannerMayUse(r, person, plan) && !cuisineSkipped(r, person) && !spiceSkipped(r, person) && !disliked.includes(r.id));
  const rnd = mulberry32(hashStr(person.id + '|' + day.date + '|repick'));
  const meals = [];
  const unmet = [];
  for (const slot of slots) {
    const scored = [];
    for (const r of pool) {
      if (!recipeMeal(r, slot)) continue;
      const check = checkRecipe(r, plan, matcher, foodsById, person);
      if (check.verdict !== 'pass') continue;
      const s = scoreRecipe({ recipe: r, check, cooking, dayIdx, canCook: cc, minutes: mins, recentIds, dayTotals, plan, foodsById, weekFoods, favorites, disliked, person, slot });
      if (s.score === -Infinity) continue;
      scored.push({ r, check, score: s.score + rnd() * 4, reasons: s.reasons });
    }
    scored.sort((a, b) => b.score - a.score);
    if (!scored.length) { unmet.push(slot); meals.push({ slot, recipe: null, source: 'none', repicked: true }); continue; }
    const pick = scored[0];
    dayTotals = addTotals(dayTotals, recipeTotals(pick.r, foodsById).perServing);
    recentIds.push(pick.r.id);
    meals.push({ slot, recipe: pick.r.id, name: pick.r.name, source: pick.r.assembly_only ? 'assembly' : 'cook', servings: day.eaters, servingsMade: day.eaters, score: Math.round(pick.score), reasons: pick.reasons, check: summarize(pick.check), repicked: true });
  }
  return { meals, unmet };
}

// Does a recipe fit a slot? Snack slots take recipes tagged "snack"; components fit nothing.
export function recipeMeal(r, slot) {
  if (isComponent(r)) return false;
  const want = isSnackSlot(slot) ? 'snack' : slot;
  return !r.meal || !r.meal.length || r.meal.includes(want);
}
export function summarizeCheck(c) { return summarize(c); }
function summarize(c) { return { verdict: c.verdict, hits: c.hits.map(h => ({ tag: h.tag, label: h.label, hard: h.hard })), exceeds: c.exceeds.map(e => e.nutrient), nutritionUnknown: !!(c.perServing && c.perServing._missing && c.perServing._missing.kcal) && !c.perServing.kcal }; }
