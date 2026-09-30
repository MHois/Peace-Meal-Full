// Weight-gain goal and the GLP-1 flag.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { energyTarget } from '../src/engine/energy.js';
import { buildPlan } from '../src/engine/plan.js';
import { snackPlan } from '../src/engine/planner.js';

const read = f => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const conditions = read('conditions.json');
const dictionaries = read('dictionaries.json');
// A made-up test person. Not based on anyone real.
const base = { id: 'test-a', name: 'Test Adult A', adult: true, sex: 'male', age: 67, weight_kg: 84, height_cm: 178, activity: 'light', modules: ['osteoarthritis'], allergens: [], preferences: { avoid_tags: [], avoid_terms: [], patterns: [] }, variants: {}, flags: {}, optional_rules: [], rule_settings: {}, confirmations: [], custom_modules: [], medications: {}, tier2: {}, goals: { calorie_target: 'off' }, cooking: {} };

test('energy target: gain adds 300 to 500 kcal, loss subtracts 500 to 750, both cite sources', () => {
  const m = energyTarget(base, { goal: 'maintain' });
  const g = energyTarget(base, { goal: 'gain', surplus: 400 });
  const l = energyTarget(base, { goal: 'loss', deficit: 500 });
  assert.equal(g.kcal, m.kcal + 400);
  assert.equal(energyTarget(base, { goal: 'gain', surplus: 900 }).kcal, m.kcal + 500, 'surplus is capped at 500');
  assert.equal(energyTarget(base, { goal: 'gain', surplus: 100 }).kcal, m.kcal + 300, 'surplus floor is 300');
  assert.equal(l.kcal, Math.max(1200, m.kcal - 500));
  assert.ok(g.sources.includes('espen-geriatrics-2022'));
  assert.ok(g.notes.some(n => /ESPEN/.test(n)), 'older adult note present at 67');
  assert.ok(!energyTarget({ ...base, age: 38 }, { goal: 'gain' }).notes.some(n => /ESPEN/.test(n)));
  const src = read('sources.json'); assert.ok((src.sources || src).some(s => s.id === 'espen-geriatrics-2022'));
});

test('GLP-1 flag turns the weight module on with the GLP-1 variant: guidance without the deficit rules', () => {
  const p = { ...base, flags: { glp1: true } };
  const plan = buildPlan({ person: p, conditions, dictionaries });
  assert.ok(plan.modules.some(m => m.id === 'weight-management-glp1'));
  const allRules = pl => [...(pl.applied || []), ...(pl.behavior || []), ...(pl.timing || []), ...(pl.info || [])].map(r => r.rule || r.id);
  const ids = allRules(plan);
  assert.ok(ids.some(id => /wm-glp1-meals/.test(id)), 'GLP-1 meal guidance applies');
  assert.ok(!ids.some(id => /wm-deficit|wm-target/.test(id)), 'no weight-loss deficit rule for a GLP-1 user who did not ask for loss');
  const chosen = { ...base, modules: ['weight-management-glp1'] };
  const plan2 = buildPlan({ person: chosen, conditions, dictionaries });
  const ids2 = allRules(plan2);
  assert.ok(ids2.some(id => /wm-deficit/.test(id)), 'ticking the module yourself keeps the default weight-loss variant');
});

test('gain goal defaults to two snacks a day', () => {
  assert.equal(snackPlan({ ...base, goals: { calorie_target: 'gain' } }, { modules: [] }).count, 2);
  assert.equal(snackPlan(base, { modules: [] }).count, 1);
});
