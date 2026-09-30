// Smoke test for data/dictionaries.json.
// Implements a minimal matcher inline (word boundary, case-insensitive, simple plural s/es/ies,
// 'except' phrases, and the unknown-risk flag) so it runs standalone with `node --test test/`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dict = JSON.parse(readFileSync(join(here, "..", "data", "dictionaries.json"), "utf8"));

const norm = s => s.toLowerCase().replace(/['’]/g, "").replace(/[-\/]/g, " ").replace(/\s+/g, " ").trim();
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const B0 = "(?<![a-z0-9])", B1 = "(?![a-z0-9])";

function termRegex(term, match) {
  const t = norm(term);
  if (match === "substring") return new RegExp(esc(t), "g");
  if (match === "phrase") return new RegExp(B0 + esc(t) + B1, "g");
  // word: allow simple plural on the last word (s, es, y -> ies)
  const words = t.split(" ");
  const last = words.pop();
  const lastRe = last.endsWith("y") ? `(?:${esc(last)}|${esc(last.slice(0, -1))}ies)` : `${esc(last)}(?:s|es)?`;
  return new RegExp(B0 + [...words.map(esc), lastRe].join(" ") + B1, "g");
}

const compiled = dict.entries.map(en => ({
  en,
  re: termRegex(en.term, en.match),
  exc: (en.except || []).map(x => termRegex(x, "word")) // except phrases follow the same word rules (plural allowed)
}));

function spans(re, text) {
  const out = []; re.lastIndex = 0; let m;
  while ((m = re.exec(text)) !== null) { out.push([m.index, m.index + m[0].length]); if (m[0].length === 0) re.lastIndex++; }
  return out;
}

// Returns { tags:Set, unknownRisk:string[], mayContain:Set, hits:[{term, tags}] }
export function check(ingredientString) {
  const result = { tags: new Set(), unknownRisk: [], mayContain: new Set(), hits: [] };
  const parts = ingredientString.replace(/[()]/g, ",").split(/[,;]/).map(norm).filter(Boolean);
  for (const part of parts) {
    for (const { en, re, exc } of compiled) {
      const ms = spans(re, part);
      if (!ms.length) continue;
      const excSpans = exc.flatMap(x => spans(x, part));
      const live = ms.filter(([a, b]) => !excSpans.some(([c, d]) => a >= c && b <= d));
      if (!live.length) continue;
      result.hits.push({ term: en.term, tags: en.tags });
      for (const t of en.tags) result.tags.add(t);
      for (const t of en.may_contain || []) result.mayContain.add(t);
      if (en.tags.length === 0) result.unknownRisk.push(en.term); // contract: tags [] means unknown-risk (mirrors src/engine/dictionary.js)
    }
  }
  return result;
}

const has = (r, ...tags) => { for (const t of tags) assert.ok(r.tags.has(t), `expected tag ${t}; got ${[...r.tags].sort().join(", ")}`); };
const hasNot = (r, ...tags) => { for (const t of tags) assert.ok(!r.tags.has(t), `did not expect tag ${t}; hits: ${r.hits.map(h => h.term).join(", ")}`); };

test("file integrity: tags declared, sources present, no duplicate terms", () => {
  const tagIds = new Set(Object.keys(dict.tags));
  for (const [id, t] of Object.entries(dict.tags)) {
    assert.ok(t.label && t.family && t.description, `tag ${id} incomplete`);
    assert.ok(t.sources.length > 0, `tag ${id} has no sources`);
    for (const s of t.sources) assert.ok(dict.sources[s], `tag ${id} cites unknown source ${s}`);
  }
  const seen = new Set();
  for (const en of dict.entries) {
    const k = norm(en.term);
    assert.ok(!seen.has(k), `duplicate term ${en.term}`); seen.add(k);
    assert.ok(["word", "phrase", "substring"].includes(en.match), `bad match on ${en.term}`);
    for (const t of en.tags) assert.ok(tagIds.has(t), `${en.term} references undeclared tag ${t}`);
    for (const t of en.may_contain || []) assert.ok(tagIds.has(t), `${en.term} may_contain undeclared tag ${t}`);
    for (const s of en.sources || []) assert.ok(dict.sources[s], `${en.term} cites unknown source ${s}`);
  }
  // contract: tags [] <=> risk unknown
  for (const en of dict.entries) {
    assert.equal(en.tags.length === 0, en.risk === "unknown", `${en.term}: tags [] must pair with risk: unknown`);
  }
  // all nine FDA allergens declared and hard
  for (const a of ["milk", "egg", "fish", "crustacean", "tree-nut", "peanut", "wheat", "soy", "sesame"]) {
    assert.equal(dict.tags["allergen-" + a].hard, true, `allergen-${a} must be hard`);
  }
});

test("packaged label: enriched wheat flour, sugar, soybean oil, whey, soy lecithin, natural flavors", () => {
  const r = check("Enriched wheat flour, sugar, soybean oil, whey, soy lecithin, natural flavors");
  has(r, "allergen-wheat", "gluten", "added-sugar", "soy-refined-oil", "allergen-milk", "lactose-high", "soy-lecithin");
  hasNot(r, "allergen-soy"); // refined oil and lecithin do not assert the hard allergen by default
  assert.ok(r.unknownRisk.includes("natural flavors"), `expected unknown-risk flag for natural flavors; got ${r.unknownRisk}`);
});

test("recipe: salmon, olive oil, garlic, lemon", () => {
  const r = check("salmon, olive oil, garlic, lemon");
  has(r, "fish", "allergen-fish", "mercury-low-fish", "olive-oil", "fodmap-fructan", "histamine-high");
  hasNot(r, "allergen-milk", "allergen-wheat", "mercury-high");
  assert.equal(r.unknownRisk.length, 0);
});

test("peanut butter is peanut, not milk", () => {
  const r = check("peanut butter");
  has(r, "allergen-peanut");
  hasNot(r, "allergen-milk", "allergen-tree-nut");
});

test("plural and boundary handling", () => {
  has(check("chopped almonds"), "allergen-tree-nut", "nut");
  has(check("kidney beans"), "legume", "fodmap-gos");
  hasNot(check("kidney beans"), "purine-high");
  hasNot(check("eggplant"), "allergen-egg");
  has(check("eggplant"), "histamine-high", "vegetable");
  hasNot(check("buckwheat flour"), "allergen-wheat", "gluten");
  has(check("buckwheat flour"), "whole-grain");
  hasNot(check("coconut milk"), "allergen-milk");
  has(check("coconut milk"), "allergen-tree-nut");
  hasNot(check("baking soda"), "sugar-sweetened-beverage");
  hasNot(check("cream of tartar"), "allergen-milk");
  has(check("anchovies"), "allergen-fish", "purine-high", "histamine-high");
  has(check("cherries"), "fruit");
  hasNot(check("cherry tomatoes"), "fruit");
  has(check("cherry tomatoes"), "vegetable", "histamine-high");
  hasNot(check("shellfish"), "allergen-fish");
  has(check("shellfish"), "allergen-crustacean");
  hasNot(check("cocoa butter"), "oxalate-high", "allergen-milk");
  has(check("sodium caseinate"), "allergen-milk");
  has(check("dicalcium phosphate"), "phosphate-additive");
  has(check("potassium chloride"), "potassium-additive");
  has(check("high-fructose corn syrup"), "added-sugar", "fodmap-fructose", "ultra-processed");
  has(check("HIGH FRUCTOSE CORN SYRUP"), "added-sugar");
  has(check("soy sauce"), "allergen-soy", "allergen-wheat", "gluten", "gluten-hidden");
  has(check("certified gluten-free oats"), "oats-certified-gf");
  hasNot(check("certified gluten-free oats"), "oats-regular", "gluten");
  has(check("rolled oats"), "oats-regular");
  has(check("brie"), "unpasteurized", "allergen-milk");
  has(check("swordfish"), "mercury-high");
  hasNot(check("wheat grass"), "allergen-wheat");
  has(check("brussels sprouts"), "vegetable");
  hasNot(check("brussels sprouts"), "raw-sprouts");
  has(check("alfalfa sprouts"), "raw-sprouts");
  hasNot(check("sugar snap peas"), "added-sugar");
  has(check("xylitol"), "non-nutritive-sweetener");
  hasNot(check("erythritol"), "fodmap-sorbitol", "fodmap-mannitol");
  has(check("sorbitol"), "fodmap-sorbitol");
});

test("unknown-risk terms are flagged, not passed", () => {
  const r = check("spices, hydrolyzed vegetable protein, oyster sauce");
  for (const t of ["spices", "hydrolyzed vegetable protein", "oyster sauce"]) assert.ok(r.unknownRisk.includes(t), `expected unknown-risk flag for ${t}`);
  assert.equal(r.tags.size, 0, "unknown-risk label terms assert no tags of their own here");
});

test("unmatched ingredient produces no tags (engine must report it as not recognized, never as safe)", () => {
  const r = check("xyzzyfoo");
  assert.equal(r.hits.length, 0);
});
