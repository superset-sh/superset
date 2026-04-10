# Superset Local Investigation Notes

This directory contains a workspace-local copy of the Superset Desktop source used to investigate terminal/TUI corruption and repaint issues.

## Local-only patches kept here

These changes were useful for local validation but are not intended to be sent upstream as-is:

- local packaging identity changes for `Superset Patched.app`
- local app-home / userData isolation experiments
- forced DOM renderer in terminal helpers
- local sidebar sync fix after `Open project`

## Upstream candidate patches

The current upstream candidate focuses on the terminal visibility/focus restore path:

- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/hooks/useTerminalLifecycle.ts`
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/hooks/useTerminalLifecycle.test.ts`

## Existing local terminal-host patch context

This copy also includes the `Session.attach()` snapshot/socket ordering fix and tests:

- `apps/desktop/src/main/terminal-host/session.ts`
- `apps/desktop/src/main/terminal-host/session.test.ts`
- `apps/desktop/src/main/terminal-host/session-attach-overlap.test.ts`

That area appears to overlap with the already-open upstream PRs:

- #3081
- #3310
