# PR 3 Plan: Pane Store Registry

## Summary

This PR moves the V2 workspace pane store from being created on route mount to a module-level registry keyed by `workspaceId`. It adds a helper `addLaunchPanes(workspaceId, launches)` that callers (eventually `workspace.create()` in PR 4) use to write panes before — or without — the workspace route ever mounting.

**Scope of this PR:** the registry, the helper, and a minimal refactor of `useV2WorkspacePaneLayout` to read from the registry. Nothing else. The pending-row launch-adoption hook (`useConsumePendingLaunch`) is **kept as-is** per the canonical plan; its eventual removal lands in PR 5/7.

This PR is independent of PR 1 (host agent configs) and PR 2 (host attachments). PR 4 (`workspace.create()`) is the first real consumer of `addLaunchPanes`; PR 5 retires `useConsumePendingLaunch` once the modal stops stashing launch blobs on a `pendingWorkspaces` row.

## Why this PR exists

Today the V2 workspace pane store is created inside the route via `useState(() => createWorkspaceStore({...}))`. That has three real consequences:

1. **`workspace.create()` (PR 4) returns a list of already-started sessions** (`{ kind: "terminal"; terminalId }` / `{ kind: "chat"; chatSessionId }`). The renderer needs to write panes for those existing sessions, not generate new ones. Today there's no entry point that can reach the pane store before mount, so the only way to communicate launch info from creator to consumer is the `pendingWorkspaces.terminalLaunch` / `chatLaunch` side-channel.
2. **The pending-row side-channel exists only because of this constraint** — it's state that should be a function argument.
3. **Mount-as-trigger is race-prone.** `useConsumePendingLaunch` carries a `consumedRef` set keyed by `${pendingId}:terminal|chat` to dedupe across effect re-runs, which is the kind of thing you only need when you've conflated two responsibilities.

After this PR, `addLaunchPanes(workspaceId, launches)` can be called from anywhere — modal, `workspace.create()`'s caller, automations, the CLI's renderer side. The route, when it mounts, just reads from the same store the registry is already holding.

## Architecture

### Registry

A module-level singleton at `apps/desktop/src/renderer/lib/workspace-pane-registry/`. Same pattern as the existing `terminalRuntimeRegistry` in `apps/desktop/src/renderer/lib/terminal/`.

```ts
// boot — wired into app startup once a collections instance exists
initWorkspacePaneRegistry(collections);

// callers
const store = getOrCreateWorkspacePaneStore(workspaceId);
addLaunchPanes(workspaceId, launches);
```

`initWorkspacePaneRegistry(collections)` must be called at app boot before any caller. The registry holds the collections instance internally so `getOrCreateWorkspacePaneStore` doesn't need it as an arg.

### Persistence

The registry **owns the persistence sync**, not the route hook. When a store is created, the registry:

- Reads the persisted `paneLayout` from `collections.v2WorkspaceLocalState` (or seeds with `EMPTY_STATE` if no row yet) and calls `store.replaceState(...)`.
- Subscribes to the store and writes back to `v2WorkspaceLocalState` on every change (with the same `getSnapshot` debounce currently in `useV2WorkspacePaneLayout`).
- Subscribes to `v2WorkspaceLocalState` row updates and pushes them into the store.

Why owned by the registry, not the route hook:

- We expect flows that **add panes without navigating** (background create, automations writing into a not-yet-visible workspace's pane state, pre-warming). If sync only happens while the route is mounted, those panes silently fail to persist — recoverable but bad UX.
- Single source of truth: store is always in sync regardless of caller.
- Costs (registry imports collections; novel pattern in this codebase compared to `terminalRuntimeRegistry`) are paid once at boot.

The route hook becomes a thin wrapper:

```ts
export function useV2WorkspacePaneLayout({ projectId, workspaceId }) {
  const { ensureWorkspaceInSidebar } = useDashboardSidebarState();
  const store = getOrCreateWorkspacePaneStore(workspaceId);
  useEffect(() => {
    ensureWorkspaceInSidebar(workspaceId, projectId);
  }, [ensureWorkspaceInSidebar, projectId, workspaceId]);
  return { store };
}
```

### `addLaunchPanes(workspaceId, launches)`

```ts
type LaunchResult =
  | { kind: "terminal"; terminalId: string; label?: string }
  | { kind: "chat"; chatSessionId: string; label?: string };

addLaunchPanes(workspaceId: string, launches: LaunchResult[]): void;
```

Behavior:

- Gets or creates the store for `workspaceId`.
- For each launch, dedupes by id against existing panes in the store. If a pane with the same `terminalId` (terminal) or `sessionId` (chat) already exists, focus it instead of adding a duplicate.
- For new launches, calls `store.getState().addTab(...)` with the right pane data.
- Focuses the last added (or matched) pane.

`addLaunchPanes` is **attach-only**. It does not carry an `initialCommand`. The host has already started the underlying session; the pane just attaches.

### `TerminalPaneData.initialCommand` becomes optional

Today: `{ terminalId: string; initialCommand: string }`.
After: `{ terminalId: string; initialCommand?: string }`.

- Existing callers (`useConsumePendingLaunch`, `useV2PresetExecution`) keep sending `initialCommand` and behavior stays identical.
- `addLaunchPanes` omits `initialCommand`. The terminal pane component, on connect, branches: if `initialCommand` is defined, write it + enter; otherwise, just attach.

This is a one-line type change plus a small branch in `TerminalPane`. No other call sites need updating.

## Files Changed

New:

- `apps/desktop/src/renderer/lib/workspace-pane-registry/workspace-pane-registry.ts`
- `apps/desktop/src/renderer/lib/workspace-pane-registry/workspace-pane-registry.test.ts`
- `apps/desktop/src/renderer/lib/workspace-pane-registry/addLaunchPanes.ts`
- `apps/desktop/src/renderer/lib/workspace-pane-registry/addLaunchPanes.test.ts`
- `apps/desktop/src/renderer/lib/workspace-pane-registry/index.ts`

Modified:

- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useV2WorkspacePaneLayout/useV2WorkspacePaneLayout.ts` — drop the `useState` + persistence effects; read from registry.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types.ts` (or wherever `TerminalPaneData` is) — `initialCommand` becomes optional.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/TerminalPane/TerminalPane.tsx` — branch on `initialCommand` defined vs not.
- App boot site (likely `apps/desktop/src/renderer/index.tsx` or the `CollectionsProvider`) — call `initWorkspacePaneRegistry(collections)` once collections are available.

## Tests

Registry:

- `getOrCreateWorkspacePaneStore` returns the same instance for the same `workspaceId`, distinct instances for different ids.
- Persisted layout from a `v2WorkspaceLocalState` row is loaded into the store on first creation.
- Updates to the store write back to the row.
- Updates to the row push into the store.
- Init guard: `getOrCreateWorkspacePaneStore` throws if called before `initWorkspacePaneRegistry`.

`addLaunchPanes`:

- Adds terminal panes for `{ kind: "terminal"; terminalId; label? }` entries; pane data has the id but no `initialCommand`.
- Adds chat panes for `{ kind: "chat"; chatSessionId; label? }` entries.
- Dedupes by id: calling twice with the same id results in a single pane and focuses it.
- Mixed array of terminal + chat works.
- Empty array is a no-op.

Route hook:

- After the refactor, mounting `useV2WorkspacePaneLayout` for a `workspaceId` that already has panes added via `addLaunchPanes` shows those panes immediately (no flash of empty state).

## Out of Scope

- **Removing the pending-row side-channel.** `pendingWorkspaces.terminalLaunch` / `chatLaunch` and `useConsumePendingLaunch` keep working. PR 5 retires them when the new workspace modal moves onto `workspace.create()`.
- **`workspace.create()` itself.** Lives in PR 4. PR 3 just provides the surface PR 4 will call into.
- **The pending route's own logic.** Untouched.
- **Migrating terminal presets to host-driven start.** Today `useV2PresetExecution` mints terminal ids renderer-side and embeds `initialCommand`. That keeps working. A future PR could move presets onto the same attach-only flow `addLaunchPanes` uses, but that's not this PR.

## Risks and rollout

- **Registry boot ordering.** `initWorkspacePaneRegistry(collections)` must run before any caller. Unit-tested by the init guard. Real risk: a code path that calls `getOrCreateWorkspacePaneStore` from a top-level module load before app boot finishes. Mitigation: throw a clear error from the guard so the misuse is loud and fixable.
- **Persistence behavior change.** Previously, persistence only ran while the route was mounted. After PR 3, persistence runs whenever a store exists in the registry (i.e. for any workspace whose pane state has been touched this session). Net effect: stores stay in sync more, write more often. The existing snapshot-equality guard already avoids redundant writes.
- **Test isolation.** The registry holds module state; tests must reset it between cases. Plan: export a `__resetWorkspacePaneRegistryForTests()` like `terminalRuntimeRegistry` does.

## Follow-Ups

- PR 4: `workspace.create()` returns `launches` and the modal calls `addLaunchPanes(workspaceId, launches)` before navigating.
- PR 5: delete `pendingWorkspaces.terminalLaunch` / `chatLaunch` columns and `useConsumePendingLaunch` once the modal is migrated.
