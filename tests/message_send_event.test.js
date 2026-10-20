const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('send click does not pass its PointerEvent as message text', () => {
  const app = fs.readFileSync(require.resolve('../frontend/js/app.js'), 'utf8');
  assert.match(app, /getElementById\("send-btn"\)\.addEventListener\("click",\s*\(\)\s*=>\s*sendMessage\(\)\)/);
  assert.equal((app.match(/typeof forceContent === "string"/g) || []).length, 2);
});
