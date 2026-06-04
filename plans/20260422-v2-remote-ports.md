# v2 Port Surfacing Across Local + Remote Host Services

**Date:** 2026-04-22
**Status:** In review on PR #3676

## Goal

Show listening ports in the v2 sidebar for workspaces whose terminals run locally (desktop) *and* for workspaces whose terminals run in a remote `host-service`. The v1 perf lessons (issue #3372) must be preserved: strict hint patterns, debounced scans, one-in-flight scan per host, abortable children.

## Guiding principle

**Scan where the PID lives, and key ports by terminal session.** PIDs are only meaningful on the host that owns the process. A listening port belongs to a process tree rooted at a terminal session, not to a renderer pane. Don't ship PIDs across the wire to scan elsewhere; ship fully-resolved port records keyed by `terminalId` instead. The sidebar consumes per-host port snapshots and groups them by workspace without caring which host detected each port.

This matches the recent v2 notification model: notification attention is keyed
by durable sources (`terminalId` for terminal panes, chat session id for chat
panes), and panes/tabs are only views over those sources. Ports should follow
the same boundary. A port row can open the workspace and route kill/open actions
through the host-service that owns the terminal, but it should not carry or
depend on renderer pane focus identity.

## Current state

- Local detection: `apps/desktop/src/main/lib/terminal/port-manager.ts` (singleton, 2.5s poll + hint-debounce) + `port-scanner.ts` (lsof/netstat).
- Exposure to UI: `apps/desktop/src/lib/trpc/routers/ports/ports.ts` — `getAll`, `subscribe` (observable), `kill`.
- Consumers:
  - v2: `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarPortsList/`
  - v1/legacy: `apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/PortsList/` remains local-only.
- Types: `apps/desktop/src/shared/types/ports.ts` — `DetectedPort`, `EnrichedPort`.
- Host-service terminals: `packages/host-service/src/terminal/terminal.ts`, session rows in `packages/host-service/src/db/schema.ts` (`terminalSessions`). No port detection today.

## Target architecture

```text
 ┌────────────────────────┐       ┌────────────────────────────┐
 │ desktop main process   │       │ host-service (remote)      │
 │                        │       │                            │
 │ port-manager (local)   │       │ port-manager (remote)      │
 │   └── port-scanner     │       │   └── port-scanner         │
 │       (shared pkg)     │       │       (shared pkg)         │
 │                        │       │                            │
 │ emits add/remove ─────┐│       │ emits add/remove ─────────┐│
 │                       ▼│       │                           ▼│
 │ ports router + events  │       │ ports router + event bus   │
 └────────────┬───────────┘       └──────────────┬─────────────┘
              │                                  │
              │                                  │ (tunnel tRPC + WS)
              ▼                                  ▼
        ┌──────────────────────────────────────────────┐
        │ desktop renderer: DashboardSidebarPortsList    │
        │   patches per-host snapshots from events      │
        │   refetches getAll as reconnect fallback      │
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
- Terminal lifecycle hooks in `packages/host-service/src/terminal/terminal.ts`: call `portManager.upsertSession(terminalId, workspaceId, pid)` on spawn and `unregisterSession(terminalId)` on exit. The existing terminal session lifecycle fits the shared manager model.
- Pipe PTY output through `portManager.checkOutputForHint(data)` at the same site that already streams to the renderer.

### 3. Host-service tRPC `ports` router

- `packages/host-service/src/trpc/router/ports/ports.ts`: mirror of `apps/desktop/src/lib/trpc/routers/ports/ports.ts`.
  - `getAll({ workspaceIds })` → enriched detected ports for the requested workspaces. `.superset/ports.json` is supplemental label metadata only: it names ports that were already detected as listening; it does not create static rows and does not replace dynamic discovery. Host-service can load labels from its own filesystem since it owns the worktree.
  - `subscribe({ workspaceIds })` → observable of `{ type: 'add' | 'remove', port }` scoped to the requested workspaces. **Note:** this is a useful router-level API, but the dashboard sidebar should prefer the unified host-service event bus so one WebSocket carries git, terminal, notification, filesystem, and port events for a host.
  - `kill({ workspaceId, terminalId, port })` → forwards to host-service port manager after verifying the tracked port belongs to that workspace and terminal session.
- Register under the existing host-service router.

### 4. Desktop: merge local + remote host-service results

Use a v2-specific sidebar component instead of wiring remote host-service
polling into the legacy `WorkspaceSidebar` path.

`DashboardSidebarPortsList` reads v2 hosts/workspaces from the renderer DB
collections, queries each relevant host-service `ports.getAll`, and groups the
result by workspace. Local v2 workspaces query the local host-service through
`activeHostUrl`; remote v2 workspaces query the relay URL for their host.
The sidebar then subscribes to each queried host's unified event bus and patches
the corresponding React Query snapshot from `port:changed` events. Events are
batched briefly before cache writes, and `ports.getAll` still runs on a slow
fallback interval so reconnects, dropped WebSocket messages, and version skew
converge without making the normal UI path wait for the next poll.

Pros: no proxy code in desktop main; remote failures are local to the sidebar
query and don't affect other hosts. The renderer owns one query and one shared
event-bus connection per relevant host, matching the v2 terminal model while
keeping PID-local scanning on the owning host.

Cons: renderer still fans out per host. Fine for small N; revisit with a
sidebar aggregate endpoint if many simultaneous host-services become common.

Rejected alternative: a desktop-main proxy that subscribes to each host-service
and re-emits through a singleton. It duplicates buffering, partitions errors
awkwardly, and leaks host-service identity into desktop-main state for no real
benefit.

### 5. Sidebar display

`DashboardSidebarPortsList` is mounted in the v2 `DashboardSidebar`. It groups
ports by workspace and shows an origin badge (local / remote) because v2 can
mix host-service owners in one sidebar.

The kill button routes through the same host-service client that produced the
port row using `workspaceId + terminalId + port`. Browser-open is only enabled
for local-device ports, where `localhost:<port>` is meaningful, and its click
intent uses the same current-tab/new-tab/external split as file/tree open
actions. Clicking a port opens the workspace with `terminalId` plus a fresh
focus request; the client resolves that to a pane/tab. Ports still do not carry
renderer pane identity.

### 6. Schema

**No schema changes.** The `terminalSessions` table (`packages/host-service/src/db/schema.ts:9`) already has everything the manager needs (`terminalId`, `workspaceId`, `pid`). Ports are runtime state — persisting them adds no value and costs writes on every 2.5s scan.

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
- `ports.ts:36-45` + `usePortsData.ts:28` — DB `SELECT workspace` per unique `workspaceId` per `getAll`, and `getAll` is re-run on every `port:add`/`port:remove`. With a dev server churning ports this is a cascade of sync `better-sqlite3` reads on the main thread. Cache `workspaceId → labels` for supplemental `.superset/ports.json` names (invalidate on workspace CRUD), or coalesce `invalidate()` in the renderer with a 50ms debounce.

**Worth-fixing:**
- Delete `registerSession`/`unregisterSession` — no production callers (only tests). Only `upsertDaemonSession` is wired from `daemon-manager.ts`. Simplifies the extracted class.
- `port-manager.ts:317-350` — replace tail-recursion on `scanRequested` with `while (this.scanRequested) { … }`.
- `port-manager.ts:402-407` — O(ports × terminals) sweep per tick. Partition `this.ports` into `Map<terminalId, Map<port, DetectedPort>>`.
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
- Host-service `port:changed` events patch the dashboard cache immediately;
  the 30s `ports.getAll` interval is a fallback, not the responsiveness path.

## Prior art — steal from VS Code & Gitpod

Big finding: **VS Code and Gitpod both read `/proc/net/tcp{,6}` directly on Linux** — no `lsof` subprocess at all. For the host-service scanner (which will almost always run on Linux), this is a meaningful win.

- [VS Code `extHostTunnelService.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/api/node/extHostTunnelService.ts) — `loadListeningPorts` reads procfs, filters state `0A`, parses big-endian hex IPs; correlates socket inodes → PIDs via `/proc/<pid>/fd/*`. Uses a `MovingAverage` of scan cost and polls at `max(avg * 20, 2000ms)` — adaptive backoff. We should steal this.
- [VS Code `urlFinder.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/remote/browser/urlFinder.ts) — canonical hint regexes:
  ```text
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

- **Resolved: `ports.json` semantics.** `.superset/ports.json` is supplemental
  label metadata. It gives friendly names to ports that dynamic scanning already
  detects. It must not create port rows, hide unlabelled detected ports, replace
  dynamic detection, or make malformed label config suppress detected ports.
- **Resolved: port labels for remote workspaces.** Host-service reads
  `.superset/ports.json` from its own worktree and returns enriched rows from
  `ports.getAll`; both desktop and host-service refresh cached labels when the
  file mtime/size changes.
- **Resolved: port identity.** Shared port records are terminal-owned
  (`terminalId`), workspace-grouped (`workspaceId`), and host-scoped by the
  client/router path. They do not include renderer `paneId` or any UI focus key.
- **Multi-host fan-out.** If a user connects to several host-services, the
  renderer holds one polling query per relevant host. Fine for small N; revisit
  if it grows.
- **Security.** Port kill across tRPC needs the same auth boundary as terminal kill — confirm host-service already gates this before exposing `ports.kill`.
