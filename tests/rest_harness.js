"use strict";

/**
 * REST test harness for backend/server.js.
 *
 * Usage (once per test file, because backend/server.js is cached by `require`):
 *
 *   const { startHarness } = require("./rest_harness");
 *   const harness = await startHarness();   // in a before() hook
 *   ...
 *   const errors = await harness.stop();    // in an after() hook; never throws
 *
 * This file is intentionally NOT named *.test.js, so `npm test`
 * (`node --test tests/*.test.js`) does not run it as a test.
 *
 * What it guarantees
 *  - All three SQLite databases and the JWT secret live in a fresh temporary
 *    directory. The real backend/db/*.db files are never opened.
 *  - Importing backend/server.js binds nothing; this harness listens on an
 *    ephemeral loopback port only (never 3000 or UDP 9000).
 *  - Teardown closes every handle the server creates and restores the
 *    environment, so the test process can exit on its own.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const jwt = require("jsonwebtoken");
// utils.js only needs `crypto`; requiring it does NOT load backend/server.js.
const { generateUSID, hashUSID } = require("../backend/utils");

const SERVER_PATH = require.resolve("../backend/server");
const REAL_DB_DIR = path.resolve(__dirname, "..", "backend", "db");

const TEMP_DIR_PREFIX = "halonyx-rest-test-";
// Deterministic, comfortably longer than the 16 chars the server expects of a stored secret.
const TEST_JWT_SECRET = "halonyx-rest-test-secret-0123456789abcdef0123456789";
// Environment variables the harness changes. Snapshotted before, restored after.
const ENV_KEYS = ["HALONYX_DB_DIR", "JWT_SECRET", "NODE_ENV", "PORT"];

const DEFAULT_REQUEST_TIMEOUT_MS = 10000;
const SCHEMA_TIMEOUT_MS = 5000;
const CLOSE_TIMEOUT_MS = 5000;

// Tables the server's schema initialisation (async, queued at import time) must have created.
const REQUIRED_TABLES = [
  ["db", ["users", "contacts", "mailbox"]],
  ["idDb", ["users_metadata", "server_config"]],
  ["keyDb", ["key_bundles"]],
];

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Poll `predicate` until it returns a truthy value or the deadline passes.
 * Exceptions thrown by the predicate count as "not ready yet" and are
 * reported if the wait times out. Bounded, so it can never hang a test run.
 */
async function waitFor(predicate, { timeoutMs = 5000, intervalMs = 10, description = "condition" } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  for (;;) {
    try {
      const value = await predicate();
      if (value) return value;
      lastError = undefined;
    } catch (err) {
      lastError = err;
    }
    if (Date.now() >= deadline) break;
    await sleep(intervalMs);
  }
  const detail = lastError ? `: ${lastError.message}` : "";
  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for ${description}${detail}`,
    lastError ? { cause: lastError } : undefined,
  );
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms: ${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Promise wrappers around the sqlite3 callback API.
const sql = {
  run(handle, statement, params = []) {
    return new Promise((resolve, reject) => {
      handle.run(statement, params, function onRun(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  },
  get(handle, statement, params = []) {
    return new Promise((resolve, reject) => {
      handle.get(statement, params, (err, row) => (err ? reject(err) : resolve(row)));
    });
  },
  all(handle, statement, params = []) {
    return new Promise((resolve, reject) => {
      handle.all(statement, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });
  },
};

function snapshotEnv() {
  const snapshot = {};
  for (const key of ENV_KEYS) {
    snapshot[key] = Object.prototype.hasOwnProperty.call(process.env, key) ? process.env[key] : undefined;
  }
  return snapshot;
}

function restoreEnv(snapshot) {
  for (const key of ENV_KEYS) {
    if (snapshot[key] === undefined) delete process.env[key];
    else process.env[key] = snapshot[key];
  }
}

function safeRealpath(target) {
  try {
    return fs.realpathSync(target);
  } catch {
    return path.resolve(target);
  }
}

/** True when `child` is `parent` itself or lives somewhere below it. */
function isPathInside(parent, child) {
  const relative = path.relative(safeRealpath(parent), safeRealpath(child));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isUdpBound(socket) {
  try {
    socket.address();
    return true;
  } catch {
    return false;
  }
}

/** Size and mtime of every database file in the REAL backend/db directory. */
function snapshotRealDbFiles() {
  let names;
  try {
    names = fs.readdirSync(REAL_DB_DIR);
  } catch (err) {
    if (err && err.code === "ENOENT") return {};
    throw err;
  }
  const snapshot = {};
  for (const name of names.filter((n) => /\.db(-journal|-wal|-shm)?$/.test(n)).sort()) {
    const stat = fs.statSync(path.join(REAL_DB_DIR, name));
    snapshot[name] = { size: stat.size, mtimeMs: stat.mtimeMs };
  }
  return snapshot;
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

/**
 * Release everything in dependency order. Every step is attempted even if an
 * earlier one fails; failures are collected and returned, never thrown, so a
 * cleanup problem cannot mask the test failure that triggered it.
 *
 * Order matters:
 *  1. HTTP connections and server first, so no request touches a closing DB.
 *  2. WebSocket server and UDP socket (created at import time by server.js).
 *  3. All three SQLite handles BEFORE the directory is removed; deleting the
 *     files under an open handle makes sqlite emit an unhandled error.
 *  4. Remove the temp directory.
 *  5. Restore the environment.
 */
async function cleanup(state) {
  const errors = [];
  const attempt = async (label, step) => {
    try {
      await step();
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      errors.push(new Error(`cleanup step "${label}" failed: ${message}`, { cause: err }));
    }
  };

  const { server, wss, udpServer, dir } = state;

  await attempt("http connections", () => {
    if (server && typeof server.closeAllConnections === "function") server.closeAllConnections();
  });

  await attempt("http server", async () => {
    if (!server || !server.listening) return;
    await withTimeout(new Promise((resolve) => server.close(() => resolve())), CLOSE_TIMEOUT_MS, "http server close");
  });

  await attempt("websocket server", async () => {
    if (!wss) return;
    for (const client of wss.clients) client.terminate();
    await withTimeout(new Promise((resolve) => wss.close(() => resolve())), CLOSE_TIMEOUT_MS, "websocket server close");
  });

  await attempt("udp socket", async () => {
    if (!udpServer) return;
    await withTimeout(
      new Promise((resolve, reject) => {
        try {
          udpServer.close(() => resolve());
        } catch (err) {
          if (err && err.code === "ERR_SOCKET_DGRAM_NOT_RUNNING") resolve();
          else reject(err);
        }
      }),
      CLOSE_TIMEOUT_MS,
      "udp socket close",
    );
  });

  for (const [label, handle] of [
    ["app database", state.db],
    ["identity database", state.idDb],
    ["key database", state.keyDb],
  ]) {
    await attempt(label, async () => {
      if (!handle) return;
      await withTimeout(
        new Promise((resolve, reject) => handle.close((err) => (err ? reject(err) : resolve()))),
        CLOSE_TIMEOUT_MS,
        `${label} close`,
      );
    });
  }

  await attempt("remove temp directory", () => {
    if (!dir) return;
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    if (fs.existsSync(dir)) throw new Error(`${dir} still exists`);
  });

  await attempt("restore environment", () => restoreEnv(state.envSnapshot));

  return errors;
}

function reportCleanupErrors(errors) {
  for (const err of errors) console.error(`[rest_harness] ${err.message}`);
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

let started = false;

/**
 * Create the temp dir, load backend/server.js against it, wait for the
 * databases, and listen on 127.0.0.1:<ephemeral>. Call at most once per process.
 */
async function startHarness() {
  if (started) {
    throw new Error("rest_harness: startHarness() may only be called once per test file (backend/server.js is cached by require).");
  }
  if (require.cache[SERVER_PATH]) {
    throw new Error(
      "rest_harness: backend/server.js was already loaded in this process, so it may already point at the real databases. " +
        "Do not require it before startHarness().",
    );
  }
  started = true;

  const envSnapshot = snapshotEnv();
  const realDbBefore = snapshotRealDbFiles();
  const state = { envSnapshot };

  try {
    // Safety pre-flight, before anything is loaded: a server.js that ignores HALONYX_DB_DIR
    // would open the REAL backend/db files the moment it is required, so refuse to load it.
    if (!fs.readFileSync(SERVER_PATH, "utf8").includes("HALONYX_DB_DIR")) {
      throw new Error(
        "rest_harness: backend/server.js does not support HALONYX_DB_DIR; refusing to load it " +
          "because it would open the real databases (testability refactor missing?)",
      );
    }

    // WHY THIS DIRECTORY MUST EXIST BEFORE `require("../backend/server")`:
    // server.js opens app.db, identity.db and keys.db (and resolves the JWT secret
    // file) while the module is being loaded, using HALONYX_DB_DIR as read at that
    // moment. sqlite3 does not create missing parent directories, so the directory
    // has to exist already, and setting the variable after the require has no effect:
    // the server would already have opened the real backend/db files.
    const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), TEMP_DIR_PREFIX));
    state.dir = dir;
    if (isPathInside(REAL_DB_DIR, dir)) {
      throw new Error(`rest_harness: refusing to use ${dir}; it is inside the real backend/db directory`);
    }

    process.env.HALONYX_DB_DIR = dir;
    process.env.JWT_SECRET = TEST_JWT_SECRET;
    process.env.NODE_ENV = "test"; // keeps Express from logging stack traces for expected 4xx/5xx
    delete process.env.PORT; // never let a developer's PORT leak into the run

    const mod = require(SERVER_PATH);
    // Register whatever handles exist BEFORE validating anything, so that teardown can close
    // them even if a later startup step fails (otherwise the temp dir would be deleted
    // underneath open SQLite handles).
    if (mod) {
      Object.assign(state, {
        server: mod.server,
        wss: mod.wss,
        udpServer: mod.udpServer,
        db: mod.db,
        idDb: mod.idDb,
        keyDb: mod.keyDb,
        dbReady: mod.dbReady,
      });
    }
    const missing = ["app", "server", "wss", "udpServer", "db", "idDb", "keyDb", "dbReady"].filter((k) => !mod || !mod[k]);
    if (missing.length > 0) {
      throw new Error(`rest_harness: backend/server.js does not export: ${missing.join(", ")} (testability refactor missing?)`);
    }
    const { app, server, wss, udpServer, db, idDb, keyDb } = mod;

    // Record, before this harness listens, whether the import alone opened any listener.
    const afterImport = { httpListening: server.listening, udpBound: isUdpBound(udpServer) };
    if (afterImport.httpListening || afterImport.udpBound) {
      throw new Error(
        "rest_harness: importing backend/server.js started a listener " +
          `(http: ${afterImport.httpListening}, udp: ${afterImport.udpBound}); it must only listen when run directly.`,
      );
    }

    await withTimeout(mod.dbReady, SCHEMA_TIMEOUT_MS, "database connection and schema initialization");

    // Schema creation is queued asynchronously at import time; poll (bounded) until it is visible.
    const handles = { db, idDb, keyDb };
    await waitFor(
      async () => {
        for (const [key, tables] of REQUIRED_TABLES) {
          const marks = tables.map(() => "?").join(", ");
          const rows = await sql.all(
            handles[key],
            `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${marks})`,
            tables,
          );
          if (rows.length !== tables.length) return false;
        }
        return true;
      },
      { timeoutMs: SCHEMA_TIMEOUT_MS, description: "SQLite schema initialisation" },
    );

    await new Promise((resolve, reject) => {
      const onError = (err) => reject(err);
      server.once("error", onError);
      server.listen(0, "127.0.0.1", () => {
        server.removeListener("error", onError);
        resolve();
      });
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    // --- helpers bound to this run ----------------------------------------

    // Unique, valid IPv4 per call (10.x.y.z). server.js trusts one proxy hop, so the
    // rate limiters key on X-Forwarded-For; a fresh address per request keeps tests
    // from sharing a rate-limit bucket. Tests that need a specific bucket pass `ip`.
    let ipCounter = 0;
    const nextIp = () => {
      const n = ipCounter++;
      const host = (n % 254) + 1;
      const block = Math.floor(n / 254);
      return `10.${(block >> 8) & 255}.${block & 255}.${host}`;
    };

    /**
     * fetch wrapper. options: { token, body (JSON-encoded), rawBody (sent verbatim),
     * headers, ip (string; null = send no X-Forwarded-For), timeoutMs }.
     * Resolves { status, headers, text, json } (json only for JSON responses).
     */
    const request = async (method, pathname, options = {}) => {
      const { token, body, rawBody, headers = {}, ip, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS } = options;
      if (body !== undefined && rawBody !== undefined) throw new Error("request(): pass either body or rawBody, not both");
      const requestHeaders = { ...headers };
      if (token !== undefined && token !== null) requestHeaders.authorization = `Bearer ${token}`;
      let payload;
      if (body !== undefined) {
        payload = JSON.stringify(body);
        requestHeaders["content-type"] = "application/json";
      } else if (rawBody !== undefined) {
        payload = rawBody;
        if (!Object.keys(requestHeaders).some((k) => k.toLowerCase() === "content-type")) {
          requestHeaders["content-type"] = "application/json";
        }
      }
      if (ip !== null && !Object.keys(requestHeaders).some((k) => k.toLowerCase() === "x-forwarded-for")) {
        requestHeaders["x-forwarded-for"] = ip === undefined ? nextIp() : ip;
      }
      const response = await fetch(baseUrl + pathname, {
        method,
        headers: requestHeaders,
        body: payload,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await response.text();
      let json;
      if ((response.headers.get("content-type") || "").includes("application/json")) {
        try {
          json = JSON.parse(text);
        } catch {
          json = undefined;
        }
      }
      return { status: response.status, headers: response.headers, text, json };
    };

    /**
     * Sign a token exactly like the server does: payload { userId, hashedUsid },
     * HS256, no expiry. `secret` / `expiresIn` exist only for negative tests.
     */
    const mintToken = ({ userId, hashedUsid }, { secret = TEST_JWT_SECRET, expiresIn } = {}) =>
      jwt.sign({ userId, hashedUsid }, secret, expiresIn === undefined ? undefined : { expiresIn });

    /**
     * Create a user the way /signup does: a users_metadata row in identity.db (its id
     * becomes the JWT userId) and a users row in app.db. Pass withAppUserRow:false to
     * skip the app.db row. Everything is written to the temporary databases.
     */
    let userCounter = 0;
    const createUser = async (options = {}) => {
      const n = ++userCounter;
      const name = options.name ?? `Test User ${n}`;
      const email = options.email ?? `test-user-${n}@example.test`;
      const usid = options.usid ?? generateUSID();
      const hashedUsid = hashUSID(usid);
      const publicKeyBundle = JSON.stringify({ identityKey: options.publicKey || "placeholder-public-key" });

      const { lastID: userId } = await sql.run(
        idDb,
        "INSERT INTO users_metadata (name, email, hashed_usid) VALUES (?, ?, ?)",
        [name, email, hashedUsid],
      );
      if (options.withAppUserRow !== false) {
        await sql.run(db, "INSERT INTO users (hashed_usid, public_key_bundle) VALUES (?, ?)", [hashedUsid, publicKeyBundle]);
      }
      return { name, email, usid, hashedUsid, userId, token: mintToken({ userId, hashedUsid }) };
    };

    const assertRealDbUntouched = () => {
      assert.deepEqual(
        snapshotRealDbFiles(),
        realDbBefore,
        "database files in the real backend/db directory changed while the REST harness was running",
      );
    };

    let stopPromise;
    const stop = () => {
      if (!stopPromise) {
        stopPromise = cleanup(state).then((errors) => {
          harness.cleanupErrors = errors;
          reportCleanupErrors(errors);
          return errors;
        });
      }
      return stopPromise;
    };

    const harness = {
      baseUrl,
      dbDir: dir,
      jwtSecret: TEST_JWT_SECRET,
      app,
      server,
      wss,
      udpServer,
      db,
      idDb,
      keyDb,
      afterImport,
      realDbBefore,
      sql,
      request,
      createUser,
      mintToken,
      nextIp,
      waitFor,
      assertRealDbUntouched,
      cleanupErrors: undefined,
      stop,
    };
    return harness;
  } catch (err) {
    // Startup failed part-way: release whatever was acquired, then surface the ORIGINAL error.
    reportCleanupErrors(await cleanup(state));
    throw err;
  }
}

module.exports = {
  startHarness,
  waitFor,
  snapshotRealDbFiles,
  isPathInside,
  REAL_DB_DIR,
  TEST_JWT_SECRET,
};
