
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { startHarness } = require("./rest_harness");

test("REST key-management routes", async (t) => {
  const h = await startHarness();

  t.after(async () => {
    const errors = await h.stop();
    assert.deepEqual(errors, []);
  });

  const alice = await h.createUser();
  const bob = await h.createUser();

  await t.test("POST /keys/upload requires authentication", async () => {
    const res = await h.request("POST", "/keys/upload", {
      body: { bundle: { identityKey: "test-identity-key" } },
    });

    assert.equal(res.status, 401);
  });

  await t.test("POST /keys/upload rejects an invalid JWT", async () => {
    const res = await h.request("POST", "/keys/upload", {
      token: "invalid.jwt.token",
      body: { bundle: { identityKey: "test-identity-key" } },
    });

    assert.equal(res.status, 401);
  });

  await t.test("POST /keys/upload rejects malformed JSON", async () => {
    const res = await h.request("POST", "/keys/upload", {
      rawBody: "{",
    });

    assert.equal(res.status, 400);
  });

  await t.test("POST /keys/upload rejects a missing bundle", async () => {
    const res = await h.request("POST", "/keys/upload", {
      token: alice.token,
      body: {},
    });

    assert.equal(res.status, 400);
  });

  await t.test("POST /keys/upload stores a bundle", async () => {
    const bundle = {
      identityKey: "alice-identity-key",
      preKeys: [{ id: 1, key: "prekey-one" }],
    };

    const res = await h.request("POST", "/keys/upload", {
      token: alice.token,
      body: { bundle },
    });

    assert.equal(res.status, 200);
    assert.equal(res.json.message, "Key bundle stored");

    const row = await h.sql.get(
      h.keyDb,
      "SELECT bundle FROM key_bundles WHERE hashed_usid = ?",
      [alice.hashedUsid],
    );

    assert.deepEqual(JSON.parse(row.bundle), bundle);
  });

  await t.test("POST /keys/upload replaces an existing bundle", async () => {
    const bundle = {
      identityKey: "alice-updated-key",
      preKeys: [],
    };

    const res = await h.request("POST", "/keys/upload", {
      token: alice.token,
      body: { bundle },
    });

    assert.equal(res.status, 200);

    const row = await h.sql.get(
      h.keyDb,
      "SELECT bundle FROM key_bundles WHERE hashed_usid = ?",
      [alice.hashedUsid],
    );

    assert.deepEqual(JSON.parse(row.bundle), bundle);
  });

  await t.test("POST /keys/replenish requires authentication", async () => {
    const res = await h.request("POST", "/keys/replenish", {
      body: { preKeys: [] },
    });

    assert.equal(res.status, 401);
  });

  await t.test("POST /keys/replenish rejects an invalid JWT", async () => {
    const res = await h.request("POST", "/keys/replenish", {
      token: "invalid.jwt.token",
      body: { preKeys: [] },
    });

    assert.equal(res.status, 401);
  });

  await t.test("POST /keys/replenish rejects malformed JSON", async () => {
    const res = await h.request("POST", "/keys/replenish", {
      rawBody: "{",
    });

    assert.equal(res.status, 400);
  });

  await t.test("POST /keys/replenish rejects a missing preKeys array", async () => {
    const res = await h.request("POST", "/keys/replenish", {
      token: alice.token,
      body: {},
    });

    assert.equal(res.status, 400);
  });

  await t.test("POST /keys/replenish returns 404 without an existing bundle", async () => {
    const res = await h.request("POST", "/keys/replenish", {
      token: bob.token,
      body: { preKeys: [{ id: 2, key: "new-key" }] },
    });

    assert.equal(res.status, 404);
  });

  await t.test("POST /keys/replenish appends pre-keys", async () => {
    const initial = {
      identityKey: "alice-updated-key",
      preKeys: [{ id: 1, key: "first-key" }],
    };

    await h.sql.run(
      h.keyDb,
      "UPDATE key_bundles SET bundle = ? WHERE hashed_usid = ?",
      [JSON.stringify(initial), alice.hashedUsid],
    );

    const additions = [{ id: 2, key: "second-key" }];

    const res = await h.request("POST", "/keys/replenish", {
      token: alice.token,
      body: { preKeys: additions },
    });

    assert.equal(res.status, 200);
    assert.equal(res.json.message, "Pre-keys replenished");
    assert.equal(res.json.count, 2);

    const row = await h.sql.get(
      h.keyDb,
      "SELECT bundle FROM key_bundles WHERE hashed_usid = ?",
      [alice.hashedUsid],
    );

    assert.deepEqual(JSON.parse(row.bundle).preKeys, [
      ...initial.preKeys,
      ...additions,
    ]);
  });

  await t.test("GET /keys/:hashedUsid is publicly accessible", async () => {
    const res = await h.request("GET", `/keys/${alice.hashedUsid}`);

    assert.equal(res.status, 200);
    assert.ok(res.json.bundle);
  });

  await t.test("GET /keys/:hashedUsid returns 404 for an unknown user", async () => {
    const res = await h.request("GET", `/keys/${"a".repeat(64)}`);

    assert.equal(res.status, 404);
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

  await t.test("GET /public-key/:hashedUsid reads the key bundle", async () => {
    await h.sql.run(
      h.keyDb,
      "UPDATE key_bundles SET bundle = ? WHERE hashed_usid = ?",
      [
        JSON.stringify({
          identityKey: "alice-real-public-key",
          preKeys: [],
        }),
        alice.hashedUsid,
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

  await t.test("GET /keys/:hashedUsid consumes one one-time pre-key", async () => {
    const bundle = {
      identityKey: "opk-test-identity",
      preKeys: [
        { id: 1, key: "one-time-key-1" },
        { id: 2, key: "one-time-key-2" },
      ],
    };

    await h.sql.run(
      h.keyDb,
      "INSERT INTO key_bundles (hashed_usid, bundle, updated_at) VALUES (?, ?, ?)",
      [bob.hashedUsid, JSON.stringify(bundle), Date.now()],
    );

    const res = await h.request("GET", `/keys/${bob.hashedUsid}`);

    assert.equal(res.status, 200);
    assert.equal(res.json.opk.id, 1);
    assert.equal(res.json.bundle.preKeys.length, 1);

    await h.waitFor(async () => {
      const row = await h.sql.get(
        h.keyDb,
        "SELECT bundle FROM key_bundles WHERE hashed_usid = ?",
        [bob.hashedUsid],
      );

      return JSON.parse(row.bundle).preKeys.length === 1;
    }, { description: "OPK consumption to persist in database" });
  });

  await t.test("key upload and replenish share the rate limit", async () => {
    const rateLimitIp = "198.51.100.77";

    for (let i = 0; i < 10; i++) {
      const res = await h.request("POST", "/keys/upload", {
        token: alice.token,
        ip: rateLimitIp,
        body: {
          bundle: {
            identityKey: `rate-limit-key-${i}`,
            preKeys: [],
          },
        },
      });

      assert.equal(res.status, 200, `Request ${i + 1} should succeed`);
    }

    const res = await h.request("POST", "/keys/replenish", {
      token: alice.token,
      ip: rateLimitIp,
      body: { preKeys: [] },
    });

    assert.equal(res.status, 429);
  });

  h.assertRealDbUntouched();
});
