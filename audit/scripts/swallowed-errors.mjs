// Phase 2, item 8: every catch in src/ and sw.js, classified by what it does with the error.
//   silent   the catch body is empty, a comment, or only returns a fallback value (nothing shown, nothing logged)
//   logged   console.* only
//   shown    tells the person (uiToast, a notice, an alert, a rethrow to a caller that shows it)
import fs from 'node:fs';
const root = new URL('../../', import.meta.url);
const files = ['sw.js', 'src/app.js', 'src/store.js', ...['engine', 'ui'].flatMap(d => fs.readdirSync(new URL('src/' + d + '/', root)).filter(f => f.endsWith('.js')).map(f => `src/${d}/${f}`))];
const rows = [];
for (const f of files) {
  const src = fs.readFileSync(new URL(f, root), 'utf8');
  const re = /catch\s*(\([^)]*\))?\s*\{/g; let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length, depth = 1;
    while (i < src.length && depth) { if (src[i] === '{') depth++; else if (src[i] === '}') depth--; i++; }
    const body = src.slice(m.index + m[0].length, i - 1).trim();
    const line = src.slice(0, m.index).split('\n').length;
    const kind = /uiToast|uiSaveStatus|alert\(|throw |notice|\.textContent\s*=|error:|reason:|problem\(/.test(body) ? 'shown or returned as an error'
      : /console\./.test(body) ? 'logged' : 'silent';
    rows.push({ file: f, line, kind, body: body.replace(/\s+/g, ' ').slice(0, 140), context: src.split('\n')[line - 1].trim().slice(0, 160) });
  }
}
fs.writeFileSync(new URL('audit/results/swallowed-errors.json', root), JSON.stringify(rows, null, 1) + '\n');
const count = {}; for (const r of rows) count[r.kind] = (count[r.kind] || 0) + 1;
console.log(rows.length + ' catch blocks', count);
for (const r of rows.filter(r => r.kind === 'silent')) console.log(`${r.file}:${r.line} | ${r.context}`);
