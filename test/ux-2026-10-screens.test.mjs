// UX pass, October 2026 (owner items 2 and 8): a read of every screen in both builds, as a person sees it. These tests
// hold the fixes in place: screens that showed stored ids or wrong facts, the grocery list's amounts and names, the
// Plan's empty sections, and the simpler Peace Meal for one (lite). Every person here is made up.
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
uiState.data = { conditions: C.modules, dictionaries: D, recipes: [], foods: [], sources: [] };
uiState.conditionsMeta = { flags: C.flags || {} };
uiState.conditionsById = new Map(C.modules.map(m => [m.id, m]));
uiState.sourcesById = new Map();
uiState.matcher = buildMatcher(D);
const grocery = await import('../src/engine/grocery.js');
const { buildWeekPlan } = await import('../src/engine/planner.js');
const { logMealLabel } = await import('../src/ui/log.js');
const people = await import('../src/ui/people.js');
const week = await import('../src/ui/week.js');
const { hhColumnName } = await import('../src/ui/household.js');
const { liteLimitText } = await import('../src/ui/lite.js');
const { planAlsoCheckedHTML } = await import('../src/ui/plan.js');

function stub() {
  return { innerHTML: '', value: '', checked: false, open: false, textContent: '', dataset: {}, style: {}, isConnected: true,
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, removeAttribute() {}, getAttribute: () => null,
    querySelector: () => stub(), querySelectorAll: () => [], closest: () => null, focus() {}, scrollIntoView() {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false } };
}
const person = extra => uiEnsurePerson({ id: 't1', name: 'Test Person', adult: true, modules: [], allergens: [], variants: {}, flags: {}, optional_rules: [], rule_settings: {}, confirmations: [], ...extra });
function draw(p, step) { uiState.profile = { people: [p], log: [], diary: [], weights: [] }; const box = stub(); people.peopleRenderStep(box, p, step); return box.innerHTML; }

test('the log names meals and entries as a person says them, not by stored id', () => {
  assert.equal(logMealLabel('snack-am'), 'Morning snack');
  assert.equal(logMealLabel('snack-pm'), 'Afternoon snack');
  assert.equal(logMealLabel('breakfast'), 'Breakfast');
  assert.equal(logMealLabel('symptom'), 'Symptoms');
  assert.equal(logMealLabel('snack'), 'Snack');
  const src = R('src/ui/log.js');
  assert.match(src, /\$\{uiEsc\(logMealLabel\(m\.slot\)\)\}: \$\{uiEsc\(m\.name\)\}<\/option>/, 'the plan menu');
  assert.match(src, /<div class="list-title">\$\{uiEsc\(logMealLabel\(e\.meal\)\)\}/, 'the last 14 days');
  assert.equal((src.match(/claim to find causes/g) || []).length, 1, 'said once, in the heading');
});

test('Settings, About and the Recipes screen name the same recipe sources, and only the ones this build carries', () => {
  uiState.lite = true;
  const lite = common.uiRecipeSourcesText();
  uiState.lite = false;
  const full = common.uiRecipeSourcesText();
  assert.doesNotMatch(lite, /Wikibooks|USDA/, 'Peace Meal for one carries neither');
  for (const s of ['NHS website', 'Parent Club', 'NHLBI', 'the VA']) { assert.ok(lite.includes(s), s); assert.ok(full.includes(s), s); }
  assert.match(full, /USDA MyPlate Kitchen/);
  assert.match(full, /Wikibooks Cookbook \(CC BY-SA 4\.0\)/);
  assert.match(R('src/ui/settings.js'), /<dt>Recipes<\/dt><dd>\$\{uiRecipeSourcesText\(\)\}\./);
  assert.match(R('src/ui/recipes.js'), /Recipes come from \$\{uiRecipeSourcesText\(\)\}\./);
});

test('grocery amounts read as a shopper says them', () => {
  const t = grocery.groceryAmountText;
  assert.equal(t(98, { label: '1 Onion Edible', grams: 197 }), '½ onion (98 g)', 'no "Onion Edible"');
  assert.equal(t(20, { label: '1 Onion Edible', grams: 197 }), '20 g', 'a tenth of an onion is not "¼ onion"');
  assert.equal(t(330, { label: '1 cup', grams: 220 }), '1½ cups (330 g)');
  assert.equal(t(160, { label: '1 slice', grams: 32 }), '5 slices (160 g)');
  assert.equal(t(210, { label: '3 oz', grams: 85 }), '7½ oz (210 g)', 'a "3 oz" portion is multiplied out');
  assert.equal(t(330, { label: '1 cup (8 fl oz)', grams: 244 }), '1½ cups (330 g)');
  assert.equal(t(95, { label: '0.33 package (10 oz)', grams: 95 }), '⅓ package (10 oz) (95 g)');
  assert.equal(t(150, { label: '0.75 cup (1 NLEA serving)', grams: 100 }), '1 cup (150 g)', 'no "NLEA"');
  assert.equal(t(60, { label: '1 serving 1/2 cup', grams: 120 }), '¼ cup (60 g)');
  assert.equal(t(300, { label: '1 leaf', grams: 10 }), '30 leaves (300 g)');
  assert.equal(t(5, { label: '1 cup', grams: 240 }), '5 g', 'a pinch of a cup is clearer in grams');
  assert.equal(t(2400, { label: '1 cup', grams: 240 }), '10 cups (2,400 g)');
  assert.equal(t(1200, null), '1,200 g');
});

test('a line from recipe text is named in the recipe\'s own words, and how much of it the week needs is said in words', () => {
  const n = grocery.groceryTextLabel;
  assert.equal(n('4 skinless haddock fillets'), 'Skinless haddock fillets');
  assert.equal(n('100g seedless grapes, halved'), 'Seedless grapes');
  assert.equal(n('1 small handful of watercress'), 'Watercress');
  assert.equal(n('1 C couscous (try whole-wheat couscous)'), 'Couscous');
  assert.equal(n('half a lemon, juiced'), 'Lemon');
  assert.equal(n('3 tablespoons 0%-fat yoghurt'), '0%-fat yoghurt');
  assert.equal(n('40g almonds or hazelnuts, roughly chopped'), 'Almonds or hazelnuts');
  const w = grocery.groceryShareWords;
  assert.equal(w(1), '');
  assert.equal(w(0.25), 'a quarter of this');
  assert.equal(w(1 / 3), 'a third of this');
  assert.equal(w(0.5), 'half of this');
  assert.equal(w(2), 'twice this');
  assert.equal(w(1.25), '1¼ times this');
});

test('the grocery list keeps its grouping keys, shows real names, and leaves tap water off', () => {
  const foods = new Map([
    ['f-water', { id: 'f-water', name: 'Beverages, water, tap, drinking', short: 'Water, tap', group: 'Beverages', portions: [{ label: '1 fl oz', grams: 29.6 }], tags: [] }],
    ['f-rice', { id: 'f-rice', name: 'Rice, brown, cooked', short: 'Rice, brown, cooked', group: 'Cereal Grains and Pasta', portions: [{ label: '1 cup', grams: 195 }], tags: [] }]
  ]);
  const recipes = new Map([['r1', { id: 'r1', name: 'Rice bowl', servings: 4, ingredients: [{ food: 'f-water', grams: 480 }, { food: 'f-rice', grams: 780 }, { display: '1⅓ C water' }, { display: '4 skinless haddock fillets' }] }]]);
  const wk = { days: [{ date: '2026-10-08', meals: [{ slot: 'dinner', recipe: 'r1', source: 'cook', servings: 1, servingsMade: 1 }] }] };
  const g = grocery.buildGroceryList(wk, recipes, foods);
  assert.ok(!g.items.some(i => i.food === 'f-water'), 'no tap water');
  assert.ok(!g.items.some(i => /water/i.test(i.name)), 'no water from recipe text either');
  const rice = g.items.find(i => i.food === 'f-rice');
  assert.equal(rice.quantity, '1 cup (195 g)');
  const fish = g.items.find(i => i.textOnly);
  assert.equal(fish.name, 'Skinless haddock fillets');
  assert.equal(fish.food, 'text:' + grocery.groceryTextKey('4 skinless haddock fillets'), 'ticks and edits are saved under the unchanged key');
  assert.equal(fish.quantity, '4 skinless haddock fillets (a quarter of this, for Rice bowl)');
});

test('one person is never told to cook more than three days of leftovers', () => {
  const dict = { tags: {}, entries: [] };
  const matcher = buildMatcher(dict);
  const foodsById = new Map([['f-bean', { id: 'f-bean', name: 'Beans', short: 'Beans', group: 'Legumes', per100g: { kcal: 120, sodium_mg: 5, protein_g: 8 }, portions: [{ label: '1 cup', grams: 170 }], tags: [] }]]);
  const big = { id: 'big', name: 'Big pot of beans', meal: ['lunch', 'dinner'], servings: 16, active_min: 20, total_min: 30, skill: 'beginner', equipment: ['stove'], assembly_only: false, leftovers: 'good', ingredients: [{ food: 'f-bean', grams: 2400 }], tags: [] };
  const oats = { id: 'oats', name: 'Oats', meal: ['breakfast'], servings: 1, active_min: 5, total_min: 5, skill: 'beginner', equipment: [], assembly_only: true, leftovers: 'poor', ingredients: [{ food: 'f-bean', grams: 50 }], tags: [] };
  for (const [leftovers, cap] of [['good', 6], ['ok', 4]]) {
    const p = { id: 'p1', allergens: [], preferences: { avoid_tags: [], avoid_terms: [] }, cooking: { weekday_minutes: 45, weekend_minutes: 60, cook_days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], interest: 'simple', skill: 'comfortable', equipment: ['stove'], leftovers, household: 1 } };
    const wk = buildWeekPlan({ person: p, plan: { avoid: {}, prefer: {}, limits: {}, targets: {} }, recipes: [big, oats], foodsById, matcher, startDate: new Date('2026-10-08'), seed: 1 });
    const made = wk.days.flatMap(d => d.meals).filter(m => m.recipe === 'big' && m.source !== 'leftover').map(m => m.servingsMade);
    assert.ok(made.length, 'the pot of beans is planned');
    for (const n of made) assert.ok(n <= cap, `${leftovers}: makes ${n}, at most ${cap}`);
  }
});

test('Basics: the pregnancy questions are asked only of someone who could be pregnant, and the note says what a yes does', () => {
  assert.equal(people.peopleReproHidden({ sex: 'male' }), true);
  assert.equal(people.peopleReproHidden({ sex: 'female', age: 72 }), true);
  assert.equal(people.peopleReproHidden({ sex: 'female', age: 54 }), false);
  assert.equal(people.peopleReproHidden({ sex: 'female' }), false, 'age not given: asked');
  assert.equal(people.peopleReproHidden({ sex: 'female', age: 72, pregnancy: true }), false, 'a yes already given stays visible');
  const html = draw(person({ sex: 'female', age: 72 }), 'basics');
  assert.match(html, /<div id="pb-repro" hidden>/);
  assert.match(html, /A yes to either turns on the pregnancy and breastfeeding rules/);
  assert.doesNotMatch(html, /Either answer turns on/);
});

test('Review: plain labels, and no pregnancy row for someone who is not asked', () => {
  const html = draw(person({ sex: 'female', age: 72, cooking: { interest: 'simple', household: 1 } }), 'review');
  assert.match(html, /<dt>Sex, age<\/dt><dd>Female, 72<\/dd>/);
  assert.doesNotMatch(html, /Pregnant or breastfeeding/);
  assert.match(html, /cook if it&#39;s simple, cooking for 1/);
  const young = draw(person({ sex: 'female', age: 30 }), 'review');
  assert.match(young, /<dt>Pregnant or breastfeeding<\/dt><dd>No<\/dd>/);
});

test('Week: the no-numbers switch names the daily limits in plain words', () => {
  assert.equal(week.weekLimitPhrase({ sodium_mg: { value: 2300 } }), 'a daily sodium limit');
  assert.equal(week.weekLimitPhrase({ sodium_mg: { value: 2300 }, potassium_mg: { value: 2000 } }), 'daily sodium and potassium limits');
  assert.equal(week.weekLimitPhrase({}), '');
  const src = R('src/ui/week.js');
  assert.match(src, /Only recipes that pass every check are planned: \$\{uiFmtNum\(week\.eligibleCount\)\} do/);
  assert.doesNotMatch(src, /recipes are eligible/, 'no more "114 of 841 eligible; 2,009 left out"');
  assert.doesNotMatch(src, /Days over the line are marked "over"/, 'the calorie chart claimed a mark the day totals never showed');
});

test('Together: two people with the same first name get different column headings', () => {
  const a = { id: 'a', name: 'Sample A' }, b = { id: 'b', name: 'Sample B' }, c = { id: 'c', name: 'Other Person' };
  assert.equal(hhColumnName(a, [a, b, c]), 'Sample A');
  assert.equal(hhColumnName(b, [a, b, c]), 'Sample B');
  assert.equal(hhColumnName(c, [a, b, c]), 'Other');
});

test('the doctor report says limits with their units, one weight as one weight, and food without numbers as logged', () => {
  assert.equal(liteLimitText('sodium_mg', 2300), 'sodium at most 2,300 mg');
  assert.equal(liteLimitText('satfat_pct_kcal', 10), 'saturated fat at most 10% of calories');
  const src = R('src/ui/lite.js');
  assert.match(src, /wt\.points\.length === 1 \? `<p class="small">1 entry: /);
  assert.match(src, /Food was logged in this range, but without nutrition numbers, so there is nothing to average\./);
});

test('Plan: checks that found nothing share one short list; anything found keeps its own section', () => {
  const empty = { conflicts: [], suppressed: [], tier2: { missing: [] }, restrictionLoad: { count: 0, threshold: 3 } };
  const html = planAlsoCheckedHTML(empty);
  assert.match(html, /Also checked/);
  for (const t of ['No conflicts between the selected conditions.', 'No rule was set aside.', 'No number from your doctor or dietitian is missing.']) assert.ok(html.includes(t), t);
  const some = planAlsoCheckedHTML({ ...empty, conflicts: [{}], tier2: { missing: [{}] } });
  assert.doesNotMatch(some, /No conflicts/);
  assert.doesNotMatch(some, /No number from your doctor/);
  const src = R('src/ui/plan.js');
  assert.doesNotMatch(src, /muted small">(No phased protocols are active|No two-mode conditions are active)/);
  assert.doesNotMatch(src, /Every rule above is shown with its source\./, 'the heading already says it');
});

test('Peace Meal for one: Recipes opens on "Fits my plan", and the long filter row sits behind More filters', () => {
  const src = R('src/ui/recipes.js');
  assert.match(src, /function recipesDefaultUi\(\) \{ return \{[^}]*fits: !!uiState\.lite/);
  assert.match(src, /recipesUi = recipesDefaultUi\(\); uiState\.rerender\(\);/, 'Clear filters goes back to the same start');
  assert.match(src, /<details class="pick-more filter-more"[^>]*><summary><span class="pick-title">More filters<\/span>/);
  const front = src.slice(src.indexOf('aria-label="Filters"'), src.indexOf('pick-more filter-more'));
  for (const f of ["chip('fav'", "chip('fits'", "chip('quick'", 'id="rc-meal"']) assert.ok(front.includes(f), `${f} stays in view`);
  for (const f of ["chip('featured'", "chip('nutrition'", "'source:'", "chip('veg:vegetarian'", 'id="rc-cuisine"']) assert.ok(!front.includes(f), `${f} moves behind More filters`);
});

test('Peace Meal for one: Settings and the profile list leave out what cannot apply on this build', () => {
  const s = R('src/ui/settings.js');
  assert.match(s, /\$\{uiState\.lite && !guests\.length \? '' : uiSection\('Guests'/, 'Guests come from the Together screen, which this build does not have');
  assert.match(s, /\$\{uiState\.lite \? '' : uiSection\('Calendar export'/, 'the Grocery screen explains its own Calendar button');
  assert.match(s, /\$\{uiState\.lite && !sharingAvailable\(\) \? '' : uiSection\('Sharing and privacy'/);
  assert.doesNotMatch(s, /Export JSON|Copy JSON to clipboard/);
  assert.doesNotMatch(s, /Add to calendar \(\.ics\)" on the Grocery and Together screens/, 'Together has no calendar button');
  assert.doesNotMatch(s, /Reviewed and switched on September 30, 2026/);
  const p = R('src/ui/people.js');
  assert.match(p, /\$\{uiState\.lite && sharingState\(\)\.ready && !sharingAvailable\(\) \? '' : uiSection\('Other people using Peace Meal'/);
  assert.match(p, /`\$\{mods\} conditions and diets`/);
  assert.doesNotMatch(p, /module\$\{mods === 1/);
  assert.match(p, /uiState\.lite \? 'stove, oven and microwave; some leftovers; a full supermarket'/, 'typical answers do not set two people in a build for one');
});

test('Peace Meal for one: the phone header shows the full name of the app, and the person by initials', () => {
  const css = R('src/app.css');
  assert.match(css, /@media \(max-width: 439px\) \{ html\.lite \.topbar \.who-name, html\.lite \.topbar \.lite-tag \{ display: none; \} \}/);
  assert.match(css, /\.choice\.big-check \.choice-body > \.small \{ display: block;/, '"...the week" and its explanation no longer run together');
  assert.match(css, /@media \(max-width: 359px\) \{ html\.lite \.topbar \.brand-name \{ font-size: var\(--fs-17\); \} \}/, 'at 320 px (Display Zoom) the name still fits');
});

test('Today and Home: an entry without numbers says so instead of printing empty units', () => {
  const t = R('src/ui/today.js');
  assert.match(t, /'no nutrition numbers'/);
  assert.match(t, /\$\{e\.nutrients \? `<div class="entry-nut">/);
  assert.doesNotMatch(t, /'as entered'/);
  assert.doesNotMatch(t, /Stored in kilograms for the rules that need it/);
  const h = R('src/ui/home.js');
  assert.match(h, /nutrition numbers` : ''\}/);
  assert.doesNotMatch(h, /logged so far against an estimated target of/, 'the ring beside it already shows the target');
});

test('Check: no food count that means nothing to the reader', () => {
  const c = R('src/ui/check.js');
  assert.doesNotMatch(c, /foods Today uses when you log a meal/);
  assert.match(c, /Answers are checked against \$\{uiEsc\(person\.name\)\}'s plan\. Anything the app does not recognize is reported, never assumed safe\./);
});
