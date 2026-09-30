// Add to Home Screen (iPhone and iPad). A page open in a Safari tab and the same page opened from a Home Screen icon
// keep separate storage on iOS, so what is logged in the tab does not show up in the icon's app, and the other way
// round. The first time the hosted app runs in a Safari tab on iOS, a full-screen guide shows how to add it to the Home
// Screen and how to move anything already logged in the tab: send a backup from the tab, then use "Bring my data" on
// the Home Screen app's first screen (the same backup file format as Settings). Shown once; Settings can open it again.
import { uiState, uiEsc, uiIcon } from './common.js';
import { settingsShareBackup } from './settings.js';

function installGuideKey() { return (uiState.lite ? 'peace-meal-lite' : 'peace-meal-full') + ':home-screen-guide'; }

export function installIsIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
export function installIsStandalone() {
  if (typeof window === 'undefined') return false;
  return window.navigator.standalone === true || !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
}
// In a Safari tab on iOS, on the hosted copy (a file opened from Files cannot be added to the Home Screen).
export function installInSafariTab() {
  return installIsIOS() && !installIsStandalone() && typeof location !== 'undefined' && /^https?:$/.test(location.protocol);
}
export function installShouldGuide() {
  if (!installInSafariTab()) return false;
  try { return !localStorage.getItem(installGuideKey()); } catch { return true; }
}

export function installShowGuide() {
  if (typeof document === 'undefined' || document.getElementById('install-guide')) return;
  const name = uiState.lite ? 'Peace Meal for one' : 'Peace Meal';
  const hasData = !!(uiState.profile && uiState.profile.people && uiState.profile.people.length);
  const el = document.createElement('div');
  el.id = 'install-guide';
  el.className = 'install-guide';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'install-guide-h');
  el.innerHTML = `<div class="install-guide-inner">
    <h1 id="install-guide-h">Put ${uiEsc(name)} on your Home Screen</h1>
    <p class="install-lede">Right now it is open in a Safari tab. On your Home Screen it opens like an app, works without internet, and keeps your data in one place.</p>
    <ol class="install-steps">
      <li><strong>Tap the Share button</strong> at the bottom of Safari: the square with an arrow pointing up. (On an iPad it is at the top.)</li>
      <li><strong>Scroll down and tap "Add to Home Screen".</strong></li>
      <li><strong>Tap "Add"</strong> in the top corner.</li>
      <li><strong>Open ${uiEsc(name)} from its new icon</strong> on your Home Screen, and use it from there from now on.</li>
    </ol>
    <div class="install-move ${hasData ? '' : 'muted-box'}">
      <h2>${hasData ? 'You already have things logged in this Safari tab' : 'If you ever log things in a Safari tab'}</h2>
      <p>Your iPhone keeps this Safari tab's data apart from the Home Screen app. Moving it takes two steps:</p>
      <ol>
        <li>Tap <strong>Save a backup</strong> below and save the file to Files (or mail it to yourself).</li>
        <li>In the Home Screen app, tap <strong>Bring my data</strong> on the first screen and choose that file.</li>
      </ol>
      ${hasData ? `<div class="btn-row"><button class="btn lite-big" type="button" data-install-backup>${uiIcon('share')}Save a backup</button></div>` : ''}
    </div>
    <div class="btn-row"><button class="btn primary lite-big" type="button" data-install-done>Got it</button></div>
    <p class="small muted">This guide shows once. Settings has a link to open it again.</p>
  </div>`;
  const close = () => { try { localStorage.setItem(installGuideKey(), new Date().toISOString()); } catch { /* ignore */ } el.remove(); };
  el.querySelector('[data-install-done]').addEventListener('click', close);
  const b = el.querySelector('[data-install-backup]');
  if (b) b.addEventListener('click', () => settingsShareBackup());
  el.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  document.body.appendChild(el);
  const h = el.querySelector('h1'); if (h) { h.setAttribute('tabindex', '-1'); h.focus(); }
}
