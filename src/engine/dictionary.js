// Ingredient text -> tags. Deterministic, dictionary-driven. No inference.
// Unknown text is reported as unrecognized; it is never treated as safe.
//
// Entry contract (data/dictionaries.json):
//   term, tags[], match ('word' | 'phrase' | 'substring'), note, portion_note,
//   except[]      longer phrases inside which this entry must not fire ("butter" inside "peanut butter"),
//   may_contain[] tags the ingredient often but not always carries; reported as verify-label, never as passing,
//   risk          'unknown' marks a recognized term whose composition the name does not settle (same as tags []).

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Same normalization for text and terms: lowercase, apostrophes removed, hyphens and slashes to spaces, whitespace collapsed.
export function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[‘’']/g, '')
    .replace(/[\r\n]+/g, ', ')
    .replace(/[-–—\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pluralPattern(word) {
  // singular or simple plural of the last word: s, es, y -> ies
  const w = escapeRe(word);
  if (/y$/.test(word) && !/[aeiou]y$/.test(word)) return '(?:' + w + '|' + escapeRe(word.slice(0, -1)) + 'ies)';
  return w + '(?:s|es)?';
}

function buildRegex(term, mode) {
  if (mode === 'substring') return new RegExp(escapeRe(term), 'i');
  const parts = term.split(' ');
  const last = parts.pop();
  const lastPat = mode === 'phrase' ? escapeRe(last) : pluralPattern(last);
  const body = parts.length ? parts.map(escapeRe).join(' ') + ' ' + lastPat : lastPat;
  return new RegExp('(?:^|[^a-z0-9])(' + body + ')(?![a-z0-9])', 'i');
}

// Split an ingredient statement into segments: commas, semicolons, parentheses, brackets, "and/or".
export function segmentText(text) {
  return segmentTextRaw(text).map(s => normalizeText(s)).filter(Boolean);
}
// The same split with the original words kept (the approved-food lists match on those, see dietlists.js).
export function segmentTextRaw(text) {
  const t = String(text || '')
    .replace(/^\s*ingredients?:\s*/i, '')
    // "e.g." is a separator, not two ingredients ("e" and "g"): recipe cards write "(e.g. chicken, pork, tofu)".
    .replace(/\be\.\s?g\.,?/gi, ',')
    .replace(/[()\[\]{}]/g, ',')
    .replace(/\band\/or\b/gi, ',')
    .replace(/[\r\n]+/g, ',');
  return t.split(/[,;.]+/).map(s => s.trim()).filter(Boolean);
}

// Quantity, unit, and preparation words that carry no ingredient meaning. A segment made only of these is not "unrecognized".
const NOISE = new Set(('cup cups tbsp tablespoon tablespoons tsp teaspoon teaspoons oz ounce ounces lb lbs pound pounds g gram grams kg ml l liter liters quart quarts pint pints can cans jar jars package packages pkg bag bags box boxes bunch bunches head heads clove cloves slice slices piece pieces stalk stalks sprig sprigs pinch dash handful large medium small extra ' +
  'diced chopped minced sliced cubed shredded grated crushed rinsed drained cooked uncooked raw fresh frozen canned dried dry ripe peeled seeded halved quartered trimmed thawed softened melted divided packed heaping level rounded thinly thickly finely coarsely roughly about approximately plus or to taste optional for serving garnish garnishing of and with in into at room temperature warm cold hot boiling ' +
  // Added in the 2026-09 audit fix, once unrecognized text became a caution: UK and US recipe wording for containers,
  // sizes, cut shapes, and preparation ("1 Medium Sized", "deseeded and chopped", "1 Tin", "cut into chunks"). None of
  // these names a food, and a segment is skipped only when every word in it is one of these, so "french stick", "bay
  // leaves", or "stock cube" are still reported as not recognized.
  'mug mugs mugful mugfuls tin tins tub tubs pot pots pack packs packet packets sachet sachets stick sticks spear spears leaf leaves rasher rashers portion portions fillet fillets cube cubes chunk chunks strip strips wedge wedges ring rings quarter quarters half halves third thirds floret florets cm mm inch inches dessert dessertspoon dessertspoons spoon spoons heaped generous scant size sized approx ' +
  'deseeded de cored pitted stoned scrubbed washed cleaned beaten whisked mashed juiced zested flaked crumbled defrosted cooled warmed steamed soaked patted cut broken removed skinned skinless boneless separated torn snipped squeezed drizzling brushing sprinkling greasing ' +
  'a an the any colour color shape type if possible whenever such as like also fine works well enough around each per more total very lightly slightly thin thick bite lean whole give when serve instructions according shop bought both example from ' +
  // Added September 30, 2026 with the VA recipes: "(90% lean or higher)". A percentage on its own is not an ingredient either.
  'higher').split(' '));
function isAmountWord(t) {
  return /^[\d.,\/½¼¾⅓⅔⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚x×-]+%?$/.test(t) || /^\d+(g|ml|oz|lb|kg|l|cm|mm)$/.test(t);
}
export function isNoiseOnly(segment) {
  const tokens = segment.split(' ').filter(Boolean);
  return tokens.length > 0 && tokens.every(t => NOISE.has(t) || isAmountWord(t));
}

// Words that describe a food without naming one: "organic sugar", "low sodium soy sauce", "unsalted butter" (P0-1, audit
// of September 30, 2026). They are ignored only in a piece where a dictionary term matched, so a piece made only of
// them is still "not recognized". None of them is a food, an allergen, or a near-spelling of one.
// Left out on purpose, because the word can change what the food is or what it contains: sauce, soup, dressing, gravy,
// paste, spread, mix, blend, seasoning, rub, glaze, topping, icing, filling, crust, dough, pastry, batter, breaded,
// battered, buttered, creamy, cookies, pie, loaf, cereal, buns, rolls, salad, substitute, fried, fry, smoked, cured,
// aged, pickled, fermented, leftover, seasoned, salted, processed, hydrolyzed, coating, hard (hard cider), jack
// (applejack), and the cuisine words (Chinese cooking wine has wheat; French toast has egg and milk). A piece with one
// of these stays "not recognized".
const DESCRIPTORS = new Set([
  // label wording
  'contains contain containing may allergens allergen allergy information warning manufactured produced facility equipment shared traces trace statement following product products derived source',
  // instructions and filler
  'use using used choose try will be is are it its you your that this these those do does need needed needs available desired preferred preferably recommended acceptable suitable best work worked too just only instead other another some several few little all purpose kind variety brand choice favorite favourite similar equivalent equal amount part parts combination depending based on side sides add added adding made making prepared preparation serves servings no not non free without except than less least mostly good quality at least',
  // amounts, sizes, and containers
  'litre litres dl gallon gallons bottle bottles glass glasses bowl bowls container containers carton cartons sheet sheets scoop scoops pinches spoonful spoonfuls handfuls drop drops spray sprays splash squirt squeeze knob ear ears bulb bulbs block blocks link links square squares big little jumbo mini standard individual single double us uk tbsps tsps tbs tbl pkt doz dozen c n one two three four five six seven eight nine ten twelve minutes minute hours hour overnight day days night rounds shapes pieces',
  // parts and cuts
  'breast breasts thigh thighs drumstick drumsticks wing wings wingettes leg legs loin loins tenderloin tenderloins shoulder belly rib ribs shank shanks chop chops cutlet cutlets steak steaks round sirloin flank brisket mince ground bone bones yolk yolks white whites kernel kernels pod pods stem stems top tops tip tips hearts zest peel rind flesh fleshed meat',
  // form, state, and texture
  'powder powdered granulated granules crumbs flake concentrate liquid wash oil extract essence flavor flavour flavored flavoured flavoring flavouring puree purée puréed pureed boiled roasted toasted baked grilled poached braised stewed stewing roast frying deep stir home homemade store instant quick easy cooking ready pre precooked brewed distilled rock kosher table iodized flaky sifted firmly loosely freshly squeezed strained dissolved lukewarm chilled julienned slivered shaved spiralized cracked superfine',
  // fat, sugar, and salt wording
  'lite light low lower reduced fat fatfree nonfat lowfat skim skimmed semi full calorie calories zero diet unsweetened unsalted sodium plain natural pure organic refined unrefined virgin cold pressed expeller enriched bleached unbleached fortified protein fibre fiber high',
  // kind and variety (the food itself is named by the matched term)
  'red green yellow brown dark light golden pink black purple blue multicolored rainbow long short grain grains medium soft firm silken sharp mature mild strong sweet sour chunky smooth crunchy tender fatty seedless shelled unshelled hulled bottled tinned dijon russet yukon gold roma vine ripened basmati jasmine arborio carnaroli glutinous bramley granny smith gala fuji braeburn button cremini crimini portobello portabella kalamata baby new spring navel self raising rising all',
  // more of the same, from the words left over in the 23,807 recipe lines
  'style meal mixed juice juices porridge root semisweet bittersweet flat curly cook baking old fashioned rolled regular coarse weed fluid condensed dehydrated stale back split heavy whipping elbow assorted clarified cultured pasteurized desiccated wide blanched deveined average grained sticky wild chuck butt neck filet filets braising range popping thumb pearled unseasoned unflavored bulk dashes lump couple bit much etc sprinkle decoration person caps tuber overripe unripe eating cob leafy summer garden closed delicious bella rich cara heat dish soaking under until see has their could perhaps called make known suggested omit additional up pan vegetarian vegan tree qt mineral shot pickling flower bow tie angel hair',
  // label wording and forms seen in the audit's label corpus
  'processes process processing uses handles handled packaged shaped oils tail tails groats grade delactosed calcium hydrolyzed hydrolysed',
].join(' ').split(' ').filter(Boolean));
export function isDescriptor(word) { return DESCRIPTORS.has(word); }

// A word with the punctuation around it removed ("allergens:" -> "allergens").
function bareWord(w) {
  return w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

// P0-1: every word in a piece must be placed. A word is placed when a matched term covers each of its letters and
// digits (or a phrase the dictionary names as another food, through an entry's except list), or when it is an amount,
// a noise word, or a descriptor. The rest are returned, so "penut butter" is not read as plain "butter": "penut" makes
// the piece not recognized, and a restricting plan gets "Not sure".
function unplacedWords(segment, spans) {
  const out = [];
  let pos = 0;
  for (const w of segment.split(' ')) {
    const start = segment.indexOf(w, pos);
    const end = start + w.length;
    pos = end;
    const b = bareWord(w);
    if (!w || NOISE.has(b) || DESCRIPTORS.has(b) || isAmountWord(b)) continue;
    let any = false, placed = true;
    for (let i = start; i < end; i++) {
      if (!/[\p{L}\p{N}]/u.test(segment[i])) continue;
      any = true;
      if (!spans.some(s => s.start <= i && i < s.end)) { placed = false; break; }
    }
    if (any && !placed) out.push(w);
  }
  return out;
}

// The words of a piece of text as the patterns see them: runs of a-z and 0-9 (buildRegex treats anything else as a
// boundary).
function tokensOf(segment) {
  return segment.match(/[a-z0-9]+/g) || [];
}

// The whole words that must appear in a piece of text for this term's pattern to match (P2-1, audit of September 30,
// 2026): the term's first word, and for a one-word 'word' term also the plural forms pluralPattern allows. Returns null
// when the pattern could match without such a word (substring terms, or a first word with characters outside a-z and
// 0-9, such as "1%" or "fd&c"); those terms are tried on every piece, as before.
function termKeys(term, mode) {
  if (mode === 'substring') return null;
  const words = term.split(' ');
  const first = words[0];
  if (!/^[a-z0-9]+$/.test(first)) return null;
  if (words.length > 1 || mode === 'phrase') return [first];
  if (/y$/.test(first) && !/[aeiou]y$/.test(first)) return [first, first.slice(0, -1) + 'ies'];
  return [first, first + 's', first + 'es'];
}

// opts.index === false tries every pattern on every piece (the behavior before the index); the tests use it to prove
// the index changes no result.
export function buildMatcher(dictionaries, opts = {}) {
  const tagDefs = dictionaries.tags || {};
  const entries = (dictionaries.entries || []).map((e, order) => {
    const term = normalizeText(e.term);
    const mode = e.match || 'word';
    return {
      order,
      term,
      tags: Array.isArray(e.tags) ? e.tags : [],
      match: mode,
      note: e.note || '',
      portion_note: e.portion_note || '',
      except: (e.except || []).map(x => normalizeText(x)),
      exceptRes: (e.except || []).map(x => buildRegex(normalizeText(x), 'word')),   // plural allowed on the last word, as the dictionary notes say
      may_contain: Array.isArray(e.may_contain) ? e.may_contain : [],
      unknownRisk: (Array.isArray(e.tags) && e.tags.length === 0) || e.risk === 'unknown',
      re: buildRegex(term, mode)
    };
  });

  // Word -> the entries whose pattern needs that word (see termKeys), plus the few entries tried on every piece.
  const useIndex = opts.index !== false;
  const byWord = new Map();
  const always = [];
  for (const e of entries) {
    const keys = termKeys(e.term, e.match);
    if (!keys) { always.push(e); continue; }
    for (const k of new Set(keys)) { if (!byWord.has(k)) byWord.set(k, []); byWord.get(k).push(e); }
  }
  const stats = { patternChecks: 0 };
  // The entries worth trying on this piece, in dictionary order (the order decides the order of tags and notes).
  function candidates(segment) {
    if (!useIndex) return entries;
    const found = new Set(always);
    for (const w of tokensOf(segment)) { const list = byWord.get(w); if (list) for (const e of list) found.add(e); }
    return [...found].sort((a, b) => a.order - b.order);
  }

  // Every occurrence of a pattern in the piece, as { start, end } of the captured term.
  function allSpans(re, segment) {
    const g = re._all || (re._all = new RegExp(re.source, re.flags + 'g'));
    g.lastIndex = 0;
    const out = [];
    let m;
    while ((m = g.exec(segment))) {
      const word = m[1] != null ? m[1] : m[0];   // word and phrase patterns capture the term; substring patterns have no group
      const start = m.index + m[0].length - word.length;
      out.push({ start, end: start + word.length });
      if (!m[0].length) g.lastIndex++;
    }
    return out;
  }

  // Returns the first occurrence of the term that no except phrase covers, with every such occurrence in spans, or null.
  // Each occurrence is judged on its own (fix pass of September 30, 2026): before, only the first one was, so in
  // "peanut butter and butter" the second butter was never seen and the piece passed for a milk allergy. When an except
  // phrase stops an occurrence, that phrase's span goes into explained: the dictionary names it as another food
  // ("coconut flour" is not flour), so its words are not unknown.
  function fires(e, segment, explained) {
    const hits = allSpans(e.re, segment);
    if (!hits.length) return null;
    const exceptSpans = e.exceptRes.length ? e.exceptRes.flatMap(xr => allSpans(xr, segment)) : [];
    const spans = [];
    for (const h of hits) {
      const x = exceptSpans.find(s => h.start >= s.start && h.end <= s.end);
      if (x) { if (explained) explained.push(x); } else spans.push(h);
    }
    return spans.length ? { start: spans[0].start, end: spans[0].end, spans } : null;
  }

  // The spans a match places: every occurrence, and for a substring term ("casein" in "caseinate") the whole word it
  // sits in.
  function placedSpans(f, segment) {
    if (f.e.match !== 'substring') return f.spans;
    return f.spans.map(s => {
      let { start, end } = s;
      while (start > 0 && segment[start - 1] !== ' ') start--;
      while (end < segment.length && segment[end] !== ' ') end++;
      return { start, end };
    });
  }

  function matchSegment(segment) {
    const tags = new Map(); // tag -> Set(terms)
    const mayContain = new Map(); // tag -> Set(terms)
    const unknownRisk = [];
    const matchedTerms = [];
    const notes = [];
    const fired = [];
    const explained = [];
    const tryList = candidates(segment);
    stats.patternChecks += tryList.length;
    for (const e of tryList) { const span = fires(e, segment, explained); if (span) fired.push({ e, ...span }); }
    for (const { e, spans } of fired) {
      matchedTerms.push(e.term);
      // An unknown-kind term ("tortilla": corn or flour?) is settled when a longer entry covering the same words also
      // matched ("corn tortilla"), at every place the term occurs. Its may_contain list still applies, so a label check
      // stays a label check.
      const settled = e.unknownRisk && spans.every(s => fired.some(f => f.e !== e && f.spans.some(o => o.start <= s.start && o.end >= s.end && (o.end - o.start) > (s.end - s.start))));
      if (e.unknownRisk && !settled) unknownRisk.push({ term: e.term, note: e.note });
      for (const tag of e.tags) {
        if (!tags.has(tag)) tags.set(tag, new Set());
        tags.get(tag).add(e.term);
      }
      for (const tag of e.may_contain) {
        if (!mayContain.has(tag)) mayContain.set(tag, new Set());
        mayContain.get(tag).add(e.term);
      }
      if (e.portion_note) notes.push({ term: e.term, note: e.portion_note });
    }
    const leftover = fired.length ? unplacedWords(segment, [...fired.flatMap(f => placedSpans(f, segment)), ...explained]) : [];
    return { segment, tags, mayContain, unknownRisk, matchedTerms, notes, leftover };
  }

  const cache = new Map(); // text -> result; ingredient lines repeat heavily across thousands of recipes
  function tagText(text) {
    const key = String(text || '');
    const hit = cache.get(key);
    if (hit) return hit;
    const result = tagTextUncached(key);
    if (cache.size > 20000) cache.clear();
    cache.set(key, result);
    return result;
  }
  function tagTextUncached(text) {
    const segments = segmentText(text);
    const tags = new Map();
    const mayContain = new Map();
    const unknownRisk = [];
    const unrecognized = [];
    const unplaced = [];   // pieces where a term matched but other words did not: [{ segment, words }]
    const notes = [];
    for (const seg of segments) {
      const r = matchSegment(seg);
      if (r.matchedTerms.length === 0 && !isNoiseOnly(seg)) unrecognized.push(seg);
      else if (r.leftover.length) { unrecognized.push(seg); unplaced.push({ segment: seg, words: r.leftover }); }
      for (const u of r.unknownRisk) unknownRisk.push({ ...u, segment: seg });
      for (const [tag, terms] of r.tags) { if (!tags.has(tag)) tags.set(tag, new Set()); for (const t of terms) tags.get(tag).add(t); }
      for (const [tag, terms] of r.mayContain) { if (tags.has(tag)) continue; if (!mayContain.has(tag)) mayContain.set(tag, new Set()); for (const t of terms) mayContain.get(tag).add(t); }
      for (const n of r.notes) notes.push(n);
    }
    return {
      tags: Object.fromEntries([...tags].map(([k, v]) => [k, [...v]])),
      mayContain: Object.fromEntries([...mayContain].map(([k, v]) => [k, [...v]])),
      unknownRisk,
      unrecognized,
      unplaced,
      notes,
      segments
    };
  }

  function tagLabel(tag) { return (tagDefs[tag] && tagDefs[tag].label) || tag; }
  function tagDef(tag) { return tagDefs[tag] || null; }
  function isHardTag(tag) { return !!(tagDefs[tag] && tagDefs[tag].hard); }

  return { tagText, tagLabel, tagDef, isHardTag, isDescriptor, entryCount: entries.length, tags: tagDefs, stats: () => ({ ...stats }) };
}
