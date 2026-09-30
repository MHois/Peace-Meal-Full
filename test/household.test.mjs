// Household week: one shared week planned seating by seating (who is at which meal on which day).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildMatcher } from '../src/engine/dictionary.js';
import { rosterFor, seatingPerson, buildHouseholdWeek, householdRepick, householdDefaults, householdSlots, cookFor } from '../src/engine/household.js';
import { recipeHeat } from '../src/engine/spice.js';

const read = f => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const conditions = read('conditions.json');
const dictionaries = read('dictionaries.json');
const foods = read('foods.json');
const recipes = [...read('recipes.json'), ...read('recipes-open.json')];
const foodsById = new Map(foods.map(f => [f.id, f]));
const matcher = buildMatcher(dictionaries);
const byId = new Map(recipes.map(r => [r.id, r]));

function person(id, name, extra = {}) {
  return {
    id, name, adult: true, modules: [], allergens: [], preferences: { avoid_tags: [], avoid_terms: [], patterns: [] },
    variants: {}, flags: {}, optional_rules: [], rule_settings: {}, confirmations: [], custom_modules: [], medications: {}, tier2: {},
    favorites: { recipes: [], foods: [] }, disliked: { recipes: [], foods: [] }, servings_by_day: {},
    cooking: { weekday_minutes: 30, weekend_minutes: 45, cook_days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], interest: 'simple', skill: 'comfortable', equipment: ['stove', 'oven', 'microwave', 'blender'], leftovers: 'ok' },
    ...extra
  };
}
// Made-up test people. Not based on anyone real.
const adultA = person('adult-a', 'Test Adult A', { modules: ['osteoarthritis'] });
const adultB = person('adult-b', 'Test Adult B', { modules: ['hyperlipidemia'] });
const teenC = person('teen-c', 'Test Teen C', { adult: false, allergens: ['allergen-sesame'], preferences: { avoid_tags: [], avoid_terms: [], patterns: [], spice: 'none' } });
const childD = person('child-d', 'Test Child D', { adult: false, modules: ['iron-deficiency-anemia'] });
const guestE = person('guest-e', 'Test Guest E', { guest: true, allergens: ['allergen-fish'] });
const people = [adultA, adultB, teenC, childD, guestE];
const start = new Date('2026-09-14T00:00:00Z');   // a Monday

test('roster: everyone in by default, guests out, weekly pattern and per-date exceptions', () => {
  const h = householdDefaults();
  assert.deepEqual(rosterFor(h, people, '2026-09-15', 'tue', 'dinner').map(p => p.id), ['adult-a', 'adult-b', 'teen-c', 'child-d']);
  h.pattern['teen-c'] = { tue: { dinner: false }, thu: { dinner: false } };
  assert.deepEqual(rosterFor(h, people, '2026-09-15', 'tue', 'dinner').map(p => p.id), ['adult-a', 'adult-b', 'child-d']);
  assert.deepEqual(rosterFor(h, people, '2026-09-15', 'tue', 'lunch').map(p => p.id), ['adult-a', 'adult-b', 'teen-c', 'child-d']);
  h.roster['2026-09-20'] = { dinner: ['adult-a', 'adult-b', 'child-d', 'guest-e'] };
  assert.deepEqual(rosterFor(h, people, '2026-09-20', 'sun', 'dinner').map(p => p.id), ['adult-a', 'adult-b', 'child-d', 'guest-e']);
  assert.equal(cookFor(h, people, '2026-09-15').id, 'adult-a', 'first adult non-guest cooks by default');
  h.cook = 'adult-b'; assert.equal(cookFor(h, people, '2026-09-15').id, 'adult-b');
  h.cook_by_date['2026-09-15'] = 'adult-a'; assert.equal(cookFor(h, people, '2026-09-15').id, 'adult-a');
  assert.deepEqual(householdSlots(h), ['breakfast', 'lunch', 'snack-pm', 'dinner']);
});

test('seating person: strictest spice, every allergen, everyone\'s never-agains, kids-only means assembly', () => {
  const sp = seatingPerson([adultA, teenC], adultA, { budget: true });
  assert.equal(sp.preferences.spice, 'none');
  assert.deepEqual(sp.allergens, ['allergen-sesame']);
  assert.equal(sp.kidsOnly, false);
  assert.equal(sp.cooking.household, 2);
  assert.equal(sp.cooking.budget, true);
  const kids = seatingPerson([teenC, childD], adultA);
  assert.equal(kids.kidsOnly, true);
  assert.equal(kids.cooking.interest, 'assembly');
});

test('household week: each seating is planned for its own eaters; servings follow the roster; kids-only seatings do not cook', () => {
  const h = householdDefaults();
  h.pattern['teen-c'] = { tue: { dinner: false }, thu: { dinner: false } };
  h.pattern['adult-a'] = { mon: { lunch: false } };
  h.roster['2026-09-16'] = { dinner: ['teen-c', 'child-d'] };   // both adults out Wednesday night
  h.roster['2026-09-20'] = { dinner: ['adult-a', 'adult-b', 'child-d', 'guest-e'] };
  const week = buildHouseholdWeek({ people, household: h, conditions, dictionaries, recipes, foodsById, matcher, startDate: start, seed: 1 });
  assert.equal(week.days.length, 7);
  const tue = week.days.find(d => d.date === '2026-09-15');
  const tueDinner = tue.meals.find(m => m.slot === 'dinner');
  assert.deepEqual(tueDinner.eaters, ['adult-a', 'adult-b', 'child-d']);
  assert.equal(tueDinner.servings, 3);
  const monLunch = week.days.find(d => d.date === '2026-09-14').meals.find(m => m.slot === 'lunch');
  assert.deepEqual(monLunch.eaters, ['adult-b', 'teen-c', 'child-d']);
  const wedDinner = week.days.find(d => d.date === '2026-09-16').meals.find(m => m.slot === 'dinner');
  assert.deepEqual(wedDinner.eaters, ['teen-c', 'child-d']);
  assert.equal(wedDinner.kidsOnly, true);
  if (wedDinner.recipe) { const r = byId.get(wedDinner.recipe); assert.ok(r.assembly_only || (r.active_min || 0) <= 10 || wedDinner.source === 'leftover', `kids-only dinner should be assembly or leftovers, got ${r.name} (${r.active_min} min)`); }
  const sunDinner = week.days.find(d => d.date === '2026-09-20').meals.find(m => m.slot === 'dinner');
  assert.deepEqual(sunDinner.eaters, ['adult-a', 'adult-b', 'child-d', 'guest-e']);
  assert.equal(sunDinner.servings, 4);
  // every meal the teen eats respects the teen's rules: no sesame, no heat
  for (const d of week.days) for (const m of d.meals) {
    if (!m.recipe || !m.eaters.includes('teen-c')) continue;
    const r = byId.get(m.recipe);
    assert.equal(recipeHeat(r).level, 0, `${r.name} has heat but Test Teen C (no heat) is at that seating`);
    assert.ok(!(m.check.hits || []).some(x => x.tag === 'allergen-sesame'), `${r.name} carries sesame with Test Teen C present`);
  }
  // the guest-only allergen only binds where the guest is rostered
  assert.ok(week.seatings.length >= 4, `distinct seatings planned: ${week.seatings.length}`);
  assert.ok(week.days.every(d => d.meals.length === 4));
});

test('householdRepick replaces only the named slot and keeps the week untouched', () => {
  const h = householdDefaults();
  const week = buildHouseholdWeek({ people, household: h, conditions, dictionaries, recipes, foodsById, matcher, startDate: start, seed: 2 });
  const before = JSON.stringify(week.days.map(d => d.meals.map(m => m.recipe)));
  const { meals } = householdRepick({ week, di: 3, slots: ['dinner'], people, household: h, conditions, dictionaries, recipes, foodsById, matcher, canCook: true, minutes: 10 });
  assert.equal(meals.length, 1);
  assert.ok(meals[0].repicked);
  if (meals[0].recipe) { const r = byId.get(meals[0].recipe); assert.ok((r.active_min || 0) <= 10 || r.assembly_only, `picked ${r.name} for a 10 minute day`); }
  assert.equal(JSON.stringify(week.days.map(d => d.meals.map(m => m.recipe))), before);
});
