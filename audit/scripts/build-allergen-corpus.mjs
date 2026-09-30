// Builds audit/corpus/allergen-labels.json: realistic ingredient-label lines for the nine major US allergens and for
// gluten (celiac), each tagged with the one profile it must not pass for. Deterministic: the same file every run.
//
// Kinds of line:
//   plain       the allergen or a derivative by its usual label name
//   hidden      a name that does not say the allergen (casein, albumin, surimi, semolina, tahini, malt vinegar...)
//   case        MIXED or UPPER case
//   plural      plural or singular forms
//   typo        a common misspelling a person might type
//   ocr         a photo-reading error (rn for m, 0 for o, 1 for l, vv for w, a split word)
//   masked      a typo or OCR error sitting next to a word the dictionary knows ("rnilk chocolate")
//   may         "may contain", shared-equipment, and made-in-a-facility statements
//   contains    a FALCPA "Contains:" statement
//   label       a full ingredient statement with the allergen somewhere in it
//   source      an ingredient that can be made from the allergen where the label names the source only in a separate
//               "Contains" statement, which a person may not type (lecithin, modified food starch)
//   control     a line that does NOT contain the allergen (except handling, look-alike words); reported, not asserted
//
// expect: 'not-pass' means any verdict except pass is acceptable; 'control' lines are only reported.
import fs from 'node:fs';

const lines = [];
const add = (profile, kind, text, expect = 'not-pass', why = '') => lines.push({ profile, kind, text, expect, ...(why ? { why } : {}) });

// ---- deterministic garbling (no randomness)
const ocrRn = w => w.replace('m', 'rn');
const ocrZero = w => w.replace('o', '0');
const ocrOne = w => w.replace('l', '1');
const ocrVv = w => w.replace('w', 'vv');
const split = w => w.slice(0, Math.ceil(w.length / 2)) + ' ' + w.slice(Math.ceil(w.length / 2));
const dropVowel = w => { const i = w.slice(1).search(/[aeiou]/); return i < 0 ? w : w.slice(0, i + 1) + w.slice(i + 2); };

// ---------------------------------------------------------------- milk
const milk = {
  plain: ['milk', 'whole milk', 'skim milk', 'nonfat dry milk', 'milk powder', 'dried milk', 'milk solids', 'cream', 'heavy cream', 'sour cream', 'butter', 'butterfat', 'butter oil', 'ghee', 'buttermilk', 'cheese', 'cheddar cheese', 'parmesan cheese', 'mozzarella', 'cottage cheese', 'cream cheese', 'ricotta', 'yogurt', 'kefir', 'half-and-half', 'custard', 'condensed milk', 'evaporated milk', 'paneer', 'milk chocolate'],
  hidden: ['whey', 'whey protein concentrate', 'sweet whey', 'delactosed whey', 'casein', 'sodium caseinate', 'calcium caseinate', 'hydrolyzed casein', 'rennet casein', 'lactalbumin', 'lactoglobulin', 'lactose', 'curds', 'milk protein concentrate', 'recaldent'],
  typo: ['mlik', 'buttr', 'chesse', 'yoghurt', 'caseinate', 'wey protein'],
  ocr: [ocrRn('milk'), ocrOne('milk'), 'rnilk powder', 'cre am', 'wh ey'],
  masked: ['sugar, rnilk chocolate', 'whole rnilk powder', 'sweetened condensed rni1k', 'rnilk chocolate chips', 'chedar cheese sauce'],
  may: ['May contain milk.', 'Manufactured on shared equipment with milk.', 'Made in a facility that also processes milk and eggs.', 'Produced in a plant that handles dairy.'],
  contains: ['CONTAINS: MILK.', 'Contains: Milk, Soy.', 'Allergens: milk'],
  source: ['caramel', 'nougat', 'margarine']
};
// ---------------------------------------------------------------- egg
const egg = {
  plain: ['egg', 'eggs', 'whole eggs', 'egg whites', 'egg yolks', 'dried egg', 'powdered egg', 'liquid egg', 'egg noodles', 'mayonnaise', 'meringue', 'eggnog', 'egg wash'],
  hidden: ['albumin', 'albumen', 'ovalbumin', 'lysozyme', 'livetin', 'ovomucoid', 'ovomucin', 'vitellin', 'ovovitellin', 'surimi', 'globulin'],
  typo: ['egss', 'egg yoke', 'mayonaise', 'albumine'],
  ocr: ['e gg', 'eg g whites', 'a1bumin', 'ovalbumln'],
  masked: ['pasteurized egg whltes, salt', 'wh0le eggs, sugar', 'mayonaise dressing'],
  may: ['May contain egg.', 'Made on equipment that also processes eggs.', 'Produced in a facility that uses egg.'],
  contains: ['CONTAINS: EGG.', 'Contains: Wheat, Egg.'],
  source: []
};
// ---------------------------------------------------------------- fish
const fish = {
  plain: ['fish', 'anchovy', 'anchovies', 'cod', 'salmon', 'tuna', 'tilapia', 'pollock', 'haddock', 'halibut', 'sardines', 'mackerel', 'trout', 'catfish', 'fish sauce', 'fish oil', 'fish gelatin', 'worcestershire sauce', 'caesar dressing', 'imitation crab', 'bonito flakes', 'dashi', 'caviar', 'roe'],
  hidden: ['surimi', 'omega-3 fatty acids (from fish oil)', 'anchovy paste', 'fish stock', 'nam pla'],
  typo: ['anchovey', 'samon', 'tunna', 'worcester sauce'],
  ocr: ['s a1mon', 'anch0vies', 'f ish sauce', 'po1lock'],
  masked: ['smoked sa1mon, salt', 'anch0vy paste', 'tuna in water, salt', 'wild caught sa1mon fillets'],
  may: ['May contain fish.', 'Processed in a facility that also processes fish.', 'Made on shared equipment with fish and shellfish.'],
  contains: ['CONTAINS: FISH (ANCHOVY).', 'Contains: Fish (Cod).'],
  source: []
};
// ---------------------------------------------------------------- crustacean shellfish
const crustacean = {
  plain: ['shrimp', 'prawns', 'crab', 'lobster', 'crayfish', 'crawfish', 'langoustine', 'krill', 'scampi', 'shrimp paste', 'crab meat', 'lobster tail', 'shellfish'],
  hidden: ['crab extract', 'shrimp powder', 'surimi', 'imitation crab', 'krill oil', 'shellfish extract'],
  typo: ['shirmp', 'lobser', 'craw fish'],
  ocr: ['shrirnp', 'lobste r', 'cr ab', 'prawn s'],
  masked: ['cooked shrirnp, salt', 'dried shrirnp paste', 'lobste r bisque base'],
  may: ['May contain crustacean shellfish.', 'Made in a facility that processes shellfish.', 'May contain shrimp.'],
  contains: ['CONTAINS: SHRIMP.', 'Contains: Crustacean Shellfish (Crab).'],
  source: []
};
// ---------------------------------------------------------------- tree nuts
const treeNut = {
  plain: ['almond', 'almonds', 'almond flour', 'almond butter', 'almond milk', 'cashew', 'cashews', 'walnut', 'walnuts', 'pecan', 'pecans', 'hazelnut', 'hazelnuts', 'filberts', 'pistachio', 'pistachios', 'macadamia nuts', 'brazil nuts', 'pine nuts', 'pignoli', 'heartnut', 'black walnut', 'coconut', 'chestnut', 'tree nuts'],
  hidden: ['marzipan', 'praline', 'gianduja', 'pesto', 'nut meal', 'almond extract', 'nougat', 'nut paste', 'natural nut extract', 'frangipane', 'nut butter', 'chocolate hazelnut spread'],
  typo: ['almnds', 'cashw', 'walnts', 'pistacio', 'hazel nut', 'pecan s'],
  ocr: [ocrRn('almonds'), 'a1monds', 'cas hew', 'wa1nuts', 'pist achio'],
  masked: ['almnd milk', 'cashw butter', 'alrnond butter', 'roasted a1monds, salt', 'wa1nut pieces, sugar', 'hazel nut spread', 'sugar, a1mond flour'],
  may: ['May contain tree nuts.', 'Made in a facility that also processes tree nuts.', 'Manufactured on shared equipment with almonds and cashews.', 'May contain traces of nuts.'],
  contains: ['CONTAINS: ALMONDS.', 'Contains: Tree Nuts (Cashew, Pecan).'],
  source: []
};
// ---------------------------------------------------------------- peanut
const peanut = {
  plain: ['peanut', 'peanuts', 'peanut butter', 'peanut flour', 'peanut oil', 'cold pressed peanut oil', 'roasted peanuts', 'arachis oil', 'groundnuts', 'beer nuts', 'monkey nuts', 'mixed nuts', 'goober peas', 'mandelonas', 'peanut protein'],
  hidden: ['hydrolyzed peanut protein', 'arachis hypogaea', 'ground nuts', 'satay sauce'],
  typo: ['penut', 'penuts', 'penut butter', 'peanutt', 'pea nut'],
  ocr: ['pean ut butter', 'peanu t', 'p eanuts', 'pea nuts'],
  masked: ['penut butter', 'pean ut butter', 'roasted penuts, salt', 'sugar, penut flour', 'penut oil'],
  may: ['May contain peanuts.', 'Made in a facility that also processes peanuts.', 'Manufactured on shared equipment with peanuts.', 'May contain traces of peanut.'],
  contains: ['CONTAINS: PEANUTS.', 'Contains: Peanut.'],
  source: []
};
// ---------------------------------------------------------------- wheat
const wheat = {
  plain: ['wheat', 'whole wheat', 'wheat flour', 'enriched flour', 'flour', 'all-purpose flour', 'bread flour', 'durum', 'durum wheat semolina', 'semolina', 'spelt', 'farro', 'einkorn', 'emmer', 'kamut', 'khorasan wheat', 'triticale', 'bulgur', 'couscous', 'freekeh', 'seitan', 'wheat germ', 'wheat bran', 'wheat starch', 'hydrolyzed wheat protein', 'graham flour', 'farina', 'matzo meal', 'breadcrumbs', 'panko', 'vital wheat gluten', 'wheat berries', 'cracked wheat', 'soy sauce'],
  hidden: ['atta', 'maida', 'sooji', 'fu', 'wheat gluten', 'modified wheat starch', 'bread crumbs', 'croutons', 'orzo', 'udon noodles', 'crackers'],
  typo: ['wheet', 'whole wheet', 'weat flour', 'semolena', 'bulghur'],
  ocr: [ocrVv('wheat'), 'vvheat flour', 'wh eat', 'f1our', 'enriched whe at flour'],
  masked: ['enriched vvheat flour', 'sugar, wheet flakes', 'whole wheet pasta', 'toasted vvheat germ'],
  may: ['May contain wheat.', 'Made in a facility that also processes wheat.', 'Manufactured on shared equipment with wheat and soy.'],
  contains: ['CONTAINS: WHEAT.', 'Contains: Wheat, Milk, Soy.'],
  source: ['modified food starch', 'maltodextrin', 'dextrin']
};
// ---------------------------------------------------------------- soy
const soy = {
  plain: ['soy', 'soya', 'soybeans', 'soy protein isolate', 'soy protein concentrate', 'soy flour', 'soy milk', 'tofu', 'tempeh', 'miso', 'natto', 'edamame', 'textured vegetable protein', 'TVP', 'soy sauce', 'shoyu', 'tamari', 'yuba', 'okara', 'hydrolyzed soy protein', 'soy lecithin', 'lecithin (soy)', 'soybean oil', 'soy nuts'],
  hidden: ['bean curd', 'kinako', 'soy albumin', 'teriyaki sauce', 'hoisin sauce'],
  typo: ['soya bean', 'soy bean', 'edamane', 'tofoo'],
  ocr: ['s0y', 's0y protein isolate', 'so y lecithin', 'soybe an'],
  masked: ['s0y protein isolate, sugar', 'sugar, s0y lecithin', 'organic s0y milk', 'textured s0y protein'],
  may: ['May contain soy.', 'Made in a facility that also processes soy.', 'Processed on shared equipment with soybeans.'],
  contains: ['CONTAINS: SOY.', 'Contains: Soy Lecithin.'],
  source: ['lecithin', 'vegetable oil', 'hydrolyzed vegetable protein', 'natural flavor']
};
// ---------------------------------------------------------------- sesame
const sesame = {
  plain: ['sesame', 'sesame seeds', 'sesame oil', 'toasted sesame oil', 'sesame paste', 'tahini', 'tahina', 'benne seeds', 'benne', 'gingelly oil', 'gomasio', 'halvah', 'hummus', "za'atar", 'furikake', 'sesame flour', 'til', 'sim sim'],
  hidden: ['sesamum indicum', 'sesamol', 'tahina sauce', 'baba ghanoush'],
  typo: ['seseme', 'sesme', 'tahinni', 'sesami seeds'],
  ocr: ['sesa me', 'se same oil', 'tah1ni', 'sesarne seeds'],
  masked: ['toasted sesarne oil', 'sugar, sesme seeds', 'roasted sesarne seeds, salt'],
  may: ['May contain sesame.', 'Made in a facility that also processes sesame.', 'Manufactured on shared equipment with sesame seeds.'],
  contains: ['CONTAINS: SESAME.', 'Contains: Sesame, Wheat.'],
  source: ['spices', 'natural flavors', 'seasoning']
};
// ---------------------------------------------------------------- gluten (celiac)
const gluten = {
  plain: ['wheat', 'wheat flour', 'barley', 'barley flour', 'pearl barley', 'barley malt', 'barley malt extract', 'malt', 'malt extract', 'malt syrup', 'malt vinegar', 'malt flavoring', 'malted milk', 'malted barley flour', 'rye', 'rye flour', 'pumpernickel', 'oats', 'rolled oats', 'oat flour', 'oatmeal', 'steel-cut oats', 'oat bran', "brewer's yeast", 'brewers yeast', 'beer', 'ale', 'lager', 'triticale', 'seitan', 'spelt', 'farro', 'durum', 'semolina', 'bulgur', 'couscous', 'soy sauce', 'graham crackers', 'matzo'],
  hidden: ['gluten', 'wheat gluten', 'hydrolyzed wheat protein', 'udon', 'orzo', 'panko', 'croutons', 'communion wafers', 'malt powder', 'oats (may contain wheat)', 'whole grain oats', 'quick oats', 'instant oatmeal', 'rye bread'],
  typo: ['barly', 'rolled oat', 'malt vineger', 'rye flower'],
  ocr: ['bar1ey', 'ma1t extract', 'r ye flour', '0ats', 'barley rna1t'],
  masked: ['sugar, bar1ey malt', 'toasted 0at flakes', 'organic bar1ey flour', 'ma1t vinegar, salt'],
  may: ['May contain wheat.', 'Made in a facility that also processes wheat and barley.', 'Processed on shared equipment with wheat.'],
  contains: ['CONTAINS: WHEAT.', 'Contains: Wheat, Barley.'],
  source: ['modified food starch', 'natural flavors', 'seasoning']
};

const SETS = { milk, egg, fish, crustacean, 'tree-nut': treeNut, peanut, wheat, soy, sesame, celiac: gluten };
for (const [profile, s] of Object.entries(SETS)) {
  for (const t of s.plain) add(profile, 'plain', t);
  for (const t of s.hidden) add(profile, 'hidden', t);
  for (const t of s.typo) add(profile, 'typo', t);
  for (const t of s.ocr) add(profile, 'ocr', t);
  for (const t of s.masked) add(profile, 'masked', t);
  for (const t of s.may) add(profile, 'may', t);
  for (const t of s.contains) add(profile, 'contains', t);
  for (const t of s.source) add(profile, 'source', t, 'not-pass', 'can be made from the allergen; the source may appear only in a separate Contains statement');
  // Case and plural variants of the first few plain names, inside a realistic list.
  for (const t of s.plain.slice(0, 6)) {
    add(profile, 'case', 'Ingredients: Sugar, ' + t.toUpperCase() + ', Salt.');
    add(profile, 'case', t.replace(/\b\w/g, c => c.toUpperCase()) + ', Water, Natural Color');
  }
  for (const t of s.plain.slice(0, 4)) {
    const alt = /s$/.test(t) ? t.replace(/s$/, '') : t + 's';
    add(profile, 'plural', 'water, ' + alt + ', salt');
  }
  // Deterministic garbles of the first plain name.
  const w = s.plain.find(x => /^[a-z]+$/.test(x)) || s.plain[0];
  for (const g of [ocrRn(w), ocrZero(w), ocrOne(w), split(w), dropVowel(w)]) if (g !== w) add(profile, 'ocr', 'salt, ' + g + ', sugar');
}

// ---------------------------------------------------------------- full ingredient statements (made up, generic)
const labels = [
  ['milk', 'INGREDIENTS: ENRICHED FLOUR (WHEAT FLOUR, NIACIN, REDUCED IRON, THIAMINE MONONITRATE, RIBOFLAVIN, FOLIC ACID), CHEESE (MILK, SALT, CHEESE CULTURES, ENZYMES, ANNATTO), VEGETABLE OIL, SALT, PAPRIKA.'],
  ['wheat', 'INGREDIENTS: ENRICHED FLOUR (WHEAT FLOUR, NIACIN, REDUCED IRON, THIAMINE MONONITRATE, RIBOFLAVIN, FOLIC ACID), CHEESE (MILK, SALT, CHEESE CULTURES, ENZYMES, ANNATTO), VEGETABLE OIL, SALT, PAPRIKA.'],
  ['celiac', 'INGREDIENTS: ENRICHED FLOUR (WHEAT FLOUR, NIACIN, REDUCED IRON, THIAMINE MONONITRATE, RIBOFLAVIN, FOLIC ACID), CHEESE (MILK, SALT, CHEESE CULTURES, ENZYMES, ANNATTO), VEGETABLE OIL, SALT, PAPRIKA.'],
  ['soy', 'Ingredients: Sugar, Unbleached Enriched Flour, Palm Oil, Cocoa (Processed with Alkali), High Fructose Corn Syrup, Leavening (Baking Soda and/or Calcium Phosphate), Salt, Soy Lecithin, Vanillin. Contains: Wheat, Soy.'],
  ['wheat', 'Ingredients: Sugar, Unbleached Enriched Flour, Palm Oil, Cocoa (Processed with Alkali), High Fructose Corn Syrup, Leavening (Baking Soda and/or Calcium Phosphate), Salt, Soy Lecithin, Vanillin. Contains: Wheat, Soy.'],
  ['tree-nut', 'Ingredients: Whole grain rolled oats, honey, almonds, brown rice syrup, canola oil, sea salt, natural flavor. Contains almonds. Made in a facility that also processes peanuts and other tree nuts.'],
  ['peanut', 'Ingredients: Whole grain rolled oats, honey, almonds, brown rice syrup, canola oil, sea salt, natural flavor. Contains almonds. Made in a facility that also processes peanuts and other tree nuts.'],
  ['celiac', 'Ingredients: Whole grain rolled oats, honey, almonds, brown rice syrup, canola oil, sea salt, natural flavor. Contains almonds. Made in a facility that also processes peanuts and other tree nuts.'],
  ['soy', 'NOODLES: ENRICHED WHEAT FLOUR, PALM OIL, SALT. SEASONING: SALT, MONOSODIUM GLUTAMATE, SOY SAUCE POWDER (SOYBEAN, WHEAT, SALT), GARLIC POWDER, DEHYDRATED GREEN ONION.'],
  ['wheat', 'NOODLES: ENRICHED WHEAT FLOUR, PALM OIL, SALT. SEASONING: SALT, MONOSODIUM GLUTAMATE, SOY SAUCE POWDER (SOYBEAN, WHEAT, SALT), GARLIC POWDER, DEHYDRATED GREEN ONION.'],
  ['egg', 'Soybean oil, water, whole eggs, vinegar, egg yolks, salt, sugar, lemon juice concentrate, calcium disodium EDTA.'],
  ['soy', 'Soybean oil, water, whole eggs, vinegar, egg yolks, salt, sugar, lemon juice concentrate, calcium disodium EDTA.'],
  ['fish', 'Soybean oil, water, parmesan cheese (pasteurized part-skim milk, cheese cultures, salt, enzymes), egg yolk, anchovies, garlic, lemon juice, Worcestershire sauce.'],
  ['milk', 'Soybean oil, water, parmesan cheese (pasteurized part-skim milk, cheese cultures, salt, enzymes), egg yolk, anchovies, garlic, lemon juice, Worcestershire sauce.'],
  ['crustacean', 'Water, shrimp, salt, sugar, potato starch, garlic, shrimp paste (shrimp, salt), chili pepper.'],
  ['sesame', 'Chickpeas, water, tahini (ground sesame), lemon juice, garlic, salt, citric acid.'],
  ['sesame', 'Enriched wheat flour, water, sesame seeds, sugar, yeast, soybean oil, salt.'],
  ['celiac', 'Water, rice, barley malt extract, salt, vitamin E.'],
  ['celiac', 'Filtered water, malt vinegar, salt, natural flavor.'],
  ['celiac', 'Toasted oats, sugar, corn syrup, salt, honey, cinnamon.'],
  ['milk', 'Sugar, cocoa butter, whole milk powder, chocolate liquor, soy lecithin, vanilla. May contain peanuts and tree nuts.'],
  ['peanut', 'Sugar, cocoa butter, whole milk powder, chocolate liquor, soy lecithin, vanilla. May contain peanuts and tree nuts.'],
  ['tree-nut', 'Sugar, cocoa butter, whole milk powder, chocolate liquor, soy lecithin, vanilla. May contain peanuts and tree nuts.'],
  ['peanut', 'Roasted peanuts, sugar, hydrogenated vegetable oil (rapeseed and soybean), salt.'],
  ['milk', 'Cultured pasteurized grade A nonfat milk, cream, pectin. Contains live and active cultures.'],
  ['egg', 'Semolina (wheat), durum wheat flour, eggs, niacin, ferrous sulfate, thiamin mononitrate, riboflavin, folic acid.'],
  ['wheat', 'Semolina (wheat), durum wheat flour, eggs, niacin, ferrous sulfate, thiamin mononitrate, riboflavin, folic acid.'],
  ['fish', 'Pollock, water, sugar, wheat starch, egg whites, sorbitol, salt, crab extract, natural and artificial flavor.'],
  ['crustacean', 'Pollock, water, sugar, wheat starch, egg whites, sorbitol, salt, crab extract, natural and artificial flavor.'],
  ['egg', 'Pollock, water, sugar, wheat starch, egg whites, sorbitol, salt, crab extract, natural and artificial flavor.'],
  ['soy', 'Water, soybeans, calcium sulfate, glucono delta lactone.'],
  ['tree-nut', 'Almondmilk (filtered water, almonds), cane sugar, calcium carbonate, sea salt, gellan gum.'],
  ['milk', 'Sugar, corn syrup, cream, butter, salt, vanilla extract.'],
  ['wheat', 'Chicken broth, enriched wheat flour, carrots, celery, chicken, salt, modified food starch.'],
  ['celiac', 'Chicken broth, enriched wheat flour, carrots, celery, chicken, salt, modified food starch.']
];
for (const [p, t] of labels) add(p, 'label', t);

// ---------------------------------------------------------------- controls: no allergen, reported only
const controls = [
  ['milk', 'coconut milk'], ['milk', 'peanut butter'], ['milk', 'cocoa butter'], ['milk', 'butter beans'], ['milk', 'almond milk'], ['milk', 'oat milk'], ['milk', 'cream of tartar'],
  ['egg', 'eggplant'], ['egg', 'egg replacer (potato starch, tapioca flour)'],
  ['wheat', 'buckwheat'], ['wheat', 'rice flour'], ['wheat', 'corn tortillas'], ['wheat', 'wheatgrass'],
  ['tree-nut', 'nutmeg'], ['tree-nut', 'water chestnuts'], ['tree-nut', 'butternut squash'],
  ['peanut', 'sunflower seed butter'], ['peanut', 'chickpeas'],
  ['fish', 'fish-shaped crackers (enriched wheat flour, cheddar cheese, salt)'],
  ['crustacean', 'crab apples'], ['crustacean', 'oyster sauce'],
  ['soy', 'sunflower lecithin'], ['soy', 'canola oil'],
  ['sesame', 'sunflower seeds'], ['sesame', 'pumpkin seeds'],
  ['celiac', 'certified gluten-free oats'], ['celiac', 'rice'], ['celiac', 'quinoa'], ['celiac', 'buckwheat groats'], ['celiac', 'distilled vinegar']
];
for (const [p, t] of controls) add(p, 'control', t, 'control');

lines.forEach((l, i) => { l.id = 'L' + String(i + 1).padStart(3, '0'); });
fs.writeFileSync(new URL('../corpus/allergen-labels.json', import.meta.url), JSON.stringify(lines, null, 1) + '\n');
console.log(lines.length + ' lines,', lines.filter(l => l.expect === 'not-pass').length + ' asserted, ' + lines.filter(l => l.expect === 'control').length + ' controls');
