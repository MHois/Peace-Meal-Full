# Recipe sources and attribution

This page lists every outside recipe collection imported into `data/recipes-open.json`, the licence each one carries, the exact attribution wording the licence requires, what nutrition data each source provides, and the import counts. The importer is `tools/import-open-recipes.mjs`; fetched pages are cached under `tools/open-recipes/` (not committed). Parent Club (`tools/import-parentclub.mjs`) and the NHLBI (`tools/import-nhlbi.mjs`) are described on the app's Sources page (Learn, Sources). Two collections are US federal publications, the NHLBI and the VA (section 3): they are recipes, not dietary guidance, and no rule cites them.

Last import: 2026-09-09. File size: 4.00 MB (budget 4 MB). Total recipes: 2457.

## 1. NHS website (United Kingdom)

**Information from the NHS website is licensed under the Open Government Licence v3.0.**

- Source: NHS "Healthier Families" recipes, https://www.nhs.uk/healthier-families/recipes/ (index page and its breakfast, lunch, dinner, puddings-and-snacks, lunchbox, and BBQ collections; the site map was checked for other recipe pages under the same path).
- Licence: Open Government Licence v3.0, https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/
- Attribution line stored on every recipe (`attribution` field) and shown wherever the recipe is displayed: `Contains public sector information licensed under the Open Government Licence v3.0`
- robots.txt: fetched first (`tools/open-recipes/nhs-robots.txt`). The `User-agent: *` group does not disallow `/healthier-families/recipes/`, so the crawl went ahead. Every imported NHS recipe was checked again against the disallow list at verification time; 0 page(s) were blocked.
- Recipe ids: `nhs-<page-slug>`; `source_url` is the page the text came from.
- Nutrition data: the NHS pages publish per-serving energy (kJ/kcal), protein, carbohydrate (with sugars), fat (with saturates), fibre, and salt. These are stored as-is in `nutrition_per_serving` (`kcal`, `protein_g`, `carb_g`, `sugar_g`, `fat_g`, `satfat_g`, `fiber_g`, plus `salt_g` as published) with `nutrition_source: "nhs-website"`. **Sodium is not published by the NHS; it is computed as salt grams x 400 mg** and each recipe carries `conversion_note: "sodium computed from salt at 400 mg per gram"`. Values the page does not state are `null`. Numbers are copied from the page, not recomputed; where a page's own figures are internally inconsistent the importer logs it and keeps the published value.
- Text is adapted: headings, tips, and layout were removed; ingredient lines and method steps are stored as display text. Times come from the page's stated prep and cook times where present (`times_estimated: true` otherwise).
- Counts: 203 pages fetched, 196 recipe pages found, **189 recipes imported** (188 with stated times, 1 estimated).

## 2. Wikibooks Cookbook (worldwide, community written)

- Source: the Wikibooks Cookbook, https://en.wikibooks.org/wiki/Cookbook:Table_of_Contents, read through the MediaWiki API (`https://en.wikibooks.org/w/api.php`): members of `Category:Recipes`, `Category:Incomplete recipes`, and `Category:Featured recipes` in the `Cookbook:` namespace, with wikitext and category links fetched in batches of 50. No HTML was scraped.
- Licence: Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0), https://creativecommons.org/licenses/by-sa/4.0/. Wikibooks text is also available under CC BY-SA 3.0 for older revisions; we attribute under 4.0, the current site licence.
- Attribution stored on every recipe (`attribution` field), with the recipe title, "from the Wikibooks Cookbook", the page URL, and the licence with its link. Example: `"20-Minute Beef Stroganoff" from the Wikibooks Cookbook, https://en.wikibooks.org/wiki/Cookbook:20-Minute_Beef_Stroganoff, licensed under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/)`
- ShareAlike: the recipe text (ingredients and steps) is redistributed by this app under the same licence, CC BY-SA 4.0. Anyone who copies the Wikibooks recipes out of this app must keep that attribution and licence.
- Recipe ids: `wb-<title-slug>`; `source_url` is the Cookbook page.
- Fields taken from the page: the recipe summary template (category or cuisine, servings, time, difficulty), the ingredients list (bulleted or table), the procedure, and the page's category links (`wikibooks_categories`, which include cuisine, course, and diet categories such as vegan or gluten-free). Difficulty 1-2 maps to `beginner`, 3 to `comfortable`, 4-5 to `confident`; where the page states no difficulty the skill is estimated from the step count (`skill_estimated: true`). Where no time is stated it is estimated from the steps (`times_estimated: true`); where no servings value is stated it is set to 4 with `servings_estimated: true`. Recipes in `Category:Featured recipes` carry `featured: true`.
- Excluded: ingredient articles, techniques, disambiguation and index pages (no ingredients list or no procedure), cocktails and other alcoholic drinks, candy and confectionery, pages with fewer than 3 ingredients or fewer than 2 steps, titles containing "test", "template", or "sandbox", and pages whose procedure is not in English.
- **Nutrition data: none.** The Wikibooks Cookbook does not publish nutrition figures, and this app never derives numbers from text. Wikibooks recipes therefore have no `nutrition_per_serving` and no `nutrition_source`, and the app shows "nutrition not available" for them until a person links each ingredient to a food in the recipe editor, after which nutrients are computed from `foods.json` by grams like any other recipe.
- Counts: 3812 candidate pages listed, 3535 passed the filters, 1267 dropped to stay under the size budget (recipes without a stated servings value first, then the longest step text), **2268 recipes imported** (1202 with stated times, 1066 estimated; 1421 with a stated servings value; 2177 with a stated difficulty; 40 featured). Skipped by reason: few-ingredients 86, cocktail-or-candy 84, few-steps 64, no-procedure 25, disambiguation 12, no-ingredients 4, non-english 1, title-filter 1.

## 3. VA Healthy Teaching Kitchen (US Department of Veterans Affairs)

**"Pursuant to federal law, government-produced materials appearing on this and other VA websites are not copyright protected."** (VA copyright policy, https://department.va.gov/copyright-policy/, read September 30, 2026; 17 U.S.C. section 105.)

- Source: https://www.nutrition.va.gov/NUTRITION/Recipes.asp and its category pages (54 listing pages). Each recipe is a one-page PDF card. Importer: `tools/import-va.mjs` (needs `pdfjs-dist`, installed outside `package.json`; see the file's header). PDFs are cached under `tools/open-recipes/va/` (not committed).
- robots.txt: nutrition.va.gov has none (HTTP 404), which permits crawling.
- Attribution stored on every recipe: `Recipe from the VA Healthy Teaching Kitchen, Nutrition and Food Services, U.S. Department of Veterans Affairs, nutrition.va.gov. Not copyright protected as a work of the United States Government.` No personal names are stored.
- Left out: every card that says it was "Adapted from" another source (50 cards: magazines, cooking websites, cookbooks), because such a card is not government-produced throughout; cards listed twice on the site (imported once); cards whose title is already in another collection; and, at the owner's request, six titles most US home cooks would not recognize by name (a tagine, calabacitas, two shakshukas, a kohlrabi dish, and a romesco sauce); and three cards that make an ingredient or a condiment rather than a dish (homemade ricotta, pico de gallo, and quick-pickled onions), which the planner would otherwise schedule as a lunch or dinner.
- Recipe ids: `va-<title-slug>`; `source_url` is the PDF.
- Nutrition data: each card prints calories, total fat, saturated fat, sodium, total carbohydrate, dietary fiber, and protein per serving (a few add sugars). Stored as-is with `nutrition_source: "va"`; the serving size is kept as `serving_size_text`. Cholesterol and potassium are not published and are left blank.
- The card's "Recipe Notes" are kept in `notes.text`. Meal slots come from the site's section (Breakfast, Main Dishes, Sides, Snacks, Desserts, Beverages, Dressings and Sauces) and then pass the same component check as every other collection; five cards whose section gave the wrong slot are set by hand in the importer.
- Counts (September 30, 2026): 309 PDF links, 210 recipes imported.

## How the app uses these recipes

- Ingredients are display-only (`{ "display": "..." }`, no `food` link, no grams). The dictionary tags ingredient text at run time for allergen and diet checks, and anything unrecognised is reported as such, never treated as safe.
- NHS, NHLBI, Parent Club, and VA recipes show the stored per-serving nutrition (`recipeTotals` in `src/engine/nutrition.js` uses it when a recipe has `nutrition_source` and `nutrition_per_serving` and no linked foods).
- Wikibooks recipes show no nutrition until ingredients are linked in the editor.
- `tags` is empty on every imported recipe because the tag vocabulary is controlled; tags are added by hand or by the dictionary at run time.
