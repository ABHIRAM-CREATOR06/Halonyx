#!/usr/bin/env node
'use strict';

globalThis.crypto ||= require('node:crypto').webcrypto;

async function main(probe) {
  if (probe === 'crypto.x25519.keygen') {
    const CryptoUtils = require('../../protocol/crypto_utils');
    await new CryptoUtils().generateDhKeyPair();
  } else if (probe === 'envelope.create') {
    const Envelope = require('../../protocol/envelope');
    Envelope.createEnvelope('Cold-start benchmark message');
  } else if (probe === 'dlp.scan') {
    const DLP = require('../../frontend/js/dlp');
    DLP.scan('Cold-start benchmark message');
  } else throw new Error(`Unknown cold-start probe: ${probe}`);
  process.stdout.write('ok\n');
}

main(process.argv[2]).catch((error) => {
  process.stderr.write(`${error.name}: ${error.message}\n`);
  process.exitCode = 1;
});
