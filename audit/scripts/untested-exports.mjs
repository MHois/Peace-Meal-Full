// Phase 1, item 3: every exported function in src/engine/ and whether any file in test/ names it directly.
// "Direct" means the test file imports or calls it by name; a function reached only through another one is listed.
import fs from 'node:fs';
const root = new URL('../../', import.meta.url);
const engineDir = new URL('src/engine/', root), testDir = new URL('test/', root);
const tests = fs.readdirSync(testDir).filter(f => f.endsWith('.test.mjs')).map(f => ({ f, s: fs.readFileSync(new URL(f, testDir), 'utf8') }));
const rows = [];
for (const f of fs.readdirSync(engineDir).filter(f => f.endsWith('.js')).sort()) {
  const src = fs.readFileSync(new URL(f, engineDir), 'utf8');
  const names = [...src.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/gm)].map(m => m[1])
    .concat([...src.matchAll(/^export\s+const\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?(?:function|\(|[A-Za-z0-9_$]+\s*=>)/gm)].map(m => m[1]));
  for (const n of names) {
    const hits = tests.filter(t => new RegExp('\\b' + n + '\\b').test(t.s)).map(t => t.f);
    rows.push({ file: 'src/engine/' + f, name: n, tests: hits });
  }
}
const untested = rows.filter(r => !r.tests.length);
const out = { exported: rows.length, untested: untested.length, list: untested.map(r => r.file + ': ' + r.name) };
fs.writeFileSync(new URL('audit/results/untested-exports.json', root), JSON.stringify({ ...out, all: rows }, null, 1) + '\n');
console.log(JSON.stringify(out, null, 1));
