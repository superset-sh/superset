# Host Service Lifecycle

## Architecture

Electron main owns app lifecycle, tray, and host-service management. Host-service runs as a child process **coupled to Electron** — it starts and stops with the app. Terminal sessions (PTYs) survive Electron restarts via a separate `pty-daemon` that host-service supervises on its own detached lifecycle.

```
┌─────────────────────────────────────────────────────┐
│ Electron Main Process                               │
│                                                     │
│  ┌──────────┐  ┌──────────────────────┐  ┌───────┐ │
│  │   Tray   │  │ HostServiceCoordinator│  │Windows│ │
│  │ (macOS)  │  │                      │  │       │ │
│  │ restart  │◄─┤ status events        │  │ hide/ │ │
│  │ stop     │  │ start/stop per org   │  │ show  │ │
│  │ quit ────┼──┼──► app.quit()        │  │       │ │
│  └──────────┘  └──────┬───────────────┘  └───────┘ │
└───────────────────────┼─────────────────────────────┘
                        │ spawn (attached, detached:false)
          ┌─────────────┼─────────────┐
          │             │             │
          ▼             ▼             ▼
   ┌────────────┐ ┌────────────┐ ┌────────────┐
   │host-service│ │host-service│ │host-service│
   │  (org A)   │ │  (org B)   │ │  (org C)   │
   │            │ │            │ │            │
   │ HTTP/tRPC  │ │ HTTP/tRPC  │ │ HTTP/tRPC  │
   │            │ │            │ │            │
   │ supervises │ │ supervises │ │ supervises │
   │ pty-daemon │ │ pty-daemon │ │ pty-daemon │
   └─────┬──────┘ └─────┬──────┘ └─────┬──────┘
         │              │              │
         ▼              ▼              ▼
   ┌────────────┐ ┌────────────┐ ┌────────────┐
   │ pty-daemon │ │ pty-daemon │ │ pty-daemon │
   │ (detached) │ │ (detached) │ │ (detached) │
   │  → PTYs    │ │  → PTYs    │ │  → PTYs    │
   └────────────┘ └────────────┘ └────────────┘
```

### Quit behavior

Electron `before-quit` always SIGTERMs every host-service via `coordinator.stopAll()`. There is no "release" mode — host-services no longer outlive the app.

What survives a quit:
- **pty-daemon + open PTYs** — pty-daemon is spawned by host-service with `detached: true`. On the next launch, host-service adopts the existing pty-daemon via its socket/manifest. See `packages/host-service/src/daemon/DaemonSupervisor.ts`.

What does **not** survive:
- In-flight chat completions, file watchers, durable-session reads. These are bound to host-service's process and tear down with it. The renderer handles reconnect on next launch.

### How host-service is reaped

| Quit path | Mechanism |
|---|---|
| Clean `before-quit` (Cmd+Q, tray quit, auto-update install) | `coordinator.stopAll()` SIGTERMs each child; child closes its HTTP server and exits within `SHUTDOWN_GRACE_MS` (3s) |
| Electron force-killed / crash | Parent-pid watchdog inside host-service (`apps/desktop/src/main/host-service/index.ts`) polls `process.ppid`. When Electron's pid is gone, the child shuts down voluntarily |
| Dev `bun dev` SIGTERM/SIGINT | Coordinator's `stopAll()` runs in the signal handler before `app.exit()` |

The watchdog only runs when `HOST_PARENT_PID` is set in the child env — CLI-spawned host-services (`packages/cli`) explicitly skip coupling and use `detached: true` for their own deployment model.

### Manifest

Each host-service still writes `~/.superset/host/{orgId}/manifest.json` (pid, endpoint, authToken, app version). Electron's coordinator no longer reads it for adoption; the manifest is now consumed by:

- **CLI** (`packages/cli`) — finds and talks to a running host-service for `status`/`stop`/`start` commands.
- **`coordinator.reset()`** — SIGKILLs whatever pid the manifest names as a recovery escape hatch when a wedged host-service has been left behind (superset-sh/superset#4299).

Host-service writes the manifest on boot but does not remove it on exit; coordinator removes it on `stop()` and when the child exits.

### Design decisions

- **Coupled to Electron.** PTY survival is owned by pty-daemon, not host-service. No reason for host-service itself to outlive the app — coupling deletes the adoption codepath and removes a class of "wedged adopted service" bugs.
- **CLI keeps its own spawn.** Standalone host-service deployments (CLI-driven) still use detached lifetime via `packages/cli/src/lib/host/spawn.ts`. The coordinator's coupling only applies to Electron-spawned children.
- **No supervisor process.** Electron main owns everything.
- **No tray on Windows/Linux.** Services stop with the app.
- **Manifest handling stays single-sourced.** Both desktop and CLI use the same `host-service-manifest.ts` API. Files are written with 0o600 permissions.
