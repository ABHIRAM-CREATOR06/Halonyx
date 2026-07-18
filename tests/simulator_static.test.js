const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "simulator", "index.html"), "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]).join("\n");

test("simulator inline JavaScript parses", () => {
  assert.doesNotThrow(() => new Function(scripts));
});

test("simulator contains the 14-step architecture from agent.md", () => {
  const stepsBlock = scripts.match(/const STEPS = \[([\s\S]*?)\];\n\n    const tile/);
  assert.ok(stepsBlock, "STEPS block should be present");

  const stepCount = (stepsBlock[1].match(/\n\s*title:/g) || []).length;
  assert.equal(stepCount, 14);
});

test("simulator exposes beginner and protocol modes plus end-to-end flow shortcut", () => {
  assert.match(html, /id="beginnerBtn"/);
  assert.match(html, /id="protocolBtn"/);
  assert.match(html, /id="endToEndFlowBtn"/);
  assert.match(html, /function showEndToEndFlow\(\)/);
  assert.match(html, /state\.step = 8/);
  assert.match(html, /state\.mode = "protocol"/);
});

test("simulator technical detail expands short forms", () => {
  for (const token of ["X3DH", "OPK", "Double Ratchet", "AES-256-GCM", "USID", "WebRTC"]) {
    assert.match(html, new RegExp(token.replace("-", "\\-")));
  }
  assert.match(html, /Short forms expanded:/);
});
