// Phase 8, items 33 and 34: data quality.
//   33. every cited source id exists and every source is cited; every recipe ingredient resolves; no recipe stores
//       nutrient numbers of its own; every numeric rule's supporting passage is logged in docs/VERIFY-log.md or
//       docs/DATA-REVIEW.md (the ones that are not are listed)
//   34. diet lists: duplicates, items on both the approved and the leave-out side, aliases that approve a food carrying
//       the family's own avoid tags, and items still not re-checked
// Results: audit/results/data-quality.json.
import fs from 'node:fs';
import { buildMatcher } from '../../src/engine/dictionary.js';
import { approvedFor, avoidExampleFor } from '../../src/engine/dietlists.js';
const root = new URL('../../', import.meta.url);
const J = f => JSON.parse(fs.readFileSync(new URL('data/' + f, root), 'utf8'));
const T = f => fs.readFileSync(new URL(f, root), 'utf8');
const sources = J('sources.json'), conditions = J('conditions.json'), dict = J('dictionaries.json'), lists = J('diet-lists.json'), swaps = J('swaps.json'), articles = J('articles.json'), foods = J('foods.json');
const own = J('recipes.json'), open = J('recipes-open.json'), usda = J('recipes-usda.json');
const out = {};

// 33a/b: source ids cited anywhere, against sources.json (and the dictionary's own short source map)
const ids = new Set(sources.map(s => s.id));
const cited = new Map();   // id -> where
const cite = (id, where) => { if (typeof id !== 'string') return; if (!cited.has(id)) cited.set(id, new Set()); cited.get(id).add(where); };
const walk = (v, where, key = '') => { if (Array.isArray(v)) { if (/sources$|^basis_sources$|^source_ids$/.test(key)) v.forEach(x => cite(typeof x === 'string' ? x : x && x.id, where)); else v.forEach(x => walk(x, where)); } else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (k === 'references' && Array.isArray(x)) x.forEach(r => cite(r.id, where)); walk(x, where, k); } };
walk(conditions, 'conditions.json'); walk(dict.entries, 'dictionaries.json entries'); walk(dict.tags, 'dictionaries.json tags'); walk(lists, 'diet-lists.json'); walk(swaps, 'swaps.json'); walk(articles, 'articles.json');
const dictSourceMap = new Set(Object.keys(dict.sources || {}));
out.citedButMissing = [...cited.entries()].filter(([id]) => !ids.has(id) && !dictSourceMap.has(id) && id !== 'user-defined').map(([id, w]) => ({ id, where: [...w] }));
out.sourcesNeverCited = [...ids].filter(id => !cited.has(id));
// 33c: ingredients
const foodIds = new Set(foods.map(f => f.id));
const matcher = buildMatcher(dict);
const coll = { 'Peace Meal (recipes.json)': own, ...Object.fromEntries([...new Set(open.map(r => r.source))].map(s => [s, open.filter(r => r.source === s)])), 'USDA MyPlate Kitchen': usda };
out.ingredients = {};
for (const [name, rs] of Object.entries(coll)) {
  let lines = 0, linked = 0, brokenLinks = 0, textLines = 0, unreadable = 0;
  for (const r of rs) for (const i of r.ingredients || []) {
    lines++;
    if (i.food) { linked++; if (!foodIds.has(i.food)) brokenLinks++; }
    else if (i.display) { textLines++; if (matcher.tagText(i.display).unrecognized.length) unreadable++; }
  }
  out.ingredients[name] = { recipes: rs.length, lines, linkedToFoods: linked, brokenLinks, textOnly: textLines, textWithWordsTheCheckerCannotPlace: unreadable, pctUnreadable: textLines ? Math.round(unreadable / textLines * 1000) / 10 : 0 };
}
// 33d: nutrient numbers
out.nutrientNumbers = {
  ownRecipesStoringNumbers: own.filter(r => r.nutrition_per_serving || r.nutrients || r.nutrition).map(r => r.id),
  importedNumbersWithoutASource: [...open, ...usda].filter(r => r.nutrition_per_serving && !r.nutrition_source).map(r => r.id),
  numbersAndFoodLinksTogether: [...own, ...open, ...usda].filter(r => r.nutrition_per_serving && (r.ingredients || []).some(i => i.food)).map(r => r.id)
};
// 33e: numeric rules and their logged passages
const logs = T('docs/VERIFY-log.md') + '\n' + T('docs/DATA-REVIEW.md');
const phase1 = T('docs/PHASE-1-evidence-and-regulatory-foundation.md');
const numeric = [];
for (const m of conditions.modules) for (const r of m.rules || []) {
  const vals = [r.value, r.min, r.max].filter(v => typeof v === 'number');
  if (!vals.length || !['limit', 'target'].includes(r.kind)) continue;
  const inLogs = logs.includes(r.id) || logs.includes('`' + r.id + '`');
  const numText = vals.map(v => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
  const inPhase1 = numText.some(n => phase1.includes(n) || phase1.includes(String(n).replace(/,/g, '')));
  numeric.push({ rule: `${m.id}:${r.id}`, values: vals, tier: r.tier || 1, loggedInVerifyOrDataReview: inLogs, numberAppearsInPhase1Evidence: inPhase1 });
}
out.numericRules = { total: numeric.length, logged: numeric.filter(n => n.loggedInVerifyOrDataReview).length, notLogged: numeric.filter(n => !n.loggedInVerifyOrDataReview).map(n => n.rule), notLoggedNorInPhase1: numeric.filter(n => !n.loggedInVerifyOrDataReview && !n.numberAppearsInPhase1Evidence).map(n => n.rule) };

// 34: diet lists
out.dietLists = {};
for (const [family, f] of Object.entries(lists.families)) {
  const items = f.groups.flatMap(g => g.items.map(i => ({ ...i, group: g.name })));
  const names = items.flatMap(i => [i.term, ...(i.aliases || [])].map(n => ({ n: n.toLowerCase().trim(), term: i.term })));
  const count = {}; for (const x of names) (count[x.n] ||= []).push(x.term);
  const duplicates = Object.entries(count).filter(([, v]) => v.length > 1).map(([n, v]) => ({ name: n, items: v }));
  const onBothSides = names.filter(x => avoidExampleFor(x.n, family, lists)).map(x => ({ approvedName: x.n, item: x.term, leaveOut: (avoidExampleFor(x.n, family, lists) || {}).term || true }));
  // Approved names whose own words the dictionary tags with the family's avoid tags (the label checker then disagrees).
  const famTags = new Set(f.tags || []);
  const taggedByDictionary = names.map(x => ({ ...x, tags: Object.keys(matcher.tagText(x.n).tags).filter(t => famTags.has(t)) })).filter(x => x.tags.length).map(x => ({ approvedName: x.n, item: x.term, dictionaryTags: x.tags }));
  // Aliases that approve a USDA food carrying one of the family's avoid tags, when that food's name is checked.
  const risky = [];
  for (const food of foods) {
    const bad = (food.tags || []).filter(t => famTags.has(t));
    if (!bad.length) continue;
    const a = approvedFor(food.short || food.name, family, lists, {}, {});
    if (a.approved && a.why === 'list') risky.push({ food: food.short || food.name, approvedBy: a.item && a.item.term, foodTags: bad });
  }
  out.dietLists[family] = { items: items.length, duplicates, onBothSides, approvedButTaggedByDictionary: taggedByDictionary, approvesAFoodWithTheFamilysAvoidTags: risky, notReChecked: items.filter(i => i.verified === false).map(i => i.term) };
}
fs.writeFileSync(new URL('audit/results/data-quality.json', root), JSON.stringify(out, null, 1) + '\n');
console.log('sources cited but missing:', out.citedButMissing.length, '| sources never cited:', out.sourcesNeverCited.length, out.sourcesNeverCited.slice(0, 12).join(', '));
console.log('ingredients:'); for (const [k, v] of Object.entries(out.ingredients)) console.log('  ', k, JSON.stringify(v));
console.log('nutrient numbers:', JSON.stringify(out.nutrientNumbers).slice(0, 300));
console.log('numeric rules:', out.numericRules.total, 'logged:', out.numericRules.logged, 'not logged nor in Phase 1:', out.numericRules.notLoggedNorInPhase1.length, out.numericRules.notLoggedNorInPhase1.slice(0, 10).join(', '));
for (const [f, d] of Object.entries(out.dietLists)) console.log(f, JSON.stringify({ items: d.items, duplicates: d.duplicates.length, onBothSides: d.onBothSides.length, taggedByDictionary: d.approvedButTaggedByDictionary.length, risky: d.approvesAFoodWithTheFamilysAvoidTags.length, notReChecked: d.notReChecked }));
