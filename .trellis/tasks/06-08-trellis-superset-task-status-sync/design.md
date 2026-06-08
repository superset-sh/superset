# Trellis Superset Task Status Sync Design

## Architecture

Superset Task remains the canonical product task. Trellis task state is a
repository-local signal that can drive Superset status updates for the one Task
that launched the Code Workspace.

The bridge should have three pieces:

- Workspace/task launch linking: write `supersetTaskId` into a Trellis
  task artifact when a Superset Task starts a guided Code Workspace.
- Repository-local hook script: run from Trellis lifecycle hooks with
  `TASK_JSON_PATH`.
- Superset update client: use existing CLI/API capability to update the cloud
  Task status.

## Data Flow

1. User opens/runs a Superset Task in a Code Workspace.
2. Workspace creation ensures Trellis is present.
3. Superset automatically creates or links one Trellis task record for this
   launched Task.
4. The Trellis task record stores:
   - `meta.supersetTaskId`
   - optional `meta.supersetTaskSlug`
   - optional `meta.supersetWorkspaceId`
5. `task.py start` triggers `hooks.after_start`.
6. Hook reads `TASK_JSON_PATH`, resolves Superset status type `started`, and
   updates the Superset Task status.
7. `task.py archive` triggers `hooks.after_archive`.
8. Hook resolves Superset status type `completed` and updates the Superset Task.

## Status Mapping

| Trellis event | Trellis status | Superset status type |
| --- | --- | --- |
| `after_start` | `in_progress` | `started` |
| `after_archive` | `completed` | `completed` |
| `after_finish` | unchanged | no-op |

The bridge should resolve status ids dynamically because status ids are
organization-scoped and may differ across machines/orgs.

## Hook Installation

Hook installation should be conservative:

- Preserve existing `.trellis/config.yaml` content.
- Append the Superset sync hook if it is not already present.
- Do not remove or reorder user hooks.
- Return warnings rather than failing workspace creation when merge/write fails.

## CLI/API Strategy

Prefer a repo/desktop-provided Superset CLI command when available. Avoid relying
on global install state as the only path.

The hook can be Python for easy `TASK_JSON_PATH` handling and config parsing. It
should shell out to a Superset command or bridge with structured JSON output.
Failures should print a concise warning to stderr and exit 0 unless explicitly
run in strict/manual mode.

## Compatibility

- Existing Trellis projects without linked Superset Task metadata are no-ops.
- Existing custom hooks are preserved.
- Existing workspace creation behavior still succeeds if sync hook installation
  fails.
- No database schema change is required for the MVP if metadata lives in
  Trellis `task.json`.

## Risks

- Auth source: CLI may not have auth in the spawned Agent environment.
- CLI path: Agent terminals may not have global `superset`.
- Status mapping: organizations may customize statuses and remove `started` or
  `completed` type rows.
- Lifecycle semantics: Trellis `finish` is easy to misread as completion; keep
  it a no-op.
