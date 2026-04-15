# pty.node — Pseudo-Terminal Allocator

`pty.node` is a small native Node.js addon that provides direct access to POSIX pseudo-terminal (PTY) operations. It's the low-level building block that the exec-daemon's `PtyHostService` uses to create and manage terminal sessions.

---

## Quick Facts

| Property | Value |
|---|---|
| Binary | `/exec-daemon/pty.node` (73 KB) |
| Type | ELF shared object (`.node` native addon) |
| Language | C/C++ with N-API bindings |
| System calls | `forkpty()`, `execvp()`, `ioctl(TIOCSWINSZ)` |
| Key dependency | glibc `forkpty` (from `<pty.h>`) |

---

## Exported API

```javascript
const pty = require('pty.node');

// 4 exported functions:
pty.fork(/* file, args, env, cwd, cols, rows */)
pty.open(/* cols, rows */)
pty.resize(/* fd, cols, rows */)
pty.process(/* fd */)
```

### `fork(file, args, env, cwd, cols, rows)`

Creates a new pseudo-terminal and forks a child process.

Under the hood:
1. Calls `forkpty()` — allocates a PTY master/slave pair and forks
2. In the child process: calls `execvp(file, args)` — replaces the child with the target program
3. Returns the PTY master file descriptor and child PID to the parent

This is the primary function — it's how every shell session is created. When the exec-daemon receives a `SpawnPty` RPC, it calls `pty.fork()` with the shell binary (typically `/bin/bash`), the terminal dimensions, environment variables, and working directory.

### `open(cols, rows)`

Opens a new PTY pair without forking a process. Returns the master and slave file descriptors. This is useful for cases where you want to manage the child process lifecycle separately.

### `resize(fd, cols, rows)`

Resizes an existing PTY by setting the terminal window size. Under the hood, this calls `ioctl(fd, TIOCSWINSZ, &winsize)` which sends a `SIGWINCH` signal to the foreground process group, telling them to re-query their terminal dimensions.

This is called when:
- The terminal pane in the Cursor UI is resized
- The exec-daemon receives a `ResizePty` RPC

### `process(fd)`

Gets the name of the foreground process running in the PTY. Reads `/proc/<pid>/cmdline` for the process group leader of the terminal.

This is used to show what's currently running in a terminal (e.g., "bash", "node", "bun install").

---

## How It Fits Into the System

```
Cloud Orchestrator
  ↓ RPC: PtyHostService.SpawnPty
  ↓
exec-daemon (Node.js)
  ↓ calls pty.fork("/bin/bash", ...)
  ↓
pty.node (native addon)
  ↓ forkpty() + execvp()
  ↓
┌─────────────────────────────┐
│ PTY master (fd in Node.js)  │ ← exec-daemon reads/writes this
│          ↕                  │
│ PTY slave (fd in child)     │ ← child's stdin/stdout/stderr
│          ↕                  │
│ /bin/bash (child process)   │ ← the actual shell
└─────────────────────────────┘
```

The exec-daemon:
1. Calls `pty.fork()` to create the shell
2. Reads from the PTY master fd → streams output via `PtyHostService.AttachPty` (server-streaming RPC)
3. Writes to the PTY master fd when `PtyHostService.SendInput` is called
4. Calls `pty.resize()` when `PtyHostService.ResizePty` is called
5. Calls `pty.process()` to report what's running in the terminal

---

## PTY vs. tmux

The system has **two layers** of terminal management:

| Layer | Tool | Purpose |
|---|---|---|
| **Low-level** | `pty.node` | Raw PTY allocation (fork + exec) |
| **Session management** | tmux (bundled) | Persistent sessions, multiplexing, history |

When the agent runs a Shell command:
1. A tmux session is created (or reused) via `TmuxSessionService`
2. Inside that tmux session, a PTY is allocated via `PtyHostService`/`pty.node`
3. The command runs inside the PTY within the tmux session
4. tmux preserves the session if the agent disconnects and reconnects

---

## N-API Binding Details

The addon uses Node.js N-API (stable ABI) for bindings:
- `napi_create_function` — Exports each function
- `napi_create_double` — Returns numeric values (PID, fd)
- `napi_create_string_utf8` — Returns string values (process name)
- `napi_create_object` — Returns structured results
- `napi_create_error` — Reports errors
- `napi_create_threadsafe_function` — For async I/O callbacks
- `napi_add_finalizer` — Cleanup when JS objects are garbage collected

N-API ensures the addon works across Node.js versions without recompilation.
