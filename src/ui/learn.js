// Learn: one article page per module (data/articles.json, falling back to the module's education block), plus "How this app decides".
import { uiState, uiEsc, uiRatingBadge, uiRatingBase, uiSourcesHTML, uiRuleHTML, uiArticleFor, uiPageHeader, uiSection, uiChip, uiIcon, uiEmptyState, uiFmtNum, uiNoticeHTML, uiStatTile } from './common.js';
import { recipesSourceCounts } from './recipes.js';

const LEARN_RATING_SENTENCE = {
  strong: 'Strong: multiple randomized trials or a major society guideline with Class 1 / Level A backing.',
  moderate: 'Moderate: consistent trials or guideline recommendations with conditional strength.',
  limited: 'Limited: small trials, observational data, or expert consensus with little trial support.',
  insufficient: 'Insufficient: no condition-specific dietary evidence; only general healthy-eating patterns apply.'
};

export function renderLearnScreen(root, ctx) {
  const id = ctx.route.parts[0];
  if (id === 'how') return learnRenderHow(root);
  if (id === 'sources') return learnRenderSources(root);
  if (id) {
    const m = uiState.conditionsById.get(id);
    if (m) {
      root.innerHTML = `${uiPageHeader(uiEsc(m.name), m.evidence && m.evidence.summary ? uiEsc(m.evidence.summary) : '', `<a class="btn small" href="#/learn">${uiIcon('book')}All topics</a>`)}${learnArticleHTML(m, { full: true })}`;
      return;
    }
  }
  const groups = [['condition', 'Medical conditions'], ['pattern', 'Eating patterns'], ['restriction', 'Restrictions and safeguards']];
  const mods = uiState.data.conditions;
  root.innerHTML = `
    ${uiPageHeader('Learn', 'The evidence behind every module, in plain language, with its sources.')}
    <div class="card"><h2>How this app decides</h2><p>Two tiers, hard conflicts, allergens as absolute, unknown is not safe, no language model in the safety path. Read this first.</p><div><a class="btn" href="#/learn/how">${uiIcon('book')}Read</a></div></div>
    <div class="card"><h2>Where the recipes come from</h2><p>Every outside recipe collection in the app, the licence each one carries, the attribution it requires, and what nutrition data it provides.</p><div><a class="btn" href="#/learn/sources">${uiIcon('leaf')}Read</a></div></div>
    ${groups.map(([key, title]) => {
      const list = mods.filter(m => m.category === key);
      if (!list.length) return '';
      return uiSection(title, `<ul class="topic-list">${list.map(m => `<li><a href="#/learn/${uiEsc(m.id)}"><span class="topic-title">${uiEsc(m.name)} ${uiRatingBadge(m.evidence && m.evidence.rating)}${uiArticleFor(m.id) ? uiChip('article', 'neutral') : ''}</span><span class="topic-sub">${uiEsc(m.evidence && m.evidence.summary || '')}</span></a></li>`).join('')}</ul>`, { id: 'learn-' + key });
    }).join('')}
    ${mods.length ? '' : uiEmptyState('No modules are loaded (data/conditions.json is missing or empty).', '', 'list')}
  `;
}

function learnRatingHTML(m) {
  const rating = (m.evidence && m.evidence.rating) || '';
  return `<div class="row article-rating">${uiRatingBadge(rating)} ${uiChip(m.category, 'neutral')}${m.phase1_ref ? `<span class="small muted">Phase 1: ${uiEsc(m.phase1_ref)}</span>` : ''}</div>
    <p class="small muted">${uiEsc(LEARN_RATING_SENTENCE[uiRatingBase(rating)] || '')}${/-to-/.test(String(rating)) ? ` <span>Rated ${uiEsc(String(rating).replace(/-to-/g, ' to '))}: the evidence sits between those two levels.</span>` : ''}</p>`;
}

function learnSafeUrl(u) {
  const s = String(u || '').trim();
  return /^https?:\/\//i.test(s) ? s : '';
}

// The article page for a module. With an article in data/articles.json: main points, rating, sections, links, references.
// Without one: main points from education.plain, then the education lists. opts.full adds the module's rules, Tier 2 numbers, and phases.
export function learnArticleHTML(m, opts = {}) {
  const art = uiArticleFor(m.id);
  const ed = m.education || {};
  const list = (arr) => Array.isArray(arr) && arr.length ? `<ul>${arr.map(x => `<li>${uiEsc(x)}</li>`).join('')}</ul>` : '<p class="muted small">Nothing recorded.</p>';
  const mainPoints = art && Array.isArray(art.summary) && art.summary.length ? art.summary : [ed.plain].filter(Boolean);
  const sections = art && Array.isArray(art.sections) ? art.sections.filter(s => s && (s.heading || (Array.isArray(s.paragraphs) && s.paragraphs.length))) : [];
  const links = art && Array.isArray(art.links) ? art.links.filter(l => l && l.label) : [];
  const refs = art && Array.isArray(art.references) ? art.references.filter(r => r && (r.citation || r.url)) : [];
  return `<article class="article">
    <h2 class="article-h">Main points</h2>
    ${mainPoints.length ? `<ul class="main-points">${mainPoints.map(x => `<li>${uiEsc(x)}</li>`).join('')}</ul>` : '<p class="muted">No plain-language summary recorded for this module yet.</p>'}
    ${learnRatingHTML(m)}
    ${m.evidence && m.evidence.summary && !art ? `<p><strong>${uiEsc(m.evidence.summary)}</strong></p>` : ''}
    ${sections.length ? sections.map(s => `${s.heading ? `<h2 class="article-h">${uiEsc(s.heading)}</h2>` : ''}${(Array.isArray(s.paragraphs) ? s.paragraphs : []).map(p => `<p>${uiEsc(p)}</p>`).join('')}`).join('') : `
      <h3>What the evidence shows</h3>${list(ed.evidence)}
      <h3>Contested or nuanced</h3>${list(ed.contested)}
      <h3>What this app will not claim</h3>${list(ed.do_not_claim)}
      ${ed.app_language ? `<h3>How the app words it</h3>${Array.isArray(ed.app_language) ? list(ed.app_language) : `<p>${uiEsc(ed.app_language)}</p>`}` : ''}`}
    ${links.length ? `<h2 class="article-h">Helpful links</h2><ul class="links">${links.map(l => { const u = learnSafeUrl(l.url); return `<li>${u ? `<a href="${uiEsc(u)}" target="_blank" rel="noopener noreferrer">${uiEsc(l.label)}</a>` : uiEsc(l.label)}${l.kind ? ` ${uiChip(l.kind, 'neutral')}` : ''}</li>`; }).join('')}</ul>` : ''}
    ${refs.length ? `<h2 class="article-h">References</h2><ol class="references">${refs.map(r => { const u = learnSafeUrl(r.url); return `<li id="ref-${uiEsc(r.id || '')}">${uiEsc(r.citation || '')}${u ? ` <a href="${uiEsc(u)}" target="_blank" rel="noopener noreferrer" class="ref-url">${uiEsc(u)}</a>` : ''}${r.verify ? ' ' + uiChip('verify', 'caution') : ''}</li>`; }).join('')}</ol>` : ''}
    ${opts.full ? `<details><summary>Rules in this module (${(m.rules || []).length})</summary>${(m.rules || []).map(r => uiRuleHTML({ ...r, moduleName: m.name }, { hideModule: true })).join('') || '<p class="muted small">No rules.</p>'}</details>` : ''}
    ${opts.full && Array.isArray(m.tier2) && m.tier2.length ? `<h3>Numbers from your doctor or dietitian (Tier 2)</h3><ul>${m.tier2.map(t => `<li><strong>${uiEsc(t.label)}</strong>${t.consensus ? `: published range ${uiEsc(t.consensus)}` : ''}${t.why ? `. ${uiEsc(t.why)}` : ''}</li>`).join('')}</ul>` : ''}
    ${opts.full && Array.isArray(m.phases) && m.phases.length ? `<h3>Phases</h3><ul>${m.phases.map(p => `<li><strong>${uiEsc(p.label || p.id)}</strong>${p.min_weeks || p.max_weeks ? `: ${p.min_weeks || 0} to ${p.max_weeks || 'open'} weeks` : ''}</li>`).join('')}</ul>` : ''}
    ${refs.length ? `<details><summary>Sources the rules cite (${(m.sources || []).length})</summary>${uiSourcesHTML(m.sources)}</details>` : `<h2 class="article-h">Sources</h2>${uiSourcesHTML(m.sources)}`}
  </article>`;
}

// Kept for older callers: the education block without the article layer.
export function learnModuleHTML(m, opts = {}) {
  return learnArticleHTML(m, opts);
}

function learnRenderHow(root) {
  root.innerHTML = `
    ${uiPageHeader('How this app decides', 'The rules the engine follows, and where they come from.', `<a class="btn small" href="#/learn">${uiIcon('book')}All topics</a>`)}
    <article class="article">
      <h2>Two tiers of rules</h2>
      <p>Tier 1 rules come straight from published guidelines and apply to everyone with the condition: sodium under 2,300 mg a day for high blood pressure, for example. Tier 2 rules need a number that only your doctor or dietitian can set: a protein target in kidney disease, a fluid limit in advanced heart failure. The app knows the published range for a Tier 2 rule, shows it, and refuses to pick a value. Until you enter that number, that module runs on its Tier 1 rules only and the plan says so.</p>
      <h2>Hard conflicts stop the number, not the plan</h2>
      <p>Some conditions give opposite advice. DASH is potassium-rich; kidney disease limits potassium. When two of your modules disagree like that, the app generates no number for that nutrient, shows the conflict, and asks for a number from your doctor or dietitian. Everything else in the plan still builds.</p>
      <h2>Allergens are absolute</h2>
      <p>A confirmed food allergy is a hard exclusion. No preference, mode, phase, or acknowledgment overrides it. A recipe with a matching ingredient is never scheduled, and a checked food fails.</p>
      <h2>Unknown is not safe</h2>
      <p>The ingredient checker matches exact terms from a maintained dictionary. It does not guess. Anything it does not recognize is reported as "not recognized" and, when you have an allergen on file, that alone makes the verdict a caution. Terms like "natural flavors" or "spices" that can hide an allergen are flagged separately.</p>
      <h2>No language model in the safety path</h2>
      <p>Nothing that decides whether a food passes, what a number is, or what a rule says uses a language model. Safety decisions come from data files a person can read: the rules, the dictionary, the food table. Numbers are summed from grams; they never come from text. The one optional helper, on the Preferences step, can draft a description of a diet you name; it is labeled as general knowledge, it never saves anything by itself, and the rules it proposes are soft preferences you confirm.</p>
      <h2>Diets you define yourself</h2>
      <p>A diet that is not on the list can be added by name. It becomes a module marked "Defined by you" with soft rules and no evidence rating. It never loosens an allergen or a condition rule.</p>
      <h2>Nutrient data</h2>
      <p>Every food is a USDA FoodData Central record (SR Legacy or Foundation Foods), keyed by its FDC ID. The import script writes the food table; nobody edits numbers by hand. Where USDA has no value for a nutrient (added sugar, for example), the app shows "no data" rather than an estimate.</p>
      <h2>Adapted recipes and the swap list</h2>
      <p>When a recipe is blocked for a low FODMAP or low histamine plan only by ingredients on the swap list (<code>data/swaps.json</code>), the app offers an adapted copy: garlic becomes garlic-infused olive oil, onion becomes chives or spring onion green tops, wheat pasta becomes corn and rice pasta, milk becomes lactose-free milk, tomato becomes roasted red pepper, aged cheese becomes fresh mozzarella, cured meat becomes fresh chicken, and vinegar and fermented sauces are left out. Every swap cites its source. The adapted copy goes through the same checker as any recipe and is dropped if it still trips a rule. It appears only in the pool of a person whose plan restricts that family, labelled "adapted", and it never overrides an allergen. For Peace Meal's own recipes the nutrition is recomputed from the new ingredients; for recipes that only carry published per-serving numbers the copy keeps those numbers and is marked approximate.</p>
      <p>Peace Meal also ships its own recipes written for these diets, labelled "written for low FODMAP" or "written for low histamine", with every ingredient linked to a USDA food. The low histamine set is written to be eaten fresh, and a plan with the freshness rule schedules no leftovers.</p>
      <p><strong>Strict mode and approved-food lists.</strong> Each of these diets also has an approved-food list (<code>data/diet-lists.json</code>): foods the published sources allow, with portions where a threshold is published and a source on every item. When a plan restricts one of these families, strict mode is on by default: a recipe counts as safe only when every ingredient is on the list or on the person's own tolerated list, so an ingredient the dictionary does not know can no longer slip through as safe. The switch and the list are on the Plan screen. Each person can add foods they have tested and tolerate, and remove foods they react to; those changes live on the person, not in the data files. Items on the low histamine list marked "not re-checked" were not re-verified against the SIGHI leaflet in this build.</p>
      <p>For a low histamine trial the reference list is the SIGHI food compatibility list from the Swiss Interest Group Histamine Intolerance (<a href="https://www.histaminintoleranz.ch/en/downloads.html" target="_blank" rel="noopener noreferrer">histaminintoleranz.ch, downloads</a>), free for personal use and copyright SIGHI; it is not bundled into the app.</p>
      <h2>FODMAP tags are not Monash-verified</h2>
      <p>The low FODMAP module is built from published studies and USDA data. It does not use the Monash University database, and its tags carry a "not Monash-verified" notice. Portion notes matter: many foods are low FODMAP in a small serving and high in a large one.</p>
      <h2>Elimination phases</h2>
      <p>Elimination phases (low FODMAP, low histamine) run until you change them. The protocol's usual length is shown on the Plan screen, and you can ask the app to check in after a set number of weeks and ask whether to move on to reintroduction or keep going. A long elimination narrows what you eat, so the check-in is worth setting.</p>
      <h2>Stacked restrictions</h2>
      <p>Running several diets that each cut out whole food groups at the same time makes it harder to get enough fiber, calcium, protein, and variety. When three or more are active at once the plan says so and suggests running one at a time where you can.</p>
      <h2>Where this comes from</h2>
      <p>The evidence review behind every module is <strong>docs/PHASE-1-evidence-and-regulatory-foundation.md</strong> (Phase 1: Evidence and Regulatory Foundation), and the build decisions are in <strong>docs/PHASE-2-prd-and-architecture.md</strong>. Items marked VERIFY in Phase 1 are shown with that flag in the app until they are cleared in docs/VERIFY-log.md.</p>
      <p class="small muted">This app is for general wellness and education. It does not diagnose or treat any condition. Any medical targets, like a sodium or protein limit, come from your doctor or dietitian, never from the app.</p>
    </article>`;
}

// Recipe sources and attribution. The text follows docs/RECIPE-SOURCES.md; the counts are computed from the pool that is loaded.
function learnRenderSources(root) {
  const c = recipesSourceCounts();
  const ext = (url, label) => `<a href="${uiEsc(url)}" target="_blank" rel="noopener noreferrer">${uiEsc(label || url)}</a>`;
  const OGL = 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/';
  const CC = 'https://creativecommons.org/licenses/by-sa/4.0/';
  root.innerHTML = `
    ${uiPageHeader('Where the recipes come from', 'Every outside recipe collection imported into the app, the licence each one carries, the exact attribution wording the licence requires, what nutrition data each source provides, and the import counts.', `<a class="btn small" href="#/learn">${uiIcon('book')}All topics</a><a class="btn small" href="#/recipes">${uiIcon('leaf')}Recipes</a>`)}
    ${uiNoticeHTML({ level: 'info', text: 'Information from the NHS website is licensed under the Open Government Licence v3.0.' }).replace('</div></div>', ` ${ext(OGL, 'Read the licence')}.</div></div>`)}
    <div class="tiles" aria-label="Recipe counts, computed from the loaded pool">
      ${uiStatTile({ value: uiFmtNum(c.total), label: 'Shipped recipes', note: `${uiFmtNum(c.peaceMeal)} Peace Meal` })}
      ${uiStatTile({ value: uiFmtNum(c.nhs), label: 'NHS website', note: `${uiFmtNum(c.nhsWithNutrition)} with nutrition` })}
      ${uiStatTile({ value: uiFmtNum(c.parentclub), label: 'Parent Club Scotland', note: `${uiFmtNum(c.parentclubWithSodium)} with sodium` })}
      ${uiStatTile({ value: uiFmtNum(c.nhlbi), label: 'NHLBI (NIH)', note: `${uiFmtNum(c.nhlbiWithPotassium)} with potassium` })}
      ${uiStatTile({ value: uiFmtNum(c.wikibooks), label: 'Wikibooks Cookbook', note: `${uiFmtNum(c.wikibooksFeatured)} featured` })}
    </div>
    <p class="small muted">Live from the pool on this device: ${uiFmtNum(c.pool)} recipes in all, ${uiFmtNum(c.withNutrition)} with known nutrition, ${uiFmtNum(c.mine)} written in this household, ${uiFmtNum(c.linked)} imported recipe${c.linked === 1 ? '' : 's'} with ingredients linked by you.</p>
    <article class="article">
      <p>This page lists every outside recipe collection imported into the app, the licence each one carries, the exact attribution wording the licence requires, what nutrition data each source provides, and the import counts. The importer is <code>tools/import-open-recipes.mjs</code>; fetched pages are cached under <code>tools/open-recipes/</code> (not committed). No source here is a US federal publication.</p>
      <p class="small muted">Last import: 2026-09-09. File size: 4.00 MB (budget 4 MB). Total recipes at import: 2,457.</p>

      <h2>1. NHS website (United Kingdom)</h2>
      <p><strong>Information from the NHS website is licensed under the ${ext(OGL, 'Open Government Licence v3.0')}.</strong></p>
      <ul>
        <li>Source: NHS "Healthier Families" recipes, ${ext('https://www.nhs.uk/healthier-families/recipes/')} (index page and its breakfast, lunch, dinner, puddings-and-snacks, lunchbox, and BBQ collections; the site map was checked for other recipe pages under the same path).</li>
        <li>Licence: Open Government Licence v3.0, ${ext(OGL)}</li>
        <li>Attribution line stored on every recipe (<code>attribution</code> field) and shown wherever the recipe is displayed: <em>Contains public sector information licensed under the Open Government Licence v3.0</em></li>
        <li>robots.txt: fetched first (<code>tools/open-recipes/nhs-robots.txt</code>). The <code>User-agent: *</code> group does not disallow <code>/healthier-families/recipes/</code>, so the crawl went ahead. Every imported NHS recipe was checked again against the disallow list at verification time; 0 page(s) were blocked.</li>
        <li>Recipe ids: <code>nhs-&lt;page-slug&gt;</code>; <code>source_url</code> is the page the text came from.</li>
        <li>Nutrition data: the NHS pages publish per-serving energy (kJ/kcal), protein, carbohydrate (with sugars), fat (with saturates), fibre, and salt. These are stored as-is in <code>nutrition_per_serving</code> (<code>kcal</code>, <code>protein_g</code>, <code>carb_g</code>, <code>sugar_g</code>, <code>fat_g</code>, <code>satfat_g</code>, <code>fiber_g</code>, plus <code>salt_g</code> as published) with <code>nutrition_source: "nhs-website"</code>. <strong>Sodium is not published by the NHS; it is computed as salt grams x 400 mg</strong> and each recipe carries <code>conversion_note: "sodium computed from salt at 400 mg per gram"</code>. Values the page does not state are <code>null</code>. Numbers are copied from the page, not recomputed; where a page's own figures are internally inconsistent the importer logs it and keeps the published value.</li>
        <li>Text is adapted: headings, tips, and layout were removed; ingredient lines and method steps are stored as display text. Times come from the page's stated prep and cook times where present (<code>times_estimated: true</code> otherwise).</li>
        <li>Counts at import: 203 pages fetched, 196 recipe pages found, <strong>189 recipes imported</strong> (188 with stated times, 1 estimated). Loaded now: ${uiFmtNum(c.nhs)}.</li>
      </ul>

      <h2>2. Wikibooks Cookbook (worldwide, community written)</h2>
      <ul>
        <li>Source: the Wikibooks Cookbook, ${ext('https://en.wikibooks.org/wiki/Cookbook:Table_of_Contents')}, read through the MediaWiki API (<code>https://en.wikibooks.org/w/api.php</code>): members of <code>Category:Recipes</code>, <code>Category:Incomplete recipes</code>, and <code>Category:Featured recipes</code> in the <code>Cookbook:</code> namespace, with wikitext and category links fetched in batches of 50. No HTML was scraped.</li>
        <li>Licence: Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0), ${ext(CC)}. Wikibooks text is also available under CC BY-SA 3.0 for older revisions; we attribute under 4.0, the current site licence.</li>
        <li>Attribution stored on every recipe (<code>attribution</code> field), with the recipe title, "from the Wikibooks Cookbook", the page URL, and the licence with its link. Example: <em>"20-Minute Beef Stroganoff" from the Wikibooks Cookbook, ${ext('https://en.wikibooks.org/wiki/Cookbook:20-Minute_Beef_Stroganoff')}, licensed under CC BY-SA 4.0 (${ext(CC)})</em></li>
        <li>ShareAlike: the recipe text (ingredients and steps) is redistributed by this app under the same licence, CC BY-SA 4.0. Anyone who copies the Wikibooks recipes out of this app must keep that attribution and licence.</li>
        <li>Recipe ids: <code>wb-&lt;title-slug&gt;</code>; <code>source_url</code> is the Cookbook page.</li>
        <li>Fields taken from the page: the recipe summary template (category or cuisine, servings, time, difficulty), the ingredients list (bulleted or table), the procedure, and the page's category links (<code>wikibooks_categories</code>, which include cuisine, course, and diet categories such as vegan or gluten-free). Difficulty 1-2 maps to <code>beginner</code>, 3 to <code>comfortable</code>, 4-5 to <code>confident</code>; where the page states no difficulty the skill is estimated from the step count (<code>skill_estimated: true</code>). Where no time is stated it is estimated from the steps (<code>times_estimated: true</code>); where no servings value is stated it is set to 4 with <code>servings_estimated: true</code>. Recipes in <code>Category:Featured recipes</code> carry <code>featured: true</code>.</li>
        <li>Excluded: ingredient articles, techniques, disambiguation and index pages (no ingredients list or no procedure), cocktails and other alcoholic drinks, candy and confectionery, pages with fewer than 3 ingredients or fewer than 2 steps, titles containing "test", "template", or "sandbox", and pages whose procedure is not in English.</li>
        <li><strong>Nutrition data: none.</strong> The Wikibooks Cookbook does not publish nutrition figures, and this app never derives numbers from text. Wikibooks recipes therefore have no <code>nutrition_per_serving</code> and no <code>nutrition_source</code>, and the app shows "nutrition not available" for them until a person links each ingredient to a food in the recipe editor, after which nutrients are computed from <code>foods.json</code> by grams like any other recipe.</li>
        <li>Counts at import: 3812 candidate pages listed, 3535 passed the filters, 1267 dropped to stay under the size budget (recipes without a stated servings value first, then the longest step text), <strong>2268 recipes imported</strong> (1202 with stated times, 1066 estimated; 1421 with a stated servings value; 2177 with a stated difficulty; 40 featured). Skipped by reason: few-ingredients 86, cocktail-or-candy 84, few-steps 64, no-procedure 25, disambiguation 12, no-ingredients 4, non-english 1, title-filter 1. Loaded now: ${uiFmtNum(c.wikibooks)} (${uiFmtNum(c.wikibooksFeatured)} featured, ${uiFmtNum(c.wikibooksTimesEstimated)} with estimated times).</li>
      </ul>

      <h2>3. Parent Club (Scottish Government)</h2>
      <p><strong>Licence status, stated plainly:</strong> parentclub.scot says it "is run by the Scottish Government" and links to gov.scot, whose content is published under the ${ext(OGL, 'Open Government Licence v3.0')} ("All content is available under the Open Government Licence v3.0, except for graphic assets and where otherwise stated"). The Parent Club site itself carries no licence statement. The recipe text is Crown copyright and is used here on the assumption that the same licence applies; that assumption is recorded on every record and on this page rather than hidden. No photographs were taken.</p>
      <ul>
        <li>Source: Parent Club recipes, ${ext('https://www.parentclub.scot/recipes')}, one listing page and one page per recipe.</li>
        <li>Attribution line stored on every recipe (<code>attribution</code> field): <em>Recipe text from Parent Club (parentclub.scot), a Scottish Government website. Crown copyright. Used on the assumption that the Open Government Licence v3.0 applies as it does to gov.scot; parentclub.scot carries no licence statement of its own.</em></li>
        <li>robots.txt: fetched first. The <code>User-agent: *</code> group disallows only site administration paths, not <code>/recipes</code> or <code>/recipe/</code>.</li>
        <li>Recipe ids: <code>pcs-&lt;page-slug&gt;</code>; <code>source_url</code> is the page the text came from. Importer: <code>tools/import-parentclub.mjs</code>.</li>
        <li>Nutrition data: each page publishes a "Detailed nutritional information" table per 100 g and per serving: energy, protein, total fat, saturated fat, carbohydrate, total sugars, NSP fibre, <strong>sodium in mg</strong>, and salt. The per-serving column is stored as-is in <code>nutrition_per_serving</code> with <code>nutrition_source: "parentclub-scot"</code>; the serving weight is kept as <code>serving_grams</code>. A blank cell is left out, not guessed: every page leaves total fat blank, so <code>fat_g</code> is absent for this collection and only saturated fat is known. Fibre is by the NSP method, which reads lower than the AOAC method used by USDA foods. Where a page publishes sodium and salt that disagree by more than a quarter, the importer logs it and keeps the published sodium.</li>
        <li>Ingredient lines keep the site's gram weights in the text, for example "2 Tablespoons (30g) Tomato Puree", so the grocery list and any later food linking can use them.</li>
        <li>Meal slots come from the site's category (breakfast, lunch, dinner, starter, snack, dessert) and the title, then pass through the same component and breakfast checks as every other collection.</li>
        <li>Loaded now: ${uiFmtNum(c.parentclub)} recipes, ${uiFmtNum(c.parentclubWithSodium)} with published sodium.</li>
      </ul>

      <h2>4. NHLBI Healthy Eating Recipes (National Institutes of Health, United States)</h2>
      <p><strong>Public domain.</strong> Works of the United States Government are not subject to copyright (17 U.S.C. section 105); the National Heart, Lung, and Blood Institute is a federal institute, so its recipe text is public domain. The NIH web-policies page could not be reached from the build environment, so the statute is cited rather than the page. Included at the household's request; it is a collection switch in Settings like every other outside source.</p>
      <ul>
        <li>Source: ${ext('https://www.nhlbi.nih.gov/health/heart-healthy-living/healthy-foods/healthy-eating-recipes')}, seven listing pages of ten and one page per recipe. Importer: <code>tools/import-nhlbi.mjs</code>.</li>
        <li>Attribution line stored on every recipe: <em>Recipe from the National Heart, Lung, and Blood Institute (NHLBI), National Institutes of Health, nhlbi.nih.gov. Public domain as a work of the United States Government.</em></li>
        <li>robots.txt: fetched first; the recipe pages are not disallowed for <code>User-agent: *</code>.</li>
        <li>Recipe ids: <code>nhlbi-&lt;page-slug&gt;</code>; <code>source_url</code> is the page the text came from.</li>
        <li>Nutrition data: each page publishes a per-serving "Nutritional Facts" table: calories, total fat, saturated fat, cholesterol, <strong>sodium</strong>, fiber, protein, carbohydrates, and <strong>potassium</strong>. Stored as-is with <code>nutrition_source: "nhlbi"</code>; the stated serving size is kept as <code>serving_size_text</code>. A fiber value printed as "0 (less than 1g)" is stored as 0. Ten of the pages publish only calories, fat, saturated fat, cholesterol, and sodium; those recipes carry no protein, carbohydrate, fiber, or potassium value, and the app leaves the field blank rather than guessing.</li>
        <li>Ingredient lines use American measures (cups, tablespoons, ounces). Two pages had no ingredient list and were skipped. Loaded now: ${uiFmtNum(c.nhlbi)} recipes.</li>
      </ul>

      <h2>How the app uses these recipes</h2>
      <ul>
        <li>Ingredients are display-only (<code>{ "display": "..." }</code>, no <code>food</code> link, no grams). The dictionary tags ingredient text at run time for allergen and diet checks, and anything unrecognised is reported as such, never treated as safe.</li>
        <li>NHS, Parent Club, and NHLBI recipes show the stored per-serving nutrition (<code>recipeTotals</code> in <code>src/engine/nutrition.js</code> uses it when a recipe has <code>nutrition_source</code> and <code>nutrition_per_serving</code> and no linked foods).</li>
        <li>Wikibooks recipes show no nutrition until ingredients are linked in the editor.</li>
        <li><code>tags</code> is empty on every imported recipe because the tag vocabulary is controlled; tags are added by hand or by the dictionary at run time.</li>
        <li>Recipes you write yourself ("Mine") and ingredient links you add are stored on this device in your profile, never in the data files.</li>
        <li>Adapted copies made by the swap list (<code>data/swaps.json</code>) are built on this device from the recipes above and are never written back to the data files. Four derived food records (lactose-free milk, low-fat milk, yogurt, and cream) copy the USDA numbers of their base food with the lactose tags removed; they are marked <code>dataset: "derived"</code> in <code>foods.json</code>.</li>
      </ul>

      <h2>Peace Meal recipes</h2>
      <p>The ${uiFmtNum(c.peaceMeal)} recipes written for Peace Meal link every ingredient to a USDA FoodData Central record, so their nutrients are summed from <code>foods.json</code> by grams. They carry no outside licence.</p>
      <p class="small muted">This app is for general wellness and education. It does not diagnose or treat any condition. Any medical targets, like a sodium or protein limit, come from your doctor or dietitian, never from the app.</p>
    </article>`;
}
