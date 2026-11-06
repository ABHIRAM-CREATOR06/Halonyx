
const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { startHarness, TEST_JWT_SECRET } = require("./rest_harness");

test("REST signup route", async (t) => {
  const h = await startHarness();

  t.after(async () => {
    const errors = await h.stop();
    assert.deepEqual(errors, []);
  });

  await t.test("rejects a missing name", async () => {
    const res = await h.request("POST", "/signup", {
      body: { email: "missing-name@example.com" },
    });

    assert.equal(res.status, 400);
    assert.deepEqual(res.json, { error: "Name is required" });
  });

  await t.test("rejects a missing or invalid email", async () => {
    for (const email of [undefined, "invalid-email"]) {
      const res = await h.request("POST", "/signup", {
        body: { name: "Alice", email },
      });

      assert.equal(res.status, 400);
      assert.deepEqual(res.json, { error: "Valid email is required" });
    }
  });

  await t.test("creates a new account and returns a valid token", async () => {
    const res = await h.request("POST", "/signup", {
      body: {
        name: "Alice",
        email: "alice-signup@example.com",
        publicKey: "alice-test-public-key",
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.json.message, "Account created");
    assert.ok(res.json.usid);
    assert.ok(res.json.token);

    const payload = jwt.verify(res.json.token, TEST_JWT_SECRET);

    assert.equal(typeof payload.userId, "number");
    assert.equal(payload.hashedUsid, res.json.usid);

    const metadata = await h.sql.get(
      h.idDb,
      "SELECT name, email, hashed_usid FROM users_metadata WHERE email = ?",
      ["alice-signup@example.com"],
    );

    assert.equal(metadata.name, "Alice");
    assert.equal(metadata.email, "alice-signup@example.com");
    assert.equal(metadata.hashed_usid, res.json.usid);

    const user = await h.sql.get(
      h.db,
      "SELECT public_key_bundle FROM users WHERE hashed_usid = ?",
      [res.json.usid],
    );

    assert.deepEqual(JSON.parse(user.public_key_bundle), {
      identityKey: "alice-test-public-key",
    });
  });

  await t.test("re-verifies an existing email and keeps its identity", async () => {
    const existing = await h.createUser({
      name: "Original Alice",
      email: "existing-alice@example.com",
    });

    const res = await h.request("POST", "/signup", {
      body: {
        name: "Updated Alice",
        email: "existing-alice@example.com",
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.json.message, "Identity re-verified");
    assert.equal(res.json.usid, existing.hashedUsid);

    const payload = jwt.verify(res.json.token, TEST_JWT_SECRET);

    assert.equal(payload.userId, existing.userId);
    assert.equal(payload.hashedUsid, existing.hashedUsid);

    const metadata = await h.sql.get(
      h.idDb,
      "SELECT name, hashed_usid FROM users_metadata WHERE email = ?",
      ["existing-alice@example.com"],
    );

    assert.equal(metadata.name, "Updated Alice");
    assert.equal(metadata.hashed_usid, existing.hashedUsid);
  });

  await h.assertRealDbUntouched();
});
