# Memory Profile & Worker Offload Review

Initial review 2026-07-18; progress and the large-repository rerun updated 2026-07-19. Code sweep across renderer / Electron main / host-service / pty-daemon, then every load-bearing claim verified against the live dev app over CDP (18-terminal stress, heap + RSS sampling, process-table spawn sampling). Claims marked **CDP** were observed at runtime; **code** means verified at the cited line but not behaviorally driven.

## Progress

| Item | Ticket | Status |
|---|---|---|
| Parked-terminal LRU eviction (terminal half) | SUPER-1545 | **Shipped** in PR #5751. Cap defaults to 12 parked, user-configurable (Settings → Terminal → "Background terminal memory"; local-db `terminal_parked_runtime_cap`, migration 0042, zod-clamped 2–64, live-applied via `terminalRuntimeRegistry.setParkedRuntimeCap`). CDP-verified: default seeds at boot, 16-tab cycle parks exactly 12, lowering to 6 sweeps immediately, persists, out-of-range rejected. Two controlled A/Bs below (18-terminal fill, 24-terminal live-stream; both measured at cap 5 — savings scale down as the cap rises) |
| Parked-webview eviction + alt-screen exemption + quota guard | SUPER-1545 | **Shipped** in PR #5754 (hidden-webview LRU cap 3 in `browserRuntimeRegistry`; alternate-screen TUIs exempt from terminal eviction; eviction skipped when the buffer cannot persist). CDP-verified 2026-07-18 |
| Chat shiki off main thread | SUPER-1546 | Not started |
| Collections preload/window/evict | SUPER-1547 | Org-switch eviction **shipped** in PR #5778; preload deferral and table windowing are not started |
| Async process-tree probes | SUPER-1548 | Not started |
| Search pinned worker | SUPER-1549 | Not started (measurement-gated on SUPER-1544) |
| Memory telemetry | SUPER-1550 | **Shipped** in PR #5777. Production-only, privacy-allowlisted `resource_snapshot` every 5–6 minutes; Electron process-class RSS/counts plus main-process heap/RSS, uptime, window count, and web-contents count |
| Host-service git worker pool | SUPER-1544 | **Shipped** in PR #5750; watcher batches bounded in PR #5746. Git status and commit-file work run in the generic `worker_threads` pool; draft PR #5776 contains unmerged base-ref fetch coordination follow-ups |

## Bottom line

- Fleet memory telemetry shipped in PR #5777 after the original sweep. It is disabled in development, so the "over time" profile and the rerun below remain direct measurements rather than PostHog data; production fleet percentiles will only exist after rollout and sample accumulation.
- The biggest memory growth over a session is **retention, not thread-shaped work**. Parked xterm/webview caps and prior-org Electric collection eviction have shipped; active-org table windowing remains open.
- Three worker systems now exist: desktop main's `WorkerTaskRunner` (v1 git status), the host-service generic pool (v2 git status + commit-file reads), and the pierre renderer pool (8 workers, diffs). Extend the matching system before inventing another request/response pool.

## Measured memory profile (dev app, CDP)

| State | JS heap | Renderer RSS |
|---|---|---|
| Boot, collections not synced | 150 MB | — |
| Electric collections synced (dev org) | 204 MB | — |
| +1 terminal | 219 MB | — |
| +6k lines of scrollback | 254 MB | — |
| 5 terminals | 314 MB | — |
| **18 terminals (17 parked)** | **558–570 MB** | **1.54–1.59 GB** |

Nothing is reclaimed on workspace switch: with 17/18 terminals parked, heap and all 18 WebGL contexts stayed put.

## Latest-main 8-workspace / 20k-file churn rerun (2026-07-19)

### Target and safety gate

The final fetch moved twice during the investigation, so the measurements below were rerun after fast-forwarding to the then-current `origin/main`; the earlier `d383394b` and `ba78b917` samples are intentionally not used as the latest-main result.

| Gate | Verified value |
|---|---|
| Worktree | `/Users/kietho/.superset/worktrees/1c99c8eb-1b31-4f04-9ac4-61a2760c74b6/agent/renderer-churn-current-main` |
| Branch | `agent/renderer-churn-current-main` |
| Commit | `cf68c53caf0ee0c5cac167d8189f7b4cf18c02a9` (equal to `origin/main` immediately before the final run) |
| API / renderer | `7501` / `7505` |
| Dedicated CDP | `127.0.0.1:9520`, page target `B7F0EF0681A3DEB0B26AAF6766F63636`, renderer PID `14230` |
| Visible route | `#/workspace/24e05c49-eee3-425c-a887-e5cf80527438`, rendered workspace-picker surface |
| Data boundary | `/private/tmp/superset-git-status-large-repo` plus eight `/private/tmp/superset-git-status-large-repo-worktrees/workspace-{0..7}` worktrees; no production database, migration, repository, or credential was used |

Each worktree contained 20,000 tracked files and the harness's 600-file dirty mix (360 modified, 150 untracked, 90 deleted). The host event-bus run applied 400 paced tracked-file mutations per worktree at 5 ms intervals. The renderer run lasted 60.050 s and performed 120 churn ticks: every 500 ms it appended to 200 tracked files in every worktree (1,600 writes/tick, 192,000 writes total) while issuing all eight status requests every 2 s. A 20 s no-churn phase used the same status cadence as the baseline.

The host result is the repository harness's exact event-bus path. The renderer status fan-out is synthetic diagnostic coverage through the real renderer → Electron IPC status path because the visible v2 sidebar did not surface the locally registered legacy worktree rows as selectable workspaces. The dev session also logged `host.ensure` membership failures for cached orgs, so its cloud-host lifecycle was not a valid substitute. The visible workspace-picker route and before/during screenshots were real end-to-end UI state, but the synthetic status results were not rendered and switching visibly among all eight workspaces was **not** exercised. Do not use this run to disprove a report whose necessary trigger is result rendering or that exact v2 workspace-switch lifecycle.

### Results

The freeze did **not** reproduce. There were zero 5 s CDP timeouts, zero 10 s status timeouts, no status errors, and the before/during screenshots showed the same responsive workspace-picker surface. The profiling gate therefore stayed closed: no CPU profile was captured and no product code was changed.

| Renderer metric | 20 s baseline p50 / p95 / max | 60 s churn p50 / p95 / max |
|---|---:|---:|
| Dedicated-CDP round-trip latency | 0.4 / 2.0 / 27.8 ms | 0.4 / 2.0 / 59.8 ms |
| Per-worktree status latency | 486.3 / 1,863.6 / 1,870.0 ms | 461.1 / 562.8 / 1,061.2 ms |
| Eight-worktree status-batch latency | 519.2 / 1,870.2 / 1,870.2 ms | 506.7 / 581.2 / 1,061.3 ms |
| Renderer event-loop delay (50 ms timer drift) | 0.0 / 1.4 / 93.6 ms | 0.0 / 1.3 / 113.9 ms |
| Renderer RSS | 744.8 / 746.0 / 746.1 MiB | 763.2 / 771.1 / 771.1 MiB |

The worker-mode host harness completed the measured portion in 5.321 s: 44 `git:changed` events coalesced to 25 refreshes, maximum active refreshes stayed at 4, and event-loop delay was 1.5 ms p50 / 11.4 ms p99 / 42.8 ms max. `/usr/bin/time -l` reported 509,984,768 bytes (486.4 MiB) maximum RSS for the harness process. The harness exposes p99 rather than p95 for its Node event-loop histogram.

RSS did not show runaway growth in this run: churn maxed at 771.1 MiB and fell to 712.7 MiB after a 10 s cooldown plus explicit GC. JS heap was 125.0 MiB at churn end, 104.4 MiB before that GC, and 104.1 MiB after it; event listeners remained roughly flat (1,049 before GC, 1,061 after). Repeated forced invalidation and full eight-way status result transfer is intentionally harsher than the visible large-change UI's 10 s refetch floor, but the missing result-render and workspace-switch lifecycle means a production-shaped follow-up is still needed before closing the freeze report.

### Controlled A/B — parked-terminal LRU eviction (SUPER-1545; measured at cap = 5, shipped default is 12 + configurable)

Identical CDP protocol on fresh launches of each build: open the 18-terminal workspace, drive 5,000 lines into every terminal's xterm, then re-cycle all tabs. Measured at the same settle points.

| Metric (after filling all 18) | Before (HEAD) | After (eviction) |
|---|---|---|
| Live xterm runtimes | 17 | **6** (1 attached + 5 parked) |
| Live WebGL contexts | 17 | **6** |
| Total buffered lines in heap | 85,157 | 30,288 |
| JS heap | 658 MB | **381 MB** (−42%) |
| Renderer RSS | 1,655 MB | **1,139 MB** (−31%) |
| Tab-switch p50 (re-cycle pass) | 59 ms | 76 ms |

Trade-off, by design: after the re-cycle pass the eviction build holds ~6.3k buffered lines (evicted terminals restore the 1,000-line serialized window) vs 85k retained in the before build; median tab-switch pays ~17 ms extra when the switch rebuilds an evicted runtime.

### Heavy A/B — 24 terminals with live streaming processes

Same A/B discipline, harder load: 24 terminal tabs, each running a real PTY process streaming continuously (`while true; do seq 1 100; sleep 0.2; done`, ~40 KB/s each; throttled deliberately — a full-rate flood kills the shared daemon socket per the SUPER-1544 plan's finding, which would invalidate the comparison). CPU is a 30 s `cputime` delta during steady state.

| Metric (24 streams live) | Before (HEAD) | After (eviction) |
|---|---|---|
| Live xterm runtimes / WebGL contexts | 23 | **6** |
| JS heap (steady state) | 836→846 MB (climbing) | **373→376 MB (flat)** |
| Renderer RSS | 1,741 MB (1,839 post-cycle) | **1,165 MB** (1,277 post-cycle) |
| Renderer CPU, steady state | 30% of a core | **21%** |
| Host-service / daemon / GPU CPU | 2% / 1% / 5% | 2% / 1% / 4% |
| Tab-switch p50 / p95 under load | 52 / 95 ms | 68 / 114 ms |

Under this real-PTY streaming workload, eviction closes the WebSocket of released terminals, so their streams are neither delivered nor parsed — the before build parses all 24 streams into 23 live xterms forever. Heap is also flat under load in the eviction build vs climbing in the before build. A later 18-terminal synthetic-output rerun confirmed the memory result (−46% JS heap, −30% renderer RSS) but did not reproduce a CPU reduction (`TaskDuration` 1.41 s before vs 1.80 s after), so treat the 30% → 21% CPU sample as workload-specific rather than a general CPU claim.

## Verified findings — renderer

- **Parked terminals are never disposed** (CDP). On workspace/tab switch the xterm wrapper reparents into a `position:fixed; left:-9999px` container under `<body>`; buffer (5,048 lines retained), addons, WebSocket, and **live WebGL context** all survive. `terminal-runtime-registry.ts`, `terminal-parking.ts`, detach-only unmount in `TerminalPane.tsx:162`.
- **No instance cap** (CDP): 18 terminals → 18 registry entries, 18 live WebGL contexts, zero evictions, zero GPU context losses (Electron/ANGLE tolerated 18; the classic ~16 cap did not trigger).
- **Scrollback 5000** (CDP: `term.options.scrollback === 5000`; buffer plateaued at 5,000 + viewport rows). `shared/constants.ts:42`. Park/persist serializes 1,000 lines to `localStorage` `terminal-buffer:<id>` (~69 KB observed) — `terminal-runtime.ts:25`.
- **Electric collections: 30 per active org (29 org-scoped + shared organizations), fully preloaded at boot** (CDP + code). All reached `ready` on reload with entire tables in heap — dev org alone: 3,501 `githubPullRequests`, 1,719 tasks, 613 runs, 263 chat sessions (~50 MB heap). PR #5778 added org-switch eviction: inactive cache entries are deleted and each collection's public `cleanup()` stops sync and clears in-memory rows, while on-disk rows remain for cache-first rehydration. Active-org preload/windowing is unchanged.
- **Pierre worker pool is real and is the only renderer worker system** (CDP: exactly 8 `worker` CDP targets). `layout.tsx:217` (`poolSize: 8`, shiki-wasm). No SharedWorker/OffscreenCanvas/comlink anywhere.
- **Chat code blocks highlight on the main thread, twice per block** (code): `codeToHast` with `one-light` then `one-dark-pro`, re-run on every `code` change — `packages/ui/src/components/ai-elements/code-block.tsx:84-159`. Not routed through the pierre pool.
- **Chat message lists are not virtualized; polling replaces the whole array** (code): refetch clamped to ≥16 ms (`use-chat-display.ts:33`), v2 default `fps = 4` (`useWorkspaceChatDisplay.ts:120`), v1 passes `fps: 60` (`ChatPaneInterface.tsx:273` — v1 is sunset; don't fix, retire).

## Verified findings — Electron main

- **superjson serializes every IPC round trip on the main thread** (code): `lib/trpc/index.ts:12`.
- **`WorkerTaskRunner` exists with coalesce/dedupe/abort and one consumer**: `runGitTask` from `changes/status.ts:43,93` only. All other git ops (branches, staging, commit/push/pull, PR discovery, worktree parsing) run inline on main.
- **Port scanner spawns `lsof` on a 2.5 s cadence** (CDP-era behavioral: process-table sampling caught spawns at the rate expected for 2 host-services × 2.5 s interval). `port-scanner/src/port-manager.ts:10` (`SCAN_INTERVAL_MS = 2500`), idle decay 30 s.
- All v1-backend terminal output transits main (relay + scrollback disk writes) — `daemon-manager.ts:179` (code; v1 backends weren't exercised).

## Verified findings — host-service / pty-daemon

- **`spawnSync("ps")` blocks the host-service event loop in-process** (code, import chain confirmed): `packages/host-service/src/terminal/terminal.ts:5` imports `hasRunningForegroundProcess` directly from `@superset/pty-daemon/process-tree` and calls it at `:369` (pane-close probe). `spawnSync` sites: `process-tree.ts:103,145`, `Pty/Pty.ts:147,302`.
- **PTY buffering is well-bounded** (code): 64 KB replay ring/session (`SessionStore.ts:4`, `terminal.ts:163`), 8 MB socket caps (`Server.ts:46`, `terminal.ts:177`), slow consumers dropped, sessions deleted on exit. Per-session extras: headless-xterm `ModeTracker` + decoders (`terminal.ts:1183`).
- In-process keyword search/fuzzy scoring reads candidate files onto the heap (`workspace-fs/src/search.ts:618+`, 1 MB/file, 500 results, LRU 12 indexes) — CPU+heap on the service loop (code).
- Process topology (CDP-era `ps`): 2 host-service processes per dev app (321/465 MB RSS), each with a pty-daemon child (~60 MB).

## Recommendations (ranked impact/effort)

### 1. Parked-terminal LRU eviction — biggest RSS win

**Change:** cap live xterm instances (e.g. 4–6 most-recently-visible). On eviction, serialize 1,000 lines to localStorage (already implemented, ~69 KB) and `release()` the renderer state (already implemented — PTY stays alive host-side, host keeps its own 64 KB replay buffer). Re-attach restores the serialized buffer into a fresh instance. Same policy for parked `<webview>` guests (each is a whole Chromium process).

**Effect:** measured cost is ~20 MB JS heap + ~55–70 MB renderer RSS *per live terminal* (150→570 MB heap, renderer RSS 1.59 GB at 18 terminals). A 20-terminal session drops from ~1.6 GB to roughly 500–600 MB renderer RSS — **~1 GB reclaimed**, and GPU contexts drop from N to the cap. This is the direct fix for renderer OOM white-screens and GPU pressure on 8/16 GB machines, and it removes the per-parked-terminal WebSocket + reconnect traffic.

**Cost/risk:** evicted terminals lose scrollback beyond 1,000 lines (visible only if the user scrolls back that far); re-attach pays one xterm construction + 69 KB replay (tens of ms, imperceptible next to pane-switch). No behavior change for the PTY itself.

### 2. Chat code-block highlighting off the main thread

**Change:** route `code-block.tsx` (and `show-code`/`read-file-tool`/`file-diff-tool`) through the existing pierre pool (already runs shiki-wasm in 8 workers) or one dedicated highlight worker; cache results by content hash; highlight both themes in one worker call.

**Effect:** today every code block runs `codeToHast` **twice** (light + dark) on the UI thread and re-runs on every streaming update — a few to tens of ms per update, recurring for the whole stream. That is the main source of chat jank while an agent streams code: frames drop exactly when the user is watching output. Off-thread, streaming stays at frame rate regardless of code volume, and the content-hash cache makes re-renders of settled blocks free.

**Cost/risk:** highlight becomes async — first paint of a new block is unstyled for one worker round-trip (~5–15 ms; render plain `<pre>` meanwhile, no layout shift since Streamdown already block-splits). No new infrastructure.

### 3. Electric collections: eviction shipped; defer preload + window active-org tables

**Shipped/change:** PR #5778 implemented (a): prior-org collection sets are dropped from `collectionsCache` on org switch and cleaned up. Remaining work is (b) stop `preloadCollections` loading all 29 active-org tables at boot — preload only what the first screen needs, lazy-load the rest on surface open; and (c) window the monotonically-growing tables (`githubPullRequests`, `tasks`, `automationRuns`, `chatSessions`) to a recent slice, paging older rows on demand.

**Effect:** this is the only term in the profile that grows **with org age rather than user action** — the dev org already holds 3,501 PR rows + 1,719 tasks + 613 runs (~50 MB heap); a year-old active org will be several× that, paid by every client at every boot, forever. Windowing caps it permanently. Org-switch eviction returns the full per-org set (collections + secondary indexes) for multi-org users. Deferring preload also cuts boot-time sync burst and time-to-interactive.

**Cost/risk:** windowed surfaces must keep the cache-first rendering rule (AGENTS.md §9) — never blank existing rows while older pages load. Sync writes that expect full-table presence need auditing before (c). Workers don't help here; retention policy does — the data must live on the thread that queries it.

### 4. Git compute into a host-service worker pool — shipped; continue measuring

**Shipped:** PR #5750 added the host-service `WorkerTaskRunner` + protocol and moved v2 git status and commit-file reads into it; PR #5746 bounded watcher batches. `plans/20260717-host-service-git-worker-pool.md` remains the design and measurement record (static task registry, clone-safe boundary, idle reaping, inline fallback). Do **not** widen the desktop main-process copy of `WorkerTaskRunner`: in v2 the git compute lives in host-service, and the desktop pool dies with v1 (v1-sunset policy).

**Effect:** every ms the host-service loop is busy is added latency for everything it serves — terminal relay, WS, all tRPC for the org — so git churn in big repos (branch storms, watcher-triggered refresh bursts) is felt as whole-app sluggishness, not as "git is slow". Offloading bounds loop occupancy so those stay flat. Port-scan/`ps` parsing measured trivial (per the companion plan's load test) — leave it.

**Priority caveat:** the companion plan's flood test found the daemon↔host-service transport dies (org-wide terminal drop via the 8 MiB `writableLength` destroy in `Server.ts`) before loop contention even becomes measurable. That transport fix landed as PR #5747 (pause flooding PTYs on backpressure instead of destroying the shared socket) — re-measure loop contention on top of it before sizing the pool work.

### 5. Host-service: async process probes + search worker

**Change:** (a) replace the `spawnSync("ps")` probes (`process-tree.ts:103,145`, reached in-process via `terminal.ts:369`) with async `execFile`; (b) move keyword search + fuzzy scoring (`workspace-fs/src/search.ts`) into a `worker_threads` worker.

**Effect:** (a) each sync probe freezes the **entire host-service event loop** for the child's lifetime (~10–30 ms nominal, worse under load — and it fires on pane-close paths). During a freeze, nothing moves: terminal output relay, WS keepalives, git status, port scans. Async-ifying deletes a whole class of "terminal hiccuped for no reason" stalls. (b) search reads up to 1 MB per candidate file onto the service heap and fuzzy-scores the whole index synchronously — while a user types in file search, their terminals stutter. In a worker, search latency no longer couples to terminal smoothness, and the string churn stops fragmenting the service heap.

**Cost/risk:** (a) is a signature change (`sessionHasRunningProcess` becomes async) with a small call-site ripple. (b) needs index handoff to the worker (transfer once, update incrementally) — the shapes are bounded (LRU 12 indexes, 500 results) so memory doesn't double meaningfully. Note: (b) cannot be a tenant of the request/response pool from the companion plan (its contract forbids worker-held state, and search needs the index resident worker-side) — it wants the plan's pinned-worker follow-up shape or a dedicated worker.

### 6. Memory telemetry — shipped; make the next pass data-driven

**Shipped:** PR #5777 samples `app.getAppMetrics()` + `process.memoryUsage()` in production every 5–6 min and emits one privacy-allowlisted PostHog `resource_snapshot` with process-class RSS/counts, main-process heap/RSS, uptime, and window/web-contents counts. It deliberately emits no IDs, names, paths, commands, or repository/terminal/user data.

**Effect:** after rollout and enough samples accumulate, the fleet gains renderer-RSS percentiles and release-regression detection instead of relying only on one-machine reviews. The current payload does not include terminal/workspace counts, so validating the parked-terminal cap against fleet usage still needs either privacy-safe bounded counts or a separate controlled cohort analysis. Cost remains negligible (~10–12 events/user/hour, tiny payload).

### Not worker candidates

xterm rendering (must stay on the UI thread — WebGL/DOM); per-chunk terminal scanners in host-service (tiny per call and latency-sensitive; postMessage overhead exceeds the work); v1 terminal relay through Electron main (fix by v1 sunset, not `utilityProcess`).
