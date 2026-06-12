# Validation

## Real Desktop Acceptance

- Restarted the local API and desktop dev graph so API, Electron main, host-service, and renderer all used the current working tree.
- Confirmed local dev Postgres has the new `automation_runs` result workflow columns: `source`, `result_markdown`, `result_source`, `failure_reason`, `started_at`, `completed_at`, and `updated_at`.
- Used the real desktop UI to open Automations and trigger `Run now` for `System resource report every 10 minutes`.
- Verified a new run was created:
  - run id: `65b6c10a-2143-452a-80a0-697a599f5815`
  - initial status: `running`
  - source: `manual`
  - terminal session id: `d8b57441-2e70-4184-8311-2bcc33bda4f7`
- Verified the run completed through agent writeback:
  - final status: `completed`
  - result source: `agent_writeback`
  - result markdown length: `253`
- Verified the result panel renders the Markdown report after fixing stale selected-run merging.
- Verified `Open terminal` opens the debug/source terminal and the visible command does not expose token values as a shell env prefix.

## Screenshot Artifacts

- `artifacts/12-automation-list-visible.png`
- `artifacts/13-automation-detail-before-click-run-now.png`
- `artifacts/14-run-now-result-panel-running.png`
- `artifacts/16-completed-result-after-selection-merge-fix.png`
- `artifacts/17-debug-terminal-after-open.png`

## Checks

- `bun test packages/host-service/src/trpc/router/agents/agents.test.ts packages/trpc/src/router/automation/schema.test.ts apps/desktop/src/main/lib/bundled-cli.test.ts 'apps/desktop/src/renderer/routes/_authenticated/_dashboard/automations/$automationId/utils/automationRunDisplay/automationRunDisplay.test.ts' 'apps/desktop/src/renderer/routes/_authenticated/_dashboard/automations/$automationId/utils/automationRunSelection/automationRunSelection.test.ts'`
  - 20 passed, 0 failed.
- `bun run lint:fix`
  - completed; Biome fixed 4 files.
- `bun run lint`
  - passed.
- `bun run typecheck`
  - passed; 29 successful Turbo tasks.

## Notes

- Direct hash navigation to `#/automations/<id>` while the Code shell was active did not refresh the visible shell until clicking the left Automations nav. The acceptance path therefore used the real sidebar navigation.
- The renderer logged one Electric `409 Conflict` during live sync, but the selected-run tRPC fallback now makes the result panel converge to the fresh completed run row instead of staying on stale cached `running` data.
