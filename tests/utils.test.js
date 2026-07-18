const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const { generateUSID, hashUSID } = require("../backend/utils");

test("generateUSID returns a 256-bit hex identifier", () => {
  const usid = generateUSID();

  assert.match(usid, /^[0-9a-f]{64}$/);
});

test("generateUSID produces unique values across many calls", () => {
  const values = new Set(Array.from({ length: 128 }, () => generateUSID()));

  assert.equal(values.size, 128);
});

test("hashUSID returns deterministic SHA-256 hex", () => {
  const usid = "0123456789abcdef";
  const expected = crypto.createHash("sha256").update(usid).digest("hex");

  assert.equal(hashUSID(usid), expected);
  assert.match(hashUSID(usid), /^[0-9a-f]{64}$/);
});
