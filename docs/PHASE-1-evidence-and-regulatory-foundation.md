# Phase 1: Evidence and Regulatory Foundation
Evidence-Based Specialty Nutrition App
Prepared September 4, 2026

How to read this document: each condition gets the governing sources, the core food rules the app would encode, an evidence-strength rating, and anything contested. Ratings use four levels. Strong = multiple RCTs or a major society guideline with Class 1 / Level A backing. Moderate = consistent trials or guideline recommendations with conditional strength. Limited = small trials, observational data, or expert consensus with little trial support. Insufficient = no condition-specific dietary evidence; only general healthy-eating patterns apply.

Anything marked VERIFY is something I could not confirm against a primary source during this pass and should be checked before it goes into the app's content database.

A standing note on federal guidance: the 2025-2030 Dietary Guidelines for Americans (released January 2026) are contested by the mainstream nutrition science community for internal contradictions on saturated fat, red meat, butter, and full-fat dairy, and for departing from the independent Advisory Committee's recommendations. The app should anchor to professional society guidelines (ADA, AHA/ACC, ACG, AGA, Academy of Nutrition and Dietetics) and to the 2025 Dietary Guidelines Advisory Committee scientific report where they conflict with the final DGA. Where the DGA agrees with the societies (saturated fat under 10 percent of calories, sodium limits, added sugar limits, more whole foods), it can be cited.

---

## PART A: MEDICAL CONDITIONS

### 1. Type 2 diabetes and prediabetes
Rating: STRONG

Governing sources
- American Diabetes Association, Standards of Care in Diabetes 2026 (Diabetes Care, vol 49, Supplement 1). Section 5 covers medical nutrition therapy.
- ADA Nutrition Therapy Consensus Report (Evert et al., Diabetes Care 2019). A new nutrition consensus report is reportedly expected in 2026 (VERIFY, seen in secondary commentary only). Checked September 30, 2026: none published yet, and the 2026 Standards still point to the 2019 report (VERIFY-log item 1, still open).
- Diabetes Prevention Program (NEJM 2002) and its 10 and 15 year follow-ups for prediabetes.
- Academy of Nutrition and Dietetics Evidence-Based Nutrition Practice Guideline for Type 1 and Type 2 Diabetes.

Core food rules
- No single ideal macronutrient split. The ADA endorses several eating patterns with evidence: Mediterranean-style, low-carbohydrate, plant-based, and DASH. The 2026 Standards expanded this with patient-facing resources for Mediterranean-style and low-carb patterns, especially for prevention.
- Emphasize non-starchy vegetables, minimize added sugars and refined grains, prefer whole foods over highly processed ones.
- Carbohydrate quality and quantity both matter. Monitoring carbohydrate intake is the primary strategy for glycemic control. The Diabetes Plate method is unchanged and remains the ADA's default teaching tool.
- Weight: 5 to 7 percent loss improves glycemia and cardiometabolic risk when the person has overweight or obesity. Over 10 percent can produce remission. Calorie restriction is appropriate here, but the ADA frames it as individualized, not universal.
- Sugar-sweetened beverages: avoid. Non-nutritive sweeteners: acceptable short-term replacement, with the goal of reducing overall sweet intake.
- Sodium under 2,300 mg/day, same as the general population.
- Alcohol: moderate at most, with hypoglycemia risk awareness for people on insulin or sulfonylureas.
- Fiber: at least the general population target (14 g per 1,000 kcal), and higher intake from whole grains, legumes, and vegetables improves glycemia.

Contested or nuanced
- Very low carbohydrate diets have good short-term glycemic data but weaker long-term adherence data. The app should present low-carb as one valid option, not the answer.
- Meal timing and intermittent fasting: emerging, not guideline-level. Present as "some evidence, individual decision with clinician input."
- Calorie counting: the evidence supports weight loss as a goal for many but not all people with T2D. This is the clearest case where the app should let user priority goals drive whether calories are foregrounded.

Interaction flags
- Strong interaction with the lipid and hypertension rules (DASH and Mediterranean already satisfy both).
- People on insulin or GLP-1 medications need a clinician-set plan; the app supports, it does not set targets.

---

### 2. Hypertension
Rating: STRONG

Governing sources
- 2025 AHA/ACC Multisociety Guideline for the Prevention, Detection, Evaluation, and Management of High Blood Pressure in Adults (JACC / Hypertension, August 2025). Replaces the 2017 guideline.
- DASH trial (NEJM 1997) and DASH-Sodium (NEJM 2001), the foundational RCTs.
- Salt Substitute and Stroke Study (SSaSS, NEJM 2021) for potassium-enriched salt.

Core food rules
- DASH eating pattern: Class 1, Level A recommendation. Vegetables, fruits, whole grains, low-fat dairy, poultry, fish, legumes, nuts; limited saturated fat, red meat, sweets, and sugar-sweetened beverages.
- Sodium under 2,300 mg/day, moving toward an ideal under 1,500 mg/day. Class 1, Level A. Contraindicated in severe symptomatic orthostatic hypotension (relevant to the POTS interaction below).
- Potassium: 3,500 to 5,000 mg/day, preferably from food. Class 1, Level A. Exception: chronic kidney disease or drugs that reduce potassium excretion (ACE inhibitors, ARBs, spironolactone, potassium-sparing diuretics), where serum potassium must be monitored.
- Potassium-based salt substitutes can be useful, same exceptions.
- Alcohol: reduce or eliminate.
- Weight: at least 5 percent loss if overweight.

Contested or nuanced
- Population-level sodium targets are debated in the academic literature (some cohort data suggest a J-shaped curve with optimal intake around 3 to 5 g/day). For people who already have hypertension, the guideline position is clear and the app should follow it. The debate belongs in the education section, not the rules engine.

Interaction flags
- HARD CONFLICT with POTS (high sodium) and with CKD (potassium). Both must be handled in the conflict-resolution logic, and the app must not silently pick one. Rule: when a user selects both hypertension and POTS, the app displays the conflict, refuses to generate a sodium target, and directs the user to their clinician for a personalized number. The meal plan can still be generated using the shared, non-conflicting rules.

---

### 3. High cholesterol / hyperlipidemia
Rating: STRONG

Governing sources
- 2018 AHA/ACC Multisociety Guideline on the Management of Blood Cholesterol.
- AHA 2021 Dietary Guidance to Improve Cardiovascular Health (Lichtenstein et al., Circulation 2021).
- AHA Science Advisory on Dietary Cholesterol (Carson et al., Circulation 2019).
- Cochrane review on reduced saturated fat for cardiovascular disease (Hooper et al., 2020).
- PREDIMED (NEJM 2018 re-analysis) for Mediterranean pattern and cardiovascular events.

Core food rules
- Replace saturated fat with unsaturated fat (polyunsaturated and monounsaturated). This is the single highest-evidence lever for LDL. Saturated fat under 10 percent of calories for the general population; under 6 percent is the AHA target for people needing to lower LDL.
- Eliminate industrial trans fat.
- Dietary cholesterol: no longer a specific numeric limit in US guidance, but the AHA advisory still recommends a pattern low in cholesterol-rich foods because they travel with saturated fat. Eggs in moderation are acceptable for most people.
- Soluble fiber (oats, barley, legumes, psyllium): 5 to 10 g/day lowers LDL modestly.
- Plant sterols/stanols, 2 g/day: lowers LDL about 8 to 10 percent. Legitimate, but food-based sources are limited; this borders on supplement territory, so present it as an option with the evidence, not a push.
- Mediterranean or DASH pattern overall.
- Limit added sugar and refined carbohydrate for triglycerides.
- Alcohol: limit, especially for high triglycerides.

Contested or nuanced
- The saturated fat debate is loud online and in the 2025-2030 DGA graphics. The clinical guideline position has not changed: saturated fat raises LDL, LDL causes atherosclerosis. The app follows the guideline. Coconut oil is not heart-healthy despite marketing.
- "Low cholesterol diet" as a term is outdated; the app should call it "heart-healthy" or "LDL-lowering" and explain the shift in the education section.

Interaction flags
- Fully compatible with diabetes and hypertension rules. The Mediterranean pattern satisfies all three.

---

### 4. Celiac disease
Rating: STRONG (for the diet as treatment; it is the only treatment)

Governing sources
- ACG Clinical Guideline: Diagnosis and Management of Celiac Disease (Rubio-Tapia et al., Am J Gastroenterol 2023).
- Academy of Nutrition and Dietetics Celiac Disease Evidence-Based Nutrition Practice Guideline.
- FDA gluten-free labeling rule (21 CFR 101.91): under 20 ppm gluten.
- Celiac Disease Foundation and Beyond Celiac patient materials for practical lists.

Core food rules
- Strict, lifelong avoidance of wheat, barley, rye, and their derivatives (spelt, kamut, farro, durum, semolina, triticale, malt, brewer's yeast from beer).
- Oats: the 2023 ACG guideline says gluten-free labeled oats are safe for most people with celiac disease; a small subset react to oat avenin. The app should default to allowing certified gluten-free oats with a user toggle to exclude them, and flag that regular oats are cross-contaminated.
- Cross-contact matters: shared fryers, toasters, cutting boards, bulk bins. The app's recipe and restaurant guidance must address this, not just ingredients.
- Hidden gluten: soy sauce, malt vinegar, seasoning blends, processed meats, some medications and supplements, communion wafers, play-dough. The ingredient parser needs a maintained hidden-gluten dictionary.
- Nutrient adequacy: newly diagnosed people are often low in iron, folate, B12, vitamin D, calcium, zinc. Gluten-free processed foods are often low in fiber and fortification. The app should steer toward naturally gluten-free whole foods (rice, quinoa, buckwheat, legumes, potatoes, corn) over packaged substitutes.
- The ACG guideline recommends follow-up with a dietitian experienced in celiac disease. The app should say this plainly.

Contested or nuanced
- Whether people with celiac disease need to avoid gluten in cosmetics: no, unless ingested. Lip products are the only practical concern.
- "Gluten-free" restaurant menus without cross-contact protocols are not safe for celiac disease. The app should distinguish "celiac-safe" from "gluten-free ingredients."

---

### 5. Lactose intolerance
Rating: STRONG (mechanism and management are well established)

Governing sources
- NIH Consensus Development Conference Statement on Lactose Intolerance and Health (2010).
- NIDDK patient materials on lactose intolerance.
- Academy of Nutrition and Dietetics practice materials.

Core food rules
- This is a dose-dependent intolerance, not an allergy. Most people with lactose malabsorption tolerate about 12 g of lactose (one cup of milk) in a single dose, especially with a meal, and more spread across the day. The app should not default to total dairy elimination.
- Better tolerated: hard aged cheeses (near zero lactose), yogurt with live cultures, butter, lactose-free milk, lactase enzyme tablets.
- Higher lactose: milk, ice cream, soft cheeses, cream, milk-based sauces, whey-based products, some protein powders.
- Hidden lactose: bread, processed meats, salad dressings, instant potatoes, some medications (as filler).
- Calcium and vitamin D adequacy must be maintained. The app should count fortified alternatives and non-dairy calcium sources.

Contested or nuanced
- Self-diagnosed lactose intolerance is often actually IBS or another issue. The app should note that a hydrogen breath test confirms it.
- Total dairy avoidance is a preference choice, not a medical necessity for most people with lactose intolerance. This is a good example of where "medical avoidance" and "preference avoidance" must be kept separate in the settings.

Interaction flags
- Overlaps with low FODMAP (lactose is the D in FODMAP). If a user has both, the FODMAP rules cover lactose.
- Distinct from cow's milk protein allergy, which is a hard exclusion of all dairy.

---

### 6. IBS (low FODMAP protocol)
Rating: MODERATE to STRONG for short-term symptom relief; MODERATE for the full three-phase protocol

Governing sources
- ACG Clinical Guideline: Management of Irritable Bowel Syndrome (Lacy et al., Am J Gastroenterol 2021). Conditional recommendation for a limited trial of a low FODMAP diet.
- Monash University FODMAP program and app (the primary food-composition database; Monash has tested foods in a lab and licenses the data).
- British Dietetic Association IBS guideline (McKenzie et al., 2016).
- AGA Clinical Practice Update on the Role of Diet in IBS (Chey et al., Gastroenterology 2022).
- Halmos et al., Gastroenterology 2014 (the key RCT).

Core food rules
- Three phases, and the app must enforce all three:
  1. Elimination, 2 to 6 weeks. Restrict high-FODMAP foods (oligosaccharides: wheat, rye, onion, garlic, legumes; disaccharides: lactose; monosaccharides: excess fructose in honey, apples, mango, high-fructose corn syrup; polyols: sorbitol, mannitol, stone fruits, sugar-free gum).
  2. Reintroduction, 6 to 8 weeks. Systematically test each FODMAP subgroup to identify personal triggers.
  3. Personalization. Long-term diet includes everything tolerated.
- Portion size determines FODMAP load. Many foods are low FODMAP at small portions and high at large portions. The app's food database must carry serving-size thresholds, not binary allowed/avoid.
- The AGA update and ACG guideline both say the diet should be delivered with dietitian support. Long-term elimination without reintroduction harms the microbiome and nutrition.

Contested or nuanced
- Efficacy: about 50 to 75 percent of people with IBS get meaningful relief. Not everyone.
- Evidence for the reintroduction and personalization phases is thinner than for elimination.
- Monash's food data is proprietary. The app cannot copy it. Options: license it, build from published studies plus USDA where possible, or link out. This is a Phase 3 decision with cost implications.
- First-line IBS advice (regular meals, limit alcohol, caffeine, fat, and gas-producing foods; soluble fiber; peppermint oil) has a lower evidence bar than low FODMAP but is simpler. Some guidelines recommend it before low FODMAP.

Interaction flags
- Conflicts with gut-health fiber and fermented-food advice during elimination (many prebiotic foods are high FODMAP). The app must state this and time-limit the elimination phase.
- Overlaps with lactose intolerance and with gluten-free (wheat is restricted for fructans, not gluten).

---

### 7. MCAS / mast cell disease
Rating: LIMITED (expert consensus and a 2025 AGA practice update; little controlled trial evidence)

Governing sources
- AGA Clinical Practice Update on GI Manifestations and Autonomic or Immune Dysfunction in Hypermobile Ehlers-Danlos Syndrome: Expert Review (Aziz et al., Clin Gastroenterol Hepatol, July 2025). Covers MCAS and POTS in that context. Best Practice Advice statements, not graded recommendations.
- Comas-Basté et al., Biomolecules 2020, and the 2025 review "Evidence for Dietary Management of Histamine Intolerance" for the histamine intolerance literature.
- Swiss Interest Group Histamine Intolerance (SIGHI) food compatibility list, the most widely used practical list. Not peer-reviewed; based on clinical experience and food-chemistry data.
- Consensus criteria for MCAS diagnosis (Valent et al., 2019 and 2020 variants; note that two competing sets of criteria exist).
- Reese et al., Allergo Journal International 2017 (German guideline on histamine intolerance).

What the evidence actually shows
- The 2025 AGA update says low-histamine, low-FODMAP, gluten-free, and dairy-free elimination diets "can be considered" for GI symptoms when MCAS is suspected, delivered with nutrition counseling to avoid the harms of restrictive eating. That is the strongest professional-society language available, and it is permissive, not a recommendation.
- Histamine intolerance (a DAO enzyme problem) and MCAS (abnormal mast cell mediator release) are different conditions that get conflated. Someone with MCAS may not react to dietary histamine at all, because their symptoms are driven by other mediators (tryptase, prostaglandins, leukotrienes). The app must explain this.
- Only one systematic review has examined restrictive low-histamine diets in mastocytosis and found no clinical trial evidence of a histamine-release mechanism in foods; the support is in vitro and animal data.
- Food histamine content varies enormously by freshness, storage, fermentation, and cooking method. Published food lists disagree with each other.
- Triggers commonly reported by patients: alcohol, aged and fermented foods, cured meats, shellfish, tomatoes, spinach, citrus, chocolate, nuts, spicy foods, food additives. These are patient-reported and clinician-observed patterns, not RCT-confirmed.

How the app should handle it
- Frame the low-histamine diet as a time-limited diagnostic trial (4 to 6 weeks), not a permanent diet, followed by reintroduction. Same architecture as low FODMAP.
- Show the evidence rating prominently. Language: "Doctors who treat MCAS often suggest trying a low-histamine diet for a few weeks to see if it helps. There are no large clinical trials proving it works, and food lists vary. The goal is to find your personal triggers, not to stay restricted forever."
- Emphasize freshness and cooking method (fresh over leftovers, frozen fish over aged, boiling and steaming over long braising and fermenting) since these are the parts with the clearest food-chemistry basis.
- Symptom tracking tied to meals is the highest-value feature for this population.
- Do not include DAO supplement recommendations or "mast cell stabilizing foods" claims (quercetin, luteolin, vitamin C megadoses). The evidence is preclinical and this crosses into supplement marketing.

Interaction flags
- Strong overlap with POTS and hEDS (the AGA update addresses them together). The app should treat this as a cluster.
- Many low-histamine "avoid" foods are healthy, high-nutrient foods (spinach, tomatoes, fermented foods, citrus). Long-term restriction conflicts with heart-health, gut-health, and diabetes patterns. The time limit is the safeguard.

---

### 8. POTS
Rating: LIMITED to MODERATE (consensus statements plus one small crossover RCT)

Governing sources
- 2015 Heart Rhythm Society Expert Consensus Statement on POTS (Sheldon et al., Heart Rhythm 2015).
- 2020 Canadian Cardiovascular Society Position Statement on POTS (Raj et al., Can J Cardiol 2020).
- Vernino et al., 2021 POTS Expert Consensus Review (Auton Neurosci 2021).
- Garland et al., JACC 2021: randomized crossover study in 14 women with POTS showing 6 days of high sodium (300 mmol/day) increased plasma volume and reduced orthostatic heart rate by a median of 14 bpm versus low sodium.
- The 2025 AGA update above for the GI side.
- PEN (Practice-based Evidence in Nutrition) 2023 knowledge pathway on POTS diet, which grades the sodium recommendation as "fair evidence" and everything else as "limited."

Core food rules (as tolerated and with clinician sign-off)
- Sodium: the consensus range is 3 to 10 g of sodium per day (Vernino 2021) or 10 to 12 g of salt (Heart Rhythm Society 2015). Spread through the day. From food, added table salt, salt tablets, or electrolyte drinks.
- Fluid: 2 to 3 liters per day. Some patients benefit from drinking 16 oz before getting out of bed.
- Small, frequent meals; large meals worsen symptoms by diverting blood to the gut.
- Lower glycemic-load carbohydrates may reduce postprandial symptoms (limited evidence).
- Avoid alcohol. Caffeine is individual (helps some, worsens others).
- For coexisting gastroparesis: smaller, lower-fat, lower-fiber meals (not formally studied).

Contested or nuanced
- Only one short trial supports the sodium recommendation; whether the blood-volume effect persists past a week is an open question (an ongoing Calgary trial, NCT05924646, is testing this).
- Sodium recommendations for POTS are the direct opposite of hypertension guidance. High sodium also raises long-term cardiovascular and renal questions that have not been studied in POTS.
- The app must never set a sodium target for POTS on its own. It should present the consensus range, require the user to enter the number their clinician gave them, and build the plan around that.

Interaction flags
- HARD CONFLICT with hypertension and CKD. See hypertension section.
- Cluster with MCAS and hEDS.

---

### 9. CRPS
Rating: INSUFFICIENT for any CRPS-specific diet

Governing sources
- Systematic reviews of CRPS treatment (2025 review of RCTs 2003 to 2025; Zhu et al., Pharmaceuticals 2024 meta-analysis of pharmacological RCTs). Neither identifies a dietary intervention with RCT support for treating established CRPS.
- Vitamin C for prevention: meta-analyses (including 2021, Journal of Hand Surgery) show perioperative vitamin C (typically 500 mg/day for about 50 days after wrist, foot, or ankle fracture or surgery) is associated with lower incidence of CRPS type 1. This is prevention after injury, not treatment, and the effect is debated. It is a supplement, not a food rule.
- RSDSA and Budapest criteria materials for background.

What the evidence actually shows
- There is no CRPS diet. Nothing in the peer-reviewed literature supports a specific eating pattern for treating CRPS. Claims online about "anti-inflammatory diets curing CRPS" are not supported.
- The reasonable position: CRPS is a chronic pain condition, and general healthy eating (Mediterranean-style pattern, adequate protein, weight management if relevant, limiting alcohol) supports overall health, sleep, and mood, which affect pain experience. That is an indirect, general-population argument.
- Some chronic pain literature suggests Mediterranean and plant-forward patterns modestly reduce pain and inflammatory markers in mixed chronic pain populations (small trials, not CRPS-specific). Present as limited.

How the app should handle it
- Offer CRPS as a selectable condition so the user feels seen, but the app's language must be honest: "There is no diet proven to treat CRPS. Eating in a heart-healthy, anti-inflammatory pattern supports your overall health while you work with your pain team on treatments that do have evidence (physical therapy, mirror therapy, certain medications)." Then apply the anti-inflammatory pattern rules.
- Do not recommend supplements. If the user asks about vitamin C, the education section can explain the prevention evidence and say it is a conversation for their surgeon or physician.

---

## PART B: DIET PATTERNS AND RESTRICTIONS

### 10. Anti-inflammatory (Mediterranean-style)
Rating: STRONG for cardiovascular outcomes and metabolic markers; MODERATE for inflammatory biomarkers; LIMITED for specific inflammatory diseases

Governing sources
- PREDIMED (Estruch et al., NEJM 2018 corrected re-analysis): Mediterranean diet with olive oil or nuts reduced major cardiovascular events about 30 percent.
- AHA 2021 Dietary Guidance (Lichtenstein et al.).
- Dietary Inflammatory Index literature (Shivappa et al.) for the concept; observational.
- Cochrane review, Mediterranean-style diet for primary and secondary prevention of cardiovascular disease (Rees et al., 2019).

Core food rules
- The evidence-based version of "anti-inflammatory" is the Mediterranean pattern: extra virgin olive oil as the main fat; daily vegetables, fruits, whole grains, legumes, nuts; fish and seafood at least twice a week; moderate poultry, eggs, dairy; limited red and processed meat, sweets, and refined grains; minimal ultra-processed food.
- Omega-3 from fish (EPA/DHA) has the best data. Fish oil supplements for the general population: mixed, do not recommend.
- Spices like turmeric and ginger: mechanistic and small-trial data, not outcome data. Fine to include as foods, do not make health claims.

Contested or nuanced
- "Anti-inflammatory diet" as marketed online (nightshade avoidance, lectin avoidance, dairy elimination, "alkaline" foods) is not evidence-based. The app should explicitly not encode those.
- Whether the diet lowers CRP and IL-6 meaningfully in healthy people is modest and inconsistent. The cardiovascular outcome data is what justifies the pattern.

### 11. Low sugar / low added sugar
Rating: STRONG

Governing sources
- AHA Scientific Statement on added sugars (Johnson et al., Circulation 2009; children 2016): women under 25 g/day (6 tsp), men under 36 g/day (9 tsp).
- WHO guideline on sugars intake (2015): under 10 percent of calories, ideally under 5 percent.
- 2025-2030 DGA retains under 10 percent of calories (this is one of the non-contested parts).
- FDA Nutrition Facts label "Added Sugars" line (2016 rule) for label reading.

Core food rules
- Target added sugar, not total sugar. Fruit and plain dairy sugars are not the concern.
- Sugar-sweetened beverages are the largest source and the first thing to cut.
- Read the "Added Sugars" line on labels; the app's label scanner should key on this.
- Sugar has 60-plus label names (dextrose, maltose, cane juice, agave, rice syrup, fruit juice concentrate). The ingredient parser needs this dictionary.
- Non-nutritive sweeteners: WHO 2023 guideline advises against using them for weight control, based on long-term observational data; short-term use as a bridge is acceptable. Present both.

### 12. Gluten-free (non-celiac)
Rating: LIMITED for non-celiac gluten sensitivity; NOT SUPPORTED as a general health choice

Governing sources
- Skodje et al., Gastroenterology 2018 (double-blind trial: fructans, not gluten, provoked symptoms in self-reported gluten-sensitive people).
- Biesiekierski et al., Gastroenterology 2013 (no specific gluten effect after FODMAP control).
- Catassi et al., Nutrients 2017 (Salerno experts' criteria for NCGS).
- Lebwohl et al., BMJ 2017 (long-term gluten avoidance without celiac disease associated with lower whole-grain intake and no cardiovascular benefit).

What the evidence shows
- Non-celiac gluten/wheat sensitivity exists as a clinical entity but lacks a biomarker, and blinded studies show many people attributed symptoms to gluten that were actually caused by fructans (a FODMAP) or nocebo.
- Going gluten-free without celiac disease has no demonstrated health benefit and can lower fiber and whole-grain intake.

How the app should handle it
- Offer gluten-free as a preference or a "trial" with honest framing. Suggest that if symptoms are the reason, a low FODMAP trial with dietitian support may be more diagnostic.
- Require the user to confirm celiac disease has been ruled out before going gluten-free, because gluten-free eating before testing makes celiac testing unreliable. This is a real patient-safety point.

### 13. Soy-free
Rating: STRONG for confirmed soy allergy (avoidance is the treatment); preference otherwise

Governing sources
- AAAAI and ACAAI practice parameters on food allergy (2014 update; 2023 anaphylaxis parameter).
- FDA FALCPA (soy is a major allergen; labeled "Contains: Soy"). Highly refined soybean oil is exempt from labeling and is tolerated by most people with soy allergy. Soy lecithin is usually tolerated.
- NIAID food allergy guidelines (2010).

Core food rules
- Hard exclusion for allergy: soybeans, edamame, tofu, tempeh, miso, natto, soy milk, soy protein isolate, textured vegetable protein, soy flour, most soy sauce (also contains wheat).
- Hidden soy: vegetable broth, baked goods, processed meats, protein bars, Asian sauces, vegetarian meat substitutes, some peanut butters, "natural flavors" in some products.
- Refined soybean oil and soy lecithin: allergist-dependent; app should default to excluding for allergy and let the user (with allergist input) relax it.
- Preference soy avoidance (hormone concerns, GMO concerns): the evidence does not support harm from soy foods in normal amounts; the app should file this under preference and can offer a neutral explainer.

### 14. Low cholesterol / heart-healthy
Covered under condition 3. Same rules, same rating. The app should merge these into one "heart-healthy" module with two entry points.

### 15. Low FODMAP
Covered under condition 6. Same three-phase structure. The app should not allow a user to select "low FODMAP" as a permanent lifestyle without going through reintroduction prompts.

### 16. Gut health support
Rating: MODERATE for fiber and dietary diversity; LIMITED for fermented foods and specific probiotic foods; INSUFFICIENT for most "gut health" product claims

Governing sources
- Reynolds et al., Lancet 2019 (systematic review and meta-analysis commissioned by WHO): 25 to 29 g/day of fiber associated with 15 to 30 percent lower all-cause and cardiovascular mortality, and lower incidence of T2D and colorectal cancer.
- Wastyk et al., Cell 2021 (Stanford): fermented food intake increased microbiome diversity and lowered inflammatory markers in a 10 week RCT, n=36. Small but well designed.
- McDonald et al., mSystems 2018 (American Gut Project): people eating 30-plus plant types per week had more diverse microbiomes. Observational.
- AGA Clinical Practice Guideline on probiotics (Su et al., Gastroenterology 2020): does not recommend probiotics for most GI conditions outside specific narrow uses.
- ISAPP consensus statements on prebiotics, probiotics, and fermented foods.

Core food rules
- Fiber 25 to 38 g/day depending on sex and age (Institute of Medicine), from a variety of whole plant foods. Increase gradually with fluid.
- Plant diversity: aim for a wide range of plant foods weekly (the "30 plants" idea is a reasonable heuristic from observational data, not a proven target).
- Fermented foods with live cultures (yogurt, kefir, sauerkraut, kimchi): small RCT support, generally recommended.
- Limit ultra-processed foods, added sugars, and excess alcohol.
- Probiotic supplements: not recommended by the AGA for general gut health. The app should not recommend them.

Contested or nuanced
- Microbiome testing kits and personalized microbiome diets: not clinically validated. The app should say so in the education section.
- Gut health prescriptions conflict with the elimination phases of low FODMAP and low histamine. The app's conflict logic must time-limit those phases and then restore fiber and fermented foods during reintroduction.

---

## PART C: USER-CONTROLLED RESTRICTIONS

Food allergies
- The nine FDA major allergens (milk, egg, fish, crustacean shellfish, tree nuts, peanuts, wheat, soybeans, sesame) plus custom entries. Hard exclusions with no override.
- The app must handle "may contain" and shared-facility labels as user-configurable (many people with allergies avoid these; the evidence on actual risk is mixed).
- The ingredient parser and recipe screener are safety-critical here. This is the component that must never rely on an LLM alone. A confirmed allergen slipping through is the single worst failure the app can have.

Medical avoidances
- Derived automatically from selected conditions. The user sees them and can annotate but not remove them without acknowledging the condition rule.

Preference avoidances
- Free-form, soft exclusions. The user can override at any time. Religious and ethical patterns (halal, kosher, vegetarian, vegan) belong here and should be pre-built options.

---

## PART D: CROSS-CONDITION CONFLICT MAP (for Phase 2 data model)

Conflicts the rules engine must handle explicitly:
1. Hypertension (sodium under 1,500 to 2,300 mg) vs POTS (sodium 3 to 10 g). Hard conflict. No auto-resolution.
2. Hypertension potassium target vs CKD or potassium-sparing medications. Hard conflict when CKD is added later; for v1, a medication question at onboarding.
3. Gut health (fiber, fermented foods, prebiotics) vs low FODMAP elimination vs low histamine elimination. Resolved by time-limiting elimination phases and restoring during reintroduction.
4. Heart-healthy (nuts, fish, tomatoes, citrus, olive oil, legumes) vs low histamine (excludes many of the same foods). Resolved by time limit plus explicit user acknowledgment.
5. Diabetes carbohydrate management vs POTS lower-glycemic carbohydrate advice: compatible.
6. Celiac vs low FODMAP: compatible; FODMAP wheat restriction is about fructans, celiac is about gluten. Certified gluten-free oats are low FODMAP in limited portions.
7. Lactose intolerance vs low FODMAP: FODMAP rules subsume lactose rules.
8. Soy allergy vs plant-based or vegan preferences: reduces protein options; the app should surface alternative proteins (legumes other than soy, seitan if no gluten issue, eggs and dairy if permitted, quinoa, hemp).

---

## PART E: REGULATORY OPTIONS

The three roles disagree here, and I will show where.

### Option A: General wellness and education tool, no medical claims

What it is
- The app positions itself as helping users "eat in a way that supports healthy blood pressure," "follow a gluten-free lifestyle," "plan meals around foods you prefer to avoid," and provides education. It does not claim to treat, mitigate, or manage any disease.

Regulatory basis
- FDA's General Wellness: Policy for Low Risk Devices guidance, revised and reissued January 6, 2026 (supersedes 2019). FDA exercises enforcement discretion over low-risk products intended only for general wellness. Encouraging healthy eating and healthy weight are explicitly listed as acceptable wellness claims. A claim to help treat a disease is not.
- Nutrition trackers that help users log meals and encourage balanced diets are widely understood to fall inside the wellness policy as long as they avoid disease claims.
- The 2026 guidance also emphasizes that products providing ongoing monitoring or treatment recommendations tied to medical management fall outside wellness.

What the app can say
- Educational content about conditions, with citations, is speech, not a device function. "Here is what the American Heart Association recommends for people with high blood pressure" is fine.
- General meal plans and food lists framed as lifestyle support.

What the app cannot say
- "This plan will lower your blood pressure." "Manage your diabetes with this app." "Treat your MCAS." Any language that makes the software's intended use the treatment or mitigation of a disease.
- Individualized sodium targets for POTS, insulin-related carbohydrate targets, or anything that looks like a therapeutic prescription.

The honest tension
- The product lead says: this is where every nutrition app lives, it is the fastest and cheapest path, and the January 2026 guidance widened the lane.
- The dietitian says: the whole point of the app is condition-specific guidance. The moment the app takes "I have hypertension and POTS" as input and outputs a personalized plan, the wellness framing gets thin. Intended use is judged by how the product actually functions and how it is marketed, including app store descriptions and website copy, not by the disclaimer.
- The architect says: you can build the engine to be condition-aware while keeping the user-facing claims in wellness territory, but it takes discipline in every string of UI copy, and one marketing page can undo it.

Exposure
- FDA: low, if claims are disciplined. FDA's WHOOP warning letter (July 2025) shows the agency will act when a wellness product's function or marketing drifts into medical territory, even after the guidance loosened.
- FTC: truth-in-advertising and substantiation apply regardless. Every health-related claim in marketing needs competent and reliable scientific evidence behind it. The citation architecture you already want is the substantiation file.
- State law: see licensure below.
- Civil liability: negligence and product liability if someone is harmed. Disclaimers reduce but do not eliminate this. An allergen error is the scenario to insure against.

Cost and timeline
- No regulatory submission. Legal review of claims and terms: modest (a health-tech regulatory attorney, likely a few thousand dollars for a claims review and terms of service). Product liability insurance for a health app: obtainable.

### Option B: Built for RD or clinician oversight or review

What it is
- Same engine, but the app is positioned as a tool used with or under the guidance of a registered dietitian or physician. Two sub-models: (B1) consumer app that requires or strongly steers users to link a clinician who sets targets; (B2) a practitioner-facing tool that RDs use with their patients, with a patient companion app.

Regulatory basis
- FDA's Clinical Decision Support Software guidance, also revised January 6, 2026, excludes certain software from the device definition when it supports a health care professional's decision-making, the HCP can independently review the basis for the recommendation, and the software is not intended to replace the HCP's judgment. FDA now expects clear documentation for HCPs about how the software works; the more of a black box it is, the more likely FDA treats it as a device. Your citation-on-every-recommendation design is exactly what this requires.
- For the consumer side, the wellness policy still governs the patient app.

What the app can say
- To clinicians: "Supports medical nutrition therapy for [conditions] with cited, guideline-aligned food rules and meal planning." That is a professional tool claim.
- To patients: "Your dietitian sets your targets; the app builds the plan and grocery list around them."

Exposure
- FDA: low to moderate, manageable if the CDS criteria are met and documented.
- State licensure: this model works with the licensure system instead of around it. The RD is the one practicing MNT; the software is their instrument.
- Liability: shared with the clinician, and a clinician-in-the-loop design is a strong defense.

Cost and timeline
- No FDA submission, but more legal work (CDS documentation, business associate agreements, HIPAA if you handle PHI on behalf of covered entities). Slower go-to-market because you need clinicians to adopt it. Better long-term defensibility and a possible reimbursement story.

### Option C: Software as a Medical Device (FDA-regulated)

What it is
- The app claims to treat or manage a disease (for example, "digital therapeutic for type 2 diabetes"). This requires FDA clearance or authorization, most likely 510(k) or De Novo, with clinical validation.

Regulatory basis
- Section 201(h) of the FD&C Act; FDA's Policy for Device Software Functions and Mobile Medical Applications (scheduled to be reissued as draft in 2026, so the rules may move). FDA's TEMPO pilot for digital health devices (announced December 2025) is a signal that the agency wants a faster path, but it is a pilot.

Exposure and cost
- Clinical validation study, quality management system (21 CFR 820, now aligned to ISO 13485), cybersecurity documentation, regulatory consultant, and 12 to 36 months. Realistically six to seven figures. Not a v1 path for a solo founder.

### State licensure: medical nutrition therapy

- Licensure of dietitians and nutritionists is state by state and tightening. Michigan's MNT licensing requirement takes effect October 2027. Colorado prohibits providing or offering MNT without a license as of September 1, 2026. Many states already restrict MNT to licensed practitioners; some restrict "nutrition counseling" broadly; a few are nearly unregulated.
- California requires a physician referral and written prescription before an RD provides MNT in private office settings.
- The open legal question: does a software product that outputs a condition-specific meal plan "provide medical nutrition therapy"? These statutes were written for humans, and enforcement against software has been rare, but the definitions in several states ("assessment of nutritional needs and development of a nutrition care plan for a disease") describe what your app would do. A wellness-framed app that provides general education and plans is on safer ground; an app that takes a diagnosis and outputs a therapeutic plan is closer to the line.
- The owner specifically is not an RD and cannot personally practice MNT in any state. That does not stop the owner from owning a software company, but it means the clinical content needs an RD's name on it (content review, advisory role, or co-founder), both for credibility and for the licensure and liability picture.

### Recommendation for v1

Start in Option A with a design that is already shaped for Option B.

Reasoning
- Speed and cost favor A. The January 2026 wellness guidance made A safer than it was a year ago.
- The engine, data model, and citation architecture should be built to the CDS standard from day one (every recommendation traceable, no black-box outputs, clinician can see the basis). That makes the move to B a positioning and contract change rather than a rebuild.
- Retain a registered dietitian as a paid content reviewer before launch. Their review of the food-rule database and the education content is your substantiation file for the FTC, your credibility with the communities you are targeting, and your bridge to B.
- Discipline the claims. Every string of marketing and UI copy gets reviewed against the wellness policy. Condition selection in onboarding is framed as "tell us what eating patterns you are following" with the condition as the reason, not as a diagnosis the app treats.
- Hard-exclusion allergen handling and the POTS/hypertension conflict get the most conservative implementation: the app never sets a therapeutic number; the user enters what their clinician gave them.
- Get a health-tech regulatory attorney to review the claims and the terms of service before launch. Budget for it.

What I am not certain about and want you to decide
1. Whether you want to pursue B1 (consumer app with optional clinician link) or B2 (practitioner tool) as the second stage. It changes the PRD in Phase 2.
2. Whether you already have an RD relationship or need to find one. If you do not, that is a Phase 2 dependency.
3. Whether the Monash FODMAP data licensing question should be explored now or deferred. It affects how honest the IBS module can be at v1.

---

## PART F: SOURCE LIST

Diabetes
- ADA. Standards of Care in Diabetes 2026. Diabetes Care 2026;49(Suppl 1).
- Evert AB et al. Nutrition Therapy for Adults With Diabetes or Prediabetes: A Consensus Report. Diabetes Care 2019;42:731-754.
- Knowler WC et al. (DPP Research Group). NEJM 2002;346:393-403.

Hypertension
- 2025 AHA/ACC Multisociety Guideline for High Blood Pressure in Adults. JACC 2025; doi:10.1016/j.jacc.2025.05.007.
- Appel LJ et al. DASH. NEJM 1997;336:1117-1124.
- Sacks FM et al. DASH-Sodium. NEJM 2001;344:3-10.
- Neal B et al. SSaSS. NEJM 2021;385:1067-1077.

Lipids
- Grundy SM et al. 2018 AHA/ACC Guideline on the Management of Blood Cholesterol. Circulation 2019;139:e1082-e1143.
- Lichtenstein AH et al. 2021 Dietary Guidance to Improve Cardiovascular Health. Circulation 2021;144:e472-e487.
- Carson JAS et al. Dietary Cholesterol and Cardiovascular Risk. Circulation 2020;141:e39-e53.
- Hooper L et al. Cochrane Database Syst Rev 2020;5:CD011737.
- Estruch R et al. PREDIMED. NEJM 2018;378:e34.

Celiac
- Rubio-Tapia A et al. ACG Clinical Guidelines Update: Diagnosis and Management of Celiac Disease. Am J Gastroenterol 2023;118:59-76.
- FDA. 21 CFR 101.91 Gluten-free labeling.

Lactose
- NIH Consensus Development Conference Statement: Lactose Intolerance and Health. 2010.

IBS / FODMAP
- Lacy BE et al. ACG Clinical Guideline: Management of IBS. Am J Gastroenterol 2021;116:17-44.
- Chey WD et al. AGA Clinical Practice Update on the Role of Diet in IBS. Gastroenterology 2022;162:1737-1745.
- Halmos EP et al. Gastroenterology 2014;146:67-75.
- Monash University FODMAP program.

MCAS / histamine
- Aziz Q et al. AGA Clinical Practice Update on GI Manifestations and Autonomic or Immune Dysfunction in Hypermobile Ehlers-Danlos Syndrome. Clin Gastroenterol Hepatol 2025;23:1291-1302.
- Comas-Basté O et al. Histamine Intolerance: The Current State of the Art. Biomolecules 2020;10:1181.
- Evidence for Dietary Management of Histamine Intolerance (review, 2025; PMC12470264).
- Reese I et al. German guideline for the management of adverse reactions to ingested histamine. Allergo J Int 2017;26:72-79.
- Valent P et al. Proposed Diagnostic Algorithm for Patients with Suspected MCAS. J Allergy Clin Immunol Pract 2019;7:1125-1133.

POTS
- Sheldon RS et al. 2015 Heart Rhythm Society Expert Consensus Statement. Heart Rhythm 2015;12:e41-e63.
- Raj SR et al. Canadian Cardiovascular Society Position Statement on POTS. Can J Cardiol 2020;36:357-372.
- Vernino S et al. POTS: State of the Science and Clinical Care. Auton Neurosci 2021;235:102828.
- Garland EM et al. Effect of High Dietary Sodium Intake in Patients With POTS. JACC 2021;77:2174-2184.
- NCT05924646, Calgary Salt for POTS (ongoing).

CRPS
- Systematic review of analgesic efficacy of CRPS therapies, RCTs 2003-2025 (PMC12413907).
- Zhu H et al. Pharmacological Treatment in CRPS: Systematic Review and Meta-Analysis. Pharmaceuticals 2024;17:811.
- Perioperative Vitamin C and CRPS incidence: systematic review and meta-analysis, J Hand Surg 2021 (VERIFY exact citation). Corrected September 30, 2026: Seth I et al., J Foot Ankle Surg 2022;61(4):748-754 (VERIFY-log item 2). The CRPS module was removed September 9, 2026.

Anti-inflammatory / Mediterranean
- Estruch R et al. PREDIMED (above).
- Rees K et al. Cochrane Database Syst Rev 2019;3:CD009825.

Added sugar
- Johnson RK et al. AHA Scientific Statement. Circulation 2009;120:1011-1020.
- WHO Guideline: Sugars intake for adults and children. 2015.
- WHO Guideline: Use of non-sugar sweeteners. 2023.

Non-celiac gluten sensitivity
- Skodje GI et al. Gastroenterology 2018;154:529-539.
- Biesiekierski JR et al. Gastroenterology 2013;145:320-328.
- Lebwohl B et al. BMJ 2017;357:j1892.

Soy / allergy
- FDA FALCPA (2004) and FASTER Act (2021, sesame).
- Sampson HA et al. Food allergy: a practice parameter update. J Allergy Clin Immunol 2014;134:1016-1025.

Gut health
- Reynolds A et al. Lancet 2019;393:434-445.
- Wastyk HC et al. Cell 2021;184:4137-4153.
- McDonald D et al. mSystems 2018;3:e00031-18.
- Su GL et al. AGA Clinical Practice Guidelines on Probiotics. Gastroenterology 2020;159:697-705.

Regulatory
- FDA. General Wellness: Policy for Low Risk Devices. January 6, 2026.
- FDA. Clinical Decision Support Software. January 6, 2026.
- FDA. Warning Letter to WHOOP, Inc. July 14, 2025.
- FDA. TEMPO pilot, 90 Fed Reg 56768 (Dec 8, 2025).
- Colorado HB25-1220 (MNT licensure, effective Sept 1, 2026).
- Michigan MNT licensure rules filed April 16, 2026; licensure required Oct 27, 2027.
- California Business and Professions Code 2586.
- Dietary Guidelines for Americans 2025-2030 (January 2026) and the 2025 Dietary Guidelines Advisory Committee Scientific Report.

---

# ADDENDUM (added September 4, 2026): Additional common conditions and diets, plus cooking time and interest

The owner asked for the conditions and diets registered dietitians most commonly handle that were not on the original list. Below are the eight highest-volume additions for v1, three added diet patterns, one category the app must screen for and refuse, and a list of what is deferred to a later version. Same rating scale as above.

Selection basis: outpatient RD caseload data is not published in one place, so this list is my synthesis of Medicare MNT coverage (diabetes and kidney disease are the only two Medicare-covered MNT diagnoses), Academy of Nutrition and Dietetics evidence-based practice guideline topics, and what fills outpatient nutrition referrals. That is a professional judgment, not a measured ranking. Flagging it as such.

---

## ADDED CONDITIONS

### A1. Weight management / obesity, including people on GLP-1 medications
Rating: STRONG that a sustained calorie deficit produces weight loss; MODERATE for any one diet composition being superior; LIMITED (consensus-based) for GLP-1-specific nutrition guidance

Governing sources
- 2013 AHA/ACC/TOS Guideline for the Management of Overweight and Obesity in Adults (Jensen et al.).
- Obesity Medicine Association Clinical Practice Statements.
- Nutritional Priorities to Support GLP-1 Therapy for Obesity: joint advisory from ACLM, ASN, OMA, and TOS (Mozaffarian et al., Am J Clin Nutr 2025;122:344-367, with corrigendum). Note: this advisory drew published letters criticizing it for calling itself evidence-based when much of it is extrapolated; the authors acknowledge the evidence gap.
- Sievenpiper JL et al. Expert consensus (modified Delphi) on nutritional and lifestyle supportive care with GLP-1 based therapies. Obesity Pillars 2026 (doi 10.1016/j.obpill.2025.100228). 52 statements, primarily derived from indirect evidence and bariatric nutrition guidelines.
- DIETFITS (Gardner et al., JAMA 2018): no difference between healthy low-fat and healthy low-carb at 12 months.

Core food rules
- A 500 to 750 kcal/day deficit, or an eating pattern that produces one, is the mechanism. The pattern the person will stick to is the right one; Mediterranean, DASH, low-carb, and plant-based all work when calories are controlled.
- 5 to 10 percent weight loss is the clinically meaningful target.
- GLP-1 users: smaller meals, protein first at each meal, adequate fluids, fiber for constipation, avoid high-fat and very large meals (nausea), and screen for undereating. Higher protein and resistance training to protect muscle and bone during rapid loss; the advisory and consensus both stress this. Specific protein targets in the literature run roughly 1.2 to 1.6 g/kg/day during active loss (VERIFY exact figure against the AJCN advisory before encoding). Checked September 30, 2026: the advisory reports that range as proposed by others and offers an absolute 80 to 120 g a day, which the app now uses (VERIFY-log A26). Micronutrient adequacy: iron, B12, vitamin D, calcium, folate are the ones flagged.
- Both GLP-1 documents call for baseline screening for disordered eating before starting therapy. The app should do the same (see A9 below).

Contested or nuanced
- This is the only area where calories are unavoidably central. The owner's prompt says calories only where the experts recommend; here they do.
- Meal replacements and very-low-calorie diets: legitimate under supervision, not a consumer-app feature.
- Weight regain after stopping GLP-1s is the norm; the app's maintenance-phase content matters more than its loss-phase content.

### A2. Chronic kidney disease, stages 1 to 4 (non-dialysis)
Rating: STRONG for sodium restriction; MODERATE for protein restriction; potassium and phosphorus are INDIVIDUALIZED by lab values and must not be set by the app

Governing sources
- KDIGO 2024 Clinical Practice Guideline for the Evaluation and Management of CKD (Kidney Int 2024;105:S117-S314).
- KDOQI Clinical Practice Guideline for Nutrition in CKD: 2020 Update (Ikizler TA et al., Am J Kidney Dis 2020;76:S1-S107).
- KDIGO 2022 Diabetes in CKD guideline.

Core food rules
- Sodium under 2,300 mg/day (KDOQI, KDIGO both under 2 g sodium).
- Protein: KDIGO 2024 recommends 0.8 g/kg/day for adults with CKD stages 3 to 5 not on dialysis; KDOQI 2020 allows a supervised low-protein diet of 0.55 to 0.60 g/kg for metabolically stable patients. People with diabetes and CKD: 0.8 g/kg. Avoid high-protein intake above 1.3 g/kg.
- Potassium: no blanket restriction. Restrict only when serum potassium is high, and the level of restriction depends on labs and medications. Plant potassium is less bioavailable than animal or additive potassium, and plant-forward patterns are now encouraged in CKD.
- Phosphorus: prioritize avoiding phosphate additives (processed foods, colas, "phos" ingredients) over restricting natural phosphorus in plant foods.
- Mediterranean and plant-forward patterns are associated with slower progression (observational).

How the app must handle it
- This is the highest-risk module in the app after allergens. The published LLM studies (CKD meal planning, dialysis) show models get sodium, potassium, and phosphorus wrong. All nutrient values must come from USDA FoodData Central and deterministic math, never from a language model estimate.
- The app never sets a potassium or phosphorus limit. The user enters the targets their nephrologist or renal dietitian gave them, or the app operates in "sodium and protein only" mode with a clear statement that potassium and phosphorus were not applied.
- Dialysis (stage 5D) is out of scope for v1. Different rules entirely.

Interaction flags
- Hard conflict with the hypertension potassium recommendation (3,500 to 5,000 mg). CKD wins; the app suppresses the potassium target and says why.
- Conflict with high-protein patterns and with GLP-1 protein guidance. Clinician-set protein target required if both are selected.

### A3. MASLD (metabolic dysfunction-associated steatotic liver disease, formerly NAFLD)
Rating: STRONG for weight loss as treatment; MODERATE for the Mediterranean pattern; MODERATE for limiting fructose and alcohol

Governing sources
- AASLD Practice Guidance on the clinical assessment and management of NAFLD (Rinella ME et al., Hepatology 2023;77:1797-1835).
- ADA Standards of Care 2026, Section 4 (liver disease screening in T2D, referenced above).

Core food rules
- Weight loss of 5 percent reduces liver fat; 7 to 10 percent improves inflammation and fibrosis. This is the treatment.
- Mediterranean pattern is the recommended default.
- Minimize sugar-sweetened beverages and added fructose (high-fructose corn syrup in particular).
- Alcohol: avoid or minimize; abstain if fibrosis is present.
- Coffee (2 to 3 cups/day, unsweetened) is associated with lower fibrosis risk; reasonable to mention, not a prescription.

Interaction flags
- Fully compatible with diabetes, lipid, and hypertension rules. This condition rarely travels alone.

### A4. GERD / acid reflux
Rating: MODERATE for weight loss and meal timing; LIMITED for specific trigger-food elimination

Governing sources
- ACG Clinical Guideline for the Diagnosis and Management of GERD (Katz PO et al., Am J Gastroenterol 2022;117:27-56).

Core food rules
- Weight loss if overweight (the strongest lifestyle lever).
- No eating within 2 to 3 hours of lying down. Elevate the head of the bed for nighttime symptoms.
- The guideline does not recommend blanket elimination of classic trigger foods (coffee, chocolate, citrus, tomato, spicy, fatty, carbonated, mint, alcohol). It recommends avoiding the ones that trigger the individual. The app should offer these as optional toggles with the evidence note, not as default exclusions.
- Smaller meals, less fat per meal.

### A5. Inflammatory bowel disease (Crohn's disease and ulcerative colitis)
Rating: MODERATE for Mediterranean pattern in remission; STRONG for exclusive enteral nutrition in pediatric Crohn's (out of app scope); LIMITED for named diets (Specific Carbohydrate Diet, Crohn's Disease Exclusion Diet); INSUFFICIENT for most online IBD diets

Governing sources
- AGA Clinical Practice Update on Diet and Nutritional Therapies in Patients With IBD: Expert Review (Hashash JG et al., Gastroenterology 2024;166:521-532).
- International Organization for the Study of IBD dietary guidance (Levine A et al., Clin Gastroenterol Hepatol 2020).
- DINE-CD trial (Lewis JD et al., Gastroenterology 2021): SCD not superior to Mediterranean diet in Crohn's.

Core food rules
- In remission: Mediterranean-style diet, adequate fiber, limit ultra-processed food, emulsifiers, and added sugar. Avoid unnecessary restriction; malnutrition is the bigger risk in IBD.
- During flares or with strictures: low-fiber or low-residue eating, soft cooked vegetables, avoid nuts, seeds, raw vegetables, and skins. Temporary.
- Lactose intolerance is common in active disease; not a reason for permanent dairy avoidance.
- Nutrient risk: iron, B12 (especially after ileal resection), vitamin D, zinc, folate. Refer for labs.

How the app must handle it
- Two modes: remission and flare. The user switches; the app does not diagnose a flare. Flare mode expires and prompts a check-in.
- Do not encode SCD, low-FODMAP-for-IBD, or "autoimmune protocol" as IBD treatments. Low FODMAP can help coexisting IBS symptoms in IBD patients in remission (limited evidence); present it that way.

### A6. PCOS
Rating: MODERATE for weight loss (if overweight) and general healthy eating; LIMITED for any specific diet composition

Governing sources
- International Evidence-based Guideline for the Assessment and Management of PCOS 2023 (Teede HJ et al., published jointly in J Clin Endocrinol Metab, Fertil Steril, Hum Reprod, Eur J Endocrinol 2023).

Core food rules
- No specific diet composition is superior. Healthy eating principles apply, tailored to preference.
- If overweight, 5 to 10 percent weight loss improves metabolic, reproductive, and psychological outcomes.
- Lower glycemic index and Mediterranean-style patterns have supportive but not decisive evidence for insulin resistance.
- The guideline explicitly warns about weight stigma and disordered eating risk in this population. The app should not push calorie restriction to PCOS users who are not overweight, and should screen (A9).

Contested
- Gluten-free, dairy-free, and "PCOS diets" sold online have no guideline support. Do not encode.

### A7. Gout
Rating: MODERATE for diet as an adjunct; medication is the primary treatment

Governing sources
- 2020 ACR Guideline for the Management of Gout (FitzGerald JD et al., Arthritis Care Res 2020;72:744-760).

Core food rules
- Limit alcohol (beer and spirits especially), purine-rich foods (organ meats, some seafood such as anchovies, sardines, shellfish), and high-fructose corn syrup and sugar-sweetened beverages.
- Weight loss if overweight.
- DASH or Mediterranean pattern; low-fat dairy is associated with lower urate.
- Cherries and vitamin C: limited evidence; do not promote.
- The ACR states diet alone is unlikely to control gout; urate-lowering therapy is the treatment. The app must say this.

### A8. Heart failure
Rating: MODERATE for avoiding excessive sodium; LIMITED for a specific sodium number; LIMITED for fluid restriction

Governing sources
- 2022 AHA/ACC/HFSA Guideline for the Management of Heart Failure (Heidenreich PA et al., Circulation 2022;145:e895-e1032).
- SODIUM-HF trial (Ezekowitz JA et al., Lancet 2022): restricting sodium below 1,500 mg did not reduce clinical events versus usual care, though it improved quality-of-life measures.

Core food rules
- Avoid excessive sodium; under 2,300 mg/day is the reasonable working number (the guideline gives a Class 2a recommendation to avoid excessive sodium, without a firm threshold).
- Fluid restriction (1.5 to 2 L/day) only in advanced heart failure or hyponatremia, on clinician instruction.
- DASH pattern is reasonable.
- Potassium intake interacts with diuretics, ACE inhibitors, ARBs, MRAs; same medication screen as hypertension.

Contested
- The aggressive sodium restriction that was standard for decades is not supported by SODIUM-HF. The app should not push under 1,500 mg for heart failure.

---

## ADDED DIET PATTERNS

### A10. Vegetarian and vegan
Rating: STRONG that well-planned vegetarian and vegan diets are nutritionally adequate and associated with lower cardiometabolic risk

Governing sources
- Academy of Nutrition and Dietetics Position Paper on Vegetarian Diets (Melina V et al., J Acad Nutr Diet 2016;116:1970-1980). The Academy retired this position in 2021 pending an update; check whether the replacement has been published (VERIFY). Checked September 30, 2026: replaced for adults by Raj S et al., Vegetarian Dietary Patterns for Adults, J Acad Nutr Diet 2025;125(6):831-846.e2 (VERIFY-log A27).
- EPIC-Oxford and Adventist Health Study 2 cohorts.

Core rules
- Vegans: vitamin B12 must come from fortified foods or a supplement. This is the one place the app should state a supplement is required, because there is no food alternative.
- Attention nutrients: iron (pair with vitamin C, avoid tea and coffee at meals), zinc, calcium, iodine, vitamin D, omega-3 (ALA from flax, chia, walnuts; algae-based EPA/DHA optional).
- Protein is adequate with variety; legumes, soy, whole grains, nuts, seeds.
- Soy-free vegans have a narrower protein base; the app should surface alternatives.

### A11. Low-carbohydrate and ketogenic
Rating: MODERATE for short-term glycemic control and weight loss; LIMITED for long-term outcomes; STRONG for ketogenic diet in drug-resistant epilepsy (medically supervised, out of app scope)

Governing sources
- ADA Standards of Care 2026 (accepts low-carb as one pattern).
- Cochrane review on ketogenic diets for epilepsy (Martin-McGill KJ et al., 2020).
- DIETFITS (above).

Core rules
- Define the tiers: low-carb (under 130 g/day), very low-carb / ketogenic (under 50 g/day, typically 20 to 50).
- Contraindications and cautions the app must screen for: SGLT2 inhibitor use (euglycemic ketoacidosis risk), insulin or sulfonylurea use (hypoglycemia; dose adjustment needed), pregnancy and breastfeeding, kidney disease, history of pancreatitis, certain rare metabolic disorders, and history of disordered eating.
- Emphasize non-starchy vegetables, unsaturated fats, and fiber. A low-carb diet built on processed meat and butter is not heart-healthy.
- Therapeutic ketogenic diets for epilepsy or other neurological conditions are clinician-managed and excluded from the app.

### A12. Higher protein and older-adult nutrition
Rating: MODERATE

Governing sources
- PROT-AGE Study Group (Bauer J et al., J Am Med Dir Assoc 2013): 1.0 to 1.2 g/kg/day for healthy older adults, 1.2 to 1.5 g/kg for those with acute or chronic illness.
- ESPEN guideline on clinical nutrition and hydration in geriatrics (Volkert D et al., Clin Nutr 2022).

Core rules
- Older adults (65-plus) need more protein per kilogram than younger adults to preserve muscle; spread across meals (25 to 30 g per meal) with resistance exercise.
- Conflict with CKD protein limits: clinician-set target required.

---

## CATEGORY THE APP MUST SCREEN FOR AND REFUSE

### A9. Eating disorders and disordered eating
This is not a condition the app treats. It is a population the app must protect.

- Both GLP-1 guidance documents, the PCOS guideline, and standard RD practice call for screening before any weight-focused or restrictive intervention.
- Onboarding should include a brief validated screen (the SCOFF questionnaire is five yes/no items and is public domain; VERIFY licensing. Checked September 30, 2026: not public domain; the BMJ holds the copyright, see VERIFY-log item 5. The screen was removed September 9, 2026). A positive screen means the app does not generate calorie targets, weight-loss plans, or restrictive elimination phases, and instead provides supportive language and a referral path (National Alliance for Eating Disorders helpline; NEDA's helpline is discontinued and should not be listed).
- Users who select multiple elimination diets at once (low FODMAP plus low histamine plus gluten-free plus dairy-free plus low-carb) get a plain-language check-in about restriction load and a suggestion to work with a dietitian. The AGA update on hEDS/MCAS/POTS specifically warns about restrictive-eating harms in that population.
- This is the one module where the owner's own review should shape the language.

---

## DEFERRED TO A LATER VERSION (with reason)
- Pregnancy, gestational diabetes, breastfeeding: strong evidence base but a different safety and liability profile; needs OB input.
- Cancer nutrition (during treatment and survivorship): highly individualized, oncology dietitian territory.
- Dialysis (CKD 5D): different rules from non-dialysis CKD.
- Kidney stones: strong evidence (fluid, calcium, oxalate, sodium, citrate) but low volume; good v2 add.
- Osteoporosis: mostly calcium, vitamin D, protein; easy v2 add.
- Iron-deficiency anemia: straightforward; v2.
- Gastroparesis: covered partially under POTS; full module later.
- Migraine: trigger-food evidence is weak and individual; low priority.
- Thyroid conditions: minimal diet-specific evidence beyond iodine and selenium adequacy; mostly myth-busting. Education-section only.
- Pediatric anything: out of scope until the regulatory posture is settled.

---

## COOKING TIME, INTEREST, AND SKILL AS MEAL-PLAN INPUTS

The owner asked that recipes and meal plans account for the person's interest in cooking and the time they have. This is a product requirement, not an evidence question, but it matters for adherence, which is the evidence question: every guideline above notes that adherence, not diet composition, predicts outcomes.

What the app should capture at onboarding and allow the user to change any time:
- Weekday time available per meal (under 10 minutes, 10 to 20, 20 to 40, 40-plus) and the same for weekends.
- Which days they can cook and which days they cannot (work schedule, shifts, travel).
- Interest in cooking (I want to cook and learn; I'll cook if it's simple; I want minimal cooking; assembly-only, no stove).
- Skill level (beginner, comfortable, confident).
- Equipment (stove/oven, microwave only, air fryer, slow cooker, pressure cooker, blender, no kitchen).
- Batch cooking and leftovers tolerance (will eat the same thing three days running; want variety every meal; somewhere between).
- Household: cooking for one, for a partner, for a family with different restrictions.
- Grocery access (full supermarket, limited store, delivery only, dollar-store or food-bank constrained).

How it drives the plan:
- Recipe scoring includes active time, total time, ingredient count, equipment match, and skill match alongside the medical and preference rules. A recipe that fits the diet but takes 90 minutes on a night the user has 15 is a failed recommendation.
- The plan front-loads cooking on days the user can cook and schedules leftovers, batch-cooked components, or assembly meals on days they cannot.
- "Minimal cooking" users get plans built on assembly (rotisserie chicken, canned beans, pre-cut vegetables, frozen produce, plain yogurt, whole-grain bread), with the medical rules still enforced (sodium in rotisserie chicken and canned goods is the obvious trap; the app must count it).
- Grocery list optimization accounts for shelf life against the cooking schedule so perishables are used before they spoil.
- Time and interest are soft constraints the user can override for a special occasion; medical rules and allergens are not.

Sources: this section is product design informed by adherence findings in the guidelines above and by the DASH grocery-delivery study cited in the American Journal of Hypertension (2026) showing that curated delivery beat self-directed shopping for blood pressure and sodium outcomes. No further citation is needed for the feature itself.

---

# ADDENDUM 2 (added September 5, 2026): Formerly deferred conditions, now in v1 scope; Option B1 confirmed

The owner's decisions: (1) the second-stage regulatory path is B1, a consumer app with an optional clinician link where the clinician sets therapeutic targets; (2) everything in the deferred list moves into v1.

I am complying with (2), and I am going to be blunt about three of the ten. Pregnancy, cancer, and pediatrics change the app's risk profile more than the rest of the list combined. Encoding the evidence is easy. Putting them in front of consumers under a wellness-tool posture is where the exposure lives. Each of those three sections ends with what I think the minimum safe implementation is. If you overrule me, that is your call, and the PRD will reflect it.

Same rating scale as before.

---

### D1. Pregnancy, gestational diabetes, and breastfeeding
Rating: STRONG for the core pregnancy nutrition rules; STRONG for GDM medical nutrition therapy; MODERATE for breastfeeding-specific guidance

Governing sources
- ACOG Committee Opinion and Practice Bulletins on nutrition in pregnancy, obesity in pregnancy (Practice Bulletin 230, 2021), and gestational diabetes (Practice Bulletin 190, 2018; VERIFY whether a newer bulletin has replaced it. Checked September 30, 2026: current, reaffirmed 2026).
- ADA Standards of Care 2026, Section 15 (Management of Diabetes in Pregnancy).
- Institute of Medicine / National Academies, Weight Gain During Pregnancy (2009): gain targets by pre-pregnancy BMI.
- FDA and EPA Advice About Eating Fish (2021 update) for mercury.
- Academy of Nutrition and Dietetics Position on Nutrition and Lifestyle for a Healthy Pregnancy Outcome (2014; VERIFY current status). Checked September 30, 2026: not a current Academy position.
- USDA Dietary Guidelines 2025-2030 pregnancy and lactation chapter (one of the less contested sections).

Core food rules, pregnancy
- Folic acid 400 mcg/day from before conception through the first trimester (600 mcg dietary folate equivalents total); this is a supplement rule, and it is the one place a supplement is non-negotiable.
- Iron, iodine (150 mcg supplemental per ACOG and ATA), choline, DHA, vitamin D, calcium: prenatal vitamin plus food.
- Food safety: avoid unpasteurized dairy and juice, raw or undercooked meat, fish, and eggs, deli meats and hot dogs unless heated steaming hot, refrigerated smoked seafood, raw sprouts (Listeria, Toxoplasma, Salmonella).
- Fish: 8 to 12 oz/week of low-mercury fish; avoid shark, swordfish, king mackerel, tilefish, bigeye tuna, orange roughy, marlin.
- Caffeine under 200 mg/day. Alcohol: none.
- Weight gain by pre-pregnancy BMI category, not weight loss. The app must disable weight-loss features for pregnant users.
- Calorie needs rise modestly: none in the first trimester, roughly 340 kcal/day in the second, 450 in the third for a singleton.

Core food rules, gestational diabetes
- Medical nutrition therapy is the first-line treatment. ACOG and ADA both call for RD-delivered MNT.
- Carbohydrate: at least 175 g/day (Dietary Reference Intake minimum for pregnancy), distributed across three meals and two to three snacks, emphasizing complex carbohydrate and fiber; avoid concentrated sweets. Older guidance capped carbohydrate at 33 to 40 percent of calories; newer evidence supports a higher-complex-carb, lower-fat approach; both are in use. Present both.
- Glucose monitoring drives adjustments; the app cannot see the glucose log unless the user enters it.

Core food rules, breastfeeding
- Roughly 330 to 400 additional kcal/day; adequate fluids; iodine 290 mcg/day; continue DHA; alcohol minimal and timed; caffeine moderate.
- Maternal elimination diets for infant colic or eczema: weak evidence; cow's milk protein elimination has some support for confirmed infant CMPA. Do not encode blanket maternal eliminations.

Why this one is different
- Two patients, one of whom has no voice in the app. A wrong rule harms a fetus. Under the wellness posture, any language like "manage your gestational diabetes" is a disease claim about a pregnancy, which regulators and plaintiffs' attorneys treat differently. Fetal harm claims have long statutes of limitations.

Minimum safe implementation
- Pregnancy mode disables weight loss, low-carb below 175 g, ketogenic, intermittent fasting, and every elimination protocol except allergen and celiac rules.
- GDM lives under B1 only: the user links a clinician or enters clinician-provided carbohydrate targets; the app does not generate them. Until B1 exists, GDM is education-only with a referral prompt.
- OB or maternal-fetal medicine physician review of the pregnancy content before launch, in addition to the RD review.

---

### D2. Cancer nutrition (during treatment and survivorship)
Rating: STRONG for the survivorship eating pattern; MODERATE for symptom-management strategies during treatment; INSUFFICIENT for anti-cancer diets

Governing sources
- American Cancer Society Nutrition and Physical Activity Guideline for Cancer Survivors (Rock CL et al., CA Cancer J Clin 2022;72:230-262).
- ESPEN practical guideline: Clinical nutrition in cancer (Muscaritoli M et al., Clin Nutr 2021;40:2898-2913).
- World Cancer Research Fund / AICR Continuous Update Project and Cancer Prevention Recommendations (2018, updated online).
- Academy of Nutrition and Dietetics Oncology Evidence-Based Nutrition Practice Guideline.
- ASCO guideline on exercise, diet, and weight management during cancer treatment (Ligibel JA et al., J Clin Oncol 2022).

Core food rules
- Survivorship and prevention: plant-forward pattern (vegetables, fruit, whole grains, legumes), limit red and processed meat, limit alcohol (none is best for cancer risk), limit sugar-sweetened beverages and ultra-processed food, maintain a healthy weight, stay active. This is the ACS and WCRF consensus and it is strong.
- During treatment: energy roughly 25 to 30 kcal/kg/day and protein 1.0 to 1.5 g/kg/day (ESPEN), higher with cachexia; preventing weight and muscle loss is the priority, which often means eating more calorie-dense food, the opposite of most other modules.
- Symptom-driven strategies: nausea (small frequent meals, bland, cold foods), taste changes (marinades, plastic utensils for metallic taste), mucositis (soft, non-acidic), diarrhea (low fiber, low fat, fluids), constipation (fiber, fluids). These are practice-based, moderate evidence.
- Food safety during neutropenia: safe food handling matters; the restrictive "neutropenic diet" is not supported by evidence and is no longer recommended by most centers.
- ASCO 2022 found insufficient evidence to recommend specific diets (ketogenic, fasting, low-fat, plant-based, or supplements) to improve treatment outcomes.

What the app must refuse
- Any claim that a food, diet, or supplement treats, shrinks, or prevents recurrence of cancer. No alkaline diet, no sugar-feeds-cancer, no high-dose antioxidants (which can interfere with chemotherapy and radiation), no fasting protocols during treatment outside a clinical trial.

Why this one is different
- The population is sick, frightened, and heavily targeted by fraud. The app's credibility depends on never being confused with that market.

Minimum safe implementation
- Survivorship and prevention module: fully in scope, wellness posture.
- Active-treatment module: B1 only, oncology dietitian sets the targets, app supports with symptom-specific recipes and tracking. Until B1, education and referral only.

---

### D3. Dialysis (CKD stage 5D, hemodialysis and peritoneal dialysis)
Rating: STRONG for protein and sodium targets; potassium, phosphorus, and fluid are INDIVIDUALIZED by labs and modality

Governing sources
- KDOQI Clinical Practice Guideline for Nutrition in CKD: 2020 Update (Ikizler et al., above).
- KDIGO 2024 CKD guideline.
- National Kidney Foundation patient materials.

Core food rules
- Protein: 1.0 to 1.2 g/kg/day for both hemodialysis and peritoneal dialysis (higher than non-dialysis CKD, because dialysis removes protein). Peritoneal dialysis patients may need the upper end.
- Sodium under 2,300 mg/day.
- Potassium: individualized by serum level; hemodialysis patients typically restrict, peritoneal dialysis patients often do not.
- Phosphorus: restrict additive phosphorus first; natural phosphorus limits set by labs; phosphate binders are timed with meals.
- Fluid: hemodialysis patients are often limited based on interdialytic weight gain (commonly about 1 L/day plus urine output); peritoneal dialysis is more liberal. The app must not set this.
- Calories: 25 to 35 kcal/kg/day; malnutrition is common and dangerous in dialysis.

Minimum safe implementation
- Dialysis is B1 only. The renal dietitian enters protein, potassium, phosphorus, and fluid targets; the app enforces them with deterministic USDA math and flags additive phosphorus in ingredient lists. Without a clinician link, the app runs in "sodium and protein only" mode with a plain statement that the other limits are not applied.

---

### D4. Kidney stones
Rating: STRONG for fluid and sodium; STRONG for normal (not low) calcium intake; MODERATE for oxalate, animal protein, and citrate guidance

Governing sources
- AUA / Endourological Society Guideline: Medical Management of Kidney Stones (Pearle MS et al., J Urol 2014, amended 2019).
- Academy of Nutrition and Dietetics practice materials.

Core food rules (calcium oxalate stones, the most common type)
- Fluid to produce at least 2.5 L of urine per day, typically 3 L intake.
- Do not restrict calcium. 1,000 to 1,200 mg/day from food, taken with meals so it binds oxalate in the gut. Low-calcium diets increase stone risk.
- Sodium under 2,300 mg/day (sodium drives urinary calcium).
- Limit high-oxalate foods (spinach, rhubarb, almonds, beets, nuts, chocolate, sweet potato) and never eat them without calcium in the same meal.
- Limit non-dairy animal protein.
- Citrate: lemon and lime juice raise urinary citrate modestly; potassium citrate prescription is the real intervention.
- Uric acid stones: limit purines, alkalinize urine (clinician-managed). Cystine and struvite stones: specialist-managed, out of scope.

Interaction flags
- Kidney stones plus CKD: fluid and protein rules interact; clinician-set.
- High-oxalate foods overlap heavily with the plant-forward, gut-health, and heart-healthy lists (spinach, nuts, beets). The app must reconcile by pairing rather than eliminating.

---

### D5. Osteoporosis and osteopenia
Rating: MODERATE for calcium and vitamin D; MODERATE for protein; LIMITED for everything else

Governing sources
- Bone Health and Osteoporosis Foundation, Clinician's Guide to Prevention and Treatment of Osteoporosis (LeBoff MS et al., Osteoporos Int 2022;33:2049-2102).
- USPSTF and Endocrine Society statements on vitamin D.

Core food rules
- Calcium 1,000 mg/day (women under 50, men under 70) or 1,200 mg/day (women 50-plus, men 70-plus), food first, supplements only to fill the gap; supplemental calcium above 1,000 mg has cardiovascular questions.
- Vitamin D 800 to 1,000 IU/day for adults 50-plus (BHOF); this is a supplement recommendation because food sources are inadequate.
- Protein adequate (1.0 to 1.2 g/kg for older adults, per A12).
- Limit alcohol; caffeine moderate; sodium moderate (high sodium increases calcium loss).
- Fruits and vegetables (potassium, magnesium, vitamin K) associated with bone density.
- Bone-building "superfoods" claims: not supported.

---

### D6. Iron-deficiency anemia
Rating: MODERATE for dietary strategies; STRONG that diet alone rarely corrects established deficiency

Governing sources
- British Society of Gastroenterology guidelines for the management of iron deficiency anaemia in adults (Snook J et al., Gut 2021;70:2030-2051).
- American Society of Hematology and CDC materials.

Core food rules
- Heme iron (red meat, poultry, fish) is absorbed 2 to 3 times better than non-heme iron (legumes, fortified grains, leafy greens, tofu).
- Pair non-heme iron with vitamin C; separate iron-rich meals from tea, coffee, calcium supplements, and high-calcium foods by 1 to 2 hours.
- Cast-iron cookware adds iron modestly.
- Diet supports; oral or IV iron treats. The BSG guideline is explicit that established deficiency needs supplementation and a search for the cause (GI blood loss, celiac disease, menstrual loss).

Interaction flags
- Vegetarian and vegan users are at higher risk; the app should raise the iron guidance automatically.
- Celiac disease is a common hidden cause; if a user selects iron deficiency without celiac, the education section should mention screening.

---

### D7. Gastroparesis
Rating: MODERATE for the small-particle diet; MODERATE for low fat, low fiber, small frequent meals

Governing sources
- ACG Clinical Guideline: Gastroparesis (Camilleri M et al., Am J Gastroenterol 2022;117:1197-1220).
- Olausson EA et al., Am J Gastroenterol 2014 (RCT of small-particle diet in diabetic gastroparesis).

Core food rules
- Small-particle diet: foods that are easy to mash with a fork, avoiding fibrous, tough, or large-particle foods (raw vegetables, whole nuts, seeds, skins, tough meat).
- Low fat (fat slows emptying), except liquid fats are often tolerated.
- Low fiber, especially insoluble fiber; avoid bezoar-forming foods (persimmons, oranges membranes, celery).
- Small, frequent meals (4 to 6/day); liquids and blended meals empty faster.
- Sit upright after eating; walking after meals helps.
- Nutrient adequacy is the risk; multivitamin often needed.

Interaction flags
- Conflicts directly with gut-health fiber advice, diabetes fiber advice, and heart-healthy nut and whole-grain advice. Gastroparesis rules win on texture; the app should meet fiber goals through soluble, cooked, or blended sources where possible.
- Common in long-standing diabetes (glucose control affects emptying) and in the POTS/hEDS/MCAS cluster.

---

### D8. Migraine
Rating: LIMITED for trigger-food avoidance; LIMITED for specific dietary interventions; STRONG for meal regularity and hydration as general advice

Governing sources
- American Headache Society and International Headache Society materials; no formal dietary guideline exists.
- Ramsden CE et al., BMJ 2021 (RCT: a diet high in omega-3 and low in omega-6 reduced headache frequency; the strongest single dietary trial).
- Systematic reviews on dietary triggers (Hindiyeh NA et al., Headache 2020).

Core food rules
- Regular meals, no skipped meals, adequate hydration, consistent caffeine intake (both excess and withdrawal trigger), limit alcohol (red wine most commonly reported).
- Trigger foods (aged cheese, cured meats, chocolate, MSG, aspartame, citrus): evidence is weak and mostly self-report; some "triggers" may be premonitory cravings. Offer as optional toggles with a symptom diary, never as default exclusions.
- Higher omega-3 from fatty fish has the best trial data; low-glycemic and ketogenic diets have small trials; magnesium and riboflavin are supplement-level and out of scope.

---

### D9. Thyroid conditions (hypothyroidism, Hashimoto's, hyperthyroidism)
Rating: MODERATE for medication-timing rules; LIMITED for everything else; INSUFFICIENT for "thyroid diets"

Governing sources
- American Thyroid Association guidelines for hypothyroidism (Jonklaas J et al., Thyroid 2014) and hyperthyroidism (Ross DS et al., Thyroid 2016).
- ATA statement on iodine.

Core food rules
- Levothyroxine (updated September 30, 2026 to the ATA guideline's own wording; see VERIFY-log A16): take it the same way every day on an empty stomach, 60 minutes before breakfast or at bedtime 3 or more hours after the evening meal; keep calcium and iron supplements apart, about 4 hours by custom, which the guideline calls untested. The original wording here was "30 to 60 minutes before food or at bedtime 3 to 4 hours after eating; separate from calcium, iron, soy, high-fiber meals, and coffee by about 4 hours." This is the one thyroid rule with clear evidence and it is a timing rule, not a food rule.
- Iodine: adequate (150 mcg/day) but not excessive; excess iodine (kelp supplements) can worsen thyroid disease.
- Goitrogens (cruciferous vegetables, soy): not a concern at normal intake with adequate iodine. The app should say so.
- Gluten-free for Hashimoto's: no evidence unless celiac disease is present (which is more common in autoimmune thyroid disease, so screening is reasonable).
- Selenium supplementation: mixed evidence; do not recommend.
- Hyperthyroidism: adequate calories and calcium during active disease; avoid iodine excess.

This module is mostly myth-busting and belongs primarily in the education section, with the medication-timing rule surfaced in meal scheduling.

---

### D10. Pediatric nutrition
Rating: STRONG evidence base for pediatric celiac, food allergy, and type 1 diabetes; STRONG for the 2023 AAP obesity guideline; the problem is not evidence, it is safety and law

Governing sources
- American Academy of Pediatrics Clinical Practice Guideline for the Evaluation and Treatment of Children and Adolescents With Obesity (Hampl SE et al., Pediatrics 2023).
- NASPGHAN and ESPGHAN guidelines for pediatric celiac disease.
- NIAID food allergy guidelines and the LEAP and EAT trials on early allergen introduction (peanut introduction at 4 to 6 months reduces allergy; now AAP and AAAAI consensus).
- ADA Standards of Care 2026, Section 14 (Children and Adolescents).
- AAP and Academy positions on infant and toddler feeding; USDA WIC materials.

Why this changes the app
- Children's Online Privacy Protection Act (COPPA): any user under 13 requires verifiable parental consent and strict data handling. Apple and Google both impose additional rules on health apps aimed at minors.
- Growth, not weight loss, is the goal for almost every child. The AAP 2023 guideline does endorse intensive treatment for pediatric obesity, but delivered by clinicians, not apps.
- Restrictive diets in children (low FODMAP, low histamine, ketogenic, elimination diets) carry growth and disordered-eating risk that pediatric GI and allergy societies warn about repeatedly.
- Pediatric type 1 diabetes carbohydrate counting is insulin dosing by another name. That is medical.

Minimum safe implementation
- The app is for adults 18-plus. Full stop for v1's consumer posture.
- A caregiver mode, where a parent manages a child's confirmed celiac disease or diagnosed food allergies (both of which have unambiguous, non-restrictive-beyond-necessity rules and a large practical need), is the only pediatric feature I would put in v1, and only with pediatrician-reviewed content and a hard age gate on the account holder.
- Everything else pediatric (obesity, T1D, IBD, elimination diets) is B1 with a pediatric clinician, or later.

---

## WHAT B1 MEANS FOR THE PRD (carried into Phase 2)

The owner chose B1: a consumer app in which the user can optionally link a clinician (RD, physician, NP) who sets therapeutic targets that the app then enforces. Implications the PRD must handle:

1. Two tiers of rules. Tier 1 rules are guideline-derived and the app applies them on its own (DASH pattern, celiac exclusions, added-sugar limits, allergen exclusions). Tier 2 rules are therapeutic numbers that require a clinician (POTS sodium, CKD potassium and phosphorus, dialysis fluid, GDM carbohydrate, cancer-treatment protein, pediatric anything). Without a linked clinician, Tier 2 modules run in education-plus-referral mode or in a reduced "Tier 1 only" mode with a visible notice.

2. Clinician identity and consent. The app needs a way to verify the clinician (at minimum, license number lookup by state), the user's consent to share data with them, and the clinician's acceptance of the role. This is a data-model and legal-terms item.

3. HIPAA. Once a covered entity (the clinician) uses the app to manage a patient's care, you are likely a business associate for that data flow. That means a business associate agreement, HIPAA-grade security, and breach procedures. The consumer-only side may not be HIPAA-covered but is covered by the FTC Health Breach Notification Rule and state privacy laws (California CCPA/CPRA, Washington My Health My Data Act, and others). Phase 3 architecture must be designed for this from the start, not bolted on.

4. Clinical decision support documentation. The 2026 FDA CDS guidance expects clinicians to be able to see the basis for every recommendation. The citation architecture already planned satisfies this; the PRD should include a clinician-facing "why" view.

5. Claims discipline still applies. B1 does not change the consumer-facing wellness posture. The clinician is the one practicing MNT; the app is their instrument. Marketing to consumers stays in wellness language; marketing to clinicians can describe MNT support.

6. Revenue and adoption. B1 opens a second customer (clinicians) and a possible reimbursement story later, and it makes RD recruitment for content review easier because RDs become users. It also means two onboarding flows and two support burdens. The PRD will size that.

## OPEN ITEMS I AM ASSUMING UNLESS YOU SAY OTHERWISE
- No RD relationship exists yet. The PRD will include RD recruitment (content reviewer at minimum) as a pre-launch dependency, plus OB and pediatric review for D1 and D10.
- Monash FODMAP licensing is deferred; the v1 IBS module will be built from published FODMAP studies and USDA data with a plain statement that it is not Monash-verified, and the PRD will note the licensing option.

---

# STAGE NOTE (September 5, 2026)

The owner clarified that this is a personal wellness tool for the owner and a few family members, not a commercial product, with no RD involved. What that changes in this document:

- Part E (regulatory options) and the B1 implications section are Stage 2 reference material. Nothing in them is a v1 task. Keep them; if the app ever goes commercial, they are the starting point.
- The RD, OB, and pediatric content reviews are no longer pre-launch dependencies. The substitute is the owner's own review plus the citation trail on every rule, so a person's own clinician can check what the app is doing.
- The two-tier rule stays exactly as written, because it is a safety rule, not a legal one. Family members' clinicians provide Tier 2 numbers; the app enforces them and never invents them.
- The eating-disorder screen stays. The owner is the right person to write its language.
- Monash FODMAP licensing is moot for personal use; the IBS module is built from published studies and USDA data with a plain "not Monash-verified" note.
- The evidence sections (Parts A through D and both addenda) are unchanged. The bar for what goes in the app does not drop because the audience is family.
