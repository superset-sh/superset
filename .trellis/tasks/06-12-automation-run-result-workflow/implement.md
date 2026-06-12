# Automation Run Result Workflow Implementation Plan

## Phase 0: Preconditions

- User approves the PRD/design direction.
- If schema migration is needed, follow the database migration rules:
  - edit schema source files first
  - do not manually edit `packages/db/drizzle/*`
  - generate migration only through the approved Drizzle/Neon workflow
  - do not run production migrations without explicit confirmation

## Phase 1: Data And Contracts

- Update `packages/db/src/schema/enums.ts` for result-aware run statuses.
- Update `packages/db/src/schema/schema.ts`:
  - add source/result/timestamp/failure fields to `automation_runs`
  - optionally add `automation_run_events` if still contained
- Update inferred types and Electric collection consumption as needed.
- Update `packages/trpc/src/router/automation/schema.ts` with run input/output schemas.
- Add tRPC procedures:
  - `getRun`
  - `completeRun`
  - `failRun`
- Keep authorization organization-scoped and owner/run-token scoped.

## Phase 2: Dispatch Lifecycle

- Update `dispatchAutomation` to:
  - accept source (`manual` or `schedule`)
  - create a run in dispatching state
  - mark no-host/offline as skipped
  - mark launch errors as failed
  - mark successful session launch as running
  - store workspace/session links and timestamps
- Wrap the agent prompt with an Automation Run footer/instruction.
- Extend host-service `agents.run` input only if needed to inject safe environment variables
  for run writeback.
- Avoid exposing secrets in visible prompt text.

## Phase 3: CLI / SDK

- Update `packages/sdk/src/resources/automations.ts` run types.
- Update `packages/cli/src/commands/automations/logs/command.ts` display.
- Add completion/failure CLI commands, probably:
  - `superset automations runs complete <run-id> --result-file <path>`
  - `superset automations runs fail <run-id> --reason <text> [--result-file <path>]`

## Phase 4: Desktop UI

- Add route/search state for selected automation run.
- Update Previous Runs:
  - use richer status labels
  - click selects result panel instead of navigating directly to terminal
- Add `AutomationRunResultPanel` under the automation detail route.
- Result panel should show:
  - status/source/timing
  - result markdown
  - failure reason
  - host/workspace/agent/session metadata
  - explicit debug action to open terminal/chat
- Keep prompt editor accessible when no run is selected or through a clear tab/button.
- Follow cache-first Electric rendering: do not hide existing run data while collections sync.

## Phase 5: Tests And Acceptance

- Add focused tests for pure helpers/status mapping.
- Add router/CLI tests where existing patterns make it practical.
- Run:
  - `bun run lint:fix`
  - focused package tests for touched modules
  - `bun run typecheck` if the surface is broad
  - `bun run lint`
- Desktop acceptance:
  - start required local service graph
  - run Desktop Automation CLI smoke
  - save screenshots/reports under `.trellis/tasks/06-12-automation-run-result-workflow/artifacts/`

## Rollback Points

- Data model changes are the riskiest point. Keep schema edits isolated and migration reviewable.
- If completion writeback is not ready, the UI can still show dispatch/running/failure states
  and terminal debug links, but this should not be considered feature-complete.
- If event table grows scope, cut it and derive a small timeline from run fields in this
  iteration.

## Definition Of Done

- Run Now no longer feels like a mystery action.
- Runs have lifecycle states that represent business execution, not just dispatch.
- The user can open a run and read the result/report in Superset.
- Terminal remains available as debug transcript, not the main result UI.
- Scheduled runs still fire.
- The implementation passes focused checks and real desktop acceptance.
