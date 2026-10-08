// Merges the modules a person selected into one plan.
// Every applied rule carries its source ids. Conflicts are surfaced, never silently resolved.

// Elimination phases ask how it is going after this many weeks unless the person set a different number or turned the reminder off.
export const PHASE_DEFAULT_CHECK_IN_WEEKS = 4;

export const FEATURE_MODULES = {
  // feature id -> module ids that the feature gates
  'weight-loss': ['weight-management-glp1'],
  'ketogenic': ['low-carb-ketogenic'],
  'low-carb-under-175g': ['low-carb-ketogenic'],
  // P1-1 (fix pass of September 30, 2026): this mapped to nothing, so pregnancy and a child's profile left the
  // time-restricted eating pattern on. README safety rule 6.
  'intermittent-fasting': ['time-restricted-eating'],
  'elimination-protocols-except-allergen-celiac': ['ibs-low-fodmap', 'mcas', 'gluten-free-non-celiac'],
  'new-elimination-protocols': ['ibs-low-fodmap', 'mcas', 'gluten-free-non-celiac'],
  'calorie-targets': []
};

export const ELIMINATION_MODULES = ['ibs-low-fodmap', 'mcas', 'low-carb-ketogenic', 'time-restricted-eating'];

const DAY_MS = 86400000;

function daysBetween(a, b) {
  return Math.floor((b - a) / DAY_MS);
}

function firstToken(x) { return String(x || '').split('_')[0]; }
function paramMatches(nutrient, param) { if (!param) return true; if (param === 'all') return true; return nutrient === param || String(nutrient).startsWith(param) || firstToken(nutrient) === firstToken(param); }
export function tier2ParamFor(rule, module) {
  if (rule.param || rule.tier2_param) return rule.param || rule.tier2_param;
  if (!rule.nutrient) return module && (module.tier2 || [])[0] ? module.tier2[0].param : null;
  const base = rule.nutrient.replace(/_(g|mg|ug|iu|ml)$/, '');
  const decl = module && (module.tier2 || []).find(t => t.param && t.param.startsWith(base));
  if (decl) return decl.param;
  const op = rule.op || (rule.kind === 'limit' ? '<=' : '>=');
  return rule.nutrient + (op.startsWith('<') ? '_max' : '_min');
}
function nutrientBase(n) { return String(n || '').replace(/_(g|mg|ug|iu|ml)$/, ''); }
export function normalizeConditions(c) { return Array.isArray(c) ? c : (c && Array.isArray(c.modules) ? c.modules : []); }
function effectiveNutrient(rule) {
  if (!rule.nutrient) return null;
  if (rule.unit === 'percent_kcal') return nutrientBase(rule.nutrient) + '_pct_kcal';
  if (rule.unit === 'g/1000kcal') return rule.nutrient + '_per_1000kcal';
  return rule.nutrient;
}

function ruleRef(module, rule, extra = {}) {
  return {
    module: module.id,
    moduleName: module.name,
    rule: rule.id,
    kind: rule.kind,
    text: rule.text,
    strength: rule.strength || 'should',
    tier: rule.tier || 1,
    sources: rule.sources || [],
    verify: !!rule.verify,
    ...(rule.why ? { why: rule.why } : {}),
    ...extra
  };
}

function bmiOf(person) {
  const w = Number(person.weight_kg), h = Number(person.height_cm);
  return w > 0 && h > 0 ? w / Math.pow(h / 100, 2) : null;
}
// An optional rule that lists several foods can be turned on for only some of them (UX pass, October 2026). GERD's
// trigger foods are chosen one by one, as the rule's own guideline says: avoid the ones that trigger you, not all of
// them. Each pick is stored in optional_rules as "<rule id>:<tag>". The bare rule id, how the rule was stored before,
// still means every food in the rule, so nothing saved earlier changes meaning.
export function optionalRulePicks(rule, person) {
  const on = (person && person.optional_rules) || [];
  const tags = Array.isArray(rule.tags) ? rule.tags : [];
  if (on.includes(rule.id)) return tags.slice();
  const pre = rule.id + ':';
  return on.filter(x => typeof x === 'string' && x.startsWith(pre)).map(x => x.slice(pre.length)).filter(t => tags.includes(t));
}

// Returns { apply: boolean, note?: string, asAvoid?: boolean }
function ruleApplies(rule, m, person, ctx) {
  const settings = person.rule_settings || {};
  const optional = rule.optional === true || rule.default === 'off';
  if (optional && !(person.optional_rules || []).includes(rule.id) && !optionalRulePicks(rule, person).length) return { apply: false };
  if (rule.configurable) {
    // rule.setting lets two rules share one choice: the soy allergy rule and the soy-free pattern ask the same
    // allergist question about refined soybean oil and soy lecithin (P0-2, fix pass of September 30, 2026).
    const setting = settings[rule.setting || rule.id] ?? rule.default ?? rule.default_for_allergy ?? null;
    if ((rule.kind === 'avoid') && (setting === 'allow' || setting === 'off')) return { apply: false };
    if (rule.kind === 'info' && setting === 'exclude' && Array.isArray(rule.tags) && rule.tags.length) return { apply: true, asAvoid: true };
  }
  if (Array.isArray(rule.gated_by) && rule.gated_by.includes('eating-disorder-screen') && (ctx.screenPositive || ctx.isDisabled('weight-loss'))) return { apply: false, note: 'gated-by-screen' };
  if (rule.variant) {
    const chosen = ctx.variantsFor(m);
    if (!chosen.includes(rule.variant)) return { apply: false };
  }
  const sexRule = rule.applies_to === 'women' || rule.applies_to === 'female' ? 'female' : rule.applies_to === 'men' || rule.applies_to === 'male' ? 'male' : (rule.applies_if && rule.applies_if.sex) || null;
  if (sexRule) {
    if (!person.sex) ctx.needSex = true; // unknown: apply (conservative)
    else if (person.sex !== sexRule) return { apply: false };
  }
  if (rule.applies_if && Array.isArray(rule.applies_if.any)) {
    const age = Number(person.age) || null;
    const results = rule.applies_if.any.map(a => {
      if (a.pregnancy === true && !person.pregnancy) return false;
      if (a.breastfeeding === true && !person.breastfeeding) return false;
      if (a.sex && person.sex && person.sex !== a.sex) return false;
      if (a.sex && !person.sex) ctx.needSex = true;
      if ((a.age_min != null || a.age_max != null) && !age) { ctx.needAge = true; return true; }
      if (a.age_min != null && age < a.age_min) return false;
      if (a.age_max != null && age > a.age_max) return false;
      return true;
    });
    if (!results.some(Boolean)) return { apply: false };
  } else if (rule.applies_if) {
    const a = rule.applies_if;
    const age = Number(person.age) || null;
    if ((a.age_min != null || a.age_max != null)) {
      if (!age) ctx.needAge = true; // unknown: apply (conservative)
      else if ((a.age_min != null && age < a.age_min) || (a.age_max != null && age > a.age_max)) return { apply: false };
    }
    if (a.flag && !(person.flags && person.flags[a.flag])) return { apply: false };
    if (a.flag_not && person.flags && person.flags[a.flag_not]) return { apply: false };
    if (a.pregnancy === true && !person.pregnancy) return { apply: false };
    if (a.breastfeeding === true && !person.breastfeeding) return { apply: false };
  }
  if (rule.applies_when === 'overweight') {
    const bmi = bmiOf(person);
    const flag = person.flags && person.flags.overweight;
    if (!(flag || (bmi != null && bmi >= 25))) return { apply: false, note: 'not-overweight-or-unknown' };
  }
  return { apply: true };
}

// P2-10 (plain words): what each medicine answer's flag and requirement mean, said the way a person would. Each restates
// its effect name and the rule text it comes from (low-carb lc-screen: "SGLT2 inhibitor use (euglycemic ketoacidosis
// risk), insulin or sulfonylurea use (hypoglycemia; dose adjustment needed)"); none adds advice. An effect missing here
// keeps the old wording.
const MEDICATION_FLAG_WORDS = {
  'hypoglycemia-awareness': 'watch for low blood sugar (hypoglycemia)',
  'hypoglycemia-dose-adjustment': 'watch for low blood sugar (hypoglycemia); your doctor needs to adjust your medicine doses',
  'hypoglycemia-risk-with-fasting-windows': 'watch for low blood sugar (hypoglycemia) during long gaps without food',
  'low-carb-ketoacidosis-caution': 'take care with low-carb eating: with this medicine it can lead to ketoacidosis (a dangerous build-up of acid in the blood)',
  'ketoacidosis-caution-with-low-carb': 'take care with low-carb eating: with this medicine it can lead to ketoacidosis (a dangerous build-up of acid in the blood)',
  'euglycemic-ketoacidosis-risk': 'know the risk of ketoacidosis (a dangerous build-up of acid in the blood), which can happen even when blood sugar looks normal',
  'serum-potassium-monitoring': 'have your blood potassium checked as your doctor advises'
};
const MEDICATION_REQUIRE_WORDS = {
  'clinician-plan': 'a plan set with your doctor',
  'clinician-signoff': 'your doctor\'s OK'
};
// ", which is about 70 to 84 grams a day for you": the higher-protein module's 1.0 to 1.2 g per kg, in the person's grams.
function proteinGramsFor(person) {
  const w = Number(person && person.weight_kg);
  if (!(w > 0)) return '';
  return `, which is about ${Math.round(w)} to ${Math.round(w * 1.2)} grams a day for you`;
}

export function buildPlan({ person, conditions, dictionaries, today = new Date() }) {
  conditions = normalizeConditions(conditions);
  // User-defined patterns live on the person and behave like modules with a 'user-defined' source.
  const custom = (person.custom_modules || []).map(cm => ({
    id: cm.id, name: cm.name, category: 'custom', evidence: { rating: 'user-defined', summary: cm.summary || 'Defined by you. Not evidence-rated.' }, sources: ['user-defined'],
    rules: [
      ...(cm.avoid_tags && cm.avoid_tags.length ? [{ id: cm.id + '-avoid', kind: 'avoid', tags: cm.avoid_tags, tier: 1, strength: 'should', text: `${cm.name}: avoid ${cm.avoid_tags.join(', ')}.`, sources: ['user-defined'] }] : []),
      ...(cm.prefer_tags && cm.prefer_tags.length ? [{ id: cm.id + '-prefer', kind: 'prefer', tags: cm.prefer_tags, tier: 1, strength: 'should', text: `${cm.name}: prefer ${cm.prefer_tags.join(', ')}.`, sources: ['user-defined'] }] : []),
      ...Object.entries(cm.limits || {}).filter(([, v]) => typeof v === 'number').map(([n, v]) => ({ id: cm.id + '-limit-' + n, kind: 'limit', nutrient: n, op: '<=', value: v, per: 'day', tier: 1, strength: 'should', text: `${cm.name}: ${n.replace(/_/g, ' ')} at most ${v} per day.`, sources: ['user-defined'] })),
      ...Object.entries(cm.targets || {}).filter(([, v]) => typeof v === 'number').map(([n, v]) => ({ id: cm.id + '-target-' + n, kind: 'target', nutrient: n, op: '>=', value: v, per: 'day', tier: 1, strength: 'should', text: `${cm.name}: ${n.replace(/_/g, ' ')} at least ${v} per day.`, sources: ['user-defined'] })),
      ...(cm.notes ? [{ id: cm.id + '-notes', kind: 'info', tier: 1, strength: 'may', text: cm.notes, sources: ['user-defined'] }] : [])
    ], conflicts: [], education: { plain: cm.summary || '', evidence: [], contested: [], do_not_claim: [] }
  }));
  conditions = conditions.concat(custom);
  const byId = new Map(conditions.map(m => [m.id, m]));
  const notices = [];
  const selected = new Set(person.modules || []);
  for (const cm of custom) selected.add(cm.id);

  // Auto-include modules driven by profile flags
  if ((person.pregnancy || person.breastfeeding) && byId.has('pregnancy-gdm-breastfeeding')) selected.add('pregnancy-gdm-breastfeeding');
  // Other allergies (foods outside the nine, typed on the Allergies step) bring in the food-allergies module too.
  const otherAllergyList = [...new Set((person.allergens_other || []).map(x => String(x || '').trim().toLowerCase()).filter(x => x.length >= 2))];
  if (((person.allergens || []).length || otherAllergyList.length) && byId.has('food-allergies')) selected.add('food-allergies');
  if (person.flags && person.flags.glp1 && byId.has('weight-management-glp1')) selected.add('weight-management-glp1');
  // Medicines that interact with food: the module switches itself on when any of its questions is answered yes.
  for (const m of byId.values()) if (m.auto_by_medication && (m.medication_questions || []).some(q => q.global && person.medications && person.medications[q.id])) selected.add(m.id);
  const screenPositive = !!(person.screen && person.screen.positive);
  if (screenPositive && byId.has('eating-disorder-screen')) selected.add('eating-disorder-screen');
  if (person.adult === false) notices.push({ level: 'block', code: 'adults-only', text: 'This app is for adults. A caregiver may manage a child\'s confirmed celiac disease or diagnosed food allergies only.' });

  // Disabled features
  const disabled = new Map(); // feature -> by module
  for (const id of selected) {
    const m = byId.get(id);
    if (!m) continue;
    if (id === 'eating-disorder-screen' && !screenPositive) continue;
    const list = id === 'eating-disorder-screen' ? (m.disables_on_positive || m.disables || []) : (m.disables || []);
    for (const f of list) if (!disabled.has(f)) disabled.set(f, id);
  }
  if (person.adult === false) {
    for (const f of ['weight-loss', 'ketogenic', 'low-carb-under-175g', 'intermittent-fasting', 'calorie-targets', 'new-elimination-protocols', 'elimination-protocols-except-allergen-celiac']) if (!disabled.has(f)) disabled.set(f, 'pediatric');
  }
  const isDisabled = f => disabled.has(f);
  const disabledModules = new Map();
  for (const [f, by] of disabled) for (const mid of FEATURE_MODULES[f] || []) if (selected.has(mid)) disabledModules.set(mid, { feature: f, by });
  for (const [mid, info] of disabledModules) {
    const m = byId.get(mid);
    notices.push({ level: 'block', code: 'module-disabled', module: mid, text: `${m ? m.name : mid} is turned off because ${labelFor(byId, info.by)} disables ${info.feature.replace(/-/g, ' ')}.` });
  }

  // Required confirmations (e.g. celiac ruled out before non-celiac gluten-free)
  for (const id of selected) {
    const m = byId.get(id);
    if (!m || disabledModules.has(id)) continue;
    const req = (m.rules || []).find(r => r.required_confirmation);
    if (req && !(person.confirmations || []).includes(req.id)) {
      disabledModules.set(id, { feature: 'confirmation', by: req.id });
      notices.push({ level: 'block', code: 'confirmation-required', module: id, confirmId: req.id, text: `${m.name} is not active until you confirm: ${req.text}` });
    }
  }
  const active = [...selected].filter(id => byId.has(id) && !disabledModules.has(id)).map(id => byId.get(id));
  const activeIds = new Set(active.map(m => m.id));
  // Older adults and people on a GLP-1 medicine need more protein to hold muscle (ESPEN 2022). Suggest the module; never add it silently.
  {
    const ageNum = Number(person.age) || null;
    const glp1On = !!((person.flags && person.flags.glp1) || ((person.variants || {})['weight-management-glp1'] === 'glp1'));
    const dismissed = (person.dismissed_suggestions || []).includes('higher-protein-older-adult');
    if (byId.has('higher-protein-older-adult') && !activeIds.has('higher-protein-older-adult') && !dismissed && person.adult !== false && ((ageNum && ageNum >= 65) || glp1On)) {
      notices.push({ level: 'info', code: 'suggest-module', module: 'higher-protein-older-adult', sources: ['espen-geriatrics-2022'],
        // P2-10: plain words, and the person's own grams when their weight is on file (the module's 1.0 to 1.2 g/kg/day).
        text: ageNum && ageNum >= 65
          ? `At your age, dietitians suggest a little more protein to keep your muscles strong: about 1 to 1.2 grams a day for each kilogram you weigh${proteinGramsFor(person)}. Tap Add it and the app spreads it over your meals.`
          : `On a GLP-1 medicine, appetite drops, and you can lose muscle along with fat unless you keep your protein up. Tap Add it to set a protein target of about 1 to 1.2 grams a day for each kilogram you weigh${proteinGramsFor(person)}, spread over your meals.`,
        action: 'add-module:higher-protein-older-adult', actionLabel: 'Add it', dismiss: 'higher-protein-older-adult' });
    }
  }
  const variantsFor = m => {
    if (!Array.isArray(m.variants) || !m.variants.length) return [];
    const stored = person.variants && person.variants[m.id];
    // A GLP-1 user who did not tick the weight module themselves gets the GLP-1 guidance without the weight-loss rules.
    if (m.id === 'weight-management-glp1' && !stored && person.flags && person.flags.glp1 && !(person.modules || []).includes(m.id)) return ['glp1'];
    if (Array.isArray(stored) && stored.length) return stored;
    if (typeof stored === 'string') return [stored];
    if (m.id === 'pregnancy-gdm-breastfeeding') { const v = []; if (person.pregnancy) v.push('pregnancy'); if (person.breastfeeding) v.push('breastfeeding'); if (person.flags && person.flags.gdm) v.push('gdm'); return v.length ? v : ['pregnancy']; }
    return [m.variants[0].id];
  };
  const ctx = { screenPositive, isDisabled, variantsFor, needSex: false, needAge: false };
  const variantAvoid = []; // {module, tags}
  for (const m of active) for (const v of m.variants || []) if (variantsFor(m).includes(v.id) && Array.isArray(v.avoid_tags)) variantAvoid.push({ module: m, variant: v });

  // Medication-driven suppressions
  const suppressedRules = new Map(); // ruleId -> reason
  const gatedRules = new Set();      // rules that apply only when a medication answer enables them
  const enabledRules = new Set();
  for (const m of active) {
    for (const q of m.medication_questions || []) {
      const effects = [].concat(q.effect || []).flatMap(e => String(e).split(';')).map(e => e.trim()).filter(Boolean);
      for (const eff of effects) { const en = /^enable:(.+)$/.exec(eff); if (en) gatedRules.add(en[1]); }
      const answered = person.medications && person.medications[q.id];
      if (!answered) continue;
      for (const eff of effects) {
        const [verb, arg] = eff.split(':');
        if (verb === 'suppress') suppressedRules.set(arg, { reason: 'medication', text: q.text, module: m.id });
        else if (verb === 'enable') enabledRules.add(arg);
        else if (verb === 'flag') notices.push({ level: 'warn', code: 'medication-flag', module: m.id, text: `${m.name}: you answered yes to "${q.text}", so ${MEDICATION_FLAG_WORDS[arg] || 'note: ' + String(arg || '').replace(/-/g, ' ')}.` });
        else if (verb === 'require') notices.push({ level: 'warn', code: 'medication-require', module: m.id, text: `${m.name}: you answered yes to "${q.text}", so this pattern needs ${MEDICATION_REQUIRE_WORDS[arg] || String(arg || '').replace(/-/g, ' ')} before you follow it.` });
      }
    }
  }

  // Conflicts between active modules
  const conflicts = [];
  const seenPair = new Set();
  const blockedParams = new Map(); // param base (e.g. sodium_mg) -> conflict
  const suppressedModuleParams = []; // {module, param}
  const winnerPairs = []; // {winner, loser}
  for (const m of active) {
    for (const c of m.conflicts || []) {
      if (!activeIds.has(c.with)) continue;
      const key = [m.id, c.with].sort().join('|') + '|' + (c.param || '') + '|' + (c.type || '');
      if (seenPair.has(key)) continue;
      seenPair.add(key);
      const entry = { a: m.id, b: c.with, aName: m.name, bName: labelFor(byId, c.with), type: c.type, param: c.param || null, resolution: c.resolution || 'none', text: c.text || '', status: 'info' };
      const res = String(c.resolution || 'none');
      if (c.type === 'hard' && res === 'clinician' && (c.param === 'all' || !c.param)) {
        // Whole-module clash (e.g. CKD and ketogenic): the pattern module waits for clinician sign-off, acknowledged by the user.
        const ackKey = 'clinician-ok|' + [m.id, c.with].sort().join('|');
        const pattern = [m, byId.get(c.with)].find(x => x && x.category === 'pattern');
        entry.ackKey = ackKey;
        if ((person.acknowledged || []).includes(ackKey)) entry.status = 'acknowledged';
        else { entry.status = 'needs-ack'; if (pattern) suppressedModuleParams.push({ module: pattern.id, param: 'all', by: pattern.id === m.id ? c.with : m.id }); }
      } else if (c.type === 'hard' && res === 'clinician') {
        entry.status = 'blocked';
        if (c.param) blockedParams.set(c.param, entry);
      } else if (res.startsWith('suppress:')) {
        const target = res.slice('suppress:'.length);
        entry.status = 'suppressed';
        if (c.param) suppressedModuleParams.push({ module: target, param: c.param, by: target === m.id ? c.with : m.id });
        else suppressedModuleParams.push({ module: target, param: null, by: target === m.id ? c.with : m.id });
      } else if (res.startsWith('winner:')) {
        const winner = res.slice('winner:'.length);
        entry.status = 'winner';
        const loser = winner === m.id ? c.with : m.id;
        winnerPairs.push({ winner, loser });
        if (c.type === 'hard') suppressedModuleParams.push({ module: loser, param: c.param || null, by: winner });
      } else if (res === 'time-limit') {
        entry.status = 'time-limited';
      } else if (res === 'acknowledge') {
        const ackKey = [m.id, c.with].sort().join('|');
        entry.status = (person.acknowledged || []).includes(ackKey) ? 'acknowledged' : 'needs-ack';
        entry.ackKey = ackKey;
      } else if (res === 'pairing') {
        entry.status = 'pairing';
      } else if (c.type === 'compatible' || res === 'none') {
        entry.status = 'compatible';
      } else if (c.type === 'subsumed') {
        entry.status = 'subsumed';
      }
      conflicts.push(entry);
    }
  }

  // Phases (elimination protocols) and modes (IBD flare)
  const phases = [];
  const activePhaseRules = new Map(); // module -> Set(ruleIds allowed) or null for all
  for (const m of active) {
    if (!Array.isArray(m.phases) || !m.phases.length) continue;
    const state = (person.phases || {})[m.id] || null;
    const phase = state && m.phases.find(p => p.id === state.phase) ? m.phases.find(p => p.id === state.phase) : m.phases[0];
    const started = state && state.started ? new Date(state.started) : today;
    const weeks = Math.max(0, daysBetween(started, today) / 7);
    // A phase never ends on its own. It stays until the person moves it. An optional check-in reminder (every N weeks
    // from when it was set) asks whether to keep going or move on; the protocol's suggested length is shown as information.
    // Default: ask after 4 weeks on any phase with a usual maximum length (an elimination). An explicit 0 means no reminder.
    const hasCheckKey = !!(state && Object.prototype.hasOwnProperty.call(state, 'check_in_weeks'));
    const checkWeeks = hasCheckKey ? (Number(state.check_in_weeks) > 0 ? Number(state.check_in_weeks) : null) : (phase.max_weeks ? PHASE_DEFAULT_CHECK_IN_WEEKS : null);
    const checkFrom = state && state.check_in_from ? new Date(state.check_in_from) : started;
    const sinceCheck = Math.max(0, daysBetween(checkFrom, today) / 7);
    const status = checkWeeks && sinceCheck >= checkWeeks ? 'check-in' : 'active';
    const nextPhase = m.phases[m.phases.indexOf(phase) + 1] || null;
    const suggested = phase.min_weeks && phase.max_weeks ? `${phase.min_weeks} to ${phase.max_weeks} weeks` : phase.min_weeks ? `at least ${phase.min_weeks} weeks` : phase.max_weeks ? `up to ${phase.max_weeks} weeks` : null;
    phases.push({ module: m.id, moduleName: m.name, phase: phase.id, label: phase.label || phase.id, started: started.toISOString().slice(0, 10), weeks: Math.round(weeks * 10) / 10, min_weeks: phase.min_weeks || null, max_weeks: phase.max_weeks || null, suggested, status, check_in_weeks: checkWeeks, check_in_due: status === 'check-in', next: nextPhase ? nextPhase.id : null, nextLabel: nextPhase ? (nextPhase.label || nextPhase.id) : null });
    if (!state) notices.push({ level: 'info', code: 'phase-started', module: m.id, text: `${m.name}: on the ${phase.label || phase.id} phase from today. It stays until you change it${suggested ? `; the protocol usually runs it for ${suggested}` : ''}. If you want the app to ask how it is going, set a check-in on the Plan screen.`, link: '#/plan' });
    if (status === 'check-in') {
      notices.push({ level: 'warn', code: 'phase-check-in', module: m.id, text: `${m.name}: it has been ${Math.floor(sinceCheck)} week${Math.floor(sinceCheck) === 1 ? '' : 's'} since you asked to be reminded about the ${phase.label || phase.id} phase (${Math.round(weeks)} weeks in total). Keep going${nextPhase ? `, or move to ${nextPhase.label || nextPhase.id}` : ''}? Nothing changes until you choose.`, link: '#/plan', linkLabel: 'Choose on the Plan screen' });
    }
    const phaseRuleIds = new Set();
    for (const p of m.phases) for (const r of p.rules || []) phaseRuleIds.add(r);
    activePhaseRules.set(m.id, { allowed: new Set(phase.rules || []), phaseRuleIds });
  }
  const activeModeRules = new Map();
  for (const m of active) {
    if (!Array.isArray(m.modes) || !m.modes.length) continue;
    const def = m.modes.find(x => x.default) || m.modes[0];
    let stored = (person.modes || {})[m.id];
    let modeId = typeof stored === 'string' ? stored : stored && stored.mode;
    const since = stored && typeof stored === 'object' && stored.since ? new Date(stored.since) : null;
    let mode = m.modes.find(x => x.id === modeId) || def;
    if (mode.expires_days && since && daysBetween(since, today) > mode.expires_days) {
      notices.push({ level: 'warn', code: 'mode-expired', module: m.id, text: `${m.name}: ${mode.label || mode.id} mode has run ${mode.expires_days} days. Check in: are you still in a ${mode.label || mode.id}? The app has returned to ${def.label || def.id} rules until you confirm.` });
      mode = def;
    } else if (mode.expires_days && since) {
      notices.push({ level: 'info', code: 'mode-active', module: m.id, text: `${m.name}: ${mode.label || mode.id} mode, day ${daysBetween(since, today) + 1} of ${mode.expires_days}.` });
    }
    const modeRuleIds = new Set();
    for (const x of m.modes) for (const r of x.rules || []) modeRuleIds.add(r);
    activeModeRules.set(m.id, { allowed: new Set(mode.rules || []), modeRuleIds, mode: mode.id });
  }

  // Tier 2
  const tier2Missing = [];
  const tier2Applied = [];
  const tier2Values = person.tier2 || {};

  // Collect rules
  const limits = {};   // nutrient -> {value, ideal, per, per_kg, rules:[]}
  const targets = {};  // nutrient -> {min, max, per, rules:[]}
  const avoid = {};    // tag -> {hard, rules:[]}
  const prefer = {};   // tag -> {rules:[]}
  const timing = [], behavior = [], info = [];
  const periodic = {}; // per-meal and per-week numbers: { meal: {limits, targets}, week: {...} }
  const suppressed = [];
  const applied = [];

  const weight = Number(person.weight_kg) || null;

  for (const m of active) {
    const phaseInfo = activePhaseRules.get(m.id);
    const modeInfo = activeModeRules.get(m.id);
    for (let rule of m.rules || []) {
      // phase gating
      if (phaseInfo && phaseInfo.phaseRuleIds.has(rule.id) && !phaseInfo.allowed.has(rule.id)) continue;
      if (modeInfo && modeInfo.modeRuleIds.has(rule.id) && !modeInfo.allowed.has(rule.id)) continue;
      if (rule.unless_module && activeIds.has(rule.unless_module)) continue;   // another active module already carries this rule
      // medication suppression and gating
      if (suppressedRules.has(rule.id)) { suppressed.push(ruleRef(m, rule, { reason: suppressedRules.get(rule.id) })); continue; }
      if (gatedRules.has(rule.id) && !enabledRules.has(rule.id)) continue;
      const app = ruleApplies(rule, m, person, ctx);
      if (!app.apply) { if (app.note === 'gated-by-screen') suppressed.push(ruleRef(m, rule, { reason: { reason: 'screen' } })); continue; }
      if (app.asAvoid) rule = { ...rule, kind: 'avoid' };
      // Only the foods picked from an optional rule apply (see optionalRulePicks).
      if ((rule.optional === true || rule.default === 'off') && Array.isArray(rule.tags) && !(person.optional_rules || []).includes(rule.id)) rule = { ...rule, tags: optionalRulePicks(rule, person) };
      // The allergy module lists all nine allergens; only the person's confirmed allergens apply.
      if (m.id === 'food-allergies' && rule.kind === 'avoid' && Array.isArray(rule.tags) && rule.tags.some(t => t.startsWith('allergen-'))) {
        const mine = new Set(person.allergens || []);
        if (!rule.tags.some(t => t.startsWith('allergen-') && mine.has(t))) continue;
      }
      // A rule that belongs to one allergy (rule.allergen) applies only with that allergy on file.
      if (m.id === 'food-allergies' && rule.allergen && !(person.allergens || []).includes(rule.allergen)) continue;
      // conflict suppression on module+param
      const nut = rule.nutrient || null;
      const sup = suppressedModuleParams.find(s => s.module === m.id && (s.param === 'all' || s.param === null || (nut && paramMatches(nut, s.param))));
      if (sup && (sup.param === 'all' || rule.kind === 'limit' || rule.kind === 'target')) { suppressed.push(ruleRef(m, rule, { reason: { reason: 'conflict', by: sup.by } })); continue; }
      // blocked params (hard conflict, clinician)
      if (nut && (rule.kind === 'limit' || rule.kind === 'target')) {
        const blocked = [...blockedParams.entries()].find(([p]) => p !== 'all' && paramMatches(nut, p));
        if (blocked) {
          const param = tier2ParamFor(rule, m);
          const base = nutrientBase(nut);
          const anyKey = Object.keys(tier2Values).find(k => k.startsWith(base) && typeof tier2Values[k] === 'number');
          if (typeof tier2Values[param] === 'number') {
            // clinician number resolves the conflict
            applyNumber(rule, m, tier2Values[param], { clinician: true, conflict: blocked[1] });
            tier2Applied.push({ module: m.id, param, value: tier2Values[param] });
          } else if (anyKey) {
            suppressed.push(ruleRef(m, rule, { reason: { reason: 'clinician-number-governs', param: anyKey } }));
          } else {
            suppressed.push(ruleRef(m, rule, { reason: { reason: 'hard-conflict', with: blocked[1].a === m.id ? blocked[1].b : blocked[1].a } }));
            const decl = (m.tier2 || []).find(t => t.param === param);
            const entry = { module: m.id, moduleName: m.name, param, label: decl ? decl.label : `${labelNutrient(nut)} (${blocked[1].aName} and ${blocked[1].bName} conflict)`, consensus: decl ? decl.consensus : 'Your clinician must set this number.', why: decl ? decl.why : blocked[1].text, conflict: true, declared: !!decl, sources: rule.sources || [] };
            const idx = tier2Missing.findIndex(t => firstToken(t.param) === firstToken(base));
            if (idx === -1) tier2Missing.push(entry); else if (!tier2Missing[idx].declared && decl) tier2Missing[idx] = entry;
          }
          continue;
        }
      }
      // tier 2 gating
      if ((rule.tier || 1) === 2) {
        const param = tier2ParamFor(rule, m);
        if (param && typeof tier2Values[param] === 'number') {
          applyNumber(rule, m, tier2Values[param], { clinician: true });
          tier2Applied.push({ module: m.id, param, value: tier2Values[param] });
        } else if (rule.kind === 'limit' || rule.kind === 'target') {
          const decl = (m.tier2 || []).find(t => t.param === param) || {};
          if (!tier2Missing.some(t => t.param === param)) tier2Missing.push({ module: m.id, moduleName: m.name, param, label: decl.label || rule.text, consensus: decl.consensus || '', why: decl.why || '', ruleText: rule.text, sources: rule.sources || [] });
          info.push(ruleRef(m, rule, { tier2Pending: true }));
        } else {
          info.push(ruleRef(m, rule, { tier2Pending: true }));
        }
        continue;
      }
      // calorie gating
      if (nut === 'kcal' && isDisabled('calorie-targets')) { suppressed.push(ruleRef(m, rule, { reason: { reason: 'feature-disabled', feature: 'calorie-targets' } })); continue; }

      switch (rule.kind) {
        case 'limit': applyNumber(rule, m, rule.op === 'range' ? rule.max : rule.value, {}); break;
        case 'target': applyNumber(rule, m, rule.op === 'range' ? rule.min : rule.value, {}); break;
        case 'avoid':
          for (const tag of rule.tags || []) {
            if (!avoid[tag]) avoid[tag] = { hard: false, rules: [] };
            if (rule.hard) avoid[tag].hard = true;
            avoid[tag].rules.push(ruleRef(m, rule));
          }
          applied.push(ruleRef(m, rule));
          break;
        case 'prefer':
          for (const tag of rule.tags || []) {
            if (!prefer[tag]) prefer[tag] = { rules: [] };
            prefer[tag].rules.push(ruleRef(m, rule));
          }
          applied.push(ruleRef(m, rule));
          break;
        case 'timing': timing.push(ruleRef(m, rule)); break;
        case 'behavior': behavior.push(ruleRef(m, rule)); break;
        default: info.push(ruleRef(m, rule));
      }
    }
  }

  function applyNumber(rule, m, value, meta) {
    if (rule.fiber_type && rule.fiber_type !== 'total') { info.push(ruleRef(m, rule, { unmeasured: rule.fiber_type + ' fiber is not in the USDA data; shown for guidance' })); return; }
    const nut = effectiveNutrient(rule);
    if (!nut || typeof value !== 'number') { (rule.kind === 'behavior' ? behavior : info).push(ruleRef(m, rule, meta)); return; }
    let v = value;
    let scaled = false;
    const perKg = !!rule.per_kg || (meta.clinician && /per_kg/.test(tier2ParamFor(rule, m) || ''));
    if (perKg) {
      if (!weight) {
        notices.push({ level: 'info', code: 'weight-needed', module: m.id, text: `${m.name}: "${rule.text}" is per kilogram of body weight. Enter a weight to turn it into a daily number.` });
        info.push(ruleRef(m, rule, { needsWeight: true }));
        return;
      }
      v = Math.round(value * weight * 10) / 10;
      scaled = true;
    }
    const ref = ruleRef(m, rule, { value: v, raw: value, per_kg: perKg, unit: rule.unit || null, per: rule.per || 'day', ...meta });
    applied.push(ref);
    const per = rule.per || 'day';
    const op = rule.op === 'range' ? (rule.kind === 'limit' ? '<=' : '>=') : (rule.op || (rule.kind === 'limit' ? '<=' : '>='));
    const limitsMap = per === 'day' ? limits : (periodic[per] ||= { limits: {}, targets: {} }).limits;
    const targetsMap = per === 'day' ? targets : (periodic[per] ||= { limits: {}, targets: {} }).targets;
    if (op.startsWith('<')) {
      const cur = limitsMap[nut];
      const ideal = perKg && rule.ideal ? Math.round(rule.ideal * weight * 10) / 10 : (rule.ideal ?? null);
      if (!cur) limitsMap[nut] = { value: v, ideal, per, rules: [ref], clinician: !!meta.clinician, unit: rule.unit || null };
      else {
        if (v < cur.value) { cur.value = v; cur.clinician = !!meta.clinician; }
        if (ideal != null && (cur.ideal == null || ideal < cur.ideal)) cur.ideal = ideal;
        cur.rules.push(ref);
      }
    } else {
      const cur = targetsMap[nut];
      const max = rule.max != null && !meta.clinician ? (perKg ? Math.round(rule.max * weight * 10) / 10 : rule.max) : null;
      if (!cur) targetsMap[nut] = { min: v, max, per, rules: [ref], clinician: !!meta.clinician, unit: rule.unit || null };
      else {
        if (v > cur.min) { cur.min = v; cur.clinician = !!meta.clinician; }
        if (max != null && (cur.max == null || max < cur.max) && max >= cur.min) cur.max = max;
        if (cur.max != null && cur.max < cur.min) cur.max = null;
        cur.rules.push(ref);
      }
    }
    if (scaled) ref.note = `${value} per kg x ${weight} kg`;
  }

  // Winner conflicts: loser's prefer tags that the winner avoids are dropped
  for (const { winner, loser } of winnerPairs) {
    for (const tag of Object.keys(prefer)) {
      if (!avoid[tag]) continue;
      const before = prefer[tag].rules.length;
      prefer[tag].rules = prefer[tag].rules.filter(r => r.module !== loser);
      if (prefer[tag].rules.length !== before) suppressed.push({ module: loser, rule: `prefer:${tag}`, kind: 'prefer', text: `Preference for ${tag} set aside while ${labelFor(byId, winner)} rules apply.`, reason: { reason: 'winner', by: winner } });
      if (!prefer[tag].rules.length) delete prefer[tag];
    }
  }

  // Variant-level avoid tags (vegetarian, vegan)
  for (const { module: m, variant: v } of variantAvoid) {
    for (const tag of v.avoid_tags) {
      if (!avoid[tag]) avoid[tag] = { hard: false, rules: [] };
      avoid[tag].rules.push({ module: m.id, moduleName: m.name, rule: `variant:${v.id}`, kind: 'avoid', text: `${v.id} pattern`, strength: 'should', tier: 1, sources: m.sources || [] });
    }
  }
  if (ctx.needSex) notices.push({ level: 'info', code: 'sex-needed', text: 'Some numbers differ by sex. Until sex is entered, the app applies the stricter value.' });
  if (ctx.needAge) notices.push({ level: 'info', code: 'age-needed', text: 'Some numbers differ by age. Until age is entered, the app applies the stricter value.' });
  // User allergens: absolute
  for (const tag of person.allergens || []) {
    if (!avoid[tag]) avoid[tag] = { hard: true, rules: [] };
    avoid[tag].hard = true;
    avoid[tag].rules.push({ module: 'food-allergies', moduleName: 'Food allergies', rule: 'user-allergen', kind: 'avoid', text: 'Confirmed food allergy. Hard exclusion; no setting overrides it.', strength: 'must', tier: 1, sources: ['fda-falcpa-2004'], userAllergen: true });
  }
  // Preferences: soft
  for (const tag of (person.preferences && person.preferences.avoid_tags) || []) {
    if (!avoid[tag]) avoid[tag] = { hard: false, rules: [] };
    avoid[tag].rules.push({ module: 'preference-avoidances', moduleName: 'Preferences', rule: 'user-preference', kind: 'avoid', text: 'Personal preference. You can override this any time.', strength: 'may', tier: 1, sources: [], preference: true });
  }

  // Sanity: a target min above a limit max on the same nutrient
  for (const nut of Object.keys(targets)) {
    if (limits[nut] && targets[nut].min > limits[nut].value) notices.push({ level: 'warn', code: 'target-above-limit', text: `${labelNutrient(nut)}: one rule asks for at least ${targets[nut].min} and another for at most ${limits[nut].value}. Review both with a clinician.`, nutrient: nut });
  }

  // Restriction load
  const eds = byId.get('eating-disorder-screen');
  const loadRule = eds && (eds.rules || []).find(r => Array.isArray(r.counts));
  const countIds = loadRule ? loadRule.counts : ELIMINATION_MODULES;
  const threshold = loadRule && loadRule.threshold ? loadRule.threshold : 3;
  const prefAvoid = (person.preferences && person.preferences.avoid_tags) || [];
  const dairyFreePref = (prefAvoid.includes('allergen-milk') || (prefAvoid.includes('full-fat-dairy') && prefAvoid.includes('low-fat-dairy'))) && !(person.allergens || []).includes('allergen-milk');
  const elim = countIds.filter(id => id === 'dairy-free-non-allergy' ? dairyFreePref : activeIds.has(id));
  const restrictionLoad = { count: elim.length, modules: elim, warn: elim.length >= threshold, threshold };
  if (restrictionLoad.warn) notices.push({ level: 'info', code: 'restriction-load', text: `Stacked restrictions: ${elim.length} diets that each cut out whole food groups are running at once (${elim.join(', ')}). Together they make it harder to get enough fiber, calcium, protein and variety. Where you can, run one at a time, and keep the reintroduction steps.` });

  for (const t of tier2Missing) notices.push({ level: 'warn', code: 'tier2-missing', module: t.module, text: `${t.moduleName}: ${t.label} was not applied. The app does not set this number. Enter the value your clinician gave you.${t.consensus ? ' Published range: ' + t.consensus : ''}` });
  for (const c of conflicts) {
    if (c.status === 'blocked') {
      const resolved = c.param && tier2Applied.some(t => firstToken(t.param) === firstToken(c.param));
      if (resolved) { c.status = 'clinician-resolved'; notices.push({ level: 'info', code: 'hard-conflict-resolved', text: `${c.aName} and ${c.bName} give opposite ${labelNutrient(c.param)} advice. Your clinician's number is being applied instead of either guideline default.` }); }
      else notices.push({ level: 'block', code: 'hard-conflict', text: `${c.aName} and ${c.bName} give opposite ${labelNutrient(c.param)} advice. The app will not choose. ${c.text}` });
    }
    if (c.status === 'needs-ack') notices.push({ level: 'warn', code: 'needs-ack', ackKey: c.ackKey, text: `${c.aName} and ${c.bName}: ${c.text}` });
  }
  if (screenPositive) notices.push({ level: 'block', code: 'screen-positive', text: 'Based on your screening answers, calorie targets, weight-loss plans, and new elimination protocols are turned off. Allergen and celiac rules stay on. See the support resources on the Screening page.' });

  const order = { block: 0, warn: 1, info: 2 };
  notices.sort((a, b) => order[a.level] - order[b.level]);

  return {
    person: person.id,
    modules: active.map(m => ({ id: m.id, name: m.name, category: m.category, rating: m.evidence && m.evidence.rating })),
    disabledModules: [...disabledModules].map(([id, x]) => ({ id, ...x })),
    disabledFeatures: [...disabled].map(([feature, by]) => ({ feature, by })),
    isDisabled,
    limits, targets, periodic, avoid, prefer, timing, behavior, info,
    applied, suppressed, conflicts, phases,
    modes: [...activeModeRules].map(([module, x]) => ({ module, mode: x.mode })),
    tier2: { applied: tier2Applied, missing: tier2Missing },
    restrictionLoad,
    otherAllergies: otherAllergyList,
    notices
  };
}

function labelFor(byId, id) {
  const m = byId.get(id);
  return m ? m.name : id;
}

export const NUTRIENT_LABELS = {
  kcal: 'Calories', protein_g: 'Protein (g)', carb_g: 'Carbohydrate (g)', fiber_g: 'Fiber (g)', sugar_g: 'Total sugars (g)', added_sugar_g: 'Added sugars (g)',
  fat_g: 'Total fat (g)', satfat_g: 'Saturated fat (g)', transfat_g: 'Trans fat (g)', cholesterol_mg: 'Cholesterol (mg)', sodium_mg: 'Sodium (mg)', potassium_mg: 'Potassium (mg)',
  phosphorus_mg: 'Phosphorus (mg)', calcium_mg: 'Calcium (mg)', iron_mg: 'Iron (mg)', magnesium_mg: 'Magnesium (mg)', vitamin_c_mg: 'Vitamin C (mg)', vitamin_d_iu: 'Vitamin D (IU)',
  vitamin_b12_ug: 'Vitamin B12 (mcg)', folate_ug: 'Folate (mcg)', zinc_mg: 'Zinc (mg)', iodine_ug: 'Iodine (mcg)', caffeine_mg: 'Caffeine (mg)', alcohol_g: 'Alcohol (g)', fluid_ml: 'Fluid (mL)',
  satfat_pct_kcal: 'Saturated fat (% of calories)', added_sugar_pct_kcal: 'Added sugar (% of calories)', carb_pct_kcal: 'Carbohydrate (% of calories)'
};
export function labelNutrient(n) {
  if (!n) return '';
  const base = n.replace(/_(max|min)$/, '');
  return NUTRIENT_LABELS[base] || base.replace(/_/g, ' ');
}
