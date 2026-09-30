// Eating-disorder screen (SCOFF, five yes/no items). Standard scoring: two or more "yes" answers is a positive screen.
// Wording below is a placeholder. The owner writes the final language (Phase 1, A9).
// Not shown anywhere since September 9, 2026, when the screen was removed at the owner's direction. The questions are
// from Morgan, Reid, and Lacey (BMJ 1999; US wording West J Med 2000), copyright BMJ, not public domain. Item 3 below is
// not a published wording (published: "more than One stone (14 lb) in a 3 month period"). Before this screen is shown
// again, get permission from BMJ and use a published wording exactly (docs/VERIFY-log.md, item 5).
export const SCOFF_ITEMS = [
  { id: 'sick', text: 'Do you make yourself sick because you feel uncomfortably full?' },
  { id: 'control', text: 'Do you worry you have lost control over how much you eat?' },
  { id: 'one_stone', text: 'Have you recently lost more than 14 pounds in a three-month period?' },
  { id: 'fat', text: 'Do you believe yourself to be fat when others say you are too thin?' },
  { id: 'food', text: 'Would you say that food dominates your life?' }
];
export const SCOFF_POSITIVE_THRESHOLD = 2;

export function scoreScoff(answers) {
  const yes = (answers || []).filter(Boolean).length;
  return { yes, positive: yes >= SCOFF_POSITIVE_THRESHOLD };
}

export const SUPPORT_TEXT = {
  heading: 'Support',
  plain: 'Your answers suggest that a weight-focused or restrictive plan may not be the right thing for you right now. This app will keep your allergen and celiac rules on and turn the rest off. That is not a judgment. It is the same step a dietitian would take.',
  // Checked on the Alliance's own site September 29, 2026 (docs/VERIFY-log.md, item 9). The helpline keeps weekday
  // daytime hours, so 988 is listed for a crisis or after hours.
  referral: [
    { name: 'National Alliance for Eating Disorders', detail: 'Free helpline run by licensed therapists who specialize in eating disorders: (866) 662-1235, 9 am to 7 pm Eastern, Monday to Friday. Treatment finder: findEDhelp.com. allianceforeatingdisorders.com' },
    { name: '988 Suicide and Crisis Lifeline', detail: 'In a crisis, or outside the helpline hours: call or text 988, or chat at 988lifeline.org, any time, day or night.' }
  ],
  do_not_list: ['NEDA helpline (discontinued; do not list)']
};
