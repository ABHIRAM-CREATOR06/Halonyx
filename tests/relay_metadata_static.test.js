const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const server = fs.readFileSync(path.join(root, "backend", "server.js"), "utf8");
const app = fs.readFileSync(path.join(root, "frontend", "js", "app.js"), "utf8");
const schema = fs.readFileSync(path.join(root, "backend", "db", "schema.sql"), "utf8");

test("relay routes WebSocket clients by hashed USID", () => {
  assert.match(server, /const clients = new Map\(\);\s*\/\/ hashed_usid -> WebSocket/);
  assert.match(server, /clients\.set\(userHashedUsid,\s*ws\)/);
  assert.match(server, /const recipientWs = clients\.get\(to\)/);
});

test("relay logs sender and recipient hash prefixes for message metadata", () => {
  assert.match(server, /\[WS\] Message:/);
  assert.match(server, /userHashedUsid\.substring\(0,\s*8\)/);
  assert.match(server, /to \? to\.substring\(0,\s*8\)/);
});

test("offline mailbox stores sender, recipient, encrypted content, and timestamp", () => {
  assert.match(schema, /recipient_hashed_usid TEXT NOT NULL/);
  assert.match(schema, /sender_hashed_usid\s+TEXT NOT NULL/);
  assert.match(schema, /content\s+TEXT NOT NULL/);
  assert.match(schema, /timestamp\s+DATETIME DEFAULT CURRENT_TIMESTAMP/);
  assert.match(server, /INSERT INTO mailbox \(recipient_hashed_usid, sender_hashed_usid, content\)/);
});

test("offline mailbox rejects plaintext queueing", () => {
  assert.match(server, /Only encrypted messages are queued/);
  assert.match(server, /if \(!encrypted\)/);
});

test("frontend still has plaintext fallback paths that must stay visible to tests", () => {
  assert.match(app, /falling back to plaintext/);
  assert.match(app, /payload = \{ type: "message", to: currentChatUsid, content \}/);
});

test("file magnet URI path currently sends content through the relay", () => {
  assert.match(app, /content: torrent\.magnetURI/);
});
