# Migrate workspace-fs + desktop to new filesystem schema

## Purpose

Refactor `packages/workspace-fs` and desktop filesystem router to match `plans/workspace-filesystem-schema.md`. Pure path-based, revision tokens, `{ create, overwrite }` flags, singular ops. Workspace scoping above the shim. All workspace file I/O goes through `trpc.filesystem.*`.


## Decision Log

- Filesystem router is sole fs API surface. No other router imports `node:fs` for workspace ops.
- All resolution client-side. Workspace scoping above the shim.
- Clear boundaries. Mixed ops split — client orchestrates.
- `writeFile` uses `{ create, overwrite }` flags + `precondition.ifMatch` for conflict detection.
- Watch events: no revision, no ordering guarantees. Overflow → full resync.
- Revision token: `mtime-ms + size` string. Cheap, good enough for conflict detection. Not a content hash.
- `createDirectory` is idempotent — succeeds silently if directory already exists. `recursive?: boolean` enables `mkdir -p` semantics for higher-level callers such as nested new-file creation. Needed for infra setup (`.superset/` dir) without error handling.
- `movePath` fails if destination exists. Client must check or delete first. Matches current behavior.
- `readFile` encoding behavior: encoding provided → `kind: "text"`, `content: string`. Encoding omitted → `kind: "bytes"`, `content: Uint8Array`.


## Progress

- [x] Milestone 1: Refactor `packages/workspace-fs` types + service interface
- [x] Milestone 2: Refactor host implementation (fs.ts, search.ts, watch.ts, host/service.ts, client)
- [x] Milestone 3: Desktop adapter + filesystem tRPC router
- [x] Milestone 4: Changes router — git only
- [x] Milestone 5: Staging router — remove fs ops
- [x] Milestone 6: Terminal — writeTaskFile to client
- [x] Milestone 7: Client orchestration
- [x] Final: Remove dead code, typecheck + lint + test


## Milestone 1: workspace-fs types + service interface

**`packages/workspace-fs/src/types.ts`** — replace all types:

- `FsEntry { absolutePath, name, kind: "file" | "directory" | "symlink" | "other" }`
- `FsReadResult { kind: "text" | "bytes", content: string | Uint8Array, byteLength, exceededLimit, revision }`
- `FsWriteResult = { ok: true, revision } | { ok: false, reason: "conflict", currentRevision } | { ok: false, reason: "exists" } | { ok: false, reason: "not-found" }`
- `FsMetadata { absolutePath, kind, size, createdAt, modifiedAt, accessedAt, revision, mode?, permissions?, owner?, group?, symlinkTarget? } | null`
- `FsSearchMatch { absolutePath, relativePath, name, kind, score }`
- `FsContentMatch { absolutePath, relativePath, line, column, preview }`
- `FsWatchEvent { kind: "create" | "update" | "delete" | "rename" | "overflow", absolutePath, oldAbsolutePath? }`

**`packages/workspace-fs/src/core/service.ts`** — new interface, 1:1 with schema:

    listDirectory({ absolutePath }) → { entries: FsEntry[] }
    readFile({ absolutePath, offset?, maxBytes?, encoding? }) → FsReadResult
    getMetadata({ absolutePath }) → FsMetadata | null
    writeFile({ absolutePath, content: string | Uint8Array, encoding?, options?: { create, overwrite }, precondition?: { ifMatch } }) → FsWriteResult
    createDirectory({ absolutePath, recursive? }) → { absolutePath, kind: "directory" }
    deletePath({ absolutePath, permanent? }) → { absolutePath }
    movePath({ sourceAbsolutePath, destinationAbsolutePath }) → { fromAbsolutePath, toAbsolutePath }
    copyPath({ sourceAbsolutePath, destinationAbsolutePath }) → { fromAbsolutePath, toAbsolutePath }
    searchFiles({ query, includeHidden?, includePattern?, excludePattern?, limit? }) → { matches: FsSearchMatch[] }
    searchContent({ query, includeHidden?, includePattern?, excludePattern?, limit? }) → { matches: FsContentMatch[] }
    watchPath({ absolutePath, recursive? }) → stream of { events: FsWatchEvent[] }


## Milestone 2: Host implementation

**`packages/workspace-fs/src/fs.ts`:**

- Unify `readTextFile` + `readFileBuffer` + `readFileBufferUpTo` → single `readFile`:
  - `encoding` provided → read as text, return `kind: "text"`, `content: string`
  - `encoding` omitted → read as bytes, return `kind: "bytes"`, `content: Uint8Array`
  - `offset` support: seek to position before reading (current impl always reads from 0)
  - `maxBytes` support: cap read size, set `exceededLimit: true` if more data available
  - Return `revision`: opaque `"${mtimeMs}:${size}"` string from `fstat` on the open handle

- `guardedWriteTextFile` → `writeFile`:
  - Accept `content: string | Uint8Array` — write bytes directly or encode string with `encoding`
  - `options.create` + `options.overwrite` flags:
    - `create: true, overwrite: true` (default) → open with `w` flag
    - `create: true, overwrite: false` → open with `wx` flag, return `{ ok: false, reason: "exists" }` on EEXIST
    - `create: false, overwrite: true` → check exists first, return `{ ok: false, reason: "not-found" }` on ENOENT
  - `precondition.ifMatch` → compare against current revision before write, return `{ ok: false, reason: "conflict", currentRevision }` on mismatch
  - Return new `revision` on success (stat after write)
  - Keep atomic write (temp file + rename) and path lock from current `guardedWriteTextFile`

- `statFile` + `pathExists` → `getMetadata`:
  - Return full metadata object with `revision` (same `"${mtimeMs}:${size}"` format)
  - Return `null` on ENOENT instead of throwing

- Singular ops:
  - `deletePaths` → `deletePath` (singular). Batch logic moves to callers.
  - `movePaths` → `movePath` (singular). Fails if destination exists.
  - `copyPaths` → `copyPath` (singular).

- Remove `createFileAtPath` — file creation through `writeFile({ create: true, overwrite: false })`.

- `createDirectoryAtPath` → `createDirectory`. Idempotent — catch EEXIST silently.

**`packages/workspace-fs/src/host/service.ts`:**

- Remove `workspaceId` from all signatures. Host takes `rootPath` at construction.
- Remove per-call `resolveRootPath` callback. Root is fixed.
- Wire new method signatures to refactored `fs.ts`.

**`packages/workspace-fs/src/search.ts`:**

- `searchKeyword` → `searchContent`. Update return type to `FsContentMatch`.

**`packages/workspace-fs/src/watch.ts`:**

- Workspace-scoped → path-scoped with `recursive` flag.
- Yield batched `{ events: FsWatchEvent[] }` instead of individual events.
- No revision on events.


## Milestone 3: Desktop adapter + filesystem tRPC router

**`workspace-fs-service.ts`:**

- Workspace scoping lives here. Resolves `workspaceId` → `rootPath`, caches per-workspace host instances.
- `Buffer.from()` conversion for byte results (`readFile` with no encoding returns `Uint8Array`, adapter converts to `Buffer` for Node.js consumers).

**`filesystem/index.ts`:** Mirror schema 1:1. tRPC procedures take `workspaceId` (desktop scoping), adapter strips before calling pure path-based service.

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

Client handles entirely:
1. `trpc.filesystem.createDirectory({ workspaceId, absolutePath: "<workspace>/.superset" })` — idempotent, safe if exists
2. `trpc.filesystem.writeFile({ workspaceId, absolutePath: "<workspace>/.superset/<file>", content })` — default create-or-overwrite
3. Then `trpc.terminal.createOrAttach` — remove `taskPromptContent`/`taskPromptFileName` from input.

Remove `import { mkdir, writeFile }` from `terminal.ts`. No raw `node:fs` left.


## Milestone 7: Client orchestration

- Save → `trpc.filesystem.writeFile` with `precondition.ifMatch` (revision from initial `readFile`)
- Read file → `trpc.filesystem.readFile({ encoding: "utf-8", maxBytes })`, binary detection client-side
- Read image → `trpc.filesystem.readFile({ maxBytes })` (no encoding, get bytes), base64 client-side
- Unstaged diff → parallel `getGitOriginalContent` + `trpc.filesystem.readFile`
- Delete → `trpc.filesystem.deletePath`
- Discard → git call then `trpc.filesystem.deletePath` per file
- Task prompt → `createDirectory` + `writeFile` before terminal create
- Multi-workspace search → client orchestrates multiple `trpc.filesystem.searchFiles`


## Validation

    bun run typecheck && bun run lint:fix && bun test
    grep -rn "from \"node:fs" apps/desktop/src/lib/trpc/routers/changes/
    grep -rn "from \"node:fs" apps/desktop/src/lib/trpc/routers/terminal/terminal.ts
    # Expected: No matches

Manual: diff viewer, save with revision-based conflict detection, discard untracked, task prompt, search, watcher.


## Outcomes & Retrospective

This migration established the schema-aligned path-based service and moved desktop workspace scoping to the adapter boundary. A later follow-up completed the remaining file-tree and search migration, removed the legacy `trpc.filesystem` compatibility procedures, added explicit client/host package boundaries for `workspace-fs`, and extended `createDirectory` with `recursive?: boolean` for higher-level nested create flows.

Validation at that milestone: typecheck passes, lint clean, no `node:fs` in changes router or terminal router. 4 pre-existing test failures unrelated to that migration pass.
