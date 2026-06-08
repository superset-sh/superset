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
- The bundled desktop CLI at `$SUPERSET_HOME_DIR/bin/superset` is a local shim
  to this repo's built CLI, not the upstream official binary.
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
- Validation after the initial implementation exposed a blocking gap:
  a real Task-opened workspace had Trellis hooks installed, but the active
  Trellis task had `meta: {}` and therefore no `meta.supersetTaskId`.
- The initial hook maps `after_start`, `start`, and `in_progress` to Superset
  status type `started`, but that mapping is unreachable when the Trellis task
  is not durably linked to the Superset Task.
- The CLI auth path was not reliable from Agent/Trellis hooks because desktop
  login wrote only encrypted app token storage while the CLI reads
  `${SUPERSET_HOME_DIR}/config.json`.
- Terminal environments intentionally strip `AUTH_TOKEN`, `HOST_*`, and most
  `SUPERSET_*` runtime secrets, but preserve `SUPERSET_HOME_DIR`. The clean
  product contract is therefore shared home-dir config, not auth environment
  leakage.
- Superset default status names map product intent as:
  - `unstarted` -> Todo
  - `started` -> In Progress
  - `completed` -> Done
- Desktop validation exposed a second Task-flow gap: after
  `apiTrpcClient.task.create` returned a created Task, the renderer navigated
  to the detail route before `collections.tasks` had the row. The page then
  showed the API fallback with `Syncing local task data` for several seconds.

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
  - Trellis planning / task creation -> Superset status type `unstarted`
  - Trellis `after_start` / `in_progress` -> Superset status type `started`
  - Trellis `after_archive` / `completed` -> Superset status type `completed`
- Do not treat Trellis `finish` as done; `finish` only clears active context.
- Hook failures must not block Trellis or Agent work.
- Avoid requiring a globally installed `superset` command when the desktop app
  can provide or bundle the CLI.
- Avoid requiring users to run `superset auth login` separately after logging
  in to the desktop app. Desktop login/session recovery should maintain the
  CLI-compatible `${SUPERSET_HOME_DIR}/config.json` auth shape.
- The Superset Task link must survive Trellis/Agent rewriting an individual
  `task.json`. A repo/workspace-level link file should be considered canonical
  fallback data, not only `task.json.meta.supersetTaskId`.
- The UI should not expose low-level hook details unless setup fails or needs
  user action.
- Creating a Task from the desktop Tasks page should route to an immediately
  editable Task detail page. It should not make users wait for Electric local
  sync when the create API has already returned the full Task row.

### Technical Requirements

- Add or inject a repo-local hook script, for example
  `.trellis/scripts/hooks/superset_task_sync.py`.
- The hook should read `TASK_JSON_PATH`, parse `task.json`, and prefer
  `meta.supersetTaskId` when present.
- The hook should also read a durable workspace link file, for example
  `.trellis/superset/task-link.json`, so status sync still works when
  Trellis/Agent rewrites `task.json.meta`.
- The hook should resolve status ids by querying Superset status list and
  selecting by status `type`, not hard-coded UUIDs or localized names.
- The hook should update the Superset Task through the bundled/local Superset
  CLI, with auth resolved from desktop-maintained
  `${SUPERSET_HOME_DIR}/config.json`.
- The hook should degrade cleanly when:
  - no linked Superset Task id exists
  - auth/session/API is unavailable
  - the machine is offline
  - status type cannot be resolved
- Workspace creation / task launch should create or link a Trellis task artifact
  only when it can do so conservatively without overwriting existing Trellis
  files.
- Existing projects with Trellis must not have their custom hooks overwritten.
  Hook installation should merge config or skip with a warning.
- After `task.create` succeeds in the desktop renderer, seed the returned
  `SelectTask` row into `collections.tasks` through the collection sync channel
  before navigating. Do not call `collections.tasks.insert`, because the cloud
  create has already happened.

## Acceptance Criteria

- [ ] Launching a Superset Task into a guided Code Workspace records the
      Superset Task id in both durable workspace-level link data and the
      associated Trellis task metadata when possible.
- [ ] If Trellis/Agent rewrites `task.json.meta`, lifecycle hooks can still
      resolve the linked Superset Task from workspace-level link data.
- [ ] Creating/planning the linked Trellis task updates the Superset Task to the
      organization's `unstarted` / Todo status.
- [ ] Starting the linked Trellis task updates the Superset Task to the
      organization's `started` / In Progress status.
- [ ] Archiving the linked Trellis task updates the Superset Task to the
      organization's `completed` / Done status.
- [ ] Running Trellis `finish` does not mark the Superset Task complete.
- [ ] CLI `Not logged in` no longer blocks normal desktop-launched Agent/Trellis
      status sync.
- [ ] Missing link/auth/offline failures produce a warning/log but do not
      fail the Trellis lifecycle command.
- [ ] Status ids are resolved dynamically from Superset statuses by `type`.
- [ ] Existing `.trellis/config.yaml` hooks are preserved when adding the sync
      hook.
- [ ] Focused tests cover status mapping, durable link fallback, missing
      metadata, missing bridge/auth, and config merge behavior.
- [ ] Desktop acceptance covers a Task-opened workspace and verifies the Task
      status changes after the Trellis lifecycle hook path runs.
- [ ] Creating a Task in the desktop Tasks page lands on the detail route
      without `Syncing local task data` or `Editing unlocks after local sync
      finishes.` appearing in the rendered page.

## Out of Scope

- Full bidirectional Superset Task <-> Trellis task sync.
- Importing every existing `.trellis/tasks/*` record into Superset.
- Creating Superset Tasks from arbitrary Trellis tasks.
- Syncing descriptions, PRD contents, assignees, labels, priority, or comments.
- Blocking Agent execution on cloud status update success.

## Open Questions

- None blocking. Decision recorded: this is a completion bug in the original
  Trellis -> Superset Task status sync requirement, not a new product feature.
  The fix must keep terminal secrets stripped while making desktop and CLI read
  the same `${SUPERSET_HOME_DIR}/config.json` auth source.

## Notes

- This is a follow-up to
  `.trellis/tasks/archive/2026-06/06-01-code-workspace-trellis-initialization`.
