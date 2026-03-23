# Host-Service Diff Plan

## Summary

This doc defines how host-service should expose diff data for workspace-level UI:

- sidebar `+/- LOC` badges
- changes/diff viewer sections
- per-file diff content
- live refresh while files and git state change

The goal is not to keep a fully materialized diff model perfectly updated from
filesystem events alone. The goal is to make diff state a first-class
host-service capability with:

- one workspace-scoped runtime manager
- one cached workspace status snapshot per active workspace
- one workspace-scoped event stream for invalidation and summary updates
- on-demand per-file diff loading

This should mirror the direction of the filesystem plan rather than creating a
desktop-only diff implementation.

## Status

- Owner: platform/workspaces
- Scope: host-service diff runtime + shared client contract
- Last updated: 2026-03-18

## What Exists Today

Current foundation already in place:

- host-service already has a long-lived runtime model for capabilities such as
  chat, pull requests, and filesystem
- host-service already resolves `workspaceId -> worktreePath`
- host-service already has a workspace-scoped filesystem watcher path
- desktop already has working git status and per-file diff behavior
- desktop already distinguishes:
  - status summaries
  - per-file diff loading
  - staged vs unstaged vs committed vs against-base views

Important current behavior in desktop:

- status is computed from git state, not from filesystem events alone
- per-file diff content is loaded lazily when needed
- large/generated diffs are intentionally deprioritized in the UI

## Goals

- expose workspace diff state from host-service
- support live sidebar `+/- LOC` summary badges
- support changes viewer sections:
  - against-base
  - committed
  - staged
  - unstaged
  - untracked
- support lazy per-file diff loading
- keep git invalidation and recompute logic host-side
- avoid each client re-implementing watcher + git refresh logic
- make the active workspace feel live without requiring polling-first clients

## Non-Goals

- do not maintain a globally precomputed full patch cache for every file
- do not derive git truth from workspace filesystem events alone
- do not ship a fine-grained incremental patch engine in v1
- do not require live subscriptions for every workspace row in the sidebar
- do not solve remote/cloud git hosting in this doc

## Core Recommendation

Build diff as:

- invalidation-driven
- cache-backed
- revisioned
- summary-first
- file-diff-on-demand

Do not build diff as:

- a permanently maintained full in-memory patch graph
- a filesystem-event-only system
- a per-component local polling implementation

The important split is:

- workspace status snapshot is cheap enough to cache and refresh centrally
- full per-file diff payloads should be computed lazily and optionally cached
  only for visible/open files

## Why A Diff Runtime Exists

Filesystem and diff have similar transport needs but different truth sources.

Filesystem truth comes from the filesystem host. Diff truth comes from:

- workspace file contents
- worktree git index
- worktree `HEAD`
- common git refs and upstream state

That means diff should be its own host capability:

- `runtime.diff`

This mirrors the plan decision that filesystem should be a dedicated runtime
capability instead of being folded into a broad workspace surface.

## Proposed Host-Service Runtime

Create:

- `packages/host-service/src/runtime/diff/index.ts`
- `packages/host-service/src/runtime/diff/diff.ts`

Mount in:

- `packages/host-service/src/app.ts`
- `packages/host-service/src/types.ts`

Suggested shape:

```ts
interface WorkspaceDiffManager {
  getStatusSnapshot(input: {
    workspaceId: string
    defaultBranch?: string
    force?: boolean
  }): Promise<WorkspaceDiffStatusSnapshot>

  getFileDiff(input: {
    workspaceId: string
    absolutePath: string
    oldAbsolutePath?: string
    category: "against-base" | "committed" | "staged" | "unstaged"
    commitHash?: string
    defaultBranch?: string
  }): Promise<WorkspaceFileDiffPayload>

  getWorkspaceSummary(input: {
    workspaceId: string
    defaultBranch?: string
  }): Promise<WorkspaceDiffSummary>

  getWorkspaceSummaries(input: {
    workspaceIds: string[]
  }): Promise<Array<{ workspaceId: string; summary: WorkspaceDiffSummary | null }>>

  subscribe(input: {
    workspaceId: string
    defaultBranch?: string
    onEvent: (event: WorkspaceDiffEvent) => void
    onError?: (error: unknown) => void
  }): () => void

  close(): Promise<void>
}
```

## Internal Cache Model

The manager should keep one cache entry per workspace.

Suggested shape:

```ts
interface WorkspaceDiffCacheEntry {
  workspaceId: string
  worktreePath: string
  gitDir: string
  gitCommonDir: string
  defaultBranch: string

  // Monotonic host-side revision for clients and caches
  revision: number

  // Dirty flags coalesced from watcher events
  dirty: {
    status: boolean
    branch: boolean
    summaries: boolean
    fileDiffs: Set<string>
  }

  // Last successfully computed workspace snapshot
  statusSnapshot: WorkspaceDiffStatusSnapshot | null

  // Optional cache only for visible/open files
  fileDiffCache: Map<string, WorkspaceFileDiffCacheEntry>

  // Active event subscribers
  subscribers: Set<WorkspaceDiffSubscriber>

  // Background invalidation/recompute bookkeeping
  recomputeTimer: ReturnType<typeof setTimeout> | null
  inFlightStatusPromise: Promise<WorkspaceDiffStatusSnapshot> | null
  lastComputedAt: number | null
  lastError: string | null
}

interface WorkspaceFileDiffCacheEntry {
  key: string
  revision: number
  payload: WorkspaceFileDiffPayload
  lastAccessedAt: number
}
```

## What Gets Cached

Cache these centrally:

- section file lists
- per-file additions/deletions counts
- branch metadata
- ahead/behind and tracking status
- aggregate `+/- LOC` summary for the sidebar
- a monotonic workspace diff `revision`

Do not centrally precompute these for every file:

- full patch text for every changed file
- full original/modified file content for every changed file

Optional:

- keep a small LRU cache for visible/open file diffs
- evict aggressively on revision change or memory pressure

## Sidebar `+/- LOC` Requirement

The workspace summary must directly support a sidebar badge like:

- `+96 -10`
- `+2204 -0`

That means the cached status snapshot should include aggregate additions and
deletions across the current workspace state, not just per-file values.

Suggested summary shape:

```ts
interface WorkspaceDiffSummary {
  revision: number
  branch: string
  defaultBranch: string
  totals: {
    files: number
    additions: number
    deletions: number
  }
  sections: {
    againstBase: DiffSectionSummary
    committed: DiffSectionSummary
    staged: DiffSectionSummary
    unstaged: DiffSectionSummary
    untracked: DiffSectionSummary
  }
  hasUpstream: boolean
  ahead: number
  behind: number
  pushCount: number
  pullCount: number
  isDirty: boolean
  lastComputedAt: string
}

interface DiffSectionSummary {
  files: number
  additions: number
  deletions: number
}
```

For the sidebar, clients should render the summary totals and should not need to
load the entire file-diff payload to show the badge.

## Status Snapshot Shape

The full snapshot should look like the existing desktop `GitChangesStatus`, but
with host-managed revisioning and summary included.

```ts
interface WorkspaceDiffStatusSnapshot {
  workspaceId: string
  revision: number
  branch: string
  defaultBranch: string

  againstBase: ChangedFile[]
  commits: CommitInfo[]
  staged: ChangedFile[]
  unstaged: ChangedFile[]
  untracked: ChangedFile[]

  summary: WorkspaceDiffSummary

  ahead: number
  behind: number
  pushCount: number
  pullCount: number
  hasUpstream: boolean

  computedAt: string
}
```

## Per-File Diff Payload Shape

File diff loading should stay lazy.

```ts
interface WorkspaceFileDiffPayload {
  workspaceId: string
  revision: number
  absolutePath: string
  oldAbsolutePath?: string
  category: "against-base" | "committed" | "staged" | "unstaged"
  commitHash?: string
  language: string
  original: string
  modified: string
  truncated: boolean
}
```

For `unstaged`, the payload is assembled from:

- git original content
- current working copy from filesystem

For the other categories, the payload comes from git-only content resolution.

## Invalidation Sources

Workspace diff cannot rely on workspace file events alone.

The runtime should invalidate from three sources:

### 1. Workspace filesystem events

Use the same workspace root watcher pattern as the filesystem capability.

These events primarily affect:

- unstaged diffs
- untracked files
- file existence/rename/delete

### 2. Worktree git-dir events

Resolve once per workspace:

- `git rev-parse --absolute-git-dir`

In this repo, `.git` inside a worktree is just a pointer file, so the actual
git-dir lives outside the worktree root. The runtime should watch the resolved
git-dir, not the `.git` pointer file.

Files of interest include:

- `index`
- `HEAD`
- `ORIG_HEAD`
- `logs/HEAD`
- `FETCH_HEAD`

These events primarily affect:

- staged vs unstaged movement
- commits
- resets
- rebases
- checkouts

### 3. Common git-dir ref events

Resolve once per workspace:

- `git rev-parse --git-common-dir`

Files/directories of interest include:

- `refs/heads`
- `refs/remotes`
- `packed-refs`

These events primarily affect:

- against-base
- upstream tracking
- ahead/behind

## Invalidation Rules

Do not attempt v1 fine-grained patch updates from raw watcher events.

Instead:

- mark the workspace cache dirty
- record the invalidation reasons
- optionally record affected absolute paths
- debounce a single recompute

Suggested dirtying behavior:

```ts
type WorkspaceDiffInvalidationReason =
  | "filesystem"
  | "git-index"
  | "git-head"
  | "git-refs"
  | "overflow"
  | "manual-refresh"
```

Rules:

- filesystem event:
  - dirty `status`
  - dirty `summaries`
  - mark matching file diff entries stale
- git `index` event:
  - dirty `status`
  - dirty `summaries`
  - clear staged/unstaged file diff cache entries
- git `HEAD` / `ORIG_HEAD` / `logs/HEAD` event:
  - dirty `status`
  - dirty `branch`
  - dirty `summaries`
  - clear all file diff cache entries
- git refs event:
  - dirty `status`
  - dirty `branch`
  - dirty `summaries`
- overflow:
  - dirty everything
  - clear all file diff cache entries

## Recompute Strategy

The runtime should recompute status centrally, not in each client.

Recommended behavior:

- debounce recompute by `100-300ms`
- coalesce repeated invalidations into one recompute
- if no subscribers exist, allow lazy recompute on next query
- if subscribers exist, eagerly recompute and emit an update event
- maintain one in-flight promise per workspace so multiple consumers join the
  same work

Pseudocode:

```ts
onInvalidation(workspaceId, reason, affectedPaths) {
  entry.markDirty(reason, affectedPaths)
  emit({ type: "invalidated", ... })
  scheduleRecompute(workspaceId)
}

scheduleRecompute(workspaceId) {
  if (entry.recomputeTimer) return
  entry.recomputeTimer = setTimeout(() => {
    void recomputeStatus(workspaceId)
  }, 150)
}

async recomputeStatus(workspaceId) {
  if (entry.inFlightStatusPromise) return entry.inFlightStatusPromise
  entry.inFlightStatusPromise = computeStatusSnapshot(workspaceId)
  try {
    const snapshot = await entry.inFlightStatusPromise
    entry.statusSnapshot = snapshot
    entry.revision += 1
    emit({ type: "status-updated", summary: snapshot.summary, revision: entry.revision })
    return snapshot
  } finally {
    entry.inFlightStatusPromise = null
  }
}
```

## Status Computation

The first version should reuse the current desktop computation model instead of
inventing a new diff algorithm.

Host-side status computation should use git to derive:

- staged files
- unstaged files
- untracked files
- additions/deletions via numstat
- branch comparison against base
- commit list on branch
- ahead/behind tracking status

This is already the proven working mental model in desktop.

## Host-Service Contract

Create:

- `packages/host-service/src/trpc/router/diff/index.ts`
- `packages/host-service/src/trpc/router/diff/diff.ts`

Mount in:

- `packages/host-service/src/trpc/router/router.ts`

### Unary procedures

```ts
getStatusSnapshot({
  workspaceId: string,
  defaultBranch?: string,
  force?: boolean,
}): WorkspaceDiffStatusSnapshot

getWorkspaceSummary({
  workspaceId: string,
  defaultBranch?: string,
}): WorkspaceDiffSummary

getWorkspaceSummaries({
  workspaceIds: string[],
}): Array<{
  workspaceId: string
  summary: WorkspaceDiffSummary | null
}>

getFileDiff({
  workspaceId: string,
  absolutePath: string,
  oldAbsolutePath?: string,
  category: "against-base" | "committed" | "staged" | "unstaged",
  commitHash?: string,
  defaultBranch?: string,
}): WorkspaceFileDiffPayload

refresh({
  workspaceId: string,
  defaultBranch?: string,
}): { ok: true }
```

### Stream procedure

The app-facing stream should be workspace-scoped:

```ts
subscribeToWorkspaceDiffEvents({
  workspaceId: string,
  defaultBranch?: string,
})
```

## Stream Event Model

The stream should not continuously push full file patches.

It should push:

- invalidation
- ready
- summary updates
- overflow/reconnect signals

Suggested shape:

```ts
type WorkspaceDiffEvent =
  | {
      type: "ready"
      workspaceId: string
      revision: number
      summary: WorkspaceDiffSummary | null
    }
  | {
      type: "invalidated"
      workspaceId: string
      revision: number
      reasons: WorkspaceDiffInvalidationReason[]
      affectedAbsolutePaths?: string[]
    }
  | {
      type: "status-updated"
      workspaceId: string
      revision: number
      summary: WorkspaceDiffSummary
      changedSections: Array<"against-base" | "committed" | "staged" | "unstaged" | "untracked">
      affectedAbsolutePaths?: string[]
    }
  | {
      type: "overflow"
      workspaceId: string
      revision: number
      message: string
    }
  | {
      type: "error"
      workspaceId: string
      message: string
    }
```

Notes:

- `invalidated` lets clients mark local query data stale immediately
- `status-updated` gives sidebar-level UI enough information to refresh badges
  without waiting for a manual query
- `overflow` means client should force-refetch

## Sidebar Contract

The sidebar use case is special:

- it wants cheap `+/- LOC` numbers
- it may render many workspace rows
- most rows do not need an always-live stream

Recommendation:

- active workspace:
  - subscribe to the diff stream
  - use `summary.totals.additions` and `summary.totals.deletions`
- inactive workspace rows:
  - call `getWorkspaceSummaries({ workspaceIds })`
  - refresh on list load, focus, and coarse intervals
  - do not open one websocket subscription per row

This keeps the active workspace feeling live without creating a fanout problem
for large workspace lists.

## Client Architecture

The shared client should expose a workspace-scoped diff surface similar to the
filesystem plan's shared client approach.

Suggested shape:

```ts
interface WorkspaceDiffClientContextValue {
  getStatusSnapshot(input): Promise<WorkspaceDiffStatusSnapshot>
  getWorkspaceSummary(input): Promise<WorkspaceDiffSummary>
  getWorkspaceSummaries(input): Promise<Array<{ workspaceId: string; summary: WorkspaceDiffSummary | null }>>
  getFileDiff(input): Promise<WorkspaceFileDiffPayload>
  subscribeToWorkspaceDiffEvents(input: {
    workspaceId: string
    defaultBranch?: string
    onEvent: (event: WorkspaceDiffEvent) => void
    onError?: (error: unknown) => void
  }): () => void
}
```

The provider should own:

- one workspace-scoped query client
- one workspace-scoped diff subscription for active consumers
- client-side fanout to multiple hooks

## Recommended Client Hooks

Suggested shared hooks:

- `useWorkspaceDiffSummary({ workspaceId, defaultBranch })`
- `useWorkspaceDiffStatus({ workspaceId, defaultBranch })`
- `useWorkspaceFileDiff({ workspaceId, absolutePath, oldAbsolutePath, category, commitHash, defaultBranch, enabled })`
- `useWorkspaceDiffEvents({ workspaceId, onEvent, enabled })`
- `useWorkspaceSidebarDiffSummaries({ workspaceIds })`

## Client Usage: Sidebar

The sidebar should use summary-first hooks.

For the active workspace:

- subscribe to workspace diff events
- keep the summary query warm
- update the sidebar badge from `summary.totals`

For inactive workspace rows:

- fetch batched summaries
- do not keep a live stream open for every row

That supports UI like:

- workspace name
- branch name
- `+additions -deletions`

without needing to open the full changes pane.

## Client Usage: Changes View

The changes pane should use the full status snapshot:

- query `getStatusSnapshot(...)`
- subscribe to diff events for the active workspace
- on `invalidated`, mark the query stale
- on `status-updated`, update summary immediately and optionally refetch the full
  snapshot in a transition
- on `overflow`, force-refetch

The changes pane should render:

- against-base section
- commits section
- staged section
- unstaged section
- untracked section

from one shared snapshot rather than separate ad hoc queries.

## Client Usage: File Diff Viewer

The file diff viewer should not depend on the full workspace snapshot for file
content. It should:

- read file metadata from the status snapshot entry
- request `getFileDiff(...)` only when the row/pane becomes visible or opened
- reuse the current workspace `revision` as a cache key
- refetch when:
  - workspace revision changes
  - the file's path was present in `affectedAbsolutePaths`
  - the category changes
  - the commit hash changes

This preserves the current desktop pattern where heavy diff content is loaded
only when the user actually looks at it.

## Editing Behavior

For editable categories such as `unstaged`:

- the editor should treat workspace revision changes as possible external disk
  updates
- if the file is being edited and the diff runtime emits a matching path change,
  the client should reconcile or show a conflict affordance

This remains compatible with the filesystem revision/precondition model used for
file saves.

## Failure And Recovery

This design is intentionally recoverable.

Failure modes should resolve by refetching, not by mutating local state into an
unknown condition.

Rules:

- if a watcher overflows:
  - emit `overflow`
  - clear file diff cache
  - force next status query to recompute
- if git metadata cannot be resolved:
  - return a stable host-service error
  - allow client retry
- if a file diff payload fails to compute:
  - keep the workspace status snapshot usable
  - surface the file-level error only where needed

## Why This Is Not Very Fragile

This design is resilient because:

- invalidation sources are explicit and small
- the cache is revision-based, not manually patch-updated in place
- host-service remains the single source of recompute logic
- full recompute is always a valid fallback
- file-level heavy work is isolated from summary-level UI

What would be fragile is:

- trying to infer staged/committed truth from filesystem events only
- incrementally mutating a full patch cache from raw watcher events
- keeping live patch payloads for every changed file regardless of visibility

## Implementation Order

1. Add `runtime.diff` and workspace cache entries
2. Reuse existing desktop git status computation in host-service
3. Add unary summary + status + file diff endpoints
4. Add diff event stream with invalidation + `status-updated`
5. Build shared client hooks
6. Migrate active changes pane to host-service diff contract
7. Add sidebar batch summary query for `+/- LOC` badges

## Open Questions

- whether `committed` section should be fully included in the first host-service
  version or follow after `staged` / `unstaged` / `against-base`
- whether `getWorkspaceSummaries({ workspaceIds })` should be backed by a shared
  background refresh loop for visible sidebar rows
- whether file diff cache should be purely in-memory LRU or revision-scoped only
- whether the first event stream should include `affectedAbsolutePaths` or just
  coarse invalidation reasons
