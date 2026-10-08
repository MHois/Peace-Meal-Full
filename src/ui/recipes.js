// Recipes: browse and search the whole pool (shipped, NHS, Wikibooks, Mine), the shared recipe detail sheet used by Week,
// Pantry, Today, and Together, and the heart / never-again controls that every recipe list shows.
import { checkRecipe } from '../engine/checker.js';
import { round } from '../engine/nutrition.js';
import { CUISINES, CUISINE_LABEL, cuisineSkipped } from '../engine/cuisine.js';
import { recipeHeat, spiceSkipped, spicePreference } from '../engine/spice.js';
import { isComponent } from '../engine/planner.js';
import { uiState, uiEsc, uiActivePerson, uiPlanFor, uiPersist, uiToast, uiModal, uiIsoDate, uiToday, uiFmtDate, uiFmtNum, uiNutrientLabel, uiVerdictWord, uiTagLabel, uiPageHeader, uiChip, uiIcon, uiNoticeHTML, uiEmptyState, uiSourcesHTML, uiConfirmSheet, uiPortionsHTML, uiEnsureAllRecipes, uiDeferredRecipes, uiRecipeSourcesText } from './common.js';
import { todayAddDiaryEntry, todayIsFavorite, todayToggleFavorite } from './today.js';
import { weekGet, weekSetOverride } from './week.js';
import { recipesEdLinkSheet, recipesEdEditorModal, recipesEdDraftFrom, recipesEdBlankDraft, recipesEdPasteModal, recipesEdDeleteCustom } from './recipes-edit.js';

const RECIPES_PAGE = 50;
const RECIPES_SLOT_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack', component: 'Sauces and basics' };
const RECIPES_DAY_NAMES = { sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday' };
const RECIPES_LICENSE_URL = { 'Open Government Licence v3.0': 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/', 'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/' };
// Wikibooks categories that are not cuisines (difficulty, course, technique, diet, dish type).
const RECIPES_NOT_CUISINE = /^(Very Easy|Easy|Medium Difficulty|Difficult|Very Difficult|Vegetarian|Vegan|Gluten-free|Naturally gluten-free|Boiled|Baking|Baked|Inexpensive|Side dish|Pan fried|Deep fried|Fried|Grilled|Kid-friendly|Public domain|Halal|Kosher|Refrigerated|Camping|Roasted|Dumpling|Breakfast|Appetizer|Dessert|Main course|Pescatarian|Steamed|Saut|Stir|Slow cooker|Microwave|Barbecue|Raw|Frozen|Broiled|Smoked|Pressure|Simmered|Braised|Featured|Incomplete|Duplicate|Dal\b|National|Dairy-free|Nut-free|Egg-free|Low|Lacto|Ovo|Lunch|Snack|Brunch|Dinner|Supper|Holiday|Christmas|Thanksgiving|Easter|Halloween|Party|Picnic|Budget|Quick|Student|Diabetic|Heart|Blended|Poached|Fermented|Pickled|Marinated|Toasted|Chilled|Uncooked|No-bake|Canned|Dried|Ground|Mashed|Stuffed|Sweet|Savory|Spicy|Hot|Cold|Historical|Medieval|Traditional|Vintage|Regional|Fusion|Street|Fast food|Comfort|Finger|One-pot|Sheet|Skillet|Wok|Oven|Stovetop|Grill|Rice cooker|Bread machine|Toaster|Air fryer|Instant|Sous|Smoker|Campfire|Dutch|Cast|Clay|Tagine|Recipes|Cookbook|Pages|Meat|Seafood|Fish|Chicken|Beef|Pork|Lamb|Egg|Cheese|Rice|Pasta|Noodle|Potato|Bean|Tofu|Fruit|Vegetable|Nut|Chocolate|Alcohol|Wine|Beer|Cocktail|Drink|Tea|Coffee|Bread|Cake|Cookie|Pie|Pastry|Soup|Salad|Sauce|Sandwich|Stew|Curry|Casserole|Pudding|Pancake|Fritter|Flatbread|Spice|Beverage|Candy|Confection|Jam|Preserve|Condiment|Dip|Spread|Batter|Dough|Filling|Frosting|Icing|Glaze|Marinade|Rub|Brine|Stock|Broth|Gravy|Custard|Ice cream|Sorbet|Smoothie|Juice|Milkshake|Porridge|Cereal|Granola|Muffin|Scone|Biscuit|Waffle|Crepe|Omelet|Quiche|Pizza|Burger|Taco|Burrito|Wrap|Roll|Bun|Loaf|Tart|Crumble|Cobbler|Trifle|Mousse|Souffl|Meringue|Brownie|Fudge|Toffee|Caramel|Nougat|Marshmallow|Gelatin|Jelly|Pickle|Chutney|Relish|Salsa|Guacamole|Hummus|Pesto|Mayonnaise|Ketchup|Mustard|Vinaigrette|Dressing|Kebab|Skewer|Meatball|Sausage|Bacon|Ham|Steak|Roast|Ribs|Wing|Nugget|Cutlet|Schnitzel|Patty|Croquette)/i;

// What the Recipes screen starts with, and what Clear filters goes back to. Peace Meal for one opens on "Fits my plan"
// (UX pass, October 2026): a recipe the plan does not allow is one tap away instead of mixed into the first page, and
// the chip shows that the filter is on.
function recipesDefaultUi() { return { q: '', fav: false, featured: false, nutrition: false, fits: !!uiState.lite, quick: false, source: '', veg: '', meal: '', cuisine: '', shown: RECIPES_PAGE }; }
let recipesUi = null;   // set on the first visit, once the app knows which build it is
// The filters behind "More filters" (UX pass, October 2026): on a phone the full row of chips ran to eight lines above
// the first recipe. Favorites, Fits my plan, Under 20 minutes, and the meal stay in view; the list opens by itself when
// one of its filters is on, and its closed line names them.
let recipesMoreOpen = false;
function recipesMoreActive() {
  const on = [];
  if (recipesUi.featured) on.push('Featured');
  if (recipesUi.nutrition) on.push('Has nutrition');
  if (recipesUi.source) on.push(RECIPES_SOURCE_LABEL[recipesUi.source] || recipesUi.source);
  if (recipesUi.veg) on.push(recipesUi.veg === 'vegan' ? 'Vegan' : 'Vegetarian');
  if (recipesUi.cuisine) on.push(CUISINE_LABEL[recipesUi.cuisine] || recipesUi.cuisine);
  return on;
}

// ---- Pool helpers ----
export function recipesHasNutrition(r) { return !!(r.nutrition_per_serving && r.nutrition_source) || (r.ingredients || []).some(i => i.food); }
export function recipesSourceKey(r) {
  if (r.custom) return 'mine';
  if (/nhs/i.test(r.source || '')) return 'nhs';
  if (/parent club/i.test(r.source || '')) return 'parentclub';
  if (/nhlbi/i.test(r.source || '')) return 'nhlbi';
  if (/^VA Healthy Teaching Kitchen$/.test(r.source || '')) return 'va';
  if (/wikibooks/i.test(r.source || '')) return 'wikibooks';
  if (/usda/i.test(r.source || '')) return 'usda';
  return 'peace-meal';
}
const RECIPES_SOURCE_LABEL = { mine: 'Mine', nhs: 'NHS', parentclub: 'Parent Club', nhlbi: 'NHLBI', va: 'VA', wikibooks: 'Wikibooks', usda: 'USDA', 'peace-meal': 'Peace Meal' };
const RECIPES_SOURCE_TONE = { mine: 'plum', nhs: 'info', parentclub: 'info', nhlbi: 'info', va: 'info', wikibooks: 'neutral', usda: 'caution', 'peace-meal': 'olive' };
export function recipesSourceChip(r) { const k = recipesSourceKey(r); return uiChip(RECIPES_SOURCE_LABEL[k], RECIPES_SOURCE_TONE[k]) + recipesDietChips(r); }
const RECIPES_FAMILY_LABEL = { 'low-fodmap': 'low FODMAP', 'low-histamine': 'low histamine' };
// "adapted" for a swap-layer copy; "written for" on Peace Meal's own diet recipes.
export function recipesDietChips(r) {
  let out = '';
  if (r.adapted) out += uiChip('adapted: ' + (r.adapted.label || r.adapted.family), 'plum', { attrs: `title="Made from ${uiEsc(r.adapted.fromName)} with sourced swaps"` });
  if (Array.isArray(r.diet_written_for) && r.diet_written_for.length) out += uiChip('written for ' + r.diet_written_for.map(f => RECIPES_FAMILY_LABEL[f] || f).join(' and '), 'olive');
  if (r.collection === 'review_dual') out += uiChip('new', 'pass', { soft: true, attrs: 'title="Peace Meal recipes for low FODMAP and low histamine together, September 2026. Turn them off in Settings, Recipe collections."' });
  return out;
}

let recipesIndexCache = null;
// The active person's pool: base recipes plus adapted copies for the diet families their plan restricts.
function recipesPool() {
  try { const p = uiActivePerson(); const plan = p ? uiPlanFor(p) : null; return plan && uiState.recipesForPlan ? uiState.recipesForPlan(plan) : uiState.data.recipes; } catch { return uiState.data.recipes; }
}
function recipesIndex() {
  const pool = recipesPool();
  if (recipesIndexCache && recipesIndexCache.pool === pool) return recipesIndexCache;
  const rows = new Map();
  const cuisineCount = {};
  for (const r of pool) {
    const cats = r.wikibooks_categories || [];
    const cuisine = r.cuisine_id || '';
    if (cuisine && cuisine !== 'other') cuisineCount[cuisine] = (cuisineCount[cuisine] || 0) + 1;
    const tags = r.tags || [];
    const vegan = cats.some(c => /^Vegan/.test(c)) || tags.includes('vegan');
    const vegetarian = vegan || cats.some(c => /^(Vegetarian|Lacto|Ovo)/.test(c)) || tags.includes('vegetarian');
    const text = (r.name + ' ' + (r.ingredients || []).map(i => i.display || '').join(' ')).toLowerCase();
    rows.set(r.id, { text, name: r.name.toLowerCase(), cuisine, vegan, vegetarian, source: recipesSourceKey(r), nutrition: recipesHasNutrition(r) });
  }
  const cuisines = CUISINES.filter(c => cuisineCount[c.id]).map(c => c.id);
  recipesIndexCache = { pool, rows, cuisines };
  return recipesIndexCache;
}

// Verdicts are computed only for the cards on screen, and cached per plan.
let recipesVerdictCache = { plan: null, person: null, map: new Map() };
export function recipesCheck(r, person, plan) {
  if (recipesVerdictCache.plan !== plan || recipesVerdictCache.person !== person.id) recipesVerdictCache = { plan, person: person.id, map: new Map() };
  let c = recipesVerdictCache.map.get(r.id);
  if (!c) { c = checkRecipe(r, plan, uiState.matcher, uiState.foodsById, person); recipesVerdictCache.map.set(r.id, c); }
  return c;
}

// ---- Hearts and never again ----
export function recipesIsNever(person, id) { return !!(person && person.disliked && person.disliked.recipes && person.disliked.recipes.includes(id)); }
// Asks first. Returns true when the recipe was marked. Also drops it from favorites.
export function recipesMarkNever(person, recipe) {
  if (!person || !recipe) return false;
  if (!window.confirm(`Never suggest ${recipe.name} again?`)) return false;
  person.disliked = person.disliked || { recipes: [], foods: [] };
  person.disliked.recipes = person.disliked.recipes || [];
  if (!person.disliked.recipes.includes(recipe.id)) person.disliked.recipes.push(recipe.id);
  if (person.favorites && person.favorites.recipes) person.favorites.recipes = person.favorites.recipes.filter(x => x !== recipe.id);
  uiPersist();
  uiToast(`${recipe.name} will not be suggested again.`);
  return true;
}
export function recipesUnmarkNever(person, recipe) {
  if (!person || !person.disliked || !person.disliked.recipes) return false;
  person.disliked.recipes = person.disliked.recipes.filter(x => x !== recipe.id);
  uiPersist();
  uiToast(`${recipe.name} can be suggested again.`);
  return true;
}
// Heart and never-again buttons for one recipe. Bind with recipesBindTaste.
export function recipesTasteHTML(person, id) {
  if (!person || person.id === 'group') return '';
  const fav = todayIsFavorite(person, 'recipe', id);
  const never = recipesIsNever(person, id);
  return `<button class="heart-btn ${fav ? 'on' : ''}" type="button" data-fav="${uiEsc(id)}" aria-pressed="${fav}" aria-label="${fav ? 'Remove from favorites' : 'Add to favorites'}" title="${fav ? 'Favorite' : 'Add to favorites'}">${uiIcon('heart', { fill: fav })}</button><button class="never-btn ${never ? 'on' : ''}" type="button" data-never="${uiEsc(id)}" aria-pressed="${never}" aria-label="${never ? 'Allow this recipe to be suggested again' : 'Never suggest this recipe again'}" title="${never ? 'Never again (tap to allow)' : 'Never again'}">${uiIcon('ban')}</button>`;
}
// Wires every [data-fav] and [data-never] under root. onChange(kind, id, on) runs after a change; default is a re-render.
export function recipesBindTaste(root, person, onChange) {
  const done = (kind, id, on) => { if (onChange) onChange(kind, id, on); else uiState.rerender(); };
  root.querySelectorAll('[data-fav]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.fav;
    if (recipesIsNever(person, id)) { const r = uiState.recipesById.get(id); if (r) recipesUnmarkNever(person, r); }
    const on = todayToggleFavorite(person, 'recipe', id);
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); b.innerHTML = uiIcon('heart', { fill: on }); b.setAttribute('aria-label', on ? 'Remove from favorites' : 'Add to favorites');
    uiToast(on ? 'Added to favorites.' : 'Removed from favorites.');
    done('fav', id, on);
  }));
  root.querySelectorAll('[data-never]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.never;
    const r = uiState.recipesById.get(id);
    if (!r) return;
    const was = recipesIsNever(person, id);
    const changed = was ? recipesUnmarkNever(person, r) : recipesMarkNever(person, r);
    if (!changed) return;
    const on = !was;
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
    done('never', id, on);
  }));
}

// ---- Attribution ----
function recipesLinkify(text) {
  return uiEsc(text).replace(/(https?:\/\/[^\s,)]+)/g, u => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
}
export function recipesAttributionHTML(r) {
  const parts = [];
  const licUrl = r.license && RECIPES_LICENSE_URL[r.license];
  if (r.attribution) {
    let line = recipesLinkify(r.attribution);
    if (licUrl && !/creativecommons|nationalarchives/.test(r.attribution)) line = line.replace(uiEsc(r.license), `<a href="${licUrl}" target="_blank" rel="noopener noreferrer">${uiEsc(r.license)}</a>`);
    parts.push(`<p class="small attribution">${line}</p>`);
    if (r.source_url && !r.attribution.includes(r.source_url)) parts.push(`<p class="small muted">Source: <a href="${uiEsc(r.source_url)}" target="_blank" rel="noopener noreferrer">${uiEsc(r.source_url)}</a></p>`);
  } else if (r.derived_from && (r.derived_from.attribution || r.derived_from.source)) {
    const d = r.derived_from;
    parts.push(`<p class="small attribution">Adapted from "${uiEsc(d.name)}" (${uiEsc(d.source)}).${d.attribution ? ' ' + recipesLinkify(d.attribution) : ''}${d.license && RECIPES_LICENSE_URL[d.license] && !/creativecommons|nationalarchives/.test(d.attribution || '') ? ` Licence: <a href="${RECIPES_LICENSE_URL[d.license]}" target="_blank" rel="noopener noreferrer">${uiEsc(d.license)}</a>.` : ''}</p>`);
  } else if (r.custom) {
    parts.push('<p class="small muted">Written in this household. Stored on this device only.</p>');
  } else {
    parts.push('<p class="small muted">A Peace Meal recipe. Nutrients are summed from USDA values by grams.</p>');
  }
  return parts.join('');
}

// ---- Detail sheet ----
export function recipesDetailModal(recipeId, person, plan, opts = {}) {
  if (!uiState.recipesById.get(recipeId)) uiEnsureAllRecipes();   // a Wikibooks recipe named before they were read
  const r = uiState.recipesById.get(recipeId);
  if (!r) { uiToast('That recipe is not in the pool.'); return; }
  person = person || uiActivePerson();
  plan = plan || uiPlanFor(person);
  const check = checkRecipe(r, plan, uiState.matcher, uiState.foodsById, person);
  const per = check.perServing;
  const hasNut = recipesHasNutrition(r);
  const linkedCount = (r.ingredients || []).filter(i => i.food).length;
  const unlinked = (r.ingredients || []).filter(i => !i.food && i.display).map(i => i.display);
  const imported = !!(r.nutrition_per_serving && r.nutrition_source && !linkedCount);
  const targetRows = Object.entries(plan.targets || {}).map(([n, t]) => ({ nutrient: n, perServing: round(per[n], 1), min: t.min, pct: t.min ? round(per[n] / t.min * 100) : null }));
  const swaps = ((r.notes && r.notes.swaps) || []).filter(s => plan.avoid && plan.avoid[s.if_tag]);
  const component = isComponent(r);
  const mealOpts = (component ? ['snack'] : r.meal && r.meal.length ? r.meal : ['dinner']).map(s => `<option value="${uiEsc(s)}">${RECIPES_SLOT_LABEL[s] || s}</option>`).join('');
  const weekSlots = component ? [] : ['breakfast', 'lunch', 'dinner'].filter(s => !r.meal || !r.meal.length || r.meal.includes(s));
  const heat = recipeHeat(r);
  const slotOpts = (weekSlots.length ? weekSlots : ['breakfast', 'lunch', 'dinner']).map(s => `<option value="${s}">${RECIPES_SLOT_LABEL[s]}</option>`).join('');
  let week = null;
  try { week = uiState.data.recipes.length && person && !person.guest && person.id !== 'group' && !component ? weekGet(person, plan) : null; } catch { week = null; }
  const dayOpts = week ? week.days.map((d, di) => { const [, mo, da] = d.date.split('-'); return `<option value="${di}">${RECIPES_DAY_NAMES[d.day] || uiFmtDate(d.date)} ${Number(mo)}/${Number(da)}</option>`; }).join('') : '';
  let changed = !!opts.changed;
  const canAct = person.id !== 'group';   // the Together group is a temporary combined person: no diary, no week of its own
  const canPlan = check.verdict !== 'fail';   // the week takes recipes that pass; a caution recipe goes in only after the person confirms
  const m = uiModal(`
    <div class="verdict compact ${check.verdict}"><span class="verdict-word">${uiVerdictWord(check.verdict)}</span> <span class="small">${check.hits.length || (check.termHits || []).some(t => t.allergy) ? 'Matches: ' + [...check.hits.map(h => uiEsc(h.label) + (h.hard ? ' (hard)' : '')), ...(check.termHits || []).filter(t => t.allergy).map(t => uiEsc(t.term) + ' (your allergy, hard)')].join(', ') : 'No avoid tags matched.'}${check.notApproved && check.notApproved.length ? ' Not on the approved ' + uiEsc([...new Set(check.notApproved.map(n => n.family.replace('low-', 'low ').replace('fodmap', 'FODMAP')))].join(' and ')) + ' list: ' + [...new Set(check.notApproved.map(n => n.label))].map(uiEsc).join(', ') + (check.notApproved.some(n => n.why === 'reacts') ? ' (a food you react to)' : '') + '.' : ''}${check.exceeds.length ? ' One serving exceeds the daily ' + check.exceeds.map(e => uiEsc(uiNutrientLabel(e.nutrient))).join(', ') + '.' : ''}${(check.sodium || []).length ? ' Salty ingredients with no sodium numbers: ' + [...check.sodium[0].terms, ...check.sodium[0].mayTerms].map(uiEsc).join(', ') + '. The app cannot count this recipe toward the ' + uiFmtNum(check.sodium[0].limit) + ' mg a day sodium limit.' : ''}${check.verifyLabel && check.verifyLabel.length ? ' Check the label for: ' + check.verifyLabel.map(v => uiEsc(v.label)).join(', ') + '.' : ''}${(check.smallServe || []).length ? ' Several small serves in one meal: ' + [...new Set(check.smallServe.flatMap(x => x.terms))].map(uiEsc).join(', ') + '.' : ''}${check.verdict === 'caution' && (check.unknownRisk || []).length ? ' Could hide something: ' + [...new Set(check.unknownRisk.map(u => u.term))].map(uiEsc).join(', ') + '.' : ''}${check.verdict === 'caution' && (check.unrecognized || []).length ? ' Not recognized, so not counted as safe: ' + check.unrecognized.slice(0, 4).map(uiEsc).join('; ') + (check.unrecognized.length > 4 ? '; and more' : '') + '.' : ''}</span></div>
    ${r.adapted ? uiNoticeHTML({ level: 'info', text: `Adapted from "${r.adapted.fromName}" for a ${r.adapted.label} diet. ${r.adapted.swaps.map(sw => sw.to ? `${sw.from} became ${sw.to}: ${sw.how}` : `${sw.from} was left out: ${sw.how}`).join(' ')}${r.nutrition_approx ? ' The nutrition numbers are the original recipe\'s published figures and are approximate after these swaps.' : ' Nutrition is recomputed from the new ingredients.'}` }) : ''}
    ${r.adapted ? `<p class="small muted">Swap sources: ${uiSourcesHTML([...new Set(r.adapted.swaps.flatMap(sw => sw.sources || []))])}</p>` : ''}
    <div class="row recipe-meta">${recipesSourceChip(r)}${r.featured ? `<span class="featured-star">${uiIcon('star', { fill: true })}Featured</span>` : ''}${r.linked_by_household ? uiChip('linked by you', 'pass') : ''}${!hasNut ? uiChip('no nutrition data', 'caution') : ''}${component ? uiChip('sauce or basic', 'neutral', { attrs: 'title="A component: kept in the library, never scheduled as a meal on its own"' }) : ''}${heat.level ? uiChip(heat.label, heat.level >= 3 ? 'stop' : heat.level === 2 ? 'caution' : 'info', { soft: true, attrs: `title="Estimated from: ${uiEsc(heat.terms.join(', '))}"` }) : ''}</div>
    <dl class="kv">
      <dt>Time</dt><dd>${r.active_min} min active, ${r.total_min} min total${r.times_estimated ? ' <span class="muted">(estimated)</span>' : ''}</dd>
      <dt>Skill</dt><dd>${uiEsc(r.skill)}${r.skill_estimated ? ' <span class="muted">(estimated)</span>' : ''}</dd>
      <dt>Equipment</dt><dd>${(r.equipment || []).map(uiEsc).join(', ') || 'none'}</dd>
      <dt>Servings</dt><dd>${r.servings}${r.servings_estimated ? ' <span class="muted">(estimated)</span>' : ''}${r.leftovers ? `, leftovers ${uiEsc(r.leftovers)}` : ''}</dd>
      ${r.meal ? `<dt>Meal</dt><dd>${r.meal.map(s => RECIPES_SLOT_LABEL[s] || s).map(uiEsc).join(', ')}</dd>` : ''}
      ${heat.level ? `<dt>Heat</dt><dd>${uiEsc(heat.label)} <span class="muted">(estimated from ${uiEsc(heat.terms.join(', '))})</span>${spiceSkipped(r, person) ? ' <span class="muted">Hidden from your week by your spice setting.</span>' : ''}</dd>` : ''}
    </dl>
    ${swaps.length ? `<div class="stack">${swaps.map(s => uiNoticeHTML({ level: 'warn', text: `${uiTagLabel(s.if_tag)} is on your avoid list. ${s.then}` })).join('')}</div>` : ''}
    <div class="recipe-actions">
      ${canAct ? `<div class="row">${recipesTasteHTML(person, r.id)}<span class="small muted">Heart to see it first in the week; never again removes it from every suggestion.</span></div>
      <div class="row action-line"><label class="visually-hidden" for="rd-meal">Meal</label><select id="rd-meal" style="width:auto">${mealOpts}</select><button class="btn small" type="button" id="rd-today">${uiIcon('plus')}Add to Today</button></div>` : ''}
      ${week ? `<div class="row action-line"><label class="visually-hidden" for="rd-day">Day</label><select id="rd-day" style="width:auto">${dayOpts}</select><label class="visually-hidden" for="rd-slot">Slot</label><select id="rd-slot" style="width:auto">${slotOpts}</select><button class="btn small" type="button" id="rd-week" ${canPlan ? '' : 'disabled'}>${uiIcon('calendar')}Put in this week</button>${canPlan ? (check.verdict === 'caution' ? '<span class="small muted">Marked caution: you will be asked first.</span>' : '') : '<span class="small muted">Not allowed: hard exclusion.</span>'}</div>` : ''}
      <div class="btn-row">
        ${r.custom ? `<button class="btn small" type="button" id="rd-edit">${uiIcon('edit')}Edit</button><button class="btn small danger" type="button" id="rd-delete">${uiIcon('trash')}Delete</button>` : ''}
        ${!r.custom && (r.ingredients || []).some(i => !i.food) ? `<button class="btn small" type="button" id="rd-link">${uiIcon('link')}${linkedCount ? 'Edit ingredient links' : 'Link ingredients'}</button>` : ''}
        ${!r.custom && linkedCount && (r.ingredients || []).every(i => i.food) && r.linked_by_household ? `<button class="btn small" type="button" id="rd-link">${uiIcon('link')}Edit ingredient links</button>` : ''}
        <button class="btn small" type="button" id="rd-copy">${uiIcon('copy')}Make my own copy</button>
      </div>
    </div>
    <div class="recipe-cols">
      <div><h3>Ingredients</h3>
        <ul>${(r.ingredients || []).map(i => { const f = i.food ? uiState.foodsById.get(i.food) : null; const label = (i.display || (f ? f.short || f.name : i.food)) + (i.amount_text ? ', ' + i.amount_text : ''); return `<li>${uiEsc(label)}${i.replaces ? ` <span class="muted small">(in place of ${uiEsc(i.replaces)})</span>` : ''} ${f ? `<span class="muted small num">(${uiFmtNum(i.grams)} g${i.estimated ? ', estimated' : ''}${i.display && f ? `, ${uiEsc(f.short || f.name)}` : ''})</span>` : i.food ? '<span class="muted small">(food not in database)</span>' : '<span class="muted small">(not linked)</span>'}</li>`; }).join('')}</ul>
        ${check.unrecognized.length ? `<p class="small"><strong>Not recognized:</strong> ${check.unrecognized.map(uiEsc).join('; ')}. The app does not assume these are safe.</p>` : ''}
        ${uiPortionsHTML(check) ? `<h3>Portions</h3>${uiPortionsHTML(check)}` : ''}</div>
      <div><h3>Steps</h3>
        <ol>${(r.steps || []).map(s => `<li>${uiEsc(s)}</li>`).join('')}</ol>
        ${r.notes && r.notes.sodium_tip ? `<p class="small"><strong>Sodium:</strong> ${uiEsc(r.notes.sodium_tip)}</p>` : ''}
        ${r.notes && r.notes.text ? `<p class="small"><strong>Notes:</strong> ${uiEsc(r.notes.text)}</p>` : ''}</div>
    </div>
    <h3>Per serving versus ${uiEsc(person.name)}'s plan</h3>
    ${hasNut ? `<div class="table-wrap"><table>
      <thead><tr><th>Nutrient</th><th class="num">Per serving</th><th class="num">Daily number</th><th class="num">% of daily</th></tr></thead>
      <tbody>
        ${check.vsLimits.map(v => `<tr><td>${uiEsc(uiNutrientLabel(v.nutrient))}</td><td class="num">${v.missingData ? '<span class="muted">partial</span> ' : ''}${uiFmtNum(v.perServing, 1)}</td><td class="num">at most ${uiFmtNum(v.dailyLimit, 1)}</td><td class="num ${v.exceedsInOneServing ? 'over' : ''}">${v.pctOfDaily}%${v.exceedsInOneServing ? ' over' : ''}</td></tr>`).join('')}
        ${targetRows.map(v => `<tr><td>${uiEsc(uiNutrientLabel(v.nutrient))}</td><td class="num">${uiFmtNum(v.perServing, 1)}</td><td class="num">at least ${uiFmtNum(v.min, 1)}</td><td class="num">${v.pct != null ? v.pct + '%' : ''}</td></tr>`).join('')}
        ${!check.vsLimits.length && !targetRows.length ? '<tr><td colspan="4" class="muted">No numeric limits or targets in the plan.</td></tr>' : ''}
      </tbody></table></div>
    <p class="small muted">${uiFmtNum(per.kcal)} kcal, ${uiFmtNum(per.protein_g, 1)} g protein, ${uiFmtNum(per.carb_g, 1)} g carbohydrate, ${uiFmtNum(per.fiber_g, 1)} g fiber, ${uiFmtNum(per.sodium_mg)} mg sodium per serving${imported ? `, as published by the ${uiEsc(r.source || r.nutrition_source)}${r.conversion_note ? '; ' + uiEsc(r.conversion_note) : ''}` : ', summed from USDA values by grams'}.${check.missingFoods.filter(Boolean).length ? ' Some ingredients are not in the food database and are not counted.' : ''}</p>
    ${unlinked.length && linkedCount ? `<p class="small muted">Not counted (display only): ${unlinked.map(uiEsc).join('; ')}. Link them to include them.</p>` : ''}`
    : `<p>Nutrition not available until ingredients are linked.</p><p class="small muted">The ${uiEsc(r.source || 'source')} does not publish nutrition figures and the app never derives numbers from text. Link each ingredient to a food and the nutrients are summed from USDA values by grams.</p>`}
    ${recipesAttributionHTML(r)}
    ${r.tags && r.tags.length ? `<p class="small muted">Tags: ${r.tags.map(t => `<code>${uiEsc(t)}</code>`).join(' ')}</p>` : ''}
  `, { title: r.name, label: 'Recipe: ' + r.name, onClose: o => { if (changed && !(o && o.silent)) uiState.rerender(); if (opts.onClose) opts.onClose(o); } });
  if (!m) return;
  const el = m.el;
  recipesBindTaste(el, person, () => { changed = true; });
  const todayBtn = el.querySelector('#rd-today');
  if (todayBtn) todayBtn.addEventListener('click', () => {
    const meal = el.querySelector('#rd-meal').value;
    todayAddDiaryEntry(person, { date: uiIsoDate(uiToday()), meal, kind: 'recipe', ref: r.id, amount: 1, unit: 'serving' });
    uiToast(`Added ${r.name} to today's ${RECIPES_SLOT_LABEL[meal] ? RECIPES_SLOT_LABEL[meal].toLowerCase() : meal}.`);
    changed = true;
  });
  const wk = el.querySelector('#rd-week');
  if (wk) wk.addEventListener('click', async () => {
    const di = Number(el.querySelector('#rd-day').value);
    const slot = el.querySelector('#rd-slot').value;
    const day = week.days[di];
    const dayName = RECIPES_DAY_NAMES[day.day] || uiFmtDate(day.date);
    if (check.verdict === 'caution') {
      const yes = await uiConfirmSheet({ title: 'Marked caution', text: `${r.name} is marked caution for you. Put it in your week anyway?`, confirm: 'Yes, use it', cancel: 'No' });
      if (!yes) return;
      weekSetOverride(person, di, slot, r.id, `Put ${r.name} in ${dayName} ${slot} (marked caution, your pick)`);
      uiToast(`${r.name} is now ${dayName}'s ${slot}, marked caution. The grocery list was updated.`);
      changed = true;
      return;
    }
    weekSetOverride(person, di, slot, r.id, `Put ${r.name} in ${dayName} ${slot}`);
    uiToast(`${r.name} is now ${dayName}'s ${slot}. The grocery list was updated.`);
    changed = true;
  });
  const link = el.querySelector('#rd-link');
  if (link) link.addEventListener('click', () => recipesEdLinkSheet(r, { onSaved: () => recipesDetailModal(r.id, person, null, { changed: true, onClose: opts.onClose }), onClose: o => { if (!(o && o.silent)) recipesDetailModal(r.id, person, null, { changed, onClose: opts.onClose }); } }));
  el.querySelector('#rd-copy').addEventListener('click', () => {
    recipesEdEditorModal(recipesEdDraftFrom(r, { copy: true }), { onSaved: rec => recipesDetailModal(rec.id, person, null, { changed: true, onClose: opts.onClose }), onClose: o => { if (!(o && o.silent)) recipesDetailModal(r.id, person, null, { changed, onClose: opts.onClose }); } });
  });
  const edit = el.querySelector('#rd-edit');
  if (edit) edit.addEventListener('click', () => recipesEdEditorModal(recipesEdDraftFrom(r), { onSaved: rec => recipesDetailModal(rec.id, person, null, { changed: true, onClose: opts.onClose }), onClose: o => { if (!(o && o.silent)) recipesDetailModal(r.id, person, null, { changed, onClose: opts.onClose }); } }));
  const del = el.querySelector('#rd-delete');
  if (del) del.addEventListener('click', () => { if (recipesEdDeleteCustom(r.id)) { changed = true; m.close(); } });
}

// ---- Browse screen ----
function recipesFiltered(person, plan) {
  const idx = recipesIndex();
  const q = recipesUi.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const favs = new Set((person.favorites && person.favorites.recipes) || []);
  const out = [];
  let more = false, checked = 0, skippedCount = 0;
  for (const r of recipesPool()) {
    const row = idx.rows.get(r.id);
    if (!row) continue;
    if (recipesUi.fav && !favs.has(r.id)) continue;
    if (recipesUi.featured && !r.featured) continue;
    if (recipesUi.nutrition && !row.nutrition) continue;
    if (recipesUi.quick && !((r.total_min || 0) <= 20)) continue;
    if (recipesUi.source && row.source !== recipesUi.source) continue;
    if (recipesUi.veg === 'vegetarian' && !row.vegetarian) continue;
    if (recipesUi.veg === 'vegan' && !row.vegan) continue;
    if (recipesUi.meal && !(r.meal || []).includes(recipesUi.meal)) continue;
    if (recipesUi.cuisine && row.cuisine !== recipesUi.cuisine) continue;
    if (q.length && !q.every(w => row.text.includes(w))) continue;
    if (!recipesUi.showSkipped && (cuisineSkipped(r, person) || spiceSkipped(r, person))) { skippedCount++; continue; }
    if (recipesUi.fits) {
      // computed only as far as the page needs, never for the whole pool at once
      if (out.length >= recipesUi.shown) { more = true; break; }
      checked++;
      if (recipesCheck(r, person, plan).verdict === 'fail') continue;
    }
    out.push(r);
  }
  if (q.length) out.sort((a, b) => { const an = idx.rows.get(a.id).name.startsWith(q[0]) ? 0 : 1, bn = idx.rows.get(b.id).name.startsWith(q[0]) ? 0 : 1; return an - bn || (Number(favs.has(b.id)) - Number(favs.has(a.id))); });
  else out.sort((a, b) => Number(favs.has(b.id)) - Number(favs.has(a.id)) || Number(!!b.featured) - Number(!!a.featured) || 0);
  return { rows: out, exact: !recipesUi.fits, more, checked , skippedCount };
}

// Small heat word for list rows: nothing when the recipe has no heat.
function recipesHeatSpan(r) {
  const h = recipeHeat(r);
  return h.level ? `<span class="heat-${h.level}" title="Estimated from: ${uiEsc(h.terms.join(', '))}">${uiEsc(h.label.toLowerCase())}</span>` : '';
}

// Portion words for list rows (low FODMAP): "corn: small serve", small serves first; nothing when no food is limited.
function recipesPortionSpan(c) {
  const notes = ((c && c.portionNotes) || []).slice().sort((a, b) => Number(b.small) - Number(a.small));
  if (!notes.length) return '';
  const words = notes.slice(0, 2).map(n => `${n.term}: ${n.portion}`).join(', ') + (notes.length > 2 ? `, ${notes.length - 2} more` : '');
  return `<span class="${(c.smallServe || []).length ? 'verdict-word-sm caution' : 'muted'}">${uiEsc(words)}</span>`;
}

function recipesCardHTML(r, person, plan) {
  const c = recipesCheck(r, person, plan);
  const v = c.verdict;
  return `<div class="list-row recipe-row" data-row="${uiEsc(r.id)}">
    <button type="button" class="recipe-open" data-open="${uiEsc(r.id)}" aria-label="${uiEsc(r.name)}, ${uiVerdictWord(v)}. Open recipe.">
      <span class="dot ${v}" aria-hidden="true"></span>
      <span class="recipe-body">
        <span class="recipe-name">${uiEsc(r.name)}${r.featured ? ` <span class="featured-star" title="Featured">${uiIcon('star', { fill: true })}</span>` : ''}</span>
        <span class="recipe-sub">${recipesSourceChip(r)}<span>${r.total_min} min</span><span>${r.servings} serving${r.servings === 1 ? '' : 's'}</span><span class="verdict-word-sm ${v}">${uiVerdictWord(v)}</span>${!recipesHasNutrition(r) ? '<span class="muted">no nutrition data</span>' : ''}${isComponent(r) ? '<span class="muted">sauce or basic</span>' : ''}${recipesHeatSpan(r)}${recipesPortionSpan(c)}</span>
      </span>
    </button>
    <div class="list-actions">${recipesTasteHTML(person, r.id)}</div>
  </div>`;
}

export function renderRecipesScreen(root) {
  if (!recipesUi) recipesUi = recipesDefaultUi();
  const person = uiActivePerson();
  const plan = uiPlanFor(person);
  if (recipesUi.q.trim() || recipesUi.source === 'wikibooks') uiEnsureAllRecipes();
  const idx = recipesIndex();
  const total = uiState.data.recipes.length;
  const later = uiDeferredRecipes();
  const mine = uiState.data.recipes.filter(r => r.custom).length;
  const chip = (id, label, on) => `<button type="button" class="chip ${on ? 'plum' : 'neutral'} filter-chip" data-filter="${id}" aria-pressed="${on}">${label}</button>`;
  root.innerHTML = `
    ${uiPageHeader('Recipes', `${uiFmtNum(total)} recipes${mine ? ` (${mine} of yours)` : ''}, each checked against ${uiEsc(person.name)}'s plan.${later ? ` ${uiFmtNum(later.count)} more Wikibooks Cookbook recipes load when you search.` : ''}`, `<button class="btn small primary" type="button" id="rc-new">${uiIcon('plus')}New recipe</button><button class="btn small" type="button" id="rc-paste">${uiIcon('paste')}Paste a recipe</button>`)}
    <div class="card recipes-toolbar">
      <label for="rc-q" class="visually-hidden">Search recipes</label>
      <div class="search-row">${uiIcon('search')}<input id="rc-q" type="search" placeholder="Search by name or ingredient" value="${uiEsc(recipesUi.q)}" autocomplete="off"></div>
      <div class="filter-bar" role="group" aria-label="Filters">
        ${chip('fav', `${uiIcon('heart')}Favorites`, recipesUi.fav)}
        ${chip('fits', 'Fits my plan', recipesUi.fits)}
        ${chip('quick', 'Under 20 minutes', recipesUi.quick)}
        <label class="filter-select"><span class="visually-hidden">Meal</span><select id="rc-meal"><option value="">Any meal</option>${['breakfast', 'lunch', 'dinner', 'snack', 'component'].map(s => `<option value="${s}" ${recipesUi.meal === s ? 'selected' : ''}>${RECIPES_SLOT_LABEL[s]}</option>`).join('')}</select></label>
      </div>
      <details class="pick-more filter-more" ${recipesMoreOpen || recipesMoreActive().length ? 'open' : ''}><summary><span class="pick-title">More filters</span><span class="pick-summary" id="rc-more-summary">${uiEsc(recipesMoreActive().join(', ') || 'None on')}</span></summary>
        <div class="filter-bar" role="group" aria-label="More filters">
          ${chip('featured', `${uiIcon('star')}Featured`, recipesUi.featured)}
          ${chip('nutrition', 'Has nutrition', recipesUi.nutrition)}
          <span class="filter-sep" aria-hidden="true"></span>
          ${['peace-meal', 'nhs', 'parentclub', 'nhlbi', 'va', 'wikibooks', 'usda', 'mine'].filter(s => (s !== 'usda' || uiState.data.recipes.some(r => r.source === 'USDA MyPlate Kitchen')) && !(s === 'wikibooks' && uiState.lite)).map(s => chip('source:' + s, RECIPES_SOURCE_LABEL[s], recipesUi.source === s)).join('')}
          <span class="filter-sep" aria-hidden="true"></span>
          ${chip('veg:vegetarian', 'Vegetarian', recipesUi.veg === 'vegetarian')}
          ${chip('veg:vegan', 'Vegan', recipesUi.veg === 'vegan')}
          <label class="filter-select"><span class="visually-hidden">Cuisine</span><select id="rc-cuisine"><option value="">Any cuisine</option>${idx.cuisines.map(c => `<option value="${uiEsc(c)}" ${recipesUi.cuisine === c ? 'selected' : ''}>${uiEsc(CUISINE_LABEL[c] || c)}</option>`).join('')}</select></label>
        </div>
      </details>
      <button type="button" class="btn link small" id="rc-clear">Clear filters</button>
    </div>
    <div id="rc-list" class="stack-2"></div>
    <p class="small muted recipes-foot">Recipes come from ${uiRecipeSourcesText()}. <a href="#/learn/sources">Where the recipes come from</a>.</p>
  `;
  const listEl = root.querySelector('#rc-list');
  const moreSummary = () => { const el = root.querySelector('#rc-more-summary'); if (el) el.textContent = recipesMoreActive().join(', ') || 'None on'; };
  const draw = () => {
    const { rows, exact, more, skippedCount } = recipesFiltered(person, plan);
    const shown = rows.slice(0, recipesUi.shown);
    const hasMore = exact ? rows.length > shown.length : more;
    const count = exact ? `${uiFmtNum(rows.length)} recipe${rows.length === 1 ? '' : 's'}${rows.length > shown.length ? `, showing ${shown.length}` : ''}` : `${shown.length} recipe${shown.length === 1 ? '' : 's'} that fit so far${hasMore ? '; more below' : ''}`;
    listEl.innerHTML = shown.length ? `<p class="small muted" id="rc-count" aria-live="polite">${count}${skippedCount ? ` <button type="button" class="btn link small" id="rc-show-skipped">${uiFmtNum(skippedCount)} hidden by your cuisine or spice settings; show them</button>` : recipesUi.showSkipped && (person.preferences && (person.preferences.cuisines_skip || []).length) ? ` <button type="button" class="btn link small" id="rc-hide-skipped">Hide skipped cuisines again</button>` : ''}. Favorites first.</p>
      <div class="list boxed">${shown.map(r => recipesCardHTML(r, person, plan)).join('')}</div>
      ${hasMore ? `<div class="btn-row"><button class="btn" type="button" id="rc-more">Show ${RECIPES_PAGE} more</button></div>` : ''}`
      : uiEmptyState(skippedCount ? `No recipe matches these filters, but ${uiFmtNum(skippedCount)} ${skippedCount === 1 ? 'is' : 'are'} hidden by your cuisine or spice settings.` : recipesUi.q || recipesUi.fav || recipesUi.source || recipesUi.fits ? 'No recipe matches these filters.' : 'No recipes are loaded.', skippedCount ? '<button class="btn small" type="button" id="rc-show-skipped">Show them</button>' : recipesUi.fav ? '<button class="btn small" type="button" data-filter="fav">Show all recipes</button>' : '', 'list');
    listEl.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => recipesDetailModal(b.dataset.open, person, plan)));
    const sk = listEl.querySelector('#rc-show-skipped'); if (sk) sk.addEventListener('click', () => { recipesUi.showSkipped = true; draw(); });
    const hk = listEl.querySelector('#rc-hide-skipped'); if (hk) hk.addEventListener('click', () => { recipesUi.showSkipped = false; draw(); });
    recipesBindTaste(listEl, person, (kind, id, on) => {
      const row = listEl.querySelector(`[data-row="${CSS.escape(id)}"]`);
      if (kind === 'never' && on && row) row.remove();
      if (kind === 'fav' && row) { const nb = row.querySelector('[data-never]'); if (nb) { nb.classList.remove('on'); nb.setAttribute('aria-pressed', 'false'); } }
      if (kind === 'fav' && recipesUi.fav && !on && row) row.remove();
    });
    const moreBtn = listEl.querySelector('#rc-more');
    if (moreBtn) moreBtn.addEventListener('click', () => { recipesUi.shown += RECIPES_PAGE; draw(); const rowsNow = listEl.querySelectorAll('.recipe-row'); const target = rowsNow[Math.max(0, rowsNow.length - RECIPES_PAGE)]; if (target) target.querySelector('.recipe-open').focus({ preventScroll: false }); });
    listEl.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => { recipesUi.fav = false; uiState.rerender(); }));
  };
  const q = root.querySelector('#rc-q');
  let t = null;
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { recipesUi.q = q.value; recipesUi.shown = RECIPES_PAGE; if (recipesUi.q.trim()) uiEnsureAllRecipes(); draw(); }, 120); });
  root.querySelectorAll('.filter-bar [data-filter]').forEach(b => b.addEventListener('click', () => {
    const f = b.dataset.filter;
    if (f.startsWith('source:')) { const v = f.slice(7); recipesUi.source = recipesUi.source === v ? '' : v; if (recipesUi.source === 'wikibooks') uiEnsureAllRecipes(); }
    else if (f.startsWith('veg:')) { const v = f.slice(4); recipesUi.veg = recipesUi.veg === v ? '' : v; }
    else recipesUi[f] = !recipesUi[f];
    recipesUi.shown = RECIPES_PAGE;
    root.querySelectorAll('.filter-bar [data-filter]').forEach(x => {
      const id = x.dataset.filter;
      const on = id.startsWith('source:') ? recipesUi.source === id.slice(7) : id.startsWith('veg:') ? recipesUi.veg === id.slice(4) : !!recipesUi[id];
      x.classList.toggle('plum', on); x.classList.toggle('neutral', !on); x.setAttribute('aria-pressed', String(on));
    });
    moreSummary();
    draw();
  }));
  root.querySelector('#rc-meal').addEventListener('change', e => { recipesUi.meal = e.target.value; recipesUi.shown = RECIPES_PAGE; draw(); });
  root.querySelector('#rc-cuisine').addEventListener('change', e => { recipesUi.cuisine = e.target.value; recipesUi.shown = RECIPES_PAGE; moreSummary(); draw(); });
  const moreBox = root.querySelector('.filter-more');
  if (moreBox) moreBox.addEventListener('toggle', () => { recipesMoreOpen = moreBox.open; });
  root.querySelector('#rc-clear').addEventListener('click', () => { recipesUi = recipesDefaultUi(); uiState.rerender(); });
  root.querySelector('#rc-new').addEventListener('click', () => recipesEdEditorModal(recipesEdBlankDraft(), { onSaved: rec => { recipesUi.source = 'mine'; recipesDetailModal(rec.id, person, null, { changed: true }); } }));
  root.querySelector('#rc-paste').addEventListener('click', () => recipesEdPasteModal({ onSaved: rec => { recipesUi.source = 'mine'; recipesDetailModal(rec.id, person, null, { changed: true }); } }));
  draw();
}

// Sources page counts, computed live from the pool (shipped recipes plus the household's own).
export function recipesSourceCounts() {
  const base = uiState.baseRecipes || [];
  const by = key => base.filter(r => recipesSourceKey(r) === key);
  const nhs = by('nhs'), pcs = by('parentclub'), nhlbi = by('nhlbi'), va = by('va'), wb = by('wikibooks'), pm = by('peace-meal');
  const links = uiState.profile && uiState.profile.recipe_links ? Object.keys(uiState.profile.recipe_links).filter(id => Array.isArray(uiState.profile.recipe_links[id]) && uiState.profile.recipe_links[id].some(l => l.food)).length : 0;
  const later = uiDeferredRecipes() || { count: 0, featured: 0, times_estimated: 0 };   // shipped in this file, read on the first search
  return {
    total: base.length + later.count, peaceMeal: pm.length, nhs: nhs.length, nhsWithNutrition: nhs.filter(r => r.nutrition_per_serving).length,
    va: va.length, vaWithNotes: va.filter(r => r.notes && r.notes.text).length,
    nhlbi: nhlbi.length, nhlbiWithPotassium: nhlbi.filter(r => r.nutrition_per_serving && typeof r.nutrition_per_serving.potassium_mg === 'number').length,
    parentclub: pcs.length, parentclubWithSodium: pcs.filter(r => r.nutrition_per_serving && typeof r.nutrition_per_serving.sodium_mg === 'number').length,
    wikibooks: wb.length + later.count, wikibooksFeatured: wb.filter(r => r.featured).length + later.featured, wikibooksTimesEstimated: wb.filter(r => r.times_estimated).length + later.times_estimated,
    mine: (uiState.profile && uiState.profile.custom_recipes || []).length, linked: links,
    withNutrition: (uiState.data.recipes || []).filter(recipesHasNutrition).length, pool: (uiState.data.recipes || []).length
  };
}

