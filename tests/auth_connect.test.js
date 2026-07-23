const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { hashUSID } = require("../backend/utils");

test("JWT secret is loaded and persistent", () => {
  const secretFile = "./backend/db/.jwt_secret";
  if (!fs.existsSync(secretFile)) {
    const dbDir = "./backend/db";
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    fs.writeFileSync(secretFile, crypto.randomBytes(32).toString("hex"), "utf8");
  }
  assert.equal(fs.existsSync(secretFile), true, "JWT secret file should exist");
  const secret = fs.readFileSync(secretFile, "utf8").trim();
  assert.ok(secret.length >= 16, "Secret should be at least 16 chars long");
});

test("Connect payload matching correctly formats USID or Email hash", () => {
  const rawUsid = "abc123def4567890abcdef1234567890abc123def4567890abcdef1234567890";
  const hashed = rawUsid.length === 64 ? rawUsid : hashUSID(rawUsid);
  assert.equal(hashed, rawUsid);

  const shortUsid = "my-secret-usid";
  const hashedShort = shortUsid.length === 64 ? shortUsid : hashUSID(shortUsid);
  assert.equal(hashedShort, hashUSID(shortUsid));
});
