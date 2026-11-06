
"use strict";

// REST tests for the contact routes (issue #9):
//   POST /add-contact, GET /contacts, DELETE /contacts
//
// Everything runs against temporary databases through startHarness().
// Contact targets are seeded straight into the temporary identity DB, so the
// only signups are the two acting users (well below the signup rate limit).

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");

const { startHarness } = require("./rest_harness");
const { hashUSID, generateUSID } = require("../backend/utils");

function decodeToken(token) {
  return JSON.parse(
    Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
  );
}

test("REST contact routes", async (t) => {
  const harness = await startHarness();

  t.after(async () => {
    const errors = await harness.stop();
    assert.equal(
      errors.length,
      0,
      `cleanup errors: ${errors.map(String).join("; ")}`,
    );
  });

  const { sql } = harness;

  async function call(method, pathname, { token, body } = {}) {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await harness.request(method, pathname, { headers, body });

    return { status: res.status, body: res.json };
  }

  async function makeUser() {
    const created = await harness.createUser();
    const { userId, hashedUsid } = decodeToken(created.token);

    return {
      token: created.token,
      userId,
      hashedUsid,
    };
  }

  let seedCounter = 0;

  async function seedIdentity({ hashedUsid = hashUSID(generateUSID()), name } = {}) {
    seedCounter += 1;

    const identityName = name || `Seeded Contact ${seedCounter}`;

    await sql.run(
      harness.idDb,
      "INSERT INTO users_metadata (name, email, hashed_usid) VALUES (?, ?, ?)",
      [
        identityName,
        `seed${seedCounter}-${crypto.randomBytes(4).toString("hex")}@example.test`,
        hashedUsid,
      ],
    );

    return {
      name: identityName,
      hashedUsid,
    };
  }

  function contactRows(userId) {
    return sql.all(
      harness.db,
      "SELECT user_id, contact_hashed_usid FROM contacts WHERE user_id = ?",
      [userId],
    );
  }

  async function contactHashes(userId) {
    return (await contactRows(userId))
      .map((row) => row.contact_hashed_usid)
      .sort();
  }

  function clearContacts() {
    return sql.run(harness.db, "DELETE FROM contacts");
  }

  const alice = await makeUser();
  const bob = await makeUser();

  assert.notEqual(alice.userId, bob.userId);

  // Authentication

  await t.test(
    "all contact routes reject missing or invalid tokens",
    async () => {
      await clearContacts();

      const target = await seedIdentity();

      const wrongSecretToken = jwt.sign(
        {
          userId: alice.userId,
          hashedUsid: alice.hashedUsid,
        },
        crypto.randomBytes(32).toString("hex"),
      );

      const routes = [
        {
          method: "POST",
          path: "/add-contact",
          body: { usid: target.hashedUsid },
        },
        {
          method: "GET",
          path: "/contacts",
        },
        {
          method: "DELETE",
          path: "/contacts",
          body: { usid: target.hashedUsid },
        },
      ];

      const badAuth = [
        {
          label: "no Authorization header",
          headers: {},
          error: "No token",
        },
        {
          label: "Bearer with no token",
          headers: { Authorization: "Bearer" },
          error: "No token",
        },
        {
          label: "malformed token",
          headers: { Authorization: "Bearer not.a.jwt" },
          error: "Invalid token",
        },
        {
          label: "token signed with another secret",
          headers: { Authorization: `Bearer ${wrongSecretToken}` },
          error: "Invalid token",
        },
      ];

      for (const route of routes) {
        for (const auth of badAuth) {
          const res = await harness.request(route.method, route.path, {
            headers: auth.headers,
            body: route.body,
          });

          assert.equal(
            res.status,
            401,
            `${route.method} ${route.path} with ${auth.label}`,
          );

          assert.deepEqual(
            res.json,
            { error: auth.error },
            `${route.method} ${route.path} with ${auth.label}`,
          );
        }
      }

      assert.deepEqual(await contactRows(alice.userId), []);
    },
  );

  // POST /add-contact

  await t.test(
    "POST /add-contact rejects malformed JSON",
    async () => {
      const res = await harness.request("POST", "/add-contact", {
        headers: { Authorization: `Bearer ${alice.token}` },
        rawBody: "{",
      });

      assert.equal(res.status, 400);
    },
  );

  await t.test(
    "POST /add-contact rejects a missing or blank usid",
    async () => {
      await clearContacts();

      for (const body of [{}, { usid: "" }, { usid: "   " }]) {
        const res = await call("POST", "/add-contact", {
          token: alice.token,
          body,
        });

        assert.equal(res.status, 400);
        assert.deepEqual(res.body, { error: "USID is required" });
      }

      assert.deepEqual(await contactRows(alice.userId), []);
    },
  );

  await t.test(
    "POST /add-contact rejects adding yourself",
    async () => {
      await clearContacts();

      const variants = [
        alice.hashedUsid,
        `0x${alice.hashedUsid.toUpperCase()}`,
      ];

      for (const usid of variants) {
        const res = await call("POST", "/add-contact", {
          token: alice.token,
          body: { usid },
        });

        assert.equal(res.status, 400, `usid ${usid}`);

        assert.deepEqual(res.body, {
          error: "You cannot add yourself as a contact",
        });
      }

      assert.deepEqual(await contactRows(alice.userId), []);
    },
  );

  await t.test(
    "POST /add-contact returns 404 for an unknown usid",
    async () => {
      await clearContacts();

      const unknown = hashUSID(generateUSID());

      const res = await call("POST", "/add-contact", {
        token: alice.token,
        body: { usid: unknown },
      });

      assert.equal(res.status, 404);

      assert.deepEqual(res.body, {
        error: "USID not found in identity registry",
      });

      assert.deepEqual(await contactRows(alice.userId), []);
    },
  );

  await t.test(
    "POST /add-contact stores a new contact for the caller",
    async () => {
      await clearContacts();

      const target = await seedIdentity({
        name: "Carol Example",
      });

      const res = await call("POST", "/add-contact", {
        token: alice.token,
        body: { usid: target.hashedUsid },
      });

      assert.equal(res.status, 200);

      assert.deepEqual(res.body, {
        message: "Contact Carol Example added successfully",
        name: "Carol Example",
        refreshed: false,
      });

      assert.deepEqual(await contactRows(alice.userId), [
        {
          user_id: alice.userId,
          contact_hashed_usid: target.hashedUsid,
        },
      ]);

      assert.deepEqual(await contactRows(bob.userId), []);
    },
  );

  await t.test(
    "POST /add-contact normalises 0x/uppercase input to the canonical hash",
    async () => {
      await clearContacts();

      const target = await seedIdentity();

      const res = await call("POST", "/add-contact", {
        token: alice.token,
        body: {
          usid: `  0x${target.hashedUsid.toUpperCase()}  `,
        },
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.refreshed, false);

      assert.deepEqual(
        await contactHashes(alice.userId),
        [target.hashedUsid],
      );
    },
  );

  await t.test(
    "POST /add-contact accepts a legacy raw USID and stores its hash",
    async () => {
      await clearContacts();

      const rawUsid = generateUSID();

      const target = await seedIdentity({
        hashedUsid: hashUSID(rawUsid),
      });

      const res = await call("POST", "/add-contact", {
        token: alice.token,
        body: { usid: rawUsid },
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.name, target.name);

      const stored = await contactHashes(alice.userId);

      assert.deepEqual(stored, [hashUSID(rawUsid)]);
      assert.notEqual(
        stored[0],
        rawUsid,
        "the raw USID must never be stored",
      );
    },
  );

  await t.test(
    "POST /add-contact refreshes an existing contact without duplicating it",
    async () => {
      await clearContacts();

      const target = await seedIdentity({
        name: "Dave Example",
      });

      const first = await call("POST", "/add-contact", {
        token: alice.token,
        body: { usid: target.hashedUsid },
      });

      assert.equal(first.status, 200);
      assert.equal(first.body.refreshed, false);

      const second = await call("POST", "/add-contact", {
        token: alice.token,
        body: { usid: target.hashedUsid },
      });

      assert.equal(second.status, 200);

      assert.deepEqual(second.body, {
        message: "Contact Dave Example refreshed",
        name: "Dave Example",
        refreshed: true,
      });

      assert.deepEqual(
        await contactHashes(alice.userId),
        [target.hashedUsid],
      );
    },
  );

  await t.test(
    "POST /add-contact keeps each user's contact list separate",
    async () => {
      await clearContacts();

      const target = await seedIdentity();

      const res = await call("POST", "/add-contact", {
        token: alice.token,
        body: { usid: target.hashedUsid },
      });

      assert.equal(res.status, 200);

      assert.deepEqual(
        await contactHashes(alice.userId),
        [target.hashedUsid],
      );

      assert.deepEqual(await contactHashes(bob.userId), []);
    },
  );

  // GET /contacts

  await t.test(
    "GET /contacts returns an empty array when the user has no contacts",
    async () => {
      await clearContacts();

      const res = await call("GET", "/contacts", {
        token: alice.token,
      });

      assert.equal(res.status, 200);
      assert.deepEqual(res.body, []);
    },
  );

  await t.test(
    "GET /contacts lists only the caller's contacts",
    async () => {
      await clearContacts();

      const t1 = await seedIdentity();
      const t2 = await seedIdentity();
      const t3 = await seedIdentity();

      for (const target of [t1, t2]) {
        const added = await call("POST", "/add-contact", {
          token: alice.token,
          body: { usid: target.hashedUsid },
        });

        assert.equal(added.status, 200);
      }

      const addedForBob = await call("POST", "/add-contact", {
        token: bob.token,
        body: { usid: t3.hashedUsid },
      });

      assert.equal(addedForBob.status, 200);

      const aliceList = await call("GET", "/contacts", {
        token: alice.token,
      });

      assert.equal(aliceList.status, 200);
      assert.ok(Array.isArray(aliceList.body));

      assert.deepEqual(
        [...aliceList.body].sort(),
        [t1.hashedUsid, t2.hashedUsid].sort(),
      );

      const bobList = await call("GET", "/contacts", {
        token: bob.token,
      });

      assert.equal(bobList.status, 200);
      assert.deepEqual(bobList.body, [t3.hashedUsid]);
    },
  );

  // DELETE /contacts

  await t.test(
    "DELETE /contacts rejects malformed JSON",
    async () => {
      const res = await harness.request("DELETE", "/contacts", {
        headers: { Authorization: `Bearer ${alice.token}` },
        rawBody: "{",
      });

      assert.equal(res.status, 400);
    },
  );

  await t.test(
    "DELETE /contacts rejects a missing usid",
    async () => {
      await clearContacts();

      const res = await call("DELETE", "/contacts", {
        token: alice.token,
        body: {},
      });

      assert.equal(res.status, 400);
      assert.deepEqual(res.body, { error: "USID is required" });
    },
  );

  await t.test(
    "DELETE /contacts returns 404 for a contact that does not exist",
    async () => {
      await clearContacts();

      const res = await call("DELETE", "/contacts", {
        token: alice.token,
        body: { usid: hashUSID(generateUSID()) },
      });

      assert.equal(res.status, 404);
      assert.deepEqual(res.body, { error: "Contact not found" });
    },
  );

  await t.test(
    "DELETE /contacts removes the contact and a repeat delete returns 404",
    async () => {
      await clearContacts();

      const keep = await seedIdentity();
      const remove = await seedIdentity();

      for (const target of [keep, remove]) {
        const added = await call("POST", "/add-contact", {
          token: alice.token,
          body: { usid: target.hashedUsid },
        });

        assert.equal(added.status, 200);
      }

      const res = await call("DELETE", "/contacts", {
        token: alice.token,
        body: { usid: remove.hashedUsid },
      });

      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { message: "Contact removed" });

      assert.deepEqual(
        await contactHashes(alice.userId),
        [keep.hashedUsid],
      );

      const list = await call("GET", "/contacts", {
        token: alice.token,
      });

      assert.deepEqual(list.body, [keep.hashedUsid]);

      const again = await call("DELETE", "/contacts", {
        token: alice.token,
        body: { usid: remove.hashedUsid },
      });

      assert.equal(again.status, 404);
      assert.deepEqual(again.body, { error: "Contact not found" });
    },
  );

  await t.test(
    "DELETE /contacts cannot remove another user's contact",
    async () => {
      await clearContacts();

      const target = await seedIdentity();

      const added = await call("POST", "/add-contact", {
        token: alice.token,
        body: { usid: target.hashedUsid },
      });

      assert.equal(added.status, 200);

      const res = await call("DELETE", "/contacts", {
        token: bob.token,
        body: { usid: target.hashedUsid },
      });

      assert.equal(res.status, 404);
      assert.deepEqual(res.body, { error: "Contact not found" });

      assert.deepEqual(
        await contactHashes(alice.userId),
        [target.hashedUsid],
      );

      const list = await call("GET", "/contacts", {
        token: alice.token,
      });

      assert.deepEqual(list.body, [target.hashedUsid]);
    },
  );

  await t.test(
    "DELETE /contacts only affects the caller when two users share a contact",
    async () => {
      await clearContacts();

      const shared = await seedIdentity();

      for (const user of [alice, bob]) {
        const added = await call("POST", "/add-contact", {
          token: user.token,
          body: { usid: shared.hashedUsid },
        });

        assert.equal(added.status, 200);
      }

      const res = await call("DELETE", "/contacts", {
        token: alice.token,
        body: { usid: shared.hashedUsid },
      });

      assert.equal(res.status, 200);

      assert.deepEqual(await contactRows(alice.userId), []);
      assert.deepEqual(
        await contactHashes(bob.userId),
        [shared.hashedUsid],
      );
    },
  );

  await harness.assertRealDbUntouched();
});
