// Log: symptom diary. Meals eaten against symptoms, day by day. No analytics claims.
import { checkText } from '../engine/checker.js';
import { uiState, uiEsc, uiActivePerson, uiPlanFor, uiPersist, uiIsoDate, uiToday, uiFmtDate, uiToast, uiPageHeader, uiSection, uiVerdictChip, uiNoticeHTML, uiEmptyState, uiIcon } from './common.js';
import { weekGet } from './week.js';

export const LOG_SYMPTOMS = [
  { id: 'bloating', label: 'Bloating', help: 'Belly feels swollen or tight' },
  { id: 'gas', label: 'Gas', help: 'More wind than usual' },
  { id: 'stomach_pain', label: 'Stomach pain', help: 'Cramps or aching in the belly' },
  { id: 'nausea', label: 'Nausea', help: 'Feeling sick or queasy' },
  { id: 'heartburn', label: 'Heartburn or reflux', help: 'Burning in the chest or throat, sour taste' },
  { id: 'diarrhea', label: 'Diarrhea', help: 'Loose or urgent stools' },
  { id: 'constipation', label: 'Constipation', help: 'Hard stools or fewer than usual' },
  { id: 'headache', label: 'Headache', help: 'Any head pain, including migraine' },
  { id: 'flushing', label: 'Flushing or hives', help: 'Red skin, warmth, or raised itchy welts' },
  { id: 'itching', label: 'Itching or rash', help: 'Itchy skin or a new rash' },
  { id: 'mouth_itch', label: 'Mouth or throat itch', help: 'Tingling or itching in the mouth, lips, or throat' },
  { id: 'fatigue', label: 'Fatigue or brain fog', help: 'Tired, slow, or hard to concentrate' },
  { id: 'joint_pain', label: 'Joint pain', help: 'Aching or stiff joints' },
  { id: 'dizziness', label: 'Dizziness or racing heart', help: 'Light-headed, or heart pounding' },
  { id: 'poor_sleep', label: 'Poor sleep', help: 'Trouble falling or staying asleep' },
  { id: 'mood', label: 'Mood', help: 'Low, anxious, or irritable' }
];
// Labels for symptom ids saved by earlier versions of this screen.
const LOG_LEGACY_LABELS = { pain: 'Abdominal pain', reflux: 'Reflux', stool_change: 'Stool change' };
const LOG_LEVELS = ['none', 'mild', 'moderate', 'severe'];

let logDraft = null;

export function renderLogScreen(root) {
  const person = uiActivePerson();
  const plan = uiPlanFor(person);
  const today = uiIsoDate(uiToday());
  if (!logDraft || logDraft.person !== person.id) logDraft = { person: person.id, date: today, meal: 'lunch', recipe: '', text: '', symptoms: {}, notes: '' };
  const d = logDraft;
  const week = uiState.data.recipes.length ? weekGet(person, plan) : null;
  const dayMeals = week ? (week.days.find(x => x.date === d.date) || { meals: [] }).meals.filter(m => m.recipe) : [];
  const entries = (uiState.profile.log || []).filter(e => e.person === person.id);
  const cutoff = new Date(uiToday().getTime() - 13 * 86400000);
  const recent = entries.filter(e => new Date(e.date + 'T00:00:00') >= cutoff).sort((a, b) => b.date.localeCompare(a.date) || String(b.logged_at || '').localeCompare(String(a.logged_at || '')));
  const byDate = {};
  for (const e of recent) (byDate[e.date] ||= []).push(e);
  const inElimination = plan.phases.filter(p => /elimination|reintroduction/.test(p.phase));
  const textCheck = d.text.trim() ? checkText(d.text, plan, uiState.matcher, person) : null;

  root.innerHTML = `
    ${uiPageHeader('Log', 'What you ate and how you felt, day by day. The app records; it does not interpret.')}
    ${inElimination.length ? uiNoticeHTML({ level: 'info', text: `${inElimination.map(p => `${p.moduleName} is in the ${p.label} phase.`).join(' ')} This log is how you identify your triggers: note what you ate and how you felt over the next day or so, then compare across the reintroduction of each food group.` }) : ''}
    <div class="card">
      <h2>New entry</h2>
      <div class="grid-2">
        <div class="field"><label for="log-date">Date</label><input id="log-date" type="date" value="${uiEsc(d.date)}" max="${today}"></div>
        <div class="field"><label for="log-meal">Meal</label><select id="log-meal">${['breakfast', 'lunch', 'dinner', 'snack'].map(s => `<option value="${s}" ${d.meal === s ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label for="log-recipe">Meal from this week's plan</label>
        <select id="log-recipe"><option value="">Not from the plan</option>${dayMeals.map(m => `<option value="${uiEsc(m.recipe)}" ${d.recipe === m.recipe ? 'selected' : ''}>${uiEsc(m.slot)}: ${uiEsc(m.name)}</option>`).join('')}</select>
        ${!dayMeals.length ? '<div class="hint">No planned meals for this date. Describe the meal below instead.</div>' : ''}</div>
      <div class="field"><label for="log-text">Or describe what you ate</label><textarea id="log-text" style="min-height:80px" placeholder="oatmeal with banana and almond butter">${uiEsc(d.text)}</textarea>
        ${textCheck ? `<div class="small row" style="margin-top:6px">${uiVerdictChip(textCheck.verdict)} <span>${textCheck.hits.length ? 'Matched: ' + textCheck.hits.map(h => uiEsc(h.label)).join(', ') + '.' : ''} ${(textCheck.sodium || []).length ? (textCheck.sodium[0].terms.length ? 'High in salt: ' + textCheck.sodium[0].terms.map(uiEsc).join(', ') : 'Can be high in salt: ' + textCheck.sodium[0].mayTerms.map(uiEsc).join(', ')) + '.' : ''} ${textCheck.unrecognized.length ? 'Not recognized: ' + textCheck.unrecognized.map(uiEsc).join('; ') + '.' : ''} ${(textCheck.notApproved || []).length ? 'Not on the approved list: ' + [...new Set(textCheck.notApproved.map(n => n.label))].map(uiEsc).join('; ') + '.' : ''}</span></div>` : ''}</div>
      <h3>Symptoms</h3>
      <p class="small muted">Slide each one from 0 (none) to 3 (severe). Leave anything that did not happen at 0.</p>
      <div class="symptom-grid">
      ${LOG_SYMPTOMS.map(s => `<div class="field symptom"><label for="log-sym-${s.id}"><span class="symptom-name">${s.label}</span> <span class="symptom-val" id="log-symval-${s.id}">${LOG_LEVELS[d.symptoms[s.id] || 0]}</span></label><div class="hint">${s.help}</div><input id="log-sym-${s.id}" type="range" min="0" max="3" step="1" value="${d.symptoms[s.id] || 0}" data-sym="${s.id}" aria-valuetext="${LOG_LEVELS[d.symptoms[s.id] || 0]}" aria-describedby="log-symhelp-${s.id}"><span class="visually-hidden" id="log-symhelp-${s.id}">${s.help}. 0 none, 1 mild, 2 moderate, 3 severe.</span></div>`).join('')}
      </div>
      <div class="field"><label for="log-notes">Notes</label><textarea id="log-notes" style="min-height:70px">${uiEsc(d.notes)}</textarea></div>
      <div class="btn-row"><button class="btn primary" type="button" id="log-save">${uiIcon('check')}Save entry</button></div>
    </div>

    ${uiSection('Last 14 days', Object.keys(byDate).length ? `<div class="stack-2">${Object.entries(byDate).map(([date, list]) => `<section class="log-day"><h3>${uiFmtDate(date)}</h3>
      <div class="list">${list.map(e => `<div class="list-row"><div class="list-main"><div class="list-title">${uiEsc(e.meal || '')} <span style="font-weight:400">${e.name ? uiEsc(e.name) : e.recipe && uiState.recipesById.get(e.recipe) ? uiEsc(uiState.recipesById.get(e.recipe).name) : ''}</span> ${e.text ? `<span class="muted" style="font-weight:400">${uiEsc(e.text)}</span>` : ''}</div>
        <div class="list-sub">${Object.entries(e.symptoms || {}).filter(([, v]) => v > 0).map(([k, v]) => `${uiEsc((LOG_SYMPTOMS.find(s => s.id === k) || { label: LOG_LEGACY_LABELS[k] || k }).label)}: ${LOG_LEVELS[v] || v}`).join(', ') || 'no symptoms recorded'}</div>
        ${e.notes ? `<div class="small">${uiEsc(e.notes)}</div>` : ''}</div>
        <div class="list-actions"><button class="btn small danger" type="button" data-del="${uiEsc(e.logged_at || '')}|${uiEsc(e.date)}|${uiEsc(e.meal || '')}">Delete</button></div></div>`).join('')}</div>
    </section>`).join('')}</div>` : uiEmptyState('No entries in the last 14 days.', '', 'list'), { id: 'log-recent-h' })}
    <p class="small muted">The log is a record for you and your doctor or dietitian. The app does not analyze it or claim to find causes.</p>
  `;

  root.querySelector('#log-date').addEventListener('change', e => { d.date = e.target.value || today; d.recipe = ''; uiState.rerender(); });
  root.querySelector('#log-meal').addEventListener('change', e => { d.meal = e.target.value; });
  root.querySelector('#log-recipe').addEventListener('change', e => { d.recipe = e.target.value; });
  root.querySelector('#log-text').addEventListener('change', e => { d.text = e.target.value; uiState.rerender(); });
  root.querySelector('#log-notes').addEventListener('input', e => { d.notes = e.target.value; });
  root.querySelectorAll('[data-sym]').forEach(inp => inp.addEventListener('input', () => {
    d.symptoms[inp.dataset.sym] = Number(inp.value);
    inp.setAttribute('aria-valuetext', LOG_LEVELS[Number(inp.value)]);
    root.querySelector('#log-symval-' + inp.dataset.sym).textContent = LOG_LEVELS[Number(inp.value)];
  }));
  root.querySelector('#log-save').addEventListener('click', () => {
    d.text = root.querySelector('#log-text').value;
    d.notes = root.querySelector('#log-notes').value;
    const recipe = uiState.recipesById.get(d.recipe);
    const entry = { date: d.date, person: person.id, meal: d.meal, recipe: d.recipe || null, name: recipe ? recipe.name : null, text: d.text.trim() || null, symptoms: { ...d.symptoms }, notes: d.notes.trim() || null, logged_at: new Date().toISOString() };
    uiState.profile.log = uiState.profile.log || [];
    uiState.profile.log.push(entry);
    uiPersist();
    logDraft = null;
    uiToast('Entry saved.');
    uiState.rerender();
  });
  root.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    if (!window.confirm('Delete this entry?')) return;
    const [logged, date, meal] = b.dataset.del.split('|');
    const idx = uiState.profile.log.findIndex(e => e.person === person.id && String(e.logged_at || '') === logged && e.date === date && String(e.meal || '') === meal);
    if (idx >= 0) uiState.profile.log.splice(idx, 1);
    uiPersist(); uiState.rerender();
  }));
}
