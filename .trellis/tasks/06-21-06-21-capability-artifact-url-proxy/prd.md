# Fix capability artifact URLs for canary automation

## Goal

Prevent cloud Automation dispatch from sending dev-machine file:// capability package artifact URLs to remote host-service clients.

## Requirements

- Canary/online Automation dispatch must never send a `file://` URL or a
  developer-machine absolute path to a remote host-service.
- Capability package versions may still use local filesystem storage when the
  online API is running on the Mac mini without a real Blob token, but that
  storage must be hidden behind an API download URL.
- The host-service materializer should continue to consume a plain `http(s)`
  archive URL; avoid frontend changes and avoid requiring user interaction.
- Existing capability package rows that already contain `file://...` artifact
  URLs must be usable without manual DB surgery as long as the API host can
  read the local artifact file.
- Artifact download URLs must be content-addressed by version id and sha256, so
  they are stable and safe to cache.
- If an artifact is missing or its checksum does not match, the API should fail
  clearly instead of exposing a local path in the run error.

## Acceptance Criteria

- [x] Automation dispatch capability payloads contain `http(s)` artifact URLs
      based on `NEXT_PUBLIC_API_URL`, not stored `file://` URLs.
- [x] A new API route can serve locally stored capability zips by version id and
      sha, and can redirect Blob-backed packages.
- [x] Host-service capability materialization can fetch the API download URL and
      verify the existing checksum.
- [x] Regression tests cover local `file://` artifact URL normalization and API
      route download behavior.
- [x] Focused tests, lint, and typecheck pass before canary packaging.

## Notes

- Incident: Canary on a work computer failed `Run now` with an ENOENT for
  `/Users/bichengyu/.codex/worktrees/c8ae/superset/superset-dev-data/...zip`.
  That proves cloud Automation dispatch leaked a dev worktree artifact path to
  a remote host-service.
