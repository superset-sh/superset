# Workspace v1 vs v2 — Delete Patterns Audit

> **Status: pre-unification snapshot.** Describes the state of the three
> disjoint delete implementations before the `workspaceCleanup.destroy`
> redesign landed. Kept for historical context. For the current design
> see [`workspace-delete-unification.md`](./workspace-delete-unification.md).

Audit of user-triggered delete/remove actions across workspace v1 (`apps/desktop/src/renderer/routes/_authenticated/_dashboard/workspace/`) and v2 (`.../v2-workspace/`) in the desktop app.

## Architecture

- **v1 workspace route** has no entity deletes in its own tree — only tab *close* (`workspace/$workspaceId/page.tsx:223-227`). All v1 deletes live in the shared dashboard sidebar (`DashboardSidebar*`).
- **v2 workspace route** owns its deletes internally (session selector, file tree) because v2 ships its own sidebar and pane registry.
- **Workspace-level delete** (Hide + Delete with git-safety) is shared chrome: `apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/WorkspaceListItem/components/DeleteWorkspaceDialog/DeleteWorkspaceDialog.tsx`, backed by `apps/desktop/src/lib/trpc/routers/workspaces/procedures/delete.ts` (`canDelete`, `delete`, `close`, `canDeleteWorktree`, `deleteWorktree`).

## Entity comparison

| Entity | v1 | v2 | Gap |
|---|---|---|---|
| Workspace | Shared `DeleteWorkspaceDialog.tsx:34-328` — Hide (secondary) + Delete (destructive), Enter-key, uncommitted-changes warning (lines 258-268), optional `deleteLocalBranch` checkbox (lines 270-288) | Same shared dialog. But v2 list row `V2WorkspaceRow.tsx:125-147` exposes only Add/Remove-from-sidebar — no delete entry point from the list view | **v2 list has no direct delete affordance**; only reachable via shared sidebar context |
| Chat session | `DashboardSidebarDeleteDialog.tsx` — AlertDialog confirm | `SessionSelectorItem.tsx:37-56` — AlertDialog confirm + toast | Parity |
| File | Not applicable in v1 sidebar | `FileContextMenu.tsx:56` destructive item → parent `FilesTab.tsx:461-493` `handleDelete` → `alert()` confirm + `toast.promise` + `workspaceTrpc.filesystem.deletePath.useMutation()` | v2-only (v1 sidebar has no file tree) |
| Folder | Not applicable in v1 sidebar | `FolderContextMenu.tsx:65` destructive item → same `FilesTab.handleDelete` path | v2-only |
| Chat message | Absent | Absent (`ChatPaneInterface.tsx` has edit/restart, no delete) | Missing in both |
| Diff entry | Absent | `DiffFileEntry.tsx:19,70-75` shows deleted-state UI but offers no delete trigger | **Dead surface in v2** |
| Tab / Pane | Close only (`workspace/$workspaceId/page.tsx:223-227`) | Close only | By design |
| Project (sidebar) | `DashboardSidebarProjectContextMenu.tsx` | Shared sidebar (same) | Shared |
| Section (sidebar) | `DashboardSidebarSectionContextMenu.tsx` | Shared sidebar (same) | Shared |
| Task | `TaskContextMenu.tsx`, `TaskDetailHeader.tsx`, `TaskActionMenu.tsx` | Shared (tasks route is shared) | Shared |
| Checkpoint / snapshot / agent / plan | None found | None found | Not implemented either side |

## Net gaps

1. **v2 workspace list row has no delete entry point.** `V2WorkspaceRow.tsx:125-147` only toggles sidebar membership. v1 users reach delete via the sidebar context menu; v2 list users have no parallel path.
2. **No message deletion anywhere.** Parity gap on both sides, but notable given v2's otherwise richer chat CRUD (edit, restart).
3. **`DiffFileEntry` deleted-state without action.** v2-only dead UI surface — displays "deleted" state but offers no user-initiated delete.
4. **Inconsistent confirm UX copy.** File/folder uses `alert()` with "This action cannot be undone." + action-first order (Delete, Cancel). Session uses `alert()` with "Are you sure..." + Cancel-first order. Both confirm, but inconsistently.

## Confirmed parity (not gaps)

- Shared `DeleteWorkspaceDialog` two-path pattern (Hide = non-destructive close, Delete = destructive with git-safety).
- Chat session delete: both confirm.
- Sidebar project/section/task deletes: same code paths (shared dashboard sidebar).
- Tab close vs entity delete: intentional semantic difference.

## Workspace delete call chain — cloud vs host vs local

There are **three parallel delete backends** in this repo, and they do not share a code path:

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ PATH A — LOCAL WORKTREE (v1 chrome; also reachable from v2 via hotkey)  │
│                                                                          │
│  DeleteWorkspaceDialog.tsx                                              │
│    │                                                                    │
│    ├─ handleDelete → deleteWithToast({deleteFn, forceDeleteFn})         │
│    │     → useDeleteWorkspace() (optimistic cache update, rollback)     │
│    │     → electronTrpc.workspaces.delete.useMutation                   │
│    │          (IPC: renderer → electron main)                           │
│    │                                                                    │
│    └─ handleClose  → useCloseWorkspace()                                │
│            → electronTrpc.workspaces.close.useMutation                  │
│                                                                          │
│  apps/desktop/src/lib/trpc/routers/workspaces/procedures/delete.ts      │
│    canDelete     :42-162   git status, terminal count, untracked guard  │
│    delete        :164-348  markDeleting → cancel init → kill terminals  │
│                              → runTeardown → safety check vs git        │
│                              → removeWorktreeFromDisk                   │
│                              → deleteLocalBranch (optional)             │
│                              → localDb delete workspace + worktree row  │
│                              → analytics `workspace_deleted`            │
│    close         :350-375  kill terminals, delete local row only       │
│    deleteWorktree:462-568  same as delete but by worktreeId            │
│                                                                          │
│  Touches: local SQLite (packages/local-db), disk (git worktree),        │
│           child processes (teardown shell), terminal PTYs.              │
│  Does NOT touch: cloud Postgres, host-service, v2Workspaces table.      │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ PATH B — CLOUD v2 WORKSPACE (v2 sidebar context menu)                   │
│                                                                          │
│  DashboardSidebarWorkspaceItem context menu                             │
│    → useDashboardSidebarWorkspaceItemActions.ts:72-102 handleDelete     │
│        → apiTrpcClient.v2Workspace.delete.mutate({id})   (HTTP → web)   │
│        → removeWorkspaceFromSidebar(workspaceId)  (local Electric sync) │
│        → navigate away if active                                        │
│                                                                          │
│  packages/trpc/src/router/v2-workspace/v2-workspace.ts:190-200          │
│    delete: requireActiveOrgMembership                                   │
│            → getScopedWorkspace(orgId, id)                              │
│            → dbWs.delete(v2Workspaces) where id = ...                   │
│            → { success: true }                                          │
│                                                                          │
│  Touches: cloud Postgres (v2Workspaces row) only.                       │
│  Does NOT touch: git worktree, local terminals, teardown, local-db.     │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ PATH C — HOST-SERVICE (daemon; unused by the desktop UI today)          │
│                                                                          │
│  packages/host-service/src/trpc/router/workspace/workspace.ts:164-202   │
│    delete: requires ctx.api (cloud) configured                          │
│      → ctx.api.v2Workspace.delete.mutate({id})   ← calls Path B         │
│      → git worktree remove localWorkspace.worktreePath                  │
│      → ctx.db.delete(workspaces)  (host-service local sqlite)           │
│                                                                          │
│  Zero call sites from apps/desktop/src/renderer for workspace delete.   │
│  (Desktop uses host-service for git-status/diff/events/terminals, but   │
│   not for workspace lifecycle.)                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### What a v2 user actually triggers today

| Entry point | Path taken | Cloud row deleted? | Worktree removed? | Teardown? | Terminals killed? | `canDelete` checks? |
|---|---|---|---|---|---|---|
| v2 sidebar context menu `Delete` | **B** only | ✅ | ❌ | ❌ | ❌ | ❌ |
| `CLOSE_WORKSPACE` hotkey (`layout.tsx:77-89`) | **A** only | ❌ | ✅ | ✅ | ✅ | ✅ |
| `EmptyTabView` dialog | **A** only | ❌ | ✅ | ✅ | ✅ | ✅ |
| v2-workspaces list row | — (no delete affordance) | — | — | — | — | — |

### Gaps in the delete path

1. **Path A and Path B never meet.** Deleting via the v2 sidebar removes the cloud `v2Workspaces` row but leaves the worktree on disk, terminals alive, and teardown unrun. Deleting via the dialog (hotkey or `EmptyTabView`) cleans the worktree but leaves the cloud row orphaned. Users will see ghosts on one side or the other depending on entry point.
2. **No `canDelete` on Path B.** Cloud delete has no git-safety guard, no uncommitted-changes warning, no terminal-count check. Users can nuke a cloud workspace while its worktree has unpushed work.
3. **No optimistic UX on Path B.** Path A has full optimistic rollback (`useDeleteWorkspace.onMutate/onError`); Path B is just `toast.promise` with no cache snapshot — UI reconciles via Electric sync after the fact.
4. **Host-service `workspace.delete` (Path C) is the only unified implementation and is unreachable from the UI.** It already composes cloud + worktree + local cleanup in the right order. Desktop never calls it; it only calls host-service for git-status/diff/terminals (`hooks/host-service/*`).
5. **v2-workspaces list page has no delete at all.** `V2WorkspaceRow.tsx:125-147` only toggles sidebar membership. Users browsing the list must pin to sidebar first, then delete — UX dead end.
6. **Analytics divergence.** Path A emits `workspace_deleted`; Path B emits nothing; Path C would emit via whichever layer fires first. Product metrics will undercount v2 deletes.
7. **Teardown never runs for cloud-originated deletes.** Any `SUPERSET_WORKSPACE_NAME`-dependent cleanup scripts silently skip when users delete via the v2 sidebar.

## Backend safety (shared, for reference)

`delete.ts:42-162` — `canDelete` returns `{ canDelete, reason?, activeTerminalCount, hasChanges, hasUnpushedCommits }`. Branch workspaces always deletable (lines 78-88). Worktrees check `hasUncommittedChanges()` and `hasUnpushedCommits()` (lines 127-130). `delete.ts:164-348` — untracked-worktree guard (lines 268-308) prevents removing worktrees not tracked in DB; parallel terminal-kill + teardown (line 239-242); two-step retry with `force` (lines 244-262); analytics `workspace_deleted` (line 343) vs `workspace_closed` (line 372).
