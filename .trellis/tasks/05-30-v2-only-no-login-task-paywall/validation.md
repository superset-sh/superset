# Validation

## 2026-05-30

- `bun run --cwd apps/desktop generate:routes` — passed.
- `bun test apps/desktop/src/renderer/routes/_authenticated/v2-only-cleanup.test.ts` — passed.
- `bun test apps/desktop/src/renderer/routes/_authenticated/settings/utils/settings-search/settings-search.test.ts` — passed.
- `bun test apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/TasksView.test.ts` — passed.
- `bun test packages/trpc/src/router/task/task.test.ts` — passed.
- `bun run lint:fix` — passed and formatted changed files.
- `bun run lint` — passed.
- `bun run typecheck` — passed.
- `git diff --check` — passed.

## Search Gates

- No active `useIsV2CloudEnabled`, `v2-local-override`, `V1ImportModal`, `CrossVersionMismatchState`, or `V2AvailableBanner` references remain outside the source-level regression test.
- No `GATED_FEATURES.TASKS` or `gateFeature(GATED_FEATURES.TASKS, ...)` references remain.
- Onboarding routes are compatibility redirects to `/v2-workspaces`; the onboarding implementation components were deleted.
- Remaining `create-organization` usage is the explicit organization menu entry, not the authenticated shell post-login detour.

## 2026-05-31

- `./.superset/setup.local.sh` — passed. Created a local `.env`, started the local Docker Postgres/neon-proxy/Electric stack, ran migrations, and seeded the local dev account. This validation used local DB ports from `.env`, not Neon/production.
- `bun run --cwd apps/api dev` — passed for the desktop auth smoke backend on `http://localhost:3001`.
- `bun run --cwd apps/desktop dev` — passed for the real Electron desktop app with `NEXT_PUBLIC_API_URL=http://localhost:3001` and local Electric direct URL `http://localhost:3009` because caddy is not installed on this machine.
- Desktop Automation CLI: unauthenticated launch redirected to `#/sign-in` and captured `.trellis/tasks/05-30-v2-only-no-login-task-paywall/artifacts/01-sign-in.png` plus `.trellis/tasks/05-30-v2-only-no-login-task-paywall/artifacts/01-sign-in.json`.
- Desktop Automation CLI: new email/password sign-up with a local `@local.test` account persisted `superset-dev-data/auth-token.enc`, landed on `#/v2-workspaces`, and captured `.trellis/tasks/05-30-v2-only-no-login-task-paywall/artifacts/02-sign-up-v2-workspaces.png` plus `.trellis/tasks/05-30-v2-only-no-login-task-paywall/artifacts/02-sign-up-v2-workspaces.json`.
- Desktop Automation CLI: after deleting the local dev auth token, app startup from the previous `#/tasks` route still hit the login blocker and redirected to `#/sign-in`; captured `.trellis/tasks/05-30-v2-only-no-login-task-paywall/artifacts/04-login-blocker-sign-in.png` plus `.trellis/tasks/05-30-v2-only-no-login-task-paywall/artifacts/04-login-blocker-sign-in.json`.
- Desktop Automation CLI: existing email/password sign-in persisted `superset-dev-data/auth-token.enc`, landed on `#/v2-workspaces`, and captured `.trellis/tasks/05-30-v2-only-no-login-task-paywall/artifacts/05-sign-in-v2-workspaces.png` plus `.trellis/tasks/05-30-v2-only-no-login-task-paywall/artifacts/05-sign-in-v2-workspaces.json`.
- Desktop Automation CLI: Tasks navigation via the real V2 sidebar opened `#/tasks`, rendered the Tasks/Linear surface, and a DOM assertion returned `hasPaywall: false`; captured `.trellis/tasks/05-30-v2-only-no-login-task-paywall/artifacts/03-tasks-no-paywall.png` plus `.trellis/tasks/05-30-v2-only-no-login-task-paywall/artifacts/03-tasks-no-paywall.json`.
- Desktop Automation CLI: `navigate --path /tasks` was fixed to update the app's persistent router history before reloading, then verified a direct `#/tasks` route rendered the Tasks/Linear surface; captured `.trellis/tasks/05-30-v2-only-no-login-task-paywall/artifacts/06-direct-tasks-route.png` plus `.trellis/tasks/05-30-v2-only-no-login-task-paywall/artifacts/06-direct-tasks-route.json`.
- Desktop Automation CLI console error checks returned no renderer errors at the sign-in, V2 workspace, and Tasks checkpoints.
- `bun test packages/desktop-mcp` — passed.
- `bun run --cwd packages/desktop-mcp typecheck` — passed.
- `bun run --cwd apps/desktop generate:routes` — passed.
- `bun run desktop:automation -- help` — passed.
- `bun test apps/desktop/src/renderer/routes/_authenticated/v2-only-cleanup.test.ts apps/desktop/src/renderer/routes/_authenticated/settings/utils/settings-search/settings-search.test.ts apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/TasksView.test.ts` — passed.
- `bun test packages/trpc/src/router/task/task.test.ts` — passed.
- `bun run lint:fix` — passed with no fixes applied.
- `bun run lint` — passed.
- `bun run typecheck` — passed.
- `git diff --check` — passed.
