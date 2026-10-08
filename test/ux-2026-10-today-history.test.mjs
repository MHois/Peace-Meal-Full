// UX pass, October 2026. Owner items 5, 6, and 1:
//  5. "Show 30 earlier days" in the food and symptom history seemed to do nothing.
//  6. On lite Today a meal eaten instead of the plan had no label, and the plan's big buttons stayed.
//  1. Peace Meal for one listed two recipe collections it does not carry as "0 recipes".
// Every person and entry here is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = { readyState: 'loading', addEventListener() {}, removeEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], activeElement: null, documentElement: { setAttribute() {}, removeAttribute() {}, classList: { toggle() {}, add() {}, remove() {}, contains: () => false } } };
globalThis.window = { addEventListener() {}, location: { hash: '' } };
globalThis.location = { hash: '', href: 'https://example.org/' };
const { uiState, uiIsoDate, uiToday } = await import('../src/ui/common.js');
const today = await import('../src/ui/today.js');
const lite = await import('../src/ui/lite.js');
const settings = await import('../src/ui/settings.js');

const ago = n => { const d = uiToday(); d.setDate(d.getDate() - n); return uiIsoDate(d); };
const person = { id: 'p1', name: 'Test Person' };
const entry = (n, name) => ({ id: 'd' + n, date: ago(n), person: 'p1', meal: 'lunch', kind: 'custom', ref: null, amount: 1, unit: 'entry', name, nutrients: null });
function profile(entries) { uiState.profile = { people: [person], diary: entries, log: [], weights: [] }; }

test('5: the history says which days it shows, and offers earlier days only when there are any', () => {
  profile([entry(3, 'Soup three days ago'), entry(35, 'Soup thirty-five days ago')]);
  const first = today.todayFoodHistoryHTML(person, 30);
  assert.match(first, /<strong>The last 30 days<\/strong>, from .+ to today\. Newest first\./);
  assert.match(first, /Soup three days ago/);
  assert.doesNotMatch(first, /thirty-five/);
  assert.match(first, /data-history-more>Show 30 earlier days</, 'there is something older to show');
  const second = today.todayFoodHistoryHTML(person, 60);
  assert.match(second, /The last 60 days/);
  assert.match(second, /Soup thirty-five days ago/, 'the earlier days are on the sheet');
  assert.doesNotMatch(second, /data-history-more/, 'nothing older than 60 days, so no button');
  assert.match(second, /That is everything: nothing was logged before /);
});

test('5: each day can be found and focused after loading earlier days', () => {
  profile([entry(3, 'Soup')]);
  const html = today.todayFoodHistoryHTML(person, 30);
  assert.match(html, /<div class="card history-day" data-date="\d{4}-\d{2}-\d{2}" tabindex="-1">/);
  assert.match(html, /class="small muted history-status" role="status" aria-live="polite"/);
});

test('6: a meal with nothing logged shows the plan and the three choices', () => {
  const html = lite.liteSlotHTML('lunch', { slot: 'lunch', recipe: 'r1', name: 'Bean tacos' }, [], {}, false, () => '');
  assert.match(html, /Planned: <strong>Bean tacos<\/strong>/);
  assert.match(html, /data-ate="lunch">.*I ate this/);
  assert.match(html, /data-ate-part="lunch"/);
  assert.match(html, /data-other="lunch">.*Something else/);
});

test('6: a meal eaten as planned says "You ate:" and "as planned", with no I ate this button', () => {
  const html = lite.liteSlotHTML('lunch', { slot: 'lunch', recipe: 'r1', name: 'Bean tacos' }, [{ id: 'e1', ref: 'r1', kind: 'recipe', name: 'Bean tacos' }], {}, false, () => '');
  assert.match(html, /<strong>You ate:<\/strong>/);
  assert.match(html, /as planned/);
  assert.doesNotMatch(html, /I ate this/);
  assert.doesNotMatch(html, /Instead of the planned/);
});

test('6: something else eaten is labeled in bold, with the plan below it, small and grey', () => {
  const html = lite.liteSlotHTML('lunch', { slot: 'lunch', recipe: 'r1', name: 'Bean tacos' }, [{ id: 'e2', ref: null, kind: 'custom', name: 'Turkey sandwich' }], {}, false, () => '');
  assert.match(html, /<strong>You ate:<\/strong>/);
  assert.match(html, /<p class="lite-instead small muted">Instead of the planned Bean tacos\.<\/p>/);
  assert.doesNotMatch(html, /I ate this/, 'the big plan buttons give way');
  assert.match(html, /data-other="lunch">.*Add more/);
  assert.match(html, /data-ate="lunch">I had the planned meal too</, 'a day with both can still log the plan');
});

test('6: lite Today has one Past days button, not two', () => {
  const src = fs.readFileSync(new URL('../src/ui/lite.js', import.meta.url), 'utf8');
  assert.equal((src.match(/data-food-history/g) || []).length, 1);
});

test('1: a collection this build does not carry is not listed as "0 recipes"', () => {
  uiState.data = { deferred: {} };
  uiState.baseRecipes = [{ id: 'nhs-1', source: 'NHS' }];
  uiState.lite = true;
  const html = settings.settingsCollectionsHTML({ recipe_collections: {} });
  assert.doesNotMatch(html, /coll-wikibooks|coll-usda/);
  assert.doesNotMatch(html, /Wikibooks Cookbook \(0 recipes\)|USDA MyPlate Kitchen, United States \(0 recipes\)|Not loaded in this build/);
  assert.match(html, /Peace Meal for one leaves out the Wikibooks Cookbook and USDA MyPlate Kitchen to stay small and quick on a phone\. The full Peace Meal has them\./);
  uiState.lite = false;
});
