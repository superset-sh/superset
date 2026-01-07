# Fix Delete Workspace Issues

## Problem Statement

Two issues with the delete workspace functionality:
1. When switching back to a different worktree after deletion, it shows the worktree being "deleted again" (initialization view appears)
2. The delete operation still takes a while despite UI optimistic updates

---

## Current Architecture Analysis

### Delete Flow Overview

```
User clicks Delete
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│ UI: DeleteWorkspaceDialog                                    │
│ - Closes dialog immediately                                  │
│ - Shows toast "Deleting..."                                  │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│ React Query: useDeleteWorkspace (onMutate)                   │
│ - Cancel outgoing queries                                    │
│ - Snapshot previous state                                    │
│ - Optimistically remove from getAllGrouped, getAll           │
│ - If active workspace: switch to next workspace optimistically│
└─────────────────────────────────────────────────────────────┘
       │
       ▼ (async, not awaited by UI)
┌─────────────────────────────────────────────────────────────┐
│ Backend: workspaces.delete procedure                         │
│ 1. If initializing: cancel & wait up to 30s ← SLOW           │
│ 2. Kill terminal processes                                   │
│ 3. Acquire project lock                                      │
│ 4. Run teardown scripts (fire-and-forget)                    │
│ 5. Check worktree exists (git worktree list)                 │
│ 6. git worktree remove --force (60s timeout) ← SLOW          │
│ 7. Delete DB records                                         │
│ 8. Update active workspace in settings                       │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│ React Query: useDeleteWorkspace (onSuccess)                  │
│ - Invalidate all workspace queries                           │
│ - Re-fetches getActive, getAll, getAllGrouped from backend   │
└─────────────────────────────────────────────────────────────┘
```

### Key Invariants to Preserve

1. **DB ↔ Filesystem consistency**: The `worktrees` table should reflect actual worktrees on disk
2. **No dangling references**: Workspaces should not reference non-existent worktrees
3. **Project lock integrity**: Only one git operation per project at a time
4. **Terminal cleanup**: Terminals must be killed before worktree deletion (or they'll have dangling cwd)
5. **Reopening safety**: User should not be able to "reopen" a worktree that's being deleted

---

## Issue 1: "Shows worktree being deleted again"

### Root Cause Analysis

The `WorkspaceView` component determines whether to show the initialization view using this check (`WorkspaceView/index.tsx:27-32`):

```typescript
const gitStatus = activeWorkspace?.worktree?.gitStatus;
const hasIncompleteInit =
    activeWorkspace?.type === "worktree" &&
    (gitStatus === null || gitStatus === undefined);

const showInitView =
    activeWorkspaceId && (isInitializing || hasFailed || hasIncompleteInit);
```

**The problem**: After deletion completes and `invalidate()` fires, the `getActive` query re-fetches from the backend. If the new active workspace has `worktree.gitStatus === null` in the database (which can happen for various reasons), the `hasIncompleteInit` check triggers and shows the initialization view.

**Confirmed scenarios causing this:**
1. The workspace being switched to was created but never fully initialized (DB has `gitStatus: null`)
2. Race condition: The optimistic update sets `gitStatus`, but the query invalidation overwrites it with the actual DB value (null)
3. The `getActive` query logic returns `worktree.gitStatus ?? null` - if worktree exists but gitStatus wasn't set, returns null

### Proposed Fixes

---

#### Option A: Selective Query Invalidation

**Approach**: Don't invalidate `getActive` query in `onSuccess` - only invalidate the list queries.

```typescript
// In useDeleteWorkspace.ts onSuccess
onSuccess: async (...args) => {
    // Only invalidate list queries, preserve active state
    await Promise.all([
        utils.workspaces.getAllGrouped.invalidate(),
        utils.workspaces.getAll.invalidate(),
    ]);
    // Don't invalidate getActive - trust our optimistic update

    await options?.onSuccess?.(...args);
},
```

**Pros:**
- Simple change (~5 lines)
- Directly addresses the root cause
- No new state management needed

**Cons:**
- `getActive` could become stale if backend sets different active workspace
- Breaks the "invalidate everything" pattern used elsewhere
- If optimistic update was wrong, user sees incorrect state until they navigate

**Risks:**
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Stale active workspace | Low | Medium | Backend always sets same next workspace (sorted by lastOpenedAt) |
| Optimistic data mismatch | Low | Low | User can navigate away and back to refresh |
| Inconsistent with other mutations | Medium | Low | Document the exception clearly |

**Implementation Complexity**: Very Low (1-2 hours)

---

#### Option B: Re-apply Optimistic State After Invalidation

**Approach**: After invalidation, check if the new `getActive` data has null gitStatus and patch it with our optimistic value.

```typescript
// In useDeleteWorkspace.ts onSuccess
onSuccess: async (...args) => {
    // Store our optimistic next workspace before invalidation
    const optimisticActive = utils.workspaces.getActive.getData();

    await utils.workspaces.invalidate();

    // If the new active workspace has null gitStatus but our optimistic had it, restore it
    const freshActive = utils.workspaces.getActive.getData();
    if (freshActive?.type === 'worktree' &&
        freshActive.worktree?.gitStatus === null &&
        optimisticActive?.id === freshActive.id &&
        optimisticActive?.worktree?.gitStatus) {
        utils.workspaces.getActive.setData(undefined, {
            ...freshActive,
            worktree: {
                ...freshActive.worktree,
                gitStatus: optimisticActive.worktree.gitStatus,
            }
        });
    }

    await options?.onSuccess?.(...args);
},
```

**Pros:**
- Full invalidation still happens (other data is fresh)
- Only patches the specific problem case
- Preserves correct state when gitStatus actually exists

**Cons:**
- More complex logic
- Race condition window between invalidation and patch
- Could mask real issues where gitStatus should be null

**Risks:**
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Race condition | Medium | Low | The window is very small (sync code) |
| Masking real init issues | Medium | Medium | Only patch if optimistic had valid gitStatus |
| Logic complexity bugs | Low | Medium | Thorough testing |

**Implementation Complexity**: Low (2-4 hours)

---

#### Option C: Track "Switching Away From Deletion" State

**Approach**: Add Zustand state to track that we're in a "delete transition" and skip the hasIncompleteInit check during that window.

```typescript
// In workspace-init.ts store
interface WorkspaceInitState {
    // ... existing ...
    deletionTransitionWorkspaceIds: Set<string>;
    markDeletionTransition: (workspaceId: string) => void;
    clearDeletionTransition: (workspaceId: string) => void;
}

// In WorkspaceView/index.tsx
const isInDeletionTransition = useWorkspaceInitStore(
    (s) => activeWorkspaceId && s.deletionTransitionWorkspaceIds.has(activeWorkspaceId)
);
const hasIncompleteInit =
    activeWorkspace?.type === "worktree" &&
    (gitStatus === null || gitStatus === undefined) &&
    !isInDeletionTransition;  // Skip during transition
```

**Pros:**
- Explicit state management
- Works regardless of query timing
- Can add timeout to auto-clear

**Cons:**
- New state to manage
- Need to clear at the right time (when? after how long?)
- Adds complexity to the init detection logic

**Risks:**
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Forgetting to clear state | Medium | High | Auto-clear after 5 seconds |
| Masking real init issues | Medium | Medium | Only set during delete flow |
| Memory leak | Low | Low | Set-based storage with auto-cleanup |

**Implementation Complexity**: Medium (4-6 hours)

---

#### Option D: Fix Root Cause - Always Set gitStatus

**Approach**: Ensure all worktree records always have valid `gitStatus`, even before initialization completes.

```typescript
// In workspaces.ts create procedure, before background init
const worktree = localDb.insert(worktrees).values({
    projectId: input.projectId,
    path: worktreePath,
    branch,
    baseBranch: targetBranch,
    gitStatus: {  // Set immediately instead of null
        branch,
        needsRebase: false,
        lastRefreshed: 0,  // Indicates "not yet refreshed"
    },
}).returning().get();
```

Also add a migration/fix for existing records:
```typescript
// On app startup
const worktreesWithNullGitStatus = localDb
    .select()
    .from(worktrees)
    .where(isNull(worktrees.gitStatus))
    .all();

for (const wt of worktreesWithNullGitStatus) {
    localDb.update(worktrees)
        .set({ gitStatus: { branch: wt.branch, needsRebase: false, lastRefreshed: 0 } })
        .where(eq(worktrees.id, wt.id))
        .run();
}
```

**Pros:**
- Fixes the root cause permanently
- No UI-side workarounds needed
- Makes the data model more robust

**Cons:**
- Changes data model semantics (null meant "not initialized")
- Need migration for existing data
- `lastRefreshed: 0` is a sentinel value (code smell)
- Need to distinguish "initialized" vs "not initialized" differently

**Risks:**
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Semantic meaning lost | High | Medium | Use different field for init state |
| Migration issues | Low | High | Test thoroughly, backup |
| Sentinel value confusion | Medium | Low | Document clearly |

**Implementation Complexity**: Medium-High (6-10 hours)

---

### Recommendation for Issue 1

**Option A (Selective Invalidation)** is the best choice:
- Lowest complexity
- Directly addresses the symptom
- Minimal risk
- The "stale getActive" risk is mitigated because backend uses same sort logic

If that proves insufficient, escalate to **Option B** (re-apply optimistic state).

---

## Issue 2: Delete operation takes too long

### Bottleneck Analysis

| Operation | Location | Time | Blocking? |
|-----------|----------|------|-----------|
| Wait for init cancellation | `workspaces.ts:1162` | 0-30s | Only if initializing |
| Kill terminals | `workspaces.ts:1166` | ~100ms | Yes |
| Acquire project lock | `workspaces.ts:1190` | 0-unbounded | Only if contention |
| Check worktree exists | `workspaces.ts:1194` | ~500ms | Yes |
| `git worktree remove --force` | `git.ts:220-223` | 1-60s | **Yes - main bottleneck** |
| Delete DB records | `workspaces.ts:1238-1241` | ~5ms | Yes |

### Why `git worktree remove --force` is slow

1. **File deletion**: Must delete entire worktree directory (could be 100k+ files in node_modules, .git, etc.)
2. **Git metadata updates**: Updates `.git/worktrees/<name>` in main repo
3. **Lock acquisition**: Waits for any concurrent git operations
4. **I/O bound**: Disk speed is the limit

### Proposed Optimizations

---

#### Option 1: Background Deletion Queue (Recommended)

**Approach**: Delete DB record immediately, queue filesystem deletion for background processing.

```typescript
// workspaces.ts delete procedure
mutation: async ({ input }) => {
    // ... existing terminal kill ...

    // Get worktree info before deleting from DB
    const worktreeInfo = worktree ? {
        mainRepoPath: project.mainRepoPath,
        worktreePath: worktree.path,
        workspaceName: workspace.name,
    } : null;

    // Delete DB records FIRST (instant)
    localDb.delete(workspaces).where(eq(workspaces.id, input.id)).run();
    if (worktree) {
        localDb.delete(worktrees).where(eq(worktrees.id, worktree.id)).run();
    }

    // Queue background deletion (don't await)
    if (worktreeInfo) {
        worktreeCleanupQueue.enqueue(worktreeInfo);
    }

    return { success: true };  // Returns immediately
}
```

**Background queue implementation:**
```typescript
// src/main/lib/worktree-cleanup-queue.ts
class WorktreeCleanupQueue {
    private queue: CleanupItem[] = [];
    private processing = false;
    private pendingPaths = new Set<string>();  // For reopen prevention

    enqueue(item: CleanupItem) {
        this.queue.push(item);
        this.pendingPaths.add(item.worktreePath);
        this.processNext();
    }

    isPathPending(path: string): boolean {
        return this.pendingPaths.has(path);
    }

    private async processNext() {
        if (this.processing || this.queue.length === 0) return;
        this.processing = true;

        const item = this.queue.shift()!;
        try {
            // Run teardown first
            await runTeardown(item.mainRepoPath, item.worktreePath, item.workspaceName);
            // Then git worktree remove
            await removeWorktree(item.mainRepoPath, item.worktreePath);
            console.log(`[cleanup] Deleted worktree: ${item.worktreePath}`);
        } catch (err) {
            console.error('[cleanup] Failed to delete worktree:', err);
            // Don't re-queue - orphan will be cleaned on restart
        } finally {
            this.pendingPaths.delete(item.worktreePath);
            this.processing = false;
            this.processNext();
        }
    }

    // Called on app startup
    async cleanupOrphans(mainRepoPath: string) {
        // Find worktrees on disk that aren't in DB
        const gitWorktrees = await listWorktrees(mainRepoPath);
        const dbWorktrees = localDb.select().from(worktrees).all();
        const dbPaths = new Set(dbWorktrees.map(w => w.path));

        for (const gitWt of gitWorktrees) {
            if (!dbPaths.has(gitWt.path) && gitWt.path !== mainRepoPath) {
                console.log(`[cleanup] Found orphan worktree: ${gitWt.path}`);
                this.enqueue({
                    mainRepoPath,
                    worktreePath: gitWt.path,
                    workspaceName: 'orphan',
                });
            }
        }
    }
}
```

**Pros:**
- UI is instant (DB delete is ~5ms)
- User can continue working immediately
- Background cleanup is reliable
- Handles orphans on restart
- Sequential processing prevents git lock contention

**Cons:**
- Filesystem and DB can be temporarily inconsistent
- Need to prevent reopening pending deletions
- Need startup orphan cleanup
- If app crashes during deletion, worktree remains on disk (cleaned on restart)

**Risks:**
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| User tries to reopen pending deletion | Medium | High | Check `isPathPending()` in openWorktree |
| App crash leaves orphan | Low | Low | Startup cleanup scans for orphans |
| Concurrent git operations fail | Low | Medium | Sequential queue processing |
| Disk fills up from uncleaned worktrees | Very Low | Medium | Startup cleanup + user can manually delete |

**What could go wrong:**

1. **User reopens a deleting worktree**:
   - Scenario: User deletes workspace, immediately opens "New Workspace" modal, sees the worktree (still on disk) in "Existing Worktrees" list, clicks to reopen
   - Solution: Check `isPathPending()` before listing existing worktrees, or filter them out

2. **Git operations fail during background delete**:
   - Scenario: `git worktree remove` fails because files are locked (editor has them open)
   - Solution: Log error, don't retry (orphan cleanup on restart will handle it)

3. **App crashes mid-deletion**:
   - Scenario: Power loss after DB delete but before git cleanup
   - Solution: Startup scans for worktrees on disk not in DB, queues them for deletion

4. **User rage-deletes many workspaces**:
   - Scenario: User deletes 10 workspaces quickly, all queue up
   - Solution: Sequential processing is fine - they'll complete in order, UI is responsive

**Implementation Complexity**: Medium (8-12 hours)

---

#### Option 2: Rename-then-Delete Pattern

**Approach**: Immediately rename the worktree directory to make it "invisible", then delete asynchronously.

```typescript
async function quickDeleteWorktree(mainRepoPath: string, worktreePath: string) {
    const tombstonePath = `${worktreePath}.superset-deleting-${Date.now()}`;

    try {
        // Fast rename (usually instant on same filesystem)
        await rename(worktreePath, tombstonePath);
    } catch (err) {
        // If rename fails (cross-device, permissions), fall back to normal delete
        await removeWorktree(mainRepoPath, worktreePath);
        return;
    }

    // Git prune to clean up metadata (runs after rename so worktree is "gone")
    await execFileAsync('git', ['-C', mainRepoPath, 'worktree', 'prune']);

    // Background delete of renamed directory
    setImmediate(async () => {
        try {
            await rm(tombstonePath, { recursive: true, force: true });
        } catch (err) {
            console.error('[cleanup] Failed to delete tombstone:', err);
        }
    });
}
```

**Pros:**
- Near-instant from user perspective
- Git metadata cleaned up synchronously (via prune)
- No need to track "pending deletions" - renamed dir won't appear in worktree list
- Simpler than full queue system

**Cons:**
- Leaves `.superset-deleting-*` directories if deletion fails
- Rename can fail across filesystems (rare with worktrees)
- Need periodic cleanup of orphaned tombstones
- `git worktree prune` doesn't know about renamed dirs, could leave metadata

**Risks:**
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Rename fails (cross-device) | Very Low | Low | Fall back to synchronous delete |
| Tombstone directories pile up | Low | Low | Startup cleanup scans for `.superset-deleting-*` |
| Git metadata inconsistency | Medium | Low | `git worktree prune` cleans up |
| Files locked by other process | Medium | Medium | Rename usually works even with locked files |

**What could go wrong:**

1. **Rename fails**:
   - Scenario: Worktrees on different filesystem than main repo (rare)
   - Solution: Fall back to sync `removeWorktree`

2. **Tombstones accumulate**:
   - Scenario: rm() fails repeatedly (permissions, locked files)
   - Solution: Startup cleanup, or manual user cleanup

3. **Git gets confused**:
   - Scenario: Git still thinks worktree exists because we bypassed `git worktree remove`
   - Solution: `git worktree prune` removes stale entries

**Implementation Complexity**: Low-Medium (4-8 hours)

---

#### Option 3: Parallel DB + Git Operations

**Approach**: Run DB cleanup in parallel with git cleanup instead of sequentially.

```typescript
// Current (sequential):
await removeWorktree(project.mainRepoPath, worktree.path);  // SLOW
localDb.delete(workspaces).where(eq(workspaces.id, input.id)).run();
localDb.delete(worktrees).where(eq(worktrees.id, worktree.id)).run();

// Proposed (parallel):
await Promise.all([
    removeWorktree(project.mainRepoPath, worktree.path),
    (async () => {
        localDb.delete(workspaces).where(eq(workspaces.id, input.id)).run();
        localDb.delete(worktrees).where(eq(worktrees.id, worktree.id)).run();
    })(),
]);
```

**Pros:**
- Very simple change (3 lines)
- Shaves off ~10ms of DB time during git wait
- No architectural changes

**Cons:**
- Still blocked by git operation (main bottleneck unchanged)
- Marginal improvement (~1-2% faster)
- If git fails after DB delete, inconsistent state

**Risks:**
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Git fails after DB delete | Low | Medium | Accept inconsistency (orphan on disk) |
| No meaningful speedup | High | Low | It's a simple change anyway |

**Implementation Complexity**: Very Low (30 minutes)

**Verdict**: Not worth it as a standalone fix - doesn't address the real bottleneck.

---

#### Option 4: Direct Filesystem Deletion (Bypass Git)

**Approach**: Delete files directly instead of using `git worktree remove`.

```typescript
async function directDeleteWorktree(mainRepoPath: string, worktreePath: string) {
    const worktreeName = basename(worktreePath);

    // Delete git metadata first
    const gitWorktreeDir = join(mainRepoPath, '.git', 'worktrees', worktreeName);
    await rm(gitWorktreeDir, { recursive: true, force: true });

    // Delete worktree directory
    await rm(worktreePath, { recursive: true, force: true });
}
```

**Pros:**
- May be faster for very large directories (no git overhead)
- No git lock contention
- Works even if git is in weird state

**Cons:**
- Bypasses git's safety checks
- May leave git in inconsistent state
- `rm -rf` is dangerous if path is wrong
- No verification that it's actually a worktree

**Risks:**
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Delete wrong directory | Low | CRITICAL | Validate path is under worktrees dir |
| Git metadata inconsistency | Medium | Low | Run `git worktree prune` after |
| Corrupted git repo | Low | High | Don't use this approach |

**Verdict**: Too risky. Git worktree management should go through git.

---

### Recommendation for Issue 2

**Option 1 (Background Deletion Queue)** is the best approach:

1. **Instant UI response** - DB delete is ~5ms, returns immediately
2. **Reliable cleanup** - Background queue processes deletions sequentially
3. **Crash recovery** - Startup orphan cleanup handles any failures
4. **Prevents reopening** - `isPathPending()` check blocks reopening deleted worktrees

**Alternative**: If simpler solution is preferred, **Option 2 (Rename-then-Delete)** is viable with less implementation overhead.

---

## Detailed Implementation Plan

### Phase 1: Fix UI Flash (Issue 1) - 2-4 hours

**File**: `src/renderer/react-query/workspaces/useDeleteWorkspace.ts`

```typescript
onSuccess: async (...args) => {
    // Selective invalidation: don't invalidate getActive to preserve optimistic state
    await Promise.all([
        utils.workspaces.getAllGrouped.invalidate(),
        utils.workspaces.getAll.invalidate(),
    ]);

    await options?.onSuccess?.(...args);
},
```

**Testing**:
1. Delete active workspace with multiple workspaces open
2. Verify switches to next workspace without init flash
3. Verify can navigate between workspaces normally after delete

---

### Phase 2: Background Deletion Queue (Issue 2) - 8-12 hours

**New file**: `src/main/lib/worktree-cleanup-queue.ts`

1. Create `WorktreeCleanupQueue` class
2. Implement `enqueue()`, `processNext()`, `isPathPending()`
3. Implement `cleanupOrphans()` for startup recovery
4. Export singleton instance

**Modify**: `src/lib/trpc/routers/workspaces/workspaces.ts`

1. Import cleanup queue
2. In `delete` procedure: delete DB first, then enqueue cleanup
3. Remove `await removeWorktree()` from main flow

**Modify**: `src/lib/trpc/routers/workspaces/workspaces.ts` - openWorktree

1. Check `worktreeCleanupQueue.isPathPending(worktree.path)` before allowing reopen
2. Return error if path is pending deletion

**Modify**: `src/main/index.ts`

1. On app ready, call `worktreeCleanupQueue.cleanupOrphans()` for each project

**Testing**:
1. Delete workspace, verify UI responds instantly
2. Verify worktree is actually deleted (check filesystem)
3. Try to reopen deleted worktree from "Existing Worktrees" list - should fail/not appear
4. Kill app during deletion, restart, verify cleanup continues
5. Rapid-fire delete multiple workspaces, verify all cleaned up

---

## Risk Summary

| Risk | Severity | Likelihood | Phase | Mitigation |
|------|----------|------------|-------|------------|
| Stale getActive after delete | Low | Low | 1 | Same sort logic on frontend/backend |
| User reopens pending deletion | High | Medium | 2 | `isPathPending()` check |
| App crash leaves orphan worktree | Low | Low | 2 | Startup cleanup |
| Git lock contention | Medium | Low | 2 | Sequential queue processing |
| DB-filesystem inconsistency | Low | Medium | 2 | Acceptable - files cleaned eventually |

---

## Files to Modify

| File | Changes | Phase |
|------|---------|-------|
| `src/renderer/react-query/workspaces/useDeleteWorkspace.ts` | Selective invalidation | 1 |
| `src/main/lib/worktree-cleanup-queue.ts` | New file - background queue | 2 |
| `src/lib/trpc/routers/workspaces/workspaces.ts` | Decouple DB from git ops, check pending in openWorktree | 2 |
| `src/main/index.ts` | Startup orphan cleanup | 2 |

---

## Testing Checklist

### Phase 1
- [ ] Delete active workspace → switches cleanly, no init flash
- [ ] Delete non-active workspace → list updates immediately
- [ ] Navigate between workspaces after deletion → works normally
- [ ] Error during delete → rolls back optimistic update

### Phase 2
- [ ] Delete workspace → UI responds in <100ms
- [ ] Verify worktree deleted from filesystem (after queue processes)
- [ ] Delete 5 workspaces rapidly → all eventually cleaned up
- [ ] Try reopen during deletion → blocked appropriately
- [ ] Kill app during deletion → cleanup completes on restart
- [ ] Orphan worktree on disk → cleaned up on startup
