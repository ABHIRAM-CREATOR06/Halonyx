'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'scripts', 'benchmark.js');

test('explicit synthetic NORMAL mode prints a warning and leaves production defaults untouched', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'halonyx-normal-cli-test-'));
  const resultFile = path.join(dir, 'results.json');
  const dbFile = path.join(dir, 'fixture.db');
  try {
    const run = spawnSync(process.execPath, [
      CLI,
      '--suite', 'sqlite',
      '--synchronous', 'NORMAL',
      '--rows', '0',
      '--runs', '1',
      '--warmup', '0',
      '--iterations', '1',
      '--db', dbFile,
      '--format', 'json',
      '--output', resultFile,
    ], { cwd: ROOT, encoding: 'utf8', timeout: 30000, windowsHide: true });

    assert.equal(run.error, undefined, run.error?.message);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stderr, /WARNING: synchronous=NORMAL applies only to isolated synthetic benchmark databases/);

    const report = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
    for (const kind of ['app', 'identity', 'keys']) {
      assert.equal(report.database.pragmas[kind].journal_mode, 'wal');
      assert.equal(report.database.pragmas[kind].synchronous, 1);
      assert.equal(report.database.pragmas[kind].busy_timeout, 5000);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
