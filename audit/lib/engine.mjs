// Loads the app's own engine and data the same way the app's tests do. Nothing here changes the app.
import fs from 'node:fs';
import { buildMatcher } from '../../src/engine/dictionary.js';
import { buildPlan } from '../../src/engine/plan.js';
import { checkText, checkRecipe, checkFood } from '../../src/engine/checker.js';

const ROOT = new URL('../../', import.meta.url);
export const J = f => JSON.parse(fs.readFileSync(new URL('data/' + f, ROOT), 'utf8'));
export const conditionsFile = J('conditions.json');
export const conditions = conditionsFile.modules;
export const dictionaries = J('dictionaries.json');
export const dietLists = J('diet-lists.json');
export const foods = J('foods.json');
export const foodsById = new Map(foods.map(f => [f.id, f]));
export const matcher = buildMatcher(dictionaries);
matcher.dietLists = dietLists;

// A made-up adult with nothing on file. Every test person is invented.
export function person(extra = {}) {
  return { id: 'audit-1', name: 'Audit Person', adult: true, age: 45, sex: 'female', modules: [], allergens: [], allergens_other: [],
    preferences: { avoid_tags: [], avoid_terms: [], patterns: [] }, medications: {}, tier2: {}, phases: {}, ...extra };
}
export const planFor = (p, today = new Date('2026-09-30')) => buildPlan({ person: p, conditions, dictionaries, today });

// The profiles the corpus is run against: one allergy or condition each.
export const PROFILES = {
  milk: () => person({ allergens: ['allergen-milk'] }),
  egg: () => person({ allergens: ['allergen-egg'] }),
  fish: () => person({ allergens: ['allergen-fish'] }),
  crustacean: () => person({ allergens: ['allergen-crustacean'] }),
  'tree-nut': () => person({ allergens: ['allergen-tree-nut'] }),
  peanut: () => person({ allergens: ['allergen-peanut'] }),
  wheat: () => person({ allergens: ['allergen-wheat'] }),
  soy: () => person({ allergens: ['allergen-soy'] }),
  sesame: () => person({ allergens: ['allergen-sesame'] }),
  celiac: () => person({ modules: ['celiac'] })
};

const planCache = new Map();
export function profilePlan(key) {
  if (!planCache.has(key)) { const p = PROFILES[key](); planCache.set(key, { p, plan: planFor(p) }); }
  return planCache.get(key);
}
export function checkFor(key, text) {
  const { p, plan } = profilePlan(key);
  return checkText(text, plan, matcher, p);
}
export { checkText, checkRecipe, checkFood, buildPlan };
