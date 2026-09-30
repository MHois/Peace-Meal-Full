# Peace Meal code audit, September 30, 2026

**Rerun every audit check with one command** (from the repository root; Node 22 or later):

```
npm --prefix audit ci && npm --prefix audit run all
```

It prints a pass or FAIL line per check and writes `audit/results/run-all.json`. A FAIL means the check found problems, or could not run; its output says which. Checks that need the internet skip themselves without it. The Stryker mutation run takes over an hour, so it runs only with `npm --prefix audit run mutation`.

Audited: `main` at `2a88538`, with Node v22.22.2 and Chromium 141. The app itself was not changed: every file the audit added is under `audit/`, `docs/audit-2026-09-30/`, or the draft `CLAUDE.md`. All test people are made up.

## Verdict

Peace Meal keeps its biggest promises: nothing leaves the phone in normal use, the photo reader downloads only its four pinned files and uploads nothing, a backup restores exactly, every screen passes the automated accessibility rules, and the app's own tests guard most of the README's safety rules. Its PASS answer cannot yet be trusted on its own, though. A misspelled or badly scanned allergen word next to a word the app knows is ignored ("penut butter" passes for a peanut allergy); soy lecithin passes for a soy allergy although the app's own rule says it is excluded; some typed dish names that hide wheat or milk pass ("Chicken tenders", "Caramels"); and damaged saved data is silently replaced. Those four P0 findings should be fixed before anyone relies on a PASS without reading the label. The six P1 findings are: time-restricted eating stays on in pregnancy, a crafted backup file can run script, salt passes for high blood pressure, any other site under mchoisington.github.io can read and change the stored health data, a Safari tab never warns that its data is not saved safely, and people still on the old address see a 404 page or a stale pre-September app. The most noticeable everyday problem is speed: the lite app rebuilds the whole week before it shows Today, which took 5 seconds at full speed on the audit machine and about 25 seconds at a mid-range phone's speed; time it on the iPhone with the checklist.

**Counts: 4 P0, 6 P1, 15 P2, 12 P3.**

## Findings

Priority: **P0** could show a restricted food as safe, lose data, or expose health data. **P1** is wrong behavior or a broken feature. **P2** is quality, accessibility, or performance. **P3** is cleanup. The evidence files are in `docs/audit-2026-09-30/evidence/`, and the raw results are in `audit/results/`.

### P0

**P0-1. A misspelled or badly scanned allergen word next to a word the app knows passes.**

- Evidence:
  - 25 label lines in the corpus pass for the one allergy they contain. Examples: `penut butter` and `pea nut` (peanut), `almnd milk` (tree nut), `sesarne seeds` (sesame), `s0y protein isolate` (soy), `craw fish` (crustacean), and `ma1t vinegar, salt` (celiac).
  - Fuzz: a made-up word next to one known word passed 2,825 of 3,000 times.
  - The September claim "anything the app does not recognize is never a pass" does not hold.
  - Commands: `node --test audit/tests/allergen-corpus.test.mjs`, `node --test audit/tests/checker-fuzz.test.mjs`. Details: phase 3, items 11, 12, and 16.
- Where: `src/engine/dictionary.js:153-157`. A piece of the list counts as "not recognized" only when nothing in it matched, so the unknown word next to a known one disappears. This breaks README rule 7.
- Fix: report every unmatched word inside a matched piece as not recognized, which gives "Not sure", ignoring only amount and preparation words. Add the corpus lines and the fuzz property to `test/`.

**P0-2. Soy lecithin and soybean oil pass for a soy allergy, although the app's own rule excludes them.**

- Evidence:
  - `soy lecithin`, `soybean oil`, and `Contains: Soy Lecithin.` pass for a person with only the soy allergy (corpus L510, L512, L535).
  - The rule text says: "Refined soybean oil and soy lecithin are excluded by default and can be relaxed only with allergist input". The soy-free article says the same.
- Where: the rule text is at `data/conditions.json:2150`; the rule avoids only the `allergen-soy` and `soy` tags (`data/conditions.json:2141-2146`). The exclusion exists only in the separate soy-free module (`data/conditions.json:1805-1816`). The article is `data/articles.json:1179`.
- Fix: make the soy allergy do what its text says. Exclude `soy-lecithin` and `soy-refined-oil` by default, and relax them only through the existing allergist setting. No new clinical claim is needed; the source is already cited.

**P0-3. Typed food names that the food data flags pass in the label box.**

- Evidence:
  - Each flagged USDA food was typed by its plain name. For a wheat allergy, 10 pass, such as "Hamburger / hot dog bun", "Chicken tenders", "Bran Flakes", and "Grape-Nuts". For celiac, 7 pass. For a milk allergy, 2 pass: "Caramels" and "Potato salad with egg".
  - On a low histamine plan, "corned beef" passes. The list's alias "fresh beef" approves it, and the dictionary does not know "corned".
  - Commands: `node --test audit/tests/check-screen-consistency.test.mjs`, `node --test audit/tests/condition-labels.test.mjs`. Details: phase 3; phase 8, item 34.
- Where: `src/engine/checker.js:58-72`. `checkText` uses only the dictionary, while the food box (`checkFood`, `checker.js:106`) uses each food's own tags. The alias is at `data/diet-lists.json:2474`.
- Fix: when typed text matches a food's name, add that food's tags to the verdict. Make list aliases match whole names, not parts. Add the listed foods as tests.

**P0-4. Saved data that cannot be read is silently replaced.**

- Evidence: with a damaged save (cut-off JSON, or a `null` person), both builds opened as a new install with no message. The first new entry then overwrote the old data for good (`audit/e2e/data-safety.mjs`, checks e1 and e2, both builds).
- Where: `src/store.js:78-84`. The `catch` and the shape check return an empty profile and keep no copy.
- Fix: before anything else is saved, copy the unreadable text to its own key. Show "Your saved data could not be read" with "Save it as a file", and never overwrite it automatically. Add tests for both damage cases.

### P1

**P1-1. Time-restricted eating stays on in pregnancy, and for a child's profile.**

- Evidence: 1,419 condition plans (`audit/tests/condition-pairs.test.mjs`). The pregnancy row shows every other gated module off and this one on. No app test covers it.
- Where: `src/engine/plan.js:12`, `'intermittent-fasting': []`. The time-restricted-eating module (`data/conditions.json:6831`) was never mapped. The same map serves children at `plan.js:160`.
- Fix: map `intermittent-fasting` to `time-restricted-eating`, with a test that uses the real `data/conditions.json`.

**P1-2. A crafted backup file can run script through the age field.**

- Evidence: the payload ran on the lite Report and on the profile's Basics step, in both builds (`audit/e2e/xss.mjs`, phase 2). The proposed security policy stops it (`audit/e2e/csp.mjs`).
- Where:
  - `src/ui/lite.js:221` and `src/ui/people.js:325` write `person.age` unescaped.
  - `src/store.js:115-119` accepts any value types on import.
- Fix: escape both places. On import, check value types, turning numbers into numbers and rejecting the rest. Test with the crafted file.

**P1-3. Salt, soy sauce, and garlic salt pass for high blood pressure.**

- Evidence: `node --test audit/tests/condition-labels.test.mjs`. 14 salty labels pass (`audit/results/check-screen-consistency.json`, `sodium`).
- Where: the label checker looks at avoid tags only. The sodium limit (`data/conditions.json:368`) is a daily number, so no label ever flags salt.
- Fix: when a sodium limit is on file, show "Check the sodium on the label" for salt and high-sodium ingredients. That is a caution, not a number, and it rests on the limit's existing source; log the wording in `docs/VERIFY-log.md`.

**P1-4. Any other website at mchoisington.github.io can read, change, and replace Peace Meal's data.**

- Evidence (`audit/e2e/shared-origin.mjs`, Chromium): a page at another path on the same origin:
  - read the name, age, conditions, allergy, symptoms, and weights;
  - removed the peanut allergy, after which the app said PASS for peanuts;
  - replaced the offline copy, so the next launch ran its page.
- Where: GitHub Pages hosting. Every site on the account shares one origin (Phase 7, item 30). Whether another site exists today was not checked.
- Fix:
  - Move the app to its own origin, a custom domain or a separate account (costs and steps are in phase 7).
  - Until then, publish no other Pages site or third-party script on this account.
  - Add a fingerprint check for the cached page to the service worker.

**P1-5. A Safari tab never says its data is not saved safely.**

- Evidence: `audit/e2e/offline-iphone.mjs`, check 21.2 failed in both builds. The only warnings are the one-time guide and one line in Settings.
- Where: `src/ui/install.js:63-69` and `src/ui/settings.js:25`.
- Fix: in a Safari tab only, a banner on every screen: "Not saved safely. Add to Home Screen", with the move-your-data steps.

**P1-6. The old address strands data and runs a stale app.**

- Evidence (`audit/e2e/old-address.mjs`, the old build rebuilt from `b77787f` in Chromium):
  - Home Screen icons made from `/lite/` or `/full/` show GitHub's 404 page when online. They open the old app only in Airplane Mode.
  - Icons made from the old front page keep opening the pre-September app online, with none of the September safety fixes.
  - All 74 old deploys were from the old `main`, so no device has the September cache-first worker there (`audit/results/old-address-deploys.json`).
- Where: `mchoisington.github.io/specialty-nutrition-app/` returns 404 (live, September 30). The old workers are the old repository's `tools/bundle.mjs:79-92` and `sw.js` at `b77787f`.
- Fix: publish the tested "Peace Meal has moved" page and the replacement worker (`audit/proposals/old-address/`) at that path, from a user-site repository. The proposed page saves the old data to a file for "Bring my data". Details and the Airplane Mode fallback are in phase 7, item 31.

### P2

| # | Finding | Evidence | Where | Suggested fix |
|---|---|---|---|---|
| P2-1 | Lite takes 5.1 s to show Today at 1x, 24.5 s at 4x, and 37.5 s at 6x; full takes 0.64, 3.0, and 4.6 s. The whole week is rebuilt on every launch, and the matcher tries all 1,619 patterns on every ingredient line. Opened on Check, lite shows in 1.9 s at 4x. | `audit/e2e/perf.mjs`, `perf-profile.mjs` (phase 6) | `src/ui/lite.js:23`, `src/ui/week.js:16-24`, `src/engine/dictionary.js:118` | Show Today first and fill in "Planned" later, or keep the built week. Index dictionary terms by word, or tag recipe lines at build time. |
| P2-2 | Tests miss important mistakes: Stryker caught 65.6% of 990 planted bugs. Unprotected: unknown words for a limit-only or typed-allergy person, unreadable recipe lines, a FAIL softened to CAUTION, the personal avoid and tolerated lists, and strict mode per diet. README rule 6 (elimination diets in pregnancy) and rule 8 have no protecting test; `test/plan.test.mjs:113` uses its own made-up modules (`:5`). | phase 3, item 15; phase 8, item 35 | `checker.js:26, 31-32, 104, 136-139, 155-156, 164`; `dietlists.js:62, 111` | Add a test for each. |
| P2-3 | Keyboard focus leaves an open sheet (21 of 40 Tab presses on the lite symptom sheet). | `audit/e2e/a11y.mjs` | `src/ui/common.js:328` (only Escape is handled) | Keep Tab inside the sheet while it is open. |
| P2-4 | With text doubled, 12 of 27 screens scroll sideways. At 320 px, the lite report does. | `audit/e2e/a11y-reflow.mjs` | lite meal slots, recipe filters, plan meters, report table (`src/app.css`) | Let those rows wrap. Put the report table in its own scroll box. |
| P2-5 | 592 lite controls are 24 to 43 px, under the iPhone's 44-point guideline: 40 px buttons, and 78 heart and 78 "never" buttons. | `audit/e2e/a11y.mjs` | `src/app.css` (`.btn.small`, `.heart-btn`, `.never-btn`) | At least 44 px in the lite build. |
| P2-6 | Clear data in one build also wipes the other build's grocery checkmarks; Clear data keeps the device key. | data-safety c2; phase 2, item 8 | `src/ui/settings.js:87`, `src/ui/grocery.js:10` | Give each build its own grocery keys, with a migration. Also clear the device key. |
| P2-7 | Hosted-mode sharing (dormant on GitHub Pages): no sender authentication, no associated data, plain-text names in the shared store, a private key in plain localStorage, PBKDF2 at 310,000 iterations (OWASP: 600,000), and 40.69% test coverage. | phase 2, item 7 | `crypto.js:69-73, 76-80`; `sync.js:23, 68, 90-94, 120` | Before enabling hosted sharing: check the sender against known devices, add associated data, and raise the iterations. |
| P2-8 | 43 of 44 numeric rules have no supporting passage logged by rule id in `VERIFY-log.md` or `DATA-REVIEW.md` (every number does appear in the Phase 1 evidence). | phase 8, item 33 | `data/conditions.json` (list in `audit/results/data-quality.json`) | Log each passage; change no numbers. |
| P2-9 | Two September claims do not hold. Two fish numbers have no "why" and four are reworded (P7b); six approved vinegars are still a caution (Q9c). | `audit/tests/summary-claims.test.mjs`, `audit/scripts/why-lines.mjs` | `data/conditions.json` (`med-fish`, `preg-fish`, and others), `data/dictionaries.json` (vinegar tag) | Add and align the "why" lines. Make the vinegar tag honor the approved list. |
| P2-10 | Hard reading: median grade 9.1, and 930 sentences above grade 12. The FAIL headline "Contains a hard exclusion." is jargon for the lite user. | phase 8, item 36 (20 suggestions) | `src/ui/check.js:168` and the list | The suggested wording, clinical lines re-read against their sources. |
| P2-11 | Unnamed-source ingredients pass: `lecithin`, `modified food starch`, `maltodextrin`, `caramel`. US labeling law names allergen sources, so the risk is low on US labels. | corpus kind "source" | `data/dictionaries.json` | Decide with a source whether these should be "Not sure". |
| P2-12 | 526 of 841 lite recipes are "Not sure" for a peanut allergy, almost all from imported ingredient lines with words the dictionary cannot place. | `audit/scripts/recipe-caution-reasons.mjs` | imported recipes (`data/recipes-open.json`) | Link imported ingredients to foods, or teach the dictionary those words. |
| P2-13 | Diet list aliases approve longer names: 98 low histamine and 100 low FODMAP USDA foods. Food tags catch these in the food box, except typed text (P0-3). | phase 8, item 34 | `data/diet-lists.json` | Whole-name matching. |
| P2-14 | First visit on slow 4G (Lighthouse, live): lite first paint 7.6 s, full 13.7 s. Performance score 35 and 21. The full page carries 2.4 MB of USDA recipes that are off by default. | phase 6, item 26 | `tools/bundle.mjs` | Load USDA recipes only when switched on, as Wikibooks already is. |
| P2-15 | The label box raises false alarms on preparation words ("1 English muffin, split", "4 carrots, cut in sticks"). The recipe check is right. | `audit/scripts/recipe-label-disagreements.mjs` | `src/engine/dictionary.js:57-68` (noise words) | Add the common preparation words. |

### P3

| # | Finding | Where |
|---|---|---|
| P3-1 | 29 sources are never cited (listed in `audit/results/data-quality.json`). | `data/sources.json` |
| P3-2 | Diet list duplicates: lemongrass, rice malt syrup, corn, coconut milk. "french beans" carries the GOS tag. | `data/diet-lists.json` |
| P3-3 | 16 dead exports, 34 unused variables, 4 duplicated blocks, and the recipe-collection defaults written out 5 times. | phase 2, item 10 |
| P3-4 | `buildPlan` has complexity 302 and decides every safety gate in about 450 lines. | `src/engine/plan.js:119` |
| P3-5 | Five quadratic patterns: 2.7 s on an 80,000-digit pasted line. | `src/ui/recipes-edit.js:28, 30, 32, 34, 62` |
| P3-6 | `checkText` throws on a non-string object. The screens never pass one. | `src/engine/checker.js:58` |
| P3-7 | README rules 4 and 5 describe behavior the app no longer has: phases stop at a check-in, not an expiry, and the eating-disorder screen is not shown. | `README.md:57-58` |
| P3-8 | The September summary's size table is out of date. | `docs/AUDIT-2026-09-SUMMARY.md:107-112` |
| P3-9 | The display settings key is shared by both builds. | `src/ui/common.js:673-678` |
| P3-10 | Grocery ticks, display settings, and the guide flag fail silently when storage is full. | `src/ui/grocery.js:12, 15`, `common.js:678`, `install.js:79` |
| P3-11 | The photo reader's error loses its original cause. | `src/ui/check.js:39` |
| P3-12 | 101 exports are used by no other file (harmless in the bundle). | phase 2, item 10 |

## What passed, with numbers

- **The app's own checks:** validation OK, 183 of 183 tests pass, and both builds bundle (full 12,103,383 bytes, lite 5,847,582).
- **Label checker:**
  - Of the 745 allergen lines, 553 FAIL and 159 are "Not sure".
  - All 120 mixed-case lines FAIL. Of the 33 "may contain" lines, 32 FAIL and 1 is "Not sure".
  - Egg (60 lines) and fish (66 lines) had no wrong PASS.
  - Fuzz: 9,000 runs of allergen terms in any case and position, and unknown words on their own, with 0 failures. In 5,000 runs of random text, emoji, binary strings, and other values, the checker threw once, on a non-string object the screens never pass (P3-6). A 35,598-character label took 764 ms.
- **Conditions:** 1,419 plans with no crash, no conflicting number without a notice, and no Tier 2 number made up. Pregnancy turns off low FODMAP, low histamine, both weight-management variants, and low-carb and keto, and keeps celiac and allergy rules.
- **Recipes:** 41,520 checks (4,152 recipes by 10 profiles) with no crash, and no recipe passing while one of its lines is a hard stop. All 145 adapted recipes pass the diet they were adapted for.
- **September claims:** 24 of 27 hold. README rules 1 to 5 and 7 are each guarded by 1 to 10 app tests.
- **In the browser:**
  - Journeys: 17 of 17 steps.
  - Offline, updates, and iPhone modes: 26 of 28 checks.
  - Data safety: 24 of 34. The backup round trip is identical, the one-time move from the old storage key worked, a full storage shows "Not saved" and loses nothing, and "Try again" works.
- **Accessibility:**
  - axe-core found 0 WCAG 2.2 A and AA violations over 54 screen runs, light and dark.
  - Contrast: 7,488 pass, 0 fail.
  - Every control was reachable by keyboard, with a visible focus ring.
  - Reduced motion is honored.
  - The verdict, the Undo toast, and a failed save are announced.
  - Lighthouse accessibility: 100 in both builds.
- **Privacy and security:**
  - 0 requests off the device in normal use.
  - A photo makes 4 downloads and 0 uploads.
  - 5 of 5 pinned hashes match, and changed files are refused.
  - The second photo worked offline (Chromium).
  - Script injection was escaped in every text field except age.
  - 0 secrets, 0 personal details, and 0 matches for the private name list, in 333 blobs across 14 commits on every branch, including this audit's own files (`audit/scripts/secrets-scan.mjs`; the screenshots are images and were not text-scanned, and they show made-up people only).
  - The proposed security policy caused 0 violations.
  - The live site is byte for byte the `main` build.
- **Full build speed:** 640 ms to Home at 1x, matching the September summary's 645 ms.

## Not checked

| What | Why |
|---|---|
| WebKit (Safari's engine) in every browser test | Not installed here, and this environment does not allow downloading browsers. Everything ran in Chromium only. |
| A real iPhone: Home Screen storage, the 7-day Safari storage limit, "Save to Files", VoiceOver, text size, launch time, and the photo reader offline | No device. See `IPHONE-CHECKLIST.md`. |
| Speed on real phones | Chromium's CPU slowdown only approximates phones; iPhone JavaScript speed differs by model. |
| Screen readers | Only the roles and live regions were checked, not VoiceOver or TalkBack. |
| Hosted mode inside claude.ai (`sync.js`, `crypto.js` live) | Needs claude.ai's `window.claude`; reviewed by reading only (inferred, not observed). |
| Whether another GitHub Pages site exists on the account | Outside this audit's repository scope; the owner can check each repository's Settings, Pages. |
| The old-address proposal on real devices, and whether a user-site repository can serve `/specialty-nutrition-app/` | Simulated in Chromium; the GitHub Pages path rule is inferred, not tested. |
| `'wasm-unsafe-eval'` support in the iPhone's Safari version (security policy proposal) | No Safari here. Test the photo button if the policy is added. |
| Clinical accuracy of each rule against its source | Out of scope: the audit checked only whether passages are logged. No clinical content was re-judged or changed. |
| Printing on a real printer, and Android | No printer or Android device; the print dialog call was checked. |
| Lighthouse best practices for the full build | Lighthouse errored on the 12 MB page ("Request content was evicted from inspector cache"). |

## Deliverables and evidence

| File | What it is |
|---|---|
| `docs/audit-2026-09-30/REPORT.md` | This report. |
| `docs/audit-2026-09-30/IPHONE-CHECKLIST.md` | A 10-minute manual test for the iPhone. |
| `docs/audit-2026-09-30/FIX-PROMPT.md` | A ready-to-paste prompt that fixes every P0 and P1. |
| `CLAUDE.md` | Draft: commands, the September hard rules, and the layout. |
| `docs/audit-2026-09-30/ARCHITECTURE.md` | Phase 1: one-page map. |
| `docs/audit-2026-09-30/evidence/` | Phase 1 outputs; `phase2-static-security.md`, `phase3-safety-engine.md`, `phase4-5-browser-accessibility.md`, `phase6-performance.md`, `phase7-privacy-hosting.md`, `phase8-data-quality.md`, `phase8-plain-language.md`. |
| `docs/audit-2026-09-30/screenshots/` | 54 screenshots, light and dark, made-up people. `.gitignore` keeps `docs/screenshots/` out of the repository because screenshots can show profile names; these use invented names only and are kept at the audit's request, so delete the folder before merging if you prefer. |
| `audit/` | Every test, script, corpus, configuration, and result. It has its own `package.json`, and `node_modules` is git-ignored. |
