
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { startHarness } = require("./rest_harness");

test("POST /update-pubkey and GET /public-key/:hashedUsid", async (t) => {
  const h = await startHarness();

  t.after(async () => {
    const errors = await h.stop();
    assert.deepEqual(errors, []);
  });

  const alice = await h.createUser({ name: "Alice" });

  await t.test("POST /update-pubkey requires authentication", async () => {
    const res = await h.request("POST", "/update-pubkey", {
      body: { publicKey: "valid-public-key-value" },
    });

    assert.equal(res.status, 401);
  });

  await t.test("POST /update-pubkey rejects an invalid JWT", async () => {
    const res = await h.request("POST", "/update-pubkey", {
      token: "invalid.jwt.token",
      body: { publicKey: "valid-public-key-value" },
    });

    assert.equal(res.status, 401);
  });

  await t.test("POST /update-pubkey rejects malformed JSON", async () => {
    const res = await h.request("POST", "/update-pubkey", {
      rawBody: "{",
    });

    assert.equal(res.status, 400);
  });

  await t.test("POST /update-pubkey rejects missing or invalid public keys", async () => {
    for (const publicKey of [undefined, "", "short", 123, null]) {
      const res = await h.request("POST", "/update-pubkey", {
        token: alice.token,
        body: { publicKey },
      });

      assert.equal(res.status, 400);
      assert.equal(res.json.error, "Invalid publicKey");
    }
  });

  await t.test("POST /update-pubkey updates an existing user's public key", async () => {
    const publicKey = "alice-public-key-value";

    const res = await h.request("POST", "/update-pubkey", {
      token: alice.token,
      body: { publicKey },
    });

    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { message: "Public key updated" });

    const row = await h.sql.get(
      h.db,
      "SELECT public_key_bundle FROM users WHERE hashed_usid = ?",
      [alice.hashedUsid],
    );

    assert.deepEqual(JSON.parse(row.public_key_bundle), {
      identityKey: publicKey,
    });
  });

  await t.test("POST /update-pubkey inserts a user row when one does not exist", async () => {
    const user = await h.createUser({
      name: "Bob",
      withAppUserRow: false,
    });

    const publicKey = "bob-public-key-value";

    const res = await h.request("POST", "/update-pubkey", {
      token: user.token,
      body: { publicKey },
    });

    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { message: "Public key stored" });

    const row = await h.sql.get(
      h.db,
      "SELECT public_key_bundle FROM users WHERE hashed_usid = ?",
      [user.hashedUsid],
    );

    assert.deepEqual(JSON.parse(row.public_key_bundle), {
      identityKey: publicKey,
    });
  });

  await t.test("GET /public-key/:hashedUsid requires authentication", async () => {
    const res = await h.request(
      "GET",
      `/public-key/${alice.hashedUsid}`,
    );

    assert.equal(res.status, 401);
  });

  await t.test("GET /public-key/:hashedUsid rejects an invalid JWT", async () => {
    const res = await h.request(
      "GET",
      `/public-key/${alice.hashedUsid}`,
      { token: "invalid.jwt.token" },
    );

    assert.equal(res.status, 401);
  });

  await t.test("GET /public-key/:hashedUsid returns the stored key bundle", async () => {
    await h.sql.run(
      h.keyDb,
      "INSERT OR REPLACE INTO key_bundles (hashed_usid, bundle, updated_at) VALUES (?, ?, ?)",
      [
        alice.hashedUsid,
        JSON.stringify({
          identityKey: "alice-real-public-key",
          preKeys: [],
        }),
        Date.now(),
      ],
    );

    const res = await h.request(
      "GET",
      `/public-key/${alice.hashedUsid}`,
      { token: alice.token },
    );

    assert.equal(res.status, 200);
    assert.equal(res.json.publicKey, "alice-real-public-key");
    assert.equal(res.json.source, "bundle");
  });

  await t.test("GET /public-key/:hashedUsid uses the app database fallback", async () => {
    const charlie = await h.createUser({
      publicKey: "charlie-fallback-public-key",
    });

    const res = await h.request(
      "GET",
      `/public-key/${charlie.hashedUsid}`,
      { token: charlie.token },
    );

    assert.equal(res.status, 200);
    assert.equal(res.json.publicKey, "charlie-fallback-public-key");
  });

  await t.test("GET /public-key/:hashedUsid returns 404 for an unknown user", async () => {
    const res = await h.request(
      "GET",
      `/public-key/${"a".repeat(64)}`,
      { token: alice.token },
    );

    assert.equal(res.status, 404);
  });

  await h.assertRealDbUntouched();
});
