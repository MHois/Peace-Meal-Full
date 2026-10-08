// Phase 2, item 5: splits the security/detect-object-injection messages into reads and writes, and prints every write in
// src/ for the by-hand check (what supplies the key: data files, a fixed list, a UI value, or an imported file).
import fs from 'node:fs';
const root = new URL('../../', import.meta.url).pathname;
const eslint = JSON.parse(fs.readFileSync(root + 'audit/results/eslint.json', 'utf8'));
let reads = 0; const writes = [];
for (const f of eslint) {
  const lines = fs.readFileSync(root + f.file, 'utf8').split('\n');
  for (const m of f.messages.filter(m => m.rule === 'security/detect-object-injection')) {
    const rest = lines[m.line - 1].slice(m.column - 1, m.column + 80);
    if (/\]\s*(=[^=]|\|\|=|\?\?=|\+\+|\+=|-=)/.test(rest)) writes.push(`${f.file}:${m.line} | ${lines[m.line - 1].trim().slice(0, 160)}`); else reads++;
  }
}
fs.writeFileSync(root + 'audit/results/object-injection-writes.txt', writes.join('\n') + '\n');
console.log(`reads ${reads}, writes ${writes.length} (listed in audit/results/object-injection-writes.txt)`);
