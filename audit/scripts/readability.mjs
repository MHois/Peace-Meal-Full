// Phase 8, item 36: the hardest-to-read text shown to people. Collects every rule text, notice and education line in
// data/conditions.json, every article line in data/articles.json, and every sentence-length piece of text in the
// screens' code (src/ui/*.js, src/app.js), scores each sentence, and lists the hardest. Scores:
//   grade   Flesch-Kincaid grade level (0.39 x words per sentence + 11.8 x syllables per word - 15.59)
//   words   sentence length; over 25 words is long for any reader, over 20 for an older reader on a phone
//   abbrev  capitalised abbreviations with no spelled-out form in the same text (ADA, FODMAP, MCAS, eGFR ...)
// "lite" marks text the lite build can show (every data file, and every screen file except the full-only ones).
// Report only: suggested wording is written by hand in the evidence file, not here. Results: audit/results/readability.json.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../../', import.meta.url).pathname);
const J = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const FULL_ONLY = new Set(['together.js', 'household.js', 'owner.js', 'sharing.js']);
const items = [];
const add = (where, text, lite = true) => { if (typeof text === 'string' && text.trim()) items.push({ where, text: text.trim(), lite }); };
// data/conditions.json
const cond = J('data/conditions.json');
for (const m of cond.modules) {
  for (const r of m.rules || []) add(`conditions.json ${m.id} / ${r.id}`, r.text);
  for (const e of [].concat(m.education || [])) add(`conditions.json ${m.id} / education`, typeof e === 'string' ? e : (e && (e.text || e.body)));
  for (const q of m.medication_questions || []) add(`conditions.json ${m.id} / medicine question`, q && (q.text || q.question));
  for (const c of m.conflicts || []) add(`conditions.json ${m.id} / conflict`, c && (c.text || c.notice || c.message));
  for (const [k, p] of Object.entries(m.phases || {})) add(`conditions.json ${m.id} / phase ${k}`, p && (p.text || p.description));
}
// data/articles.json
const arts = J('data/articles.json');
for (const a of (Array.isArray(arts) ? arts : arts.articles || Object.values(arts))) {
  for (const s of a.summary || []) add(`articles.json "${a.title}" / summary`, s);
  for (const sec of a.sections || []) for (const p of [].concat(sec.body || sec.paragraphs || sec.text || [])) add(`articles.json "${a.title}" / ${sec.heading || sec.title || 'section'}`, p);
}
// screen code: string and template literals with at least 8 words once markup and ${...} are removed
for (const f of [...fs.readdirSync(path.join(ROOT, 'src/ui')).filter(f => f.endsWith('.js')).map(f => 'src/ui/' + f), 'src/app.js']) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    if (/^\s*\/\//.test(line)) return;
    for (const m of line.matchAll(/(['"`])((?:\\.|(?!\1).){40,}?)\1/g)) {
      let t = m[2].replace(/\$\{[^}]*\}/g, ' X ').replace(/<[^>]+>/g, ' ').replace(/\\'/g, "'").replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
      if (t.split(' ').filter(w => /[a-z]/i.test(w)).length < 8 || /^[\w.-]+(\s[\w.-]+)*$/.test(t) && !/[a-z]{3,}\s[a-z]{3,}\s[a-z]{3,}/.test(t)) continue;
      if (/class=|=>|function|querySelector|addEventListener/.test(m[2])) continue;
      add(`${f}:${i + 1}`, t, !FULL_ONLY.has(path.basename(f)));
    }
  });
}
// scoring
const syll = w => { w = w.toLowerCase().replace(/[^a-z]/g, ''); if (!w) return 0; if (w.length <= 3) return 1; w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, ''); const m = w.match(/[aeiouy]{1,2}/g); return Math.max(1, m ? m.length : 1); };
const ABBR = /\b[A-Z][A-Z0-9]{1,}[a-z]?\b|\be[A-Z]{2,}\b/g;
const COMMON = new Set(['OK', 'US', 'UK', 'NHS', 'PASS', 'FAIL', 'NOT', 'SURE', 'X', 'AM', 'PM', 'TV', 'I', 'A']);
function score(text) {
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z0-9"(])/).filter(s => s.split(/\s+/).length >= 4);
  return sentences.map(s => {
    const words = s.split(/\s+/).filter(w => /[a-z0-9]/i.test(w));
    const syl = words.reduce((n, w) => n + syll(w), 0);
    const grade = 0.39 * words.length + 11.8 * (syl / words.length) - 15.59;
    const abbrev = [...new Set((s.match(ABBR) || []).filter(a => !COMMON.has(a) && !new RegExp(`\\(${a}\\)|${a} \\(`).test(text)))];
    return { sentence: s, words: words.length, grade: Math.round(grade * 10) / 10, abbrev, long: words.filter(w => syll(w) >= 4).length };
  });
}
const scored = [];
for (const it of items) for (const s of score(it.text)) scored.push({ where: it.where, lite: it.lite, ...s, hardness: Math.round((s.grade + 1.5 * s.abbrev.length + Math.max(0, s.words - 20) * 0.15) * 10) / 10 });
// The articles' "What the evidence says" sections are reference lists of guidelines and trials by design; they are
// scored and counted but ranked separately, so the list of hardest text is about what a person reads to act on.
const REFERENCE = s => / \/ What the evidence says$/.test(s.where);
const CODE = s => /DTSTAMP|DTSTART|UID:|\bX @/.test(s.sentence);
const seen = new Set();
const ranked = scored.filter(s => { const k = s.sentence.slice(0, 80); if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => b.hardness - a.hardness);
const summary = { texts: items.length, sentences: scored.length, medianGrade: (() => { const g = scored.map(s => s.grade).sort((a, b) => a - b); return g[Math.floor(g.length / 2)]; })(), over12: scored.filter(s => s.grade > 12).length, over25words: scored.filter(s => s.words > 25).length, withAbbrev: scored.filter(s => s.abbrev.length).length };
const toAct = ranked.filter(r => !REFERENCE(r) && !CODE(r));
summary.referenceSentences = ranked.filter(REFERENCE).length;
summary.referenceMedianGrade = (() => { const g = ranked.filter(REFERENCE).map(s => s.grade).sort((a, b) => a - b); return g[Math.floor(g.length / 2)]; })();
fs.writeFileSync(path.join(ROOT, 'audit/results/readability.json'), JSON.stringify({ summary, hardestToActOn: toAct.slice(0, 80), hardestReference: ranked.filter(REFERENCE).slice(0, 10) }, null, 1) + '\n');
console.log(JSON.stringify(summary));
for (const r of toAct.slice(0, Number(process.env.SHOW || 45))) console.log(`${r.hardness.toFixed(1).padStart(5)} g${r.grade} w${r.words} ${r.lite ? 'L' : 'F'} ${r.abbrev.join(',')} | ${r.where} | ${r.sentence.slice(0, 230)}`);
