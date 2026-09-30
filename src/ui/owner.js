// Owner dashboard: who is in the shared store, which devices have opened the app, and shares this month. Owner only.
import { listDirectory, listDevices } from '../engine/sync.js';
import { uiState, uiEsc, uiFmtNum, uiPageHeader, uiSection, uiStatTile, uiChip, uiIcon, uiEmptyState } from './common.js';
import { sharingState, sharingSafe, sharingDeviceName, sharingShortFingerprint } from './sharing.js';
import { peopleOpenSharedPerson } from './people.js';

async function ownerCountSharesThisMonth(db) {
  try {
    const q = await db.collection('shares').get();
    const rows = (q.docs || q).map(d => (typeof d.data === 'function' ? d.data() : d)).filter(Boolean);
    const now = new Date();
    return rows.filter(r => { const d = new Date(r.created || 0); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); }).length;
  } catch { return null; }
}

export function renderOwnerScreen(root) {
  const s = sharingState();
  root.innerHTML = `
    ${uiPageHeader('Owner dashboard', `This device holds the owner key (${sharingShortFingerprint(s.identity && s.identity.fingerprint)}). Profiles in the store are encrypted for their own device and for you; nobody else can open them.`, `<a class="btn small" href="#/settings">${uiIcon('gear')}Sharing settings</a>`)}
    <div class="tiles" id="owner-tiles" aria-label="Shared store summary">
      ${uiStatTile({ value: '…', label: 'People in the store' })}
      ${uiStatTile({ value: '…', label: 'Devices' })}
      ${uiStatTile({ value: '…', label: 'Shares this month' })}
    </div>
    ${uiSection('People in the store', '<div id="owner-people" class="card"><p class="small muted">Loading...</p></div>', { id: 'owner-people-h' })}
    ${uiSection('Devices', '<div id="owner-devices" class="card"><p class="small muted">Loading...</p></div>', { id: 'owner-devices-h' })}
  `;
  ownerLoad(root);
}

async function ownerLoad(root) {
  const s = sharingState();
  const [dir, devices, shares] = await Promise.all([
    sharingSafe(() => listDirectory(s.db), [], 'The directory could not be read.'),
    sharingSafe(() => listDevices(s.db), [], 'The device list could not be read.'),
    ownerCountSharesThisMonth(s.db)
  ]);
  if (!root.isConnected) return;
  root.querySelector('#owner-tiles').innerHTML = `${uiStatTile({ value: uiFmtNum(dir.length), label: 'People in the store' })}${uiStatTile({ value: uiFmtNum(devices.length), label: 'Devices' })}${uiStatTile({ value: shares == null ? '–' : uiFmtNum(shares), label: 'Shares this month', note: shares == null ? 'not readable' : '' })}`;
  const people = root.querySelector('#owner-people');
  const list = dir.filter(r => r && r.personId).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  people.innerHTML = list.length ? `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Initials</th><th>Device</th><th>Updated</th><th></th></tr></thead><tbody>${list.map(r => `<tr><td>${uiIcon('lock')} ${uiEsc(r.name || '')}</td><td>${uiEsc(r.initials || '')}</td><td>${uiEsc(sharingDeviceName(devices, r.deviceFingerprint))}</td><td>${uiEsc(String(r.updated || '').slice(0, 10))}</td><td><button class="btn small" type="button" data-open-person="${uiEsc(r.personId)}">Open</button></td></tr>`).join('')}</tbody></table></div>` : uiEmptyState('Nobody has put a profile in the shared store yet.', '', 'list');
  people.querySelectorAll('[data-open-person]').forEach(b => b.addEventListener('click', () => peopleOpenSharedPerson(b.dataset.openPerson)));
  const dev = root.querySelector('#owner-devices');
  const devs = devices.filter(d => d && d.fingerprint).sort((a, b) => String(a.created || '').localeCompare(String(b.created || '')));
  dev.innerHTML = devs.length ? `<div class="list">${devs.map(d => `<div class="list-row"><div class="list-main"><div class="list-title">${uiEsc(d.name || 'Device')} ${d.fingerprint === (s.identity && s.identity.fingerprint) ? uiChip('this device', 'plum') : ''}${s.owner && d.fingerprint === s.owner.fingerprint ? ' ' + uiChip('owner', 'olive') : ''}</div><div class="list-sub">Key ${uiEsc(sharingShortFingerprint(d.fingerprint))} · first seen ${uiEsc(String(d.created || '').slice(0, 10) || 'unknown')}</div></div></div>`).join('')}</div>` : '<p class="small muted">No devices registered yet.</p>';
}
