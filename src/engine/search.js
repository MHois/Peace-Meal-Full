// Search for the "Add to a meal" sheet (Today). Foods and recipes are ranked and capped separately, closest match
// first, so a common word ("banana", "rice", "egg") still shows plain foods instead of forty recipes that merely
// contain the word. Favorites always come first.

const searchEscape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Lower is closer: the exact name, then a name that starts with the search, then one where every word starts a word,
// then any name that contains the words. Shorter names come first within a tier ("Banana" before "Banana bread").
export function searchRank(name, words) {
  if (!words || !words.length) return 0;
  const n = String(name || '').toLowerCase(), s = words.join(' ');
  const tier = n === s ? 0 : n.startsWith(s) ? 1 : words.every(w => new RegExp('(^|[^a-z0-9])' + searchEscape(w)).test(n)) ? 2 : 3;
  return tier * 1000 + Math.min(n.length, 999);
}

// items: [{ kind: 'food' | 'recipe', name, fav }]. Returns the closest foods and recipes and how many matched in all.
export function searchGroupMatches(items, words, caps = {}) {
  const cap = { food: caps.food ?? 15, recipe: caps.recipe ?? 25 };
  const ranked = items.map((it, i) => ({ it, r: searchRank(it.name, words), i }));
  ranked.sort((a, b) => Number(!!b.it.fav) - Number(!!a.it.fav) || a.r - b.r || a.i - b.i);
  const foods = ranked.filter(x => x.it.kind === 'food').map(x => x.it);
  const recipes = ranked.filter(x => x.it.kind === 'recipe').map(x => x.it);
  return { foods: foods.slice(0, cap.food), recipes: recipes.slice(0, cap.recipe), totalFoods: foods.length, totalRecipes: recipes.length };
}
