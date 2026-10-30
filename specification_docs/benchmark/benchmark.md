# Halonyx Benchmark Report

Cross-platform warm performance of 12 Halonyx workloads. All latency values are measured medians from recorded benchmark runs, not hardware-normalized estimates. Lower is better.

## Key findings

- Apple M3 has the lowest median in **8 of 12** workloads. WSL2 on the i5-12450H is lowest in the other four: X3DH responder, SQLite indexed read, and both WebSocket ACK tests.
- The Intel i3-4005U is the slowest environment in 11 of 12 workloads, up to 9.8x slower than native i5 (WebSocket ACK, 1 client). On SQLite mailbox enqueue the Ryzen 7 is slightly slower.
- WSL2 beats native Windows on the same CPU for SQLite, WebSocket and X3DH responder, despite seeing only 2 of 12 logical CPUs. SQLite indexed read is 88.90 µs in WSL2 versus 336.1 µs native. This needs a controlled rerun before anyone attributes a cause.
- Highest value in the warm table: group fan-out on i3-4005U, 28,837 µs. Lowest: DLP clean scan on Apple M3, 14 µs.

## 1. Environments

| Environment | CPU | Mode | Node.js | Logical CPUs | Role |
|---|---|---|---|---|---|
| Apple M3 | Apple M3 | macOS, native | v24.22.2 | 8 | Comparative reference (user-reported metadata) |
| Intel i5 | 12th Gen Core i5-12450H | Windows, native | v26.12.0 | 12 (host) | Primary development reference |
| AMD Ryzen 7 | Ryzen 7 7445HS | Windows, native | v24.19.0 | 12 | Modern x86 comparison |
| Intel i3 | Core i3-4005U | Windows, native | v24.22.1 | 4 | Legacy low-end reference |
| WSL2 | i5-12450H host | Linux x64 guest | v26.13.0 | 2 (guest) | Same CPU as native i5, 2 of 12 threads visible |

## 2. Median latency (µs)

The fastest value in each row is bold.

| # | Workload | Apple M3 | Intel i5 | AMD Ryzen 7 | Intel i3 | WSL2 (i5) |
|--:|---|--:|--:|--:|--:|--:|
| 1 | X25519 key generation | **40** | 60.4 | 128.15 | 344.1 | 74.44 |
| 2 | X3DH initiation | **310** | 467.2 | 880.85 | 2,436 | 488.51 |
| 3 | X3DH response | 290 | 436.45 | 478.9 | 1,187 | **254.35** |
| 4 | Double Ratchet encrypt, 1 KiB | **62.5** | 92.75 | 212.55 | 594.65 | 132.25 |
| 5 | Double Ratchet decrypt, 1 KiB | **56** | 81.3 | 215.4 | 591.7 | 130.29 |
| 6 | DLP scan, clean 10 KiB, 10 rules | **14** | 20.66 | 41.03 | 101.58 | 19.23 |
| 7 | Group fan-out, 49 recipients | **3,750** | 9,473 | 11,223 | 28,837 | 10,923 |
| 8 | SQLite indexed read, 1,000 rows | 200 | 336.1 | 356.45 | 802.45 | **88.90** |
| 9 | SQLite mailbox enqueue, 1,000 rows | **900** | 6,193 | 6,829 | 6,690 | 4,124 |
| 10 | WebSocket ACK, 1 client | 51.5 | 68.05 | 351 | 665.25 | **38.21** |
| 11 | WebSocket ACK, 5 clients | 117.5 | 171.45 | 764.2 | 1,384 | **92.13** |
| 12 | End-to-end local pipeline | **280** | 419.3 | 1,294 | 2,446 | 449.96 |

## 3. Relative to native i5

Each value is the environment's median divided by the native i5 median. Below 1.00x is faster than native i5.

| # | Workload | Apple M3 | AMD Ryzen 7 | Intel i3 | WSL2 (i5) |
|--:|---|--:|--:|--:|--:|
| 1 | X25519 key generation | 0.66x | 2.12x | 5.70x | 1.23x |
| 2 | X3DH initiation | 0.66x | 1.89x | 5.21x | 1.05x |
| 3 | X3DH response | 0.66x | 1.10x | 2.72x | 0.58x |
| 4 | Double Ratchet encrypt | 0.67x | 2.29x | 6.41x | 1.43x |
| 5 | Double Ratchet decrypt | 0.69x | 2.65x | 7.28x | 1.60x |
| 6 | DLP scan, clean | 0.68x | 1.99x | 4.92x | 0.93x |
| 7 | Group fan-out | 0.40x | 1.18x | 3.04x | 1.15x |
| 8 | SQLite indexed read | 0.60x | 1.06x | 2.39x | 0.26x |
| 9 | SQLite mailbox enqueue | 0.15x | 1.10x | 1.08x | 0.67x |
| 10 | WebSocket ACK, 1 client | 0.76x | 5.16x | 9.78x | 0.56x |
| 11 | WebSocket ACK, 5 clients | 0.69x | 4.46x | 8.07x | 0.54x |
| 12 | End-to-end local pipeline | 0.67x | 3.09x | 5.83x | 1.07x |

## 4. Reading the results

| Environment | What the data shows | Qualification |
|---|---|---|
| Apple M3 | Lowest median in 8 of 12 workloads, roughly 0.6x to 0.7x of native i5 on crypto and pipeline tests | Does not show Halonyx is tuned for Apple Silicon. Metadata is user-reported |
| Intel i5, native | Main development reference | Node.js v26.12.0 |
| AMD Ryzen 7 | Close to native i5 on X3DH response, SQLite and group fan-out. Roughly 2x slower on key generation, ratchet and DLP. 3x to 5x slower on WebSocket and pipeline tests | Results are specific to this machine and run. Node.js v24.19.0 |
| Intel i3 | Legacy low-end reference, slowest in 11 of 12 workloads | Useful for judging constrained hardware |
| WSL2 | Same physical CPU as native i5, faster on SQLite, WebSocket and X3DH response, slower on ratchet and key generation | Only 2 logical CPUs visible. Node.js v26.13.0 differs from native v26.12.0 |

## 5. Workload definitions

| Benchmark | Parameters |
|---|---|
| `crypto.x25519.keygen` | X25519 key generation |
| `crypto.x3dh.initiator` | X3DH session initiation |
| `crypto.x3dh.responder` | X3DH session response |
| `crypto.double-ratchet.encrypt` | 1,024-byte payload |
| `crypto.double-ratchet.decrypt` | 1,024-byte payload |
| `dlp.scan.clean` | 10,240-byte input, 10 built-in rules |
| `group.pairwise-fanout` | Group size 50, 49 recipients, 128-byte payload, relay excluded |
| `sqlite.users.indexed-read` | 1,000 rows, unique `hashed_usid` index |
| `sqlite.mailbox.enqueue` | 1,000 rows |
| `websocket.loopback.ack` | 1 and 5 concurrent clients, 1,024-byte payload |
| `pipeline.local-loopback-e2e` | 45-byte payload |

## 6. Limitations

| Limitation | Why it matters |
|---|---|
| Runtime versions differ | Native i5 used Node.js v26.12.0 and WSL2 used v26.13.0, while Ryzen 7 (v24.19.0), M3 (v24.22.2) and i3 (v24.22.1) used the v24 line. Runtime differences can affect results |
| WSL2 CPU allocation | WSL2 sees 2 logical CPUs while the host has 12. This can affect workloads that benefit from parallelism |
| WSL2 filesystem and virtualization | Filesystem location, virtualization and resource configuration may affect results. The data alone does not prove the cause of any individual difference |
| SQLite fixtures | Application schemas with deterministic synthetic data, not production database measurements |
| Loopback networking | WebSocket and pipeline tests use a single-process loopback harness. They do not represent remote relay or Internet latency |
| Pipeline scope | Starts before DLP scanning and ends after recipient decryption, envelope validation and acknowledgement. Browser painting and relay authentication are excluded |
| Statistical variation | Median is used because some measurements have high variation. The detailed WSL2 report includes mean, percentiles, SD/CV, throughput and run information |

These are the values in the supplied comparison report. The underlying runs do not all share identical runtime versions or documented configurations, so treat cross-machine differences as observed comparisons, not perfectly controlled CPU-only comparisons.

---

*Halonyx. Private by design. Measured in practice.*