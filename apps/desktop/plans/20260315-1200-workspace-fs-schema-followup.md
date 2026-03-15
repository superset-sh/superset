# Finish workspace-fs schema migration

## Purpose

Complete the remaining migration work needed to make the real filesystem surface match `plans/workspace-filesystem-schema.md` exactly.

This follow-up exists because the first migration established the new core `workspace-fs` contract, but desktop still exposes and consumes several legacy filesystem procedures that sit above the shim abstraction. A few desktop routers also still call `@superset/workspace-fs/host` directly, and `packages/workspace-fs/core` still exports a `workspaceId`-bearing helper.


## Problem Statement

The schema defines a pure path-based filesystem shim:

- no `workspaceId` in the shim contract
- only the schema primitives on the shim surface
- higher-level helpers live above the shim
- desktop resolves `workspaceId -> rootPath` before delegating

The current codebase still has four categories of drift:

1. `apps/desktop/src/lib/trpc/routers/filesystem/index.ts` exposes legacy helpers that are not part of the schema:
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

2. Some schema primitives are still not exposed with the schema shape:
   - `createDirectory` is published as `createDirectoryNew`
   - `searchFiles` returns a UI-shaped array instead of `{ matches }`
   - `searchFiles` omits `includeHidden`
   - `writeFile` transport only accepts `string`, not bytes

3. Desktop still bypasses the filesystem router:
   - `changes/staging.ts` imports `deletePath` from `@superset/workspace-fs/host`
   - `terminal/terminal.ts` imports `createDirectory` and `writeFile` from `@superset/workspace-fs/host`

4. `packages/workspace-fs/core` still exports `resource-uri.ts`, which encodes `workspaceId` into a supposedly pure shim-facing module.


## Target State

After this migration:

- `packages/workspace-fs/core` contains only path-based filesystem contracts and helpers
- the desktop filesystem router mirrors the schema 1:1, with `workspaceId` only as desktop-side scoping
- renderer code composes higher-level behavior client-side from the schema primitives
- no desktop router imports `@superset/workspace-fs/host` for workspace file operations except the dedicated workspace-to-root adapter layer
- multi-workspace orchestration happens in renderer/application code, not in the shim-facing router


## Decision Log

- Keep `workspaceId` in desktop tRPC inputs. It is part of desktop scoping, not part of the shim.
- Do not add new mixed convenience procedures to `trpc.filesystem`. If a behavior needs naming, parent-path composition, batching, or cross-workspace orchestration, it belongs above the schema surface.
- Prefer migration by replacement, not compatibility layering. Remove legacy routes after their renderer callers are migrated.
- Keep binary transport serialization explicit. tRPC cannot round-trip `Uint8Array` opaquely across all current consumers, so router-level byte encoding is allowed, but the transport contract must be documented and symmetrical for reads and writes.
- Treat `workspace-fs://` resource URIs as an application concern, not part of the pure filesystem shim.


## Non-Goals

- Do not redesign the underlying `workspace-fs` fs/search/watch implementations.
- Do not change git-only procedures beyond removing direct filesystem host usage.
- Do not redesign file-tree state shape unless needed to remove a legacy route dependency.
- Do not introduce a remote transport in this follow-up.


## Milestone 1: Normalize the desktop filesystem router

Refactor `apps/desktop/src/lib/trpc/routers/filesystem/index.ts` so the schema primitives are the only primary filesystem procedures:

- queries:
  - `listDirectory`
  - `readFile`
  - `getMetadata`
  - `searchFiles`
  - `searchContent`
- mutations:
  - `writeFile`
  - `createDirectory`
  - `deletePath`
  - `movePath`
  - `copyPath`
- subscriptions:
  - `watchPath`

Required changes:

- rename `createDirectoryNew` -> `createDirectory`
- make `searchFiles` return `{ matches }` with the same shape as the schema
- add `includeHidden` to `searchFiles`
- keep `searchContent` returning `{ matches }`
- document and standardize byte encoding for `readFile` and `writeFile` at the tRPC boundary

Explicit removals from this router:

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


## Milestone 2: Migrate renderer call sites off legacy filesystem routes

Replace all renderer consumers of the removed procedures with client-side orchestration over the schema primitives.

### File tree

Current dependencies:

- `readDirectory`
- legacy `createDirectory`
- `createFile`
- `rename`
- batched `delete`
- batched `move`
- batched `copy`
- `subscribe`

Migration shape:

- tree loading:
  - `readDirectory` -> `listDirectory`
  - map `entries` to the existing tree item view model in renderer code
- create file:
  - compose absolute path in renderer
  - call `writeFile({ absolutePath, content, encoding: "utf-8", options: { create: true, overwrite: false } })`
- create directory:
  - compose absolute path in renderer
  - call `createDirectory({ absolutePath })`
- rename:
  - compose destination absolute path in renderer
  - call `movePath({ sourceAbsolutePath, destinationAbsolutePath })`
- delete:
  - loop `deletePath` client-side
- move:
  - loop `movePath` client-side
- copy:
  - loop `copyPath` client-side
- workspace-wide watch:
  - `subscribe` -> `watchPath({ absolutePath: worktreePath, recursive: true })`
  - translate watch events to existing `FileSystemChangeEvent` in renderer or a dedicated UI adapter

Primary files expected to change:

- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/FilesView.tsx`
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/hooks/useFileTreeActions.ts`
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/hooks/useWorkspaceFileEvents/useWorkspaceFileEvents.ts`

### Keyword/content search

- `searchKeyword` -> `searchContent`
- remap `{ matches }` to current UI result shape in renderer

Primary file:

- `apps/desktop/src/renderer/screens/main/components/KeywordSearch/useKeywordSearch.ts`

### Multi-workspace file search

- remove `searchFilesMulti`
- renderer fans out `searchFiles` calls per workspace and merges/sorts results locally

Primary file:

- `apps/desktop/src/renderer/screens/main/components/CommandPalette/useCommandPalette.ts`


## Milestone 3: Remove remaining direct host filesystem calls from desktop routers

Desktop filesystem access should go through the workspace-to-root adapter plus the schema-shaped router, not through ad hoc host imports in unrelated routers.

### Staging router

Current issue:

- `apps/desktop/src/lib/trpc/routers/changes/staging.ts` imports `deletePath` from `@superset/workspace-fs/host`

Migration:

- remove direct host import
- reuse desktop workspace resolution helpers
- either:
  - delegate to the shared filesystem service adapter for singular deletes, or
  - move the “delete untracked files after git action” behavior fully to renderer if that path is already supported by the current UX

Preferred direction:

- align with the original migration intent and move untracked-file cleanup to renderer where feasible

### Terminal router

Current issue:

- `apps/desktop/src/lib/trpc/routers/terminal/terminal.ts` imports `createDirectory` and `writeFile` from `@superset/workspace-fs/host`

Migration:

- remove direct host imports
- stop writing task prompt files from inside the terminal router
- require caller-side creation of `.superset/<file>` through `trpc.filesystem.createDirectory` and `trpc.filesystem.writeFile` before `terminal.createOrAttach`
- remove `taskPromptContent` and `taskPromptFileName` from terminal router input once renderer is updated


## Milestone 4: Remove `workspaceId` leakage from `packages/workspace-fs/core`

Current issue:

- `packages/workspace-fs/src/core/resource-uri.ts` exports `toWorkspaceFsResourceUri` / `parseWorkspaceFsResourceUri`
- those helpers encode `workspaceId`, which is outside the pure shim contract

Migration:

- move `resource-uri.ts` out of `core/`
- relocate it to a desktop-specific or app-level module where `workspaceId` is an intentional concern
- remove exports from `packages/workspace-fs/src/core/index.ts`
- keep any replacement naming explicit about being a desktop resource identifier, not a filesystem core primitive

Acceptance rule:

- no file under `packages/workspace-fs/src/core/` should mention `workspaceId`


## Milestone 5: Align transport typing for binary reads and writes

The schema allows byte reads and writes. The desktop transport currently only fully supports byte reads, and even those are encoded as base64 strings.

Required work:

- define one explicit tRPC wire shape for bytes:
  - read responses: base64 string plus `kind: "bytes"`
  - write inputs: accept either text content or base64-encoded byte content with an explicit discriminator
- add router-side translation between wire format and `workspace-fs` core types
- update any client helpers/types so text and binary paths are both intentional

Constraints:

- do not change the pure `workspace-fs` service contract
- keep transport serialization concerns at the adapter boundary


## Milestone 6: Remove dead compatibility code

After renderer and router migration:

- delete removed procedures from `filesystem/index.ts`
- remove invalidation code keyed on removed procedure names
- remove temporary aliases such as `createDirectoryNew`
- remove any compatibility types created only for the transition
- update plan/outcome docs that currently claim the migration is complete


## Validation

### Static validation

Run:

```bash
bun run typecheck
bun run lint:fix
bun test
```

Search for remaining drift:

```bash
rg -n "@superset/workspace-fs/host" apps/desktop/src
rg -n "searchFilesMulti|searchKeyword|readDirectory|createFile|rename|\\.delete\\(|\\.move\\(|\\.copy\\(|createDirectoryNew|subscribe" apps/desktop/src
rg -n "workspaceId" packages/workspace-fs/src/core
```

Expected:

- no unrelated desktop router imports of `@superset/workspace-fs/host`
- no renderer usage of removed legacy filesystem procedures
- no `workspaceId` references inside `packages/workspace-fs/src/core`

### Manual validation

- file tree loads directories through `listDirectory`
- create file/folder works from the file tree
- rename works for files and directories
- multi-select delete/move/copy still works through client orchestration
- workspace file watching still updates tree and open panes
- keyword search still returns content matches
- command palette global search still merges multi-workspace results
- terminal task prompt flow still works after moving file creation out of the terminal router
- discard-untracked / discard-all flows still remove files correctly


## Risks

- Renderer fanout for multi-workspace search can increase request volume. Keep limits low and debounce aggressively.
- Removing compatibility routes can break stale UI code paths. Land call-site migrations before route deletion.
- Byte-write transport changes can introduce subtle regressions if text and binary payloads are not clearly discriminated.
- Moving task prompt file creation out of the terminal router changes ordering; renderer must ensure files are written before terminal attach.


## Suggested Execution Order

1. Normalize `trpc.filesystem` primitive route names and response shapes.
2. Migrate renderer consumers one feature at a time:
   - file tree
   - workspace watch bridge
   - keyword search
   - global command palette search
3. Remove direct host calls from staging and terminal flows.
4. Move `resource-uri.ts` out of `workspace-fs/core`.
5. Tighten binary transport typing.
6. Delete compatibility routes and dead code.


## Completion Criteria

This follow-up is complete when all of the following are true:

- the only filesystem operations exposed by `trpc.filesystem` are the schema primitives
- every desktop caller that needs higher-level behavior composes it outside the shim-facing router
- no desktop router outside the workspace filesystem adapter imports `@superset/workspace-fs/host` for workspace file operations
- `packages/workspace-fs/core` is free of `workspaceId`
- the resulting filesystem boundary matches `plans/workspace-filesystem-schema.md` rather than the older migration plan
