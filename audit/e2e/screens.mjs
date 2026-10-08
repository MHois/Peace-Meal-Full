// Shared by the screenshot (item 22), accessibility (items 23-24), and performance scripts: the main screens of each
// build and a made-up household with something on every screen. No real person's details.
export const SCREENS = {
  lite: ['today', 'week', 'recipes', 'report', 'check', 'plan', 'grocery', 'pantry', 'people', 'log', 'breathe', 'learn', 'settings'],
  full: ['home', 'people', 'plan', 'check', 'today', 'week', 'recipes', 'grocery', 'pantry', 'together', 'log', 'breathe', 'learn', 'settings']
};
const today = new Date().toISOString().slice(0, 10);
const STAMP = today + 'T12:00:00.000Z';
const personOf = (id, name, age, modules, allergens) => ({ id, name, adult: true, sex: 'female', age, weight_kg: 68, height_cm: 160, activity: 'light', modules, allergens, allergens_other: [], preferences: { avoid_tags: [], avoid_terms: [], patterns: [] }, variants: {}, flags: {}, optional_rules: [], rule_settings: {}, confirmations: [], custom_modules: [], goals: { calorie_target: 'maintain', deficit: 500 }, manual_kcal: null, favorites: { recipes: [], foods: [] }, disliked: { recipes: [], foods: [] }, servings_by_day: {}, medications: { potassium_retaining: false, insulin_or_su: false, sglt2: false, levothyroxine: false }, pregnancy: false, breastfeeding: false, tier2: {}, phases: {}, modes: {}, acknowledged: [], cooking: { weekday_minutes: 30, weekend_minutes: 45, cook_days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], interest: 'simple', skill: 'comfortable', equipment: ['stove', 'oven', 'microwave'], leftovers: 'ok', household: 1, grocery: 'supermarket', budget: false }, planSeed: 0, setup_complete: true });
export function sampleProfile(build) {
  const people = build === 'lite' ? [personOf('p1', 'Sample Person', 72, ['hypertension', 'celiac'], ['allergen-peanut'])]
    : [personOf('p1', 'Sample A', 45, ['celiac'], ['allergen-milk']), personOf('p2', 'Sample B', 70, ['hypertension', 't2d'], ['allergen-peanut'])];
  return JSON.stringify({
    version: 2, created: STAMP, activePerson: 'p1', people,
    log: [{ id: 'l1', date: today, person: 'p1', meal: 'symptom', recipe: null, name: null, text: null, symptoms: { bloating: 2 }, notes: 'after lunch', at: STAMP, logged_at: STAMP }],
    diary: [{ id: 'd1', date: today, person: 'p1', meal: 'breakfast', kind: 'custom', ref: null, amount: 1, unit: 'serving', grams: null, note: '', name: 'Oatmeal with berries', nutrients: null, no_numbers: true }],
    weights: [{ date: today, person: 'p1', kg: 68 }], exercise: [], pantry: [], grocery_adjustments: {}, grocery_changes: {}, custom_recipes: [],
    recipe_collections: { nhs: true, parentclub: true, nhlbi: true, va: true, wikibooks: true, usda: false, review_dual: true, defaults_v3: true, defaults_v4: true, defaults_v5: true },
    household: { cook: null, cook_by_date: {}, pattern: {}, roster: {}, snacks_per_day: 1, budget: true, seed: 0, day_overrides: {}, meal_overrides: {}, week_snapshot: null },
    last_backup_at: STAMP
  });
}
export const KEY = { lite: 'peace-meal-lite:v1', full: 'peace-meal-full:v1' };
export async function seededPage(ctx, build) {
  await ctx.addInitScript(([k, v]) => { try { if (!sessionStorage.getItem('__seeded')) { sessionStorage.setItem('__seeded', '1'); localStorage.setItem(k, v); localStorage.setItem('peace-meal-lite:home-screen-guide', '1'); localStorage.setItem('peace-meal-full:home-screen-guide', '1'); } } catch { /* ignore */ } }, [KEY[build], sampleProfile(build)]);
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  return page;
}
