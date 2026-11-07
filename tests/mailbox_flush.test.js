'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDatabase } = require('../backend/db/connection');
const { flushMailbox } = require('../scripts/benchmark/mailbox-candidate');

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}
function get(db, sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
}

async function withMailboxDb(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'halonyx-mailbox-test-'));
  const connection = openDatabase(path.join(dir, 'app.db'));
  try {
    await connection.ready;
    await run(connection.db, `CREATE TABLE mailbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_hashed_usid TEXT NOT NULL,
      sender_hashed_usid TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await fn(connection.db);
  } finally {
    await new Promise((resolve) => connection.db.close(() => resolve()));
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('DELETE RETURNING flushes recent messages in timestamp order and preserves payload formatting', async () => {
  await withMailboxDb(async (db) => {
    const recipient = 'recipient';
    await run(db, 'INSERT INTO mailbox (recipient_hashed_usid, sender_hashed_usid, content, timestamp) VALUES (?, ?, ?, datetime(\'now\', \'-1 day\'))', [recipient, 'sender-new', JSON.stringify({ id: 'newer' })]);
    await run(db, 'INSERT INTO mailbox (recipient_hashed_usid, sender_hashed_usid, content, timestamp) VALUES (?, ?, ?, datetime(\'now\', \'-2 days\'))', [recipient, 'sender-old', JSON.stringify({ id: 'older' })]);
    await run(db, 'INSERT INTO mailbox (recipient_hashed_usid, sender_hashed_usid, content, timestamp) VALUES (?, ?, ?, datetime(\'now\', \'-8 days\'))', [recipient, 'sender-expired', JSON.stringify({ id: 'expired' })]);
    await run(db, 'INSERT INTO mailbox (recipient_hashed_usid, sender_hashed_usid, content) VALUES (?, ?, ?)', [recipient, 'sender-x3dh', JSON.stringify({ type: 'x3dh_init', ratchetPublic: 'synthetic' })]);

    const sent = [];
    const flushed = await flushMailbox(db, recipient, (payload) => sent.push(JSON.parse(payload)));
    assert.equal(flushed, 3);
    assert.deepEqual(sent.map((message) => message.type === 'message' ? message.encrypted.id : message.type), ['older', 'newer', 'x3dh_init']);
    assert.equal(sent[0].from, 'sender-old');
    assert.equal(sent[2].from, 'sender-x3dh');
    assert.equal((await get(db, 'SELECT COUNT(*) AS count FROM mailbox WHERE recipient_hashed_usid=?', [recipient])).count, 1);
    assert.equal((await get(db, 'SELECT content FROM mailbox WHERE recipient_hashed_usid=?', [recipient])).content, JSON.stringify({ id: 'expired' }));
  });
});

test('mailbox flush rolls back deleted rows when a synchronous send throws', async () => {
  await withMailboxDb(async (db) => {
    await run(db, 'INSERT INTO mailbox (recipient_hashed_usid, sender_hashed_usid, content) VALUES (?, ?, ?)', ['recipient', 'sender', JSON.stringify({ id: 'retry-me' })]);
    await assert.rejects(
      () => flushMailbox(db, 'recipient', () => { throw new Error('synthetic socket send failure'); }),
      /synthetic socket send failure/,
    );
    assert.equal((await get(db, 'SELECT COUNT(*) AS count FROM mailbox WHERE recipient_hashed_usid=?', ['recipient'])).count, 1);
  });
});
