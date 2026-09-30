// Phase 2, item 6 (dynamic half): does any script payload run? Paths tried in both builds:
//   1. a crafted backup file, imported through Settings (the app's own import button), then every screen visited
//   2. the same backup with dates, ids, and numbers poisoned too, seeded straight into storage
//   3. label text typed (or read from a photo) into the label checker
//   4. a recipe pasted into "Paste a recipe"
//   5. any link whose address is javascript:, which runs when tapped
// Every payload calls __xss('<field>'); a hit is recorded with the screen it ran on. Results: audit/results/xss.json.
import fs from 'node:fs';
import path from 'node:path';
import { buildSite, serve, launch, phone, STORE_KEY, TMP, ROOT } from './site.mjs';
import { poisonedProfile, hook, svg } from './poison.mjs';

const PERSON_STEPS = ['basics', 'allergens', 'conditions', 'preferences', 'medications', 'clinician', 'cooking/time', 'cooking/days', 'cooking/kitchen', 'review'];
const ROUTES = ['home', 'today', 'report', 'people', ...PERSON_STEPS.map(s => 'people/PID/' + s), 'plan', 'check', 'week', 'pantry', 'together', 'recipes', 'grocery', 'log', 'learn', 'learn/sources', 'settings', 'breathe'];
const results = { hits: [], javascriptLinks: [], errors: [], notes: [] };
const record = (build, pathName, screen, hits) => { for (const f of hits) results.hits.push({ build, path: pathName, screen, field: f }); };

async function visitAll(page, origin, build, pathName, pid = 'p1') {
  for (const route of ROUTES) {
    const r = route.replace('PID', encodeURIComponent(pid));
    await page.goto(`${origin}/Peace-Meal-Full/${build}/#/${r}`).catch(() => {});
    await page.waitForTimeout(700);
    // open the first recipe, the first modal-opening buttons, and the history sheets where they exist
    for (const sel of ['[data-open]', '[data-weight-history]', '[data-food-history]', '[data-edit-person]', '[data-person-edit]']) {
      const el = await page.$(sel);
      if (el) { await el.click().catch(() => {}); await page.waitForTimeout(400); await page.keyboard.press('Escape').catch(() => {}); }
    }
    const hits = await page.evaluate(() => { const h = window.__xssHits || []; window.__xssHits = []; if (({}).polluted || ({}).polluted2) h.push('PROTOTYPE POLLUTED'); return h; });
    record(build, pathName, r, hits);
    const js = await page.$$eval('a[href]', as => as.map(a => a.getAttribute('href')).filter(h => /^\s*javascript:/i.test(h)));
    for (const h of js) results.javascriptLinks.push({ build, path: pathName, screen: r, href: h });
  }
}

const { stamp } = buildSite();
const srv = await serve();
const browser = await launch();
try {
  for (const build of ['lite', 'full']) {
    // 1. Import through the app's own Settings button
    {
      const ctx = await phone(browser);
      await ctx.addInitScript(() => { window.__xssHits = []; window.__xss = f => window.__xssHits.push(f); try { localStorage.setItem('peace-meal-lite:home-screen-guide', '1'); localStorage.setItem('peace-meal-full:home-screen-guide', '1'); } catch { /* ignore */ } });
      const page = await ctx.newPage();
      page.on('pageerror', e => results.errors.push({ build, path: 'import', error: e.message }));
      page.on('dialog', d => d.accept());
      const file = path.join(TMP, 'poisoned-backup.json');
      fs.writeFileSync(file, JSON.stringify(poisonedProfile({ structural: true }), null, 2));
      await page.goto(`${srv.origin}/Peace-Meal-Full/${build}/#/settings`);
      await page.waitForTimeout(1500);
      const input = await page.$('input[type=file]');
      if (!input) results.notes.push(`${build}: no file input on Settings; import path not driven, storage seeded instead`);
      else { await input.setInputFiles(file); await page.waitForTimeout(1500); }
      const stored = await page.evaluate(k => localStorage.getItem(k), STORE_KEY[build]);
      results.notes.push(`${build}: after import the store ${stored && stored.includes('person.name') ? 'holds' : 'does not hold'} the crafted backup`);
      if (!stored || !stored.includes('person.name')) await page.evaluate(([k, v]) => localStorage.setItem(k, v), [STORE_KEY[build], JSON.stringify(poisonedProfile({ structural: true }))]);
      await visitAll(page, srv.origin, build, 'backup file imported through Settings (every field poisoned)');
      await ctx.close();
    }
    // 2. Text fields only, seeded into storage (valid dates keep every list on screen)
    {
      const ctx = await phone(browser);
      await ctx.addInitScript(([k, v]) => { window.__xssHits = []; window.__xss = f => window.__xssHits.push(f); try { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem(k, v); localStorage.setItem('peace-meal-lite:home-screen-guide', '1'); localStorage.setItem('peace-meal-full:home-screen-guide', '1'); } } catch { /* ignore */ } }, [STORE_KEY[build], JSON.stringify(poisonedProfile())]);
      const page = await ctx.newPage();
      page.on('pageerror', e => results.errors.push({ build, path: 'text fields', error: e.message }));
      await visitAll(page, srv.origin, build, 'text fields only, seeded into storage');
      await ctx.close();
    }
    // 3. Typed label text, 4. pasted recipe
    {
      const ctx = await phone(browser);
      await ctx.addInitScript(([k, v]) => { window.__xssHits = []; window.__xss = f => window.__xssHits.push(f); try { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem(k, v); localStorage.setItem('peace-meal-lite:home-screen-guide', '1'); localStorage.setItem('peace-meal-full:home-screen-guide', '1'); } } catch { /* ignore */ } }, [STORE_KEY[build], JSON.stringify({ ...poisonedProfile(), people: [{ ...poisonedProfile().people[0], name: 'Ann' }] })]);
      const page = await ctx.newPage();
      await page.goto(`${srv.origin}/Peace-Meal-Full/${build}/#/check`);
      await page.waitForTimeout(1200);
      const ta = await page.$('textarea');
      if (ta) {
        await ta.fill(`sugar, ${hook('label.segment')}, peanut ${svg('label.svg')}, xyz${hook('label.unrecognized')}`);
        const btn = await page.$('#check-go, button:has-text("Check")');
        if (btn) await btn.click().catch(() => {});
        await page.waitForTimeout(800);
        record(build, 'typed label', 'check', await page.evaluate(() => window.__xssHits.splice(0)));
      } else results.notes.push(`${build}: no label textarea on #/check`);
      await page.goto(`${srv.origin}/Peace-Meal-Full/${build}/#/recipes`);
      await page.waitForTimeout(1200);
      const paste = await page.$('#rc-paste');
      if (paste) {
        await paste.click(); await page.waitForTimeout(500);
        const pta = await page.$('.modal textarea');
        if (pta) {
          await pta.fill(`Pasted ${hook('paste.title')}\nIngredients\n2 cups rice ${hook('paste.ingredient')}\nMethod\n1. Cook ${hook('paste.step')}`);
          const go = await page.$('.modal button.primary');
          if (go) await go.click().catch(() => {});
          await page.waitForTimeout(800);
        }
        record(build, 'pasted recipe', 'recipes', await page.evaluate(() => window.__xssHits.splice(0)));
      } else results.notes.push(`${build}: no Paste a recipe button`);
      await ctx.close();
    }
  }
  // 6. Round trip: let the app save its own state (week snapshots, grocery, household), then poison every value in what it
  //    saved (strings and numbers alike, except the ids and dates it uses to find things) and open every screen again.
  for (const build of ['lite', 'full']) {
    const ctx = await phone(browser);
    const base = poisonedProfile(); base.people[0].name = 'Ann'; base.people[0].allergens_other = ['kiwi']; base.people[0].preferences.avoid_terms = ['olive'];
    base.custom_recipes = []; base.log = []; base.diary = []; base.pantry = []; base.exercise = []; base.weights = []; base.people[0].custom_modules = []; base.people[0].custom_symptoms = [];
    for (const k of ['grocery_adjustments', 'grocery_changes']) base[k] = {};
    base.household = { cook: null, cook_by_date: {}, pattern: {}, roster: {}, snacks_per_day: 1, budget: true, seed: 0, day_overrides: {}, meal_overrides: {}, week_snapshot: null };
    base.people[0].tier2 = { sodium_mg_max: 1500 }; base.people[0].rule_settings = {};
    await ctx.addInitScript(([k, v]) => { window.__xssHits = []; window.__xss = f => window.__xssHits.push(f); try { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem(k, v); localStorage.setItem('peace-meal-lite:home-screen-guide', '1'); localStorage.setItem('peace-meal-full:home-screen-guide', '1'); } } catch { /* ignore */ } }, [STORE_KEY[build], JSON.stringify(base)]);
    const page = await ctx.newPage();
    for (const r of ['today', 'week', 'grocery', 'together', 'plan', 'report']) { await page.goto(`${srv.origin}/Peace-Meal-Full/${build}/#/${r}`).catch(() => {}); await page.waitForTimeout(900); }
    const saved = JSON.parse(await page.evaluate(k => localStorage.getItem(k), STORE_KEY[build]));
    const KEEP = new Set(['id', 'person', 'activePerson', 'ref', 'recipe', 'start', 'date', 'week_start', 'seed', 'planSeed', 'version', 'modules', 'allergens', 'slot', 'meal', 'kind', 'unit', 'day', 'cook_days', 'equipment', 'created', 'updated', 'at', 'logged_at', 'last_backup_at', 'setup_complete', 'adult', 'sex']);
    let n = 0;
    const walk = (o, path) => {
      if (Array.isArray(o)) return o.forEach((v, i) => { if (v && typeof v === 'object') walk(v, `${path}[${i}]`); });
      for (const [k, v] of Object.entries(o)) {
        if (KEEP.has(k)) continue;
        const p = path ? `${path}.${k}` : k;
        if (v && typeof v === 'object') walk(v, p);
        else if (typeof v === 'string' || (typeof v === 'number' && !/^(kcal|protein_g|carb_g|fat_g|fiber_g|sodium_mg)$/.test(k))) { o[k] = hook(p.replace(/\[\d+\]/g, '[]')); n++; }
      }
    };
    walk(saved, '');
    results.notes.push(`${build}: round trip poisoned ${n} saved values`);
    // Write while no app page is open (an open page would save its own copy over it), then open a fresh page.
    await page.goto(`${srv.origin}/Peace-Meal-Full/icon-180.png`);
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [STORE_KEY[build], JSON.stringify(saved)]);
    await page.goto(`${srv.origin}/Peace-Meal-Full/${build}/`); await page.waitForTimeout(1500);
    const stillPoisoned = (await page.evaluate(k => localStorage.getItem(k), STORE_KEY[build])).includes('__xss');
    results.notes.push(`${build}: round trip store still poisoned after reload: ${stillPoisoned}`);
    await visitAll(page, srv.origin, build, 'round trip: every value the app saved, poisoned');
    await ctx.close();
  }
  // 5. Tap any javascript: link found, to show whether it runs
  for (const j of results.javascriptLinks.slice(0, 1)) {
    const ctx = await phone(browser);
    await ctx.addInitScript(([k, v]) => { window.__xssHits = []; window.__xss = f => window.__xssHits.push(f); try { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem(k, v); localStorage.setItem('peace-meal-lite:home-screen-guide', '1'); localStorage.setItem('peace-meal-full:home-screen-guide', '1'); } } catch { /* ignore */ } }, [STORE_KEY[j.build], JSON.stringify(poisonedProfile())]);
    const page = await ctx.newPage();
    await page.goto(`${srv.origin}/Peace-Meal-Full/${j.build}/#/${j.screen}`); await page.waitForTimeout(1200);
    const a = await page.$(`a[href^="javascript:"]`);
    if (a) { await a.click().catch(() => {}); await page.waitForTimeout(500); results.javascriptLinkTapped = { ...j, ran: await page.evaluate(() => window.__xssHits.slice()) }; }
    await ctx.close();
  }
} finally {
  await browser.close();
  await srv.close();
}
results.stamp = stamp;
fs.writeFileSync(path.join(ROOT, 'audit/results/xss.json'), JSON.stringify(results, null, 1) + '\n');
const uniq = [...new Set(results.hits.map(h => `${h.build} | ${h.path} | ${h.field} | ${h.screen}`))];
console.log(`${results.hits.length} payload runs, ${uniq.length} distinct:`); for (const u of uniq) console.log('  ' + u);
console.log('javascript: links:', results.javascriptLinks.length, results.javascriptLinkTapped ? JSON.stringify(results.javascriptLinkTapped) : '');
console.log('notes:', results.notes); console.log('page errors:', results.errors.slice(0, 8));
// A payload that ran is a failed check: exit 1 so the audit runner reports it.
if (results.hits.length || results.javascriptLinks.length) process.exitCode = 1;
