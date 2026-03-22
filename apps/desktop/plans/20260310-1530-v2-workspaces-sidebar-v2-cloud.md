# V2 Workspaces Sidebar behind `V2_CLOUD`

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` should be updated as implementation proceeds.

Reference ticket: `SUPER-362`


## Purpose / Big Picture

Build a new desktop sidebar implementation that reads projects, workspaces, devices, and presence from Electric SQL-backed V2 collections instead of the local SQLite/Electron `workspaces.getAllGrouped` path.

When `V2_CLOUD` is enabled:

1. render `V2WorkspaceSidebar`
2. stop depending on the old local sidebar data source for the sidebar itself
3. preserve core sidebar UX parity where feasible:
   - project sections
   - named workspace groups
   - drag-to-reorder
   - context menus
   - collapse/expand
   - keyboard shortcuts

When `V2_CLOUD` is disabled:

1. keep the existing `WorkspaceSidebar` untouched
2. keep all current Electron/local-db behavior unchanged


## Current State

Today the desktop sidebar is driven by local Electron IPC and local SQLite:

- [layout.tsx](/Users/avipeltz/.superset/worktrees/superset/can-you-review-this-linear-ticket-fully-and-make-a/linear.app/superset-sh/issue/super-362/v2-workspa/apps/desktop/src/renderer/routes/_authenticated/_dashboard/layout.tsx#L24) always renders `WorkspaceSidebar`
- [WorkspaceSidebar.tsx](/Users/avipeltz/.superset/worktrees/superset/can-you-review-this-linear-ticket-fully-and-make-a/linear.app/superset-sh/issue/super-362/v2-workspa/apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/WorkspaceSidebar.tsx#L18) pulls grouped sidebar data from `useWorkspaceShortcuts()`
- [useWorkspaceShortcuts.ts](/Users/avipeltz/.superset/worktrees/superset/can-you-review-this-linear-ticket-fully-and-make-a/linear.app/superset-sh/issue/super-362/v2-workspa/apps/desktop/src/renderer/hooks/useWorkspaceShortcuts.ts#L13) reads `electronTrpc.workspaces.getAllGrouped`
- [workspace/page.tsx](/Users/avipeltz/.superset/worktrees/superset/can-you-review-this-linear-ticket-fully-and-make-a/linear.app/superset-sh/issue/super-362/v2-workspa/apps/desktop/src/renderer/routes/_authenticated/_dashboard/workspace/page.tsx#L18) redirects based on old local workspace data

Electric collections already exist in the authenticated desktop shell:

- [collections.ts](/Users/avipeltz/.superset/worktrees/superset/can-you-review-this-linear-ticket-fully-and-make-a/linear.app/superset-sh/issue/super-362/v2-workspa/apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/collections.ts#L49)

Cloud mutations already have a clean renderer-to-API path:

- [api-trpc-client.ts](/Users/avipeltz/.superset/worktrees/superset/can-you-review-this-linear-ticket-fully-and-make-a/linear.app/superset-sh/issue/super-362/v2-workspa/apps/desktop/src/renderer/lib/api-trpc-client.ts#L12)
- [root.ts](/Users/avipeltz/.superset/worktrees/superset/can-you-review-this-linear-ticket-fully-and-make-a/linear.app/superset-sh/issue/super-362/v2-workspa/packages/trpc/src/root.ts#L18)

The `V2_CLOUD` flag constant already exists:

- [constants.ts](/Users/avipeltz/.superset/worktrees/superset/can-you-review-this-linear-ticket-fully-and-make-a/linear.app/superset-sh/issue/super-362/v2-workspa/packages/shared/src/constants.ts#L51)


## Key Constraints

1. Do not modify the existing sidebar behavior when `V2_CLOUD` is off.
2. Do not manually edit generated migration files under `packages/db/drizzle/`.
3. Prefer shared cloud API routers in `packages/trpc` over new desktop-only IPC for V2 create/rename/delete flows.
4. Keep V2 sidebar code isolated in a sibling `V2WorkspaceSidebar/` tree.
5. Treat local sidebar layout preferences as device-local state, not synced Electric state.


## Assumptions

1. SUPER-363 either lands first or this ticket will include the missing `v2_*` schema foundation.
2. Renderer code can use Electric collections for reads and `apiTrpcClient` for writes.
3. Existing device identity from `electronTrpc.auth.getDeviceInfo()` is sufficient for seeding `v2_devices`.
4. The first implementation can ship a stub V2 creation modal without final cloud provisioning behavior.


## Open Questions

1. What should happen when a user clicks a V2 workspace while `V2_CLOUD` is on?
   Decision needed because the ticket wants sidebar UX parity, but opening/connecting to V2 workspaces is out of scope.
2. What should the footer action do while `V2_CLOUD` is on?
   The current footer still opens/imports local repositories and creates old local workspaces.
3. Should `PortsList` remain visible in V2 mode?
   It currently depends on old local workspace IDs via [usePortsData.ts](/Users/avipeltz/.superset/worktrees/superset/can-you-review-this-linear-ticket-fully-and-make-a/linear.app/superset-sh/issue/super-362/v2-workspa/apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/PortsList/hooks/usePortsData.ts#L13).
4. Are all V2 schema tables already defined elsewhere, or must this ticket add the entire `v2_*` table family?


## Progress

- [x] (2026-03-10 22:40Z) Review ticket against current desktop sidebar, Electric collections, and shared cloud routers
- [x] (2026-03-10 23:25Z) Draft explicit ExecPlan with concrete implementation checklist
- [x] (2026-03-10 23:55Z) Add `v2_projects` schema, relations, and Electric allowlisting
- [x] (2026-03-11 00:05Z) Add shared `projectsV2` tRPC router and mount it in API root
- [x] (2026-03-11 00:10Z) Add initial `v2Projects` Electric collection to desktop `CollectionsProvider`
- [x] (2026-03-11 00:25Z) Add inferred V2 device/workspace schema tables and generate Drizzle migration `0027_v2_projects_and_sidebar.sql`
- [x] (2026-03-11 00:30Z) Add shared `workspacesV2` tRPC router and mount it in API root
- [x] (2026-03-11 00:40Z) Add remaining V2 Electric collections to desktop `CollectionsProvider`
- [x] (2026-03-11 00:50Z) Scaffold `V2WorkspaceSidebar` with typed Electric-backed data hook, without wiring the feature flag yet
- [ ] Confirm dependency status for `v2_*` schema work from SUPER-363
- [ ] Resolve click/open behavior for V2 workspace rows
- [ ] Implement schema and API foundations
- [ ] Implement Electric collections and local meta stores
- [ ] Implement `V2WorkspaceSidebar` and flag switch
- [ ] Run verification checklist


## Surprises & Discoveries

- `V2_CLOUD` is already defined in shared constants, so the remaining flag work is renderer wiring only.
- The current sidebar is not just a visual component swap; keyboard shortcuts, default workspace redirect, ports, footer actions, and row behavior all assume the old local Electron workspace model.
- Existing cloud routers in `packages/trpc` are the correct home for `projectsV2` and `workspacesV2`; adding those to desktop IPC would create an unnecessary second mutation path.
- Current device presence uses `desktop/mobile/web`, while the ticket’s V2 device model expects `host/cloud/viewer`. The same device identity can likely be reused, but not the old enum directly.


## Decision Log

### DL-1 API placement for V2 mutations

Decision: implement `projectsV2` and `workspacesV2` in `packages/trpc`, exposed through the API server, and call them from the desktop renderer with `apiTrpcClient`.

Reason:

1. V2 data is cloud/Electric-backed, not local Electron-only state.
2. The renderer already has an authenticated API client.
3. This avoids coupling cloud state mutations to desktop-only IPC.


### DL-2 Sidebar storage split

Decision: keep V2 shared data in Electric collections and keep section/order/collapse preferences in device-local renderer storage.

Reason:

1. The ticket explicitly says these preferences are not synced.
2. Local meta is a join layer, not a persistence concern for Postgres.
3. This isolates personal layout state from shared V2 workspace state.


## Context and Orientation

Relevant existing files:

- [layout.tsx](/Users/avipeltz/.superset/worktrees/superset/can-you-review-this-linear-ticket-fully-and-make-a/linear.app/superset-sh/issue/super-362/v2-workspa/apps/desktop/src/renderer/routes/_authenticated/_dashboard/layout.tsx)
- [WorkspaceSidebar.tsx](/Users/avipeltz/.superset/worktrees/superset/can-you-review-this-linear-ticket-fully-and-make-a/linear.app/superset-sh/issue/super-362/v2-workspa/apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/WorkspaceSidebar.tsx)
- [WorkspaceSidebarFooter.tsx](/Users/avipeltz/.superset/worktrees/superset/can-you-review-this-linear-ticket-fully-and-make-a/linear.app/superset-sh/issue/super-362/v2-workspa/apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/WorkspaceSidebarFooter.tsx)
- [WorkspaceListItem.tsx](/Users/avipeltz/.superset/worktrees/superset/can-you-review-this-linear-ticket-fully-and-make-a/linear.app/superset-sh/issue/super-362/v2-workspa/apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/WorkspaceListItem/WorkspaceListItem.tsx)
- [useWorkspaceShortcuts.ts](/Users/avipeltz/.superset/worktrees/superset/can-you-review-this-linear-ticket-fully-and-make-a/linear.app/superset-sh/issue/super-362/v2-workspa/apps/desktop/src/renderer/hooks/useWorkspaceShortcuts.ts)
- [workspace/page.tsx](/Users/avipeltz/.superset/worktrees/superset/can-you-review-this-linear-ticket-fully-and-make-a/linear.app/superset-sh/issue/super-362/v2-workspa/apps/desktop/src/renderer/routes/_authenticated/_dashboard/workspace/page.tsx)
- [collections.ts](/Users/avipeltz/.superset/worktrees/superset/can-you-review-this-linear-ticket-fully-and-make-a/linear.app/superset-sh/issue/super-362/v2-workspa/apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/collections.ts)
- [schema.ts](/Users/avipeltz/.superset/worktrees/superset/can-you-review-this-linear-ticket-fully-and-make-a/linear.app/superset-sh/issue/super-362/v2-workspa/packages/db/src/schema/schema.ts)
- [project.ts](/Users/avipeltz/.superset/worktrees/superset/can-you-review-this-linear-ticket-fully-and-make-a/linear.app/superset-sh/issue/super-362/v2-workspa/packages/trpc/src/router/project/project.ts)
- [workspace.ts](/Users/avipeltz/.superset/worktrees/superset/can-you-review-this-linear-ticket-fully-and-make-a/linear.app/superset-sh/issue/super-362/v2-workspa/packages/trpc/src/router/workspace/workspace.ts)

New files expected by this plan:

- `apps/desktop/src/renderer/screens/main/components/V2WorkspaceSidebar/`
- `apps/desktop/src/renderer/screens/main/components/V2WorkspaceSidebar/hooks/useV2SidebarData.ts`
- `apps/desktop/src/renderer/screens/main/components/V2WorkspaceSidebar/hooks/useV2WorkspaceShortcuts.ts`
- `apps/desktop/src/renderer/screens/main/components/V2WorkspaceSidebar/stores/v2WorkspaceSelection.ts`
- `packages/trpc/src/router/projects-v2/projects-v2.ts`
- `packages/trpc/src/router/workspaces-v2/workspaces-v2.ts`


## Plan of Work

### Milestone 0: Resolve blockers before coding deep UI

Checklist:

- [ ] Confirm whether SUPER-363 already adds the base `v2_*` schema or whether this ticket must do it.
- [ ] Decide what row click and keyboard shortcut navigation should do in V2 mode.
- [ ] Decide whether `PortsList` is shown, adapted, or hidden in V2 mode.
- [ ] Decide whether the footer action should keep local project import behavior or switch to V2 creation-only behavior.

Acceptance:

1. No unresolved product ambiguity remains around click behavior, footer behavior, or ports visibility.


### Milestone 1: Add or verify V2 schema foundations

Scope:

1. Add `v2_projects` to `packages/db/src/schema/`.
2. Add missing `v2_devices`, `v2_users_devices`, `v2_device_presence`, and `v2_workspaces` definitions if not already present.
3. Update `v2_workspaces.project_id` to reference `v2_projects.id`.
4. Export inferred select/insert types.
5. Generate migration with Drizzle only.

Checklist:

- [ ] Inventory current schema files in `packages/db/src/schema/` for any existing `v2_*` tables
- [ ] Add `v2Projects` schema with:
  - [ ] `id`
  - [ ] `organizationId`
  - [ ] `name`
  - [ ] `slug`
  - [ ] `githubRepositoryId`
  - [ ] `createdAt`
  - [ ] `updatedAt`
- [ ] Add index on `organizationId`
- [ ] Add unique constraint on `(organizationId, slug)`
- [ ] Update `v2Workspaces.projectId` FK to `v2Projects.id`
- [ ] Export `InsertV2Project`, `SelectV2Project`, and equivalent V2 types
- [ ] Run `bunx drizzle-kit generate --name=\"v2_projects_and_sidebar\"`

Acceptance:

1. Schema compiles.
2. Generated migration exists.
3. No manual edits under `packages/db/drizzle/`.


### Milestone 2: Add shared cloud tRPC routers for V2

Scope:

1. Add `projectsV2` router with `create`, `rename`, `delete`.
2. Add `workspacesV2` router with `create`, `rename`, `delete`.
3. Mount both into the API root router.
4. Enforce org membership/admin checks.
5. Auto-create a sensible `v2_device` record during workspace creation if no device is provided.

Checklist:

- [ ] Create `packages/trpc/src/router/projects-v2/projects-v2.ts`
- [ ] Create `packages/trpc/src/router/workspaces-v2/workspaces-v2.ts`
- [ ] Add router barrels as needed
- [ ] Mount routers in [root.ts](/Users/avipeltz/.superset/worktrees/superset/can-you-review-this-linear-ticket-fully-and-make-a/linear.app/superset-sh/issue/super-362/v2-workspa/packages/trpc/src/root.ts#L18)
- [ ] `projectsV2.create`
  - [ ] validate `organizationId`, `name`, `slug`, optional `githubRepositoryId`
  - [ ] verify org membership
  - [ ] insert row into `v2_projects`
- [ ] `projectsV2.rename`
  - [ ] validate `id`, `organizationId`, `name`
  - [ ] verify org membership
  - [ ] update row
- [ ] `projectsV2.delete`
  - [ ] validate `id`, `organizationId`
  - [ ] verify admin or intended permission level
  - [ ] delete row
- [ ] `workspacesV2.create`
  - [ ] validate `organizationId`, `projectId`, `name`, `branch`, optional `deviceId`
  - [ ] verify org membership
  - [ ] resolve or create `v2_device`
  - [ ] insert row into `v2_workspaces`
- [ ] `workspacesV2.rename`
- [ ] `workspacesV2.delete`
- [ ] Add unit/integration coverage for auth and row creation

Acceptance:

1. Desktop renderer can create, rename, and delete V2 projects/workspaces through `apiTrpcClient`.
2. API router types are available to the renderer.


### Milestone 3: Extend Electric collections with V2 tables

Scope:

1. Add V2 Electric collections to the desktop `CollectionsProvider`.
2. Preload them with the rest of org collections.
3. Expose them through `useCollections()`.

Checklist:

- [ ] Update `OrgCollections` in [collections.ts](/Users/avipeltz/.superset/worktrees/superset/can-you-review-this-linear-ticket-fully-and-make-a/linear.app/superset-sh/issue/super-362/v2-workspa/apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/collections.ts#L49)
- [ ] Add `v2Projects`
- [ ] Add `v2Workspaces`
- [ ] Add `v2Devices`
- [ ] Add `v2DevicePresence`
- [ ] Add `v2UsersDevices`
- [ ] Add shape params for each Electric table with `organizationId`
- [ ] Use correct collection keys:
  - [ ] `id` for `v2Projects`
  - [ ] `id` for `v2Workspaces`
  - [ ] `id` for `v2Devices`
  - [ ] `deviceId` or actual stable key for `v2DevicePresence`
  - [ ] `id` for `v2UsersDevices`
- [ ] Include all five in `preloadCollections()`
- [ ] Return them from `getCollections()`

Acceptance:

1. `useCollections()` exposes the full V2 data model.
2. Switching organizations preloads V2 sidebar data.


### Milestone 4: Implement local device-only sidebar meta

Scope:

1. Add reactive local storage persistence for:
   - `projectLocalMeta`
   - `workspaceLocalMeta`
   - `sectionLocalMeta`
2. Keep this state local to the device and user.
3. Provide write helpers for reorder, collapse, section CRUD, and workspace grouping.

Checklist:

- [ ] Choose implementation location:
  - [ ] either a small `V2WorkspaceSidebar/local-meta/` module
  - [ ] or a shared renderer helper under `renderer/lib/`
- [ ] Add storage keys:
  - [ ] `superset:project-local-meta`
  - [ ] `superset:workspace-local-meta`
  - [ ] `superset:section-local-meta`
- [ ] Define types for each local meta record
- [ ] Implement read/parse with corrupted-data fallback
- [ ] Implement write/update helpers
- [ ] Implement stable sort behavior:
  - [ ] top-level section headers + ungrouped workspaces share `tabOrder`
  - [ ] null `tabOrder` sorts last
  - [ ] section-contained workspaces sort by `tabOrder`
- [ ] Implement helpers for:
  - [ ] create section
  - [ ] rename section
  - [ ] recolor section
  - [ ] delete section
  - [ ] move workspace into section
  - [ ] move workspace out of section
  - [ ] reorder project top-level items
  - [ ] reorder workspaces within section
  - [ ] toggle project collapsed
  - [ ] toggle section collapsed
  - [ ] toggle workspace open state
- [ ] Add targeted tests for ordering and section deletion behavior

Acceptance:

1. Local meta behaves deterministically across reloads.
2. Missing local meta does not block rendering new Electric rows.


### Milestone 5: Build the V2 sidebar data adapter

Scope:

1. Join Electric V2 collections with local meta into one renderer-friendly grouped shape.
2. Produce the same logical render inputs the current sidebar expects:
   - projects
   - sections
   - `topLevelItems`
   - flattened shortcut order
3. Keep V2-specific row metadata explicit.

Checklist:

- [ ] Add `types.ts` under `V2WorkspaceSidebar/`
- [ ] Define `V2SidebarProject`
- [ ] Define `V2SidebarWorkspace`
- [ ] Define `V2SidebarSection`
- [ ] Add `hooks/useV2SidebarData.ts`
- [ ] Read V2 Electric collections via `useCollections()`
- [ ] Join project rows to GitHub repo rows if needed for display
- [ ] Join workspaces to devices and device presence if needed for status badges
- [ ] Join workspaces to local meta records
- [ ] Group workspaces by project
- [ ] Build top-level ordering using shared `tabOrder` namespace
- [ ] Default new workspaces without local meta to top-level bottom placement
- [ ] Filter out orphaned local meta gracefully
- [ ] Return:
  - [ ] ordered projects
  - [ ] per-project `topLevelItems`
  - [ ] section-local workspace ordering
  - [ ] empty-state booleans
- [ ] Add `hooks/useV2WorkspaceShortcuts.ts`
  - [ ] flatten workspaces in rendered visual order
  - [ ] wire `JUMP_TO_WORKSPACE_1..9`

Acceptance:

1. The hook alone can drive a full sidebar render.
2. Shortcut order matches visual order.


### Milestone 6: Build the new `V2WorkspaceSidebar` component tree

Scope:

1. Create a sibling component tree, not a rewrite of the old sidebar.
2. Match the current sidebar structure where possible.
3. Keep any old-sidebar-only runtime integrations out of V2 unless explicitly supported.

Checklist:

- [ ] Create `apps/desktop/src/renderer/screens/main/components/V2WorkspaceSidebar/index.ts`
- [ ] Create `V2WorkspaceSidebar.tsx`
- [ ] Create `components/V2SidebarHeader/`
- [ ] Create `components/V2SidebarFooter/`
- [ ] Create `components/V2SidebarDropZone/`
- [ ] Create `components/V2ProjectSection/`
- [ ] Create `components/V2WorkspaceSection/`
- [ ] Create `components/V2WorkspaceList/`
- [ ] Create `components/V2WorkspaceListItem/`
- [ ] Create `stores/v2WorkspaceSelection/`
- [ ] Implement root render flow:
  - [ ] header
  - [ ] scrollable project list
  - [ ] empty state
  - [ ] optional ports area based on final decision
  - [ ] footer
- [ ] Implement project section UI:
  - [ ] collapse/expand
  - [ ] project context menu
  - [ ] new workspace action
  - [ ] new section action
- [ ] Implement workspace section UI:
  - [ ] collapse/expand
  - [ ] color indicator
  - [ ] rename/delete actions
- [ ] Implement workspace row UI:
  - [ ] display name
  - [ ] branch text
  - [ ] active/selected states
  - [ ] context menu
  - [ ] keyboard shortcut badges if current sidebar shows them
- [ ] Reuse shared primitives from `@superset/ui` where practical

Acceptance:

1. V2 sidebar renders from Electric data without using `electronTrpc.workspaces.getAllGrouped`.
2. Old `WorkspaceSidebar` code remains untouched.


### Milestone 7: Add V2 local interactions and reordering

Scope:

1. Implement drag-and-drop and context menu actions against local meta stores.
2. Keep persistence local for order/sections/collapse.
3. Use API mutations only for shared project/workspace entity changes.

Checklist:

- [ ] Add project drag-and-drop reordering
- [ ] Add top-level section/workspace reordering within project
- [ ] Add in-section workspace reordering
- [ ] Add move workspace to section
- [ ] Add move workspace out of section
- [ ] Add multi-select if parity is required in first cut
- [ ] Hook rename/delete project actions to `projectsV2`
- [ ] Hook rename/delete workspace actions to `workspacesV2`
- [ ] Hook section actions to local meta only
- [ ] Update selection store behavior for:
  - [ ] cmd-click
  - [ ] shift-click range
  - [ ] escape to clear
- [ ] Add optimistic local updates where useful

Acceptance:

1. Sidebar ordering persists across reloads on the same device.
2. Project/workspace rename/delete sync through Electric.


### Milestone 8: Add stub V2 creation modal

Scope:

1. Provide a simple testing scaffold to create V2 projects/workspaces.
2. Keep it separate from the existing local `NewWorkspaceModal`.

Checklist:

- [ ] Add a new V2 modal store or extend the current modal store with a flag-safe mode split
- [ ] Create a minimal form with:
  - [ ] existing project picker
  - [ ] new project name input
  - [ ] workspace name input
  - [ ] branch input defaulting to `main`
- [ ] If new project name is entered:
  - [ ] derive slug
  - [ ] call `projectsV2.create`
- [ ] Call `workspacesV2.create`
- [ ] Auto-resolve device ID using current machine identity
- [ ] Close modal and rely on Electric sync for sidebar update
- [ ] Add validation and error handling

Acceptance:

1. A tester can create a project and workspace entirely through the V2 path.
2. No legacy local workspace creation is required for V2 sidebar validation.


### Milestone 9: Wire the feature flag switch

Scope:

1. Route all sidebar selection logic through the feature flag at the dashboard boundary.
2. Keep off-state behavior byte-for-byte equivalent where practical.

Checklist:

- [ ] In [layout.tsx](/Users/avipeltz/.superset/worktrees/superset/can-you-review-this-linear-ticket-fully-and-make-a/linear.app/superset-sh/issue/super-362/v2-workspa/apps/desktop/src/renderer/routes/_authenticated/_dashboard/layout.tsx#L24), read `useFeatureFlagEnabled(FEATURE_FLAGS.V2_CLOUD)`
- [ ] When flag is on:
  - [ ] render `V2WorkspaceSidebar`
  - [ ] wire `NEW_WORKSPACE` hotkey to the V2 stub modal
  - [ ] avoid querying current old workspace project for V2 sidebar-only needs
- [ ] When flag is off:
  - [ ] keep rendering existing `WorkspaceSidebar`
  - [ ] keep current `NEW_WORKSPACE` hotkey behavior
- [ ] Guard any V2-only components with the flag

Acceptance:

1. Toggling `V2_CLOUD` cleanly swaps sidebar implementations.
2. Off-state has no behavior regression.


### Milestone 10: Patch surrounding route assumptions for V2 mode

Scope:

1. Remove or guard old workspace-only assumptions that break when the sidebar is V2-backed.
2. Keep this patch set minimal and explicit.

Checklist:

- [ ] Update [workspace/page.tsx](/Users/avipeltz/.superset/worktrees/superset/can-you-review-this-linear-ticket-fully-and-make-a/linear.app/superset-sh/issue/super-362/v2-workspa/apps/desktop/src/renderer/routes/_authenticated/_dashboard/workspace/page.tsx#L18) so V2 mode does not redirect based on old local grouped workspaces
- [ ] Add a V2-compatible empty-state redirect or placeholder route behavior
- [ ] Decide whether V2 row click should:
  - [ ] navigate nowhere
  - [ ] navigate to placeholder route
  - [ ] navigate to a V2 workspace details placeholder
- [ ] Guard history dropdown or other old-workspace consumers if they assume local workspace data only

Acceptance:

1. V2 flag-on mode does not immediately misroute users because of old workspace redirects.


## Concrete Checklist by File Area

### `packages/db`

- [ ] Add `v2_*` table definitions
- [ ] Export inferred types
- [ ] Generate migration

### `packages/trpc`

- [ ] Add `projectsV2`
- [ ] Add `workspacesV2`
- [ ] Mount routers in root
- [ ] Add tests

### `apps/desktop` collections and data

- [ ] Extend `CollectionsProvider`
- [ ] Implement local meta persistence
- [ ] Implement `useV2SidebarData`
- [ ] Implement `useV2WorkspaceShortcuts`

### `apps/desktop` UI

- [ ] Create `V2WorkspaceSidebar/`
- [ ] Build header/footer/project/section/workspace components
- [ ] Build stub V2 modal
- [ ] Wire feature flag in dashboard layout

### Compatibility guards

- [ ] Patch `/workspace` index redirect
- [ ] Decide `PortsList` behavior
- [ ] Decide footer behavior
- [ ] Decide row click behavior


## Verification Plan

### Automated

- [ ] `bun run typecheck`
- [ ] `bun run lint`
- [ ] targeted tests for V2 local meta ordering logic
- [ ] targeted tests for V2 API routers
- [ ] targeted tests for `useV2SidebarData` if practical

### Manual

- [ ] Flag off: existing sidebar behaves exactly as before
- [ ] Flag on: empty state renders with no V2 data
- [ ] Create V2 project + workspace through stub modal
- [ ] Project appears via Electric sync
- [ ] Workspace appears via Electric sync
- [ ] Collapse/expand project persists after reload
- [ ] Create section and move workspace into it
- [ ] Reorder top-level workspace vs section
- [ ] Reorder project list
- [ ] Rename project
- [ ] Rename workspace
- [ ] Delete section
- [ ] Delete workspace
- [ ] Delete project
- [ ] Keyboard shortcuts match visible order
- [ ] No crash when local meta is empty or corrupted


## Risks

1. The ticket’s scope excludes V2 workspace opening, but many current sidebar behaviors assume clickable navigable workspaces.
2. `PortsList` is currently old-workspace-based and may create partial V2 mode inconsistencies.
3. If SUPER-363 is not already landed, this ticket includes more foundational schema work than the title suggests.
4. Reusing current sidebar row components directly is likely to pull in too much local-runtime behavior from old workspaces.


## Recommended Implementation Order

1. Milestone 0
2. Milestone 1
3. Milestone 2
4. Milestone 3
5. Milestone 4
6. Milestone 5
7. Milestone 9
8. Milestone 6
9. Milestone 8
10. Milestone 7
11. Milestone 10
12. Verification


## Outcomes & Retrospective

TBD after implementation.
