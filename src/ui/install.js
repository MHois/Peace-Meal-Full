// Add to Home Screen (iPhone, iPad, and Android). A page open in a Safari tab and the same page opened from a Home Screen icon
// keep separate storage on iOS, so what is logged in the tab does not show up in the icon's app, and the other way
// round. The first time the hosted app runs in a Safari tab on iOS, a full-screen guide shows how to add it to the Home
// Screen and how to move anything already logged in the tab: send a backup from the tab, then use "Bring my data" on
// the Home Screen app's first screen (the same backup file format as Settings). Shown once; Settings can open it again.
// Android (owner request, September 30, 2026): the guide also shows in an Android browser tab, with Chrome and Samsung
// Internet steps. There the Home screen app shares the browser's storage, so nothing needs moving.
import { uiState, uiEsc, uiIcon } from './common.js';
import { settingsShareBackup } from './settings.js';

function installGuideKey() { return (uiState.lite ? 'peace-meal-lite' : 'peace-meal-full') + ':home-screen-guide'; }

export function installIsIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
export function installIsAndroid() {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '');
}
export function installIsStandalone() {
  if (typeof window === 'undefined') return false;
  return window.navigator.standalone === true || !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
}
// In a Safari tab on iOS, on the hosted copy (a file opened from Files cannot be added to the Home Screen).
export function installInSafariTab() {
  return installIsIOS() && !installIsStandalone() && typeof location !== 'undefined' && /^https?:$/.test(location.protocol);
}
// In a browser tab on iOS or Android, on the hosted copy.
export function installInBrowserTab() {
  return (installIsIOS() || installIsAndroid()) && !installIsStandalone() && typeof location !== 'undefined' && /^https?:$/.test(location.protocol);
}
export function installShouldGuide() {
  if (!installInBrowserTab()) return false;
  try { return !localStorage.getItem(installGuideKey()); } catch { return true; }
}

export function installShowGuide() {
  if (typeof document === 'undefined' || document.getElementById('install-guide')) return;
  const name = uiState.lite ? 'Peace Meal for one' : 'Peace Meal';
  const hasData = !!(uiState.profile && uiState.profile.people && uiState.profile.people.length);
  const android = installIsAndroid() && !installIsIOS();
  const iosSteps = `<ol class="install-steps">
      <li><strong>Tap the three dots (•••) at the bottom of Safari.</strong> Then tap <strong>Share</strong>: the square with an arrow pointing up. On an iPad, Share is at the top of the screen. On some iPhones Share is right on the bottom bar, with no dots to tap first.</li>
      <li><strong>Scroll down and tap "Add to Home Screen".</strong> If you do not see it, tap "More" or "Edit Actions" at the bottom of that list.</li>
      <li><strong>Tap "Add"</strong> in the top corner.</li>
      <li><strong>Open ${uiEsc(name)} from its new icon</strong> on your Home Screen, and use it from there from now on.</li>
    </ol>`;
  const androidSteps = `<ol class="install-steps">
      <li><strong>Tap the three dots (⋮) at the top right of Chrome.</strong></li>
      <li><strong>Tap "Add to Home screen".</strong> On some phones it says "Install app".</li>
      <li><strong>Tap "Install" or "Add"</strong>, and tap "Add" again if your phone asks where to put it.</li>
      <li><strong>Open ${uiEsc(name)} from its new icon</strong> on your Home screen or in your list of apps.</li>
    </ol>
    <p class="small">Using Samsung Internet instead of Chrome? Tap the three lines (≡) at the bottom right, then "Add page to", then "Home screen".</p>`;
  const el = document.createElement('div');
  el.id = 'install-guide';
  el.className = 'install-guide';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'install-guide-h');
  el.innerHTML = `<div class="install-guide-inner">
    <h1 id="install-guide-h">Put ${uiEsc(name)} on your Home Screen</h1>
    <p class="install-lede">Right now it is open in ${android ? 'your browser' : 'a Safari tab'}. On your Home Screen it opens like an app, works without internet, and keeps your data in one place.</p>
    <h2>${android ? 'On an Android phone' : 'On an iPhone or iPad'}</h2>
    ${android ? androidSteps : iosSteps}
    <details class="install-other"><summary>${android ? 'On an iPhone or iPad instead' : 'On an Android phone instead'}</summary>${android ? iosSteps : androidSteps}</details>
    ${android ? '<p class="small">On Android the Home screen app keeps the same data as Chrome, so nothing needs moving.</p>' : `<div class="install-move ${hasData ? '' : 'muted-box'}">
      <h2>${hasData ? 'You already have things logged in this Safari tab' : 'If you ever log things in a Safari tab'}</h2>
      <p>Your iPhone keeps this Safari tab's data apart from the Home Screen app. Moving it takes two steps:</p>
      <ol>
        <li>Tap <strong>Save a backup</strong> below and save the file to Files (or mail it to yourself).</li>
        <li>In the Home Screen app, tap <strong>Bring my data</strong> on the first screen and choose that file.</li>
      </ol>
      ${hasData ? `<div class="btn-row"><button class="btn lite-big" type="button" data-install-backup>${uiIcon('share')}Save a backup</button></div>` : ''}
    </div>`}
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
