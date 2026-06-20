# Implementation

1. Add a capability artifact URL helper in `packages/trpc`.
2. Normalize `listAutomationCapabilityBindings` artifact URLs to API download
   URLs.
3. Add `apps/api` route for `/api/capability-artifacts/[versionId]/[sha256]`.
4. Add focused tests:
   - URL helper strips trailing API slashes and emits an `http(s)` URL.
   - Automation dispatch payload no longer contains a `file://` artifact URL.
   - API route serves a local artifact and validates sha.
5. Run focused tests, lint, and typecheck.

## Validation

- `bun test packages/trpc/src/router/capability/artifact-url.test.ts packages/trpc/src/router/automation/dispatch-workspace-decoupling.test.ts packages/trpc/src/router/automation/dispatch-errors.test.ts 'apps/api/src/app/api/capability-artifacts/[versionId]/[sha256]/route.test.ts'`
- `bun run lint`
- `bun run --cwd packages/trpc typecheck`
- `bun run --cwd apps/api typecheck`
- `NODE_OPTIONS=--max-old-space-size=8192 bun run --cwd apps/desktop typecheck`
- `NODE_OPTIONS=--max-old-space-size=8192 bunx turbo typecheck --concurrency=1`
- `bash -n scripts/superset-online.sh`

Note: the first unconstrained `bun run typecheck` run was killed by the OS
during desktop `tsr generate` (`SIGKILL`, exit 137). Re-running with lower
Turbo concurrency completed successfully.
