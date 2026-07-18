const test = require("node:test");
const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");

globalThis.crypto = webcrypto;
globalThis.btoa = globalThis.btoa || ((value) => Buffer.from(value, "binary").toString("base64"));
globalThis.atob = globalThis.atob || ((value) => Buffer.from(value, "base64").toString("binary"));

globalThis.CryptoUtils = require("../protocol/crypto_utils");
globalThis.X3DH = function X3DHStub() {};
globalThis.IDBKeyStore = function IDBKeyStoreStub() {};

const SignalProtocol = require("../protocol/signal_protocol");
const CryptoUtils = require("../protocol/crypto_utils");

function makeProtocolWithKeys(myKey, peerKey) {
  const protocol = Object.create(SignalProtocol.prototype);
  protocol.crypto = new CryptoUtils();
  protocol.identity = { identityPublicBytes: myKey };
  protocol._sessionMeta = new Map([["peer", { peerIdentityPublicBytes: peerKey }]]);
  return protocol;
}

test("Safety Number is identical regardless of caller key order", async () => {
  const aliceKey = new Uint8Array([1, 2, 3, 4, 5]);
  const bobKey = new Uint8Array([9, 8, 7, 6, 5]);

  const aliceView = makeProtocolWithKeys(aliceKey, bobKey);
  const bobView = makeProtocolWithKeys(bobKey, aliceKey);

  assert.equal(await aliceView.computeSafetyNumber("peer"), await bobView.computeSafetyNumber("peer"));
});

test("Safety Number changes when a peer key is substituted", async () => {
  const aliceKey = new Uint8Array([1, 2, 3, 4, 5]);
  const bobKey = new Uint8Array([9, 8, 7, 6, 5]);
  const malloryKey = new Uint8Array([9, 8, 7, 6, 4]);

  const legitimate = await makeProtocolWithKeys(aliceKey, bobKey).computeSafetyNumber("peer");
  const substituted = await makeProtocolWithKeys(aliceKey, malloryKey).computeSafetyNumber("peer");

  assert.notEqual(legitimate, substituted);
});

test("Safety Number format is grouped for human comparison", async () => {
  const number = await makeProtocolWithKeys(
    new Uint8Array([1, 2, 3, 4, 5]),
    new Uint8Array([9, 8, 7, 6, 5]),
  ).computeSafetyNumber("peer");

  const groups = number.split(/\s+/);
  assert.equal(groups.length, 12);
  for (const group of groups) assert.match(group, /^[0-9]{5}$/);
});
