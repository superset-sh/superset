# Remote Sandbox Shim Surface

This is the final state I would target for the remote filesystem shim.

## Core API

### `listDirectory`

Returns the direct children of a directory.

```ts
listDirectory({ absolutePath })
```

### `readFile`

Reads a file as text or bytes. `maxBytes` supports capped reads.
Use this instead of separate text, bytes, and capped-read primitives.

```ts
readFile({ absolutePath, maxBytes, encoding })
```

### `getMetadata`

Returns file metadata, or `null` if the path does not exist.
Use this instead of separate `exists` and `stat` calls.

```ts
getMetadata({ absolutePath })
```

### `writeFile`

Writes file contents. `ifMatch` is the recommended conflict-aware write mechanism.
Use an opaque revision token from `readFile` or `getMetadata`.

```ts
writeFile({
  absolutePath,
  content,
  encoding,
  precondition: {
    ifMatch: revision,
  },
})
```

### `createPath`

Creates a file or directory. `content` only applies to file creation.

```ts
createPath({ absolutePath, kind, content })
```

### `deletePaths`

Deletes one or more paths. `permanent` controls trash vs hard delete behavior.

```ts
deletePaths({ absolutePaths, permanent })
```

### `movePaths`

Moves one or more paths. Rename is just a same-parent move.

```ts
movePaths({ sourceAbsolutePaths, destinationAbsolutePath })
```

### `copyPaths`

Copies one or more paths.

```ts
copyPaths({ sourceAbsolutePaths, destinationAbsolutePath })
```

### `searchFiles`

Searches file names and paths.

```ts
searchFiles({ query, includeHidden, includePattern, excludePattern, limit })
```

### `searchContent`

Searches file contents and should return line/column-oriented matches.

```ts
searchContent({ query, includeHidden, includePattern, excludePattern, limit })
```

### `watchPath`

Subscribes to path changes. This should be the primitive watch operation.
Any workspace-wide watch should be a wrapper around this.

```ts
watchPath({ absolutePath, recursive })
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
- higher-level helpers like `readWorkspaceDirectory` or `searchFilesMulti` should stay above the shim layer
