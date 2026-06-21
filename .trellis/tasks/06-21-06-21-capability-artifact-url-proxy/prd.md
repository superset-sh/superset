# Fix capability artifact URLs for canary automation

## Goal

Prevent cloud Automation dispatch from sending dev-machine file:// capability
package artifact URLs to remote host-service clients, and make online
capability package storage server-owned instead of developer-worktree-owned.

## Requirements

- Canary/online Automation dispatch must never send a `file://` URL or a
  developer-machine absolute path to a remote host-service.
- Online capability package versions must store archive bytes in a server-owned
  S3-compatible object store. The Mac mini online deployment uses a local MinIO
  service; future hosted deployments can point the same env contract at R2/AWS
  S3.
- Database rows must not store public S3/MinIO URLs for capability archives.
  They store an internal `superset-artifact:` reference plus the content
  pathname/sha. The API route resolves that reference server-side.
- Local filesystem artifact storage is allowed only for non-online development.
  Online mode must fail loudly if neither object storage nor hosted Blob storage
  is configured.
- The host-service materializer should continue to consume a plain `http(s)`
  archive URL; avoid frontend changes and avoid requiring user interaction.
- Existing capability package rows that already contain `file://...` artifact
  URLs are legacy-compatible only when the API host can still read the file or
  an object exists at the same `artifactPathname`. Missing legacy files must
  produce a clear unavailable-artifact error and require re-import.
- Artifact download URLs must be content-addressed by version id and sha256, so
  they are stable and safe to cache.
- If an artifact is missing or its checksum does not match, the API should fail
  clearly instead of exposing a local path in the run error.

## Acceptance Criteria

- [x] Automation dispatch capability payloads contain `http(s)` artifact URLs
      based on `NEXT_PUBLIC_API_URL`, not stored `file://` URLs.
- [x] A new API route can serve capability zips by version id and sha from an
      internal artifact reference, S3-compatible object storage, legacy local
      files, or existing Blob-backed packages.
- [x] Host-service capability materialization can fetch the API download URL and
      verify the existing checksum.
- [x] Regression tests cover internal artifact references, object-storage-backed
      storage, local `file://` legacy normalization, and API route download
      behavior.
- [x] Online service startup provisions an S3-compatible object store and exports
      the `SUPERSET_OBJECT_STORAGE_*` env contract.
- [x] Focused tests, lint, and typecheck pass before canary packaging.

## Notes

- Incident: Canary on a work computer failed `Run now` with an ENOENT for
  `/Users/bichengyu/.codex/worktrees/c8ae/superset/superset-dev-data/...zip`.
  That proves cloud Automation dispatch leaked a dev worktree artifact path to
  a remote host-service.
- Follow-up incident: After the API proxy fix, canary failed with
  `Failed to download capability archive: HTTP 404` because the online DB still
  pointed at a missing worktree zip. That proved hiding `file://` behind an API
  URL is not enough; the source of truth must move to object storage.
