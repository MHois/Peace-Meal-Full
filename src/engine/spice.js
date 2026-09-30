// Heat estimate for a recipe, from its title and ingredient text, and the person's spice preference.
// Levels: 0 none, 1 mild, 2 medium, 3 hot. This is an estimate from words, not a measurement; the terms that
// drove it are returned so the person can see why. Used by the planner (exclude or nudge), Recipes, and Pantry.

export const SPICE_LEVELS = [
  { value: 'any', label: 'No preference', desc: 'Heat is not a factor in what gets planned.' },
  { value: 'none', label: 'No heat at all', desc: 'Anything with chili, hot sauce, or hot spice is left out.' },
  { value: 'mild', label: 'Mild only', desc: 'A little warmth is fine. Medium and hot recipes are left out.' },
  { value: 'medium', label: 'Medium', desc: 'Jalapeño, chipotle, and sriracha are welcome. The hottest recipes are left out.' },
  { value: 'hot', label: 'Bring the heat', desc: 'Nothing is left out for heat, and hot recipes get a nudge up.' }
];
export const SPICE_LABEL = { 0: 'No heat', 1: 'Mild heat', 2: 'Medium heat', 3: 'Hot' };

// Terms by tier. Matched as whole words on lowercased text; longer phrases are checked before shorter ones.
const TIER3 = ['habanero', 'habaneros', 'scotch bonnet', 'ghost pepper', 'bhut jolokia', 'carolina reaper', 'reaper', "bird's eye", 'birds eye', 'bird eye chili', 'thai chili', 'thai chilies', 'thai chile', 'thai chiles', 'thai chilli', 'thai chillies', 'piri piri', 'peri peri', 'peri-peri', 'piri-piri', 'vindaloo', 'phaal', 'naga', 'extra hot', 'very hot', 'fiery', 'diablo', 'inferno', 'nashville hot', 'ghost chili', 'trinidad scorpion', 'chile de arbol', 'chiles de arbol', 'arbol chiles', 'pequin', 'tepin', 'malagueta', 'xxx hot'];
const TIER2 = ['jalapeño', 'jalapeno', 'jalapeños', 'jalapenos', 'serrano', 'serranos', 'chipotle', 'chipotles', 'cayenne', 'chili flakes', 'chilli flakes', 'chile flakes', 'red pepper flakes', 'crushed red pepper', 'hot sauce', 'pepper sauce', 'sriracha', 'tabasco', 'sambal', 'sambal oelek', 'harissa', 'gochujang', 'gochugaru', 'chili paste', 'chilli paste', 'chile paste', 'red curry paste', 'green curry paste', 'yellow curry paste', 'curry paste', 'hot pepper', 'hot peppers', 'hot chili', 'hot chilli', 'hot chile', 'chili oil', 'chilli oil', 'chile oil', 'szechuan', 'sichuan', 'szechuan pepper', 'sichuan pepper', 'peppercorns, sichuan', 'pepperoncino', 'peperoncino', 'arrabbiata', 'arrabiata', 'buffalo', 'jerk', 'jerk seasoning', 'kimchi', 'wasabi', 'madras', 'hot curry', 'hot paprika', 'chili crisp', 'chilli crisp', 'fresno', 'red chili', 'red chilli', 'red chile', 'green chili', 'green chilli', 'green chile', 'fresh chili', 'fresh chilli', 'fresh chile', 'dried chili', 'dried chilli', 'dried chile', 'chili con carne', 'chilli con carne', 'spicy', 'spiced hot', 'hot and spicy', 'hot & spicy', 'cajun', 'creole seasoning', 'cajun seasoning', 'blackened', 'firecracker', 'kung pao', 'mapo', 'dan dan', 'chili garlic sauce', 'chilli garlic sauce', 'chili sauce', 'chilli sauce', 'chile sauce', 'gochu', 'tom yum', 'laksa', 'rendang', 'pepper jack', 'horseradish', 'shichimi', 'togarashi', 'berbere', 'ras el hanout', 'piquante', 'picante', 'hot salsa', 'salsa roja', 'chili, red', 'chili, green', 'chile, red', 'chile, green'];
const TIER1 = ['hot mustard', 'english mustard', 'with a kick', 'chili powder', 'chilli powder', 'chile powder', 'curry powder', 'curry', 'paprika', 'ancho', 'anchos', 'guajillo', 'pasilla', 'poblano', 'poblanos', 'mild chili', 'mild chilli', 'canned green chilies', 'canned green chiles', 'diced green chilies', 'diced green chiles', 'green chilies', 'green chiles', 'chilies', 'chillies', 'chiles', 'chili', 'chilli', 'chile', 'pepperoni', 'chorizo', 'andouille', 'salami, hot', 'mustard powder', 'dijon', 'ginger', 'black pepper', 'white pepper', 'peppercorns', 'pimentón', 'pimenton', 'aleppo', 'garam masala', 'tikka', 'tandoori', 'masala', 'korma', 'jalfrezi', 'rogan josh', 'bhuna', 'dhal', 'dal', 'tagine', 'chermoula', 'adobo', 'enchilada sauce', 'taco seasoning', 'fajita seasoning', 'salsa', 'gumbo', 'jambalaya', 'peppadew', 'banana pepper', 'banana peppers', 'pepperoncini', 'radish', 'mustard greens', 'arugula', 'rocket', 'watercress', 'nasturtium'];
// Words in TIER1 that are so mild they should not, on their own, lift a recipe to "mild heat". They only count when something warmer is present.
const TIER0 = new Set(['black pepper', 'white pepper', 'peppercorns', 'ginger', 'dijon', 'mustard powder', 'radish', 'mustard greens', 'arugula', 'rocket', 'watercress', 'nasturtium']);
const TIER1_FAINT = new Set(['black pepper', 'white pepper', 'peppercorns', 'ginger', 'dijon', 'mustard powder', 'radish', 'mustard greens', 'arugula', 'rocket', 'watercress', 'nasturtium', 'paprika', 'pimentón', 'pimenton', 'salsa', 'dhal', 'dal', 'tagine', 'chermoula', 'korma', 'dijon', 'garam masala', 'masala', 'tikka', 'tandoori', 'curry', 'curry powder', 'chorizo', 'pepperoni', 'andouille', 'adobo', 'enchilada sauce', 'taco seasoning', 'fajita seasoning', 'gumbo', 'jambalaya', 'peppadew', 'banana pepper', 'banana peppers', 'pepperoncini']);
// Phrases that cancel a hit inside the same line: "chili-free", "no chili", "sweet chili sauce" (sugar, not heat), "chili beans" (canned, mild).
const NEGATE = /\b(no|without|omit|skip|hold the|free of|chile-|chili-|chilli-)\s*(the\s+)?(chili|chilli|chile|heat|spice|hot sauce|pepper flakes)\b|\b(chili|chilli|chile)[- ]free\b|\b(chile|chili|chilli)-?\s*(and|&)\s*[a-z]+-free\b/;
const SWEET = /\bsweet (chili|chilli|chile) (sauce|dipping sauce)\b|\bchili beans\b|\bchilli beans\b|\bchili con queso\b|\bsweet paprika\b|\bsmoked paprika\b|\bbell pepper|\bsweet pepper|\bpepper[s]?, bell\b/;
const PINCH = /\b(pinch|dash|1\/8\s*(teaspoon|tsp)|⅛\s*(teaspoon|tsp)|sprinkle)\b/;
const OPTIONAL = /\(?\boptional\b\)?|\bto taste\b|\bif (you )?like(d)?\b|\bif desired\b/;

const TIERS = [[3, TIER3], [2, TIER2], [1, TIER1]];
const cache = new Map();

function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
const TIER_RES = TIERS.map(([lvl, terms]) => [lvl, terms.map(t => [t, new RegExp(`(^|[^a-zà-ɏ])${esc(t)}(?=$|[^a-zà-ɏ])`, 'i')])]);

function scanLine(line, out, isTitle) {
  let text = String(line || '').toLowerCase();
  if (NEGATE.test(text)) return;
  text = text.replace(SWEET, ' ');
  const optional = OPTIONAL.test(text);
  const pinch = PINCH.test(text);
  let best = 0, bestTerm = null;
  for (const [lvl, res] of TIER_RES) {
    for (const [term, re] of res) {
      if (!re.test(text)) continue;
      let l = lvl;
      if (TIER0.has(term)) continue;                    // a grind of pepper or some ginger is not heat
      if (l === 1 && TIER1_FAINT.has(term)) l = 0.5;   // faint: counts only alongside something warmer
      if (optional && l >= 1) l -= 1;
      if (pinch && l >= 2) l -= 1;                      // a pinch of cayenne is mild, not medium
      if (l > best) { best = l; bestTerm = term; }
    }
    if (best >= lvl) break;   // no lower tier can beat the current best
  }
  if (bestTerm) out.push({ term: bestTerm, level: best, title: !!isTitle });
}

// -> { level: 0|1|2|3, label, terms: [string], estimated: true }
export function recipeHeat(recipe) {
  if (!recipe) return { level: 0, label: SPICE_LABEL[0], terms: [], estimated: true };
  const key = recipe.id || recipe.name;
  if (key && cache.has(key)) return cache.get(key);
  const hits = [];
  scanLine(recipe.name, hits, true);
  for (const ing of recipe.ingredients || []) scanLine(ing.display || ing.food || '', hits, false);
  for (const t of recipe.tags || []) if (t === 'spicy') hits.push({ term: 'tagged spicy', level: 2, title: false });
  let level = 0;
  const strong = hits.filter(h => h.level >= 1);
  const faint = hits.filter(h => h.level > 0 && h.level < 1);
  if (strong.length) {
    level = Math.max(...strong.map(h => h.level));
    // several medium-heat ingredients add up to hot; a title that says spicy on top of medium ingredients too
    if (level === 2 && (strong.filter(h => h.level === 2).length >= 3 || (strong.some(h => h.title) && strong.filter(h => h.level === 2).length >= 2))) level = 3;
  } else if (new Set(faint.map(h => h.term)).size >= 2) {
    level = 1;   // curry powder plus ginger plus paprika: a warm dish, not a hot one
  }
  const terms = [...new Set(strong.concat(level ? faint : []).sort((a, b) => b.level - a.level).map(h => h.term))].slice(0, 5);
  const out = { level, label: SPICE_LABEL[level], terms, estimated: true };
  if (key) cache.set(key, out);
  return out;
}

export function spicePreference(person) {
  const v = person && person.preferences && person.preferences.spice;
  return SPICE_LEVELS.some(l => l.value === v) ? v : 'any';
}

// True when the person's spice preference rules this recipe out entirely.
export function spiceSkipped(recipe, person) {
  const pref = spicePreference(person);
  if (pref === 'any' || pref === 'hot') return false;
  const { level } = recipeHeat(recipe);
  if (pref === 'none') return level >= 1;
  if (pref === 'mild') return level >= 2;
  if (pref === 'medium') return level >= 3;
  return false;
}

// Score nudge (0 when nothing applies) and a reason for "Why this".
export function spiceBonus(recipe, person) {
  const pref = spicePreference(person);
  if (pref === 'any' || pref === 'none') return { bonus: 0, reason: null };
  const { level } = recipeHeat(recipe);
  if (pref === 'hot' && level >= 2) return { bonus: 10, reason: 'has the heat you asked for' };
  if (pref === 'medium' && (level === 1 || level === 2)) return { bonus: 6, reason: 'matches your spice level' };
  if (pref === 'mild' && level === 1) return { bonus: 4, reason: 'mild heat, as you prefer' };
  return { bonus: 0, reason: null };
}

export function spiceResetCache() { cache.clear(); }
