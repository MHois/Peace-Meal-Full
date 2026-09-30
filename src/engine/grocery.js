// Grocery list from a week plan: sums grams per food across cooked meals, converts to portions when a natural portion exists.
export function buildGroceryList(week, recipesById, foodsById) {
  const need = new Map(); // foodId -> {grams, uses:[recipe names]}
  for (const day of week.days) {
    for (const m of day.meals) {
      if (!m.recipe || m.source === 'leftover') continue;
      const r = recipesById.get(m.recipe);
      if (!r) continue;
      const factor = (m.servingsMade || m.servings || r.servings) / (r.servings || 1);
      for (const ing of r.ingredients || []) {
        // Ingredients that link to a food are summed in grams. Text-only ingredients (imported or pasted recipes whose
        // lines are not linked yet) are listed by name with the recipe's own wording, since amounts cannot be summed.
        const key = ing.food ? ing.food : 'text:' + groceryTextKey(ing.display);
        if (!ing.food && !groceryTextKey(ing.display)) continue;
        const cur = need.get(key) || { grams: 0, uses: new Set(), displays: new Set(), textOnly: !ing.food, lines: [] };
        cur.grams += (Number(ing.grams) || 0) * factor;
        cur.uses.add(r.name);
        if (ing.display) cur.displays.add(ing.display);
        const shown = ing.display && ing.amount_text ? `${ing.display}, ${ing.amount_text}` : ing.display;
        if (!ing.food && ing.display) cur.lines.push(factor !== 1 ? `${shown} (x${Math.round(factor * 10) / 10} for ${r.name})` : `${shown} (${r.name})`);
        need.set(key, cur);
      }
    }
  }
  const items = [];
  for (const [foodId, v] of need) {
    if (v.textOnly) {
      items.push({ food: foodId, name: groceryTextName(foodId.slice(5)), group: 'From recipe text (check amounts)', grams: 0, quantity: v.lines.join('; '), uses: [...v.uses], displays: [...v.displays], tags: [], textOnly: true });
      continue;
    }
    const food = foodsById.get(foodId);
    const name = food ? (food.short || food.name) : foodId;
    const group = food ? food.group : 'Other';
    const portion = food && food.portions ? food.portions.find(p => p.grams && p.grams !== 100 && !/^100 g$/.test(p.label)) : null;
    let quantity = `${Math.round(v.grams)} g`;
    if (portion) {
      const n = v.grams / portion.grams;
      quantity = `${roundNice(n)} x ${portion.label} (${Math.round(v.grams)} g)`;
    }
    items.push({ food: foodId, name, group, grams: Math.round(v.grams), quantity, uses: [...v.uses], displays: [...v.displays], tags: food ? food.tags : [] });
  }
  items.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  const groups = {};
  for (const it of items) (groups[it.group] ||= []).push(it);
  return { items, groups };
}
// Strip quantities, units, and prep words from an ingredient line so "2 cups chopped onion" and "1 onion, diced" share a key.
const GROCERY_NOISE = /\b(\d+[\d\/.,½¼¾⅓⅔-]*|cups?|tbsps?|tablespoons?|tsps?|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|l|litres?|liters?|cans?|jars?|packages?|pkg|cloves?|slices?|pieces?|pinch|dash|handful|large|medium|small|extra|about|approx\w*|to taste|optional|fresh|frozen|canned|dried|dry|chopped|diced|minced|sliced|cubed|shredded|grated|crushed|rinsed|drained|cooked|raw|peeled|seeded|halved|quartered|trimmed|thawed|softened|melted|divided|packed|heaping|level|thinly|thickly|finely|coarsely|roughly|plus|or|of|and|for|the|a|an)\b/gi;
export function groceryTextKey(display) {
  return String(display || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/\b\d[\d\/.,½¼¾⅓⅔-]*\s*(g|kg|ml|l|oz|lbs?|cups?|tbsps?|tsps?)\b/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(GROCERY_NOISE, ' ').replace(/\s+/g, ' ').trim().replace(/s\b/g, '');
}
function groceryTextName(key) { return key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Ingredient'; }
function roundNice(n) { if (n < 1) return Math.max(0.25, Math.round(n * 4) / 4); if (n < 10) return Math.round(n * 2) / 2; return Math.round(n); }

// Apply the shopper's edits to a computed list and record what changed and why.
// adjustments: { [foodId]: { quantity?: string, grams?: number, note?: string, removed?: boolean } }
export function applyAdjustments(list, adjustments = {}) {
  const items = list.items.map(it => {
    const adj = adjustments[it.food];
    if (!adj) return it;
    return { ...it, adjusted: true, quantity: adj.quantity || it.quantity, grams: adj.grams != null ? adj.grams : it.grams, note: adj.note || '', removed: !!adj.removed, original: { quantity: it.quantity, grams: it.grams } };
  });
  const groups = {};
  for (const it of items) (groups[it.group] ||= []).push(it);
  return { items, groups };
}

// Differences between two computed lists (for example after adding a serving to a meal). Each change carries a reason.
export function diffGrocery(prev, next, reason = 'Plan changed') {
  const changes = [];
  const prevBy = new Map((prev ? prev.items : []).map(i => [i.food, i]));
  const nextBy = new Map((next ? next.items : []).map(i => [i.food, i]));
  for (const [food, n] of nextBy) {
    const p = prevBy.get(food);
    if (!p) changes.push({ food, name: n.name, type: 'added', from: null, to: n.quantity, reason });
    else if (Math.abs((p.grams || 0) - (n.grams || 0)) >= 5) changes.push({ food, name: n.name, type: 'changed', from: p.quantity, to: n.quantity, reason });
  }
  for (const [food, p] of prevBy) if (!nextBy.has(food)) changes.push({ food, name: p.name, type: 'removed', from: p.quantity, to: null, reason });
  return changes;
}

// Plain-text rendering for copy, share sheets, and notes apps.
export function groceryText(list, { title = 'Grocery list', changes = [] } = {}) {
  const lines = [title, ''];
  for (const [group, items] of Object.entries(list.groups)) {
    lines.push(group.toUpperCase());
    for (const it of items) if (!it.removed) lines.push(`${it.checked ? '[x]' : '[ ]'} ${it.name}: ${it.quantity}${it.note ? ' (' + it.note + ')' : ''}`);
    lines.push('');
  }
  if (changes.length) { lines.push('CHANGES'); for (const c of changes) lines.push(`- ${c.name}: ${c.type} ${c.from ? 'from ' + c.from + ' ' : ''}${c.to ? 'to ' + c.to : ''}. ${c.reason}`); }
  return lines.join('\n');
}
