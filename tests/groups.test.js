const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.join(__dirname, "..");
const EnvelopeModule = require(path.join(root, "protocol", "envelope.js"));
const DoubleRatchet = require(path.join(root, "protocol", "double_ratchet.js"));
const CryptoUtils = require(path.join(root, "protocol", "crypto_utils.js"));
const HalonyxGroups = require(path.join(root, "frontend", "js", "groups.js"));

test("Groups: createGroup generates valid group object with creator in members", () => {
  const alice = "0xalice1234567890";
  const bob = "0xbob1234567890";
  const charlie = "0xcharlie1234567890";

  const group = HalonyxGroups.createGroup(
    "Security Team",
    "Mission critical discussions",
    [bob, charlie],
    alice
  );

  assert.ok(group.id.startsWith("grp_"));
  assert.equal(group.name, "Security Team");
  assert.equal(group.description, "Mission critical discussions");
  assert.equal(group.creator, alice);
  assert.equal(group.members.length, 3);
  assert.ok(group.members.includes(alice));
  assert.ok(group.members.includes(bob));
  assert.ok(group.members.includes(charlie));
});

test("Groups: getOtherMembers filters out sender USID", () => {
  const alice = "0xalice1234567890";
  const bob = "0xbob1234567890";
  const charlie = "0xcharlie1234567890";

  const group = HalonyxGroups.createGroup("Engineering", "", [bob, charlie], alice);
  const others = HalonyxGroups.getOtherMembers(group, alice);

  assert.equal(others.length, 2);
  assert.ok(!others.includes(alice));
  assert.ok(others.includes(bob));
  assert.ok(others.includes(charlie));
});

test("Groups: EnvelopeModule supports group metadata schema", () => {
  const envelope = EnvelopeModule.createEnvelope(
    "Hello team!",
    null,
    {
      id: "grp_test_123",
      name: "Core Engineers",
      members: ["user1", "user2"],
    }
  );

  assert.equal(envelope.v, 1);
  assert.equal(envelope.body, "Hello team!");
  assert.ok(envelope.group);
  assert.equal(envelope.group.id, "grp_test_123");
  assert.equal(envelope.group.name, "Core Engineers");

  const parsed = EnvelopeModule.parseAndValidateEnvelope(JSON.stringify(envelope));
  assert.ok(parsed);
  assert.equal(parsed.group.id, "grp_test_123");
  assert.equal(parsed.group.name, "Core Engineers");
});

test("Groups: Incoming envelope auto-registers group on recipient", () => {
  const envelope = EnvelopeModule.createEnvelope(
    "Welcome to the channel",
    null,
    {
      id: "grp_auto_discover_456",
      name: "Incident Response",
      members: ["0xalice", "0xbob"],
    }
  );

  const result = HalonyxGroups.handleIncomingEnvelope(envelope, "0xalice", "0xbob");
  assert.equal(result.isGroupMessage, true);
  assert.equal(result.isNewGroup, true);
  assert.equal(result.group.id, "grp_auto_discover_456");
  assert.equal(result.group.name, "Incident Response");
  assert.ok(result.group.members.includes("0xbob"));
});

test("Groups: Multi-member Pairwise Double Ratchet E2EE fan-out", async () => {
  const crypto = new CryptoUtils();

  // Setup 3 users: Alice, Bob, Charlie
  const aliceKeyPair = await crypto.generateDhKeyPair();
  const bobKeyPair = await crypto.generateDhKeyPair();
  const charlieKeyPair = await crypto.generateDhKeyPair();

  // Pairwise shared secrets (established via X3DH)
  const secretAliceBob = new Uint8Array(32);
  secretAliceBob.fill(1);
  const secretAliceCharlie = new Uint8Array(32);
  secretAliceCharlie.fill(2);

  // Alice's ratchet sessions
  const aliceToBobDr = new DoubleRatchet(crypto);
  await aliceToBobDr.initialize(secretAliceBob, bobKeyPair.publicKeyBytes, true);

  const aliceToCharlieDr = new DoubleRatchet(crypto);
  await aliceToCharlieDr.initialize(secretAliceCharlie, charlieKeyPair.publicKeyBytes, true);

  // Bob's ratchet session with Alice
  const bobDr = new DoubleRatchet(crypto);
  await bobDr.initialize(secretAliceBob, bobKeyPair.publicKeyBytes, false, bobKeyPair);

  // Charlie's ratchet session with Alice
  const charlieDr = new DoubleRatchet(crypto);
  await charlieDr.initialize(secretAliceCharlie, charlieKeyPair.publicKeyBytes, false, charlieKeyPair);

  // Alice sends a message to the group
  const group = HalonyxGroups.createGroup(
    "Confidential Ops",
    "E2EE Group",
    ["0xbob", "0xcharlie"],
    "0xalice"
  );

  const envelope = EnvelopeModule.createEnvelope("Meeting in 5 minutes", null, {
    id: group.id,
    name: group.name,
    members: group.members,
  });
  const envelopeStr = JSON.stringify(envelope);

  // Alice fans out to Bob and Charlie using their independent Double Ratchets
  const encryptedForBob = await aliceToBobDr.encrypt(envelopeStr);
  const encryptedForCharlie = await aliceToCharlieDr.encrypt(envelopeStr);

  // Verify Bob decrypts cleanly
  const decryptedBob = await bobDr.decrypt(encryptedForBob);
  const parsedBob = EnvelopeModule.parseAndValidateEnvelope(decryptedBob);
  assert.ok(parsedBob);
  assert.equal(parsedBob.body, "Meeting in 5 minutes");
  assert.equal(parsedBob.group.id, group.id);

  // Verify Charlie decrypts cleanly
  const decryptedCharlie = await charlieDr.decrypt(encryptedForCharlie);
  const parsedCharlie = EnvelopeModule.parseAndValidateEnvelope(decryptedCharlie);
  assert.ok(parsedCharlie);
  assert.equal(parsedCharlie.body, "Meeting in 5 minutes");
  assert.equal(parsedCharlie.group.id, group.id);

  // Verify that Bob's ciphertext and Charlie's ciphertext are cryptographically independent
  assert.notDeepEqual(encryptedForBob.ciphertext, encryptedForCharlie.ciphertext);
});
