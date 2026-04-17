# V2 PR Checkout

Extend v2's `workspaceCreation.checkout` procedure to materialize a PR's branch
(via `gh pr checkout`) when the modal carries a `linkedPR`. Not a new endpoint
— `checkout` already means "materialize an externally-defined branch into a
worktree"; a PR branch is just another form of that. The client's
`pr-checkout` intent differentiates progress labels + payload construction,
but routes to the same tRPC mutation.

Reuses the `getGitHubPullRequestContent` fetch that already happens at launch
time — moved earlier in the pending-page sequence and shared between the
mutation payload and the agent-launch resolver. **Zero net new fetches.**

Cross-refs:
- `apps/desktop/V2_WORKSPACE_CREATION.md` — umbrella design this extends.
- `packages/host-service/GIT_REFS.md` — ref handling discipline.
- V1 source: `apps/desktop/src/lib/trpc/routers/workspaces/procedures/create.ts:752` (`createFromPr`) + `.../utils/git.ts:1630-1791`.

## Problem

V2's `NewWorkspaceModal` accepts a `linkedPR` in its draft, and the UI already
signals the intent switch — when a PR is attached, the branch picker is
replaced with "based off PR #N" (`PromptGroup.tsx:365-376`). But submit
currently routes through the `fork` intent, which creates a new branch off
`baseBranch`. The PR is passed only as prompt context to the agent
(`buildForkAgentLaunch.ts:354`). Result: the workspace has no PR commits,
`git diff` shows nothing meaningful, and the user has to manually `gh pr
checkout` after the fact.

V2's existing `checkout` procedure almost covers this case but not quite:
- Resolves branches via `origin/<branch>` — fork PRs live at
  `refs/pull/N/head` and fail `resolveRef`.
- No fork-owner-prefix branch naming (`<owner>/<headRefName>` to avoid
  collisions with local branches of the same name).
- No PR metadata awareness (base branch, state, cross-repo flag).

The fix is a narrow expansion of `checkout`, not a new endpoint.

## V1 pain points we're fixing

1. **Server re-parses the PR URL** (`parsePrUrl` → `gh pr view`) even though
   the picker already has structured data.
2. **`gh pr view` runs twice** — once at attach time, once at checkout time.
3. **`gh pr checkout --force` silently overwrites** any local branch with the
   same name. V1's "existing worktree" check fires after the git op, not
   before.
4. **Fire-and-forget** — no pending-row, no retry, no progress steps.
5. **Host-local only** — v1 writes to `worktrees` + `workspaces` tables, no
   cloud `v2Workspace.create`, no `ensureV2Host`.
6. **Silent on closed/merged PRs** — worktree still created, user has to
   notice.
7. **Untyped branch-name derivation** — inline string munging in `git.ts:1630`,
   no unit tests.

## Scope

In: `checkout` widening, `getGitHubPullRequestContent` response widening,
pending-page fetch-before-mutate wiring, `buildForkAgentLaunch` resolved-PR
pass-through, tests.

Out: picker-initiated PR checkout (no entry path today), PR comments, re-adopt
after cloud delete (existing `hasWorkspace` safety net covers this).

---

## 1. Server

### 1a. Widen `getGitHubPullRequestContent`

File: `packages/host-service/src/trpc/router/workspace-creation/workspace-creation.ts` (line 1377)

Currently returns `{number, title, body, url, state, branch, baseBranch, author, isDraft, createdAt, updatedAt}`. Missing for our use: `headRepositoryOwner`, `isCrossRepository`.

`gh pr view --json` already returns both natively (v1 pulls them at
`git.ts:1704`). Three small edits:

- Append `,headRepositoryOwner,isCrossRepository` to the `--json` flag
  list (line 1394).
- Extend `PrSchema` zod (line 1430) with those fields.
- Expose them in the return mapping (line 1396-1409).

Not a new fetch — same `gh pr view` call, two more fields surfaced.

### 1b. Widen `checkout`

File: same file, line 811. Two input changes:

1. Add optional `pr` for the PR-path.
2. Add `composer.baseBranch` — matches `create`'s composer shape. Used by
   the shared postlude to write `branch.<name>.base` for the Changes tab.
   Populated client-side per mode (picker selection for branch path,
   `pr.baseRefName` for PR path).

Exactly one of `branch` or `pr` must be set — enforced at the zod layer:

```ts
checkout: protectedProcedure
  .input(z.object({
    pendingId: z.string(),
    projectId: z.string(),
    workspaceName: z.string(),

    branch: z.string().optional(),
    pr: z.object({
      number: z.number().int().positive(),
      url: z.string().url(),
      title: z.string(),
      headRefName: z.string(),
      baseRefName: z.string(),
      headRepositoryOwner: z.string(),
      isCrossRepository: z.boolean(),
      state: z.enum(["open", "closed", "merged", "draft"]),
    }).optional(),

    composer: z.object({
      prompt: z.string().optional(),
      baseBranch: z.string().optional(),      // ← new; shared across branch + PR paths
      runSetupScript: z.boolean().optional(),
    }),
    linkedContext: /* unchanged */,
  }).refine(
    (v) => (!!v.branch) !== (!!v.pr),
    "exactly one of `branch` or `pr` must be set",
  ))
```

### PR-path middle section

```ts
if (input.pr) {
  const branch = derivePrLocalBranchName(input.pr);

  // Idempotency: existing workspace for this branch → "open existing".
  // Not an error — renderer navigates to it as if a create succeeded.
  const existing = ctx.db.query.workspaces.findFirst({
    where: and(eq(workspaces.projectId, input.projectId), eq(workspaces.branch, branch)),
  }).sync();
  if (existing) {
    clearProgress(input.pendingId);
    return { workspace: existing, terminals: [], warnings: [], alreadyExists: true };
  }

  const worktreePath = safeResolveWorktreePath(localProject.repoPath, branch);
  const git = await ctx.git(localProject.repoPath);

  // Detached worktree → `gh pr checkout` inside creates the branch with
  // correct fork-remote + upstream config. Matches v1's `createWorktreeFromPr`.
  await git.raw(["worktree", "add", "--detach", worktreePath]);
  try {
    await execGh(
      ["pr", "checkout", String(input.pr.number), "--branch", branch, "--force"],
      { cwd: worktreePath, timeout: 120_000 },
    );
  } catch (err) {
    await git.raw(["worktree", "remove", "--force", worktreePath]).catch(() => {});
    clearProgress(input.pendingId);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `gh pr checkout failed: ${errMsg(err)}`,
    });
  }

  await git.raw(["-C", worktreePath, "config", "--local", "push.autoSetupRemote", "true"]).catch(warn);
  // NOTE: `branch.<name>.base` write lives in `finishCheckout` and reads
  // from `composer.baseBranch` — client passes `pr.baseRefName` for PR
  // mode. No intent-specific config write here. See §3.

  return await finishCheckout(ctx, {
    pendingId: input.pendingId,
    projectId: input.projectId,
    workspaceName: input.workspaceName,
    branch,
    worktreePath,
    runSetup: input.composer.runSetupScript ?? false,
    rollbackGit: git,
    extraWarnings: input.pr.state !== "open"
      ? [`PR is ${input.pr.state} — commits are included, but the PR may not merge.`]
      : [],
  });
}

// ...existing branch-path body, refactored to also call finishCheckout()
```

`finishCheckout` is a local helper in the same file wrapping:

- `branch.<name>.base` config write (if `composer.baseBranch` set)
- `ensureV2Host` + `v2Workspace.create` (with rollback)
- local `workspaces` insert
- setup terminal
- `clearProgress`

Called from both branches. Skips a full pipeline-extraction — two callers in
one file is a local helper, not a module. The existing branch-path in
`checkout` (non-PR) also routes through `finishCheckout`, which means
regular picker-driven checkouts start writing `branch.<name>.base` too —
fixes a current gap where only `create` records the base.

### 1c. `derivePrLocalBranchName`

New file: `packages/host-service/src/trpc/router/workspace-creation/utils/pr-branch-name.ts`

```ts
export function derivePrLocalBranchName(pr: {
  headRefName: string;
  headRepositoryOwner: string;
  isCrossRepository: boolean;
}): string {
  if (pr.isCrossRepository) {
    const owner = pr.headRepositoryOwner.toLowerCase();
    return `${owner}/${pr.headRefName}`;
  }
  return pr.headRefName;
}
```

Unit tests: same-repo passthrough, cross-repo prefix, owner case-folding,
cross-repo with slash-containing head refs, empty-field rejection. Pure
function — importable from the renderer too.

## 2. Renderer

### 2a. Pending-row schema

File: `apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema.ts`

Only change: add `"pr-checkout"` to the `intent` enum. **`linkedPR` stays
narrow** (`{prNumber, title, url, state}`) — the enriched fields don't need to
persist in the pending row; they're fetched on-page via `useQuery`.

### 2b. Submit dispatch

File: `.../PromptGroup/hooks/useSubmitWorkspace/useSubmitWorkspace.ts`

```ts
collections.pendingWorkspaces.insert({
  id: pendingId,
  projectId,
  intent: draft.linkedPR ? "pr-checkout" : "fork",
  // ...rest unchanged
});
```

### 2c. Pending-page dispatch

File: `apps/desktop/src/renderer/routes/_authenticated/_dashboard/pending/$pendingId/page.tsx`

New case in `useFireIntent`:

```ts
case "pr-checkout": {
  // Fetch PR content before firing. Stable query key — react-query dedupes.
  const { data: prContent, error } = useQuery({
    queryKey: ["workspaceCreation.getGitHubPullRequestContent", pending.projectId, pending.linkedPR.prNumber],
    queryFn: () => hostServiceClient.workspaceCreation.getGitHubPullRequestContent.query({
      projectId: pending.projectId,
      prNumber: pending.linkedPR!.prNumber,
    }),
  });
  if (error) { /* pending row error state, user can retry */ return; }
  if (!prContent) { /* still loading — progress label: "Resolving PR..." */ return; }

  const result = await checkoutWorkspace(buildPrCheckoutPayload(pending, prContent));
  // ...agent-launch builder receives prContent via resolvedPr — no re-fetch
}
```

Progress labels at the UI layer differ per intent (`"Resolving PR..."`,
`"Checking out PR #123..."`). Server progress step names stay generic.

### 2d. `buildForkAgentLaunch` — accept resolved PR

File: `apps/desktop/src/renderer/routes/_authenticated/_dashboard/pending/$pendingId/buildForkAgentLaunch.ts`

Add optional `resolvedPr` to `BuildForkAgentLaunchInputs`. When provided,
`fetchPullRequest` resolver (line 436) returns it directly instead of calling
`client.workspaceCreation.getGitHubPullRequestContent.query`. For `fork`
intent (no prefetch), the existing fetch-on-demand path is unchanged.

The shape `prContent` returns already has `branch` (= `headRefName`) and
`body` — exactly what the resolver needs.

### 2e. `buildPrCheckoutPayload`

New file or addition alongside existing `buildForkPayload` etc. Pure function,
unit-tested. Constructs:

```ts
{
  pendingId, projectId, workspaceName,
  pr: { number, url, title, headRefName, baseRefName, headRepositoryOwner, isCrossRepository, state },
  composer: {
    prompt: pending.prompt,
    baseBranch: prContent.baseRefName,   // ← sourced from fetched PR
    runSetupScript: pending.runSetupScript,
  },
  linkedContext: ...,
}
```

The branch-path equivalent (`buildCheckoutPayload`) gains a matching
`composer.baseBranch` field sourced from the picker's base selection.

### What does NOT change

- `DashboardNewWorkspaceDraftContext.tsx` — `LinkedPR` type stays narrow.
- `PRLinkCommand.tsx` — no attach-time fetch, no spinner on the pill, no
  loading state on the modal.
- `searchPullRequests` endpoint — unchanged.
- `create` and `adopt` procedures — untouched.
- `checkout`'s existing branch-path body — the git ops stay as-is; only the
  postlude is factored into `finishCheckout`, and `composer.baseBranch`
  (new field) feeds into it.

## 3. Base branch — the Changes-tab decision

**Always write `branch.<name>.base` in the `checkout` postlude**, sourced from
`composer.baseBranch`. Client populates the field per mode:

- Branch path: picker-selected base branch (same semantics as `create`
  uses today).
- PR path: `pr.baseRefName` — the PR's merge target on GitHub.
- Absent: skip the write (matches `create`'s current `head`-start-point
  behavior).

Server doesn't branch on intent for this config write — it reads
`composer.baseBranch` uniformly and writes. Simpler server, simpler
contract.

### Why PR path always uses `pr.baseRefName`

- Changes tab compares workspace HEAD against `branch.<name>.base`. For a PR,
  the semantically correct comparison is "my PR head vs PR's merge target on
  GitHub" — that's `baseRefName`.
- Users don't have a mental model of "pick a base for a PR checkout."
- Rare retarget case: existing `setBranchBaseConfig` helper covers it
  post-create.

### Side benefit: fixes a current gap

Today's `checkout` procedure doesn't write `branch.<name>.base` at all — only
`create` (fork) does. That means picker-driven "Check out" workspaces have no
recorded base, and the Changes tab has to infer. With this change, all three
intents (fork, checkout, pr-checkout) record a base via the same config key.
Consistent Changes-tab behavior across creation paths.

## 4. Decisions locked

- **`gh pr checkout` as mechanism.** Hard dep on `gh auth login`; handles
  fork-remote + upstream in one shot.
- **Closed/merged PRs: allow with warning.** V1's silent-allow + `warnings[]`
  entry.
- **Base branch: shared postlude write, sourced from `composer.baseBranch`.**
  PR path fills it with `pr.baseRefName`; branch path fills it with picker
  selection. See §3.
- **One endpoint, two modes.** Widen `checkout`; client keeps a distinct
  `pr-checkout` pending intent.
- **Zero net new fetches.** Pending page fetches once via `useQuery`, feeds
  both mutation payload and agent-launch resolver. Moves the existing
  `buildForkAgentLaunch` fetch earlier, not adds a new one.

## 5. Fetch accounting

| Scenario | Before (today) | After |
|---|---|---|
| Fork, no PR | 0 PR fetches | 0 PR fetches |
| Fork with linkedPR (today's behavior, no longer reachable once `pr-checkout` intent branches) | 1 fetch at agent-launch | — |
| PR-checkout | — | 1 fetch at pending-page, shared with agent-launch |

Same total call count per submit. Timing moves from "after mutation" to
"before mutation," which is required for the mutation payload.

## 6. Test plan

### Host-service

1. `pr-branch-name.test.ts` — pure function, ~8 cases.
2. `workspace-creation.checkout.integration.test.ts`:
   - Existing branch-path tests unchanged.
   - PR-path: same-repo, fork, idempotency (existing workspace → `alreadyExists: true`), closed-PR warning, `gh pr checkout` failure rolls back worktree, cloud-create failure rolls back worktree.
   - Schema guards: both `branch` + `pr` → zod error; neither → zod error.

### Renderer

3. `buildPrCheckoutPayload.test.ts` — pure builder, construction cases.
4. Manual smoke:
   - Same-repo PR: attach, submit, verify PR commits in workspace.
   - Cross-repo PR: fork remote added, branch named `<owner>/<head>`.
   - Re-attach same PR: `alreadyExists` navigation.
   - Closed PR: warning toast, workspace still created.
   - `gh` missing: clear error at pending page.

## 7. Rollout

One PR: server widenings (1a, 1b, 1c) + renderer wiring (2a-2e) + tests. No
feature flag — gated by "user links a PR in the modal," same as v1.
