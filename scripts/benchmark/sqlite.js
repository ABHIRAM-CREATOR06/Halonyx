'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const sqlite3 = require('sqlite3').verbose();

const MARKER = 'halonyx-benchmark-v1';
const DEFAULT_DB = path.join(os.tmpdir(), 'halonyx-benchmark', 'app.db');
const SCHEMAS = {
  app: path.join(__dirname, '..', '..', 'backend', 'db', 'schema.sql'),
  identity: path.join(__dirname, '..', '..', 'backend', 'db', 'identity_schema.sql'),
  keys: path.join(__dirname, '..', '..', 'backend', 'db', 'key_schema.sql'),
};

function databasePaths(appPath = DEFAULT_DB) {
  const app = path.resolve(appPath);
  const dir = path.dirname(app);
  const stem = path.basename(app, path.extname(app));
  return { app, identity: path.join(dir, `${stem}.identity.db`), keys: path.join(dir, `${stem}.keys.db`) };
}

function open(file) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(file, (error) => error ? reject(error) : resolve(db));
  });
}
function run(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (error) { if (error) reject(error); else resolve({ changes: this.changes, lastID: this.lastID }); }));
}
function get(db, sql, params = []) { return new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row))); }
function all(db, sql, params = []) { return new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows))); }
function exec(db, sql) { return new Promise((resolve, reject) => db.exec(sql, (error) => error ? reject(error) : resolve())); }
function close(db) { return new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve())); }

async function inspectTables(db) { return (await all(db, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")).map((row) => row.name); }
async function verifyMarked(db, kind) {
  const tables = await inspectTables(db);
  if (!tables.includes('benchmark_metadata')) return false;
  const meta = await get(db, 'SELECT marker, kind FROM benchmark_metadata WHERE id=1');
  return !!meta && meta.marker === MARKER && meta.kind === kind;
}

async function initializeOne(file, kind, rows, reset) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const exists = fs.existsSync(file);
  if (exists) {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Refusing non-regular benchmark database path: ${file}`);
  }
  const db = await open(file);
  try {
    await exec(db, 'PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA cache_size=-2000; PRAGMA temp_store=MEMORY;');
    const tables = await inspectTables(db);
    if (exists && tables.length && !tables.includes('benchmark_metadata')) throw new Error(`Refusing to use an unmarked existing database: ${file}. Choose a new path; benchmark tooling never modifies arbitrary SQLite files.`);
    if (exists && !tables.length && fs.statSync(file).size > 0) throw new Error(`Refusing non-empty unmarked SQLite file: ${file}`);
    if (exists && tables.length && !await verifyMarked(db, kind)) throw new Error(`Refusing an existing database not owned by this benchmark (${kind}): ${file}`);

    if (!exists || !tables.length) {
      await exec(db, fs.readFileSync(SCHEMAS[kind], 'utf8'));
      await exec(db, 'CREATE TABLE benchmark_metadata (id INTEGER PRIMARY KEY CHECK (id=1), marker TEXT NOT NULL, kind TEXT NOT NULL, fixture_rows INTEGER NOT NULL, created_at TEXT NOT NULL);');
      await run(db, 'INSERT INTO benchmark_metadata VALUES (1, ?, ?, -1, ?)', [MARKER, kind, new Date().toISOString()]);
    }
    const meta = await get(db, 'SELECT marker, kind, fixture_rows FROM benchmark_metadata WHERE id=1');
    if (!meta || meta.marker !== MARKER || meta.kind !== kind) throw new Error(`Invalid benchmark database marker: ${file}`);
    if (reset) {
      await exec(db, 'BEGIN IMMEDIATE');
      const clear = kind === 'app' ? ['mailbox', 'contacts', 'users'] : kind === 'identity' ? ['users_metadata', 'server_config'] : ['key_bundles'];
      for (const table of clear) await run(db, `DELETE FROM ${table}`);
      await run(db, 'UPDATE benchmark_metadata SET fixture_rows=-1 WHERE id=1');
      await exec(db, 'COMMIT');
    } else if (meta.fixture_rows !== -1 && meta.fixture_rows !== rows) {
      throw new Error(`Database fixture uses ${meta.fixture_rows} rows; requested ${rows}. Use --reset to regenerate this marked benchmark database.`);
    }
    await validateSchema(db, kind);
    return { db, file, kind, existing: exists, reset };
  } catch (error) {
    await close(db).catch(() => {});
    throw error;
  }
}

async function validateSchema(db, kind) {
  const tables = new Set(await inspectTables(db));
  const required = kind === 'app' ? ['users', 'contacts', 'mailbox'] : kind === 'identity' ? ['users_metadata', 'server_config'] : ['key_bundles'];
  for (const table of [...required, 'benchmark_metadata']) if (!tables.has(table)) throw new Error(`Benchmark schema missing required table ${table}`);
  if (kind === 'app') {
    const indexes = new Set((await all(db, "SELECT name FROM sqlite_master WHERE type='index'")).map((row) => row.name));
    for (const index of ['idx_mailbox_recipient', 'idx_mailbox_timestamp']) if (!indexes.has(index)) throw new Error(`Benchmark schema missing index ${index}`);
  }
}

function syntheticUsid(index) { return crypto.createHash('sha256').update(`halonyx-benchmark-user-${index}`).digest('hex'); }
function fixtureRowsFor(kind, rows) {
  if (kind === 'app') return { users: rows, contacts: rows, mailbox: rows };
  if (kind === 'identity') return { users_metadata: rows };
  return { key_bundles: rows };
}

async function seedOne(record, rows, reset) {
  const { db, kind } = record;
  const meta = await get(db, 'SELECT fixture_rows FROM benchmark_metadata WHERE id=1');
  const counts = fixtureRowsFor(kind, rows);
  let matches = meta.fixture_rows === rows;
  if (matches) {
    for (const [table, count] of Object.entries(counts)) {
      const row = await get(db, `SELECT COUNT(*) AS count FROM ${table}`);
      if (row.count !== count) { matches = false; break; }
    }
  }
  if (matches) return;
  if (meta.fixture_rows !== -1 && meta.fixture_rows !== rows && !reset) throw new Error(`Database fixture uses ${meta.fixture_rows} rows; requested ${rows}. Use --reset to regenerate this marked benchmark database.`);
  await exec(db, 'BEGIN IMMEDIATE');
  try {
    const fixtureTables = kind === 'app' ? ['mailbox', 'contacts', 'users'] : kind === 'identity' ? ['users_metadata'] : ['key_bundles'];
    for (const table of fixtureTables) await run(db, `DELETE FROM ${table}`);
    for (let i = 0; i < rows; i++) {
      const usid = syntheticUsid(i);
      if (kind === 'app') {
        const inserted = await run(db, 'INSERT INTO users (hashed_usid, public_key_bundle) VALUES (?, ?)', [usid, JSON.stringify({ synthetic: true, user: i, publicKey: `public-${i}` })]);
        if (rows) await run(db, 'INSERT INTO contacts (user_id, contact_hashed_usid) VALUES (?, ?)', [inserted.lastID, syntheticUsid((i + 1) % rows)]);
        await run(db, 'INSERT INTO mailbox (recipient_hashed_usid, sender_hashed_usid, content, timestamp) VALUES (?, ?, ?, CURRENT_TIMESTAMP)', [usid, syntheticUsid((i + 1) % Math.max(rows, 1)), `synthetic-encrypted-payload-${i}`]);
      } else if (kind === 'identity') {
        const label = String(i).padStart(8, '0');
        await run(db, 'INSERT INTO users_metadata (name, email, hashed_usid) VALUES (?, ?, ?)', [`Synthetic ${label}`, `bench-${label}@example.invalid`, usid]);
      } else {
        await run(db, 'INSERT INTO key_bundles (hashed_usid, bundle, updated_at) VALUES (?, ?, ?)', [usid, JSON.stringify({ synthetic: true, user: i }), 1700000000 + i]);
      }
    }
    await run(db, 'UPDATE benchmark_metadata SET fixture_rows=? WHERE id=1', [rows]);
    await exec(db, 'COMMIT');
  } catch (error) {
    await exec(db, 'ROLLBACK').catch(() => {});
    throw error;
  }
}

async function initializeDatabase(appPath = DEFAULT_DB, rows = 1000, reset = false) {
  if (!Number.isSafeInteger(rows) || rows < 0) throw new RangeError('rows must be a non-negative integer');
  const paths = databasePaths(appPath);
  const opened = [];
  try {
    for (const kind of ['app', 'identity', 'keys']) {
      const record = await initializeOne(paths[kind], kind, rows, reset);
      opened.push(record);
      await seedOne(record, rows, reset);
    }
    const pragmas = {};
    for (const { db, kind, file } of opened) {
      await validateSchema(db, kind);
      pragmas[kind] = {};
      for (const key of ['journal_mode', 'synchronous', 'cache_size', 'foreign_keys', 'temp_store']) {
        const row = await get(db, `PRAGMA ${key}`);
        pragmas[kind][key] = row[Object.keys(row)[0]];
      }
      const expected = fixtureRowsFor(kind, rows);
      for (const [table, count] of Object.entries(expected)) {
        const row = await get(db, `SELECT COUNT(*) AS count FROM ${table}`);
        if (row.count !== count) throw new Error(`${kind}.${table} row count mismatch (${row.count}, expected ${count})`);
      }
      pragmas[kind].sizeBytes = fs.statSync(file).size;
      const version = await get(db, 'SELECT sqlite_version() AS version');
      pragmas.sqliteVersion ||= version.version;
    }
    return { paths, databases: opened, rows, pragmas };
  } catch (error) {
    await Promise.all(opened.map(({ db }) => close(db).catch(() => {})));
    throw error;
  }
}

async function cleanupDatabase(appPath = DEFAULT_DB) {
  const paths = databasePaths(appPath);
  const targets = [];
  for (const kind of ['app', 'identity', 'keys']) {
    const file = paths[kind];
    if (!fs.existsSync(file)) continue;
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Refusing to remove non-regular database path: ${file}`);
    const db = await open(file);
    let valid;
    try { valid = await verifyMarked(db, kind); }
    finally { await close(db); }
    if (!valid) throw new Error(`Refusing to remove unmarked database: ${file}`);
    targets.push(file);
  }
  for (const file of targets) fs.unlinkSync(file);
  return targets;
}

async function benchmarkSqlite(engine, database, options) {
  const { app: db } = database.databases.reduce((result, item) => (result[item.kind] = item.db, result), {});
  const rows = database.rows;
  const results = [];
  const sampleIndex = rows ? Math.floor(rows / 2) : null;
  const usid = rows ? syntheticUsid(sampleIndex) : null;
  const run = (sql, params) => new Promise((resolve, reject) => db.run(sql, params, function (error) { if (error) reject(error); else resolve({ changes: this.changes, lastID: this.lastID }); }));
  const getRow = (sql, params) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
  const add = async (definition) => results.push(await engine({ suite: 'sqlite', ...definition, parameters: { rows, ...definition.parameters } }));
  if (rows) await add({ id: 'sqlite.users.indexed-read', name: 'Indexed user lookup', parameters: { table: 'users', index: 'UNIQUE(hashed_usid)' }, fn: () => getRow('SELECT id, public_key_bundle FROM users WHERE hashed_usid=?', [usid]) });
  else await add({ id: 'sqlite.users.empty-read', name: 'Empty database indexed lookup', parameters: { rows: 0 }, fn: () => getRow('SELECT id FROM users WHERE hashed_usid=?', ['0'.repeat(64)]) });

  let sequence = 0;
  let lastInserted;
  await add({
    id: 'sqlite.users.insert-delete', name: 'Application-table insert (delete cleanup excluded)', parameters: { table: 'users' },
    fn: async () => { const value = `benchmark-insert-${process.pid}-${sequence++}`; lastInserted = value; return run('INSERT INTO users (hashed_usid, public_key_bundle) VALUES (?, ?)', [value, '{"synthetic":true}']); },
    after: async () => { if (lastInserted) { await run('DELETE FROM users WHERE hashed_usid=?', [lastInserted]); lastInserted = null; } },
  });
  if (rows) await add({ id: 'sqlite.users.update', name: 'Application-table indexed update', parameters: { table: 'users' }, fn: () => run('UPDATE users SET public_key_bundle=? WHERE hashed_usid=?', ['{"synthetic":true,"updated":true}', usid]) });
  else await add({ id: 'sqlite.users.empty-update', name: 'Empty database indexed update', parameters: { rows: 0 }, fn: () => run('UPDATE users SET public_key_bundle=? WHERE hashed_usid=?', ['{}', '0'.repeat(64)]) });
  let mailboxSequence = 0;
  await add({
    id: 'sqlite.mailbox.enqueue', name: 'Mailbox enqueue', parameters: { table: 'mailbox' },
    fn: async () => run('INSERT INTO mailbox (recipient_hashed_usid, sender_hashed_usid, content) VALUES (?, ?, ?)', [syntheticUsid((rows + mailboxSequence++) % (rows + 10000)), syntheticUsid(999999), 'synthetic-ciphertext']),
    after: async (_input, _context, output) => { if (output?.lastID) await run('DELETE FROM mailbox WHERE id=?', [output.lastID]); },
  });
  let dequeueId = null;
  await add({
    id: 'sqlite.mailbox.dequeue', name: 'Mailbox dequeue', parameters: { table: 'mailbox' },
    prepare: async () => { const inserted = await run('INSERT INTO mailbox (recipient_hashed_usid, sender_hashed_usid, content) VALUES (?, ?, ?)', [syntheticUsid(999998), syntheticUsid(999999), 'synthetic-ciphertext']); dequeueId = inserted.lastID; return dequeueId; },
    fn: (id) => run('DELETE FROM mailbox WHERE id=?', [id]),
  });
  let cleanupId = null;
  await add({
    id: 'sqlite.mailbox.expiry-cleanup', name: 'Expired mailbox cleanup', parameters: { table: 'mailbox', ttlDays: 7 },
    prepare: async () => { const inserted = await run("INSERT INTO mailbox (recipient_hashed_usid, sender_hashed_usid, content, timestamp) VALUES (?, ?, ?, datetime('now','-8 days'))", [syntheticUsid(999997), syntheticUsid(999999), 'synthetic-expired']); cleanupId = inserted.lastID; return inserted.lastID; },
    fn: () => run("DELETE FROM mailbox WHERE timestamp < datetime('now','-7 days')"),
    after: async () => { if (cleanupId) { await run('DELETE FROM mailbox WHERE id=?', [cleanupId]); cleanupId = null; } },
  });
  await add({
    id: 'sqlite.users.concurrent-reads-8', name: 'Eight concurrent indexed reads', parameters: { concurrency: 8, table: 'users' },
    fn: async () => Promise.all(Array.from({ length: 8 }, (_, i) => getRow('SELECT id FROM users WHERE hashed_usid=?', [rows ? syntheticUsid((sampleIndex + i) % rows) : '0'.repeat(64)]))),
  });
  let writeSequence = 0;
  let competingIds = [];
  await add({
    id: 'sqlite.users.competing-writes-3', name: 'Three competing inserts (serialized by SQLite)', parameters: { concurrency: 3, table: 'users' },
    fn: async () => {
      competingIds = [];
      await Promise.all(Array.from({ length: 3 }, async () => { const value = `benchmark-write-${process.pid}-${writeSequence++}`; await run('INSERT INTO users (hashed_usid, public_key_bundle) VALUES (?, ?)', [value, '{"synthetic":true}']); competingIds.push(value); }));
    },
    after: async () => { if (competingIds.length) { await Promise.all(competingIds.map((id) => run('DELETE FROM users WHERE hashed_usid=?', [id]))); competingIds = []; } },
  });
  for (const result of results) result.database = { rows, pragmas: database.pragmas, sizeBytes: database.pragmas.app.sizeBytes };
  return results;
}

module.exports = { MARKER, DEFAULT_DB, databasePaths, initializeDatabase, cleanupDatabase, benchmarkSqlite, syntheticUsid, open, run, get, all, close };
