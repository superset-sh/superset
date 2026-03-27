# Desktop Test Automation Implementation

## Current Slice

This document tracks the concrete rollout. The current slice is:

1. deterministic desktop test mode
2. minimal gated automation surface
3. Playwright launch and scenario runner
4. explicit auth seeding for authenticated scenarios

## Scope

### Done

- add `DESKTOP_TEST_MODE`
- isolate desktop state under a test-specific home dir
- skip updater, tray, notification-center, and Apple Events permission flows in test mode
- use fixed window bounds in test mode
- add basic automation commands for ping, environment, and window info
- add auth state inspect/seed/clear commands to the test automation bridge
- expose `window.App.testMode`
- expose `window.App.automation.*` through a dedicated test IPC bridge
- add Playwright desktop scaffolding under `apps/desktop/e2e/`
- add a first launch smoke test
- add `bun run e2e` / `bun run e2e:prepare`
- add `bun run e2e:scenario <name>` and `bun run e2e:smoke`
- add `bun run e2e:auth` to mint a short-lived desktop session for tests
- make `e2e:scenario` emit a per-run JSON summary with artifact paths
- skip Sentry sourcemap upload during E2E build prep
- support launch-time auth seeding via `DESKTOP_E2E_AUTH_TOKEN` and `DESKTOP_E2E_AUTH_EXPIRES_AT`
- support automatic auth minting via `DESKTOP_E2E_AUTH=1` or `DESKTOP_E2E_AUTH_EMAIL=...`
- prefer explicit token seeding over copied encrypted sign-in files

### Next

- add selector coverage to core screens
- add dialog stubbing and fixture seeding
- add more named scenarios agents can invoke

## Commands

- `bun run e2e`
- `bun run e2e:smoke`
- `bun run e2e:scenario smoke`
- `bun run e2e:scenario smoke -- --headed`
- `bun run e2e:auth`
- `DESKTOP_E2E_AUTH=1 bun run e2e:scenario smoke`
- `DESKTOP_E2E_AUTH_EMAIL=person@example.com bun run e2e:scenario smoke`
- `DESKTOP_E2E_AUTH_TOKEN=... DESKTOP_E2E_AUTH_EXPIRES_AT=... bun run e2e:scenario smoke`

## Design Notes

- Playwright is the canonical reusable test runner.
- Agents should invoke Playwright scenarios and inspect the resulting artifacts.
- `desktop-mcp` remains useful for ad hoc local debugging, but the app should not accumulate critical test logic there.
