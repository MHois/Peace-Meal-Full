# Phases 4 and 5 evidence: browser tests and accessibility (items 17 to 24)

All runs: September 30, 2026, `main` at `2a88538`. The hosted site was built the way `.github/workflows/pages.yml` builds it (`tools/bundle.mjs --lite --pages`, `tools/bundle.mjs --pages`, the landing page, the icon, and a build stamp; `audit/e2e/site.mjs`). It was served from a local static server under `/Peace-Meal-Full/`. Browser: Chromium 141.0.7390.37 through Playwright 1.56.1, at 390 by 844 CSS pixels, device scale factor 3, touch, and an iPhone Safari user agent. Made-up people only.

**WebKit was not run.** It is not installed here, and this environment forbids downloading browsers (`playwright install`). iPhone Safari differences are covered by `IPHONE-CHECKLIST.md`.

## 17 and 18. Journeys: 17 of 17 steps pass

Command: `node audit/e2e/journeys.mjs` (results: `audit/results/journeys.json`; screenshots of any failed step would go to `audit/results/journey-failures/`).

| Step | Result |
|---|---|
| 17.1 Lite first launch shows the welcome, with large text on by default (body text 20 px) | pass |
| 17.2 Setup: name, age, a peanut allergy, celiac disease; saved and complete | pass |
| 17.3 Typed label "wheat flour, sugar, salt" shows FAIL for celiac | pass |
| 17.4 An unknown word shows "Not sure. Ask before eating." | pass |
| 17.5 Log a meal ("I ate this" on Today after building the week) | pass |
| 17.6 Log a symptom for Yesterday (saved with yesterday's date) | pass |
| 17.7 Remove shows the Undo toast, and Undo puts the entry back | pass |
| 17.8 "Feeling fine" once a day: the button is disabled after one tap, 1 entry | pass |
| 17.9 The doctor report lists the day and has a working Print button | pass |
| 17.10 Send a backup saves a file with the person in it | pass |
| 17.11 No script errors during the lite journey | pass |
| 18.1 Full: two people with different conditions and allergies | pass |
| 18.2 Build a week: meals on every day, no FAIL chip for the active person | pass |
| 18.3 Grocery list has items | pass |
| 18.4 Recipe search: the Wikibooks note shows before searching, and Wikibooks results appear after the first search | pass |
| 18.5 Print the one-page plan (the print dialog is called) | pass |
| 18.6 No script errors during the full journey | pass |

Two earlier runs failed at 17.2 and 18.1 because the test itself held stale references to checkboxes, and then because a forced click on a hidden checkbox landed on the fixed tab bar. Both were test harness problems, fixed in the harness (the boxes are now tapped through their labels, as a person does), not app bugs.

## 19. Data safety: 24 of 34 checks pass (both builds; one of the 24, c4, is an observation)

Command: `node audit/e2e/data-safety.mjs` (results: `audit/results/data-safety.json`), run in Phase 2.

- **Pass in both builds:**
  - a1 to a3: the backup holds everything, and importing it into an empty browser restores it with no difference in the compared JSON.
  - b1 to b3: the one-time copy from the old storage key, with the old copy kept.
  - c1 and c3: Clear data leaves the other build's profile and removes this build's own.
  - d1 to d3: a full storage quota shows the "Not saved" alert, loses nothing already saved, and "Try again" saves once there is room.
- **Fail, both builds: c2.** Clear data in one build also wipes the other build's grocery checkmarks. The `sn-grocery:<week>` keys are shared (`src/ui/grocery.js:12-15`).
- **Fail, both builds: e1 and e2.** When the saved data cannot be read (a cut-off JSON string, or a `null` entry in `people`), the app says nothing and starts empty. The first new entry then overwrites the unreadable data, so it is gone. Code: `src/store.js:78-84` returns an empty profile from the `catch` and from the shape check. (The screen in c4 kept the shared display settings, recorded as an observation.)

## 20 and 21. Offline, updates, and iPhone modes: 26 of 28 checks pass

Command: `node audit/e2e/offline-iphone.mjs` (results: `audit/results/offline-iphone.json`).

- **Pass in both builds:**
  - The service worker registers and caches the build.
  - With the network off, a reload opens the app from its offline copy, with the person's data.
  - A changed build shows "Update ready, tap to reload". The tap switches to the new build, clears only this app's old cache, and keeps the data.
  - The other build's offline copy survives the update.
- **Pass in both builds, iPhone modes:**
  - The Add to Home Screen guide shows in a Safari tab (`navigator.standalone` false) and not in the Home Screen app (true).
  - It shows once.
  - It offers "Save a backup" when the tab holds data, and that gives a file.
  - The Home Screen app's first screen offers "Bring my data", which brought the tab's data in. A separate browser context stood in for the icon's separate storage.
- **Fail, both builds: 21.2.** There is no "Not saved safely" banner. In a Safari tab, the only warnings are the one-time guide (`src/ui/install.js:63-69`) and one line in Settings (`src/ui/settings.js:25`). Nothing on the everyday screens says that data in a Safari tab is kept apart from the Home Screen app and can be cleared by the browser.

## 22. Screenshots

Command: `node audit/e2e/screenshots.mjs`: 54 JPEGs in `docs/audit-2026-09-30/screenshots/` (lite 13 screens and full 14 screens, each light and dark, at CSS pixel size; 2.0 MB).

## 23. axe-core: no violations

Command: `node audit/e2e/a11y.mjs` (results: `audit/results/a11y.json`). axe-core 4.13 ran every rule tagged WCAG 2.0, 2.1, and 2.2 at levels A and AA, on every main screen of both builds, in light and dark (54 screen runs): **0 violations**. That includes 2.5.8 Target Size (Minimum), 4.1.2 Name, Role, Value (every button and field has an accessible name), and 1.4.3 Contrast.

## 24. Measurements

Commands: `node audit/e2e/a11y.mjs` and `node audit/e2e/a11y-reflow.mjs` (results: `audit/results/a11y.json`, `audit/results/a11y-reflow.json`).

| What | Result |
|---|---|
| Text contrast (axe `color-contrast`, both builds, light and dark) | 7,488 text elements pass, 0 fail. 22 could not be judged by axe: 1 on the lite report in each theme (background partly covered), and 2 on full Home and 8 on full Today in each theme (content too short to judge). |
| Touch targets under 24 by 24 | 27 per build by raw size. All but three are visually hidden inputs and labels whose visible target is their label (switches, segmented controls, file inputs). The three real ones are a 22 px tall link ("Where the recipes come from", lite Settings; 18 px in full Settings) and two 20 px "About ..." buttons on the full Plan. axe's target-size rule passes them under its spacing exception. |
| Lite controls from 24 to 43 px (under the 44 point iPhone guideline) | 592 across the lite screens: 220 small buttons, 40 px tall (for example Back, Swap, Edit, Delete); 126 form inputs, 119 of them 24 by 24 checkboxes and radio buttons; 78 heart and 78 "never" buttons on recipe cards; 38 chips; 22 labels; 13 brand links; and 17 others. |
| 1.4.10 Reflow: 320 px wide at the app's own text size | Only lite Report scrolls sideways (419 px). The report table is not inside its own sideways-scrolling box, so the whole page moves. |
| 1.4.4 Resize text: 390 px wide with the text doubled | 12 of 27 screens scroll sideways: lite Today (443 px), Recipes (495), Report (738), Plan (556), Grocery (453), People (405), and Learn (576); full Home (402), Plan (468), Today (400), Recipes (436), and Learn (495). No visible text is cut off. Causes named by the script include the lite meal slots, the recipe filter selects, the plan meters, the report table, and chip rows. |
| The stricter combination: 320 px and doubled text together | 14 screens scroll sideways (recorded in `a11y.json`). |
| Keyboard only | Every control on lite Today, Check, and Settings and on full Home, Week, and People was reached with Tab, and every focused element showed a visible focus ring (0 without). |
| Focus in a sheet | On the lite symptom sheet, Tab left the sheet 21 times in 40 presses (focus is not kept inside), and Escape closes it. |
| Reduced motion | `src/app.css` and `breathe.html` each have 2 `prefers-reduced-motion` rules. With reduced motion on, Breathe ran no animations. |
| Announcements | The label verdict area is `aria-live="polite"` and `aria-atomic="true"`; the Undo toast is `role="status"`; the failed-save bar is `role="alert"`. All three are announced. |
