// Together: cooking for more than one person. Builds the strictest combined plan, a short meal plan for the chosen days,
// and a grocery list for it. Profiles can be shared as a file or text and added back as guests. Nothing is uploaded anywhere.
import { buildGroupPlan, exportPersonForSharing } from '../engine/group.js';
import { buildWeekPlan, SLOT_LABEL } from '../engine/planner.js';
import { buildGroceryList } from '../engine/grocery.js';
import { newPerson } from '../store.js';
import { uiState, uiEsc, uiActivePerson, uiPersist, uiToast, uiIsoDate, uiToday, uiFmtDate, uiFmtNum, uiNutrientLabel, uiVerdictWord, uiVerdictChip, uiTagLabel, uiDownload, uiCopyText, uiEnsurePerson, uiSegmented, uiNoticeHTML, uiPageHeader, uiSection, uiChip, uiIcon, uiAvatar, uiEmptyState, uiPlanFor, uiMultiPills } from './common.js';
import { weekRecipeModal, weekGet } from './week.js';
import { householdHTML, householdBind } from './household.js';
import { groceryIcsForWeek, groceryComputeList } from './grocery.js';
import { SHARE_PARTS, sendShare, listSharesForMe, openShare, listDevices } from '../engine/sync.js';
import { sharingState, sharingLocalHTML, sharingPendingHTML, sharingSafe, sharingDeviceName, sharingPersonModal } from './sharing.js';

const TOGETHER_SLOT_LABEL = SLOT_LABEL;

export function togetherGroupPerson(selected, eaters, seed) {
  const first = selected[0];
  const union = key => [...new Set(selected.flatMap(p => (p.preferences && p.preferences[key]) || []))];
  const gp = uiEnsurePerson({
    ...JSON.parse(JSON.stringify(first)),
    id: 'group', name: selected.map(p => p.name).join(' and '),
    allergens: [...new Set(selected.flatMap(p => p.allergens || []))],
    preferences: { avoid_tags: union('avoid_tags'), avoid_terms: union('avoid_terms'), patterns: union('patterns') },
    servings_by_day: {}, mealOverrides: {}, favorites: { recipes: [], foods: [] },
    cooking: { ...(first.cooking || {}), household: Math.max(1, Number(eaters) || selected.length) },
    planSeed: seed || 0
  });
  return gp;
}

// Reads a shared profile (from the Together screen's export) into a guest person. Throws on anything that is not one.
export function togetherGuestFromShared(obj) {
  if (!obj || typeof obj !== 'object' || obj.shared !== true) throw new Error('This is not a shared profile. It must come from "Share my profile" and contain "shared": true.');
  if (typeof obj.name !== 'string' || !obj.name.trim()) throw new Error('The shared profile has no name.');
  const keep = ['adult', 'sex', 'age', 'modules', 'allergens', 'preferences', 'medications', 'pregnancy', 'breastfeeding', 'tier2', 'phases', 'modes', 'variants', 'flags', 'optional_rules', 'rule_settings', 'confirmations', 'acknowledged', 'custom_modules', 'cooking'];
  const p = newPerson(obj.name.trim());
  for (const k of keep) if (obj[k] !== undefined) p[k] = JSON.parse(JSON.stringify(obj[k]));
  p.guest = true;
  p.setup_complete = true;
  p.screen = { scoff: [false, false, false, false, false], positive: false, completed_at: null };
  return uiEnsurePerson(p);
}

export function renderTogetherScreen(root) {
  const profile = uiState.profile;
  const me = uiActivePerson();
  const people = profile.people;
  root.innerHTML = `
    ${uiPageHeader('Together', 'One week for the whole table. Mark who is at each meal, and every seating is planned to the combined rules of the people actually there. Sharing a profile is a file or text you send yourself; nothing is uploaded anywhere.')}
    ${householdHTML()}
    ${uiSection('Share and add guests', `<div class="card">
      <p class="small">Share <strong>${uiEsc(me.name)}</strong>'s conditions, allergens, preferences, and any doctor or dietitian numbers as a small file or text, so another household can cook for them. No log, weights, or diary is included.</p>
      <div class="btn-row"><button class="btn primary" type="button" id="tg-share-file">${uiIcon('share')}Share my profile (file)</button><button class="btn" type="button" id="tg-share-copy">${uiIcon('copy')}Copy as text</button></div>
      <h3>Add a guest</h3>
      <p class="small muted">Paste the text someone sent you, or choose their file. Guests get a "Guest" chip, are out of every meal until you tap them in above, and can be removed at any time here or on the Settings screen.</p>
      ${people.some(p => p.guest) ? `<div class="together-people">${people.filter(p => p.guest).map(p => `<div class="choice" style="cursor:default"><span class="who"><span class="choice-title">${uiEsc(p.name)}</span> ${uiChip('Guest', 'plum')}<div class="hint">${(p.allergens || []).length ? 'Allergens: ' + p.allergens.map(uiTagLabel).map(uiEsc).join(', ') : 'No allergens'}</div></span><button class="btn small danger" type="button" data-remove-guest="${uiEsc(p.id)}">Remove</button></div>`).join('')}</div>` : ''}
      <div class="field"><label for="tg-paste">Paste shared profile</label><textarea id="tg-paste" style="min-height:70px" placeholder='{"shared":true,"name":"..."}'></textarea></div>
      <div class="btn-row"><button class="btn" type="button" id="tg-add-paste">Add guest from text</button><label for="tg-file" class="btn">Choose a file</label><input id="tg-file" type="file" accept="application/json,.json" class="visually-hidden"></div>
    </div>`, { id: 'tg-share-h' })}
    ${uiSection('Share with someone', `<div class="card" id="tg-store-share">${togetherStoreShellHTML()}</div>`, { id: 'tg-store-h' })}
    ${uiSection('Shared with me', `<div class="card" id="tg-store-inbox">${togetherStoreShellHTML()}</div>`, { id: 'tg-inbox-h' })}
  `;
  householdBind(root);
  togetherLoadStore(root);
  root.querySelectorAll('[data-remove-guest]').forEach(b => b.addEventListener('click', e => {
    e.preventDefault();
    const p = people.find(x => x.id === b.dataset.removeGuest);
    if (!p || !window.confirm(`Remove guest ${p.name}?`)) return;
    profile.people = profile.people.filter(x => x.id !== p.id);
    if (profile.activePerson === p.id) profile.activePerson = profile.people[0] ? profile.people[0].id : null;
    uiPersist(); uiToast(`Removed ${p.name}.`); uiState.rerender();
  }));
  root.querySelector('#tg-share-file').addEventListener('click', () => {
    const ok = uiDownload(`${me.name.replace(/[^\w-]+/g, '-').toLowerCase()}-shared-profile.json`, JSON.stringify(exportPersonForSharing(me), null, 2));
    uiToast(ok ? 'Export started. Send the file to the other household.' : 'Download blocked here. Use "Copy as text".');
  });
  root.querySelector('#tg-share-copy').addEventListener('click', async () => {
    const ok = await uiCopyText(JSON.stringify(exportPersonForSharing(me)));
    uiToast(ok ? 'Copied. Paste it into a message to the other household.' : 'Could not copy.');
  });
  const addGuest = text => {
    try {
      const guest = togetherGuestFromShared(JSON.parse(text));
      profile.people.push(guest);
      uiPersist(); uiToast(`Added ${guest.name} as a guest. Tap them into the meals they will be at.`); uiState.rerender();
    } catch (err) { uiToast('Could not add guest: ' + (err && err.message ? err.message : 'not valid JSON')); }
  };
  root.querySelector('#tg-add-paste').addEventListener('click', () => { const t = root.querySelector('#tg-paste').value.trim(); if (!t) { uiToast('Paste the shared profile first.'); return; } addGuest(t); });
  root.querySelector('#tg-file').addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { addGuest(String(reader.result)); e.target.value = ''; };
    reader.readAsText(file);
  });
}

// ---- Sharing through the shared store (claude.ai version only) ----
let togetherShareUi = { person: null, device: '', parts: ['rules'], days: [], expiry: 30 };

function togetherStoreShellHTML() {
  const s = sharingState();
  if (!s.ready) return sharingPendingHTML();
  if (!s.db || !s.identity) return sharingLocalHTML();
  return '<p class="small muted">Loading...</p>';
}

async function togetherLoadStore(root) {
  const s = sharingState();
  if (!s.ready || !s.db || !s.identity) return;
  const [devices, shares] = await Promise.all([
    sharingSafe(() => listDevices(s.db), [], 'The device list could not be read.'),
    sharingSafe(() => listSharesForMe(s.db, s.identity), [], 'Shares could not be read right now.')
  ]);
  if (!root.isConnected) return;
  togetherRenderShareForm(root.querySelector('#tg-store-share'), devices);
  togetherRenderInbox(root.querySelector('#tg-store-inbox'), shares, devices);
}

function togetherRenderShareForm(box, devices) {
  const s = sharingState();
  const mine = uiState.profile.people.filter(p => !p.guest);
  const others = devices.filter(d => d && d.fingerprint && d.fingerprint !== s.identity.fingerprint);
  if (!mine.length) { box.innerHTML = '<p class="small muted">Add a person first.</p>'; return; }
  if (!togetherShareUi.person || !mine.find(p => p.id === togetherShareUi.person)) togetherShareUi.person = (uiActivePerson() && !uiActivePerson().guest ? uiActivePerson().id : mine[0].id);
  if (!others.find(d => d.fingerprint === togetherShareUi.device)) togetherShareUi.device = others[0] ? others[0].fingerprint : '';
  const person = mine.find(p => p.id === togetherShareUi.person);
  let week = null;
  try { week = uiState.data.recipes.length ? weekGet(person, uiPlanFor(person)) : null; } catch { week = null; }
  const dayOpts = week ? week.days.map(d => ({ value: d.date, label: uiFmtDate(d.date) })) : [];
  const wantWeek = togetherShareUi.parts.includes('week');
  box.innerHTML = `
    <p class="small">Send parts of a profile to one other device. The package is encrypted for that device only and expires on its own.</p>
    <div class="grid-2">
      <div class="field"><label for="ts-person">Whose profile</label><select id="ts-person">${mine.map(p => `<option value="${uiEsc(p.id)}" ${p.id === togetherShareUi.person ? 'selected' : ''}>${uiEsc(p.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="ts-device">Send to</label><select id="ts-device" ${others.length ? '' : 'disabled'}>${others.length ? others.map(d => `<option value="${uiEsc(d.fingerprint)}" ${d.fingerprint === togetherShareUi.device ? 'selected' : ''}>${uiEsc(d.name || 'Device')}</option>`).join('') : '<option value="">No other device has opened Peace Meal yet</option>'}</select></div>
    </div>
    <div class="field"><span class="label">What to share</span><div class="choice-list">${SHARE_PARTS.map(p => `<label class="choice"><input type="checkbox" data-part="${p.id}" ${togetherShareUi.parts.includes(p.id) ? 'checked' : ''}><span class="choice-body"><span class="choice-title">${uiEsc(p.label)}</span></span></label>`).join('')}</div></div>
    <div class="field" id="ts-days" ${wantWeek ? '' : 'hidden'}><span class="label">Which days</span>${dayOpts.length ? uiMultiPills('ts-days', dayOpts, togetherShareUi.days.length ? togetherShareUi.days : dayOpts.map(d => d.value), { label: 'Days to share' }) : '<p class="small muted">No week plan is available for this person.</p>'}</div>
    <div class="field"><span class="label">Expires after</span>${uiSegmented('ts-expiry', [{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }], togetherShareUi.expiry)}</div>
    <div class="btn-row"><button class="btn primary" type="button" id="ts-send" ${others.length ? '' : 'disabled'}>${uiIcon('share')}Send</button></div>`;
  if (!togetherShareUi.days.length) togetherShareUi.days = dayOpts.map(d => d.value);
  box.querySelector('#ts-person').addEventListener('change', e => { togetherShareUi.person = e.target.value; togetherShareUi.days = []; togetherRenderShareForm(box, devices); });
  const dev = box.querySelector('#ts-device');
  if (dev) dev.addEventListener('change', e => { togetherShareUi.device = e.target.value; });
  box.querySelectorAll('[data-part]').forEach(c => c.addEventListener('change', () => { togetherShareUi.parts = [...box.querySelectorAll('[data-part]')].filter(x => x.checked).map(x => x.dataset.part); box.querySelector('#ts-days').hidden = !togetherShareUi.parts.includes('week'); }));
  box.querySelectorAll('[data-multi="ts-days"]').forEach(c => c.addEventListener('change', () => { togetherShareUi.days = [...box.querySelectorAll('[data-multi="ts-days"]')].filter(x => x.checked).map(x => x.value); c.parentElement.classList.toggle('on', c.checked); }));
  box.querySelectorAll('[data-seg="ts-expiry"]').forEach(r => r.addEventListener('change', () => { togetherShareUi.expiry = Number(r.value); box.querySelectorAll('[data-seg="ts-expiry"]').forEach(x => x.parentElement.classList.toggle('on', x.checked)); }));
  box.querySelector('#ts-send').addEventListener('click', async () => {
    const target = others.find(d => d.fingerprint === togetherShareUi.device);
    if (!target) { uiToast('Choose a device to send to.'); return; }
    if (!togetherShareUi.parts.length) { uiToast('Choose at least one part to share.'); return; }
    const extra = {};
    if (togetherShareUi.parts.includes('week') && week) extra.week = { start: week.days[0].date, days: week.days.filter(d => togetherShareUi.days.includes(d.date)).map(d => ({ date: d.date, day: d.day, meals: d.meals.map(m => ({ slot: m.slot, recipe: m.recipe, name: m.name, source: m.source, servings: m.servings })) })) };
    if (togetherShareUi.parts.includes('grocery')) { const g = uiState.data.recipes.length ? groceryComputeList(person) : null; extra.grocery = g ? { week: g.week.days[0].date, items: g.list.items.map(i => ({ food: i.food, name: i.name, group: i.group, quantity: i.quantity, grams: i.grams, removed: !!i.removed })) } : null; }
    const btn = box.querySelector('#ts-send'); btn.disabled = true;
    const res = await sharingSafe(() => sendShare(s.db, s.identity, target, person, togetherShareUi.parts, extra, togetherShareUi.expiry), { ok: false, reason: 'error' });
    btn.disabled = false;
    uiToast(res.ok ? `Sent to ${target.name || 'that device'}. It expires in ${togetherShareUi.expiry} days.` : 'The share could not be sent: ' + (res.reason || 'error'));
  });
}

function togetherRenderInbox(box, shares, devices) {
  const s = sharingState();
  const partLabel = id => { const p = SHARE_PARTS.find(x => x.id === id); return p ? p.label : id; };
  const rows = shares.slice().sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')));
  box.innerHTML = rows.length ? `<div class="list">${rows.map(sh => `<div class="list-row"><div class="list-main"><div class="list-title">${uiIcon('lock')} ${uiEsc(sh.personName || 'Profile')} <span class="muted" style="font-weight:400">from ${uiEsc(sh.fromName || sharingDeviceName(devices, sh.from))}</span></div><div class="list-sub">${(sh.parts || []).map(partLabel).map(uiEsc).join(', ')} · expires ${uiEsc(String(sh.expires || '').slice(0, 10))}</div></div><div class="list-actions"><button class="btn small" type="button" data-open-share="${uiEsc(sh.id)}">Open</button></div></div>`).join('')}</div>`
    : '<p class="small muted">Nothing has been shared with this device yet.</p>';
  box.querySelectorAll('[data-open-share]').forEach(b => b.addEventListener('click', async () => {
    const sh = rows.find(x => x.id === b.dataset.openShare);
    if (!sh) return;
    const pkg = await sharingSafe(() => openShare(s.db, s.identity, sh), null, 'That share could not be opened.');
    if (!pkg) { uiToast('That share could not be decrypted on this device.'); return; }
    sharingPersonModal(pkg, { subtitle: `Shared by ${sh.fromName || sharingDeviceName(devices, sh.from)}; expires ${String(sh.expires || '').slice(0, 10)}.`, sourceKey: 'share:' + (sh.personName || '') + ':' + sh.from });
  }));
}
