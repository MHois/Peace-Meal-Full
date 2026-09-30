// Phase 2, item 5: runs ESLint (audit/eslint.config.js) over src/, tools/, and sw.js and writes the messages, without the
// source text, to audit/results/eslint.json. Prints the count per rule. Triage: docs/audit-2026-09-30/evidence/phase2-static-security.md
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const root = new URL('../../', import.meta.url).pathname;
let raw;
try { raw = execFileSync(root + 'audit/node_modules/.bin/eslint', ['-c', root + 'audit/eslint.config.js', '-f', 'json', 'src', 'tools', 'sw.js'], { cwd: root, maxBuffer: 1 << 28 }).toString(); }
catch (e) { raw = e.stdout.toString(); }
const slim = JSON.parse(raw).filter(f => f.messages.length).map(f => ({ file: f.filePath.replace(root, ''), messages: f.messages.map(m => ({ rule: m.ruleId, line: m.line, column: m.column, message: m.message })) }));
fs.writeFileSync(root + 'audit/results/eslint.json', JSON.stringify(slim) + '\n');
const byRule = {};
for (const f of slim) for (const m of f.messages) byRule[m.rule] = (byRule[m.rule] || 0) + 1;
console.log(Object.entries(byRule).sort((a, b) => b[1] - a[1]).map(([r, n]) => `${n}\t${r}`).join('\n'));
