# Single Active Workspace FsWatcher

## Problem

The `FsWatcher` maintains one `@parcel/watcher` native subscription per workspace in a `Map<workspaceId, WatcherState>`. On app boot it starts watchers for **all** active workspaces. Since users can only view one workspace at a time, this wastes native file descriptor resources and OS kernel watch capacity for every inactive workspace.

## Solution

Refactor `FsWatcher` to watch **only the active workspace**, switching the watcher when the active workspace changes. The single chokepoint is `setLastActiveWorkspace()` — every workspace switch (create, setActive, delete/close fallback, project open) flows through this function.

## Architecture

### Data Flow

```
User action (create / switch / delete / close / open project)
  └─> setLastActiveWorkspace(workspaceId)    [db-helpers.ts]
        ├─> DB upsert: settings.lastActiveWorkspaceId = workspaceId
        └─> fsWatcher.switchTo({ workspaceId, rootPath })   [fire-and-forget]
              ├─> flush pending events from old watcher
              ├─> unsubscribe old @parcel/watcher subscription
              ├─> subscribe new @parcel/watcher subscription
              └─> emit "switched" event (clears search cache)

App boot
  └─> startFileWatcherForActiveWorkspace()   [main/index.ts]
        ├─> query settings.lastActiveWorkspaceId
        ├─> look up workspace root path via DB
        └─> fsWatcher.switchTo({ workspaceId, rootPath })

Workspace init completes (worktree now exists on disk)
  └─> check settings.lastActiveWorkspaceId === workspaceId
        └─> if yes: fsWatcher.switchTo({ workspaceId, rootPath })
            (handles timing edge case where setLastActiveWorkspace was called
             before the worktree directory existed)
```

### Why `setLastActiveWorkspace` is the Right Chokepoint

Every code path that changes which workspace is "active" calls this function:

| Call site | Count | Context |
|-----------|-------|---------|
| `procedures/create.ts` | ~10 | All workspace creation flows (new, existing branch, reopen, etc.) |
| `procedures/status.ts` | 1 | `setActive` mutation |
| `projects.ts` (open) | 2 | Opening a project switches to its workspace |
| `db-helpers.ts` (internal) | 1 | `updateActiveWorkspaceIfRemoved()` after delete/close |

Total: ~14 call sites, all funneled through one function.

## FsWatcher API

### Before (multi-watcher)

```typescript
class FsWatcher extends EventEmitter {
  private watchers = new Map<string, WorkspaceWatcherState>();

  async watch({ workspaceId, rootPath }): Promise<void>;
  async unwatch(workspaceId: string): Promise<void>;
  async unwatchAll(): Promise<void>;
  getRootPath(workspaceId: string): string | undefined;
}
```

### After (single-watcher)

```typescript
class FsWatcher extends EventEmitter {
  private active: WatcherState | null = null;

  async switchTo({ workspaceId, rootPath }): Promise<void>;  // NEW
  async unwatch(workspaceId: string): Promise<void>;          // only acts if ID matches active
  async stop(): Promise<void>;                                 // replaces unwatchAll()
  getRootPath(workspaceId: string): string | undefined;       // only returns if ID matches active
  getActiveWorkspaceId(): string | undefined;                  // NEW
}
```

### Key Behaviors

- **`switchTo` no-ops for same workspace** — if `active.workspaceId === workspaceId`, returns immediately. Prevents redundant unsubscribe/resubscribe when the same workspace is set active multiple times.
- **`switchTo` flushes before stopping** — pending batched events from the old workspace are emitted before the subscription is torn down, so no events are silently lost.
- **`switchTo` emits `"switched"` event** — consumers (search cache) listen for this to clear stale state.
- **`unwatch(id)` is a conditional stop** — only acts if `id` matches the active watcher. This makes existing `unwatch` calls in the delete flow safe no-ops when the workspace isn't active.

## Changes Per File

### 1. `src/main/lib/fs-watcher/fs-watcher.ts` — Core Refactor

Replace `Map<string, WorkspaceWatcherState>` with `private active: WatcherState | null`.

```typescript
interface WatcherState {
  workspaceId: string;
  subscription: AsyncSubscription;
  rootPath: string;
  pendingEvents: Map<string, FileSystemChangeEvent>;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  maxWindowTimer: ReturnType<typeof setTimeout> | null;
}
```

Methods:
- **`switchTo({ workspaceId, rootPath })`** — no-op if same workspace ID; otherwise call `stop()`, create new `@parcel/watcher` subscription, set `this.active`, emit `"switched"`.
- **`unwatch(workspaceId)`** — guard: `if (!this.active || this.active.workspaceId !== workspaceId) return;` then call `stopInternal()`.
- **`stop()`** — public wrapper for `stopInternal()`. Replaces `unwatchAll()`.
- **`stopInternal()`** — flush pending events, clear timers, unsubscribe, set `this.active = null`.
- **`getRootPath(workspaceId)`** — return `this.active.rootPath` only if IDs match.
- **`getActiveWorkspaceId()`** — return `this.active?.workspaceId`.
- **`handleEvents`** — guard: `if (!this.active || this.active.workspaceId !== workspaceId) return;` then operate on `this.active` directly.
- **`flush()`** — operate on `this.active` directly instead of Map lookup.

All batching/debounce/dedup logic (100ms debounce, 2s max batch window, last-write-wins dedup by path) is unchanged.

### 2. `src/lib/trpc/routers/workspaces/utils/db-helpers.ts` — Wire the Chokepoint

Add to `setLastActiveWorkspace()` after the DB upsert:

```typescript
import { fsWatcher } from "main/lib/fs-watcher";
import { getWorkspacePath } from "./worktree";

// After DB upsert:
if (workspaceId) {
  const workspace = localDb.select().from(workspaces).where(eq(workspaces.id, workspaceId)).get();
  if (workspace) {
    const rootPath = getWorkspacePath(workspace);
    if (rootPath) {
      fsWatcher.switchTo({ workspaceId, rootPath }).catch((err) => {
        console.error("[db-helpers] Failed to switch fs watcher:", err);
      });
    }
    // If rootPath is null, worktree isn't created yet —
    // workspace-init will call switchTo() when it finishes
  }
} else {
  fsWatcher.stop().catch((err) => {
    console.error("[db-helpers] Failed to stop fs watcher:", err);
  });
}
```

`getWorkspacePath(workspace)` (from `worktree.ts`) already handles both workspace types:
- **worktree type**: looks up `worktrees.path` via `workspace.worktreeId`
- **branch type**: looks up `projects.mainRepoPath` via `workspace.projectId`

### 3. `src/main/index.ts` — Simplify Boot

Replace `startFileWatchersForActiveWorkspaces()` with `startFileWatcherForActiveWorkspace()`:

```typescript
import { getWorkspace } from "lib/trpc/routers/workspaces/utils/db-helpers";
import { getWorkspacePath } from "lib/trpc/routers/workspaces/utils/worktree";

function startFileWatcherForActiveWorkspace(): void {
  const row = localDb.select().from(settings).get();
  const workspaceId = row?.lastActiveWorkspaceId;
  if (!workspaceId) return;

  const workspace = getWorkspace(workspaceId);
  if (!workspace) return;

  const rootPath = getWorkspacePath(workspace);
  if (!rootPath) return;

  fsWatcher.switchTo({ workspaceId, rootPath }).catch(console.error);
}
```

Remove the `workspaces` and `worktrees` imports from `@superset/local-db` (no longer needed). Keep `settings` import.

### 4. `src/lib/trpc/routers/workspaces/utils/workspace-init.ts` — Conditional switchTo

At both places where `fsWatcher.watch()` is called (existing branch path and new branch path), replace with:

```typescript
import { settings } from "@superset/local-db";

// At end of init, after "ready":
if (!manager.isCancellationRequested(workspaceId)) {
  const activeId = localDb.select().from(settings).get()?.lastActiveWorkspaceId;
  if (activeId === workspaceId) {
    fsWatcher.switchTo({ workspaceId, rootPath: worktreePath }).catch(console.error);
  }
}
```

This handles the timing edge case where `setLastActiveWorkspace()` was called before the worktree directory existed on disk. By the time init finishes, the directory exists, so `switchTo` can proceed.

### 5. `src/lib/trpc/routers/workspaces/procedures/delete.ts` — DB Path Lookup

**Line ~167**: Replace `fsWatcher.getRootPath(input.id)` with `getWorkspacePath(workspace)`:
```typescript
import { getWorkspacePath } from "../utils/worktree";

// workspace is already fetched at the start of the mutation
const savedRootPath = getWorkspacePath(workspace);
```

**Three re-attach sites** (init cancel failure, teardown failure, disk removal failure): Replace `fsWatcher.watch()` with `fsWatcher.switchTo()`:
```typescript
if (savedRootPath) {
  fsWatcher.switchTo({ workspaceId: input.id, rootPath: savedRootPath }).catch(console.error);
}
```

**Keep `fsWatcher.unwatch(input.id)` calls** — they now no-op if the workspace isn't the active one.

**`close` mutation**: Keep `fsWatcher.unwatch(input.id)`. The subsequent `updateActiveWorkspaceIfRemoved()` calls `setLastActiveWorkspace()` which triggers `switchTo` for the next workspace.

### 6. `src/lib/trpc/routers/filesystem/search.ts` — Clear Cache on Switch

Add a listener for the `"switched"` event:

```typescript
fsWatcher.on("switched", () => {
  searchIndexCache.clear();
  searchIndexBuilds.clear();
});
```

The existing `"batch"` listener still works for incremental invalidation within the same workspace.

### 7. Tests — Update for Single-Watcher Semantics

**`fs-watcher.test.ts`**:
- `watch()` calls → `switchTo()` calls
- `unwatchAll()` → `stop()`
- Add test: `switchTo` no-ops for same workspace ID
- Add test: `switchTo` emits `"switched"` event
- `unwatch("ws-other")` no-ops for non-active workspace

**`fs-watcher.lifecycle.test.ts`**:
- Same API renames
- Remove "concurrent workspace operations" test (no longer applicable)
- Add test: `switchTo` properly cleans up old watcher when switching
- Keep race condition tests (subscribe resolves late), cancellation guard, re-attach tests

## Files Modified (Summary)

| File | Change |
|------|--------|
| `src/main/lib/fs-watcher/fs-watcher.ts` | Core refactor: Map → single active state |
| `src/lib/trpc/routers/workspaces/utils/db-helpers.ts` | Wire `setLastActiveWorkspace` → `fsWatcher.switchTo/stop` |
| `src/main/index.ts` | Boot only active workspace |
| `src/lib/trpc/routers/workspaces/utils/workspace-init.ts` | Conditional `switchTo` after init |
| `src/lib/trpc/routers/workspaces/procedures/delete.ts` | DB path lookup, `switchTo` re-attach |
| `src/lib/trpc/routers/filesystem/search.ts` | Clear cache on `"switched"` event |
| `src/main/lib/fs-watcher/fs-watcher.test.ts` | Updated tests |
| `src/main/lib/fs-watcher/fs-watcher.lifecycle.test.ts` | Updated tests |

## No Changes Needed

| File | Why |
|------|-----|
| `src/lib/trpc/routers/filesystem/subscription.ts` | workspaceId filter in tRPC subscription still correct |
| `src/lib/trpc/routers/ports/ports.ts` | Already uses `getWorkspacePath()` for DB lookups; `subscribeStatic` filters by workspaceId |
| `src/renderer/**` | Consumers (`useFsSubscription`, `FilesView`, `ChangesView`) all pass workspaceId already |

## Edge Cases

### Worktree not yet created when workspace is set active
`setLastActiveWorkspace()` calls `getWorkspacePath()` which returns null if the worktree record doesn't exist yet. In this case, no `switchTo` happens. When `workspace-init.ts` finishes creating the worktree, it checks `settings.lastActiveWorkspaceId === workspaceId` and calls `switchTo` if it matches.

### Delete cancellation race
The delete flow:
1. `unwatch(id)` — no-op if not active
2. `markWorkspaceAsDeleting(id)`
3. `updateActiveWorkspaceIfRemoved(id)` → `setLastActiveWorkspace(nextId)` → `switchTo(nextId)`
4. If deletion fails: `clearWorkspaceDeletingStatus(id)` then `switchTo(id, savedRootPath)` to re-attach

### Init watch resolves after delete unwatch
Same race as before: delete's first `unwatch` is a no-op because `switchTo` hasn't resolved yet. After `waitForInit`, the second `unwatch` cleans up the late watcher. No behavioral change — the guard in `unwatch` (`if active.workspaceId !== id return`) handles this.

## Verification

1. `bun test` in `apps/desktop` — run updated fs-watcher tests
2. `bun run typecheck` — ensure all callers compile
3. Manual test: open app with multiple workspaces, verify only active workspace gets fs events (check `[fs-watcher]` console logs), switch workspaces and verify watcher switches
