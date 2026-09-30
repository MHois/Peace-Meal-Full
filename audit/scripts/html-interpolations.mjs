// Phase 2, item 6 (static half): every ${...} inside an HTML-building template literal in src/ui/*.js and src/app.js
// whose expression is not wrapped in an escaping or formatting helper. Each hit is then traced by hand; the dynamic half
// (audit/e2e/xss.mjs) injects script payloads through a crafted backup file, typed label text, and a pasted recipe.
import fs from 'node:fs';
const root = new URL('../../', import.meta.url);
const files = ['src/app.js', ...fs.readdirSync(new URL('src/ui/', root)).filter(f => f.endsWith('.js')).map(f => 'src/ui/' + f)];
// Helpers whose output is escaped text or fixed markup (each was read: uiEsc escapes & < > " ').
const SAFE = /^(uiEsc|uiFmtNum|uiFmtDate|uiIcon|uiNum|Number|Math\.\w+|String\(Number|encodeURIComponent|uiAttr|JSON\.stringify)\(/;
const out = [];
for (const f of files) {
  const src = fs.readFileSync(new URL(f, root), 'utf8');
  // Walk template literals with a small scanner that handles nesting.
  let i = 0;
  while ((i = src.indexOf('`', i)) !== -1) {
    let j = i + 1, depth = 0, exprs = [], cur = null, html = false, text = '';
    while (j < src.length) {
      const c = src[j];
      if (cur === null) {
        if (c === '\\') { j += 2; continue; }
        if (c === '`') break;
        if (c === '$' && src[j + 1] === '{') { cur = { start: j + 2, depth: 1 }; j += 2; continue; }
        text += c;
      } else {
        if (c === '{') cur.depth++;
        else if (c === '}') { cur.depth--; if (cur.depth === 0) { exprs.push({ e: src.slice(cur.start, j).trim(), at: cur.start }); cur = null; } }
        else if (c === '`') { // nested template inside an expression: skip it
          let k = j + 1, d2 = 0; while (k < src.length && !(src[k] === '`' && d2 === 0)) { if (src[k] === '\\') k++; else if (src[k] === '$' && src[k + 1] === '{') d2++; else if (src[k] === '}' && d2 > 0) d2--; k++; }
          j = k;
        }
      }
      j++;
    }
    if (/<[a-z]/i.test(text)) {
      for (const x of exprs) {
        const e = x.e.replace(/\s+/g, ' ');
        if (SAFE.test(e) || /^[\d.]+$/.test(e) || /^['"][^'"]*['"]$/.test(e)) continue;
        const line = src.slice(0, x.at).split('\n').length;
        out.push({ file: f, line, expr: e.slice(0, 160) });
      }
    }
    i = j + 1;
  }
}
fs.writeFileSync(new URL('audit/results/html-interpolations.json', root), JSON.stringify(out, null, 1) + '\n');
console.log(out.length + ' interpolations not wrapped in an escaping helper');
const byFile = {}; for (const o of out) byFile[o.file] = (byFile[o.file] || 0) + 1; console.log(byFile);
