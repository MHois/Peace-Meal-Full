// The owner's answers to the audit's open questions (September 30, 2026). Numbers in brackets are the question numbers
// in docs/AUDIT-2026-09-SUMMARY.md; the sources are rows A13 onward in docs/VERIFY-log.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildMatcher } from '../src/engine/dictionary.js';
import { buildPlan } from '../src/engine/plan.js';
import { checkText } from '../src/engine/checker.js';

const J = f => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const conditions = J('conditions.json').modules, dictionaries = J('dictionaries.json'), lists = J('diet-lists.json'), articles = J('articles.json');
const matcher = buildMatcher(dictionaries); matcher.dietLists = lists;
const tester = (modules, extra = {}) => ({ id: 't1', name: 'Test Person', adult: true, age: 50, sex: 'male', modules, allergens: [], preferences: { avoid_tags: [], avoid_terms: [] }, medications: {}, tier2: {}, phases: {}, ...extra });
const planFor = p => buildPlan({ person: p, conditions, dictionaries, today: new Date('2026-09-30') });
const mod = id => conditions.find(m => m.id === id);
const rule = (m, id) => mod(m).rules.find(r => r.id === id);

// ---------------------------------------------------------------- [1] medicines and food: education and article
test('[1] the medicines-and-food module has its plain-language education and an article', () => {
  const m = mod('medication-food-interactions');
  assert.match(m.education.plain, /steady from week to week|about the same from week to week/);
  assert.ok(articles['medication-food-interactions'], 'article');
  assert.ok(m.sources.includes('violi-2016'));
});

// ---------------------------------------------------------------- [2] limes act like grapefruit
test('[2] lime and marmalade are flagged only for someone whose medicine interacts with grapefruit; sweet oranges are not', () => {
  const on = tester([], { medications: { grapefruit_interacting: true } });
  const off = tester([]);
  for (const t of ['lime', 'limes', 'juice of 2 limes', 'lime zest', 'seville orange marmalade']) {
    assert.equal(checkText(t, planFor(on), matcher, on).verdict, 'caution', t);
    assert.equal(checkText(t, planFor(off), matcher, off).verdict, 'pass', t + ' without the medicine');
  }
  for (const t of ['navel orange', 'orange juice']) assert.equal(checkText(t, planFor(on), matcher, on).verdict, 'pass', t);
  const text = rule('medication-food-interactions', 'med-grapefruit').text;
  assert.match(text, /\blime\b/);
  assert.doesNotMatch(text, /Other citrus is fine/);
  assert.match(text, /navel or Valencia/);
});

// ---------------------------------------------------------------- [3] warfarin source
test('[3] the warfarin rule cites the systematic review on steady vitamin K and keeps Holbrook', () => {
  assert.deepEqual(rule('medication-food-interactions', 'med-warfarin-vitamin-k').sources, ['violi-2016', 'holbrook-2005']);
});

// ---------------------------------------------------------------- [4] levothyroxine timing follows the ATA guideline
test('[4] both levothyroxine rules say 60 minutes before breakfast or bedtime 3 or more hours after eating, and call the 4-hour gap untested', () => {
  for (const [m, id] of [['medication-food-interactions', 'med-levothyroxine-timing'], ['thyroid', 'thyroid-levothyroxine-timing']]) {
    const r = rule(m, id);
    assert.match(r.text, /60 minutes before breakfast/, id);
    assert.match(r.text, /3 or more hours after the evening meal/, id);
    assert.match(r.text, /untested/, id);
    assert.doesNotMatch(r.text, /30 to 60 minutes|3 to 4 hours/, id);
    assert.equal(r.empty_stomach_minutes_before_food_min, 60, id);
  }
  const all = JSON.stringify([conditions, articles, dictionaries]);
  assert.doesNotMatch(all, /30 to 60 minutes before (food|breakfast)/);
  assert.doesNotMatch(all, /Meal schedules then keep/, 'the app does not move meals on the clock');
});

// ---------------------------------------------------------------- [6] [8] [9] low histamine list against the SIGHI leaflet
import { approvedFor } from '../src/engine/dietlists.js';
import { checkRecipe } from '../src/engine/checker.js';
const hist = t => { const r = approvedFor(t, 'low-histamine', lists, {}); return r.why === 'avoid' ? 'avoid' : r.approved ? 'ok' : r.why; };

test('[6] meat and fish stocks are left out however they are made; a quick homemade vegetable stock is still water', () => {
  for (const t of ['quick homemade chicken stock', 'homemade beef stock, simmered under 30 minutes', 'fish stock', 'bone broth']) assert.equal(hist(t), 'avoid', t);
  for (const t of ['quick homemade vegetable stock', 'homemade vegetable stock', 'water']) assert.equal(hist(t), 'ok', t);
});

test('[8] [9] the leaflet decides: its avoid and risky foods are left out, its well tolerated ones stay', () => {
  for (const t of ['banana', 'almonds', 'pistachios', 'pine nuts', 'lentils', 'chickpeas', 'tofu', 'black pepper', 'salt and pepper', 'red pepper flakes', 'pear', 'green beans', 'peas', 'ground turkey', 'beef mince', 'rice milk', 'oat milk', 'canned corn', 'balsamic vinegar', 'vinegar', 'shrimp', 'avocado']) assert.equal(hist(t), 'avoid', t);
  for (const t of ['1 red bell pepper, diced', 'chestnuts', 'macadamias', 'almond milk', 'coconut milk', 'white vinegar', 'apple cider vinegar', 'corn', 'turkey breast', 'kale', 'grapes', 'buckwheat', 'salmon']) assert.equal(hist(t), 'ok', t);
});

test('[8] [9] every Peace Meal recipe written for low histamine passes it, and those named for a food now left out are written for another diet or none', () => {
  const mcas = tester(['mcas']);
  const plan = planFor(mcas);
  const foodsById = new Map(J('foods.json').map(f => [f.id, f]));
  const recipes = J('recipes.json');
  for (const r of recipes.filter(x => (x.diet_written_for || []).includes('low-histamine'))) assert.equal(checkRecipe(r, plan, matcher, foodsById, mcas).verdict, 'pass', r.id);
  for (const id of ['lh-lentil-carrot-soup', 'lh-pear-oat-crumble', 'lh-turkey-meatballs-pumpkin-sauce', 'lfh-banana-oat-porridge']) {
    const r = recipes.find(x => x.id === id);
    assert.ok(r, id + ' is kept');
    assert.ok(!(r.diet_written_for || []).includes('low-histamine'), id);
  }
});

// ---------------------------------------------------------------- [5] recipes without nutrition numbers and daily limits
import { buildWeekPlan, plannerMayUse, plannerHasNutrition } from '../src/engine/planner.js';

test('[5] a person with a daily limit never gets a recipe without numbers in the week, even favorited with the switch on', () => {
  const foodsById = new Map(J('foods.json').map(f => [f.id, f]));
  const recipes = [...J('recipes.json'), ...J('recipes-open.json')];
  const noNumbers = recipes.filter(r => !plannerHasNutrition(r) && !(Array.isArray(r.meal) && r.meal.length === 1 && r.meal[0] === 'component'));
  assert.ok(noNumbers.length > 100, 'the no-numbers recipes are there to be picked');
  const cooking = { weekday_minutes: 45, weekend_minutes: 90, cook_days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], interest: 'simple', skill: 'confident', equipment: ['stove', 'oven', 'microwave'], leftovers: 'ok', household: 1, grocery: 'supermarket', include_unknown_nutrition: true };
  const fav = noNumbers.slice(0, 40).map(r => r.id);
  const scheduled = p => { const plan = planFor(p); const ids = new Set(); for (const seed of [0, 1]) for (const d of buildWeekPlan({ person: p, plan, recipes, foodsById, matcher, startDate: new Date('2026-10-05T00:00:00'), seed }).days) for (const m of d.meals) if (m.recipe) ids.add(m.recipe); return [...ids].filter(id => noNumbers.some(r => r.id === id)); };
  const limited = tester(['hypertension'], { cooking, favorites: { recipes: fav, foods: [] }, disliked: { recipes: [], foods: [] } });
  assert.ok(Object.keys(planFor(limited).limits).length, 'hypertension carries a daily sodium limit');
  assert.deepEqual(scheduled(limited), [], 'none scheduled for a person with a limit');
  assert.equal(plannerMayUse(noNumbers[0], limited, planFor(limited)), false);
  const free = tester([], { cooking, favorites: { recipes: fav, foods: [] }, disliked: { recipes: [], foods: [] } });
  assert.equal(Object.keys(planFor(free).limits || {}).length, 0);
  assert.equal(plannerMayUse(noNumbers[0], free, planFor(free)), true, 'without a limit, the switch still works');
});

// ---------------------------------------------------------------- [7] small serves
import { portionCheckPieces } from '../src/engine/dietlists.js';

test('[7] set amounts still show a note only; small serves logged separately in one meal add up; the histamine list shows its amounts', () => {
  const fodmap = tester(['ibs-low-fodmap']);
  const r = checkText('rolled oats, almonds', planFor(fodmap), matcher, fodmap);
  assert.equal((r.smallServe || []).length, 0, 'set amounts do not count toward the caution');
  const pieces = [{ label: 'corn', texts: ['corn'] }, { label: 'raspberries', texts: ['raspberries'] }];
  assert.deepEqual(portionCheckPieces(pieces, planFor(fodmap), lists).stacked.map(s => s.terms), [['corn', 'raspberries']], 'two small serves logged separately stack');
  const mcas = tester(['mcas']);
  const h = checkText('macadamias, pumpkin seeds', planFor(mcas), matcher, mcas);
  assert.deepEqual(h.portionNotes.map(n => [n.term, n.portion]), [['macadamia', 'small handful'], ['pumpkin seeds', 'two tablespoons']]);
  assert.equal((h.smallServe || []).length, 0, 'the histamine list shows amounts but never stacks');
  assert.equal(h.verdict, 'pass');
});

// ---------------------------------------------------------------- [10] dictionary false alarms
test('[10] the false alarms are gone and the real tags stay', () => {
  const fodmap = tester(['ibs-low-fodmap']), celiac = tester(['celiac']), milk = tester([], { allergens: ['allergen-milk'] }), none = tester([]);
  for (const t of ['bean sprouts', 'mung bean sprouts', 'beansprouts', 'avocado oil', 'lactose-free skim milk', 'sourdough spelt bread', 'rice', 'sweetcorn', 'lactose-free light cream']) assert.equal(checkText(t, planFor(fodmap), matcher, fodmap).verdict, 'pass', t);
  for (const t of ['rice', 'cooked rice', 'sweetcorn']) assert.equal(checkText(t, planFor(celiac), matcher, celiac).unrecognized.length, 0, t + ' is recognized');
  assert.equal(checkText('sourdough spelt bread', planFor(celiac), matcher, celiac).verdict, 'fail', 'spelt is still wheat and gluten');
  for (const t of ['lactose-free skim milk', 'lactose-free light cream']) assert.equal(checkText(t, planFor(milk), matcher, milk).verdict, 'fail', t + ' is still milk');
  const foods = J('foods.json');
  for (const id of ['fdc-170857', 'lf-cream-light']) assert.ok(!foods.find(f => f.id === id).tags.includes('coffee'), id + ' carries no coffee tag');
  assert.equal(checkText('light cream', planFor(none), matcher, none).hits.some(h => h.tag === 'coffee'), false);
});

// ---------------------------------------------------------------- [11] conditions step: ten common conditions first
test('[11] a new person sees ten common conditions first; rarer ones are listed below them and in search', () => {
  const c = J('conditions.json');
  assert.deepEqual(c.onboarding_common, ['hypertension', 'hyperlipidemia', 'weight-management-glp1', 't2d', 'masld', 'gerd', 'ckd-non-dialysis', 'ibs-low-fodmap', 'lactose-intolerance', 'celiac']);
  for (const id of c.onboarding_common) assert.ok(mod(id), id + ' is a module');
  assert.ok(!c.onboarding_common.includes('mcas'), 'mast cell activation is listed below the ten and found by search');
  assert.match(c.onboarding_common_note, /not a clinical ranking/);
});

// ---------------------------------------------------------------- [12] the thirty recipes for both diets are on
test('[12] the thirty recipes for both diets are on by default, existing profiles are switched on once, and the fish and steak recipes start with freshness', async () => {
  const { defaultProfile } = await import('../src/store.js');
  const rc = defaultProfile().recipe_collections;
  assert.equal(rc.review_dual, true);
  assert.equal(rc.defaults_v5, true);
  assert.match(fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8'), /!uiState\.profile\.recipe_collections\.defaults_v5\) \{ uiState\.profile\.recipe_collections\.review_dual = true;/);
  const set = J('recipes.json').filter(r => r.collection === 'review_dual');
  assert.equal(set.length, 30);
  const fish = ['lfh-herb-crusted-haddock-potatoes', 'lfh-trout-fennel-potatoes', 'lfh-cod-potato-fishcakes-dill', 'lfh-tilapia-tacos-cabbage-slaw', 'lfh-halibut-coconut-turmeric-rice', 'lfh-paprika-pollock-potatoes-salad'];
  for (const id of fish) assert.match(set.find(r => r.id === id).steps[0], /very fresh fish.*never slowly in the fridge/, id);
  assert.match(set.find(r => r.id === 'lfh-steak-pumpkin-mash-cabbage').steps[0], /not dry-aged or long-hung/);
});

// ---------------------------------------------------------------- [13] the nine VERIFY items
const sources = J('sources.json');
const source = id => sources.find(s => s.id === id);
const ruleIds = pl => [...(pl.applied || []), ...(pl.behavior || []), ...(pl.timing || []), ...(pl.info || [])].map(r => r.rule);

test('[13] item 1: no new ADA consensus report yet; checked and dated, so no VERIFY flag (A36)', () => {
  assert.ok(mod('t2d').education.contested.some(x => /none has been published/.test(x)));
  // Changed on purpose September 30, 2026: the statement is a checked, dated fact, so the flag is off (VERIFY-log A36).
  assert.equal(source('ada-nutrition-consensus-2026-expected').verify, false);
  assert.match(source('ada-nutrition-consensus-2026-expected').verify_note, /PMID 31000505/);
});

test('[13] item 2 and [15]: the CRPS source has its real citation, stays in the file, and nothing cites it', () => {
  const s = source('vitamin-c-crps-2021');
  assert.match(s.citation, /J Foot Ankle Surg 2022;61\(4\):748-754/);
  assert.ok(!s.verify);
  assert.ok(!JSON.stringify(conditions).includes('"vitamin-c-crps-2021"'), 'no module or rule cites it');
});

test('[13] item 3: GLP-1 protein is 80 to 120 g a day whatever the weight, and needs no weight', () => {
  const r = rule('weight-management-glp1', 'wm-glp1-protein');
  assert.equal(r.min, 80); assert.equal(r.max, 120); assert.equal(r.per_kg, false); assert.equal(r.unit, 'g/day'); assert.ok(!r.verify);
  for (const kg of [60, 150]) {
    const pl = planFor(tester([], { flags: { glp1: true }, weight_kg: kg }));
    assert.equal(pl.targets.protein_g.min, 80, kg + ' kg');
    assert.equal(pl.targets.protein_g.max, 120, kg + ' kg');
  }
  const noWeight = planFor(tester([], { flags: { glp1: true } }));
  assert.equal(noWeight.targets.protein_g.min, 80);
  assert.ok(!(noWeight.notices || []).some(n => n.code === 'weight-needed' && /protein/i.test(n.text)), 'no weight needed');
});

test('[13] item 4: vegetarian rules cite the 2025 Academy position; pregnancy and breastfeeding get a referral reminder', () => {
  const m = mod('vegetarian-vegan');
  assert.equal(m.sources[0], 'and-vegetarian-position-2025');
  for (const r of m.rules) assert.ok(r.sources.includes('and-vegetarian-position-2025'), r.id);
  assert.match(rule('vegetarian-vegan', 'veg-attention-nutrients').text, /choline/);
  assert.match(m.education.plain, /can be nutritionally adequate/);
  assert.ok(source('and-vegetarian-position-2025'));
  assert.ok(!source('and-vegetarian-position-2016').verify);
  const veg = extra => tester(['vegetarian-vegan'], { sex: 'female', variants: { 'vegetarian-vegan': ['vegetarian'] }, ...extra });
  assert.ok(!ruleIds(planFor(veg({}))).includes('veg-life-stages'), 'not shown to other adults');
  assert.ok(ruleIds(planFor(veg({ pregnancy: true }))).includes('veg-life-stages'), 'pregnant');
  assert.ok(ruleIds(planFor(veg({ breastfeeding: true }))).includes('veg-life-stages'), 'breastfeeding');
});

test('[13] items 5 to 7: SCOFF, ACOG 190, and the Academy 2014 pregnancy position carry what was found', () => {
  const scoff = source('scoff-questionnaire');
  assert.match(scoff.citation, /BMJ 1999;319/); assert.doesNotMatch(scoff.citation, /public domain per/); assert.ok(!scoff.verify);
  assert.match(source('acog-pb-190-2018').citation, /Reaffirmed 2026/); assert.ok(!source('acog-pb-190-2018').verify);
  assert.match(source('and-pregnancy-position-2014').citation, /Not a current Academy position/); assert.ok(!source('and-pregnancy-position-2014').verify);
  assert.ok(!mod('pregnancy-gdm-breastfeeding').education.contested.some(x => /VERIFY/.test(x)));
});

test('[13] item 8: coconut and chestnut stay tree nuts on purpose, and heartnut is now recognized', () => {
  const nut = tester([], { allergens: ['allergen-tree-nut'] });
  for (const t of ['coconut milk', 'coconut sugar', 'coconut oil', 'chestnuts', 'heartnut', 'heartnuts']) assert.equal(checkText(t, planFor(nut), matcher, nut).verdict, 'fail', t);
  assert.match(dictionaries.tags['allergen-tree-nut'].description, /12 tree nuts/);
  assert.ok(!dictionaries.notes.some(n => /VERIFY the current list/.test(n)));
});

test('[13] item 9: the support text gives the Alliance helpline and 988', async () => {
  const { SUPPORT_TEXT } = await import('../src/engine/screen.js');
  const text = SUPPORT_TEXT.referral.map(r => r.name + ' ' + r.detail).join(' ');
  assert.match(text, /\(866\) 662-1235/);
  assert.match(text, /988/);
  assert.ok(!SUPPORT_TEXT.referral.some(r => /NEDA/.test(r.name)));
});

// ---------------------------------------------------------------- dictionary: except phrases match their plurals
test('except phrases also match their plural, as the dictionary notes say', () => {
  const milk = tester([], { allergens: ['allergen-milk'] }), nut = tester([], { allergens: ['allergen-tree-nut'] });
  assert.equal(checkText('butter beans', planFor(milk), matcher, milk).verdict, 'pass');
  assert.equal(checkText('butter', planFor(milk), matcher, milk).verdict, 'fail', 'butter is still milk');
  assert.equal(checkText('water chestnuts', planFor(nut), matcher, nut).verdict, 'pass');
  const tags = t => Object.keys(matcher.tagText(t).tags);
  assert.ok(!tags('salmon steaks').includes('red-meat'));
  assert.ok(tags('beef steaks').includes('red-meat'));
  assert.ok(!tags('green beans').includes('fodmap-gos'));
  assert.ok(!tags('wax beans').includes('fodmap-gos'));
  assert.ok(tags('chick peas').includes('fodmap-gos') && tags('chick peas').includes('legume'));
  for (const t of ['ham hock', 'ham hocks']) assert.ok(tags(t).includes('histamine-high'), t);
});

// ---------------------------------------------------------------- [14] the fonts ship with the app
test('[14] the fonts ship with the app: no request to Google, every font file is present, and the licence travels with them', () => {
  const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
  const index = read('index.html');
  assert.doesNotMatch(index, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.match(index, /href="src\/fonts\/fonts\.css"/);
  const css = read('src/fonts/fonts.css');
  assert.doesNotMatch(css, /https?:\/\/fonts\./);
  const files = [...css.matchAll(/url\(([a-z0-9-]+\.woff2)\)/g)].map(m => m[1]);
  assert.equal(files.length, 9);
  for (const f of files) assert.ok(fs.statSync(new URL('../src/fonts/' + f, import.meta.url)).size > 1000, f);
  assert.match(css, /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.match(css, /Copyright 2020 Braille Institute of America/);
  assert.match(css, /Copyright 2018 The Fraunces Project Authors/);
  for (const f of ['OFL-Atkinson-Hyperlegible.txt', 'OFL-Fraunces.txt']) assert.match(read('src/fonts/' + f), /SIL Open Font License/);
  const bundle = read('tools/bundle.mjs');
  assert.match(bundle, /data:font\/woff2;base64/, 'the single-file builds inline the fonts');
});

// ---------------------------------------------------------------- [10] follow-up: plain "rice" must not make rice products look safe
test('[10] plain rice passes for celiac, but crisped rice cereal, pilaf and rice mixes, fried rice, and vermicelli ask first', () => {
  const celiac = tester(['celiac']);
  for (const t of ['rice', 'basmati rice', 'glutinous rice', 'risotto rice', 'rice paper wrappers', '50 g cooked rice vermicelli']) assert.equal(checkText(t, planFor(celiac), matcher, celiac).verdict, 'pass', t);
  for (const t of ['25 Tablespoons (100g) Rice Crispy Cereal', 'Rice Krispies', 'crisped rice bar', 'rice pops', 'rice cereal', '1½ cups rice pilaf mix', 'rice mix', '1 serving of fried rice', 'rice and vermicelli mix', '200 g dry vermicelli']) assert.equal(checkText(t, planFor(celiac), matcher, celiac).verdict, 'caution', t);
});
