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

- `file://` artifacts: read from the API host filesystem, validate sha256, and
  return `application/zip`.
- `http(s)` artifacts: redirect to the stored Blob URL.
- anything else: return a server error and log enough context.

Then normalize capability artifact URLs before they leave cloud dispatch:

```text
${NEXT_PUBLIC_API_URL}/api/capability-artifacts/${versionId}/${artifactSha256}.zip
```

This keeps host-service unchanged. It still downloads bytes from an `http(s)`
URL and validates the checksum locally.

Online service startup also overrides `SUPERSET_HOME_DIR` to an online runtime
directory. This prevents future locally stored capability packages from being
written under a developer worktree's `superset-dev-data` path when
`scripts/superset-online.sh` sources the root `.env`.

## Guardrails

- Do not change renderer UI.
- Do not require manual database edits for existing rows.
- Do not expose local paths in dispatch payloads.
- Keep content-addressed URL generation in `packages/trpc` so future dispatch
  and binding callers reuse one rule.
