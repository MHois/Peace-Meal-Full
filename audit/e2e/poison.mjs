// A backup file an attacker could hand someone ("here is my meal plan, import it"): a valid profile in which every text
// field carries a script payload that records its own field name when it runs. Structural values stay valid in the
// first variant so every screen renders; the second variant also poisons dates, ids, and numbers.
export const hook = f => `"><img src=x onerror="__xss('${f}')">`;
export const svg = f => `<svg onload="__xss('${f}')"></svg>`;

export function poisonedProfile({ structural = false } = {}) {
  const P = hook;
  const d = (f, ok) => structural ? P(f) : ok;             // structural fields poisoned only in the second variant
  // The person id stays plain: the setup screens are reached by #/people/<id>/<step>, so a poisoned id would hide them.
  // (A poisoned id was tried separately on the list screens, where it is always escaped.)
  const pid = 'p1';
  const today = new Date().toISOString().slice(0, 10);
  const person = {
    id: pid, name: 'Ann ' + P('person.name'), adult: true, sex: 'female', age: d('person.age', 70), weight_kg: d('person.weight_kg', 70), height_cm: d('person.height_cm', 165), activity: 'light',
    modules: ['celiac', 'hypertension', 'ibs-low-fodmap'], allergens: ['allergen-peanut'], allergens_other: ['kiwi ' + P('allergens_other')],
    preferences: { avoid_tags: [], avoid_terms: ['olive ' + P('avoid_terms')], patterns: [] },
    variants: {}, flags: {}, optional_rules: [], rule_settings: {}, confirmations: [], acknowledged: [],
    custom_modules: [{ id: 'cm1', name: 'My diet ' + P('custom_modules.name'), summary: P('custom_modules.summary'), avoid_tags: ['added-sugar'], prefer_tags: [], limits: {}, targets: {}, notes: P('custom_modules.notes') }],
    custom_symptoms: ['itch ' + P('custom_symptoms')],
    goals: { calorie_target: 'maintain', deficit: 500 }, manual_kcal: null,
    favorites: { recipes: ['mine-x'], foods: [] }, disliked: { recipes: [], foods: [] }, servings_by_day: {},
    medications: { potassium_retaining: false, insulin_or_su: false, sglt2: false, levothyroxine: false },
    pregnancy: false, breastfeeding: false, tier2: { sodium_mg_max: d('tier2', 1500) }, phases: {}, modes: {},
    cooking: { weekday_minutes: 20, weekend_minutes: 40, cook_days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], interest: 'simple', skill: 'comfortable', equipment: ['stove', 'oven', 'microwave'], leftovers: 'ok', household: 1, grocery: 'supermarket', budget: false },
    planSeed: 0, setup_complete: true, week_note: P('person.week_note')
  };
  const recipe = {
    id: 'mine-x', name: 'Soup ' + P('custom_recipes.name'), source: 'Peace Meal ' + P('custom_recipes.source'), custom: true,
    source_url: 'javascript:__xss(\'custom_recipes.source_url\')', attribution: P('custom_recipes.attribution'), license: P('custom_recipes.license'),
    meal: ['lunch', 'dinner'], servings: 2, active_min: 10, total_min: 20, skill: 'beginner', equipment: ['stove'], assembly_only: false, leftovers: 'good',
    ingredients: [{ display: 'rice ' + P('custom_recipes.ingredient') }, { display: 'carrots' }], steps: ['Boil ' + P('custom_recipes.step')], tags: [],
    notes: { text: P('custom_recipes.notes'), sodium_tip: P('custom_recipes.sodium_tip') }, summary: P('custom_recipes.summary'), serving_size_text: P('custom_recipes.serving_size_text'), created: today, updated: today
  };
  // Prototype pollution probes: "__proto__" keys as JSON.parse creates them (own properties, as in a file on disk).
  const proto = () => JSON.parse('{"__proto__": {"polluted": "yes"}, "constructor": {"prototype": {"polluted2": "yes"}}}');
  person.tier2 = Object.assign(proto(), person.tier2);
  person.rule_settings = proto();
  return {
    version: 2, people: [person], activePerson: pid, created: today,
    log: [
      { id: 'l1', date: d('log.date', today), person: pid, meal: structural ? P('log.meal') : 'lunch', recipe: 'mine-x', name: 'Soup ' + P('log.name'), text: 'bread ' + P('log.text'), symptoms: { bloating: 2, ['custom:itch ' + P('log.symptom_key')]: 1 }, notes: P('log.notes'), at: new Date().toISOString(), logged_at: new Date().toISOString() }
    ],
    diary: [
      { id: 'd1', date: d('diary.date', today), person: pid, meal: structural ? P('diary.meal') : 'lunch', kind: 'custom', ref: null, amount: 1, unit: 'serving', grams: null, note: P('diary.note'), name: 'Toast ' + P('diary.name'), nutrients: null, no_numbers: true },
      { id: 'd2', date: today, person: pid, meal: 'dinner', kind: 'recipe', ref: 'mine-x', amount: 1, unit: 'serving', grams: null, note: '', name: '' }
    ],
    weights: [{ date: d('weights.date', today), person: pid, kg: d('weights.kg', 70), note: P('weights.note') }],
    exercise: [{ id: 'x1', date: today, person: pid, activity: 'manual', name: 'Walk ' + P('exercise.name'), minutes: null, kcal: 100 }],
    pantry: [{ id: 'pt1', name: 'flour ' + P('pantry.name'), food: null, added: today }],
    grocery_adjustments: proto(), grocery_changes: proto(),
    custom_recipes: [recipe],
    recipe_collections: { nhs: true, parentclub: true, nhlbi: true, va: true, wikibooks: true, usda: false, review_dual: true, defaults_v3: true, defaults_v4: true, defaults_v5: true },
    household: { cook: null, cook_by_date: proto(), pattern: proto(), roster: proto(), snacks_per_day: 1, budget: true, seed: 0, day_overrides: proto(), meal_overrides: proto(), week_snapshot: null },
    last_backup_at: today
  };
}
