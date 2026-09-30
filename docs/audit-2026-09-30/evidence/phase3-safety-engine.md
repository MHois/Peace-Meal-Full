# Phase 3 evidence: the safety engine (items 11 to 16)

Run on September 30, 2026, against `main` at `2a88538`, with Node v22.22.2. The engine is loaded exactly as the app's own tests load it (`audit/lib/engine.mjs`). Every test person is made up.

## 11. Allergen label corpus: 33 PASS verdicts that should not be (28 of them P0)

Command: `node --test audit/tests/allergen-corpus.test.mjs`. Corpus: `audit/corpus/allergen-labels.json`, built by `audit/scripts/build-allergen-corpus.mjs`. Results: `audit/results/allergen-corpus.json`.

The corpus has 775 lines. 745 of them each contain a milk, egg, fish, crustacean, tree nut, peanut, wheat, soy, or sesame allergen, or a gluten source. Each of those 745 is checked for a person with only that allergy, or only celiac disease. The other 30 are controls that must not be flagged ("coconut milk", "peanut butter" for a milk allergy, and so on).

| Kind of line | Lines | PASS (wrong) | Caution | Fail |
|---|---|---|---|---|
| Plain names (casein, whey, surimi, spelt, durum, tahini ...) | 235 | 2 | 4 | 229 |
| Hidden names and derivatives | 87 | 0 | 14 | 73 |
| Mixed case | 120 | 0 | 0 | 120 |
| Plurals | 40 | 0 | 2 | 38 |
| Whole label statements | 35 | 0 | 1 | 34 |
| "May contain" and "made in a facility" | 33 | 0 | 1 | 32 |
| "Contains:" statements | 21 | 1 | 0 | 20 |
| Typos | 45 | 4 | 30 | 11 |
| OCR-garbled | 71 | 6 | 60 | 5 |
| A misspelled allergen next to a word the app knows ("masked") | 42 | 15 | 18 | 9 |
| Ingredients whose source is not named | 16 | 5 | 11 | 0 |
| **Total** | **745** | **33** | 159 | 553 |

By person: peanut 8 wrong PASS verdicts of 60 lines, soy 9 of 73, tree nut 4 of 85, sesame 4 of 62, milk 3 of 96, wheat 2 of 90, celiac 2 of 98, crustacean 1 of 55, egg 0 of 60, fish 0 of 66.

**P0: a misspelled or badly scanned allergen word next to a word the app knows (25 lines).**

| Person | Lines that PASS |
|---|---|
| Peanut | `penut butter` (twice), `pean ut butter` (twice), `pea nut`, `pea nuts`, `salt, pea nut, sugar`, `sugar, penut flour` |
| Tree nut | `almnd milk`, `cashw butter`, `alrnond butter`, `sugar, a1mond flour` |
| Milk | `sugar, rnilk chocolate`, `sweetened condensed rni1k` |
| Soy | `s0y protein isolate` (twice, once with sugar), `so y lecithin`, `sugar, s0y lecithin`, `organic s0y milk` |
| Sesame | `sesami seeds`, `sesarne seeds`, `sugar, sesme seeds`, `roasted sesarne seeds, salt` |
| Crustacean | `craw fish` |
| Celiac | `ma1t vinegar, salt` |

Cause: `src/engine/dictionary.js:153-157` reports a piece of the ingredient list as "not recognized" only when **no** term in it matched. So in `penut butter`, the known word `butter` is matched (as milk), and the unknown `penut` disappears without a trace. The checker then sees only a milk tag, which a peanut-only person does not avoid, and answers PASS. The same mechanism makes `pea nut` read as a tree nut plus a pea, and `craw fish` read as a fish (not a crustacean). README safety rule 7 says unrecognized text is never counted as safe; here it is.

**P0: soy derivatives the app says it excludes (3 lines).** `soy lecithin`, `soybean oil`, and `Contains: Soy Lecithin.` PASS for a soy allergy. The app's own rule text says the opposite:

- `data/conditions.json:2150`, the food-allergies soy rule: "Refined soybean oil and soy lecithin are excluded by default and can be relaxed only with allergist input".
- `data/conditions.json:1816` and `data/articles.json:1179` say the same.

The exclusion lives only in the separate soy-free module's rule `soy-refined-oil-lecithin`, which applies only when that module is selected, not when the soy allergy is.

**P2, for a sourced decision: ingredients whose source is not named (5 lines).** `lecithin` (soy), `modified food starch` (wheat; and celiac), `maltodextrin` (wheat), and `caramel` (milk) PASS. Under the US allergen labeling law (FALCPA), a wheat, soy, or milk source must be named on the label. So on US labels these are unlikely to hide one of the nine allergens, and they are not counted as P0. Barley, rye, and oats are not covered by that law, and imported labels may not follow it. Whether these should be "Not sure" needs a source, not a guess.

## 12. Property and fuzz tests

Command: `node --test audit/tests/checker-fuzz.test.mjs` (fast-check, fixed seed 20260930; failures saved to `audit/corpus/fuzz-failures.json`).

| Property | Runs | Failures |
|---|---|---|
| A1. An allergen term in its own piece of the list never passes for that allergy | 3,000 | 0 |
| A2. An allergen term with random unknown words around it never passes | 3,000 | 0 |
| B1. A random unknown word alone never passes while a restriction is on file | 3,000 | 0 |
| **B2. A random unknown word next to one known word never passes** | 3,000 | **2,825** |
| C. The checker never throws (random text, emoji and other graphemes, binary strings, and arbitrary non-string values) | 5,000 | 1 (see below) |
| C2. A 35,598-character label (2,000 pieces) is checked in reasonable time | 1 | 0 (764 ms) |

B2 is README rule 7 failing in the ordinary case. Examples: `ywcnhctdp honey` for a tree nut allergy, and `bakhsayy sugar` for IBS. Same cause as above.

The one C failure is not a string: an object whose `toString` is a list, not a function ("Cannot convert object to primitive value"). The screens always pass the text box's string, so this cannot happen from the app. It is listed as P3 (the checker assumes a string without checking). For every string input, including emoji, graphemes, and binary, the checker never threw.

## 13. Every pair of conditions and patterns

Command: `node --test audit/tests/condition-pairs.test.mjs` (results: `audit/results/condition-pairs.json`). 53 conditions, patterns, and variants, each pair plus each alone and each with pregnancy: 1,419 plans.

- Crashes: **0**.
- A contradictory number without a conflict notice (rule 2): **0**.
- A Tier 2 number generated without a clinician's value, or without the "not applied" notice (rule 3): **0**.
- Pregnancy (rule 6): low FODMAP, low histamine (MCAS), weight management (both the weight-loss and GLP-1 variants), and low-carb and ketogenic are all turned off with a notice. Celiac rules, the gluten hard stop, and a peanut allergy stay on.
- **P1: time-restricted eating stays on in pregnancy.** Rule 6 names intermittent fasting. The feature map has no module for it: `src/engine/plan.js:12`, `'intermittent-fasting': []`. The time-restricted-eating module was added on September 9 (`data/conditions.json:6831`) and never mapped. The same map is used for children (`src/engine/plan.js:160`), so a child's profile keeps it too.

## 14. Recipes against typical profiles

Command: `node --test audit/tests/recipes-profiles.test.mjs` (270 seconds; results: `audit/results/recipes-profiles.json`). All 4,152 recipes of the full build (841 of them are also in the lite build) were checked against ten made-up profiles: peanut, milk, shellfish plus sesame, kiwi (an allergy typed in, outside the nine), celiac, high blood pressure with type 2 diabetes, IBS on low FODMAP, low histamine, vegan, and kidney disease.

- `checkRecipe` crashed: **0** times in 41,520 checks.
- A recipe that did not FAIL although one of its own ingredient lines is a hard stop on the label checker: **0**.
- Adapted recipes (swaps) that are not a PASS for the diet they were adapted for: **0** of 117 low FODMAP and **0** of 28 low histamine.
- Disagreements in the safe direction only: 3 to 60 recipes per profile PASS while one of their ingredient lines, typed into the label box, gets a caution. A probe of four profiles (`audit/scripts/recipe-label-disagreements.mjs`) found preparation wording the label checker does not know ("1 English muffin, split", "4 carrots, cut in sticks", "skin removed"). The recipe check reads the linked food instead, so the recipe verdict is right and the label check is a false alarm (P3).

| Profile | Full: pass / caution / fail | Lite: pass / caution / fail |
|---|---|---|
| Peanut allergy | 1,033 / 2,973 / 146 | 290 / 526 / 25 |
| Milk allergy | 509 / 1,649 / 1,994 | 160 / 279 / 402 |
| Shellfish and sesame | 1,026 / 2,905 / 221 | 275 / 517 / 49 |
| Kiwi (typed in) | 1,070 / 3,072 / 10 | 300 / 538 / 3 |
| Celiac disease | 593 / 1,830 / 1,729 | 177 / 299 / 365 |
| High blood pressure and type 2 diabetes | 351 / 3,801 / 0 | 119 / 722 / 0 |
| IBS, low FODMAP | 167 / 3,985 / 0 | 92 / 749 / 0 |
| Low histamine | 153 / 3,999 / 0 | 69 / 772 / 0 |
| Vegan | 334 / 3,818 / 0 | 80 / 761 / 0 |
| Kidney disease, stages 1 to 4 | 1,053 / 3,099 / 0 | 291 / 550 / 0 |

Why so many cautions (probe `audit/scripts/recipe-caution-reasons.mjs`, peanut profile): 2,965 of the 2,973 cautions are imported recipes, and 2,712 of those come from words the dictionary cannot place. Imported recipes are plain text, not linked to foods (13.2 percent of NHS lines and 20.2 percent of Wikibooks lines have such words; `audit/results/data-quality.json`). The app's own 193 recipes have 8 cautions, all from terms that can hide something, such as "natural flavors". In the lite build, 526 of 841 recipes are "not sure" for a peanut allergy: safe, but a lot of noise for the daily user (P2).

## 15. Mutation testing: score 65.6 percent

Command: `audit/node_modules/.bin/stryker run audit/stryker.conf.json`. It mutates only `src/engine/checker.js` and `src/engine/dietlists.js`, and judges each mutant with the app's own 20 test files run through `node --test`, stopping at the first failing file. Full report: `audit/results/stryker/mutation.json` (9 MB, not committed). Summary: `audit/results/stryker-summary.json` (`node audit/scripts/stryker-summary.mjs`). Run time: 81 minutes.

| File | Mutants | Caught | Survived | Score |
|---|---|---|---|---|
| `src/engine/checker.js` | 408 | 259 | 149 | 63.5% |
| `src/engine/dietlists.js` | 582 | 390 (1 by timeout) | 192 | 67.0% |
| Both | 990 | 649 | 341 | **65.6%** |

A surviving mutant is a place where Stryker changed the code and every test still passed, so a real bug there would go unnoticed. Some survivors change nothing a person could see: redundant conditions, the order of reasons, and text inside error details. The ones that matter, in plain words:

1. **A person whose only restriction is a daily limit** (for example sodium for high blood pressure): `checker.js:31-32` can be switched off so that their unknown words PASS, and no test fails. Rule 7 is untested for this person.
2. **A person whose only allergy is one they typed in** (outside the nine, such as kiwi): `checker.js:26`, the same.
3. **Recipes with an ingredient line the app cannot read.** Deleting the code that flags it (`checker.js:136-139`), or the code that flags "natural flavors"-type terms, leaves every test passing. Rule 7 for recipes is untested.
4. **A recipe that FAILS for an allergy and also goes over a limit** could be softened to CAUTION: `checker.js:164`, `verdict !== 'fail'` replaced by `true`, survives.
5. **The "percent of daily limit" and "numbers missing" figures on recipes** (`checker.js:155-156`) can be computed wrongly with no test failing.
6. **The person's own "avoid these words" list** (`checker.js:104`): making every avoid word match every label survives.
7. **A personal "tolerated" list** (`dietlists.js:111`): making every food count as tolerated survives. That would turn every strict-list caution into a pass for anyone with one tolerated food.
8. **Strict mode switched off for one diet** could switch it off for all diets (`dietlists.js:62`): untested.
9. **A typed allergy name with a bracket in it** (`checker.js:86`): removing the escaping survives, and the unescaped name would stop the check with an error. Untested.

## 16. The September summary's claims: 24 of 27 hold

Command: `node --test audit/tests/summary-claims.test.mjs` (results: `audit/results/summary-claims.json`). Each claim in `docs/AUDIT-2026-09-SUMMARY.md` is probed with the engine or the data.

The three that do not hold:

- **P1a**, "anything the app does not recognize is never a pass while a condition, allergy, or limit is on file". `sugar xqzt` passes. Same cause as items 11 and 12.
- **P7b**, "a plain-words why under every number, taken word for word from each condition's own article". Two weekly fish numbers have no "why" at all (`anti-inflammatory-mediterranean:med-fish`, `pregnancy-gdm-breastfeeding:preg-fish`). Four "why" lines do not appear word for word in their article (`hyperlipidemia:lipid-soluble-fiber`, `weight-management-glp1:wm-glp1-protein`, `thyroid:thyroid-iodine`, `constipation:cons-fiber`).
- **Q9c**, "a label with distilled white or apple cider vinegar is not flagged on a low histamine plan". The dictionary tags every vinegar as histamine-fermented, so both labels are a caution.

## Also found while testing: the two Check boxes disagree

Command: `node --test audit/tests/check-screen-consistency.test.mjs` (results: `audit/results/check-screen-consistency.json`). For each USDA food that the food box flags, its plain name was typed into the label box.

| Person | Foods the food box flags | Typed name PASSES instead |
|---|---|---|
| Wheat allergy | 260 | **10**: "Hamburger / hot dog bun", "Chicken tenders", "Bran Flakes", "Oatmeal Squares", "Grape-Nuts", "GRAPE-NUTS Flakes", "HONEY BUNCHES OF OATS, honey roasted", and three chicken sandwiches |
| Celiac disease | 286 | **7**: "Chicken tenders", "Bran Flakes", "Grape-Nuts", "GRAPE-NUTS Flakes", and three chicken sandwiches |
| Milk allergy | 274 | **2**: "Caramels", "Potato salad with egg" |
| IBS (low FODMAP) | 879 | 5: "Egg noodles, dry", "Egg noodles, cooked", "Grape-Nuts", "Tempeh, cooked", "Dark chocolate coated coffee beans" |
| Peanut, soy, tree nut, fish, shellfish, egg, sesame, low histamine, lactose | | 0 |

The food data knows these contain wheat or milk. The dictionary does not know the dish names, and the words it does know ("chicken", "sandwich", "salad", "egg") hide the rest (item 11). For wheat, celiac, and milk this is a P0.

Two single-food labels that a condition's own text says to avoid (`node --test audit/tests/condition-labels.test.mjs`, results: `audit/results/condition-labels.json`):

- `corned beef` PASSES on a low histamine plan, while pastrami, salami, jerky, sauerkraut, and aged cheddar are cautions. `data/articles.json:780` says the plan steers away from cured meats, and the USDA food "Beef, cured, corned beef" carries the histamine-aged tag.
- `salt`, `soy sauce`, and `garlic salt` PASS for high blood pressure. The plan's sodium limit is a daily number; the label checker says nothing about salt at all (P1).
