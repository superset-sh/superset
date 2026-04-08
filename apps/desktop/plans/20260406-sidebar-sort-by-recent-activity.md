# Add Sidebar Sort by Recent Activity

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from AGENTS.md and this template.


## Purpose / Big Picture

Currently the desktop sidebar orders projects and workspaces by a fixed manual drag-and-drop order (stored as `tabOrder`). Power users who frequently switch between workspaces want the sidebar to surface whichever workspace they touched most recently — similar to how an IDE sorts open files by last-used.

After this change a user can open Settings > Behavior, switch "Sidebar sort order" from "Manual" to "Recent activity", and immediately see the sidebar reorder itself so that the workspace with the most recent terminal output, agent event, or chat message appears at the top. Projects also reorder by their most recently active workspace. Drag-and-drop reordering is disabled while the "Recent activity" mode is active, and re-enabled when the user switches back to "Manual".


## Assumptions

All assumptions have been confirmed and moved to the Decision Log.


## Open Questions

All questions have been resolved and moved to the Decision Log.


## Progress

- [x] (2026-04-06) Add `SidebarSortMode` type and `SIDEBAR_SORT_MODES` constant to `packages/local-db/src/schema/zod.ts`.
- [x] (2026-04-06) Add `lastActivityAt` column to `workspaces` table and `sidebarSortMode` column to `settings` table in `packages/local-db/src/schema/schema.ts`.
- [x] (2026-04-06) Generate Drizzle migration `0039_add_sidebar_sort_mode_and_last_activity.sql`.
- [x] (2026-04-06) Add `getSidebarSortMode` / `setSidebarSortMode` tRPC procedures to the settings router.
- [x] (2026-04-06) Add `updateLastActivityAt` workspace mutation to the workspaces query router.
- [x] (2026-04-06) Add `computeActivityOrder` function to `visual-order.ts` and make `getWorkspacesInVisualOrder` and `getAllGrouped` respect the sort mode setting.
- [x] (2026-04-06) Add settings UI: "Sidebar sort order" dropdown in Behavior settings with search keywords.
- [x] (2026-04-06) Track activity from agent lifecycle events (`Stop`, `PermissionRequest`) in `useAgentHookListener.ts`.
- [x] (2026-04-06) Track activity from terminal output with 30-second debounce in `Terminal.tsx`.
- [x] (2026-04-06) Track activity from chat message sends in `ChatPaneInterface.tsx`.
- [x] (2026-04-06) Disable workspace and project drag-and-drop when sort mode is `"recent"` in `useWorkspaceDnD.ts` and `ProjectSection.tsx`.
- [x] (2026-04-06) Add `lastActivityAt` to V2 workspace local state schema and `DashboardSidebarWorkspace` type.
- [x] (2026-04-06) Make V2 dashboard sidebar (`useDashboardSidebarData.ts`) sort by recent activity when setting is enabled.
- [x] (2026-04-06) Add tests for `computeActivityOrder` in `visual-order.test.ts`.
- [x] (2026-04-07) Fix sidebar activity sort reactivity issue.
- [x] (2026-04-07) Clarify terminal activity grace period comment.


## Surprises & Discoveries

- Observation: The V2 dashboard sidebar (TanStack DB-based) required a different approach for activity sorting than V1 (Drizzle SQLite-based) because it uses `useLiveQuery` with Zod-validated schemas rather than direct database queries. The `lastActivityAt` field needed to be added at the Zod schema level (`workspaceLocalStateSchema`) rather than the database schema level.
  Evidence: `apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema.ts` uses `persistedDateSchema.nullable()` whereas V1 uses `integer("last_activity_at")`.

- Observation: Sidebar sort reactivity required a follow-up fix — the initial implementation did not properly invalidate queries after the sort mode setting changed.
  Evidence: Commit `c23d9731f fix(desktop): fix sidebar activity sort reactivity`.


## Decision Log

- Decision: Store `lastActivityAt` as a Unix millisecond integer in SQLite (V1) and as a `persistedDateSchema` nullable date in TanStack DB (V2).
  Rationale: Matches existing patterns — V1 uses integers for timestamps (`lastOpenedAt`), V2 uses Zod date schemas. Consistency with each system's conventions reduces cognitive overhead.

- Decision: Use a 30-second debounce for terminal activity tracking rather than updating on every terminal data event.
  Rationale: Terminal output can fire hundreds of times per second during builds or log tails. A 30-second window prevents excessive database writes while still keeping the sort order meaningfully up-to-date.

- Decision: Track activity on agent `Stop` and `PermissionRequest` events (not `Start` or streaming tokens).
  Rationale: `Stop` indicates completed work worth surfacing. `PermissionRequest` indicates the workspace needs attention. `Start` alone does not indicate meaningful activity, and tracking streaming tokens would be too noisy.

- Decision: Disable drag-and-drop entirely when sort mode is `"recent"` rather than allowing manual overrides.
  Rationale: Allowing manual reordering while in activity-sorted mode would create confusing UX — the user's drag would be immediately overridden by the next activity event. Clean separation between modes is simpler.

- Decision: Sort projects by the maximum `lastActivityAt` of their contained workspaces.
  Rationale: A project's recency is determined by its most recently active workspace. This provides a natural grouping where the project containing the workspace you just used floats to the top.


## Outcomes & Retrospective

The feature is fully implemented across V1 and V2 sidebar systems. The three commits on the branch deliver a working "Sort by recent activity" option in Settings > Behavior that reorders both projects and workspaces in real-time based on terminal, agent, and chat activity. Drag-and-drop is cleanly disabled in activity-sort mode.

The implementation required touching more files than initially expected due to the dual V1/V2 sidebar systems — each has its own data layer and sorting logic. The follow-up reactivity fix (second commit) was needed because the initial implementation did not fully invalidate the right queries when the sort mode changed.


## Context and Orientation

This plan affects the **desktop app** (`apps/desktop`) and the **local-db package** (`packages/local-db`).

The Superset desktop app is an Electron application. Electron apps have two processes: a **main process** (Node.js, runs backend logic and database access) and a **renderer process** (browser-like, runs the React UI). These communicate via **IPC** (inter-process communication), which in this codebase is handled by **tRPC** — a TypeScript RPC framework that provides type-safe function calls between the two processes. The tRPC routers live in `apps/desktop/src/lib/trpc/routers/`.

The sidebar has two implementations referred to as **V1** and **V2**. V1 is the original sidebar backed by **Drizzle ORM** queries against a local **SQLite** database (schema defined in `packages/local-db/src/schema/`). V2 is the newer dashboard sidebar backed by **TanStack DB** collections with **Zod**-validated schemas, used when the `V2_CLOUD` feature flag is enabled. Both systems need to support the sort mode because users may be on either version.

**DnD** (drag-and-drop) is handled by `react-dnd` and allows users to reorder workspaces and projects by dragging them in the sidebar. The `tabOrder` integer column controls the manual sort position.

Key files and their roles:

The database schema lives in `packages/local-db/src/schema/schema.ts` (Drizzle table definitions) and `packages/local-db/src/schema/zod.ts` (Zod type definitions and constants). The settings tRPC router at `apps/desktop/src/lib/trpc/routers/settings/index.ts` exposes getter/setter procedures for user preferences. The workspaces query router at `apps/desktop/src/lib/trpc/routers/workspaces/procedures/query.ts` handles workspace listing and ordering. The visual order utility at `apps/desktop/src/lib/trpc/routers/workspaces/utils/visual-order.ts` computes sidebar display order from raw database rows.

On the renderer side, `apps/desktop/src/renderer/stores/tabs/useAgentHookListener.ts` listens for agent lifecycle events (start, stop, permission requests). `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/Terminal.tsx` renders the terminal pane and receives streaming output. The behavior settings UI is in `apps/desktop/src/renderer/routes/_authenticated/settings/behavior/components/BehaviorSettings/BehaviorSettings.tsx`.


## Plan of Work

The work divides into four areas: schema changes, backend sorting logic, activity tracking hooks, and UI integration.

**Schema changes.** In `packages/local-db/src/schema/zod.ts`, add a `SIDEBAR_SORT_MODES` constant (`["manual", "recent"] as const`) and a `SidebarSortMode` type derived from it. In `packages/local-db/src/schema/schema.ts`, add a `lastActivityAt` integer column to the `workspaces` table (with an index for query performance) and a `sidebarSortMode` text column to the `settings` table. Generate a Drizzle migration via `bunx drizzle-kit generate`.

**Backend sorting logic.** In the settings tRPC router, add `getSidebarSortMode` (returns the current mode, defaulting to `"manual"`) and `setSidebarSortMode` (accepts a mode value and upserts the settings row). In the workspaces query router, add an `updateLastActivityAt` mutation that sets `lastActivityAt` to `Date.now()` for a given workspace ID. In `visual-order.ts`, add a `computeActivityOrder` function that sorts workspaces by `lastActivityAt` descending (nulls last, falling back to `tabOrder`) and sorts projects by the maximum `lastActivityAt` across their workspaces. Update `getWorkspacesInVisualOrder` and the `getAllGrouped` procedure to check the sort mode setting and use activity-based ordering when the mode is `"recent"`.

**Activity tracking hooks.** In `useAgentHookListener.ts`, call `updateLastActivityAt` when agent `Stop` or `PermissionRequest` events fire. In `Terminal.tsx`, call `updateLastActivityAt` on terminal data events with a 30-second debounce (using a ref to track the last update timestamp). In `ChatPaneInterface.tsx`, call `updateLastActivityAt` when a chat message is sent.

**UI integration.** In the settings search registry (`settings-search.ts`), add a `BEHAVIOR_SIDEBAR_SORT` entry with relevant keywords. In `BehaviorSettings.tsx`, add a `Select` dropdown that queries `getSidebarSortMode`, optimistically updates on change via `setSidebarSortMode`, and invalidates `getAllGrouped` on settlement so the sidebar re-renders. In `useWorkspaceDnD.ts`, add a `disabled` option that sets `canDrag: false` and `canDrop: false` on the `useDrag`/`useDrop` hooks. In `WorkspaceListItem.tsx` and `ProjectSection.tsx`, query the sort mode and pass `disabled: true` when the mode is `"recent"`. For V2, add `lastActivityAt` to the `workspaceLocalStateSchema` in the collections provider schema and to the `DashboardSidebarWorkspace` type, then update `useDashboardSidebarData.ts` to sort by activity when the setting is enabled.


## Concrete Steps

Build and validate:

    cd apps/desktop
    bun run typecheck
    # Expected: No type errors

    cd ../..
    bun run lint:fix
    # Expected: Auto-fixes applied, no remaining errors

    bun test apps/desktop/src/lib/trpc/routers/workspaces/utils/visual-order.test.ts
    # Expected: All tests pass, including computeActivityOrder tests


## Validation and Acceptance

Start the desktop app in development mode:

    bun dev

Verify the following behaviors:

Open Settings > Behavior. A "Sidebar sort order" dropdown should appear with two options: "Manual" (default) and "Recent activity". With "Manual" selected, the sidebar should behave exactly as before — projects and workspaces in their drag-and-drop order.

Switch to "Recent activity". The sidebar should immediately re-sort. Open a terminal in any workspace and run a command — that workspace should float to the top within 30 seconds. Start an agent session in a different workspace — when the agent stops or requests permission, that workspace should move to the top. Send a chat message in a workspace — it should also update.

With "Recent activity" selected, attempt to drag a workspace or project. The drag should not initiate — the cursor should not change and no drag preview should appear.

Switch back to "Manual". The original drag-and-drop ordering should restore and dragging should work again.

Toggle the `V2_CLOUD` feature flag and repeat the above checks with the V2 dashboard sidebar.

Run validation commands:

    bun run typecheck   # No type errors
    bun run lint        # No lint errors
    bun test            # All tests pass


## Idempotence and Recovery

The Drizzle migration (`0039_add_sidebar_sort_mode_and_last_activity.sql`) adds nullable columns with no default, so it is safe to run on an existing database — existing rows simply get `NULL` values for the new columns, which the application interprets as `"manual"` sort mode and no activity recorded. The migration can be re-applied without error because `ALTER TABLE ... ADD COLUMN` with `IF NOT EXISTS` semantics is handled by Drizzle.

The `updateLastActivityAt` mutation is idempotent — calling it multiple times for the same workspace simply overwrites the timestamp with the latest value. The 30-second terminal debounce prevents excessive writes but does not cause correctness issues if the debounce is bypassed.

Switching between sort modes is fully reversible with no data loss. The `tabOrder` values are never modified by the activity sort — they remain intact and are used immediately when switching back to "Manual" mode.


## Interfaces and Dependencies

The feature introduces these key interfaces:

In `packages/local-db/src/schema/zod.ts`:

    export const SIDEBAR_SORT_MODES = ["manual", "recent"] as const;
    export type SidebarSortMode = (typeof SIDEBAR_SORT_MODES)[number];

In `packages/local-db/src/schema/schema.ts`, the `workspaces` table gains:

    lastActivityAt: integer("last_activity_at")

And the `settings` table gains:

    sidebarSortMode: text("sidebar_sort_mode").$type<SidebarSortMode>()

In `apps/desktop/src/lib/trpc/routers/workspaces/utils/visual-order.ts`:

    export function computeActivityOrder(
        projects: ProjectLike[],
        workspaces: WorkspaceLike[],
    ): string[]

In `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/types.ts`, the `DashboardSidebarWorkspace` interface gains:

    lastActivityAt: Date | null;

No new external dependencies are introduced. The feature uses existing libraries: Drizzle ORM for schema and queries, tRPC for IPC procedures, react-dnd for drag-and-drop control, and Zod for V2 schema validation.
