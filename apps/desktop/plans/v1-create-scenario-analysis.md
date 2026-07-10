# V1 Workspace Creation — Scenario Analysis

Walks through every user scenario in the V1 create flow. Identifies what works, what's wrong, and what V2 should do differently.

---

## Scenario 1: Prompt only (most common)

**User action:** Types "fix the login bug", hits Cmd+Enter. No workspace name, no branch name.

**Renderer** (`PromptGroup.tsx:740-806`):
1. `displayName = "fix the login bug"` (from `trimmedPrompt`)
2. `willGenerateAIName = true` (no branchNameEdited, has prompt, no PR)
3. Shows pending workspace with "generating-branch" status
4. Calls `generateBranchNameMutation.mutateAsync({ prompt, projectId })` with 30s timeout
5. **AI succeeds** → `aiBranchName = "fix-login-bug"`
6. Sends to server: `{ name: undefined, prompt: "fix the login bug", branchName: "fix-login-bug" }`

**Server** (`create.ts:369-374`):
1. `input.branchName` is set → `branch = sanitizeBranchNameWithMaxLength(withPrefix("fix-login-bug"))` → e.g. `"kiet/fix-login-bug"`
2. Collision check runs (line 382): `input.branchName?.trim()` is truthy
3. No existing workspace on that branch → creates new worktree + workspace
4. `workspace.name = input.name ?? branch = "kiet/fix-login-bug"` (since `name` is undefined)
5. `isUnnamed: true`

**Post-create** (`useCreateWorkspace.ts:79-100`):
1. `wasExisting = false` → sets up pending terminal, runs setup script
2. Navigates to workspace

**UX issues:**
- ✅ Works well when AI succeeds
- ❌ **Workspace name becomes the branch name** (`"kiet/fix-login-bug"`) because `input.name` was undefined. User sees a slash-separated branch string as their workspace title instead of their prompt.
- The `isUnnamed: true` flag triggers a post-create auto-rename via `attemptWorkspaceAutoRenameFromPrompt` in `initializeWorkspaceWorktree` (`create.ts:523`), which is ANOTHER AI call. So there are TWO serial AI calls: one for branch name, one for workspace display name.

---

## Scenario 2: Prompt only, AI branch gen fails

**User action:** Same as Scenario 1 but AI times out or auth fails.

**Renderer** (`PromptGroup.tsx:780-806`):
1. Catches error, shows `"Using random branch name"` toast
2. `aiBranchName = null`
3. Sends to server: `{ name: undefined, prompt: "fix the login bug", branchName: undefined }`

**Server** (`create.ts:376-380`):
1. `input.branchName` is undefined → hits the `else` branch
2. `branch = generateBranchName({ existingBranches, authorPrefix })` → e.g. `"kiet/cheerful-umbrella"`
3. Collision check at line 382: `input.branchName?.trim()` is **falsy** → **collision check SKIPPED entirely**
4. Creates new worktree + workspace
5. `workspace.name = "kiet/cheerful-umbrella"`

**UX issues:**
- ✅ Always creates a new workspace (random name can't collide)
- ❌ Workspace name is `"kiet/cheerful-umbrella"` — meaningless to the user
- ❌ Post-create auto-rename (another AI call) may also fail, leaving the random name permanently

---

## Scenario 3: Explicit workspace name, no branch name

**User action:** Types workspace name "Login Fix", types prompt, no branch name.

**Renderer** (`PromptGroup.tsx:984-989`):
1. `workspaceNameEdited = true`, `workspaceName = "Login Fix"`
2. `branchNameEdited = false`
3. AI branch gen runs (same as Scenario 1)
4. Sends: `{ name: "Login Fix", prompt: "...", branchName: "fix-login-bug" }`

**Server**:
1. Branch from AI name → `"kiet/fix-login-bug"`
2. Collision check runs (branchName was set)
3. Creates workspace with `name: "Login Fix"` (input.name is set)
4. `isUnnamed: false`

**UX:** ✅ Works correctly. User sees "Login Fix" as workspace name.

---

## Scenario 4: Explicit branch name, no workspace name

**User action:** Types branch name "feature/auth-fix" in the branch input, types prompt.

**Renderer** (`PromptGroup.tsx:990-999`):
1. `branchNameEdited = true`, `branchName = "feature/auth-fix"`
2. `willGenerateAIName = false` (branchNameEdited is true)
3. AI branch gen does NOT run
4. Sends: `{ name: undefined, prompt: "...", branchName: "feature/auth-fix" }`

**Server** (`create.ts:369-374`):
1. `branch = sanitizeBranchNameWithMaxLength(withPrefix("feature/auth-fix"))` → `"kiet/feature/auth-fix"`
2. Collision check runs (branchName was set)
3. If branch already has a workspace → returns `{ wasExisting: true }`, navigates to existing
4. If no collision → creates new, `workspace.name = "kiet/feature/auth-fix"`, `isUnnamed: true`

**UX issues:**
- ❌ Collision check fires because `input.branchName?.trim()` is truthy — **even though the user might not intend to open an existing workspace**. They typed a branch name for a NEW workspace and it silently opens something else.
- ❌ Workspace name is the prefixed branch string, not the prompt
- ❌ No user confirmation: "This branch already has a workspace, open it?" — just silently navigates

---

## Scenario 5: No prompt, no name, no branch (empty create)

**User action:** Hits Cmd+Enter with nothing filled in.

**Renderer** (`PromptGroup.tsx:740-746`):
1. `displayName = "New workspace"`
2. `willGenerateAIName = false` (no trimmedPrompt)
3. No AI branch gen
4. Sends: `{ name: undefined, prompt: undefined, branchName: undefined }`

**Server** (`create.ts:376-380`):
1. All undefined → `branch = generateBranchName(...)` → random `"kiet/cheerful-umbrella"`
2. Collision check skipped (branchName wasn't set)
3. Creates workspace with `name: "kiet/cheerful-umbrella"`, `isUnnamed: true`

**UX issues:**
- ✅ Always works (random name)
- ❌ Meaningless workspace name
- ❌ Post-create rename has no prompt to derive from, so the auto-rename AI call has nothing to work with → stays as random name

---

## Scenario 6: PR link (create from PR)

**User action:** Links a PR, types a prompt, hits create.

**Renderer** (`PromptGroup.tsx:960-978`):
1. `linkedPR` is set → takes a completely different code path
2. Calls `createFromPr.mutateAsyncWithSetup({ projectId, prUrl }, launchRequest)`
3. Does NOT call `createWorkspace` at all

**V1 `createFromPr`** (`useCreateFromPr.ts`):
1. Calls `electronTrpc.workspaces.createFromPr.mutateAsync({ projectId, prUrl })`
2. Server clones the PR's head branch, creates worktree
3. Workspace name = PR title
4. Branch name = PR head branch

**UX:** ✅ Works well. PR provides all naming context.

---

## Scenario 7: Branch selected from base-branch picker, then create

**User action:** Opens base-branch picker, selects `feature/existing`, then hits create with a prompt.

**Renderer**: 
1. `compareBaseBranch = "feature/existing"` is set
2. This is the BASE branch (what the new branch forks from), NOT the workspace branch
3. AI branch gen runs normally, creates a new branch from `feature/existing`

**UX:** ✅ Works correctly. The base-branch picker only sets the fork point.

---

## Scenario 8: Branch selected from base-branch picker, "Open" action on existing workspace

**User action:** Opens base-branch picker, sees a branch with an active workspace, clicks "Open".

**Renderer** (`PromptGroup.tsx:1111-1117`):
1. Calls `handleOpenActiveWorkspace(workspaceId)`
2. Closes modal, navigates to existing workspace
3. Does NOT call create at all

**UX:** ✅ Works correctly. Clear intent from user action.

---

## Summary of V1 issues

### Naming
1. **Workspace display name is the branch name when user didn't type a name.** The user typed a prompt but the workspace gets named `"kiet/fix-login-bug"` or `"kiet/cheerful-umbrella"` instead of their prompt or a human-friendly derivative.
2. **Two serial AI calls** — one for branch name (renderer), one for auto-rename (server). Both can fail independently, and the auto-rename runs after create, so the user sees the branch name flash then change.
3. **Random names are meaningless** when AI fails — `"cheerful-umbrella"` tells you nothing about the workspace.

### Collision behavior
4. **Silent open on branch collision** — when user types a branch name that already has a workspace, V1 silently navigates to the existing one with `wasExisting: true` and toast still says "Workspace created." No confirmation dialog, no visual indication that the user's prompt/attachments/agent selection were all ignored.
5. **Collision check gate is fragile** — it's based on `input.branchName?.trim()`, which means collision check only runs for user-typed branch names. But the USER might have typed a branch name intending to create a new workspace on that branch. The condition conflates "user provided a name" with "check for collisions."

### Architecture
6. **Branch name generation split across renderer + server** — the renderer does AI generation, the server does random fallback. The server also does prefix application. Two different processes own parts of the branch name logic, making it hard to reason about what name you'll get.
7. **`useExistingBranch` boolean is a separate code path** — adds complexity to the input schema and collision logic for what could be a single `behavior.onExistingBranch: "use" | "error"` flag.
8. **`sourceWorkspaceId` adds another code path** for forking from an existing workspace's branch — but none of this is exercised by the modal UI. It's dead surface area in the create endpoint.

---

## What V2 should do differently

| V1 problem | V2 approach |
|------------|-------------|
| Workspace name = branch name | `workspaceName = input.prompt \|\| branchName` — prompt is always preferred for display name |
| Two serial AI calls | Single AI call (renderer) for branch name; workspace display name derived from prompt synchronously (no second AI call) |
| Silent open on collision | When branch collision detected and user provided explicit branch: return `opened_existing_workspace` outcome + renderer shows distinct toast "Opened existing workspace" (not "Workspace created") |
| Random names when AI fails | Derive from prompt slug (`sanitizeBranchNameWithMaxLength(prompt)`) before falling back to random. Random is last resort, not first fallback. |
| Collision check gate tied to `input.branchName` | Gate on a semantic flag: was the branch name auto-generated or user-provided? Only run collision check on user-provided names. |
| Branch name logic split renderer/server | Server owns all branch name resolution. Renderer sends `prompt` + optional `branchName`. Server derives branch from prompt, applies deduplication, skips collision check on auto-generated names. |
| `useExistingBranch` / `sourceWorkspaceId` dead paths | Not in V2 schema. Single `behavior.onExistingWorkspace` / `behavior.onExistingWorktree` flags. |
