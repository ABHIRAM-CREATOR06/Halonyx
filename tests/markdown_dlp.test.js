const test = require('node:test');
const assert = require('node:assert/strict');
const DLP = require('../frontend/js/dlp');

test('DLP scans secrets in markdown fences, inline code and link URLs', () => {
  const cases = [
    '```\nAKIA1234567890ABCDEF\n```',
    String.fromCharCode(96) + 'AKIA1234567890ABCDEF' + String.fromCharCode(96),
    '[docs](https://example.test/?token=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij)'
  ];
  for (const markdown of cases) assert.equal(DLP.scan(markdown).hasViolation, true, markdown);
});
