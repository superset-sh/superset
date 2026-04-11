# V2 Workspace Creation Modal — Gap Analysis vs V1

> Generated 2026-04-11. Compares V2 (`DashboardNewWorkspaceModal`) against V1 (`NewWorkspaceModal`).

## File References

| | Path |
|---|---|
| **V1 PromptGroup** | `src/renderer/components/NewWorkspaceModal/components/PromptGroup/PromptGroup.tsx` |
| **V2 PromptGroup** | `src/renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/PromptGroup/PromptGroup.tsx` |
| **V2 Submit Hook** | `…/PromptGroup/hooks/useSubmitWorkspace/useSubmitWorkspace.ts` |
| **V2 Draft Context** | `…/DashboardNewWorkspaceModal/DashboardNewWorkspaceDraftContext.tsx` |

---

## Gaps

### 1. Project Picker — "Open project" / "New project" actions

**V1**: Project picker includes a separator and two extra items — "Open project" (`onImportRepo`) and "New project" (`onNewProject`).

**V2**: Only lists existing projects with search. No way to import a repo or create a new project from within the modal.

**V1 ref**: `PromptGroup.tsx:246-268`
**V2 ref**: `ProjectPickerPill.tsx` (entire file)

---

### 2. Branch Picker — Worktree awareness and Open/Create actions

**V1** has a fully worktree-aware branch picker (`CompareBaseBranchPickerInline`) with:
- All / Worktrees filter toggle (tabs with counts)
- Differentiated icons: local branch, remote branch, openable worktree, active workspace
- "external" badge for external worktrees
- Active workspace detection with `GoArrowUpRight` icon
- Hover actions: "Open" button to navigate to existing workspace/worktree, "Create" button to create alongside an existing one
- Keyboard hint labels (Enter / Cmd+Enter)

**V2** has a simplified `CompareBaseBranchPicker` — flat list of branches with `GoGitBranch` icons, "default" and "workspace" badges. No open/create actions, no worktree filter toggle, no differentiated icons.

**V1 ref**: `PromptGroup.tsx:275-530` (`CompareBaseBranchPickerInline`)
**V2 ref**: `CompareBaseBranchPicker/CompareBaseBranchPicker.tsx`

---

### 3. AI Branch Name Generation

**V1**: On submit, calls `electronTrpc.workspaces.generateBranchName.mutateAsync()` with a 30-second timeout. Falls back to random name on timeout/failure with toast feedback. Shows "generating-branch" pending status.

**V2**: `resolveNames()` resolves names synchronously. No AI generation call.

**V1 ref**: `PromptGroup.tsx:600-608, 759-809`
**V2 ref**: `useSubmitWorkspace.ts` → `resolveNames()`

---

### 4. GitHub Issue Content Auto-Fetching

**V1**: On submit, fetches full GitHub issue content via `projects.getIssueContent.query()`, sanitizes it (HTML entity escaping, URL validation, 50KB body limit), converts to markdown, and attaches as file attachments alongside user-uploaded files.

**V2**: Only sends `githubIssueUrls` as string URLs in `linkedContext`. Does not fetch or attach issue content.

**V1 ref**: `PromptGroup.tsx:832-943`
**V2 ref**: `useSubmitWorkspace.ts` → `mapLinkedContext()`

---

### 5. Agent Launch Request Building

**V1**: Builds a full `AgentLaunchRequest` via `buildPromptAgentLaunchRequest()` with agent config, prompt, converted files, and task slug. Passes this to `createWorkspace.mutateAsyncWithPendingSetup()`.

**V2**: No `AgentLaunchRequest` is built. The prompt is sent as part of `composer` but agent config resolution, file bundling, and task slug mapping are missing.

**V1 ref**: `PromptGroup.tsx:695-708, 945-959`
**V2 ref**: `useSubmitWorkspace.ts:96-110`

---

### 6. Dedicated "Create from PR" Flow

**V1**: When a PR is linked, submit uses a separate code path — `createFromPr.mutateAsyncWithSetup()` — that creates the workspace from the PR's branch and metadata.

**V2**: Sends `linkedPrUrl` as part of `linkedContext`. The PR is treated as context rather than driving branch creation. No separate mutation.

**V1 ref**: `PromptGroup.tsx:963-982`
**V2 ref**: `useSubmitWorkspace.ts:79` → `mapLinkedContext()`

---

### 7. PR URL Parsing and Cross-Repo Validation

**V1**: `PRLinkCommand` parses pasted GitHub PR URLs (`github.com/:owner/:repo/pull/:number`), detects cross-repository links, and shows an error ("PR URL must match {repo}") for mismatched repos.

**V2**: `PRLinkCommand` uses host-service `searchPullRequests` endpoint only. No client-side URL parsing or cross-repo validation.

**V1 ref**: `PRLinkCommand.tsx:37-53, 86-97`
**V2 ref**: `PRLinkCommand.tsx` (V2 version)

---

## Not a Gap (V2 advantage)

**Branch name preview**: V2 shows a live `branchPreview` in the branch name input placeholder using `slugifyForBranch(trimmedPrompt)`. V1 shows a static `"branch name"` placeholder. V2 is better here.

---

## Priority Assessment

| # | Gap | Impact | Effort |
|---|-----|--------|--------|
| 5 | Agent launch request building | High — agents won't receive full config/prompt/files | Medium |
| 3 | AI branch name generation | High — branch names won't be meaningful | Low |
| 4 | GitHub issue content fetching | Medium — issues linked as URLs only, not rich context | Medium |
| 6 | Dedicated "create from PR" flow | Medium — PR workspaces may not set up branches properly | Medium |
| 2 | Branch picker worktree awareness | Medium — can't discover/open existing worktrees | High |
| 1 | Project picker open/new actions | Low — can do this outside the modal | Low |
| 7 | PR URL parsing / cross-repo validation | Low — server search covers most cases | Low |
