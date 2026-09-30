// People and onboarding stepper. Every change is written to the profile and saved immediately.
// Weight and height are entered in pounds and feet/inches and stored in kilograms and centimetres.
import { newPerson } from '../store.js';
import { lbToKg, kgToLb, ftInToCm, cmToFtIn, ACTIVITY_LEVELS } from '../engine/energy.js';
import { uiCopyText, uiState, uiEsc, uiPersist, uiActivePerson, uiSetActive, uiPlanFor, uiRatingBadge, uiSegmented, uiMultiPills, uiYesNo, uiNavigate, uiToast, uiModal, uiFindPersonById, UI_ALLERGENS, uiTagLabel, uiModuleName, uiNutrientLabel, uiEnsurePerson, uiParamUnit, uiBigChoices, uiBigToggles, uiEnsureUserDefinedSource, uiUserDefinedBadge, uiWeightHeightText, uiPageHeader, uiSection, uiChip, uiIcon, uiAvatar, uiEmptyState, uiNoticeHTML } from './common.js';
import { learnArticleHTML } from './learn.js';
import { CUISINES } from '../engine/cuisine.js';
import { SPICE_LEVELS, spicePreference } from '../engine/spice.js';
import { snackPlan } from '../engine/planner.js';
import { listDirectory, openPerson } from '../engine/sync.js';
import { sharingState, sharingLocalHTML, sharingPendingHTML, sharingSafe, sharingPublishIfShared, sharingPersonModal } from './sharing.js';

// Every save of a person goes through here so a person kept in the shared store is republished (encrypted) after each change.
function peoplePersist(person) {
  uiPersist();
  sharingPublishIfShared(person);
}

const PEOPLE_STEPS = [
  { id: 'basics', label: 'Basics', why: 'Who this is. Age, size, and activity feed the calorie estimate; a couple of yes/no questions feed specific guidelines.' },
  { id: 'allergens', label: 'Allergies', why: 'Hard stops. Anything ticked here is never served, suggested, or overridden.' },
  { id: 'conditions', label: 'Conditions and diets', why: 'Where the plan comes from. Each one you tick brings its published guidelines; the app merges them and shows conflicts.' },
  { id: 'preferences', label: 'Likes and dislikes', why: 'Soft choices: foods to steer away from, spice level, cuisines you love or skip. Never overrides an allergy or a condition.' },
  { id: 'medications', label: 'Medications', why: 'Medicines that change what you should eat, like warfarin, levothyroxine, or insulin.' },
  { id: 'clinician', label: 'Numbers from your doctor', why: 'Only asked when a condition needs a number the app must not choose for you, like a protein or potassium limit.' },
  { id: 'cooking', label: 'Cooking', why: 'Your real week: time, days, kitchen, and how you feel about cooking. Meals are chosen to fit.' },
  { id: 'review', label: 'Review', why: 'Everything on one page. Save to build the plan.' }
];
const PEOPLE_CAREGIVER_STEPS = ['basics', 'allergens', 'conditions', 'cooking', 'review'];
// Notes from the source document that describe how avoidances and the age gate work. They are not choices, so they never appear in the picker.
const PEOPLE_META_MODULES = ['food-allergies', 'medical-avoidances', 'preference-avoidances', 'pediatric'];
const PEOPLE_COOKING_SUBS = [
  { id: 'time', label: 'Time' },
  { id: 'days', label: 'Days and interest' },
  { id: 'kitchen', label: 'Kitchen' }
];

// Vegetarian, vegan, and pescatarian come from the engine (vegetarian-vegan module variants). Halal and kosher have no module.
const PEOPLE_VEG_PATTERNS = ['vegetarian', 'vegan', 'pescatarian'];
const PEOPLE_MULTI_VARIANT_MODULES = ['pregnancy-gdm-breastfeeding'];
const PEOPLE_PATTERN_TERMS = {
  halal: ['pork', 'bacon', 'ham', 'lard', 'gelatin', 'prosciutto', 'pancetta'],
  kosher: ['pork', 'bacon', 'ham', 'lard', 'gelatin', 'prosciutto', 'pancetta', 'shellfish', 'shrimp', 'prawn', 'crab', 'lobster', 'clam', 'oyster', 'mussel', 'scallop']
};
const PEOPLE_SOFT_AVOID_OPTIONS = [
  { value: 'red-meat', label: 'Red meat' },
  { value: 'processed-meat', label: 'Processed meat' },
  { value: 'poultry', label: 'Poultry' },
  { value: 'fish', label: 'Fish' },
  { value: 'allergen-milk', label: 'Dairy (preference, not allergy)' },
  { value: 'allergen-egg', label: 'Eggs (preference, not allergy)' },
  { value: 'soy', label: 'Soy (preference, not allergy)' },
  { value: 'gluten', label: 'Gluten (preference, not celiac)' },
  { value: 'refined-grain', label: 'Refined grains' },
  { value: 'ultra-processed', label: 'Ultra-processed foods' },
  { value: 'fried', label: 'Fried foods' },
  { value: 'full-fat-dairy', label: 'Full-fat dairy' },
  { value: 'alcohol', label: 'Alcohol' },
  { value: 'caffeine', label: 'Caffeine' },
  { value: 'non-nutritive-sweetener', label: 'Non-nutritive sweeteners' }
];

// Custom diet builder: tag families a person may pick from, and a fallback list when the dictionary carries no family field.
const PEOPLE_CUSTOM_FAMILIES = ['pattern', 'allergen', 'dairy', 'sugar', 'gluten', 'soy'];
const PEOPLE_PATTERN_TAG_FALLBACK = ['vegetable', 'fruit', 'whole-grain', 'refined-grain', 'legume', 'nut', 'seed', 'fish', 'poultry', 'red-meat', 'processed-meat', 'low-fat-dairy', 'full-fat-dairy', 'olive-oil', 'ultra-processed', 'fried', 'high-fiber-insoluble', 'small-particle-friendly', 'fermented-live-culture'];
const PEOPLE_CUSTOM_LIMITS = [
  { key: 'sodium_mg', label: 'Sodium', unit: 'mg a day' },
  { key: 'added_sugar_g', label: 'Added sugar', unit: 'g a day' },
  { key: 'satfat_g', label: 'Saturated fat', unit: 'g a day' },
  { key: 'carb_g', label: 'Carbohydrate', unit: 'g a day' }
];

const PEOPLE_TIME_OPTIONS = [
  { value: 10, label: '10 minutes or less' },
  { value: 15, label: 'About 15 minutes' },
  { value: 30, label: 'About 30 minutes' },
  { value: 45, label: '45 minutes or more' }
];
const PEOPLE_DAYS = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']].map(([value, label]) => ({ value, label }));
const PEOPLE_INTEREST_OPTIONS = [
  { value: 'learn', label: 'I like cooking and want to learn', desc: 'Recipes with a few more steps are welcome.' },
  { value: 'simple', label: "I'll cook if it's simple", desc: 'Short recipes with everyday ingredients.' },
  { value: 'minimal', label: 'As little cooking as possible', desc: 'Quick meals, leftovers, and very few steps.' },
  { value: 'assembly', label: 'No cooking: just putting things together', desc: 'Nothing that needs a stove or oven.' }
];
const PEOPLE_LEFTOVER_OPTIONS = [
  { value: 'good', label: 'Happy with leftovers', desc: 'The same meal a few days running is fine.' },
  { value: 'ok', label: 'Some repeats are fine', desc: 'A mix of new meals and leftovers.' },
  { value: 'poor', label: 'Something different every meal', desc: 'As little repetition as possible.' }
];
const PEOPLE_SHOP_OPTIONS = [
  { value: 'supermarket', label: 'A full supermarket', desc: 'Most ingredients are easy to find.' },
  { value: 'limited', label: 'A small or limited store', desc: 'Fewer choices; plain ingredients work best.' },
  { value: 'delivery', label: 'Delivery only', desc: 'Groceries are ordered, not picked out.' },
  { value: 'constrained', label: 'Dollar store or food bank', desc: 'The plan leans on shelf-stable basics.' }
];
const PEOPLE_ICON = {
  stove: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="2"/><circle cx="15.5" cy="9" r="2"/><path d="M6 16h12"/></svg>',
  oven: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 8h18"/><rect x="6" y="11" width="12" height="7" rx="1"/><path d="M7 5.5h.01M10 5.5h.01"/></svg>',
  microwave: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><rect x="5" y="8" width="10" height="8" rx="1"/><path d="M18 9v.01M18 13v.01"/></svg>',
  'air-fryer': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h12l1 6H5z"/><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M9 15h6"/></svg>',
  'slow-cooker': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h16v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z"/><path d="M6 9V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/><path d="M2 12h2M20 12h2"/></svg>',
  'pressure-cooker': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 10h14v7a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z"/><path d="M4 10h16M12 10V6M9 6h6"/><path d="M2 14h3M19 14h3"/></svg>',
  blender: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h8l-1 11H9z"/><path d="M7 14h10v3H7z"/><path d="M9 17v4h6v-4"/></svg>',
  none: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M5 11h14M9 7v1M9 14v1"/></svg>'
};
const PEOPLE_EQUIPMENT = [
  { value: 'stove', label: 'Stove' }, { value: 'oven', label: 'Oven' }, { value: 'microwave', label: 'Microwave' }, { value: 'air-fryer', label: 'Air fryer' },
  { value: 'slow-cooker', label: 'Slow cooker' }, { value: 'pressure-cooker', label: 'Pressure cooker' }, { value: 'blender', label: 'Blender' }, { value: 'none', label: 'No kitchen, just a fridge' }
].map(o => ({ ...o, icon: PEOPLE_ICON[o.value] }));

let peopleCustomDraft = null;

// Steps for this person. Medications and doctor numbers only appear when something on them applies; `keep` forces one in
// (so a direct link to it still renders a stepper).
function peopleStepsFor(person, keep) {
  let steps = person.adult === false ? PEOPLE_STEPS.filter(s => PEOPLE_CAREGIVER_STEPS.includes(s.id)) : PEOPLE_STEPS;
  return steps.filter(s => s.id === keep || peopleStepApplies(person, s.id));
}
function peopleStepApplies(person, stepId) {
  if (stepId !== 'medications' && stepId !== 'clinician') return true;
  let plan = null;
  try { plan = uiPlanFor(person); } catch { return true; }
  if (stepId === 'medications') return [...uiState.conditionsById.values()].some(m => m.auto_by_medication) || plan.modules.some(m => { const mod = uiState.conditionsById.get(m.id); return mod && Array.isArray(mod.medication_questions) && mod.medication_questions.length; });
  return (plan.tier2.missing || []).length > 0 || (plan.tier2.applied || []).length > 0 || plan.modules.some(m => { const mod = uiState.conditionsById.get(m.id); return mod && Array.isArray(mod.tier2) && mod.tier2.length; });
}

// Flat list of pages in walk-through order. Cooking is one step with three sub-screens.
function peoplePagesFor(person, keep) {
  const pages = [];
  for (const s of peopleStepsFor(person, keep)) {
    if (s.id === 'cooking') for (const c of PEOPLE_COOKING_SUBS) pages.push({ step: 'cooking', sub: c.id, hash: `cooking/${c.id}`, label: `Cooking: ${c.label}` });
    else pages.push({ step: s.id, sub: null, hash: s.id, label: s.label });
  }
  return pages;
}

function peopleIsCaregiverModule(m) {
  return /celiac/.test(m.id) || m.id === 'food-allergies' || m.id === 'pediatric';
}

function peopleFindPorkTag() {
  const tags = uiState.data.dictionaries.tags || {};
  return Object.keys(tags).find(t => /^pork$|(^|-)pork(-|$)/.test(t)) || null;
}

function peopleTimeBucket(min) {
  const m = Number(min) || 0;
  if (m <= 10) return 10;
  if (m <= 20) return 15;
  if (m <= 37) return 30;
  return 45;
}

function peopleAllergenLabel(tag) {
  const a = UI_ALLERGENS.find(x => x.tag === tag);
  return a ? a.label : uiTagLabel(tag);
}

export function renderPeopleScreen(root, ctx) {
  const parts = ctx.route.parts;
  if (!parts.length) return peopleRenderList(root);
  if (parts[0] === 'new') return peopleRenderNew(root);
  const person = uiEnsurePerson(uiFindPersonById(parts[0]));
  if (!person) { root.innerHTML = `${uiPageHeader('People')}${uiEmptyState('That person was not found.', '<a class="btn" href="#/people">All people</a>')}`; return; }
  const steps = peopleStepsFor(person, parts[1]);
  const stepId = steps.some(s => s.id === parts[1]) ? parts[1] : steps[0].id;
  const sub = stepId === 'cooking' ? (PEOPLE_COOKING_SUBS.some(c => c.id === parts[2]) ? parts[2] : 'time') : null;
  peopleRenderStepper(root, person, stepId, sub);
}

function peopleRenderList(root) {
  const people = uiState.profile.people;
  const active = uiActivePerson();
  root.innerHTML = `
    ${uiPageHeader(uiState.lite ? 'My profile' : 'People', uiState.lite ? 'Your conditions, allergies, likes, and cooking answers. Tap a step to change it.' : "Each person has their own conditions, allergens, numbers, and week. Only the active person's plan is shown on the other screens.", uiState.lite && people.length ? '' : `<a class="btn primary" href="#/people/new">${uiIcon('plus')}Add a person</a>`)}
    ${people.length ? `<div class="stack-2">${people.map(p => {
      const isActive = active && active.id === p.id;
      const mods = (p.modules || []).length + (p.custom_modules || []).length;
      const allergens = (p.allergens || []).map(peopleAllergenLabel);
      const summary = [`${mods} module${mods === 1 ? '' : 's'}`, allergens.length ? `allergens: ${allergens.join(', ')}` : 'no allergens', p.adult === false ? 'caregiver mode' : ''].filter(Boolean).join(', ');
      return `
      <div class="card person-card">
        <div class="person-row">${uiAvatar(p.name, { size: 'lg', tone: p.guest ? 'plum' : '' })}
          <div class="person-main"><div class="name">${uiEsc(p.name)} ${isActive ? uiChip('active', 'plum') : ''}${p.guest ? ' ' + uiChip('Guest', 'plum') : ''}${p.setup_complete ? '' : ' ' + uiChip('setup not finished', 'caution')}</div>
          <div class="small muted">${uiEsc(summary)}</div></div>
        </div>
        <div class="btn-row">
          ${isActive ? '' : `<button class="btn small" type="button" data-activate="${uiEsc(p.id)}">${uiIcon('check')}Set active</button>`}
          ${p.setup_complete ? '' : `<a class="btn small primary" href="#/people/${uiEsc(p.id)}/basics">Finish setup</a>`}
          <button class="btn small danger" type="button" data-delete="${uiEsc(p.id)}">${uiIcon('trash')}Delete</button>
        </div>
        ${p.setup_complete ? `<div class="edit-row" role="group" aria-label="Edit ${uiEsc(p.name)}"><span class="small muted edit-label">${uiIcon('edit')}Edit</span>${peopleStepsFor(p).map(s => `<a class="chip neutral" href="#/people/${uiEsc(p.id)}/${s.id}${s.id === 'cooking' ? '/time' : ''}">${s.label}</a>`).join('')}</div>` : ''}
      </div>`;
    }).join('')}</div>` : uiEmptyState('No people yet. Add the first person to build a plan.', `<a class="btn primary" href="#/people/new">Add a person</a>`)}
    ${uiState.lite ? '' : uiSection('Invite someone', peopleInviteHTML(), { id: 'people-invite-h' })}
    ${uiSection('Other people using Peace Meal', `<div class="card" id="people-directory">${peopleDirectoryShellHTML()}</div>`, { id: 'people-dir-h' })}
  `;
  peopleLoadDirectory(root.querySelector('#people-directory'));
  peopleBindInvite(root);
  root.querySelectorAll('[data-activate]').forEach(b => b.addEventListener('click', () => { uiSetActive(b.dataset.activate); uiToast('Active person changed.'); uiState.rerender(); }));
  root.querySelectorAll('[data-delete]').forEach(b => b.addEventListener('click', () => {
    const p = uiFindPersonById(b.dataset.delete);
    if (!p) return;
    if (!window.confirm(`Delete ${p.name} and their log entries? This cannot be undone.`)) return;
    uiState.profile.people = uiState.profile.people.filter(x => x.id !== p.id);
    uiState.profile.log = (uiState.profile.log || []).filter(e => e.person !== p.id);
    if (uiState.profile.activePerson === p.id) uiState.profile.activePerson = uiState.profile.people[0] ? uiState.profile.people[0].id : null;
    uiPersist();
    uiToast('Deleted.');
    if (!uiState.profile.people.length) uiNavigate('#/people/new'); else uiState.rerender();
  }));
}

function peopleRenderNew(root) {
  const first = !uiState.profile.people.length;
  root.innerHTML = `
    ${uiPageHeader('Add a person')}
    <div class="card">
      <form id="people-new-form">
        <div class="field"><label for="people-new-name">Name</label><input id="people-new-name" type="text" autocomplete="off" required maxlength="40"></div>
        <div class="btn-row"><button class="btn primary" type="submit">Continue</button>${first ? '' : '<a class="btn" href="#/people">Cancel</a>'}</div>
      </form>
    </div>`;
  const form = root.querySelector('#people-new-form');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const name = root.querySelector('#people-new-name').value.trim();
    if (!name) return;
    const p = uiEnsurePerson(newPerson(name));
    uiState.profile.people.push(p);
    if (!uiState.profile.activePerson) uiState.profile.activePerson = p.id;
    uiPersist();
    peopleCustomDraft = null;
    uiNavigate(`#/people/${p.id}/basics`);
  });
  root.querySelector('#people-new-name').focus();
}

function peopleRenderStepper(root, person, stepId, sub) {
  const steps = peopleStepsFor(person, stepId);
  const pages = peoplePagesFor(person, stepId);
  const idx = steps.findIndex(s => s.id === stepId);
  const pageHash = stepId === 'cooking' ? `cooking/${sub}` : stepId;
  const pageIdx = pages.findIndex(p => p.hash === pageHash);
  const prev = pages[pageIdx - 1] || null;
  const next = pages[pageIdx + 1] || null;
  const done = !!person.setup_complete;
  const cur = steps[idx];
  root.innerHTML = `
    ${uiPageHeader(uiEsc(person.name), done ? `Editing: ${uiEsc(cur.label)}.` : 'Setting up. Use Next to walk through each step; the plan is ready once you save on the Review step.', `<a class="btn small" href="#/people">${uiIcon('people')}All people</a>`)}
    <div class="stepper" aria-label="Steps">
      <div class="stepper-status">Step ${idx + 1} of ${steps.length}: ${uiEsc(cur.label)}</div>
      ${cur.why ? `<div class="stepper-why">${uiEsc(cur.why)}</div>` : ''}
      <div class="stepper-bar" aria-hidden="true">${steps.map((s, i) => `<span class="${i < idx ? 'done' : i === idx ? 'current' : ''}"></span>`).join('')}</div>
      <div class="stepper-names" role="list">
      ${steps.map((s, i) => {
        const clickable = done || i <= idx;
        return `<button type="button" role="listitem" data-step="${s.id}" ${s.id === stepId ? 'aria-current="step"' : ''} class="${i < idx ? 'done' : ''}" ${clickable ? '' : 'disabled aria-disabled="true"'}>${i + 1}. ${s.label}</button>`;
      }).join('')}
      </div>
    </div>
    <div id="people-step"></div>
    <div class="btn-row people-actions">
      ${prev ? `<button class="btn" type="button" data-step="${prev.hash}">${uiIcon('arrow-left')}Back</button>` : ''}
      ${next ? `<button class="btn primary" type="button" data-step="${next.hash}">Next: ${uiEsc(next.label)}${uiIcon('arrow-right')}</button>` : ''}
      <button class="btn" type="button" id="people-save">Save</button>
    </div>`;
  root.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => {
    const target = b.dataset.step === 'cooking' ? 'cooking/time' : b.dataset.step;
    uiNavigate(`#/people/${person.id}/${target}`);
  }));
  root.querySelector('#people-save').addEventListener('click', () => { peoplePersist(person); uiToast('Saved.'); });
  peopleRenderStep(root.querySelector('#people-step'), person, stepId, sub);
}

function peopleRefresh(container, person, stepId, focusSel, sub) {
  peoplePersist(person);
  peopleRenderStep(container, person, stepId, sub || (stepId === 'cooking' ? container.dataset.sub : null));
  if (focusSel) { const el = container.querySelector(focusSel); if (el) el.focus({ preventScroll: true }); }
}

function peopleRenderStep(container, person, stepId, sub) {
  container.dataset.sub = sub || '';
  switch (stepId) {
    case 'basics': return peopleStepBasics(container, person);
    case 'conditions': return peopleStepConditions(container, person);
    case 'allergens': return peopleStepAllergens(container, person);
    case 'preferences': return peopleStepPreferences(container, person);
    case 'medications': return peopleStepMedications(container, person);
    case 'clinician': return peopleStepClinician(container, person);
    case 'cooking': return peopleStepCooking(container, person, sub || 'time');
    case 'review': return peopleStepReview(container, person);
  }
}

function peopleBindSeg(container, person, stepId, name, apply, opts = {}) {
  container.querySelectorAll(`input[data-seg="${name}"]`).forEach(inp => inp.addEventListener('change', () => {
    apply(inp.value);
    if (opts.rerender === false) { peoplePersist(person); container.querySelectorAll(`input[data-seg="${name}"]`).forEach(i => i.closest('label').classList.toggle('on', i.checked)); }
    else peopleRefresh(container, person, stepId, `input[data-seg="${name}"][value="${inp.value}"]`);
  }));
}
function peopleBindMulti(container, person, stepId, name, apply, opts = {}) {
  container.querySelectorAll(`input[data-multi="${name}"]`).forEach(inp => inp.addEventListener('change', () => {
    apply(inp.value, inp.checked);
    if (opts.rerender === false) { peoplePersist(person); inp.closest('label').classList.toggle('on', inp.checked); }
    else peopleRefresh(container, person, stepId, `input[data-multi="${name}"][value="${inp.value}"]`);
  }));
}

// a) Basics
function peopleStepBasics(container, person) {
  const lb = person.weight_kg > 0 ? kgToLb(person.weight_kg) : '';
  const hi = person.height_cm > 0 ? cmToFtIn(person.height_cm) : { ft: '', inch: '' };
  container.innerHTML = `
    <div class="card">
      <div class="field"><label for="pb-name">Name</label><input id="pb-name" type="text" value="${uiEsc(person.name)}" maxlength="40"></div>
      <div class="field"><span class="label">Is this person an adult (18 or older)?</span>${uiYesNo('adult', person.adult !== false)}
        ${person.adult === false ? uiNoticeHTML({ level: 'block', text: "This app is for adults. A caregiver may use it to manage a child's confirmed celiac disease or diagnosed food allergies only. The other steps are turned off for this profile." }) : ''}
      </div>
      <div class="field"><span class="label">Sex</span>${uiSegmented('sex', [{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }, { value: 'other', label: 'Other or prefer not to say' }], person.sex || '')}
        <div class="hint">Used only where a rule differs by sex.</div></div>
      <div class="grid-2">
        <div class="field"><label for="pb-age">Age (years)</label><input id="pb-age" type="number" inputmode="numeric" min="0" max="120" value="${person.age ?? ''}"></div>
        <div class="field"><label for="pb-weight">Weight (lb)</label><input id="pb-weight" type="number" inputmode="decimal" min="1" max="900" step="1" value="${lb}">
          <div class="hint">Optional. Some rules are written per kilogram of body weight (for example protein in kidney disease); the app converts for you. Without a weight those rules are shown but not turned into a daily number.</div></div>
        <div class="field"><span class="label" id="pb-height-label">Height (ft / in)</span>
          <div class="height-inputs" role="group" aria-labelledby="pb-height-label">
            <label class="visually-hidden" for="pb-ft">Feet</label><input id="pb-ft" type="number" inputmode="numeric" min="1" max="8" step="1" value="${hi.ft ?? ''}" placeholder="ft"><span class="unit">ft</span>
            <label class="visually-hidden" for="pb-in">Inches</label><input id="pb-in" type="number" inputmode="numeric" min="0" max="11" step="1" value="${hi.inch ?? ''}" placeholder="in"><span class="unit">in</span>
          </div>
          <div class="hint">Optional. With weight, this gives a body mass index for the few rules that apply only when a guideline ties advice to overweight, and a calorie estimate if you turn one on.</div></div>
      </div>
      <div class="field"><h3 class="big-sub">How active are you most weeks?</h3>
        ${uiBigChoices('activity', ACTIVITY_LEVELS.map(l => ({ value: l.id, label: l.label })), person.activity || 'light', { label: 'Activity level' })}
        <div class="hint">Used only for the calorie estimate, and only when you turn that on.</div></div>
      ${person.adult === false ? '' : `
      <div id="pb-repro" ${person.sex === 'male' ? 'hidden' : ''}><div class="field"><span class="label">Pregnant?</span>${uiYesNo('pregnancy', !!person.pregnancy)}</div>
      <div class="field"><span class="label">Breastfeeding?</span>${uiYesNo('breastfeeding', !!person.breastfeeding)}
        <div class="hint">Either answer turns on the pregnancy and breastfeeding rules and turns off weight-loss, ketogenic, low-carbohydrate, fasting, and elimination protocols other than allergen and celiac.</div></div></div>`}
    </div>
    ${peopleGlobalFlagsHTML(person)}`;
  const bindText = (sel, fn) => container.querySelector(sel).addEventListener('change', e => { fn(e.target.value); peoplePersist(person); });
  bindText('#pb-name', v => { if (v.trim()) person.name = v.trim(); });
  bindText('#pb-age', v => { person.age = v === '' ? null : Number(v); });
  bindText('#pb-weight', v => { person.weight_kg = v === '' ? null : lbToKg(v); });
  const height = () => {
    const ft = container.querySelector('#pb-ft').value, inch = container.querySelector('#pb-in').value;
    person.height_cm = ft === '' && inch === '' ? null : ftInToCm(ft, inch);
  };
  bindText('#pb-ft', height);
  bindText('#pb-in', height);
  container.querySelectorAll('input[data-seg="adult"]').forEach(inp => inp.addEventListener('change', () => {
    person.adult = inp.value === 'yes';
    if (!person.adult) {
      person.modules = (person.modules || []).filter(id => { const m = uiState.conditionsById.get(id); return m && peopleIsCaregiverModule(m); });
      person.pregnancy = false; person.breastfeeding = false;
    }
    peoplePersist(person);
    uiState.rerender(); // the step list changes with this answer
  }));
  peopleBindSeg(container, person, 'basics', 'sex', v => {
    person.sex = v;
    const repro = container.querySelector('#pb-repro');
    if (repro) repro.hidden = v === 'male';
    if (v === 'male') { person.pregnancy = false; person.breastfeeding = false; container.querySelectorAll('input[data-seg="pregnancy"], input[data-seg="breastfeeding"]').forEach(i => { i.checked = i.value === 'no'; i.closest('label').classList.toggle('on', i.checked); }); }
  }, { rerender: false });
  peopleBindSeg(container, person, 'basics', 'activity', v => { person.activity = v; }, { rerender: false });
  peopleBindSeg(container, person, 'basics', 'pregnancy', v => { person.pregnancy = v === 'yes'; }, { rerender: false });
  peopleBindSeg(container, person, 'basics', 'breastfeeding', v => { person.breastfeeding = v === 'yes'; }, { rerender: false });
  peopleBindModulePanels(container, person, 'basics');
}

// b) Conditions and patterns, grouped by category: condition, pattern, restriction.
// The evidence summary minus its leading "Rating: STRONG" phrase, which the chip beside the name already says.
function peopleSummaryText(m) {
  const t = String(m.evidence && m.evidence.summary || '').replace(/^\s*Rating:\s*[A-Z]+(?:\s+to\s+[A-Z]+)?(?:\s*\([^)]*\))?\s*[.;:,]?\s*(?:for\s+)?/, '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}
let peopleCondQuery = '';
let peopleCondShowAll = false;   // "Show all" on a new person's Conditions step, for this session
function peopleStepConditions(container, person) {
  let modules = uiState.data.conditions.filter(m => !PEOPLE_META_MODULES.includes(m.id));
  if (person.adult === false) modules = modules.filter(peopleIsCaregiverModule);
  const selected = new Set((person.modules || []).filter(id => !PEOPLE_META_MODULES.includes(id)));
  const groups = [
    { key: 'condition', title: 'Medical conditions', hint: 'diabetes, reflux, kidney, heart, celiac, IBS and more' },
    { key: 'pattern', title: 'Ways of eating', hint: 'vegetarian, Mediterranean, DASH, low-carb, low added sugar' }
  ];
  const q = peopleCondQuery.trim().toLowerCase();
  const matches = m => !q || (m.name + ' ' + (m.evidence && m.evidence.summary || '') + ' ' + (m.aliases || []).join(' ')).toLowerCase().includes(q);
  const row = m => `<label class="choice cond-row">
      <input type="checkbox" data-module="${uiEsc(m.id)}" ${selected.has(m.id) ? 'checked' : ''}>
      <span class="choice-body"><span class="cond-name">${uiEsc(m.name)} ${uiRatingBadge(m.evidence && m.evidence.rating)}</span><span class="cond-sum">${uiEsc(peopleSummaryText(m))}</span></span>
      <button type="button" class="btn small about-btn" data-edu="${uiEsc(m.id)}" aria-label="About ${uiEsc(m.name)}">${uiIcon('book')}About</button>
    </label>`;
  const chosen = modules.filter(m => selected.has(m.id));
  // Dietitian review (September 9, 2026): a new person sees the common ten first (data/conditions.json onboarding_common),
  // with everything else one tap away. Search always covers every module. Editing a person who finished setup shows every
  // group expanded, as before.
  const commonIds = (uiState.conditionsMeta && uiState.conditionsMeta.onboarding_common) || [];
  const short = !person.setup_complete && !peopleCondShowAll && !q && commonIds.length > 0;
  const commonList = commonIds.map(id => modules.find(m => m.id === id)).filter(m => m && !selected.has(m.id));
  const allCount = modules.filter(m => groups.some(g => g.key === m.category)).length;
  container.innerHTML = `
    <p class="step-why">Tick what applies. Each one brings its published guidelines into the plan; the evidence chip says how strong they are. Tap <strong>About</strong> to read before you decide. Allergies are on their own step and are never loosened by anything here.</p>
    <div class="cond-selected">
      <h2>${chosen.length ? `Your selections (${chosen.length})` : 'Nothing selected yet'}</h2>
      ${chosen.length ? `<div class="choice-list">${chosen.map(m => row(m) + peopleModulePanelHTML(m, person)).join('')}</div>` : '<p class="cond-none small">No conditions or ways of eating yet. That is fine: the plan will still use your allergies, likes, and cooking answers. Pick from the lists below or search.</p>'}
    </div>
    <div class="field" style="margin-top:1rem"><label for="cond-search">Search</label><div class="search-row">${uiIcon('search')}<input id="cond-search" type="search" placeholder="Type: diabetes, reflux, celiac, vegetarian" value="${uiEsc(peopleCondQuery)}" autocomplete="off"></div></div>
    ${short ? `<div class="cond-group cond-common"><h2 class="cond-common-title">Common conditions</h2>${commonList.length ? `<div class="choice-list">${commonList.map(row).join('')}</div>` : '<p class="small muted">All of these are selected.</p>'}
      <button type="button" class="btn cond-show-all" id="cond-show-all">Show all ${allCount} conditions and ways of eating</button></div>` : groups.map(g => {
      const list = modules.filter(m => m.category === g.key && !selected.has(m.id) && matches(m));
      const total = modules.filter(m => m.category === g.key && !selected.has(m.id)).length;
      if (!total) return '';
      const open = true;   // both groups start expanded so nothing is hidden behind an arrow (the owner asked to show everything under Ways of eating)
      return `<details class="cond-group" ${open ? 'open' : ''}><summary>${g.title}<span class="cond-group-hint">${g.hint}</span><span class="count">${list.length}${q ? ` of ${total}` : ''}</span></summary>
        ${list.length ? `<div class="choice-list">${list.map(row).join('')}</div>` : `<p class="small muted" style="padding-bottom:12px">Nothing here matches "${uiEsc(peopleCondQuery)}".</p>`}</details>`;
    }).join('')}
    ${q && !modules.some(m => !selected.has(m.id) && matches(m)) ? `<p class="small muted">No match for "${uiEsc(peopleCondQuery)}". A diet that is not on the list can be added on the Likes and dislikes step.</p>` : ''}`;
  container.querySelectorAll('[data-module]').forEach(inp => inp.addEventListener('change', () => {
    const id = inp.dataset.module;
    person.modules = person.modules || [];
    if (inp.checked && !person.modules.includes(id)) person.modules.push(id);
    if (!inp.checked) person.modules = person.modules.filter(x => x !== id);
    peopleRefresh(container, person, 'conditions', `[data-module="${id}"]`);
  }));
  const showAll = container.querySelector('#cond-show-all');
  if (showAll) showAll.addEventListener('click', () => { peopleCondShowAll = true; peopleRenderStep(container, person, 'conditions', null); });
  const search = container.querySelector('#cond-search');
  search.addEventListener('input', () => { peopleCondQuery = search.value; const pos = search.selectionStart; peopleRenderStep(container, person, 'conditions', null); const s2 = container.querySelector('#cond-search'); s2.focus(); try { s2.setSelectionRange(pos, pos); } catch { /* ignore */ } });
  peopleBindModulePanels(container, person, 'conditions');
  container.querySelectorAll('[data-edu]').forEach(b => b.addEventListener('click', e => {
    e.preventDefault();
    const m = uiState.conditionsById.get(b.dataset.edu);
    if (m) uiModal(`<div class="article-modal">${learnArticleHTML(m)}<p class="small"><a href="#/learn/${uiEsc(m.id)}">Open the full article on the Learn screen</a></p></div>`, { title: m.name, label: 'About ' + m.name });
  }));
}

// Per-module controls: variants, flags, optional rules, configurable rules, required confirmations.
function peopleModulePanelHTML(m, person) {
  const parts = [];
  const flags = uiState.conditionsMeta.flags || {};
  if (Array.isArray(m.variants) && m.variants.length) {
    const multi = PEOPLE_MULTI_VARIANT_MODULES.includes(m.id);
    const stored = person.variants[m.id];
    const chosen = Array.isArray(stored) ? stored : typeof stored === 'string' ? [stored] : [];
    const def = m.variants.find(v => v.default) || m.variants[0];
    const cur = chosen.length ? chosen : (multi ? [] : [def.id]);
    const opts = m.variants.map(v => ({ value: v.id, label: v.label || v.id }));
    parts.push(`<div class="field"><span class="label">Which applies?</span>${multi ? uiMultiPills('variant-' + m.id, opts, cur, { label: m.name + ' options' }) : uiSegmented('variant-' + m.id, opts, cur[0], { label: m.name + ' options' })}${!chosen.length && !multi ? `<div class="hint">Default: ${uiEsc(def.label || def.id)}.</div>` : ''}${m.variants.some(v => v.note) ? `<div class="hint">${m.variants.filter(v => v.note).map(v => uiEsc(v.note)).join(' ')}</div>` : ''}</div>`);
  }
  for (const [fid, f] of Object.entries(flags)) if (f.module === m.id) parts.push(`<div class="field"><span class="label">${uiEsc(f.label)}</span>${uiYesNo('flag-' + fid, person.flags[fid] === true ? true : person.flags[fid] === false ? false : null)}</div>`);
  for (const r of m.rules || []) {
    if (r.required_confirmation) {
      const on = person.confirmations.includes(r.id);
      parts.push(`<label class="choice" style="background:var(--surface)"><input type="checkbox" data-confirm-rule="${uiEsc(r.id)}" ${on ? 'checked' : ''}><span class="choice-body"><span class="choice-title">Confirm before this module turns on</span><span class="small">${uiEsc(r.text)}</span></span></label>`);
    }
    if (r.optional === true || r.default === 'off') {
      const on = person.optional_rules.includes(r.id);
      parts.push(`<label class="choice" style="background:var(--surface)"><input type="checkbox" data-optional-rule="${uiEsc(r.id)}" ${on ? 'checked' : ''}><span class="choice-body"><span class="choice-title">Optional rule ${on ? '(on)' : '(off)'}</span><span class="small">${uiEsc(r.text)}</span><span class="small muted"><br>Optional; evidence for blanket avoidance is limited.</span></span></label>`);
    }
    if (r.configurable) parts.push(peopleConfigurableRuleHTML(r, person));
  }
  return parts.length ? `<div class="subpanel">${parts.join('')}</div>` : '';
}
function peopleConfigurableRuleHTML(r, person) {
  const def = r.default || r.default_for_allergy || (r.kind === 'avoid' ? 'exclude' : 'allow');
  const cur = person.rule_settings[r.id] || def;
  return `<div class="field"><span class="label">${uiEsc(r.text)}</span>${uiSegmented('setting-' + r.id, [{ value: 'allow', label: 'Allow' }, { value: 'exclude', label: 'Exclude' }], cur, { label: r.id })}<div class="hint">Default: ${def}. Your choice: ${cur}.</div></div>`;
}
function peopleGlobalFlagsHTML(person) {
  const flags = Object.entries(uiState.conditionsMeta.flags || {}).filter(([, f]) => !f.module);
  if (!flags.length) return '';
  return `<h2>Also tell us</h2><div class="card">${flags.map(([fid, f]) => `<div class="field"><span class="label">${uiEsc(f.label)}</span>${uiYesNo('flag-' + fid, person.flags[fid] === true ? true : person.flags[fid] === false ? false : null)}</div>`).join('')}</div>`;
}
function peopleBindModulePanels(container, person, stepId) {
  container.querySelectorAll('input[data-seg^="variant-"]').forEach(inp => inp.addEventListener('change', () => {
    const mid = inp.dataset.seg.slice('variant-'.length);
    person.variants[mid] = [inp.value];
    if (mid === 'vegetarian-vegan') peopleSyncVegPatternFromVariant(person, inp.value);
    peopleRefresh(container, person, stepId, `input[data-seg="${inp.dataset.seg}"][value="${inp.value}"]`);
  }));
  container.querySelectorAll('input[data-multi^="variant-"]').forEach(inp => inp.addEventListener('change', () => {
    const mid = inp.dataset.multi.slice('variant-'.length);
    const cur = new Set(person.variants[mid] || []);
    if (inp.checked) cur.add(inp.value); else cur.delete(inp.value);
    person.variants[mid] = [...cur];
    peoplePersist(person); inp.closest('label').classList.toggle('on', inp.checked);
  }));
  container.querySelectorAll('input[data-seg^="flag-"]').forEach(inp => inp.addEventListener('change', () => {
    person.flags[inp.dataset.seg.slice('flag-'.length)] = inp.value === 'yes';
    peopleRefresh(container, person, stepId, `input[data-seg="${inp.dataset.seg}"][value="${inp.value}"]`);
  }));
  container.querySelectorAll('input[data-seg^="setting-"]').forEach(inp => inp.addEventListener('change', () => {
    person.rule_settings[inp.dataset.seg.slice('setting-'.length)] = inp.value;
    peopleRefresh(container, person, stepId, `input[data-seg="${inp.dataset.seg}"][value="${inp.value}"]`);
  }));
  container.querySelectorAll('[data-confirm-rule]').forEach(inp => inp.addEventListener('change', () => {
    const id = inp.dataset.confirmRule;
    if (inp.checked && !person.confirmations.includes(id)) person.confirmations.push(id);
    if (!inp.checked) person.confirmations = person.confirmations.filter(x => x !== id);
    peopleRefresh(container, person, stepId, `[data-confirm-rule="${id}"]`);
  }));
  container.querySelectorAll('[data-optional-rule]').forEach(inp => inp.addEventListener('change', () => {
    const id = inp.dataset.optionalRule;
    if (inp.checked && !person.optional_rules.includes(id)) person.optional_rules.push(id);
    if (!inp.checked) person.optional_rules = person.optional_rules.filter(x => x !== id);
    peopleRefresh(container, person, stepId, `[data-optional-rule="${id}"]`);
  }));
}

// Keep the Preferences pattern checkbox in step with a variant chosen on the Conditions step.
function peopleSyncVegPatternFromVariant(person, variant) {
  const prefs = person.preferences;
  prefs.patterns = prefs.patterns.filter(p => !PEOPLE_VEG_PATTERNS.includes(p));
  if (PEOPLE_VEG_PATTERNS.includes(variant)) prefs.patterns.push(variant);
}

// c) Allergens
function peopleStepAllergens(container, person) {
  const sel = new Set(person.allergens || []);
  const allergyModule = uiState.conditionsById.get('food-allergies');
  const configurable = ((allergyModule && allergyModule.rules) || []).filter(r => r.configurable);
  container.innerHTML = `
    ${uiNoticeHTML({ level: 'block', text: 'Allergens are hard exclusions. Nothing in this app overrides them: not a preference, not a mode, not an acknowledgment. When an ingredient is not recognized, the app says so and does not assume it is safe.' })}
    <p>Confirmed food allergies (the nine FDA major allergens):</p>
    <div class="choice-list">
      ${UI_ALLERGENS.map(a => `<label class="choice"><input type="checkbox" data-allergen="${a.tag}" ${sel.has(a.tag) ? 'checked' : ''}><span class="choice-body"><span class="choice-title">${a.label}</span>${a.hint ? `<br><span class="small muted">${uiEsc(a.hint)}</span>` : ''}</span></label>`).join('')}
    </div>
    ${configurable.length ? `<div class="card" style="margin-top:1rem"><h3>"May contain" and shared-facility labels</h3><p class="small muted">Many people with allergies avoid these. The evidence on actual risk is mixed, so this is your call. Applies when at least one allergen is listed above.</p>${configurable.map(r => peopleConfigurableRuleHTML(r, person)).join('')}</div>` : ''}`;
  container.querySelectorAll('[data-allergen]').forEach(inp => inp.addEventListener('change', () => {
    person.allergens = person.allergens || [];
    const t = inp.dataset.allergen;
    if (inp.checked && !person.allergens.includes(t)) person.allergens.push(t);
    if (!inp.checked) person.allergens = person.allergens.filter(x => x !== t);
    peoplePersist(person);
  }));
  peopleBindModulePanels(container, person, 'allergens');
}

// d) Preferences, plus the custom diet builder.
function peopleStepPreferences(container, person) {
  person.preferences = person.preferences || { avoid_tags: [], avoid_terms: [], patterns: [] };
  const prefs = person.preferences;
  prefs.avoid_tags = prefs.avoid_tags || []; prefs.avoid_terms = prefs.avoid_terms || []; prefs.patterns = prefs.patterns || [];
  const dictTags = uiState.data.dictionaries.tags || {};
  const hasDict = Object.keys(dictTags).length > 0;
  const options = PEOPLE_SOFT_AVOID_OPTIONS.filter(o => !hasDict || dictTags[o.value]).map(o => ({ value: o.value, label: hasDict && dictTags[o.value] && dictTags[o.value].label && !/preference/.test(o.label) ? dictTags[o.value].label : o.label }));
  for (const t of prefs.avoid_tags) if (!options.some(o => o.value === t)) options.push({ value: t, label: uiTagLabel(t) });
  const porkTag = peopleFindPorkTag();
  const hasVegModule = uiState.conditionsById.has('vegetarian-vegan');
  const patterns = [
    ['vegetarian', 'Vegetarian', hasVegModule ? 'Turns on the vegetarian, vegan, and pescatarian module with the vegetarian option: no red meat, poultry, fish, or processed meat.' : 'No vegetarian module is loaded; stored as a pattern only.'],
    ['vegan', 'Vegan', hasVegModule ? 'Turns on the same module with the vegan option: no animal foods. Eggs and dairy are avoided as a pattern, not as allergies.' : 'No vegetarian module is loaded; stored as a pattern only.'],
    ['pescatarian', 'Pescatarian', hasVegModule ? 'Turns on the same module with the pescatarian option: no red meat, poultry, or processed meat. Fish and seafood are kept.' : 'No vegetarian module is loaded; stored as a pattern only.'],
    ['halal', 'Halal', porkTag ? `Avoids pork (tag: ${uiTagLabel(porkTag)}).` : 'No pork tag exists in the dictionary, so pork rules are applied by name matching on ingredient text (pork, bacon, ham, lard, gelatin).'],
    ['kosher', 'Kosher', porkTag ? `Avoids pork (tag: ${uiTagLabel(porkTag)}) and shellfish by name matching.` : 'No pork tag exists in the dictionary, so pork and shellfish rules are applied by name matching on ingredient text.']
  ];
  container.innerHTML = `
    <p class="step-why">These are soft. They steer which recipes get picked and show a caution when one slips through; nothing here loosens an allergy or a condition.</p>
    <h2>Ways of eating</h2>
    <div class="choice-list">
      ${patterns.map(([id, label, hint]) => `<label class="choice"><input type="checkbox" data-pattern="${id}" ${prefs.patterns.includes(id) ? 'checked' : ''}><span class="choice-body"><span class="choice-title">${uiEsc(label)}</span> <span class="small muted">${uiEsc(hint)}</span></span></label>`).join('')}
    </div>
    <p class="small muted">Halal and kosher rules beyond pork and shellfish (slaughter, certification, meat and dairy separation) are not something this app can check from ingredient text.</p>
    <h2>Foods to avoid (soft)</h2>
    ${uiMultiPills('avoid_tags', options, prefs.avoid_tags, { label: 'Soft avoid tags' })}
    <div class="field" style="margin-top:1rem"><label for="pp-terms">Words to avoid in ingredient text</label>
      <input id="pp-terms" type="text" value="${uiEsc(prefs.avoid_terms.join(', '))}" placeholder="cilantro, blue cheese" autocomplete="off">
    </div>
    <h2>Spice</h2>
    <p class="small muted">How much heat do you want in your food? The app estimates each recipe's heat from its ingredients (chili, hot sauce, cayenne, and so on) and leaves out anything above your level. Black pepper and ginger do not count.</p>
    ${uiBigChoices('spice', SPICE_LEVELS, spicePreference(person), { label: 'Spice level', cols: 2 })}
    <h2>Cuisines</h2>
    <p class="small muted">Tick the cuisines you want left out; those recipes disappear from the week, search, and Pantry. Ticking a cuisine you love nudges the week plan toward it. Labels come from the recipe source where it has them; otherwise the app guesses from the title and ingredients.</p>
    <div class="field"><span class="label">Cuisines to skip</span><div class="chip-grid">${CUISINES.filter(c => c.id !== 'other').map(c => `<label class="choice compact"><input type="checkbox" data-cskip="${c.id}" ${(prefs.cuisines_skip || []).includes(c.id) ? 'checked' : ''}><span class="choice-body"><span class="choice-title">${uiEsc(c.label)}</span></span></label>`).join('')}</div></div>
    <div class="field"><span class="label">Cuisines you love</span><div class="chip-grid">${CUISINES.filter(c => c.id !== 'other').map(c => `<label class="choice compact"><input type="checkbox" data-clove="${c.id}" ${(prefs.cuisines_love || []).includes(c.id) ? 'checked' : ''}><span class="choice-body"><span class="choice-title">${uiEsc(c.label)}</span></span></label>`).join('')}</div></div>
    <div class="field" hidden>
      <div class="hint">Comma separated. Matched as plain text in ingredient lists and recipe names. Soft.</div></div>
    <details class="pref-more" id="custom-diet"><summary>A diet that is not on the list (optional)</summary>
    <p class="small muted">Name it, say what it avoids, and the app treats it as your own module: soft rules, marked "Defined by you", no evidence rating.</p>
    ${peopleCustomDietHTML(person)}</details>`;
  container.querySelectorAll('[data-pattern]').forEach(inp => inp.addEventListener('change', () => {
    const id = inp.dataset.pattern;
    if (inp.checked && !prefs.patterns.includes(id)) prefs.patterns.push(id);
    if (!inp.checked) prefs.patterns = prefs.patterns.filter(x => x !== id);
    if (inp.checked && PEOPLE_VEG_PATTERNS.includes(id)) prefs.patterns = prefs.patterns.filter(x => x === id || !PEOPLE_VEG_PATTERNS.includes(x));
    peopleApplyPatterns(person);
    peopleRefresh(container, person, 'preferences', `[data-pattern="${id}"]`);
  }));
  peopleBindMulti(container, person, 'preferences', 'avoid_tags', (v, on) => {
    if (on && !prefs.avoid_tags.includes(v)) prefs.avoid_tags.push(v);
    if (!on) prefs.avoid_tags = prefs.avoid_tags.filter(x => x !== v);
  }, { rerender: false });
  peopleBindSeg(container, person, 'preferences', 'spice', v => { prefs.spice = v; uiState.weekCache.clear(); }, { rerender: false });
    prefs.cuisines_skip = prefs.cuisines_skip || []; prefs.cuisines_love = prefs.cuisines_love || [];
  container.querySelectorAll('[data-cskip]').forEach(inp => inp.addEventListener('change', () => {
    const id = inp.getAttribute('data-cskip');
    prefs.cuisines_skip = prefs.cuisines_skip.filter(x => x !== id); if (inp.checked) { prefs.cuisines_skip.push(id); prefs.cuisines_love = prefs.cuisines_love.filter(x => x !== id); const other = container.querySelector(`[data-clove="${id}"]`); if (other) other.checked = false; }
    uiPersist();
  }));
  container.querySelectorAll('[data-clove]').forEach(inp => inp.addEventListener('change', () => {
    const id = inp.getAttribute('data-clove');
    prefs.cuisines_love = prefs.cuisines_love.filter(x => x !== id); if (inp.checked) { prefs.cuisines_love.push(id); prefs.cuisines_skip = prefs.cuisines_skip.filter(x => x !== id); const other = container.querySelector(`[data-cskip="${id}"]`); if (other) other.checked = false; }
    uiPersist();
  }));
  container.querySelector('#pp-terms').addEventListener('change', e => {
    const manual = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
    prefs.avoid_terms = Array.from(new Set(manual));
    peoplePersist(person);
  });
  peopleBindCustomDiet(container, person);
}

function peopleApplyPatterns(person) {
  const prefs = person.preferences;
  const porkTag = peopleFindPorkTag();
  const wantTags = new Set();
  const wantTerms = new Set();
  for (const p of prefs.patterns) {
    if ((p === 'halal' || p === 'kosher')) {
      if (porkTag) wantTags.add(porkTag);
      for (const term of PEOPLE_PATTERN_TERMS[p] || []) if (!porkTag || !/^(pork|bacon|ham|lard|prosciutto|pancetta)$/.test(term)) wantTerms.add(term);
    }
  }
  // tags any pattern could have added, so we can remove the ones no longer wanted
  const allPatternTags = new Set(porkTag ? [porkTag] : []);
  const allPatternTerms = new Set([].concat(...Object.values(PEOPLE_PATTERN_TERMS)));
  prefs.avoid_tags = prefs.avoid_tags.filter(t => !allPatternTags.has(t) || wantTags.has(t));
  for (const t of wantTags) if (!prefs.avoid_tags.includes(t)) prefs.avoid_tags.push(t);
  prefs.avoid_terms = prefs.avoid_terms.filter(t => !allPatternTerms.has(t) || wantTerms.has(t));
  for (const t of wantTerms) if (!prefs.avoid_terms.includes(t)) prefs.avoid_terms.push(t);
  const veg = PEOPLE_VEG_PATTERNS.find(p => prefs.patterns.includes(p)) || null;
  person.modules = person.modules || [];
  if (uiState.conditionsById.has('vegetarian-vegan')) {
    if (veg && !person.modules.includes('vegetarian-vegan')) person.modules.push('vegetarian-vegan');
    if (veg) person.variants['vegetarian-vegan'] = [veg];
    if (!veg) { person.modules = person.modules.filter(m => m !== 'vegetarian-vegan'); delete person.variants['vegetarian-vegan']; }
  }
}

// ---- Custom diet builder ----
function peopleGuessFamily(id) {
  if (/^allergen-/.test(id)) return 'allergen';
  if (/^(gluten|oats-)/.test(id)) return 'gluten';
  if (/^soy/.test(id)) return 'soy';
  if (/^lactose/.test(id)) return 'dairy';
  if (/sugar|sweetener/.test(id)) return 'sugar';
  if (PEOPLE_PATTERN_TAG_FALLBACK.includes(id)) return 'pattern';
  return null;
}
function peopleCustomTagOptions() {
  const tags = uiState.data.dictionaries.tags || {};
  const out = [];
  for (const [id, def] of Object.entries(tags)) {
    if (id === 'may-contain') continue;
    const fam = (def && def.family) || peopleGuessFamily(id);
    if (!PEOPLE_CUSTOM_FAMILIES.includes(fam)) continue;
    const base = (def && def.label) || id;
    out.push({ value: id, label: fam === 'allergen' ? `${base} (as a preference)` : base, family: fam });
  }
  out.sort((a, b) => PEOPLE_CUSTOM_FAMILIES.indexOf(a.family) - PEOPLE_CUSTOM_FAMILIES.indexOf(b.family) || a.label.localeCompare(b.label));
  return out;
}
function peopleCustomBlankDraft() {
  return { editingId: null, name: '', summary: '', avoid_tags: [], avoid_terms: '', prefer_tags: [], limits: {}, notes: '', proposal: null, status: '' };
}
function peopleSlug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'diet';
}
function peopleClaudeAvailable() {
  return typeof window !== 'undefined' && window.claude && typeof window.claude.use === 'function';
}

function peopleCustomDietHTML(person) {
  const d = peopleCustomDraft || (peopleCustomDraft = peopleCustomBlankDraft());
  const existing = person.custom_modules || [];
  const tagOptions = peopleCustomTagOptions();
  const avoidOptions = tagOptions.slice();
  const preferOptions = tagOptions.filter(o => o.family === 'pattern');
  for (const t of d.avoid_tags) if (!avoidOptions.some(o => o.value === t)) avoidOptions.push({ value: t, label: uiTagLabel(t) });
  for (const t of d.prefer_tags) if (!preferOptions.some(o => o.value === t)) preferOptions.push({ value: t, label: uiTagLabel(t) });
  const fam = f => avoidOptions.filter(o => o.family === f);
  const famTitle = { pattern: 'Food groups', allergen: 'Allergen groups (as a preference, not an allergy)', dairy: 'Dairy and lactose', sugar: 'Sugar and sweeteners', gluten: 'Gluten', soy: 'Soy' };
  return `
    <p>Name a way of eating that is not on the list, say what you avoid, and the app treats it as your own module: soft rules, marked "Defined by you", with no evidence rating.</p>
    ${existing.length ? `<div class="choice-list" style="margin-bottom:1rem">${existing.map(cm => `<div class="card tight custom-card">
        <div class="row"><strong>${uiEsc(cm.name)}</strong> ${uiUserDefinedBadge()}</div>
        ${cm.summary ? `<div class="small">${uiEsc(cm.summary)}</div>` : ''}
        <div class="small muted">${[(cm.avoid_tags || []).length ? 'Avoid: ' + cm.avoid_tags.map(uiTagLabel).join(', ') : '', (cm.avoid_terms || []).length ? 'Words: ' + cm.avoid_terms.join(', ') : '', (cm.prefer_tags || []).length ? 'Prefer: ' + cm.prefer_tags.map(uiTagLabel).join(', ') : '', Object.keys(cm.limits || {}).length ? 'Limits: ' + Object.entries(cm.limits).map(([k, v]) => `${uiNutrientLabel(k)} ${v}`).join(', ') : ''].filter(Boolean).map(uiEsc).join('. ') || 'No rules yet.'}</div>
        <div class="btn-row"><button class="btn small" type="button" data-custom-edit="${uiEsc(cm.id)}">Edit</button><button class="btn small danger" type="button" data-custom-remove="${uiEsc(cm.id)}">Remove</button></div>
      </div>`).join('')}</div>` : ''}
    <div class="card" id="custom-diet-form">
      <h3 style="margin-top:0">${d.editingId ? 'Edit this diet' : 'Add a diet'}</h3>
      <div class="field"><label for="cd-name">What is it called?</label><input id="cd-name" type="text" maxlength="60" value="${uiEsc(d.name)}" placeholder="for example: Whole30, Nordic diet, my cardiologist's plan" autocomplete="off"></div>
      <div class="field"><label for="cd-summary">What is it, in a sentence? (optional)</label><input id="cd-summary" type="text" maxlength="240" value="${uiEsc(d.summary)}" autocomplete="off"></div>
      ${peopleClaudeAvailable() ? `<div class="btn-row" style="margin-top:0"><button class="btn" type="button" id="cd-ask">Ask Claude what this diet usually means</button><span class="small muted" id="cd-ask-status" aria-live="polite">${uiEsc(d.status || '')}</span></div>` : ''}
      ${d.proposal ? peopleProposalHTML(d.proposal) : ''}
      <h4>What does it avoid?</h4>
      ${PEOPLE_CUSTOM_FAMILIES.map(f => fam(f).length ? `<div class="field"><span class="label small">${famTitle[f]}</span>${uiMultiPills('cd-avoid', fam(f), d.avoid_tags, { label: famTitle[f] })}</div>` : '').join('')}
      ${avoidOptions.length ? '' : '<p class="small muted">No tag dictionary is loaded, so only free-text words can be added.</p>'}
      <div class="field"><label for="cd-terms">Other words to avoid in ingredient text</label><input id="cd-terms" type="text" value="${uiEsc(d.avoid_terms)}" placeholder="pork, corn syrup" autocomplete="off"><div class="hint">Comma separated. Matched as plain text.</div></div>
      ${preferOptions.length ? `<div class="field"><span class="label">Foods it favors (optional)</span>${uiMultiPills('cd-prefer', preferOptions, d.prefer_tags, { label: 'Prefer tags' })}</div>` : ''}
      <h4>Daily limits (optional)</h4>
      <p class="small muted">Only if the diet is defined by a number. Leave blank otherwise. These are soft and never replace a number from your doctor or dietitian.</p>
      <div class="limits-grid">${PEOPLE_CUSTOM_LIMITS.map(l => `<div class="field"><label for="cd-limit-${l.key}">${l.label}</label><div class="row"><input id="cd-limit-${l.key}" type="number" inputmode="decimal" min="0" step="any" data-limit="${l.key}" value="${typeof d.limits[l.key] === 'number' ? d.limits[l.key] : ''}" style="max-width:140px"><span class="small muted">${l.unit}</span></div></div>`).join('')}</div>
      <div class="field"><label for="cd-notes">Notes (optional)</label><textarea id="cd-notes" style="min-height:60px">${uiEsc(d.notes)}</textarea></div>
      <div class="btn-row"><button class="btn primary" type="button" id="cd-save">${d.editingId ? 'Save changes' : 'Save this diet'}</button><button class="btn" type="button" id="cd-clear">${d.editingId ? 'Cancel' : 'Clear'}</button></div>
    </div>`;
}

function peopleProposalHTML(p) {
  const list = arr => Array.isArray(arr) && arr.length ? arr.map(x => uiEsc(String(x))).join(', ') : '<span class="muted">none</span>';
  return `<div class="notice info proposal plain" role="status"><div class="notice-head">Claude's suggestion</div>
    <div class="notice-body"><strong>This is Claude's summary from general knowledge, not a medical source. Check it, change anything wrong, then save.</strong>
    <dl class="kv" style="margin-top:.5rem">
      <dt>Summary</dt><dd>${uiEsc(p.summary || '')}</dd>
      <dt>Avoid</dt><dd>${list((p.avoid_tags || []).map(uiTagLabel))}</dd>
      <dt>Avoid words</dt><dd>${list(p.avoid_terms)}</dd>
      <dt>Prefer</dt><dd>${list((p.prefer_tags || []).map(uiTagLabel))}</dd>
      <dt>Limits</dt><dd>${Object.keys(p.limits || {}).length ? Object.entries(p.limits).map(([k, v]) => `${uiEsc(uiNutrientLabel(k))}: ${uiEsc(v)}`).join(', ') : '<span class="muted">none</span>'}</dd>
      <dt>Cautions</dt><dd>${list(p.cautions)}</dd>
    </dl>
    <div class="btn-row"><button class="btn primary small" type="button" id="cd-accept">Put this into the form</button><button class="btn small" type="button" id="cd-dismiss">Ignore</button></div>
    <p class="small muted">Nothing is saved until you press "Save this diet".</p></div></div>`;
}

function peopleReadCustomForm(container, d) {
  const q = sel => container.querySelector(sel);
  if (q('#cd-name')) d.name = q('#cd-name').value;
  if (q('#cd-summary')) d.summary = q('#cd-summary').value;
  if (q('#cd-terms')) d.avoid_terms = q('#cd-terms').value;
  if (q('#cd-notes')) d.notes = q('#cd-notes').value;
  container.querySelectorAll('[data-limit]').forEach(inp => { const v = inp.value.trim(); if (v === '') delete d.limits[inp.dataset.limit]; else d.limits[inp.dataset.limit] = Number(v); });
}

function peopleBindCustomDiet(container, person) {
  const d = peopleCustomDraft;
  const rerender = () => { peopleReadCustomForm(container, d); peopleRefresh(container, person, 'preferences', '#cd-name'); };
  container.querySelectorAll('[data-custom-edit]').forEach(b => b.addEventListener('click', () => {
    const cm = (person.custom_modules || []).find(x => x.id === b.dataset.customEdit);
    if (!cm) return;
    peopleCustomDraft = { ...peopleCustomBlankDraft(), editingId: cm.id, name: cm.name || '', summary: cm.summary || '', avoid_tags: (cm.avoid_tags || []).slice(), avoid_terms: (cm.avoid_terms || []).join(', '), prefer_tags: (cm.prefer_tags || []).slice(), limits: { ...(cm.limits || {}) }, notes: cm.notes || '' };
    peopleRefresh(container, person, 'preferences', '#cd-name');
    const form = container.querySelector('#custom-diet-form'); if (form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  container.querySelectorAll('[data-custom-remove]').forEach(b => b.addEventListener('click', () => {
    const cm = (person.custom_modules || []).find(x => x.id === b.dataset.customRemove);
    if (!cm || !window.confirm(`Remove "${cm.name}" from this person?`)) return;
    person.custom_modules = person.custom_modules.filter(x => x.id !== cm.id);
    if (peopleCustomDraft && peopleCustomDraft.editingId === cm.id) peopleCustomDraft = null;
    uiToast('Removed.');
    peopleRefresh(container, person, 'preferences');
  }));
  const form = container.querySelector('#custom-diet-form');
  if (!form) return;
  ['#cd-name', '#cd-summary', '#cd-terms', '#cd-notes'].forEach(sel => { const el = form.querySelector(sel); if (el) el.addEventListener('input', () => peopleReadCustomForm(container, d)); });
  form.querySelectorAll('[data-limit]').forEach(inp => inp.addEventListener('change', () => peopleReadCustomForm(container, d)));
  form.querySelectorAll('input[data-multi="cd-avoid"]').forEach(inp => inp.addEventListener('change', () => {
    if (inp.checked && !d.avoid_tags.includes(inp.value)) d.avoid_tags.push(inp.value);
    if (!inp.checked) d.avoid_tags = d.avoid_tags.filter(x => x !== inp.value);
    inp.closest('label').classList.toggle('on', inp.checked);
  }));
  form.querySelectorAll('input[data-multi="cd-prefer"]').forEach(inp => inp.addEventListener('change', () => {
    if (inp.checked && !d.prefer_tags.includes(inp.value)) d.prefer_tags.push(inp.value);
    if (!inp.checked) d.prefer_tags = d.prefer_tags.filter(x => x !== inp.value);
    inp.closest('label').classList.toggle('on', inp.checked);
  }));
  form.querySelector('#cd-clear').addEventListener('click', () => { peopleCustomDraft = null; peopleRefresh(container, person, 'preferences', '#cd-name'); });
  form.querySelector('#cd-save').addEventListener('click', () => {
    peopleReadCustomForm(container, d);
    const name = d.name.trim();
    if (!name) { uiToast('Give the diet a name first.'); form.querySelector('#cd-name').focus(); return; }
    const avoid_terms = Array.from(new Set(d.avoid_terms.split(',').map(s => s.trim()).filter(Boolean)));
    const limits = {};
    for (const l of PEOPLE_CUSTOM_LIMITS) if (typeof d.limits[l.key] === 'number' && d.limits[l.key] >= 0) limits[l.key] = d.limits[l.key];
    if (!d.avoid_tags.length && !avoid_terms.length && !d.prefer_tags.length && !Object.keys(limits).length) { uiToast('Pick at least one thing to avoid, favor, or limit.'); return; }
    person.custom_modules = person.custom_modules || [];
    let id = d.editingId;
    if (!id) { const base = 'custom-' + peopleSlug(name); id = base; let n = 2; while (person.custom_modules.some(x => x.id === id)) id = `${base}-${n++}`; }
    const entry = { id, name, summary: d.summary.trim(), avoid_tags: d.avoid_tags.slice(), avoid_terms, prefer_tags: d.prefer_tags.slice(), limits, notes: d.notes.trim() };
    const i = person.custom_modules.findIndex(x => x.id === id);
    if (i >= 0) person.custom_modules[i] = entry; else person.custom_modules.push(entry);
    peopleCustomDraft = null;
    uiToast(`Saved "${name}".`);
    peopleRefresh(container, person, 'preferences');
  });
  const ask = form.querySelector('#cd-ask');
  if (ask) ask.addEventListener('click', async () => {
    peopleReadCustomForm(container, d);
    const name = d.name.trim();
    const status = form.querySelector('#cd-ask-status');
    if (!name) { status.textContent = 'Type the name of the diet first.'; form.querySelector('#cd-name').focus(); return; }
    ask.disabled = true; status.textContent = 'Thinking...';
    try {
      const sample = await window.claude.use('sample');
      if (!sample) { d.status = 'Claude is not available in this view.'; status.textContent = d.status; ask.disabled = false; return; }
      const allowed = peopleCustomTagOptions().map(o => o.value);
      const prompt = `A person is describing an eating pattern by name so a nutrition app can turn it into soft food rules. The diet is called "${name}".${d.summary.trim() ? ` The person describes it as: "${d.summary.trim()}".` : ''}
Reply with only one strict JSON object with exactly these keys:
"summary": one plain sentence saying what this diet usually means (general knowledge, no medical claims);
"avoid_tags": an array of strings chosen ONLY from this list of tags, for foods the diet usually avoids: ${JSON.stringify(allowed)};
"avoid_terms": an array of short lowercase ingredient words the diet usually avoids that the tag list does not cover (may be empty);
"prefer_tags": an array of strings chosen ONLY from the same tag list, for foods the diet usually emphasizes (may be empty);
"limits": an object with any of "sodium_mg", "added_sugar_g", "satfat_g", "carb_g" as numbers per day, included ONLY when the diet is commonly defined by that number, otherwise {};
"cautions": an array of one or two short sentences about who should be careful with this diet.
Do not invent medical numbers. If you do not know the diet, say so in the summary and leave the arrays empty.
Example: {"summary":"...","avoid_tags":["red-meat"],"avoid_terms":["pork"],"prefer_tags":["vegetable"],"limits":{},"cautions":["..."]}`;
      const data = await sample.json(prompt, { modelTier: 'quick' });
      const allowedSet = new Set(allowed);
      const arr = x => Array.isArray(x) ? x.map(s => String(s).trim()).filter(Boolean) : [];
      const limits = {};
      if (data && data.limits && typeof data.limits === 'object') for (const l of PEOPLE_CUSTOM_LIMITS) if (typeof data.limits[l.key] === 'number' && data.limits[l.key] > 0) limits[l.key] = data.limits[l.key];
      d.proposal = {
        summary: data && typeof data.summary === 'string' ? data.summary.slice(0, 240) : '',
        avoid_tags: arr(data && data.avoid_tags).filter(t => allowedSet.has(t)),
        avoid_terms: arr(data && data.avoid_terms).slice(0, 20),
        prefer_tags: arr(data && data.prefer_tags).filter(t => allowedSet.has(t)),
        limits,
        cautions: arr(data && data.cautions).slice(0, 3)
      };
      d.status = '';
      rerender();
    } catch (e) {
      const code = e && e.code;
      d.status = code === 'not_granted' || code === 'sampling_disabled' ? 'Claude is not allowed for this page. You can still fill the form by hand.' : code === 'rate_limited' ? 'Claude is busy. Try again in a little while.' : code === 'invalid_json' ? 'The answer could not be read. Try again or fill the form by hand.' : 'Claude did not answer. Fill the form by hand.';
      status.textContent = d.status;
      ask.disabled = false;
    }
  });
  const accept = form.querySelector('#cd-accept');
  if (accept) accept.addEventListener('click', () => {
    const p = d.proposal;
    peopleReadCustomForm(container, d);
    if (p.summary && !d.summary.trim()) d.summary = p.summary;
    for (const t of p.avoid_tags) if (!d.avoid_tags.includes(t)) d.avoid_tags.push(t);
    for (const t of p.prefer_tags) if (!d.prefer_tags.includes(t)) d.prefer_tags.push(t);
    const terms = new Set(d.avoid_terms.split(',').map(s => s.trim()).filter(Boolean));
    for (const t of p.avoid_terms) terms.add(t);
    d.avoid_terms = [...terms].join(', ');
    for (const [k, v] of Object.entries(p.limits)) if (typeof d.limits[k] !== 'number') d.limits[k] = v;
    if (p.cautions.length) d.notes = [d.notes.trim(), 'Cautions (from Claude, general knowledge): ' + p.cautions.join(' ')].filter(Boolean).join('\n');
    d.proposal = null;
    uiToast('Filled in. Check it, then save.');
    peopleRefresh(container, person, 'preferences', '#cd-name');
  });
  const dismiss = form.querySelector('#cd-dismiss');
  if (dismiss) dismiss.addEventListener('click', () => { d.proposal = null; rerender(); });
}

// e) Medications
function peopleStepMedications(container, person) {
  const plan = uiPlanFor(person);
  const seen = new Map();
  for (const m of plan.modules) {
    const mod = uiState.conditionsById.get(m.id);
    for (const q of (mod && mod.medication_questions) || []) if (!seen.has(q.id)) seen.set(q.id, { ...q, moduleName: mod.name });
  }
  // Questions asked of everyone: medicines that interact with food whatever the conditions (warfarin, grapefruit-sensitive drugs, levothyroxine).
  for (const mod of uiState.conditionsById.values()) if (mod.auto_by_medication) for (const q of mod.medication_questions || []) if (q.global && !seen.has(q.id)) seen.set(q.id, { ...q, moduleName: mod.name, global: true });
  person.medications = person.medications || {};
  const qs = [...seen.values()].sort((a, b) => Number(!!b.global) - Number(!!a.global));
  container.innerHTML = `
    <p>Some medicines change what you should eat. Answer what applies. A yes turns on the matching food rule, and sets aside any rule the medicine makes unsafe, with the reason shown.</p>
    ${qs.length ? qs.map(q => `<div class="card">
      <span class="label">${uiEsc(q.text)}</span>
      <div class="small muted" style="margin-bottom:.5rem">${q.global ? 'Asked of everyone.' : `Asked by ${uiEsc(q.moduleName)}.`}</div>
      ${uiYesNo('med-' + q.id, person.medications[q.id] === true ? true : person.medications[q.id] === false ? false : null)}
    </div>`).join('') : uiEmptyState('No medication questions apply to the modules you selected.')}`;
  for (const q of qs) peopleBindSeg(container, person, 'medications', 'med-' + q.id, v => { person.medications[q.id] = v === 'yes'; }, { rerender: false });
}

// f) Doctor or dietitian numbers (Tier 2; the source document calls these clinician-set)
function peopleStepClinician(container, person) {
  const plan = uiPlanFor(person);
  person.tier2 = person.tier2 || {};
  const entries = new Map();
  const base = p => String(p).replace(/_(max|min|target|per_kg|treatment|gdm)/g, '');
  const covered = new Set();
  for (const t of plan.tier2.missing) { entries.set(t.param, { ...t }); covered.add(t.module + '|' + base(t.param)); }
  for (const a of plan.tier2.applied) {
    if (entries.has(a.param)) continue;
    const mod = uiState.conditionsById.get(a.module);
    const decl = ((mod && mod.tier2) || []).find(t => base(t.param) === base(a.param)) || {};
    entries.set(a.param, { param: a.param, module: a.module, moduleName: mod ? mod.name : a.module, label: decl.label || `${uiNutrientLabel(a.param)} (${/_max$/.test(a.param) ? 'upper limit' : 'target'})`, consensus: decl.consensus || '', why: decl.why || '' });
    covered.add(a.module + '|' + base(a.param));
  }
  // Module declarations that the engine has not turned into a parameter yet (for example, a rule that is not active in the current phase).
  for (const m of plan.modules) {
    const mod = uiState.conditionsById.get(m.id);
    for (const t of (mod && mod.tier2) || []) {
      if (entries.has(t.param) || covered.has(mod.id + '|' + base(t.param))) continue;
      entries.set(t.param, { ...t, module: mod.id, moduleName: mod.name, declaredOnly: true });
    }
  }
  const list = [...entries.values()];
  const applied = new Map(plan.tier2.applied.map(a => [a.param, a.value]));
  container.innerHTML = `
    <p>These numbers are Tier 2: the app knows the published range but does not choose a value for you. Until a number is entered, the module runs on its Tier 1 rules only and the plan says so.</p>
    ${list.some(t => /per_kg/.test(t.param)) && !person.weight_kg ? uiNoticeHTML({ level: 'warn', text: 'Some of these are per kilogram of body weight. Enter a weight on the Basics step so they can become daily numbers.' }) : ''}
    ${list.length ? list.map(t => `<div class="card">
      <label for="pt-${uiEsc(t.param)}">${uiEsc(t.label || t.param)}${/per_kg/.test(t.param) ? ' ' + uiChip('per kilogram', 'neutral') : ''}</label>
      <div class="small muted">${uiEsc(t.moduleName || '')}${t.when ? ` (applies when: ${uiEsc(t.when)})` : ''}</div>
      ${t.consensus ? `<div class="small"><strong>Published range:</strong> ${uiEsc(t.consensus)}</div>` : ''}
      ${t.why ? `<div class="small muted">${uiEsc(t.why)}</div>` : ''}
      <div class="row" style="margin-top:.5rem">
        <input id="pt-${uiEsc(t.param)}" type="number" inputmode="decimal" step="any" style="max-width:220px" data-tier2="${uiEsc(t.param)}" value="${typeof person.tier2[t.param] === 'number' ? person.tier2[t.param] : ''}" aria-describedby="pt-help-${uiEsc(t.param)}">
        <span class="muted small">${uiEsc(uiParamUnit(t.param))}</span>
        ${applied.has(t.param) ? uiChip('from your doctor or dietitian, applied', 'plum') : typeof person.tier2[t.param] === 'number' ? uiChip('saved, not currently used', 'neutral') : t.declaredOnly ? uiChip('not needed right now', 'neutral') : uiChip('not applied', 'caution')}
      </div>
      <p id="pt-help-${uiEsc(t.param)}" class="small" style="margin:.5rem 0 0"><strong>Enter the number your doctor or dietitian gave you. The app does not set this.</strong></p>
    </div>`).join('') : uiEmptyState('None of the conditions you selected need a number from your doctor or dietitian.')}`;
  container.querySelectorAll('[data-tier2]').forEach(inp => inp.addEventListener('change', () => {
    const v = inp.value.trim();
    if (v === '') delete person.tier2[inp.dataset.tier2]; else person.tier2[inp.dataset.tier2] = Number(v);
    peopleRefresh(container, person, 'clinician', `[data-tier2="${inp.dataset.tier2}"]`);
  }));
}

// g) Cooking: three short sub-screens, one question at a time, big tappable answers.
function peopleStepCooking(container, person, sub) {
  person.cooking = person.cooking || {};
  const c = person.cooking;
  const subIdx = PEOPLE_COOKING_SUBS.findIndex(s => s.id === sub);
  const nextHash = subIdx < PEOPLE_COOKING_SUBS.length - 1 ? `cooking/${PEOPLE_COOKING_SUBS[subIdx + 1].id}` : 'review';
  const progress = `<p class="small muted cooking-progress">Cooking, part ${subIdx + 1} of ${PEOPLE_COOKING_SUBS.length}</p>`;
  if (sub === 'time') {
    container.innerHTML = `<div class="cooking-screen">${progress}
      <h2 class="big-q">How much time do you have to cook?</h2>
      <p class="muted">Pick what is true most weeks. Meals are chosen to fit this time. You can change it later.</p>
      <h3 class="big-sub">On weekdays</h3>
      ${uiBigChoices('weekday_minutes', PEOPLE_TIME_OPTIONS, peopleTimeBucket(c.weekday_minutes || 20), { label: 'Weekday cooking time', cols: 2 })}
      <h3 class="big-sub">On weekends</h3>
      ${uiBigChoices('weekend_minutes', PEOPLE_TIME_OPTIONS, peopleTimeBucket(c.weekend_minutes || 40), { label: 'Weekend cooking time', cols: 2 })}
      <h3 class="big-sub">Snacks each day</h3>
      <p class="muted small">${uiEsc(peopleSnackHint(person))}</p>
      ${uiBigChoices('snacks_per_day', [{ value: 'auto', label: 'Let the plan decide', desc: 'Follows your conditions: two for gestational diabetes, reflux, gastroparesis, or GLP-1 use; otherwise one.' }, { value: 0, label: 'None' }, { value: 1, label: 'One' }, { value: 2, label: 'Two' }, { value: 3, label: 'Three' }], typeof c.snacks_per_day === 'number' ? c.snacks_per_day : 'auto', { label: 'Snacks each day', cols: 2 })}
      ${peopleTypicalHTML('30 minutes on weekdays, 45 or more on weekends, snacks decided by the plan')}
    </div>`;
    peopleBindSeg(container, person, 'cooking', 'snacks_per_day', v => { if (v === 'auto') delete c.snacks_per_day; else c.snacks_per_day = Number(v); uiState.weekCache.clear(); }, { rerender: false });
    peopleBindSeg(container, person, 'cooking', 'weekday_minutes', v => { c.weekday_minutes = Number(v); }, { rerender: false });
    peopleBindSeg(container, person, 'cooking', 'weekend_minutes', v => { c.weekend_minutes = Number(v); }, { rerender: false });
    peopleBindTypical(container, person, () => { c.weekday_minutes = 30; c.weekend_minutes = 45; delete c.snacks_per_day; }, nextHash);
  } else if (sub === 'days') {
    container.innerHTML = `<div class="cooking-screen">${progress}
      <h2 class="big-q">Which days can you cook?</h2>
      <p class="muted">On the other days the plan uses leftovers or meals you just put together.</p>
      <div class="btn-row" style="margin:0 0 .75rem"><button class="btn" type="button" data-days="most">Most days</button><button class="btn" type="button" data-days="weekends">Weekends only</button></div>
      <div class="day-toggles">${uiBigToggles('cook_days', PEOPLE_DAYS, c.cook_days || [], { label: 'Days you can cook' })}</div>
      <h2 class="big-q" style="margin-top:1.5rem">How do you feel about cooking?</h2>
      ${uiBigChoices('interest', PEOPLE_INTEREST_OPTIONS, c.interest || 'simple', { label: 'Interest in cooking' })}
      ${peopleTypicalHTML('every day, and cook if it is simple')}
    </div>`;
    peopleBindMulti(container, person, 'cooking', 'cook_days', (v, on) => { c.cook_days = c.cook_days || []; if (on && !c.cook_days.includes(v)) c.cook_days.push(v); if (!on) c.cook_days = c.cook_days.filter(x => x !== v); }, { rerender: false });
    peopleBindSeg(container, person, 'cooking', 'interest', v => { c.interest = v; }, { rerender: false });
    container.querySelectorAll('[data-days]').forEach(b => b.addEventListener('click', () => {
      c.cook_days = b.dataset.days === 'weekends' ? ['sat', 'sun'] : PEOPLE_DAYS.map(d => d.value);
      peopleRefresh(container, person, 'cooking', `[data-days="${b.dataset.days}"]`, 'days');
    }));
    peopleBindTypical(container, person, () => { c.cook_days = PEOPLE_DAYS.map(d => d.value); c.interest = 'simple'; }, nextHash);
  } else {
    const household = Math.max(1, Number(c.household) || 1);
    container.innerHTML = `<div class="cooking-screen">${progress}
      <h2 class="big-q">What do you have in your kitchen?</h2>
      <p class="muted">Tap everything you can use.</p>
      ${uiBigToggles('equipment', PEOPLE_EQUIPMENT, c.equipment || [], { label: 'Equipment', cols: 2 })}
      <h2 class="big-q" style="margin-top:1.5rem">Leftovers?</h2>
      ${uiBigChoices('leftovers', PEOPLE_LEFTOVER_OPTIONS, c.leftovers || 'ok', { label: 'Leftovers' })}
      <h2 class="big-q" style="margin-top:1.5rem" id="pc-household-label">How many people are you usually cooking for?</h2>
      <div class="stepper-ctl" role="group" aria-labelledby="pc-household-label">
        <button class="btn stepper-btn" type="button" id="pc-minus" aria-label="Fewer people">${uiIcon('minus')}</button>
        <output class="stepper-value" id="pc-household" aria-live="polite">${household}</output>
        <button class="btn stepper-btn" type="button" id="pc-plus" aria-label="More people">${uiIcon('plus')}</button>
      </div>
      <h2 class="big-q" style="margin-top:1.5rem">Where do you shop?</h2>
      ${uiBigChoices('grocery', PEOPLE_SHOP_OPTIONS, c.grocery || 'supermarket', { label: 'Where you shop' })}
      <label class="choice big-check" style="margin-top:1.25rem"><input type="checkbox" id="pc-budget" ${c.budget ? 'checked' : ''}><span class="choice-body"><span class="choice-title">Save money: reuse ingredients across the week</span><span class="small muted">The week leans on recipes that share ingredients, so there is less to buy.</span></span></label>
      ${peopleTypicalHTML('stove, oven and microwave; some leftovers; cooking for two; a full supermarket')}
    </div>`;
    peopleBindMulti(container, person, 'cooking', 'equipment', (v, on) => { c.equipment = c.equipment || []; if (on && !c.equipment.includes(v)) c.equipment.push(v); if (!on) c.equipment = c.equipment.filter(x => x !== v); }, { rerender: false });
    peopleBindSeg(container, person, 'cooking', 'leftovers', v => { c.leftovers = v; }, { rerender: false });
    peopleBindSeg(container, person, 'cooking', 'grocery', v => { c.grocery = v; }, { rerender: false });
    const out = container.querySelector('#pc-household');
    const setHousehold = n => { c.household = Math.min(12, Math.max(1, n)); out.textContent = c.household; peoplePersist(person); };
    container.querySelector('#pc-minus').addEventListener('click', () => setHousehold((Number(c.household) || 1) - 1));
    container.querySelector('#pc-plus').addEventListener('click', () => setHousehold((Number(c.household) || 1) + 1));
    container.querySelector('#pc-budget').addEventListener('change', e => { c.budget = !!e.target.checked; peoplePersist(person); });
    peopleBindTypical(container, person, () => { c.equipment = ['stove', 'oven', 'microwave']; c.leftovers = 'ok'; c.household = Math.max(2, Number(c.household) || 0); c.grocery = 'supermarket'; }, nextHash);
  }
}
// "Two a day (reflux guidance: ...)" for the Cooking step and the Review.
function peopleSnackHint(person) {
  let plan = null;
  try { plan = uiPlanFor(person); } catch { plan = null; }
  const s = snackPlan(person, plan);
  const n = s.count === 0 ? 'No snacks' : s.count === 1 ? 'One snack' : `${s.count === 2 ? 'Two' : 'Three'} snacks`;
  const set = person.cooking && person.cooking.snacks_per_day;
  const trimmed = !s.auto && typeof set === 'number' && set > s.count ? ' The evening snack is left out for reflux (nothing close to lying down).' : '';
  return `${n} a day${s.auto ? ` (${s.why})` : ' (your setting)'}.${trimmed}`;
}

function peopleTypicalHTML(what) {
  return `<div class="typical"><button class="btn" type="button" id="pc-typical">Use typical answers</button><span class="small muted">Fills in: ${uiEsc(what)}. Then moves on.</span></div>`;
}
function peopleBindTypical(container, person, fill, nextHash) {
  container.querySelector('#pc-typical').addEventListener('click', () => {
    fill();
    peoplePersist(person);
    uiToast('Typical answers filled in.');
    uiNavigate(`#/people/${person.id}/${nextHash}`);
  });
}

// h) Review
function peopleStepReview(container, person) {
  uiEnsureUserDefinedSource();
  const plan = uiPlanFor(person);
  const prefs = person.preferences || {};
  const c = person.cooking || {};
  const act = ACTIVITY_LEVELS.find(l => l.id === person.activity);
  const wh = uiWeightHeightText(person, { kgToLb, cmToFtIn });
  const kv = [
    ['Adult', person.adult === false ? 'No (caregiver mode)' : 'Yes'],
    ['Sex, age', `${uiEsc(person.sex || 'not set')}${person.age ? ', ' + uiEsc(person.age) : ''}`],
    ['Weight, height', uiEsc(wh || 'not entered')],
    ['Activity', uiEsc(act ? act.label : 'not set')],
    ['Pregnant or breastfeeding', person.pregnancy || person.breastfeeding ? 'Yes' : 'No'],
    ['Conditions and diets', plan.modules.length ? plan.modules.map(m => m.category === 'custom' ? `${uiEsc(m.name)} ${uiUserDefinedBadge()}` : uiEsc(m.name)).join(', ') : 'none'],
    ['Turned off', plan.disabledModules.length ? plan.disabledModules.map(d => `${uiEsc(uiModuleName(d.id))} (by ${uiEsc(uiModuleName(d.by))})`).join(', ') : 'none'],
    ['Options', Object.entries(person.variants || {}).filter(([, v]) => v && v.length).map(([k, v]) => `${uiEsc(uiModuleName(k))}: ${uiEsc([].concat(v).join(', '))}`).join('; ') || 'defaults'],
    ['Flags', Object.entries(person.flags || {}).filter(([, v]) => v).map(([k]) => uiEsc((uiState.conditionsMeta.flags[k] || { label: k }).label)).join('; ') || 'none'],
    ['Confirmations', (person.confirmations || []).length ? person.confirmations.map(uiEsc).join(', ') : 'none'],
    ['Allergens', (person.allergens || []).length ? person.allergens.map(t => uiEsc(peopleAllergenLabel(t))).join(', ') : 'none'],
    ['Patterns', uiEsc((prefs.patterns || []).join(', ') || 'none')],
    ['Your own diets', (person.custom_modules || []).length ? person.custom_modules.map(cm => uiEsc(cm.name)).join(', ') : 'none'],
    ['Soft avoid', uiEsc((prefs.avoid_tags || []).map(uiTagLabel).join(', ') || 'none')],
    ['Avoid words', uiEsc((prefs.avoid_terms || []).join(', ') || 'none')],
    ['Spice', uiEsc((SPICE_LEVELS.find(l => l.value === spicePreference(person)) || SPICE_LEVELS[0]).label)],
    ['Cuisines', uiEsc(`${(prefs.cuisines_skip || []).length ? 'skip ' + prefs.cuisines_skip.join(', ') : 'nothing skipped'}${(prefs.cuisines_love || []).length ? '; love ' + prefs.cuisines_love.join(', ') : ''}`)],
    ['Medications', uiEsc(Object.entries(person.medications || {}).filter(([, v]) => v).map(([k]) => k.replace(/_/g, ' ')).join(', ') || 'none flagged')],
    ['Doctor or dietitian numbers', Object.keys(person.tier2 || {}).length ? uiEsc(Object.entries(person.tier2).map(([k, v]) => `${k}: ${v}`).join(', ')) : 'none entered'],
    ['Cooking', uiEsc(`${c.weekday_minutes || 20} min weekdays, ${c.weekend_minutes || 40} min weekends, ${(c.cook_days || []).length} cook days, ${c.interest || 'simple'}, cooking for ${c.household || 1}${c.budget ? ', reuse ingredients to save money' : ''}`)],
    ['Snacks', uiEsc(peopleSnackHint(person))]
  ];
  container.innerHTML = `
    <div class="card"><dl class="kv">${kv.map(([k, v]) => `<dt>${uiEsc(k)}</dt><dd>${v}</dd>`).join('')}</dl></div>
    ${plan.notices.filter(n => n.level !== 'info').length ? `<h2>The plan will show these notices</h2><div class="stack">${plan.notices.filter(n => n.level !== 'info').map(n => uiNoticeHTML(n)).join('')}</div>` : ''}
    <div class="finish"><button class="btn primary big" type="button" id="pr-save">${uiIcon('check')}Save and see my plan</button><p class="small muted">You can come back and change any step from the People screen.</p></div>`;
  container.querySelector('#pr-save').addEventListener('click', () => {
    person.setup_complete = true;
    uiSetActive(person.id);
    peoplePersist(person);
    uiToast('Saved.');
    uiNavigate('#/plan');
  });
}

// ---- Directory of people in the shared store (names and initials only; the owner can open a profile) ----
function peopleDirectoryShellHTML() {
  const s = sharingState();
  if (!s.ready) return sharingPendingHTML();
  if (!s.db || !s.identity) return sharingLocalHTML();
  return '<p class="small muted">Loading the directory...</p>';
}

async function peopleLoadDirectory(box) {
  const s = sharingState();
  if (!box || !s.ready || !s.db || !s.identity) return;
  const rows = await sharingSafe(() => listDirectory(s.db), [], 'The directory could not be read right now.');
  if (!box.isConnected) return;
  const mineIds = new Set(uiState.profile.people.map(p => p.id));
  const list = rows.filter(r => r && r.personId).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  box.innerHTML = `<p class="small muted">Names only. Each profile is encrypted; only the device that published it and the owner can open it.${s.isOwner ? ' You are the owner, so you can open any of them.' : ''}</p>
    ${list.length ? `<div class="list">${list.map(r => { const yours = r.deviceFingerprint === s.identity.fingerprint || mineIds.has(r.personId); return `<div class="list-row"><span class="avatar" aria-hidden="true">${uiEsc(r.initials || '?')}</span><div class="list-main"><div class="list-title">${uiIcon('lock')} ${uiEsc(r.name || 'Someone')} ${yours ? uiChip('yours', 'plum') : ''}</div><div class="list-sub">${r.updated ? 'Updated ' + uiEsc(String(r.updated).slice(0, 10)) : ''}</div></div>${s.isOwner ? `<div class="list-actions"><button class="btn small" type="button" data-open-person="${uiEsc(r.personId)}">Open</button></div>` : ''}</div>`; }).join('')}</div>` : '<p class="small muted">Nobody has put a profile in the shared store yet. Switch one on under Settings, Sharing and privacy.</p>'}`;
  box.querySelectorAll('[data-open-person]').forEach(b => b.addEventListener('click', () => peopleOpenSharedPerson(b.dataset.openPerson)));
}

export async function peopleOpenSharedPerson(personId) {
  const s = sharingState();
  const res = await sharingSafe(() => openPerson(s.db, s.identity, personId), null, 'That profile could not be opened right now.');
  if (!res) { uiToast('That profile is not in the shared store any more.'); return; }
  if (res.locked) { uiToast('That profile is encrypted for another device. Only its device and the owner can open it.'); return; }
  sharingPersonModal(res.person, { subtitle: `From the shared store, updated ${String(res.updated || '').slice(0, 10)}. Read-only.`, sourceKey: 'store:' + personId });
}


// ---- Invite someone by email. The app has no mail server, so this opens the person's own mail app with the
// invitation written, or copies the text for a text message or the share sheet. ----
function peopleAppLink() {
  const href = String(location.href || '').split('#')[0];
  if (/^https?:/.test(href)) return href;
  return '';
}
function peopleInviteText(toName) {
  const link = peopleAppLink();
  const who = toName ? `Hi ${toName},` : 'Hi,';
  const lines = [who, '',
    'I set up Peace Meal for our family: one place for everyone\'s food rules, meal plans, and grocery lists. Every rule shows the medical guideline behind it, and your information stays on your own device.',
    '',
    link ? `Open it here: ${link}` : 'I\'ll send you the app file separately; open it in any web browser (it works on a phone too).',
    '',
    'When it opens: tap "Set up the first person", answer the short questions (conditions, allergies, how much time you have to cook), and tap "Save and see my plan". You can change anything later from the People screen.',
    '',
    'If we cook together, you can share just the parts you want (your food rules, a grocery list, or a meal plan) from the Together screen.',
    '',
    'Have a peaceful meal!'];
  return lines.join('\n');
}
function peopleInviteHTML() {
  const link = peopleAppLink();
  return `<div class="card">
    <p class="small">Sends an invitation from your own email app. Nothing is sent by Peace Meal itself, and no address is stored.</p>
    <div class="grid two">
      <label class="field"><span class="label">Their name (optional)</span><input id="inv-name" type="text" autocomplete="off" placeholder="Name"></label>
      <label class="field"><span class="label">Email address</span><input id="inv-email" type="email" autocomplete="off" placeholder="name@example.com" inputmode="email"></label>
    </div>
    <details class="small"><summary>Preview the message</summary><pre class="invite-preview" id="inv-preview">${uiEsc(peopleInviteText(''))}</pre></details>
    <div class="row gap wrap" style="margin-top:.75rem">
      <a class="btn primary" id="inv-mail" href="#" rel="noopener">${uiIcon('share')}Open in my email app</a>
      <button class="btn" type="button" id="inv-copy">Copy invitation</button>
      ${navigator.share ? `<button class="btn" type="button" id="inv-share">Share…</button>` : ''}
    </div>
    ${link ? '' : `<p class="small muted" style="margin-top:.5rem">You are using the single-file version, so the message has no link. Attach the app file to the email, or send the claude.ai link if you have one.</p>`}
  </div>`;
}
function peopleBindInvite(root) {
  const name = root.querySelector('#inv-name'), email = root.querySelector('#inv-email'), mail = root.querySelector('#inv-mail'), prev = root.querySelector('#inv-preview');
  if (!name || !email || !mail) return;
  const subject = 'An invitation to Peace Meal';
  const refresh = () => {
    const text = peopleInviteText(name.value.trim());
    if (prev) prev.textContent = text;
    mail.href = `mailto:${encodeURIComponent(email.value.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  };
  name.addEventListener('input', refresh); email.addEventListener('input', refresh); refresh();
  mail.addEventListener('click', (e) => { if (!email.value.trim()) { e.preventDefault(); uiToast('Enter an email address first.'); email.focus(); } });
  const copy = root.querySelector('#inv-copy'); if (copy) copy.addEventListener('click', async () => { const ok = await uiCopyText(peopleInviteText(name.value.trim())); uiToast(ok ? 'Invitation copied.' : 'Could not copy.'); });
  const share = root.querySelector('#inv-share'); if (share) share.addEventListener('click', async () => { try { await navigator.share({ title: subject, text: peopleInviteText(name.value.trim()) }); } catch { /* cancelled */ } });
}
