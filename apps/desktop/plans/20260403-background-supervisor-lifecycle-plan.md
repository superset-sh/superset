# Background Supervisor Lifecycle Plan

Date: 2026-04-03

## Decision

Use one packaged desktop binary with two runtime roles:

- `supervisor`
  - default launch mode
  - owns tray, quit policy, updates, and `HostService`
- `ui`
  - launched by the supervisor
  - owns BrowserWindows and renderer IPC only

`HostService` remains a separate headless process owned by the supervisor.

This is the minimum architecture that satisfies the required UX:

- close last window does not stop local services
- tray stays alive while `HostService` is alive
- tray can reopen the UI
- tray `Quit` kills all running services and exits everything

## Exact Architecture

### Process Model

1. `BackgroundSupervisor`
- Electron app instance running with `--desktop-role=supervisor`
- no BrowserWindow required
- owns tray
- owns update checks
- owns `HostServiceManager`
- owns launch/focus/quit policy for the UI

2. `UI`
- Electron app instance running with `--desktop-role=ui`
- owns BrowserWindows
- owns renderer-facing `electronTrpc`
- does not own tray
- does not own host-service lifecycle

3. `HostService`
- headless local runtime service
- owned by the supervisor
- discoverable and adoptable
- survives UI exit

### Control Plane

Add a supervisor control server on `127.0.0.1` with:

- random local port
- shared secret
- manifest at `SUPERSET_HOME_DIR/supervisor/manifest.json`

The UI connects to the supervisor through this local control plane for:

- `openUi` / `focusUi`
- `ensureHostService(organizationId)`
- `getHostServiceStatus(organizationId)`
- `quitAll`
- optional later navigation commands

This keeps the renderer contract stable while moving lifecycle ownership out of
the UI process.

### Ownership Rules

`BackgroundSupervisor` owns:

- tray
- single running supervisor instance
- host-service discovery / adoption / spawn / restart / shutdown
- update coordination
- authoritative `Quit`

`UI` owns:

- windows
- menus tied to windows
- renderer IPC
- local navigation and presentation

`HostService` owns:

- long-lived local runtime state
- terminal runtime for v2 local
- future durable local services

## Implementation Plan

### Phase 1. Split Roles At Bootstrap

Implementation:

- make `apps/desktop/src/main/index.ts` a small role bootstrap
- add `apps/desktop/src/main/supervisor/index.ts`
- add `apps/desktop/src/main/ui/index.ts`
- move current window/app-shell startup into the new UI entrypoint
- keep `host-service/index.ts` as the headless service entrypoint

Exact behavior:

- no role arg: start or attach to supervisor, then request `openUi`
- `--desktop-role=supervisor`: run supervisor only
- `--desktop-role=ui`: run UI only

Primary file changes:

- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/main/ui/index.ts`
- `apps/desktop/src/main/supervisor/index.ts`
- `apps/desktop/src/lib/electron-app/factories/app/setup.ts`

### Phase 2. Add Supervisor Discovery And RPC

Implementation:

- add `supervisor-manifest.ts`
- add `supervisor-server.ts`
- add `supervisor-client.ts`
- persist `{ pid, port, secret, startedAt, version }`
- authenticate all UI-to-supervisor requests with the manifest secret

Primary file additions:

- `apps/desktop/src/main/lib/supervisor-manifest.ts`
- `apps/desktop/src/main/lib/supervisor-server.ts`
- `apps/desktop/src/main/lib/supervisor-client.ts`

Acceptance:

- a second default app launch does not create a second supervisor
- a second default app launch asks the existing supervisor to open/focus UI

### Phase 3. Make `HostService` Supervisor-Owned And Adoptable

Implementation:

- add host-service manifest support
- remove parent-pid shutdown as the primary lifetime rule
- make startup path `discover -> validate -> adopt -> spawn`
- keep restart policy in the supervisor
- add graceful stop support so `Quit` can shut down services cleanly

Primary file changes:

- `apps/desktop/src/main/lib/host-service-manager.ts`
- `apps/desktop/src/main/host-service/index.ts`
- `apps/desktop/src/main/lib/host-service-manifest.ts`
- `packages/host-service/src/trpc/router/health/health.ts`

Acceptance:

- UI exit does not kill `HostService`
- supervisor restart logic works without renderer participation

### Phase 4. Rewrite Tray Around Supervisor + HostService

Implementation:

- rewrite tray to read supervisor-owned host-service state
- remove daemon-session polling from tray
- tray menu becomes:
  - Open Superset
  - Host Service Status
  - Restart Host Service
  - Quit

`Quit` behavior:

1. stop all hosted services
2. stop `HostService`
3. close any UI process
4. destroy tray
5. exit supervisor

Primary file changes:

- `apps/desktop/src/main/lib/tray/index.ts`
- `apps/desktop/src/main/supervisor/index.ts`

### Phase 5. Proxy Existing Renderer APIs Through The UI Main Process

Implementation:

- keep renderer calls going through `electronTrpc`
- change UI main implementations from "own the process" to "call supervisor"
- make `hostServiceManager.getLocalPort` a supervisor proxy
- keep `HostServiceProvider` unchanged at the renderer boundary if possible

Primary file changes:

- `apps/desktop/src/lib/trpc/routers/host-service-manager/index.ts`
- `apps/desktop/src/renderer/routes/_authenticated/providers/HostServiceProvider/HostServiceProvider.tsx`
- optional shared types for supervisor RPC

Acceptance:

- renderer does not directly own host-service lifecycle anymore
- opening v2 local workspaces still resolves a local host URL the same way

### Phase 6. Make v2 Local The First-Class Consumer

Implementation:

- treat v2 local terminals as the target runtime
- keep v2 terminal attach/detach semantics on `HostService`
- keep v1 daemon explicit as legacy during migration
- remove daemon concepts from tray and new lifecycle docs

Transition rule:

- supervisor governs only supervisor-owned services
- legacy v1 daemon remains UI-scoped until migrated or removed

Primary file areas:

- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/`
- `packages/host-service/src/terminal/terminal.ts`
- `apps/desktop/src/renderer/routes/_authenticated/settings/terminal/`

## Non-Goals For The First Cut

- do not move tray into `HostService`
- do not migrate all v1 terminal behavior into the supervisor immediately
- do not introduce OS service registration yet
- do not add cloud-runtime changes in this plan

## Definition Of Done

- the supervisor is the only durable desktop-shell owner
- UI can exit and relaunch without killing `HostService`
- tray remains available while `HostService` is alive
- tray `Quit` kills all running hosted services and exits everything
- v2 local uses the supervisor-owned host-service lifecycle
- v1 remains clearly isolated as legacy behavior during migration
