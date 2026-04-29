# PTY Survival Across Host-Service Upgrades — Architecture Survey

**Status:** Exploration / decision doc, not yet committed to a milestone plan.
**Owner:** Kiet
**Date:** 2026-04-28
**Branch this came from:** `pty-manifest-detach-reatt`

A comprehensive, opinionated survey of every architecture I could find for
keeping `node-pty` shell processes alive while the host-service that owns
them is upgraded or restarted. Each option has a mechanism description, a
code sketch, OSS prior art, pros/cons, and a frank assessment of how much
work it actually is. Closes with a recommendation.

A working PoC of one of these (Architecture B — `SCM_RIGHTS` fd-passing) is
in `~/workplace/pty-handoff-poc/` and is referenced throughout.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Today's Behavior](#todays-behavior)
- [What "Survival" Means](#what-survival-means)
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
- [PoC Findings (Recap)](#poc-findings-recap)
- [Recommendation](#recommendation)
- [Phased Plan](#phased-plan)
- [Open Questions](#open-questions)
- [References](#references)

---

## Problem Statement

The desktop app's host-service (Bun process spawned by Electron main, see
`packages/host-service/src/index.ts`, manifest in
`apps/desktop/src/main/lib/host-service-manifest.ts`) owns `node-pty` master
fds for every interactive terminal session in v2. Today, restarting the
host-service kills all PTYs and therefore all running shells/long-lived
commands. We want host-service version upgrades to be transparent to the
user — long-running processes, REPLs, ssh sessions, `tail -f`, anything in
the terminal should not die.

The existing manifest (`host-service-manifest.ts`) already solves the
*Electron-main-restart* case: when the app relaunches, it adopts the still-
running detached host-service via PID + endpoint stored on disk. What's
unsolved is the host-service-binary-version-bump case.

This is non-trivial in Node/Bun because the PTY master fd is a kernel object
held in one process, and Node's standard IPC (`process.send` with handles)
explicitly does not pass arbitrary fds — only known wrappers (net/dgram).
Verified in `node/lib/internal/child_process.js:91` (`handleConversion`).

## Today's Behavior

- `host-service-coordinator.ts:157-163` (in `apps/desktop/src/main/lib/`)
  kills the old host-service with `SIGTERM` and spawns fresh; PTYs die.
- The renderer reconnects via `tRPC.terminal.createOrAttach` and a fresh
  WebSocket, but the underlying shell is gone.
- Output buffer is in-memory only (`packages/host-service/src/terminal/
  terminal.ts:64`, ~64KB ring per session) — also lost.
- Session DB row exists (`packages/host-service/src/db/schema.ts:9-30`,
  `terminalSessions`) but contains no PTY state, only metadata.

## What "Survival" Means

Three increasing levels — pick the bar deliberately:

1. **Visual continuity.** Renderer reattach shows the prior screen
   (scrollback, current prompt). Shell is a *new* process; running commands
   are killed. (VS Code's bar.)
2. **Process continuity.** The shell process is the *same* PID. Long-running
   commands keep running. Visual buffer may have a brief stutter.
3. **Bit-for-bit continuity.** No data loss between handoff. Bytes the
   kernel buffered while we were swapping reach the user. (Hardest.)

Most architectures below target (2). (1) is the quick fallback, (3)
typically requires (2) plus careful buffer-replay engineering.

---

## Architectures

### A. Status Quo: Kill + Respawn

The current behavior. Listed for completeness.

**Mechanism:** kill old host-service, spawn new, every session tab
reattaches to a new shell (or shows "session ended").

**Code:** `host-service-coordinator.ts:157-163`.

**Pros:** zero new code. **Cons:** every shell dies on every upgrade. Users
notice. Long-running tasks (servers, watchers, REPLs) lose state.

**Verdict:** baseline. Anything below should beat this.

---

### B. Serialize + Replay (VS Code-style)

**Bar:** visual continuity only. Shell is a *new* process.

**Mechanism:** before killing host-service, walk every session and serialize
its xterm.js terminal buffer (the rendered screen including escape sequences
for cursor position, colors, etc.) to disk. After respawn, re-create
sessions, re-spawn shells, write the serialized buffer back through the
WebSocket so the renderer's xterm draws the prior screen — then resume live
streaming.

This is exactly what VS Code does for *renderer-reload* scenarios with its
`PersistentTerminalProcess` and `XtermSerializer`.

**Code sketch:**

```ts
// In terminal.ts on host-service shutdown
import { Terminal as XtermHeadless } from "@xterm/headless";
import { SerializeAddon } from "@xterm/addon-serialize";

const headless = new Map<string, { term: XtermHeadless; ser: SerializeAddon }>();

session.onData((d) => {
  const h = headless.get(session.id)!;
  h.term.write(d);
  // Optional: also forward to live WS subscribers
});

// On graceful shutdown:
for (const [id, { ser }] of headless) {
  await db.update(terminalSessions).set({
    serializedBuffer: ser.serialize({ scrollback: 1000 }),
    lastSerializedAt: new Date(),
  }).where(eq(terminalSessions.id, id));
}

// On startup: read row, respawn shell, write buffer back through WS
ws.send({ type: "replay", data: row.serializedBuffer });
ws.send({ type: "shell-restarted-warning" });
```

**OSS prior art:**
- VS Code: `vscode/src/vs/platform/terminal/node/ptyService.ts` lines
  687–960 (`PersistentTerminalProcess`) and 1032–1108 (`XtermSerializer`).
- Reconnection grace period: `LocalReconnectConstants.GraceTime = 60000`
  (`vscode/src/vs/platform/terminal/common/terminal.ts:846-861`).
- Already uses `xterm-headless` + `@xterm/addon-serialize`, both on npm.

**Pros:**
- Pure Node.js, no FFI, no native code.
- Works on macOS, Linux, Windows identically.
- Visually convincing for the *common* case (idle shell at a prompt).
- Safe: nothing weird with fds or processes.
- Implementable in ~1 week.

**Cons:**
- Long-running commands die. `npm run dev`, `tail -f`, `ssh` — all gone.
- New shell PID changes; users with `ps`/`htop` open will see it.
- Working directory is restored only if we save+restore manually
  (`echo $PWD` before kill, `cd` after spawn) — and even then anything
  set via `cd` arguments, env mutations, shell history not yet flushed,
  etc., is lost.
- Only buys *visual* continuity. The whole point ("don't kill PTYs")
  isn't actually achieved.

**When to choose:** as a fallback layer under any other option. As a
*primary* solution, only if upgrades are very rare and most users idle.

---

### C1. SCM_RIGHTS fd-passing with node-pty

**Bar:** process continuity. The shell is the *same* PID.

**Mechanism:** before exiting, the old host-service spawns a new
host-service binary, hands the PTY master fd of every session to the new
process via `sendmsg(SCM_RIGHTS)` over a Unix socket, waits for ack, exits.
The kernel `dup`s the fd in the new process, refcount stays > 0, the slave
side (where the shell lives) sees no change.

**Why this is non-obvious:** Node's `process.send` only passes handles for
known wrapper types (net/dgram), per
`node/lib/internal/child_process.js:91`. So we must call `sendmsg` directly.
Three ways:

1. Native N-API addon (~100 LOC C++, node-gyp build).
2. Existing npm package `usocket` (does SCM_RIGHTS, broken on Node 24 in
   testing — assertion failure in `_resume`; PoC confirmed).
3. Bun's `bun:ffi cc`: inline C compiled with TinyCC, zero install pain.
   **This is what the PoC proved.**

**Code sketch (Bun cc — what the PoC uses):**

See `~/workplace/pty-handoff-poc/scm.c` (~80 LOC) for the full thing.
Excerpt:

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
  ssize_t n = sendmsg(sockfd, &msg, 0);
  return n < 0 ? -errno : (int)n;
}
```

```ts
// scm.ts — Bun cc wrapper
import { cc, FFIType } from "bun:ffi";
const lib = cc({
  source: new URL("./scm.c", import.meta.url).pathname,
  symbols: { /* ... */ },
}).symbols;

// Old host-service: capture master fd defensively
const ptyFd = (term as any)._fd as number;
const masterFd = lib.dup_fd(ptyFd); // PoC gotcha — must dup early
// ...send via sendmsg...

// New host-service: receive
const { fd: receivedFd } = recvFd(connFd);
const out = new tty.ReadStream(receivedFd);
out.on("data", (d) => relayToWebSocket(d));
```

**The PoC proved:**
- ✅ `SCM_RIGHTS` works in Bun via `cc`.
- ✅ The fd received is a real `/dev/ptmx` master (`isCharacterDevice=true`,
  `mode=020666`).
- ✅ Reading and writing through the dup'd fd works.
- ❌ But shell *still* dies on macOS when the original host-service exits,
  because…

**The gotcha (C1-specific):** `node-pty` on macOS uses a `spawn-helper`
intermediate subprocess. `term.pid` is the helper's pid, not bash. The
helper is a child of the host-service process via the native
`pty.fork(...)` call. Even though the master fd has been dup'd into a new
process, the *helper* dies (sometimes) when its original parent exits, and
takes bash with it.

This is observable in `ps`:
`COMM=.../node-pty/prebuilds/darwin-arm64/spawn-helper /Users/.../bash -l`

So C1 alone is insufficient on macOS.

**Pros:** preserves shell PID; fd-passing primitive is small (~80 LOC C);
Bun's `cc` removes the build hassle.

**Cons:** node-pty's spawn-helper architecture defeats it on macOS. On
Linux node-pty uses `forkpty` directly and this should work (untested).
Windows is a different world (see [ConPTY](#windows-conpty)).

**Verdict:** worth keeping as a *primitive*, not a complete solution.

---

### C2. SCM_RIGHTS fd-passing with direct `forkpty` (FFI)

**Bar:** process continuity, on macOS *and* Linux.

**Mechanism:** Same as C1 but bypass node-pty entirely on the spawn path.
Call `forkpty(3)` directly via Bun FFI. forkpty does
`open(/dev/ptmx)` + `grantpt` + `unlockpt` + `fork()` + `setsid()` +
makes the slave the controlling tty. Bash becomes a *direct* child of the
host-service in its own session — `setsid` is the magic — so when host-
service exits, bash reparents to launchd/init cleanly and survives.

**Code sketch:**

```c
// pty.c (companion to scm.c)
#include <util.h>     // forkpty on macOS
// or <pty.h> on Linux

int forkpty_spawn(int *master_out, const char *shell, char *const *argv,
                  char *const *envp, int cols, int rows) {
  struct winsize ws = { .ws_row = rows, .ws_col = cols };
  int master;
  pid_t pid = forkpty(&master, NULL, NULL, &ws);
  if (pid < 0) return -errno;
  if (pid == 0) {
    execve(shell, argv, envp);
    _exit(127);
  }
  *master_out = master;
  return pid;
}
```

```ts
// In host-service terminal.ts, replacing pty.spawn:
import { cc, FFIType, ptr } from "bun:ffi";
const ptyLib = cc({ source: "./pty.c", symbols: { /* ... */ } }).symbols;

const masterOut = new Int32Array(1);
const argvBuf = packArgv(["/bin/bash", "-l"]);
const envpBuf = packEnv(process.env);
const pid = ptyLib.forkpty_spawn(ptr(masterOut), "/bin/bash",
  ptr(argvBuf), ptr(envpBuf), 80, 30);
const masterFd = masterOut[0];
```

**OSS prior art:**
- `forkpty(3)` is the same API used by tmux (`tmux/spawn.c:386`) and the
  original BSD ptys.
- Microsoft's node-pty itself uses `forkpty` on Linux (see
  `node-pty/src/unix/pty.cc:438`) and only diverges to spawn-helper on
  macOS for posix_spawn-related reasons.

**Pros:**
- Removes the spawn-helper dependency that broke C1.
- Tiny FFI shim (~30 LOC C).
- Same `setsid` guarantee as forkpty everywhere.
- Compatible with the SCM_RIGHTS handoff.

**Cons:**
- We re-implement parts of node-pty (resize via `TIOCSWINSZ`, exit
  handling via `waitpid`, encoding handling). All small, but not zero.
- Bun's `cc` is officially marked experimental as of 1.3.x. Production
  reliance carries some risk.
- Drops cross-platform abstraction — Windows path completely different.

**Verdict:** likely the simplest *complete* solution if we commit to
fd-passing as the upgrade strategy on Unix.

---

### D. Long-Lived `pty-daemon`

**Bar:** process continuity. Shell PID never changes.

**Mechanism:** Split host-service into two processes:

```
                        ┌──────────────────────┐
WebSocket / tRPC ──────►│  host-service (v123) │ ◄── upgrades freely
                        └────────────┬─────────┘
                                     │ Unix socket
                                     ▼
                        ┌──────────────────────┐
                        │     pty-daemon       │ ◄── upgrades RARELY
                        │ (owns node-pty fds)  │
                        └──────────────────────┘
                                     │
                                     ▼
                                  bash, ssh, vim, ...
```

`pty-daemon` is a tiny long-lived process that exposes a Unix-socket
protocol: "open session", "write input", "read output", "resize", "close".
The host-service is a *client* that relays bytes between the daemon socket
and the WebSocket. When host-service upgrades, daemon stays alive — no
fd-passing needed.

This is exactly the architecture of `dtach`, `abduco`, and `tmux server`.

**Code sketch:**

```ts
// pty-daemon/main.ts — separate Bun process, started once per workspace
const sessions = new Map<string, IPty>();
const server = Bun.listen({
  unix: "/var/superset/pty-daemon.sock",
  socket: {
    data(socket, data) {
      const msg = decode(data);
      if (msg.type === "open") {
        const t = pty.spawn(msg.shell, msg.argv, msg.opts);
        sessions.set(msg.id, t);
        t.onData((d) => socket.write(encode({ type: "data", id: msg.id, d })));
      } else if (msg.type === "input") {
        sessions.get(msg.id)?.write(msg.data);
      } else if (msg.type === "resize") {
        sessions.get(msg.id)?.resize(msg.cols, msg.rows);
      }
    },
  },
});
```

```ts
// host-service: client of pty-daemon
const daemon = await Bun.connect({ unix: "/var/superset/pty-daemon.sock" });
// Pump bytes between daemon ↔ WebSocket per session.
```

**OSS prior art:**
- **dtach**: 100 LOC select loop in `master.c:450-565`. The *minimal*
  reference for this design.
- **abduco**: same pattern, multi-client, ~300 LOC C, `server.c:139-260`.
- **tmux**: scaled-up version with multiplex/detach/window-management on
  top, `server.c:176, 264`, `spawn.c:386`.
- **VS Code's PtyHost** is a structural cousin: separate process, IPC over
  named pipe (`vscode/src/vs/platform/terminal/node/ptyHostService.ts`).
  Difference: VS Code *does* kill its PtyHost on restart; daemons here
  would not.

**Pros:**
- The cleanest separation of concerns. host-service is now stateless w.r.t.
  PTYs and can upgrade arbitrarily often.
- The daemon protocol is small and stable; we control it.
- Doesn't require fd-passing for routine upgrades.
- Daemon process is small (KB of memory) and fits the "tiny supervisor"
  ethos of dtach/abduco.
- Easy to add observability (one process to watch).

**Cons:**
- **One extra process per workspace** (or one global daemon — design
  question). Process sprawl on machines with many workspaces.
- Daemon needs its *own* upgrade story. We've kicked the can to a smaller
  problem, not eliminated it.
- Daemon crash = all PTYs lost. Need supervision (launchd, see Architecture
  H, or just respawn-and-replay-from-DB).
- The daemon socket and protocol are now part of our public surface and
  must be versioned.
- Adds latency: one more hop between renderer and shell (Unix socket round-
  trip ~tens of µs — usually invisible, but it stacks).
- Manifest design changes: manifest must track *both* host-service and
  daemon endpoints; `host-service-coordinator.ts:290-331` adoption logic
  expands.

**When to choose:** if frequent host-service upgrades are the use case
(staged rollouts, frequent feature flag flips, etc.) and an extra process
per workspace is acceptable.

---

### E. Hybrid: Daemon (D) + fd-passing (C2) on daemon upgrade

**The "best of both" combo.** D is the steady-state architecture. When the
*daemon* itself needs to upgrade (much rarer), use C2's `forkpty`-based
fd-passing to hand sessions over to a new daemon binary.

This is the only configuration that delivers true zero-downtime across
*all* upgrade paths.

**Pros:** maximum coverage; no time when shells are killed by an upgrade.

**Cons:** combined complexity of D + C2; two upgrade paths to test; on
macOS the fd-passing edge of this depends on C2's `forkpty` working
reliably (PoC didn't fully demonstrate this — see [Open Questions](#open-questions)).

---

### F. tmux / screen / abduco as the backend

**Bar:** process continuity *and* battle-tested.

**Mechanism:** stop running shells directly. Run every shell *inside*
`tmux` (or `abduco`). The host-service then connects to the tmux server
(`tmux -S /path/to/socket -CC` for control mode) instead of owning a PTY
directly. Tmux handles persistence, reattach, scrollback, resize. We
become a tmux client.

**Code sketch:**

```ts
// instead of pty.spawn(shell)
const id = `superset-${sessionId}`;
const tmuxSock = `/tmp/superset-tmux.sock`;
const t = pty.spawn("tmux", [
  "-S", tmuxSock,
  "new-session", "-A", "-s", id, "-d",
  shell, ...shellArgs,
]);
// Then attach in control mode for programmatic byte stream:
const attach = pty.spawn("tmux", ["-S", tmuxSock, "-CC", "attach", "-t", id]);
attach.onData((d) => relay(d));
```

**OSS prior art:**
- tmux: literally 30 years of work on this exact problem.
- `tmux -CC` (control mode): structured stream output for embedding tmux
  in IDEs. iTerm2 uses this.
- `abduco`: smaller, simpler. ~300 LOC C, `server.c:139-260`.

**Pros:**
- Battle-tested across decades.
- Solves scrollback / resize / detach as a side effect.
- Free remote-attach: `tmux attach` from another terminal "just works".
- We barely write any new code.

**Cons:**
- Adds a hard dependency on tmux being installed. Bundling tmux into the
  desktop app is non-trivial (license is OK — ISC — but cross-platform
  binary distribution is its own thing).
- Tmux's escape sequence handling is its own ecosystem — colors, mouse,
  cursor mode all need careful tuning. Renderer (xterm.js) might not match
  what tmux outputs perfectly without work.
- Users *already running tmux* in their shell get nested tmux. Common
  enough source of pain that we'd want to detect it.
- Tmux's control-mode protocol (`-CC`) is its own thing to wrap and parse.
- Less control: we're now relying on tmux's design choices for things like
  scrollback semantics.

**When to choose:** if we want survival *and* free multiplexing/detach
features, and we're willing to bundle/depend on tmux. Users who like tmux
will love this; users who don't will be confused by nested sessions.

---

### G. `exec()` in-place upgrade

**Bar:** process continuity, no separate process.

**Mechanism:** When a new host-service version is available, the running
host-service process `exec()`s itself with the new binary. The pid stays
the same, the file descriptor table is preserved (modulo `O_CLOEXEC`),
PTY master fds remain open. The new binary picks up the existing fds via
some serialized table (env var, fd 3 + fd 4, or memfd).

This is the classic "graceful restart" technique used by HAProxy, nginx,
and PostgreSQL.

**Code sketch:**

```ts
// On upgrade signal:
for (const [id, term] of sessions) {
  // Clear O_CLOEXEC so the fd survives execve
  fcntl(term._fd, F_SETFD, fcntl(term._fd, F_GETFD) & ~FD_CLOEXEC);
}
const fdTable = JSON.stringify(
  Array.from(sessions.entries()).map(([id, t]) => ({
    id, fd: t._fd, pid: t.pid,
  }))
);
process.env.SUPERSET_FD_TABLE = fdTable;
execv("/path/to/new/host-service", ["host-service", ...]);
```

```ts
// New binary, on startup:
if (process.env.SUPERSET_FD_TABLE) {
  const table = JSON.parse(process.env.SUPERSET_FD_TABLE);
  for (const { id, fd, pid } of table) {
    sessions.set(id, wrapExistingFd(fd, pid));
  }
  delete process.env.SUPERSET_FD_TABLE;
}
```

**OSS prior art:**
- HAProxy's seamless reload (`-x` flag passes fd over Unix socket — close
  cousin).
- nginx hot-binary upgrade (`USR2` signal, master forks new master,
  inherits listening fds — same family of techniques).
- Erlang's hot code reload (different mechanism but same spirit).

**Pros:**
- No separate daemon process. Same pid throughout.
- File descriptor preservation is "free" via `execve` — no SCM_RIGHTS,
  no IPC.
- Industry-standard pattern.

**Cons:**
- Bun + Node don't expose `execve` from JS. Need FFI to call it directly.
  (`process.execv` doesn't exist; only `child_process` family.)
- Re-attaching node-pty / Bun stream wrappers to an existing fd at startup
  is unusual — most libraries assume they spawned the fd themselves. Same
  gotcha as C2 (we have to re-implement the read/write/resize plumbing
  around an arbitrary fd).
- macOS's `O_CLOEXEC` is set on most fds Node opens by default; we'd need
  to clear it before exec.
- Loses any in-process state not serialized to env/disk (in-memory
  buffers, WebSocket connections — those reset on exec).
- The Electron main process started us; if it expects a child and we
  `execv` ourselves, the parent's child-watcher needs to handle that
  cleanly (the process *doesn't* exit, just changes binary). Probably OK,
  worth verifying.

**When to choose:** if we want a single-process design with no daemon
*and* no IPC/handoff dance. The trickiest part is wrapping an inherited fd
in our terminal stream library, which is the same work as C2.

---

### H. OS Supervisor (launchd / systemd socket activation)

**Bar:** process continuity, OS-level supervision.

**Mechanism:** instead of Electron-main spawning host-service, register
host-service as a launchd LaunchAgent (macOS) or systemd user unit (Linux).
Use socket activation: the OS holds the listening socket, hands it to the
host-service when it starts. PTY master fds are held by the OS-supervised
process, which never restarts unless explicitly told to.

For PTY survival across upgrades: combine with C2 fd-passing or D's daemon
pattern. Socket activation is more about *startup* and crash-recovery
than *upgrades*.

**OSS prior art:**
- systemd socket activation (`ListenStream=`, `Accept=no`).
- launchd `Sockets` key in plists.
- Apple's well-documented `launch_activate_socket(3)` API.

**Pros:**
- OS handles supervision, restart, log rotation.
- Standard pattern on Linux servers.
- Combines well with D — the OS supervises the *daemon*.

**Cons:**
- Desktop app reality: registering a launchd agent on user's machine is
  invasive. Users don't expect a desktop app to install background
  services. Different security/permissions model.
- macOS code-signing & notarization implications for launchd agents.
- Doesn't *itself* solve PTY survival — still need C2 or D underneath.
- Increases the surface of the install/uninstall story significantly.

**When to choose:** for a server-side or CLI tool, yes. For our desktop
app, probably no — the install/uninstall ergonomics are too disruptive
for the benefit.

---

### I. CRIU (Linux-only checkpoint/restore)

**Bar:** bit-for-bit continuity. The full process state — memory, fds,
sockets, timers — gets dumped and restored.

**Mechanism:** Use CRIU (Checkpoint/Restore In Userspace) to snapshot the
entire host-service process tree to disk, kill it, restore from snapshot
into the new binary's address space.

**Pros:** absolutely complete state preservation.

**Cons:**
- Linux-only. macOS users out of luck.
- CRIU requires kernel features (CONFIG_CHECKPOINT_RESTORE) and root
  privileges in many cases.
- Restoring into a *different binary* defeats the point — CRIU is
  designed to restore identical processes. For genuine binary upgrades,
  this doesn't apply.
- Heavyweight dependency.

**Verdict:** mentioned for completeness; not viable for our case.

---

### J. Mosh-style state sync

**Bar:** roaming reattach with eventual visual consistency.

**Mechanism:** Mosh (mobile shell) runs a server-side `mosh-server` and a
client. The server keeps a model of the terminal's framebuffer (a SSP —
state synchronization protocol). The client has its own model. They
exchange diffs over UDP, with explicit speculative local echo. When
network roams, the client reconnects to a still-running server.

For our case: the "server" is per-shell, persistent. The "client" is the
host-service + WebSocket. host-service reconnects after upgrade.

**OSS prior art:**
- Mosh (mit-mosh/mosh). The SSP protocol is documented.
- Eternal Terminal (`et`) is a similar idea with TCP.

**Pros:**
- Roams cleanly across network and process changes.
- Speculative local echo gives "feels like local" UX.

**Cons:**
- Massive overkill for "host-service restart" (which involves zero network
  changes).
- Complete re-implementation of mosh's state-sync layer.
- Client is C++; integrating it into a JS host-service is its own thing.

**Verdict:** wrong tool. The mosh approach is for *unreliable
client-server links*. Our host-service-renderer link is local IPC.
Shouldn't apply.

---

## Windows (ConPTY)

Everything above (C, D, E, F, G) is Unix-centric. Windows uses ConPTY:
`CreatePseudoConsole`, `ResizePseudoConsole`, `ClosePseudoConsole`. The
ConPTY object is owned by a process; there's **no SCM_RIGHTS equivalent**
for handle inheritance across an arbitrary process boundary. You can
`DuplicateHandle` between processes, but only if you have the target
process's HANDLE — which means the new process must already exist.

Workable Windows strategies:

- **Architecture B (serialize+replay)** — works identically on Windows.
- **Architecture D (long-lived daemon)** — works; daemon owns ConPTY,
  client is host-service.
- **Architecture F (tmux/abduco)** — tmux doesn't run on Windows; this is
  out. WSL is a workaround.

**Recommendation for Windows:** B as the floor, D as the ceiling. The
fd-passing dance (C/E) doesn't apply.

---

## Comparison Table

| | Bar | macOS | Linux | Windows | Code (LOC, est) | Process count | Risk |
|---|---|---|---|---|---|---|---|
| A. Status quo | none | y | y | y | 0 | 1 | none |
| B. Serialize+replay | visual | y | y | y | ~500 | 1 | low |
| C1. SCM_RIGHTS + node-pty | process | **NO** (PoC) | likely y | n | ~300 | 1 | medium |
| C2. SCM_RIGHTS + forkpty | process | y (untested) | y (untested) | n | ~600 | 1 | medium-high |
| D. pty-daemon | process | y | y | y | ~1500 | 2 | medium |
| E. D + C2 hybrid | process | y | y | y (D part only) | ~2000 | 2 | high |
| F. tmux backend | process | y (need bundled tmux) | y (need bundled tmux) | n | ~400 | 2+ | medium |
| G. exec() in-place | process | y | y | n | ~700 | 1 | high |
| H. OS supervisor | infra only | y | y | maybe | ~300 | 1 | install-UX risk |
| I. CRIU | full | n | y | n | ~1000+ | 1 | very high |
| J. Mosh-style | network roam | y | y | y | ~3000+ | 2 | very high (overkill) |

LOC are order-of-magnitude estimates including new code, refactoring of
`terminal.ts`, manifest changes, tests.

---

## PoC Findings (Recap)

PoC at `~/workplace/pty-handoff-poc/` (Bun + node-pty + inline-C SCM_RIGHTS
via `bun:ffi cc`):

1. **SCM_RIGHTS in JS land works.** ~80 LOC C in `scm.c` covers
   send/recv/listen/connect/dup. Bun's `cc` compiles inline; no native
   addon, no node-gyp.
2. **The fd transfers cleanly.** Receiver's `fstat` reports
   `isCharacterDevice=true`, `mode=020666` — a real `/dev/ptmx` master.
3. **Read/write through the dup'd fd works.**
4. **Gotcha 1**: `term._fd` can be recycled between `pty.spawn` and the
   actual `sendmsg` (kernel reuses the fd number for an unrelated
   `accept()`-returned socket). Fix: `dup_fd(term._fd)` immediately after
   spawn.
5. **Gotcha 2 (the killer for C1):** node-pty on macOS uses
   `spawn-helper`, so `term.pid` is the helper's pid. The helper is
   host-service's child. When host-service exits, helper *sometimes* dies
   too, taking bash with it. This is a node-pty-on-macOS detail — not a
   fundamental fd-passing limitation — but it means C1 alone is not enough.

PoC files: `scm.c`, `scm.ts`, `process-a.ts`, `process-b.ts`, `run.sh`,
`run-idle.sh`, `README.md`.

---

## Recommendation

**Two-phase plan: (B) now, (E) later.**

### Phase 1 — Architecture B (serialize+replay) as a floor

Ship VS Code's recipe for visual continuity. It's pure JS, cross-platform,
low-risk, and even if we later add (E), (B) is still useful as the
fallback when the fd-passing path errors out or when the daemon itself
crashes.

Concretely:
- Add `xterm-headless` + `@xterm/addon-serialize` to host-service.
- Per session, mirror PTY output into a headless xterm.
- On host-service shutdown: serialize each session's buffer to
  `terminalSessions.serializedBuffer` (new column).
- On startup: on first WS attach, send the buffer down before resuming
  live stream.
- Timeline: ~1 week.

### Phase 2 — Architecture E (daemon + fd-passing on daemon upgrade)

- Extract PTY spawning into a new `packages/pty-daemon`.
- Host-service becomes a client of the daemon over a Unix socket.
- Daemon manifest tracks the daemon endpoint independently of the
  host-service.
- On the rare daemon upgrade: use C2's `forkpty`-based fd-passing to
  carry sessions across.
- Timeline: ~3-4 weeks for D, +1 week for the C2 layer on top.

### What I'd skip

- **F (tmux backend)**: cool, but bundling tmux + nested-tmux UX cost is
  not worth it for our user base.
- **G (exec())**: similar implementation cost to C2 with no real benefit
  (and we already have D as a cleaner separation).
- **H (launchd)**: install-UX cost too high for desktop.
- **I (CRIU)** and **J (mosh)**: wrong tools.

---

## Phased Plan

### Phase 1: Architecture B (Visual Replay)

Milestones (rough — to be promoted to a proper ExecPlan if approved):

1. Add `xterm-headless` and `@xterm/addon-serialize` to host-service.
2. In `packages/host-service/src/terminal/terminal.ts`, attach a headless
   xterm per session that mirrors `pty.onData`.
3. Add `serializedBuffer text` and `serializedAt timestamp` to
   `terminalSessions` (`packages/host-service/src/db/schema.ts:9-30`) via
   `bunx drizzle-kit generate`.
4. On `SIGTERM`/graceful shutdown of host-service, walk the sessions map
   and write the serialized buffer to DB.
5. On WS attach: if a `serializedBuffer` exists for the session and no
   live PTY is running, respawn shell, write buffer through the WS, mark
   the session as "restored" (renderer can show a small banner).
6. Renderer banner: "Host-service restarted — running commands lost.
   [Reload terminal]" — same banner pattern as v2 already has elsewhere.
7. Telemetry: PostHog event `terminal_session_restored` + count of
   restored sessions per host-service restart.

### Phase 2: Architecture E (Daemon + handoff)

1. New package `packages/pty-daemon`.
2. Define daemon protocol (Bun-native Unix socket; binary framed
   messages). Versioned.
3. Daemon manifest at `~/.superset/host/{orgId}/pty-daemon-manifest.json`
   — separate from host-service manifest.
4. host-service-coordinator: spawn pty-daemon if not running, adopt if
   running. Mirror `host-service-coordinator.ts:290-331` adoption logic.
5. Refactor `terminal.ts` to be a daemon client instead of an in-process
   spawner.
6. On daemon upgrade: implement C2 fd-passing using `forkpty` + Bun cc
   sendmsg. Reuse PoC's `scm.c`.
7. Verify on macOS *and* Linux that bash survives daemon exit when
   host-service holds the dup'd master fd. (PoC didn't fully verify this
   for the daemon-style architecture — see Open Questions.)

---

## Open Questions

1. **Does the C2 (`forkpty`-direct) approach actually keep bash alive
   after host-service exit on macOS?** The PoC tested C1 (node-pty) and
   found node-pty's spawn-helper dies. Need to verify that direct
   `forkpty` + `setsid` *does* let bash survive parent exit, by writing a
   minimal `forkpty` FFI wrapper and running the same handoff test. ~2hr
   of work.
2. **What's the manifest design for D?** Single manifest with two
   endpoints, or two manifests? Affects `host-service-manifest.ts`
   refactor scope.
3. **Per-workspace daemon vs global daemon?** A global daemon is simpler
   ops but blurs workspace isolation. Per-workspace mirrors current
   host-service-per-workspace pattern.
4. **What happens if the daemon crashes?** Phase 1's serialize+replay
   becomes the recovery path — bash dies, we replay the buffer. Or we add
   per-session "restart command on daemon-loss" logic. Decide policy.
5. **Telemetry for "did the upgrade succeed without dropping sessions"?**
   Crucial for measuring whether all this work is paying off.
6. **Renderer-side**: when host-service handoffs cleanly, does the
   WebSocket reconnect appear seamless to the user? `terminal.ts` in
   v2 desktop already has detach/reattach semantics
   (`terminal.ts:832-836`); this should "just work", but worth testing
   under the new flow.

---

## References

### OSS Code Read

- VS Code — `vscode/src/vs/platform/terminal/node/`
  - `ptyHostService.ts:145-198, 365-374` — PtyHost lifecycle.
  - `ptyService.ts:687-960` — `PersistentTerminalProcess`.
  - `ptyService.ts:1032-1108` — `XtermSerializer`.
  - `common/terminal.ts:846-861` — `IReconnectConstants`.
- dtach — `master.c:450-565` — minimal PTY-owning daemon (~100 LOC core
  loop).
- abduco — `server.c:139-260` — multi-client variant.
- tmux — `server.c:176, 264`, `spawn.c:386` — full multiplexer.
- node-pty — `src/unix/pty.cc:438` (forkpty), `:494` (fd export), `:566`
  (resize ioctl); `lib/unixTerminal.js:108-112` (tty.ReadStream wrapping).
- usocket — `src/uwrap.cc:444-459, 592-599` — SCM_RIGHTS impl (broken on
  Node 24 in our testing).
- node-unix-dgram — `src/unix_dgram.cc:97-104, 270-309` — does NOT do
  SCM_RIGHTS, ruled out.
- HAProxy seamless reload, nginx hot-binary upgrade — design references
  for Architecture G.
- mosh — SSP protocol — design reference for Architecture J.

### Background Reading

- "Know your SCM_RIGHTS" — Cloudflare blog post.
- POSIX `forkpty(3)`, `sendmsg(2)` man pages.
- Bun `cc` docs: <https://bun.com/docs/api/cc>.
- Bun FFI docs: <https://bun.sh/docs/api/ffi>.

### Internal

- `apps/desktop/HOST_SERVICE_LIFECYCLE.md` — current host-service design.
- `packages/host-service/src/terminal/terminal.ts` — current spawn path.
- `apps/desktop/src/main/lib/host-service-coordinator.ts:290-331` —
  manifest adoption (the existing precedent for Architecture D's daemon
  manifest).
- `packages/host-service/src/db/schema.ts:9-30` — terminalSessions table
  (where `serializedBuffer` would land for Phase 1).
- PoC: `~/workplace/pty-handoff-poc/`.
