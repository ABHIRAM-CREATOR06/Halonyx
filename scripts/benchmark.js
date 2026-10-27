#!/usr/bin/env node
'use strict';
const { main } = require('./benchmark/cli');
main().then((code) => { process.exitCode = code; }).catch((error) => { process.stderr.write('Benchmark failed: ' + error.message + '\n'); process.exitCode = 1; });
