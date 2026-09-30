// Shared-store helpers used by Settings, People, Together, and the owner dashboard. Everything here tolerates a missing store:
// when uiState.sync.db is null the screens show one calm sentence and nothing else changes.
import { buildPlan } from '../engine/plan.js';
import { publishPerson } from '../engine/sync.js';
import { uiState, uiEsc, uiPersist, uiToast, uiModal, uiToday, uiFmtDate, uiFmtNum, uiNutrientLabel, uiTagLabel, uiModuleName, uiChip, uiIcon, uiAvatar, uiNoticeHTML, UI_ALLERGENS } from './common.js';
import { togetherGuestFromShared } from './together.js';

export const SHARING_LOCAL_SENTENCE = 'Shared profiles need the claude.ai version of Peace Meal. On this device everything stays local.';

export function sharingState() { return uiState.sync || { db: null, identity: null, owner: null, isOwner: false, ready: true }; }
export function sharingAvailable() { const s = sharingState(); return !!(s.db && s.identity); }
export function sharingLocalHTML() { return `<p class="small muted">${SHARING_LOCAL_SENTENCE}</p>`; }
export function sharingPendingHTML() { return '<p class="small muted">Checking for a shared store...</p>'; }

// Awaits a sync call; on any failure shows a toast and returns the fallback. Never throws into a render path.
export async function sharingSafe(work, fallback, message = 'The shared store did not answer. Everything on this device is unchanged.') {
  try { return await work(); } catch (e) { console.warn(e); uiToast(message); return fallback; }
}

export function sharingDeviceName(devices, fingerprint) {
  const me = sharingState().identity;
  if (me && fingerprint === me.fingerprint) return (me.name || 'This device') + ' (this device)';
  const d = (devices || []).find(x => x.fingerprint === fingerprint);
  return d ? (d.name || 'Device') : 'Unknown device';
}
export function sharingShortFingerprint(fp) { return String(fp || '').slice(0, 8); }

// Publishes a person to the store when they are marked for it. Debounced per person; silent on success, a toast on failure.
const sharingPublishTimers = new Map();
export function sharingPublishIfShared(person, { now = false } = {}) {
  const s = sharingState();
  if (!person || !person.shared_store || !s.db || !s.identity) return;
  clearTimeout(sharingPublishTimers.get(person.id));
  const run = async () => {
    sharingPublishTimers.delete(person.id);
    const res = await sharingSafe(() => publishPerson(s.db, s.identity, person), { ok: false, reason: 'error' });
    if (!res || !res.ok) uiToast(`${person.name} could not be saved to the shared store (${res && res.reason ? res.reason : 'error'}). The local copy is fine.`);
    else if (now) uiToast(`${person.name} is in the shared store, encrypted for this device and the owner.`);
  };
  if (now) run(); else sharingPublishTimers.set(person.id, setTimeout(run, 1200));
}

// Imports a decrypted person (from the directory or a share package) as a guest for Together. Replaces an earlier import of the same person.
export function sharingAddGuest(obj, sourceKey) {
  const shared = obj && obj.shared === true ? obj : { shared: true, ...obj };
  const guest = togetherGuestFromShared(shared);
  guest.shared_from = sourceKey || null;
  const profile = uiState.profile;
  const prev = sourceKey ? profile.people.find(p => p.guest && p.shared_from === sourceKey) : null;
  if (prev) { guest.id = prev.id; Object.assign(prev, guest); }
  else profile.people.push(guest);
  uiPersist();
  uiToast(`${guest.name} ${prev ? 'was updated as a guest' : 'was added as a guest'}. Pick them on the Together screen.`);
  return guest;
}

// Read-only view of a person from the store or a share: plan summary, allergens, modules, doctor or dietitian numbers, and optional week/grocery parts.
export function sharingPersonModal(obj, opts = {}) {
  const person = obj || {};
  const hasRules = Array.isArray(person.modules) || Array.isArray(person.allergens);
  let plan = null;
  if (hasRules) { try { plan = buildPlan({ person: { ...person, id: person.id || 'shared', preferences: person.preferences || { avoid_tags: [], avoid_terms: [], patterns: [] } }, conditions: uiState.data.conditions, dictionaries: uiState.data.dictionaries, today: uiToday() }); } catch (e) { console.warn(e); plan = null; } }
  const allergenLabel = t => { const a = UI_ALLERGENS.find(x => x.tag === t); return a ? a.label : uiTagLabel(t); };
  const hard = plan ? Object.entries(plan.avoid).filter(([, a]) => a.hard) : [];
  const week = person.week && Array.isArray(person.week.days) ? person.week : null;
  const grocery = person.grocery && Array.isArray(person.grocery.items) ? person.grocery : null;
  const parts = Array.isArray(person.parts) ? person.parts : null;
  uiModal(`
    <div class="person-row">${uiAvatar(person.name, { size: 'lg', tone: 'plum' })}<div class="person-main"><div class="name">${uiEsc(person.name || 'Shared profile')}</div><div class="small muted">${opts.subtitle ? uiEsc(opts.subtitle) : 'Read-only view. Nothing here changes the other person’s profile.'}</div></div></div>
    ${parts ? `<div class="row">${parts.map(p => uiChip(p, 'plum')).join('')}</div>` : ''}
    ${hasRules ? `
      <h3>Allergens</h3>${(person.allergens || []).length ? `<div class="row">${person.allergens.map(t => uiChip(allergenLabel(t), 'stop')).join('')}</div>` : '<p class="small muted">None listed.</p>'}
      <h3>Modules</h3>${(person.modules || []).length || (person.custom_modules || []).length ? `<ul class="small">${(person.modules || []).map(m => `<li>${uiEsc(uiModuleName(m))}</li>`).join('')}${(person.custom_modules || []).map(cm => `<li>${uiEsc(cm.name)} <span class="chip plum">Defined by them</span></li>`).join('')}</ul>` : '<p class="small muted">None selected.</p>'}
      ${plan ? `<h3>Plan summary</h3>
        <dl class="kv">
          <dt>Rules applied</dt><dd>${uiFmtNum((plan.applied || []).length)}</dd>
          <dt>Hard exclusions</dt><dd>${hard.length ? hard.map(([t]) => uiEsc(uiTagLabel(t))).join(', ') : 'none'}</dd>
          <dt>Limits</dt><dd>${Object.keys(plan.limits).length ? Object.entries(plan.limits).map(([n, l]) => `${uiEsc(uiNutrientLabel(n))} at most ${uiFmtNum(l.value, 1)}${l.clinician ? ' (from your doctor or dietitian)' : ''}`).join('; ') : 'none'}</dd>
          <dt>Targets</dt><dd>${Object.keys(plan.targets).length ? Object.entries(plan.targets).map(([n, t]) => `${uiEsc(uiNutrientLabel(n))} at least ${uiFmtNum(t.min, 1)}`).join('; ') : 'none'}</dd>
        </dl>
        ${plan.notices.filter(n => n.level !== 'info').length ? `<div class="stack">${plan.notices.filter(n => n.level !== 'info').map(n => uiNoticeHTML(n)).join('')}</div>` : ''}` : ''}
      <h3>Numbers from a doctor or dietitian</h3>${person.tier2 && Object.keys(person.tier2).length ? `<ul class="small">${Object.entries(person.tier2).map(([k, v]) => `<li>${uiEsc(k)}: <strong>${uiEsc(v)}</strong> ${uiChip('doctor or dietitian', 'plum')}</li>`).join('')}</ul>` : '<p class="small muted">None entered.</p>'}
      ${person.cooking ? `<h3>Cooking</h3><p class="small">${uiEsc(`${person.cooking.weekday_minutes || 20} min weekdays, ${person.cooking.weekend_minutes || 40} min weekends, ${(person.cooking.cook_days || []).length} cook days, ${person.cooking.skill || 'comfortable'}, ${(person.cooking.equipment || []).join(', ') || 'no equipment listed'}`)}</p>` : ''}` : ''}
    ${week ? `<h3>Meal plan</h3><div class="stack">${week.days.map(d => `<div><strong>${uiEsc(uiFmtDate(d.date))}</strong><ul class="small">${(d.meals || []).filter(m => m.recipe).map(m => `<li>${uiEsc(m.slot)}: ${uiEsc(m.name)}${m.source === 'leftover' ? ' (leftovers)' : ''}</li>`).join('') || '<li class="muted">No meals</li>'}</ul></div>`).join('')}</div>` : ''}
    ${grocery ? `<h3>Grocery list</h3><ul class="small">${grocery.items.filter(i => !i.removed).map(i => `<li>${uiEsc(i.name)}: ${uiEsc(i.quantity)}</li>`).join('') || '<li class="muted">Empty</li>'}</ul>` : ''}
    ${hasRules ? `<div class="btn-row"><button class="btn primary" type="button" id="sh-guest">${uiIcon('people')}Add as guest</button></div><p class="small muted">A guest can be picked on the Together screen so meals fit everyone at the table.</p>` : '<p class="small muted">This share holds no food rules, so there is nothing to add as a guest.</p>'}
  `, { title: person.name || 'Shared profile', label: 'Shared profile' });
  const btn = document.querySelector('#sh-guest');
  if (btn) btn.addEventListener('click', () => { try { sharingAddGuest(person, opts.sourceKey); if (uiState.modalClose) uiState.modalClose(); uiState.rerender(); } catch (e) { uiToast('Could not add guest: ' + (e && e.message ? e.message : 'invalid profile')); } });
}
