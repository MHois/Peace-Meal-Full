#!/usr/bin/env node
// tools/build-foods.mjs
//
// Builds data/foods.json from USDA FoodData Central CSV files (SR Legacy and
// Foundation Foods) using the curated list in tools/food-selection.json.
//
// Usage:   node tools/build-foods.mjs
// Inputs:  tools/usda/sr_legacy/<release>/{food,food_nutrient,food_portion,nutrient,food_category,measure_unit}.csv
//          tools/usda/foundation/<release>/{same}
//          tools/food-selection.json
// Output:  data/foods.json (deterministic: sorted by fdcId, so reruns produce no diff)
//
// Rules (see docs/PHASE-2-prd-and-architecture.md sections 4.3 to 4.5):
// - Every number comes from the USDA files. Nothing is typed by hand.
// - per100g values are rounded to 2 decimals. Missing values are null, never 0,
//   unless USDA itself reports 0. added_sugar_g is always null (USDA has no
//   added-sugar field for these datasets).
// - Dataset is auto-detected per fdcId: Foundation if the id is a foundation_food
//   row in the Foundation food.csv, otherwise SR Legacy. Unknown ids fail the build.
// - Portions come from food_portion.csv (label = amount + measure unit + modifier,
//   grams = gram_weight) plus a standard "100 g" portion. Portions listed in the
//   selection file under portions_add are appended with "source": "manual".
// - Tags come from the selection file and are validated against the PHASE-2 4.4
//   vocabulary. Unknown tags fail the build.
//
// Nutrient ids (verified against nutrient.csv of both datasets on 2026-09-05; the
// script re-verifies names at run time and warns on mismatch). All ids matched the
// expected names in both files. The only difference found was cosmetic: nutrient
// 2000 is named "Sugars, Total" in SR Legacy and "Total Sugars" in Foundation.
//   kcal            1008 Energy (KCAL). Fallback for Foundation foods without 1008:
//                   2048 Energy (Atwater Specific Factors), then 2047 Energy
//                   (Atwater General Factors). Which one was used is recorded in
//                   kcal_source ("1008", "2048-atwater-specific", "2047-atwater-general").
//   protein_g       1003   carb_g 1005   fiber_g 1079   sugar_g 2000   fat_g 1004
//   satfat_g        1258   transfat_g 1257   cholesterol_mg 1253
//   sodium_mg       1093   potassium_mg 1092   phosphorus_mg 1091   calcium_mg 1087
//   iron_mg         1089   magnesium_mg 1090   vitamin_c_mg 1162
//   vitamin_d_iu    1110 Vitamin D (D2 + D3), International Units. If 1110 is absent
//                   but 1114 Vitamin D (D2 + D3) in UG is present, the value is
//                   converted with the fixed unit factor 1 ug = 40 IU and
//                   vitamin_d_source is set to "1114-ug-x40" (otherwise "1110").
//   vitamin_b12_ug  1178
//   folate_ug       1190 Folate, DFE preferred; 1177 Folate, total as fallback.
//                   Recorded in folate_source ("1190-dfe" or "1177-total").
//   zinc_mg         1095   caffeine_mg 1057   alcohol_g 1018

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const t0 = Date.now();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const USDA_DIR = path.join(ROOT, 'tools', 'usda');
const SELECTION_PATH = path.join(ROOT, 'tools', 'food-selection.json');
const OUTPUT_PATH = path.join(ROOT, 'data', 'foods.json');

// ---------------------------------------------------------------------------
// Nutrient contract
// ---------------------------------------------------------------------------

// key -> ordered list of candidate nutrient ids (first present wins)
const NUTRIENT_KEYS = {
  kcal: [1008, 2048, 2047],
  protein_g: [1003],
  carb_g: [1005],
  fiber_g: [1079], // classic method; guideline fiber targets are built on it. 2033 (AOAC 2011.25, counts resistant starch) is a labeled last resort below.
  sugar_g: [2000],
  added_sugar_g: [], // always null for USDA SR Legacy / Foundation
  fat_g: [1004],
  satfat_g: [1258],
  transfat_g: [1257],
  cholesterol_mg: [1253],
  sodium_mg: [1093],
  potassium_mg: [1092],
  phosphorus_mg: [1091],
  calcium_mg: [1087],
  iron_mg: [1089],
  magnesium_mg: [1090],
  vitamin_c_mg: [1162],
  vitamin_d_iu: [1110, 1114],
  vitamin_b12_ug: [1178],
  folate_ug: [1190, 1177],
  zinc_mg: [1095],
  caffeine_mg: [1057],
  alcohol_g: [1018],
};

const KCAL_SOURCE = { 1008: '1008', 2048: '2048-atwater-specific', 2047: '2047-atwater-general' };
const FOLATE_SOURCE = { 1190: '1190-dfe', 1177: '1177-total' };
const VITD_SOURCE = { 1110: '1110', 1114: '1114-ug-x40' };

// Expected names, used only to warn if a nutrient id no longer means what we think.
const EXPECTED_NUTRIENT_NAMES = {
  1008: /^energy$/i,
  2047: /atwater general/i,
  2048: /atwater specific/i,
  1003: /^protein$/i,
  1005: /^carbohydrate/i,
  1079: /^fiber, total dietary$/i,
  2033: /^total dietary fiber \(aoac 2011\.25\)$/i,
  2000: /sugars?, total|total sugars/i,
  1004: /^total lipid \(fat\)$/i,
  1258: /fatty acids, total saturated/i,
  1257: /fatty acids, total trans$/i,
  1253: /^cholesterol$/i,
  1093: /^sodium, na$/i,
  1092: /^potassium, k$/i,
  1091: /^phosphorus, p$/i,
  1087: /^calcium, ca$/i,
  1089: /^iron, fe$/i,
  1090: /^magnesium, mg$/i,
  1162: /^vitamin c, total ascorbic acid$/i,
  1110: /^vitamin d \(d2 \+ d3\), international units$/i,
  1114: /^vitamin d \(d2 \+ d3\)$/i,
  1178: /^vitamin b-12$/i,
  1177: /^folate, total$/i,
  1190: /^folate, dfe$/i,
  1095: /^zinc, zn$/i,
  1057: /^caffeine$/i,
  1018: /^alcohol, ethyl$/i,
};
const EXPECTED_UNITS = {
  1008: 'KCAL', 2047: 'KCAL', 2048: 'KCAL', 1003: 'G', 1005: 'G', 1079: 'G', 2033: 'G', 2000: 'G', 1004: 'G',
  1258: 'G', 1257: 'G', 1253: 'MG', 1093: 'MG', 1092: 'MG', 1091: 'MG', 1087: 'MG', 1089: 'MG',
  1090: 'MG', 1162: 'MG', 1110: 'IU', 1114: 'UG', 1178: 'UG', 1177: 'UG', 1190: 'UG', 1095: 'MG',
  1057: 'MG', 1018: 'G',
};

const NEEDED_NUTRIENT_IDS = new Set([...Object.values(NUTRIENT_KEYS).flat(), 2033]);

// ---------------------------------------------------------------------------
// Tag vocabulary (PHASE-2 section 4.4)
// ---------------------------------------------------------------------------

const TAG_VOCABULARY = new Set([
  // Allergens
  'allergen-milk', 'allergen-egg', 'allergen-fish', 'allergen-crustacean', 'allergen-tree-nut',
  'allergen-peanut', 'allergen-wheat', 'allergen-soy', 'allergen-sesame',
  // Gluten
  'gluten', 'gluten-hidden', 'oats-regular', 'oats-certified-gf',
  // Soy
  'soy', 'soy-refined-oil', 'soy-lecithin',
  // Dairy
  'lactose-high', 'lactose-low', 'lactose-hidden',
  // Sugar
  'added-sugar', 'sugar-sweetened-beverage', 'non-nutritive-sweetener',
  // FODMAP
  'fodmap-fructan', 'fodmap-gos', 'fodmap-lactose', 'fodmap-fructose', 'fodmap-sorbitol', 'fodmap-mannitol',
  // Histamine
  'histamine-high', 'histamine-fermented', 'histamine-aged',
  // Kidney
  'phosphate-additive', 'potassium-additive', 'potassium-high-food',
  // Stones
  'oxalate-high',
  // Gout
  'purine-high', 'purine-moderate',
  // Pregnancy
  'unpasteurized', 'raw-animal', 'deli-meat', 'mercury-high', 'mercury-low-fish', 'raw-sprouts', 'alcohol', 'caffeine',
  // Pattern
  'vegetable', 'fruit', 'whole-grain', 'refined-grain', 'legume', 'nut', 'seed', 'fish', 'poultry', 'red-meat',
  'processed-meat', 'low-fat-dairy', 'full-fat-dairy', 'olive-oil', 'ultra-processed', 'fried',
  'high-fiber-insoluble', 'small-particle-friendly', 'fermented-live-culture',
  // Texture
  'large-particle', 'skin-or-seed', 'raw-vegetable', 'tough-meat', 'bezoar-risk',
  // Thyroid timing
  'iron-supplement', 'calcium-rich', 'high-fiber', 'coffee', 'tea', 'basic-ingredient', 'chocolate', 'citrus', 'tomato', 'spicy', 'carbonated', 'mint', 'msg', 'aspartame', 'iron-rich', 'vitamin-c-rich', 'emulsifier-additive', 'smoked-seafood-refrigerated', 'may-contain',
]);

// Foundation measure units that are not real household portions.
const SKIP_MEASURE_UNITS = new Set(['1010', '1011', '1012']); // paired cooked w, paired raw w, dripping w
const UNDETERMINED_UNIT = '9999';

// ---------------------------------------------------------------------------
// Minimal CSV parser: handles quoted fields, embedded commas, doubled quotes,
// embedded newlines and CRLF. Calls onRow(fields) for every row including header.
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
  // Files are read exactly once; the largest (SR food_nutrient.csv, ~36 MB) is
  // parsed in a single pass and only rows for selected foods are retained.
  const text = fs.readFileSync(file, 'utf8');
  let header = null;
  parseCSV(text, (fields) => {
    if (!header) { header = fields.map((h) => h.trim()); return; }
    if (fields.length === 1 && fields[0] === '') return; // trailing blank line
    onRow(fields, header);
  });
}

function indexOf(header, name) {
  const i = header.indexOf(name);
  if (i < 0) throw new Error(`Column "${name}" not found in header: ${header.join(',')}`);
  return i;
}

// ---------------------------------------------------------------------------
// Locate dataset folders
// ---------------------------------------------------------------------------

function findDatasetDir(parent) {
  const base = path.join(USDA_DIR, parent);
  if (!fs.existsSync(base)) throw new Error(`Missing ${base}. Unzip tools/usda/${parent}.zip into tools/usda/${parent}/`);
  const candidates = [base, ...fs.readdirSync(base).map((d) => path.join(base, d))]
    .filter((d) => fs.existsSync(path.join(d, 'food.csv')) && fs.existsSync(path.join(d, 'food_nutrient.csv')));
  if (candidates.length === 0) throw new Error(`No food.csv found under ${base}`);
  return candidates.sort()[0];
}

const DATASETS = [
  { key: 'foundation', dir: findDatasetDir('foundation'), foodFilter: (dataType) => dataType === 'foundation_food' },
  { key: 'sr-legacy', dir: findDatasetDir('sr_legacy'), foodFilter: (dataType) => dataType === 'sr_legacy_food' },
];

// ---------------------------------------------------------------------------
// Load selection
// ---------------------------------------------------------------------------

const selection = JSON.parse(fs.readFileSync(SELECTION_PATH, 'utf8'));
if (!Array.isArray(selection)) throw new Error('tools/food-selection.json must be an array');

const errors = [];
const warnings = [];
const seenIds = new Set();
for (const entry of selection) {
  if (!Number.isInteger(entry.fdcId)) errors.push(`Selection entry without integer fdcId: ${JSON.stringify(entry)}`);
  if (seenIds.has(entry.fdcId)) errors.push(`Duplicate fdcId in selection: ${entry.fdcId}`);
  seenIds.add(entry.fdcId);
  if (typeof entry.short !== 'string' || !entry.short) errors.push(`fdcId ${entry.fdcId}: missing short name`);
  if (!Array.isArray(entry.tags)) errors.push(`fdcId ${entry.fdcId}: tags must be an array`);
  else for (const tag of entry.tags) if (!TAG_VOCABULARY.has(tag)) errors.push(`fdcId ${entry.fdcId}: unknown tag "${tag}"`);
  if (entry.tag_review) for (const tag of entry.tag_review) if (!TAG_VOCABULARY.has(tag)) errors.push(`fdcId ${entry.fdcId}: unknown tag_review tag "${tag}"`);
  if (entry.portions_add) {
    for (const p of entry.portions_add) {
      if (typeof p.label !== 'string' || !(p.grams > 0)) errors.push(`fdcId ${entry.fdcId}: bad portions_add entry ${JSON.stringify(p)}`);
    }
  }
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
const selectedIds = new Set(selection.map((e) => String(e.fdcId)));
// fill_from: an SR Legacy (or Foundation) record whose values fill ONLY the nutrient keys the primary record lacks.
// Every filled value is annotated in per100g_sources so it stays traceable to its own FDC id.
const fillIds = new Set(selection.filter((e) => e.fill_from).map((e) => String(e.fill_from)));
const neededIds = new Set([...selectedIds, ...fillIds]);

// ---------------------------------------------------------------------------
// Load reference tables and foods per dataset
// ---------------------------------------------------------------------------

const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

function fmtAmount(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(round2(n));
}

const foodInfo = new Map(); // fdcId -> { dataset, name, group }
const datasetOrder = new Map(DATASETS.map((d, i) => [d.key, i]));

for (const ds of DATASETS) {
  const categories = new Map();
  readCSV(path.join(ds.dir, 'food_category.csv'), (f, h) => {
    categories.set(f[indexOf(h, 'id')], f[indexOf(h, 'description')]);
  });
  ds.measureUnits = new Map();
  readCSV(path.join(ds.dir, 'measure_unit.csv'), (f, h) => {
    ds.measureUnits.set(f[indexOf(h, 'id')], f[indexOf(h, 'name')]);
  });
  // Verify nutrient ids against nutrient.csv
  readCSV(path.join(ds.dir, 'nutrient.csv'), (f, h) => {
    const id = Number(f[indexOf(h, 'id')]);
    if (!NEEDED_NUTRIENT_IDS.has(id)) return;
    const name = f[indexOf(h, 'name')];
    const unit = f[indexOf(h, 'unit_name')];
    if (!EXPECTED_NUTRIENT_NAMES[id].test(name)) warnings.push(`[${ds.key}] nutrient ${id} is named "${name}", expected ${EXPECTED_NUTRIENT_NAMES[id]}`);
    if (unit !== EXPECTED_UNITS[id]) warnings.push(`[${ds.key}] nutrient ${id} unit is ${unit}, expected ${EXPECTED_UNITS[id]}`);
  });
  readCSV(path.join(ds.dir, 'food.csv'), (f, h) => {
    if (!ds.foodFilter(f[indexOf(h, 'data_type')])) return;
    const id = f[indexOf(h, 'fdc_id')];
    if (!neededIds.has(id)) return;
    if (foodInfo.has(id)) return; // Foundation is loaded first and wins
    foodInfo.set(id, {
      dataset: ds.key,
      name: f[indexOf(h, 'description')].trim(),
      group: categories.get(f[indexOf(h, 'food_category_id')]) || null,
    });
  });
}

for (const entry of selection) {
  if (!foodInfo.has(String(entry.fdcId))) errors.push(`fdcId ${entry.fdcId} (${entry.short}) not found in Foundation or SR Legacy food.csv`);
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }

// ---------------------------------------------------------------------------
// Nutrients and portions (one pass per file)
// ---------------------------------------------------------------------------

const nutrientsByFood = new Map(); // fdcId -> Map(nutrientId -> amount)
const portionsByFood = new Map(); // fdcId -> [{seq, id, label, grams}]

for (const ds of DATASETS) {
  const idsInDataset = new Set([...foodInfo].filter(([, v]) => v.dataset === ds.key).map(([k]) => k));

  readCSV(path.join(ds.dir, 'food_nutrient.csv'), (f, h) => {
    const fdcId = f[indexOf(h, 'fdc_id')];
    if (!idsInDataset.has(fdcId)) return;
    const nutrientId = Number(f[indexOf(h, 'nutrient_id')]);
    if (!NEEDED_NUTRIENT_IDS.has(nutrientId)) return;
    const raw = f[indexOf(h, 'amount')];
    if (raw === '' || raw == null) return;
    const amount = Number(raw);
    if (!Number.isFinite(amount)) return;
    let m = nutrientsByFood.get(fdcId);
    if (!m) { m = new Map(); nutrientsByFood.set(fdcId, m); }
    if (m.has(nutrientId)) {
      if (m.get(nutrientId) !== amount) warnings.push(`[${ds.key}] fdcId ${fdcId} has multiple rows for nutrient ${nutrientId}; kept first (${m.get(nutrientId)}), ignored ${amount}`);
      return;
    }
    m.set(nutrientId, amount);
  });

  readCSV(path.join(ds.dir, 'food_portion.csv'), (f, h) => {
    const fdcId = f[indexOf(h, 'fdc_id')];
    if (!idsInDataset.has(fdcId)) return;
    const unitId = f[indexOf(h, 'measure_unit_id')];
    if (SKIP_MEASURE_UNITS.has(unitId)) return;
    const grams = Number(f[indexOf(h, 'gram_weight')]);
    if (!(grams > 0)) return;
    const amount = fmtAmount(f[indexOf(h, 'amount')]);
    const unitName = unitId === UNDETERMINED_UNIT ? '' : (ds.measureUnits.get(unitId) || '');
    const description = (f[indexOf(h, 'portion_description')] || '').trim();
    const modifier = (f[indexOf(h, 'modifier')] || '').trim();
    const parts = [amount, unitName, description, modifier].filter(Boolean);
    if (parts.length === 0) return;
    const label = parts.join(' ').replace(/\s+/g, ' ').trim();
    const seq = Number(f[indexOf(h, 'seq_num')]);
    let list = portionsByFood.get(fdcId);
    if (!list) { list = []; portionsByFood.set(fdcId, list); }
    list.push({ seq: Number.isFinite(seq) ? seq : Number.MAX_SAFE_INTEGER, id: Number(f[indexOf(h, 'id')]), label, grams: round2(grams) });
  });
}

// ---------------------------------------------------------------------------
// Assemble
// ---------------------------------------------------------------------------

function pick(m, ids) {
  for (const id of ids) if (m && m.has(id)) return { id, value: m.get(id) };
  return null;
}

const foods = [];
const stats = { byDataset: {}, byGroup: {}, nonNull: {}, noUsdaPortion: [], missingKey: { kcal: [], sodium_mg: [], potassium_mg: [] } };
for (const key of Object.keys(NUTRIENT_KEYS)) stats.nonNull[key] = 0;

for (const entry of selection) {
  const fdcId = String(entry.fdcId);
  const info = foodInfo.get(fdcId);
  const m = nutrientsByFood.get(fdcId) || new Map();

  const per100g = {};
  const per100gSources = {};
  const fillId = entry.fill_from ? String(entry.fill_from) : null;
  const fm = fillId ? (nutrientsByFood.get(fillId) || null) : null;
  if (fillId && !foodInfo.has(fillId)) errors.push(`fdcId ${fdcId}: fill_from ${fillId} not found in any dataset`);
  let kcalSource = null;
  let folateSource = null;
  let vitDSource = null;
  for (const [key, ids] of Object.entries(NUTRIENT_KEYS)) {
    let hit = pick(m, ids);
    if (!hit && fm) { const fh = pick(fm, ids); if (fh) { hit = fh; per100gSources[key] = `fdc-${fillId}`; } }
    if (!hit && key === 'fiber_g') { const ah = pick(m, [2033]); if (ah) { hit = ah; per100gSources[key] = 'aoac-2033'; } }
    if (!hit) { per100g[key] = null; continue; }
    let value = hit.value;
    if (key === 'kcal') kcalSource = KCAL_SOURCE[hit.id];
    if (key === 'folate_ug') folateSource = FOLATE_SOURCE[hit.id];
    if (key === 'vitamin_d_iu') { vitDSource = VITD_SOURCE[hit.id]; if (hit.id === 1114) value = value * 40; }
    per100g[key] = round2(value);
    stats.nonNull[key]++;
  }
  for (const k of ['kcal', 'sodium_mg', 'potassium_mg']) if (per100g[k] === null) stats.missingKey[k].push(`${fdcId} ${entry.short}`);

  const usdaPortions = (portionsByFood.get(fdcId) || [])
    .sort((a, b) => a.seq - b.seq || a.id - b.id);
  const portions = [{ label: '100 g', grams: 100 }];
  const labels = new Set(['100 g']);
  for (const p of usdaPortions) {
    if (labels.has(p.label)) continue;
    labels.add(p.label);
    portions.push({ label: p.label, grams: p.grams });
  }
  if (usdaPortions.length === 0) stats.noUsdaPortion.push(`${fdcId} ${entry.short}`);
  for (const p of entry.portions_add || []) {
    if (labels.has(p.label)) continue;
    labels.add(p.label);
    portions.push({ label: p.label, grams: round2(Number(p.grams)), source: 'manual' });
  }

  const tags = [...new Set(entry.tags)].sort();

  foods.push({
    id: `fdc-${fdcId}`,
    fdcId: entry.fdcId,
    dataset: info.dataset,
    fill_from: fillId ? { id: `fdc-${fillId}`, name: foodInfo.get(fillId) ? foodInfo.get(fillId).name : null, keys: Object.keys(per100gSources) } : undefined,
    name: info.name,
    short: entry.short,
    group: info.group,
    per100g,
    kcal_source: kcalSource,
    folate_source: folateSource,
    vitamin_d_source: vitDSource,
    portions,
    tags,
    tag_notes: entry.tag_notes && typeof entry.tag_notes === 'object' ? entry.tag_notes : {},
  });

  stats.byDataset[info.dataset] = (stats.byDataset[info.dataset] || 0) + 1;
  stats.byGroup[info.group] = (stats.byGroup[info.group] || 0) + 1;
}

foods.sort((a, b) => a.fdcId - b.fdcId);

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
const json = JSON.stringify(foods, null, 1) + '\n';
fs.writeFileSync(OUTPUT_PATH, json);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`Wrote ${path.relative(ROOT, OUTPUT_PATH)}: ${foods.length} foods, ${(Buffer.byteLength(json) / 1024).toFixed(0)} KB, ${elapsed}s`);
console.log('By dataset:', JSON.stringify(stats.byDataset));
console.log('By group:');
for (const [g, n] of Object.entries(stats.byGroup).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${g}`);
console.log('Non-null per100g values per key:');
for (const [k, n] of Object.entries(stats.nonNull)) console.log(`  ${String(n).padStart(4)} / ${foods.length}  ${k}`);
const kcalSources = {};
for (const f of foods) kcalSources[f.kcal_source] = (kcalSources[f.kcal_source] || 0) + 1;
console.log('kcal_source:', JSON.stringify(kcalSources));
const folateSources = {};
for (const f of foods) folateSources[f.folate_source] = (folateSources[f.folate_source] || 0) + 1;
console.log('folate_source:', JSON.stringify(folateSources));
console.log(`Foods with no USDA portion (100 g only unless portions_add): ${stats.noUsdaPortion.length}`);
for (const k of Object.keys(stats.missingKey)) {
  if (stats.missingKey[k].length) console.log(`Foods missing ${k} (${stats.missingKey[k].length}): ${stats.missingKey[k].join('; ')}`);
}
if (warnings.length) {
  console.log(`Warnings (${warnings.length}):`);
  for (const w of warnings) console.log('  ' + w);
}
