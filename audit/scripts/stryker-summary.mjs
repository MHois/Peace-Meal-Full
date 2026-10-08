// Phase 3, item 15: a small, readable summary of Stryker's full report (audit/results/stryker/mutation.json, 9 MB,
// kept out of git). For every surviving mutant: file, line, the enclosing function, the mutator, the original code and
// what Stryker changed it to. Results: audit/results/stryker-summary.json.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../../', import.meta.url).pathname);
const rep = JSON.parse(fs.readFileSync(path.join(ROOT, 'audit/results/stryker/mutation.json'), 'utf8'));
const out = { files: {}, survivors: [] };
for (const [file, f] of Object.entries(rep.files)) {
  const lines = f.source.split('\n');
  // the enclosing function for a line: the nearest "function name(" or "name = (...) =>" above it at column 0-2
  const fnAt = n => { for (let i = n - 1; i >= 0; i--) { const m = lines[i].match(/^(?:export )?(?:async )?function\s+(\w+)|^(?:export )?const\s+(\w+)\s*=\s*(?:\([^)]*\)|\w+)\s*=>/); if (m) return m[1] || m[2]; } return '(top level)'; };
  const s = {}; for (const m of f.mutants) s[m.status] = (s[m.status] || 0) + 1;
  const detected = (s.Killed || 0) + (s.Timeout || 0);
  out.files[file] = { ...s, total: f.mutants.length, score: Math.round(1000 * detected / f.mutants.length) / 10 };
  for (const m of f.mutants.filter(x => x.status === 'Survived')) {
    const { start, end } = m.location;
    const orig = start.line === end.line ? lines[start.line - 1].slice(start.column - 1, end.column - 1) : lines[start.line - 1].slice(start.column - 1) + ' …';
    out.survivors.push({ file, line: start.line, fn: fnAt(start.line), mutator: m.mutatorName, original: orig.slice(0, 120), replacement: String(m.replacement).slice(0, 120) });
  }
}
const all = Object.values(out.files).reduce((a, f) => ({ total: a.total + f.total, detected: a.detected + (f.Killed || 0) + (f.Timeout || 0) }), { total: 0, detected: 0 });
out.score = Math.round(1000 * all.detected / all.total) / 10;
out.byFunction = Object.entries(out.survivors.reduce((acc, s) => { const k = `${s.file.split('/').pop()} ${s.fn}`; acc[k] = (acc[k] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]);
fs.writeFileSync(path.join(ROOT, 'audit/results/stryker-summary.json'), JSON.stringify(out, null, 1) + '\n');
console.log('score', out.score, JSON.stringify(out.files));
console.log('survivors by function:', out.byFunction.map(([k, n]) => `${k} ${n}`).join('; '));
