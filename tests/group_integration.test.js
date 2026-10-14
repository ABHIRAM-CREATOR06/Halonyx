const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const root = path.join(__dirname, "..");
const EnvelopeModule = require(path.join(root, "protocol", "envelope.js"));
const DoubleRatchet = require(path.join(root, "protocol", "double_ratchet.js"));
const CryptoUtils = require(path.join(root, "protocol", "crypto_utils.js"));
const HalonyxGroups = require(path.join(root, "frontend", "js", "groups.js"));
const HalonyxDLP = require(path.join(root, "frontend", "js", "dlp.js"));

test("Group Integration: Slack-style threading inside an E2EE group chat", async () => {
  const crypto = new CryptoUtils();

  const aliceKeyPair = await crypto.generateDhKeyPair();
  const bobKeyPair = await crypto.generateDhKeyPair();
  const charlieKeyPair = await crypto.generateDhKeyPair();

  const secretAliceBob = new Uint8Array(32).fill(11);
  const secretAliceCharlie = new Uint8Array(32).fill(22);
  const secretBobCharlie = new Uint8Array(32).fill(33);

  // Alice ratchets
  const aliceToBob = new DoubleRatchet(crypto);
  await aliceToBob.initialize(secretAliceBob, bobKeyPair.publicKeyBytes, true);
  const aliceToCharlie = new DoubleRatchet(crypto);
  await aliceToCharlie.initialize(secretAliceCharlie, charlieKeyPair.publicKeyBytes, true);

  // Bob ratchets
  const bobFromAlice = new DoubleRatchet(crypto);
  await bobFromAlice.initialize(secretAliceBob, bobKeyPair.publicKeyBytes, false, bobKeyPair);
  const bobToCharlie = new DoubleRatchet(crypto);
  await bobToCharlie.initialize(secretBobCharlie, charlieKeyPair.publicKeyBytes, true);

  // Charlie ratchets
  const charlieFromAlice = new DoubleRatchet(crypto);
  await charlieFromAlice.initialize(secretAliceCharlie, charlieKeyPair.publicKeyBytes, false, charlieKeyPair);
  const charlieFromBob = new DoubleRatchet(crypto);
  await charlieFromBob.initialize(secretBobCharlie, charlieKeyPair.publicKeyBytes, false, charlieKeyPair);

  // Create Group
  const group = HalonyxGroups.createGroup(
    "Security Architecture",
    "Zero-knowledge thread discussion",
    ["0xbob", "0xcharlie"],
    "0xalice"
  );

  // Step 1: Alice sends root message in group
  const rootEnvelope = EnvelopeModule.createEnvelope(
    "Should we deploy Post-Compromise Security ratchets to all groups?",
    null,
    { id: group.id, name: group.name, members: group.members }
  );
  const rootStr = JSON.stringify(rootEnvelope);

  const bobEncRoot = await aliceToBob.encrypt(rootStr);
  const charlieEncRoot = await aliceToCharlie.encrypt(rootStr);

  const bobDecRoot = await bobFromAlice.decrypt(bobEncRoot);
  const bobParsedRoot = EnvelopeModule.parseAndValidateEnvelope(bobDecRoot);
  assert.equal(bobParsedRoot.body, "Should we deploy Post-Compromise Security ratchets to all groups?");
  assert.equal(bobParsedRoot.group.id, group.id);

  // Step 2: Bob replies in thread to Alice's root message
  const threadReplyMeta = {
    id: bobParsedRoot.id,
    snippet: bobParsedRoot.body.substring(0, 100),
    senderHash: "0xalice",
  };

  const replyEnvelope = EnvelopeModule.createEnvelope(
    "Yes, PCS ensures ratchet healing after compromise.",
    threadReplyMeta,
    { id: group.id, name: group.name, members: group.members }
  );
  const replyStr = JSON.stringify(replyEnvelope);

  // Bob fans out thread reply to Alice and Charlie
  const aliceEncReply = await bobFromAlice.encrypt(replyStr);
  const charlieEncReply = await bobToCharlie.encrypt(replyStr);

  // Alice decrypts thread reply
  const aliceDecReply = await aliceToBob.decrypt(aliceEncReply);
  const aliceParsedReply = EnvelopeModule.parseAndValidateEnvelope(aliceDecReply);
  assert.equal(aliceParsedReply.body, "Yes, PCS ensures ratchet healing after compromise.");
  assert.equal(aliceParsedReply.replyTo.id, rootEnvelope.id);
  assert.equal(aliceParsedReply.group.id, group.id);

  // Charlie decrypts thread reply
  const charlieDecReply = await charlieFromBob.decrypt(charlieEncReply);
  const charlieParsedReply = EnvelopeModule.parseAndValidateEnvelope(charlieDecReply);
  assert.equal(charlieParsedReply.body, "Yes, PCS ensures ratchet healing after compromise.");
  assert.equal(charlieParsedReply.replyTo.id, rootEnvelope.id);
  assert.equal(charlieParsedReply.group.id, group.id);
});

test("Group Integration: Pre-encryption DLP prevents leakage in group fan-out", () => {
  const MOCK_AWS_KEY = ["AK", "IA", "IOSFODNN7EXAMPLE"].join("");
  const sensitiveGroupMsg = `Here is the cluster secret ${MOCK_AWS_KEY} for devops`;
  const scan = HalonyxDLP.scan(sensitiveGroupMsg);

  assert.equal(scan.hasViolation, true);
  assert.equal(scan.violations[0].ruleName, "AWS Access Key ID");

  // In REDACT mode, secrets are replaced with tokens before fan-out
  const sanitized = scan.redactedText;
  assert.ok(!sanitized.includes(MOCK_AWS_KEY));
  assert.ok(sanitized.includes("[REDACTED-DLP: AWS Access Key ID]"));

  // Create envelope with sanitized text
  const envelope = EnvelopeModule.createEnvelope(sanitized, null, {
    id: "grp_devops",
    name: "DevOps",
    members: ["0xalice", "0xbob"],
  });

  assert.ok(!envelope.body.includes(MOCK_AWS_KEY));
  assert.ok(envelope.body.includes("[REDACTED-DLP: AWS Access Key ID]"));
});

test("Group Integration: Dynamic member addition updates group metadata", () => {
  const group = HalonyxGroups.createGroup("Alpha", "Initial test", ["0xbob"], "0xalice");
  HalonyxGroups.addOrUpdateGroup(group, "0xalice");
  assert.equal(group.members.length, 2);

  const updated = HalonyxGroups.addMember(group.id, "0xdavid", "0xalice");
  assert.ok(updated);
  assert.equal(updated.members.length, 3);
  assert.ok(updated.members.includes("0xdavid"));

  const othersForAlice = HalonyxGroups.getOtherMembers(updated, "0xalice");
  assert.equal(othersForAlice.length, 2);
  assert.ok(othersForAlice.includes("0xbob"));
  assert.ok(othersForAlice.includes("0xdavid"));
});

test("Group Integration: Static code audit verifies backend zero-knowledge relay", () => {
  const serverPath = path.join(root, "backend", "server.js");
  const serverCode = fs.readFileSync(serverPath, "utf8");

  // Verify server remains pure zero-knowledge relay
  assert.ok(!serverCode.includes("HalonyxGroups"), "Server must never contain HalonyxGroups module");
  assert.ok(!serverCode.includes("group.members"), "Server must never inspect group members");
  assert.ok(!serverCode.includes("CREATE TABLE IF NOT EXISTS groups"), "Server must not have group DB tables");
});
