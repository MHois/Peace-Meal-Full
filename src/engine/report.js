// Doctor report: what was eaten, how the person felt, weight over time, and which foods keep showing up before symptoms.
// Counts only. No causal claim is made anywhere; the report says "showed up before" and leaves the judgement to the doctor.

// A symptom episode: a log entry with at least one symptom above zero. `at` is the best timestamp available.
export function symptomEpisodes(log, personId, from, to) {
  return (log || [])
    .filter(e => e.person === personId && e.date >= from && e.date <= to && e.symptoms && Object.values(e.symptoms).some(v => Number(v) > 0))
    .map(e => ({ ...e, at: e.at || (e.logged_at && e.logged_at.slice(0, 10) === e.date ? e.logged_at : e.date + 'T12:00:00'), worst: Math.max(...Object.values(e.symptoms).map(Number)) }))
    .sort((a, b) => a.at.localeCompare(b.at));
}

// Diary entries (what was eaten) for one person in a date range.
export function eatenBetween(diary, personId, from, to) {
  return (diary || []).filter(e => e.person === personId && e.date >= from && e.date <= to).sort((a, b) => (a.date + (a.meal || '')).localeCompare(b.date + (b.meal || '')));
}

const MEAL_HOUR = { breakfast: 8, snacks: 15, lunch: 12.5, dinner: 18.5, 'snack-am': 10.5, 'snack-pm': 15.5, 'snack-eve': 20.5 };
function entryTime(e) { return new Date(e.date + 'T00:00:00').getTime() + (MEAL_HOUR[e.meal] || 12) * 3600000; }

// Everything eaten in the `hours` before an episode.
export function eatenBefore(diary, episode, hours = 24) {
  const end = new Date(episode.at).getTime();
  const start = end - hours * 3600000;
  return (diary || []).filter(e => e.person === episode.person && entryTime(e) >= start && entryTime(e) <= end);
}

// Foods and recipes ranked by how often they were eaten in the window before an episode, against how often overall.
// -> [{ key, name, before, episodes, total, share }] where share = before / total.
export function foodsBeforeSymptoms(diary, log, personId, from, to, hours = 24) {
  const eps = symptomEpisodes(log, personId, from, to);
  const all = eatenBetween(diary, personId, from, to);
  const totals = new Map();
  for (const e of all) { const k = keyOf(e); if (!k) continue; const t = totals.get(k) || { key: k, name: e.name || k, total: 0, before: 0, episodes: new Set() }; t.total++; totals.set(k, t); }
  for (const ep of eps) {
    const seen = new Set();
    for (const e of eatenBefore(diary, ep, hours)) { const k = keyOf(e); if (!k || seen.has(k)) continue; seen.add(k); const t = totals.get(k); if (t) { t.before++; t.episodes.add(ep.at); } }
  }
  return [...totals.values()].filter(t => t.before > 0).map(t => ({ key: t.key, name: t.name, before: t.before, episodes: t.episodes.size, total: t.total, share: t.total ? t.before / t.total : 0 }))
    .sort((a, b) => b.episodes - a.episodes || b.share - a.share || a.name.localeCompare(b.name));
}
function keyOf(e) { return e.kind && e.ref ? `${e.kind}:${e.ref}` : e.name ? 'custom:' + String(e.name).toLowerCase().trim() : null; }

// Weight entries in range, oldest first, with the change over the range.
export function weightTrend(weights, personId, from, to) {
  const ws = (weights || []).filter(w => w.person === personId && w.date >= from && w.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  if (!ws.length) return { points: [], changeKg: null };
  return { points: ws, changeKg: Math.round((ws[ws.length - 1].kg - ws[0].kg) * 10) / 10, first: ws[0], last: ws[ws.length - 1] };
}

// Days in range, each with what was eaten, symptoms, and weight. onlySymptomDays keeps days with an episode.
export function reportDays({ diary, log, weights, personId, from, to, onlySymptomDays }) {
  const days = [];
  const eps = symptomEpisodes(log, personId, from, to);
  const eaten = eatenBetween(diary, personId, from, to);
  const ws = (weights || []).filter(w => w.person === personId);
  for (let d = new Date(from + 'T00:00:00'); d <= new Date(to + 'T00:00:00'); d.setDate(d.getDate() + 1)) {
    const date = d.toISOString().slice(0, 10);
    const dayEps = eps.filter(e => e.date === date);
    const dayEaten = eaten.filter(e => e.date === date);
    const w = ws.find(x => x.date === date);
    if (onlySymptomDays && !dayEps.length) continue;
    if (!dayEps.length && !dayEaten.length && !w) continue;
    days.push({ date, eaten: dayEaten, episodes: dayEps, weight: w || null });
  }
  return days;
}

// Average daily intake over the days in range that have at least one diary entry. Uses the nutrients stored on each
// entry when it was logged (USDA values by grams, or the recipe's published per-serving numbers).
export function intakeAverages(diary, personId, from, to) {
  const days = new Map();
  for (const e of diary || []) {
    if (e.person !== personId || !e.date || e.date < from || e.date > to || !e.nutrients) continue;
    const d = days.get(e.date) || {};
    for (const [k, v] of Object.entries(e.nutrients)) if (k[0] !== '_') d[k] = (d[k] || 0) + (Number(v) || 0);
    days.set(e.date, d);
  }
  const n = days.size;
  const avg = {};
  if (!n) return { days: 0, avg };
  for (const d of days.values()) for (const [k, v] of Object.entries(d)) avg[k] = (avg[k] || 0) + v / n;
  for (const k of Object.keys(avg)) avg[k] = Math.round(avg[k] * 10) / 10;
  return { days: n, avg };
}

// Unintended weight loss, screened with the GLIM phenotypic criterion (Cederholm 2019): more than 5% within the past
// 6 months, or more than 10% over a longer span. Returns the worst qualifying span, or null. Only meaningful when losing
// weight is not the goal, so pass intended: true to switch it off. Needs a weight logged in the last 45 days.
export function unintendedWeightLoss(weights, personId, today, { intended = false } = {}) {
  if (intended) return null;
  const day = d => new Date(String(d).slice(0, 10) + 'T00:00:00');
  const pts = (weights || []).filter(w => w.person === personId && w.date && Number(w.kg) > 0).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (pts.length < 2) return null;
  const last = pts[pts.length - 1];
  const t = typeof today === 'string' ? day(today) : day(today.toISOString());
  const dayMs = 86400000;
  if ((t - day(last.date)) / dayMs > 45) return null;
  let worst = null;
  for (const p of pts.slice(0, -1)) {
    const days = Math.round((day(last.date) - day(p.date)) / dayMs);
    if (days < 7) continue;
    const pct = (p.kg - last.kg) / p.kg * 100;
    const threshold = days <= 183 ? 5 : 10;
    if (pct >= threshold && (!worst || pct > worst.pct)) worst = { pct: Math.round(pct * 10) / 10, days, weeks: Math.round(days / 7), fromDate: p.date, fromKg: p.kg, toDate: last.date, toKg: last.kg, threshold };
  }
  return worst;
}
