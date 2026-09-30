// Tells a component (a sauce, dressing, stock, dough, spice mix, dip) apart from a meal, from the recipe title.
// Components stay in the recipe library but are never scheduled into a breakfast, lunch, dinner, or snack slot.
// Shared by the importers and by tools/fix-meal-slots.mjs, which re-tags the data files already on disk.
//
// classifyComponent(name) -> 'component' | 'snack' | null (a meal)

// Head nouns that mean "a thing you put on or into food", not food on its own.
const COMPONENT_HEADS = new Set([
  'sauce', 'dressing', 'vinaigrette', 'salsa', 'pesto', 'chutney', 'relish', 'spread', 'marinade', 'stock', 'broth',
  'seasoning', 'rub', 'glaze', 'gravy', 'jam', 'marmalade', 'preserves', 'syrup', 'mayonnaise', 'mayo', 'aioli', 'condiment',
  'tapenade', 'guacamole', 'ketchup', 'catsup', 'mustard', 'paste', 'icing', 'frosting', 'dough', 'pastry', 'crust', 'batter',
  'hummus', 'houmous', 'dip', 'butter', 'beurre', 'ghee', 'oil', 'vinegar', 'brine', 'pickle', 'sofrito', 'mirepoix', 'roux',
  'concentrate', 'extract', 'essence', 'puree', 'purée', 'coulis', 'compote', 'crema', 'raita', 'tzatziki', 'sambal', 'harissa',
  'zhoug', 'chimichurri', 'gremolata', 'dukkah', 'furikake', 'topping', 'filling', 'stuffing', 'starter', 'bouillon', 'demi-glace'
]);
// Whole-phrase rules checked before the head noun. true = component, 'snack' = a snack, false = a meal.
const PHRASE_RULES = [
  [/\b(party|snack|trail|chex|nut|bombay|cereal|puppy chow)\s+mix(es)?$/, 'snack'],
  [/\bice\s+cream$/, 'snack'],
  [/\b(scotch|barley)\s+broth$/, false],   // Scotch broth is a soup, not a stock
  [/\b(fried|baked|battered)\s+pickles?$/, 'snack'],
  [/\b(garam|chaat|tandoori|sambar|rasam|curry|biryani|pav bhaji|kitchen king)\s+masala$/, true],
  [/\b(spice|seasoning|baking|biscuit|pancake|soup|sauce|gravy|cocoa|chili|chilli|taco|burrito|cake|bread|master|magic|muffin|pudding|drink|mulling|curry|rub|sour|onion soup)\s+mix(es)?$/, true],
  [/^master mix\b/, true],
  [/^sauce\s/, true],
  [/\bsalsa\s+(fresca|verde|criolla|roja|cruda|picante|macha)$/, true],
  [/\bsauce\s+(piquante|mornay|espagnole|hollandaise|béarnaise|bearnaise|velouté|veloute|béchamel|bechamel|robert|gribiche|ravigote)$/, true],
  [/\bwhipped\s+cream$/, true],
  [/\b(lemon|lime|orange|passion ?fruit|fruit|raspberry)\s+curd$/, true],
  [/\b(pastry|custard|horseradish|chantilly|salad|sauce)\s+cream$/, true]
];
// Words in the first half of "X and Y <component>" that make the whole thing a dish (biscuits and gravy).
const MEAL_NOUNS = /\b(soup|salad|biscuits?|chips|fries|pasta|spaghetti|linguine|penne|noodles?|rice|sandwich(es)?|toast|eggs?|chicken|fish|meat|meatballs?|potato(es)?|beans|bread|pancakes?|waffles?|burgers?|tacos?|pizza|wraps?|bowl|steak|salmon|tuna|shrimp|prawns?|tofu|veg|vegetables?|yam|plantain|dumplings?|tortillas?|nachos|crackers|celery|carrots?|cucumber|apple|fruit|pit+a)\b/;
// After "<component> with ...": these make it a snack plate rather than a component (hummus with carrot sticks).
const SERVED_WITH = /\b(carrots?|cucumber|celery|pit+as?|bread|breadsticks?|oatcakes?|rice cakes?|chips|crackers|crudit[eé]s|vegetables?|veg|veggies|sticks|fruits?|apples?|pears?|bananas?|toast|crisps|tortillas?|naan|flatbread|wedges|dippers)\b/;
// A title that says the component goes *on* something is a meal (cheese spread on bread).
const SERVED_ON = /\s(on|over|atop)\s/;
// The dish is what comes before the first "with", "in", "for", "made with", "à la"; what follows is the component.
const CUT = /\s(with|w\/|in|for|made with|made from|à la|a la|using|from)\s/;
// Parenthetical descriptions worth trusting when the outer name is a foreign word or two (Toum (Lebanese Garlic Sauce)).
const PAREN_HEADS = new Set(['sauce', 'dip', 'spread', 'dressing', 'chutney', 'relish', 'paste', 'butter', 'condiment', 'seasoning', 'marinade', 'stock', 'broth', 'salsa', 'pesto', 'gravy', 'pickle', 'ketchup', 'mayonnaise', 'vinaigrette']);

function normalize(s) {
  return String(s || '')
    .replace(/\s[-–—]\s.*$/, ' ')                  // "White Sauce - Thin", "Eyeball jellies – Halloween"
    .replace(/\b(i{1,3}|iv|v|vi{0,3})\s*$/i, ' ')    // trailing roman numerals: "Hummus III"
    .replace(/[‘’]/g, "'")
    .replace(/[,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
function headOf(phrase) {
  const words = phrase.replace(/[^a-z'À-ɏ\s-]/g, ' ').trim().split(/\s+/).filter(Boolean);
  return words.length ? words[words.length - 1] : '';
}
function headIsComponent(head) {
  if (!head) return false;
  if (COMPONENT_HEADS.has(head)) return true;
  if (head.endsWith('s') && COMPONENT_HEADS.has(head.slice(0, -1))) return true;   // sauces, pickles, marinades
  return false;
}

// Classifies one phrase (no parentheticals). Returns true (component), 'snack', or false.
function classifyPhrase(phrase) {
  const t = phrase.trim();
  if (!t) return false;
  const m = t.match(CUT);
  const dish = m ? t.slice(0, m.index) : t;
  const rest = m ? t.slice(m.index + m[0].length) : '';
  const cutWord = m ? m[1] : '';
  // "biscuits and gravy", "black bean soup and salsa verde": a dish when the first conjunct names food
  const conj = dish.split(/\s(?:and|&|'n'|n')\s/);
  if (conj.length > 1 && !/\bmix(es)?$/.test(dish) && MEAL_NOUNS.test(conj.slice(0, -1).join(' '))) return false;
  for (const [re, v] of PHRASE_RULES) if (re.test(t)) return v;
  if (SERVED_ON.test(t)) return false;
  const head = headOf(dish);
  if (head === 'cream' || head === 'creams' || head === 'curd' || head === 'curds' || head === 'masala' || head === 'mix' || head === 'mixes') return false;
  if (!headIsComponent(head)) return false;
  // "hummus with carrots and cucumber": a snack plate, not a component
  if ((cutWord === 'with' || cutWord === 'w/') && SERVED_WITH.test(rest)) return 'snack';
  return true;
}

export function classifyComponent(name) {
  const raw = String(name || '');
  const outer = normalize(raw.replace(/\([^)]*\)/g, ' '));
  if (!outer) return null;
  const v = classifyPhrase(outer);
  if (v === true) return 'component';
  if (v === 'snack') return 'snack';
  // Foreign name with an English description in parentheses: trust the description when it is plainly a component.
  const paren = (raw.match(/\(([^)]*)\)/) || [])[1];
  if (paren && outer.split(' ').length <= 3) {
    const p = normalize(paren);
    if (!/^(from|with|using|for|in|à la|a la|recipe|vegan|egg-free|gluten-free|historic|modern|basic)\b/.test(p) && PAREN_HEADS.has(headOf(p)) && !CUT.test(' ' + p) && !SERVED_ON.test(' ' + p + ' ')) return 'component';
  }
  return null;
}

// Breakfast sanity: desserts, party food, and soups that a source filed under breakfast. Returns the corrected meal list.
const NOT_BREAKFAST = /\b(bundt|cake|cobbler|scotcheroos|bites|crisps|dogs|deviled|nibbles|soup|brownies?|fudge|candy|truffles?|jelly|jellies)\b/;
const BREAKFAST_OK = /\b(coffee cake|pancake|breakfast|oat|granola|muffin|scone|bread|bun|roll|egg pie|quiche|frittata|omelet|waffle|crepe|crêpe|porridge|toast|hash)\b/;
export function fixBreakfast(name, meal) {
  const list = Array.isArray(meal) ? meal.slice() : [];
  if (!list.includes('breakfast')) return list;
  const t = String(name || '').toLowerCase();
  if (!NOT_BREAKFAST.test(t) || BREAKFAST_OK.test(t)) return list;
  const out = list.filter(s => s !== 'breakfast');
  if (/\bsoup\b/.test(t)) { if (!out.includes('lunch')) out.push('lunch'); }
  else if (!out.includes('snack')) out.push('snack');
  return out;
}

// Applies both passes to a recipe's meal list. Returns the new list (the same array when nothing changes).
const MAIN_DISH = /\b(spaghetti|pasta|linguine|penne|rigatoni|fettuccine|lasagn[ae]|casserole|stew|curry|chili|risotto|stir[- ]fry|meatloaf|enchiladas?|burritos?)\b/;
export function fixMeal(recipe) {
  const kind = classifyComponent(recipe.name);
  const cur = Array.isArray(recipe.meal) ? recipe.meal : [];
  if (kind === 'component') return cur.length === 1 && cur[0] === 'component' ? recipe.meal : ['component'];
  let meal = cur;
  // tagged as a component by an earlier pass but no longer classified as one: give it a meal again
  if (cur.includes('component')) meal = /\bsoup\b/i.test(recipe.name || '') ? ['lunch'] : ['lunch', 'dinner'];
  if (kind === 'snack') meal = ['snack'];
  let fixed = fixBreakfast(recipe.name, meal);
  if (/\b(popcorn|crisps|nibbles|trail mix)\b/i.test(String(recipe.name || '')) && fixed.some(s => s === 'lunch' || s === 'dinner' || s === 'breakfast')) fixed = ['snack'];
  if (fixed.length === 1 && fixed[0] === 'snack' && MAIN_DISH.test(String(recipe.name || '').toLowerCase())) fixed = ['lunch', 'dinner'];
  const same = fixed.length === (recipe.meal || []).length && fixed.every((s, i) => s === recipe.meal[i]);
  return same ? recipe.meal : fixed;
}
