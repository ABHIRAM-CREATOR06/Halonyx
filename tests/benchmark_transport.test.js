const test = require('node:test');
const assert = require('node:assert/strict');
const { measureBenchmark } = require('../scripts/benchmark/engine');
const { runWebSocket, runPipeline } = require('../scripts/benchmark/suites');

const fast = (definition) => measureBenchmark(definition, { runs: 1, warmup: 0, iterations: 2 });

test('loopback WebSocket benchmarks wait for recipient acknowledgements', async () => {
  const results = await runWebSocket(fast);
  assert.equal(results.length, 6);
  assert.ok(results.every((result) => result.successfulOperations === 2 && result.failedOperations === 0));
  assert.ok(results.every((result) => result.parameters.completion.includes('acknowledged')));
});

test('pipeline completion occurs after ratchet decrypt and envelope validation', async () => {
  const [result] = await runPipeline(fast);
  assert.equal(result.successfulOperations, 2);
  assert.equal(result.failedOperations, 0);
  assert.equal(result.parameters.browserPaintingIncluded, false);
});
