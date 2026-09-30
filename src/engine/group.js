// Plans for more than one person eating together. The group plan is the strictest combination:
// every hard exclusion from anyone is hard; every soft avoid is kept and attributed; limits take the lowest value;
// targets take the highest minimum. Per-person conflicts stay visible.
import { buildPlan } from './plan.js';

export function buildGroupPlan({ people, conditions, dictionaries, today = new Date() }) {
  const plans = people.map(p => ({ person: p, plan: buildPlan({ person: p, conditions, dictionaries, today }) }));
  const limits = {}, targets = {}, avoid = {}, prefer = {};
  const notices = [];
  for (const { person, plan } of plans) {
    for (const [n, l] of Object.entries(plan.limits)) {
      if (!limits[n] || l.value < limits[n].value) limits[n] = { ...l, people: [person.name], rules: l.rules.map(r => ({ ...r, person: person.name })) };
      else limits[n].people.push(person.name);
    }
    for (const [n, t] of Object.entries(plan.targets)) {
      if (!targets[n] || t.min > targets[n].min) targets[n] = { ...t, people: [person.name], rules: t.rules.map(r => ({ ...r, person: person.name })) };
      else targets[n].people.push(person.name);
    }
    for (const [tag, a] of Object.entries(plan.avoid)) {
      if (!avoid[tag]) avoid[tag] = { hard: false, rules: [], people: [] };
      if (a.hard) avoid[tag].hard = true;
      avoid[tag].people.push(person.name);
      avoid[tag].rules.push(...a.rules.map(r => ({ ...r, person: person.name })));
    }
    for (const [tag, p] of Object.entries(plan.prefer)) {
      if (!prefer[tag]) prefer[tag] = { rules: [], people: [] };
      prefer[tag].people.push(person.name);
      prefer[tag].rules.push(...p.rules.map(r => ({ ...r, person: person.name })));
    }
    for (const n of plan.notices) if (n.level !== 'info') notices.push({ ...n, person: person.name, text: `${person.name}: ${n.text}` });
  }
  // A target one person needs above a limit another person has: surface it.
  for (const n of Object.keys(targets)) if (limits[n] && targets[n].min > limits[n].value) notices.push({ level: 'warn', code: 'group-target-above-limit', text: `${n.replace(/_/g, ' ')}: ${targets[n].people.join(', ')} need at least ${targets[n].min} while ${limits[n].people.join(', ')} must stay under ${limits[n].value}. Serve components separately or plan different portions.` });
  const allergens = [...new Set(people.flatMap(p => p.allergens || []))];
  return { people: people.map(p => ({ id: p.id, name: p.name })), plans, limits, targets, avoid, prefer, timing: plans.flatMap(x => x.plan.timing.map(t => ({ ...t, person: x.person.name }))), behavior: plans.flatMap(x => x.plan.behavior.map(t => ({ ...t, person: x.person.name }))), info: [], periodic: {}, conflicts: plans.flatMap(x => x.plan.conflicts.map(c => ({ ...c, person: x.person.name }))), phases: plans.flatMap(x => x.plan.phases.map(c => ({ ...c, person: x.person.name }))), tier2: { applied: [], missing: plans.flatMap(x => x.plan.tier2.missing.map(m => ({ ...m, person: x.person.name }))) }, notices, allergens, isDisabled: f => plans.some(x => x.plan.isDisabled(f)), group: true };
}

// A shareable, minimal copy of a person: what another household needs to cook for them. No log, no weight history.
export function exportPersonForSharing(person) {
  const keep = ['name', 'adult', 'sex', 'age', 'modules', 'allergens', 'preferences', 'medications', 'pregnancy', 'breastfeeding', 'tier2', 'phases', 'modes', 'variants', 'flags', 'optional_rules', 'rule_settings', 'confirmations', 'acknowledged', 'custom_modules', 'cooking'];
  const out = { shared: true, version: 1, exported: new Date().toISOString() };
  for (const k of keep) if (person[k] !== undefined) out[k] = JSON.parse(JSON.stringify(person[k]));
  return out;
}
