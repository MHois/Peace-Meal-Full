// Imports the NHLBI "Healthy Eating Recipes" (National Heart, Lung, and Blood Institute, National Institutes of Health)
// into data/recipes-open.json.
//
// Source: https://www.nhlbi.nih.gov/health/heart-healthy-living/healthy-foods/healthy-eating-recipes (54 recipes at import,
// 10 per listing page). Each page has an ingredients list, numbered directions, a "cooking facts" table (prep time, cook
// time, yields, serving size) and a "Nutritional Facts" table per serving: calories, total fat, saturated fat, cholesterol,
// sodium, fiber, protein, carbohydrates, potassium.
//
// Licence: works of the United States Government are not subject to copyright (17 U.S.C. section 105). NHLBI is a federal
// institute; its recipe text is public domain. The NIH web-policies page could not be fetched from the build environment
// (HTTP 403), so the statute is cited rather than the page. Text only; no photographs.
//
// Every HTTP response is cached under tools/open-recipes/. Requests are sequential, 400 ms apart. robots.txt is honoured.
//
// Usage: node tools/import-nhlbi.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fixMeal } from './lib/meal-components.mjs';

const CACHE = new URL('./open-recipes/', import.meta.url);
const OUT = new URL('../data/recipes-open.json', import.meta.url);
fs.mkdirSync(CACHE, { recursive: true });

const SITE = 'https://www.nhlbi.nih.gov';
const LIST = '/health/heart-healthy-living/healthy-foods/healthy-eating-recipes';
const SOURCE = 'NHLBI (NIH)';
const LICENSE = 'Public domain (United States Government work, 17 U.S.C. section 105)';
const ATTR = 'Recipe from the National Heart, Lung, and Blood Institute (NHLBI), National Institutes of Health, nhlbi.nih.gov. Public domain as a work of the United States Government.';
const UA = 'PeaceMeal-recipe-import/1.0 (personal family app)';
const DELAY_MS = 400;
const stats = { pages_fetched: 0, listing_pages: 0, recipe_pages: 0, imported: 0, skipped: [], problems: [] };
const problem = m => { stats.problems.push(m); console.error('  ! ' + m); };

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
  if (/\b(pan|saucepan|frying|fry|fried|boil|boiling|simmer|simmering|stove|stovetop|skillet|wok|sauté|saute|sauteed|sautéed|griddle|pot\b|burner|heat the oil|medium heat|high heat|low heat|deep-fry|deep fry|poach|steam)/.test(t)) eq.add('stove');
  if (/\bmicrowave/.test(t)) eq.add('microwave');
  if (/\b(blender|blend|food processor|liquidi[sz]e|purée in|puree in|immersion|stick blender)\b/.test(t)) eq.add('blender');
  if (/\b(slow cooker|slow-cooker|crock ?pot)\b/.test(t)) eq.add('slow-cooker');
  if (/\b(pressure cooker|pressure-cooker|instant pot)\b/.test(t)) eq.add('pressure-cooker');
  if (/\b(air fryer|air-fryer|airfryer)\b/.test(t)) eq.add('air-fryer');
  return eq.size ? [...eq] : ['none'];
}
function inferLeftovers(name) {
  const t = name.toLowerCase();
  if (/\b(salad|sandwich|wrap|toast|pancake|smoothie|milkshake|omelette|omelet|scrambled|fritter|fried egg|poached egg|shake|juice|drink|beverage|ice cream|sorbet)/.test(t)) return 'poor';
  if (/\b(soup|curry|stew|chilli|chili|casserole|bolognese|dhal|dal|bake|pie|lasagn|ragu|braise|jollof|risotto|cobbler|meatball|tagine|goulash|pilaf|jambalaya|bean|lentil|chickpea|pulled|roast|loaf|muffin|bread|cake|cookie|biscuit|granola|creole|gumbo)/.test(t)) return 'good';
  return 'ok';
}
const HEAT = /\b(cook|heat|bake|fry|boil|simmer|roast|grill|toast|microwave|oven|saut|steam|poach|preheat|griddle|sear|warm through|melt|broil)/i;
function parseDuration(s) {
  if (!s) return null;
  let m = 0, hit = false;
  for (const h of s.matchAll(/(\d+(?:[.,]\d+)?|½)\s*(?:hours?|hrs?)\b/gi)) { m += (h[1] === '½' ? 0.5 : Number(h[1].replace(',', '.'))) * 60; hit = true; }
  for (const h of s.matchAll(/(\d+)\s*(?:mins?|minutes?)\b/gi)) { m += Number(h[1]); hit = true; }
  if (!hit) { const n = s.match(/(\d+)/); if (n) { m = Number(n[1]); hit = true; } }
  return hit ? Math.round(m) : null;
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
// The site has no meal category; the title decides. American dishes, so the vocabulary is American.
function nhlbiMeal(name) {
  const t = name.toLowerCase();
  const meal = new Set();
  if (/\b(pancake|oatmeal|breakfast|granola|french toast|scrambled|frittata|omelet|muffin|coffee cake|smoothie|waffle|parfait)\b/.test(t)) meal.add('breakfast');
  if (/\b(soup|sandwich|wrap|salad|chowder|gumbo|slaw|quesadilla|taco)\b/.test(t)) meal.add('lunch');
  if (/\b(chicken|beef|pork|turkey|fish|salmon|tuna|shrimp|tilapia|cod|catfish|creole|stew|chili|casserole|stir-fry|stir fry|pasta|spaghetti|lasagna|rice|beans|meatloaf|meatballs|jambalaya|curry|roast|kebab|enchilada|burrito|pizza|baked|grilled|broiled|pot pie|gumbo|paella|risotto|lentil)\b/.test(t)) meal.add('dinner');
  if (/\b(cake|cookies?|crisp|cobbler|pudding|bars?|dip|fruit|sorbet|popcorn|snack|bites?|mousse|brownies?|dessert|shake|sicles?|custard|compote)\b/.test(t) && !/\bcrab cakes?\b|\bsalmon cakes?\b|\bfish cakes?\b/.test(t)) { meal.add('snack'); if (/\b(shake|sicles?|fruit salad|compote|custard)\b/.test(t)) { meal.delete('lunch'); meal.delete('dinner'); } }
  if (/\b(green beans|asparagus|vegetables?|veggie|potatoes|fries|corn|carrots|squash|broccoli|spinach|greens|coleslaw|cornbread|rolls?)\b/.test(t) && meal.size === 0) { meal.add('lunch'); meal.add('dinner'); }
  return meal.size ? [...meal] : ['lunch', 'dinner'];
}

function parseRecipe(html, url, summary) {
  const og = html.match(/property="og:title" content="([^"]*)"/);
  const name = og ? decodeEntities(og[1]).trim() : null;
  if (!name) return null;
  const body = html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '').replace(/<script[^>]*>[\s\S]*?<\/script>/g, '');
  const ingBlock = body.match(/<h2>\s*Ingredients\s*<\/h2>\s*<ul>([\s\S]*?)<\/ul>/i);
  const ingredients = ingBlock ? [...ingBlock[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map(m => stripTags(m[1])).filter(Boolean).map(display => ({ display })) : [];
  const dirBlock = body.match(/<h2>\s*Directions\s*<\/h2>\s*<ol>([\s\S]*?)<\/ol>/i);
  const steps = dirBlock ? [...dirBlock[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map(m => stripTags(m[1])).filter(Boolean) : [];
  const facts = {};
  const factsTable = body.match(/<table class="cooking-facts">([\s\S]*?)<\/table>/);
  if (factsTable) for (const r of factsTable[1].matchAll(/<th>(.*?)<\/th>\s*<td>\s*<div[^>]*>([\s\S]*?)<\/div>/g)) facts[stripTags(r[1]).toLowerCase()] = stripTags(r[2]);
  const nut = {};
  const nutTable = body.match(/Nutritional Facts[\s\S]*?<tbody>([\s\S]*?)<\/table>/);
  if (nutTable) for (const r of nutTable[1].matchAll(/<th>(.*?)<\/th>\s*<td>\s*<div[^>]*>([\s\S]*?)<\/div>/g)) nut[stripTags(r[1]).toLowerCase()] = stripTags(r[2]);
  const num = s => { if (s == null) return null; const m = String(s).match(/-?[\d,]+(?:\.\d+)?/); return m ? Number(m[0].replace(/,/g, '')) : null; };
  const nutrition = {
    kcal: num(nut['calories']), fat_g: num(nut['total fat']), satfat_g: num(nut['saturated fat']), cholesterol_mg: num(nut['cholesterol']),
    sodium_mg: num(nut['sodium']), fiber_g: num(nut['total fiber']), protein_g: num(nut['protein']), carb_g: num(nut['carbohydrates']), potassium_mg: num(nut['potassium'])
  };
  for (const k of Object.keys(nutrition)) if (nutrition[k] == null) delete nutrition[k];
  const prep = parseDuration(facts['prep time']), cook = parseDuration(facts['cook time']);
  const servings = num(facts['yields']);
  const times = (prep != null || cook != null) ? { active_min: prep ?? Math.min(cook ?? 0, 10), total_min: (prep ?? 0) + (cook ?? 0) } : null;
  const equipment = inferEquipment(steps);
  const rec = {
    id: 'nhlbi-' + slug(url.replace(/\/$/, '').split('/').pop()),
    name, source: SOURCE, source_url: url,
    license: LICENSE, attribution: ATTR,
    nutrition_source: 'nhlbi', nutrition_per_serving: nutrition,
    serving_size_text: facts['serving size'] || null,
    summary: summary || null,
    meal: nhlbiMeal(name), servings: servings ?? 4,
    active_min: times ? times.active_min : Math.max(5, steps.length * 3), total_min: times ? times.total_min : Math.max(10, steps.length * 5),
    skill: (steps.length >= 8 || (times ? times.total_min : 0) >= 75) ? 'comfortable' : 'beginner',
    equipment, assembly_only: equipment.length === 1 && equipment[0] === 'none' && !HEAT.test(steps.join(' ')),
    leftovers: inferLeftovers(name), ingredients, steps, tags: [], cuisine: null, notes: {}
  };
  if (!times) rec.times_estimated = true;
  if (servings == null) rec.servings_estimated = true;
  return rec;
}

const robots = parseRobots(await fetchText(SITE + '/robots.txt'));
if (!robotsAllows(robots, LIST)) { console.error('nhlbi.nih.gov robots.txt disallows the recipe listing for User-agent: *; nothing imported'); process.exit(1); }
console.log('nhlbi.nih.gov robots.txt: recipe pages allowed for User-agent: *');
const links = new Map(); // path -> summary
for (let page = 0; page < 20; page++) {
  const html = await fetchText(`${SITE}${LIST}?page=${page}`);
  if (!html) break;
  stats.listing_pages++;
  let found = 0;
  for (const m of html.matchAll(/<a href="(\/health\/heart-healthy-living\/healthy-foods\/healthy-eating-recipes\/[^"]+)"[^>]*>[\s\S]*?<\/a>[\s\S]*?views-field-body"><span class="field-content">([\s\S]*?)<\/span>/g)) {
    if (!links.has(m[1])) { links.set(m[1], stripTags(m[2])); found++; }
  }
  for (const m of html.matchAll(/href="(\/health\/heart-healthy-living\/healthy-foods\/healthy-eating-recipes\/[^"#?]+)"/g)) if (!links.has(m[1])) { links.set(m[1], ''); found++; }
  if (!found) break;
}
console.log(`${links.size} recipe links across ${stats.listing_pages} listing pages`);
const out = [];
for (const [p, summary] of [...links.entries()].sort()) {
  if (!robotsAllows(robots, p)) { stats.skipped.push(p + ' (robots)'); continue; }
  const html = await fetchText(SITE + p);
  if (!html) continue;
  stats.recipe_pages++;
  const rec = parseRecipe(html, SITE + p, summary);
  if (!rec) { stats.skipped.push(p + ' (no title)'); continue; }
  if (!rec.ingredients.length || !rec.steps.length) { stats.skipped.push(p + ' (no ingredients or directions)'); continue; }
  const k = rec.nutrition_per_serving.kcal;
  if (typeof k !== 'number') { stats.skipped.push(p + ' (no calories)'); continue; }
  if (k < 20 || k > 1500) { stats.skipped.push(p + ` (kcal ${k} out of range)`); continue; }
  out.push(rec);
}
stats.imported = out.length;
const existing = JSON.parse(fs.readFileSync(OUT, 'utf8')).filter(r => r.source !== SOURCE);
const all = existing.concat(out);
for (const r of all) r.meal = fixMeal(r);
fs.writeFileSync(OUT, '[\n' + all.map(r => JSON.stringify(r)).join(',\n') + '\n]\n');
fs.writeFileSync(new URL('./nhlbi-last-run.json', CACHE), JSON.stringify({ when: new Date().toISOString(), ...stats }, null, 2));
console.log(`imported ${out.length} NHLBI recipes (${stats.skipped.length} skipped, ${stats.problems.length} problems); recipes-open.json now holds ${all.length} recipes`);
if (stats.skipped.length) console.log('skipped:', stats.skipped.join('; '));
