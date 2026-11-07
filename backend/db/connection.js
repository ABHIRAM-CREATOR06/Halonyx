'use strict';

const sqlite3 = require('sqlite3').verbose();

const JOURNAL_MODE = 'WAL';
const DEFAULT_SYNCHRONOUS = 'FULL';
const BUSY_TIMEOUT_MS = 5000;

function openDatabase(file) {
  const db = new sqlite3.Database(file);
  const ready = new Promise((resolve, reject) => {
    let pending = 3;
    let settled = false;
    const done = (error) => {
      if (settled) return;
      if (error) {
        settled = true;
        reject(error);
        return;
      }
      pending -= 1;
      if (pending === 0) {
        settled = true;
        resolve();
      }
    };

    db.serialize(() => {
      db.run(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`, done);
      db.get(`PRAGMA journal_mode = ${JOURNAL_MODE}`, (error, row) => {
        if (error) return done(error);
        if (String(row?.journal_mode).toLowerCase() !== JOURNAL_MODE.toLowerCase()) {
          return done(new Error(`SQLite refused journal_mode=${JOURNAL_MODE} for ${file}`));
        }
        done();
      });
      db.run(`PRAGMA synchronous = ${DEFAULT_SYNCHRONOUS}`, done);
    });
  });

  return {
    db,
    ready,
    settings: Object.freeze({
      journalMode: JOURNAL_MODE,
      synchronous: DEFAULT_SYNCHRONOUS,
      busyTimeoutMs: BUSY_TIMEOUT_MS,
    }),
  };
}

module.exports = {
  BUSY_TIMEOUT_MS,
  DEFAULT_SYNCHRONOUS,
  JOURNAL_MODE,
  openDatabase,
};
