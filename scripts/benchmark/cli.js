#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');
const engine = require('./engine');
const sqlite = require('./sqlite');

globalThis.crypto ||= webcrypto;
globalThis.btoa ||= ((value) => Buffer.from(value, 'binary').toString('base64'));
globalThis.atob ||= ((value) => Buffer.from(value, 'base64').toString('binary'));

const root = path.join(__dirname, '..', '..');
const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
process.once('SIGTERM', () => controller.abort());

function writeFile(file, content) {
  const target = path.resolve(file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

async function main(argv = process.argv.slice(2)) {
  const options = engine.parseArgs(argv);
  if (options.help) { process.stdout.write(engine.formatHelp() + '\n'); return 0; }
  const dbPath = options.db || sqlite.DEFAULT_DB;
  if (options.cleanup) {
    const removed = await sqlite.cleanupDatabase(dbPath);
    process.stdout.write(removed.length ? `Removed marked benchmark database files:\n${removed.join('\n')}\n` : 'No marked benchmark database files found.\n');
    return 0;
  }

  const startedAt = new Date().toISOString();
  const memoryBefore = process.memoryUsage();
  const coldStart = options.suites.includes('cold-start');
  const config = { suites: options.suites, runs: options.runs, warmup: coldStart ? 0 : options.warmup, iterations: coldStart ? 1 : options.iterations, coldStart, rows: options.rows, gcBetweenRounds: options.gc, dbPath: options.suites.includes('sqlite') ? path.resolve(dbPath) : null };
  let database;
  try {
    if (options.suites.includes('sqlite')) database = await sqlite.initializeDatabase(dbPath, options.rows, options.reset);
    const metadata = engine.collectMetadata(root, startedAt, memoryBefore);
    if (database) metadata.sqliteVersion = database.pragmas.sqliteVersion;
    const runOne = (definition) => engine.measureBenchmark(definition, { runs: options.runs, warmup: coldStart ? 0 : options.warmup, iterations: coldStart ? 1 : options.iterations, gc: options.gc, signal: controller.signal });
    const { runSuite } = require('./suites');
    const results = [];
    for (const suite of options.suites) {
      if (controller.signal.aborted) break;
      results.push(...await runSuite(suite, runOne, options, database));
    }
    metadata.endedAt = new Date().toISOString();
    metadata.processMemoryAfter = process.memoryUsage();
    const databaseSummary = database ? { appDatabasePath: database.paths.app, companionDatabasePaths: { identity: database.paths.identity, keys: database.paths.keys }, syntheticRowsPerTable: database.rows, pragmas: database.pragmas } : null;
    const result = { schemaVersion: 1, metadata, configuration: config, database: databaseSummary, percentileDefinition: 'Nearest-rank: sorted[ceil(p*n)-1], with p in (0,1]. Pooled percentiles use successful measured observations only.', results };

    if (options.compare) {
      let baseline;
      try { baseline = JSON.parse(fs.readFileSync(path.resolve(options.compare), 'utf8')); }
      catch (error) { throw new Error(`Unable to read comparison baseline: ${error.message}`); }
      result.comparison = engine.compareResults(result, baseline);
      if (options.threshold !== undefined) result.regressionSummary = engine.regressionSummary(result, baseline, result.comparison, options.threshold);
    }
    if (options['save-baseline']) writeFile(options['save-baseline'], JSON.stringify(result, null, 2) + '\n');

    const rendered = options.format === 'json' ? JSON.stringify(result, null, 2) + '\n' : options.format === 'csv' ? engine.toCsv(results) : options.format === 'human' ? engine.formatHuman(result) + '\n' : engine.formatMarkdown(result) + '\n';
    if (options.output) {
      writeFile(options.output, rendered);
      if (options.format === 'human') process.stdout.write(rendered);
      process.stderr.write(`Wrote ${options.format.toUpperCase()} results to ${path.resolve(options.output)}\n`);
    } else process.stdout.write(rendered);
    if (result.regressionSummary?.failed) return 1;
    if (controller.signal.aborted) return 130;
    return 0;
  } finally {
    if (database) await Promise.all(database.databases.map(({ db }) => sqlite.close(db)));
  }
}

module.exports = { main };
if (require.main === module) main().then((code) => { process.exitCode = code; }).catch((error) => {
  process.stderr.write(`Benchmark failed: ${error.message}\n`);
  process.exitCode = 1;
});
