// UX pass, October 2026 (expert review, VERIFY-log U1): a target's upper number was always read as a cap, and two
// ranges kept the lower top. A 72-year-old on a GLP-1 medicine with the higher-protein module got protein "at least 80,
// at most 81.6 g", and every planned day was marked "over" protein. For protein and fiber the upper number is the top of
// the usual range (PROT-AGE: "at least in the range of 1.0 to 1.2"; fiber 25 g for women to 38 g for men). Caps the
// sources set (potassium, kidney-stone calcium, vitamin D, pregnancy fish) are unchanged. No number changed. Every
// person here is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPlan } from '../src/engine/plan.js';
import { compareToPlan } from '../src/engine/nutrition.js';

const J = f => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const C = J('conditions.json'), dictionaries = J('dictionaries.json');
const person = (modules, extra = {}) => ({ id: 't', name: 'Test Person', adult: true, age: 72, sex: 'female', weight_kg: 68, height_cm: 160, modules, allergens: [], preferences: { avoid_tags: [], avoid_terms: [] }, medications: {}, tier2: {}, phases: {}, modes: {}, acknowledged: [], flags: {}, variants: {}, optional_rules: [], rule_settings: {}, confirmations: [], custom_modules: [], ...extra });
const planOf = (modules, conditions = C.modules) => buildPlan({ person: person(modules), conditions, dictionaries, today: new Date('2026-10-08') });

test('exactly the protein and fiber ranges are marked as a usual range; the caps are not', () => {
  const marked = C.modules.flatMap(m => (m.rules || []).filter(r => r.upper === 'range-top').map(r => r.id)).sort();
  assert.deepEqual(marked, ['cons-fiber', 'gut-fiber', 'hp-per-meal', 'hp-protein-healthy', 'hp-protein-illness', 'osteo-protein', 'wm-glp1-protein']);
  for (const id of ['htn-potassium', 'stone-calcium', 'osteo-vitamin-d', 'preg-fish']) {
    const r = C.modules.flatMap(m => m.rules || []).find(x => x.id === id);
    assert.equal(r.upper, undefined, id + ' stays a cap');
  }
});

test('GLP-1 protein with the higher-protein module: at least 80 g, usual range up to 120 g', () => {
  const t = planOf(['weight-management-glp1', 'higher-protein-older-adult']).targets.protein_g;
  assert.equal(t.min, 80);
  assert.equal(t.max, 120, 'not 81.6, the lower of the two tops');
  assert.equal(t.maxIsTop, true);
});

test('a day above a usual top is not "over"; a day below the minimum is still "under"', () => {
  const plan = planOf(['weight-management-glp1', 'higher-protein-older-adult']);
  for (const v of [99.9, 130]) {
    const c = compareToPlan({ protein_g: v }, plan);
    assert.equal(c.over.length, 0, v + ' g');
    assert.equal(c.ok.length, 1, v + ' g');
  }
  assert.equal(compareToPlan({ protein_g: 70 }, plan).under.length, 1);
  assert.equal(compareToPlan({ fiber_g: 45 }, planOf(['constipation'])).over.length, 0, 'fiber above 38 is not over');
});

test('caps are unchanged: potassium above 5,000 mg is still over', () => {
  const plan = planOf(['hypertension']);
  assert.equal(plan.targets.potassium_mg.max, 5000);
  assert.equal(plan.targets.potassium_mg.maxIsTop, false);
  assert.equal(compareToPlan({ potassium_mg: 5500 }, plan).over.length, 1);
});

test('a cap always wins over a usual top for the same nutrient, in either order', () => {
  const mod = (id, rule) => ({ id, name: id, category: 'condition', evidence: { rating: 'moderate' }, rules: [{ id: id + '-r', kind: 'target', nutrient: 'fiber_g', op: 'range', per: 'day', tier: 1, strength: 'should', text: 't', sources: [], ...rule }] });
  const top = mod('mtop', { min: 25, max: 38, upper: 'range-top' }), cap = mod('mcap', { min: 20, max: 30 });
  for (const order of [[top, cap], [cap, top]]) {
    const t = planOf(order.map(m => m.id), order).targets.fiber_g;
    assert.equal(t.max, 30, order.map(m => m.id).join(' then '));
    assert.equal(t.maxIsTop, false);
  }
});

test('the GLP-1 range alone still reads 80 to 120 (the owner answer of September 2026 is unchanged)', () => {
  const t = planOf(['weight-management-glp1']).targets.protein_g;
  assert.equal(t.min, 80); assert.equal(t.max, 120);
});

test('the Plan says "usual range up to" for a usual top and "at most" for a cap', () => {
  const src = fs.readFileSync(new URL('../src/ui/plan.js', import.meta.url), 'utf8');
  assert.match(src, /t\.maxIsTop \? 'usual range up to' : 'at most'/);
});
