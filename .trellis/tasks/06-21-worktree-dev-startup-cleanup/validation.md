# Validation

## Passed

- `bash -n .superset/setup.local.sh && bash -n .superset/worktree-dev.sh`
- `bun test scripts/e2e-workspace-fixture.test.ts`
- `bun run e2e:workspace-fixture -- help`
- `bun run dev:worktree:cleanup -- --dry-run --e2e-slug e2e-paseo-progress-1285 --worktree-name paseo`
- `bun run dev:worktree:start`
  - Started Docker compose project `superset-1285-superset`.
  - Ran migrations and ensured `admin@local.test`.
  - Started tmux sessions for API, Relay, Electric proxy, and Desktop.
  - Readiness passed for Neon proxy SQL, API session, Relay health, Electric auth gate, and Desktop Automation on port `3198`.
- `bun run e2e:workspace-fixture -- seed --slug e2e-fixture-smoke-1285 --name FixtureSmoke --repo-url https://github.com/getpaseo/paseo.git --id 10000000-0000-4000-8000-000000001299`
  - Inserted the fixture project for the local dev organization.
- `DESKTOP_AUTOMATION_PORT=3198 bun run desktop:automation -- smoke --url-includes '#/' --screenshot .trellis/tasks/06-21-worktree-dev-startup-cleanup/artifacts/worktree-dev-smoke.png --report .trellis/tasks/06-21-worktree-dev-startup-cleanup/artifacts/worktree-dev-smoke.json`
  - Passed at `http://localhost:3185/#/sign-in`.
  - Renderer console logs: 0.
- `bun run dev:worktree:cleanup -- --e2e-slug e2e-fixture-smoke-1285 --worktree-name paseo`
  - Deleted 1 fixture project row and 0 workspace rows.
  - Stopped this worktree's tmux sessions and Docker compose project.
- Post-cleanup residual checks:
  - `bun run dev:worktree:status` showed no sessions/containers and failed readiness probes, as expected after cleanup.
  - `docker ps --filter 'name=superset-1285-superset'` returned no containers.
  - `lsof -nP -iTCP:3181 -iTCP:3185 -iTCP:3192 -iTCP:3193 -iTCP:3198 -sTCP:LISTEN` returned no listeners.
  - `tmux -S .tmp/worktree-dev/tmux.sock list-sessions` returned no sessions.
- `bun run lint:fix`
- `bun run lint`
- Final pre-PR validation after Trellis spec updates:
  - `bash -n .superset/setup.local.sh && bash -n .superset/worktree-dev.sh`
  - `bun test scripts/e2e-workspace-fixture.test.ts`
  - `bun test apps/desktop/src/renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/PromptGroup/PromptGroup.test.ts apps/desktop/src/renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/PromptGroup/hooks/useSubmitWorkspace/useSubmitWorkspace.test.ts apps/desktop/src/renderer/stores/workspace-creates/useWorkspaceCreates.test.ts`
  - `bun test packages/host-service/src/trpc/router/project/utils/resolve-repo.test.ts`
  - `bun run e2e:workspace-fixture -- help`
  - `bun run lint`
  - `git diff --check`

## Notes

- First implementation pass exposed a useful failure mode: running Desktop `predev` inside the long-lived tmux session made a failed `predev` look like slow Desktop readiness. `predev` now runs in the foreground before the Desktop session starts, and Desktop readiness fails immediately if the tmux session exits.
- `setup.local.sh` now writes direct Wrangler Electric URLs when Caddy is unavailable, instead of always writing the Caddy HTTPS URL.
- Trellis spec guidance was updated in `.trellis/spec/guides/desktop-acceptance-tdd.md` and `.trellis/spec/guides/quality-and-testing.md` so future AI sessions in other worktrees discover the one-command worktree lifecycle and cleanup contract.
