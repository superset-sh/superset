# Migrate workspace-fs + desktop to new filesystem schema

Living document.

## Purpose

Refactor `packages/workspace-fs` and the desktop filesystem tRPC router to match the target schema in `plans/workspace-filesystem-schema.md`. The schema is pure path-based — no `workspaceId`, no batch ops, revision-based conflict detection. Workspace scoping lives in client logic above the shim. After this, all workspace file I/O from the client goes through `trpc.filesystem.*`.


## Decision Log

- Filesystem router is sole fs API surface. No other router imports `node:fs` for workspace ops.
- All resolution client-side. Workspace scoping, `workspaceId` → path resolution, all above the shim.
- Schema is pure path-based per `plans/workspace-filesystem-schema.md`.
- Clear boundaries, no exceptions. Mixed ops (unstaged diffs) get split — client orchestrates.


## Progress

- [ ] Milestone 1: Refactor `packages/workspace-fs` core types + service interface to match target schema
- [ ] Milestone 2: Refactor host implementation (`packages/workspace-fs/src/fs.ts` + `host/service.ts`)
- [ ] Milestone 3: Update desktop adapter + filesystem tRPC router to mirror new schema
- [ ] Milestone 4: Migrate changes router — git only, remove all fs ops
- [ ] Milestone 5: Migrate staging router — remove fs ops
- [ ] Milestone 6: Migrate terminal — writeTaskFile moves to client
- [ ] Milestone 7: Client orchestration — renderer calls `trpc.filesystem.*` for all fs
- [ ] Final: Remove dead code, typecheck + lint + test


## Milestone 1: Refactor workspace-fs types + service interface

Target schema from `plans/workspace-filesystem-schema.md`. All methods are pure path-based — no `workspaceId`.

**Replace `packages/workspace-fs/src/types.ts`:**

Current types → new types:

| Remove | Add |
|---|---|
| `WorkspaceFsEntry` | `FsEntry { absolutePath, name, kind: "file" \| "directory" \| "symlink" \| "other" }` |
| `WorkspaceFsLimitedReadResult` | `FsReadResult { kind: "text" \| "bytes", content: string \| Uint8Array, byteLength, exceededLimit, revision }` |
| `WorkspaceFsGuardedWriteResult` | `FsWriteResult = { ok: true, revision } \| { ok: false, reason: "conflict", currentRevision }` |
| `WorkspaceFsStat` + `WorkspaceFsExistsResult` | `FsMetadata \| null` (unified, includes `revision`, `kind`, `size`, timestamps, optional `mode`/`permissions`/`owner`/`group`/`symlinkTarget`) |
| `WorkspaceFsSearchResult` | `FsSearchMatch { absolutePath, relativePath, name, kind, score }` |
| `WorkspaceFsKeywordMatch` | `FsContentMatch { absolutePath, relativePath, line, column, preview }` |
| `WorkspaceFsWatchEvent` (workspace-scoped) | `FsWatchEvent { kind, absolutePath, oldAbsolutePath? }` (path-scoped) |
| `DeletePathsResult`, `MoveCopyResult` | Singular return types per `deletePath`/`movePath`/`copyPath` |

**Replace `packages/workspace-fs/src/core/service.ts`:**

New service interface (maps 1:1 to schema):

    listDirectory({ absolutePath }) → { entries: FsEntry[] }
    readFile({ absolutePath, offset?, maxBytes?, encoding? }) → FsReadResult
    getMetadata({ absolutePath }) → FsMetadata | null
    writeFile({ absolutePath, content, encoding?, precondition?: { ifMatch: revision } }) → FsWriteResult
    createDirectory({ absolutePath }) → { absolutePath, kind: "directory" }
    deletePath({ absolutePath, permanent? }) → { absolutePath }
    movePath({ sourceAbsolutePath, destinationAbsolutePath }) → { fromAbsolutePath, toAbsolutePath }
    copyPath({ sourceAbsolutePath, destinationAbsolutePath }) → { fromAbsolutePath, toAbsolutePath }
    searchFiles({ query, includeHidden?, includePattern?, excludePattern?, limit? }) → { matches: FsSearchMatch[] }
    searchContent({ query, includeHidden?, includePattern?, excludePattern?, limit? }) → { matches: FsContentMatch[] }
    watchPath({ absolutePath, recursive? }) → stream of { events: FsWatchEvent[] }

Removed from interface: `getServiceInfo`, `readTextFile`, `readFileBuffer`, `readFileBufferUpTo`, `guardedWriteTextFile`, `createFile`, `stat`, `exists`, `deletePaths`, `movePaths`, `copyPaths`, `searchKeyword`, `watchWorkspace`.


## Milestone 2: Refactor host implementation

**`packages/workspace-fs/src/fs.ts`:**

- Unify `readTextFile` + `readFileBuffer` + `readFileBufferUpTo` → single `readFile` with `offset`/`maxBytes`/`encoding` support. Compute and return `revision` (content hash or mtime-based opaque token).
- Replace `guardedWriteTextFile` → `writeFile` with `precondition.ifMatch` revision check instead of `expectedContent` string comparison. Generate new `revision` on success.
- Replace `statFile` + `pathExists` → `getMetadata` returning null on not-found.
- Replace `deletePaths` → `deletePath` (singular). Batch logic moves to callers.
- Replace `movePaths` → `movePath` (singular).
- Replace `copyPaths` → `copyPath` (singular).
- Remove `createFileAtPath` — file creation through `writeFile`.
- Add revision generation: opaque token per file (e.g. `mtime + size` hash or content hash).

**`packages/workspace-fs/src/host/service.ts`:**

- Remove `workspaceId` from all method signatures. Host service takes a `rootPath` at construction, not per-call.
- Update `createWorkspaceFsHostService` — `resolveRootPath` callback no longer needed per-call. Root is fixed at construction.
- Wire up new method signatures to refactored `fs.ts` functions.

**`packages/workspace-fs/src/search.ts`:**

- Rename `searchKeyword` → `searchContent`. Update return type to `FsContentMatch`.

**`packages/workspace-fs/src/watch.ts`:**

- Refactor watcher from workspace-scoped to path-scoped with `recursive` flag.


## Milestone 3: Desktop adapter + filesystem tRPC router

**`apps/desktop/src/lib/trpc/routers/workspace-fs-service.ts`:**

- Workspace scoping lives HERE now. This layer resolves `workspaceId` → `rootPath` and instantiates/caches per-workspace host service instances.
- Adapter converts between workspace-scoped tRPC calls and pure path-based service calls.
- `Buffer.from()` conversion for byte results at this boundary.

**`apps/desktop/src/lib/trpc/routers/filesystem/index.ts`:**

Mirror the schema 1:1. tRPC procedures still take `workspaceId` (workspace scoping at the tRPC level for the desktop app), but the adapter strips it before calling the pure path-based service.

    listDirectory — query
    readFile — query
    getMetadata — query
    writeFile — mutation
    createDirectory — mutation
    deletePath — mutation
    movePath — mutation
    copyPath — mutation
    searchFiles — query
    searchContent — query
    watchPath — subscription

Remove: `getServiceInfo`, `readDirectory` (→ `listDirectory`), `createFile`, `rename` (→ `movePath`), `delete` (→ `deletePath`), `move` (→ `movePath`), `copy` (→ `copyPath`), `searchKeyword` (→ `searchContent`), `searchFilesMulti` (moves to client-side orchestration above the shim), `subscribe` (→ `watchPath`).


## Milestone 4: Changes router — git only

Remove from `file-contents.ts`:

| Procedure | Client replacement |
|---|---|
| `saveFile` | `trpc.filesystem.writeFile` (with `precondition.ifMatch` for conflict detection) |
| `readWorkingFile` | `trpc.filesystem.readFile` with `maxBytes`, binary detection client-side |
| `readWorkingFileImage` | `trpc.filesystem.readFile` with `maxBytes`, base64 client-side |

Refactor `getFileContents`:
- Staged/committed/against-base: pure git, stays. Rename to `getGitFileContents`.
- Unstaged: split. New `getGitOriginalContent` returns git-only original. Client calls this + `trpc.filesystem.readFile` for working copy.

Delete local `readFileBufferUpTo`, remove `import fs`.


## Milestone 5: Staging router — remove fs ops

| Procedure | Change |
|---|---|
| `deleteUntracked` | Remove. Client calls `trpc.filesystem.deletePath`. |
| `discardAllUnstaged` | Router: git checkout only. Client calls router then `trpc.filesystem.deletePath` per untracked file. |
| `discardAllStaged` | Router: git reset only. Client calls router then `trpc.filesystem.deletePath` per staged new file. |

Remove `import fs` from `staging.ts`.


## Milestone 6: Terminal writeTaskFile

Client calls `trpc.filesystem.writeFile` before `trpc.terminal.createOrAttach`. Remove `taskPromptContent`/`taskPromptFileName` from `createOrAttach` input. Keep `mkdir` for `.superset/` dir or client calls `trpc.filesystem.createDirectory` first.

Remove `import { writeFile }` from `terminal.ts`.


## Milestone 7: Client orchestration

Update all renderer callers:
- Save → `trpc.filesystem.writeFile` with revision precondition
- Read working file → `trpc.filesystem.readFile`, binary detection client-side
- Read image → `trpc.filesystem.readFile`, base64 client-side
- Unstaged diff → parallel `getGitOriginalContent` + `trpc.filesystem.readFile`
- Delete untracked → `trpc.filesystem.deletePath`
- Discard unstaged/staged → git call then `trpc.filesystem.deletePath` per file
- Task prompt → `trpc.filesystem.writeFile` before terminal create
- `searchFilesMulti` → client-side orchestration over multiple `trpc.filesystem.searchFiles` calls


## Validation

    bun run typecheck && bun run lint:fix && bun test

    grep -rn "from \"node:fs" apps/desktop/src/lib/trpc/routers/changes/
    grep -n "from \"node:fs" apps/desktop/src/lib/trpc/routers/terminal/terminal.ts
    # Expected: No matches

Manual: diff viewer loads all categories, save with revision-based conflict detection, discard untracked, task prompt creation, search files, search content, file watcher.


## Outcomes & Retrospective

(To be filled after completion.)
