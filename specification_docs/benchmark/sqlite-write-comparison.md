# SQLite write optimization: five-run comparison

## Decision

Keep `journal_mode=WAL`, `synchronous=FULL`, and `busy_timeout=5000` in the production SQLite connection helper for the app, identity, and key databases. In this one-machine synthetic five-run comparison, median latency fell by about 78–82% for mailbox enqueue, dequeue, expiry cleanup, user insert, and three competing inserts, with no failed operations. Read latency was unchanged within noise. The indexed user-update row is reported separately because it repeatedly assigns one fixed payload to one synthetic row; its definition was unchanged across these configurations, so it is not evidence of a changing user-record workload.

The tested `BEGIN IMMEDIATE` + `DELETE ... RETURNING` mailbox-flush candidate was slower at median at all tested queue depths, so production keeps the existing ordered SELECT/send/DELETE flush path. `synchronous=NORMAL` was measured as a benchmark-only data point and is not shipped. `synchronous=FULL` durability depends on the storage device honoring flush requests. Results are from one Windows machine with synthetic fixtures and are not production measurements.

## Method and provenance

Each configuration used five runs, 10 warmup operations per run, 100 measured iterations per run, and 1,000 deterministic synthetic rows. Each workload therefore has 500 measured samples; the compared rows reported zero failures. The benchmark fixtures are separate app, identity, and key database files.

All three captures were made on the same Windows x64 machine: 12th Gen Intel Core i5-12450H, 12 logical CPUs, Node.js v26.12.0, SQLite 3.52.0. The Git HEAD at capture was `f94afad8b6964633b9ece63479be371afeb4176e`; the working tree was dirty. The raw JSON recorded Git metadata as null because Git rejected the workspace as dubious ownership. The commit was verified post hoc; the benchmark runner now uses a command-local safe-directory override and has a regression test for commit capture.

The baseline used `journal_mode=DELETE`, `synchronous=FULL` (SQLite value 2), and SQLite's default 0 ms busy timeout (not explicitly set). WAL+FULL used `journal_mode=WAL`, `synchronous=FULL`, and a 5,000 ms busy timeout. WAL+NORMAL used the same synthetic workload and timeout with `synchronous=NORMAL`; this mode is explicitly flagged and warning-only in the benchmark CLI. The production helper itself has no NORMAL option.

The `sqlite.users.insert-delete` workload times the single `INSERT`; its cleanup `DELETE` runs in the benchmark engine's `after` callback after the timer stops. This timing boundary and SQL definition are identical in all three captures. The `sqlite.users.update` workload is one indexed `UPDATE` on the midpoint synthetic user, assigning `{"synthetic":true,"updated":true}` to `public_key_bundle`; that SQL and payload are also unchanged across captures, though repeated operations reapply the same value.

## Before vs. WAL+FULL

Latency is median milliseconds per operation; lower is better. P95 is shown for tail context. The user-update workload is presented separately below due to its fixed-value semantics.

| Synthetic workload | Before median (ms) | Before P95 (ms) | WAL+FULL median (ms) | WAL+FULL P95 (ms) | Median latency reduction |
|---|---:|---:|---:|---:|---:|
| User insert (cleanup DELETE excluded) | 5.9713 | 88.7184 | 1.0983 | 2.9359 | 81.6% |
| Mailbox enqueue | 5.0893 | 70.7862 | 0.9992 | 2.2080 | 80.4% |
| Mailbox dequeue by ID | 4.6622 | 7.1535 | 0.9697 | 2.0660 | 79.2% |
| Expired mailbox cleanup | 4.4105 | 6.2315 | 0.9823 | 2.0628 | 77.7% |
| Three competing user inserts | 13.5484 | 89.5185 | 2.6743 | 3.9537 | 80.3% |
| Indexed user read (context) | 0.1483 | 0.2638 | 0.1304 | 0.3257 | 12.1% median decrease; within noise |

The median write-side improvement is clear in every listed workload. Read median was slightly lower, but its P95 was noisier and higher; the data does not establish a read-latency improvement.

## Indexed user update (separate interpretation)

This workload is identical in the baseline, WAL+FULL, and WAL+NORMAL source: an indexed lookup by `hashed_usid`, followed by an `UPDATE` assigning the same JSON payload to the midpoint synthetic user's `public_key_bundle`. It is separated because that repeated fixed assignment is not representative of a workload that changes user data on every operation—not because the SQL definition changed.

| Configuration | Mean (ms) | Median (ms) | P90 (ms) | P95 (ms) | P99 (ms) | SD (ms) | CV | Throughput (ops/s) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Before — DELETE/FULL | 21.7091 | 18.7219 | 38.3796 | 47.6451 | 65.1684 | 18.3048 | 84.32% | 46.06 |
| WAL+FULL | 0.1320 | 0.1015 | 0.2501 | 0.3303 | 0.5648 | 0.1038 | 78.62% | 7,574.11 |
| WAL+NORMAL (benchmark-only) | 0.2695 | 0.1375 | 0.4014 | 1.0194 | 3.7872 | 0.5817 | 215.90% | 3,711.25 |

## Mailbox flush candidate: not retained in production

| Queue depth | Existing SELECT→DELETE median (ms) | Candidate RETURNING median (ms) | Candidate median change | Existing P95 (ms) | Candidate P95 (ms) |
|---:|---:|---:|---:|---:|---:|
| 1 | 1.3344 | 1.4496 | 8.6% slower | 2.8691 | 2.9650 |
| 5 | 1.4778 | 1.5690 | 6.2% slower | 6.4917 | 3.2243 |
| 10 | 1.4423 | 1.6281 | 12.9% slower | 3.1324 | 3.2510 |

The candidate's P95 improves at depth 5 but not at depths 1 or 10, and its median is slower at all three queue depths. That is not a consistent speedup, so production keeps the existing mailbox flush path. The candidate and its ordering/rollback tests remain benchmark/test-only.

## WAL+NORMAL: benchmark-only data point

The separate WAL+NORMAL five-run invocation measured faster synthetic writes than WAL+FULL (for example, user insert median 0.2071 ms vs. 1.0983 ms; mailbox enqueue 0.1725 ms vs. 0.9992 ms). This does not override the requested durability policy: delivery state and identity/key material stay on FULL. NORMAL requires an explicit SQLite benchmark flag, prints a warning, and can only be applied to the synthetic fixtures.

## Trimmed configuration summaries

The following committed summaries retain provenance and statistics without committing the raw 500-sample arrays:

- [Baseline — DELETE/FULL](sqlite-before-delete-full.md)
- [WAL+FULL](sqlite-wal-full.md)
- [WAL+NORMAL (benchmark-only)](sqlite-wal-normal.md)

Raw JSON remains local under `.work/performance/` and is excluded from Git. After archiving the raw outputs outside the repository, only marked synthetic fixture databases and their `-wal`/`-shm` sidecars are removed explicitly; real app databases and `.env` files are not part of this cleanup. `.work/` and database files are ignored by Git. The benchmark guide describes safe fixture cleanup and WAL-aware backups.
