// P1-1 (audit of September 30, 2026): time-restricted eating stayed on in pregnancy and for a child's profile, because
// the "intermittent-fasting" feature mapped to no module. README safety rule 6: "Pregnancy disables weight loss,
// ketogenic and very low carbohydrate patterns, intermittent fasting, and every elimination protocol except allergen
// and celiac rules." These tests use the real data/conditions.json (the older plan tests use made-up modules).
// Every person here is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPlan } from '../src/engine/plan.js';

const J = f => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const conditions = J('conditions.json').modules;
const dictionaries = J('dictionaries.json');
const person = extra => ({ id: 't', name: 'Test Person', adult: true, age: 30, sex: 'female', modules: [], allergens: [], allergens_other: [], preferences: { avoid_tags: [], avoid_terms: [], patterns: [] }, medications: {}, tier2: {}, phases: {}, rule_settings: {}, ...extra });
const planOf = p => buildPlan({ person: p, conditions, dictionaries, today: new Date('2026-09-30') });
const off = (plan, id) => plan.notices.some(n => n.code === 'module-disabled' && n.module === id);
const ruleOn = (plan, prefix) => [...(plan.applied || []), ...Object.values(plan.avoid || {}).flatMap(a => a.rules || [])].some(r => (r.module || '').startsWith(prefix));

test('P1-1: pregnancy turns time-restricted eating off, with a notice', () => {
  const plan = planOf(person({ pregnancy: true, modules: ['time-restricted-eating'] }));
  assert.ok(off(plan, 'time-restricted-eating'), JSON.stringify(plan.notices.map(n => n.code + ':' + (n.module || ''))));
});

test('P1-1: breastfeeding does the same (the pregnancy module covers both)', () => {
  const plan = planOf(person({ breastfeeding: true, modules: ['time-restricted-eating'] }));
  assert.ok(off(plan, 'time-restricted-eating'));
});

test('P1-1: a child\'s profile turns time-restricted eating off', () => {
  const plan = planOf(person({ adult: false, age: 10, modules: ['time-restricted-eating'] }));
  assert.ok(off(plan, 'time-restricted-eating'));
});

test('P1-1: an adult who is not pregnant keeps it', () => {
  const plan = planOf(person({ modules: ['time-restricted-eating'] }));
  assert.ok(!off(plan, 'time-restricted-eating'));
});

test('rule 6 with the real modules: pregnancy turns off low FODMAP, low histamine, non-celiac gluten-free, weight loss, and keto; keeps celiac and allergies', () => {
  const plan = planOf(person({ pregnancy: true, modules: ['ibs-low-fodmap', 'mcas', 'gluten-free-non-celiac', 'weight-management-glp1', 'low-carb-ketogenic', 'celiac', 'time-restricted-eating'], allergens: ['allergen-peanut'] }));
  for (const id of ['ibs-low-fodmap', 'mcas', 'gluten-free-non-celiac', 'weight-management-glp1', 'low-carb-ketogenic', 'time-restricted-eating']) assert.ok(off(plan, id), id + ' is off');
  assert.ok(!off(plan, 'celiac'), 'celiac stays');
  assert.ok(plan.avoid['allergen-peanut'] && plan.avoid['allergen-peanut'].hard, 'the peanut allergy stays a hard stop');
  assert.ok(plan.avoid['gluten'], 'celiac still avoids gluten');
});
