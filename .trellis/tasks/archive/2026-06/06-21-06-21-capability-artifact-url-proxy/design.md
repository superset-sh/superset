# Design

## Root Cause

Capability imports store package zips in Vercel Blob in production. In local dev
or Mac mini online mode without a real Blob token, the same code falls back to a
local `capability-artifacts/` directory and persists a `file://...` URL in
`capability_package_versions.artifact_url`.

That is acceptable for single-machine dev, but Automation dispatch sends
`artifactUrl` to the selected host-service. A remote canary host then tries to
open the Mac mini path locally and fails with `ENOENT`.

## Fix

Add an API artifact download surface:

```text
GET /api/capability-artifacts/:versionId/:sha256.zip
```

The route looks up the version row by `id` and `artifactSha256`.

- `superset-artifact:` artifacts: parse the internal object key, read from the
  configured S3-compatible object store, validate sha256, and return
  `application/zip`.
- legacy `file://` artifacts: read from the API host filesystem when the file is
  still present, then fall back to the same `artifactPathname` in the object
  store. Missing legacy files return a sanitized 404.
- `http(s)` artifacts: redirect to the stored Blob URL.
- anything else: return a server error and log enough context.

Then normalize capability artifact URLs before they leave cloud dispatch:

```text
${NEXT_PUBLIC_API_URL}/api/capability-artifacts/${versionId}/${artifactSha256}.zip
```

This keeps host-service unchanged. It still downloads bytes from an `http(s)`
URL and validates the checksum locally.

Capability import now stores archive bytes through a shared storage helper:

- Object storage configured through `SUPERSET_OBJECT_STORAGE_*` wins first. It
  uploads to the configured bucket and stores only `superset-artifact:<key>` in
  `artifact_url`.
- Real Vercel Blob remains supported for hosted deployments that already have a
  Blob token.
- Local filesystem fallback is allowed only in non-online development. Online
  mode must fail instead of silently writing into a developer worktree.

Online service startup now provisions a local MinIO service and bucket through
Docker Compose, exports the object storage env contract, and still overrides
`SUPERSET_HOME_DIR` to an online runtime directory. This prevents future
capability packages from being written under a developer worktree's
`superset-dev-data` path when `scripts/superset-online.sh` sources the root
`.env`.

## Guardrails

- Do not change renderer UI.
- Do not require manual database edits for existing rows.
- Do not expose local paths in dispatch payloads.
- Do not expose S3/MinIO/R2 object URLs in dispatch payloads or user-visible UI.
- Keep content-addressed URL generation in `packages/trpc` so future dispatch
  and binding callers reuse one rule.
