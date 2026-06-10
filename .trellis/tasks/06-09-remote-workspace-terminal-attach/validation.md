# Validation

## Automated Checks

- `bun test packages/host-service/test/integration/terminal.integration.test.ts`
- `bun test 'apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/$taskId/page.test.ts'`
- `bun test 'apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/TasksView.test.ts'`
- `bun test 'apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/hooks/useRemoteHostStatus/useRemoteHostStatus.test.ts'`
- `bun test 'apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/TopBar/components/V2WorkspaceTitle/V2WorkspaceTitle.test.ts'`
- `bun run lint`
- `bun run typecheck`

## Desktop Acceptance

- Started the real Electron desktop app with `bun run --cwd apps/desktop dev`.
- Opened `#/tasks/8cfacd04-f256-4334-aaed-07c4f14c96e0`.
- Verified the Task detail Properties sidebar renders the Open in workspace
  controls without horizontal overflow.
- Captured screenshot:
  `.trellis/tasks/06-09-remote-workspace-terminal-attach/artifacts/task-detail-sidebar.png`
- Captured smoke report:
  `.trellis/tasks/06-09-remote-workspace-terminal-attach/artifacts/task-detail-sidebar-smoke.json`

## Notes

- Local Desktop Automation can validate the route, layout, and host-service
  runtime wiring on one machine.
- Full remote attach still needs a canary/manual two-machine check: keep this
  machine online, sign into the same account on the work machine, open a
  workspace owned by this machine, and attach to an existing terminal.
