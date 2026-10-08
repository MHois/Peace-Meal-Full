# Phase 8 evidence: data and content quality (items 33 to 36)

Run on September 30, 2026, against `main` at `2a88538`. Clinical content, food ratings, and sources were not changed; items that need a clinical decision are flagged.

## 33. Beyond `npm run validate`

Command: `node audit/scripts/data-quality.mjs` (results: `audit/results/data-quality.json`).

| Check | Result |
|---|---|
| Source ids cited anywhere that do not exist in `data/sources.json` | **0** |
| Sources in `data/sources.json` that nothing cites | **29**, all listed in the results file. They include the POTS guidelines (`hrs-pots-2015`, `ccs-pots-2020`, `vernino-pots-2021`), the CRPS sources, the FDA device and state licensure items, `scoff-questionnaire` (the eating-disorder screen was removed September 9), `mifflin-1990`, `ainsworth-compendium-2011`, `glim-2019`, and `user-defined`. Report only: nothing is removed. |
| Own recipes (193): ingredient lines linked to a food | 1,573 of 1,573; 0 broken links |
| Imported recipes: ingredient lines linked to a food | 0; every line is text. Share of lines with words the checker cannot place: NHS 13.2%, Parent Club 12.0%, NHLBI 13.1%, VA 12.4%, USDA 16.6%, Wikibooks 20.2% |
| Own recipes storing nutrient numbers | **0** |
| Imported numbers without a named source | **0** |
| Numeric rules (limits and targets with a number): 44 | Only **1** is logged by rule id in `docs/VERIFY-log.md` or `docs/DATA-REVIEW.md` (`weight-management-glp1:wm-glp1-protein`). The other **43** are not (listed in the results file, for example `hypertension:htn-sodium`, `ckd-non-dialysis:ckd-protein`, `osteoporosis:osteo-calcium-1200`). Every one of the 43 numbers does appear in `docs/PHASE-1-evidence-and-regulatory-foundation.md`, so each has a documented origin, but not a logged supporting passage. Method: a rule counts as logged when its id appears in either log; a passage logged without the rule's id would be missed. |

## 34. Diet lists

Same command (`dietLists` in the results file). Low FODMAP has 125 items; low histamine has 82.

- **Duplicates.**
  - Low FODMAP: "lemongrass" is both its own item and under "herbs"; "rice malt syrup" is both its own item and under "rice".
  - Low histamine: "corn" twice; "coconut milk" under both "coconut" and "almond milk".
- **On both an approved and a leave-out list:** 0 in either family.
- **Approved names the dictionary tags as a problem for that same diet:**
  - Low FODMAP: "french beans" (an alias of green beans) carries the dictionary's GOS tag.
  - Low histamine: six vinegar names ("distilled white vinegar", "white vinegar", "distilled vinegar", "spirit vinegar", "apple cider vinegar", "cider vinegar") are approved on the list, yet the dictionary tags every vinegar histamine-fermented. So the label is still a caution (the September claim Q9c, which does not hold).
- **Partial-word matches, the "bean sprouts" and "avocado oil" kind.** An approved name matches inside longer food names, because normalization drops words such as "fresh":
  - Low histamine: 98 USDA foods carrying the diet's own leave-out tags are approved by name. For example, "fresh beef" approves "Beef jerky", "Bologna", and "Frankfurter" (39 foods); "ricotta" approves "blue cheese dressing" (19); "fresh chicken" approves 16; "cucumber" approves pickles.
  - Low FODMAP: 100 such foods. For example, "vanilla extract" approves vanilla ice cream (13), "potato" approves sour-cream-and-onion chips, and "peanuts" approves a milk-chocolate granola bar.
  - For those foods, the foods' own tags still produce a caution, so the food box is right. **But typed text has no such tag:** "corned beef" is approved on the low histamine list through "fresh beef", the dictionary does not tag "corned", and the label checker answers PASS (Phase 3, `audit/tests/condition-labels.test.mjs`).
- **Items still marked not re-checked:** low histamine 3 (chia seeds, sunflower seeds, cinnamon; the September summary says no source rates them); low FODMAP 0.

## 35. A test for each README safety rule

Command: `node audit/scripts/rule-mutations.mjs` (results: `audit/results/rule-mutations.json`). For each rule, the code or data that enforces it was broken on purpose in a throwaway copy of the app (never in the app itself), and the app's own test suite was run. A rule is protected when at least one test then fails.

| README rule | How it was broken | App tests that failed | Example test that protects it |
|---|---|---|---|
| 1. Allergens are absolute | A person's allergens become soft avoids (`src/engine/plan.js`) | 8 | "[10] the false alarms are gone and the real tags stay" |
| 1. | The checker never returns FAIL (`src/engine/checker.js`) | 10 | "hard hit fails; unknown-risk term is caution when allergens are selected" |
| 2. Hard conflicts stop the number | A hard conflict no longer stops the number | 2 | "hypertension + POTS: no sodium number, hard-conflict notice, tier2 missing" |
| 3. Tier 2 numbers are never generated | Tier 2 rules apply their published default | 2 | "POTS tier 2 without number runs in tier 1 only with notice" |
| 4. Elimination phases expire | No check-in prompt, ever | 2 | "phase gating: ... a phase never ends on its own; a check-in asks" |
| 5. A positive eating-disorder screen turns things off | A positive screen is ignored | 1 | "positive screen turns off calorie targets and new eliminations but keeps allergens" |
| 6. Pregnancy disables ... every elimination protocol | The pregnancy module's list no longer names elimination protocols (`data/conditions.json:4530`) | **0** | **none** |
| 6. ... ketogenic and very low carbohydrate | Pregnancy no longer turns off low-carb | 2 | "pregnancy disables keto and elimination protocols" |
| 6. ... intermittent fasting | Not mutated: already broken in the code (`src/engine/plan.js:12`, Phase 3) | n/a | **none** |
| 7. Unrecognized text is never counted as safe | The "not recognized" caution is removed | 5 | "[1] celiac, no allergens: a misspelled or unknown ingredient is a caution, never PASS" |
| 8. There is no language model in the app | A call to a language-model API at start-up (`src/app.js`) | **0** | **none** |

Rules with no protecting test:

- **Rule 6, elimination protocols.** `test/plan.test.mjs:113` is named "pregnancy disables keto and elimination protocols", but it builds the plan from its own made-up module list (`test/plan.test.mjs:5`), not from `data/conditions.json`. So the real pregnancy module's list is never tested.
- **Rule 6, intermittent fasting.** The behavior is missing, and so is the test.
- **Rule 8.** No test looks at what the app loads or calls. The audit's own network test (`audit/e2e/network.mjs`) would catch it; the app's suite would not.

README note: elimination phases no longer expire; since September 10 they stay on and ask at a check-in. README rule 4 still says they expire. Rule 5 describes an eating-disorder screen the app stopped showing on September 9, although the code still honors a positive result if one is saved. Both README lines describe behavior the app no longer has (report only).

## 36. Plain language

See `phase8-plain-language.md` in this folder: the 20 hardest pieces of text, with suggested wording.
