#!/usr/bin/env node
// tools/expand-selection.mjs
//
// Expands tools/food-selection.json from the USDA SR Legacy food list.
// Every existing entry is kept byte-for-byte (tags, fill_from, notes, order).
// New entries are appended with tags: [] and an `auto` block that records the
// SR Legacy category, description and the rule that selected them; tags are
// assigned afterwards by tools/food-autotag.mjs.
//
// Usage:   node tools/expand-selection.mjs [--dry] [--list] [--cap N]
//   --dry    print counts, do not write
//   --list   print every selected description per category
//   --cap N  maximum total entries (default 2150). When exceeded, tier-2
//            (less common) entries are dropped, largest categories first.
//
// Selection rules (from the expansion brief):
//   Spices and Herbs: every entry.
//   Vegetables, Fruits, Legumes, Nuts/Seeds, Cereal Grains: raw, plain cooked
//     ("cooked, boiled, drained, without salt"; "cooked" for grains/pasta),
//     canned plain, frozen unprepared. "with salt" twins, baby food, restaurant,
//     brands, dehydrated/powdered oddities and uncommon juices are excluded.
//   Dairy and Egg: plain milks, yogurts, common cheeses, cream, butter, eggs.
//   Poultry, Beef, Pork, Lamb/Veal, Finfish/Shellfish: common cuts, raw plus
//     one plain cooked form; no separable fat, exotic game or odd cuts.
//   Everything else: a curated slice (breads, tortillas, crackers, common
//     cereals, snacks, sweets, beverages, condiments, broths, soups, oils,
//     deli meats, a few generic fast foods and frozen meals).
//
// Re-running is idempotent: entries this script added earlier (marked `auto`)
// are refreshed; their tags and tag_review are preserved when the food is
// selected again and dropped when it no longer is. Hand-written entries are
// never touched.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELECTION_PATH = path.join(ROOT, 'tools', 'food-selection.json');
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const LIST = argv.includes('--list');
const capIdx = argv.indexOf('--cap');
const explainIdx = argv.indexOf('--explain');
const EXPLAIN = explainIdx >= 0 ? new RegExp(argv[explainIdx + 1], 'i') : null;
const CAP = capIdx >= 0 ? Number(argv[capIdx + 1]) : 2150;

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

function parseCSV(text, onRow) {
  const len = text.length;
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < len) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\n') { row.push(field); onRow(row); row = []; field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    field += c; i++;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); onRow(row); }
}

function readCSV(file, onRow) {
  let header = null;
  parseCSV(fs.readFileSync(file, 'utf8'), (fields) => {
    if (!header) { header = fields.map((h) => h.trim()); return; }
    if (fields.length === 1 && fields[0] === '') return;
    const rec = {};
    header.forEach((h, i) => { rec[h] = fields[i]; });
    onRow(rec);
  });
}

function findSrDir() {
  const base = path.join(ROOT, 'tools', 'usda', 'sr_legacy');
  const candidates = [base, ...fs.readdirSync(base).map((d) => path.join(base, d))]
    .filter((d) => fs.existsSync(path.join(d, 'food.csv')) && fs.existsSync(path.join(d, 'food_category.csv')));
  if (!candidates.length) throw new Error(`No food.csv under ${base}`);
  return candidates.sort()[0];
}

// ---------------------------------------------------------------------------
// Load SR Legacy foods
// ---------------------------------------------------------------------------

const SR_DIR = findSrDir();
const categories = new Map();
readCSV(path.join(SR_DIR, 'food_category.csv'), (r) => categories.set(r.id, r.description));
const FDP = /\s*\(Includes foods for USDA's Food Distribution Program\)/i;
const allFoods = [];
readCSV(path.join(SR_DIR, 'food.csv'), (r) => {
  if (r.data_type !== 'sr_legacy_food') return;
  const raw = r.description.trim();
  allFoods.push({ fdcId: Number(r.fdc_id), raw, desc: raw.replace(FDP, '').replace(/\s+/g, ' ').trim(), cat: categories.get(r.food_category_id) || '' });
});
const byCat = new Map();
for (const f of allFoods) { if (!byCat.has(f.cat)) byCat.set(f.cat, []); byCat.get(f.cat).push(f); }
for (const list of byCat.values()) list.sort((a, b) => a.desc.localeCompare(b.desc));

// ---------------------------------------------------------------------------
// Existing selection
// ---------------------------------------------------------------------------

const selection = JSON.parse(fs.readFileSync(SELECTION_PATH, 'utf8'));
if (!Array.isArray(selection)) throw new Error('tools/food-selection.json must be an array');
const manual = selection.filter((e) => !e.auto);
const previousAuto = new Map(selection.filter((e) => e.auto).map((e) => [e.fdcId, e]));
const manualIds = new Set(manual.map((e) => e.fdcId));
// SR Legacy records used only to fill a Foundation record are the SR twin of a
// food that is already in the list; adding them again would duplicate the food.
const fillIds = new Set(manual.filter((e) => e.fill_from).map((e) => Number(e.fill_from)));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const re = (s, flags = 'i') => new RegExp(s, flags);
const any = (s, list) => list.some((r) => r.test(s));

// Brand detection: a run of 3+ capitals (not a known acronym) or a known
// Title-Case brand name (case-sensitive so "equal volume" is not EQUAL).
const CAPS_OK = new Set(['BBQ', 'USDA', 'UV', 'DHA', 'HVP', 'NFSMI', 'KAMUT', 'EMI', 'TSUNOMATA', 'NY', 'RTS']);
const TITLE_BRANDS = /\b(Oscar Mayer|Hormel|Pillsbury|Bimbo|Campbell|Heinz|Kraft|Chobani|Dannon|Silk|Breyers|Quaker|Kellogg|General Mills|Nestle|Lifeway|Zespri|Bolthouse|Naked Juice|Odwalla|Tinkyada|Ancient Harvest|De Boles|Uncle Ben|Mori-Nu|House Foods|Vitasoy|Nasoya|Azumaya|Healthy Choice|Swanson|Bull's-Eye|Sweet Baby Ray|Open Pit|KC Masterpiece|Buitoni|Classico|Mezzetta|Texas Pete|Tuong Ot|Tostitos|Hungry Man|Banquet|Jimmy Dean|Hot Pockets|Lean Pockets|Rice-A-Roni|Smart Balance|Benecol|Smart Beat|Canola Harvest|Enova|Natreon|Real Lemon|Dasani|Coca-Cola|Muscle Milk|Reddi Wip|Cheez Whiz|Velveeta|Breakstone|Kretschmer|Sun Country|Health Valley|Malt-O-Meal|Mom's Best|Nature's Path|Ralston|Ocean Spray|Wendy's|McDonald|Burger King|Taco Bell|Pizza Hut|Domino|Papa John|Subway|Starbucks|Dunkin|Digiorno|Red Baron|Tombstone|Totino|Stouffer|Lean Cuisine|Marie Callender|Amy's|Planters|Chosen Roaster|Ensure|Slimfast|Gatorade|Powerade|Red Bull|Rockstar|Snapple|Lipton|Nescafe|Folgers|Maxwell House|Hershey|Swiss Miss|Ovaltine|Minute Maid|Tropicana|Welch|Sunny Delight|Capri Sun|Kool-Aid|Crystal Light|Country Time|Budweiser|Bud Light|Nabisco|Keebler|Pepperidge|Archway|Sara Lee|Oroweat|Krusteaz|Aunt Jemima|Eggo|Kashi|Nature Valley|Frito|Lay's|Doritos|Cheetos|Rold Gold|Snyder|Orville|Pop Secret|Act II|Jolly Time|Smartfood|Popcorners|Cascadian|Bear Naked|Weetabix|Uncle Sam|Familia|Sunbelt|Glutino|Udi|Ener-G|Rudi|Schar|Little Debbie|Hostess|Entenmann|Tastykake|Betty Crocker|Duncan Hines|Krispy Kreme|Martin's|Nature's Own|Dave's|M&M|Reese|Snickers|Kit Kat|Twix|Ghirardelli|Jell-O|Splenda|Sweet'N Low|Truvia|Kikkoman|La Choy|Goya|Van Camp|Progresso|Prego|Ragu|Hunt's|Del Monte|Green Giant|Birds Eye|Ore-Ida|Tyson|Perdue|Butterball|Applegate|Boar's Head|Hebrew National|Ball Park|Johnsonville|Bob Evans|Land O Lakes|Philadelphia|Sargento|Tillamook|Cabot|Kerrygold|Yoplait|Stonyfield|Fage|Oikos|Activia|Horizon|Organic Valley|Lactaid|Almond Breeze|So Delicious|Califia|Oatly|Bimbo Bakeries|Panque Casero|Cure 81|Always Tender|Pillow Pak|Gamesa|La Moderna|Cytosport|Pepsico)\b/;
function isBranded(desc) {
  if (TITLE_BRANDS.test(desc)) return true;
  const caps = desc.match(/\b[A-Z][A-Z'&.\-]{2,}\b/g) || [];
  return caps.some((w) => !CAPS_OK.has(w.replace(/[^A-Z]/g, '')));
}

const GLOBAL_EXCLUDE = [
  /restaurant/i, /baby food/i, /industrial/i, /\bimitation\b/i, /\bsubstitute/i, /quality control/i,
  /exposed to ultraviolet/i, /with added solution/i, /\benhanced\b/i, /composite of trimmed/i,
  /\bcarcass\b/i, /mechanically separated/i, /\bimported\b/i, /wagyu/i, /grass-fed/i, /microwaved?/i,
];

// "with salt" entries are dropped when a "without salt" / "no salt added" twin exists.
function saltKey(desc) {
  return desc.toLowerCase()
    .replace(/,?\s*(with|without) salt(?: added)?/g, '')
    .replace(/,?\s*no salt added/g, '')
    .replace(/,?\s*salt added in processing/g, '')
    .replace(/,?\s*salt not added in processing/g, '')
    .replace(/\s+/g, ' ').replace(/,\s*,/g, ',').trim();
}
function dropSaltTwins(list, keep) {
  const keys = new Map();
  for (const f of list) { const k = saltKey(f.desc); if (!keys.has(k)) keys.set(k, []); keys.get(k).push(f); }
  return list.filter((f) => {
    if (!/with salt|salt added in processing/i.test(f.desc)) return true;
    if (keep && keep.test(f.desc)) return true;
    return !keys.get(saltKey(f.desc)).some((g) => g !== f && /without salt|no salt added|salt not added/i.test(g.desc));
  });
}

// Generic rule runner. `include` is a list of {re, tier, why, unless, force};
// the first matching include wins; anything matching an exclude is skipped
// unless the include is marked `force`. `keepSaltTwins` is true or a regex of
// foods whose salted twin is a distinct product (salted nuts, for example).
function select(list, { include, exclude = [], allowBrands = false, keepSaltTwins = false }) {
  const out = [];
  const pool = keepSaltTwins === true ? list : dropSaltTwins(list, keepSaltTwins || null);
  const poolIds = new Set(pool.map((f) => f.fdcId));
  const explain = (f, msg) => { if (EXPLAIN && EXPLAIN.test(f.desc)) console.log(`  [${f.cat}] ${f.fdcId} ${f.desc}\n      -> ${msg}`); };
  if (EXPLAIN) for (const f of list) if (!poolIds.has(f.fdcId)) explain(f, 'dropped: "with salt" twin of a "without salt" record');
  for (const f of pool) {
    const d = f.desc;
    const forced = include.find((r) => r.force && r.re.test(d) && !(r.unless && r.unless.test(d)));
    if (forced) { out.push({ food: f, tier: forced.tier || 1, why: forced.why }); explain(f, `selected (forced): ${forced.why}`); continue; }
    const g = GLOBAL_EXCLUDE.find((r) => r.test(d));
    if (g) { explain(f, `global exclude ${g}`); continue; }
    if (!allowBrands && isBranded(d)) { explain(f, 'branded'); continue; }
    const x = exclude.find((r) => r.test(d));
    if (x) { explain(f, `category exclude ${String(x).slice(0, 80)}...`); continue; }
    const rule = include.find((r) => r.re.test(d) && !(r.unless && r.unless.test(d)));
    if (!rule) { explain(f, 'no include rule matched'); continue; }
    out.push({ food: f, tier: rule.tier || 1, why: rule.why });
    explain(f, `selected: ${rule.why}`);
  }
  return out;
}

// Meat cut picker: for each cut spec choose the best raw record and the best
// plain cooked record among "separable lean and fat" (what a shopper buys).
// If the best record is already in the hand-written selection the slot is
// left alone rather than filled with a second-choice cooking method.
const GRADE_RANK = (d) => (/all grades/i.test(d) ? 0 : /\bchoice\b/i.test(d) ? 1 : /\bselect\b/i.test(d) ? 2 : /\bprime\b/i.test(d) ? 3 : 0);
const TRIM_RANK = (d) => (/trimmed to 0"/i.test(d) ? 0 : /trimmed to 1\/8"/i.test(d) ? 1 : /trimmed to 1\/4"/i.test(d) ? 2 : /trimmed to 1\/2"/i.test(d) ? 3 : 0);
const DEFAULT_METHODS = ['roasted', 'broiled', 'grilled', 'baked', 'braised', 'pan-broiled', 'pan-broil', 'simmered', 'stewed', 'cooked'];
const TAKEN = new Set([...manualIds, ...fillIds]);
function pickCuts(list, specs, { tier = 1, why = 'common cut' } = {}) {
  const out = [];
  for (const spec of specs) {
    const methods = spec.methods || DEFAULT_METHODS;
    const cands = list.filter((f) => spec.re.test(f.desc)
      && !any(f.desc, GLOBAL_EXCLUDE) && !isBranded(f.desc)
      && !/separable fat/i.test(f.desc)
      && (spec.lean === 'any' ? true : spec.lean === 'only' ? /lean only/i.test(f.desc) : !/lean only/i.test(f.desc))
      && !(spec.exclude && spec.exclude.test(f.desc))
      && (spec.allowFried || !/fried|breaded|batter|loaf|crumbles/i.test(f.desc)));
    const isRaw = (d) => /\braw\b|unheated|unprepared|uncooked/i.test(d) && !/cooked,|, cooked/i.test(d);
    const rank = (d) => GRADE_RANK(d) * 10 + TRIM_RANK(d) + (/\bboneless\b/i.test(d) ? 0 : 0.5);
    const raws = cands.filter((f) => isRaw(f.desc)).sort((a, b) => rank(a.desc) - rank(b.desc));
    const methodRank = (d) => { const i = methods.findIndex((m) => new RegExp(`\\b${m}\\b`, 'i').test(d)); return i < 0 ? 99 : i; };
    // A spec with raw:false describes a ready-to-eat product (rotisserie, canned); every non-raw record counts as its cooked form.
    const cooked = cands.filter((f) => !isRaw(f.desc) && (spec.raw === false || /cooked|roasted|broiled|grilled|braised|baked|heated|pan-broil|stewed|simmered|canned/i.test(f.desc)))
      .filter((f) => spec.raw === false || methodRank(f.desc) < 99 || /canned/i.test(f.desc))
      .sort((a, b) => methodRank(a.desc) - methodRank(b.desc) || rank(a.desc) - rank(b.desc));
    const chosen = [];
    if (raws.length && spec.raw !== false && !TAKEN.has(raws[0].fdcId)) chosen.push(raws[0]);
    if (cooked.length && spec.cooked !== false && !TAKEN.has(cooked[0].fdcId)) chosen.push(cooked[0]);
    if (!raws.length && !cooked.length && LIST) console.log(`   (no match for cut ${spec.re})`);
    for (const f of chosen) out.push({ food: f, tier: spec.tier || tier, why: spec.why || why });
  }
  return out;
}
// Same cut specs again, but the "separable lean only" record as a tier-2 twin.
const leanOnly = (specs) => specs.filter((s) => !s.lean).map((s) => ({ ...s, re: new RegExp(s.re.source.replace(/separable lean and fat/g, 'separable lean only'), 'i'), lean: 'only', tier: 2, why: `${s.why}, lean only` }));

// ---------------------------------------------------------------------------
// Category rules
// ---------------------------------------------------------------------------

const RULES = {};

RULES['Spices and Herbs'] = (list) => select(list, {
  include: [{ re: /./, why: 'every spice and herb' }],
  allowBrands: true,
});

const PRODUCE_EXCLUDE = [
  /dehydrated|freeze-dried|powder|\bflour\b|\bflakes\b|low.moisture/i,
  /home-prepared|home prepared|prepared from recipe|dry mix|souffle|pudding|pancakes|puffs|au gratin|scalloped|salad|candied|casserole/i,
  /juice/i, /nectar|smoothie|blend/i, /\bpickled\b/i,
  /breaded|par fried|fried|sauteed|stir-fried|glazed|syrup pack|heavy syrup|extra light syrup|extra heavy syrup|water pack|sweetened|with sugar|stewed|cooked, microwave|microwave/i,
  /leafy tips|young pods|leaves|flowers|shoots|skin only|skin, with|skin, without|\bskin$/i,
  /seasoned|with cream|cream style|brine pack|vacuum pack|rinsed|all styles|drained solids, unprepared|packed in oil|with green chilies|spanish style|with herbs|with mushrooms|with onions|tidbits|tomato products, canned, sauce, with/i,
];
const VEG_EXCLUDE = PRODUCE_EXCLUDE.filter((r) => !/pickled/.test(r.source));
const FRUIT_EXCLUDE = PRODUCE_EXCLUDE.filter((r) => !/juice|sweetened|syrup|leafy tips/.test(r.source));
const EXOTIC_VEG = /arrowhead|arrowroot|balsam|borage|butterbur|cardoon|celtuce|chicory roots|chrysanthemum|cornsalad|\bdock\b|drumstick|epazote|eppaw|fireweed|hyacinth|jew's ear|jute|lambsquarters|malabar|mountain yam|pepeao|pokeberry|purslane|salsify|sesbania|tree fern|water convolvulus|waxgourd|winged bean|yautia|gourd|vinespinach|fungi|cloud ears|kanpyo|agar|irishmoss|emi-tsunomata|poi\b|pigeonpeas|radish seeds|kidney, mature seeds, sprouted|navy, mature seeds, sprouted|pinto, mature seeds, sprouted|peas, mature seeds, sprouted|lentils, sprouted|soybeans, mature seeds, sprouted|broadbeans|cowpeas, leafy|yardlong|amaranth leaves|beans, fava, in pod|beans, shellie|jerusalem|burdock|mustard spinach|new zealand spinach|cress|radishes, oriental|radishes, hawaiian|radishes, white icicle|waterchestnuts, chinese, \(matai\)|welsh|young green, tops|yeast extract|corn with red|pimento|chives, freeze|onions, canned|cabbage, japanese|cabbage, mustard|cabbage, common|cabbage, napa|beets, harvard|tomato powder|carrot juice|bolthouse|winter, all varieties|summer, all varieties|zucchini, baby|zucchini, italian|pumpkin pie mix|potato flour|sweet potato puffs|french fried, (cottage|cross|crinkle|shoestring|steak|wedge)|par fried|o'brien|potatoes, roasted|yellow fleshed|potatoes, mashed, (dehydrated, (flakes|granules)|prepared from granules|ready)|potatoes, canned, solids|boiled, cooked in skin, skin|baked, skin|raw, skin|frozen, whole|potato wedges|beans, snap, green, frozen, all styles|mushrooms, straw|mushrooms, shiitake, stir|mushroom, white, exposed|peppers, hot chile, sun|peppers, hungarian|peppers, pasilla|escarole/i;

RULES['Vegetables and Vegetable Products'] = (list) => select(list, {
  exclude: [...VEG_EXCLUDE, EXOTIC_VEG],
  include: [
    { re: /^(Tomato juice, canned, (with|without) salt|Vegetable juice cocktail, canned|Tomato and vegetable juice, low sodium)/i, force: true, why: 'common juice' },
    { re: /^Catsup/i, why: 'ketchup' },
    { re: /^(Pickles, cucumber, (dill|sweet|sour)|Pickle relish, (sweet|hamburger|hot dog)|Sauerkraut|Cabbage, kimchi|Beets, pickled|Peppers, jalapeno, canned|Peppers, hot pickled|Ginger root, pickled|Eggplant, pickled|Olives)/i, force: true, why: 'common pickled or fermented vegetable' },
    { re: /^(Tomatoes, sun-dried|Mushrooms, shiitake, dried|Peppers, ancho, dried|Tomato products, canned, (paste|puree)|Tomato products, canned, sauce$|Tomato sauce, canned|Tomatoes, crushed|Tomatoes, red, ripe, canned|Tomatoes, red, ripe, cooked)/i, force: true, why: 'pantry tomato or dried vegetable' },
    { re: /^Tomato products, canned, sauce, with (mushrooms|onions|herbs)/i, force: true, tier: 2, why: 'pantry tomato' },
    { re: /^(Potatoes, (french fried, all types|hash brown, (frozen, plain|home)|mashed, home-prepared, whole milk and butter|mashed, dehydrated, prepared from flakes without milk, whole milk and butter|au gratin, home-prepared from recipe using butter|scalloped, home-prepared with butter)|Potato salad, home-prepared|Sweet potato, cooked, candied|Onions, yellow, sauteed|Peppers, sweet, (green|red), sauteed|Mushrooms, white, stir-fried|Onion rings, breaded, par fried, frozen, prepared|Corn pudding|Spinach souffle|Potato pancakes|Potato puffs, frozen, oven-heated)/i, unless: /as purchased|pan fried|whole milk added$|margarine/i, force: true, tier: 2, why: 'common prepared vegetable dish' },
    { re: /\braw$/i, why: 'raw' },
    { re: /raw,? (unprepared|with skin|without skin|year round|flesh and skin)|flesh and skin, raw|, raw,/i, why: 'raw' },
    { re: /cooked, boiled, drained,? (without salt|no salt)|cooked, boiled, without salt|cooked, boiled, mashed, without salt|cooked, baked, without salt|baked, without salt|cooked, steamed, without salt|cooked, without salt|cooked, boiled, drained, or baked, without salt|cooked, no salt added/i, why: 'plain cooked' },
    { re: /cooked, boiled, drained$|cooked, boiled, without skin$|, cooked$|, grilled$|flesh and skin, baked$|boiled, cooked (in|without) skin, flesh, without salt|baked, flesh, without salt|cooked, baked in skin, flesh, without salt/i, why: 'plain cooked' },
    { re: /canned, no salt added|canned, without salt|canned, regular pack|canned, drained solids|canned, solids and liquids|canned, (mashed|vacuum pack)|canned$|canned, with salt|canned, syrup pack, drained/i, unless: /(sweet potato, canned, syrup pack, solids|with pork)/i, why: 'canned plain' },
    { re: /frozen, (unprepared|chopped, unprepared|spears, unprepared|whole, unprepared|kernels.*unprepared|baby, unprepared|fordhook, unprepared)|frozen, unprepared/i, why: 'frozen unprepared' },
    { re: /frozen,.*(cooked, boiled, drained,? without salt|cooked, boiled, without salt|cooked, baked, without salt|boiled, drained, without salt)/i, tier: 2, why: 'frozen, plain cooked' },
    { re: /^Edamame, frozen, prepared/i, why: 'plain cooked' },
    { re: /^(Taro|Lotus root|Nopales|Chayote|Cassava|Yam|Yambean|Seaweed)/i, tier: 2, why: 'less common vegetable' },
  ],
});

const EXOTIC_FRUIT = /abiyuch|acerola|carissa|cherimoya|custard-apple|durian|elderberries|feijoa|groundcherries|guavas, strawberry|horned melon|java-plum|jujube|loquats|mammy|mangosteen|mulberries|nance|naranjilla|oheloberries|pitanga|prickly|pummelo|quinces|rose-apples|roselle|rowal|sapodilla|sapote|soursop|sugar-apples|tamarind|longans|breadfruit|crabapples|baobab|maraschino|melon balls|candied|persimmons, (japanese, dried|native)|litchis, dried|bananas, dehydrated|goji|passion-fruit juice|peel, raw|avocados, raw, florida|grapefruit, raw, (pink and red, (california|florida)|white, (california|florida))|oranges, raw, (florida|california|with peel)|pineapple, raw, (extra sweet|traditional)|grapes, (american|muscadine)|apples, raw, without skin, cooked|plantains, (green, fried|yellow, fried)|cherries, sour, canned, water pack, drained|blueberries, (wild, canned|canned, light syrup, drained)|boysenberries|loganberries|raspberries, (puree|canned)|strawberries, canned|peaches, spiced|pears, canned, heavy syrup, drained|plums, canned, heavy syrup, drained|fruit cocktail, canned, heavy syrup, drained|papaya, canned|pineapple, canned, juice pack, drained|jackfruit, canned|rambutan|figs, canned, extra|prunes, (canned|dehydrated)|prune puree|guava sauce|cranberry-orange|cranberry sauce, (jellied|whole)|orange-grapefruit|orange pineapple|ruby red|juice, apple and grape|juice, apple, grape|grapefruit juice|pineapple juice|blackberry juice|cherry juice|pomegranate juice|prune juice|raspberry juice|tangerine juice|acerola juice|apple juice, frozen concentrate, unsweetened, undiluted|orange juice, frozen concentrate, unsweetened, undiluted|orange juice, chilled, includes from concentrate, with added calcium and vitamin|orange juice, frozen concentrate, unsweetened, diluted with 3 volume water, with added calcium|apple juice, canned or bottled, unsweetened, with added ascorbic acid, calcium|grape juice, canned or bottled, unsweetened, with added ascorbic acid and calcium|cranberry juice blend|lemon juice from concentrate, bottled, (concord|real lemon)|tangerines, \(mandarin oranges\), canned, juice pack, drained|grapes, canned|gooseberries, canned|apricots, canned, (extra|heavy syrup pack, without|water pack, without|heavy syrup, drained)|cherries, sweet, canned, (extra|pitted, heavy syrup, drained)|peaches, canned, (extra heavy|heavy syrup, drained)|pears, canned, extra|pineapple, canned, extra|plums, canned, purple, extra|fruit cocktail, .*extra heavy|dates, deglet/i;

RULES['Fruits and Fruit Juices'] = (list) => select(list, {
  exclude: [...FRUIT_EXCLUDE, EXOTIC_FRUIT, /dehydrated|low-moisture|stewed|sulfured, stewed|with added sugar/i],
  include: [
    { re: /^(Orange juice, (raw|chilled, includes from concentrate$|chilled, includes from concentrate, with added calcium$|canned, unsweetened|frozen concentrate, unsweetened, diluted with 3 volume water$)|Apple juice, (canned or bottled, unsweetened|frozen concentrate, unsweetened, diluted)|Grape juice, canned or bottled, unsweetened|Cranberry juice, unsweetened|Lemon juice|Lime juice)/i, force: true, why: 'common juice (lemon and lime as cooking ingredients)' },
    { re: /\braw$|\braw, (with|without) skin|raw, .*(varieties|all areas|navels|fuji|gala|golden|granny|red delicious|bartlett|bosc|anjou)|raw or frozen|raw, purple/i, why: 'raw' },
    { re: /dried, sulfured, uncooked|dried, uncooked|dried, sweetened|^Dates|^Raisins|^Currants, zante|^Figs, dried|^Plums, dried \(prunes\), uncooked|^Mango, dried|^Blueberries, dried|^Litchis, raw|^Apples, dried, sulfured, uncooked/i, why: 'dried fruit' },
    { re: /canned, (juice pack|light syrup pack|light syrup|heavy syrup pack|heavy syrup)|canned, (sweetened|unsweetened)|^Cranberry sauce, canned|^Olives, (pickled|ripe)|^Pineapple, canned|^Applesauce|^Tangerines, \(mandarin oranges\), canned/i, unless: /with added ascorbic acid$|with salt$|drained/i, why: 'canned' },
    { re: /canned, (water pack|extra light syrup)/i, tier: 2, why: 'canned, water or extra light syrup' },
    { re: /frozen, unsweetened|frozen, uncooked|wild, frozen|^Cherries, sour, red, frozen|^Melon/i, why: 'frozen unsweetened' },
    { re: /frozen, (sweetened|sliced, sweetened|chunks, sweetened)|frozen, red, sweetened|frozen, unsweetened, (heated|unheated)/i, tier: 2, why: 'frozen sweetened' },
    { re: /^Plantains, (green, boiled|yellow, baked)|^Rhubarb/i, why: 'plain cooked' },
    { re: /nectar, canned(, with added ascorbic acid)?$|^Apples, canned, sweetened|^Prune juice|^Pineapple juice, canned or bottled, unsweetened, without|^Pomegranate juice|^Cherry juice, tart|^Grapefruit juice, white, canned or bottled, unsweetened/i, force: true, tier: 2, why: 'less common juice or nectar' },
  ],
});

RULES['Legumes and Legume Products'] = (list) => select(list, {
  keepSaltTwins: /^Peanuts/i,
  exclude: [
    /meatless bacon bits|bacon bits/i, /lupins|mothbeans|mungo|hyacinth|winged|yardlong|catjang|liquid from|carob|papad|meat extender|okara|soy meal|soy protein|soybean, curd|vermicelli|fuyu|tofu yogurt|yokan|adzuki, mature seeds, canned, sweetened|chili, barbecue|with beef|with franks|hydrolyzed|nog|creamer|chai|coffee|mocha|plus|omega|peanut (spread|flour)|omega-3|fortified|reduced sugar|cooked, boiled, with salt|sandwich spread|vegetarian (fillets|meatloaf)|luncheon slices|chicken, meatless, breaded/i,
  ],
  include: [
    { re: /^(Beans|Broadbeans \(fava|Chickpeas|Cowpeas, common|Lentils|Lima beans|Mung beans|Peas, (green, split|split)|Pigeon peas|Soybeans, mature)/i, unless: /adzuki.*canned|black turtle|cranberry \(roman\)|french, mature|yellow, mature|small white|pink, mature|kidney, (california|royal)|with pork/i, why: 'bean, lentil or pea: raw, cooked without salt, canned' },
    { re: /^Beans, (black turtle|cranberry \(roman\)|french, mature|yellow, mature|small white|pink, mature|baked, canned, with pork)/i, tier: 2, why: 'less common bean' },
    { re: /^(Refried beans|Hummus|Chili with beans|Chickpea flour|Frijoles|Falafel)/i, why: 'common legume product' },
    { re: /^Peanuts, all types/i, why: 'peanuts' },
    { re: /^Peanuts, (spanish|valencia|virginia)/i, tier: 2, why: 'peanut variety' },
    { re: /^Peanut butter, (smooth style|chunk style|smooth, reduced fat|reduced sodium|chunky, vitamin|smooth, vitamin|with omega)|^Peanut Butter, smooth/i, why: 'peanut butter' },
    { re: /^(Tofu, (raw|soft|extra firm|hard|firm|fried$|fried, prepared|dried-frozen \(koyadofu\)$)|Tempeh|Miso|Natto|Soy flour, (full-fat, raw|defatted))/i, why: 'soy food' },
    { re: /^Soy flour, (full-fat, roasted|low-fat)|^Tofu, dried-frozen \(koyadofu\), prepared/i, tier: 2, why: 'soy food' },
    { re: /^Soymilk, (original and vanilla|chocolate), (with added calcium|unfortified)|^Soymilk, (original and vanilla|chocolate and other flavors), light/i, why: 'soy milk' },
    { re: /^Soymilk \(all flavors\), unsweetened|^Soymilk \(All flavors\), enhanced|^Soymilk \(all flavors\), nonfat|^Soymilk \(All flavors\), lowfat|^Soymilk, chocolate, nonfat/i, tier: 2, why: 'soy milk' },
    { re: /^Soy sauce made from soy/i, why: 'soy sauce' },
    { re: /^(Veggie burgers|Sausage, meatless|Bacon, meatless|Chicken, meatless$|Frankfurter, meatless|Meatballs, meatless)/i, tier: 2, why: 'common meat alternative' },
    { re: /^Noodles, chinese, cellophane/i, tier: 2, why: 'common pantry noodle' },
  ],
});

RULES['Nut and Seed Products'] = (list) => select(list, {
  keepSaltTwins: true,
  exclude: [/acorn|beechnut|butternut|hickory|pili|ginkgo|formulated|breadfruit|breadnut|cottonseed|lotus|safflower|sisymbrium|watermelon|\bflour\b|\bmeal\b|smoke flavor|creamed|from shell|sesame butter, tahini, (from unroasted|type of kernels)|chestnuts, (chinese|japanese)|chestnuts, european, (dried|boiled|raw, unpeeled)|coconut meat, dried \(desiccated\), sweetened, flaked, canned|coconut milk, frozen|coconut cream, raw|sesame seed kernels, toasted, without/i],
  include: [
    { re: /^Nuts, (almonds$|almonds, (blanched|dry roasted|oil roasted, with salt added$|oil roasted, without)|almond butter|brazilnuts|cashew|chestnuts, european|coconut (meat, raw|meat, dried \(desiccated\), (not sweetened|sweetened, flaked, packaged|sweetened, shredded)|milk, (canned|raw)|water|cream, canned)|hazelnuts|macadamia|mixed nuts, (dry roasted, with peanuts, with(out)? salt added$|oil roasted, with peanuts, with(out)? salt added$|oil roasted, without peanuts, with salt added$)|pecans|pine nuts, dried|pistachio|walnuts, (english|black|dry roasted))/i, why: 'common nut' },
    { re: /^Nuts, (almonds, (honey roasted|oil roasted, lightly salted)|almond paste|walnuts, glazed|mixed nuts|coconut meat, dried \(desiccated\), toasted|pine nuts, pinyon)/i, tier: 2, why: 'nut variant' },
    { re: /^Seeds, (chia|flaxseed|hemp|pumpkin and squash|sesame (seeds|seed kernels|butter)|sunflower seed (kernels|butter))/i, why: 'common seed' },
  ],
});

RULES['Cereal Grains and Pasta'] = (list) => select(list, {
  exclude: [/industrial|self-rising|bolted|corn flour, whole-grain, blue|corn grain|corn bran|barley malt|triticale|noodles, egg, (spinach|cooked, (enriched|unenriched), with added salt)|noodles, flat|vegetable, enriched|homemade|spinach|protein-fortified|gluten-free, (corn flour and quinoa|brown rice|rice flour)|whole grain, 51%|with salt$|with added salt$|cooked without salt$|rice, brown, parboiled|precooked or instant, enriched, dry|glutinous|wheat, (durum|hard|soft|sprouted)|wheat flour, white, (tortilla|all-purpose, enriched, calcium)|wheat flours, bread, unenriched|wheat flour, whole-grain, soft|semolina, unenriched|pasta, fresh-refrigerated, plain, as purchased|chow mein|wheat flour, white \(industrial/i],
  include: [
    { re: /^(Amaranth|Barley, (hulled|pearled)|Barley flour|Buckwheat$|Buckwheat groats|Bulgur|Corn flour, (whole-grain, yellow|yellow, masa, enriched|masa, enriched)|Cornmeal, (whole-grain, yellow|degermed, enriched, yellow)|Cornstarch|Couscous|Hominy|Millet, (raw|cooked)|Noodles, (egg, (dry, enriched|enriched, cooked)|japanese, soba)|Oat bran|Oats$|Pasta, (dry, enriched|cooked, enriched, without|whole-wheat|fresh-refrigerated, plain, cooked|gluten-free, corn)|Quinoa|Rice, brown, (long|medium)-grain|Rice, white, (long-grain, regular, (raw|cooked, enriched|enriched, cooked)|long-grain, parboiled, enriched|long-grain, precooked or instant, enriched, prepared|medium-grain, (raw|enriched, cooked)|short-grain, enriched)|Rice flour, white|Rice noodles|Rye flour, medium|Rye grain|Semolina, enriched|Sorghum|Spelt|Tapioca|Teff|Vital wheat gluten|Wheat bran|Wheat flour, (white, (all-purpose, enriched|bread|cake)|whole-grain$)|Wheat germ|Wheat, KAMUT|Wild rice)/i, unless: /unenriched/i, why: 'grain, flour or pasta' },
    { re: /^(Arrowroot flour|Buckwheat flour|Corn flour, (whole-grain, white|masa, unenriched|yellow, degermed)|Cornmeal, (whole-grain, white|degermed, (enriched, white|unenriched))|Millet flour|Noodles, (egg, (dry, unenriched|unenriched, cooked)|japanese, somen)|Oat flour|Pasta, (dry, unenriched|cooked, unenriched, without)|Rice bran|Rice flour, brown|Rice, white, (long-grain, regular, raw, unenriched|long-grain, regular, unenriched, cooked|medium-grain, (raw, unenriched|cooked, unenriched)|short-grain, (raw, unenriched|cooked, unenriched)|long-grain, parboiled, unenriched)|Rye flour, (dark|light)|Semolina, unenriched|Sorghum flour, refined|Wheat flour, white, (all-purpose, unenriched|all-purpose, self-rising)|Wheat flours, bread, unenriched|Wheat, (durum|hard red|hard white|soft)|Buckwheat groats, roasted, dry)/i, force: true, tier: 2, why: 'grain or flour variant' },
  ],
});

RULES['Dairy and Egg Products'] = (list) => select(list, {
  exclude: [/cheese (food|product|spread|sauce)|cheese, pasteurized process, (american, (low fat|without)|cheddar|pimento)|american, nonfat|caraway|cheshire|gjetost|limburger|port de salut|tilsit|queso (seco|anejo)|with fruit|with vegetables|lactose reduced|parmesan cheese topping|cream substitute|dessert topping|whipped cream substitute|whipped topping|whey|instant breakfast|nutritional supplement|protein supplement|milk shakes|milk dessert|milk, (human|indian|filled|low sodium|producer|dry, nonfat, calcium|dry, whole, without|canned, evaporated, with added vitamin D and without|chocolate, (fat free|lowfat, reduced|fluid, commercial, reduced fat, with added calcium)|fluid, 1%|fluid, nonfat, calcium|lowfat, fluid, 1% milkfat, (protein|with added nonfat)|nonfat, fluid, (protein|with added nonfat|without)|reduced fat, fluid, 2% milkfat, (protein|with added nonfat|without)|whole, 3\.25% milkfat, without|buttermilk, dried)|cream, half and half, (fat free|lowfat)|sour cream, imitation|sour dressing|dulce|egg substitute|egg, (white|whole|yolk), (dried|raw, frozen)|egg, (goose|turkey)|eggs, scrambled, frozen|kefir, lowfat, strawberry|yogurt, (frozen|chocolate|fruit variety, nonfat, fortified|fruit, low fat, (9|11|10 grams protein per 8 ounce, fortified)|fruit, lowfat, with|vanilla (flavor|or lemon)|vanilla, low fat, fortified)|butter (oil|replacement)|butter, light/i],
  include: [
    { re: /^Milk, (whole|reduced fat|lowfat|nonfat|buttermilk|chocolate|goat|sheep|canned|dry|evaporated)/i, why: 'plain milk' },
    { re: /^Eggnog|^Kefir|^Milk, chocolate beverage, hot cocoa/i, tier: 2, why: 'common dairy drink' },
    { re: /^Cream, |^Sour cream/i, why: 'cream' },
    { re: /^Butter, /i, why: 'butter' },
    { re: /^Cheese, (low.sodium|low-sodium|cheddar, nonfat|mozzarella, (nonfat|low sodium)|swiss, nonfat|parmesan, (low sodium|dry grated, reduced)|monterey, low fat|muenster, low fat|provolone, reduced|mexican, blend, reduced|brick|cheddar, sharp, sliced|cottage, lowfat, 1% milkfat, no sodium|pasteurized process, swiss|cottage, nonfat)/i, tier: 2, why: 'cheese variant' },
    { re: /^Cheese, /i, why: 'common cheese' },
    { re: /^Egg, (whole|white|yolk|duck|quail)/i, why: 'egg' },
    { re: /^Yogurt, Greek, (strawberry|vanilla), (lowfat|nonfat)/i, tier: 2, why: 'flavored yogurt' },
    { re: /^Yogurt, /i, why: 'yogurt' },
    { re: /^(Ice cream (bar|sandwich|sundae cone)|Ice cream, (bar or stick|soft serve)|Light ice cream|Fat free ice cream|Milk shakes)/i, unless: /light|no sugar/i, tier: 2, why: 'frozen dairy dessert' },
  ],
});

const POULTRY_METHODS = ['roasted', 'grilled', 'broiled', 'braised', 'pan-browned'];
const POULTRY_CUTS = [
  { re: /^Chicken, broiler or fryers, breast, skinless, boneless, meat only/i, methods: ['grilled', 'braised'], why: 'boneless skinless breast' },
  { re: /^Chicken, broilers or fryers, breast, meat only/i, why: 'breast, meat only' },
  { re: /^Chicken, broilers or fryers, breast, meat and skin/i, why: 'breast, meat and skin' },
  { re: /^Chicken, broilers or fryers, thigh, meat only/i, why: 'thigh' },
  { re: /^Chicken, broilers or fryers, thigh, meat and skin/i, why: 'thigh' },
  { re: /^Chicken, broilers or fryers, drumstick, meat only/i, why: 'drumstick' },
  { re: /^Chicken, broilers or fryers, drumstick, meat and skin/i, why: 'drumstick' },
  { re: /^Chicken, broilers or fryers, leg, meat only/i, why: 'leg' },
  { re: /^Chicken, broilers or fryers, leg, meat and skin/i, why: 'leg' },
  { re: /^Chicken, broilers or fryers, wing, meat only/i, why: 'wing' },
  { re: /^Chicken, broilers or fryers, wing, meat and skin/i, why: 'wing' },
  { re: /^Chicken, broilers or fryers, meat only, (raw|cooked, roasted)/i, why: 'whole chicken, meat only' },
  { re: /^Chicken, broilers or fryers, meat and skin, (raw|cooked, roasted)/i, why: 'whole chicken, meat and skin' },
  { re: /^Chicken, broilers or fryers, (dark|light) meat, meat only, (raw|cooked, roasted)/i, tier: 2, why: 'light or dark meat' },
  { re: /^Chicken, broilers or fryers, (dark|light) meat, meat and skin, (raw|cooked, roasted)/i, tier: 2, why: 'light or dark meat' },
  { re: /^Chicken, broilers or fryers, back, meat and skin, (raw|cooked, roasted)/i, tier: 2, why: 'back' },
  { re: /^Chicken, broilers or fryers, (giblets|neck, meat and skin)/i, methods: ['simmered', 'roasted'], tier: 2, why: 'giblets and neck' },
  { re: /^Chicken, ground/i, methods: ['pan-browned'], why: 'ground chicken' },
  { re: /^Chicken, liver, all classes/i, methods: ['simmered'], why: 'chicken liver' },
  { re: /^Chicken, (gizzard|heart), all classes/i, methods: ['simmered'], tier: 2, why: 'chicken giblet' },
  { re: /^Chicken, cornish game hens, meat and skin/i, tier: 2, why: 'cornish hen' },
  { re: /^Chicken, cornish game hens, meat only/i, tier: 2, why: 'cornish hen' },
  { re: /^Chicken, roasting, meat (only|and skin), (raw|cooked, roasted)/i, tier: 2, why: 'roasting chicken' },
  { re: /^Chicken, stewing, meat (only|and skin), (raw|cooked, stewed)/i, methods: ['stewed'], tier: 2, why: 'stewing chicken' },
  { re: /^Chicken, capons, meat and skin, (raw|cooked, roasted)/i, tier: 2, why: 'capon' },
  { re: /^Chicken, canned, meat only, with broth/i, raw: false, tier: 2, why: 'canned chicken' },
  { re: /^Chicken, broiler, rotisserie, BBQ, breast, meat (only|and skin)/i, raw: false, tier: 2, why: 'rotisserie chicken' },
  { re: /^Chicken, broiler, rotisserie, BBQ, thigh, meat (only|and skin)/i, raw: false, tier: 2, why: 'rotisserie chicken' },
  { re: /^Chicken, broiler, rotisserie, BBQ, drumstick, meat (only|and skin)/i, raw: false, tier: 2, why: 'rotisserie chicken' },
  { re: /^Chicken, broiler, rotisserie, BBQ, wing, meat and skin/i, raw: false, tier: 2, why: 'rotisserie chicken' },
  { re: /^Turkey, ground, 93% lean/i, methods: ['patties, broiled', 'broiled'], why: 'ground turkey' },
  { re: /^Turkey, ground, 85% lean/i, methods: ['patties, broiled', 'broiled'], why: 'ground turkey' },
  { re: /^Turkey, ground, fat free/i, methods: ['patties, broiled', 'broiled'], tier: 2, why: 'ground turkey' },
  { re: /^Turkey, Ground, (raw|cooked)/i, tier: 2, why: 'ground turkey' },
  { re: /^Turkey, retail parts, breast, meat only/i, why: 'turkey breast' },
  { re: /^Turkey, retail parts, breast, meat and skin/i, why: 'turkey breast' },
  { re: /^Turkey, retail parts, thigh, meat only/i, why: 'turkey thigh' },
  { re: /^Turkey, retail parts, thigh, meat and skin/i, tier: 2, why: 'turkey thigh' },
  { re: /^Turkey, retail parts, drumstick, meat only/i, why: 'turkey drumstick' },
  { re: /^Turkey, retail parts, drumstick, meat and skin/i, tier: 2, why: 'turkey drumstick' },
  { re: /^Turkey, retail parts, wing, meat and skin/i, why: 'turkey wing' },
  { re: /^Turkey, retail parts, wing, meat only/i, tier: 2, why: 'turkey wing' },
  { re: /^Turkey, whole, meat only/i, why: 'whole turkey' },
  { re: /^Turkey, whole, meat and skin, (raw|cooked, roasted)/i, why: 'whole turkey' },
  { re: /^Turkey, whole, (light|dark) meat, meat only, raw|^Turkey, whole, (light|dark) meat, cooked, roasted/i, tier: 2, why: 'turkey light or dark meat' },
  { re: /^Turkey, whole, (light|dark) meat, meat and skin/i, tier: 2, why: 'turkey light or dark meat' },
  { re: /^Turkey, whole, breast, meat only/i, tier: 2, why: 'turkey breast from whole bird' },
  { re: /^Turkey, whole, giblets|^Turkey, all classes, (gizzard|heart|liver)/i, methods: ['simmered'], tier: 2, why: 'turkey giblets' },
  { re: /^Duck, domesticated, meat only/i, tier: 2, why: 'duck' },
  { re: /^Duck, domesticated, meat and skin/i, raw: false, tier: 2, why: 'duck' },
  { re: /^Duck, domesticated, liver/i, tier: 2, why: 'duck liver' },
  { re: /^Goose, domesticated, meat (only|and skin)/i, raw: false, tier: 2, why: 'goose' },
  { re: /^Quail, meat and skin|^Pheasant, meat and skin|^Squab|^Ostrich, ground/i, tier: 2, why: 'game bird' },
  { re: /^Chicken (breast tenders|patty), (breaded, uncooked|frozen, uncooked)/i, allowFried: true, cooked: false, tier: 2, why: 'frozen breaded chicken' },
  { re: /^Chicken, broilers or fryers, breast, meat and skin, cooked, fried, (batter|flour)/i, allowFried: true, raw: false, methods: ['flour', 'batter'], tier: 2, why: 'fried chicken' },
  { re: /^Chicken, broilers or fryers, (thigh|drumstick|wing), meat and skin, cooked, fried, flour/i, allowFried: true, raw: false, methods: ['flour'], tier: 2, why: 'fried chicken' },
];
RULES['Poultry Products'] = (list) => pickCuts(list, POULTRY_CUTS.map((s) => ({ methods: POULTRY_METHODS, ...s })), { why: 'common poultry' });

const BEEF_CUTS = [
  ...['70% lean', '75% lean', '80% lean', '85% lean', '90% lean', '93% lean', '95% lean', '97% lean'].map((p) => ({ re: re(`^Beef, ground, ${p}`), methods: ['patty, cooked, broiled', 'broiled', 'pan-browned'], why: 'ground beef', lean: 'any', tier: /75|97/.test(p) ? 2 : 1 })),
  ...['80% lean', '85% lean', '90% lean', '93% lean'].map((p) => ({ re: re(`^Beef, ground, ${p}.*crumbles`), methods: ['pan-browned'], raw: false, why: 'ground beef crumbles', lean: 'any', allowFried: true, tier: 2 })),
  { re: /^Beef, chuck, arm pot roast.*separable lean and fat/i, why: 'chuck roast' },
  { re: /^Beef, chuck, blade roast.*separable lean and fat/i, tier: 2, why: 'chuck roast' },
  { re: /^Beef, chuck for stew/i, lean: 'any', why: 'stew beef' },
  { re: /^Beef, chuck, short ribs, boneless.*separable lean and fat/i, why: 'short ribs' },
  { re: /^Beef, shoulder top blade steak, boneless.*separable lean and fat/i, tier: 2, why: 'flat iron steak' },
  { re: /^Beef, chuck eye steak, boneless.*separable lean and fat/i, tier: 2, why: 'chuck eye steak' },
  { re: /^Beef, chuck eye roast, boneless.*separable lean and fat/i, tier: 2, why: 'chuck eye roast' },
  { re: /^Beef, chuck, under blade center steak, boneless, Denver Cut.*separable lean and fat/i, tier: 2, why: 'Denver steak' },
  { re: /^Beef, chuck, mock tender steak, boneless.*separable lean and fat/i, tier: 2, why: 'mock tender steak' },
  { re: /^Beef, chuck eye Country-Style ribs.*separable lean and fat/i, tier: 2, why: 'country-style ribs' },
  { re: /^Beef, shoulder pot roast, boneless.*separable lean and fat/i, tier: 2, why: 'shoulder pot roast' },
  { re: /^Beef, brisket, flat half, (boneless, )?separable lean and fat/i, why: 'brisket' },
  { re: /^Beef, brisket, whole, separable lean and fat/i, tier: 2, why: 'brisket' },
  { re: /^Beef, brisket, point half, separable lean and fat/i, tier: 2, why: 'brisket point' },
  { re: /^Beef, flank, steak.*separable lean and fat/i, why: 'flank steak' },
  { re: /^Beef, plate steak, boneless, inside skirt.*separable lean and fat/i, why: 'skirt steak' },
  { re: /^Beef, plate steak, boneless, outside skirt.*separable lean and fat/i, tier: 2, why: 'skirt steak' },
  { re: /^Beef, rib eye steak, boneless, lip off.*separable lean and fat/i, why: 'ribeye steak' },
  { re: /^Beef, rib eye steak, bone-in, lip-on.*separable lean and fat/i, raw: false, tier: 2, why: 'bone-in ribeye' },
  { re: /^Beef, rib eye steak\/roast, bone-in, lip-on.*separable lean and fat/i, cooked: false, tier: 2, why: 'bone-in ribeye' },
  { re: /^Beef, rib eye roast, boneless, lip-on.*separable lean and fat|^Beef, rib eye steak\/roast, boneless, lip-on.*separable lean and fat/i, tier: 2, why: 'ribeye roast' },
  { re: /^Beef, ribeye cap steak, boneless.*separable lean and fat/i, tier: 2, why: 'ribeye cap' },
  { re: /^Beef, rib, back ribs, bone-in.*separable lean and fat/i, tier: 2, why: 'back ribs' },
  { re: /^Beef, rib, whole \(ribs 6-12\).*separable lean and fat/i, tier: 2, why: 'prime rib' },
  { re: /^Beef, round, bottom round, roast.*separable lean and fat/i, why: 'bottom round roast' },
  { re: /^Beef, round, bottom round, steak.*separable lean and fat/i, tier: 2, why: 'bottom round steak' },
  { re: /^Beef, round, eye of round roast, boneless.*separable lean and fat/i, why: 'eye of round roast' },
  { re: /^Beef, round, eye of round steak, boneless.*separable lean and fat/i, tier: 2, why: 'eye of round steak' },
  { re: /^Beef, round, top round roast, boneless.*separable lean and fat/i, why: 'top round roast' },
  { re: /^Beef, round, top round steak, boneless.*separable lean and fat/i, why: 'top round steak' },
  { re: /^Beef, round, tip round, roast.*separable lean and fat/i, tier: 2, why: 'sirloin tip roast' },
  { re: /^Beef, round, knuckle, tip center, steak.*separable lean and fat/i, tier: 2, why: 'sirloin tip steak' },
  { re: /^Beef, round, full cut.*separable lean and fat/i, tier: 2, why: 'round steak' },
  { re: /^Beef, short loin, porterhouse steak.*separable lean and fat/i, why: 'porterhouse' },
  { re: /^Beef, short loin, t-bone steak.*separable lean and fat/i, why: 't-bone' },
  { re: /^Beef, loin, top loin steak, boneless, lip off.*separable lean and fat/i, why: 'strip steak' },
  { re: /^Beef, loin, top loin steak, boneless, lip-on.*separable lean and fat/i, tier: 2, why: 'strip steak, lip-on' },
  { re: /^Beef, loin, tenderloin steak, boneless.*separable lean and fat/i, why: 'tenderloin steak' },
  { re: /^Beef, loin, tenderloin roast, boneless.*separable lean and fat/i, tier: 2, why: 'tenderloin roast' },
  { re: /^Beef, top sirloin, steak.*separable lean and fat/i, why: 'top sirloin steak' },
  { re: /^Beef, loin, top sirloin cap steak, boneless.*separable lean and fat/i, tier: 2, why: 'sirloin cap (picanha)' },
  { re: /^Beef, bottom sirloin, tri-tip roast.*separable lean and fat/i, why: 'tri-tip' },
  { re: /^Beef, loin, bottom sirloin butt, tri-tip steak.*separable lean and fat/i, tier: 2, why: 'tri-tip steak' },
  { re: /^Beef, shank crosscuts/i, lean: 'any', methods: ['simmered'], tier: 2, why: 'shank' },
  { re: /^Beef, cured, corned beef, brisket/i, lean: 'any', why: 'corned beef' },
  { re: /^Beef, variety meats and by-products, liver/i, lean: 'any', methods: ['braised', 'pan-fried'], allowFried: true, tier: 2, why: 'beef liver' },
  { re: /^Beef, variety meats and by-products, (tongue|heart|kidneys|tripe)/i, lean: 'any', methods: ['simmered', 'braised'], tier: 2, why: 'beef variety meat' },
  { re: /^Beef, ground, patties, frozen/i, lean: 'any', tier: 2, why: 'frozen patties' },
  { re: /^Beef, sandwich steaks/i, lean: 'any', tier: 2, why: 'sandwich steak' },
];
RULES['Beef Products'] = (list) => [
  ...pickCuts(list, BEEF_CUTS, { why: 'common beef cut' }),
  ...pickCuts(list, leanOnly(BEEF_CUTS.filter((s) => !s.tier || s.tier === 1))),
];

const PORK_CUTS = [
  { re: /^Pork, fresh, ground/i, lean: 'any', why: 'ground pork' },
  { re: /^Pork, fresh, loin, tenderloin, separable lean and fat/i, why: 'tenderloin' },
  { re: /^Pork, fresh, loin, center loin \(chops\), bone-in, separable lean and fat/i, why: 'center loin chop' },
  { re: /^Pork, fresh, loin, center loin \(roasts\), bone-in, separable lean and fat/i, raw: false, tier: 2, why: 'center loin roast' },
  { re: /^Pork, fresh, loin, top loin \(chops\), boneless, separable lean and fat/i, why: 'boneless loin chop' },
  { re: /^Pork, fresh, loin, center rib \((chops|chops or roasts)\), bone-in, separable lean and fat/i, tier: 2, why: 'rib chop' },
  { re: /^Pork, fresh, loin, center rib \((chops|chops or roasts)\), boneless, separable lean and fat/i, tier: 2, why: 'boneless rib chop' },
  { re: /^Pork, fresh, loin, whole, separable lean and fat/i, why: 'loin roast' },
  { re: /^Pork, fresh, loin, sirloin \((chops|chops or roasts)\), boneless, separable lean and fat/i, tier: 2, why: 'sirloin chop' },
  { re: /^Pork, fresh, loin, sirloin \((roasts|chops or roasts)\), bone-in, separable lean and fat/i, tier: 2, why: 'sirloin roast' },
  { re: /^Pork, fresh, loin, blade \((chops|chops or roasts)\), bone-in, separable lean and fat/i, tier: 2, why: 'blade chop' },
  { re: /^Pork, fresh, loin, country-style ribs, separable lean and fat/i, why: 'country-style ribs' },
  { re: /^Pork, fresh, backribs, separable lean and fat/i, why: 'baby back ribs' },
  { re: /^Pork, fresh, spareribs, separable lean and fat/i, why: 'spareribs' },
  { re: /^Pork, fresh, belly, raw/i, lean: 'any', why: 'pork belly' },
  { re: /^Pork, fresh, shoulder, \(Boston butt\), blade \(steaks\), separable lean and fat/i, why: 'pork shoulder (Boston butt)' },
  { re: /^Pork, fresh, shoulder, blade, boston \(roasts\)/i, lean: 'any', raw: false, why: 'pork shoulder roast' },
  { re: /^Pork, fresh, shoulder, whole, separable lean and fat/i, tier: 2, why: 'whole shoulder' },
  { re: /^Pork, fresh, shoulder, arm picnic, separable lean and fat/i, tier: 2, why: 'picnic shoulder' },
  { re: /^Pork, fresh, leg \(ham\), whole, separable lean and fat/i, tier: 2, why: 'fresh ham' },
  { re: /^Pork, fresh, leg \(ham\), (rump|shank) half, separable lean and fat/i, tier: 2, why: 'fresh ham half' },
  { re: /^Pork, Leg sirloin tip roast, boneless/i, lean: 'any', tier: 2, why: 'leg sirloin tip roast' },
  { re: /^Pork, Shoulder petite tender, boneless/i, lean: 'any', tier: 2, why: 'petite tender' },
  { re: /^Pork, cured, ham, boneless, extra lean and regular/i, lean: 'any', why: 'ham' },
  { re: /^Pork, cured, ham, boneless, regular \(approximately 11% fat\)/i, lean: 'any', tier: 2, why: 'ham' },
  { re: /^Pork, cured, ham, boneless, extra lean \(approximately 5% fat\)/i, lean: 'any', tier: 2, why: 'extra lean ham' },
  { re: /^Pork, cured, ham, whole, separable lean and fat/i, why: 'bone-in ham' },
  { re: /^Pork, cured, ham, slice, bone-in, separable lean and fat/i, tier: 2, why: 'ham steak' },
  { re: /^Pork, cured, ham, center slice, separable lean and fat/i, tier: 2, why: 'ham center slice' },
  { re: /^Pork, cured, ham, extra lean and regular, canned/i, lean: 'any', tier: 2, why: 'canned ham' },
  { re: /^Pork, cured, ham -- water added, whole, boneless, separable lean and fat/i, tier: 2, why: 'water-added ham' },
  { re: /^Pork, cured, ham, rump, bone-in, separable lean and fat|^Pork, cured, ham, shank, bone-in, separable lean and fat/i, tier: 2, why: 'bone-in ham half' },
  { re: /^Pork, cured, bacon, (unprepared|pre-sliced, cooked, pan-fried)/i, lean: 'any', allowFried: true, methods: ['pan-fried'], why: 'bacon' },
  { re: /^Pork, cured, bacon, cooked, baked/i, lean: 'any', tier: 2, why: 'bacon' },
  { re: /^Pork, cured, bacon, cooked, broiled, pan-fried or roasted, reduced sodium/i, lean: 'any', allowFried: true, methods: ['pan-fried'], tier: 2, why: 'reduced sodium bacon' },
  { re: /^Canadian bacon|^Pork, cured, canadian/i, lean: 'any', why: 'Canadian bacon' },
  { re: /^Pork, cured, salt pork/i, lean: 'any', tier: 2, why: 'salt pork' },
  { re: /^Pork, cured, (shoulder, arm picnic|shoulder, blade roll)/i, lean: 'any', tier: 2, why: 'cured shoulder' },
  { re: /^Pork, cured, feet|^Pork, fresh, variety meats and by-products, (feet|hocks)/i, lean: 'any', methods: ['simmered'], tier: 2, why: 'pork feet or hocks' },
  { re: /^Pork, fresh, variety meats and by-products, liver/i, lean: 'any', tier: 2, why: 'pork liver' },
  { re: /^Pork, fresh, variety meats and by-products, (ears|jowl|chitterlings|tongue|heart|kidneys)/i, lean: 'any', methods: ['simmered', 'braised'], tier: 2, why: 'pork variety meat' },
];
RULES['Pork Products'] = (list) => [
  ...pickCuts(list, PORK_CUTS, { why: 'common pork cut' }),
  ...pickCuts(list, leanOnly(PORK_CUTS.filter((s) => !s.tier || s.tier === 1))),
];

const LAMB_CUTS = [
  { re: /^Lamb, ground/i, lean: 'any', why: 'ground lamb' },
  { re: /^Lamb, leg, whole \(shank and sirloin\), separable lean and fat/i, why: 'leg of lamb' },
  { re: /^Lamb, leg, (shank|sirloin) half, separable lean and fat/i, tier: 2, why: 'leg of lamb half' },
  { re: /^Lamb, loin, separable lean and fat/i, why: 'lamb loin chop' },
  { re: /^Lamb, rib, separable lean and fat/i, why: 'lamb rib (rack)' },
  { re: /^Lamb, shoulder, whole \(arm and blade\), separable lean and fat/i, why: 'lamb shoulder' },
  { re: /^Lamb, shoulder, (arm|blade), separable lean and fat/i, tier: 2, why: 'lamb shoulder chop' },
  { re: /^Lamb, foreshank, separable lean and fat/i, why: 'lamb shank' },
  { re: /^Lamb, variety meats and by-products, (liver|tongue|heart|kidneys)/i, lean: 'any', methods: ['braised', 'simmered'], tier: 2, why: 'lamb variety meat' },
  { re: /^Veal, ground/i, lean: 'any', why: 'ground veal' },
  { re: /^Veal, leg \(top round\), separable lean and fat/i, exclude: /pan-fried/i, why: 'veal leg cutlet' },
  { re: /^Veal, leg, top round, cap off, cutlet, boneless/i, lean: 'any', tier: 2, why: 'veal cutlet' },
  { re: /^Veal, loin, separable lean and fat/i, tier: 2, why: 'veal loin chop' },
  { re: /^Veal, rib, separable lean and fat/i, tier: 2, why: 'veal rib' },
  { re: /^Veal, sirloin, separable lean and fat/i, tier: 2, why: 'veal sirloin' },
  { re: /^Veal, shoulder, whole \(arm and blade\), separable lean and fat/i, tier: 2, why: 'veal shoulder' },
  { re: /^Veal, shank \(fore and hind\), separable lean and fat/i, methods: ['braised'], tier: 2, why: 'veal shank (osso buco)' },
  { re: /^Veal, variety meats and by-products, liver/i, lean: 'any', methods: ['braised'], tier: 2, why: 'veal liver' },
  { re: /^Game meat, bison, ground/i, lean: 'any', tier: 2, why: 'ground bison' },
  { re: /^Game meat, bison, (top sirloin|chuck|ribeye|top round)/i, lean: 'any', tier: 2, why: 'bison' },
  { re: /^Game meat, (deer|elk), (ground|loin|top round|tenderloin)/i, lean: 'any', tier: 2, why: 'venison and elk' },
  { re: /^Game meat, goat/i, lean: 'any', tier: 2, why: 'goat' },
  { re: /^Game meat, rabbit, domesticated, composite of cuts/i, lean: 'any', methods: ['roasted', 'stewed'], tier: 2, why: 'rabbit' },
];
RULES['Lamb, Veal, and Game Products'] = (list) => [
  ...pickCuts(list, LAMB_CUTS, { why: 'common lamb or veal cut' }),
  ...pickCuts(list, leanOnly(LAMB_CUTS.filter((s) => !s.tier || s.tier === 1))),
];

const OBSCURE_FISH = /burbot|butterfish|cusk|\bdrum\b|\beel\b|\bling\b|lingcod|milkfish|pout|scup|sheepshead|\bspot\b|sucker|sunfish|turbot|wolffish|cisco|shad|bass, fresh ?water|carp|mullet|croaker|pompano|seatrout|sturgeon|yellowtail|halibut, greenland|trout, brook|tilefish|shark/i;
const NOT_FISH = /gefilte|tuna salad|crab cakes|nuggets|dried and salted|salted$|frog|jellyfish|turtle|abalone|conch|cuttlefish|snail|whelk|caviar/i;

RULES['Finfish and Shellfish Products'] = (list) => select(list, {
  exclude: [NOT_FISH, /shrimp, mixed species, cooked, moist heat \(may|shrimp, mixed species, raw \(may|pollock, alaska, (raw|cooked, dry heat) \(may|cod, pacific, cooked, dry heat \(may|coho, wild, cooked, moist|salmon, (pink|sockeye), canned, total|oyster, eastern, farmed|mackerel, jack|herring, pacific|crab, queen|crayfish, mixed species, wild|spiny lobster|oyster, pacific|clam, mixed species, canned, liquid|whelk|imitation/i],
  include: [
    { re: /^Fish, (anchovy, european, canned|sardine)/i, why: 'canned fish' },
    { re: /^Fish, tuna, (light|white), canned in (oil|water), drained solids/i, why: 'canned tuna' },
    { re: /^Fish, tuna, (light|white), canned in (oil|water), without salt/i, tier: 2, why: 'canned tuna, no salt' },
    { re: /^Fish, salmon, (pink|sockeye), canned, drained solids$|^Fish, salmon, chum, canned, drained solids with bone|^Fish, Salmon, pink, canned, drained solids, without skin and bones|^Salmon, sockeye, canned, drained solids, without skin and bones|^Fish, salmon, (chum|pink|sockeye), canned, without salt/i, why: 'canned salmon' },
    { re: /^Fish, (cod, Atlantic, canned|mackerel, jack, canned|salmon, pink, canned, total)/i, tier: 2, why: 'canned fish variant' },
    { re: OBSCURE_FISH, tier: 2, why: 'less common fish, raw and cooked', unless: /smoked|fried|breaded|batter|pickled|kippered/i },
    { re: /^Fish, .*(smoked|kippered|pickled)/i, tier: 2, why: 'smoked or pickled fish' },
    { re: /^Fish, .*(raw|cooked, dry heat|cooked$|cooked, moist heat)/i, unless: /fried|breaded|batter/i, why: 'common fish, raw and one plain cooked form' },
    { re: /^Fish, (roe, mixed species, (raw|cooked)|fish sticks, frozen, prepared|surimi)|^Fish, .*(breaded and fried|batter-dipped and fried)/i, tier: 2, why: 'fish product or fried form' },
    { re: /^(Crustaceans|Mollusks), .*(raw|cooked, moist heat|cooked$|canned|cooked, steamed|cooked, dry heat)/i, unless: /fried|breaded/i, why: 'common shellfish' },
    { re: /^(Crustaceans|Mollusks), .*(breaded and fried|cooked, fried)|^Crustaceans, crab, alaska king, imitation|^Crustaceans, shrimp, mixed species, imitation|^Mollusks, scallop, mixed species, imitation/i, force: true, tier: 2, why: 'fried or imitation shellfish' },
  ],
});

RULES['Baked Products'] = (list) => select(list, {
  exclude: [/toasted$|toasted,|calcium-fortified|low sodium|no salt|special dietary|sugar free|refrigerated dough$|dry mix$|toaster|dry mix, (complete$|incomplete$)|made with margarine|without frosting|no-bake|other than all butter|unfrosted|puff pastry|cream puff|eclair|strudel|fortune|ladyfingers|animal|coconut macaroon|gluten-free|prepared from recipe$|pan dulce|salvadoran|boston brown|bread, cheese|bread, protein|bread, rice bran|bread, sticks|bollilo|chapati|paratha|pound cake type|melba|water biscuits|cream, gamesa|la moderna|rusk|crispbread|hush puppies|ice cream cones|leavening|wonton|egg roll/i],
  include: [
    { re: /^Bagels, (plain, enriched, with calcium propionate|cinnamon-raisin$|egg$|multigrain|oat bran|wheat$|whole grain white)/i, why: 'bagel' },
    { re: /^Bread, (white, commercially prepared( \(includes soft bread crumbs\))?$|whole-wheat, commercially prepared$|wheat$|multi-grain \(includes whole-grain\)|rye$|pumpernickel|italian|french or vienna \(includes sourdough\)|french or vienna, whole wheat|pita, white, enriched|pita, whole-wheat|naan, (plain|whole wheat)|cornbread, (prepared from recipe|dry mix, enriched)|oat bran$|oatmeal$|raisin, enriched$|egg$|potato|cracked-wheat|white wheat|wheat, sprouted$|cinnamon|reduced-calorie, (white|wheat|oat bran$|oatmeal|rye)|crumbs, dry, grated, (plain|seasoned)|stuffing, dry mix, prepared|white, prepared from recipe, made with low fat)/i, why: 'common bread' },
    { re: /^Rolls, (dinner, plain, commercially|hamburger or hotdog, plain|hard, kaiser|dinner, whole-wheat|dinner, (wheat|oat bran|rye|egg)|hamburger or hotdog, (whole wheat|mixed-grain)|french|pumpernickel|dinner, plain, prepared)/i, why: 'roll' },
    { re: /^(Muffins, English|English muffins), (plain, enriched, with|whole-wheat|wheat|mixed-grain|raisin-cinnamon|plain, unenriched, with)/i, why: 'english muffin' },
    { re: /^Tortillas, ready-to-bake or -fry, (corn|flour|whole wheat)/i, why: 'tortilla' },
    { re: /^Taco shells, baked/i, why: 'taco shell' },
    { re: /^Crackers, (saltines|cheese, (regular|reduced fat|low sodium|whole grain)|matzo, (plain|whole-wheat|egg$)|multigrain$|rye, wafers, plain|standard snack-type, regular$|standard snack-type, (sandwich|with whole wheat)|wheat, (regular|low salt|reduced fat)|whole-wheat, (regular|low salt|reduced fat)|milk|rice|melba toast, plain$|matzo, whole-wheat)/i, why: 'common cracker' },
    { re: /^(Croutons|Phyllo dough|Pie crust, standard-type, frozen, ready-to-bake, enriched$|Pie crust, standard-type, (prepared from recipe, baked|dry mix, prepared)|Bread crumbs|Stuffing, bread, dry mix, prepared|Puff pastry, frozen, ready-to-bake)/i, force: true, tier: 2, why: 'baking staple' },
    { re: /^(Biscuits, plain or buttermilk, (refrigerated dough, higher fat, baked|prepared from recipe|frozen, baked|dry mix, prepared|refrigerated dough, lower fat, baked)|Croissants, (butter|apple|cheese)|Muffins, (blueberry, (commercially|prepared from recipe|dry mix, prepared)|corn, (commercially|prepared|dry mix, prepared)|oat bran|plain, prepared|wheat bran, (dry mix, prepared|toaster-type))|Pancakes, (plain, (frozen|prepared from recipe|dry mix, complete, prepared|dry mix, incomplete, prepared)|buttermilk, prepared|whole-wheat, dry mix, incomplete, prepared|plain, reduced fat)|Waffles, (plain, (frozen, ready-to-heat$|prepared from recipe|dry mix, prepared)|buttermilk, frozen, ready-to-heat$|whole wheat, lowfat|chocolate chip, frozen)|French toast, (frozen|prepared from recipe)|Cinnamon buns|Danish pastry, (cheese|cinnamon, enriched|fruit, enriched)|Sweet rolls, cinnamon, commercially prepared with raisins|Toaster pastries, fruit)/i, force: true, tier: 2, why: 'breakfast bread' },
    { re: /^Cookies, (butter, commercially prepared, enriched|chocolate chip, (commercially prepared, regular, higher fat, enriched|commercially prepared, soft-type|prepared from recipe, made with butter|refrigerated dough, baked)|chocolate sandwich, with creme filling, regular$|fig bars|graham crackers, plain or honey|oatmeal, (commercially prepared, regular|with raisins|prepared from recipe)|peanut butter, (commercially prepared, regular|sandwich, regular|prepared from recipe)|shortbread, commercially prepared, plain|sugar, (commercially prepared, regular|refrigerated dough, baked|prepared from recipe)|vanilla wafers, (higher|lower) fat|vanilla sandwich with creme filling|molasses|gingersnaps|brownies, commercially prepared|chocolate wafers|sugar wafers with creme filling, regular|raisin, soft-type|marshmallow, chocolate-coated|coconut macaroons, prepared from recipe|oatmeal sandwich|chocolate chip sandwich|peanut butter sandwich)/i, force: true, tier: 2, why: 'generic cookie' },
    { re: /^(Cake, (angelfood, commercially|cheesecake, commercially|chocolate, commercially prepared with chocolate frosting|pound, commercially prepared, butter|yellow, commercially prepared, with (chocolate|vanilla) frosting|carrot, dry mix, prepared|white, prepared from recipe with coconut frosting|sponge, commercially|fruitcake|gingerbread, prepared|boston cream pie|snack cakes, (creme-filled, chocolate|creme-filled, sponge|cupcakes, chocolate))|Pie, (apple, commercially|cherry, commercially|pecan, commercially|pumpkin, commercially|blueberry, commercially|lemon meringue, commercially|chocolate creme, commercially|coconut creme, commercially|banana cream, prepared)|Doughnuts, (cake-type, plain( \(includes unsugared, old-fashioned\)|, sugared or glazed|, chocolate-coated or frosted)|yeast-leavened, glazed, enriched|french crullers|yeast-leavened, with (creme|jelly) filling|cake-type, chocolate, sugared or glazed)|Brownies|Coffeecake, cinnamon with crumb topping, commercially|Cookies, brownies)/i, force: true, tier: 2, why: 'generic dessert' },
  ],
});

RULES['Breakfast Cereals'] = (list) => select(list, {
  allowBrands: true,
  include: [
    { re: /^Cereals, oats, regular and quick, (not fortified, dry|unenriched, cooked with water \(includes boiling and microwaving\), without salt)/i, force: true, why: 'oatmeal' },
    { re: /^Cereals, oats, instant, fortified, plain, (dry|prepared with water)/i, force: true, why: 'instant oatmeal' },
    { re: /^Cereals, oats, instant, fortified, (maple and brown sugar, dry|with cinnamon and spice, (dry|prepared)|with raisins and spice, prepared)/i, force: true, tier: 2, why: 'flavored instant oatmeal' },
    { re: /^Cereals, corn grits, (white|yellow), regular and quick, enriched, (dry|cooked with water, without salt)/i, force: true, why: 'grits' },
    { re: /^Cereals, CREAM OF WHEAT, (regular \(10 minute\), cooked with water, without salt|regular, 10 minute cooking, dry|instant, prepared with water, without salt)|^Cereals, farina, enriched, assorted brands including CREAM OF WHEAT, quick \(1-3 minutes\), cooked with water, without salt/i, force: true, tier: 2, why: 'farina' },
    { re: /^Cereals ready-to-eat, (granola, homemade|wheat germ, toasted, plain|rice, puffed, fortified|wheat, puffed, fortified)/i, force: true, why: 'plain ready-to-eat cereal' },
    { re: /^Cereals ready-to-eat, (RALSTON Corn Flakes|RALSTON Enriched Wheat Bran flakes|POST Bran Flakes|POST, Shredded Wheat, original spoon-size|POST, Shredded Wheat, original big biscuit|POST Raisin Bran|POST, GRAPE-NUTS Cereal|POST, GRAPE-NUTS Flakes|GENERAL MILLS, CHEERIOS$|QUAKER, QUAKER OAT LIFE, plain|QUAKER, Oatmeal Squares$|QUAKER, 100% Natural Granola, Oats, Wheat and Honey|QUAKER, Low Fat 100% Natural Granola with Raisins|POST, HONEY BUNCHES OF OATS, honey roasted|MALT-O-MEAL, Frosted Flakes|SUN COUNTRY, KRETSCHMER Wheat Germ, Regular|GENERAL MILLS, (Honey Nut CHEERIOS|Multi-Grain CHEERIOS|WHEATIES|TOTAL|KIX|RICE CHEX|CORN CHEX|WHEAT CHEX|FIBER ONE|LUCKY CHARMS|CINNAMON TOAST CRUNCH|COCOA PUFFS|GOLDEN GRAHAMS|Raisin Nut Bran))/i, force: true, why: 'named staple cereal (corn flakes, bran flakes, shredded wheat, granola, cheerios and the like)' },
  ],
});

RULES['Snacks'] = (list) => select(list, {
  keepSaltTwins: true,
  include: [
    { re: /^Snacks, popcorn, (air-popped$|air-popped \(unsalted\)|oil-popped, microwave, regular flavor, no trans fat|oil-popped, white popcorn, salt added|caramel-coated, without peanuts|caramel-coated, with peanuts|microwave, regular \(butter\) flavor, made with palm oil|microwave, low fat|microwave, 94% fat free|cheese-flavor|home-prepared, oil-popped, unsalted|cakes)|^Popcorn, microwave, (regular \(butter\) flavor, made with palm oil|low fat and sodium)/i, why: 'popcorn' },
    { re: /^Snacks, pretzels, hard, (plain, salted|plain, unsalted|whole-wheat|confectioner)|^Pretzels, soft/i, why: 'pretzels' },
    { re: /^Snacks, tortilla chips, (plain, (white|yellow) corn, salted|low fat, baked without fat|nacho-flavor, (regular|reduced fat)|ranch-flavor|light \(baked with less oil\)|unsalted)/i, why: 'tortilla chips' },
    { re: /^Snacks, potato chips, (plain, (salted|unsalted)|made from dried potatoes, (plain|sour-cream)|baked|barbecue-flavor|sour-cream-and-onion-flavor|cheese-flavor|reduced fat|fat free|lightly salted)|^Potato chips, without salt, reduced fat|^Snack, potato chips, made from dried potatoes, plain/i, why: 'potato chips' },
    { re: /^Snacks, (corn-based, extruded, (chips, plain|chips, barbecue|puffs or twists, cheese-flavor$|onion-flavor|cones, plain)|corn cakes|rice cakes, brown rice, (plain|multigrain|buckwheat)|plantain chips|sweet potato chips|taro chips|pork skins, (plain|barbecue)|beef jerky|beef sticks|banana chips|fruit leather, (pieces|rolls)|sesame sticks|oriental mix|trail mix, (regular$|regular, with chocolate chips, salted nuts and seeds|tropical)|granola bars, (hard, (plain|almond|chocolate chip|peanut butter)|soft, uncoated, (plain|chocolate chip$|peanut butter$|nut and raisin|raisin)|soft, coated, milk chocolate coating, (chocolate chip|peanut butter))|granola bar, (chewy, reduced sugar|fruit-filled)|crisped rice bar, chocolate chip|potato sticks|cheese puffs and twists, corn based, baked, low fat|snack mix|pita chips|vegetable chips|bagel chips|M&M MARS, KUDOS)/i, unless: /M&M/i, why: 'common snack' },
    { re: /^(Rice cake, cracker|Breakfast bars, oats)/i, tier: 2, why: 'snack variant' },
  ],
});

RULES['Sweets'] = (list) => select(list, {
  include: [
    { re: /^(Candies, (milk chocolate$|semisweet chocolate$|semisweet chocolate, made with butter|sweet chocolate$|baking chocolate, unsweetened, squares|white chocolate|milk chocolate, with almonds|milk chocolate, with rice cereal|hard$|caramels$|marshmallows|gumdrops, starch jelly pieces|jellybeans|butterscotch|taffy|toffee|fudge, chocolate, prepared-from-recipe|peanut brittle|nougat|praline|truffles|milk chocolate coated (peanuts|raisins)|dark chocolate coated coffee beans)|Chocolate, dark|Cocoa, dry powder, unsweetened|Chocolate-flavored hazelnut spread)/i, why: 'chocolate and candy' },
    { re: /^(Honey|Jams and preserves$|Jams and preserves, apricot|Jellies$|Marmalade, orange|Fruit butters, apple|Molasses$|Sugars, (brown|granulated|powdered|maple)|Syrups, (maple|corn, (light|dark|high-fructose)|table blend, pancake$|table blend, pancake, with 2% maple|table blend, pancake, reduced-calorie|chocolate$|chocolate, fudge-type|sorghum|malt|grenadine|fruit flavored)|Sweeteners, (tabletop, (aspartame, EQUAL, packets|sucralose, SPLENDA packets|saccharin|fructose, dry, powder|fructose, liquid)|sugar substitute, granulated, brown|for baking, contains sugar and sucralose)|Jams and preserves, no sugar|Jellies, no sugar)/i, force: true, why: 'sweetener or spread' },
    { re: /^(Ice creams, (vanilla|chocolate|strawberry)(, (light|rich|light, soft-serve|fat free|light, no sugar added))?$|Ice creams, french vanilla, soft-serve|Ice creams, (chocolate, light, no sugar added|regular, low carbohydrate, (vanilla|chocolate))|Frozen yogurts, (chocolate$|flavors other than chocolate|vanilla, soft-serve|chocolate, soft-serve|chocolate, nonfat)|Sherbet, orange|Frozen novelties, (ice type, (pop|italian|fruit)|juice type|fruit and juice bars)|Puddings, (chocolate|vanilla|rice|tapioca|banana|lemon), ready-to-eat|Puddings, (chocolate|vanilla|tapioca|rice), dry mix, (regular|instant), prepared with (whole|2%) milk|Gelatin desserts, dry mix, prepared with water|Gelatin desserts, dry mix, reduced calorie, with aspartame, prepared with water|Gelatins, dry powder, unsweetened|Milk dessert, frozen|Egg custards, dry mix, prepared with 2% milk|Flan, caramel custard, dry mix, prepared with 2% milk|Desserts, rennin, vanilla, dry mix, prepared with 2% milk|Desserts, mousse, chocolate, prepared-from-recipe|Desserts, apple crisp, prepared-from-recipe)/i, force: true, why: 'common dessert' },
    { re: /^(Frostings, (chocolate|vanilla|cream cheese-flavor|coconut-nut), (creamy, )?ready-to-eat|Pie fillings, (apple|blueberry|canned, cherry|cherry, low calorie)|Toppings, (butterscotch or caramel|marshmallow cream|strawberry|nuts in syrup|pineapple)|Chewing gum|Chewing gum, sugarless|Baking chocolate, (unsweetened, squares|mexican, squares)|Cocoa, dry powder, hi-fat or breakfast, processed with alkali|Candies, (carob|chocolate covered, caramel with nuts|sesame crunch|halavah)|Sweeteners, (tabletop, sucralose, SPLENDA packets|tabletop, stevia)|Marshmallows)/i, force: true, tier: 2, why: 'baking sweet or topping' },
  ],
});

RULES['Beverages'] = (list) => select(list, {
  include: [
    { re: /^Beverages, coffee, (brewed, prepared with tap water(, decaffeinated)?$|brewed, espresso, restaurant-prepared(, decaffeinated)?$|instant, regular, (powder|prepared with water)|instant, decaffeinated, (powder|prepared with water)|brewed, breakfast blend)/i, force: true, why: 'coffee' },
    { re: /^Beverages, coffee, (instant, (chicory|with chicory|mocha, sweetened|regular, half the caffeine)|ready to drink, (iced, mocha|milk based, sweetened|vanilla, light))|^Beverages, coffee substitute, cereal grain beverage, prepared with water|^Beverages, coffee and cocoa, instant/i, force: true, tier: 2, why: 'coffee variant' },
    { re: /^Beverages, tea, (black, brewed, prepared with tap water(, decaffeinated)?$|green, brewed, (regular|decaffeinated)|herb, brewed, chamomile|herb, other than chamomile, brewed|hibiscus, brewed|Oolong, brewed|black, ready to drink$|black, ready to drink, decaffeinated$|black, ready-to-drink, lemon, (sweetened|diet)|green, ready to drink, unsweetened|green, ready-to-drink, (sweetened|diet)|instant, (sweetened with sugar, lemon-flavored, without added ascorbic acid, powder|unsweetened, powder)|instant, sweetened with sugar, lemon-flavored, without added ascorbic acid, powder, prepared|instant, unsweetened, powder, prepared|black, ready-to-drink, peach, diet|green, ready to drink, ginseng and honey, sweetened)/i, force: true, why: 'tea' },
    { re: /^Beverages, carbonated, (club soda|cola, regular|cola, without caffeine|ginger ale|grape soda|lemon-lime soda, no caffeine|orange|pepper-type, contains caffeine|root beer|tonic water|low calorie, cola or pepper-type, with aspartame, (contains|without) caffeine|low calorie, other than cola or pepper,\s+without caffeine|low calorie, other than cola or pepper, with aspartame, contains caffeine|cream soda|limeade, high caffeine|reduced sugar, cola|low calorie, cola or pepper-types, with sodium saccharin)/i, force: true, why: 'soda, diet soda, club soda' },
    { re: /^Beverages, Energy Drink(, sugar free| with carbonated water)|^Beverages,\s+Energy drink, Citrus/i, force: true, why: 'energy drink' },
    { re: /^Beverages, (PEPSICO QUAKER, Gatorade, G performance O 2|COCA-COLA, POWERADE, lemon-lime|PEPSICO QUAKER, Gatorade G2|Powerade Zero Ion4|drink mix, QUAKER OATS, GATORADE, orange flavor, powder)/i, force: true, why: 'sports drink' },
    { re: /^Beverages, (fruit punch drink, without added nutrients, canned|Fruit punch drink, with added nutrients, canned|Fruit punch drink, frozen concentrate, prepared with water|fruit punch juice drink, frozen concentrate, prepared with water|lemonade, frozen concentrate, pink, prepared with water|lemonade-flavor drink, powder, prepared with water|Lemonade fruit juice drink light|fruit-flavored drink, powder, with high vitamin C with other added vitamins, low calorie|Cranberry juice cocktail$|cranberry-apple juice drink, bottled|Orange drink, breakfast type, with juice and pulp, frozen concentrate, prepared with water|Apple juice drink, light|Horchata|Chocolate-flavored drink, whey|chocolate-flavor beverage mix, powder, prepared with whole milk|chocolate-flavor beverage mix for milk, powder, with added nutrients, prepared with whole milk|Malted drink mix, (chocolate|natural), powder, prepared with whole milk|Eggnog-flavor mix, powder, prepared with whole milk|Cocoa mix, powder, prepared with water|Cocoa mix, (powder$|no sugar added, powder)|cocoa mix, with aspartame, powder, prepared with water|Cocoa mix, low calorie|Meal supplement drink, canned, peanut flavor|Protein powder (soy|whey) based|Whey protein powder isolate|nutritional shake mix, high protein, powder)/i, force: true, tier: 2, why: 'sweetened drinks, mixes and supplements' },
    { re: /^Beverages, (almond milk, (unsweetened, shelf stable|sweetened, vanilla flavor, ready-to-drink|chocolate, ready-to-drink)|chocolate almond milk, unsweetened|rice milk, unsweetened|coconut milk, sweetened|Coconut water, ready-to-drink|oat milk|cashew milk)/i, force: true, why: 'plant milk' },
    { re: /^Beverages, water, (tap, drinking|tap, municipal|tap, well|bottled, generic|bottled, non-carbonated, (CALISTOGA|CRYSTAL GEYSER|EVIAN|PEPSI, AQUAFINA|DANNON)|bottled, (PERRIER|POLAND SPRING))|^Beverages, (The COCA-COLA company, DASANI|DANNON), water|^Beverages, carbonated water, unsweetened|^Beverages, Water with corn syrup and\/or sugar and low calorie sweetener, fruit flavored|^Beverages, water, bottled, non-carbonated, (NAYA|Vitaminwater)|^Beverages, Vitamin water|^Beverages, Water, bottled, (yumberry|non-carbonated, with fluoride)/i, force: true, tier: 2, why: 'water' },
    { re: /^Alcoholic beverage, (beer, (regular, all|light$|light, higher alcohol|light, low carb)|wine, (table, (all|red$|white$)|dessert, (sweet|dry)|cooking|light)|distilled, all \(gin, rum, vodka, whiskey\) (80|86|90|94|100) proof|distilled, (rum|vodka|whiskey)|liqueur, coffee, (53|63) proof|liqueur, coffee with cream|malt beer, hard lemonade|daiquiri, (canned|prepared-from-recipe)|pina colada|whiskey sour|tequila sunrise|creme de menthe)|^Alcoholic beverages, (beer, higher alcohol|wine, rose)|^Beverages, (AMBER, hard cider|hard cider)|^Alcoholic Beverage, wine, table, red, (Cabernet Sauvignon|Merlot|Pinot Noir|Zinfandel|Syrah)|^Alcoholic beverage, wine, table, white, (Chardonnay|Sauvignon Blanc|Pinot Gris|Riesling|Moscato|Muscat)/i, force: true, why: 'beer, wine, spirits' },
  ],
});

RULES['Soups, Sauces, and Gravies'] = (list) => select(list, {
  include: [
    { re: /^Sauce, (barbecue$|hot chile, sriracha$|ready-to-serve, pepper or hot|pepper, TABASCO|salsa, (ready-to-serve|verde)|pasta, spaghetti\/marinara, ready-to-serve(, low sodium)?$|pesto, ready-to-serve, (shelf stable|refrigerated)|teriyaki, ready-to-serve(, reduced sodium)?$|worcestershire|hoisin|oyster|fish, ready|tartar|horseradish|sweet and sour, ready|cocktail|enchilada|tomato chili sauce|alfredo, ready|cheese, ready|steak, tomato|peanut, made from peanut butter|plum|duck|white, thin, prepared-from-recipe|hollandaise, dehydrated, prepared with water|chili, peppers, hot|peppers, hot, chili, mature red|pizza, canned|alfredo mix, dry|cheese sauce mix, dry|sweet and sour, prepared-from-recipe|homemade, white, (thin|medium|thick)|salsa, verde|tomato chili|mole poblano|mole, dry mix)/i, force: true, why: 'condiment or sauce' },
    { re: /^Soup, (chicken broth, ready-to-serve|chicken broth, less\/reduced sodium, ready to serve|chicken broth, low sodium, canned|chicken broth, canned, prepared with equal volume water|chicken broth, canned, condensed|beef broth or bouillon canned, ready-to-serve|beef broth, less\/reduced sodium, ready to serve|beef broth, bouillon, consomme, prepared with equal volume water|beef broth bouillon and consomme, canned, condensed|vegetable broth, ready to serve|SWANSON, (vegetable broth|beef broth, lower sodium)|stock, (chicken|beef|fish), home-prepared|chicken broth or bouillon, dry(, prepared with water)?|chicken broth cubes, dry(, prepared with water)?|beef broth, cubed, dry(, prepared with water)?|bouillon cubes and granules, low sodium, dry|beef broth or bouillon, powder, (dry|prepared with water))|^Fish broth/i, force: true, why: 'broth, stock, bouillon' },
    { re: /^Soup, (chicken noodle|tomato|cream of mushroom|cream of chicken|cream of celery|cream of potato|cream of asparagus|cream of onion|vegetable beef|vegetable with beef broth|vegetable|vegetarian vegetable|minestrone|clam chowder, new england|clam chowder, manhattan|beef noodle|black bean|bean with bacon|bean with ham|chicken with rice|chicken rice|chicken vegetable|chicken gumbo|chicken and dumplings|onion|pea, split with ham|pea, green|lentil with ham|beef barley|beef mushroom|beef and vegetables|chicken corn chowder|turkey noodle|turkey vegetable|oyster stew|tomato rice|tomato bisque|chili beef|cheese|chunky (beef|chicken|vegetable)|escarole|mushroom barley|pepperpot|scotch broth|hot and sour|egg drop|wonton|ramen noodle|miso|gazpacho|vichyssoise|potato ham chowder|shark fin|sirloin burger)/i, unless: /condensed$|dry$|dry, mix$|low fat|single brand|microwavable|prepared with equal volume milk|prepared with milk/i, force: true, why: 'common canned or dry soup' },
    { re: /^Soup, (cream of mushroom|cream of chicken|tomato|clam chowder, new england|oyster stew|tomato bisque), canned, prepared with equal volume (milk|low fat \(2%\) milk)/i, force: true, tier: 2, why: 'condensed soup prepared with milk' },
    { re: /^(Split pea soup, canned, reduced sodium|Split pea with ham soup, canned, reduced sodium|Soup, (ramen noodle, (any flavor|beef flavor|chicken flavor), dry|beef and mushroom, low sodium|chicken vegetable with potato and cheese|beef stroganoff|mushroom with beef stock, canned, prepared with equal volume water|tomato beef with noodle, canned, prepared with equal volume water|vegetable chicken, canned, prepared with water, low sodium|vegetable soup, condensed, low sodium, prepared with equal volume water|tomato, low sodium, with water|cream of mushroom, low sodium, ready-to-serve, canned|chicken noodle, low sodium, canned, prepared with equal volume water))/i, force: true, tier: 2, why: 'soup variant' },
    { re: /^Gravy, (beef, canned|chicken, canned|turkey, canned|brown, dry|brown instant, dry|mushroom, canned|au jus, canned|meat or poultry, low sodium, prepared|chicken, dry|turkey, dry|onion, dry, mix|pork, dry, powder|instant beef, dry|instant turkey, dry|au jus, dry|unspecified type, dry|mushroom, dry, powder)/i, force: true, tier: 2, why: 'gravy' },
  ],
});

RULES['Fats and Oils'] = (list) => select(list, {
  exclude: [/industrial|partially hydrogenated|lecithin|enova|natreon|corn and canola|corn, peanut, and olive|linoleic|flaxseed, contains|butter replacement|butter, light|with added vitamin d|without salt|palm kernel|soybean, refined/i],
  include: [
    { re: /^Oil, (olive|canola|corn, industrial and retail|vegetable|soybean, salad or cooking$|peanut|sesame|sunflower, high oleic|safflower, salad or cooking, high oleic|coconut|avocado|grapeseed|flaxseed, cold pressed|walnut|almond|palm$|cottonseed)/i, why: 'cooking oil' },
    { re: /^Oil, (hazelnut|rice bran|mustard|wheat germ|apricot kernel|cocoa butter|babassu|oat|poppyseed|sheanut|tomatoseed|teaseed|ucuhuba|cupu|nutmeg|sunflower, linoleic \(less than 60%\)|sunflower, linoleic, \(approx\. 65%\)|safflower, salad or cooking, linoleic|corn and canola|corn, peanut, and olive|soybean, salad or cooking, \(partially hydrogenated\)$|palm kernel|vegetable, soybean, refined|fish, (menhaden|salmon|sardine|herring))/i, force: true, tier: 2, why: 'less common oil' },
    { re: /^(Lard$|Fat, beef tallow|Shortening, vegetable, household|Shortening, household, soybean|Fish oil, cod liver|Fat, chicken|Fat, (duck|goose|turkey|mutton tallow)|Animal fat, bacon grease|Shortening, (household, lard and vegetable oil|special purpose for cakes and frostings)|Butter, light, stick, with salt|Butter replacement)/i, force: true, tier: 2, why: 'solid fat' },
    { re: /^Margarine, regular, 80% fat, composite, (stick|tub), with salt$|^Margarine-like, vegetable oil spread, 60% fat, tub, with salt$|^Margarine-like, vegetable oil-butter spread, tub, with salt$|^Margarine-like, vegetable oil spread, 60% fat, stick, with salt$|^Margarine Spread, 40-49% fat, tub|^Margarine-like, vegetable oil spread, 20% fat, with salt|^Margarine-like, vegetable oil spread, fat-free, tub|^Margarine-like, margarine-butter blend, soybean oil and butter|^Margarine, 80% fat, stick, includes regular and hydrogenated corn and soybean oils|^Margarine, margarine-like vegetable oil spread, 67-70% fat, tub|^Margarine,spread, 35-39% fat, tub|^Margarine-like, vegetable oil-butter spread, reduced calorie, tub, with salt/i, force: true, why: 'margarine and spreads' },
    { re: /^Salad dressing, mayonnaise, regular$|^Salad dressing, mayonnaise, light$|^Mayonnaise, reduced fat, with olive oil|^Salad dressing, mayonnaise type, regular, with salt|^Mayonnaise dressing, no cholesterol|^Mayonnaise, reduced-calorie or diet, cholesterol-free|^Mayonnaise, low sodium, low calorie or diet|^Mayonnaise, made with tofu|^Salad Dressing, mayonnaise-like, fat-free|^Salad dressing, mayonnaise-type, light|^Salad dressing, mayonnaise, soybean and safflower oil, with salt|^Salad dressing, mayonnaise, soybean oil, without salt|^Salad dressing, mayonnaise and mayonnaise-type, low calorie/i, force: true, why: 'mayonnaise' },
    { re: /^Salad dressing, (blue or roquefort cheese dressing, commercial, regular|blue or roquefort cheese dressing, (fat-free|light)|caesar dressing, regular|caesar, (fat-free|low calorie)|french dressing, commercial, regular$|french dressing, (fat-free|reduced fat$|reduced calorie)|italian dressing, (commercial, regular$|commercial, reduced fat|fat-free|reduced calorie)|ranch dressing, (regular|reduced fat|fat-free)|thousand island, commercial, regular|thousand island dressing, (fat-free|reduced fat)|honey mustard, regular|honey mustard dressing, reduced calorie|home recipe, vinegar and oil|coleslaw$|russian dressing$|russian dressing, low calorie|sesame seed dressing, regular|green goddess, regular|buttermilk, lite|peppercorn dressing, commercial, regular|poppyseed, creamy|sweet and sour|bacon and tomato|french, home recipe|spray-style)/i, force: true, why: 'common salad dressing' },
  ],
});

RULES['Sausages and Luncheon Meats'] = (list) => select(list, {
  include: [
    { re: /^(Bacon, turkey, (unprepared|microwaved|low sodium)|Bologna, (beef$|beef and pork$|turkey|pork$|chicken, pork$|beef, low fat|beef and pork, low fat|meat and poultry)|Beef, bologna, reduced sodium|Bratwurst, (pork, cooked|beef and pork, smoked|chicken, cooked|pork, beef, link|veal, cooked)|Braunschweiger|Chicken breast, (oven-roasted, fat-free, sliced|deli, rotisserie seasoned, sliced, prepackaged|roll, oven-roasted|fat-free, mesquite flavor, sliced)|Beef, cured, (corned beef, canned|pastrami|dried|chopped, cured, smoked)|Pastrami, (turkey|beef, 98% fat-free)|Frankfurter, (beef, unheated|beef, heated|turkey|chicken|pork|meat and poultry, unheated|meat and poultry, cooked, (boiled|grilled)|meat$|meat, heated|beef, low fat|low sodium|meat and poultry, low fat|beef, pork, and turkey, fat free)|Ham, (sliced, (regular|pre-packaged)|turkey|honey, smoked, cooked|chopped, (canned|not canned)|smoked, extra lean, low sodium|minced)|Ham and cheese loaf|Ham salad spread|Kielbasa, (fully cooked, unheated|fully cooked, grilled|Polish, turkey and beef, smoked)|Knackwurst|Liver sausage, liverwurst|Liverwurst spread|Luncheon meat, (pork with ham|pork, canned|pork and chicken|pork, ham, and chicken)|Mortadella|Pepperoni|Pork sausage, (link\/patty, (unprepared|cooked, pan-fried|fully cooked, unheated|reduced fat, cooked, pan-fried)|reduced sodium, cooked)|Roast beef, deli style|Roast beef spread|Salami, (dry or hard, pork$|dry or hard, pork, beef|cooked, turkey|italian, pork$|cooked, beef$|cooked, beef and pork|italian, pork and beef, dry, sliced, 50% less sodium|pork, beef, less sodium)|Sausage, (italian, pork, mild, (raw|cooked, pan-fried)|italian, sweet, links|italian, turkey, smoked|pork, chorizo|polish, pork and beef, smoked|polish, beef with chicken, hot|smoked link sausage, pork$|smoked link sausage, pork and beef$|turkey, fresh, (raw|cooked)|turkey, breakfast links, mild, raw|turkey, hot, smoked|turkey and pork, fresh, bulk|turkey, pork, and beef, low fat, smoked|chicken or turkey, italian style|chicken, beef, pork, skinless, smoked|vienna, canned|beef, cured, cooked, smoked|beef, fresh, cooked|breakfast sausage, beef, pre-cooked|pork and beef, fresh, cooked|pork and beef, with cheddar cheese, smoked|pork and turkey, pre-cooked|pork, turkey, and beef, reduced sodium|summer, pork and beef, sticks, with cheddar cheese|turkey, reduced fat, brown and serve)|Polish sausage, pork|Thuringer|Turkey breast, (sliced, prepackaged|low salt, prepackaged or deli)|Turkey, (breast, smoked, lemon pepper|white, rotisserie, deli cut)|Beerwurst, (beer salami, pork$|pork and beef)|Blood sausage|Bockwurst|Cheesefurter|Headcheese|Meatballs, frozen, Italian style|Pate, (chicken liver, canned|liver, not specified, canned)|Scrapple|Corned beef loaf|Olive loaf|Pickle and pimiento loaf|Barbecue loaf|Chicken spread|Poultry salad sandwich spread|Bacon and beef sticks)/i, force: true, why: 'common deli meat or sausage' },
  ],
});

RULES['Fast Foods'] = (list) => select(list, {
  include: [
    { re: /^Fast Food, Pizza Chain, 14" pizza, (cheese|pepperoni|sausage|meat and vegetable) topping, (regular|thin|thick) crust|^Fast Food, Pizza Chain, 14" pizza, cheese topping, stuffed crust|^Pizza, (cheese|pepperoni|meat and vegetable|meat) topping, (regular|thin|rising|thick) crust, frozen, cooked/i, force: true, tier: 2, why: 'generic pizza' },
    { re: /^Fast foods, (hamburger; single, regular patty; (with condiments$|plain)|hamburger; single, large patty; with condiments, vegetables and mayonnaise|hamburger, large, single patty, with condiments|hamburger; double, large patty|hamburger; single, regular patty; double decker|cheeseburger; single, regular patty(, with condiments$|; plain|, with condiments and vegetables)|cheeseburger; single, large patty; (plain|with condiments$|with condiments, vegetables and mayonnaise)|cheeseburger; double, regular patty; with condiments$|cheeseburger; double, regular patty; double decker|cheeseburger, double, regular patty and bun|cheeseburger; double, large patty|potato, french fried in vegetable oil|potato, mashed|chicken, breaded and fried, boneless pieces, plain|chicken tenders|chicken fillet sandwich, plain with pickles|crispy chicken filet sandwich|grilled chicken filet sandwich|crispy chicken in tortilla|grilled chicken in tortilla|crispy chicken, bacon, and tomato club|grilled chicken, bacon and tomato club|fish sandwich, with tartar sauce(, and cheese)?$|fish sandwich, with tartar sauce and cheese|burrito, with beans(, cheese, and beef| and beef| and cheese)?$|breakfast burrito|taco with (beef, cheese and lettuce, (hard shell|soft)|chicken, lettuce and cheese, soft)|taco salad|nachos, with cheese(, beans, ground beef, and tomatoes)?$|quesadilla, with chicken|submarine sandwich, (cold cut|ham|turkey breast|roast beef|tuna|meatball marinara|oven roasted chicken|steak and cheese|bacon, lettuce, and tomato|sweet onion chicken teriyaki|turkey, roast beef and ham)|biscuit, with (egg and sausage|egg and bacon|egg, cheese, and bacon|sausage$|ham$|crispy chicken fillet)|bagel, with egg, sausage patty|croissant, with egg, cheese, and (bacon|ham|sausage)|english muffin, with (egg, cheese, and (canadian bacon|sausage)|cheese and sausage)|griddle cake sandwich, (egg, cheese, and (bacon|sausage)|sausage)|egg, scrambled|french toast sticks|hush puppies|onion rings, breaded and fried|coleslaw|breadstick|miniature cinnamon rolls|sundae, (hot fudge|caramel|strawberry)|vanilla, light, soft-serve ice cream, with cone|shrimp, breaded and fried|chili con carne|hotdog, (plain|with chili|with corn flour coating \(corndog\))|salad, vegetable, tossed, without dressing|chicken, wing, breaded and fried|egg roll)|^Fast Foods, (Fried Chicken, (Breast|Drumstick|Thigh|Wing), meat and skin and breading|Fried Chicken, (Breast|Drumstick|Thigh|Wing), meat only|biscuit, with egg and sausage|grilled chicken filet sandwich|crispy chicken filet sandwich|cheeseburger; (single, regular patty, with condiments$|double, large patty; with condiments, vegetables and mayonnaise))|^Fast food, biscuit$|^Light Ice Cream, soft serve, blended with (cookie pieces|milk chocolate candies)/i, force: true, tier: 2, why: 'generic fast food' },
  ],
});

RULES['Meals, Entrees, and Side Dishes'] = (list) => select(list, {
  include: [
    { re: /^(Beef stew, canned|Beef, corned beef hash|Chili con carne with beans, canned|Chili, no beans, canned|Chili with beans, microwavable bowls|Macaroni and cheese, box mix with cheese sauce, prepared|Macaroni and cheese, dry mix, prepared with 2% milk|Macaroni and Cheese, canned entree|Macaroni and cheese, frozen entree|Lasagna with meat sauce, frozen, prepared|Lasagna, cheese, frozen, prepared|Lasagna with meat & sauce, frozen entree$|Lasagna, Vegetable, frozen, baked|Chicken pot pie, frozen entree, prepared|Beef Pot Pie, frozen entree, prepared|Turkey Pot Pie|Corn dogs, frozen, prepared|Chicken, nuggets, (white meat|dark and white meat)|Chicken tenders, breaded, frozen, prepared|Chicken, thighs, frozen, breaded, reheated|Burrito, (bean and cheese|beef and bean), frozen|Egg rolls, (vegetable, frozen, prepared|chicken, refrigerated, heated|pork, refrigerated, heated)|Pizza rolls, frozen, unprepared|Ravioli, (cheese-filled, canned|meat-filled|cheese with tomato sauce, frozen)|Spaghetti, with meatballs in tomato sauce, canned|Spaghetti with meat sauce, frozen entree|Pasta with tomato sauce, no meat, canned|Pasta with Sliced Franks|Tortellini, pasta with cheese filling|Rice and vermicelli mix, (chicken|beef|rice pilaf) flavor, prepared|Spanish rice mix, dry mix, prepared|Rice bowl with chicken|Beef macaroni with tomato sauce|Salisbury steak with gravy, frozen|Potato salad with egg|Potsticker or wonton|Dumpling, potato- or cheese-filled|Pulled pork in barbecue sauce|Taquitos, frozen, (beef|chicken) and cheese|Turnover, (chicken- or turkey-|meat- and cheese-filled|cheese-filled|filled with egg)|Turkey, stuffing, mashed potatoes|Sausage, egg and cheese breakfast biscuit|Yellow rice with seasoning|Rice mix, (cheese flavor|white and wild)|Pasta mix, (classic beef|classic cheeseburger macaroni|Italian lasagna|Italian four cheese lasagna))/i, force: true, tier: 2, why: 'generic prepared meal' },
  ],
});

// ---------------------------------------------------------------------------
// Short names
// ---------------------------------------------------------------------------

const PREFIXES = /^(Spices, |Nuts, |Seeds, |Fish, |Crustaceans, |Mollusks, |Beverages, |Cereals ready-to-eat, |Cereals, |Alcoholic beverages?, |Snacks?, |Fast foods?, |Soup, |Candies, |Salad dressing, |Game meat, |Oil, |Cheese, |Egg, |Milk, |Cream, |Bread, |Crackers, |Cookies, |Rolls, |Sauce, |Gravy, |Pork, cured, |Pork, fresh, |Pork, |Beef, |Lamb, |Veal, |Chicken, broilers? or fryers, |Chicken, |Turkey, retail parts, |Turkey, whole, |Turkey, |Yogurt, |Tomato products, canned, )/i;
const PREFIX_WORD = {
  'spices, ': '', 'nuts, ': '', 'seeds, ': '', 'fish, ': '', 'crustaceans, ': '', 'mollusks, ': '', 'beverages, ': '',
  'cereals ready-to-eat, ': '', 'cereals, ': '', 'alcoholic beverage, ': 'alcoholic beverage, ', 'alcoholic beverages, ': 'alcoholic beverages, ', 'snacks, ': '', 'snack, ': '',
  'fast foods, ': '', 'fast food, ': '', 'soup, ': 'soup, ', 'candies, ': '', 'salad dressing, ': 'dressing, ', 'game meat, ': '',
  'oil, ': 'oil, ', 'cheese, ': 'cheese, ', 'egg, ': 'egg, ', 'milk, ': 'milk, ', 'cream, ': 'cream, ', 'bread, ': 'bread, ',
  'crackers, ': 'crackers, ', 'cookies, ': 'cookies, ', 'rolls, ': 'rolls, ', 'sauce, ': 'sauce, ', 'gravy, ': 'gravy, ',
  'pork, cured, ': '', 'pork, fresh, ': 'pork, ', 'pork, ': 'pork, ', 'beef, ': 'beef, ', 'lamb, ': 'lamb, ', 'veal, ': 'veal, ',
  'chicken, broilers or fryers, ': 'chicken, ', 'chicken, broiler or fryers, ': 'chicken, ', 'chicken, ': 'chicken, ',
  'turkey, retail parts, ': 'turkey, ', 'turkey, whole, ': 'turkey, whole, ', 'turkey, ': 'turkey, ', 'yogurt, ': 'yogurt, ',
  'tomato products, canned, ': 'tomato, canned, ',
};
const NOISE_PHRASES = [
  [/\s*\((may contain|may have|includes|include|approximately|liquid expressed|liquid from)[^)]*\)/gi, ''],
  [/\s*\(garbanzo beans, bengal gram\)/gi, ''], [/\s*\(blackeyes, crowder, southern\)/gi, ' (black-eyed peas)'],
  [/,? mature seeds?/gi, ''], [/,? immature seeds/gi, ''], [/,? separable lean and fat/gi, ''], [/,? separable lean only/gi, ', lean only'],
  [/,? trimmed to [0-9\/]+" fat/gi, ''], [/,? all grades/gi, ''], [/,? choice\b/gi, ''], [/,? select\b/gi, ''],
  [/,? boneless, lip off/gi, ', boneless'], [/,? lip-on/gi, ''], [/,? lip off/gi, ''],
  [/cooked, boiled, drained,? (without salt|no salt added)/gi, 'cooked'], [/cooked, boiled,? without salt/gi, 'cooked'],
  [/cooked, boiled, drained, or baked, without salt/gi, 'cooked'], [/cooked, (baked|steamed|boiled, mashed), without salt/gi, 'cooked, $1'],
  [/baked, without salt/gi, 'baked'], [/cooked, without salt/gi, 'cooked'], [/cooked, no salt added/gi, 'cooked'], [/cooked, boiled, drained$/gi, 'cooked'],
  [/cooked, dry heat/gi, 'cooked'], [/cooked, moist heat/gi, 'cooked'], [/cooked, steamed/gi, 'steamed'],
  [/,? solids and liquids?/gi, ''], [/, drained solids/gi, ', drained'], [/,? regular pack/gi, ''], [/, no salt added/gi, ', no salt'],
  [/,? with added vitamin a and vitamin d/gi, ''], [/,? with added vitamin d/gi, ''], [/,? with added calcium$/gi, ', calcium added'],
  [/,? fluid/gi, ''], [/,? ready[- ]to[- ]serve/gi, ''], [/canned or bottled/gi, 'bottled'], [/,? commercially prepared/gi, ''],
  [/,? salad or cooking/gi, ''], [/, year round average/gi, ''], [/, all commercial varieties/gi, ''], [/, pink and red and white, all areas/gi, ''],
  [/, all areas/gi, ''], [/,? unenriched/gi, ''], [/,? enriched/gi, ''], [/, with calcium propionate/gi, ''], [/, sulfured/gi, ''], [/, uncooked/gi, ''],
  [/, prepared with (equal volume )?water/gi, ''], [/ made from soy( and wheat)?/gi, ''], [/,? \(shoyu\)/gi, ' (shoyu)'],
  [/,? prepared with (calcium sulfate and magnesium chloride|calcium sulfate|nigari)( \(nigari\))?/gi, ''], [/ \(nigari\)/gi, ''],
  [/,? all types/gi, ''], [/,? mixed species/gi, ''], [/, atlantic and pacific/gi, ''], [/, \(bay and sea\)/gi, ''], [/ \(flounder and sole species\)/gi, ''],
  [/, from raw and stone ground kernels/gi, ', raw'], [/, from roasted and toasted kernels/gi, ''], [/ \(decorticated\)/gi, ''],
  [/, dried \(desiccated\)/gi, ', dried'], [/, meat only/gi, ''], [/, plain or buttermilk/gi, ''],
  [/, regular and quick, not fortified, dry/gi, ', dry'], [/, regular and quick, unenriched, cooked with water, without salt/gi, ', cooked'],
  [/, regular and quick, enriched/gi, ''], [/, cooked with water, without salt/gi, ', cooked'], [/, fortified, plain/gi, ', plain'],
  [/kellogg's, kellogg's /gi, ''], [/general mills, /gi, ''], [/post, /gi, ''], [/post /gi, ''], [/ralston /gi, ''], [/quaker, /gi, ''], [/, original spoon-size/gi, ''],
  [/, standard-type, frozen, ready-to-bake/gi, ', frozen'], [/ready-to-bake or -fry, /gi, ''],
  [/, prepared with tap water/gi, ''], [/, brewed/gi, ', brewed'], [/^alcoholic beverages?, distilled, /gi, 'spirits, '], [/^alcoholic beverages?, /gi, ''], [/, \(gin, rum, vodka, whiskey\)/gi, ' (gin, rum, vodka, whiskey)'],
  [/, low calorie, cola or pepper-type, with aspartame, contains caffeine/gi, ', diet cola'], [/, low calorie, cola or pepper-type, with aspartame, without caffeine/gi, ', diet cola, caffeine-free'],
  [/, low calorie, other than cola or pepper,\s+without caffeine/gi, ', diet, non-cola'], [/ with carbonated water and high fructose corn syrup/gi, ''],
  [/, cultured/gi, ''], [/, cooked, pan-fried/gi, ', pan-fried'], [/, pre-sliced/gi, ''], [/, patty, cooked, broiled/gi, ', patty, broiled'],
  [/, lean meat \/ /gi, ' lean / '], [/(\d+)% lean \/ (\d+)% fat/gi, '$1/$2'], [/, extra lean and regular/gi, ''],
  [/, frozen, chopped or leaf/gi, ', frozen'], [/, flesh and skin/gi, ''], [/, includes skin/gi, ''], [/, crookneck and straightneck/gi, ', yellow'],
  [/, kernels cut off cob/gi, ''], [/, whole kernel/gi, ''], [/, red, ripe/gi, ''], [/, european/gi, ''], [/, domesticated/gi, ''],
  [/, refrigerated$/gi, ''], [/ \(includes.*\)$/gi, ''], [/, plain, with salt added$/gi, ', salted'], [/, with salt added/gi, ', salted'], [/, without salt added/gi, ', unsalted'],
  [/, with salt$/gi, ', salted'], [/, without salt$/gi, ', unsalted'], [/, salted$/gi, ', salted'],
  [/, whole, 3\.25% milkfat/gi, ', whole'], [/, reduced fat, 2% milkfat/gi, ', 2%'], [/, lowfat, 1% milkfat/gi, ', 1%'], [/, nonfat/gi, ', nonfat'],
  [/ \(fat free or skim\)/gi, ''], [/, fat free and skim/gi, ''],
];
function shortName(desc) {
  let s = desc;
  const m = s.match(PREFIXES);
  if (m) { const key = m[0].toLowerCase(); s = (PREFIX_WORD[key] ?? '') + s.slice(m[0].length); }
  for (const [r, rep] of NOISE_PHRASES) s = s.replace(r, rep);
  s = s.replace(/\s+/g, ' ').replace(/\s*,\s*,+/g, ',').replace(/^[,\s]+|[,\s]+$/g, '').replace(/\s*,\s*/g, ', ').trim();
  s = s.replace(/ ,/g, ',');
  if (s.length) s = s[0].toUpperCase() + s.slice(1);
  return s;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const CATEGORY_ORDER = Object.keys(RULES);
const picked = []; // {food, tier, why}
const perCategory = {};
for (const cat of CATEGORY_ORDER) {
  const list = byCat.get(cat) || [];
  const seen = new Set();
  const chosen = [];
  for (const p of RULES[cat](list)) {
    const id = p.food.fdcId;
    if (seen.has(id)) continue;
    if (manualIds.has(id) || fillIds.has(id)) { if (EXPLAIN && EXPLAIN.test(p.food.desc)) console.log(`  [${cat}] ${id} ${p.food.desc}\n      -> already in selection (${manualIds.has(id) ? 'existing entry' : 'fill_from of an existing entry'})`); continue; }
    seen.add(id);
    chosen.push(p);
  }
  perCategory[cat] = chosen;
  picked.push(...chosen);
  if (LIST) {
    console.log(`\n== ${cat} (${chosen.length})`);
    for (const p of chosen) console.log(`  ${p.tier === 2 ? '·' : ' '} ${p.food.fdcId}  ${p.food.desc}`);
  }
}

// Cap: while the total exceeds the cap, drop one tier-2 (less common) entry
// from whichever category currently has the most new entries.
let total = manual.length + picked.length;
const dropped = {};
while (total > CAP) {
  const cat = CATEGORY_ORDER
    .filter((c) => perCategory[c].some((p) => p.tier === 2))
    .sort((a, b) => perCategory[b].length - perCategory[a].length)[0];
  if (!cat) break;
  const list = perCategory[cat];
  const idx = list.map((p, i) => (p.tier === 2 ? i : -1)).filter((i) => i >= 0).pop();
  list.splice(idx, 1);
  dropped[cat] = (dropped[cat] || 0) + 1;
  total--;
}

// Assemble entries.
const shortCounts = new Map();
for (const e of manual) shortCounts.set(e.short, (shortCounts.get(e.short) || 0) + 1);
const manualShorts = new Set(manual.map((e) => e.short));
const skippedTwins = [];
const newEntries = [];
for (const cat of CATEGORY_ORDER) {
  const list = perCategory[cat].slice().sort((a, b) => a.food.desc.localeCompare(b.food.desc));
  for (const p of list) {
    const f = p.food;
    let short = shortName(f.desc);
    if (!short) short = f.desc;
    if (manualShorts.has(short)) { skippedTwins.push(`${f.fdcId} ${f.desc} (same short name as an existing entry: "${short}")`); continue; }
    if (shortCounts.has(short)) short = f.desc;
    if (shortCounts.has(short)) short = `${short} [${f.fdcId}]`;
    shortCounts.set(short, 1);
    const prev = previousAuto.get(f.fdcId);
    const entry = {
      fdcId: f.fdcId,
      short,
      tags: prev ? prev.tags : [],
      portions_add: prev ? prev.portions_add || [] : [],
      why: `expand-selection: ${cat} - ${p.why}`,
      tag_review: prev ? prev.tag_review || [] : [],
      auto: { category: cat, name: f.raw, tier: p.tier, tagged: prev && prev.auto ? !!prev.auto.tagged : false },
    };
    if (prev && prev.auto && prev.auto.tag_sources) entry.auto.tag_sources = prev.auto.tag_sources;
    if (prev && prev.tags_pending_vocabulary) entry.tags_pending_vocabulary = prev.tags_pending_vocabulary;
    if (prev && prev.tag_notes) entry.tag_notes = prev.tag_notes;
    newEntries.push(entry);
  }
}

const finalSelection = [...manual, ...newEntries];

// Report
console.log(`SR Legacy dir: ${path.relative(ROOT, SR_DIR)}`);
console.log(`Existing hand-written entries kept unchanged: ${manual.length} (previously auto-added: ${previousAuto.size})`);
console.log('New entries per category:');
for (const cat of CATEGORY_ORDER) {
  const n = perCategory[cat].length;
  const t2 = perCategory[cat].filter((p) => p.tier === 2).length;
  console.log(`  ${String(n).padStart(4)}  ${cat}${t2 ? `  (tier 2: ${t2})` : ''}${dropped[cat] ? `  dropped ${dropped[cat]} to fit cap` : ''}`);
}
if (skippedTwins.length) console.log(`Skipped ${skippedTwins.length} SR twins of existing foods:\n  ${skippedTwins.join('\n  ')}`);
console.log(`Total: ${finalSelection.length} entries (${manual.length} existing + ${newEntries.length} new; cap ${CAP})`);
if (!DRY) {
  fs.writeFileSync(SELECTION_PATH, JSON.stringify(finalSelection, null, 2) + '\n');
  console.log(`Wrote ${path.relative(ROOT, SELECTION_PATH)}`);
} else {
  console.log('(dry run, nothing written)');
}
