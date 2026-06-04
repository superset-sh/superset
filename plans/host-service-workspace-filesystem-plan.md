# Host-Service Workspace Filesystem Plan

## Summary

This doc defines what we need to add to host-service to expose workspace
filesystem operations, and what reusable React hooks we should build so the same
filesystem UX can be used from web, desktop, and mobile.

The goal is not to redesign `packages/workspace-fs`. The goal is to make the
existing filesystem contract available through host-service and to stop
re-implementing file tree / file document behavior per app.

## Status

- Owner: platform/workspaces
- Scope: host-service filesystem + shared React client layer
- Last updated: 2026-03-18

## What Exists Today

Current foundation already in place:

- `packages/workspace-fs` already defines the transport-neutral filesystem
  contract and host implementation.
- Desktop already exposes a full filesystem router over Electron tRPC.
- Desktop already has working file-tree, file-open, and file-watch behavior.
- Host-service already has:
  - local workspace DB rows with `workspaceId -> worktreePath`
  - unary tRPC routes over HTTP
  - websocket infrastructure for terminal routes
  - long-lived runtime managers for other capabilities

What host-service does not have today:

- no filesystem runtime/service cache
- no filesystem router
- no watch transport for filesystem events
- no shared client/hook layer outside desktop-specific code

## Goals

- expose the existing workspace filesystem contract from host-service
- support file tree, file open, save, rename, delete, and search flows
- support watch-driven refresh for both file tree and file viewers
- share React hooks across web, desktop, and mobile
- keep watcher/search/index ownership host-side
- keep host-service path access workspace-scoped
- avoid duplicating tree invalidation logic in each app

## Non-Goals

- do not redesign the `workspace-fs` API shape in this plan
- do not redesign git/sidebar UX in this plan
- do not move tree rendering components into a shared package yet
- do not require every app to use identical UI state stores
- do not solve offline mobile filesystem caching in v1

## Locked Decisions

- `packages/workspace-fs` remains the source of truth for filesystem semantics
- host-service should expose a dedicated `filesystem` capability, not fold this
  into `workspace`
- workspace scoping stays above the pure filesystem shim
- watcher streams are shared per workspace on the client side
- file-tree hooks own data fetching and invalidation, not view rendering

## Proposed Host-Service Additions

## 1. Add a filesystem manager

Create:

- `packages/host-service/src/runtime/filesystem/index.ts`
- `packages/host-service/src/runtime/filesystem/filesystem.ts`

Suggested responsibility:

- resolve `workspaceId -> rootPath`
- cache one `FsHostService` per workspace root
- own one shared `FsWatcherManager`
- own host-side search/watch lifecycle
- expose a narrow runtime API to routers

Suggested shape:

```ts
interface WorkspaceFilesystemManager {
  getServiceForWorkspace(workspaceId: string): FsHostService
  resolveWorkspaceRoot(workspaceId: string): string
  close(): Promise<void>
}
```

This should mirror the existing desktop adapter pattern instead of inventing a
new filesystem implementation.

## 2. Add a `filesystem` router to host-service

Create:

- `packages/host-service/src/trpc/router/filesystem/index.ts`
- `packages/host-service/src/trpc/router/filesystem/filesystem.ts`

Mount it in:

- `packages/host-service/src/trpc/router/router.ts`

Unary procedures should mirror desktop's router 1:1:

- `listDirectory`
- `readFile`
- `getMetadata`
- `writeFile`
- `createDirectory`
- `deletePath`
- `movePath`
- `copyPath`
- `searchFiles`
- `searchContent`

Rules:

- every procedure takes `workspaceId`
- router resolves workspace scope through the runtime manager
- byte reads stay serializable over the wire
- errors should normalize to stable host-service error codes

## 3. Add a watch transport for filesystem events

Host-service already has HTTP tRPC plus standalone websocket support. Filesystem
watch should use the same split described in `plans/workspace-filesystem-transport-plan.md`:

- unary calls over HTTP request/response
- file watch over a long-lived websocket stream

Do not make every React hook open its own watch socket. We want:

- one workspace watch session per client workspace
- client-side fanout to multiple listeners
- automatic cleanup when the last listener unsubscribes

The app-facing subscription should be workspace-scoped:

- client subscribes with `workspaceId` only
- host-service resolves `workspaceId -> rootPath`
- host-service internally watches the workspace root recursively

`watchPath(...)` can remain an internal service capability, but the first-pass
wire protocol should be `subscribeToWorkspaceFsEvents({ workspaceId })`.

Event payload should include:

- `kind`
- `absolutePath`
- `oldAbsolutePath?`
- `isDirectory`

`isDirectory` should be added even though the current public `FsWatchEvent`
type does not include it, because both tree reconciliation and open-file rename
handling benefit from it.

## 4. Extend host-service runtime/context wiring

Update:

- `packages/host-service/src/app.ts`
- `packages/host-service/src/types.ts`

Add:

- `runtime.filesystem`

This is a lightweight long-lived host capability. The main reason it exists is
shared watcher/search lifecycle, not because filesystem needs chat-style runtime
semantics.

## Shared Client Architecture

## 1. Keep `packages/workspace-fs` transport-neutral

`packages/workspace-fs` should continue to own:

- types
- core service contract
- host implementation
- transport-neutral client factory

It should not become the main consumer-facing host-service SDK surface.

## 2. Add a shared consumer-facing React client layer

We need one shared React client layer that can be used from web, desktop, and
mobile.

Package name:

- `@superset/workspace-client`

- consumer-facing workspace client surface
- React-compatible hooks for filesystem state
- React-only for now
- no app-specific imports like `electronTrpc` inside shared hooks

This package should expose only the shared behavior that is hard to reimplement
correctly, not a hook-per-tRPC-method wrapper layer.

It should formalize the provider/client shape desktop already has in
`v2-workspace`, rather than inventing a second mount mechanism.

Suggested shape:

- `WorkspaceClientProvider({ hostUrl, cacheKey, children })`
- `useWorkspaceClient()`

The provider should own:

- workspace-scoped tRPC client
- workspace-scoped React Query client
- a narrow streamed filesystem subscription API such as
  `subscribeToWorkspaceFsEvents(...)`

The provider should not expose a raw websocket client. Hooks should consume the
filesystem event subscription capability, not transport internals.

`useWorkspaceClient()` is primarily plumbing for shared hooks. Most app code
should consume higher-level hooks rather than the raw client context.

Suggested client surface:

```ts
interface WorkspaceClientContextValue {
  hostUrl: string
  queryClient: QueryClient
  subscribeToWorkspaceFsEvents(input: {
    workspaceId: string
    onEvent: (event: WorkspaceFsWatchEvent) => void
    onError?: (error: unknown) => void
  }): () => void
}
```

## 3. Shared hooks

### Shared event bridge hooks

These hooks centralize watch subscriptions and fan out events to all consumers
in a workspace.

- `useWorkspaceFsEvents(workspaceId, listener, options?)`
- `useWorkspaceFsEventBridge(workspaceId, options?)`

Responsibilities:

- one socket/subscription per workspace
- debounce/coalesce on the host side, not in every component
- fan out to file tree, open files, git status, search invalidation
- full resync on `overflow`

Expected split:

- `useWorkspaceFsEventBridge(workspaceId)` ensures the shared subscription is
  alive for that workspace
- `useWorkspaceFsEvents(workspaceId, listener)` attaches a local listener to the
  shared stream

`useWorkspaceFsEventBridge` should not figure out host/device routing itself.
That routing should already be resolved at the `WorkspaceClientProvider`
boundary.

### High-level hooks

These hooks own reusable filesystem UX behavior and should replace the current
desktop-only implementations over time.

- `useFileTree({ workspaceId, rootPath, persistKey? })`
- `useFileDocument({ workspaceId, absolutePath, mode })`

Leaf mutations and leaf queries should stay direct tRPC usage in each app:

- `writeFile`
- `createDirectory`
- `deletePath`
- `movePath`
- `copyPath`
- `searchFiles`
- `searchContent`

In practice, "direct tRPC" here means using the workspace-scoped tRPC client
already mounted by `WorkspaceClientProvider`, not importing app-specific tRPC
singletons inside shared hooks.

Example callsite shape:

```tsx
<WorkspaceClientProvider cacheKey={workspace.id} hostUrl={hostUrl}>
  <V2WorkspaceScreen workspaceId={workspace.id} />
</WorkspaceClientProvider>
```

```tsx
function V2WorkspaceScreen({ workspaceId }: { workspaceId: string }) {
  useWorkspaceFsEventBridge(workspaceId)

  return (
    <>
      <FilesystemSidebar workspaceId={workspaceId} />
      <WorkspaceTabs workspaceId={workspaceId} />
    </>
  )
}
```

## Hook Responsibilities

## `useFileTree`

This is the main reusable hook for explorer-style trees.

It should own:

- node cache keyed by absolute path
- loaded directory state
- expanded directory state
- selection state only if we want an uncontrolled default
- child loading on first expand
- targeted invalidation on create/delete/rename/move
- restoring expanded descendants after directory rename
- explicit `refreshPath(path)` and `refreshAll()`

It should expose something like:

```ts
interface UseFileTreeResult {
  tree: FileTreeModel
  expand(path: string): Promise<void>
  collapse(path: string): void
  refreshPath(path: string): Promise<void>
  refreshAll(): Promise<void>
}
```

Behavior rules:

- first expand loads children
- re-expand uses cache unless the path was invalidated
- create/delete re-lists the parent
- rename re-lists old parent and new parent
- rename retargets expanded descendants
- `overflow` triggers full refresh

## `useFileDocument`

This is the reusable hook for open file panes and editors.

It should own:

- `readFile` query state
- binary / too-large / not-found states
- current `revision`
- save with `precondition.ifMatch`
- conflict detection when external changes race with local edits
- reload-from-disk behavior
- rename retargeting for open files

It should expose something like:

```ts
interface UseFileDocumentResult {
  state:
    | { kind: "loading" }
    | { kind: "not-found" }
    | { kind: "binary" }
    | { kind: "too-large" }
    | { kind: "text"; content: string; revision: string }
    | { kind: "bytes"; content: Uint8Array; revision: string }
  save(input: { content: string | Uint8Array; force?: boolean }): Promise<...>
  reload(): Promise<void>
  hasExternalChange: boolean
  conflict: { diskContent: string | null } | null
}
```

Behavior rules:

- clean file + watch update: refetch automatically
- dirty file + watch update: do not clobber draft; mark conflict
- rename event: retarget current path
- delete event: transition to not-found

## What Stays App-Specific

These should stay outside the shared package:

- tree row rendering
- drag/drop affordances
- context menus
- keyboard shortcut bindings
- persistent selection model if it differs by platform
- desktop-only integration such as "open in external editor"

Desktop, web, and mobile can all use the same data hooks while keeping their own
rendering and navigation model.

## Git Sidebar Interaction

The git sidebar should not get its own filesystem watch implementation.

Instead:

- git hooks subscribe through the shared workspace filesystem event bridge
- filesystem events invalidate git status queries and selected diff/file queries
- open file and git sidebar refresh behavior stay consistent

This means the shared filesystem event bridge is not only for the file tree. It
is the workspace-wide source of truth for on-disk changes.

## Query and Cache Strategy

Use React Query for low-level request caching.

Rules:

- directory queries keyed by `workspaceId + absolutePath`
- file queries keyed by `workspaceId + absolutePath + read options`
- watch events invalidate exact affected queries
- `overflow` invalidates all filesystem queries for the workspace
- write mutations update or invalidate file query caches immediately

High-level hooks may maintain extra in-memory structures for tree state, but
request caching should stay in React Query.

## Current PR Scope

The near-term scope should be intentionally narrow:

- add host-service filesystem transport and watch support
- build the shared filesystem event bridge hooks
- build `useFileTree`
- recreate the filesystem sidebar inside `v2-workspace`
- stub or defer git-specific sidebar sections where needed

The goal of this PR is not to fully recreate the old desktop sidebar. The goal
is to land the filesystem foundation cleanly.

In `v2-workspace`, we should:

- add a dedicated file-viewer tab for filesystem-backed file viewing
- store the selected file path in local route/tab state
- have sidebar entry clicks update that local route/tab state
- let the file-viewer tab read the selected path from local route/tab state and
  fetch document data from host-service

This keeps the explorer flow simple:

- sidebar owns navigation intent
- local route/tab state identifies the open file
- file-viewer tab owns loading/rendering for that path

## Rollout Plan

## Phase 1: Host-service filesystem transport

- add filesystem manager
- add unary filesystem router
- add websocket watch transport
- add client helpers for filesystem transport

## Phase 2: Shared client hooks + v2 sidebar

- add the shared client/hook layer
- extract/generalize the reusable `WorkspaceClientProvider`
- implement shared workspace event bridge
- implement `useFileTree`
- recreate the filesystem sidebar in `v2-workspace`
- add the file-viewer tab flow driven by local route/tab state

## Phase 3: Shared file document hook

- implement `useFileDocument`
- port file viewer logic to the shared hook where it fits cleanly

## Phase 4: Web adoption

- build web workspace file sidebar on the shared hooks
- build web file viewer/editor on the shared hooks
- reuse the same workspace event bridge for git sidebar invalidation

## Phase 5: Mobile adoption

- use direct tRPC for leaf ops
- adopt `useFileDocument` for file preview/editor flows
- only adopt `useFileTree` if mobile keeps a true tree UX

## Success Criteria

- host-service exposes the same filesystem capability set desktop already uses
- file tree behavior does not need to be reimplemented per app
- open-file save/conflict behavior is consistent across apps
- one workspace watch stream can serve tree, file viewer, and git status refresh
- mobile can use the same data hooks without inheriting desktop-only UI code
