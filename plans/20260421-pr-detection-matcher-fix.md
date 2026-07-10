# Fix PR → workspace matcher (cross-fork collision)

Shipped in PR #3625.

## The bug

Two workspace → PR match sites keyed on branch name alone. Any cross-fork PR whose `headRefName` collided with a local branch got attached — e.g. PR #3261 (`quueli/superset-windows:main` → `superset-sh/superset:main`) showing on every local `main` workspace.

## Where the symptom came from

- **v1 (`pr-resolution.ts`, visible to the user)** — powers `usePRStatus` via `workspaces.getGitHubStatus`. `prMatchesLocalBranch` accepted any PR whose `headRefName` equaled the local branch name. Cross-fork not considered. **This is what attached PR #3261 in the user's sidebar.**
- **v2 / host-service (`pull-requests.ts`, latent)** — powers `pullRequests.getByWorkspaces` (`_dashboard` sidebar) + `git.getPullRequest` (v2 review tab). Same branch-name-only matcher. Wasn't firing in the reported environment because the host-service `workspaces` table was empty / pointing at deleted worktree paths, but the bug existed in code.

## What we shipped

### v1 (`apps/desktop/src/lib/trpc/routers/workspaces/utils/github/pr-resolution.ts`)

- `prMatchesLocalBranch`: when the local branch has no fork-owner prefix, reject any PR with `isCrossRepository === true`. One line, uses the already-fetched and already-typed field that the predicate just never consulted.
- Module header marks it **v1-only, dies with v1 UI sunset** — don't evolve, v2 already resolves PRs via host-service.

### v2 / host-service (`packages/host-service/src/runtime/pull-requests/`)

- **GraphQL query extended** with `isCrossRepository`, `headRepositoryOwner { login }`, `headRepository { name }`.
- **Schema migration `0003_workspace_upstream_ref`** (local SQLite, not Neon): adds `upstream_owner`, `upstream_repo`, `upstream_branch` columns to `workspaces`; replaces `workspaces_branch_idx` with composite `workspaces_upstream_ref_idx`.
- **`resolveWorkspaceUpstream`** populates those columns during `syncWorkspaceBranches`. Resolution modeled on `gh` CLI:
  - `@{push}` happy path — single `git rev-parse --abbrev-ref <branch>@{push}` returns `remote/branch` respecting all config precedence.
  - Fallback walks `branch.<n>.pushRemote` → `remote.pushDefault` → `branch.<n>.remote`, handling URL-valued configs in addition to remote names.
  - Fallback requires explicit `branch.<n>.merge` — without it, a repo-wide `remote.pushDefault` would re-open the collision hole on untracked branches (coderabbit-flagged).
  - `upstream_branch` is stored separately from local `branch` so `gh pr checkout` renames (`main` → `quueli-main`) still match the PR's `headRefName`.
- **Matcher** keys on `(upstreamOwner, upstreamRepo, upstreamBranch)` tuples, lowercased for owner/repo (GitHub is case-insensitive there) and preserving branch casing.

## What we didn't do

- **Consolidate v1 and v2 into one path** — deferred. v1 dies with the v1 UI sunset (see `project_v1_sunset` memory). No port needed.
- **`headRefOid` SHA-fallback in v2** — v1 has it (matches by HEAD commit when no tracking remote is set), v2 doesn't yet. Can be ported when v1 is actually deleted.

## Review feedback addressed

- **cubic-dev-ai** — case-sensitive owner/repo key. Fixed by lowercasing in `upstreamKey`.
- **coderabbitai** — untracked branch could resolve via `remote.pushDefault` alone and latch onto same-named PR. Fixed by requiring `branch.<n>.merge` in fallback.

## Verification

- PR #3261 (cross-fork): workspace upstream `superset-sh/superset#main` vs PR key `quueli/superset-windows#main` — no match in v2. v1 predicate returns false via `isCrossRepository` check. ✓
- PR #3625 (this PR, same-repo): local branch `pr-3261-detection-in-v1-sidebar` tracking `origin/pr-3261-detection-in-v1-sidebar`. Tuples match in v2. v1 predicate returns true. ✓
- Fresh untracked branch: upstream null, no match. ✓
- `gh pr checkout` cross-fork review (local `quueli-main` tracking fork's `main`): `upstream_branch = main`, matches PR's `headRefName = main`. ✓

## Commit trail

- `aff1763bc` — main fix (both paths + schema + migration) after clean squash
- `6811f7449` — coderabbit-flagged fallback gate
