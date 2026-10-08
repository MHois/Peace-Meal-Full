// Regression tests for the September 2026 outside audit. Each one failed on the code before the fix it names.
// Item numbers in brackets are the audit's.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildMatcher } from '../src/engine/dictionary.js';
import { buildPlan } from '../src/engine/plan.js';
import { checkText, checkRecipe, planRestricts } from '../src/engine/checker.js';
import { approvedFor, listItemsFor } from '../src/engine/dietlists.js';
import { adaptRecipe } from '../src/engine/swaps.js';
import { checkHeadline } from '../src/ui/check.js';

const J = f => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const conditions = J('conditions.json').modules, dictionaries = J('dictionaries.json'), lists = J('diet-lists.json'), swaps = J('swaps.json');
const foodsById = new Map(J('foods.json').map(f => [f.id, f]));
const recipesById = new Map(J('recipes.json').map(r => [r.id, r]));
const matcher = buildMatcher(dictionaries); matcher.dietLists = lists;
const tester = (modules, extra = {}) => ({ id: 't1', name: 'Test Person', adult: true, age: 44, sex: 'female', modules, allergens: [], preferences: { avoid_tags: [], avoid_terms: [] }, medications: {}, tier2: {}, phases: {}, modes: {}, acknowledged: [], flags: {}, variants: {}, ...extra });
const planFor = p => buildPlan({ person: p, conditions, dictionaries, today: new Date('2026-09-29') });

const celiac = tester(['celiac']);
const celiacPlan = planFor(celiac);
const mcas = tester(['mcas']);
const mcasPlan = planFor(mcas);
const fodmap = tester(['ibs-low-fodmap']);
const fodmapPlan = planFor(fodmap);

// ---------------------------------------------------------------- [1] unrecognized text is never a pass
test('[1] celiac, no allergens: a misspelled or unknown ingredient is a caution, never PASS', () => {
  for (const text of ['ryc crisps, salt', 'water, mystery powder']) {
    const r = checkText(text, celiacPlan, matcher, celiac);
    assert.notEqual(r.verdict, 'pass', text);
    assert.equal(r.verdict, 'caution', text);
    assert.ok(r.unrecognized.length, `${text}: the unknown piece is reported`);
    assert.notEqual(checkHeadline(r), 'Nothing in the plan flags this.', text);
  }
});

test('[1] the lite result for text the app cannot place reads "Not sure. Ask before eating."', () => {
  const r = checkText('water, mystery powder', celiacPlan, matcher, celiac);
  assert.equal(checkHeadline(r, true), 'Not sure. Ask before eating.');
  assert.match(checkHeadline(r, false), /^Not sure/);
});

test('[1] any restricting condition counts, not only an allergen; a preference alone does not', () => {
  for (const mods of [['hypertension'], ['t2d'], ['celiac'], ['mcas'], ['ibs-low-fodmap'], ['gout']]) {
    const p = tester(mods);
    const plan = planFor(p);
    assert.equal(planRestricts(plan, p), true, mods.join());
    assert.equal(checkText('water, mystery powder', plan, matcher, p).verdict, 'caution', mods.join());
  }
  const none = tester([]);
  assert.equal(planRestricts(planFor(none), none), false);
  assert.equal(checkText('water, mystery powder', planFor(none), matcher, none).verdict, 'pass', 'nothing restricted: nothing to protect');
  assert.notEqual(checkHeadline(checkText('water, mystery powder', planFor(none), matcher, none)), 'Nothing in the plan flags this.', 'the words are still called out');
  const pref = tester([], { preferences: { avoid_tags: ['red-meat'], avoid_terms: [] } });
  assert.equal(planRestricts(planFor(pref), pref), false, 'a personal preference is not a medical restriction');
});

test('[1] an ambiguous term is a caution under a restricting plan; naming the kind settles it, and the label check stays', () => {
  const ambiguous = checkText('tortillas', celiacPlan, matcher, celiac);
  assert.equal(ambiguous.verdict, 'caution');
  assert.ok(ambiguous.unknownRisk.some(u => u.term === 'tortilla'));
  const corn = checkText('corn tortillas', fodmapPlan, matcher, fodmap);
  assert.deepEqual(corn.unknownRisk, [], '"corn tortilla" says which kind');
  assert.equal(corn.verdict, 'pass', 'corn tortillas are on the low FODMAP list');
  const cornCeliac = checkText('corn tortillas', celiacPlan, matcher, celiac);
  assert.equal(cornCeliac.verdict, 'caution', 'celiac still checks the label of corn tortillas for wheat');
  assert.ok(cornCeliac.verifyLabel.some(v => v.tag === 'gluten'));
});

test('[1] the label checker applies the strict FODMAP and histamine lists, as recipes do', () => {
  const r = checkText('rice flour, xanthan gum, salt', fodmapPlan, matcher, fodmap);
  assert.equal(r.verdict, 'caution');
  assert.deepEqual(r.strictFamilies, ['low-fodmap']);
  assert.deepEqual(r.notApproved.map(n => n.label), ['xanthan gum']);
  assert.equal(checkHeadline(r, true), 'Not sure. Ask before eating.');
  assert.equal(checkText('rice flour, salt', fodmapPlan, matcher, fodmap).verdict, 'pass');
  const off = tester(['ibs-low-fodmap'], { strict_diets: { 'low-fodmap': false } });
  assert.deepEqual(checkText('rice flour, xanthan gum, salt', fodmapPlan, matcher, off).notApproved, [], 'strict mode off: the list is not applied');
  // owner question 9 (September 30, 2026): pear moved to the leave-out list, so blueberries stand in as the approved fruit
  const h = checkText('apple, blueberries', mcasPlan, matcher, mcas);
  assert.equal(h.verdict, 'pass');
  assert.notEqual(checkText('apple, pear', mcasPlan, matcher, mcas).verdict, 'pass', 'pear is on the leave-out list');
  assert.equal(checkText('apple, papaya', mcasPlan, matcher, mcas).verdict, 'caution', 'papaya is not on the low histamine list');
});

// ---------------------------------------------------------------- [2] histamine leave-out examples come first
test('[2] MCAS: leftovers and stock cubes are not PASS even though chicken is on the approved list', () => {
  for (const text of ['leftover roast chicken', '1 chicken stock cube']) {
    const r = checkText(text, mcasPlan, matcher, mcas);
    assert.notEqual(r.verdict, 'pass', text);
    assert.equal(r.verdict, 'caution', text);
  }
  assert.equal(approvedFor('leftover roast chicken', 'low-histamine', lists, {}).why, 'avoid');
  assert.equal(approvedFor('1 chicken stock cube', 'low-histamine', lists, {}).why, 'avoid');
  assert.equal(approvedFor('roast chicken', 'low-histamine', lists, {}).approved, true, 'fresh chicken is still approved');
  // strict mode off: the dictionary alone still flags leftovers
  const off = tester(['mcas'], { strict_diets: { 'low-histamine': false } });
  assert.equal(checkText('leftover roast chicken', mcasPlan, matcher, off).verdict, 'caution');
});

test('[2] leave-out examples match what is written: "canned fish" does not catch white fish', () => {
  assert.equal(approvedFor('2 white fish fillets', 'low-histamine', lists, {}).approved, true);
  assert.equal(approvedFor('1 cup cooked quinoa (leftover)', 'low-histamine', lists, {}).why, 'avoid');
  assert.equal(approvedFor('a handful of strawberries', 'low-histamine', lists, {}).why, 'avoid');
});

test('[2] a food the person marked as tolerated still wins over the general leave-out examples', () => {
  const p = tester(['mcas'], { diet_lists: { 'low-histamine': { tolerated: [{ term: 'strawberries' }], reacts: [] } } });
  assert.equal(approvedFor('a handful of strawberries', 'low-histamine', lists, p).why, 'tolerated');
});

test('[2] MCAS: Chicken and ginger rice congee (made with shop chicken broth) does not pass', () => {
  const congee = recipesById.get('chicken-ginger-congee');
  assert.ok(congee.ingredients.some(i => /chicken broth/.test(i.display)));
  const c = checkRecipe(congee, mcasPlan, matcher, foodsById, mcas);
  assert.notEqual(c.verdict, 'pass');
  assert.ok(c.notApproved.some(n => /chicken broth/.test(n.label) && n.why === 'avoid'));
});

test('[2] every Peace Meal recipe written for low histamine uses water or a quick stock, never a long-cooked meat stock', () => {
  for (const r of recipesById.values()) {
    if (!(r.diet_written_for || []).includes('low-histamine')) continue;
    for (const i of r.ingredients) assert.ok(!/chicken stock|beef stock|broth/i.test(i.display), `${r.id}: ${i.display}`);
    assert.equal(checkRecipe(r, mcasPlan, matcher, foodsById, mcas).verdict, 'pass', r.id);
  }
});

// ---------------------------------------------------------------- side effects of [1] kept honest
test('[1] an adapted copy of a recipe without linked foods keeps "same amount" out of the checked text', () => {
  const r = { id: 't-nhs', name: 'Cheddar toast', meal: ['lunch'], servings: 1, active_min: 5, total_min: 5, skill: 'beginner', equipment: ['none'], assembly_only: true, leftovers: 'poor', tags: [], source: 'NHS website', nutrition_source: 'nhs-website', nutrition_per_serving: { kcal: 250 },
    ingredients: [{ display: '2 slices bread' }, { display: '30 g cheddar' }], steps: ['Assemble.'] };
  const a = adaptRecipe(r, 'low-histamine', swaps, matcher, foodsById);
  const swapped = a.ingredients.find(i => i.replaces);
  assert.equal(swapped.display, 'fresh mozzarella');
  assert.equal(swapped.amount_text, 'same amount');
  const c = checkRecipe(a, mcasPlan, matcher, foodsById, mcas);
  assert.deepEqual(c.unrecognized, []);
  assert.equal(c.verdict, 'pass');
});

test('[1] measurement and preparation words alone are not "unrecognized"; a real unknown food next to them still is', () => {
  const unrec = t => matcher.tagText(t).unrecognized;
  assert.deepEqual(unrec('1 Medium Sized (150g) Onion'), []);
  assert.deepEqual(unrec('1 red pepper, deseeded and chopped'), []);
  assert.deepEqual(unrec('1 Tin (400g) Chopped Tomatoes'), []);
  assert.deepEqual(unrec('250g broccoli, broken into florets'), []);
  assert.deepEqual(unrec('1 onion, cut into 5cm chunks'), []);
  // P2-12 (fix pass of September 30, 2026) taught the dictionary "bay leaves", "french stick", and "low fat spread", which
  // these lines used as unknown foods. The same checks now use foods it still does not know (pandan leaves, a bloomer,
  // dairy spread), and the French stick is checked as the wheat bread it is: a stop, still never a pass.
  assert.deepEqual(unrec('2 pandan leaves'), ['2 pandan leaves'], 'pandan is not in the dictionary, so the line is still reported');
  assert.deepEqual(unrec('1 bloomer'), ['1 bloomer']);
  assert.deepEqual(unrec('2 sprigs lovage'), ['2 sprigs lovage']);
  assert.deepEqual(unrec('4 tablespoons dairy spread'), ['4 tablespoons dairy spread']);
  assert.equal(checkText('1 bloomer', celiacPlan, matcher, celiac).verdict, 'caution', 'celiac: an unknown bread is never a pass');
  assert.equal(checkText('1 french stick', celiacPlan, matcher, celiac).verdict, 'fail', 'celiac: a French stick is wheat bread');
});

test('[1] the single-food lookup on the Check screen applies the strict lists too', async () => {
  const { checkFood } = await import('../src/engine/checker.js');
  const broth = [...foodsById.values()].find(f => /broth/i.test(f.name) && /beef/i.test(f.name));
  assert.ok(broth, 'a beef broth food exists');
  const c = checkFood(broth, mcasPlan, matcher, mcas);
  assert.equal(c.verdict, 'caution', broth.name);
  assert.ok(c.notApproved.length);
  const apple = foodsById.get('fdc-167793');
  assert.equal(checkFood(apple, mcasPlan, matcher, mcas).verdict, 'pass', apple.name);
});

// ---------------------------------------------------------------- [3] stock, broth, bouillon, gravy mixes
const liteRecipes = J('recipes.json').concat(J('recipes-open.json').filter(r => r.source !== 'Wikibooks Cookbook'));
const shopStock = /\b(stock|stocks|broth|broths|bouillon|gravy)\b/i;

test('[3] celiac: stock cubes, broth, and stock ask for a label check; gravy mixes stay a hard stop', () => {
  for (const text of ['1 vegetable stock cube', '2 cups chicken broth', '2 cups beef stock', '1 stock pot']) {
    const r = checkText(text, celiacPlan, matcher, celiac);
    assert.equal(r.verdict, 'caution', text);
    assert.ok(r.verifyLabel.some(v => v.tag === 'gluten'), `${text}: gluten label check`);
    assert.equal(checkHeadline(r, true), 'Check the label for gluten before eating.', text);
  }
  assert.equal(checkText('gravy granules', celiacPlan, matcher, celiac).verdict, 'fail', 'gravy was already tagged as wheat and gluten; it stays a hard stop');
  const home = checkText('3 cups homemade chicken stock without onion or garlic', celiacPlan, matcher, celiac);
  assert.ok(!home.verifyLabel.some(v => v.tag === 'gluten'), 'homemade stock has no label to check');
});

test('[3] celiac: no lite recipe with shop stock, broth, bouillon, or gravy passes without a label check', () => {
  const uses = liteRecipes.filter(r => (r.ingredients || []).some(i => shopStock.test(i.display || '') && !/\bhomemade\b/i.test(i.display || '')));
  assert.ok(uses.length >= 90, `found ${uses.length}`);
  const passing = uses.filter(r => checkRecipe(r, celiacPlan, matcher, foodsById, celiac).verdict === 'pass').map(r => r.id);
  assert.deepEqual(passing, []);
});

test('[3] a stock cube is still a caution for allergy profiles (nothing got looser)', () => {
  for (const allergen of ['allergen-wheat', 'allergen-soy', 'allergen-milk']) {
    const p = tester([], { allergens: [allergen] });
    for (const text of ['1 chicken stock cube', '2 cups stock']) assert.notEqual(checkText(text, planFor(p), matcher, p).verdict, 'pass', `${allergen}: ${text}`);
  }
});

test('[3] MCAS: shop stock, stock cubes, bouillon, and gravy mixes are not approved; a quick homemade vegetable stock is', () => {
  for (const text of ['1 vegetable stock cube', '2 cups chicken broth', '1 tsp bouillon powder', '2 tbsp gravy granules', '1 stock pot', '3 cups homemade chicken stock']) {
    assert.equal(approvedFor(text, 'low-histamine', lists, {}).why, 'avoid', text);
    assert.equal(checkText(text, mcasPlan, matcher, mcas).verdict === 'pass', false, text);
  }
  for (const text of ['2 cups quick vegetable stock', '2 cups homemade vegetable stock', '2 cups water']) assert.equal(approvedFor(text, 'low-histamine', lists, {}).approved, true, text);
  // owner question 6 (September 30, 2026): no homemade exception for meat or fish stock; the SIGHI leaflet makes none
  assert.equal(approvedFor('2 cups quick homemade chicken stock', 'low-histamine', lists, {}).why, 'avoid');
  assert.equal(approvedFor('2 cups homemade chicken stock, simmered under 30 minutes', 'low-histamine', lists, {}).why, 'avoid');
  assert.equal(approvedFor('2 cups quick homemade vegetable stock', 'low-histamine', lists, {}).approved, true);
});

// ---------------------------------------------------------------- [4] fresh-roasted peppers, jarred and brined foods
test('[4] MCAS: jarred or brined roasted peppers are not a pass; fresh-roasted is', () => {
  for (const text of ['1 jar roasted red peppers', '1 jar (7 ounces) roasted red peppers', 'jarred roasted red peppers', 'roasted red peppers in brine', 'brined peppers']) {
    const r = checkText(text, mcasPlan, matcher, mcas);
    assert.notEqual(r.verdict, 'pass', text);
  }
  assert.equal(checkText('1 fresh-roasted red bell pepper', mcasPlan, matcher, mcas).verdict, 'pass');
  // "jarred" and "in brine" trip the same rule as vinegar, strict mode or not
  const off = tester(['mcas'], { strict_diets: { 'low-histamine': false } });
  for (const text of ['jarred roasted red peppers', 'roasted red peppers in brine']) {
    const r = checkText(text, mcasPlan, matcher, off);
    assert.ok(r.hits.some(h => h.tag === 'histamine-fermented'), text);
    assert.equal(r.verdict, 'caution', text);
  }
});

test('[4] the tomato swap for low histamine says fresh-roasted, and so does the Peace Meal quinoa bowl', () => {
  const sw = swaps.swaps.find(s => s.id === 'tomato-to-red-pepper');
  assert.match(sw.to.display, /^fresh-roasted /);
  assert.match(sw.how, /not jarred/i);
  const r = { id: 't-tom2', name: 'Tomato rice', meal: ['dinner'], servings: 2, active_min: 10, total_min: 20, skill: 'beginner', equipment: ['stove'], assembly_only: false, leftovers: 'poor', tags: [],
    ingredients: [{ food: 'fdc-168877', grams: 150, display: '¾ cup white rice' }, { food: 'fdc-170457', grams: 200, display: '2 tomatoes, chopped' }], steps: ['Cook.'] };
  const a = adaptRecipe(r, 'low-histamine', swaps, matcher, foodsById);
  assert.ok(a.ingredients.some(i => i.display === 'fresh-roasted red bell pepper'));
  assert.equal(checkRecipe(a, mcasPlan, matcher, foodsById, mcas).verdict, 'pass');
  const bowl = recipesById.get('lfh-quinoa-rainbow-bowl');
  assert.ok(bowl.ingredients.some(i => /fresh-roasted/.test(i.display)));
  assert.ok(!bowl.ingredients.some(i => /\bjar/.test(i.display)));
});

// ---------------------------------------------------------------- [11] FODMAP small serves
const sampleRecipe = lines => ({ id: 'audit-sample', name: 'Sample', servings: 2, active_min: 10, total_min: 10, ingredients: lines.map(display => ({ display })) });

test('[11] low FODMAP: two "small serve" foods in one recipe is a caution that names both and cites its sources', () => {
  const r = checkRecipe(sampleRecipe(['1 cup corn kernels', '1/2 cup raspberries', '1 tbsp olive oil']), fodmapPlan, matcher, foodsById, fodmap);
  assert.equal(r.verdict, 'caution');
  assert.equal(r.smallServe.length, 1);
  assert.deepEqual(r.smallServe[0].terms.slice().sort(), ['corn', 'raspberries']);
  assert.match(r.smallServe[0].text, /stacking several 'small serve' foods in one meal adds up/);
  assert.deepEqual(r.smallServe[0].sources, ['varney-2017', 'shepherd-2008']);
  const corn = r.portionNotes.find(n => n.term === 'corn');
  assert.ok(corn && corn.small && corn.portion === 'small serve' && /half a cob/.test(corn.note));
});

test('[11] one "small serve" food shows its portion note but stays a pass', () => {
  const r = checkRecipe(sampleRecipe(['1 cup corn kernels', '1 tbsp olive oil', 'salt']), fodmapPlan, matcher, foodsById, fodmap);
  assert.equal(r.verdict, 'pass');
  assert.equal(r.smallServe.length, 0);
  assert.deepEqual(r.portionNotes.map(n => n.term), ['corn']);
});

test('[11] set amounts (oats, almonds) show a note and do not count toward the small-serve caution', () => {
  const r = checkText('rolled oats, almonds', fodmapPlan, matcher, fodmap);
  assert.deepEqual(r.portionNotes.map(n => [n.term, n.portion]), [['oats', 'half a cup dry'], ['almonds', 'ten nuts']]);
  assert.equal(r.smallServe.length, 0);
});

test('[11] the longer wording wins: corn tortillas and corn oil are not "corn, small serve"', () => {
  for (const line of ['4 corn tortillas', '2 tbsp corn oil', '1 tsp golden syrup or corn syrup']) {
    const r = checkRecipe(sampleRecipe([line]), fodmapPlan, matcher, foodsById, fodmap);
    assert.ok(!r.portionNotes.some(n => n.term === 'corn'), line);
  }
});

test('[11] the check screen says plainly when several small serves are the only reason', () => {
  const r = checkText('corn, raspberries', fodmapPlan, matcher, fodmap);
  assert.equal(r.verdict, 'caution');
  assert.equal(checkHeadline(r), 'Several small-serve foods together. Keep each one to a small serve.');
});

test('[11] no portion notes or small-serve caution when the plan does not restrict FODMAPs', () => {
  const r = checkRecipe(sampleRecipe(['1 cup corn kernels', '1/2 cup raspberries']), celiacPlan, matcher, foodsById, celiac);
  assert.equal(r.portionNotes.length, 0);
  assert.equal(r.smallServe.length, 0);
});

// ---------------------------------------------------------------- [12] histamine evidence basis
test('[12] every low histamine item and leave-out example names its evidence basis, with sources', () => {
  const fam = lists.families['low-histamine'];
  const bases = Object.keys(fam.basis_legend);
  assert.deepEqual(bases, ['measured histamine', 'other amines', 'proposed liberator', 'SIGHI rating only']);
  const sourceIds = new Set(J('sources.json').map(s => s.id));
  assert.ok(sourceIds.has('sanchez-perez-2021'));
  const all = [...fam.groups.flatMap(g => g.items), ...fam.avoid_examples];
  for (const it of all) {
    assert.ok(bases.includes(it.basis), it.term);
    assert.ok(it.basis_sources.length && it.basis_sources.every(s => sourceIds.has(s)), it.term);
  }
  const basis = t => fam.avoid_examples.find(a => a.term === t).basis;
  assert.equal(basis('aged cheese'), 'measured histamine');
  assert.equal(basis('citrus'), 'other amines');
  assert.equal(basis('shellfish'), 'proposed liberator');
  assert.equal(basis('leftovers'), 'SIGHI rating only');
});

test('[12] after owner question 8 only the items the leaflet does not rate stay unchecked; banana, legumes, nuts, and black pepper are left out', () => {
  const fam = lists.families['low-histamine'];
  const unchecked = fam.groups.flatMap(g => g.items).filter(it => it.verified === false).map(it => it.term);
  assert.deepEqual(unchecked, ['chia seeds', 'sunflower seeds', 'cinnamon']);
  for (const t of ['banana', 'lentils', 'almonds', 'black pepper']) assert.equal(approvedFor(t, 'low-histamine', lists, {}).why, 'avoid', t);
  for (const t of ['kale', 'grapes', 'chestnuts', 'almond milk', '1 red bell pepper']) assert.equal(approvedFor(t, 'low-histamine', lists, {}).approved, true, t);
  for (const t of ['avocado', 'shellfish', 'strawberries']) assert.equal(approvedFor(t, 'low-histamine', lists, {}).why, 'avoid', t);
});

// ---------------------------------------------------------------- lite label photo: Wi-Fi the first time
test('the lite label check says plainly that reading a photo needs Wi-Fi the first time', async () => {
  const { checkOcrNote } = await import('../src/ui/check.js');
  assert.match(checkOcrNote(true), /^Reading a photo needs Wi-Fi the first time\./);
  assert.match(checkOcrNote(false), /needs the internet the first time/);
});

// ---------------------------------------------------------------- full build: Wikibooks recipes read on the first search
test('full build: the Wikibooks recipes ship in the same file but outside the launch data, and go back in their place', async () => {
  const { execFileSync } = await import('node:child_process');
  const vm = await import('node:vm');
  execFileSync(process.execPath, ['tools/bundle.mjs'], { cwd: new URL('../', import.meta.url), stdio: 'pipe' });
  const html = fs.readFileSync(new URL('../dist/nutrition-app.html', import.meta.url), 'utf8');
  const stmt = html.match(/<script>window\.__APP_DATA__ = [\s\S]*?<\/script>/)[0].slice(8, -9);
  const win = {};
  vm.runInNewContext(stmt, { window: win });
  const d = win.__APP_DATA__;
  const open = J('recipes-open.json');
  const wb = open.filter(r => r.source === 'Wikibooks Cookbook');
  assert.equal(d['recipes-open'].filter(r => r.source === 'Wikibooks Cookbook').length, 0);
  assert.equal(d.deferred.wikibooks.count, wb.length);
  const block = html.match(/<script type="application\/json" id="pm-deferred-wikibooks">([\s\S]*?)<\/script>/)[1];
  assert.ok(!block.includes('<'));
  const parsed = JSON.parse(block);
  assert.deepEqual(parsed.map(r => r.id), wb.map(r => r.id));
  // the app puts them back after d.deferred.wikibooks.after: the order is the same as the unsplit data
  const merged = [...d.recipes, ...d['recipes-open']];
  merged.splice(merged.findIndex(r => r.id === d.deferred.wikibooks.after) + 1, 0, ...parsed);
  assert.deepEqual(merged.map(r => r.id), [...J('recipes.json'), ...open].map(r => r.id));
});

// ---------------------------------------------------------------- [14] recipes without nutrition numbers and numeric limits
// Checked for the audit: by default the planner never gives a person with a daily limit a recipe it has no numbers for.
// It does when the person hearts such a recipe or turns on "Also use recipes that have no nutrition numbers"; whether to
// block that too is the owner's decision (see the final audit summary), so this test covers the default only.
test('[14] a person with a sodium limit gets no recipe without nutrition numbers in a default week', async () => {
  const { buildWeekPlan } = await import('../src/engine/planner.js');
  const all = [...J('recipes.json'), ...J('recipes-open.json')];
  const hasNutrition = r => !!(r.nutrition_per_serving && r.nutrition_source) || (r.ingredients || []).some(i => i.food);
  const none = new Set(all.filter(r => !hasNutrition(r)).map(r => r.id));
  assert.ok(none.size > 2000, 'the Wikibooks recipes have no numbers');
  const p = tester(['hypertension'], { favorites: { recipes: [], foods: [] }, disliked: { recipes: [], foods: [] }, cooking: { weekday_minutes: 45, weekend_minutes: 90, cook_days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], interest: 'simple', skill: 'confident', equipment: ['stove', 'oven', 'microwave'], leftovers: 'ok', household: 1, budget: false } });
  const plan = planFor(p);
  assert.ok(plan.limits.sodium_mg, 'the plan has a sodium limit');
  const week = buildWeekPlan({ person: p, plan, recipes: all, foodsById, matcher, startDate: new Date('2026-10-05T00:00:00'), seed: 0 });
  const planned = week.days.flatMap(d => d.meals).filter(m => m.recipe);
  assert.ok(planned.length >= 21);
  assert.deepEqual(planned.filter(m => none.has(m.recipe)).map(m => m.name), []);
  assert.ok(week.skippedNoNutrition > 2000, 'they are counted as left out');
});

// ---------------------------------------------------------------- [15] thirty recipes for low FODMAP and low histamine together
test('[15] the September 2026 set: 30 breakfasts and dinners, on by default since the September 30 review, every ingredient a USDA food, passing both diets', async () => {
  const { defaultProfile } = await import('../src/store.js');
  // Changed on purpose September 30, 2026 (owner question 12): the set was off until reviewed; it was reviewed and switched on.
  assert.equal(defaultProfile().recipe_collections.review_dual, true, 'reviewed and switched on');
  const set = J('recipes.json').filter(r => r.collection === 'review_dual');
  assert.equal(set.length, 30);
  assert.equal(set.filter(r => r.meal.includes('breakfast')).length, 15);
  assert.equal(set.filter(r => r.meal.includes('dinner')).length, 15);
  const both = planFor(tester(['ibs-low-fodmap', 'mcas']));
  const hist = lists.families['low-histamine'];
  const unchecked = hist.groups.flatMap(g => g.items).filter(it => it.verified === false);
  for (const r of set) {
    assert.deepEqual(r.diet_written_for, ['low-fodmap', 'low-histamine'], r.id);
    for (const ing of r.ingredients) {
      assert.ok(foodsById.has(ing.food), `${r.id}: ${ing.display} links to a food`);
      // nothing the histamine list marks "not re-checked" (most specific wording: "sesame oil" is the oil, not the seeds)
      const items = listItemsFor(ing.display, 'low-histamine', lists);
      assert.ok(items.length, `${r.id}: ${ing.display} is on the low histamine list`);
      assert.ok(!items.some(it => unchecked.includes(it)), `${r.id}: ${ing.display} is an unchecked histamine item`);
    }
    for (const [label, plan, p] of [['low FODMAP', fodmapPlan, fodmap], ['low histamine', mcasPlan, mcas], ['both', both, {}]]) {
      const c = checkRecipe(r, plan, matcher, foodsById, p);
      assert.equal(c.verdict, 'pass', `${r.id} for ${label}: ${JSON.stringify({ hits: c.hits.map(h => h.label), notApproved: c.notApproved, smallServe: c.smallServe })}`);
    }
    const perServing = key => r.ingredients.filter(i => i.food === key).reduce((t, i) => t + i.grams, 0) / r.servings;
    assert.ok(perServing('fdc-2346396') <= 45, `${r.id}: oats within half a cup dry per serving`);
    assert.ok(perServing('fdc-170173') <= 120, `${r.id}: coconut milk within half a cup per serving`);
  }
});

// ---------------------------------------------------------------- dietitian review (September 9): a plain-words why above each number
test('dietitian review: every number rule has a plain-words why, copied word for word from its own article', () => {
  const articles = J('articles.json');
  const cond = J('conditions.json');
  for (const m of cond.modules) for (const r of m.rules || []) {
    if (!(['limit', 'target'].includes(r.kind) && r.nutrient)) continue;
    assert.ok(typeof r.why === 'string' && r.why.length > 10, `${r.id} has a why`);
    const art = articles[m.id] || {};
    const own = [...(art.summary || []), ...(art.sections || []).flatMap(s => s.paragraphs || []), (m.education && m.education.plain) || ''].join('\n');
    assert.ok(own.includes(r.why), `${r.id}: why is the module's own words`);
    assert.ok(!/^(Myth|Mistake):/.test(r.why), `${r.id}: not a myth or mistake line`);
  }
  const p = planFor(tester(['hypertension']));
  assert.match(p.limits.sodium_mg.rules[0].why, /^Sodium raises blood pressure/);
});

test('dietitian review: a new person sees ten common conditions first; the list names real modules', () => {
  const cond = J('conditions.json');
  const ids = new Set(cond.modules.map(m => m.id));
  assert.equal(cond.onboarding_common.length, 10);
  for (const id of cond.onboarding_common) assert.ok(ids.has(id), id);
});
