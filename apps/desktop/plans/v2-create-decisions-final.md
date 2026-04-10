# V2 Create Workspace — Final Decisions

## 1. Branch name generation

**Owner:** Renderer.

**Phase 1 flow:**
1. User typed a branch name → use it
2. No branch name → derive from prompt slug (`sanitizeBranchNameWithMaxLength(prompt)` → `fix-the-login-bug`)
3. No prompt either → `workspace-${crypto.randomUUID().slice(0, 8)}`

Host-service receives a branch name every time. Never `undefined`. Host-service deduplicates it (decision #8).

**Phase 2:** AI branch gen runs async in parallel — fire at submit, don't block create. If AI returns before the host-service call, swap in the better name. Requires `workspaceCreation.generateBranchName` on host-service (decision #3).

## 2. Workspace display name

**Owner:** Renderer.

Renderer sends `workspaceName` explicitly:
- User typed a name → use it
- No name → use prompt text (truncated)
- No prompt → use branch name

No post-create AI rename. No flash. What you see in the modal is what you get.

## 3. AI branch name generation

**Behavior:** Not in Phase 1. Use prompt slug (`sanitizeBranchNameWithMaxLength(prompt)`) — purely client-side, no backend call, no project ID needed.

**No `electronTrpc` calls from V2 modal for workspace operations.** The existing `electronTrpc.workspaces.generateBranchName` is a V1 endpoint that requires a V1 local project ID. The V2 modal must not call it — that's a boundary violation.

**Phase 2 migration:** Add `workspaceCreation.generateBranchName({ projectId, prompt })` to host-service. It has the repo (for branch dedup) and needs a model provider for the AI call. The gap is the host-service doesn't have access to the user's AI credentials today (`callSmallModel` reads from Electron settings). Either extend the host-service model provider for utility calls, or proxy through it to the user's config.

**How V1's AI branch gen works** (for reference):
1. `callSmallModel` picks user's configured provider (OpenAI/Anthropic)
2. Sends prompt with instruction: "Generate a concise git branch name (2-4 words, kebab-case)"
3. Sanitizes + deduplicates against existing branches
4. Returns name without prefix (server applies prefix)
5. Needs: repo path (for branch list), git author config (for prefix), AI credentials

**File:** `apps/desktop/src/lib/trpc/routers/workspaces/utils/ai-branch-name.ts`

## 4. Collision detection

**None.** No collision detection. No `opened_existing_workspace` outcome from the create modal flow.

The host-service receives a branch name and deduplicates it against existing branches. If `fix-the-login-bug` exists, it becomes `fix-the-login-bug-2`. Always creates a new workspace. Never silently opens an existing one.

If the user wants to open an existing workspace, they use the sidebar.

## 5. Collision UX

**N/A.** There is no collision — the branch name is always unique after dedup. The create modal always creates.

Remove the `opened_existing_workspace`, `opened_worktree`, and `adopted_external_worktree` outcome paths from the create flow. The only outcome is `created_workspace`.

## 6. Modal close timing

**Behavior:** Close immediately on submit. Show pending workspace skeleton in sidebar. Navigate when create succeeds.

**Draft preservation:** Stash a snapshot of the draft into a zustand atom before closing. Close + reset the modal normally. On create failure, restore the stash and reopen the modal so the user can retry. On create success, clear the stash.

This doesn't depend on the context provider staying mounted — the zustand atom survives route changes and component lifecycle.

## 7. Pending workspace phases

**Single phase:** `creating`. That's it.

No `generating-branch` (no blocking AI), no `preparing` (no renderer-side prep between close and API call). Skeleton appears, host-service call runs, skeleton resolves to workspace or error.

## 8. Worktree creation always creates a new branch

**Behavior:** Always `git worktree add -b branchName worktreePath baseBranch`. If the branch name already exists (despite dedup), fall back to a new deduplicated name — never check out the existing branch.

Checking out an existing branch into a worktree is a separate intent (e.g. "import existing branch" or `createFromPr`). The create flow should never silently check out someone else's branch. If the `-b` fails because the branch exists, append a suffix and retry — don't switch to a checkout.

V1's try/catch pattern (`worktree add` then fallback to `worktree add -b`) conflates "create" and "checkout" intents. V2 keeps them separate.

## 9. Branch dedup

**Owner:** Host-service (at create time).

Host-service has the authoritative branch list from git at create time. It deduplicates the incoming branch name against existing branches. `fix-the-login-bug` → `fix-the-login-bug-2` if it exists. Renderer sends its best-effort name; host-service guarantees uniqueness.

## 9. `sanitizeBranchNameWithMaxLength` location

**Decision:** Copy into host-service for dedup. Renderer keeps its copy for the branch name preview in the UI. Both need it — renderer for preview, host-service for dedup + sanitization of the final name.

## 10. Host-service input schema

`names.branchName` is always provided by renderer. `names.workspaceName` is always provided by renderer. Host-service sanitizes + deduplicates `branchName` before creating the worktree. Uses `workspaceName` as-is for the cloud row display name.

## 11. Return shape

Simplified. No `outcome` field — create always creates.

```ts
{ workspace: { id, branch, ... }, warnings: string[] }
```

Remove `opened_existing_workspace`, `opened_worktree`, `adopted_external_worktree` outcomes and all their code paths from the host-service. The create endpoint does one thing: create a workspace on a deduplicated branch name.

## 12. PR create path

**Separate endpoint:** `workspaceCreation.createFromPr({ projectId, prUrl })`.

The PR flow is fundamentally different from normal create — it parses a PR URL, fetches metadata (title, head branch, fork info), checks out the PR's branch with remote tracking, and handles cross-repo fork PRs. None of this overlaps with the normal branch-name-from-prompt flow.

V1 does this as a separate `createFromPr` mutation that takes just `{ projectId, prUrl }` and the server does all resolution. V2 should do the same, using Octokit instead of `gh` CLI.

**Not in Phase 1.** For now, when user links a PR, the renderer uses the PR's head branch as `branchName` and PR title as `workspaceName`, then calls the normal `create` endpoint. This creates a worktree on a new local branch — it doesn't check out the actual PR with remote tracking. Good enough for Phase 1, but loses fork PR support and proper remote setup.

Phase 2 adds `workspaceCreation.createFromPr` with full PR checkout semantics.

## 13. Init/setup flow

**Streamlined.** After worktree + cloud row creation, if `runSetupScript` is true, the host-service runs the setup script (`.superset/setup.sh` or equivalent) inside the worktree before returning. No background job manager, no progress events, no separate init system.

Create blocks until setup is done. The workspace is fully ready when the renderer navigates to it.

V1's complexity (workspaceInitManager, initializeWorkspaceWorktree, async AI rename, progress tracking) is unnecessary. The only post-create work is running a shell script in the worktree directory.

If setup scripts turn out to be too slow (>10s), we can split later: return immediately, run setup async, show "running setup..." in the workspace view. But start simple.
