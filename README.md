# Peace Meal

A personal, evidence-based nutrition planner for a household where people have different medical conditions, allergies, eating patterns, and amounts of time to cook. Every rule the app applies cites its source. The app never invents a therapeutic number: if a guideline says a clinician must set it, the app asks for that number and applies it as given.

This is a personal tool for one family. It is not a medical device and does not diagnose or treat anything. See `docs/PHASE-1-evidence-and-regulatory-foundation.md` for the evidence behind every module and `docs/PHASE-2-prd-and-architecture.md` for how the app is built.

## Two builds

`node tools/bundle.mjs` builds the full app (`dist/nutrition-app.html`); its 2,268 Wikibooks recipes ride along in the same file and are read the first time someone searches recipes, which keeps launch fast. `node tools/bundle.mjs --lite` builds Peace Meal for one (`dist/peace-meal-lite.html`): one person, four tabs (Today, Meals, Recipes, Report), same engine and conditions, smaller recipe set.

## Run it

No install, no build, no server, no account.

- **Single file:** open `dist/nutrition-app.html` in any browser, including on a phone. Everything is inside that one file. Save it to your home screen and it works offline.
- **From the folder:** `npm run serve` then open http://localhost:8123. This mode also registers the offline service worker, which serves its stored copy first: after editing files, change `VERSION` in `sw.js` (or use the browser's "Update on reload") to see the edits.
- **GitHub Pages:** each push to `main` runs the checks and, when Pages is on for the repository (Settings, Pages, Source: GitHub Actions), publishes a small site: a front page (`site/index.html`), the full app at `/full/`, and Peace Meal for one at `/lite/`. Nothing else from the repository is published.
- **The only site on its address:** every GitHub Pages site of one account (here, mchoisington.github.io) shares one web origin, and a page from any of them can read and change what Peace Meal saves on a phone. Publish no other Pages site on this account, or move Peace Meal to its own domain. The service worker refuses a saved copy of the app that another page changed (fix of September 30, 2026, audit finding P1-4), but it cannot protect the saved data itself.

All data stays in the browser on that device. Use Settings to export a backup file and import it on another device.

## What is inside

| Path | What it is |
|---|---|
| `data/conditions.json` | Every condition, pattern, and restriction module: rules, tiers, conflicts, phases, education, citations |
| `data/sources.json` | The citation for every source id used anywhere |
| `data/dictionaries.json` | Ingredient terms to tags. This is the only thing the app uses to recognize allergens and restricted foods |
| `data/foods.json` | Curated USDA FoodData Central subset. Numbers come from USDA files by FDC ID and are never edited by hand |
| `data/recipes.json` | Seed recipes with time, skill, equipment, and ingredient links to foods. Nutrients are computed, not stored |
| `src/engine/` | The deterministic rules engine, checker, planner, household week, and grocery builder |
| `src/ui/` | Screens |
| `tools/` | USDA importer, recipe importers, meal-slot fixer, validator, single-file bundler |
| `test/` | Engine tests |
| `docs/` | Phase 1 evidence, Phase 2 architecture, VERIFY log, audit report, iPhone guides |
| `site/` | The website's front page, which links to the two apps |

## Working on it

```
npm test            # engine tests
npm run validate    # every rule cites a real source, every tag is declared, every recipe ingredient exists
npm run build:foods # regenerate data/foods.json from the USDA CSVs in tools/usda/ (download first; see tools/build-foods.mjs)
npm run bundle      # write dist/nutrition-app.html
```

Content changes go in `data/`. Run `npm run validate` after any edit. The validator fails on a rule without a source, an undeclared tag, or a recipe that stores nutrient numbers.

## Sources policy

Rules cite professional-society guidelines, randomized trials, systematic reviews, and consensus statements. No US federal dietary guidance (Dietary Guidelines for Americans, MyPlate, WIC materials) is cited, by the owner's decision. Nutrient values come from USDA FoodData Central, which is laboratory food-composition measurement, not dietary advice; FDA allergen and gluten-free labeling rules are cited as law, not as recommendations.

## Safety rules the code enforces

1. Allergens are absolute. No preference, mode, or acknowledgment overrides them.
2. Hard conflicts (for example hypertension and POTS on sodium) stop the number, not the plan. The app shows the conflict and asks for a clinician's number.
3. Tier 2 numbers are never generated. Without one, the module runs in Tier 1 only, with a visible notice.
4. Elimination phases expire. The app prompts reintroduction and requires acknowledgment to continue past the maximum.
5. A positive eating-disorder screen turns off calorie targets, weight-loss plans, and new elimination protocols. Allergen and celiac rules stay on.
6. Pregnancy disables weight loss, ketogenic and very low carbohydrate patterns, intermittent fasting, and every elimination protocol except allergen and celiac rules.
7. Ingredient text the dictionary does not recognize is reported as not recognized. It is never counted as safe.
8. There is no language model in the app.
