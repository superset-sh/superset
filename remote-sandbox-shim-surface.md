# Remote Sandbox Shim Surface

We do **not** need to support the full `workspace-fs` API on day one.

## V1 Required

These are the minimum methods to support the existing core workspace features:

- `listDirectory`
- `readTextFile`
- `readFileBufferUpTo`
- `exists`
- `guardedWriteTextFile`
- `createFile`
- `createDirectory`
- `rename`
- `deletePaths`
- `searchFiles`
- `searchKeyword`

This covers:

- file tree browsing
- file viewer reads
- file save
- create/rename/delete flows
- quick open
- keyword/content search

## V1.5 Strongly Recommended

These are not strictly required for a first pass, but they materially improve product behavior:

- `watchWorkspace`
- `stat`

Notes:

- `watchWorkspace` keeps the UI reactive without polling or manual refresh.
- `stat` is useful metadata and helps future compatibility.

## V2 / Can Be Deferred

These can be added later if needed:

- `readFileBuffer`
- `writeTextFile`
- `movePaths`
- `copyPaths`
- `getServiceInfo`
- resource URI support

## Recommended Catalog Buckets

For the shim, I would model the surface as these capability buckets:

- `list`
- `read-text`
- `read-bytes-capped`
- `exists`
- `write-guarded`
- `create-file`
- `create-directory`
- `rename`
- `delete`
- `search-files`
- `search-content`
- `watch`
- `stat`

## Important Constraint

`guardedWriteTextFile` should be treated as the canonical save primitive.

Plain overwrite write is not enough if we want to preserve current save semantics and conflict handling.

## Summary

If the goal is a practical first remote sandbox shim, implement:

```ts
listDirectory
readTextFile
readFileBufferUpTo
exists
guardedWriteTextFile
createFile
createDirectory
rename
deletePaths
searchFiles
searchKeyword
```

Then add:

```ts
watchWorkspace
stat
```

Later, if needed:

```ts
readFileBuffer
writeTextFile
movePaths
copyPaths
getServiceInfo
resourceUris
```
