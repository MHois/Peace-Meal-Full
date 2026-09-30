# Phase 7 evidence: privacy, security, and hosting (items 28 to 32)

Everything here was run on September 30, 2026, against `main` at `2a88538`, in Chromium 141 (Playwright 1.56.1) at iPhone size (390 by 844, device scale factor 3, touch, iPhone Safari user agent). WebKit and a real iPhone were not available; see the report's "Not checked" list. Made-up data only.

## 28. Network requests, and the photo reader's integrity hashes

Commands:

```
node audit/e2e/network.mjs                     # results: audit/results/network.json
NODE_USE_ENV_PROXY=1 node audit/scripts/sri-check.mjs   # results: audit/results/sri.json
```

**Normal use, both builds** (every main screen, a typed label check, a food search, a recipe search and one recipe, Breathe, a backup file): the page made **0 requests to any other site**. The only requests were to the app's own address: the page, `sw.js`, `manifest.webmanifest`, and the two icons (6 paths per build). Chromium's own network log agrees: every request made for the app's pages went to the local test server, except `content-autofill.googleapis.com`, which is Chromium's autofill feature reacting to the form fields (the browser, not the app's code; Safari has no equivalent request, not checked). The log also shows Chromium's own background traffic (8 Google hosts, such as time sync and spell-check dictionaries), made for no page at all.

**A photo of a label** (a picture drawn in the test with printed text, read by the app's photo reader) in each build:

| | Lite | Full |
|---|---|---|
| Text read | `INGREDIENTS: WHEAT FLOUR, SUGAR, PEANUTS, SALT, SOY LECITHIN.` | same |
| Time (Chromium, this machine) | 1,833 ms | 1,605 ms |
| Requests to other sites | 4, all GET: `tesseract.min.js` and `worker.min.js` (cdnjs.cloudflare.com), `tesseract-core-simd-lstm.wasm.js` and `eng.traineddata.gz` (cdn.jsdelivr.net) | the same 4 |
| Requests that carried a body (an upload) | 0 | 0 |
| Verdict after "Check this list" (celiac and peanut profile) | FAIL | FAIL |

This matches the README ("All data stays in the browser on that device", `README.md:19`) and the screen's own note (`src/ui/check.js:74-77`): the photo is read on the phone and never sent. The first photo downloads 7,081,949 bytes (the SIMD path: 66,695 + 123,724 + 3,938,657 + 2,952,873); the app says "about 7 MB".

**Integrity hashes.** All 5 files pinned in `src/ui/check.js:15-19` were downloaded from the CDNs and hashed: **5 of 5 match** their SHA-384 pins (`audit/results/sri.json`). Both CDNs serve them with a one-year `immutable` cache header.

**The pins are enforced.** With one byte changed in the language data, and separately with a comment added to the main script (the test changed the files in flight), the reader **refused** both times and showed "The label reader could not load..." with no text added.

**Second photo with no internet.** In a kept browser profile, one photo was read online. Then the browser was restarted with the internet unreachable (the local app server still up). A second photo **was read** from the browser's cache. So "After that it usually works without Wi-Fi" held in Chromium; iPhone Safari's cache was not tested.

## 29. A Content Security Policy for GitHub Pages

GitHub Pages cannot send headers, so the only option is a `<meta http-equiv="Content-Security-Policy">` tag. Command: `node audit/e2e/csp.mjs` (results: `audit/results/csp.json`; the policy: `audit/results/csp-policy.txt`). The script derives a policy from the built pages, puts it into a **test copy** of the hosted site (the app is not changed), and runs both builds under it.

Proposed policy (the four `sha256` values are computed by the bundler at build time, one for each inline script in the page and in the inlined Breathe page):

```
default-src 'none';
script-src 'sha256-…' 'sha256-…' 'sha256-…' 'sha256-…' https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/tesseract.min.js 'wasm-unsafe-eval';
style-src 'unsafe-inline';
img-src 'self' data: blob:;
font-src data:;
connect-src 'self' data: https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/worker.min.js https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/ https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz;
worker-src 'self' blob:;
manifest-src 'self';
frame-src 'self';
base-uri 'none';
form-action 'none';
object-src 'none'
```

What it did under test (Chromium): both builds opened, registered the service worker, gave verdicts, searched recipes, saved a backup, ran Breathe (its own script inside the inlined frame), and read a photo, with **0 policy violations**. It also **stopped the Phase 2 script injection**: a backup whose age field carries an event handler ran that handler on the lite report and on the full profile screen without the policy, and **did not run it** with the policy (Chromium reported the refused inline handler).

What it could enforce: no script runs unless it is the app's own (by hash) or the one pinned photo-reader script; no inline event handlers (the app has none: `grep` found no `on…=` attributes in `src/`); the page can fetch only the four reader files and itself; no plugins, no `<base>` hijack, no form posts.

What it cannot do, or would cost:

- The script hashes change with every build, so `tools/bundle.mjs` must compute them and write the tag (about 20 lines plus a test). A hand-written tag would break the app on the next change.
- `style-src` must allow inline styles: the screens use 85 `style="…"` attributes (`grep -c 'style="' src/ui/*.js`). Injected CSS stays possible, but with `img-src` and `font-src` closed to other sites it cannot send data out.
- A meta tag cannot set `frame-ancestors` (framing protection), reporting, or `sandbox`; those need headers.
- The photo reader needs `'wasm-unsafe-eval'`. Browsers that do not know that keyword block WebAssembly under this policy. Current Safari is reported to support it (inferred, not observed; test the photo button on the iPhone after adding the tag).
- It does nothing about the shared origin (item 30): another page on the same origin is not bound by this page's policy.

## 30. Shared origin

Every GitHub Pages project site under `mchoisington.github.io` is the same browser origin, so they share `localStorage`, Cache Storage, and IndexedDB. Command: `node audit/e2e/shared-origin.mjs` (results: `audit/results/shared-origin.json`). The app ran at `/Peace-Meal-Full/lite/` with a made-up person, and an unrelated page at `/Other-Project/` on the same origin:

1. **Read.** The other page read the stored health data: name, age, conditions (hypertension, celiac), allergy (peanut), symptom log, and weights.
2. **Change.** It removed the peanut allergy. The app then answered **PASS** for "roasted peanuts, salt".
3. **Replace the app.** It overwrote the app's offline copy in Cache Storage. The next launch showed a page the other site wrote ("This is not Peace Meal"). The cache-first service worker serves whatever is in that cache.
4. **Could not** register its own service worker over `/Peace-Meal-Full/` (SecurityError). GitHub Pages cannot send the header that would allow it.

What that exposes: anyone who can publish to any Pages site on this account, and any third-party script such a site loads (analytics, embedded forms, chat widgets), can read, change, or replace Peace Meal on every device that opens that site. Whether another Pages site exists on the account today was not checked (outside this audit's repository scope). Today the account's root address returns 404.

Options, with their costs:

| Option | What it isolates | Cost |
|---|---|---|
| A custom domain for Peace Meal only (for example `app.<domain>`) | Everything: its own origin | A domain (about $10 to $20 a year) and a DNS record; HTTPS is free on Pages. Every device moves its data once with "Move my data" (a new origin starts empty) and re-adds the Home Screen icon. |
| A separate GitHub account or free organization just for Peace Meal (for example `<name>.github.io`) | Everything | Free; the same one-time move per device; one more account to look after. |
| Keep the origin and never publish another Pages site or third-party script under this account | Nothing technically; depends on discipline | Free; one mistake exposes the data. |
| Add an integrity check to the service worker (the worker holds the page's hash and refuses a cached copy that does not match) | Stops item 3 (a replaced app) | About 20 lines in `tools/bundle.mjs`; does not stop items 1 and 2. |
| Encrypt the stored data with a passphrase | Items 1 and 2 | A passphrase every launch, and a forgotten passphrase loses everything; a poor fit for the lite user. |

## 31. The old address

Commands and evidence:

- The old repository's workflow runs, listed through the GitHub connector: `audit/results/old-address-deploys.json`. There were 74 runs, **all on `main`**. The last deploy was `b77787f` on 2026-09-23 at 05:32 UTC.
- `git merge-base --is-ancestor` in the old repository: the September cache-first worker (`50fee3b`) and the per-app caches (`8029767`) are **not** on the old `main`. No run ever deployed them, so **no device can have the September cache-first worker at the old address**.
- The old workers, at `b77787f`:
  - `lite/` and `full/` (written by `tools/bundle.mjs:79-92` at that commit) ask the network first and use the stored copy only when the network fails.
  - The old front page's worker (`sw.js` at that commit) answers pages from its stored copy first, and data files from the network first.
- Live today: every path under `/specialty-nutrition-app/` returns 404 (`curl`, September 30).
- Simulation: `node audit/e2e/old-address.mjs` (results: `audit/results/old-address.json`). It rebuilds the old site from `b77787f` exactly as its workflow did, serves it on the same local origin as the new site, and switches it between up, gone (404, as today), offline, and the proposal below. This ran in Chromium; iPhone Safari was not run.

What an existing user sees (Chromium, measured):

| Where the icon or tab came from | Online today | No connection (Airplane Mode) |
|---|---|---|
| Home Screen icon made from `/lite/` or `/full/` | GitHub's 404 page. The app does not open. | The old app opens from its stored copy, with the person's data. Its Settings > Export JSON saved a file with the data. |
| Home Screen icon made from the old front page | **The pre-September app still opens** from its stored copy, with the data, and never updates. It lacks every September safety fix and gives no sign it is out of date. | Same. |
| A Safari tab (one storage for the whole origin) | Opening the new address picks up the old data by itself: the new app's one-time copy from the old key ran, and the person showed. | Not applicable. |

**Safest way to move them** (proposal; nothing was published):

1. **A "Peace Meal has moved" page at the old address**, at `/`, `/lite/`, and `/full/`: `audit/proposals/old-address/index.html`. It runs inside the old icon's own storage, reads the old data (it never changes or deletes anything), and offers "Save my information". It uses the iPhone share sheet ("Save to Files") where available, otherwise a download. Then it links to the matching new app.
   - Simulated: the old `lite/` and `full/` icons showed the page online. The saved file held the data, and "Bring my data" in a new, empty icon of the new app brought the person in. The file saved in Airplane Mode from the old app imported the same way.
   - One consequence, measured: after the page is seen once online, the old worker stores it in place of the old app, so Airplane Mode then shows the "moved" page instead of the old app. The data is still readable, and the page still saves it.
2. **A replacement `sw.js` for the old front page**: `audit/proposals/old-address/sw.js`. It asks the network first and deletes nothing. Simulated: with the moved page alone, the front-page icon kept showing the stored old app. With the replacement worker, the second open showed the moved page.
3. **Where to publish it:** the path `/specialty-nutrition-app/` can be served only by a Pages site in a repository named `specialty-nutrition-app`, or by a user-site repository `mchoisington.github.io` holding a `specialty-nutrition-app/` folder (inferred from how GitHub Pages maps paths, not tested). The user-site route leaves the old private repository alone. It is on the same origin as the app, like any Pages site (item 30), and would hold only these two files. Keep it up until every old icon has been moved, then remove it.
4. Until then, the manual route works for `/lite/` and `/full/` icons (simulated): turn on Airplane Mode, open the old icon, then Settings > Send a backup (or Export JSON) > Save to Files. Turn Airplane Mode off, add the new address to the Home Screen, and use "Bring my data".

## 32. The live site serves the current build

Command: `NODE_USE_ENV_PROXY=1 node audit/scripts/live-stamp.mjs` (results: `audit/results/live-stamp.json`).

| | Stamp in live `sw.js` | `main` on GitHub | Live page compared with a local build of that commit |
|---|---|---|---|
| lite | `2a8853859b4e` | `2a8853859b4e` | identical, 5,845,335 bytes |
| full | `2a8853859b4e` | `2a8853859b4e` | identical, 12,101,128 bytes |
