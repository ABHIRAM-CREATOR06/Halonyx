const test = require('node:test');
const assert = require('node:assert/strict');
const { summarize, percentile, measureBenchmark, parseArgs, compareResults, regressionSummary, formatMarkdown } = require('../scripts/benchmark/engine');

test('nearest-rank percentiles are correct and samples are not mutated', () => {
  const values = [100, 1, 3, 2];
  assert.equal(percentile([1, 2, 3, 100], .95), 100);
  const result = summarize(values);
  assert.deepEqual(values, [100, 1, 3, 2]);
  assert.equal(result.meanMs, 26.5);
  assert.equal(result.medianMs, 2.5);
  assert.equal(result.p50Ms, 2);
  assert.equal(result.p90Ms, 100);
  assert.equal(result.p95Ms, 100);
  assert.equal(result.p99Ms, 100);
});

test('empty, single, and failed samples have explicit statistics', () => {
  assert.equal(summarize([]).meanMs, null);
  assert.equal(summarize([4]).standardDeviationMs, 0);
  assert.equal(summarize([4], 2).failedOperations, 2);
  assert.throws(() => summarize([NaN]), /finite/);
});

test('runner measures async functions, records failures, rounds, warmups, and throughput', async () => {
  let calls = 0;
  const r = await measureBenchmark({ id: 'async', fn: async () => { calls++; if (calls === 4) throw new Error('failure'); await Promise.resolve(); } }, { runs: 2, warmup: 1, iterations: 3 });
  assert.equal(r.roundsCompleted, 2);
  assert.equal(r.warmupIterationsPerRound, 1);
  assert.equal(r.attemptedOperations, 6);
  assert.equal(r.successfulOperations, 5);
  assert.equal(r.failedOperations, 1);
  assert.equal(r.sampleCount, 5);
  assert.ok(r.totalElapsedMs >= 0);
  assert.ok(r.throughputOpsPerSecond > 0);
});

test('runner batches fast calls and labels batch averages', async () => {
  let n = 0;
  const r = await measureBenchmark({ id: 'batch', batchSize: 4, fn: () => { n++; } }, { runs: 2, warmup: 0, iterations: 8 });
  assert.equal(n, 16);
  assert.equal(r.sampleCount, 4);
  assert.equal(r.successfulOperations, 16);
  assert.match(r.sampleUnit, /average/);
});

test('CLI validates suite and incompatible option combinations', () => {
  assert.equal(parseArgs([]).format, 'markdown');
  assert.deepEqual(parseArgs(['--suite', 'cold-start']).suites, ['cold-start']);
  assert.throws(() => parseArgs(['--suite', 'crypto,cold-start']), /must be run by itself/);
  assert.equal(parseArgs(['--suite', 'sqlite', '--rows', '0']).rows, 0);
  assert.throws(() => parseArgs(['--iterations', '0']), /positive integer/);
  assert.throws(() => parseArgs(['--suite', 'unknown']), /--suite/);
  assert.throws(() => parseArgs(['--threshold', '5']), /requires --compare/);
  assert.throws(() => parseArgs(['--reset', '--cleanup']), /cannot be used together/);
});

test('Markdown output contains grouped benchmark tables compatible with benchmark.md', () => {
  const output = formatMarkdown({ configuration: { runs: 1, warmup: 0, iterations: 1 }, metadata: { nodeVersion: 'v22', platform: 'win32', architecture: 'x64', cpuModel: 'Test CPU', logicalCpuCount: 4, sqliteVersion: null, git: { commit: 'abc', workingTreeClean: true } }, results: [{ suite: 'crypto', id: 'crypto.keygen', parameters: {}, meanMs: 0.1, medianMs: 0.1, p50Ms: 0.1, p90Ms: 0.1, p95Ms: 0.1, p99Ms: 0.1, minMs: 0.1, maxMs: 0.1, roundMeanMinMs: 0.1, roundMeanMaxMs: 0.1, standardDeviationMs: 0, coefficientOfVariationPercent: 0, throughputOpsPerSecond: 10000, sampleCount: 1, sampleUnit: 'operation', successfulOperations: 1, attemptedOperations: 1, failedOperations: 0, warmupFailedOperations: 0, excludedSamples: 0, roundsCompleted: 1, configuredRuns: 1, totalElapsedMs: 0.1 }] });
  assert.match(output, /^# Halonyx Benchmark Results/m);
  assert.match(output, /\| Benchmark \/ parameters \| Mean \| Median \|/);
  assert.match(output, /\| crypto\.keygen · — \|/);
});

test('comparison aligns by stable benchmark key and regression fails only with sufficient comparable data', () => {
  const row = { suite: 'crypto', id: 'x', parameters: {}, meanMs: 12, p95Ms: 15, throughputOpsPerSecond: 80, sampleCount: 100, roundsCompleted: 5, standardDeviationMs: .2 };
  const base = { metadata: { platform: 'linux', osRelease: '1', architecture: 'x64', nodeVersion: 'v22', sqliteVersion: '3' }, configuration: { runs: 5, warmup: 10, iterations: 20 }, results: [{ ...row, meanMs: 10, p95Ms: 12, throughputOpsPerSecond: 100 }] };
  const current = { metadata: { ...base.metadata }, configuration: { ...base.configuration }, results: [row] };
  const compared = compareResults(current, base);
  assert.equal(compared.comparisons[0].meanMs.percentChange, 20);
  assert.equal(regressionSummary(current, base, compared, 5).failed, true);
  current.metadata.nodeVersion = 'v23';
  const mismatch = compareResults(current, base);
  assert.ok(mismatch.environmentWarnings.some((warning) => warning.includes('Node.js')));
  assert.equal(regressionSummary(current, base, mismatch, 0).regressions.length, 0);
});
