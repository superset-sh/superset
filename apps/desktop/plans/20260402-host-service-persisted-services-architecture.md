# Persisted Abilities Architecture

This is the proposed v2 direction.

The key idea is not "make terminal persistent". It is:

- a background supervisor owns durable desktop-shell behavior
- durable local capabilities live behind persisted runtimes
- `host-service` is the first persisted runtime
- terminal is the first persisted ability

Other abilities may follow the same pattern:

- terminals
- local agents
- indexing/search
- heavy MCP connectors
- long-running local jobs

## Core Rule

Keep these lifetimes separate:

- view lifetime: React pane mount/unmount
- model lifetime: pane exists in persisted app state
- ability lifetime: the runtime keyed by a stable id
- process lifetime: the service that owns the runtime
- desktop-shell lifetime: the supervisor that owns tray and `Quit`

Persistence bugs happen when these collapse into one boundary.

## Common Open-Source Pattern

Across Electron apps, the durable pattern is usually:

1. a desktop shell coordinates
- tray
- updater
- deep links
- single-instance lock
- service discovery and restart

2. a backend owns durable state
- local service
- worker process
- external engine or VM

3. the UI attaches to that backend
- renderer is a client, not the owner

Representative examples:

- Electron process model and `utilityProcess`
  - <https://www.electronjs.org/docs/latest/tutorial/process-model>
  - <https://www.electronjs.org/docs/latest/api/utility-process>
- VS Code: thin main plus specialized background processes like `ptyHost`
  - <https://github.com/microsoft/vscode/blob/main/src/vs/code/electron-main/main.ts>
  - <https://github.com/microsoft/vscode/blob/main/src/vs/platform/terminal/node/ptyHostMain.ts>
- Rancher Desktop / Podman Desktop: Electron orchestrates durable external runtimes
  - <https://github.com/rancher-sandbox/rancher-desktop/blob/main/background.ts>
  - <https://github.com/containers/podman-desktop/blob/main/packages/main/src/plugin/provider-registry.ts>
- Wave: Electron starts a local backend and the UI talks to it
  - <https://github.com/wavetermdev/waveterm/blob/main/emain/emain.ts>
  - <https://github.com/wavetermdev/waveterm/blob/main/emain/emain-wavesrv.ts>
  - <https://docs.waveterm.dev/durable-sessions>

## Proposed Superset Shape

### 1. BackgroundSupervisor Is The Desktop Shell

The supervisor should own:

- app boot
- tray
- single-instance lock
- service discovery
- service startup/shutdown
- health and version checks
- status exposure to the UI
- `Open Superset`
- `Quit`

The supervisor should not own:

- PTYs
- terminal buffers
- reconnect state
- other long-lived ability state

### 2. Host-Service Is The First Persisted Runtime

`host-service` should become the durable local owner for persisted abilities.

That means:

- one stable local boundary for runtime state
- one place for auth/discovery/versioning
- one place for long-lived local state

Terminal is the first concrete ability hosted there.

The tray should not move into `host-service`.

### 3. UI Only Attaches And Detaches

The UI process and renderer should usually do:

- open UI => attach
- close UI => detach
- relaunch UI => reattach

Actual destruction should be driven by the real model boundary and supervisor
policy, not by React cleanup or window lifetime.

### 4. Each Ability Gets A Stable Identity

For terminal:

- v2 local should use a stable terminal runtime id
- legacy v1 may continue to use `paneId` during compatibility
- `workspaceId` is metadata, not runtime identity

The same rule should apply to future abilities: stable runtime identity should
not depend on the current route or mounted React tree.

## Terminal Mapping

Terminal in `host-service` should own:

- session registry by stable runtime id
- `createOrAttach`
- `detach`
- `dispose`
- resize and mode state
- snapshots
- history / cold restore

The transport can still be websocket. The important rule is:

- transport identity must be session-scoped
- not window-scoped

## Recommended Internal Split

Keep the architecture layered:

- `BackgroundSupervisor`
  - owns desktop-shell lifecycle and tray
- `host-service`
  - owns durable local abilities
- optional specialized workers
  - for risky or heavy domains like PTYs
- UI process
  - owns windows only

If PTYs need stronger isolation later, add a terminal worker under
`host-service` rather than moving ownership back into the supervisor or the
renderer.

## Practical Direction

### Phase 1. Durable Desktop Shell

- introduce the supervisor
- make tray and `Quit` supervisor-owned
- make the UI process relaunchable

### Phase 2. Durable Host-Service

- make `host-service` a discoverable durable local runtime
- decouple it from window and renderer lifetime
- keep the supervisor responsible for discovery, health, and restart

### Phase 3. Terminal Ownership

- move v2 local terminal lifecycle fully into `host-service`
- make renderer terminal views attach/detach only
- keep removal/dispose driven by persisted model state

### Phase 4. Restore Contract

- add `createOrAttach`
- return snapshot plus terminal metadata on attach
- restore terminal state after UI relaunch or reattach

### Phase 5. Cold Restore

- persist terminal history and metadata
- support restore after host-service restart or crash
- keep this as a separate path from warm attach

### Phase 6. Worker Isolation

- if PTYs become risky or noisy, isolate them behind a worker under
  `host-service`
- keep `host-service` as the durable owner even if PTY execution moves down a
  level

### Phase 7. Generalize Persisted Abilities

- reuse the same model for other durable local abilities
- each ability gets stable identity, attach/detach semantics, and explicit
  disposal

### Phase 8. Retire v1 Compatibility

- keep v1 explicit as a compatibility tail while it still exists
- avoid deeply coupling the supervisor to the old v1 daemon if removal is near
- remove the legacy path once v2 is the default

## Decision

The target architecture is:

- supervisor as durable desktop shell
- `host-service` as persisted runtime platform
- terminal as the first persisted ability
- future durable abilities follow the same pattern
- v2 local is the primary target for the migration

That matches the common open-source shape much better than a renderer-owned or
window-process-owned lifecycle.
