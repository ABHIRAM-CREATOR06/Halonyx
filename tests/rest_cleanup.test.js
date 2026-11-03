
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { startHarness } = require("./rest_harness");

test("REST duplicate-cleanup routes", async (t) => {
  const h = await startHarness();
  const alice = await h.createUser({ name: "Alice" });
  const bob = await h.createUser({ name: "Bob" });

  t.after(async () => {
    const errors = await h.stop();
    assert.deepEqual(errors, []);
  });

  await t.test("cleanup-duplicates requires authentication", async () => {
    const res = await h.request("POST", "/cleanup-duplicates");
    assert.equal(res.status, 401);
  });

  await t.test("cleanup-duplicates rejects an invalid JWT", async () => {
    const res = await h.request("POST", "/cleanup-duplicates", {
      token: "invalid.jwt.token",
    });

    assert.equal(res.status, 401);
  });

  await t.test("cleanup-duplicates handles an empty contact list", async () => {
    const res = await h.request("POST", "/cleanup-duplicates", {
      token: alice.token,
    });

    assert.equal(res.status, 200);
    assert.deepEqual(res.json, {
      message: "No contacts to clean up",
      duplicatesRemoved: 0,
      contactsKept: 0,
    });
  });

  await t.test("cleanup-duplicates preserves existing unique contacts", async () => {
    await h.sql.run(
      h.db,
      "INSERT INTO contacts (user_id, contact_hashed_usid) VALUES (?, ?)",
      [alice.userId, bob.hashedUsid],
    );

    const res = await h.request("POST", "/cleanup-duplicates", {
      token: alice.token,
    });

    assert.equal(res.status, 200);
    assert.deepEqual(res.json, {
      message: "No duplicates found",
      duplicatesRemoved: 0,
      contactsKept: 1,
    });

    const rows = await h.sql.all(
      h.db,
      "SELECT contact_hashed_usid FROM contacts WHERE user_id = ?",
      [alice.userId],
    );

    assert.deepEqual(rows.map((row) => row.contact_hashed_usid), [
      bob.hashedUsid,
    ]);
  });

  await t.test("cleanup-all-duplicates requires authentication", async () => {
    const res = await h.request("POST", "/cleanup-all-duplicates");
    assert.equal(res.status, 401);
  });

  await t.test("cleanup-all-duplicates handles contacts without duplicates", async () => {
    const res = await h.request("POST", "/cleanup-all-duplicates", {
      token: alice.token,
    });

    assert.equal(res.status, 200);
    assert.deepEqual(res.json, {
      message: "No duplicates found",
      totalDuplicatesRemoved: 0,
      usersAffected: 0,
    });
  });

  await t.test("cleanup-all-duplicates preserves unique contacts", async () => {
    await h.sql.run(
      h.db,
      "INSERT INTO contacts (user_id, contact_hashed_usid) VALUES (?, ?)",
      [bob.userId, alice.hashedUsid],
    );

    const res = await h.request("POST", "/cleanup-all-duplicates", {
      token: alice.token,
    });

    assert.equal(res.status, 200);
    assert.deepEqual(res.json, {
      message: "No duplicates found",
      totalDuplicatesRemoved: 0,
      usersAffected: 0,
    });

    const rows = await h.sql.all(
      h.db,
      "SELECT user_id, contact_hashed_usid FROM contacts ORDER BY user_id",
    );

    assert.equal(rows.length, 2);
  });

  await h.assertRealDbUntouched();
});
