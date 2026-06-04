# Host Service Architecture

What a host service is, how it's layered, and what needs to change.

## What is a host service?

A process that runs workspaces on a machine — laptop or remote server. It clones repos, runs terminals, watches filesystems, runs AI chat, and registers itself with the cloud as a **host**.

A **device** is anything that connects (phone, browser, desktop app). A **host** is something that runs workspaces. A MacBook is both. A phone is only a device. A remote server is only a host.

The host service must be deployable standalone with zero Electron awareness.

## Layering

```
┌──────────────────────────────────────────────────────────────┐
│  ELECTRON DESKTOP (apps/desktop)                             │
│                                                              │
│  Owns:                                                       │
│  - Spawning / adopting / releasing host service processes    │
│  - Desktop-specific credential providers                     │
│  - Session config (auth token, cloud API URL)                │
│  - System tray UI                                            │
│  - Quit flow (release vs stop)                               │
│  - Manifest files (on-disk persistence for process adoption) │
│                                                              │
│  Does NOT own:                                               │
│  - Workspace CRUD, host registration, terminal sessions      │
│  - Organization metadata (the host service knows its own)    │
│  - Any business logic a remote host would also need          │
├──────────────────────────────────────────────────────────────┤
│  HOST SERVICE (packages/host-service)                        │
│                                                              │
│  Owns:                                                       │
│  - Workspace lifecycle (create, delete, list)                │
│  - Host registration with the cloud                          │
│  - Terminal PTY management                                   │
│  - Filesystem watching                                       │
│  - Git operations                                            │
│  - AI chat runtime                                           │
│  - Its own identity and metadata (host.info endpoint)        │
│                                                              │
│  Does NOT own:                                               │
│  - How it was started (Electron vs systemd vs docker)        │
│  - Credential discovery (keychain, ~/.claude, git cred mgr) │
│  - Default paths like ~/.superset/host.db                    │
│  - Electron concepts (resourcesPath, manifests, etc.)        │
└──────────────────────────────────────────────────────────────┘
```

## Host vs Device

Rename in host service context:
- `deviceClientId` → `hostId` (generated internally from machine identity)
- `deviceName` → `hostName` (generated internally from `os.hostname()`)
- `device.ensureV2Host` → `host.register`

Host identity is intrinsic — the host service generates it at startup, not passed in as config.

---

For API shapes, boundaries, and concrete migration steps, see [HOST_SERVICE_BOUNDARIES.md](./HOST_SERVICE_BOUNDARIES.md).
