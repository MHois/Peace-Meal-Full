// Phase 4, item 22: every main screen of both builds, light and dark, at 390 x 844 (the device scale factor is 3; the
// images are saved at CSS pixel size as JPEG to keep the repository small). Made-up people only.
import fs from 'node:fs';
import path from 'node:path';
import { buildSite, serve, launch, phone, ROOT } from './site.mjs';
import { SCREENS, seededPage } from './screens.mjs';

const DIR = path.join(ROOT, 'docs/audit-2026-09-30/screenshots');
fs.mkdirSync(DIR, { recursive: true });
buildSite();
const srv = await serve();
const browser = await launch();
const made = [];
try {
  for (const build of ['lite', 'full']) for (const dark of [false, true]) {
    const ctx = await phone(browser, { dark });
    const page = await seededPage(ctx, build);
    for (const s of SCREENS[build]) {
      await page.goto(`${srv.origin}/Peace-Meal-Full/${build}/#/${s}`); await page.waitForTimeout(s === 'week' || s === 'grocery' ? 2500 : 1200);
      const f = `${build}-${s}-${dark ? 'dark' : 'light'}.jpg`;
      await page.screenshot({ path: path.join(DIR, f), type: 'jpeg', quality: 70, scale: 'css' });
      made.push(f);
    }
    await ctx.close();
  }
} finally { await browser.close(); await srv.close(); }
console.log(made.length + ' screenshots in docs/audit-2026-09-30/screenshots/');
