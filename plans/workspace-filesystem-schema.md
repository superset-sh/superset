# Workspace Filesystem Schema

Pure path-based filesystem shim. Workspace scoping lives in client logic above this layer.

## API

### `listDirectory`

```ts
listDirectory({ absolutePath: string })
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

Text or byte reads. `offset` and `maxBytes` support paged reads. Returns opaque `revision` token.

If `encoding` is provided, returns `kind: "text"` with `content: string`. If omitted, returns `kind: "bytes"` with `content: Uint8Array`.

If `exceededLimit` is `true`, more data is available and the client can continue with a larger `offset`.

```ts
readFile({ absolutePath: string, offset?: number, maxBytes?: number, encoding?: string })
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

### `getMetadata`

Returns `null` if path does not exist.

```ts
getMetadata({ absolutePath: string })
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

`options` controls create-vs-update semantics (VS Code FileSystemProvider pattern):
- `create: true, overwrite: true` — create or overwrite (default when omitted)
- `create: true, overwrite: false` — create only, fail if exists
- `create: false, overwrite: true` — update only, fail if not exists

`precondition.ifMatch` enables revision-based conflict detection using an opaque token from `readFile` or `getMetadata`. Both `options` and `precondition` are optional.

```ts
writeFile({
  absolutePath: string,
  content: string | Uint8Array,
  encoding?: string,
  options?: { create: boolean, overwrite: boolean },
  precondition?: { ifMatch: string },
})
```

Returns:

```ts
| { ok: true, revision: string }
| { ok: false, reason: "conflict", currentRevision: string }
| { ok: false, reason: "exists" }
| { ok: false, reason: "not-found" }
```

### `createDirectory`

File creation happens through `writeFile`. Idempotent — succeeds silently if the directory already exists.

```ts
createDirectory({ absolutePath: string })
```

Returns:

```ts
{ absolutePath: string, kind: "directory" }
```

### `deletePath`

`permanent` controls trash vs hard delete.

```ts
deletePath({ absolutePath: string, permanent?: boolean })
```

Returns:

```ts
{ absolutePath: string }
```

### `movePath`

Rename is a same-parent move. Fails if destination already exists.

```ts
movePath({ sourceAbsolutePath: string, destinationAbsolutePath: string })
```

Returns:

```ts
{ fromAbsolutePath: string, toAbsolutePath: string }
```

### `copyPath`

```ts
copyPath({ sourceAbsolutePath: string, destinationAbsolutePath: string })
```

Returns:

```ts
{ fromAbsolutePath: string, toAbsolutePath: string }
```

### `searchFiles`

```ts
searchFiles({ query: string, includeHidden?: boolean, includePattern?: string, excludePattern?: string, limit?: number })
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

```ts
searchContent({ query: string, includeHidden?: boolean, includePattern?: string, excludePattern?: string, limit?: number })
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

Best-effort delivery, no ordering guarantees. On `overflow`, client should full-resync.

```ts
watchPath({ absolutePath: string, recursive?: boolean })
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

## Notes

- Pure path-based — no `workspaceId` in the shim
- Workspace scoping lives in client logic
- Higher-level helpers (`searchFilesMulti`, `readWorkspaceDirectory`) stay above this layer
- Search stays as two distinct primitives — different semantics, cost profiles, and result shapes
