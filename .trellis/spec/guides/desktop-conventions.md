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
