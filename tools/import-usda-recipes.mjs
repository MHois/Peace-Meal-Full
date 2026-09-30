// Imports the USDA MyPlate Kitchen recipe library into data/recipes-usda.json as an optional collection.
//
// MyPlate Kitchen (myplate.gov/myplate-kitchen) was retired in January 2026. The recipes are US federal
// works in the public domain (17 USC 105). Two copies remain:
//   1. The original myplate.gov pages in the Internet Archive Wayback Machine (preferred; used whenever a
//      snapshot is reachable and parses cleanly). source_url then points at the snapshot.
//   2. myplate.food/recipes, a mirror not affiliated with USDA. Only the original USDA fields are taken from
//      it (title, ingredients, directions, yield, times, nutrition, food groups, USDA notes); the mirror's own
//      commentary, images, ratings, and translations are not. Its per-recipe list and its JSON-LD
//      "isBasedOn" (the original myplate.gov URL) are used to find each Wayback snapshot. source_url
//      points at the mirror page only when the Wayback copy was unavailable or unparseable.
//      The mirror's REST API is deliberately not used: its terms exclude bulk replication.
//
// Every HTTP response is cached under tools/usda-recipes/ so re-runs are offline. Requests are sequential,
// 400 ms apart, retried once after 2 s on network errors; HTTP 429/5xx back off and retry.
// Through the session proxy Node's fetch needs NODE_USE_ENV_PROXY=1; the script re-executes itself with it set.
//
// Usage: node tools/import-usda-recipes.mjs [--limit N] [--mirror-only] [--offline] [--keep-same-title]
//   --keep-same-title keeps distinct recipes that share a title (USDA published e.g. two different "Potato Soup"s); by default only the first id is kept.
import fs from 'node:fs';
import { fixMeal } from './lib/meal-components.mjs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY && !process.env.USDA_IMPORT_CHILD) {
  const r = spawnSync(process.execPath, ['--no-warnings', fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1', USDA_IMPORT_CHILD: '1' } });
  process.exit(r.status ?? 1);
}

const CACHE = new URL('./usda-recipes/', import.meta.url);
const OUT = new URL('../data/recipes-usda.json', import.meta.url);
fs.mkdirSync(CACHE, { recursive: true });

const args = process.argv.slice(2);
const flag = n => args.includes(n);
const LIMIT = Number(args[args.indexOf('--limit') + 1]) || 0;
const MIRROR_ONLY = flag('--mirror-only');
const OFFLINE = flag('--offline');
const KEEP_SAME_TITLE = flag('--keep-same-title');

const UA = 'PeaceMeal-recipe-import/1.0 (personal family app)';
const DELAY_MS = 400;
const MIRROR = 'https://myplate.food';
const WAYBACK = 'https://web.archive.org/web/2025id_/';
const SOURCE = 'USDA MyPlate Kitchen';
const LICENSE = 'Public domain (US federal work, 17 USC 105)';
const NUTRITION_SOURCE = 'usda-myplate-kitchen';
const NUTRIENT_KEYS = ['kcal','protein_g','carb_g','fiber_g','sugar_g','added_sugar_g','fat_g','satfat_g','transfat_g','cholesterol_mg','sodium_mg','potassium_mg','phosphorus_mg','calcium_mg','iron_mg','magnesium_mg','vitamin_c_mg','vitamin_d_iu','vitamin_b12_ug','folate_ug','zinc_mg','caffeine_mg','alcohol_g'];

const stats = { problems: [], backoffs: 0, fetched: 0, cached: 0 };
const problem = m => { stats.problems.push(m); console.error('  ! ' + m); };

// ---------------------------------------------------------------- fetching (cached, polite)
let lastFetch = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function cachePath(url) {
  const h = crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
  const tail = url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '_').slice(0, 70);
  return new URL(`./${tail}_${h}.json`, CACHE);
}
// Returns { status, url (final, after redirects), body }. Non-200 answers are cached too so re-runs stay offline.
async function fetchPage(url) {
  const cp = cachePath(url);
  if (fs.existsSync(cp)) { stats.cached++; return JSON.parse(fs.readFileSync(cp, 'utf8')); }
  if (OFFLINE) return { status: 0, url, body: '' };
  const attempts = 4;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const wait = lastFetch + DELAY_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastFetch = Date.now();
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xml;q=0.9,*/*;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(60000) });
      stats.fetched++;
      if (res.status === 429 || res.status >= 500) {
        const ra = Number(res.headers.get('retry-after')) || (res.status === 429 ? 30 : 3);
        if (attempt < attempts - 1) { stats.backoffs++; console.error(`  ~ HTTP ${res.status} for ${url.slice(0, 100)}; waiting ${ra}s`); await sleep(ra * 1000 + 500); lastFetch = Date.now(); continue; }
        return { status: res.status, url: res.url, body: '' }; // not cached: transient
      }
      const body = res.ok ? await res.text() : '';
      const rec = { status: res.status, url: res.url || url, body };
      fs.writeFileSync(cp, JSON.stringify(rec));
      return rec;
    } catch (e) {
      // The session proxy's tunnel to web.archive.org drops intermittently; retry after 2 s, then once more after 5 s.
      const msg = e.cause?.code || e.name || e.message;
      if (attempt >= 2) { problem(`fetch failed for ${url.slice(0, 120)}: ${msg}`); return { status: 0, url, body: '' }; }
      stats.backoffs++;
      await sleep(attempt === 0 ? 2000 : 5000);
    }
  }
  return { status: 0, url, body: '' };
}

// ---------------------------------------------------------------- shared helpers
// Copied verbatim from tools/import-open-recipes.mjs so the collections behave the same (that file is not importable without running its main).
const decodeEntities = s => String(s)
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&deg;/g, '°').replace(/&frac12;/g, '½').replace(/&frac14;/g, '¼').replace(/&frac34;/g, '¾').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—');
const stripTags = s => decodeEntities(String(s).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const slug = s => String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);

function inferEquipment(steps) {
  const t = steps.join(' ').toLowerCase().replace(/dutch oven/g, 'dutch pot');
  const eq = new Set();
  if (/\b(oven|bake|baked|baking|roast|roasted|roasting|grill|grilled|grilling|broil|broiler|preheat)\b/.test(t)) eq.add('oven');
  if (/\b(pan|saucepan|frying|fry|fried|boil|boiling|simmer|simmering|hob|stove|stovetop|skillet|wok|sauté|saute|sauteed|sautéed|griddle|pot\b|burner|heat the oil|medium heat|high heat|low heat|deep-fry|deep fry|poach|steam)/.test(t)) eq.add('stove');
  if (/\bmicrowave/.test(t)) eq.add('microwave');
  if (/\b(blender|blend|food processor|liquidi[sz]e|purée in|puree in|immersion|stick blender)\b/.test(t)) eq.add('blender');
  if (/\b(slow cooker|slow-cooker|crock ?pot)\b/.test(t)) eq.add('slow-cooker');
  if (/\b(pressure cooker|pressure-cooker|instant pot)\b/.test(t)) eq.add('pressure-cooker');
  if (/\b(air fryer|air-fryer|airfryer)\b/.test(t)) eq.add('air-fryer');
  return eq.size ? [...eq] : ['none'];
}
function inferLeftovers(name, categories = []) {
  const t = (name + ' ' + categories.join(' ')).toLowerCase();
  if (/\b(salad|sandwich|wrap|toast|pancake|smoothie|milkshake|omelette|omelet|scrambled|bap|pitta|pita|crumpet|bagel|fritter|fried egg|poached egg|toastie|shake|juice|drink|beverage|ice cream|sorbet)/.test(t)) return 'poor';
  if (/\b(soup|curry|stew|chilli|chili|casserole|bolognese|dhal|dal|daal|bake|pie|lasagn|ragu|ragù|braise|jollof|rice and peas|risotto|cobbler|meatball|kofta|tagine|goulash|hotpot|cottage|shepherd|pilau|pilaf|biryani|jambalaya|bean|lentil|chickpea|pulled|roast|loaf|muffin|bread|cake|cookie|biscuit|granola|jam|chutney|sauce|pickle)/.test(t)) return 'good';
  return 'ok';
}
const HEAT = /\b(cook|heat|bake|fry|boil|simmer|roast|grill|toast|microwave|oven|saut|steam|poach|preheat|griddle|sear|warm through|melt)/i;
function estimateTimes(steps) {
  const t = steps.join(' ');
  let total = Math.max(5, steps.length * 4);
  const mins = [...t.matchAll(/(\d+)\s*(?:to|-|–)?\s*(\d+)?\s*(?:min|minute)s?\b/gi)].map(m => Number(m[2] || m[1]));
  const hours = [...t.matchAll(/(\d+(?:[.,]\d+)?|half an|an|one)\s*(?:to|-|–)?\s*(\d+)?\s*(?:hour|hr)s?\b/gi)].map(m => { const a = m[1].toLowerCase(); const v = /half/.test(a) ? 0.5 : /^(an|one)$/.test(a) ? 1 : Number(String(a).replace(',', '.')); return (Number(m[2]) || v || 0) * 60; });
  const stated = mins.reduce((a, b) => a + b, 0) + hours.reduce((a, b) => a + b, 0);
  if (/overnight/i.test(t)) total = Math.max(total, 480);
  total = Math.max(total, Math.round((Number.isFinite(stated) ? stated : 0) + steps.length * 2));
  total = Math.min(total, 24 * 60);
  if (!Number.isFinite(total)) total = Math.max(5, steps.length * 4);
  const active = Math.min(total, Math.max(5, steps.length * 3));
  return { active_min: active, total_min: total };
}
function parseDuration(s) {
  if (!s) return null;
  let m = 0, hit = false;
  for (const h of s.matchAll(/(\d+(?:[.,]\d+)?|½)\s*(?:hours?|hrs?)\b/gi)) { m += (h[1] === '½' ? 0.5 : Number(h[1].replace(',', '.'))) * 60; hit = true; }
  for (const h of s.matchAll(/(\d+)\s*(?:mins?|minutes?)\b/gi)) { m += Number(h[1]); hit = true; }
  if (!hit) { const n = s.match(/(\d+)/); if (n) { m = Number(n[1]); hit = true; } }
  return hit ? Math.round(m) : null;
}
// (end of copied helpers)

// ISO 8601 durations from schema.org (PT1H30M) or free text ("1 hour 30 minutes").
function parseIsoOrText(s) {
  if (!s) return null;
  const iso = String(s).match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (iso && /^P/.test(s)) { const v = (Number(iso[1]) || 0) * 1440 + (Number(iso[2]) || 0) * 60 + (Number(iso[3]) || 0); return v > 0 ? v : null; }
  return parseDuration(String(s));
}
const FRAC = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
function parseQuantity(s) {
  // "1/4", "1 1/2", "2", "½", "1 ½", "0.5" -> number
  const t = String(s).trim().replace(/(\d)\s*([½¼¾⅓⅔⅛])/g, '$1 $2').replace(/[½¼¾⅓⅔⅛]/g, c => String(FRAC[c])).trim();
  let m = t.match(/^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/);
  if (m) return Math.round((Number(m[1] || 0) + Number(m[2]) / Number(m[3])) * 1000) / 1000;
  m = t.match(/^(?:(\d+)\s+)?(\d*\.?\d+)$/);
  if (m) return Math.round((Number(m[1] || 0) + Number(m[2])) * 1000) / 1000;
  return null;
}
function parseYield(y) {
  if (!y) return null;
  const t = String(y).toLowerCase();
  const dz = t.match(/(\d+)\s*dozen/); if (dz) return Number(dz[1]) * 12;
  const m = t.match(/(\d+)/); if (!m) return null;
  const n = Number(m[1]); return n >= 1 && n <= 200 ? n : null;
}
function usdaMeal(category, name) {
  const c = String(category || '').toLowerCase(), t = String(name || '').toLowerCase();
  const meal = new Set();
  if (/breakfast/.test(c)) meal.add('breakfast');
  if (/main/.test(c)) meal.add('dinner');
  if (/side|salad|soup|stew|sandwich|wrap/.test(c)) { meal.add('lunch'); if (/side|soup|stew/.test(c)) meal.add('dinner'); }
  if (/dessert|snack|beverage|drink|bread|appetizer|dip|sauce|condiment|dressing/.test(c)) meal.add('snack');
  if (!meal.size) {
    if (/\b(porridge|oatmeal|breakfast|overnight oats|pancake|waffle|granola|french toast|scrambled|eggs?\b|bagel|smoothie|parfait|frittata|omelet)/.test(t)) meal.add('breakfast');
    if (/\b(soup|sandwich|wrap|salad|pita|toast|quesadilla|lunch)/.test(t)) meal.add('lunch');
    if (/\b(curry|stew|pie|bake|casserole|chili|risotto|stir-fry|stir fry|pasta|rice|kebab|skewer|burger|meatball|meatloaf|roast|chicken|beef|pork|fish|salmon|tuna|turkey|tacos?|enchilada|lasagna|dinner)/.test(t)) meal.add('dinner');
    if (/\b(muffin|pudding|crumble|crisp|cobbler|popcorn|ice cream|cakes?|cookies?|bars?|dip|fruit|banana|snack|smoothie|shake)\b/.test(t)) meal.add('snack');
  }
  return meal.size ? [...meal] : ['lunch', 'dinner'];
}

// ---------------------------------------------------------------- nutrition table parsing (shared by both page styles)
// label -> [NUTRIENT_KEY, expected unit]
const LABELS = [
  [/^total calories$/i, 'kcal', 'kcal'], [/^total fat$/i, 'fat_g', 'g'], [/^saturated fat$/i, 'satfat_g', 'g'], [/^trans fat$/i, 'transfat_g', 'g'],
  [/^cholesterol$/i, 'cholesterol_mg', 'mg'], [/^sodium$/i, 'sodium_mg', 'mg'], [/^carbohydrates?$/i, 'carb_g', 'g'], [/^dietary fiber$/i, 'fiber_g', 'g'],
  [/^total sugars$/i, 'sugar_g', 'g'], [/^added sugars( included)?$/i, 'added_sugar_g', 'g'], [/^protein$/i, 'protein_g', 'g'],
  [/^calcium$/i, 'calcium_mg', 'mg'], [/^potassium$/i, 'potassium_mg', 'mg'], [/^iron$/i, 'iron_mg', 'mg'], [/^magnesium$/i, 'magnesium_mg', 'mg'],
  [/^phosphorus$/i, 'phosphorus_mg', 'mg'], [/^zinc$/i, 'zinc_mg', 'mg'], [/^vitamin c$/i, 'vitamin_c_mg', 'mg'], [/^vitamin d$/i, 'vitamin_d_iu', 'mcg|iu'],
  [/^vitamin b12$/i, 'vitamin_b12_ug', 'mcg'], [/^folate$/i, 'folate_ug', 'mcg'], [/^caffeine$/i, 'caffeine_mg', 'mg'], [/^alcohol$/i, 'alcohol_g', 'g']
];
function parseNutritionRows(html) {
  // Every <tr> with two cells; first is label, second "231", "1 g", "0.1 mg", "N/A".
  const out = {}; let rows = 0;
  for (const tr of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m => stripTags(m[1]));
    if (cells.length < 2) continue;
    const label = cells[0].replace(/\s+/g, ' ').trim(); const val = cells[1].trim();
    const hit = LABELS.find(([re]) => re.test(label)); if (!hit) continue;
    rows++;
    const [, key, unit] = hit;
    if (/^n\/?a$/i.test(val) || val === '') { if (!(key in out)) out[key] = null; continue; }
    const m = val.match(/^(-?[\d,]*\.?\d+)\s*([a-zµμ]*)/i); if (!m) continue;
    let n = Number(m[1].replace(/,/g, '')); const u = m[2].toLowerCase();
    if (!Number.isFinite(n)) continue;
    if (key === 'vitamin_d_iu') { if (u === 'mcg' || u === 'µg' || u === 'μg' || u === '') n = n * 40; else if (u !== 'iu') continue; }
    else if (u && unit !== 'kcal' && u !== unit) { problem(`unexpected unit "${u}" for ${label}`); continue; }
    // Keep the most precise value seen (the collapsed and expanded tables repeat rows; JSON-LD may add decimals).
    if (out[key] == null || String(n).length > String(out[key]).length) out[key] = n;
  }
  return { values: out, rows };
}
function parseFoodGroups(html) {
  const groups = [];
  for (const tr of html.matchAll(/<tr[^>]*class="mp-food-group__row"[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const label = stripTags((tr[1].match(/mp-food-group__label"[^>]*>([\s\S]*?)<\/td>/) || [])[1] || '');
    const item = stripTags((tr[1].match(/mp-food-group__item"[^>]*>([\s\S]*?)<\/td>/) || [])[1] || '');
    if (label && item) groups.push(foodGroup(label, item));
  }
  return groups;
}
function foodGroup(label, item) {
  const m = item.match(/^([\d\s\/.½¼¾⅓⅔⅛]+)\s*([a-z]+)/i);
  return { group: label.toLowerCase(), amount: m ? parseQuantity(m[1]) : null, unit: m ? m[2].toLowerCase().replace(/s$/, '') : null, display: item };
}
function ldBlocks(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const j = JSON.parse(m[1]); out.push(...(Array.isArray(j) ? j : j['@graph'] ? j['@graph'] : [j])); } catch { /* skip */ }
  }
  return out;
}
function ldRecipe(html) { return ldBlocks(html).find(b => b['@type'] === 'Recipe' || (Array.isArray(b['@type']) && b['@type'].includes('Recipe'))) || null; }
function ldNutrition(n) {
  if (!n) return {};
  const pick = (v) => { if (v == null) return undefined; const m = String(v).match(/(-?[\d,]*\.?\d+)/); return m ? Number(m[1].replace(/,/g, '')) : undefined; };
  const map = { calories: 'kcal', fatContent: 'fat_g', saturatedFatContent: 'satfat_g', transFatContent: 'transfat_g', cholesterolContent: 'cholesterol_mg', sodiumContent: 'sodium_mg', carbohydrateContent: 'carb_g', fiberContent: 'fiber_g', sugarContent: 'sugar_g', proteinContent: 'protein_g' };
  const out = {};
  for (const [k, key] of Object.entries(map)) { const v = pick(n[k]); if (v !== undefined) out[key] = v; }
  return out;
}
function listItems(html) { return [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map(m => stripTags(m[1])).filter(Boolean); }
function paragraphs(html) { return html.split(/<\/p>|<br\s*\/?>|\n/).map(stripTags).filter(Boolean); }
function stepsFrom(html, ldSteps) {
  let steps;
  if (/<ol[\s>]/i.test(html)) {
    // Numbered steps; anything after the list (a footnote paragraph, sometimes with a sub-list such as a home-made sauce) becomes one final step.
    steps = [...html.matchAll(/<ol[^>]*>([\s\S]*?)<\/ol>/gi)].flatMap(m => listItems(m[1]));
    const rest = html.replace(/<ol[^>]*>[\s\S]*?<\/ol>/gi, '');
    const paras = paragraphs(rest.replace(/<ul[^>]*>[\s\S]*?<\/ul>/gi, '')), items = listItems(rest);
    const tail = [paras.join(' '), items.join('; ')].filter(Boolean).join(' ');
    if (tail) steps.push(tail);
  } else steps = listItems(html);
  if (!steps.length) steps = paragraphs(html);
  if (!steps.length && ldSteps) steps = ldSteps;
  return steps.map(s => s.replace(/^\d+[.)]\s+/, '')).filter(s => s.length > 1);
}
function ldSteps(rec) {
  const ri = rec?.recipeInstructions; if (!ri) return null;
  if (typeof ri === 'string') return paragraphs(ri);
  return ri.flatMap(s => typeof s === 'string' ? [s] : s['@type'] === 'HowToSection' ? (s.itemListElement || []).map(x => x.text || x.name) : [s.text || s.name]).map(s => stripTags(s || '')).filter(Boolean);
}

// ---------------------------------------------------------------- A. original myplate.gov page (Wayback snapshot)
function parseOriginal(html) {
  if (!/mp-recipe-full|field--name-field-mp-ingredients/.test(html)) return null;
  const rec = ldRecipe(html) || {};
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const name = stripTags(rec.name || (h1 ? h1[1] : ''));
  if (!name) return null;
  const details = {};
  for (const d of html.matchAll(/<div class="mp-recipe-full__detail[ "][^"]*"[^>]*>([\s\S]*?)<\/div>/g)) {
    const label = stripTags((d[1].match(/detail--label[^"]*"[^>]*>([\s\S]*?)<\/span>/) || [])[1] || '').replace(/:$/, '').toLowerCase();
    const data = stripTags((d[1].match(/detail--data[^"]*"[^>]*>([\s\S]*?)<\/span>/) || [])[1] || '');
    if (label) details[label] = data;
  }
  const detail = re => { const k = Object.keys(details).find(k => re.test(k)); return k ? details[k] : null; };
  const yieldText = detail(/makes|yield|serv/) || rec.recipeYield || null;
  const ing = html.match(/field--name-field-mp-ingredients[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>\s*<\/div>/);
  const ingredients = ing ? listItems(ing[1]) : (rec.recipeIngredient || []).map(stripTags);
  const dir = html.match(/field--name-field-instructions[\s\S]*?<div class="field__item">([\s\S]*?)<\/div>\s*<\/div>/);
  const steps = stepsFrom(dir ? dir[1] : '', ldSteps(rec));
  const notesM = html.match(/field--name-field-notes[\s\S]*?<div class="field__item">([\s\S]*?)<\/div>\s*<\/div>/);
  let notes = '';
  if (notesM) {
    const raw = notesM[1].replace(/<p>\s*Learn more about:?[\s\S]*$/i, '').replace(/<ul>[\s\S]*?<\/ul>/gi, '');
    notes = paragraphs(raw).join(' ').trim();
  }
  const nutBlock = (html.match(/mp-recipe-full__nutrition\b[\s\S]*?<\/form>/) || [])[0] || (html.match(/Nutrition Information[\s\S]*?MyPlate Food Groups/) || [])[0] || '';
  const table = parseNutritionRows(nutBlock);
  const serving = stripTags((nutBlock.match(/Serving Size:<\/strong>\s*([\s\S]*?)<\/div>/) || [])[1] || rec.nutrition?.servingSize || '');
  const nutrition = { ...table.values, ...ldNutrition(rec.nutrition) }; // JSON-LD carries two decimals where the table rounds
  // Visible labels win: the original JSON-LD writes totalTime as seconds ("PT20S" for 20 minutes), which parses to nothing.
  const times = { prep: parseIsoOrText(detail(/prep/) || rec.prepTime), cook: parseIsoOrText(detail(/cook/) || rec.cookTime), total: parseIsoOrText(detail(/total/) || rec.totalTime) };
  return { name, yieldText, servingSize: serving, ingredients, steps, notes, nutrition, nutritionRows: table.rows, foodGroups: parseFoodGroups(html), times, category: rec.recipeCategory || null, detailLabels: Object.keys(details) };
}

// ---------------------------------------------------------------- B. mirror page
function parseMirror(html) {
  const rec = ldRecipe(html);
  if (!rec) return null;
  const name = stripTags(rec.name || '');
  if (!name) return null;
  const main = html.replace(/<script[\s\S]*?<\/script>/g, '');
  const ingredients = (rec.recipeIngredient || []).map(stripTags);
  const steps = ldSteps(rec) || [];
  const nutBlock = (main.match(/Nutrition per serving[\s\S]*?<\/table>/) || [])[0] || '';
  const table = parseNutritionRows(nutBlock);
  const nutrition = { ...ldNutrition(rec.nutrition), ...table.values }; // the mirror's table carries two decimals; its JSON-LD rounds calories
  const fgBlock = (main.match(/>\s*Food groups\s*<[\s\S]*?(?=<h2|Ingredients)/) || [])[0] || '';
  const foodGroups = [];
  for (const m of fgBlock.matchAll(/>\s*(Fruits?|Vegetables?|Grains?|Protein Foods?|Dairy)\s*:?\s*<\/[^>]+>\s*(?:<[^>]+>\s*)*([\d][^<]*)/gi)) foodGroups.push(foodGroup(m[1], m[2].trim()));
  if (!foodGroups.length) for (const m of stripTags(fgBlock).matchAll(/(Fruits?|Vegetables?|Grains?|Protein Foods?|Dairy):\s*([\d][\d\s\/.]*\s*[a-z]+)/gi)) foodGroups.push(foodGroup(m[1], m[2].trim()));
  const notesBlock = (main.match(/<h2[^>]*>\s*Notes\s*<\/h2>([\s\S]*?)(?=<h2|<section|<footer)/i) || [])[1] || '';
  const notes = paragraphs(notesBlock).filter(p => !/recipes you may also like/i.test(p)).join(' ').trim();
  const times = { prep: parseIsoOrText(rec.prepTime), cook: parseIsoOrText(rec.cookTime), total: parseIsoOrText(rec.totalTime) };
  return { name, yieldText: rec.recipeYield || null, servingSize: rec.nutrition?.servingSize || null, ingredients, steps, notes, nutrition, nutritionRows: table.rows, foodGroups, times, category: rec.recipeCategory || null, isBasedOn: typeof rec.isBasedOn === 'string' ? rec.isBasedOn : rec.isBasedOn?.['@id'] || rec.isBasedOn?.url || null };
}

// ---------------------------------------------------------------- normalize to the app's recipe shape
function usable(p) { return p && p.name && p.ingredients.length >= 2 && p.steps.length >= 1 && typeof p.nutrition.kcal === 'number'; }
function normalize(p, { id, sourceUrl, originalUrl, category }) {
  const nutrition = {};
  for (const k of NUTRIENT_KEYS) nutrition[k] = typeof p.nutrition[k] === 'number' ? p.nutrition[k] : null;
  const servings = parseYield(p.yieldText);
  const steps = p.steps, ingredients = p.ingredients.map(display => ({ display }));
  const stated = p.times.prep != null || p.times.cook != null || p.times.total != null;
  const est = estimateTimes(steps);
  let active_min, total_min;
  if (stated) {
    total_min = p.times.total ?? ((p.times.prep ?? 0) + (p.times.cook ?? 0));
    active_min = p.times.prep ?? Math.min(p.times.cook ?? total_min, 10);
    if (!(total_min > 0)) { total_min = est.total_min; active_min = est.active_min; }
    active_min = Math.min(active_min, total_min);
  } else { active_min = est.active_min; total_min = est.total_min; }
  const equipment = inferEquipment(steps);
  const cat = category || p.category || null;
  const rec = {
    id, name: p.name, source: SOURCE, source_url: sourceUrl, license: LICENSE,
    attribution: `USDA MyPlate Kitchen recipe, public domain. Source: ${sourceUrl}`,
    nutrition_source: NUTRITION_SOURCE, nutrition_per_serving: nutrition
  };
  if (nutrition.vitamin_d_iu != null) rec.conversion_note = 'vitamin D converted from mcg at 40 IU per mcg';
  Object.assign(rec, {
    meal: usdaMeal(cat, p.name), servings: servings ?? 4, active_min, total_min,
    skill: (steps.length >= 8 || total_min >= 75) ? 'comfortable' : 'beginner',
    equipment, assembly_only: equipment.length === 1 && equipment[0] === 'none' && !HEAT.test(steps.join(' ')),
    leftovers: inferLeftovers(p.name, cat ? [cat] : []), ingredients, steps, tags: [], cuisine: null,
    notes: p.notes ? { text: p.notes } : {}
  });
  if (!stated) rec.times_estimated = true;
  if (servings == null) rec.servings_estimated = true;
  if (p.yieldText) rec.yield_text = stripTags(p.yieldText);
  if (p.servingSize) rec.serving_size = stripTags(p.servingSize);
  if (cat) rec.category = cat;
  if (p.foodGroups.length) rec.food_groups = p.foodGroups;
  if (originalUrl) rec.original_url = originalUrl;
  return rec;
}

// ---------------------------------------------------------------- main
function serialize(list) { for (const r of list) r.meal = fixMeal(r); return '[\n' + list.map(r => JSON.stringify(r)).join(',\n') + '\n]\n'; }

async function main() {
  console.log(`USDA MyPlate Kitchen import (${MIRROR_ONLY ? 'mirror only' : 'Wayback preferred, mirror fallback'}${OFFLINE ? ', offline' : ''})`);
  // 1. discover
  const sm = await fetchPage(MIRROR + '/sitemap-recipes-en.xml');
  let slugs = [...sm.body.matchAll(/<loc>https:\/\/myplate\.food\/recipes\/([^<]+)<\/loc>/g)].map(m => decodeURIComponent(m[1]));
  if (!slugs.length) {
    const idx = await fetchPage(MIRROR + '/recipes');
    slugs = [...new Set([...idx.body.matchAll(/href="\/recipes\/([^"#?]+)"/g)].map(m => m[1]))];
  }
  slugs = [...new Set(slugs)].sort();
  console.log(`discovered ${slugs.length} recipe slugs (mirror sitemap)`);
  if (!slugs.length) { console.error('Neither the mirror sitemap nor its index page could be fetched through the proxy; nothing to import.'); process.exit(2); }
  if (LIMIT) slugs = slugs.slice(0, LIMIT);

  // 2. fetch + parse
  const out = [], counts = { mirror_pages_ok: 0, mirror_parsed: 0, wayback_ok: 0, wayback_parsed: 0, from_wayback: 0, from_mirror: 0, no_source: 0, kcal_out_of_range: 0, unusable: 0 };
  const detailLabels = new Map(), categories = new Map();
  let i = 0;
  for (const s of slugs) {
    i++;
    if (i % 50 === 0 || i === slugs.length) console.log(`  ${i}/${slugs.length} (${out.length} kept; fetched ${stats.fetched}, cached ${stats.cached}, backoffs ${stats.backoffs})`);
    const mirrorUrl = `${MIRROR}/recipes/${s}`;
    const mp = await fetchPage(mirrorUrl);
    const mirror = mp.status === 200 ? parseMirror(mp.body) : null;
    if (mp.status === 200) counts.mirror_pages_ok++;
    if (usable(mirror)) counts.mirror_parsed++;
    const originalUrl = (mirror?.isBasedOn || `https://www.myplate.gov/recipes/${s}`).replace(/^http:/, 'https:');
    let original = null, snapshotUrl = null;
    if (!MIRROR_ONLY) {
      const wp = await fetchPage(WAYBACK + originalUrl);
      if (wp.status === 200 && wp.body) {
        counts.wayback_ok++;
        original = parseOriginal(wp.body);
        snapshotUrl = wp.url.replace(/\/web\/(\d+)id_\//, '/web/$1/');
        if (usable(original)) counts.wayback_parsed++;
        else problem(`Wayback ${originalUrl}: unparseable or incomplete (${original ? `${original.ingredients.length} ingredients, ${original.steps.length} steps, kcal ${original.nutrition.kcal}` : 'no recipe markup'})`);
      }
    }
    let chosen, sourceUrl;
    if (usable(original)) { chosen = original; sourceUrl = snapshotUrl; counts.from_wayback++; }
    else if (usable(mirror)) { chosen = mirror; sourceUrl = mirrorUrl; counts.from_mirror++; }
    else { counts.no_source++; problem(`${s}: no usable copy (mirror HTTP ${mp.status}${mirror ? `, ${mirror.ingredients.length} ing/${mirror.steps.length} steps/kcal ${mirror.nutrition.kcal}` : ''})`); continue; }
    for (const l of chosen.detailLabels || []) detailLabels.set(l, (detailLabels.get(l) || 0) + 1);
    const cat = chosen.category || mirror?.category || null;
    if (cat) categories.set(cat, (categories.get(cat) || 0) + 1);
    const rec = normalize(chosen, { id: 'usda-' + slug(s), sourceUrl, originalUrl, category: cat });
    const n = rec.nutrition_per_serving;
    if (n.kcal < 20 || n.kcal > 1500) { counts.kcal_out_of_range++; problem(`${s}: kcal ${n.kcal} out of range; skipped`); continue; }
    if ((n.fat_g || 0) * 9 > n.kcal * 1.05 || (n.carb_g || 0) * 4 > n.kcal * 1.05 || (n.protein_g || 0) * 4 > n.kcal * 1.05) problem(`${s}: source nutrition inconsistent (kcal ${n.kcal}, fat ${n.fat_g} g, carb ${n.carb_g} g, protein ${n.protein_g} g); kept as published`);
    if (chosen === original && mirror && usable(mirror)) {
      // Sanity: the two copies should agree on the headline number.
      if (typeof mirror.nutrition.kcal === 'number' && Math.abs(mirror.nutrition.kcal - n.kcal) > 2) problem(`${s}: kcal differs between original (${n.kcal}) and mirror (${mirror.nutrition.kcal}); original kept`);
    }
    out.push(rec);
  }
  console.log(`fetch/parse: ${JSON.stringify(counts)}`);
  console.log(`original page detail labels seen: ${JSON.stringify([...detailLabels])}`);
  console.log(`categories: ${JSON.stringify([...categories].sort((a, b) => b[1] - a[1]))}`);

  // 3. dedupe by title, sort by id
  const byTitle = new Map(); let dupes = 0;
  for (const r of out.sort((a, b) => a.id < b.id ? -1 : 1)) {
    const k = r.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const prev = byTitle.get(k);
    if (!prev) { byTitle.set(k, r); continue; }
    const sameRecipe = prev.ingredients.length === r.ingredients.length && Math.abs(prev.nutrition_per_serving.kcal - r.nutrition_per_serving.kcal) < 0.5;
    if (KEEP_SAME_TITLE && !sameRecipe) { byTitle.set(k + ' #' + r.id, r); problem(`same title, distinct recipe: "${r.name}": ${prev.id} / ${r.id}; kept both (--keep-same-title)`); continue; }
    dupes++;
    // Keep the Wayback-sourced copy; otherwise the first id.
    const prevWb = /web\.archive\.org/.test(prev.source_url), curWb = /web\.archive\.org/.test(r.source_url);
    if (curWb && !prevWb) byTitle.set(k, r);
    problem(`duplicate title "${r.name}" (${sameRecipe ? 'same recipe' : 'distinct recipe'}): ${prev.id} / ${r.id}; kept ${byTitle.get(k).id}`);
  }
  const final = [...byTitle.values()].sort((a, b) => a.id < b.id ? -1 : 1);
  const ids = new Set(final.map(r => r.id));
  if (ids.size !== final.length) throw new Error('duplicate ids after dedupe');
  console.log(`after dedupe by title: ${final.length} recipes (${dupes} duplicate titles dropped)`);

  // 4. write
  const text = serialize(final);
  fs.writeFileSync(OUT, text);
  const bytes = Buffer.byteLength(text);
  const summary = {
    generated: new Date().toISOString().slice(0, 10), total: final.length, file_bytes: bytes,
    from_wayback: final.filter(r => /web\.archive\.org/.test(r.source_url)).length, from_mirror: final.filter(r => /myplate\.food/.test(r.source_url)).length,
    stated_times: final.filter(r => !r.times_estimated).length, estimated_times: final.filter(r => r.times_estimated).length,
    stated_servings: final.filter(r => !r.servings_estimated).length,
    with_food_groups: final.filter(r => r.food_groups).length, with_notes: final.filter(r => r.notes.text).length,
    full_nutrition: final.filter(r => NUTRIENT_KEYS.every(k => ['transfat_g', 'caffeine_mg', 'alcohol_g'].includes(k) || r.nutrition_per_serving[k] != null)).length,
    nutrient_coverage: Object.fromEntries(NUTRIENT_KEYS.map(k => [k, final.filter(r => r.nutrition_per_serving[k] != null).length])),
    counts, backoffs: stats.backoffs, problems: stats.problems
  };
  fs.writeFileSync(new URL('./last-run-report.json', CACHE), JSON.stringify(summary, null, 2));
  console.log(`wrote ${final.length} recipes (${(bytes / 1024 / 1024).toFixed(2)} MB) to data/recipes-usda.json`);
  console.log(`sources: ${summary.from_wayback} Wayback originals, ${summary.from_mirror} mirror; times: ${summary.stated_times} stated, ${summary.estimated_times} estimated; servings stated ${summary.stated_servings}; full nutrition (all USDA-listed keys) ${summary.full_nutrition}; food groups ${summary.with_food_groups}; notes ${summary.with_notes}; ${stats.problems.length} problems (see tools/usda-recipes/last-run-report.json)`);
}
await main();
