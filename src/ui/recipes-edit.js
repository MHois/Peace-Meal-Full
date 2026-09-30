// Recipe editing: linking display-only ingredient lines to foods, the household recipe editor ("Mine"), and "Paste a recipe".
// Grams are taken from a stated weight when the line has one, from the food's own USDA portion when a matching label exists,
// and otherwise from a common conversion that is marked "estimated". Nothing is saved without the person pressing Save.
import { recipeTotals } from '../engine/nutrition.js';
import { uiState, uiEsc, uiPersist, uiToast, uiModal, uiFmtNum, uiSegmented, uiMultiPills, uiChip, uiIcon, uiNoticeHTML, uiEmptyState } from './common.js';

const RECIPES_ED_UNICODE_FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 };
const RECIPES_ED_UNIT_RE = /^(cups?|c|tablespoons?|tbsps?|tbs|teaspoons?|tsps?|ounces?|oz|pounds?|lbs?|grams?|g|kg|ml|millilit(?:re|er)s?|litres?|liters?|l|cans?|tins?|cloves?|slices?|sticks?|pinch(?:es)?|dash(?:es)?|large|medium|small|ea|each|pieces?|bunch(?:es)?|handfuls?|packages?|pkgs?|jars?|bottles?|sprigs?|heads?|stalks?|fillets?|x)\.?(?=[\s,(]|$)\s*(.*)$/i;
const RECIPES_ED_UNIT_NORMAL = { c: 'cup', cup: 'cup', cups: 'cup', tablespoon: 'tbsp', tablespoons: 'tbsp', tbsp: 'tbsp', tbsps: 'tbsp', tbs: 'tbsp', teaspoon: 'tsp', teaspoons: 'tsp', tsp: 'tsp', tsps: 'tsp', ounce: 'oz', ounces: 'oz', oz: 'oz', pound: 'lb', pounds: 'lb', lb: 'lb', lbs: 'lb', can: 'can', cans: 'can', tin: 'can', tins: 'can', clove: 'clove', cloves: 'clove', slice: 'slice', slices: 'slice', stick: 'stick', sticks: 'stick', pinch: 'pinch', pinches: 'pinch', dash: 'pinch', dashes: 'pinch', large: 'large', medium: 'medium', small: 'small', ea: 'each', each: 'each', piece: 'piece', pieces: 'piece', bunch: 'bunch', bunches: 'bunch', handful: 'handful', handfuls: 'handful', package: 'package', packages: 'package', pkg: 'package', pkgs: 'package', jar: 'jar', jars: 'jar', bottle: 'bottle', bottles: 'bottle', sprig: 'sprig', sprigs: 'sprig', head: 'head', heads: 'head', stalk: 'stalk', stalks: 'stalk', fillet: 'fillet', fillets: 'fillet', x: 'each' };
// Common conversions used only when the food has no matching portion. Values in grams; every result is marked "estimated".
const RECIPES_ED_COMMON_GRAMS = { cup: 240, tbsp: 15, tsp: 5, oz: 28.35, lb: 453.6, pinch: 0.5, stick: 113, clove: 3, slice: 25, sprig: 2 };
const RECIPES_ED_PORTION_RE = { cup: /\bcups?\b/i, tbsp: /\b(tbsp|tablespoons?)\b/i, tsp: /\b(tsp|teaspoons?)\b/i, oz: /^\s*[\d.]+\s*oz\b/i, lb: /\blbs?\b/i, can: /\bcans?\b/i, clove: /\bcloves?\b/i, slice: /\bslices?\b/i, stick: /\bsticks?\b/i, large: /\blarge\b/i, medium: /\bmedium\b/i, small: /\bsmall\b/i, each: /\b(each|unit|whole)\b/i, piece: /\bpieces?\b/i, fillet: /\bfillets?\b/i, package: /\bpackages?\b/i, jar: /\bjars?\b/i, bottle: /\bbottles?\b/i, head: /\bheads?\b/i, stalk: /\bstalks?\b/i, sprig: /\bsprigs?\b/i, bunch: /\bbunch/i };
const RECIPES_ED_STOP = new Set(['and', 'or', 'of', 'the', 'a', 'an', 'to', 'for', 'with', 'into', 'in', 'about', 'approx', 'approximately', 'taste', 'optional', 'plus', 'more', 'extra', 'as', 'needed', 'divided', 'chopped', 'diced', 'sliced', 'minced', 'grated', 'shredded', 'crushed', 'peeled', 'seeded', 'deseeded', 'pitted', 'cored', 'trimmed', 'rinsed', 'drained', 'finely', 'roughly', 'thinly', 'thickly', 'cut', 'pieces', 'piece', 'cubes', 'cubed', 'halved', 'quartered', 'melted', 'softened', 'beaten', 'sifted', 'packed', 'heaped', 'heaping', 'level', 'rounded', 'ripe', 'fresh', 'freshly', 'large', 'medium', 'small', 'big', 'whole', 'ground', 'cooked', 'uncooked', 'raw', 'boiled', 'roasted', 'toasted', 'warm', 'cold', 'hot', 'room', 'temperature', 'good', 'quality', 'your', 'choice', 'favourite', 'favorite', 'such', 'like', 'preferably', 'ideally', 'if', 'you', 'have', 'it', 'them', 'cup', 'cups', 'tbsp', 'tsp', 'tablespoon', 'tablespoons', 'teaspoon', 'teaspoons', 'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds', 'g', 'gram', 'grams', 'kg', 'ml', 'l', 'litre', 'liter', 'can', 'cans', 'tin', 'tins', 'jar', 'package', 'packet', 'bunch', 'handful', 'pinch', 'dash', 'clove', 'cloves', 'slice', 'slices', 'stick', 'sticks', 'sprig', 'sprigs', 'head', 'stalk', 'stalks', 'each', 'ea', 'x', 'few', 'some', 'little', 'bit', 'juice', 'zest', 'skinless', 'boneless', 'lean', 'reduced', 'low', 'fat', 'light', 'plain', 'natural', 'unsalted', 'salted', 'sweetened', 'unsweetened']);

function recipesEdStem(w) {
  const s = w.toLowerCase();
  if (s.length <= 3) return s;
  if (/(oes|ches|shes|sses|xes)$/.test(s)) return s.slice(0, -2);
  if (/ies$/.test(s)) return s.slice(0, -3) + 'y';
  if (/s$/.test(s) && !/ss$/.test(s)) return s.slice(0, -1);
  return s;
}

// The quantity at the front of an ingredient line, the unit that follows it, and any stated weight anywhere in the line.
export function recipesEdParseQuantity(display) {
  let s = String(display || '').trim();
  const out = { qty: null, unit: null, size: null, stated: null, ml: null, inner: null, rest: s };
  const gm = /(\d+(?:[.,]\d+)?)\s*(?:g|grams?)\b/i.exec(s);
  if (gm) out.stated = parseFloat(gm[1].replace(',', '.'));
  const kgm = /(\d+(?:[.,]\d+)?)\s*kg\b/i.exec(s);
  if (out.stated == null && kgm) out.stated = parseFloat(kgm[1].replace(',', '.')) * 1000;
  const mlm = /(\d+(?:[.,]\d+)?)\s*(?:ml|millilit(?:re|er)s?)\b/i.exec(s);
  if (mlm) out.ml = parseFloat(mlm[1].replace(',', '.'));
  const lm = /(\d+(?:[.,]\d+)?)\s*(?:litres?|liters?|l)\b/i.exec(s);
  if (out.ml == null && lm) out.ml = parseFloat(lm[1].replace(',', '.')) * 1000;
  // unicode fractions and mixed numbers
  s = s.replace(/(\d)\s*([½¼¾⅓⅔⅛⅜⅝⅞])/g, (m, d, f) => String(Number(d) + RECIPES_ED_UNICODE_FRACTIONS[f]))
    .replace(/[½¼¾⅓⅔⅛⅜⅝⅞]/g, f => String(RECIPES_ED_UNICODE_FRACTIONS[f]));
  s = s.replace(/^(?:about|approx\.?|approximately|roughly)\s+/i, '');
  let m = /^(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*\d+(?:\.\d+)?)?(?:\s+(\d+)\/(\d+))?\s*(.*)$/.exec(s);
  if (m) {
    out.qty = parseFloat(m[1]) + (m[2] ? Number(m[2]) / Number(m[3]) : 0);
    s = m[4];
  } else if ((m = /^(\d+)\/(\d+)\s*(.*)$/.exec(s))) {
    out.qty = Number(m[1]) / Number(m[2]);
    s = m[3];
  } else if ((m = /^(?:a|an|one)\s+(pinch|dash|handful|few|clove|slice|can|cup|bunch|head|stalk|sprig)\b(?:es|s)?\s*(?:of)?\s*(.*)$/i.exec(s))) {
    out.qty = 1;
    s = m[1] + ' ' + m[2];
  }
  if (out.qty != null) {
    // a parenthetical right after the quantity, for example "1 can (15 oz)"
    const um = RECIPES_ED_UNIT_RE.exec(s);
    if (um) {
      out.unit = RECIPES_ED_UNIT_NORMAL[um[1].toLowerCase()] || um[1].toLowerCase();
      if (['large', 'medium', 'small'].includes(out.unit)) { out.size = out.unit; out.unit = null; }
      if (/^(g|gram|grams|kg|ml|millilitre|millilitres|milliliter|milliliters|litre|litres|liter|liters|l)$/.test(out.unit)) out.unit = null;   // weight or volume already read above
      s = um[2];
    }
    const pm = /^\(([^)]*)\)\s*(.*)$/.exec(s);
    if (pm) {
      const inner = /(\d+(?:\.\d+)?)\s*(oz|ounces?|g|grams?|ml|lbs?|cups?)\b/i.exec(pm[1]);
      if (inner) out.inner = { qty: parseFloat(inner[1]), unit: RECIPES_ED_UNIT_NORMAL[inner[2].toLowerCase()] || (/^g/i.test(inner[2]) ? 'g' : inner[2].toLowerCase()) };
      s = pm[2];
    }
    if (!out.size) { const sm = /^(large|medium|small)\b\s*(.*)$/i.exec(s); if (sm) { out.size = sm[1].toLowerCase(); s = sm[2]; } }
  }
  out.rest = s.replace(/^of\s+/i, '').trim();
  return out;
}

// Grams for a parsed line against a chosen food. how: stated | portion | estimated | none.
export function recipesEdGramsFor(food, parsed) {
  if (!parsed) return { grams: null, how: 'none' };
  if (parsed.stated != null) return { grams: parsed.stated, how: 'stated' };
  if (parsed.ml != null) return { grams: parsed.ml, how: 'estimated' };
  const qty = parsed.qty;
  if (qty == null || !(qty > 0)) return { grams: null, how: 'none' };
  const portions = (food && food.portions || []).filter(p => p.grams > 0 && !/^100 g$/.test(p.label));
  const perUnit = p => { const n = parseFloat(p.label); return p.grams / (n > 0 ? n : 1); };
  const find = key => { const re = RECIPES_ED_PORTION_RE[key]; return re ? portions.find(p => re.test(p.label)) : null; };
  let unit = parsed.unit;
  if (unit === 'can' || unit === 'package' || unit === 'jar' || unit === 'bottle') {
    const p = find(unit);
    if (p) return { grams: qty * perUnit(p), how: 'portion' };
    if (parsed.inner) return recipesEdGramsFor(food, { qty: qty * parsed.inner.qty, unit: parsed.inner.unit === 'g' ? null : parsed.inner.unit, stated: parsed.inner.unit === 'g' ? qty * parsed.inner.qty : null });
    return { grams: null, how: 'none' };
  }
  if (unit) {
    const p = find(unit);
    if (p) return { grams: qty * perUnit(p), how: 'portion' };
    if (RECIPES_ED_COMMON_GRAMS[unit] != null) return { grams: qty * RECIPES_ED_COMMON_GRAMS[unit], how: 'estimated' };
    if (unit === 'each' || unit === 'piece') unit = null; else return { grams: null, how: 'none' };
  }
  // a bare count ("2 eggs", "3 large bananas"): the food's own unit portion
  const size = parsed.size;
  const p = (size && find(size)) || find('medium') || find('large') || find('each') || find('piece') || find('fillet') || find('small')
    || portions.find(p => !/\b(cup|tbsp|tsp|oz|lb|fl oz|serving|g)\b/i.test(p.label) && /^1\s/.test(p.label));
  if (p) return { grams: qty * perUnit(p), how: 'portion' };
  return { grams: null, how: 'none' };
}

// ---- Food search and suggestions ----
let recipesEdFoodIndex = null;
function recipesEdIndex() {
  if (recipesEdFoodIndex && recipesEdFoodIndex.foods === uiState.data.foods) return recipesEdFoodIndex.rows;
  const rows = uiState.data.foods.map(f => {
    const name = (f.name || '').toLowerCase();
    const short = (f.short || '').toLowerCase();
    const tokens = new Set(name.replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean).map(recipesEdStem));
    const shortFirst = recipesEdStem((short.split(/[^a-z]+/)[0] || ''));
    return { f, name, short, tokens, shortFirst, len: tokens.size, raw: /\b(raw|fresh)\b/.test(name) };
  });
  recipesEdFoodIndex = { foods: uiState.data.foods, rows };
  return rows;
}

export function recipesEdSearchFoods(q, limit = 8) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const rows = recipesEdIndex();
  const hits = [];
  for (const r of rows) {
    if (!words.every(w => r.name.includes(w) || r.short.includes(w))) continue;
    const starts = r.name.startsWith(words[0]) || r.short.startsWith(words[0]) ? 0 : 1;
    hits.push({ f: r.f, k: starts * 1000 + r.name.length });
  }
  hits.sort((a, b) => a.k - b.k);
  return hits.slice(0, limit).map(h => h.f);
}

// Up to three likely foods for a display line, from word overlap. The person picks; nothing is chosen for them.
export function recipesEdSuggest(display, limit = 3) {
  const parsed = recipesEdParseQuantity(display);
  const text = (parsed.rest || display || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z ]+/g, ' ');
  const words = [...new Set(text.split(/\s+/).filter(w => w.length > 2 && !RECIPES_ED_STOP.has(w)).map(recipesEdStem))];
  if (!words.length) return [];
  const rows = recipesEdIndex();
  const scored = [];
  for (const r of rows) {
    let matched = 0;
    for (const w of words) if (r.tokens.has(w)) matched++;
    if (!matched) continue;
    const first = words.includes(r.shortFirst) ? 6 : 0;
    scored.push({ f: r.f, s: matched * 10 + first + (r.raw ? 2 : 0) - (r.len - matched) * 3 });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, limit).map(x => x.f);
}

// ---- Ingredient line editor (shared by the link sheet and the recipe editor) ----
// lines: [{ display, food, grams, how }]. opts.editableDisplay lets the display text be changed and lines added or removed.
function recipesEdLineHTML(line, i, opts) {
  const food = line.food ? uiState.foodsById.get(line.food) : null;
  const suggestions = !food && line.display ? recipesEdSuggest(line.display) : [];
  const how = line.how === 'estimated' ? uiChip('estimated', 'caution') : line.how === 'portion' ? uiChip('USDA portion', 'neutral') : line.how === 'stated' ? uiChip('stated', 'pass') : '';
  return `<div class="ing-line" data-line="${i}">
    <div class="ing-head">
      ${opts.editableDisplay ? `<input type="text" class="ing-display" value="${uiEsc(line.display || '')}" placeholder="2 cups chopped onion" aria-label="Ingredient line ${i + 1}">` : `<div class="ing-text">${uiEsc(line.display || '')}</div>`}
      ${opts.editableDisplay ? `<button class="btn small icon" type="button" data-remove-line="${i}" aria-label="Remove line ${i + 1}" title="Remove">${uiIcon('trash')}</button>` : ''}
    </div>
    <div class="ing-controls">
      <div class="ing-food">
        <input type="search" class="ing-search" value="${uiEsc(food ? (food.short || food.name) : '')}" placeholder="Search foods to link" aria-label="Food for line ${i + 1}" autocomplete="off">
        <ul class="search-results ing-results" hidden></ul>
        ${food ? `<div class="small muted ing-picked">${uiIcon('link')} ${uiEsc(food.name)} <span class="muted">· ${uiEsc(food.group || '')}</span> <button class="btn link small" type="button" data-unlink="${i}">Unlink</button></div>`
        : suggestions.length ? `<div class="ing-suggest"><span class="small muted">Suggestions:</span> ${suggestions.map(s => `<button type="button" class="chip neutral" data-pick="${i}" data-food="${uiEsc(s.id)}" title="${uiEsc(s.name)}">${uiEsc(s.short || s.name)}</button>`).join('')}</div>`
        : '<div class="small muted ing-suggest">Display only until linked.</div>'}
      </div>
      <label class="ing-grams"><span class="visually-hidden">Grams for line ${i + 1}</span><input type="number" class="ing-g" inputmode="decimal" min="0" step="1" value="${line.grams != null ? uiEsc(Math.round(line.grams * 10) / 10) : ''}" placeholder="g" ${food ? '' : 'disabled'}><span class="unit">g</span>${how}</label>
    </div>
  </div>`;
}

export function recipesEdLinesHTML(lines, opts = {}) {
  return `<div class="ing-lines">${lines.map((l, i) => recipesEdLineHTML(l, i, opts)).join('')}${opts.editableDisplay ? `<div class="btn-row"><button class="btn small" type="button" id="ing-add">${uiIcon('plus')}Add an ingredient line</button></div>` : ''}</div>`;
}

export function recipesEdBindLines(container, lines, opts = {}) {
  const redraw = () => { container.querySelector('.ing-lines').outerHTML = recipesEdLinesHTML(lines, opts); recipesEdBindLines(container, lines, opts); if (opts.onChange) opts.onChange(); };
  const pick = (i, foodId) => {
    const food = uiState.foodsById.get(foodId);
    if (!food) return;
    const line = lines[i];
    line.food = foodId;
    const g = recipesEdGramsFor(food, recipesEdParseQuantity(line.display));
    line.grams = g.grams; line.how = g.how;
    redraw();
    const next = container.querySelector(`.ing-line[data-line="${i}"] .ing-g`);
    if (next && (line.grams == null)) next.focus();
  };
  container.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => pick(Number(b.dataset.pick), b.dataset.food)));
  container.querySelectorAll('[data-unlink]').forEach(b => b.addEventListener('click', () => { const l = lines[Number(b.dataset.unlink)]; l.food = null; l.grams = null; l.how = null; redraw(); }));
  container.querySelectorAll('[data-remove-line]').forEach(b => b.addEventListener('click', () => { lines.splice(Number(b.dataset.removeLine), 1); redraw(); }));
  const add = container.querySelector('#ing-add');
  if (add) add.addEventListener('click', () => { lines.push({ display: '', food: null, grams: null, how: null }); redraw(); const last = container.querySelectorAll('.ing-display'); if (last.length) last[last.length - 1].focus(); });
  container.querySelectorAll('.ing-display').forEach(inp => inp.addEventListener('change', () => { const i = Number(inp.closest('.ing-line').dataset.line); lines[i].display = inp.value; if (!lines[i].food) redraw(); }));
  container.querySelectorAll('.ing-g').forEach(inp => inp.addEventListener('input', () => { const i = Number(inp.closest('.ing-line').dataset.line); lines[i].grams = inp.value === '' ? null : Number(inp.value); lines[i].how = 'typed'; const chip = inp.parentElement.querySelector('.chip'); if (chip) chip.remove(); if (opts.onChange) opts.onChange(); }));
  container.querySelectorAll('.ing-search').forEach(inp => {
    const i = Number(inp.closest('.ing-line').dataset.line);
    const list = inp.parentElement.querySelector('.ing-results');
    const draw = () => {
      const q = inp.value.trim();
      const hits = q.length >= 2 ? recipesEdSearchFoods(q) : [];
      list.hidden = !hits.length;
      list.innerHTML = hits.map(f => `<li><button type="button" data-food="${uiEsc(f.id)}"><strong>${uiEsc(f.short || f.name)}</strong><br><span class="small muted">${uiEsc(f.name)} · ${uiEsc(f.group || '')}</span></button></li>`).join('');
      list.querySelectorAll('button').forEach(b => b.addEventListener('click', () => pick(i, b.dataset.food)));
    };
    inp.addEventListener('input', draw);
    inp.addEventListener('focus', () => { if (!lines[i].food) draw(); });
    inp.addEventListener('keydown', e => { if (e.key === 'Escape') { list.hidden = true; } });
  });
}

// Nutrition preview for a set of lines (per serving), computed exactly as the engine will.
export function recipesEdPreview(lines, servings) {
  const r = { servings: Math.max(1, Number(servings) || 1), ingredients: lines.filter(l => l.food).map(l => ({ food: l.food, grams: Number(l.grams) || 0, display: l.display })) };
  if (!r.ingredients.length) return null;
  return recipeTotals(r, uiState.foodsById).perServing;
}
function recipesEdPreviewHTML(lines, servings) {
  const per = recipesEdPreview(lines, servings);
  const linked = lines.filter(l => l.food).length;
  const unlinked = lines.filter(l => !l.food && l.display);
  if (!per) return '<p class="small muted">No line is linked yet, so there is no nutrition to show.</p>';
  return `<p class="small"><strong>Per serving from ${linked} linked line${linked === 1 ? '' : 's'}:</strong> ${uiFmtNum(per.kcal)} kcal · ${uiFmtNum(per.protein_g, 1)} g protein · ${uiFmtNum(per.carb_g, 1)} g carb · ${uiFmtNum(per.fiber_g, 1)} g fiber · ${uiFmtNum(per.sodium_mg)} mg sodium · ${uiFmtNum(per.satfat_g, 1)} g saturated fat</p>
    ${unlinked.length ? `<p class="small muted">Not counted (display only): ${unlinked.map(l => uiEsc(l.display)).join('; ')}.</p>` : ''}`;
}

// ---- Link ingredients sheet ----
// Saves to profile.recipe_links[recipe.id] = [{ food, grams, display }] (unlinked lines keep only display), then refreshes the pool.
export function recipesEdLinkSheet(recipe, opts = {}) {
  const existing = (uiState.profile.recipe_links || {})[recipe.id];
  const src = Array.isArray(existing) && existing.length ? existing : (recipe.ingredients || []);
  const lines = src.map(ing => ({ display: ing.display || (ing.food && uiState.foodsById.get(ing.food) ? uiState.foodsById.get(ing.food).short : ''), food: ing.food && uiState.foodsById.has(ing.food) ? ing.food : null, grams: ing.grams != null ? Number(ing.grams) : null, how: ing.food ? (ing.estimated ? 'estimated' : 'saved') : null }));
  const m = uiModal(`
    <p class="small muted">Match each line to a food so the app can add up its nutrients by grams. Grams come from a stated weight, from the food's own USDA portion, or from a common conversion marked "estimated". Lines you leave unlinked stay display-only; the rest still count.</p>
    ${recipesEdLinesHTML(lines)}
    <div class="notice info plain" id="ing-preview"><div class="notice-head">Preview</div><div class="notice-body">${recipesEdPreviewHTML(lines, recipe.servings)}</div></div>
    <div class="btn-row"><button class="btn primary" type="button" id="ing-save">${uiIcon('check')}Save links</button><button class="btn" type="button" id="ing-cancel">Cancel</button></div>
  `, { title: `Link ingredients: ${recipe.name}`, label: 'Link ingredients', onClose: o => { if (opts.onClose) opts.onClose(o); } });
  if (!m) return;
  const refresh = () => { m.el.querySelector('#ing-preview .notice-body').innerHTML = recipesEdPreviewHTML(lines, recipe.servings); };
  recipesEdBindLines(m.el, lines, { onChange: refresh });
  m.el.querySelector('#ing-cancel').addEventListener('click', () => m.close());
  m.el.querySelector('#ing-save').addEventListener('click', () => {
    const linked = lines.filter(l => l.food);
    if (!linked.length) { uiToast('Link at least one line, or Cancel.'); return; }
    const bad = linked.find(l => !(Number(l.grams) > 0));
    if (bad) { uiToast(`Enter grams for "${bad.display || 'the linked line'}".`); return; }
    uiState.profile.recipe_links = uiState.profile.recipe_links || {};
    uiState.profile.recipe_links[recipe.id] = lines.map(l => l.food ? { food: l.food, grams: Math.round(Number(l.grams) * 10) / 10, display: l.display, ...(l.how === 'estimated' ? { estimated: true } : {}) } : { display: l.display });
    uiPersist();
    if (uiState.refreshRecipes) uiState.refreshRecipes();
    uiToast(`Linked ${linked.length} of ${lines.length} lines. Nutrition is now computed from USDA values.`);
    m.close({ silent: true });
    if (opts.onSaved) opts.onSaved(uiState.recipesById.get(recipe.id) || recipe);
  });
}

// ---- Recipe editor (Mine) ----
const RECIPES_ED_MEALS = [{ value: 'breakfast', label: 'Breakfast' }, { value: 'lunch', label: 'Lunch' }, { value: 'dinner', label: 'Dinner' }, { value: 'snack', label: 'Snack' }];
const RECIPES_ED_EQUIPMENT = [{ value: 'stove', label: 'Stove' }, { value: 'oven', label: 'Oven' }, { value: 'microwave', label: 'Microwave' }, { value: 'air-fryer', label: 'Air fryer' }, { value: 'slow-cooker', label: 'Slow cooker' }, { value: 'pressure-cooker', label: 'Pressure cooker' }, { value: 'blender', label: 'Blender' }, { value: 'none', label: 'No cooking' }];

function recipesEdSlug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'recipe'; }
function recipesEdShortId() { return Math.random().toString(36).slice(2, 7); }

export function recipesEdBlankDraft() {
  return { id: null, name: '', servings: 4, active_min: 20, total_min: 30, skill: 'comfortable', equipment: ['stove'], meal: ['dinner'], leftovers: 'ok', lines: [{ display: '', food: null, grams: null, how: null }], steps: '', notes: '' };
}
// A draft from an existing recipe (edit for Mine, or "Make my own copy" for any recipe).
export function recipesEdDraftFrom(recipe, { copy = false } = {}) {
  const d = recipesEdBlankDraft();
  d.id = copy ? null : recipe.id;
  d.name = copy ? `${recipe.name} (my version)` : recipe.name;
  d.servings = recipe.servings || 4; d.active_min = recipe.active_min || 0; d.total_min = recipe.total_min || 0;
  d.skill = recipe.skill || 'comfortable'; d.equipment = (recipe.equipment || []).slice(); d.meal = (recipe.meal || []).slice(); d.leftovers = recipe.leftovers || 'ok';
  d.lines = (recipe.ingredients || []).map(i => ({ display: i.display || (uiState.foodsById.get(i.food) || {}).short || '', food: i.food && uiState.foodsById.has(i.food) ? i.food : null, grams: i.grams != null ? Number(i.grams) : null, how: i.food ? (i.estimated ? 'estimated' : 'saved') : null }));
  if (!d.lines.length) d.lines.push({ display: '', food: null, grams: null, how: null });
  d.steps = (recipe.steps || []).join('\n');
  d.notes = recipe.notes && recipe.notes.text ? recipe.notes.text : recipe.notes && recipe.notes.sodium_tip ? recipe.notes.sodium_tip : '';
  if (copy && !recipe.custom) d.derived_from = { id: recipe.id, name: recipe.name, source: recipe.source || 'Peace Meal', source_url: recipe.source_url || '', license: recipe.license || '', attribution: recipe.attribution || '' };
  else if (recipe.derived_from) d.derived_from = recipe.derived_from;
  return d;
}

export function recipesEdEditorModal(draft, opts = {}) {
  const d = draft;
  const m = uiModal(`
    ${d.derived_from ? uiNoticeHTML({ level: 'info', text: `Adapted from "${d.derived_from.name}" (${d.derived_from.source}). The copy keeps that attribution${d.derived_from.license ? ` and its licence (${d.derived_from.license})` : ''}.` }) : ''}
    <div class="field"><label for="re-name">Name</label><input id="re-name" type="text" maxlength="80" value="${uiEsc(d.name)}" autocomplete="off"></div>
    <div class="grid-3">
      <div class="field"><label for="re-servings">Servings</label><input id="re-servings" type="number" inputmode="numeric" min="1" max="48" value="${uiEsc(d.servings)}"></div>
      <div class="field"><label for="re-active">Active minutes</label><input id="re-active" type="number" inputmode="numeric" min="0" max="600" value="${uiEsc(d.active_min)}"></div>
      <div class="field"><label for="re-total">Total minutes</label><input id="re-total" type="number" inputmode="numeric" min="0" max="1440" value="${uiEsc(d.total_min)}"></div>
    </div>
    <div class="field"><span class="label">Skill</span>${uiSegmented('re-skill', [{ value: 'beginner', label: 'Beginner' }, { value: 'comfortable', label: 'Comfortable' }, { value: 'confident', label: 'Confident' }], d.skill)}</div>
    <div class="field"><span class="label">Equipment</span>${uiMultiPills('re-equipment', RECIPES_ED_EQUIPMENT, d.equipment)}</div>
    <div class="field"><span class="label">Meal slots</span>${uiMultiPills('re-meal', RECIPES_ED_MEALS, d.meal)}</div>
    <div class="field"><span class="label">Leftovers</span>${uiSegmented('re-leftovers', [{ value: 'good', label: 'Keep well' }, { value: 'ok', label: 'Ok' }, { value: 'poor', label: 'Eat fresh' }], d.leftovers)}</div>
    <div class="field"><span class="label">Ingredients</span><div class="hint">Type each line as you would read it, then link it to a food so it counts. A line with no link stays display-only.</div></div>
    ${recipesEdLinesHTML(d.lines, { editableDisplay: true })}
    <div class="notice info plain" id="re-preview"><div class="notice-head">Nutrition preview</div><div class="notice-body">${recipesEdPreviewHTML(d.lines, d.servings)}</div></div>
    <div class="field"><label for="re-steps">Steps (one per line)</label><textarea id="re-steps" style="min-height:140px" placeholder="Heat the oil.&#10;Add the onion and cook 5 minutes.">${uiEsc(d.steps)}</textarea></div>
    <div class="field"><label for="re-notes">Notes (optional)</label><textarea id="re-notes" style="min-height:70px">${uiEsc(d.notes)}</textarea></div>
    <div class="btn-row"><button class="btn primary" type="button" id="re-save">${uiIcon('check')}${d.id ? 'Save changes' : 'Save to Mine'}</button><button class="btn" type="button" id="re-cancel">Cancel</button></div>
  `, { title: d.id ? 'Edit recipe' : 'New recipe', label: 'Recipe editor', onClose: o => { if (opts.onClose) opts.onClose(o); } });
  if (!m) return;
  const el = m.el;
  const read = () => {
    d.name = el.querySelector('#re-name').value.trim();
    d.servings = Math.max(1, Math.round(Number(el.querySelector('#re-servings').value) || 1));
    d.active_min = Math.max(0, Math.round(Number(el.querySelector('#re-active').value) || 0));
    d.total_min = Math.max(d.active_min, Math.round(Number(el.querySelector('#re-total').value) || 0));
    d.steps = el.querySelector('#re-steps').value;
    d.notes = el.querySelector('#re-notes').value.trim();
  };
  const refresh = () => { read(); el.querySelector('#re-preview .notice-body').innerHTML = recipesEdPreviewHTML(d.lines, d.servings); };
  recipesEdBindLines(el, d.lines, { editableDisplay: true, onChange: refresh });
  el.querySelector('#re-servings').addEventListener('input', refresh);
  el.querySelectorAll('[data-seg="re-skill"]').forEach(r => r.addEventListener('change', () => { d.skill = r.value; el.querySelectorAll('[data-seg="re-skill"]').forEach(x => x.parentElement.classList.toggle('on', x.checked)); }));
  el.querySelectorAll('[data-seg="re-leftovers"]').forEach(r => r.addEventListener('change', () => { d.leftovers = r.value; el.querySelectorAll('[data-seg="re-leftovers"]').forEach(x => x.parentElement.classList.toggle('on', x.checked)); }));
  el.querySelectorAll('[data-multi="re-equipment"]').forEach(c => c.addEventListener('change', () => { d.equipment = [...el.querySelectorAll('[data-multi="re-equipment"]')].filter(x => x.checked).map(x => x.value); c.parentElement.classList.toggle('on', c.checked); }));
  el.querySelectorAll('[data-multi="re-meal"]').forEach(c => c.addEventListener('change', () => { d.meal = [...el.querySelectorAll('[data-multi="re-meal"]')].filter(x => x.checked).map(x => x.value); c.parentElement.classList.toggle('on', c.checked); }));
  el.querySelector('#re-cancel').addEventListener('click', () => m.close());
  el.querySelector('#re-save').addEventListener('click', () => {
    read();
    el.querySelectorAll('.ing-display').forEach(inp => { const i = Number(inp.closest('.ing-line').dataset.line); if (d.lines[i]) d.lines[i].display = inp.value; });
    const lines = d.lines.filter(l => (l.display || '').trim() || l.food);
    if (!d.name) { uiToast('Give the recipe a name.'); el.querySelector('#re-name').focus(); return; }
    if (!lines.length) { uiToast('Add at least one ingredient line.'); return; }
    const bad = lines.find(l => l.food && !(Number(l.grams) > 0));
    if (bad) { uiToast(`Enter grams for "${bad.display || 'the linked line'}".`); return; }
    const steps = d.steps.split(/\r?\n/).map(s => s.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').trim()).filter(Boolean);
    const profile = uiState.profile;
    profile.custom_recipes = profile.custom_recipes || [];
    const prev = d.id ? profile.custom_recipes.find(r => r.id === d.id) : null;
    const rec = {
      id: d.id || `mine-${recipesEdSlug(d.name)}-${recipesEdShortId()}`,
      name: d.name, source: 'Peace Meal', custom: true,
      meal: d.meal.length ? d.meal : ['dinner'], servings: d.servings, active_min: d.active_min, total_min: d.total_min,
      skill: d.skill, equipment: d.equipment.length ? d.equipment : ['none'], assembly_only: !d.equipment.length || (d.equipment.length === 1 && d.equipment[0] === 'none'),
      leftovers: d.leftovers,
      ingredients: lines.map(l => l.food ? { food: l.food, grams: Math.round(Number(l.grams) * 10) / 10, display: l.display || (uiState.foodsById.get(l.food) || {}).short || '', ...(l.how === 'estimated' ? { estimated: true } : {}) } : { display: l.display.trim() }),
      steps, tags: prev && prev.tags ? prev.tags : [], notes: d.notes ? { text: d.notes } : {},
      created: prev && prev.created ? prev.created : new Date().toISOString(), updated: new Date().toISOString()
    };
    if (d.derived_from) rec.derived_from = d.derived_from;
    if (prev) Object.assign(prev, rec); else profile.custom_recipes.push(rec);
    uiPersist();
    if (uiState.refreshRecipes) uiState.refreshRecipes();
    uiToast(prev ? 'Recipe saved.' : `Saved "${rec.name}" to Mine.`);
    m.close({ silent: true });
    if (opts.onSaved) opts.onSaved(uiState.recipesById.get(rec.id) || rec);
  });
}

export function recipesEdDeleteCustom(recipeId) {
  const profile = uiState.profile;
  const r = (profile.custom_recipes || []).find(x => x.id === recipeId);
  if (!r) return false;
  if (!window.confirm(`Delete "${r.name}" from Mine? This cannot be undone.`)) return false;
  profile.custom_recipes = profile.custom_recipes.filter(x => x.id !== recipeId);
  for (const p of profile.people) {
    if (p.favorites && p.favorites.recipes) p.favorites.recipes = p.favorites.recipes.filter(id => id !== recipeId);
    if (p.disliked && p.disliked.recipes) p.disliked.recipes = p.disliked.recipes.filter(id => id !== recipeId);
  }
  uiPersist();
  if (uiState.refreshRecipes) uiState.refreshRecipes();
  uiToast('Deleted.');
  return true;
}

// ---- Paste a recipe ----
const RECIPES_ED_ING_HEAD = /^\s*(?:[#*_\-–]+\s*)?ingredients?\b[\s:*_\-–]*$/i;
const RECIPES_ED_STEP_HEAD = /^\s*(?:[#*_\-–]+\s*)?(?:method|directions?|instructions?|steps?|preparation|procedure|how to make(?: it)?)\b[\s:*_\-–]*$/i;
const RECIPES_ED_OTHER_HEAD = /^\s*(?:[#*_\-–]+\s*)?(?:notes?|tips?|nutrition(?:al)?(?: information)?|equipment|serves?|yield|storage)\b[\s:*_\-–]*$/i;
const RECIPES_ED_QTY_LINE = /^\s*(?:[-*•▢☐]\s*)?(?:\d|[½¼¾⅓⅔⅛⅜⅝⅞]|(?:a|an|one|two|three|four|half|handful|pinch|juice|zest)\b)/i;

export function recipesEdParsePaste(text) {
  const raw = String(text || '').replace(/\r/g, '').split('\n').map(l => l.replace(/\s+$/, ''));
  const lines = raw.map(l => l.trim()).filter(l => l.length);
  const out = { title: '', ingredients: [], steps: [], servings: null, active_min: null, total_min: null };
  if (!lines.length) return out;
  const clean = l => l.replace(/^\s*(?:[-*•▢☐]|\d+[.)]|step\s*\d+[:.)]?)\s*/i, '').trim();
  let i = 0;
  if (!RECIPES_ED_ING_HEAD.test(lines[0]) && !RECIPES_ED_QTY_LINE.test(lines[0]) && lines[0].length <= 90) { out.title = lines[0].replace(/^#+\s*/, ''); i = 1; }
  const whole = lines.join('\n');
  const sv = /(?:serves|servings?|makes|yield)s?\s*:?\s*(\d+)/i.exec(whole) || /(\d+)\s+servings?/i.exec(whole);
  if (sv) out.servings = Number(sv[1]);
  const prep = /(?:prep(?:aration)?|active|hands-on)\s*(?:time)?\s*:?\s*(\d+)\s*(?:min|minutes?|m)\b/i.exec(whole);
  const cook = /(?:cook(?:ing)?)\s*(?:time)?\s*:?\s*(\d+)\s*(?:min|minutes?|m)\b/i.exec(whole);
  const total = /(?:total)\s*(?:time)?\s*:?\s*(\d+)\s*(?:min|minutes?|m)\b/i.exec(whole);
  if (prep) out.active_min = Number(prep[1]);
  if (total) out.total_min = Number(total[1]); else if (prep || cook) out.total_min = (prep ? Number(prep[1]) : 0) + (cook ? Number(cook[1]) : 0);
  const ingHead = lines.findIndex((l, k) => k >= i && RECIPES_ED_ING_HEAD.test(l));
  const stepHead = lines.findIndex((l, k) => k >= i && RECIPES_ED_STEP_HEAD.test(l));
  const isHead = l => RECIPES_ED_ING_HEAD.test(l) || RECIPES_ED_STEP_HEAD.test(l) || RECIPES_ED_OTHER_HEAD.test(l);
  const meta = l => /^(?:serves|servings?|makes|yield|prep|cook|total|time|difficulty|author|by|source|course|cuisine)\b/i.test(l);
  if (ingHead >= 0 || stepHead >= 0) {
    if (ingHead >= 0) for (let k = ingHead + 1; k < lines.length && !isHead(lines[k]); k++) if (!meta(lines[k])) out.ingredients.push(clean(lines[k]));
    if (stepHead >= 0) for (let k = stepHead + 1; k < lines.length && !isHead(lines[k]); k++) if (!meta(lines[k])) out.steps.push(clean(lines[k]));
    if (ingHead < 0) for (let k = i; k < stepHead; k++) if (RECIPES_ED_QTY_LINE.test(lines[k]) && !meta(lines[k])) out.ingredients.push(clean(lines[k]));
    if (stepHead < 0) { const rest = lines.slice(ingHead + 1 + out.ingredients.length); for (const l of rest) if (!isHead(l) && !meta(l) && l.length > 25) out.steps.push(clean(l)); }
  } else {
    // no headings: quantity-led short lines are ingredients; numbered lines or long sentences are steps
    for (let k = i; k < lines.length; k++) {
      const l = lines[k];
      if (meta(l)) continue;
      const numbered = /^\s*(?:\d+[.)]|step\s*\d+)\s+/i.test(l) && l.length > 25;
      if (numbered) out.steps.push(clean(l));
      else if (RECIPES_ED_QTY_LINE.test(l) && l.length <= 90 && !/[.!?]\s+\w/.test(l)) out.ingredients.push(clean(l));
      else if (l.length > 25) out.steps.push(clean(l));
    }
  }
  out.ingredients = out.ingredients.filter(Boolean);
  out.steps = out.steps.filter(Boolean);
  return out;
}

// Paste -> parse -> the food-match sheet for every ingredient line -> the editor prefilled. Nothing is saved until the editor's Save.
export function recipesEdPasteModal(opts = {}) {
  const m = uiModal(`
    <p class="small muted">Paste a whole recipe copied from anywhere: the first line becomes the name, lines with quantities (or under an "Ingredients" heading) become ingredients, and numbered lines (or lines under "Method", "Directions", "Instructions", or "Steps") become steps. You will confirm every ingredient match before anything is saved.</p>
    <div class="field"><label for="rp-text">Recipe text</label><textarea id="rp-text" style="min-height:220px" placeholder="Lentil soup&#10;Ingredients&#10;1 cup red lentils&#10;1 onion, chopped&#10;4 cups water&#10;Method&#10;1. Rinse the lentils.&#10;2. Simmer everything 20 minutes.&#10;3. Blend and serve."></textarea></div>
    <div class="btn-row"><button class="btn primary" type="button" id="rp-parse">${uiIcon('paste')}Read it</button><button class="btn" type="button" id="rp-cancel">Cancel</button></div>
    <div id="rp-result"></div>
  `, { title: 'Paste a recipe', label: 'Paste a recipe', onClose: o => { if (opts.onClose) opts.onClose(o); } });
  if (!m) return;
  const el = m.el;
  el.querySelector('#rp-cancel').addEventListener('click', () => m.close());
  el.querySelector('#rp-parse').addEventListener('click', () => {
    const parsed = recipesEdParsePaste(el.querySelector('#rp-text').value);
    const box = el.querySelector('#rp-result');
    if (!parsed.ingredients.length) { box.innerHTML = uiEmptyState('No ingredient lines were found. Put each ingredient on its own line, starting with a quantity, or add an "Ingredients" heading above them.', '', 'list'); return; }
    box.innerHTML = `<div class="card tight">
      <p><strong>${uiEsc(parsed.title || 'Untitled recipe')}</strong><br><span class="small muted">${parsed.ingredients.length} ingredient line${parsed.ingredients.length === 1 ? '' : 's'}, ${parsed.steps.length} step${parsed.steps.length === 1 ? '' : 's'}${parsed.servings ? `, serves ${parsed.servings}` : ''}${parsed.total_min ? `, ${parsed.total_min} min` : ''}.</span></p>
      <details><summary>What was read</summary><h4>Ingredients</h4><ul class="small">${parsed.ingredients.map(x => `<li>${uiEsc(x)}</li>`).join('')}</ul><h4>Steps</h4><ol class="small">${parsed.steps.map(x => `<li>${uiEsc(x)}</li>`).join('') || '<li class="muted">None found; you can type them in the editor.</li>'}</ol></details>
      <div class="btn-row"><button class="btn primary" type="button" id="rp-match">${uiIcon('link')}Match the ingredients</button></div></div>`;
    box.querySelector('#rp-match').addEventListener('click', () => {
      const lines = parsed.ingredients.map(x => ({ display: x, food: null, grams: null, how: null }));
      recipesEdMatchSheet(parsed, lines, opts);
    });
  });
  el.querySelector('#rp-text').focus();
}

// The same food-match sheet as Link ingredients, for a pasted recipe. Continues into the editor; never saves by itself.
function recipesEdMatchSheet(parsed, lines, opts) {
  const servings = parsed.servings || 4;
  const m = uiModal(`
    <p class="small muted">Confirm a food for each line (or leave it display-only). Nothing is saved yet; the editor comes next.</p>
    ${recipesEdLinesHTML(lines)}
    <div class="notice info plain" id="ing-preview"><div class="notice-head">Preview</div><div class="notice-body">${recipesEdPreviewHTML(lines, servings)}</div></div>
    <div class="btn-row"><button class="btn primary" type="button" id="rm-next">Continue to the editor${uiIcon('arrow-right')}</button><button class="btn" type="button" id="rm-cancel">Cancel</button></div>
  `, { title: `Match ingredients: ${parsed.title || 'pasted recipe'}`, label: 'Match ingredients', onClose: o => { if (opts.onClose) opts.onClose(o); } });
  if (!m) return;
  recipesEdBindLines(m.el, lines, { onChange: () => { m.el.querySelector('#ing-preview .notice-body').innerHTML = recipesEdPreviewHTML(lines, servings); } });
  m.el.querySelector('#rm-cancel').addEventListener('click', () => m.close());
  m.el.querySelector('#rm-next').addEventListener('click', () => {
    const d = recipesEdBlankDraft();
    d.name = parsed.title || '';
    d.servings = servings;
    if (parsed.active_min != null) d.active_min = parsed.active_min;
    if (parsed.total_min != null) d.total_min = Math.max(parsed.total_min, d.active_min);
    d.lines = lines;
    d.steps = parsed.steps.join('\n');
    d.meal = ['dinner'];
    recipesEdEditorModal(d, opts);
  });
}
