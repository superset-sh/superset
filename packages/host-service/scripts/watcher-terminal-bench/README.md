The watcher initialization stall reproduces with the original code and is substantially reduced by the worker changes. Measured on macOS 26.6.2 arm64, Node v26.7.0, Bun 1.3.11, on 2026-09-25. The baseline is commit `19bf0e8c6f4bf1f145de95d9a7caaabf13770578`; the comparison is the working tree containing the watcher changes.

These recorded runs predate rebasing onto newer `main` watcher-backend and attach-backoff changes. They establish the original regression and improvement, but do not claim to measure current `main` against the final rebased PR. Re-running the harness measures the checked-out implementation.

Two workspaces containing 50,000 files each were initialized simultaneously. These are the worst observed latencies across three runs per version:

| Measurement | Before | After |
|---|---:|---:|
| Transport attachment acknowledgement | 264.8 ms | 5.3 ms |
| Input to echoed PTY output | 284.9 ms | 16.9 ms |
| Unsolicited PTY output delivery | 274.0 ms | 9.0 ms |
| Host event-loop stall | 168.8 ms | 9.2 ms |

Median per-run p99 input latency was 206.9 ms before and 6.5 ms after. Every sent input probe received its echo. The baseline started four nested-repository scans for the two roots; the changed code started two, sharing initialization between Files and Changes subscriptions. Median time until both native filesystem watchers were registered was 677.7 ms before and 228.2 ms after.

A second scenario requested 12 workspaces with 5,000 files each, then released all subscriptions 20 ms later, while setup was pending. Across all three runs, the baseline started 24 scans in total, including **20 scans after the cancellation was handled**. The changed code started **zero scans**, cancelling before worker startup completed. Its cancellation request was handled in 0–1 ms, versus 21–22 ms before. No registered filesystem watchers remained in either version at the end; the regression was unnecessary work after cancellation, rather than a retained registered watcher in this scenario.

The harness runs the real `GitWatcher`, `WorkspaceFilesystemManager`, `FsWatcherManager`, native filesystem subscriptions, and worker code. The only database substitute is the workspace ID/path lookup. It runs a real PTY with a Python echo/output producer and forwards its traffic over a local TCP socket on the same event loop as watcher initialization. An independent controller process sends input probes every 10 ms and opens an attachment probe every 20 ms. Python also emits timestamped output while input is idle. No artificial busy loop or scan delay is injected.

This is a host-side isolation benchmark: attachment measures a transport acknowledgement, not the full production daemon/WebSocket attach handshake. It does not measure Electron rendering, workspace route loading, or terminal paint. Output delivery uses millisecond wall-clock timestamps; input and attachment use the controller's monotonic clock. Filesystem caches were not flushed. Each run starts a fresh Node host process; order alternates before/after, after/before, before/after. Both variants get the same one-record-per-scan instrumentation. Measurements last five seconds, followed by 200 ms for outstanding echoes to drain.

Run from the repository root:

```bash
BENCH_BASELINE=19bf0e8c6f4bf1f145de95d9a7caaabf13770578 \
  bun packages/host-service/scripts/watcher-terminal-bench.ts \
  .cache/watcher-terminal-full

BENCH_BASELINE=19bf0e8c6f4bf1f145de95d9a7caaabf13770578 \
  BENCH_CANCEL=1 BENCH_FILES=5000 BENCH_WORKSPACES=12 \
  bun packages/host-service/scripts/watcher-terminal-bench.ts \
  .cache/watcher-terminal-cancellation
```

`BENCH_ROUNDS` defaults to 3, `BENCH_FILES` to 50,000 per workspace, `BENCH_WORKSPACES` to 2, and `BENCH_DURATION_MS` to 5,000. Use a fresh output directory when changing fixture sizes. These are benchmark-only controls; no application environment configuration is needed. The harness builds the before version by loading the relevant source files from the selected commit, without checking out or modifying the working tree. Node, Bun, Git, `/usr/bin/python3`, and the installed `node-pty`/`@parcel/watcher` packages are required. Production integration services and a database are not required.

[results.json](./results.json) contains all twelve measured runs. Re-running writes bundles, fixtures, scan-start logs, and `results.json` into the chosen output directory. The source is [../watcher-terminal-bench.ts](../watcher-terminal-bench.ts), with the child host in [host.ts](./host.ts).
