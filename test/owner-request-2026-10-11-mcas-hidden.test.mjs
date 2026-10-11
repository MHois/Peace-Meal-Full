// Owner request, October 11, 2026: take MCAS off both builds. The module, its low-histamine list, and its article stay
// in the data, marked "retired" (repository rule: delete nothing). A retired module is not offered on the Conditions
// step, in its search, on the Learn list, or in the welcome screen's count. A person who already has it selected still
// sees it under "Your selections", where it keeps working until they untick it. Every person here is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = { readyState: 'loading', addEventListener() {}, removeEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], activeElement: null, documentElement: { setAttribute() {}, removeAttribute() {}, classList: { toggle() {}, add() {}, remove() {}, contains: () => false } } };
globalThis.window = { addEventListener() {}, location: { hash: '' } };
globalThis.location = { hash: '', href: 'https://example.org/' };
const R = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const C = JSON.parse(R('data/conditions.json'));
const D = JSON.parse(R('data/dictionaries.json'));
const common = await import('../src/ui/common.js');
const { uiState, uiEnsurePerson } = common;
const { buildMatcher } = await import('../src/engine/dictionary.js');
const { buildPlan } = await import('../src/engine/plan.js');
uiState.data = { conditions: C.modules, dictionaries: D, recipes: [], foods: [], sources: [], articles: JSON.parse(R('data/articles.json')) };
uiState.conditionsMeta = { flags: C.flags || {}, onboarding_common: C.onboarding_common || [] };
uiState.conditionsById = new Map(C.modules.map(m => [m.id, m]));
uiState.sourcesById = new Map();
uiState.matcher = buildMatcher(D);
const people = await import('../src/ui/people.js');
const { renderLearnScreen } = await import('../src/ui/learn.js');
const { renderWelcomeScreen } = await import('../src/ui/home.js');

function stub() {
  return { innerHTML: '', value: '', checked: false, open: false, textContent: '', dataset: {}, style: {}, isConnected: true,
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, removeAttribute() {}, getAttribute: () => null,
    querySelector: () => stub(), querySelectorAll: () => [], closest: () => null, focus() {}, scrollIntoView() {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false } };
}
const person = extra => uiEnsurePerson({ id: 't1', name: 'Test Person', adult: true, modules: [], allergens: [], variants: {}, flags: {}, optional_rules: [], rule_settings: {}, confirmations: [], ...extra });
function draw(p, step) { uiState.profile = { people: [p], log: [], diary: [], weights: [] }; const box = stub(); people.peopleRenderStep(box, p, step); return box.innerHTML; }
const mcas = C.modules.find(m => m.id === 'mcas');

test('MCAS stays in the data, marked retired, with its rules and low-histamine list intact', () => {
  assert.ok(mcas, 'the module is kept');
  assert.equal(mcas.retired, true);
  assert.ok(mcas.rules.length > 0, 'its rules are kept');
  assert.equal(JSON.parse(R('data/diet-lists.json')).families['low-histamine'].module, 'mcas', 'its food list is kept');
  assert.ok(JSON.parse(R('data/articles.json')).mcas, 'its article is kept');
  assert.deepEqual(C.modules.filter(m => m.retired).map(m => m.id), ['mcas'], 'nothing else is retired');
});

test('neither build offers MCAS on the Conditions step, with or without a search', () => {
  for (const lite of [false, true]) {
    uiState.lite = lite;
    for (const setup_complete of [false, true]) {
      const html = draw(person({ setup_complete }), 'conditions');
      assert.ok(html.includes('data-module="t2d"'), 'other conditions are still listed');
      assert.ok(!html.includes('data-module="mcas"'), `lite=${lite} setup_complete=${setup_complete}`);
      assert.ok(!/mast cell|MCAS/i.test(html), 'not named anywhere on the step');
    }
  }
  uiState.lite = false;
});

test('a search cannot find it: the search reads the same list, which leaves retired modules out', () => {
  const src = R('src/ui/people.js');
  assert.match(src, /let modules = uiState\.data\.conditions\.filter\(m => !PEOPLE_META_MODULES\.includes\(m\.id\) && \(!m\.retired \|\| selected\.has\(m\.id\)\)\);/);
  assert.match(src, /const matches = m => !q \|\| \(m\.name/);
  assert.match(src, /const list = modules\.filter\(m => m\.category === g\.key && !selected\.has\(m\.id\) && matches\(m\)/);
});

test('someone who already has it selected still sees it, and it still applies', () => {
  const p = person({ setup_complete: true, modules: ['mcas'] });
  const html = draw(p, 'conditions');
  assert.ok(html.includes('data-module="mcas"'), 'listed under Your selections so it can be unticked');
  assert.match(html, /Your selections \(1\)/);
  const plan = buildPlan({ person: p, conditions: C.modules, dictionaries: D, today: new Date('2026-10-11') });
  assert.ok(plan.modules.some(m => m.id === 'mcas'), 'the plan still enforces it');
});

test('Learn does not list it, and the welcome screen does not count it', () => {
  const root = stub();
  renderLearnScreen(root, { route: { parts: [] } });
  assert.ok(root.innerHTML.includes('href="#/learn/t2d"'), 'other topics are listed');
  assert.ok(!root.innerHTML.includes('href="#/learn/mcas"'));
  assert.ok(!/mast cell|MCAS/i.test(root.innerHTML));
  const offered = C.modules.filter(m => (m.category === 'condition' || m.category === 'pattern') && !m.retired).length;
  const welcome = stub();
  renderWelcomeScreen(welcome);
  assert.ok(welcome.innerHTML.includes(`${offered} conditions and eating patterns`), `counts ${offered}`);
  assert.ok(!welcome.innerHTML.includes(`${offered + 1} conditions and eating patterns`));
});
