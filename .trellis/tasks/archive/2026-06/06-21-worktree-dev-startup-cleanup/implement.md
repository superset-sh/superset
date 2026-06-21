# Implementation Plan

1. Add `.superset/worktree-dev.sh` with `start`, `status`, `stop`, `cleanup`,
   `run-service`, and `help` commands.
2. Add root `package.json` scripts for the worktree lifecycle.
3. Add `scripts/e2e-workspace-fixture.ts` with seed/cleanup/status-style JSON
   output and production-target guardrails.
4. Wire `dev:worktree:cleanup` to call fixture cleanup and remove local E2E
   directories when requested.
5. Add focused tests for the fixture helper's argument parsing/safety helpers
   if practical without touching a real DB; otherwise validate via command help
   and a local DB smoke.
6. Validate:
   - `bun run e2e:workspace-fixture -- help`
   - `bun run dev:worktree:status`
   - `bun run dev:worktree:start`
   - `bun run dev:worktree:status`
   - `bun run dev:worktree:stop`
   - `bun run lint:fix`
   - `bun run lint`

## Risk And Rollback

- The riskiest part is stopping the wrong process. Keep process ownership inside
  per-worktree tmux sessions and the per-worktree compose project, and avoid
  broad `pkill` logic.
- The second risk is fixture cleanup against production. Use explicit URL
  guardrails and default to the dev account.
- Rollback is straightforward: remove the new scripts and package.json entries.
