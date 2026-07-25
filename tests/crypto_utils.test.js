const test = require("node:test");
const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");

globalThis.crypto = webcrypto;
globalThis.btoa = globalThis.btoa || ((value) => Buffer.from(value, "binary").toString("base64"));
globalThis.atob = globalThis.atob || ((value) => Buffer.from(value, "base64").toString("binary"));

const CryptoUtils = require("../protocol/crypto_utils");

test("AES-256-GCM encrypts and decrypts with a 12-byte IV", async () => {
  const utils = new CryptoUtils();
  const plaintext = new TextEncoder().encode("metadata is not plaintext");
  const key = webcrypto.getRandomValues(new Uint8Array(32));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await utils.encrypt(plaintext, key, iv);
  const decrypted = await utils.decrypt(ciphertext, key, iv);

  assert.notDeepEqual(ciphertext, plaintext);
  assert.deepEqual(decrypted, plaintext);
});

test("AES-GCM authentication rejects tampered ciphertext", async () => {
  const utils = new CryptoUtils();
  const plaintext = new TextEncoder().encode("tamper check");
  const key = webcrypto.getRandomValues(new Uint8Array(32));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await utils.encrypt(plaintext, key, iv);

  ciphertext[0] ^= 1;

  await assert.rejects(() => utils.decrypt(ciphertext, key, iv));
});

test("HKDF is deterministic for the same inputs and changes with context", async () => {
  const utils = new CryptoUtils();
  const ikm = new Uint8Array(32).fill(7);
  const salt = new Uint8Array(32).fill(3);
  const chainInfo = new TextEncoder().encode("chain key");
  const messageInfo = new TextEncoder().encode("message key");

  const first = await utils.hkdf(ikm, salt, chainInfo, 32);
  const second = await utils.hkdf(ikm, salt, chainInfo, 32);
  const differentContext = await utils.hkdf(ikm, salt, messageInfo, 32);

  assert.deepEqual(first, second);
  assert.notDeepEqual(first, differentContext);
  assert.equal(first.length, 32);
});

test("encoding helpers round-trip bytes", () => {
  const utils = new CryptoUtils();
  const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);

  assert.deepEqual(utils.fromHexString(utils.toHexString(bytes)), bytes);
  assert.deepEqual(utils.base64ToBuffer(utils.bufferToBase64(bytes)), bytes);
});

test("constantTimeEquals compares equal length byte arrays", () => {
  const utils = new CryptoUtils();

  assert.equal(utils.constantTimeEquals(new Uint8Array([1, 2]), new Uint8Array([1, 2])), true);
  assert.equal(utils.constantTimeEquals(new Uint8Array([1, 2]), new Uint8Array([1, 3])), false);
  assert.equal(utils.constantTimeEquals(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3])), false);
});
