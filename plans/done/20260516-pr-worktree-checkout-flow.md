# PR Worktree Checkout Flow

## Purpose

Document Superset's current PR workspace checkout setup, explain how the
`package-lock.json would be overwritten by checkout` failure can happen, and
define the more correct v2 flow.

The short version: for worktree mode, we should stop running `gh pr checkout`
inside a placeholder detached worktree. We should resolve and materialize the PR
branch first, verify the expected commit, configure branch metadata, then create
the worktree once with `git worktree add <path> <branch>`.

## Current Superset Setup

### v2 host service

The canonical v2 path is
`packages/host-service/src/trpc/router/workspaces/workspaces.ts`.

- `fetchPrMetadata` shells out to `gh pr view --json number,url,title,headRefName,headRefOid,baseRefName,headRepositoryOwner,isCrossRepository,state` (`workspaces.ts:128`).
- `derivePrLocalBranchName` maps same-repo PRs to `headRefName` and cross-repo PRs to `<fork-owner>/<headRefName>`, falling back to `pr/<number>` if GitHub no longer reports a fork owner (`packages/host-service/src/trpc/router/workspace-creation/utils/pr-branch-name.ts:12`).
- `workspaces.create` prunes stale worktree registrations, checks for an existing Superset workspace, checks whether a local branch already points at `headRefOid`, and adopts a matching existing worktree when possible (`workspaces.ts:544`).
- If the local branch already exists and matches the PR head, v2 creates a worktree directly from that branch with `git worktree add <path> <branch>` (`workspaces.ts:622`).
- If the local branch does not exist, v2 creates a detached placeholder worktree with `git worktree add --detach <path>`, then runs `gh pr checkout <pr> --branch <derivedBranch> --force` with `cwd` set to that placeholder (`workspaces.ts:640` and `workspaces.ts:653`).
- After checkout, v2 enables `push.autoSetupRemote` and registers local/cloud workspace records.

Recovery after `gh pr checkout` lives in
`packages/host-service/src/trpc/router/workspace-creation/utils/pr-checkout-recovery.ts`.
It only handles selected `gh` failures:

- `'<remote>/<branch>' is not a branch`, where `gh` likely fetched a valid `FETCH_HEAD` but failed while attaching tracking (`pr-checkout-recovery.ts:18`).
- Missing/unreadable remote/ref errors, where Superset explicitly fetches `refs/pull/<number>/head` (`pr-checkout-recovery.ts:27`).
- Both paths verify `FETCH_HEAD` against `headRefOid` before `git checkout -B <branch> --no-track FETCH_HEAD` (`pr-checkout-recovery.ts:60` and `pr-checkout-recovery.ts:99`).

It does not recover from a dirty placeholder worktree.

### v1 desktop

The legacy desktop path has the same high-level shape in
`apps/desktop/src/lib/trpc/routers/workspaces/utils/git.ts`.

- `createWorktreeFromPr` is documented as creating a worktree from a PR by using
  `gh pr checkout` inside the new worktree (`git.ts:1736`).
- If the local branch exists, it runs `git worktree add <path> <branch>` (`git.ts:1759`).
- Otherwise it runs `git worktree add --detach <path>` and then
  `gh pr checkout <pr> --branch <localBranchName> --force` in that worktree (`git.ts:1772` and `git.ts:1780`).
- It has a narrower fallback for the `"is not a branch"` tracking error, also using `FETCH_HEAD` (`git.ts:1793`).

v2 is the path to fix first, but v1 has the same underlying vulnerability.

### Public surface and docs

Several user-facing or SDK-facing descriptions still say that PR workspace
creation is implemented by `gh pr checkout`:

- `packages/cli/src/commands/workspaces/create/command.ts:14`
- `packages/mcp-v2/src/tools/workspaces/create.ts:43`
- `packages/sdk/src/resources/workspaces.ts:164`
- `apps/docs/content/docs/cli/cli-reference.mdx:539`
- `skills/superset/SKILL.md:39`

The implementation plan in
`apps/desktop/plans/20260416-v2-pr-checkout-endpoint.md` explicitly chose the
detached-worktree-plus-`gh pr checkout` approach because it matched v1 and let
`gh` set fork/upstream metadata (`20260416-v2-pr-checkout-endpoint.md:146` and
`:349`). That was a reasonable shortcut, but it is the source of this failure
class.

## How The Failure Happens

The failing command looked like:

```text
gh pr checkout 1038 --branch MiroBenicio/agents-md-add-typecheck --force
error: Your local changes to the following files would be overwritten by checkout:
package-lock.json
```

This should not be caused by unrelated dirtiness in the user's main checkout if
`cwd` is truly the new worktree. Git worktrees have independent working trees.

The likely chain is:

1. Superset runs `git worktree add --detach <worktreePath>`.
2. That command performs a real checkout into `<worktreePath>`.
3. During or immediately after that checkout, local hooks, filters, generated
   files, package-manager side effects, or watchers modify a tracked file in the
   new placeholder worktree. In the observed case the file was `package-lock.json`.
4. Superset then runs `gh pr checkout ... --force` in that already-dirty
   placeholder worktree.
5. `gh pr checkout` still uses normal `git checkout`/`git fetch`/`git reset`
   commands internally. Its `--force` is not a general "discard any dirty
   placeholder worktree before switching" operation, so Git refuses to overwrite
   the dirty tracked file and the PR checkout aborts.

I reproduced the same Git error shape locally with a `post-checkout` hook that
rewrites `package-lock.json` during the detached worktree creation step.

If this error happened without the new worktree becoming dirty, the other
possibility is that `gh pr checkout` was run with the wrong `cwd`. The current
v2 code passes `{ cwd: worktreePath }`, so the dirty-placeholder explanation is
the one that matches the code path.

## External Comparisons

### Worktrunk

Worktrunk is the strongest comparison because it has first-class `pr:<number>`
and `mr:<number>` worktree switching.

Local clone: `~/workplace/worktrunk` at
`d25e87c3 chore: update tend workflows (0.0.19 -> 0.0.21) (#2772)`.

Relevant behavior:

- Help text says same-repo PRs/MRs switch to the branch directly; fork PRs/MRs
  fetch the platform ref (`refs/pull/N/head` or `refs/merge-requests/N/head`)
  and configure `pushRemote` to the fork URL (`src/cli/mod.rs:622`).
- The remote-ref module documents the shared workflow: fetch metadata, check
  whether a local branch already tracks the ref, then create/configure the
  branch if needed (`src/git/remote_ref/mod.rs:1`).
- Same-repo PRs are fetched with an explicit refspec so a remote-tracking ref
  exists even in limited-fetch clones:
  `+refs/heads/<branch>:refs/remotes/<remote>/<branch>`
  (`src/commands/worktree/switch.rs:419`).
- Fork PRs fetch the PR/MR ref, create the local branch from `FETCH_HEAD`,
  configure `branch.<name>.remote`, `branch.<name>.merge`, and optionally
  `branch.<name>.pushRemote`, then run `git worktree add -- <path> <branch>`
  (`src/commands/worktree/switch.rs:695` and `:743`).

The important pattern is that Worktrunk does not create a detached placeholder
worktree and then run `gh pr checkout` inside it. It materializes and configures
the branch first, then creates the worktree from that branch.

### T3Code

Local clone: `~/workplace/t3code`.

T3Code uses `gh pr checkout --force` only for an intentional local checkout
mode (`apps/server/src/git/Layers/GitManager.ts:1428`). In worktree mode it:

- Resolves PR metadata and derives a local PR branch (`GitManager.ts:1464`).
- Materializes the PR branch before creating the worktree
  (`GitManager.ts:1517`).
- Creates the worktree with `git worktree add <path> <branch>`
  (`GitCore.ts:1896`).
- Falls back to fetching `+refs/pull/<pr>/head:refs/heads/<branch>` when richer
  head-repo fetching is unavailable (`GitCore.ts:1919`).

This is effectively the same architecture Superset should use.

### GitHub CLI

Local clone: `~/workplace/cli`.

`gh pr checkout` is current-worktree oriented:

- For existing remotes it fetches `refs/heads/<head>` into a remote-tracking ref,
  then checks out, merges/resets, or creates a tracking local branch
  (`pkg/cmd/pr/checkout/checkout.go:170`).
- For missing remotes/forks it fetches `refs/pull/<number>/head`, checks out the
  local branch, then configures `branch.<name>.remote`, `pushRemote`, and
  `merge` (`checkout.go:204`).

There is an open upstream feature request for a native worktree mode:
https://github.com/cli/cli/issues/5793. That reinforces that `gh pr checkout`
does not currently expose the worktree primitive Superset needs.

### Other tools

- OpenClaw's review helper creates a temporary worktree from `origin/main`, then
  fetches `pull/<pr>/head:pr-<pr>` and checks out that ref detached
  (`~/workplace/openclaw/scripts/pr:80` and `:270`). That is useful for review
  mode but still has a two-checkout placeholder risk.
- Workz and Worktree Manager are not PR-specific, but their generic pattern is
  the same safer worktree pattern: choose or create a branch/ref first, then run
  one `git worktree add` from that start point (`~/workplace/workz/src/git.rs:76`,
  `~/workplace/worktree-manager/src/worktree.ts:62`, and `:145`).

## Recommended v2 Flow

Replace the "detached placeholder, then `gh pr checkout`" path with a
materialize-first PR worktree flow.

### 1. Keep `gh pr view` for metadata

Continue using `gh pr view` because it gives authenticated GitHub metadata and
fits the existing dependency model. Extend the metadata only as needed:

- Keep `number`, `url`, `title`, `headRefName`, `headRefOid`, `baseRefName`,
  `headRepositoryOwner`, `isCrossRepository`, and `state`.
- Add `headRepository` and `maintainerCanModify` if we want parity with
  GitHub CLI's fork push configuration.

### 2. Derive and validate the local branch

Reuse `derivePrLocalBranchName`.

Before creating a worktree:

- If a Superset workspace already exists for that branch, return it.
- If the local branch exists and its head equals `headRefOid`, adopt it or add a
  worktree from it.
- If the local branch exists and its head differs from `headRefOid`, keep the
  current conflict behavior.
- If the branch is already checked out in another worktree, adopt that worktree
  when it matches the PR head.

This part of v2 is already mostly right.

### 3. Materialize the PR branch before the worktree

For same-repo PRs:

1. Resolve the base remote name (`localProject.remoteName ?? "origin"` today).
2. Fetch the source branch explicitly:

   ```text
   git fetch --no-tags --quiet <remote> +refs/heads/<headRefName>:refs/remotes/<remote>/<headRefName>
   ```

3. Verify `refs/remotes/<remote>/<headRefName>` equals `headRefOid`.
4. Create the local branch from the verified commit OID if it does not already
   exist.
5. Configure upstream to `<remote>/<headRefName>`.

For cross-repo PRs or deleted head branches:

1. Fetch GitHub's synthetic PR head ref from the base remote:

   ```text
   git fetch --no-tags --quiet <remote> +refs/pull/<number>/head:refs/superset/pr-fetch/<number>/head
   ```

2. Verify `refs/superset/pr-fetch/<number>/head^{commit}` equals
   `headRefOid`. This avoids `FETCH_HEAD`, which is shared across concurrent
   fetches in the same clone.
3. Create the local branch from the verified commit OID, not the mutable
   internal ref.
4. Configure:
   - `branch.<branch>.remote = <remote or Superset-managed fork remote>`
   - `branch.<branch>.merge = refs/pull/<number>/head` for synthetic-ref fallback,
     or `refs/heads/<headRefName>` when a real fork remote is available.
   - `branch.<branch>.pushRemote = <Superset-managed fork remote>` and
     `remote.<fork-remote>.push = HEAD:refs/heads/<headRefName>` for cross-repo
     PRs with `headRepository` metadata, so plain `git push` targets the fork
     branch instead of GitHub's read-only synthetic PR ref.

This preserves the safety check v2 already has in recovery: every fetched PR
head must match GitHub's `headRefOid` before we create or update a branch.

### 4. Create the worktree once

After the branch exists and points at the verified PR head:

```text
git worktree add <worktreePath> <resolvedBranch>
```

or, when creating a brand-new branch atomically from a verified ref:

```text
git worktree add -b <resolvedBranch> <worktreePath> <verifiedStartPoint>
```

There should be no intermediate detached checkout in the target path.

After creation, optionally run `git status --porcelain` in the new worktree. If
hooks or filters still dirty files during the single worktree checkout, surface
that as a warning on the workspace instead of treating it as a PR checkout
failure. The branch is already correct at that point.

### 5. Keep rollback targeted

If branch materialization fails, no worktree exists yet.

If `git worktree add` fails after a new branch was created only for this
operation, delete that branch if and only if it still points at the verified PR
head and is not checked out anywhere. Do not delete or reset pre-existing local
branches.

## Implementation Shape

Add small, testable helpers under
`packages/host-service/src/trpc/router/workspace-creation/utils/`:

- `resolvePrCheckoutPlan` - classify same-repo vs cross-repo, choose remote/ref,
  and describe required branch config.
- `fetchAndVerifyPrHead` - fetch same-repo branch or synthetic PR ref and verify
  the resulting OID against `headRefOid`.
- `materializePrBranch` - create/configure the local branch without checking it
  out in any worktree.
- `configurePrBranchTracking` - set `branch.<name>.remote`, `.merge`, and
  `.pushRemote` consistently.

Then update only the new-branch PR path in
`packages/host-service/src/trpc/router/workspaces/workspaces.ts`:

1. Replace `git worktree add --detach` plus `gh pr checkout` with
   `materializePrBranch(...)`.
2. Run `git worktree add <path> <resolvedBranch>`.
3. Keep existing workspace registration, base-branch config, and rollback
   behavior. PR workspaces should rely on explicit branch tracking/push config
   instead of `push.autoSetupRemote`.
4. Remove or narrow `recoverPrCheckoutAfterGhFailure` usage. The useful
   synthetic-ref fetch and OID verification logic should move into the normal
   materialization path.

Once v2 is changed, update CLI/MCP/SDK/docs descriptions so they say Superset
checks out PRs by resolving the PR head and creating a worktree from the
verified branch, not by running `gh pr checkout`.

## Tests To Add

- Same-repo PR: fetches source branch with explicit refspec, verifies
  `headRefOid`, creates branch/worktree.
- Fork PR: fetches `refs/pull/<number>/head`, verifies `headRefOid`, configures
  branch metadata, creates branch/worktree.
- Deleted fork/head branch: synthetic PR ref still works when GitHub exposes the
  PR head ref.
- Existing local branch with matching OID: no fetch rewrite needed; add/adopt
  worktree.
- Existing local branch with mismatched OID: conflict with current cleanup hint.
- Branch already checked out in another worktree: adopt matching branch, reject
  mismatched branch.
- Dirty-placeholder regression: install a `post-checkout` hook that modifies a
  tracked file like `package-lock.json`; the new flow should not run a second
  checkout in that dirty placeholder and should create the PR workspace
  successfully.
- OID mismatch after fetch: abort before branch/worktree creation.

## Non-goals

- Do not stash user changes to make PR checkout work.
- Do not mutate the primary checkout.
- Do not call `gh pr checkout` in worktree mode.
- Do not force-reset a pre-existing user branch that points at a different
  commit.
- Do not point fork PR pushes at GitHub's read-only `refs/pull/<number>/head`
  synthetic ref.

## Implementation Status

Implemented for the canonical v2 host-service path:

- `workspaces.create` now fetches and verifies the PR head, materializes the
  local branch, then creates the worktree from that branch.
- The PR path no longer shells out to `gh pr checkout` in worktree mode.
- `workspaces.create` uses `ctx.execGh` for PR metadata so integration tests can
  mock GitHub CLI behavior.
- Cross-repo PRs with `headRepository` metadata get a Superset-managed fork
  remote plus a push refspec so plain `git push` targets the contributor branch.
- Same-repo and synthetic PR fetches create branches from the verified commit
  OID instead of from mutable refs. Synthetic fetches reuse
  `refs/superset/pr-fetch/<number>/head` instead of accumulating one ref per
  force-pushed OID.
- Materialization warnings are returned from `workspaces.create` and surfaced by
  the desktop workspace-create flow.
- Regression coverage now includes command-level helper tests, real-git
  materialization tests, and a `workspaces.create` integration test that proves
  the dirty-placeholder failure class no longer blocks PR workspace creation.

Remaining follow-ups:

- Decide whether to backport the same shape to legacy v1 desktop code.
- Add richer fork permission handling (`maintainerCanModify`, deleted forks,
  inaccessible forks) if we need exact GitHub CLI parity for every fork push
  edge case.
