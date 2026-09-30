// Checks foods, ingredient text, and recipes against a plan.
// Verdicts: fail (hard exclusion hit), caution (soft avoid, a word to check on the label, an ingredient not on a strict
// approved list, several 'small serve' foods in one meal, or unknown or unrecognized text while the plan restricts
// anything), pass.
// Unrecognized text is always reported. It is never counted as safe (README safety rule 7).
import { strictCheck, strictCheckText, portionCheck, portionCheckText } from './dietlists.js';
import { segmentTextRaw } from './dictionary.js';
import { recipeTotals, derived, round } from './nutrition.js';

function evaluateTags(tagMap, plan, matcher, opts = {}) {
  const hits = [];
  const preferHits = [];
  for (const [tag, terms] of Object.entries(tagMap)) {
    const av = plan.avoid && plan.avoid[tag];
    if (av) hits.push({ tag, label: matcher ? matcher.tagLabel(tag) : tag, hard: !!av.hard, terms: Array.isArray(terms) ? terms : [], rules: av.rules });
    if (plan.prefer && plan.prefer[tag]) preferHits.push({ tag, label: matcher ? matcher.tagLabel(tag) : tag, rules: plan.prefer[tag].rules });
  }
  hits.sort((a, b) => (b.hard - a.hard));
  return { hits, preferHits };
}

// True when the plan restricts food for a medical reason: an allergen on file, an avoid rule from a condition, pattern,
// or allergy (a personal preference alone does not count), or a daily or per-meal limit. While this is true, text the
// dictionary cannot place is a caution, because it could be the very thing the plan restricts.
export function planRestricts(plan, person = {}) {
  if (person && ((person.allergens && person.allergens.length) || otherAllergies(person).length)) return true;
  for (const a of Object.values((plan && plan.avoid) || {})) {
    const rules = (a && a.rules) || [];
    if ((a && a.hard) || !rules.length || rules.some(r => !r.preference)) return true;
  }
  if (plan && plan.limits && Object.keys(plan.limits).length) return true;
  for (const per of Object.values((plan && plan.periodic) || {})) if (per && per.limits && Object.keys(per.limits).length) return true;
  return false;
}

export function verdictFrom({ hits, unknownRisk, unrecognized, hasAllergens, restricting, termHits, verifyLabel, notApproved, smallServe }) {
  if (hits.some(h => h.hard) || (termHits || []).some(t => t.hard)) return 'fail';
  if (hits.length || (termHits || []).length) return 'caution';
  if (verifyLabel && verifyLabel.length) return 'caution';
  if (notApproved && notApproved.length) return 'caution';
  if (smallServe && smallServe.length) return 'caution';
  const guarded = !!(hasAllergens || restricting);
  if (unknownRisk && unknownRisk.length && guarded) return 'caution';
  if (unrecognized && unrecognized.length && guarded) return 'caution';
  return 'pass';
}

// Ingredients that often, but not always, carry a restricted tag: the label must be checked; never counted as passing.
function verifyLabelHits(mayContain, plan, matcher) {
  const out = [];
  for (const [tag, terms] of Object.entries(mayContain || {})) {
    const av = plan.avoid && plan.avoid[tag];
    if (av) out.push({ tag, label: matcher ? matcher.tagLabel(tag) : tag, hard: !!av.hard, terms, rules: av.rules });
  }
  return out;
}

export function checkText(text, plan, matcher, person = {}) {
  const r = matcher.tagText(text);
  const { hits, preferHits } = evaluateTags(r.tags, plan, matcher);
  const hasAllergens = !!((person.allergens && person.allergens.length) || otherAllergies(person).length);
  const restricting = planRestricts(plan, person);
  const termHits = [...matchOtherAllergies(text, person), ...matchAvoidTerms(text, person)];
  const verifyLabel = verifyLabelHits(r.mayContain, plan, matcher);
  // Strict mode (approved-food lists) applies to a label the same way it applies to a recipe: every piece of the
  // ingredient statement must be on the list. A piece that is only an amount ("7 ounces") is approved as empty, but it
  // still meets the leave-out examples, so "1 jar (7 ounces) roasted red peppers" keeps its "jar".
  const raw = segmentTextRaw(text);
  const strict = matcher.dietLists ? strictCheckText(raw, plan, matcher.dietLists, person) : { families: [], notApproved: [] };
  const portions = matcher.dietLists ? portionCheckText(raw, plan, matcher.dietLists) : { notes: [], stacked: [] };
  const verdict = verdictFrom({ hits, unknownRisk: r.unknownRisk, unrecognized: r.unrecognized, hasAllergens, restricting, termHits, verifyLabel, notApproved: strict.notApproved, smallServe: portions.stacked });
  return { verdict, hits, preferHits, termHits, verifyLabel, unknownRisk: r.unknownRisk, unrecognized: r.unrecognized, unplaced: r.unplaced || [], notes: r.notes, tags: r.tags, mayContain: r.mayContain, segments: r.segments, restricting, strictFamilies: strict.families, notApproved: strict.notApproved, portionNotes: portions.notes, smallServe: portions.stacked };
}

// Other allergies (owner decision, September 30, 2026): foods outside the nine major allergens that a person typed on
// the Allergies step, such as kiwi or mustard. Each is a hard stop like the nine (food-allergies rule allergen-custom),
// and having any turns on the unknown-ingredient caution, because US labels need not name them and they can sit
// inside "spices" or "natural flavors". Matching is deliberately broad: any ingredient text that contains the word
// counts ("corn" also catches "popcorn" and "cornstarch"). A word of three letters or fewer must start a word, so
// "oat" catches "oats" and "oatmeal" but not "goat".
export function otherAllergies(person) {
  return [...new Set(((person && person.allergens_other) || []).map(x => String(x || '').trim().toLowerCase()).filter(x => x.length >= 2))];
}

function allergyTermRe(term) {
  const e = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(term.length <= 3 ? '(^|[^a-z])' + e : e);
}

export function matchOtherAllergies(text, person) {
  const t = String(text || '').toLowerCase();
  return otherAllergies(person).filter(a => allergyTermRe(a).test(t)).map(term => ({ term, hard: true, allergy: true }));
}

// Ingredient words and food names that other allergies are matched against: a linked food with no display text is still
// checked by its own name.
function recipeWordsText(recipe, foodsById) {
  return [recipe.name, ...(recipe.ingredients || []).map(i => { const f = foodsById && foodsById.get(i.food); return [i.display || '', f ? (f.name || '') + ' ' + (f.short || '') : ''].join(' '); })].join(' ');
}

function matchAvoidTerms(text, person) {
  const terms = (person.preferences && person.preferences.avoid_terms) || [];
  const t = String(text || '').toLowerCase();
  return terms.filter(x => x && t.includes(String(x).toLowerCase())).map(term => ({ term, hard: false }));
}

export function checkFood(food, plan, matcher, person = {}) {
  const tagMap = {};
  for (const tag of food.tags || []) tagMap[tag] = [food.short || food.name];
  const { hits, preferHits } = evaluateTags(tagMap, plan, matcher);
  const termHits = [...matchOtherAllergies(food.name + ' ' + (food.short || ''), person), ...matchAvoidTerms(food.name + ' ' + (food.short || ''), person)];
  // Strict mode applies to a single food the same way it applies to a recipe ingredient (2026-09 audit): the Check
  // screen's two boxes must not disagree about the same food.
  const one = { ingredients: [{ food: food.id }] }, byId = new Map([[food.id, food]]);
  const strict = matcher && matcher.dietLists ? strictCheck(one, plan, matcher.dietLists, byId, person) : { families: [], notApproved: [] };
  const portions = matcher && matcher.dietLists ? portionCheck(one, plan, matcher.dietLists, byId) : { notes: [], stacked: [] };
  const verdict = verdictFrom({ hits, unknownRisk: [], unrecognized: [], hasAllergens: false, termHits, notApproved: strict.notApproved, smallServe: portions.stacked });
  return { verdict, hits, preferHits, termHits, tags: tagMap, strictFamilies: strict.families, notApproved: strict.notApproved, portionNotes: portions.notes, smallServe: portions.stacked };
}

export function checkRecipe(recipe, plan, matcher, foodsById, person = {}) {
  const tagMap = {};
  const addTag = (tag, src) => { if (!tagMap[tag]) tagMap[tag] = []; if (!tagMap[tag].includes(src)) tagMap[tag].push(src); };
  const unknownRisk = [];
  const unrecognized = [];
  const mayContain = {};
  for (const ing of recipe.ingredients || []) {
    const food = foodsById.get(ing.food);
    const label = ing.display || (food ? food.short || food.name : ing.food);
    if (food) for (const tag of food.tags || []) addTag(tag, label);
    // display text goes through the dictionary too (e.g. "soy sauce" as display on a generic food)
    if (matcher && ing.display) {
      const r = matcher.tagText(ing.display);
      for (const tag of Object.keys(r.tags)) addTag(tag, label);
      for (const [tag, terms] of Object.entries(r.mayContain || {})) (mayContain[tag] ||= []).push(...terms);
      for (const u of r.unknownRisk) unknownRisk.push(u);
      if (!food && r.unrecognized.length) unrecognized.push(label);
    }
    if (!food && !ing.display) unrecognized.push(ing.food);
  }
  for (const tag of recipe.tags || []) addTag(tag, 'recipe');
  const { hits, preferHits } = evaluateTags(tagMap, plan, matcher);
  const termHits = [...matchOtherAllergies(recipeWordsText(recipe, foodsById), person), ...matchAvoidTerms(recipe.name + ' ' + (recipe.ingredients || []).map(i => i.display || '').join(' '), person)];
  const hasAllergens = !!((person.allergens && person.allergens.length) || otherAllergies(person).length);
  const restricting = planRestricts(plan, person);
  for (const t of Object.keys(tagMap)) delete mayContain[t];
  const verifyLabel = verifyLabelHits(mayContain, plan, matcher);
  const verdict = verdictFrom({ hits, unknownRisk, unrecognized, hasAllergens, restricting, termHits, verifyLabel });
  const nut = recipeTotals(recipe, foodsById);
  const perServing = nut.perServing;
  const d = derived(perServing);
  const vsLimits = [];
  for (const [n, lim] of Object.entries(plan.limits || {})) {
    const v = n in d ? d[n] : perServing[n];
    if (v == null) continue;
    vsLimits.push({ nutrient: n, perServing: round(v, 1), dailyLimit: lim.value, pctOfDaily: round(v / lim.value * 100), exceedsInOneServing: v > lim.value, missingData: !!(perServing._missing && perServing._missing[n]) });
  }
  const exceeds = vsLimits.filter(x => x.exceedsInOneServing);
  // Strict mode (approved-food lists): every ingredient must be on the family's list or the person's tolerated list.
  const strict = matcher && matcher.dietLists ? strictCheck(recipe, plan, matcher.dietLists, foodsById, person) : { families: [], notApproved: [] };
  // Portions (low FODMAP): notes for foods the list allows only in a limited amount, and a caution for several 'small
  // serve' foods in one meal.
  const portions = matcher && matcher.dietLists ? portionCheck(recipe, plan, matcher.dietLists, foodsById) : { notes: [], stacked: [] };
  const finalVerdict = (exceeds.length || strict.notApproved.length || portions.stacked.length) && verdict !== 'fail' ? 'caution' : verdict;
  return { verdict: finalVerdict, hits, preferHits, termHits, verifyLabel, unknownRisk, unrecognized, restricting, tags: tagMap, perServing, vsLimits, exceeds, missingFoods: nut.missingFoods, strictFamilies: strict.families, notApproved: strict.notApproved, portionNotes: portions.notes, smallServe: portions.stacked };
}
