# Automation Run Result Workflow Design

## Product Shape

Superset Automations should become recurring work/report runs:

- Automation: the reusable definition owned by the user.
- Run: one manual or scheduled firing of the definition.
- Result panel: the product surface for a run's outcome.
- Terminal/chat session: debug/source transcript, not the primary result surface.

This keeps Superset's differentiated strengths: host selection, relay, workspaces/worktrees,
and remote execution on real machines. It intentionally does not copy Multica's Issue,
webhook, API trigger, or squad model.

## Current Architecture

Current cloud schema:

- `automations`: definition, schedule, target host/project/workspace, agent, prompt.
- `automation_runs`: `title`, `scheduledFor`, `hostId`, `v2WorkspaceId`, `sessionKind`,
  `chatSessionId`, `terminalSessionId`, `status`, `error`, `dispatchedAt`.

Current dispatch:

1. `runNow` or QStash dispatch calls `dispatchAutomation`.
2. `dispatchAutomation` resolves host and workspace.
3. Host-service `agents.run` starts a chat or terminal session.
4. Superset marks the run `dispatched`.

The missing part is completion/result ownership. Host-service does not currently return
agent completion or report content from `agents.run`.

## Target Data Model

Update `automation_runs` to support run-result semantics.

Recommended fields:

- `source`: `manual` | `schedule`
- `status`: new lifecycle values such as:
  - `queued`
  - `dispatching`
  - `running`
  - `completed`
  - `failed`
  - `skipped`
- `startedAt`
- `completedAt`
- `updatedAt`
- `failureReason`
- `resultMarkdown`
- `resultJson`
- `resultSummary`
- `resultSource`: `agent_writeback` | `session_exit` | `system`
- `terminalExitCode`

Add a small event/timeline table if the implementation can do it cleanly:

- `automation_run_events`
  - `id`
  - `automationRunId`
  - `organizationId`
  - `type`
  - `message`
  - `payload`
  - `createdAt`

Event examples:

- `run_created`
- `host_resolved`
- `workspace_prepared`
- `session_started`
- `result_received`
- `run_failed`
- `run_skipped`

If event-table scope threatens delivery, keep timeline derivable from run fields for this
iteration and leave `automation_run_events` as a follow-up.

## Completion Writeback

Primary completion signal should be explicit writeback, not terminal scraping.

Dispatch should wrap the user's prompt with a short Automation Run instruction block:

- Explain that this is an Automation run.
- Provide the run id.
- Tell the agent to produce a concise Markdown report at the end.
- Tell the agent to call a Superset CLI/API command to mark the run completed or failed.
- Tell the agent not to create its own cron/reminder/scheduler.

Host-service `agents.run` should accept optional automation run context, including env
overrides if needed:

- `SUPERSET_AUTOMATION_RUN_ID`
- `SUPERSET_AUTOMATION_ID`
- `SUPERSET_AUTOMATION_SOURCE`
- `SUPERSET_API_URL`
- a short-lived automation run token if the writeback endpoint requires bearer auth

The CLI/API writeback shape should be intentionally boring:

```text
superset automations runs complete <run-id> --result-file report.md
superset automations runs fail <run-id> --reason "..."
```

Equivalent tRPC procedures:

- `automation.completeRun({ runId, resultMarkdown, resultJson?, summary? })`
- `automation.failRun({ runId, failureReason, resultMarkdown? })`
- `automation.getRun({ runId })`

Authorization:

- Owner can read their own automation runs.
- An automation-run-scoped token can complete/fail only its bound `runId`.
- Completion should be idempotent for already terminal runs; avoid corrupting a completed
  result with late duplicate writes.

## Dispatch Flow

Manual:

1. User clicks `Run Now`.
2. API creates run with `source = manual`, `status = dispatching`.
3. Desktop receives run through Electric and selects/opens the run detail panel.
4. Dispatch resolves host.
5. If no host/offline: mark `skipped`, set `failureReason`.
6. If workspace creation/agent launch fails: mark `failed`, set `failureReason`.
7. If session starts: mark `running`, set session/workspace links and `startedAt`.
8. Agent writes back result:
   - success: `completed`, `resultMarkdown`, `completedAt`
   - failure: `failed`, `failureReason`, optional `resultMarkdown`, `completedAt`

Scheduled:

1. QStash evaluate finds due automations.
2. Dispatch body includes `source = schedule`.
3. `nextRunAt` advancement remains as-is, with existing dedup protections.
4. Result lifecycle follows the manual flow.

## Desktop UI

Automation detail page should gain a run-focused surface.

Recommended UI:

- Main content can switch between prompt editor and selected run result panel.
- `Previous runs` click selects a run, updates route/search state, and opens the result
  panel.
- Run result panel sections:
  - status header
  - timestamps/duration/source
  - target host/workspace/agent
  - Markdown report area
  - failure/error area
  - timeline/events
  - debug actions: open terminal/chat, copy run id

For empty/new runs:

- Dispatching/running panel should show useful skeleton/progress, not a blank state.
- Existing cached run data should stay visible while Electric catches up.

## API / SDK / CLI / MCP

Update SDK resource types so callers understand new run fields.

Update CLI:

- `automations logs` should show the new status, source, started/completed time, and host.
- Add run writeback commands under `automations runs` or a similarly discoverable path.

Update MCP if quick:

- `automations_logs` should expose result-aware fields.
- Optional: add `automations_complete_run` only if it is clearly useful for agent tools.

## Migration Notes

The repo rules say not to manually edit generated files under `packages/db/drizzle/`.
Implementation should modify schema/enums first. A Drizzle migration must be generated through
the repo workflow against a non-production branch.

Because there are no external users yet, the migration may be allowed to discard existing
automation run history if that makes the enum/result schema cleaner. Production database
changes still require explicit confirmation before running migrations.

## Risks

- Long-running automations may outlive short JWTs. The writeback token TTL must be long
  enough or scoped differently.
- Terminal agents may ignore writeback instructions. The UI must represent "running/no
  result yet" clearly and offer the debug terminal link.
- Passing credentials via prompt is unsafe and ugly. Prefer environment variables or
  host-service context, not visible prompt text.
- Electric sync lag can make UI appear empty unless cache-first rendering is preserved.
- Enum replacement in Postgres can be annoying. Prefer additive statuses unless the generated
  migration is explicitly reviewed for a destructive reset.

## Validation Strategy

- Unit/source tests:
  - run status display mapping
  - run duration/timestamp helpers
  - completion/failure procedure validation
  - prompt wrapping avoids telling the agent to create its own cron
- Router tests if the project has existing tRPC test patterns available.
- CLI tests for new command argument parsing/display if cheap.
- Desktop Automation CLI smoke:
  - start app/service graph
  - open Automations
  - trigger Run Now on a test automation
  - assert run detail panel appears
  - assert status/error/result area is visible
  - capture screenshot artifact

