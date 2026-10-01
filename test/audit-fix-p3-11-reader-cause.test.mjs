// P3-11 (audit of September 30, 2026): when a photo reader file failed to load, the error the app raised dropped the
// browser's own error, so "a reader file did not load or did not match its hash" was all anyone could see, even in the
// developer console. The app's error now carries the browser's error as its cause, and the photo button logs both to
// the console. What the person reads on screen is unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = { readyState: 'loading', addEventListener() {}, removeEventListener() {}, getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; }, activeElement: null, documentElement: { setAttribute() {}, removeAttribute() {}, classList: { toggle() {}, add() {}, remove() {}, contains: () => false } } };
globalThis.window = { addEventListener() {}, location: { hash: '' } };
globalThis.location = { hash: '', href: 'https://example.org/' };
const check = await import('../src/ui/check.js');

test('P3-11: a reader file that fails to load keeps the browser\'s error as the cause', async () => {
  assert.equal(typeof check.checkPinnedFetch, 'function');
  const browserError = new TypeError('Failed to fetch');
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw browserError; };
  try {
    await assert.rejects(() => check.checkPinnedFetch({ url: 'https://example.org/reader.js', integrity: 'sha384-x' }), e => {
      assert.match(e.message, /did not load or did not match its hash/, 'the same words as before');
      assert.equal(e.cause, browserError, 'and the browser\'s own error with it');
      return true;
    });
  } finally { globalThis.fetch = realFetch; }
});

test('P3-11: the photo button logs the error and its cause', () => {
  const src = fs.readFileSync(new URL('../src/ui/check.js', import.meta.url), 'utf8');
  assert.match(src, /catch \(err\) \{\s*console\.warn\([^)]*err[^)]*err\.cause/, 'console.warn with the error and its cause');
});
