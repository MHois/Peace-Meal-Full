// Today: a daily diary. Calorie target (an estimate, labeled as such), meals with computed nutrients, favorites,
// weight log with a chart, and an exercise log. Everything is summed from foods.json by grams; nothing is guessed.
import { energyTarget, ACTIVITIES, ACTIVITY_LEVELS, activityCalories, kgToLb, lbToKg } from '../engine/energy.js';
import { nutrientsForGrams, recipeTotals, scaleTotals, addTotals, emptyTotals, compareToPlan, round, NUTRIENT_KEYS } from '../engine/nutrition.js';
import { checkRecipe, checkFood } from '../engine/checker.js';
import { unintendedWeightLoss, reportDays } from '../engine/report.js';
import { cautionWhy } from '../engine/planner.js';
import { portionCheckPieces, familyLabel } from '../engine/dietlists.js';
import { searchGroupMatches } from '../engine/search.js';
import { uiState, uiEsc, uiActivePerson, uiPlanFor, uiPersist, uiToast, uiModal, uiIsoDate, uiToday, uiFmtDate, uiFmtNum, uiNutrientLabel, uiVerdictWord, uiVerdictChip, uiSegmented, uiPageHeader, uiSection, uiChip, uiIcon, uiRing, uiMeter, uiStatTile, uiNoticeHTML, uiEmptyState, uiSwitch, uiEnsureAllRecipes } from './common.js';
import { weekGet } from './week.js';
import { householdWeekGet } from './household.js';
import { recipesTasteHTML, recipesBindTaste, recipesIsNever } from './recipes.js';
import { LOG_SYMPTOMS } from './log.js';

const TODAY_MEALS = [{ id: 'breakfast', label: 'Breakfast' }, { id: 'lunch', label: 'Lunch' }, { id: 'dinner', label: 'Dinner' }, { id: 'snacks', label: 'Snacks' }];
const TODAY_TRACKED = ['protein_g', 'carb_g', 'fiber_g', 'sodium_mg', 'satfat_g'];
let todayUi = { date: null, personId: null };

export function todayShiftDate(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return uiIsoDate(new Date(y, m - 1, d + n));
}
function todayNewId(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function todayEnsure(person) {
  const p = uiState.profile;
  for (const k of ['diary', 'weights', 'exercise']) if (!Array.isArray(p[k])) p[k] = [];
  if (!person.favorites) person.favorites = { recipes: [], foods: [] };
  person.favorites.recipes = person.favorites.recipes || [];
  person.favorites.foods = person.favorites.foods || [];
  if (!person.goals) person.goals = { calorie_target: 'off', deficit: 500 };
}

function todayPlain(t) { const o = {}; for (const k of NUTRIENT_KEYS) o[k] = round(t[k] || 0, 2); return o; }

// Nutrients for one diary entry, computed from foods.json by grams at save time.
export function todayNutrientsFor(entry) {
  if (entry.kind === 'recipe') {
    const r = uiState.recipesById.get(entry.ref);
    if (!r) return todayPlain(emptyTotals());
    return todayPlain(scaleTotals(recipeTotals(r, uiState.foodsById).perServing, Number(entry.amount) || 0));
  }
  if (entry.kind === 'food') {
    const f = uiState.foodsById.get(entry.ref);
    if (!f) return todayPlain(emptyTotals());
    return todayPlain(nutrientsForGrams(f, Number(entry.grams) || 0));
  }
  const t = emptyTotals();
  for (const k of NUTRIENT_KEYS) if (entry.nutrients && entry.nutrients[k] != null) t[k] = Number(entry.nutrients[k]) || 0;
  return todayPlain(t);
}

export function todayEntryName(entry) {
  if (entry.kind === 'recipe') { const r = uiState.recipesById.get(entry.ref); return r ? r.name : entry.ref; }
  if (entry.kind === 'food') { const f = uiState.foodsById.get(entry.ref); return f ? (f.short || f.name) : entry.ref; }
  return entry.name || 'Custom entry';
}
// The pieces one meal's entries put on the plate: a recipe's ingredients, a food's names, a typed entry's words.
function todayMealPieces(list) {
  const pieces = [];
  for (const e of list) {
    if (e.kind === 'recipe') {
      const r = uiState.recipesById.get(e.ref);
      for (const ing of (r && r.ingredients) || []) {
        const f = ing.food ? uiState.foodsById.get(ing.food) : null;
        pieces.push({ label: ing.display || (f ? f.short || f.name : '') || '', texts: [ing.display, f ? f.short : null, f ? f.name : null].filter(Boolean) });
      }
    } else if (e.kind === 'food') {
      const f = uiState.foodsById.get(e.ref);
      if (f) pieces.push({ label: f.short || f.name, texts: [f.short, f.name].filter(Boolean) });
    } else if (e.name) pieces.push({ label: e.name, texts: [e.name] });
  }
  return pieces;
}

// A caution under a meal when two or more foods the person's list marks "small serve" were logged for it, whether in
// one recipe or separately (owner question 7). Nothing when the plan restricts no list with a stacking caution.
export function todayMealStackingHTML(plan, list) {
  const lists = uiState.matcher && uiState.matcher.dietLists;
  if (!lists || list.length < 2) return '';
  const { stacked } = portionCheckPieces(todayMealPieces(list), plan, lists);
  return stacked.map(s => `<p class="small meal-stack" role="note">${uiChip('caution', 'caution')} <strong>Small serves add up in this meal:</strong> ${uiEsc(s.terms.join(', '))}. ${uiEsc(s.text)} (${uiEsc(familyLabel(lists, s.family))})</p>`).join('');
}

function todayAmountText(entry) {
  if (entry.kind === 'recipe') return `${uiFmtNum(entry.amount, 2)} serving${Number(entry.amount) === 1 ? '' : 's'}`;
  if (entry.kind === 'food') return entry.unit && entry.unit !== 'g' ? `${uiFmtNum(entry.amount, 2)} x ${entry.unit} (${uiFmtNum(entry.grams)} g)` : `${uiFmtNum(entry.grams)} g`;
  return 'as entered';
}

// Adds a diary entry for a person and persists it. Used here and by the Week screen's "Add to Today".
export function todayAddDiaryEntry(person, { date, meal, kind, ref, amount = 1, unit = 'serving', grams = null, note = '', name = '', nutrients = null }) {
  todayEnsure(person);
  const entry = { id: todayNewId('d'), date, person: person.id, meal: /^snack/.test(String(meal)) || meal === 'component' ? 'snacks' : meal, kind, ref, amount, unit, grams, note, name };
  // A plain write-in (name only, nutrients === null) keeps nutrients null: the report's averages skip it rather than count zeros.
  if (kind === 'custom' && nutrients === null) { entry.nutrients = null; entry.no_numbers = true; }
  else { if (kind === 'custom') entry.nutrients = nutrients || {}; entry.nutrients = todayNutrientsFor(entry); }
  uiState.profile.diary.push(entry);
  uiPersist();
  return entry;
}

export function todayIsFavorite(person, kind, id) {
  const f = person.favorites || {};
  return ((kind === 'recipe' ? f.recipes : f.foods) || []).includes(id);
}
export function todayToggleFavorite(person, kind, id) {
  todayEnsure(person);
  const list = kind === 'recipe' ? person.favorites.recipes : person.favorites.foods;
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1); else list.push(id);
  uiPersist();
  return i < 0;
}

function todayEntries(person, date) { return (uiState.profile.diary || []).filter(e => e.person === person.id && e.date === date); }
function todaySum(entries) { let t = emptyTotals(); for (const e of entries) { const x = emptyTotals(); for (const k of NUTRIENT_KEYS) x[k] = (e.nutrients && e.nutrients[k]) || 0; t = addTotals(t, x); } return t; }
// Unintended weight loss, GLIM screen (more than 5% in 6 months, more than 10% over longer). Off when losing weight is the goal.
export function todayWeightLossNoticeHTML(person, dateIso) {
  const intended = !!(person.goals && person.goals.calorie_target === 'loss');
  const w = unintendedWeightLoss(uiState.profile.weights, person.id, dateIso, { intended });
  if (!w) return '';
  return uiNoticeHTML({ level: 'warn', text: `Weight is down ${w.pct}% since ${uiFmtDate(w.fromDate)} (${w.weeks} weeks): ${kgToLb(w.fromKg)} lb to ${kgToLb(w.toKg)} lb. For an adult who is not trying to lose weight, more than ${w.threshold}% over this span is the level doctors use to screen for undernutrition. Tell your doctor, and say whether appetite has changed.` });
}
export function todayLatestWeightKg(person) {
  const ws = (uiState.profile.weights || []).filter(w => w.person === person.id).sort((a, b) => b.date.localeCompare(a.date));
  return ws.length ? ws[0].kg : person.weight_kg;
}

// What the target is, or why there is none.
export function todayTargetInfo(person, plan) {
  const g = person.goals || { calorie_target: 'off' };
  if (plan && plan.isDisabled('calorie-targets')) {
    const by = (plan.disabledFeatures || []).find(f => f.feature === 'calorie-targets');
    return { state: 'disabled', by: by && by.by ? (Array.isArray(by.by) ? by.by.join(', ') : String(by.by)) : 'a rule in your plan' };
  }
  if (g.calorie_target === 'off') return { state: 'off' };
  if (g.calorie_target === 'manual') return { state: 'ok', kcal: Number(person.manual_kcal) || 0, notes: ['You entered this number yourself.'], manual: true };
  const missing = [];
  if (!person.sex) missing.push('sex');
  if (!(Number(person.age) > 0)) missing.push('age');
  if (!(Number(person.weight_kg) > 0)) missing.push('weight');
  if (!(Number(person.height_cm) > 0)) missing.push('height');
  if (missing.length) return { state: 'missing', missing };
  const t = energyTarget({ ...person, weight_kg: todayLatestWeightKg(person) || person.weight_kg }, { goal: g.calorie_target, deficit: g.deficit, surplus: g.surplus });
  if (t.kcal == null) return { state: 'missing', missing: ['sex', 'age', 'weight', 'height'] };
  return { state: 'ok', kcal: t.kcal, notes: t.notes, tdee: t.tdee, ree: t.ree };
}

export function renderTodayScreen(root) {
  const person = uiActivePerson();
  const plan = uiPlanFor(person);
  todayEnsure(person);
  const today = uiIsoDate(uiToday());
  if (!todayUi.date || todayUi.personId !== person.id) todayUi = { date: today, personId: person.id };
  const date = todayUi.date;
  const entries = todayEntries(person, date);
  const totals = todaySum(entries);
  const exercise = (uiState.profile.exercise || []).filter(e => e.person === person.id && e.date === date);
  const exerciseKcal = exercise.reduce((s, e) => s + (Number(e.kcal) || 0), 0);

  root.innerHTML = `
    ${uiPageHeader('Today', `${uiFmtDate(date)}${date === today ? ' (today)' : ''} for ${uiEsc(person.name)}. Summed from USDA values by grams for what you logged.`)}
    <div class="today-datebar">
      <button class="btn small icon" type="button" id="today-prev" aria-label="Previous day">${uiIcon('arrow-left')}</button>
      <input type="date" id="today-date" value="${uiEsc(date)}" aria-label="Date">
      <button class="btn small icon" type="button" id="today-next" aria-label="Next day">${uiIcon('arrow-right')}</button>
    </div>
    ${todayWeightLossNoticeHTML(person, today)}
    ${todayTargetCardHTML(person, plan, totals, exerciseKcal)}
    ${todayMealsHTML(person, plan, entries)}
    ${todayWeightHTML(person)}
    ${todayExerciseHTML(person, exercise, exerciseKcal)}
  `;
  todayBind(root, person, plan, date, entries);
}

function todayTargetCardHTML(person, plan, totals, exerciseKcal) {
  const info = todayTargetInfo(person, plan);
  const cmp = compareToPlan(totals, plan);
  const meters = TODAY_TRACKED.map(n => {
    const over = cmp.over.find(x => x.nutrient === n), under = cmp.under.find(x => x.nutrient === n), ok = cmp.ok.find(x => x.nutrient === n);
    const full = uiNutrientLabel(n);
    const m = /^(.*?)\s*\((.*)\)\s*$/.exec(full);
    const name = m ? m[1] : full, unit = m ? m[2] : '';
    const digits = n === 'sodium_mg' ? 0 : 1;
    if (over) return uiMeter({ label: uiEsc(name), value: totals[n], max: over.limit, kind: 'limit', unit, digits, labelExtra: plan.limits[n] && plan.limits[n].clinician ? uiChip('doctor or dietitian', 'plum') : '' });
    if (under) return uiMeter({ label: uiEsc(name), value: totals[n], max: under.min, kind: 'target', unit, digits });
    if (ok && ok.limit != null) return uiMeter({ label: uiEsc(name), value: totals[n], max: ok.limit, kind: 'limit', unit, digits, labelExtra: plan.limits[n] && plan.limits[n].clinician ? uiChip('doctor or dietitian', 'plum') : '' });
    if (ok && ok.min != null) return uiMeter({ label: uiEsc(name), value: totals[n], max: ok.min, kind: 'target', unit, digits });
    return `<div class="meter neutral"><div class="meter-label">${uiEsc(name)}</div><div class="meter-value"><strong>${uiFmtNum(totals[n], digits)}</strong> <span class="meter-of">${uiEsc(unit)}</span></div><div class="meter-word"><span>no number in plan</span></div></div>`;
  });
  const satPct = cmp.over.find(x => x.nutrient === 'satfat_pct_kcal') || cmp.ok.find(x => x.nutrient === 'satfat_pct_kcal');
  if (satPct) meters.push(uiMeter({ label: 'Saturated fat', value: satPct.value, max: satPct.limit, kind: 'limit', unit: '% of calories', digits: 1 }));
  const nutTable = `<div class="meters-grid" aria-label="Nutrients versus plan">${meters.join('')}</div>
    <p class="small muted">Foods missing a nutrient value count as zero for that nutrient.</p>`;
  let head = '';
  if (info.state === 'disabled') {
    head = `<div class="ring-row">${uiStatTile({ value: uiFmtNum(totals.kcal), label: 'kcal logged', note: 'no target' })}<div class="ring-text"><p>Calorie targets are turned off because of <strong>${uiEsc(info.by)}</strong>. The plan still checks foods and meals; there is no daily calorie number to chase.</p></div></div>`;
  } else if (info.state === 'off') {
    head = `<div class="ring-row">${uiStatTile({ value: uiFmtNum(totals.kcal), label: 'kcal logged', note: 'No target set' })}<div class="ring-text"><p>No calorie target is set. The diary still adds up what you eat and compares the nutrients below against your plan. A target is optional and is always an estimate.</p><button class="btn primary small" type="button" id="today-set-target">Set a calorie target</button></div></div>`;
  } else if (info.state === 'missing') {
    head = `<div class="ring-row">${uiStatTile({ value: uiFmtNum(totals.kcal), label: 'kcal logged', note: 'No target yet', tone: 'caution' })}<div class="ring-text"><p>The estimate needs <strong>${info.missing.join(', ')}</strong> on the person record. <a href="#/people/${uiEsc(person.id)}/basics">Add it on the Basics step</a>, or enter your own number.</p><button class="btn small" type="button" id="today-set-target">Change target</button></div></div>`;
  } else {
    const count = !!(person.goals && person.goals.count_exercise);
    const target = info.kcal + (count ? exerciseKcal : 0);
    const diff = target - totals.kcal;
    const goalWord = info.manual ? 'your own number' : person.goals.calorie_target === 'loss' ? `weight loss, ${person.goals.deficit || 500} kcal a day below maintenance` : person.goals.calorie_target === 'gain' ? `weight gain, ${person.goals.surplus || 400} kcal a day above maintenance` : 'maintain weight';
    head = `<div class="ring-row">${uiRing({ value: totals.kcal, max: target, kind: 'kcal', unit: 'kcal', label: `of ${uiFmtNum(target)} target`, size: 148 })}
      <div class="ring-text"><p><strong>${diff >= 0 ? `${uiFmtNum(diff)} kcal under` : `${uiFmtNum(-diff)} kcal over`}</strong> the estimated target of ${uiFmtNum(target)} kcal ${uiChip('estimate', 'neutral')}</p>
      <p class="small muted">Goal: ${goalWord}.${count && exerciseKcal ? ` Includes ${uiFmtNum(exerciseKcal)} kcal of exercise added back today.` : ''} An estimate from a published equation, not a measurement; appetite, sleep, and how you feel matter too.</p>
      <details><summary>How this was estimated</summary><ul class="small">${(info.notes || []).map(n => `<li>${uiEsc(n)}</li>`).join('')}<li>Resting energy: Mifflin-St Jeor equation (Mifflin 1990), multiplied by an activity factor. Errors of 10 percent or more for an individual are normal.</li></ul></details>
      <div><button class="btn small" type="button" id="today-set-target">${uiIcon('edit')}Change target</button></div></div></div>`;
  }
  return `<section class="card" aria-labelledby="today-target-h"><h2 id="today-target-h">Calories and nutrients</h2>${head}${nutTable}</section>`;
}

function todayMealsHTML(person, plan, entries) {
  return uiSection('Meals', `<div class="stack-2">${TODAY_MEALS.map(m => {
      const list = entries.filter(e => e.meal === m.id);
      const kcal = list.reduce((s, e) => s + ((e.nutrients && e.nutrients.kcal) || 0), 0);
      return `<section class="meal-section" aria-labelledby="today-meal-${m.id}">
        <div class="section-head"><h3 id="today-meal-${m.id}">${m.label}<span class="meal-kcal">${list.length ? uiFmtNum(kcal) + ' kcal' : ''}</span></h3><button class="btn small primary" type="button" data-add="${m.id}">${uiIcon('plus')}Add</button></div>
        <div class="list">${list.map(e => {
          const fav = e.kind !== 'custom' && todayIsFavorite(person, e.kind, e.ref);
          const n = e.nutrients || {};
          return `<div class="entry-row">
            ${e.kind !== 'custom' ? `<button class="heart-btn ${fav ? 'on' : ''}" type="button" data-fav="${e.kind}:${uiEsc(e.ref)}" aria-pressed="${fav}" aria-label="${fav ? 'Remove from favorites' : 'Add to favorites'}">${uiIcon('heart', { fill: fav })}</button>` : '<span style="width:40px;flex:none"></span>'}
            <div class="entry-main"><div><span class="entry-name">${uiEsc(todayEntryName(e))}</span> <span class="entry-amount">${uiEsc(todayAmountText(e))}</span></div><div class="entry-kcal">${e.nutrients ? uiFmtNum(n.kcal) + ' kcal' : 'no numbers'}</div>
              <div class="entry-nut">${uiFmtNum(n.protein_g, 1)} g protein · ${uiFmtNum(n.carb_g, 1)} g carb · ${uiFmtNum(n.fiber_g, 1)} g fiber · ${uiFmtNum(n.sodium_mg)} mg sodium · ${uiFmtNum(n.satfat_g, 1)} g sat fat</div>
              ${e.note ? `<div class="entry-note">${uiEsc(e.note)}</div>` : ''}</div>
            <div class="entry-acts"><button class="btn small icon" type="button" data-edit="${uiEsc(e.id)}" aria-label="Edit ${uiEsc(todayEntryName(e))}" title="Edit">${uiIcon('edit')}</button><button class="btn small icon danger" type="button" data-remove="${uiEsc(e.id)}" aria-label="Remove ${uiEsc(todayEntryName(e))}" title="Remove">${uiIcon('trash')}</button></div>
          </div>`;
        }).join('') || '<p class="small muted" style="padding:8px 0">Nothing logged.</p>'}</div>
        ${todayMealStackingHTML(plan, list)}
      </section>`;
    }).join('')}</div>`, { id: 'today-meals-h', action: `<button class="btn small" type="button" data-food-history>${uiIcon('list')}History</button><button class="btn small" type="button" id="today-copy-yesterday">Copy yesterday</button><button class="btn small" type="button" id="today-from-plan">${uiIcon('calendar')}Add from this week's plan</button>${uiState.profile.people.length > 1 && uiState.profile.household && uiState.profile.household.built ? `<button class="btn small" type="button" id="today-from-household">${uiIcon('people')}Add from the household plan</button>` : ''}` });
}

function todayWeightHTML(person) {
  const all = (uiState.profile.weights || []).filter(w => w.person === person.id).sort((a, b) => a.date.localeCompare(b.date));
  const cutoff = todayShiftDate(uiIsoDate(uiToday()), -90);
  const chart = all.filter(w => w.date >= cutoff);
  return `<section class="card" aria-labelledby="today-weight-h"><h2 id="today-weight-h">Weight</h2>
    <div class="today-row"><div class="field"><label for="today-weight-lb">Weight (lb)</label><input id="today-weight-lb" type="number" inputmode="decimal" min="50" max="900" step="0.1" placeholder="${all.length ? kgToLb(all[all.length - 1].kg) : '150'}"></div><button class="btn primary" type="button" id="today-log-weight">${uiIcon('scale')}Log weight</button></div>
    <p class="small muted">Stored in kilograms for the rules that need it; shown in pounds. Logging a weight updates the calorie estimate.</p>
    ${chart.length ? todayChartSVG(chart) : '<p class="small muted">No weights in the last 90 days to chart.</p>'}
    ${all.length ? `<div class="btn-row"><button class="btn" type="button" data-weight-history>${uiIcon('list')}Weight history (${all.length} entr${all.length === 1 ? 'y' : 'ies'})</button></div>` : ''}
  </section>`;
}

// History, one tap from where things are logged (owner request, September 30, 2026): every weight, newest first, and
// what was eaten and how the person felt, day by day. Both Today screens (full and lite) open these.
export function todayBindHistoryButtons(root, person) {
  root.querySelectorAll('[data-weight-history]').forEach(b => b.addEventListener('click', () => todayWeightHistoryModal(person)));
  root.querySelectorAll('[data-food-history]').forEach(b => b.addEventListener('click', () => todayFoodHistoryModal(person)));
}

export function todayWeightHistoryModal(person) {
  const draw = () => {
    const all = (uiState.profile.weights || []).filter(w => w.person === person.id).sort((a, b) => a.date.localeCompare(b.date));
    const rows = all.map((w, i) => ({ w, prev: i ? all[i - 1] : null })).reverse();
    return `${all.length > 1 ? todayChartSVG(all) : ''}
      ${rows.length ? `<ul class="today-list">${rows.map(({ w, prev }) => { const d = prev ? Math.round((kgToLb(w.kg) - kgToLb(prev.kg)) * 10) / 10 : null;
        return `<li><span>${uiFmtDate(w.date)}</span><span class="num">${kgToLb(w.kg)} lb${d != null ? ` <span class="muted small">(${d > 0 ? '+' : ''}${d} lb)</span>` : ''} <button class="btn link small" type="button" data-hist-del-weight="${uiEsc(w.date)}" aria-label="Delete the weight for ${uiEsc(uiFmtDate(w.date))}">Delete</button></span></li>`; }).join('')}</ul>` : uiEmptyState('No weights logged yet.', '', 'list')}
      <p class="small muted">Every weight you have logged, newest first. The number in brackets is the change from the entry before.</p>`;
  };
  // The Today screen behind the sheet redraws when it closes, so a deleted weight leaves its chart and count too.
  const m = uiModal(draw(), { title: 'Weight history', onClose: () => uiState.rerender() });
  if (!m) return;
  const bind = () => m.el.querySelectorAll('[data-hist-del-weight]').forEach(b => b.addEventListener('click', () => {
    uiState.profile.weights = uiState.profile.weights.filter(w => !(w.person === person.id && w.date === b.dataset.histDelWeight));
    uiPersist(); m.el.innerHTML = draw(); bind(); uiToast('Deleted.');
  }));
  bind();
}

const TODAY_HISTORY_MEALS = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner'], ['snacks', 'Snacks']];
const TODAY_SEVERITY = ['', 'mild', 'moderate', 'bad'];
function todaySymptomName(id) {
  const s = LOG_SYMPTOMS.find(x => x.id === id);
  return s ? s.label : String(id).replace(/^custom:/, '').replace(/_/g, ' ');
}

// Food and symptom history (owner item 5, October 8, 2026): "Show 30 earlier days" seemed to do nothing. It did add the
// days, but the sheet jumped back to the top, where the newest days had not changed, and when nothing was logged before
// the first 30 days nothing changed at all. Now the sheet says which days it shows, keeps the place after loading
// earlier days (the first newly shown day comes into view and takes focus), says so when those 30 days are empty, and
// offers no more when everything logged is already on screen.
function todayHistoryEarliest(person) {
  const p = uiState.profile || {};
  const dates = [...(p.diary || []), ...(p.log || []), ...(p.weights || [])].filter(e => e && e.person === person.id && e.date).map(e => e.date).sort();
  return dates[0] || null;
}
export function todayFoodHistoryHTML(person, dayCount, earliest = todayHistoryEarliest(person)) {
  const to = uiIsoDate(uiToday()), from = todayShiftDate(to, -(dayCount - 1));
  const days = reportDays({ diary: uiState.profile.diary, log: uiState.profile.log, weights: uiState.profile.weights, personId: person.id, from, to, onlySymptomDays: false }).reverse();
  const fine = new Set((uiState.profile.log || []).filter(e => e.person === person.id && e.fine && e.date >= from && e.date <= to).map(e => e.date));
  for (const date of fine) if (!days.some(d => d.date === date)) days.push({ date, eaten: [], episodes: [], weight: null });
  days.sort((a, b) => b.date.localeCompare(a.date));
  const dayHTML = d => {
    const known = new Set(TODAY_HISTORY_MEALS.map(([k]) => k));
    const groups = [...TODAY_HISTORY_MEALS, ...[...new Set(d.eaten.map(e => e.meal).filter(x => !known.has(x)))].map(k => [k, String(k).replace(/-/g, ' ')])];
    const meals = groups.map(([k, label]) => { const es = d.eaten.filter(e => e.meal === k); return es.length ? `<li><strong>${uiEsc(label[0].toUpperCase() + label.slice(1))}:</strong> ${es.map(e => { const kcal = todayNutrientsFor(e).kcal; return uiEsc(todayEntryName(e)) + (kcal ? ` <span class="muted small">${uiFmtNum(kcal)} kcal</span>` : ''); }).join(', ')}</li>` : ''; }).join('');
    const sym = d.episodes.map(e => Object.entries(e.symptoms).filter(([, v]) => Number(v) > 0).map(([k, v]) => `${uiEsc(todaySymptomName(k))} (${TODAY_SEVERITY[Number(v)] || v})`).join(', ')).filter(Boolean);
    return `<div class="card history-day" data-date="${uiEsc(d.date)}" tabindex="-1"><h3>${uiEsc(uiFmtDate(d.date))}</h3>
      ${sym.length ? `<p><strong>Symptoms:</strong> ${sym.join('; ')}</p>` : fine.has(d.date) ? '<p><strong>Feeling fine</strong></p>' : ''}
      ${meals ? `<ul class="small history-meals">${meals}</ul>` : '<p class="small muted">No food logged.</p>'}
      ${d.weight ? `<p class="small">Weight: ${kgToLb(d.weight.kg)} lb</p>` : ''}</div>`;
  };
  const more = !!(earliest && earliest < from);
  return `<p class="history-range"><strong>The last ${dayCount} days</strong>, from ${uiEsc(uiFmtDate(from))} to today. Newest first.</p>
    ${days.length ? `<div class="stack">${days.map(dayHTML).join('')}</div>` : uiEmptyState(`Nothing logged in the last ${dayCount} days.`, '', 'list')}
    <p class="small muted history-status" role="status" aria-live="polite"></p>
    <div class="btn-row">${more ? '<button class="btn" type="button" data-history-more>Show 30 earlier days</button>' : `<p class="small muted history-end">${earliest ? `That is everything: nothing was logged before ${uiEsc(uiFmtDate(earliest))}.` : 'Nothing logged yet.'}</p>`}<a class="btn" href="#/report">Open the doctor report</a></div>`;
}

export function todayFoodHistoryModal(person) {
  const state = { days: 30 };
  const earliest = todayHistoryEarliest(person);
  const m = uiModal(todayFoodHistoryHTML(person, state.days, earliest), { title: 'Food and symptom history' });
  if (!m) return;
  const bind = () => {
    const more = m.el.querySelector('[data-history-more]');
    if (more) more.addEventListener('click', () => {
      const before = new Set([...m.el.querySelectorAll('.history-day')].map(d => d.dataset.date));
      state.days += 30;
      m.el.innerHTML = todayFoodHistoryHTML(person, state.days, earliest);
      bind();
      const added = [...m.el.querySelectorAll('.history-day')].filter(d => !before.has(d.dataset.date));
      const status = m.el.querySelector('.history-status');
      if (status) status.textContent = added.length ? `${added.length} more day${added.length === 1 ? '' : 's'} with entries.` : 'Nothing was logged in those 30 days.';
      // Keep the place: the first newly shown day, or (when those days were empty) the buttons just below.
      const target = added[0] || m.el.querySelector('.history-status');
      if (target) { target.scrollIntoView({ block: 'start' }); if (added[0]) added[0].focus({ preventScroll: true }); }
    });
    const rep = m.el.querySelector('a[href="#/report"]');
    if (rep) rep.addEventListener('click', () => { if (uiState.modalClose) uiState.modalClose({ silent: true }); });
  };
  bind();
}

export function todayChartSVG(points) {
  const W = 360, H = 170, L = 48, R = 12, T = 14, B = 30;
  const lbs = points.map(p => kgToLb(p.kg));
  let lo = Math.min(...lbs), hi = Math.max(...lbs);
  if (hi - lo < 4) { lo -= 2; hi += 2; }
  lo = Math.floor(lo); hi = Math.ceil(hi);
  const d0 = new Date(points[0].date + 'T00:00:00').getTime(), d1 = new Date(points[points.length - 1].date + 'T00:00:00').getTime();
  const span = Math.max(1, d1 - d0);
  const x = p => points.length === 1 ? (L + W - R) / 2 : L + (new Date(p.date + 'T00:00:00').getTime() - d0) / span * (W - L - R);
  const y = lb => T + (hi - lb) / (hi - lo) * (H - T - B);
  const mid = Math.round((lo + hi) / 2);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p).toFixed(1)},${y(kgToLb(p.kg)).toFixed(1)}`).join(' ');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight over the last 90 days, ${lbs[0]} to ${lbs[lbs.length - 1]} pounds">
    <line class="axis" x1="${L}" y1="${T}" x2="${L}" y2="${H - B}"/><line class="axis" x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}"/>
    <line class="grid" x1="${L}" y1="${y(mid).toFixed(1)}" x2="${W - R}" y2="${y(mid).toFixed(1)}"/><line class="grid" x1="${L}" y1="${T}" x2="${W - R}" y2="${T}"/>
    <text x="${L - 6}" y="${T + 4}" text-anchor="end">${hi}</text><text x="${L - 6}" y="${y(mid).toFixed(1)}" dy="4" text-anchor="end">${mid}</text><text x="${L - 6}" y="${H - B}" text-anchor="end">${lo}</text>
    <text class="axis-title" x="${L - 6}" y="${H - B + 14}" text-anchor="end">lb</text>
    <text x="${L}" y="${H - 8}">${uiEsc(uiFmtDate(points[0].date))}</text><text x="${W - R}" y="${H - 8}" text-anchor="end">${uiEsc(uiFmtDate(points[points.length - 1].date))}</text>
    <path class="line" d="${path}"/>
    ${points.map(p => `<circle class="pt" cx="${x(p).toFixed(1)}" cy="${y(kgToLb(p.kg)).toFixed(1)}" r="3.5"><title>${uiEsc(uiFmtDate(p.date))}: ${kgToLb(p.kg)} lb</title></circle>`).join('')}
  </svg>`;
}

function todayExerciseHTML(person, exercise, exerciseKcal) {
  const wkg = todayLatestWeightKg(person);
  const count = !!(person.goals && person.goals.count_exercise);
  return `<section class="card" aria-labelledby="today-ex-h"><h2 id="today-ex-h">Exercise</h2>
    ${exercise.length ? `<div class="list">${exercise.map(e => `<div class="list-row"><div class="list-main"><div class="list-title">${uiEsc(e.name || (ACTIVITIES.find(a => a.id === e.activity) || {}).label || e.activity)}</div><div class="list-sub">${e.minutes ? `${e.minutes} min · ` : ''}${e.kcal != null ? `<span class="num">${uiFmtNum(e.kcal)} kcal</span>` : 'no estimate'}</div></div><div class="list-actions"><button class="btn small icon" type="button" data-del-ex="${uiEsc(e.id)}" aria-label="Delete this activity" title="Delete">${uiIcon('trash')}</button></div></div>`).join('')}</div><p class="small muted">About ${uiFmtNum(exerciseKcal)} kcal today (estimate: MET x weight x hours, 2011 Compendium).</p>` : '<p class="small muted">Nothing logged.</p>'}
    <div class="today-row"><div class="field"><label for="today-ex-act">Activity</label><select id="today-ex-act">${ACTIVITIES.map(a => `<option value="${a.id}">${uiEsc(a.label)}</option>`).join('')}</select></div>
      <div class="field" style="max-width:120px"><label for="today-ex-min">Minutes</label><input id="today-ex-min" type="number" inputmode="numeric" min="1" max="600" value="30"></div>
      <button class="btn primary" type="button" id="today-add-ex">${uiIcon('plus')}Add activity</button></div>
    <div class="hint" id="today-ex-est">${wkg ? '' : 'Log a weight to get a calorie estimate for activities.'}</div>
    <details><summary>Enter an activity by hand</summary>
      <div class="today-row"><div class="field"><label for="today-ex-name">Name</label><input id="today-ex-name" type="text" placeholder="Pickleball"></div><div class="field" style="max-width:120px"><label for="today-ex-kcal">Calories</label><input id="today-ex-kcal" type="number" inputmode="numeric" min="0" max="5000"></div><button class="btn" type="button" id="today-add-ex-manual">Add</button></div></details>
    ${uiSwitch('today-count-ex', "Count exercise toward today's calories", 'Off by default. Activity estimates run high for many people; eating them back can cancel a deficit.', count)}
  </section>`;
}

function todayBind(root, person, plan, date) {
  const go = d => { todayUi.date = d; uiState.rerender(); };
  root.querySelector('#today-prev').addEventListener('click', () => go(todayShiftDate(date, -1)));
  root.querySelector('#today-next').addEventListener('click', () => go(todayShiftDate(date, 1)));
  root.querySelector('#today-date').addEventListener('change', e => { if (e.target.value) go(e.target.value); });
  const tb = root.querySelector('#today-set-target');
  if (tb) tb.addEventListener('click', () => todayTargetModal(person, plan));
  root.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => todayAddModal(person, plan, date, b.dataset.add)));
  root.querySelectorAll('[data-fav]').forEach(b => b.addEventListener('click', () => {
    const [kind, id] = b.dataset.fav.split(':');
    const on = todayToggleFavorite(person, kind, id);
    uiToast(on ? 'Added to favorites.' : 'Removed from favorites.');
    uiState.rerender();
  }));
  root.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => {
    uiState.profile.diary = uiState.profile.diary.filter(e => e.id !== b.dataset.remove);
    uiPersist(); uiToast('Removed.'); uiState.rerender();
  }));
  root.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
    const e = uiState.profile.diary.find(x => x.id === b.dataset.edit);
    if (e) todayAmountModal(person, plan, { entry: e });
  }));
  root.querySelector('#today-copy-yesterday').addEventListener('click', () => {
    const prev = todayEntries(person, todayShiftDate(date, -1));
    if (!prev.length) { uiToast('Nothing was logged yesterday.'); return; }
    for (const e of prev) uiState.profile.diary.push({ ...e, id: todayNewId('d'), date, nutrients: e.nutrients ? { ...e.nutrients } : null });
    uiPersist(); uiToast(`Copied ${prev.length} entr${prev.length === 1 ? 'y' : 'ies'} from yesterday.`); uiState.rerender();
  });
  root.querySelector('#today-from-plan').addEventListener('click', () => {
    if (!uiState.data.recipes.length) { uiToast('No recipes loaded.'); return; }
    const week = weekGet(person, plan);
    const day = week.days.find(d => d.date === date);
    const meals = day ? day.meals.filter(m => m.recipe) : [];
    if (!meals.length) { uiToast('The week plan has no meals for this date.'); return; }
    for (const m of meals) todayAddDiaryEntry(person, { date, meal: m.slot, kind: 'recipe', ref: m.recipe, amount: 1, unit: 'serving' });
    uiToast(`Added ${meals.length} planned meal${meals.length === 1 ? '' : 's'}.`); uiState.rerender();
  });
  const fromHh = root.querySelector('#today-from-household');
  if (fromHh) fromHh.addEventListener('click', () => {
    const week = householdWeekGet();
    const day = week ? week.days.find(d => d.date === date) : null;
    const meals = day ? day.meals.filter(m => m.recipe && (m.eaters || []).includes(person.id)) : [];
    if (!meals.length) { uiToast(`${person.name} is not at any household meal on this date.`); return; }
    for (const m of meals) todayAddDiaryEntry(person, { date, meal: m.slot, kind: 'recipe', ref: m.recipe, amount: 1, unit: 'serving' });
    uiToast(`Added ${meals.length} household meal${meals.length === 1 ? '' : 's'} for ${person.name}.`); uiState.rerender();
  });
  root.querySelector('#today-log-weight').addEventListener('click', () => {
    const lb = Number(root.querySelector('#today-weight-lb').value);
    const kg = lbToKg(lb);
    if (!kg) { uiToast('Enter a weight in pounds.'); return; }
    uiState.profile.weights = uiState.profile.weights.filter(w => !(w.person === person.id && w.date === date));
    uiState.profile.weights.push({ date, person: person.id, kg });
    person.weight_kg = kg;
    uiPersist(); uiToast(`Logged ${lb} lb (${kg} kg).`); uiState.rerender();
  });
  root.querySelectorAll('[data-del-weight]').forEach(b => b.addEventListener('click', () => {
    uiState.profile.weights = uiState.profile.weights.filter(w => !(w.person === person.id && w.date === b.dataset.delWeight));
    uiPersist(); uiState.rerender();
  }));
  todayBindHistoryButtons(root, person);
  const est = root.querySelector('#today-ex-est');
  const updEst = () => {
    const wkg = todayLatestWeightKg(person);
    if (!wkg) return;
    const kcal = activityCalories(root.querySelector('#today-ex-act').value, Number(root.querySelector('#today-ex-min').value), wkg);
    est.textContent = kcal != null ? `About ${kcal} kcal (estimate for ${kgToLb(wkg)} lb).` : '';
  };
  root.querySelector('#today-ex-act').addEventListener('change', updEst);
  root.querySelector('#today-ex-min').addEventListener('input', updEst);
  updEst();
  root.querySelector('#today-add-ex').addEventListener('click', () => {
    const activity = root.querySelector('#today-ex-act').value;
    const minutes = Number(root.querySelector('#today-ex-min').value);
    if (!(minutes > 0)) { uiToast('Enter minutes.'); return; }
    const kcal = activityCalories(activity, minutes, todayLatestWeightKg(person));
    uiState.profile.exercise.push({ id: todayNewId('x'), date, person: person.id, activity, minutes, kcal });
    uiPersist(); uiToast(kcal != null ? `Added, about ${kcal} kcal.` : 'Added (no weight, so no calorie estimate).'); uiState.rerender();
  });
  root.querySelector('#today-add-ex-manual').addEventListener('click', () => {
    const name = root.querySelector('#today-ex-name').value.trim();
    const kcal = Number(root.querySelector('#today-ex-kcal').value);
    if (!name) { uiToast('Enter a name.'); return; }
    uiState.profile.exercise.push({ id: todayNewId('x'), date, person: person.id, activity: 'manual', name, minutes: null, kcal: kcal >= 0 ? Math.round(kcal) : null });
    uiPersist(); uiToast('Added.'); uiState.rerender();
  });
  root.querySelectorAll('[data-del-ex]').forEach(b => b.addEventListener('click', () => {
    uiState.profile.exercise = uiState.profile.exercise.filter(e => e.id !== b.dataset.delEx);
    uiPersist(); uiState.rerender();
  }));
  root.querySelector('#today-count-ex').addEventListener('change', e => {
    person.goals.count_exercise = e.target.checked;
    e.target.setAttribute('aria-checked', String(e.target.checked));
    uiPersist(); uiState.rerender();
  });
}

function todayTargetModal(person, plan) {
  const g = person.goals || { calorie_target: 'off', deficit: 500 };
  const draft = { goal: g.calorie_target === 'off' ? 'maintain' : g.calorie_target, deficit: g.deficit || 500, surplus: g.surplus || 400, manual: person.manual_kcal || '', activity: person.activity || 'light' };
  const m = uiModal(`
    <p class="small muted">A calorie target is an estimate from a published equation (Mifflin-St Jeor), not a prescription. It needs sex, age, weight, and height from the People screen.</p>
    <div class="field"><span class="label">Goal</span>${uiSegmented('today-goal', [{ value: 'maintain', label: 'Maintain' }, { value: 'loss', label: 'Lose weight' }, { value: 'gain', label: 'Gain weight' }, { value: 'manual', label: 'Enter my own number' }], draft.goal)}</div>
    <div class="field" id="today-goal-loss" ${draft.goal === 'loss' ? '' : 'hidden'}><label for="today-deficit">Daily deficit: <span id="today-deficit-val">${draft.deficit}</span> kcal</label><input id="today-deficit" type="range" min="500" max="750" step="50" value="${draft.deficit}"><div class="hint">Guidelines use 500 to 750 kcal a day below maintenance. The estimate never goes below 1,200 kcal.</div></div>
    <div class="field" id="today-goal-gain" ${draft.goal === 'gain' ? '' : 'hidden'}><label for="today-surplus">Daily extra: <span id="today-surplus-val">${draft.surplus}</span> kcal</label><input id="today-surplus" type="range" min="300" max="500" step="50" value="${draft.surplus}"><div class="hint">300 to 500 kcal above maintenance. About 7,000 kcal makes a kilogram, so 500 a day is roughly half a kilogram (one pound) a week. If the weight loss was not on purpose, especially past 65, a doctor should look for the cause first; the app cannot.</div></div>
    <div class="field" id="today-goal-manual" ${draft.goal === 'manual' ? '' : 'hidden'}><label for="today-manual">Calories per day</label><input id="today-manual" type="number" inputmode="numeric" min="800" max="6000" value="${uiEsc(draft.manual)}"><div class="hint">Use the number your doctor or dietitian gave you.</div></div>
    <div class="field" id="today-goal-activity" ${draft.goal === 'manual' ? 'hidden' : ''}><label for="today-activity">Usual activity</label><select id="today-activity">${ACTIVITY_LEVELS.map(l => `<option value="${l.id}" ${l.id === draft.activity ? 'selected' : ''}>${uiEsc(l.label)}</option>`).join('')}</select></div>
    <div id="today-target-preview" class="notice info plain"></div>
    <div class="btn-row"><button class="btn primary" type="button" id="today-target-save">Save</button>${g.calorie_target !== 'off' ? '<button class="btn" type="button" id="today-target-off">Turn off the target</button>' : ''}</div>
  `, { title: 'Calorie target' });
  if (!m) return;
  const el = m.el;
  const preview = () => {
    const box = el.querySelector('#today-target-preview');
    el.querySelector('#today-goal-loss').hidden = draft.goal !== 'loss';
    el.querySelector('#today-goal-gain').hidden = draft.goal !== 'gain';
    el.querySelector('#today-goal-manual').hidden = draft.goal !== 'manual';
    el.querySelector('#today-goal-activity').hidden = draft.goal === 'manual';
    if (draft.goal === 'manual') { box.innerHTML = `<div class="notice-head">Info</div><div class="notice-body">${draft.manual ? uiFmtNum(draft.manual) + ' kcal a day, entered by you.' : 'Enter a number.'}</div>`; return; }
    const missing = [];
    if (!person.sex) missing.push('sex');
    if (!(Number(person.age) > 0)) missing.push('age');
    if (!(Number(person.weight_kg) > 0)) missing.push('weight');
    if (!(Number(person.height_cm) > 0)) missing.push('height');
    if (missing.length) { box.innerHTML = `<div class="notice-head">Info</div><div class="notice-body">Missing: <strong>${missing.join(', ')}</strong>. <a href="#/people/${uiEsc(person.id)}/basics">Add it on the Basics step</a>, then come back. You can still save the goal now.</div>`; return; }
    const t = energyTarget({ ...person, activity: draft.activity }, { goal: draft.goal, deficit: draft.deficit, surplus: draft.surplus });
    box.innerHTML = `<div class="notice-head">Estimate</div><div class="notice-body"><strong>${uiFmtNum(t.kcal)} kcal a day</strong></div><details><summary>Notes</summary><ul class="small">${t.notes.map(n => `<li>${uiEsc(n)}</li>`).join('')}</ul></details>`;
  };
  el.querySelectorAll('[data-seg="today-goal"]').forEach(r => r.addEventListener('change', () => { draft.goal = r.value; el.querySelectorAll('[data-seg="today-goal"]').forEach(x => x.parentElement.classList.toggle('on', x.checked)); preview(); }));
  el.querySelector('#today-deficit').addEventListener('input', e => { draft.deficit = Number(e.target.value); el.querySelector('#today-deficit-val').textContent = draft.deficit; preview(); });
  el.querySelector('#today-surplus').addEventListener('input', e => { draft.surplus = Number(e.target.value); el.querySelector('#today-surplus-val').textContent = draft.surplus; preview(); });
  el.querySelector('#today-manual').addEventListener('input', e => { draft.manual = e.target.value; preview(); });
  el.querySelector('#today-activity').addEventListener('change', e => { draft.activity = e.target.value; preview(); });
  el.querySelector('#today-target-save').addEventListener('click', () => {
    if (draft.goal === 'manual' && !(Number(draft.manual) >= 800)) { uiToast('Enter at least 800 kcal, or pick another goal.'); return; }
    person.goals = { ...(person.goals || {}), calorie_target: draft.goal, deficit: draft.deficit, surplus: draft.surplus };
    if (draft.goal === 'manual') person.manual_kcal = Math.round(Number(draft.manual));
    else person.activity = draft.activity;
    uiPersist(); m.close(); uiToast('Target saved.'); uiState.rerender();
  });
  const off = el.querySelector('#today-target-off');
  if (off) off.addEventListener('click', () => { person.goals = { ...(person.goals || {}), calorie_target: 'off' }; uiPersist(); m.close(); uiToast('Target turned off.'); uiState.rerender(); });
  preview();
}

function todaySearchItems(person, plan, query, favOnly) {
  const q = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (q.length) uiEnsureAllRecipes();
  const match = name => q.every(w => name.toLowerCase().includes(w));
  const favR = new Set(person.favorites.recipes), favF = new Set(person.favorites.foods);
  const items = [];
  for (const r of (uiState.recipesForPlan && plan ? uiState.recipesForPlan(plan) : uiState.data.recipes)) if (match(r.name) && (!favOnly || favR.has(r.id)) && !recipesIsNever(person, r.id)) items.push({ kind: 'recipe', id: r.id, name: r.name, sub: `Recipe · ${r.active_min} min active · ${r.servings} servings`, fav: favR.has(r.id), obj: r });
  for (const f of uiState.data.foods) if (match(f.name + ' ' + (f.short || '')) && (!favOnly || favF.has(f.id))) items.push({ kind: 'food', id: f.id, name: f.short || f.name, sub: `Food · ${f.group || 'Other'}`, fav: favF.has(f.id), obj: f });
  // Foods and recipes are ranked and capped separately (src/engine/search.js): with one shared cap of 40, a common
  // word such as "banana" filled every slot with recipes and a plain banana could not be found.
  const g = searchGroupMatches(items, q);
  for (const it of [...g.foods, ...g.recipes]) {
    const c = it.kind === 'recipe' ? checkRecipe(it.obj, plan, uiState.matcher, uiState.foodsById, person) : checkFood(it.obj, plan, uiState.matcher, person);
    it.verdict = c.verdict;
  }
  return g;
}

export function todayAddModal(person, plan, date, meal, opts = {}) {
  const state = { q: opts.q || '', fav: false };
  const m = uiModal(`
    ${uiState.lite ? `<div class="field"><label for="today-w-name">Write it in</label><div class="row"><input id="today-w-name" type="text" placeholder="Toast with butter" autocomplete="off" style="flex:1;min-width:0"><button class="btn primary" type="button" id="today-w-add">Add</button></div><div class="hint">Just the name. Or search below to have it checked and counted.</div></div>` : ''}
    <div class="row"><input type="search" id="today-q" value="${uiEsc(state.q)}" placeholder="Search recipes and foods" aria-label="Search recipes and foods" style="flex:1;min-width:0"><button class="today-chip" type="button" id="today-fav-chip" aria-pressed="false">${uiIcon('heart')}Favorites</button></div>
    <div id="today-results" style="margin-top:.5rem"></div>
    ${uiState.lite ? '' : `<details style="margin-top:.75rem"><summary>Custom entry (from a label)</summary>
      <div class="today-row"><div class="field"><label for="today-c-name">Name</label><input id="today-c-name" type="text"></div><div class="field" style="max-width:110px"><label for="today-c-kcal">kcal</label><input id="today-c-kcal" type="number" inputmode="numeric" min="0"></div></div>
      <div class="today-row" style="margin-top:.5rem"><div class="field"><label for="today-c-protein">Protein g</label><input id="today-c-protein" type="number" inputmode="decimal" min="0"></div><div class="field"><label for="today-c-carb">Carb g</label><input id="today-c-carb" type="number" inputmode="decimal" min="0"></div><div class="field"><label for="today-c-fiber">Fiber g</label><input id="today-c-fiber" type="number" inputmode="decimal" min="0"></div><div class="field"><label for="today-c-sodium">Sodium mg</label><input id="today-c-sodium" type="number" inputmode="numeric" min="0"></div><div class="field"><label for="today-c-satfat">Sat fat g</label><input id="today-c-satfat" type="number" inputmode="decimal" min="0"></div></div>
      <div class="btn-row"><button class="btn" type="button" id="today-c-add">Add custom entry</button></div><p class="small muted">Custom entries are not checked against your plan's avoid rules; only their numbers count.</p></details>`}
  `, { title: `Add to ${(TODAY_MEALS.find(x => x.id === meal) || { label: meal }).label}` });
  if (!m) return;
  const el = m.el;
  const results = el.querySelector('#today-results');
  const draw = () => {
    const g = todaySearchItems(person, plan, state.q, state.fav);
    const shown = g.foods.length + g.recipes.length, total = g.totalFoods + g.totalRecipes;
    const plural = (n, w) => `${n.toLocaleString()} ${w}${n === 1 ? '' : 's'}`;
    const row = it => `<div class="today-result">
      ${it.kind === 'recipe' ? recipesTasteHTML(person, it.id) : `<button class="heart-btn ${it.fav ? 'on' : ''}" type="button" data-fav-food="${uiEsc(it.id)}" aria-pressed="${it.fav}" aria-label="${it.fav ? 'Remove from favorites' : 'Add to favorites'}">${uiIcon('heart', { fill: it.fav })}</button>`}
      <button class="pick" type="button" data-pick="${it.kind}:${uiEsc(it.id)}"><span class="dot ${it.verdict}" aria-hidden="true"></span><span class="visually-hidden">${uiVerdictWord(it.verdict)}: </span><strong>${uiEsc(it.name)}</strong><br><span class="small muted">${uiEsc(it.sub)}</span></button>
    </div>`;
    results.innerHTML = shown ? `<p class="small muted" style="margin:0 0 .25rem">${plural(g.totalFoods, 'food')} and ${plural(g.totalRecipes, 'recipe')} match${total > shown ? '; the closest are shown. Type more to narrow it down' : ''}. Favorites first. Recipes marked never again are not listed.</p>`
      + (g.foods.length ? `<h3 class="eyebrow" style="margin:.75rem 0 .25rem">Foods</h3>${g.foods.map(row).join('')}` : '')
      + (g.recipes.length ? `<h3 class="eyebrow" style="margin:.75rem 0 .25rem">Recipes</h3>${g.recipes.map(row).join('')}` : '')
      : uiEmptyState(state.fav ? 'No favorites match. Tap the heart on any recipe or food to add one.' : 'No recipe or food matches.', '', 'list');
    results.querySelectorAll('[data-fav-food]').forEach(b => b.addEventListener('click', () => { todayToggleFavorite(person, 'food', b.dataset.favFood); draw(); }));
    recipesBindTaste(results, person, () => draw());
    // The amount sheet replaces this one in place (uiModal reuses the open sheet's history entry). Closing this sheet
    // first queued a history.back() whose popstate landed after the amount sheet opened and closed it at once, so a
    // tapped food or recipe seemed to do nothing.
    results.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => { const [k, id] = b.dataset.pick.split(':'); todayAmountModal(person, plan, { date, meal, kind: k, ref: id }); }));
  };
  el.querySelector('#today-q').addEventListener('input', e => { state.q = e.target.value; draw(); });
  el.querySelector('#today-fav-chip').addEventListener('click', e => { state.fav = !state.fav; e.currentTarget.classList.toggle('on', state.fav); e.currentTarget.setAttribute('aria-pressed', String(state.fav)); draw(); });
  const wAdd = el.querySelector('#today-w-add');
  if (wAdd) {
    const save = () => {
      const name = el.querySelector('#today-w-name').value.trim();
      if (!name) { uiToast('Type what you ate.'); return; }
      todayAddDiaryEntry(person, { date, meal, kind: 'custom', ref: null, amount: 1, unit: 'entry', name, nutrients: null });
      m.close(); uiToast('Added.'); uiState.rerender();
    };
    wAdd.addEventListener('click', save);
    el.querySelector('#today-w-name').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
  }
  const cAdd = el.querySelector('#today-c-add');
  if (cAdd) cAdd.addEventListener('click', () => {
    const name = el.querySelector('#today-c-name').value.trim();
    if (!name) { uiToast('Enter a name.'); return; }
    const num = id => { const v = el.querySelector(id).value; return v === '' ? 0 : Number(v); };
    todayAddDiaryEntry(person, { date, meal, kind: 'custom', ref: null, amount: 1, unit: 'entry', name, nutrients: { kcal: num('#today-c-kcal'), protein_g: num('#today-c-protein'), carb_g: num('#today-c-carb'), fiber_g: num('#today-c-fiber'), sodium_mg: num('#today-c-sodium'), satfat_g: num('#today-c-satfat') } });
    m.close(); uiToast('Added.'); uiState.rerender();
  });
  draw();
  el.querySelector(uiState.lite ? '#today-w-name' : '#today-q').focus();
}

// Amount form for a recipe (servings) or a food (portion or grams). Also used to edit an existing entry.
export function todayAmountModal(person, plan, { date, meal, kind, ref, entry = null, partsOpen = false }) {
  if (entry) { date = entry.date; meal = entry.meal; kind = entry.kind; ref = entry.ref; }
  if (kind === 'custom') { todayCustomEditModal(entry); return; }
  const obj = kind === 'recipe' ? uiState.recipesById.get(ref) : uiState.foodsById.get(ref);
  if (!obj) { uiToast('Not found in the data files.'); return; }
  const name = kind === 'recipe' ? obj.name : (obj.short || obj.name);
  // Every USDA food lists a "100 g" pseudo-portion first; real portions ("1 large") come after it. Grams are always offered separately.
  const portions = kind === 'food' ? (obj.portions || []).filter(p => p.grams > 0 && !/^100 g$/.test(p.label)) : [];
  const draft = entry ? { amount: entry.amount, unit: entry.unit, grams: entry.grams, meal: entry.meal, note: entry.note || '' }
    : kind === 'recipe' ? { amount: 1, unit: 'serving', grams: null, meal, note: '' }
      : { amount: 1, unit: portions.length ? portions[0].label : 'g', grams: portions.length ? portions[0].grams : 100, meal, note: '' };
  if (kind === 'food' && draft.unit === 'g') draft.amount = draft.grams;
  const check = kind === 'recipe' ? checkRecipe(obj, plan, uiState.matcher, uiState.foodsById, person) : checkFood(obj, plan, uiState.matcher, person);
  const m = uiModal(`
    <div class="row">${uiVerdictChip(check.verdict)} ${check.hits.length || (check.termHits || []).some(t => t.allergy) ? `<span class="small">Matches: ${[...check.hits.map(h => uiEsc(h.label) + (h.hard ? ' (hard)' : '')), ...(check.termHits || []).filter(t => t.allergy).map(t => uiEsc(t.term) + ' (your allergy, hard)')].join(', ')}</span>` : check.verdict === 'caution' ? `<span class="small">${uiEsc(cautionWhy(check))}</span>` : '<span class="small muted">No avoid tags matched.</span>'}</div>
    ${check.verdict === 'fail' ? uiNoticeHTML({ level: 'block', text: 'This has a hard exclusion for this person. You can still record that it was eaten, but it is not allowed by the plan.' }) : ''}
    <div class="field"><label for="today-a-meal">Meal</label><select id="today-a-meal">${TODAY_MEALS.map(x => `<option value="${x.id}" ${x.id === draft.meal ? 'selected' : ''}>${x.label}</option>`).join('')}</select></div>
    ${kind === 'recipe' ? `<div class="field"><label for="today-a-amount">Servings (recipe makes ${obj.servings})</label><input id="today-a-amount" type="number" inputmode="decimal" min="0.5" step="0.5" value="${uiEsc(draft.amount)}"></div>`
    : `<div class="today-row"><div class="field"><label for="today-a-unit">Portion</label><select id="today-a-unit">${portions.map(p => `<option value="${uiEsc(p.label)}" data-grams="${p.grams}" ${draft.unit === p.label ? 'selected' : ''}>${uiEsc(p.label)} (${p.grams} g)</option>`).join('')}<option value="g" ${draft.unit === 'g' ? 'selected' : ''}>grams</option></select></div>
      <div class="field" style="max-width:130px"><label for="today-a-amount" id="today-a-amount-l">${draft.unit === 'g' ? 'Grams' : 'How many'}</label><input id="today-a-amount" type="number" inputmode="decimal" min="0" step="${draft.unit === 'g' ? '1' : '0.25'}" value="${uiEsc(draft.amount)}"></div></div>
      ${portions.length ? `<div class="btn-row" style="margin-top:0"><button class="btn small" type="button" id="today-a-one">1 serving (${uiEsc(portions[0].label)})</button></div>` : ''}`}
    <div class="field"><label for="today-a-note">Note (optional)</label><input id="today-a-note" type="text" value="${uiEsc(draft.note)}"></div>
    <div class="notice info plain" id="today-a-preview"></div>
    <div class="btn-row"><button class="btn primary" type="button" id="today-a-save">${entry ? 'Save changes' : 'Add'}</button></div>
    ${kind === 'recipe' && !entry ? todayPartsHTML(obj, partsOpen) : ''}
  `, { title: name });
  if (!m) return;
  const el = m.el;
  const compute = () => {
    draft.meal = el.querySelector('#today-a-meal').value;
    draft.note = el.querySelector('#today-a-note').value;
    const amt = Number(el.querySelector('#today-a-amount').value) || 0;
    if (kind === 'recipe') { draft.amount = amt; draft.unit = 'serving'; draft.grams = null; }
    else {
      const sel = el.querySelector('#today-a-unit');
      const opt = sel.options[sel.selectedIndex];
      draft.unit = sel.value;
      draft.amount = amt;
      draft.grams = sel.value === 'g' ? amt : amt * Number(opt.dataset.grams || 0);
    }
    const n = todayNutrientsFor({ kind, ref, amount: draft.amount, grams: draft.grams });
    el.querySelector('#today-a-preview').innerHTML = `<div class="notice-head">This entry</div><div class="notice-body">${uiFmtNum(n.kcal)} kcal · ${uiFmtNum(n.protein_g, 1)} g protein · ${uiFmtNum(n.carb_g, 1)} g carb · ${uiFmtNum(n.fiber_g, 1)} g fiber · ${uiFmtNum(n.sodium_mg)} mg sodium · ${uiFmtNum(n.satfat_g, 1)} g saturated fat${kind === 'food' ? ` · ${uiFmtNum(draft.grams)} g` : ''}</div>`;
    return n;
  };
  el.querySelector('#today-a-amount').addEventListener('input', compute);
  el.querySelector('#today-a-note').addEventListener('input', compute);
  el.querySelector('#today-a-meal').addEventListener('change', compute);
  const unitSel = el.querySelector('#today-a-unit');
  if (unitSel) unitSel.addEventListener('change', () => {
    const g = unitSel.value === 'g';
    el.querySelector('#today-a-amount-l').textContent = g ? 'Grams' : 'How many';
    const inp = el.querySelector('#today-a-amount');
    inp.step = g ? '1' : '0.25';
    inp.value = g ? String(draft.grams || 100) : '1';
    compute();
  });
  const one = el.querySelector('#today-a-one');
  if (one) one.addEventListener('click', () => { unitSel.value = portions[0].label; el.querySelector('#today-a-amount').value = '1'; el.querySelector('#today-a-amount-l').textContent = 'How many'; compute(); });
  el.querySelector('#today-a-save').addEventListener('click', () => {
    const n = compute();
    if (!(draft.amount > 0)) { uiToast('Enter an amount.'); return; }
    if (entry) {
      Object.assign(entry, { meal: draft.meal, amount: draft.amount, unit: draft.unit, grams: draft.grams, note: draft.note, nutrients: n });
      uiPersist(); m.close(); uiToast('Saved.'); uiState.rerender();
    } else {
      todayAddDiaryEntry(person, { date, meal: draft.meal, kind, ref, amount: draft.amount, unit: draft.unit, grams: draft.grams, note: draft.note });
      m.close(); uiToast(`Added ${name}.`); uiState.rerender();
    }
  });
  if (kind === 'recipe' && !entry) todayBindParts(el, m, person, plan, obj, date, draft, compute);
  compute();
}

// Owner request (September 30, 2026): log only the parts of a recipe that were eaten. A part the recipe links to a food
// in foods.json is logged as that food, with the recipe's grams for it divided by the recipe's servings and multiplied
// by the servings eaten, so its numbers are USDA values like any other food, and each part adds to the day on its own.
// A part the recipe gives only as text (imported recipes) has no grams to scale, so nothing is estimated from it:
// "Find" searches the food list for it instead, and the person picks the food and the amount.
function todayPartsHTML(recipe, open) {
  const ings = recipe.ingredients || [];
  if (!ings.length) return '';
  const rows = ings.map((ing, i) => {
    const f = ing.food ? uiState.foodsById.get(ing.food) : null;
    const label = ing.display || (f ? f.short || f.name : '') || 'Ingredient';
    if (f && Number(ing.grams) > 0) return `<label class="choice"><input type="checkbox" data-part="${i}"><span class="choice-body"><span class="choice-title">${uiEsc(label)}</span><br><span class="small muted" data-part-share="${i}"></span></span></label>`;
    return `<div class="list-row today-part-find"><span>${uiEsc(label)}</span><button class="btn small" type="button" data-part-find="${i}">${uiIcon('search')}Find</button></div>`;
  }).join('');
  const linked = ings.some(ing => ing.food && uiState.foodsById.get(ing.food) && Number(ing.grams) > 0);
  const textOnly = ings.some(ing => !(ing.food && uiState.foodsById.get(ing.food) && Number(ing.grams) > 0));
  return `<details class="today-parts" ${open ? 'open' : ''}><summary>Ate only part of it? Pick the parts</summary>
    <p class="small muted">${linked ? 'Tick what you ate. Each part is logged as its own food, with its share of the servings above, and its numbers add up in your day.' : ''}${textOnly ? ' Parts with a Find button are written out in the recipe without an amount the app can use: tap Find to pick the food and how much.' : ''}</p>
    <div class="choice-list">${rows}</div>
    ${linked ? '<div class="btn-row"><button class="btn primary" type="button" id="today-parts-add" disabled>Add the ticked parts</button></div>' : ''}
  </details>`;
}

// "1 ½ cups (360 ml) blueberries, fresh" -> "blueberry": the words to search the food list with.
export function todayPartQuery(text) {
  let t = String(text || '').toLowerCase().replace(/\([^)]*\)/g, ' ').split(',')[0];
  t = t.replace(/(^|\s)\d+(?:[.,]\d+)?\s?(?:g|kg|mg|ml|l|oz|lbs?|tbsp|tsp|cm)(?=\s|$)/g, ' ');
  t = t.replace(/(^|\s)[\d¼½¾⅓⅔⅛⅜⅝⅞\/.]+(?=\s|$)/g, ' ');
  t = t.replace(/\b(cups?|c|tablespoons?|tbsps?|tbs|teaspoons?|tsps?|ounces?|oz|pounds?|lbs?|grams?|g|kg|ml|l|liters?|litres?|pinch(es)?|dash(es)?|cloves?|cans?|jars?|packages?|pkgs?|slices?|pieces?|large|medium|small|handfuls?|bunch(es)?|sprigs?|stalks?|heads?|of|about|to|or)\b/g, ' ');
  return t.split(/\s+/).filter(Boolean).map(w => /(ss|us)$/.test(w) || w.length <= 3 ? w : /oes$/.test(w) ? w.slice(0, -2) : /ies$/.test(w) ? w.slice(0, -3) + 'y' : /s$/.test(w) ? w.slice(0, -1) : w).join(' ').trim();
}

// The part's words, or, when no food has all of them ("porridge oat"), the shortest ending that some food has ("oat").
function todayPartSearch(text) {
  const q = todayPartQuery(text);
  const words = q.split(' ').filter(Boolean);
  const hits = ws => (uiState.data.foods || []).some(f => ws.every(w => (f.name + ' ' + (f.short || '')).toLowerCase().includes(w)));
  if (!words.length || hits(words)) return q;
  for (let i = 1; i < words.length; i++) if (hits(words.slice(i))) return words.slice(i).join(' ');
  return q;
}

function todayBindParts(el, m, person, plan, recipe, date, draft, compute) {
  const addBtn = el.querySelector('#today-parts-add');
  const ticked = () => [...el.querySelectorAll('[data-part]:checked')].map(x => Number(x.dataset.part));
  // Each line names the whole recipe's amount; the share logged follows the servings box.
  const shares = () => {
    const servings = Number((el.querySelector('#today-a-amount') || {}).value) || 1;
    const share = servings / (Number(recipe.servings) || 1);
    el.querySelectorAll('[data-part-share]').forEach(x => { const ing = recipe.ingredients[Number(x.dataset.partShare)]; x.textContent = `Your share: ${uiFmtNum(Math.round(Number(ing.grams) * share * 10) / 10, 1)} g (recipe makes ${recipe.servings})`; });
  };
  shares();
  const amt = el.querySelector('#today-a-amount');
  if (amt) amt.addEventListener('input', shares);
  el.querySelectorAll('[data-part]').forEach(x => x.addEventListener('change', () => { if (addBtn) addBtn.disabled = !ticked().length; }));
  if (addBtn) addBtn.addEventListener('click', () => {
    compute();
    const servings = draft.amount > 0 ? draft.amount : 1;
    const share = servings / (Number(recipe.servings) || 1);
    let n = 0;
    for (const i of ticked()) {
      const ing = recipe.ingredients[i];
      const grams = Math.round(Number(ing.grams) * share * 10) / 10;
      if (!(grams > 0)) continue;
      todayAddDiaryEntry(person, { date, meal: draft.meal, kind: 'food', ref: ing.food, amount: grams, unit: 'g', grams, note: `part of ${recipe.name}` });
      n++;
    }
    m.close(); uiToast(`Added ${n} part${n === 1 ? '' : 's'} of ${recipe.name}.`); uiState.rerender();
  });
  el.querySelectorAll('[data-part-find]').forEach(b => b.addEventListener('click', () => {
    compute();
    const ing = recipe.ingredients[Number(b.dataset.partFind)];
    todayAddModal(person, plan, date, draft.meal, { q: todayPartSearch(ing.display || '') });
  }));
}

function todayCustomEditModal(entry) {
  const n = entry.nutrients || {};
  const m = uiModal(`
    <div class="field"><label for="today-ce-name">Name</label><input id="today-ce-name" type="text" value="${uiEsc(entry.name || '')}"></div>
    <div class="field"><label for="today-ce-meal">Meal</label><select id="today-ce-meal">${TODAY_MEALS.map(x => `<option value="${x.id}" ${x.id === entry.meal ? 'selected' : ''}>${x.label}</option>`).join('')}</select></div>
    <div class="today-row">${[['kcal', 'kcal'], ['protein_g', 'Protein g'], ['carb_g', 'Carb g'], ['fiber_g', 'Fiber g'], ['sodium_mg', 'Sodium mg'], ['satfat_g', 'Sat fat g']].map(([k, l]) => `<div class="field"><label for="today-ce-${k}">${l}</label><input id="today-ce-${k}" type="number" inputmode="decimal" min="0" value="${uiEsc(n[k] ?? 0)}"></div>`).join('')}</div>
    <div class="btn-row"><button class="btn primary" type="button" id="today-ce-save">Save changes</button></div>`, { title: 'Edit custom entry' });
  if (!m) return;
  m.el.querySelector('#today-ce-save').addEventListener('click', () => {
    entry.name = m.el.querySelector('#today-ce-name').value.trim() || entry.name;
    entry.meal = m.el.querySelector('#today-ce-meal').value;
    const nut = { ...n };
    const fields = ['kcal', 'protein_g', 'carb_g', 'fiber_g', 'sodium_mg', 'satfat_g'];
    for (const k of fields) nut[k] = Number(m.el.querySelector('#today-ce-' + k).value) || 0;
    // A write-in stays without numbers unless some were typed; otherwise blank fields would count as zeros in the averages.
    const anyNumber = fields.some(k => String(m.el.querySelector('#today-ce-' + k).value).trim() !== '');
    if (entry.no_numbers && !anyNumber) entry.nutrients = null;
    else { entry.nutrients = todayNutrientsFor({ kind: 'custom', nutrients: nut }); delete entry.no_numbers; }
    uiPersist(); m.close(); uiToast('Saved.'); uiState.rerender();
  });
}
