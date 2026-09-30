# Draft for review: medicines and food, plain-language education

Status: **approved and added, September 30, 2026** (owner questions 1 to 4). The education is in `data/conditions.json` (`medication-food-interactions`), the article in `data/articles.json`, and the changes and their sources are rows A13 to A16 of `docs/VERIFY-log.md`. Answers to the questions at the end of this page: 1, approved with small edits (sweet oranges are fine; levothyroxine wording matches the guideline); 2, limes added, and marmalade, since the source names Seville oranges in marmalade; 3, Violi 2016 added and Holbrook 2005 kept; 4, the guideline's numbers are used everywhere. This page is kept as the record of the draft.

Education only. No doses, no timing that a prescriber has not set, and every part sends the reader to their doctor or pharmacist. Every sentence below rests on the passage quoted under it.

## Proposed `education.plain` for the module `medication-food-interactions`

> A few common medicines react with food. If you take warfarin, keep the amount of leafy greens and other vitamin K foods about the same from week to week rather than cutting them out, and tell the clinic that checks your INR before a big change in how you eat. If a pharmacist or doctor has told you to avoid grapefruit with one of your medicines, that includes grapefruit juice, Seville oranges, pomelos, and limes, and spacing them hours apart does not fix it. If you take levothyroxine, take it the same way every day, on an empty stomach, apart from food, coffee, and calcium or iron supplements, as your prescriber told you. Your doctor or pharmacist knows your medicines; ask them before you change anything.

The draft names limes because the cited review does (see the grapefruit section). The app's current rule says "Other citrus is fine" and the dictionary does not flag limes. See question 2.

## Proposed article sections

### Warfarin and vitamin K: steady, not low

Vitamin K helps blood clot, and warfarin works against it. For years people on warfarin were told to avoid leafy greens. A systematic review found that cutting vitamin K does not make warfarin work better; what matters is keeping the amount steady, so the dose your clinic sets keeps matching what you eat. Big swings in either direction, like starting a green-smoothie habit or stopping salads, can move your INR. Tell the clinic that manages your INR before a big change in diet or a new supplement.

- Source: Violi F, Lip GY, Pignatelli P, Pastori D. Interaction between dietary vitamin K intake and anticoagulation by vitamin K antagonists: is it really true? A systematic review. Medicine (Baltimore) 2016;95(10):e2895. doi:10.1097/MD.0000000000002895 (PMID 26962786, open access PMC4998867). Proposed new source id `violi-2016`; fits the sources policy (systematic review).
- Supporting passage (abstract): "The available evidence does not support current advice to modify dietary habits when starting therapy with VKAs. Restriction of dietary vitamin K intake does not seem to be a valid strategy to improve anticoagulation quality with VKAs. It would be, perhaps, more relevant to maintain stable dietary habit, avoiding wide changes in the intake of vitamin K."
- The module's current warfarin rule cites Holbrook 2005 (`holbrook-2005`). Its abstract is about drug interactions in general and does not mention vitamin K consistency; the full text is not open access, so it was not read for this draft. See question 3.

### Grapefruit and medicines cleared by CYP3A4

Grapefruit contains natural chemicals (furanocoumarins) that switch off an enzyme in the gut wall, CYP3A4, which normally breaks down some medicines before they reach the blood. With the enzyme switched off, more of the medicine gets in, and the dose acts like a bigger one. The enzyme stays off until the body makes new enzyme, so the effect lasts well into the next day: taking the medicine and the grapefruit hours apart does not fix it. Fresh fruit, juice, and frozen concentrate all do it, and so do Seville oranges (often in marmalade), limes, and pomelos. Only some medicines are affected. Your pharmacist can tell you whether yours is one of them.

- Source: Bailey DG, Dresser G, Arnold JMO. Grapefruit-medication interactions: forbidden fruit or avoidable consequences? CMAJ 2013;185(4):309-316 (`bailey-2013`, already in the app).
- Supporting passages (full text, cmaj.ca): "Furanocoumarins are metabolized by CYP3A4 to reactive intermediates that bond covalently to the active site of the enzyme, causing irreversible inactivation (mechanism-based inhibition). Consequently, CYP3A4 activity in the small intestine is impaired until de novo synthesis returns the enzyme to its previous level." "Because these chemicals are innate to grapefruit, all forms of the fruit (freshly squeezed juice, frozen concentrate and whole fruit) have the potential to reduce the activity of CYP3A4. Seville oranges, (often used in marmalades), limes and pomelos also produce this interaction." "A single glass (200 mL) of grapefruit juice ingested within 4 hours before felodipine produced the maximal pharmacokinetic interaction. Thereafter, an increased interval between ingesting the 2 substances slowly decreased the size of the effect — an interval of 10 hours produced an effect that was 50% of the maximum, and an interval of 24 hours produced an effect that was 25% of the maximum."

### Levothyroxine: the same way every day, away from food

Food, coffee, and some supplements get in the way of levothyroxine being absorbed. The thyroid guideline recommends taking it the same way every day, either an hour before breakfast or at bedtime at least three hours after the evening meal, and keeping it apart from calcium and iron supplements. Taking it the same way every day matters because your dose is set from blood tests taken on that routine. If your routine has to change, tell your prescriber.

- Source: Jonklaas J, et al. Guidelines for the treatment of hypothyroidism: prepared by the American Thyroid Association Task Force on Thyroid Hormone Replacement. Thyroid 2014;24(12):1670-1751 (`ata-hypothyroidism-2014`, already in the app; full text read on PubMed Central, PMC4267409).
- Supporting passages: "Because co-administration of food and levothyroxine is likely to impair levothyroxine absorption, we recommend that, if possible, levothyroxine be consistently taken either 60 minutes before breakfast or at bedtime (3 or more hours after the evening meal) for optimal, consistent absorption." "We recommend that where feasible, levothyroxine should be separated from other potentially interfering medications and supplements (e.g., bile acid sequestrants, calcium carbonate and ferrous sulfate)." "A 4-hour separation is traditional, but untested." "Absorption studies performed in these patients and in volunteers support the role of coffee in reducing LT4 absorption."
- The draft gives no number of hours for calcium or iron, because the guideline calls the usual 4 hours untested. It repeats the guideline's own timing (60 minutes; 3 or more hours) because that is the published recommendation, and it sends the reader to their prescriber.

## Questions for the owner

1. Approve the text above (or edit it) for the module's `education.plain` and a new article? On approval: add `violi-2016` to `data/sources.json`, add the text, and log it in `docs/VERIFY-log.md`.
2. Limes. The grapefruit rule says "Other citrus is fine", but its own source names limes (and Seville oranges and pomelos, which the rule already covers). Adding limes to the grapefruit tag would move a food onto an avoid list, which only the owner can do. Add it?
3. Warfarin source. Keep `holbrook-2005` on the warfarin rule, add `violi-2016` next to it, or replace it?
4. Levothyroxine timing. The existing rule says "30 to 60 minutes before food or at bedtime 3 to 4 hours after eating; separate ... by about 4 hours." The guideline it cites recommends 60 minutes before breakfast (it ranks 30 minutes before breakfast below bedtime for absorption), bedtime at least 3 hours after the evening meal, and calls the 4-hour separation "traditional, but untested." Change the rule's numbers to the guideline's (60 minutes; 3 or more hours) and drop the 4 hours?
