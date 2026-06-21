# Streamline worktree dev startup and cleanup

## Goal

Reduce local desktop E2E overhead by turning the repeated worktree startup,
fixture setup, and cleanup steps into repo-owned commands.

This task intentionally implements three of the four retrospective items:

- Worktree startup has no one-command path.
- E2E fixture state is too scattered.
- Worktree cleanup is too manual.

The Desktop Automation operation-chain question is out of implementation scope
for this task; answer it in the final response with a product/engineering
recommendation.

## Requirements

- Add a worktree-local development lifecycle command that can start, stop, and
  report status for the desktop E2E service graph:
  - Docker data services for the current worktree.
  - API.
  - Relay.
  - Electric proxy.
  - Desktop/Electron with an automation port.
- The lifecycle command must use the current worktree `.env` ports and
  `SUPERSET_HOME_DIR`, and must avoid stopping other Superset checkouts.
- Add a reusable E2E workspace fixture helper for project rows used by desktop
  workspace flows:
  - Seed by repo URL/name/slug for the local dev account organization.
  - Clean by slug or id.
  - Refuse obvious production DB targets by default.
- Add a worktree-only cleanup command that removes:
  - This worktree's dev app processes/sessions.
  - This worktree's Docker compose project.
  - Optional E2E project/workspace fixture rows.
  - Optional local clone/worktree directories associated with E2E slugs.
- Expose the commands through root `package.json` scripts so a developer can run
  them without remembering implementation paths.
- Keep all changes local-development/tooling scoped; do not change production
  app behavior or database schema.

## Acceptance Criteria

- [x] `bun run dev:worktree:start` starts the local service graph or reuses
  already-running sessions, then waits on API, relay, Electric proxy, and
  Desktop Automation readiness.
- [x] `bun run dev:worktree:status` prints ports, tmux/session state, Docker
  state, and real readiness probes.
- [x] `bun run dev:worktree:stop` stops only this worktree's sessions and Docker
  project.
- [x] `bun run dev:worktree:cleanup -- --e2e-slug <slug>` cleans worktree-local
  services plus test rows and local clone/worktree directories for the supplied
  slug.
- [x] `bun run e2e:workspace-fixture -- seed ...` can create a project fixture
  for the dev account organization and print machine-readable JSON.
- [x] `bun run e2e:workspace-fixture -- cleanup ...` can delete fixture
  project/workspace rows and print machine-readable JSON.
- [x] Commands include dry-run or status/readiness paths where destructive
  cleanup would otherwise be hard to verify.
- [x] Validation covers command help/status and a real worktree startup/stop
  flow.

## Notes

- Existing `.superset/setup.local.sh` provisions the per-worktree `.env` and DB
  stack. This task should build on that, not replace it.
- Main branch production cleanup is intentionally out of scope; the worktree
  cleanup command must stay local/dev focused.
