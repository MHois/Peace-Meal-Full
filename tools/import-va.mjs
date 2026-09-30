// Imports the VA Healthy Teaching Kitchen recipes (Nutrition and Food Services, U.S. Department of Veterans Affairs)
// into data/recipes-open.json.
//
// Source: https://www.nutrition.va.gov/NUTRITION/Recipes.asp and its category pages. Each recipe is a one-page PDF:
// a per-serving nutrition line (calories, total fat, saturated fat, sodium, total carbohydrate, dietary fiber, protein),
// the title, prep, cook, and total time, yield and serving size, ingredients, numbered directions, and sometimes tips.
//
// Licence: VA's copyright policy (https://department.va.gov/copyright-policy/, read September 30, 2026): "Pursuant to
// federal law, government-produced materials appearing on this and other VA websites are not copyright protected."
// (17 U.S.C. section 105.) A recipe card that says "Adapted from" another source (a magazine, a cooking website, a
// cookbook) is not government-produced throughout, so every such card is left out. Text only; no photographs.
//
// Cultural fit (owner request, September 30, 2026): recipes a US home cook would recognize. The few titles most US cooks
// would not know are listed in SKIP_TITLES with the reason, so the choice can be reviewed.
//
// Every HTTP response is cached under tools/open-recipes/va/. Requests are sequential, 400 ms apart. nutrition.va.gov
// has no robots.txt (HTTP 404), which permits crawling; the script checks again on every run.
//
// PDF text needs pdfjs-dist, which the app does not ship. Install it once outside package.json:
//   npm install --no-save --no-package-lock pdfjs-dist@4
// or point PDFJS_DIST at an installed copy of pdfjs-dist/legacy/build/pdf.mjs.
//
// Usage: node tools/import-va.mjs [--offline]
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fixMeal } from './lib/meal-components.mjs';

if (process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY && !process.env.VA_IMPORT_CHILD) {
  const r = spawnSync(process.execPath, ['--no-warnings', fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1', VA_IMPORT_CHILD: '1' } });
  process.exit(r.status ?? 1);
}

let pdfjs;
try { pdfjs = await import(process.env.PDFJS_DIST ? pathToFileURL(process.env.PDFJS_DIST).href : 'pdfjs-dist/legacy/build/pdf.mjs'); }
catch { console.error('pdfjs-dist is needed to read the recipe PDFs. Install it once outside package.json:\n  npm install --no-save --no-package-lock pdfjs-dist@4\nor set PDFJS_DIST to .../pdfjs-dist/legacy/build/pdf.mjs'); process.exit(1); }

const CACHE = new URL('./open-recipes/va/', import.meta.url);
const OUT = new URL('../data/recipes-open.json', import.meta.url);
fs.mkdirSync(CACHE, { recursive: true });
const OFFLINE = process.argv.includes('--offline');

const SITE = 'https://www.nutrition.va.gov';
const START = '/NUTRITION/Recipes.asp';
const SOURCE = 'VA Healthy Teaching Kitchen';
const LICENSE = 'Public domain (United States Government work, 17 U.S.C. section 105; VA copyright policy)';
const ATTR = 'Recipe from the VA Healthy Teaching Kitchen, Nutrition and Food Services, U.S. Department of Veterans Affairs, nutrition.va.gov. Not copyright protected as a work of the United States Government.';
const UA = 'PeaceMeal-recipe-import/1.0 (personal family app)';
const DELAY_MS = 400;
const stats = { pages_fetched: 0, listing_pages: 0, pdfs: 0, imported: 0, skipped: [], problems: [] };
const problem = m => { stats.problems.push(m); console.error('  ! ' + m); };

// Titles most US home cooks would not recognize (owner request). Everything else stays.
const SKIP_TITLES = new Map([
  ['Apricot Chicken Tagine', 'named after a North African dish most US cooks would not know'],
  ['Calabacitas con Elote', 'Spanish name with no English description'],
  ['Chickpea Shakshuka', 'named after a North African and Middle Eastern dish many US cooks would not know'],
  ['White Bean and Egg Shakshuka', 'named after a North African and Middle Eastern dish many US cooks would not know'],
  ['Roasted Kohlrabi, Beets, and Fennel', 'kohlrabi is unfamiliar to most US cooks'],
  ['Roasted Red Pepper Romesco', 'a Spanish sauce most US cooks would not know by name']
]);
// Cards that make an ingredient or a condiment rather than a dish: no meal slot fits them, and the shared component
// list (tools/lib/meal-components.mjs) does not recognize their titles, so they would be planned as a lunch or dinner.
const NOT_A_DISH = new Map([
  ['Homemade Ricotta', 'makes an ingredient (a fresh cheese), not a dish'],
  ['Pico de Gallo (Salsa Fresca)', 'a condiment, not a dish'],
  ['Quick-Pickled Onions', 'a condiment, not a dish']
]);

let lastFetch = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function cachePath(url, ext) {
  const h = crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
  const tail = url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '_').slice(-60);
  return new URL(`./${tail}_${h}.${ext}`, CACHE);
}
async function fetchBytes(url, ext) {
  const cp = cachePath(url, ext);
  if (fs.existsSync(cp)) return fs.readFileSync(cp);
  if (OFFLINE) { problem('not cached (offline): ' + url); return null; }
  for (let attempt = 0; attempt < 2; attempt++) {
    const wait = lastFetch + DELAY_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastFetch = Date.now();
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
      if (res.status === 429 || res.status >= 500) { if (attempt < 1) { await sleep(3000); continue; } throw new Error('HTTP ' + res.status); }
      if (!res.ok) { problem(`HTTP ${res.status} for ${url}`); return null; }
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(cp, buf);
      stats.pages_fetched++;
      return buf;
    } catch (e) {
      if (attempt === 1) { problem(`fetch failed for ${url}: ${e.message}`); return null; }
      await sleep(2000);
    }
  }
  return null;
}

const decodeEntities = s => String(s)
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;|&rsquo;/g, "'");
const stripTags = s => decodeEntities(String(s).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const slug = s => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
const titleKey = s => slug(s).replace(/-/g, '');

// ---------------------------------------------------------------- crawl
const robots = await fetchBytes(SITE + '/robots.txt', 'txt');
if (robots && robots.length && /disallow:\s*\/NUTRITION/i.test(robots.toString())) { console.error('robots.txt disallows /NUTRITION; nothing imported'); process.exit(1); }
console.log('nutrition.va.gov robots.txt: ' + (robots && robots.length ? 'present, recipes allowed' : 'none (HTTP 404), crawling permitted'));

const pages = [START], seenPage = new Set(pages);
const pdfs = new Map(); // absolute pdf url -> { title, category }
for (let i = 0; i < pages.length && i < 150; i++) {
  const buf = await fetchBytes(SITE + pages[i], 'html');
  if (!buf) continue;
  stats.listing_pages++;
  const html = buf.toString('utf8');
  for (const m of html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    let u; try { u = new URL(decodeEntities(m[1]), SITE + pages[i]); } catch { continue; }
    if (u.hostname !== 'www.nutrition.va.gov') continue;
    const p = u.pathname;
    if (/^\/NUTRITION\/Recipes\/[^?#]*\.asp$/i.test(p) && !seenPage.has(p)) { seenPage.add(p); pages.push(p); }
    if (/^\/NUTRITION\/docs\/Recipes\/[^?#]+\.pdf$/i.test(p)) {
      const abs = SITE + p;
      const title = stripTags(m[2]);
      const cats = [(p.match(/^\/NUTRITION\/docs\/Recipes\/([^/]+)\//) || [])[1], (pages[i].match(/^\/NUTRITION\/Recipes\/([^/_.]+)/) || [])[1]].filter(Boolean);
      if (!pdfs.has(abs)) pdfs.set(abs, { title, categories: new Set(cats) });
      else { if (!pdfs.get(abs).title && title) pdfs.get(abs).title = title; for (const c of cats) pdfs.get(abs).categories.add(c); }
    }
  }
}
console.log(`${pdfs.size} recipe PDFs across ${stats.listing_pages} listing pages`);

// ---------------------------------------------------------------- PDF text, line by line
// Returns the text items of every page as rows (same baseline), top to bottom, each part with its x position.
async function pdfRows(buf) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, isEvalSupported: false, verbosity: 0 }).promise;
  const rows = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const items = (await page.getTextContent()).items.filter(x => x.str && x.str.trim());
    const pageRows = [];
    for (const it of items) {
      const y = it.transform[5], x = it.transform[4];
      let row = pageRows.find(r => Math.abs(r.y - y) <= 2.5);
      if (!row) pageRows.push(row = { page: n, y, parts: [] });
      row.parts.push({ x, w: it.width || 0, s: it.str });
    }
    pageRows.sort((a, b) => b.y - a.y);
    for (const r of pageRows) r.parts.sort((a, b) => a.x - b.x);
    rows.push(...pageRows);
    await page.cleanup();
  }
  await doc.destroy();
  return rows;
}
// Joins the parts of one row. A lone hyphen or apostrophe joins its neighbours without spaces ("whole-grain", "doesn't").
const GLUE = /^[-‐‑–’']$/;
function rowText(parts) {
  let out = '', end = null, glue = false;
  for (const p of parts) {
    const s = p.s;
    const space = end != null && !glue && !GLUE.test(s.trim()) && p.x - end > 1.5 && !/\s$/.test(out) && !/^\s/.test(s);
    out += (space ? ' ' : '') + (GLUE.test(s.trim()) ? s.trim() : s);
    glue = GLUE.test(s.trim());
    end = p.x + p.w;
  }
  return out.replace(/\s+/g, ' ').trim();
}
// Most cards put the ingredients in a left column and the directions in a right column, side by side. The columns are
// read separately below their headings; everything above the headings (title, times, yield) and every card with one
// column is read row by row. A "Recipe Notes" (or "Tips") box is kept apart as the recipe's notes: when it runs across
// both columns it ends both lists; when it sits in one column it ends only that one.
function cardLines(rows) {
  const find = re => { for (const r of rows) for (const p of r.parts) if (re.test(p.s.trim())) return { r, p }; return null; };
  const ing = find(/^ingredients\s*:?$/i), dir = find(/^(directions|instructions)\s*:?$/i);
  const notes = find(/^(recipe notes|notes|tips|chef'?s tips?)\s*:?$/i);
  const all = rows.map(r => rowText(r.parts));
  const below = r => notes && ing && r.page === notes.r.page && notes.r.y < ing.r.y && r.y < notes.r.y - 1;
  if (ing && dir && dir.r.page === ing.r.page && dir.p.x - ing.p.x > 100) {
    const cut = dir.p.x - 5;
    const notesRows = notes ? rows.filter(below) : [];
    const wide = notesRows.some(r => r.parts.some(p => p.x < cut && p.x + p.w > cut + 20));
    const notesSide = !notes ? null : wide ? 'both' : notes.p.x >= cut ? 'right' : 'left';
    const above = [], left = [], right = [], note = [];
    for (const r of rows) {
      if (r.page === ing.r.page && r.y > Math.max(ing.r.y, dir.r.y) + 2) { above.push(rowText(r.parts)); continue; }
      if (notes && r === notes.r) { const rest = r.parts.filter(p => p !== notes.p && (notesSide === 'both' || (notesSide === 'right') === (p.x >= cut))); if (notesSide !== 'both') { const other = r.parts.filter(p => !rest.includes(p) && p !== notes.p); if (other.length) (notesSide === 'right' ? left : right).push(rowText(other)); } if (rest.length) note.push(rowText(rest)); continue; }
      const inNote = below(r);
      const l = r.parts.filter(p => p.x < cut), rt = r.parts.filter(p => p.x >= cut);
      if (inNote && notesSide === 'both') { note.push(rowText(r.parts)); continue; }
      if (l.length) (inNote && notesSide === 'left' ? note : left).push(rowText(l));
      if (rt.length) (inNote && notesSide === 'right' ? note : right).push(rowText(rt));
    }
    return { lines: [...above, ...left, ...right].filter(Boolean), notes: note.filter(Boolean), all, twoColumn: true };
  }
  const main = [], note = [];
  for (const r of rows) { if (notes && r === notes.r) continue; (below(r) ? note : main).push(rowText(r.parts)); }
  return { lines: main.filter(Boolean), notes: note.filter(Boolean), all, twoColumn: false };
}

// ---------------------------------------------------------------- one recipe card
const NUM = String.raw`(\d+(?:\.\d+)?|<\s*\d+(?:\.\d+)?)`;
const num = s => { const m = String(s).match(/\d+(?:\.\d+)?/); return m ? Number(m[0]) : null; };
function parseDuration(s) {
  if (!s) return null;
  let m = 0, hit = false;
  for (const h of s.matchAll(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/gi)) { m += Number(h[1]) * 60; hit = true; }
  for (const h of s.matchAll(/(\d+)\s*(?:mins?|minutes?)\b/gi)) { m += Number(h[1]); hit = true; }
  return hit ? Math.round(m) : null;
}
const FRACTION = /^[\d½¼¾⅓⅔⅛⅜⅝⅞]/;
const isHeading = l => /^(ingredients|directions|instructions|tips?|chef'?s tips?|notes?|variations?|serving suggestions?)\s*:?$/i.test(l);
const BOILER = /^(nutrition facts|for more recipes|sodium:|calories:|total fat|saturated fat|total carbohydrate|dietary fiber|protein:|adapted from|submitted by|inspired by|recipe (created|submitted|adapted)|www\.|https?:)/i;
// A line that credits a person: a name with a dietitian's credentials ("..., MS, RDN, LDN", "... RD, CSO", "... DTR"),
// sometimes printed with no "Submitted by" in front and run into the line before it. No personal names are stored.
const CREDIT = /\b(RDN?|DTR|LDN?|LD\/N|CDE|CDCES|CSO|CSSD|LMNT|VAMC|VAHCS)\b/;
const keep = l => !BOILER.test(l) && !CREDIT.test(l);

function joinWrapped(lines, startsNew) {
  const out = [];
  for (const l of lines) {
    const prev = out[out.length - 1];
    const open = prev ? (prev.match(/\(/g) || []).length - (prev.match(/\)/g) || []).length : 0;
    if (prev && (open > 0 || !startsNew(l, prev))) out[out.length - 1] = prev.replace(/-$/, '-') + (/-$/.test(prev) ? '' : ' ') + l;
    else out.push(l);
  }
  return out.map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function parseCard(card, meta, url) {
  const lines = card.lines, text = card.all.join('\n');
  if (/adapted from/i.test(text)) return { skip: 'adapted from another source' };
  const grab = re => { const m = text.match(re); return m ? num(m[1]) : null; };
  const nutrition = {
    kcal: grab(new RegExp('Calories:?\\s*' + NUM, 'i')),
    fat_g: grab(new RegExp('Total Fat:?\\s*' + NUM, 'i')),
    satfat_g: grab(new RegExp('Saturated Fat:?\\s*' + NUM, 'i')),
    cholesterol_mg: grab(new RegExp('Cholesterol:?\\s*' + NUM, 'i')),
    sodium_mg: grab(new RegExp('Sodium:?\\s*' + NUM, 'i')),
    carb_g: grab(new RegExp('Total Carbohydrates?:?\\s*' + NUM, 'i')),
    fiber_g: grab(new RegExp('(?:Dietary )?Fiber:?\\s*' + NUM, 'i')),
    sugar_g: grab(new RegExp('Total Sugars?:?\\s*' + NUM, 'i')),
    added_sugar_g: grab(new RegExp('Added Sugars?:?\\s*' + NUM, 'i')),
    protein_g: grab(new RegExp('Protein:?\\s*' + NUM, 'i'))
  };
  for (const k of Object.keys(nutrition)) if (nutrition[k] == null) delete nutrition[k];
  const iIng = lines.findIndex(l => /^ingredients\s*:?$/i.test(l));
  const iDir = lines.findIndex((l, i) => i > iIng && /^(directions|instructions)\s*:?$/i.test(l));
  if (iIng < 0 || iDir < 0) return { skip: 'no ingredients or directions heading' };
  const iEnd = lines.findIndex((l, i) => i > iDir && (isHeading(l) || /^•/.test(l)));
  const timeLine = lines.find(l => /\bPrep:/i.test(l) || /\bTotal:/i.test(l)) || '';
  const yieldLine = lines.find(l => /\bYield:/i.test(l)) || '';
  const prep = parseDuration((timeLine.match(/Prep:\s*([^|]+)/i) || [])[1]);
  const cook = parseDuration((timeLine.match(/Cook:\s*([^|]+)/i) || [])[1]);
  const total = parseDuration((timeLine.match(/Total:\s*([^|]+)/i) || [])[1]);
  const servings = num((yieldLine.match(/Yield:\s*([^|]+)/i) || [])[1] || '');
  const servingSize = ((yieldLine.match(/Serving Size:\s*(.+)$/i) || [])[1] || '').trim() || null;
  const ingLines = lines.slice(iIng + 1, iDir).filter(l => keep(l) && !/\bPrep:|\bYield:/i.test(l));
  // A new ingredient starts with an amount or a capital letter; a lower-case line continues the one before it.
  const MID = /(\b(into|about|or|and|to|of|with|plus|each|cut|in|for|the|a|an)|[,(;\u2013-])$/i;
  // A new ingredient starts with an amount or a capital letter. A line continues the one before when that one ends
  // mid-phrase, or when it is an "Optional toppings: ..." list, which wraps onto lines that start with a capital letter.
  const startsNew = (l, prev) => {
    if (MID.test(prev)) return false;
    if (/^optional\b/i.test(prev) && !FRACTION.test(l) && !/\.$/.test(prev)) return false;
    return FRACTION.test(l) || /^[A-Z]/.test(l) || /:$/.test(prev);
  };
  const ingredients = joinWrapped(ingLines, startsNew)
    .filter(l => !(/:$/.test(l) && l.split(' ').length <= 5))       // sub-headings such as "Dressing:" are not ingredients
    .map(display => ({ display }));
  const dirLines = lines.slice(iDir + 1, iEnd < 0 ? undefined : iEnd).filter(keep);
  const steps = joinWrapped(dirLines, l => /^\d+\.\s/.test(l)).map(s => s.replace(/^\d+\.\s*/, ''));
  // The title printed on the card; the listing page's link text has typos on some cards ("Gilled Chicken").
  const iTime = lines.findIndex(l => /\bPrep:|\bTotal:|\bYield:/i.test(l));
  const head = (iTime > 0 ? lines.slice(0, iTime) : []).filter(l => !BOILER.test(l) && !/^(nutrition|per serving)/i.test(l) && !/\|/.test(l));
  const cardTitle = head.slice(-3).join(' ').replace(/\s+/g, ' ').replace(/^recipe title\s+/i, '').trim();
  const name = (cardTitle && cardTitle.length <= 80 && /[a-z]/i.test(cardTitle) ? cardTitle : meta.title) || null;
  // Notes: VA's own tips (swaps, storage, serving ideas). Credit lines name individual staff and are left out.
  const notesText = (card.notes || []).filter(l => keep(l) && !/submitted by|inspired by|^nutrition|^per serving/i.test(l)).join(' ').replace(/\s+/g, ' ').replace(/^•\s*/, '').trim();
  return { nutrition, prep, cook, total, servings, servingSize, ingredients, steps, name, notesText, textHasTitle: name ? text.toLowerCase().replace(/[^a-z]/g, '').includes(name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12)) : false };
}

// ---------------------------------------------------------------- meal slot, equipment, leftovers
// Only the site's meal-type sections set a meal slot. Pages by ingredient or appliance (Poultry, Vegan, Slow Cooker)
// list breakfasts and dinners alike, so they do not.
const CATEGORY_MEAL = { Breakfast: ['breakfast'], MainDishes: ['lunch', 'dinner'], Main: ['lunch', 'dinner'], SideDishes: ['lunch', 'dinner'], Sides: ['lunch', 'dinner'], Snacks: ['snack'], Desserts: ['snack'], Beverages: ['snack'], DressingsSaucesSeasonings: ['component'] };
function categoryMeal(categories, name) {
  const meal = new Set();
  for (const c of categories) for (const m of CATEGORY_MEAL[c] || []) meal.add(m);
  if (!meal.size) for (const m of titleMeal(name)) meal.add(m);
  if (/\b(omelet|frittata|benedict|quiche|scramble|pancakes?|french toast|oatmeal|overnight oats|granola|egg cups?|toast with)\b/i.test(name)) meal.add('breakfast');
  return [...meal];
}
// Cards whose section or title gives the wrong slot, checked by hand (September 30, 2026).
const MEAL_OVERRIDE = new Map([
  ['Berry-Lime Banana Sorbet', ['snack']],
  ['Homemade Tortilla Chips', ['snack']],
  ['Pomegranate-Poached Pears', ['snack']],
  ['Greek Yogurt with Warm Berry Sauce', ['breakfast', 'snack']],
  ['Berry-Yogurt Protein Bowls', ['breakfast']]
]);
function titleMeal(name) {
  const t = name.toLowerCase();
  if (/\b(pancakes?|oatmeal|oats|breakfast|granola|french toast|scramble|frittata|omelet|muffins?|waffles?|parfait|smoothie|egg cups?|hash)\b/.test(t)) return ['breakfast'];
  if (/\b(dressing|vinaigrette|sauce|seasoning|rub|marinade|gravy|salsa)\b/.test(t)) return ['component'];
  if (/\b(cookies?|brownies?|cake|cupcakes?|pie|crisp|cobbler|pudding|bars?|bites|truffles?|dip|popcorn|chips|trail mix|energy balls?|cheesecakes?|punch|cider|cocoa|spritzer|mocktail|lemonade|tea)\b/.test(t)) return ['snack'];
  return ['lunch', 'dinner'];
}
function inferEquipment(steps) {
  const t = steps.join(' ').toLowerCase();
  const eq = new Set();
  if (/\b(oven|bake|baked|baking|roast|roasted|roasting|broil|broiler|preheat the oven)\b/.test(t)) eq.add('oven');
  if (/\b(pan|saucepan|skillet|stove|stovetop|boil|boiling|simmer|sauté|saute|sautéed|wok|griddle|pot|medium heat|high heat|low heat|poach|steam)\b/.test(t)) eq.add('stove');
  if (/\bmicrowave/.test(t)) eq.add('microwave');
  if (/\b(blender|blend|food processor|immersion)\b/.test(t)) eq.add('blender');
  if (/\b(slow cooker|slow-cooker|crock ?pot)\b/.test(t)) eq.add('slow-cooker');
  if (/\b(pressure cooker|pressure-cooker|instant pot|multicooker|multi-cooker)\b/.test(t)) eq.add('pressure-cooker');
  if (/\b(air fryer|air-fryer|airfryer)\b/.test(t)) eq.add('air-fryer');
  if (/\bgrill\b/.test(t)) eq.add('oven');
  return eq.size ? [...eq] : ['none'];
}
function inferLeftovers(name) {
  const t = name.toLowerCase();
  if (/\b(salad|sandwich|wrap|toast|pancake|smoothie|shake|omelet|scramble|fritter|spritzer|lemonade|mocktail|tea|punch)/.test(t)) return 'poor';
  if (/\b(soup|stew|chili|casserole|bake|lasagna|curry|meatloa|meatball|beans?|lentils?|chickpeas?|roast|muffin|bread|cake|cookie|granola|bites|bars?|energy)/.test(t)) return 'good';
  return 'ok';
}
const HEAT = /\b(cook|heat|bake|fry|boil|simmer|roast|grill|toast|microwave|oven|saut|steam|poach|preheat|griddle|sear|melt|broil|air fry)/i;

// ---------------------------------------------------------------- run
const existing = JSON.parse(fs.readFileSync(OUT, 'utf8')).filter(r => r.source !== SOURCE);
const taken = new Map(existing.filter(r => r.source !== 'Wikibooks Cookbook').map(r => [titleKey(r.name), r.source]));
const own = JSON.parse(fs.readFileSync(new URL('../data/recipes.json', import.meta.url), 'utf8'));
for (const r of own) taken.set(titleKey(r.name), 'Peace Meal');
const out = [], allTitles = [], ids = new Set(existing.map(r => r.id));
for (const [url, meta] of [...pdfs.entries()].sort()) {
  const buf = await fetchBytes(url, 'pdf');
  if (!buf) continue;
  stats.pdfs++;
  let lines;
  try { lines = cardLines(await pdfRows(buf)); } catch (e) { problem(`unreadable PDF ${url}: ${e.message}`); continue; }
  const c = parseCard(lines, meta, url);
  const label = meta.title || url.split('/').pop();
  allTitles.push(label);
  if (c.skip) { stats.skipped.push(`${label} (${c.skip})`); continue; }
  if (!c.name) { stats.skipped.push(`${label} (no title on the listing page)`); continue; }
  if (SKIP_TITLES.has(c.name)) { stats.skipped.push(`${c.name} (${SKIP_TITLES.get(c.name)})`); continue; }
  if (NOT_A_DISH.has(c.name)) { stats.skipped.push(`${c.name} (${NOT_A_DISH.get(c.name)})`); continue; }
  if (!c.textHasTitle) problem(`title "${c.name}" not found in the PDF text of ${url}`);
  if (!c.ingredients.length || !c.steps.length) { stats.skipped.push(`${c.name} (no ingredients or directions)`); continue; }
  if (typeof c.nutrition.kcal !== 'number' || c.nutrition.kcal < 5 || c.nutrition.kcal > 1500) { stats.skipped.push(`${c.name} (calories missing or out of range: ${c.nutrition.kcal})`); continue; }
  if (typeof c.nutrition.sodium_mg !== 'number') { stats.skipped.push(`${c.name} (no sodium)`); continue; }
  const k = titleKey(c.name);
  if (taken.has(k)) { stats.skipped.push(`${c.name} (same title already in ${taken.get(k)})`); continue; }
  taken.set(k, SOURCE);
  let id = 'va-' + slug(c.name);
  for (let n = 2; ids.has(id); n++) id = 'va-' + slug(c.name) + '-' + n;
  ids.add(id);
  const equipment = inferEquipment(c.steps);
  const active = c.prep ?? (c.total != null && c.cook != null ? Math.max(0, c.total - c.cook) : null);
  const totalMin = c.total ?? ((c.prep ?? 0) + (c.cook ?? 0) || null);
  const rec = {
    id, name: c.name, source: SOURCE, source_url: url, license: LICENSE, attribution: ATTR,
    nutrition_source: 'va', nutrition_per_serving: c.nutrition,
    serving_size_text: c.servingSize,
    meal: categoryMeal(meta.categories, c.name),
    servings: c.servings || 4,
    active_min: active ?? Math.max(5, c.steps.length * 3), total_min: totalMin ?? Math.max(10, c.steps.length * 5),
    skill: (c.steps.length >= 9 || (totalMin || 0) >= 90) ? 'comfortable' : 'beginner',
    equipment, assembly_only: equipment.length === 1 && equipment[0] === 'none' && !HEAT.test(c.steps.join(' ')),
    leftovers: inferLeftovers(c.name), ingredients: c.ingredients, steps: c.steps, tags: [], cuisine: null, notes: c.notesText ? { text: c.notesText } : {}
  };
  if (active == null || totalMin == null) rec.times_estimated = true;
  if (!c.servings) rec.servings_estimated = true;
  rec.meal = MEAL_OVERRIDE.get(rec.name) || fixMeal(rec);
  out.push(rec);
}
stats.imported = out.length;
out.sort((a, b) => a.id.localeCompare(b.id));
const all = existing.concat(out);
fs.writeFileSync(OUT, '[\n' + all.map(r => JSON.stringify(r)).join(',\n') + '\n]\n');
fs.writeFileSync(new URL('./va-last-run.json', CACHE), JSON.stringify({ when: new Date().toISOString(), ...stats, titles: allTitles.sort() }, null, 2));
console.log(`imported ${out.length} VA recipes from ${stats.pdfs} PDFs (${stats.skipped.length} skipped, ${stats.problems.length} problems); recipes-open.json now holds ${all.length} recipes`);
