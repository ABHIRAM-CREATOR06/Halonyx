const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { initializeDatabase, cleanupDatabase, databasePaths, open, get, close, syntheticUsid } = require('../scripts/benchmark/sqlite');

async function withTemp(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'halonyx-benchmark-test-'));
  try { await fn(path.join(dir, 'fixture.db')); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('benchmark DB uses actual schema, indexes, deterministic synthetic rows, and empty fixtures', async () => {
  await withTemp(async (file) => {
    const empty = await initializeDatabase(file, 0);
    assert.equal(empty.pragmas.app.journal_mode, 'delete');
    assert.equal(empty.pragmas.sqliteVersion != null, true);
    await Promise.all(empty.databases.map((item) => close(item.db)));
    const dbs = await initializeDatabase(file, 12, true);
    const app = dbs.databases.find((item) => item.kind === 'app').db;
    assert.equal((await get(app, 'SELECT COUNT(*) AS n FROM users')).n, 12);
    assert.equal((await get(app, 'SELECT COUNT(*) AS n FROM contacts')).n, 12);
    assert.equal((await get(app, 'SELECT COUNT(*) AS n FROM mailbox')).n, 12);
    assert.equal((await get(app, 'SELECT COUNT(*) AS n FROM users WHERE hashed_usid=?', [syntheticUsid(5)])).n, 1);
    await Promise.all(dbs.databases.map((item) => close(item.db)));
    const again = await initializeDatabase(file, 12);
    assert.equal((await get(again.databases[0].db, 'SELECT COUNT(*) AS n FROM users')).n, 12);
    await Promise.all(again.databases.map((item) => close(item.db)));
  });
});

test('reset and cleanup require a marked benchmark database; arbitrary SQLite files are preserved', async () => {
  await withTemp(async (file) => {
    const first = await initializeDatabase(file, 4);
    await Promise.all(first.databases.map((item) => close(item.db)));
    const reset = await initializeDatabase(file, 2, true);
    assert.equal((await get(reset.databases[0].db, 'SELECT COUNT(*) AS n FROM users')).n, 2);
    await Promise.all(reset.databases.map((item) => close(item.db)));
    const removed = await cleanupDatabase(file);
    assert.equal(removed.length, 3);
    assert.equal(fs.existsSync(databasePaths(file).app), false);
    const arbitrary = path.join(path.dirname(file), 'keep-me.db');
    const db = await open(arbitrary);
    await new Promise((resolve, reject) => db.run('CREATE TABLE keep_me (value TEXT)', (error) => error ? reject(error) : resolve()));
    await close(db);
    await assert.rejects(() => initializeDatabase(arbitrary, 1), /unmarked existing database/);
    assert.equal(fs.existsSync(arbitrary), true);
    await assert.rejects(() => cleanupDatabase(arbitrary), /unmarked database/);
    assert.equal(fs.existsSync(arbitrary), true);
  });
});

test('fixture row count changes require an explicit reset', async () => {
  await withTemp(async (file) => {
    const first = await initializeDatabase(file, 5);
    await Promise.all(first.databases.map((item) => close(item.db)));
    await assert.rejects(() => initializeDatabase(file, 7), /Use --reset/);
    const reset = await initializeDatabase(file, 7, true);
    assert.equal((await get(reset.databases[0].db, 'SELECT COUNT(*) AS n FROM users')).n, 7);
    await Promise.all(reset.databases.map((item) => close(item.db)));
  });
});
