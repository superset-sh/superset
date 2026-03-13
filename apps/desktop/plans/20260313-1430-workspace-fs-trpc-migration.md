# Migrate workspace-fs + desktop to new filesystem schema

## Purpose

Refactor `packages/workspace-fs` and desktop filesystem router to match `plans/workspace-filesystem-schema.md`. Pure path-based, revision tokens, `{ create, overwrite }` flags, singular ops, no `workspaceId` in the shim. Workspace scoping lives in client logic. All workspace file I/O goes through `trpc.filesystem.*`.


## Decision Log

- Filesystem router is sole fs API surface. No other router imports `node:fs` for workspace ops.
- All resolution client-side. Workspace scoping above the shim.
- Clear boundaries. Mixed ops (unstaged diffs) split — client orchestrates.
- `writeFile` uses `{ create, overwrite }` flags for create-only semantics + `precondition.ifMatch` for conflict detection.
- Watch events: no revision, no ordering guarantees. Overflow → full resync.


## Progress

- [ ] Milestone 1: Refactor `packages/workspace-fs` types + service interface
- [ ] Milestone 2: Refactor host implementation
- [ ] Milestone 3: Desktop adapter + filesystem tRPC router
- [ ] Milestone 4: Changes router — git only
- [ ] Milestone 5: Staging router — remove fs ops
- [ ] Milestone 6: Terminal — writeTaskFile to client
- [ ] Milestone 7: Client orchestration
- [ ] Final: Remove dead code, typecheck + lint + test


## Milestone 1: workspace-fs types + service interface

**`packages/workspace-fs/src/types.ts`** — replace all types:

- `FsEntry { absolutePath, name, kind }` (replaces `WorkspaceFsEntry`)
- `FsReadResult { kind, content, byteLength, exceededLimit, revision }` (replaces `WorkspaceFsLimitedReadResult`)
- `FsWriteResult = { ok, revision } | { ok: false, reason, currentRevision? }` (replaces `WorkspaceFsGuardedWriteResult`)
- `FsMetadata | null` with `revision`, `kind`, timestamps, optional posix fields (replaces `WorkspaceFsStat` + `WorkspaceFsExistsResult`)
- `FsSearchMatch`, `FsContentMatch`, `FsWatchEvent` (replaces workspace-scoped equivalents)

**`packages/workspace-fs/src/core/service.ts`** — new interface, 1:1 with schema:

    listDirectory({ absolutePath })
    readFile({ absolutePath, offset?, maxBytes?, encoding? })
    getMetadata({ absolutePath })
    writeFile({ absolutePath, content, encoding?, options?: { create, overwrite }, precondition?: { ifMatch } })
    createDirectory({ absolutePath })
    deletePath({ absolutePath, permanent? })
    movePath({ sourceAbsolutePath, destinationAbsolutePath })
    copyPath({ sourceAbsolutePath, destinationAbsolutePath })
    searchFiles({ query, includeHidden?, includePattern?, excludePattern?, limit? })
    searchContent({ query, includeHidden?, includePattern?, excludePattern?, limit? })
    watchPath({ absolutePath, recursive? })


## Milestone 2: Host implementation

**`packages/workspace-fs/src/fs.ts`:**

- Unify `readTextFile` + `readFileBuffer` + `readFileBufferUpTo` → `readFile` with `offset`/`maxBytes`/`encoding`. Return `revision` (opaque token, e.g. mtime+size hash).
- `guardedWriteTextFile` → `writeFile` with `options.create`/`options.overwrite` + `precondition.ifMatch` revision check. Return new `revision` on success.
- `statFile` + `pathExists` → `getMetadata`, return null on not-found.
- `deletePaths` → `deletePath` (singular).
- `movePaths` → `movePath` (singular).
- `copyPaths` → `copyPath` (singular).
- Remove `createFileAtPath` — file creation through `writeFile` with `create: true, overwrite: false`.

**`packages/workspace-fs/src/host/service.ts`:**

- Remove `workspaceId` from all signatures. Host takes `rootPath` at construction.
- Remove `resolveRootPath` callback.

**`packages/workspace-fs/src/search.ts`:** rename `searchKeyword` → `searchContent`.

**`packages/workspace-fs/src/watch.ts`:** workspace-scoped → path-scoped with `recursive` flag. No revision on events.


## Milestone 3: Desktop adapter + filesystem tRPC router

**`workspace-fs-service.ts`:** Workspace scoping lives here. Resolves `workspaceId` → `rootPath`, caches per-workspace host instances. `Buffer.from()` conversion at this boundary.

**`filesystem/index.ts`:** Mirror schema 1:1. tRPC procedures take `workspaceId` (desktop scoping), adapter strips it.

    listDirectory, readFile, getMetadata — query
    writeFile, createDirectory, deletePath, movePath, copyPath — mutation
    searchFiles, searchContent — query
    watchPath — subscription

Remove: `getServiceInfo`, `readDirectory`, `createFile`, `rename`, `delete`, `move`, `copy`, `searchKeyword`, `searchFilesMulti`, `subscribe`, `stat`, `exists`.


## Milestone 4: Changes router — git only

Remove `saveFile`, `readWorkingFile`, `readWorkingFileImage` — client calls `trpc.filesystem.*` directly.

Refactor `getFileContents`:
- Staged/committed/against-base: pure git, rename to `getGitFileContents`.
- Unstaged: new `getGitOriginalContent` (git-only). Client calls this + `trpc.filesystem.readFile` for working copy.

Delete local `readFileBufferUpTo`, remove `import fs`.


## Milestone 5: Staging router — remove fs ops

- `deleteUntracked` → remove. Client calls `trpc.filesystem.deletePath`.
- `discardAllUnstaged` → git checkout only. Client deletes untracked files via `trpc.filesystem.deletePath`.
- `discardAllStaged` → git reset only. Client deletes staged new files via `trpc.filesystem.deletePath`.

Remove `import fs` from `staging.ts`.


## Milestone 6: Terminal writeTaskFile

Client calls `trpc.filesystem.writeFile` before `trpc.terminal.createOrAttach`. Remove `taskPromptContent`/`taskPromptFileName` from input. Keep `mkdir` for `.superset/` dir.


## Milestone 7: Client orchestration

- Save → `trpc.filesystem.writeFile` with `precondition.ifMatch`
- Read file → `trpc.filesystem.readFile`, binary detection client-side
- Read image → `trpc.filesystem.readFile`, base64 client-side
- Unstaged diff → parallel `getGitOriginalContent` + `trpc.filesystem.readFile`
- Delete → `trpc.filesystem.deletePath`
- Discard → git call then `trpc.filesystem.deletePath` per file
- Task prompt → `trpc.filesystem.writeFile` before terminal create
- Multi-workspace search → client orchestrates multiple `trpc.filesystem.searchFiles`


## Validation

    bun run typecheck && bun run lint:fix && bun test
    grep -rn "from \"node:fs" apps/desktop/src/lib/trpc/routers/changes/
    grep -n "from \"node:fs" apps/desktop/src/lib/trpc/routers/terminal/terminal.ts

Manual: diff viewer, save with conflict detection, discard untracked, task prompt, search, watcher.


## Outcomes & Retrospective

(To be filled.)
