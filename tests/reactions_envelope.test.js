const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../protocol/envelope.js');
test('reaction envelope round trip and relay payload contains ciphertext only', () => {
  const e = E.createReactionEnvelope('a'.repeat(32), '❤️');
  assert.deepEqual(E.parseAndValidateEnvelope(JSON.stringify(e)), e);
  const relay = { type: 'message', to: 'peer', encrypted: 'ciphertext' };
  assert.equal(JSON.stringify(relay).includes('reaction'), false);
  assert.equal(JSON.stringify(relay).includes('❤️'), false);
});
test('legacy message without id parses and unknown envelope type is ignored', () => {
  assert.ok(E.parseAndValidateEnvelope({ v: 1, ts: new Date().toISOString(), body: 'legacy' }));
  assert.equal(E.parseAndValidateEnvelope({ v: 1, type: 'future', body: 'ignored' }), null);
});
