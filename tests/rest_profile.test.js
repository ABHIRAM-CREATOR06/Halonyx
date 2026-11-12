"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { startHarness } = require("./rest_harness");

test("REST profile bios are editable and visible only to contacts", async (t) => {
  const harness = await startHarness();
  t.after(async () => {
    const errors = await harness.stop();
    assert.equal(errors.length, 0, `cleanup errors: ${errors.map(String).join("; ")}`);
  });

  const alice = await harness.createUser({ name: "Alice" });
  const bob = await harness.createUser({ name: "Bob" });
  const outsider = await harness.createUser({ name: "Outsider" });
  const headers = (token) => ({ Authorization: `Bearer ${token}` });

  const unauthenticated = await harness.request("GET", `/profile/${bob.hashedUsid}`);
  assert.equal(unauthenticated.status, 401);

  const update = await harness.request("PUT", "/profile", {
    headers: headers(bob.token), body: { bio: "  Software engineer  " },
  });
  assert.equal(update.status, 200);
  assert.equal(update.json.bio, "Software engineer");

  const self = await harness.request("GET", `/profile/${bob.hashedUsid}`, { headers: headers(bob.token) });
  assert.equal(self.status, 200);
  assert.equal(self.json.bio, "Software engineer");
  assert.equal(self.json.name, "Bob");

  const hidden = await harness.request("GET", `/profile/${bob.hashedUsid}`, { headers: headers(alice.token) });
  assert.equal(hidden.status, 404);
  await harness.sql.run(harness.db,
    "INSERT INTO contacts (user_id, contact_hashed_usid) VALUES (?, ?)",
    [alice.userId, bob.hashedUsid]);
  const visible = await harness.request("GET", `/profile/${bob.hashedUsid}`, { headers: headers(alice.token) });
  assert.equal(visible.status, 200);
  assert.equal(visible.json.bio, "Software engineer");

  const tooLong = await harness.request("PUT", "/profile", {
    headers: headers(bob.token), body: { bio: "x".repeat(281) },
  });
  assert.equal(tooLong.status, 400);
  const invalidHash = await harness.request("GET", "/profile/not-a-usid", { headers: headers(bob.token) });
  assert.equal(invalidHash.status, 400);
  const unrelated = await harness.request("GET", `/profile/${bob.hashedUsid}`, { headers: headers(outsider.token) });
  assert.equal(unrelated.status, 404);
});
