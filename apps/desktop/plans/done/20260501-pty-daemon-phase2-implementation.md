# Phase 2 Implementation Plan — Daemon-Upgrade FD-Handoff

**Date:** 2026-05-01
**Status:** ready to build
**Companion docs:**
- `20260501-pty-daemon-phase2-audit.md` (current-state audit)
- `20260430-pty-daemon-host-service-migration.md` (Phase 1, shipped)
- `pty-handoff-experiment/` (Phase 0 harness — primitives validated)

## Goal

Preserve PTY sessions across daemon-binary upgrades. Today, "Restart and update" SIGTERMs the daemon and all shells die in the gap. After Phase 2, the new daemon binary takes over via fd inheritance — sessions stay alive, the user sees no flicker.

## Decisions (from /decide walkthrough on 2026-05-01)

| # | Decision | Choice | Implication |
|---|---|---|---|
| 1 | What new daemon inherits | **PTY master fds only** (listener inheritance dropped after spike) | Old daemon unlinks + exits, new daemon binds fresh. host-service's daemon-client sees a brief disconnect and reconnects via existing retry logic. **Sessions stay alive — that's what fd inheritance is actually for.** |
| 2 | Old daemon exit timing | Ack-then-exit | Spawn successor → wait for `upgrade-ack` over control fd → exit. If ack fails, old daemon stays alive |
| 3 | Session metadata transport | Snapshot file + manifest pointer | Old daemon writes `pty-daemon-handoff-snapshot.json`, manifest points at it, new daemon reads + clears |
| 4 | Restart UX | Handoff is default ("Update"); "Force restart" stays as opt-in | New mutation `terminal.daemon.update()`; existing `restart()` keeps kill+respawn semantics |
| 5 | Handoff failure mode | Surface to user with dialog | On failure, renderer offers "Force update" (= old `restart()`) or "Cancel" |
| 6 | Handoff protocol | Separate control-fd protocol; client wire stays at v1 | New file `protocol/handoff.ts`; `messages.ts` and `version.ts` untouched |

### D1 was revised after the spike

Originally D1 said "PTY fds + listener fd". The spike at
`pty-handoff-experiment/listener-handoff/` proved listener inheritance works
but exposed a foot-gun (must skip `server.close()` to keep the socket path
linked). The user pushed back: host-service is the *only* client of the
daemon socket and already has reconnect logic for the host-service-restart
adoption path. Adding listener inheritance just to avoid a ~100ms reconnect
blip wasn't worth the moving parts. **The PTY master fds are the only thing
that genuinely cannot blink — those ARE the live shells.**

## Architecture sketch

The supervisor does NOT participate in the fd transfer. The daemon spawns its
own successor, hands over PTY fds via stdio inheritance, exits. Supervisor's
existing adopted-liveness path discovers and adopts the new daemon via the
manifest — same code path as Phase 1's "host-service restart" adoption.

```
┌─ supervisor (host-service) ───────────────────────────────────────┐
│                                                                    │
│  update(orgId)                                                     │
│   │ ① wire-message "prepareUpgrade" to running daemon              │
│   ▼                                                                │
│   ┌─ daemon A (running) ──────────────────────────────────────┐    │
│   │ ② write snapshot.json                                     │    │
│   │ ③ update manifest: { handoffInProgress: true,             │    │
│   │                      handoffSnapshotPath, ... }           │    │
│   │ ④ spawn daemon B with stdio:                              │    │
│   │      fd 0: ignore                                         │    │
│   │      fd 1,2: log fds                                      │    │
│   │      fd 3..N: PTY master[0..N-3]   ← inherited            │    │
│   │      fd N+1: control fd (socketpair)                      │    │
│   │   plus env: SUPERSET_PTY_DAEMON_HANDOFF=1                 │    │
│   │            SUPERSET_PTY_DAEMON_SNAPSHOT=<path>            │    │
│   │            SUPERSET_PTY_DAEMON_SOCKET=<path>              │    │
│   └────────────────────┬──────────────────────────────────────┘    │
│                        │                                           │
│                        ▼                                           │
│   ┌─ daemon B (successor) ────────────────────────────────────┐    │
│   │ ⑤ read snapshot, adopt PTY master fds                     │    │
│   │ ⑥ write upgrade-ack on control fd                         │    │
│   │ ⑦ wait for socket path to be unbindable-then-bindable     │    │
│   │      (poll bind() with retry — succeeds once A unlinked)  │    │
│   │ ⑧ update manifest: { pid: B.pid, handoffInProgress: false }│   │
│   └────────────────────┬──────────────────────────────────────┘    │
│                        │                                           │
│   ┌─ daemon A ─────────▼──────────────────────────────────────┐    │
│   │ ⑨ ack received → server.close() (unlinks socket path)     │    │
│   │ ⑩ exit(0)                                                  │   │
│   └────────────────────┬──────────────────────────────────────┘    │
│                        │                                           │
│                        ▼                                           │
│  ⑪ supervisor's adopted-liveness check sees A's pid dead.         │
│     Re-reads manifest, finds B's pid, updates instances map.       │
│  ⑫ host-service daemon-client reconnects (existing retry logic).   │
└────────────────────────────────────────────────────────────────────┘

Failure: if step ⑥ ack times out (default 5s), supervisor SIGKILLs B,
restores manifest (clear handoffInProgress, snapshot stays for cleanup),
and leaves A running. Returns { ok: false, reason }.
```

## Sequencing — concrete code changes

### Step 1: expose `_fd` from Pty.ts (foundation)

**Files:** `packages/pty-daemon/src/Pty/Pty.ts`

- Add `getMasterFd(): number` to the `Pty` interface.
- Implement on `NodePtyAdapter`: `return (this.term as unknown as { _fd: number })._fd`.
- Add startup assert in `main.ts`: confirm `_fd` is a number; fail loudly with a clear node-pty version message if not.
- Pin `node-pty` to `1.1.x` in `packages/pty-daemon/package.json` (no caret).
- Test: `Pty.test.ts` — spawn, assert `getMasterFd()` returns a positive integer, confirm fcntl reports it open.

### Step 2: build the handoff control-fd protocol

**Files:** `packages/pty-daemon/src/protocol/handoff.ts` (new)

Tiny dedicated wire format, length-prefixed JSON frames over fd 7 (matches existing `framing.ts` format so we can reuse `encodeFrame`/`FrameDecoder`).

```ts
export type HandoffMessage =
  | { type: "upgrade-init"; snapshotPath: string; sessionFds: SessionFdMapping[] }
  | { type: "upgrade-ack"; ok: true }
  | { type: "upgrade-nak"; ok: false; reason: string };

export interface SessionFdMapping {
  sessionId: string;
  pid: number;
  fdIndex: number;  // index into the inherited stdio fds
}
```

- Reuse `encodeFrame`/`FrameDecoder` from `framing.ts`.
- No changes to `protocol/messages.ts` or `protocol/version.ts`.
- Test: `handoff.test.ts` — round-trip encode/decode each message variant.

### Step 3: snapshot writer + reader

**Files:** `packages/pty-daemon/src/SessionStore/snapshot.ts` (new)

```ts
interface HandoffSnapshot {
  version: 1;
  writtenAt: number;
  sessions: SerializedSession[];
}

interface SerializedSession {
  sessionId: string;
  pid: number;
  meta: SessionMeta;          // existing protocol type
  lastSeq: number;
  ringBuffer: string;          // base64
  exited: false;               // exited sessions are filtered out
  // Note: subscribers are NOT serialized — clients reconnect after handoff.
}

export function writeSnapshot(path: string, sessions: Session[]): void;
export function readSnapshot(path: string): HandoffSnapshot;
export function clearSnapshot(path: string): void;
```

- Atomic write: write to `path + ".tmp"` then `rename`.
- `clearSnapshot` is `unlink` swallowing ENOENT.
- Test: `snapshot.test.ts` — round-trip a populated SessionStore through write+read.

### Step 4: extend manifest schema

**Files:** `packages/host-service/src/daemon/manifest.ts`

Add optional fields (forward-compatible — old code ignores extras):

```ts
export interface PtyDaemonManifest {
  pid: number;
  socketPath: string;
  protocolVersions: number[];
  startedAt: number;
  organizationId: string;
  // Phase 2 additions (all optional, present only during handoff)
  handoffInProgress?: boolean;
  handoffSnapshotPath?: string;
  handoffSuccessorPid?: number;
}
```

- Update `readPtyDaemonManifest` to type-check the new fields leniently.
- Test: `manifest.test.ts` — read-back of manifest with handoff fields, parse-tolerance to extra fields.

### Step 5: daemon-side handoff (sender)

**Files:** `packages/pty-daemon/src/Server/Server.ts`, `packages/pty-daemon/src/handlers/handlers.ts`

Add a wire handler for the new `prepareUpgrade` message (received from supervisor over the existing daemon-client socket).

In `Server`:
- Add `prepareUpgrade(newBinaryPath: string)`:
  1. Suspend `onData` event handlers; buffer bytes to ring.
  2. Gather session state into a `HandoffSnapshot` (Step 3) and write to disk.
  3. Update manifest: `{ handoffInProgress: true, handoffSnapshotPath }`.
  4. Build the stdio array: `["ignore", logFd, logFd, ...ptyMasterFds, controlSockOurEnd]`.
     - Use `node:net` `socketpair` shim or `node:dgram`'s socket pair... actually, Node has no public socketpair API. Workaround: open a temporary AF_UNIX listener on a side-path (like the spike did), child connects to it. Or use `child_process.fork`'s built-in IPC channel (`stdio: 'ipc'`) — that gives us a duplex JSON channel for free.
  5. Spawn successor with `process.execPath` + `[newBinaryPath]` and env `SUPERSET_PTY_DAEMON_HANDOFF=1`, `SUPERSET_PTY_DAEMON_SNAPSHOT=<path>`, `SUPERSET_PTY_DAEMON_SOCKET=<existing socket path>`.
  6. Wait for `upgrade-ack` from successor (5s timeout).
  7. On ack: reply to supervisor with `upgrade-ok { successorPid }`. Then `server.close()` (unlinks socket path) and `process.exit(0)`. Successor is waiting to bind.
  8. On nak/timeout: SIGKILL successor, restore manifest, resume `onData` handlers, reply `upgrade-failed { reason }`.

### Step 5b: daemon-side handoff (receiver)

**Files:** `packages/pty-daemon/src/main.ts`

When env `SUPERSET_PTY_DAEMON_HANDOFF=1`:
1. Don't call `server.listen()` yet. The old daemon still owns the socket path.
2. Read snapshot from `SUPERSET_PTY_DAEMON_SNAPSHOT`.
3. For each session in the snapshot, call `Pty.adoptFromFd(...)` with the inherited fd index.
4. Open the IPC control channel (Node's built-in if we used `stdio: 'ipc'`, otherwise our temp side-socket).
5. Send `upgrade-ack { pid: process.pid }` on the control channel.
6. Now bind the socket. Loop with retry: `try server.listen(socketPath); catch EADDRINUSE: wait 50ms, retry. timeout 5s.`
7. Once bound: update manifest to point at our pid, clear `handoffInProgress`. Begin normal operation.
8. From here, behaves exactly like a normal pty-daemon: any old wire connections (host-service was disconnected during the unbind window) reconnect.

### Step 6: PTY adoption from inherited fd

**Files:** `packages/pty-daemon/src/Pty/Pty.ts`

This is the gnarly part. node-pty's normal `spawn()` creates a new PTY pair; we need a constructor that takes an *existing* master fd and rebuilds the IPty-like surface.

Implementation:
- Add `adoptFromFd(fd: number, pid: number, meta: SessionMeta): Pty`.
- It can't reuse `nodePty.spawn` — instead, build a minimal adapter directly on the fd:
  - Use `fs.createReadStream(null, { fd })` for `onData`.
  - Use `fs.createWriteStream(null, { fd })` for `write`.
  - For `resize`: use `koffi` or a tiny native helper to call `ioctl(fd, TIOCSWINSZ, ...)`. **Or** skip resize support during the handoff window and accept that — most users don't resize within the millisecond handoff. (Defer this; document as a known gap.)
  - For `kill`: `process.kill(pid, signal)` — same as today's NodePtyAdapter delegates to.
  - For `onExit`: SIGCHLD handling? Or just rely on read-stream-end (the kernel closes the master when the child exits)? **Phase 0 harness used the latter — the readable stream emits "end" when the slave side closes.**
- Test: `Pty.test.ts` adds an adoption case — spawn → get fd → simulate handoff by calling `adoptFromFd` with the same fd → confirm bidirectional IO still works.

### Step 7: supervisor `update()` method

**Files:** `packages/host-service/src/daemon/DaemonSupervisor.ts`

```ts
async update(organizationId: string): Promise<UpdateResult>;

interface UpdateResult {
  ok: boolean;
  successorPid?: number;
  reason?: string;
}
```

Supervisor's job is now narrow — it doesn't touch any fds. It just:

1. Mark `handoffInProgress` set entry for orgId (prevents `pendingStarts`/crash-respawn races during the handoff window).
2. Send a wire-protocol `prepareUpgrade` message to daemon A over the existing daemon-client socket. Include the path of the new daemon binary.
3. Wait for daemon A to either reply `upgrade-ok { successorPid }` or `upgrade-failed { reason }`. Timeout: 10s.
4. On `upgrade-ok`: nothing more to do. The adopted-liveness loop will detect daemon A's exit and re-adopt via the manifest. Clear `handoffInProgress`. Return `{ ok: true, successorPid }`.
5. On `upgrade-failed` or timeout: clear `handoffInProgress`, return `{ ok: false, reason }`. Daemon A is still alive; sessions preserved.

**The fd handoff itself happens entirely inside the daemon process**, not in the supervisor. See Step 5b.

### Step 8: tRPC `terminal.daemon.update`

**Files:** `packages/host-service/src/trpc/router/terminal/terminal.ts`

```ts
update: protectedProcedure.mutation(async () => {
  await waitForDaemonReady(env.ORGANIZATION_ID);
  return getSupervisor().update(env.ORGANIZATION_ID);
}),
```

Existing `restart()` stays untouched.

### Step 9: renderer Settings UI

**Files:** desktop app's V2SessionsSection (or wherever Manage daemon lives — confirm path before editing)

- Primary button: "Update" → calls `terminal.daemon.update.mutate()`.
- On `{ ok: true }`: show success toast, refresh listSessions.
- On `{ ok: false, reason }`: show dialog "Update couldn't preserve sessions: {reason}. Force update (closes terminals) or cancel?" — Force update calls existing `terminal.daemon.restart.mutate()`.
- Secondary button (always visible, less prominent): "Force restart" → calls `terminal.daemon.restart.mutate()` directly.

### Step 10: tests

- **Unit:** `protocol/handoff.test.ts`, `SessionStore/snapshot.test.ts`, `Pty.test.ts` (adoption case), `manifest.test.ts` (handoff fields).
- **Daemon integration:** `Server.handoff.node-test.ts` — spawn daemon A with N sessions, trigger handoff to daemon B (real binary), assert sessions survive and bytes are continuous (counter workload, like Phase 0).
- **Supervisor integration:** `DaemonSupervisor.handoff.node-test.ts` — call `update()`, confirm new pid is in instances, old daemon exited cleanly, sessions still listed.
- **tRPC:** `terminal.daemon.test.ts` — wire `update` mutation; mock supervisor and assert delegation.
- **Phase 0 harness extension:** run the existing harness on Linux x86_64 + high-N (1000) before merge.

## Open implementation questions

1. **~~Listening socket fd ownership~~ — RESOLVED by spike on 2026-05-01.** D1 was revised to drop listener inheritance entirely. New daemon binds fresh after old daemon unlinks. host-service's daemon-client reconnect handles the brief disconnect window.

2. **PTY exit detection on adopted fd.** Current `node-pty` uses libuv to wait on the child via waitpid; the adopted-fd path won't have access to the child handle. Need to confirm: when shell child exits, does the master fd's read stream emit 'end'? (Phase 0 harness behavior suggests yes, but verify in Node specifically before Step 6.)

3. **Resize on adopted fd.** TIOCSWINSZ ioctl from Node — `koffi` is the lightweight option. Alternative: ship a small native module. Or accept "no resize during handoff window" since the window is sub-second.

4. **Control fd between old + new daemon.** Phase 0 nodepty harness used `child_process.spawn` with stdio[3]=raw fd. The cleaner Node option is `stdio: 'ipc'` which gives a built-in JSON duplex channel via `process.send()` / `'message'` events. Pick one before Step 5.

## Risks / mitigations

| Risk | Mitigation |
|---|---|
| node-pty `_fd` access breaks in a future bump | Pin to 1.1.x, startup assert |
| Listener fd transfer doesn't work via `process.send` | Spike before committing; fall back to side-channel |
| Adopted fd's onExit doesn't fire | Test in Step 6; if it doesn't, add SIGCHLD reaper at daemon level |
| Both daemons live for a moment — does macOS allow two binds to the same socket? | No — but in our flow only one daemon owns the listener fd at a time (supervisor takes ownership during the gap) |
| Snapshot file orphaned if successor crashes | Supervisor cleans on failure; daemon cleans on successful adopt |

## Sequencing for actual commits

Suggested commit order (each commit should pass tests):

1. `feat(pty-daemon): expose master fd from Pty adapter` (Step 1)
2. `feat(pty-daemon): handoff protocol + snapshot encoder` (Steps 2, 3)
3. `feat(host-service): manifest fields for handoff state` (Step 4)
4. `feat(pty-daemon): adopt PTY sessions from inherited master fd` (Step 6, scoped before Step 5 because Step 5 depends on it)
5. `feat(pty-daemon): Server prepareHandoff / adoptHandoff` (Step 5)
6. `feat(host-service): DaemonSupervisor.update() with fd handoff` (Step 7)
7. `feat(host-service): terminal.daemon.update tRPC procedure` (Step 8)
8. `feat(desktop): wire Update button to handoff flow` (Step 9)
9. `test: handoff integration coverage` (parts of Step 10 not covered above)

Bump `EXPECTED_DAEMON_VERSION` and `packages/pty-daemon/package.json#version` to e.g. `0.2.0` once Step 5 lands so the renderer can show the "update available" badge against pre-handoff daemons.

## Out of scope for this PR

- Linux + high-N + SIGKILL stress validation of Phase 0 harness — should be run, but lives in the design-doc branch.
- Cross-platform: Windows is unaddressed; macOS x86_64 untested.
- Telemetry promotion — current `console.log` JSON lines stay; PostHog plumbing tracked separately.
- Mid-handoff resize support (deferred per Step 6 note).
