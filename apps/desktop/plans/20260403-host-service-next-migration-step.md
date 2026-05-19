# HostService Next Migration Step

This doc is the handoff after the current host-service durability branch.

It answers two questions:

- what the current branch actually achieved
- what the next migration step is given the chosen desktop UX

## Chosen UX Constraint

We want Docker-like local desktop behavior:

- the tray stays alive while local services are alive
- closing the last window does not stop local services
- the tray can reopen the UI
- `Quit` from the tray kills all running services and exits everything

That means the durable desktop shell and the durable service owner are not the
same thing.

## Current Branch Achieved

The current branch moves `HostService` from "plain child process" toward
"supervised background service inside the app lifetime".

Useful progress from that branch:

- `HostService` has explicit status:
  - starting
  - running
  - degraded
  - restarting
  - stopped
- `HostService` exposes basic version/protocol metadata
- tray can show host-service status
- app update flow can mark a running host-service as restart-needed
- `HostService` can survive renderer, route, tab, and workspace churn

Those pieces are still useful.

## What It Still Does Not Solve

It does not yet satisfy the chosen UX.

Today:

- tray still dies with the window-owning app process
- host-service still behaves like a supervised child of that process
- startup still depends on parent-child IPC for port discovery
- there is no stable supervisor-level service adoption
- v1 and v2 still use different runtime owners

So the current branch gives:

- in-app durability

It does not yet give:

- supervisor-owned background UX
- tray survival across UI process exit/relaunch
- a clean "Quit kills all services" authority boundary
- a coherent v1-to-v2 migration boundary

## Next Migration Step

The next step is:

- introduce a separate `BackgroundSupervisor` process

This turns the architecture from:

- one app process supervising `HostService`

into:

- background supervisor owns tray and lifecycle
- `HostService` stays headless and owns long-lived services
- UI process becomes disposable

## Implementation

### 1. Split Process Roles

Define three roles explicitly:

- `BackgroundSupervisor`
  - owns tray
  - owns `Quit`
  - owns host-service discovery/adoption
  - owns restart/update orchestration
- `HostService`
  - owns long-lived local services
  - remains headless
- UI process
  - owns windows only
  - can exit/relaunch without killing the supervisor

Do not put the tray into `HostService`.

### 2. Add Supervisor-Level Service Manifest And Adoption

Persist a small manifest for the running host-service instance.

Suggested fields:

- `pid`
- `endpoint`
- `authToken`
- `serviceVersion`
- `protocolVersion`
- `startedAt`
- `organizationId`

On supervisor startup:

- read the manifest
- check whether the process is still alive
- try to connect to the recorded endpoint
- validate auth/version/protocol
- only spawn a new host-service if discovery fails

### 3. Move Tray Ownership Into The Supervisor

Tray behavior should now mean:

- `Open Superset` => relaunch or focus the UI process
- `Quit` => stop all hosted services, stop `HostService`, exit supervisor

Closing the last window should not affect the supervisor or tray.

### 4. Make Restart And Update Policy Supervisor-Owned

Use the version/protocol surface as a real restart gate.

Rules:

- protocol mismatch => restart required
- version mismatch with protocol compatibility => restart available
- active long-lived services => prompt or defer restart

### 5. Make v2 The Primary Migration Target

Use the supervisor + host-service model for v2 local first.

Recommended transition policy:

- v2 local is the target architecture
- v2 cloud is mostly unaffected
- v1 remains an explicit legacy path while it still ships
- avoid building a deep permanent compatibility bridge between the supervisor
  and the old v1 terminal daemon if removal is near

## File Targets

Primary:

- new supervisor lifecycle/bootstrap code under `apps/desktop/src/main/`
- `apps/desktop/src/main/lib/host-service-manager.ts`
- `apps/desktop/src/main/host-service/index.ts`
- tray/lifecycle wiring
- `packages/host-service/src/trpc/router/health/health.ts`

Likely additions:

- a local service-manifest helper under `apps/desktop/src/main/lib/`
- a host-service discovery/adoption helper used by the supervisor
- a UI relaunch/open bridge between supervisor and the window-owning process

## Acceptance

This next step is done when:

- the tray survives UI process exit/relaunch
- app startup attempts to discover an existing host-service before spawning
- host-service compatibility is validated through a real handshake
- `Quit` from the tray kills all services and exits everything
- background behavior is coherent on every platform we support
- the app can clearly distinguish:
  - closing UI
  - relaunching UI
  - stopping host-service
  - quitting everything
- v2 local is the primary consumer of the new lifecycle model
