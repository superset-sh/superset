# Workspace Filesystem Migration Plan

## Summary

We need to replace the current ad hoc filesystem setup with a single workspace filesystem layer that:

- watches workspace files reliably
- updates the UI from filesystem events instead of manual refreshes
- uses absolute paths as the canonical file identity everywhere
- keeps security and workspace-boundary validation consistent
- consolidates file search, keyword/content search, and watching in one module
- removes duplicated search and indexing code

This does not require a fresh architecture rewrite anymore. The current `packages/workspace-fs` boundary is already close to the right shape. The remaining work is to tighten that boundary so the package is explicitly split into transport-neutral core contracts and host-side implementations.

This should behave more like VS Code:

- files are identified by absolute path
- rename and move are first-class path transitions
- relative paths are derived display data, not primary identifiers
- file trees and search results react to external changes automatically
- file viewer, editor save/read flows, and changes sidebar selection/scroll state use absolute paths instead of repo-relative keys

## Decisions

- Primary watcher backend: `@parcel/watcher`
- Content search: `ripgrep`
- Filename/path search: `fast-glob` + `Fuse.js` initially
- New shared package: `packages/workspace-fs`
- Canonical file identity: `absolutePath`
- Scope and permissions boundary: `workspaceId`
- Renderer event transport: desktop tRPC subscriptions
- Only active workspaces should have live filesystem listeners
- The filesystem service must be transport-agnostic so it can run either in desktop main or on a remote workspace host

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

At this point, the practical refactor target is:

- keep `packages/workspace-fs` as the boundary
- make `core` vs `host` explicit in code layout and exports
- keep the current desktop-main host shape
- avoid broad API churn unless it improves transport neutrality or host ownership

It also needs to be deployable in more than one place:

- local desktop main process for today
- remote workspace host/server for future remote development

That means the core filesystem service cannot be tightly coupled to Electron, renderer state, or desktop-only runtime assumptions.

## Current Problems

### Mixed filesystem models

The current desktop router exposes broad absolute-path CRUD and search operations:

- `apps/desktop/src/lib/trpc/routers/filesystem/index.ts`

Changes/File Viewer use a separate secure worktree-bound implementation:

- `apps/desktop/src/lib/trpc/routers/changes/security/path-validation.ts`
- `apps/desktop/src/lib/trpc/routers/changes/file-contents.ts`

This creates inconsistent behavior and duplicated path logic.

### No general filesystem event stream

There is a `FileSystemChangeEvent` type:

- `apps/desktop/src/shared/file-tree-types.ts`

But there is no general filesystem subscription. The file explorer still depends on manual invalidation and refresh.

### File explorer identity is ad hoc

The file explorer encodes item ids as a serialized string combining path, name, relative path, and type:

- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/FilesView.tsx`

That makes rename, move, and reconciliation harder than they need to be.

### Search is duplicated

Search/indexing logic exists in multiple places:

- `apps/desktop/src/lib/trpc/routers/filesystem/index.ts`
- `packages/chat/src/host/router/file-search/file-search.ts`
- `packages/chat-mastra/src/server/trpc/utils/file-search/file-search.ts`

### Existing watcher logic is special-case only

There is an ad hoc `fs.watch` implementation for static ports:

- `apps/desktop/src/main/lib/static-ports/watcher.ts`

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
- renderer query inputs should use `absolutePath`; relative paths are only for display or git-native payloads that have not yet been normalized

## New package

Create `packages/workspace-fs` as the only filesystem abstraction shared by desktop and any host-side consumers.

Suggested structure:

```text
packages/workspace-fs/
  src/
    index.ts
    core/
    host/
    client/
    types.ts
    paths.ts
    fs.ts
    search.ts
    watch.ts
```

The package should be split explicitly, but without forcing a rewrite of every existing file:

```text
packages/workspace-fs/
  src/
    core/        # path rules, shared types, service contracts
    host/        # local node host implementation, future remote host implementation
    client/      # transport/client-side interfaces and adapters
```

`core/` should not import Electron APIs, Node filesystem APIs, or desktop app state.

The first cut can keep existing implementation files and re-export them through `core/` and `host/` modules. Physical file moves are optional; explicit boundaries are not.

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
- active-workspace-only lifecycle
- reference-counted sharing across consumers in the same workspace

`search/` and `watch/` should be implemented as one coordinated subsystem inside `packages/workspace-fs`, not as separate feature-specific utilities. Watching is what keeps file search and keyword/content search coherent after external edits, git operations, and file moves.

## Remote-Capable Architecture Direction

The filesystem layer should follow a thin-client plus workspace-host shape, similar to VS Code Remote and JetBrains Gateway:

- the UI/client stays local
- workspace/file operations run where the workspace actually lives
- the client talks to a small workspace service over a stable protocol
- local and remote workspaces share the same logical filesystem contract

For this repo, that means `packages/workspace-fs` should become a standalone workspace service, not just a desktop helper package.

### Pattern decision

There are three relevant patterns:

1. Thin client + workspace host
   - local UI
   - file IO, watchers, search, and indexing run next to the workspace
   - one stable service contract used locally or remotely

2. Control plane + workspace agent
   - adds lifecycle management, scheduling, reconnect, and multi-workspace orchestration
   - useful once remote workspaces are a product/platform concern

3. Containerized remote workspace
   - standardizes the runtime environment around the workspace host
   - useful for reproducibility and isolation, but it is a deployment choice rather than the filesystem contract itself

Recommended path:

- build `workspace-fs` now around pattern 1
- leave room for pattern 2 as the scale-out path
- treat pattern 3 as an optional future runtime around the host, not as a reason to change the filesystem API

Why this is the right shape for this repo:

- it matches the current desktop need without introducing control-plane complexity early
- it keeps watchers, search indexes, and disk access on the machine that owns the workspace
- it allows desktop main today and a remote server later to use the same host implementation
- it avoids another filesystem rewrite if remote workspaces become a first-class feature later

### Design requirements

- define one transport-neutral service contract for queries, mutations, search, and watch streams
- keep the contract identical whether the backing workspace is local or remote
- isolate transport from logic: local in-process adapter today, remote RPC/streaming adapter later
- avoid Electron-specific types or assumptions in the core service surface
- treat watcher events as service output, not desktop-main-only internals
- make search and watch state live with the workspace service, not with the renderer
- keep file identity URI-friendly so local absolute paths can evolve into remote workspace URIs without redesigning the whole API

### Recommended shape

Split the system into three layers:

1. `workspace-fs core`
   - path policy
   - security policy
   - query/mutation/search/watch logic
   - normalized event model

2. `workspace-fs host`
   - local desktop host adapter for Node/Electron main
   - future remote host adapter running next to the workspace on a server/agent
   - owns watcher lifecycle and local disk/tool access

3. `workspace-fs client`
   - desktop renderer client today
   - future web/remote client
   - consumes the same service contract over local IPC or remote transport

If remote workspace lifecycle management is added later, it should wrap these layers rather than replacing them:

- `control plane`
  - workspace discovery
  - auth/session routing
  - agent registration
  - health/capability reporting

- `workspace agent`
  - launches or attaches to a `workspace-fs host`
  - owns workspace-local process access
  - reports status to the control plane

### API direction for remote readiness

The public contract should move away from “desktop router methods” and toward a workspace service interface such as:

```ts
interface WorkspaceFsService {
  listDirectory(input: {
    workspaceId: string;
    absolutePath: string;
  }): Promise<WorkspaceFsEntry[]>;

  readTextFile(input: {
    workspaceId: string;
    absolutePath: string;
  }): Promise<ReadTextResult>;

  writeTextFile(input: {
    workspaceId: string;
    absolutePath: string;
    content: string;
    expectedContent?: string;
  }): Promise<SaveResult>;

  searchFiles(input: {
    workspaceId: string;
    query: string;
    includePattern?: string;
    excludePattern?: string;
    limit?: number;
  }): Promise<WorkspaceFsSearchResult[]>;

  watchWorkspace(input: {
    workspaceId: string;
  }): AsyncIterable<WorkspaceFileEvent>;
}
```

Desktop should then use an adapter:

- local adapter: renderer → desktop main → local `workspace-fs host`
- remote adapter: renderer → remote session transport → remote `workspace-fs host`

### Identity recommendation for remote support

Keep `absolutePath` as the canonical identity for local workspaces, but structure the model so it can evolve into a location URI cleanly.

Short term:

- continue using canonical local `absolutePath`
- keep `workspaceId` mandatory on all service calls
- never make renderer logic depend on `path.join`/`fsPath` semantics directly

Medium term:

- introduce a `resourceUri` or equivalent transport-safe identifier alongside `absolutePath`
- local workspaces can derive it from file paths
- remote workspaces can use a workspace-scoped URI scheme without changing higher-level UI logic

This is an architectural inference from VS Code’s remote workspace and virtual filesystem model, where the UI does not assume all resources are local disk `file:` paths.

### Operational requirements for a remote host

- host watchers/search/indexes must run on the same machine as the workspace
- shell/ripgrep/native file access must stay in the host layer
- reconnect logic must support snapshot/revision catch-up after transport interruption
- the client must tolerate degraded or partial capability sets from the host
- capability negotiation should be explicit so desktop can know whether the host supports watch, keyword search, binary preview, etc.

### Non-goals for the first remote-ready cut

- do not build full remote execution/tunneling now
- do not build a control plane or workspace scheduler now
- do not make containerization a dependency of the filesystem contract
- do not redesign the whole app around non-file URI schemes yet
- do make sure today’s interfaces can be wrapped by a remote host without another filesystem rewrite

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

## Performance Priorities

Performance work should be implemented in this order:

### Priority 0: Required baseline

- only active workspaces should have live watchers
- one shared watcher per active workspace root in main
- renderer subscriptions must ref-count onto that single watcher instead of creating parallel listeners
- no background listeners for inactive, hidden, or unopened workspaces

This is the highest-value control. The app should never watch every registered workspace by default.

### Priority 1: Event reduction

- filter ignored paths before they leave the watcher layer
- debounce/coalesce bursts from `git checkout`, installs, and branch switches
- coalesce duplicate same-path watcher events within each debounce flush before normalization and renderer fanout
- emit `overflow` and force snapshot reconciliation when event streams become unreliable

This keeps bursty workspace churn from overwhelming renderer state and query invalidation.

### Priority 2: Smarter invalidation

- patch visible tree state directly for create/update/delete where possible
- for the file tree specifically: invalidate only affected parent directories during normal create/delete events, and reserve full tree refresh for overflow, root-path changes, or unrecoverable cache uncertainty
- avoid broad query invalidation on every filesystem event
- refresh only expanded folders, selected files, and open editors eagerly
- make the changes sidebar recompute only when events can affect git-visible state
- for open editors, invalidate only the active file payload for the current view mode rather than raw/image/diff/status together
- for Changes specifically: invalidate git status on workspace file events, invalidate branches only on overflow or branch-level uncertainty, and invalidate diff contents only for the selected file rather than all file diff queries

This is the main UI responsiveness improvement after watcher count is under control.

### Priority 3: Search/index efficiency

- keep file search, keyword/content search, and watching in one subsystem
- move from invalidate-all toward incremental index patching
- patch cached filename search indexes directly from normal create/update/delete events
- batch filename-index patch application per watcher flush so fuzzy index rebuild happens once per burst, not once per event
- reserve full index rebuilds for overflow, startup, or unrecoverable churn

This matters most on large repositories and after bulk filesystem operations.

### Priority 4: Hot-path filesystem caching

- add short-lived caches for repeated `stat`/`realpath`/path-validation work on open files
- cache should be conservative and easy to invalidate from watcher events

This is useful, but it comes after watcher scoping and invalidation improvements.

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
- remove dead Changes security layers like `secure-fs` and the barrel exports once callers use `workspace-fs` directly

Important detail:

- remove `fs.access()` preflight existence checks where they introduce race windows
- instead perform the intended filesystem operation and handle the resulting error directly

Deliverable:

- one security model for file explorer, file viewer, changes, and chat

### Phase 3: Add watcher infrastructure with `@parcel/watcher`

- create `WorkspaceWatcherManager` in desktop main
- one watcher per active workspace root
- share watchers across subscribers with reference counting
- normalize backend events into the shared event model
- debounce noisy event bursts
- coalesce duplicate same-path bursts before stat/normalization work
- emit `overflow` when the stream cannot be trusted and require a full snapshot refresh
- tear watchers down when a workspace is no longer active or has no subscribers

Deliverable:

- stable workspace-scoped file event subscriptions

### Phase 4: Add desktop tRPC filesystem subscriptions

- add a `filesystem.subscribeWorkspace` subscription route
- stream normalized file events to renderer consumers
- emit initial revision metadata on subscription
- only subscribe for active/visible workspace consumers

Deliverable:

- renderer can subscribe to workspace file changes without polling

### Phase 5: Rebuild the file explorer around absolute paths

- replace serialized item ids with canonical `absolutePath`
- store expanded folders and selection state by absolute path
- use subscription-driven updates instead of manual refresh after each mutation
- keep the manual refresh button as a fallback only

Files likely involved:

- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/FilesView.tsx`
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/hooks/useFileTreeActions.ts`
- `apps/desktop/src/renderer/stores/file-explorer.ts`

Deliverable:

- file tree reacts to external edits, creates, deletes, and renames automatically

### Phase 6: Consolidate search and indexing

- move desktop file search and keyword search into `packages/workspace-fs`
- move duplicated chat host search implementations into the same package
- keep watching in the same module so file search and keyword/content search share one invalidation path
- invalidate and patch file search indexes from watcher events
- prioritize incremental patching over full rebuilds where event quality allows
- keep full filename-index invalidation as the fallback for overflow, watcher errors, or other unrecoverable cache uncertainty
- keep `ripgrep` as the primary content search engine

Deliverable:

- one consolidated search-and-watch implementation for desktop and chat host code

### Phase 7: Make `workspace-fs` hostable as a standalone service

Status:

- completed:
  - explicit `core`, `host`, and `client` module split
  - transport-neutral service contract for query/mutation/search/watch
  - local host service with `workspaceId -> rootPath` resolution
  - desktop router and Changes/File Viewer access routed through one local adapter module
  - host-side service metadata via `getServiceInfo()`
  - transport-neutral client factory
  - derived resource URI helpers
- remaining:
  - concrete local transport adapter object over desktop tRPC
  - mock remote transport adapter tests
  - real remote HTTP/WebSocket host adapter when remote workspace work starts

- formalize the existing boundary into explicit `core`, `host`, and `client` modules
- split core contracts from host-side implementations without rewriting stable logic unnecessarily
- define a transport-neutral service interface for query/mutation/search/watch
- add a host service that resolves `workspaceId` to a workspace root and exposes one service object for the desktop router
- move desktop filesystem search endpoints off raw `rootPath` inputs and onto `workspaceId`-scoped service calls
- add service-level tests around host root resolution and watch-stream behavior
- collapse desktop router imports behind one local adapter module so desktop code no longer imports scattered `workspace-fs/host` helpers directly
- move directory/search/watch shaping into that adapter module so the desktop filesystem router is mostly transport/schema glue
- move registered-worktree file reads/writes/path conversion into that adapter module so Changes/File Viewer routers stop owning low-level filesystem policy
- move workspace CRUD/stat/exists response shaping into that adapter module so the filesystem router is only transport/input-output mapping
- keep Electron IPC as one host adapter, not the service itself
- make watcher/search state belong to the host layer
- prepare for a future remote workspace host that runs beside the workspace
- add a host/service descriptor with explicit capabilities and host kind
- add a transport-neutral client factory so remote transports can satisfy the same `workspace-fs` contract
- add derived resource URI helpers for future non-local hosts while keeping `absolutePath` canonical for local operations
- expose desktop host service info through a thin router endpoint instead of treating Electron as the contract

Deliverable:

- `workspace-fs` can be embedded locally or exposed by a remote host without changing higher-level consumers, and current desktop imports already map cleanly onto `host`
- concrete transport implementation work is tracked separately in `plans/workspace-filesystem-transport-plan.md`

### Phase 8: Migrate Changes and File Viewer consumers

- route file reads and writes through `packages/workspace-fs`
- keep existing symlink protections
- standardize file stat and existence lookups on the same package

Deliverable:

- changes, diff, and file viewer use the same filesystem contract as the explorer

### Phase 9: Replace special-case watchers

- move the static ports watcher logic onto the shared watcher infrastructure
- stop adding one-off watcher implementations for feature-specific files

Deliverable:

- watcher logic is centralized in one system

### Phase 10: Remove legacy code

- delete old duplicated search implementations
- delete the desktop filesystem router’s private search/index/cache code once all search procedures delegate to `workspace-fs`
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

filesystem.getServiceInfo()
```

Notes:

- directory/file targets are always absolute
- `workspaceId` is always required
- `relativePath` should never be required input
- local hosts expose `absolutePath` as the canonical identity, while resource URIs are derived metadata for future remote transports
- desktop router procedures should be thin adapters over the `workspace-fs` host service, not independent filesystem logic

## Rollout Strategy

- migrate in staged implementation steps, but keep one active runtime path
- switch each consumer directly onto `packages/workspace-fs` as it is migrated
- compare old and new behavior during development and testing, not through a long-lived dual runtime path
- instrument:
  - active watcher count
  - watcher count
  - event lag
  - burst size / debounce flush size
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
- current implementation emits `rename` only for confident watcher matches:
  - one delete + one create in the same parent
  - one delete + one create with the same basename
  - a single remaining delete/create pair in a flush
- when a `rename` event is emitted, renderer state retargets open file viewers and selected Changes entries by absolute path, and the file tree restores expanded renamed directories
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
- open file viewers and Changes selection follow confident rename/move transitions without falling back to stale absolute paths
- file search and content search update coherently after external changes
- explorer, changes, file viewer, and chat host code use one filesystem package
- no new feature adds a one-off watcher outside the shared watcher manager
- the filesystem contract is not Electron-specific and can be hosted remotely behind a transport adapter
- watcher/search/index state lives with the workspace host layer, not the renderer
- local desktop is just one client/host deployment mode of the same filesystem service

## Recommended First Implementation Slice

Build the smallest useful path first:

1. create `packages/workspace-fs`
2. implement absolute-path normalization and workspace security
3. implement `listDirectory`, `stat`, and `rename`
4. add `@parcel/watcher` workspace subscription
5. migrate file explorer tree ids and refresh logic

That gives the fastest proof that the new model works before moving search, file viewer, and the rest of the mutation surface.
