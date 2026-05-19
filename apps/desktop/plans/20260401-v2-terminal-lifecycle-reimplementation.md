# V2 Terminal Lifecycle Reimplementation

This is the implementation doc to keep. It replaces the dead-end branch experiments and is intended to be sufficient to reproduce the correct design from scratch.

## Goal

Make v2 terminal panes behave like durable workbench terminals:

- switching tabs should not kill the terminal
- switching workspaces should not kill the terminal
- moving a pane should not kill the terminal
- a terminal should only die when its `paneId` is actually removed everywhere persisted

## Core Decision

Keep `paneId` as the terminal runtime identity.

Separate three lifetimes:

- view lifetime: React mount/unmount
- pane lifetime: whether a pane still exists in persisted pane state
- terminal session lifetime: xterm instance + transport + PTY/session

The required mapping is:

- mount => `attach`
- unmount => `detach`
- pane removed globally => `dispose`

## Design Principles We Learned

From VS Code, Hyper, and Tabby, the important pattern is not “never unmount”. The important pattern is:

- visibility is not destruction
- DOM attachment is not destruction
- process/session lifetime is longer than view lifetime

VS Code’s shape is the clearest model:

- group service decides visibility
- group decides hide/show
- terminal instance owns attach/detach/open/resize/dispose

The principle to copy is:

- UI switches hide or detach
- explicit close disposes

## What v2 Actually Does

These behaviors are important and should be assumed during implementation:

### Tabs

`@superset/panes` renders only the active tab. So tab switches unmount the old tab subtree. That means `TerminalPane` unmount on tab switch is expected.

### Workspaces

`useV2WorkspacePaneLayout` creates one mounted `WorkspaceStore` for the current workspace view and syncs it from `collections.v2WorkspaceLocalState`.

That means workspace switches also remove the old workspace’s pane tree from React. `TerminalPane` unmount on workspace switch is also expected.

### Implication

The fix is not “keep `TerminalPane` mounted forever”.

The fix is:

- do not treat unmount as destruction
- do not let transport identity depend on the currently mounted workspace route

## Source Of Truth

There are two relevant state layers:

### 1. Mounted workspace state

This is the current `WorkspaceStore`.

It only describes one rendered workspace and is suitable for:

- tab rendering
- pane rendering
- focus state
- attach/detach decisions

It is not suitable for terminal destruction.

### 2. Persisted global pane state

This is `collections.v2WorkspaceLocalState`.

Each row stores a workspace’s `paneLayout`. Across all rows, this is the only reliable answer to:

`does this paneId still exist anywhere?`

This is the destructive source of truth.

## What Not To Listen To

Do not dispose terminals from:

- React unmount
- tab switch
- workspace switch
- `workspaceId` changes
- `onRemovePane`
- `usePaneRemovalLifecycle`
- diffs of the mounted `WorkspaceStore`

All of those are view-local signals, not global pane existence.

## Runtime Model

### Runtime identity

- terminal runtime key: `paneId`

### Runtime owner

- one app-level `terminalRuntimeRegistry`
- registry owns xterm, transport, and connection state

### View component

- `TerminalPane` is only an attach/detach wrapper around the registry

`TerminalPane` should:

- receive `paneId`, `sessionKey`, `workspaceId`
- attach the runtime to a host element on mount
- detach on unmount

`TerminalPane` should not:

- decide when to dispose
- destroy the terminal in React cleanup

## Detached Data Flow

This is the most important behavioral rule for handoff:

- detached is not paused
- detached is not replay-only
- detached xterm must keep receiving process output

If background output is missing when the pane is shown again, detach is too destructive.

The ordinary tab/workspace-switch path should be:

- keep the websocket/session alive
- keep consuming incoming terminal data
- keep writing that data into the same in-memory xterm instance
- only remove DOM attachment, resize observers, and focus behavior

When the pane is shown again, the UI should reattach the already-updated xterm and relayout it.

This is how VS Code behaves:

- `TerminalGroup.setVisible(false)` hides the group with `display: none` and forwards visibility to terminal instances
- `TerminalInstance.setVisible(false)` does not stop process data flow
- process data still goes through `_onProcessData -> _writeProcessData -> xterm.raw.write(...)`

So normal hide/switch behavior should preserve background output without needing replay.

Replay or snapshot restore is still needed, but only for:

- renderer restart/remount when the xterm instance was lost
- cold restore after host/session loss

That is the part where the old v1 terminal model was closer to correct: it already had explicit restore/snapshot handling. The right design is to keep the v2 lifetime split, but retain the v1-style restore path as the fallback path rather than the normal detach path.

## Websocket Pattern

The websocket transport can stay.

But the transport identity must not be workspace-scoped.

### Wrong pattern

- websocket path or session identity derived from `workspaceId`
- socket close kills the PTY automatically
- switching workspaces implies a different terminal identity

Why it fails:

- the pane can be the same while the mounted workspace route changes
- if transport identity changes with `workspaceId`, the terminal is effectively recreated even though `paneId` did not change

### Correct pattern

- socket/session identity is pane-scoped
- use a stable pane/session route or equivalent stable pane/session key
- send `workspaceId` and `sessionKey` as init metadata, not as the transport identity
- server keeps a session registry keyed by `paneId`
- websocket close means detach
- explicit dispose means kill session

In other words:

- `workspaceId` is metadata for spawn context, cwd, history, ownership
- `paneId` is the runtime identity

## Where To Listen

### Attach / Detach

Listen in `TerminalPane`.

- mount => `terminalRuntimeRegistry.attach(...)`
- unmount => `terminalRuntimeRegistry.detach(paneId)`

### Dispose

Listen in one global hook mounted above workspace routes.

- mount the hook under authenticated layout
- place it inside `CollectionsProvider`
- read all rows from `collections.v2WorkspaceLocalState`
- flatten all terminal `paneId`s across all workspaces
- diff previous vs next global sets
- when a `paneId` disappears globally, call `terminalRuntimeRegistry.dispose(paneId)`

## Cross-Workspace Move Rule

Moves can be written as:

1. remove from workspace A
2. add to workspace B

If those writes are not atomic, a naive diff will see a temporary disappearance.

So before dispose:

- wait briefly
- re-read current global pane presence
- only dispose if the `paneId` is still absent

## Implementation Recipe

1. Keep `paneId` as the runtime key.
2. Keep `TerminalPane` as attach/detach only.
3. Remove terminal destruction from mounted workspace-store listeners.
4. Add a global terminal lifecycle hook under authenticated layout.
5. In that hook, watch `collections.v2WorkspaceLocalState`.
6. Flatten all terminal panes across all persisted workspaces.
7. Dispose only after a `paneId` disappears globally and remains absent after a short re-check.
8. If websocket transport is used, make it pane-scoped and make `workspaceId` init metadata only.

## Expected Behavior

- tab switch: detach only
- workspace switch: detach only
- route unmount: detach only
- pane move with same `paneId`: no dispose
- `workspaceId` change alone: no dispose
- pane removed from one workspace but still exists elsewhere: no dispose
- `paneId` gone from all persisted workspace layouts: dispose

## File Targets

These are the relevant places to reimplement:

- [Workspace.tsx](/Users/kietho/.superset/worktrees/superset/terminal-pane-lifecycle-and-rendering-strategies/packages/panes/src/react/components/Workspace/Workspace.tsx)
- [useV2WorkspacePaneLayout.ts](/Users/kietho/.superset/worktrees/superset/terminal-pane-lifecycle-and-rendering-strategies/apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useV2WorkspacePaneLayout/useV2WorkspacePaneLayout.ts)
- [usePaneRegistry.tsx](/Users/kietho/.superset/worktrees/superset/terminal-pane-lifecycle-and-rendering-strategies/apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/usePaneRegistry.tsx)
- [TerminalPane.tsx](/Users/kietho/.superset/worktrees/superset/terminal-pane-lifecycle-and-rendering-strategies/apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/TerminalPane/TerminalPane.tsx)
- [terminalRuntimeRegistry.ts](/Users/kietho/.superset/worktrees/superset/terminal-pane-lifecycle-and-rendering-strategies/apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/TerminalPane/terminalRuntimeRegistry.ts)
- [layout.tsx](/Users/kietho/.superset/worktrees/superset/terminal-pane-lifecycle-and-rendering-strategies/apps/desktop/src/renderer/routes/_authenticated/layout.tsx)
- [collections.ts](/Users/kietho/.superset/worktrees/superset/terminal-pane-lifecycle-and-rendering-strategies/apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/collections.ts)
- [terminal.ts](/Users/kietho/.superset/worktrees/superset/terminal-pane-lifecycle-and-rendering-strategies/packages/host-service/src/terminal/terminal.ts)

## Acceptance Criteria

- switching tabs preserves terminal output and process state
- switching workspaces preserves terminal output and process state
- background output that arrives while a pane is detached is visible when the pane is shown again
- moving a pane with the same `paneId` preserves terminal state
- unmounting a workspace view does not destroy the terminal session
- terminals are disposed only after their `paneId` is absent from all persisted workspace layouts
- websocket/session identity does not change just because the mounted `workspaceId` changed

## Sources

- VS Code visibility and group hiding:
  - https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/terminal/browser/terminalGroup.ts
  - https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/terminal/browser/terminalInstance.ts
  - https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/terminal/browser/xterm/xtermTerminal.ts
- Existing v1 restore model:
  - [useTerminalLifecycle.ts](/Users/kietho/.superset/worktrees/superset/terminal-pane-lifecycle-and-rendering-strategies/apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/hooks/useTerminalLifecycle.ts)
  - [useTerminalRestore.ts](/Users/kietho/.superset/worktrees/superset/terminal-pane-lifecycle-and-rendering-strategies/apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/hooks/useTerminalRestore.ts)
  - [useTerminalColdRestore.ts](/Users/kietho/.superset/worktrees/superset/terminal-pane-lifecycle-and-rendering-strategies/apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/hooks/useTerminalColdRestore.ts)
