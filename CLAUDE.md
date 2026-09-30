# CLAUDE.md (draft, from the September 30, 2026 audit; the owner reviews and merges)

Peace Meal is an offline, single-page nutrition planner. It checks foods and ingredient labels against a person's allergies, conditions, and eating patterns, and plans meals. There is one codebase and two builds. The full build is for a household. The lite build, "Peace Meal for one", is used every day by an older adult on an iPhone. People rely on its answers, so a false PASS (a restricted food shown as fine) is the worst possible bug. The app has no server and no account, and it stores everything in the browser on the device.

## Commands

```
npm run check                      # validate data, run every test, build dist/nutrition-app.html. Must pass before any commit.
npm run validate                   # every rule cites a real source, every tag is declared, every recipe ingredient exists
npm test                           # node --test test/*.test.mjs
node tools/bundle.mjs --lite       # dist/peace-meal-lite.html
node tools/bundle.mjs --pages      # hosted copy: dist/pages/full/ (add --lite for dist/pages/lite/)
npm run serve                      # the module version at http://localhost:8123 (python3 http.server)
npm --prefix audit ci && npm --prefix audit run all   # every audit check (see the top of docs/audit-2026-09-30/REPORT.md)
```

The app itself has no dependencies. Everything that needs packages (ESLint, Stryker, Playwright, axe-core, Lighthouse) lives in `audit/`, with its own `package.json`.

## Hard rules (from the September 2026 fix pass; they still apply)

1. Work on your own branch. Never push to `main`, never force-push, never rewrite git history. The owner reviews and merges.
2. Delete nothing: no functions, rules, recipes, or data. If something looks like it should go, comment it out and flag it.
3. No new network calls, servers, accounts, analytics, or language models. All data stays on the device.
4. No invented clinical numbers or rules. Make a clinical change only where a published source directly supports it. Log the source and the supporting passage in `docs/VERIFY-log.md`.
5. Existing user data must never be lost. Any change to storage keys or the profile shape needs a one-time migration that keeps the old copy, plus a test.
6. This repository is public. Put no real people's details (names, ages, weights, conditions) in code, tests, docs, screenshots, or commit messages. Test people and sample profiles are made up.
7. `npm run validate` and `npm test` must pass.
8. The README's safety rules and sources policy stay as written. No US federal dietary guidance (Dietary Guidelines for Americans, MyPlate, WIC) is cited.
9. Keep the architecture: rules in `data/conditions.json`, ingredient recognition only through `data/dictionaries.json`, every citation through an id in `data/sources.json`.
10. Write the failing test first, then the fix. Never loosen an assertion to make a change pass. Record any test changed on purpose, with the old and new expectation and why.
11. The owner's review point is a plain-language summary at the end: what changed, what was tested, and what is left for them.

## Layout

| Path | What it is |
|---|---|
| `data/conditions.json` | Condition, pattern, and restriction modules: rules (tier 1 or 2), conflicts, phases, education, citations |
| `data/sources.json` | Every citation, by id |
| `data/dictionaries.json` | Ingredient terms to tags: the only way the app recognizes allergens and restricted foods |
| `data/diet-lists.json` | Strict approved and leave-out lists (low FODMAP, low histamine) with portions |
| `data/foods.json` | USDA FoodData Central subset (never edited by hand; `npm run build:foods`) |
| `data/recipes.json`, `data/recipes-open.json`, `data/recipes-usda.json` | Own recipes (ingredients linked to foods; nutrients computed), open-licence collections (NHS, Parent Club, NHLBI, VA, Wikibooks), USDA recipes (off by default) |
| `data/articles.json`, `data/swaps.json` | Learn articles; recipe swaps |
| `src/engine/` | Pure logic: `checker.js` (verdicts), `dictionary.js`, `plan.js` (merges modules, conflicts, Tier 2, phases, pregnancy), `dietlists.js`, `planner.js`, `household.js`, `grocery.js`, `nutrition.js`, `report.js`, `crypto.js` and `sync.js` (claude.ai hosting only) |
| `src/ui/` | One file per screen; `common.js` holds shared helpers; `lite.js` holds the lite Today, Meals, and Report screens |
| `src/store.js`, `src/app.js` | Storage (load, save, migration, backup import and export, Clear data); boot and routing |
| `tools/bundle.mjs` | Joins everything into one HTML file; `--lite` drops Wikibooks and USDA recipes; `--pages` adds the manifest, icons, and the cache-first service worker |
| `tools/validate.mjs`, `tools/import-*.mjs` | Data validator; recipe importers |
| `test/` | Engine and storage tests (`node --test`) |
| `site/index.html` | The hosted front page |
| `.github/workflows/pages.yml` | Checks, then deploys `lite/` and `full/` to GitHub Pages on every push to `main` |
| `docs/` | Phase 1 evidence, Phase 2 architecture, `VERIFY-log.md`, `DATA-REVIEW.md`, audit reports |
| `audit/` | Audit tooling and corpora (its own `package.json`) |

## Storage, in one place

- `peace-meal-full:v1` and `peace-meal-lite:v1`: the whole profile. There is one copy per build.
- `…:migrated`: marks the one-time copy from the older shared keys `peace-meal:v1` and `specialty-nutrition-app:v1`, which are kept.
- `peace-meal:ui`: theme and large text. It is shared by both builds.
- `sn-grocery:<week>`: grocery checkmarks. It is shared by both builds and not in backups.
- Cache Storage `pm-pages-<lite|full>-<commit>`: the offline copy.
- The hosted apps share the origin `mchoisington.github.io` with every other GitHub Pages site on the account (see the audit's shared-origin finding).

## Before calling a change done

- `npm run check` passes.
- New logic has a test that fails without it.
- Built both ways (`--lite` too) when screens or data changed.
- For checker or dictionary changes, run `node --test audit/tests/allergen-corpus.test.mjs` from the repository root after `npm --prefix audit ci`. It holds 745 label lines, and a PASS there that should not be one is a P0.
