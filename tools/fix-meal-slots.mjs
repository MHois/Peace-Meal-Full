// Re-tags meal slots in the recipe data files already on disk, using tools/lib/meal-components.mjs:
//   - sauces, dressings, stocks, doughs, spice mixes, and dips become meal: ["component"] (kept in the library, never scheduled)
//   - hummus-and-veg plates, snack mixes, ice cream become ["snack"]
//   - desserts and party food filed under breakfast by a source lose the breakfast tag
// Idempotent. Preserves each file's line format. Usage: node tools/fix-meal-slots.mjs [--dry]
import fs from 'node:fs';
import { fixMeal } from './lib/meal-components.mjs';

const DRY = process.argv.includes('--dry');
const FILES = [
  { path: new URL('../data/recipes.json', import.meta.url), pretty: true },
  { path: new URL('../data/recipes-open.json', import.meta.url), pretty: false },
  { path: new URL('../data/recipes-usda.json', import.meta.url), pretty: false }
];

let total = 0;
for (const f of FILES) {
  const list = JSON.parse(fs.readFileSync(f.path, 'utf8'));
  const changes = [];
  for (const r of list) {
    const next = fixMeal(r);
    if (next === r.meal) continue;
    changes.push(`${r.name}: ${(r.meal || []).join('/') || '(none)'} -> ${next.join('/')}`);
    r.meal = next;
  }
  total += changes.length;
  console.log(`${f.path.pathname.split('/').pop()}: ${changes.length} change${changes.length === 1 ? '' : 's'}`);
  for (const c of changes) console.log('  ' + c);
  if (!DRY && changes.length) {
    const text = f.pretty ? JSON.stringify(list, null, 2) + '\n' : '[\n' + list.map(r => JSON.stringify(r)).join(',\n') + '\n]\n';
    fs.writeFileSync(f.path, text);
  }
}
console.log(`${DRY ? 'Would change' : 'Changed'} ${total} recipe${total === 1 ? '' : 's'}.`);
