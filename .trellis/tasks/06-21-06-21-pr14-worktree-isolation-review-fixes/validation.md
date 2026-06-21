# Validation

## Passed

- `bash -n .superset/setup.local.sh && bash -n .superset/worktree-dev.sh && bash -n .superset/lib/worktree-local.sh`
- `bun test scripts/worktree-local-shell.test.ts scripts/e2e-workspace-fixture.test.ts`
  - Covers same-basename worktree compose project uniqueness.
  - Covers stale managed `.env` detection.
  - Covers remote `DATABASE_URL` rejection before destructive lifecycle actions.
  - Covers owner/name cleanup directory candidates.
- `bun test packages/host-service/src/trpc/router/project/utils/resolve-repo.test.ts`
  - Covers `deriveCloneDirectoryName` owner/name output for GitHub URLs.
  - Re-runs existing local clone safety tests.
- `bun run lint:fix`
- `bun run lint`
- `git diff --check`

## Review Decision

- Adopted P1: default `LOCAL_DB_PROJECT` now includes a deterministic hash of
  the physical worktree path, so two Codex worktrees ending in `superset` do not
  share one Docker compose project.
- Adopted P1: `dev:worktree:start` now treats the managed local block plus
  current `SUPERSET_WORKTREE_ID`/`SUPERSET_WORKTREE_ROOT` and local service URL
  ports as the readiness signal. Stop/cleanup/run-service assert the same local
  safety before touching services.
- Adopted P2: GitHub clone target directories now use owner/name, while cleanup
  returns both the new owner-name and old repo-name candidates.
