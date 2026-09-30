// Cuisine labels for recipes. A recipe's cuisine comes from its source categories when the source has them
// (Wikibooks), otherwise from a conservative keyword guess on the title and ingredient text, marked as a guess.
// Used by the person's "cuisines to skip" and "cuisines you love" preferences.

export const CUISINES = [
  { id: 'american', label: 'American' },
  { id: 'mexican', label: 'Mexican and Tex-Mex' },
  { id: 'italian', label: 'Italian' },
  { id: 'mediterranean', label: 'Mediterranean and Greek' },
  { id: 'middle-eastern', label: 'Middle Eastern' },
  { id: 'indian', label: 'Indian and South Asian' },
  { id: 'thai', label: 'Thai' },
  { id: 'chinese', label: 'Chinese' },
  { id: 'japanese', label: 'Japanese' },
  { id: 'korean', label: 'Korean' },
  { id: 'vietnamese', label: 'Vietnamese' },
  { id: 'southeast-asian', label: 'Other Southeast Asian' },
  { id: 'french', label: 'French' },
  { id: 'spanish', label: 'Spanish and Portuguese' },
  { id: 'british', label: 'British and Irish' },
  { id: 'german', label: 'German and Central European' },
  { id: 'eastern-european', label: 'Eastern European' },
  { id: 'caribbean', label: 'Caribbean' },
  { id: 'latin-american', label: 'Latin American' },
  { id: 'african', label: 'African' },
  { id: 'other', label: 'Other or unlabeled' }
];
export const CUISINE_LABEL = Object.fromEntries(CUISINES.map(c => [c.id, c.label]));

// Source category names (Wikibooks "X recipes" categories and NHS/other tags) -> canonical id.
const CATEGORY_MAP = [
  [/\b(american|southern|cajun|creole|soul food|tex-mex|hawaiian|new england|midwestern|barbecue|bbq)\b/i, 'american'],
  [/\bmexican\b/i, 'mexican'],
  [/\bitalian\b/i, 'italian'],
  [/\b(greek|mediterranean|turkish|cypriot)\b/i, 'mediterranean'],
  [/\b(middle eastern|lebanese|israeli|persian|iranian|arab|syrian|egyptian|moroccan|tunisian|algerian)\b/i, 'middle-eastern'],
  [/\b(indian|pakistani|bangladeshi|sri lankan|nepal(ese|i)|punjabi|bengali|gujarati|south asian)\b/i, 'indian'],
  [/\bthai\b/i, 'thai'],
  [/\b(chinese|cantonese|sichuan|szechuan|hong kong|taiwanese)\b/i, 'chinese'],
  [/\bjapanese\b/i, 'japanese'],
  [/\bkorean\b/i, 'korean'],
  [/\bvietnamese\b/i, 'vietnamese'],
  [/\b(filipino|philippine|indonesian|malaysian|singaporean|burmese|cambodian|laotian)\b/i, 'southeast-asian'],
  [/\bfrench\b/i, 'french'],
  [/\b(spanish|portuguese|basque|catalan)\b/i, 'spanish'],
  [/\b(british|english|scottish|welsh|irish|uk)\b/i, 'british'],
  [/\b(german|austrian|swiss|dutch|belgian|hungarian|czech|polish)\b/i, 'german'],
  [/\b(russian|ukrainian|romanian|bulgarian|serbian|croatian|slovak|lithuanian|georgian)\b/i, 'eastern-european'],
  [/\b(caribbean|jamaican|cuban|puerto rican|trinidadian|haitian|dominican)\b/i, 'caribbean'],
  [/\b(brazilian|peruvian|argentin|chilean|colombian|venezuelan|latin american|south american|central american|guatemalan|salvadoran)\b/i, 'latin-american'],
  [/\b(african|nigerian|ghanaian|ethiopian|eritrean|kenyan|south african|senegalese|west african|east african|swallow)\b/i, 'african']
];

// Keyword guesses from title and ingredient text. Order matters: more specific cuisines first.
const KEYWORD_RULES = [
  ['thai', /\b(thai|pad thai|green curry|red curry|massaman|tom yum|tom kha|galangal|kaffir|thai basil|fish sauce.*lime|lemongrass)\b/i, 2],
  ['vietnamese', /\b(vietnamese|pho\b|banh mi|bánh mì|nuoc cham|rice paper|bun cha)\b/i, 2],
  ['korean', /\b(korean|kimchi|gochujang|gochugaru|bulgogi|bibimbap|japchae|tteok)\b/i, 2],
  ['japanese', /\b(japanese|miso|sushi|teriyaki|ramen|udon|soba|dashi|mirin|tempura|katsu|edamame|nori|wasabi|yakitori|okonomiyaki)\b/i, 2],
  ['chinese', /\b(chinese|stir[- ]fr(y|ied)|hoisin|oyster sauce|szechuan|sichuan|kung pao|lo mein|chow mein|wonton|dumplings?|bok choy|five[- ]spice|char siu|mapo)\b/i, 2],
  ['indian', /\b(indian|curry|garam masala|tikka|tandoori|paneer|dal\b|dhal|daal|naan|chapati|roti|biryani|korma|vindaloo|masala|ghee|cardamom.*cumin|samosa|chana|raita|saag|kofta)\b/i, 2],
  ['mexican', /\b(mexican|taco|tacos|burrito|enchilada|quesadilla|salsa|tortilla|guacamole|jalape[ñn]o|chipotle|fajita|carnitas|pico de gallo|tamale|queso|refried|tomatillo|mole\b|elote|chilaquiles)\b/i, 2],
  ['italian', /\b(italian|pasta|spaghetti|penne|linguine|fettuccine|lasagn[ae]|risotto|parmesan|parmigiano|pesto|marinara|bolognese|carbonara|gnocchi|bruschetta|minestrone|focaccia|ricotta|mozzarella|prosciutto|tiramisu|osso buco|pizza)\b/i, 2],
  ['mediterranean', /\b(greek|mediterranean|feta|tzatziki|hummus|falafel|tabbouleh|pita|olive oil.*lemon|souvlaki|moussaka|spanakopita|dolma|halloumi|orzo)\b/i, 2],
  ['middle-eastern', /\b(middle eastern|lebanese|persian|moroccan|tagine|harissa|za'?atar|sumac|shawarma|baba ghanoush|couscous|kebab|kofta|labneh|ras el hanout)\b/i, 2],
  ['french', /\b(french|ratatouille|coq au vin|bourguignon|quiche|crêpe|crepe|béchamel|bechamel|gratin|cassoulet|bouillabaisse|niçoise|nicoise|brioche|soufflé|souffle|provençal|provencal|confit)\b/i, 2],
  ['spanish', /\b(spanish|paella|tapas|chorizo|gazpacho|tortilla española|portuguese|piri piri|romesco|patatas bravas)\b/i, 2],
  ['british', /\b(british|english|scottish|irish|welsh|shepherd'?s pie|cottage pie|bangers|yorkshire pudding|scone|crumpet|trifle|ploughman|toad in the hole|colcannon|cornish|fish and chips|victoria sponge|eton mess)\b/i, 2],
  ['german', /\b(german|austrian|schnitzel|sauerkraut|bratwurst|spaetzle|spätzle|strudel|pretzel|goulash|gulasch|dutch|belgian|hungarian|polish|pierogi|kielbasa)\b/i, 2],
  ['eastern-european', /\b(russian|ukrainian|borscht|borsch|pelmeni|blini|stroganoff|romanian|bulgarian|georgian|khachapuri)\b/i, 2],
  ['caribbean', /\b(caribbean|jamaican|jerk|cuban|plantain|callaloo|ackee|puerto rican|mofongo|sofrito|haitian)\b/i, 2],
  ['latin-american', /\b(brazilian|peruvian|argentin|chimichurri|empanada|arepa|ceviche|feijoada|pupusa|colombian|venezuelan|churrasco)\b/i, 2],
  ['african', /\b(african|nigerian|jollof|egusi|ethiopian|injera|berbere|doro wat|suya|fufu|ghanaian|kenyan|south african|bobotie|peri[- ]peri|moin moin|efo|ogbono|pepper soup|akara|puff puff)\b/i, 2],
  ['southeast-asian', /\b(filipino|adobo|sinigang|pancit|lumpia|indonesian|nasi goreng|rendang|satay|sate|malaysian|laksa|singapore)\b/i, 2],
  ['american', /\b(american|burger|hamburger|cheeseburger|meatloaf|mac and cheese|macaroni and cheese|barbecue|bbq|pulled pork|coleslaw|cornbread|biscuits and gravy|grits|jambalaya|gumbo|chowder|clam|sloppy joe|buffalo|ranch dressing|pot roast|casserole|pancakes?|waffles?|brownies?|chocolate chip cookies?|apple pie|pumpkin pie|thanksgiving|sheet[- ]pan|slow[- ]cooker|crock ?pot|tater tot|hot dog|philly|cobb salad|caesar salad|banana bread)\b/i, 1]
];

function textOf(recipe) {
  return [recipe.name || '', ...(recipe.ingredients || []).map(i => i.display || '')].join(' | ');
}

// Returns { id, label, source: 'category' | 'guess' | 'none' }
export function classifyCuisine(recipe) {
  if (recipe.cuisine_id && CUISINE_LABEL[recipe.cuisine_id]) return { id: recipe.cuisine_id, label: CUISINE_LABEL[recipe.cuisine_id], source: recipe.cuisine_source || 'category' };
  const cats = [recipe.cuisine || '', ...(recipe.wikibooks_categories || [])].filter(Boolean);
  for (const c of cats) for (const [re, id] of CATEGORY_MAP) if (re.test(c)) return { id, label: CUISINE_LABEL[id], source: 'category' };
  const t = textOf(recipe);
  let best = null;
  for (const [id, re, weight] of KEYWORD_RULES) {
    const m = t.match(new RegExp(re.source, 'gi'));
    if (!m) continue;
    const score = m.length * weight + (re.test(recipe.name || '') ? 2 : 0);
    if (!best || score > best.score) best = { id, score };
  }
  if (best) return { id: best.id, label: CUISINE_LABEL[best.id], source: 'guess' };
  if (recipe.source === 'NHS website') return { id: 'british', label: CUISINE_LABEL.british, source: 'guess' };
  return { id: 'other', label: CUISINE_LABEL.other, source: 'none' };
}

export function annotateCuisines(recipes) {
  for (const r of recipes) { const c = classifyCuisine(r); r.cuisine_id = c.id; r.cuisine_label = c.label; r.cuisine_source = c.source; }
  return recipes;
}

// Person preference helpers
export function cuisineSkipped(recipe, person) {
  const skip = (person && person.preferences && person.preferences.cuisines_skip) || [];
  if (!skip.length) return false;
  const id = recipe.cuisine_id || classifyCuisine(recipe).id;
  return skip.includes(id);
}
export function cuisineLoved(recipe, person) {
  const love = (person && person.preferences && person.preferences.cuisines_love) || [];
  if (!love.length) return false;
  const id = recipe.cuisine_id || classifyCuisine(recipe).id;
  return love.includes(id);
}
