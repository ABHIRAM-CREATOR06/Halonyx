# Halonyx Reproducible Benchmark Suite

The benchmark command measures the repository's cryptographic, envelope, DLP, group fan-out, SQLite, loopback WebSocket, local end-to-end pipeline, and optional cold-start workloads. It reports only values actually measured on the current machine. It does not make claims about production performance.

## Prerequisites and quick start

Use the Node.js version supported by this checkout and install the dependencies in `package.json` (including the native `sqlite3` dependency). No production credentials or app databases are needed.

```text
npm test
npm run benchmark -- --help
npm run benchmark -- --suite crypto,envelope,dlp --runs 5 --warmup 20 --iterations 100
```

The default output is grouped Markdown tables matching `benchmark.md`. To rerun all suites and replace the checked-in snapshot with fresh values, run:

```text
npm run benchmark -- --output specification_docs/benchmark/benchmark.md
```

The runner uses `performance.now()` for high-resolution per-operation timing, awaits asynchronous operations, and runs independent rounds. Warm-ups run before each measured round. Use smaller values for a smoke run and larger values for steadier local measurements.

### Cold-start mode

Cold-start measurements are separate from the default warmed suites. Each sample launches a fresh Node.js child process, loads one module, and performs its first operation. It covers X25519 key generation, envelope creation, and DLP scanning. Samples include Node process startup, module loading, the operation, and process exit; the operating system's filesystem and code caches are not cleared. The default is five child processes per probe, with no warm-ups and one operation per process.

```text
npm run benchmark:cold -- --runs 5 --output benchmark-results/cold-start.md
```

Keep this report separate from the warmed `benchmark.md` snapshot. Cold-start measurements are sensitive to OS cache state and background load; use them to compare repeated runs on the same machine, not as pure operation latency.

## Suites

| Suite | What is measured | Boundary and limits |
| --- | --- | --- |
| `crypto` | X25519 key generation and derive, Ed25519 key generation/sign/verify, HKDF-SHA256, X3DH bundle/initiator/responder, Double Ratchet encrypt/decrypt | Decrypt setup is prepared outside the timed region; correctness is checked during decrypt. Ratchet API workloads are component measurements. |
| `envelope` | Envelope creation, JSON parsing, validation, legacy normalization, optional reply/group metadata | Synthetic payload sizes are limited by the envelope's 10,000-character body limit. |
| `dlp` | Clean scans, synthetic rule match, checksum-resistant candidate, redaction, Luhn | Reports input bytes and built-in rule count. Test strings are synthetic; the AWS-looking value is the published non-secret example pattern. |
| `group` | Pairwise Double Ratchet encryption fan-out for 2, 3, 5, 10, 25, and 50 members | Synthetic encryption only; no WebSocket relay, recipient decryption, or network delivery is included. Message count and per-recipient throughput are reported separately. |
| `sqlite` | Indexed reads, insert/update/delete, mailbox enqueue/dequeue/expiry cleanup, concurrent reads and competing inserts | Direct SQL against the actual app/identity/key schema files, on dedicated benchmark databases. It is not an HTTP or full server-path measurement. |
| `websocket` | Local WebSocket relay forwarding with one and five recipients and payloads of 0, 1, and 10 KiB | Same-process loopback. Completion requires each receiving client to parse the payload and return an acknowledgement. It does not include production authentication or a remote network. |
| `pipeline` | DLP scan → envelope → Double Ratchet encrypt → loopback WebSocket → recipient decrypt/validate → acknowledgement | Same-process loopback; timing ends after the recipient validates the decrypted envelope. Browser DOM updates, painting, server authentication, and remote network are excluded. This is the only end-to-end workload. |

No browser-paint benchmark is included: the repository has no browser performance harness, and a synchronous JavaScript timer would not measure completed paint. High-concurrency backpressure, separate-process and remote WebSocket tests are also outside this version's scope.

## SQLite fixture isolation

The SQLite suite defaults to a dedicated directory under the operating system's temporary folder. It creates `app.db` plus companion `app.identity.db` and `app.keys.db` files, using the schemas and indexes in `backend/db/`. Synthetic rows are deterministic and use `.invalid` email domains. The benchmark database is never opened by the application server.

```text
npm run benchmark -- --suite sqlite --db ./benchmark-data/halonyx-bench.db --rows 10000
npm run benchmark -- --suite sqlite --db ./benchmark-data/halonyx-bench.db --rows 10000 --reset
npm run benchmark -- --cleanup --db ./benchmark-data/halonyx-bench.db
```

Existing databases are preserved. If a requested path already contains SQLite data without the Halonyx benchmark ownership marker, initialization and cleanup refuse to modify it. A changed fixture size requires `--reset`; reset only operates on marked benchmark databases. Cleanup removes only marked app/identity/key files. Generated database and report directories are ignored by Git.

The suite sets and records fixed SQLite PRAGMAs (`journal_mode=DELETE`, `synchronous=FULL`, `cache_size=-2000`, `foreign_keys=ON`, `temp_store=MEMORY`). Keep these the same when comparing runs. Row counts, file sizes, schema/index validation, library version, and PRAGMAs appear in JSON output.

## Results, export, and baselines

```text
npm run benchmark -- --suite all --runs 10 --warmup 500 --iterations 5000 --format json --output ./benchmark-results/run.json
npm run benchmark -- --suite sqlite --format csv --output ./benchmark-results/sqlite.csv
npm run benchmark -- --suite crypto --save-baseline ./benchmark-results/baseline.json
npm run benchmark -- --suite crypto --compare ./benchmark-results/baseline.json
npm run benchmark -- --suite crypto --runs 5 --compare ./benchmark-results/baseline.json --threshold 10
```

JSON contains raw successful timing observations, per-round summaries, failures, excluded batches, configuration, environment fingerprint, and database details. CSV contains the per-benchmark summary metrics. Comparison aligns by suite, stable benchmark ID, and workload parameters, reports absolute and percentage latency/throughput changes, and warns when runtime, OS, architecture, SQLite, fixture, or run configuration differs. Comparing different operating systems or runtimes is descriptive; it does not isolate hardware effects.

The optional regression threshold returns exit code 1 only when the measured increase's approximate 95% lower confidence bound exceeds the configured percentage and both sides have at least 20 samples across three rounds with matching Node.js, OS, architecture, and SQLite versions. Other cases are reported as not assessed. This is a simple Welch-style normal approximation, not a substitute for a controlled performance lab.

## Metric definitions

- Percentiles use the **nearest-rank** definition: sorted observation at `ceil(p × n) - 1`. It is used for P50, P90, P95, and P99.
- Mean, median, standard deviation (sample SD), coefficient of variation, minimum, and maximum use successful measured observations. Failed operations are counted and reported separately, not included as latency samples. A failed batch excludes its average sample and increments excluded-sample counts.
- For batched microbenchmarks, each observation is the measured batch duration divided by batch size; output labels the sample unit. Batch errors are never silently dropped.
- Throughput is successful measured operations divided by total measured time. Failed operation time stays in the denominator. Warm-up and preparation work are not part of the timed operation region.
- Round ranges are minimum and maximum of per-round means. Pooled P95/P99 use pooled underlying observations; per-round percentiles are not averaged.
- `totalElapsedMs` is summed timed operation duration, not wall-clock process time. For the loopback pipeline it includes sender and recipient processing through the acknowledgement; it excludes startup/fixture setup.

## Fingerprint and repeatability

JSON records CPU model/logical CPU count, platform/release, Node.js and executable architecture, V8/OpenSSL/SQLite versions, total memory, process memory before/after, heap limit, timestamps, git commit and working-tree state, safe allowlisted environment fields, benchmark settings, fixture configuration and PRAGMAs. Optional CPU frequency, thermal, and power values are explicitly unavailable because portable Node.js APIs do not expose them. No environment-variable values outside the harmless allowlist are collected.

To reproduce a result on a second Windows, Linux, or macOS computer, use the same Node.js major/minor version, dependency lockfile, suite, fixture size, PRAGMAs, warm-up, iteration, and run settings. Save JSON on each computer and compare it with `--compare`. Use the same command below in PowerShell, Command Prompt, Linux, and macOS shells; change only the path separator if you choose a custom output path.

```text
npm ci
npm run benchmark -- --suite all --runs 5 --warmup 50 --iterations 500 --format json --output benchmark-results/run.json
```

For a larger controlled run:

```text
npm run benchmark -- --suite all --runs 10 --warmup 500 --iterations 5000 --format json --output benchmark-results/run.json
```

Use `--gc` only with `node --expose-gc` when intentionally studying GC-assisted behavior; the normal run never forces collection. Cancellation with Ctrl+C/SIGTERM stops between operations and emits partial results when possible.

## Current limitations

- No browser rendering/paint instrumentation or remote multi-machine WebSocket harness.
- Loopback WebSocket and pipeline suites require local loopback sockets to be permitted by the host sandbox/firewall.
- SQLite workloads measure SQL against dedicated files, not the running Express application/database connection path.
- CPU frequency, thermal state, and power data are unavailable through portable APIs.
- Regression intervals are approximate and should not be used as a sole noisy CI gate without stable dedicated hardware.
