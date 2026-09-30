// Approved-food lists for elimination diets (data/diet-lists.json), with per-person additions.
//
// Strict mode: when a person's plan restricts a diet family (low FODMAP, low histamine) and strict mode is on for it
// (the default), a recipe counts as safe only when every ingredient is on the family's approved list or on the person's
// own "tolerated" list, and on neither the family's nor the person's "reacts" list. Anything else is a caution, with the
// ingredient named. This closes the gap where an ingredient that carries no avoid tag was treated as fine because the
// dictionary simply did not know it.
//
// Matching is by word or phrase against the ingredient text and the linked food's name, after stripping amounts.
//
// A family may also carry avoid_examples: foods its list says to leave out (low histamine: leftovers, stock cubes,
// vinegar, and others). They are checked before the approved list, on the ingredient as written, so "leftover roast
// chicken" is leftovers, not chicken. An example can carry "unless", a regular expression that exempts the forms the
// list itself allows (a quick homemade vegetable stock, for instance).

const DIET_NOISE = /\b(\d+[\d\/.,½¼¾⅓⅔-]*|cups?|tbsps?|tablespoons?|tsps?|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|l|litres?|liters?|cans?|tins?|jars?|packets?|packages?|pkg|cloves?|slices?|pieces?|pinch|dash|handfuls?|large|medium|small|extra|about|approx\w*|to taste|optional|fresh|frozen|canned|tinned|dried|dry|chopped|diced|minced|sliced|cubed|shredded|grated|crushed|rinsed|drained|cooked|raw|peeled|seeded|halved|quartered|trimmed|thawed|softened|melted|divided|packed|heaping|heaped|level|thinly|thickly|finely|coarsely|roughly|plus|or|of|and|for|the|a|an|into|cut|torn|whole|ripe|firm|young|baby|plain|uncooked|unsalted|salted|low-fat|reduced-fat|lean)\b/gi;

export function dietNormalize(text) {
  return String(text || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9%\s-]/g, ' ').replace(DIET_NOISE, ' ').replace(/\s+/g, ' ').trim();
}

function dietTermRegex(term) {
  const t = dietNormalize(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s-]+');
  if (!t) return null;
  // allow a trailing s/es on the last word so "carrot" matches "carrots"
  return new RegExp('(^|[^a-z])' + t + '(e?s)?([^a-z]|$)', 'i');
}

const DIET_INDEX = new WeakMap();
function dietFamilyIndex(lists, family) {
  let byFam = DIET_INDEX.get(lists);
  if (!byFam) { byFam = new Map(); DIET_INDEX.set(lists, byFam); }
  if (byFam.has(family)) return byFam.get(family);
  const fam = lists.families[family];
  const approved = [];
  const reacts = [];
  for (const g of (fam && fam.groups) || []) for (const it of g.items || []) {
    for (const term of [it.term, ...(it.aliases || [])]) { const re = dietTermRegex(term); if (re) approved.push({ re, item: it, group: g.name }); }
  }
  const avoid = [];
  for (const it of (fam && fam.avoid_examples) || []) {
    const unlessRe = it.unless ? new RegExp(it.unless, 'i') : null;
    for (const term of [it.term, ...(it.aliases || [])]) { const re = dietAvoidRegex(term); if (re) avoid.push({ re, unlessRe, item: it }); }
  }
  // portion_except: wordings that name a different product ("corn oil" is not corn), so they get no portion note.
  const portionExcept = [];
  for (const g of (fam && fam.groups) || []) for (const it of g.items || []) for (const ex of it.portion_except || []) { const re = dietTermRegex(ex); if (re) portionExcept.push({ re, item: it }); }
  const idx = { approved, avoid, portionExcept };
  byFam.set(family, idx);
  return idx;
}

// Families in the lists whose tags the plan avoids.
export function strictFamiliesFor(plan, lists) {
  const avoid = (plan && plan.avoid) || {};
  return Object.entries((lists && lists.families) || {}).filter(([, f]) => (f.tags || []).some(t => avoid[t])).map(([id]) => id);
}

// Strict mode is on unless the person switched it off for that family.
export function strictOn(person, family) {
  const s = person && person.strict_diets;
  return !(s && s[family] === false);
}

function dietPersonLists(person, family) {
  const p = (person && person.diet_lists && person.diet_lists[family]) || {};
  return { tolerated: (p.tolerated || []).map(x => ({ ...x, re: dietTermRegex(x.term) })).filter(x => x.re), reacts: (p.reacts || []).map(x => ({ ...x, re: dietTermRegex(x.term) })).filter(x => x.re) };
}

// Avoid examples match the words as written: dietNormalize strips "canned", "fresh", "dried" and the like, and those are
// the words that matter here. Only case, accents, apostrophes, and punctuation are dropped.
export function dietAvoidNormalize(text) {
  return String(text || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[‘’']/g, '').replace(/[^a-z0-9%\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Singular and plural of the last word, both ways ("leftovers" also finds "leftover"; "stock cube" also finds "stock
// cubes"). Leaving more out is the safe direction, so only this list is matched this loosely, never the approved list.
function dietAvoidRegex(term) {
  const t = dietAvoidNormalize(term);
  if (!t) return null;
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const words = t.split(' ');
  const last = words.pop();
  const forms = new Set([last]);
  if (/ies$/.test(last)) forms.add(last.slice(0, -3) + 'y');
  else if (/(ch|sh|x|ss)es$/.test(last)) forms.add(last.slice(0, -2));
  else if (/[^su]s$/.test(last)) forms.add(last.slice(0, -1));
  const lastPat = '(?:' + [...forms].map(f => /[^aeiou]y$/.test(f) ? esc(f.slice(0, -1)) + '(?:y|ies)' : esc(f) + '(?:e?s)?').join('|') + ')';
  const body = words.length ? words.map(esc).join('[\\s-]+') + '[\\s-]+' + lastPat : lastPat;
  return new RegExp('(?:^|[^a-z0-9])' + body + '(?![a-z0-9])', 'i');
}

// The family's own "leave out" example that this text names, if any.
export function avoidExampleFor(text, family, lists) {
  const raw = dietAvoidNormalize(text);
  if (!raw) return null;
  for (const a of dietFamilyIndex(lists, family).avoid) if (a.re.test(raw) && !(a.unlessRe && a.unlessRe.test(raw))) return a.item;
  return null;
}

// Is this ingredient text on the approved list for the family, for this person?
// Returns { approved, why, item } where why is 'reacts' | 'tolerated' | 'avoid' | 'list' | 'unlisted' | 'empty'.
// Order: the person's own lists, then the family's leave-out examples, then the family's approved list.
// opts.avoid = false skips the leave-out examples (strictCheck uses that for a linked food's generic USDA name when the
// recipe's own wording is checked already).
export function approvedFor(text, family, lists, person, opts = {}) {
  const n = dietNormalize(text);
  const mine = dietPersonLists(person, family);
  if (n) {
    for (const r of mine.reacts) if (r.re.test(n)) return { approved: false, why: 'reacts', item: r };
    for (const t of mine.tolerated) if (t.re.test(n)) return { approved: true, why: 'tolerated', item: t };
  }
  if (opts.avoid !== false) { const ex = avoidExampleFor(text, family, lists); if (ex) return { approved: false, why: 'avoid', item: ex }; }
  if (!n) return { approved: true, why: 'empty' };
  const idx = dietFamilyIndex(lists, family);
  for (const a of idx.approved) if (a.re.test(n)) return { approved: true, why: 'list', item: a.item, group: a.group };
  return { approved: false, why: 'unlisted' };
}

// Strict check for a recipe. Returns { families, notApproved: [{ label, family, why }] }.
// The leave-out examples are checked against the ingredient as the recipe writes it (or the food's short name when the
// recipe gives no wording); the approved list may match the wording or the linked food's names.
export function strictCheck(recipe, plan, lists, foodsById, person = {}) {
  const families = strictFamiliesFor(plan, lists).filter(f => strictOn(person, f));
  const notApproved = [];
  if (!families.length) return { families, notApproved };
  for (const ing of recipe.ingredients || []) {
    const food = ing.food && foodsById ? foodsById.get(ing.food) : null;
    const label = ing.display || (food ? food.short || food.name : ing.food) || '';
    const texts = [ing.display, food ? food.short : null, food ? food.name : null].filter(Boolean);
    for (const family of families) {
      let verdict = null;
      for (let i = 0; i < texts.length; i++) {
        const r = approvedFor(texts[i], family, lists, person, { avoid: i === 0 });
        if (r.why === 'reacts' || r.why === 'avoid') { verdict = r; break; }
        if (r.approved) verdict = r;
      }
      if (!verdict || !verdict.approved) notApproved.push({ label, family, why: verdict ? verdict.why : 'unlisted', ...(verdict && verdict.why === 'avoid' ? { avoid: verdict.item.term } : {}) });
    }
  }
  return { families, notApproved };
}

// Strict check for free text (a label, a typed dish): each segment of the ingredient statement must be on the list.
// segments are the raw pieces from segmentTextRaw; pieces that are only amounts or preparation words are skipped by the caller.
export function strictCheckText(segments, plan, lists, person = {}) {
  const families = strictFamiliesFor(plan, lists).filter(f => strictOn(person, f));
  const notApproved = [];
  if (!families.length) return { families, notApproved };
  for (const seg of segments || []) for (const family of families) {
    const r = approvedFor(seg, family, lists, person);
    if (!r.approved) notApproved.push({ label: seg, family, why: r.why, ...(r.why === 'avoid' ? { avoid: r.item.term } : {}) });
  }
  return { families, notApproved };
}

// ---- Portions (2026-09 audit) ----
// A family's list can say a food is fine only in a limited amount: "small serve", or a set amount such as "ten nuts" or
// "half a cup dry". For a family with a stacking block in data/diet-lists.json (low FODMAP), a recipe or label gets a
// portion note for each such food it uses, and a caution when one meal has caution_at or more foods marked with the
// block's marker, because stacking several of them in one meal adds up (the list's intro; sources on the block).
// Portions come from the family's list only. The person's tolerated list says a food was tolerated, not in what amount,
// so it does not switch a note off. Nothing here changes whether a food is approved.

// The family's list items this text names. When one match sits inside a longer one, only the longer counts: "corn
// tortillas" is the corn tortilla item (usual serve), not corn (small serve). A match inside one of the item's own
// portion_except wordings ("corn oil", "walnut oil") does not count either.
function dietPortionMatches(text, family, lists) {
  const n = dietNormalize(text);
  if (!n) return [];
  const idx = dietFamilyIndex(lists, family);
  const span = m => { const start = m.index + m[1].length; return { start, end: m.index + m[0].length - m[3].length }; };
  const found = [];
  for (const a of idx.approved) { const m = a.re.exec(n); if (m) found.push({ ...span(m), item: a.item }); }
  const except = [];
  for (const x of idx.portionExcept) { const m = x.re.exec(n); if (m) except.push({ ...span(m), item: x.item }); }
  const keep = found.filter(f => !found.some(g => g !== f && g.start <= f.start && g.end >= f.end && (g.end - g.start) > (f.end - f.start))
    && !except.some(x => x.item === f.item && x.start <= f.start && x.end >= f.end));
  return [...new Set(keep.map(k => k.item))];
}

// The list items a text names, most specific wording first (exported for tests and tools).
export function listItemsFor(text, family, lists) { return dietPortionMatches(text, family, lists); }

function dietPortionLimited(item) { return !!(item && item.portion && item.portion !== 'usual serve'); }

// Families the plan restricts that carry a stacking block. Strict mode does not matter here: the amounts are the list's
// own, whether or not the person uses the list to judge unlisted foods.
function dietPortionFamilies(plan, lists) {
  return strictFamiliesFor(plan, lists).filter(f => lists.families[f] && lists.families[f].stacking);
}

// pieces: [{ label, texts }], texts most specific first. Returns { notes, stacked }.
// notes: [{ family, term, portion, note, small, labels }]; stacked: [{ family, terms, text, sources }].
function dietPortionsFor(pieces, families, lists) {
  const notes = [];
  const stacked = [];
  for (const family of families) {
    const fam = lists.families[family];
    const byTerm = new Map();
    for (const p of pieces) {
      let items = [];
      for (const t of p.texts) { items = dietPortionMatches(t, family, lists); if (items.length) break; }
      for (const it of items.filter(dietPortionLimited)) {
        if (!byTerm.has(it.term)) byTerm.set(it.term, { family, term: it.term, portion: it.portion, note: it.note || '', small: it.portion === fam.stacking.marker, labels: [] });
        const n = byTerm.get(it.term);
        if (p.label && !n.labels.includes(p.label)) n.labels.push(p.label);
      }
    }
    const mine = [...byTerm.values()];
    notes.push(...mine);
    // What counts toward the caution: every food the list limits (counts: "limited", owner question 7, September 30,
    // 2026: a set amount such as "ten nuts" is the same kind of limit as "small serve"), or only the marker. A portion that
    // starts with "usual serve" ("usual serve of the heads") is a note, not a limit. A family with notes_only shows the
    // notes and never a caution.
    const counted = fam.stacking.counts === 'limited' ? mine.filter(n => !/^usual serve/.test(n.portion)) : mine.filter(n => n.small);
    const small = counted.map(n => n.term);
    if (!fam.stacking.notes_only && small.length >= (fam.stacking.caution_at || 2)) stacked.push({ family, terms: small, text: fam.stacking.text, sources: fam.stacking.sources || [] });
  }
  return { notes, stacked };
}

export function portionCheck(recipe, plan, lists, foodsById) {
  const families = lists ? dietPortionFamilies(plan, lists) : [];
  if (!families.length) return { notes: [], stacked: [] };
  const pieces = (recipe.ingredients || []).map(ing => {
    const food = ing.food && foodsById ? foodsById.get(ing.food) : null;
    return { label: ing.display || (food ? food.short || food.name : ing.food) || '', texts: [ing.display, food ? food.short : null, food ? food.name : null].filter(Boolean) };
  });
  return dietPortionsFor(pieces, families, lists);
}

export function portionCheckText(segments, plan, lists) {
  const families = lists ? dietPortionFamilies(plan, lists) : [];
  if (!families.length) return { notes: [], stacked: [] };
  return dietPortionsFor((segments || []).map(s => ({ label: s, texts: [s] })), families, lists);
}

// Today (owner question 7, September 30, 2026): everything logged for one meal is one sitting, so "small serve" foods
// logged separately stack the same way as in one recipe. pieces: [{ label, texts }] built from the diary entries.
export function portionCheckPieces(pieces, plan, lists) {
  const families = lists ? dietPortionFamilies(plan, lists) : [];
  if (!families.length) return { notes: [], stacked: [] };
  return dietPortionsFor(pieces || [], families, lists);
}

export function familyLabel(lists, family) { const f = lists && lists.families && lists.families[family]; return f ? f.label : family; }
