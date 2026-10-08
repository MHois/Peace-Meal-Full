// Phase 3, item 16 (claim P7b): every numeric limit or target whose plain-words "why" is missing or is not word for word
// in the condition's article. Run from the repository root: node audit/scripts/why-lines.mjs
import { J, conditions } from '../lib/engine.mjs';
const articles = J('articles.json');
const flat = v => typeof v === 'string' ? v : v && typeof v === 'object' ? Object.values(v).map(flat).join(' ') : '';
for (const m of conditions) for (const r of m.rules || []) {
  if (!((r.kind === 'limit' || r.kind === 'target') && typeof (r.value ?? r.min ?? r.max) === 'number')) continue;
  if (!r.why) { console.log(`${m.id}:${r.id} has no why`); continue; }
  const text = flat(articles[m.id]).replace(/\s+/g, ' ');
  if (!text.includes(r.why.replace(/\s+/g, ' ').trim())) console.log(`${m.id}:${r.id} why not word for word: "${r.why.slice(0, 90)}"`);
}
