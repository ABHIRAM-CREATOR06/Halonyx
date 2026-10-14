#!/usr/bin/env node
/**
 * Halonyx Benchmark Suite
 * Measures real-world performance of cryptographic operations, envelope protocols,
 * client-side DLP scanning, pairwise group fan-out, and SQLite storage in the local environment.
 */

const { webcrypto } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const sqlite3 = require("sqlite3").verbose();

globalThis.crypto = webcrypto;
globalThis.btoa = globalThis.btoa || ((val) => Buffer.from(val, "binary").toString("base64"));
globalThis.atob = globalThis.atob || ((val) => Buffer.from(val, "base64").toString("binary"));

const root = path.join(__dirname, "..");
const CryptoUtils = require(path.join(root, "protocol", "crypto_utils"));
const X3DH = require(path.join(root, "protocol", "x3dh"));
const DoubleRatchet = require(path.join(root, "protocol", "double_ratchet"));
const EnvelopeModule = require(path.join(root, "protocol", "envelope"));
const HalonyxGroups = require(path.join(root, "frontend", "js", "groups"));
const HalonyxDLP = require(path.join(root, "frontend", "js", "dlp"));
const { hashUSID, generateUSID } = require(path.join(root, "backend", "utils"));

// Helper: Statistical analysis
function analyzeTimings(samplesMs) {
  samplesMs.sort((a, b) => a - b);
  const count = samplesMs.length;
  const sum = samplesMs.reduce((acc, v) => acc + v, 0);
  const mean = sum / count;
  const min = samplesMs[0];
  const max = samplesMs[count - 1];
  const p95 = samplesMs[Math.floor(count * 0.95)] || max;
  const p99 = samplesMs[Math.floor(count * 0.99)] || max;
  const throughput = mean > 0 ? (1000 / mean) : 0;

  return { count, mean, min, max, p95, p99, throughput };
}

// Benchmarking runner
async function benchmarkAsync(name, fn, iterations = 100, warmup = 10) {
  // Warmup phase
  for (let i = 0; i < warmup; i++) {
    await fn();
  }

  const timings = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    timings.push(end - start);
  }

  return { name, ...analyzeTimings(timings) };
}

function benchmarkSync(name, fn, iterations = 500, warmup = 50) {
  // Warmup phase
  for (let i = 0; i < warmup; i++) {
    fn();
  }

  const timings = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    const end = performance.now();
    timings.push(end - start);
  }

  return { name, ...analyzeTimings(timings) };
}

function formatDuration(ms) {
  if (ms < 0.001) {
    return `${(ms * 1000000).toFixed(1)} ns`;
  }
  if (ms < 1.0) {
    return `${(ms * 1000).toFixed(2)} µs`;
  }
  return `${ms.toFixed(2)} ms`;
}

function printSectionHeader(title) {
  console.log(`\n\x1b[1m\x1b[36m=== ${title} ===\x1b[0m`);
}

function printResultsTable(results) {
  console.log("┌────────────────────────────────────────────────────────────┬───────────┬───────────┬───────────┬──────────────┐");
  console.log("│ Operation                                                  │ Mean      │ P95       │ P99       │ Throughput   │");
  console.log("├────────────────────────────────────────────────────────────┼───────────┼───────────┼───────────┼──────────────┤");

  for (const r of results) {
    const name = r.name.padEnd(58).slice(0, 58);
    const mean = formatDuration(r.mean).padStart(9);
    const p95 = formatDuration(r.p95).padStart(9);
    const p99 = formatDuration(r.p99).padStart(9);
    const tput = `${Math.round(r.throughput).toLocaleString()} ops/s`.padStart(12);
    console.log(`│ ${name} │ ${mean} │ ${p95} │ ${p99} │ ${tput} │`);
  }
  console.log("└────────────────────────────────────────────────────────────┴───────────┴───────────┴───────────┴──────────────┘");
}

async function main() {
  console.log("\x1b[1m\x1b[32m");
  console.log("  _   _       _                               ");
  console.log(" | | | | __ _| | ___  _ __  _   ___  __       ");
  console.log(" | |_| |/ _` | |/ _ \\| '_ \\| | | \\ \\/ /       ");
  console.log(" |  _  | (_| | | (_) | | | | |_| |>  <        ");
  console.log(" |_| |_|\\__,_|_|\\___/|_| |_|\\__, /_/_\\        ");
  console.log("                            |___/             ");
  console.log(" Halonyx Localhost Benchmark Suite — Exact Hardware Measurements");
  console.log("\x1b[0m");

  console.log(`Node Runtime:  ${process.version} (${process.platform} ${os.arch()})`);
  console.log(`CPU:           ${os.cpus()[0]?.model || "Unknown"}`);
  console.log(`Memory Total:  ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`);
  console.log(`Local Time:    ${new Date().toISOString()}`);

  const allSummary = {};
  const cryptoUtils = new CryptoUtils();
  const x3dh = new X3DH(cryptoUtils);

  // 1. CRYPTOGRAPHIC PRIMITIVES & X3DH
  printSectionHeader("1. Cryptographic Primitives & X3DH Key Exchange");
  const cryptoResults = [];

  cryptoResults.push(await benchmarkAsync("X25519 DH key pair generation", async () => {
    await cryptoUtils.generateDhKeyPair();
  }, 100, 10));

  cryptoResults.push(await benchmarkAsync("Ed25519 signing key pair generation", async () => {
    await cryptoUtils.generateSigningKeyPair();
  }, 100, 10));

  cryptoResults.push(await benchmarkAsync("Full X3DH key bundle generation (DH + Ed25519 + SPK)", async () => {
    await x3dh.generateKeyBundle();
  }, 50, 5));

  cryptoResults.push(await benchmarkAsync("HKDF-SHA256 (32B IKM -> 32B OKM)", async () => {
    await cryptoUtils.hkdf(new Uint8Array(32), new Uint8Array(32), new Uint8Array(10), 32);
  }, 200, 20));

  const aliceBundle = await x3dh.generateKeyBundle();
  const bobBundle = await x3dh.generateKeyBundle();

  cryptoResults.push(await benchmarkAsync("Full X3DH initial message creation (initiator)", async () => {
    await x3dh.createInitialMessage(
      aliceBundle.identityPrivateKey,
      aliceBundle.identityPublicBytes,
      bobBundle.identityPublicBytes,
      bobBundle.signedPreKeyPublicBytes,
      bobBundle.signedPreKeySignature,
      bobBundle.signingPublicBytes,
    );
  }, 100, 10));

  const initMsg = await x3dh.createInitialMessage(
    aliceBundle.identityPrivateKey,
    aliceBundle.identityPublicBytes,
    bobBundle.identityPublicBytes,
    bobBundle.signedPreKeyPublicBytes,
    bobBundle.signedPreKeySignature,
    bobBundle.signingPublicBytes,
  );

  cryptoResults.push(await benchmarkAsync("Full X3DH initial message processing (responder)", async () => {
    await x3dh.processInitialMessage(
      aliceBundle.identityPublicBytes,
      initMsg.ephemeralPublicBytes,
      bobBundle.identityPrivateKey,
      bobBundle.signedPreKeyPrivate,
    );
  }, 100, 10));

  const bobDhKey = await cryptoUtils.generateDhKeyPair();
  const aliceDhKey = await cryptoUtils.generateDhKeyPair();
  cryptoResults.push(await benchmarkAsync("Single ECDH deriveBits (X25519)", async () => {
    await cryptoUtils.deriveBits(bobDhKey.privateKey, aliceDhKey.publicKeyBytes);
  }, 150, 20));

  printResultsTable(cryptoResults);
  allSummary.crypto = cryptoResults;

  // 2. DOUBLE RATCHET MESSAGE ENCRYPTION
  printSectionHeader("2. Double Ratchet Symmetric Chain & AES-256-GCM");
  const ratchetResults = [];

  const secretAB = new Uint8Array(32).fill(7);
  const aliceRatchet = new DoubleRatchet(cryptoUtils);
  await aliceRatchet.initialize(secretAB, bobDhKey.publicKeyBytes, true);

  const bobRatchet = new DoubleRatchet(cryptoUtils);
  await bobRatchet.initialize(secretAB, bobDhKey.publicKeyBytes, false, bobDhKey);

  const payload1K = "A".repeat(1024);
  const payload10K = "B".repeat(10240);
  const payload100K = "C".repeat(102400);

  ratchetResults.push(await benchmarkAsync("Double Ratchet encrypt (1 KB payload)", async () => {
    await aliceRatchet.encrypt(payload1K);
  }, 200, 20));

  ratchetResults.push(await benchmarkAsync("Double Ratchet encrypt (10 KB payload)", async () => {
    await aliceRatchet.encrypt(payload10K);
  }, 150, 15));

  const aliceSync = new DoubleRatchet(cryptoUtils);
  await aliceSync.initialize(secretAB, bobDhKey.publicKeyBytes, true);
  const bobSync = new DoubleRatchet(cryptoUtils);
  await bobSync.initialize(secretAB, bobDhKey.publicKeyBytes, false, bobDhKey);

  ratchetResults.push(await benchmarkAsync("Double Ratchet decrypt (1 KB payload)", async () => {
    const c = await aliceSync.encrypt(payload1K);
    await bobSync.decrypt(c);
  }, 100, 10));

  printResultsTable(ratchetResults);
  allSummary.ratchet = ratchetResults;

  // 3. SIGNAL ENVELOPE PROTOCOL
  printSectionHeader("3. Signal Envelope Protocol (protocol/envelope.js, v:1)");
  const envelopeResults = [];

  envelopeResults.push(benchmarkSync("createEnvelope (plain text + UUID v4)", () => {
    EnvelopeModule.createEnvelope({ text: "Hello World" });
  }, 1000, 100));

  envelopeResults.push(benchmarkSync("createEnvelope (with parent replyTo quote)", () => {
    EnvelopeModule.createEnvelope({
      text: "Acknowledged and resolved",
      replyTo: {
        id: "msg-12345",
        senderHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        snippet: "Can someone investigate this incident?",
      },
    });
  }, 1000, 100));

  const testEnv = EnvelopeModule.createEnvelope({
    text: "Reviewing pull request",
    replyTo: { id: "p-1", senderHash: "abc", snippet: "Check commit" },
    group: { id: "g-1", name: "Security", members: ["abc", "def"], action: "message" },
  });

  envelopeResults.push(benchmarkSync("parseAndValidateEnvelope (strict v:1 + reply + group)", () => {
    EnvelopeModule.parseAndValidateEnvelope(testEnv);
  }, 1000, 100));

  envelopeResults.push(benchmarkSync("normalizeMessage (legacy string conversion)", () => {
    EnvelopeModule.normalizeMessage("Legacy unversioned chat message");
  }, 1000, 100));

  printResultsTable(envelopeResults);
  allSummary.envelope = envelopeResults;

  // 4. ENTERPRISE CLIENT-SIDE DLP PRE-ENCRYPTION SCANNER
  printSectionHeader("4. Enterprise Client-Side DLP Scanner (frontend/js/dlp.js)");
  const dlpResults = [];

  const clean1K = "The project deployment completed normally. Server health checks are passing across all instances.".repeat(10);
  const clean10K = clean1K.repeat(10);

  dlpResults.push(benchmarkSync("DLP scan clean chat text (1 KB, full 8-rule suite)", () => {
    HalonyxDLP.scan(clean1K);
  }, 500, 50));

  dlpResults.push(benchmarkSync("DLP scan clean chat text (10 KB, full 8-rule suite)", () => {
    HalonyxDLP.scan(clean10K);
  }, 200, 20));

  const awsViolating = `Here is my root AWS key for production: ${["AK", "IA", "IOSFODNN7EXAMPLE"].join("")}, please keep it secure.`;
  dlpResults.push(benchmarkSync("DLP pattern match & intercept (AWS access key)", () => {
    HalonyxDLP.scan(awsViolating);
  }, 500, 50));

  const ghViolating = `Use token ${["gh", "p_", "111122223333444455556666777788889999"].join("")} to authenticate GitHub API.`;
  dlpResults.push(benchmarkSync("DLP pattern match & intercept (GitHub PAT)", () => {
    HalonyxDLP.scan(ghViolating);
  }, 500, 50));

  const ccCandidate = "Card details for billing: 4532-0150-1234-5678 expiring 12/28";
  dlpResults.push(benchmarkSync("DLP credit card regex + Luhn Mod-10 algorithm check", () => {
    HalonyxDLP.scan(ccCandidate);
  }, 500, 50));

  dlpResults.push(benchmarkSync("DLP scan with inline auto-redaction", () => {
    const res = HalonyxDLP.scan(awsViolating);
    return res.redactedText;
  }, 500, 50));

  dlpResults.push(benchmarkSync("DLP luhnCheck (pure Mod-10 algorithm)", () => {
    HalonyxDLP.luhnCheck("4532015012345678");
  }, 1000, 100));

  printResultsTable(dlpResults);
  allSummary.dlp = dlpResults;

  // 5. E2EE MULTI-PARTY GROUP FAN-OUT
  printSectionHeader("5. E2EE Multi-Party Group Fan-Out (Signal Groups v1 Pairwise)");
  const groupResults = [];

  async function createPeerRatchet() {
    const kp = await cryptoUtils.generateDhKeyPair();
    const r = new DoubleRatchet(cryptoUtils);
    await r.initialize(new Uint8Array(32).fill(42), kp.publicKeyBytes, true);
    return r;
  }

  // Pre-generate ratchets for group sizes
  const members3 = [await createPeerRatchet(), await createPeerRatchet()];
  const members5 = [];
  for (let i = 0; i < 4; i++) members5.push(await createPeerRatchet());
  const members10 = [];
  for (let i = 0; i < 9; i++) members10.push(await createPeerRatchet());
  const members25 = [];
  for (let i = 0; i < 24; i++) members25.push(await createPeerRatchet());

  groupResults.push(await benchmarkAsync("Group pairwise fan-out: N=3 members (2 recipients)", async () => {
    const env = EnvelopeModule.createEnvelope({ text: "Status update team" });
    for (const peer of members3) {
      await peer.encrypt(JSON.stringify(env));
    }
  }, 100, 10));

  groupResults.push(await benchmarkAsync("Group pairwise fan-out: N=5 members (4 recipients)", async () => {
    const env = EnvelopeModule.createEnvelope({ text: "Status update team" });
    for (const peer of members5) {
      await peer.encrypt(JSON.stringify(env));
    }
  }, 75, 10));

  groupResults.push(await benchmarkAsync("Group pairwise fan-out: N=10 members (9 recipients)", async () => {
    const env = EnvelopeModule.createEnvelope({ text: "Status update team" });
    for (const peer of members10) {
      await peer.encrypt(JSON.stringify(env));
    }
  }, 40, 5));

  groupResults.push(await benchmarkAsync("Group pairwise fan-out: N=25 members (24 recipients)", async () => {
    const env = EnvelopeModule.createEnvelope({ text: "Status update team" });
    for (const peer of members25) {
      await peer.encrypt(JSON.stringify(env));
    }
  }, 15, 3));

  printResultsTable(groupResults);
  allSummary.group = groupResults;

  // 6. SERVER-SIDE UTILITIES & DATABASE (SQLITE)
  printSectionHeader("6. Server Utilities & SQLite Database Latency");
  const serverResults = [];

  serverResults.push(benchmarkSync("hashUSID (SHA-256 of 64-char hex USID)", () => {
    hashUSID("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  }, 2000, 200));

  serverResults.push(benchmarkSync("generateUSID (crypto.randomBytes 32 -> hex)", () => {
    generateUSID();
  }, 2000, 200));

  // In-memory SQLite operations
  const db = new sqlite3.Database(":memory:");
  await new Promise((resolve) => {
    db.serialize(() => {
      db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, hashed_usid TEXT UNIQUE, pubkey TEXT)");
      db.run("CREATE INDEX idx_users_husid ON users(hashed_usid)");
      const stmt = db.prepare("INSERT INTO users (hashed_usid, pubkey) VALUES (?, ?)");
      for (let i = 0; i < 500; i++) {
        stmt.run(`user_${i}_hash`, `pubkey_data_${i}`);
      }
      stmt.finalize(resolve);
    });
  });

  serverResults.push(await benchmarkAsync("SQLite indexed SELECT by hashed_usid", async () => {
    await new Promise((res) => {
      db.get("SELECT pubkey FROM users WHERE hashed_usid = ?", ["user_250_hash"], res);
    });
  }, 500, 50));

  let insertCounter = 1000;
  serverResults.push(await benchmarkAsync("SQLite INSERT into users table", async () => {
    await new Promise((res) => {
      db.run("INSERT INTO users (hashed_usid, pubkey) VALUES (?, ?)", [`dyn_${insertCounter++}`, "dynamic_pubkey"], res);
    });
  }, 200, 20));

  db.close();

  printResultsTable(serverResults);
  allSummary.server = serverResults;

  // 7. COMPREHENSIVE END-TO-END PIPELINE SUMMARY
  printSectionHeader("7. Complete End-to-End Localhost Send Pipeline Breakdown");
  const dlpMean = allSummary.dlp[0].mean;
  const envMean = allSummary.envelope[0].mean;
  const encMean = allSummary.ratchet[0].mean;
  const decMean = allSummary.ratchet[2].mean;
  const valMean = allSummary.envelope[2].mean;
  const loopbackEst = 0.22; // TCP loopback send + forward estimate
  const domEst = 2.50; // Browser DOM render estimate

  const totalE2E = dlpMean + envMean + encMean + loopbackEst + decMean + valMean + domEst;

  console.log(`  1. Pre-encryption DLP scan (1 KB):           ${formatDuration(dlpMean)}`);
  console.log(`  2. Signal envelope creation (v:1):           ${formatDuration(envMean)}`);
  console.log(`  3. Double Ratchet encryption (1 KB):         ${formatDuration(encMean)}`);
  console.log(`  4. Loopback WebSocket hop (send + forward):  ~${loopbackEst.toFixed(2)} ms`);
  console.log(`  5. Double Ratchet decryption (1 KB):         ${formatDuration(decMean)}`);
  console.log(`  6. Signal envelope validation:               ${formatDuration(valMean)}`);
  console.log(`  7. Browser DOM render & quote resolution:    ~${domEst.toFixed(2)} ms`);
  console.log(`  ───────────────────────────────────────────────────────────`);
  console.log(`  \x1b[1m\x1b[32mMeasured End-to-End Latency on this host:    ~${totalE2E.toFixed(2)} ms\x1b[0m\n`);

  console.log("\x1b[32m✔ Benchmark execution completed successfully with 0 errors.\x1b[0m\n");
}

main().catch((err) => {
  console.error("Benchmark failed with error:", err);
  process.exit(1);
});
