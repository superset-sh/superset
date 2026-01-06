# Optimistic Workspace Deletion

## Problem

Deleting a workspace feels slow because the UI waits for the entire deletion process to complete before updating. The backend deletion involves:

1. Waiting for init to complete (up to 30s if workspace is initializing)
2. Killing terminal processes (2-3s)
3. Acquiring project lock
4. Running teardown scripts (fire-and-forget)
5. `git worktree remove --force` (can take several seconds for large directories)
6. Database cleanup

## Solution

Implement optimistic UI updates so the workspace is removed from the UI immediately, while the actual deletion happens in the background.

## Implementation Plan

### 1. Identify the delete trigger point

**File:** `apps/desktop/src/renderer/react-query/workspaces/useDeleteWorkspace.ts`

This hook wraps `trpc.workspaces.delete.useMutation`. We need to add optimistic update logic here.

### 2. Add optimistic update to useDeleteWorkspace

```typescript
export function useDeleteWorkspace(
  options?: Parameters<typeof trpc.workspaces.delete.useMutation>[0],
) {
  const utils = trpc.useUtils();

  return trpc.workspaces.delete.useMutation({
    ...options,
    onMutate: async ({ id }) => {
      // Cancel outgoing refetches
      await utils.workspaces.getAll.cancel();
      await utils.workspaces.getAllGrouped.cancel();
      await utils.workspaces.getActive.cancel();

      // Snapshot previous value
      const previousGrouped = utils.workspaces.getAllGrouped.getData();
      const previousAll = utils.workspaces.getAll.getData();
      const previousActive = utils.workspaces.getActive.getData();

      // Optimistically remove workspace from cache
      if (previousGrouped) {
        utils.workspaces.getAllGrouped.setData(undefined,
          previousGrouped.map(group => ({
            ...group,
            workspaces: group.workspaces.filter(w => w.id !== id)
          })).filter(group => group.workspaces.length > 0)
        );
      }

      if (previousAll) {
        utils.workspaces.getAll.setData(undefined,
          previousAll.filter(w => w.id !== id)
        );
      }

      // If deleting active workspace, clear it
      if (previousActive?.id === id) {
        utils.workspaces.getActive.setData(undefined, null);
      }

      // Return context for rollback
      return { previousGrouped, previousAll, previousActive };
    },
    onError: (err, { id }, context) => {
      // Rollback on error
      if (context?.previousGrouped) {
        utils.workspaces.getAllGrouped.setData(undefined, context.previousGrouped);
      }
      if (context?.previousAll) {
        utils.workspaces.getAll.setData(undefined, context.previousAll);
      }
      if (context?.previousActive) {
        utils.workspaces.getActive.setData(undefined, context.previousActive);
      }

      // Show error toast
      // toast.error(`Failed to delete workspace: ${err.message}`);

      // Call user's onError if provided
      options?.onError?.(err, { id }, context);
    },
    onSuccess: async (...args) => {
      // Invalidate to ensure consistency (in background)
      await utils.workspaces.invalidate();
      await options?.onSuccess?.(...args);
    },
  });
}
```

### 3. Handle active workspace switching

When deleting the currently active workspace, we need to switch to another workspace immediately. Check:

**File:** `apps/desktop/src/renderer/react-query/workspaces/useWorkspaceDeleteHandler.ts`

This likely handles the UX around deletion. May need to:
- Pre-select the next workspace before deletion
- Update UI state optimistically

### 4. Close dialog immediately

**File:** `apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/WorkspaceListItem/components/DeleteWorkspaceDialog/DeleteWorkspaceDialog.tsx`

Ensure the delete confirmation dialog closes immediately when user confirms, not after mutation completes.

### 5. Add error handling UI

If the optimistic delete fails, we need to:
- Show a toast notification with the error
- The workspace will reappear in the list (rollback)

## Files to Modify

1. `apps/desktop/src/renderer/react-query/workspaces/useDeleteWorkspace.ts` - Add optimistic updates
2. `apps/desktop/src/renderer/react-query/workspaces/useWorkspaceDeleteHandler.ts` - Review for any blocking logic
3. `apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/WorkspaceListItem/components/DeleteWorkspaceDialog/DeleteWorkspaceDialog.tsx` - Ensure immediate dialog close

## Testing

1. Delete a workspace with large node_modules - should disappear instantly
2. Delete the active workspace - should switch to another workspace instantly
3. Simulate a failure (e.g., by temporarily breaking the backend) - workspace should reappear with error toast
4. Delete while workspace is initializing - should still feel instant

## Risks

- **Low:** If deletion fails, workspace reappears (could be slightly confusing but correct)
- **Mitigation:** Show clear error toast explaining what happened

## Alternative Considered

Speeding up the actual deletion (async file removal, etc.) was considered but adds complexity and edge cases around orphaned files, race conditions with branch reuse, and teardown script failures. Optimistic UI is simpler and achieves the same perceived performance.
