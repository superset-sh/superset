# Automation Orphan Run Reconciliation

## Problem

Automation runs can remain `running` forever when the launched terminal/agent
finishes or disappears without executing the Superset writeback command. A real
example is run `68147a74-afa8-4493-b9e9-81f97e061aa8`: the cloud row is still
`running`, has no result, and points at terminal
`a8324838-b88a-452b-83ca-af01661c6f72`, but the local pty-daemon no longer has
that session.

The Automations list also briefly appeared to show only one automation after a
new automation was created, even though the cloud table and TanStack persisted
cache contained two rows. The list should converge quickly after creation and
not depend solely on a live query repaint.

A second real failure happened when `Run now` targeted a project that was not
set up on the chosen host and whose cloud project had no `repo_clone_url`.
Host-service correctly rejected the workspace creation with relay 412, but the
user-visible experience was a late, noisy dispatch failure.

Automation execution also must not create project worktrees by default.
Creating or running an Automation should be a host-service runtime concern, not
a Code Workspace lifecycle. A run may carry optional project context for file
mentions or future tools, but that context must not imply cloning, git worktree
creation, `.superset/setup.sh`, or v2 workspace rows.

## Goals

- Reconcile stale Automation runs so orphaned `running` rows do not stay
  running forever.
- Keep Automation result UX centered on run status/result panel, not the debug
  terminal.
- Make the Automations list converge immediately after create by merging a
  fresh cloud read with Electric/TanStack cached rows.
- Preserve the existing completed writeback path; do not regress successful
  `agent_writeback` runs.
- Treat Project as optional Automation context only. Project context must not
  force host rerouting, clone checks, workspace setup, or relay 412 preflights.
- Turn impossible host combinations into clear failed/skipped run history
  instead of noisy relay surprises.
- Make agent selection portable across host reroutes: machine-local agent config
  ids must resolve to stable preset ids before launching on another host.
- Make default Automation execution use a host-local run directory and process
  manager, not any v2 workspace/worktree.

## Non-Goals

- Do not redesign Automations product workflow again.
- Do not add external webhook/API triggers.
- Do not add a full durable job runner in this patch.
- Do not mark a live long-running agent failed only because the result has not
  appeared yet.
- Do not create v2 workspace rows for default Automation execution.

## Acceptance Criteria

- A selected `running` run older than a conservative timeout can be reconciled
  to `failed` with a clear `failureReason` and `resultSource = "system"`.
- Recent run history no longer leaves orphaned rows looking actively running
  after reconciliation.
- The Automations list displays rows from cached Electric data plus fresh cloud
  data, de-duplicated by id and sorted newest first.
- Existing completed runs still render their Markdown result and are not
  modified by reconciliation.
- `Run now` uses the requested online host, or a default online accessible host
  when no host is pinned, regardless of project setup state.
- If host selection changes machines, machine-local agent config ids are mapped
  to portable preset ids before launch.
- `Run now` with or without project context never performs clone-url or local
  setup validation before launch.
- New Automation creation does not require a Project or Workspace. Project is
  optional context only.
- Run Now and scheduled runs do not call `workspaces.create`, do not create
  worktrees, and do not run project setup scripts.
- Host-service starts the selected agent from a run-scoped directory under the
  Superset home directory and records process output as the fallback result.
- Focused tests cover run display/merge behavior, list merge behavior,
  reconciliation decision logic, and dispatch failure normalization.
- Desktop acceptance must click `Run now` on a real automation and verify the
  newest `automation_runs` row by status, host id, workspace id, and session id.
