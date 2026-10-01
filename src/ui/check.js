// Check: paste an ingredient list or search a food, get a verdict with the rules behind it.
import { checkText, checkFood } from '../engine/checker.js';
import { nutrientsForGrams, derived, round } from '../engine/nutrition.js';
import { uiState, uiEsc, uiActivePerson, uiPlanFor, uiRulesList, uiVerdictWord, uiNutrientLabel, uiFmtNum, uiPageHeader, uiSection, uiChip, uiModal, uiIcon, uiEmptyState, uiPortionsHTML } from './common.js';

let checkLastText = '';
let checkLastRules = [];

// Runs Tesseract (open-source OCR) in the browser, loaded on first use. Nothing about the photo leaves the device.
// Every outside file is pinned to one version and checked against the SHA-384 hash below before it runs (2026-09 audit):
// the main script through the script tag's integrity attribute; the worker, the recognition core, and the English data
// through fetch(url, { integrity }), which the browser enforces (a changed file is refused, not run). Tesseract then gets
// local copies (blob URLs) and fetches nothing itself. Hashes were computed from the files and match cdnjs's published ones.
const CHECK_OCR = {
  script: { url: 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/tesseract.min.js', integrity: 'sha384-GJqSu7vueQ9qN0E9yLPb3Wtpd7OrgK8KmYzC8T1IysG1bcvxvIO4qtYR/D3A991F' },
  worker: { url: 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/worker.min.js', integrity: 'sha384-zxn+VqofFzXpH99dUb3fa4ywoSBQJPy6/6oEaJHPlblZXr53a0g1Jl6720vgSzB7' },
  core: { url: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-lstm.wasm.js', integrity: 'sha384-EKWY5JDwphQoyxhvYU7eaCcyQ0EdV6fZK3L2vzfZcv2ichRdNd6pSnyWPNv6fMuR' },
  coreSimd: { url: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-simd-lstm.wasm.js', integrity: 'sha384-YM1G+zaWYy9VSRP2C101LCgzh7n3Hqb6OEm9qDoZYgCADsni3nnECskC3WialQB7' },
  eng: { url: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz', integrity: 'sha384-JI+fraGAoc5GBGIliuqzHRnP1nJyrukg5ggNSBv/TO+YOVj+6Te6XXQOx7ia10xq' }
};
let checkOcrLoading = null;
function checkLoadOcr() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (checkOcrLoading) return checkOcrLoading;
  checkOcrLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = CHECK_OCR.script.url;
    s.integrity = CHECK_OCR.script.integrity;
    s.crossOrigin = 'anonymous';
    s.onload = () => window.Tesseract ? resolve(window.Tesseract) : reject(new Error('reader did not load'));
    s.onerror = () => { checkOcrLoading = null; reject(new Error('reader blocked or changed')); };
    document.head.appendChild(s);
  });
  return checkOcrLoading;
}
// One pinned file, after the browser has checked its hash. P3-11 (audit of September 30, 2026): the browser's own error
// is kept as the cause, so the console says why (offline, blocked, or a changed file). Exported for the P3-11 test.
export async function checkPinnedFetch(f) {
  let res;
  try { res = await fetch(f.url, { integrity: f.integrity, mode: 'cors', credentials: 'omit' }); } catch (e) { throw new Error('a reader file did not load or did not match its hash', { cause: e }); }
  if (!res.ok) throw new Error('a reader file did not load (' + res.status + ')');
  return res;
}
// Tesseract's own test for WebAssembly SIMD (the same bytes as its worker), so the same core is chosen that it would pick.
function checkHasSimd() { try { return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])); } catch { return false; } }
function checkDataURL(blob) {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error('could not read the language data')); r.readAsDataURL(blob); });
}
let checkOcrFiles = null;
function checkLoadOcrFiles() {
  if (checkOcrFiles) return checkOcrFiles;
  checkOcrFiles = (async () => {
    const [worker, core, eng] = await Promise.all([checkPinnedFetch(CHECK_OCR.worker), checkPinnedFetch(checkHasSimd() ? CHECK_OCR.coreSimd : CHECK_OCR.core), checkPinnedFetch(CHECK_OCR.eng)]);
    // The worker runs one script: the checked core first (so Tesseract skips its own download of it), then the checked
    // worker. One blob, because a worker started from a page opened as a file cannot load a second blob.
    const boot = URL.createObjectURL(new Blob([await core.text(), '\n;\n', await worker.text()], { type: 'text/javascript' }));
    // Tesseract asks for "<langPath>/eng.traineddata.gz". A data URL ending in "#" answers that with the checked data:
    // everything after the "#" is a fragment and is ignored.
    const langPath = (await checkDataURL(new Blob([await eng.arrayBuffer()], { type: 'application/gzip' }))) + '#';
    return { boot, langPath };
  })().catch(e => { checkOcrFiles = null; throw e; });
  return checkOcrFiles;
}
async function checkReadImage(file, onProgress) {
  const T = await checkLoadOcr();
  const f = await checkLoadOcrFiles();
  const worker = await T.createWorker('eng', 1, { workerPath: f.boot, workerBlobURL: false, langPath: f.langPath, gzip: true, cacheMethod: 'none', logger: m => { if (m.status === 'recognizing text' && onProgress) onProgress(Math.round((m.progress || 0) * 100)); } });
  try { const { data } = await worker.recognize(file); return data.text || ''; } finally { await worker.terminate(); }
}

// What the photo button needs, said plainly (2026-09 audit): until the reader is bundled into the app, the first photo
// downloads it (about 7 MB: the pinned files in CHECK_OCR). The browser keeps that copy, so later photos usually work
// without a connection, until the phone clears its storage.
export function checkOcrNote(lite) {
  return lite
    ? 'Reading a photo needs Wi-Fi the first time. It downloads a reader, about 7 MB, to this phone. After that it usually works without Wi-Fi. No Wi-Fi? Point your phone\'s camera at the label, tap the text, Copy, then paste it here.'
    : 'Photo of the label reads the ingredient text off a picture and puts it in the box for you to check. It needs the internet the first time: it downloads a reader of about 7 MB. After that it usually works offline, until the browser clears its storage. It works in the downloaded app, not the claude.ai link. Your phone\'s camera can do the same: point it at the label, tap the text, Copy, then paste here.';
}

export function renderCheckScreen(root) {
  const person = uiActivePerson();
  const plan = uiPlanFor(person);
  const foods = uiState.data.foods;
  root.innerHTML = `
    ${uiPageHeader('Check a food', `Two questions, both answered against ${uiEsc(person.name)}'s plan. Anything the app does not recognize is reported, never assumed safe.`)}
    <div class="card">
      <h2>Is this product okay?</h2>
      <p class="small muted">Copy the ingredient list off a package (or type a dish) and get a plain answer: fine, caution, or no, and why.</p>
      <label for="check-text" class="visually-hidden">Ingredient list</label>
      <textarea id="check-text" placeholder="Ingredients: water, roasted peanuts, salt, natural flavors">${uiEsc(checkLastText)}</textarea>
      <div class="btn-row"><button class="btn primary" type="button" id="check-run">${uiIcon('check')}Check this list</button><label class="btn" for="check-photo">${uiIcon('search')}Photo of the label</label><input id="check-photo" type="file" accept="image/*" capture="environment" class="visually-hidden"><button class="btn" type="button" id="check-clear">Clear</button></div>
      <p class="small muted" id="check-ocr-status">${checkOcrNote(!!uiState.lite)}</p>
    </div>
    <div class="card">
      <h2>What is in one food?</h2>
      <p class="small muted">Look up a single food to see its numbers (sodium, potassium, sugar, fiber, and whatever else ${uiEsc(person.name)}'s plan watches) and whether it fits. Same ${uiFmtNum(foods.length)} foods Today uses when you log a meal.</p>
      <label for="check-search" class="visually-hidden">Look up a food</label>
      <input id="check-search" type="search" placeholder="Type a food: banana, Greek yogurt, canned tuna" autocomplete="off" ${foods.length ? '' : 'disabled'}>
      <ul class="search-results" id="check-results" hidden></ul>
      ${foods.length ? '' : '<p class="small muted">The food database (data/foods.json) is not loaded.</p>'}
    </div>
    <div id="check-result" aria-live="polite" aria-atomic="true" class="stack-2"></div>
  `;
  const ta = root.querySelector('#check-text');
  const out = root.querySelector('#check-result');
  const show = html => { out.innerHTML = html; checkBindResult(out); };
  root.querySelector('#check-run').addEventListener('click', () => {
    checkLastText = ta.value;
    if (!ta.value.trim()) { show(uiEmptyState('Type or paste something first.', '', 'list')); return; }
    const r = checkText(ta.value, plan, uiState.matcher, person);
    show(checkResultHTML(r, person, plan, { title: 'Ingredient text' }));
    if (out.scrollIntoView) out.scrollIntoView({ behavior: 'smooth', block: 'start' });   // the answer sits below the fold on a phone
  });
  ta.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') root.querySelector('#check-run').click(); });
  root.querySelector('#check-clear').addEventListener('click', () => { ta.value = ''; checkLastText = ''; out.innerHTML = ''; ta.focus(); });
  root.querySelector('#check-photo').addEventListener('change', async e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const status = root.querySelector('#check-ocr-status');
    status.textContent = 'Reading the label...';
    try {
      const text = await checkReadImage(file, pct => { status.textContent = `Reading the label... ${pct}%`; });
      const cleaned = text.replace(/\s+/g, ' ').trim();
      if (!cleaned) { status.textContent = 'Could not read any text. Try a closer, flatter, better-lit photo, or copy the text with your phone camera.'; return; }
      ta.value = (ta.value.trim() ? ta.value.trim() + ' ' : '') + cleaned;
      checkLastText = ta.value;
      status.textContent = 'Text added. Look it over, fix anything the camera misread, then tap Check this list.';
      ta.focus();
    } catch (err) {
      console.warn('The label reader did not load:', err, err && err.cause);   // P3-11: the cause, for whoever looks at the console
      status.textContent = uiState.lite
        ? 'The label reader could not load. It needs Wi-Fi the first time. Or use your phone camera to copy the text, then paste it above.'
        : 'The label reader could not load here (' + (err && err.message ? err.message : 'no internet or blocked') + '). It needs the internet the first time. Or use your phone camera to copy the text, then paste it above.';
    } finally { e.target.value = ''; }
  });

  const search = root.querySelector('#check-search');
  const results = root.querySelector('#check-results');
  if (search) search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    if (q.length < 2) { results.hidden = true; results.innerHTML = ''; return; }
    const words = q.split(/\s+/);
    const hits = foods.filter(f => { const n = (f.name + ' ' + (f.short || '')).toLowerCase(); return words.every(w => n.includes(w)); }).slice(0, 12);
    results.innerHTML = hits.length ? hits.map(f => `<li><button type="button" data-food="${uiEsc(f.id)}"><strong>${uiEsc(f.short || f.name)}</strong><br><span class="small muted">${uiEsc(f.name)} · ${uiEsc(f.group || '')}</span></button></li>`).join('') : '<li><button type="button" disabled>No matching food.</button></li>';
    results.hidden = false;
    results.querySelectorAll('[data-food]').forEach(b => b.addEventListener('click', () => {
      const food = uiState.foodsById.get(b.dataset.food);
      if (!food) return;
      const r = checkFood(food, plan, uiState.matcher, person);
      show(checkResultHTML(r, person, plan, { title: food.short || food.name, food }));
      results.hidden = true;
      out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  });
}

// What a stop and a caution mean, on the Why sheet (P2-10: plain words; the app's own terms were "hard stop",
// "soft rule", and "acknowledgment").
export const CHECK_WHY_HARD = 'Never eat this. No preference, mode, or "I understand" tap turns this rule off.';
export const CHECK_WHY_SOFT = 'A caution, not a stop. You decide.';

// Wires the "why" links (rules behind a match) to a sheet.
export function checkBindResult(root) {
  root.querySelectorAll('[data-why]').forEach(b => b.addEventListener('click', () => {
    const h = checkLastRules[Number(b.dataset.why)];
    if (!h) return;
    uiModal(`<p class="small muted">${uiEsc(h.note ? h.note : h.hard ? CHECK_WHY_HARD : CHECK_WHY_SOFT)}</p>${uiRulesList(h.rules)}`, { title: `Why: ${h.label}` });
  }));
}

// The headline under the verdict word. A caution that comes only from words the app cannot place (not recognized, a
// term that can hide something, or not on a strict approved list) is a "not sure", never a pass.
export function checkHeadline(r, lite = false) {
  const verdict = r.verdict;
  // P2-10: the stop in plain words ("Contains a hard exclusion." until September 30, 2026).
  if (verdict === 'fail') return lite ? 'No. This has something you must not eat.' : 'No: contains something this plan never allows.';
  const known = (r.notApproved || []).filter(n => n.why === 'avoid' || n.why === 'reacts').length;   // on a leave-out list: a known problem
  const unsure = (r.unrecognized || []).length || (r.unknownRisk || []).length || (r.notApproved || []).length - known;
  const salt = (r.sodium || [])[0];
  const flagged = (r.hits || []).length || (r.termHits || []).length || (r.verifyLabel || []).length || known || !!salt;
  if (verdict === 'caution') {
    if (unsure && !flagged) return lite ? 'Not sure. Ask before eating.' : 'Not sure: the app cannot say these ingredients are safe for this plan.';
    if ((r.smallServe || []).length && !flagged && !(r.exceeds || []).length) return 'Several small-serve foods together. Keep each one to a small serve.';
    const onlyLabel = (r.verifyLabel || []).length && !(r.hits || []).length && !(r.termHits || []).length && !known && !salt;
    if (onlyLabel) { const what = [...new Set(r.verifyLabel.map(v => String(v.label || v.tag).toLowerCase()))].join(' and '); return lite ? `Check the label for ${what} before eating.` : `Check the label for ${what}.`; }
    // P1-3: salt is the only flag. A food from the food list has its USDA number; a label has its Nutrition Facts panel.
    const onlySalt = salt && !(r.hits || []).length && !(r.termHits || []).length && !(r.verifyLabel || []).length && !known && !unsure && !(r.smallServe || []).length;
    if (onlySalt) return salt.per100g != null ? `High in salt: ${uiFmtNum(salt.per100g)} mg sodium per 100 g.` : `${salt.terms.length ? 'High in salt.' : 'Can be high in salt.'} Check the sodium on the label.`;
    return 'Something here needs a look.';
  }
  if ((r.unrecognized || []).length) return 'Nothing is restricted in this plan, so nothing is flagged. Some words were not recognized.';
  return 'Nothing in the plan flags this.';
}

export function checkResultHTML(r, person, plan, opts = {}) {
  const verdict = r.verdict;
  const unrec = r.unrecognized || [];
  const notApproved = r.notApproved || [];
  const headline = checkHeadline(r, !!uiState.lite);
  // The Why buttons: the avoid rules behind each match, then the sodium limit's own rules (P1-3).
  checkLastRules = [...r.hits, ...(r.sodium || []).map(s => ({ label: 'Sodium limit', hard: false, note: 'The plan\'s daily sodium limit. Salt is not a stop: check how much sodium is in it and count it toward the day.', rules: s.rules }))];
  const famLabel = f => { const l = uiState.data['diet-lists'] && uiState.data['diet-lists'].families && uiState.data['diet-lists'].families[f]; return l ? l.label : f; };
  return `
    <div class="verdict ${verdict}" role="${verdict === 'fail' ? 'alert' : 'status'}">
      <div class="verdict-word">${uiVerdictWord(verdict)}</div>
      <div class="verdict-reason">${headline}</div>
      <div class="small"><strong>${uiEsc(opts.title || '')}</strong>${opts.food && opts.food.group ? ` <span class="muted">${uiEsc(opts.food.group)}</span>` : ''}</div>
      ${unrec.length && verdict === 'caution' ? '<div class="small"><strong>Some ingredients were not recognized.</strong> With restrictions on file, that alone is a caution.</div>' : ''}
    </div>
    ${r.hits.length ? uiSection('Matches', `<div class="list boxed">${r.hits.map((h, i) => `<div class="match-row">
        ${uiChip(h.hard ? 'hard stop' : 'soft', h.hard ? 'stop' : 'caution')}
        <div><strong>${uiEsc(h.label)}</strong>${h.terms && h.terms.length ? `<div class="match-term">matched: ${h.terms.map(uiEsc).join(', ')}</div>` : ''}</div>
        <button class="btn link small" type="button" data-why="${i}">Why (${h.rules.length})</button>
      </div>`).join('')}</div>`, { id: 'check-matches-h' }) : ''}
    ${(r.termHits || []).some(t => t.allergy) ? uiSection('On your allergy list', `<div class="list boxed">${r.termHits.filter(t => t.allergy).map(t => `<div class="match-row">${uiChip('hard stop', 'stop')}<div><strong>${uiEsc(t.term)}</strong><div class="match-term">other allergy you listed on the Allergies step</div></div><span></span></div>`).join('')}</div>`, { id: 'check-allergy-terms-h' }) : ''}
    ${(r.termHits || []).some(t => !t.allergy) ? uiSection('Your avoid words', `<div class="list boxed">${r.termHits.filter(t => !t.allergy).map(t => `<div class="match-row">${uiChip('soft', 'caution')}<div><strong>${uiEsc(t.term)}</strong><div class="match-term">personal preference</div></div><span></span></div>`).join('')}</div>`, { id: 'check-terms-h' }) : ''}
    ${(r.verifyLabel || []).length ? uiSection('Check the label', `<div class="list boxed">${r.verifyLabel.map(v => `<div class="rule"><strong>${uiEsc(v.label)}</strong> <span class="small muted">can be in: ${(v.terms || []).map(uiEsc).join(', ')}</span><div class="small">Often, but not always. The package's ingredient list and allergy statement settle it.</div></div>`).join('')}</div>`, { id: 'check-label-h' }) : ''}
    ${(r.sodium || []).length ? uiSection('Salt', `<div class="list boxed">${r.sodium.map((s, i) => `<div class="match-row">
        ${uiChip('soft', 'caution')}
        <div>${s.terms.length ? `<strong>High in salt:</strong> ${s.terms.map(uiEsc).join(', ')}` : ''}${s.terms.length && s.mayTerms.length ? '<br>' : ''}${s.mayTerms.length ? `<strong>Can be high in salt:</strong> ${s.mayTerms.map(uiEsc).join(', ')}` : ''}
        <div class="small">${s.per100g != null ? `USDA lists ${uiFmtNum(s.per100g)} mg sodium per 100 g. This plan's sodium limit is ${uiFmtNum(s.limit)} mg a day; the table below shows how much a portion adds.` : `This plan's sodium limit is ${uiFmtNum(s.limit)} mg a day. Look at the sodium on the Nutrition Facts label and count it toward the day.`}</div></div>
        <button class="btn link small" type="button" data-why="${r.hits.length + i}">Why (${s.rules.length})</button>
      </div>`).join('')}</div>`, { id: 'check-salt-h' }) : ''}
    ${(r.unknownRisk || []).length ? uiSection('Terms that can hide something', `<div class="list boxed">${r.unknownRisk.map(u => `<div class="rule"><strong>${uiEsc(u.term)}</strong>${u.segment ? ` <span class="small muted">in "${uiEsc(u.segment)}"</span>` : ''}<div class="small">${uiEsc(u.note || 'This term does not say what it contains.')}</div></div>`).join('')}</div>`, { id: 'check-hide-h' }) : ''}
    ${(r.notes || []).length ? uiSection('Portion notes', `<div class="list boxed">${r.notes.map(n => `<div class="rule"><strong>${uiEsc(n.term)}</strong><div class="small">${uiEsc(n.note)}</div></div>`).join('')}</div>`, { id: 'check-notes-h' }) : ''}
    ${uiPortionsHTML(r) ? uiSection('Portions on the approved list', uiPortionsHTML(r), { id: 'check-portions-h' }) : ''}
    ${notApproved.length ? uiSection('Not on the approved list', `<ul class="small">${notApproved.map(n => `<li>${uiEsc(n.label)} <span class="muted">(${uiEsc(famLabel(n.family))}${n.why === 'avoid' ? `: on the list's leave-out foods${n.avoid ? ', ' + uiEsc(n.avoid) : ''}` : n.why === 'reacts' ? ': you marked it as a food you react to' : ''})</span></li>`).join('')}</ul><p class="small muted">Strict mode is on, so only foods on the approved list, or on your own tolerated list, count as safe.</p>`, { id: 'check-strict-h' }) : ''}
    ${unrec.length ? uiSection('Not recognized', `<ul class="small">${unrec.map(u => { const p = (r.unplaced || []).find(x => x.segment === u); return `<li>${uiEsc(u)}${p ? ` <span class="muted">(the word${p.words.length > 1 ? 's' : ''} ${p.words.map(w => '"' + uiEsc(w) + '"').join(', ')})</span>` : ''}</li>`; }).join('')}</ul><p class="small muted">The app does not assume these are safe. Check the label yourself or add the term to the dictionary.</p>`, { id: 'check-unrec-h' }) : ''}
    ${(r.preferHits || []).length ? uiSection('Fits a preference', `<div class="chip-cloud">${r.preferHits.map(p => uiChip(p.label, 'pass')).join('')}</div>`, { id: 'check-prefer-h' }) : ''}
    ${opts.food ? checkFoodNutrientsHTML(opts.food, plan) : ''}
    ${opts.food && opts.food.tags && opts.food.tags.length ? `<p class="small muted">Tags: ${opts.food.tags.map(t => `<code>${uiEsc(t)}</code>`).join(' ')}</p>` : ''}
    ${opts.food && opts.food.fdcId ? `<p class="small muted">USDA FoodData Central ID ${uiEsc(opts.food.fdcId)}${opts.food.dataset ? ` (${uiEsc(opts.food.dataset)})` : ''}. Numbers are per the USDA file, never estimated.</p>` : ''}
  `;
}

function checkFoodNutrientsHTML(food, plan) {
  const keys = [...new Set([...Object.keys(plan.limits || {}), ...Object.keys(plan.targets || {})])];
  if (!keys.length) return '<p class="small muted">No nutrient limits or targets are active in the plan, so no per-portion comparison is shown.</p>';
  const portion = (food.portions || []).find(p => p.grams && p.grams !== 100) || (food.portions || [])[0] || null;
  const per100 = nutrientsForGrams(food, 100);
  const perPortion = portion ? nutrientsForGrams(food, portion.grams) : null;
  const d100 = derived(per100);
  const dPortion = perPortion ? derived(perPortion) : null;
  const rows = keys.map(k => {
    const lim = plan.limits[k];
    const tg = plan.targets[k];
    const daily = lim ? lim.value : tg ? tg.min : null;
    const isPct = /_pct_kcal$/.test(k);
    const v100 = isPct ? d100[k] : per100[k];
    const vPortion = perPortion ? (isPct ? dPortion[k] : perPortion[k]) : null;
    const missing = per100._missing && per100._missing[k];
    const pct = vPortion != null && daily && !isPct ? round(vPortion / daily * 100) : null;
    const cls = pct == null ? '' : lim ? (pct > 100 ? 'over' : '') : (pct >= 100 ? 'ok' : '');
    const word = pct == null ? '' : lim ? (pct > 100 ? ' over' : '') : (pct >= 100 ? ' met' : '');
    return `<tr><td>${uiEsc(uiNutrientLabel(k))}</td><td class="num">${missing ? '<span class="muted">no data</span>' : uiFmtNum(v100, 1)}</td><td class="num">${perPortion ? (missing ? '<span class="muted">no data</span>' : uiFmtNum(vPortion, 1)) : ''}</td><td class="num">${daily != null ? uiFmtNum(daily, 1) : ''}${lim && lim.clinician || tg && tg.clinician ? ' ' + uiChip('doctor or dietitian', 'plum') : ''}</td><td class="num ${cls}">${pct != null ? pct + '%' + word : ''}</td></tr>`;
  }).join('');
  return uiSection('Nutrients that matter for this plan', `<div class="table-wrap"><table>
    <thead><tr><th>Nutrient</th><th class="num">Per 100 g</th><th class="num">${portion ? 'Per ' + uiEsc(portion.label) + ' (' + portion.grams + ' g)' : 'Per portion'}</th><th class="num">Daily number</th><th class="num">% of daily (portion)</th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    <p class="small muted">"no data" means the USDA record has no value for that nutrient; the app does not fill it in.</p>`, { id: 'check-nut-h' });
}
