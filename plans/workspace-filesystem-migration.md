# Workspace Filesystem Migration Plan

## Summary

We need to replace the current ad hoc filesystem setup with a single workspace filesystem layer that:

- watches workspace files reliably
- updates the UI from filesystem events instead of manual refreshes
- uses absolute paths as the canonical file identity everywhere
- keeps security and workspace-boundary validation consistent
- consolidates file search, keyword/content search, and watching in one module
- removes duplicated search and indexing code

This should behave more like VS Code:

- files are identified by absolute path
- rename and move are first-class path transitions
- relative paths are derived display data, not primary identifiers
- file trees and search results react to external changes automatically

## Decisions

- Primary watcher backend: `@parcel/watcher`
- Content search: `ripgrep`
- Filename/path search: `fast-glob` + `Fuse.js` initially
- New shared package: `packages/workspace-fs`
- Canonical file identity: `absolutePath`
- Scope and permissions boundary: `workspaceId`
- Renderer event transport: desktop tRPC subscriptions

## Why This Shape

These choices are mainly about reducing filesystem inconsistency in the app:

- `packages/workspace-fs` gives the repo one filesystem implementation instead of separate explorer, changes, and chat-host variants
- `absolutePath` as canonical identity makes rename and move behave predictably and avoids ad hoc relative-path ids
- `workspaceId` keeps permissions and watcher ownership tied to a registered workspace boundary
- watcher-driven updates replace manual invalidation and stale caches
- file search, keyword/content search, and watching live together, so index invalidation and tree reconciliation use the same source of truth
- shared path validation removes repeated logic and drift between features

The goal is to make the system simpler to reason about during implementation:

- one package
- one identity model
- one watcher system
- one security model

## Current Problems

### Mixed filesystem models

The current desktop router exposes broad absolute-path CRUD and search operations:

- [apps/desktop/src/lib/trpc/routers/filesystem/index.ts](/Users/kietho/.superset/worktrees/superset/kitenite/luxurious-paint/apps/desktop/src/lib/trpc/routers/filesystem/index.ts)

Changes/File Viewer use a separate secure worktree-bound implementation:

- [apps/desktop/src/lib/trpc/routers/changes/security/path-validation.ts](/Users/kietho/.superset/worktrees/superset/kitenite/luxurious-paint/apps/desktop/src/lib/trpc/routers/changes/security/path-validation.ts)
- [apps/desktop/src/lib/trpc/routers/changes/file-contents.ts](/Users/kietho/.superset/worktrees/superset/kitenite/luxurious-paint/apps/desktop/src/lib/trpc/routers/changes/file-contents.ts)

This creates inconsistent behavior and duplicated path logic.

### No general filesystem event stream

There is a `FileSystemChangeEvent` type:

- [apps/desktop/src/shared/file-tree-types.ts](/Users/kietho/.superset/worktrees/superset/kitenite/luxurious-paint/apps/desktop/src/shared/file-tree-types.ts)

But there is no general filesystem subscription. The file explorer still depends on manual invalidation and refresh.

### File explorer identity is ad hoc

The file explorer encodes item ids as a serialized string combining path, name, relative path, and type:

- [apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/FilesView.tsx](/Users/kietho/.superset/worktrees/superset/kitenite/luxurious-paint/apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/FilesView.tsx)

That makes rename, move, and reconciliation harder than they need to be.

### Search is duplicated

Search/indexing logic exists in multiple places:

- [apps/desktop/src/lib/trpc/routers/filesystem/index.ts](/Users/kietho/.superset/worktrees/superset/kitenite/luxurious-paint/apps/desktop/src/lib/trpc/routers/filesystem/index.ts)
- [packages/chat/src/host/router/file-search/file-search.ts](/Users/kietho/.superset/worktrees/superset/kitenite/luxurious-paint/packages/chat/src/host/router/file-search/file-search.ts)
- [packages/chat-mastra/src/server/trpc/utils/file-search/file-search.ts](/Users/kietho/.superset/worktrees/superset/kitenite/luxurious-paint/packages/chat-mastra/src/server/trpc/utils/file-search/file-search.ts)

### Existing watcher logic is special-case only

There is an ad hoc `fs.watch` implementation for static ports:

- [apps/desktop/src/main/lib/static-ports/watcher.ts](/Users/kietho/.superset/worktrees/superset/kitenite/luxurious-paint/apps/desktop/src/main/lib/static-ports/watcher.ts)

This should be absorbed into a general workspace watcher system instead of repeated for other file features.

## Target Architecture

## Core contract

Every filesystem operation should be scoped by `workspaceId`, but canonical file identity should be `absolutePath`.

Every file-facing model should include:

- `workspaceId`
- `absolutePath`
- `name`
- `isDirectory`
- `relativePath` derived from the workspace root for display only

Rules:

- `absolutePath` is the only stable identifier
- `relativePath` is derived metadata
- move and rename produce a new `absolutePath`
- UI state such as expansion and selection is keyed by `absolutePath`

## New package

Create `packages/workspace-fs` as the only filesystem abstraction shared by desktop and any host-side consumers.

Suggested structure:

```text
packages/workspace-fs/
  src/
    index.ts
    types/
    paths/
    security/
    queries/
    mutations/
    search/
    watch/
```

## Responsibilities

### `paths/`

- canonicalize absolute paths
- derive relative paths from workspace root
- normalize platform-specific path formatting

### `security/`

- validate workspace registration
- validate absolute path belongs to workspace
- enforce symlink escape policy

### `queries/`

- list directory
- stat
- exists
- read text
- read binary/image

### `mutations/`

- create file
- create directory
- rename
- move
- copy
- delete
- write file

### `search/`

- file-name/path search using `fast-glob` + `Fuse.js`
- content search using `ripgrep`
- shared ignore rules
- watcher-driven invalidation

### `watch/`

- one watcher manager for workspace roots
- normalized event stream
- debouncing and overflow handling
- snapshot support

`search/` and `watch/` should be implemented as one coordinated subsystem inside `packages/workspace-fs`, not as separate feature-specific utilities. Watching is what keeps file search and keyword/content search coherent after external edits, git operations, and file moves.

## Event Model

Normalized event shape:

```ts
type WorkspaceFileEvent =
  | {
      type: "create";
      workspaceId: string;
      absolutePath: string;
      isDirectory: boolean;
      revision: number;
    }
  | {
      type: "update";
      workspaceId: string;
      absolutePath: string;
      isDirectory: boolean;
      revision: number;
    }
  | {
      type: "delete";
      workspaceId: string;
      absolutePath: string;
      isDirectory: boolean;
      revision: number;
    }
  | {
      type: "rename";
      workspaceId: string;
      oldAbsolutePath: string;
      absolutePath: string;
      isDirectory: boolean;
      revision: number;
    }
  | {
      type: "overflow";
      workspaceId: string;
      revision: number;
    };
```

Notes:

- `relativePath` can be attached as derived metadata when useful, but it should not be required by the contract
- `overflow` means the renderer must request a fresh snapshot
- `revision` gives subscribers an ordered stream for reconciliation

## Migration Phases

### Phase 1: Create the shared package

- add `packages/workspace-fs`
- define shared types for file entries, mutations, search results, and watcher events
- move path normalization and workspace-boundary validation into the package

Deliverable:

- a package that can resolve and validate workspace-scoped absolute paths

### Phase 2: Unify security and path handling

- migrate the existing Changes/File Viewer validation model into `packages/workspace-fs`
- stop exposing raw arbitrary absolute-path operations directly from desktop router internals
- require `workspaceId` on all public filesystem operations
- require canonical absolute paths on all file operations

Important detail:

- remove `fs.access()` preflight existence checks where they introduce race windows
- instead perform the intended filesystem operation and handle the resulting error directly

Deliverable:

- one security model for file explorer, file viewer, changes, and chat

### Phase 3: Add watcher infrastructure with `@parcel/watcher`

- create `WorkspaceWatcherManager` in desktop main
- one watcher per workspace root
- share watchers across subscribers with reference counting
- normalize backend events into the shared event model
- debounce noisy event bursts
- emit `overflow` when the stream cannot be trusted and require a full snapshot refresh

Deliverable:

- stable workspace-scoped file event subscriptions

### Phase 4: Add desktop tRPC filesystem subscriptions

- add a `filesystem.subscribeWorkspace` subscription route
- stream normalized file events to renderer consumers
- emit initial revision metadata on subscription

Deliverable:

- renderer can subscribe to workspace file changes without polling

### Phase 5: Rebuild the file explorer around absolute paths

- replace serialized item ids with canonical `absolutePath`
- store expanded folders and selection state by absolute path
- use subscription-driven updates instead of manual refresh after each mutation
- keep the manual refresh button as a fallback only

Files likely involved:

- [apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/FilesView.tsx](/Users/kietho/.superset/worktrees/superset/kitenite/luxurious-paint/apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/FilesView.tsx)
- [apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/hooks/useFileTreeActions.ts](/Users/kietho/.superset/worktrees/superset/kitenite/luxurious-paint/apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/hooks/useFileTreeActions.ts)
- [apps/desktop/src/renderer/stores/file-explorer.ts](/Users/kietho/.superset/worktrees/superset/kitenite/luxurious-paint/apps/desktop/src/renderer/stores/file-explorer.ts)

Deliverable:

- file tree reacts to external edits, creates, deletes, and renames automatically

### Phase 6: Consolidate search and indexing

- move desktop file search and keyword search into `packages/workspace-fs`
- move duplicated chat host search implementations into the same package
- keep watching in the same module so file search and keyword/content search share one invalidation path
- invalidate and patch file search indexes from watcher events
- keep `ripgrep` as the primary content search engine

Deliverable:

- one consolidated search-and-watch implementation for desktop and chat host code

### Phase 7: Migrate Changes and File Viewer consumers

- route file reads and writes through `packages/workspace-fs`
- keep existing symlink protections
- standardize file stat and existence lookups on the same package

Deliverable:

- changes, diff, and file viewer use the same filesystem contract as the explorer

### Phase 8: Replace special-case watchers

- move the static ports watcher logic onto the shared watcher infrastructure
- stop adding one-off watcher implementations for feature-specific files

Deliverable:

- watcher logic is centralized in one system

### Phase 9: Remove legacy code

- delete old duplicated search implementations
- delete obsolete absolute-path router internals
- remove unused file-tree hooks and stale refresh paths

Deliverable:

- one filesystem package, one watcher system, one security model

## API Direction

The public desktop router should move toward package-backed methods like:

```ts
filesystem.listDirectory({
  workspaceId,
  absolutePath,
})

filesystem.rename({
  workspaceId,
  absolutePath,
  newName,
})

filesystem.move({
  workspaceId,
  absolutePaths,
  destinationAbsolutePath,
})

filesystem.searchFiles({
  workspaceId,
  query,
})

filesystem.subscribeWorkspace({
  workspaceId,
})
```

Notes:

- directory/file targets are always absolute
- `workspaceId` is always required
- `relativePath` should never be required input

## Rollout Strategy

- migrate in staged implementation steps, but keep one active runtime path
- switch each consumer directly onto `packages/workspace-fs` as it is migrated
- compare old and new behavior during development and testing, not through a long-lived dual runtime path
- instrument:
  - watcher count
  - event lag
  - overflow count
  - full-rescan count
  - index rebuild duration
  - mutation error rates

## Risks

### Native dependency risk

`@parcel/watcher` introduces native packaging considerations.

Mitigation:

- isolate watcher backend behind an internal adapter
- validate packaging and runtime behavior early in the migration

### Rename detection ambiguity

Some watcher backends emit create/delete pairs rather than a true rename.

Mitigation:

- normalize obvious cases where possible
- treat ambiguous cases as delete + create
- reserve `rename` for confidently matched transitions

### Large repo churn

`git checkout`, branch switching, and install steps can emit large bursts of changes.

Mitigation:

- debounce/coalesce events
- support overflow/full snapshot reconciliation
- use snapshots for restart recovery

## Acceptance Criteria

- all file identities in the app are canonical absolute paths
- `relativePath` is derived and display-only
- external file edits appear in the file explorer without manual refresh
- rename and move update tree state correctly
- file search and content search update coherently after external changes
- explorer, changes, file viewer, and chat host code use one filesystem package
- no new feature adds a one-off watcher outside the shared watcher manager

## Recommended First Implementation Slice

Build the smallest useful path first:

1. create `packages/workspace-fs`
2. implement absolute-path normalization and workspace security
3. implement `listDirectory`, `stat`, and `rename`
4. add `@parcel/watcher` workspace subscription
5. migrate file explorer tree ids and refresh logic

That gives the fastest proof that the new model works before moving search, file viewer, and the rest of the mutation surface.
