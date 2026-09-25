# Host-service worker pool (generic; git first)

## TL;DR

**What:** a generic `worker_threads` pool inside host-service (v2 lost v1's git worker pool; today everything shares one event loop). Git compute is the first tenant; adding a tenant = one task module.

**What the stress tests actually showed (details in the two Measured sections):**

| # | Finding | Severity | Fix |
|---|---|---|---|
| 1 | One flooding terminal destroyed the org-wide daemon↔host-service socket (8 MiB cap, `Server.ts:595`); all terminals blipped | Correctness bug | **Fixed in #5747; verified below** |
| 2 | 8-workspace churn stalls the loop (183ms stalls, query p95 127ms) via the **watcher path**, not status parsing | Loop health | Offload GitWatcher rescan/filtering to the pool |
| 3 | Background `getStatus` takes 3.7–14.6s under churn — limiter queueing at concurrency 4 | UX staleness | Pool makes raising limiter concurrency safe |
| 4 | Big-diff snapshot ≈1.2s (2k files) but does NOT stall the loop | Minor | Phase 1 offload, comes with #2/#3 infra |
| 5 | Renderer freezes >60s under 8-workspace churn | Separate renderer workstream | Not host-service scope |
| 6 | Extreme subscribed terminal floods saturate host-service and daemon CPU and raise second-terminal echo p95 to 48.5 ms | Loop health | Attribute ModeTracker/hint scan, then test a pinned worker |

**Outcome:** #1 and the worker-pool/watcher-path work shipped; limiter concurrency stays at 4 because a concurrency of 6 did not improve completion time. The authenticated post-#5747 terminal rerun below reproduces cross-terminal coupling and promotes ModeTracker attribution/pinned-worker work. #5 remains a separate renderer-side effort.

## Post-implementation measurement — 2026-07-18

The pool landed in `727af9d97` for status snapshots and commit-file reads. The
profiling harness now exercises the real worker task, records worker vs inline
mode and event-loop delay, generates churn outside the measured process, and
can create eight real 20k-file worktrees with independent native watchers.

Results from 400 paced tracked-file mutations per worktree (8 worktrees, 600
pre-existing dirty files each):

| run | p99 loop delay | max | duration |
|---|---:|---:|---:|
| watcher only, unbounded path collection | 87.2 ms | 125.7 ms | 5.09 s |
| watcher only, paths capped at 128 then broad invalidation | **13.6 ms** | 27.1 ms | **3.51 s** |
| watcher + worker-backed status refreshes, capped | **6.3 ms** | 107.4 ms | **5.34 s** |

The hot watcher behavior was unbounded path normalization/Set growth, not work
that benefits from another worker hop. A thresholded worker experiment made
p99 worse (47.4 ms) because medium batches paid structured-clone and pool
contention costs. The implemented fix keeps precise paths through 128 unique paths,
then emits the already-supported broad invalidation and skips further path
normalization until the debounce flush.

Limiter comparison with eight identical snapshots: concurrency 4 completed in
2.52 s (14 max active git processes); concurrency 6 took 2.59 s (17 processes).
Keep the production limiter at 4: raising it did not improve completion time and
increased subprocess pressure.

## Post-daemon-fix terminal measurement — 2026-07-19

The shared-socket backpressure fix landed in #5747. A reusable CDP harness now
attaches real WebSocket consumers to two PTYs, floods one with continuous SGR
output, probes echo latency on the other, probes host-service health, and samples
host-service and pty-daemon CPU/RSS. The harness requires an authenticated CDP
session and resolves the active organization through the renderer's real auth
client; it has no organization-ID bypass.

The first two full runs used an explicit organization while the workspace API
was misconfigured. They established transport survival but are not accepted as
the final renderer reproduction. After refreshing the workspace Neon branch,
clearing a corrupt generated API cache, and verifying the renderer on its real
workspace route, a settled authenticated 60-sample run at 150 ms intervals
moved 326 MB through the subscribed flood terminal:

| metric | authenticated baseline | authenticated flood |
|---|---:|---:|
| probe echo p50 | 8.7 ms | 12.3 ms |
| probe echo p95 | 15.8 ms | **48.5 ms** |
| probe echo p99 | 153.6 ms | 148.4 ms |
| host health p95 | 2.5 ms | 4.9 ms |
| host health p99 | 8.4 ms | **81.7 ms** |
| host-service CPU p95 | 27.1% | **86.9%** |
| pty-daemon CPU p95 | 1.6% | 76.1% |
| probe/flood sockets | both open | both open |

The transport now survives the load, confirming #5747, but the second terminal
shows sustained coupling above the ~20 ms promotion threshold. Promote the
ModeTracker/hint-scan attribution work and a pinned-worker experiment. The
flood is deliberately more aggressive than normal TUI output, so use the same
harness to compare the experiment and require a material echo-p95 improvement
without regressing attach/preamble behavior before shipping the architecture.

## Cross-worker background fetch coordination — 2026-07-19

Moving status snapshots into workers accidentally made the base-ref freshness
Maps worker-local. Parallel worktrees sharing one Git common directory could
therefore launch redundant background fetches. The main host-service thread now
owns the common-dir TTL/in-flight coordinator again; the actual network fetch is
still submitted to the worker pool. This restores process-wide deduplication
without moving Git I/O back onto the host-service loop.

---

Move CPU-bound compute off the host-service event loop into a generic `worker_threads` pool inside the host-service process. Today every byte of git output is drained, parsed, and assembled on the same loop that relays terminal I/O and serves all tRPC/WS traffic for the org; v1 had this work in a worker pool (`apps/desktop/src/main/git-task-worker.ts`) and v2 lost it. Git compute is the first tenant; the mechanism is domain-agnostic.

## Shape

```
tRPC git.getStatus ──► gitStatusRefreshLimiter (unchanged front door)
                            │ run()
                            ▼
                       hostWorkerPool.runTask("git/getStatusSnapshot", …)
                            │ postMessage
                            ▼
                       host-worker.js (worker_threads, N = min(4, cpus−1))
                         static registry: git/* today, other domains later
```

- **Pool**: copy `WorkerTaskRunner` + `worker-task-protocol` from `apps/desktop/src/lib/trpc/workers/` into `packages/host-service/src/workers/`. It is already task-agnostic (`taskType` string + payload). v1 is sunset — leave the desktop copy untouched; it dies with v1 (per v1/v2 duplication policy).
- **Worker entry**: `packages/host-service/src/workers/host-worker.ts` — a thin dispatch loop over a **static, build-time registry** of task modules, namespaced `"<domain>/<task>"`. Day one it imports only `tasks/git.ts`.
- **Typed task definitions**: each task module exports `defineWorkerTask<In, Out>({ type, handler })`. The worker entry imports the handlers; callers import only the types, so `runTask` is typed end-to-end and the caller graph never pulls handler code.
- Git handlers call the existing `getGitStatusSnapshot` / `git-helpers` — Electron-free, and simple-git works in a worker (it just spawns child processes). **The worker spawns the git subprocesses itself** — draining and parsing both leave the main loop.

## Genericity contract (what task modules must satisfy)

1. **Static registry** — handlers are bundled into `host-worker.js` at build time; you cannot ship closures from the main thread. Adding a domain = add a task module + import it in the entry.
2. **Clone-safe boundary** — payloads/results cross via structured clone: plain data only, no live handles (SimpleGit, DB, sockets, emitters).
3. **No shared process state** — handlers get everything via payload. No host-service DB (the better-sqlite3 handle is per-process), no event bus, no config singletons, no native addons. Enforced by a `no-electron-coupling`-style import test on the worker entry graph.
4. **One request → one result** — the protocol has no streaming; long incremental jobs stay on the main loop or get chunked into tasks.

Work that violates 2–4 (DB queries, event-emitting watchers, terminal streams) does not belong in the pool.

## Pool changes vs the v1 runner

1. **Idle reaping** (new): terminate workers idle > 30s. host-service is long-lived and per-org — a 3-org machine must not hold 12 warm workers. v1 never needed this because the pool lived in the single Electron main process.
2. **Inline fallback** (new): if the worker script is missing or workers crash ≥3 times in 60s, log once and run tasks in-process (current behavior). Keeps standalone deployments and tests working if a bundle is malformed. Mirrors DaemonSupervisor's crash circuit.
3. Everything else stays: fifo/coalesce/latest-wins, per-task timeout + worker recycle, abort.

## Scheduling interplay

`gitStatusRefreshLimiter` remains the only queue for `getStatus` (per-workspace serialization, invalidation-coalescing, foreground/background priority). Pool concurrency = limiter concurrency (share `DEFAULT_CONCURRENCY` from `git-status-refresh-limiter.ts`) so pooled tasks never meaningfully queue behind the limiter. Limiter-fronted tasks use `fifo`; direct calls not behind the limiter (`getCommitFiles`, `getDiff`) use `coalesce` with a `workspaceId:proc:input` dedupe key. Procedure `timeoutMs` (15s/30s) carries into the pool task timeout.

## Bundling (3 surfaces, same side-by-side pattern as pty-daemon)

Resolution copies `daemon/singleton.ts`: env override `SUPERSET_HOST_WORKER_SCRIPT_PATH` → `host-worker.js` next to the running bundle → `packages/host-service/dist/host-worker.js` fallback.

1. `apps/desktop/electron.vite.config.ts` — add input `"host-worker": packages/host-service/src/workers/host-worker.ts` (emits `dist/main/host-worker.js`, side-by-side with `host-service.js`).
2. `packages/host-service/build.ts` — add `src/workers/host-worker.ts` as a second entrypoint.
3. `packages/cli/scripts/build-dist.ts` — copy `dist/host-worker.js` into `lib/` next to `host-service.js`.

Add a bundle-presence guard like `apps/desktop/scripts/check-pty-daemon-bundle.ts`.

## What moves

**Phase 1 — status snapshot** (the win): `getGitStatusSnapshot` and everything inside it — `parseNumstat`, `countUntrackedFileLines` (reads + line-counts untracked files on the loop today), `detectUnstagedRenames`, `getChangedFilesForDiff`. Serves `git.getStatus`, and the git-watcher/PR-runtime refreshes that funnel through the limiter.

**Phase 2 — read-path procs**: `getCommitFiles`, `listCommits`, `getBranchSyncStatus`, and `getDiff`'s `git.show` content reads (large-file drains + string assembly).

**Phase 3 — opportunistic**: git-watcher's `ls-files`/rescan subscription work; PR-runtime per-workspace git interrogation, where not already sharing Phase 1 tasks. Future non-git tenants (each is just a new task module): diff/patch text assembly, search/indexing if host-service ever grows one, large JSON parse/serialize hot spots.

**Not moving**: port-scanner (already subprocess-based, trivial parsing), reaper/cloud-sync/tunnel (I/O-bound), git mutations (`stageAll`, `discardChanges`, … — rare, fast, want the loop's ordering). Future candidate, out of scope: better-sqlite3 queries are synchronous on the loop; if profiling ever shows DB stalls, the same pool pattern applies.

## Measured 2026-07-17 (CDP stress, dev build, superset repo workspace)

Method: dev desktop over CDP; 5 tRPC-created sessions with real WS clients attached; probe terminal echo RTT + cheap tRPC RTT + `git.getStatus`, vs `yes`-with-SGR-escapes floods; `ps` CPU sampling of host-service + pty-daemon.

| metric | baseline | 1 flooder | 4 flooders |
|---|---|---|---|
| echo RTT p50/p95 | 1.8 / 3.1 ms | **dead (15/15 timeouts)** | dead |
| tRPC query RTT p50 | 1.6 ms | 1.5 ms | 1.7 ms |
| `git.getStatus` | ~310–325 ms | ~310 ms | ~315 ms |
| host-service CPU p95 | 34% (git bursts) | 21% | 1% |
| pty-daemon CPU | ~0% | 58–73% | 72–77% |

**Finding 1 (blocks the ModeTracker question, real bug):** a single full-rate flooding terminal kills the shared daemon↔host-service socket within ~2s. `writeMessage` (`packages/pty-daemon/src/Server/Server.ts:595`) destroys the connection when `writableLength` exceeds the 8 MiB `DEFAULT_OUTBOUND_BUFFER_CAP_BYTES` — and it's ONE socket for the whole org, so host-service logs `pty-daemon disconnected; closing 5 terminal WS socket(s)` and every terminal's stream drops (renderer reconnect masks this as a blip for users). The SUPER-939 "bounded buffering" bounds by disconnecting everyone, not by shedding the offending session's data. Loop-contention on host-service was unmeasurable — the transport dies before the loop gets loaded.

**Finding 2:** the daemon burns 50–77% of a core servicing a flooding PTY even with no subscriber attached (and keeps burning after destroying its client connection).

**Priority update:** fixing the daemon's overflow behavior (per-session shedding/pause, not shared-socket destroy) now outranks the loop-offload work; re-run the ModeTracker/loop measurement after the transport survives floods. `git.getStatus` p50 held at ~310ms throughout — the limiter does its job under this load; the worker pool's win is loop availability, not getStatus latency.

**Harness notes (for reruns):** sessions with no attached WS never stream to host-service — the daemon→host-service data path (ModeTracker, hint scan, broadcast) only runs for subscribed sessions, so a load test MUST attach sockets or host-service sits idle while only the daemon burns. A daemon disconnect wipes terminal session rows → later `writeInput` fails "Terminal session not found"; keep each measurement cycle short and re-create sessions per cycle.

## Measured 2026-07-17 round 2 — many workspaces × many files (CDP + direct HTTP/WS)

Setup: generated 20k-file repo, imported as project, 8 workspaces = 8 full worktrees. Churn = append to 200 tracked files per worktree every 500ms. Pollers = `git.getStatus` (background) on all 8 every 2s. "Direct" rounds measured from a bun script straight against host-service HTTP/WS (`Bearer` secret / `?token=`), bypassing the renderer. Loop probe = trivial-route HTTP RTT sampled at 100ms (event-loop availability from outside).

| metric | idle baseline | churn-1 | churn-8 + pollers | heavy-burst (2k files modified × 8, no churn) | post-reset settle (16k reverts) |
|---|---|---|---|---|---|
| echo RTT p50/p95 ms | 2.1 / 3.7 | 1.8 / 2.4 | 5.7 / 19.9 | 3.0 / 6.9 | 8.3 / **138** |
| query RTT p50/p95 ms | 1.8 / 3.2 | 1.5 / 4.4 | 4.1 / **127** | 0.8 / 4.3 | 6.4 / 48 |
| loop probe p95/max ms | — | — | 27.9 / **183** | 4.2 / 9.4 | 39 / 104 |
| `getStatus` ws1 ms | ~330 | 289–557 | 433–893 | ~1200 | 488–743 |
| all-8 concurrent storm ms | 372–2259 | 670–3610 | 1569–**7497** | 771–4501 | 464–1305 |
| bg pollers latency | — | — | p50 3.7s, p95 10.6s, max **14.6s** | — | — |
| host-service CPU | ~7% p95 | p50 7 / max 39% | p50 29 / max 52% | p50 10 / max 46% | ~22% |

Also observed during churn-8: **two renderer stalls >60s** (CDP evaluate timeouts; the app UI would freeze — renderer-side workstream, not host-service) and one window where renderer→host fetches failed outright while the process was alive at 40% CPU. Host-service RSS grew 320→570MB over the session (unverified whether leak or cache).

**Interpretation:**
1. **The loop stalls come from the watcher/event path, not status parsing.** Churn-8 stalls the loop to 183ms and drags query p95 to 127ms; heavy-burst (huge diffs, no fs churn) keeps the loop clean (p95 4.2ms) while statuses queue in the limiter + git subprocesses. GitWatcher event filtering/debounce/rescan is the strongest offload candidate for loop health — promote it from Phase 3.
2. **User-visible status staleness under churn is limiter queueing.** Background refreshes take 3.7–14.6s at concurrency 4 with 8 hot workspaces. The worker pool makes raising that concurrency safe (in-process, more concurrent snapshots would multiply loop parse work; in workers it's just more cores).
3. Snapshot cost scales with diff size (~1.2s at 2000 modified files) — worth offloading, but it wasn't the loop killer.
4. Terminal I/O degrades 3–10× under churn (echo p50 1.8→5.7ms, p95 138ms during settle) — real but not catastrophic; consistent with conclusion 1.

## Measuring what else deserves offload

Known per-chunk work on the host-service loop besides git (found by audit, unmeasured):

- **ModeTracker headless xterm** — `terminal.ts:271` feeds *every PTY output chunk* through `@xterm/headless` `writeSync` (full VT parse, `terminal-mode-tracker.ts`), per session, synchronously. Under agent-TUI repaint churn × N terminals this is likely the largest steady-state CPU on the loop.
- **Port-hint scanning** — per-chunk `StringDecoder` + text pattern match (`portHintDecoder` → `portManager.checkOutputForHint`).
- **WS fan-out** — per-chunk broadcast copies to attached sockets.
- **better-sqlite3** — synchronous queries on the loop.
- **pty-daemon's own loop** — mostly I/O relay + FIFO writes (no emulator; handoff snapshot is bookkeeping-only). Expected cheap; verify.

These streaming/per-chunk workloads do **not** fit the request/response pool (contract §4). If measurement justifies it, the follow-up is a **pinned-worker (sharded/actor) mode** on the same worker entry: pin each session's tracker+hint-scan to a worker keyed by sessionId, stream chunks over a MessagePort with transferred ArrayBuffers, request/response only for `buildPreamble()` on attach. Do not build this before the numbers exist.

Instrumentation (ship first, cheap, debug-flag or always-on):

1. `perf_hooks.monitorEventLoopDelay` in host-service and pty-daemon; log p50/p99/max every 30s.
2. Attribution counters: `performance.now()` + `eventLoopUtilization()` deltas around the suspects — `modeTracker.feed`, hint scan, `getGitStatusSnapshot`, db calls — emitting CPU-ms/s per subsystem.
3. Synthetic loads: flood one terminal (`yes`, `cat bigfile`) and measure input-echo RTT on a *second* terminal (loop-coupling proof); run giant-repo `getStatus` during the flood; branch-storm from the existing 20k-file watcher stress suite.
4. `node --cpu-prof` on host-service under the combined load for the flame.

Promotion rule: a subsystem becomes a pool/pinned-worker tenant when it shows sustained CPU-ms/s on the loop **and** p99 loop delay > ~20ms under realistic load — not before.

## Testing

- Parity: fixture repo, assert worker-path snapshot deep-equals inline-path snapshot (staged/unstaged/renames/untracked).
- Pool unit tests against a tiny JS fixture worker (timeout→recycle, idle-reap, crash→inline fallback, coalesce). Run under node like other host-service native-adjacent tests.
- Prove each test can fail by mutating the impl once.

## Risks

- **ESM worker entry**: `new Worker(path.js)` must resolve as ESM in the CLI dist (`lib/` has no `package.json`); emit `.mjs` there if needed.
- **Native externals**: worker bundle must not pull `better-sqlite3`/`node-pty` — the genericity-contract import test is the enforcement; it must run on the whole `host-worker.ts` entry graph so every future task module is covered.
- **Payload cloning**: snapshots for huge repos serialize across the thread boundary; they already serialize to JSON for tRPC, so no regression.
