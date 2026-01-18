# PTY Supervisor Implementation Plan

## Problem

When the app updates, the terminal daemon restarts, killing all PTYs and shell processes. Users lose running commands (e.g., `npm install`, servers).

## Solution

Split the daemon into two processes:

- **Supervisor**: Owns PTYs and sessions, rarely updated
- **Daemon**: Protocol bridge to app, frequently updated

```
CURRENT:
App → Daemon → pty-subprocess → PTY
       ↓
   (dies on update, kills PTYs)

NEW:
App → Daemon → Supervisor → pty-subprocess → PTY
       ↓            ↓
   (can restart)  (stays alive, PTYs survive)
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Electron App                                                │
│   └── TerminalHostClient                                    │
└──────────────┬──────────────────────────────────────────────┘
               │ Unix socket: ~/.superset/terminal-host.sock
┌──────────────▼──────────────────────────────────────────────┐
│ Terminal Host Daemon         ← Can restart on app update    │
│   - Client authentication                                   │
│   - Protocol versioning                                     │
│   - Event routing                                           │
│   └── SupervisorClient                                      │
└──────────────┬──────────────────────────────────────────────┘
               │ Unix socket: ~/.superset/pty-supervisor.sock
┌──────────────▼──────────────────────────────────────────────┐
│ PTY Supervisor               ← Rarely restarts              │
│   - Session lifecycle                                       │
│   - HeadlessEmulator state                                  │
│   - pty-subprocess management                               │
│   └── Session                                               │
│         └── pty-subprocess                                  │
│               └── node-pty PTY                              │
└─────────────────────────────────────────────────────────────┘
```

## Responsibility Split

| Component | Owns | Update Frequency |
|-----------|------|------------------|
| **Daemon** | Client auth, protocol, routing | Every app release |
| **Supervisor** | Sessions, PTYs, emulator state | Rarely (bugs only) |
| **pty-subprocess** | Single PTY instance | Never |

## Implementation Phases

### Phase 1: Create Supervisor Process

**New files:**
```
apps/desktop/src/main/pty-supervisor/
├── index.ts          # Entry point, socket server
├── supervisor.ts     # Session management (from terminal-host.ts)
├── session.ts        # Session class (from terminal-host/session.ts)
└── types.ts          # Supervisor IPC protocol
```

**Tasks:**
- [ ] Define supervisor IPC protocol types
- [ ] Create supervisor socket server on `~/.superset/pty-supervisor.sock`
- [ ] Move `Session` class to supervisor
- [ ] Move `TerminalHost` class to supervisor
- [ ] Supervisor spawns pty-subprocesses (existing logic)
- [ ] Supervisor owns HeadlessEmulator state

### Phase 2: Update Daemon as Proxy

**Modified files:**
```
apps/desktop/src/main/terminal-host/
├── index.ts              # Simplified - proxy only
└── supervisor-client.ts  # NEW - connection to supervisor
```

**Tasks:**
- [ ] Create `SupervisorClient` class in daemon
- [ ] Daemon spawns supervisor if not running
- [ ] Remove session state from daemon (stateless proxy)
- [ ] Forward all session operations to supervisor
- [ ] Forward events from supervisor to app clients

### Phase 3: Handle Daemon Restart

**Tasks:**
- [ ] Supervisor detects daemon disconnect
- [ ] Supervisor buffers terminal output while daemon disconnected
- [ ] On daemon reconnect: supervisor sends existing session list
- [ ] Daemon re-attaches to sessions, flushes buffered output
- [ ] App clients see seamless continuation

### Phase 4: Supervisor Upgrade Path (Optional)

For the rare case when supervisor itself needs an update:

**Tasks:**
- [ ] Add `prepareUpgrade` IPC command
- [ ] Serialize all session state (scrollback, cwd, env)
- [ ] New supervisor reads serialized state on startup
- [ ] Respawn PTYs with restored scrollback (cold restore)

## Supervisor IPC Protocol

```typescript
// ~/.superset/pty-supervisor.sock

// Requests (Daemon → Supervisor)
type SupervisorRequest =
  | { type: "hello"; daemonPid: number; daemonVersion: string }
  | { type: "createSession"; sessionId: string; workspaceId: string; paneId: string; cwd: string; shell: string; env: Record<string, string>; cols: number; rows: number }
  | { type: "attachSession"; sessionId: string }
  | { type: "detachSession"; sessionId: string }
  | { type: "write"; sessionId: string; data: string }
  | { type: "resize"; sessionId: string; cols: number; rows: number }
  | { type: "getSnapshot"; sessionId: string }
  | { type: "killSession"; sessionId: string; signal?: string }
  | { type: "listSessions" }

// Responses (Supervisor → Daemon)
type HelloResponse = {
  supervisorPid: number;
  supervisorVersion: string;
  sessions: SessionInfo[];  // Existing sessions for reconnection
}

type AttachResponse = {
  snapshot: TerminalSnapshot;  // Current state for render
}

// Events (Supervisor → Daemon, unsolicited)
type SupervisorEvent =
  | { type: "data"; sessionId: string; data: string }
  | { type: "exit"; sessionId: string; exitCode: number; signal?: number }
  | { type: "error"; sessionId: string; error: string; code?: string }
```

## Daemon Upgrade Flow

```
1. App v2 launches, detects daemon v1 running

2. App sends "shutdown" to daemon v1
   ┌────────┐     ┌──────────┐     ┌────────────┐
   │ App v2 │────▶│ Daemon v1│     │ Supervisor │
   └────────┘     └────┬─────┘     └────────────┘
                       │ shutdown        │
                       ▼                 │ (stays alive)
                      💀                 │

3. App spawns daemon v2, connects to existing supervisor
   ┌────────┐     ┌──────────┐     ┌────────────┐
   │ App v2 │────▶│ Daemon v2│────▶│ Supervisor │
   └────────┘     └──────────┘     └────────────┘

4. Daemon v2 sends "hello", gets session list

5. Daemon v2 attaches to sessions, gets snapshots

6. App resubscribes - terminals continue seamlessly
   (Running shells never noticed anything)
```

## File Changes Summary

| File | Change |
|------|--------|
| `pty-supervisor/index.ts` | **New** - Supervisor entry point |
| `pty-supervisor/supervisor.ts` | **New** - Session management |
| `pty-supervisor/session.ts` | **Moved** from terminal-host/ |
| `pty-supervisor/types.ts` | **New** - IPC types |
| `terminal-host/index.ts` | **Simplified** - Proxy only |
| `terminal-host/supervisor-client.ts` | **New** - Supervisor connection |
| `terminal-host/session.ts` | **Deleted** - Moved to supervisor |
| `terminal-host/terminal-host.ts` | **Deleted** - Moved to supervisor |
| `lib/terminal-host/client.ts` | **Modified** - Spawn supervisor |

## Estimated Effort

| Category | Lines |
|----------|-------|
| New code (supervisor) | ~500 |
| Modified code (daemon proxy) | ~300 |
| Moved code (session management) | ~800 |

Mostly reorganization of existing code, minimal new logic.

## Tradeoffs

**Benefits:**
- Daemon can update with every app release
- Shell processes survive daemon restarts
- Users don't lose running commands

**Costs:**
- Additional process (supervisor)
- Additional IPC hop (minor latency)
- Supervisor updates still kill shells (but rare)

## Alternative: Enhanced Cold Restore

If supervisor complexity isn't worth it, improve cold restore instead:

1. Continuously save scrollback (already have HistoryWriter)
2. Save shell CWD and env vars
3. On daemon restart, show "Restoring terminals..."
4. Respawn shells in previous CWD with scrollback

This is the tmux-resurrect approach - shells restart but state is preserved.
