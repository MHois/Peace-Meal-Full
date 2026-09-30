// The household week: one shared week for everyone at the table, planned seating by seating.
// A seating is one meal on one day and the people rostered for it. Each seating gets the strictest combined plan
// of its own eaters (group.js), so Tuesday dinner without the teenager is planned without the teenager's rules.
// Servings follow the roster; leftovers carry across seatings; the grocery list comes from the whole week.
import { buildGroupPlan } from './group.js';
import { checkRecipe } from './checker.js';
import { emptyTotals, addTotals, recipeTotals } from './nutrition.js';
import { cuisineSkipped } from './cuisine.js';
import { spiceSkipped, spicePreference } from './spice.js';
import { DAYS, daySlots, isSnackSlot, isComponent, recipeMeal, scoreRecipe, minutesAvailable, canCookOn, summarizeCheck, planNoLeftovers, plannerMayUse } from './planner.js';

export function householdDefaults() {
  return { cook: null, cook_by_date: {}, pattern: {}, roster: {}, snacks_per_day: 1, budget: true, seed: 0, day_overrides: {}, meal_overrides: {}, week_snapshot: null };
}
export function ensureHousehold(h) {
  const d = householdDefaults();
  if (!h || typeof h !== 'object') return d;
  for (const k of Object.keys(d)) if (h[k] === undefined) h[k] = d[k];
  return h;
}

// Slots in a household day. Snacks are a household setting (default one afternoon snack), not a per-person one.
export function householdSlots(h) { return daySlots(null, null, typeof h.snacks_per_day === 'number' ? h.snacks_per_day : 1); }

// The cook whose time, skill, and equipment shape a day: the per-date cook, else the household cook, else the first adult.
export function cookFor(h, people, date) {
  const byId = id => people.find(p => p.id === id);
  return byId((h.cook_by_date || {})[date]) || byId(h.cook) || people.find(p => p.adult !== false && !p.guest) || people[0] || null;
}

// Who is at a seating. An explicit roster entry for the date and slot wins; otherwise the person's usual weekly pattern
// (absent means in), and guests are out unless rostered in.
export function rosterFor(h, people, date, day, slot) {
  const explicit = h.roster && h.roster[date] && Array.isArray(h.roster[date][slot]) ? h.roster[date][slot] : null;
  if (explicit) return people.filter(p => explicit.includes(p.id));
  return people.filter(p => {
    if (p.guest) return false;
    const pat = h.pattern && h.pattern[p.id];
    if (!pat || !pat[day]) return true;
    return pat[day][slot] !== false;
  });
}
export function isRostered(h, people, person, date, day, slot) { return rosterFor(h, people, date, day, slot).some(p => p.id === person.id); }

export function seatingKey(eaters) { return eaters.map(p => p.id).sort().join('+'); }

const SPICE_RANK = { none: 0, mild: 1, medium: 2, hot: 3, any: 4 };

// One synthetic person that stands for a seating: every allergen, every avoid, the strictest spice level, every skipped
// cuisine, everyone's favorites and never-agains, and the cook's kitchen. Kids-only seatings are assembly-only.
export function seatingPerson(eaters, cook, opts = {}) {
  const union = f => [...new Set(eaters.flatMap(f))];
  const prefs = eaters.map(p => p.preferences || {});
  const spice = prefs.map(spiceFor).sort((a, b) => SPICE_RANK[a] - SPICE_RANK[b])[0] || 'any';
  const kidsOnly = eaters.length > 0 && eaters.every(p => p.adult === false);
  const cooking = { ...((cook && cook.cooking) || {}), household: eaters.length, budget: opts.budget !== false };
  if (kidsOnly) cooking.interest = 'assembly';
  return {
    id: 'hh:' + seatingKey(eaters), name: eaters.map(p => p.name).join(', '), adult: !kidsOnly, guest: false,
    allergens: union(p => p.allergens || []),
    preferences: { avoid_tags: union(p => (p.preferences || {}).avoid_tags || []), avoid_terms: union(p => (p.preferences || {}).avoid_terms || []), patterns: union(p => (p.preferences || {}).patterns || []), spice, cuisines_skip: union(p => (p.preferences || {}).cuisines_skip || []), cuisines_love: union(p => (p.preferences || {}).cuisines_love || []) },
    favorites: { recipes: union(p => (p.favorites && p.favorites.recipes) || []), foods: [] },
    disliked: { recipes: union(p => (p.disliked && p.disliked.recipes) || []), foods: [] },
    modules: [], medications: {}, tier2: {}, servings_by_day: {}, cooking, kidsOnly, eaters: eaters.map(p => p.id)
  };
}
function spiceFor(prefs) { return spicePreference({ preferences: prefs }); }

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hashStr(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

// Seatings share plans and recipe checks by eater set, so a week with four distinct combinations checks each recipe four times, not thirty.
export function makeSeatingCache({ conditions, dictionaries, matcher, foodsById, recipes, budget, today }) {
  const cache = new Map();
  const hasNutrition = r => !!(r.nutrition_per_serving && r.nutrition_source) || (r.ingredients || []).some(i => i.food);
  return {
    get(eaters, cook) {
      const key = seatingKey(eaters) + '|' + (cook ? cook.id : '') + '|' + eaters.filter(p => p.adult === false).length;
      if (cache.has(key)) return cache.get(key);
      const plan = buildGroupPlan({ people: eaters, conditions, dictionaries, today: today || new Date() });
      const sp = seatingPerson(eaters, cook, { budget });
      const favorites = sp.favorites.recipes, disliked = sp.disliked.recipes;
      const checks = new Map();
      const pool = [];
      for (const r of recipes) {
        if (isComponent(r)) continue;
        if (!plannerMayUse(r, sp, plan)) continue;   // no numbers: never for a seating where anyone has a daily limit
        if (disliked.includes(r.id) || cuisineSkipped(r, sp) || spiceSkipped(r, sp)) continue;
        const c = checkRecipe(r, plan, matcher, foodsById, sp);
        if (c.verdict !== 'pass') continue;   // only recipes that pass every eater's checks are ever seated
        checks.set(r.id, c);
        pool.push(r);
      }
      const entry = { key, plan, person: sp, pool, checks, names: eaters.map(p => p.name), ids: eaters.map(p => p.id), kidsOnly: sp.kidsOnly };
      cache.set(key, entry);
      return entry;
    },
    entries: () => [...cache.values()]
  };
}

// Picks the best recipe for one seating given the week so far. Shared by the builder and by re-picks.
function pickForSeating({ seating, slot, dayIdx, canCook, minutes, recentIds, dayTotals, weekFoods, foodsById, rnd }) {
  const { plan, person: sp, pool, checks } = seating;
  const cooking = sp.cooking;
  const favorites = sp.favorites.recipes, disliked = sp.disliked.recipes;
  let best = null;
  for (const r of pool) {
    if (!recipeMeal(r, slot)) continue;
    const s = scoreRecipe({ recipe: r, check: checks.get(r.id), cooking, dayIdx, canCook, minutes, recentIds, dayTotals, plan, foodsById, weekFoods, favorites, disliked, person: sp, slot });
    if (s.score === -Infinity) continue;
    const score = s.score + rnd() * 4;
    if (!best || score > best.score) best = { r, score, reasons: s.reasons, check: checks.get(r.id) };
  }
  return best;
}

// Builds the household week. people: everyone in the profile (guests included; guests are out unless rostered in).
export function buildHouseholdWeek({ people, household, conditions, dictionaries, recipes, foodsById, matcher, startDate = new Date(), seed = 0, today }) {
  const h = ensureHousehold(household);
  const slots = householdSlots(h);
  const cache = makeSeatingCache({ conditions, dictionaries, matcher, foodsById, recipes, budget: h.budget !== false, today: today || startDate });
  const rnd = mulberry32(hashStr('household|' + startDate.toISOString().slice(0, 10) + '|' + seed));
  const days = [];
  const recentIds = [];
  const leftovers = [];   // { recipe, servings, madeOn, seatingKey }
  const weekFoods = new Set();
  const unmet = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(startDate.getTime() + i * 86400000);
    const dayIdx = date.getDay();
    const dateKey = date.toISOString().slice(0, 10);
    const day = DAYS[dayIdx];
    const cook = cookFor(h, people, dateKey);
    const ov = (h.day_overrides || {})[dateKey];
    const canCook = canCookOn((cook && cook.cooking) || {}, dayIdx, ov);
    const minutes = minutesAvailable((cook && cook.cooking) || {}, dayIdx, ov);
    let dayTotals = emptyTotals();
    const meals = [];
    for (const slot of slots) {
      const eaters = rosterFor(h, people, dateKey, day, slot);
      if (!eaters.length) { meals.push({ slot, recipe: null, source: 'none', eaters: [], names: [] }); continue; }
      const seating = cache.get(eaters, cook);
      const snack = isSnackSlot(slot);
      const mealCanCook = canCook && !seating.kidsOnly;
      // leftovers first when there is enough for everyone at this seating and the dish clears every eater's rules
      const fresh = planNoLeftovers(seating.plan);   // any eater on a freshness rule: this seating takes no leftovers and batches nothing
      const lo = snack || fresh ? null : leftovers.find(l => l.servings >= eaters.length && (i - l.madeOn) <= 3 && recipeMeal(l.recipe, slot) && seating.checks.has(l.recipe.id));
      if (lo && (!mealCanCook || ((cook && cook.cooking && cook.cooking.leftovers) === 'good' && rnd() < 0.5))) {
        lo.servings -= eaters.length;
        dayTotals = addTotals(dayTotals, recipeTotals(lo.recipe, foodsById).perServing);
        meals.push({ slot, recipe: lo.recipe.id, name: lo.recipe.name, source: 'leftover', servings: eaters.length, eaters: seating.ids, names: seating.names, seating: seating.key, check: summarizeCheck(seating.checks.get(lo.recipe.id)), kidsOnly: seating.kidsOnly });
        recentIds.push(lo.recipe.id);
        continue;
      }
      const pick = pickForSeating({ seating, slot, dayIdx, canCook: mealCanCook, minutes, recentIds, dayTotals, weekFoods, foodsById, rnd });
      if (!pick) { unmet.push({ date: dateKey, slot, names: seating.names }); meals.push({ slot, recipe: null, source: 'none', eaters: seating.ids, names: seating.names, seating: seating.key }); continue; }
      dayTotals = addTotals(dayTotals, recipeTotals(pick.r, foodsById).perServing);
      const lt = (cook && cook.cooking && cook.cooking.leftovers) || 'ok';
      const batch = !fresh && !snack && mealCanCook && lt !== 'poor' && (pick.r.leftovers === 'good' || pick.r.leftovers === 'ok');
      const servingsMade = batch ? Math.max(pick.r.servings || eaters.length, eaters.length * 2) : eaters.length;
      if (servingsMade > eaters.length) leftovers.push({ recipe: pick.r, servings: servingsMade - eaters.length, madeOn: i });
      for (const ing of pick.r.ingredients || []) if (ing.food) weekFoods.add(ing.food);
      meals.push({ slot, recipe: pick.r.id, name: pick.r.name, source: pick.r.assembly_only ? 'assembly' : 'cook', servings: eaters.length, servingsMade, eaters: seating.ids, names: seating.names, seating: seating.key, score: Math.round(pick.score), reasons: pick.reasons, check: summarizeCheck(pick.check), kidsOnly: seating.kidsOnly });
      recentIds.push(pick.r.id);
    }
    days.push({ date: dateKey, day, cook: cook ? cook.id : null, cookName: cook ? cook.name : '', canCook, minutes, overridden: !!ov, meals, totals: dayTotals });
  }
  const seatings = cache.entries().map(s => ({ key: s.key, names: s.names, ids: s.ids, eligible: s.pool.length, kidsOnly: s.kidsOnly, plan: s.plan, person: s.person }));
  return { days, slots, unmet, seed, seatings, cache };
}

// Re-picks the named slots of one day of a household week for their current eaters, leaving everything else as it is.
// Returns { meals } in slot order (recipe null when nothing fits). Does not mutate the week.
export function householdRepick({ week, di, slots, people, household, conditions, dictionaries, recipes, foodsById, matcher, canCook, minutes }) {
  const h = ensureHousehold(household);
  const day = week.days[di];
  const dayIdx = new Date(day.date + 'T00:00:00').getDay();
  const cook = cookFor(h, people, day.date);
  const cc = typeof canCook === 'boolean' ? canCook : day.canCook;
  const mins = typeof minutes === 'number' ? minutes : day.minutes;
  const cache = week.cache || makeSeatingCache({ conditions, dictionaries, matcher, foodsById, recipes, budget: h.budget !== false });
  const want = new Set(slots);
  const byId = new Map(recipes.map(r => [r.id, r]));
  const recentIds = week.days.flatMap(d => d.meals.filter(m => m.recipe && !(d === day && want.has(m.slot))).map(m => m.recipe));
  let dayTotals = emptyTotals();
  for (const m of day.meals) { if (want.has(m.slot) || !m.recipe) continue; const r = byId.get(m.recipe); if (r) dayTotals = addTotals(dayTotals, recipeTotals(r, foodsById).perServing); }
  const weekFoods = new Set();
  for (const d of week.days) for (const m of d.meals) { if (!m.recipe || (d === day && want.has(m.slot))) continue; const r = byId.get(m.recipe); for (const ing of (r && r.ingredients) || []) if (ing.food) weekFoods.add(ing.food); }
  const rnd = mulberry32(hashStr('household|' + day.date + '|repick|' + slots.join(',')));
  const meals = [];
  for (const slot of slots) {
    const eaters = rosterFor(h, people, day.date, day.day, slot);
    if (!eaters.length) { meals.push({ slot, recipe: null, source: 'none', eaters: [], names: [], repicked: true }); continue; }
    const seating = cache.get(eaters, cook);
    const pick = pickForSeating({ seating, slot, dayIdx, canCook: cc && !seating.kidsOnly, minutes: mins, recentIds, dayTotals, weekFoods, foodsById, rnd });
    if (!pick) { meals.push({ slot, recipe: null, source: 'none', eaters: seating.ids, names: seating.names, seating: seating.key, repicked: true }); continue; }
    dayTotals = addTotals(dayTotals, recipeTotals(pick.r, foodsById).perServing);
    recentIds.push(pick.r.id);
    meals.push({ slot, recipe: pick.r.id, name: pick.r.name, source: pick.r.assembly_only ? 'assembly' : 'cook', servings: eaters.length, servingsMade: eaters.length, eaters: seating.ids, names: seating.names, seating: seating.key, score: Math.round(pick.score), reasons: pick.reasons, check: summarizeCheck(pick.check), kidsOnly: seating.kidsOnly, repicked: true });
  }
  return { meals };
}

// Top alternatives for one seating (a swap list), scored the way the builder scores. Does not mutate the week.
export function householdCandidates({ week, di, slot, people, household, recipes, foodsById, n = 5, exclude }) {
  const h = ensureHousehold(household);
  const day = week.days[di];
  const dayIdx = new Date(day.date + 'T00:00:00').getDay();
  const cook = cookFor(h, people, day.date);
  const eaters = rosterFor(h, people, day.date, day.day, slot);
  if (!eaters.length || !week.cache) return { eaters: [], seating: null, rows: [] };
  const seating = week.cache.get(eaters, cook);
  const byId = new Map(recipes.map(r => [r.id, r]));
  const recentIds = week.days.flatMap(d => d.meals.filter(m => m.recipe && !(d === day && m.slot === slot)).map(m => m.recipe));
  let dayTotals = emptyTotals();
  for (const m of day.meals) { if (m.slot === slot || !m.recipe) continue; const r = byId.get(m.recipe); if (r) dayTotals = addTotals(dayTotals, recipeTotals(r, foodsById).perServing); }
  const weekFoods = new Set();
  for (const d of week.days) for (const m of d.meals) { if (!m.recipe || (d === day && m.slot === slot)) continue; const r = byId.get(m.recipe); for (const ing of (r && r.ingredients) || []) if (ing.food) weekFoods.add(ing.food); }
  const sp = seating.person;
  const rows = [];
  for (const r of seating.pool) {
    if (!recipeMeal(r, slot) || r.id === exclude) continue;
    const s = scoreRecipe({ recipe: r, check: seating.checks.get(r.id), cooking: sp.cooking, dayIdx, canCook: day.canCook && !seating.kidsOnly, minutes: day.minutes, recentIds, dayTotals, plan: seating.plan, foodsById, weekFoods, favorites: sp.favorites.recipes, disliked: sp.disliked.recipes, person: sp, slot });
    if (s.score === -Infinity) continue;
    rows.push({ r, score: s.score, reasons: s.reasons, check: seating.checks.get(r.id) });
  }
  rows.sort((a, b) => b.score - a.score);
  return { eaters, seating, rows: rows.slice(0, n) };
}
