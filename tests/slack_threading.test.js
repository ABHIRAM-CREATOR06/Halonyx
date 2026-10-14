const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.join(__dirname, "..");
const EnvelopeModule = require(path.join(root, "protocol", "envelope.js"));
const DoubleRatchet = require(path.join(root, "protocol", "double_ratchet.js"));
const CryptoUtils = require(path.join(root, "protocol", "crypto_utils.js"));

test("Slack Threading: Root resolution traces nested replies to the root conversation starter", () => {
  const rootId = "root-msg-001";
  const reply1Id = "reply-msg-002";
  const reply2Id = "reply-msg-003";

  const history = [
    { id: rootId, from: "peer", content: "How should we handle enterprise DLP?", timestamp: 1000 },
    {
      id: reply1Id,
      from: "me",
      content: "Let's enforce it client-side before encryption.",
      timestamp: 2000,
      replyTo: { id: rootId, snippet: "How should we...", senderHash: "peer" },
    },
    {
      id: reply2Id,
      from: "peer",
      content: "Agreed, that keeps the server zero-knowledge.",
      timestamp: 3000,
      replyTo: { id: reply1Id, snippet: "Let's enforce...", senderHash: "me" },
    },
  ];

  // Emulate openThread root resolution algorithm
  function resolveRoot(startId) {
    const visited = new Set();
    let current = history.find((m) => m.id === startId);
    if (!current) return null;
    visited.add(current.id);
    let depth = 0;
    while (current.replyTo && current.replyTo.id && depth < 50) {
      const parent = history.find((m) => m.id === current.replyTo.id);
      if (!parent || visited.has(parent.id)) break;
      visited.add(parent.id);
      current = parent;
      depth++;
    }
    return current;
  }

  assert.equal(resolveRoot(rootId).id, rootId);
  assert.equal(resolveRoot(reply1Id).id, rootId);
  assert.equal(resolveRoot(reply2Id).id, rootId);
});

test("Slack Threading: Dedicated in-thread envelope adheres to protocol v:1 schema", () => {
  const rootMsg = {
    id: "msg-root-uuid-456",
    content: "Root message starting the thread",
    from: "0xabcdef123456",
  };

  const replyContent = "Replying inside the slide-over thread panel";
  const replyToMeta = {
    id: rootMsg.id,
    snippet: rootMsg.content.substring(0, 200),
    senderHash: rootMsg.from,
  };

  const envelope = EnvelopeModule.createEnvelope(replyContent, replyToMeta);
  assert.equal(envelope.v, 1);
  assert.equal(envelope.body, replyContent);
  assert.equal(envelope.replyTo.id, rootMsg.id);
  assert.equal(envelope.replyTo.snippet, "Root message starting the thread");
  assert.equal(envelope.replyTo.senderHash, "0xabcdef123456");

  // Validate serialization and deserialization
  const rawJson = JSON.stringify(envelope);
  const validated = EnvelopeModule.parseAndValidateEnvelope(rawJson);
  assert.ok(validated);
  assert.equal(validated.v, 1);
  assert.equal(validated.body, replyContent);
  assert.equal(validated.replyTo.id, rootMsg.id);
});

test("Slack Threading: End-to-end Signal Ratchet encryption shields thread metadata from relay", async () => {
  const crypto = new CryptoUtils();
  const aliceDr = new DoubleRatchet(crypto);
  const bobDr = new DoubleRatchet(crypto);

  const sharedSecret = new Uint8Array(32);
  sharedSecret.fill(7);

  const bobDhKeyPair = await crypto.generateDhKeyPair();

  await aliceDr.initialize(sharedSecret, bobDhKeyPair.publicKeyBytes, true);
  await bobDr.initialize(sharedSecret, bobDhKeyPair.publicKeyBytes, false, bobDhKeyPair);

  const rootId = "slack-root-thread-999";
  const inThreadReply = "Confidential thread reply about enterprise architecture";

  const envelope = EnvelopeModule.createEnvelope(inThreadReply, {
    id: rootId,
    snippet: "Initial thread seed",
    senderHash: "alice-hash",
  });

  const encrypted = await aliceDr.encrypt(JSON.stringify(envelope));
  const ciphertextBase64 = crypto.bufferToBase64(encrypted.ciphertext);

  // Assert wire payload gives zero metadata about the thread to any relay
  assert.equal(ciphertextBase64.includes(rootId), false);
  assert.equal(ciphertextBase64.includes(inThreadReply), false);
  assert.equal(ciphertextBase64.includes("replyTo"), false);

  // Bob decrypts
  const decrypted = await bobDr.decrypt(encrypted);
  const parsed = EnvelopeModule.parseAndValidateEnvelope(decrypted);
  assert.ok(parsed);
  assert.equal(parsed.body, inThreadReply);
  assert.equal(parsed.replyTo.id, rootId);
});
