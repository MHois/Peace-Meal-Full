// P2-7 (audit of September 30, 2026): hosted sharing (claude.ai only; it never starts on GitHub Pages) opened any
// profile or share whose key was wrapped for the reader, whoever made it. The sender's key inside a record was never
// checked against the device the record names, and nothing tied a box to its record, so a box could be moved to
// another person or share and open there. The owner backup used PBKDF2 at 310,000 iterations (OWASP's Password Storage
// Cheat Sheet gives 600,000 for PBKDF2-HMAC-SHA256), with a key that could be exported for no reason.
// Now: a record opens only when the key it was made with is the one the named device registered; new records are
// bound to their person or share and devices (format 2); records written before still open (format 1); new owner
// backups use 600,000 iterations, old ones still open, and the passphrase key cannot be exported.
// The stand-in store below has the calls the app uses (doc get/set/delete, collection get/where). Every person and
// device here is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: k => { mem.delete(k); } };
const C = await import('../src/engine/crypto.js');
const S = await import('../src/engine/sync.js');

function fakeDb() {
  const docs = new Map();
  const copy = v => JSON.parse(JSON.stringify(v));
  const snap = p => ({ exists: docs.has(p), data: () => copy(docs.get(p)) });
  return {
    docs,
    doc: p => ({ get: async () => snap(p), set: async v => { docs.set(p, copy(v)); }, delete: async () => { docs.delete(p); } }),
    collection: c => {
      const all = () => [...docs.entries()].filter(([k]) => k.startsWith(c + '/')).map(([, v]) => ({ data: () => copy(v) }));
      return { get: async () => ({ docs: all() }), where: (f, op, val) => ({ get: async () => ({ docs: all().filter(d => d.data()[f] === val) }) }) };
    }
  };
}
async function device(name) { return { ...(await C.generateDeviceKey()), name, created: '2026-10-01T00:00:00.000Z' }; }
const person = (id, name, allergens) => ({ id, name, adult: true, modules: [], allergens, preferences: { avoid_tags: [], avoid_terms: [] } });
const pub = d => ({ kty: d.publicJwk.kty, crv: d.publicJwk.crv, x: d.publicJwk.x, y: d.publicJwk.y });

// A household store: an owner, a kitchen tablet that publishes two people, and a device that should not be trusted.
async function household() {
  const db = fakeDb();
  const owner = await device('Owner phone'), tablet = await device('Kitchen tablet'), stranger = await device('Stranger');
  for (const d of [owner, tablet, stranger]) assert.ok(await S.registerDevice(db, d));
  assert.ok((await S.claimOwner(db, owner, 'Owner')).ok);
  const a = person('p-a', 'Test Person A', ['allergen-peanut']), b = person('p-b', 'Test Person B', ['allergen-milk']);
  assert.ok((await S.publishPerson(db, tablet, a)).ok);
  assert.ok((await S.publishPerson(db, tablet, b)).ok);
  return { db, owner, tablet, stranger, a, b };
}

test('P2-7: a profile opens for the device that published it and for the owner, and stays locked for others', async () => {
  const { db, owner, tablet, stranger } = await household();
  assert.deepEqual((await S.openPerson(db, tablet, 'p-a')).person.allergens, ['allergen-peanut']);
  assert.deepEqual((await S.openPerson(db, owner, 'p-a')).person.allergens, ['allergen-peanut']);
  assert.equal((await S.openPerson(db, stranger, 'p-a')).locked, true);
});

test('P2-7: a profile written with another key than its device\'s is refused', async () => {
  const { db, owner, tablet, stranger } = await household();
  // The stranger rewrites Test Person A with no allergies, wraps the key for the owner with the stranger's own key,
  // and names the tablet as the device that published it.
  const forged = person('p-a', 'Test Person A', []);
  const k = await C.newContentKey();
  await db.doc('profiles/p-a').set({ box: await C.encryptJson(k, forged), keys: { [owner.fingerprint]: await C.wrapKeyFor(k, stranger.privateJwk, stranger.publicJwk, pub(owner)) }, deviceFingerprint: tablet.fingerprint, updated: '2026-10-01T00:00:00.000Z' });
  const r = await S.openPerson(db, owner, 'p-a');
  assert.equal(r.locked, true, 'the forged profile does not open');
  assert.equal(r.reason, 'sender');
  // The same, naming a device that was never registered in the store
  const ghost = await device('Ghost');
  await db.doc('profiles/p-a').set({ box: await C.encryptJson(k, forged), keys: { [owner.fingerprint]: await C.wrapKeyFor(k, ghost.privateJwk, ghost.publicJwk, pub(owner)) }, deviceFingerprint: ghost.fingerprint, updated: '2026-10-01T00:00:00.000Z' });
  assert.equal((await S.openPerson(db, owner, 'p-a')).reason, 'sender', 'an unregistered device cannot be checked, so it is refused');
});

test('P2-7: a profile moved to another person\'s record does not open', async () => {
  const { db, owner } = await household();
  const recA = db.docs.get('profiles/p-a');
  db.docs.set('profiles/p-b', JSON.parse(JSON.stringify(recA)));   // Person A's box and keys, filed under Person B
  const r = await S.openPerson(db, owner, 'p-b');
  assert.equal(r.locked, true, 'Person B is not shown with Person A\'s allergies');
  assert.equal(r.reason, 'unreadable', 'and the screen says why');
});

test('P2-7: a share made with another key than the device it names is refused, and a moved share does not open', async () => {
  const { db, owner, tablet, stranger, a } = await household();
  assert.ok((await S.sendShare(db, tablet, { fingerprint: owner.fingerprint, publicJwk: pub(owner) }, a, ['rules'], {}, 30)).ok);
  const [real] = await S.listSharesForMe(db, owner);
  assert.deepEqual((await S.openShare(db, owner, real)).allergens, ['allergen-peanut'], 'a real share opens');
  // forged: made with the stranger's key, naming the tablet as the sender
  const k = await C.newContentKey();
  const pkg = S.buildSharePackage(person('p-a', 'Test Person A', []), ['rules']);
  const fake = { id: 'forged1', from: tablet.fingerprint, to: owner.fingerprint, personName: 'Test Person A', parts: ['rules'], box: await C.encryptJson(k, pkg), key: await C.wrapKeyFor(k, stranger.privateJwk, stranger.publicJwk, pub(owner)), created: '2026-10-01T00:00:00.000Z', expires: '2099-01-01T00:00:00.000Z' };
  assert.equal(await S.openShare(db, owner, fake), null, 'the forged share does not open');
  // moved: the real share's box and key under another id
  assert.equal(await S.openShare(db, owner, { ...real, id: 'other-id' }), null, 'a share copied under another id does not open');
});

test('P2-7: profiles and shares written before this change still open', async () => {
  // Written the way the code before October 2026 wrote them: no associated data (format 1).
  const { db, owner, tablet } = await household();
  const old = person('p-old', 'Test Person Old', ['allergen-egg']);
  const k = await C.newContentKey();
  await db.doc('profiles/p-old').set({ box: await C.encryptJson(k, old), keys: { [owner.fingerprint]: await C.wrapKeyFor(k, tablet.privateJwk, tablet.publicJwk, pub(owner)) }, deviceFingerprint: tablet.fingerprint, updated: '2026-09-01T00:00:00.000Z' });
  assert.equal(db.docs.get('profiles/p-old').box.v, 1);
  assert.deepEqual((await S.openPerson(db, owner, 'p-old')).person.allergens, ['allergen-egg']);
  const k2 = await C.newContentKey();
  const share = { id: 'oldshare', from: tablet.fingerprint, to: owner.fingerprint, personName: 'Test Person Old', parts: ['rules'], box: await C.encryptJson(k2, S.buildSharePackage(old, ['rules'])), key: await C.wrapKeyFor(k2, tablet.privateJwk, tablet.publicJwk, pub(owner)), created: '2026-09-01T00:00:00.000Z', expires: '2099-01-01T00:00:00.000Z' };
  assert.deepEqual((await S.openShare(db, owner, share)).allergens, ['allergen-egg']);
  // New records are format 2
  assert.equal(db.docs.get('profiles/p-a').box.v, 2);
  assert.equal(db.docs.get('profiles/p-a').keys[owner.fingerprint].v, 2);
});

test('P2-7: owner backups use 600,000 iterations; ones made at 310,000 still open; other counts are refused', async () => {
  const owner = await device('Owner phone');
  const sealed = await C.sealWithPassphrase('made up passphrase', owner);
  assert.equal(sealed.kdf, 'pbkdf2-sha256-600000');
  assert.equal((await C.openWithPassphrase('made up passphrase', sealed)).fingerprint, owner.fingerprint);
  await assert.rejects(() => C.openWithPassphrase('wrong passphrase', sealed));
  // A backup made the old way: PBKDF2-SHA-256 at 310,000 iterations, AES-GCM, no associated data.
  const subtle = globalThis.crypto.subtle, te = new TextEncoder();
  const b64 = buf => Buffer.from(buf).toString('base64');
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16)), iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const base = await subtle.importKey('raw', te.encode('made up passphrase'), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 310000 }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(owner)));
  const oldBox = { iv: b64(iv), ct: b64(ct), v: 1, salt: b64(salt), kdf: 'pbkdf2-sha256-310000' };
  assert.equal((await C.openWithPassphrase('made up passphrase', oldBox)).fingerprint, owner.fingerprint, 'an old backup still opens');
  await assert.rejects(() => C.openWithPassphrase('made up passphrase', { ...oldBox, kdf: 'pbkdf2-sha256-1' }), 'a count this app never wrote is refused');
  await assert.rejects(() => C.openWithPassphrase('made up passphrase', { ...oldBox, kdf: 'pbkdf2-sha256-999999999' }));
});

test('P2-7: the passphrase key cannot be exported', async () => {
  const r = await C.passphraseKey('made up passphrase');
  assert.equal(r.key.extractable, false);
  assert.equal(r.rawB64, undefined);
});

test('P2-7: the share inbox names the sender from the device list, not from the share itself', () => {
  const together = fs.readFileSync(new URL('../src/ui/together.js', import.meta.url), 'utf8');
  assert.doesNotMatch(together, /sh\.fromName \|\|/, 'a share\'s own "fromName" is not shown as the sender');
  const sync = fs.readFileSync(new URL('../src/engine/sync.js', import.meta.url), 'utf8');
  assert.doesNotMatch(sync, /fromName:/, 'new shares no longer carry the sender\'s name in plain text');
});

test('P2-7: the rest of the sharing calls: device key, store lookup, directory, removal, owner backup', async () => {
  mem.clear();
  assert.equal(S.loadDeviceIdentity(), null);
  const id = await S.ensureDeviceIdentity('Test device');
  assert.ok(id.fingerprint && id.privateJwk, 'a device key is made');
  assert.equal((await S.ensureDeviceIdentity('Another name')).fingerprint, id.fingerprint, 'and kept');
  assert.equal(await S.getDb(), null, 'outside claude.ai there is no shared store');
  const { db, owner, tablet } = await household();
  assert.deepEqual((await S.listDirectory(db)).map(r => r.name).sort(), ['Test Person A', 'Test Person B']);
  assert.equal((await S.listDevices(db)).length, 3);
  assert.ok(await S.removePerson(db, 'p-b'));
  assert.equal(await S.openPerson(db, owner, 'p-b'), null, 'removed');
  const sealed = await S.sealOwnerBackup(owner, 'made up passphrase');
  S.forgetDeviceIdentity();
  assert.equal(S.loadDeviceIdentity(), null);
  assert.equal((await S.restoreOwnerBackup(sealed, 'made up passphrase')).fingerprint, owner.fingerprint);
  assert.equal(S.loadDeviceIdentity().fingerprint, owner.fingerprint, 'the owner key is back on this device');
  const notAKey = await C.sealWithPassphrase('made up passphrase', { note: 'not a key' });
  await assert.rejects(() => S.restoreOwnerBackup(notAKey, 'made up passphrase'), /Not an owner backup/);
  assert.deepEqual(await S.listSharesForMe(db, tablet), []);
});
