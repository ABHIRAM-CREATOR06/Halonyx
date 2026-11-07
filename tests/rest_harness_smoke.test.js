"use strict";

/**
 * Smoke test for tests/rest_harness.js.
 *
 * Proves the harness is safe to build the REST route tests on:
 *  1. it uses a temporary database directory
 *  2. the real backend/db/*.db files are left untouched
 *  3. importing backend/server.js does not bind HTTP or UDP listeners
 *  4. the exported app serves requests through the ephemeral port
 *  5. a JWT from the real /signup route is accepted by GET /contacts
 *  6. different X-Forwarded-For addresses get independent rate-limit buckets
 *  7. teardown leaves no open handles and restores the environment
 */

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it, before, after } = require("node:test");
const jwt = require("jsonwebtoken");
const { startHarness, isPathInside, REAL_DB_DIR } = require("./rest_harness");

// Documentation-reserved addresses (TEST-NET-2). The harness hands out 10.x.y.z by
// default, so these can never collide with another request's bucket.
const LIMIT_IP_A = "198.51.100.10";
const LIMIT_IP_B = "198.51.100.11";

describe("REST test harness", () => {
  let harness;

  before(async () => {
    harness = await startHarness();
  });

  after(async () => {
    if (!harness) return;
    const errors = await harness.stop();
    assert.equal(errors.length, 0, `cleanup errors: ${errors.map(String).join("; ")}`);
  });

  it("uses isolated WAL/FULL SQLite connections for all three application database files", async () => {
    assert.ok(path.isAbsolute(harness.dbDir));
    assert.ok(isPathInside(os.tmpdir(), harness.dbDir), "database directory should be under the OS temp directory");
    assert.ok(!isPathInside(REAL_DB_DIR, harness.dbDir), "database directory must not be inside backend/db");

    const expected = {
      db: "app.db",
      idDb: "identity.db",
      keyDb: "keys.db",
    };
    for (const [handle, fileName] of Object.entries(expected)) {
      const [main] = await harness.sql.all(harness[handle], "PRAGMA database_list");
      assert.equal(
        fs.realpathSync(main.file),
        fs.realpathSync(path.join(harness.dbDir, fileName)),
        `${handle} should be backed by ${fileName} inside the temporary directory`,
      );
      const journalMode = await harness.sql.get(harness[handle], "PRAGMA journal_mode");
      const synchronous = await harness.sql.get(harness[handle], "PRAGMA synchronous");
      const busyTimeout = await harness.sql.get(harness[handle], "PRAGMA busy_timeout");
      assert.equal(String(journalMode.journal_mode).toLowerCase(), "wal");
      assert.equal(synchronous.synchronous, 2, "FULL synchronous mode must remain enabled");
      assert.equal(busyTimeout.timeout, 5000, "SQLite lock waits must use the configured busy timeout");
    }
  });

  it("does not bind HTTP or UDP listeners just by importing server.js", () => {
    // Captured by the harness immediately after require(), before it called listen().
    assert.equal(harness.afterImport.httpListening, false);
    assert.equal(harness.afterImport.udpBound, false);

    // The harness itself listens on an ephemeral loopback port only; the UDP socket stays unbound.
    assert.equal(harness.server.listening, true);
    const address = harness.server.address();
    assert.equal(address.address, "127.0.0.1");
    assert.ok(Number.isInteger(address.port) && address.port > 0);
    assert.ok(harness.baseUrl.startsWith("http://127.0.0.1:"));
    assert.throws(() => harness.udpServer.address(), "UDP socket should not be bound");
  });

  it("serves requests from the exported app through the ephemeral port", async () => {
    const protectedRoute = await harness.request("GET", "/contacts");
    assert.equal(protectedRoute.status, 401);
    assert.equal(protectedRoute.json.error, "No token");

    const publicRoute = await harness.request("GET", `/keys/${"0".repeat(64)}`);
    assert.equal(publicRoute.status, 404);
    assert.equal(publicRoute.json.error, "Key bundle not found");
  });

  it("accepts a JWT issued by the real /signup route and matches the harness token shape", async () => {
    const signup = await harness.request("POST", "/signup", {
      body: { name: "Smoke Signup", email: "smoke-signup@example.test" },
    });
    assert.equal(signup.status, 200, signup.text);
    assert.equal(typeof signup.json.token, "string");
    assert.equal(typeof signup.json.usid, "string");

    const payload = jwt.verify(signup.json.token, harness.jwtSecret);
    assert.equal(payload.hashedUsid, signup.json.usid);
    assert.ok(Number.isInteger(payload.userId));

    const viaSignup = await harness.request("GET", "/contacts", { token: signup.json.token });
    assert.equal(viaSignup.status, 200);
    assert.deepEqual(viaSignup.json, []);

    // A token minted by the harness for the same identity is accepted and has the same claims.
    const minted = harness.mintToken({ userId: payload.userId, hashedUsid: payload.hashedUsid });
    assert.deepEqual(Object.keys(jwt.decode(minted)).sort(), Object.keys(payload).sort());
    const viaMinted = await harness.request("GET", "/contacts", { token: minted });
    assert.equal(viaMinted.status, 200);

    // A harness-created user (written to both temporary databases) is accepted as well.
    const user = await harness.createUser();
    const identityRow = await harness.sql.get(harness.idDb, "SELECT id, hashed_usid FROM users_metadata WHERE id = ?", [user.userId]);
    const appRow = await harness.sql.get(harness.db, "SELECT hashed_usid FROM users WHERE hashed_usid = ?", [user.hashedUsid]);
    assert.equal(identityRow.hashed_usid, user.hashedUsid);
    assert.equal(appRow.hashed_usid, user.hashedUsid);
    const viaUser = await harness.request("GET", "/contacts", { token: user.token });
    assert.equal(viaUser.status, 200);
    assert.deepEqual(viaUser.json, []);
  });

  it("gives different X-Forwarded-For addresses independent rate-limit buckets", async () => {
    // Probe: /signup, which has its own limiter. This process owns its own in-memory limiter
    // state and no other test file shares it, so exhausting these two addresses cannot
    // affect the real route tests (separate processes, and different limiters/IPs anyway).
    const signupUntilLimited = async (ip, tag, maxAttempts = 25) => {
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const res = await harness.request("POST", "/signup", {
          ip,
          body: { name: `Rate ${tag} ${attempt}`, email: `rate-${tag}-${attempt}@example.test` },
        });
        if (res.status === 429) return attempt;
        assert.equal(res.status, 200, `unexpected status ${res.status} on attempt ${attempt}: ${res.text}`);
      }
      assert.fail(`no 429 after ${maxAttempts} signups from ${ip}`);
    };

    const limitedAt = await signupUntilLimited(LIMIT_IP_A, "a");
    assert.ok(limitedAt >= 2, "at least one request should be allowed before the limit applies");

    // A different address still gets through while the first one is limited.
    const other = await harness.request("POST", "/signup", {
      ip: LIMIT_IP_B,
      body: { name: "Rate b", email: "rate-b@example.test" },
    });
    assert.equal(other.status, 200, other.text);

    // And the first address is still limited afterwards.
    const again = await harness.request("POST", "/signup", {
      ip: LIMIT_IP_A,
      body: { name: "Rate a again", email: "rate-a-again@example.test" },
    });
    assert.equal(again.status, 429);

    // Default addresses are valid, distinct IPv4 strings.
    const first = harness.nextIp();
    const second = harness.nextIp();
    assert.notEqual(first, second);
    assert.match(first, /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
  });

  it("left the real backend/db database files untouched", () => {
    // Runs after every test above has written to the temporary databases.
    harness.assertRealDbUntouched();
  });

  it("tears down cleanly: process exits on its own, temp dir removed, environment restored", () => {
    // Fresh child process: a hang here would mean the harness leaked an open handle.
    const harnessPath = require.resolve("./rest_harness");
    const script = `
      const fs = require("node:fs");
      const { startHarness } = require(${JSON.stringify(harnessPath)});
      const keys = ["HALONYX_DB_DIR", "JWT_SECRET", "NODE_ENV", "PORT"];
      const snap = () => JSON.stringify(keys.map((k) => process.env[k]));
      const before = snap();
      (async () => {
        const h = await startHarness();
        const dir = h.dbDir;
        const res = await h.request("GET", "/contacts");
        const errors = await h.stop();
        console.log("RESULT:" + JSON.stringify({
          status: res.status,
          dirExists: fs.existsSync(dir),
          cleanupErrors: errors.map(String),
          envRestored: snap() === before,
        }));
      })().catch((err) => { console.error(err); process.exit(1); });
    `;
    const result = spawnSync(process.execPath, ["-e", script], {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf8",
      timeout: 30000,
      killSignal: "SIGKILL",
    });
    assert.equal(result.error, undefined, `child did not exit by itself (open handle?): ${result.error}`);
    assert.equal(result.status, 0, `child failed: ${result.stderr}`);
    const line = result.stdout.split("\n").find((l) => l.startsWith("RESULT:"));
    assert.ok(line, `no RESULT line in child output: ${result.stdout}`);
    assert.deepEqual(JSON.parse(line.slice("RESULT:".length)), {
      status: 401,
      dirExists: false,
      cleanupErrors: [],
      envRestored: true,
    });
  });
});
