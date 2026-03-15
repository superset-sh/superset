# Finish workspace-fs schema migration

## Goal

Match `plans/workspace-filesystem-schema.md` exactly:

- pure path-based shim
- desktop `workspaceId` scoping only at the adapter boundary
- only schema primitives on `trpc.filesystem`
- no workspace file ops outside the filesystem adapter


## Remaining Drift

- `trpc.filesystem` still exposes legacy helpers:
  - `readDirectory`
  - `subscribe`
  - `searchKeyword`
  - `searchFilesMulti`
  - `createFile`
  - legacy `createDirectory`
  - `rename`
  - batched `delete`
  - batched `move`
  - batched `copy`
- schema routes still drift:
  - `createDirectoryNew` instead of `createDirectory`
  - `searchFiles` returns UI-shaped array instead of `{ matches }`
  - `searchFiles` misses `includeHidden`
  - `writeFile` transport only accepts text
- direct host FS imports still exist in:
  - `apps/desktop/src/lib/trpc/routers/changes/staging.ts`
  - `apps/desktop/src/lib/trpc/routers/terminal/terminal.ts`
- `packages/workspace-fs/src/core/resource-uri.ts` still includes `workspaceId`


## Plan

### 1. Fix `trpc.filesystem` surface

Keep only:

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
- `watchPath`

Change:

- rename `createDirectoryNew` -> `createDirectory`
- make `searchFiles` return `{ matches }`
- add `includeHidden` to `searchFiles`
- define explicit binary wire format for `readFile` and `writeFile`

Remove:

- `readDirectory`
- `subscribe`
- `searchKeyword`
- `searchFilesMulti`
- `createFile`
- legacy `createDirectory`
- `rename`
- `delete`
- `move`
- `copy`


### 2. Migrate renderer call sites

File tree:

- `readDirectory` -> `listDirectory`
- `createFile` -> `writeFile({ create: true, overwrite: false })`
- legacy `createDirectory` -> `createDirectory`
- add `createDirectory({ recursive: true })` for nested new-file/new-folder input like `hi/hi.txt`
- `rename` -> `movePath`
- batched `delete` -> loop `deletePath`
- batched `move` -> loop `movePath`
- batched `copy` -> loop `copyPath`
- `subscribe` -> `watchPath({ absolutePath: worktreePath, recursive: true })`

Keyword search:

- `searchKeyword` -> `searchContent`

Multi-workspace search:

- remove `searchFilesMulti`
- fan out `searchFiles` client-side and merge results in renderer

Primary files:

- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/FilesView.tsx`
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/hooks/useFileTreeActions.ts`
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/hooks/useWorkspaceFileEvents/useWorkspaceFileEvents.ts`
- `apps/desktop/src/renderer/screens/main/components/KeywordSearch/useKeywordSearch.ts`
- `apps/desktop/src/renderer/screens/main/components/CommandPalette/useCommandPalette.ts`


### 3. Remove direct host FS usage outside adapter

Staging router:

- remove `@superset/workspace-fs/host` import
- stop deleting files through direct host calls
- use filesystem adapter path or move cleanup to renderer

Terminal router:

- remove `@superset/workspace-fs/host` imports
- stop writing task prompt files inside `terminal.ts`
- require caller to create `.superset/<file>` via `trpc.filesystem.*` before attach
- remove `taskPromptContent` and `taskPromptFileName` from terminal input


### 4. Remove `workspaceId` from `workspace-fs/core`

- move `packages/workspace-fs/src/core/resource-uri.ts` out of `core/`
- remove it from `packages/workspace-fs/src/core/index.ts`
- keep any replacement in desktop/app code, not in the shim


### 5. Delete compatibility code

- remove legacy filesystem procedures from router
- remove `createDirectoryNew`
- remove dead invalidations and compatibility types
- update docs/plans that still claim migration is complete


## Validation

Run:

```bash
bun run typecheck
bun run lint:fix
bun test
```

Search:

```bash
rg -n "@superset/workspace-fs/host" apps/desktop/src
rg -n "searchFilesMulti|searchKeyword|readDirectory|createFile|createDirectoryNew|subscribe|\\.rename\\b|\\.delete\\b|\\.move\\b|\\.copy\\b" apps/desktop/src
rg -n "workspaceId" packages/workspace-fs/src/core
```


## Done When

- `trpc.filesystem` exposes only schema primitives
- renderer composes higher-level behavior client-side
- no desktop router outside the filesystem adapter imports `@superset/workspace-fs/host` for workspace file ops
- `packages/workspace-fs/src/core` has no `workspaceId`
