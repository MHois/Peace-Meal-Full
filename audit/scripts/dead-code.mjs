// Phase 2, item 10: exports nothing else uses, unused variables (ESLint no-unused-vars), the ten most complex functions
// (ESLint complexity), and duplicated blocks (jscpd, run separately; see audit/results/jscpd/).
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const root = new URL('../../', import.meta.url).pathname;
const files = ['src/app.js', 'src/store.js', ...['engine', 'ui'].flatMap(d => fs.readdirSync(root + 'src/' + d).filter(f => f.endsWith('.js')).map(f => `src/${d}/${f}`))];
const text = Object.fromEntries(files.map(f => [f, fs.readFileSync(root + f, 'utf8')]));
const tests = fs.readdirSync(root + 'test').filter(f => f.endsWith('.mjs')).map(f => fs.readFileSync(root + 'test/' + f, 'utf8')).join('\n');
const tools = fs.readdirSync(root + 'tools').filter(f => /\.(m?js|cjs)$/.test(f)).map(f => fs.readFileSync(root + 'tools/' + f, 'utf8')).join('\n');
const unusedExports = [];
for (const f of files) {
  for (const m of text[f].matchAll(/^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z0-9_$]+)/gm)) {
    const n = m[1], re = new RegExp('\\b' + n.replace(/\$/g, '\\$') + '\\b', 'g');
    const elsewhere = files.filter(g => g !== f && re.test(text[g])).length;
    const ownUses = (text[f].match(re) || []).length - 1;
    if (!elsewhere) unusedExports.push({ file: f, name: n, usedInOwnFile: ownUses > 0, usedByTests: new RegExp('\\b' + n + '\\b').test(tests), usedByTools: new RegExp('\\b' + n + '\\b').test(tools) });
  }
}
const cfg = root + 'audit/eslint.config.js';
const run = extra => { try { return JSON.parse(execFileSync(root + 'audit/node_modules/.bin/eslint', ['-c', cfg, '-f', 'json', ...extra, 'src', 'sw.js'], { cwd: root, maxBuffer: 1 << 28 }).toString()); } catch (e) { return JSON.parse(e.stdout.toString()); } };
const unusedVars = run(['--rule', '{"no-unused-vars": ["warn", {"args": "none", "caughtErrors": "none"}]}']).flatMap(f => f.messages.filter(m => m.ruleId === 'no-unused-vars').map(m => ({ file: f.filePath.replace(root, ''), line: m.line, message: m.message })));
const cx = run(['--rule', '{"complexity": ["warn", 0]}']).flatMap(f => f.messages.filter(m => m.ruleId === 'complexity').map(m => ({ file: f.filePath.replace(root, ''), line: m.line, n: Number((m.message.match(/complexity of (\d+)/) || [])[1]), what: (m.message.match(/^(.*?) has a complexity/) || [])[1] })));
cx.sort((a, b) => b.n - a.n);
const out = { unusedExports, unusedVars, mostComplex: cx.slice(0, 10), functionsMeasured: cx.length };
fs.writeFileSync(root + 'audit/results/dead-code.json', JSON.stringify(out, null, 1) + '\n');
console.log('exports used by no other app file:', unusedExports.length, '(dead: not even used in their own file:', unusedExports.filter(u => !u.usedInOwnFile).length + ')');
for (const u of unusedExports.filter(u => !u.usedInOwnFile)) console.log('   dead export:', u.file, u.name, u.usedByTests ? '(tests only)' : '', u.usedByTools ? '(tools)' : '');
console.log('unused variables:', unusedVars.length); for (const u of unusedVars) console.log('  ', u.file + ':' + u.line, u.message);
console.log('ten most complex of', cx.length, 'functions:'); for (const c of out.mostComplex) console.log('  ', c.n, c.file + ':' + c.line, c.what);
