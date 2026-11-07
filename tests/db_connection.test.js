'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDatabase } = require('../backend/db/connection');

function get(db, statement) {
  return new Promise((resolve, reject) => {
    db.get(statement, (error, row) => (error ? reject(error) : resolve(row)));
  });
}

function close(db) {
  return new Promise((resolve, reject) => {
    db.close((error) => (error ? reject(error) : resolve()));
  });
}

test('production SQLite helper uses WAL, FULL, and a 5000ms busy timeout for all application databases', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'halonyx-production-db-'));
  const opened = [];
  try {
    for (const file of ['app.db', 'identity.db', 'keys.db']) {
      const connection = openDatabase(path.join(dir, file));
      opened.push(connection.db);
      await connection.ready;

      const journalMode = await get(connection.db, 'PRAGMA journal_mode');
      const synchronous = await get(connection.db, 'PRAGMA synchronous');
      const busyTimeout = await get(connection.db, 'PRAGMA busy_timeout');
      assert.equal(String(journalMode.journal_mode).toLowerCase(), 'wal', `${file} journal mode`);
      assert.equal(synchronous.synchronous, 2, `${file} synchronous mode must be FULL`);
      assert.equal(busyTimeout.timeout, 5000, `${file} busy timeout`);
    }
  } finally {
    await Promise.all(opened.map((db) => close(db)));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
