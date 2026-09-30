// Phase 1, item 3: line and branch coverage for src/engine/* and src/store.js, read from the node:test coverage report
// saved by: node --test --experimental-test-coverage test/*.test.mjs > docs/audit-2026-09-30/evidence/phase1-coverage-raw.txt
import fs from 'node:fs';
const root = new URL('../../', import.meta.url);
const raw = fs.readFileSync(new URL('docs/audit-2026-09-30/evidence/phase1-coverage-raw.txt', root), 'utf8');
const lines = raw.slice(raw.indexOf('# start of coverage report')).split('\n');
const rows = []; let dir = '';
for (const l of lines) {
  const m = l.match(/^#(\s+)([^|]+?)\s*\|\s*([\d.]*)\s*\|\s*([\d.]*)\s*\|\s*([\d.]*)\s*\|\s*(.*)$/);
  if (!m) continue;
  const depth = m[1].length, name = m[2].trim();
  if (!m[3]) { if (depth === 1) dir = name; else if (depth === 2) dir = dir.split('/')[0] + '/' + name; continue; }
  rows.push({ file: (depth === 2 ? dir.split('/')[0] : dir) + '/' + name, line: Number(m[3]), branch: Number(m[4]), funcs: Number(m[5]), uncovered: m[6].trim() });
}
const pick = rows.filter(r => r.file.startsWith('src/engine/') || r.file === 'src/store.js');
fs.writeFileSync(new URL('audit/results/coverage.json', root), JSON.stringify(pick, null, 1) + '\n');
console.log('| File | Line % | Branch % | Functions % | Uncovered lines |\n|---|---|---|---|---|');
for (const r of pick) console.log(`| \`${r.file}\` | ${r.line.toFixed(2)} | ${r.branch.toFixed(2)} | ${r.funcs.toFixed(2)} | ${r.uncovered || ''} |`);
