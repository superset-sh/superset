# HostService Durability Implementation Plan

This plan makes `HostService` the durable owner of long-lived local services
under a separate background supervisor process.

This is the model we want for local desktop UX:

- the tray stays alive as long as the background supervisor and `HostService`
  are alive
- closing the last window does not stop local services
- the tray can reopen the UI
- `Quit` from the tray kills all running services, stops `HostService`, and
  exits the supervisor

## Scope

- durable across renderer, route, tab, workspace, and window churn
- durable across UI process exit and relaunch
- separate background supervisor owns tray and lifecycle policy
- `HostService` stays headless and owns runtime state
- service restart/update behavior is part of the implementation
- v2 local workspaces are the primary target

## Out Of Scope For The First Cut

- OS-level service registration outside the app install
- surviving full machine reboot/log out without relaunch policy
- moving the legacy v1 terminal stack onto the new supervisor model
- cold restore for every individual service

## Current State

Today:

- the Electron app process spawns `HostService` as a child process and waits
  for a random port over IPC
  - `apps/desktop/src/main/lib/host-service-manager.ts`
- `HostService` exits when that parent process dies
  - `apps/desktop/src/main/host-service/index.ts`
- tray currently lives in the same process as the window-owning app shell
  - `apps/desktop/src/main/lib/tray/index.ts`
- app quit stops all host-service instances
  - `apps/desktop/src/main/index.ts`
- v1 terminals still live on the legacy main-process terminal stack
- v2 local workspaces already depend on `HostService` as a runtime boundary

So the current model is:

- `HostService` is process-separated
- but tray lifetime is still tied to the window-owning app process
- the app cannot provide Docker-like background UX if that process exits
- v1 and v2 still have different runtime owners

## Target State

After this plan:

- a `BackgroundSupervisor` process owns:
  - tray
  - `HostService` discovery/adoption
  - `HostService` start/stop/restart
  - restart/update orchestration
  - `Open Superset`
  - `Quit`
- `HostService` owns long-lived local services and remains headless
- the UI process owns windows only and can exit/relaunch without killing the
  supervisor
- v2 local workspaces use `HostService` as their first-class runtime boundary
- v1 remains an explicit compatibility path until removed or migrated

## Process Roles

### BackgroundSupervisor

The supervisor should own:

- tray
- service discovery
- host-service liveness monitoring
- host-service restart policy
- update coordination
- UI relaunch/open-window actions
- the authoritative `Quit` command

It should not own:

- PTYs
- terminal buffers
- service runtime state
- renderer-facing business logic

### HostService

`HostService` should own:

- the lifecycle of long-lived local services
- their runtime state
- their control APIs
- attach/detach/reconnect boundaries
- later, any restore/checkpoint logic they need

It should remain headless.

The tray should not live inside `HostService`.

### UI Process

The UI process should own:

- windows
- visible app menus tied to those windows
- renderer bootstrapping
- user interactions that require mounted UI

It should not be the durable owner of local services.

### Renderer

The renderer is a client.

It should:

- attach to services
- detach from services
- render service state

It should not define service lifetime.

## Business Rules

### Tray

- the tray is owned by the supervisor, not by `HostService`
- the tray remains available while `HostService` is alive
- tray shows coarse host-service status:
  - starting
  - running
  - degraded
  - restarting
  - update required
- tray actions:
  - Open Superset
  - Restart Host Service
  - Check for Updates
  - Quit

### Close Last Window

- closing the last window closes the UI only
- it does not stop `HostService`
- it does not dispose the tray
- it does not mean "quit everything"

### Quit

- `Quit` from the tray means:
  - stop all running services hosted by `HostService`
  - stop `HostService`
  - dispose tray
  - exit supervisor
  - close any remaining UI process

### Updates

- app update checks continue in the background
- the supervisor must version-check the running `HostService`
- use two compatibility levels:
  - `serviceVersion`: human-facing build version
  - `protocolVersion`: hard compatibility gate
- policy:
  - if protocol matches and service is older, allow current service and show
    restart/update available
  - if protocol mismatches, require host-service restart before new work starts

## v1 / v2 Transition Policy

This migration should be optimized for v2 local workspaces first.

Rules:

- v2 local is the target runtime model
- v2 cloud is mostly unaffected because it already treats the workspace host as
  an external boundary
- v1 remains a compatibility tail while it still exists
- do not force the supervisor to become a permanent owner of two unrelated
  runtime systems if we can avoid it

Preferred transition:

1. make the supervisor + `HostService` architecture correct for v2 local
2. keep v1 behavior explicit and legacy while it still ships
3. remove or migrate v1 rather than deeply integrating its old terminal daemon
   into the supervisor model

## Phase 1. Introduce BackgroundSupervisor

Goal:

- split durable desktop shell behavior from the window-owning UI process

Implementation:

- introduce a supervisor process whose lifetime is not tied to window lifetime
- move tray ownership into that supervisor
- make the UI process disposable and relaunchable
- define clear supervisor commands:
  - open UI
  - start/adopt host-service
  - stop host-service
  - quit everything

File targets:

- current desktop bootstrap and lifecycle entry points
- current tray wiring
- likely additions under `apps/desktop/src/main/` for supervisor-specific
  lifecycle code

Acceptance:

- closing all windows leaves the supervisor and tray alive
- the tray can reopen the UI
- UI process exit/relaunch does not kill the supervisor

## Phase 2. Service Discovery And Adoption

Goal:

- make a running `HostService` discoverable and adoptable by the supervisor

Implementation:

- add a stable local manifest for `HostService`
- add health and protocol/version handshake
- make discovery/adoption the primary path before spawn
- remove dependence on parent-only ready IPC as the sole startup contract

File targets:

- `apps/desktop/src/main/lib/host-service-manager.ts`
- `apps/desktop/src/main/host-service/index.ts`
- a local manifest/discovery helper under `apps/desktop/src/main/lib/`
- `packages/host-service/src/trpc/router/health/health.ts`

Acceptance:

- supervisor can discover an already-running host-service
- status checks no longer rely only on "did the port open"

## Phase 3. Tray And Quit Semantics

Goal:

- make tray and quit semantics authoritative in the supervisor

Implementation:

- move host-service status reading into the supervisor-owned tray
- make `Open Superset` relaunch/focus the UI process
- make `Quit` stop all hosted services before shutdown
- remove ambiguous "quit UI" vs "quit everything" behavior from ad hoc globals

File targets:

- supervisor lifecycle entry points
- tray menu builder
- host-service manager control surface

Acceptance:

- tray remains useful even with no windows open
- `Quit` always kills services and exits everything

## Phase 4. Update And Restart Policy

Goal:

- support app updates while also handling host-service restarts safely

Implementation:

- keep binary update checks in the background supervisor
- add host-service compatibility checks on:
  - supervisor startup
  - host-service connect/adoption
  - after app update install
- add pending-restart state exposed to tray and renderer
- make restart timing explicit:
  - immediate restart if idle
  - prompt or defer if active long-lived services exist

File targets:

- update orchestration code
- host-service manager
- tray status/menu surface
- `packages/host-service/src/trpc/router/health/health.ts`

Acceptance:

- app update and host-service restart are no longer separate invisible systems
- protocol mismatch results in a clear restart requirement

## Phase 5. Move Long-Lived Services Behind HostService

Goal:

- treat `HostService` as the default owner of long-lived local services

Implementation:

- require each service to expose explicit control operations:
  - create
  - attach
  - detach
  - dispose
- keep streaming transport separate from control semantics
- do not require an already-open websocket to dispose or restart service state
- prioritize v2 local terminal/runtime ownership first

Primary file targets:

- `packages/host-service/src/app.ts`
- `packages/host-service/src/trpc/router/*`
- `packages/host-service/src/runtime/*`
- service-specific routes like
  - `packages/host-service/src/terminal/terminal.ts`

Acceptance:

- `HostService` is the runtime owner
- renderer is only a client
- v2 local no longer depends on UI process lifetime for service lifetime

## Phase 6. v1 Compatibility Tail

Goal:

- keep the legacy v1 runtime path explicit while the product migrates

Implementation:

- document v1 as legacy
- keep its lifecycle separate from the new supervisor model as much as possible
- avoid introducing permanent coupling between the supervisor and old v1 daemon
  semantics
- remove the compatibility layer once v1 is gone or migrated

Acceptance:

- v2 local uses the supervisor + host-service model
- v1 remains understandable and bounded during migration

## Recommended Order

Implement in this order:

1. background supervisor split
2. manifest/discovery/adoption
3. tray and quit semantics
4. update/restart policy
5. move v2 local long-lived services fully behind `HostService`
6. keep v1 as an explicit compatibility tail until removal

## Definition Of Done

This plan is complete when:

- closing the last window does not stop `HostService`
- the tray survives UI process exit/relaunch
- `Quit` from the tray kills all running services and exits everything
- the supervisor can discover and adopt `HostService`
- host-service compatibility is explicit and restartable
- v2 local is correctly hosted behind `HostService`
- v1 is either removed or clearly isolated as legacy behavior
