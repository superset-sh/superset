# Trellis Superset task status sync

## Goal

When a Superset Task is opened into a Code Workspace with the guided workflow
enabled, Trellis lifecycle progress should update the canonical Superset Task
status automatically.

The user value is that Code can keep its repository-local workflow discipline
without making users manually mirror status back into Superset's Task board.
Superset Task remains the product-facing source of truth; Trellis stays the
repository-local workflow kernel.

## Requirements

### Confirmed Facts

- Superset already has a CLI task surface under `packages/cli/src/commands/tasks`.
- `superset tasks update <idOrSlug> --statusId <status-id>` calls cloud tRPC
  `task.update`, so updates can sync across machines.
- `superset tasks statuses list --json` can resolve organization-specific
  status ids.
- Superset default status `type` values include:
  - `backlog`
  - `unstarted`
  - `started`
  - `completed`
  - `canceled`
- Trellis task lifecycle hooks are configured in `.trellis/config.yaml`:
  - `hooks.after_create`
  - `hooks.after_start`
  - `hooks.after_finish`
  - `hooks.after_archive`
- Trellis passes `TASK_JSON_PATH` to lifecycle hook commands.
- Trellis `task.py start` moves task status from `planning` to `in_progress`.
- Trellis `task.py finish` only clears the active task pointer; it does not mean
  the work is complete.
- Trellis `task.py archive` writes `task.json.status = completed` before moving
  the task to archive.
- The previous task completed Code Workspace guided workflow initialization and
  can write repo-local Trellis files safely.

### Product Requirements

- Add a Superset Task status bridge for Trellis lifecycle changes.
- The first slice should target the task launched from Superset into Code
  Workspace, not arbitrary Trellis tasks in the repository.
- When a Superset Task opens a guided Code Workspace, automatically create or
  link one Trellis task mirror so the lifecycle hook has a stable `task.json`
  to observe.
- Store the Superset Task identity in Trellis task metadata, likely:
  `task.json.meta.supersetTaskId`.
- Sync status changes from Trellis to Superset:
  - Trellis `after_start` / `in_progress` -> Superset status type `started`
  - Trellis `after_archive` / `completed` -> Superset status type `completed`
- Do not treat Trellis `finish` as done; `finish` only clears active context.
- Hook failures must not block Trellis or Agent work.
- Avoid requiring a globally installed `superset` command when the desktop app
  can provide or bundle the CLI.
- The UI should not expose low-level hook details unless setup fails or needs
  user action.

### Technical Requirements

- Add or inject a repo-local hook script, for example
  `.trellis/scripts/hooks/superset_task_sync.py`.
- The hook should read `TASK_JSON_PATH`, parse `task.json`, and find
  `meta.supersetTaskId`.
- The hook should resolve status ids by querying Superset status list and
  selecting by status `type`, not hard-coded UUIDs or localized names.
- The hook should call Superset's existing task update API through the CLI or a
  thin local bridge.
- The hook should degrade cleanly when:
  - no linked Superset Task id exists
  - Superset CLI is unavailable
  - auth/session/api key is unavailable
  - the machine is offline
  - status type cannot be resolved
- Workspace creation / task launch should create or link a Trellis task artifact
  only when it can do so conservatively without overwriting existing Trellis
  files.
- Existing projects with Trellis must not have their custom hooks overwritten.
  Hook installation should merge config or skip with a warning.

## Acceptance Criteria

- [ ] Launching a Superset Task into a guided Code Workspace records the
      Superset Task id in the associated Trellis task metadata.
- [ ] Starting the linked Trellis task updates the Superset Task to the
      organization's `started` status.
- [ ] Archiving the linked Trellis task updates the Superset Task to the
      organization's `completed` status.
- [ ] Running Trellis `finish` does not mark the Superset Task complete.
- [ ] Missing CLI/auth/offline failures produce a warning/log but do not fail
      the Trellis lifecycle command.
- [ ] Status ids are resolved dynamically from Superset statuses by `type`.
- [ ] Existing `.trellis/config.yaml` hooks are preserved when adding the sync
      hook.
- [ ] Focused tests cover status mapping, missing metadata, missing CLI/auth,
      and config merge behavior.
- [ ] Desktop acceptance covers a Task-opened workspace and verifies the Task
      status changes after the Trellis lifecycle hook path runs.

## Out of Scope

- Full bidirectional Superset Task <-> Trellis task sync.
- Importing every existing `.trellis/tasks/*` record into Superset.
- Creating Superset Tasks from arbitrary Trellis tasks.
- Syncing descriptions, PRD contents, assignees, labels, priority, or comments.
- Blocking Agent execution on cloud status update success.

## Open Questions

- None blocking. Decision recorded: the MVP auto-creates or links one
  conservative Trellis task mirror for the Superset Task that opened the guided
  Code Workspace.

## Notes

- This is a follow-up to
  `.trellis/tasks/archive/2026-06/06-01-code-workspace-trellis-initialization`.
