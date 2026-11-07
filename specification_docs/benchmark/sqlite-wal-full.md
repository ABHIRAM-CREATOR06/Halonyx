# SQLite benchmark summary — WAL + FULL

> Trimmed summary only; raw timing arrays are intentionally excluded.

## Provenance

- **Started (UTC):** 2026-11-06T11:50:15.886Z
- **Git commit at capture:** `f94afad8b6964633b9ece63479be371afeb4176e` (verified post hoc; raw JSON had a null Git field because Git rejected this desktop worktree as dubious ownership; HEAD has not changed since capture).
- **Working tree at capture:** dirty (SQLite work was uncommitted; the baseline also included an unrelated staged CSS change).
- **Machine:** win32 10.0.26300, x64; 12th Gen Intel(R) Core(TM) i5-12450H; 12 logical CPUs.
- **Runtime:** Node.js v26.12.0; SQLite 3.52.0.
- **Fixture:** `.work/performance/sqlite-wal-full-v2/app.db` (1,000 deterministic synthetic rows per table; app, identity, and key DBs).
- **Workload configuration:** 5 runs × 100 measured iterations, 10 warmups per run; 500 samples per workload.
- **SQLite mode:** WAL/FULL.

### PRAGMAs

- **app:** journal_mode=wal; synchronous=FULL (2); busy_timeout=5000 ms; cache_size=-2000; foreign_keys=1; temp_store=2.
- **identity:** journal_mode=wal; synchronous=FULL (2); busy_timeout=5000 ms; cache_size=-2000; foreign_keys=1; temp_store=2.
- **keys:** journal_mode=wal; synchronous=FULL (2); busy_timeout=5000 ms; cache_size=-2000; foreign_keys=1; temp_store=2.

## Results

Times are milliseconds per operation. Percentiles use nearest-rank; SD is sample standard deviation; CV is coefficient of variation. Failure counts are included explicitly.

| Workload ID | Name | Parameters | Mean ms | Median ms | P90 ms | P95 ms | P99 ms | SD ms | CV % | Throughput ops/s | Samples | Failures |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| sqlite.users.indexed-read | Indexed user lookup | rows=1000, table=users, index=UNIQUE(hashed_usid) | 0.1565 | 0.1304 | 0.2422 | 0.3257 | 0.7270 | 0.1470 | 93.93 | 6390.65 | 500 | 0 |
| sqlite.users.insert-delete | Application-table insert (delete cleanup excluded) | rows=1000, table=users | 1.3570 | 1.0983 | 2.3567 | 2.9359 | 5.0181 | 0.8924 | 65.76 | 736.94 | 500 | 0 |
| sqlite.users.update | Application-table indexed update | rows=1000, table=users | 0.1320 | 0.1015 | 0.2501 | 0.3303 | 0.5648 | 0.1038 | 78.62 | 7574.11 | 500 | 0 |
| sqlite.mailbox.enqueue | Mailbox enqueue | rows=1000, table=mailbox | 1.1224 | 0.9992 | 1.7959 | 2.2080 | 2.7053 | 0.5197 | 46.30 | 890.91 | 500 | 0 |
| sqlite.mailbox.dequeue | Mailbox dequeue | rows=1000, table=mailbox | 1.0522 | 0.9697 | 1.7200 | 2.0660 | 2.3932 | 0.4413 | 41.94 | 950.41 | 500 | 0 |
| sqlite.mailbox.flush-select-delete | Mailbox flush: ordered SELECT then DELETE | rows=1000, table=mailbox, path=previous, queuedMessages=1 | 1.5329 | 1.3344 | 2.6002 | 2.8691 | 3.4212 | 0.7307 | 47.67 | 652.36 | 500 | 0 |
| sqlite.mailbox.flush-delete-returning | Mailbox flush: BEGIN IMMEDIATE and DELETE RETURNING | rows=1000, table=mailbox, path=optimized, queuedMessages=1 | 1.6423 | 1.4496 | 2.6342 | 2.9650 | 3.7601 | 0.7215 | 43.93 | 608.90 | 500 | 0 |
| sqlite.mailbox.flush-select-delete | Mailbox flush: ordered SELECT then DELETE | rows=1000, table=mailbox, path=previous, queuedMessages=5 | 2.4359 | 1.4778 | 3.1653 | 6.4917 | 22.2313 | 4.0285 | 165.38 | 410.53 | 500 | 0 |
| sqlite.mailbox.flush-delete-returning | Mailbox flush: BEGIN IMMEDIATE and DELETE RETURNING | rows=1000, table=mailbox, path=optimized, queuedMessages=5 | 1.7537 | 1.5690 | 2.8568 | 3.2243 | 3.9518 | 0.7588 | 43.27 | 570.23 | 500 | 0 |
| sqlite.mailbox.flush-select-delete | Mailbox flush: ordered SELECT then DELETE | rows=1000, table=mailbox, path=previous, queuedMessages=10 | 1.6416 | 1.4423 | 2.6863 | 3.1324 | 3.8605 | 0.8630 | 52.57 | 609.15 | 500 | 0 |
| sqlite.mailbox.flush-delete-returning | Mailbox flush: BEGIN IMMEDIATE and DELETE RETURNING | rows=1000, table=mailbox, path=optimized, queuedMessages=10 | 1.8004 | 1.6281 | 2.8279 | 3.2510 | 4.0507 | 0.8249 | 45.82 | 555.45 | 500 | 0 |
| sqlite.mailbox.expiry-cleanup | Expired mailbox cleanup | rows=1000, table=mailbox, ttlDays=7 | 1.1045 | 0.9823 | 1.7836 | 2.0628 | 2.6135 | 0.4666 | 42.25 | 905.38 | 500 | 0 |
| sqlite.users.concurrent-reads-8 | Eight concurrent indexed reads | rows=1000, concurrency=8, table=users | 0.5501 | 0.4080 | 1.0725 | 1.4108 | 2.5297 | 0.4613 | 83.86 | 1817.84 | 500 | 0 |
| sqlite.users.competing-writes-3 | Three competing inserts (serialized by SQLite) | rows=1000, concurrency=3, table=users | 2.7506 | 2.6743 | 3.7577 | 3.9537 | 4.5176 | 0.8198 | 29.81 | 363.56 | 500 | 0 |

## Interpretation notes

- All rows use isolated synthetic fixtures and are not production measurements.
- The user-update workload repeatedly applies one constant JSON assignment to one indexed synthetic row; the SQL definition is unchanged across configurations and is not representative of a changing user record.
- The insert workload times only the `INSERT`; its cleanup `DELETE` runs in the benchmark engine’s `after` callback outside the timed interval.
- WAL/NORMAL is a benchmark-only durability data point and is not a production setting.
