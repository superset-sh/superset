# Off-loop git reads

Both single-threaded event loops (host-service per org, Electron main) serve
all tRPC traffic; any in-process git spawn or sync fs walk head-of-line
blocks every response. Worker pools exist on both sides — coverage, not
infrastructure, is the gap.

Enforced by two layers:

**Ratchet tests** — per-file matching-line counts (an allowlisted file can't
grow new sites), bare-identifier patterns (renamed imports and namespace
access count), comment-stripped. Fail on new sites AND on counts that became
too high after a fix:
- `packages/host-service/src/no-main-loop-blocking.test.ts`
- `apps/desktop/src/no-main-process-blocking.test.ts`
- `packages/chat/src/server/desktop/no-desktop-main-blocking.test.ts` —
  chat's desktop server runs on Electron main; the desktop ratchet can't see
  across the package boundary
- `packages/pty-daemon/src/no-daemon-loop-blocking.test.ts` — the daemon
  loop serves every terminal session in the org

**Biome** (`biome.jsonc`, editor + `bun run lint`) — repo-wide
`noRestrictedImports` ban on `execSync`/`spawnSync`/`execFileSync` from
`child_process`; tests/scripts and the ratchet-frozen legacy files are
override-exempted. Delete an override entry when its file is fixed.

The former blind spot — call sites spawning via `ctx.git()` (the shared
factory) — is now covered by a dedicated `ctx.git` count rule in the
host-service ratchet. It matches direct property access only; destructuring
or aliasing the factory off the context would still slip through (don't).

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
- Workspace delete (`workspace-cleanup.ts`): inspect/preflight `status()` +
  unpushed check, `worktree remove --force --force` (recursive delete of the
  whole worktree), branch delete → `gitWorktreeStateTask` /
  `gitWorktreeRemoveTask` / `gitDeleteBranchTask` via
  `workspace-cleanup/git-ops.ts`
- Desktop: `changes.getBranches`, `workspaces.getAheadBehind`,
  `changes.get*FileContents` → changes git worker

## Backlog — host-service

Priority order; port to `workers/tasks/git.ts`. Every item has a count
entry in `no-main-loop-blocking.test.ts` (under the direct-construction
rule, the `ctx.git` rule, or both) — lower/delete the counts when porting.

1. `trpc/router/git/git.ts` — `listCommits` (`git log`, unbounded),
   `getDiff` (2× `git show`, buffers file contents), `getBranchSyncStatus`
   (7 spawns incl. full `status()`), `renameBranch` (`ls-remote`, network)
2. `trpc/router/workspace-creation/procedures/search-branches.ts` — network
   `fetch --prune` + 500-entry reflog walk on a typeahead query
3. `trpc/router/workspaces/workspaces.ts` — workspace CREATE is still
   mostly on-loop: only the base-ref fetch was ported (#6093); `worktree
   prune`, start-point resolution (`getLocalBranchHead`, rev-parses),
   `worktree add` (spawn + full-checkout stdout drain), and
   `branch.<name>.base` config writes all run via one `ctx.git()` client
4. `trpc/router/project/utils/resolve-repo.ts` — `git clone` inline
   (unbounded network); worker task or spawn with streaming
5. `trpc/router/project/project.ts` — `ctx.git()` inside `project.remove`
   loop; hoist + worker-route `worktree remove` (same class as the
   workspace-delete port above; reuse `gitWorktreeRemoveTask`)
6. `trpc/router/workspace/workspace.ts` — full `git.status()` on the legacy
   surface; also per-row `existsSync` in `workspace.list`
7. Small one-shot `ctx.git()` sites (one spawn each, low churn):
   `workspace-creation/procedures/adopt.ts` + `list-project-worktrees.ts`
   (`worktree list`), `workspace-creation/utils/list-branch-names.ts`,
   `ai-workspace-names.ts` (`branch -m` rename),
   `project/utils/ensure-main-workspace.ts` (current-branch probe)
8. `workspace-creation/shared/project-helpers.ts`,
   `trpc/router/git/utils/git-helpers.ts` — cheap but on-loop; port last
   (`settings/branch-prefix.ts` done — first `offLoop()` port)

New procedures should not join this list: build them as a worker task plus
an `offLoop()` resolver (`src/trpc/off-loop.ts`) — `prepare` runs on-loop
and returns plain data, the task runs in the pool.

Pool-level follow-up: task cancellation. Handlers are non-cancellable today
(caller abort rejects the promise; the handler and any child process run to
completion, bounded by their own timeouts). Proper cancellation needs an
abort message in the worker protocol driving a per-task AbortController —
applies to all tasks, raised on PR #6107 review.

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
8. `packages/chat/src/server/desktop/auth/anthropic/anthropic.ts` — two
   `execSync` keychain `security` reads in the sync credential-resolver
   chain, each blocks Electron main; the enclosing
   `getCredentialsFromAnySource` is already async, so switch to execFile
