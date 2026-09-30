// Imports openly licensed recipes into data/recipes-open.json.
//
// Sources (no US federal content):
//   A. NHS website (nhs.uk) family recipes, Open Government Licence v3.0.
//   B. Wikibooks Cookbook, CC BY-SA 4.0, via the MediaWiki API (no HTML scraping).
//
// Every HTTP response is cached under tools/open-recipes/ so re-runs are offline.
// Requests are sequential, 400 ms apart, retried once. nhs.uk robots.txt is honoured.
//
// Usage: node tools/import-open-recipes.mjs [--nhs-only|--wb-only] [--budget-mb 4]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fixMeal } from './lib/meal-components.mjs';

const ROOT = new URL('../', import.meta.url);
const CACHE = new URL('./open-recipes/', import.meta.url);
const OUT = new URL('../data/recipes-open.json', import.meta.url);
fs.mkdirSync(CACHE, { recursive: true });

const args = process.argv.slice(2);
const flag = n => args.includes(n);
const budgetMb = Number((args[args.indexOf('--budget-mb') + 1]) || 0) || 4;
const BUDGET = budgetMb * 1024 * 1024;

const UA = 'PeaceMeal-recipe-import/1.0 (personal family app)';
const DELAY_MS = 400;
const WIKI_DELAY_MS = 1500;
const stats = { nhs: {}, wb: {}, problems: [], backoffs: 0 };
const problem = m => { stats.problems.push(m); console.error('  ! ' + m); };

// ---------------------------------------------------------------- fetching
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
  // Wikimedia's API limiter trips on bursts and answers 429 with Retry-After; honour it and space those calls further apart.
  const wikimedia = /wikibooks\.org/.test(url);
  const delay = wikimedia ? WIKI_DELAY_MS : DELAY_MS;
  const attempts = wikimedia ? 6 : 2;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const wait = lastFetch + delay - Date.now();
    if (wait > 0) await sleep(wait);
    lastFetch = Date.now();
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html,application/json;q=0.9,*/*;q=0.8' }, redirect: 'follow' });
      if (res.status === 429 || res.status >= 500) {
        const ra = Number(res.headers.get('retry-after')) || (res.status === 429 ? 30 : 2);
        if (attempt < attempts - 1) { stats.backoffs++; await sleep(ra * 1000 + 500); lastFetch = Date.now(); continue; }
        throw new Error('HTTP ' + res.status);
      }
      if (!res.ok) { fs.writeFileSync(cp, ''); problem(`HTTP ${res.status} for ${url}`); return ''; }
      const text = await res.text();
      fs.writeFileSync(cp, text);
      return text;
    } catch (e) {
      if (attempt === attempts - 1) { problem(`fetch failed for ${url.slice(0, 140)}: ${e.message}`); return ''; }
      await sleep(2000);
    }
  }
  return '';
}

// ---------------------------------------------------------------- shared helpers
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

// ---------------------------------------------------------------- A. NHS
const NHS = 'https://www.nhs.uk';
const NHS_ATTR = 'Contains public sector information licensed under the Open Government Licence v3.0';

function parseRobots(txt) {
  // Returns the Disallow list for User-agent: * (the group that applies to us).
  const groups = []; let cur = null;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim(); if (!line) continue;
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') { if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); }
    else if ((k === 'disallow' || k === 'allow') && cur) cur.rules.push({ allow: k === 'allow', path: v });
  }
  const g = groups.find(g => g.agents.some(a => a === 'peacemeal-recipe-import' || UA.toLowerCase().startsWith(a))) || groups.find(g => g.agents.includes('*'));
  return g ? g.rules : [];
}
function robotsAllows(rules, urlPath) {
  let best = null;
  for (const r of rules) {
    if (!r.path) continue;
    const re = new RegExp('^' + r.path.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*'));
    if (re.test(urlPath) || re.test(decodeURIComponent(urlPath))) { if (!best || r.path.length > best.path.length) best = r; }
  }
  return !best || best.allow;
}
function parseDuration(s) {
  if (!s) return null;
  let m = 0, hit = false;
  for (const h of s.matchAll(/(\d+(?:[.,]\d+)?|½)\s*(?:hours?|hrs?)\b/gi)) { m += (h[1] === '½' ? 0.5 : Number(h[1].replace(',', '.'))) * 60; hit = true; }
  for (const h of s.matchAll(/(\d+)\s*(?:mins?|minutes?)\b/gi)) { m += Number(h[1]); hit = true; }
  if (!hit) { const n = s.match(/(\d+)/); if (n) { m = Number(n[1]); hit = true; } }
  return hit ? Math.round(m) : null;
}
function nhsMeal(fromListings, name) {
  const meal = new Set();
  for (const l of fromListings) {
    if (l === 'breakfast') meal.add('breakfast');
    else if (l === 'lunch' || l === 'healthier-lunchboxes') meal.add('lunch');
    else if (l === 'dinner') meal.add('dinner');
    else if (l === 'puddings-and-snacks') meal.add('snack');
    else if (l === 'bbq-and-picnic') { meal.add('lunch'); meal.add('dinner'); }
  }
  const t = name.toLowerCase();
  if (!meal.size) {
    if (/\b(porridge|breakfast|overnight oats|pancake|muesli|granola|french toast|scrambled|eggs?\b|bagel|crumpet|smoothie|milkshake)/.test(t)) meal.add('breakfast');
    if (/\b(soup|sandwich|wrap|salad|pitta|pita|toast|jacket|bap|sarnie|lunch)/.test(t)) meal.add('lunch');
    if (/\b(curry|stew|pie|bake|casserole|bolognese|chilli|risotto|stir-fry|stir fry|pasta|rice|kebab|skewer|burger|meatball|koftas?|jalfrezi|korma|dhal|keema|pilau|jambalaya|roast|dinner)/.test(t)) meal.add('dinner');
    if (/\b(muffin|pudding|crumble|popcorn|ice cream|jelly|jellies|squares|cakes?|dip|fruit|banana|grill|milk pudding|snack)/.test(t)) meal.add('snack');
  }
  return meal.size ? [...meal] : ['lunch', 'dinner'];
}
function parseNhsRecipe(html, url, listings) {
  if (!/bh-recipe-instructions/.test(html)) return null;
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  if (!h1) return null;
  const name = stripTags(h1[1]).replace(/\s+recipe$/i, '').trim();
  const desc = html.match(/<div class="bh-recipe__description">([\s\S]*?)<\/div>/);
  const descText = desc ? stripTags(desc[1].replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n')) : '';
  const prep = parseDuration((descText.match(/Prep(?:aration)?\s*(?:time)?\s*:?\s*([^\n]*?)(?=Cook|Serves|Makes|$)/i) || [])[1]);
  const cook = parseDuration((descText.match(/Cook(?:ing)?\s*(?:time)?\s*:?\s*([^\n]*?)(?=Prep|Serves|Makes|$)/i) || [])[1]);
  const servesM = descText.match(/(?:Serves|Makes)\s*:?\s*(\d+)/i);
  const servings = servesM ? Number(servesM[1]) : null;

  const nutBlock = html.match(/Nutritional information[\s\S]*?<div class="nhsuk-details__text">([\s\S]*?)<\/details>/);
  const nut = nutBlock ? stripTags(nutBlock[1].replace(/<\/li>/gi, '; ')) : '';
  const num = re => { const m = nut.match(re); return m ? Number(m[1].replace(/,/g, '')) : null; };
  const kcal = num(/([\d,]+(?:\.\d+)?)\s*kcal/i);
  const salt_g = num(/([\d.]+)\s*g\s*salt/i);
  const nutrition = {
    kcal,
    protein_g: num(/([\d.]+)\s*g\s*protein/i),
    carb_g: num(/([\d.]+)\s*g\s*carbohydrate/i),
    sugar_g: num(/of which\s*([\d.]+)\s*g\s*sugars?/i),
    fat_g: num(/([\d.]+)\s*g\s*fat\b/i),
    satfat_g: num(/of which\s*([\d.]+)\s*g\s*saturates?/i),
    fiber_g: num(/([\d.]+)\s*g\s*fibre/i),
    sodium_mg: salt_g == null ? null : Math.round(salt_g * 400),
    salt_g
  };

  const ingCol = html.match(/<div class="nhsuk-grid-column-one-third">\s*([\s\S]*?)<\/div>\s*<div class="nhsuk-grid-column-two-thirds bh-recipe-instructions__method">/);
  const ingredients = ingCol ? [...ingCol[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map(m => stripTags(m[1])).filter(Boolean).map(display => ({ display })) : [];
  const methodBlock = html.match(/bh-recipe-instructions__method">([\s\S]*?)<\/ol>/);
  const steps = [];
  if (methodBlock) {
    for (const li of methodBlock[1].matchAll(/<li>([\s\S]*?)<\/li>/g)) {
      const body = li[1];
      const insets = [...body.matchAll(/<div class="nhsuk-inset-text">([\s\S]*?)<\/div>/g)].map(m => stripTags(m[1]).replace(/^Information:\s*/, ''));
      const main = stripTags(body.replace(/<div class="nhsuk-inset-text">[\s\S]*?<\/div>/g, ''));
      if (main) steps.push(insets.length ? `${main} (Tip: ${insets.join(' ')})` : main);
    }
  }
  const times = (prep != null || cook != null) ? { active_min: prep ?? Math.min(cook ?? 0, 10), total_min: (prep ?? 0) + (cook ?? 0) } : null;
  const est = estimateTimes(steps);
  const equipment = inferEquipment(steps);
  const rec = {
    id: 'nhs-' + slug(url.replace(/\/$/, '').split('/').pop()),
    name, source: 'NHS website', source_url: url,
    license: 'Open Government Licence v3.0', attribution: NHS_ATTR,
    nutrition_source: 'nhs-website', nutrition_per_serving: nutrition,
    conversion_note: 'sodium computed from salt at 400 mg per gram',
    meal: nhsMeal(listings, name), servings: servings ?? 4,
    active_min: times ? times.active_min : est.active_min, total_min: times ? times.total_min : est.total_min,
    skill: (steps.length >= 8 || (times ? times.total_min : est.total_min) >= 75) ? 'comfortable' : 'beginner',
    equipment, assembly_only: equipment.length === 1 && equipment[0] === 'none' && !HEAT.test(steps.join(' ')),
    leftovers: inferLeftovers(name), ingredients, steps, tags: [], cuisine: null, notes: {}
  };
  if (!times) rec.times_estimated = true;
  if (servings == null) rec.servings_estimated = true;
  return rec;
}
async function importNhs() {
  const out = [];
  const robots = parseRobots(await fetchText(NHS + '/robots.txt'));
  const recipesAllowed = robotsAllows(robots, '/healthier-families/recipes/');
  stats.nhs.robots = recipesAllowed ? 'allowed' : 'DISALLOWED';
  console.log(`NHS robots.txt: /healthier-families/recipes/ is ${stats.nhs.robots} for User-agent: *`);
  if (!recipesAllowed) { stats.nhs.skipped_by_robots = true; return out; }

  const queue = ['/healthier-families/recipes/'];
  const seen = new Set(queue), listings = new Map(), blocked = [];
  let fetched = 0, listingPages = 0;
  // Sitemap check for recipe URLs outside the index.
  const sm = await fetchText(NHS + '/sitemap.xml');
  const smUrls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  for (const u of smUrls) {
    if (/\/healthier-families\/recipes\//.test(u)) { const p = u.replace(NHS, ''); if (!seen.has(p)) { seen.add(p); queue.push(p); } }
  }
  const childMaps = smUrls.filter(u => /sitemap/.test(u) && /healthier|families|recipe|campaign|better-health|nhs\.uk\/sitemap-\d/i.test(u));
  for (const c of childMaps.slice(0, 10)) {
    const t = await fetchText(c);
    for (const m of t.matchAll(/<loc>([^<]+)<\/loc>/g)) if (/\/healthier-families\/recipes\//.test(m[1])) { const p = m[1].replace(NHS, ''); if (!seen.has(p)) { seen.add(p); queue.push(p); } }
  }
  const byUrl = new Map();
  while (queue.length) {
    const p = queue.shift();
    if (!robotsAllows(robots, p)) { blocked.push(p); continue; }
    const html = await fetchText(NHS + p); fetched++;
    if (!html) continue;
    const links = [...html.matchAll(/href="(\/healthier-families\/recipes\/[^"#?]+\/)"/g)].map(m => m[1]);
    const rec = parseNhsRecipe(html, NHS + p, []);
    if (rec) { byUrl.set(p, rec); }
    else {
      listingPages++;
      const key = p.replace(/\/$/, '').split('/').pop();
      for (const l of links) { if (!listings.has(l)) listings.set(l, new Set()); if (key !== 'recipes') listings.get(l).add(key); }
    }
    for (const l of links) if (!seen.has(l)) { seen.add(l); queue.push(l); }
  }
  for (const [p, rec] of byUrl) {
    rec.meal = nhsMeal([...(listings.get(p) || [])], rec.name);
    if (rec.ingredients.length < 3 || rec.steps.length < 2) { problem(`NHS ${p}: ${rec.ingredients.length} ingredients, ${rec.steps.length} steps; skipped`); continue; }
    if (rec.nutrition_per_serving.kcal == null) { problem(`NHS ${p}: no kcal; skipped`); continue; }
    if (rec.nutrition_per_serving.kcal < 20 || rec.nutrition_per_serving.kcal > 1500) { problem(`NHS ${p}: kcal ${rec.nutrition_per_serving.kcal} out of range; skipped`); continue; }
    const n = rec.nutrition_per_serving;
    if ((n.fat_g || 0) * 9 > n.kcal * 1.05 || (n.carb_g || 0) * 4 > n.kcal * 1.05 || (n.protein_g || 0) * 4 > n.kcal * 1.05) problem(`NHS ${p}: source nutrition inconsistent (kcal ${n.kcal}, fat ${n.fat_g} g, carb ${n.carb_g} g, protein ${n.protein_g} g); kept as published`);
    out.push(rec);
  }
  Object.assign(stats.nhs, { pages_fetched: fetched, listing_pages: listingPages, recipe_pages: byUrl.size, blocked_by_robots: blocked.length, imported: out.length,
    stated_times: out.filter(r => !r.times_estimated).length, estimated_times: out.filter(r => r.times_estimated).length });
  return out;
}

// ---------------------------------------------------------------- B. Wikibooks
const API = 'https://en.wikibooks.org/w/api.php';
const WB_LICENSE = 'CC BY-SA 4.0', WB_LICENSE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';
const wbPageUrl = title => 'https://en.wikibooks.org/wiki/' + encodeURIComponent(title.replace(/ /g, '_')).replace(/%3A/g, ':').replace(/%2F/g, '/').replace(/%28/g, '(').replace(/%29/g, ')').replace(/%2C/g, ',').replace(/%27/g, "'");

async function apiJson(params) {
  const url = API + '?' + new URLSearchParams({ format: 'json', formatversion: '2', ...params }).toString();
  const txt = await fetchText(url);
  try { return JSON.parse(txt); } catch { problem(`bad JSON from ${url.slice(0, 120)}`); return {}; }
}
async function categoryMembers(cat) {
  const titles = []; let cont = {};
  do {
    const j = await apiJson({ action: 'query', list: 'categorymembers', cmtitle: cat, cmnamespace: '102', cmlimit: '500', cmtype: 'page', ...cont });
    for (const m of (j.query?.categorymembers || [])) titles.push(m.title);
    cont = j.continue || null;
  } while (cont);
  return titles;
}
async function fetchPages(titles) {
  // prop=revisions (content) + categories for up to 50 titles, following category continuation.
  const pages = new Map(); let cont = {};
  do {
    const j = await apiJson({ action: 'query', prop: 'revisions|categories', rvprop: 'content', rvslots: 'main', cllimit: 'max', titles: titles.join('|'), ...cont });
    for (const p of (j.query?.pages || [])) {
      const cur = pages.get(p.title) || { title: p.title, text: '', categories: new Set(), missing: !!p.missing };
      if (p.revisions?.[0]?.slots?.main?.content) cur.text = p.revisions[0].slots.main.content;
      for (const c of p.categories || []) cur.categories.add(c.title.replace(/^Category:/, ''));
      pages.set(p.title, cur);
    }
    cont = j.continue || null;
  } while (cont);
  return pages;
}

// Wikitext cleaning ------------------------------------------------------
const FRACS = { '1/2': '½', '1/4': '¼', '3/4': '¾', '1/3': '⅓', '2/3': '⅔', '1/8': '⅛', '3/8': '⅜', '5/8': '⅝', '7/8': '⅞' };
function splitTemplateArgs(inner) {
  const parts = []; let depth = 0, cur = '';
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i], two = inner.slice(i, i + 2);
    if (two === '{{' || two === '[[') { depth++; cur += two; i++; continue; }
    if (two === '}}' || two === ']]') { depth--; cur += two; i++; continue; }
    if (ch === '|' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts;
}
function renderTemplate(name, argv) {
  const n = name.trim().toLowerCase().replace(/_/g, ' ');
  const pos = argv.filter(a => !/^\s*[a-z]+\s*=/i.test(a)).map(a => a.trim());
  const named = Object.fromEntries(argv.filter(a => /^\s*[a-z]+\s*=/i.test(a)).map(a => { const i = a.indexOf('='); return [a.slice(0, i).trim().toLowerCase(), a.slice(i + 1).trim()]; }));
  if (n === 'convert' || n === 'cvt') {
    const v = pos[0] || ''; let u = pos[1] || '';
    if (/^(to|-|–|and)$/.test(u)) { return `${v} ${u} ${pos[2] || ''} ${pos[3] || ''}`.trim(); }
    return `${v} ${u}`.trim();
  }
  if (n === 'frac' || n === 'fraction' || n === 'sfrac') {
    if (pos.length >= 3) return `${pos[0]} ${FRACS[pos[1] + '/' + pos[2]] || pos[1] + '/' + pos[2]}`;
    if (pos.length === 2) return FRACS[pos[0] + '/' + pos[1]] || `${pos[0]}/${pos[1]}`;
    if (pos.length === 1) return `1/${pos[0]}`;
    return '½';
  }
  if (n === 'nowrap' || n === 'nobr' || n === 'lang' || n === 'transl') return pos[pos.length - 1] || '';
  if (n === 'degf' || n === 'deg f') return `${pos[0] || ''}°F`;
  if (n === 'degc' || n === 'deg c') return `${pos[0] || ''}°C`;
  if (n === 'temp' || n === 'temperature') return pos.join(' ');
  if (n === '°' || n === 'deg') return '°';
  if (n === 'pinch') return 'pinch';
  if (n === 'tsp' || n === 'teaspoon') return (pos[0] ? pos[0] + ' ' : '') + 'tsp';
  if (n === 'tbsp' || n === 'tablespoon') return (pos[0] ? pos[0] + ' ' : '') + 'tbsp';
  if (n === 'cup' || n === 'cups') return (pos[0] ? pos[0] + ' ' : '') + 'cup';
  if (n === 'ingredient' || n === 'ing') return named.name || pos.join(' ');
  return '';
}
function expandTemplates(text) {
  // innermost-first replacement of {{...}}
  let guard = 0;
  while (/\{\{/.test(text) && guard++ < 50) {
    const before = text;
    text = text.replace(/\{\{([^{}]*)\}\}/g, (_, inner) => {
      const argv = splitTemplateArgs(inner);
      return renderTemplate(argv.shift() || '', argv);
    });
    if (text === before) break;
  }
  return text.replace(/\{\{[^]*?\}\}/g, '');
}
function cleanWiki(s) {
  let t = String(s);
  t = t.replace(/<!--[\s\S]*?-->/g, '');
  t = t.replace(/<ref[^>]*\/>/gi, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
  t = t.replace(/\[\[(?:File|Image|Media):[^\]]*(?:\[\[[^\]]*\]\][^\]]*)*\]\]/gi, '');
  t = expandTemplates(t);
  t = t.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2').replace(/\[\[([^\]]*)\]\]/g, (_, a) => a.replace(/^:?Cookbook:/i, '').replace(/^:?w:/i, ''));
  t = t.replace(/\[(?:https?|ftp):[^\s\]]+\s*([^\]]*)\]/g, '$1');
  t = t.replace(/'''''|'''|''/g, '');
  t = t.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '');
  t = decodeEntities(t);
  return t.replace(/\s+/g, ' ').trim();
}
function parseSummary(text) {
  const out = {};
  const re = /\{\{\s*(recipe ?summary|recipe)\s*(\||\}\})/gi; let m;
  while ((m = re.exec(text))) {
    if (m[2] === '}}') continue;
    let depth = 1, i = re.lastIndex, start = i;
    while (i < text.length && depth) { const two = text.slice(i, i + 2); if (two === '{{') { depth++; i += 2; } else if (two === '}}') { depth--; if (!depth) break; i += 2; } else i++; }
    for (const a of splitTemplateArgs(text.slice(start, i))) {
      const eq = a.indexOf('='); if (eq < 0) continue;
      const k = a.slice(0, eq).trim().toLowerCase(), v = cleanWiki(a.slice(eq + 1));
      if (v && out[k] == null) out[k] = v;
    }
  }
  return out;
}
function sections(text) {
  const out = []; const re = /^(={2,4})\s*(.+?)\s*\1\s*$/gm; let m, last = null;
  while ((m = re.exec(text))) { if (last) last.body = text.slice(last.end, m.index); last = { title: m[2].replace(/'''?|\[\[|\]\]/g, '').trim(), end: m.index + m[0].length }; out.push(last); }
  if (last) last.body = text.slice(last.end);
  return out;
}
function parseIngredientLines(body) {
  const items = [];
  const lines = body.split(/\r?\n/);
  let inTable = false, row = [];
  const flushRow = () => { if (row.length) { const cells = row.map(cleanWiki).filter(c => c && c !== '–' && c !== '-' && c !== '—'); if (cells.length && !/^ingredient$/i.test(cells[0])) { const [name, ...rest] = cells; items.push(rest.length ? `${rest.join(' / ')} ${name}`.trim() : name); } row = []; } };
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('{|')) { inTable = true; row = []; continue; }
    if (line.startsWith('|}')) { flushRow(); inTable = false; continue; }
    if (inTable) {
      if (line.startsWith('|-')) { flushRow(); continue; }
      if (line.startsWith('!')) { continue; }
      if (line.startsWith('|')) { for (const c of line.slice(1).split('||')) row.push(c.replace(/^\s*(?:[a-z-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s|]+)\s*)+\|(?=[^|])/i, '').trim()); }
      continue;
    }
    const m = line.match(/^(\*+|#+)\s*(.*)$/);
    if (m) { const t = cleanWiki(m[2]); if (t && !/^\s*(for the|to serve|garnish|optional)\s*:?\s*$/i.test(t)) items.push(t); }
  }
  return items.filter(x => x.length > 1 && x.length < 300);
}
function parseSteps(body) {
  const steps = [];
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    const m = line.match(/^(#+|\*+)\s*(.*)$/);
    if (!m) continue;
    const t = cleanWiki(m[2]);
    if (!t) continue;
    if (m[1].length > 1 && steps.length) steps[steps.length - 1] += ' ' + t; else steps.push(t);
  }
  return steps.filter(s => s.length > 2);
}
function parseServings(s) {
  if (!s) return null;
  const m = String(s).match(/(\d+)/); if (!m) return null;
  const n = Number(m[1]); return n >= 1 && n <= 200 ? n : null;
}
function parseWbTime(s) {
  if (!s) return null;
  const t = String(s).toLowerCase().replace(/½/g, '.5').replace(/¼/g, '.25').replace(/¾/g, '.75');
  let total = 0, hit = false;
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*(?:-|–|to)?\s*(\d+(?:\.\d+)?)?\s*(hours?|hrs?|h\b|minutes?|mins?|m\b|days?|overnight)/g)) {
    const v = Number(m[2] || m[1]); const u = m[3];
    total += /^h/.test(u) ? v * 60 : /^d/.test(u) ? v * 1440 : /overnight/.test(u) ? 480 : v; hit = true;
  }
  if (/overnight/.test(t) && !hit) { total = 480; hit = true; }
  if (!hit) { const m = t.match(/(\d+)/); if (m) { total = Number(m[1]); hit = true; } }
  return hit && total > 0 ? Math.min(Math.round(total), 7 * 1440) : null;
}
const ENGLISH = new Set('the a an and or to in with until add for of into over then it on mix stir cook heat from at is are be by this that as when about place put cut'.split(' '));
function looksEnglish(steps) {
  const toks = steps.join(' ').toLowerCase().split(/[^a-z]+/).filter(Boolean);
  if (toks.length < 8) return true;
  const hits = toks.filter(w => ENGLISH.has(w)).length;
  return hits / toks.length >= 0.12;
}
function wbMeal(cats, summary, title) {
  const c = cats.join(' | ').toLowerCase() + ' | ' + (summary.course || '') + ' | ' + (summary.category || '');
  const meal = new Set();
  if (/breakfast|brunch|porridge|pancake|waffle|cereal|granola|muesli/.test(c)) meal.add('breakfast');
  if (/lunch|soup|salad|sandwich|wrap|flatbread|dip recipes|spread/.test(c)) meal.add('lunch');
  if (/main course|main dish|dinner|entrée|entree|stew|curry|casserole|roast|pasta|rice recipes|pizza|meat recipes|poultry|seafood|fish recipes|noodle/.test(c)) meal.add('dinner');
  if (/dessert|snack|cookie|cake|candy|pudding|pie recipes|sweet|pastry|biscuit|bar recipes|muffin|ice cream|beverage|drink|smoothie|appetizer|appetiser|hors d|finger food|dip/.test(c)) meal.add('snack');
  if (/side dish|vegetable recipes|bread recipes|sauce|condiment/.test(c) && !meal.size) { meal.add('lunch'); meal.add('dinner'); }
  if (!meal.size) {
    const t = title.toLowerCase();
    if (/\b(cookie|cake|brownie|pudding|dessert|muffin|tart|fudge|ice cream|sorbet|candy|truffle|scone|bar)s?\b/.test(t)) meal.add('snack');
    if (/\b(soup|salad|sandwich)s?\b/.test(t)) meal.add('lunch');
    if (/\b(curry|stew|casserole|roast|lasagn|pasta|risotto|pie|stir-fry)\b/.test(t)) meal.add('dinner');
  }
  return meal.size ? [...meal] : ['lunch', 'dinner'];
}
function wbSkill(difficulty, stepCount) {
  const d = parseInt(String(difficulty || '').match(/\d/)?.[0] || '', 10);
  if (d >= 1 && d <= 5) return { skill: d <= 2 ? 'beginner' : d === 3 ? 'comfortable' : 'confident', estimated: false };
  return { skill: stepCount <= 6 ? 'beginner' : stepCount <= 12 ? 'comfortable' : 'confident', estimated: true };
}
const SKIP_CATS = /cocktail|alcoholic|liqueur|candy|confection|toffee|caramel recipes|fudge|brittle/i;
function parseWbRecipe(page, featuredSet) {
  const title = page.title.replace(/^Cookbook:/, '');
  const text = page.text || '';
  const cats = [...page.categories];
  const skip = why => ({ skip: why });
  if (page.missing || !text) return skip('missing');
  if (/\b(test|template|sandbox)\b/i.test(title)) return skip('title-filter');
  if (/\{\{\s*cookdp\s*\}\}|disambiguation/i.test(text)) return skip('disambiguation');
  if (/^#redirect/i.test(text.trim())) return skip('redirect');
  if (cats.some(c => SKIP_CATS.test(c)) || /\{\{\s*recipe ?summary[^}]*category\s*=\s*(cocktail|candy)/i.test(text)) return skip('cocktail-or-candy');
  const summary = parseSummary(text);
  const secs = sections(text);
  const ingSec = secs.find(s => /^ingredients?\b/i.test(s.title));
  const procSec = secs.find(s => /^(procedure|method|directions|instructions|preparation|steps|cooking)\b/i.test(s.title));
  if (!ingSec) return skip('no-ingredients');
  if (!procSec) return skip('no-procedure');
  // Ingredient subsections (=== For the sauce ===) belong to the ingredient list too.
  const ingIdx = secs.indexOf(ingSec);
  let ingBody = ingSec.body;
  for (let i = ingIdx + 1; i < secs.length && secs[i] !== procSec && !/^(procedure|method|directions|instructions|preparation|notes|see also)/i.test(secs[i].title); i++) ingBody += '\n' + secs[i].body;
  const ingredients = parseIngredientLines(ingBody).map(display => ({ display }));
  const procIdx = secs.indexOf(procSec);
  let procBody = procSec.body;
  for (let i = procIdx + 1; i < secs.length && !/^(notes|see also|tips|variations|warnings|references|serving|nutrition|gallery|external)/i.test(secs[i].title) && !/^ingredients?/i.test(secs[i].title); i++) procBody += '\n' + secs[i].body;
  const steps = parseSteps(procBody);
  if (ingredients.length < 3) return skip('few-ingredients');
  if (steps.length < 2) return skip('few-steps');
  if (!looksEnglish(steps)) return skip('non-english');
  const yieldOk = summary.yield && /^\s*(?:about|approx\.?|~)?\s*\d+\s*(?:-|–|to)?\s*\d*\s*(?:servings?|portions?|people|persons?|pieces?|cookies?|muffins?|rolls?|buns?|slices?|bars?|pancakes?|waffles?|crepes?|loaves|loaf|cakes?|patties|burgers?|tacos?|dumplings?|scones?|biscuits?|cupcakes?|balls?|wraps?|sandwiches?|tortillas?|squares?|bowls?|plates?|glasses|cups?)\b/i.test(summary.yield);
  const servings = parseServings(summary.servings || summary.serves || (yieldOk ? summary.yield : null));
  const total = parseWbTime(summary.time || summary.cooktime || summary.totaltime);
  const est = estimateTimes(steps);
  const { skill, estimated: skillEstimated } = wbSkill(summary.difficulty, steps.length);
  const equipment = inferEquipment(steps);
  const cuisineCat = cats.find(c => /^cuisine of /i.test(c) || /cuisine$/i.test(c));
  const cuisine = (summary.cuisine || (cuisineCat ? cuisineCat.replace(/^cuisine of /i, '').replace(/ cuisine$/i, '') : null) || summary.category || null) || null;
  const rec = {
    id: 'wb-' + slug(title), name: title, source: 'Wikibooks Cookbook', source_url: wbPageUrl(page.title),
    license: WB_LICENSE,
    attribution: `"${title}" from the Wikibooks Cookbook, ${wbPageUrl(page.title)}, licensed under CC BY-SA 4.0 (${WB_LICENSE_URL})`,
    meal: wbMeal(cats, summary, title), servings: servings ?? 4,
    active_min: total != null ? Math.min(total, est.active_min) : est.active_min, total_min: total ?? est.total_min,
    skill, equipment, assembly_only: equipment.length === 1 && equipment[0] === 'none' && !HEAT.test(steps.join(' ')),
    leftovers: inferLeftovers(title, cats), ingredients, steps, tags: [], cuisine, notes: {},
    // Category links kept: cuisine, course, diet, difficulty, and technique. Dropped to save space: the bare 'Recipes' category,
    // maintenance categories (with images, metric units, without servings, incomplete...), and per-ingredient 'Recipes using X'.
    wikibooks_categories: cats.filter(c => !/^(Recipes|Recipes using .*|Recipes with .*|Recipes without .*|Incomplete recipes|Recipes needing .*|Recipes missing .*|Pages .*|Featured recipe.*|Cookbook .*)$/i.test(c))
  };
  if (featuredSet.has(page.title)) rec.featured = true;
  if (total == null) rec.times_estimated = true;
  if (servings == null) rec.servings_estimated = true;
  if (skillEstimated) rec.skill_estimated = true;
  return rec;
}
async function importWikibooks() {
  const featured = new Set(await categoryMembers('Category:Featured recipes'));
  const titles = new Set(await categoryMembers('Category:Recipes'));
  for (const t of await categoryMembers('Category:Incomplete recipes')) titles.add(t);
  for (const t of featured) titles.add(t);
  const list = [...titles].filter(t => t.startsWith('Cookbook:') && !/^Cookbook:(Recipes|Table of Contents)/.test(t));
  stats.wb.listed = list.length; stats.wb.featured_listed = featured.size;
  console.log(`Wikibooks: ${list.length} candidate titles (${featured.size} featured)`);
  const out = []; const skips = {}; const ids = new Set();
  for (let i = 0; i < list.length; i += 50) {
    const batch = list.slice(i, i + 50);
    const pages = await fetchPages(batch);
    for (const t of batch) {
      const p = pages.get(t) || { title: t, missing: true, categories: new Set() };
      const r = parseWbRecipe(p, featured);
      if (r.skip) { skips[r.skip] = (skips[r.skip] || 0) + 1; continue; }
      while (ids.has(r.id)) r.id += '-2';
      ids.add(r.id); out.push(r);
    }
    if ((i / 50) % 10 === 0) console.log(`  wikibooks ${Math.min(i + 50, list.length)}/${list.length} fetched, ${out.length} usable`);
  }
  Object.assign(stats.wb, { skipped: skips, parsed: out.length, featured: out.filter(r => r.featured).length,
    stated_times: out.filter(r => !r.times_estimated).length, estimated_times: out.filter(r => r.times_estimated).length,
    stated_servings: out.filter(r => !r.servings_estimated).length, stated_difficulty: out.filter(r => !r.skill_estimated).length });
  return out;
}

// ---------------------------------------------------------------- output
function serialize(list) { for (const r of list) r.meal = fixMeal(r); return '[\n' + list.map(r => JSON.stringify(r)).join(',\n') + '\n]\n'; }
function trimToBudget(nhs, wb) {
  let all = [...nhs, ...wb];
  let size = Buffer.byteLength(serialize(all));
  if (size <= BUDGET) return { all, dropped: 0, size };
  // Drop Wikibooks recipes without a stated servings value first (longest step text first within that group), then the rest by step length.
  const stepLen = r => r.steps.join('').length;
  const rank = r => (r.featured ? 2 : 0) + (r.servings_estimated ? 0 : 1); // drop rank 0 (no stated servings) first, featured last
  const order = [...wb].sort((a, b) => rank(a) !== rank(b) ? rank(a) - rank(b) : stepLen(b) - stepLen(a));
  const drop = new Set(); let i = 0;
  while (size > BUDGET && i < order.length) { const r = order[i++]; drop.add(r.id); size -= Buffer.byteLength(JSON.stringify(r)) + 2; }
  all = all.filter(r => !drop.has(r.id));
  return { all, dropped: drop.size, size: Buffer.byteLength(serialize(all)) };
}

if (process.env.RECIPE_IMPORT_LIB) { globalThis.recipeImport = { parseNhsRecipe, parseWbRecipe, fetchPages, categoryMembers, cleanWiki, parseSummary, parseRobots, robotsAllows }; }
else await main();

async function main() {
const nhs = flag('--wb-only') ? [] : await importNhs();
console.log(`NHS: ${JSON.stringify(stats.nhs)}`);
const wb = flag('--nhs-only') ? [] : await importWikibooks();
console.log(`Wikibooks: ${JSON.stringify(stats.wb)}; rate-limit backoffs ${stats.backoffs}`);
const { all, dropped, size } = trimToBudget(nhs, wb);
stats.wb.dropped_for_size = dropped;
fs.writeFileSync(OUT, serialize(all));
const report = { backoffs: stats.backoffs, generated: new Date().toISOString().slice(0, 10), budget_mb: budgetMb, file_bytes: size, nhs: stats.nhs, wikibooks: stats.wb, total: all.length, problems: stats.problems };
fs.writeFileSync(new URL('./last-run-report.json', CACHE), JSON.stringify(report, null, 2));
console.log(`wrote ${all.length} recipes (${(size / 1024 / 1024).toFixed(2)} MB) to data/recipes-open.json; dropped ${dropped} for size; ${stats.problems.length} problems`);
}
