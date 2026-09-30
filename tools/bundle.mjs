// Builds dist/nutrition-app.html: one self-contained file (app + data inlined) that runs from a file:// URL, a phone, or an artifact.
// It rewrites ES module imports into a single classic script by concatenating modules in dependency order.
import fs from 'node:fs';
import path from 'node:path';
import { pagesServiceWorker, fingerprint } from './lib/pages-sw.mjs';
const root = new URL('../', import.meta.url);
const R = p => fs.readFileSync(new URL(p, root), 'utf8');

const engineOrder = ['src/engine/dictionary.js', 'src/engine/nutrition.js', 'src/engine/plan.js', 'src/engine/checker.js', 'src/engine/planner.js', 'src/engine/grocery.js', 'src/engine/screen.js'];
// Any engine module not listed above (energy.js, group.js, pantry.js, ...) is appended after the ordered ones so the UI can import it.
const engineDir = new URL('src/engine/', root);
const engineExtra = fs.existsSync(engineDir) ? fs.readdirSync(engineDir).filter(f => f.endsWith('.js')).sort().map(f => 'src/engine/' + f).filter(f => !engineOrder.includes(f)) : [];
const order = [...engineOrder, ...engineExtra, 'src/store.js'];
const uiDir = new URL('src/ui/', root);
const uiFiles = fs.existsSync(uiDir) ? fs.readdirSync(uiDir).filter(f => f.endsWith('.js')).sort().map(f => 'src/ui/' + f) : [];
const appFile = 'src/app.js';

function stripModuleSyntax(code) {
  return code
    .replace(/^\s*import\s+[^;]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*export\s+default\s+/gm, 'const __default = ')
    .replace(/^\s*export\s+(const|let|var|function|class|async function)\s+/gm, '$1 ')
    .replace(/^\s*export\s*\{[^}]*\};?\s*$/gm, '');
}

// --lite builds dist/peace-meal-lite.html: one person, four tabs, and without the Wikibooks recipes (no nutrition data, 4 MB).
const LITE = process.argv.includes('--lite');
// --pages builds the hosted copy for GitHub Pages instead: dist/pages/lite/ (or dist/pages/full/) with index.html, a manifest,
// PNG icons, and a small service worker, so the page can be added to an iPhone home screen and opened offline.
const PAGES = process.argv.includes('--pages');
const data = {};
for (const f of ['sources', 'conditions', 'dictionaries', 'foods', 'recipes', 'recipes-open', 'recipes-usda', 'articles', 'swaps', 'diet-lists']) {
  const p = new URL('data/' + f + '.json', root);
  data[f] = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : (f === 'dictionaries' ? { tags: {}, entries: [] } : f === 'articles' ? {} : f === 'swaps' ? { families: {}, swaps: [] } : f === 'diet-lists' ? { families: {} } : []);
}
if (LITE && Array.isArray(data['recipes-open'])) data['recipes-open'] = data['recipes-open'].filter(r => r.source !== 'Wikibooks Cookbook');
if (LITE) data['recipes-usda'] = [];   // the USDA collection stays a full-app opt-in; lite ships Peace Meal's own recipes plus the NHS, Parent Club, NHLBI, and VA sets
// Full build (2026-09 audit): the 2,268 Wikibooks recipes are a third of the inline data and have no nutrition numbers.
// They ship in the same file as a JSON block the browser does not run (<script type="application/json">), so launch
// skips parsing them; src/app.js reads the block the first time someone searches recipes, or at launch when the saved
// data already needs them. They must sit together in recipes-open.json; the app puts them back after the recipe named
// in "after", so the recipe order, and with it every week plan, is the same as before.
let deferredBlock = '';
if (!LITE && Array.isArray(data['recipes-open'])) {
  const open = data['recipes-open'];
  const isWb = r => r.source === 'Wikibooks Cookbook';
  const first = open.findIndex(isWb), last = open.length - 1 - [...open].reverse().findIndex(isWb);
  const wb = first >= 0 ? open.slice(first, last + 1) : [];
  if (wb.length && wb.every(isWb)) {
    const before = first > 0 ? open[first - 1].id : (Array.isArray(data.recipes) && data.recipes.length ? data.recipes[data.recipes.length - 1].id : null);
    data['recipes-open'] = open.filter(r => !isWb(r));
    // meals_without_nutrition matches the planner's own count (src/engine/planner.js): meals, not components, with no numbers.
    const hasNutrition = r => !!(r.nutrition_per_serving && r.nutrition_source) || (r.ingredients || []).some(i => i.food);
    const component = r => Array.isArray(r.meal) && r.meal.length === 1 && r.meal[0] === 'component';
    data.deferred = { wikibooks: { element: 'pm-deferred-wikibooks', source: 'Wikibooks Cookbook', count: wb.length, featured: wb.filter(r => r.featured).length, times_estimated: wb.filter(r => r.times_estimated).length, meals_without_nutrition: wb.filter(r => !component(r) && !hasNutrition(r)).length, after: before, id_prefix: 'wb-' } };
    // Every "<" is written as \u003c (the same text once parsed), so nothing inside can end the block early.
    deferredBlock = `<script type="application/json" id="pm-deferred-wikibooks">${JSON.stringify(wb).replace(/</g, '\\u003c')}</script>\n`;
  } else if (wb.length) console.warn('Wikibooks recipes are not together in recipes-open.json; they stay inline (launch is slower).');
}
const html = R('index.html');
if (fs.existsSync(new URL('breathe.html', root))) data.breatheHtml = R('breathe.html');
const iconSvg = fs.existsSync(new URL('icon.svg', root)) ? R('icon.svg') : '';
const iconData = iconSvg ? 'data:image/svg+xml;utf8,' + encodeURIComponent(iconSvg) : '';
const css = fs.existsSync(new URL('src/app.css', root)) ? R('src/app.css') : '';
// Fonts (2026-09 audit, owner question 14): src/fonts/fonts.css with each woff2 file inlined as a data: URI, so the
// single file needs no request to Google. The stylesheet keeps the fonts' copyright notices and licence text.
const fontsCss = fs.existsSync(new URL('src/fonts/fonts.css', root))
  ? R('src/fonts/fonts.css').replace(/url\(([a-z0-9-]+\.woff2)\)/g, (m, f) => `url(data:font/woff2;base64,${fs.readFileSync(new URL('src/fonts/' + f, root)).toString('base64')})`)
  : '';
let js = '';
for (const f of [...order, ...uiFiles, appFile]) {
  if (!fs.existsSync(new URL(f, root))) continue;
  js += `\n/* ---- ${f} ---- */\n` + stripModuleSyntax(R(f)) + '\n';
}
const dataScript = `<script>${LITE ? 'window.__PEACE_MEAL_LITE__ = true;' : ''}window.__APP_DATA__ = ${JSON.stringify(data).replace(/<\/script/gi, '<\\/script')};</script>`;
let out = html
  .replace(/<link[^>]+href="src\/fonts\/fonts\.css"[^>]*>/, () => `<style>\n${fontsCss}\n</style>`)
  .replace(/<link[^>]+href="src\/app\.css"[^>]*>/, () => `<style>\n${css}\n</style>`)
  .replace(/<script[^>]+type="module"[^>]+src="src\/app\.js"[^>]*><\/script>/, () => `${deferredBlock}${dataScript}\n<script>\n(function(){\n${js}\n})();\n</script>`)
  .replace(/<link[^>]+rel="manifest"[^>]*>\s*/, '')
  .replace(/(<link[^>]+rel="(?:icon|apple-touch-icon)"[^>]+href=")[^"]+(")/g, (m, a, b) => iconData ? a + iconData + b : '')
  .replace(/<script>[^<]*serviceWorker[^<]*<\/script>\s*/, '');
fs.mkdirSync(new URL('dist/', root), { recursive: true });
if (LITE) out = out.replace(/<title>Peace Meal<\/title>/, '<title>Peace Meal for one</title>').replace(/one table, everyone's funky dietary needs, every recommendation cited/, 'your meals, your symptoms, your doctor report, every recommendation cited');
if (PAGES) {
  const dir = LITE ? 'dist/pages/lite/' : 'dist/pages/full/';
  const name = LITE ? 'Peace Meal for one' : 'Peace Meal';
  fs.mkdirSync(new URL(dir, root), { recursive: true });
  // hosted copy: real icon files and a manifest (iOS ignores SVG and data: touch icons), plus the service worker
  out = out
    .replace(/<link rel="icon"[^>]*>\s*/, '<link rel="icon" href="icon-180.png" type="image/png">\n<link rel="manifest" href="manifest.webmanifest">\n')
    .replace(/<link rel="apple-touch-icon"[^>]*>\s*/, `<link rel="apple-touch-icon" href="icon-180.png">\n<meta name="apple-mobile-web-app-title" content="${name}">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-status-bar-style" content="default">\n`)
    ;
  // The breathe page is inlined as data and also contains </body>, so only the document's own closing tag (the last one) gets the service worker script.
  const bodyEnd = out.lastIndexOf('</body>');
  // window.__pmSwReg lets the app watch for a new version (src/app.js shows "Update ready, tap to reload").
  const swReg = `<script>\nif ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {\n  window.__pmSwReg = new Promise(function (done) { window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').then(done, function () { done(null); }); }); });\n}\n</script>\n`;
  out = out.slice(0, bodyEnd) + swReg + out.slice(bodyEnd);
  fs.writeFileSync(new URL(dir + 'index.html', root), out);
  const manifest = JSON.stringify({
    name, short_name: name, description: LITE ? 'Your meals, your symptoms, your doctor report. Data stays on this phone.' : 'One table, everyone\'s dietary needs, every recommendation cited. Data stays on this device.',
    start_url: './', scope: './', display: 'standalone', background_color: '#FBFAF7', theme_color: '#3D5A3C',
    icons: [{ src: 'icon-180.png', sizes: '180x180', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }]
  }, null, 2);
  fs.writeFileSync(new URL(dir + 'manifest.webmanifest', root), manifest);
  for (const f of ['icon-180.png', 'icon-512.png']) fs.copyFileSync(new URL(f, root), new URL(dir + f, root));
  // Service worker: cache first, and every saved file checked against the fingerprint of this build (tools/lib/pages-sw.mjs,
  // P1-4 of the audit of September 30, 2026). The fingerprints are taken from the bytes written here; the Pages workflow
  // later stamps only __BUILD__ in sw.js, so they stay valid. The folder URL ('') serves index.html.
  const bytes = f => fs.readFileSync(new URL(dir + f, root));
  const fingerprints = { '': fingerprint(bytes('index.html')), 'index.html': fingerprint(bytes('index.html')), 'manifest.webmanifest': fingerprint(bytes('manifest.webmanifest')), 'icon-180.png': fingerprint(bytes('icon-180.png')), 'icon-512.png': fingerprint(bytes('icon-512.png')) };
  fs.writeFileSync(new URL(dir + 'sw.js', root), pagesServiceWorker({ app: LITE ? 'lite' : 'full', fingerprints }));
  console.log(dir, (out.length / 1024).toFixed(0) + ' KB');
} else {
  const outName = LITE ? 'dist/peace-meal-lite.html' : 'dist/nutrition-app.html';
  fs.writeFileSync(new URL(outName, root), out);
  console.log(outName, (out.length / 1024).toFixed(0) + ' KB');
}
