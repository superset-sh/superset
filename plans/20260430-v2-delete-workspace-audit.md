# V2 Delete-Workspace Pattern Audit & Decisions

Date: 2026-04-30
Branch: `map-delete-pattern-v2`
Scope: align v2 delete dialog with the host-service destroy saga; surface bugs/inconsistencies in the current pattern, then lock in the implementation decisions.

## Today's pattern (origin/main)

- **Preflight** — v2 dialog calls `electronTrpc.workspaces.canDelete` (v1 main-process IPC). Returns `hasChanges`, `hasUnpushedCommits`, `activeTerminalCount`, plus `canDelete/reason` for not-found / already-deleting / unreadable-status.
- **Destroy** — v2 calls host-service `workspaceCleanup.destroy` (3-phase: preflight → teardown → cloud-delete commit point → best-effort local cleanup). Has its own dirty-worktree check at phase 0 and its own main-workspace block (local equality + cloud `getFromHost.type === "main"`).
- **Race handling** — dialog auto-retries with `force: true` on a `conflict` returned by destroy, on the rationale that the user already confirmed once.

## Issues found

1. **`hasUnpushedCommits` regression on no-upstream branches.** `status.ahead > 0` returns `0` when there is no upstream. Branches that have never been pushed show no warning, and `deleteBranch=true` then silently drops commits.
2. **Path equality for "main workspace" is unnormalized.** `local.worktreePath === project.repoPath` is raw string equality — no `realpath`, no trailing-slash normalization, no macOS case folding. If columns ever differ in form, the main-workspace block fails open and the saga removes the main worktree.
3. **Inspect ↔ destroy disagree on "is main".** Destroy has *two* checks (local equality + cloud `getFromHost.type === "main"`). A status preview that only does the local check passes workspaces destroy then rejects with `BAD_REQUEST` — surfacing as a generic toast instead of an in-dialog blocking banner.
4. **Concurrent-delete protection is gone in v2.** v1 had a `deletingAt` column. v2 host-service saga has no equivalent; renderer-side `useDeletingWorkspaces` is in-memory only. Two clicks racing the same workspace will both pass preflight and both run the saga.
5. **Loading and `local-starting` host states leak into destructive UI.** Any preview that throws when host isn't ready will render normal pending states as a destructive blocking banner.
6. **`ctx.git()` failures during preview are silently treated as "clean".** Diverges from v1 contract (which returned `canDelete: false` with the error message).
7. **Auto-force-retry on `conflict` was deliberate UX.** Removing it costs one extra click on the known race (preflight clean → destroy dirty).
8. **`activeTerminalCount` is no longer surfaced.** v1 told the user how many PTYs would be killed before they clicked Delete.

## Decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Preflight location | Host-service `inspect` query, called from the v2 dialog |
| 2 | "Is main workspace" check | Shared `isMainWorkspace()` helper, `realpath`-normalized paths, both local equality and cloud `getFromHost.type === "main"` |
| 3 | Unpushed commits | No upstream = treat as has-unpushed (`git rev-list HEAD --not --remotes` — upstream-agnostic, catches commits not reachable from any remote ref) |
| 4 | Concurrent-delete guard | Process-local `Set<workspaceId>` on the host-service; second caller throws `CONFLICT` with `DELETE_IN_PROGRESS` cause (distinct from dirty-worktree CONFLICT so the renderer doesn't silent-retry) |
| 5 | Pending-host UX | `loading` and `local-starting` map to `isCheckingStatus` — disabled Delete button + spinner, no banner |
| 6 | `CONFLICT` after clean preflight | Silent force-retry, with a code comment explaining the race so it's not removed again |
| 7 | Git status failure during inspect | `canDelete: true`, no warnings — matches v2 saga's "best-effort cleanup" contract |
| 8 | Active terminal count in dialog | Skip; rely on saga's post-hoc warning toast |

## Implementation sequence

Order chosen so each step is shippable on its own:

1. **Add `isMainWorkspace()` helper** in host-service (or shared lib if both packages need it). Includes `realpath` normalization. Replace the inline check inside `destroy`. No behavior change yet.
2. **Add `workspaceCleanup.inspect`** on host-service. Uses `isMainWorkspace`, the upstream-aware unpushed check, and the git-failure-is-fine contract. Returns `{ canDelete, reason, hasChanges, hasUnpushedCommits }`.
3. **Add concurrent-delete guard** to `workspaceCleanup.destroy` — `Set<workspaceId>` at saga entry. Second caller throws `CONFLICT` with a `DELETE_IN_PROGRESS` cause; distinct from dirty-worktree CONFLICT so the renderer surfaces a toast instead of silently force-retrying.
4. **Promote `useWorkspaceHostUrl` → `useWorkspaceHostTarget`** with the status union (`loading | not-found | local-starting | ready`). Keep `useWorkspaceHostUrl` as a back-compat thin wrapper.
5. **Migrate `useDestroyDialogState`** off `electronTrpc.workspaces.canDelete` and onto the new `inspect`. Treat `loading`/`local-starting` as `isCheckingStatus`. Keep the silent force-retry on `CONFLICT` (with the comment).
6. **Wire `blockingReason` + `confirmLabel` through the dialog UI** (`DashboardSidebarDeleteDialog` → `DestroyConfirmPane`).

Each step should be its own commit; steps 1–3 are server-side and ship before steps 4–6.

## Out of scope

- v1 `canDelete` / `delete` procedures and their git utilities can be deleted once the v2 path is the only caller (per v1 sunset). Track separately.
