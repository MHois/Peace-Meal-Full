// End-to-end encryption for shared profiles. WebCrypto only; no library.
// Model: each device holds an ECDH P-256 keypair. Each profile is encrypted with its own random AES-GCM key.
// That profile key is wrapped (encrypted) for every reader allowed to open it: the profile's own device and the owner.
// The owner additionally derives a recovery key from a passphrase so the owner role can move between devices.
// Anyone can read ciphertext from the shared store; only a wrapped-key holder can decrypt it.
// Since October 2026 (P2-7): new boxes and wrapped keys are bound to their record (format 2), and src/engine/sync.js
// opens a record only when its sender key is the one the named device registered.

const subtle = () => (globalThis.crypto && globalThis.crypto.subtle) || null;
const enc = new TextEncoder();
const dec = new TextDecoder();

export function cryptoAvailable() { return !!subtle(); }

function b64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function unb64(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
function rand(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return a; }

export async function generateDeviceKey() {
  const kp = await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']);
  const pub = await subtle().exportKey('jwk', kp.publicKey);
  const priv = await subtle().exportKey('jwk', kp.privateKey);
  return { publicJwk: pub, privateJwk: priv, fingerprint: await fingerprintOf(pub) };
}

export async function fingerprintOf(publicJwk) {
  const raw = enc.encode(JSON.stringify({ crv: publicJwk.crv, kty: publicJwk.kty, x: publicJwk.x, y: publicJwk.y }));
  const h = await subtle().digest('SHA-256', raw);
  return b64(h).replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
}

async function importPub(jwk) { return subtle().importKey('jwk', { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, ext: true }, { name: 'ECDH', namedCurve: 'P-256' }, true, []); }
async function importPriv(jwk) { return subtle().importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']); }

// Shared secret between my private key and their public key -> AES-GCM key used only to wrap profile keys.
async function wrappingKey(myPrivateJwk, theirPublicJwk, salt) {
  const priv = await importPriv(myPrivateJwk);
  const pub = await importPub(theirPublicJwk);
  const bits = await subtle().deriveBits({ name: 'ECDH', public: pub }, priv, 256);
  const base = await subtle().importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('peace-meal-wrap-v1') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function newContentKey() {
  const k = await subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  return b64(await subtle().exportKey('raw', k));
}
async function importContentKey(rawB64) { return subtle().importKey('raw', unb64(rawB64), 'AES-GCM', false, ['encrypt', 'decrypt']); }

// Format 2 (P2-7, audit of September 30, 2026): a box or wrapped key made with a context string `ad` is bound to it as
// AES-GCM associated data, so it opens only with the same context (its own person or share, its own devices). Format 1
// has no context and still opens, so nothing written before is lost. Any other format is refused.
function cryptoParams(iv, ad) { const p = { name: 'AES-GCM', iv }; if (ad) p.additionalData = enc.encode(ad); return p; }
function cryptoOpenParams(box, ad) {
  if (box.v === 2) { if (!ad) throw new Error('This record needs its context to open.'); return cryptoParams(unb64(box.iv), ad); }
  if (box.v === 1 || box.v === undefined) return cryptoParams(unb64(box.iv));
  throw new Error('Unknown record format.');
}
async function cryptoSeal(key, obj, ad) {
  const iv = rand(12);
  const ct = await subtle().encrypt(cryptoParams(iv, ad), key, enc.encode(JSON.stringify(obj)));
  return { iv: b64(iv), ct: b64(ct), v: ad ? 2 : 1 };
}
async function cryptoOpen(key, box, ad) {
  const pt = await subtle().decrypt(cryptoOpenParams(box, ad), key, unb64(box.ct));
  return JSON.parse(dec.decode(pt));
}
export async function encryptJson(contentKeyB64, obj, ad) { return cryptoSeal(await importContentKey(contentKeyB64), obj, ad); }
export async function decryptJson(contentKeyB64, box, ad) { return cryptoOpen(await importContentKey(contentKeyB64), box, ad); }

// Wrap a content key for a recipient. The wrapper needs the sender's private key and an ephemeral-free scheme:
// we use the sender's long-term key so the recipient can unwrap with sender.public + recipient.private.
// `ad` binds the wrapped key to where it belongs (format 2); without it the old format 1 is written. The caller checks
// that wrapped.sender is the key of the device the record names (src/engine/sync.js, syncSenderOk).
export async function wrapKeyFor(contentKeyB64, senderPrivateJwk, senderPublicJwk, recipientPublicJwk, ad) {
  const salt = rand(16);
  const wk = await wrappingKey(senderPrivateJwk, recipientPublicJwk, salt);
  const iv = rand(12);
  const ct = await subtle().encrypt(cryptoParams(iv, ad), wk, unb64(contentKeyB64));
  return { salt: b64(salt), iv: b64(iv), ct: b64(ct), sender: { kty: senderPublicJwk.kty, crv: senderPublicJwk.crv, x: senderPublicJwk.x, y: senderPublicJwk.y }, v: ad ? 2 : 1 };
}
export async function unwrapKey(wrapped, recipientPrivateJwk, ad) {
  const wk = await wrappingKey(recipientPrivateJwk, wrapped.sender, unb64(wrapped.salt));
  const raw = await subtle().decrypt(cryptoOpenParams(wrapped, ad), wk, unb64(wrapped.ct));
  return b64(raw);
}

// Owner recovery: derive an AES key from a passphrase (PBKDF2) to encrypt the owner's device private key for backup.
// P2-7 (audit of September 30, 2026): new backups use 600,000 iterations, the OWASP Password Storage Cheat Sheet's
// figure for PBKDF2-HMAC-SHA256; backups made before used 310,000 and still open. Only these two counts are accepted, so
// a file cannot ask for a weak count or for so many rounds that the phone freezes. The derived key cannot be exported.
const CRYPTO_KDF_NEW = 'pbkdf2-sha256-600000';
const CRYPTO_KDF_KNOWN = { 'pbkdf2-sha256-310000': 310000, 'pbkdf2-sha256-600000': 600000 };
const CRYPTO_BACKUP_AD = 'peace-meal/owner-backup';
export async function passphraseKey(passphrase, saltB64, iterations = CRYPTO_KDF_KNOWN[CRYPTO_KDF_NEW]) {
  const salt = saltB64 ? unb64(saltB64) : rand(16);
  const base = await subtle().importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  return { key, saltB64: b64(salt), iterations };
}
export async function sealWithPassphrase(passphrase, obj) {
  const { key, saltB64 } = await passphraseKey(passphrase);
  const box = await cryptoSeal(key, obj, CRYPTO_BACKUP_AD);
  return { ...box, salt: saltB64, kdf: CRYPTO_KDF_NEW };
}
export async function openWithPassphrase(passphrase, box) {
  const iterations = CRYPTO_KDF_KNOWN[box && box.kdf !== undefined ? box.kdf : 'pbkdf2-sha256-310000'];
  if (!iterations) throw new Error('Not an owner backup this app made.');
  const { key } = await passphraseKey(passphrase, box.salt, iterations);
  return cryptoOpen(key, box, CRYPTO_BACKUP_AD);
}

export function shortId() { return b64(rand(9)).replace(/[^A-Za-z0-9]/g, '').slice(0, 12); }
