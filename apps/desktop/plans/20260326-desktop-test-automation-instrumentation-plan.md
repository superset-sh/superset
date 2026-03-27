# Desktop Test Automation Plan

## Goal

Make the same desktop scenarios runnable by humans, CI, and agents.

Playwright is the canonical test surface. `desktop-mcp` is a temporary sidecar for exploration and debugging, and should stay easy to remove.

## Direction

- Use Playwright for reusable desktop scenarios and regression tests.
- Let agents run Playwright scenarios instead of building a second test framework.
- Keep a small test-only automation API for deterministic setup and inspection.
- Keep `desktop-mcp` minimal for screenshots and ad hoc debugging of a running dev app.

## Current Repo Hooks

- Dev CDP already exists in [setup.ts](/Users/kietho/.superset/worktrees/superset/instrument-desktop-test-automation/apps/desktop/src/lib/electron-app/factories/app/setup.ts#L73).
- `desktop-mcp` already attaches to the running app in [connection-manager.ts](/Users/kietho/.superset/worktrees/superset/instrument-desktop-test-automation/packages/desktop-mcp/src/mcp/connection/connection-manager.ts#L27).
- Stable selectors are still sparse, for example [CodeEditor.tsx](/Users/kietho/.superset/worktrees/superset/instrument-desktop-test-automation/apps/desktop/src/renderer/screens/main/components/WorkspaceView/components/CodeEditor/CodeEditor.tsx#L234).

## Near-Term Rollout

### 1. Deterministic Test Mode

- isolate state
- fix window size
- skip updater, tray, permission, and quit noise

### 2. Minimal Automation API

- expose gated test helpers like `ping()` and environment/window info
- add auth seeding, fixture seeding, and dialog stubbing next

### 3. Playwright Harness

- keep `apps/desktop/e2e/` as the canonical scenario layer
- save screenshots, traces, and video artifacts
- provide stable commands agents can invoke

### 4. Selector Hardening

- add stable locators to core desktop surfaces

### 5. MCP De-Emphasis

- keep `desktop-mcp` useful for debugging
- do not move the canonical regression suite there

## Non-Goals

- building a second reusable MCP-first test framework
- making OS dialog automation the default path
- keeping `desktop-mcp` as the long-term center if Playwright covers the need
- copying a developer's encrypted `signin` or `auth-token.enc` state into tests

## Auth

- Default to auth-neutral smoke tests when auth is not under test.
- For authenticated scenarios, mint a short-lived desktop session token and pass it into test mode.
- Prefer `DESKTOP_E2E_AUTH=1` in local dev, which mints a session for the default desktop E2E user.
- Use `DESKTOP_E2E_AUTH_EMAIL=...` when a scenario needs a specific user identity.
- Seed that token through explicit test hooks, not by copying persisted sign-in files.

## References

- Electron automated testing: https://www.electronjs.org/docs/latest/tutorial/automated-testing
- Playwright Electron API: https://playwright.dev/docs/api/class-electron
- Playwright Test Agents: https://playwright.dev/docs/test-agents
- Playwright tracing: https://playwright.dev/docs/api/class-tracing
- Playwright locators: https://playwright.dev/docs/locators
- Playwright CDP connection: https://playwright.dev/docs/api/class-browsertype
