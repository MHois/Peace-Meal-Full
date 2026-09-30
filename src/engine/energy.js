// Energy needs and activity calories. Deterministic, published equations only.
// Resting energy: Mifflin-St Jeor (Mifflin 1990). Activity multipliers are the conventional factors used with it.
// Activity calories: MET x kg x hours (Ainsworth 2011 Compendium). Both are estimates, labeled as such in the UI.

export const ACTIVITY_LEVELS = [
  { id: 'sedentary', label: 'Mostly sitting', factor: 1.2 },
  { id: 'light', label: 'Light activity 1 to 3 days a week', factor: 1.375 },
  { id: 'moderate', label: 'Moderate activity 3 to 5 days a week', factor: 1.55 },
  { id: 'active', label: 'Hard activity 6 to 7 days a week', factor: 1.725 },
  { id: 'very-active', label: 'Very hard activity or physical job', factor: 1.9 }
];

export function restingEnergy({ sex, age, weight_kg, height_cm }) {
  const w = Number(weight_kg), h = Number(height_cm), a = Number(age);
  if (!(w > 0 && h > 0 && a > 0) || !sex) return null;
  const base = 10 * w + 6.25 * h - 5 * a;
  return Math.round(sex === 'male' ? base + 5 : base - 161);
}

// goal: 'maintain' | 'loss' (Phase 1 A1: 500 to 750 kcal/day deficit) | 'gain' (300 to 500 kcal/day above maintenance; 7,000 kcal is
// roughly 1 kg, so 500 a day is about 0.5 kg a week; ESPEN geriatrics guideline for older adults with unintentional loss) ;
// pregnancyTrimester adds Phase 1 D1 increments; breastfeeding adds 330 to 400.
export function energyTarget(person, { goal = 'maintain', deficit = 500, surplus = 400 } = {}) {
  const ree = restingEnergy(person);
  if (ree == null) return { kcal: null, ree: null, reason: 'Needs sex, age, weight, and height.' };
  const lvl = ACTIVITY_LEVELS.find(l => l.id === (person.activity || 'light')) || ACTIVITY_LEVELS[1];
  let tdee = Math.round(ree * lvl.factor);
  const notes = [`Resting energy ${ree} kcal (Mifflin-St Jeor) x ${lvl.factor} for "${lvl.label}" = ${tdee} kcal to maintain.`];
  let kcal = tdee;
  if (person.pregnancy) {
    const add = person.trimester === 3 ? 450 : person.trimester === 2 ? 340 : 0;
    kcal += add; notes.push(`Pregnancy: +${add} kcal for trimester ${person.trimester || 1} (ACOG/DGA).`);
  } else if (person.breastfeeding) {
    kcal += 330; notes.push('Breastfeeding: +330 kcal (lower end of the 330 to 400 range).');
  } else if (goal === 'loss') {
    const d = Math.min(750, Math.max(500, Number(deficit) || 500));
    kcal = Math.max(1200, tdee - d);
    notes.push(`Weight loss: ${d} kcal below maintenance (guideline range 500 to 750). Floor of 1,200 kcal without a doctor or dietitian supervising.`);
  } else if (goal === 'gain') {
    const s = Math.min(500, Math.max(300, Number(surplus) || 400));
    kcal = tdee + s;
    notes.push(`Weight gain: ${s} kcal above maintenance (300 to 500 a day; about 7,000 kcal per kilogram, so 500 a day is roughly half a kilogram a week).`);
    if (Number(person.age) >= 65) notes.push('Older adults: the ESPEN geriatrics guideline suggests about 30 kcal and 1.0 to 1.2 g of protein per kilogram a day as a starting point, and says unintentional weight loss should be worked up by a doctor first.');
  }
  const sources = ['mifflin-1990', 'aha-acc-tos-obesity-2013'];
  if (goal === 'gain') sources.push('espen-geriatrics-2022');
  return { kcal, ree, tdee, goal, notes, sources };
}

// MET values from the 2011 Compendium for common activities. Verify individual codes before relying on decimals.
export const ACTIVITIES = [
  { id: 'walk-slow', label: 'Walking, easy pace (2.5 mph)', met: 3.0 },
  { id: 'walk-moderate', label: 'Walking, brisk (3.5 mph)', met: 4.3 },
  { id: 'walk-fast', label: 'Walking, very brisk (4 mph)', met: 5.0 },
  { id: 'hike', label: 'Hiking', met: 6.0 },
  { id: 'run-5', label: 'Jogging (5 mph)', met: 8.3 },
  { id: 'run-6', label: 'Running (6 mph)', met: 9.8 },
  { id: 'bike-easy', label: 'Cycling, leisurely', met: 4.0 },
  { id: 'bike-moderate', label: 'Cycling, moderate (12 to 14 mph)', met: 8.0 },
  { id: 'swim', label: 'Swimming, leisurely', met: 6.0 },
  { id: 'strength', label: 'Strength training, moderate', met: 3.5 },
  { id: 'strength-hard', label: 'Strength training, vigorous', met: 6.0 },
  { id: 'yoga', label: 'Yoga (hatha)', met: 2.5 },
  { id: 'elliptical', label: 'Elliptical, moderate', met: 5.0 },
  { id: 'gardening', label: 'Gardening', met: 3.8 },
  { id: 'housework', label: 'Housework, general', met: 3.3 },
  { id: 'golf-walk', label: 'Golf, walking', met: 4.8 },
  { id: 'tennis-doubles', label: 'Tennis, doubles', met: 4.5 },
  { id: 'dance', label: 'Dancing, general', met: 5.5 }
];

export function activityCalories(activityId, minutes, weight_kg) {
  const a = ACTIVITIES.find(x => x.id === activityId);
  const w = Number(weight_kg), m = Number(minutes);
  if (!a || !(w > 0) || !(m > 0)) return null;
  return Math.round(a.met * w * (m / 60));
}

export const LB_PER_KG = 2.20462;
export const CM_PER_IN = 2.54;
export function lbToKg(lb) { const v = Number(lb); return v > 0 ? Math.round(v / LB_PER_KG * 10) / 10 : null; }
export function kgToLb(kg) { const v = Number(kg); return v > 0 ? Math.round(v * LB_PER_KG) : null; }
export function ftInToCm(ft, inch) { const f = Number(ft) || 0, i = Number(inch) || 0; const total = f * 12 + i; return total > 0 ? Math.round(total * CM_PER_IN) : null; }
export function cmToFtIn(cm) { const v = Number(cm); if (!(v > 0)) return { ft: null, inch: null }; const totalIn = Math.round(v / CM_PER_IN); return { ft: Math.floor(totalIn / 12), inch: totalIn % 12 }; }
