# Branch Workspace Improvements

Potential improvements identified during code review. Create Linear tickets as needed.

## Medium Priority

### 1. Cache `hasOrigin` at project level
**Location**: `workspaces.ts:460`, `projects.ts`

Currently `hasOriginRemote()` is called on every `getActive` poll until base branch detection completes. Cache this at the project level in the database to avoid repeated git calls.

### 2. Race condition in worktree creation
**Location**: `workspaces.ts:78-86`

The branch existence check and the actual worktree creation are not atomic. If a branch is deleted between the check and use, it fails with a generic git error. Consider:
- Wrapping in a retry with exponential backoff
- Catching the specific git error and providing a clear message

### 3. `getDefaultBranch` for local repos uses current branch
**Location**: `git.ts:287-306`

For repos without a remote, `getDefaultBranch` returns the current branch. If the user is on a feature branch, that becomes the "default" for new worktrees, which may not be intended. Consider always preferring `main`/`master` if they exist locally.

### 4. Disable Create button when no branches available
**Location**: `NewWorkspaceModal.tsx`

If `getBranches` returns an empty array (e.g., new repo with no commits), the Create button is still enabled. Should be disabled with a helpful message.

## Low Priority

### 5. Rename `fetch` parameter to `gitFetch`
**Location**: `workspaces.ts` - `getBranches` procedure

The `fetch` parameter controls whether to run `git fetch`, but could be confused with React Query's fetch behavior. Rename to `gitFetch` or `refreshRemote` for clarity.

### 6. Extract magic numbers to constants
**Location**: `WorkspaceHeader.tsx`

Values like `max-w-[480px]`, `h-[22px]`, `max-w-[180px]` should be design tokens or named constants.

### 7. Lazy compute branch arrays
**Location**: `projects.ts:185-196`

`localBranches` and `remoteBranches` arrays are always built but only used in the fallback path. Could be computed lazily for minor perf improvement.

### 8. Add loading skeleton to base branch picker
**Location**: `NewWorkspaceModal.tsx`

Currently shows a disabled button while branches load. A skeleton would feel more polished.

### 9. Optimistic UI for branch switching
**Location**: `BranchSwitcher.tsx`

The `switchBranchWorkspace` mutation could use optimistic updates to feel snappier.

## Testing

### 10. Add unit tests for git utilities
**Location**: `git.ts`

Functions like `getDefaultBranch`, `branchExistsOnRemote`, `detectBaseBranch`, and `checkBranchCheckoutSafety` have complex logic that would benefit from unit tests with mocked `simple-git`.

Priority candidates:
- `getDefaultBranch` - many code paths
- `detectBaseBranch` - merge-base logic
- `checkBranchCheckoutSafety` - safety checks before checkout
