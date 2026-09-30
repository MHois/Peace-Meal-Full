// Final review before publishing (September 30, 2026): condition and article text must describe what the app does.
// docs/VERIFY-log.md, row A34.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPlan } from '../src/engine/plan.js';

const J = f => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const conditions = J('conditions.json').modules, dictionaries = J('dictionaries.json'), articles = J('articles.json');
const strings = (v, out = []) => { if (typeof v === 'string') out.push(v); else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, out); return out; };
const tester = (modules, extra = {}) => ({ id: 't1', name: 'Test Person', adult: true, age: 50, sex: 'male', modules, allergens: [], preferences: { avoid_tags: [], avoid_terms: [] }, medications: {}, tier2: {}, phases: {}, ...extra });
const planFor = p => buildPlan({ person: p, conditions, dictionaries, today: new Date('2026-09-30') });
const rule = (m, id) => conditions.find(x => x.id === m).rules.find(r => r.id === id);

test('no rule, education, or article says the app screens for eating disorders or asks about pancreatitis', () => {
  // The eating-disorder screen was removed on September 9, 2026, and the app never asked about pancreatitis.
  const texts = [...strings(conditions.map(m => ({ rules: m.rules, education: m.education, conflicts: m.conflicts }))), ...strings(articles)];
  const wrong = texts.filter(t => /the app screens|\bSCOFF\b|app asks about[^.]*pancreatitis|requires clinician sign-off before turning/i.test(t));
  assert.deepEqual(wrong, []);
});

test('the GLP-1 and PCOS screening rules keep their source sentence and say the app does not screen', () => {
  const wm = rule('weight-management-glp1', 'wm-screen').text, pcos = rule('pcos', 'pcos-screen').text;
  assert.ok(wm.startsWith('Both GLP-1 documents call for baseline screening for disordered eating before starting therapy.'));
  assert.match(wm, /The app does not do this screening/);
  assert.ok(pcos.startsWith('The guideline explicitly warns about weight stigma and disordered eating risk in this population.'));
  assert.match(pcos, /The app does not screen for disordered eating/);
});

test('low-carb: an SGLT2 inhibitor gives a warning and does not block; pregnancy turns the pattern off', () => {
  // What the corrected text says the app does.
  const sglt2 = planFor(tester(['low-carb-ketogenic'], { medications: { sglt2: true } }));
  assert.ok(sglt2.notices.some(n => n.level === 'warn' && n.code === 'medication-require' && /clinician signoff/.test(n.text)));
  assert.ok(sglt2.modules.some(m => m.id === 'low-carb-ketogenic'));
  const pregnant = planFor(tester(['low-carb-ketogenic'], { sex: 'female', age: 30, pregnancy: true }));
  assert.ok(pregnant.notices.some(n => n.level === 'block' && n.code === 'module-disabled' && n.module === 'low-carb-ketogenic'));
});

test('the welcome screens count what the app has: conditions from the data, recipes within 3 percent', () => {
  const home = fs.readFileSync(new URL('../src/ui/home.js', import.meta.url), 'utf8');
  assert.doesNotMatch(home, /\b\d+ conditions|\b(Thirty|Forty|Fifty)-\w+ conditions/, 'the condition count is computed, not typed in');
  const said = Number(/About ([\d,]+) recipes/.exec(home)[1].replace(/,/g, ''));
  // On by default: Peace Meal's own, NHS, Parent Club Scotland, NHLBI, and Wikibooks (data/recipes.json and recipes-open.json).
  const real = J('recipes.json').length + J('recipes-open.json').length;
  assert.ok(Math.abs(said - real) / real <= 0.03, `welcome says about ${said}; the default collections hold ${real}`);
});
