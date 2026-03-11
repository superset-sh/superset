# Remote Sandbox Shim Surface

This is the final state I would target for the remote filesystem shim.

Summary:

- `listDirectory` for directory listings
- `readFile` for text and byte reads, including paged reads
- `getMetadata` for path metadata and revision tokens
- `writeFile` for plain and conflict-aware writes
- `createDirectory`, `deletePath`, `movePath`, and `copyPath` for path mutations
- `searchFiles` and `searchContent` for path and content search
- `watchPath` for filesystem change events

## Core API

### `listDirectory`

Returns the direct children of a directory.

```ts
listDirectory({ absolutePath })
```

Returns:

```ts
{
  entries: Array<{
    absolutePath: string
    name: string
    kind: "file" | "directory" | "symlink" | "other"
  }>
}
```

### `readFile`

Reads a file as text or bytes. `offset` and `maxBytes` support paged reads.
Should return an opaque `revision` token representing the version of the file that was read.

```ts
readFile({ absolutePath, offset, maxBytes, encoding })
```

Returns:

```ts
{
  kind: "text" | "bytes"
  content: string | Uint8Array
  byteLength: number
  exceededLimit: boolean
  revision: string
}
```

If `exceededLimit` is `true`, more data is available after the returned chunk and the client can continue reading by calling `readFile` again with a larger `offset`.

### `getMetadata`

Returns file metadata, or `null` if the path does not exist.
Should return an opaque `revision` token representing the current version of the path.

```ts
getMetadata({ absolutePath })
```

Returns:

```ts
null | {
  absolutePath: string
  kind: "file" | "directory" | "symlink" | "other"
  size: number | null
  createdAt: string | null
  modifiedAt: string | null
  accessedAt: string | null
  mode?: number | null
  permissions?: string | null
  owner?: string | null
  group?: string | null
  symlinkTarget?: string | null
  revision: string
}
```

### `writeFile`

Writes file contents. `ifMatch` is the recommended conflict-aware write mechanism.
Use an opaque `revision` token from `readFile` or `getMetadata`. A revision is a freshness token for the version of the file the client last observed.
Without a `precondition`, this should act as a plain overwrite-or-create write.

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

Returns:

```ts
| {
    ok: true
    revision: string
  }
| {
    ok: false
    reason: "conflict"
    currentRevision: string
  }
```

### `createDirectory`

Creates a directory. File creation should happen through `writeFile`.

```ts
createDirectory({ absolutePath })
```

Returns:

```ts
{
  absolutePath: string
  kind: "directory"
}
```

### `deletePath`

Deletes a path. `permanent` controls trash vs hard delete behavior.

```ts
deletePath({ absolutePath, permanent })
```

Returns:

```ts
{
  absolutePath: string
}
```

### `movePath`

Moves a path. Rename is just a same-parent move.

```ts
movePath({ sourceAbsolutePath, destinationAbsolutePath })
```

Returns:

```ts
{
  fromAbsolutePath: string
  toAbsolutePath: string
}
```

### `copyPath`

Copies a path.

```ts
copyPath({ sourceAbsolutePath, destinationAbsolutePath })
```

Returns:

```ts
{
  fromAbsolutePath: string
  toAbsolutePath: string
}
```

### `searchFiles`

Searches file names and paths.

```ts
searchFiles({ query, includeHidden, includePattern, excludePattern, limit })
```

Returns:

```ts
{
  matches: Array<{
    absolutePath: string
    relativePath: string
    name: string
    kind: "file" | "directory" | "symlink" | "other"
    score: number
  }>
}
```

### `searchContent`

Searches file contents and should return line/column-oriented matches.

```ts
searchContent({ query, includeHidden, includePattern, excludePattern, limit })
```

Returns:

```ts
{
  matches: Array<{
    absolutePath: string
    relativePath: string
    line: number
    column: number
    preview: string
  }>
}
```

### `watchPath`

Subscribes to path changes.

```ts
watchPath({ absolutePath, recursive })
```

Yields:

```ts
{
  events: Array<{
    kind: "create" | "update" | "delete" | "rename" | "overflow"
    absolutePath: string
    oldAbsolutePath?: string
  }>
}
```

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
