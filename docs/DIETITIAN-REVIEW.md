# Content and usability review

Written September 9, 2026, in the role of a doctoral-level clinical dietitian reviewing the app's content and flow. Items are ranked by how much they change what a family member actually eats. "Done" means built in this wave; "Recommend" means a decision for the owner.

## 1. Content: what is right, what is missing, what to change

### Right, keep
- Anchoring every rule to a society guideline or trial and showing the evidence rating is the single most valuable thing in this app. Most consumer apps do not do it.
- The two-tier rule (guideline numbers the app applies; therapeutic numbers only a clinician sets) is correct practice and matches how MNT is delivered.
- Allergens as absolute, unknown ingredients never counted as safe, no language model in the safety path.
- Time-limited elimination protocols with reintroduction prompts. Most FODMAP failures in practice are people who never reintroduce.

### Missing conditions with moderate or strong evidence (Q3)
Added this wave because they clear the bar:
- **Rheumatoid arthritis**: moderate. The 2022 ACR integrative-interventions guideline conditionally recommends a Mediterranean-style diet (low-certainty evidence) and conditionally recommends against other named diets and against supplements. That is the honest ceiling; the app says so. (Question asked directly: yes, moderate; added.)
- **Chronic constipation**: moderate. Fiber and psyllium (AGA-ACG 2023), two green kiwifruit a day (2023 multicenter RCT).
- **Osteoarthritis of knee and hip**: strong for weight loss in overweight (ACR/AF 2019 strong recommendation; IDEA trial), limited for diet composition.
- **Type 1 diabetes**: strong for carbohydrate counting (DAFNE, ADA). The app shows carbohydrate grams and never doses insulin.
- **Diverticular disease**: moderate for fiber after recovery; strong that nuts and seeds need not be avoided.

Considered and not added, with the reason:
- **Eosinophilic esophagitis**: moderate evidence for a six-food or dairy elimination, but it is a gastroenterologist-run protocol with endoscopy at each step. Education only if ever.
- **Kidney stones other than calcium oxalate**, **chronic pancreatitis**, **gallstones**, **hemochromatosis**, **menopause symptoms**: limited or highly individualized.
- **Prediabetes** and **metabolic syndrome** are covered by the type 2 diabetes and heart-healthy modules.
- **Coronary disease after a heart attack or stent**: the heart-healthy module already applies the secondary-prevention pattern; a separate module would duplicate it.

### Patterns worth adding (Q6)
Added: **DASH** as its own selectable pattern, **Portfolio diet** (moderate, LDL), **time-restricted eating** (moderate, no better than calorie restriction; pregnancy and insulin cautions), **pescatarian** as a variant.
Not added: MIND diet (the 2023 randomized trial found no cognitive benefit over a control diet with the same mild calorie restriction), Nordic diet (limited data outside Scandinavia), "clean eating", alkaline, paleo, Whole30, carnivore (no guideline support; some carry harm).

### Removed at the owner's direction (Q2)
Migraine, CRPS, POTS, non-celiac gluten-free, and the eating-disorder screen. One professional note for the record: the GLP-1 and PCOS guidelines both ask for screening before weight-focused advice. With the screen gone, the calorie-target feature has no gate. The Today screen therefore keeps the calorie target off by default, requires a deliberate choice to turn it on, floors it at 1,200 kcal, and words it as an estimate. If a family member has any history of disordered eating, leave the target off for them.

### Wording and numbers to change
- "Restriction load" is jargon (Q9). It now reads "Stacked restrictions" and explains itself: it counts diets that each cut out whole food groups (low FODMAP, low histamine, ketogenic, time-restricted eating, dairy-free by preference) and warns when three or more run at once, because together they make fiber, calcium, protein and variety hard to reach. It is an information notice, not a block.
- Fiber targets should show as a range with the person's own number (14 g per 1,000 kcal) once a calorie target exists. Done in the engine; the Plan shows both.
- Potassium for hypertension (3,500 to 5,000 mg) should carry the medication caveat next to the number, not only in the medication step. Done.
- Sodium limits for heart failure should never drop to 1,500 mg. The content already holds at 2,300; keep it that way.

## 2. Usability: making it something a 75-year-old will use

Principle: one question per screen, big words, big buttons, a default that is good enough, and a way to skip.

Done this wave:
- Weight in pounds, height in feet and inches.
- The cooking questions rebuilt as three short screens with large buttons and a "Use typical answers" shortcut (Q8).
- A clear finish: "Save and see my plan" at the end, and Edit buttons on each person that jump straight to any step, so nobody repeats the whole questionnaire to change one thing (Q10).
- Articles with the main points first, then the detail, then links and references (Q4).
- The Today screen: calories, meals, favorites, weight, exercise (Q12).
- Cooking for more people on a given day, guests, and shared profiles (Q13).
- Grocery editing while shopping, with a red change log that says what changed and why (Q16).
- "What can I make with what I have" (Q18).

Recommend next:
- Read-aloud and a large-text setting. The CSS is built on relative units, so a single "Large text" toggle is a small change.
- A printable one-page plan. Older relatives keep paper on the fridge.
- A weekly check-in message ("How did the week go?") that opens the log. Habit, not analytics.
- Trim the Conditions step for a new user: show the ten most common first, with "Show all 42" underneath.
- Every number on the Plan should have a one-line "why" in plain words above the citation, not only the rule text.

## 3. Things an LLM can and cannot do here (Q15)
An LLM is useful for turning "I'm on the Whole30" into a draft: a summary and a proposed list of foods to avoid. It is not a source, so the app labels that draft as Claude's general knowledge, shows it to the person, and saves nothing until they confirm or edit it. The deterministic engine then applies what they saved. That assist exists only in the claude.ai version of the app (it uses the viewer's own Claude); the single-file version has the same manual builder without the assist. Neither version lets an LLM touch allergen checking or nutrient math.

## 4. Symptoms list (Q14)
The log now covers: bloating, gas, stomach pain, nausea, heartburn or reflux, diarrhea, constipation, headache, flushing or hives, itching or rash, mouth or throat itch, fatigue or brain fog, joint pain, dizziness or racing heart, poor sleep, mood. That covers the reactions people report after eating across GI, histamine, allergy, and autonomic patterns without pretending to be a diagnostic instrument.

## 5. Budget and exports (Q17)
- "Save money: reuse ingredients across the week" is a planner setting that rewards recipes sharing ingredients with meals already chosen, so the list has fewer distinct items. The app has no price data; that is the honest limit.
- Google Keep has no public API for third-party apps. Skylight has no public API either. The reliable path is the phone's share sheet (Share button sends the list to Keep, Notes, Messages, email) and a calendar file (.ics) that Google Calendar and Skylight both import. Both are built.

## 6. Food database (Q11)
The first build carried 496 hand-picked foods. That was deliberate: every entry was tagged by hand. This wave expands it to about 2,000 by pulling whole USDA categories (every spice and herb, produce raw and cooked, dairy, meats, fish, grains, common packaged staples), with tags assigned by the same dictionary the checker uses plus category rules, and a review list for anything ambiguous. The full USDA legacy set is about 7,800 entries; most of the rest are restaurant items, brand products, and cuts nobody buys.
