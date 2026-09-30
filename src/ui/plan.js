// Plan: the merged plan for the active person, section by section, every rule with its sources.
import { energyTarget } from '../engine/energy.js';
import { emptyTotals, addTotals, compareToPlan, NUTRIENT_KEYS } from '../engine/nutrition.js';
import { learnArticleHTML } from './learn.js';
import { uiState, uiEsc, uiActivePerson, uiPlanFor, uiPersist, uiRulesList, uiSourcesDisclosure, uiTagLabel, uiNutrientLabel, uiFmtNum, uiIsoDate, uiToday, uiModuleName, uiNoticeHTML, uiBindNoticeActions, uiToast, uiEnsureUserDefinedSource, uiUserDefinedBadge, uiPageHeader, uiSection, uiChip, uiIcon, uiMeter, uiModal, uiEmptyState, uiRatingBadge } from './common.js';
import { renderDietListScreen, dietStrictCardsHTML, dietBindStrictCards } from './dietlist.js';

// Today's logged totals for the active person, so each number can be shown as "so far today" against its limit or target.
function planTodayTotals(person) {
  const today = uiIsoDate(uiToday());
  let t = emptyTotals();
  for (const e of (uiState.profile.diary || [])) {
    if (e.person !== person.id || e.date !== today) continue;
    const x = emptyTotals();
    for (const k of NUTRIENT_KEYS) x[k] = (e.nutrients && e.nutrients[k]) || 0;
    t = addTotals(t, x);
  }
  return t;
}

// "Sodium (mg)" -> { name: 'Sodium', unit: 'mg' }
function planSplitLabel(nutrient) {
  const full = uiNutrientLabel(nutrient);
  const m = /^(.*?)\s*\((.*)\)\s*$/.exec(full);
  return m ? { name: m[1], unit: m[2].replace('% of calories', '% kcal') } : { name: full, unit: '' };
}

let planSheetRules = {};

export function renderPlanScreen(root, ctx) {
  if (ctx && ctx.route && ctx.route.parts && ctx.route.parts[0] === 'foods') return renderDietListScreen(root, ctx.route.parts[1]);
  const person = uiActivePerson();
  uiEnsureUserDefinedSource();
  const plan = uiPlanFor(person);
  const customModules = plan.modules.filter(m => m.category === 'custom');
  const customDefs = new Map((person.custom_modules || []).map(cm => [cm.id, cm]));
  const loadNotice = plan.notices.find(n => n.code === 'restriction-load');
  const limits = Object.entries(plan.limits);
  const targets = Object.entries(plan.targets);
  const avoidHard = Object.entries(plan.avoid).filter(([, v]) => v.hard);
  const avoidSoft = Object.entries(plan.avoid).filter(([, v]) => !v.hard);
  const prefer = Object.entries(plan.prefer);
  const periodic = Object.entries(plan.periodic || {}).map(([per, x]) => ({ per, limits: Object.entries(x.limits || {}), targets: Object.entries(x.targets || {}) })).filter(x => x.limits.length || x.targets.length);
  const totals = planTodayTotals(person);
  const cmp = compareToPlan(totals, plan);
  const valueOf = n => { const f = [...cmp.over, ...cmp.under, ...cmp.ok].find(x => x.nutrient === n); return f ? f.value : 0; };
  planSheetRules = {};

  const numberMeters = [
    ...limits.map(([n, l]) => { const s = planSplitLabel(n); planSheetRules['limit:' + n] = { title: `${s.name}: at most ${uiFmtNum(l.value, 1)}${s.unit ? ' ' + s.unit : ''} per ${l.per}`, rules: l.rules, note: l.ideal != null ? `Ideally ${uiFmtNum(l.ideal, 1)}${s.unit ? ' ' + s.unit : ''}.` : '', whys: planWhys(l.rules) }; return uiMeter({ label: uiEsc(s.name), why: planWhys(l.rules)[0] || '', value: valueOf(n), max: l.value, kind: 'limit', unit: s.unit, digits: /_g$|pct/.test(n) ? 1 : 0, labelExtra: l.clinician ? uiChip('doctor or dietitian', 'plum') : '', wordExtra: `<span class="muted">so far today</span>${l.ideal != null ? `<span class="muted">· ideally ${uiFmtNum(l.ideal, 1)}</span>` : ''}<button type="button" class="btn link small" data-sheet="limit:${uiEsc(n)}">Why (${l.rules.length})</button>` }); }),
    ...targets.map(([n, t]) => { const s = planSplitLabel(n); planSheetRules['target:' + n] = { title: `${s.name}: at least ${uiFmtNum(t.min, 1)}${t.max != null ? `, at most ${uiFmtNum(t.max, 1)}` : ''}${s.unit ? ' ' + s.unit : ''} per ${t.per}`, rules: t.rules, whys: planWhys(t.rules) }; return uiMeter({ label: uiEsc(s.name), why: planWhys(t.rules)[0] || '', value: valueOf(n), max: t.min, kind: 'target', unit: s.unit, digits: /_g$|pct/.test(n) ? 1 : 0, labelExtra: t.clinician ? uiChip('doctor or dietitian', 'plum') : '', wordExtra: `<span class="muted">so far today</span>${t.max != null ? `<span class="muted">· at most ${uiFmtNum(t.max, 1)}</span>` : ''}<button type="button" class="btn link small" data-sheet="target:${uiEsc(n)}">Why (${t.rules.length})</button>` }); })
  ];

  const tagChip = (tag, v, tone) => { planSheetRules['tag:' + tag] = { title: uiTagLabel(tag), rules: v.rules, tag, tone }; return `<button type="button" class="chip ${tone}" data-sheet="tag:${uiEsc(tag)}">${uiEsc(uiTagLabel(tag))}</button>`; };

  root.innerHTML = `
    ${uiPageHeader(`Plan for ${uiEsc(person.name)}`, `${plan.modules.length ? plan.modules.map(m => `<button type="button" class="btn link module-name" data-edu="${uiEsc(m.id)}" aria-label="About ${uiEsc(m.name)}">${uiEsc(m.name)}</button>`).join(', ') : 'No modules selected'}.${plan.disabledModules.length ? ` Turned off: ${plan.disabledModules.map(d => uiEsc(uiModuleName(d.id))).join(', ')}.` : ''} Every rule below shows its source.`, `<button type="button" class="btn small" id="plan-print">${uiIcon('print')}Print</button><a class="btn small" href="#/people/${uiEsc(person.id)}/conditions">${uiIcon('edit')}Edit</a>`)}
    ${plan.notices.filter(n => n.level === 'block').length ? `<div class="stack">${plan.notices.filter(n => n.level === 'block').map(n => uiNoticeHTML(n, { person })).join('')}</div>` : ''}
    ${dietStrictCardsHTML(person, plan)}
    ${!person.setup_complete ? `<div class="notice warn">${uiIcon('alert', { cls: 'notice-icon' })}<div class="notice-head">Caution</div><div class="notice-body"><div>Setup for ${uiEsc(person.name)} is not finished, so this plan may be missing steps.</div><a class="btn small" href="#/people/${uiEsc(person.id)}/basics">Finish setup</a></div></div>` : ''}
    ${customModules.length ? uiSection('Your own diets', `<div class="stack-2">${customModules.map(m => planCustomCard(m, customDefs.get(m.id), plan)).join('')}</div>`, { id: 'plan-custom-h' }) : ''}

    ${uiSection('Your numbers', `${planCalorieHTML(person, plan)}${numberMeters.length ? `<div class="numbers-grid">${numberMeters.join('')}</div><p class="small muted">"So far today" is summed from what is logged on the Today screen. Limits are "at most"; targets are "at least".</p>` : uiEmptyState('No daily limits or targets are active. Numbers appear when a module carries one, or when a number from your doctor or dietitian is entered.', `<a class="btn small" href="#/people/${uiEsc(person.id)}/clinician">Enter those numbers</a>`)}
      ${periodic.map(x => `<h3>Per ${uiEsc(x.per)}</h3><div class="list boxed">${x.limits.map(([n, l]) => { planSheetRules['p:' + x.per + ':' + n] = { title: `${uiNutrientLabel(n)}: at most ${uiFmtNum(l.value, 1)} per ${x.per}`, rules: l.rules, whys: planWhys(l.rules) }; return `<div class="list-row"><div class="list-main"><span class="list-title">${uiEsc(uiNutrientLabel(n))}</span> <span class="num">at most ${uiFmtNum(l.value, 1)}</span> ${l.clinician ? uiChip('doctor or dietitian', 'plum') : ''}${planWhys(l.rules)[0] ? `<div class="meter-why">${uiEsc(planWhys(l.rules)[0])}</div>` : ''}</div><div class="list-actions"><button type="button" class="btn link small" data-sheet="p:${uiEsc(x.per)}:${uiEsc(n)}">Why (${l.rules.length})</button></div></div>`; }).join('')}${x.targets.map(([n, t]) => { planSheetRules['pt:' + x.per + ':' + n] = { title: `${uiNutrientLabel(n)}: at least ${uiFmtNum(t.min, 1)} per ${x.per}`, rules: t.rules, whys: planWhys(t.rules) }; return `<div class="list-row"><div class="list-main"><span class="list-title">${uiEsc(uiNutrientLabel(n))}</span> <span class="num">at least ${uiFmtNum(t.min, 1)}</span>${planWhys(t.rules)[0] ? `<div class="meter-why">${uiEsc(planWhys(t.rules)[0])}</div>` : ''}</div><div class="list-actions"><button type="button" class="btn link small" data-sheet="pt:${uiEsc(x.per)}:${uiEsc(n)}">Why (${t.rules.length})</button></div></div>`; }).join('')}</div>`).join('')}`, { id: 'plan-numbers' })}

    ${uiSection('Avoid', `<h3>Hard stops ${uiChip(String(avoidHard.length), 'stop')}</h3>
      ${avoidHard.length ? `<div class="chip-cloud">${avoidHard.map(([tag, v]) => tagChip(tag, v, 'stop')).join('')}</div>` : '<p class="muted small">None.</p>'}
      <h3>Soft, shown as a caution ${uiChip(String(avoidSoft.length), 'caution')}</h3>
      ${avoidSoft.length ? `<div class="chip-cloud">${avoidSoft.map(([tag, v]) => tagChip(tag, v, 'caution')).join('')}</div>` : '<p class="muted small">None.</p>'}
      <p class="small muted">Tap a chip to see the rules behind it.</p>`, { id: 'plan-avoid-h' })}

    ${uiSection(`Prefer ${uiChip(String(prefer.length), 'pass')}`, prefer.length ? `<div class="chip-cloud">${prefer.map(([tag, v]) => tagChip(tag, v, 'pass')).join('')}</div>` : '<p class="muted small">None.</p>', { id: 'plan-prefer-h' })}

    ${uiSection('Timing', `<div class="list boxed">${uiRulesList(plan.timing)}</div>`, { id: 'plan-timing-h' })}
    ${uiSection('Habits', `<div class="list boxed">${uiRulesList(plan.behavior)}</div>`, { id: 'plan-habits-h' })}
    ${plan.info.length ? uiSection('Information and pending rules', `<div class="list boxed">${uiRulesList(plan.info)}</div>`, { id: 'plan-info-h' }) : ''}

    ${uiSection('Conflicts', plan.conflicts.length ? `<div class="stack-2">${plan.conflicts.map(c => `<div class="card conflict">
        <div class="conflict-side">${uiEsc(c.aName)}</div><div class="conflict-vs">versus</div><div class="conflict-side">${uiEsc(c.bName)}</div>
        <div class="conflict-foot">${planConflictBadge(c)} <span class="small muted">${uiEsc(c.type)}${c.param ? `, about ${uiEsc(uiNutrientLabel(c.param))}` : ''}. Resolution: ${uiEsc(c.resolution)}.</span></div>
        <div class="conflict-foot">${uiEsc(c.text)}</div>
        ${c.status === 'needs-ack' ? `<div class="conflict-foot"><button class="btn small" type="button" data-ack="${uiEsc(c.ackKey)}">I understand</button></div>` : ''}
      </div>`).join('')}</div>` : '<p class="muted small">No conflicts between the selected modules.</p>', { id: 'plan-conflicts-h' })}

    ${uiSection('Phases', plan.phases.length ? `<div class="stack-2">${plan.phases.map(ph => planPhaseCard(ph)).join('')}</div>` : '<p class="muted small">No phased protocols are active.</p>', { id: 'plan-phases-h' })}

    ${uiSection('Modes', plan.modes.length ? `<div class="stack-2">${plan.modes.map(md => planModeCard(md, person)).join('')}</div>` : '<p class="muted small">No two-mode conditions are active.</p>', { id: 'plan-modes-h' })}

    ${uiSection('Set aside', plan.suppressed.length ? `<div class="list boxed">${plan.suppressed.map(s => `<div class="rule"><div class="rule-text">${uiEsc(s.text || s.rule)}</div><div class="rule-meta">${uiChip(s.moduleName || uiModuleName(s.module), 'neutral')}<span>${uiEsc(planSuppressReason(s))}</span></div>${s.sources && s.sources.length ? uiSourcesDisclosure(s.sources, !!s.verify) : ''}</div>`).join('')}</div>` : '<p class="muted small">Nothing was set aside.</p>', { id: 'plan-aside-h' })}

    ${uiSection('Numbers from your doctor or dietitian still missing', plan.tier2.missing.length ? `<div class="list boxed">${plan.tier2.missing.map(t => `<div class="rule"><div class="rule-text"><strong>${uiEsc(t.label)}</strong> ${uiChip('not applied', 'caution')}</div><div class="small muted">${uiEsc(t.moduleName)}. ${t.consensus ? 'Published range: ' + uiEsc(t.consensus) + '.' : ''} ${uiEsc(t.why || '')}</div></div>`).join('')}</div>
      <div><a class="btn primary" href="#/people/${uiEsc(person.id)}/clinician">Enter those numbers</a></div>` : '<p class="muted small">None. Every Tier 2 rule either has a number or does not apply.</p>', { id: 'plan-tier2-h' })}

    ${uiSection('Stacked restrictions', `<div class="card tight">
      <div class="row"><strong>${plan.restrictionLoad.count} diet${plan.restrictionLoad.count === 1 ? '' : 's'} that cut out whole food groups</strong> ${plan.restrictionLoad.warn ? uiChip('check in', 'caution') : uiChip('ok', 'pass')}</div>
      ${plan.restrictionLoad.modules.length ? `<div class="small muted">${plan.restrictionLoad.modules.map(m => uiEsc(uiModuleName(m))).join(', ')}</div>` : ''}
      ${loadNotice ? uiNoticeHTML(loadNotice) : `<p class="small muted">The plan checks in when ${plan.restrictionLoad.threshold || 3} or more run at once.</p>`}
    </div>`, { id: 'plan-load-h' })}
    <p class="small muted">Every rule above is shown with its source. A rule marked VERIFY carries a citation that was not confirmed against a primary source and should be checked before the number is trusted.</p>
    ${planPrintSheet(person, plan, limits, targets, avoidHard, avoidSoft)}
  `;
  root.classList.add('print-sheet');

  uiBindNoticeActions(root, person);
  dietBindStrictCards(root, person);
  root.querySelectorAll('[data-edu]').forEach(b => b.addEventListener('click', () => {
    const m = uiState.conditionsById.get(b.getAttribute('data-edu')) || (plan.modules.find(x => x.id === b.getAttribute('data-edu')) ? { id: b.getAttribute('data-edu'), name: b.textContent, education: {}, evidence: { rating: 'user-defined' } } : null);
    if (m) uiModal(`<div class="article-modal">${learnArticleHTML(m)}<p class="small"><a href="#/learn/${uiEsc(m.id)}">Open the full article on the Learn screen</a></p></div>`, { title: m.name, label: 'About ' + m.name });
  }));
  root.querySelector('#plan-print').addEventListener('click', () => window.print());
  root.querySelectorAll('[data-sheet]').forEach(b => b.addEventListener('click', () => {
    const s = planSheetRules[b.dataset.sheet];
    if (!s) return;
    const def = s.tag && uiState.matcher ? uiState.matcher.tagDef(s.tag) : null;
    uiModal(`${s.tag ? `<div class="row">${uiChip(s.tone === 'stop' ? 'hard stop' : s.tone === 'caution' ? 'soft' : 'prefer', s.tone)} <code class="small">${uiEsc(s.tag)}</code></div>` : ''}${def && def.description ? `<p class="small muted">${uiEsc(def.description)}</p>` : ''}${(s.whys || []).length ? `<div class="plain-why"><h3>In plain words</h3>${s.whys.map(w => `<p>${uiEsc(w)}</p>`).join('')}</div>` : ''}${s.note ? `<p class="small">${uiEsc(s.note)}</p>` : ''}<h3>Rules behind this (${(s.rules || []).length})</h3>${uiRulesList(s.rules)}`, { title: s.title });
  }));
  root.querySelectorAll('[data-phase-check]').forEach(sel => sel.addEventListener('change', () => {
    person.phases = person.phases || {};
    const cur = person.phases[sel.dataset.phaseCheck] || { phase: (uiState.conditionsById.get(sel.dataset.phaseCheck).phases[0] || {}).id, started: uiIsoDate(uiToday()) };
    const n = Number(sel.value);
    if (n > 0) { cur.check_in_weeks = n; cur.check_in_from = uiIsoDate(uiToday()); } else { cur.check_in_weeks = 0; delete cur.check_in_from; }   // 0 is an explicit "no reminder"; a missing key means the 4-week default
    person.phases[sel.dataset.phaseCheck] = cur;
    uiPersist(); uiToast(n > 0 ? `The app will ask how it is going in ${n} weeks.` : 'No reminder. The phase stays until you change it.'); uiState.rerender();
  }));
  root.querySelectorAll('[data-phase-keep]').forEach(b => b.addEventListener('click', () => {
    person.phases = person.phases || {};
    const cur = person.phases[b.dataset.phaseKeep] || {};
    cur.check_in_from = uiIsoDate(uiToday());
    person.phases[b.dataset.phaseKeep] = cur;
    uiPersist(); uiToast(cur.check_in_weeks ? `Keeping going. The app will ask again in ${cur.check_in_weeks} weeks.` : 'Keeping going.'); uiState.rerender();
  }));
  root.querySelectorAll('[data-phase-next]').forEach(b => b.addEventListener('click', () => {
    person.phases = person.phases || {};
    const prev = person.phases[b.dataset.phaseNext] || {};
    person.phases[b.dataset.phaseNext] = { phase: b.dataset.next, started: uiIsoDate(uiToday()), ...(Object.prototype.hasOwnProperty.call(prev, 'check_in_weeks') ? { check_in_weeks: prev.check_in_weeks, ...(prev.check_in_weeks ? { check_in_from: uiIsoDate(uiToday()) } : {}) } : {}) };
    uiPersist(); uiToast('Phase updated.'); uiState.rerender();
  }));
  root.querySelectorAll('[data-phase-restart]').forEach(b => b.addEventListener('click', () => {
    if (!window.confirm('Restart this phase from today?')) return;
    person.phases = person.phases || {};
    person.phases[b.dataset.phaseRestart] = { phase: b.dataset.phase, started: uiIsoDate(uiToday()) };
    uiPersist(); uiToast('Phase restarted.'); uiState.rerender();
  }));
  root.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
    person.modes = person.modes || {};
    const mode = b.dataset.mode;
    const mod = uiState.conditionsById.get(b.dataset.module);
    const def = mod && mod.modes ? (mod.modes.find(x => x.id === mode) || {}) : {};
    person.modes[b.dataset.module] = def.expires_days ? { mode, since: uiIsoDate(uiToday()) } : mode;
    uiPersist(); uiToast('Mode changed.'); uiState.rerender();
  }));
}

// The plain-words "why" for a number (2026-09 audit, dietitian review): each rule behind it may carry one, copied from its
// module's own article (the validator checks that). Distinct lines, in rule order.
function planWhys(rules) { return [...new Set((rules || []).map(r => r && r.why).filter(Boolean))]; }

// One page, black on white: numbers, hard exclusions, soft avoids, timing rules, name and date. Shown only when printing.
function planPrintSheet(person, plan, limits, targets, avoidHard, avoidSoft) {
  const date = uiToday().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const rows = [
    ...limits.map(([n, l]) => `<tr><td>${uiEsc(uiNutrientLabel(n))}</td><td>at most ${uiFmtNum(l.value, 1)}${l.ideal != null ? ` (ideally ${uiFmtNum(l.ideal, 1)})` : ''} per ${uiEsc(l.per)}</td><td>${l.clinician ? 'clinician' : 'guideline'}</td></tr>`),
    ...targets.map(([n, t]) => `<tr><td>${uiEsc(uiNutrientLabel(n))}</td><td>at least ${uiFmtNum(t.min, 1)}${t.max != null ? `, at most ${uiFmtNum(t.max, 1)}` : ''} per ${uiEsc(t.per)}</td><td>${t.clinician ? 'clinician' : 'guideline'}</td></tr>`)
  ];
  return `<section class="print-only print-sheet" aria-hidden="true">
    <div class="print-head"><h1>Peace Meal plan for ${uiEsc(person.name)}</h1><span>${uiEsc(date)}</span></div>
    <p>${plan.modules.length ? plan.modules.map(m => uiEsc(m.name)).join(', ') : 'No modules selected'}.</p>
    <h2>Numbers</h2>
    ${rows.length ? `<table><thead><tr><th>Nutrient</th><th>Number</th><th>Set by</th></tr></thead><tbody>${rows.join('')}</tbody></table>` : '<p>No daily limits or targets are active.</p>'}
    <div class="print-cols">
      <div><h2>Hard exclusions (${avoidHard.length})</h2>${avoidHard.length ? `<ul>${avoidHard.map(([tag]) => `<li>${uiEsc(uiTagLabel(tag))}</li>`).join('')}</ul>` : '<p>None.</p>'}</div>
      <div><h2>Soft avoids (${avoidSoft.length})</h2>${avoidSoft.length ? `<ul>${avoidSoft.map(([tag]) => `<li>${uiEsc(uiTagLabel(tag))}</li>`).join('')}</ul>` : '<p>None.</p>'}</div>
    </div>
    <h2>Timing</h2>
    ${plan.timing.length ? `<ul>${plan.timing.map(r => `<li>${uiEsc(r.text || r.rule)}</li>`).join('')}</ul>` : '<p>No timing rules.</p>'}
    <div class="print-foot">Printed from Peace Meal on ${uiEsc(date)}. For general wellness and education; it does not diagnose or treat any condition. Numbers from your doctor or dietitian are marked. Every rule cites a source in the app.</div>
  </section>`;
}

function planPhaseCard(ph) {
  const mod = uiState.conditionsById.get(ph.module);
  const phases = (mod && mod.phases) || [];
  const curIdx = phases.findIndex(p => p.id === ph.phase);
  const status = ph.check_in_due ? uiChip('check-in due', 'caution') : uiChip('active, no end date', 'olive');
  const opts = [[0, 'No reminder'], [2, 'Every 2 weeks'], [4, 'Every 4 weeks'], [6, 'Every 6 weeks'], [8, 'Every 8 weeks'], [12, 'Every 12 weeks']];
  return `<div class="card">
    <div class="row"><strong>${uiEsc(ph.moduleName)}</strong> ${status}</div>
    <ol class="timeline">${phases.map((p, i) => { const sug = p.min_weeks && p.max_weeks ? `${p.min_weeks} to ${p.max_weeks} weeks` : p.min_weeks ? `at least ${p.min_weeks} weeks` : p.max_weeks ? `up to ${p.max_weeks} weeks` : ''; return `<li class="${i < curIdx ? 'done' : i === curIdx ? 'current' : ''}"><div class="timeline-title">${uiEsc(p.label || p.id)}${i === curIdx ? ' (now)' : ''}</div><div class="timeline-sub">${i === curIdx ? `Since ${uiEsc(ph.started)}, ${ph.weeks} weeks. ` : ''}${sug ? `The protocol usually runs this for ${sug}; ` : ''}it stays until you change it.</div></li>`; }).join('')}</ol>
    ${ph.check_in_due ? uiNoticeHTML({ level: 'warn', text: `Check-in: how is the ${ph.label} phase going? Keep going, or move on. Nothing changes until you choose.` }) : ''}
    <div class="field"><label for="ph-check-${uiEsc(ph.module)}">Ask me how it is going</label><select id="ph-check-${uiEsc(ph.module)}" data-phase-check="${uiEsc(ph.module)}" style="width:auto">${opts.map(([v, l]) => `<option value="${v}" ${(ph.check_in_weeks || 0) === v ? 'selected' : ''}>${l}</option>`).join('')}</select><div class="hint">A reminder only. The phase does not end by itself.</div></div>
    <div class="btn-row">
      ${ph.check_in_due ? `<button class="btn small primary" type="button" data-phase-keep="${uiEsc(ph.module)}">Keep going${ph.check_in_weeks ? `, ask again in ${ph.check_in_weeks} weeks` : ''}</button>` : ''}
      ${ph.next ? `<button class="btn small ${ph.check_in_due ? '' : 'primary'}" type="button" data-phase-next="${uiEsc(ph.module)}" data-next="${uiEsc(ph.next)}">Move to ${uiEsc(ph.nextLabel)}</button>` : '<span class="small muted">Final phase.</span>'}
      <button class="btn small" type="button" data-phase-restart="${uiEsc(ph.module)}" data-phase="${uiEsc(ph.phase)}">Restart phase</button>
    </div>
  </div>`;
}

// Calorie target line, shown only when the person turned a calorie target on (person.goals.calorie_target is not 'off').
function planCalorieHTML(person, plan) {
  const goals = person.goals || {};
  const mode = goals.calorie_target || 'off';
  if (mode === 'off') return '';
  if (plan.isDisabled && plan.isDisabled('calorie-targets')) return uiNoticeHTML({ level: 'info', text: 'A calorie target is turned on, but calorie targets are disabled for this profile, so none is shown.' });
  if (mode === 'manual') {
    const k = Number(person.manual_kcal);
    return k > 0 ? `<div class="card tight"><div class="row"><strong>Calorie target: ${uiFmtNum(k)} kcal a day</strong> ${uiChip('entered by you', 'neutral')}</div></div>` : '';
  }
  const est = energyTarget(person, { goal: mode === 'loss' ? 'loss' : 'maintain', deficit: goals.deficit });
  if (est.kcal == null) return `<div class="card tight"><div class="row"><strong>Calorie target</strong> ${uiChip('not available', 'caution')}</div><div class="small muted">${uiEsc(est.reason || 'Needs sex, age, weight, and height on the Basics step.')}</div></div>`;
  return `<div class="card tight">
    <div class="row"><strong>Calorie target: about ${uiFmtNum(est.kcal)} kcal a day</strong> ${uiChip('estimate', 'neutral')} <span class="small muted">${mode === 'loss' ? 'for gradual weight loss' : 'to maintain weight'}</span></div>
    <details><summary>How this was worked out</summary><ul class="small">${(est.notes || []).map(n => `<li>${uiEsc(n)}</li>`).join('')}<li>An estimate from a published equation, not a measurement. Appetite, illness, and medications change real needs. A number from your doctor or dietitian always wins.</li></ul></details>
  </div>`;
}

// A diet the person defined. Shown with a "Defined by you" chip instead of an evidence rating.
function planCustomCard(m, def, plan) {
  const rules = (plan.applied || []).filter(r => r.module === m.id);
  return `<div class="card tight">
    <div class="row"><strong>${uiEsc(m.name)}</strong> ${uiUserDefinedBadge()}</div>
    ${def && def.summary ? `<div class="small">${uiEsc(def.summary)}</div>` : ''}
    <div class="small muted">Soft rules you wrote yourself. Not evidence-rated. They never loosen an allergen or a condition rule.</div>
    ${rules.length ? `<details><summary>Rules from this diet (${rules.length})</summary>${uiRulesList(rules)}</details>` : ''}
  </div>`;
}

function planConflictBadge(c) {
  const map = { blocked: ['stop', 'hard conflict, no number set'], suppressed: ['caution', 'one side set aside'], winner: ['caution', 'one side wins'], 'time-limited': ['info', 'time-limited'], 'needs-ack': ['caution', 'needs your acknowledgment'], acknowledged: ['neutral', 'acknowledged'], pairing: ['info', 'pairing advice'], compatible: ['pass', 'compatible'], subsumed: ['neutral', 'subsumed'], info: ['neutral', 'info'] };
  const [cls, word] = map[c.status] || ['neutral', c.status];
  return uiChip(word, cls);
}

function planModeCard(md, person) {
  const mod = uiState.conditionsById.get(md.module);
  const modes = (mod && mod.modes) || [];
  const stored = (person.modes || {})[md.module];
  const since = stored && typeof stored === 'object' ? stored.since : null;
  return `<div class="card tight">
    <div class="row"><strong>${uiEsc(mod ? mod.name : md.module)}</strong> ${uiChip(md.mode, 'info')}${since && stored.mode === md.mode ? `<span class="small muted">since ${uiEsc(since)}</span>` : ''}</div>
    <div class="btn-row">${modes.map(x => `<button class="btn small ${x.id === md.mode ? 'olive' : ''}" type="button" data-mode="${uiEsc(x.id)}" data-module="${uiEsc(md.module)}" ${x.id === md.mode ? 'aria-pressed="true"' : 'aria-pressed="false"'}>${uiEsc(x.label || x.id)}${x.expires_days ? ` (${x.expires_days}-day check-in)` : ''}</button>`).join('')}</div>
  </div>`;
}

function planSuppressReason(s) {
  const r = s.reason || {};
  switch (r.reason) {
    case 'medication': return `Set aside because you answered yes to: "${r.text}"`;
    case 'conflict': return `Set aside because ${uiModuleName(r.by)} takes precedence on this number.`;
    case 'hard-conflict': return `Set aside: hard conflict with ${uiModuleName(r.with)}. A number from your doctor or dietitian resolves it.`;
    case 'feature-disabled': return `Set aside because ${String(r.feature).replace(/-/g, ' ')} is turned off for this profile.`;
    case 'winner': return `Set aside while ${uiModuleName(r.by)} rules apply.`;
    case 'screen': return 'Set aside because of the screening result.';
    case 'clinician-number-governs': return `Set aside: your doctor or dietitian's number (${String(r.param || '').replace(/_/g, ' ')}) governs this nutrient.`;
    default: return 'Set aside.';
  }
}
