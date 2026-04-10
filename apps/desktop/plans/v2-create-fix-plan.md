# V2 Workspace Creation — Fix Plan

Addresses the gaps identified in `v1-workspace-creation-logic.md`.

## Problem

When the user types a prompt and hits create, both `workspaceName` and `branchName` arrive at the host-service as `undefined`. The host-service falls back to the literal string `"workspace"` for both. On second create it finds an existing workspace on the `"workspace"` branch and returns `opened_existing_workspace` — but the toast still says "Workspace created."

V1 never has this problem because the server generates a unique random branch name when none is provided.

## Root cause

**Renderer** (`PromptGroup.tsx:714-719`): passes `branchName: resolvedBranchName` where `resolvedBranchName` is only set when:
- User manually typed a branch name (`branchNameEdited === true`), OR
- AI generation succeeded (`aiBranchName !== null`)

If neither → `undefined`.

**Host-service** (`workspace-creation.ts:270-273`): falls back to literal `"workspace"`:
```ts
const branchName = input.names.branchName || input.names.workspaceName || "workspace";
```

**V1 server** (`create.ts:376-380`): generates a unique `adjective-noun` random name:
```ts
branch = generateBranchName({ existingBranches, authorPrefix: branchPrefix });
```
This uses `friendly-words` and deduplicates against existing branches. Every create gets a unique branch — no collisions.

## Fixes

### Fix 1: Host-service generates unique branch name when none provided

**File:** `packages/host-service/src/trpc/router/workspace-creation/workspace-creation.ts`

When `input.names.branchName` is not set:
1. If `input.composer.prompt` is set → derive branch from prompt slug via `sanitizeBranchNameWithMaxLength(prompt)`. This is what the renderer's `branchPreview` does for the UI but never sends.
2. If prompt slug is also empty → generate a random unique name (UUID-based or `crypto.randomUUID().slice(0, 8)` — simple, no `friendly-words` dependency in host-service).
3. Deduplicate: if the derived name collides with an existing branch in the repo, append `-2`, `-3`, etc. Reuse the `deduplicateBranchName` pattern from `shared/utils/branch.ts:79`.

```ts
// Pseudocode for the fix
let branchName: string;
if (input.names.branchName?.trim()) {
    branchName = input.names.branchName.trim();
} else if (input.composer.prompt?.trim()) {
    branchName = sanitizeBranchNameWithMaxLength(input.composer.prompt.trim());
} else {
    branchName = `workspace-${crypto.randomUUID().slice(0, 8)}`;
}
// Deduplicate against existing branches in the repo
branchName = deduplicateBranchName(branchName, existingBranchNames);
```

**Dependency:** `sanitizeBranchNameWithMaxLength` lives in `apps/desktop/src/shared/utils/branch.ts`. It's not in a shared package the host-service can import. Two options:
- (a) Copy the function into host-service (it's ~15 lines, pure string manipulation)
- (b) Move it to `@superset/shared` package

Option (a) is faster. The function is:
```ts
function sanitizeBranchNameWithMaxLength(name, maxLength = 100, options?) {
    return truncateBranchName(sanitizeBranchName(name, options), maxLength);
}
```
Where `sanitizeBranchName` splits on `/`, sanitizes each segment (lowercase, strip special chars, collapse dots/dashes), and rejoins. `truncateBranchName` slices to max length.

**Reference:** `apps/desktop/src/shared/utils/branch.ts:13-72`

### Fix 2: Workspace name defaults to branch name, not "workspace"

**File:** `packages/host-service/src/trpc/router/workspace-creation/workspace-creation.ts`

After branch name is resolved:
```ts
const workspaceName = input.names.workspaceName?.trim()
    || input.composer.prompt?.trim()
    || branchName;  // branch is already unique
```

This matches V1's `name: input.name ?? branch` pattern (`create.ts:489`).

### Fix 3: Only check for existing workspace when branch was explicitly provided

**File:** `packages/host-service/src/trpc/router/workspace-creation/workspace-creation.ts`

V1 only runs collision detection (existing workspace / orphaned worktree / external worktree) when `input.branchName?.trim()` was explicitly provided by the user (`create.ts:382`). Auto-generated branch names are already unique so collision check is skipped.

Current V2 code always checks. Fix:

```ts
const branchWasExplicit = !!input.names.branchName?.trim();

// Only check for collisions on explicitly-set branch names
if (branchWasExplicit) {
    // existing workspace check → opened_existing_workspace
    // tracked worktree check → opened_worktree
    // external worktree check → adopted_external_worktree
}

// Always proceed to create for auto-generated names
```

This means the "opened_existing_workspace" outcome is only possible when the user deliberately chose a branch that already has a workspace — which is the correct semantics.

### Fix 4: Pass `prompt` through to host-service

**File:** `packages/host-service/src/trpc/router/workspace-creation/workspace-creation.ts` (already in schema as `composer.prompt`)

`input.composer.prompt` is already in the schema and passed by the renderer. Fix 1 uses it for branch name derivation. No schema change needed.

### Fix 5: Toast reflects outcome

**File:** `apps/desktop/src/renderer/routes/.../PromptGroup/PromptGroup.tsx`

The `runAsyncAction` messages field is a static string. To show different toasts per outcome, handle it in the `.then()` callback instead of relying on `toast.promise`:

```ts
createWorkspace({...}).then((result) => {
    if (result.outcome === "opened_existing_workspace") {
        toast.info("Opened existing workspace");
    } else if (result.outcome === "opened_worktree") {
        toast.info("Opened worktree");
    } else {
        toast.success("Workspace created");
    }
    // navigate...
});
```

This means NOT using `runAsyncAction` for the success toast — let the `.then()` handle it. `runAsyncAction` still handles the loading + error toasts.

Or simpler: pass `{ closeAndReset: false }` to `runAsyncAction` and handle all toasts manually in `.then()` / `.catch()`.

## Files to change

| File | Change |
|------|--------|
| `packages/host-service/src/trpc/router/workspace-creation/workspace-creation.ts` | Fix 1 (branch gen), Fix 2 (name default), Fix 3 (collision gate) |
| `apps/desktop/src/renderer/.../PromptGroup/PromptGroup.tsx` | Fix 5 (toast outcome) |

## Verification

1. Create workspace with only a prompt (no name, no branch) → unique branch derived from prompt slug, not "workspace"
2. Create workspace with no prompt, no name, no branch → random unique branch, not "workspace"
3. Create two workspaces in a row with the same prompt → second one gets a deduplicated branch name, not "opened existing"
4. Create workspace with explicit branch name that already exists → correctly shows "Opened existing workspace"
5. Toast message matches the actual outcome in all cases
