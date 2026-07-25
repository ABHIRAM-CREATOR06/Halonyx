// Verifies that the sqlite3 native binding loaded correctly and can run a
// query. Used as a CI smoke test right after `npm ci`, before the full test
// suite depends on the database — catches ABI mismatches / broken native
// builds early, with a clear error instead of a confusing cascade of
// failures inside the test suite itself.

const sqlite3 = require("sqlite3");

const db = new sqlite3.Database(":memory:");

db.get("SELECT 1 AS ok", (err, row) => {
  if (err) {
    throw err;
  }

  if (!row || row.ok !== 1) {
    throw new Error("sqlite3 smoke query failed");
  }

  db.close((closeErr) => {
    if (closeErr) {
      throw closeErr;
    }
    console.log("sqlite3 native binding OK");
  });
});
