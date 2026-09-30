// P2-10, part 2 (audit of September 30, 2026): the hardest clinical lines (docs/audit-2026-09-30/evidence/
// phase8-plain-language.md, items 4 to 6, 8 to 10, 18, and 19). Each keeps its clinical meaning: every number, food,
// medicine, condition, and limit it named is still named, and each medical term that carries meaning is kept, with a
// plain explanation beside it. What changed is sentence length and the jargon around those terms.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const J = f => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const conditions = J('conditions.json').modules, articles = J('articles.json');
const rule = (m, id) => conditions.find(x => x.id === m).rules.find(r => r.id === id).text;
const para = (id, heading, re) => articles[id].sections.find(s => s.heading === heading).paragraphs.find(p => re.test(p));
const sentences = t => t.split(/(?<=[.!?])\s+(?=[A-Z"(])/);
const longest = t => Math.max(...sentences(t).map(s => s.split(/\s+/).length));
const has = (t, words) => { for (const w of words) assert.ok(t.includes(w), `still names "${w}": ${t}`); };

test('P2-10: high blood pressure, sodium: the limit and its exception are kept, and the exception is explained', () => {
  const t = rule('hypertension', 'htn-sodium');
  has(t, ['2,300 mg', '1,500 mg', '(Class 1, Level A)', 'severe symptomatic orthostatic hypotension']);
  assert.doesNotMatch(t, /Contraindicated/);
  assert.match(t, /stand up/);
});

test('P2-10: high blood pressure, potassium: same range, same exception, in plain words', () => {
  const t = rule('hypertension', 'htn-potassium');
  has(t, ['3,500 to 5,000 mg', '(Class 1, Level A)', 'chronic kidney disease', 'ACE inhibitor', 'ARB', 'spironolactone', 'potassium-sparing', 'blood potassium must be checked']);
  assert.doesNotMatch(t, /excretion|serum/);
});

test('P2-10: warfarin: same advice, shorter sentences, and INR explained', () => {
  const t = rule('medication-food-interactions', 'med-warfarin-vitamin-k');
  has(t, ['Warfarin', 'steady rather than low', 'leafy greens', 'week to week', 'Do not cut greens out', 'a new supplement', 'cranberry or grapefruit juice', 'INR (']);
  assert.ok(longest(t) <= 30, `longest sentence ${longest(t)} words`);
});

test('P2-10: IBS elimination: the same foods, without the chemistry group names', () => {
  const t = rule('ibs-low-fodmap', 'fodmap-elim-avoid');
  has(t, ['2 to 6 weeks', 'wheat', 'rye', 'onion', 'garlic', 'legumes', 'lactose', 'honey', 'apples', 'mango', 'high-fructose corn syrup', 'sorbitol', 'mannitol', 'stone fruits', 'sugar-free gum']);
  assert.doesNotMatch(t, /oligosaccharides|disaccharides|monosaccharides/);
});

test('P2-10: MCAS: the AGA statement with its abbreviations spelled out, still permission and not a recommendation', () => {
  const t = rule('mcas', 'mcas-counseling');
  has(t, ['2025', 'American Gastroenterological Association', 'mast cell activation syndrome', 'low-histamine', 'low-FODMAP', 'gluten-free', 'dairy-free', 'can be considered', 'nutrition counseling', 'not a recommendation']);
});

test('P2-10: low carb: the same list of reasons to check with a doctor first, in plain words', () => {
  const t = rule('low-carb-ketogenic', 'lc-screen');
  has(t, ['SGLT2 inhibitor', 'ketoacidosis', 'normal', 'insulin or a sulfonylurea', 'low blood sugar', 'doses', 'pregnant or breastfeeding', 'kidney disease', 'pancreatitis', 'rare metabolic disorders', 'disordered eating', 'The app asks about these medicines and about pregnancy, and flags kidney disease if it is on your list; it cannot check for the rest.']);
  assert.doesNotMatch(t, /euglycemic|Contraindications/);
});

test('P2-10: the IBS and MCAS articles: the same facts in shorter sentences', () => {
  const ibs = para('ibs-low-fodmap', 'What this condition is', /FODMAPs are/);
  has(ibs, ['fructans', 'galacto-oligosaccharides', 'lactose', 'fructose', 'sorbitol', 'mannitol', 'small intestine', 'gut bacteria']);
  assert.ok(longest(ibs) <= 40, `IBS: longest sentence ${longest(ibs)} words`);
  const mcas = para('mcas', 'What to limit or avoid', /4 to 6 week trial/);
  has(mcas, ['aged cheeses', 'cured and processed meats', 'sauerkraut', 'kimchi', 'kombucha', 'soy sauce', 'shellfish', 'canned and smoked fish', 'leftovers more than a day old', 'tomatoes', 'spinach', 'citrus', 'chocolate', 'nuts', 'spicy foods', 'food additives', 'alcohol']);
  assert.match(mcas, /except distilled white and apple cider vinegar/, 'matches the approved list (VERIFY-log A20, F6)');
  assert.ok(longest(mcas) <= 45, `MCAS: longest sentence ${longest(mcas)} words`);
});
