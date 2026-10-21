const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../frontend/js/reactions.js');
const id = 'a'.repeat(32);
test('reaction reducer add, replace, remove and duplicate delivery', () => {
  let s = R.addMessage({}, id, 100);
  s = R.applyReaction(s, { type: 'reaction', target: id, emoji: '❤️', ts: 1 }, 'alice', 101);
  assert.equal(s.reactions[id].alice.emoji, '❤️');
  s = R.applyReaction(s, { type: 'reaction', target: id, emoji: '👍', ts: 2 }, 'alice', 102);
  assert.equal(s.reactions[id].alice.emoji, '👍');
  const dup = R.applyReaction(s, { type: 'reaction', target: id, emoji: '👍', ts: 2 }, 'alice', 103);
  assert.deepEqual(dup.reactions, s.reactions);
  s = R.applyReaction(s, { type: 'reaction', target: id, emoji: null, ts: 3 }, 'alice', 104);
  assert.equal(s.reactions[id].alice, undefined);
});
test('pending reaction applies after target; unknown target and malformed events are bounded/ignored', () => {
  const e = { type: 'reaction', target: id, emoji: '❤️' };
  let s = R.applyReaction({}, e, 'alice', 100);
  assert.equal(s.pending.length, 1);
  s = R.addMessage(s, id, 101);
  assert.equal(s.reactions[id].alice.emoji, '❤️');
  assert.equal(R.applyReaction(s, { ...e, emoji: '💣' }, 'alice').reactions[id].alice.emoji, '❤️');
  assert.equal(R.applyReaction({}, { ...e, target: 'x'.repeat(400) }, 'alice').pending.length, 0);
  assert.equal(R.applyReaction({}, { ...e, senderId: 'attacker' }, 'alice').pending.length, 0);
  assert.equal(R.applyReaction({}, { ...e, extra: 'x'.repeat(300) }, 'alice').pending.length, 0);
});
