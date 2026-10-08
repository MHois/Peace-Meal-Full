// Home: greeting, plan summary tiles, notices, "today so far" ring, quick actions. Also the Welcome screen (no people yet).
import { uiState, uiEsc, uiActivePerson, uiSetActive, uiPlanFor, uiNoticeHTML, uiBindNoticeActions, uiIcon, uiBrandMark, uiPageHeader, uiSection, uiStatTile, uiRing, uiGreeting, uiFmtNum, uiIsoDate, uiToday } from './common.js';
import { todayTargetInfo } from './today.js';
import { settingsImportFile, settingsBackupReminderHTML, settingsBindBackupReminder } from './settings.js';

// "Bring my data": the import half of moving from a Safari tab to the Home Screen app, or from one device to another.
// Same backup file as Settings (store.js exportJSON and importJSON).
function homeBringDataHTML() {
  return `<div class="bring-data"><label class="btn big" for="welcome-import">${uiIcon('share')}Bring my data</label><input id="welcome-import" type="file" accept="application/json,.json" class="visually-hidden">
    <p class="small muted">Used this app before, in a Safari tab or on another device? Choose the backup file you saved there.</p></div>`;
}
function homeBindBringData(root) {
  const inp = root.querySelector('#welcome-import');
  if (inp) inp.addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f) settingsImportFile(f, () => { e.target.value = ''; }); });
}

// How many conditions and eating patterns a person can choose: the two groups on the Conditions step.
function homeConditionCount() {
  return (uiState.data.conditions || []).filter(m => m.category === 'condition' || m.category === 'pattern').length;
}

export function renderWelcomeScreen(root) {
  if (uiState.lite) { renderLiteWelcome(root); return; }
  root.innerHTML = `
    <section class="welcome" aria-labelledby="welcome-h">
      ${uiBrandMark({ label: 'Peace Meal' })}
      <div>
        <h1 id="welcome-h">Peace Meal</h1>
        <p class="welcome-lede">One table, everyone's funky dietary needs.</p>
        <p class="welcome-sub">Celiac at one end of the table, reflux at the other, a kid who won't touch anything green, and you in the middle trying to cook one dinner. Peace Meal plans the week so everybody eats, nobody gets sick, and the science behind every choice is one tap away.</p>
      </div>
      <ul class="welcome-points">
        <li>${uiIcon('people')}<span><strong>Families who eat together.</strong> A profile for each person, and one week of meals that clears every plate at the table. Guests too.</span></li>
        <li>${uiIcon('cite')}<span><strong>Anyone eating for a condition.</strong> ${homeConditionCount()} conditions and eating patterns, from celiac and diabetes to kidney disease and IBS, built from medical research and society guidelines. Every recommendation shows its source and how strong the evidence is.</span></li>
        <li>${uiIcon('note')}<span><strong>People chasing a food trigger.</strong> Log meals and symptoms, then see which foods keep showing up before the bad days.</span></li>
        <li>${uiIcon('calendar')}<span><strong>Whoever does the cooking.</strong> Meals that fit your time, skill, kitchen, and budget, with leftovers planned in. Change a day's cooking time right on the week.</span></li>
        <li>${uiIcon('cart')}<span><strong>The grocery run.</strong> One list for the week, scaled to who is eating each day, with pantry matching and a running change log.</span></li>
        <li>${uiIcon('check-circle')}<span><strong>The label check.</strong> Paste an ingredient list from any package and get a plain answer: fine, caution, or no, and why. Allergens are never overridden.</span></li>
        <li>${uiIcon('leaf')}<span><strong>About 3,100 recipes.</strong> Peace Meal's own, the NHS, Parent Club Scotland, the NHLBI, the VA Healthy Teaching Kitchen, the Wikibooks Cookbook, and yours. Calorie targets, weight and exercise tracking, favorites, spice level, and cuisines you love or skip.</span></li>
        <li>${uiIcon('breathe')}<span><strong>A minute to breathe.</strong> A short visual reset for the days when dinner is the last straw.</span></li>
      </ul>
      <a class="btn primary big" href="#/people/new">Set up the first person</a>
      ${homeBringDataHTML()}
      <p class="small muted">Everything stays on this device. Nothing is sent anywhere. Any medical targets, like a sodium or protein limit, come from your doctor or dietitian. The app never makes those numbers up.</p>
    </section>`;
  homeBindBringData(root);
}

// The lite version's first screen: one person, plain words, one button.
function renderLiteWelcome(root) {
  root.innerHTML = `
    <section class="welcome" aria-labelledby="welcome-h">
      ${uiBrandMark({ label: 'Peace Meal for one' })}
      <div>
        <h1 id="welcome-h">Peace Meal for one <span class="chip plum lite-tag">Lite</span></h1>
        <p class="welcome-lede">Meals that fit your body.</p>
        <p class="welcome-sub">If certain foods make you sick and you are juggling a list of things you cannot eat, this app does the remembering for you. It plans a week of meals and snacks that fit your rules, keeps track of what you ate and how you felt, watches your weight, and turns all of it into a report you can hand to your doctor.</p>
      </div>
      <ul class="welcome-points">
        <li>${uiIcon('list')}<span><strong>Tell it once what you cannot eat.</strong> Allergies, medical conditions, and anything else you avoid. The app has ${homeConditionCount()} conditions and diets built in, each from published medical guidance.</span></li>
        <li>${uiIcon('calendar')}<span><strong>Get a week of meals and snacks that fit.</strong> Every one is checked against your list. Do not like one? Tap the arrows to swap it, or the heart to see it more often.</span></li>
        <li>${uiIcon('clock')}<span><strong>Log your day in a minute.</strong> "I ate this" for each meal, "How do you feel?" when something comes on, and your weight in one box.</span></li>
        <li>${uiIcon('cite')}<span><strong>Print a report for your medical provider.</strong> What you ate, what you felt and when, your weight over time, and which foods keep showing up before a bad day.</span></li>
        <li>${uiIcon('check-circle')}<span><strong>Check a package at the store.</strong> Paste the ingredient list, or take a photo of it, and get a plain answer: fine, caution, or no, and why.</span></li>
      </ul>
      <a class="btn primary big" href="#/people/new">Start: tell it about you</a>
      ${homeBringDataHTML()}
      <p class="small muted">Everything stays on this phone or computer. Nothing is sent anywhere. The app records and plans; it does not diagnose or treat. Any medical targets come from your doctor or dietitian.</p>
    </section>`;
  homeBindBringData(root);
}

function homeTodayRing(person, plan) {
  const today = uiIsoDate(uiToday());
  const entries = (uiState.profile.diary || []).filter(e => e.person === person.id && e.date === today);
  let kcal = 0, sodium = 0;
  for (const e of entries) { kcal += (e.nutrients && e.nutrients.kcal) || 0; sodium += (e.nutrients && e.nutrients.sodium_mg) || 0; }
  const info = todayTargetInfo(person, plan);
  const count = !!(person.goals && person.goals.count_exercise);
  const exerciseKcal = count ? (uiState.profile.exercise || []).filter(e => e.person === person.id && e.date === today).reduce((s, e) => s + (Number(e.kcal) || 0), 0) : 0;
  // "1 entry today" next to 0 kcal looked like a counting error when the entry had no numbers; it says so now.
  const noNum = entries.filter(e => !e.nutrients).length;
  const entryWords = entries.length ? `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} today${noNum ? `, ${noNum === entries.length ? (noNum === 1 ? 'without' : 'all without') : `${noNum} without`} nutrition numbers` : ''}` : '';
  let ring, text;
  if (info.state === 'ok' && info.kcal > 0) {
    const target = info.kcal + exerciseKcal;
    ring = uiRing({ value: kcal, max: target, kind: 'kcal', unit: 'kcal', label: `of ${uiFmtNum(target)} kcal target`, href: '#/today', size: 120 });
    text = `<p><strong>${uiFmtNum(kcal)} kcal</strong> logged so far today.</p><p class="small muted">${entries.length ? `${entryWords}.` : 'Nothing logged yet today.'} The target is an estimate, not a prescription.</p>`;
  } else if (plan.limits.sodium_mg) {
    const lim = plan.limits.sodium_mg.value;
    ring = uiRing({ value: sodium, max: lim, kind: 'limit', unit: 'mg', label: `sodium of ${uiFmtNum(lim)} mg limit`, href: '#/today', size: 120 });
    text = `<p><strong>${uiFmtNum(sodium)} mg sodium</strong> logged so far today.</p><p class="small muted">${entries.length ? `${entryWords}; ${uiFmtNum(kcal)} kcal.` : 'Nothing logged yet today.'}${plan.limits.sodium_mg.clinician ? ' Limit set by your doctor or dietitian.' : ''}</p>`;
  } else {
    ring = '';
    text = `<p><strong>${uiFmtNum(kcal)} kcal</strong> logged so far.</p><p class="small muted">No calorie target or sodium limit is active, so there is no ring to fill. ${info.state === 'off' ? '<a href="#/today">Set a calorie target</a> if you want one.' : ''}</p>`;
  }
  return `<div class="card"><div class="ring-row">${ring}<div class="ring-text">${text}<a class="btn small" href="#/today">${uiIcon('clock')}Open Today</a></div></div></div>`;
}

export function renderHomeScreen(root) {
  const person = uiActivePerson();
  const people = uiState.profile.people;
  const plan = uiPlanFor(person);
  const notices = plan ? plan.notices : [];
  const blocks = notices.filter(n => n.level === 'block');
  const warns = notices.filter(n => n.level === 'warn');
  const infos = notices.filter(n => n.level === 'info');
  const hard = Object.values(plan.avoid || {}).filter(v => v.hard).length + (plan.otherAllergies || []).length;
  const numbers = Object.keys(plan.limits || {}).length + Object.keys(plan.targets || {}).length;
  const missing = (plan.tier2 && plan.tier2.missing || []).length;
  const dateLine = uiToday().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const actions = `${people.length > 1 ? `<label class="visually-hidden" for="home-person">Active person</label><select id="home-person" style="width:auto">${people.map(p => `<option value="${uiEsc(p.id)}" ${p.id === person.id ? 'selected' : ''}>${uiEsc(p.name)}</option>`).join('')}</select>` : ''}
    ${person.setup_complete ? `<a class="btn small" href="#/people/${uiEsc(person.id)}/basics">${uiIcon('edit')}Edit profile</a>` : `<a class="btn small primary" href="#/people/${uiEsc(person.id)}/basics">Finish setup</a>`}`;

  root.innerHTML = `
    ${uiPageHeader(uiGreeting(person.name), `${dateLine}. ${plan.modules.length ? plan.modules.map(m => uiEsc(m.name)).join(', ') + '.' : 'No conditions or patterns selected yet.'}${(person.allergens || []).length ? ` ${person.allergens.length} allergen${person.allergens.length > 1 ? 's' : ''} on file.` : ''}`, actions)}
    ${person.setup_complete ? '' : uiNoticeHTML({ level: 'warn', text: 'Setup is not finished. The plan is built from what has been entered so far.' })}
    ${settingsBackupReminderHTML()}
    <div class="tiles" aria-label="Plan summary">
      ${uiStatTile({ value: uiFmtNum((plan.applied || []).length), label: 'Rules applied', note: `${plan.modules.length} module${plan.modules.length === 1 ? '' : 's'}`, href: '#/plan' })}
      ${uiStatTile({ value: uiFmtNum(hard), label: 'Hard exclusions', note: hard ? 'never overridden' : 'none', tone: hard ? 'stop' : '', href: '#/plan' })}
      ${missing ? uiStatTile({ value: uiFmtNum(missing), label: 'Doctor or dietitian numbers missing', note: 'not applied yet', tone: 'caution', href: `#/people/${uiEsc(person.id)}/clinician` }) : uiStatTile({ value: uiFmtNum(numbers), label: 'Numbers set', note: numbers ? 'limits and targets' : 'none active', href: '#/plan' })}
    </div>
    ${uiSection('Notices', notices.length ? `<div class="stack" id="home-notices">${blocks.map(n => uiNoticeHTML(n, { person })).join('')}${warns.map(n => uiNoticeHTML(n, { person })).join('')}${infos.map(n => uiNoticeHTML(n, { person })).join('')}</div>` : '<p class="muted">No notices. The plan built without conflicts or missing numbers.</p>', { id: 'home-notices-h' })}
    ${uiSection('Today so far', homeTodayRing(person, plan), { id: 'home-today-h' })}
    ${uiSection('Quick actions', `<div class="quick-actions">
      <a class="quick-action" href="#/check">${uiIcon('check-circle')}<span>Check a food</span><small>Paste an ingredient list</small></a>
      <a class="quick-action" href="#/week">${uiIcon('calendar')}<span>Plan this week</span><small>Meals that fit your time</small></a>
      <a class="quick-action" href="#/grocery">${uiIcon('cart')}<span>Grocery list</span><small>From this week's meals</small></a>
      ${people.length > 1 ? `<a class="quick-action" href="#/together">${uiIcon('people')}<span>Household week</span><small>Who is at which meal</small></a>` : ''}
      <a class="quick-action" href="#/breathe">${uiIcon('breathe')}<span>Breathe</span><small>A short visual reset</small></a>
    </div>`, { id: 'home-actions-h' })}
    <p class="small muted">This app is for general wellness and education. It does not diagnose or treat any condition. Any medical targets, like a sodium or protein limit, come from your doctor or dietitian, never from the app.</p>
  `;

  const sel = root.querySelector('#home-person');
  if (sel) sel.addEventListener('change', () => { uiSetActive(sel.value); uiState.rerender(); });
  uiBindNoticeActions(root, person);
  settingsBindBackupReminder(root);
}
