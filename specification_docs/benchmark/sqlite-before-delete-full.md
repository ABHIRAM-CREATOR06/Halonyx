# SQLite benchmark summary — Baseline — DELETE + FULL

> Trimmed summary only; raw timing arrays are intentionally excluded.

## Provenance

- **Started (UTC):** 2026-11-06T11:22:10.298Z
- **Git commit at capture:** `f94afad8b6964633b9ece63479be371afeb4176e` (verified post hoc; raw JSON had a null Git field because Git rejected this desktop worktree as dubious ownership; HEAD has not changed since capture).
- **Working tree at capture:** dirty (SQLite work was uncommitted; the baseline also included an unrelated staged CSS change).
- **Machine:** win32 10.0.26300, x64; 12th Gen Intel(R) Core(TM) i5-12450H; 12 logical CPUs.
- **Runtime:** Node.js v26.12.0; SQLite 3.52.0.
- **Fixture:** `.work/performance/sqlite-baseline/app.db` (1,000 deterministic synthetic rows per table; app, identity, and key DBs).
- **Workload configuration:** 5 runs × 100 measured iterations, 10 warmups per run; 500 samples per workload.
- **SQLite mode:** DELETE/FULL.

### PRAGMAs

- **app:** journal_mode=delete; synchronous=FULL (2); busy_timeout=0 ms (SQLite default; not explicitly set); cache_size=-2000; foreign_keys=1; temp_store=2.
- **identity:** journal_mode=delete; synchronous=FULL (2); busy_timeout=0 ms (SQLite default; not explicitly set); cache_size=-2000; foreign_keys=1; temp_store=2.
- **keys:** journal_mode=delete; synchronous=FULL (2); busy_timeout=0 ms (SQLite default; not explicitly set); cache_size=-2000; foreign_keys=1; temp_store=2.

## Results

Times are milliseconds per operation. Percentiles use nearest-rank; SD is sample standard deviation; CV is coefficient of variation. Failure counts are included explicitly.

| Workload ID | Name | Parameters | Mean ms | Median ms | P90 ms | P95 ms | P99 ms | SD ms | CV % | Throughput ops/s | Samples | Failures |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| sqlite.users.indexed-read | Indexed user lookup | rows=1000, table=users, index=UNIQUE(hashed_usid) | 0.1610 | 0.1483 | 0.2330 | 0.2638 | 0.3493 | 0.0595 | 36.96 | 6211.41 | 500 | 0 |
| sqlite.users.insert-delete | Application-table insert (delete cleanup excluded) | rows=1000, table=users | 21.6942 | 5.9713 | 68.4787 | 88.7184 | 125.2719 | 30.1916 | 139.17 | 46.10 | 500 | 0 |
| sqlite.users.update | Application-table indexed update | rows=1000, table=users | 21.7091 | 18.7219 | 38.3796 | 47.6451 | 65.1684 | 18.3048 | 84.32 | 46.06 | 500 | 0 |
| sqlite.mailbox.enqueue | Mailbox enqueue | rows=1000, table=mailbox | 14.7289 | 5.0893 | 52.6651 | 70.7862 | 96.6844 | 23.3873 | 158.79 | 67.89 | 500 | 0 |
| sqlite.mailbox.dequeue | Mailbox dequeue | rows=1000, table=mailbox | 7.2962 | 4.6622 | 6.3484 | 7.1535 | 88.6676 | 16.0312 | 219.72 | 137.06 | 500 | 0 |
| sqlite.mailbox.expiry-cleanup | Expired mailbox cleanup | rows=1000, table=mailbox, ttlDays=7 | 5.2855 | 4.4105 | 5.6978 | 6.2315 | 18.0424 | 9.2148 | 174.34 | 189.20 | 500 | 0 |
| sqlite.users.concurrent-reads-8 | Eight concurrent indexed reads | rows=1000, concurrency=8, table=users | 0.6292 | 0.5364 | 1.0237 | 1.2435 | 2.1954 | 0.4168 | 66.23 | 1589.24 | 500 | 0 |
| sqlite.users.competing-writes-3 | Three competing inserts (serialized by SQLite) | rows=1000, concurrency=3, table=users | 25.3696 | 13.5484 | 62.2733 | 89.5185 | 126.7740 | 26.1485 | 103.07 | 39.42 | 500 | 0 |

## Interpretation notes

- All rows use isolated synthetic fixtures and are not production measurements.
- The user-update workload repeatedly applies one constant JSON assignment to one indexed synthetic row; the SQL definition is unchanged across configurations and is not representative of a changing user record.
- The insert workload times only the `INSERT`; its cleanup `DELETE` runs in the benchmark engine’s `after` callback outside the timed interval.
- WAL/NORMAL is a benchmark-only durability data point and is not a production setting.
