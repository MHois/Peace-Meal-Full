# Peace Meal architecture, on one page

Audited commit `2a88538` (main, September 30, 2026). I read this map from the code. Line numbers point to the files at that commit.

## Two builds, one codebase

| | Full ("Peace Meal") | Lite ("Peace Meal for one") |
|---|---|---|
| Command | `node tools/bundle.mjs` | `node tools/bundle.mjs --lite` |
| Output | `dist/nutrition-app.html`, 12,103,383 bytes | `dist/peace-meal-lite.html`, 5,847,582 bytes |
| Hosted copy | `--pages`: `dist/pages/full/` (index.html, manifest, icons, sw.js), served at `/Peace-Meal-Full/full/` | `--pages`: `dist/pages/lite/`, served at `/Peace-Meal-Full/lite/` |
| Code | Every file in `src/engine/`, then `src/store.js`, every file in `src/ui/`, then `src/app.js`. The bundler strips `import` and `export` and joins them into one script (`tools/bundle.mjs:15-23, 111`). | The same code. `window.__PEACE_MEAL_LITE__ = true` switches the screens (four tabs) and the storage key. |
| Recipes | Own 193 + open 2,916 (NHS 189, Parent Club 197, NHLBI 52, VA 210, Wikibooks 2,268) + USDA 1,043 (off by default). The Wikibooks recipes ship as a JSON block the page does not run, and are read on the first recipe search (`bundle.mjs:38-58`). | Own 193 + open 648 (Wikibooks removed, `bundle.mjs:36`); USDA emptied (`bundle.mjs:37`). |

Both builds carry every data file: `sources` (157), `conditions` (43 modules, 273 rules), `dictionaries` (1,619 terms, 89 tags), `diet-lists`, `foods` (2,143 USDA foods), `articles` (43), `swaps` (26 swaps, 2 diet families), and `breathe.html`, which is inlined as text. The fonts are inlined as data: URIs (`bundle.mjs:66-70`).

## Modules

- **Engine (`src/engine/`, 19 files):**
  - `dictionary.js`: ingredient text to tags; unknown text is reported.
  - `checker.js`: pass, caution, or fail for a label, food, or recipe.
  - `plan.js`: merges modules, conflicts, Tier 2, phases, pregnancy gates.
  - `dietlists.js`: strict approved lists and portions.
  - `planner.js`: week plans.
  - `household.js` and `group.js`: shared meals.
  - `swaps.js`: adapted recipes.
  - `nutrition.js` and `energy.js`: nutrition math.
  - `grocery.js`, `pantry.js`, `report.js` (doctor report), `search.js`, `spice.js`, `cuisine.js`.
  - `screen.js`: SCOFF. Not shown since September 9.
  - `crypto.js` and `sync.js`: encrypted sharing, active only when hosted inside claude.ai.
- **UI (`src/ui/`, 22 files):** one file per screen, plus `common.js` (helpers, modal, save alert, preferences). `lite.js` holds the lite Today, Meals, and Report screens. `check.js` is the label checker and photo reader.
- **`src/app.js`:** boot, routing, loading data (`window.__APP_DATA__` in a bundle, otherwise `fetch('data/*.json')`, line 51), recipe collections, and the service-worker update prompt.
- **`src/store.js`:** load, save, the one-time migration, backup export and import, and Clear data.

## Where user data is read and written (all in the browser)

| Store | Key | Written by | Read by | Notes |
|---|---|---|---|---|
| localStorage | `peace-meal-full:v1` / `peace-meal-lite:v1` | `store.js` `save` (line 103), through `uiPersist` (`common.js:61`) | `store.js` `load` (line 74) | The whole profile as one JSON string: people, conditions, allergies, medicines, log, diary, weights, pantry, recipes. |
| localStorage | `<key>:migrated` | `store.js:46, 128` | `store.js:27` | Marks the one-time copy from the legacy key. |
| localStorage | `peace-meal:v1`, `specialty-nutrition-app:v1` (legacy) | Not written | `store.js:28` | Copied once. Removed by Clear data only when the other build no longer needs it (`store.js:131`). |
| localStorage | `peace-meal:ui` | `common.js:678` | `common.js:673` | Theme and large text. **Shared by both builds.** |
| localStorage | `sn-grocery:<week>` | `grocery.js:15` | `grocery.js:12` | Grocery checkmarks. **Shared by both builds, and not in the backup.** |
| localStorage | `peace-meal-{lite,full}:home-screen-guide` | `install.js:79` | `install.js:34` | Records that the Home Screen guide was shown. |
| localStorage | `peace-meal:device` | `sync.js:23, 143`, `settings.js:127` | `sync.js:15` | Hosted mode only. The device key pair, including the private key, in plain text. |
| Cache Storage | `pm-pages-full-<sha>` / `pm-pages-lite-<sha>` | `dist/pages/*/sw.js` | Same | The offline copy of the page, manifest, and icons. |
| File | Backup JSON | `store.js:111` `exportJSON`, shared through `uiDownload` | `store.js:115` `importJSON` (Settings; "Move my data") | The profile only; grocery checkmarks and UI preferences are not included. |

## Every place the app touches the network

1. **Service worker** (hosted copies only, `bundle.mjs:118-131`): same-origin GET requests, answered from the cache first. The first install fetches the page, manifest, and icons.
2. **Data files over HTTP**: `app.js:51`, only when the app is run from the source folder (`npm run serve`), never from a bundle.
3. **Photo label reader**, the first time a photo is read (`check.js:15-19, 27-39`):
   - tesseract.js 5.1.1 script and worker from cdnjs.cloudflare.com
   - the recognition core (plain and SIMD) from cdn.jsdelivr.net
   - English data from cdn.jsdelivr.net

   Every file is pinned with a SHA-384 integrity hash. The photo itself is read on the device and never sent anywhere.
4. **Links** the person taps: sources, licences, recipe pages, and the breathe page's citations. Nothing loads until tapped.
5. **Hosted inside claude.ai only** (`window.claude` present; never on GitHub Pages):
   - `window.claude.use('db')`: the shared store (`sync.js`). It holds device public keys, an owner record, a **directory of person names and initials in plain text**, encrypted profiles, and encrypted shares that list the sender's device name and the person's name in plain text.
   - `window.claude.use('downloads')` (`common.js:380`).
   - `window.claude.use('sample')` (`people.js:826`).
6. **Nothing else.** There is no analytics, no font request (fonts are bundled), no image from another site, and no language model.
