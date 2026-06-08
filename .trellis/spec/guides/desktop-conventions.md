# Desktop Conventions

## Process Boundaries

Desktop has three distinct runtimes:

- Electron main: `apps/desktop/src/main` owns app lifecycle, windows, tray, host-service coordination, terminal-host subprocesses, native permissions, and local SQLite access.
- Preload: `apps/desktop/src/preload/index.ts` exposes the safe IPC surface.
- Renderer: `apps/desktop/src/renderer` is browser-compatible React and must not import Node builtins.

Host-service is a separate Hono/tRPC runtime in `packages/host-service`. It must remain independently deployable and Electron-free; `packages/host-service/src/no-electron-coupling.test.ts` is the source-level guard.

## Renderer Organization

Desktop uses TanStack Router with route modules under `apps/desktop/src/renderer/routes`. Route-owned components, hooks, state, and utils stay below their route. Examples:

- `routes/_authenticated/_dashboard/tasks/components/TasksView/TasksView.tsx`
- `routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/usePaneRegistry.tsx`
- `routes/_authenticated/_dashboard/v2-workspace/$workspaceId/state/fileDocumentStore/fileDocumentStore.ts`
- `routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useDashboardSidebarData/useDashboardSidebarData.ts`

Shared renderer components live under `renderer/components`; shared hooks under `renderer/hooks`; shared libraries under `renderer/lib`; persistent zustand stores under `renderer/stores`.

## Data And V2 Workspace Rules

`CollectionsProvider` creates per-organization TanStack DB/Electric collections. `v2` workspace UI should read from those collections and host-service clients, not from cloud tRPC queries for render data. Use cloud tRPC for mutations or API-only workflows through `renderer/lib/api-trpc-client.ts`.

Sidebar and workspace state combines cloud rows and local rows. `useDashboardSidebarData.ts` joins `v2Projects`, `v2Workspaces`, `v2WorkspaceLocalState`, `v2SidebarProjects`, `v2SidebarSections`, host presence, pull requests, and pending workspace transactions. Preserve that split when adding sidebar fields.

Workspace type has product meaning. `v2Workspaces.type === "main"` is pinned and cannot be deleted through normal workspace delete; `DashboardSidebarWorkspaceItem.tsx` uses it to choose context-menu behavior.

Task status display uses status rows, not hard-coded labels. `StatusIcon.tsx`, `StatusMenuItems.tsx`, `StatusProperty.tsx`, `useTasksData.tsx`, and `sorting.ts` rely on `taskStatuses.type`, `color`, `position`, and `progressPercent`.

## Task Create Local Sync

### 1. Scope / Trigger

- Trigger: a desktop renderer flow creates a cloud Task through
  `apiTrpcClient.task.create` and immediately routes to a collection-backed
  Task surface.
- Goal: the user should land on an editable Task detail page immediately, not
  a read-only "Syncing local task data" fallback while Electric catches up.

### 2. Signatures

- API mutation: `apiTrpcClient.task.create.mutate(input)` returns
  `{ task: SelectTask, txid: number }`.
- Renderer local sync helper:
  `collections.tasks.utils.upsertSyncedRow(task: SelectTask): boolean`.
- Task collection utility source:
  `withSyncedRowUpsertFor<SelectTask>()` in
  `apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/collections.ts`.

### 3. Contracts

- Cloud tRPC remains the canonical write path for creating Tasks.
- After `task.create` returns a `task`, the renderer must write that exact row
  into `collections.tasks` through the collection sync channel before routing
  to `/tasks/$taskId`.
- The local write must use sync `update` semantics, not
  `collections.tasks.insert`, so it behaves as an upsert and does not invoke a
  second cloud create mutation.
- The helper should call `startSyncImmediate()` before upserting when the flow
  is about to navigate into a collection-backed detail route.
- If the local upsert helper returns `false`, the existing API fallback may
  render, but successful normal creation should not depend on waiting for
  Electric shape delivery.

### 4. Validation & Error Matrix

- `task.create` returns no `task` -> throw and keep the dialog open with an
  error toast.
- Sync controls are not ready -> `upsertSyncedRow` returns `false`; route may
  fall back to API read-only data.
- Sync write throws -> warn to console and return `false`; do not fail the
  already-successful cloud create.
- Electric later emits the same row -> normal collection reconciliation updates
  the synced row without duplicating the Task.

### 5. Good/Base/Bad Cases

- Good: create Task, local upsert succeeds, detail route immediately renders
  `EditableTitle`, properties, and workspace actions.
- Base: local upsert is unavailable, detail route renders the API fallback
  until Electric sync arrives.
- Bad: create Task, navigate immediately, and show
  `Syncing local task data` for seconds even though the API returned the row.
- Bad: use `collections.tasks.insert` after `task.create`, causing a second
  persistence mutation or duplicate write semantics.

### 6. Tests Required

- Source regression: `CreateTaskDialog` calls
  `collections.tasks.startSyncImmediate()` and
  `collections.tasks.utils.upsertSyncedRow(result.task)` before `navigate`.
- Collection regression: `collections.tasks` is wrapped with
  `withSyncedRowUpsertFor<SelectTask>()`, uses sync `update`, and has no
  `onInsert`.
- Desktop Automation smoke: create a real Task, wait for `#/tasks/<id>`, and
  assert the page does not contain `Syncing local task data` or
  `Editing unlocks after local sync finishes.`

### 7. Wrong vs Correct

#### Wrong

```typescript
const result = await apiTrpcClient.task.create.mutate(input);
navigate({ to: "/tasks/$taskId", params: { taskId: result.task.id } });
```

#### Correct

```typescript
const result = await apiTrpcClient.task.create.mutate(input);
collections.tasks.startSyncImmediate();
collections.tasks.utils.upsertSyncedRow(result.task);
navigate({ to: "/tasks/$taskId", params: { taskId: result.task.id } });
```

## Host-Service Local State

Host-service owns per-machine local project/workspace state. Electron starts one host-service process per organization through `HostServiceCoordinator`, and the child receives:

- `HOST_MANIFEST_DIR=${SUPERSET_HOME_DIR}/host/<organizationId>`
- `HOST_DB_PATH=${SUPERSET_HOME_DIR}/host/<organizationId>/host.db`
- `HOST_MIGRATIONS_FOLDER=packages/host-service/drizzle` in development
- `AUTH_TOKEN` and `SUPERSET_API_URL` from the authenticated desktop session

Cloud V2 rows are not enough for a fully usable local workspace. Local operations such as workspace panes, filesystem/git status, terminal setup, chat context, and code workspace creation rely on host-service `projects` and `workspaces` rows in `host.db`. When manually seeding local dev state, keep cloud rows and host-service SQLite rows aligned:

- Cloud: `v2Users`, organization membership, `v2Hosts`, `v2UsersHosts`, `v2Projects`, and `v2Workspaces`.
- Local host DB: matching `projects` row plus matching `workspaces` row for the workspace id/project id/path/branch.

Do not treat a visible V2 workspace row in Electric/TanStack DB as proof that the local host runtime can open it. Desktop acceptance for workspace usability should include at least one host-service-backed assertion, such as workspace route load, chat pane availability, git/filesystem data, or terminal/session startup.

## Code Workspace Trellis Setup

### 1. Scope / Trigger

Create Workspace may initialize repository-local Trellis workflow files for Code
workspaces. This is a cross-layer desktop contract because renderer UI collects
intent while host-service owns filesystem probing and mutation.

### 2. Signatures

- Renderer draft field: `NewWorkspaceDraft.trellisInitialize: boolean`.
- Host-service query:
  `workspaceCreation.getTrellisStatus({ projectId: string })`.
- Host-service mutation extension:
  `workspaces.create({ ..., trellisSetup?: { initialize?: boolean } })`.
- Create result extension:
  `trellisSetup?: { state, hasTrellis, configPath, version, message, initialized, warning }`.
- Task bridge helper:
  `applySupersetTaskTrellisBridge({ worktreePath, trellisSetup, supersetTask, workspaceId, branch })`.
- Repo-local hook path:
  `.trellis/scripts/hooks/superset_task_sync.py`.
- Repo-local task metadata:
  `task.json.meta.supersetTaskId`, plus optional `supersetTaskSlug` and
  `supersetWorkspaceId`.
- Durable repo-local task link:
  `.trellis/superset/task-link.json`, containing `supersetTaskId`,
  optional `supersetTaskSlug`, `supersetWorkspaceId`, `branch`,
  `taskJsonPath`, and `updatedAt`.

### 3. Contracts

- Renderer may show Trellis state but must not inspect local files directly.
- Host-service must probe `.trellis/` at the local project or final worktree
  path.
- Trellis init must use the repo-local `@mindfoldhq/trellis` dependency, not a
  global `trellis` binary.
- Host-service must execute the repo-local Trellis bin script with a real
  JavaScript runtime (`bun` preferred, `node` fallback). Do not use
  `process.execPath` blindly from Electron child processes: in desktop dev and
  packaged-like runs it can point at `Electron.app/Contents/MacOS/Electron`,
  which cannot run `bin/trellis.js` as a Node CLI entrypoint.
- Trellis platform adapter flags must come from the selected Task/Workspace
  Agent preset. `claude` maps only to `--claude`, `codex` maps only to
  `--codex`, and so on. Do not hard-code multiple default platform flags or
  run bare `trellis init` for a missing platform selection, because the Trellis
  CLI may choose its own platform default.
- User-facing desktop copy should describe this as a guided workflow or
  planning/review best-practice option. Keep `Trellis` as the implementation
  name in code/specs, not the primary UI concept.
- Superset `Task` remains the user-facing task object. When a guided Code
  Workspace is created from a Superset Task, host-service may create one
  repository-local Trellis mirror task and link it through
  `task.json.meta.supersetTaskId`; arbitrary Trellis tasks are not imported
  into Superset. Because Agents may rewrite Trellis task metadata, host-service
  must also write `.trellis/superset/task-link.json` as the durable fallback
  link. If a matching existing Trellis task can be identified by slug/title but
  has missing metadata, repair that task instead of creating a duplicate mirror.
- Guided Task workspaces install a conservative Trellis lifecycle hook that
  preserves existing `.trellis/config.yaml` hooks and appends only:
  `after_create -> superset_task_sync.py after_create`,
  `after_start -> superset_task_sync.py after_start` and
  `after_archive -> superset_task_sync.py after_archive`.
- Trellis lifecycle status sync resolves Superset status ids dynamically by
  status `type`, never by hard-coded UUID or localized name:
  `after_create` maps to `unstarted`, `after_start` maps to `started`;
  `after_archive` maps to `completed`; `after_finish` is a no-op.
- The sync hook should find the bundled/user Superset CLI through
  `SUPERSET_CLI_PATH`, `${SUPERSET_HOME_DIR}/bin/superset`, or `PATH`. Missing
  CLI, auth failure, offline API, missing metadata/link data, or missing status
  type must warn and exit 0 so Trellis/Agent work is not blocked.
- Desktop login/session recovery must keep
  `${SUPERSET_HOME_DIR}/config.json` in the CLI-compatible auth shape so
  desktop-launched hooks can authenticate without receiving `AUTH_TOKEN` in
  terminal environment variables. Sign-out clears the shared auth entry.
- The `v2Workspaces` collection create path must treat the host-service
  `workspaces.create` result as the write barrier. Do not wait on
  `electricTxidMatch(result.txid)` for workspace creation inserts: host-service
  registers the cloud row first, then may run local setup such as repository
  workflow initialization, terminal setup, or agent launch. By the time the
  result returns, the cloud txid can be stale enough for Electric confirmation
  to time out even though creation succeeded.
- `useWorkspaceCreates` must preserve successful host-service results across
  `transaction.isPersisted` rejection. If `WorkspaceCreateMutationMetadata.result`
  exists, write the pane layout and return an ok outcome; only create a
  `failedWorkspaceCreates` row when no host-service result exists.

### 4. Validation & Error Matrix

- No `.trellis/` -> state `missing`; UI may offer initialization.
- `.trellis/config.yaml` and `.trellis/tasks` exist -> state `ready`; never
  reinitialize.
- Partial `.trellis/` -> state `partial`; do not overwrite, return a warning if
  init was requested.
- CLI/init failure -> workspace creation succeeds and `trellisSetup.warning`
  explains the failure.
- Electron is used as the Trellis runtime -> reject that runtime selection and
  resolve `bun`/`node`; otherwise Trellis may report
  `unknown command .../bin/trellis.js`.
- No supported Agent platform is selected while guided workflow setup is
  requested -> do not run Trellis init; return a warning and let workspace
  creation continue.
- Guided setup ready + linked `taskId` -> create or reuse one Trellis task with
  `meta.supersetTaskId`, write `.trellis/superset/task-link.json`, and preserve
  existing active tasks and custom hooks.
- Hook cannot find `TASK_JSON_PATH`, linked metadata or durable link data, CLI,
  auth, API, or target status type -> print a concise warning where useful and
  exit 0.
- Trellis `after_finish` -> no Superset status update.
- Electric txid confirmation timeout after host-service returned a create result
  -> workspace creation is considered successful; do not render
  `WorkspaceCreateErrorState`.

### 5. Good/Base/Bad Cases

- Good: user opts in on a missing repo, host-service initializes Trellis after
  resolving the final worktree path, links the Superset Task in Trellis
  metadata, and installs status sync hooks.
- Base: repo already has Trellis, UI shows detected/ready state and create
  proceeds unchanged except for conservative hook/link installation when a
  Superset Task launched the workspace.
- Bad: renderer shells out to Trellis or a create flow overwrites existing
  `.trellis/spec`, `.trellis/tasks`, or `.trellis/workspace`.
- Bad: hook marks a Task completed on Trellis `finish`; completion maps only
  from `after_archive`.

### 6. Tests Required

- Host-service tests for missing, ready, partial, init success, and init failure.
- Host-service runtime tests that `Electron.app/Contents/MacOS/Electron` is not
  treated as a valid runtime for Trellis bin scripts.
- Host-service tests that Trellis platform flags are derived from exact Agent
  presets and that missing/unsupported Agent selections do not run bare init.
- Host-service tests that linked task metadata is written once and reused.
- Host-service tests that `.trellis/superset/task-link.json` is written and that
  the hook falls back to it when `task.json.meta` is missing.
- Host-service tests for hook config merge preserving existing hook entries.
- Hook execution tests for no `TASK_JSON_PATH`, no `meta.supersetTaskId`,
  create -> `unstarted`, start -> `started`, archive -> `completed`,
  finish/no-op, missing CLI/auth, and missing target status type.
- Source-level host-service test that `workspaces.create` applies the bridge for
  linked Superset Tasks.
- Renderer wiring test that `trellisInitialize` becomes
  `trellisSetup: { initialize: true }`.
- Collection/source tests that `v2Workspaces.onInsert` stores
  `metadata.result` and does not return `electricTxidMatch(result.txid)`.
- Store/source tests that `useWorkspaceCreates` returns success when
  `metadata.result` exists even if sync confirmation rejects.
- Desktop Automation smoke that opens Create Workspace and waits for Trellis
  status text.

### 7. Wrong vs Correct

#### Wrong

Build a separate right-sidebar Trellis board or silently run `trellis init` from
the renderer when a workspace opens.

Overwrite a user's existing `.trellis/config.yaml` hooks or hard-code a
Superset task status UUID in the injected hook.

Return `electricTxidMatch(result.txid)` from `v2Workspaces.onInsert` for
workspace creation. This can turn a successful create into
`Timeout waiting for txId` after slow local setup.

Run `bin/trellis.js` with Electron's `process.execPath`.

#### Correct

Keep Create Workspace as the product flow: renderer captures intent, host-service
performs conservative Trellis setup, and future Trellis requirements can be
bridged into the existing Superset Task board.

Install a repo-local hook only after Trellis is ready, link only the Superset
Task that launched the workspace through `meta.supersetTaskId`, dynamically
resolve status ids by type, and let hook failures warn without blocking.

Store the host-service result on mutation metadata, let Electric catch up
normally, and treat a completed host-service result as successful even when the
sync confirmation promise rejects.

Resolve a real JS runtime first, then execute the repo-local Trellis bin:
`bun <repo>/node_modules/.bin/trellis init --yes --skip-existing --codex` when
the selected Agent preset is Codex, or the matching single platform flag for the
selected supported Agent.

## Terminal Boundaries

Terminal persistence and PTY ownership are split:

- `packages/pty-daemon` owns long-lived PTYs, wire protocol, binary payload framing, handoff, and replay buffer.
- `packages/host-service/src/terminal` is the daemon client and host route layer.
- `apps/desktop/src/main/lib/terminal` and `apps/desktop/src/main/terminal-host` contain Electron main/legacy terminal-host integration.
- Renderer terminal code under `renderer/lib/terminal` and v2 workspace pane hooks consumes host-service/websocket APIs.

Do not reintroduce base64 or UTF-8 string hops for PTY bytes. `packages/pty-daemon/src/protocol/messages.ts` states that PTY input/output bytes live in the frame binary tail.

## IPC And Subscriptions

Electron IPC should go through `apps/desktop/src/lib/trpc` and renderer `electronTrpc`. `trpc-electron` subscriptions must use `observable(...)`, not async generators.

## Tests

Desktop has many small Bun tests beside the code they protect. Keep regression tests focused on the behavior or wiring that broke, for example `TasksView.test.ts` source-checks selection wiring, while terminal tests such as `terminal-key-event-handler.test.ts` cover pure utilities. Prefer testing pure utilities and derived state over mounting large desktop surfaces.

For user-visible desktop flows that cross Electron startup, preload IPC, auth token persistence, V2 routing, host-service, terminal, or multi-pane runtime behavior, follow `desktop-acceptance-tdd.md`: define the real desktop acceptance path during planning, add lower-level checks where cheap, then use Desktop Automation CLI for deterministic real app assertions and screenshot/report artifacts.
