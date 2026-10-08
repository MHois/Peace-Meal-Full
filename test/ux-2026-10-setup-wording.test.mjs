// UX pass, October 2026 (owner items 2 and 8): the setup steps said the same thing two and three times, and some of it
// read like a settings file. These tests hold the shorter, plainer version in place without losing what each step is for:
//  - Allergies: the soy question shows only when soy is ticked; "Exclude" now says what it does (Keep out for a hard
//    rule, Mark as caution for a soft one); the "may contain" card waits until an allergy is listed.
//  - Likes and dislikes: the two lists of twenty cuisines sit behind a + and show what is picked while closed.
//  - Review: plain names instead of stored ids, and no empty "Flags: none" or "Options: defaults" rows.
//  - Week: no PASS on every planned meal, and each day total says whether its number is a limit or a goal.
// Every person here is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = { readyState: 'loading', addEventListener() {}, removeEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], activeElement: null, documentElement: { setAttribute() {}, removeAttribute() {}, classList: { toggle() {}, add() {}, remove() {}, contains: () => false } } };
globalThis.window = { addEventListener() {}, location: { hash: '' } };
globalThis.location = { hash: '', href: 'https://example.org/' };
const C = JSON.parse(fs.readFileSync(new URL('../data/conditions.json', import.meta.url), 'utf8'));
const D = JSON.parse(fs.readFileSync(new URL('../data/dictionaries.json', import.meta.url), 'utf8'));
const { uiState, uiEnsurePerson } = await import('../src/ui/common.js');
const { buildMatcher } = await import('../src/engine/dictionary.js');
uiState.data = { conditions: C.modules, dictionaries: D, recipes: [], foods: [], sources: [] };
uiState.conditionsMeta = { flags: C.flags || {} };
uiState.conditionsById = new Map(C.modules.map(m => [m.id, m]));
uiState.sourcesById = new Map();
uiState.matcher = buildMatcher(D);
const people = await import('../src/ui/people.js');
const week = await import('../src/ui/week.js');
const src = fs.readFileSync(new URL('../src/ui/people.js', import.meta.url), 'utf8');
const weekSrc = fs.readFileSync(new URL('../src/ui/week.js', import.meta.url), 'utf8');

// A stand-in element: keeps the HTML a step draws, and hands back more stand-ins for anything the step looks up.
function stub() {
  return { innerHTML: '', value: '', checked: false, open: false, textContent: '', dataset: {}, style: {}, isConnected: true,
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, removeAttribute() {}, getAttribute: () => null,
    querySelector: () => stub(), querySelectorAll: () => [], closest: () => null, focus() {}, scrollIntoView() {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false } };
}
function draw(person, step) {
  uiState.profile = { people: [person], log: [], diary: [], weights: [] };
  const box = stub();
  people.peopleRenderStep(box, person, step);
  return box.innerHTML;
}
const person = extra => uiEnsurePerson({ id: 't1', name: 'Test Person', adult: true, modules: [], allergens: [], variants: {}, flags: {}, optional_rules: [], rule_settings: {}, confirmations: [], ...extra });
const allergyRules = C.modules.find(m => m.id === 'food-allergies').rules;
const soyRule = allergyRules.find(r => r.id === 'allergen-soy-oil-lecithin');
const mayContain = allergyRules.find(r => r.id === 'allergen-may-contain');
const oats = C.modules.find(m => m.id === 'celiac').rules.find(r => r.id === 'celiac-oats-gf');

test('a choice says what it does: Keep out for a hard rule, Mark as caution for a soft one', () => {
  const soy = people.peopleConfigurableRuleHTML(soyRule, person({ allergens: ['allergen-soy'] }));
  assert.match(soy, /value="exclude" checked data-seg="setting-soy-refined-oil-lecithin">Keep out</);
  assert.match(soy, /value="allow"\s+data-seg="setting-soy-refined-oil-lecithin">Allow</);
  assert.match(soy, /<span class="label">Refined soybean oil and soy lecithin<\/span><p class="small setting-why">Soy allergy: refined soybean oil/, 'a short title, with the rule\'s own sentence kept below it');
  assert.match(soy, /Default: Keep out\./);
  assert.doesNotMatch(soy, />Exclude</);
  const may = people.peopleConfigurableRuleHTML(mayContain, person(), { label: 'Warnings that name other foods' });
  assert.match(may, />Mark as caution</, '"may contain" is a soft rule: excluding it marks a caution, it is not a hard stop');
  assert.doesNotMatch(may, /Keep out/);
  assert.match(people.peopleConfigurableRuleHTML(oats, person()), /Certified gluten-free oats[\s\S]*value="allow" checked[\s\S]*Default: Allow\./);
});

test('the stored answers are unchanged, so nothing saved earlier changes meaning', () => {
  const html = people.peopleConfigurableRuleHTML(soyRule, person({ rule_settings: { 'soy-refined-oil-lecithin': 'allow' } }));
  assert.match(html, /<label class="on"><input type="radio" name="setting-soy-refined-oil-lecithin" value="allow" checked/);
  assert.match(html, /<label class=""><input type="radio" name="setting-soy-refined-oil-lecithin" value="exclude"/);
});

test('Allergies: the soy question shows only once soy is ticked, and "may contain" once any allergy is listed', () => {
  const none = draw(person(), 'allergens');
  assert.doesNotMatch(none, /setting-soy-refined-oil-lecithin/, 'no soy allergy, no soy question');
  assert.doesNotMatch(none, /"May contain" and shared-facility labels/, 'no allergy yet, nothing to warn about');
  assert.match(none, /Allergies are hard stops: nothing in the app overrides them\./);
  const milk = draw(person({ allergens: ['allergen-milk'] }), 'allergens');
  assert.doesNotMatch(milk, /setting-soy-refined-oil-lecithin/, 'a milk allergy does not ask the soy question');
  assert.match(milk, /"May contain" and shared-facility labels/);
  assert.match(milk, /A warning that names one of your allergies is always a stop\./, 'the hard part of the rule is still said');
  assert.match(milk, /Warnings that name other foods/);
  const soy = draw(person({ allergens: ['allergen-soy'] }), 'allergens');
  assert.match(soy, /Soybeans: ask your allergist/);
  assert.match(soy, /setting-soy-refined-oil-lecithin/);
  const other = draw(person({ allergens_other: ['kiwi'] }), 'allergens');
  assert.match(other, /"May contain" and shared-facility labels/, 'an allergy typed under Other counts too');
  assert.match(other, /Hard stops: <strong>kiwi<\/strong>/);
});

test('Allergies: ticking or unticking an allergy redraws the step, so its own questions come and go', () => {
  assert.match(src, /peopleRefresh\(container, person, 'allergens', `\[data-allergen="\$\{t\}"\]`\);/);
  assert.match(src, /peopleRefresh\(container, person, 'allergens', '#pa-other'\);/);
});

test('Likes and dislikes: the cuisine lists sit behind a + and show the picks while closed', () => {
  const html = draw(person({ preferences: { avoid_tags: [], avoid_terms: [], patterns: [], cuisines_skip: ['indian'], cuisines_love: [] } }), 'preferences');
  assert.match(html, /<details class="pick-more" data-pick="skip" ><summary><span class="pick-title">Cuisines to skip<\/span><span class="pick-summary" data-pick-summary="skip">Indian and South Asian<\/span><\/summary>/);
  assert.match(html, /<details class="pick-more" data-pick="love" ><summary><span class="pick-title">Cuisines you love<\/span><span class="pick-summary" data-pick-summary="love">None<\/span><\/summary>/);
  assert.match(html, /data-cskip="indian" checked/, 'every cuisine is still there to tick, inside the list');
  assert.equal((html.match(/data-clove="/g) || []).length, (html.match(/data-cskip="/g) || []).length);
  assert.match(html, /Tap \+ to choose\./);
  const css = fs.readFileSync(new URL('../src/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.pick-more > summary::before\s*\{\s*display:\s*none/, 'one + sign, not a chevron as well');
});

test('Likes and dislikes: plain labels instead of the dictionary\'s names', () => {
  const html = draw(person(), 'preferences');
  // The soft-avoid pills only; the optional custom diet builder further down lists every dictionary tag by its own name.
  const soft = html.match(/aria-label="Soft avoid tags">[\s\S]*?<\/div>/)[0];
  assert.match(soft, />Fish and seafood</);
  assert.match(soft, />Sugar substitutes</);
  assert.doesNotMatch(soft, /Non-nutritive or low-calorie sweetener|Ultra-processed marker|Caffeine source/);
  assert.match(html, /No meat, poultry, or fish\./, 'vegetarian says what it leaves out');
  assert.match(html, /The app cannot check slaughter, certification, or keeping meat and dairy apart\./);
});

test('Review: plain names, and a row only when it has something to say', () => {
  const p = person({ sex: 'female', age: 70, allergens: ['allergen-milk'], allergens_other: ['kiwi'], modules: ['gerd'], optional_rules: ['gerd-triggers-optional:coffee'],
    preferences: { avoid_tags: ['fish'], avoid_terms: [], patterns: [], cuisines_skip: [], cuisines_love: ['italian'] } });
  const html = draw(p, 'review');
  assert.match(html, /<dt>Allergies<\/dt><dd>Milk[^<]*, kiwi<\/dd>/);
  assert.match(html, /<dt>Foods you picked to avoid<\/dt><dd>[^<]*: Coffee[^<]*<\/dd>/);
  assert.match(html, /<dt>Cuisines<\/dt><dd>Love: Italian<\/dd>/, 'the cuisine\'s name, not its stored id');
  assert.match(html, /<dt>Foods to avoid \(soft\)<\/dt>/);
  for (const gone of ['Flags', 'Options', 'Confirmations', 'Patterns', 'Avoid words', 'Allergens', 'Other allergies']) assert.doesNotMatch(html, new RegExp(`<dt>${gone}</dt>`), gone);
  assert.doesNotMatch(html, /defaults|none flagged|none entered/);
  for (const kept of ['Conditions and diets', 'Spice', 'Cooking', 'Snacks']) assert.match(html, new RegExp(`<dt>${kept}</dt>`), `${kept} is always confirmed`);
});

test('the step headings say what each step is for, once', () => {
  assert.match(src, /why: 'The nine major food allergens, and any other food you are allergic to\.'/);
  assert.match(src, /why: 'Soft choices that steer which recipes are picked\. A recipe that slips through shows a caution\. Nothing here loosens an allergy or a condition\.'/);
  assert.doesNotMatch(src, /<p class="step-why">These are soft\./, 'the Likes step no longer repeats its heading');
});

test('Week: a planned meal does not say PASS, a hand-picked caution still says so', () => {
  const meal = extra => ({ recipe: 'r1', servings: 1, check: { verdict: 'pass', hits: [] }, ...extra });
  assert.equal(week.weekMealSubText(meal()), '');
  assert.equal(week.weekMealSubText(meal({ servingsMade: 4, swapped: true })), 'make 4 · swapped');
  assert.match(week.weekMealSubText(meal({ check: { verdict: 'caution', hits: [] }, chosenCaution: true })), /^CAUTION · your pick$/i);
  assert.match(weekSrc, /aria-label="\$\{uiEsc\(m\.name\)\}, \$\{uiVerdictWord\(m\.check\.verdict\)\}\. Open recipe\."/, 'the spoken label still says the verdict for every meal');
});

test('Week: each day total says whether its number is a limit or a goal', () => {
  const html = week.weekTotalChipsHTML({
    over: [{ nutrient: 'satfat_pct_kcal', value: 12.34, limit: 10 }],
    under: [{ nutrient: 'potassium_mg', value: 2858.2, min: 3500 }],
    ok: [{ nutrient: 'sodium_mg', value: 1932, limit: 2300 }, { nutrient: 'protein_g', value: 111.27, min: 81.6 }]
  });
  assert.match(html, /Saturated fat 12\.3% of calories, over the 10% limit/);
  assert.match(html, /Potassium 2,858 mg, below the 3,500 goal/);
  assert.match(html, /Sodium 1,932 mg, within the 2,300 limit/);
  assert.match(html, /Protein 111\.3 g, goal met/);
  assert.doesNotMatch(html, /, ok</);
});

test('Week: the snack line reads as a sentence', () => {
  assert.match(weekSrc, /`\$\{snackAuto\.count\} a day \(\$\{snackAuto\.why\}\)\. Change it here for this week only, or on the Cooking step for good\.`/);
  assert.match(weekSrc, /`\$\{snackAuto\.count\} a day, your setting on the Cooking step\. Change it here for this week only\.`/);
});
