// Approved foods for one elimination diet: the published list with portions and sources, the strict-mode switch, and the
// person's own additions (foods they tolerate) and removals (foods they react to). Printable; copies as a shopping list.
import { uiState, uiEsc, uiActivePerson, uiPlanFor, uiPersist, uiToast, uiPageHeader, uiSection, uiChip, uiIcon, uiSwitch, uiNoticeHTML, uiSourcesHTML, uiDownload, uiIsoDate, uiToday } from './common.js';
import { strictOn, strictFamiliesFor, familyLabel } from '../engine/dietlists.js';

let dietUi = { q: '' };

export function dietFamiliesFor(person, plan) {
  const lists = uiState.data['diet-lists'] || { families: {} };
  return strictFamiliesFor(plan, lists).map(id => ({ id, label: familyLabel(lists, id), strict: strictOn(person, id), lists }));
}

// The strict switch and the link to the list, shown on the Plan screen for every family the plan restricts.
export function dietStrictCardsHTML(person, plan) {
  const fams = dietFamiliesFor(person, plan);
  if (!fams.length) return '';
  return uiSection('Approved foods', `<div class="stack-2">${fams.map(f => `<div class="card tight">
    ${uiSwitch('strict-' + f.id, `Strict mode for ${f.label}`, f.strict ? 'On: a recipe counts as safe only when every ingredient is on the approved list, or on your own tolerated list.' : 'Off: a recipe counts as safe unless an ingredient is on the avoid list. Looser. Foods the app does not know can slip through.', f.strict)}
    <div class="row"><a class="btn small" href="#/plan/foods/${uiEsc(f.id)}">${uiIcon('list')}See the approved list</a>${(person.diet_lists && person.diet_lists[f.id] && ((person.diet_lists[f.id].tolerated || []).length || (person.diet_lists[f.id].reacts || []).length)) ? `<span class="small muted">${(person.diet_lists[f.id].tolerated || []).length} added by you, ${(person.diet_lists[f.id].reacts || []).length} removed by you</span>` : ''}</div>
  </div>`).join('')}</div>`, { id: 'plan-approved-h' });
}

export function dietBindStrictCards(root, person) {
  root.querySelectorAll('[id^="strict-"]').forEach(el => el.addEventListener('change', () => {
    const family = el.id.slice('strict-'.length);
    person.strict_diets = person.strict_diets || {};
    person.strict_diets[family] = el.checked;
    delete person.week_snapshot;   // the week is rebuilt under the new rule
    uiPersist(); uiToast(el.checked ? 'Strict mode on. Only approved foods are planned.' : 'Strict mode off. Only foods on the avoid list are blocked.'); uiState.rerender();
  }));
}

function dietPersonList(person, family) {
  person.diet_lists = person.diet_lists || {};
  person.diet_lists[family] = person.diet_lists[family] || { tolerated: [], reacts: [] };
  const p = person.diet_lists[family];
  p.tolerated = p.tolerated || []; p.reacts = p.reacts || [];
  return p;
}

function dietListText(fam, mine) {
  const lines = [`Approved foods: ${fam.label}`, ''];
  if (fam.intro) { lines.push(fam.intro, ''); }
  for (const g of fam.groups || []) {
    lines.push(g.name.toUpperCase());
    for (const it of g.items || []) lines.push(`- ${it.term}${it.portion ? ` (${it.portion})` : ''}${it.note ? `: ${it.note}` : ''}${it.verified === false ? ' [not re-checked]' : ''}${it.basis ? ` [basis: ${it.basis}]` : ''}`);
    lines.push('');
  }
  if ((fam.avoid_examples || []).length) { lines.push('COMMON FOODS TO LEAVE OUT'); for (const a of fam.avoid_examples) lines.push(`- ${a.term}${a.why ? `: ${a.why}` : ''}${a.basis ? ` [basis: ${a.basis}]` : ''}`); lines.push(''); }
  if (fam.basis_legend) { lines.push('WHAT THE BASIS MEANS'); for (const [k, v] of Object.entries(fam.basis_legend)) lines.push(`- ${k}: ${v}`); lines.push(''); }
  if (mine.tolerated.length) { lines.push('ADDED BY ME (TOLERATED)'); for (const t of mine.tolerated) lines.push(`- ${t.term}${t.note ? `: ${t.note}` : ''}`); lines.push(''); }
  if (mine.reacts.length) { lines.push('REMOVED BY ME (I REACT TO THESE)'); for (const t of mine.reacts) lines.push(`- ${t.term}${t.note ? `: ${t.note}` : ''}`); lines.push(''); }
  return lines.join('\n');
}

// The evidence behind an item's rating (low histamine, 2026-09 audit): measured histamine, other amines, proposed
// liberator, or SIGHI rating only, with the measurement or leaflet wording. Nothing here changes the rating.
function dietBasisHTML(it) {
  if (!it.basis) return '';
  return `<div class="list-sub small">${uiChip('basis: ' + it.basis, it.basis === 'measured histamine' ? 'info' : 'neutral', { soft: true })}${it.basis_note ? ` ${uiEsc(it.basis_note)}` : ''}</div>`;
}

export function renderDietListScreen(root, family) {
  const person = uiActivePerson();
  const plan = uiPlanFor(person);
  const lists = uiState.data['diet-lists'] || { families: {} };
  const fam = lists.families[family];
  if (!fam) { root.innerHTML = `${uiPageHeader('Approved foods', 'No list for this diet.', `<a class="btn small" href="#/plan">${uiIcon('list')}Plan</a>`)}`; return; }
  const strict = strictOn(person, family);
  const restricts = strictFamiliesFor(plan, lists).includes(family);
  const mine = dietPersonList(person, family);
  const q = dietUi.q.trim().toLowerCase();
  const show = it => !q || it.term.toLowerCase().includes(q) || (it.aliases || []).some(a => a.toLowerCase().includes(q)) || (it.note || '').toLowerCase().includes(q);
  const groups = (fam.groups || []).map(g => ({ ...g, items: (g.items || []).filter(show) })).filter(g => g.items.length);
  const unverified = (fam.groups || []).flatMap(g => g.items || []).filter(it => it.verified === false).length;
  root.innerHTML = `
    ${uiPageHeader(`Approved foods: ${uiEsc(fam.label)}`, uiEsc(fam.intro || ''), `<button class="btn small" type="button" id="diet-print">${uiIcon('cite')}Print</button><button class="btn small" type="button" id="diet-copy">${uiIcon('copy')}Copy as list</button><button class="btn small" type="button" id="diet-save">${uiIcon('download')}Save text</button><a class="btn small" href="#/plan">${uiIcon('list')}Plan</a>`)}
    ${!restricts ? uiNoticeHTML({ level: 'info', text: `${person.name}'s plan does not restrict ${fam.label} foods right now, so this list is for reading only.` }) : ''}
    <div class="card tight">${uiSwitch('strict-' + family, `Strict mode for ${fam.label}`, strict ? 'On: a recipe counts as safe only when every ingredient is on this list, or on your own tolerated list.' : 'Off: a recipe counts as safe unless an ingredient is on the avoid list. Looser. Foods the app does not know can slip through.', strict)}</div>
    <p class="small muted">Sources for the list: ${uiSourcesHTML(fam.sources || [])}.${unverified ? ` ${unverified} item${unverified === 1 ? '' : 's'} marked "not re-checked" came from the app's dictionary and general practice and were not re-verified against the source leaflet in this build.` : ''}</p>
    ${uiSection('Your own changes', `<div class="grid-2">
      <div class="card"><h3>Foods you tolerate ${uiChip(String(mine.tolerated.length), 'pass')}</h3><p class="small muted">Added to your approved list. Use this for foods you have tested and kept.</p>
        ${mine.tolerated.length ? `<ul class="list">${mine.tolerated.map((t, i) => `<li class="list-row"><div class="list-main"><div class="list-title">${uiEsc(t.term)}</div><div class="list-sub">${uiEsc(t.note || '')}${t.added ? ` · ${uiEsc(t.added)}` : ''}</div></div><div class="list-actions"><button class="btn small" type="button" data-diet-remove="tolerated:${i}">Remove</button></div></li>`).join('')}</ul>` : ''}
        <div class="row"><label class="visually-hidden" for="diet-tol-term">Food</label><input type="text" id="diet-tol-term" placeholder="Food, for example: kiwi" style="flex:1;min-width:140px"><label class="visually-hidden" for="diet-tol-note">Note</label><input type="text" id="diet-tol-note" placeholder="Note (optional)" style="flex:1;min-width:140px"><button class="btn small primary" type="button" id="diet-tol-add">Add</button></div></div>
      <div class="card"><h3>Foods you react to ${uiChip(String(mine.reacts.length), 'stop')}</h3><p class="small muted">Removed from your approved list. Recipes with them become a caution even if the published list allows them.</p>
        ${mine.reacts.length ? `<ul class="list">${mine.reacts.map((t, i) => `<li class="list-row"><div class="list-main"><div class="list-title">${uiEsc(t.term)}</div><div class="list-sub">${uiEsc(t.note || '')}${t.added ? ` · ${uiEsc(t.added)}` : ''}</div></div><div class="list-actions"><button class="btn small" type="button" data-diet-remove="reacts:${i}">Remove</button></div></li>`).join('')}</ul>` : ''}
        <div class="row"><label class="visually-hidden" for="diet-re-term">Food</label><input type="text" id="diet-re-term" placeholder="Food, for example: oats" style="flex:1;min-width:140px"><label class="visually-hidden" for="diet-re-note">Note</label><input type="text" id="diet-re-note" placeholder="What happened (optional)" style="flex:1;min-width:140px"><button class="btn small" type="button" id="diet-re-add">Add</button></div></div>
    </div>`, { id: 'diet-mine-h' })}
    <div class="field"><label for="diet-q">Search the list</label><input type="search" id="diet-q" value="${uiEsc(dietUi.q)}" placeholder="carrot, rice, cheese..."></div>
    <div class="report-sheet" id="lite-report">
      <h1 class="report-title">Approved foods: ${uiEsc(fam.label)}</h1>
      <p class="report-meta">For ${uiEsc(person.name)}. ${uiEsc(fam.intro || '')}</p>
      ${groups.length ? groups.map(g => `<h2>${uiEsc(g.name)}</h2><ul class="list">${g.items.map(it => `<li class="list-row"><div class="list-main"><div class="list-title">${uiEsc(it.term)}${it.aliases && it.aliases.length ? ` <span class="muted small">(${uiEsc(it.aliases.slice(0, 6).join(', '))}${it.aliases.length > 6 ? ', …' : ''})</span>` : ''}${it.verified === false ? ' ' + uiChip('not re-checked', 'caution', { soft: true }) : ''}</div><div class="list-sub">${it.portion ? `<strong>${uiEsc(it.portion)}</strong>` : ''}${it.note ? `. ${uiEsc(it.note)}` : ''}${it.sources && it.sources.length ? ` <span class="sources">${uiSourcesHTML(it.sources)}</span>` : ''}</div>${dietBasisHTML(it)}</div></li>`).join('')}</ul>`).join('') : '<p class="muted small">Nothing matches that search.</p>'}
      ${mine.tolerated.length ? `<h2>Added by ${uiEsc(person.name)}</h2><ul>${mine.tolerated.map(t => `<li>${uiEsc(t.term)}${t.note ? `: ${uiEsc(t.note)}` : ''}</li>`).join('')}</ul>` : ''}
      ${mine.reacts.length ? `<h2>Removed by ${uiEsc(person.name)}</h2><ul>${mine.reacts.map(t => `<li>${uiEsc(t.term)}${t.note ? `: ${uiEsc(t.note)}` : ''}</li>`).join('')}</ul>` : ''}
      ${fam.avoid_examples && fam.avoid_examples.length ? `<h2>Common foods to leave out</h2>${fam.basis_legend ? `<ul class="list">${fam.avoid_examples.map(a => `<li class="list-row"><div class="list-main"><div class="list-title">${uiEsc(a.term)}</div><div class="list-sub">${uiEsc(a.why || '')}</div>${dietBasisHTML(a)}</div></li>`).join('')}</ul>` : `<div class="chip-cloud">${fam.avoid_examples.map(a => uiChip(a.term, 'stop', { soft: true, attrs: `title="${uiEsc(a.why || '')}"` })).join('')}</div>`}` : ''}
      ${fam.basis_legend ? `<h2>What the basis means</h2><dl class="kv small">${Object.entries(fam.basis_legend).map(([k, v]) => `<dt>${uiEsc(k)}</dt><dd>${uiEsc(v)}</dd>`).join('')}</dl><p class="small muted">Sources for the basis: ${uiSourcesHTML(fam.basis_sources || [])}</p>` : ''}
    </div>`;
  dietBindStrictCards(root, person);
  const changed = msg => { delete person.week_snapshot; uiPersist(); uiToast(msg); uiState.rerender(); };
  const addTo = (key, termId, noteId, msg) => {
    const term = (root.querySelector('#' + termId).value || '').trim();
    if (!term) { uiToast('Type a food first.'); return; }
    const note = (root.querySelector('#' + noteId).value || '').trim();
    const list = dietPersonList(person, family)[key];
    if (list.some(x => x.term.toLowerCase() === term.toLowerCase())) { uiToast('Already on that list.'); return; }
    list.push({ term, note, added: uiIsoDate(uiToday()) });
    // a food cannot be on both of the person's lists
    const other = dietPersonList(person, family)[key === 'tolerated' ? 'reacts' : 'tolerated'];
    dietPersonList(person, family)[key === 'tolerated' ? 'reacts' : 'tolerated'] = other.filter(x => x.term.toLowerCase() !== term.toLowerCase());
    changed(msg);
  };
  root.querySelector('#diet-tol-add').addEventListener('click', () => addTo('tolerated', 'diet-tol-term', 'diet-tol-note', 'Added to your approved list.'));
  root.querySelector('#diet-re-add').addEventListener('click', () => addTo('reacts', 'diet-re-term', 'diet-re-note', 'Removed from your approved list.'));
  root.querySelectorAll('[data-diet-remove]').forEach(b => b.addEventListener('click', () => { const [key, i] = b.dataset.dietRemove.split(':'); dietPersonList(person, family)[key].splice(Number(i), 1); changed('Removed.'); }));
  root.querySelector('#diet-q').addEventListener('input', e => { dietUi.q = e.target.value; uiState.rerender(); const el = root.querySelector('#diet-q'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } });
  root.querySelector('#diet-print').addEventListener('click', () => { root.classList.add('print-report'); window.print(); setTimeout(() => root.classList.remove('print-report'), 1000); });
  root.querySelector('#diet-copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(dietListText(fam, mine)); uiToast('Copied.'); } catch { uiToast('Could not copy on this device. Use Save text instead.'); } });
  root.querySelector('#diet-save').addEventListener('click', () => uiDownload(`approved-foods-${family}.txt`, dietListText(fam, mine), 'text/plain'));
}
