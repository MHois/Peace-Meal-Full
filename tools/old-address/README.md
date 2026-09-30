# The old address: "Peace Meal has moved"

Until September 2026, Peace Meal lived at `mchoisington.github.io/specialty-nutrition-app/` (with `lite/` and `full/`). Every page there now shows GitHub's "Site not found" page. The audit of September 30, 2026 (finding P1-6; details in `docs/audit-2026-09-30/evidence/phase7-privacy-hosting.md`, item 31) found two groups of people stranded:

- A Home Screen icon made from `/lite/` or `/full/` shows the 404 page when the phone is online. The person's data is still inside the icon.
- An icon made from the old front page still opens the pre-September app from its stored copy. It never updates and has none of the September safety fixes.

This folder holds the fix. **Nothing here is published until the owner publishes it.**

| File | What it does |
|---|---|
| `index.html` | "Peace Meal has moved." Inside an old icon, it finds the old data and offers **Save my information** (the iPhone share sheet, so it can go to Files; otherwise a download), then links to the matching new app (`lite/` to lite, `full/` to full). It only reads: it never changes or deletes anything, loads nothing from the internet (its Content Security Policy allows only its own script, by hash), and sends nothing anywhere. |
| `sw.js` | A replacement service worker for the old front page. It asks the network first, so the front-page icon shows the moved page; with no connection it falls back to the stored old app. It deletes nothing. |

`test/old-address.test.mjs` checks both: the saved file is the old data byte for byte, nothing is written or deleted, each icon goes to the matching app, and the script hash in the page matches the script. If you edit the script, recompute that hash (the test prints the new one).

## How to publish it (owner decision)

The old repository must stay private, because its history has family details. GitHub Pages can also serve the path `/specialty-nutrition-app/` from a *user-site* repository, so use that:

1. On GitHub, create a new **public** repository named exactly `mchoisington.github.io`. On the free plan, Pages needs a public repository. Put nothing personal in it.
2. Add these four files. All are copies of the two files in this folder:
   - `specialty-nutrition-app/index.html` (this `index.html`)
   - `specialty-nutrition-app/sw.js` (this `sw.js`)
   - `specialty-nutrition-app/lite/index.html` (the same `index.html`)
   - `specialty-nutrition-app/full/index.html` (the same `index.html`)
3. In that repository: **Settings, Pages, Build and deployment, Source: Deploy from a branch**, branch `main`, folder `/ (root)`. Save.
4. **Do not add a custom domain to this repository.** A custom domain on the user site moves every Pages site of the account to that domain, Peace Meal included.
5. After a few minutes, open `https://mchoisington.github.io/specialty-nutrition-app/lite/` in a browser. It should say "Peace Meal has moved". If it shows GitHub's 404 page instead, the old private repository's name is probably in the way (this part was inferred from how Pages maps paths, not tested). Renaming the old repository, for example to `specialty-nutrition-app-archive`, frees the path and keeps it private.
6. On each phone with an old icon, while online: open the old icon, tap **Save my information**, choose **Save to Files**. Then open the new Peace Meal, add it to the Home Screen, and use **Bring my data** on its first screen with that file.
7. When every old icon has been moved, delete the `mchoisington.github.io` repository, or turn its Pages off.

Things to know:

- This repository is another Pages site on the same address as Peace Meal (see the README's hosting note). It is the one exception to "publish no other Pages site on this account": its only files load nothing and send nothing. Never add anything else to it, and remove it when the move is done.
- After the moved page has been seen once online, an old `lite/` or `full/` icon keeps showing it even with no connection. The data is still inside the icon, and the page still saves it.
- Until this is published, the manual route works for `lite/` and `full/` icons: turn on Airplane Mode, open the old icon, then Settings, Send a backup (or Export JSON), Save to Files. Turn Airplane Mode off, add the new address to the Home Screen, and use Bring my data.

Checked in Chromium with the old app rebuilt from its last published commit (`node audit/e2e/old-address.mjs`); not yet on a real iPhone.
