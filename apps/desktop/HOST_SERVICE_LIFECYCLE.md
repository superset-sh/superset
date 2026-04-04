# Host Service Lifecycle

## Architecture

Electron main owns app lifecycle, tray, and host-service management. Host-services run as child processes that can outlive the app via manifest-based adoption.

```
┌─────────────────────────────────────────────────────┐
│ Electron Main Process                               │
│                                                     │
│  ┌──────────┐  ┌──────────────────────┐  ┌───────┐ │
│  │   Tray   │  │ HostServiceManager   │  │Windows│ │
│  │ (macOS)  │  │                      │  │       │ │
│  │          │◄─┤ status events        │  │ hide/ │ │
│  │ restart  │  │ start/stop/adopt     │  │ show  │ │
│  │ stop     │  │ per org              │  │       │ │
│  │ quit ────┼──┼──► requestQuit(mode) │  │       │ │
│  └──────────┘  └──────┬───────────────┘  └───────┘ │
└───────────────────────┼─────────────────────────────┘
                        │ IPC + stdio
          ┌─────────────┼─────────────┐
          │             │             │
          ▼             ▼             ▼
   ┌────────────┐ ┌────────────┐ ┌────────────┐
   │host-service│ │host-service│ │host-service│
   │  (org A)   │ │  (org B)   │ │  (org C)   │
   │            │ │            │ │            │
   │ HTTP/tRPC  │ │ HTTP/tRPC  │ │ HTTP/tRPC  │
   │ port:rand  │ │ port:rand  │ │ port:rand  │
   │            │ │            │ │            │
   │ writes     │ │ writes     │ │ writes     │
   │ manifest   │ │ manifest   │ │ manifest   │
   └────────────┘ └────────────┘ └────────────┘
        │              │              │
        ▼              ▼              ▼
   ~/.superset/host/{orgId}/manifest.json
```

### Quit modes

All quit paths use a single `QuitMode` (`"release" | "stop"`):

- **release** — detach from services, they keep running for re-adoption on next launch
- **stop** — SIGTERM all services, then exit
- **implicit** (Cmd+Q with active services on macOS) — hide windows to tray

### Manifest adoption

Each host-service child writes `~/.superset/host/{orgId}/manifest.json` on startup (pid, endpoint, authToken, version). It's a pidfile extended with connection info.

- **Release quit** — children keep running, manifests stay on disk
- **Next launch** — `discoverAndAdoptAll()` scans manifests, health-checks each pid/endpoint, reconnects if healthy, removes and respawns if not
- **Stop quit** — SIGTERM children, they remove their own manifests on shutdown

```
App Launch                          App Quit (release)          Next Launch
─────────                          ──────────────────          ───────────
spawn child ──► child writes        parent detaches             scan manifests
               manifest.json        manifests stay on disk      health-check pid/endpoint
               {pid, endpoint,      child keeps running         ├─ healthy → reconnect
                authToken, ...}                                 └─ dead/bad → remove, respawn
```

### v1 vs v2 terminal paths

v1 terminals run on a separate **terminal-host daemon** (`src/main/terminal-host/`) — a persistent background process that owns PTYs over a Unix domain socket. It has its own survival and reconnection model independent of host-service.

v2 terminals run through **host-service** child processes. The quit/adopt/tray lifecycle described here only applies to host-service instances.

### Design decisions

- **No supervisor process.** Electron main owns everything. Simpler while v1 and v2 coexist.
- **No tray on Windows/Linux.** Services still survive quit and are re-adopted, but there's no persistent UI to manage them.
- **Tray calls `requestQuit(mode)`.** One function, one codepath — no setter chains or flag mutation.
- **Manifest handling is single-sourced.** Both parent and child use `host-service-manifest.ts`. Files are written with 0o600 permissions.
