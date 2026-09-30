// Phase 8, item 35: for each README safety rule, break it on purpose in a throwaway copy of the app and run the app's own
// test suite. If every test still passes, no test protects that rule. The app itself is never changed: each mutation is
// applied to a copy under audit/results/tmp/rules/. Results: audit/results/rule-mutations.json.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root = path.resolve(new URL('../../', import.meta.url).pathname);
const WORK = path.join(root, 'audit/results/tmp/rules');
const MUTATIONS = [
  { rule: 1, text: 'Allergens are absolute.', file: 'src/engine/plan.js', find: "    if (!avoid[tag]) avoid[tag] = { hard: true, rules: [] };\n    avoid[tag].hard = true;", replace: "    if (!avoid[tag]) avoid[tag] = { hard: false, rules: [] };\n    avoid[tag].hard = false;", what: 'a person\'s allergens become soft avoids (a caution, not a stop)' },
  { rule: 1, text: 'Allergens are absolute.', file: 'src/engine/checker.js', find: "  if (hits.some(h => h.hard) || (termHits || []).some(t => t.hard)) return 'fail';", replace: "  if (false) return 'fail';", what: 'the checker never returns FAIL' },
  { rule: 2, text: 'Hard conflicts stop the number, not the plan.', file: 'src/engine/plan.js', find: "        const blocked = [...blockedParams.entries()].find(([p]) => p !== 'all' && paramMatches(nut, p));", replace: "        const blocked = null;", what: 'a hard conflict no longer stops the number' },
  { rule: 3, text: 'Tier 2 numbers are never generated.', file: 'src/engine/plan.js', find: "      if ((rule.tier || 1) === 2) {", replace: "      if (false) {", what: 'Tier 2 rules apply their published default without a clinician\'s number' },
  { rule: 4, text: 'Elimination phases expire. The app prompts reintroduction and requires acknowledgment to continue past the maximum.', file: 'src/engine/plan.js', find: "    const status = checkWeeks && sinceCheck >= checkWeeks ? 'check-in' : 'active';", replace: "    const status = 'active';", what: 'no check-in prompt ever (the closest behavior the code has; phases do not expire since September 10)' },
  { rule: 5, text: 'A positive eating-disorder screen turns off calorie targets, weight-loss plans, and new elimination protocols.', file: 'src/engine/plan.js', find: "  const screenPositive = !!(person.screen && person.screen.positive);", replace: "  const screenPositive = false;", what: 'a positive screen is ignored' },
  { rule: 6, text: 'Pregnancy disables weight loss, ketogenic and very low carbohydrate patterns, intermittent fasting, and every elimination protocol except allergen and celiac rules.', file: 'data/conditions.json', find: '"elimination-protocols-except-allergen-celiac"', replace: '"elimination-protocols-except-allergen-celiac-DISABLED-FOR-AUDIT"', what: 'pregnancy no longer turns off low FODMAP and low histamine', firstOnly: false },
  { rule: 6, text: 'Pregnancy disables ... ketogenic and very low carbohydrate patterns ...', file: 'src/engine/plan.js', find: "  'low-carb-under-175g': ['low-carb-ketogenic'],", replace: "  'low-carb-under-175g': [],", what: 'pregnancy no longer turns off the low-carb pattern (the ketogenic feature still gates it)', also: { file: 'src/engine/plan.js', find: "  'ketogenic': ['low-carb-ketogenic'],", replace: "  'ketogenic': []," } },
  { rule: 7, text: 'Ingredient text the dictionary does not recognize is reported as not recognized. It is never counted as safe.', file: 'src/engine/checker.js', find: "  if (unrecognized && unrecognized.length && guarded) return 'caution';", replace: "", what: 'unrecognized text counts as safe' },
  { rule: 8, text: 'There is no language model in the app.', file: 'src/app.js', find: "async function appBoot() {", replace: "async function appBoot() {\n  try { fetch('https://api.anthropic.com/v1/messages', { method: 'POST', body: '{}' }).catch(() => {}); } catch { /* audit */ }", what: 'the app calls a language model API at start' }
];
const COPY = ['src', 'data', 'test', 'tools/lib', 'package.json', 'sw.js', 'index.html', 'breathe.html', 'manifest.webmanifest', 'site', 'icon-180.png', 'icon-512.png', 'icon.svg', 'tools/bundle.mjs', 'tools/validate.mjs', 'docs', 'README.md', '.github'];
const results = [];
fs.rmSync(WORK, { recursive: true, force: true });
MUTATIONS.forEach((m, i) => {
  const dir = path.join(WORK, 'm' + i);
  for (const c of COPY) if (fs.existsSync(path.join(root, c))) fs.cpSync(path.join(root, c), path.join(dir, c), { recursive: true });
  const apply = ({ file, find, replace }) => { const f = path.join(dir, file); const s = fs.readFileSync(f, 'utf8'); if (!s.includes(find)) throw new Error(`mutation ${i}: text not found in ${file}`); fs.writeFileSync(f, m.firstOnly === false ? s.split(find).join(replace) : s.replace(find, replace)); };
  apply(m); if (m.also) apply(m.also);
  let failed = 0, passed = 0, failingTests = [];
  try { execFileSync(process.execPath, ['--test', ...fs.readdirSync(path.join(dir, 'test')).filter(f => f.endsWith('.test.mjs')).map(f => 'test/' + f)], { cwd: dir, stdio: 'pipe', maxBuffer: 1 << 28 }); }
  catch (e) { const out = e.stdout.toString(); failingTests = [...new Set([...out.matchAll(/^\s*not ok \d+ - (.*)$/gm)].map(x => x[1].trim()))]; }
  const r = { rule: m.rule, readme: m.text, mutation: m.what, where: m.file, testsFailed: failingTests.length, protectedBy: failingTests.slice(0, 5) };
  results.push(r); console.log(`rule ${m.rule}: ${m.what} -> ${failingTests.length ? failingTests.length + ' test(s) fail, e.g. ' + failingTests[0] : 'NO TEST FAILS'}`);
});
fs.writeFileSync(path.join(root, 'audit/results/rule-mutations.json'), JSON.stringify(results, null, 1) + '\n');
fs.rmSync(WORK, { recursive: true, force: true });
