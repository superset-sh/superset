# The Terminal That Never Dies: Building a Persistent Terminal Daemon for Electron

*A deep dive into how we built a process-isolated terminal host that survives app restarts, handles backpressure gracefully, and enables cold restore from disk.*

---

When you're building a developer tool with an integrated terminal, you quickly encounter a brutal truth: **terminals are ephemeral by default**. Close your app, and your running processes vanish. Restart after a crash, and your entire terminal history is gone.

We set out to fix this in Superset's desktop app. What started as "make terminals persist across restarts" evolved into a full-blown daemon architecture with Unix sockets, binary protocols, and multi-level backpressure handling. Here's how we got there.

## The Problem: Electron Terminals Are Fragile

In a typical Electron + node-pty setup, your terminal lifecycle looks like this:

```
App starts → spawn PTY → user runs commands → app closes → PTY dies
```

This works fine until:

1. **You accidentally close the app** while a long-running build is in progress
2. **The app crashes** and you lose your terminal history
3. **You need to restart** for an update, killing all your sessions

For a developer tool where users might have Claude running multi-minute tasks, losing terminal state is unacceptable.

## The Tempting Solution: Just Use tmux

When we first tackled this problem, tmux seemed like the obvious answer. It's battle-tested, handles persistence natively, and every developer already knows it.

We explored wrapping terminal sessions in tmux:

```bash
# Spawn session
tmux new-session -d -s "superset-pane-123"

# Attach from Electron
tmux attach-session -t "superset-pane-123"

# Session survives app restart ✓
```

**Why it didn't work for us:**

1. **Platform consistency**: tmux isn't available on Windows without WSL. We needed something that works everywhere Electron runs.

2. **Integration friction**: tmux has its own keybindings, its own scrollback management, its own configuration. Users would be learning "Superset's terminal" but actually fighting tmux's opinions underneath.

3. **Lifecycle control**: We wanted fine-grained control over session metadata, workspace associations, and integration with our agent hooks. Delegating to tmux meant losing visibility into the session lifecycle.

4. **UI synchronization**: Getting terminal dimensions, cursor state, and scrollback content out of tmux reliably was more complex than running our own emulator state.

The lesson: **sometimes the "just use X" solution trades one set of problems for another.** We decided to build a daemon purpose-built for our needs.

## Architecture: The Three-Process Model

Our solution splits terminal management across three process layers:

```
┌─────────────────────────────────────────────────────────────────┐
│                     ELECTRON MAIN PROCESS                       │
│  • tRPC router for renderer IPC                                 │
│  • DaemonTerminalManager (client)                               │
│  • History persistence to disk                                  │
│  • Workspace/worktree metadata                                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Unix Domain Socket
                           │ (NDJSON protocol)
┌──────────────────────────▼──────────────────────────────────────┐
│                   TERMINAL HOST DAEMON                          │
│  • Long-running Node.js process                                 │
│  • Owns all PTY sessions                                        │
│  • Headless xterm emulator per session                          │
│  • Broadcasts data/exit events to clients                       │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Binary framed protocol
                           │ (stdin/stdout pipes)
┌──────────────────────────▼──────────────────────────────────────┐
│                  PTY SUBPROCESS (per session)                   │
│  • Isolated process per terminal                                │
│  • Owns the actual node-pty instance                            │
│  • Handles backpressure independently                           │
│  • 128KB batched output, 32ms flush interval                    │
└─────────────────────────────────────────────────────────────────┘
```

**The key insight**: The Electron app becomes just a *client* of the terminal daemon. You can:

- Restart the app → Reconnect to running sessions
- Open multiple windows → All attach to the same daemon
- Crash and recover → Cold restore from disk history

### Spawning the Daemon

The daemon is a Node.js process spawned with a clever Electron trick:

```typescript
const daemon = spawn(process.execPath, [daemonScript], {
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",  // Run as plain Node.js
  },
  detached: true,
  stdio: "ignore",
});
daemon.unref();  // Don't wait for daemon to exit
```

Setting `ELECTRON_RUN_AS_NODE=1` tells Electron to act as a regular Node.js runtime, perfect for a background service that doesn't need Chromium.

## The Protocol: NDJSON Over Unix Sockets

Communication between the main process and daemon uses newline-delimited JSON over Unix domain sockets:

```typescript
// Request from main process
{"id":"req-abc123","type":"createOrAttach","payload":{"sessionId":"pane-1","cols":80,"rows":24}}

// Response from daemon
{"id":"req-abc123","ok":true,"payload":{"isNew":true,"snapshot":{...},"pid":12345}}

// Event pushed to clients (stream socket)
{"type":"data","sessionId":"pane-1","data":"$ npm install\r\n"}
```

**Why Unix sockets?** They're fast (no TCP overhead), secure (file permissions), and support backpressure natively through kernel buffers.

### The Two-Socket Split

Our first protocol version used a single socket for everything. This caused a nasty problem: **head-of-line blocking**.

When a terminal produces output faster than the socket can drain, the kernel buffer fills up. Every `socket.write()` for data events would block, queuing behind them any RPC responses. The result? A user opens a new terminal, but `createOrAttach` times out because the response is stuck behind megabytes of `cat bigfile.log` output.

Protocol v2 splits communication:

```
Main Process                          Daemon
     │                                   │
     │◄────── Control Socket ──────────►│  RPC only (low latency)
     │        request/response           │
     │                                   │
     │◄────── Stream Socket ───────────►│  Events only (can backpressure)
     │        data, exit, errors         │
```

Now the stream socket can back up independently while RPC stays responsive.

## Session Lifecycle: Create, Attach, Survive, Restore

A session goes through well-defined states:

```
CREATED ──► ALIVE ──► (clients attach/detach) ──► TERMINATING ──► EXIT
```

The magic is in **attachment semantics**:

```typescript
async createOrAttach(params: CreateSessionParams) {
  // 1. Already in daemon? Just attach.
  if (daemon.hasSession(params.sessionId)) {
    return daemon.attach(params.sessionId);
  }

  // 2. Not in daemon, but history on disk? Cold restore.
  const metadata = await historyReader.readMetadata(params.sessionId);
  if (metadata && !metadata.endedAt) {
    // Unclean shutdown detected!
    return {
      isColdRestore: true,
      scrollback: await historyReader.readScrollback(),
      previousCwd: metadata.cwd,
    };
  }

  // 3. Truly new session
  return daemon.createSession(params);
}
```

### Cold Restore: Recovering from the Unexpected

When the daemon dies (machine reboot, crash, kill -9), sessions are lost. But we still have disk history:

```
~/.superset/terminal-sessions/
└── workspace-abc/
    └── pane-123/
        ├── meta.json        # {"startedAt": ..., "cwd": "/project"}
        └── scrollback.txt   # Full terminal output
```

On next app launch, we detect unclean shutdown (no `endedAt` in metadata) and offer cold restore:

```typescript
// Session restored - scrollback shown but read-only
// User sees: "Session Restored - Press Enter to start new shell"
// Old scrollback preserved, new shell spawns in same directory
```

This gives users the best of both worlds: they see what happened before the crash, and can continue where they left off.

## Backpressure: The Hidden Challenge

Terminals can produce output *fast*. A simple `cat /dev/urandom | base64` will flood any buffer you throw at it. Without careful backpressure handling, you get:

- Memory exhaustion (unbounded queues)
- UI freezes (blocked event loops)
- Lost data (dropped writes)

We implement **multi-level backpressure** from PTY to UI:

```
PTY stdout
    │
    ▼ (if daemon buffer full, pause subprocess reads)
PTY Subprocess internal buffer (8MB high watermark, 64MB hard limit)
    │
    ▼ (if session buffer full, pause subprocess stdout)
Daemon session buffer
    │
    ▼ (if client socket full, pause session output)
Main process stream socket
    │
    ▼ (if renderer can't keep up, events queue in main)
Renderer xterm.js
```

The PTY subprocess batches output aggressively:

```typescript
// Collect output for up to 32ms or 128KB, whichever comes first
const FLUSH_INTERVAL_MS = 32;
const MAX_BATCH_SIZE = 128 * 1024;

let batch = "";
let flushTimeout: NodeJS.Timeout | null = null;

pty.onData((data) => {
  batch += data;

  if (batch.length >= MAX_BATCH_SIZE) {
    flush();
  } else if (!flushTimeout) {
    flushTimeout = setTimeout(flush, FLUSH_INTERVAL_MS);
  }
});
```

This avoids the O(n²) string concatenation problem while maintaining ~30fps visual updates.

## The Headless Emulator: State Without a Screen

Each daemon session runs a headless xterm.js emulator. This might seem redundant—why emulate if there's no screen?

The emulator gives us:

1. **Accurate snapshots**: When a new client attaches, we serialize the *current screen state*, not just raw scrollback. The user sees exactly what was on screen, cursor position included.

2. **Terminal mode tracking**: Application mode, bracketed paste, mouse tracking—all parsed and tracked so reconnecting clients get correct state.

3. **CWD detection**: By parsing OSC escape sequences, we know the shell's current directory even when the session was created hours ago.

```typescript
// On attach, serialize current state
const snapshot = {
  snapshotAnsi: emulator.serialize(),        // Screen content as ANSI
  rehydrateSequences: emulator.getRehydrateSequences(),  // Mode restore
  cwd: emulator.getCwd(),                    // Parsed from OSC 7
  modes: emulator.getModes(),                // Cursor visible, etc.
  cols: emulator.cols,
  rows: emulator.rows,
};
```

## Lessons Learned

### 1. Protocol Versioning from Day One

When we introduced the two-socket split, existing daemons couldn't speak the new protocol. We handle this gracefully:

```typescript
// Client detects version mismatch
if (response.protocolVersion !== EXPECTED_VERSION) {
  await shutdownStaleDaemon();
  await startNewDaemon();
  return retry();
}
```

Always include version negotiation in your protocols.

### 2. React StrictMode Double-Mounts Are Real

React 18's StrictMode double-mounts components in development. Our terminal component would:

1. Mount → `createOrAttach()` → receive cold restore
2. Unmount (StrictMode cleanup)
3. Mount again → `createOrAttach()` → ???

If we re-read from disk, the cold restore flag might be gone (we wrote `endedAt`). Solution: **sticky cache**:

```typescript
// Cache cold restore until explicitly acknowledged
private coldRestoreInfo = new Map<string, ColdRestoreData>();

createOrAttach(paneId) {
  if (this.coldRestoreInfo.has(paneId)) {
    return this.coldRestoreInfo.get(paneId);  // Return cached
  }
  // ... actual logic
}

ackColdRestore(paneId) {
  this.coldRestoreInfo.delete(paneId);  // User acknowledged, clear cache
}
```

### 3. Don't Kill on Disconnect

When the Electron app closes, we *don't* kill daemon sessions:

```typescript
async cleanup() {
  // Close history writers (marks clean shutdown)
  for (const writer of this.historyWriters.values()) {
    await writer.close();
  }

  // Disconnect from daemon, but DON'T send kill
  this.disposeClient();

  // Sessions keep running for next app launch
}
```

This is the whole point of the daemon architecture. The default should be persistence, not cleanup.

### 4. Concurrency Limits Prevent Spawn Storms

Opening a workspace with 10 terminal panes would previously spawn 10 sessions simultaneously, overwhelming the daemon. We added a semaphore with priority:

```typescript
// Max 3 concurrent createOrAttach operations
private limiter = new PrioritySemaphore(3);

// Focused pane gets priority 0, background panes get 1
const priority = isFocusedPane ? 0 : 1;
await this.limiter.acquire(priority);
```

Users see their active terminal first, background tabs hydrate gradually.

## The Future: Cloud Backends

The abstraction boundary we've built isn't just about local persistence. The `TerminalRuntime` interface is provider-neutral:

```typescript
interface TerminalRuntime {
  capabilities: {
    persistent: boolean;
    coldRestore: boolean;
  };
  createOrAttach(params: CreateSessionParams): Promise<AttachResult>;
  write(sessionId: string, data: string): Promise<void>;
  // ...
}
```

Today, `LocalTerminalRuntime` wraps our daemon. Tomorrow, `CloudTerminalRuntime` could wrap SSH connections or remote tmux sessions—same interface, different backend. The renderer doesn't need to know where the terminal lives.

## Conclusion

Building a terminal that survives app restarts required rethinking the entire process architecture. Instead of owning PTYs directly, we built a daemon that outlives the app. Instead of a single socket, we split control and data paths. Instead of losing state on crash, we persist to disk and restore gracefully.

The result is a terminal that feels native but has persistence superpowers. Close the app mid-build, reopen it, and pick up right where you left off.

Sometimes the best developer experience comes from infrastructure that's completely invisible.

---

*Want to dive deeper? Check out the [Superset desktop source](https://github.com/anthropics/superset) for the full implementation.*
