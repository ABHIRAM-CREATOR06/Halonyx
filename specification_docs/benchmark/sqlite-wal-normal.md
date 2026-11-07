# SQLite benchmark summary — WAL + NORMAL (benchmark-only)

> Trimmed summary only; raw timing arrays are intentionally excluded.

## Provenance

- **Started (UTC):** 2026-11-06T11:48:28.774Z
- **Git commit at capture:** `f94afad8b6964633b9ece63479be371afeb4176e` (verified post hoc; raw JSON had a null Git field because Git rejected this desktop worktree as dubious ownership; HEAD has not changed since capture).
- **Working tree at capture:** dirty (SQLite work was uncommitted; the baseline also included an unrelated staged CSS change).
- **Machine:** win32 10.0.26300, x64; 12th Gen Intel(R) Core(TM) i5-12450H; 12 logical CPUs.
- **Runtime:** Node.js v26.12.0; SQLite 3.52.0.
- **Fixture:** `.work/performance/sqlite-wal-normal/app.db` (1,000 deterministic synthetic rows per table; app, identity, and key DBs).
- **Workload configuration:** 5 runs × 100 measured iterations, 10 warmups per run; 500 samples per workload.
- **SQLite mode:** WAL/NORMAL.

### PRAGMAs

- **app:** journal_mode=wal; synchronous=NORMAL (1); busy_timeout=5000 ms; cache_size=-2000; foreign_keys=1; temp_store=2.
- **identity:** journal_mode=wal; synchronous=NORMAL (1); busy_timeout=5000 ms; cache_size=-2000; foreign_keys=1; temp_store=2.
- **keys:** journal_mode=wal; synchronous=NORMAL (1); busy_timeout=5000 ms; cache_size=-2000; foreign_keys=1; temp_store=2.

## Results

Times are milliseconds per operation. Percentiles use nearest-rank; SD is sample standard deviation; CV is coefficient of variation. Failure counts are included explicitly.

| Workload ID | Name | Parameters | Mean ms | Median ms | P90 ms | P95 ms | P99 ms | SD ms | CV % | Throughput ops/s | Samples | Failures |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| sqlite.users.indexed-read | Indexed user lookup | rows=1000, table=users, index=UNIQUE(hashed_usid) | 0.1976 | 0.1494 | 0.3084 | 0.4566 | 1.1345 | 0.1905 | 96.40 | 5059.62 | 500 | 0 |
| sqlite.users.insert-delete | Application-table insert (delete cleanup excluded) | rows=1000, table=users | 0.3675 | 0.2071 | 0.6501 | 1.1827 | 3.2744 | 0.6317 | 171.86 | 2720.83 | 500 | 0 |
| sqlite.users.update | Application-table indexed update | rows=1000, table=users | 0.2695 | 0.1375 | 0.4014 | 1.0194 | 3.7872 | 0.5817 | 215.90 | 3711.25 | 500 | 0 |
| sqlite.mailbox.enqueue | Mailbox enqueue | rows=1000, table=mailbox | 0.2157 | 0.1725 | 0.3768 | 0.4817 | 0.6924 | 0.2230 | 103.39 | 4635.83 | 500 | 0 |
| sqlite.mailbox.dequeue | Mailbox dequeue | rows=1000, table=mailbox | 0.1902 | 0.1369 | 0.3325 | 0.4800 | 1.0088 | 0.1867 | 98.17 | 5258.02 | 500 | 0 |
| sqlite.mailbox.flush-select-delete | Mailbox flush: ordered SELECT then DELETE | rows=1000, table=mailbox, path=previous | 0.4653 | 0.3592 | 0.8295 | 1.1450 | 2.0741 | 0.3827 | 82.25 | 2149.24 | 500 | 0 |
| sqlite.mailbox.flush-delete-returning | Mailbox flush: BEGIN IMMEDIATE and DELETE RETURNING | rows=1000, table=mailbox, path=optimized | 0.5181 | 0.3778 | 1.0436 | 1.4441 | 1.8564 | 0.3989 | 76.99 | 1930.14 | 500 | 0 |
| sqlite.mailbox.expiry-cleanup | Expired mailbox cleanup | rows=1000, table=mailbox, ttlDays=7 | 0.1337 | 0.0973 | 0.2278 | 0.3557 | 0.5817 | 0.1073 | 80.29 | 7480.98 | 500 | 0 |
| sqlite.users.concurrent-reads-8 | Eight concurrent indexed reads | rows=1000, concurrency=8, table=users | 0.5281 | 0.4446 | 0.9210 | 1.2023 | 2.2205 | 0.4083 | 77.31 | 1893.57 | 500 | 0 |
| sqlite.users.competing-writes-3 | Three competing inserts (serialized by SQLite) | rows=1000, concurrency=3, table=users | 0.4595 | 0.3432 | 0.6666 | 0.8911 | 4.7882 | 0.6133 | 133.47 | 2176.29 | 500 | 0 |

## Interpretation notes

- All rows use isolated synthetic fixtures and are not production measurements.
- The user-update workload repeatedly applies one constant JSON assignment to one indexed synthetic row; the SQL definition is unchanged across configurations and is not representative of a changing user record.
- The insert workload times only the `INSERT`; its cleanup `DELETE` runs in the benchmark engine’s `after` callback outside the timed interval.
- WAL/NORMAL is a benchmark-only durability data point and is not a production setting.
