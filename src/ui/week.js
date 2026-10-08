// Week: a 7-day plan from the planner, with swaps, logging, and recipe detail.
import { buildWeekPlan, scoreRecipe, recipeMeal, SLOT_LABEL, DAYS, snackPlan, daySlots, isSnackSlot, mealFits, repickSlots, cautionWhy, plannerHasLimits } from '../engine/planner.js';
import { recipeHeat, spicePreference } from '../engine/spice.js';
import { checkRecipe } from '../engine/checker.js';
import { compareToPlan, recipeTotals, emptyTotals, addTotals } from '../engine/nutrition.js';
import { uiState, uiEsc, uiActivePerson, uiPlanFor, uiPersist, uiWeekKey, uiToday, uiIsoDate, uiFmtDate, uiFmtNum, uiNutrientLabel, uiModal, uiToast, uiVerdictWord, uiVerdictChip, uiPageHeader, uiSection, uiChip, uiIcon, uiNoticeHTML, uiEmptyState, uiSwitch, uiMeterTone, uiConfirmSheet, uiEnsureAllRecipes, uiDeferredRecipes } from './common.js';
import { grocerySyncChanges, grocerySetEaters } from './grocery.js';
import { todayAddDiaryEntry, todayTargetInfo } from './today.js';
import { recipesDetailModal, recipesTasteHTML, recipesBindTaste, recipesIsNever } from './recipes.js';

const WEEK_SLOT_LABEL = SLOT_LABEL;
const WEEK_MINUTE_OPTIONS = [10, 15, 20, 30, 45, 60, 90];
const WEEK_DAY_NAMES = { sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday' };
const WEEK_DAY_SHORT = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' };

// P2-1 (fix pass of September 30, 2026): a built week is kept until something it depends on changes, instead of being
// thrown away on every save (each tap on lite Today rebuilt it). It depends on the person (allergies, conditions,
// settings, likes, this week's changes), the recipe collections, linked ingredients, the person's own recipes, and the
// recipe pool, which is a new list whenever it is put together again (src/app.js, appAssembleRecipes); the date and the
// plan seed are in the key. The household week works the same way (src/ui/household.js, householdSignature).
function weekInputs(person) {
  const p = uiState.profile || {};
  return JSON.stringify([person, p.recipe_collections || null, p.recipe_links || null, p.household || null, p.custom_recipes || null]);
}
const weekPool = () => (uiState.data && uiState.data.recipes) || null;
// The built week for this person when it is ready and still current; null when it would have to be built.
export function weekCached(person) {
  const hit = uiState.weekCache.get(uiWeekKey(person));
  return hit && hit.pool === weekPool() && hit.inputs === weekInputs(person) ? hit.week : null;
}

export function weekGet(person, plan) {
  const ready = weekCached(person);
  if (ready) return ready;
  const key = uiWeekKey(person);
  const wo = weekThisWeek(person);
  const week = buildWeekPlan({ person, plan, recipes: uiState.recipesForPlan ? uiState.recipesForPlan(plan) : uiState.data.recipes, foodsById: uiState.foodsById, matcher: uiState.matcher, startDate: uiToday(), seed: person.planSeed || 0, dayOverrides: wo.days, snacksPerDay: wo.snacks_per_day });
  weekApplySnapshot(week, person);
  weekApplyOverrides(week, person, plan);
  // One week per person: an older one (another day, another seed) is dropped. Inputs are read after the build, which can tidy the person.
  for (const k of [...uiState.weekCache.keys()]) if (k !== key && k.startsWith(person.id + '|')) uiState.weekCache.delete(k);
  uiState.weekCache.set(key, { week, pool: weekPool(), inputs: weekInputs(person) });
  return week;
}

// This week's changes made on the Week screen: per-date cooking overrides and a snack count. They live on the person
// under the week's start date and are dropped when the week rolls, so the Cooking step stays the standing answer.
function weekThisWeek(person) {
  const start = uiIsoDate(uiToday());
  if (!person.week_overrides || person.week_overrides.start !== start) person.week_overrides = { start, days: {} };
  person.week_overrides.days = person.week_overrides.days || {};
  return person.week_overrides;
}

// After a day-only change the rest of the week must not move, so the meals on screen are frozen into a snapshot and
// laid back over the rebuilt week. Regenerate (new seed) or a rolled week drops it.
function weekApplySnapshot(week, person) {
  const snap = person.week_snapshot;
  if (!snap || snap.start !== week.days[0].date || snap.seed !== (person.planSeed || 0)) { if (snap) delete person.week_snapshot; return; }
  const byDate = new Map(snap.days.map(d => [d.date, d.meals]));
  for (const day of week.days) {
    const saved = byDate.get(day.date);
    if (!saved) continue;
    const slots = week.slots;
    day.meals = slots.map(slot => {
      const m = saved.find(x => x.slot === slot) || day.meals.find(x => x.slot === slot) || { slot, recipe: null, source: 'none' };
      const recipe = m.recipe ? uiState.recipesById.get(m.recipe) : null;
      if (!recipe) return { slot, recipe: null, source: 'none' };
      const check = checkRecipe(recipe, uiPlanFor(person), uiState.matcher, uiState.foodsById, person);
      return { ...m, servings: day.eaters, servingsMade: Math.max(m.servingsMade || 0, day.eaters), check: { verdict: check.verdict, hits: check.hits.map(h => ({ tag: h.tag, label: h.label, hard: h.hard })), exceeds: check.exceeds.map(e => e.nutrient) } };
    });
  }
}

function weekSaveSnapshot(person, week) {
  person.week_snapshot = { start: week.days[0].date, seed: person.planSeed || 0, days: week.days.map(d => ({ date: d.date, meals: d.meals.map(m => ({ slot: m.slot, recipe: m.recipe, name: m.name, source: m.source, servings: m.servings, servingsMade: m.servingsMade, reasons: m.reasons, score: m.score, swapped: m.swapped, repicked: m.repicked })) })) };
}

function weekApplyOverrides(week, person, plan) {
  const overrides = (person.mealOverrides || {})[uiWeekKey(person)] || {};
  for (const [k, recipeId] of Object.entries(overrides)) {
    const [di, slot] = k.split(':');
    const day = week.days[Number(di)];
    const recipe = uiState.recipesById.get(recipeId);
    if (!day || !recipe) continue;
    const meal = day.meals.find(m => m.slot === slot);
    if (!meal) continue;
    if (recipesIsNever(person, recipe.id)) continue;
    const check = checkRecipe(recipe, plan, uiState.matcher, uiState.foodsById, person);
    // A person may pin a caution recipe by hand (the swap sheet asks them to confirm first). A hard exclusion is never planned.
    if (check.verdict === 'fail') continue;
    Object.assign(meal, { recipe: recipe.id, name: recipe.name, source: recipe.assembly_only ? 'assembly' : 'cook', servings: meal.servings || 1, servingsMade: meal.servings || 1, reasons: [check.verdict === 'pass' ? 'you chose this' : 'you chose this, marked caution'], check: { verdict: check.verdict, hits: check.hits.map(h => ({ tag: h.tag, label: h.label, hard: h.hard })), exceeds: check.exceeds.map(e => e.nutrient) }, swapped: true, chosenCaution: check.verdict !== 'pass' });
  }
  for (const day of week.days) {
    let totals = emptyTotals();
    for (const m of day.meals) {
      const r = m.recipe ? uiState.recipesById.get(m.recipe) : null;
      if (r) totals = addTotals(totals, recipeTotals(r, uiState.foodsById).perServing);
    }
    day.totals = totals;
  }
}

// Pins a recipe into one slot of the current week (a swap or "Put in this week"), then refreshes the grocery list with the reason.
export function weekSetOverride(person, di, slot, recipeId, reason) {
  grocerySyncChanges(person, 'Plan changed');   // make sure a snapshot of the list before this change exists, so the change is logged with its reason
  person.mealOverrides = person.mealOverrides || {};
  const key = uiWeekKey(person);
  person.mealOverrides[key] = person.mealOverrides[key] || {};
  person.mealOverrides[key][`${di}:${slot}`] = recipeId;
  for (const k of Object.keys(person.mealOverrides)) if (k !== key) delete person.mealOverrides[k];   // keep only the current week's overrides
  uiPersist();
  grocerySyncChanges(person, reason);
}

export function renderWeekScreen(root) {
  const person = uiActivePerson();
  const plan = uiPlanFor(person);
  if (!uiState.data.recipes.length) {
    root.innerHTML = `${uiPageHeader('Week')}${uiEmptyState('No recipes are loaded (data/recipes.json is missing or empty), so a week cannot be built.')}`;
    return;
  }
  const week = weekGet(person, plan);
  const budget = !!(person.cooking && person.cooking.budget);
  const household = Math.max(1, Number((person.cooking || {}).household) || 1);
  const unknownOn = !!(person.cooking && person.cooking.include_unknown_nutrition);
  // With a daily limit these recipes are never planned, switch or not (owner question 5): the switch says so.
  const hasLimit = plannerHasLimits(plan);
  const limitNames = weekLimitPhrase(plan.limits);
  // Wikibooks recipes not read yet in the full build (they have no numbers, so the planner would leave them out anyway)
  const later = uiDeferredRecipes();
  const laterOn = later && !(uiState.profile.recipe_collections && uiState.profile.recipe_collections.wikibooks === false);
  const skippedNoNutrition = (week.skippedNoNutrition || 0) + (laterOn ? later.meals_without_nutrition || 0 : 0);
  const wo = weekThisWeek(person);
  const snacks = week.snacks || snackPlan(person, plan, wo.snacks_per_day);
  const snackAuto = snackPlan(person, plan);
  const spiceWord = { none: 'no heat', mild: 'mild only', medium: 'medium', hot: 'bring the heat' }[spicePreference(person)] || '';
  root.innerHTML = `
    ${uiPageHeader(uiState.lite ? 'Your meals this week' : `Week for ${uiEsc(person.name)}`, uiState.lite ? `Starting ${uiFmtDate(week.days[0].date)}. Every meal the app picks clears your rules. Tap a meal to read it, the arrows to swap it, and the heart to see it more often.` : `Starting ${uiFmtDate(week.days[0].date)}. Only recipes that pass every check are planned: ${uiFmtNum(week.eligibleCount)} do${skippedNoNutrition ? `, and ${uiFmtNum(skippedNoNutrition)} more with no nutrition numbers are left out` : ''}. A recipe marked caution goes in only if you swap it in yourself. Cooking for ${household} most days; change a day's eaters, cooking, or minutes on that day, for this week only.`, `<button class="btn small" type="button" id="week-regen">${uiIcon('swap')}${uiState.lite ? 'New week' : 'Regenerate'}</button><a class="btn small" href="#/recipes">${uiIcon('leaf')}Recipes</a>`)}
    <div class="card tight">${uiSwitch('week-budget', 'Save money', 'Prefer recipes that reuse ingredients already on this week\'s grocery list, so you buy fewer things.', budget)}${(skippedNoNutrition || unknownOn) ? uiSwitch('week-unknown', 'Also use recipes that have no nutrition numbers', `${skippedNoNutrition ? uiFmtNum(skippedNoNutrition) + ' community recipes' : 'Some community recipes'} list their ingredients as plain text, so the app has no calories, sodium, or other numbers for them. Off: they stay out of your week, so every planned meal counts toward your daily totals. ${hasLimit ? `Your plan has ${uiEsc(limitNames)}, so they are never planned for you even with this on, because the app cannot count them toward it; you can still pick one by hand.` : 'On: far more variety, but those meals cannot be added to your daily totals or checked against a daily limit.'} Allergens and avoid lists are checked either way.`, unknownOn) : ''}
      <div class="switch" style="cursor:default"><div class="switch-text"><span class="switch-title">Snacks each day</span><span class="hint">${uiEsc(typeof wo.snacks_per_day === 'number' ? `This week only: ${snacks.count}. Your standing setting is ${snackAuto.count} (${snackAuto.why}).${wo.snacks_per_day > snacks.count ? ' The evening snack is left out for reflux.' : ''}` : snackAuto.auto ? `${snackAuto.count} a day (${snackAuto.why}). Change it here for this week only, or on the Cooking step for good.` : `${snackAuto.count} a day, your setting on the Cooking step. Change it here for this week only.`)}${spicePreference(person) !== 'any' ? ` Spice setting: ${uiEsc(spiceWord)}.` : ''}</span></div>
        <label class="visually-hidden" for="week-snacks">Snacks each day this week</label><select id="week-snacks" style="width:auto"><option value="auto" ${typeof wo.snacks_per_day !== 'number' ? 'selected' : ''}>Usual (${snackAuto.count})</option>${[0, 1, 2, 3].map(n => `<option value="${n}" ${wo.snacks_per_day === n ? 'selected' : ''}>${n === 0 ? 'None' : n}</option>`).join('')}</select></div></div>
    ${week.unmet.length ? uiNoticeHTML({ level: 'warn', text: `${week.unmet.length} slot${week.unmet.length === 1 ? '' : 's'} could not be filled: ${week.unmet.map(u => `${uiFmtDate(u.date)} ${u.slot}`).join(', ')}. No recipe fit the plan for that slot.` }) : ''}
    <div class="week-grid">${week.days.map((d, di) => weekDayHTML(d, di, plan, person)).join('')}</div>
    ${uiSection('Week at a glance', weekGlanceHTML(week, plan, person), { id: 'week-glance-h' })}
    <details class="card"><summary>Left out of this week (${week.excluded.length})</summary>
      <p class="small muted">Only recipes that pass every check are planned. A hard exclusion (an allergen or anything marked never) is never scheduled. A caution (a food to avoid, a label to verify, an ingredient the app does not recognize, or a serving over a daily limit) is left out too; you can still open one from Recipes and add it yourself if you have checked it.</p>
      ${week.excluded.length ? `<ul>${week.excluded.map(x => `<li><span class="dot ${x.verdict || 'fail'}" aria-hidden="true"></span><strong>${uiEsc(x.name)}</strong>: ${x.verdict === 'caution' ? 'caution' : 'hard exclusion'}${x.why.length ? (x.verdict === 'caution' ? ', ' : ' on ') + x.why.map(uiEsc).join(', ') : ''}</li>`).join('')}</ul>` : '<p class="muted small">None.</p>'}</details>
  `;
  root.querySelector('#week-regen').addEventListener('click', () => {
    person.planSeed = (person.planSeed || 0) + 1;
    delete person.week_snapshot;
    if (person.mealOverrides) delete person.mealOverrides[uiWeekKey(person)];
    uiPersist(); grocerySyncChanges(person, 'Regenerated week'); uiToast('New week generated.'); uiState.rerender();
  });
  root.querySelector('#week-budget').addEventListener('change', e => {
    person.cooking = person.cooking || {};
    person.cooking.budget = e.target.checked;
    uiPersist(); grocerySyncChanges(person, e.target.checked ? 'Turned on Save money' : 'Turned off Save money'); uiToast(e.target.checked ? 'Save money is on. The planner now favors recipes that share ingredients.' : 'Save money is off.'); uiState.rerender();
  });
  root.querySelector('#week-snacks').addEventListener('change', e => {
    const v = e.target.value === 'auto' ? undefined : Number(e.target.value);
    weekProposeSnackChange(person, plan, week, v, () => { e.target.value = typeof wo.snacks_per_day === 'number' ? String(wo.snacks_per_day) : 'auto'; });
  });
  root.querySelectorAll('[data-cook-toggle]').forEach(b => b.addEventListener('click', () => {
    const di = Number(b.dataset.cookToggle);
    const d = week.days[di];
    weekProposeDayChange(person, plan, week, di, { can_cook: !d.canCook, minutes: d.minutes });
  }));
  root.querySelectorAll('[data-minutes]').forEach(sel => sel.addEventListener('change', () => {
    const di = Number(sel.dataset.minutes);
    const d = week.days[di];
    weekProposeDayChange(person, plan, week, di, { can_cook: d.canCook, minutes: Number(sel.value) }, () => { sel.value = String(d.minutes); });
  }));
  if (root.querySelector('#week-unknown')) root.querySelector('#week-unknown').addEventListener('change', e => {
    person.cooking = person.cooking || {};
    person.cooking.include_unknown_nutrition = e.target.checked;
    if (e.target.checked) uiEnsureAllRecipes();
    uiPersist(); grocerySyncChanges(person, e.target.checked ? 'Allowed recipes without nutrition data' : 'Excluded recipes without nutrition data'); uiToast(e.target.checked ? 'Recipes with no nutrition numbers can now be planned. Those meals will not count toward daily totals.' : 'Only recipes with nutrition numbers are planned.'); uiState.rerender();
  });
  root.querySelectorAll('[data-eaters]').forEach(inp => inp.addEventListener('change', () => {
    const reason = grocerySetEaters(person, inp.dataset.eaters, inp.value, inp.dataset.day);
    if (reason) uiToast(reason + '. The week and grocery list were updated.');
    uiState.rerender();
  }));
  recipesBindTaste(root, person, (kind) => { if (kind === 'never') grocerySyncChanges(person, 'Marked a recipe never again'); uiState.rerender(); });
  root.querySelectorAll('[data-today]').forEach(b => b.addEventListener('click', () => {
    const [di, slot] = b.dataset.today.split(':');
    const day = week.days[Number(di)];
    const meal = day.meals.find(m => m.slot === slot);
    if (!meal || !meal.recipe) return;
    todayAddDiaryEntry(person, { date: day.date, meal: slot, kind: 'recipe', ref: meal.recipe, amount: 1, unit: 'serving' });
    uiToast(`Added ${meal.name} to ${uiFmtDate(day.date)} in Today.`);
  }));
  root.querySelectorAll('[data-recipe]').forEach(b => b.addEventListener('click', () => weekRecipeModal(b.dataset.recipe, person, plan)));
  root.querySelectorAll('[data-swap]').forEach(b => b.addEventListener('click', () => weekSwapModal(Number(b.dataset.swap), b.dataset.slot, person, plan, week)));
  root.querySelectorAll('[data-log]').forEach(b => b.addEventListener('click', () => {
    const [di, slot] = b.dataset.log.split(':');
    const day = week.days[Number(di)];
    const meal = day.meals.find(m => m.slot === slot);
    if (!meal || !meal.recipe) return;
    uiState.profile.log = uiState.profile.log || [];
    uiState.profile.log.push({ date: day.date, person: person.id, meal: slot, recipe: meal.recipe, name: meal.name, symptoms: {}, logged_at: new Date().toISOString() });
    uiPersist(); uiToast(`Logged ${meal.name} for ${slot}.`);
  }));
}

// A day's cooking change, this week only. Works out which meals on that day no longer fit, previews the effect, and asks:
// re-pick just those meals, regenerate the whole week, or keep every meal and only record the setting.
function weekProposeDayChange(person, plan, week, di, patch, revert) {
  const day = week.days[di];
  const name = WEEK_DAY_NAMES[day.day] || uiFmtDate(day.date);
  const next = { canCook: patch.can_cook, minutes: patch.minutes };
  const misfits = day.meals.filter(m => m.recipe && !mealFits(uiState.recipesById.get(m.recipe), m, { ...next, slot: m.slot }).fits);
  const settingWords = `${name}: ${next.canCook ? 'cooking on' : 'no cooking'}, ${next.minutes} minutes`;
  const store = () => { const wo = weekThisWeek(person); wo.days[day.date] = { can_cook: next.canCook, minutes: next.minutes }; };
  if (!misfits.length) {
    store();
    day.canCook = next.canCook; day.minutes = next.minutes; day.overridden = true;
    weekSaveSnapshot(person, week);
    uiPersist(); grocerySyncChanges(person, `${settingWords} (this week)`);
    uiToast(`${settingWords}, this week only. Every meal on ${name} still fits, so nothing moved.`); uiState.rerender();
    return;
  }
  const picked = repickSlots({ week, di, slots: misfits.map(m => m.slot), person, plan, recipes: uiState.recipesForPlan ? uiState.recipesForPlan(plan) : uiState.data.recipes, foodsById: uiState.foodsById, matcher: uiState.matcher, canCook: next.canCook, minutes: next.minutes });
  const before = weekDayTotals(day.meals);
  const afterMeals = day.meals.map(m => picked.meals.find(p => p.slot === m.slot) || m);
  const after = weekDayTotals(afterMeals);
  const lim = plan.limits && plan.limits.sodium_mg ? plan.limits.sodium_mg.value : null;
  const m = uiModal(`
    <p><strong>${uiEsc(settingWords)}</strong>, this week only. Your usual pattern on the Cooking step is not changed.</p>
    <p>${misfits.length === 1 ? 'One meal' : `${misfits.length} meals`} on ${uiEsc(name)} no longer fit${misfits.length === 1 ? 's' : ''}:</p>
    <ul>${misfits.map(x => `<li><strong>${uiEsc(WEEK_SLOT_LABEL[x.slot] || x.slot)}:</strong> ${uiEsc(x.name)}. ${uiEsc(mealFits(uiState.recipesById.get(x.recipe), x, { ...next, slot: x.slot }).why)}.</li>`).join('')}</ul>
    ${day.meals.length > misfits.length ? `<p class="small muted">The other ${day.meals.length - misfits.length} meal${day.meals.length - misfits.length === 1 ? '' : 's'} on ${uiEsc(name)} still fit and would stay. No other day is touched.</p>` : ''}
    <div class="card tight"><p><strong>If you re-pick just these:</strong></p>
      <ul>${picked.meals.map(p => `<li><strong>${uiEsc(WEEK_SLOT_LABEL[p.slot] || p.slot)}:</strong> ${p.recipe ? uiEsc(p.name) : 'nothing fits this slot'}</li>`).join('')}</ul>
      <p class="small">${uiEsc(name)} would be about ${uiFmtNum(after.kcal)} kcal (was ${uiFmtNum(before.kcal)}) and ${uiFmtNum(after.sodium_mg)} mg sodium (was ${uiFmtNum(before.sodium_mg)})${lim ? `; the sodium limit is ${uiFmtNum(lim)} mg` : ''}.</p></div>
    <div class="btn-row" style="margin-top:12px">
      <button class="btn primary" type="button" id="wd-repick">Re-pick just this day</button>
      <button class="btn" type="button" id="wd-regen">Regenerate the whole week</button>
      <button class="btn" type="button" id="wd-keep">Keep everything as is</button>
    </div>
    <p class="small muted" style="margin-top:8px">Keep everything: only the setting changes; the meals that do not fit stay and are marked. Regenerate: the whole week is rebuilt around the new day; your swaps are kept.</p>`, { title: `Change ${name}`, onClose: () => { if (!acted && revert) revert(); } });
  if (!m) return;
  let acted = false;
  m.el.querySelector('#wd-repick').addEventListener('click', () => {
    acted = true; store();
    day.canCook = next.canCook; day.minutes = next.minutes; day.overridden = true;
    day.meals = afterMeals;
    weekSaveSnapshot(person, week);
    uiPersist(); grocerySyncChanges(person, `${settingWords}: re-picked ${misfits.map(x => WEEK_SLOT_LABEL[x.slot] || x.slot).join(', ')}`);
    m.close(); uiToast(`${name} updated. ${picked.meals.filter(p => p.recipe).length} meal${picked.meals.filter(p => p.recipe).length === 1 ? '' : 's'} re-picked; nothing else moved.`); uiState.rerender();
  });
  m.el.querySelector('#wd-regen').addEventListener('click', () => {
    acted = true; store();
    delete person.week_snapshot;
    uiPersist(); grocerySyncChanges(person, `${settingWords}: regenerated the week`);
    m.close(); uiToast(`Week regenerated around ${name}. Your swaps were kept.`); uiState.rerender();
  });
  m.el.querySelector('#wd-keep').addEventListener('click', () => {
    acted = true; store();
    day.canCook = next.canCook; day.minutes = next.minutes; day.overridden = true;
    weekSaveSnapshot(person, week);
    uiPersist(); grocerySyncChanges(person, `${settingWords} (meals kept)`);
    m.close(); uiToast(`${settingWords}. Meals kept as they were.`); uiState.rerender();
  });
}

// Snack count for this week only. Adding slots fills them day by day without touching other meals; removing slots drops those meals.
function weekProposeSnackChange(person, plan, week, count, revert) {
  const wo = weekThisWeek(person);
  const current = week.slots;
  const nextSlots = daySlots(person, plan, count);
  const added = nextSlots.filter(s => !current.includes(s));
  const removed = current.filter(s => !nextSlots.includes(s));
  const label = s => WEEK_SLOT_LABEL[s] || s;
  if (!added.length && !removed.length) { wo.snacks_per_day = count; uiPersist(); uiToast('Snacks unchanged for this week.'); uiState.rerender(); return; }
  const m = uiModal(`
    <p><strong>Snacks this week only.</strong> Your standing setting on the Cooking step is not changed.</p>
    ${added.length ? `<p>Adds ${added.map(label).map(uiEsc).join(' and ')} to every day (${added.length * 7} new snack${added.length * 7 === 1 ? '' : 's'}).</p>` : ''}
    ${removed.length ? `<p>Removes ${removed.map(label).map(uiEsc).join(' and ')} from every day (${removed.length * 7} snack${removed.length * 7 === 1 ? '' : 's'} dropped).</p>` : ''}
    <div class="btn-row" style="margin-top:12px">
      <button class="btn primary" type="button" id="ws-only">${added.length && !removed.length ? 'Add the snacks, keep everything else' : removed.length && !added.length ? 'Remove them, keep everything else' : 'Change the snacks, keep everything else'}</button>
      <button class="btn" type="button" id="ws-regen">Regenerate the whole week</button>
      <button class="btn" type="button" id="ws-cancel">Cancel</button>
    </div>`, { title: 'Snacks this week', onClose: () => { if (!acted && revert) revert(); } });
  if (!m) return;
  let acted = false;
  m.el.querySelector('#ws-only').addEventListener('click', () => {
    acted = true; wo.snacks_per_day = count;
    for (let di = 0; di < week.days.length; di++) {
      const day = week.days[di];
      const picked = added.length ? repickSlots({ week, di, slots: added, person, plan, recipes: uiState.recipesForPlan ? uiState.recipesForPlan(plan) : uiState.data.recipes, foodsById: uiState.foodsById, matcher: uiState.matcher }).meals : [];
      const kept = day.meals.filter(x => !removed.includes(x.slot));
      day.meals = nextSlots.map(s => kept.find(x => x.slot === s) || picked.find(x => x.slot === s) || { slot: s, recipe: null, source: 'none' });
    }
    week.slots = nextSlots;
    weekSaveSnapshot(person, week);
    uiPersist(); grocerySyncChanges(person, `Snacks this week: ${count === undefined ? 'usual' : count}`);
    m.close(); uiToast('Snacks updated for this week. Other meals did not move.'); uiState.rerender();
  });
  m.el.querySelector('#ws-regen').addEventListener('click', () => {
    acted = true; wo.snacks_per_day = count; delete person.week_snapshot;
    uiPersist(); grocerySyncChanges(person, `Snacks this week: ${count === undefined ? 'usual' : count}, regenerated`);
    m.close(); uiToast('Week regenerated with the new snacks. Your swaps were kept.'); uiState.rerender();
  });
  m.el.querySelector('#ws-cancel').addEventListener('click', () => { m.close(); });
}

// "Does not fit this day's time" note for a meal kept after a day change.
function weekMisfitNote(m, d) {
  if (!m.recipe || !d.overridden) return '';
  const f = mealFits(uiState.recipesById.get(m.recipe), m, { canCook: d.canCook, minutes: d.minutes, slot: m.slot });
  return f.fits ? '' : `<div class="meal-note">Kept by you, but it ${uiEsc(f.why)}.</div>`;
}

// kcal and sodium for a list of meals, one serving each.
function weekDayTotals(meals) {
  let t = emptyTotals();
  for (const m of meals) { const r = m.recipe ? uiState.recipesById.get(m.recipe) : null; if (r) t = addTotals(t, recipeTotals(r, uiState.foodsById).perServing); }
  return t;
}

// " · medium heat" for a meal with any heat, so a spice-sensitive eater sees it at a glance.
function weekHeatWord(recipeId) {
  const r = recipeId ? uiState.recipesById.get(recipeId) : null;
  if (!r) return '';
  const h = recipeHeat(r);
  return h.level ? ` · ${h.label.toLowerCase()}` : '';
}

// "Sodium (mg)" -> "Sodium mg"; whole numbers for milligram nutrients. weekShortLabel is no longer used by the day
// totals (UX pass, October 2026: weekTotalChipsHTML below says limit or goal in words); kept, not deleted.
function weekShortLabel(n) { return uiNutrientLabel(n).replace(/\s*\((.*)\)\s*$/, ' $1').replace('% of calories', '%'); }
function weekDigits(n) { return /_mg$|^kcal$/.test(n) ? 0 : 1; }
// A day's total in words a person reads at a glance (UX pass, October 2026): "Sodium 1,248 mg, within the 2,300 limit",
// "Potassium 3,378 mg, below the 3,500 goal", "Protein 99.9 g, goal met". It was "Sodium mg 1,248, ok" and
// "Protein g 99.9, over 81.6", which did not say whether the number was a limit or a goal.
// "a daily sodium limit", "daily sodium and potassium limits" (UX pass, October 2026; it read "a daily limit (sodium (mg))").
export function weekLimitPhrase(limits) {
  const list = Object.keys(limits || {}).map(k => uiNutrientLabel(k).replace(/\s*\(.*\)\s*$/, '').toLowerCase());
  if (!list.length) return '';
  return list.length > 1 ? `daily ${list.slice(0, -1).join(', ')} and ${list[list.length - 1]} limits` : `a daily ${list[0]} limit`;
}
export function weekTotalChipsHTML(cmp) {
  // A share of calories keeps its % sign on the limit too: "within the 10% limit", not "within the 10 limit".
  const num = (x, v) => uiFmtNum(v, weekDigits(x.nutrient)) + (/_pct_kcal$/.test(x.nutrient) ? '%' : '');
  return [
    ...cmp.over.map(x => `<span class="nutrient-chip over">${uiEsc(weekChipAmount(x))}, over the ${num(x, x.limit)} limit</span>`),
    ...cmp.under.map(x => `<span class="nutrient-chip under">${uiEsc(weekChipAmount(x))}, below the ${num(x, x.min)} goal</span>`),
    ...cmp.ok.map(x => `<span class="nutrient-chip ok">${uiEsc(weekChipAmount(x))}, ${x.limit != null ? `within the ${num(x, x.limit)} limit` : 'goal met'}</span>`)
  ].join('');
}
export function weekChipAmount(x) {
  const label = uiNutrientLabel(x.nutrient), m = label.match(/^(.*?)\s*\((.*)\)\s*$/);
  const name = m ? m[1] : label, unit = m ? m[2] : '';
  return unit === '% of calories' ? `${name} ${uiFmtNum(x.value, weekDigits(x.nutrient))}% of calories` : `${name} ${uiFmtNum(x.value, weekDigits(x.nutrient))}${unit ? ' ' + unit : ''}`;
}

// The small line under a planned meal (UX pass, October 2026). Every meal the app plans passes the person's checks,
// so "PASS" on every one said nothing and crowded the line; the word now shows only when it is not a pass (a caution
// the person picked by hand). The colored dot and the button's spoken label still say the verdict for every meal.
export function weekMealSubText(m) {
  const parts = [];
  if (m.check.verdict !== 'pass') parts.push(uiVerdictWord(m.check.verdict));
  if (m.servingsMade && m.servingsMade > m.servings) parts.push(`make ${m.servingsMade}`);
  if (m.chosenCaution) parts.push('your pick'); else if (m.swapped) parts.push('swapped');
  if (m.repicked) parts.push('re-picked');
  const heat = weekHeatWord(m.recipe).replace(/^ · /, '');
  if (heat) parts.push(heat);
  return parts.join(' · ');
}

// Source glyph for a meal: cook (flame), leftovers (clock), assembly (bowl).
function weekSourceGlyph(source) {
  if (source === 'leftover') return uiIcon('clock', { cls: 'src', label: 'Leftovers' });
  if (source === 'assembly') return uiIcon('bowl', { cls: 'src', label: 'Assembly, no cooking' });
  return uiIcon('flame', { cls: 'src', label: 'Cook' });
}

function weekDayHTML(d, di, plan, person) {
  const cmp = compareToPlan(d.totals, plan);
  const isToday = d.date === uiIsoDate(uiToday());
  const [, mo, da] = d.date.split('-');
  return `<section class="week-day ${isToday ? 'today' : ''}" aria-labelledby="day-${di}">
    <div class="week-day-head">
      <div class="week-day-name"><span id="day-${di}">${WEEK_DAY_NAMES[d.day] || uiFmtDate(d.date)}</span><span class="week-day-date">${Number(mo)}/${Number(da)}${isToday ? ' · today' : ''}</span></div>
      <div class="week-day-meta" ${uiState.lite ? 'hidden' : ''}>${uiChip(d.canCook ? 'can cook' : 'no cooking', d.canCook ? 'pass' : 'neutral', { button: true, attrs: `data-cook-toggle="${di}" aria-pressed="${d.canCook}" title="Tap to switch cooking ${d.canCook ? 'off' : 'on'} for this ${WEEK_DAY_NAMES[d.day]} only"` })}
        <label class="week-minutes"><span class="visually-hidden">Minutes to cook on ${WEEK_DAY_NAMES[d.day]}</span><select data-minutes="${di}" title="Minutes you have to cook this ${WEEK_DAY_NAMES[d.day]} (this week only)">${(WEEK_MINUTE_OPTIONS.includes(d.minutes) ? WEEK_MINUTE_OPTIONS : WEEK_MINUTE_OPTIONS.concat(d.minutes).sort((a, b) => a - b)).map(m => `<option value="${m}" ${m === d.minutes ? 'selected' : ''}>${m} min</option>`).join('')}</select></label>${d.overridden ? `<span class="muted" title="Changed for this week only">this week</span>` : ''}
        <label class="week-eaters">${uiIcon('people')}<input type="number" inputmode="numeric" min="1" max="20" value="${d.eaters}" data-eaters="${uiEsc(d.date)}" data-day="${uiEsc(d.day)}" aria-label="Eaters on ${uiEsc(uiFmtDate(d.date))}"></label></div>
    </div>
    ${d.meals.map(m => {
      return `<div class="week-meal">
      <div class="slot">${WEEK_SLOT_LABEL[m.slot] || m.slot}</div>
      ${m.recipe ? `<button type="button" class="meal-chip" data-recipe="${uiEsc(m.recipe)}" aria-label="${uiEsc(m.name)}, ${uiVerdictWord(m.check.verdict)}. Open recipe."><span class="dot ${m.check.verdict}" aria-hidden="true"></span><span class="meal-chip-text"><span class="meal-chip-name">${uiEsc(m.name)}</span><span class="meal-chip-sub">${weekSourceGlyph(m.source)}<span>${weekMealSubText(m)}</span></span></span></button>
        ${m.check.hits && m.check.hits.length ? `<div class="meal-note">Caution: ${m.check.hits.map(h => uiEsc(h.label)).join(', ')}</div>` : ''}
        ${weekMisfitNote(m, d)}
        ${m.check.exceeds && m.check.exceeds.length ? `<div class="meal-note">One serving exceeds the daily ${m.check.exceeds.map(uiNutrientLabel).map(uiEsc).join(', ')}.</div>` : ''}
        <div class="meal-acts">
          <button class="btn small icon" type="button" data-swap="${di}" data-slot="${uiEsc(m.slot)}" aria-label="Swap ${WEEK_SLOT_LABEL[m.slot] || m.slot} on ${uiEsc(uiFmtDate(d.date))}" title="Swap">${uiIcon('swap')}</button>
          <button class="btn small icon" type="button" data-log="${di}:${uiEsc(m.slot)}" aria-label="Log ${uiEsc(m.name)} in the symptom log" title="Log this meal">${uiIcon('note')}</button>
          <button class="btn small icon" type="button" data-today="${di}:${uiEsc(m.slot)}" aria-label="Add ${uiEsc(m.name)} to Today" title="Add to Today">${uiIcon('plus')}</button>
          ${recipesTasteHTML(person, m.recipe)}
        </div>
        ${m.reasons && m.reasons.length || m.source === 'leftover' ? `<details><summary>Why this</summary><ul class="small">${m.source === 'leftover' ? '<li>Leftovers from a meal made earlier this week.</li>' : ''}${(m.reasons || []).map(r => `<li>${uiEsc(r)}</li>`).join('')}${m.reasons && !m.reasons.length && m.source !== 'leftover' ? '<li>Fits the plan, your time, skill, and equipment with no penalties.</li>' : ''}${m.score != null ? `<li class="muted">Score ${m.score}</li>` : ''}</ul></details>` : ''}`
      : `<div class="muted small">No recipe fit this slot.</div><div class="meal-acts"><button class="btn small icon" type="button" data-swap="${di}" data-slot="${uiEsc(m.slot)}" aria-label="Pick a meal for ${WEEK_SLOT_LABEL[m.slot] || m.slot}" title="Pick a meal">${uiIcon('swap')}</button></div>`}
    </div>`; }).join('')}
    <div class="week-totals" aria-label="Day totals versus plan">
      ${weekTotalChipsHTML(cmp)}
      ${!cmp.over.length && !cmp.under.length && !cmp.ok.length ? `<span class="muted">${uiFmtNum(d.totals.kcal)} kcal, ${uiFmtNum(d.totals.sodium_mg)} mg sodium. No numeric limits in the plan.</span>` : ''}
    </div>
  </section>`;
}

// One small bar per day: planned kcal against the calorie target when one exists, otherwise sodium against its limit.
function weekGlanceHTML(week, plan, person) {
  const info = todayTargetInfo(person, plan);
  const useKcal = info.state === 'ok' && info.kcal > 0;
  const limit = useKcal ? info.kcal : plan.limits.sodium_mg ? plan.limits.sodium_mg.value : null;
  const key = useKcal ? 'kcal' : 'sodium_mg';
  const label = useKcal ? 'calories' : 'mg sodium';
  const max = Math.max(limit || 0, ...week.days.map(d => d.totals[key] || 0)) || 1;
  return `<div class="week-glance" role="img" aria-label="Planned ${label} per day${limit ? ` against ${uiFmtNum(limit)}` : ''}">
    ${week.days.map(d => {
      const v = d.totals[key] || 0;
      const t = limit ? uiMeterTone(v, limit, useKcal ? 'kcal' : 'limit') : { tone: 'neutral', word: '' };
      return `<div class="glance-day"><div class="glance-col ${t.tone}" title="${uiEsc(uiFmtDate(d.date))}: ${uiFmtNum(v)} ${label}${limit ? `, ${t.word}` : ''}">${limit ? `<span class="glance-limit" style="bottom:${(limit / max * 100).toFixed(1)}%"></span>` : ''}<span style="height:${(v / max * 100).toFixed(1)}%"></span></div><div class="glance-label">${WEEK_DAY_SHORT[d.day] || ''}</div><div class="glance-value">${uiFmtNum(v)}</div></div>`;
    }).join('')}
  </div>
  <p class="small muted">Planned ${label} per day from the recipes above${limit ? `; the dashed line is ${useKcal ? 'the estimated calorie target' : 'the sodium limit'} of ${uiFmtNum(limit)}` : '; no calorie target or sodium limit is active'}.${limit && !useKcal ? ' A day over the line also says so in its totals.' : ''}</p>`;
}

function weekSwapModal(di, slot, person, plan, week) {
  const day = week.days[di];
  const current = day.meals.find(m => m.slot === slot);
  const cooking = person.cooking || {};
  const dayIdx = new Date(day.date + 'T00:00:00').getDay();
  const others = emptyTotals();
  let dayTotals = others;
  for (const m of day.meals) {
    if (m.slot === slot || !m.recipe) continue;
    const r = uiState.recipesById.get(m.recipe);
    if (r) dayTotals = addTotals(dayTotals, recipeTotals(r, uiState.foodsById).perServing);
  }
  const recentIds = week.days.flatMap(d => d.meals.filter(m => m.recipe && !(d === day && m.slot === slot)).map(m => m.recipe));
  const candidates = (uiState.recipesForPlan ? uiState.recipesForPlan(plan) : uiState.data.recipes).filter(r => recipeMeal(r, slot) && r.id !== (current && current.recipe));
  const favorites = (person.favorites && person.favorites.recipes) || [];
  const disliked = (person.disliked && person.disliked.recipes) || [];
  const checked = candidates.map(r => ({ r, check: checkRecipe(r, plan, uiState.matcher, uiState.foodsById, person) }));
  const scored = checked.map(({ r, check }) => {
    const s = scoreRecipe({ recipe: r, check, cooking, dayIdx, canCook: day.canCook, recentIds, dayTotals, plan, foodsById: uiState.foodsById, favorites, disliked, person, slot });
    return { r, check, score: s.score, reasons: s.reasons };
  }).filter(x => x.score > -Infinity).sort((a, b) => b.score - a.score).slice(0, 5);
  // Caution recipes are never planned, but a person can pick one by hand after confirming. Ranked the same way; hard exclusions never appear.
  const cautions = checked.filter(({ check }) => check.verdict === 'caution').map(({ r, check }) => {
    const s = scoreRecipe({ recipe: r, check, cooking, dayIdx, canCook: day.canCook, recentIds, dayTotals, plan, foodsById: uiState.foodsById, favorites, disliked, person, slot, allowCaution: true });
    return { r, check, score: s.score, why: cautionWhy(check) };
  }).filter(x => x.score > -Infinity).sort((a, b) => b.score - a.score).slice(0, 5);
  const m = uiModal(`
    <p class="small muted">Top alternatives for ${WEEK_SLOT_LABEL[slot] || slot} on ${uiFmtDate(day.date)}, scored the same way the planner scores them. Only recipes that pass every check are listed.</p>
    ${scored.length ? `<div class="list">${scored.map(x => `<div class="list-row"><div class="list-main">
      <div class="list-title"><span class="dot ${x.check.verdict}" aria-hidden="true"></span>${uiEsc(x.r.name)} ${uiVerdictChip(x.check.verdict)}</div>
      <div class="list-sub">${x.r.active_min} min active, ${x.r.total_min} total, ${uiEsc(x.r.skill)}${x.r.assembly_only ? ', assembly only' : ''} · score ${Math.round(x.score)}</div>
      ${x.reasons.length ? `<ul class="small">${x.reasons.map(r => `<li>${uiEsc(r)}</li>`).join('')}</ul>` : ''}
      <div class="btn-row" style="margin-top:8px"><button class="btn small primary" type="button" data-pick="${uiEsc(x.r.id)}">Use this</button><button class="btn small" type="button" data-detail="${uiEsc(x.r.id)}">Details</button>${recipesTasteHTML(person, x.r.id)}</div>
    </div></div>`).join('')}</div>` : uiEmptyState('No alternative fits this slot.')}
    ${cautions.length ? `<details class="week-cautions" style="margin-top:12px"><summary>Marked caution (${cautions.length})</summary>
    <p class="small muted">Not planned by the app. You can still pick one; it will ask you first.</p>
    <div class="list">${cautions.map(x => `<div class="list-row"><div class="list-main">
      <div class="list-title"><span class="dot caution" aria-hidden="true"></span>${uiEsc(x.r.name)} ${uiVerdictChip('caution')}</div>
      <div class="list-sub">${uiEsc(x.why.split('; ').slice(0, 2).join('; '))}</div>
      <div class="list-sub">${x.r.active_min} min active, ${x.r.total_min} total, ${uiEsc(x.r.skill)}${x.r.assembly_only ? ', assembly only' : ''}</div>
      <div class="btn-row" style="margin-top:8px"><button class="btn small" type="button" data-pick-caution="${uiEsc(x.r.id)}">Use anyway</button><button class="btn small" type="button" data-detail="${uiEsc(x.r.id)}">Details</button></div>
    </div></div>`).join('')}</div></details>` : ''}`, { title: 'Swap meal' });
  if (!m) return;
  m.el.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
    weekSetOverride(person, di, slot, b.dataset.pick, `Swapped ${WEEK_DAY_NAMES[day.day] || uiFmtDate(day.date)} ${slot}`);
    m.close(); uiToast('Meal swapped.'); uiState.rerender();
  }));
  m.el.querySelectorAll('[data-pick-caution]').forEach(b => b.addEventListener('click', async () => {
    const r = uiState.recipesById.get(b.dataset.pickCaution);
    const yes = await uiConfirmSheet({ title: 'Marked caution', text: `${r ? r.name : 'This recipe'} is marked caution for you. Put it in your week anyway?`, confirm: 'Yes, use it', cancel: 'No' });
    if (!yes) return;
    weekSetOverride(person, di, slot, b.dataset.pickCaution, `Swapped ${WEEK_DAY_NAMES[day.day] || uiFmtDate(day.date)} ${slot} (marked caution, your pick)`);
    m.close(); uiToast('Meal swapped. It is marked caution.'); uiState.rerender();
  }));
  m.el.querySelectorAll('[data-detail]').forEach(b => b.addEventListener('click', () => weekRecipeModal(b.dataset.detail, person, plan)));
  recipesBindTaste(m.el, person, (kind, id, on) => {
    if (kind === 'never' && on) { const row = m.el.querySelector(`[data-never="${CSS.escape(id)}"]`); const li = row && row.closest('.list-row'); if (li) li.remove(); }
  });
}

// The recipe detail sheet lives in recipes.js; Week, Pantry, and Together open it through this name.
export function weekRecipeModal(recipeId, person, plan, opts) {
  return recipesDetailModal(recipeId, person, plan, opts);
}
