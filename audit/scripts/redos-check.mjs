// Phase 2, item 5: each regular expression in src/ that eslint-plugin-security flags as unsafe
// (security/detect-unsafe-regex) is run against long hostile inputs. A pattern that takes over 100 ms on 20,000
// characters would let a pasted label or recipe freeze the phone; under that, the flag is a false positive.
import fs from 'node:fs';
const root = new URL('../../', import.meta.url);
const eslint = JSON.parse(fs.readFileSync(new URL("audit/results/eslint.json", root), "utf8")).map(f => ({ filePath: root.pathname + f.file, messages: f.messages.map(m => ({ ...m, ruleId: m.rule })) }));
const out = [];
const inputs = ch => [ch.repeat(20000), ch.repeat(20000) + '!', (ch + ' ').repeat(10000) + '\u0000'];
const HOSTILE = ['1', ' ', '-', '1.1', '1,', 'no ', '#', '*', 'a', '(', 'to ', '½', 'g', '2 g ', 'Rating: A to B ', 'ingredients '];
for (const f of eslint) {
  if (!f.filePath.includes('/src/')) continue;
  const src = fs.readFileSync(f.filePath, 'utf8').split('\n');
  for (const m of f.messages.filter(m => m.ruleId === 'security/detect-unsafe-regex')) {
    const line = src[m.line - 1];
    const lit = line.slice(m.column - 1).match(/^\/((?:\\.|\[(?:\\.|[^\]])*\]|[^/\\\n])+)\/([dgimsuvy]*)/);
    if (!lit) { out.push({ where: f.filePath.replace(root.pathname, '') + ':' + m.line, note: 'not a literal at the flagged column' }); continue; }
    const re = new RegExp(lit[1], lit[2].replace('g', ''));
    let worst = 0, worstInput = '';
    for (const h of HOSTILE) for (const s of inputs(h)) { const t0 = performance.now(); re.test(s); const ms = performance.now() - t0; if (ms > worst) { worst = ms; worstInput = JSON.stringify(h) + ' x ' + s.length; } }
    out.push({ where: f.filePath.replace(root.pathname, '') + ':' + m.line, worstMs: Math.round(worst * 10) / 10, worstInput, verdict: worst > 100 ? 'SLOW' : 'false positive' });
  }
}
fs.writeFileSync(new URL('audit/results/redos-check.json', root), JSON.stringify(out, null, 1) + '\n');
for (const o of out) console.log(o.verdict || '', o.where, o.worstMs != null ? o.worstMs + ' ms' : '', o.worstInput || o.note || '');
