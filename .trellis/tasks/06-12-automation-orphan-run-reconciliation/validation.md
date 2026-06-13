# Validation

## Automated Checks

- `bun test packages/trpc/src/router/automation/schema.test.ts packages/trpc/src/router/automation/dispatch-workspace-decoupling.test.ts packages/trpc/src/router/automation/dispatch-errors.test.ts`
  - 9 passed.
  - Covers the final no-workspace API contract: new Automation writes reject
    non-null `v2WorkspaceId`, dispatch source no longer contains
    `workspaces.create`, `v2Workspaces`, `createWorkspaceOnHost`, or
    `setup.sh`, and legacy project-setup relay errors no longer tell users to
    import a project for Automation.
- `bun test packages/trpc/src/router/automation/run-workspace-cleanup.test.ts packages/trpc/src/router/automation/run-reconciliation.test.ts packages/trpc/src/router/automation/dispatch-errors.test.ts packages/trpc/src/router/automation/dispatch-agent-selection.test.ts packages/trpc/src/router/automation/dispatch-workspace-decoupling.test.ts packages/trpc/src/router/automation/schema.test.ts packages/host-service/src/trpc/router/agents/agents.test.ts packages/host-service/test/workspace-cleanup.test.ts`
  - 46 passed.
  - Covers stale run reconciliation, legacy workspace cleanup, portable agent
    selection, dispatch workspace decoupling, schema validation, host-service
    Automation runner, and workspace cleanup safety.
- `bun run --cwd packages/trpc typecheck`
  - passed.
- `bun run --cwd packages/host-service typecheck`
  - passed.
- `bun run --cwd apps/desktop typecheck`
  - passed.
- `bun run --cwd packages/cli typecheck`
  - passed.
- `bun run --cwd packages/sdk typecheck`
  - passed.
- `bun run lint:fix`
  - passed; no fixes applied.
- `bun run lint`
  - passed.
- `git diff --check`
  - passed.
- `bun test apps/desktop/src/renderer/routes/_authenticated/_dashboard/automations/utils/agentDisplay/agentDisplay.test.ts apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/automationRunVisibility.test.ts 'apps/desktop/src/renderer/routes/_authenticated/_dashboard/automations/$automationId/utils/automationRunDisplay/automationRunDisplay.test.ts' packages/trpc/src/router/automation/dispatch-workspace-decoupling.test.ts packages/host-service/src/trpc/router/agents/agents.test.ts packages/trpc/src/router/automation/dispatch-agent-selection.test.ts packages/trpc/src/router/automation/schema.test.ts`
  - 27 passed.
  - Covers Runner display, UUID hiding, visible run status labels, legacy
    Automation worktree filtering, workspace-decoupled dispatch, portable agent
    selection, and host-service run directory behavior.
- `./node_modules/.bin/biome check --write --unsafe 'apps/desktop/src/renderer/routes/_authenticated/_dashboard/automations/$automationId/page.tsx'`
  - passed.
- `bun run --cwd apps/desktop typecheck`
  - passed.

## Desktop Acceptance

- Restarted the real dev desktop graph from
  `/Users/bichengyu/Documents/toolProject/superset` after discovering the
  visible Electron window was still running an older Codex worktree at
  `/Users/bichengyu/.codex/worktrees/86b1/superset`.
- Screenshot artifact:
  `.trellis/tasks/06-12-automation-orphan-run-reconciliation/artifacts/automation-current-after-restart.png`.
- Real Automation detail inspection verified:
  - Details panel labels the agent picker as `Runner`.
  - Existing machine-local agent UUID is displayed as `Claude`, not a raw UUID.
  - The legacy `Workspace` row is gone; `Context` is optional project metadata.
  - Previous Runs shows visible status pills such as `Completed`, `Failed`, and
    `Running`.
  - Legacy `System resource report every 10 minutes` workspace rows remain in
    the database for history but no longer appear in the sidebar.
- Real `Run now` acceptance on automation
  `cf328680-c2c4-49b2-be67-0c36947ffd74`:
  - Before click: Docker container count was `17`; no
    `superset-system-resource-report-every-*` containers existed;
    `~/.superset/dev/automation-runs` had `2` run directories and was `24K`.
  - New run id: `8a4cb159-59e9-48ae-8e87-f3d987175127`.
  - New run row moved to `running` with `host_id` populated and
    `v2_workspace_id`, `session_kind`, `terminal_session_id`, and
    `chat_session_id` all null.
  - After click: Docker container count stayed `17`; still no
    `superset-system-resource-report-every-*` containers; run directory count
    became `3` and total size became `32K`.
  - New run directory contained only lightweight files:
    `metadata.json` (`205B`), `prompt.md` (`908B`), `stdout.log` (`0B`), and
    `stderr.log` (`0B`).
  - The test run's Claude child process was intentionally stopped after the
    resource checks to avoid continuing a news-report task started by
    validation.

## Notes

- Product boundary is now explicit: Automation may carry optional Project
  context, but default execution is a host-service background runner. Project
  context must not trigger clone checks, worktree creation, workspace setup,
  `.superset/setup.sh`, or v2 workspace rows.
- Host-service `agents.runAutomation` owns the run process and writes only
  lightweight runtime artifacts under the Superset home automation-runs
  directory, such as `prompt.md`, `metadata.json`, `stdout.log`, and
  `stderr.log`. This directory is runtime logging, not a Code workspace.
- Legacy `automation_runs.v2_workspace_id` cleanup remains only for rows that
  were already created by the old isolated-workspace implementation. New runs
  should not need workspace cleanup.
- Historical root cause for Docker/container leaks: old Automation runs created
  isolated repo worktrees, executed this repo's `.superset/setup.sh` / `bun dev`,
  and did not always tear those ephemeral workspaces down. The current dispatch
  path removes that cause by not creating project workspaces in the first place.
