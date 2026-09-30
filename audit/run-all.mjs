// Reruns every audit check, one after another, from the repository root, and prints a summary at the end.
//   npm --prefix audit ci && npm --prefix audit run all
// Checks that need the internet (the photo reader's files, the live site) are skipped when it cannot be reached.
// The Stryker mutation run takes over an hour; it runs only with PM_MUTATION=1 (npm --prefix audit run mutation).
// The old-address simulation needs the old repository's history (PM_OLD_REPO); it skips itself without it.
// A step that fails does not stop the others. The exit code is 1 when any step failed. PM_PHASES=3,8 runs only those phases.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(new URL('../', import.meta.url).pathname);
const node = process.execPath;
const env = { ...process.env, NODE_USE_ENV_PROXY: process.env.NODE_USE_ENV_PROXY || '1' };
const internet = (() => {
  const r = spawnSync(node, ['-e', "fetch('https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/package.json').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"], { env, timeout: 20000 });
  return r.status === 0;
})();
const T = f => ['--test', f];
const STEPS = [
  ['1', "the app's own checks (validate, 183 tests, bundle)", 'npm', ['run', 'check']],
  ['1', 'lite bundle', node, ['tools/bundle.mjs', '--lite']],
  ['1', 'coverage (raw report into the evidence folder)', 'sh', ['-c', `${node} --test --experimental-test-coverage test/*.test.mjs > docs/audit-2026-09-30/evidence/phase1-coverage-raw.txt`]],
  ['1', 'coverage table', node, ['audit/scripts/coverage-table.mjs']],
  ['1', 'exported engine functions without a direct test', node, ['audit/scripts/untested-exports.mjs']],
  ['2', 'ESLint with no-unsanitized and security', node, ['audit/scripts/eslint-run.mjs']],
  ['2', 'object-injection writes', node, ['audit/scripts/object-injection-triage.mjs']],
  ['2', 'unescaped HTML interpolations', node, ['audit/scripts/html-interpolations.mjs']],
  ['2', 'regular expressions on hostile input', node, ['audit/scripts/redos-check.mjs']],
  ['2', 'swallowed errors', node, ['audit/scripts/swallowed-errors.mjs']],
  ['2', 'secrets and personal details (all history)', node, ['audit/scripts/secrets-scan.mjs']],
  ['2', 'dead code and complexity', node, ['audit/scripts/dead-code.mjs']],
  ['2', 'duplicated code (jscpd)', 'audit/node_modules/.bin/jscpd', ['src', '--reporters', 'json', '--output', 'audit/results/jscpd', '--silent']],
  ['2', 'script injection in the browser', node, ['audit/e2e/xss.mjs']],
  ['4', 'data safety: backup, migration, Clear data, full storage, unreadable data', node, ['audit/e2e/data-safety.mjs']],
  ['3', 'allergen label corpus (745 lines)', node, T('audit/tests/allergen-corpus.test.mjs')],
  ['3', 'fuzz: allergen terms, unknown words, never throws', node, T('audit/tests/checker-fuzz.test.mjs')],
  ['3', 'every pair of conditions and patterns', node, T('audit/tests/condition-pairs.test.mjs')],
  ['3', 'every recipe against ten profiles, and swaps', node, T('audit/tests/recipes-profiles.test.mjs')],
  ['3', "the September summary's claims", node, T('audit/tests/summary-claims.test.mjs')],
  ['3', 'the two Check boxes agree', node, T('audit/tests/check-screen-consistency.test.mjs')],
  ['3', 'single-food labels a condition avoids', node, T('audit/tests/condition-labels.test.mjs')],
  ['3', 'mutation testing (Stryker, over an hour)', process.env.PM_MUTATION === '1' ? 'audit/node_modules/.bin/stryker' : null, ['run', 'audit/stryker.conf.json'], 'set PM_MUTATION=1 (npm --prefix audit run mutation)'],
  ['3', 'mutation summary', fs.existsSync(path.join(ROOT, 'audit/results/stryker/mutation.json')) ? node : null, ['audit/scripts/stryker-summary.mjs'], 'no Stryker report yet'],
  ['4', 'journeys (lite and full)', node, ['audit/e2e/journeys.mjs']],
  ['4', 'offline, updates, iPhone modes', node, ['audit/e2e/offline-iphone.mjs']],
  ['4', 'screenshots', node, ['audit/e2e/screenshots.mjs']],
  ['5', 'axe, targets, reflow, keyboard, motion, announcements', node, ['audit/e2e/a11y.mjs']],
  ['5', 'reflow at 320 px, doubled text, contrast', node, ['audit/e2e/a11y-reflow.mjs']],
  ['6', 'cold start, memory, profile, sizes', node, ['audit/e2e/perf.mjs']],
  ['6', 'Lighthouse', node, ['audit/e2e/lighthouse.mjs']],
  ['7', 'network requests, photo reader, tampering, offline photo', internet ? node : null, ['audit/e2e/network.mjs'], 'no internet'],
  ['7', "photo reader's integrity hashes against the CDNs", internet ? node : null, ['audit/scripts/sri-check.mjs'], 'no internet'],
  ['7', 'the proposed security policy on a test copy', node, ['audit/e2e/csp.mjs']],
  ['7', 'another page on the same origin', node, ['audit/e2e/shared-origin.mjs']],
  ['7', 'the old address', node, ['audit/e2e/old-address.mjs']],
  ['7', 'the live site serves main', internet ? node : null, ['audit/scripts/live-stamp.mjs'], 'no internet'],
  ['8', 'data quality and diet lists', node, ['audit/scripts/data-quality.mjs']],
  ['8', 'a test for each README safety rule', node, ['audit/scripts/rule-mutations.mjs']],
  ['8', 'plain language', node, ['audit/scripts/readability.mjs']]
];
// PM_PHASES=3,8 (for example) runs only those phases' steps.
const ONLY = process.env.PM_PHASES ? new Set(process.env.PM_PHASES.split(',').map(x => x.trim())) : null;
const rows = [];
for (const [phase, name, cmd, args, why] of STEPS) {
  if (ONLY && !ONLY.has(phase)) continue;
  if (!cmd) { rows.push({ phase, name, result: 'skipped', note: why }); console.log(`\n=== [phase ${phase}] ${name}: SKIPPED (${why})`); continue; }
  console.log(`\n=== [phase ${phase}] ${name}`);
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { cwd: ROOT, env, stdio: 'inherit', maxBuffer: 1 << 28 });
  const s = Math.round((Date.now() - t0) / 1000);
  rows.push({ phase, name, result: r.status === 0 ? 'pass' : 'FAIL', seconds: s, note: r.status === 0 ? '' : `exit ${r.status ?? r.signal}` });
}
console.log('\n\nSummary (a FAIL means the check found problems or could not run; see its output above and audit/results/)');
for (const r of rows) console.log(`  [${r.phase}] ${r.result.padEnd(7)} ${String(r.seconds ?? '').padStart(5)} s  ${r.name}${r.note ? '  (' + r.note + ')' : ''}`);
fs.writeFileSync(path.join(ROOT, 'audit/results/run-all.json'), JSON.stringify({ ranAt: new Date().toISOString(), internet, steps: rows }, null, 1) + '\n');
process.exitCode = rows.some(r => r.result === 'FAIL') ? 1 : 0;
