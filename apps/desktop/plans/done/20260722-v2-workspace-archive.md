# Instant Archive + Undo Toast + "Archived workspaces" Settings (v2)

## Context

PostHog data (last two weeks) shows v2 users rage-click ~50% more per active user than v1, and the single worst named hotspot is the **"Also delete local branch"** checkbox in the workspace delete dialog (108 rage clicks / 85 users on v2). The fix: remove the blocking decision entirely. Deleting a v2 workspace becomes an **instant archive** (hide from sidebar, kill terminals, worktree/branch untouched on disk) with an **Undo toast** linking to a new **Settings → Archived workspaces** page where users can Unarchive, permanently Delete (existing destroy saga incl. teardown/force paths), or Delete all.

**Scope: v2 only** (user-confirmed). v1's dialog stays. **Kill PTYs at archive time** (user-confirmed).

Key findings driving the design:
- Host-service SQLite migrations are drizzle files committed under `packages/host-service/drizzle/`, auto-applied at boot (`migrate()` in `src/db/db.ts`). Generate with `bun run generate` in `packages/host-service`. (The "never run migrations" repo rule is about cloud Postgres `packages/db` — not needed here.)
- **No cloud Postgres change needed.** `mergeHostWorkspaces` (`useHostWorkspaces.utils.ts:195-235`) uses cloud rows only for hosts with zero host-served data; the archiving machine always has live data or an IndexedDB snapshot carrying `archivedAt`. Only leak: another machine that never fetched that host's list while the host is offline shows the row via cloud fallback — already rendered unreachable/not-openable. Document in a code comment.

## Phase 1 — Host-service: schema + archive/unarchive

1. **`packages/host-service/src/db/schema.ts`** (~line 208, `workspaces` table): add
   `archivedAt: integer("archived_at")` — null = active; set = hidden until permanent delete; host-local only. Then `cd packages/host-service && bun run generate` → commit `drizzle/0012_*.sql` + `meta/`.
2. **`src/events/types.ts`**: add `archivedAt: number | null` to `WorkspaceSnapshot` (line 61-73). `workspace-client` derives its type from this — no edit needed there.
3. **`src/workspaces/local-workspace-store.ts`**: thread `archivedAt` through `toWorkspaceSnapshot` (line 36), `toCloudShape` (line 51, as `Date | null`), and `UpdateLocalWorkspacePatch` (line 121). `updateLocalWorkspace` already bumps `updatedAt` and broadcasts `workspace:changed {eventType:"updated"}` — archive/unarchive ride that.
4. **`src/trpc/router/workspace-cleanup/workspace-cleanup.ts`**: add two mutations (helpers `isMainWorkspace`, `disposeSessionsByWorkspaceId`, `updateLocalWorkspace` already available/importable here):
   - `archive({workspaceId})`: reject main (BAD_REQUEST) / missing (NOT_FOUND); idempotent if already archived; commit `updateLocalWorkspace(ctx, id, {archivedAt: Date.now()})` FIRST, then best-effort `disposeSessionsByWorkspaceId` (failures → `warnings`, never throw past commit). Returns `{success, archivedAt, warnings}`.
   - `unarchive({workspaceId})`: clear `archivedAt`, return cloud-shaped row.
   - `destroy` unchanged — works on archived rows; its `CONFLICT`/`TEARDOWN_FAILED` typed errors power the settings page. `workspace.list` keeps returning all rows (now with `archivedAt`); renderer splits.
5. **Test**: `workspace-cleanup.archive` test (in-memory sqlite + `migrate()`, pattern: `src/trpc/router/config/config.test.ts`): sets flag + broadcasts; idempotent; main rejected; unarchive clears; destroy of archived row still hard-deletes.

## Phase 2 — Renderer read path: active/archived split

1. **`apps/desktop/src/renderer/hooks/host-workspaces/useHostWorkspaces/useHostWorkspaces.utils.ts`**: add `archivedAt: Date | null` to `HostWorkspaceRow` + `HostWorkspaceItem`; map it in `applyWorkspaceChangedEvent` (~line 165) — this makes archive/unarchive live-update; cloud-fallback items get `archivedAt: null`.
2. **`useHostWorkspaces.ts`**: in `useHostWorkspacesSource` (returns at line 269), split the merged list: `workspaces` = non-archived (all existing consumers — sidebar, palette, notifications, ports — hide archived rows with zero edits), new `archivedWorkspaces` field on `UseHostWorkspacesResult` (line 40). Cache ops untouched.
3. **`hooks/host-service/useWorkspaceHostUrl/useWorkspaceHostUrl.ts`** (line 27-29): `useWorkspaceHostTarget` must also search `archivedWorkspaces` so settings-page unarchive/destroy resolve the owning host.

## Phase 3 — Archive action + undo toast

1. **New `hooks/host-service/useArchiveWorkspace/`**: mirror `useDestroyWorkspace.ts` — resolve host, call `workspaceCleanup.archive`/`unarchive`, normalize errors (`host-unavailable` | `main-workspace` | `unknown`).
2. **New flow hook `lib/workspaces/useArchiveWorkspaceFlow/`** — `archiveWorkspace({workspaceId})`:
   - refuse `type === "main"`; `navigateAwayFromWorkspace(workspaceId)` first (reuse `DashboardSidebar/hooks/useNavigateAwayFromWorkspace` — handles archive-while-open-in-pane);
   - optimistic `hostWorkspacesCache.upsertWorkspace({...row, archivedAt: new Date()})`; on mutation failure `invalidateHost` + `toast.error` ("Host is offline" for host-unavailable);
   - on success: `track("workspace_archived", {workspaceId, hostId, source})`, surface warnings, then sonner undo toast (pattern: `lib/workspaces/showWorkspaceAutoNameWarningToast.ts` + navigate wiring in `useCreateWorkspace.ts:71-74`): `toast("Workspace archived", { action: {label: "Undo", onClick: undo}, description: <link → navigate({to: "/settings/archived-workspaces"})>, duration: 8_000 })`;
   - `undo()` = optimistic clear + `unarchive` + `track("workspace_unarchived")`; rollback + toast.error on failure.
   - Do NOT touch sidebar section membership on archive — leaving it intact is what makes Undo restore the workspace to its prior position.
3. **Replace the five v2 delete entry points** with the flow (context-menu/action labels → "Archive"; keep hotkey bindings):
   - `DashboardSidebarWorkspaceItem.tsx` + its actions hook (drop dialog mounts at lines 183-190, 268-276)
   - `_dashboard/layout.tsx` CLOSE_WORKSPACE v2 branch (lines 131-142) + remove v2 dialog mount (219-234); v1 branch untouched
   - `commandPalette/modules/workspace/commands.tsx` (~line 71): title → `Archive …`, keep "delete/remove/close" keywords; `commandPalette/ui/DeleteWorkspaceMount/` invokes the flow via effect instead of rendering the dialog
   - `v2-workspaces/.../V2WorkspaceRow.tsx` (~line 374)
   - `v2-workspace/$workspaceId/.../WorkspaceMissingWorktreeState.tsx` (~line 105)
   - Keep `TeardownFailedPane` + `useDestroyWorkspace` (settings reuses them). Delete `DashboardSidebarDeleteDialog.tsx` / `DestroyConfirmPane` / `useDestroyDialogState` in the same PR iff grep shows no remaining imports.

## Phase 4 — Settings "Archived workspaces"

Registration (all four registries; typecheck enforces completeness):
1. `stores/settings-state.ts`: add `"archivedWorkspaces"` to `SettingsSection`.
2. `settings/layout.tsx`: `SECTION_ORDER` + `getSectionFromPath` + `getPathFromSection` → `/settings/archived-workspaces`.
3. `settings/components/SettingsSidebar/GeneralSettings.tsx`: route type + item in "Editor & Workflow" group (archive-box icon).
4. `settings/utils/settings-search/settings-search.ts`: `SETTING_ITEM_ID.ARCHIVED_WORKSPACES_LIST` + `ARCHIVED_WORKSPACES_DELETE_ALL`, both variant `"v2"` in `SETTING_ITEM_VARIANT`, two `SETTINGS_ITEMS` entries (keywords: archive, unarchive, restore, delete, trash).

New route + components (template: `settings/api-keys/` page + `ApiKeysSettings.tsx` for list/alert/toast patterns):
- `settings/archived-workspaces/page.tsx`, `components/ArchivedWorkspacesSettings/`, `components/ArchivedWorkspaceRow/`.
- Data: `useHostWorkspaces().archivedWorkspaces`, sorted `archivedAt` desc. Cache-first: render rows immediately; `isReady` only gates the "No archived workspaces" empty state.
- Row: name/branch/project/host + archived date; **Unarchive** (optimistic + toast); **Delete** behind `alert()` confirm (pattern: `ApiKeysSettings.tsx:82-98`), message reflects the persisted `deleteLocalBranch` preference (`useV2UserPreferences`), runs `useDestroyWorkspace().destroy({deleteBranch, force})` replicating `useDestroyDialogState.run` essentials: silent force-retry on `conflict`; success → `removeWorkspace` from cache + warnings as toasts.
- **Per-row failure surfacing**: `teardown-failed` → render existing `TeardownFailedPane` as per-row dialog with force; residual `conflict`/other → inline selectable error text + "Force delete" button; `in-progress` → toast only.
- **Delete all**: destructive button + `alert()` confirm ("Permanently delete N archived workspaces?"); sequential destroys (avoids DELETE_IN_PROGRESS races), failed rows keep per-row error state, summary toast "Deleted X of N".
- Offline-host rows: dimmed, actions disabled, "Host offline" hint.

## Phase 5 — Analytics

- `renderer/lib/analytics`: `workspace_archived {workspaceId, hostId, source: sidebar|command-palette|hotkey|workspaces-page|missing-worktree}`, `workspace_unarchived {workspaceId, source: undo-toast|settings}`.
- `workspace_deleted` unchanged (fires in cloud router during permanent destroy).

## Edge cases

- Toast dismissed → settings Unarchive is the recovery path.
- Archive while open in pane → navigate away first (same as today's delete).
- Main workspace → server guard + existing UI gates kept.
- Multi-host → all mutations via `useWorkspaceHostTarget`; settings merges across hosts.
- Undo when host went offline mid-toast → rollback + "Host is offline — workspace stays archived".
- Archived workspace visited by direct URL → existing not-found/missing UX.
- Concurrent destroy guard (`destroysInFlight`) untouched; archive idempotent.

## Verification

1. `bun run typecheck` + `bun run lint:fix` at root (registries are type-enforced); `bun run lint` exits 0 before push.
2. `bun test` in `packages/host-service` (new + existing cleanup tests); boot `bun dev` to confirm the 0012 migration applies to an existing host.db.
3. Renderer: extend `useHostWorkspaces.utils` tests for `archivedAt` in `applyWorkspaceChangedEvent` + the split.
4. Manual CDP against THIS worktree's dev app (per apps/desktop AGENTS.md evidence-gate): archive → instant hide + toast + PTYs killed; Undo → restored in place; toast link → settings page; Unarchive/Delete/Delete-all incl. worktree actually removed from disk and branch removed iff preference on; dirty-worktree and failing-teardown per-row force paths; Cmd+W + command palette archive; host-service restart → archived rows persist.
5. PR: plan doc copy in `apps/desktop/plans/`, title `feat(desktop): instant archive with undo for v2 workspaces`.

## Outcomes & Retrospective

Shipped in `feat(desktop): archive v2 workspaces instead of deleting` (this
branch). Deltas from the plan above:

- **Terminal handling pivoted from "kill PTYs at archive time" to a deferred,
  row-preserving suspend.** The immediate kill reused the destroy-grade
  teardown, which deletes `terminal_sessions` rows — reopened panes then
  dead-ended on a fatal "session not found" attach error instead of
  respawning. Shipped design: `archive` only sets `archivedAt`; the terminal
  reaper suspends an archived workspace's live sessions on its next pass
  (PTY killed, row kept `active` and unstamped), which routes a later
  unarchive+attach through the existing lost-PTY adopt→respawn path. The
  undo toast window therefore restores fully warm terminals. Suspend also
  drops the session's terminal-agent binding (its process died with the
  PTY; liveness queries gate on the `active` status suspend preserves).
- **No separate `useArchiveWorkspace` host-service hook.** The flow hook
  (`useArchiveWorkspaceFlow`) resolves the owning host imperatively via
  `cache.resolveHostUrl` so one instance can archive any workspace picked
  at event time (layout hotkey, command palette) — the per-workspace hook
  pattern couldn't serve those callers.
- **Post-review hardening:** `projectName` preserved across
  `workspace:changed` broadcasts; permanent delete releases pane runtimes
  and the persisted pane layout via `removeWorkspaceFromSidebar`; archived
  row actions gate on `hostReachable`, not just an Electric-online URL.
- **Deferred:** CLI awareness of `archivedAt` (`superset workspaces
  list/open` still shows archived workspaces), `destroysInFlight`
  participation for archive/unarchive, relocating `TeardownFailedPane`
  out of the retired dialog's folder, and removing the now-unused
  `DeletingWorkspacesProvider` mark/clear tracking.
