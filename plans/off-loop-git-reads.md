# Off-loop git reads

Both single-threaded event loops (host-service per org, Electron main) serve
all tRPC traffic; any in-process git spawn or sync fs walk head-of-line
blocks every response. Worker pools exist on both sides — coverage, not
infrastructure, is the gap.

Enforced by ratchet tests (fail on new call sites, fail on stale allowlist
entries):
- `packages/host-service/src/no-main-loop-blocking.test.ts`
- `apps/desktop/src/no-main-process-blocking.test.ts`

## Done (this branch)

- Workspace-create base fetch → `gitFetchBaseRefTask` (was inline `git fetch`
  per create, #5913 regression)
- PR-sync per-workspace refs read → `gitWorkspaceRefsTask` (was 5–8 spawns ×
  N workspaces per watcher event / 5-min sweep)
- `ctx.git()` env resolution: remote-URL lookup TTL-cached (was 1 spawn per
  call, ~30 sites)
- `base-ref-freshness`: common-dir rev-parse TTL-cached (was 1 spawn per
  status poll, #5776)
- `resolve-repo.ts` / `project/handlers.ts`: recursive `rmSync` → async `rm`
- Desktop: `changes.getBranches`, `workspaces.getAheadBehind`,
  `changes.get*FileContents` → changes git worker

## Backlog — host-service

Priority order; port to `workers/tasks/git.ts`. Items constructing git
clients directly have an allowlist line in `no-main-loop-blocking.test.ts`
to delete when ported; items 1–3 and 6 spawn via `ctx.git()` (the shared
factory) so the ratchet doesn't see them — they're backlog-only.

1. `trpc/router/git/git.ts` — `listCommits` (`git log`, unbounded),
   `getDiff` (2× `git show`, buffers file contents), `getBranchSyncStatus`
   (7 spawns incl. full `status()`), `renameBranch` (`ls-remote`, network)
2. `trpc/router/workspace-creation/procedures/search-branches.ts` — network
   `fetch --prune` + 500-entry reflog walk on a typeahead query
3. `trpc/router/workspace-cleanup/workspace-cleanup.ts` — `status()`
   preflights + `worktree remove --force` (blocking recursive delete)
4. `trpc/router/project/utils/resolve-repo.ts` — `git clone` inline
   (unbounded network); worker task or spawn with streaming
5. `trpc/router/project/project.ts` — `ctx.git()` inside `project.remove`
   loop; hoist + worker-route `worktree remove`
6. `trpc/router/workspace/workspace.ts` — full `git.status()` on the legacy
   surface; also per-row `existsSync` in `workspace.list`
7. `trpc/router/settings/branch-prefix.ts`,
   `workspace-creation/shared/project-helpers.ts`,
   `trpc/router/git/utils/git-helpers.ts` — cheap but on-loop; port last

## Backlog — desktop

Same convention: entries with a `no-main-process-blocking.test.ts`
allowlist line lose it when ported; the rest are backlog-only.

1. `workspaces.getGitHubStatus` path (`workspaces/utils/github/*`) — `gh` +
   `ls-remote` polled 10–30s per workspace (biggest remaining win)
2. `changes/staging.ts` — the two `git.status()` reads inside discard-all
   (worker already computes the same status)
3. `projects.ts` — `getBranchesLocal` / `getBranches` (network fetch) /
   `searchBranches`; `cloneRepo` inline clone
4. `changes/git-operations.ts` + `security/git-commands.ts` — mutations;
   need write-serialization guarantees before moving
5. `workspaces/utils/git.ts` — grab-bag; port per-function as consumers move
6. `main/lib/agent-setup/utils.ts` — dead `execFileSync` code; delete
7. `git-status.ts:335` — `existsSync` per worktree row → `pathExistsCached`
