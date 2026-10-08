// UX pass, October 2026 (owner item 4): GERD's optional rule was one checkbox, "Optional rule (off)", above the
// guideline's sentence about what it does not recommend, so a person could not tell what ticking it did. Ticking it
// turned on all nine trigger foods at once, while the rule's own text says to avoid only the ones that trigger you.
// Now each food is tapped on its own, and the words say what a tapped food does. An old all-foods setting still means
// all nine, so nothing saved earlier changes. Every person here is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPlan, optionalRulePicks } from '../src/engine/plan.js';
import { buildMatcher } from '../src/engine/dictionary.js';
import { checkText } from '../src/engine/checker.js';

const J = f => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const conditions = J('conditions.json').modules, dictionaries = J('dictionaries.json');
const matcher = buildMatcher(dictionaries);
const RULE = conditions.find(m => m.id === 'gerd').rules.find(r => r.id === 'gerd-triggers-optional');
const NINE = ['alcohol', 'carbonated', 'chocolate', 'citrus', 'coffee', 'fried', 'mint', 'spicy', 'tomato'];
const person = optional_rules => ({ id: 't', name: 'Test Person', adult: true, age: 50, sex: 'female', modules: ['gerd'], allergens: [], allergens_other: [], preferences: { avoid_tags: [], avoid_terms: [], patterns: [] }, medications: {}, tier2: {}, phases: {}, modes: {}, acknowledged: [], flags: {}, variants: {}, optional_rules, rule_settings: {}, confirmations: [], custom_modules: [] });
const planOf = p => buildPlan({ person: p, conditions, dictionaries, today: new Date('2026-10-08') });
const avoided = p => Object.keys(planOf(p).avoid || {}).filter(t => NINE.includes(t)).sort();

test('the rule lists the nine trigger foods, off by default', () => {
  assert.equal(RULE.optional === true || RULE.default === 'off', true);
  assert.deepEqual([...RULE.tags].sort(), NINE);
});

test('nothing tapped: no trigger food is avoided', () => {
  assert.deepEqual(avoided(person([])), []);
});

test('an old all-foods setting still avoids all nine, as before', () => {
  assert.deepEqual(avoided(person(['gerd-triggers-optional'])), NINE);
  assert.deepEqual(optionalRulePicks(RULE, person(['gerd-triggers-optional'])).sort(), NINE);
});

test('tapped foods are avoided, and only those', () => {
  const p = person(['gerd-triggers-optional:coffee', 'gerd-triggers-optional:mint']);
  assert.deepEqual(avoided(p), ['coffee', 'mint']);
  const plan = planOf(p);
  assert.notEqual(checkText('black coffee', plan, matcher, p).verdict, 'pass', 'coffee is a caution when tapped');
  assert.equal(checkText('tomato', plan, matcher, p).verdict, 'pass', 'tomato is not avoided when not tapped');
  assert.equal(checkText('tomato', planOf(person([])), matcher, person([])).verdict, 'pass', 'and not with nothing tapped');
});

test('a pick that is not one of the rule\'s foods is ignored', () => {
  assert.deepEqual(avoided(person(['gerd-triggers-optional:bogus'])), []);
});

test('the setup screen shows nine foods to tap and says what tapping does', async () => {
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  globalThis.document = { readyState: 'loading', addEventListener() {}, removeEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], activeElement: null, documentElement: { setAttribute() {}, removeAttribute() {}, classList: { toggle() {}, add() {}, remove() {}, contains: () => false } } };
  globalThis.window = { addEventListener() {}, location: { hash: '' } };
  globalThis.location = { hash: '', href: 'https://example.org/' };
  const { uiState } = await import('../src/ui/common.js');
  uiState.matcher = matcher;
  const { peopleOptionalRuleHTML } = await import('../src/ui/people.js');
  const none = peopleOptionalRuleHTML(RULE, person([]));
  assert.match(none, /Foods that give you heartburn/);
  assert.match(none, /Tap only the ones that bother you\. A food you tap is marked caution in recipes and labels and kept out of your meal plan\./);
  assert.equal((none.match(/data-multi="optpick-gerd-triggers-optional"/g) || []).length, 9, 'one tap target per food');
  assert.doesNotMatch(none, / checked /, 'nothing is tapped to begin with');
  assert.match(none, /None tapped: no food is avoided for reflux\./);
  assert.doesNotMatch(none, /Optional rule \((on|off)\)/, 'the old confusing title is gone');
  const two = peopleOptionalRuleHTML(RULE, person(['gerd-triggers-optional:coffee', 'gerd-triggers-optional:mint']));
  assert.match(two, /Avoiding: Coffee, Mint\./);
  assert.equal((two.match(/ checked /g) || []).length, 2);
  const old = peopleOptionalRuleHTML(RULE, person(['gerd-triggers-optional']));
  assert.equal((old.match(/ checked /g) || []).length, 9, 'an old all-foods setting shows all nine tapped');
});
