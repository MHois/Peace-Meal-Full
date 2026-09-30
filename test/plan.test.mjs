import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan } from '../src/engine/plan.js';

const conditions = [
  { id: 'hypertension', name: 'Hypertension', category: 'condition', evidence: { rating: 'strong' }, sources: ['s1'],
    rules: [
      { id: 'htn-sodium', kind: 'limit', nutrient: 'sodium_mg', op: '<=', value: 2300, ideal: 1500, tier: 1, strength: 'must', text: 'Sodium under 2,300', sources: ['s1'] },
      { id: 'htn-potassium', kind: 'target', nutrient: 'potassium_mg', op: '>=', value: 3500, max: 5000, tier: 1, strength: 'should', text: 'Potassium 3,500 to 5,000', sources: ['s1'] },
      { id: 'htn-ssb', kind: 'avoid', tags: ['sugar-sweetened-beverage'], tier: 1, strength: 'should', text: 'Avoid SSB', sources: ['s1'] }
    ],
    conflicts: [ { with: 'pots', type: 'hard', param: 'sodium_mg', resolution: 'clinician', text: 'Opposite sodium advice.' }, { with: 'ckd', type: 'hard', param: 'potassium_mg', resolution: 'suppress:hypertension', text: 'CKD wins.' } ],
    medication_questions: [ { id: 'potassium_retaining', text: 'ACEi/ARB/MRA?', effect: 'suppress:htn-potassium' } ] },
  { id: 'pots', name: 'POTS', category: 'condition', evidence: { rating: 'limited' }, sources: ['s2'],
    tier2: [ { param: 'sodium_mg_min', label: 'Sodium target', consensus: '3 to 10 g/day', why: 'clinician sets' } ],
    rules: [ { id: 'pots-sodium', kind: 'target', nutrient: 'sodium_mg', op: '>=', value: 3000, tier: 2, strength: 'should', text: 'High sodium per clinician', sources: ['s2'] } ],
    conflicts: [ { with: 'hypertension', type: 'hard', param: 'sodium_mg', resolution: 'clinician', text: 'Opposite sodium advice.' } ] },
  { id: 'ckd', name: 'CKD', category: 'condition', evidence: { rating: 'strong' }, sources: ['s3'],
    rules: [ { id: 'ckd-protein', kind: 'limit', nutrient: 'protein_g', op: '<=', value: 0.8, per_kg: true, tier: 1, strength: 'should', text: '0.8 g/kg', sources: ['s3'] } ],
    conflicts: [ { with: 'hypertension', type: 'hard', param: 'potassium_mg', resolution: 'suppress:hypertension', text: 'CKD wins.' } ] },
  { id: 'ibs-low-fodmap', name: 'Low FODMAP', category: 'condition', evidence: { rating: 'moderate' }, sources: ['s4'],
    phases: [ { id: 'elimination', label: 'Elimination', min_weeks: 2, max_weeks: 6, rules: ['fm-elim'] }, { id: 'reintroduction', label: 'Reintroduction', min_weeks: 6, max_weeks: 8, rules: [] }, { id: 'personalization', label: 'Personalization', rules: [] } ],
    rules: [ { id: 'fm-elim', kind: 'avoid', tags: ['fodmap-fructan'], tier: 1, strength: 'should', text: 'Avoid fructans', sources: ['s4'] }, { id: 'fm-always', kind: 'behavior', text: 'Regular meals', tier: 1, strength: 'should', sources: ['s4'] } ] },
  { id: 'mcas', name: 'MCAS', category: 'condition', evidence: { rating: 'limited' }, sources: ['s5'], rules: [ { id: 'mc-1', kind: 'avoid', tags: ['histamine-high'], tier: 1, strength: 'may', text: 'trial', sources: ['s5'] } ] },
  { id: 'gluten-free-non-celiac', name: 'GF', category: 'pattern', evidence: { rating: 'limited' }, sources: ['s5'], rules: [ { id: 'gf-1', kind: 'avoid', tags: ['gluten'], tier: 1, strength: 'may', text: 'gf', sources: ['s5'] } ] },
  { id: 'pregnancy-gdm-breastfeeding', name: 'Pregnancy', category: 'condition', evidence: { rating: 'strong' }, sources: ['s6'], disables: ['weight-loss', 'ketogenic', 'elimination-protocols-except-allergen-celiac'], rules: [] },
  { id: 'low-carb-ketogenic', name: 'Keto', category: 'pattern', evidence: { rating: 'moderate' }, sources: ['s6'], rules: [ { id: 'k-1', kind: 'limit', nutrient: 'carb_g', op: '<=', value: 50, tier: 1, strength: 'should', text: 'carb', sources: ['s6'] } ] },
  { id: 'eating-disorder-screen', name: 'Screen', category: 'restriction', evidence: { rating: 'strong' }, sources: ['s6'], disables: ['calorie-targets', 'weight-loss', 'new-elimination-protocols'], rules: [] },
  { id: 'food-allergies', name: 'Food allergies', category: 'restriction', evidence: { rating: 'strong' }, sources: ['s7'], rules: [] },
  { id: 'ibd', name: 'IBD', category: 'condition', evidence: { rating: 'moderate' }, sources: ['s8'], modes: [ { id: 'remission', default: true, rules: ['ibd-rem'] }, { id: 'flare', label: 'Flare', expires_days: 14, rules: ['ibd-flare'] } ],
    rules: [ { id: 'ibd-rem', kind: 'prefer', tags: ['whole-grain'], tier: 1, strength: 'should', text: 'med diet', sources: ['s8'] }, { id: 'ibd-flare', kind: 'avoid', tags: ['raw-vegetable'], tier: 1, strength: 'should', text: 'low residue', sources: ['s8'] } ] }
];

function person(over = {}) {
  return { id: 'p1', name: 'T', adult: true, modules: [], allergens: [], preferences: { avoid_tags: [], avoid_terms: [] }, medications: {}, tier2: {}, phases: {}, modes: {}, acknowledged: [], screen: { positive: false }, ...over };
}

test('hypertension alone applies sodium limit and potassium target', () => {
  const plan = buildPlan({ person: person({ modules: ['hypertension'] }), conditions });
  assert.equal(plan.limits.sodium_mg.value, 2300);
  assert.equal(plan.limits.sodium_mg.ideal, 1500);
  assert.equal(plan.targets.potassium_mg.min, 3500);
  assert.ok(plan.avoid['sugar-sweetened-beverage']);
  assert.equal(plan.avoid['sugar-sweetened-beverage'].hard, false);
});

test('hypertension + POTS: no sodium number, hard-conflict notice, tier2 missing', () => {
  const plan = buildPlan({ person: person({ modules: ['hypertension', 'pots'] }), conditions });
  assert.equal(plan.limits.sodium_mg, undefined);
  assert.equal(plan.targets.sodium_mg, undefined);
  assert.ok(plan.notices.some(n => n.code === 'hard-conflict'));
  assert.ok(plan.tier2.missing.some(t => t.param.startsWith('sodium_mg')));
  // rest of plan still builds
  assert.ok(plan.targets.potassium_mg);
});

test('hypertension + POTS with clinician sodium number applies that number', () => {
  const plan = buildPlan({ person: person({ modules: ['hypertension', 'pots'], tier2: { sodium_mg_min: 4000, sodium_mg_max: 6000 } }), conditions });
  assert.equal(plan.targets.sodium_mg.min, 4000);
  assert.equal(plan.limits.sodium_mg.value, 6000);
  assert.equal(plan.limits.sodium_mg.clinician, true);
});

test('CKD suppresses hypertension potassium target', () => {
  const plan = buildPlan({ person: person({ modules: ['hypertension', 'ckd'], weight_kg: 70 }), conditions });
  assert.equal(plan.targets.potassium_mg, undefined);
  assert.ok(plan.suppressed.some(s => s.rule === 'htn-potassium'));
  assert.equal(plan.limits.protein_g.value, 56);
});

test('per-kg rule without weight asks for weight and applies nothing', () => {
  const plan = buildPlan({ person: person({ modules: ['ckd'] }), conditions });
  assert.equal(plan.limits.protein_g, undefined);
  assert.ok(plan.notices.some(n => n.code === 'weight-needed'));
});

test('medication answer suppresses potassium target', () => {
  const plan = buildPlan({ person: person({ modules: ['hypertension'], medications: { potassium_retaining: true } }), conditions });
  assert.equal(plan.targets.potassium_mg, undefined);
});

test('POTS tier 2 without number runs in tier 1 only with notice', () => {
  const plan = buildPlan({ person: person({ modules: ['pots'] }), conditions });
  assert.equal(plan.targets.sodium_mg, undefined);
  assert.ok(plan.notices.some(n => n.code === 'tier2-missing'));
  const p2 = buildPlan({ person: person({ modules: ['pots'], tier2: { sodium_mg_min: 5000 } }), conditions });
  assert.equal(p2.targets.sodium_mg.min, 5000);
});

test('phase gating: elimination rules apply in elimination, not in reintroduction; a phase never ends on its own; a check-in asks', () => {
  const today = new Date('2026-09-05');
  const p1 = buildPlan({ person: person({ modules: ['ibs-low-fodmap'], phases: { 'ibs-low-fodmap': { phase: 'elimination', started: '2026-08-20' } } }), conditions, today });
  assert.ok(p1.avoid['fodmap-fructan']);
  assert.equal(p1.phases[0].status, 'active');
  assert.equal(p1.phases[0].suggested, '2 to 6 weeks');
  const p2 = buildPlan({ person: person({ modules: ['ibs-low-fodmap'], phases: { 'ibs-low-fodmap': { phase: 'reintroduction', started: '2026-08-20' } } }), conditions, today });
  assert.equal(p2.avoid['fodmap-fructan'], undefined);
  assert.ok(p2.behavior.some(b => b.rule === 'fm-always'));
  // months past the protocol's suggested length: still restricting, no block, no expiry notice; the default 4-week reminder is due
  const p3 = buildPlan({ person: person({ modules: ['ibs-low-fodmap'], phases: { 'ibs-low-fodmap': { phase: 'elimination', started: '2026-01-01' } } }), conditions, today });
  assert.equal(p3.phases[0].status, 'check-in');
  assert.ok(p3.avoid['fodmap-fructan'], 'elimination rules keep applying indefinitely');
  assert.ok(!p3.notices.some(n => /expired/.test(n.code)));
  // a check-in reminder set 4 weeks ago at "every 4 weeks" is due; at "every 8 weeks" it is not
  const p4 = buildPlan({ person: person({ modules: ['ibs-low-fodmap'], phases: { 'ibs-low-fodmap': { phase: 'elimination', started: '2026-01-01', check_in_weeks: 4, check_in_from: '2026-08-08' } } }), conditions, today });
  assert.equal(p4.phases[0].status, 'check-in');
  assert.ok(p4.notices.some(n => n.code === 'phase-check-in' && n.level === 'warn'));
  assert.ok(p4.avoid['fodmap-fructan'], 'a due check-in changes nothing by itself');
  const p5 = buildPlan({ person: person({ modules: ['ibs-low-fodmap'], phases: { 'ibs-low-fodmap': { phase: 'elimination', started: '2026-01-01', check_in_weeks: 8, check_in_from: '2026-08-08' } } }), conditions, today });
  assert.equal(p5.phases[0].status, 'active');
});

test('pregnancy disables keto and elimination protocols', () => {
  const plan = buildPlan({ person: person({ modules: ['low-carb-ketogenic', 'ibs-low-fodmap'], pregnancy: true }), conditions });
  assert.equal(plan.limits.carb_g, undefined);
  assert.ok(plan.disabledModules.some(d => d.id === 'low-carb-ketogenic'));
  assert.ok(plan.disabledModules.some(d => d.id === 'ibs-low-fodmap'));
});

test('positive screen turns off calorie targets and new eliminations but keeps allergens', () => {
  const plan = buildPlan({ person: person({ modules: ['ibs-low-fodmap'], allergens: ['allergen-peanut'], screen: { positive: true } }), conditions });
  assert.ok(plan.isDisabled('calorie-targets'));
  assert.ok(plan.disabledModules.some(d => d.id === 'ibs-low-fodmap'));
  assert.equal(plan.avoid['allergen-peanut'].hard, true);
});

test('allergens are hard even if also a preference', () => {
  const plan = buildPlan({ person: person({ allergens: ['allergen-milk'], preferences: { avoid_tags: ['allergen-milk'], avoid_terms: [] } }), conditions });
  assert.equal(plan.avoid['allergen-milk'].hard, true);
});

test('restriction load warns at three eliminations', () => {
  const plan = buildPlan({ person: person({ modules: ['ibs-low-fodmap', 'mcas', 'low-carb-ketogenic'] }), conditions });
  assert.equal(plan.restrictionLoad.warn, true);
  assert.ok(plan.notices.some(n => n.code === 'restriction-load'));
});

test('IBD flare mode applies flare rules and expires', () => {
  const today = new Date('2026-09-05');
  const p1 = buildPlan({ person: person({ modules: ['ibd'], modes: { ibd: { mode: 'flare', since: '2026-09-01' } } }), conditions, today });
  assert.ok(p1.avoid['raw-vegetable']);
  assert.equal(p1.prefer['whole-grain'], undefined);
  const p2 = buildPlan({ person: person({ modules: ['ibd'], modes: { ibd: { mode: 'flare', since: '2026-08-01' } } }), conditions, today });
  assert.equal(p2.avoid['raw-vegetable'], undefined);
  assert.ok(p2.notices.some(n => n.code === 'mode-expired'));
});

test('allergy module applies only the person\'s own allergens (real content shape)', () => {
  const conds = [{ id: 'food-allergies', name: 'Food allergies', category: 'restriction', evidence: { rating: 'strong' }, sources: ['s7'], rules: [
    { id: 'allergen-soy', kind: 'avoid', hard: true, tags: ['allergen-soy', 'soy'], tier: 1, strength: 'must', text: 'soy', sources: ['s7'] },
    { id: 'allergen-peanut', kind: 'avoid', hard: true, tags: ['allergen-peanut'], tier: 1, strength: 'must', text: 'peanut', sources: ['s7'] }
  ] }];
  const plan = buildPlan({ person: person({ allergens: ['allergen-peanut'] }), conditions: conds });
  assert.equal(plan.avoid['allergen-peanut'].hard, true);
  assert.equal(plan.avoid['soy'], undefined);
  assert.equal(plan.avoid['allergen-soy'], undefined);
});

// ---- Dietitian-review additions: default check-in, medicines that interact with food, protein suggestion
const medModule = { id: 'medication-food-interactions', name: 'Medicines', category: 'medication', evidence: { rating: 'strong' }, sources: ['s9'], auto_by_medication: true,
  medication_questions: [ { id: 'warfarin', text: 'Warfarin?', effect: 'enable:med-warfarin', global: true }, { id: 'levothyroxine', text: 'Levothyroxine?', effect: 'enable:med-levo', global: true } ],
  rules: [ { id: 'med-warfarin', kind: 'info', tier: 1, strength: 'must', text: 'Keep vitamin K steady', sources: ['s9'] }, { id: 'med-levo', kind: 'timing', tags: ['coffee'], unless_module: 'thyroid', tier: 1, strength: 'must', text: 'Levothyroxine timing', sources: ['s9'] } ] };
const thyroidModule = { id: 'thyroid', name: 'Thyroid', category: 'condition', evidence: { rating: 'strong' }, sources: ['s10'],
  medication_questions: [ { id: 'levothyroxine', text: 'Levothyroxine?', effect: 'enable:thy-levo' } ],
  rules: [ { id: 'thy-levo', kind: 'timing', tags: ['coffee'], tier: 1, strength: 'must', text: 'Levothyroxine timing (thyroid)', sources: ['s10'] } ] };
const hpModule = { id: 'higher-protein-older-adult', name: 'Higher protein', category: 'condition', evidence: { rating: 'strong' }, sources: ['s11'], rules: [ { id: 'hp-1', kind: 'info', tier: 1, strength: 'should', text: '1.0 to 1.2 g/kg', sources: ['s11'] } ] };
const conds2 = conditions.concat([medModule, thyroidModule, hpModule]);
const ruleIds = plan => ['applied', 'behavior', 'info', 'timing'].flatMap(k => plan[k] || []).map(r => r.id || r.rule);

test('elimination phases default to a 4-week check-in; an explicit 0 turns it off; a set number is kept', () => {
  const today = new Date('2026-09-10');
  const d = buildPlan({ person: person({ modules: ['ibs-low-fodmap'], phases: { 'ibs-low-fodmap': { phase: 'elimination', started: '2026-08-20' } } }), conditions, today });
  assert.equal(d.phases[0].check_in_weeks, 4);
  assert.equal(d.phases[0].status, 'active');
  const due = buildPlan({ person: person({ modules: ['ibs-low-fodmap'], phases: { 'ibs-low-fodmap': { phase: 'elimination', started: '2026-08-01' } } }), conditions, today });
  assert.equal(due.phases[0].status, 'check-in', 'nearly six weeks in with the default reminder: a check-in is due');
  const off = buildPlan({ person: person({ modules: ['ibs-low-fodmap'], phases: { 'ibs-low-fodmap': { phase: 'elimination', started: '2026-08-01', check_in_weeks: 0 } } }), conditions, today });
  assert.equal(off.phases[0].check_in_weeks, null);
  assert.equal(off.phases[0].status, 'active');
  const six = buildPlan({ person: person({ modules: ['ibs-low-fodmap'], phases: { 'ibs-low-fodmap': { phase: 'elimination', started: '2026-08-01', check_in_weeks: 6, check_in_from: '2026-08-01' } } }), conditions, today });
  assert.equal(six.phases[0].check_in_weeks, 6);
  assert.equal(six.phases[0].status, 'active');
});

test('a medicine answered yes switches the interaction module on by itself; its levothyroxine rule yields to the thyroid module', () => {
  const none = buildPlan({ person: person({ modules: ['hypertension'] }), conditions: conds2 });
  assert.ok(!none.modules.some(m => m.id === 'medication-food-interactions'));
  const w = buildPlan({ person: person({ modules: ['hypertension'], medications: { warfarin: true } }), conditions: conds2 });
  assert.ok(w.modules.some(m => m.id === 'medication-food-interactions'));
  assert.ok(ruleIds(w).includes('med-warfarin'));
  assert.ok(!ruleIds(w).includes('med-levo'), 'levothyroxine not answered: its rule stays gated');
  const l = buildPlan({ person: person({ modules: [], medications: { levothyroxine: true } }), conditions: conds2 });
  assert.ok(ruleIds(l).includes('med-levo'), 'no thyroid module: the interaction module carries the timing rule');
  const both = buildPlan({ person: person({ modules: ['thyroid'], medications: { levothyroxine: true } }), conditions: conds2 });
  assert.ok(ruleIds(both).includes('thy-levo'));
  assert.ok(!ruleIds(both).includes('med-levo'), 'thyroid active: only one levothyroxine rule');
});

test('higher protein is suggested at 65 and on a GLP-1 medicine, never added silently, and stays quiet once dismissed or added', () => {
  const young = buildPlan({ person: person({ age: 50 }), conditions: conds2 });
  assert.ok(!young.notices.some(n => n.code === 'suggest-module'));
  const older = buildPlan({ person: person({ age: 72 }), conditions: conds2 });
  const n = older.notices.find(n => n.code === 'suggest-module');
  assert.ok(n && n.module === 'higher-protein-older-adult' && n.action === 'add-module:higher-protein-older-adult');
  assert.ok(!older.modules.some(m => m.id === 'higher-protein-older-adult'), 'suggested, not applied');
  const glp = buildPlan({ person: person({ age: 40, flags: { glp1: true } }), conditions: conds2 });
  assert.ok(glp.notices.some(n => n.code === 'suggest-module'));
  const dismissed = buildPlan({ person: person({ age: 72, dismissed_suggestions: ['higher-protein-older-adult'] }), conditions: conds2 });
  assert.ok(!dismissed.notices.some(n => n.code === 'suggest-module'));
  const added = buildPlan({ person: person({ age: 72, modules: ['higher-protein-older-adult'] }), conditions: conds2 });
  assert.ok(!added.notices.some(n => n.code === 'suggest-module'));
});
