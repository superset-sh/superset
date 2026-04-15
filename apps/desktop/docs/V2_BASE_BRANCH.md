# V2 base branch storage

V2 workspaces track the "compare base branch" (the branch the changes panel diffs against) independently from V1. If you're touching base-branch behavior, read this before assuming V1's storage applies.

## Source of truth

- **V1**: DB-backed via `worktrees.baseBranch` + git config (`getBranchBaseConfig`). See `src/lib/trpc/routers/changes/branches.ts` (`getBranches` / `updateBaseBranch`) and `src/lib/trpc/routers/workspaces/utils/workspace-init.ts`.
- **V2**: Renderer-only, persisted on the `v2WorkspaceLocalState` collection at `sidebarState.baseBranch` (schema: `renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema.ts`).

V2 does not read or write `worktrees.baseBranch`. Don't bridge them — the collection is the single source of truth for V2's sidebar.

## Seeding at creation

`ensureSidebarWorkspaceRecord` (`renderer/routes/_authenticated/hooks/useDashboardSidebarState/useDashboardSidebarState.ts`) inserts a fresh `v2WorkspaceLocalState` row the first time a workspace is opened. It accepts an optional `baseBranch` so callers that know the creation-time base (the pending page, from `pendingWorkspaces.baseBranch`) can seed it. Callers without that context pass nothing and get `null`, which falls back to the repo's default branch at read time.

When adding a new creation path, pass the chosen base branch into `ensureWorkspaceInSidebar(workspaceId, projectId, baseBranch)` so the sidebar reflects the user's selection immediately instead of jumping to the default.

## Reading for display

`useChangesTab` reads `sidebarState.baseBranch` and threads it to `ChangesHeader` → `BaseBranchSelector`. The selector displays `baseBranch ?? defaultBranchName` so a `null` value (never picked / legacy workspace) transparently falls back to the repo default without overwriting the stored value. The same `baseBranch` is passed as `baseBranch ?? undefined` to `git.listCommits`, letting the server fall back to its default when unset.

## Why this split exists

V2's sidebar state is a CRDT-ish local collection that survives offline edits and syncs via the same mechanism as other sidebar state (tab order, sections). Reusing `worktrees.baseBranch` would force V2 to round-trip through tRPC for something that is purely a UI preference, and would couple V2's sidebar to V1's branch-switching side effects (which clear `worktrees.baseBranch`). Keeping them separate keeps V2 responsive and lets its selection persist across branch switches inside the workspace.
