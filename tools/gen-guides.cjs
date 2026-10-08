// Builds docs/guides/*.docx (iPhone setup guides for the lite and full apps). Needs the docx npm package: NODE_PATH=$(npm root -g) node tools/gen-guides.cjs
const fs = require('fs');
const path = require('path');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, LevelFormat, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, PageBreak, Footer, PageNumber } = require('docx');

const LITE_URL = 'https://mhois.github.io/Peace-Meal-Full/lite/';
const FULL_URL = 'https://mhois.github.io/Peace-Meal-Full/full/';
const OUT = path.join(__dirname, '..', 'docs', 'guides');
const GREEN = '3D5A3C', PLUM = '8A3E63';

// Inline markup: **bold** words are what you see on screen.
function runs(text, size) {
  return text.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map(t => t.startsWith('**') ? new TextRun({ text: t.slice(2, -2), bold: true, size }) : new TextRun({ text: t, size }));
}

function build({ title, subtitle, url, body, sections, file }) {
  const S = body * 2;   // half-points
  const P = (t, o = {}) => new Paragraph({ children: runs(t, S), spacing: { after: 160, line: 320 }, ...o });
  const H1 = t => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: t })], spacing: { before: 360, after: 180 } });
  const H2 = t => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: t })], spacing: { before: 240, after: 120 } });
  let listNo = 0;
  const steps = items => { const ref = 'steps' + (listNo++); refs.push(ref); return items.map(t => new Paragraph({ numbering: { reference: ref, level: 0 }, children: runs(t, S), spacing: { after: 140, line: 320 } })); };
  const bullets = items => items.map(t => new Paragraph({ numbering: { reference: 'dots', level: 0 }, children: runs(t, S), spacing: { after: 120, line: 320 } }));
  const box = (head, lines, fill) => new Table({
    width: { size: 9360, type: WidthType.DXA }, columnWidths: [9360],
    rows: [new TableRow({ children: [new TableCell({
      width: { size: 9360, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill, color: 'auto' },
      margins: { top: 160, bottom: 160, left: 240, right: 240 },
      borders: { top: { style: BorderStyle.SINGLE, size: 6, color: GREEN }, bottom: { style: BorderStyle.SINGLE, size: 6, color: GREEN }, left: { style: BorderStyle.SINGLE, size: 24, color: GREEN }, right: { style: BorderStyle.SINGLE, size: 6, color: GREEN } },
      children: [new Paragraph({ children: [new TextRun({ text: head, bold: true, size: S, color: GREEN })], spacing: { after: 100 } }), ...lines.map(l => new Paragraph({ children: runs(l, S), spacing: { after: 80, line: 300 } }))]
    })] })]
  });
  const table = (cols, rows) => {
    const w = cols.map(c => c.w);
    const cell = (t, i, head) => new TableCell({ width: { size: w[i], type: WidthType.DXA }, shading: head ? { type: ShadingType.CLEAR, fill: 'E8EFE6', color: 'auto' } : undefined, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: head ? [new TextRun({ text: t, bold: true, size: S })] : runs(t, S) })] });
    return new Table({ width: { size: w.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths: w, rows: [new TableRow({ tableHeader: true, children: cols.map((c, i) => cell(c.t, i, true)) }), ...rows.map(r => new TableRow({ children: r.map((t, i) => cell(t, i, false)) }))] });
  };
  const gap = () => new Paragraph({ children: [], spacing: { after: 120 } });
  const refs = [];
  const kit = { P, H1, H2, steps, bullets, box, table, gap, S, url };
  const children = [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: title, bold: true, size: S + 20, color: GREEN, font: 'Georgia' })], spacing: { after: 120 } }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: subtitle, size: S + 2, color: '555555' })], spacing: { after: 240 } }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Your link', bold: true, size: S })], spacing: { after: 60 } }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: url, size: S, color: PLUM, underline: {} })], spacing: { after: 320 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC', space: 8 } } }),
    ...sections(kit).flat()
  ];
  const doc = new Document({
    creator: 'Peace Meal', lastModifiedBy: 'Peace Meal', title,
    styles: {
      default: { document: { run: { font: 'Arial', size: S } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: S + 12, bold: true, font: 'Georgia', color: GREEN }, paragraph: { spacing: { before: 360, after: 180 }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: S + 4, bold: true, font: 'Arial', color: '222222' }, paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } }
      ]
    },
    numbering: { config: [
      { reference: 'dots', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      ...Array.from({ length: 30 }, (_, i) => ({ reference: 'steps' + i, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 480 } }, run: { bold: true, color: GREEN } } }] }))
    ] },
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: title + '   ·   Page ', size: 18, color: '777777' }), new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '777777' })] })] }) },
      children
    }]
  });
  return Packer.toBuffer(doc).then(b => fs.writeFileSync(file, b));
}

// ---------------- LITE ----------------
const lite = build({
  title: 'Peace Meal for one',
  subtitle: 'The simple version. How to set it up on your iPhone, and how to use it.',
  url: LITE_URL, body: 15, file: path.join(OUT, 'Peace-Meal-Lite-iPhone-Guide.docx'),
  sections: ({ P, H1, H2, steps, bullets, box, gap }) => [
    H1('What this app does'),
    P('Peace Meal helps you eat foods that agree with your body.'),
    bullets([
      'You tell it once what you cannot eat. It remembers for you.',
      'It plans your meals for the week.',
      'You tap what you ate and how you felt.',
      'It makes a report you can show your doctor.'
    ]),
    gap(),
    box('Good to know before you start', [
      'You do not need an account or a password.',
      'You do not need to download anything from the App Store.',
      'Everything you type stays on your phone. Nobody else can see it. Not even the person who sent you the link.',
      'The app does not diagnose anything. Your doctor is still your doctor.'
    ], 'F2F6F1'),

    H1('Part 1: Put the app on your phone'),
    P('You only do this once. It takes about two minutes. Take your time.'),
    steps([
      'Open the text message with the link in it.',
      'Tap the link. It opens in **Safari**, the iPhone web browser with the blue compass.',
      'Wait a few seconds. You will see the words **Peace Meal for one** with a small **LITE** tag next to them.',
      'At the bottom of the screen, tap the three dots (**•••**).',
      'Tap **Share**. It looks like a square with an arrow pointing up. On an iPad, Share is at the top of the screen. On some iPhones Share is right on the bottom bar, with no dots to tap first.',
      'A menu slides up. Move your finger up on the menu to scroll down. Tap **Add to Home Screen**.',
      'Tap **Add** in the top right corner.',
      'Press the Home button, or swipe up from the bottom of the screen. You will see a new green bowl picture called **Peace Meal for one**. That is your app.'
    ]),
    gap(),
    box('The one rule to remember', [
      'From now on, always open the app by tapping the **green bowl picture** on your home screen.',
      'Do not open the old text link again. The link opens a separate copy that does not have your information in it. It will look empty, and that is scary for no reason.'
    ], 'FFF4E5'),
    H2('Using an Android phone instead?'),
    steps([
      'Tap the link. It opens in **Chrome**.',
      'Tap the three dots (**⋮**) at the top right.',
      'Tap **Add to Home screen**. On some phones it says **Install app**.',
      'Tap **Install** or **Add**. Tap **Add** again if your phone asks where to put it.',
      'Open **Peace Meal for one** from its new icon on your home screen.'
    ]),
    P('Using Samsung Internet instead of Chrome? Tap the three lines (**≡**) at the bottom right, then **Add page to**, then **Home screen**. On Android the icon and the browser keep the same information, so nothing looks empty.'),

    H1('Part 2: Tell the app about you'),
    P('The app asks you some questions, one page at a time. You can always go back and change an answer later.'),
    steps([
      'Tap the green bowl on your home screen.',
      'Tap the big button that says **Start: tell it about you**.',
      'Type your first name in the box. Tap **Continue**.',
      'Answer the questions on the page. When you are done, tap the button at the bottom that starts with **Next**.',
      'Keep going, page by page. Tap **Back** if you want to fix something.'
    ]),
    P('Here is what each page asks:'),
    bullets([
      '**Basics:** your age, height, and weight.',
      '**Allergies:** tick anything you are allergic to. The app will never plan these foods. Ever.',
      '**Conditions and diets:** tick the health problems or diets you follow. Examples are IBS, diabetes, or a low histamine diet. Tap **About** next to any of them to read more first.',
      '**Likes and dislikes:** foods you do not care for, and how spicy you like things.',
      '**Medications:** a few yes or no questions about medicines that change what you should eat.',
      '**Numbers from your doctor:** this page only shows up for some health problems. If you do not know a number, leave it blank and ask your doctor.',
      '**Cooking:** how much time you have and how you like to cook.',
      '**Review:** everything on one page. Tap **Save and see my plan**.'
    ]),
    P('That\'s it. You are set up.'),

    H1('Part 3: Using it every day'),
    P('Along the bottom of the screen are five buttons. Tap one to go there.'),
    bullets([
      '**Today:** what you ate and how you feel today. This is the main page.',
      '**Meals:** your meals for the week.',
      '**Recipes:** all the recipes. Tap one to read it.',
      '**Report:** the report for your doctor.',
      '**More:** everything else, like Settings.'
    ]),
    H2('When you eat something'),
    steps([
      'Tap **Today**.',
      'Find the meal, like **Breakfast**.',
      'If you ate what was planned, tap **I ate this**.',
      'If you ate something else, tap **Something else**. Type what you ate in the box, like "toast with butter." Tap **Add**.'
    ]),
    H2('When you do not feel well'),
    steps([
      'Tap **Today**.',
      'Tap **Log a symptom**.',
      'Tap each thing you feel, like **Bloating** or **Headache**.',
      'Under each one, tap how bad it is: **Mild**, **Moderate**, or **Bad**. Fix the time if it started earlier.',
      'Tap **Save**.'
    ]),
    P('Feeling fine? Tap **Feeling fine today**. Good days count too. They help your doctor see the whole picture.'),
    H2('Changing a meal you do not want'),
    steps([
      'Tap **Meals**.',
      'Tap the button with two arrows next to the meal.',
      'Pick a different meal and tap **Use this**.'
    ]),
    P('Some meals say **Caution**. That means one ingredient might bother you. The app will ask "are you sure?" before it adds one. Meals marked **Pass** are the safe ones.'),

    H1('Part 4: Your doctor report'),
    steps([
      'Tap **Report** at the bottom.',
      'Choose how far back to go, from 7 days up to 6 months.',
      'Tap **Print** to print it, or **Save as file** to email it to your doctor.'
    ]),
    P('The report shows what you ate, how you felt, and your weight. It is a record. It does not diagnose anything.'),

    H1('Part 5: Keep a backup'),
    P('Your information lives only on your phone. If the phone is lost or broken, the information goes with it. A backup fixes that. Do this once a month.'),
    steps([
      'Tap **Today**.',
      'Scroll down to the part called **Also**.',
      'Tap **Send a backup**.',
      'Tap **Save to Files**, then tap **Save**. Or tap **Mail** and send it to your own email address.'
    ]),
    P('Got a new phone? Put the app on it (Part 1). Then tap **More**, then **Settings**, then **Choose a file to import**, and pick your backup.'),

    H1('If something goes wrong'),
    bullets([
      '**The app looks empty and my information is gone.** You probably opened the text link instead of the green bowl. Close it and tap the green bowl on your home screen.',
      '**The words are too small.** Tap **More**, then **Settings**. Turn on **Large text**.',
      '**I can\'t find Add to Home Screen.** In the Share menu, scroll all the way down. You may need to tap **Edit Actions** or **More** to see it. iPhone menus look a little different depending on how new your phone is.',
      '**Something looks old.** Close the app and open it again while you have Wi-Fi or cell service. It updates itself.',
      '**Still stuck?** Call the person who sent you the link. There is no wrong answer and nothing you can break.'
    ])
  ]
});

// ---------------- FULL ----------------
const full = build({
  title: 'Peace Meal',
  subtitle: 'The full version. How to set it up on your iPhone, and how it compares to the lite version.',
  url: FULL_URL, body: 12, file: path.join(OUT, 'Peace-Meal-Full-iPhone-Guide.docx'),
  sections: ({ P, H1, H2, steps, bullets, box, table, gap }) => [
    H1('What this app does'),
    P('Peace Meal plans meals for people with food allergies, health conditions, or special diets. You tell it what each person cannot eat. It plans a week of meals that are safe, builds the grocery list, and keeps a food and symptom record you can show a doctor.'),
    box('Before you start', [
      'No account, no password, no App Store download.',
      'Everything stays on the phone you use. Nobody else can see it, including the person who sent you the link.',
      'The app records and plans. It does not diagnose or treat. Medical targets come from your doctor or dietitian.'
    ], 'F2F6F1'),

    H1('Lite or full: which one?'),
    P('There are two versions. Both use the same safety rules and the same recipe checker.'),
    table([{ t: '', w: 2400 }, { t: 'Peace Meal for one (lite)', w: 3480 }, { t: 'Peace Meal (full)', w: 3480 }], [
      ['Best for', 'One person who wants it simple', 'Families, or anyone who wants every feature'],
      ['People', 'Just you', 'As many people as you want, each with their own plan'],
      ['Main screens', 'Today, Meals, Recipes, Report, More', 'Home, Today, Check, Week, More'],
      ['Household meals', 'No', 'Yes. **Together** plans one meal that works for everyone at the table'],
      ['Grocery and pantry', 'Yes', 'Yes, plus household grocery lists'],
      ['Doctor report', 'Yes', 'Yes'],
      ['Recipes', 'Peace Meal, NHS, Parent Club Scotland, NHLBI, the VA, USDA MyPlate Kitchen, and the Wikibooks Cookbook (about 2,300, mostly without nutrition numbers)', 'The same'],
      ['Link ends in', '/lite/', '/full/']
    ]),
    gap(),
    P('Pick one per phone. The two keep separate saved information: people you set up in one do not show up in the other.'),

    H1('Step 1: Put the app on your iPhone'),
    steps([
      'Tap the link. It opens in **Safari**.',
      'Tap the three dots (**•••**) at the bottom of Safari, then **Share** (a square with an arrow pointing up). On an iPad, Share is at the top of the screen; on some iPhones it is right on the bottom bar.',
      'Scroll down and tap **Add to Home Screen**.',
      'Tap **Add**. A green bowl icon named **Peace Meal** appears on your home screen.'
    ]),
    box('Important', [
      'Always open the app from the home screen icon. On iPhone, Safari and the icon keep separate storage. If you set up in one and open the other, the app looks empty. Your data is not gone. You are just in the other one.'
    ], 'FFF4E5'),
    H2('On an Android phone'),
    steps([
      'Tap the link. It opens in **Chrome**.',
      'Tap the three dots (**⋮**) at the top right, then **Add to Home screen** (some phones say **Install app**).',
      'Tap **Install** or **Add**, and **Add** again if your phone asks where to put it.'
    ]),
    P('Samsung Internet: tap the three lines (**≡**) at the bottom right, then **Add page to**, then **Home screen**. On Android the icon and the browser keep the same information.'),

    H1('Step 2: Set up the first person'),
    steps([
      'Open the app from the icon. Tap **Set up the first person**.',
      'Type a name and tap **Continue**.',
      'Work through each page. Tap **Next** to move on and **Back** to fix something.',
      'On the last page, **Review**, tap **Save and see my plan**.'
    ]),
    P('The setup pages:'),
    bullets([
      '**Basics:** age, height, weight, activity.',
      '**Allergies:** hard stops. Anything ticked here is never planned.',
      '**Conditions and diets:** health conditions and ways of eating. Each one brings in published guidelines with sources. Tap **About** to read first.',
      '**Likes and dislikes:** soft choices like spice level and cuisines. These never override an allergy.',
      '**Medications:** a few yes or no questions about medicines that interact with food.',
      '**Numbers from your doctor:** only appears when a condition needs a limit the app is not allowed to guess, like a protein limit.',
      '**Cooking:** your time, cooking days, kitchen tools, and skill.',
      '**Review:** everything on one page.'
    ]),
    H2('Adding more people'),
    steps([
      'Tap **More**, then **People**.',
      'Tap **Add a person** and go through the same pages.',
      'To switch people, tap the name at the top right of the screen. On the People page, tap **Set active** next to the person you want.'
    ]),

    H1('Step 3: Everyday use'),
    table([{ t: 'Screen', w: 2400 }, { t: 'What it is for', w: 6960 }], [
      ['Home', 'A summary for the person you have selected.'],
      ['Today', 'Log what you ate, your weight, and activity.'],
      ['Check', 'Paste an ingredient list from a package, or snap a photo, and get a plain answer: fine, caution, or not allowed.'],
      ['Week', 'The week of meals. Tap the two arrows to swap a meal.'],
      ['More', 'People, Plan, Recipes, Grocery, Pantry, Together, Log, Report, Breathe, Learn, and Settings.']
    ]),
    gap(),
    H2('What the colors mean'),
    bullets([
      '**Pass (green):** safe for this person. Only Pass meals are planned automatically.',
      '**Caution (amber):** something needs a look, like an ingredient that might bother them. You can still swap one in yourself. The app asks you first.',
      '**Fail (red):** not allowed, usually an allergy. Never planned and cannot be swapped in.'
    ]),
    H2('Doctor report'),
    P('Tap **More**, then **Report**. Choose a date range, then print it or save it as a file to email. It lists what was eaten, symptoms and when they happened, and weight over time.'),

    H1('Backups'),
    P('Data lives only on the phone. Back it up once a month.'),
    steps([
      'Tap **More**, then **Settings**.',
      'Under **Backup**, tap **Send a backup**.',
      'Choose **Save to Files** (iCloud is best), or **Mail** it to yourself.'
    ]),
    P('To restore on a new phone: install the app (Step 1), then go to **Settings** and tap **Choose a file to import**.'),

    H1('Troubleshooting'),
    bullets([
      '**The app is empty.** You opened the link in Safari instead of the home screen icon, or the other way around. Use the icon.',
      '**Text is too small.** More, Settings, turn on **Large text**.',
      '**Add to Home Screen is missing.** Scroll to the bottom of the Share menu. The menu varies a little by iPhone software version.',
      '**It seems out of date.** Open the app while online. Updates install themselves the next time it opens.'
    ])
  ]
});
Promise.all([lite, full]).then(() => console.log('written'));
