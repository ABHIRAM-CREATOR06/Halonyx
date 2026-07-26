const test = require("node:test");
const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");

globalThis.crypto = webcrypto;
globalThis.btoa = globalThis.btoa || ((value) => Buffer.from(value, "binary").toString("base64"));
globalThis.atob = globalThis.atob || ((value) => Buffer.from(value, "base64").toString("binary"));

const CryptoUtils = require("../protocol/crypto_utils");
const X3DH = require("../protocol/x3dh");
const DoubleRatchet = require("../protocol/double_ratchet");

async function supportsX25519() {
  try {
    await webcrypto.subtle.generateKey({ name: "X25519" }, true, ["deriveBits"]);
    return true;
  } catch {
    return false;
  }
}

test("X3DH initiator and responder derive the same shared secret", async (t) => {
  if (!(await supportsX25519())) return t.skip("Node WebCrypto in this environment does not support X25519");

  const cryptoUtils = new CryptoUtils();
  const x3dh = new X3DH(cryptoUtils);
  const alice = await x3dh.generateKeyBundle();
  const bob = await x3dh.generateKeyBundle();

  const initial = await x3dh.createInitialMessage(
    alice.identityPrivateKey,
    alice.identityPublicBytes,
    bob.identityPublicBytes,
    bob.signedPreKeyPublicBytes,
    bob.signedPreKeySignature,
    bob.signingPublicBytes,
  );

  const response = await x3dh.processInitialMessage(
    alice.identityPublicBytes,
    initial.ephemeralPublicBytes,
    bob.identityPrivateKey,
    bob.signedPreKeyPrivate,
  );

  assert.deepEqual(initial.sharedSecret, response.sharedSecret);
  assert.equal(initial.sharedSecret.length, 32);
});

test("the first message decrypts when responder starts from its signed pre-key", async (t) => {
  if (!(await supportsX25519())) return t.skip("Node WebCrypto in this environment does not support X25519");

  const cryptoUtils = new CryptoUtils();
  const x3dh = new X3DH(cryptoUtils);
  const alice = await x3dh.generateKeyBundle();
  const bob = await x3dh.generateKeyBundle();
  const initial = await x3dh.createInitialMessage(
    alice.identityPrivateKey,
    alice.identityPublicBytes,
    bob.identityPublicBytes,
    bob.signedPreKeyPublicBytes,
    bob.signedPreKeySignature,
    bob.signingPublicBytes,
  );
  const response = await x3dh.processInitialMessage(
    alice.identityPublicBytes,
    initial.ephemeralPublicBytes,
    bob.identityPrivateKey,
    bob.signedPreKeyPrivate,
  );

  const aliceRatchet = new DoubleRatchet(cryptoUtils);
  await aliceRatchet.initialize(initial.sharedSecret, bob.signedPreKeyPublicBytes, true);
  const bobRatchet = new DoubleRatchet(cryptoUtils);
  await bobRatchet.initialize(response.sharedSecret, alice.identityPublicBytes, false, {
    privateKey: bob.signedPreKeyPrivate,
    publicKeyBytes: bob.signedPreKeyPublicBytes,
  });

  assert.equal(await bobRatchet.decrypt(await aliceRatchet.encrypt("first secure message")), "first secure message");
  assert.equal(await aliceRatchet.decrypt(await bobRatchet.encrypt("secure reply")), "secure reply");
});

test("X3DH rejects a tampered signed pre-key signature", async (t) => {
  if (!(await supportsX25519())) return t.skip("Node WebCrypto in this environment does not support X25519");

  const cryptoUtils = new CryptoUtils();
  const x3dh = new X3DH(cryptoUtils);
  const alice = await x3dh.generateKeyBundle();
  const bob = await x3dh.generateKeyBundle();
  const tamperedSignature = new Uint8Array(bob.signedPreKeySignature);
  tamperedSignature[0] ^= 1;

  await assert.rejects(
    () => x3dh.createInitialMessage(
      alice.identityPrivateKey,
      alice.identityPublicBytes,
      bob.identityPublicBytes,
      bob.signedPreKeyPublicBytes,
      tamperedSignature,
      bob.signingPublicBytes,
    ),
    /signature is invalid/,
  );
});

test("public key bundles encode and decode without losing public material", async (t) => {
  if (!(await supportsX25519())) return t.skip("Node WebCrypto in this environment does not support X25519");

  const cryptoUtils = new CryptoUtils();
  const x3dh = new X3DH(cryptoUtils);
  const bundle = await x3dh.generateKeyBundle();

  const decoded = x3dh.decodePublicBundle(x3dh.encodePublicBundle(bundle));

  assert.deepEqual(decoded.identityPublicBytes, bundle.identityPublicBytes);
  assert.deepEqual(decoded.signingPublicBytes, bundle.signingPublicBytes);
  assert.deepEqual(decoded.signedPreKeyPublicBytes, bundle.signedPreKeyPublicBytes);
  assert.deepEqual(decoded.signedPreKeySignature, bundle.signedPreKeySignature);
});
