# Data review queue

Items the build agents flagged for a human decision. Nothing here blocks use of the app; each is a place where a judgment was made conservatively and a reviewer (the owner, or a person's own clinician) may want to confirm or relax it. Where a file holds the detail, the field name is given.

## Rules (data/conditions.json)

- **Inferred conflicts.** Phase 1 names the sodium conflict for POTS against hypertension and CKD. The same clinician-resolution conflict was added for POTS against heart failure, dialysis, and kidney stones (all sodium under 2,300 mg), and protein conflicts for CKD against cancer treatment and osteoporosis. Each carries `"inferred": true`. Remove any you consider over-reach.
- **IBD flare mode expiry** is 14 days. That is an app default for the check-in prompt, not a clinical number (`modes[].expires_days`).
- **Restriction-load threshold** is three simultaneous eliminations (`eds-restriction-load.threshold`).
- **Engine wiring edits** made after the content was written are listed in the file's top-level `notes` and in each module's `review_note`: variants for higher-protein-older-adult, cancer-nutrition and low-carb-ketogenic; `applies_if` on osteoporosis calcium and vitamin D and on heart-failure fluid; the `flags` catalog; two rules (`wm-deficit`, `veg-b12`) reclassified from numeric targets to habits because the app cannot measure them.
- **Eating-disorder screen wording** in `src/engine/screen.js` is a placeholder. The owner writes the final language.

## Ingredient dictionary (data/dictionaries.json)

- `unsure` (42 terms): terms considered for a tag and left out. Mostly FODMAP portion cases that exist only in the Monash app, polyols without a tag, sauces that sometimes contain gluten, and histamine "liberator" foods.
- `not_tagged` (18): recognized terms deliberately left without tags.
- **Tree-nut list.** FDA's January 2025 allergen guidance (Edition 5, Table 1) lists 12 tree nuts; coconut, chestnut, and ten others were removed. Coconut and chestnut keep the tree-nut tag here on purpose, as a safety margin: the tag is a hard stop, and the app has no hard way for one person to add a single food (checked September 30, 2026; VERIFY-log item 8). Heartnut, which is on FDA's list, was added.
- **Trigger tags** (chocolate, citrus, tomato, spicy, carbonated, mint, msg, aspartame) exist only to drive optional toggles for GERD and migraine. They are never default exclusions.
- **basic-ingredient** marks pantry words as recognized so they are not reported as unknown. It carries no restriction meaning.

## Food database (data/foods.json, tools/food-selection.json)

- `tag_review` (137 entries across 97 foods): tags the importer was unsure about (FODMAP portion cases, mid-tier mercury fish, histamine on cultured dairy, phosphate additives in processed meats, coconut).
- **fill_from judgment calls.** 161 Foundation foods fill missing nutrients from a matched SR Legacy record; every filled key is listed under `fill_from.keys`. The matches a reviewer should look at (each has a `fill_note` naming the alternative): 2646174 chuck roast, 2646173 top round, 2646168 pork loin, 746781 chorizo, 2261420 almond flour, 2261421 oat flour, 2346397 steel-cut oats, 2003587 spelt flour, 2684443 shrimp, 2684446 pasteurized crab, 2647439 American cheese singles, 2259795 parmesan, 749420 bacon, 2644285 / 2644287 / 2644292 canned beans, and the tomato substitutions 321360, 1999634, 333281, 2685578.
- **Fiber method.** Classic total dietary fiber (nutrient 1079) is used everywhere it exists, from the primary record or its fill record. The AOAC 2011.25 value (2033) counts resistant starch and runs higher on every food that has both; it is used only as a labeled last resort and currently applies to no food.
- **Remaining nulls:** fiber for oat milk, farro, shrimp; saturated fat for shiitake and a handful of SR Legacy items. `added_sugar_g` is null for every food; USDA does not publish it.
- **No USDA portion** for 135 foods (100 g only). Recipes give grams directly, so this only affects the food search display and grocery quantities.

## Sources (data/sources.json)

- **Sources nothing cites (audit P3-1, checked October 1, 2026).** 29 of the sources are cited by no rule, article, dictionary entry, diet list, or swap. All are kept; the owner can remove any. `test/audit-fix-p3-1-uncited-sources.test.mjs` fails if a new source is added without being cited.
  - Conditions removed on September 9, 2026: POTS (`hrs-pots-2015`, `ccs-pots-2020`, `vernino-pots-2021`, `garland-2021`, `nct05924646`, `pen-pots-2023`), CRPS (`crps-sr-2025`, `zhu-crps-2024`, `vitamin-c-crps-2021`, `rsdsa-budapest`), migraine (`ahs-ihs-materials`, `ramsden-2021`), and non-celiac gluten sensitivity (`skodje-2018`, `biesiekierski-2013`, `catassi-2017`, `lebwohl-2017`).
  - The Phase 1 regulatory research, not app content: `fda-cds-2026`, `fda-whoop-warning-2025`, `fda-tempo-pilot-2025`, `colorado-hb25-1220`, `michigan-mnt-licensure-2026`, `california-bpc-2586`.
  - The eating-disorder screen, not shown since September 9: `scoff-questionnaire`, `national-alliance-eating-disorders`.
  - Others: `ajh-dash-delivery-2026` (product design for cooking time), `ainsworth-compendium-2011` (activity values), `glim-2019` (malnutrition criteria).
  - Cited from code, not data: `mifflin-1990` (`src/engine/energy.js`), and `user-defined`, which stands for a rule the person or their clinician enters (`src/engine/plan.js`, `src/ui/plan.js`, `src/ui/common.js`).

## Diet lists (data/diet-lists.json)

- **Names listed twice in one list (audit P3-2, checked October 1, 2026).** Low FODMAP: "lemongrass" is its own item (Vegetables) and one of the herbs (pantry); "rice malt syrup" is its own item (pantry) and an alias of rice (grains). Low histamine: "corn" is an item under Vegetables (sweetcorn) and under Grains (cornmeal, polenta); "coconut milk" is an alias of coconut (Fruit) and of almond milk (Dairy and alternatives). Each pair approves the name at the same serve, so the answer is the same whichever item the list meets first; only the note and source shown can differ. Left as they are, since nothing is deleted from the data without the owner. `test/audit-fix-p3-2-diet-list-names.test.mjs` fails if a pair ever disagrees or a new duplicate appears. Owner's choice: "rice malt syrup" under rice and "coconut milk" under almond milk could come out of those two items, since each name has its own better-placed item.
- **"french beans" (audit P3-2).** The dictionary reads it through the generic "bean" entry: legume, GOS, high in potassium, and "french" is not recognized, so a low FODMAP plan shows a caution. The audit read French beans as green beans, which is British use. USDA's food data uses the name for a dried bean: "Beans, french, mature seeds, raw" (SR Legacy 173738; boiled, 173739 and 175241). Because the name can mean either, the stricter reading stays: never a pass on low FODMAP. The low FODMAP list names "french beans" as an alias of green beans (small serve). Today that has no effect, because the dictionary's GOS tag already makes the line a caution, and the same test keeps it so. Recommendation for the owner: take "french beans" out of the low FODMAP green beans aliases, since an approved list should not name something that can mean a dried bean. "runner beans" is read the same way (generic bean) and stays as it is; no FODMAP source here covers it.

## Recipes (data/recipes.json)

- Ingredient substitutions made because the food was not in the database: garlic-infused oil omitted; whole-wheat tortillas as flour or corn; breadcrumbs as rolled oats; Dijon as yellow mustard; rice vinegar as cider vinegar; low-sodium vegetable broth as regular broth cut with water.
- Sodium tips exist on every recipe that uses soy sauce, fish sauce, canned goods, or rotisserie chicken.
- Meal slots across all three recipe files were re-tagged on September 9, 2026 by `tools/fix-meal-slots.mjs`: 333 basics (sauces, dressings, stocks, doughs, spice mixes, dips) are now `component` and never scheduled; hummus-and-veg plates, snack mixes, and ice cream are `snack`; eleven desserts and party foods lost a breakfast tag the source had given them. Component and heat classifications are title and ingredient heuristics; misses can be corrected per recipe in `tools/lib/meal-components.mjs` and `src/engine/spice.js`.

## Support resources (src/engine/screen.js)

- The National Alliance for Eating Disorders is named without a phone number. Confirm the current helpline number before family use. **Done September 30, 2026:** number, hours, and treatment finder added, with 988 for a crisis (VERIFY-log A31). Not shown in the app since the screen was removed.
