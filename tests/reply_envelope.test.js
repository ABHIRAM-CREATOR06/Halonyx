const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const EnvelopeModule = require(path.join(root, "protocol", "envelope.js"));
const DoubleRatchet = require(path.join(root, "protocol", "double_ratchet.js"));
const CryptoUtils = require(path.join(root, "protocol", "crypto_utils.js"));

test("Envelope creation builds valid v:1 envelope", () => {
  const env = EnvelopeModule.createEnvelope("Hello world", {
    id: "parent-uuid-1234",
    snippet: "Original parent text",
    senderHash: "abcdef1234567890",
  });

  assert.equal(env.v, 1);
  assert.equal(typeof env.id, "string");
  assert.ok(env.id.length > 10);
  assert.equal(env.body, "Hello world");
  assert.equal(env.replyTo.id, "parent-uuid-1234");
  assert.equal(env.replyTo.snippet, "Original parent text");
  assert.equal(env.replyTo.senderHash, "abcdef1234567890");
});

test("Envelope validation enforces v:1 schema and bounds", () => {
  const valid = EnvelopeModule.createEnvelope("Test message");
  const parsed = EnvelopeModule.parseAndValidateEnvelope(JSON.stringify(valid));
  assert.ok(parsed);
  assert.equal(parsed.v, 1);
  assert.equal(parsed.body, "Test message");

  // Invalid cases
  assert.equal(EnvelopeModule.parseAndValidateEnvelope("not json"), null);
  assert.equal(EnvelopeModule.parseAndValidateEnvelope(JSON.stringify({ body: "no version" })), null);
  assert.equal(EnvelopeModule.parseAndValidateEnvelope(JSON.stringify({ v: 2, id: "123", body: "v2" })), null);
  assert.equal(EnvelopeModule.parseAndValidateEnvelope(JSON.stringify({ v: 1, id: "", body: "empty id" })), null);
  assert.equal(EnvelopeModule.parseAndValidateEnvelope(JSON.stringify({ v: 1, id: "123", body: "x".repeat(15000) })), null);

  // Malicious / malformed replyTo
  assert.equal(
    EnvelopeModule.parseAndValidateEnvelope(
      JSON.stringify({ v: 1, id: "123", body: "hi", replyTo: "not-an-object" })
    ),
    null
  );
  assert.equal(
    EnvelopeModule.parseAndValidateEnvelope(
      JSON.stringify({ v: 1, id: "123", body: "hi", replyTo: { id: "" } })
    ),
    null
  );
});

test("Legacy message normalization generates stable UUID and envelope format", () => {
  // Legacy string
  const norm1 = EnvelopeModule.normalizeMessage("Legacy plain text message");
  assert.equal(norm1.isEnvelope, false);
  assert.equal(norm1.envelope.v, 1);
  assert.equal(norm1.envelope.body, "Legacy plain text message");
  assert.ok(norm1.envelope.id);

  // Legacy stored message object
  const norm2 = EnvelopeModule.normalizeMessage({
    from: "me",
    content: "Old stored content",
    timestamp: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(norm2.isEnvelope, false);
  assert.equal(norm2.envelope.v, 1);
  assert.equal(norm2.envelope.body, "Old stored content");
  assert.ok(norm2.envelope.id);
});

test("E2EE Round-Trip: Reply metadata is inside ciphertext and never visible in raw ciphertext", async () => {
  const crypto = new CryptoUtils();
  const aliceDr = new DoubleRatchet(crypto);
  const bobDr = new DoubleRatchet(crypto);

  const sharedSecret = new Uint8Array(32);
  sharedSecret.fill(7);

  const bobDhKeyPair = await crypto.generateDhKeyPair();

  await aliceDr.initialize(sharedSecret, bobDhKeyPair.publicKeyBytes, true);
  await bobDr.initialize(sharedSecret, bobDhKeyPair.publicKeyBytes, false, bobDhKeyPair);

  const parentSnippet = "SECRET_QUOTED_SNIPPET_12345";
  const parentId = "SECRET_PARENT_ID_67890";
  const senderHash = "SECRET_SENDER_HASH_ABCDEF";

  const envelope = EnvelopeModule.createEnvelope("Reply content", {
    id: parentId,
    snippet: parentSnippet,
    senderHash: senderHash,
  });

  const rawPlaintextStr = JSON.stringify(envelope);
  const encrypted = await aliceDr.encrypt(rawPlaintextStr);

  const ciphertextBase64 = crypto.bufferToBase64(encrypted.ciphertext);

  // Assertion: Reply metadata MUST NOT appear in the ciphertext string
  assert.equal(ciphertextBase64.includes(parentSnippet), false);
  assert.equal(ciphertextBase64.includes(parentId), false);
  assert.equal(ciphertextBase64.includes(senderHash), false);
  assert.equal(ciphertextBase64.includes("replyTo"), false);

  // Decrypt on Bob's side
  const decryptedStr = await bobDr.decrypt(encrypted);
  const parsedEnvelope = EnvelopeModule.parseAndValidateEnvelope(decryptedStr);

  assert.ok(parsedEnvelope);
  assert.equal(parsedEnvelope.body, "Reply content");
  assert.equal(parsedEnvelope.replyTo.id, parentId);
  assert.equal(parsedEnvelope.replyTo.snippet, parentSnippet);
  assert.equal(parsedEnvelope.replyTo.senderHash, senderHash);
});

test("Static Code Audit: Server never processes or inspects reply fields", () => {
  const serverPath = path.join(root, "backend", "server.js");
  const serverCode = fs.readFileSync(serverPath, "utf8");

  assert.equal(serverCode.includes("replyTo"), false, "server.js must not reference replyTo");
  assert.equal(serverCode.includes("snippet"), false, "server.js must not reference snippet");
  assert.equal(serverCode.includes("parentMsg"), false, "server.js must not reference parentMsg");
});
