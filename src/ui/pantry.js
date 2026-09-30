// Pantry: "what can I make with what I have". Matches pantry text against recipe ingredients, ranks by fewest missing,
// checks each recipe against the active person's plan, and can push the missing items onto the grocery list.
import { matchRecipes } from '../engine/pantry.js';
import { checkRecipe } from '../engine/checker.js';
import { cuisineSkipped } from '../engine/cuisine.js';
import { spiceSkipped } from '../engine/spice.js';
import { isComponent } from '../engine/planner.js';
import { uiState, uiEsc, uiActivePerson, uiPlanFor, uiPersist, uiToast, uiVerdictWord, uiVerdictChip, uiPageHeader, uiSection, uiIcon, uiEmptyState, uiEnsureAllRecipes } from './common.js';
import { weekRecipeModal } from './week.js';
import { recipesTasteHTML, recipesBindTaste, recipesIsNever } from './recipes.js';
import { groceryAddExtra } from './grocery.js';

let pantryResults = null;

function pantryParse(text) {
  return String(text || '').split(/[,\n;]+/).map(s => s.trim()).filter(Boolean);
}

export function renderPantryScreen(root) {
  const person = uiActivePerson();
  const plan = uiPlanFor(person);
  const profile = uiState.profile;
  if (!Array.isArray(profile.pantry)) profile.pantry = [];
  const have = profile.pantry;
  const results = pantryResults && pantryResults.person === person.id ? pantryResults : null;
  root.innerHTML = `
    ${uiPageHeader('Pantry', `Type what is in the kitchen and the app ranks recipes by how few ingredients you would still need. Each recipe is checked against ${uiEsc(person.name)}'s plan.`)}
    <div class="card">
      <div class="field"><label for="pantry-text">What do you have at home? One item per line or separated by commas</label>
        <textarea id="pantry-text" style="min-height:120px" placeholder="chicken, rice, broccoli&#10;eggs&#10;canned tomatoes">${uiEsc(have.join('\n'))}</textarea>
        <div class="hint">Saved on this device as you type. Salt, oil, water, and common spices are assumed on hand.</div></div>
      <div class="btn-row"><button class="btn primary" type="button" id="pantry-find">${uiIcon('search')}Find recipes</button><button class="btn" type="button" id="pantry-clear">Clear</button></div>
    </div>
    <div id="pantry-results" class="stack-2">${results ? pantryResultsHTML(results, person) : ''}</div>
  `;
  const ta = root.querySelector('#pantry-text');
  ta.addEventListener('input', () => { profile.pantry = pantryParse(ta.value); uiPersist(); });
  root.querySelector('#pantry-clear').addEventListener('click', () => { ta.value = ''; profile.pantry = []; pantryResults = null; uiPersist(); uiState.rerender(); });
  root.querySelector('#pantry-find').addEventListener('click', () => {
    profile.pantry = pantryParse(ta.value);
    uiPersist();
    if (!profile.pantry.length) { uiToast('List at least one item.'); return; }
    uiEnsureAllRecipes();
    if (!uiState.data.recipes.length) { uiToast('No recipes are loaded.'); return; }
    const matches = matchRecipes({ have: profile.pantry, recipes: (uiState.recipesForPlan ? uiState.recipesForPlan(uiPlanFor(person)) : uiState.data.recipes).filter(r => !isComponent(r) && !cuisineSkipped(r, person) && !spiceSkipped(r, person)), foodsById: uiState.foodsById });
    const rows = matches.map(m => ({ ...m, check: checkRecipe(m.recipe, plan, uiState.matcher, uiState.foodsById, person) }));
    pantryResults = { person: person.id, rows, have: profile.pantry.slice() };
    uiState.rerender();
  });
  pantryBindResults(root, person, plan);
}

function pantryHitHTML(m, person) {
  const r = m.recipe, v = m.check.verdict;
  return `<div class="pantry-hit">
    <div class="row between"><div><span class="dot ${v}" aria-hidden="true"></span><span class="visually-hidden">${uiVerdictWord(v)}: </span><strong>${uiEsc(r.name)}</strong> ${uiVerdictChip(v)}</div>
      <span class="small muted">${m.missingCount === 0 ? 'nothing missing' : `${m.missingCount} missing`} · ${r.active_min} min active, ${r.total_min} total</span></div>
    ${m.check.hits && m.check.hits.length ? `<div class="small">${v === 'fail' ? 'Hard exclusion' : 'Caution'}: ${m.check.hits.map(h => uiEsc(h.label)).join(', ')}</div>` : ''}
    <div class="lists"><div><span class="k">You have</span><br>${m.present.map(uiEsc).join(', ') || '<span class="muted">nothing matched</span>'}</div><div><span class="k">Missing</span><br>${m.missing.map(uiEsc).join(', ') || '<span class="muted">nothing</span>'}</div></div>
    <div class="btn-row" style="margin-top:8px"><button class="btn small" type="button" data-open="${uiEsc(r.id)}">${uiIcon('book')}Open recipe</button>${m.missingCount && v !== 'fail' ? `<button class="btn small" type="button" data-missing="${uiEsc(r.id)}">${uiIcon('cart')}Add missing to grocery list</button>` : ''}${recipesTasteHTML(person, r.id)}</div>
  </div>`;
}

function pantryResultsHTML(results, person) {
  const ok = results.rows.filter(m => m.check.verdict !== 'fail' && !recipesIsNever(person, m.recipe.id));
  const bad = results.rows.filter(m => m.check.verdict === 'fail');
  const never = results.rows.filter(m => m.check.verdict !== 'fail' && recipesIsNever(person, m.recipe.id)).length;
  if (!results.rows.length) return uiEmptyState('No recipe uses at least half of what you listed. Try broader words, for example "chicken" rather than "chicken thighs".');
  return `${uiSection(`${ok.length} recipe${ok.length === 1 ? '' : 's'} you could make`, `<p class="small muted">Ranked by fewest missing ingredients. Searched for: ${results.have.map(uiEsc).join(', ')}.</p>
      <div class="list boxed">${ok.map(m => pantryHitHTML(m, person)).join('') || '<p class="muted small" style="padding:12px 0">Every match has a hard exclusion for this person.</p>'}</div>${never ? `<p class="small muted">${never} match${never === 1 ? '' : 'es'} marked never again ${never === 1 ? 'is' : 'are'} not shown.</p>` : ''}`, { id: 'pantry-res-h' })}
    ${bad.length ? `<details class="card"><summary>Not allowed for ${uiEsc(person.name)} (${bad.length})</summary><p class="small muted">These match your pantry but hit a hard exclusion (allergen or a rule marked hard). They are never suggested.</p>${bad.map(m => pantryHitHTML(m, person)).join('')}</details>` : ''}`;
}

function pantryBindResults(root, person, plan) {
  root.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => weekRecipeModal(b.dataset.open, person, plan)));
  recipesBindTaste(root, person);
  root.querySelectorAll('[data-missing]').forEach(b => b.addEventListener('click', () => {
    const row = pantryResults && pantryResults.rows.find(m => m.recipe.id === b.dataset.missing);
    if (!row) return;
    const r = row.recipe;
    let n = 0;
    for (const ing of r.ingredients || []) {
      const food = uiState.foodsById.get(ing.food);
      const label = ing.display || (food ? food.short || food.name : ing.food);
      if (!row.missing.includes(label) || !food) continue;
      groceryAddExtra(person, { food: ing.food, grams: Number(ing.grams) || 0, quantity: ing.display || `${Math.round(Number(ing.grams) || 0)} g`, note: 'From pantry search', use: r.name });
      n++;
    }
    uiToast(n ? `Added ${n} item${n === 1 ? '' : 's'} to the grocery list.` : 'Nothing to add: the missing items are not in the food database.');
  }));
}
