# Phase 6 evidence: performance and size (items 25 to 27)

Run on September 30, 2026, against `main` at `2a88538`. Browser: Chromium 141 through Playwright, at iPhone size, on this machine (a cloud virtual machine), with nothing else running. CPU slowdown is Chromium's own throttling: 4x stands in for a mid-range phone and 6x for an older one. That is an approximation; a real iPhone's JavaScript engine is different (see the checklist). **WebKit was not available, so there is no WebKit number** (see "Not checked").

## 25. Cold start, median of 9 runs each

Command: `node audit/e2e/perf.mjs` (838 seconds; results: `audit/results/perf.json`). Every run is a new browser profile with no cache and no service worker, seeded with the same made-up person (lite: one person with high blood pressure, celiac disease, and a peanut allergy; full: two people). "First screen" is when the first screen's heading is on the page and painted. "First tap" is from tapping Recipes until its heading is painted. Memory is the JavaScript heap one second after the first screen.

| Build | CPU | First screen | First paint of anything | First tap | Memory |
|---|---|---|---|---|---|
| Lite (opens on Today) | 1x | **5,054 ms** | 80 ms | 73 ms | 22.2 MB |
| Lite | 4x | **24,457 ms** | 344 ms | 352 ms | 26.5 MB |
| Lite | 6x | **37,470 ms** | 588 ms | 599 ms | 26.3 MB |
| Full (opens on Home) | 1x | 640 ms | 84 ms | 411 ms | 14.8 MB |
| Full | 4x | 2,997 ms | 384 ms | 1,946 ms | 14.7 MB |
| Full | 6x | 4,646 ms | 572 ms | 2,908 ms | 14.8 MB |

**Compared with `docs/AUDIT-2026-09-SUMMARY.md`.**

- The summary gives one launch number: the full build's first screen in desktop Chromium, 645 ms (median of 9). This audit measured 640 ms at 1x, so they agree.
- The summary's memory figure (25.0 MB after launch) was measured in a way it does not describe, so it is not compared.
- It gives no lite number.
- Its size table is out of date: it says full 11,595,018 and lite 5,339,217 bytes; today's builds are 12,103,383 and 5,847,582 bytes (Phase 1). The 210 VA recipes were added after it was written.

**Where the lite build's time goes.** Command: `node audit/e2e/perf-profile.mjs` (results: `audit/results/perf-profile.json`).

- A CPU profile of one 4x lite cold start: 27.1 of 29.8 sampled seconds are inside `buildWeekPlan`. The lite Today screen builds the whole week (`src/ui/lite.js:23`, `weekGet` at `src/ui/week.js:16`) before it can show anything.
- `weekGet` keeps the week only in memory (`uiState.weekCache`), so this happens on every launch, not once.
- Inside that, `checkRecipe` takes 26.5 s, the dictionary matcher (`tagText`) 25.4 s, and the matcher's inner loop (`fires`, `src/engine/dictionary.js:94`) 22.7 s. `matchSegment` runs every one of the 1,619 dictionary patterns against every piece of every ingredient line (`src/engine/dictionary.js:118`).
- The same lite build opened straight on a screen that does not need the week (median of 5 at 4x): **Check 1,932 ms, Report 2,010 ms, Today 25,364 ms.**

## 26. Lighthouse 13.5.0

Command: `node audit/e2e/lighthouse.mjs` (local copy) and `LIVE=1 node audit/e2e/lighthouse.mjs` (the live site). Results: `audit/results/lighthouse.json` and `audit/results/lighthouse-live.json`.

Lighthouse's default mobile run simulates a slow 4G connection and a 4x slower CPU on a first visit with an empty browser, so it sees the welcome screen and never the week build above. GitHub Pages sends the pages gzip-compressed: lite 1,364,576 bytes over the wire (5,845,335 unpacked), full 2,638,703 (12,101,128). The local test server does not compress, so the live run is the realistic one.

| | Performance | Accessibility | Best practices | First contentful paint | Time to interactive | Total blocking time | Bytes |
|---|---|---|---|---|---|---|---|
| Lite, live | 35 | 100 | 100 | 7.6 s | 9.0 s | 1,147 ms | 1.37 MB |
| Full, live | 21 | 100 | not scored* | 13.7 s | 16.2 s | 2,036 ms | 2.65 MB |
| Lite, local (no compression) | 30 | 100 | 100 | 29.4 s | 30.8 s | 1,266 ms | 5.86 MB |
| Full, local (no compression) | 22 | 100 | not scored* | 59.9 s | 61.9 s | 1,635 ms | 12.1 MB |

\* Lighthouse could not score best practices for the full build: its `charset` audit failed with "Request content was evicted from inspector cache". The 12 MB page was too big for the DevTools cache. This is a Lighthouse limitation, not an app finding.

The first visit is the only one that pays for the download. After that, the service worker opens the stored copy, so later launches pay only the CPU cost measured in item 25.

## 27. Size by content, and the three changes that would cut launch time most

From `audit/results/perf.json` (`sizes`) and each collection's JSON size:

| Part | Lite | Full |
|---|---|---|
| Food data (2,143 USDA foods) | 1,773 KB | 1,773 KB |
| Open-licence recipes run at launch: NHS 379 KB, Parent Club 379 KB, VA 468 KB, NHLBI 98 KB | 1,324 KB | 1,324 KB |
| Wikibooks recipes (a JSON block read on the first recipe search) | removed | 3,713 KB |
| USDA recipes (switched off by default, still shipped) | removed | 2,396 KB |
| Own recipes | 262 KB | 262 KB |
| App code (JavaScript) | 789 KB | 789 KB |
| Fonts (base64 in CSS) | 396 KB | 396 KB |
| Dictionary | 342 KB | 342 KB |
| Articles | 320 KB | 320 KB |
| Breathe page (inlined) | 230 KB | 230 KB |
| Conditions | 207 KB | 207 KB |
| CSS without fonts | 105 KB | 105 KB |
| Diet lists, sources, swaps | 118 KB | 118 KB |
| **Total** | **5,711 KB** | **11,820 KB** |

The three changes that would cut launch time most:

1. **Show lite Today before building the week, and keep the built week.** For example, render the logging part of Today at once and fill in "Planned" when the week is ready, and store the built week with the profile so a relaunch reuses it.
   - Measured stand-in: at 4x the lite build shows its first screen in about 2.0 s when that screen does not need the week, against 25.4 s for Today. That is a saving of about 23 s per launch at 4x (**measured**, as the difference between start screens).
   - The week itself still has to be built once a week, or after a change, until change 2 is made.
2. **Make the ingredient matcher look up words instead of trying every pattern.** Index the 1,619 terms by their first word, or tag every bundled recipe line once at build time, since the dictionary and recipes are fixed per build.
   - The matcher is 25.4 s of the 27.1 s week build at 4x (**measured**, CPU profile).
   - Cutting the patterns tried per piece from 1,619 to the few dozen that share a word should remove most of that (**estimated**, not measured).
3. **Ship less on the first visit.** Leave the USDA recipes, which are off by default, out of the full page until someone switches them on (2,396 KB unpacked), as was done for Wikibooks. Parse the data as JSON rather than as script.
   - The full page moves 2.65 MB over the wire. Lighthouse puts its first paint at 13.7 s on slow 4G, against 7.6 s for the 1.37 MB lite page (**measured**, live).
   - Removing the USDA recipes should cut the full download by roughly a fifth (**estimated** from the unpacked share, 2,396 of 11,820 KB; not measured compressed).
