// N4 (found during the fix pass of September 30, 2026; not in the audit report): the pasta entry knows its whole wheat,
// gluten-free, and rice forms, but the shapes did not. "whole wheat spaghetti" carried the refined grain tag (a caution
// for type 2 diabetes, which prefers whole grains), and "gluten-free spaghetti" and "brown rice spaghetti" were a stop
// for celiac disease. The shapes now follow the pasta entry: whole wheat, wholemeal, and whole grain forms are whole
// grain wheat (still a stop for wheat and celiac), and gluten-free and rice forms are not wheat. Every person here is
// made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMatcher } from '../src/engine/dictionary.js';
import { buildPlan } from '../src/engine/plan.js';
import { checkText } from '../src/engine/checker.js';

const J = f => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const conditions = J('conditions.json').modules, dictionaries = J('dictionaries.json');
const matcher = buildMatcher(dictionaries);
const person = extra => ({ id: 't', name: 'Test Person', adult: true, age: 55, sex: 'female', modules: [], allergens: [], allergens_other: [], preferences: { avoid_tags: [], avoid_terms: [], patterns: [] }, medications: {}, tier2: {}, phases: {}, rule_settings: {}, ...extra });
const check = (t, p) => checkText(t, buildPlan({ person: p, conditions, dictionaries, today: new Date('2026-09-30') }), matcher, p);
const celiac = person({ modules: ['celiac'] }), t2d = person({ modules: ['t2d'] }), wheat = person({ allergens: ['allergen-wheat'] });
const SHAPES = ['spaghetti', 'macaroni', 'orzo', 'lasagna', 'pasta'];

test('N4: whole wheat, wholemeal, and whole grain shapes are whole grain wheat', () => {
  for (const s of SHAPES) for (const w of ['whole wheat', 'whole-wheat', 'wholewheat', 'wholemeal', 'whole grain', 'wholegrain']) {
    const t = `8 oz ${w} ${s}`;
    assert.ok(!check(t, t2d).hits.some(h => h.tag === 'refined-grain'), `${t}: not refined grain`);
    assert.equal(check(t, celiac).verdict, 'fail', `${t}: still a stop for celiac`);
    assert.equal(check(t, wheat).verdict, 'fail', `${t}: still a stop for wheat`);
  }
  assert.ok(!check('9 whole grain lasagna noodles', t2d).hits.some(h => h.tag === 'refined-grain'));
});

test('N4: every form of lasagna keeps its milk and egg label checks', () => {
  const milk = person({ allergens: ['allergen-milk'] }), egg = person({ allergens: ['allergen-egg'] });
  for (const t of ['lasagna', 'whole wheat lasagna', 'wholemeal lasagna', 'whole grain lasagna noodles', '8 ounces whole-grain lasagna noodles', 'gluten-free lasagna', 'brown rice lasagna', 'rice lasagna']) {
    for (const [p, tag] of [[milk, 'allergen-milk'], [egg, 'allergen-egg']]) {
      const r = check(t, p);
      assert.notEqual(r.verdict, 'pass', `${t}: ${tag}`);
      assert.ok((r.verifyLabel || []).some(v => v.tag === tag), `${t}: check the label for ${tag}`);
    }
  }
});

test('N4: gluten-free and rice shapes are not a stop for celiac disease', () => {
  for (const s of ['spaghetti', 'macaroni', 'orzo', 'lasagna']) {
    for (const t of [`gluten-free ${s}`, `gluten free ${s}`, `brown rice ${s}`]) {
      assert.notEqual(check(t, celiac).verdict, 'fail', t);
      assert.deepEqual(check(t, celiac).unrecognized, [], `${t} is recognized`);
    }
  }
});

test('N4: plain shapes are unchanged', () => {
  for (const s of SHAPES) {
    assert.equal(check(s, celiac).verdict, 'fail', s);
    assert.ok(check(s, t2d).hits.some(h => h.tag === 'refined-grain'), `${s}: refined`);
  }
  assert.equal(check('spaghetti squash', celiac).verdict, 'pass');
});
