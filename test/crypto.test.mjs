import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/engine/crypto.js';
import { buildSharePackage } from '../src/engine/sync.js';

test('profile key wraps for two readers and only they can open it', async () => {
  const alice = await C.generateDeviceKey();
  const owner = await C.generateDeviceKey();
  const mallory = await C.generateDeviceKey();
  const contentKey = await C.newContentKey();
  const box = await C.encryptJson(contentKey, { name: 'Alice', modules: ['celiac'] });
  const forAlice = await C.wrapKeyFor(contentKey, alice.privateJwk, alice.publicJwk, alice.publicJwk);
  const forOwner = await C.wrapKeyFor(contentKey, alice.privateJwk, alice.publicJwk, owner.publicJwk);
  assert.equal((await C.decryptJson(await C.unwrapKey(forAlice, alice.privateJwk), box)).name, 'Alice');
  assert.equal((await C.decryptJson(await C.unwrapKey(forOwner, owner.privateJwk), box)).modules[0], 'celiac');
  await assert.rejects(async () => C.decryptJson(await C.unwrapKey(forOwner, mallory.privateJwk), box));
});

test('owner backup round-trips with the passphrase and fails without it', async () => {
  const owner = await C.generateDeviceKey();
  const sealed = await C.sealWithPassphrase('correct horse', owner);
  const back = await C.openWithPassphrase('correct horse', sealed);
  assert.equal(back.fingerprint, owner.fingerprint);
  await assert.rejects(() => C.openWithPassphrase('wrong', sealed));
});

test('share package carries only the chosen parts', () => {
  const p = { id: 'p', name: 'Bo', modules: ['gout'], allergens: ['allergen-fish'], cooking: { skill: 'beginner' }, weights: [1], log: [2], preferences: { avoid_tags: [] } };
  const s = buildSharePackage(p, ['rules'], {});
  assert.deepEqual(s.modules, ['gout']);
  assert.equal(s.cooking, undefined);
  assert.equal(s.weights, undefined);
  const g = buildSharePackage(p, ['grocery', 'week'], { grocery: { items: [1] }, week: { days: [] } });
  assert.equal(g.modules, undefined);
  assert.ok(g.grocery && g.week);
});
