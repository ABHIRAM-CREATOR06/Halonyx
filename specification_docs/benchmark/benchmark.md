# Halonyx Benchmark

## Performance Benchmark

Halonyx was benchmarked across cryptographic, security, database,
networking, and end-to-end workloads. The measurements below report
**median latency in microseconds (µs)**, where lower values indicate
better performance.

The comparison includes:

-   Apple M3
-   Intel Core i5-12450H
-   AMD Ryzen 7 7445HS
-   Intel Core i3-4005U

> **Important:** Although the Apple M3 records the lowest latency across
> the compared systems, Halonyx was not developed or specifically
> optimized for Apple Silicon. The M3 results are included as a
> comparative performance reference rather than evidence of
> platform-specific optimization.

## Benchmark Results

  -----------------------------------------------------------------------------
            \# Benchmark        Apple M3   Intel Core  AMD Ryzen 7   Intel Core
                                    (µs)    i5-12450H  7445HS (µs)     i3-4005U
                                                 (µs)                      (µs)
  ------------ ------------ ------------ ------------ ------------ ------------
             1 X25519 Key             40         60.4       128.15        344.1
               Generation                                          

             2 X3DH Session          310        467.2       880.85        2,436
               Initiation                                          

             3 X3DH Session          290       436.45        478.9        1,187
               Response                                            

             4 Double               62.5        92.75       212.55       594.65
               Ratchet                                             
               Encryption                                          

             5 Double                 56         81.3        215.4        591.7
               Ratchet                                             
               Decryption                                          

             6 DLP Scan               14        20.66        41.03       101.58
               (Clean                                              
               Input)                                              

             7 Group Fanout        3,750        9,473       11,223       28,837

             8 SQLite                200        336.1       356.45       802.45
               Indexed Read                                        

             9 SQLite                900        6,193        6,829        6,690
               Mailbox                                             
               Enqueue                                             

            10 WebSocket            51.5        68.05          351       665.25
               ACK (1                                              
               Client)                                             

            11 WebSocket           117.5       171.45        764.2        1,384
               ACK (5                                              
               Clients)                                            

            12 End-to-End            280        419.3        1,294        2,446
               Pipeline                                            
  -----------------------------------------------------------------------------

## Workload Definitions

  -----------------------------------------------------------------------
  Benchmark                           Recorded workload / parameters
  ----------------------------------- -----------------------------------
  `crypto.x25519.keygen`              key generation

  `crypto.x3dh.initiator`             session initiation

  `crypto.x3dh.responder`             session response

  `crypto.double-ratchet.encrypt`     payloadBytes=1024

  `crypto.double-ratchet.decrypt`     payloadBytes=1024

  `dlp.scan.clean`                    inputBytes=10240; builtinRules=10

  `group.pairwise-fanout`             groupSize=50; recipientCount=49;
                                      payloadBytes=128;
                                      includesRelay=false

  `sqlite.users.indexed-read`         rows=1000;
                                      index=UNIQUE(hashed_usid)

  `sqlite.mailbox.enqueue`            rows=1000

  `websocket.loopback.ack`            concurrentClients=1;
                                      payloadBytes=1024

  `websocket.loopback.ack`            concurrentClients=5;
                                      payloadBytes=1024

  `pipeline.local-loopback-e2e`       payloadBytes=45
  -----------------------------------------------------------------------

## Interpretation

### Apple M3

The Apple M3 has the lowest recorded median latency in all 12 common
benchmark workloads. It provides the strongest raw performance in this
comparison.

These results should not be interpreted as evidence that Halonyx was
optimized for Apple Silicon. The M3 measurements are included as a
cross-platform performance reference.

### Intel Core i5-12450H

The Intel Core i5-12450H provides the primary development and testing
reference in this comparison. It remains substantially faster than the
i3-4005U across most workloads and is relevant for evaluating practical
Halonyx performance on the development environment.

### AMD Ryzen 7 7445HS

The Ryzen 7 7445HS generally performs between the i5-12450H and
i3-4005U. Its results are competitive for several cryptographic
operations but show higher latency than the i5 in a number of database,
networking, and end-to-end workloads.

### Intel Core i3-4005U

The i3-4005U represents a low-end reference system. It records
substantially higher latency across the cryptographic, networking,
group-processing, and end-to-end workloads, making it useful for
evaluating Halonyx behaviour on constrained legacy hardware.

## Benchmark Notes

-   **Group Fanout** measures local processing with relay processing
    excluded.
-   **WebSocket Loopback ACK** uses a single-process loopback
    configuration and does not represent remote-network latency.
-   **End-to-End Pipeline** starts before DLP processing and ends after
    the recipient decrypts, validates the envelope, and acknowledges it.
-   Browser painting and relay authentication are excluded from the
    End-to-End Pipeline measurement.
-   Median latency is used for comparison because some recorded
    benchmarks show relatively high coefficient-of-variation values.
-   The benchmark chart uses a logarithmic scale so that low-latency
    cryptographic operations and higher-latency group/pipeline
    operations remain visible together.

## Performance Summary

Across the recorded workloads, the general performance ordering is:

**Apple M3 → Intel Core i5-12450H → AMD Ryzen 7 7445HS → Intel Core
i3-4005U**

The exact performance gap varies by workload.

The highest recorded latency is the **Group Fanout** benchmark on the
Intel Core i3-4005U at **28,837 µs**. The lowest recorded latency is the
**DLP Scan (Clean Input)** benchmark on the Apple M3 at **14 µs**.

## Reproducibility

The benchmark values in this document are taken from the recorded
Halonyx benchmark log. The comparison documents observed performance
rather than providing a hardware-normalized or architecture-specific
performance model.

Loopback networking measurements should not be interpreted as Internet
or production network latency.

------------------------------------------------------------------------

*Halonyx --- Private by design. Measured in practice.*
