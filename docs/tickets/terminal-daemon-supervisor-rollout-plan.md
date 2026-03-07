# Terminal Daemon Supervisor Rollout Plan (Real Fix)

## Status

Proposed replacement for the generation-routing approach in `docs/tickets/terminal-daemon-progressive-rollout.md`.

This document assumes the current PR branch is reset to `origin/main` and the real fix is implemented as a fresh PR stack.

## Executive Summary

The best long-term design is a stable supervisor daemon with a fixed client socket.

- Electron main talks only to the supervisor.
- The supervisor owns rollout state, worker lifecycle, and session routing.
- Versioned worker daemons own PTYs and session state.
- Existing sessions stay pinned to their original worker generation until exit.
- New sessions route to the preferred worker generation.
- Only the supervisor writes persistent daemon metadata to disk.

This replaces the current approach where the Electron main process is responsible for talking to multiple daemon generations directly and coordinating rollout state through shared files.

## Problem Statement

The user-facing issue is terminal breakage after app updates:

- terminals intermittently fail to open
- workspaces can appear blank or disappear on navigation
- users see "Connection lost" states that often require manual daemon restart

The root problem is not only version mismatch. The deeper issue is ownership:

- the app currently talks directly to the terminal daemon
- the daemon both owns PTYs and acts as the routing/control plane
- rollout state is distributed across multiple processes

Once multiple daemon generations can exist at the same time, the system needs a stable control plane. Without that, the app must become a rollout coordinator, which is brittle and pushes long-lived state into the wrong process.

## Why The Current Direction Is Not The Best Long-Term Fix

The generation-routing PR is a valid stopgap, but it keeps the core architecture wrong.

Problems with the direct multi-generation client model:

- Electron main becomes responsible for session-to-generation routing.
- The app must understand draining, preferred, and retired worker states.
- The app becomes sensitive to generation-local disconnects and stream failures.
- Shared rollout metadata needs cross-process coordination.
- The routing layer is coupled to app version changes instead of being isolated from them.

The right invariant is:

- supervisor owns routing
- workers own PTYs
- clients do not know which worker generation a session is on

## Goals

- Preserve running terminal sessions across app updates.
- Ensure new terminal sessions use the preferred worker generation.
- Prevent a draining worker shutdown from affecting sessions attached to a healthy preferred worker.
- Make rollout state single-owner and deterministic.
- Keep the public terminal behavior unchanged for renderer code.
- Allow crash recovery and upgrade recovery without manual user intervention.

## Non-Goals

- No cloud or remote session orchestration.
- No renderer redesign.
- No database schema changes.
- No new cross-device state sync.
- No attempt to hot-swap PTYs between worker generations.

## Target Architecture

### Processes

There are three actors:

1. Electron main process
2. Terminal supervisor daemon
3. Terminal worker daemons

### Ownership Model

Electron main process:

- launches the supervisor if needed
- connects to the supervisor through one fixed client protocol
- never talks to workers directly

Supervisor daemon:

- owns the fixed socket and token used by the app
- owns session routing: `sessionId -> workerGenerationId`
- owns generation state: `preferred`, `draining`, `retired`
- owns worker spawn, drain, retire, crash handling, and recovery
- proxies control requests and stream events between app clients and workers
- persists minimal metadata required for restart/recovery

Worker daemon:

- owns PTYs and terminal session state
- implements the existing terminal-host behavior
- exposes a worker-only protocol to the supervisor
- never writes rollout state directly to shared disk

### External vs Internal Protocols

Use two protocols:

- `client <-> supervisor` protocol
- `supervisor <-> worker` protocol

The external client protocol should stay as close as possible to the current `terminal-host` protocol so the renderer and terminal manager do not need a large rewrite.

The internal worker protocol can evolve independently and should explicitly include:

- worker generation ID
- worker app version
- worker state
- session inventory
- event subscription registration

### Socket Layout

Use fixed supervisor paths:

- `~/.superset/terminal-supervisor.sock`
- `~/.superset/terminal-supervisor.token`
- `~/.superset/terminal-supervisor.pid`

Use generation-specific worker paths that are internal to the supervisor:

- `~/.superset/terminal-worker.<generation>.sock`
- `~/.superset/terminal-worker.<generation>.token`
- `~/.superset/terminal-worker.<generation>.pid`

The app only knows the supervisor paths.

### Persistent State

Only the supervisor writes persistent daemon metadata.

Suggested persistent file:

- `~/.superset/terminal-supervisor.json`

Suggested contents:

- current preferred generation
- known workers and their state
- routing map metadata if needed for recovery
- timestamps for create, promote, drain, retire events

Do not use worker-written heartbeats in a shared JSON file.

The supervisor should prefer reconstructing live state by contacting workers on startup instead of trusting stale disk metadata.

## Rollout Lifecycle

### Startup

1. App connects to supervisor.
2. If supervisor is not running, app starts it.
3. Supervisor ensures a preferred worker exists for the current app generation.
4. Supervisor enumerates any live older workers.
5. Supervisor marks previously preferred workers as draining.
6. Supervisor rebuilds session routing by asking each live worker for session inventory.

### New Session

1. App sends `createOrAttach(sessionId)` to supervisor.
2. Supervisor checks whether `sessionId` is already mapped.
3. If mapped and alive, route to that worker.
4. If not mapped, route to the preferred worker.
5. Supervisor stores or refreshes the routing map entry.

### Existing Session Reattach

1. App requests attach by `sessionId`.
2. Supervisor routes only to the mapped worker.
3. If the worker reports that the session no longer exists, supervisor clears the mapping.
4. Once mapping is cleared, the session can fall through to cold restore or fresh creation logic on the next attach path.

The supervisor must never silently migrate an existing live session to another worker.

### Drain and Retirement

1. When a new preferred worker is promoted, the previous preferred worker becomes draining.
2. Draining workers accept no new sessions except reattach for already mapped sessions.
3. Supervisor periodically checks session counts for draining workers.
4. When a draining worker reaches zero live sessions, supervisor shuts it down and retires it.
5. A max drain age may be enforced, but only by supervisor policy.

### Worker Crash

1. Supervisor detects worker process exit or failed heartbeat over the worker protocol.
2. Supervisor marks routed sessions on that worker as disconnected.
3. Supervisor clears routing entries for sessions proven lost.
4. Preferred-worker crash triggers immediate spawn of a replacement preferred worker.
5. Draining-worker crash does not affect other workers.

## Protocol Requirements

### Client to Supervisor

Continue exposing:

- `hello`
- `createOrAttach`
- `write`
- `resize`
- `detach`
- `signal`
- `kill`
- `killAll`
- `listSessions`
- `clearScrollback`
- `shutdown`

Add supervisor metadata only where useful for debugging:

- supervisor version
- current preferred generation
- routed generation for create/list responses

### Supervisor to Worker

Worker RPC should include:

- `workerHello`
- `workerListSessions`
- `workerCreateOrAttach`
- `workerWrite`
- `workerResize`
- `workerDetach`
- `workerSignal`
- `workerKill`
- `workerKillAll`
- `workerShutdown`
- `workerSubscribeEvents`

Worker event payloads should include:

- session ID
- generation ID
- event type
- payload

## Code Plan

### New Modules

Create a new supervisor area:

- `apps/desktop/src/main/terminal-supervisor/index.ts`
- `apps/desktop/src/main/terminal-supervisor/supervisor.ts`
- `apps/desktop/src/main/terminal-supervisor/client-registry.ts`
- `apps/desktop/src/main/terminal-supervisor/worker-registry.ts`
- `apps/desktop/src/main/terminal-supervisor/worker-process.ts`
- `apps/desktop/src/main/terminal-supervisor/protocol.ts`

Create shared helpers if needed:

- `apps/desktop/src/main/lib/terminal-supervisor/client.ts`
- `apps/desktop/src/main/lib/terminal-supervisor/paths.ts`
- `apps/desktop/src/main/lib/terminal-supervisor/state.ts`

### Existing Modules To Refactor

Turn the current terminal host into a worker:

- `apps/desktop/src/main/terminal-host/index.ts`
- `apps/desktop/src/main/terminal-host/terminal-host.ts`
- `apps/desktop/src/main/lib/terminal-host/types.ts`

Repoint the current client to the supervisor:

- `apps/desktop/src/main/lib/terminal-host/client.ts`

Keep the terminal manager contract stable as much as possible:

- `apps/desktop/src/main/lib/terminal/daemon/daemon-manager.ts`
- `apps/desktop/src/main/lib/terminal/index.ts`

### Specific Refactors

`apps/desktop/src/main/lib/terminal-host/client.ts`

- Stop resolving multiple worker generations directly.
- Connect only to the supervisor fixed socket.
- Remove generation-owned connection state from the app.

`apps/desktop/src/main/terminal-host/index.ts`

- Remove rollout coordination responsibilities.
- Keep PTY/session ownership.
- Expose worker-only RPC/event behavior.

`apps/desktop/src/main/lib/terminal/index.ts`

- Remove app-owned rollout coordinator.
- Supervisor startup becomes the only warmup/reconcile entrypoint.

`apps/desktop/src/main/lib/terminal/daemon/daemon-manager.ts`

- Consume a generation-agnostic supervisor client.
- Keep session-facing renderer behavior stable.

## Migration Plan

### Legacy Installation

On first startup with the supervisor architecture:

1. App starts supervisor.
2. Supervisor checks for a legacy single daemon socket.
3. If legacy daemon exists, supervisor enumerates its sessions and treats it as a draining worker.
4. Supervisor spawns a new preferred worker for the current app generation.
5. Existing legacy sessions continue on the legacy worker until exit.
6. New sessions go to the preferred worker.
7. Legacy worker is retired when drained.

### Existing Progressive-Rollout Branch

If the generation-routing PR has already shipped internally before this architecture lands:

1. Supervisor enumerates all live generation workers using the same worker socket naming convention.
2. Supervisor rebuilds routing by asking each worker for sessions.
3. Supervisor then takes ownership of preferred and draining state and ignores old worker-written registry metadata except as bootstrap hints.

## Failure and Recovery Strategy

### Supervisor Restart

Supervisor restart must be survivable.

On supervisor boot:

- enumerate live worker sockets
- authenticate to each worker
- request session inventory
- rebuild routing map from worker responses
- re-establish event subscriptions

If a worker cannot be reached, mark it dead and clear its route entries.

### Worker Restart

Worker restart should not happen automatically for a generation that still owns live sessions unless the worker has actually crashed.

Preferred worker:

- safe to restart by spawning a replacement and marking the old one draining if still alive

Draining worker:

- never replace automatically for the purpose of migration
- if it crashes, its sessions are lost and should surface as disconnected or cold-restorable

## Testing Plan

### Unit Tests

Add unit coverage for:

- supervisor routing map behavior
- worker promotion and draining transitions
- generation-scoped disconnect handling
- recovery from stale state file
- recovery from worker process exit

### Integration Tests

Add integration coverage for:

1. Single worker through supervisor:
- create
- attach
- write
- resize
- kill

2. Mixed generation rollout:
- spawn old worker with existing session
- boot new supervisor and preferred worker
- confirm old session remains on old worker
- confirm new session lands on new worker
- close old session
- confirm old worker retires

3. Crash handling:
- preferred worker crash
- draining worker crash
- supervisor restart while workers are alive

### Manual Verification

Dogfood scenarios:

- update desktop app with long-running terminals open
- open new terminals immediately after upgrade
- navigate away and back to workspaces
- restart app while old worker is draining
- force-kill a worker process and verify only affected sessions fail

## Observability

Add structured logs for:

- supervisor start and stop
- worker spawn
- worker promoted to preferred
- worker marked draining
- worker retired
- session routed to worker
- session route cleared
- worker crash
- supervisor recovery scan

Add telemetry counters for:

- preferred worker spawns
- draining worker retirements
- worker crash count
- session reconnect failures
- cold restore fallback count

## Delivery Plan

Use stacked PRs.

### PR 1: Supervisor Foundation

Scope:

- introduce supervisor process
- fixed socket ownership
- single worker only
- client talks to supervisor

Acceptance:

- no user-visible behavior change
- existing terminal tests pass through supervisor path

### PR 2: Worker Proxying And Routing

Scope:

- supervisor event proxying
- session routing map
- worker protocol separation

Acceptance:

- all terminal control/event flows work through supervisor

### PR 3: Versioned Workers And Drain Logic

Scope:

- preferred/draining/retired worker states
- versioned worker spawn
- drain and retirement loop

Acceptance:

- mixed-generation upgrade path works

### PR 4: Migration, Recovery, And Hardening

Scope:

- legacy daemon migration
- supervisor restart recovery
- worker crash recovery
- telemetry and docs

Acceptance:

- real upgrade path is stable under failure cases

## Estimate

Rough estimate for one engineer familiar with this code:

- PR 1: 2 to 3 days
- PR 2: 2 to 4 days
- PR 3: 3 to 4 days
- PR 4: 3 to 5 days

Total:

- prototype: about 1 week
- mergeable, well-tested implementation: about 2 to 3 weeks

## Risks

- supervisor protocol compatibility across app updates is the hardest design constraint
- event proxying can introduce backpressure or ordering bugs if done carelessly
- recovery after supervisor restart must be proven with tests, not assumed
- legacy migration must not accidentally kill existing sessions

## Open Questions

- Do we want the supervisor protocol to remain backward-compatible across multiple desktop versions, or only adjacent versions?
- Should session routing metadata be persisted at all, or rebuilt entirely from workers at startup?
- Do we want a minimal debug UI showing supervisor state and live worker generations?

## Acceptance Criteria

- App update does not force-kill existing terminal sessions.
- New terminal tabs after update use the new preferred worker generation.
- Existing sessions continue functioning on their original worker generation.
- Retiring a draining worker does not affect sessions on other workers.
- Supervisor restart recovers live workers and rebuilds routing without manual repair.
- No shared multi-writer rollout registry remains in the design.

## Recommendation

If the goal is the best architecture rather than the fastest mitigation:

- reset the current PR branch
- keep the current progressive-rollout PR as reference only
- implement this supervisor design as a fresh stacked series

That is the cleanest path to a durable fix.
