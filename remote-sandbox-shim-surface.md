# Remote Sandbox Shim Surface

This is the final state I would target for the remote filesystem shim.

## Core API

```ts
listDirectory({
  absolutePath,
})

readFile({
  absolutePath,
  maxBytes,
  encoding,
})

getMetadata({
  absolutePath,
})

writeFile({
  absolutePath,
  content,
  encoding,
  expectedContent,
})

createPath({
  absolutePath,
  kind,
  content,
})

deletePaths({
  absolutePaths,
  permanent,
})

movePaths({
  sourceAbsolutePaths,
  destinationAbsolutePath,
})

copyPaths({
  sourceAbsolutePaths,
  destinationAbsolutePath,
})

searchFiles({
  query,
  includeHidden,
  includePattern,
  excludePattern,
  limit,
})

searchContent({
  query,
  includeHidden,
  includePattern,
  excludePattern,
  limit,
})

watchPath({
  absolutePath,
  recursive,
})
```

## Consolidation

- `readTextFile`, `readFileBuffer`, and `readFileBufferUpTo` collapse into `readFile`
- `exists` and `stat` collapse into `getMetadata`
- `writeTextFile` and `guardedWriteTextFile` collapse into `writeFile`
- `createFile` and `createDirectory` collapse into `createPath`
- `rename` is just a same-parent `movePaths`
- `watchWorkspace` becomes `watchPath(workspaceRoot)`

## Search

Keep search as two distinct primitives:

- `searchFiles`
- `searchContent`

Do not collapse them into a single overloaded `search(...)`.

They have different semantics, different cost profiles, and different result shapes.

## Notes

- The shim should be pure path-based
- Workspace scoping should live in client logic, not in the remote filesystem interface
- `writeFile` should support conflict-aware writes via `expectedContent`
- `getMetadata` should return `null` for missing paths
- `watchPath` should be the primitive; any workspace-wide watch should be a wrapper
- higher-level helpers like `readWorkspaceDirectory` or `searchFilesMulti` should stay above the shim layer
