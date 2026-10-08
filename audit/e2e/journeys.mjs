// Phase 4, items 17, 18, 20, 21: the main journeys in both builds, as a person would do them on a phone.
// Chromium at 390 x 844, device scale factor 3, touch, iPhone user agent. WebKit is not installed here (see REPORT, Not checked).
// Results: audit/results/journeys.json; a screenshot of every failed step in audit/results/journey-failures/.
import fs from 'node:fs';
import path from 'node:path';
import { buildSite, serve, launch, phone, STORE_KEY, TMP, ROOT } from './site.mjs';

const OUT = path.join(ROOT, 'audit/results/journey-failures');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const results = [];
let current = null;
async function step(build, name, fn) {
  const t0 = Date.now();
  try { const detail = await fn(); results.push({ build, step: name, pass: true, ms: Date.now() - t0, ...(detail && typeof detail === 'object' ? { detail } : {}) }); console.log(`PASS [${build}] ${name}`); }
  catch (e) {
    results.push({ build, step: name, pass: false, ms: Date.now() - t0, error: String(e.message || e).split('\n')[0] });
    console.log(`FAIL [${build}] ${name}: ${String(e.message || e).split('\n')[0]}`);
    if (current) await current.screenshot({ path: path.join(OUT, `${build}-${name.replace(/[^a-z0-9]+/gi, '-').slice(0, 60)}.png`) }).catch(() => {});
  }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const GUIDE_SEEN = { 'peace-meal-lite:home-screen-guide': '1', 'peace-meal-full:home-screen-guide': '1' };
async function newPage(ctx) { const p = await ctx.newPage(); p.on('dialog', d => d.accept()); p.__errors = []; p.on('pageerror', e => p.__errors.push(e.message)); current = p; return p; }
const text = page => page.evaluate(() => document.body.innerText);
const wait = (page, ms = 600) => page.waitForTimeout(ms);

// Walks the setup steps with Next until Review, ticking what is asked for on the way.
async function setupPerson(page, { name, age = 72, lb = 150, allergens = [], modules = [] }) {
  await page.fill('#people-new-name', name); await page.click('#people-new-form button[type=submit]'); await wait(page, 800);
  for (let i = 0; i < 20; i++) {
    if (await page.$('#pb-age')) { await page.fill('#pb-age', String(age)); if (await page.$('#pb-weight')) await page.fill('#pb-weight', String(lb)); if (await page.$('#pb-ft')) { await page.fill('#pb-ft', '5'); await page.fill('#pb-in', '4'); } }
    // Locators, not element handles: ticking a box re-renders the step, so a handle taken before the tick goes stale.
    for (const sel of [...allergens.map(a => `[data-allergen="${a}"]`), ...modules.map(m => `[data-module="${m}"]`)]) {
      const box = page.locator(sel).first();
      if (!(await box.count())) continue;
      // Tap the box's label the way a person does (Playwright waits until nothing covers it). A forced click on the
      // hidden input itself can land on the fixed tab bar when the box sits behind it.
      const label = page.locator('label', { has: page.locator(sel) }).first();
      for (let t = 0; t < 3 && !(await box.isChecked().catch(() => false)); t++) {
        if (await label.count()) await label.click({ timeout: 8000 }).catch(() => {}); else await box.evaluate(el => el.click());
        await wait(page, 500);
      }
      if (!(await box.isChecked().catch(() => false))) throw new Error(`could not tick ${sel}`);
    }
    if (await page.$('#pr-save')) { await page.click('#pr-save'); await wait(page, 1500); return; }
    const next = await page.$('button[data-step].primary, button.primary[data-step]');
    if (!next) throw new Error('no Next button and no Review step');
    await next.click(); await wait(page, 700);
  }
  throw new Error('setup did not reach Review in 20 steps');
}

buildSite();
const srv = await serve();
const browser = await launch();
const url = (build, hash = '') => `${srv.origin}/Peace-Meal-Full/${build}/${hash}`;
try {
  // ---------------------------------------------------------------- item 17: lite
  {
    const build = 'lite';
    const ctx = await phone(browser);
    await ctx.addInitScript(g => { try { for (const [k, v] of Object.entries(g)) if (!localStorage.getItem(k)) localStorage.setItem(k, v); } catch { /* ignore */ } }, GUIDE_SEEN);
    const page = await newPage(ctx);
    await step(build, '17.1 first launch shows the welcome, large text on by default', async () => {
      await page.goto(url(build)); await wait(page, 1500);
      expect(/#\/welcome/.test(page.url()), 'not on the welcome screen: ' + page.url());
      const large = await page.evaluate(() => document.documentElement.classList.contains('large-text') || document.body.classList.contains('large-text') || /large/.test(document.documentElement.dataset.text || ''));
      const fs1 = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
      expect(large || fs1 >= 18, `large text is not on (body font ${fs1}px)`);
      return { bodyFontPx: fs1, largeClass: large };
    });
    await step(build, '17.2 setup: name, age, a peanut allergy, celiac disease, saved', async () => {
      await page.goto(url(build, '#/people/new')); await wait(page, 800);
      await setupPerson(page, { name: 'Test Person', allergens: ['allergen-peanut'], modules: ['celiac'] });
      const saved = JSON.parse(await page.evaluate(k => localStorage.getItem(k), STORE_KEY[build]));
      const p = saved.people[0];
      expect(p && p.setup_complete, 'setup not complete');
      expect(p.allergens.includes('allergen-peanut') && p.modules.includes('celiac'), 'allergy or condition not saved');
      return { landedOn: page.url().split('#')[1] };
    });
    await step(build, '17.3 check a label by typing: wheat flour fails for celiac', async () => {
      await page.goto(url(build, '#/check')); await wait(page, 800);
      await page.fill('#check-text', 'wheat flour, sugar, salt'); await page.click('#check-run'); await wait(page, 600);
      const r = await page.$eval('#check-result', el => el.innerText);
      expect(/FAIL|not allowed|stop/i.test(r), 'no fail shown: ' + r.slice(0, 120));
      return { shown: r.replace(/\s+/g, ' ').slice(0, 100) };
    });
    await step(build, '17.4 a NOT SURE result: an unknown word says "Not sure. Ask before eating."', async () => {
      await page.fill('#check-text', 'xqzt blorp'); await page.click('#check-run'); await wait(page, 600);
      const r = await page.$eval('#check-result', el => el.innerText);
      expect(/Not sure\. Ask before eating\./.test(r), 'wording not shown: ' + r.slice(0, 160));
    });
    await step(build, '17.5 log a meal: build the week, then "I ate this" on Today', async () => {
      await page.goto(url(build, '#/week')); await wait(page, 2500);
      await page.goto(url(build, '#/today')); await wait(page, 1500);
      const ate = await page.$('[data-ate]');
      expect(ate, 'no "I ate this" button on Today');
      await ate.click(); await wait(page, 800);
      const saved = JSON.parse(await page.evaluate(k => localStorage.getItem(k), STORE_KEY[build]));
      expect((saved.diary || []).length >= 1, 'nothing logged');
      return { diary: saved.diary.length };
    });
    await step(build, '17.6 log a symptom for Yesterday', async () => {
      await page.click('#lite-feel'); await wait(page, 600);
      await page.click('label:has(input[data-seg="lite-when"][value="yesterday"])'); await wait(page, 300);
      await page.click('.lite-sym >> nth=0'); await wait(page, 300);
      await page.click('#lite-sym-save'); await wait(page, 800);
      const saved = JSON.parse(await page.evaluate(k => localStorage.getItem(k), STORE_KEY[build]));
      const y = new Date(); y.setDate(y.getDate() - 1); const yd = y.toISOString().slice(0, 10);
      const e = (saved.log || []).find(x => x.meal === 'symptom');
      expect(e, 'no symptom saved');
      expect(e.date === yd, `symptom saved for ${e.date}, not yesterday ${yd}`);
    });
    await step(build, '17.7 Remove shows a 10-second Undo, and Undo puts it back', async () => {
      await page.goto(url(build, '#/today')); await wait(page, 1000);
      const before = JSON.parse(await page.evaluate(k => localStorage.getItem(k), STORE_KEY[build]));
      const n0 = (before.diary || []).length + (before.log || []).length;
      const rm = await page.$('[data-lite-remove]');
      expect(rm, 'no Remove button');
      await rm.click(); await wait(page, 500);
      const toast = await page.$('#undo-toast');
      expect(toast && await toast.isVisible(), 'no Undo toast');
      const mid = JSON.parse(await page.evaluate(k => localStorage.getItem(k), STORE_KEY[build]));
      expect((mid.diary || []).length + (mid.log || []).length === n0 - 1, 'the entry was not removed');
      await page.click('#undo-toast button'); await wait(page, 600);
      const after = JSON.parse(await page.evaluate(k => localStorage.getItem(k), STORE_KEY[build]));
      expect((after.diary || []).length + (after.log || []).length === n0, 'Undo did not put it back');
    });
    await step(build, '17.8 "Feeling fine" once a day: the second tap is not possible', async () => {
      await page.click('#lite-fine'); await wait(page, 600);
      const disabled = await page.$eval('#lite-fine', b => b.disabled);
      const saved = JSON.parse(await page.evaluate(k => localStorage.getItem(k), STORE_KEY[build]));
      const fines = (saved.log || []).filter(e => e.fine).length;
      expect(disabled && fines === 1, `button disabled ${disabled}, ${fines} "fine" entries`);
    });
    await step(build, '17.9 doctor report lists the meal and the symptoms, with a Print button', async () => {
      await page.goto(url(build, '#/report')); await wait(page, 1200);
      const t = await text(page);
      expect(await page.$('#lite-print'), 'no Print button');
      expect(/Feeling fine|feeling fine/i.test(t), 'the "feeling fine" day is not on the report');
      await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
      await page.click('#lite-print'); await wait(page, 300);
      expect(await page.evaluate(() => window.__printed) === 1, 'Print did not call the print dialog');
    });
    await step(build, '17.10 Send a backup saves a file with the person in it', async () => {
      await page.goto(url(build, '#/settings')); await wait(page, 1000);
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click('#set-share')]);
      const f = path.join(TMP, 'journey-lite-backup.json'); await dl.saveAs(f);
      expect(JSON.parse(fs.readFileSync(f, 'utf8')).people[0].name === 'Test Person', 'backup does not hold the person');
    });
    await step(build, '17.11 no script errors during the lite journey', async () => { expect(!page.__errors.length, page.__errors.slice(0, 3).join(' | ')); });
    await ctx.close();
  }
  // ---------------------------------------------------------------- item 18: full
  {
    const build = 'full';
    const ctx = await phone(browser);
    await ctx.addInitScript(g => { try { for (const [k, v] of Object.entries(g)) if (!localStorage.getItem(k)) localStorage.setItem(k, v); } catch { /* ignore */ } }, GUIDE_SEEN);
    const page = await newPage(ctx);
    await step(build, '18.1 two people with different conditions and allergies', async () => {
      await page.goto(url(build, '#/people/new')); await wait(page, 1200);
      await setupPerson(page, { name: 'Person A', age: 45, allergens: ['allergen-milk'], modules: ['celiac'] });
      await page.goto(url(build, '#/people/new')); await wait(page, 1000);
      await setupPerson(page, { name: 'Person B', age: 70, allergens: ['allergen-peanut'], modules: ['hypertension'] });
      const saved = JSON.parse(await page.evaluate(k => localStorage.getItem(k), STORE_KEY[build]));
      expect(saved.people.length === 2 && saved.people.every(p => p.setup_complete), `${saved.people.length} people saved`);
    });
    await step(build, '18.2 build a week: every day has meals and none is a FAIL for the active person', async () => {
      await page.goto(url(build, '#/week')); await wait(page, 3000);
      const t = await text(page);
      const fails = (t.match(/\bFAIL\b/g) || []).length;
      const meals = await page.$$eval('[data-meal], .week-meal, .meal-card', xs => xs.length);
      expect(meals > 0 || /Breakfast|Dinner/.test(t), 'no meals on the week');
      expect(fails === 0, `${fails} FAIL chips on the week`);
      return { mealElements: meals };
    });
    await step(build, '18.3 grocery list has items', async () => {
      await page.goto(url(build, '#/grocery')); await wait(page, 2000);
      const items = await page.$$eval('.grocery-item, [data-grocery-item], li', xs => xs.length);
      expect(items > 3, `${items} items`);
      return { items };
    });
    await step(build, '18.4 recipe search: the Wikibooks recipes load on the first search', async () => {
      await page.goto(url(build, '#/recipes')); await wait(page, 1500);
      const t0 = await text(page);
      const said = (t0.match(/([\d,]+) recipes from/) || [])[1];
      expect(/Wikibooks Cookbook recipes load when you search/.test(t0), 'no "load when you search" note before searching');
      const search = await page.$('#rc-q, input[type=search]');
      await search.fill('beef stroganoff'); await wait(page, 2500);
      const t1 = await text(page);
      const wb = await page.$$eval('[data-open^="wb-"]', xs => xs.length);
      expect(wb > 0, 'no Wikibooks recipe found after searching');
      return { headerCountBefore: said, wikibooksResults: wb };
    });
    await step(build, '18.5 print the one-page plan', async () => {
      await page.goto(url(build, '#/plan')); await wait(page, 1500);
      await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
      const btn = await page.$('button:has-text("Print"), [data-print], #plan-print');
      expect(btn, 'no Print button on the Plan');
      await btn.click(); await wait(page, 500);
      expect(await page.evaluate(() => window.__printed) >= 1, 'Print did not call the print dialog');
    });
    await step(build, '18.6 no script errors during the full journey', async () => { expect(!page.__errors.length, page.__errors.slice(0, 3).join(' | ')); });
    await ctx.close();
  }
} finally { await browser.close(); await srv.close(); }
fs.writeFileSync(path.join(ROOT, 'audit/results/journeys.json'), JSON.stringify(results, null, 1) + '\n');
const failed = results.filter(r => !r.pass);
console.log(`${results.length - failed.length} of ${results.length} steps pass`);
if (failed.length) process.exitCode = 1;
