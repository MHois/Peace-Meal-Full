// Shared store layer for the claude.ai-hosted version. Everything here is optional: when the db capability is absent
// (single file, folder, or a viewer without access) every function returns null or [] and the app stays device-only.
//
// Layout in the shared store (all ciphertext except the directory):
//   meta/owner                      { fingerprint, publicJwk, name, created }             the first device to claim it
//   devices/<fingerprint>           { fingerprint, publicJwk, name, created }             every device that has opened the app
//   directory/<personId>            { personId, name, initials, deviceFingerprint, updated } names only, visible to everyone
//   profiles/<personId>             { box, keys: { <fingerprint>: wrapped }, deviceFingerprint, updated }
//   shares/<shareId>                { from, to (fingerprint), personName, parts: [..], box, key: wrapped, created, expires }
// Named imports, not a namespace: tools/bundle.mjs pastes the modules together, and a namespace object would not exist (N5).
import { cryptoAvailable, decryptJson, encryptJson, fingerprintOf, generateDeviceKey, newContentKey, openWithPassphrase, sealWithPassphrase, shortId, unwrapKey, wrapKeyFor } from './crypto.js';

const LS_KEY = 'peace-meal:device';

export function loadDeviceIdentity() {
  try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export async function ensureDeviceIdentity(name = 'This device') {
  let id = loadDeviceIdentity();
  if (id && id.fingerprint) return id;
  if (!cryptoAvailable()) return null;
  const k = await generateDeviceKey();
  id = { ...k, name, created: new Date().toISOString() };
  try { localStorage.setItem(LS_KEY, JSON.stringify(id)); } catch { /* ignore */ }
  return id;
}
export function forgetDeviceIdentity() { try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ } }

export async function getDb() {
  try {
    if (typeof window === 'undefined' || !window.claude || typeof window.claude.use !== 'function') return null;
    return await window.claude.use('db');
  } catch { return null; }
}

function publicPart(id) { return { kty: id.publicJwk.kty, crv: id.publicJwk.crv, x: id.publicJwk.x, y: id.publicJwk.y }; }

// P2-7 (audit of September 30, 2026). What each new box and wrapped key is bound to (format 2, src/engine/crypto.js):
// a box copied into another person's record or another share, or a key wrapped for another reader, does not open.
const SYNC_AD = {
  profile: (personId, publisherFp) => `peace-meal/profile/${personId}/${publisherFp}`,
  profileKey: (personId, publisherFp, readerFp) => `peace-meal/profile-key/${personId}/${publisherFp}/${readerFp}`,
  share: (id, fromFp, toFp) => `peace-meal/share/${id}/${fromFp}/${toFp}`,
  shareKey: (id, fromFp, toFp) => `peace-meal/share-key/${id}/${fromFp}/${toFp}`
};
// A wrapped key names the public key it was made with. It is accepted only when that key is the one the named device
// registered in the store, so nobody can write a profile or share that opens as if another device had made it. A
// device that never registered cannot be checked, so its records are refused.
async function syncSenderOk(db, wrapped, claimedFp) {
  if (!wrapped || !wrapped.sender || !claimedFp) return false;
  if ((await fingerprintOf(wrapped.sender)) !== claimedFp) return false;
  try {
    const s = await db.doc('devices/' + claimedFp).get();
    const k = s && s.exists ? (s.data() || {}).publicJwk : null;
    return !!(k && k.kty === wrapped.sender.kty && k.crv === wrapped.sender.crv && k.x === wrapped.sender.x && k.y === wrapped.sender.y);
  } catch { return false; }
}

export async function registerDevice(db, identity) {
  if (!db || !identity) return false;
  try { await db.doc('devices/' + identity.fingerprint).set({ fingerprint: identity.fingerprint, publicJwk: publicPart(identity), name: identity.name || 'Device', created: identity.created || new Date().toISOString() }); return true; } catch { return false; }
}

export async function readOwner(db) {
  if (!db) return null;
  try { const s = await db.doc('meta/owner').get(); return s && s.exists ? s.data() : null; } catch { return null; }
}
// The first device to claim the owner role keeps it. Later claims fail unless the caller already is the owner.
export async function claimOwner(db, identity, name) {
  const cur = await readOwner(db);
  if (cur && cur.fingerprint !== identity.fingerprint) return { ok: false, reason: 'already-claimed', owner: cur };
  try { await db.doc('meta/owner').set({ fingerprint: identity.fingerprint, publicJwk: publicPart(identity), name: name || identity.name || 'Owner', created: cur ? cur.created : new Date().toISOString() }); return { ok: true }; } catch (e) { return { ok: false, reason: e && e.code || 'error' }; }
}
export function isOwner(identity, owner) { return !!(identity && owner && identity.fingerprint === owner.fingerprint); }

function initials(name) { return String(name || '?').split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase(); }

// Encrypt a person for the store: readable by this device and by the owner (if an owner exists).
export async function publishPerson(db, identity, person) {
  if (!db || !identity) return { ok: false, reason: 'unavailable' };
  const owner = await readOwner(db);
  const contentKey = await newContentKey();
  const box = await encryptJson(contentKey, person, SYNC_AD.profile(person.id, identity.fingerprint));
  const keys = {};
  keys[identity.fingerprint] = await wrapKeyFor(contentKey, identity.privateJwk, identity.publicJwk, publicPart(identity), SYNC_AD.profileKey(person.id, identity.fingerprint, identity.fingerprint));
  if (owner && owner.fingerprint !== identity.fingerprint) keys[owner.fingerprint] = await wrapKeyFor(contentKey, identity.privateJwk, identity.publicJwk, owner.publicJwk, SYNC_AD.profileKey(person.id, identity.fingerprint, owner.fingerprint));
  const now = new Date().toISOString();
  try {
    await db.doc('profiles/' + person.id).set({ box, keys, deviceFingerprint: identity.fingerprint, updated: now });
    await db.doc('directory/' + person.id).set({ personId: person.id, name: person.name, initials: initials(person.name), deviceFingerprint: identity.fingerprint, updated: now });
    return { ok: true };
  } catch (e) { return { ok: false, reason: e && e.code || 'error' }; }
}

export async function removePerson(db, personId) {
  if (!db) return false;
  try { await db.doc('profiles/' + personId).delete(); await db.doc('directory/' + personId).delete(); return true; } catch { return false; }
}

export async function listDirectory(db) {
  if (!db) return [];
  try { const q = await db.collection('directory').get(); return (q.docs || q).map(d => (typeof d.data === 'function' ? d.data() : d)).filter(Boolean); } catch { return []; }
}

// Open a profile this device is allowed to read (its own, or any profile when this device is the owner).
export async function openPerson(db, identity, personId) {
  if (!db || !identity) return null;
  try {
    const s = await db.doc('profiles/' + personId).get();
    if (!s || !s.exists) return null;
    const rec = s.data();
    const wrapped = rec.keys && rec.keys[identity.fingerprint];
    if (!wrapped) return { locked: true, personId };
    if (!(await syncSenderOk(db, wrapped, rec.deviceFingerprint))) return { locked: true, personId, error: true, reason: 'sender' };
    let person = null;
    try {
      const key = await unwrapKey(wrapped, identity.privateJwk, SYNC_AD.profileKey(personId, rec.deviceFingerprint, identity.fingerprint));
      person = await decryptJson(key, rec.box, SYNC_AD.profile(personId, rec.deviceFingerprint));
    } catch { return { locked: true, personId, error: true, reason: 'unreadable' }; }   // changed, moved (format 2), or damaged
    // Format 1 records carry no context, so a moved one is caught here: the person inside must be the one asked for.
    if (!person || person.id !== personId) return { locked: true, personId, error: true, reason: 'moved' };
    return { locked: false, personId, person, updated: rec.updated, deviceFingerprint: rec.deviceFingerprint };
  } catch { return { locked: true, personId, error: true }; }
}

// Build the shareable subset of a person by parts.
export const SHARE_PARTS = [
  { id: 'rules', label: 'Food limits and special diets', pick: p => ({ modules: p.modules, allergens: p.allergens, preferences: p.preferences, custom_modules: p.custom_modules, variants: p.variants, tier2: p.tier2, medications: p.medications, flags: p.flags, phases: p.phases, modes: p.modes, optional_rules: p.optional_rules, rule_settings: p.rule_settings, confirmations: p.confirmations, acknowledged: p.acknowledged }) },
  { id: 'cooking', label: 'Cooking time and kitchen', pick: p => ({ cooking: p.cooking }) },
  { id: 'grocery', label: 'This week\'s grocery list', pick: (p, extra) => ({ grocery: extra && extra.grocery || null }) },
  { id: 'week', label: 'Meal plan (chosen days or the week)', pick: (p, extra) => ({ week: extra && extra.week || null }) }
];
export function buildSharePackage(person, partIds, extra = {}) {
  const out = { shared: true, version: 2, name: person.name, adult: person.adult !== false, sex: person.sex || '', age: person.age || null, parts: [], exported: new Date().toISOString() };
  for (const part of SHARE_PARTS) if (partIds.includes(part.id)) { Object.assign(out, part.pick(person, extra)); out.parts.push(part.id); }
  return out;
}

export async function sendShare(db, identity, recipientDevice, person, partIds, extra = {}, days = 30) {
  if (!db || !identity || !recipientDevice) return { ok: false, reason: 'unavailable' };
  const pkg = buildSharePackage(person, partIds, extra);
  const id = shortId();
  const contentKey = await newContentKey();
  const box = await encryptJson(contentKey, pkg, SYNC_AD.share(id, identity.fingerprint, recipientDevice.fingerprint));
  const key = await wrapKeyFor(contentKey, identity.privateJwk, identity.publicJwk, recipientDevice.publicJwk, SYNC_AD.shareKey(id, identity.fingerprint, recipientDevice.fingerprint));
  const created = new Date();
  const expires = new Date(created.getTime() + days * 86400000);
  // P2-7: no "fromName" any more: it was the sender's own say-so, in plain text. The inbox names the sender from the
  // device list, which is tied to the sender's key.
  try { await db.doc('shares/' + id).set({ id, from: identity.fingerprint, to: recipientDevice.fingerprint, personName: person.name, parts: pkg.parts, box, key, created: created.toISOString(), expires: expires.toISOString() }); return { ok: true, id }; } catch (e) { return { ok: false, reason: e && e.code || 'error' }; }
}
export async function listSharesForMe(db, identity) {
  if (!db || !identity) return [];
  try {
    const q = await db.collection('shares').where('to', '==', identity.fingerprint).get();
    const now = Date.now();
    return (q.docs || q).map(d => (typeof d.data === 'function' ? d.data() : d)).filter(s => s && (!s.expires || Date.parse(s.expires) > now));
  } catch { return []; }
}
// Null when the share is not for this device, does not come from the device it names (P2-7), was moved, or is damaged.
export async function openShare(db, identity, share) {
  try {
    if (!share || !identity || share.to !== identity.fingerprint) return null;
    if (!(await syncSenderOk(db, share.key, share.from))) return null;
    const key = await unwrapKey(share.key, identity.privateJwk, SYNC_AD.shareKey(share.id, share.from, share.to));
    return await decryptJson(key, share.box, SYNC_AD.share(share.id, share.from, share.to));
  } catch { return null; }
}
export async function listDevices(db) {
  if (!db) return [];
  try { const q = await db.collection('devices').get(); return (q.docs || q).map(d => (typeof d.data === 'function' ? d.data() : d)).filter(Boolean); } catch { return []; }
}

// Owner recovery: seal the owner's device identity with a passphrase so it can be restored on another device.
export async function sealOwnerBackup(identity, passphrase) { return sealWithPassphrase(passphrase, identity); }
export async function restoreOwnerBackup(box, passphrase) {
  const id = await openWithPassphrase(passphrase, box);
  if (!id || !id.fingerprint || !id.privateJwk) throw new Error('Not an owner backup.');
  try { localStorage.setItem(LS_KEY, JSON.stringify(id)); } catch { /* ignore */ }
  return id;
}
