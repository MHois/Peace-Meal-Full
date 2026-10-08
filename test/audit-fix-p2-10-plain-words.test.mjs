// P2-10 (audit of September 30, 2026): hard reading. The audit's plain-language review (docs/audit-2026-09-30/evidence/
// phase8-plain-language.md) named the text people read most: the FAIL headline "Contains a hard exclusion." on every
// stop, the Why sheet's "A hard stop: never overridden by a preference, a mode, or an acknowledgment.", the protein
// notice on lite Today ("1.0 to 1.2 g per kg of body weight", "module"), and lines that describe the app in its own
// terms (Tier 2, onboarding, modules, "user-configurable", "per Phase 1"). The medicine notices built from effect
// names ("note: hypoglycemia awareness.") had the same problem. These say the same thing in plain words now; the
// numbers and what the app does are unchanged. Every person here is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPlan } from '../src/engine/plan.js';
import * as checkUi from '../src/ui/check.js';

const J = f => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const R = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const conditions = J('conditions.json').modules, dictionaries = J('dictionaries.json'), articles = J('articles.json');
const person = extra => ({ id: 't', name: 'Test Person', adult: true, age: 45, sex: 'female', modules: [], allergens: [], allergens_other: [], preferences: { avoid_tags: [], avoid_terms: [], patterns: [] }, medications: {}, tier2: {}, phases: {}, rule_settings: {}, ...extra });
const planOf = p => buildPlan({ person: p, conditions, dictionaries, today: new Date('2026-09-30') });
const JARGON = /hard exclusion|hard stop|soft rule|acknowledg|\bmodule\b|g per kg|\bTier 2\b|onboarding|user-configurable|per Phase 1/i;

const { checkHeadline } = checkUi;

test('P2-10: the FAIL headline says no in plain words, in both builds', () => {
  assert.equal(checkHeadline({ verdict: 'fail' }, true), 'No. This has something you must not eat.');
  assert.equal(checkHeadline({ verdict: 'fail' }, false), 'No: contains something this plan never allows.');
});

test('P2-10: the Why sheet says what a stop and a caution mean without app terms', () => {
  const { CHECK_WHY_HARD, CHECK_WHY_SOFT } = checkUi;
  assert.equal(typeof CHECK_WHY_HARD, 'string'); assert.equal(typeof CHECK_WHY_SOFT, 'string');
  assert.doesNotMatch(CHECK_WHY_HARD, JARGON);
  assert.doesNotMatch(CHECK_WHY_SOFT, JARGON);
  assert.match(CHECK_WHY_HARD, /^Never eat this\./);
  assert.match(CHECK_WHY_SOFT, /You decide\.$/);
});

test('P2-10: the protein notice at 65 speaks in grams, and shows the person\'s own grams when their weight is known', () => {
  const notice = p => planOf(p).notices.find(n => n.code === 'suggest-module');
  const withWeight = notice(person({ age: 72, weight_kg: 70 }));
  assert.ok(withWeight, 'still suggested at 72');
  assert.doesNotMatch(withWeight.text, JARGON);
  assert.match(withWeight.text, /about 1 to 1\.2 grams a day for each kilogram you weigh/);
  assert.match(withWeight.text, /70 to 84 grams a day for you/, '70 kg times 1.0 and 1.2');
  const noWeight = notice(person({ age: 72 }));
  assert.doesNotMatch(noWeight.text, JARGON);
  assert.doesNotMatch(noWeight.text, /for you/, 'no made-up number without a weight');
  const glp1 = notice(person({ age: 40, weight_kg: 90, flags: { glp1: true } }));
  assert.doesNotMatch(glp1.text, JARGON);
  assert.match(glp1.text, /90 to 108 grams a day for you/);
});

test('P2-10: medicine notices say what to do, not an effect name', () => {
  const p = person({ modules: ['t2d', 'low-carb-ketogenic', 'time-restricted-eating', 'heart-failure'], medications: { insulin_or_su: true, sglt2: true, potassium_retaining: true } });
  const texts = planOf(p).notices.filter(n => n.code === 'medication-flag' || n.code === 'medication-require').map(n => n.text);
  assert.ok(texts.length >= 6, `${texts.length} medicine notices`);
  for (const t of texts) {
    assert.doesNotMatch(t, /note: [a-z]+ [a-z]+|needs clinician|signoff/i, t);
    assert.match(t, /you answered yes to "/, t);
  }
  assert.ok(texts.some(t => /low blood sugar \(hypoglycemia\)/.test(t)));
  assert.ok(texts.some(t => /ketoacidosis \(a dangerous build-up of acid in the blood\)/.test(t)));
  assert.ok(texts.some(t => /blood potassium/.test(t)));
});

test('P2-10: Plan, Learn, and the allergy setting line use plain words', () => {
  assert.ok(!R('src/ui/plan.js').includes('Every Tier 2 rule either has a number or does not apply.'));
  // Changed on purpose (UX pass, October 2026). Old: the Plan's empty "still missing" section said "None. Every rule that
  // needs a number from your doctor has one, or does not apply to you." New: empty checks share one "Also checked" list,
  // where the line reads "No number from your doctor or dietitian is missing." Why: five empty sections in a row on most
  // plans. The jargon check above is unchanged.
  assert.ok(R('src/ui/plan.js').includes('No number from your doctor or dietitian is missing.'));
  assert.ok(!R('src/ui/learn.js').includes('no condition-specific dietary evidence'));
  const may = conditions.find(m => m.id === 'food-allergies').rules.find(r => r.id === 'allergen-may-contain');
  assert.doesNotMatch(may.text, JARGON);
  assert.match(may.text, /Allergies step/);
});

test('P2-10: the articles describe the app without its internal terms', () => {
  const para = (id, heading) => (articles[id].sections.find(s => s.heading === heading).paragraphs || []).join(' ');
  for (const [id, heading] of [['t2d', 'How this app applies it'], ['hypertension', 'Numbers that matter'], ['celiac', 'How this app applies it'], ['soy-free', 'How this app applies it'], ['heart-failure', 'Numbers that matter']]) {
    const text = para(id, heading);
    for (const bad of ['At onboarding', 'hypoglycemia awareness notes', 'per Phase 1', 'Compatible modules', 'information rule pointing', 'suppresses potassium encouragement']) assert.ok(!text.includes(bad), `${id}: "${bad}"`);
  }
  assert.match(para('hypertension', 'Numbers that matter'), /POTS \(postural orthostatic tachycardia syndrome/);
  assert.match(para('soy-free', 'How this app applies it'), /soy lecithin are left out when you have a soy allergy/);
});

test('P2-10: what the heart failure article now says the medicine question does is what the app does', () => {
  const base = person({ modules: ['heart-failure', 'hypertension'] });
  const on = planOf({ ...base, medications: { potassium_retaining: true } }), off = planOf(base);
  const hasK = plan => !!(plan.targets && plan.targets.potassium_mg);
  assert.equal(hasK(off), true, 'with high blood pressure, a potassium target is set');
  assert.equal(hasK(on), false, 'after a yes, it is set aside');
  assert.ok(on.notices.some(n => n.code === 'medication-flag' && /blood potassium/.test(n.text)), 'and the reminder shows');
});
