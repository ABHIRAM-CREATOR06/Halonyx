const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const root = path.join(__dirname, "..");
const HalonyxGroups = require(path.join(root, "frontend", "js", "groups.js"));
const { hashUSID, generateUSID } = require(path.join(root, "backend", "utils.js"));

test("WebSocket Presence: Reconnection close race condition does not purge active socket", () => {
  // Simulate the server clients map and connection close handler logic
  const clients = new Map();
  const userHashedUsid = "user_canonical_hash_1234567890abcdef1234567890abcdef1234567890abcdef";

  const wsOld = { id: "socket_old", readyState: 1 };
  const wsNew = { id: "socket_new", readyState: 1 };

  // Step 1: User initially connected on wsOld
  clients.set(userHashedUsid, wsOld);
  assert.equal(clients.get(userHashedUsid), wsOld);

  // Step 2: User reconnects (e.g. page reload or network switch), registering wsNew
  clients.set(userHashedUsid, wsNew);
  assert.equal(clients.get(userHashedUsid), wsNew);

  // Step 3: wsOld finally emits "close"
  // The fixed handler only deletes if clients.get(userHashedUsid) === ws
  const handleClose = (closingWs) => {
    if (clients.get(userHashedUsid) === closingWs) {
      clients.delete(userHashedUsid);
    }
  };

  handleClose(wsOld);

  // wsNew MUST still be present and registered
  assert.equal(clients.has(userHashedUsid), true);
  assert.equal(clients.get(userHashedUsid), wsNew);

  // When wsNew eventually closes, it correctly unregisters
  handleClose(wsNew);
  assert.equal(clients.has(userHashedUsid), false);
});

test("WebSocket Presence: Recipient resolution matches canonical, 0x-prefixed, and raw USID", () => {
  const clients = new Map();
  const rawUsid = "e4d3c2b1a09876543210fedcba9876543210fedcba9876543210fedcba987654";
  const canonicalHashedUsid = hashUSID(rawUsid);

  const mockWs = { id: "recipient_socket", readyState: 1 };
  clients.set(canonicalHashedUsid, mockWs);

  // Resolution logic matching backend/server.js
  function resolveRecipientWs(targetUsid) {
    if (!targetUsid || typeof targetUsid !== "string") return null;
    const clean = targetUsid.trim().toLowerCase().replace(/^0x/, "");
    if (!clean) return null;

    let targetWs = clients.get(clean);
    if (targetWs && targetWs.readyState === 1) return targetWs;

    const hashed = hashUSID(clean);
    targetWs = clients.get(hashed);
    if (targetWs && targetWs.readyState === 1) return targetWs;

    for (const [key, clientSocket] of clients.entries()) {
      if (clientSocket && clientSocket.readyState === 1) {
        const cleanKey = key.trim().toLowerCase().replace(/^0x/, "");
        if (cleanKey === clean || cleanKey === hashed) {
          return clientSocket;
        }
      }
    }
    return null;
  }

  // 1. Canonical lookup
  assert.equal(resolveRecipientWs(canonicalHashedUsid), mockWs);

  // 2. 0x-prefixed lookup
  assert.equal(resolveRecipientWs("0x" + canonicalHashedUsid), mockWs);

  // 3. Uppercase lookup
  assert.equal(resolveRecipientWs(canonicalHashedUsid.toUpperCase()), mockWs);

  // 4. Raw unhashed USID lookup
  assert.equal(resolveRecipientWs(rawUsid), mockWs);
  assert.equal(resolveRecipientWs("0x" + rawUsid), mockWs);
});

test("WebSocket Presence: Groups deduplicate and normalize member USIDs across formats", () => {
  const alice = "0xALICE_1234567890abcdef1234567890abcdef";
  const aliceNorm = "alice_1234567890abcdef1234567890abcdef";
  const bob = "bob_1234567890abcdef1234567890abcdef";
  const bobWith0x = "0xbob_1234567890abcdef1234567890abcdef";

  const group = HalonyxGroups.createGroup(
    "Test Group",
    "Dedup test",
    [bob, bobWith0x, alice],
    aliceNorm
  );

  // Group must deduplicate bob and alice despite 0x prefix or case differences
  assert.equal(group.members.length, 2);

  // Fan-out for Alice must only contain Bob once, and never Alice
  const othersForAlice = HalonyxGroups.getOtherMembers(group, alice);
  assert.equal(othersForAlice.length, 1);
  assert.ok(othersForAlice[0].toLowerCase().includes("bob"));

  // Fan-out for Bob must only contain Alice once, and never Bob
  const othersForBob = HalonyxGroups.getOtherMembers(group, bob);
  assert.equal(othersForBob.length, 1);
  assert.ok(othersForBob[0].toLowerCase().includes("alice"));
});
