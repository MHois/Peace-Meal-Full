// Phase 3, item 13: every pair of conditions and patterns in data/conditions.json, with every variant and mode.
//   - buildPlan never throws
//   - no contradictory numeric target without a notice (README rule 2)
//   - no Tier 2 number applied without a clinician value, and a visible notice when one is missing (README rule 3)
//   - pregnancy turns off what README rule 6 says, and keeps allergen and celiac rules on
// Results: audit/results/condition-pairs.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { conditions, person, planFor } from '../lib/engine.mjs';

// Every module with each of its variants and modes as a separate option.
const options = [];
for (const m of conditions) {
  const vs = (m.variants || []).map(v => v.id), ms = (m.modes || []).map(x => x.id);
  if (vs.length) for (const v of vs) options.push({ id: m.id, variant: v, key: m.id + '/' + v });
  else if (ms.length) for (const x of ms) options.push({ id: m.id, mode: x, key: m.id + '#' + x });
  else options.push({ id: m.id, key: m.id });
}
const base = { age: 52, sex: 'female', weight_kg: 72, height_cm: 165 };
function personWith(opts, extra = {}) {
  const variants = {}, modes = {};
  for (const o of opts) { if (o.variant) variants[o.id] = o.variant; if (o.mode) modes[o.id] = { mode: o.mode, since: '2026-09-28' }; }
  const allergens = opts.some(o => o.id === 'food-allergies') ? ['allergen-peanut'] : [];
  return person({ ...base, modules: [...new Set(opts.map(o => o.id))], variants, modes, allergens, ...extra });
}
const ruleById = new Map(conditions.flatMap(m => (m.rules || []).map(r => [m.id + ':' + r.id, r])));

// Contradiction: across the applied rules on one nutrient and period, the highest minimum is above the lowest maximum.
function contradictions(plan) {
  const out = [];
  const byNut = {};
  for (const a of plan.applied) {
    if (a.kind !== 'limit' && a.kind !== 'target') continue;
    const rule = ruleById.get(a.module + ':' + a.rule) || {};
    const nut = (rule.unit === 'percent_kcal' ? String(rule.nutrient).replace(/_(g|mg|ug|iu|ml)$/, '') + '_pct_kcal' : rule.nutrient) + '@' + (a.per || 'day');
    const e = byNut[nut] ||= { mins: [], maxs: [] };
    if (a.kind === 'target') {
      e.mins.push({ v: a.value, by: a.module + ':' + a.rule });
      if (rule.op === 'range' && rule.max != null && !a.clinician) e.maxs.push({ v: a.per_kg ? Math.round(rule.max * base.weight_kg * 10) / 10 : rule.max, by: a.module + ':' + a.rule + ' (range top)' });
    } else e.maxs.push({ v: a.value, by: a.module + ':' + a.rule });
  }
  for (const [nut, e] of Object.entries(byNut)) {
    if (!e.mins.length || !e.maxs.length) continue;
    const hi = e.mins.reduce((a, b) => b.v > a.v ? b : a), lo = e.maxs.reduce((a, b) => b.v < a.v ? b : a);
    if (hi.v > lo.v && hi.by.split(':')[0] !== lo.by.split(':')[0]) out.push({ nutrient: nut, min: hi, max: lo });
  }
  return out;
}
const noticed = (plan, nut) => plan.notices.some(n => ['target-above-limit', 'hard-conflict', 'hard-conflict-resolved', 'needs-ack'].includes(n.code) && (!n.nutrient || nut.startsWith(n.nutrient)));

const results = { options: options.length, plans: 0, throws: [], contradictionsWithoutNotice: [], tier2Unvalued: [], tier2NoNotice: [], pregnancy: [] };
const seen = new Set();
for (let i = 0; i < options.length; i++) for (let j = i; j < options.length; j++) {
  const a = options[i], b = options[j];
  if (i !== j && a.id === b.id) continue;
  const key = [a.key, b.key].sort().join(' + ');
  if (seen.has(key)) continue; seen.add(key);
  let plan;
  try { plan = planFor(personWith(i === j ? [a] : [a, b])); } catch (e) { results.throws.push({ pair: key, error: String(e.message) }); continue; }
  results.plans++;
  for (const c of contradictions(plan)) if (!noticed(plan, c.nutrient.split('@')[0])) results.contradictionsWithoutNotice.push({ pair: key, ...c, final: c.nutrient.endsWith('@day') ? { target: plan.targets[c.nutrient.split('@')[0]], limit: plan.limits[c.nutrient.split('@')[0]] && plan.limits[c.nutrient.split('@')[0]].value } : null });
  for (const x of plan.applied) if ((x.tier || 1) === 2 && (x.kind === 'limit' || x.kind === 'target') && !x.clinician) results.tier2Unvalued.push({ pair: key, rule: x.module + ':' + x.rule });
  if (plan.tier2.missing.length && !plan.notices.some(n => n.code === 'tier2-missing')) results.tier2NoNotice.push({ pair: key });
}

// Pregnancy (README rule 6): weight loss, ketogenic and very low carbohydrate patterns, intermittent fasting, and every
// elimination protocol except allergen and celiac rules are off. The app's own list of elimination protocols is
// ELIMINATION_MODULES in src/engine/plan.js (ibs-low-fodmap, mcas, low-carb-ketogenic, time-restricted-eating).
const MUST_BE_OFF = ['weight-management-glp1', 'low-carb-ketogenic', 'time-restricted-eating', 'ibs-low-fodmap', 'mcas'];
for (const o of options.filter(o => MUST_BE_OFF.includes(o.id))) {
  const plan = planFor(personWith([o], { pregnancy: true, age: 31 }));
  results.pregnancy.push({ option: o.key, stillActive: plan.modules.some(m => m.id === o.id), notices: plan.notices.filter(n => n.module === o.id).map(n => n.code) });
}
const keep = planFor(personWith([{ id: 'celiac', key: 'celiac' }, { id: 'food-allergies', key: 'food-allergies' }], { pregnancy: true, age: 31 }));
results.pregnancyKeeps = { celiac: keep.modules.some(m => m.id === 'celiac'), glutenAvoidHard: !!(keep.avoid.gluten && keep.avoid.gluten.hard), peanutAvoidHard: !!(keep.avoid['allergen-peanut'] && keep.avoid['allergen-peanut'].hard) };

fs.writeFileSync(new URL('../results/condition-pairs.json', import.meta.url), JSON.stringify(results, null, 1) + '\n');

test(`every pair of ${options.length} module options builds a plan without throwing`, () => {
  assert.deepEqual(results.throws, []);
  assert.ok(results.plans > 1000, `${results.plans} plans built`);
});
test('no contradictory numeric target without a notice (rule 2)', () => {
  assert.deepEqual(results.contradictionsWithoutNotice.map(c => `${c.pair}: ${c.nutrient} min ${c.min.v} (${c.min.by}) > max ${c.max.v} (${c.max.by})`), []);
});
test('no Tier 2 number without a clinician value, and a notice when one is missing (rule 3)', () => {
  assert.deepEqual(results.tier2Unvalued, []);
  assert.deepEqual(results.tier2NoNotice, []);
});
test('pregnancy turns off weight loss, keto and very low carb, intermittent fasting, and eliminations (rule 6)', () => {
  assert.deepEqual(results.pregnancy.filter(p => p.stillActive).map(p => p.option), []);
});
test('pregnancy keeps celiac and allergen rules on (rule 6)', () => {
  assert.deepEqual(results.pregnancyKeeps, { celiac: true, glutenAvoidHard: true, peanutAvoidHard: true });
});
