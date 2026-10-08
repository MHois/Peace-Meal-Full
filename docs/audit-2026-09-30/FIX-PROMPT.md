# Ready-to-paste prompt: fix every P0 and P1 finding from the September 30 audit

Copy everything below the line into Claude Code, opened on the Peace-Meal-Full repository.

---

# Peace Meal: fix the P0 and P1 findings from the September 30, 2026 audit

You are fixing Peace Meal (github.com/mchoisington/Peace-Meal-Full). It is one codebase with two builds: `node tools/bundle.mjs` (full) and `node tools/bundle.mjs --lite` (Peace Meal for one, used every day by an older adult on an iPhone).

The audit is in `docs/audit-2026-09-30/REPORT.md`, with evidence in `docs/audit-2026-09-30/evidence/` and tests and results in `audit/`. Read the report, the README's safety rules, and the draft `CLAUDE.md` before you change anything. Treat every claim in the report as something to confirm, not a fact: reproduce each finding before you fix it.

Run straight through without stopping for approval, except at the owner decisions listed at the end. I'm not a developer; your final summary is my review point.

## Rules (the same as the September fix pass)

1. Work on a new branch, `fix-audit-2026-09-30`, from `main`. Never push to `main`, never force-push, never rewrite git history. I review and merge.
2. Delete nothing: no functions, rules, recipes, or data. If something looks like it should go, comment it out and flag it.
3. No new network calls, servers, accounts, analytics, or language models. All data stays on the device.
4. No invented clinical numbers or rules. Make a clinical change only where a published source directly supports it, and log the source and the supporting passage in `docs/VERIFY-log.md`. If no source settles a point, stop on that point and flag it.
5. Existing user data must never be lost. Any change to storage keys or the profile shape needs a one-time migration that keeps the old copy, plus a test.
6. This repository is public. Put no real people's details in code, tests, docs, screenshots, or commit messages. Every test person is made up.
7. `npm run validate` and `npm test` must pass after every commit.
8. The README's safety rules and sources policy stay as written. No US federal dietary guidance is cited.
9. Keep the architecture: rules in `data/conditions.json`, ingredient recognition only through `data/dictionaries.json`, citations through `data/sources.json`.
10. **Failing test first.** For each finding, first add a test to `test/` that fails on the current code. Show the failing run in your notes, then fix, then show it passing. Never loosen an existing assertion. If an existing test must change, record the old and new expectation and why, as the September summary did.
11. One commit per finding, with its ID (for example "P0-1: ...") in the message. After each: `npm run check`, plus the audit checks named for that finding (`npm --prefix audit ci` once first).

## The findings, in this order

### P0-1. A misspelled or badly scanned allergen word next to a known word passes

- Reproduce:
  - `node --test audit/tests/allergen-corpus.test.mjs` shows 33 wrong PASS verdicts; 25 are typos, scanning errors, or masked words, such as `penut butter`, `pea nut`, `almnd milk`, and `sesarne seeds`.
  - `node --test audit/tests/checker-fuzz.test.mjs`, property B2, fails 2,825 of 3,000 runs.
- Cause: `src/engine/dictionary.js:153-157` counts a piece of the ingredient list as "not recognized" only when no term matched in it, so an unknown word beside a known one vanishes.
- Failing test first: in `test/`, the 25 corpus lines, each for its one-allergy profile, must not be PASS. A made-up word beside a known word must not pass for any restricted plan.
- Fix: after matching, any word in the piece that no fired term covers, and that is not an amount or preparation word (`NOISE`, `dictionary.js:57-68`), makes the piece not recognized. That gives "Not sure", never PASS (README rule 7).
- Measure the side effect: run `node audit/scripts/recipe-caution-reasons.mjs` before and after, and report how many more recipes become "Not sure". Add true preparation words to `NOISE` only if they name no food.
- Done when: the audit corpus has 0 wrong PASS verdicts of the typo, OCR, and masked kinds; B2 passes; `npm run check` passes.

### P0-2. Soy lecithin and soybean oil pass for a soy allergy

- Reproduce: `soy lecithin`, `soybean oil`, and `Contains: Soy Lecithin.` pass for a person with only `allergen-soy`.
- What the app promises: `data/conditions.json:2150` says "Refined soybean oil and soy lecithin are excluded by default and can be relaxed only with allergist input". The soy-free module's rule `soy-refined-oil-lecithin` (`data/conditions.json:1805-1816`) carries `"configurable": true, "default_for_allergy": "exclude"`, but it applies only when that module is selected.
- Failing test first: the three lines must FAIL for `allergen-soy` alone, and must pass again once the allergist relax setting is on.
- Fix: when the soy allergy is on file, apply the `default_for_allergy: "exclude"` rule, or add `soy-lecithin` and `soy-refined-oil` to the allergy's avoid tags, keeping the existing relax setting. This implements text the app already cites (FDA FALCPA, and the existing sources); log the change in `docs/VERIFY-log.md`, quoting the rule text.

### P0-3. Typed food names that the food data flags pass in the label box

- Reproduce: `node --test audit/tests/check-screen-consistency.test.mjs` and `node --test audit/tests/condition-labels.test.mjs`.
  - Wheat allergy: 10 typed names pass.
  - Celiac: 7.
  - Milk allergy: 2, "Caramels" and "Potato salad with egg".
  - Low histamine: "corned beef" passes, because the list alias "fresh beef" (`data/diet-lists.json:2474`) approves it.
- Failing test first: those foods' names, typed, must not pass for those profiles. Controls must still pass: plain "chicken" for a wheat allergy, and "beef" on low histamine.
- Fix:
  - In `checkText` (`src/engine/checker.js:58-72`), when a typed piece matches a food's name in `data/foods.json` (the same matching the food box uses), add that food's tags. The food tags come from USDA data, so no new clinical content is involved.
  - Make diet-list aliases match whole names, not a word inside a longer name.
  - Compare `node audit/scripts/data-quality.mjs` before and after, and report the change in approvals.

### P0-4. Saved data that cannot be read is silently replaced

- Reproduce: `node audit/e2e/data-safety.mjs`, checks e1 and e2, fail in both builds.
- Cause: `src/store.js:78-84` returns an empty profile and keeps no copy.
- Failing test first (a unit test on `load` with a fake storage):
  - Damaged JSON, and a `people` list holding `null`, must leave the original text in storage after the first new save.
  - The app state must say the data could not be read.
- Fix:
  - Before anything else is saved, copy the unreadable text once to its own key, for example `<key>:unreadable:<date>`, never overwriting an existing copy.
  - Show a notice on every screen: "Your saved data could not be read. Save it as a file", with a button that downloads the original text. Offer "Start fresh" only after that.
  - Clear data must not remove the unreadable copy without asking.
- Done when: data-safety e1 and e2 pass in both builds.

### P1-1. Time-restricted eating stays on in pregnancy and for children

- Cause: `src/engine/plan.js:12`, `'intermittent-fasting': []`. The `time-restricted-eating` module (`data/conditions.json:6831`) was never mapped.
- Failing test first: using the real `data/conditions.json`, not a made-up module list, a pregnant profile, and a child profile, with `time-restricted-eating` get it turned off with a notice.
- Also add a test that the real pregnancy module turns off `ibs-low-fodmap`, `mcas`, and `gluten-free-non-celiac`. Today no test reads the real list (`test/plan.test.mjs:5`, `:113`).
- Fix: map `intermittent-fasting` to `['time-restricted-eating']`. README rule 6 already requires this.

### P1-2. A crafted backup file can run script through the age field

- Reproduce: `node audit/e2e/xss.mjs` shows the payload running on the lite Report and the profile's Basics step.
- Failing test first:
  - A unit test that imports a profile whose `age` is markup: after import, `age` is a number or empty.
  - A test that the Report and Basics HTML escape it.
- Fix:
  - `uiEsc` at `src/ui/lite.js:221` and `src/ui/people.js:325`.
  - In `importJSON` (`src/store.js:115-119`), check field types: numbers become numbers or empty, strings stay strings, and anything else is dropped with a count shown to the person. Keep the replaced data for an undo, as a copy under its own key.
- Done when: `xss.mjs` reports 0 payload runs.

### P1-3. Salt passes for high blood pressure

- Reproduce: `node --test audit/tests/condition-labels.test.mjs`. `salt`, `soy sauce`, and `garlic salt` pass for hypertension. In the dictionary, salt is tagged only `basic-ingredient`.
- Failing test first: with a sodium limit on file, those labels are a caution that says to check the sodium on the Nutrition Facts panel. With no sodium limit, they still pass.
- Fix:
  - Tag high-sodium ingredients using USDA FoodData Central composition (a fact about the food, not advice). Show a "check the sodium on the label" caution only when the plan has a sodium limit.
  - Cite the sodium limit's existing source, and log the tagged terms and the wording in `docs/VERIFY-log.md`.
  - This touches clinical wording, so list the new tags and text in your summary for my review.

### P1-4. Other sites on mchoisington.github.io can read, change, and replace the app's data

- Reproduce: `node audit/e2e/shared-origin.mjs`.
- What you can do in code:
  - The service worker checks the cached page against the fingerprint of the build it installed, and refuses a changed copy by fetching a fresh one. Add a test in `test/sw.test.mjs`.
  - Add a short note to the README's hosting section saying the app must be the only site on its origin.
- **Owner decision, do not do it:** moving the app to its own origin (a custom domain, or a separate GitHub account or organization). Write the steps and costs in your summary, using phase 7, item 30 of the audit.

### P1-5. A Safari tab never says its data is not saved safely

- Reproduce: `node audit/e2e/offline-iphone.mjs`, check 21.2.
- Failing test first (e2e): in a Safari tab (`navigator.standalone` false, iPhone user agent), every screen shows a banner, "Not saved safely. Add to Home Screen", that opens the move-your-data steps. In the Home Screen app it never shows.
- Fix: a small banner in `src/app.js` or `src/ui/common.js`, reusing `installInSafariTab()`. It can be hidden for the day, but not forever.

### P1-6. The old address strands data and runs a stale app

- Reproduce: `node audit/e2e/old-address.mjs` (needs the old repository's history; set `PM_OLD_REPO`).
- What you can do in the repository: move `audit/proposals/old-address/index.html` and `sw.js` into a new folder, `tools/old-address/`, with a short README on how to publish them.
  - Keep the page's no-network, read-only design.
  - Recompute its script hash if you edit the script.
  - Add a test that the page saves the old keys' text and changes nothing.
- **Owner decision, do not do it:** publishing. It needs a repository that GitHub Pages serves at `/specialty-nutrition-app/`, for example a user-site repository `mchoisington.github.io` holding a `specialty-nutrition-app/` folder. List the exact steps in your summary.

## Checks before you finish

- `npm run check` passes, and both builds bundle.
- Every P0 and P1 test you added fails on `main` and passes on your branch. Show both runs in the summary.
- Rerun the audit's own checks for what you touched:
  - `node --test audit/tests/*.test.mjs`
  - `node audit/e2e/data-safety.mjs`
  - `node audit/e2e/xss.mjs`
  - `node audit/e2e/offline-iphone.mjs`
  - `node audit/e2e/journeys.mjs`
  - `node audit/scripts/rule-mutations.mjs` (rules 6 and 8 should now have protecting tests; for rule 8, add a test that the built pages contain no request to any host except the four pinned photo-reader files)
  - `node audit/e2e/perf.mjs` (only to confirm nothing got slower; speed is P2 and not part of this pass)
- Privacy: run `node audit/scripts/secrets-scan.mjs` and confirm 0 findings.

## Final summary (my review point)

Plain words, no jargon:

- For each finding: what was wrong, what you changed (file and line), and the test that now guards it, with its failing and passing runs.
- Every clinical change, with its source and the logged passage.
- Every test changed on purpose: the old and new expectation, and why.
- How many recipes and labels changed verdict because of P0-1 and P0-3, before and after.
- The owner decisions (P1-4 origin move, P1-6 publishing), each with exact steps and costs.
- Anything you could not fix, and why.
