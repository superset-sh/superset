# V2 Workspace Creation — Decisions

Every decision point in the create flow, with rationale.

---

## 1. Where does branch name generation live?

**Decision:** Host-service owns all branch name resolution. Renderer sends raw inputs; server produces the final branch name.

**Rationale:**
- V1 splits this across renderer (AI gen) and server (random fallback + prefix). Two processes each own a piece. When AI fails on the renderer, the server doesn't know AI was attempted — it just sees no branchName and generates a random word pair.
- The host-service has access to the git repo (for deduplication against existing branches), the project config, and the prompt text. It has everything it needs to produce a good name.
- The renderer shouldn't need to know about branch name collisions or prefix rules. It just sends the user's intent.

**What the renderer sends:**
```ts
names: {
    workspaceName: string | undefined,  // only if user explicitly typed one
    branchName: string | undefined,     // only if user explicitly typed one
}
composer: {
    prompt: string | undefined,         // the prompt text (used as naming fallback)
}
```

**What the host-service does with it** (in priority order):

| `branchName` | `prompt` | Result |
|--------------|----------|--------|
| set | any | `sanitize(branchName)` — user was explicit |
| unset | set | `sanitize(prompt)` — derive from prompt slug |
| unset | unset | `workspace-${randomId}` — last resort |

Then deduplicate the result against existing branches in the repo (`-2`, `-3`, etc.).

**What about AI branch name generation?**

Drop the renderer-side AI branch gen entirely for V2. The prompt slug (`sanitizeBranchNameWithMaxLength(prompt)`) produces good-enough branch names like `fix-the-login-bug` without an AI call. V1's AI gen was an optimization that adds 0-30s latency, two code paths (success/failure), and a pending state machine — all for marginally better branch names.

If AI branch naming is wanted later, it should live on the host-service (single owner of branch naming). Not in scope for Phase 1.

**File:** `packages/host-service/src/trpc/router/workspace-creation/workspace-creation.ts`

---

## 2. Where does workspace display name generation live?

**Decision:** Host-service resolves workspace display name. No separate AI auto-rename call.

**What the host-service does:**

| `workspaceName` | `prompt` | `branchName` | Result |
|-----------------|----------|--------------|--------|
| set | any | any | `workspaceName` — user was explicit |
| unset | set | any | `prompt` (truncated to reasonable length) |
| unset | unset | set | `branchName` |
| unset | unset | unset | Same as the resolved branch name |

V1 sets `workspace.name = input.name ?? branch` then does a post-create AI call to auto-rename. This means the user sees the branch string flash, then it changes. V2 just uses the prompt text directly — no flash, no second AI call.

**File:** `packages/host-service/src/trpc/router/workspace-creation/workspace-creation.ts`

---

## 3. When should collision detection run?

**Decision:** Only when the user explicitly provided a branch name.

**Rationale:**
- Auto-generated branch names (from prompt slug or random) are deduplicated against existing branches during generation. They can't collide.
- Collision detection exists to handle the case where the user says "I want branch `feature/auth`" and that branch already has a workspace. The system should open the existing workspace rather than error.
- V1 gates this on `input.branchName?.trim()` which is correct in intent but the condition is fragile — any non-empty branchName triggers it, even AI-generated ones.

**Implementation:**

```ts
const branchWasUserProvided = !!input.names.branchName?.trim();

if (branchWasUserProvided) {
    // Check existing workspace → opened_existing_workspace
    // Check tracked worktree → opened_worktree
    // Check external worktree → adopted_external_worktree
}
// else: branch was auto-generated, skip collision check, always create
```

**File:** `packages/host-service/src/trpc/router/workspace-creation/workspace-creation.ts`

---

## 4. What should happen on collision (existing workspace)?

**Decision:** Open the existing workspace. Show a distinct toast "Opened existing workspace" — not "Workspace created."

**Rationale:**
- V1 silently opens the existing workspace with `wasExisting: true` and the renderer shows "Workspace created" regardless. The user's prompt, attachments, agent selection, and setup toggle are all silently discarded.
- The user needs to know they didn't create something new. A different toast message is the minimum viable signal.
- A confirmation dialog ("This branch already has a workspace. Open it?") would be better UX but is out of scope for Phase 1.

**Implementation:**
- The host-service returns `outcome: "opened_existing_workspace"` (already does this)
- The renderer shows the outcome-specific toast in the `.then()` callback, not via the static `runAsyncAction` success message

**File:** `apps/desktop/src/renderer/.../PromptGroup/PromptGroup.tsx`

---

## 5. Should the renderer still do AI branch name generation?

**Decision:** No. Remove it from V2. The host-service derives branch from prompt slug.

**Rationale:**
- The AI branch gen call goes through `electronTrpc.workspaces.generateBranchName` which requires a V1 local project ID. The V2 modal has a V2 project ID — this call already fails ("Project not found" as seen in the logs).
- Even if it worked, it adds 0-30s latency with a timeout race, a pending state machine phase (`generating-branch`), and a fallback path — all for a marginally better slug.
- `sanitizeBranchNameWithMaxLength("fix the login bug")` produces `fix-the-login-bug` which is perfectly usable.
- If we want AI-quality branch names later, the host-service should own it (single owner, has repo context for deduplication).

**What to remove from renderer:**
- `electronTrpc.workspaces.generateBranchName.useMutation()` call
- `willGenerateAIName` logic
- `"generating-branch"` pending workspace status phase
- The entire 30s `Promise.race` timeout block

**File:** `apps/desktop/src/renderer/.../PromptGroup/PromptGroup.tsx`

---

## 6. Should the renderer close the modal before or after create succeeds?

**Decision:** Close before (fire-and-forget), matching V1 behavior. Show pending workspace in sidebar.

**Rationale:**
- V1 calls `closeAndResetDraft()` immediately after `setPendingWorkspace()`, before the async create resolves (`PromptGroup.tsx:755`). The modal closes, a "pending workspace" skeleton appears in the sidebar, and the create runs in the background.
- A reviewer flagged this as a bug ("if create fails, user loses draft"). But V1 deliberately chose this pattern:
  - The pending workspace UI gives immediate feedback
  - Create failures are rare (the worktree/cloud operations almost always succeed)
  - Keeping the modal open during create (which can take seconds for clone) feels sluggish
- V2 should match V1 here. The `runAsyncAction` pattern already handles this: close modal + show toast.promise.

**What changes:** Nothing — keep the existing `closeAndResetDraft()` before `createWorkspace(...)` pattern.

**File:** `apps/desktop/src/renderer/.../PromptGroup/PromptGroup.tsx`

---

## 7. What pending workspace phases should exist?

**Decision:** Two phases: `preparing` and `creating`. Drop `generating-branch`.

**Rationale:**
- V1 has three phases: `generating-branch` → `preparing` → `creating`
- `generating-branch` only exists because the renderer does AI branch gen (which we're removing)
- `preparing` covers attachment conversion + launch request building
- `creating` covers the host-service API call

**File:** `renderer/stores/new-workspace-modal.ts` (the PendingWorkspace type already supports these)

---

## 8. Where should branch deduplication logic live?

**Decision:** Host-service, inline in the `workspaceCreation.create` mutation.

**Implementation:** After deriving the branch name (from user input, prompt slug, or random), check against existing branches in the repo:

```ts
// Get existing branch names from git
const existingBranchSet = new Set(existingBranches.map(b => b.toLowerCase()));

let finalBranch = candidate;
let suffix = 2;
while (existingBranchSet.has(finalBranch.toLowerCase())) {
    finalBranch = `${candidate}-${suffix}`;
    suffix++;
}
```

This matches V1's `deduplicateBranchName` pattern (`shared/utils/branch.ts:79`) but runs server-side.

**File:** `packages/host-service/src/trpc/router/workspace-creation/workspace-creation.ts`

---

## 9. Where should `sanitizeBranchNameWithMaxLength` live?

**Decision:** Copy the function into the host-service package. Don't add a cross-package dependency.

**Rationale:**
- The function is ~15 lines of pure string manipulation (`shared/utils/branch.ts:13-72`)
- It currently lives in `apps/desktop/src/shared/utils/branch.ts` which is not importable by `packages/host-service`
- Moving it to `@superset/shared` is the right long-term answer but is a larger change (new export, update all importers)
- For Phase 1, copy the three functions: `sanitizeSegment`, `sanitizeBranchName`, `sanitizeBranchNameWithMaxLength`

**File (source):** `apps/desktop/src/shared/utils/branch.ts:13-72`
**File (destination):** `packages/host-service/src/trpc/router/workspace-creation/utils/sanitize-branch.ts` (new)

---

## 10. What should the host-service input schema look like?

**Decision:** Keep current schema minus `launch` (removed in a previous commit). Add nothing new.

```ts
workspaceCreation.create({
    projectId: string,
    source: "prompt" | "pull-request" | "branch" | "issue",
    names: {
        workspaceName?: string,   // explicit user-typed name
        branchName?: string,      // explicit user-typed branch
    },
    composer: {
        prompt?: string,          // used for branch + workspace name derivation
        compareBaseBranch?: string,
        runSetupScript?: boolean,
    },
    linkedContext?: {
        internalIssueIds?: string[],
        githubIssueUrls?: string[],
        linkedPrUrl?: string,
        attachments?: Array<{ data, mediaType, filename? }>,
    },
    behavior?: {
        onExistingWorkspace?: "open" | "error",
        onExistingWorktree?: "adopt" | "error",
    },
})
```

No changes needed to the schema. The host-service just needs to USE `composer.prompt` for name derivation (Fix 1 in v2-create-fix-plan.md), which it currently ignores.

---

## 11. What should the return shape look like?

**Decision:** Keep current return shape. Add `wasAutoGenerated` flag for client toast logic.

```ts
{
    outcome: "created_workspace" | "opened_existing_workspace" | "opened_worktree" | "adopted_external_worktree",
    workspace: { id, branch, ... },
    warnings: string[],
}
```

The renderer uses `outcome` to decide the toast message. No other changes needed.

---

## 12. What about the V1 `createFromPr` path?

**Decision:** Handled by the same `workspaceCreation.create` endpoint with `source: "pull-request"` and `linkedContext.linkedPrUrl` set.

The host-service resolves the PR's head branch and uses it as the branch name. The workspace name comes from the PR title (fetched via Octokit). This is future work — for now, `source: "pull-request"` is accepted but doesn't trigger special PR resolution. The linked PR URL is stored but not dereferenced server-side.

**File:** `packages/host-service/src/trpc/router/workspace-creation/workspace-creation.ts`

---

## 13. What about the V1 init/setup flow?

**Decision:** Out of scope for Phase 1. The host-service creates the worktree and cloud row. Setup script execution and agent launch are Phase 2.

V1's `workspaceInitManager.startJob` + `initializeWorkspaceWorktree` run after create to:
1. `git worktree add` (already in V2)
2. Run setup scripts (`.superset/setup.sh`)
3. Auto-rename workspace from prompt
4. Launch agent if configured

V2 Phase 1 does step 1 only. Steps 2-4 are deferred.

---

## Summary of what changes in code

| File | Change |
|------|--------|
| `workspace-creation.ts` | Branch name from prompt slug + dedup. Workspace name from prompt. Collision check only on explicit branch. Add `sanitizeBranch` util. |
| `PromptGroup.tsx` | Remove AI branch gen. Remove `generating-branch` phase. Toast per outcome. |
| New: `workspace-creation/utils/sanitize-branch.ts` | Copied branch sanitization functions |
