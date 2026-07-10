# PR 2 Plan: Host Attachment Store

## Summary

This PR introduces host-scoped attachment storage. The renderer can upload a file once, get back an opaque `attachmentId`, and reference that id in later agent launches without re-uploading or shuttling bytes through workspace creation.

**Scope of this PR:** the host-service `attachments.upload` / `attachments.delete` tRPC procedures and the on-disk storage layout. Nothing else. The renderer state slice that tracks uploaded ids and clears on host switch is intentionally deferred to **PR 5** ("Migrate Interactive Create UI" in `20260425-canonical-workspace-create-flow.md`) — the only consumer of that slice is the new workspace modal that lands in PR 5, so building it earlier means it sits unused for two PRs and risks shape drift.

This PR is independent of PR 1 (host agent configs) and PR 3 (pane store registry). PR 4 (`workspace.create()`) is what eventually consumes both attachments and agent configs together.

## Public API

```ts
attachments.upload({
  data: { kind: "base64"; data: string },
  mediaType: string,
  originalFilename?: string,
}) => {
  attachmentId: string,
  originalFilename?: string,
  mediaType: string,
  sizeBytes: number,
}

attachments.delete({ attachmentId: string }) => { success: true }
```

Notes:

- `attachmentId` is a UUID. The renderer treats it as opaque.
- `data` mirrors the existing `writeFileContentSchema` pattern in `filesystem.ts` — a tagged base64 string transported via tRPC over HTTP. Streaming/direct upload is a follow-up; the doc lists "Move attachment upload to the direct host upload flow" as future work.
- The renderer never sees the on-disk path. Path → host paths is resolved inside `workspace.create()` in PR 4.
- `delete` is idempotent (silent success on missing). Different verb semantics than `agentConfigs.remove` — attachments are typically deleted as cleanup after a failed flow, where "already gone" is the right answer.

## On-Disk Layout

Storage is **per-org under `HOST_MANIFEST_DIR`**, matching where `host.db` lives:

```
<HOST_MANIFEST_DIR>/attachments/<attachmentId>/<attachmentId>.<ext>
<HOST_MANIFEST_DIR>/attachments/<attachmentId>/metadata.json
```

`HOST_MANIFEST_DIR` is set per-org by the desktop coordinator (`host-service-coordinator.ts`) and contains the active org id. Standalone host-service runs fall back to `~/.superset/host/standalone/`.

Why per-org rather than `~/.superset/attachments/`:

- Same isolation boundary as `host.db`. One rule for "where does this org's data live?"
- Clean GC when an org is removed: `rm -rf` of the org dir takes attachments with it. A shared root would leave orphans forever.
- Defense-in-depth if a renderer bug ever leaks an `attachmentId` across hosts. The PR2 spec already mandates client-side clear-on-host-switch (lands in PR 5), but the storage boundary is belt-and-suspenders.

`metadata.json` shape:

```ts
{
  attachmentId: string,
  mediaType: string,
  originalFilename?: string,
  sizeBytes: number,
  createdAt: number, // epoch ms
}
```

File extensions are derived from MIME type via the `mime-types` library. Any MIME the lib recognizes is accepted — there is **no hand-curated allowlist**. The original draft had one (7 types: png/jpeg/gif/webp/pdf/txt/markdown), but for a coding-agent attachment store there's no good reason to rule out JSON, CSV, SVG, source files, etc. The library handles the long tail; we just need a known extension to write.

## Validation

- `mediaType` must resolve to a known extension via `mimeTypes.extension(...)` — otherwise `BAD_REQUEST`.
- Decoded bytes must be non-empty — otherwise `BAD_REQUEST`.
- Decoded bytes must be ≤ `MAX_ATTACHMENT_BYTES` (25 MB) — otherwise `PAYLOAD_TOO_LARGE`.
- `attachmentId` on `delete` is `z.string().uuid()`. This blocks path-traversal attacks (`"../../etc/passwd"`) at the schema layer; in practice the auth boundary already protects us, but it's free defense-in-depth and locks the format.

File and directory permissions: dir `0o700`, file `0o600`. User-private storage.

## Out of Scope

- **Renderer state slice for tracking uploaded ids + display metadata.** Moves to PR 5 with the new workspace modal.
- **Streaming/direct upload endpoint.** Listed as a follow-up in the umbrella plan; base64-over-tRPC is the v1 transport.
- **`workspace.create()` resolving `attachmentId` → host paths.** That's PR 4.
- **Listing or enumerating attachments.** Renderer tracks its own ids; server doesn't need to enumerate.
- **GC of orphaned attachments.** Not currently needed — the renderer drives lifecycle. If long-lived orphans become a problem, add a sweep based on `metadata.json.createdAt` later.
- **A migration of any existing attachment storage.** There isn't one; the v1 desktop path used IndexedDB blobs scoped to a pending workspace row. The IndexedDB path is left intact until the create flow migrates in PR 5.

## Tests

Backend tests run against a temp directory injected via `process.env.HOST_MANIFEST_DIR`:

- upload writes bytes + metadata to the expected path
- correct extension chosen per MIME (txt, pdf, jpg, json — exercising the `mime-types` lookup)
- unrecognized MIME rejected with `BAD_REQUEST`
- empty payload rejected
- oversized payload rejected with `PAYLOAD_TOO_LARGE`
- unique id assigned per upload
- delete removes the directory
- delete is idempotent for unknown id
- non-UUID id on delete is rejected (path-traversal guard)

## Follow-Ups

- Add the renderer attachment state slice in PR 5 alongside the new workspace modal.
- Switch to a streaming/direct upload endpoint when base64-over-tRPC starts mattering for size or memory.
- Resolve `attachmentId` → host-readable path inside `workspace.create()` prompt assembly (PR 4).
- Add a periodic GC sweep if orphaned attachment dirs become a real problem.
- **Per-org storage quota.** v1 has no aggregate cap — only the 25 MB per-file limit. An authenticated user can in principle fill disk through repeated uploads. Same blast radius as v1 desktop's IndexedDB blob storage (also unbounded). Add a guard once telemetry shows real footprint creep: count `metadata.json` files or sum `sizeBytes` across the attachment dir before accepting a new upload.
