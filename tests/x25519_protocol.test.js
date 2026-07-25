const test = require("node:test");
const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");

globalThis.crypto = webcrypto;
globalThis.btoa = globalThis.btoa || ((value) => Buffer.from(value, "binary").toString("base64"));
globalThis.atob = globalThis.atob || ((value) => Buffer.from(value, "base64").toString("binary"));

const CryptoUtils = require("../protocol/crypto_utils");
const X3DH = require("../protocol/x3dh");

async function supportsX25519() {
  try {
    await webcrypto.subtle.generateKey({ name: "X25519" }, true, ["deriveBits"]);
    return true;
  } catch {
    return false;
  }
}

test("runtime exposes X25519 WebCrypto support for protocol tests", async (t) => {
  if (!(await supportsX25519())) {
    return t.skip("Node WebCrypto in this environment does not support X25519");
  }

  const utils = new CryptoUtils();
  const keyPair = await utils.generateDhKeyPair();

  assert.equal(keyPair.publicKeyBytes.length, 32);
  assert.equal(keyPair.privateKey.type, "private");
  assert.equal(keyPair.publicKey.type, "public");
});

test("X25519 deriveBits is symmetric between two Halonyx DH key pairs", async (t) => {
  if (!(await supportsX25519())) {
    return t.skip("Node WebCrypto in this environment does not support X25519");
  }

  const utils = new CryptoUtils();
  const alice = await utils.generateDhKeyPair();
  const bob = await utils.generateDhKeyPair();

  const aliceSecret = await utils.deriveBits(alice.privateKey, bob.publicKeyBytes);
  const bobSecret = await utils.deriveBits(bob.privateKey, alice.publicKeyBytes);

  assert.deepEqual(aliceSecret, bobSecret);
  assert.equal(aliceSecret.length, 32);
});

test("X25519-backed X3DH shared secret changes when peer identity changes", async (t) => {
  if (!(await supportsX25519())) {
    return t.skip("Node WebCrypto in this environment does not support X25519");
  }

  const utils = new CryptoUtils();
  const x3dh = new X3DH(utils);
  const alice = await x3dh.generateKeyBundle();
  const bob = await x3dh.generateKeyBundle();
  const mallory = await x3dh.generateKeyBundle();

  const bobSession = await x3dh.createInitialMessage(
    alice.identityPrivateKey,
    alice.identityPublicBytes,
    bob.identityPublicBytes,
    bob.signedPreKeyPublicBytes,
    bob.signedPreKeySignature,
    bob.signingPublicBytes,
  );

  const mallorySession = await x3dh.createInitialMessage(
    alice.identityPrivateKey,
    alice.identityPublicBytes,
    mallory.identityPublicBytes,
    mallory.signedPreKeyPublicBytes,
    mallory.signedPreKeySignature,
    mallory.signingPublicBytes,
  );

  assert.notDeepEqual(bobSession.sharedSecret, mallorySession.sharedSecret);
});
