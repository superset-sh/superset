# Trellis Superset Task Status Sync Design

## Architecture

Superset Task remains the canonical product task. Trellis task state is a
repository-local signal that can drive Superset status updates for the one Task
that launched the Code Workspace.

The bridge should have three pieces:

- Workspace/task launch linking: write `supersetTaskId` into both a durable
  repo/workspace-level link file and a Trellis task artifact when a Superset
  Task starts a guided Code Workspace.
- Repository-local hook script: run from Trellis lifecycle hooks with
  `TASK_JSON_PATH`.
- Superset update bridge: call the bundled/local Superset CLI. Desktop login
  maintains the CLI-compatible `${SUPERSET_HOME_DIR}/config.json` auth source,
  so hooks do not need leaked auth environment variables.

## Data Flow

1. User opens/runs a Superset Task in a Code Workspace.
2. Workspace creation ensures Trellis is present.
3. Superset automatically creates or links one Trellis task record for this
   launched Task.
   - If a matching Trellis task already exists by slug/title but its
     `meta.supersetTaskId` was rewritten or removed, repair that task metadata
     instead of creating a duplicate mirror task.
4. The workspace-level link file stores:
   - `supersetTaskId`
   - optional `supersetTaskSlug`
   - `supersetWorkspaceId`
   - optional `branch`
   - optional `taskJsonPath`
   - `updatedAt`
5. The Trellis task record also stores, best-effort:
   - `meta.supersetTaskId`
   - optional `meta.supersetTaskSlug`
   - optional `meta.supersetWorkspaceId`
6. `task.py create` or mirror creation triggers/plans a Todo sync where
   available.
7. `task.py start` triggers `hooks.after_start`.
8. Hook reads `TASK_JSON_PATH`, falls back to workspace-level link data if
   metadata is missing, resolves the bundled/user Superset CLI, and updates the
   Superset Task to status type `started`.
9. `task.py archive` triggers `hooks.after_archive`.
10. Hook resolves the link the same way and asks host-service to update the
    Superset Task to status type `completed`.

## Desktop Task Create Local Hydration

The desktop Tasks page creates Tasks through cloud tRPC because the API owns
organization scoping, slug generation, default statuses, and write validation.
That API response already contains the canonical `SelectTask` row, so the
renderer should not wait for Electric to rediscover the same row before opening
the detail page.

`CollectionsProvider` wraps the `tasks` collection with
`withSyncedRowUpsertFor<SelectTask>()`. The wrapper captures TanStack DB sync
`begin/write/commit` controls and exposes
`collections.tasks.utils.upsertSyncedRow(task)`. The helper writes the API
result as a sync `update`, which behaves as an upsert against the collection's
synced data and avoids `collections.tasks.insert` semantics.

Create flow order:

1. `apiTrpcClient.task.create.mutate(...)` succeeds.
2. `collections.tasks.startSyncImmediate()` ensures the collection sync layer
   is initialized when possible.
3. `collections.tasks.utils.upsertSyncedRow(result.task)` writes the returned
   row locally.
4. The router navigates to `/tasks/$taskId`.

If the local upsert returns `false`, creation still succeeded and the existing
API fallback can render while Electric catches up. Normal desktop creation
should hit the upsert path and should not show the syncing fallback.

## Status Mapping

| Trellis event | Trellis status | Superset status type |
| --- | --- | --- |
| `after_create` / mirror planning | `planning` | `unstarted` |
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

## Authenticated Update Strategy

Do not rely on users separately running `superset auth login` inside
Agent/Trellis terminals for normal desktop product behavior. The desktop app
owns the current login, while the CLI already has a stable auth contract:
`${SUPERSET_HOME_DIR}/config.json`.

Desktop should still keep its encrypted token storage for app hydration, but
login, session recovery, organization switching, and sign-out must also maintain
the CLI-compatible config file:

```json
{
  "auth": {
    "accessToken": "<desktop session token>",
    "expiresAt": 1780920000000
  },
  "organizationId": "<active organization id>"
}
```

Terminal env stripping deliberately removes `AUTH_TOKEN`, `HOST_*`, and most
`SUPERSET_*` runtime secrets before launching Agent shells, but preserves
`SUPERSET_HOME_DIR`. The hook can therefore use the bundled/user Superset CLI,
which reads the same home-dir config as desktop, without leaking secrets through
environment variables.

Failures should print a concise warning to stderr and exit 0 unless explicitly
run in strict/manual mode.

## Durable Link Strategy

`task.json.meta.supersetTaskId` is useful, but it is not durable enough as the
only link because Trellis or an Agent may rewrite task metadata while creating
or starting work. The bridge should therefore also write a repo-local file such
as `.trellis/superset/task-link.json`.

The hook resolution order should be:

1. `task.json.meta.supersetTaskId`
2. `.trellis/superset/task-link.json`

When a Trellis task exists and lacks `meta.supersetTaskId`, host-service can
repair the metadata best-effort, but status sync must not depend on that repair
having happened.

## Compatibility

- Existing Trellis projects without linked Superset Task metadata are no-ops.
- Existing custom hooks are preserved.
- Existing workspace creation behavior still succeeds if sync hook installation
  fails.
- No cloud database schema change is required for the MVP if durable bridge
  metadata lives in repo-local `.trellis/superset/task-link.json`.

## Risks

- Auth source: desktop must keep `${SUPERSET_HOME_DIR}/config.json` in sync with
  the current session and active organization.
- Secret exposure: do not fix CLI auth by leaking desktop auth tokens into
  terminal/Agent environment variables.
- CLI path: Agent terminals may not have global `superset`.
- Status mapping: organizations may customize statuses and remove `started` or
  `completed` type rows.
- Lifecycle semantics: Trellis `finish` is easy to misread as completion; keep
  it a no-op.
- Link durability: if `task.json.meta` is rewritten, workspace-level link data
  must keep status sync alive.
