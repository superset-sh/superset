# Global Terminal Pane Lifecycle

## Rule

Keep the current terminal runtime model. Change only where removal is detected.

A terminal should be disposed only when its `paneId` no longer exists anywhere in persisted workspace state.

## Keep

- `terminalRuntimeRegistry` as the long-lived runtime owner
- `paneId` as runtime identity
- `TerminalPane` doing `attach` on mount and `detach` on unmount
- passing `paneId` and terminal data through `usePaneRegistry`

## Do Not Use

Do not dispose terminals from:

- React unmount
- `onRemovePane`
- `usePaneRemovalLifecycle`
- diffs of the mounted `WorkspaceStore`

Those only describe the currently mounted workspace, not global pane existence.

## Source Of Truth

Use `collections.v2WorkspaceLocalState`.

Why: it stores `paneLayout` for every workspace, so it is the only place that can answer:

`does this paneId still exist anywhere?`

## Exact Change

1. Keep `TerminalPane` as attach/detach only.
2. Remove terminal-specific disposal from `usePaneRegistry`.
3. Add a global hook under authenticated layout, inside `CollectionsProvider`.
4. In that hook, read all `v2WorkspaceLocalState` rows and flatten all persisted panes.
5. Diff previous vs next global terminal `paneId` sets.
6. Dispose only ids that disappear globally.
7. Before dispose, re-check after a short delay to avoid false removal during cross-workspace moves.

## Lifecycle

- tab switch: detach only
- workspace switch: detach only
- route unmount: detach only
- move pane with same `paneId`: no dispose
- delete pane everywhere persisted: dispose

## Files

- [layout.tsx](/Users/kietho/.superset/worktrees/superset/terminal-pane-lifecycle-and-rendering-strategies/apps/desktop/src/renderer/routes/_authenticated/layout.tsx)
- [collections.ts](/Users/kietho/.superset/worktrees/superset/terminal-pane-lifecycle-and-rendering-strategies/apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/collections.ts)
- [usePaneRegistry.tsx](/Users/kietho/.superset/worktrees/superset/terminal-pane-lifecycle-and-rendering-strategies/apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/usePaneRegistry.tsx)
- [TerminalPane.tsx](/Users/kietho/.superset/worktrees/superset/terminal-pane-lifecycle-and-rendering-strategies/apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/TerminalPane/TerminalPane.tsx)
- new global terminal lifecycle hook files

## Acceptance

- switching tabs preserves terminal state
- switching workspaces preserves terminal state
- moving a pane with the same `paneId` preserves terminal state
- terminal is disposed only after its `paneId` is gone from all persisted workspace layouts
