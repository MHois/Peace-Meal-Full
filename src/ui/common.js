// Shared UI state and helpers. Every screen module imports from here.
// Names are prefixed with "ui" so nothing collides when tools/bundle.mjs concatenates all modules into one scope.
import { save, storeState, releaseUnreadable } from '../store.js';
import { buildPlan, labelNutrient } from '../engine/plan.js';

export const uiState = {
  profile: null,
  data: { sources: [], conditions: [], dictionaries: { tags: {}, entries: [] }, foods: [], recipes: [] },
  conditionsMeta: { flags: {}, proposed_tags: [] },
  dataProblems: [],
  matcher: null,
  conditionsById: new Map(),
  sourcesById: new Map(),
  foodsById: new Map(),
  recipesById: new Map(),
  planCache: new Map(),
  weekCache: new Map(),
  route: { screen: 'home', parts: [] },
  sync: { db: null, identity: null, owner: null, isOwner: false, ready: false },
  rerender: () => {},
  version: '1.0.0'
};

export const UI_ALLERGENS = [
  { tag: 'allergen-milk', label: 'Milk' },
  { tag: 'allergen-egg', label: 'Egg' },
  { tag: 'allergen-fish', label: 'Fish' },
  { tag: 'allergen-crustacean', label: 'Crustacean shellfish' },
  { tag: 'allergen-tree-nut', label: 'Tree nuts', hint: 'Also covers coconut and chestnut, to be safe. FDA took them off its tree nut list in 2025; ask your allergist whether you can eat them.' },
  { tag: 'allergen-peanut', label: 'Peanuts' },
  { tag: 'allergen-wheat', label: 'Wheat' },
  { tag: 'allergen-soy', label: 'Soybeans' },
  { tag: 'allergen-sesame', label: 'Sesame' }
];

export function uiEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function uiToday() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
export function uiIsoDate(d = new Date()) {
  const x = d instanceof Date ? d : new Date(d);
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${x.getFullYear()}-${m}-${day}`;
}
export function uiFmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
export function uiFmtNum(v, digits = 0) {
  if (v == null || Number.isNaN(v)) return '';
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function uiPersist() {
  uiState.planCache.clear();
  uiState.weekCache.clear();
  const ok = save(uiState.profile);
  uiSaveStatus(ok);
  return ok;
}

// A failed save is shown, never swallowed (2026-09 audit). The alert stays until a save works again; Try again saves
// the same data, and Send a backup opens the share sheet (uiState.shareBackup, set by the app at start).
export function uiSaveStatus(ok) {
  if (typeof document === 'undefined') return;
  let bar = document.getElementById('save-alert');
  if (ok) { if (bar) bar.remove(); uiState.saveFailed = false; return; }
  uiState.saveFailed = true;
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'save-alert';
    bar.className = 'save-alert';
    bar.setAttribute('role', 'alert');
    document.body.appendChild(bar);
  }
  bar.innerHTML = `<div class="save-alert-body"><strong>Not saved.</strong> This device did not store your last change, so it will be lost when the app closes. Free up some storage space, then tap Try again. Sending a backup keeps a copy of everything.</div>
    <div class="btn-row"><button class="btn primary lite-big" type="button" data-save-retry>Try again</button><button class="btn lite-big" type="button" data-save-backup>Send a backup</button></div>`;
  bar.querySelector('[data-save-retry]').onclick = () => { if (uiPersist()) uiToast('Saved.'); };
  bar.querySelector('[data-save-backup]').onclick = () => { if (uiState.shareBackup) uiState.shareBackup(); };
}

// Hand a file to the person: the share sheet where there is one (the iPhone's "Save to Files"), else a download.
// Returns 'shared', 'saved', 'closed' (they closed the share sheet), or 'failed'.
export async function uiShareFile(filename, text, title) {
  try {
    if (typeof File === 'function' && typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
      const file = new File([text], filename, { type: 'application/json' });
      if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title }); return 'shared'; }
    }
  } catch (e) { if (e && e.name === 'AbortError') return 'closed'; }
  return uiDownload(filename, text) ? 'saved' : 'failed';
}

// P0-4 (fix pass of September 30, 2026): saved data that could not be read on this launch (store.js keeps a copy). The
// notice sits at the top of every screen until the person has saved the original as a file and chosen Start fresh, or,
// when the rest of the data was kept, OK.
export function uiUnreadableNoticeHTML() {
  const u = storeState.unreadable;
  if (!u || u.released) return '';
  const head = u.repaired ? 'Part of your saved data could not be read.' : 'Your saved data could not be read.';
  const what = u.repaired ? 'Everything else is here, and a copy of the original is kept on this device.'
    : u.copyFailed ? 'The app could not keep a copy of it, so it will not save anything new until you save the original as a file.'
      : 'A copy of it is kept on this device, and the app has started with nothing filled in.';
  const done = u.repaired || uiState.unreadableSaved;
  return `<div class="notice block unreadable-notice" id="unreadable-notice" role="alert">${uiIcon('stop', { cls: 'notice-icon' })}<div class="notice-head">${head}</div>
    <div class="notice-body"><p>${uiEsc(u.reason)} ${what} Save it as a file so it is not lost, and give it to whoever looks after this app.</p>
    <div class="btn-row"><button class="btn primary lite-big" type="button" data-unreadable-save>Save it as a file</button>${done ? `<button class="btn lite-big" type="button" data-unreadable-done>${u.repaired ? 'OK' : 'Start fresh'}</button>` : ''}</div></div></div>`;
}
export function uiBindUnreadableNotice(root) {
  const saveBtn = root.querySelector('[data-unreadable-save]');
  if (saveBtn) saveBtn.addEventListener('click', async () => {
    const u = storeState.unreadable;
    const r = await uiShareFile(`peace-meal-could-not-read-${String(u.at).slice(0, 10)}.json`, u.text, 'Peace Meal: saved data that could not be read');
    if (r === 'shared' || r === 'saved') { uiState.unreadableSaved = true; uiToast('Saved as a file.'); uiState.rerender(); }
    else if (r === 'failed') uiToast('The file could not be saved here. The copy is still kept on this device.');
  });
  const doneBtn = root.querySelector('[data-unreadable-done]');
  if (doneBtn) doneBtn.addEventListener('click', () => { releaseUnreadable(); uiPersist(); uiState.rerender(); });
}

// A removal the person can take back for ten seconds. Only the latest removal can be undone; a new one closes the old window.
export function uiUndoToast(msg, onUndo, ms = 10000) {
  if (typeof document === 'undefined') return;
  let t = document.getElementById('undo-toast');
  if (t && t._done) t._done(false);
  if (!t) {
    t = document.createElement('div');
    t.id = 'undo-toast';
    t.className = 'undo-toast';
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
  }
  t.innerHTML = `<span class="undo-msg">${uiEsc(msg)}</span><button class="btn lite-big" type="button">Undo</button>`;
  t.classList.add('show');
  let open = true;
  const done = undo => { if (!open) return; open = false; clearTimeout(timer); t.classList.remove('show'); t._done = null; if (undo) onUndo(); };
  const timer = setTimeout(() => done(false), ms);
  t._done = done;
  t.querySelector('button').onclick = () => done(true);
}

export function uiActivePerson() {
  const p = uiState.profile;
  if (!p || !p.people.length) return null;
  return p.people.find(x => x.id === p.activePerson) || p.people[0];
}
export function uiSetActive(id) {
  uiState.profile.activePerson = id;
  uiPersist();
}

export function uiPlanFor(person) {
  if (!person) return null;
  const key = person.id + '|' + JSON.stringify(person) + '|' + uiIsoDate();
  if (uiState.planCache.has(key)) return uiState.planCache.get(key);
  const plan = buildPlan({ person, conditions: uiState.data.conditions, dictionaries: uiState.data.dictionaries, today: uiToday() });
  uiState.planCache.clear();
  uiState.planCache.set(key, plan);
  return plan;
}

export function uiTagLabel(tag) {
  return uiState.matcher ? uiState.matcher.tagLabel(tag) : tag;
}

export function uiRatingBase(rating) {
  // "moderate-to-strong" is rated at its lower end for display: moderate.
  const r = String(rating || '').toLowerCase().trim();
  return r.split(/-to-|\s*\/\s*/)[0] || '';
}
export function uiRatingBadge(rating) {
  // Evidence chip: strong = pass, moderate = info, limited = caution, insufficient = muted, user-defined = plum.
  const r = String(rating || '').toLowerCase().trim();
  const base = uiRatingBase(r);
  if (base === 'user-defined') return uiUserDefinedBadge();
  const cls = base === 'strong' ? 'pass' : base === 'moderate' ? 'info' : base === 'limited' ? 'caution' : 'neutral';
  return `<span class="chip ${cls}">${uiEsc((r || 'unrated').replace(/-to-/g, ' to '))} evidence</span>`;
}

export function uiVerdictWord(v) {
  return v === 'fail' ? 'FAIL' : v === 'caution' ? 'CAUTION' : 'PASS';
}

export function uiSourcesHTML(sourceIds, ruleVerify = false) {
  const ids = sourceIds || [];
  if (!ids.length) return '<p class="small muted">No source listed.</p>';
  const items = ids.map(id => {
    const s = uiState.sourcesById.get(id);
    const verify = ruleVerify || (s && s.verify);
    const cite = s ? s.citation : `${id} (citation not found in sources.json)`;
    const url = s && /^https:\/\//.test(s.url || '') ? s.url : '';
    const citeHTML = url ? `<a href="${uiEsc(url)}" target="_blank" rel="noopener noreferrer">${uiEsc(cite)}</a>` : uiEsc(cite);
    const kind = url ? (/doi\.org/.test(url) ? 'article page' : /pubmed/.test(url) ? 'PubMed' : 'website') : '';
    return `<li>${citeHTML}${s && s.type ? ` <span class="muted">[${uiEsc(s.type)}${s.year ? ', ' + s.year : ''}]</span>` : ''}${kind ? ` <span class="muted small">(${kind})</span>` : ''}${verify ? ' <span class="chip caution">verify</span>' : ''}${s && s.verify_note ? `<div class="small muted">${uiEsc(s.verify_note)}</div>` : ''}</li>`;
  }).join('');
  return `<ol class="refs sources">${items}</ol>`;
}

export function uiSourcesDisclosure(sourceIds, ruleVerify = false) {
  const n = (sourceIds || []).length;
  return `<details><summary>Sources (${n})${ruleVerify ? ' <span class="chip caution">verify</span>' : ''}</summary>${uiSourcesHTML(sourceIds, ruleVerify)}</details>`;
}

// One rule as produced by plan.js (ruleRef shape): text, strength, tier, module, sources, verify.
export function uiRuleHTML(rule, opts = {}) {
  if (!rule) return '';
  const meta = [];
  if (rule.moduleName && !opts.hideModule) meta.push(`<span class="chip neutral">${uiEsc(rule.moduleName)}</span>`);
  if (rule.strength) meta.push(`<span class="chip ${rule.strength === 'must' ? 'stop' : rule.strength === 'should' ? 'info' : 'neutral'} outline">${uiEsc(rule.strength)}</span>`);
  meta.push(`<span class="chip neutral">tier ${uiEsc(rule.tier || 1)}</span>`);
  if (rule.clinician) meta.push('<span class="chip plum">doctor or dietitian</span>');
  if (rule.userAllergen) meta.push('<span class="chip stop">allergen</span>');
  if (rule.preference) meta.push('<span class="chip neutral">preference</span>');
  if (rule.tier2Pending) meta.push('<span class="chip caution">waiting for a number from your doctor or dietitian</span>');
  if (rule.needsWeight) meta.push('<span class="chip caution">needs weight</span>');
  if (rule.note) meta.push(`<span class="muted">${uiEsc(rule.note)}</span>`);
  const verify = !!rule.verify;
  return `<div class="rule">
    <div class="rule-text">${uiEsc(rule.text || rule.rule)}</div>
    <div class="rule-meta">${meta.join(' ')}</div>
    ${(rule.sources && rule.sources.length) || verify ? uiSourcesDisclosure(rule.sources, verify) : ''}
  </div>`;
}

export function uiRulesList(rules, opts = {}) {
  if (!rules || !rules.length) return '<p class="muted small">None.</p>';
  return rules.map(r => uiRuleHTML(r, opts)).join('');
}

export function uiNutrientLabel(n) { return labelNutrient(n); }

export function uiNoticeHTML(n, opts = {}) {
  const level = n.level || 'info';
  const head = level === 'block' ? 'Stop' : level === 'warn' ? 'Caution' : 'Info';
  const ack = n.ackKey && opts.person && !(opts.person.acknowledged || []).includes(n.ackKey)
    ? `<button class="btn small" type="button" data-ack="${uiEsc(n.ackKey)}">I understand</button>` : '';
  const confirm = n.confirmId && opts.person && !(opts.person.confirmations || []).includes(n.confirmId)
    ? `<label class="choice"><input type="checkbox" data-confirm="${uiEsc(n.confirmId)}"><span class="choice-body">I confirm this.</span></label>` : '';
  const icon = level === 'block' ? 'stop' : level === 'warn' ? 'alert' : 'info';
  const link = n.link ? `<a class="btn small" href="${uiEsc(n.link)}">${uiEsc(n.linkLabel || 'Open')}</a>` : '';
  // Suggestions carry an action (handled once, app-wide, in app.js) and a "Not now" that remembers the dismissal on the person.
  const action = n.action ? `<button class="btn small primary" type="button" data-notice-action="${uiEsc(n.action)}">${uiEsc(n.actionLabel || 'Do it')}</button>` : '';
  const dismiss = n.dismiss ? `<button class="btn small" type="button" data-notice-dismiss="${uiEsc(n.dismiss)}">Not now</button>` : '';
  const acts = action || dismiss ? `<div class="btn-row">${action}${dismiss}</div>` : '';
  return `<div class="notice ${level}" role="${level === 'block' ? 'alert' : 'status'}">${uiIcon(icon, { cls: 'notice-icon' })}<div class="notice-head">${head}</div><div class="notice-body"><div>${uiEsc(n.text)}</div>${ack}${confirm}${link}${acts}</div></div>`;
}

// Recipes the full single-file build reads only when needed (the Wikibooks Cookbook, 2026-09 audit; see appLoadDeferred
// in app.js). Screens that search recipes call this first. True when it read them now.
export function uiEnsureAllRecipes() {
  return !!(uiState.deferredRecipes && uiState.deferredRecipes() && uiState.loadDeferredRecipes && uiState.loadDeferredRecipes());
}
// Recipes not read yet, as { count, source }, or null.
export function uiDeferredRecipes() { return uiState.deferredRecipes ? uiState.deferredRecipes() : null; }

// Portions from an approved-food list (low FODMAP, 2026-09 audit): the small-serve caution when a meal has several, then
// each food the list allows only in a limited amount, with the list's own portion and note. '' when there is nothing.
export function uiPortionsHTML(check) {
  const notes = (check && check.portionNotes) || [];
  const stacked = (check && check.smallServe) || [];
  if (!notes.length && !stacked.length) return '';
  const cap = t => t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
  const lists = (uiState.data && uiState.data['diet-lists'] && uiState.data['diet-lists'].families) || {};
  const fams = [...new Set([...notes.map(n => n.family), ...stacked.map(x => x.family)])];
  const sources = [...new Set([...stacked.flatMap(x => x.sources || []), ...fams.flatMap(f => (lists[f] && lists[f].sources) || [])])];
  return `${stacked.map(x => uiNoticeHTML({ level: 'warn', text: `Several small serves in one meal: ${x.terms.join(', ')}. ${x.text}` })).join('')}
    <ul class="small portion-list">${notes.map(n => `<li><strong>${uiEsc(cap(n.term))}</strong>: ${uiEsc(n.portion)}${n.note ? `. ${uiEsc(cap(n.note))}` : ''}${n.labels && n.labels.length && n.labels[0].toLowerCase() !== n.term.toLowerCase() ? ` <span class="muted">(${uiEsc(n.labels.slice(0, 2).join('; '))})</span>` : ''}</li>`).join('')}</ul>
    <details class="small"><summary>Where the portions come from</summary><p class="small muted">From the ${uiEsc(fams.map(f => (lists[f] && lists[f].label) || f).join(' and '))} approved-food list. Portion thresholds published only in the Monash app are not reproduced.</p>${uiSourcesHTML(sources)}</details>`;
}

// Wires the "I understand" buttons and confirmation checkboxes that uiNoticeHTML renders.
export function uiBindNoticeActions(root, person) {
  root.querySelectorAll('[data-ack]').forEach(b => b.addEventListener('click', () => {
    person.acknowledged = person.acknowledged || [];
    if (!person.acknowledged.includes(b.dataset.ack)) person.acknowledged.push(b.dataset.ack);
    uiPersist(); uiState.rerender();
  }));
  root.querySelectorAll('[data-confirm]').forEach(c => c.addEventListener('change', () => {
    person.confirmations = person.confirmations || [];
    if (c.checked && !person.confirmations.includes(c.dataset.confirm)) person.confirmations.push(c.dataset.confirm);
    if (!c.checked) person.confirmations = person.confirmations.filter(x => x !== c.dataset.confirm);
    uiPersist(); uiToast('Confirmed.'); uiState.rerender();
  }));
}

// Fills in fields the engine expects that older profiles or store.newPerson may lack. Mutates and returns the person.
export function uiEnsurePerson(person) {
  if (!person) return person;
  if (!('height_cm' in person)) person.height_cm = null;
  if (!person.variants || typeof person.variants !== 'object') person.variants = {};
  if (!person.flags || typeof person.flags !== 'object') person.flags = {};
  if (!Array.isArray(person.optional_rules)) person.optional_rules = [];
  if (!person.rule_settings || typeof person.rule_settings !== 'object') person.rule_settings = {};
  if (!Array.isArray(person.confirmations)) person.confirmations = [];
  if (!Array.isArray(person.acknowledged)) person.acknowledged = [];
  if (!Array.isArray(person.allergens_other)) person.allergens_other = [];
  if (!person.preferences) person.preferences = { avoid_tags: [], avoid_terms: [], patterns: [] };
  person.preferences.avoid_tags = person.preferences.avoid_tags || [];
  person.preferences.avoid_terms = person.preferences.avoid_terms || [];
  person.preferences.patterns = person.preferences.patterns || [];
  if (!person.medications) person.medications = {};
  if (!person.tier2) person.tier2 = {};
  if (!person.phases) person.phases = {};
  if (!person.modes) person.modes = {};
  if (!person.screen) person.screen = { scoff: [false, false, false, false, false], positive: false, completed_at: null };
  if (!person.cooking) person.cooking = {};
  if (typeof person.planSeed !== 'number') person.planSeed = 0;
  return person;
}

export function uiToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(uiToast._t);
  uiToast._t = setTimeout(() => t.classList.remove('show'), 2400);
}

// A short yes/no pop-up layered over whatever sheet is open, so that sheet stays put. Resolves true only on the confirm button.
export function uiConfirmSheet({ title, text, confirm = 'Yes', cancel = 'Cancel' }) {
  return new Promise(resolve => {
    const root = document.getElementById('modal-root');
    if (!root) { resolve(false); return; }
    const layer = document.createElement('div');
    layer.className = 'modal-backdrop confirm-layer';
    layer.innerHTML = `<div class="modal confirm" role="alertdialog" aria-modal="true" aria-label="${uiEsc(title || 'Are you sure?')}"><div class="modal-head"><h2>${uiEsc(title || '')}</h2></div><div class="modal-body"><p>${uiEsc(text)}</p><div class="btn-row"><button class="btn primary" type="button" data-yes="1">${uiEsc(confirm)}</button><button class="btn" type="button" data-no="1">${uiEsc(cancel)}</button></div></div></div>`;
    const prev = document.activeElement;
    const done = v => { document.removeEventListener('keydown', onKey, true); layer.remove(); if (prev && prev.focus) prev.focus(); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
    layer.addEventListener('click', e => { if (e.target === layer) done(false); });
    layer.querySelector('[data-yes]').addEventListener('click', () => done(true));
    layer.querySelector('[data-no]').addEventListener('click', () => done(false));
    document.addEventListener('keydown', onKey, true);
    root.appendChild(layer);
    layer.querySelector('[data-no]').focus();
  });
}

export function uiModal(html, opts = {}) {
  const root = document.getElementById('modal-root');
  if (!root) return null;
  // Replacing an open sheet reuses its history entry instead of stacking another one.
  let inHistory = false;
  if (uiState.modalClose) { inHistory = !!uiState.modalInHistory; uiState.modalClose({ silent: true }); }
  root.innerHTML = `<div class="modal-backdrop" data-close="1"><div class="modal" role="dialog" aria-modal="true" aria-label="${uiEsc(opts.label || opts.title || 'Dialog')}"><div class="modal-grab" aria-hidden="true"></div><div class="modal-head">${uiBackButtonHTML('modal-back')}<h2>${uiEsc(opts.title || '')}</h2><button class="btn small icon" type="button" data-close="1" aria-label="Close">${uiIcon('close')}</button></div><div class="modal-body">${html}</div></div></div>`;
  const backdrop = root.firstElementChild;
  // A sheet is one step in the in-app history: the browser's Back closes it before the route changes.
  if (!inHistory) { try { history.pushState({ pmModal: true }, ''); inHistory = true; } catch { /* ignore */ } }
  uiState.modalInHistory = inHistory;
  const close = (o = {}) => {
    root.innerHTML = '';
    document.removeEventListener('keydown', onKey);
    if (uiState.modalClose === close) { uiState.modalClose = null; uiState.modalInHistory = false; }
    if (inHistory && !o.fromPop && !o.silent) { try { history.back(); } catch { /* ignore */ } }
    inHistory = false;
    if (opts.onClose) opts.onClose(o);
  };
  uiState.modalClose = close;
  const onKey = e => { if (e.key === 'Escape') close(); };
  // Close on the X button, or on a tap outside the sheet. A tap inside the sheet never closes it.
  backdrop.addEventListener('click', e => { const t = e.target.closest ? e.target.closest('[data-close]') : null; if (!t || !backdrop.contains(t)) return; if (t === backdrop && e.target !== backdrop) return; close(); });
  backdrop.querySelector('.modal-back').addEventListener('click', () => close());
  document.addEventListener('keydown', onKey);
  const first = backdrop.querySelector('.modal-body button, .modal-body input, .modal-body [tabindex]') || backdrop.querySelector('button');
  if (first) first.focus();
  return { close, el: backdrop.querySelector('.modal-body') };
}

// Browser Back with a sheet open closes the sheet (the pushState entry above) and goes no further.
if (typeof window !== 'undefined') window.addEventListener('popstate', () => { if (uiState.modalClose) uiState.modalClose({ fromPop: true }); });

export function uiCloseModal() {
  if (uiState.modalClose) { uiState.modalClose(); return; }
  const root = document.getElementById('modal-root');
  if (root) root.innerHTML = '';
}

export function uiNavigate(hash) {
  if (location.hash === hash) uiState.rerender();
  else location.hash = hash;
}

export function uiModuleName(id) {
  const m = uiState.conditionsById.get(id);
  return m ? m.name : id;
}

export function uiWeekKey(person) {
  return `${person.id}|${uiIsoDate(uiToday())}|${person.planSeed || 0}`;
}

export function uiSegmented(name, options, current, opts = {}) {
  // options: [{value,label}] ; renders radio pills
  return `<div class="seg" role="radiogroup" aria-label="${uiEsc(opts.label || name)}">${options.map(o => `<label class="${String(o.value) === String(current) ? 'on' : ''}"><input type="radio" name="${uiEsc(name)}" value="${uiEsc(o.value)}" ${String(o.value) === String(current) ? 'checked' : ''} data-seg="${uiEsc(name)}">${uiEsc(o.label)}</label>`).join('')}</div>`;
}

export function uiMultiPills(name, options, currentArr, opts = {}) {
  const cur = new Set(currentArr || []);
  return `<div class="seg" role="group" aria-label="${uiEsc(opts.label || name)}">${options.map(o => `<label class="${cur.has(o.value) ? 'on' : ''}"><input type="checkbox" name="${uiEsc(name)}" value="${uiEsc(o.value)}" ${cur.has(o.value) ? 'checked' : ''} data-multi="${uiEsc(name)}">${uiEsc(o.label)}</label>`).join('')}</div>`;
}

export function uiYesNo(name, value) {
  return uiSegmented(name, [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }], value === true ? 'yes' : value === false ? 'no' : '');
}

// Save a generated file. Inside the claude.ai artifact viewer, plain download links are inert, so the viewer's
// downloads capability is used when it resolves; everywhere else a normal download link is used.
export function uiDownload(filename, text, type = 'application/json') {
  try {
    if (window.claude && typeof window.claude.use === 'function') {
      window.claude.use('downloads').then(dl => {
        if (dl && typeof dl.save === 'function') return dl.save({ filename, data: text }).catch(() => {});
        uiDownloadLink(filename, text, type);
      }).catch(() => uiDownloadLink(filename, text, type));
      return true;
    }
    return uiDownloadLink(filename, text, type);
  } catch { return false; }
}

function uiDownloadLink(filename, text, type) {
  try {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch { return false; }
}

export async function uiCopyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

export function uiPctClass(pct, kind) {
  if (kind === 'limit') return pct > 100 ? 'over' : 'ok';
  return pct < 100 ? 'under' : 'ok';
}

export function uiFindPersonById(id) {
  return (uiState.profile.people || []).find(p => p.id === id) || null;
}

export function uiParamUnit(param) {
  const p = String(param || '');
  if (/^pediatric/.test(p)) return '';
  const perKg = /per_kg/.test(p);
  const m = /(kcal|_mg|_g|_ug|_iu|_ml)/.exec(p.replace(/^kcal/, 'kcal'));
  const unit = /^kcal/.test(p) ? 'kcal' : m ? { _mg: 'mg', _g: 'g', _ug: 'mcg', _iu: 'IU', _ml: 'mL' }[m[1]] || '' : '';
  if (!unit) return perKg ? 'per kg per day' : '';
  return perKg ? `${unit} per kg per day` : `${unit} per day`;
}

export function uiMinutesBucket(min) {
  const m = Number(min) || 0;
  if (m < 10) return 8;
  if (m < 20) return 15;
  if (m < 40) return 30;
  return 50;
}

// ---- Wave 2 additions (new helpers only; nothing above is changed) ----

// Article for a module from data/articles.json, or null when none is loaded.
export function uiArticleFor(moduleId) {
  const a = uiState.data && uiState.data.articles;
  return a && typeof a === 'object' && a[moduleId] && typeof a[moduleId] === 'object' ? a[moduleId] : null;
}

// Big tappable radio choices (one question, 2 to 4 answers, large type). Uses data-seg so existing bindings work.
// options: [{ value, label, desc?, icon? }]
export function uiBigChoices(name, options, current, opts = {}) {
  return `<div class="big-choices ${opts.cols ? 'cols-' + opts.cols : ''}" role="radiogroup" aria-label="${uiEsc(opts.label || name)}">${options.map(o => {
    const on = String(o.value) === String(current);
    return `<label class="big-choice ${on ? 'on' : ''}"><input type="radio" name="${uiEsc(name)}" value="${uiEsc(o.value)}" ${on ? 'checked' : ''} data-seg="${uiEsc(name)}">${o.icon ? `<span class="big-choice-icon" aria-hidden="true">${o.icon}</span>` : ''}<span class="big-choice-text"><span class="big-choice-title">${uiEsc(o.label)}</span>${o.desc ? `<span class="big-choice-desc">${uiEsc(o.desc)}</span>` : ''}</span>${uiIcon('check', { cls: 'big-choice-check' })}</label>`;
  }).join('')}</div>`;
}

// Big tappable toggles (multi-select). Uses data-multi so existing bindings work.
export function uiBigToggles(name, options, currentArr, opts = {}) {
  const cur = new Set(currentArr || []);
  return `<div class="big-choices ${opts.cols ? 'cols-' + opts.cols : ''}" role="group" aria-label="${uiEsc(opts.label || name)}">${options.map(o => {
    const on = cur.has(o.value);
    return `<label class="big-choice ${on ? 'on' : ''}"><input type="checkbox" name="${uiEsc(name)}" value="${uiEsc(o.value)}" ${on ? 'checked' : ''} data-multi="${uiEsc(name)}">${o.icon ? `<span class="big-choice-icon" aria-hidden="true">${o.icon}</span>` : ''}<span class="big-choice-text"><span class="big-choice-title">${uiEsc(o.label)}</span>${o.desc ? `<span class="big-choice-desc">${uiEsc(o.desc)}</span>` : ''}</span>${uiIcon('check', { cls: 'big-choice-check' })}</label>`;
  }).join('')}</div>`;
}

// Rules from a user-defined diet cite the source id "user-defined". Register a readable citation for it at render time
// so the shared source list does not report it as missing. Runtime only; data/sources.json is not touched.
export function uiEnsureUserDefinedSource() {
  if (uiState.sourcesById && !uiState.sourcesById.has('user-defined')) {
    uiState.sourcesById.set('user-defined', { id: 'user-defined', citation: 'Defined by you in this app. Not an evidence source and not evidence-rated.', type: 'other' });
  }
}

// "Defined by you" badge for user-defined diets (shown in place of an evidence rating).
export function uiUserDefinedBadge() {
  return '<span class="chip plum">Defined by you</span>';
}

// Short display of a person's weight and height in pounds and feet/inches. Stored values stay metric.
export function uiWeightHeightText(person, helpers) {
  const parts = [];
  if (person.weight_kg > 0 && helpers && helpers.kgToLb) parts.push(`${helpers.kgToLb(person.weight_kg)} lb`);
  if (person.height_cm > 0 && helpers && helpers.cmToFtIn) { const h = helpers.cmToFtIn(person.height_cm); parts.push(`${h.ft} ft ${h.inch} in`); }
  return parts.join(', ');
}

// ---- Design system components (one implementation, used by every screen) ----

// Inline SVG icon set: 24px grid, 1.75 stroke, round caps. Every icon is drawn here; nothing ad hoc elsewhere.
const UI_ICON_PATHS = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10.5V20h13v-9.5M10 20v-5h4v5',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5a7.5 7.5 0 0 1 15 0',
  people: 'M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M15.5 4.6a3.5 3.5 0 0 1 0 6.8M18 13.8a6.5 6.5 0 0 1 3.5 6.2',
  list: 'M8.5 6h12M8.5 12h12M8.5 18h12M4 6h.01M4 12h.01M4 18h.01',
  check: 'M20 6.5 9.5 17 4 11.5',
  'check-circle': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.5l2.5 2.5L16 9.5',
  calendar: 'M4.5 6.5h15v13h-15zM4.5 10.5h15M8 4v4M16 4v4',
  cart: 'M3 4h2.5l2 11h10l2-7.5H6.5M9.5 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM17 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 2',
  leaf: 'M5 19c0-8 5-13 14-14 0 9-5 14-13 14M5 19l7-7',
  book: 'M4 4.5h6a2 2 0 0 1 2 2v13a1.5 1.5 0 0 0-1.5-1.5H4zM20 4.5h-6a2 2 0 0 0-2 2v13a1.5 1.5 0 0 1 1.5-1.5H20z',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  heart: 'M12 20.5s-7.5-4.6-7.5-10A4 4 0 0 1 12 8a4 4 0 0 1 7.5 2.5c0 5.4-7.5 10-7.5 10z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  edit: 'M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17zM13.5 6.5l3 3',
  share: 'M12 3v12M7.5 7.5 12 3l4.5 4.5M5 13v6.5h14V13',
  print: 'M6.5 8V3.5h11V8M6.5 17H4v-6.5a1.5 1.5 0 0 1 1.5-1.5h13A1.5 1.5 0 0 1 20 10.5V17h-2.5M6.5 14h11v6.5h-11z',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  breathe: 'M3 10c2.25 0 2.25-2.5 4.5-2.5S9.75 10 12 10s2.25-2.5 4.5-2.5S18.75 10 21 10M3 16c2.25 0 2.25-2.5 4.5-2.5S9.75 16 12 16s2.25-2.5 4.5-2.5S18.75 16 21 16',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  close: 'M6 6l12 12M18 6 6 18',
  jar: 'M7 7.5h10v11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2zM8 4.5h8v3H8zM9.5 12h5',
  note: 'M6 3.5h9l4 4v13H6zM15 3.5v4h4M9 12h6M9 16h4',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM20 20l-4.5-4.5',
  'arrow-left': 'M19 12H5M11 18l-6-6 6-6',
  'arrow-right': 'M5 12h14M13 6l6 6-6 6',
  swap: 'M4 7h13l-3-3M20 17H7l3 3',
  copy: 'M8 8h11v12H8zM5 16V4h11',
  trash: 'M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v6M14 11v6',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
  alert: 'M12 3.5 21 19.5H3zM12 10v4M12 17h.01',
  stop: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 9l6 6M15 9l-6 6',
  flame: 'M12 21c4 0 6.5-2.6 6.5-6.2 0-3.4-2.4-5.2-3.4-7.3-.8 1.6-1.6 2.3-2.6 2.6C12.2 7.8 11.6 5 9.5 3c.4 3.4-1.4 5-2.8 7.1A6.7 6.7 0 0 0 5.5 14.8C5.5 18.4 8 21 12 21z',
  chef: 'M8.5 8a3 3 0 0 1 5.6-1.5A2.5 2.5 0 1 1 16 11v6H8v-6a2.5 2.5 0 0 1 .5-3zM8 20h8',
  bowl: 'M3.5 11h17a8.5 8.5 0 0 1-17 0zM12 3.5v3M8.5 4.5l1 2.5M15.5 4.5l-1 2.5',
  scale: 'M12 3v18M5 7l14-2M5 7l-2.5 7a2.5 2.5 0 0 0 5 0zM19 5l-2.5 7a2.5 2.5 0 0 0 5 0z',
  cite: 'M7 15.5c0-3.5 1.5-6 5-7.5M7 15.5A1.5 1.5 0 1 0 8.5 14M15 15.5c0-3.5 1.5-6 5-7.5M15 15.5a1.5 1.5 0 1 0 1.5-1.5',
  'chevron-down': 'M6 9l6 6 6-6',
  ban: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8',
  star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8z',
  lock: 'M6.5 11V8a5.5 5.5 0 0 1 11 0v3M5 11h14v9.5H5zM12 15v2',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2',
  key: 'M14.5 13.5a5 5 0 1 0-4.7-3.4L3 16.9V21h4v-2h2v-2h2l1.6-1.6a5 5 0 0 0 1.9.1zM15.5 8.5h.01',
  paste: 'M9 4.5h6v3H9zM15 5.5h2.5v15h-11v-15H9M9 12h6M9 16h4'
};

// Icon markup. Pass { label } for a standalone icon (gets role="img"); omit it when the icon sits next to text (aria-hidden).
export function uiIcon(name, opts = {}) {
  const d = UI_ICON_PATHS[name] || UI_ICON_PATHS.info;
  const cls = 'ico' + (opts.cls ? ' ' + opts.cls : '');
  const a11y = opts.label ? `role="img" aria-label="${uiEsc(opts.label)}"` : 'aria-hidden="true"';
  const fill = opts.fill ? 'currentColor' : 'none';
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" ${a11y}${opts.style ? ` style="${uiEsc(opts.style)}"` : ''}><path d="${d}"/></svg>`;
}

// Brand mark: an olive branch resting in a bowl. One color (currentColor). Reads at 32px.
export function uiBrandMark(opts = {}) {
  const a11y = opts.label ? `role="img" aria-label="${uiEsc(opts.label)}"` : 'aria-hidden="true"';
  return `<svg class="brand-mark${opts.cls ? ' ' + opts.cls : ''}" viewBox="0 0 64 64" ${a11y}>
    <path d="M10 38h44c0 10-8 17-22 17S10 48 10 38z" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M18 34c6-8 14-14 30-20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <g fill="currentColor">
      <path d="M22.5 29.5c-4 .2-7-1.6-8.5-5 4-.3 7 1.5 8.5 5z"/><path d="M29 25c-4.4.4-7.4-1.4-9-5 4.4-.4 7.4 1.4 9 5z"/><path d="M36.5 20.8c-4.5.4-7.5-1.5-9-5.2 4.5-.4 7.5 1.5 9 5.2z"/>
      <path d="M26 30.2c1.7-3.9 4.9-5.5 9-5-1.6 3.8-4.8 5.5-9 5z"/><path d="M33.5 26.2c1.6-4 4.8-5.7 9.2-5.2-1.6 4-4.8 5.7-9.2 5.2z"/>
    </g>
    <circle cx="46" cy="16.5" r="2.2" fill="currentColor"/>
  </svg>`;
}

// Page header: h1 plus a one-line lede, with optional right-side actions.
export function uiPageHeader(title, lede = '', actions = '') {
  return `<header class="page-head"><div class="page-head-row"><h1>${title}</h1>${actions ? `<div class="page-head-actions">${actions}</div>` : ''}</div>${lede ? `<p class="lede">${lede}</p>` : ''}</header>`;
}

// Section: h2 with an optional right-side action, then body.
export function uiSection(title, body, opts = {}) {
  const id = opts.id ? ` id="${uiEsc(opts.id)}"` : '';
  const lab = opts.id ? ` aria-labelledby="${uiEsc(opts.id)}"` : '';
  return `<section class="section${opts.cls ? ' ' + opts.cls : ''}"${lab}><div class="section-head"><h2${id}>${title}</h2>${opts.action ? `<div class="section-action">${opts.action}</div>` : ''}</div>${body}</section>`;
}

// Stat tile: a number, a label, and an optional note. tone: '', stop, caution, pass, plum.
export function uiStatTile({ value, label, note = '', tone = '', href = '' }) {
  const inner = `<span class="tile-value">${value}</span><span class="tile-label">${label}</span>${note ? `<span class="tile-note">${note}</span>` : ''}`;
  return href ? `<a class="tile ${tone}" href="${uiEsc(href)}">${inner}</a>` : `<div class="tile ${tone}">${inner}</div>`;
}

// Tone and word for a value against a limit (at most), a target (at least), or a calorie target (a soft ceiling).
export function uiMeterTone(value, max, kind) {
  const pct = max > 0 ? value / max * 100 : 0;
  if (kind === 'target') {
    if (max <= 0) return { tone: 'neutral', word: 'no number' };
    return pct >= 100 ? { tone: 'pass', word: 'met' } : { tone: 'neutral', word: `${uiFmtNum(Math.max(0, max - value), 1)} to go` };
  }
  if (max <= 0) return { tone: 'neutral', word: 'no number' };
  if (pct > 100) return { tone: 'stop', word: 'over' };
  if (pct >= 85) return { tone: 'caution', word: kind === 'kcal' ? 'near target' : 'near limit' };
  return { tone: 'pass', word: kind === 'kcal' ? 'under' : 'within' };
}

// Ring gauge: value versus a limit or target. Number centered, tabular; the tone is always paired with a word.
export function uiRing({ value, max, kind = 'limit', unit = '', label = '', size = 132, href = '', word = null, tone = null }) {
  const r = 42, c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const t = tone && word ? { tone, word } : uiMeterTone(value, max, kind);
  const offset = c * (1 - pct);
  const shown = uiFmtNum(value, value >= 100 ? 0 : 1);
  const title = `${shown}${unit ? ' ' + unit : ''} of ${uiFmtNum(max, 1)}${unit ? ' ' + unit : ''}, ${t.word}`;
  const svg = `<svg viewBox="0 0 100 100" role="img" aria-label="${uiEsc(label ? label + ': ' + title : title)}">
    <circle class="ring-track" cx="50" cy="50" r="${r}"/>
    <circle class="ring-arc" cx="50" cy="50" r="${r}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" style="--ring-c:${c.toFixed(2)}"/>
    <text class="ring-value" x="50" y="50" text-anchor="middle" dominant-baseline="central" dy="${unit ? -4 : 0}">${shown}</text>
    ${unit ? `<text class="ring-unit" x="50" y="64" text-anchor="middle">${uiEsc(unit)}</text>` : ''}
  </svg>`;
  const foot = `<span class="ring-word">${uiEsc(t.word)}</span>${label ? `<span class="ring-label">${label}</span>` : ''}`;
  const style = `--ring-size:${size}px`;
  return href ? `<a class="ring ${t.tone}" href="${uiEsc(href)}" style="${style}">${svg}${foot}</a>` : `<div class="ring ${t.tone}" style="${style}">${svg}${foot}</div>`;
}

// Horizontal bar meter: label, value of max, a bar, and a word. Extra chips (for example doctor or dietitian) go in labelExtra.
export function uiMeter({ label, value, max, kind = 'limit', unit = '', labelExtra = '', wordExtra = '', digits = 0, why = '' }) {
  const t = uiMeterTone(value, max, kind);
  const pct = max > 0 ? Math.max(0, Math.min(100, value / max * 100)) : 0;
  const prefix = kind === 'target' ? 'at least ' : 'at most ';
  return `<div class="meter ${t.tone}">
    <div class="meter-label">${label}${labelExtra}</div>
    ${why ? `<div class="meter-why">${uiEsc(why)}</div>` : ''}
    <div class="meter-value"><strong>${uiFmtNum(value, digits)}</strong> <span class="meter-of">of ${prefix}${uiFmtNum(max, digits)}${unit ? ' ' + uiEsc(unit) : ''}</span></div>
    <div class="bar ${t.tone}" role="img" aria-label="${uiEsc(`${uiFmtNum(pct)} percent of ${prefix}${uiFmtNum(max, digits)}${unit ? ' ' + unit : ''}`)}"><span class="bar-fill" style="width:${pct.toFixed(1)}%"></span></div>
    <div class="meter-word"><span>${uiEsc(t.word)}</span>${wordExtra}</div>
  </div>`;
}

// Chip. tone: stop, caution, pass, info, plum, olive, neutral. Pass { button, data } for a tappable chip.
export function uiChip(text, tone = 'neutral', opts = {}) {
  const cls = `chip ${tone}${opts.soft ? ' soft' : ''}${opts.cls ? ' ' + opts.cls : ''}`;
  if (opts.button) return `<button type="button" class="${cls}" ${opts.attrs || ''}>${opts.raw ? text : uiEsc(text)}</button>`;
  return `<span class="${cls}" ${opts.attrs || ''}>${opts.raw ? text : uiEsc(text)}</span>`;
}

export function uiVerdictTone(v) { return v === 'fail' ? 'stop' : v === 'caution' ? 'caution' : 'pass'; }
export function uiVerdictChip(v, opts = {}) { return uiChip(uiVerdictWord(v), uiVerdictTone(v), opts); }

// Initials avatar (olive tint). size: '', 'lg'. tone: '', 'plum'.
export function uiAvatar(name, opts = {}) {
  const initials = String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w.charAt(0).toUpperCase()).join('') || '?';
  return `<span class="avatar ${opts.size || ''} ${opts.tone || ''}" aria-hidden="true">${uiEsc(initials)}</span>`;
}

// Empty state: a small line illustration drawn in code, one short sentence, one action.
export function uiEmptyState(sentence, action = '', illo = 'bowl') {
  const art = illo === 'plate'
    ? '<svg class="empty-illo" viewBox="0 0 72 56" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="36" cy="34" rx="26" ry="9"/><ellipse cx="36" cy="34" rx="15" ry="4.5"/><path d="M10 12v14M14 12v14M12 26v8M60 12c-3 2-3 10 0 12v10"/></svg>'
    : illo === 'list'
      ? '<svg class="empty-illo" viewBox="0 0 72 56" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="18" y="6" width="36" height="44" rx="4"/><path d="M26 18h20M26 27h20M26 36h12M22 6v-2M50 6v-2"/></svg>'
      : '<svg class="empty-illo" viewBox="0 0 72 56" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 26h52a26 26 0 0 1-52 0z"/><path d="M22 46h28M36 8v10M28 10l3 7M44 10l-3 7"/></svg>';
  return `<div class="empty">${art}<p>${sentence}</p>${action}</div>`;
}

// Switch (a checkbox that looks like a toggle). Returns markup; bind the input by id.
export function uiSwitch(id, title, desc, checked) {
  return `<label class="switch" for="${uiEsc(id)}"><span class="switch-text"><span class="switch-title">${uiEsc(title)}</span>${desc ? `<span class="hint">${uiEsc(desc)}</span>` : ''}</span><input type="checkbox" id="${uiEsc(id)}" role="switch" ${checked ? 'checked' : ''} aria-checked="${checked ? 'true' : 'false'}"><span class="switch-track" aria-hidden="true"></span></label>`;
}

// Time-of-day greeting.
export function uiGreeting(name) {
  const h = new Date().getHours();
  const word = h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return name ? `${word}, ${uiEsc(name)}` : word;
}

// ---- UI preferences (theme, large text). Stored under peace-meal:ui; nothing else reads it. ----
// Large text is on by default in the lite build until the person sets it (largeTextSet), 2026-09 audit.
const UI_PREFS_KEY = 'peace-meal:ui';
function uiLiteBuild() { return typeof window !== 'undefined' && !!window.__PEACE_MEAL_LITE__; }
export function uiLoadUiPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(UI_PREFS_KEY) || '{}');
    return { theme: ['light', 'dark'].includes(p.theme) ? p.theme : 'system', largeText: p.largeTextSet || !uiLiteBuild() ? !!p.largeText : true, largeTextSet: !!p.largeTextSet };
  } catch { return { theme: 'system', largeText: uiLiteBuild(), largeTextSet: false }; }
}
export function uiSaveUiPrefs(prefs) {
  try { localStorage.setItem(UI_PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
  uiApplyUiPrefs(prefs);
}
export function uiApplyUiPrefs(prefs = uiLoadUiPrefs()) {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  if (prefs.theme === 'light' || prefs.theme === 'dark') html.setAttribute('data-theme', prefs.theme); else html.removeAttribute('data-theme');
  html.classList.toggle('large-text', !!prefs.largeText);
}
if (typeof document !== 'undefined') uiApplyUiPrefs();

// ---- In-app history stack for the global Back control ----
// Entries: { hash, viaHistory }. viaHistory is true when the entry was reached by a forward navigation, so history.back() lands on the one before it.
uiState.navStack = [];
uiState.modalClose = null;
uiState.closeMoreSheet = null;

export function uiNavRecord(hash, replace = false) {
  const st = uiState.navStack;
  if (replace && st.length) { const top = st.pop(); if (!st.length || st[st.length - 1].hash !== hash) st.push({ hash, viaHistory: top.viaHistory }); return; }
  if (!st.length) { st.push({ hash, viaHistory: false }); return; }
  if (st[st.length - 1].hash === hash) return;                 // same route re-rendered: no push
  if (st.length > 1 && st[st.length - 2].hash === hash) { st.pop(); return; }   // browser back: pop
  st.push({ hash, viaHistory: true });
  if (st.length > 60) st.shift();
}

export function uiCanGoBack() {
  return uiState.navStack.length > 1;
}

// The Back control: closes an open sheet first, then pops the stack. Onboarding's first step returns to the People list.
export function uiGoBack() {
  if (uiState.modalClose) { uiState.modalClose(); return; }
  if (uiState.closeMoreSheet && uiState.closeMoreSheet()) return;
  const st = uiState.navStack;
  if (st.length < 2) return;
  const cur = st[st.length - 1];
  const prev = st[st.length - 2];
  const onboarding = /^#\/people\/[^/]+\/[^/]+/.test(cur.hash) && /^#\/(people\/new|welcome)$/.test(prev.hash);
  if (onboarding) { location.hash = '#/people'; return; }
  if (cur.viaHistory) history.back();
  else location.hash = prev.hash;
}

export function uiBackButtonHTML(cls = '') {
  return `<button type="button" class="btn small back-btn ${cls}" data-back aria-label="Back to the previous screen">${uiIcon('arrow-left')}<span>Back</span></button>`;
}
