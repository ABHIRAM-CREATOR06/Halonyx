const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildUsidEmailContent,
  buildMailtoUrl,
  buildWebmailUrls,
} = require("../protocol/email_utils");

test("buildUsidEmailContent formats subject and body with USID and sender name", () => {
  const usid = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
  const content = buildUsidEmailContent(usid, "Alice");

  assert.equal(content.subject, "Halonyx USID Identity Code from Alice");
  assert.ok(content.body.includes(usid));
  assert.ok(content.body.includes("Add Contact"));
});

test("buildUsidEmailContent handles missing sender name gracefully", () => {
  const usid = "0xabcdef";
  const content = buildUsidEmailContent(usid);

  assert.equal(content.subject, "Halonyx USID Identity Code");
  assert.ok(content.body.includes(usid));
});

test("buildMailtoUrl generates valid mailto URI with encoded recipient and parameters", () => {
  const usid = "0xabcdef";
  const recipient = "bob@example.com";
  const mailto = buildMailtoUrl(usid, recipient, "Alice");

  assert.ok(mailto.startsWith("mailto:bob%40example.com?subject="));
  assert.ok(mailto.includes(encodeURIComponent(usid)));
});

test("buildWebmailUrls creates valid compose URLs for Gmail, Outlook, and Yahoo", () => {
  const usid = "0x9876543210";
  const recipient = "charlie@example.com";
  const urls = buildWebmailUrls(usid, recipient, "Alice");

  assert.ok(urls.gmail.startsWith("https://mail.google.com/mail/?view=cm&fs=1&to=charlie%40example.com"));
  assert.ok(urls.outlook.startsWith("https://outlook.office.com/mail/deeplink/compose?to=charlie%40example.com"));
  assert.ok(urls.yahoo.startsWith("https://compose.mail.yahoo.com/?to=charlie%40example.com"));
  assert.ok(urls.gmail.includes(encodeURIComponent(usid)));
  assert.ok(urls.outlook.includes(encodeURIComponent(usid)));
  assert.ok(urls.yahoo.includes(encodeURIComponent(usid)));
});
