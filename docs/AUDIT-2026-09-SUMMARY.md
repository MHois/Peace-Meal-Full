# September 2026 audit: what changed and what is left for the owner

Seven phases, finished September 30, 2026. Nothing was deleted, and the README's safety rules and sources policy are unchanged. During the seven phases no food was moved between an approved list and an avoid list; the owner's answers on September 30 moved some, following the SIGHI leaflet (questions 8 and 9). Clinical changes and their sources are in `docs/VERIFY-log.md` (rows A1 to A34). On September 30 the owner asked for every open question to be decided the way a physician and nutrition specialist would, and for personal details to stay out of the repository; the answers and what they changed are at the end of this report.

## What changed, in plain words

**Phase 1, safety.** Anything the app does not recognize is never a pass while a condition, allergy, or limit is on file; the lite build says "Not sure. Ask before eating." The label checker now uses the strict low FODMAP and low histamine lists too, and the histamine list's "leave out" foods (leftovers, stock cubes, and others) are checked before the approved foods, so "leftover roast chicken" is no longer approved as chicken. Test people are made up.

**Phase 2, rules.** Stock, broth, bouillon, and gravy mixes ask for a gluten label check. On a low histamine plan, shop stocks are not approved; only a quick homemade stock is (since September 30, only a quick homemade vegetable stock). Jarred and brined foods count like vinegar. The tomato swap says fresh-roasted pepper.

**Phase 3, phone data safety and lite.** A one-time Add to Home Screen guide when the app runs in a Safari tab, with a way to bring data from the tab into the home-screen app using the backup file. A clear message when a save fails. A monthly backup reminder. The lite and full builds keep separate storage, moved over once, checked, with the old copy left in place. Lite Today: big Remove buttons with a 10-second Undo, symptoms for "Earlier today" or "Yesterday", "Feeling fine" once a day, large text on by default.

**Phase 4, technical.** The app opens from its stored copy first and says "Update ready, tap to reload" when a new version is waiting. Every outside file the photo reader loads is pinned with an integrity hash; Google Fonts could not be, and was flagged. (Since September 30 the fonts ship inside the app and nothing is requested from Google.)

**Phase 5, clinical content.** Low FODMAP portions show on recipes and labels, and two or more "small serve" foods in one meal is a caution. Every low histamine item says what its rating rests on (measured histamine, other amines, proposed liberator, or SIGHI rating only). The lite label check says plainly that the first photo needs Wi-Fi. The full build reads its 2,268 Wikibooks recipes the first time someone searches, which makes launch faster. The medicines-and-food education was drafted for approval (approved and added September 30).

**Phase 6, full build.** Confirmed that a default week never gives a person with a daily limit a recipe without nutrition numbers.

**Phase 7.** Thirty recipes for low FODMAP and low histamine together, switched off until reviewed (reviewed and switched on September 30). A plain-words "why" under every number on the Plan, taken word for word from each condition's own article. A new person sees ten conditions first, then "Show all".

## Tests changed on purpose

- `test/checker.test.mjs`, "hard hit fails; unknown-risk term is caution when allergens are selected". Old: `checkText('water, natural flavors', p, matcher, { allergens: [] }).verdict` equals `'pass'`, where `p` avoids milk as a hard rule. New: the same text is `'pass'` under an empty plan and `'caution'` under `p`. Why: README safety rule 7; a plan that restricts anything no longer lets an ingredient that could hide something pass.
- `test/goals.test.mjs` and `test/household.test.mjs`: new made-up test people (different names, ages, weights, conditions, and allergens). Expected values changed only where the new people's numbers changed them; no assertion was loosened.
- `test/report.test.mjs`: a made-up test person, `'person-a'`, with weights 74 and 73.2 kg, and 82, 79.5, and 77.2 kg. The assertions test the same things (a 0.8 kg change, a loss over 5 percent in six months, a 2.4 percent loss under the threshold, a 10 percent threshold past six months); only the numbers moved.
- `test/audit-2026-09.test.mjs`, "[1] label checker ...". Old: `checkText('apple, pear', ...)` passes for MCAS. New: `'apple, blueberries'` passes, and `'apple, pear'` does not. Why: question 9, pears moved to the leave-out list to match the SIGHI leaflet.
- `test/audit-2026-09.test.mjs`, "[3] MCAS: shop stock ...". Old: a quick or under-30-minute homemade chicken stock is not `'avoid'`. New: both are `'avoid'`, and a quick homemade vegetable stock is approved. Why: question 6, the leaflet makes no homemade exception for meat stock.
- `test/audit-2026-09.test.mjs`, "[12] ...". Old: 13 items unchecked, and banana, lentils, almonds, and black pepper approved. New: three unchecked (chia seeds, sunflower seeds, cinnamon), those four `'avoid'`, and kale, grapes, chestnuts, almond milk, and red bell pepper approved. Why: question 8.
- `test/audit-2026-09.test.mjs`, "[15] the September 2026 set ...". Old: `review_dual` is `false` in a new profile ("off until the owner switches it on"). New: `true`. Why: question 12, the recipes were reviewed and switched on.
- `test/sw.test.mjs`, "root sw.js lists every module, stylesheet, and data file": now also requires the font files (question 14). Stricter, not looser.

## Privacy

The repository holds no personal details. Test people, sample profiles, and examples are made up. Screenshots are not kept (`docs/screenshots/` is in `.gitignore`). What people enter in the app stays in the browser on their own device.

## Lite recipes whose result changed (Peace Meal, NHS, Parent Club, and NHLBI recipes; before the audit, then now)

The same 601 recipes, checked for each made-up test person before the audit and again on September 30, after the owner's answers.

| Test profile | Pass before | Pass now | Changed | What changed |
|---|---|---|---|---|
| Celiac | 297 | 122 | 175 | pass to caution: ingredients the app cannot read, or that could be either kind (a tortilla can be wheat), are no longer a pass; shop stock, broth, gravy, and crisped rice cereal ask for a label check |
| MCAS (low histamine) | 87 | 39 | 48 | pass to caution: ingredients the app cannot read; the list's leave-out foods (stock, leftovers, jarred); and, since question 8 and 9, banana, legumes, most nuts, black pepper, pears, minced meat, green beans, and peas. 65 adapted copies no longer offered |
| Low FODMAP | 61 | 57 | 4 | pass to caution; adapted copies 11 added, 3 dropped (green beans no longer read as GOS beans) |
| Low FODMAP and MCAS | 32 | 26 | 6 | pass to caution, for the same histamine reasons; adapted copies 11 added, 68 dropped |
| High blood pressure | 432 | 172 | 260 | pass to caution: ingredients the app cannot read are no longer a pass while a sodium limit is on file |
| Type 2 diabetes | 262 | 103 | 161 | 160 pass to caution for the same reason; 1 caution to pass (whole-wheat pitas no longer read as refined grain) |
| Milk allergy | 96 | 123 | 30 | 27 caution to pass: stray measurement words ("cup", "sliced") are no longer unknown ingredients, and "sweetcorn" and plain "rice" are recognized; 3 fail to caution: butter beans are not butter |
| No conditions | 601 | 601 | 0 | |

The thirty new recipes, on since September 30, pass for: low FODMAP 30, MCAS 30, both together 30, celiac 26 (the two oat recipes stop unless the oats are certified gluten-free, and the two taco recipes ask for a tortilla label check), milk allergy 15, high blood pressure 17, type 2 diabetes 9, no conditions 30.

## Low histamine items marked "not re-checked": evidence and recommendation

Sources: SIGHI leaflet, version 2021-11-17 (columns read by position), and Sánchez-Pérez 2021 (Nutrients 13:1395), Table 1 and discussion. No rating was changed at the time. **September 30: every recommendation below was applied (question 8; VERIFY-log A18).**

| Item (aliases) | Evidence | Recommendation |
|---|---|---|
| Kale | Leaflet: "All vegetables except the left called (fresh or frozen)" are well tolerated; kale is not on the avoid or risky lists. Not measured by Sánchez-Pérez. | Mark checked. |
| Chard | Same as kale. | Mark checked. |
| Okra | Same as kale. | Mark checked. |
| Bell pepper (red, green, yellow, roasted) | Leaflet: not on the avoid or risky lists, so well tolerated when fresh. Sánchez-Pérez: green peppers can carry relevant putrescine (25 to 150 mg/kg at most, across several vegetables). Jarred peppers are already a leave-out example. | Mark checked for fresh or fresh-roasted peppers. |
| Grapes | Leaflet: fruits not listed to avoid are well tolerated; grapes are not listed. Sánchez-Pérez: no histamine found (10 samples), putrescine 2.69 mg/kg. | Mark checked. |
| Blackberries (cranberries, gooseberries) | Leaflet names blackberries and cranberries as well tolerated; gooseberries are not on the avoid list. | Mark checked. |
| Firm banana | Leaflet lists banana under To avoid, and under other biogenic amines. Sánchez-Pérez: no histamine, but putrescine 37.94 mg/kg. | Move to the leave-out list. |
| Buckwheat | Leaflet: "Buckwheat unpeeled?" is risky; any grain is otherwise well tolerated. | Mark checked, with a note that unpeeled buckwheat is risky. |
| Salmon | Leaflet: fish is well tolerated only absolutely fresh or frozen straight after catch; "fresh fish" from a shop counter is risky; salmon is not one of the scombroid fish it lists. Sánchez-Pérez: fresh oily fish 3.27 mg/kg on average, one fresh salmon sample 111 mg/kg. | Keep, mark checked, and keep the freshness note. |
| Chia seeds (flax, hemp) | The leaflet does not rate seeds. Not measured by Sánchez-Pérez. | Leave as not re-checked; no source settles it. |
| Sunflower seeds (sesame, tahini, pine nuts, almonds, almond butter, pistachios, chestnuts) | Leaflet: nuts to avoid, except macadamias and chestnuts (well tolerated); almond milk well tolerated; seeds not rated. Sánchez-Pérez: nuts, no histamine, putrescine 4.40 mg/kg. | Split it: move almonds, almond butter, pine nuts, and pistachios to the leave-out list; mark chestnuts checked; leave sunflower, sesame, and tahini as not re-checked. |
| Chickpeas (lentils, beans, tofu) | Leaflet lists legumes (lentils, beans, soy, tofu) under To avoid and under other biogenic amines. Sánchez-Pérez: soybeans, no histamine, putrescine 19.07 mg/kg. | Move to the leave-out list. |
| Cinnamon (nutmeg, black pepper) | Leaflet: hot spices to avoid, and names pepper among them (page 4); mild spices well tolerated; cinnamon and nutmeg not rated. | Move black pepper to the leave-out list; leave cinnamon and nutmeg as not re-checked. |

## Where the approved lists and the avoid side disagree

Nothing below was changed at the time. "Flagged" means the app shows a caution anyway, so the disagreement costs a false alarm, not safety. **September 30:** the low FODMAP false alarms are fixed (question 10; A23, A32); the leaflet disagreements are resolved the leaflet's way, with pear, minced meat, rice and oat milk, green beans, peas, and canned corn left out (question 9; A19); distilled white and apple cider vinegar are approved (A20); avocado and shellfish stay out.

**Low FODMAP list against the app's own dictionary (flagged):**
- Green beans, string beans, French beans: approved as a small serve; the dictionary tags them GOS (the list's own note says so).
- Bean sprouts: approved; the dictionary's "bean" entry tags them GOS, a partial-word match.
- Sourdough spelt bread: approved (the long ferment lowers fructan, Varney 2017); the dictionary tags spelt as fructan.
- Lactose-free skim milk: approved; the dictionary tags "skim milk" as lactose.
- Avocado oil: approved as an oil; the dictionary tags "avocado" as sorbitol, a partial-word match.
- Vegetable oil, spices, oyster sauce, homemade vegetable stock: approved; the dictionary treats each as "could hide something".

**Low histamine list against the app's own dictionary (flagged):** tortilla (corn or flour), vegetable oil, mild spices, and quick or homemade vegetable stock are treated as "could hide something".

**Low histamine list against the SIGHI leaflet (not flagged; the list allows them):**
- Pear: the leaflet lists pears under To avoid.
- Ground beef, beef mince, ground turkey, turkey mince, lamb mince: the leaflet rates finely chopped meat to avoid and prepacked minced meat risky.
- Rice milk and oat milk: risky in the leaflet.
- Green beans and peas: "possibly" risky in the leaflet.
- Canned corn: risky in the leaflet.
- The 13 items above.

**Low histamine leave-out examples against the evidence (the app is stricter than the source):**
- Vinegar: the leaflet lists wine and balsamic vinegar to avoid, but distilled white (spirit) vinegar and apple cider vinegar as well tolerated.
- Avocado and shellfish: Sánchez-Pérez found no histamine in either; the leaflet lists avocado among histamine-containing foods, and seafood as a proposed liberator.

## Thirty new recipes (collection "Peace Meal recipes for low FODMAP and low histamine together"; off by default until September 30, now on)

Breakfasts: Ginger rice porridge with a sliced egg; Creamy polenta with maple and blueberries; Quinoa porridge with blueberries and pumpkin seeds; Zucchini and chive baked egg cups; Parsnip and potato hash with fried eggs; Melon and mint bowl with macadamias; Rice flour crêpes with warm blueberries; Blueberry baked oats; Cardamom millet porridge with pumpkin seeds; Pumpkin and maple oatmeal; Egg and potato breakfast tacos; Quinoa, egg, and cucumber breakfast bowl with dill; Fresh mozzarella and basil omelette; Coconut rice with maple and cantaloupe; Cornmeal and blueberry pancakes.

Dinners: Thyme pork chops with roasted parsnips and carrots; Chicken, bok choy, and ginger rice noodles; Herb-crusted haddock with crushed potatoes; Lamb and mint skewers with cucumber rice; Seared steak with pumpkin mash and buttered cabbage; Gluten-free pasta with chicken, zucchini, and basil; Pan-fried trout with fennel and potatoes; Chicken, broccoli, and rice bake with mozzarella; Sesame ginger pork with cabbage and rice; Cod and potato fish cakes with dill and cucumber salad; Soft polenta with zucchini, basil, and fresh mozzarella; Tilapia tacos with red cabbage and cilantro slaw; Rosemary chicken thighs with turnip and carrot mash; Halibut in coconut and turmeric sauce with rice; Paprika pollock with roasted potatoes and green salad.

No recipe was dropped for a missing food: every food needed was already in `data/foods.json`. September 30: reviewed; the six fish recipes start with a freshness step (very fresh fish, or frozen right after the catch and thawed quickly just before cooking) and the steak recipe asks for fresh steak, not dry-aged, both from the SIGHI leaflet (A24). The collection is on by default, and profiles saved earlier are switched on once; turning it off in Settings sticks.

## File sizes and launch time

| Build | Before the audit | Now |
|---|---|---|
| Full, `dist/nutrition-app.html` | 11,131,833 bytes | 11,595,018 bytes |
| Lite, `dist/peace-meal-lite.html` | 4,876,350 bytes | 5,339,217 bytes |

About 0.27 MB of each increase is the two fonts, which ship inside the file since September 30 (question 14).

Reading the Wikibooks recipes on the first search did not change the full file's size (the recipes are still inside it, 5 KB larger from escaping), but in desktop Chromium the first screen appeared in 645 ms instead of 821 ms (median of 9 cold starts) and memory after launch fell from 37.5 MB to 25.0 MB. Phones are slower, so the saving there is larger in seconds. Reading the recipes when needed takes about 14 ms.

Bundling instead of downloading, if wanted later: the photo reader's pinned files are 11,020,226 bytes with both recognition cores (7,081,949 with the fast one only, which older iPhones cannot run). Inlined as text they grow by a third, about 14.7 MB, which would take the lite file from about 5.0 MB to about 19.7 MB. The Google fonts are 198,972 bytes (about 0.27 MB inlined); they were bundled on September 30. The photo reader was not.

## The nine open VERIFY items: evidence and recommendation

No item was closed and no rule was changed at the time. Citations below were checked against PubMed or Crossref; quotes are from the full text unless marked. **September 30 (question 13):** every recommendation was applied, as each item's last line says; all nine are now closed; item 1 was closed once PubMed confirmed no new ADA report exists (A36).

**1. ADA nutrition consensus report "expected 2026" (type 2 diabetes education).** The app says a new report is "reportedly expected in 2026 (VERIFY; seen in secondary commentary only)". PubMed shows no successor: the only ADA nutrition therapy consensus report in Diabetes Care is Evert AB et al., 2019 (PMID 31000505). The 2026 Standards of Care, Section 5 (Diabetes Care 2026;49(Suppl 1):S89-S131, doi:10.2337/dc26-S005), still refers readers to "the ADA consensus report on nutrition therapy". An award lecture by the same lead author (Diabetes, Obesity, and Cardiometabolic CARE 2026;1(2):176-183, doi:10.2337/doci25-0002) reportedly says a writing group is updating it for 2026; that text could not be opened, so it is not confirmed. Recommendation: **change** the line to say that as of September 2026 no successor has been published and the 2026 Standards still point to the 2019 report; keep the item open until a new report appears. **Done:** wording changed (A25); flag cleared later the same day after a fresh PubMed search found no successor (A36).

**2. "2021 J Hand Surg" vitamin C and CRPS meta-analysis.** No such paper exists in any Journal of Hand Surgery. The details the app gives (500 mg a day for about 50 days after wrist, foot, or ankle fracture or surgery) match Seth I, Bulloch G, Seth N, et al. Effect of Perioperative Vitamin C on the Incidence of Complex Regional Pain Syndrome: A Systematic Review and Meta-Analysis. J Foot Ankle Surg 2022;61(4):748-754 (online November 2021), doi:10.1053/j.jfas.2021.11.008, PMID 34961681. Its conclusion: "vitamin C was associated with a decreased rate of CRPS-1 than placebo" (odds ratio 0.33), with no difference in complications, function, or pain. The CRPS module was removed on September 9, and no rule cites this source any more. Recommendation: **change** the source to the Seth citation (or mark it unused and leave it, since nothing cites it); the item is moot for the app as it stands. **Done:** citation corrected; the entry stays, cited by nothing (A25).

**3. GLP-1 protein range 1.2 to 1.6 g/kg/day (weight management).** The advisory is Mozaffarian D, et al. Nutritional priorities to support GLP-1 therapy for obesity. Am J Clin Nutr 2025;122(1):344-367, doi:10.1016/j.ajcnut.2025.04.023, PMID 40450457 (with a 2026 corrigendum). Its text: "Higher targets, such as 1.2–1.6 g/kg/d, have also been proposed during active weight reduction", citing other papers; it adds that for people with obesity it is unclear whether goals should use actual or adjusted weight, and "setting an absolute protein target of 80–120 g/d ... may enhance adherence while ensuring adequate intake." So the range is real but is reported, not recommended, by the advisory, and the app multiplies it by actual body weight, which the advisory warns can overestimate needs (the article's example gives 110 to 145 g a day; the advisory's own figure is 80 to 120 g a day). Recommendation: **change** the rule and article wording to say the range "has been proposed" and to give 80 to 120 g a day as the advisory's alternative; the owner decides whether the app should keep computing grams from actual weight. **Done:** the rule is now 80 to 120 g a day, not per kilogram of actual weight (A26).

**4. Academy vegetarian position paper replacement.** Published: Raj S, Guest NS, Landry MJ, Mangels AR, Pawlak R, Rozga M. Vegetarian Dietary Patterns for Adults: A Position Paper of the Academy of Nutrition and Dietetics. J Acad Nutr Diet 2025;125(6):831-846.e2, doi:10.1016/j.jand.2025.02.002, PMID 39923894 (a corrected version was republished in 2026). It covers adults who are not pregnant or breastfeeding and is in effect until December 31, 2032; the 2016 paper the app cites was in effect until December 31, 2021. It lists vitamin B12, iodine, iron, choline, and vitamin D as nutrients of concern, and says planned vegetarian and vegan diets "can be nutritionally adequate". Recommendation: **change**: add the 2025 paper, move the adult rules onto it after checking them against it (the app lists zinc and omega-3 but not choline, and says "nutritionally complete"), and decide what covers pregnancy and children, which only the expired 2016 paper addressed. **Done:** the 2025 paper is the first source on every vegetarian rule, choline is added, and anyone pregnant or breastfeeding sees a reminder to get a plan from their doctor or dietitian, since no current Academy paper covers them (A27). The app is for adults, so children do not arise.

**5. SCOFF questionnaire licensing.** The app's five questions (`src/engine/screen.js`) are not shown anywhere since the eating-disorder screen was removed on September 9. The published items (Morgan JF, Reid F, Lacey JH. BMJ 1999;319:1467-1468, doi:10.1136/bmj.319.7223.1467; the authors' US reprint is West J Med 2000;172:164-165, doi:10.1136/ewjm.172.3.164) ask about losing "more than One stone in a 3 month period", "One stone (14 lb)" in the US reprint; the app's "more than 14 pounds in a three-month period" is not a published wording. The BMJ article carries a 1999 BMJ copyright; BMJ grants permissions through RightsLink; no licence statement from the authors or a major body was found, and a 2024 paper by the authors (Eat Weight Disord 2024;29:29) says a modified version needs "some evidence of validation". The app's source entry calls it "public domain per Phase 1", which nothing found supports. Recommendation: **change** the source to the full BMJ citation and drop "public domain"; if the screen ever returns, use a published wording exactly and ask BMJ for permission first. Moot while the screen is off. (The item wording was read from the article on PubMed Central by the research helper; the citation records were confirmed on PubMed.) **Done** (A28).

**6. ACOG Practice Bulletin 190 (gestational diabetes).** Current, not replaced: ACOG lists Practice Bulletin No. 190 (February 2018) as reaffirmed in 2026, with a July 2024 Clinical Practice Update on screening (Obstet Gynecol 2024;144(1):e20-e23, doi:10.1097/AOG.0000000000005612, confirmed on Crossref) that "updates Practice Bulletin No. 190" for screening and diagnosis only. The app states no screening criteria, so the update is not needed as a source. Recommendation: **change** the citation to "ACOG Practice Bulletin No. 190: Gestational Diabetes Mellitus. Obstet Gynecol 2018;131:e49-e64. Reaffirmed 2026." and clear the "may have been superseded" line. The bulletin's own text could not be opened, so the four rules that cite it were not re-read against it. **Done** (A29).

**7. Academy 2014 pregnancy position paper.** Not current: the Academy's list of current positions (16, read September 29, 2026) has none on pregnancy, and the Academy says an expired position "should not be cited as current". No replacement was found on PubMed. No rule cites it; it is listed among the pregnancy module's sources. Recommendation: **change**: drop it from the module's sources or relabel it "not a current Academy position". Its own expiry date could not be confirmed. **Done:** relabeled, kept for the record (A29).

**8. FDA January 2025 tree nut list (coconut, chestnut).** FDA's Questions and Answers Regarding Food Allergens, Edition 5 (January 2025; 90 FR 1133) keeps 12 tree nuts (almond, black walnut, Brazil nut, California walnut, cashew, filbert or hazelnut, heartnut or Japanese walnut, macadamia or bush nut, pecan, pine nut, pistachio, walnut). FDA's FAQ: "No, coconut is no longer listed in the Tree Nut List (Table 1) in the 5th edition"; also removed are beech nut, butternut, chestnut, chinquapin, cola or kola nut, ginkgo nut, hickory nut, palm nut, pili nut, shea nut, and lychee nut. Labels change over a transition period. The app still tags coconut and chestnut as tree nut, on purpose, with a VERIFY note. Recommendation: **close** the question (FDA removed both) and **change** the notes to quote FDA. Keeping the conservative tag is the owner's choice: the FDA list is about labels, not about who reacts. Two gaps found: the coconut tag also lands on coconut sugar, water, aminos, oil, and flour; and heartnut, which is on FDA's list, is not in the dictionary. **Done:** notes quote FDA; coconut (every coconut product) and chestnut keep the tree nut tag on purpose; heartnut added; the allergy step says so (A30).

**9. National Alliance for Eating Disorders helpline.** The Alliance's own site: "CALL OUR FREE HELPLINE TODAY — +1 (866) 662-1235"; "Our free helpline is run by licensed therapists who specialize in eating disorders"; hours 9:00 am to 7:00 pm Eastern, Monday to Friday; treatment finder findEDhelp.com. The app's entry (`src/engine/screen.js`) gives no number and still says to confirm it; that text is not shown anywhere since the eating-disorder screen was removed. The 988 wording on the Breathe page is current (988 is available 24/7 by call, text, or chat). Recommendation: **change** the entry to the number, hours, and finder above, and pair it with 988 for crises, since the Alliance line runs weekday daytime hours only. **Done** (A31).

## Questions for the owner, and the answers (September 30, 2026)

The owner asked for each question to be decided the way a physician and nutrition specialist would. Each clinical decision rests on the source named in `docs/VERIFY-log.md`; where no source settles a point, the app takes the safer option.

1. **Medicines and food.** Approve the education drafted in `docs/DRAFT-medication-food-education.md`? **Approved and added**, as the module's education and a new article, with the corrections questions 2 and 4 required (A13).
2. **Limes.** Add limes to the grapefruit interaction list? **Yes.** Lime, lime juice and zest, limeade, and marmalade carry the grapefruit tag; the rule now says sweet oranges such as navel or Valencia are fine, not "other citrus is fine" (A15).
3. **Warfarin source.** **Kept Holbrook 2005 and added Violi 2016 first**; it supports "keep vitamin K steady, not low". The warfarin evidence rating is moderate (A14).
4. **Levothyroxine timing.** **Changed** to the ATA guideline's own wording everywhere: 60 minutes before breakfast, or at bedtime 3 or more hours after eating; calcium and iron supplements about 4 hours apart, which the guideline calls traditional but untested. The thyroid article no longer claims the app moves meals on the clock (A16).
5. **Recipes without nutrition numbers.** **Blocked** for anyone with a daily limit, and for a shared meal where anyone at the table has one, even when hearted or with "Also use recipes that have no nutrition numbers" on; the switch says so. A person can still pick one by hand.
6. **Quick homemade stock.** **Dropped for meat and fish stock**: the SIGHI leaflet makes no homemade exception. A quick homemade vegetable stock still counts as water (A17).
7. **Small serves.** Set amounts ("ten nuts") **keep their note but do not count** toward the low FODMAP caution, because Monash sets its cut-offs to allow for combining ordinary serves in one meal. The low histamine list shows its limited amounts as notes. Today and lite Today **warn** when two or more small-serve foods are logged for the same meal (A22).
8. **The 13 unchecked histamine items.** **Accepted**: eight checked, chestnuts their own item; banana, most nuts, legumes and soy, and black pepper moved to the leave-out list; chia, sunflower, and cinnamon stay unchecked because no source rates them (A18).
9. **Other histamine disagreements.** **Resolved the leaflet's way**: pear, minced meat, rice and oat milk, green beans, peas, and canned corn left out; distilled white and apple cider vinegar approved; avocado and shellfish stay out, because the leaflet lists them and one measurement study does not overrule a clinical list. Nine Peace Meal recipes follow suit (A19 to A21).
10. **Dictionary false alarms.** **Fixed**, plus plain "rice" and "sweetcorn" recognized and light cream no longer tagged coffee (A23). A deeper cause turned up while testing item 8: the dictionary's "except" phrases did not match plurals, although its own notes say they do, so "butter beans" read as milk, "water chestnuts" as tree nut, and "salmon steaks" as red meat. Fixed in the matcher; every change was checked (A32). One of my own question 10 fixes needed a correction: once plain "rice" was recognized, crisped rice cereal, rice pilaf and rice mixes, fried rice, and vermicelli (often wheat) read as plain rice, so a celiac plan passed them. Caught while re-checking these numbers and fixed the same day: they ask for a label check again (A33).
11. **Conditions step.** **Kept** the ten-first view for a new person only. The ten are now conditions common in adults where food does much of the work (high blood pressure, high cholesterol, weight, type 2 diabetes, fatty liver, reflux, kidney disease) and three where the diet is the treatment (IBS on low FODMAP, lactose intolerance, celiac disease). Mast cell activation and the rest are under "Show all" and in search. It is a layout choice, not a clinical ranking.
12. **Thirty new recipes.** **Reviewed and switched on.** All thirty pass both strict checks; the six fish recipes and the steak recipe gained a freshness first step (A24). Profiles saved earlier are switched on once.
13. **VERIFY items 1 to 9.** **Applied** as described above; eight closed at first, and item 1 closed later the same day once PubMed confirmed no new ADA report exists (A36). Item 3: **no**, protein is no longer computed from actual weight; it is the advisory's 80 to 120 g a day (A26). Item 4: nothing current covers vegetarian pregnancy or breastfeeding, so those users get a reminder to see their doctor or dietitian, not rules (A27); children cannot use the vegetarian module, since the app is for adults. Item 8: **keep** the tree nut tag on coconut and chestnut, **and yes**, on every coconut product including sugar, water, and oil. The tag is a hard stop, and the app has no hard way for one person to add a single food, so dropping it would leave anyone who reacts to coconut with only a soft caution. The allergy step says so and points to the allergist (A30).
14. **Outside files.** **Fonts bundled** (about 0.27 MB; no request to Google, works offline from the first launch). **Photo reader not bundled**: it would take the lite file from about 5 MB to about 20 MB, slowing every launch on a phone, for a feature used only when reading a label photo; it stays a pinned download, checked by integrity hash, the first time it is used.
15. **Unused source.** **Fixed and kept**: `vitamin-c-crps-2021` now carries the real citation (Seth 2022, J Foot Ankle Surg) and is cited by nothing (A25).
16. **Personal details.** **Removed.** The repository keeps none; see "Privacy" above.

## Corrections found in the final review (September 30)

- **Screening claims.** The GLP-1 and PCOS rules said the app screens for eating disorders (SCOFF) before any weight-focused feature, and the low-carb rule, education, and article said the app asks about pancreatitis, rare metabolic disorders, and disordered eating before starting. The screen was removed on September 9, and the app never asked about pancreatitis or metabolic disorders. Each text now says to check with the clinician and names what the app does ask. The low-carb article also said the app "requires clinician sign-off before turning the pattern on"; it shows a warning and does not block, and now says so. No rule, number, or source changed (A34). A test keeps the old wording from coming back.
- **iPhone guides.** The full guide said the lite and full apps share saved information on one phone; they have kept separate storage since Phase 3. Fixed. Both guides point to the current web address.
- **Hosting.** The website publishes only a front page and the two finished apps, at `/full/` and `/lite/`. Docs, tests, tools, and source files are not published, and the build does not upload a downloadable copy of the app.
- **Offline copies.** The full and lite apps share one web address, so they share one set of browser caches, and each app's update deleted every cache but its own, including the other app's offline copy. Each app now names its caches after itself and clears only its own old versions (`tools/bundle.mjs`; a new test in `test/sw.test.mjs` runs both workers against one cache store).
- **Welcome screens.** They said 42 conditions and 3,600 recipes. The Conditions step offers 38, now counted from the data, and the collections on by default hold about 2,900 recipes (a new test compares the number with the data).

## Changes after the site went live (September 30)

At the owner's request, after using the live app:

- **Other allergies.** The Allergies step has a box for foods outside the nine major allergens (kiwi, mustard, buckwheat). Each is a hard stop like the nine: "Not allowed" on labels, foods, and recipes, never planned, kept at shared household meals and in shared profiles, and listed on the Plan and in the report. Having any also turns "spices", "natural flavors", and unrecognized text into a caution, because US labels may declare a spice or flavor only as "spice" or "natural flavor". Matching is broad: any ingredient containing the word counts, except that a word of three letters or fewer must start a word. This makes the food-allergies rule `allergen-custom` true (A37).
- **Logging a meal.** Tapping a food or recipe after "+ Add" did nothing: the search sheet's close queued a browser "back" that closed the amount sheet as soon as it opened. Fixed. A common search word ("banana", "apple", "rice", "egg", "chicken") also filled all forty results with recipes, so the plain food could not be found; foods and recipes are now listed in their own groups, closest match first.
- **Part of a recipe.** The amount sheet for a recipe has "Ate only part of it? Pick the parts". A part the recipe links to a food is logged as that food, with its share of the servings eaten, so its numbers come from the food data and add up item by item. A part written only as text has a Find button that searches the food list; nothing is estimated from text. The lite app has "Only part of it" next to "I ate this".
- **History.** Today (full and lite) has a Weight history button (every weight, newest first, the change from the one before, delete) and a food and symptom history (30 days at a time, newest first).
- **Setup steps.** The step names wrap onto more lines, so every step shows on a phone; before, steps 3 to 7 sat off the edge with no sign they were there.
- **Conditions step.** All 38 conditions and ways of eating are on the page for a new person: the ten common ones first, then every other one, already open. The "Show all" button is gone.
- **Mediterranean.** Renamed "Mediterranean diet (anti-inflammatory)"; searching either word finds it. It was already the app's anti-inflammatory diet under the name "Anti-inflammatory (Mediterranean-style)".
- **VERIFY.** Every flag is checked and cleared (A35, A36), and the app no longer asks readers to check sources: that is the maintainer's job.
- **Home Screen guide.** The iPhone steps start with the three dots at the bottom of Safari, then Share (at the top on an iPad). Android steps (Chrome, and Samsung Internet) are added, and the guide now shows in an Android browser too. The front page and both Word guides say the same.

Tests changed on purpose in this round:
- `test/owner-answers-2026-09.test.mjs`, "[13] item 1". Old: the ADA source's `verify` is `true` ("the item stays open"). New: `false`, with a note that cites the 2019 report's PubMed number. Why: the statement is a checked, dated fact (A36).
- `test/owner-answers-2026-09.test.mjs`, "[11]": the test name and one message say the rarer conditions are listed below the ten instead of under Show all. The assertions are unchanged.

New tests: `test/owner-requests-2026-09-30.test.mjs` (14), and one more in `test/sw.test.mjs` (the two offline copies).

## Still open

- **Coconut for a cleared person.** A tree nut allergy also blocks coconut, even when an allergist has cleared it. Relaxing that per person would touch the same safety rule; not built.
- **ACOG Practice Bulletin 190.** Current, but its text could not be opened, so the four gestational diabetes rules citing it were not re-read against it.
- **SCOFF.** If the eating-disorder screen ever returns, get permission from BMJ and use a published wording exactly.
- **Food database gaps that predate the audit.** The food list has no "check the label" option, so "Snacks, crisped rice bar" and "Rice mix, cheese flavor" carry no gluten tag and pass for celiac on the Check and Log screens. They are not in any recipe. Plain "puffed rice" and "rice cakes" also pass; most are gluten-free, but flavored ones can contain barley malt.
- **Small things left as they are (all flag too much, never too little):** the gastroparesis "bezoar risk" tag lands on every coconut product, including coconut oil and sugar, which have no fiber; "chestnut flour" also reads as wheat flour; caraway, fenugreek, and anise seeds and shirataki noodles are not recognized and read "Not sure".
