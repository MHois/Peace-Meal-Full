#!/usr/bin/env node
// tools/food-autotag.mjs
//
// Assigns tags to the entries that tools/expand-selection.mjs added to
// tools/food-selection.json (the ones carrying an `auto` block). Hand-written
// entries are never touched.
//
// Two mechanisms, then a conflict check:
//   1. Dictionary: the USDA description is run through the same matcher the
//      app uses for ingredient text (src/engine/dictionary.js over
//      data/dictionaries.json). Only tags in the allowed families are kept.
//   2. Category rules: the SR Legacy category plus a few description words
//      add the structural tags (vegetable, red-meat, allergen-milk, ...).
//   3. Conflicts: when the two mechanisms disagree, both tags are left off and
//      recorded in the entry's tag_review list (the convention the selection
//      file already uses). Two narrow exceptions keep the review list about
//      real ambiguity rather than dictionary generality:
//        - descriptor families (lactose-*, low/full-fat-dairy, whole/refined
//          grain): the dictionary keys on the generic food word ("bread",
//          "cheese", "ice cream") while the USDA name carries the deciding
//          descriptor ("whole-wheat", "fat free", "part skim"); the rule wins
//          and the dropped dictionary tag is recorded in auto.tag_sources.overridden.
//        - specificity pairs (purine-high/-moderate, mercury-high/-low-fish)
//          supplied by the dictionary alone: the specific species term wins
//          over the generic "fish"/"beef" term; a rule opinion breaks a tie.
//
// Tags that the dictionary declares but tools/build-foods.mjs does not accept
// yet (basic-ingredient, tea) are written to tags_pending_vocabulary so they
// can be moved into tags once the build vocabulary grows.
//
// Usage: node tools/food-autotag.mjs [--dry] [--show <regex>]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMatcher } from '../src/engine/dictionary.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELECTION_PATH = path.join(ROOT, 'tools', 'food-selection.json');
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const showIdx = argv.indexOf('--show');
const SHOW = showIdx >= 0 ? new RegExp(argv[showIdx + 1], 'i') : null;

// Mirrors TAG_VOCABULARY in tools/build-foods.mjs (the build rejects anything else).
const BUILD_VOCABULARY = new Set([
  'allergen-milk', 'allergen-egg', 'allergen-fish', 'allergen-crustacean', 'allergen-tree-nut', 'allergen-peanut', 'allergen-wheat', 'allergen-soy', 'allergen-sesame',
  'gluten', 'gluten-hidden', 'oats-regular', 'oats-certified-gf', 'soy', 'soy-refined-oil', 'soy-lecithin', 'lactose-high', 'lactose-low', 'lactose-hidden',
  'added-sugar', 'sugar-sweetened-beverage', 'non-nutritive-sweetener', 'fodmap-fructan', 'fodmap-gos', 'fodmap-lactose', 'fodmap-fructose', 'fodmap-sorbitol', 'fodmap-mannitol',
  'histamine-high', 'histamine-fermented', 'histamine-aged', 'phosphate-additive', 'potassium-additive', 'potassium-high-food', 'oxalate-high', 'purine-high', 'purine-moderate',
  'unpasteurized', 'raw-animal', 'deli-meat', 'mercury-high', 'mercury-low-fish', 'raw-sprouts', 'alcohol', 'caffeine',
  'vegetable', 'fruit', 'whole-grain', 'refined-grain', 'legume', 'nut', 'seed', 'fish', 'poultry', 'red-meat', 'processed-meat', 'low-fat-dairy', 'full-fat-dairy', 'olive-oil',
  'ultra-processed', 'fried', 'high-fiber-insoluble', 'small-particle-friendly', 'fermented-live-culture', 'large-particle', 'skin-or-seed', 'raw-vegetable', 'tough-meat', 'bezoar-risk',
  'iron-supplement', 'calcium-rich', 'high-fiber', 'coffee',
]);

// Families the brief allows the dictionary to contribute.
const ALLOWED_EXACT = new Set(['gluten', 'soy', 'oxalate-high', 'phosphate-additive', 'potassium-high-food', 'deli-meat', 'processed-meat', 'red-meat', 'poultry', 'fish',
  'vegetable', 'fruit', 'whole-grain', 'refined-grain', 'legume', 'nut', 'seed', 'olive-oil', 'low-fat-dairy', 'full-fat-dairy', 'sugar-sweetened-beverage', 'added-sugar',
  'caffeine', 'alcohol', 'coffee', 'tea', 'raw-animal', 'raw-vegetable', 'fermented-live-culture', 'basic-ingredient']);
const ALLOWED_PREFIX = ['allergen-', 'lactose-', 'fodmap-', 'histamine-', 'purine-', 'mercury-'];
const isAllowed = (t) => ALLOWED_EXACT.has(t) || ALLOWED_PREFIX.some((p) => t.startsWith(p));

// Pairs that cannot both be true of one food.
// [specific/descriptor tag, generic tag]
const CONTRADICTIONS = [
  ['lactose-high', 'lactose-low'], ['whole-grain', 'refined-grain'], ['low-fat-dairy', 'full-fat-dairy'],
  ['purine-high', 'purine-moderate'], ['mercury-high', 'mercury-low-fish'],
];
const DESCRIPTOR_PAIRS = new Set(['lactose-high', 'lactose-low', 'whole-grain', 'refined-grain', 'low-fat-dairy', 'full-fat-dairy']);

const dictionaries = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'dictionaries.json'), 'utf8'));
const matcher = buildMatcher(dictionaries);
const selection = JSON.parse(fs.readFileSync(SELECTION_PATH, 'utf8'));

const FDP = /\s*\(Includes foods for USDA's Food Distribution Program\)/i;
// USDA jargon that misleads an ingredient dictionary ("mature seeds" is not a
// seed, "choice" is a grade, "kidney" beans are not kidneys). Removed from the
// text the dictionary sees; the category rules still see the full name.
const JARGON = [
  /\(may (contain|have)[^)]*\)/gi, /,? (mature|immature) seeds?/gi, /,? separable lean (and fat|only)/gi, /,? trimmed to [0-9\/]+" fat/gi,
  /,? (all grades|choice|select|prime)\b/gi, /,? (solids and liquids?|drained solids|regular pack|total can contents)/gi, /,? with added (vitamin|calcium|nutrients)[^,]*/gi,
  /,? broilers? or fryers/gi, /,? meat (only|and skin)/gi, /,? (dry|moist) heat/gi, /,? ready[- ]to[- ](serve|drink|eat|heat|bake)/gi, /,? commercially prepared/gi,
  /,? prepared with (equal volume )?(tap )?water/gi, /,? year round average/gi, /,? all (commercial )?(varieties|areas|classes|types)/gi, /,? retail parts/gi,
  /,? (bone-in|boneless|lip-on|lip off)/gi, /,? (large|small) end \(ribs [0-9-]+\)/gi, /,? \(ribs [0-9-]+\)/gi, /,? \(chops( or roasts)?\)|,? \(roasts\)|,? \(steaks\)/gi,
  /,? mixed species/gi, /,? (farmed|wild)\b/gi, /,? in skin|,? without skin/gi, /,? flesh( and skin)?/gi, /,? with(out)? salt( added)?/gi, /,? no salt added/gi,
  /,? (unprepared|unheated|uncooked|as purchased)/gi, /,? frozen concentrate/gi, /,? diluted with [0-9]+ volume water/gi, /,? kidney, (all types|red|california red|royal red)/gi,
  /\bkidney beans?\b/gi, /beans, kidney/gi, /,? sulfured/gi, /,? low-moisture|,? dehydrated/gi, /,? (regular and quick|not fortified|fortified|enriched|unenriched)/gi,
];
const jargonFree = (d) => JARGON.reduce((t, r) => t.replace(r, (m) => (/kidney/i.test(m) ? m.replace(/kidney/gi, 'red bean') : '')), d).replace(/\s+,/g, ',').replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------
// Category rules
// ---------------------------------------------------------------------------

const TREE_NUT = /almond|walnut|pecan|cashew|pistachio|hazelnut|filbert|macadamia|brazil|pine nut|pinyon/i;
const SOY = /\bsoy|soybean|soymilk|tofu|tempeh|miso|natto|edamame|shoyu|tamari|okara/i;
const WHEAT = /wheat|\bpasta\b|noodles, egg|semolina|couscous|bulgur|spelt|kamut|durum|farina|cream of wheat|seitan|vital wheat gluten|\bbread\b|bagel|cracker|cookie|\bcake\b|\bpie\b|muffin|pancake|waffle|tortillas?, .*flour|flour, white|all-purpose|biscuit|croissant|\brolls?\b|doughnut|pretzel|soba|chow mein|shoyu|matzo|graham|crouton|stuffing|crumbs|brownie|danish|cinnamon (buns|rolls)|toaster pastries|french toast|english muffin|sweet rolls|pizza|burrito|sandwich|taco, soft|lasagna|ravioli|tortellini|spaghetti|macaroni|egg roll|pot pie|corn dog|breaded|batter|fish sticks|hush puppies|onion rings|french crullers|fig bars|wafers|shortbread|dumpling|wonton|potsticker|pasta mix|vermicelli|ramen|bran flakes|shredded wheat|grape-nuts|wheaties|total$|fiber one|honey bunches|life, plain|oatmeal squares|frosted flakes|raisin bran|chex|cheese sauce mix|alfredo mix|gravy, .*dry|bouillon/i;
const NOT_WHEAT = /gluten-free|rice cake|crackers, rice|tortillas?, ready-to-bake or -fry, corn|taco shells|buckwheat$|buckwheat groats|buckwheat flour|corn(meal|starch| flour| grits| bran)|hominy|^rice|rice, (brown|white|wild)|wild rice|rice noodles|rice flour|quinoa|millet|amaranth|teff|sorghum|^oats$|oat bran|oat flour|popcorn|tortilla chips|potato chips|corn chips|corn-based|corn cakes|rice krispies|corn chex|rice chex|corn flakes|puffed|granola, homemade|wheat germ|tapioca|arrowroot|plantain|sweet potato chips|taro chips|pork skins|banana chips|fruit leather|beef jerky|trail mix|nuts,|seeds,|cheese puffs|frozen novelties|gelatin|pudding|sherbet|ice cream|frozen yogurt|distilled|wine|cider|liqueur|vodka|rum|whiskey|gin\b/i;
const BARLEY_RYE = /barley|\brye\b|pumpernickel|malt/i;
const WHOLE_GRAIN = /brown rice|rice, brown|\boats?\b|oat bran|oatmeal|quinoa|barley, hulled|barley flour|bulgur|whole.wheat|whole.grain|buckwheat|millet|amaranth|teff|sorghum|spelt|kamut|wild rice|rye grain|rye flour, dark|wheat bran|wheat germ|cornmeal, whole|corn flour, whole|popcorn|bran flakes|shredded wheat|granola|puffed|multi-grain|multigrain|pumpernickel|bread, rye|rye, wafers|cracked-wheat|wheat, sprouted|bread, wheat, sprouted|grape-nuts|wheaties|total$|fiber one|chex|cheerios|oatmeal squares|life, plain|raisin bran|honey bunches|corn cakes|rice cakes, brown|hominy|masa|corn tortilla|tortillas?, ready-to-bake or -fry, corn|taco shells|wheat, (durum|hard|soft)/i;
const REFINED_GRAIN = /white rice|rice, white|^pasta(?!.*whole)|noodles, egg|semolina|couscous|flour, white|all-purpose|bread flour|cake flour|cornstarch|degermed|farina|cream of wheat|grits|rice noodles|rice flour, white|somen|tapioca|arrowroot|bread, (white|italian|french|egg|potato|raisin|cinnamon|naan, plain|pita, white|reduced-calorie, white|reduced-calorie, wheat|wheat$|cheese|oat bran|oatmeal|crumbs|stuffing|sticks|pound cake)|bagels, (plain|cinnamon|egg)|rolls, (dinner, plain|hamburger|hard|french|dinner, egg|dinner, wheat)|english, (plain|wheat)|muffins, (blueberry|corn|plain)|crackers(?!.*whole)|saltines(?!.*whole)|pretzel(?!.*whole)|tortillas?, .*flour(?!.*whole)|corn flakes|rice krispies|frosted flakes|cake|pie|cookie|doughnut|croissant|danish|cinnamon buns|sweet rolls|toaster pastries|biscuit|pancake(?!.*whole)|waffle(?!.*whole)|french toast|brownie|wafers|pizza|burrito|sandwich|taco, soft|lasagna|ravioli|tortellini|spaghetti|macaroni|egg roll|pot pie|corn dog|breaded|batter|fish sticks|hush puppies|onion rings|dumpling|wonton|potsticker|pasta mix|vermicelli|ramen|barley, pearled|matzo, plain|graham|croutons|chow mein|soba|noodles, chinese, cellophane/i;
const ORGAN = /liver|giblets|gizzard|heart|kidney|sweetbread|brain|tongue|tripe|pate|braunschweiger|liverwurst|liver sausage|liver cheese/i;
const NO_SUGAR = /unsweetened|no sugar|sugar free|sugar-free|sugarless|diet\b|low calorie|zero|light$|aspartame|sucralose|saccharin|stevia|sugar substitute|club soda|tonic water, without|water, (tap|bottled)|carbonated water|coffee, (brewed|instant, regular|instant, decaffeinated)|tea, .*(brewed|unsweetened)|beer|wine|distilled|whiskey|vodka|rum\b|hard cider|gelatins, dry powder|baking chocolate|cocoa, dry powder|protein powder|nutritional shake/i;
const SWEET_DRINK = /cola|soda|ginger ale|pepper-type|root beer|tonic water|energy drink|fruit punch|lemonade|sweetened|gatorade|powerade|sports drink|cranberry juice cocktail|cranberry-apple|orange drink|apple juice drink|horchata|chocolate|malted|cocoa mix|eggnog|liqueur|daiquiri|pina colada|whiskey sour|tequila sunrise|hard lemonade|creme de menthe|limeade|cream soda|grape soda|carbonated, orange|coffee, instant, mocha|coffee, ready to drink|tea, .*(lemon, sweetened|ginseng and honey|sweetened with sugar)|ready-to-drink, sweetened|juice drink/i;
const RAW_ANIMAL = /\braw\b|smoked|lox|kippered|pickled|ceviche|sashimi|tartare/i;
const DELI = /sliced|deli|luncheon|bologna|salami|pastrami|ham, (sliced|chopped|minced|honey|turkey)|turkey breast|turkey, breast|chicken breast|roast beef|mortadella|pepperoni|liverwurst|braunschweiger|liver sausage|loaf|spread|corned beef|frankfurter|hot dog|wiener|knackwurst|kielbasa|smoked|thuringer|summer sausage|headcheese|scrapple|pate|beef, cured|vienna|beef sticks|beerwurst|bockwurst|cheesefurter|prosciutto|blood sausage|dried/i;
const FRESH_SAUSAGE = /raw$|unprepared$|fresh, raw|breakfast links, mild, raw|fresh, cooked|link\/patty, (unprepared|cooked, pan-fried)|italian, pork, mild|italian, sweet, links|chorizo|bratwurst, pork, cooked$|bratwurst, veal|bratwurst, chicken|turkey, fresh|turkey and pork, fresh|pork and beef, fresh|beef, fresh|pork, turkey, and beef, reduced sodium|pork and turkey, pre-cooked|breakfast sausage/i;
const RED_MEAT_WORD = /\bbeef\b|\bpork\b|\bham\b|\bbacon\b(?!, turkey)|salami|pepperoni|bratwurst(?!, chicken)|kielbasa|knackwurst|liverwurst|braunschweiger|mortadella|pastrami(?!, turkey)|thuringer|polish sausage|chorizo|scrapple|headcheese|blood sausage|corned beef|veal|lamb|bockwurst|beerwurst|cheesefurter|swisswurst|pork skins/i;
const POULTRY_WORD = /turkey|chicken|duck|goose/i;

function categoryRules(cat, d, tags, notes) {
  const add = (...ts) => { for (const t of ts) tags.add(t); };
  const raw = /\braw\b/i.test(d);
  switch (cat) {
    case 'Spices and Herbs':
      add('basic-ingredient');
      if (/vanilla extract(?!.*no alcohol)/i.test(d)) add('alcohol');
      break;
    case 'Vegetables and Vegetable Products':
      add('vegetable');
      if (raw && !/pickled|canned|sprouted/i.test(d)) add('raw-vegetable');
      if (/sprouted, raw|alfalfa seeds, sprouted/i.test(d)) add('raw-vegetable');
      if (/catsup|relish|pickles, cucumber, sweet|sweet potato, cooked, candied|harvard|pumpkin pie mix/i.test(d)) add('added-sugar');
      break;
    case 'Fruits and Fruit Juices':
      if (!/juice|nectar/i.test(d)) add('fruit');
      if (/sweetened(?!.*unsweetened)|syrup|cranberry sauce|nectar|candied|dried, sweetened|juice drink|cocktail/i.test(d) && !/unsweetened/i.test(d)) add('added-sugar');
      break;
    case 'Legumes and Legume Products':
      if (/peanut/i.test(d)) { add('allergen-peanut', 'nut'); if (/reduced fat|reduced sugar|omega|fortified/i.test(d)) add('added-sugar'); }
      else if (/\bbeans?\b|lentil|\bpeas\b|chickpea|garbanzo|hummus|falafel|refried|frijoles|cowpeas|pigeon peas|broadbeans|fava|lima|mung|adzuki|lupin/i.test(d)) add('legume', 'fodmap-gos');
      if (/soybeans, mature|edamame|natto|tempeh/i.test(d)) add('legume', 'fodmap-gos');
      if (/tofu|miso/i.test(d)) add('legume');
      if (SOY.test(d)) add('allergen-soy', 'soy');
      if (/baked, canned|adzuki.*sweetened|soymilk, chocolate|soymilk, original and vanilla, with|soy yogurt|yokan/i.test(d) && !/no salt added|unsweetened/i.test(d)) add('added-sugar');
      if (/soymilk|soy yogurt/i.test(d) && /nonfat|lowfat|light/i.test(d)) notes.push('plant milk: low-fat wording refers to soy milk, not dairy');
      break;
    case 'Nut and Seed Products':
      if (/^nuts,/i.test(d) && !/coconut/i.test(d)) add('nut');
      if (/^seeds,/i.test(d)) add('seed');
      if (TREE_NUT.test(d)) add('allergen-tree-nut');
      if (/with peanuts/i.test(d)) add('allergen-peanut');
      if (/sesame|tahini/i.test(d)) add('allergen-sesame');
      if (/sweetened|honey roasted|glazed|almond paste|coconut cream, canned/i.test(d) && !/not sweetened|unsweetened/i.test(d)) add('added-sugar');
      break;
    case 'Cereal Grains and Pasta':
    case 'Breakfast Cereals':
    case 'Baked Products':
    case 'Snacks':
      if (WHOLE_GRAIN.test(d)) add('whole-grain');
      else if (REFINED_GRAIN.test(d)) add('refined-grain');
      if (cat === 'Breakfast Cereals' && !/oats|grits|cream of wheat|farina|puffed|wheat germ|shredded wheat, original|bran flakes|corn flakes|grape-nuts|cheerios$|wheat chex|rice chex|corn chex|kix|wheaties|total$|life, plain/i.test(d)) add('added-sugar');
      if (cat === 'Breakfast Cereals' && /granola|honey|frosted|raisin bran|oatmeal squares|cinnamon|cocoa|lucky|golden|maple|fiber one/i.test(d)) add('added-sugar');
      if (cat === 'Snacks' && /caramel|granola bar|breakfast bars|fruit leather|banana chips|trail mix, .*chocolate|kudos|crisped rice bar|sweet potato chips|cakes|coated/i.test(d)) add('added-sugar');
      if (cat === 'Baked Products' && /cookie|cake|pie(?! crust)|doughnut|brownie|danish|cinnamon|sweet rolls|toaster pastries|muffins, blueberry|muffins, corn|bread, raisin|bread, cinnamon|croissants, apple|graham|fig bars|wafers|coffeecake|snack cakes|cream pie|pound|waffles, chocolate|french toast|pancakes|bagels, cinnamon/i.test(d)) add('added-sugar');
      break;
    case 'Dairy and Egg Products':
      if (/^egg,|^eggs,/i.test(d)) {
        add('allergen-egg');
        if (raw) add('raw-animal');
        if (/omelet|scrambled/i.test(d)) add('allergen-milk');
      } else {
        add('allergen-milk');
        if (/^cheese, (cottage|ricotta|cream|neufchatel|fresh, queso fresco|white, queso blanco)/i.test(d)) add('lactose-high');
        else if (/^cheese/i.test(d)) add('lactose-low');
        else if (/yogurt|kefir|^butter/i.test(d)) add('lactose-low');
        else add('lactose-high');
        if (/nonfat|non-fat|(?<!part.)skim|fat free|fat-free|lowfat|low fat|low-fat|1% milkfat|1% fat/i.test(d) || /(sour cream|ice cream|yogurt|kefir).*light|light ice cream/i.test(d)) add('low-fat-dairy');
        else if (!/reduced fat|reduced-fat|2%|part skim|part-skim|whey|evaporated, 2%/i.test(d)) add('full-fat-dairy');
        if (/eggnog|omelet/i.test(d)) add('allergen-egg');
        if (/chocolate|eggnog|condensed, sweetened|hot cocoa|fruit|vanilla|strawberry|ice cream|milk shakes|frozen dessert|sundae|sandwich|bar|milk dessert|dulce/i.test(d) && !/no sugar|plain/i.test(d)) add('added-sugar');
        if (/yogurt|kefir|buttermilk, fluid, cultured|sour cream, cultured|cream, sour, cultured/i.test(d)) add('fermented-live-culture');
      }
      break;
    case 'Poultry Products':
      add('poultry', ORGAN.test(d) ? 'purine-high' : 'purine-moderate');
      if (/breaded|batter|fried, flour|patty|tenders/i.test(d)) add('allergen-wheat', 'gluten', 'refined-grain');
      if (/rotisserie, bbq/i.test(d)) add('added-sugar');
      break;
    case 'Beef Products':
    case 'Pork Products':
    case 'Lamb, Veal, and Game Products':
      if (!/rabbit/i.test(d)) add('red-meat');
      add(ORGAN.test(d) ? 'purine-high' : 'purine-moderate');
      if (/cured|bacon|\bham\b|corned|salt pork|smoked|sandwich steaks/i.test(d) && !/fresh, leg \(ham\)/i.test(d)) add('processed-meat');
      break;
    case 'Finfish and Shellfish Products':
      add('fish');
      if (/^fish,|^salmon|fish sticks|surimi|imitation/i.test(d)) add('allergen-fish');
      if (/^crustaceans,/i.test(d)) add('allergen-crustacean');
      if (/^mollusks, .*(oyster|clam|mussel|scallop|squid|octopus)/i.test(d)) notes.push('mollusk: not an FDA major allergen; add as a custom allergen if needed');
      if (RAW_ANIMAL.test(d) && !/cooked|canned/i.test(d)) add('raw-animal');
      if (/breaded|batter|fish sticks|surimi|imitation|cakes|nuggets/i.test(d)) add('allergen-wheat', 'gluten');
      break;
    case 'Sausages and Luncheon Meats':
      add('processed-meat', 'purine-moderate');
      if (DELI.test(d) && !FRESH_SAUSAGE.test(d)) add('deli-meat');
      if (RED_MEAT_WORD.test(d)) add('red-meat');
      if (POULTRY_WORD.test(d)) add('poultry');
      if (ORGAN.test(d)) { tags.delete('purine-moderate'); add('purine-high'); }
      if (/honey|pistachio nuts|with cheddar|cheese/i.test(d)) add(/honey/i.test(d) ? 'added-sugar' : 'allergen-milk');
      break;
    case 'Sweets':
      if (!NO_SUGAR.test(d) || /jams and preserves, no sugar|jellies, no sugar/i.test(d) === false && !NO_SUGAR.test(d)) add('added-sugar');
      if (/aspartame|sucralose|saccharin|stevia|sugar substitute|sugarless|reduced calorie|no sugar added/i.test(d)) add('non-nutritive-sweetener');
      if (/ice cream|frozen yogurt|pudding|custard|flan|milk|cream|mousse|milk chocolate|caramels|toffee|fudge|butterscotch|frostings, (cream cheese)|sherbet|milk dessert|rennin|nougat|truffles|white chocolate/i.test(d)) add('allergen-milk');
      if (/ice cream|frozen yogurt|sherbet|pudding|custard|flan|milk dessert|rennin|mousse/i.test(d)) add(/fat free|nonfat|light|low/i.test(d) ? 'low-fat-dairy' : 'full-fat-dairy', 'lactose-high');
      if (/almonds|hazelnut|pecan|nuts in syrup|with nuts|praline|nougat|truffles/i.test(d)) add('allergen-tree-nut');
      if (/peanut/i.test(d)) add('allergen-peanut');
      if (/sesame|halavah/i.test(d)) add('allergen-sesame');
      if (/chocolate|cocoa|carob/i.test(d) && !/carob/i.test(d)) add('caffeine');
      break;
    case 'Beverages':
      if (/^alcoholic|hard cider|hard lemonade|wine, cooking|liqueur|daiquiri|pina colada|whiskey sour|tequila sunrise|creme de menthe/i.test(d)) add('alcohol');
      else if (SWEET_DRINK.test(d) && !NO_SUGAR.test(d)) add('sugar-sweetened-beverage', 'added-sugar');
      if (/aspartame|sugar free|sugar-free|low calorie|diet\b|zero|with sucralose|no sugar added|sucralose|saccharin/i.test(d)) add('non-nutritive-sweetener');
      if (/coffee(?!.*(decaffeinated|substitute))/i.test(d)) add('coffee', 'caffeine');
      if (/coffee/i.test(d)) add('coffee');
      if (/tea, (black|green|oolong|instant)(?!.*decaffeinated)|tea, .*ready.to.drink(?!.*decaffeinated)/i.test(d)) add('tea', 'caffeine');
      if (/tea, (herb|hibiscus)|tea, .*decaffeinated/i.test(d)) add('tea');
      if (/cola(?!.*(without caffeine|no caffeine))|pepper-type, contains|energy drink|limeade, high caffeine|contains caffeine|coffee, ready to drink|mocha/i.test(d) && !/without caffeine/i.test(d)) add('caffeine');
      if (/almond milk|cashew milk|hazelnut/i.test(d)) add('allergen-tree-nut');
      if (/whey|milk based|with whole milk|dairy based|eggnog-flavor|malted drink|chocolate-flavored drink/i.test(d)) add('allergen-milk', 'lactose-high');
      if (/soy based/i.test(d)) add('allergen-soy', 'soy');
      if (/beer|malt beer|hard lemonade/i.test(d) && !/gluten-free/i.test(d)) add('gluten');
      break;
    case 'Soups, Sauces, and Gravies':
      if (/sweet and sour|barbecue|teriyaki|hoisin|plum|duck|cocktail|ketchup|catsup|tomato chili|steak sauce|tomato bisque|sweetened/i.test(d)) add('added-sugar');
      if (/fish, ready|oyster, ready|worcestershire|clam chowder|fish broth|stock, fish|oyster stew|shark fin/i.test(d)) add(/oyster|clam|shark/i.test(d) && !/worcestershire|fish, ready/i.test(d) ? 'fish' : 'fish', 'allergen-fish');
      if (/oyster|clam/i.test(d) && !/oyster sauce|oyster, ready/i.test(d)) tags.delete('allergen-fish');
      if (/shrimp|crab|lobster/i.test(d)) add('allergen-crustacean');
      if (/chicken|turkey/i.test(d) && !/broth|bouillon|stock|gravy/i.test(d)) add('poultry');
      if (/\bbeef\b|\bham\b|bacon|sirloin|pork/i.test(d) && !/broth|bouillon|stock|gravy|consomme/i.test(d)) add('red-meat');
      if (/cream of|cheese|alfredo|milk|clam chowder, new england|white, thin|hollandaise|bisque|oyster stew|potato ham chowder|vichyssoise/i.test(d)) add('allergen-milk', 'lactose-high');
      if (/noodle|ramen|wonton|dumplings|barley|pasta|macaroni|soy sauce|teriyaki|hoisin|alfredo mix|cheese sauce mix|gravy, .*dry|gravy, (beef|chicken|turkey), canned|bouillon|worcestershire/i.test(d)) add('allergen-wheat', 'gluten');
      if (/soy sauce|teriyaki|hoisin|miso|shoyu|tamari/i.test(d)) add('allergen-soy', 'soy');
      if (/peanut/i.test(d)) add('allergen-peanut');
      if (/pesto/i.test(d)) add('allergen-tree-nut', 'allergen-milk');
      if (/egg drop|hollandaise|tartar|mayonnaise/i.test(d)) add('allergen-egg');
      break;
    case 'Fats and Oils':
      if (/^oil, olive/i.test(d)) add('olive-oil');
      if (/^butter|margarine-like, (butter|margarine-butter|vegetable oil-butter)|butter blend|with butter/i.test(d)) add('allergen-milk', 'lactose-low');
      if (/mayonnaise(?!, made with tofu)|mayonnaise-type|mayonnaise-like|thousand island|ranch|caesar|blue or roquefort|green goddess|russian|tartar|honey mustard/i.test(d) && !/fat-free|imitation|no cholesterol|cholesterol-free/i.test(d)) add('allergen-egg');
      if (/blue or roquefort|ranch|caesar|buttermilk|creamy|yogurt/i.test(d)) add('allergen-milk');
      if (/mayonnaise, made with tofu|soybean and safflower/i.test(d)) add('allergen-soy', 'soy');
      if (/sesame/i.test(d)) add('allergen-sesame');
      if (/oil, (almond|walnut|hazelnut)/i.test(d)) add('allergen-tree-nut');
      if (/honey mustard|french dressing|thousand island|russian|coleslaw|sweet and sour|poppyseed|sesame seed dressing|bacon and tomato|catalina/i.test(d) && !/fat-free|reduced calorie|low calorie|without salt/i.test(d)) add('added-sugar');
      if (/fish oil|cod liver/i.test(d)) add('allergen-fish');
      if (/beef tallow|lard|bacon grease|mutton/i.test(d)) add('red-meat');
      if (/fat, (chicken|duck|goose|turkey)/i.test(d)) add('poultry');
      break;
    case 'Fast Foods':
    case 'Meals, Entrees, and Side Dishes':
      if (/beef|hamburger|cheeseburger|steak|meatball|bacon|ham\b|sausage|pepperoni|pork|corned|chili|salisbury|taquitos, .*beef|lasagna with meat|ravioli, meat|spaghetti with meat|pot pie, beef|beef pot pie|pulled pork|corn dog|hot ?dog|cold cut|meat and vegetable|meat topping/i.test(d) && !/turkey|chicken(?!.*(bacon|sausage))/i.test(d)) add('red-meat', 'purine-moderate');
      if (/chicken|turkey/i.test(d)) add('poultry', 'purine-moderate');
      if (/fish|tuna|shrimp|clam/i.test(d)) add('fish', /shrimp/i.test(d) ? 'allergen-crustacean' : 'allergen-fish');
      if (/cheese|pizza|cream|milk|alfredo|ranch|quesadilla|nachos|lasagna|ravioli|tortellini|macaroni and cheese|sundae|ice cream|biscuit|croissant|griddle|french toast|pancake|breakfast|egg|salisbury/i.test(d) && !/egg rolls|burrito, with beans$|hush puppies|onion rings|coleslaw|french fried|potato, mashed$/i.test(d)) add('allergen-milk');
      if (/egg|mayonnaise|breakfast|griddle|biscuit, with egg|croissant, with egg|english muffin, with egg|french toast|sundae|soft-serve|potato salad|coleslaw|club sandwich|tartar/i.test(d) && !/egg rolls/i.test(d)) add('allergen-egg');
      if (/pizza|burrito|taco, soft|sandwich|biscuit|bun|breaded|fried chicken|nuggets|tenders|patty|breading|croissant|english muffin|griddle|french toast|hush puppies|onion rings|lasagna|ravioli|tortellini|spaghetti|macaroni|pasta|pot pie|corn dog|egg roll|pizza rolls|potsticker|dumpling|turnover|cinnamon rolls|breadstick|taquitos|pockets|rice and vermicelli|pasta mix|stuffing|salisbury|meatball|sausage, egg and cheese|hot pockets|lean pockets|cheeseburger|hamburger|fish sandwich|club sandwich|chicken fillet|filet sandwich|chicken in tortilla|coleslaw, fast|fried in vegetable oil|nachos/i.test(d) && !/hard shell|taco with beef, cheese and lettuce, hard|nachos, with cheese$|potato, french fried|coleslaw$|egg, scrambled|sundae|soft-serve|potato, mashed|chili con carne|chili, no beans|beef stew|corned beef hash|rice bowl|spanish rice|yellow rice|rice mix|potato salad|pulled pork|taquitos/i.test(d)) add('allergen-wheat', 'gluten', 'refined-grain');
      if (/sundae|soft-serve|cinnamon rolls|french toast sticks|griddle cake|sweet and sour|teriyaki|barbecue|milkshake|shake|rice bowl/i.test(d)) add('added-sugar');
      if (/fried|nuggets|tenders|onion rings|hush puppies|corn dog|egg roll|taquitos|chips|french fries|potato, french/i.test(d)) notes.push('fried item');
      if (/beans/i.test(d)) add('legume', 'fodmap-gos');
      if (/soy|tofu/i.test(d)) add('allergen-soy', 'soy');
      break;
    default:
      break;
  }
  // Cross-category rules.
  if (cat !== 'Fats and Oils' && cat !== 'Legumes and Legume Products' && SOY.test(d) && !/oil|lecithin/i.test(d)) tags.add('allergen-soy'), tags.add('soy');
  if (['Cereal Grains and Pasta', 'Breakfast Cereals', 'Baked Products', 'Snacks', 'Legumes and Legume Products', 'Meals, Entrees, and Side Dishes', 'Fast Foods', 'Soups, Sauces, and Gravies', 'Beverages', 'Sweets'].includes(cat)) {
    if (WHEAT.test(d) && !NOT_WHEAT.test(d)) { tags.add('allergen-wheat'); tags.add('gluten'); }
    else if (BARLEY_RYE.test(d) && !/gluten-free|barley, pearled, cooked$/i.test(d) && cat !== 'Sweets') tags.add('gluten');
    if (/barley|\brye\b/i.test(d) && !/bread|crackers|malt|beer|pumpernickel|rye, wafers/i.test(d)) { tags.delete('allergen-wheat'); if (!/wheat/i.test(d)) tags.add('gluten'); }
  }
  if (/beer/i.test(d) && cat === 'Beverages') tags.add('gluten');
  return tags;
}

// Category vetoes: dictionary tags that cannot apply to a food in this
// category unless the description itself says so. A veto is a disagreement
// between the two mechanisms, so the tag goes to tag_review.
const PLANT_CATS = new Set(['Nut and Seed Products', 'Legumes and Legume Products', 'Vegetables and Vegetable Products', 'Fruits and Fruit Juices', 'Cereal Grains and Pasta', 'Spices and Herbs']);
const MEATLESS_CATS = new Set([...PLANT_CATS, 'Dairy and Egg Products', 'Sweets', 'Breakfast Cereals', 'Beverages']);
function vetoed(cat, d, tag) {
  if (PLANT_CATS.has(cat) && /^(allergen-milk|lactose-|low-fat-dairy|full-fat-dairy)/.test(tag) && !/cheese|yogurt|whey|whole milk|with milk|butter added|with butter|cream cheese/i.test(d)) return true;
  if ((PLANT_CATS.has(cat) || /^(Dairy|Sweets|Breakfast)/.test(cat)) && /^purine-/.test(tag)) return true;
  if (cat === 'Vegetables and Vegetable Products' && /^(legume|fodmap-gos)$/.test(tag) && /beans, snap|snap beans|yellow beans|green beans/i.test(d)) return true;
  if (/gluten-free/i.test(d) && /^(allergen-wheat|gluten)$/.test(tag)) return true;
  if (cat === 'Cereal Grains and Pasta' && tag === 'vegetable') return true;
  if (MEATLESS_CATS.has(cat) && /^(poultry|red-meat|fish|allergen-fish|allergen-crustacean|processed-meat|deli-meat)$/.test(tag) && !/fish oil|cod liver|bacon grease|tallow|lard|fat, (chicken|duck|goose|turkey)|chicken, meatless/i.test(d)) return true;
  if (PLANT_CATS.has(cat) && cat !== 'Cereal Grains and Pasta' && tag === 'allergen-egg' && !/egg noodle|noodles, egg|with egg/i.test(d)) return true;
  if (cat === 'Spices and Herbs' && tag === 'alcohol' && !/vanilla extract$|vanilla extract, imitation, alcohol/i.test(d)) return true;
  if (cat === 'Legumes and Legume Products' && /meatless|veggie burgers|vegetarian/i.test(d) && /^(poultry|red-meat|fish|allergen-fish|processed-meat|deli-meat)$/.test(tag)) return true;
  if (cat === 'Dairy and Egg Products' && tag === 'raw-animal' && !/^egg/i.test(d)) return true;
  if (/^(Beef|Pork|Lamb|Poultry|Finfish)/.test(cat) && tag === 'raw-animal' && !/raw|smoked|lox|pickled|kippered/i.test(d)) return true;
  if (cat === 'Fruits and Fruit Juices' && tag === 'vegetable') return true;
  if (cat === 'Vegetables and Vegetable Products' && tag === 'fruit' && !/tomat|avocado|olive|plantain/i.test(d)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const stats = {
  entries: 0, review: 0, overridden: 0, reviewTags: {}, byTag: {}, pending: {},
  allergen: { dictionaryOnly: 0, rulesOnly: 0, both: 0, any: 0 },
  allergenByTag: {},
};
const reviewList = [];

for (const entry of selection) {
  if (!entry.auto) continue;
  stats.entries++;
  const cat = entry.auto.category;
  const d = String(entry.auto.name || '').replace(FDP, '').trim();

  // 1. dictionary
  const dictResult = matcher.tagText(jargonFree(d));
  const dictTags = new Set(Object.keys(dictResult.tags).filter(isAllowed));

  // 2. rules
  const notes = [];
  const ruleTags = categoryRules(cat, d, new Set(), notes);

  // 3. merge with conflict detection
  const review = new Set();
  const overridden = [];
  for (const t of dictTags) if (vetoed(cat, d, t)) review.add(t);
  const union = new Set([...dictTags, ...ruleTags]);
  for (const [a, b] of CONTRADICTIONS) {
    if (!union.has(a) || !union.has(b)) continue;
    const family = DESCRIPTOR_PAIRS.has(a) ? 'descriptor' : 'specific';
    const ruleSide = ruleTags.has(a) && !ruleTags.has(b) ? a : ruleTags.has(b) && !ruleTags.has(a) ? b : null;
    const dictBoth = dictTags.has(a) && dictTags.has(b);
    if (ruleSide && (family === 'descriptor' || dictBoth)) {
      const loser = ruleSide === a ? b : a;
      union.delete(loser); overridden.push(`${loser} (dictionary) -> ${ruleSide} (description)`);
    } else if (family === 'specific' && dictBoth) {
      union.delete(b); overridden.push(`${b} (generic term) -> ${a} (specific term)`);
    } else { review.add(a); review.add(b); }
  }
  const finalTags = [...union].filter((t) => !review.has(t));

  const tags = finalTags.filter((t) => BUILD_VOCABULARY.has(t)).sort();
  const pending = finalTags.filter((t) => !BUILD_VOCABULARY.has(t)).sort();
  const reviewArr = [...review].filter((t) => BUILD_VOCABULARY.has(t)).sort();

  entry.tags = tags;
  entry.tag_review = reviewArr;
  if (pending.length) entry.tags_pending_vocabulary = pending; else delete entry.tags_pending_vocabulary;
  if (notes.length) entry.tag_notes = Object.fromEntries(notes.map((n, i) => [`auto_${i + 1}`, n])); else if (entry.tag_notes && Object.keys(entry.tag_notes).every((k) => k.startsWith('auto_'))) delete entry.tag_notes;
  entry.auto.tagged = true;
  entry.auto.tag_sources = {
    dictionary: [...dictTags].sort(),
    rules: [...ruleTags].sort(),
  };
  if (overridden.length) { entry.auto.tag_sources.overridden = overridden; stats.overridden += overridden.length; }

  // stats
  for (const t of tags) stats.byTag[t] = (stats.byTag[t] || 0) + 1;
  for (const t of pending) stats.pending[t] = (stats.pending[t] || 0) + 1;
  if (reviewArr.length) { stats.review++; reviewList.push(`${entry.fdcId} ${d} -> ${reviewArr.join(', ')}`); for (const t of reviewArr) stats.reviewTags[t] = (stats.reviewTags[t] || 0) + 1; }
  const dictAllergen = [...dictTags].filter((t) => t.startsWith('allergen-') && !review.has(t));
  const ruleAllergen = [...ruleTags].filter((t) => t.startsWith('allergen-') && !review.has(t));
  if (dictAllergen.length || ruleAllergen.length) {
    stats.allergen.any++;
    if (dictAllergen.length && ruleAllergen.length) stats.allergen.both++;
    else if (dictAllergen.length) stats.allergen.dictionaryOnly++;
    else stats.allergen.rulesOnly++;
  }
  for (const t of tags.filter((t) => t.startsWith('allergen-'))) {
    const src = dictTags.has(t) && ruleTags.has(t) ? 'both' : dictTags.has(t) ? 'dictionary' : 'rules';
    stats.allergenByTag[t] = stats.allergenByTag[t] || { dictionary: 0, rules: 0, both: 0 };
    stats.allergenByTag[t][src]++;
  }

  if (SHOW && SHOW.test(d)) console.log(`${entry.fdcId} ${d}\n   tags: ${tags.join(', ')}${pending.length ? `\n   pending: ${pending.join(', ')}` : ''}${reviewArr.length ? `\n   review: ${reviewArr.join(', ')}` : ''}\n   dict: ${[...dictTags].join(', ')}\n   rules: ${[...ruleTags].join(', ')}`);
}

if (!DRY) {
  fs.writeFileSync(SELECTION_PATH, JSON.stringify(selection, null, 2) + '\n');
}

console.log(`Tagged ${stats.entries} auto entries (${DRY ? 'dry run, nothing written' : 'written to tools/food-selection.json'})`);
console.log(`Entries with allergen tags: ${stats.allergen.any} (dictionary only ${stats.allergen.dictionaryOnly}, rules only ${stats.allergen.rulesOnly}, both ${stats.allergen.both})`);
console.log('Allergen tags by mechanism:');
for (const [t, v] of Object.entries(stats.allergenByTag).sort()) console.log(`  ${t.padEnd(22)} dictionary ${String(v.dictionary).padStart(4)}  rules ${String(v.rules).padStart(4)}  both ${String(v.both).padStart(4)}`);
console.log(`Entries with tag_review: ${stats.review}; generic dictionary tags overridden by the description: ${stats.overridden}`);
for (const [t, n] of Object.entries(stats.reviewTags).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${t}`);
console.log('Tags pending build vocabulary (written to tags_pending_vocabulary):', JSON.stringify(stats.pending));
console.log('Tag totals on new entries:');
for (const [t, n] of Object.entries(stats.byTag).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${t}`);
if (argv.includes('--review')) { console.log('tag_review entries:'); for (const r of reviewList) console.log('  ' + r); }
