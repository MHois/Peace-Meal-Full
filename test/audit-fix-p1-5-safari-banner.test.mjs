// P1-5 (audit of September 30, 2026): in a Safari tab on an iPhone, nothing on the everyday screens said the data was
// not saved safely; the Add to Home Screen guide showed once, and Settings had a line. WebKit: Safari deletes "all of a
// website's script-writable storage after seven days of Safari use without user interaction on the site", while "Web
// applications added to the home screen are not part of Safari and thus have their own counter of days of use" (WebKit
// blog, Full Third-Party Cookie Blocking and More, March 24, 2020). Now every screen in a Safari tab shows a banner that
// opens the guide. It can be hidden for the day, never for good, and it never shows in the Home Screen app.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
const setEnv = ({ ua, standalone = false, protocol = 'https:' }) => {
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: ua, platform: 'iPhone', maxTouchPoints: 5, standalone }, configurable: true, writable: true });
  globalThis.window = { navigator: globalThis.navigator, matchMedia: () => ({ matches: standalone }) };
  globalThis.location = new URL(protocol === 'file:' ? 'file:///peace-meal-lite.html' : 'https://example.org/Peace-Meal-Full/lite/');
};
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';

// install.js imports Settings, which imports the app; with a page that is still loading, the app only waits for it.
// Display settings touch the page's root element on load.
globalThis.document = { readyState: 'loading', addEventListener() {}, getElementById() { return null; }, documentElement: { setAttribute() {}, removeAttribute() {}, classList: { toggle() {} } } };
const { installBannerHTML, installHideBannerToday } = await import('../src/ui/install.js');
const day1 = new Date(2026, 8, 30), day2 = new Date(2026, 9, 1);

test('P1-5: in a Safari tab on an iPhone, every screen says the data is not saved safely', () => {
  setEnv({ ua: IPHONE });
  const html = installBannerHTML(day1);
  assert.match(html, /Not saved safely/);
  assert.match(html, /Add to Home Screen/);
  assert.match(html, /7 days/, 'says what Safari does');
  assert.match(html, /data-safari-how/, 'opens the move-your-data steps');
});

test('P1-5: hidden for the day, back the next day', () => {
  setEnv({ ua: IPHONE });
  store.clear();
  installHideBannerToday(day1);
  assert.equal(installBannerHTML(day1), '');
  assert.match(installBannerHTML(day2), /Not saved safely/);
});

test('P1-5: never in the Home Screen app, an Android browser, or the single-file copy', () => {
  store.clear();
  setEnv({ ua: IPHONE, standalone: true });
  assert.equal(installBannerHTML(day1), '', 'Home Screen app');
  setEnv({ ua: ANDROID });
  assert.equal(installBannerHTML(day1), '', 'Android keeps one set of data for the tab and the Home screen app');
  setEnv({ ua: IPHONE, protocol: 'file:' });
  assert.equal(installBannerHTML(day1), '', 'a file opened from Files cannot be added to the Home Screen');
});
