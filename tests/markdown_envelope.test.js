const test = require('node:test');
const assert = require('node:assert/strict');
const Envelope = require('../protocol/envelope');

test('md fmt round trips inside envelope; relay payload has no fmt', () => {
  const env = Envelope.createEnvelope('**hello**', null, null, 'md');
  assert.equal(Envelope.parseAndValidateEnvelope(JSON.stringify(env)).fmt, 'md');
  const relay = { type: 'message', to: 'peer', encrypted: 'ciphertext' };
  assert.equal(Object.hasOwn(relay, 'fmt'), false);
});

test('no fmt remains plain text', () => {
  const env = Envelope.parseAndValidateEnvelope(Envelope.createEnvelope('plain'));
  assert.equal(env.fmt, undefined);
  assert.equal(env.body, 'plain');
});
