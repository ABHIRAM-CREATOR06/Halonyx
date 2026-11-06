const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { startHarness } = require("./rest_harness");
const { hashUSID } = require("../backend/utils");

test("POST /connect", async (t) => {
  const h = await startHarness();
  const alice = await h.createUser({ name: "Alice" });

  t.after(async () => {
    const errors = await h.stop();
    assert.deepEqual(errors, []);
  });

  await t.test("rejects missing or invalid credentials", async () => {
    for (const body of [{}, { usid: "", email: "" }, { email: "invalid" }]) {
      const res = await h.request("POST", "/connect", { body });
      assert.equal(res.status, 400);
    }
  });

  await t.test("connects using the canonical hashed USID", async () => {
    const res = await h.request("POST", "/connect", {
      body: { usid: alice.hashedUsid },
    });

    assert.equal(res.status, 200);
    assert.equal(res.json.message, "Connected successfully");
    assert.equal(res.json.usid, alice.hashedUsid);
    assert.equal(res.json.name, alice.name);
    assert.equal(res.json.email, alice.email);

    const payload = jwt.decode(res.json.token);
    assert.equal(payload.userId, alice.userId);
    assert.equal(payload.hashedUsid, alice.hashedUsid);
  });

  await t.test("connects using the legacy raw USID", async () => {
    const rawUsid = "legacy-connect-test-usid";
    const hashedUsid = hashUSID(rawUsid);

    await h.sql.run(
      h.idDb,
      `INSERT INTO users_metadata (name, email, hashed_usid)
       VALUES (?, ?, ?)`,
      ["Legacy User", "legacy@example.com", hashedUsid],
    );

    const res = await h.request("POST", "/connect", {
      body: { usid: rawUsid },
    });

    assert.equal(res.status, 200);
    assert.equal(res.json.usid, hashedUsid);
    assert.equal(res.json.name, "Legacy User");
  });

  await t.test("connects using email", async () => {
    const res = await h.request("POST", "/connect", {
      body: { email: alice.email },
    });

    assert.equal(res.status, 200);
    assert.equal(res.json.usid, alice.hashedUsid);
    assert.equal(res.json.email, alice.email);
  });

  await t.test("returns 404 for an unknown USID", async () => {
    const res = await h.request("POST", "/connect", {
      body: { usid: "unknown-user-id" },
    });

    assert.equal(res.status, 404);
  });

  await t.test("returns 404 for an unknown email", async () => {
    const res = await h.request("POST", "/connect", {
      body: { email: "unknown@example.com" },
    });

    assert.equal(res.status, 404);
  });

  await h.assertRealDbUntouched();
});
