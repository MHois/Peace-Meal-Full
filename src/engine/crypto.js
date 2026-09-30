// End-to-end encryption for shared profiles. WebCrypto only; no library.
// Model: each device holds an ECDH P-256 keypair. Each profile is encrypted with its own random AES-GCM key.
// That profile key is wrapped (encrypted) for every reader allowed to open it: the profile's own device and the owner.
// The owner additionally derives a recovery key from a passphrase so the owner role can move between devices.
// Anyone can read ciphertext from the shared store; only a wrapped-key holder can decrypt it.

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

export async function encryptJson(contentKeyB64, obj) {
  const key = await importContentKey(contentKeyB64);
  const iv = rand(12);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { iv: b64(iv), ct: b64(ct), v: 1 };
}
export async function decryptJson(contentKeyB64, box) {
  const key = await importContentKey(contentKeyB64);
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct));
  return JSON.parse(dec.decode(pt));
}

// Wrap a content key for a recipient. The wrapper needs the sender's private key and an ephemeral-free scheme:
// we use the sender's long-term key so the recipient can unwrap with sender.public + recipient.private.
export async function wrapKeyFor(contentKeyB64, senderPrivateJwk, senderPublicJwk, recipientPublicJwk) {
  const salt = rand(16);
  const wk = await wrappingKey(senderPrivateJwk, recipientPublicJwk, salt);
  const iv = rand(12);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, wk, unb64(contentKeyB64));
  return { salt: b64(salt), iv: b64(iv), ct: b64(ct), sender: { kty: senderPublicJwk.kty, crv: senderPublicJwk.crv, x: senderPublicJwk.x, y: senderPublicJwk.y }, v: 1 };
}
export async function unwrapKey(wrapped, recipientPrivateJwk) {
  const wk = await wrappingKey(recipientPrivateJwk, wrapped.sender, unb64(wrapped.salt));
  const raw = await subtle().decrypt({ name: 'AES-GCM', iv: unb64(wrapped.iv) }, wk, unb64(wrapped.ct));
  return b64(raw);
}

// Owner recovery: derive an AES key from a passphrase (PBKDF2) to encrypt the owner's device private key for backup.
export async function passphraseKey(passphrase, saltB64) {
  const salt = saltB64 ? unb64(saltB64) : rand(16);
  const base = await subtle().importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 310000 }, base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  return { key, saltB64: b64(salt), rawB64: b64(await subtle().exportKey('raw', key)) };
}
export async function sealWithPassphrase(passphrase, obj) {
  const { rawB64, saltB64 } = await passphraseKey(passphrase);
  const box = await encryptJson(rawB64, obj);
  return { ...box, salt: saltB64, kdf: 'pbkdf2-sha256-310000' };
}
export async function openWithPassphrase(passphrase, box) {
  const { rawB64 } = await passphraseKey(passphrase, box.salt);
  return decryptJson(rawB64, box);
}

export function shortId() { return b64(rand(9)).replace(/[^A-Za-z0-9]/g, '').slice(0, 12); }
