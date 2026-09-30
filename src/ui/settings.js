// Settings: appearance (theme, large text), export, import, guests, clear, about.
import { exportJSON, importJSON, clearAll, defaultProfile, backupDue, storeState, unreadableCopies } from '../store.js';
import { appCollectionCounts } from '../app.js';
import { uiState, uiEsc, uiPersist, uiDownload, uiToast, uiNavigate, uiIsoDate, uiCopyText, uiEnsurePerson, uiPageHeader, uiSection, uiSwitch, uiSegmented, uiChip, uiIcon, uiLoadUiPrefs, uiSaveUiPrefs, uiNoticeHTML, uiModal, uiShareFile } from './common.js';
import { claimOwner, registerDevice, sealOwnerBackup, restoreOwnerBackup, forgetDeviceIdentity, removePerson } from '../engine/sync.js';
import { sharingState, sharingLocalHTML, sharingPendingHTML, sharingSafe, sharingPublishIfShared, sharingShortFingerprint } from './sharing.js';
import { installInSafariTab, installInBrowserTab, installShowGuide } from './install.js';

export function renderSettingsScreen(root) {
  const profile = uiState.profile;
  const d = uiState.data;
  const guests = profile.people.filter(p => p.guest);
  const prefs = uiLoadUiPrefs();
  root.innerHTML = `
    ${uiPageHeader('Settings', 'Appearance, backup, guests, and what this app is.')}
    ${uiSection('Appearance', `<div class="card">
      <div class="field"><span class="label">Theme</span>${uiSegmented('set-theme', [{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }], prefs.theme, { label: 'Theme' })}<div class="hint">System follows the device setting.</div></div>
      ${uiSwitch('set-large', 'Large text', 'Raises the base text size across the app.', prefs.largeText)}
    </div>`, { id: 'set-appearance-h' })}
    ${uiSection('Backup', `<div class="card">
      <p>Everything lives in this browser's storage on this device. Export a JSON file to back it up or move it to another device.</p>
      <div class="btn-row"><button class="btn primary lite-big" type="button" id="set-share">${uiIcon('share')}Send a backup</button><button class="btn" type="button" id="set-export">${uiIcon('share')}Export JSON</button><button class="btn" type="button" id="set-copy">${uiIcon('copy')}Copy JSON to clipboard</button></div>
      <p class="small muted">Send a backup opens your phone's share sheet: mail it to yourself, save it to Files or iCloud Drive, or AirDrop it. To restore on a new phone, open the app there and import the file below.</p>
      <p class="small">${profile.last_backup_at ? `Last backup: ${uiEsc(new Date(profile.last_backup_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }))}. A reminder comes up a month after each one.` : 'No backup sent from this app yet. A reminder comes up once a month.'}</p>
      ${installInSafariTab() ? `<p class="small">This is open in a Safari tab. <button class="btn link small" type="button" id="set-home-screen">How to add it to the Home Screen and move your data</button></p>` : installInBrowserTab() ? `<p class="small">This is open in your browser. <button class="btn link small" type="button" id="set-home-screen">How to add it to the Home screen</button></p>` : ''}
    </div>`, { id: 'set-backup-h' })}
    ${uiSection('Import', `<div class="card">
      <p>Importing replaces everything on this device with the contents of the file. You will be asked to confirm.</p>
      <label for="set-import" class="btn">Choose a file to import</label>
      <input id="set-import" type="file" accept="application/json,.json" class="visually-hidden">
    </div>`, { id: 'set-import-h' })}
    ${uiSection('Recipe collections', settingsCollectionsHTML(profile), { id: 'set-coll-h' })}
    ${uiSection('Guests', `<p class="small muted">Guests are profiles other people shared with you (Together screen). They can be picked when cooking together and removed here.</p>
      ${guests.length ? `<div class="list boxed">${guests.map(g => `<div class="list-row"><div class="list-main"><div class="list-title">${uiEsc(g.name)} ${uiChip('Guest', 'plum')}</div><div class="list-sub">${(g.allergens || []).length ? 'allergens: ' + g.allergens.length : 'no allergens'}, ${(g.modules || []).length} module${(g.modules || []).length === 1 ? '' : 's'}</div></div><div class="list-actions"><button class="btn small danger" type="button" data-remove-guest="${uiEsc(g.id)}">Remove</button></div></div>`).join('')}</div>` : '<p class="small muted">No guests. Add one on the Together screen by pasting a shared profile or choosing a file.</p>'}`, { id: 'set-guests-h' })}
    ${uiSection('Calendar export', `<p class="small">"Add to calendar (.ics)" on the Grocery and Together screens saves a standard calendar file with one all-day event per day listing that day's meals. Import it into Google Calendar (Settings, Import and export), Apple Calendar, Outlook, or a Skylight calendar. There is no direct Google Keep or Skylight list integration; use Share or Copy for the grocery list itself.</p>`, { id: 'set-cal-h' })}
    ${uiSection('Sharing and privacy', settingsSharingHTML(profile), { id: 'set-share-h' })}
    ${settingsUnreadableHTML()}
    ${uiSection('Clear all data', `<p>Removes every person, log entry, and grocery tick from this device. Export first if you want a copy.</p>
      <div><button class="btn danger" type="button" id="set-clear">${uiIcon('trash')}Clear all data</button></div>`, { id: 'set-clear-h' })}
    ${uiSection('About', `<dl class="kv">
        <dt>Version</dt><dd>${uiEsc(uiState.version)}</dd>
        <dt>People</dt><dd>${profile.people.length}</dd>
        <dt>Log entries</dt><dd>${(profile.log || []).length}</dd>
        <dt>Data loaded</dt><dd>${d.sources.length} sources, ${d.conditions.length} modules, ${Object.keys(d.dictionaries.tags || {}).length} tags, ${(d.dictionaries.entries || []).length} dictionary terms, ${d.foods.length} foods, ${d.recipes.length} recipes</dd>
        <dt>Storage</dt><dd>On this device only. Nothing is sent anywhere. There is no account and no server.${sharingState().db ? ' A person is copied to the shared store only when you switch that on above, and only encrypted.' : ''} <span class="small muted">Saved under ${uiEsc(storeState.key || '')}.${storeState.migration && storeState.migration.migrated ? ' Moved there from ' + uiEsc(storeState.migration.from) + ' on this launch; the old copy is kept.' : ''}${storeState.migration && storeState.migration.error ? ' ' + uiEsc(storeState.migration.error) + '.' : ''}</span></dd>
        <dt>Recipes</dt><dd>Peace Meal, the NHS website (Open Government Licence v3.0), the Wikibooks Cookbook (CC BY-SA 4.0), and your own. <a href="#/learn/sources">Where the recipes come from</a>.</dd>
        <dt>Language model</dt><dd>None. Every decision comes from readable data files.</dd>
      </dl>
      <p><strong>This app is for general wellness and education. It does not diagnose or treat any condition. Any medical targets, like a sodium or protein limit, come from your doctor or dietitian, never from the app.</strong></p>
      ${uiState.dataProblems.length ? uiNoticeHTML({ level: 'warn', text: uiState.dataProblems.join(' ') }) : ''}`, { id: 'set-about-h' })}
  `;
  root.querySelectorAll('[data-seg="set-theme"]').forEach(r => r.addEventListener('change', () => {
    uiSaveUiPrefs({ ...uiLoadUiPrefs(), theme: r.value });
    root.querySelectorAll('[data-seg="set-theme"]').forEach(x => x.parentElement.classList.toggle('on', x.checked));
  }));
  root.querySelector('#set-large').addEventListener('change', e => {
    uiSaveUiPrefs({ ...uiLoadUiPrefs(), largeText: e.target.checked, largeTextSet: true });
    e.target.setAttribute('aria-checked', String(e.target.checked));
  });
  root.querySelectorAll('[data-remove-guest]').forEach(b => b.addEventListener('click', () => {
    const g = profile.people.find(p => p.id === b.dataset.removeGuest);
    if (!g || !window.confirm(`Remove guest ${g.name}?`)) return;
    profile.people = profile.people.filter(p => p.id !== g.id);
    if (profile.activePerson === g.id) profile.activePerson = profile.people[0] ? profile.people[0].id : null;
    uiPersist(); uiToast(`Removed ${g.name}.`); uiState.rerender();
  }));
  root.querySelector('#set-export').addEventListener('click', () => {
    const ok = uiDownload(`peace-meal-${uiIsoDate()}.json`, exportJSON(profile));
    if (ok) settingsMarkBackup();
    uiToast(ok ? 'Export started.' : 'Download blocked here. Use "Copy JSON" instead.');
  });
  root.querySelector('#set-share').addEventListener('click', () => settingsShareBackup());
  const hs = root.querySelector('#set-home-screen'); if (hs) hs.addEventListener('click', () => installShowGuide());
  root.querySelector('#set-copy').addEventListener('click', async () => {
    const ok = await uiCopyText(exportJSON(profile));
    uiToast(ok ? 'JSON copied.' : 'Could not copy.');
  });
  root.querySelector('#set-import').addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    settingsImportFile(file, () => { e.target.value = ''; });
  });
  settingsBindSharing(root, profile);
  settingsBindCollections(root, profile);
  settingsBindUnreadable(root);
  root.querySelector('#set-clear').addEventListener('click', () => {
    if (!window.confirm('Clear all data on this device? This cannot be undone.')) return;
    clearAll();
    try { for (const k of Object.keys(localStorage)) if (k.startsWith('sn-grocery:')) localStorage.removeItem(k); } catch { /* ignore */ }
    uiState.profile = defaultProfile();
    uiPersist();
    uiToast('Cleared.');
    uiNavigate('#/welcome');
  });
}

// ---- Saved data that could not be read (P0-4, fix pass of September 30, 2026) ----
// store.js keeps each unreadable save under its own key. Clear data leaves these copies alone; only this list removes
// one, and only after the person saves it as a file or confirms.
function settingsUnreadableHTML() {
  const copies = unreadableCopies();
  if (!copies.length) return '';
  return uiSection('Saved data that could not be read', `<div class="card">
      <p>This device keeps ${copies.length === 1 ? 'a copy' : copies.length + ' copies'} of saved data the app could not read. Save ${copies.length === 1 ? 'it' : 'each one'} as a file for whoever looks after this app; they may be able to recover it.</p>
      <div class="list boxed">${copies.map((c, i) => `<div class="list-row"><div class="list-main"><div class="list-title">Kept ${uiEsc(settingsUnreadableWhen(c.key))}</div><div class="list-sub">${uiEsc(String((c.text || '').length))} characters</div></div>
        <div class="btn-row"><button class="btn small" type="button" data-unreadable-file="${i}">Save as a file</button><button class="btn small danger" type="button" data-unreadable-delete="${i}">Delete</button></div></div>`).join('')}</div>
    </div>`, { id: 'set-unreadable-h' });
}
function settingsUnreadableWhen(key) {
  const t = new Date(key.split(':unreadable:')[1] || '');
  return Number.isFinite(t.getTime()) ? t.toLocaleString(undefined, { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : key;
}
function settingsBindUnreadable(root) {
  const copies = unreadableCopies();
  root.querySelectorAll('[data-unreadable-file]').forEach(b => b.addEventListener('click', async () => {
    const c = copies[Number(b.dataset.unreadableFile)];
    if (!c) return;
    const r = await uiShareFile(`peace-meal-could-not-read-${uiIsoDate()}.json`, c.text || '', 'Peace Meal: saved data that could not be read');
    if (r === 'shared' || r === 'saved') uiToast('Saved as a file.'); else if (r === 'failed') uiToast('The file could not be saved here.');
  }));
  root.querySelectorAll('[data-unreadable-delete]').forEach(b => b.addEventListener('click', () => {
    const c = copies[Number(b.dataset.unreadableDelete)];
    if (!c || !window.confirm('Delete this copy of the data that could not be read? Save it as a file first if anyone may want it. This cannot be undone.')) return;
    try { localStorage.removeItem(c.key); } catch { /* ignore */ }
    uiToast('Deleted.'); uiState.rerender();
  }));
}

// ---- Sharing and privacy (shared store on claude.ai; one calm sentence everywhere else) ----
function settingsSharingHTML(profile) {
  const s = sharingState();
  if (!s.ready) return `<div class="card">${sharingPendingHTML()}</div>`;
  if (!s.db || !s.identity) return `<div class="card">${sharingLocalHTML()}</div>`;
  const mine = profile.people.filter(p => !p.guest);
  return `<div class="card">
      <div class="row">${uiChip('Shared store: on', 'pass')}${s.isOwner ? uiChip('Owner: yes', 'plum') : uiChip(`Owner: no${s.owner ? ` (${s.owner.name || 'another device'})` : ' (unclaimed)'}`, 'neutral')}</div>
      <p class="small muted">Your profiles stay on this device unless you switch one on below. A profile in the shared store is encrypted: only this device and the owner can open it, and other people see only the name. Device key ${sharingShortFingerprint(s.identity.fingerprint)}.</p>
      <div class="field"><label for="set-device-name">This device's name (what others see)</label><div class="row"><input id="set-device-name" type="text" maxlength="40" value="${uiEsc(s.identity.name || '')}" style="flex:1;min-width:160px"><button class="btn small" type="button" id="set-device-save">Save name</button></div></div>
      <h3>Owner</h3>
      <p class="small">The owner can open every profile in the shared store and see the owner dashboard. The first device to claim the role keeps it; it can move to another device only with the backed-up key.</p>
      <div class="btn-row">
        ${s.isOwner ? `<a class="btn small primary" href="#/owner">${uiIcon('key')}Owner dashboard</a>` : `<button class="btn small primary" type="button" id="set-claim" ${s.owner ? 'disabled' : ''}>${uiIcon('key')}Become the owner</button>`}
        <button class="btn small" type="button" id="set-backup" ${s.isOwner ? '' : 'disabled'}>${uiIcon('share')}Back up owner key</button>
        <label for="set-restore" class="btn small">${uiIcon('copy')}Restore owner key</label><input id="set-restore" type="file" accept="application/json,.json" class="visually-hidden">
        <button class="btn small danger" type="button" id="set-forget">${uiIcon('trash')}Forget this device's key</button>
      </div>
      ${s.owner && !s.isOwner ? `<p class="small muted">The owner role is held by "${uiEsc(s.owner.name || 'another device')}" (key ${sharingShortFingerprint(s.owner.fingerprint)}). Restore that device's backed-up key here to move the role.</p>` : ''}
      <p class="small muted">Without a backup, the owner role cannot move to another device. Forgetting this device's key means profiles it published can no longer be opened from here.</p>
      <h3>People in the shared store</h3>
      ${mine.length ? mine.map(p => uiSwitch('set-share-' + p.id, `Keep ${p.name} in the shared store`, 'Encrypted for this device and the owner. Other people see only the name.', !!p.shared_store)).join('') : '<p class="small muted">No people yet.</p>'}
    </div>`;
}

function settingsBindSharing(root, profile) {
  const s = sharingState();
  if (!s.db || !s.identity) return;
  const saveName = root.querySelector('#set-device-save');
  if (saveName) saveName.addEventListener('click', async () => {
    const name = root.querySelector('#set-device-name').value.trim() || 'This device';
    s.identity.name = name;
    try { localStorage.setItem('peace-meal:device', JSON.stringify(s.identity)); } catch { /* ignore */ }
    const ok = await sharingSafe(() => registerDevice(s.db, s.identity), false);
    uiToast(ok ? `This device is now "${name}".` : 'The name was kept locally but the shared store did not update.');
  });
  const claim = root.querySelector('#set-claim');
  if (claim) claim.addEventListener('click', async () => {
    if (!window.confirm('Become the owner of the shared store? The first device to claim it keeps it. Back up the key afterwards so the role can move devices.')) return;
    const res = await sharingSafe(() => claimOwner(s.db, s.identity, s.identity.name), { ok: false, reason: 'error' });
    if (res.ok) { s.owner = { fingerprint: s.identity.fingerprint, name: s.identity.name }; s.isOwner = true; uiToast('This device is now the owner. Back up the key next.'); uiState.rerender(); }
    else if (res.reason === 'already-claimed') { s.owner = res.owner; s.isOwner = false; uiToast(`Already claimed by "${res.owner && res.owner.name || 'another device'}".`); uiState.rerender(); }
    else uiToast('Could not claim the owner role: ' + res.reason);
  });
  const backup = root.querySelector('#set-backup');
  if (backup) backup.addEventListener('click', () => settingsBackupModal());
  root.querySelector('#set-restore').addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { settingsRestoreModal(String(reader.result)); e.target.value = ''; };
    reader.readAsText(file);
  });
  root.querySelector('#set-forget').addEventListener('click', () => {
    if (!window.confirm("Forget this device's key? Profiles this device published can no longer be opened from here, and the owner role (if held here) is lost unless it was backed up.")) return;
    forgetDeviceIdentity();
    s.identity = null; s.isOwner = false;
    uiToast('This device\'s key was forgotten. A new one is made the next time the app opens.');
    uiState.rerender();
  });
  profile.people.filter(p => !p.guest).forEach(p => {
    const sw = root.querySelector('#set-share-' + CSS.escape(p.id));
    if (!sw) return;
    sw.addEventListener('change', async () => {
      p.shared_store = sw.checked;
      sw.setAttribute('aria-checked', String(sw.checked));
      uiPersist();
      if (sw.checked) sharingPublishIfShared(p, { now: true });
      else { const ok = await sharingSafe(() => removePerson(s.db, p.id), false); uiToast(ok ? `${p.name} was removed from the shared store.` : `${p.name} is no longer kept in sync; the stored copy could not be removed right now.`); }
    });
  });
}

function settingsBackupModal() {
  const s = sharingState();
  const m = uiModal(`
    <p class="small">The owner key is sealed with a passphrase and saved as <code>peace-meal-owner-key.json</code>. Keep both somewhere safe: without them the owner role cannot move to another device.</p>
    <div class="field"><label for="bk-p1">Passphrase (at least 8 characters)</label><input id="bk-p1" type="password" autocomplete="new-password"></div>
    <div class="field"><label for="bk-p2">Type it again</label><input id="bk-p2" type="password" autocomplete="new-password"></div>
    <div class="btn-row"><button class="btn primary" type="button" id="bk-go">${uiIcon('share')}Seal and download</button></div>`, { title: 'Back up owner key' });
  if (!m) return;
  m.el.querySelector('#bk-go').addEventListener('click', async () => {
    const a = m.el.querySelector('#bk-p1').value, b = m.el.querySelector('#bk-p2').value;
    if (a.length < 8) { uiToast('Use at least 8 characters.'); return; }
    if (a !== b) { uiToast('The two passphrases differ.'); return; }
    const box = await sharingSafe(() => sealOwnerBackup(s.identity, a), null, 'The key could not be sealed on this device.');
    if (!box) return;
    const ok = uiDownload('peace-meal-owner-key.json', JSON.stringify({ peaceMealOwnerKey: 1, name: s.identity.name, created: new Date().toISOString(), ...box }, null, 2));
    uiToast(ok ? 'Backup started. Store the file and the passphrase apart.' : 'Download blocked here.');
    if (ok) m.close();
  });
}

function settingsRestoreModal(text) {
  let box = null;
  try { box = JSON.parse(text); } catch { uiToast('That file is not a Peace Meal owner key.'); return; }
  if (!box || !box.ct || !box.salt) { uiToast('That file is not a Peace Meal owner key.'); return; }
  const m = uiModal(`
    <p class="small">Restoring replaces this device's key with the owner's key from the backup. Profiles published by the old key on this device will no longer open here.</p>
    <div class="field"><label for="rs-p">Passphrase</label><input id="rs-p" type="password" autocomplete="current-password"></div>
    <div class="btn-row"><button class="btn primary" type="button" id="rs-go">${uiIcon('key')}Restore</button></div>`, { title: 'Restore owner key' });
  if (!m) return;
  m.el.querySelector('#rs-go').addEventListener('click', async () => {
    const pass = m.el.querySelector('#rs-p').value;
    if (!pass) { uiToast('Enter the passphrase.'); return; }
    let id = null;
    try { id = await restoreOwnerBackup(box, pass); } catch (e) { uiToast('Could not open the backup: wrong passphrase or not an owner key.'); return; }
    if (!id) return;
    m.close();
    uiToast('Owner key restored. Reconnecting to the shared store...');
    if (uiState.syncRefresh) await uiState.syncRefresh();
    uiState.rerender();
  });
}


// ---- Recipe collections: each imported library is a choice. Peace Meal's own recipes and yours are always on. ----
// A plain note before the USDA recipes are switched on (owner request, September 30, 2026: the earlier joke text
// was removed).
const SETTINGS_USDA_NOTICE = 'These recipes come from USDA MyPlate Kitchen, a free US government collection. The app checks each one against your plan the same way it checks every other recipe, and the nutrition numbers per serving are the ones USDA publishes.';
function settingsCollectionsHTML(profile) {
  const on = Object.assign({ nhs: true, parentclub: true, nhlbi: true, va: true, wikibooks: true, usda: false, review_dual: true }, profile.recipe_collections || {});
  const n = appCollectionCounts();
  return `<div class="card">
    <p class="small">Tick a collection to include its recipes in search, the week plan, and Pantry. Untick it to leave all of them out. Recipes written for Peace Meal and your own are always included.</p>
    ${uiSwitch('coll-wikibooks', `Wikibooks Cookbook (${n.wikibooks.toLocaleString()} recipes)`, 'Community recipes from around the world under a Creative Commons licence. They list ingredients as plain text, so the app has no calorie or sodium numbers for them; they only go into a week when the Week screen switch "Also use recipes that have no nutrition numbers" is on.', on.wikibooks)}
    ${uiSwitch('coll-nhs', `NHS recipes, United Kingdom (${n.nhs.toLocaleString()} recipes)`, 'Dietitian-written family recipes with calories, fat, sugar, and salt per serving. British dishes and measures.', on.nhs)}
    ${uiSwitch('coll-nhlbi', `NHLBI heart-healthy recipes, US National Institutes of Health (${n.nhlbi.toLocaleString()} recipes)`, 'Recipes from the National Heart, Lung, and Blood Institute with calories, fat, sodium, potassium, fiber, and protein per serving. Public domain. American measures.', on.nhlbi)}
    ${uiSwitch('coll-va', `VA Healthy Teaching Kitchen, US Department of Veterans Affairs (${n.va.toLocaleString()} recipes)`, 'Everyday American recipes written by VA dietitians, with calories, fat, sodium, carbohydrate, fiber, and protein per serving. Public domain. American measures.', on.va)}
    ${uiSwitch('coll-parentclub', `Parent Club, Scottish Government (${n.parentclub.toLocaleString()} recipes)`, 'Family recipes with full per-serving nutrition, including sodium in milligrams, and ingredient weights in grams. British dishes and measures.', on.parentclub)}
    ${uiSwitch('coll-usda', `USDA MyPlate Kitchen, United States (${n.usda.toLocaleString()} recipes)`, n.usda ? 'American home cooking with per-serving nutrition. Public domain.' : 'Not loaded in this build.', on.usda)}
    ${n.review_dual ? uiSwitch('coll-review_dual', `Peace Meal recipes for low FODMAP and low histamine together (${n.review_dual.toLocaleString()} recipes)`, 'Breakfasts and dinners written in September 2026 for someone on both diets at once. Every ingredient is linked to a USDA food and is on both approved lists, and each recipe passes both strict checks. Reviewed and switched on September 30, 2026.', on.review_dual) : ''}
  </div>`;
}
function settingsBindCollections(root, profile) {
  const setColl = (key, value) => {
    profile.recipe_collections = Object.assign({ nhs: true, parentclub: true, nhlbi: true, va: true, wikibooks: true, usda: false, review_dual: true }, profile.recipe_collections || {}, { [key]: value });
    uiPersist();
    if (typeof uiState.refreshRecipes === 'function') uiState.refreshRecipes();
    uiToast(value ? 'Collection included.' : 'Collection left out.');
    if (typeof uiState.rerender === 'function') uiState.rerender();
  };
  for (const key of ['wikibooks', 'nhs', 'parentclub', 'nhlbi', 'va', 'review_dual']) {
    const el = root.querySelector('#coll-' + key);
    if (el) el.addEventListener('change', () => setColl(key, el.checked));
  }
  const usda = root.querySelector('#coll-usda');
  if (usda) usda.addEventListener('change', () => {
    if (!usda.checked) { setColl('usda', false); return; }
    usda.checked = false;
    const m = uiModal(`<p class="notice-text" style="font-size:1.05em;line-height:1.5">${uiEsc(SETTINGS_USDA_NOTICE)}</p>
      <div class="row gap" style="margin-top:1rem"><button class="btn primary" type="button" id="coll-usda-yes">Include them</button><button class="btn" type="button" id="coll-usda-no">Leave them out</button></div>`, { title: 'Before you include the USDA recipes' });
    const yes = document.getElementById('coll-usda-yes'), no = document.getElementById('coll-usda-no');
    if (yes) yes.addEventListener('click', () => { if (uiState.modalClose) uiState.modalClose(); setColl('usda', true); });
    if (no) no.addEventListener('click', () => { if (uiState.modalClose) uiState.modalClose(); });
  });
}

// One-tap backup: the phone's share sheet with the JSON file attached (Mail, Messages, Save to Files, AirDrop).
// Where file sharing is not available (desktop browsers, older phones) it falls back to a plain download.
export async function settingsShareBackup() {
  const json = exportJSON(uiState.profile);
  const name = `peace-meal-${uiIsoDate()}.json`;
  try {
    if (typeof File === 'function' && navigator.share && navigator.canShare) {
      const file = new File([json], name, { type: 'application/json' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Peace Meal backup' });
        settingsMarkBackup();
        uiToast('Backup sent.');
        return true;
      }
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return false;   // they closed the share sheet
  }
  const ok = uiDownload(name, json);
  if (ok) settingsMarkBackup();
  uiToast(ok ? 'Backup file saved.' : 'Sharing is not available here. Use "Copy JSON" instead.');
  return ok;
}

// The monthly reminder counts from the last backup (store.js backupDue).
export function settingsMarkBackup() {
  uiState.profile.last_backup_at = new Date().toISOString();
  delete uiState.profile.backup_snooze_until;
  uiPersist();
  if (['today', 'home', 'settings'].includes(uiState.route.screen) && !uiState.modalClose) uiState.rerender();
}

// Reads a backup file and replaces what is on this device after a yes (Settings, and the first screen's "Bring my data").
export function settingsImportFile(file, done) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const incoming = importJSON(String(reader.result));
      const n = incoming.people.length;
      const here = uiState.profile.people.length;
      if (!window.confirm(here ? `Replace everything on this device with this file (${n} ${n === 1 ? 'person' : 'people'}, ${(incoming.log || []).length} log entries)?` : `Bring in this file (${n} ${n === 1 ? 'person' : 'people'}, ${(incoming.log || []).length} log entries)?`)) { if (done) done(false); return; }
      uiState.profile = incoming;
      if (!Array.isArray(uiState.profile.log)) uiState.profile.log = [];
      uiState.profile.people.forEach(uiEnsurePerson);
      if (!uiState.profile.activePerson && n) uiState.profile.activePerson = incoming.people[0].id;
      const saved = uiPersist();
      if (uiState.refreshRecipes) uiState.refreshRecipes();
      uiToast(saved ? 'Imported.' : 'Imported for now, but not saved on this device. See the message at the top.');
      if (done) done(true);
      uiNavigate(uiState.lite ? '#/today' : '#/home');
    } catch (err) {
      uiToast('Import failed: ' + err.message);
      if (done) done(false);
    }
  };
  reader.readAsText(file);
}

// The monthly backup reminder on lite Today and on Home. It opens the same share sheet as Send a backup.
export function settingsBackupReminderHTML(profile = uiState.profile) {
  const b = backupDue(profile);
  if (!b.due) return '';
  const when = b.never ? 'No backup has been sent from this app yet.' : `Your last backup was ${b.days} days ago.`;
  return `<div class="notice warn backup-reminder" role="status">${uiIcon('share', { cls: 'notice-icon' })}<div class="notice-head">Time to send a backup</div>
    <div class="notice-body">${when} A backup is one file with everything in this app. Mail it to yourself or save it to Files, so a lost or reset phone does not take your log with it.
      <div class="btn-row"><button class="btn primary lite-big" type="button" data-backup-now>${uiIcon('share')}Send a backup</button><button class="btn lite-big" type="button" data-backup-later>Remind me in a week</button></div></div></div>`;
}
export function settingsBindBackupReminder(root) {
  root.querySelectorAll('[data-backup-now]').forEach(b => b.addEventListener('click', () => settingsShareBackup()));
  root.querySelectorAll('[data-backup-later]').forEach(b => b.addEventListener('click', () => {
    uiState.profile.backup_snooze_until = new Date(Date.now() + 7 * 86400000).toISOString();
    uiPersist(); uiToast('Okay. The reminder comes back in a week.'); uiState.rerender();
  }));
}
