# V1 Workspace Creation — Full Business Logic Reference

This documents the end-to-end V1 workspace creation flow with code references.

## Renderer: `PromptGroup.handleCreate`

**File:** `apps/desktop/src/renderer/components/NewWorkspaceModal/components/PromptGroup/PromptGroup.tsx:729-1019`

### 1. Resolve display name (for pending workspace UI)

```
displayName = (workspaceNameEdited && workspaceName.trim())
    ? workspaceName.trim()
    : trimmedPrompt || "New workspace"
```
*Line 740-743*

### 2. AI branch name generation (renderer-side, pre-submit)

Only runs when: `!branchNameEdited && !!trimmedPrompt && !linkedPR`

Calls `electronTrpc.workspaces.generateBranchName.mutateAsync({ prompt, projectId })` with a 30s timeout race. If it fails, it falls back — the server will generate a random branch name later.

*Lines 758-806*

### 3. Submit to V1 electronTrpc

Calls `createWorkspace.mutateAsyncWithPendingSetup(input, overrides)` where input is:

```ts
{
    projectId,
    name: (workspaceNameEdited && workspaceName.trim()) ? workspaceName.trim() : undefined,
    prompt: trimmedPrompt || undefined,
    branchName: (branchNameEdited ? sanitized(branchName) : aiBranchName) || undefined,
    compareBaseBranch: compareBaseBranch || undefined,
}
```
*Lines 981-1001*

**Key**: `name` and `branchName` can both be `undefined`. The SERVER handles naming fallbacks, not the renderer.

---

## Server: `workspaces.create` mutation

**File:** `apps/desktop/src/lib/trpc/routers/workspaces/procedures/create.ts:261-541`

### Input shape
```ts
{ projectId, name?, prompt?, branchName?, compareBaseBranch?, sourceWorkspaceId?, useExistingBranch?, applyPrefix? }
```
*Lines 263-274*

### Step 1: Resolve branch prefix
If `applyPrefix` (default true), calls `resolveBranchPrefix(project, existingBranches)` which reads git author config + project prefix settings.

*Lines 345-359*

### Step 2: Resolve branch name — THREE PATHS

**Path A** — `useExistingBranch === true`: uses `input.branchName` as-is; verifies it exists; errors if not.
*Lines 362-368*

**Path B** — `input.branchName?.trim()`: sanitizes + applies prefix.
```
branch = sanitizeBranchNameWithMaxLength(withPrefix(input.branchName))
```
*Lines 369-374*

**Path C** — neither provided: generates a random friendly name.
```
branch = generateBranchName({ existingBranches, authorPrefix: branchPrefix })
```
Uses `friendly-words` to generate `adjective-noun` combos, deduplicates against existing branches.
*Lines 376-380*

**File:** `apps/desktop/src/lib/trpc/routers/workspaces/utils/git.ts:495-530`

### Step 3: Collision detection — only when `input.branchName?.trim()` was provided

Checks for existing workspace on that branch:

**3a. Active workspace exists** → returns `{ wasExisting: true, workspace }`. No new workspace created.
*Lines 382-399*

**3b. Orphaned worktree exists** (tracked in DB, no workspace) → creates workspace from worktree.
*Lines 401-442*

**3c. External worktree exists** (exists on disk, not tracked in DB) → calls `createWorkspaceFromExternalWorktree`.
*Lines 444-455*

**If no collision** → proceeds to step 4.

### Step 4: Create worktree + workspace

1. Resolves worktree path: `resolveWorktreePath(project, branch)`
2. Resolves base branch: `resolveWorkspaceBaseBranch({...})`
3. Inserts worktree row into local DB
4. Inserts workspace row into local DB with `name: input.name ?? branch`
5. Sets as last active workspace
6. Starts init job: `workspaceInitManager.startJob(...)` + `initializeWorkspaceWorktree(...)`
7. Returns `{ workspace, initialCommands, isInitializing: true, wasExisting: false }`

*Lines 457-541*

---

## Key differences from our V2 `workspaceCreation.create`

| Aspect | V1 | V2 (current) |
|--------|----|--------------|
| **Branch name when both names are empty** | Server-side random `adjective-noun` via `generateBranchName()` | Falls back to literal `"workspace"` |
| **Branch name when only prompt provided** | Client-side AI generation → server random fallback | Client-side AI generation → `undefined` → literal `"workspace"` |
| **Collision detection** | Only checks when `input.branchName` was explicitly set | Always checks (the `"workspace"` fallback collides instantly) |
| **Collision behavior** | Returns existing workspace with `wasExisting: true` (no toast confusion) | Returns `opened_existing_workspace` but shows "Workspace created" toast |
| **Workspace name** | `input.name ?? branch` (branch is always unique) | `input.workspaceName ?? input.branchName ?? "workspace"` (can be "workspace") |
| **Init/setup** | Runs `workspaceInitManager.startJob` + `initializeWorkspaceWorktree` in local electron process | No init flow — just creates worktree + cloud row |

## What V2 needs to fix

1. **Never fall back to literal `"workspace"`** — generate a unique branch name server-side (random or from prompt slug) when none is provided
2. **Pass `prompt` to the host-service** — so the server can derive a name from the prompt slug if needed, matching V1's `name: input.name ?? branch` pattern
3. **Don't check for collisions on auto-generated names** — V1 only does collision check when the user explicitly set a branch name (`input.branchName?.trim()`). Auto-generated names are already unique.
4. **Toast should say "Opened existing workspace"** when `wasExisting` / `opened_existing_workspace`
