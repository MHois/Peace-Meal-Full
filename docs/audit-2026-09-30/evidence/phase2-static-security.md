# Phase 2 evidence: static analysis, XSS, crypto, error handling, secrets, dead code

Commit audited: `2a88538`. Every command below was run from the repository root. Raw outputs are in `audit/results/`.

## 5. ESLint (`audit/eslint.config.js`)

Command: `node audit/scripts/eslint-run.mjs` (runs `audit/node_modules/.bin/eslint -c audit/eslint.config.js -f json src tools sw.js` and writes `audit/results/eslint.json`)

Setup: ESLint 10.11.0 with the recommended JavaScript rules, eslint-plugin-no-unsanitized 4.1.5, and eslint-plugin-security 4.1.0. The run covered 58 files and produced 752 messages.

| Rule | Count (src / tools) | Checked how | Verdict |
|---|---|---|---|
| `security/detect-object-injection` | 462 (377 / 85) | Split by script into 339 reads and 123 writes. I read every write in `src/`. Each key comes from the app's own data files, a fixed key list, or a value the UI generates (a date, a slot, an id). No write two levels deep takes both keys from an imported file. A backup file with `__proto__` and `constructor.prototype` keys in six places was imported and every screen opened; `Object.prototype` stayed clean (`audit/e2e/xss.mjs`). | All false positives |
| `no-unsanitized/property` | 79 (79 / 0) | These are `innerHTML` sinks. They were traced by the dynamic test (item 6) and by `audit/scripts/html-interpolations.mjs`, which lists 747 template interpolations not wrapped in an escaping helper. Most of those call helpers that escape (`uiChip`, `uiSwitch`, `uiAvatar`) or print numbers the code computes. | 2 real (item 6); the rest are false positives |
| `no-unsanitized/method` | 3 (2 / 1) | `src/app.js:227` inserts fixed markup. `src/ui/lite.js:175` escapes both values with `uiEsc`. `tools/import-va.mjs:36` is a dynamic `import()`, not HTML. | False positives |
| `security/detect-non-literal-fs-filename` | 77 (0 / 77) | Build scripts in `tools/` that read and write the repository's own files. They never run in the app. | False positives |
| `security/detect-unsafe-regex` | 37 (14 / 23) | `audit/scripts/redos-check.mjs` ran each flagged pattern in `src/` on 20,000-character hostile inputs. Nine take under 2 ms. Five in `src/ui/recipes-edit.js` (lines 28, 30, 32, 34, 62) are quadratic: 137 ms at 20,000 digits and 2,725 ms at 80,000 on desktop. Only a pasted ingredient line of tens of thousands of digits reaches them. The 23 in `tools/` never run in the app. | 5 real but minor (P3); 32 false positives |
| `security/detect-non-literal-regexp` | 32 (11 / 21) | Every pattern built from a person's entry is escaped first: `checker.js:86`, `dictionary.js:11`, `dietlists.js:23`, `search.js:5`, `spice.js`. The unescaped ones are built from the app's own data files (`swaps.json`, `diet-lists.json`). | False positives |
| `security/detect-possible-timing-attacks` | 2 | `common.js:348, 699` compare `location.hash`, not a secret. | False positives |
| `no-unused-vars` | 39 (34 / 5) | See item 10. | Real, cleanup (P3) |
| `no-useless-escape` | 12 | Style only. | Real, cleanup (P3) |
| `no-useless-assignment` | 8 | Style only (for example `store.js:31, 40`). | Real, cleanup (P3) |
| `preserve-caught-error` | 1 | `check.js:39` rethrows without the original error, so the network cause is lost from the console. | Real, minor (P3) |

## 6. XSS

**Sinks.** There are 82 `innerHTML` and `insertAdjacentHTML` sinks in `src/`. There is no `outerHTML` and no `document.write`. The helper `uiEsc` (`src/ui/common.js:36`) escapes `& < > " '`, which is correct for text and for quoted attributes.

**Dynamic test** (`audit/e2e/xss.mjs`, results in `audit/results/xss.json`). Both builds were built and served as the Pages workflow builds them. Each payload is `"><img src=x onerror="__xss('<field>')">`. Paths tried:

1. A crafted backup file imported through Settings, the app's own Import button. Every field was poisoned, including dates, ids, and numbers.
2. The same text fields seeded straight into storage.
3. Label text typed into the label checker. Photo reading produces the same text, so this covers OCR too.
4. A recipe pasted into "Paste a recipe".
5. A round trip: the app saved its own state (week snapshot, grocery, household); then all 301 values it saved were poisoned, the page was reloaded, and every screen was opened again.
6. Any `javascript:` link, which would run when tapped.

The screens opened were Home, Today, Report, People, all 10 setup steps, Plan, Check, Week, Pantry, Together, Recipes (including a recipe's detail sheet), Grocery, Log, Learn, Sources, Settings, and Breathe.

**Result:** the payload ran in exactly one field, in two places, in both builds:

- `person.age` on the Report screen: `src/ui/lite.js:221` writes `, age ${person.age}` unescaped.
- `person.age` on the Basics setup step: `src/ui/people.js:325` writes `value="${person.age ?? ''}"` unescaped inside an attribute.

`importJSON` (`src/store.js:115`) checks only that `people` is an array, so a string age from a file is accepted as is. Every other text field (names, notes, recipes, symptoms, pantry, grocery, custom diets, other allergies, avoid words, labels, pasted recipes) was escaped on every screen visited. No `javascript:` link was rendered. Imported recipe collections render through the same escaped paths; the round trip covered week meals built from them.

## 7. `src/engine/crypto.js` and `src/engine/sync.js`

These are active only when the app runs inside claude.ai with a shared store (`sync.js:28-33`). The GitHub Pages copies never create a key or send anything.

**Algorithms.**
- Device keys are ECDH P-256, generated extractable (`crypto.js:18`).
- Each profile or share gets a fresh random AES-GCM-256 content key (`crypto.js:42-45`).
- The content key is wrapped with a key derived by static-static ECDH between the sender's long-term private key and the recipient's public key, then HKDF-SHA-256 with a random 16-byte salt and the info string `peace-meal-wrap-v1`, into AES-GCM-256 (`crypto.js:34-40, 62-68`).
- Owner recovery uses PBKDF2-SHA-256 with 310,000 iterations and a random 16-byte salt (`crypto.js:76-80`).

**Nonces and randomness.** Every encryption draws a fresh 96-bit IV from `crypto.getRandomValues` (`crypto.js:15, 50, 65`), and keys are fresh per message, so IV reuse is not a practical risk. `shortId` also uses `getRandomValues` (`crypto.js:92`).

**Wrong key or tampered data.** AES-GCM rejects both. `openPerson` turns the error into `{ locked: true, error: true }` (`sync.js:95`). `openShare` returns `null` (`sync.js:131`). `restoreOwnerBackup` lets the error reach its caller (`sync.js:140-141`).

**Findings.** All are dormant on GitHub Pages.
- **Sender not authenticated.** `unwrapKey` derives the key from the `sender` public key stored inside the record (`crypto.js:69-73`). `openPerson` never checks that key against `rec.deviceFingerprint` or a known device (`sync.js:90-94`). Anyone who can write to the shared store can replace a profile or share with content encrypted to the reader, and it opens as genuine. No associated data binds a box to its person id or recipient, so boxes can be swapped between records.
- **Plain-text names in the shared store.** `directory/<personId>` holds names and initials in plain text by design (`sync.js:68`). Shares carry `personName` and `fromName` in plain text (`sync.js:120`).
- **Private key in plain text.** The device private key sits in localStorage as a plain JWK (`sync.js:23`, `settings.js:127`). Clear data does not remove it (`settings.js:84-92`).
- **Iteration count below current guidance.** PBKDF2 at 310,000 iterations is under OWASP's current figure of 600,000 for PBKDF2-HMAC-SHA256 (OWASP Password Storage Cheat Sheet). The derived key is also made extractable for no need (`crypto.js:79-80`).
- **Almost untested.** `sync.js` has 40.69% line coverage, and 16 of its 19 exported functions have no test.

## 8. Error handling

`audit/scripts/swallowed-errors.mjs` found 74 `catch` blocks: 53 silent, 3 logged only, 18 shown to the person or returned as an error. Most silent ones guard optional features (storage probes, the share sheet, WebAssembly detection) and are harmless. The ones that can lose data or hide a problem:

- **`src/store.js:79-84` (P1 here; raised to P0 in `REPORT.md`, because it loses data and the report's P0 definition covers data loss).** When saved data cannot be read (JSON damaged, or a `null` in `people`), `load()` returns an empty profile and keeps no copy of what was there.

  The test in `audit/e2e/data-safety.mjs` shows what the person sees: the welcome screen of a new install, with no message. The first thing they then save (typing their name) overwrites the unreadable data for good. Result: `keptAtLaunch: true, warnedOnScreen: false, keptAfterFirstEntry: false, copyKeptAnywhere: false`, in both builds.
- **`src/store.js:115-119` (P2).** Import checks only that `people` is an array. Types are not validated, which is the root of the XSS above. Import replaces everything after one confirmation, and the replaced data is not kept for an undo (`settings.js:286-309`).
- **`src/ui/grocery.js:12, 15`, `common.js:678`, `install.js:79` (P3).** Grocery ticks, display preferences, and the Home Screen guide flag fail silently when storage is full. The main profile does show a save failure (`common.js:61-88`).
- **`src/ui/settings.js:85-91` (P2).** Clear data keeps `peace-meal:ui`, the Home Screen guide flag, and `peace-meal:device`. It also deletes every `sn-grocery:*` key, which the other build uses too (the keys are not per build).

## 9. Secrets and personal details

Command: `PM_PRIVATE_NAMES_FILE=<a file outside the repository> node audit/scripts/secrets-scan.mjs`

The scan covered every blob reachable from every ref (184 blobs, 22.3 MB, 7 commits including both pull request refs), every commit message and author line, and every untracked file.

It checked:
- 12 secret patterns: cloud, GitHub, Slack, Google, Stripe, OpenAI, and Anthropic keys; private key blocks; JWTs; private JWKs; credentials in URLs; password and key assignments.
- 4 personal-detail patterns.
- 3 private names taken from the September scrub list. The list is kept outside the repository and is not reproduced here.

**Result:** 0 secrets, 0 personal details, 0 private-name matches.

Allowed on purpose:
- GitHub's private `users.noreply.github.com` author addresses on the two web merges
- `noreply@github.com` and `noreply@anthropic.com`
- the National Alliance for Eating Disorders helpline number, a public organization line the app cites

Binary files (the two PNG icons and the font files) were not text-scanned. The icons are drawings.

## 10. Dead code, unused exports, duplication, complexity (`audit/scripts/dead-code.mjs`, jscpd)

- **Exports.** 101 exports in `src/` are used by no other app file. The bundle strips `export`, so this is harmless. 16 are not used even in their own file (dead): `dietlists.listItemsFor`, `household.isRostered`, `planner.SNACK_SLOTS`, `screen.SCOFF_ITEMS`, `screen.scoreScoff`, `screen.SUPPORT_TEXT`, `spice.spiceResetCache`, `swaps.adaptedApplies`, `common.uiCloseModal`, `common.uiPctClass`, `common.uiMinutesBucket`, `household.householdGroceryWeek`, `household.householdBuildList`, `learn.learnModuleHTML`, `sharing.sharingAvailable`, `together.togetherGroupPerson`. Three of them are used only by tests. The SCOFF screen code is kept on purpose: it has not been shown since September 9.
- **Unused variables.** 34 in `src/`. Thirteen are unused imports in `src/ui/together.js` alone. Also `planner.js:4 scaleTotals`, `household.js:76 hasNutrition`, and `household.js:83 favorites`.
- **Duplicated logic.** jscpd found 4 exact clones (1.21% of lines): licence texts, a CSS block, and two small code blocks (`today.js:140-145` and `475-480`; `household.js:68-73` and `planner.js:52-65`).

  By reading, I found three pieces of logic repeated by hand:
  - The default recipe-collection object is written out 5 times (`app.js:303`, `settings.js:216, 230`, `store.js:51`, plus the lite override at `app.js:397`). Adding the VA collection had to touch all five.
  - The "other allergies" cleanup is in both `checker.js:82` and `plan.js:141`.
  - "Has nutrition" is defined in `recipes.js:23`, `app.js:269`, `bundle.mjs:53`, and the unused `household.js:76`.
- **Ten most complex functions** (ESLint `complexity`, out of 2,272 functions):

  | Complexity | Function |
  |---|---|
  | 302 | `buildPlan` (`plan.js:119`) |
  | 105 | `recipesDetailModal` (`recipes.js:157`) |
  | 63 | `scoreRecipe` (`planner.js:96`) |
  | 60 | `ruleApplies` (`plan.js:67`) |
  | 51 | `sharingPersonModal` (`sharing.js:58`) |
  | 45 | `applyNumber` (`plan.js:434`) |
  | 45 | `peopleStepReview` (`people.js:1045`) |
  | 41 | `recipesEdParsePaste` (`recipes-edit.js:380`) |
  | 40 | `checkRecipe` (`checker.js:121`) |
  | 39 | `buildHouseholdWeek` (`household.js:120`) |

  `buildPlan` alone decides every safety gate (allergens, pregnancy, conflicts, Tier 2), in one function of about 450 lines.
