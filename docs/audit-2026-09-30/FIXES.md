# Fix pass for the audit of September 30, 2026

Branch `fix-audit-2026-09-30`, September 30 to October 1, 2026. Nothing was pushed to `main`, nothing was force-pushed, and no history was rewritten. You review and merge.

There are 43 fix commits, each named for its finding (P2-1 and P2-10 took two commits each; P0-2, P0-3, and P2-13 each have a follow-up; 5994f8a covers P0-3 and P2-13 together). Each message says how the change was tested and measured. `npm run check` was run again on each of the 43 on October 1: validation and the bundle pass on all of them, and every test passes on every commit except 95d0e1f (P0-2), which went in with one failing test ("tag allergen-soy cites unknown source fda-food-allergies-page"). The next commit, c6f9fdc, fixed it.

The audit is in `REPORT.md` (same folder). This file says what changed for each finding, how it was measured, what is left for you to decide, and what could not be checked.

## In one minute

- **Fixed:** all 4 P0 findings; P1-1, P1-2, P1-3, and P1-5; the parts of P1-4 and P1-6 that code can do; all 15 P2 findings; the P3 findings that touch the person using the app (P3-5, P3-6, P3-9, P3-10, P3-11) and the defaults part of P3-3; P3-1, P3-2, and P3-8 are listed, guarded by tests, or brought up to date. Five problems the audit did not list were found and fixed on the way (N1 to N5).
- **The audit's own tests:** 58 of 79 passed before the fix pass, 79 of 79 now.
- **Safety:** misspelled, badly scanned, and masked allergen words that passed: 25 to 0. A made-up word next to a known word, 3,000 random tries: 2,825 passed before, 0 now. Soy lecithin and soybean oil now stop a soy allergy by default. Salty foods are a caution for anyone with a sodium limit. A crafted backup can no longer run script (0 of the audit's payloads run).
- **The iPhone:** in Chromium at phone size with the CPU slowed 4 times (the audit's stand-in for a mid-range phone), lite Today now shows in 1.9 s; the audit measured 24.5 s. Not measured on a real iPhone. Unreadable saved data is kept and named instead of silently replaced. A Safari tab says on every screen that its data is not saved safely.
- **Needs you:** moving the app to its own web address (P1-4), publishing the page for the old address (P1-6), four README lines that no longer match the app, and a short list of data and design choices. All are below, with steps.

## Decisions that are yours

### 1. P1-4: give the app its own web address

**Done, October 8, 2026, with option A below:** the repository was copied with its full history to the free organization MHois, and the app now lives at `https://mhois.github.io/Peace-Meal-Full/`. The original repository and its site stay up until every phone has moved its data.

**Why:** every GitHub Pages site of one account shares one web origin (`mchoisington.github.io`). A page from any other Pages site on this account can read and change what Peace Meal saves on a phone. The fix pass closed the worst part in code: the app never runs a saved copy of itself that another site changed (P1-4, commit 7609256). It cannot stop another site on the same origin from reading or changing the saved data. Only a separate origin does that.

**Today, without a move:** publish no other Pages site on this account (the README says so). The one planned exception is the page for the old address (P1-6), which loads nothing and sends nothing.

**Two ways to move, either one is enough:**

| | A. A separate free GitHub organization | B. A custom domain on the Peace-Meal-Full repository |
|---|---|---|
| New address | `<organization>.github.io/Peace-Meal-Full/` | for example `peacemeal.<your domain>` |
| Cost | Free | A domain registration, paid every year (I did not look up current prices) |
| Steps | 1. On GitHub, create a free organization. 2. Push a copy of the Peace-Meal-Full repository to it, with the same name. 3. Turn Pages on there as it is now. Keep the original repository and its Pages site until every phone has moved. | 1. Buy the domain. 2. Add a CNAME record pointing to `mchoisington.github.io`. 3. In the Peace-Meal-Full repository: Settings, Pages, Custom domain; tick Enforce HTTPS. |
| Watch out | Push a copy; do not transfer the repository. A transferred repository's old Pages address stops working at once, with the data still there. | Put the custom domain on the **project** repository only. A custom domain on a user-site repository (`mchoisington.github.io`) moves every project site of the account to that domain. GitHub may also send the old address to the new domain as soon as it is set (not tested here). |

After either move, update the two places that write the address out: `tools/gen-guides.cjs` (the printed iPhone guides) and `tools/old-address/index.html` (its "Open the new Peace Meal" links; its script hash then changes, and `test/old-address.test.mjs` prints the new one).

**Either way, save each phone's data first,** because saved data belongs to the address it was saved at and the new address starts empty. Before you change anything: on each phone, open Peace Meal, Settings, **Send a backup**, Save to Files. After the move: open the new address, Add to Home Screen, then **Bring my data** on its first screen with that file. It is a few taps on each phone; someone may need to sit with the person doing it.

### 2. P1-6: publish the page for the old address

People still on the pre-September address (`mchoisington.github.io/specialty-nutrition-app/`) see GitHub's 404 page, and an icon made from the old front page keeps running the pre-September app with none of the safety fixes. The kit is ready and tested in `tools/old-address/` (commit 1008d3c). Its README has the exact steps; in short: create a new public repository named `mchoisington.github.io`, add the four files listed there, turn on Pages from `main`, never add a custom domain to it, check the moved page, move each phone's data with **Save my information** and **Bring my data**, then delete the repository when every old icon is moved. Cost: free. Not checked on a real iPhone (Chromium only).

### 3. README lines that no longer match the app

The README's safety rules stay as written (your rule), so these are pointed out, not changed:

- **Rule 4,** "Elimination phases expire. The app prompts reintroduction and requires acknowledgment to continue past the maximum." The app does not do that: a phase stays until the person moves it, with an optional check-in reminder (`src/engine/plan.js`, around line 319: "A phase never ends on its own"). Either the rule or the code should change; that is a clinical decision.
- **Rule 5,** "A positive eating-disorder screen turns off ...". The screen has not been shown since September 9, so nothing can trigger the rule.
- **Rule 8,** "There is no language model in the app." True on GitHub Pages. When the app runs as a claude.ai artifact, the custom-diet screen offers "Ask Claude", which calls claude.ai's own model (`src/ui/people.js`, around line 829) and shows only there. Either remove that button or say "outside claude.ai" in the rule.
- **"What is inside", `data/dictionaries.json`:** "This is the only thing the app uses to recognize allergens and restricted foods." Since P0-3, a typed food name also carries the tags of that food in `data/foods.json` (USDA data), as the fix prompt asked. Suggested wording: "Ingredient terms to tags. With the tags on foods in foods.json, the only thing the app uses to recognize allergens and restricted foods."

### 4. Hosted sharing, before it is ever switched on (P2-7)

Hosted sharing works only inside claude.ai; it never starts on GitHub Pages, and until N5 it did not start in any built page at all. The three things the audit asked for are done (sender check, records bound to their place, 600,000 passphrase rounds). Left for you, because each changes how sharing works for people:

- Names in the store's directory, and a share's person name, are plain text by design, so anyone in the store sees who is in it.
- The device's private key is a plain JWK in localStorage, because the owner backup needs to export it.
- The store has no rules of its own: a device that can write to it can register itself or overwrite the owner record. The next step would be for each device to remember the owner's key and each publisher's key the first time it sees them, with a screen for a real change of device.
- Records written before October 2026 (format 1) still open. Once every record has been rewritten, format 1 can be refused.

### 5. Data and design choices

- **"french beans" (P3-2).** USDA's food data uses the name for a dried bean ("Beans, french, mature seeds, raw"); in British use French beans are green beans. The app reads it as a bean (a caution on low FODMAP, never a pass), the stricter reading. The low FODMAP list also names "french beans" as green beans; I recommend taking that alias out. Not done: the data rules say delete nothing without you.
- **Two misplaced list names (P3-2):** "rice malt syrup" under rice and "coconut milk" under almond milk. Both names have their own better-placed item and the answer is the same either way; they could come out.
- **29 sources nothing cites (P3-1),** listed by group in `docs/DATA-REVIEW.md`. Most belong to conditions removed on September 9 (POTS, CRPS, migraine, non-celiac gluten sensitivity). Kept.
- **Dead code (P3-3, P3-12):** 16 exports used nowhere and 34 unused variables (13 of them imports in `src/ui/together.js`), and two small pieces of logic written twice ("other allergies" cleanup in `checker.js` and `plan.js`; "has nutrition" in `recipes.js`, `app.js`, the bundler, and `household.js`). Harmless in the built page, which strips exports. Kept.
- **P3-4:** `buildPlan` decides every safety gate in one function of complexity 302. A refactor now would put the safety gates at risk for no change a person would see. If you want it, do it in small steps with the verdict snapshot (below) run before and after each one.
- **"May contain" warnings that name the person's own allergen** are a stop whatever the "may contain" setting says. Should "allow" make those a caution instead? I left them a stop.
- **Lupin is now a stop for every peanut allergy** (N3), because FARE's peanut page lists "Lupin (or lupine)" under foods to avoid. Some allergists treat lupin separately.
- **Heart failure:** a medicine effect names `suppress:potassium-encouragement`, but no rule has that id, so it does nothing. A validator warning would catch the next one.
- **Bread is not a milk label check** (it was not before either); some breads contain milk.
- **First visit on slow 4G (P2-14):** the full page is 2.6 MB compressed, and on a first visit over slow 4G its first paint stays about 13.4 s. Making it smaller would mean fetching recipes as separate files, which is a new network request (your rule says none). Starting the app before the recipe blocks finish downloading would roughly halve a real first visit with no new request, but it changes the start-up order of both builds; not done. After the first visit the page comes from the phone.

## Every finding: what changed and how it was measured

"Before" is the code at the start of the fix pass unless it says otherwise. Each test file named here was written first and failed on the code before its fix, apart from three files of guard tests, which were proved by planting the bug they guard. The section after this one shows those runs for every file.

### P0

| ID | What was wrong | What changed | Before → after | Test | Commit |
|---|---|---|---|---|---|
| P0-1 | A misspelled or badly scanned allergen word next to a known word passed ("penut butter" was read as butter). | Every word in a piece of an ingredient list must be placed (a matched term, an amount, a preparation word, or a descriptor); any other word makes it "Not sure". Every occurrence of a term is judged, not only the first. 37 dictionary entries so common words are placed. `src/engine/dictionary.js`. | Audit corpus typo, scanning, and masked false PASS 25 → 0; fuzz B2 2,825 of 3,000 → 0. | `test/audit-fix-p0-1-unmatched-words.test.mjs` | 6169638 |
| P0-2 | Soy lecithin and soybean oil passed for a soy allergy. | New food-allergies rule `allergen-soy-oil-lecithin`, on by default with a soy allergy; the allergist can allow both on the Allergies step. Soy tag description corrected (FDA, F1). | The three corpus lines and four more labels now FAIL; 61 recipes move from pass to "check the label". | `test/audit-fix-p0-2-soy-oil-lecithin.test.mjs` | 95d0e1f, c6f9fdc |
| P0-3 | A food the food box flags passed when its name was typed ("Caramels" for milk). | The label box and recipe lines look up a typed food's exact name in the food data and add its tags; a commercial product's words stay "not recognized". `src/engine/checker.js`, `src/app.js`. | Typed flagged names that passed: milk 1 → 0, wheat 3 → 0, celiac 1 → 0, low histamine 1 → 0, low FODMAP 4 → 0. Audit check-screen-consistency: 6 of 14 failing on the commit before → 14 of 14 passing. | `test/audit-fix-p0-3-typed-food-names.test.mjs`, `test/audit-fix-p0-3-recipe-lines.test.mjs` | 5994f8a, 405b9c7 |
| P0-4 | Saved data that could not be read was silently replaced by a new profile. | The unreadable text is copied aside before anything is saved, every screen says so with "Save it as a file", and Settings lists the copies. `src/store.js`, `src/ui/common.js`, `src/ui/settings.js`. | Audit data-safety e1 and e2 (8 checks) fail → pass; data-safety 24 of 34 → 32 of 34 (34 of 34 after P2-6). | `test/audit-fix-p0-4-unreadable-data.test.mjs` | 4a45e2c |

### P1

| ID | What was wrong | What changed | Before → after | Test | Commit |
|---|---|---|---|---|---|
| P1-1 | Time-restricted eating stayed on in pregnancy and for a child (README rule 6). | The "intermittent-fasting" feature maps to the time-restricted-eating module. `src/engine/plan.js`. | Audit condition-pairs 4 of 5 → 5 of 5. | `test/audit-fix-p1-1-pregnancy-gating.test.mjs` | 82b0208 |
| P1-2 | A crafted backup could run script through the age field. | Age is escaped in the lite Report and the Basics step; import checks every value by type, keeps the replaced data, and offers a 10-second Undo. `src/ui/lite.js`, `src/ui/people.js`, `src/store.js`. | Audit XSS: the age payload ran in both builds → 0 payload runs. | `test/audit-fix-p1-2-import-types.test.mjs` | 753272c |
| P1-3 | Salt and soy sauce passed for high blood pressure. | New tag "High in salt" on 106 words (and "can be high" on 74), each checked against USDA records (F4); a caution with any daily sodium limit. | Audit condition-labels 8 of 11 → 11 of 11. For high blood pressure and type 2 diabetes: 2,281 recipe lines, 71 corpus labels, and 86 Wikibooks recipes pass → caution. | `test/audit-fix-p1-3-sodium.test.mjs` | 3983c5c |
| P1-4 | Another site on the address could replace the app's offline copy. | The service worker checks each saved file against the fingerprint of its own build and never runs a changed copy. `tools/lib/pages-sw.mjs`. The rest is decision 1. | Audit shared-origin step 3 fixed; steps 1 and 2 (reading and changing data) need decision 1. | `test/sw.test.mjs` (2 new tests) | 7609256 |
| P1-5 | A Safari tab never said its data is not saved safely. | A banner on every screen in a Safari tab, with "Show me how" and "Hide for today". `src/ui/install.js`. | Audit offline-iphone 21.2 fails → passes in both builds. | `test/audit-fix-p1-5-safari-banner.test.mjs` | 05ed6e3 |
| P1-6 | The old address strands data and runs a stale app. | The tested "Peace Meal has moved" kit, with steps, in `tools/old-address/`. Publishing is decision 2. | Kit tested in Chromium with the old app rebuilt. | `test/old-address.test.mjs` | 1008d3c |

### P2

| ID | What was wrong | What changed | Before → after | Test | Commit |
|---|---|---|---|---|---|
| P2-1 | Lite took 24.5 s to show Today at 4x slowdown. | The matcher looks up patterns by word (part 1). Lite draws Today at once and fills in the planned meals after the first paint; the built week is kept until something it depends on changes (part 2). | Tagging every recipe line 26.0 s → 0.66 s. Lite first screen at 1x, 4x, 6x CPU: audit 5.1, 24.5, 37.5 s → 437, 1,941, 3,018 ms. No verdict changed (part 1, snapshot). | `test/audit-fix-p2-1-matcher-index.test.mjs`, `test/audit-fix-p2-1-week-cache.test.mjs` | 046a77b, 6c9e2f4 |
| P2-2 | Planted bugs went unnoticed by the tests; README rule 8 had no test. | Nine tests for the unprotected places, and a test that the built pages request nothing but the pinned photo-reader files. | Planted bugs caught: 0 of 11 → 11 of 11. | `test/audit-fix-p2-2-test-gaps.test.mjs` | 1d45f5a |
| P2-3 | Tab left an open sheet (21 of 40 presses on the lite symptom sheet). | Focus stays inside every kind of sheet. `src/ui/common.js` (`uiTrapTab`). | 21 of 40 → 0 of 40. | `test/audit-fix-p2-3-sheet-focus.test.mjs` | 61726f5 |
| P2-4 | 12 of 27 screens scrolled sideways with text doubled. | Rows wrap or shrink; long words break; report tables scroll in their own box. `src/app.css`, `src/ui/lite.js`. | Doubled text 12 → 0 screens; 320 px 1 → 0; both together 14 → 0. | `test/audit-fix-p2-4-reflow.test.mjs` | df549de |
| P2-5 | 572 lite controls were under 44 px. | A 44 px minimum for lite controls. `src/app.css`. | 572 → 131 (September 30) and 134 (October 1); the rest are grocery checkboxes inside 44 px rows that tick when tapped, and text labels. | `test/audit-fix-p2-5-touch-targets.test.mjs` | 38603f3 |
| P2-6 | Clear data in one build wiped the other build's grocery ticks, and left the device key. | Each build keeps its own ticks (copied once from the shared keys, which stay); Clear data removes the device key. `src/store.js`. | Audit data-safety c2 fails → passes; 34 of 34. | `test/audit-fix-p2-6-grocery-keys.test.mjs` | 71533d0 |
| P2-7 | Hosted sharing: no sender check, nothing binding a record to its place, 310,000 passphrase rounds, 40.69% test coverage. | Sender's key must be the named device's registered key; new records bound to their person or share (format 2; format 1 still opens); 600,000 rounds for new owner backups; the share inbox names the sender from the device list. The rest is decision 4. | Forged and moved profiles and shares opened → refused. Coverage of `sync.js` 40.69% → 98.9%. | `test/audit-fix-p2-7-hosted-sharing.test.mjs` | e360e01 |
| P2-8 | 43 of 44 numeric rules had no supporting passage logged. | A row per rule in `docs/VERIFY-log.md` with its passage, quoted word for word. No number changed. | Logged: 1 of 44 → 44 of 44. | `test/audit-fix-p2-8-numeric-passages.test.mjs` | b03f583 |
| P2-9 | Two claims in the September summary did not hold. | Every number's "why" comes from its own article; the two approved vinegars pass on low histamine (F6). | Audit summary-claims 25 of 27 → 27 of 27. | `test/audit-fix-p2-9-why-and-vinegar.test.mjs` | 8d247e1 |
| P2-10 | The hardest text people read was not plain. | Plain words on the Check screen, Today, Plan, Learn, articles, and the hardest clinical lines; every medical term kept, with an explanation beside it (F8). | 14 tests check that each old clinical term is still there and the jargon is gone. | `test/audit-fix-p2-10-plain-words.test.mjs`, `test/audit-fix-p2-10-clinical-lines.test.mjs` | 64803a4, 8e523b4 |
| P2-11 | Lecithin, modified food starch, and caramel passed. | Each is a label check, from FDA and FARE (F5); maltodextrin stays a pass (EU 1169/2011, Annex II). | Audit allergen-corpus 13 of 13; 6 corpus results pass → caution. | `test/audit-fix-p2-11-unnamed-sources.test.mjs` | e3cbc63 |
| P2-12 | 526 of 841 lite recipes were "Not sure" for a peanut allergy, mostly from everyday words. | 21 synonyms, each copying an existing entry exactly (F10), and equipment words as noise. | Lite peanut: pass 256 → 302; "Not sure" from unplaced words 490 → 419. | `test/audit-fix-p2-12-recipe-words.test.mjs` | 629a6d3 |
| P2-13 | A list name matched a word anywhere ("beef" approved "corned beef"). | List names must cover the whole name; food-data names use a list of processed-food words (F2, F3). | USDA foods with a diet's avoid tags that its list approved: low FODMAP 100 → 1, low histamine 98 → 3 (explained in the test). | `test/audit-fix-p0-3-typed-food-names.test.mjs` | 5994f8a, ec6c64a |
| P2-14 | The full page carried 2.4 MB of USDA recipes that are off by default. | They ship in a block read only when the collection is on. `tools/bundle.mjs`, `src/app.js`. | Full first screen 643, 2,852, 4,342 ms → 554, 2,620, 3,924 ms (1x, 4x, 6x). Lighthouse, served compressed: score 21 → 23, blocking time 1.83-1.97 → 1.42-1.51 s; first paint unchanged at about 13.45 s (see decision 5). | `test/audit-fix-p2-14-usda-deferred.test.mjs` | 66ad6ac |
| P2-15 | Preparation words after a comma ("split", "toasted") raised false alarms. | 55 new noise words; strict mode treats such a piece as empty. | Recipes that pass while a line is a caution in the label box: peanut 23 → 18, low FODMAP 60 → 10, low histamine 48 → 7, milk 13 → 8. | `test/audit-fix-p2-15-preparation-words.test.mjs` | b30d80f |

### P3

| ID | Finding | What was done | Test | Commit |
|---|---|---|---|---|
| P3-1 | 29 sources never cited. | Listed by group in `docs/DATA-REVIEW.md`, kept; a new uncited source fails the test. | `test/audit-fix-p3-1-uncited-sources.test.mjs` | b327b12 |
| P3-2 | Diet-list duplicates; "french beans" GOS tag. | Checked: no answer depends on list order, and the bean reading is the stricter one (decision 5). Guard tests. | `test/audit-fix-p3-2-diet-list-names.test.mjs` | a9121ff |
| P3-3 | Dead code; the collection defaults written five times. | The defaults are written once (`src/store.js`). Dead code kept (decision 5). | `test/audit-fix-p3-3-collection-defaults.test.mjs` | 0117f31 |
| P3-4 | `buildPlan` complexity 302. | Not changed (decision 5). | | |
| P3-5 | A huge pasted line froze the recipe editor (24.4 s measured here). | Five patterns look at the first 500 characters; the longest real line is 218. 24.4 s → 8 ms. | `test/audit-fix-p3-5-long-lines.test.mjs` | c2dc08d |
| P3-6 | `checkText` threw on input it could not turn into text. | Such input is "Not sure", never a pass; audit fuzz property C passes. | `test/audit-fix-p3-6-checker-input.test.mjs` | dbfcca8 |
| P3-7 | README rules 4 and 5 describe behavior the app no longer has. | Pointed out, not changed (decision 3). | | |
| P3-8 | The September summary's size table was out of date. | A dated update with today's measured sizes. | (documentation) | 0ffe2ac |
| P3-9 | Both builds shared one display-settings key. | One key per build, copied once from the shared key, which stays. | `test/audit-fix-p3-9-display-keys.test.mjs` | 827b8b1 |
| P3-10 | Small saves failed silently when storage was full. | Grocery ticks, display settings, and the guide's "done" mark say so. | `test/audit-fix-p3-10-storage-full.test.mjs` | 127a916 |
| P3-11 | The photo reader's error lost its cause. | The browser's error is kept as the cause and logged. | `test/audit-fix-p3-11-reader-cause.test.mjs` | 919a858 |
| P3-12 | 101 exports used by no other file. | Not changed: harmless in the built page. | | |

### Found during the fix pass (not in the audit report)

| ID | What was wrong | What changed | Before → after | Test | Commit |
|---|---|---|---|---|---|
| N1 | Red and white wine vinegar were a hard alcohol stop in pregnancy. | The wine entries say a vinegar made from them is not the drink, as "wine" already did (F7). | Recipes for a made-up pregnant person: 57 fewer hard stops. | `test/audit-fix-n1-wine-vinegar.test.mjs` | c60a32e |
| N2 | Cooking spray passed for a soy allergy. | Cooking and baking spray are soy label checks (266 of 327 USDA branded cooking sprays list soy lecithin; F9). | Soy profile: 11 recipe lines and 6 recipes pass → caution. | `test/audit-fix-n2-cooking-spray.test.mjs` | 69189e1 |
| N3 | "nuts" of unknown kind passed for a peanut allergy. | A peanut label check; lupin and artificial nuts stop a peanut allergy (FARE; F11). | Peanut profile: 29 recipe lines, 2 recipes, 2 corpus labels pass → caution. | `test/audit-fix-n3-generic-nuts.test.mjs` | d25a8c0 |
| N4 | Whole wheat and gluten-free pasta shapes were judged as plain pasta. | The shapes follow the pasta entry's forms; lasagna keeps its milk and egg checks (F12). | 9 recipe lines and 1 recipe caution → pass (high blood pressure and type 2 diabetes). | `test/audit-fix-n4-pasta-shapes.test.mjs` | 633a847 |
| N5 | Hosted sharing failed at start in every built page ("C is not defined"). | Named imports; the bundler refuses the import that caused it. | Seen in Chromium with a stand-in store: error → device registered, no error. | `test/audit-fix-n5-namespace-import.test.mjs` | d33558a |

## Failing first, passing now

Each test file was run as its own commit wrote it on the commit just before that fix, and in its final form on the last commit. Apart from three files of guard tests and P1-6's test, all 36 files fail on the commit before their fix: 134 of their 173 tests. Each has at least one failing test, and the tests that pass there check behavior that was already right.

- Two files cannot load on the commit before their fix, because they import something the fix itself adds. With a do-nothing stand-in for it, both fail.
- P1-6's test reads the kit that P1-6 adds, so it cannot run before it.
- Stand-ins also cover two paths the tests need: `tools/lib/pages-sw.mjs` before P1-4 (it returns the worker that commit builds, checked byte for byte against its build) and `PM_BUNDLE_OUT` before P2-14 (it copies the built file to the test's folder). No stand-in was committed.
- The three guard files test behavior that was already right, so they pass before. Planting the bug each one guards makes it fail; those plants were run again on October 1.

| Finding | Test file | Run on the commit before the fix | Now (0ffe2ac) |
|---|---|---|---|
| P0-1 (6169638) | `audit-fix-p0-1-unmatched-words.test.mjs` | 046a77b: 4 of 5 fail | 5 of 5 pass |
| P0-2 (95d0e1f) | `audit-fix-p0-2-soy-oil-lecithin.test.mjs` | b30d80f: 2 of 4 fail | 4 of 4 pass |
| P0-3 (405b9c7) | `audit-fix-p0-3-recipe-lines.test.mjs` | 3983c5c: 6 of 7 fail | 7 of 7 pass |
| P0-3, P2-13 (5994f8a) | `audit-fix-p0-3-typed-food-names.test.mjs` | c6f9fdc: cannot load: `indexFoodNames` is new in this fix. With a do-nothing stand-in: 9 of 13 fail | 13 of 13 pass |
| P0-4 (4a45e2c) | `audit-fix-p0-4-unreadable-data.test.mjs` | ec6c64a: cannot load: `UNREADABLE_MARK` and `releaseUnreadable` are new in this fix. With a do-nothing stand-in: 6 of 6 fail | 6 of 6 pass |
| P1-1 (82b0208) | `audit-fix-p1-1-pregnancy-gating.test.mjs` | 4a45e2c: 4 of 5 fail | 5 of 5 pass |
| P1-2 (753272c) | `audit-fix-p1-2-import-types.test.mjs` | 82b0208: 5 of 5 fail | 5 of 5 pass |
| P1-3 (3983c5c) | `audit-fix-p1-3-sodium.test.mjs` | 753272c: 9 of 10 fail | 10 of 10 pass |
| P1-4 (7609256) | `sw.test.mjs` | 405b9c7: 2 of 10 fail (the 2 new tests; stand-in for `tools/lib/pages-sw.mjs` that returns the worker this commit builds) | 10 of 10 pass |
| P1-5 (05ed6e3) | `audit-fix-p1-5-safari-banner.test.mjs` | 7609256: 3 of 3 fail | 3 of 3 pass |
| P1-6 (1008d3c) | `old-address.test.mjs` | 05ed6e3: cannot run: `tools/old-address/` is new in this fix | 6 of 6 pass |
| P2-1 (046a77b) | `audit-fix-p2-1-matcher-index.test.mjs` | 2be5a9a: 1 of 3 fail (the test that counts the patterns tried; the other 2 check that the index gives the same answers as a full scan, which the old matcher is) | 3 of 3 pass |
| P2-1 (6c9e2f4) | `audit-fix-p2-1-week-cache.test.mjs` | 633a847: 4 of 4 fail | 4 of 4 pass |
| P2-2 (1d45f5a) | `audit-fix-p2-2-test-gaps.test.mjs` | 1008d3c: all 9 pass (guards for behavior that was already right); each of the 11 bugs the audit planted, put back one at a time, makes a test fail, checked again on October 1 | 9 of 9 pass |
| P2-3 (61726f5) | `audit-fix-p2-3-sheet-focus.test.mjs` | 71533d0: 5 of 5 fail | 5 of 5 pass |
| P2-4 (df549de) | `audit-fix-p2-4-reflow.test.mjs` | 61726f5: 2 of 2 fail | 2 of 2 pass |
| P2-5 (38603f3) | `audit-fix-p2-5-touch-targets.test.mjs` | df549de: 1 of 1 fail | 1 of 1 pass |
| P2-6 (71533d0) | `audit-fix-p2-6-grocery-keys.test.mjs` | 8e523b4: 6 of 6 fail | 6 of 6 pass |
| P2-7 (e360e01) | `audit-fix-p2-7-hosted-sharing.test.mjs` | d33558a: 7 of 9 fail | 9 of 9 pass |
| P2-8 (b03f583) | `audit-fix-p2-8-numeric-passages.test.mjs` | e360e01: 3 of 4 fail | 4 of 4 pass |
| P2-9 (8d247e1) | `audit-fix-p2-9-why-and-vinegar.test.mjs` | e3cbc63: 5 of 7 fail | 7 of 7 pass |
| P2-10 (8e523b4) | `audit-fix-p2-10-clinical-lines.test.mjs` | 64803a4: 7 of 7 fail | 7 of 7 pass |
| P2-10 (64803a4) | `audit-fix-p2-10-plain-words.test.mjs` | c60a32e: 7 of 7 fail | 7 of 7 pass |
| P2-11 (e3cbc63) | `audit-fix-p2-11-unnamed-sources.test.mjs` | 1d45f5a: 3 of 4 fail | 4 of 4 pass |
| P2-12 (629a6d3) | `audit-fix-p2-12-recipe-words.test.mjs` | 69189e1: 3 of 4 fail | 4 of 4 pass |
| P2-14 (66ad6ac) | `audit-fix-p2-14-usda-deferred.test.mjs` | 6c9e2f4: 4 of 5 fail (stand-in for `PM_BUNDLE_OUT` that copies the built file) | 5 of 5 pass |
| P2-15 (b30d80f) | `audit-fix-p2-15-preparation-words.test.mjs` | 6169638: 3 of 5 fail | 5 of 5 pass |
| P3-1 (b327b12) | `audit-fix-p3-1-uncited-sources.test.mjs` | 0117f31: both pass (guards for behavior that was already right); a planted uncited source, and a deleted one of the 29, each make a test fail, checked again on October 1 | 2 of 2 pass |
| P3-2 (a9121ff) | `audit-fix-p3-2-diet-list-names.test.mjs` | 919a858: both pass (guards for behavior that was already right); a second serve on one copy of "rice malt syrup", and "french beans" made a plain vegetable, each make a test fail, checked again on October 1 | 2 of 2 pass |
| P3-3 (0117f31) | `audit-fix-p3-3-collection-defaults.test.mjs` | a9121ff: 3 of 3 fail | 3 of 3 pass |
| P3-5 (c2dc08d) | `audit-fix-p3-5-long-lines.test.mjs` | dbfcca8: 1 of 3 fail | 3 of 3 pass |
| P3-6 (dbfcca8) | `audit-fix-p3-6-checker-input.test.mjs` | 127a916: 1 of 2 fail | 2 of 2 pass |
| P3-9 (827b8b1) | `audit-fix-p3-9-display-keys.test.mjs` | b03f583: 2 of 3 fail | 3 of 3 pass |
| P3-10 (127a916) | `audit-fix-p3-10-storage-full.test.mjs` | 827b8b1: 3 of 3 fail | 3 of 3 pass |
| P3-11 (919a858) | `audit-fix-p3-11-reader-cause.test.mjs` | c2dc08d: 2 of 2 fail | 2 of 2 pass |
| N1 (c60a32e) | `audit-fix-n1-wine-vinegar.test.mjs` | 8d247e1: 2 of 4 fail | 4 of 4 pass |
| N2 (69189e1) | `audit-fix-n2-cooking-spray.test.mjs` | 38603f3: 2 of 2 fail | 2 of 2 pass |
| N3 (d25a8c0) | `audit-fix-n3-generic-nuts.test.mjs` | 629a6d3: 2 of 3 fail | 3 of 3 pass |
| N4 (633a847) | `audit-fix-n4-pasta-shapes.test.mjs` | d25a8c0: 2 of 4 fail | 4 of 4 pass |
| N5 (d33558a) | `audit-fix-n5-namespace-import.test.mjs` | 66ad6ac: 3 of 3 fail | 3 of 3 pass |

On `main` (2a88538), the app that is live now, the final versions of the same 40 files: 8 cannot load (they use a helper that a fix in this pass added, the kit in `tools/old-address/`, or the P2-14 build folder), the three guard files pass, and each of the other 29 has failing tests. All 192 tests in the 40 files pass on the last commit.

## Clinical changes and their sources

Every clinical change rests on a passage logged in `docs/VERIFY-log.md`, rows F1 to F12, and the P2-8 section logs the passage behind every numeric rule. In short:

| Row | Change | Source |
|---|---|---|
| F1 | Soy: lecithin is not exempt from allergen labeling; refined soybean oil is | FDA Food Allergies page; FALCPA |
| F2 | P0-1's dictionary entries, among them margarine with milk and soy label checks | 21 CFR 166.110; FDA allergen Q&A, edition 5 |
| F3 | List names cover the whole name; 14 named canned fish left out on low histamine | the lists' own items and sources; Sánchez-Pérez 2021 for canned fish |
| F4 | "High in salt": more than 600 mg sodium per 100 g, by USDA record | UK front-of-pack guidance; USDA FoodData Central |
| F5 | Lecithin, modified food starch, caramel are label checks; maltodextrin is not | FDA; FARE; EU 1169/2011, Annex II |
| F6 | Approved vinegars pass on low histamine | SIGHI leaflet 2021-11-17 |
| F7 | Wine vinegars are not alcohol | EC 479/2008, Annex IV; Callejon et al. 2018 |
| F8 | Plain words for the hardest clinical lines, meaning unchanged | Violi 2016, re-read; the others named in the row |
| F9 | Cooking and baking spray | USDA FoodData Central branded records |
| F10 | 21 synonyms | none needed: each copies an existing entry |
| F11 | Generic nuts, lupin, artificial nuts | FARE peanut page |
| F12 | Pasta shapes | the pasta entry's own forms |

Sources that could not be read from here, so nothing was changed on their word alone: the 2025 AHA/ACC hypertension guideline (HTTP 403), ACG 2021, AGA 2022 and 2025, ADA 2026 section 5, the JAMA Portfolio full text (paywall), and AHA's consumer sugar page (403).

## Tests changed on purpose

| Test | Old expectation | New expectation | Why |
|---|---|---|---|
| `test/final-review-2026-09.test.mjs` | the low-carb SGLT2 notice matches `/clinician signoff/` | matches `/needs your doctor's OK/` | P2-10: the same notice in plain words |
| `test/audit-2026-09.test.mjs` [1] | "2 bay leaves", "1 french stick", "4 tablespoons low fat spread" are not recognized; "1 french stick" is a caution for celiac | the same checks use "2 pandan leaves", "1 bloomer", "4 tablespoons dairy spread"; "1 french stick" is a stop for celiac; "1 bloomer" carries "an unknown bread is never a pass" | P2-12: those words are now known foods (bay leaf, bread, margarine); no check dropped or loosened |
| `test/va-recipes.test.mjs` | store.js's new-profile object contains `va: true` | `RECIPE_COLLECTION_DEFAULTS` contains `va: true` | P3-3: the defaults are written once; VA is still on by default |
| `audit/corpus` line L470 (maltodextrin) | not a pass for wheat | a pass, with the reason in the line | P2-11: EU 1169/2011 exempts wheat-based maltodextrins, and FARE does not list it |
| `test/sw.test.mjs` (its browser stand-in) | cache keys kept the part after "#" | the part after "#" is ignored, as browsers do | P1-4: needed for the new tests to model a browser correctly |
| `test/audit-fix-p0-3-typed-food-names.test.mjs`, the P2-13 leftovers (a test added in this pass) | four USDA foods with an avoid tag that a list still approves, each explained | six, compared without regard to order | P2-13 follow-up (ec6c64a): two more "Pork, leg (ham), rump half" records are fresh pork, tagged from the word "ham" |

## Recipes and labels whose verdict changed

From `audit/scripts/verdict-snapshot.mjs`, which judges every recipe (4,152), every recipe line typed as a label (23,807), and every audit corpus label (775) for twelve made-up profiles. "Caution" includes "Not sure".

The made-up profiles: peanut, milk, wheat, and soy allergies; shellfish and sesame together; kiwi, an allergy the person types in; celiac disease; high blood pressure with type 2 diabetes; low FODMAP (IBS); low histamine (MCAS); vegan; and no restrictions.

**The safety check that matters most:** across the whole fix pass, no recipe, recipe line, or corpus label that was a stop (FAIL) for any profile became a caution or a pass. The profile with no restrictions did not change at all. Every pass that became a caution is the app saying "Not sure" or "check the label" where it used to say nothing; every caution that became a pass is a word the app now knows (P2-12, P2-15, N4), an approved food it now reads correctly (P2-9, N1, P0-3), or a single-ingredient food named in full.

**The whole fix pass**, from its first commit to its last:

| Profile | Recipes | Recipe lines typed as labels | Audit corpus labels |
|---|---|---|---|
| celiac | caution→fail 34, caution→pass 93, pass→caution 123 | caution→fail 35, caution→pass 813, pass→caution 1220, pass→fail 10 | caution→fail 1, caution→pass 1, pass→caution 33 |
| fodmap | caution→pass 5, pass→caution 29 | caution→pass 1918, pass→caution 1412 | pass→caution 38 |
| histamine | caution→pass 4, pass→caution 33 | caution→pass 1779, pass→caution 1312 | caution→pass 1, pass→caution 57 |
| hypertension+t2d | caution→pass 62, pass→caution 149 | caution→pass 635, pass→caution 3278 | caution→pass 1, pass→caution 98 |
| kiwi | caution→pass 189, pass→caution 281 | caution→pass 887, pass→caution 1493 | caution→pass 2, pass→caution 43 |
| milk | caution→fail 2, caution→pass 82, pass→caution 114 | caution→fail 4, caution→pass 747, pass→caution 1258 | caution→pass 1, pass→caution 33 |
| peanut | caution→pass 182, pass→caution 272 | caution→pass 880, pass→caution 1502 | caution→pass 2, pass→caution 44, pass→fail 3 |
| shellfish+sesame | caution→pass 182, pass→caution 269 | caution→pass 874, pass→caution 1476 | caution→pass 2, pass→caution 42 |
| soy | caution→fail 1, caution→pass 126, pass→caution 288 | caution→pass 765, pass→caution 1535, pass→fail 3 | caution→fail 7, caution→pass 1, pass→caution 44, pass→fail 4 |
| vegan | caution→pass 77, pass→caution 85 | caution→pass 796, pass→caution 1161 | caution→pass 2, pass→caution 34 |
| wheat | caution→fail 35, caution→pass 110, pass→caution 139 | caution→fail 32, caution→pass 828, pass→caution 1253, pass→fail 11 | caution→pass 1, pass→caution 35 |

**P0-1 alone** (the commit before it to the commit itself). Almost all of it is unknown words becoming "Not sure", as README rule 7 requires; the three "pea nut" corpus lines became a stop for a peanut allergy:

| Profile | Recipes | Recipe lines typed as labels | Audit corpus labels |
|---|---|---|---|
| celiac | caution→fail 22, caution→pass 25, pass→caution 128 | caution→fail 21, caution→pass 220, pass→caution 1258, pass→fail 7 | caution→fail 1, caution→pass 1, pass→caution 31 |
| fodmap | pass→caution 15 | caution→pass 58, pass→caution 693 | pass→caution 13 |
| histamine | caution→pass 2, pass→caution 20 | caution→pass 9, pass→caution 680 | pass→caution 23 |
| hypertension+t2d | caution→pass 12, pass→caution 78 | caution→pass 211, pass→caution 1129 | caution→pass 2, pass→caution 27 |
| kiwi | caution→pass 50, pass→caution 292 | caution→pass 226, pass→caution 1537 | caution→pass 2, pass→caution 43 |
| milk | caution→pass 13, pass→caution 121 | caution→pass 156, pass→caution 1300 | caution→pass 1, pass→caution 32 |
| peanut | caution→pass 47, pass→caution 282 | caution→pass 226, pass→caution 1519 | caution→pass 2, pass→caution 42, pass→fail 3 |
| shellfish+sesame | caution→pass 49, pass→caution 279 | caution→pass 226, pass→caution 1520 | caution→pass 2, pass→caution 42 |
| soy | caution→pass 48, pass→caution 264 | caution→pass 226, pass→caution 1483 | caution→pass 2, pass→caution 42 |
| vegan | caution→pass 25, pass→caution 89 | caution→pass 206, pass→caution 1194 | caution→pass 2, pass→caution 34 |
| wheat | caution→fail 23, caution→pass 28, pass→caution 145 | caution→fail 19, caution→pass 220, pass→caution 1291, pass→fail 8 | caution→pass 1, pass→caution 33 |

**P0-3 and P2-13** (one commit, 5994f8a). The low FODMAP and low histamine changes are P2-13, list names that must now cover the whole name:

| Profile | Recipes | Recipe lines typed as labels | Audit corpus labels |
|---|---|---|---|
| celiac | caution→pass 1 | caution→fail 4, caution→pass 49 | none |
| fodmap | pass→caution 17 | caution→pass 77, pass→caution 835 | pass→caution 25 |
| histamine | pass→caution 17 | caution→pass 12, pass→caution 745 | pass→caution 34 |
| hypertension+t2d | none | caution→pass 43, pass→caution 37 | pass→caution 1 |
| kiwi | caution→pass 1 | caution→pass 54 | none |
| milk | caution→pass 1 | caution→fail 4, caution→pass 50 | none |
| peanut | caution→pass 1 | caution→pass 54 | none |
| shellfish+sesame | caution→pass 1 | caution→pass 54 | none |
| soy | caution→pass 1 | caution→pass 54 | none |
| vegan | none | caution→pass 48, pass→caution 7 | none |
| wheat | caution→pass 1 | caution→fail 3, caution→pass 50 | none |

**P0-3 follow-up** (405b9c7), recipe lines that name a food:

| Profile | Recipes | Recipe lines typed as labels | Audit corpus labels |
|---|---|---|---|
| celiac | caution→fail 2, caution→pass 3 | pass→caution 7 | none |
| fodmap | caution→pass 1 | none | none |
| hypertension+t2d | pass→caution 1 | pass→caution 3 | none |
| kiwi | caution→pass 4 | pass→caution 11 | none |
| milk | caution→fail 2, caution→pass 3 | pass→caution 8 | none |
| peanut | caution→pass 4 | pass→caution 11 | none |
| shellfish+sesame | caution→pass 4 | pass→caution 11 | none |
| soy | caution→pass 4 | pass→caution 11 | none |
| vegan | caution→pass 1 | pass→caution 8 | none |
| wheat | caution→fail 2, caution→pass 3 | pass→caution 8 | none |

## Corrections to commit messages

- P2-15 says "51 preparation, serving, and fat-content words". The commit lists 56, of which 55 were new to the noise words (258 to 313).
- P0-1 says the seeded made-up-word test "passed 1,000 of 1,000 draws" before. Run on the code before P0-1 (with a stand-in for a helper the test needs), 796 of 1,000 passed, and 4 of the file's 5 tests failed.
- P0-3 says the audit's check-screen-consistency test "failed 5 of 14 on the same code". On the commit before P0-3 it failed 6 of 14 (5 of 14 at the audit).
- P1-3 says "Before the fix 8 of 9 tests failed; after, 10 of 10 pass": the tenth test was added after the failing run.
- P2-5 says 131 lite controls are left under 44 px (measured September 30). The October 1 runs measured 134, then 148 in the final re-run: 126 grocery checkboxes (today's list is longer; each sits inside a 44 px row that ticks it when tapped) and the same 22 text labels. The count follows the length of the week's grocery list.

## The final re-run

The audit's tests and its browser, data, rule, and privacy checks were run again on the last code commit, 0ffe2ac (October 1, 2026). The browser checks ran in Chromium at iPhone size. Not repeated at the end: Lighthouse, readability, and the shared-origin check were measured at the commits that changed them (the tables above), and the audit's full Stryker mutation run was not repeated; the 11 planted bugs it found are each caught now (P2-2).

| Check | Result |
|---|---|
| `npm run check` (validate, every test file, and the bundle) | passes, 367 of 367 tests |
| Speed, `audit/e2e/perf.mjs` (median of 7; the audit used 9) | First screen at 1x, 4x, and 6x CPU slowdown: lite 424, 1,922, and 3,004 ms (the audit: 5,054, 24,457, and 37,470 ms); full 521, 2,403, and 3,765 ms (the audit: 640, 2,997, and 4,646 ms). |
| The audit's own tests, `node --test audit/tests` | 79 of 79 pass (58 of 79 before the fix pass) |
| Data safety, `audit/e2e/data-safety.mjs` | 34 of 34 |
| Crafted backups, `audit/e2e/xss.mjs` | No payload runs, no `javascript:` links, no page errors. The crafted backup's text is kept as plain text (273 saved values in each build) and shown escaped, so none of it runs. |
| Offline and iPhone modes, `audit/e2e/offline-iphone.mjs` | 28 of 28. Line 21.2 still prints the audit's note "the code has no such banner". That note is fixed text in the audit script, written before P1-5; the check itself passes. |
| Journeys, `audit/e2e/journeys.mjs` | 17 of 17 |
| Accessibility, `audit/e2e/a11y.mjs` | axe, WCAG 2.2 A and AA: no violations. Tab never left the open sheet, and Escape closes it. On the six screens walked with Tab, every control showed where focus was. No sideways scrolling at 320 px with text at 200%. With reduced motion on, no animation runs. |
| Small controls (same run) | Under 24 px: 27 in each build, as at the audit. In lite, 26 are 1 by 1 px hidden inputs and labels, and one is the "Where the recipes come from" link (22 px tall). In full, 24 are hidden inputs and labels, and three are text links 18 to 20 px tall ("Where the recipes come from", and "About Celiac disease" and "About Food allergies" on Plan). axe's target-size rule passes all of them. Lite controls from 24 to 43 px: 148, which are 126 grocery checkboxes inside 44 px rows and 22 text labels (P2-5). |
| Reflow and contrast, `audit/e2e/a11y-reflow.mjs` | No sideways scrolling at 320 px, none with text doubled at 390 px, and no text cut off. Contrast: 8,092 pass, 0 fail, and 28 that axe could not decide. |
| Rule mutations, `audit/scripts/rule-mutations.mjs` | Each of the 10 planted breaks of README rules 1 to 8 makes tests fail (from 1 to 29 tests each). |
| Verdict snapshot, `audit/scripts/verdict-snapshot.mjs` | No stop became milder (the section above). |
| Secrets and privacy, `audit/scripts/secrets-scan.mjs` | 0 secrets and 0 personal details in 513 files and file versions across all 58 commits, and in every commit message. No name on the private name list (kept outside the repository) is in any file, any earlier version of a file, any commit message, or the text of any of the 56 pictures, which were read with OCR this time. The scan's raw count for that list is not zero, because one entry on the list used this time is also an everyday English word; the matches were checked with the list hidden, and each one is that word in an ordinary sentence. |

## What was not checked

- **Safari and a real iPhone.** WebKit is not installed here. Every browser check ran in Chromium at iPhone size with an iPhone user agent.
- **claude.ai hosting.** Hosted sharing was checked with a stand-in for claude.ai's shared store, in Node and in the built page, not inside claude.ai.
- **The sources listed above** that refused the request or are paywalled.
