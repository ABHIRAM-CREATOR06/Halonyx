const test = require("node:test");
const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");

globalThis.crypto = webcrypto;

const CryptoUtils = require("../protocol/crypto_utils");
const DoubleRatchet = require("../protocol/double_ratchet");

async function supportsX25519() {
  try {
    await webcrypto.subtle.generateKey({ name: "X25519" }, true, ["deriveBits"]);
    return true;
  } catch {
    return false;
  }
}

async function makePair() {
  const cryptoUtils = new CryptoUtils();
  const sharedSecret = webcrypto.getRandomValues(new Uint8Array(32));
  const bobInitialRatchet = await cryptoUtils.generateDhKeyPair();

  const alice = new DoubleRatchet(cryptoUtils);
  const bob = new DoubleRatchet(cryptoUtils);

  await alice.initialize(sharedSecret, bobInitialRatchet.publicKeyBytes, true);
  await bob.initialize(sharedSecret, alice.dhPublicKeyBytes, false);
  bob.dhPrivateKey = bobInitialRatchet.privateKey;
  bob.dhPublicKeyBytes = bobInitialRatchet.publicKeyBytes;

  return { alice, bob };
}

test("Double Ratchet lets Bob decrypt Alice's message", async (t) => {
  if (!(await supportsX25519())) return t.skip("Node WebCrypto in this environment does not support X25519");

  const { alice, bob } = await makePair();

  const encrypted = await alice.encrypt("hello Bob");
  const plaintext = await bob.decrypt(encrypted);

  assert.equal(plaintext, "hello Bob");
});

test("Double Ratchet advances message keys for repeated sends", async (t) => {
  if (!(await supportsX25519())) return t.skip("Node WebCrypto in this environment does not support X25519");

  const { alice, bob } = await makePair();

  const first = await alice.encrypt("one");
  const second = await alice.encrypt("two");

  assert.notDeepEqual(first.ciphertext, second.ciphertext);
  assert.equal(await bob.decrypt(first), "one");
  assert.equal(await bob.decrypt(second), "two");
});

test("Double Ratchet rejects tampered ciphertext", async (t) => {
  if (!(await supportsX25519())) return t.skip("Node WebCrypto in this environment does not support X25519");

  const { alice, bob } = await makePair();
  const encrypted = await alice.encrypt("do not change me");
  encrypted.ciphertext[0] ^= 1;

  await assert.rejects(() => bob.decrypt(encrypted));
});
