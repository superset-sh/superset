# V2 PR Checkout

Extend v2's `workspaceCreation.checkout` procedure to materialize a PR's branch
(via `gh pr checkout`) when the modal carries a `linkedPR`. Not a new endpoint
— `checkout` is already "materialize an externally-defined branch into a
worktree"; a PR branch is just another form of that. The client's
`pr-checkout` intent differentiates progress labels + payload construction,
but routes to the same tRPC mutation.

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
(`buildForkAgentLaunch.ts:354`). Result: the workspace has no PR commits, `git
diff` shows nothing meaningful, and the user has to manually `gh pr checkout`
after the fact.

V2's existing `checkout` procedure almost covers this case but not quite:
- It resolves branches via `origin/<branch>` — fork PRs live at
  `refs/pull/N/head` and fail `resolveRef`.
- No fork-owner-prefix branch naming (`<owner>/<headRefName>` to avoid
  collisions with local branches of the same name).
- No PR metadata awareness (base branch, state, cross-repo flag).

The fix is a narrow expansion of `checkout`, not a new endpoint.

## V1 pain points we're fixing

1. **Server re-parses the PR URL** (`parsePrUrl` → `gh pr view`) even though
   the picker (`PRLinkCommand`) already has structured data.
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

In: `workspaceCreation.checkout` widened to accept optional `pr` metadata;
client pending-intent + payload builder for `pr-checkout`; attach-time PR
detail fetch; tests.

Out: picker-initiated PR checkout (today only the link-a-PR flow triggers
this), PR comments, re-adopt of a workspace after cloud delete (same logic as
the existing `hasWorkspace` safety net).

---

## 1. Server: widen `checkout`

File: `packages/host-service/src/trpc/router/workspace-creation/workspace-creation.ts`

Add an optional `pr` field to the existing input. When set, the middle
section (git ops) uses `gh pr checkout` instead of `resolveRef` + `git
worktree add`. Prelude (project ensure) and postlude (cloud registration +
setup terminal) are unchanged.

```ts
checkout: protectedProcedure
  .input(z.object({
    pendingId: z.string(),
    projectId: z.string(),
    workspaceName: z.string(),

    // Regular path: caller supplies a branch name; server resolves it.
    // PR path: caller supplies PR metadata; server derives branch name +
    // runs `gh pr checkout`. The two are mutually exclusive — exactly one
    // must be set. Enforced at the schema level (see `.refine` below).
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

    composer: z.object({ /* unchanged */ }),
    linkedContext: /* unchanged */,
  }).refine(
    (v) => (!!v.branch) !== (!!v.pr),
    "exactly one of `branch` or `pr` must be set",
  ))
```

### Flow

```
ensuring_repo      → ensureLocalProject (shared with create)
creating_worktree  → { branch path: existing resolveRef + git worktree add }
                     { pr path:     derive name + gh pr checkout         }
registering        → registerWorkspace (shared with create)
(done)             → maybeRunSetupTerminal (shared with create)
```

### PR-path middle section

```ts
if (input.pr) {
  const branch = derivePrLocalBranchName(input.pr);

  // Idempotency: existing workspace for this branch → "open existing".
  // Not error — renderer navigates to it as if a create succeeded.
  const existing = ctx.db.query.workspaces.findFirst({
    where: and(eq(workspaces.projectId, input.projectId), eq(workspaces.branch, branch)),
  }).sync();
  if (existing) {
    clearProgress(input.pendingId);
    return { workspace: existing, terminals: [], warnings: [], alreadyExists: true };
  }

  const worktreePath = safeResolveWorktreePath(localProject.repoPath, branch);
  const git = await ctx.git(localProject.repoPath);

  // Detached worktree → `gh pr checkout` inside it creates the branch with
  // correct fork-remote setup + upstream config. Matches v1's
  // `createWorktreeFromPr` approach.
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
  // Changes-tab authority. Always PR's base — see §3.
  await git.raw(["-C", worktreePath, "config", `branch.${branch}.base`, input.pr.baseRefName]).catch(warn);

  // Falls through to the shared registering + postlude below.
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

`finishCheckout` is a small helper in the same file that wraps
`registerWorkspace` + `maybeRunSetupTerminal` + progress clear. Both branches
of the procedure call it. Covers the "register + setup" postlude without a
full pipeline extraction across three endpoints.

### `derivePrLocalBranchName` — pure + tested

```ts
// packages/host-service/src/trpc/router/workspace-creation/utils/pr-branch-name.ts
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
cross-repo with already-slash-containing head ref, rejection of empty fields.
Also importable from the renderer (pure) — see §2.

## 2. Client wiring

### Pending row schema

File: `apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema.ts`

Add to `pendingWorkspaceSchema`:
- `intent: z.enum(["fork", "checkout", "adopt", "pr-checkout"])`
- `linkedPR` currently stores `{prNumber, title, url, state}`; widen to also
  hold `headRefName`, `baseRefName`, `headRepositoryOwner`,
  `isCrossRepository`. Discriminated on `null` vs object. Malformed legacy
  rows fail zod at the collection boundary, route to `fork` as they do today.

### Attach-time PR fetch

**The picker does not have enough data today.** Current state:
- `searchPullRequests` returns `{prNumber, title, url, state, isDraft, authorLogin}` — `workspace-creation.ts:1296-1303`.
- `LinkedPR` draft shape is `{prNumber, title, url, state}` — `DashboardNewWorkspaceDraftContext.tsx:23`.
- Missing for the endpoint: `headRefName`, `baseRefName`, `headRepositoryOwner`, `isCrossRepository`.

Widening `searchPullRequests` isn't viable — the GitHub search API doesn't
return head/base refs. `getGitHubPullRequestContent` is the right hook: it
shells out to `gh pr view --json ...` and already asks for `headRefName` and
`baseRefName`. Two changes:

1. **Widen `getGitHubPullRequestContent`** — add
   `headRepositoryOwner,isCrossRepository` to the `--json` flag list (both
   natively returned by `gh pr view`, same fields v1 pulls at
   `git.ts:1704`). Update the `PrSchema` zod and the return-mapping block to
   expose `headRepositoryOwner.login` and `isCrossRepository`.

2. **Fetch at attach time** — `PRLinkCommand.onSelect` calls
   `getGitHubPullRequestContent` for the just-picked PR, then updates the
   draft with the full `LinkedPR` shape. One extra call per PR click;
   loading state shows as a spinner on the pill until data lands. On fetch
   failure: fall back to narrow `{prNumber, title, url, state}` LinkedPR
   and gate `pr-checkout` intent on the full shape (submit disabled with a
   tooltip until data arrives or re-linked).

No fetch at submit time.

### Submit dispatch

File: `.../PromptGroup/hooks/useSubmitWorkspace/useSubmitWorkspace.ts`

```ts
const isPrCheckout = draft.linkedPR?.headRefName !== undefined;

collections.pendingWorkspaces.insert({
  id: pendingId,
  projectId,
  intent: isPrCheckout ? "pr-checkout" : "fork",
  name: workspaceName,
  branchName: isPrCheckout
    ? derivePrLocalBranchName(draft.linkedPR!)
    : branchName,
  prompt: draft.prompt,
  baseBranch: isPrCheckout ? draft.linkedPR!.baseRefName : (draft.baseBranch ?? null),
  baseBranchSource: null,
  runSetupScript: draft.runSetupScript,
  linkedIssues: draft.linkedIssues,
  linkedPR: draft.linkedPR,
  hostTarget: draft.hostTarget,
  attachmentCount: files.length,
  status: "creating",
  error: null, workspaceId: null, warnings: [],
  createdAt: new Date(),
});
```

Expose `derivePrLocalBranchName` from host-service's public exports so the
renderer can import it (pure function, no runtime dependency).

### Pending-page dispatch

File: `apps/desktop/src/renderer/routes/_authenticated/_dashboard/pending/$pendingId/page.tsx`

```ts
switch (pending.intent) {
  case "fork":        result = await createWorkspace(buildForkPayload(...));
  case "checkout":    result = await checkoutWorkspace(buildCheckoutPayload(...));
  case "adopt":       result = await adoptWorktree(buildAdoptPayload(...));
  case "pr-checkout": result = await checkoutWorkspace(buildPrCheckoutPayload(pending));
                      //                              ↑ same mutation, different payload
}
```

`buildPrCheckoutPayload` constructs `{ ..., pr: {...}, branch: undefined }`.
`buildCheckoutPayload` constructs `{ ..., branch: "...", pr: undefined }`.
Both go to `workspaceCreation.checkout.mutate(...)`.

Progress labels differ per intent at the UI layer (`"Checking out PR #123..."` vs `"Checking out branch foo..."`) — client-side string choice, not a server concern.

Handle `alreadyExists: true`: same navigation path as successful create, skip
the creating-progress UI.

### Agent-launch context — no change

`buildForkAgentLaunch.ts:354` already consumes `pending.linkedPR` as a
`github-pr` launch source. `pr-checkout` pending rows carry the same
`linkedPR` field, so the agent still gets the PR body in the prompt. PR now
has two roles for this intent: branch source (new) + agent context
(preserved).

## 3. Base branch — the Changes-tab decision

**Always `pr.baseRefName`**, no override at creation time.

- The Changes tab compares the workspace's HEAD against `branch.<name>.base`.
  For a PR, the semantically correct comparison is "my PR head vs the PR's
  merge target on GitHub" — that's `baseRefName`.
- Users don't have a mental model of "pick a base for a PR checkout" — the PR
  dictates it.
- For the rare retarget case (user rebases against a moved `main`), the
  existing `setBranchBaseConfig` helper can update `branch.<name>.base`
  after the fact. Per-workspace, not a creation-flow input.

### Edge case

If the PR's branch later surfaces as a picker row and the user routes it
through the regular `checkout` (non-pr) path, `branch.<name>.base` would get
set from the picker's base selection — typically `main`, not `baseRefName`.
Divergence from the PR's merge target. Mitigation: code comment at the
checkout branch-path `branch.<name>.base` write, warning future maintainers
not to collapse `pr-checkout` into the branch-path by routing picker PR rows
there.

## 4. Decisions made

- **`gh pr checkout` is the fetch mechanism.** Hard dep on `gh auth login`,
  but handles fork-remote + upstream in one shot.
- **Closed/merged PRs: allow with warning.** V1's silent allow, plus a
  `warnings[]` entry surfaced by the pending page.
- **Base branch: always `pr.baseRefName`.** See §3.
- **Full PR object stored in pending row.** `getGitHubPullRequestContent` is
  fast, but storing avoids a round-trip during creation and survives
  `gh`/network transients between attach and submit.
- **One endpoint, two modes.** Widen `checkout` instead of adding
  `createFromPr`. The UI already differentiates the intent (picker hidden
  when PR attached). Rationale in §5.

## 5. Why widen `checkout` instead of a new endpoint

Counted honestly, the new-logic delta is ~40-60 lines: branch-name
derivation, `gh pr checkout` wrapper, `pr.baseRefName` config, idempotency
check, state warning. Everything else (project ensure, cloud registration,
local insert, setup terminal, progress steps) is identical to existing
procedures.

A new endpoint would mean:
- Three separate copies of prelude/postlude (forcing a `pipeline.ts`
  extraction just to pay for the third caller — but two callers into one
  helper is a cleaner extraction that only needs to happen when `create`
  and `checkout` actually start drifting).
- Four tRPC procedures where three suffice.
- Client-side payload builder and pending-intent router still fork, which is
  what differentiates the flows in the user's mental model.

Widening `checkout` keeps the server surface narrow. The two modes are
discriminated via `{ branch } | { pr }` in the input schema, and
misuse is a zod error, not a runtime crash. Client still has
`intent: "pr-checkout"` distinct from `intent: "checkout"` at the pending-row
level — progress labels, payload shape, and post-create navigation all
branch there. Server sees one procedure with a discriminated input.

## 6. Test plan

### Host-service

1. `pr-branch-name.test.ts` — derivation pure function (~8 cases).
2. `workspace-creation.checkout.integration.test.ts`:
   - Existing branch-path tests unchanged.
   - New PR-path cases:
     - Same-repo PR → `gh pr checkout` invoked with correct args, worktree
       at expected path, `branch.<name>.base` = `baseRefName`.
     - Fork PR → branch name is `owner/headRefName`, fork remote added.
     - Existing workspace for same PR → `alreadyExists: true`, no git ops.
     - Closed PR → warning surfaced, workspace created.
     - `gh pr checkout` failure → worktree removed, error propagated.
     - Cloud `v2Workspace.create` failure → worktree rolled back.
     - Schema: both `branch` and `pr` set → zod error (refine guard).
     - Schema: neither `branch` nor `pr` set → zod error.

### Renderer

3. `buildIntentPayload.test.ts` — new `buildPrCheckoutPayload` cases.
4. Manual smoke:
   - Same-repo PR: attach, submit, verify workspace has PR commits.
   - Cross-repo PR: verify fork remote + branch naming.
   - Re-attach same PR: `alreadyExists` navigation.
   - Closed PR: warning toast, still creates.
   - `gh` not installed: clear error.

## 7. Rollout

One PR covers: `checkout` input widening + PR-path implementation,
`getGitHubPullRequestContent` field additions, `PRLinkCommand`
attach-time fetch, pending-row schema widening,
`buildPrCheckoutPayload`, pending-page dispatch case, tests. No feature flag
— gated by "user links a PR in the modal," same as v1.
