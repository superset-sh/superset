# Remote Workspace Terminal Attach Implementation Plan

## Checklist

1. Audit current remote Workspace route/provider wiring.
   - Confirm `WorkspaceClientProvider` receives the owning host URL for remote
     workspaces.
   - Confirm terminal WebSocket URL is derived from that provider.
2. Add or fix remote terminal session discovery/adoption UI.
   - Use `workspaceTrpc.terminal.listSessions({ workspaceId })` against the
     owning host.
   - Expose attach/focus behavior for sessions that exist on the owning host.
   - Preserve local background terminal behavior.
3. Add remote/offline user states.
   - Surface remote host owner and unavailable state when host-service/relay is
     offline.
   - Avoid local worktree creation during remote open.
4. Fix Task detail Properties sidebar overflow.
   - Constrain right sidebar child widths.
   - Truncate long host/project/agent/status labels.
   - Add source/unit test where practical.
5. Add focused tests.
   - Host URL resolver tests for local vs remote.
   - Terminal session attach/list behavior tests or existing host-service
     integration test extensions.
   - Source/layout regression for Task detail Open-in-Workspace controls.
6. Run validation.
   - Focused Bun tests for changed packages/files.
   - `bun run lint`.
   - Desktop Automation CLI smoke with screenshot/report artifacts under this
     task directory.

## Validation Commands

Use focused checks first, then root checks:

```bash
bun test packages/host-service/src/terminal/terminal.adoption.node-test.ts
bun test apps/desktop/src/renderer/hooks/host-service/useHostTargetUrl
bun test apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks
bun run lint
```

Desktop acceptance, after the local service graph is running:

```bash
bun run desktop:automation -- window-info --json
bun run desktop:automation -- smoke --url-includes "#/tasks" --screenshot .trellis/tasks/06-09-remote-workspace-terminal-attach/artifacts/task-detail-sidebar.png --report .trellis/tasks/06-09-remote-workspace-terminal-attach/artifacts/task-detail-sidebar.json
```

Manual post-canary validation:

1. Leave this machine signed in and host-service online.
2. Install the canary on the work machine.
3. Sign in with the same account.
4. Open a Workspace created on this machine.
5. Attach to an existing Terminal session and run a harmless command.

## Rollback Points

- If remote terminal adoption destabilizes local terminal behavior, revert the
  remote session UI changes while keeping Task sidebar layout fixes.
- If relay/remote host failures are noisy, gate remote attach affordances behind
  host online/reachable checks and leave remote Workspace rows visible read-only.

## Review Gate

Before `task.py start`, confirm the MVP scope:

- same-account full-control remote attach;
- no local clone;
- no new sharing-link UX;
- Task detail sidebar overflow fix included.
