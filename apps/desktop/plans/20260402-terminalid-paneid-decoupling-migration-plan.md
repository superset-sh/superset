# TerminalId / PaneId Decoupling Migration Plan

This plan covers the first surface-area migration only:

- decouple terminal session identity from pane identity
- move terminal session records into `HostService`
- make panes reference `terminalId`
- keep terminal ownership effectively 1:1 for now

This is intentionally narrower than the full durable terminal rewrite.

## Goal

Make terminal session identity independent from layout identity.

Target model:

- `paneId` = view/layout identity
- `terminalId` = terminal session identity
- pane data stores `terminalId`
- `HostService` owns terminal session records by `terminalId`
- renderer attaches a pane view to `terminalId`

This is required because pane identity and terminal identity are different concerns, even if lifecycle stays 1:1 in the first cut.

## Current State

On `origin/main`, the surface is still pane-scoped:

- terminal pane data still carries launch/session fields in
  - [types.ts](/Users/kietho/.superset/worktrees/superset/terminal-pane-lifecycle-and-rendering-strategies/apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types.ts)
- the pane registry renders terminal by `paneId` in
  - [usePaneRegistry.tsx](/Users/kietho/.superset/worktrees/superset/terminal-pane-lifecycle-and-rendering-strategies/apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/usePaneRegistry.tsx)
- the renderer runtime registry is keyed by `paneId` in
  - [terminal-runtime-registry.ts](/Users/kietho/.superset/worktrees/superset/terminal-pane-lifecycle-and-rendering-strategies/apps/desktop/src/renderer/lib/terminal/terminal-runtime-registry.ts)
- the websocket route is `/terminal/:paneId` and host-service sessions are keyed by `paneId` in
  - [terminal.ts](/Users/kietho/.superset/worktrees/superset/terminal-pane-lifecycle-and-rendering-strategies/packages/host-service/src/terminal/terminal.ts)

So today the system still treats pane identity and terminal identity as the same thing.

## Target State

After this migration:

- workspace pane state stores `terminalId`
- host-service DB stores terminal session records
- renderer runtime registry is keyed by `terminalId`
- websocket/session transport is keyed by `terminalId`
- `paneId` is no longer used as terminal runtime identity

The source of truth becomes:

- workspace state owns pane existence and layout
- host-service owns terminal session existence and runtime state

## Non-Goals

This plan does not require:

- full daemon replacement
- final tray/background semantics
- cold restore implementation
- PTY worker isolation
- multi-attach UI

Those can come later.

## Data Model

### Workspace State

Change terminal pane data from launch/session-shaped data to a reference:

```ts
export interface TerminalPaneData {
  terminalId: string;
}
```

`paneLayout` remains the persisted source of truth for panes:

- [schema.ts](/Users/kietho/.superset/worktrees/superset/terminal-pane-lifecycle-and-rendering-strategies/apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema.ts)

### Host-Service DB

Add a terminal session table in:

- [schema.ts](/Users/kietho/.superset/worktrees/superset/terminal-pane-lifecycle-and-rendering-strategies/packages/host-service/src/db/schema.ts)

Suggested first-cut shape:

```ts
terminal_sessions
- id                // terminalId
- status            // active | exited | disposed
- created_at
- last_attached_at
- ended_at
- origin_workspace_id?   // optional provenance only
```

Do not put create-only metadata on the main session row unless the row is
actually going to be used to recreate the terminal later.

Fields like:

- `cwd`
- `shell`
- `launchMode`
- `command`

are create metadata, not session lifecycle state.

If we need them later for revive, audit, or reopen fidelity, add a separate
launch/create record:

```ts
terminal_session_launches
- terminal_id
- cwd
- shell
- launch_mode
- command
- created_at
```

Optional later session fields:

- snapshot metadata
- retention policy
- title
- exit code / signal

Important: the pane -> terminal relationship stays in workspace state first. We do not need a duplicate reference table in host-service for the first cut.

## Lifecycle Model

The first-cut semantics are:

- create terminal session
  - create `terminal_sessions` row in host-service
  - create pane with `terminalId`
- mount pane view
  - attach to `terminalId`
- unmount pane view
  - detach from `terminalId`
- move pane between tabs/workspaces
  - keep same `terminalId`
- remove pane
  - remove the pane reference
  - if that was the last reference to the `terminalId`, dispose the terminal session
- kill terminal
  - same result as removing the last pane reference in this cut

So this phase decouples identity, but keeps ownership effectively 1:1.

Why this is fine:

- `paneId` is no longer the runtime key
- `terminalId` is now the session key
- but the last pane reference still owns terminal disposal

Later phases can relax that to:

- keep until explicit kill
- keep for TTL when unreferenced

## Phase Order

### Phase 1. Introduce `terminalId` On The Surface

Change renderer and pane data to treat `terminalId` as the public session key.

Work:

- update `TerminalPaneData` to `{ terminalId: string }`
- update `addTerminalTab` and split actions to create a `terminalId`
- pass `terminalId` into `TerminalPane`
- change renderer terminal runtime registry to key by `terminalId`
- change websocket URLs from `/terminal/:paneId` to `/terminal/:terminalId`

Files:

- [types.ts](/Users/kietho/.superset/worktrees/superset/terminal-pane-lifecycle-and-rendering-strategies/apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types.ts)
- [page.tsx](/Users/kietho/.superset/worktrees/superset/terminal-pane-lifecycle-and-rendering-strategies/apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/page.tsx)
- [usePaneRegistry.tsx](/Users/kietho/.superset/worktrees/superset/terminal-pane-lifecycle-and-rendering-strategies/apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/usePaneRegistry.tsx)
- [TerminalPane.tsx](/Users/kietho/.superset/worktrees/superset/terminal-pane-lifecycle-and-rendering-strategies/apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/TerminalPane/TerminalPane.tsx)
- [terminal-runtime-registry.ts](/Users/kietho/.superset/worktrees/superset/terminal-pane-lifecycle-and-rendering-strategies/apps/desktop/src/renderer/lib/terminal/terminal-runtime-registry.ts)
- [terminal-ws-transport.ts](/Users/kietho/.superset/worktrees/superset/terminal-pane-lifecycle-and-rendering-strategies/apps/desktop/src/renderer/lib/terminal/terminal-ws-transport.ts)
- [terminal.ts](/Users/kietho/.superset/worktrees/superset/terminal-pane-lifecycle-and-rendering-strategies/packages/host-service/src/terminal/terminal.ts)

Acceptance:

- terminal reconnect uses `terminalId`, not `paneId`
- moving a pane does not change terminal runtime identity
- removing the last pane reference disposes the terminal session

### Phase 2. Add Host-Service Terminal Session Records

Make `HostService` the durable source of truth for terminal sessions.

Work:

- add `terminal_sessions` schema
- create a host-service API to create terminal sessions explicitly
- stop creating a new terminal implicitly just because a socket opened
- keep attach separate from create
- keep `terminal_sessions` focused on lifecycle state, not create-only metadata

Suggested API shape:

```ts
createTerminalSession({
  workspaceId,
  cwd,
  launchMode,
  command?,
}): { terminalId }
```

And transport attach becomes:

```ts
ws /terminal/:terminalId
```

Acceptance:

- terminal session has a durable record before first attach
- socket attach is no longer the creation boundary
- `terminal_sessions` remains a lifecycle table, not a launch-config dump

### Phase 3. Remove Launch Config From Pane Data

Once host-service owns terminal session creation:

- remove `cwd`
- remove `launchMode`
- remove `command`
- remove `sessionKey`

from terminal pane data entirely.

Those belong to terminal session creation and host-service metadata, not to the pane layout model.

Acceptance:

- terminal panes only reference `terminalId`
- all terminal launch metadata lives in host-service
- create metadata is either transient or stored separately from `terminal_sessions`

### Phase 4. Add Session Policies

After the identity split is stable, expand beyond the first-cut policy.

Default policy in this migration:

- dispose immediately when unreferenced

Later options:

- keep until explicit kill
- keep for TTL when unreferenced

This should be a terminal-session policy, not a pane policy.

## Recommended Implementation Notes

### 1. Keep The Workspace Schema Change Small

Do not try to redesign all pane data at once.

For this migration, the key surface change is:

- terminal panes reference `terminalId`

That is the minimum viable decoupling.

### 2. Keep `paneId` For UI Actions Only

`paneId` still matters for:

- split
- focus
- close pane
- tab layout
- title/pin state

It just stops being the terminal runtime key.

### 3. Keep Ownership Simple In This Cut

Do not introduce orphan sessions yet.

For this migration:

- one pane reference owns one terminal session
- deleting the last pane reference should dispose the session
- implement that declaratively from `terminalId` reference removal, not from a specific close button path

### 4. Creation Must Move Up A Layer

Today terminal creation is effectively hidden inside the websocket open path in host-service.

That is the wrong boundary for decoupled sessions.

We need:

- explicit session create
- later attach by `terminalId`

### 5. Keep Session Rows Honest

`terminal_sessions` should answer:

- does this session exist?
- what state is it in?
- when was it created / last attached / ended?

It should not also try to be:

- the create request
- the launch history
- the revive spec

unless we explicitly choose that and start reading it back during recreate.

### 4. Do Not Block On Full Restore

This migration is still worth doing before warm snapshots or cold restore.

The identity split is the prerequisite for those later steps.

## Source Examples

No source exactly matches our pane model, but these are the closest useful references:

### VS Code

VS Code separates terminal runtime objects from view attachment:

- `TerminalInstance` is the terminal runtime
- groups/views attach and detach that runtime from DOM elements

Sources:

- <https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/terminal/browser/terminalInstance.ts>
- <https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/terminal/browser/terminalGroup.ts>

Why it matters:

- runtime identity is not DOM identity
- view visibility and terminal lifetime are separate

### tmux

tmux has separate ids for sessions, windows, and panes.

Source:

- <https://github.com/tmux/tmux/wiki/Advanced-Use>

Why it matters:

- pane identity is not the top-level terminal identity
- multiple layers of identity are normal in terminal systems

### Wave

Wave durable sessions keep the session/job alive independently from the current UI attachment.

Sources:

- <https://docs.waveterm.dev/durable-sessions>
- <https://github.com/wavetermdev/waveterm/blob/main/emain/emain.ts>
- <https://github.com/wavetermdev/waveterm/blob/main/emain/emain-wavesrv.ts>

Why it matters:

- session lifetime is separate from view lifetime
- reconnect is a first-class path

## Agent Notes

If an agent picks this up, the recommended order is:

1. change pane data to `terminalId`
2. thread `terminalId` through renderer and host-service transport
3. add host-service terminal session records
4. move terminal creation out of websocket open
5. remove old launch/session fields from pane data

Avoid mixing this with:

- tray/background redesign
- full host-service supervision changes
- cold restore
- PTY worker extraction

Those are follow-on steps and will make the surface migration harder to land.
