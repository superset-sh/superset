# Sidebar "Remove from Sidebar" fix + sidebar re-render review

Status: Part 1 targeted fixes and Part 2 low-risk sidebar re-render hardening
implemented. The remote "Remove from Sidebar" bug is real, and the
implementation now addresses both re-add paths identified below. The proposed
broad `v2WorkspaceLocalState` split is not validated by the current evidence
and should not be implemented as the fix for sidebar re-renders without new
profiling data.

## Review verdict

1. **Bug validity:** real. Removing the currently viewed remote workspace can
   be undone by still-mounted workspace code that calls `ensureWorkspaceInSidebar`.
2. **Previous provider-only fix correctness:** not correct as written. The
   provider value was still unstable because `getCollections(activeOrganizationId)`
   returns a new wrapper object on every call.
3. **Regression risk:** the implemented targeted fixes are low risk. The collection
   split is higher risk and currently unsupported by the behavior I verified.

## Part 1 - bug: "Remove from Sidebar" does nothing for remote workspaces

### Repro

1. Have at least two v2 workspaces in the sidebar where one is a remote
   workspace whose `host.machineId` is not the current device.
2. Be on `/v2-workspace/<remote_id>`.
3. Right-click the row and choose **Remove from Sidebar**.

Expected: the row disappears and the app navigates to the next sidebar
workspace.

Observed: the row stays visible, or briefly disappears and then reappears.

The bug often looks remote-only because remote workspace route transitions keep
the source workspace subtree alive long enough for a re-add path to win.

### Remove call chain

1. `DashboardSidebarWorkspaceContextMenu.tsx:144` calls
   `onSelect={onRemoveFromSidebar}`.
2. `DashboardSidebarWorkspaceItem.tsx:130/196` wires that prop to
   `handleRemoveFromSidebar`.
3. `useDashboardSidebarWorkspaceItemActions.ts:73`:
   ```ts
   const handleRemoveFromSidebar = () => {
     navigateAway(workspaceId);
     removeWorkspaceFromSidebar(workspaceId);
   };
   ```
4. `useNavigateAwayFromWorkspace.ts:17` only navigates if the removed workspace
   is the current route.
5. `useDashboardSidebarState.ts:430` deletes the local sidebar row:
   ```ts
   const workspace = collections.v2WorkspaceLocalState.get(workspaceId);
   if (!workspace) return;
   cleanupWorkspacePaneRuntimes([workspace]);
   collections.v2WorkspaceLocalState.delete(workspaceId);
   ```

### Re-add paths

There are two relevant paths that can reinsert a just-deleted sidebar row while
the old workspace page is still mounted.

#### 1. Unstable provider value re-runs the mount ensure effect

`useV2WorkspacePaneLayout.ts:55` has this effect:

```ts
useEffect(() => {
  ensureWorkspaceInSidebar(workspaceId, projectId);
}, [ensureWorkspaceInSidebar, projectId, workspaceId]);
```

`ensureWorkspaceInSidebar` comes from `useDashboardSidebarState`, whose callbacks
depend on `[collections]`. If `useCollections()` returns a new object reference
on each provider render, this callback changes identity and the effect runs
again. The effect calls `ensureSidebarWorkspaceRecord`, which inserts the row
if missing.

This makes the old sequence:

1. `removeWorkspaceFromSidebar` deletes the local-state row.
2. A provider render changes the `collections` object reference.
3. `ensureWorkspaceInSidebar` identity changes.
4. The still-mounted workspace pane-layout effect re-runs and re-inserts the row.

#### 2. Pane-layout persistence re-adds before checking row existence

`useV2WorkspacePaneLayout.ts:69` subscribes to the pane store. Inside the
subscription, it currently calls `ensureWorkspaceInSidebar(workspaceId,
projectId)` before checking whether a local row exists:

```ts
ensureWorkspaceInSidebar(workspaceId, projectId);
if (!collections.v2WorkspaceLocalState.get(workspaceId)) {
  return;
}
```

If the removed workspace remains mounted and the pane store emits, this call can
recreate the row even if the provider value has been stabilized. This is a
separate re-add path and should be fixed directly.

### Why the previous provider-only fix was incomplete

The previous diff memoized `contextValue` like this:

```ts
const collections = activeOrganizationId
  ? getCollections(activeOrganizationId)
  : null;

const contextValue = useMemo<CollectionsContextType | null>(
  () => (collections ? { ...collections, switchOrganization } : null),
  [collections, switchOrganization],
);
```

That does not stabilize the provider. `getCollections()` returns:

```ts
return {
  ...orgCollections,
  organizations: organizationsCollection,
};
```

So `collections` is a fresh wrapper object on every render, and the
`useMemo([collections, switchOrganization])` recomputes every render.

### Implemented targeted fixes

#### Fix A - stabilize the provider value for real

The implementation memoizes the `getCollections` call in `CollectionsProvider`:

```tsx
const collections = useMemo(
  () => (activeOrganizationId ? getCollections(activeOrganizationId) : null),
  [activeOrganizationId],
);

const contextValue = useMemo<CollectionsContextType | null>(
  () => (collections ? { ...collections, switchOrganization } : null),
  [collections, switchOrganization],
);
```

This keeps collection caching behavior scoped to the provider while making the
context value stable across unrelated parent renders.

#### Fix B - do not auto-ensure from pane-layout persistence

In `useV2WorkspacePaneLayout.ts`, the store subscription should not create a
sidebar row. It should persist pane layout only if the row still exists:

```ts
const existing = collections.v2WorkspaceLocalState.get(workspaceId);
if (!existing) {
  return;
}

collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
  draft.paneLayout = {
    version: nextStore.version,
    tabs: nextStore.tabs,
    activeTabId: nextStore.activeTabId,
  };
});
```

Initial insertion remains covered by the mount ensure effect in
`useV2WorkspacePaneLayout.ts:55` and by `v2-workspace/layout.tsx:61`, so this
does not prevent workspaces opened from outside the sidebar from being added.

### Regression considerations for Part 1

- Memoizing `collections` by `activeOrganizationId` should be safe because
  `getCollections(orgId)` is already org-scoped and cached internally.
- `switchOrganization` can still change when the active org changes or the
  session refetch callback changes.
- Removing the store-subscription ensure preserves the current behavior that
  opening a workspace ensures it in the sidebar, while preventing a removed
  still-mounted workspace from resurrecting itself.
- After implementing the fixes, manually verify local and remote current-route
  removal and non-current-route removal.

### Verification run after code fixes

- `bun run --cwd apps/desktop typecheck`
- `bunx @biomejs/biome@2.4.2 check <changed files>`

Manual verification completed:

- Manual: remove the currently viewed remote workspace; it should navigate away
  and stay removed.
- Manual: remove the currently viewed local workspace; it should navigate away
  and stay removed.
- Manual: open a v2 workspace from the all-workspaces list; it should still be
  inserted into the sidebar.

## Part 2 - sidebar re-render hardening

The previous proposal said the sidebar live query re-emits when any field on
`v2WorkspaceLocalState` changes. I do not think that is true for the current
TanStack DB behavior.

I verified this with a direct `@tanstack/db` live-query script matching the
sidebar query shape. A query that selected only:

- `workspaceId`
- `sidebarState.projectId`
- `sidebarState.tabOrder`
- `sidebarState.sectionId`

did **not** emit when these fields changed:

- `paneLayout`
- `viewedFiles`
- `sidebarState.changesFilter`
- `sidebarState.changesSubtab`

It did emit when `sidebarState.tabOrder` changed, and the full sidebar query
emits when joined host fields like `v2Hosts.isOnline` change. That is expected
because the sidebar query selects host online state.

### Valid re-render sources

These still look valid:

1. **Host online-status updates.** `useDashboardSidebarData.ts:103` left-joins
   `v2Hosts` and selects `hostIsOnline`. Any host ping that changes `isOnline`
   should update the sidebar.
2. **PR refetch every 10s.** `useDashboardSidebarData.ts:148` refetches local
   workspace PR data. `localPullRequestsByWorkspaceId` is rebuilt as a new
   `Map` at line 177 whenever `pullRequestData?.workspaces` gets a new array.
3. **No memo barriers downstream.** `DashboardSidebarProjectSection` and
   `DashboardSidebarWorkspaceItem` are not memoized, so a real `groups` change
   can still fan out through the tree.
4. **Shortcut-label map identity.** `useDashboardSidebarShortcuts.ts:21`
   returns a new `Map` when `flattenedWorkspaces` changes. If `groups` changes
   for PR or host reasons, this can defeat memo boundaries.

### Implemented low-risk hardening

The implementation keeps the existing collection model and only stabilizes
derived data identities:

1. `useDashboardSidebarData.ts` now keeps the local workspace id array stable
   when the ids are unchanged, so PR refetch dependencies do not churn on equal
   sidebar data.
2. `useDashboardSidebarData.ts` now reuses the local pull-request `Map` when
   the refetched PR payload is structurally unchanged.
3. `useDashboardSidebarData.ts` now preserves unchanged project object
   references after a real sidebar update, so updates in one project do not
   force every project subtree to receive new props.
4. `useDashboardSidebarShortcuts.ts` now reuses the shortcut-label `Map` when
   the first nine workspace ids are unchanged.
5. `DashboardSidebar.tsx` now memoizes `SortableProjectWrapper`, allowing
   unchanged project rows to skip render work while still responding to dnd-kit
   context changes.

### Verification run after re-render hardening

- `bun run --cwd apps/desktop typecheck`
- `bunx @biomejs/biome@2.4.2 check <changed files>`

Still recommended manually:

- Smoke test sidebar drag/reorder for projects, sections, and workspaces.
- Smoke test workspace shortcut labels and `Cmd+1` through `Cmd+9`.
- Use React DevTools Profiler while PR polling is active; unchanged project
  rows should no longer receive new project props when the PR payload is equal.

### Collection split recommendation

Do **not** do the `v2WorkspaceLocalState` split as the fix for the stated
sidebar re-render issue based on the current evidence.

The split may still be worth considering later for domain clarity, but it would
carry migration and callsite risk. It should require fresh profiling that proves
unrelated local-state writes currently invalidate the sidebar in production, not
just an assumption about row-level invalidation.

### If a split is revisited, missed callsites

The previous callsite list was incomplete. At minimum, also account for:

- `useAccessibleV2Workspaces.ts:98` - left-joins local sidebar state to compute
  `isInSidebar`.
- `ResourceConsumption.tsx:81` - reads sidebar workspace order.
- `getFlattenedV2WorkspaceIds.ts:7` - computes next workspace for navigation
  after removal.
- `useDevSeedV2Sidebar.ts:26` - checks whether any sidebar workspace state
  exists before dev seeding.
- `writeSidebarState.ts:130` and related tests - V1 migration writes combined
  local state rows.
- `useDashboardSidebarState.ts` - most ordering, grouping, removal, and
  cleanup logic reads or mutates the current combined collection.
- `GlobalTerminalLifecycle` and `GlobalBrowserLifecycle` - read all local rows
  to detect pane removals.
- `V2NotificationController.tsx:52` - reads `paneLayout` for notification
  targeting.
- `WorkspaceSidebar.tsx:74`, `useChangesTab.tsx:29`, and
  `useSidebarDiffRef.ts:10` - read `changesSubtab` / `changesFilter`.
- `useViewedFiles.ts` and `useRecentlyViewedFiles.ts` - read and write local
  workspace-page state.

### Lower-risk hardening work

Do these before any collection split:

1. Stabilize `localPullRequestsByWorkspaceId` by content equality or use a
   TanStack Query `select`/structural sharing strategy so equivalent refetches
   preserve identity.
2. Stabilize `workspaceShortcutLabels` by returning the previous `Map` when the
   workspace id/order labels are unchanged.
3. Add `React.memo` only after props are stable enough for it to be useful.
4. Profile with React DevTools before and after each change. Treat host online
   status updates as legitimate sidebar updates unless the UI no longer needs
   live online indicators.

## Feedback summary

The remote remove bug should be fixed with a small targeted patch, not the
collection split:

1. Memoize `getCollections(activeOrganizationId)` by `activeOrganizationId`, or
   return a fully cached object from `getCollections()`.
2. Remove `ensureWorkspaceInSidebar` from the pane-layout store subscription and
   persist only when the local row still exists.
3. Keep the broad split out of this fix unless profiling demonstrates that
   selected-field live queries actually emit on unrelated local-state writes in
   the real app.

## Files currently involved

- `apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/CollectionsProvider.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useV2WorkspacePaneLayout/useV2WorkspacePaneLayout.ts`
- `apps/desktop/src/renderer/routes/_authenticated/hooks/useDashboardSidebarState/useDashboardSidebarState.ts`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useDashboardSidebarData/useDashboardSidebarData.ts`
