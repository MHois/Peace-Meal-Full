// Phase 3, item 16: re-verify the fixes claimed in docs/AUDIT-2026-09-SUMMARY.md that the engine and data can show.
// Each test names the claim it checks. Browser-only claims (Home Screen guide, Undo, update prompt, lazy Wikibooks, Wi-Fi
// note) are checked in audit/e2e/journeys.mjs; network claims (integrity hashes, fonts) in audit/scripts/network.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { J, conditions, dictionaries, dietLists, foods, foodsById, matcher, person, planFor, checkText, checkRecipe, checkFood } from '../lib/engine.mjs';
import { buildWeekPlan } from '../../src/engine/planner.js';

const results = [];
const claim = (id, text, fn) => test(`${id}: ${text}`, () => { try { fn(); results.push({ id, text, holds: true }); } catch (e) { results.push({ id, text, holds: false, why: e.message.split('\n')[0] }); throw e; } });
const P = extra => { const p = person(extra); return { p, plan: planFor(p) }; };
const label = (who, text) => checkText(text, who.plan, matcher, who.p);
const mcas = P({ modules: ['mcas'] }), fodmap = P({ modules: ['ibs-low-fodmap'] }), celiac = P({ modules: ['celiac'] }), milk = P({ allergens: ['allergen-milk'] }), treenut = P({ allergens: ['allergen-tree-nut'] });
const redMeat = P({ preferences: { avoid_tags: ['red-meat'], avoid_terms: [], patterns: [] } });
const R = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const hlist = dietLists.families['low-histamine'];
const hItems = hlist.groups.flatMap(g => g.items);
const findH = term => hItems.find(i => i.term === term || (i.aliases || []).includes(term));

// Phase 1, safety
claim('P1a', 'anything the app does not recognize is never a pass while a condition, allergy, or limit is on file', () => {
  for (const who of [mcas, celiac, milk]) assert.notEqual(label(who, 'xqzt blorp').verdict, 'pass', 'an unknown word on its own');
  assert.notEqual(label(milk, 'sugar xqzt').verdict, 'pass', 'an unknown word beside a known one ("sugar xqzt")');
});
claim('P1b', 'the label checker uses the strict low histamine list: "apple, blueberries" passes, "apple, pear" does not (MCAS)', () => {
  assert.equal(label(mcas, 'apple, blueberries').verdict, 'pass');
  assert.notEqual(label(mcas, 'apple, pear').verdict, 'pass');
});
claim('P1c', '"leftover roast chicken" is no longer approved as chicken on a low histamine plan', () => assert.notEqual(label(mcas, 'leftover roast chicken').verdict, 'pass'));
// Phase 2, rules
claim('P2a', 'stock, broth, bouillon, and gravy mixes ask for a gluten label check (celiac)', () => { for (const t of ['chicken broth', 'beef stock', 'bouillon cube', 'gravy mix']) assert.notEqual(label(celiac, t).verdict, 'pass', t); });
// "Approved" is the approved-food list's word: the list approves a quick homemade vegetable stock (notApproved is empty),
// while the dictionary still marks "vegetable stock" as could-hide-something, so the label shows a caution; the summary
// itself lists that as a known false alarm ("Where the approved lists and the avoid side disagree").
claim('P2b', 'on a low histamine plan shop stock is not approved; a quick homemade vegetable stock is (approved-food list)', () => {
  assert.notEqual(label(mcas, 'chicken stock').verdict, 'pass');
  assert.ok(label(mcas, 'vegetable stock').notApproved.length, 'shop vegetable stock is left out by the list');
  assert.deepEqual(label(mcas, 'quick homemade vegetable stock').notApproved, []);
});
claim('P2c', 'jarred and brined foods count like vinegar on a low histamine plan', () => { for (const t of ['jarred roasted red peppers', 'brined olives']) assert.notEqual(label(mcas, t).verdict, 'pass', t); });
claim('P2d', 'the tomato swap says fresh-roasted pepper', () => assert.match(JSON.stringify(J('swaps.json').swaps.filter(s => /tomato/i.test(s.match || ''))), /fresh-roasted/i));
// Phase 5, clinical content
claim('P5a', 'two or more "small serve" foods in one meal is a caution on low FODMAP', () => {
  const smalls = dietLists.families['low-fodmap'].groups.flatMap(g => g.items).filter(i => /small/i.test(i.portion || '')).map(i => i.term);
  assert.ok(smalls.length >= 2, 'the list has small serves');
  const r = label(fodmap, smalls.slice(0, 2).join(', '));
  assert.equal(r.verdict, 'caution', `${smalls.slice(0, 2).join(', ')} -> ${r.verdict}`);
});
claim('P5b', 'every low histamine item says what its rating rests on', () => assert.deepEqual(hItems.filter(i => !i.basis).map(i => i.term), []));
claim('P5c', 'the medicines-and-food education was approved and added (module education and an article)', () => {
  const m = conditions.find(x => x.id === 'medication-food-interactions');
  assert.ok(m && m.education && Object.keys(m.education).length, 'module education');
  assert.ok(J('articles.json')['medication-food-interactions'], 'article');
});
// Phase 6
claim('P6', 'a default week never gives a person with a daily limit a recipe without nutrition numbers', () => {
  const who = P({ modules: ['hypertension'] });
  const recipes = [...J('recipes.json'), ...J('recipes-open.json')];
  const week = buildWeekPlan({ person: who.p, plan: who.plan, recipes, foodsById, matcher, startDate: new Date('2026-10-05T00:00:00'), seed: 0 });
  const byId = new Map(recipes.map(r => [r.id, r]));
  const without = week.days.flatMap(d => d.meals).map(m => byId.get(m.recipe)).filter(r => r && !((r.nutrition_per_serving && r.nutrition_source) || (r.ingredients || []).some(i => i.food)));
  assert.deepEqual(without.map(r => r.id), []);
});
// Phase 7
claim('P7a', 'the thirty recipes for low FODMAP and low histamine together pass both strict checks', () => {
  const dual = J('recipes.json').filter(r => r.collection === 'review_dual');
  assert.equal(dual.length, 30);
  const both = P({ modules: ['ibs-low-fodmap', 'mcas'] });
  const bad = dual.filter(r => checkRecipe(r, both.plan, matcher, foodsById, both.p).verdict !== 'pass').map(r => r.name);
  assert.deepEqual(bad, []);
});
claim('P7b', 'a plain-words "why" under every number, taken word for word from the condition\'s own article', () => {
  const articles = J('articles.json');
  const flat = v => typeof v === 'string' ? v : v && typeof v === 'object' ? Object.values(v).map(flat).join(' ') : '';
  const missing = [];
  for (const m of conditions) for (const r of m.rules || []) {
    if (!((r.kind === 'limit' || r.kind === 'target') && typeof (r.value ?? r.min ?? r.max) === 'number')) continue;
    if (!r.why) { missing.push(`${m.id}:${r.id} has no why`); continue; }
    const a = articles[m.id]; const text = flat(a).replace(/\s+/g, ' ');
    if (!text.includes(r.why.replace(/\s+/g, ' ').trim())) missing.push(`${m.id}:${r.id} why not found word for word in the article`);
  }
  assert.deepEqual(missing, []);
});
// Owner answers
claim('Q2', 'limes, lime juice and zest, limeade, and marmalade carry the grapefruit tag', () => {
  for (const t of ['lime', 'lime juice', 'lime zest', 'limeade', 'marmalade']) assert.ok(matcher.tagText(t).tags.grapefruit || Object.keys(matcher.tagText(t).tags).some(x => /grapefruit/.test(x)), t);
});
claim('Q3', 'warfarin: Violi 2016 is cited first', () => {
  const m = conditions.find(x => x.id === 'medication-food-interactions');
  const rule = (m.rules || []).find(r => /warfarin|vitamin k/i.test(r.text || ''));
  assert.ok(rule, 'a warfarin rule');
  assert.match(rule.sources[0], /violi/i);
});
claim('Q4', 'levothyroxine wording follows the ATA guideline: 60 minutes before breakfast, or at bedtime 3 or more hours after eating', () => {
  const text = JSON.stringify(conditions.find(x => x.id === 'thyroid'));
  assert.match(text, /60 minutes/); assert.match(text, /bedtime/); assert.match(text, /3 (or more )?hours/);
});
claim('Q5', 'recipes without nutrition numbers are never planned for anyone with a daily limit, even when hearted', () => {
  const recipes = [...J('recipes.json'), ...J('recipes-open.json')];
  const noNum = recipes.filter(r => !((r.nutrition_per_serving && r.nutrition_source) || (r.ingredients || []).some(i => i.food)) && (r.meal || []).includes('dinner')).slice(0, 40);
  const who = P({ modules: ['hypertension'], favorites: { recipes: noNum.map(r => r.id), foods: [] }, include_unknown_nutrition: true });
  const week = buildWeekPlan({ person: who.p, plan: who.plan, recipes, foodsById, matcher, startDate: new Date('2026-10-05T00:00:00'), seed: 0 });
  const ids = new Set(noNum.map(r => r.id));
  assert.deepEqual(week.days.flatMap(d => d.meals).filter(m => ids.has(m.recipe)).map(m => m.recipe), []);
});
claim('Q6', 'quick homemade meat or fish stock is not approved on a low histamine plan; quick homemade vegetable stock is (approved-food list)', () => {
  assert.ok(label(mcas, 'quick homemade chicken stock').notApproved.length, 'quick homemade chicken stock left out');
  assert.ok(label(mcas, 'homemade fish stock').notApproved.length, 'homemade fish stock left out');
  assert.deepEqual(label(mcas, 'quick homemade vegetable stock').notApproved, []);
});
claim('Q8', 'banana, legumes, most nuts, and black pepper are left out on low histamine; chia, sunflower seeds, and cinnamon stay unchecked', () => {
  for (const t of ['banana', 'lentils', 'almonds', 'black pepper']) assert.notEqual(label(mcas, t).verdict, 'pass', t);
  for (const t of ['chia seeds', 'sunflower seeds', 'cinnamon']) { const i = findH(t); assert.ok(i && i.verified === false, `${t} marked not re-checked`); }
});
claim('Q9a', 'pear, minced meat, rice and oat milk, green beans, peas, and canned corn are left out; avocado and shellfish stay out (low histamine)', () => {
  for (const t of ['pear', 'ground beef', 'rice milk', 'oat milk', 'green beans', 'peas', 'canned corn', 'avocado', 'shrimp']) assert.notEqual(label(mcas, t).verdict, 'pass', t);
});
claim('Q9b', 'distilled white and apple cider vinegar are approved on the low histamine list', () => {
  for (const t of ['distilled white vinegar', 'apple cider vinegar']) assert.deepEqual(label(mcas, t).notApproved, [], t);
});
claim('Q9c', 'and so a label with distilled white or apple cider vinegar is not flagged on a low histamine plan', () => {
  for (const t of ['distilled white vinegar', 'apple cider vinegar']) assert.equal(label(mcas, t).verdict, 'pass', `${t}: the dictionary tags every vinegar histamine-fermented, so the label is a caution`);
});
claim('Q10', 'dictionary fixes: butter beans are not milk, water chestnuts are not a tree nut, salmon steaks are not red meat; crisped rice cereal, rice pilaf, fried rice, and vermicelli ask for a label check (celiac)', () => {
  assert.equal(label(milk, 'butter beans').verdict, 'pass');
  assert.equal(label(treenut, 'water chestnuts').verdict, 'pass');
  assert.ok(!matcher.tagText('salmon steaks').tags['red-meat']);
  for (const t of ['crisped rice cereal', 'rice pilaf', 'fried rice', 'vermicelli']) assert.notEqual(label(celiac, t).verdict, 'pass', t);
});
claim('Q13a', 'GLP-1 protein is the advisory\'s 80 to 120 g a day, not per kilogram of actual weight', () => {
  const r = conditions.find(x => x.id === 'weight-management-glp1').rules.find(x => x.id === 'wm-glp1-protein');
  assert.equal(r.min, 80); assert.equal(r.max, 120); assert.ok(!r.per_kg);
});
claim('Q13b', 'coconut (every coconut product) and chestnut keep the tree nut tag; heartnut is added', () => {
  for (const t of ['coconut', 'coconut oil', 'coconut sugar', 'coconut water', 'chestnut', 'heartnut']) assert.ok(matcher.tagText(t).tags['allergen-tree-nut'], t);
});
claim('Q15', 'vitamin-c-crps-2021 carries the Seth 2022 citation and is cited by nothing', () => {
  const src = J('sources.json'); const list = Array.isArray(src) ? src : (src.sources || Object.entries(src).map(([id, x]) => ({ id, ...x })));
  assert.match(list.find(s => s.id === 'vitamin-c-crps-2021').citation, /Seth/);
  const cited = JSON.stringify(conditions) + JSON.stringify(J('articles.json')) + JSON.stringify(dictionaries);
  assert.ok(!cited.includes('"vitamin-c-crps-2021"'));
});
claim('Still-open', '"Snacks, crisped rice bar" and "Rice mix, cheese flavor" still pass for celiac on the food check (listed as still open)', () => {
  for (const name of ['Snacks, crisped rice bar', 'Rice mix, cheese flavor']) {
    const f = foods.find(x => x.name && x.name.startsWith(name));
    assert.ok(f, name + ' is in the food table');
    assert.equal(checkFood(f, celiac.plan, matcher, celiac.p).verdict, 'pass', name);
  }
});
test.after(() => fs.writeFileSync(new URL('../results/summary-claims.json', import.meta.url), JSON.stringify(results, null, 1) + '\n'));
