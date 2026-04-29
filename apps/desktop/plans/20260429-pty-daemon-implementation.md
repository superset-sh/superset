# pty-daemon Implementation Plan

**Status:** Draft for review.
**Owner:** Kiet
**Date:** 2026-04-29
**Decision basis:** [PTY survival architecture survey](./20260428-pty-handoff-survival-architectures.md) (selected: Architecture E — daemon + fd-handoff for daemon upgrades)

## Goal

Extract PTY ownership from host-service into a small, long-lived
`pty-daemon` so that:

- **Routine host-service upgrades preserve all running shells** (the
  primary requirement).
- **host-service crashes also preserve shells** (free from the
  separation).
- **Daemon upgrades preserve shells** via fd inheritance to the new
  daemon binary (Phase 2; Phase 0 has validated the primitive).

## Key decisions (locked)

| Question | Decision |
|---|---|
| Architecture | E (daemon + fd-handoff) |
| Daemon runtime | Node + `node-pty` (matches host-service stack; fd-handoff verified on macOS arm64) |
| Daemon scope | **Pure PTY runtime, stateless from the client's perspective.** No HTTP, no auth, no DB, no business logic, no persistence, no analytics. Every protocol call carries full context; every response is complete. |
| Daemon-host transport | Unix socket (AF_UNIX, SOCK_STREAM), length-prefixed binary frames |
| Auth at daemon boundary | Unix socket file mode `0600` (owner-only). No in-band tokens. |
| Buffer placement | In-memory ring buffer **on the daemon** (~64 KB / session). Survives host-service restarts; *not* persisted to disk — that's a v1 anti-pattern. |
| Session granularity | Per-workspace daemon (mirrors current host-service-per-workspace) |
| Daemon-upgrade handoff | `child_process.spawn` `stdio` fd inheritance (kernel does the dup; no SCM_RIGHTS dependency on Node) |
| Crash policy | Daemon stability is first-class. On daemon crash, sessions are lost; respawn and surface telemetry. No serialize+replay fallback. |
| Size budget | **~500–700 LOC** including tests. If we approach v1's ~1000 LOC, something has crept in that doesn't belong. |

## Lessons from v1 (do not repeat)

The v1 daemon (`apps/desktop/src/main/lib/terminal/daemon/`,
`daemon-manager.ts:1009 LOC` + `history-manager.ts:245 LOC` +
`priority-semaphore.ts:76 LOC`) became a "workspace manager with PTY
runtime bolted on" instead of a PTY runtime. Roughly **56% of v1's
daemon code was non-PTY concerns** — that's the bloat we're cutting.

### Things v1 did that v2 must NOT do

| v1 behavior | Why it doesn't belong | Where it lives in v2 |
|---|---|---|
| SQLite-backed `HistoryWriter` for persistent scrollback | Disk I/O in the survival-critical process; couples lifetime to filesystem state | host-service (or out of scope) |
| Cold-restore replay from disk on daemon loss | Daemon should be ephemeral; replay is a client concern | host-service |
| Killed-session tombstones to block reattach | Business rule masquerading as runtime state | client / host-service |
| `validWorkspaceIds` checks in the daemon | Authorization in the trust boundary instead of at it | Unix socket file mode `0600` is the boundary |
| Port-scanner integration | Unrelated feature crammed into the daemon | host-service or its own service |
| Analytics tracking calls | Telemetry inside the survival primitive | host-service decorates the client |
| `EventEmitter` in-process subscriber model | Wrong abstraction; the protocol is the subscription model | Unix socket protocol's `subscribe` op |
| Pending-request deduplication / `joinPending` | Daemon caching client intent | client deduplicates its own calls |
| Priority-based semaphore (active pane prioritization) | UI ergonomics inside the daemon | client orders its own requests |
| ANSI clear-scrollback parsing in `HistoryManager` | Output interpretation in the byte-relay layer | renderer / host-service |
| Sticky cross-call state (`coldRestoreInfo`, `cleanupTimeouts`, hydration flags) | Stateful daemon = upgrade-fragile daemon | none — every call is independent |
| Cascading cleanup with `setTimeout` (5s delay etc.) | Deferred state = race conditions on shutdown/handoff | synchronous teardown only |

### The single design principle

> **The daemon is stateless from the client's perspective.** Every
> request carries full context; every response is complete. The daemon
> tracks only active PTY fds, ring buffers, and current session
> dims/PID. Everything else — history, killed-tombstones, dedup,
> analytics, business rules — is the client's job.

This is the property that makes the daemon resistant to needing
upgrades. State that doesn't exist can't have schema migrations,
can't accumulate edge cases, and can't drift between versions.

### Patterns from v1 worth keeping

- **Per-session snapshot returned on attach** (cols/rows/pid/initial
  state). Lean and useful — included in the protocol's `subscribe`
  reply.
- **Resize bounds validation** (reject cols/rows ≤ 0).
- **Signal abstraction** (SIGINT/SIGTERM/SIGKILL as strings in the
  protocol).
- **Graceful shutdown ordering** (close writers → unregister → exit).
- **AbortSignal-based cancellation** for long-running protocol calls.
- **Concurrency limit on session creation** — but as a simple FIFO,
  not a priority queue. (Spawning 100 PTYs at once would otherwise
  thrash; cap at e.g. 8 concurrent spawns.)

## Package layout

```
packages/pty-daemon/
├── src/
│   ├── index.ts                       # entry: parse argv, start Server
│   ├── Server/
│   │   ├── Server.ts                  # AF_UNIX server, accept loop
│   │   └── Server.test.ts
│   ├── protocol/
│   │   ├── protocol.ts                # message schemas, framing, version constants
│   │   └── protocol.test.ts
│   ├── handlers/
│   │   ├── handlers.ts                # open / input / resize / close / list / kill
│   │   └── handlers.test.ts
│   ├── Pty/
│   │   ├── Pty.ts                     # node-pty wrapper, exposes master fd
│   │   └── Pty.test.ts
│   └── SessionStore/
│       ├── SessionStore.ts            # in-memory Map + ring buffer per session
│       └── SessionStore.test.ts
├── package.json
└── tsconfig.json

packages/host-service/src/terminal/
├── DaemonClient/
│   ├── DaemonClient.ts                # client of pty-daemon over Unix socket
│   ├── DaemonClient.test.ts
│   └── index.ts
└── terminal.ts                        # refactored: byte relay between WS and DaemonClient
```

`packages/pty-daemon/src/protocol` is the **only** thing host-service imports
from the daemon package — single source of truth for message types.

## Daemon protocol

Versioned handshake on connect; binary frames after.

### Wire format

```
+--------+---------------+
| u32 BE | JSON message  |
| length | (UTF-8)       |
+--------+---------------+
```

Length is the byte length of the JSON payload.

### Handshake (first message in either direction)

```ts
// host-service → daemon
{ type: "hello", protocols: [1] }
// daemon → host-service
{ type: "hello-ack", protocol: 1, daemonVersion: "x.y.z" }
```

Version negotiation: daemon picks highest mutually supported. Mismatch =
disconnect; coordinator handles by killing daemon and starting the
bundled-binary version.

### Operations (protocol v1)

| Type | Direction | Body | Reply |
|---|---|---|---|
| `open` | client → daemon | `{ id, shell, argv, cwd, env, cols, rows }` | `{ type: "open-ok", id, pid }` or `{ type: "error", id, message }` |
| `input` | client → daemon | `{ id, data }` (`data` base64) | none |
| `resize` | client → daemon | `{ id, cols, rows }` | none |
| `close` | client → daemon | `{ id }` | `{ type: "closed", id }` |
| `list` | client → daemon | `{}` | `{ type: "list", sessions: [{ id, pid, cols, rows, alive }] }` |
| `subscribe` | client → daemon | `{ id, replay: boolean }` | streams `output` frames; if `replay` true, ring buffer drained first |
| `unsubscribe` | client → daemon | `{ id }` | none |
| `output` | daemon → client | `{ id, data }` (base64) | — |
| `exit` | daemon → client | `{ id, code, signal }` | — |

Multiple host-service connections to the same daemon are allowed
(future-proofs multi-client / observer scenarios). Subscription set is
per-connection; daemon fans out output frames to all subscribers.

### Why no SCM_RIGHTS in v1

Daemon-upgrade handoff (Phase 2) uses `child_process.spawn` `stdio`
inheritance — kernel handles the fd dup at child spawn time, no
sendmsg required. SCM_RIGHTS is the right tool only for handing fds to
an *already-running* peer; we don't need that here.

## Manifest

New file at `~/.superset/host/{orgId}/pty-daemon-manifest.json`:

```ts
{
  pid: number;
  socketPath: string;          // e.g. /tmp/superset-{orgId}-pty-daemon.sock
  protocolVersions: number[];  // versions this daemon speaks
  daemonVersion: string;       // semver of the bundled binary
  startedAt: string;           // ISO 8601
}
```

Separate from `host-service-manifest.json` — different lifecycles. Both
manifests use the same atomic write pattern that
`apps/desktop/src/main/lib/host-service-manifest.ts` already uses.

## host-service integration

### Coordinator changes (`apps/desktop/src/main/lib/host-service-coordinator.ts`)

Add a sibling routine that mirrors host-service spawn/adopt logic
(currently `host-service-coordinator.ts:290-331`):

1. On host-service start, before spawning host-service:
   - Read `pty-daemon-manifest.json` if present.
   - If PID alive and socket connectable and protocol version
     compatible → adopt.
   - Else → spawn fresh daemon, wait for handshake, write manifest.
2. host-service is told the daemon socket path via env var
   (`SUPERSET_PTY_DAEMON_SOCKET`).

### Terminal router changes (`packages/host-service/src/trpc/router/terminal/terminal.ts` and `packages/host-service/src/terminal/terminal.ts`)

Replace `pty.spawn` paths with `DaemonClient` calls. The existing
WS-relay logic stays mostly intact — sockets attach/detach freely
already (`terminal.ts:119, 128-132, 636, 688-690`); we just swap the
inner data source from a node-pty handle to a daemon subscription.

The 64KB ring buffer at `terminal.ts:64,101-102,206-225` is **moved to
the daemon**. host-service no longer holds replay state; it asks the
daemon for replay-on-attach via `subscribe { replay: true }`.

### What stays unchanged

- Renderer code: zero changes. Same `/terminal/:id?token=PSK` WS,
  same JSON message schema, same auto-reconnect with exponential
  backoff.
- PSK auth at the host-service boundary: unchanged (daemon has no
  in-band auth; Unix socket file mode is the boundary).
- `terminalSessions` DB table: unchanged. host-service still writes
  metadata. Daemon doesn't touch the DB.

### Where the v1 daemon's bloat lands in v2

Each non-PTY responsibility moves to host-service (the upgrade-frequent
layer that *should* hold business state) or out of scope entirely:

| v1 concern | v2 home |
|---|---|
| Persistent scrollback / `HistoryWriter` | host-service if needed; default = drop. Renderer's xterm scrollback is sufficient for live terminals. |
| Cold-restore replay | host-service uses daemon's in-memory ring on reattach; no disk-backed restore. |
| Killed-session tombstones | host-service `sessions: Map` tracks "this terminalId was disposed"; daemon never knew, never cared. |
| Workspace authorization | Unix socket file mode + per-workspace daemon directory; no in-band check. |
| Port scanning | host-service / unrelated package. |
| Analytics on session lifecycle | host-service decorates `DaemonClient` calls. |
| Pending-request dedup | host-service's terminal router (it already has `ensureSession` semantics — `terminal.ts:333-527`). |
| Priority on session creation | host-service / renderer queues UI-prioritized work. |

If a future feature needs daemon support (e.g. true multi-client
attach), it gets a new versioned protocol op. The daemon's role
doesn't expand silently.

## Daemon-upgrade handoff (Phase 2)

Triggered when desktop app v_new ships with a daemon binary whose
declared protocol version isn't compatible with the running daemon.

```ts
// In the running daemon, on graceful upgrade:
const masterFds = [...sessions.values()].map((s) => s.masterFd);
const stdio: SpawnOptions["stdio"] = ["ignore", "inherit", "inherit", ...masterFds];
const sessionMeta = JSON.stringify(
  [...sessions.values()].map((s) => ({ id: s.id, cols, rows, partialBuf, ... }))
);
const child = spawn(newDaemonExe, [...args, "--inherit-meta", sessionMeta], {
  stdio,
  detached: true,
});
child.unref();
// drain socket connections gracefully, then exit
```

New daemon: master fds at `3..3+N`; reads `--inherit-meta` for session
context; resumes serving on the same socket path.

`stdio` inheritance preserves master fd refcount across the swap (Phase
0 verified). Partial buffer (bytes node-pty had read but not yet
forwarded) goes through `--inherit-meta` to avoid the byte loss
observed in the Phase 0 follow-up.

## Phased delivery

### Phase 1 — daemon delivers process continuity (target: ~2 weeks)

1. `packages/pty-daemon` skeleton + protocol package.
2. Server, handlers, SessionStore, Pty wrapper. Unit-tested.
3. Daemon manifest + coordinator adoption.
4. host-service `DaemonClient` + terminal.ts refactor to byte-relay.
5. Ring buffer migrated to daemon.
6. Renderer-side smoke test: kill host-service, observe shells survive.
7. Telemetry: `pty_daemon_spawn`, `pty_daemon_adopt`,
   `pty_daemon_session_open`, `pty_daemon_crash`,
   `host_service_restart_sessions_preserved`.

**Exit criterion:** killing host-service in any way (SIGTERM, SIGKILL,
upgrade) does not lose any shell. Renderer's existing reconnect
machinery rebinds to the daemon-owned PTYs cleanly.

### Phase 2 — daemon upgrades also preserve shells (target: ~1 week, optional until daemon protocol changes)

1. `--inherit-meta` argv path in daemon.
2. Graceful upgrade entry point: spawn new self with `stdio`
   inheritance, drain, exit.
3. Test: bump daemon protocol version, run upgrade flow, verify all
   shells survive.

**Exit criterion:** desktop app version bumps that change the daemon
binary preserve all shells across the daemon swap.

## Testing strategy

| Layer | Tool | What it tests |
|---|---|---|
| Protocol codec | bun test | Length-prefixed frames, version handshake, bad-input rejection |
| Handlers | bun test (mocked node-pty) | Each operation's behavior in isolation |
| Pty wrapper | bun test | Spawn, write, resize, exit, fd exposure |
| SessionStore | bun test | Ring buffer eviction, replay correctness |
| End-to-end | a Bun script + real daemon binary on a temp socket | Open → input → resize → close lifecycle |
| host-service crash | integration | SIGKILL host-service, verify shells alive, renderer reattaches |
| Daemon crash | integration | SIGKILL daemon, verify host-service surfaces clean errors and respawns daemon |
| Phase 2 handoff | integration | Spawn old + new daemon, hand off, verify session continuity |

CI matrix: macOS + Linux. Windows = Phase 1 smoke test only.

## Telemetry

PostHog events with `surface: "v2-desktop"`:

- `pty_daemon_spawn` — daemon started by host-service.
- `pty_daemon_adopt` — host-service adopted existing daemon.
- `pty_daemon_session_open` — new PTY opened. Properties: workload kind,
  cols, rows.
- `pty_daemon_session_exit` — session ended. Properties: code, signal,
  duration, total bytes.
- `pty_daemon_crash` — daemon exited unexpectedly. Properties: PID, age,
  open session count.
- `host_service_restart_sessions_preserved` — host-service restarted;
  count of sessions preserved (i.e., visible to the new host-service via
  daemon `list`). The headline metric for this work.

`pty_daemon_crash` is treated as a bug signal, not a metric. Each one
should generate an issue.

## Open decisions

1. **Daemon binary path.** Bundle alongside host-service in the
   Electron app's resources, or symlink from a global location? Lean:
   bundled per-app for simpler updates, but means each installed
   desktop version has its own daemon binary path.
2. **Per-workspace vs global daemon.** Locked above as per-workspace,
   mirroring host-service. Reconsider if process count becomes a real
   issue (>20 simultaneous workspaces).
3. **Sub-cap on daemon supervised respawn.** If the daemon crashes
   N times in M seconds, do we stop respawning and surface a hard
   error? Default: 3 in 60s → stop, surface error to user.
4. **node-pty version pinning.** Pin to the exact version we tested
   in Phase 0 (`1.1.0`)? Lean: yes, until we have a process for
   re-validating.

## Out of scope (explicit)

- C2-only / host-service re-exec. Rejected per
  [survey doc](./20260428-pty-handoff-survival-architectures.md#recommendation).
- Linux + macOS x86_64 Phase 0 re-runs. To be done before shipping
  the daemon to those platforms; not blocking the Phase 1 build.
- Windows daemon-upgrade survival. Out of scope until Windows users
  justify the work.
- Multi-client / observer mode. Daemon protocol leaves room (multiple
  subscribers per session) but no host-service or renderer surface for
  it in v1.
- Migration of the v1 terminal. v1 stays on its current path.

## References

- Survey: [`20260428-pty-handoff-survival-architectures.md`](./20260428-pty-handoff-survival-architectures.md)
- Phase 0 harness: `apps/desktop/plans/pty-handoff-experiment/`
- Existing manifest pattern: `apps/desktop/src/main/lib/host-service-manifest.ts`
- Existing coordinator: `apps/desktop/src/main/lib/host-service-coordinator.ts:290-331`
- Existing terminal flow: `packages/host-service/src/terminal/terminal.ts`
- **v1 daemon (the cautionary tale):**
  - `apps/desktop/src/main/lib/terminal/daemon/daemon-manager.ts` (1009 LOC)
  - `apps/desktop/src/main/lib/terminal/daemon/history-manager.ts` (245 LOC)
  - `apps/desktop/src/main/lib/terminal/daemon/priority-semaphore.ts` (76 LOC)
  - Total ≈ 1330 LOC; ~56% of `daemon-manager.ts` is non-PTY concerns
    (history persistence, cold restore, killed-session tombstones,
    in-process event routing). v2 target ≈ 500–700 LOC by leaving
    those concerns in host-service.
