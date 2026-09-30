// Household week (on the Together screen): who is at the table for each meal of each day, one shared week planned
// seating by seating, a grocery list for the whole week, and day-only changes with a preview before any meal moves.
import { buildHouseholdWeek, householdRepick, householdCandidates, rosterFor, cookFor, ensureHousehold, householdSlots } from '../engine/household.js';
import { mealFits, SLOT_LABEL, DAYS } from '../engine/planner.js';
import { emptyTotals, addTotals, recipeTotals } from '../engine/nutrition.js';
import { buildGroceryList } from '../engine/grocery.js';
import { uiState, uiEsc, uiPersist, uiToast, uiModal, uiIsoDate, uiToday, uiFmtDate, uiFmtNum, uiVerdictWord, uiVerdictChip, uiSection, uiChip, uiIcon, uiAvatar, uiSwitch, uiEmptyState, uiNoticeHTML, uiNavigate, uiPlanFor } from './common.js';
import { weekRecipeModal } from './week.js';

const HH_DAY_NAMES = { sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday' };
const HH_DAY_SHORT = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' };
const HH_SLOT_SHORT = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', 'snack-am': 'AM snack', 'snack-pm': 'PM snack', 'snack-eve': 'Eve snack' };
const HH_MINUTES = [10, 15, 20, 30, 45, 60, 90];

export function householdPseudoPerson() { return { id: 'household', name: 'Household', cooking: {}, preferences: {} }; }
export function householdState() { const p = uiState.profile; p.household = ensureHousehold(p.household); return p.household; }
function householdPeople() { return uiState.profile.people; }
function householdStart() { return uiIsoDate(uiToday()); }

// Drops this-week data (roster exceptions, day changes, swaps, snapshot) once the week has rolled past them.
function householdPrune(h) {
  const start = householdStart();
  if (h.week_start !== start) {
    const keep = obj => Object.fromEntries(Object.entries(obj || {}).filter(([k]) => k.slice(0, 10) >= start));
    h.roster = keep(h.roster); h.day_overrides = keep(h.day_overrides); h.cook_by_date = keep(h.cook_by_date); h.meal_overrides = keep(h.meal_overrides);
    if (h.week_snapshot && h.week_snapshot.start !== start) h.week_snapshot = null;
    h.week_start = start;
  }
}

function householdSignature(h) {
  const people = householdPeople().map(p => [p.id, p.name, p.adult, p.guest, p.modules, p.allergens, p.preferences, p.favorites, p.disliked, p.cooking, p.variants, p.flags, p.optional_rules, p.rule_settings, p.confirmations, p.custom_modules, p.medications, p.tier2, p.phases, p.modes]);
  // roster, day changes, swaps, and the snapshot are laid over the built week, so they do not trigger a rebuild
  const { week_snapshot, meal_overrides, roster, day_overrides, cook_by_date, built, week_start, ...rest } = h;
  return JSON.stringify([rest, people, householdStart(), uiState.data.recipes.length]);
}

// The household week as shown: built (and cached until anything it depends on changes), then the frozen snapshot and swaps laid over it.
export function householdWeekGet() {
  const h = householdState();
  householdPrune(h);
  const people = householdPeople();
  if (!people.length || !uiState.data.recipes.length) return null;
  const sig = householdSignature(h);
  let week = uiState.householdCache && uiState.householdCache.sig === sig ? uiState.householdCache.week : null;
  if (!week) {
    const [y, m, d] = householdStart().split('-').map(Number);
    week = buildHouseholdWeek({ people, household: h, conditions: uiState.data.conditions, dictionaries: uiState.data.dictionaries, recipes: householdPool(people), foodsById: uiState.foodsById, matcher: uiState.matcher, startDate: new Date(Date.UTC(y, m - 1, d)), seed: h.seed || 0, today: uiToday() });
    uiState.householdCache = { sig, week };
  }
  // work on a copy of the days so the cached build stays pristine
  const view = { ...week, days: week.days.map(d => ({ ...d, meals: d.meals.map(m => ({ ...m })) })) };
  householdApplySnapshot(view, h);
  householdApplyOverrides(view, h);
  for (const d of view.days) { let t = emptyTotals(); for (const m of d.meals) { const r = m.recipe ? uiState.recipesById.get(m.recipe) : null; if (r) t = addTotals(t, recipeTotals(r, uiState.foodsById).perServing); } d.totals = t; }
  // the first view after a build is frozen, so roster taps and day changes are applied to it rather than rebuilding it
  if (h.built && !h.week_snapshot) { householdSaveSnapshot(h, view); uiPersist(); }
  return view;
}

function householdApplySnapshot(week, h) {
  const snap = h.week_snapshot;
  if (!snap || snap.start !== week.days[0].date || snap.seed !== (h.seed || 0)) { if (snap) h.week_snapshot = null; return; }
  const byDate = new Map(snap.days.map(d => [d.date, d]));
  for (const day of week.days) {
    const saved = byDate.get(day.date);
    if (!saved) continue;
    if (saved.canCook !== undefined) { day.canCook = saved.canCook; day.minutes = saved.minutes; day.overridden = saved.overridden; }
    day.meals = week.slots.map(slot => {
      const m = saved.meals.find(x => x.slot === slot) || day.meals.find(x => x.slot === slot) || { slot, recipe: null, source: 'none', eaters: [], names: [] };
      return { ...m };
    });
  }
}
function householdApplyOverrides(week, h) {
  for (const [k, recipeId] of Object.entries(h.meal_overrides || {})) {
    const [date, slot] = [k.slice(0, 10), k.slice(11)];
    const day = week.days.find(d => d.date === date);
    const meal = day && day.meals.find(m => m.slot === slot);
    const recipe = uiState.recipesById.get(recipeId);
    if (!meal || !recipe) continue;
    Object.assign(meal, { recipe: recipe.id, name: recipe.name, source: recipe.assembly_only ? 'assembly' : 'cook', servingsMade: Math.max(meal.servingsMade || 0, meal.servings || 1), reasons: ['you chose this'], swapped: true, check: meal.check || { verdict: 'pass', hits: [], exceeds: [] } });
  }
}
function householdSaveSnapshot(h, week) {
  h.week_snapshot = { start: week.days[0].date, seed: h.seed || 0, days: week.days.map(d => ({ date: d.date, canCook: d.canCook, minutes: d.minutes, overridden: d.overridden, meals: d.meals.map(m => ({ slot: m.slot, recipe: m.recipe, name: m.name, source: m.source, servings: m.servings, servingsMade: m.servingsMade, eaters: m.eaters, names: m.names, seating: m.seating, kidsOnly: m.kidsOnly, reasons: m.reasons, score: m.score, check: m.check, swapped: m.swapped, repicked: m.repicked })) })) };
}
function householdTouch(reason) {
  uiPersist();
  // the grocery change log for the household list picks the change up on its next render
  uiState.householdReason = reason;
}

// Meals whose current roster differs from the roster they were planned for.
function householdStale(week, h, people) {
  const out = [];
  week.days.forEach((d, di) => d.meals.forEach(m => {
    const now = rosterFor(h, people, d.date, d.day, m.slot).map(p => p.id).sort().join('+');
    const was = (m.eaters || []).slice().sort().join('+');
    if (now !== was) out.push({ di, slot: m.slot, date: d.date, day: d.day, now, was });
  }));
  return out;
}

// ---------- HTML ----------
export function householdHTML() {
  const h = householdState();
  householdPrune(h);
  const people = householdPeople();
  if (people.length < 2) return uiSection('The household week', uiEmptyState('Add a second person on the People screen and the household week appears here: who is at the table for each meal, one shared week, and one grocery list.'), { id: 'hh-h' });
  const cook = cookFor(h, people, householdStart());
  const slots = householdSlots(h);
  const dates = [...Array(7)].map((_, i) => { const [y, m, d] = householdStart().split('-').map(Number); return uiIsoDate(new Date(y, m - 1, d + i)); });
  const dayOf = date => DAYS[new Date(date + 'T00:00:00').getDay()];
  const built = !!h.built;
  const week = built ? householdWeekGet() : null;
  const stale = week ? householdStale(week, h, people) : [];
  const settings = `<div class="card">
    <div class="grid-2">
      <div class="field"><label for="hh-cook">Whose kitchen</label><select id="hh-cook">${people.filter(p => !p.guest).map(p => `<option value="${uiEsc(p.id)}" ${cook && cook.id === p.id ? 'selected' : ''}>${uiEsc(p.name)}${p.adult === false ? ' (child)' : ''}</option>`).join('')}</select><div class="hint">Their cooking time, days, skill, and equipment shape the week. Change a single day below.</div></div>
      <div class="field"><label for="hh-snacks">Snacks each day</label><select id="hh-snacks">${[0, 1, 2, 3].map(n => `<option value="${n}" ${(typeof h.snacks_per_day === 'number' ? h.snacks_per_day : 1) === n ? 'selected' : ''}>${n === 0 ? 'None' : n}</option>`).join('')}</select><div class="hint">A household setting. Each person's own week keeps its own snack rule.</div></div>
    </div>
    ${uiSwitch('hh-budget', 'Save money', 'Prefer recipes that reuse ingredients already on this week\'s list, across everyone\'s meals.', h.budget !== false)}
    <div class="btn-row"><button class="btn primary" type="button" id="hh-build">${uiIcon('calendar')}${built ? 'Rebuild the household week' : 'Plan the household week'}</button>${built ? `<button class="btn" type="button" id="hh-regen">${uiIcon('swap')}Regenerate</button><button class="btn" type="button" id="hh-grocery">${uiIcon('cart')}Household grocery list</button>` : ''}</div>
    <p class="small muted">The week starts today and rolls forward each day, like the Week screen. Everyone's allergens are absolute at every seating they attend. Snacks come from recipes tagged as snacks.</p>
  </div>`;
  const roster = `<div class="card">
    <p class="small muted">Tap a cell to mark someone in or out of that meal. Guests are out unless you tap them in. "Usual week" sets a person's standing pattern (say, out Tuesday and Thursday dinner) so you only fix exceptions here.</p>
    <div class="roster-people">${people.map(p => `<button class="btn small" type="button" data-pattern="${uiEsc(p.id)}">${uiAvatar(p.name, { tone: p.guest ? 'plum' : '' })} ${uiEsc(p.name)}: usual week</button>`).join('')}</div>
    <div class="roster-days">${dates.map(date => { const day = dayOf(date); const explicit = h.roster[date] && Object.keys(h.roster[date]).length; return `<section class="roster-day" aria-labelledby="rd-${date}">
      <div class="roster-day-head"><h3 id="rd-${date}">${HH_DAY_NAMES[day]} <span class="muted small">${uiFmtDate(date)}</span></h3>${explicit ? `<button class="btn link small" type="button" data-reset-day="${date}">Back to usual</button>` : ''}</div>
      <div class="table-wrap"><table class="roster-table"><thead><tr><th scope="col"></th>${people.map(p => `<th scope="col"><span class="roster-name">${uiEsc(p.name.split(' ')[0])}</span></th>`).join('')}</tr></thead>
      <tbody>${slots.map(slot => { const inIds = new Set(rosterFor(h, people, date, day, slot).map(p => p.id)); return `<tr><th scope="row">${HH_SLOT_SHORT[slot] || slot}</th>${people.map(p => `<td><button type="button" class="roster-btn ${inIds.has(p.id) ? 'on' : ''}" data-roster="${date}|${slot}|${uiEsc(p.id)}" aria-pressed="${inIds.has(p.id)}" aria-label="${uiEsc(p.name)} at ${HH_SLOT_SHORT[slot] || slot} on ${HH_DAY_NAMES[day]}">${inIds.has(p.id) ? uiIcon('check') : '<span aria-hidden="true">–</span>'}</button></td>`).join('')}</tr>`; }).join('')}</tbody></table></div>
    </section>`; }).join('')}</div>
  </div>`;
  let result = '';
  if (built && week) {
    const cookedCount = week.days.reduce((n, d) => n + d.meals.filter(m => m.recipe && m.source !== 'leftover').length, 0);
    result = `${stale.length ? uiNoticeHTML({ level: 'warn', text: `The roster changed for ${stale.length} meal${stale.length === 1 ? '' : 's'} since this week was planned. Those meals are still planned for the old eaters.` }) : ''}
    ${stale.length ? `<div class="btn-row"><button class="btn primary" type="button" id="hh-update">Update just those ${stale.length} meal${stale.length === 1 ? '' : 's'}</button><button class="btn" type="button" id="hh-build-2">Rebuild the whole week</button></div>` : ''}
    <p class="small muted">${week.seatings.length} different combination${week.seatings.length === 1 ? '' : 's'} of people this week, each planned to its own combined plan. ${cookedCount} meals to cook or put together${week.unmet.length ? `; ${week.unmet.length} slot${week.unmet.length === 1 ? '' : 's'} had nothing that fit everyone` : ''}. Tap a day's cooking chip or minutes to change that day only.</p>
    <div class="week-grid">${week.days.map((d, di) => householdDayHTML(d, di, people)).join('')}</div>
    <details class="card"><summary>Who was planned together</summary><ul class="small">${week.seatings.map(s => `<li><strong>${uiEsc(s.names.join(', '))}</strong>: ${uiFmtNum(s.eligible)} recipes clear everyone's rules${s.kidsOnly ? ' (children only: assembly meals, no cooking)' : ''}</li>`).join('')}</ul></details>`;
  }
  return `${uiSection('The household week', settings, { id: 'hh-h' })}
    ${uiSection("Who's at the table", roster, { id: 'hh-roster-h' })}
    ${built ? uiSection('Meals for the household', result, { id: 'hh-meals-h' }) : ''}`;
}

function householdDayHTML(d, di, people) {
  const isToday = d.date === householdStart();
  const [, mo, da] = d.date.split('-');
  const byId = id => people.find(p => p.id === id);
  return `<section class="week-day ${isToday ? 'today' : ''}" aria-labelledby="hd-${di}">
    <div class="week-day-head">
      <div class="week-day-name"><span id="hd-${di}">${HH_DAY_NAMES[d.day]}</span><span class="week-day-date">${Number(mo)}/${Number(da)}${isToday ? ' · today' : ''}</span></div>
      <div class="week-day-meta">${uiChip(d.canCook ? 'can cook' : 'no cooking', d.canCook ? 'pass' : 'neutral', { button: true, attrs: `data-hh-cook="${di}" aria-pressed="${d.canCook}" title="Tap to switch cooking ${d.canCook ? 'off' : 'on'} for this ${HH_DAY_NAMES[d.day]} only"` })}
        <label class="week-minutes"><span class="visually-hidden">Minutes to cook on ${HH_DAY_NAMES[d.day]}</span><select data-hh-minutes="${di}">${(HH_MINUTES.includes(d.minutes) ? HH_MINUTES : HH_MINUTES.concat(d.minutes).sort((a, b) => a - b)).map(m => `<option value="${m}" ${m === d.minutes ? 'selected' : ''}>${m} min</option>`).join('')}</select></label>
        <span class="muted">${uiEsc(d.cookName || '')} cooks</span>${d.overridden ? '<span class="muted">· this week</span>' : ''}</div>
    </div>
    ${d.meals.map(m => `<div class="week-meal">
      <div class="slot">${SLOT_LABEL[m.slot] || m.slot}</div>
      <div class="eaters">${(m.eaters || []).length ? `<span class="avatar-stack" aria-hidden="true">${(m.eaters || []).map(id => { const p = byId(id); return p ? uiAvatar(p.name, { tone: p.guest ? 'plum' : '' }) : ''; }).join('')}</span><span class="small muted">${uiEsc((m.names || []).join(', '))}</span>` : '<span class="small muted">Nobody home</span>'}</div>
      ${m.recipe ? `<button type="button" class="meal-chip" data-hh-recipe="${di}:${uiEsc(m.slot)}" aria-label="${uiEsc(m.name)}, ${uiVerdictWord(m.check.verdict)}. Open recipe."><span class="dot ${m.check.verdict}" aria-hidden="true"></span><span class="meal-chip-text"><span class="meal-chip-name">${uiEsc(m.name)}</span><span class="meal-chip-sub"><span>${m.source === 'leftover' ? 'Leftovers' : m.source === 'assembly' ? 'Assembly' : 'Cook'} · ${m.servings} serving${m.servings === 1 ? '' : 's'}${m.servingsMade && m.servingsMade > m.servings ? `, make ${m.servingsMade}` : ''}${m.swapped ? ' · swapped' : ''}${m.repicked ? ' · re-picked' : ''}${m.kidsOnly ? ' · kids only' : ''}</span></span></span></button>
        ${m.check.hits && m.check.hits.length ? `<div class="meal-note">Caution: ${m.check.hits.map(x => uiEsc(x.label)).join(', ')}</div>` : ''}
        ${householdMisfitNote(m, d)}
        <div class="meal-acts"><button class="btn small icon" type="button" data-hh-swap="${di}:${uiEsc(m.slot)}" aria-label="Swap ${SLOT_LABEL[m.slot] || m.slot} on ${HH_DAY_NAMES[d.day]}" title="Swap">${uiIcon('swap')}</button></div>
        ${m.reasons && m.reasons.length ? `<details><summary>Why this</summary><ul class="small">${m.reasons.map(r => `<li>${uiEsc(r)}</li>`).join('')}</ul></details>` : ''}`
      : (m.eaters || []).length ? `<div class="muted small">Nothing fit everyone at this seating.</div><div class="meal-acts"><button class="btn small icon" type="button" data-hh-swap="${di}:${uiEsc(m.slot)}" aria-label="Pick a meal" title="Pick a meal">${uiIcon('swap')}</button></div>` : ''}
    </div>`).join('')}
  </section>`;
}
function householdMisfitNote(m, d) {
  if (!m.recipe || !d.overridden) return '';
  const f = mealFits(uiState.recipesById.get(m.recipe), m, { canCook: d.canCook, minutes: d.minutes, slot: m.slot });
  return f.fits ? '' : `<div class="meal-note">Kept by you, but it ${uiEsc(f.why)}.</div>`;
}

// ---------- bindings ----------
export function householdBind(root) {
  const h = householdState();
  const people = householdPeople();
  if (people.length < 2) return;
  const q = s => root.querySelector(s);
  const on = (sel, ev, fn) => { const el = q(sel); if (el) el.addEventListener(ev, fn); };
  const rebase = reason => { h.week_snapshot = null; h.meal_overrides = {}; uiState.householdCache = null; householdTouch(reason); uiState.rerender(); };
  on('#hh-cook', 'change', e => { h.cook = e.target.value; rebase('Changed the cook'); });
  on('#hh-snacks', 'change', e => { h.snacks_per_day = Number(e.target.value); rebase('Changed snacks'); });
  on('#hh-budget', 'change', e => { h.budget = e.target.checked; rebase('Save money'); });
  const build = () => { h.built = true; h.week_snapshot = null; h.meal_overrides = {}; uiState.householdCache = null; householdTouch('Planned the household week'); uiToast('Household week planned.'); uiState.rerender(); };
  on('#hh-build', 'click', build); on('#hh-build-2', 'click', build);
  on('#hh-regen', 'click', () => { h.seed = (h.seed || 0) + 1; h.week_snapshot = null; h.meal_overrides = {}; uiState.householdCache = null; householdTouch('Regenerated the household week'); uiToast('New household week generated.'); uiState.rerender(); });
  on('#hh-grocery', 'click', () => { uiState.profile.grocery_for = 'household'; uiPersist(); uiNavigate('#/grocery'); });
  root.querySelectorAll('[data-roster]').forEach(b => b.addEventListener('click', () => {
    const [date, slot, pid] = b.dataset.roster.split('|');
    const day = DAYS[new Date(date + 'T00:00:00').getDay()];
    const cur = rosterFor(h, people, date, day, slot).map(p => p.id);
    const next = cur.includes(pid) ? cur.filter(x => x !== pid) : cur.concat(pid);
    h.roster[date] = h.roster[date] || {};
    h.roster[date][slot] = next;
    householdTouch('Roster changed'); uiState.rerender();
  }));
  root.querySelectorAll('[data-reset-day]').forEach(b => b.addEventListener('click', () => { delete h.roster[b.dataset.resetDay]; householdTouch('Roster back to usual'); uiState.rerender(); }));
  root.querySelectorAll('[data-pattern]').forEach(b => b.addEventListener('click', () => householdPatternModal(people.find(p => p.id === b.dataset.pattern))));
  const week = h.built ? householdWeekGet() : null;
  if (!week) return;
  on('#hh-update', 'click', () => {
    const stale = householdStale(week, h, people);
    const byDay = new Map();
    for (const s of stale) byDay.set(s.di, (byDay.get(s.di) || []).concat(s.slot));
    let n = 0;
    for (const [di, slots] of byDay) {
      const { meals } = householdRepick({ week, di, slots, people, household: h, conditions: uiState.data.conditions, dictionaries: uiState.data.dictionaries, recipes: householdPool(people), foodsById: uiState.foodsById, matcher: uiState.matcher });
      week.days[di].meals = week.days[di].meals.map(m => meals.find(x => x.slot === m.slot) || m);
      for (const s of slots) delete h.meal_overrides[`${week.days[di].date}:${s}`];
      n += meals.length;
    }
    householdSaveSnapshot(h, week); householdTouch('Updated meals for the new roster');
    uiToast(`${n} meal${n === 1 ? '' : 's'} updated for who is home. Nothing else moved.`); uiState.rerender();
  });
  root.querySelectorAll('[data-hh-recipe]').forEach(b => b.addEventListener('click', () => {
    const [di, slot] = b.dataset.hhRecipe.split(':');
    const m = week.days[Number(di)].meals.find(x => x.slot === slot);
    const seating = week.seatings.find(s => s.key === m.seating) || week.seatings[0];
    weekRecipeModal(m.recipe, seating ? seating.person : householdPseudoPerson(), seating ? seating.plan : { limits: {}, targets: {}, avoid: {}, prefer: {}, modules: [], notices: [] });
  }));
  root.querySelectorAll('[data-hh-swap]').forEach(b => b.addEventListener('click', () => {
    const [di, slot] = b.dataset.hhSwap.split(':');
    householdSwapModal(h, people, week, Number(di), slot);
  }));
  root.querySelectorAll('[data-hh-cook]').forEach(b => b.addEventListener('click', () => {
    const di = Number(b.dataset.hhCook); const d = week.days[di];
    householdProposeDayChange(h, people, week, di, { can_cook: !d.canCook, minutes: d.minutes });
  }));
  root.querySelectorAll('[data-hh-minutes]').forEach(sel => sel.addEventListener('change', () => {
    const di = Number(sel.dataset.hhMinutes); const d = week.days[di];
    householdProposeDayChange(h, people, week, di, { can_cook: d.canCook, minutes: Number(sel.value) }, () => { sel.value = String(d.minutes); });
  }));
}

// A person's usual week: which meals they are normally at.
function householdPatternModal(person) {
  if (!person) return;
  const h = householdState();
  const slots = householdSlots(h);
  const pat = h.pattern[person.id] || {};
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const isIn = (day, slot) => person.guest ? !!(pat[day] && pat[day][slot] === true) : !(pat[day] && pat[day][slot] === false);
  const m = uiModal(`
    <p class="small muted">${person.guest ? `${uiEsc(person.name)} is a guest, so they are out unless ticked.` : `Untick the meals ${uiEsc(person.name)} is usually away for. Days you have already changed by hand keep those changes.`}</p>
    <div class="table-wrap"><table class="roster-table"><thead><tr><th scope="col"></th>${days.map(d => `<th scope="col">${HH_DAY_SHORT[d]}</th>`).join('')}</tr></thead>
    <tbody>${slots.map(slot => `<tr><th scope="row">${HH_SLOT_SHORT[slot] || slot}</th>${days.map(d => `<td><button type="button" class="roster-btn ${isIn(d, slot) ? 'on' : ''}" data-pat="${d}|${slot}" aria-pressed="${isIn(d, slot)}" aria-label="${HH_DAY_NAMES[d]} ${HH_SLOT_SHORT[slot] || slot}">${isIn(d, slot) ? uiIcon('check') : '<span aria-hidden="true">–</span>'}</button></td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <div class="btn-row" style="margin-top:12px"><button class="btn primary" type="button" id="pat-save">Save</button><button class="btn" type="button" id="pat-all">${person.guest ? 'In for everything' : 'Back to always in'}</button></div>`, { title: `${person.name}: usual week` });
  if (!m) return;
  const state = {};
  for (const d of days) for (const s of slots) state[`${d}|${s}`] = isIn(d, s);
  m.el.querySelectorAll('[data-pat]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.pat; state[k] = !state[k]; b.classList.toggle('on', state[k]); b.setAttribute('aria-pressed', String(state[k])); b.innerHTML = state[k] ? uiIcon('check') : '<span aria-hidden="true">–</span>'; }));
  m.el.querySelector('#pat-all').addEventListener('click', () => { for (const k of Object.keys(state)) state[k] = true; m.el.querySelectorAll('[data-pat]').forEach(b => { b.classList.add('on'); b.setAttribute('aria-pressed', 'true'); b.innerHTML = uiIcon('check'); }); });
  m.el.querySelector('#pat-save').addEventListener('click', () => {
    const next = {};
    for (const d of days) for (const s of slots) {
      const v = state[`${d}|${s}`];
      if (person.guest ? v : !v) { next[d] = next[d] || {}; next[d][s] = person.guest ? true : false; }
    }
    // guests: the pattern lists the meals they are in; rosterFor treats guests as out unless explicitly rostered, so write per-date rosters for the coming week too
    if (person.guest) {
      const start = householdStart();
      for (let i = 0; i < 7; i++) {
        const [y, mo, da] = start.split('-').map(Number); const date = uiIsoDate(new Date(y, mo - 1, da + i)); const day = DAYS[new Date(date + 'T00:00:00').getDay()];
        for (const s of slots) {
          const want = !!(next[day] && next[day][s]);
          const cur = rosterFor(h, householdPeople(), date, day, s).map(p => p.id);
          const has = cur.includes(person.id);
          if (want !== has) { h.roster[date] = h.roster[date] || {}; h.roster[date][s] = want ? cur.concat(person.id) : cur.filter(x => x !== person.id); }
        }
      }
    }
    if (Object.keys(next).length) h.pattern[person.id] = next; else delete h.pattern[person.id];
    householdTouch(`${person.name}'s usual week changed`); m.close(); uiToast(`Saved ${person.name}'s usual week.`); uiState.rerender();
  });
}

// Recipes for a household: the base pool plus adapted copies for every diet family any eater's plan restricts.
function householdPool(people) {
  try { return uiState.recipesForPlans ? uiState.recipesForPlans(people.map(p => uiPlanFor(p))) : uiState.data.recipes; } catch { return uiState.data.recipes; }
}
function householdSwapModal(h, people, week, di, slot) {
  const day = week.days[di];
  const current = day.meals.find(m => m.slot === slot);
  const { eaters, rows } = householdCandidates({ week, di, slot, people, household: h, recipes: householdPool(people), foodsById: uiState.foodsById, n: 6, exclude: current && current.recipe });
  const m = uiModal(`
    <p class="small muted">Top alternatives for ${SLOT_LABEL[slot] || slot} on ${HH_DAY_NAMES[day.day]} for ${uiEsc(eaters.map(p => p.name).join(', ') || 'nobody')}, scored the way the planner scores them. Only recipes that pass every eater's checks are listed.</p>
    ${rows.length ? `<div class="list">${rows.map(x => `<div class="list-row"><div class="list-main">
      <div class="list-title"><span class="dot ${x.check.verdict}" aria-hidden="true"></span>${uiEsc(x.r.name)} ${uiVerdictChip(x.check.verdict)}</div>
      <div class="list-sub">${x.r.active_min} min active, ${x.r.total_min} total, ${uiEsc(x.r.skill)}${x.r.assembly_only ? ', assembly only' : ''} · score ${Math.round(x.score)}</div>
      ${x.reasons.length ? `<ul class="small">${x.reasons.map(r => `<li>${uiEsc(r)}</li>`).join('')}</ul>` : ''}
      <div class="btn-row" style="margin-top:8px"><button class="btn small primary" type="button" data-pick="${uiEsc(x.r.id)}">Use this</button></div>
    </div></div>`).join('')}</div>` : uiEmptyState('No alternative fits everyone at this seating.')}`, { title: 'Swap meal' });
  if (!m) return;
  m.el.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
    h.meal_overrides[`${day.date}:${slot}`] = b.dataset.pick;
    if (!h.week_snapshot) householdSaveSnapshot(h, week);
    householdTouch(`Swapped ${HH_DAY_NAMES[day.day]} ${SLOT_LABEL[slot] || slot}`);
    m.close(); uiToast('Meal swapped.'); uiState.rerender();
  }));
}

// A day's cooking change for the household week, this week only, with the same three choices as the Week screen.
function householdProposeDayChange(h, people, week, di, patch, revert) {
  const day = week.days[di];
  const name = HH_DAY_NAMES[day.day];
  const next = { canCook: patch.can_cook, minutes: patch.minutes };
  const misfits = day.meals.filter(m => m.recipe && !mealFits(uiState.recipesById.get(m.recipe), m, { ...next, slot: m.slot }).fits);
  const words = `${name}: ${next.canCook ? 'cooking on' : 'no cooking'}, ${next.minutes} minutes`;
  const store = () => { h.day_overrides[day.date] = { can_cook: next.canCook, minutes: next.minutes }; };
  const applyDay = () => { day.canCook = next.canCook; day.minutes = next.minutes; day.overridden = true; };
  if (!misfits.length) { store(); applyDay(); householdSaveSnapshot(h, week); householdTouch(words); uiToast(`${words}, this week only. Every meal still fits, so nothing moved.`); uiState.rerender(); return; }
  const picked = householdRepick({ week, di, slots: misfits.map(m => m.slot), people, household: h, conditions: uiState.data.conditions, dictionaries: uiState.data.dictionaries, recipes: householdPool(people), foodsById: uiState.foodsById, matcher: uiState.matcher, canCook: next.canCook, minutes: next.minutes });
  const afterMeals = day.meals.map(m => picked.meals.find(p => p.slot === m.slot) || m);
  let acted = false;
  const m = uiModal(`
    <p><strong>${uiEsc(words)}</strong>, this week only. ${uiEsc(day.cookName || 'The cook')}'s usual pattern is not changed.</p>
    <p>${misfits.length === 1 ? 'One meal' : `${misfits.length} meals`} on ${uiEsc(name)} no longer fit${misfits.length === 1 ? 's' : ''}:</p>
    <ul>${misfits.map(x => `<li><strong>${uiEsc(SLOT_LABEL[x.slot] || x.slot)}</strong> (${uiEsc((x.names || []).join(', '))}): ${uiEsc(x.name)}. ${uiEsc(mealFits(uiState.recipesById.get(x.recipe), x, { ...next, slot: x.slot }).why)}.</li>`).join('')}</ul>
    <div class="card tight"><p><strong>If you re-pick just these:</strong></p><ul>${picked.meals.map(p => `<li><strong>${uiEsc(SLOT_LABEL[p.slot] || p.slot)}:</strong> ${p.recipe ? uiEsc(p.name) : 'nothing fits this seating'}</li>`).join('')}</ul></div>
    <div class="btn-row" style="margin-top:12px"><button class="btn primary" type="button" id="hd-repick">Re-pick just this day</button><button class="btn" type="button" id="hd-regen">Regenerate the whole week</button><button class="btn" type="button" id="hd-keep">Keep everything as is</button></div>`, { title: `Change ${name}`, onClose: () => { if (!acted && revert) revert(); } });
  if (!m) return;
  m.el.querySelector('#hd-repick').addEventListener('click', () => { acted = true; store(); applyDay(); day.meals = afterMeals; for (const x of misfits) delete h.meal_overrides[`${day.date}:${x.slot}`]; householdSaveSnapshot(h, week); householdTouch(`${words}: re-picked`); m.close(); uiToast(`${name} updated; nothing else moved.`); uiState.rerender(); });
  m.el.querySelector('#hd-regen').addEventListener('click', () => { acted = true; store(); h.week_snapshot = null; householdTouch(`${words}: regenerated`); m.close(); uiToast(`Household week regenerated around ${name}.`); uiState.rerender(); });
  m.el.querySelector('#hd-keep').addEventListener('click', () => { acted = true; store(); applyDay(); householdSaveSnapshot(h, week); householdTouch(`${words} (meals kept)`); m.close(); uiToast(`${words}. Meals kept as they were.`); uiState.rerender(); });
}

// Grocery list for the household week (used by the Grocery screen when "List for: Household" is chosen).
export function householdGroceryWeek() { return householdWeekGet(); }
export function householdBuildList(week) { return buildGroceryList(week, uiState.recipesById, uiState.foodsById); }
