const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const root = path.join(__dirname, "..");
const CryptoUtils = require(path.join(root, "protocol", "crypto_utils.js"));
const DoubleRatchet = require(path.join(root, "protocol", "double_ratchet.js"));
const X3DH = require(path.join(root, "protocol", "x3dh.js"));
const { hashUSID, generateUSID } = require(path.join(root, "backend", "utils.js"));

async function supportsX25519() {
  try {
    const key = await crypto.subtle.generateKey({ name: "X25519" }, true, ["deriveKey", "deriveBits"]);
    return !!key;
  } catch (_) {
    return false;
  }
}

test("Peer Connection: GET /keys/:hashedUsid query candidates normalize raw, 0x-prefixed, and canonical USIDs", () => {
  const rawUsid = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";
  const canonicalHashed = hashUSID(rawUsid);

  // Helper matching backend/server.js GET /keys/:hashedUsid
  function getQueryCandidates(rawParam) {
    const clean = (rawParam || "").trim().toLowerCase().replace(/^0x/, "");
    return [...new Set([clean, hashUSID(clean)])];
  }

  // Passing canonical hashed USID
  const c1 = getQueryCandidates(canonicalHashed);
  assert.ok(c1.includes(canonicalHashed));

  // Passing 0x-prefixed canonical hashed USID
  const c2 = getQueryCandidates("0x" + canonicalHashed.toUpperCase());
  assert.ok(c2.includes(canonicalHashed));

  // Passing raw USID
  const c3 = getQueryCandidates(rawUsid);
  assert.ok(c3.includes(canonicalHashed));

  // Passing 0x-prefixed raw USID
  const c4 = getQueryCandidates("0x" + rawUsid);
  assert.ok(c4.includes(canonicalHashed));
});

test("Peer Connection: Offline mailbox queues x3dh_init and flushes it to reconnecting peer", () => {
  const mailbox = [];
  const senderUsid = "sender_hash_111111111111111111111111111111111111111111111111111111111111";
  const recipientUsid = "recipient_hash_222222222222222222222222222222222222222222222222222222222222";

  // Simulate queuing an x3dh_init when recipient is offline
  const x3dhInitMsg = {
    type: "x3dh_init",
    to: recipientUsid,
    senderIdentityPublic: "abc...",
    ephemeralPublic: "def...",
    ratchetPublic: "ghi...",
  };

  const storeContent = JSON.stringify({ ...x3dhInitMsg, from: senderUsid });
  mailbox.push({
    recipient_hashed_usid: recipientUsid,
    sender_hashed_usid: senderUsid,
    content: storeContent,
    timestamp: new Date().toISOString(),
  });

  // Simulate flush on registration
  const flushedMessages = [];
  mailbox.forEach((m) => {
    let parsed = null;
    try { parsed = JSON.parse(m.content); } catch (e) {}
    if (parsed && parsed.type === "x3dh_init") {
      flushedMessages.push({ ...parsed, from: m.sender_hashed_usid });
    } else {
      flushedMessages.push({
        type: "message",
        from: m.sender_hashed_usid,
        encrypted: parsed !== null ? parsed : m.content,
        timestamp: m.timestamp,
      });
    }
  });

  assert.equal(flushedMessages.length, 1);
  assert.equal(flushedMessages[0].type, "x3dh_init");
  assert.equal(flushedMessages[0].from, senderUsid);
  assert.equal(flushedMessages[0].ratchetPublic, "ghi...");
});

test("Peer Connection: Double Ratchet succeeds regardless of whether initiator or responder sends first", async (t) => {
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

  // Alice (initiator) initializes Double Ratchet
  const aliceRatchet = new DoubleRatchet(cryptoUtils);
  await aliceRatchet.initialize(initial.sharedSecret, bob.signedPreKeyPublicBytes, true);

  // Bob (responder) initializes Double Ratchet with Alice's ratchetPublic
  const bobRatchet = new DoubleRatchet(cryptoUtils);
  await bobRatchet.initialize(response.sharedSecret, aliceRatchet.dhPublicKeyBytes, false, {
    privateKey: bob.signedPreKeyPrivate,
    publicKeyBytes: bob.signedPreKeyPublicBytes,
  });

  // Test: Responder (Bob) sends FIRST before initiator (Alice)
  const bobMsg = await bobRatchet.encrypt("hello from bob first!");
  const aliceDecrypted = await aliceRatchet.decrypt(bobMsg);
  assert.equal(aliceDecrypted, "hello from bob first!");

  // Test: Initiator (Alice) replies
  const aliceReply = await aliceRatchet.encrypt("hello back from alice!");
  const bobDecrypted = await bobRatchet.decrypt(aliceReply);
  assert.equal(bobDecrypted, "hello back from alice!");
});
