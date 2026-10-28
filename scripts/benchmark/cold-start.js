'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const WORKER = path.join(__dirname, 'cold-worker.js');
const ROOT = path.join(__dirname, '..', '..');
const PROBES = [
  ['crypto.x25519.keygen', 'Load crypto module and generate first X25519 key pair'],
  ['envelope.create', 'Load envelope module and create first message envelope'],
  ['dlp.scan', 'Load DLP module and scan first message'],
];

async function runColdStart(engine) {
  const results = [];
  for (const [probe, name] of PROBES) {
    results.push(await engine({
      suite: 'cold-start', id: `cold-start.${probe}`, name,
      parameters: { process: 'fresh-node-child', includes: 'node startup, module load, first operation, process exit' },
      fn: () => {
        const child = spawnSync(process.execPath, [WORKER, probe], { cwd: ROOT, encoding: 'utf8', windowsHide: true, timeout: 30000 });
        if (child.error) throw child.error;
        if (child.status !== 0 || child.stdout.trim() !== 'ok') throw new Error(`Cold-start worker failed (${child.status}): ${child.stderr.trim() || child.stdout.trim()}`);
      },
    }));
  }
  return results;
}

module.exports = { runColdStart };
