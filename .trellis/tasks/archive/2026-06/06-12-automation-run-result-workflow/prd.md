# Automation run result workflow

## Goal

Upgrade Automations from "scheduled agent session launchers" into a run-result workflow:
each manual or scheduled firing should create a visible Run, track useful lifecycle state,
and show the run's report/result in Superset instead of making Terminal the primary result
surface.

This borrows the strong parts of Multica Autopilot (Run lifecycle, Run History, result
traceability) without copying its product model wholesale. Superset keeps its own
Automation entries, host/workspace targeting, relay execution, and remote terminal
debugging.

## Confirmed Facts

- Current Superset Automations store `automations` and `automation_runs` in cloud Postgres.
- Current run states are dispatch-oriented only: `dispatching`, `dispatched`,
  `skipped_offline`, and `dispatch_failed`.
- `dispatchAutomation` marks a run as `dispatched` once `agents.run` returns a chat or
  terminal session id; it does not know whether the agent completed the work.
- The desktop detail page shows `Previous runs` in the right sidebar; clicking a run opens
  the linked workspace terminal/chat session.
- `agents.run` on host-service returns only `{ kind, sessionId, label }`.
- The user does not want Multica-style Issue creation.
- The user does not want webhook/API triggers in this iteration; this remains an internal
  workbench scheduled/manual automation feature.
- The user wants a separate result panel rather than Terminal being the product result.
- Historical Automation/Chat data may be discarded during this internal-development phase;
  backward compatibility is not a product requirement.
- Repo rule: modify Drizzle schema source files first and do not manually edit generated
  files under `packages/db/drizzle/`.

## Requirements

- Keep existing Automation creation/editing concepts: name, prompt, agent, target host,
  project/workspace, schedule, timezone, enabled state.
- Support only two trigger sources for now:
  - manual `Run Now`
  - scheduled RRULE evaluation
- Upgrade `automation_runs` so each run can represent the business execution lifecycle:
  queued/dispatching/running/completed/failed/skipped style states, timestamps, host,
  workspace, session links, error/failure reason, and result content.
- Create an Automation Run result/detail panel in the desktop app.
- Clicking a previous run should open the run result/detail panel first.
- Terminal/chat session links should remain available from the detail panel as debugging
  or transcript/source links, not as the primary result.
- Run Now should create visible feedback immediately: the user should see a new run row and
  a result panel in dispatching/running state without having to infer what happened.
- Add an explicit run completion writeback path so the running agent can write a Markdown
  report/result back to Superset.
- The writeback path should be machine-friendly and usable by CLI/API so future agents,
  plugins, and non-UI workflows can report completion consistently.
- If a host is offline or dispatch fails, the result panel should show a clear skipped or
  failed state with the actionable error.
- Keep the current remote host/workspace execution advantage. Runs should still execute on
  the selected host and existing/new workspace flow.
- Do not add Multica Issue, webhook, or API trigger concepts in this iteration.
- Do not make Terminal output scraping the primary completion mechanism.

## Acceptance Criteria

- [ ] Creating or opening an Automation still works with the existing create/edit fields.
- [ ] `Run Now` creates a new visible Run row quickly and shows a result/detail panel.
- [ ] A running automation displays status, scheduled/trigger source, target host, workspace,
      agent/session link, and elapsed or timestamp information.
- [ ] A completed automation run displays a Markdown result/report in Superset.
- [ ] A failed/skipped automation run displays failure reason/error in the result panel.
- [ ] Previous Runs no longer navigate directly to Terminal by default; they select/open the
      run result panel.
- [ ] The result panel offers an explicit "Open terminal" or equivalent debug action when a
      terminal/chat session exists.
- [ ] Scheduled evaluation still advances `nextRunAt` and dispatches due automations.
- [ ] Manual run conflict/dedup behavior remains predictable and does not create duplicate
      rows for the same run attempt.
- [ ] The CLI/API exposes a way to mark a run completed/failed with result content.
- [ ] Desktop UI follows cache-first Electric/TanStack DB rendering and does not blank
      existing run data while collections sync.
- [ ] Focused tests cover status mapping, run writeback validation, router access checks,
      and result-panel rendering.
- [ ] Desktop acceptance validates the real Automation path with screenshots: run now,
      visible run detail panel, and terminal/debug link availability.

## Out Of Scope

- Webhook trigger support.
- Public API trigger support beyond internal/CLI run writeback.
- Multica-style Issue creation.
- Multi-trigger-per-automation management.
- Full agent transcript ingestion or terminal-output scraping.
- A general report analytics dashboard across all automations.

## Open Questions

- Resolved: use explicit Superset run-result writeback as the primary completion signal,
  with terminal/session links as debug fallback. User approved this direction before
  implementation.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
