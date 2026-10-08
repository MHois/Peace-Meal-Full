// Router and top-level state. Loads data from window.__APP_DATA__ (single-file bundle) or fetch('data/*.json') over http.
import { load, storeState, recipeCollectionsOn } from './store.js';
import { buildMatcher } from './engine/dictionary.js';
import { indexFoodNames } from './engine/checker.js';
import { annotateCuisines } from './engine/cuisine.js';
import { buildPlan } from './engine/plan.js';
import { checkRecipe } from './engine/checker.js';
import { buildAdaptedRecipes, familiesFor } from './engine/swaps.js';
import { uiState, uiEsc, uiActivePerson, uiToast, uiPersist, uiEnsurePerson, uiIcon, uiBrandMark, uiAvatar, uiNavRecord, uiCanGoBack, uiGoBack, uiBackButtonHTML, uiUnreadableNoticeHTML, uiBindUnreadableNotice, uiTrapTab } from './ui/common.js';
import { renderHomeScreen, renderWelcomeScreen } from './ui/home.js';
import { renderPeopleScreen } from './ui/people.js';
import { renderPlanScreen } from './ui/plan.js';
import { renderCheckScreen } from './ui/check.js';
import { renderWeekScreen } from './ui/week.js';
import { renderGroceryScreen } from './ui/grocery.js';
import { renderLogScreen } from './ui/log.js';
import { renderLearnScreen } from './ui/learn.js';
import { renderSettingsScreen } from './ui/settings.js';
import { renderTodayScreen } from './ui/today.js';
import { renderPantryScreen } from './ui/pantry.js';
import { renderTogetherScreen } from './ui/together.js';
import { renderLiteTodayScreen, renderLiteReportScreen } from './ui/lite.js';
import { renderBreatheScreen } from './ui/breathe.js';
import { renderRecipesScreen } from './ui/recipes.js';
import { renderOwnerScreen } from './ui/owner.js';
import { settingsShareBackup } from './ui/settings.js';
import { installShouldGuide, installShowGuide, installBannerHTML, installBindBanner } from './ui/install.js';
import { getDb, ensureDeviceIdentity, registerDevice, readOwner, isOwner } from './engine/sync.js';

const APP_DATA_FILES = ['sources', 'conditions', 'dictionaries', 'foods', 'recipes', 'recipes-open', 'recipes-usda', 'articles', 'swaps', 'diet-lists'];

function appEmptyFor(name) {
  return name === 'dictionaries' ? { tags: {}, entries: [] } : name === 'articles' ? {} : name === 'swaps' ? { families: {}, swaps: [] } : name === 'diet-lists' ? { families: {} } : [];
}

export async function loadData() {
  const out = {};
  const problems = [];
  const global = typeof window !== 'undefined' ? window.__APP_DATA__ : null;
  if (global && typeof global === 'object') {
    for (const n of APP_DATA_FILES) out[n] = global[n] != null ? global[n] : appEmptyFor(n);
    out.deferred = global.deferred || null;   // recipes kept out of launch (full single-file build; see appLoadDeferred)
    return { data: out, problems };
  }
  if (!/^https?:$/.test(location.protocol)) {
    for (const n of APP_DATA_FILES) out[n] = appEmptyFor(n);
    problems.push('This page was opened from a file:// URL, so data files could not be fetched. Serve the folder over http, or open the single-file build in dist/.');
    return { data: out, problems };
  }
  await Promise.all(APP_DATA_FILES.map(async n => {
    try {
      const res = await fetch(`data/${n}.json`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      out[n] = await res.json();
    } catch (e) {
      out[n] = appEmptyFor(n);
      problems.push(`data/${n}.json did not load (${e.message}). Features that need it will be empty.`);
    }
  }));
  return { data: out, problems };
}

export function appNormalizeData(data) {
  // conditions.json is { version, notes, modules, proposed_tags, flags } (or a bare array in older fixtures)
  uiState.conditionsMeta = { flags: {}, proposed_tags: [] };
  if (data.conditions && !Array.isArray(data.conditions)) {
    uiState.conditionsMeta.flags = data.conditions.flags || {};
    uiState.conditionsMeta.proposed_tags = data.conditions.proposed_tags || [];
    uiState.conditionsMeta.onboarding_common = data.conditions.onboarding_common || [];
    data.conditions = data.conditions.modules || [];
  }
  if (!Array.isArray(data.sources)) data.sources = [];
  if (!Array.isArray(data.foods)) data.foods = [];
  if (!Array.isArray(data.recipes)) data.recipes = [];
  for (const extra of ['recipes-open', 'recipes-usda']) { if (Array.isArray(data[extra])) { const seen = new Set(data.recipes.map(r => r.id)); for (const r of data[extra]) if (!seen.has(r.id)) { data.recipes.push(r); seen.add(r.id); } } delete data[extra]; }
  if (!data.articles || typeof data.articles !== 'object' || Array.isArray(data.articles)) data.articles = {};
  if (!data.dictionaries || typeof data.dictionaries !== 'object') data.dictionaries = { tags: {}, entries: [] };
  if (!data.dictionaries.tags) data.dictionaries.tags = {};
  if (!Array.isArray(data.dictionaries.entries)) data.dictionaries.entries = [];
  return data;
}

// Lite build ("Peace Meal for one"): set by the bundler. One person, four tabs, the same engine and data.
export const APP_LITE = typeof window !== 'undefined' && !!window.__PEACE_MEAL_LITE__;
const APP_SCREENS_FULL = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'people', label: 'People', icon: 'person' },
  { id: 'plan', label: 'Plan', icon: 'list' },
  { id: 'check', label: 'Check', icon: 'check-circle' },
  { id: 'today', label: 'Today', icon: 'clock' },
  { id: 'week', label: 'Week', icon: 'calendar' },
  { id: 'recipes', label: 'Recipes', icon: 'leaf' },
  { id: 'grocery', label: 'Grocery', icon: 'cart' },
  { id: 'pantry', label: 'Pantry', icon: 'jar' },
  { id: 'together', label: 'Together', icon: 'people' },
  { id: 'log', label: 'Log', icon: 'note' },
  { id: 'report', label: 'Report', icon: 'cite' },
  { id: 'breathe', label: 'Breathe', icon: 'breathe' },
  { id: 'learn', label: 'Learn', icon: 'book' },
  { id: 'settings', label: 'Settings', icon: 'gear' }
];
const APP_SCREENS_LITE = [
  { id: 'today', label: 'Today', icon: 'clock' },
  { id: 'week', label: 'Meals', icon: 'calendar' },
  { id: 'recipes', label: 'Recipes', icon: 'leaf' },
  { id: 'report', label: 'Report', icon: 'cite' },
  { id: 'check', label: 'Check a label', icon: 'check-circle' },
  { id: 'plan', label: 'My plan', icon: 'list' },
  { id: 'grocery', label: 'Grocery', icon: 'cart' },
  { id: 'pantry', label: 'Pantry', icon: 'jar' },
  { id: 'people', label: 'My profile', icon: 'person' },
  { id: 'log', label: 'Symptom log', icon: 'note' },
  { id: 'breathe', label: 'Breathe', icon: 'breathe' },
  { id: 'learn', label: 'Learn', icon: 'book' },
  { id: 'settings', label: 'Settings', icon: 'gear' }
];
const APP_SCREENS = APP_LITE ? APP_SCREENS_LITE : APP_SCREENS_FULL;
const APP_TAB_PRIMARY = APP_LITE ? ['today', 'week', 'recipes', 'report'] : ['home', 'today', 'check', 'week'];
const APP_HOME = APP_LITE ? 'today' : 'home';
const APP_BRAND = APP_LITE ? 'Peace Meal for one' : 'Peace Meal';

function appParseRoute() {
  const h = (location.hash || '#/' + APP_HOME).replace(/^#\/?/, '');
  const parts = h.split('/').filter(Boolean);
  const screen = parts.shift() || APP_HOME;
  if (screen === 'welcome' || screen === 'owner') return { screen, parts };
  return { screen: APP_SCREENS.some(s => s.id === screen) ? screen : APP_HOME, parts };
}

let appMoreOpen = false;
let appLastScreen = null;

function appNavLink(s, cur) {
  return `<a href="#/${s.id}" ${cur === s.id ? 'aria-current="page"' : ''}>${uiIcon(s.icon)}<span>${s.label}</span></a>`;
}

function appRenderNav() {
  const cur = uiState.route.screen;
  const side = document.getElementById('sidenav');
  const tabs = document.getElementById('tabbar');
  const top = document.getElementById('topbar');
  const person = uiActivePerson();
  const welcome = cur === 'welcome';
  const canBack = uiCanGoBack() && !welcome;
  const who = person ? `<a class="who" href="#/people" aria-label="Active person: ${uiEsc(person.name)}. Open People.">${uiAvatar(person.name)}<span class="who-name">${uiEsc(person.name)}</span></a>` : '';

  // Phone top bar: Back (when there is somewhere to go), brand, active person.
  top.innerHTML = `${canBack ? uiBackButtonHTML('back-phone') : ''}<a class="brand" href="#/${APP_HOME}">${uiBrandMark({ label: APP_BRAND })}<span class="brand-name">${APP_BRAND}</span>${APP_LITE ? '<span class="chip plum lite-tag">Lite</span>' : ''}</a><div class="spacer"></div>${who}`;

  // Desktop rail: brand at top, nav, active person at the bottom.
  side.innerHTML = `<a class="rail-brand" href="#/${APP_HOME}">${uiBrandMark({ label: APP_BRAND })}<span class="brand-name">${APP_BRAND}</span></a>
    <div class="rail-nav">${APP_SCREENS.map(s => appNavLink(s, cur)).join('')}</div>
    ${person ? `<a class="rail-person" href="#/people" aria-label="Active person: ${uiEsc(person.name)}. Open People.">${uiAvatar(person.name)}<span class="rail-person-text"><span class="eyebrow">Active person</span><span class="rail-person-name">${uiEsc(person.name)}</span></span></a>` : ''}`;

  // Phone tab bar: four primary tabs and a More sheet with the rest.
  const primary = APP_SCREENS.filter(s => APP_TAB_PRIMARY.includes(s.id));
  const more = APP_SCREENS.filter(s => !APP_TAB_PRIMARY.includes(s.id));
  const moreActive = more.some(s => s.id === cur);
  tabs.innerHTML = primary.map(s => appNavLink(s, cur)).join('') +
    `<button type="button" id="more-btn" class="${moreActive ? 'on' : ''}" aria-expanded="${appMoreOpen}" aria-controls="more-sheet" aria-haspopup="true">${uiIcon('more')}<span>More</span></button>`;
  let scrim = document.getElementById('more-scrim');
  if (!scrim) { scrim = document.createElement('button'); scrim.id = 'more-scrim'; scrim.className = 'more-scrim'; scrim.type = 'button'; scrim.setAttribute('aria-label', 'Close the More menu'); document.getElementById('app').appendChild(scrim); }
  let sheet = document.getElementById('more-sheet');
  if (!sheet) { sheet = document.createElement('div'); sheet.id = 'more-sheet'; sheet.className = 'more-sheet'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', 'More screens'); document.getElementById('app').appendChild(sheet); }
  sheet.hidden = !appMoreOpen;
  scrim.hidden = !appMoreOpen;
  const MORE_GROUPS = APP_LITE ? [['Every day', ['check', 'plan', 'grocery', 'pantry', 'log']], ['You', ['people', 'learn', 'breathe', 'settings']]] : [['Plan and cook', ['plan', 'week', 'recipes', 'grocery', 'pantry', 'together']], ['Track', ['today', 'log', 'report', 'check', 'people']], ['Learn and settings', ['learn', 'breathe', 'settings']]];
  const grouped = MORE_GROUPS.map(([title, ids]) => { const items = more.filter(s => ids.includes(s.id)); return items.length ? `<div class="sheet-group"><span class="eyebrow">${title}</span></div>` + items.map(s => appNavLink(s, cur)).join('') : ''; }).join('');
  const rest = more.filter(s => !MORE_GROUPS.some(([, ids]) => ids.includes(s.id))).map(s => appNavLink(s, cur)).join('');
  sheet.innerHTML = `<div class="sheet-title"><span class="eyebrow">More</span><button type="button" class="btn small icon" id="more-close" aria-label="Close the More menu">${uiIcon('close')}</button></div>` + grouped + rest;
  const toggleMore = open => { appMoreOpen = open; appRenderNav(); if (open) { const first = sheet.querySelector('a'); if (first) first.focus(); } else { const b = document.getElementById('more-btn'); if (b) b.focus(); } };
  document.getElementById('more-btn').addEventListener('click', () => toggleMore(!appMoreOpen));
  sheet.querySelector('#more-close').addEventListener('click', () => toggleMore(false));
  scrim.onclick = () => toggleMore(false);
  sheet.onkeydown = e => { if (e.key === 'Escape') { e.preventDefault(); toggleMore(false); } else uiTrapTab(e, sheet); };
  sheet.querySelectorAll('a').forEach(a => a.addEventListener('click', () => { appMoreOpen = false; }));
  uiState.closeMoreSheet = () => { if (!appMoreOpen) return false; toggleMore(false); return true; };
  top.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', uiGoBack));
}

export function appRender() {
  uiState.route = appParseRoute();
  uiNavRecord(location.hash || '#/' + APP_HOME, !!uiState.navReplaceNext);
  uiState.navReplaceNext = false;
  const main = document.getElementById('main');
  const profile = uiState.profile;
  // If there are no people, the welcome screen and onboarding are the only useful places.
  if (!profile.people.length && !['people', 'learn', 'settings', 'welcome'].includes(uiState.route.screen)) {
    uiState.navReplaceNext = true;
    location.replace('#/welcome');
    return;
  }
  if (profile.people.length && uiState.route.screen === 'welcome') { uiState.navReplaceNext = true; location.replace('#/' + APP_HOME); return; }
  // The owner dashboard exists only for the device that holds the owner key of a shared store.
  if (uiState.route.screen === 'owner' && uiState.sync.ready && !uiState.sync.isOwner) { uiState.navReplaceNext = true; uiToast('The owner dashboard is only for the owner device.'); location.replace('#/home'); return; }
  if (uiState.modalClose) uiState.modalClose({ silent: true });
  appRenderNav();
  main.innerHTML = '';
  main.classList.toggle('print-sheet', false);
  const ctx = { route: uiState.route };
  try {
    switch (uiState.route.screen) {
      case 'welcome': renderWelcomeScreen(main, ctx); break;
      case 'home': renderHomeScreen(main, ctx); break;
      case 'people': renderPeopleScreen(main, ctx); break;
      case 'plan': renderPlanScreen(main, ctx); break;
      case 'check': renderCheckScreen(main, ctx); break;
      case 'today': if (APP_LITE) renderLiteTodayScreen(main, ctx); else renderTodayScreen(main, ctx); break;
      case 'report': renderLiteReportScreen(main, ctx); break;
      case 'week': renderWeekScreen(main, ctx); break;
      case 'pantry': renderPantryScreen(main, ctx); break;
      case 'together': renderTogetherScreen(main, ctx); break;
      case 'breathe': renderBreatheScreen(main, ctx); break;
      case 'recipes': renderRecipesScreen(main, ctx); break;
      case 'owner': if (uiState.sync.ready) renderOwnerScreen(main, ctx); else main.innerHTML = '<p class="small muted">Checking the shared store...</p>'; break;
      case 'grocery': renderGroceryScreen(main, ctx); break;
      case 'log': renderLogScreen(main, ctx); break;
      case 'learn': renderLearnScreen(main, ctx); break;
      case 'settings': renderSettingsScreen(main, ctx); break;
      default: renderHomeScreen(main, ctx);
    }
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="notice block">${uiIcon('stop', { cls: 'notice-icon' })}<div class="notice-head">Stop</div><div class="notice-body">This screen failed to render: ${uiEsc(e.message)}</div></div>`;
  }
  // Desktop Back control sits at the top of the content column; the phone one is in the top bar.
  if (uiCanGoBack() && uiState.route.screen !== 'welcome') {
    main.insertAdjacentHTML('afterbegin', `<div class="backbar">${uiBackButtonHTML('back-desktop')}</div>`);
    main.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', uiGoBack));
  }
  // Saved data that could not be read (P0-4) is named at the top of every screen.
  const unreadable = uiUnreadableNoticeHTML();
  if (unreadable) { main.insertAdjacentHTML('afterbegin', `<div class="section">${unreadable}</div>`); uiBindUnreadableNotice(main); }
  // P1-5: in a Safari tab on an iPhone, every screen says the data is not saved safely (src/ui/install.js).
  const safari = installBannerHTML();
  if (safari) { main.insertAdjacentHTML('afterbegin', `<div class="section">${safari}</div>`); installBindBanner(main); }
  if (uiState.dataProblems.length && uiState.route.screen !== 'settings') {
    const box = document.createElement('div');
    box.className = 'section';
    box.innerHTML = uiState.dataProblems.map(p => `<div class="notice warn">${uiIcon('alert', { cls: 'notice-icon' })}<div class="notice-head">Caution</div><div class="notice-body">${uiEsc(p)}</div></div>`).join('');
    main.appendChild(box);
  }
  // Cross-fade with a small rise when the screen changes (not on same-screen re-renders). Motion is gated in CSS.
  if (appLastScreen !== uiState.route.screen) {
    main.classList.remove('enter');
    void main.offsetWidth;
    main.classList.add('enter');
  }
  appLastScreen = uiState.route.screen;
  window.scrollTo(0, 0);
}

// The recipe pool = shipped recipes, with any ingredient links the household added to imported recipes
// (profile.recipe_links[recipeId] = [{food, grams, display}]), plus recipes the household wrote (profile.custom_recipes).
// Call uiState.refreshRecipes() after editing either.
export const APP_COLLECTION_OF_SOURCE = { 'NHS website': 'nhs', 'Parent Club Scotland': 'parentclub', 'NHLBI (NIH)': 'nhlbi', 'VA Healthy Teaching Kitchen': 'va', 'Wikibooks Cookbook': 'wikibooks', 'USDA MyPlate Kitchen': 'usda' };
// A recipe's collection: its own "collection" field (Peace Meal's September 2026 set for both diets, "review_dual"), or its source.
export function appCollectionOf(r) { return r.collection || APP_COLLECTION_OF_SOURCE[r.source]; }
export function appCollectionCounts() {
  const counts = { nhs: 0, parentclub: 0, nhlbi: 0, va: 0, wikibooks: 0, usda: 0, review_dual: 0 };
  for (const r of uiState.baseRecipes || []) { const k = appCollectionOf(r); if (k) counts[k]++; }
  const d = appDeferredInfo();
  if (d) counts.wikibooks += d.count;   // not read yet, still part of the collection
  const u = appDeferredUsdaInfo();
  if (u) counts.usda += u.count;   // the same for the USDA recipes (P2-14)
  return counts;
}
// Adapted copies for one diet family: every base recipe with nutrition that the swap list can fix, re-checked against a plan
// built from that family's module alone. Cached; cleared whenever the pool is reassembled.
function appAdaptedFor(family) {
  if (uiState.adaptedCache.has(family)) return uiState.adaptedCache.get(family);
  const swaps = uiState.data.swaps;
  const fam = swaps && swaps.families ? swaps.families[family] : null;
  let list = [];
  if (fam && fam.module && uiState.matcher) {
    const pseudo = { id: 'family:' + family, name: family, adult: true, modules: [fam.module], allergens: [], preferences: { avoid_tags: [], avoid_terms: [] }, medications: {}, tier2: {}, phases: {}, modes: {}, acknowledged: [], flags: {}, variants: {} };
    const plan = buildPlan({ person: pseudo, conditions: uiState.data.conditions, dictionaries: uiState.data.dictionaries, today: new Date() });
    const base = (uiState.data.recipes || []).filter(r => !r.adapted && !r.custom && ((r.nutrition_per_serving && r.nutrition_source) || (r.ingredients || []).some(i => i.food)));
    list = buildAdaptedRecipes({ recipes: base, families: [family], swapsData: swaps, matcher: uiState.matcher, foodsById: uiState.foodsById, checkRecipe, familyPlans: { [family]: plan } });
    for (const r of list) uiState.recipesById.set(r.id, r);
  }
  uiState.adaptedCache.set(family, list);
  return list;
}
// The pool for one plan: the base recipes plus adapted copies for every family the plan restricts. Same array back for the same families.
function appRecipesForPlan(plan) {
  const fams = familiesFor(plan, uiState.data.swaps);
  return appPoolFor(fams);
}
function appRecipesForPlans(plans) {
  const fams = [...new Set((plans || []).flatMap(p => familiesFor(p, uiState.data.swaps)))].sort();
  return appPoolFor(fams);
}
function appPoolFor(fams) {
  if (!fams.length) return uiState.data.recipes;
  const key = fams.slice().sort().join('+');
  if (uiState.poolCache.has(key)) return uiState.poolCache.get(key);
  const pool = uiState.data.recipes.concat(...fams.map(appAdaptedFor));
  uiState.poolCache.set(key, pool);
  return pool;
}
// A saved week or diary may already name adapted recipe ids (they contain "~family"); build those families up front so lookups by id work at once.
function appPrebuildAdapted() {
  try {
    const text = JSON.stringify({ people: (uiState.profile && uiState.profile.people) || [], diary: (uiState.profile && uiState.profile.diary) || [], household: uiState.profile && uiState.profile.household });
    for (const family of Object.keys((uiState.data.swaps && uiState.data.swaps.families) || {})) if (text.includes('~' + family)) appAdaptedFor(family);
  } catch (e) { console.error(e); }
}
function appAssembleRecipes() {
  const profile = uiState.profile || {};
  const links = profile.recipe_links || {};
  const on = recipeCollectionsOn(profile);
  const out = [];
  for (const r of uiState.baseRecipes || []) {
    const coll = appCollectionOf(r);
    if (coll && !on[coll]) continue;
    const linked = links[r.id];
    if (Array.isArray(linked) && linked.length) out.push({ ...r, ingredients: linked, linked_by_household: true });
    else out.push(r);
  }
  for (const cr of profile.custom_recipes || []) if (cr && cr.id) out.push({ source: 'Peace Meal', ...cr, custom: true });
  annotateCuisines(out);
  uiState.data.recipes = out;
  uiState.recipesById = new Map(out.map(r => [r.id, r]));
  // Adapted copies (swap layer) are built per diet family on first use and cached until the pool changes.
  uiState.adaptedCache = new Map();
  uiState.poolCache = new Map();
  uiState.recipesForPlan = appRecipesForPlan;
  uiState.recipesForPlans = appRecipesForPlans;
  appPrebuildAdapted();
  return out;
}

// Deferred recipes (2026-09 audit). The full single-file build keeps the Wikibooks Cookbook recipes in a JSON block
// that is not parsed at launch (tools/bundle.mjs). They are read the first time someone searches recipes (Recipes
// search or the Wikibooks filter, the Today search, the Pantry match), when the Week switch for recipes without
// nutrition numbers is turned on, or at launch when saved data already needs them. They go back in their original place
// in the recipe order, so a week plan comes out the same as when they were loaded at launch.
export function appDeferredInfo() {
  const d = uiState.data && uiState.data.deferred && uiState.data.deferred.wikibooks;
  return d && !uiState.deferredLoaded ? d : null;
}
function appNeedsDeferred(profile) {
  const d = appDeferredInfo();
  if (!d || !profile) return false;
  try {
    const on = recipeCollectionsOn(profile);
    const text = JSON.stringify({ people: profile.people || [], diary: profile.diary || [], log: profile.log || [], household: profile.household || {}, links: Object.keys(profile.recipe_links || {}) });
    if (text.includes('"' + d.id_prefix)) return true;   // a saved week, diary entry, favorite, or link names one of them
    return !!(on.wikibooks && text.includes('"include_unknown_nutrition":true'));   // the planner may use recipes without numbers
  } catch { return true; }
}
function appLoadDeferred() {
  const d = appDeferredInfo();
  if (!d) return false;
  const on = recipeCollectionsOn(uiState.profile);
  if (!on.wikibooks) return false;   // the collection is switched off in Settings: nothing to show, so nothing to read
  uiState.deferredLoaded = true;   // once, whatever happened: a failed read is not retried on every keystroke
  if (!appReadDeferredBlock(d)) { uiToast('The Wikibooks recipes could not be read from this file.'); return false; }
  appAssembleRecipes();
  if (uiState.weekCache) uiState.weekCache.clear();
  return true;
}
// Reads one deferred block into the base recipes, after the recipe named in "after" (at the end when there is none).
// False when the block is missing or cannot be parsed.
function appReadDeferredBlock(d) {
  const el = typeof document !== 'undefined' ? document.getElementById(d.element) : null;
  let list = null;
  try { list = el ? JSON.parse(el.textContent) : null; } catch (e) { console.error(e); list = null; }
  if (!Array.isArray(list)) return false;
  const base = uiState.baseRecipes;
  const seen = new Set(base.map(r => r.id));
  const add = list.filter(r => r && r.id && !seen.has(r.id));
  const at = d.after ? base.findIndex(r => r.id === d.after) : -1;
  if (at >= 0) base.splice(at + 1, 0, ...add); else base.push(...add);
  if (el) el.textContent = '';   // the parsed copy is the one in use now
  return true;
}
// P2-14 (audit of September 30, 2026): the USDA MyPlate Kitchen recipes were off by default (on since October 8, 2026), and
// both builds keep them in a JSON block (tools/bundle.mjs). They are read when the collection is on: at launch, or when it is
// switched on in Settings (which calls refreshRecipes). Off, they are never in the recipe pool, so nothing needs them.
function appDeferredUsdaInfo() {
  const d = uiState.data && uiState.data.deferred && uiState.data.deferred.usda;
  return d && !uiState.deferredUsdaLoaded ? d : null;
}
function appLoadDeferredUsda() {
  const d = appDeferredUsdaInfo();
  if (!d) return false;
  const on = recipeCollectionsOn(uiState.profile);
  if (!on.usda) return false;
  uiState.deferredUsdaLoaded = true;   // once, whatever happened, as for the Wikibooks block
  if (!appReadDeferredBlock(d)) { uiToast('The USDA recipes could not be read from this file.'); return false; }
  return true;
}
// Exported for test/audit-fix-p2-14-usda-deferred.test.mjs; the bundle strips "export".
export function appRefreshRecipes() {
  appLoadDeferredUsda();   // before the pool is put together, so it is put together once
  appAssembleRecipes();
  if (appNeedsDeferred(uiState.profile)) appLoadDeferred();
}

// Shared store (claude.ai version only). Never blocks rendering; the screens that show it update when this resolves.
async function appBootSync() {
  const s = uiState.sync;
  s.ready = false;
  try {
    const db = await getDb();
    s.db = db;
    if (db) {
      const identity = await ensureDeviceIdentity();
      s.identity = identity;
      if (identity) await registerDevice(db, identity);
      s.owner = await readOwner(db);
      s.isOwner = isOwner(identity, s.owner);
    } else { s.identity = null; s.owner = null; s.isOwner = false; }
  } catch (e) {
    console.warn(e);
    s.db = null; s.identity = null; s.owner = null; s.isOwner = false;
    uiToast('The shared store could not be reached. Everything stays on this device.');
  }
  s.ready = true;
  if (['settings', 'people', 'together', 'owner'].includes(uiState.route.screen) && !uiState.modalClose) uiState.rerender();
}

// Owner decision (October 8, 2026): USDA MyPlate Kitchen is on from the start, in both builds (it was off until switched
// on). Profiles saved before carry usda: false; it is switched on once (defaults_v6), and turning it off afterwards sticks.
// Runs before the recipes are put together at launch, so the USDA recipes are read then. Exported for tests.
export function appUsdaOnFromStart(profile) {
  const rc = profile && profile.recipe_collections;
  if (!rc || rc.defaults_v6) return false;
  rc.usda = true;
  rc.defaults_v6 = true;
  return true;
}
// Owner request (October 8, 2026): Peace Meal for one has every recipe collection the full app has. Profiles it saved
// before carry wikibooks: false (it used to leave that collection out), so the collection is switched on once; turning it
// off afterwards sticks. USDA MyPlate Kitchen stays off until it is switched on, in both builds. Exported for tests.
export function appLiteAllRecipes(profile, lite) {
  const rc = profile && profile.recipe_collections;
  if (!lite || !rc || rc.lite_all_recipes) return false;
  rc.wikibooks = true;
  rc.lite_all_recipes = true;
  return true;
}

async function appBoot() {
  uiState.sync = { db: null, identity: null, owner: null, isOwner: false, ready: false };
  uiState.syncRefresh = appBootSync;
  uiState.profile = load();
  uiState.lite = APP_LITE;
  if (APP_LITE) document.documentElement.classList.add('lite');   // lite-only sizes in app.css (P2-5)
  // A new lite profile also had wikibooks set to false here, while lite left that collection out; since October 8, 2026 it
  // carries every collection (appLiteAllRecipes below), so that one setting is no longer written.
  if (APP_LITE && uiState.profile && !uiState.profile.people.length && uiState.profile.recipe_collections) { uiState.profile.recipe_collections.nhs = true; uiState.profile.recipe_collections.parentclub = true; uiState.profile.recipe_collections.nhlbi = true; uiState.profile.recipe_collections.va = true; }
  const liteSwitched = appLiteAllRecipes(uiState.profile, APP_LITE);
  // Collections with per-serving nutrition are on by default since v2.3. Profiles saved before that carried nhs: false; switch it on once.
  if (uiState.profile && uiState.profile.recipe_collections && !uiState.profile.recipe_collections.defaults_v3) { uiState.profile.recipe_collections.nhs = true; uiState.profile.recipe_collections.parentclub = true; uiState.profile.recipe_collections.defaults_v3 = true; }
  if (uiState.profile && uiState.profile.recipe_collections && !uiState.profile.recipe_collections.defaults_v4) { uiState.profile.recipe_collections.nhlbi = true; uiState.profile.recipe_collections.defaults_v4 = true; }
  // The September 2026 recipes for low FODMAP and low histamine together were reviewed and switched on September 30, 2026.
  // Profiles saved before that carried review_dual: false; switch it on once. Turning it off afterwards sticks.
  if (uiState.profile && uiState.profile.recipe_collections && !uiState.profile.recipe_collections.defaults_v5) { uiState.profile.recipe_collections.review_dual = true; uiState.profile.recipe_collections.defaults_v5 = true; }
  const usdaSwitched = appUsdaOnFromStart(uiState.profile);
  // The two October 8 switch-overs are saved at once, so the stored data matches what a backup holds (audit check a2: they
  // were in memory only until the next save). A new profile carries both flags, so a fresh start writes nothing, and
  // save() never writes over saved data this build could not read (P0-4).
  if (liteSwitched || usdaSwitched) uiPersist();
  // Suggestion notices (for example "add the higher-protein module") act here, once, whatever screen rendered them.
  document.addEventListener('click', e => {
    const b = e.target && e.target.closest ? e.target.closest('[data-notice-action],[data-notice-dismiss]') : null;
    if (!b) return;
    const person = uiActivePerson();
    if (!person) return;
    if (b.dataset.noticeAction) {
      const [verb, arg] = b.dataset.noticeAction.split(':');
      if (verb === 'add-module' && arg && uiState.conditionsById.has(arg)) {
        person.modules = person.modules || [];
        if (!person.modules.includes(arg)) person.modules.push(arg);
        uiPersist(); uiToast(`${uiState.conditionsById.get(arg).name} added to the plan.`); uiState.rerender();
      }
    } else if (b.dataset.noticeDismiss) {
      person.dismissed_suggestions = person.dismissed_suggestions || [];
      if (!person.dismissed_suggestions.includes(b.dataset.noticeDismiss)) person.dismissed_suggestions.push(b.dataset.noticeDismiss);
      uiPersist(); uiToast('Okay. You can add it any time from the Conditions step.'); uiState.rerender();
    }
  });
  if (!uiState.profile.activePerson && uiState.profile.people.length) uiState.profile.activePerson = uiState.profile.people[0].id;
  if (!Array.isArray(uiState.profile.log)) uiState.profile.log = [];
  uiState.profile.people.forEach(uiEnsurePerson);
  const { data, problems } = await loadData();
  uiState.data = appNormalizeData(data);
  uiState.dataProblems = problems;
  uiState.matcher = buildMatcher(uiState.data.dictionaries);
  uiState.matcher.dietLists = uiState.data['diet-lists'] || { families: {} };   // approved-food lists for strict mode
  uiState.matcher.foodNames = indexFoodNames(uiState.data.foods || []);   // typed food names get the food's own tags (P0-3)
  uiState.conditionsById = new Map(uiState.data.conditions.map(m => [m.id, m]));
  uiState.sourcesById = new Map(uiState.data.sources.map(s => [s.id, s]));
  uiState.foodsById = new Map(uiState.data.foods.map(f => [f.id, f]));
  uiState.baseRecipes = uiState.data.recipes;
  uiState.refreshRecipes = appRefreshRecipes;
  uiState.loadDeferredRecipes = appLoadDeferred;
  uiState.deferredRecipes = appDeferredInfo;
  appRefreshRecipes();
  uiState.rerender = appRender;
  uiState.shareBackup = settingsShareBackup;   // the "Send a backup" button on the not-saved alert
  window.addEventListener('hashchange', appRender);
  if (!location.hash) location.hash = '#/' + APP_HOME;
  appRender();
  if (problems.length) uiToast('Some data files did not load.');
  else if (storeState.migration && storeState.migration.error && storeState.migration.from) uiToast('Your data is safe where it was. Moving it to this app\'s own storage did not finish; it will try again next time.');
  appRequestPersistence();
  appWatchForUpdate();
  if (installShouldGuide()) installShowGuide();   // iPhone Safari tab: once, the Add to Home Screen guide
  appBootSync();
}

// The service workers serve the cached copy first, so a new version arrives in the background and waits (sw.js). When
// one is ready, a bar says "Update ready, tap to reload"; the tap switches to it and reloads. Hosted copies only
// (window.__pmSwReg is set by the page's registration script).
let appUpdating = false;
function appWatchForUpdate() {
  const reg = typeof window !== 'undefined' ? window.__pmSwReg : null;
  if (!reg || !navigator.serviceWorker) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (appUpdating) location.reload(); });
  Promise.resolve(reg).then(r => {
    if (!r) return;
    const offer = w => { if (w && navigator.serviceWorker.controller) appShowUpdateReady(w); };   // no controller yet: this is the first install, nothing to update
    if (r.waiting) offer(r.waiting);
    r.addEventListener('updatefound', () => {
      const w = r.installing;
      if (w) w.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); });
    });
  }).catch(() => {});
}
function appShowUpdateReady(worker) {
  if (document.getElementById('update-ready')) return;
  const b = document.createElement('button');
  b.id = 'update-ready';
  b.type = 'button';
  b.className = 'update-ready';
  b.innerHTML = `${uiIcon('check-circle')}<span>Update ready, tap to reload</span>`;
  b.addEventListener('click', () => {
    appUpdating = true;
    b.disabled = true;
    b.querySelector('span').textContent = 'Updating...';
    worker.postMessage('skip-waiting');
    setTimeout(() => location.reload(), 4000);   // in case the switch is not reported
  });
  document.body.appendChild(b);
}

// Asks the browser to keep this app's storage when the device runs low on space, where the browser offers that.
// Local only: no network. Some browsers decide on their own and never ask.
function appRequestPersistence() {
  try {
    const st = navigator.storage;
    if (!st || typeof st.persist !== 'function') return;
    const already = typeof st.persisted === 'function' ? st.persisted() : Promise.resolve(false);
    already.then(p => p || st.persist()).then(ok => { uiState.storagePersisted = !!ok; }).catch(() => {});
  } catch { /* not offered here */ }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', appBoot);
else appBoot();
