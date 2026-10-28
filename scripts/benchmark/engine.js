'use strict';

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');

const SUITES = ['crypto', 'envelope', 'dlp', 'group', 'sqlite', 'websocket', 'pipeline', 'cold-start'];
const DEFAULT_SUITES = SUITES.filter((suite) => suite !== 'cold-start');
const POSITIVE = new Set(['runs', 'iterations']);
const VALUE_OPTIONS = new Set(['runs', 'warmup', 'iterations', 'suite', 'format', 'output', 'compare', 'save-baseline', 'threshold', 'db', 'rows']);
const FLAGS = new Set(['help', 'reset', 'cleanup', 'gc']);

function parseArgs(argv) {
  const result = { runs: 5, warmup: 20, iterations: 100, suite: 'all', format: 'markdown', rows: 1000, reset: false, cleanup: false, gc: false };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const [name, inline] = token.slice(2).split('=', 2);
    if (FLAGS.has(name)) {
      if (inline !== undefined) throw new Error(`--${name} does not take a value`);
      result[name] = true;
      continue;
    }
    if (!VALUE_OPTIONS.has(name)) throw new Error(`Unknown option: --${name}`);
    const value = inline === undefined ? argv[++i] : inline;
    if (value === undefined || value.startsWith('--')) throw new Error(`--${name} requires a value`);
    if (['runs', 'warmup', 'iterations', 'rows', 'threshold'].includes(name)) {
      const number = Number(value);
      if (!Number.isSafeInteger(number) || number < (POSITIVE.has(name) ? 1 : 0) || (name === 'threshold' && number > 10000)) {
        throw new Error(`--${name} must be ${name === 'threshold' || name === 'warmup' ? 'a non-negative' : 'a positive'} integer${name === 'threshold' ? ' up to 10000' : ''}`);
      }
      result[name] = number;
    } else result[name] = value;
  }
  if (result.help) return result;
  if (!['markdown', 'human', 'json', 'csv'].includes(result.format)) throw new Error('--format must be markdown, human, json, or csv');
  if (result.suite !== 'all') {
    result.suites = result.suite.split(',').map((value) => value.trim()).filter(Boolean);
    const unknown = result.suites.filter((suite) => !SUITES.includes(suite));
    if (!result.suites.length || unknown.length) throw new Error(`--suite must be all or a comma-separated list of: ${SUITES.join(', ')}`);
    result.suites = [...new Set(result.suites)];
  } else result.suites = DEFAULT_SUITES.slice();
  if (result.suites.includes('cold-start') && result.suites.length !== 1) throw new Error('cold-start must be run by itself; use --suite cold-start');
  if (result.reset && !result.suites.includes('sqlite')) throw new Error('--reset requires the sqlite suite');
  if (result.reset && result.cleanup) throw new Error('--reset and --cleanup cannot be used together');
  if (result.cleanup && (result.suite !== 'all' || result.compare || result['save-baseline'])) throw new Error('--cleanup cannot be combined with suites, comparisons, or baselines');
  if (result.threshold !== undefined && !result.compare) throw new Error('--threshold requires --compare');
  if (result.gc && typeof global.gc !== 'function') throw new Error('--gc requires Node.js launched with --expose-gc');
  return result;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

function summarize(samples, failed = 0) {
  if (!Array.isArray(samples)) throw new TypeError('samples must be an array');
  if (!Number.isSafeInteger(failed) || failed < 0) throw new TypeError('failed must be a non-negative integer');
  if (samples.some((value) => !Number.isFinite(value) || value < 0)) throw new TypeError('samples must contain finite, non-negative numbers');
  const sorted = samples.slice().sort((a, b) => a - b);
  const n = sorted.length;
  if (!n) return { sampleCount: 0, meanMs: null, medianMs: null, p50Ms: null, p90Ms: null, p95Ms: null, p99Ms: null, minMs: null, maxMs: null, standardDeviationMs: null, coefficientOfVariationPercent: null, throughputOpsPerSecond: null, failedOperations: failed };
  const mean = sorted.reduce((sum, value) => sum + value, 0) / n;
  const variance = n > 1 ? sorted.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (n - 1) : 0;
  const sd = Math.sqrt(variance);
  return {
    sampleCount: n, meanMs: mean, medianMs: n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2,
    p50Ms: percentile(sorted, .50), p90Ms: percentile(sorted, .90), p95Ms: percentile(sorted, .95), p99Ms: percentile(sorted, .99),
    minMs: sorted[0], maxMs: sorted[n - 1], standardDeviationMs: sd,
    coefficientOfVariationPercent: mean ? (sd / mean) * 100 : null,
    throughputOpsPerSecond: mean ? 1000 / mean : null, failedOperations: failed,
  };
}

async function measureBenchmark(definition, options = {}) {
  const { id, name = id, suite = 'custom', fn, prepare, after } = definition;
  if (!id || typeof id !== 'string' || typeof fn !== 'function') throw new TypeError('benchmark requires an id and fn');
  const runs = options.runs ?? 5;
  const warmup = options.warmup ?? 20;
  const iterations = options.iterations ?? 100;
  const batchSize = definition.batchSize || 1;
  if (![runs, iterations, batchSize].every((n) => Number.isSafeInteger(n) && n > 0) || !Number.isSafeInteger(warmup) || warmup < 0) throw new RangeError('Invalid benchmark run configuration');

  const allSamples = [];
  const roundSummaries = [];
  let failed = 0;
  let warmupFailed = 0;
  let cleanupFailures = 0;
  let attempted = 0;
  let successful = 0;
  let totalElapsedMs = 0;
  let excludedSamples = 0;
  const errorTypes = {};
  const recordFailure = (error, warm) => {
    if (warm) warmupFailed++;
    else failed++;
    const label = error && typeof error.name === 'string' ? error.name.slice(0, 80) : 'Error';
    errorTypes[label] = (errorTypes[label] || 0) + 1;
  };
  const recordCleanupFailure = (error) => { cleanupFailures++; const label = error && typeof error.name === 'string' ? error.name.slice(0, 80) : 'Error'; errorTypes[`cleanup:${label}`] = (errorTypes[`cleanup:${label}`] || 0) + 1; };
  const cancelled = () => options.signal?.aborted === true;

  for (let round = 0; round < runs; round++) {
    if (options.gc && typeof global.gc === 'function') global.gc();
    for (let i = 0; i < warmup && !cancelled(); i++) {
      let input;
      try { input = prepare ? await prepare({ round, iteration: i, warmup: true }) : undefined; await fn(input, { round, iteration: i, warmup: true }); }
      catch (error) { recordFailure(error, true); }
      finally { if (after) { try { await after(input, { round, iteration: i, warmup: true }); } catch (error) { recordCleanupFailure(error); } } }
    }
    const roundSamples = [];
    let roundSuccess = 0;
    let roundFailed = 0;
    let measuredElapsedMs = 0;
    for (let i = 0; i < iterations && !cancelled();) {
      const count = Math.min(batchSize, iterations - i);
      if (batchSize === 1) {
        let input;
        let output;
        try { input = prepare ? await prepare({ round, iteration: i, warmup: false }) : undefined; }
        catch (error) { recordFailure(error, false); attempted++; roundFailed++; i++; continue; }
        attempted++;
        const start = performance.now();
        try {
          output = await fn(input, { round, iteration: i, warmup: false });
          const elapsed = performance.now() - start;
          roundSamples.push(elapsed); allSamples.push(elapsed); measuredElapsedMs += elapsed; roundSuccess++; successful++;
        } catch (error) {
          measuredElapsedMs += performance.now() - start; recordFailure(error, false); roundFailed++;
        }
        if (after) { try { await after(input, { round, iteration: i, warmup: false, output }); } catch (error) { recordCleanupFailure(error); } }
        i++;
        continue;
      }
      const inputs = [];
      let setupFailed = false;
      for (let j = 0; j < count; j++) {
        try { inputs.push(prepare ? await prepare({ round, iteration: i + j, warmup: false }) : undefined); }
        catch (error) { recordFailure(error, false); attempted++; roundFailed++; setupFailed = true; }
      }
      attempted += count - (setupFailed ? count - inputs.length : 0);
      const start = performance.now();
      let batchFailed = setupFailed;
      let batchSuccessful = 0;
      for (let j = 0; j < inputs.length; j++) {
        try { const output = await fn(inputs[j], { round, iteration: i + j, warmup: false }); batchSuccessful++; if (after) await after(inputs[j], { round, iteration: i + j, warmup: false, output }); }
        catch (error) { recordFailure(error, false); roundFailed++; batchFailed = true; }
      }
      const elapsed = performance.now() - start;
      measuredElapsedMs += elapsed;
      roundSuccess += batchSuccessful; successful += batchSuccessful;
      if (!batchFailed && batchSuccessful === count) { const average = elapsed / count; roundSamples.push(average); allSamples.push(average); }
      else excludedSamples++;
      i += count;
    }
    totalElapsedMs += measuredElapsedMs;
    const stats = summarize(roundSamples, roundFailed);
    roundSummaries.push({ round: round + 1, ...stats, attemptedOperations: Math.min(iterations, roundSuccess + roundFailed), successfulOperations: roundSuccess, elapsedMs: measuredElapsedMs, throughputOpsPerSecond: measuredElapsedMs > 0 ? roundSuccess / (measuredElapsedMs / 1000) : null });
    if (cancelled()) break;
  }
  const summary = summarize(allSamples, failed);
  return {
    id, name, suite, parameters: definition.parameters || {}, sampleUnit: batchSize > 1 ? `average of ${batchSize} operations` : 'operation',
    ...summary,
    warmupIterationsPerRound: warmup, configuredIterationsPerRound: iterations, configuredRuns: runs, roundsCompleted: roundSummaries.length,
    attemptedOperations: attempted, successfulOperations: successful, failedOperations: failed, warmupFailedOperations: warmupFailed, cleanupFailures,
    failedByErrorName: errorTypes, excludedSamples, totalElapsedMs, throughputOpsPerSecond: totalElapsedMs > 0 ? successful / (totalElapsedMs / 1000) : null,
    roundMeanMinMs: roundSummaries.some((r) => r.meanMs != null) ? Math.min(...roundSummaries.filter((r) => r.meanMs != null).map((r) => r.meanMs)) : null,
    roundMeanMaxMs: roundSummaries.some((r) => r.meanMs != null) ? Math.max(...roundSummaries.filter((r) => r.meanMs != null).map((r) => r.meanMs)) : null,
    rounds: roundSummaries, samplesMs: allSamples,
    cancelled: cancelled(),
  };
}

function gitInfo(root) {
  const run = (args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
    return result.status === 0 ? result.stdout.trim() : null;
  };
  const commit = run(['rev-parse', 'HEAD']);
  const status = run(['status', '--porcelain']);
  return { commit, workingTreeClean: status === null ? null : status.length === 0 };
}

function collectMetadata(root, startedAt, memoryBefore) {
  const cpu = os.cpus()[0];
  return {
    startedAt, endedAt: new Date().toISOString(),
    cpuModel: cpu?.model || null, logicalCpuCount: os.cpus().length || null, platform: process.platform, osRelease: os.release(),
    architecture: os.arch(), nodeVersion: process.version, executableArchitecture: process.arch,
    v8Version: process.versions.v8 || null, opensslVersion: process.versions.openssl || null,
    sqliteVersion: null, totalMemoryBytes: os.totalmem(),
    processMemoryBefore: memoryBefore, processMemoryAfter: process.memoryUsage(), nodeHeapLimitBytes: require('node:v8').getHeapStatistics().heap_size_limit,
    git: gitInfo(root), optionalHardware: { cpuFrequencyHz: null, thermalStatus: null, powerStatus: null, reason: 'Not available through portable Node.js APIs' },
    environment: Object.fromEntries(['NODE_ENV', 'TZ', 'UV_THREADPOOL_SIZE'].filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]])),
  };
}

function stableKey(result) { return `${result.suite}/${result.id}/${JSON.stringify(result.parameters || {})}`; }
function compareResults(current, baseline) {
  if (!current || !baseline || !Array.isArray(current.results) || !Array.isArray(baseline.results)) throw new Error('Both result files must contain a results array');
  const base = new Map(baseline.results.map((item) => [stableKey(item), item]));
  const envPairs = [['Node.js', current.metadata.nodeVersion, baseline.metadata.nodeVersion], ['OS', `${current.metadata.platform}/${current.metadata.osRelease}`, `${baseline.metadata.platform}/${baseline.metadata.osRelease}`], ['architecture', current.metadata.architecture, baseline.metadata.architecture], ['SQLite', current.metadata.sqliteVersion, baseline.metadata.sqliteVersion]];
  const environmentWarnings = envPairs.filter(([, a, b]) => a != null && b != null && a !== b).map(([label, a, b]) => `${label} differs (${a} vs ${b})`);
  if (current.configuration?.runs !== baseline.configuration?.runs) environmentWarnings.push('independent run counts differ');
  if (current.configuration?.warmup !== baseline.configuration?.warmup) environmentWarnings.push('warm-up counts differ');
  if (current.configuration?.iterations !== baseline.configuration?.iterations) environmentWarnings.push('iteration counts differ');
  if (current.configuration?.rows !== baseline.configuration?.rows) environmentWarnings.push('synthetic SQLite fixture row counts differ');
  if (JSON.stringify(current.database?.pragmas || null) !== JSON.stringify(baseline.database?.pragmas || null)) environmentWarnings.push('database configuration differs');
  const comparisons = current.results.map((now) => {
    const before = base.get(stableKey(now));
    if (!before) return { key: stableKey(now), status: 'missing-baseline' };
    const envCompatible = current.metadata.platform === baseline.metadata.platform && current.metadata.architecture === baseline.metadata.architecture && current.metadata.nodeVersion === baseline.metadata.nodeVersion && current.metadata.sqliteVersion === baseline.metadata.sqliteVersion;
    const compareMetric = (a, b) => ({ absoluteDifference: a == null || b == null ? null : a - b, percentChange: !b || a == null ? null : ((a - b) / b) * 100, ratio: !a || !b ? null : b / a });
    return { key: stableKey(now), status: 'compared', environmentCompatible: envCompatible, meanMs: compareMetric(now.meanMs, before.meanMs), p95Ms: compareMetric(now.p95Ms, before.p95Ms), throughputOpsPerSecond: compareMetric(now.throughputOpsPerSecond, before.throughputOpsPerSecond), currentSamples: now.sampleCount, baselineSamples: before.sampleCount, currentRuns: now.roundsCompleted, baselineRuns: before.roundsCompleted };
  });
  return { environmentWarnings, comparisons };
}

function regressionSummary(current, baseline, comparison, thresholdPercent) {
  const baselineMap = new Map(baseline.results.map((r) => [stableKey(r), r]));
  const regressions = [];
  const skipped = [];
  for (const now of current.results) {
    const before = baselineMap.get(stableKey(now));
    if (!before) continue;
    if (!comparison.environmentWarnings.every((w) => !/Node.js|OS|architecture|SQLite/.test(w))) { skipped.push({ key: stableKey(now), reason: 'incompatible runtime, OS, architecture, or SQLite version' }); continue; }
    if (now.sampleCount < 20 || before.sampleCount < 20 || now.roundsCompleted < 3 || before.roundsCompleted < 3 || now.meanMs == null || before.meanMs == null) { skipped.push({ key: stableKey(now), reason: 'insufficient samples or independent runs' }); continue; }
    const variance = (r) => r.sampleCount > 1 ? (r.standardDeviationMs ** 2) / r.sampleCount : Infinity;
    const se = Math.sqrt(variance(now) + variance(before));
    const lowerPercent = ((now.meanMs - before.meanMs - 1.96 * se) / before.meanMs) * 100;
    if (lowerPercent > thresholdPercent) regressions.push({ key: stableKey(now), estimatedIncreasePercent: ((now.meanMs - before.meanMs) / before.meanMs) * 100, confidenceLowerBoundPercent: lowerPercent, thresholdPercent });
  }
  return { thresholdPercent, regressions, skipped, failed: regressions.length > 0 };
}

function formatHelp() {
  return `Halonyx reproducible benchmark suite\n\nUsage: npm run benchmark -- [options]\n\nOptions:\n  --help                      Show this help\n  --suite <all|list>          crypto,envelope,dlp,group,sqlite,websocket,pipeline,cold-start\n  --runs <n>                  Independent rounds (default 5)\n  --warmup <n>                Warm-ups per benchmark per round (default 20)\n  --iterations <n>            Measured iterations per round (default 100)\n  --format <markdown|human|json|csv> Output format (default markdown)\n  --output <file>             Write formatted results to a file\n  --compare <file>            Compare results with a saved JSON baseline\n  --save-baseline <file>      Save this run as a JSON baseline\n  --threshold <percent>       Fail if a significant regression exceeds this (requires --compare)\n  --db <file>                 Dedicated benchmark app.db path\n  --rows <n>                  Deterministic synthetic rows (default 1000; 0 allowed)\n  --reset                     Reset only a previously marked benchmark database\n  --cleanup                   Delete only marked benchmark database files and exit\n  --gc                        GC between rounds (requires node --expose-gc)\n\nThe cold-start suite runs one operation in each of several fresh Node.js child processes; OS caches are not cleared.\n\nPercentiles use nearest-rank: sorted[ceil(p*n)-1]. Pooled percentiles use successful measured observations; failures and excluded samples are reported separately.`;
}

function toCsv(results) {
  const header = ['suite', 'id', 'parameters', 'sample_unit', 'warmup_per_round', 'mean_ms', 'median_ms', 'p50_ms', 'p90_ms', 'p95_ms', 'p99_ms', 'min_ms', 'max_ms', 'sd_ms', 'cv_percent', 'round_mean_min_ms', 'round_mean_max_ms', 'throughput_ops_s', 'sample_count', 'successful_ops', 'attempted_ops', 'failed_ops', 'warmup_failures', 'excluded_samples', 'rounds', 'elapsed_ms'];
  const quote = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [header.join(','), ...results.map((r) => [r.suite, r.id, JSON.stringify(r.parameters), r.sampleUnit, r.warmupIterationsPerRound, r.meanMs, r.medianMs, r.p50Ms, r.p90Ms, r.p95Ms, r.p99Ms, r.minMs, r.maxMs, r.standardDeviationMs, r.coefficientOfVariationPercent, r.roundMeanMinMs, r.roundMeanMaxMs, r.throughputOpsPerSecond, r.sampleCount, r.successfulOperations, r.attemptedOperations, r.failedOperations, r.warmupFailedOperations, r.excludedSamples, r.roundsCompleted, r.totalElapsedMs].map(quote).join(','))].join('\n') + '\n';
}

function formatDuration(value) { return value == null ? 'n/a' : value < 1 ? `${(value * 1000).toFixed(2)} µs` : `${value.toFixed(3)} ms`; }
function formatHuman(result) {
  const lines = [];
  for (const r of result.results) {
    lines.push(`${r.suite}/${r.id} · ${JSON.stringify(r.parameters)}`);
    lines.push(`  mean ${formatDuration(r.meanMs)} · median ${formatDuration(r.medianMs)} · P50 ${formatDuration(r.p50Ms)} · P90 ${formatDuration(r.p90Ms)} · P95 ${formatDuration(r.p95Ms)} · P99 ${formatDuration(r.p99Ms)}`);
    lines.push(`  min/max ${formatDuration(r.minMs)} / ${formatDuration(r.maxMs)} · round mean range ${formatDuration(r.roundMeanMinMs)} / ${formatDuration(r.roundMeanMaxMs)} · SD ${formatDuration(r.standardDeviationMs)} · CV ${r.coefficientOfVariationPercent == null ? 'n/a' : `${r.coefficientOfVariationPercent.toFixed(2)}%`}`);
    lines.push(`  throughput ${r.throughputOpsPerSecond == null ? 'n/a' : `${r.throughputOpsPerSecond.toFixed(2)} ops/s`} · samples ${r.sampleCount} (${r.sampleUnit}) · operations ${r.successfulOperations}/${r.attemptedOperations} successful · failed ${r.failedOperations} · warm-up failed ${r.warmupFailedOperations} · excluded ${r.excludedSamples} · runs ${r.roundsCompleted}/${r.configuredRuns} · timed ${formatDuration(r.totalElapsedMs)}`);
  }
  if (result.comparison) {
    lines.push('', 'Comparison warnings:');
    lines.push(...(result.comparison.environmentWarnings.length ? result.comparison.environmentWarnings.map((w) => `  - ${w}`) : ['  none']));
    for (const c of result.comparison.comparisons) lines.push(`  ${c.key}: ${c.status}${c.meanMs?.percentChange != null ? `, mean ${c.meanMs.percentChange.toFixed(1)}%, P95 ${c.p95Ms.percentChange?.toFixed(1) ?? 'n/a'}%` : ''}`);
  }
  if (result.regressionSummary) lines.push('', `Regression threshold: ${result.regressionSummary.thresholdPercent}%`, `Potential regressions: ${result.regressionSummary.regressions.length}`, `Not assessed: ${result.regressionSummary.skipped.length}`);
  lines.push('', `Environment: ${result.metadata.nodeVersion} · ${result.metadata.platform}/${result.metadata.architecture} · ${result.metadata.cpuModel || 'CPU unknown'} · ${result.metadata.logicalCpuCount} logical CPUs`);
  lines.push(`Git: ${result.metadata.git.commit || 'unavailable'} · working tree ${result.metadata.git.workingTreeClean == null ? 'unknown' : result.metadata.git.workingTreeClean ? 'clean' : 'dirty'}`);
  if (result.database) lines.push(`SQLite: ${result.metadata.sqliteVersion || 'unavailable'} · synthetic fixture rows ${result.database.syntheticRowsPerTable} · app.db ${result.database.pragmas.app.sizeBytes} bytes`);
  if (result.cancelled) lines.push('Cancelled; partial results shown.');
  return lines.join('\n');
}

function formatMarkdown(result) {
  const escape = (value) => String(value ?? '—').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const lines = ['# Halonyx Benchmark Results', '', '> Machine-specific snapshot from the reproducible benchmark runner. Treat these figures as a record of this run, not as general performance guarantees. See [benchmark-guide.md](benchmark-guide.md) for commands, suite scope, and limitations.', '', '## Run details', '', `The output records ${result.configuration.runs * result.configuration.iterations} measured operations per benchmark across ${result.configuration.runs} runs. The runner uses ${result.configuration.warmup} warm-up iterations and ${result.configuration.iterations} measured iterations per run. Batched workloads report averaged samples.`, '', '| Environment | Value |', '|---|---|', `| Node.js | ${escape(result.metadata.nodeVersion)} |`, `| Platform | ${escape(result.metadata.platform)}/${escape(result.metadata.architecture)} |`, `| CPU | ${escape(result.metadata.cpuModel || 'Unknown')} |`, `| Logical CPUs | ${escape(result.metadata.logicalCpuCount)} |`, `| SQLite | ${escape(result.metadata.sqliteVersion || 'Not measured')} |`];
  if (result.database) lines.push(`| Synthetic fixture rows | ${result.database.syntheticRowsPerTable.toLocaleString('en-US')} per table |`, `| Benchmark database size | ${result.database.pragmas.app.sizeBytes.toLocaleString('en-US')} bytes |`);
  lines.push(`| Git commit | ${escape(result.metadata.git.commit || 'Unavailable')} |`, `| Working tree at measurement | ${result.metadata.git.workingTreeClean == null ? 'Unknown' : result.metadata.git.workingTreeClean ? 'Clean' : 'Dirty'} |`, '', '## Results', '', 'Times are milliseconds or microseconds as shown. Percentiles use nearest-rank. SD/CV are sample standard deviation and coefficient of variation. Round mean range is the minimum and maximum mean across runs.', '');
  for (const suite of [...new Set(result.results.map((item) => item.suite))]) {
    const rows = result.results.filter((item) => item.suite === suite);
    lines.push(`### ${suite} (${rows.length} benchmarks)`, '', '| Benchmark / parameters | Mean | Median | P50 / P90 / P95 / P99 | Min / max | Round mean range | SD / CV | Throughput | Samples | Operations / failures | Runs / timed |', '|---|---:|---:|---|---|---|---|---:|---|---|---|');
    for (const r of rows) {
      const params = Object.entries(r.parameters || {}).map(([key, value]) => `${key}=${value}`).join(', ') || '—';
      const range = (low, high) => `${formatDuration(low)} / ${formatDuration(high)}`;
      lines.push(`| ${escape(r.id)} · ${escape(params)} | ${formatDuration(r.meanMs)} | ${formatDuration(r.medianMs)} | ${formatDuration(r.p50Ms)} / ${formatDuration(r.p90Ms)} / ${formatDuration(r.p95Ms)} / ${formatDuration(r.p99Ms)} | ${range(r.minMs, r.maxMs)} | ${range(r.roundMeanMinMs, r.roundMeanMaxMs)} | ${formatDuration(r.standardDeviationMs)} / ${r.coefficientOfVariationPercent == null ? 'n/a' : `${r.coefficientOfVariationPercent.toFixed(2)}%`} | ${r.throughputOpsPerSecond == null ? 'n/a' : `${r.throughputOpsPerSecond.toFixed(2)} ops/s`} | ${r.sampleCount} (${escape(r.sampleUnit)}) | ${r.successfulOperations}/${r.attemptedOperations} successful; ${r.failedOperations} failed, ${r.warmupFailedOperations} warm-up failures, ${r.excludedSamples} excluded | ${r.roundsCompleted}/${r.configuredRuns}; ${formatDuration(r.totalElapsedMs)} |`);
    }
    lines.push('');
  }
  lines.push('## Interpretation notes', '', '- SQLite measurements use the application schemas with deterministic synthetic data; they are not production database measurements.', '- WebSocket and pipeline cases use a single-process loopback harness and do not represent remote relay performance.');
  if (result.configuration.coldStart) lines.push('- Cold-start samples each launch a fresh Node.js process and include process startup, module loading, and one first operation. OS/filesystem caches are not cleared, so these are process-cold rather than machine-cold measurements.');
  lines.push('- Results vary with machine load, runtime version, power state, and filesystem behavior. Re-run on the target environment before comparing or setting capacity targets.', '');
  return lines.join('\n');
}

module.exports = { SUITES, parseArgs, percentile, summarize, measureBenchmark, collectMetadata, compareResults, regressionSummary, formatHelp, toCsv, formatHuman, formatMarkdown, gitInfo };
