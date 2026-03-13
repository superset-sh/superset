# Workspace Filesystem Schema

Pure path-based filesystem shim. Workspace scoping lives in client logic above this layer.

## API

### `listDirectory`

```ts
listDirectory({ absolutePath })
→ { entries: Array<{ absolutePath, name, kind: "file" | "directory" | "symlink" | "other" }> }
```

### `readFile`

Text or byte reads with optional paging. Returns opaque `revision` token.

```ts
readFile({ absolutePath, offset?, maxBytes?, encoding? })
→ { kind: "text" | "bytes", content: string | Uint8Array, byteLength, exceededLimit, revision }
```

### `getMetadata`

Returns `null` if path does not exist. Returns opaque `revision` token.

```ts
getMetadata({ absolutePath })
→ null | { absolutePath, kind, size, createdAt, modifiedAt, accessedAt, revision,
           mode?, permissions?, owner?, group?, symlinkTarget? }
```

### `writeFile`

`options` controls create-vs-update semantics (VS Code FileSystemProvider pattern):
- `create: true, overwrite: true` — create or overwrite (default when omitted)
- `create: true, overwrite: false` — create only, fail if exists
- `create: false, overwrite: true` — update only, fail if not exists

`precondition.ifMatch` enables revision-based conflict detection. Both `options` and `precondition` are optional.

```ts
writeFile({ absolutePath, content, encoding?, options?: { create, overwrite }, precondition?: { ifMatch: revision } })
→ { ok: true, revision }
| { ok: false, reason: "conflict", currentRevision }
| { ok: false, reason: "exists" }
| { ok: false, reason: "not-found" }
```

### `createDirectory`

File creation happens through `writeFile`.

```ts
createDirectory({ absolutePath })
→ { absolutePath, kind: "directory" }
```

### `deletePath`

`permanent` controls trash vs hard delete.

```ts
deletePath({ absolutePath, permanent? })
→ { absolutePath }
```

### `movePath`

Rename is a same-parent move.

```ts
movePath({ sourceAbsolutePath, destinationAbsolutePath })
→ { fromAbsolutePath, toAbsolutePath }
```

### `copyPath`

```ts
copyPath({ sourceAbsolutePath, destinationAbsolutePath })
→ { fromAbsolutePath, toAbsolutePath }
```

### `searchFiles`

```ts
searchFiles({ query, includeHidden?, includePattern?, excludePattern?, limit? })
→ { matches: Array<{ absolutePath, relativePath, name, kind, score }> }
```

### `searchContent`

```ts
searchContent({ query, includeHidden?, includePattern?, excludePattern?, limit? })
→ { matches: Array<{ absolutePath, relativePath, line, column, preview }> }
```

### `watchPath`

Best-effort delivery, no ordering guarantees. On `overflow`, client should full-resync.

```ts
watchPath({ absolutePath, recursive? })
yields { events: Array<{ kind: "create" | "update" | "delete" | "rename" | "overflow", absolutePath, oldAbsolutePath? }> }
```

## Notes

- Pure path-based — no `workspaceId` in the shim
- Workspace scoping lives in client logic
- Higher-level helpers (`searchFilesMulti`, `readWorkspaceDirectory`) stay above this layer
- Search stays as two distinct primitives — different semantics, cost profiles, and result shapes
