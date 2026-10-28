The output records 5 runs and 500 measured operations per benchmark. The runner uses 20 warm-up iterations and 100 measured iterations per run. Batched workloads report averaged samples.

| Environment | Value |
|---|---|
| Node.js | v26.12.0 |
| Platform | win32/x64 |
| CPU | 12th Gen Intel(R) Core(TM) i5-12450H |
| Logical CPUs | 12 |
| SQLite | 3.52.0 |
| Synthetic fixture rows | 1,000 per table |
| Benchmark database size | 905,216 bytes |
| Git commit | 4dd7a3cd705f503bd704934360525c553efaa756 |
| Working tree at measurement | Dirty |

## Results

Times are milliseconds or microseconds as shown. Percentiles use nearest-rank. SD/CV are sample standard deviation and coefficient of variation. Round mean range is the minimum and maximum mean across runs.

### crypto (17 benchmarks)

| Benchmark / parameters | Mean | Median | P50 / P90 / P95 / P99 | Min / max | Round mean range | SD / CV | Throughput | Samples | Operations / failures | Runs / timed |
|---|---:|---:|---|---|---|---|---:|---|---|---|
| crypto.x25519.keygen · — | 70.33 µs | 61.60 µs | 61.60 µs / 93.40 µs / 105.20 µs / 129.10 µs | 53.80 µs / 949.20 µs | 62.80 µs / 84.23 µs | 42.77 µs / 60.82% | 14219.65 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 35.163 ms |
| crypto.x25519.derive · peerKeyBytes=32 | 59.33 µs | 55.50 µs | 55.50 µs / 65.60 µs / 80.30 µs / 109.30 µs | 45.80 µs / 489.30 µs | 57.49 µs / 61.52 µs | 22.77 µs / 38.38% | 16854.48 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 29.666 ms |
| crypto.ed25519.keygen · — | 66.05 µs | 60.70 µs | 60.70 µs / 71.00 µs / 81.20 µs / 127.10 µs | 54.90 µs / 807.20 µs | 61.22 µs / 70.84 µs | 39.74 µs / 60.17% | 15139.54 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 33.026 ms |
| crypto.ed25519.sign · inputBytes=33 | 54.89 µs | 52.40 µs | 52.40 µs / 58.10 µs / 65.80 µs / 102.30 µs | 44.90 µs / 212.90 µs | 53.46 µs / 58.87 µs | 11.96 µs / 21.80% | 18217.92 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 27.446 ms |
| crypto.ed25519.verify · inputBytes=33 | 132.53 µs | 122.30 µs | 122.30 µs / 149.70 µs / 176.20 µs / 339.60 µs | 110.50 µs / 578.90 µs | 125.45 µs / 140.14 µs | 38.67 µs / 29.18% | 7545.68 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 66.263 ms |
| crypto.hkdf-sha256 · ikmBytes=32, saltBytes=32, infoBytes=10, outputBytes=32 | 35.98 µs | 32.70 µs | 32.70 µs / 43.30 µs / 53.80 µs / 90.00 µs | 20.30 µs / 216.00 µs | 34.39 µs / 39.25 µs | 14.57 µs / 40.49% | 27794.92 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 17.989 ms |
| crypto.x3dh.key-bundle · — | 243.01 µs | 229.70 µs | 229.70 µs / 261.80 µs / 304.50 µs / 395.70 µs | 205.90 µs / 1.087 ms | 239.18 µs / 248.93 µs | 58.32 µs / 24.00% | 4115.11 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 121.503 ms |
| crypto.x3dh.initiator · — | 425.75 µs | 382.90 µs | 382.90 µs / 502.10 µs / 552.30 µs / 1.004 ms | 370.40 µs / 3.510 ms | 407.50 µs / 460.05 µs | 201.56 µs / 47.34% | 2348.81 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 212.874 ms |
| crypto.x3dh.responder · — | 210.74 µs | 195.25 µs | 195.20 µs / 231.30 µs / 268.80 µs / 434.00 µs | 178.60 µs / 1.256 ms | 204.84 µs / 223.37 µs | 67.76 µs / 32.15% | 4745.22 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 105.369 ms |
| crypto.double-ratchet.encrypt · payloadBytes=0 | 104.80 µs | 94.55 µs | 94.50 µs / 132.70 µs / 166.30 µs / 233.20 µs | 57.40 µs / 863.90 µs | 91.75 µs / 114.63 µs | 47.02 µs / 44.87% | 9541.60 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 52.402 ms |
| crypto.double-ratchet.decrypt · payloadBytes=0 | 95.23 µs | 87.00 µs | 87.00 µs / 104.60 µs / 118.40 µs / 182.30 µs | 64.50 µs / 1.031 ms | 87.90 µs / 98.82 µs | 56.72 µs / 59.56% | 10501.16 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 47.614 ms |
| crypto.double-ratchet.encrypt · payloadBytes=1024 | 125.50 µs | 92.70 µs | 92.50 µs / 201.00 µs / 231.20 µs / 383.40 µs | 67.40 µs / 1.570 ms | 95.69 µs / 148.76 µs | 99.47 µs / 79.25% | 7967.96 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 62.751 ms |
| crypto.double-ratchet.decrypt · payloadBytes=1024 | 160.34 µs | 132.15 µs | 132.10 µs / 231.20 µs / 264.60 µs / 345.90 µs | 85.20 µs / 5.464 ms | 119.02 µs / 233.98 µs | 248.31 µs / 154.86% | 6236.80 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 80.169 ms |
| crypto.double-ratchet.encrypt · payloadBytes=10240 | 183.28 µs | 161.50 µs | 160.30 µs / 265.50 µs / 299.80 µs / 369.40 µs | 90.90 µs / 3.290 ms | 129.83 µs / 216.65 µs | 162.50 µs / 88.66% | 5456.09 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 91.641 ms |
| crypto.double-ratchet.decrypt · payloadBytes=10240 | 175.25 µs | 160.65 µs | 160.60 µs / 257.90 µs / 286.60 µs / 371.00 µs | 90.00 µs / 1.561 ms | 167.76 µs / 192.79 µs | 94.12 µs / 53.71% | 5706.10 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 87.626 ms |
| crypto.double-ratchet.encrypt · payloadBytes=102400 | 355.25 µs | 317.05 µs | 316.70 µs / 464.60 µs / 591.60 µs / 1.060 ms | 180.40 µs / 3.107 ms | 295.64 µs / 466.95 µs | 205.48 µs / 57.84% | 2814.93 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 177.624 ms |
| crypto.double-ratchet.decrypt · payloadBytes=102400 | 258.13 µs | 215.25 µs | 215.20 µs / 359.20 µs / 460.20 µs / 680.50 µs | 159.50 µs / 2.217 ms | 220.11 µs / 273.18 µs | 153.44 µs / 59.44% | 3873.94 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 129.067 ms |

### envelope (10 benchmarks)

| Benchmark / parameters | Mean | Median | P50 / P90 / P95 / P99 | Min / max | Round mean range | SD / CV | Throughput | Samples | Operations / failures | Runs / timed |
|---|---:|---:|---|---|---|---|---:|---|---|---|
| envelope.create.basic · optionalFields=false, bodyBytes=32 | 4.54 µs | 4.39 µs | 4.13 µs / 5.38 µs / 6.60 µs / 6.60 µs | 3.69 µs / 6.60 µs | 3.92 µs / 5.65 µs | 0.90 µs / 19.78% | 220147.94 ops/s | 10 (average of 50 operations) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 2.271 ms |
| envelope.create.reply-group · optionalFields=true, members=3 | 4.98 µs | 4.37 µs | 4.37 µs / 6.91 µs / 6.92 µs / 7.17 µs | 3.95 µs / 7.17 µs | 4.14 µs / 6.54 µs | 1.13 µs / 22.67% | 200875.82 ops/s | 25 (average of 20 operations) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 2.489 ms |
| envelope.json.parse · bodyBytes=0, serializedBytes=89 | 0.47 µs | 0.43 µs | 0.43 µs / 0.44 µs / 0.45 µs / 1.40 µs | 0.41 µs / 1.40 µs | 0.42 µs / 0.63 µs | 0.19 µs / 41.34% | 2137665.67 ops/s | 25 (average of 20 operations) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 233.90 µs |
| envelope.validate · bodyBytes=0, optionalFields=false | 0.54 µs | 0.41 µs | 0.41 µs / 0.69 µs / 0.98 µs / 2.33 µs | 0.39 µs / 2.33 µs | 0.40 µs / 0.82 µs | 0.32 µs / 58.89% | 1858045.34 ops/s | 50 (average of 10 operations) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 269.10 µs |
| envelope.json.parse · bodyBytes=1024, serializedBytes=1113 | 0.92 µs | 0.73 µs | 0.73 µs / 1.41 µs / 1.89 µs / 1.97 µs | 0.69 µs / 1.97 µs | 0.71 µs / 1.45 µs | 0.38 µs / 41.81% | 1090988.44 ops/s | 25 (average of 20 operations) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 458.30 µs |
| envelope.validate · bodyBytes=1024, optionalFields=false | 0.27 µs | 0.23 µs | 0.23 µs / 0.29 µs / 0.44 µs / 0.95 µs | 0.20 µs / 0.95 µs | 0.22 µs / 0.36 µs | 0.14 µs / 52.13% | 3765060.24 ops/s | 50 (average of 10 operations) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 132.80 µs |
| envelope.json.parse · bodyBytes=10000, serializedBytes=10089 | 4.20 µs | 3.89 µs | 3.89 µs / 5.03 µs / 5.24 µs / 7.21 µs | 3.75 µs / 7.21 µs | 3.79 µs / 4.53 µs | 0.75 µs / 17.86% | 238265.43 ops/s | 25 (average of 20 operations) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 2.099 ms |
| envelope.validate · bodyBytes=10000, optionalFields=false | 0.36 µs | 0.22 µs | 0.22 µs / 0.38 µs / 0.39 µs / 3.58 µs | 0.19 µs / 3.58 µs | 0.22 µs / 0.56 µs | 0.52 µs / 144.43% | 2794857.46 ops/s | 50 (average of 10 operations) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 178.90 µs |
| envelope.validate.reply-group · members=3, replySnippetBytes=24 | 0.94 µs | 0.82 µs | 0.82 µs / 1.18 µs / 1.24 µs / 2.65 µs | 0.80 µs / 2.65 µs | 0.82 µs / 1.39 µs | 0.32 µs / 33.92% | 1067008.11 ops/s | 50 (average of 10 operations) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 468.60 µs |
| envelope.normalize.legacy · inputBytes=34 | 9.84 µs | 10.00 µs | 9.84 µs / 12.56 µs / 14.36 µs / 14.36 µs | 6.69 µs / 14.36 µs | 6.95 µs / 13.46 µs | 2.71 µs / 27.55% | 101661.14 ops/s | 10 (average of 50 operations) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 4.918 ms |

### dlp (7 benchmarks)

| Benchmark / parameters | Mean | Median | P50 / P90 / P95 / P99 | Min / max | Round mean range | SD / CV | Throughput | Samples | Operations / failures | Runs / timed |
|---|---:|---:|---|---|---|---|---:|---|---|---|
| dlp.scan.clean · inputBytes=0, builtinRules=10 | 0.46 µs | 0.22 µs | 0.22 µs / 1.10 µs / 1.87 µs / 2.55 µs | 0.19 µs / 2.55 µs | 0.19 µs / 1.26 µs | 0.54 µs / 116.84% | 2159827.21 ops/s | 50 (average of 10 operations) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 231.50 µs |
| dlp.scan.clean · inputBytes=1024, builtinRules=10 | 4.43 µs | 3.96 µs | 3.92 µs / 5.49 µs / 6.03 µs / 7.50 µs | 3.70 µs / 7.50 µs | 3.74 µs / 5.38 µs | 0.84 µs / 19.03% | 225672.50 ops/s | 50 (average of 10 operations) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 2.216 ms |
| dlp.scan.clean · inputBytes=10240, builtinRules=10 | 22.57 µs | 21.69 µs | 21.69 µs / 22.73 µs / 24.23 µs / 53.08 µs | 20.31 µs / 53.08 µs | 21.69 µs / 25.25 µs | 4.50 µs / 19.95% | 44304.64 ops/s | 50 (average of 10 operations) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 11.285 ms |
| dlp.scan.match · inputBytes=39, builtinRules=10, expectedMatch=AWS access key pattern | 3.43 µs | 3.30 µs | 3.30 µs / 4.12 µs / 6.20 µs / 8.97 µs | 2.15 µs / 8.97 µs | 2.99 µs / 3.84 µs | 1.19 µs / 34.60% | 291375.29 ops/s | 50 (average of 10 operations) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 1.716 ms |
| dlp.scan.false-positive-resistant · inputBytes=73, builtinRules=10 | 3.02 µs | 3.01 µs | 3.00 µs / 3.77 µs / 5.54 µs / 6.24 µs | 2.07 µs / 6.24 µs | 2.30 µs / 4.43 µs | 0.93 µs / 30.85% | 330994.31 ops/s | 50 (average of 10 operations) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 1.511 ms |
| dlp.scan.redaction · inputBytes=39, builtinRules=10 | 2.17 µs | 2.09 µs | 2.09 µs / 2.19 µs / 3.04 µs / 3.86 µs | 2.02 µs / 3.86 µs | 2.06 µs / 2.39 µs | 0.32 µs / 14.58% | 461254.61 ops/s | 50 (average of 10 operations) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 1.084 ms |
| dlp.luhn · digits=16 | 0.25 µs | 0.23 µs | 0.23 µs / 0.32 µs / 0.32 µs / 0.32 µs | 0.23 µs / 0.32 µs | 0.23 µs / 0.32 µs | 0.04 µs / 15.72% | 3996802.56 ops/s | 5 (average of 100 operations) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 125.10 µs |

### group (6 benchmarks)

| Benchmark / parameters | Mean | Median | P50 / P90 / P95 / P99 | Min / max | Round mean range | SD / CV | Throughput | Samples | Operations / failures | Runs / timed |
|---|---:|---:|---|---|---|---|---:|---|---|---|
| group.pairwise-fanout · groupSize=2, recipientCount=1, payloadBytes=128, includesRelay=false | 146.86 µs | 119.45 µs | 119.40 µs / 218.10 µs / 259.10 µs / 362.40 µs | 94.40 µs / 1.899 ms | 133.38 µs / 174.71 µs | 103.64 µs / 70.57% | 6809.32 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 73.429 ms |
| group.pairwise-fanout · groupSize=3, recipientCount=2, payloadBytes=128, includesRelay=false | 293.64 µs | 250.70 µs | 250.60 µs / 462.60 µs / 554.30 µs / 678.20 µs | 173.00 µs / 1.209 ms | 252.55 µs / 345.56 µs | 124.27 µs / 42.32% | 3405.52 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 146.821 ms |
| group.pairwise-fanout · groupSize=5, recipientCount=4, payloadBytes=128, includesRelay=false | 461.58 µs | 413.00 µs | 412.60 µs / 599.60 µs / 692.70 µs / 1.057 ms | 349.50 µs / 2.255 ms | 420.03 µs / 503.55 µs | 155.17 µs / 33.62% | 2166.46 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 230.791 ms |
| group.pairwise-fanout · groupSize=10, recipientCount=9, payloadBytes=128, includesRelay=false | 804.83 µs | 771.85 µs | 771.80 µs / 888.20 µs / 998.90 µs / 1.749 ms | 445.90 µs / 2.162 ms | 752.65 µs / 833.67 µs | 175.58 µs / 21.82% | 1242.50 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 402.414 ms |
| group.pairwise-fanout · groupSize=25, recipientCount=24, payloadBytes=128, includesRelay=false | 2.339 ms | 2.132 ms | 2.132 ms / 3.026 ms / 3.463 ms / 4.345 ms | 1.429 ms / 6.995 ms | 2.054 ms / 2.538 ms | 573.64 µs / 24.52% | 427.53 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 1169.508 ms |
| group.pairwise-fanout · groupSize=50, recipientCount=49, payloadBytes=128, includesRelay=false | 4.211 ms | 4.116 ms | 4.115 ms / 4.622 ms / 4.873 ms / 5.248 ms | 3.137 ms / 7.140 ms | 4.143 ms / 4.295 ms | 333.23 µs / 7.91% | 237.48 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 2105.460 ms |

### sqlite (8 benchmarks)

| Benchmark / parameters | Mean | Median | P50 / P90 / P95 / P99 | Min / max | Round mean range | SD / CV | Throughput | Samples | Operations / failures | Runs / timed |
|---|---:|---:|---|---|---|---|---:|---|---|---|
| sqlite.users.indexed-read · rows=1000, table=users, index=UNIQUE(hashed_usid) | 94.70 µs | 86.00 µs | 86.00 µs / 118.20 µs / 139.30 µs / 177.00 µs | 82.00 µs / 226.10 µs | 93.51 µs / 98.30 µs | 20.07 µs / 21.19% | 10560.02 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 47.348 ms |
| sqlite.users.insert-delete · rows=1000, table=users | 3.773 ms | 3.650 ms | 3.650 ms / 5.217 ms / 5.612 ms / 6.438 ms | 2.084 ms / 9.917 ms | 2.988 ms / 4.672 ms | 1.087 ms / 28.80% | 265.04 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 1886.530 ms |
| sqlite.users.update · rows=1000, table=users | 198.21 µs | 126.70 µs | 126.60 µs / 379.70 µs / 529.80 µs / 717.30 µs | 86.30 µs / 3.237 ms | 99.52 µs / 442.42 µs | 195.66 µs / 98.71% | 5045.10 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 99.106 ms |
| sqlite.mailbox.enqueue · rows=1000, table=mailbox | 4.335 ms | 4.265 ms | 4.263 ms / 5.519 ms / 5.874 ms / 7.062 ms | 2.303 ms / 11.334 ms | 3.542 ms / 4.769 ms | 1.040 ms / 24.00% | 230.68 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 2167.468 ms |
| sqlite.mailbox.dequeue · rows=1000, table=mailbox | 3.768 ms | 3.654 ms | 3.651 ms / 4.825 ms / 5.254 ms / 7.072 ms | 2.083 ms / 9.394 ms | 3.502 ms / 4.133 ms | 931.18 µs / 24.71% | 265.38 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 1884.069 ms |
| sqlite.mailbox.expiry-cleanup · rows=1000, table=mailbox, ttlDays=7 | 4.206 ms | 4.125 ms | 4.122 ms / 5.214 ms / 5.672 ms / 6.599 ms | 2.319 ms / 7.535 ms | 3.751 ms / 4.655 ms | 851.30 µs / 20.24% | 237.73 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 2103.192 ms |
| sqlite.users.concurrent-reads-8 · rows=1000, concurrency=8, table=users | 314.34 µs | 275.45 µs | 275.20 µs / 407.00 µs / 446.50 µs / 604.80 µs | 237.10 µs / 3.844 ms | 293.92 µs / 337.23 µs | 213.75 µs / 68.00% | 3181.30 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 157.168 ms |
| sqlite.users.competing-writes-3 · rows=1000, concurrency=3, table=users | 11.530 ms | 11.432 ms | 11.429 ms / 14.293 ms / 15.369 ms / 17.989 ms | 6.648 ms / 38.652 ms | 10.015 ms / 12.492 ms | 2.612 ms / 22.65% | 86.73 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 5765.185 ms |

### websocket (6 benchmarks)

| Benchmark / parameters | Mean | Median | P50 / P90 / P95 / P99 | Min / max | Round mean range | SD / CV | Throughput | Samples | Operations / failures | Runs / timed |
|---|---:|---:|---|---|---|---|---:|---|---|---|
| websocket.loopback.ack · concurrentClients=1, payloadBytes=0, topology=single-process-loopback, completion=recipient parsed payload and acknowledged | 79.99 µs | 72.90 µs | 72.80 µs / 105.80 µs / 122.40 µs / 264.00 µs | 51.60 µs / 386.10 µs | 59.91 µs / 103.69 µs | 34.98 µs / 43.73% | 12502.16 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 39.993 ms |
| websocket.loopback.ack · concurrentClients=1, payloadBytes=1024, topology=single-process-loopback, completion=recipient parsed payload and acknowledged | 88.79 µs | 75.00 µs | 75.00 µs / 103.00 µs / 132.90 µs / 340.00 µs | 53.80 µs / 1.971 ms | 74.66 µs / 101.06 µs | 97.14 µs / 109.40% | 11262.40 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 44.396 ms |
| websocket.loopback.ack · concurrentClients=1, payloadBytes=10240, topology=single-process-loopback, completion=recipient parsed payload and acknowledged | 94.33 µs | 75.60 µs | 75.60 µs / 139.00 µs / 171.40 µs / 317.90 µs | 66.20 µs / 422.10 µs | 80.37 µs / 108.96 µs | 45.01 µs / 47.72% | 10601.51 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 47.163 ms |
| websocket.loopback.ack · concurrentClients=5, payloadBytes=0, topology=single-process-loopback, completion=recipient parsed payload and acknowledged | 278.80 µs | 231.10 µs | 230.60 µs / 407.10 µs / 487.90 µs / 762.40 µs | 169.60 µs / 1.629 ms | 253.71 µs / 344.63 µs | 134.88 µs / 48.38% | 3586.78 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 139.401 ms |
| websocket.loopback.ack · concurrentClients=5, payloadBytes=1024, topology=single-process-loopback, completion=recipient parsed payload and acknowledged | 223.88 µs | 189.70 µs | 189.70 µs / 316.50 µs / 393.60 µs / 562.00 µs | 149.50 µs / 793.80 µs | 189.79 µs / 283.31 µs | 85.95 µs / 38.39% | 4466.69 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 111.940 ms |
| websocket.loopback.ack · concurrentClients=5, payloadBytes=10240, topology=single-process-loopback, completion=recipient parsed payload and acknowledged | 252.55 µs | 225.60 µs | 225.50 µs / 344.40 µs / 426.40 µs / 561.50 µs | 191.20 µs / 647.90 µs | 227.33 µs / 276.39 µs | 73.74 µs / 29.20% | 3959.66 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 126.274 ms |

### pipeline (1 benchmarks)

| Benchmark / parameters | Mean | Median | P50 / P90 / P95 / P99 | Min / max | Round mean range | SD / CV | Throughput | Samples | Operations / failures | Runs / timed |
|---|---:|---:|---|---|---|---|---:|---|---|---|
| pipeline.local-loopback-e2e · payloadBytes=45, topology=single-process-loopback, start=before DLP scan, completion=recipient decrypted and validated envelope, then acknowledged, browserPaintingIncluded=false, relayAuthenticationIncluded=false | 489.30 µs | 394.30 µs | 394.20 µs / 774.20 µs / 1.040 ms / 1.728 ms | 293.20 µs / 2.643 ms | 409.03 µs / 652.03 µs | 270.66 µs / 55.32% | 2043.73 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 244.650 ms |


### cold-start (3 benchmarks)

| Benchmark / parameters | Mean | Median | P50 / P90 / P95 / P99 | Min / max | Round mean range | SD / CV | Throughput | Samples | Operations / failures | Runs / timed |
|---|---:|---:|---|---|---|---|---:|---|---|---|
| cold-start.crypto.x25519.keygen · process=fresh-node-child, includes=node startup, module load, first operation, process exit | 66.497 ms | 66.081 ms | 66.081 ms / 69.152 ms / 69.152 ms / 69.152 ms | 64.526 ms / 69.152 ms | 64.526 ms / 69.152 ms | 1.701 ms / 2.56% | 15.04 ops/s | 5 (operation) | 5/5 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 332.487 ms |
| cold-start.envelope.create · process=fresh-node-child, includes=node startup, module load, first operation, process exit | 66.008 ms | 65.323 ms | 65.323 ms / 69.431 ms / 69.431 ms / 69.431 ms | 63.305 ms / 69.431 ms | 63.305 ms / 69.431 ms | 2.320 ms / 3.52% | 15.15 ops/s | 5 (operation) | 5/5 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 330.038 ms |
| cold-start.dlp.scan · process=fresh-node-child, includes=node startup, module load, first operation, process exit | 72.015 ms | 72.850 ms | 72.850 ms / 75.576 ms / 75.576 ms / 75.576 ms | 66.911 ms / 75.576 ms | 66.911 ms / 75.576 ms | 3.451 ms / 4.79% | 13.89 ops/s | 5 (operation) | 5/5 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 360.073 ms |

## Interpretation notes

- SQLite measurements use the application schemas with deterministic synthetic data; they are not production database measurements.
- WebSocket and pipeline cases use a single-process loopback harness and do not represent remote relay performance.
- Results vary with machine load, runtime version, power state, and filesystem behavior. Re-run on the target environment before comparing or setting capacity targets.