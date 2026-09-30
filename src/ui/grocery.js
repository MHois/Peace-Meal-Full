// Grocery: list from the current week, grouped by food group, with eaters per day, shopper edits (quantity, grams, note,
// remove), a change log that records every difference and why, copy and share, and a calendar (.ics) export of the week's meals.
import { buildGroceryList, applyAdjustments, diffGrocery, groceryText } from '../engine/grocery.js';
import { uiState, uiEsc, uiActivePerson, uiPlanFor, uiWeekKey, uiFmtDate, uiFmtNum, uiToast, uiCopyText, uiPersist, uiIsoDate, uiToday, uiDownload, uiPageHeader, uiSection, uiChip, uiIcon, uiNoticeHTML, uiEmptyState } from './common.js';
import { weekGet } from './week.js';
import { householdWeekGet, householdPseudoPerson } from './household.js';

const GROCERY_DAY_NAMES = { sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday' };
const GROCERY_SLOT_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };
function groceryStorageKey(person) { return 'sn-grocery:' + uiWeekKey(person); }
function groceryLoadChecked(person) {
  try { return new Set(JSON.parse(localStorage.getItem(groceryStorageKey(person)) || '[]')); } catch { return new Set(); }
}
function grocerySaveChecked(person, set) {
  try { localStorage.setItem(groceryStorageKey(person), JSON.stringify([...set])); } catch { /* ignore */ }
}

function grocerySodiumFlag(item) {
  const name = (item.name + ' ' + (item.displays || []).join(' ')).toLowerCase();
  const tags = item.tags || [];
  return /canned|rotisserie|\bcan\b|brine|cured|deli|broth|bouillon|stock\b/.test(name) || tags.some(t => /canned|rotisserie|processed-meat|deli-meat/.test(t));
}

// Adjustments and the change log are keyed by person and week start (not by plan seed), so a regenerated week
// keeps the shopper's edits and the log records the regeneration as a change.
export function groceryWeekKey(person) { return `${person.id}|${uiIsoDate(uiToday())}`; }

export function groceryStore(person) {
  const p = uiState.profile;
  if (!p.grocery_adjustments || typeof p.grocery_adjustments !== 'object') p.grocery_adjustments = {};
  if (!p.grocery_changes || typeof p.grocery_changes !== 'object') p.grocery_changes = {};
  if (!p.grocery_snapshots || typeof p.grocery_snapshots !== 'object') p.grocery_snapshots = {};
  const key = groceryWeekKey(person);
  p.grocery_adjustments[key] = p.grocery_adjustments[key] || {};
  p.grocery_changes[key] = p.grocery_changes[key] || [];
  return { key, adjustments: p.grocery_adjustments[key], changes: p.grocery_changes[key], snapshots: p.grocery_snapshots };
}

// Recomputes the list from the current week and appends any difference from the last snapshot to the change log.
// Call after anything that can change the week (regenerate, swap, eaters). Returns { week, base }.
// The Grocery screen shops for the active person's week, or for the household week when "List for" says so.
export function groceryTarget() {
  const p = uiState.profile;
  if (p.grocery_for === 'household' && p.people.length > 1 && p.household && p.household.built) return householdPseudoPerson();
  return uiActivePerson();
}
function groceryWeekFor(person) { return person.id === 'household' ? householdWeekGet() : weekGet(person, uiPlanFor(person)); }

export function grocerySyncChanges(person, reason = 'Plan changed') {
  if (!uiState.data.recipes.length) return null;
  const week = groceryWeekFor(person);
  if (!week) return null;
  const base = buildGroceryList(week, uiState.recipesById, uiState.foodsById);
  // Display-only ingredient lines (imported recipes not yet linked to foods) carry no food id; the app cannot put them on a list.
  base.items = base.items.filter(i => i.food && i.food !== 'undefined');
  base.groups = {};
  for (const it of base.items) (base.groups[it.group] ||= []).push(it);
  const { key, changes, snapshots } = groceryStore(person);
  const prev = snapshots[key];
  let dirty = !prev;
  if (prev) {
    const diff = diffGrocery(prev, base, reason);
    if (diff.length) { for (const c of diff) changes.push({ ...c, at: new Date().toISOString() }); dirty = true; }
  }
  if (dirty) {
    snapshots[key] = { items: base.items.map(i => ({ food: i.food, name: i.name, grams: i.grams, quantity: i.quantity })) };
    uiPersist();
  }
  return { week, base };
}

// Writes the number of eaters for a date, logs the change with a plain reason, and returns the reason.
export function grocerySetEaters(person, dateKey, n, weekday) {
  const week = uiState.data.recipes.length ? weekGet(person, uiPlanFor(person)) : null;
  const day = week ? week.days.find(d => d.date === dateKey) : null;
  const before = day ? day.eaters : Math.max(1, Number((person.cooking || {}).household) || 1);
  const after = Math.max(1, Math.min(20, Math.round(Number(n) || 1)));
  if (after === before) return null;
  person.servings_by_day = person.servings_by_day || {};
  const household = Math.max(1, Number((person.cooking || {}).household) || 1);
  if (after === household) delete person.servings_by_day[dateKey]; else person.servings_by_day[dateKey] = after;
  const name = GROCERY_DAY_NAMES[weekday || (day && day.day)] || uiFmtDate(dateKey);
  const d = after - before;
  const reason = d > 0 ? `Added ${d} eater${d === 1 ? '' : 's'} on ${name}` : `Removed ${-d} eater${d === -1 ? '' : 's'} on ${name}`;
  uiPersist();
  grocerySyncChanges(person, reason);
  return reason;
}

// Adds an ingredient that is not on the computed list (for example from a pantry search) as an extra line.
export function groceryAddExtra(person, { food, grams, quantity, note, use }) {
  const { adjustments, changes } = groceryStore(person);
  const f = uiState.foodsById.get(food);
  const name = f ? (f.short || f.name) : food;
  const cur = adjustments[food];
  if (cur && cur.extra) {
    cur.grams = (Number(cur.grams) || 0) + (Number(grams) || 0);
    cur.quantity = `${uiFmtNum(cur.grams)} g`;
    cur.uses = [...new Set([...(cur.uses || []), use].filter(Boolean))];
    cur.removed = false;
    changes.push({ food, name, type: 'changed', from: null, to: cur.quantity, reason: note || 'Added by you', at: new Date().toISOString() });
  } else if (cur) {
    cur.removed = false;
    changes.push({ food, name, type: 'added', from: null, to: cur.quantity || quantity, reason: note || 'Added by you', at: new Date().toISOString() });
  } else {
    adjustments[food] = { extra: true, grams: Number(grams) || 0, quantity: quantity || `${uiFmtNum(grams)} g`, note: note || '', uses: use ? [use] : [] };
    changes.push({ food, name, type: 'added', from: null, to: adjustments[food].quantity, reason: note || 'Added by you', at: new Date().toISOString() });
  }
  uiPersist();
}

// The list as the shopper sees it: computed, then adjusted, then extras appended.
export function groceryComputeList(person, reason = 'Plan changed') {
  const synced = grocerySyncChanges(person, reason);
  if (!synced) return null;
  const { adjustments } = groceryStore(person);
  const adjusted = applyAdjustments(synced.base, adjustments);
  const have = new Set(adjusted.items.map(i => i.food));
  for (const [food, adj] of Object.entries(adjustments)) {
    if (!adj.extra || have.has(food)) continue;
    const f = uiState.foodsById.get(food);
    adjusted.items.push({ food, name: f ? (f.short || f.name) : food, group: f ? f.group : 'Other', grams: adj.grams, quantity: adj.quantity, uses: adj.uses || [], displays: [], tags: f ? f.tags : [], note: adj.note || '', removed: !!adj.removed, adjusted: true, extra: true });
  }
  adjusted.items.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  const groups = {};
  for (const it of adjusted.items) (groups[it.group] ||= []).push(it);
  adjusted.groups = groups;
  return { week: synced.week, base: synced.base, list: adjusted };
}

function groceryIcsEscape(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }

// One all-day VEVENT per day with the day's meals. Google Calendar, Apple Calendar, Outlook, and Skylight import .ics files.
export function groceryIcsForWeek(week, person, opts = {}) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const days = opts.days || week.days;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Peace Meal//Meals//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const d of days) {
    const meals = d.meals.filter(m => m.recipe);
    if (!meals.length) continue;
    const start = d.date.replace(/-/g, '');
    const [y, mo, da] = d.date.split('-').map(Number);
    const next = uiIsoDate(new Date(y, mo - 1, da + 1)).replace(/-/g, '');
    const slots = meals.map(m => GROCERY_SLOT_LABEL[m.slot] ? GROCERY_SLOT_LABEL[m.slot].toLowerCase() : m.slot).join(', ');
    const desc = meals.map(m => `${GROCERY_SLOT_LABEL[m.slot] || m.slot}: ${m.name}${m.source === 'leftover' ? ' (leftovers)' : ''}${m.servings ? `, ${m.servings} serving${m.servings === 1 ? '' : 's'}` : ''}`).join('\n');
    lines.push('BEGIN:VEVENT', `UID:${start}-${(opts.uidTag || person.id)}@peace-meal`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${next}`, `SUMMARY:${groceryIcsEscape('Meals: ' + slots)}`, `DESCRIPTION:${groceryIcsEscape(desc)}`, 'TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

function groceryChangeWord(t) { return t === 'added' ? 'Added' : t === 'removed' ? 'Removed' : 'Changed'; }

export function renderGroceryScreen(root) {
  const person = groceryTarget();
  const isHousehold = person.id === 'household';
  const plan = isHousehold ? null : uiPlanFor(person);
  if (!uiState.data.recipes.length) {
    root.innerHTML = `${uiPageHeader('Grocery')}${uiEmptyState('No recipes are loaded, so there is no week to shop for.', '', 'list')}`;
    return;
  }
  const computed = groceryComputeList(person, uiState.householdReason || 'Plan changed');
  uiState.householdReason = null;
  if (!computed) { root.innerHTML = `${uiPageHeader('Grocery')}${uiEmptyState('The household week has not been planned yet.', '<a class="btn small" href="#/together">Open Together</a>', 'list')}`; return; }
  const { week, list } = computed;
  const canHousehold = uiState.profile.people.length > 1 && uiState.profile.household && uiState.profile.household.built;
  const forSelect = `<label class="visually-hidden" for="grocery-for">List for</label><select id="grocery-for" style="width:auto">${uiState.profile.people.map(p => `<option value="${uiEsc(p.id)}" ${!isHousehold && p.id === person.id ? 'selected' : ''}>${uiEsc(p.name)}'s week</option>`).join('')}${canHousehold ? `<option value="household" ${isHousehold ? 'selected' : ''}>Household week</option>` : ''}</select>`;
  const { adjustments, changes } = groceryStore(person);
  const checked = groceryLoadChecked(person);
  const groups = Object.entries(list.groups);
  const active = list.items.filter(i => !i.removed);
  const sodiumItems = active.filter(grocerySodiumFlag);
  const household = Math.max(1, Number((person.cooking || {}).household) || 1);
  const sodiumMatters = isHousehold ? uiState.profile.people.some(p => { const pl = uiPlanFor(p); return !!(pl.limits.sodium_mg || pl.modules.some(m => /hypertension|heart-failure|ckd|kidney/.test(m.id))); }) : !!(plan.limits.sodium_mg || plan.modules.some(m => /hypertension|heart-failure|ckd|kidney/.test(m.id)));
  const seatCount = isHousehold ? week.days.reduce((n, d) => n + d.meals.filter(m => m.recipe).length, 0) : 0;
  root.innerHTML = `
    ${uiPageHeader('Grocery', `Week starting ${uiFmtDate(week.days[0].date)}: ${active.length} items across ${groups.length} store sections. Quantities are summed from recipe grams for the servings you will make. Ticks are remembered on this device for this week.`, forSelect)}
    ${isHousehold ? uiSection('Cooking for', `<p class="small muted">The household week: ${seatCount} seatings, each scaled to who is at the table. Change who is home on the <a href="#/together">Together</a> screen and this list follows.</p>`, { id: 'grocery-eaters-h' }) : uiSection('Cooking for', `<p class="small muted">Household: ${household}. Change the number of eaters for any day (guests, someone away) and the week and list update; the change is logged below.</p>
      <div class="grocery-days">${week.days.map(d => `<label>${uiEsc(uiFmtDate(d.date))}<input type="number" inputmode="numeric" min="1" max="20" value="${d.eaters}" data-eaters="${uiEsc(d.date)}" data-day="${uiEsc(d.day)}" aria-label="Eaters on ${uiEsc(uiFmtDate(d.date))}"></label>`).join('')}</div>`, { id: 'grocery-eaters-h' })}
    ${sodiumItems.length && sodiumMatters ? uiNoticeHTML({ level: 'warn', text: `Sodium: ${sodiumItems.map(i => i.name).join(', ')} can carry a lot of salt. Canned goods, broths, and rotisserie chicken are the usual traps. Choose no-salt-added or low-sodium versions and rinse canned beans and vegetables. The plan counts the USDA value for the food as listed.` }) : sodiumItems.length ? `<p class="small muted">Sodium note: ${sodiumItems.map(i => uiEsc(i.name)).join(', ')} tend to be salty. Low-sodium versions exist for most.</p>` : ''}
    ${groups.length ? `<div class="stack-2">${groups.map(([g, items]) => `<section class="grocery-group" aria-labelledby="g-${uiEsc(g).replace(/\W+/g, '-')}">
      <div class="grocery-group-head"><h3 id="g-${uiEsc(g).replace(/\W+/g, '-')}">${uiEsc(g)}</h3><span class="count">${items.filter(i => !i.removed).length} item${items.filter(i => !i.removed).length === 1 ? '' : 's'}</span></div>
      ${items.map(it => `<div class="grocery-line ${it.removed ? 'removed' : ''}">
        <div class="grocery-row">
          <label class="grocery-item ${checked.has(it.food) ? 'checked' : ''}"><input type="checkbox" data-food="${uiEsc(it.food)}" ${checked.has(it.food) ? 'checked' : ''} ${it.removed ? 'disabled' : ''}><span class="g-body"><span class="g-name">${uiEsc(it.name)}</span> <span class="g-qty num">· ${uiEsc(it.quantity)}</span>${it.removed ? ' ' + uiChip('removed', 'neutral') : ''}<br><span class="g-uses">For: ${(it.uses || []).map(uiEsc).join(', ') || 'you'}${(it.displays || []).length ? ' · ' + it.displays.map(uiEsc).join('; ') : ''}</span>${it.adjusted && !it.removed ? `<span class="g-note">${uiIcon('edit', { label: 'Edited' })}<span>${it.note ? uiEsc(it.note) : 'Edited by you'}</span></span>` : it.note ? `<br><span class="small">${uiEsc(it.note)}</span>` : ''}</span></label>
          ${it.removed ? `<button class="btn small" type="button" data-restore="${uiEsc(it.food)}">Restore</button>` : `<button class="btn small icon" type="button" data-edit="${uiEsc(it.food)}" aria-expanded="false" aria-label="Edit ${uiEsc(it.name)}" title="Edit">${uiIcon('edit')}</button>`}
        </div>
        <div class="grocery-edit" hidden data-form="${uiEsc(it.food)}">
          <div class="field"><label for="ge-q-${uiEsc(it.food)}">Quantity (free text)</label><input id="ge-q-${uiEsc(it.food)}" type="text" value="${uiEsc(it.quantity)}" placeholder="1 can, 14 oz"></div>
          <div class="field"><label for="ge-g-${uiEsc(it.food)}">Grams</label><input id="ge-g-${uiEsc(it.food)}" type="number" inputmode="numeric" min="0" value="${uiEsc(it.grams)}"></div>
          <div class="field"><label for="ge-n-${uiEsc(it.food)}">Note or reason</label><input id="ge-n-${uiEsc(it.food)}" type="text" value="${uiEsc(it.note || '')}" placeholder="only 14 oz cans available"></div>
          <div class="btn-row" style="margin-top:8px"><button class="btn small primary" type="button" data-save="${uiEsc(it.food)}">Save</button><button class="btn small danger" type="button" data-remove="${uiEsc(it.food)}">Remove</button><button class="btn small" type="button" data-cancel="${uiEsc(it.food)}">Cancel</button></div>
        </div>
      </div>`).join('')}
    </section>`).join('')}</div>` : uiEmptyState('The week has no cooked meals, so the list is empty.', '<a class="btn small" href="#/week">Open the week</a>', 'list')}
    ${uiSection('Changes', changes.length ? `<ul class="grocery-changes">${changes.slice().reverse().map(c => `<li><span class="change-word">${groceryChangeWord(c.type)}</span>${uiEsc(c.name)}: ${c.type === 'added' ? `now ${uiEsc(c.to)}` : c.type === 'removed' ? `was ${uiEsc(c.from)}` : `was ${uiEsc(c.from || 'not on the list')}, now ${uiEsc(c.to)}`}. <span class="why">${uiEsc(c.reason)}</span></li>`).join('')}</ul>
        <div><button class="btn small" type="button" id="grocery-clear-changes">Clear the change log</button></div>` : '<p class="small muted">No changes yet this week. Regenerating, swapping a meal, changing eaters, or editing a line will be listed here with the reason.</p>', { id: 'grocery-changes-h' })}
    <div class="action-bar sticky"><button class="btn primary" type="button" id="grocery-copy">${uiIcon('copy')}Copy</button><button class="btn" type="button" id="grocery-share">${uiIcon('share')}Share</button><button class="btn" type="button" id="grocery-ics">${uiIcon('calendar')}Calendar</button></div>
    <p class="small muted">The .ics file puts each day's meals on your calendar as an all-day event; Google Calendar, Apple Calendar, and Skylight can import an .ics file. There is no direct Google Keep or Skylight list integration, so Share or Copy is the way to get the list into those apps.</p>
  `;
  root.querySelector('#grocery-for').addEventListener('change', e => {
    if (e.target.value === 'household') uiState.profile.grocery_for = 'household';
    else { uiState.profile.grocery_for = null; uiState.profile.activePerson = e.target.value; }
    uiPersist(); uiState.rerender();
  });
  root.querySelectorAll('[data-food]').forEach(inp => inp.addEventListener('change', () => {
    if (inp.checked) checked.add(inp.dataset.food); else checked.delete(inp.dataset.food);
    grocerySaveChecked(person, checked);
    inp.closest('.grocery-item').classList.toggle('checked', inp.checked);
  }));
  root.querySelectorAll('[data-eaters]').forEach(inp => inp.addEventListener('change', () => {
    const reason = grocerySetEaters(person, inp.dataset.eaters, inp.value, inp.dataset.day);
    if (reason) uiToast(reason + '.');
    uiState.rerender();
  }));
  root.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
    const form = root.querySelector(`[data-form="${b.dataset.edit}"]`);
    form.hidden = !form.hidden;
    b.setAttribute('aria-expanded', String(!form.hidden));
    if (!form.hidden) form.querySelector('input').focus();
  }));
  root.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', () => { root.querySelector(`[data-form="${b.dataset.cancel}"]`).hidden = true; }));
  root.querySelectorAll('[data-save]').forEach(b => b.addEventListener('click', () => {
    const food = b.dataset.save;
    const item = list.items.find(i => i.food === food);
    const q = root.querySelector(`#ge-q-${CSS.escape(food)}`).value.trim();
    const g = root.querySelector(`#ge-g-${CSS.escape(food)}`).value;
    const note = root.querySelector(`#ge-n-${CSS.escape(food)}`).value.trim();
    const prev = adjustments[food] || {};
    adjustments[food] = { ...prev, quantity: q || item.quantity, grams: g === '' ? item.grams : Number(g), note, removed: false };
    const from = item.original ? item.original.quantity : item.quantity;
    if ((q && q !== item.quantity) || (g !== '' && Number(g) !== item.grams) || note !== (item.note || '')) changes.push({ food, name: item.name, type: 'changed', from, to: adjustments[food].quantity, reason: note || 'Edited by you', at: new Date().toISOString() });
    uiPersist(); uiToast('Saved.'); uiState.rerender();
  }));
  root.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => {
    const food = b.dataset.remove;
    const item = list.items.find(i => i.food === food);
    const note = root.querySelector(`#ge-n-${CSS.escape(food)}`).value.trim();
    adjustments[food] = { ...(adjustments[food] || {}), note, removed: true };
    changes.push({ food, name: item.name, type: 'removed', from: item.quantity, to: null, reason: note || 'Removed by you', at: new Date().toISOString() });
    uiPersist(); uiToast(`Removed ${item.name}.`); uiState.rerender();
  }));
  root.querySelectorAll('[data-restore]').forEach(b => b.addEventListener('click', () => {
    const food = b.dataset.restore;
    const item = list.items.find(i => i.food === food);
    if (adjustments[food]) { adjustments[food].removed = false; if (!adjustments[food].extra && !adjustments[food].quantity && !adjustments[food].note) delete adjustments[food]; }
    changes.push({ food, name: item.name, type: 'added', from: null, to: item.quantity, reason: 'Restored by you', at: new Date().toISOString() });
    uiPersist(); uiToast(`Restored ${item.name}.`); uiState.rerender();
  }));
  const clear = root.querySelector('#grocery-clear-changes');
  if (clear) clear.addEventListener('click', () => { changes.length = 0; uiPersist(); uiState.rerender(); });
  const textOf = () => {
    const withChecks = { ...list, items: list.items.map(i => ({ ...i, checked: checked.has(i.food) })) };
    const groups2 = {};
    for (const it of withChecks.items) (groups2[it.group] ||= []).push(it);
    withChecks.groups = groups2;
    let text = groceryText(withChecks, { title: `Grocery list for ${person.name}, week of ${week.days[0].date}`, changes });
    if (sodiumItems.length) text += `\n\nSodium note: choose low-sodium or no-salt-added versions of ${sodiumItems.map(i => i.name).join(', ')}.`;
    return text;
  };
  root.querySelector('#grocery-copy').addEventListener('click', async () => {
    const ok = await uiCopyText(textOf());
    uiToast(ok ? 'List copied.' : 'Could not copy. Select the text and copy it by hand.');
  });
  root.querySelector('#grocery-share').addEventListener('click', async () => {
    const text = textOf();
    if (navigator.share) {
      try { await navigator.share({ title: `Grocery list, week of ${week.days[0].date}`, text }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    const ok = await uiCopyText(text);
    uiToast(ok ? 'Sharing is not available here, so the list was copied instead.' : 'Sharing and copying are not available here.');
  });
  root.querySelector('#grocery-ics').addEventListener('click', () => {
    const ok = uiDownload(`meals-${week.days[0].date}.ics`, groceryIcsForWeek(week, person), 'text/calendar');
    uiToast(ok ? 'Calendar file started. Import it into Google Calendar, Apple Calendar, or Skylight.' : 'Download blocked here.');
  });
}
