# Phase 2: PRD, Architecture, and Data Model
Evidence-Based Specialty Nutrition App
Prepared September 5, 2026

This document turns Phase 1 into a buildable v1. It records the decisions made, the ones the owner delegated, and the reasons. Phase 1 (docs/PHASE-1-evidence-and-regulatory-foundation.md) remains the source of truth for what the app may say and do about any condition. Nothing here loosens it.

## 1. Who this is for and what it must do

Personal wellness tool for the owner and a few family members. Not a commercial product in v1. No registered dietitian involved. Family members' clinicians supply any therapeutic numbers (Tier 2); the app enforces them and never invents them.

The app must:

1. Let each person record conditions, eating patterns, allergens, preferences, medications that change the rules, cooking time and skill, and clinician-provided numbers.
2. Merge the rules for everything that person selected into one plan, show every conflict instead of silently picking a side, and cite the source for every rule.
3. Check a food, ingredient list, or recipe against that plan, with allergens as hard exclusions that no setting can override.
4. Build a week of meals that fit the plan and the person's real cooking time, then produce a grocery list.
5. Track symptoms against meals for the time-limited elimination protocols (low FODMAP, low histamine) and force reintroduction prompts.
6. Screen for disordered eating before any weight-focused or restrictive feature turns on.
7. Explain the evidence honestly, with the rating from Phase 1, in plain language.

## 2. Decisions

| Decision | Choice | Why |
|---|---|---|
| Platform | Single-page progressive web app, static files, no build step | Same shape as the existing Visual Reset page. Runs from GitHub Pages or a local folder. Works offline once loaded. |
| Backend | None | Family health data stays on the device. No accounts, no server, no breach surface. Export and import as a JSON file for backup and moving between devices. |
| Language | Vanilla JavaScript ES modules, no framework | No dependency churn, no build, readable by anyone who opens the file. |
| Rules | Data files (JSON), not code | A clinician can read the rule and its citation without reading JavaScript. The engine is generic; the content is the product. |
| Nutrient data | USDA FoodData Central (SR Legacy and Foundation Foods), imported by script, every food keyed by its FDC ID | Deterministic and traceable. Phase 1 A2 requires this for kidney rules. |
| Language models | None in the app | Phase 1 Part C: the allergen and nutrient paths must never rely on an LLM. There is no LLM anywhere in v1. |
| Tier 2 numbers | Entered by the user from their clinician, stored per person, shown as "clinician-set" | Phase 1 two-tier rule. Without a number, the module runs in Tier 1 only mode with a visible notice. |
| Eating-disorder screen | SCOFF, five items, at onboarding, before weight or elimination features | Phase 1 A9. The owner owns the wording; the shipped text is a placeholder for the owner to replace. |
| Age gate | Adults only. Caregiver mode for a child's confirmed celiac disease or diagnosed food allergies only | Phase 1 D10. |
| Monash FODMAP data | Not used. FODMAP tags come from published studies and carry a "not Monash-verified" notice | Phase 1 stage note. |
| Hosting | GitHub Pages from the main branch | Free, private repo still allows Pages for the owner's account tier to be checked; fallback is opening index.html locally. |

## 3. Architecture

```
index.html            App shell, loads src/app.js as a module
src/
  app.js              Router and top-level state
  engine/
    plan.js           Merges selected modules into a plan; conflict resolution; tier gating
    checker.js        Checks a food, ingredient string, or recipe against a plan
    nutrition.js      Deterministic nutrient math from foods.json
    planner.js        Weekly meal plan generation and recipe scoring
    grocery.js        Grocery list from a plan
    dictionary.js     Ingredient text to tags, using data/dictionaries
    screen.js         SCOFF scoring and feature gating
  ui/                 One module per screen
  store.js            localStorage persistence, export and import
data/
  sources.json        Every citation, keyed by id
  conditions.json     Every condition, pattern, and restriction module with its rules
  dictionaries.json   Ingredient terms to tags (allergens, hidden gluten, added-sugar names, FODMAP subgroups, and so on)
  foods.json          Curated USDA subset with per-100 g nutrients, portions, and tags
  recipes.json        Seed recipes with time, skill, equipment, and ingredient links to foods
tools/
  build-foods.mjs     Imports USDA CSVs into data/foods.json (run by hand; output is committed)
  validate.mjs        Validates every data file against the contracts below and checks that every rule cites a source that exists
test/                 node:test unit tests for the engine
```

The engine never reads free text to decide anything about safety. The dictionary is a maintained list of terms with exact and word-boundary matching. Unknown ingredients are reported as unknown, not assumed safe.

## 4. Data contracts

All files are JSON. IDs are lowercase kebab-case. Every rule has at least one source id that exists in sources.json; tools/validate.mjs fails the build otherwise.

### 4.1 sources.json

```
[
  { "id": "ada-soc-2026", "citation": "ADA. Standards of Care in Diabetes 2026. Diabetes Care 2026;49(Suppl 1).", "type": "guideline", "year": 2026, "url": "" }
]
```
type is one of guideline, consensus, rct, review, cohort, regulation, patient-material, other.

### 4.2 conditions.json

One entry per module. category is condition, pattern, or restriction.

```
{
  "id": "hypertension",
  "name": "Hypertension",
  "category": "condition",
  "phase1_ref": "Part A, 2",
  "evidence": { "rating": "strong", "summary": "..." },
  "sources": ["aha-acc-htn-2025", "dash-1997", "dash-sodium-2001", "ssass-2021"],
  "tier2": [
    { "param": "potassium_mg_min", "label": "Potassium target", "when": "medication.potassium_retaining or condition ckd", "consensus": "3,500 to 5,000 mg/day from food", "why": "..." }
  ],
  "rules": [
    {
      "id": "htn-sodium",
      "kind": "limit",                 // limit | target | avoid | prefer | timing | behavior | info
      "nutrient": "sodium_mg",         // for limit and target
      "op": "<=", "value": 2300, "per": "day",
      "ideal": 1500,                   // optional secondary value
      "tier": 1,
      "strength": "must",              // must | should | may
      "text": "Keep sodium under 2,300 mg a day, ideally under 1,500 mg.",
      "sources": ["aha-acc-htn-2025", "dash-sodium-2001"]
    },
    {
      "id": "htn-pattern",
      "kind": "prefer", "tags": ["vegetable", "fruit", "whole-grain", "legume", "nut", "fish", "low-fat-dairy"],
      "tier": 1, "strength": "should", "text": "...", "sources": ["aha-acc-htn-2025"]
    },
    {
      "id": "htn-avoid-ssb",
      "kind": "avoid", "tags": ["sugar-sweetened-beverage"], "hard": false,
      "tier": 1, "strength": "should", "text": "...", "sources": ["aha-acc-htn-2025"]
    }
  ],
  "conflicts": [
    { "with": "pots", "type": "hard", "param": "sodium_mg", "resolution": "clinician", "text": "..." },
    { "with": "ckd", "type": "hard", "param": "potassium_mg", "resolution": "suppress:hypertension", "text": "..." }
  ],
  "medication_questions": [
    { "id": "potassium_retaining", "text": "Do you take an ACE inhibitor, ARB, spironolactone, or a potassium-sparing diuretic?", "effect": "suppress:htn-potassium" }
  ],
  "phases": null,
  "modes": null,
  "disables": [],
  "education": {
    "plain": "...",
    "evidence": ["..."],
    "contested": ["..."],
    "do_not_claim": ["..."]
  }
}
```

Elimination protocols carry phases:
```
"phases": [
  { "id": "elimination", "label": "Elimination", "min_weeks": 2, "max_weeks": 6, "rules": ["fodmap-elim-avoid"] },
  { "id": "reintroduction", "label": "Reintroduction", "min_weeks": 6, "max_weeks": 8, "rules": ["fodmap-reintro"] },
  { "id": "personalization", "label": "Personalization", "rules": [] }
]
```
Rules listed under a phase apply only while that phase is active. The engine refuses to keep a person in elimination past max_weeks without an acknowledgment and a reintroduction prompt.

Two-mode conditions (IBD) carry modes with an expiry:
```
"modes": [ { "id": "remission", "default": true }, { "id": "flare", "expires_days": 14, "rules": ["ibd-flare-texture"] } ]
```

disables lists feature ids that the module turns off (pregnancy disables weight-loss, keto, low-carb-under-175, intermittent-fasting, and every elimination protocol except allergen and celiac).

### 4.3 Nutrient keys

kcal, protein_g, carb_g, fiber_g, sugar_g, added_sugar_g, fat_g, satfat_g, transfat_g, cholesterol_mg, sodium_mg, potassium_mg, phosphorus_mg, calcium_mg, iron_mg, magnesium_mg, vitamin_c_mg, vitamin_d_iu, vitamin_b12_ug, folate_ug, zinc_mg, iodine_ug, caffeine_mg, alcohol_g, fluid_ml, purine_est (only where a source supports it; otherwise use tags).

USDA does not carry added sugar for SR Legacy foods; added_sugar_g is null unless a label value is entered by the user for a packaged product.

### 4.4 Tags

Tags are the shared vocabulary between rules, dictionaries, foods, and recipes. Each tag is declared once in dictionaries.json with a label, a description, and sources. Rules reference tags; foods and recipes carry tags; dictionary entries map ingredient text to tags. Tag families:

- Allergens: allergen-milk, allergen-egg, allergen-fish, allergen-crustacean, allergen-tree-nut, allergen-peanut, allergen-wheat, allergen-soy, allergen-sesame. Hard exclusions.
- Gluten: gluten, gluten-hidden, oats-regular, oats-certified-gf.
- Soy: soy, soy-refined-oil, soy-lecithin.
- Dairy: lactose-high, lactose-low, lactose-hidden.
- Sugar: added-sugar, sugar-sweetened-beverage, non-nutritive-sweetener.
- FODMAP: fodmap-fructan, fodmap-gos, fodmap-lactose, fodmap-fructose, fodmap-sorbitol, fodmap-mannitol. Each entry may carry a portion note.
- Histamine: histamine-high, histamine-fermented, histamine-aged. Portion and freshness notes.
- Kidney: phosphate-additive, potassium-additive, potassium-high-food.
- Stones: oxalate-high.
- Gout: purine-high, purine-moderate.
- Pregnancy: unpasteurized, raw-animal, deli-meat, mercury-high, mercury-low-fish, raw-sprouts, alcohol, caffeine.
- Pattern: vegetable, fruit, whole-grain, refined-grain, legume, nut, seed, fish, poultry, red-meat, processed-meat, low-fat-dairy, full-fat-dairy, olive-oil, ultra-processed, fried, high-fiber-insoluble, small-particle-friendly, fermented-live-culture.
- Texture (gastroparesis and IBD flare): large-particle, skin-or-seed, raw-vegetable, tough-meat, bezoar-risk.
- Thyroid timing: iron-supplement, calcium-rich, soy, high-fiber, coffee (used only by the levothyroxine timing rule).

### 4.5 foods.json

```
{
  "id": "fdc-171287",
  "fdcId": 171287,
  "dataset": "sr-legacy",
  "name": "Egg, whole, raw, fresh",
  "short": "Egg, whole",
  "group": "Dairy and Egg Products",
  "per100g": { "kcal": 143, "protein_g": 12.56, ... },
  "portions": [ { "label": "1 large", "grams": 50 } ],
  "tags": ["allergen-egg"],
  "tag_notes": {}
}
```
Every number comes from the USDA file. tools/build-foods.mjs writes this file; nobody edits numbers by hand. Tags are assigned by the dictionary plus a curated overrides file (tools/food-tags.json) that is reviewed like any other content.

### 4.6 recipes.json

```
{
  "id": "sheet-pan-salmon-vegetables",
  "name": "Sheet-pan salmon with vegetables",
  "meal": ["dinner"],
  "servings": 4,
  "active_min": 15, "total_min": 35,
  "skill": "beginner",              // beginner | comfortable | confident
  "equipment": ["oven"],            // stove, oven, microwave, air-fryer, slow-cooker, pressure-cooker, blender, none
  "assembly_only": false,
  "leftovers": "good",              // good | ok | poor
  "ingredients": [ { "food": "fdc-175168", "grams": 450, "display": "1 lb salmon fillet" } ],
  "steps": ["..."],
  "tags": ["fish", "vegetable", "olive-oil"],
  "notes": { "sodium_tip": "...", "swaps": [ { "if_tag": "allergen-fish", "then": "..." } ] }
}
```
Nutrients per serving are computed at runtime from foods.json. The recipe file holds no nutrient numbers.

### 4.7 Profile (stored on device)

```
{
  "version": 1,
  "people": [
    {
      "id": "p1", "name": "Sample person", "adult": true,
      "sex": "male", "age": 52, "weight_kg": null, "height_cm": null,
      "modules": ["osteoarthritis", "low-fodmap"],
      "allergens": ["allergen-sesame"],
      "preferences": { "avoid_tags": ["fish"], "avoid_terms": ["olives"], "patterns": [] },
      "medications": { "potassium_retaining": false, "insulin_or_su": false, "sglt2": false, "levothyroxine": false },
      "pregnancy": false, "breastfeeding": false,
      "tier2": { "sodium_mg_max": null },
      "screen": { "scoff": [false,false,false,false,false], "positive": false, "completed_at": null },
      "phases": { "low-fodmap": { "phase": "elimination", "started": "2026-09-05" } },
      "modes": { "ibd": "remission" },
      "acknowledged": [],
      "cooking": {
        "weekday_minutes": 20, "weekend_minutes": 40,
        "cook_days": ["sun","mon","wed","fri"],
        "interest": "simple",        // learn | simple | minimal | assembly
        "skill": "comfortable",
        "equipment": ["stove","oven","microwave"],
        "leftovers": "ok",
        "household": 2,
        "grocery": "supermarket"
      }
    }
  ],
  "log": [ { "date": "2026-09-05", "person": "p1", "meal": "lunch", "recipe": "...", "symptoms": { "bloating": 2 } } ]
}
```

## 5. Engine behavior that must hold

1. **Allergens are absolute.** A hard exclusion cannot be overridden by any preference, mode, or acknowledgment. The checker reports a hard fail for an allergen match and for an unknown ingredient when an allergen is selected.
2. **Hard conflicts stop the number, not the plan.** Hypertension plus POTS: no sodium limit is generated; the conflict is shown; the rest of the plan still builds.
3. **Tier 2 without a number means Tier 1 only, with a notice.** The notice names the parameter that was not applied.
4. **Elimination phases expire.** Past max_weeks the app prompts reintroduction and requires acknowledgment to continue.
5. **Positive eating-disorder screen disables** calorie targets, weight-loss plans, and new elimination protocols, and shows the referral language. Allergen and celiac rules stay on.
6. **Pregnancy disables** everything Phase 1 D1 lists.
7. **Multiple simultaneous eliminations trigger a restriction-load check-in.** Three or more of: low FODMAP, low histamine, gluten-free (non-celiac), dairy-free (non-allergy), low-carb.
8. **Every displayed rule shows its citation** and evidence rating on tap.
9. **Numbers never come from text.** Nutrients are summed from foods.json by grams.
10. **Unknown is not safe.** Unmatched ingredient text is reported as "not recognized" and never counted as passing.

## 6. Out of scope for v1

Barcode scanning, restaurant lookup, glucose or blood pressure device integration, clinician login (B1 clinician link is a Stage 2 item; v1 uses manual Tier 2 entry), pediatric anything beyond caregiver allergen and celiac mode, dialysis fluid math beyond a clinician-entered limit.

## 7. Open items carried from Phase 1

Seven VERIFY flags remain in Phase 1. None blocks v1 because none is encoded as a numeric rule; the GLP-1 protein range is shown as a range with its flag. They are listed in docs/VERIFY-log.md and should be cleared before the numbers are trusted. (September 30, 2026: all nine items in the log were checked; eight are closed, and only the ADA consensus report item stays open until a new report is published. The GLP-1 protein target is now the advisory's 80 to 120 g a day.)


## 8. Wave 2 (September 9, 2026)

Scope changes: removed migraine, CRPS, POTS, non-celiac gluten-free, and the eating-disorder screen; added rheumatoid arthritis, chronic constipation, osteoarthritis, type 1 diabetes, diverticular disease, DASH, Portfolio diet, time-restricted eating, and a pescatarian variant.

New engine modules: `energy.js` (Mifflin-St Jeor, activity factors, MET table, unit conversion), `group.js` (group plans, profile sharing), `pantry.js` (what can I make), grocery adjustments and change log in `grocery.js`, budget overlap and per-day eaters in `planner.js`, user-defined patterns in `plan.js`.

New screens: Today (diary, calorie target, favorites, weight, exercise), Pantry, Together (group planning, guests, sharing). Grocery gains editing and a change log; Learn gains full articles from `data/articles.json`.

Profile schema v2 (see `src/store.js`): weight and height are stored in kg and cm, entered in lb and ft/in; `diary`, `weights`, `exercise`, `pantry`, `grocery_adjustments`, `grocery_changes` live on the profile; `custom_modules`, `goals`, `favorites`, `servings_by_day`, `setup_complete` live on the person. `migrate()` fills new fields on load.

## 9. Wave 3 (September 9, 2026)

Meal slots. Recipes carry a `meal` list; `component` is a new value for sauces, dressings, stocks, doughs, spice mixes, and dips. Components stay in the library (Recipes filter "Sauces and basics") and are never scheduled into any slot. Classification lives in `tools/lib/meal-components.mjs` (title head-noun rules with handling for "X and Y", "X with Y", "X on Y", and parenthetical English descriptions of foreign names). Both importers apply it on the way in; `tools/fix-meal-slots.mjs` re-tags the files on disk and is idempotent. The same pass drops desserts and party food that a source filed under breakfast. Why: 334 basics were being scheduled as lunches and dinners, and a plain hummus was landing in breakfast because the Wikibooks page carries a "Breakfast recipes" category.

Snacks. `planner.js` builds each day from `daySlots(person, plan)`: breakfast, morning snack, lunch, afternoon snack, dinner, evening snack, with the snack slots chosen by `snackPlan()`. Defaults come from the plan's modules and cite their rules: gestational diabetes gets an afternoon and a bedtime snack (gdm-carb: three meals and two to three snacks), reflux gets morning and afternoon and never an evening snack (gerd-small-meals), gastroparesis, GLP-1 users, and cancer treatment get two (gp-small-meals, wm-glp1-meals, ca-tx-symptoms), children get two, everyone else gets one afternoon snack. `cooking.snacks_per_day` (0 to 3) overrides the count; the reflux rule still removes the evening slot. Snack slots take recipes tagged `snack`, never leftovers, never batch-cooked, and are held to a 15 minute window.

Per-day cooking, this week only. A day's cooking chip and minutes on the Week screen change that one date, for the week on screen, and never the standing weekday/weekend answers on the Cooking step. Storage: `person.week_overrides = { start, days: { 'YYYY-MM-DD': { can_cook, minutes } }, snacks_per_day }`, dropped when the week rolls. `buildWeekPlan` takes `dayOverrides` and `snacksPerDay`. Before anything moves, `mealFits()` lists the meals on that day that no longer fit the new time; a sheet previews the re-picks (`repickSlots()`, which scores only the named slots against the rest of the week and never mutates it) with the day's kcal and sodium before and after, and offers three choices: re-pick just this day, regenerate the whole week (swaps kept), or keep everything as is (the misfits stay, marked). After a day-only change the week on screen is frozen in `person.week_snapshot` and laid back over every rebuild, so no other day drifts through leftovers or variety scoring. Regenerate (a new seed) or a rolled week drops the snapshot. The snacks dropdown on the Week screen works the same way, this week only; the Cooking step's snack answer is the standing one. (v1.6 briefly stored Week-screen minutes per weekday in `cooking.day_minutes`; `migrate()` removes it.)

Spice. `src/engine/spice.js` estimates a heat level (0 none, 1 mild, 2 medium, 3 hot) from the title and ingredient text with three term tiers, a faint tier that only counts in pairs (curry powder, paprika), a zero tier that never counts (black pepper, ginger), and adjustments for "optional", a pinch, sweet chili sauce, and "chile-free". Three medium ingredients add up to hot. `preferences.spice` is one of any, none, mild, medium, hot: recipes above the level are excluded from the week, Recipes (with a "hidden by your settings" link), Pantry, and swaps; recipes inside the level get a small score nudge. The estimate and the terms that drove it are shown on the recipe.

Welcome. The first screen no longer uses the word "rule"; it lists who the app is for and what it does.

## 10. Household week (September 10, 2026)

One shared week for the whole table, on the Together screen, planned seating by seating. A seating is one meal on one day and the people rostered for it. `src/engine/household.js`:

- **Roster.** `profile.household.pattern[personId][day][slot] = false` marks a person's usual absences (one person out Tuesday and Thursday dinner); `household.roster[date][slot] = [ids]` is a per-date exception and wins. Guests are out unless rostered in. `rosterFor()` resolves both.
- **Seating plan.** Each distinct set of eaters gets the strictest combined plan (`buildGroupPlan`) and a synthetic person (`seatingPerson`): every allergen, every soft avoid and avoid word, the strictest spice level, every skipped cuisine, everyone's favorites and never-agains, and the cook's kitchen. Recipes are checked once per seating and cached (`makeSeatingCache`), so a week with four combinations checks each recipe four times, not thirty.
- **Cook.** `household.cook` (per-date `cook_by_date` wins; first adult by default) supplies time, cooking days, skill, and equipment. Seatings with only children are assembly-only and never cook.
- **Servings** equal the number of eaters at the seating; batch cooking makes leftovers that later seatings can use when the dish clears every eater there. Snacks are a household setting (`snacks_per_day`, default one afternoon snack). `budget` (default on) rewards ingredient overlap across the whole week.
- **Changes.** The first view after Plan or Regenerate is frozen in `household.week_snapshot`. Roster taps mark affected meals stale ("Update just those N meals" re-picks only them, `householdRepick`); a day's cooking chip or minutes goes through the same three-choice preview as the Week screen; swaps are `meal_overrides['date:slot']` on top. Cook, snacks, and budget changes rebuild the base. Per-date data is pruned when the week rolls.
- **Grocery.** The Grocery screen has a "List for" select: a person's week or the household week (`grocery_for = 'household'`), with the same edits, ticks, and change log keyed to a `household` pseudo-person. **Today** gains "Add from the household plan", which logs only the meals the person was rostered for.

Known simplification: daily nutrient limits are checked per seating against the day's running total of household meals, not per person; a person's own Week and Today screens remain the place where their own daily numbers are tracked.

## 11. Onboarding flow (September 10, 2026)

Steps, in order: Basics, Allergies, Conditions and diets, Likes and dislikes, Medications (only when a ticked condition asks one), Numbers from your doctor (only when a ticked condition needs one), Cooking (three short screens), Review. Each step carries a one-line purpose under the progress bar. The four descriptive modules from the source document (food allergies, medical avoidances, preference avoidances, the age gate) never appear as choices: allergies are set on their own step and turn the allergy module on; the avoidance notes live on the Learn screen. The Conditions picker pins the person's selections (with their options) at the top, offers search, and folds the rest into two groups, Medical conditions (open) and Ways of eating (collapsed), with the evidence chip beside each name and a two-line summary. The general yes/no questions (pregnancy, "your doctor has said losing weight would help") sit on Basics. The custom diet builder folds under Likes and dislikes. The More menu is grouped: Plan and cook, Track, Learn and settings. Home shows a Household week action when there is more than one person.

## 12. Goals, GLP-1, and Peace Meal for one (September 10, 2026)

**Goals.** `goals.calorie_target` is off, maintain, loss, gain, or manual. Gain adds `goals.surplus` (300 to 500 kcal, default 400) to maintenance in `energyTarget`, cites the ESPEN geriatrics guideline (Volkert 2022) for the older-adult note, defaults the week to two snacks, and nudges the planner toward energy-dense meals (+5 at 400 kcal a serving, +10 at 550). Loss is unchanged (500 to 750 deficit, 1,200 floor).

**GLP-1.** A global flag `glp1` on Basics turns on the weight-management module with its new `glp1` variant: the GLP-1 rules (smaller meals, protein first, fluids, fiber, micronutrients, screening, maintenance) apply; the deficit and target rules (`variant: loss`) do not. Ticking the module yourself keeps the `loss` variant by default.

**Peace Meal for one** is the same repository built with `node tools/bundle.mjs --lite` to `dist/peace-meal-lite.html` (about 4 MB: Peace Meal's own recipes plus the NHS set; no Wikibooks, no USDA). The bundler sets `window.__PEACE_MEAL_LITE__`, and `src/app.js` switches to four tabs (Today, Meals, Recipes, Report) with the rest under More. `src/ui/lite.js` holds the one-person Today (planned meal per slot with "I ate this" and "Something else", a symptom sheet with severity, time, note, and custom symptoms, "Feeling fine today", weight) and the doctor report; `src/engine/report.js` does the counting (episodes, what was eaten in the 24 hours before each, foods ranked by how many episodes they preceded against how often they were eaten, weight trend, day list with a symptoms-only option). Symptom entries are log entries with `meal: 'symptom'`, an `at` timestamp, and a `symptoms` map; "feeling fine" days are `fine: true` with no symptoms. The Week screen hides cooking chips and minutes in lite; People shows one profile and no invitations. The report prints (print CSS keeps only the sheet) and saves as a self-contained HTML file for email.

**Label photos.** Check gains "Photo of the label": Tesseract (open-source OCR) loaded from cdnjs on first use, text lands in the box for the person to correct before checking. Works in the downloaded build with internet; the claude.ai sandbox blocks the download, and the status line says to use the phone camera's own text copy instead.

## 13. Phases have no end date (September 10, 2026)

Elimination phases (low FODMAP, the low-histamine trial) used to expire at the protocol's maximum weeks with a blocking notice. They no longer end on their own: a phase stays until the person moves it, and the protocol's suggested length (2 to 6 weeks, 4 to 6 weeks) is shown as information on the Plan screen's phase card. An optional check-in reminder (`person.phases[module].check_in_weeks`, with `check_in_from` renewed each time the person answers "keep going") raises a warning notice and a card prompt every N weeks asking whether to keep going or move to the next phase; nothing changes until the person chooses. The restriction-load notice and the "time-limited" conflict statuses remain as information.

## 14. Audit fixes (September 29, 2026)

An outside audit found safety gaps. The fixes, phase by phase:

**Unrecognized is never safe (checker.js).** `planRestricts(plan, person)` is true when the person has an allergen, the plan has an avoid rule from a condition, pattern, or allergy (a personal preference alone does not count), or a daily or per-meal limit. While it is true, unrecognized text and unknown-kind terms ("tortilla", "natural flavors") make a label, a typed dish, or a recipe a caution, never a pass. An unknown-kind term is settled when a longer dictionary entry that names the kind matched the same words ("corn tortilla"); its may-contain list still asks for a label check. The Check screen never says "Nothing in the plan flags this" when something was not recognized; the lite build reads "Not sure. Ask before eating." The noise-word list (dictionary.js) gained container, size, cut, and preparation words ("1 Medium Sized", "deseeded", "1 Tin") so they are not reported as unknown foods; a segment is skipped only when every word in it is noise.

**Strict lists on labels (checker.js, dietlists.js).** `checkText` applies the approved-food lists to each piece of an ingredient statement, the same way `checkRecipe` does. `approvedFor` checks the person's own lists, then the family's leave-out examples (`avoid_examples`, matched on the words as written, singular or plural, with an optional `unless` pattern), then the approved list, so "leftover roast chicken" is leftovers, not chicken. For recipes the leave-out examples are checked on the recipe's own wording, not on the linked USDA name.

**Swap amounts (swaps.js).** For a recipe without linked foods, a swap's amount ("same amount", "a small handful per onion") is stored in `amount_text` beside the display text instead of inside it, so it is shown but never checked.

**Validator.** `tools/validate.mjs` now checks the approved-food lists and the swap list: every cited source exists in `data/sources.json`, and every pattern compiles.

**Stock and jarred foods (phase 2).** Shop stock, broth, and stock cubes ask a gluten label check; the Check screen says "Check the label for gluten" and lists what can carry it. On the low histamine list, shop stocks, bouillon, and gravy mixes are leave-out examples unless the text names a quick or homemade vegetable stock (the homemade meat-stock exception was dropped on September 30, owner question 6; VERIFY-log A17); "jarred", "in brine", and "brined" carry the vinegar tag, and a jar in a strict low histamine check is a leave-out example. The tomato swap reads "fresh-roasted red bell pepper". A piece of a label that is only an amount still meets the leave-out examples, so "1 jar (7 ounces) roasted red peppers" keeps its jar.

**Phone data safety (phase 3).** Storage keys are per build: `peace-meal-lite:v1` and `peace-meal-full:v1` (`src/store.js`). The first launch after the update copies the old shared key `peace-meal:v1` (or the older `specialty-nutrition-app:v1`), reads the copy back to verify it, records `<key>:migrated`, and leaves the old key in place; if the copy fails, the build keeps using the old key and tries again next launch. Clear all data removes the old shared key only when the other build no longer needs it. A failed save raises a banner that stays until a save works (Try again, Send a backup); the app asks the browser for persistent storage where offered. A reminder on lite Today and on Home comes up 30 days after the last backup (or after first use) and opens the same share sheet; "Remind me in a week" snoozes it. On an iPhone or iPad Safari tab (hosted copy only) a one-time full-screen guide explains Add to Home Screen and moving data: Save a backup in the tab, then "Bring my data" on the Home Screen app's first screen (same backup file). Lite Today: every logged meal and symptom has a large Remove button with ten seconds to undo; symptoms can be logged for just now, earlier today, or yesterday; "Feeling fine today" saves once a day and then reads "Noted"; large text is on by default in the lite build until the person changes it. The page grid no longer lets the top bar push the page wider than a phone screen.

**Service workers and outside files (phase 4).** Both service workers (`sw.js` at the root and the one `tools/bundle.mjs --pages` writes for `/lite/` and `/full/`) are cache first: the stored copy opens at once, with or without a connection. A new version installs in the background (its files fetched with `cache: 'reload'`, so never an older copy from the browser's HTTP cache) and waits; the app shows "Update ready, tap to reload" and the tap switches to it. `test/sw.test.mjs` runs both workers in a stand-in and checks that the root worker's lists cover every file. The label photo reader pins Tesseract 5.1.1 (script and worker from cdnjs), tesseract.js-core 5.1.1, and the English data package 1.0.0 (both from jsDelivr) to SHA-384 hashes: the script through its integrity attribute, the rest through `fetch(url, { integrity })`; Tesseract gets local copies and fetches nothing itself. Google Fonts cannot be pinned (the stylesheet differs by browser; font files requested from a stylesheet cannot carry a hash) and is flagged in `index.html`. September 30, 2026 (owner question 14): the fonts now ship with the app instead (`src/fonts/`, SIL Open Font License 1.1, notices and licence in `src/fonts/fonts.css`); `tools/bundle.mjs` inlines them as data URIs, about 0.27 MB, so no request goes to Google. The photo reader stays a pinned download on first use: bundling it would take the lite file from about 5 MB to about 20 MB.

**Portions and evidence (phase 5).** A diet family in `data/diet-lists.json` can carry a `stacking` block (low FODMAP does). For a plan that restricts that family, `portionCheck` and `portionCheckText` in `src/engine/dietlists.js` list each food the family's list allows only in a limited amount (`portionNotes`: the list's own portion and note) and return `smallServe` when one meal has `caution_at` or more foods marked with the block's `marker` ("small serve"); the checker turns that into a caution. Matching uses the family's approved list, most specific wording first ("corn tortillas" is not "corn"), and an item's `portion_except` wordings ("corn oil") get no note. Approval itself is unchanged. The recipe cards, recipe detail ("Portions"), and the Check screen show the notes. On the low histamine list every item and leave-out example carries `basis` (measured histamine, other amines, proposed liberator, or SIGHI rating only), `basis_note`, and `basis_sources`, explained by the family's `basis_legend`; the Approved foods screen shows them. The validator checks both.

**Medicines and food (phase 5; approved September 30).** The plain-language education for `medication-food-interactions` was drafted in `docs/DRAFT-medication-food-education.md` with its sources; the owner approved it, and it is now the module's `education` and article (VERIFY-log A13 to A16). Before approval it was not in the app.

**Label photo (phase 5).** The Check screen says plainly that the first photo needs Wi-Fi (the reader, about 7 MB, is downloaded once and kept by the browser; `checkOcrNote` in `src/ui/check.js`).

**Wikibooks recipes read on the first search (phase 5).** The full single-file build puts the 2,268 Wikibooks recipes in a `<script type="application/json" id="pm-deferred-wikibooks">` block that the browser does not run, and records a summary in `window.__APP_DATA__.deferred`. `appLoadDeferred` in `src/app.js` reads the block the first time someone searches recipes (the Recipes search box or Wikibooks filter, the Today search, the Pantry match), when the Week switch for recipes without nutrition numbers is turned on, or at launch when saved data needs them (a saved week, diary entry, favorite, or ingredient link names one, or a person allows recipes without numbers). The recipes go back after the recipe named in `after`, so the order, and every week plan, is the same as before. Counts on Settings, Learn, Recipes, and Week include the recipes not read yet. The lite build has no Wikibooks recipes and is unchanged; the folder version (`npm run serve`) still loads everything.

**USDA recipes read only when switched on (fix pass of September 30, 2026, P2-14).** The full single-file build also puts the 1,043 USDA MyPlate Kitchen recipes in a `<script type="application/json" id="pm-deferred-usda">` block, summarized in `window.__APP_DATA__.deferred.usda`. The collection is off by default. `appLoadDeferredUsda` in `src/app.js` reads the block when the collection is on: at launch, or when it is switched on in Settings (which calls `refreshRecipes`). The recipes go back at the end of the recipe order, where they were, so every week plan is the same. Settings counts them before they are read. The page is no smaller to download (the recipes are still inside it), but launch no longer parses them. The lite build has none.

**Recipes without nutrition numbers and daily limits (phase 6).** Checked with the full recipe set for people with a sodium limit (hypertension), sodium and carbohydrate plans (type 2 diabetes), and fat limits (high cholesterol): a default week never includes a recipe without nutrition numbers (0 of 112 planned meals over four weeks each; `test/audit-2026-09.test.mjs` item 14 keeps it that way). Such recipes do reach the week when the person hearts one or turns on the Week switch "Also use recipes that have no nutrition numbers" (for example 12 and 2 of 112 meals for the sodium-limited person), and the household planner follows the cook's switch the same way. Leaving them out for anyone with a daily limit even then is the conservative option; it waits for the owner's decision and is not built.

**Thirty recipes for both diets, off until reviewed (phase 7).** `tools/gen-diet-recipes.mjs` writes 15 breakfasts and 15 dinners written for low FODMAP and low histamine at the same time, each with `collection: "review_dual"`. A recipe's collection is its own `collection` field or, as before, its source (`appCollectionOf` in `src/app.js`); `review_dual` was off by default (`src/store.js`, `src/app.js`) and switched on in Settings, Recipe collections. September 30, 2026: reviewed at the owner's direction and switched on by default; profiles saved earlier are switched on once (`defaults_v5` in `src/app.js`), and turning the collection off afterwards sticks. The six fish recipes and the steak recipe gained a freshness first step from the SIGHI leaflet (VERIFY-log A24). Every ingredient links to a food already in `data/foods.json` and is on both approved lists; the generator stops if any of the thirty fails low FODMAP, low histamine, or both together with strict mode on. They leave out every item the low histamine list marks "not re-checked", foods the SIGHI leaflet rates risky or to avoid even where the list allows them (minced meat, black pepper, rice and oat milk, canned food), batch baking that would mean leftovers, and more than one "small serve" food per recipe. Recipe cards show "new, for review".

**A plain-words why above each number (phase 7, dietitian review).** Every limit and target rule in `data/conditions.json` carries `why`: one sentence copied word for word from the module's own article or education. The validator fails a `why` that is not found verbatim there, so no new clinical wording can enter this way. The Plan shows it under each number and at the top of the number's "Why" sheet.

**Ten common conditions first (phase 7, dietitian review).** A person who has not finished setup sees `onboarding_common` (at first the first ten medical conditions in `data/conditions.json`; since September 30, 2026, owner question 11, ten conditions common in adults where food does much of the work: high blood pressure, high cholesterol, weight, type 2 diabetes, fatty liver, reflux, chronic kidney disease, IBS on low FODMAP, lactose intolerance, and celiac disease) first on the Conditions step, with every other condition and way of eating listed right below them, already open (owner request, September 30, 2026; before that the rest sat behind a "Show all" button); search always covers everything, and a person who finished setup sees every group expanded as before. The printable one-page plan was already built (Plan, Print) and prints on one page.
