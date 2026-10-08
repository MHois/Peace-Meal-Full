# iPhone check: 10 minutes

This covers what could not be tested on the audit machine, which had no iPhone and no Safari engine. Do it on the iPhone that uses Peace Meal for one. Tick each box. If something doesn't match "You should see", write down the step number and what you saw.

**Before you start (1 minute)**

- [ ] **0.1 Save a backup first.** Open Peace Meal for one from its Home Screen icon. Go to Settings > **Send a backup** > **Save to Files**. You should see the file in the Files app. Nothing below deletes anything, but do this first anyway.
- [ ] **0.2 Write down the iOS version:** Settings app > General > About > iOS Version.

**Old icons (2 minutes).** Only if the phone has an older Peace Meal icon, made before October 2026 from an address ending in `specialty-nutrition-app`.

- [ ] **1.1** With Wi-Fi on, tap the old icon. **You should see** a GitHub "404" page (icons made from `/lite/` or `/full/`), or the old app (an icon made from the old front page). Write down which.
- [ ] **1.2** Only if there is data in it that is not in the new app: turn on **Airplane Mode**, tap the old icon, then Settings > **Send a backup** (or **Export JSON**) > Save to Files. Turn Airplane Mode off. In the new app, go to Settings > **Choose a file to import** (or tap **Bring my data** on the first screen of a fresh install) and choose that file. **You should see** the old entries in the new app.
- [ ] **1.3** Do **not** delete the old icon yet. The audit report explains the safest way to retire it.

**The app itself (5 minutes)**

- [ ] **2.0 How long it takes to open.** Swipe Peace Meal for one away completely. Then tap its icon and count the seconds until Today shows the planned meals. Write the number down. (On the audit machine this took about 5 seconds at full speed and about 25 seconds when slowed to a mid-range phone's speed.)
- [ ] **2.1 Typed label.** Check tab (under More) > type `wheat flour, peanuts` > Check this list. **You should see** a red "no" answer if the person avoids wheat, gluten, or peanuts.
- [ ] **2.2 Unknown word.** Clear, type `xqzt` > Check this list. **You should see** "Not sure. Ask before eating."
- [ ] **2.3 Photo, first time (Wi-Fi on).** Tap Photo of the label and photograph the ingredient list on any package. **You should see** "Reading the label..." and then the text in the box within about a minute.
- [ ] **2.4 Photo, second time with no internet.** Turn on Airplane Mode and photograph a label again. Write down whether it still reads the text. The audit could confirm this only in Chrome, not Safari.
- [ ] **2.5 Opens with no internet.** Still in Airplane Mode, swipe the app away completely, then open it again from its icon. **You should see** the app with the person's data. Turn Airplane Mode off.
- [ ] **2.6 Remove and Undo.** On Today, tap Remove on any entry, then Undo within 10 seconds. **You should see** the entry come back.
- [ ] **2.7 Print the report.** Report tab > Print. **You should see** the iPhone print preview showing the report. Cancel.
- [ ] **2.8 Bigger text.** In Safari, open the lite address, tap **aA**, and set the size to 200%. Scroll Today and Report. Write down any screen that has to be dragged sideways to read. The audit found 12 such screens in Chrome with doubled text. Set it back to 100%.

**VoiceOver (2 minutes, optional)**

- [ ] **3.1** Turn on VoiceOver (Settings > Accessibility > VoiceOver, or triple-click the side button if that shortcut is set). On the Check screen, check a label. **You should hear** the answer read out without moving to it.
- [ ] **3.2** On Today, remove an entry. **You should hear** "Removed" and "Undo". Tap Undo, then turn VoiceOver off.

**When done**

- [ ] **4.1** Settings > Send a backup > Save to Files once more, so the newest copy is saved.
- [ ] **4.2** Send the step numbers that didn't match, and the iOS version, to whoever fixes the app.
