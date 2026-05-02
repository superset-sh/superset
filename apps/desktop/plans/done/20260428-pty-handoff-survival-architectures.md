# PTY Survival Across Host-Service Upgrades — Architecture Survey

**Status:** Decision doc.
**Owner:** Kiet
**Date:** 2026-04-28
**Branch:** `pty-manifest-detach-reatt`

Survey of architectures for keeping `node-pty` shells alive across
host-service upgrades. PoC of SCM_RIGHTS fd-passing in
`~/workplace/pty-handoff-poc/`.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Today's Behavior](#todays-behavior)
- [Survival Bars](#survival-bars)
- [Architectures](#architectures)
  - [A. Status Quo: Kill + Respawn](#a-status-quo-kill--respawn)
  - [B. Serialize + Replay (VS Code-style)](#b-serialize--replay-vs-code-style)
  - [C1. SCM_RIGHTS fd-passing with node-pty](#c1-scm_rights-fd-passing-with-node-pty)
  - [C2. SCM_RIGHTS fd-passing with direct forkpty (FFI)](#c2-scm_rights-fd-passing-with-direct-forkpty-ffi)
  - [D. Long-Lived `pty-daemon`](#d-long-lived-pty-daemon)
  - [E. Hybrid: Daemon + fd-passing on daemon upgrade](#e-hybrid-daemon--fd-passing-on-daemon-upgrade)
  - [F. tmux / screen / abduco as the backend](#f-tmux--screen--abduco-as-the-backend)
  - [G. exec() in-place upgrade](#g-exec-in-place-upgrade)
  - [H. OS Supervisor (launchd / systemd socket activation)](#h-os-supervisor-launchd--systemd-socket-activation)
  - [I. CRIU (Linux-only checkpoint/restore)](#i-criu-linux-only-checkpointrestore)
  - [J. Mosh-style state sync](#j-mosh-style-state-sync)
- [Windows (ConPTY)](#windows-conpty)
- [Comparison Table](#comparison-table)
- [PoC Findings](#poc-findings)
- [Recommendation](#recommendation)
- [Phased Plan](#phased-plan)
- [Phase 0: C2 Reliability Test Plan (gating)](#phase-0-c2-reliability-test-plan-gating)
- [Phase 0 Results (macOS arm64, 2026-04-29)](#phase-0-results-macos-arm64-2026-04-29)
- [Phase 0 Follow-up: node-pty handoff (macOS arm64, 2026-04-29)](#phase-0-follow-up-node-pty-handoff-macos-arm64-2026-04-29)
- [Appendix: PTY Library Evaluation](#appendix-pty-library-evaluation)
- [Open Questions](#open-questions)
- [References](#references)

---

## Problem Statement

Host-service (Bun process spawned by Electron main, `packages/host-service/src/index.ts`,
manifest in `apps/desktop/src/main/lib/host-service-manifest.ts`) owns
`node-pty` master fds for every v2 terminal session. Restarting host-service
kills all PTYs.

The manifest already handles Electron-main-restart (adopt detached
host-service via PID + endpoint on disk). Unsolved: host-service binary
version bumps.

**Hard constraints:**

1. **Process continuity required.** Shells survive upgrades. Kill+respawn
   (A) and serialize+replay (B) are not acceptable, even as fallbacks.
2. **Host-service upgrades happen frequently.** Architecture must treat
   upgrades as a hot path.

Non-trivial because Node's `process.send` only passes net/dgram handle
wrappers, not arbitrary fds (`node/lib/internal/child_process.js:91`).

## Today's Behavior

- `host-service-coordinator.ts:157-163` SIGTERMs old, spawns fresh; PTYs die.
- Renderer reconnects via `tRPC.terminal.createOrAttach` to a new shell.
- ~64KB ring buffer per session in-memory only
  (`packages/host-service/src/terminal/terminal.ts:64`) — lost.
- `terminalSessions` row exists (`packages/host-service/src/db/schema.ts:9-30`)
  with metadata only, no PTY state.

## Survival Bars

1. **Visual continuity.** Renderer redraws prior screen. New shell PID,
   running commands killed. (VS Code's bar.) **Excluded by constraint.**
2. **Process continuity.** Same shell PID, commands keep running.
   **Our minimum bar.**
3. **Bit-for-bit continuity.** No data loss between handoff. Polish on top of (2).

---

## Architectures

### A. Status Quo: Kill + Respawn

Current behavior. `host-service-coordinator.ts:157-163`. Every shell
dies on every upgrade.

**Status: excluded by constraint.**

---

### B. Serialize + Replay (VS Code-style)

**Bar:** visual only.

**Mechanism:** mirror PTY output into headless xterm; serialize buffer to
DB on shutdown; respawn shell + replay buffer through WS on startup.
Working dir restored manually (`echo $PWD`/`cd`); env mutations and
running commands lost.

**Code sketch:**

```ts
import { Terminal as XtermHeadless } from "@xterm/headless";
import { SerializeAddon } from "@xterm/addon-serialize";

session.onData((d) => headless.get(session.id)!.term.write(d));

// Shutdown:
for (const [id, { ser }] of headless) {
  await db.update(terminalSessions).set({
    serializedBuffer: ser.serialize({ scrollback: 1000 }),
  }).where(eq(terminalSessions.id, id));
}
// Startup: ws.send({ type: "replay", data: row.serializedBuffer });
```

**OSS prior art:** VS Code `ptyService.ts:687-960` (`PersistentTerminalProcess`),
`:1032-1108` (`XtermSerializer`); `LocalReconnectConstants.GraceTime = 60000`
(`common/terminal.ts:846-861`). Uses `xterm-headless` + `@xterm/addon-serialize`.

**Pros:** pure JS, all platforms, ~1 week.
**Cons:** running commands die. Only visual continuity.

**Status: excluded by constraint.**

---

### C1. SCM_RIGHTS fd-passing with node-pty

**Bar:** process continuity (same PID).

**Mechanism:** old host-service spawns new, hands PTY master fd via
`sendmsg(SCM_RIGHTS)` over Unix socket, waits for ack, exits. Kernel
dups the fd; refcount stays > 0; slave (shell) sees no change.

Three ways to call `sendmsg` from JS:

1. Native N-API addon (~100 LOC C++, node-gyp).
2. `usocket` npm package — broken on Node 24 (PoC confirmed).
3. **Bun's `bun:ffi cc`: inline C, zero install. PoC uses this.**

**Code (excerpt from `~/workplace/pty-handoff-poc/scm.c`):**

```c
int send_fd(int sockfd, int fd_to_send, const uint8_t *data, int data_len) {
  struct iovec iov = { .iov_base = (void *)data, .iov_len = data_len };
  union { char buf[CMSG_SPACE(sizeof(int))]; struct cmsghdr align; } u;
  struct msghdr msg = {
    .msg_iov = &iov, .msg_iovlen = 1,
    .msg_control = u.buf, .msg_controllen = sizeof(u.buf),
  };
  struct cmsghdr *cmsg = CMSG_FIRSTHDR(&msg);
  cmsg->cmsg_level = SOL_SOCKET;
  cmsg->cmsg_type = SCM_RIGHTS;
  cmsg->cmsg_len = CMSG_LEN(sizeof(int));
  memcpy(CMSG_DATA(cmsg), &fd_to_send, sizeof(int));
  return sendmsg(sockfd, &msg, 0);
}
```

```ts
import { cc } from "bun:ffi";
const lib = cc({ source: "./scm.c", symbols: { /* ... */ } }).symbols;
const masterFd = lib.dup_fd((term as any)._fd); // dup early — see PoC gotcha
// send via sendmsg; receiver: new tty.ReadStream(receivedFd)
```

**PoC results:**
- ✅ SCM_RIGHTS works in Bun via `cc`.
- ✅ Received fd is a real `/dev/ptmx` master.
- ✅ Read/write through dup'd fd works.
- ❌ Shell dies on macOS when original host-service exits.

**Original (now corrected) interpretation:** "node-pty on macOS uses a
`spawn-helper` subprocess; helper dies when parent exits, takes bash with
it." A subsequent Node + node-pty 1.1 experiment (2026-04-29) showed this
framing is incorrect: `term.pid` *equals* the shell PID (`spawn-helper`
exec's into the shell rather than persisting), and shells survive parent
exit fine **as long as another process holds a reference to the master
fd.** The C1 PoC's failure was actually the same kernel-level mechanism
that affects every PTY architecture: when the master's last fd
reference closes, the kernel sends SIGHUP to the shell session, and
bash exits on SIGHUP by default.

**Real gotcha:** the master fd reference must not drop to zero across
the handoff. The Go harness handles this by `dup`ing before sending and
keeping the dup alive in the receiver; the Node experiment handles it
via `child_process.spawn` with the master fd inherited through the
`stdio` array. Either works, on either runtime.

**Status: with proper fd discipline, C1 (node-pty + handoff) works on
macOS too.** The architectural distinction between C1 and C2 collapses
into "which library spawns the shell" — both are viable for D *and* E
on macOS arm64 (verified). C2 (creack/pty + Go) is still preferred
on the "small static binary, no Node runtime" axis if we want a Go
daemon; otherwise node-pty in a Node/Bun daemon is equally correct.

---

### C2. SCM_RIGHTS fd-passing with direct `forkpty`

**Bar:** process continuity, all Unix.

**Mechanism:** bypass node-pty. Call `forkpty(3)` directly. forkpty does
`open(/dev/ptmx)` + `grantpt` + `unlockpt` + `fork` + `setsid` + makes
slave the controlling tty. Bash is a direct child in its own session,
reparents to launchd/init when its parent process exits.

Recommended runtime: **Go**, using `creack/pty` for spawn and
`golang.org/x/sys/unix.UnixRights` for SCM_RIGHTS. Both call `forkpty`
and `sendmsg` directly, ship as part of a static binary, and avoid
node-pty's macOS spawn-helper interposition. See the
[PTY library appendix](#appendix-pty-library-evaluation) for the full
comparison.

**Sketch (Go):**

```go
// spawn
ptmx, err := pty.Start(exec.Command("/bin/bash", "-l"))
// ptmx is *os.File over /dev/ptmx master; child has setsid + ctty.

// hand off
oob := unix.UnixRights(int(ptmx.Fd()))
unix.Sendmsg(connFd, sessionMetaJSON, oob, nil, 0)

// receive in new process
n, oobn, _, _, _ := unix.Recvmsg(connFd, buf, oobBuf, 0)
cmsgs, _ := unix.ParseSocketControlMessage(oobBuf[:oobn])
fds, _ := unix.ParseUnixRights(&cmsgs[0])
ptmx := os.NewFile(uintptr(fds[0]), "ptmx")
```

**OSS prior art:** tmux `spawn.c:386`; `creack/pty` on macOS
(`creack/pty/pty_darwin.go`) and Linux (`creack/pty/pty_linux.go`);
node-pty uses `forkpty` on Linux (`node-pty/src/unix/pty.cc:438`) but
diverges to spawn-helper on macOS — `creack/pty` does not.

**Pros:** removes spawn-helper dependency; same `setsid` guarantee
everywhere; Go's `golang.org/x/sys` is stable, no experimental tooling;
static binary distribution; trivial cross-compile.

**Cons:** introduces Go to the repo; we re-implement small pieces around
node-pty's surface (resize, exit handling) — but `creack/pty` covers most
of this. Windows path entirely separate (ConPTY).

**Status: untested for handoff-with-shell-survival. Mandatory empirical
validation before architecture commit — see [Phase 0](#phase-0-c2-reliability-test-plan-gating).**

---

### D. Long-Lived `pty-daemon`

**Bar:** process continuity. Shell PID never changes across host-service
upgrades.

**Mechanism:** split host-service in two:

```
WS / tRPC ──► host-service (upgrades freely)
                   │ Unix socket
                   ▼
              pty-daemon (rarely upgrades, owns PTY fds)
                   │
                   ▼
              bash, ssh, vim, ...
```

Daemon exposes Unix-socket protocol: open, input, output, resize, close.
host-service is a byte relay between daemon and WS.

Same architecture as `dtach`, `abduco`, `tmux server`.

**Code sketch:**

```ts
// pty-daemon
const sessions = new Map<string, IPty>();
Bun.listen({
  unix: "/var/superset/pty-daemon.sock",
  socket: { data(socket, data) {
    const msg = decode(data);
    if (msg.type === "open") {
      const t = pty.spawn(msg.shell, msg.argv, msg.opts);
      sessions.set(msg.id, t);
      t.onData((d) => socket.write(encode({ type: "data", id: msg.id, d })));
    } else if (msg.type === "input") sessions.get(msg.id)?.write(msg.data);
    else if (msg.type === "resize") sessions.get(msg.id)?.resize(msg.cols, msg.rows);
  }},
});
```

**OSS prior art:**
- dtach `master.c:450-565` (~100 LOC select loop, minimal reference).
- abduco `server.c:139-260` (multi-client, ~300 LOC C).
- tmux `server.c:176, 264`, `spawn.c:386`.
- VS Code's PtyHost (`ptyHostService.ts`) — same shape; VS Code does
  kill its PtyHost on restart, daemon here would not.

**Pros:** host-service stateless re PTYs, upgrades freely; protocol is
small and ours; no fd-passing for routine upgrades; daemon is small (KB);
easy to observe.

**Cons:** one extra process per workspace (or one global — design Q);
daemon has its own upgrade story; daemon crash = all PTYs lost; protocol
is now versioned public surface; one extra socket hop (~tens µs);
manifest grows to track two endpoints.

---

### E. Hybrid: Daemon (D) + fd-passing (C2) on daemon upgrade

D is steady-state. When the *daemon* upgrades (rare), C2 hands sessions
over to a new daemon binary. Only configuration with zero-downtime on
all upgrade paths.

**Cons:** combined complexity; two upgrade paths to test; macOS
fd-passing depends on C2 working (see Open Question #1).

---

### F. tmux / screen / abduco as the backend

**Bar:** process continuity, battle-tested.

**Mechanism:** run shells inside tmux. host-service connects via
`tmux -CC` control mode.

```ts
const id = `superset-${sessionId}`;
const tmuxSock = `/tmp/superset-tmux.sock`;
pty.spawn("tmux", ["-S", tmuxSock, "new-session", "-A", "-s", id, "-d", shell, ...args]);
const attach = pty.spawn("tmux", ["-S", tmuxSock, "-CC", "attach", "-t", id]);
```

**OSS prior art:** tmux (30 years); `tmux -CC` (iTerm2 uses this); abduco.

**Pros:** battle-tested; scrollback/resize/detach free; remote-attach free.

**Cons:** must bundle tmux (cross-platform binary distribution); tmux
escape sequences may not match xterm.js perfectly; nested-tmux UX for
users already in tmux; control-mode protocol to wrap; less control over
semantics.

---

### G. `exec()` in-place upgrade

**Bar:** process continuity, single process.

**Mechanism:** running host-service `execve`s the new binary. Same PID,
fd table preserved (modulo `O_CLOEXEC`). New binary picks up fds via
serialized table (env var / fd 3+4 / memfd). HAProxy/nginx pattern.

**Code sketch:**

```ts
for (const [id, term] of sessions) {
  fcntl(term._fd, F_SETFD, fcntl(term._fd, F_GETFD) & ~FD_CLOEXEC);
}
process.env.SUPERSET_FD_TABLE = JSON.stringify(/* ... */);
execv("/path/to/new/host-service", [...]);
```

**OSS prior art:** HAProxy `-x`, nginx `USR2`, Erlang hot reload (spirit).

**Pros:** no daemon; same PID throughout; fd preservation free via
execve.

**Cons:** Bun/Node don't expose `execve` from JS — needs FFI;
re-attaching stream wrappers to inherited fds is unusual (same work as
C2); macOS sets `O_CLOEXEC` by default; in-process state (WS connections)
resets on exec; Electron parent's child-watcher must tolerate the binary
swap.

---

### H. OS Supervisor (launchd / systemd socket activation)

**Bar:** infra-level supervision; doesn't itself solve survival.

**Mechanism:** register host-service as launchd LaunchAgent / systemd
user unit with socket activation. Combine with C2 or D for actual PTY
survival.

**OSS prior art:** systemd `ListenStream=`, launchd `Sockets`,
`launch_activate_socket(3)`.

**Pros:** OS handles supervision/restart/log rotation; pairs with D.

**Cons:** desktop apps don't usually install background services;
code-signing/notarization implications on macOS; doesn't itself solve
PTY survival; install/uninstall complexity.

---

### I. CRIU (Linux-only checkpoint/restore)

Snapshot full process tree, restore into new binary.

**Cons:** Linux only; needs `CONFIG_CHECKPOINT_RESTORE` and often root;
designed to restore *identical* processes, not new binaries; heavy.

**Verdict:** not viable.

---

### J. Mosh-style state sync

Per-shell mosh-server keeps a framebuffer; client diffs over UDP;
host-service reconnects after upgrade.

**Cons:** designed for unreliable network links — ours is local IPC;
massive overkill; full SSP re-implementation; client is C++.

**Verdict:** wrong tool.

---

## Windows (ConPTY)

ConPTY: `CreatePseudoConsole`, `ResizePseudoConsole`, `ClosePseudoConsole`.
**No SCM_RIGHTS equivalent.** `DuplicateHandle` exists but requires the
target process's HANDLE — the target must already exist when you call
it. There is no "exec self and inherit fds" primitive comparable to
SCM_RIGHTS.

Workable on Windows:
- **D (daemon owns ConPTY):** ✅ works. Daemon stays alive while
  host-service upgrades; routine host-service upgrades touch nothing.
- **B (serialize+replay):** would work mechanically but is excluded by
  the project constraint.
- **F (tmux/abduco backend):** out — tmux doesn't run on Windows
  without WSL.
- **C/E fd-passing:** does not apply.

With B excluded by constraint, **D is the only Windows option for
host-service upgrades.** *Daemon* upgrades on Windows are an unsolved
sub-problem — there's no clean equivalent to C2's exec-and-handoff
dance. Plausible future paths: `DuplicateHandle` between two daemon
processes coordinated via named pipe (more bespoke), or accept shell
loss on daemon upgrade only. Defer until we have Windows users.

---

## Comparison Table

| | Bar | macOS | Linux | Windows | LOC | Procs | Risk |
|---|---|---|---|---|---|---|---|
| A. Status quo | none | y | y | y | 0 | 1 | none |
| B. Serialize+replay | visual | y | y | y | ~500 | 1 | low |
| C1. fd-handoff + node-pty | process | **y (re-tested 2026-04-29)** | likely y | n | ~300 | 1 | medium |
| C2. SCM_RIGHTS + forkpty | process | **y (Phase 0 ✅ macOS arm64)** | gated by Phase 0 | n | ~600 | 1 | medium-high |
| D. pty-daemon | process | y | y | y | ~1500 | 2 | medium |
| E. D + C2 hybrid | process | y | y | partial (D only) | ~2000 | 2 | high |
| F. tmux backend | process | y (bundled) | y (bundled) | n | ~400 | 2+ | medium |
| G. exec() in-place | process | y | y | n | ~700 | 1 | high |
| H. OS supervisor | infra | y | y | maybe | ~300 | 1 | install-UX |
| I. CRIU | full | n | y | n | ~1000+ | 1 | very high |
| J. Mosh-style | net roam | y | y | y | ~3000+ | 2 | very high |

LOC = order of magnitude including refactor + tests.

---

## PoC Findings

`~/workplace/pty-handoff-poc/` (Bun + node-pty + inline-C SCM_RIGHTS via
`bun:ffi cc`):

1. SCM_RIGHTS works in JS. ~80 LOC C; no node-gyp.
2. Received fd is a real `/dev/ptmx` master.
3. Read/write through dup'd fd works.
4. **Gotcha 1:** `term._fd` can be recycled between `pty.spawn` and
   `sendmsg` (kernel reuses fd number for unrelated `accept()`). Fix:
   `dup_fd(term._fd)` immediately after spawn.
5. **Gotcha 2 (C1 killer):** node-pty's macOS spawn-helper dies with
   parent, takes bash with it. Specific to node-pty on macOS, not a
   fundamental fd-passing limit.

Files: `scm.c`, `scm.ts`, `process-a.ts`, `process-b.ts`, `run.sh`,
`run-idle.sh`, `README.md`.

---

## Recommendation

**Architecture E: long-lived `pty-daemon` (D) with fd-handoff for daemon
upgrades. Phase 0 (macOS arm64) empirically validates the handoff
primitive on both Go (`creack/pty` + SCM_RIGHTS) and Node (`node-pty` +
`stdio` fd inheritance); ship it.**

Phase 0 results (macOS arm64, 2026-04-29) close Open Question #1
positively in both languages: shells survive parent exit when master fd
refcount is preserved across the handoff. The choice between Go and
Node for the daemon is now an engineering preference, not a correctness
one. **Default recommendation: Node daemon using node-pty, since it
matches the rest of the codebase.** Promote to Go only if a static
binary or runtime-decoupling becomes a hard requirement.

That result *strengthens* E rather than promoting C2-only:

- **The fd-passing primitive works.** We can confidently put it in the
  daemon-upgrade path.
- **The architectural argument against C2-only stands.** host-service
  holds more than PTY fds (WebSocket connections, tRPC subscriptions,
  ring buffers, DB pool, EventBus). Re-execing it on every upgrade
  forces all of that to re-establish on every release — visible to
  the user and complex to engineer correctly. D keeps host-service
  stateless re PTYs and lets it die/be replaced freely; C2 is
  reserved for the rare daemon upgrade.
- **Daemon is the right boundary for the risk.** Phase 0's 100%
  survival is on macOS arm64 only, with idle/counter workloads only.
  Real-world failure modes (SIGKILL mid-handoff, fd table near limit,
  curses apps mid-redraw, x86_64) aren't yet covered. Localizing C2
  to rare daemon upgrades is the right risk posture even with a
  positive smoke-test result.

### Decision table (post Phase 0)

| Outcome | Architecture |
|---|---|
| Phase 0 ✅ macOS arm64 (current state) | **E** — proceed with D as foundation, C2 layer for daemon upgrades. |
| Future: Phase 0 ✅ on Linux + macOS x86_64 | Stay on E. C2-only remains rejected on architectural grounds (state model), not reliability grounds. |
| Future: Phase 0 ❌ on any platform | **D-only** on that platform. Daemon upgrades on that platform lose shells until we have a working primitive. |

### Cross-platform portability of C2

| Platform | Status | Why |
|---|---|---|
| macOS arm64 | ✅ proven (Phase 0) | `creack/pty` calls `forkpty(3)` directly; `setsid` reparents shell to launchd cleanly. |
| macOS x86_64 | High confidence, untested | Same Darwin kernel + libc; same `creack/pty/pty_darwin.go` code path. |
| Linux x86_64 / arm64 | High confidence, untested | The *easier* case. `forkpty` is canonical Unix; SCM_RIGHTS is the original Linux primitive (well-documented kernel surface). macOS was the harder target. |
| Windows | **Not portable** | ConPTY has no SCM_RIGHTS analog. `DuplicateHandle` requires the target's HANDLE — i.e. the target process must already exist when transferring. Different mechanism entirely. |

**For Unix in general, C2 is portable in theory and almost certainly
in practice. The only platform where C2 fails as a primitive is
Windows.** On Windows, D still works (daemon owns ConPTY, host-service
is a client) — what doesn't work on Windows is the *daemon-upgrade*
fd-handoff. That's a smaller problem; defer until Windows users
justify the work.

**Skipped (reasoning unchanged):**
- A, B: violate process-continuity constraint.
- C1: broken on macOS (node-pty spawn-helper).
- F: bundling cost + nested-tmux UX + cedes PTY semantics to tmux.
- G: comparable cost to C2 with no daemon separation; doesn't address
  frequent-upgrade requirement.
- H: install-UX cost; doesn't itself solve survival.
- I, J: wrong tools.

**Crash-recovery tradeoff:** without B as fallback, daemon *crashes*
lose shells. No architecture recovers a dead PTY's process. Mitigation:
small audited daemon, supervised respawn, loud crash telemetry, daemon
treated as part of trust boundary. Explicit choice: zero shell loss on
the 99% upgrade path > graceful degradation on the 1% crash path.

---

## Phased Plan

### Phase 0: C2 reliability test (gating)

✅ **Done on macOS arm64 (2026-04-29).** Results in
[Phase 0 Results](#phase-0-results-macos-arm64-2026-04-29). C2 is
reliable enough to use as the daemon-upgrade primitive. Linux +
macOS x86_64 still need a run before we ship across all platforms;
they're high-confidence based on the cross-platform analysis above
but should be verified with the same harness.

### Phase 1: Architecture D (pty-daemon)

Default runtime: **Node + `node-pty`**, given the Phase 0 follow-up.
Switch to Go + creack/pty only if static-binary distribution becomes a
hard requirement.

1. New package `packages/pty-daemon`. Node process owning all PTY
   sessions via `node-pty`. Single entry point, no bundler.
2. Versioned Unix-socket protocol: `open`, `input`, `resize`, `close`,
   `subscribe-output`. Long-lived contract.
3. Daemon manifest at `~/.superset/host/{orgId}/pty-daemon-manifest.json`.
   Tracks PID + socket path.
4. `host-service-coordinator`: spawn daemon if not running, adopt if
   running. Mirror `host-service-coordinator.ts:290-331` adoption logic.
5. Refactor `packages/host-service/src/terminal/terminal.ts` to be a
   daemon client (byte relay).
6. Supervise daemon: respawn on unexpected exit. Crashed-daemon
   sessions are lost (acknowledged).
7. Telemetry: `pty_daemon_spawn`, `pty_daemon_adopt`, `pty_daemon_crash`
   (latter is a bug signal, not a metric).

After Phase 1, host-service upgrades freely without touching shells.
Primary requirement delivered.

### Phase 2: Architecture E layer (fd-handoff on daemon upgrade)

The simplest implementation depends on the daemon runtime:

**If daemon is Node** (default after Phase 0 follow-up):

1. On daemon shutdown, spawn the new daemon binary via
   `child_process.spawn(newDaemonExe, [...args], { stdio: ['ignore',
   'inherit', 'inherit', ...masterFds] })`. Kernel handles the fd dup;
   no SCM_RIGHTS needed.
2. New daemon receives master fds at fds `3, 4, ...`. Wrap each with
   `fs.createReadStream(null, { fd })` for output and `fs.write(fd, ...)`
   for input. Re-attach session metadata from a side-channel JSON
   (env var or argv).
3. Drain user-space buffers in old daemon before spawn (forward
   pending bytes to host-service / WS subscribers); pass any remaining
   partial buffer through the side-channel JSON to avoid the byte loss
   observed in the Phase 0 follow-up.

**If daemon is Go:**

1. `forkpty`-based PTY spawn in daemon via `creack/pty`.
2. SCM_RIGHTS handoff via `golang.org/x/sys/unix.UnixRights`.
3. New daemon: receive fds with `unix.ParseUnixRights`, wrap as
   `*os.File`, resume serving. host-service reconnects via manifest
   re-read.

**Either way:**

4. Verify on macOS *and* Linux — bash survives daemon exit when new
   daemon holds the inherited / dup'd master.
5. Windows: ConPTY has no SCM_RIGHTS equivalent. `stdio` fd inheritance
   on Windows works for HANDLE inheritance via `bInheritHandles=TRUE`,
   but ConPTY's per-pseudoconsole HANDLE has its own lifetime rules —
   needs separate investigation. Defer Windows daemon-upgrade survival
   until Windows users justify it. Don't paper over with
   serialize+replay.

---

## Phase 0: C2 Reliability Test Plan (gating)

Mandatory before any production work. Goal: prove or disprove that
direct-`forkpty` + SCM_RIGHTS handoff is reliable enough to be the
*only* upgrade primitive (i.e. C2-only, no daemon). Bar:
**100% session survival, zero byte loss, across realistic workloads
and handoff frequencies.** Anything less kicks us back to D or E.

### Harness

Standalone Go binary using `creack/pty` + `golang.org/x/sys/unix`:

1. Spawn N PTY sessions, each running a workload that emits
   sequence-numbered output.
2. Loop K times: spawn replacement self via `exec.Command`, hand all
   master fds + session metadata via `unix.Sendmsg(..., UnixRights, ...)`,
   wait for ack, exit. Replacement reads fds with
   `unix.ParseUnixRights` and continues serving.
3. After each handoff, verify per session:
   - Process alive (`kill -0 pid`).
   - Output stream has no gaps in sequence numbers (or only quantified,
     bounded loss at the swap moment).
   - Resize still works (`unix.IoctlSetWinsize`).
   - Input still reaches the shell.
4. After all K handoffs: count survivors, total bytes lost, fd-table
   size (`lsof`), RSS.

### Test matrix

| Axis | Values |
|---|---|
| Sessions (N) | 1, 5, 20, 100 |
| Handoffs (K) | 1, 10, 100, 1000 |
| Platform | macOS arm64, macOS x86_64, Linux x86_64 |
| Workload | idle prompt; `yes` (max throughput); SSH client; `vim` insert mode; nested `tmux`; `node` REPL; background `&` jobs; `tail -f` on growing file |
| Stress | normal exit; parent SIGKILL'd mid-handoff; slow ack (1s sleep); concurrent stdin during handoff; rapid back-to-back handoffs (no settle time) |

### Pass criteria

- 100% session survival across 1000-handoff runs.
- Zero byte loss in sequence-numbered streams (or quantified, bounded
  loss only at the swap moment, recoverable via buffer replay).
- No fd leaks (`lsof` count stable across runs).
- No memory leak across 1000 handoffs.
- Per-session handoff latency under ~50ms.

### Outcome → architecture

Per the [recommendation table](#recommendation):

- **All pass on macOS + Linux:** ship C2-only. Re-evaluate cons (WS
  reset on every upgrade, in-process state) — if the reliability is
  there, simplicity wins.
- **Linux clean, macOS flaky:** ship E (daemon required to localize
  risk).
- **macOS broken:** investigate why setsid doesn't keep bash alive
  (signal disposition? controlling-tty re-acquisition?). Fall back to
  D-only or F (tmux) on macOS.

### Effort

- Harness: ~1 day in Go.
- Run + analysis: ~½ day per platform.
- Total: ~3 days for a defensible empirical answer. Cheaper than
  picking the wrong architecture.

---

## Phase 0 Results (macOS arm64, 2026-04-29)

**Outcome: C2 passes the reliability bar on macOS arm64.** Direct
`forkpty` + `setsid` keeps shells alive across SCM_RIGHTS handoff to a
new exec'd self, with zero byte loss across all tested workloads at
all tested scales. Open Question #1 is **resolved positively** for
this platform.

Harness lives at `apps/desktop/plans/pty-handoff-experiment/` (Go,
`creack/pty` + `golang.org/x/sys/unix.UnixRights`). Per-handoff
sequence: dup all master fds, marshal session metadata + sequence
checkpoints into a length-prefixed JSON frame, `Sendmsg` with
`UnixRights` over a SOCK_STREAM AF_UNIX socketpair, ack, parent exits.
Child re-execed via `os.Executable()` with the socketpair end as
`ExtraFiles[0]`.

### Run results

| N (sessions) | K (handoffs) | Workload | All alive | Seq gaps | Handoff latency (ms) |
|---|---|---|---|---|---|
| 1 | 1 | counter | ✅ | 0 | 2.62 |
| 5 | 10 | counter | ✅ | 0 | avg 2.27 / max 2.59 |
| 20 | 100 | counter | ✅ | 0 | avg 2.71 / max 4.47 |
| 100 | 10 | counter | ✅ | 0 | avg 18.65 / max 29.14 |
| 5 | 100 | counter-slow (10ms cadence) | ✅ | 0 | avg 11.06 / max 14.96 |
| 10 | 100 | idle (`sleep 3600`) | ✅ | 0 | avg 49.27 / max 51.46 |
| **20** | **1000** | counter | ✅ | 0 | avg 2.78 / max 8.97 |

Largest run: **20 sessions × 1000 handoffs = 20,000 fd-handoff
operations**, all clean.

### Observations

- **Latency scales with N (sessions), not K (handoff number).** N=20
  sustains avg 2.7ms across 1000 handoffs without drift. N=100 spikes
  to ~18ms because every reader-stop + dup is per-session.
- **Idle workload latency includes the 50ms reader-poll deadline.**
  Once we use a proper poll/epoll-based wakeup in the production
  daemon, idle handoffs will be fast too.
- **Sequence gap = 0 across every tested run.** PTY data buffered in
  the kernel during the parent → child handoff window arrives intact
  on the first child read. The handoff is not just process-preserving,
  it's byte-preserving in practice for our test workloads.
- **`creack/pty` confirmed clean on macOS arm64.** Direct `forkpty`,
  no spawn-helper interposition; shells reparented to launchd and
  stayed alive after parent `exit(0)`.

### Bugs found and fixed

- **Serial reader-stop blew up latency at N≥100** (50ms × N). Fixed by
  signalling all stops first, then waiting on all done channels —
  O(max) instead of O(sum).
- **SOCK_STREAM Sendmsg can split the JSON frame** at large session
  counts (~12KB exceeded a single Recvmsg's effective batch). Fixed by
  reading the rest of the length-prefixed frame after the initial
  Recvmsg (SCM_RIGHTS arrives with that first chunk regardless).
- **`SetReadDeadline` no-ops on creack/pty's master fd by default**
  (idle workloads hung). Fixed with `unix.SetNonblock(fd, true)` on
  spawn and after every reattach. SCM_RIGHTS does **not** preserve
  `O_NONBLOCK` across the handoff — must re-set on the receiving side.

### Limitations of this run

- **macOS arm64 only.** Linux x86_64 untested in this session.
- **macOS x86_64 untested.**
- **Workloads were all `/bin/sh`-driven.** Real bash login shells, vim,
  tmux nested, ssh — all skipped (the harness has stubs for vim/tmux
  but they weren't run). For the C1 spawn-helper failure mode to apply
  here the workload needs to be node-pty-spawned, which we deliberately
  bypass.
- **No SIGKILL stress.** The harness exits cleanly each generation.
  Production failure modes (crashed parent mid-handoff, slow ack, fd
  table near limit) untested.
- **Bytes verified by sequence number, not byte-for-byte.** Some
  intra-line bytes could be dropped without our checker noticing,
  though that would imply lost characters from `echo "SEQ:N"` output.

### What this changes in the recommendation

C2 is now **proven viable** as a primitive on macOS arm64 — at minimum
for the daemon-upgrade fd-handoff in Architecture E. The narrower
question of whether to ship **C2-only** (no daemon, host-service
re-execs itself with fd-handoff on every upgrade) remains open and
depends on:

1. Linux + macOS x86_64 results (not yet run).
2. The non-PTY state in host-service (WebSocket connections, ring
   buffer, tRPC subscriptions, DB pool) that would also need to
   survive a re-exec — none of which Phase 0 tested.
3. Whether we want the renderer to see a WS reconnect on every
   host-service upgrade (C2-only) vs. only on rare daemon upgrades (E).

The recommendation table above remains correct — C2 reliable + E
preferred for the architectural reasons in *Why not C2 alone?* The
empirical floor is now: **C2 works**, so E is buildable.

---

## Phase 0 Follow-up: node-pty handoff (macOS arm64, 2026-04-29)

Triggered by the question "can the daemon be Node-only?" The original
C1 PoC concluded that node-pty's macOS spawn-helper architecture made
shell-survival across handoff impossible. A direct test with Node 24 +
node-pty 1.1 disproves that.

Harness: `apps/desktop/plans/pty-handoff-experiment/nodepty-test/`.
Three small Node scripts:

- `test1-survival.js`: spawn N shells via node-pty, exit immediately,
  check shells externally.
- `test2-handoff.js`: spawn N shells, then spawn a child Node process
  with each master fd passed via `child_process.spawn`'s `stdio` array
  (kernel-level fd inheritance — fd refcount stays > 0 across parent
  exit), parent exits.
- `test3-counter-handoff.js`: same as test2 but with a continuous-output
  counter workload; child verifies it can read SEQ:N lines from each
  inherited master.

### Findings

1. **`term.pid === shellPid` on Node 24 + node-pty 1.1 + macOS arm64.**
   The "spawn-helper" exec's into the actual shell — there is no
   long-lived helper process at runtime. The original C1 framing
   ("helper dies, takes bash with it") doesn't match what's there.
   That framing was likely a Bun-specific artifact, a node-pty version
   difference, or simply a mis-attribution of the real failure mode.
2. **Shells die on parent exit if no other process holds the master.**
   test1: parent exits, no handoff, all 5 shells die. Cause is the
   kernel sending SIGHUP to the shell's session when the master's last
   fd reference closes — exactly the same failure mode any PTY library
   would have. Default `bash` exits on SIGHUP.
3. **Shells survive parent exit cleanly when fd inheritance preserves
   master refcount.** test2 N=20: all 20 shells alive while the child
   holder is alive. When the child eventually exits and closes the fds,
   shells die. Predictable: master refcount is the real invariant.
4. **The child process can read live PTY output from inherited
   masters.** test3 N=10: child read ~4.6 MB per session of `SEQ:N`
   output across 4s after parent exit. ~440 sequence gaps per session,
   all clustered at the handoff moment (seq ~6900) — these are the
   bytes node-pty had buffered in user-space and never forwarded
   before the parent exited. Same mitigation as the Go harness:
   include the partial buffer in the handoff payload. **Not a node-pty
   limitation; an artifact of any pre-buffering reader.**

### Implications

- **node-pty + macOS arm64 supports both D and E.** No spawn-helper
  problem in practice.
- **The daemon can be Node-only.** SCM_RIGHTS isn't even needed for
  daemon-upgrade handoff if the new daemon is spawned at upgrade time:
  inherit master fds via `child_process.spawn`'s `stdio` array (kernel
  does the dup). SCM_RIGHTS is only needed if the daemon hands off to
  an *already-running* peer.
- **The choice between Go (creack/pty) and Node (node-pty) for the
  daemon is now an engineering preference, not a correctness one.**
  Go gives a static binary and lighter distribution; Node gives same
  language as host-service and zero new tooling. Either works for both
  D and E.
- **Open Question #1 is fully resolved.** The original C1 conclusion
  was incorrect. Phase 0 (C2 with creack/pty) and this follow-up (with
  node-pty) both pass on macOS arm64. The mechanism is identical:
  preserve master fd refcount across the handoff.

### Limitations of this follow-up

- macOS arm64 only (same as the main Phase 0 run).
- Node 24 + node-pty 1.1 only. Older versions might behave differently;
  the original C1 PoC was on Bun + node-pty (version not pinned in the
  PoC notes).
- fd inheritance via `stdio` was tested; SCM_RIGHTS-from-Node was not.
  Conceptually equivalent at the kernel level (same fd dup, same
  refcount semantics) but uses different APIs (would need `koffi` /
  N-API addon to call `sendmsg` from Node).
- `node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper` had its
  executable bit stripped on `npm install` — needed manual `chmod +x`.
  This is a packaging quirk on this machine; would be handled by
  node-pty's installer in a fresh setup, but worth noting.

---

## Appendix: PTY Library Evaluation

xterm.js doesn't care about the PTY library — it consumes any byte
stream containing standard VT/xterm escape sequences. The PTY's job is
just to give us a master fd and a child process. "Best" here means:
correct `forkpty` + `setsid` semantics, exposes the raw master fd, no
spawn-helper interposition, mature, suitable for SCM_RIGHTS handoff.

### Ranked

1. **`node-pty` (Microsoft).** Used by VS Code. On Node 24 + node-pty
   1.1 + macOS arm64, `term.pid === shellPid` (the spawn-helper exec's
   into the shell), and shells survive parent exit cleanly when master
   fd refcount is preserved (Phase 0 follow-up, 2026-04-29). **Default
   choice for a Node daemon.** ConPTY on Windows.
2. **`creack/pty` (Go).** Calls `forkpty(3)` directly on macOS and
   Linux (`pty_darwin.go`, `pty_linux.go`). Used by k9s, devcontainers,
   dozens of TUI tools. **Choose if the daemon is Go** — best static
   binary story.
3. **`portable-pty` (Rust).** Same shape as creack/pty but Rust. Used
   by wezterm. Equally correct semantics. Pick only if the team is
   already on Rust.
4. **Direct `forkpty(3)` FFI.** ~30 LOC C wrapper. Most control, no
   library at all. Useful as a fallback if creack/pty / node-pty
   behavior diverges from raw `forkpty`. Overkill otherwise.
5. **Wrapping `dtach`/`abduco`.** Skipped — their protocols aren't
   ours; we'd be re-parsing instead of building.

### Why the original "avoid node-pty" framing was wrong

The C1 PoC concluded that node-pty's macOS spawn-helper architecture
made handoff impossible, and the doc previously rated node-pty as
unusable for E. The Phase 0 follow-up disproved this — see
[Phase 0 Follow-up: node-pty handoff](#phase-0-follow-up-node-pty-handoff-macos-arm64-2026-04-29).
The actual failure mode is master fd refcount → SIGHUP, which affects
*every* PTY library equally if you don't preserve the refcount across
handoff. Both creack/pty and node-pty are correctly handled by either
SCM_RIGHTS (`unix.UnixRights` / `koffi` / N-API) or `stdio` fd
inheritance.

### Cross-cutting consequences

#### If daemon is Node

- **Same language as host-service.** Shared TypeScript types via
  `packages/pty-daemon/protocol/` exported through the package index.
  Shared lint, build, test tooling.
- **Distribution:** daemon ships as a Node script + `node-pty` native
  module inside the desktop app bundle. Node runtime is reused from
  Bun/Electron's Node-compatible runtime, or bundled separately.
- **Daemon-upgrade handoff:** simplest implementation is
  `child_process.spawn(newDaemonPath, ..., { stdio: [...,
  ...masterFds] })` — kernel handles fd inheritance, no SCM_RIGHTS
  required.
- **Risk to manage:** the `node-pty` native binary is the long-lived
  contract; node version churn touches the daemon more often than a
  Go static binary would.

#### If daemon is Go

- **Two languages in the repo** (TS for host-service + DaemonClient,
  Go for daemon). Mitigated by treating the daemon protocol as a
  *spec* both sides implement, not generated/shared code.
- **Build system:** add a Go build step (or commit prebuilt binaries
  per platform). Trivial to cross-compile.
- **Distribution:** daemon ships as a static binary inside the desktop
  app bundle (`<resources>/pty-daemon-<os>-<arch>`). No runtime
  dependency.
- **Daemon-upgrade handoff:** SCM_RIGHTS via
  `golang.org/x/sys/unix.UnixRights`, validated by the Phase 0 harness.

---

## Open Questions

1. ~~**Does C2 forkpty + setsid keep bash alive after parent exit on
   macOS, *under stress*?**~~ **Resolved 2026-04-29 (macOS arm64): yes**
   for both creack/pty (Go) and node-pty (Node). The earlier C1 PoC
   conclusion was misframed; the actual mechanism is master fd
   refcount → SIGHUP, which any architecture handles by preserving the
   refcount across handoff. See
   [Phase 0 Results](#phase-0-results-macos-arm64-2026-04-29) and
   [Phase 0 Follow-up: node-pty handoff](#phase-0-follow-up-node-pty-handoff-macos-arm64-2026-04-29).
   Linux + macOS x86_64 still need a run.
2. **Manifest design for D:** single manifest with two endpoints, or
   two manifests? Affects `host-service-manifest.ts` refactor scope.
3. **Per-workspace daemon vs global daemon?** Global is simpler ops but
   blurs workspace isolation; per-workspace mirrors current
   host-service-per-workspace pattern.
4. **Daemon crash policy.** No fallback exists (B excluded). Respawn
   daemon, surface crashes as bug signal, treat daemon stability as
   first-class (audited, minimal surface, no business logic).
   Per-session "restart command on daemon-loss" is *not* acceptable —
   it's serialize+replay by another name.
5. **Upgrade-success telemetry:** did upgrade preserve all sessions?
   Crucial for measuring whether this work pays off.
6. **Renderer reattach:** v2 already has detach/reattach
   (`terminal.ts:832-836`); should "just work" but verify under new flow.

---

## References

### OSS Code Read

- VS Code — `vscode/src/vs/platform/terminal/node/`:
  `ptyHostService.ts:145-198, 365-374`;
  `ptyService.ts:687-960` (`PersistentTerminalProcess`),
  `:1032-1108` (`XtermSerializer`);
  `common/terminal.ts:846-861` (`IReconnectConstants`).
- dtach `master.c:450-565` (~100 LOC core loop).
- abduco `server.c:139-260` (multi-client).
- tmux `server.c:176, 264`, `spawn.c:386`.
- node-pty `src/unix/pty.cc:438` (forkpty), `:494` (fd export),
  `:566` (resize ioctl); `lib/unixTerminal.js:108-112`.
- usocket `src/uwrap.cc:444-459, 592-599` (broken on Node 24).
- node-unix-dgram `src/unix_dgram.cc:97-104, 270-309` (no SCM_RIGHTS).
- HAProxy seamless reload, nginx hot-binary upgrade — refs for G.
- mosh SSP — ref for J.

### PTY / handoff libraries

- `creack/pty` (Go): <https://github.com/creack/pty> — `forkpty(3)`
  directly on macOS + Linux; ConPTY on Windows.
- `portable-pty` (Rust): <https://github.com/wez/wezterm/tree/main/pty>.
- `golang.org/x/sys/unix`: `Sendmsg`, `Recvmsg`, `UnixRights`,
  `ParseUnixRights`, `IoctlSetWinsize`.

### Background

- "Know your SCM_RIGHTS" — Cloudflare blog.
- POSIX `forkpty(3)`, `sendmsg(2)`.

### Internal

- `apps/desktop/HOST_SERVICE_LIFECYCLE.md`.
- `packages/host-service/src/terminal/terminal.ts`.
- `apps/desktop/src/main/lib/host-service-coordinator.ts:290-331`.
- `packages/host-service/src/db/schema.ts:9-30`.
- C1 PoC: `~/workplace/pty-handoff-poc/` (Bun + node-pty + bun:ffi cc).
- **Phase 0 harness:** `apps/desktop/plans/pty-handoff-experiment/`
  (Go + creack/pty + UnixRights). See its README for design details
  and reproduction steps.

### Local clones (for offline reading)

- `~/workplace/creack-pty/` — `pty_darwin.go`, `pty_linux.go` show the
  forkpty path we depend on.
- `~/workplace/node-pty/` — `src/unix/pty.cc` for the spawn-helper
  divergence on macOS that broke C1.
- `~/workplace/tmux/` — full multiplexer reference.
- `~/workplace/wezterm/` — contains portable-pty (Rust), the C2
  alternative if we ever switch off Go.
- `~/workplace/dtach/`, `~/workplace/abduco/` — minimal daemon
  references for D's design ethos.
