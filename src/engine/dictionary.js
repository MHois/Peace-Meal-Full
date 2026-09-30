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
  'a an the any colour color shape type if possible whenever such as like also fine works well enough around each per more total very lightly slightly thin thick bite lean whole give when serve instructions according shop bought both example from').split(' '));
export function isNoiseOnly(segment) {
  const tokens = segment.split(' ').filter(Boolean);
  return tokens.length > 0 && tokens.every(t => NOISE.has(t) || /^[\d.,\/½¼¾⅓⅔x×-]+$/.test(t) || /^\d+(g|ml|oz|lb|kg|l|cm|mm)$/.test(t));
}

export function buildMatcher(dictionaries) {
  const tagDefs = dictionaries.tags || {};
  const entries = (dictionaries.entries || []).map(e => {
    const term = normalizeText(e.term);
    const mode = e.match || 'word';
    return {
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

  // Returns the matched span { start, end } or null.
  function fires(e, segment) {
    const m = e.re.exec(segment);
    if (!m) return null;
    const word = m[1] != null ? m[1] : m[0];   // word and phrase patterns capture the term; substring patterns have no group
    const start = m.index + m[0].length - word.length;
    const end = start + word.length;
    // Suppress only when the matched occurrence sits inside an except phrase.
    for (const xr of e.exceptRes) {
      const xm = xr.exec(segment);
      if (!xm) continue;
      const xStart = xm.index + xm[0].length - xm[1].length;
      const xEnd = xStart + xm[1].length;
      if (start >= xStart && end <= xEnd) return null;
    }
    return { start, end };
  }

  function matchSegment(segment) {
    const tags = new Map(); // tag -> Set(terms)
    const mayContain = new Map(); // tag -> Set(terms)
    const unknownRisk = [];
    const matchedTerms = [];
    const notes = [];
    const fired = [];
    for (const e of entries) { const span = fires(e, segment); if (span) fired.push({ e, ...span }); }
    for (const { e, start, end } of fired) {
      matchedTerms.push(e.term);
      // An unknown-kind term ("tortilla": corn or flour?) is settled when a longer entry covering the same words also
      // matched ("corn tortilla"). Its may_contain list still applies, so a label check stays a label check.
      const settled = e.unknownRisk && fired.some(f => f.e !== e && f.start <= start && f.end >= end && (f.end - f.start) > (end - start));
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
    return { segment, tags, mayContain, unknownRisk, matchedTerms, notes };
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
    const notes = [];
    for (const seg of segments) {
      const r = matchSegment(seg);
      if (r.matchedTerms.length === 0 && !isNoiseOnly(seg)) unrecognized.push(seg);
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
      notes,
      segments
    };
  }

  function tagLabel(tag) { return (tagDefs[tag] && tagDefs[tag].label) || tag; }
  function tagDef(tag) { return tagDefs[tag] || null; }
  function isHardTag(tag) { return !!(tagDefs[tag] && tagDefs[tag].hard); }

  return { tagText, tagLabel, tagDef, isHardTag, entryCount: entries.length, tags: tagDefs };
}
