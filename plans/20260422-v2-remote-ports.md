# v2 Port Surfacing Across Local + Remote Host Services

**Date:** 2026-04-22
**Status:** Proposed

## Goal

Show listening ports in the v2 sidebar for workspaces whose terminals run locally (desktop) *and* for workspaces whose terminals run in a remote `host-service`. The v1 perf lessons (issue #3372) must be preserved: strict hint patterns, debounced scans, one-in-flight scan per host, abortable children.

## Guiding principle

**Scan where the PID lives.** PIDs are only meaningful on the host that owns the process. Don't ship PIDs across the wire to scan elsewhere; ship fully-resolved `DetectedPort` records instead. The sidebar consumes a single workspace-scoped stream and doesn't care which host detected each port.

## Current state

- Local detection: `apps/desktop/src/main/lib/terminal/port-manager.ts` (singleton, 2.5s poll + hint-debounce) + `port-scanner.ts` (lsof/netstat).
- Exposure to UI: `apps/desktop/src/lib/trpc/routers/ports/ports.ts` — `getAll`, `subscribe` (observable), `kill`.
- Consumer: `apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/PortsList/hooks/usePortsData.ts`. Keyed by `workspaceId`, falls back to 10s refetch.
- Types: `apps/desktop/src/shared/types/ports.ts` — `DetectedPort`, `EnrichedPort`.
- Host-service terminals: `packages/host-service/src/terminal/terminal.ts`, session rows in `packages/host-service/src/db/schema.ts` (`terminalSessions`). No port detection today.

## Target architecture

```
 ┌────────────────────────┐       ┌────────────────────────────┐
 │ desktop main process   │       │ host-service (remote)      │
 │                        │       │                            │
 │ port-manager (local)   │       │ port-manager (remote)      │
 │   └── port-scanner     │       │   └── port-scanner         │
 │       (shared pkg)     │       │       (shared pkg)         │
 │                        │       │                            │
 │ emits add/remove ─────┐│       │ emits add/remove ─────────┐│
 │                       ▼│       │                           ▼│
 │ ports tRPC router      │       │ ports tRPC router          │
 └────────────┬───────────┘       └──────────────┬─────────────┘
              │                                  │
              │                                  │ (tunnel tRPC)
              ▼                                  ▼
        ┌──────────────────────────────────────────────┐
        │ desktop renderer: usePortsData                │
        │   merges local stream + per-remote streams    │
        │   groups by workspaceId                       │
        └──────────────────────────────────────────────┘
```

Both hosts emit the same `DetectedPort` shape. The renderer is the only place that knows "some workspaces are remote."

## Work breakdown

### 1. Extract shared scanner → `packages/port-scanner`

New package. Zero dependencies beyond `pidtree` and node built-ins so it runs in both desktop main and host-service.

- Move `apps/desktop/src/main/lib/terminal/port-scanner.ts` → `packages/port-scanner/src/scanner.ts`.
- Move the `PortManager` class → `packages/port-scanner/src/port-manager.ts`, but **remove the singleton export**. Callers instantiate their own. The singleton pattern bleeds state in tests and blocks running two managers in one host-service process.
- Keep `DetectedPort` in `apps/desktop/src/shared/types/ports.ts` for now (UI owns the wire shape); import it from the shared package via a peer type, or duplicate it — v1/v2 duplication is acceptable (per project convention).
- Update desktop imports: `main/lib/terminal/port-manager` → `@superset/port-scanner`.

No behavior change in this step. Land it alone to de-risk.

### 2. Host-service port manager

- `packages/host-service/src/ports/port-manager.ts`: thin wrapper that instantiates `PortManager` from the shared package and wires it to the host-service terminal registry.
- Terminal lifecycle hooks in `packages/host-service/src/terminal/terminal.ts`: call `portManager.upsertDaemonSession(paneId, workspaceId, pid)` on spawn and `unregisterDaemonSession(paneId)` on exit. The existing `daemonSessions` path fits — host-service runs like the daemon mode.
- Pipe PTY output through `portManager.checkOutputForHint(data)` at the same site that already streams to the renderer.

### 3. Host-service tRPC `ports` router

- `packages/host-service/src/trpc/router/ports/ports.ts`: mirror of `apps/desktop/src/lib/trpc/routers/ports/ports.ts`.
  - `getAll()` → `DetectedPort[]` (no label enrichment here; labels require `ports.json` from the worktree — host-service can load it from its own filesystem since it owns the worktree).
  - `subscribe()` → observable of `{ type: 'add' | 'remove', port }`. **Note:** host-service uses `@trpc/server` async iterators over WebSocket, not `trpc-electron`; the observable constraint in `apps/desktop/AGENTS.md` does *not* apply to host-service. Use whichever pattern the rest of host-service uses (grep `subscription(` in `packages/host-service/src/trpc/router/` to match).
  - `kill({ paneId, port })` → forwards to host-service port manager.
- Register under the existing host-service router.

### 4. Desktop: merge local + remote streams

Two options — recommend A.

**A. Renderer merges (recommended).** `usePortsData` subscribes to the local `electronTrpc.ports.subscribe` *plus* one remote subscription per connected host-service. Merge into a single `DetectedPort[]`, group by `workspaceId`. Each workspace already knows which host it lives on (via the `isRemote` path in `packages/host-service/src/trpc/router/workspace-creation/workspace-creation.ts:160+`), so the renderer picks the right stream.

Pros: no proxy code in desktop main; remote failures are local to the hook (can show a "remote ports unavailable" badge per workspace).

Cons: renderer gets wider — it now knows about N host-service connections. But it already does for terminals.

**B. Desktop-main proxy.** Desktop main process subscribes to each host-service's `ports.subscribe` and re-emits through its own singleton. Renderer keeps current one-stream shape.

Pros: renderer unchanged.

Cons: duplicates buffering, partitions errors awkwardly, and leaks host-service identity into desktop-main state for no real benefit.

### 5. Sidebar display

`PortsList` stays as-is. Optional polish:
- Add a small badge on each workspace group showing origin (local / remote hostname). Only if there's real ambiguity — if remote workspaces are visually distinct elsewhere in the sidebar, skip it.
- `kill` button: route to local or remote `ports.kill` based on the workspace's host. Trivial if we keep option A.

### 6. Schema

**No schema changes.** The `terminalSessions` table (`packages/host-service/src/db/schema.ts:9`) already has everything the manager needs (paneId, workspaceId, pid). Ports are runtime state — persisting them adds no value and costs writes on every 2.5s scan.

## Perf safeguards (carry over from v1)

Already baked into the shared `PortManager`, but call them out explicitly so they don't regress during the extract:

- `containsPortHint` patterns stay strict (listening on / server started|running on / ready on).
- `isScanning` guard + `scanRequested` follow-up queue.
- `scanAbort` aborts in-flight `lsof`/`netstat` on teardown.
- `IGNORED_PORTS` filter.
- `SCAN_INTERVAL_MS = 2500`, `HINT_SCAN_DELAY_MS = 500` unchanged.

## Rollout

1. Ship step 1 (extract). Pure refactor, green CI proves equivalence.
2. Ship steps 2+3 behind host-service feature flag (if one exists) or just default-on — host-service is new enough that there's no back-compat to preserve. Per project memory, host-service/cloud deploys before desktop.
3. Ship step 4 in the desktop client. Per project memory, new cloud endpoints are safe to call from new desktop builds since cloud deploys first.

## Pre-extract fixes (from v1 audit)

Land these in step 1 so the shared package starts clean.

**Blockers:**
- `port-manager.ts:124,151` — `scanAbort` can be `undefined` when a lingering `hintScanTimeout` fires after `stopPeriodicScan`. Lazy-allocate at the top of `scanAllSessions`.
- `ports.ts:36-45` + `usePortsData.ts:28` — DB `SELECT workspace` per unique `workspaceId` per `getAll`, and `getAll` is re-run on every `port:add`/`port:remove`. With a dev server churning ports this is a cascade of sync `better-sqlite3` reads on the main thread. Cache `workspaceId → labels` on the manager (invalidate on workspace CRUD), or coalesce `invalidate()` in the renderer with a 50ms debounce.

**Worth-fixing:**
- Delete `registerSession`/`unregisterSession` — no production callers (only tests). Only `upsertDaemonSession` is wired from `daemon-manager.ts`. Simplifies the extracted class.
- `port-manager.ts:317-350` — replace tail-recursion on `scanRequested` with `while (this.scanRequested) { … }`.
- `port-manager.ts:402-407` — O(ports × panes) sweep per tick. Partition `this.ports` into `Map<paneId, Map<port, DetectedPort>>`.
- `port-scanner.ts:128-152` — lsof parser is fragile on `COMMAND` names with spaces (e.g. `"Google Chrome Helper"`). Switch to `lsof -F pcPn` field output — trivially parseable, no column-index arithmetic.
- Hint regex adds: Vite/Next.js print `Local:  http://localhost:5173/` with no "listening/ready". Add `/\bLocal:\s+https?:\/\//i` and `/development server at/i`. Steal VS Code's three regexes verbatim (see below) — they're the de-facto reference.
- `IGNORED_PORTS` filters 5432/3306/6379/27017 globally. Devs often *do* want to see a dockerized Postgres spun up by their dev shell. Narrow to 22/80/443 or make the filter opt-in per workspace.
- Windows: `wmic` is removed in 11 24H2 / Server 2025. The code falls through to PowerShell-per-PID which is slow. Replace with one `Get-CimInstance Win32_Process -Filter "ProcessId IN (…)"` call, or skip netstat entirely and rely on URL-regex scraping (what VS Code does on Windows).

**Nits:** clear `scanRequested` in `stopPeriodicScan`; log (don't swallow) `EACCES` in `getListeningPortsLsof`; cap `ports` Map at ~500 entries as a belt-and-braces leak guard.

**Preserve during extract (do not regress):**
- Two-level abort (`scanAbort` + `runTolerant` rethrowing on abort).
- `pidSet.has(pid)` recheck on lsof output — lsof returns *everything* if `-p` resolves to zero matches. The "CRITICAL" comment is right.
- `unref()` on timers — required for clean Electron exit.
- Hint-scan debounce via `hintScanTimeout` guard — protects against the #3372 regression.

## Prior art — steal from VS Code & Gitpod

Big finding: **VS Code and Gitpod both read `/proc/net/tcp{,6}` directly on Linux** — no `lsof` subprocess at all. For the host-service scanner (which will almost always run on Linux), this is a meaningful win.

- [VS Code `extHostTunnelService.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/api/node/extHostTunnelService.ts) — `loadListeningPorts` reads procfs, filters state `0A`, parses big-endian hex IPs; correlates socket inodes → PIDs via `/proc/<pid>/fd/*`. Uses a `MovingAverage` of scan cost and polls at `max(avg * 20, 2000ms)` — adaptive backoff. We should steal this.
- [VS Code `urlFinder.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/remote/browser/urlFinder.ts) — canonical hint regexes:
  ```
  localUrlRegex:   /\b\w{0,20}(?::\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0|:\d{2,5})[\w\-\.\~:\/\?\#[\]\@!\$&\(\)\*\+\,\;\=]*/gim
  extractPortRegex: /(localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{1,5})/
  localPythonServerRegex: /HTTP\son\s(127\.0\.0\.1|0\.0\.0\.0)\sport\s(\d+)/
  ```
- [Gitpod `served-ports.go`](https://github.com/gitpod-io/gitpod/blob/main/components/supervisor/pkg/ports/served-ports.go) — same procfs strategy in Go. Runs inside the workspace container, never on the forwarded socket. Confirms our "scan on the host that owns the PID" principle.
- [Coder `ports_supported.go`](https://github.com/coder/coder/blob/main/agent/ports_supported.go) — uses `cakturk/go-netstat` (procfs on Linux, `GetExtendedTcpTable` on Windows). Also remote-host-local detection.
- VS Code on Windows: **does not spawn netstat.** Falls back entirely to terminal-output URL scraping. Worth considering for our Windows tier given `wmic` deprecation pain.

### Revised scanner tier plan

Three-tier, matching VS Code's split:

1. **Linux** — read `/proc/net/tcp` + `/proc/net/tcp6`, filter state `0A`, map inodes → PIDs via `/proc/<pid>/fd`. No subprocess. Cheapest path and the one that matters most (host-service runs on Linux).
2. **macOS** — keep `lsof` (no procfs). Switch to `-F pcPn` field output. This is the only tier that pays a subprocess cost, so apply VS Code's adaptive backoff here specifically.
3. **Windows** — `netstat -ano` once + single batched `Get-CimInstance` for names; OR skip net-enumeration entirely and rely on URL-regex scraping. Decide based on how many desktop users actually run on Windows.

Polling cadence: replace fixed `SCAN_INTERVAL_MS = 2500` with `max(movingAvg * 20, 2000ms)` capped at e.g. 10s. Hint-triggered scans still fire immediately (debounced).

## Open questions

- **Port labels for remote workspaces.** `loadStaticPorts(worktreePath)` reads `ports.json` from disk. For remote workspaces, host-service must read it from its own worktree and return `EnrichedPort`, not `DetectedPort`. Either (a) enrich in host-service before emitting, or (b) keep hosts emitting raw `DetectedPort` and have a separate `getStaticLabels(workspaceId)` tRPC call cached in the renderer. (b) is cleaner — labels rarely change, so one query per workspace beats sending labels over the subscription every tick.
- **Multi-host fan-out.** If a user connects to several host-services, the renderer holds N+1 subscriptions. Fine for small N; revisit if it grows.
- **Security.** Port kill across tRPC needs the same auth boundary as terminal kill — confirm host-service already gates this before exposing `ports.kill`.
