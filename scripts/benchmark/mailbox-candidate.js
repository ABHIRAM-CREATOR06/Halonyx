'use strict';

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
  });
}

function compareMailboxRows(left, right) {
  const leftTimestamp = String(left.timestamp ?? '');
  const rightTimestamp = String(right.timestamp ?? '');
  if (leftTimestamp < rightTimestamp) return -1;
  if (leftTimestamp > rightTimestamp) return 1;
  return Number(left.id) - Number(right.id);
}

function formatMailboxMessage(row) {
  let parsed = null;
  try { parsed = JSON.parse(row.content); } catch (_) {}
  if (parsed && parsed.type === 'x3dh_init') {
    return { ...parsed, from: row.sender_hashed_usid };
  }
  return {
    type: 'message',
    from: row.sender_hashed_usid,
    encrypted: parsed !== null ? parsed : row.content,
    timestamp: row.timestamp,
  };
}

/**
 * Flush one recipient on a dedicated connection. The caller must serialize calls
 * using this connection; it must not be shared with unrelated application queries.
 */
async function flushMailbox(db, recipientHashedUsid, send) {
  if (typeof send !== 'function') throw new TypeError('send must be a function');

  await run(db, 'BEGIN IMMEDIATE');
  try {
    const rows = await all(
      db,
      `DELETE FROM mailbox
       WHERE recipient_hashed_usid = ?
         AND timestamp >= datetime('now', '-7 days')
       RETURNING id, recipient_hashed_usid, sender_hashed_usid, content, timestamp`,
      [recipientHashedUsid],
    );
    rows.sort(compareMailboxRows);
    for (const row of rows) send(JSON.stringify(formatMailboxMessage(row)));
    await run(db, 'COMMIT');
    return rows.length;
  } catch (error) {
    await run(db, 'ROLLBACK').catch(() => {});
    throw error;
  }
}

module.exports = { compareMailboxRows, flushMailbox, formatMailboxMessage };
