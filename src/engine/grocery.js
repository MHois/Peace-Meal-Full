// Grocery list from a week plan: sums grams per food across cooked meals, converts to portions when a natural portion exists.
export function buildGroceryList(week, recipesById, foodsById) {
  const need = new Map(); // foodId -> {grams, uses:[recipe names]}
  for (const day of week.days) {
    for (const m of day.meals) {
      if (!m.recipe || m.source === 'leftover') continue;
      const r = recipesById.get(m.recipe);
      if (!r) continue;
      const factor = (m.servingsMade || m.servings || r.servings) / (r.servings || 1);
      for (const ing of r.ingredients || []) {
        // Ingredients that link to a food are summed in grams. Text-only ingredients (imported or pasted recipes whose
        // lines are not linked yet) are listed by name with the recipe's own wording, since amounts cannot be summed.
        const key = ing.food ? ing.food : 'text:' + groceryTextKey(ing.display);
        if (!ing.food && !groceryTextKey(ing.display)) continue;
        const cur = need.get(key) || { grams: 0, uses: new Set(), displays: new Set(), textOnly: !ing.food, lines: [] };
        cur.grams += (Number(ing.grams) || 0) * factor;
        cur.uses.add(r.name);
        if (ing.display) cur.displays.add(ing.display);
        const shown = ing.display && ing.amount_text ? `${ing.display}, ${ing.amount_text}` : ing.display;
        if (!ing.food && ing.display) { const share = groceryShareWords(factor); cur.lines.push(share ? `${shown} (${share}, for ${r.name})` : `${shown} (${r.name})`); }
        need.set(key, cur);
      }
    }
  }
  const items = [];
  for (const [foodId, v] of need) {
    if (v.textOnly) {
      const label = groceryTextLabel([...v.displays][0]);
      if (GROCERY_TAP_WATER.test(label)) continue;   // water from the tap is not shopped for
      items.push({ food: foodId, name: label || groceryTextName(foodId.slice(5)), group: 'From recipe text (check amounts)', grams: 0, quantity: v.lines.join('; '), uses: [...v.uses], displays: [...v.displays], tags: [], textOnly: true });
      continue;
    }
    const food = foodsById.get(foodId);
    const name = food ? (food.short || food.name) : foodId;
    if (food && GROCERY_TAP_WATER.test(food.short || '')) continue;
    const group = food ? food.group : 'Other';
    const portion = food && food.portions ? food.portions.find(p => p.grams && p.grams !== 100 && !/^100 g$/.test(p.label)) : null;
    const quantity = groceryAmountText(v.grams, portion);
    items.push({ food: foodId, name, group, grams: Math.round(v.grams), quantity, uses: [...v.uses], displays: [...v.displays], tags: food ? food.tags : [] });
  }
  items.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  const groups = {};
  for (const it of items) (groups[it.group] ||= []).push(it);
  return { items, groups };
}
// Strip quantities, units, and prep words from an ingredient line so "2 cups chopped onion" and "1 onion, diced" share a key.
const GROCERY_NOISE = /\b(\d+[\d\/.,½¼¾⅓⅔-]*|cups?|tbsps?|tablespoons?|tsps?|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|l|litres?|liters?|cans?|jars?|packages?|pkg|cloves?|slices?|pieces?|pinch|dash|handful|large|medium|small|extra|about|approx\w*|to taste|optional|fresh|frozen|canned|dried|dry|chopped|diced|minced|sliced|cubed|shredded|grated|crushed|rinsed|drained|cooked|raw|peeled|seeded|halved|quartered|trimmed|thawed|softened|melted|divided|packed|heaping|level|thinly|thickly|finely|coarsely|roughly|plus|or|of|and|for|the|a|an)\b/gi;
export function groceryTextKey(display) {
  return String(display || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/\b\d[\d\/.,½¼¾⅓⅔-]*\s*(g|kg|ml|l|oz|lbs?|cups?|tbsps?|tsps?)\b/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(GROCERY_NOISE, ' ').replace(/\s+/g, ' ').trim().replace(/s\b/g, '');
}
function groceryTextName(key) { return key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Ingredient'; }
// roundNice is no longer used by the list (groceryRoundAmount below adds thirds; UX pass, October 2026); kept, not deleted.
function roundNice(n) { if (n < 1) return Math.max(0.25, Math.round(n * 4) / 4); if (n < 10) return Math.round(n * 2) / 2; return Math.round(n); }

// Tap water, from a linked food ("Water, tap") or a recipe line ("1⅓ C water"), is never something to buy.
const GROCERY_TAP_WATER = /^(?:(?:cold|hot|warm|lukewarm|boiling|tap|ice|iced)\s+)?water(?:,\s*tap)?$/i;

// The name shown for a line from recipe text (UX pass, October 2026). It was the grouping key with its first letter
// raised, and the key cuts the last "s" off every word so plurals group together, which showed "Skinles haddock
// fillet", "Seedles grape", "Watercres", and "C couscou" for "1 C couscous". The key is unchanged (ticks and edits are
// saved under it); the name is the recipe's own words, with the amount, size, and preparation taken off.
const GROCERY_LEAD = /^(?:[\d½¼¾⅓⅔⅛⅜⅝⅞.,\/-]+|\d[\d.,\/]*(?:g|kg|ml|l|oz|lbs?)|c|cups?|tbsps?|tablespoons?|tsps?|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|l|litres?|liters?|cans?|tins?|jars?|packages?|packets?|pkg|bunch(?:es)?|cloves?|slices?|pieces?|pinch(?:es)?|dash(?:es)?|handfuls?|sprigs?|sticks?|heads?|large|medium|small|medium-sized?|size|sized|extra|about|approx\w*|half|quarter|third|a|an|of|x)$/i;
export function groceryTextLabel(display) {
  const words = String(display || '').replace(/\([^)]*\)/g, ' ').split(/[,;:]/)[0].trim().split(/\s+/).filter(Boolean);
  while (words.length > 1 && GROCERY_LEAD.test(words[0])) words.shift();
  const t = words.join(' ');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

// How much of a recipe line one week needs, in words: "(a third of this, for Haddock florentine)" instead of
// "(x0.3 for Haddock florentine)". Empty when the week uses the line as written.
export function groceryShareWords(f) {
  if (!(f > 0) || Math.abs(f - 1) < 0.05) return '';
  if (f < 1) {
    if (f < 0.09) return 'a small part of this';
    const steps = [[1 / 8, 'an eighth'], [1 / 4, 'a quarter'], [1 / 3, 'a third'], [1 / 2, 'half'], [2 / 3, 'two thirds'], [3 / 4, 'three quarters'], [1, '']];
    const words = steps.reduce((a, b) => Math.abs(b[0] - f) < Math.abs(a[0] - f) ? b : a)[1];
    return words ? words + ' of this' : '';
  }
  const r = Math.round(f * 4) / 4;
  return r === 1 ? '' : r === 2 ? 'twice this' : `${groceryCount(r)} times this`;
}

// A shopping amount a person reads at a glance (UX pass, October 2026): "1½ cups (330 g)", "¼ onion (20 g)",
// "7½ oz (210 g)", "5 slices (160 g)". It was "1.5 x 1 cup (330 g)", "0.25 x 1 Onion Edible (20 g)", and
// "2.5 x 3 oz (210 g)": the count of portions times the food data's own portion wording.
const GROCERY_UNIT = /^(?:cups?|tbsps?|tablespoons?|tsps?|teaspoons?|oz|fl oz|ounces?|lbs?|pounds?)\b/i;
const GROCERY_NOUNS = new Set(['cup', 'tablespoon', 'teaspoon', 'ounce', 'pound', 'slice', 'fillet', 'piece', 'item', 'link', 'cake', 'sandwich', 'container', 'package', 'packet', 'pita', 'onion', 'pepper', 'bar', 'cube', 'biscuit', 'burrito', 'patty', 'roll', 'can', 'head', 'stalk', 'clove', 'egg', 'frankfurter', 'serving', 'breast', 'leaf', 'spear', 'sheet', 'cracker', 'tortilla', 'muffin', 'bagel', 'bun', 'tomato', 'potato', 'banana', 'apple', 'lemon', 'lime', 'orange', 'avocado', 'carrot', 'unit', 'drumstick', 'thigh', 'wing', 'chop', 'steak', 'strip', 'scoop', 'envelope', 'pod', 'bean', 'bunch', 'sprig', 'ear', 'wedge', 'shell', 'taco', 'jar', 'bottle', 'box', 'bag', 'loaf', 'carton', 'stick', 'fruit', 'pear', 'peach', 'plum', 'kiwi', 'date', 'fig', 'olive', 'nugget', 'waffle', 'pancake', 'cookie', 'cracker']);
function groceryPlural(word) {
  const w = word.toLowerCase();
  if (!GROCERY_NOUNS.has(w)) return word;
  if (w === 'leaf' || w === 'loaf') return word.slice(0, -1) + 'ves';
  if (/(?:ch|sh|x|s)$/.test(w) || w === 'tomato' || w === 'potato') return word + 'es';
  if (/[^aeiou]y$/.test(w)) return word.slice(0, -1) + 'ies';
  return word + 's';
}
// Display rounding: thirds and quarters under 1, halves under 10, whole numbers above (shopping, not weighing).
function groceryRoundAmount(n) {
  if (n < 1) return [1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 1].reduce((a, b) => Math.abs(b - n) < Math.abs(a - n) ? b : a);
  if (n < 10) return Math.round(n * 2) / 2;
  return Math.round(n);
}
function groceryCount(n) {
  const whole = Math.floor(n + 1e-9), frac = n - whole;
  const glyph = [[0, ''], [1 / 4, '¼'], [1 / 3, '⅓'], [1 / 2, '½'], [2 / 3, '⅔'], [3 / 4, '¾']].reduce((a, b) => Math.abs(b[0] - frac) < Math.abs(a[0] - frac) ? b : a)[1];
  return (whole ? String(whole) : glyph ? '' : '0') + glyph;
}
export function groceryAmountText(grams, portion) {
  const g = String(Math.round(grams)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (!portion || !(portion.grams > 0)) return `${g} g`;
  let label = String(portion.label || '').replace(/\s*\((?:\d+\s+)?NLEA[^)]*\)/gi, '').replace(/\s+\d*\s*NLEA serving\b/gi, '').replace(/\bNLEA\s+/gi, '').replace(/\s+Edible\b/g, '').trim();
  let per = 1;
  const lead = label.match(/^(\d+(?:\.\d+)?|\d+\/\d+)\s+(.+)$/);
  if (lead) { per = lead[1].includes('/') ? Number(lead[1].split('/')[0]) / Number(lead[1].split('/')[1]) : Number(lead[1]); label = lead[2]; }
  const serving = label.match(/^serving,?\s+(\d+(?:\.\d+)?|\d+\/\d+)\s+(.+)$/i);   // "1 serving 1/2 cup" is half a cup
  if (serving) { per *= serving[1].includes('/') ? Number(serving[1].split('/')[0]) / Number(serving[1].split('/')[1]) : Number(serving[1]); label = serving[2]; }
  if (GROCERY_UNIT.test(label)) label = label.replace(/\s*\([^)]*\)/g, '').trim();   // "cup (8 fl oz)": the cup says it
  if (!(per > 0)) per = 1;
  const exact = grams / portion.grams * per;
  if (exact < 0.15) return `${g} g`;   // a pinch of a cup-sized portion is clearer in grams than as "¼ cup"
  const amount = groceryRoundAmount(exact);
  if (/^[A-Z][a-z]/.test(label)) label = label.charAt(0).toLowerCase() + label.slice(1);
  if (amount > 1) label = label.replace(/^([A-Za-z]+)/, w => groceryPlural(w));
  return `${groceryCount(amount)} ${label} (${g} g)`;
}

// Apply the shopper's edits to a computed list and record what changed and why.
// adjustments: { [foodId]: { quantity?: string, grams?: number, note?: string, removed?: boolean } }
export function applyAdjustments(list, adjustments = {}) {
  const items = list.items.map(it => {
    const adj = adjustments[it.food];
    if (!adj) return it;
    return { ...it, adjusted: true, quantity: adj.quantity || it.quantity, grams: adj.grams != null ? adj.grams : it.grams, note: adj.note || '', removed: !!adj.removed, original: { quantity: it.quantity, grams: it.grams } };
  });
  const groups = {};
  for (const it of items) (groups[it.group] ||= []).push(it);
  return { items, groups };
}

// Differences between two computed lists (for example after adding a serving to a meal). Each change carries a reason.
export function diffGrocery(prev, next, reason = 'Plan changed') {
  const changes = [];
  const prevBy = new Map((prev ? prev.items : []).map(i => [i.food, i]));
  const nextBy = new Map((next ? next.items : []).map(i => [i.food, i]));
  for (const [food, n] of nextBy) {
    const p = prevBy.get(food);
    if (!p) changes.push({ food, name: n.name, type: 'added', from: null, to: n.quantity, reason });
    else if (Math.abs((p.grams || 0) - (n.grams || 0)) >= 5) changes.push({ food, name: n.name, type: 'changed', from: p.quantity, to: n.quantity, reason });
  }
  for (const [food, p] of prevBy) if (!nextBy.has(food)) changes.push({ food, name: p.name, type: 'removed', from: p.quantity, to: null, reason });
  return changes;
}

// Plain-text rendering for copy, share sheets, and notes apps.
export function groceryText(list, { title = 'Grocery list', changes = [] } = {}) {
  const lines = [title, ''];
  for (const [group, items] of Object.entries(list.groups)) {
    lines.push(group.toUpperCase());
    for (const it of items) if (!it.removed) lines.push(`${it.checked ? '[x]' : '[ ]'} ${it.name}: ${it.quantity}${it.note ? ' (' + it.note + ')' : ''}`);
    lines.push('');
  }
  if (changes.length) { lines.push('CHANGES'); for (const c of changes) lines.push(`- ${c.name}: ${c.type} ${c.from ? 'from ' + c.from + ' ' : ''}${c.to ? 'to ' + c.to : ''}. ${c.reason}`); }
  return lines.join('\n');
}
