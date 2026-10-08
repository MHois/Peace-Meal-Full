// N5 (found during the fix pass of October 1, 2026; not in the audit report): src/engine/sync.js imported the crypto
// module as a namespace (import * as C). tools/bundle.mjs strips import lines and never builds a namespace object, so in
// every built page each sharing call threw "ReferenceError: C is not defined" and the person saw "The shared store could
// not be reached." Hosted sharing (claude.ai only; dormant on GitHub Pages) has never started in a built page. Seen in
// Chromium with a stand-in shared store on October 1, 2026. sync.js now uses named imports, and the bundler refuses a
// namespace import instead of shipping a page that breaks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const jsFiles = dir => fs.readdirSync(new URL(dir, ROOT), { withFileTypes: true }).flatMap(e => e.isDirectory() ? jsFiles(dir + e.name + '/') : e.name.endsWith('.js') ? [dir + e.name] : []);

test('N5: no source file uses a namespace import, which the single-file build cannot resolve', () => {
  const bad = jsFiles('src/').filter(f => /^\s*import\s+\*\s+as\s/m.test(fs.readFileSync(new URL(f, ROOT), 'utf8')));
  assert.deepEqual(bad, []);
});

test('N5: the bundler refuses a namespace import', () => {
  const bundle = fs.readFileSync(new URL('tools/bundle.mjs', ROOT), 'utf8');
  assert.match(bundle, /import\\s\+\\\*\\s\+as/, 'tools/bundle.mjs checks for "import * as"');
  assert.match(bundle, /throw new Error\([^)]*namespace import/i, 'and stops the build');
});

test('N5: every name sync.js takes from crypto.js is one crypto.js exports', () => {
  const sync = fs.readFileSync(new URL('src/engine/sync.js', ROOT), 'utf8');
  const crypto = fs.readFileSync(new URL('src/engine/crypto.js', ROOT), 'utf8');
  const m = sync.match(/import\s*\{([^}]*)\}\s*from\s*'\.\/crypto\.js'/);
  assert.ok(m, 'sync.js imports crypto.js by name');
  const names = m[1].split(',').map(s => s.trim()).filter(Boolean);
  const exported = new Set([...crypto.matchAll(/^export\s+(?:async\s+)?(?:function|const|let)\s+([A-Za-z0-9_$]+)/gm)].map(x => x[1]));
  assert.deepEqual(names.filter(n => !exported.has(n)), []);
  assert.doesNotMatch(sync, /\bC\./, 'no call through the old namespace is left');
});
