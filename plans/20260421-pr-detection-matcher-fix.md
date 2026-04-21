# Plan: Fix PR → workspace matcher (cross-fork collision)

Host-service matches workspaces to PRs by branch name only. Any cross-fork PR with a colliding `headRefName` gets misattributed — e.g. PR #3261 (`quueli/superset-windows:main`) attaches to every local `main` workspace.

## Surface

One writer, two readers:
- **Writer** (buggy): `packages/host-service/src/runtime/pull-requests/pull-requests.ts:402-414`.
- **Readers**: v1 sidebar (`pullRequests.getByWorkspaces`) and v2 workspace detail (`git.getPullRequest`). Both just join on `workspaces.pullRequestId`. Fixing the writer fixes both.

## Changes

1. **Query** (`utils/github-query/query.ts` + `types.ts`): add `headRepositoryOwner { login }`, `headRepository { name }`, `isCrossRepository`.

2. **Schema** (`packages/host-service/src/db/schema.ts`): add `workspaces.upstreamOwner` + `workspaces.upstreamRepo`. Replace `workspaces_branch_idx` with composite `(upstreamOwner, upstreamRepo, branch)`. Migration via `bunx drizzle-kit generate --name="workspace_upstream_ref"` → `packages/host-service/drizzle/0003_*.sql`. Local SQLite, no Neon.

3. **Populate upstream** in `syncWorkspaceBranches` (`pull-requests.ts:204`): resolve tracking remote via `branch.<name>.pushRemote` → `remote.pushDefault` → `branch.<name>.remote` (same order as `gh`), parse URL with `parseGitHubRemote`, store `(owner, name)`.

4. **Rewrite matcher** (`pull-requests.ts:391-477`): key on `${owner}/${repo}#${branch}` tuples instead of branch strings. Workspaces with null upstream match nothing.

## Existing infra

`apps/desktop/src/lib/trpc/routers/workspaces/utils/github/pr-resolution.ts` already solves this correctly for desktop-main (shells to `gh`). Can't reuse directly — host-service uses Octokit GraphQL and may run remotely without `gh`. Follow-up PR: extract pure predicates (`prMatchesLocalBranch`, `shouldAcceptPRMatch`, `sortPRCandidates`) into `@superset/shared/pr-matching.ts` so both paths share them.

## Removable

- `workspaces_branch_idx` (schema.ts:114) — replaced by composite.

## Verification

- PR #3261 (cross-fork): workspace key `superset-sh/superset#main` vs PR key `quueli/superset-windows#main` → no match. ✅
- Fork contributor: workspace upstream = their fork, PR head = their fork → match. ✅
- Same branch name in two forks: tuples disambiguate. ✅

## Rollout

Ship all three changes in one PR. Existing workspaces get null upstream on migration; `syncWorkspaceBranches` fills within 30s — badges briefly missing, self-heals. No flag.
