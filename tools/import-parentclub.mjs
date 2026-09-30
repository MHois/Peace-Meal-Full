// Imports the Parent Club (Scottish Government) family recipes into data/recipes-open.json.
//
// Source: https://www.parentclub.scot/recipes (198 recipes at import). Each page carries schema.org microdata
// (name, prepTime, cookTime, recipeYield, recipeCategory, recipeIngredient) and a "Detailed nutritional
// information" table with per-100 g and per-serving values, including sodium in mg and salt in g.
//
// Licence: the site says it "is run by the Scottish Government" and links to gov.scot, whose content is published
// under the Open Government Licence v3.0 ("All content is available under the Open Government Licence v3.0, except
// for graphic assets and where otherwise stated"). parentclub.scot itself carries no licence statement of its own.
// Every record therefore stores license: "Crown copyright (Scottish Government); no licence statement on
// parentclub.scot, OGL v3.0 assumed as for gov.scot" so the gap is visible, not hidden. Text only; no photos.
//
// Every HTTP response is cached under tools/open-recipes/ so re-runs are offline. Requests are sequential,
// 400 ms apart. robots.txt is fetched first and honoured.
//
// Usage: node tools/import-parentclub.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fixMeal } from './lib/meal-components.mjs';

const CACHE = new URL('./open-recipes/', import.meta.url);
const OUT = new URL('../data/recipes-open.json', import.meta.url);
fs.mkdirSync(CACHE, { recursive: true });

const SITE = 'https://www.parentclub.scot';
const SOURCE = 'Parent Club Scotland';
const LICENSE = 'Crown copyright (Scottish Government); no licence statement on parentclub.scot, OGL v3.0 assumed as for gov.scot';
const ATTR = 'Recipe text from Parent Club (parentclub.scot), a Scottish Government website. Crown copyright. Used on the assumption that the Open Government Licence v3.0 applies as it does to gov.scot; parentclub.scot carries no licence statement of its own.';
const UA = 'PeaceMeal-recipe-import/1.0 (personal family app)';
const DELAY_MS = 400;
const stats = { pages_fetched: 0, recipe_pages: 0, imported: 0, skipped: [], problems: [], categories: {} };
const problem = m => { stats.problems.push(m); console.error('  ! ' + m); };

// ---------------------------------------------------------------- fetching (same shape as import-open-recipes.mjs)
let lastFetch = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function cachePath(url) {
  const h = crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
  const tail = url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '_').slice(0, 60);
  return new URL(`./${tail}_${h}.txt`, CACHE);
}
async function fetchText(url) {
  const cp = cachePath(url);
  if (fs.existsSync(cp)) return fs.readFileSync(cp, 'utf8');
  for (let attempt = 0; attempt < 2; attempt++) {
    const wait = lastFetch + DELAY_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastFetch = Date.now();
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html;q=0.9,*/*;q=0.8' }, redirect: 'follow' });
      if (res.status === 429 || res.status >= 500) {
        const ra = Number(res.headers.get('retry-after')) || (res.status === 429 ? 30 : 2);
        if (attempt < 1) { await sleep(ra * 1000 + 500); lastFetch = Date.now(); continue; }
        throw new Error('HTTP ' + res.status);
      }
      if (!res.ok) { fs.writeFileSync(cp, ''); problem(`HTTP ${res.status} for ${url}`); return ''; }
      const text = await res.text();
      fs.writeFileSync(cp, text);
      stats.pages_fetched++;
      return text;
    } catch (e) {
      if (attempt === 1) { problem(`fetch failed for ${url.slice(0, 140)}: ${e.message}`); return ''; }
      await sleep(2000);
    }
  }
  return '';
}

// ---------------------------------------------------------------- helpers
const decodeEntities = s => String(s)
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&deg;/g, '°').replace(/&frac12;/g, '½').replace(/&frac14;/g, '¼').replace(/&frac34;/g, '¾').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—');
const stripTags = s => decodeEntities(String(s).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const slug = s => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);

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
function inferLeftovers(name) {
  const t = name.toLowerCase();
  if (/\b(salad|sandwich|wrap|toast|pancake|smoothie|milkshake|omelette|omelet|scrambled|bap|pitta|pita|crumpet|bagel|fritter|fried egg|poached egg|toastie|shake|juice|drink|beverage|ice cream|sorbet)/.test(t)) return 'poor';
  if (/\b(soup|curry|stew|chilli|chili|casserole|bolognese|dhal|dal|daal|bake|pie|lasagn|ragu|ragù|braise|jollof|rice and peas|risotto|cobbler|meatball|kofta|tagine|goulash|hotpot|cottage|shepherd|pilau|pilaf|biryani|jambalaya|bean|lentil|chickpea|pulled|roast|loaf|muffin|bread|cake|cookie|biscuit|granola|jam|chutney|sauce|pickle)/.test(t)) return 'good';
  return 'ok';
}
const HEAT = /\b(cook|heat|bake|fry|boil|simmer|roast|grill|toast|microwave|oven|saut|steam|poach|preheat|griddle|sear|warm through|melt)/i;
function estimateTimes(steps) {
  const t = steps.join(' ');
  let total = Math.max(5, steps.length * 4);
  const mins = [...t.matchAll(/(\d+)\s*(?:to|-|–)?\s*(\d+)?\s*(?:min|minute)s?\b/gi)].map(m => Number(m[2] || m[1]));
  const stated = mins.reduce((a, b) => a + b, 0);
  total = Math.min(Math.max(total, Math.round(stated + steps.length * 2)), 24 * 60);
  return { active_min: Math.min(total, Math.max(5, steps.length * 3)), total_min: total };
}
function parseRobots(txt) {
  const groups = []; let cur = null;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim(); if (!line) continue;
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') { if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); }
    else if ((k === 'disallow' || k === 'allow') && cur) cur.rules.push({ allow: k === 'allow', path: v });
  }
  const g = groups.find(g => g.agents.some(a => UA.toLowerCase().startsWith(a))) || groups.find(g => g.agents.includes('*'));
  return g ? g.rules : [];
}
function robotsAllows(rules, urlPath) {
  let best = null;
  for (const r of rules) {
    if (!r.path) continue;
    const re = new RegExp('^' + r.path.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*'));
    if (re.test(urlPath)) { if (!best || r.path.length > best.path.length) best = r; }
  }
  return !best || best.allow;
}
// ISO 8601 duration (PT1H10M) to minutes
function isoMinutes(s) {
  const m = String(s || '').match(/^PT(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m || (!m[1] && !m[2])) return null;
  return Number(m[1] || 0) * 60 + Number(m[2] || 0);
}
const meta = (html, prop) => { const m = html.match(new RegExp(`<meta itemprop="${prop}" content="([^"]*)"`, 'i')); return m ? decodeEntities(m[1]).trim() : ''; };

// Meal slots from the site's category plus the title. Sides and sauces end up wherever fixMeal puts them.
function pcMeal(category, name) {
  const c = (category || '').toLowerCase(), t = name.toLowerCase();
  const meal = new Set();
  if (/breakfast/.test(c)) meal.add('breakfast');
  if (/lunch/.test(c)) meal.add('lunch');
  if (/dinner|main/.test(c)) meal.add('dinner');
  if (/starter|soup|side/.test(c)) meal.add('lunch');
  if (/snack|dessert|pudding|baking|cake|treat|drink/.test(c)) meal.add('snack');
  if (!meal.size) {
    if (/\b(porridge|breakfast|overnight oats|pancake|muesli|granola|french toast|scrambled|eggs?\b|bagel|crumpet|smoothie|milkshake)/.test(t)) meal.add('breakfast');
    if (/\b(soup|sandwich|wrap|salad|pitta|pita|toast|jacket|baked potato|bap|sarnie|lunch)/.test(t)) meal.add('lunch');
    if (/\b(curry|stew|pie|bake|casserole|bolognese|chilli|risotto|stir-fry|stir fry|pasta|rice|kebab|skewer|burger|meatball|koftas?|jalfrezi|korma|dhal|keema|pilau|jambalaya|roast|dinner|stovies|mince)/.test(t)) meal.add('dinner');
    if (/\b(muffin|pudding|crumble|popcorn|ice cream|jelly|jellies|squares|cakes?|cookies?|flapjack|dip|fruit|banana|snack|scones?|biscuits?|traybake|brownies?)/.test(t)) meal.add('snack');
  }
  return meal.size ? [...meal] : ['lunch', 'dinner'];
}

// ---------------------------------------------------------------- parsing
function parseRecipe(html, url) {
  const h1 = html.match(/<h1[^>]*itemprop="name"[^>]*>([\s\S]*?)<\/h1>/);
  if (!h1) return null;
  const name = stripTags(h1[1]);
  const prep = isoMinutes(meta(html, 'prepTime')), cook = isoMinutes(meta(html, 'cookTime'));
  const yieldText = meta(html, 'recipeYield');
  const servesM = yieldText.match(/(\d+)/);
  const servings = servesM ? Number(servesM[1]) : null;
  const category = meta(html, 'recipeCategory');
  stats.categories[category || '(none)'] = (stats.categories[category || '(none)'] || 0) + 1;

  const ingredients = [...html.matchAll(/<li itemprop="recipeIngredient">([\s\S]*?)<\/li>/g)].map(m => stripTags(m[1])).filter(Boolean).map(display => ({ display }));
  const methodBlock = html.match(/<h2>\s*Method\s*<\/h2>[\s\S]*?<ol>([\s\S]*?)<\/ol>/i);
  const steps = methodBlock ? [...methodBlock[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map(m => stripTags(m[1])).filter(Boolean) : [];

  // Detailed table: rows of <td>label</td><td>per 100 g</td><td>per serving</td>. Blank cells stay null.
  const table = html.match(/<table class="detailed-nutritional-table[^"]*">([\s\S]*?)<\/table>/);
  const rows = {};
  let servingGrams = null;
  if (table) {
    const head = table[1].match(/Per\s+([\d.]+)\s*g\s+serving/i); if (head) servingGrams = Number(head[1]);
    for (const tr of table[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      const cells = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => stripTags(m[1]));
      if (cells.length < 3) continue;
      const v = cells[2].match(/([\d,]+(?:\.\d+)?)/);
      rows[cells[0].toLowerCase()] = v ? Number(v[1].replace(/,/g, '')) : null;
    }
  }
  const pick = (...labels) => { for (const l of labels) if (l in rows) return rows[l]; return null; };
  let nutrition = {
    kcal: pick('energy kcals', 'energy kcal', 'energy'),
    protein_g: pick('protein'),
    fat_g: pick('total fat', 'fat'),
    satfat_g: pick('saturated fat', 'saturates'),
    carb_g: pick('carbohydrates', 'carbohydrate'),
    sugar_g: pick('total sugars', 'sugars', 'sugar'),
    fiber_g: pick('nsp fibre', 'fibre', 'aoac fibre'),
    sodium_mg: pick('sodium'),
    salt_g: pick('salt')
  };
  // Fall back to the summary grid when the table is missing. Its calories and salt metas are reliable; its fat metas are not
  // (on some pages "saturated fat" carries the carbohydrate figure), so only kcal and salt are taken from it.
  if (nutrition.kcal == null) {
    const kc = meta(html, 'calories').match(/([\d,]+(?:\.\d+)?)/); if (kc) nutrition.kcal = Number(kc[1].replace(/,/g, ''));
    const sa = meta(html, 'sodiumContent').match(/([\d.]+)\s*grams? salt/i); if (sa && nutrition.salt_g == null) nutrition.salt_g = Number(sa[1]);
    if (nutrition.sodium_mg == null && nutrition.salt_g != null) { nutrition.sodium_mg = Math.round(nutrition.salt_g * 400); nutrition.sodium_from_salt = true; }
  }
  if (nutrition.sodium_mg != null && nutrition.salt_g != null && nutrition.salt_g > 0) {
    const ratio = nutrition.sodium_mg / (nutrition.salt_g * 400);
    if (ratio < 0.8 || ratio > 1.25) problem(`${url}: sodium ${nutrition.sodium_mg} mg and salt ${nutrition.salt_g} g disagree; published sodium kept`);
  }
  for (const k of Object.keys(nutrition)) if (nutrition[k] == null) delete nutrition[k];

  const times = (prep != null || cook != null) ? { active_min: prep ?? Math.min(cook ?? 0, 10), total_min: (prep ?? 0) + (cook ?? 0) } : null;
  const est = estimateTimes(steps);
  const equipment = inferEquipment(steps);
  const rec = {
    id: 'pcs-' + slug(url.replace(/\/$/, '').split('/').pop()),
    name, source: SOURCE, source_url: url,
    license: LICENSE, attribution: ATTR,
    nutrition_source: 'parentclub-scot', nutrition_per_serving: nutrition,
    serving_grams: servingGrams,
    site_category: category || null,
    meal: pcMeal(category, name), servings: servings ?? 4,
    active_min: times ? times.active_min : est.active_min, total_min: times ? times.total_min : est.total_min,
    skill: (steps.length >= 8 || (times ? times.total_min : est.total_min) >= 75) ? 'comfortable' : 'beginner',
    equipment, assembly_only: equipment.length === 1 && equipment[0] === 'none' && !HEAT.test(steps.join(' ')),
    leftovers: inferLeftovers(name), ingredients, steps, tags: [], cuisine: null, notes: {}
  };
  if (!times) rec.times_estimated = true;
  if (servings == null) rec.servings_estimated = true;
  if (nutrition.sodium_from_salt) { delete rec.nutrition_per_serving.sodium_from_salt; rec.conversion_note = 'sodium computed from salt at 400 mg per gram'; }
  return rec;
}

// ---------------------------------------------------------------- main
const robots = parseRobots(await fetchText(SITE + '/robots.txt'));
if (!robotsAllows(robots, '/recipe/') || !robotsAllows(robots, '/recipes')) { console.error('parentclub.scot robots.txt disallows the recipe pages for User-agent: *; nothing imported'); process.exit(1); }
console.log('parentclub.scot robots.txt: /recipes and /recipe/ allowed for User-agent: *');
const listing = await fetchText(SITE + '/recipes');
const paths = [...new Set([...listing.matchAll(/href="(\/recipe\/[^"#?]+)"/g)].map(m => m[1]))].sort();
console.log(`${paths.length} recipe links on the listing`);
const out = [];
for (const p of paths) {
  if (!robotsAllows(robots, p)) { stats.skipped.push(p + ' (robots)'); continue; }
  const html = await fetchText(SITE + p);
  if (!html) continue;
  stats.recipe_pages++;
  const rec = parseRecipe(html, SITE + p);
  if (!rec) { stats.skipped.push(p + ' (no recipe markup)'); continue; }
  if (!rec.ingredients.length || !rec.steps.length) { stats.skipped.push(p + ' (no ingredients or method)'); continue; }
  const k = rec.nutrition_per_serving.kcal;
  if (typeof k !== 'number') { stats.skipped.push(p + ' (no kcal)'); continue; }
  if (k < 20 || k > 1500) { stats.skipped.push(p + ` (kcal ${k} out of range)`); continue; }
  out.push(rec);
}
stats.imported = out.length;

// Merge into data/recipes-open.json: drop any earlier Parent Club records, append these, keep the one-line-per-recipe format.
const existing = JSON.parse(fs.readFileSync(OUT, 'utf8')).filter(r => r.source !== SOURCE);
const all = existing.concat(out);
for (const r of all) r.meal = fixMeal(r);
fs.writeFileSync(OUT, '[\n' + all.map(r => JSON.stringify(r)).join(',\n') + '\n]\n');
fs.writeFileSync(new URL('./parentclub-last-run.json', CACHE), JSON.stringify({ when: new Date().toISOString(), ...stats }, null, 2));
console.log(`imported ${out.length} Parent Club recipes (${stats.skipped.length} skipped, ${stats.problems.length} problems); recipes-open.json now holds ${all.length} recipes`);
console.log('site categories:', JSON.stringify(stats.categories));
if (stats.skipped.length) console.log('skipped:', stats.skipped.join('; '));
