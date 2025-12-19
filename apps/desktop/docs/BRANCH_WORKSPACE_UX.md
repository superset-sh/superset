# Branch Workspace UX Design

Summary of UX patterns from PR #359 (efficient-haddock-4249d8) for non-worktree branch workspaces.

## Core Concept

Two workspace types:
1. **Worktree Workspaces** (`type: "worktree"`): Each has its own isolated directory via git worktrees. Multiple can exist per project.
2. **Branch Workspaces** (`type: "branch"`): Uses the main repo path directly. Only **one per project** (they share the same directory, so switching branches affects all).

## Key UX Decisions

### 1. One Branch Workspace Per Project

Since branch workspaces share the main repo path, switching branches in one would affect all. The solution:
- Only allow **one branch workspace per project** at a time
- When user selects a different branch, **switch** the existing branch workspace (don't create new)
- This prevents confusion from having multiple tabs pointing at the same directory with different branch expectations

### 2. Main Terminal on Project Open

When opening a project without existing workspaces:
- Auto-create a branch workspace for the current branch (main/master)
- This provides immediate access to the main repo terminal
- Users can then create worktrees from this starting point

### 3. Terminology: "Close" vs "Delete"

| Workspace Type | Action | What Happens |
|---------------|--------|--------------|
| **Branch** | "Close" | Removes tab, kills terminals. Branch & commits stay in repo. Non-destructive. |
| **Worktree** | "Delete" | Removes worktree directory, deletes branch. Destructive with warnings. |

### 4. Branch Switching UI

From the workspace dropdown:
- Show list of project branches (local + remote, deduplicated)
- Main/master branches sorted to top with "default" label
- Active branch shows checkmark
- Branches with worktree workspaces show small indicator dot
- Search filter for many branches

### 5. Visual Differentiation

Branch workspaces show a code bracket icon (`HiOutlineCodeBracketSquare`) to differentiate from worktree workspaces.

### 6. Safety Checks for Branch Switching

Before switching branches:
1. Check for uncommitted changes (staged/unstaged)
2. Check for untracked files that might be overwritten
3. Fetch and prune stale remote refs
4. Verify checkout landed on correct branch

### 7. Terminal Prompt Refresh

After switching branches, send newline to all workspace terminals to refresh their prompts (so they show the new branch name).

## Schema Changes

```typescript
export type WorkspaceType = "worktree" | "branch";

export interface Workspace {
  id: string;
  projectId: string;
  worktreeId?: string;     // Only set for type="worktree"
  type: WorkspaceType;     // NEW: workspace type
  branch: string;          // NEW: current branch name
  name: string;            // User-customizable alias
  tabOrder: number;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
}
```

## Backend Procedures

### New Procedures

1. **`createBranchWorkspace`**
   - Input: `{ projectId, branch, name? }`
   - Creates workspace pointing at main repo path
   - Performs safe checkout to target branch
   - Enforces one-branch-workspace-per-project rule

2. **`getBranches`**
   - Input: `{ projectId, fetch? }`
   - Returns `{ local: string[], remote: string[] }`
   - Optionally fetches/prunes remote refs first

3. **`switchBranchWorkspace`**
   - Input: `{ projectId, branch }`
   - Finds existing branch workspace, switches its branch
   - Refreshes terminal prompts
   - Preserves custom workspace name (alias)

### Modified Procedures

- **`getAllGrouped`**: Include `type` and `branch` in workspace data
- **`getActive`**: Include `type` and `branch`
- **`delete`**: Handle branch workspaces (no worktree removal needed)
- **`canDelete`**: Skip git status checks for branch workspaces

## Git Utilities

```typescript
// List all branches (local + remote)
listBranches(repoPath, { fetch?: boolean }): Promise<{ local: string[], remote: string[] }>

// Safe checkout with pre-flight checks
safeCheckoutBranch(repoPath, branch): Promise<void>

// Get current branch name
getCurrentBranch(repoPath): Promise<string | null>

// Pre-checkout safety check
checkBranchCheckoutSafety(repoPath): Promise<CheckoutSafetyResult>
```

## UI Components

### WorkspaceDropdown Changes
- Add "Branches in {project}" section
- Show branch list with search
- Handle branch click: switch or activate existing workspace

### WorkspaceItem Changes
- Accept `workspaceType` prop
- Show branch icon for branch workspaces
- Use "Close" action for branch workspaces (vs "Delete")

### DeleteWorkspaceDialog Changes
- Accept `workspaceType` prop
- Contextual title: "Close Workspace" vs "Delete Workspace"
- Contextual description explaining impact
- Non-destructive styling for branch workspace close

### AddBranchDialog (New)
- Modal to select branch from list
- Search/filter branches
- Create branch workspace on selection

## Workspace Path Resolution

```typescript
function getWorkspacePath(workspace: Workspace): string | null {
  if (workspace.type === "branch") {
    const project = db.data.projects.find(p => p.id === workspace.projectId);
    return project?.mainRepoPath ?? null;
  }
  // For worktree type, use worktree path
  const worktree = db.data.worktrees.find(wt => wt.id === workspace.worktreeId);
  return worktree?.path ?? null;
}
```

## Migration Considerations

Existing workspaces need:
1. Add `type: "worktree"` (default for existing)
2. Add `branch` field (copy from associated worktree)

```typescript
// DB migration in index.ts
if (!workspace.type) {
  workspace.type = "worktree";
}
if (!workspace.branch && workspace.worktreeId) {
  const worktree = db.data.worktrees.find(wt => wt.id === workspace.worktreeId);
  workspace.branch = worktree?.branch ?? "";
}
```
