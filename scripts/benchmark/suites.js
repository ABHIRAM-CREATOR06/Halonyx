'use strict';

const assert = require('node:assert/strict');
const { once } = require('node:events');
const CryptoUtils = require('../../protocol/crypto_utils');
const X3DH = require('../../protocol/x3dh');
const DoubleRatchet = require('../../protocol/double_ratchet');
const Envelope = require('../../protocol/envelope');
const DLP = require('../../frontend/js/dlp');
const { hashUSID, generateUSID } = require('../../backend/utils');

function textBytes(text) { return Buffer.byteLength(text, 'utf8'); }
function payload(size) { return 'x'.repeat(size); }

async function runCrypto(engine) {
  const results = [];
  const crypto = new CryptoUtils();
  const x3dh = new X3DH(crypto);
  const add = async (def) => results.push(await engine({ suite: 'crypto', ...def }));
  await add({ id: 'crypto.x25519.keygen', name: 'X25519 key generation', fn: () => crypto.generateDhKeyPair() });
  // Build an independent local pair so key generation is excluded from deriveBits timing.
  const left = await crypto.generateDhKeyPair(); const right = await crypto.generateDhKeyPair();
  await add({ id: 'crypto.x25519.derive', name: 'X25519 deriveBits', parameters: { peerKeyBytes: 32 }, fn: () => crypto.deriveBits(left.privateKey, right.publicKeyBytes) });
  await add({ id: 'crypto.ed25519.keygen', name: 'Ed25519 signing key generation', fn: () => crypto.generateSigningKeyPair() });
  const signing = await crypto.generateSigningKeyPair(); const signingBytes = new TextEncoder().encode('synthetic Halonyx benchmark input');
  await add({ id: 'crypto.ed25519.sign', name: 'Ed25519 sign', parameters: { inputBytes: signingBytes.length }, fn: () => crypto.signEd25519(signingBytes, signing.privateKey) });
  const signature = await crypto.signEd25519(signingBytes, signing.privateKey);
  await add({ id: 'crypto.ed25519.verify', name: 'Ed25519 verify', parameters: { inputBytes: signingBytes.length }, fn: () => crypto.verifyEd25519(signingBytes, signature, signing.publicKeyBytes) });
  await add({ id: 'crypto.hkdf-sha256', name: 'HKDF-SHA256', parameters: { ikmBytes: 32, saltBytes: 32, infoBytes: 10, outputBytes: 32 }, fn: () => crypto.hkdf(new Uint8Array(32), new Uint8Array(32), new Uint8Array(10), 32) });

  const aliceBundle = await x3dh.generateKeyBundle(); const bobBundle = await x3dh.generateKeyBundle();
  await add({ id: 'crypto.x3dh.key-bundle', name: 'X3DH key bundle generation', fn: () => x3dh.generateKeyBundle() });
  const initial = await x3dh.createInitialMessage(aliceBundle.identityPrivateKey, aliceBundle.identityPublicBytes, bobBundle.identityPublicBytes, bobBundle.signedPreKeyPublicBytes, bobBundle.signedPreKeySignature, bobBundle.signingPublicBytes);
  const responder = await x3dh.processInitialMessage(aliceBundle.identityPublicBytes, initial.ephemeralPublicBytes, bobBundle.identityPrivateKey, bobBundle.signedPreKeyPrivate);
  assert.deepEqual(Buffer.from(initial.sharedSecret), Buffer.from(responder.sharedSecret), 'X3DH sides must agree before performance measurement');
  await add({ id: 'crypto.x3dh.initiator', name: 'X3DH initiator session setup', fn: () => x3dh.createInitialMessage(aliceBundle.identityPrivateKey, aliceBundle.identityPublicBytes, bobBundle.identityPublicBytes, bobBundle.signedPreKeyPublicBytes, bobBundle.signedPreKeySignature, bobBundle.signingPublicBytes) });
  await add({ id: 'crypto.x3dh.responder', name: 'X3DH responder session processing', fn: () => x3dh.processInitialMessage(aliceBundle.identityPublicBytes, initial.ephemeralPublicBytes, bobBundle.identityPrivateKey, bobBundle.signedPreKeyPrivate) });

  const dh = await crypto.generateDhKeyPair();
  for (const size of [0, 1024, 10240, 102400]) {
    const data = payload(size);
    const sender = new DoubleRatchet(crypto); const receiverKey = await crypto.generateDhKeyPair();
    await sender.initialize(new Uint8Array(32).fill(7), receiverKey.publicKeyBytes, true);
    await add({ id: 'crypto.double-ratchet.encrypt', name: `Double Ratchet encrypt ${size} B`, parameters: { payloadBytes: size }, fn: () => sender.encrypt(data) });
    const tx = new DoubleRatchet(crypto); const rx = new DoubleRatchet(crypto);
    await tx.initialize(new Uint8Array(32).fill(9), dh.publicKeyBytes, true);
    await rx.initialize(new Uint8Array(32).fill(9), dh.publicKeyBytes, false, dh);
    await add({ id: 'crypto.double-ratchet.decrypt', name: `Double Ratchet decrypt ${size} B`, parameters: { payloadBytes: size }, prepare: () => tx.encrypt(data), fn: async (ciphertext) => { const plaintext = await rx.decrypt(ciphertext); assert.equal(plaintext, data); } });
  }
  return results;
}

async function runEnvelope(engine) {
  const results = [];
  const add = async (def) => results.push(await engine({ suite: 'envelope', ...def }));
  const reply = { id: 'b'.repeat(32), snippet: 'Synthetic quoted message', senderHash: 'a'.repeat(64) };
  const group = { id: 'group-bench', name: 'Synthetic group', members: ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)], action: 'message' };
  await add({ id: 'envelope.create.basic', name: 'Create text envelope', parameters: { optionalFields: false, bodyBytes: 32 }, batchSize: 50, fn: () => Envelope.createEnvelope('A synthetic benchmark message') });
  await add({ id: 'envelope.create.reply-group', name: 'Create reply and group envelope', parameters: { optionalFields: true, members: group.members.length }, batchSize: 20, fn: () => Envelope.createEnvelope('A synthetic benchmark message', reply, group) });
  for (const size of [0, 1024, 10000]) {
    const env = Envelope.createEnvelope(payload(size)); const serialized = JSON.stringify(env);
    await add({ id: 'envelope.json.parse', name: `JSON parse envelope ${size} B body`, parameters: { bodyBytes: size, serializedBytes: textBytes(serialized) }, batchSize: 20, fn: () => JSON.parse(serialized) });
    await add({ id: 'envelope.validate', name: `Validate envelope ${size} B body`, parameters: { bodyBytes: size, optionalFields: false }, batchSize: 10, fn: () => { const value = Envelope.parseAndValidateEnvelope(env); if (!value) throw new Error('Envelope validation failed'); } });
  }
  const replyGroupEnv = Envelope.createEnvelope('Reply body', reply, group);
  await add({ id: 'envelope.validate.reply-group', name: 'Validate envelope with reply and group', parameters: { members: group.members.length, replySnippetBytes: textBytes(reply.snippet) }, batchSize: 10, fn: () => { if (!Envelope.parseAndValidateEnvelope(replyGroupEnv)) throw new Error('Envelope validation failed'); } });
  await add({ id: 'envelope.normalize.legacy', name: 'Normalize legacy text', parameters: { inputBytes: 34 }, batchSize: 50, fn: () => Envelope.normalizeMessage('Legacy synthetic benchmark message') });
  return results;
}

async function runDlp(engine) {
  const results = [];
  const ruleCount = DLP.getBuiltinRules().length;
  const add = async (def) => results.push(await engine({ suite: 'dlp', ...def }));
  for (const size of [0, 1024, 10240]) {
    const clean = 'ordinary synthetic chat text '.repeat(Math.ceil(size / 29)).slice(0, size);
    await add({ id: 'dlp.scan.clean', name: `DLP clean scan ${size} B`, parameters: { inputBytes: size, builtinRules: ruleCount }, batchSize: 10, fn: () => DLP.scan(clean) });
  }
  const aws = `Synthetic test key ${['AK', 'IA', 'IOSFODNN7EXAMPLE'].join('')}`;
  await add({ id: 'dlp.scan.match', name: 'DLP synthetic AWS pattern match', parameters: { inputBytes: textBytes(aws), builtinRules: ruleCount, expectedMatch: 'AWS access key pattern' }, batchSize: 10, fn: () => { if (!DLP.scan(aws).hasViolation) throw new Error('Expected synthetic pattern match'); } });
  const falsePositive = 'Not a key: 4111111111111112 and not a card because it fails the checksum.';
  await add({ id: 'dlp.scan.false-positive-resistant', name: 'DLP checksum-resistant candidate', parameters: { inputBytes: textBytes(falsePositive), builtinRules: ruleCount }, batchSize: 10, fn: () => DLP.scan(falsePositive) });
  await add({ id: 'dlp.scan.redaction', name: 'DLP scan and redact synthetic pattern', parameters: { inputBytes: textBytes(aws), builtinRules: ruleCount }, batchSize: 10, fn: () => DLP.scan(aws).redactedText });
  await add({ id: 'dlp.luhn', name: 'DLP Luhn check on synthetic test number', parameters: { digits: 16 }, batchSize: 100, fn: () => DLP.luhnCheck('4111111111111111') });
  return results;
}

async function runGroup(engine, crypto) {
  const results = [];
  const recipientCounts = [1, 2, 4, 9, 24, 49];
  const peers = [];
  for (let i = 0; i < Math.max(...recipientCounts); i++) {
    const key = await crypto.generateDhKeyPair(); const ratchet = new DoubleRatchet(crypto);
    await ratchet.initialize(new Uint8Array(32).fill((i % 200) + 1), key.publicKeyBytes, true); peers.push(ratchet);
  }
  for (const recipients of recipientCounts) {
    const members = recipients + 1;
    const r = await engine({ suite: 'group', id: 'group.pairwise-fanout', name: `Pairwise fan-out encryption ${members} members`, parameters: { groupSize: members, recipientCount: recipients, payloadBytes: 128, includesRelay: false }, fn: async () => {
      const envelope = Envelope.createEnvelope('Synthetic group status update');
      const encoded = JSON.stringify(envelope);
      let encryptedMessages = 0;
      for (const peer of peers.slice(0, recipients)) { await peer.encrypt(encoded); encryptedMessages++; }
      return encryptedMessages;
    } });
    r.totalEncryptedMessages = r.successfulOperations * recipients;
    r.encryptedRecipientThroughputPerSecond = r.totalElapsedMs ? r.totalEncryptedMessages / (r.totalElapsedMs / 1000) : null;
    results.push(r);
  }
  return results;
}

async function openLoopback(recipientCount, receiver) {
  const WebSocket = require('ws');
  const { WebSocketServer } = WebSocket;
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(wss, 'listening');
  const recipients = new Set();
  let senderSocket;
  const ackCounts = new Map();
  const pending = new Map();
  wss.on('connection', (socket, request) => {
    if (request.url === '/sender') {
      senderSocket = socket;
      socket.on('message', (raw) => {
        let frame;
        try { frame = JSON.parse(raw.toString()); } catch (_) { return; }
        if (frame.kind === 'data') for (const peer of recipients) if (peer.readyState === WebSocket.OPEN) peer.send(raw);
      });
    } else {
      recipients.add(socket);
      socket.on('message', (raw) => {
        if (senderSocket?.readyState === WebSocket.OPEN) senderSocket.send(raw);
      });
      socket.on('close', () => recipients.delete(socket));
    }
  });
  const base = `ws://127.0.0.1:${wss.address().port}`;
  const sender = new WebSocket(`${base}/sender`); await once(sender, 'open');
  const peers = [];
  for (let i = 0; i < recipientCount; i++) {
    const peer = new WebSocket(`${base}/recipient`);
    peer.on('message', async (raw) => {
      let frame;
      try { frame = JSON.parse(raw.toString()); await receiver(frame); peer.send(JSON.stringify({ kind: 'ack', id: frame.id, ok: true })); }
      catch (_) { if (frame?.id) peer.send(JSON.stringify({ kind: 'ack', id: frame.id, ok: false })); }
    });
    await once(peer, 'open'); peers.push(peer);
  }
  sender.on('message', (raw) => {
    let frame;
    try { frame = JSON.parse(raw.toString()); } catch (_) { return; }
    if (frame.kind !== 'ack') return;
    const entry = pending.get(frame.id);
    if (!entry) return;
    if (!frame.ok) { pending.delete(frame.id); entry.reject(new Error('Recipient processing failed')); return; }
    const count = (ackCounts.get(frame.id) || 0) + 1; ackCounts.set(frame.id, count);
    if (count === recipientCount) { pending.delete(frame.id); ackCounts.delete(frame.id); entry.resolve(count); }
  });
  async function deliver(frame) {
    if (sender.readyState !== WebSocket.OPEN) throw new Error('Loopback sender is closed');
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { pending.delete(frame.id); reject(new Error('Loopback acknowledgement timed out')); }, 10000);
      pending.set(frame.id, { resolve: (count) => { clearTimeout(timeout); resolve(count); }, reject: (error) => { clearTimeout(timeout); reject(error); } });
      sender.send(JSON.stringify({ kind: 'data', ...frame }), (error) => { if (error) { clearTimeout(timeout); pending.delete(frame.id); reject(error); } });
    });
  }
  return {
    deliver,
    async close() {
      for (const socket of [sender, ...peers]) if (socket.readyState === WebSocket.OPEN) socket.close();
      await new Promise((resolve) => wss.close(resolve));
    },
  };
}

async function runWebSocket(engine) {
  const results = [];
  for (const clients of [1, 5]) for (const size of [0, 1024, 10240]) {
    const payloadText = payload(size);
    const harness = await openLoopback(clients, async (frame) => {
      if (textBytes(frame.payload) !== size) throw new Error('Loopback payload mismatch');
    });
    try {
      results.push(await engine({ suite: 'websocket', id: 'websocket.loopback.ack', name: `Loopback WS acknowledgement ${clients} client(s), ${size} B`, parameters: { concurrentClients: clients, payloadBytes: size, topology: 'single-process-loopback', completion: 'recipient parsed payload and acknowledged' }, fn: () => harness.deliver({ id: `${process.pid}-${++counter}`, payload: payloadText }) }));
    } finally { await harness.close(); }
  }
  return results;
}
let counter = 0;

async function runPipeline(engine) {
  const crypto = new CryptoUtils();
  const dh = await crypto.generateDhKeyPair();
  const alice = new DoubleRatchet(crypto); const bob = new DoubleRatchet(crypto);
  const secret = new Uint8Array(32).fill(31);
  await alice.initialize(secret, dh.publicKeyBytes, true); await bob.initialize(secret, dh.publicKeyBytes, false, dh);
  const body = 'Synthetic complete pipeline benchmark message';
  const harness = await openLoopback(1, async (frame) => {
    const encrypted = {
      header: {
        dhPublicKeyBytes: Uint8Array.from(Buffer.from(frame.encrypted.header.dhPublicKeyBytes, 'base64')),
        iv: Uint8Array.from(Buffer.from(frame.encrypted.header.iv, 'base64')),
      },
      ciphertext: Uint8Array.from(Buffer.from(frame.encrypted.ciphertext, 'base64')),
    };
    const cleartext = await bob.decrypt(encrypted);
    const envelope = Envelope.parseAndValidateEnvelope(cleartext);
    if (!envelope || envelope.id !== frame.id || envelope.body !== body) throw new Error('Recipient rejected the decrypted message');
  });
  try {
    return [await engine({ suite: 'pipeline', id: 'pipeline.local-loopback-e2e', name: 'DLP → envelope → Double Ratchet → loopback WS → decrypt/validate → ack', parameters: { payloadBytes: textBytes(body), topology: 'single-process-loopback', start: 'before DLP scan', completion: 'recipient decrypted and validated envelope, then acknowledged', browserPaintingIncluded: false, relayAuthenticationIncluded: false }, fn: async () => {
      if (DLP.scan(body).hasViolation) throw new Error('Synthetic pipeline input unexpectedly matched DLP');
      const envelope = Envelope.createEnvelope(body);
      const encrypted = await alice.encrypt(JSON.stringify(envelope));
      await harness.deliver({ id: envelope.id, encrypted: {
        header: {
          dhPublicKeyBytes: Buffer.from(encrypted.header.dhPublicKeyBytes).toString('base64'),
          iv: Buffer.from(encrypted.header.iv).toString('base64'),
        },
        ciphertext: Buffer.from(encrypted.ciphertext).toString('base64'),
      } });
    } })];
  } finally { await harness.close(); }
}

async function runSuite(name, engine, options, database) {
  if (name === 'crypto') return runCrypto(engine);
  if (name === 'envelope') return runEnvelope(engine);
  if (name === 'dlp') return runDlp(engine);
  if (name === 'group') return runGroup(engine, new (require('../../protocol/crypto_utils'))());
  if (name === 'sqlite') return require('./sqlite').benchmarkSqlite(engine, database, options);
  if (name === 'websocket') return runWebSocket(engine);
  if (name === 'pipeline') return runPipeline(engine);
  if (name === 'cold-start') return require('./cold-start').runColdStart(engine);
  throw new Error(`Unknown benchmark suite: ${name}`);
}

module.exports = { runSuite, openLoopback, runCrypto, runEnvelope, runDlp, runGroup, runWebSocket, runPipeline };
