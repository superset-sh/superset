# Host Service Lifecycle

## Architecture

Electron main owns app lifecycle, tray, and host-service management. Host-services run as child processes that can outlive the app via manifest-based adoption.

```
Electron Main
├── Quit policy (requestQuit / prepareQuit / exitImmediately)
├── Tray (macOS only — status, restart, stop, quit)
├── HostServiceManager (start, stop, adopt, restart per org)
│   └── host-service child processes (survive app quit)
│       └── manifest.json (on-disk handoff for re-adoption)
└── Windows (disposable — hide to tray on macOS)
```

### Quit modes

All quit paths use a single `QuitMode` (`"release" | "stop"`):

- **release** — detach from services, they keep running for re-adoption on next launch
- **stop** — SIGTERM all services, then exit
- **implicit** (Cmd+Q with active services on macOS) — hide windows to tray

### Service adoption

On startup, the manager scans `~/.superset/host/*/manifest.json`, health-checks each endpoint, and reconnects to surviving services. Incompatible or unreachable services are cleaned up and respawned.

### Design decisions

- **No supervisor process.** Electron main owns everything. Simpler while v1 and v2 coexist.
- **No tray on Windows/Linux.** Services still survive quit and are re-adopted, but there's no persistent UI to manage them.
- **Tray calls `requestQuit(mode)`.** One function, one codepath — no setter chains or flag mutation.
- **Manifest handling is single-sourced.** Both parent and child use `host-service-manifest.ts`. Files are written with 0o600 permissions.
