# Halonyx Benchmark Results

> Machine-specific snapshot from the reproducible benchmark runner. Treat these figures as a record of this run, not as general performance guarantees. See [benchmark-guide.md](benchmark-guide.md) for commands, suite scope, and limitations.

## Run details

The output records 5 runs and 500 measured operations per benchmark. The runner default is 20 warm-up iterations and 100 measured iterations per run. Batched workloads report averaged samples; their total measured operation count is still 500. Every benchmark completed all 500 operations successfully, with 0 failures, 0 warm-up failures, and 0 excluded samples.

| Environment | Value |
|---|---|
| Node.js | 26.12.0 |
| Platform | Windows (win32/x64) |
| CPU | 12th Gen Intel(R) Core(TM) i5-12450H |
| Logical CPUs | 12 |
| SQLite | 3.52.0 |
| Synthetic fixture rows | 1,000 per table |
| Benchmark database size | 733,184 bytes |
| Git commit | 2b2b0514514dcb062ba6fcff435172bd432eeaae |
| Working tree at measurement | Dirty |

## Results

Times are milliseconds or microseconds as shown. Percentiles use nearest-rank. SD/CV are sample standard deviation and coefficient of variation. Round mean range is the minimum and maximum mean across the five runs.

### crypto (17 benchmarks)

| Benchmark / parameters | Mean | Median | P50 / P90 / P95 / P99 | Min / max | Round mean range | SD / CV | Throughput | Samples | Operations / failures | Runs / timed |
|---|---:|---:|---|---|---|---|---:|---|---|---|
| crypto.x25519.keygen · — | 101.36 µs | 84.65 µs | 84.60 µs / 143.00 µs / 164.60 µs / 278.60 µs | 54.70 µs / 862.60 µs | 88.06 µs / 115.62 µs | 73.26 µs / 72.28% | 9865.59 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 50.681 ms |
| crypto.x25519.derive · peerKeyBytes=32 | 80.21 µs | 66.45 µs | 66.40 µs / 107.30 µs / 128.80 µs / 247.40 µs | 51.50 µs / 826.50 µs | 71.07 µs / 91.99 µs | 51.77 µs / 64.54% | 12466.93 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 40.106 ms |
| crypto.ed25519.keygen · — | 88.60 µs | 71.00 µs | 71.00 µs / 122.00 µs / 149.00 µs / 320.50 µs | 57.10 µs / 899.40 µs | 78.67 µs / 105.31 µs | 61.06 µs / 68.92% | 11287.14 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 44.298 ms |
| crypto.ed25519.sign · inputBytes=33 | 69.41 µs | 58.20 µs | 58.20 µs / 80.50 µs / 94.80 µs / 148.50 µs | 50.10 µs / 797.00 µs | 67.23 µs / 70.91 µs | 57.61 µs / 82.99% | 14406.69 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 34.706 ms |
| crypto.ed25519.verify · inputBytes=33 | 168.94 µs | 141.50 µs | 141.40 µs / 208.10 µs / 259.20 µs / 807.50 µs | 117.30 µs / 898.00 µs | 162.28 µs / 179.37 µs | 101.19 µs / 59.89% | 5919.26 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 84.470 ms |
| crypto.hkdf-sha256 · ikmBytes=32, saltBytes=32, infoBytes=10, outputBytes=32 | 79.93 µs | 62.80 µs | 62.80 µs / 121.90 µs / 139.40 µs / 296.50 µs | 23.40 µs / 2.653 ms | 50.99 µs / 122.97 µs | 129.50 µs / 162.01% | 12510.16 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 39.967 ms |
| crypto.x3dh.key-bundle · — | 414.96 µs | 371.20 µs | 370.60 µs / 556.00 µs / 617.90 µs / 1.022 ms | 229.70 µs / 4.165 ms | 325.39 µs / 487.92 µs | 247.10 µs / 59.55% | 2409.89 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 207.478 ms |
| crypto.x3dh.initiator · — | 747.98 µs | 703.60 µs | 701.80 µs / 1.017 ms / 1.166 ms / 1.810 ms | 401.50 µs / 3.899 ms | 637.16 µs / 832.91 µs | 306.84 µs / 41.02% | 1336.93 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 373.990 ms |
| crypto.x3dh.responder · — | 349.65 µs | 271.90 µs | 271.60 µs / 585.10 µs / 687.70 µs / 851.20 µs | 201.50 µs / 2.637 ms | 293.69 µs / 392.06 µs | 217.49 µs / 62.20% | 2859.97 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 174.827 ms |
| crypto.double-ratchet.encrypt · payloadBytes=0 | 186.37 µs | 136.60 µs | 136.50 µs / 342.30 µs / 409.60 µs / 638.00 µs | 69.20 µs / 1.305 ms | 162.47 µs / 240.64 µs | 130.07 µs / 69.79% | 5365.81 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 93.183 ms |
| crypto.double-ratchet.decrypt · payloadBytes=0 | 139.82 µs | 110.90 µs | 110.60 µs / 222.70 µs / 254.60 µs / 357.00 µs | 83.30 µs / 1.334 ms | 115.46 µs / 150.31 µs | 85.16 µs / 60.91% | 7152.20 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 69.909 ms |
| crypto.double-ratchet.encrypt · payloadBytes=1024 | 125.35 µs | 100.85 µs | 100.80 µs / 195.70 µs / 253.80 µs / 331.80 µs | 85.10 µs / 985.20 µs | 107.15 µs / 146.22 µs | 64.61 µs / 51.55% | 7977.80 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 62.674 ms |
| crypto.double-ratchet.decrypt · payloadBytes=1024 | 119.96 µs | 98.00 µs | 98.00 µs / 170.30 µs / 228.80 µs / 290.30 µs | 84.10 µs / 1.093 ms | 102.79 µs / 135.98 µs | 64.65 µs / 53.89% | 8336.03 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 59.981 ms |
| crypto.double-ratchet.encrypt · payloadBytes=10240 | 166.80 µs | 129.85 µs | 129.80 µs / 278.30 µs / 328.30 µs / 406.70 µs | 93.20 µs / 1.539 ms | 128.52 µs / 199.51 µs | 100.31 µs / 60.14% | 5995.18 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 83.400 ms |
| crypto.double-ratchet.decrypt · payloadBytes=10240 | 124.12 µs | 101.95 µs | 101.90 µs / 187.20 µs / 233.60 µs / 312.70 µs | 88.00 µs / 964.80 µs | 107.61 µs / 167.00 µs | 63.09 µs / 50.83% | 8057.00 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 62.058 ms |
| crypto.double-ratchet.encrypt · payloadBytes=102400 | 272.97 µs | 229.15 µs | 229.10 µs / 399.20 µs / 501.00 µs / 734.60 µs | 148.50 µs / 1.695 ms | 229.37 µs / 348.45 µs | 128.19 µs / 46.96% | 3663.40 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 136.485 ms |
| crypto.double-ratchet.decrypt · payloadBytes=102400 | 187.35 µs | 162.50 µs | 162.50 µs / 231.70 µs / 339.20 µs / 486.40 µs | 125.00 µs / 1.519 ms | 176.39 µs / 196.19 µs | 94.33 µs / 50.35% | 5337.51 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 93.677 ms |

### envelope (10 benchmarks)

| Benchmark / parameters | Mean | Median | P50 / P90 / P95 / P99 | Min / max | Round mean range | SD / CV | Throughput | Samples | Operations / failures | Runs / timed |
|---|---:|---:|---|---|---|---|---:|---|---|---|
| envelope.create.basic · optionalFields=false, bodyBytes=32 | 4.07 µs | 3.92 µs | 3.84 µs / 4.69 µs / 4.70 µs / 4.70 µs | 3.71 µs / 4.70 µs | 3.76 µs / 4.27 µs | 0.39 µs / 9.66% | 245531.33 ops/s | 10 (average of 50 operations) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 2.036 ms |
| envelope.create.reply-group · optionalFields=true, members=3 | 4.49 µs | 4.43 µs | 4.43 µs / 4.97 µs / 5.04 µs / 5.05 µs | 3.97 µs / 5.05 µs | 4.43 µs / 4.59 µs | 0.31 µs / 6.94% | 222796.54 ops/s | 25 (average of 20 operations) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 2.244 ms |
| envelope.json.parse · bodyBytes=0, serializedBytes=89 | 0.43 µs | 0.42 µs | 0.42 µs / 0.43 µs / 0.46 µs / 0.75 µs | 0.41 µs / 0.75 µs | 0.41 µs / 0.49 µs | 0.07 µs / 15.15% | 2305209.77 ops/s | 25 (average of 20 operations) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 216.90 µs |
| envelope.validate · bodyBytes=0, optionalFields=false | 0.43 µs | 0.40 µs | 0.40 µs / 0.43 µs / 0.48 µs / 1.62 µs | 0.38 µs / 1.62 µs | 0.39 µs / 0.53 µs | 0.18 µs / 40.99% | 2310536.04 ops/s | 50 (average of 10 operations) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 216.40 µs |
| envelope.json.parse · bodyBytes=1024, serializedBytes=1113 | 0.75 µs | 0.71 µs | 0.71 µs / 0.84 µs / 1.02 µs / 1.13 µs | 0.68 µs / 1.13 µs | 0.71 µs / 0.80 µs | 0.11 µs / 14.17% | 1337255.95 ops/s | 25 (average of 20 operations) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 373.90 µs |
| envelope.validate · bodyBytes=1024, optionalFields=false | 0.25 µs | 0.23 µs | 0.23 µs / 0.24 µs / 0.29 µs / 1.00 µs | 0.21 µs / 1.00 µs | 0.23 µs / 0.31 µs | 0.11 µs / 44.53% | 4048583.00 ops/s | 50 (average of 10 operations) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 123.50 µs |
| envelope.json.parse · bodyBytes=10000, serializedBytes=10089 | 5.36 µs | 4.45 µs | 4.45 µs / 5.38 µs / 5.39 µs / 27.86 µs | 3.73 µs / 27.86 µs | 4.01 µs / 9.37 µs | 4.72 µs / 88.03% | 186699.53 ops/s | 25 (average of 20 operations) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 2.678 ms |
| envelope.validate · bodyBytes=10000, optionalFields=false | 0.24 µs | 0.21 µs | 0.21 µs / 0.23 µs / 0.46 µs / 0.59 µs | 0.20 µs / 0.59 µs | 0.21 µs / 0.27 µs | 0.08 µs / 34.38% | 4212299.92 ops/s | 50 (average of 10 operations) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 118.70 µs |
| envelope.validate.reply-group · members=3, replySnippetBytes=24 | 0.95 µs | 0.85 µs | 0.85 µs / 1.13 µs / 1.33 µs / 2.30 µs | 0.82 µs / 2.30 µs | 0.86 µs / 1.14 µs | 0.25 µs / 26.19% | 1056635.67 ops/s | 50 (average of 10 operations) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 473.20 µs |
| envelope.normalize.legacy · inputBytes=34 | 6.99 µs | 6.49 µs | 6.28 µs / 7.15 µs / 11.29 µs / 11.29 µs | 6.13 µs / 11.29 µs | 6.14 µs / 8.99 µs | 1.56 µs / 22.25% | 142987.87 ops/s | 10 (average of 50 operations) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 3.497 ms |

### dlp (7 benchmarks)

| Benchmark / parameters | Mean | Median | P50 / P90 / P95 / P99 | Min / max | Round mean range | SD / CV | Throughput | Samples | Operations / failures | Runs / timed |
|---|---:|---:|---|---|---|---|---:|---|---|---|
| dlp.scan.clean · inputBytes=0, builtinRules=10 | 0.41 µs | 0.23 µs | 0.23 µs / 1.02 µs / 1.10 µs / 1.98 µs | 0.19 µs / 1.98 µs | 0.22 µs / 1.04 µs | 0.39 µs / 96.93% | 2464268.11 ops/s | 50 (average of 10 operations) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 202.90 µs |
| dlp.scan.clean · inputBytes=1024, builtinRules=10 | 4.21 µs | 3.75 µs | 3.74 µs / 4.77 µs / 5.58 µs / 6.29 µs | 3.67 µs / 6.29 µs | 3.71 µs / 4.97 µs | 0.66 µs / 15.77% | 237484.56 ops/s | 50 (average of 10 operations) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 2.105 ms |
| dlp.scan.clean · inputBytes=10240, builtinRules=10 | 21.61 µs | 21.38 µs | 21.38 µs / 22.07 µs / 22.66 µs / 25.61 µs | 21.02 µs / 25.61 µs | 21.31 µs / 21.99 µs | 0.72 µs / 3.34% | 46271.45 ops/s | 50 (average of 10 operations) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 10.806 ms |
| dlp.scan.match · inputBytes=39, builtinRules=10, expectedMatch=AWS access key pattern | 3.03 µs | 3.26 µs | 3.26 µs / 3.40 µs / 3.70 µs / 5.09 µs | 2.18 µs / 5.09 µs | 2.22 µs / 3.48 µs | 0.60 µs / 19.83% | 330512.96 ops/s | 50 (average of 10 operations) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 1.513 ms |
| dlp.scan.false-positive-resistant · inputBytes=73, builtinRules=10 | 3.22 µs | 3.20 µs | 3.19 µs / 3.86 µs / 4.67 µs / 11.69 µs | 2.07 µs / 11.69 µs | 2.30 µs / 4.72 µs | 1.44 µs / 44.63% | 310790.65 ops/s | 50 (average of 10 operations) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 1.609 ms |
| dlp.scan.redaction · inputBytes=39, builtinRules=10 | 2.18 µs | 2.11 µs | 2.11 µs / 2.30 µs / 2.56 µs / 3.31 µs | 2.07 µs / 3.31 µs | 2.12 µs / 2.36 µs | 0.22 µs / 10.13% | 458631.44 ops/s | 50 (average of 10 operations) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 1.090 ms |
| dlp.luhn · digits=16 | 0.24 µs | 0.23 µs | 0.23 µs / 0.31 µs / 0.31 µs / 0.31 µs | 0.22 µs / 0.31 µs | 0.22 µs / 0.31 µs | 0.04 µs / 14.64% | 4135649.30 ops/s | 5 (average of 100 operations) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 120.90 µs |

### group (6 benchmarks)

| Benchmark / parameters | Mean | Median | P50 / P90 / P95 / P99 | Min / max | Round mean range | SD / CV | Throughput | Samples | Operations / failures | Runs / timed |
|---|---:|---:|---|---|---|---|---:|---|---|---|
| group.pairwise-fanout · groupSize=2, recipientCount=1, payloadBytes=128 | 105.14 µs | 96.95 µs | 96.90 µs / 123.70 µs / 144.20 µs / 203.00 µs | 89.90 µs / 798.20 µs | 101.02 µs / 109.34 µs | 37.26 µs / 35.44% | 9511.58 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 52.568 ms |
| group.pairwise-fanout · groupSize=3, recipientCount=2, payloadBytes=128 | 217.08 µs | 184.85 µs | 184.80 µs / 248.50 µs / 301.00 µs / 883.30 µs | 151.80 µs / 1.266 ms | 190.96 µs / 273.20 µs | 118.63 µs / 54.65% | 4606.60 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 108.540 ms |
| group.pairwise-fanout · groupSize=5, recipientCount=4, payloadBytes=128 | 470.80 µs | 402.70 µs | 402.40 µs / 630.50 µs / 1.001 ms / 1.288 ms | 318.00 µs / 1.565 ms | 401.96 µs / 524.76 µs | 201.04 µs / 42.70% | 2124.06 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 235.398 ms |
| group.pairwise-fanout · groupSize=10, recipientCount=9, payloadBytes=128 | 1.064 ms | 920.60 µs | 918.40 µs / 1.512 ms / 1.757 ms / 2.422 ms | 757.20 µs / 6.592 ms | 886.47 µs / 1.275 ms | 445.79 µs / 41.90% | 939.96 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 531.936 ms |
| group.pairwise-fanout · groupSize=25, recipientCount=24, payloadBytes=128 | 2.363 ms | 2.157 ms | 2.157 ms / 3.018 ms / 3.484 ms / 3.985 ms | 1.675 ms / 5.153 ms | 2.154 ms / 2.938 ms | 494.20 µs / 20.91% | 423.17 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 1181.548 ms |
| group.pairwise-fanout · groupSize=50, recipientCount=49, payloadBytes=128 | 4.646 ms | 4.520 ms | 4.518 ms / 5.459 ms / 5.854 ms / 6.593 ms | 2.465 ms / 8.230 ms | 4.296 ms / 5.115 ms | 642.84 µs / 13.84% | 215.22 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 2323.242 ms |

### sqlite (8 benchmarks)

| Benchmark / parameters | Mean | Median | P50 / P90 / P95 / P99 | Min / max | Round mean range | SD / CV | Throughput | Samples | Operations / failures | Runs / timed |
|---|---:|---:|---|---|---|---|---:|---|---|---|
| sqlite.users.indexed-read · rows=1000, table=users, index=UNIQUE(hashed_usid) | 100.71 µs | 84.50 µs | 84.50 µs / 125.80 µs / 167.80 µs / 313.70 µs | 76.70 µs / 1.476 ms | 94.89 µs / 104.74 µs | 77.27 µs / 76.73% | 9929.95 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 50.353 ms |
| sqlite.users.insert-delete · rows=1000, table=users | 3.736 ms | 3.523 ms | 3.521 ms / 5.099 ms / 5.503 ms / 7.630 ms | 2.234 ms / 10.498 ms | 2.784 ms / 4.304 ms | 1.128 ms / 30.18% | 267.64 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 1868.207 ms |
| sqlite.users.update · rows=1000, table=users | 162.90 µs | 108.50 µs | 108.50 µs / 326.50 µs / 386.90 µs / 526.90 µs | 84.10 µs / 828.30 µs | 103.74 µs / 232.02 µs | 109.10 µs / 66.97% | 6138.68 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 81.451 ms |
| sqlite.mailbox.enqueue · rows=1000, table=mailbox | 3.878 ms | 3.278 ms | 3.273 ms / 6.237 ms / 6.826 ms / 7.734 ms | 2.120 ms / 14.650 ms | 2.602 ms / 6.094 ms | 1.574 ms / 40.58% | 257.85 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 1939.110 ms |
| sqlite.mailbox.dequeue · rows=1000, table=mailbox | 8.463 ms | 7.802 ms | 7.785 ms / 12.655 ms / 14.243 ms / 17.910 ms | 2.506 ms / 48.388 ms | 4.201 ms / 12.209 ms | 4.231 ms / 50.00% | 118.17 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 4231.348 ms |
| sqlite.mailbox.expiry-cleanup · rows=1000, table=mailbox, ttlDays=7 | 8.956 ms | 9.319 ms | 9.314 ms / 14.131 ms / 15.920 ms / 21.796 ms | 2.639 ms / 24.208 ms | 4.832 ms / 12.809 ms | 4.234 ms / 47.27% | 111.65 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 4478.097 ms |
| sqlite.users.concurrent-reads-8 · rows=1000, concurrency=8, table=users | 556.48 µs | 462.60 µs | 462.10 µs / 803.10 µs / 1.048 ms / 1.688 ms | 279.20 µs / 4.816 ms | 496.50 µs / 709.05 µs | 363.60 µs / 65.34% | 1797.02 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 278.238 ms |
| sqlite.users.competing-writes-3 · rows=1000, concurrency=3, table=users | 11.407 ms | 11.022 ms | 11.008 ms / 14.863 ms / 15.725 ms / 17.605 ms | 6.682 ms / 19.187 ms | 9.933 ms / 12.956 ms | 2.387 ms / 20.93% | 87.66 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 5703.698 ms |

### websocket (6 benchmarks)

| Benchmark / parameters | Mean | Median | P50 / P90 / P95 / P99 | Min / max | Round mean range | SD / CV | Throughput | Samples | Operations / failures | Runs / timed |
|---|---:|---:|---|---|---|---|---:|---|---|---|
| websocket.loopback.ack · concurrentClients=1, payloadBytes=0 | 104.26 µs | 73.50 µs | 73.50 µs / 145.60 µs / 233.60 µs / 439.10 µs | 57.00 µs / 3.184 ms | 70.18 µs / 140.22 µs | 156.74 µs / 150.34% | 9591.81 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 52.128 ms |
| websocket.loopback.ack · concurrentClients=1, payloadBytes=1024 | 83.05 µs | 73.90 µs | 73.90 µs / 101.80 µs / 119.60 µs / 307.30 µs | 61.60 µs / 463.40 µs | 71.81 µs / 90.18 µs | 38.64 µs / 46.53% | 12040.88 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 41.525 ms |
| websocket.loopback.ack · concurrentClients=1, payloadBytes=10240 | 119.58 µs | 101.75 µs | 101.70 µs / 154.30 µs / 198.10 µs / 428.00 µs | 83.70 µs / 748.10 µs | 109.47 µs / 135.12 µs | 60.78 µs / 50.83% | 8362.94 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 59.788 ms |
| websocket.loopback.ack · concurrentClients=5, payloadBytes=0 | 236.45 µs | 212.30 µs | 212.30 µs / 282.20 µs / 326.10 µs / 622.30 µs | 181.60 µs / 1.213 ms | 214.49 µs / 256.18 µs | 96.13 µs / 40.65% | 4229.19 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 118.226 ms |
| websocket.loopback.ack · concurrentClients=5, payloadBytes=1024 | 260.07 µs | 208.45 µs | 208.40 µs / 352.40 µs / 562.40 µs / 923.30 µs | 162.60 µs / 1.397 ms | 241.06 µs / 277.71 µs | 165.75 µs / 63.73% | 3845.12 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 130.035 ms |
| websocket.loopback.ack · concurrentClients=5, payloadBytes=10240 | 326.83 µs | 294.50 µs | 294.40 µs / 391.90 µs / 567.30 µs / 901.80 µs | 234.10 µs / 1.635 ms | 313.02 µs / 333.35 µs | 135.50 µs / 41.46% | 3059.66 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 163.417 ms |

### pipeline (1 benchmarks)

| Benchmark / parameters | Mean | Median | P50 / P90 / P95 / P99 | Min / max | Round mean range | SD / CV | Throughput | Samples | Operations / failures | Runs / timed |
|---|---:|---:|---|---|---|---|---:|---|---|---|
| pipeline.local-loopback-e2e · payloadBytes=45 | 491.59 µs | 421.80 µs | 421.70 µs / 666.80 µs / 858.70 µs / 1.564 ms | 318.40 µs / 2.185 ms | 446.62 µs / 570.17 µs | 233.02 µs / 47.40% | 2034.20 ops/s | 500 (operation) | 500/500 successful; 0 failed, 0 warm-up failures, 0 excluded | 5/5; 245.797 ms |

## Interpretation notes

- SQLite measurements use the application schemas with deterministic synthetic data; they are not production database measurements.
- WebSocket and pipeline cases use a single-process loopback harness. The pipeline measures DLP, envelope handling, Double Ratchet encryption/decryption, validation, and acknowledgement; it excludes browser painting and production relay authentication.
- Results are sensitive to machine load, runtime version, power state, and filesystem behavior. Re-run on the target deployment environment before comparing or setting capacity targets.
