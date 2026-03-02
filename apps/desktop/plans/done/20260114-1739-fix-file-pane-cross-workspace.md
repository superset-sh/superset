# Fix blank file viewer pane when switching workspaces

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from `AGENTS.md` (root), `apps/desktop/AGENTS.md`, and the ExecPlan template at `.agents/commands/create-plan.md`.

## Purpose / Big Picture

Users can open a file viewer pane (diff/raw/rendered) in one workspace and freely switch to another workspace without seeing a blank or empty file pane that does not belong to the new workspace.

After this change, each workspace renders only its own tabs and panes. If the persisted tabs state is inconsistent (for example, if `activeTabIds` points to a tab that belongs to a different workspace), the app self-heals to a safe, deterministic state instead of rendering cross-workspace content.

## Assumptions

1. A “workspace” corresponds to a git worktree and has a stable `workspaceId` used both in routing (`/workspace/$workspaceId`) and in the tabs store (`Tab.workspaceId`, and the keys of `activeTabIds`).
2. Tabs and panes are intended to be workspace-scoped: a tab should never be rendered while viewing a different workspace route.
3. It is acceptable for the app to automatically fall back to the most appropriate valid tab in a workspace if the currently stored `activeTabIds[workspaceId]` is invalid.

## Open Questions

None. If new edge cases appear during implementation, add them here and record decisions in the Decision Log.

## Progress

- [x] (2026-01-14 17:39Z) Investigate bug and identify likely root cause
- [x] (2026-01-14 17:39Z) Write ExecPlan for Proposal A
- [x] (2026-01-14 17:48Z) Implement workspace-scoped active tab resolver and state sanitization
- [x] (2026-01-14 17:50Z) Update UI components to consume the resolver (TabsContent, TabView, GroupStrip, workspace route)
- [x] (2026-01-14 17:51Z) Add regression tests for resolver
- [x] (2026-01-14 17:52Z) Run `bun test` (desktop/unit ok; repo-wide has 1 unrelated failing test in apps/cli)
- [ ] Manual validation in desktop app

## Surprises & Discoveries

- Observation: `TabsContent` selects the active tab ID for the current route workspace, then looks up the tab in the global `tabs` array without verifying that the tab’s `workspaceId` matches.
  Evidence: `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/index.tsx` computes `tabToRender` via `allTabs.find(...)`.

- Observation: `TabView` derives `worktreePath` from the route param `workspaceId`, not from `tab.workspaceId`.
  Evidence: `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/index.tsx` uses `useParams()`.

## Decision Log

- Decision: Enforce workspace scoping in the tabs domain, and use fail-safe selection in the UI.
  Rationale: Aligns with AGENTS.md principles (fail-safe by default, minimal coupling) and prevents the UI from rendering a tab or pane that does not belong to the current workspace.
  Date/Author: 2026-01-14 / Planning phase

- Decision: Avoid adding new React effects if possible; prefer pure selectors plus store-level sanitization.
  Rationale: `apps/desktop/AGENTS.md` asks to avoid effects unless necessary. Making selection pure and idempotent avoids timing issues and makes behavior deterministic.
  Date/Author: 2026-01-14 / Planning phase

- Decision: Resolve file viewer `worktreePath` using `tab.workspaceId` rather than the route param.
  Rationale: `TabView` already has the tab. Coupling to the route makes mismatches possible and violates the Law of Demeter.
  Date/Author: 2026-01-14 / Planning phase

## Outcomes & Retrospective

This change prevents the “blank file viewer pane” that could appear when switching workspaces with a file viewer open.

The underlying issue was that the route workspace ID and the rendered tab’s `workspaceId` could become inconsistent (stale `activeTabIds` / history), allowing the UI to render a tab from workspace A while the route was workspace B.

Outcomes:

- Enforced workspace-scoped tab selection via a pure resolver (`resolveActiveTabIdForWorkspace`).
- Hardened the tabs store to use the resolver when opening file viewers and to sanitize persisted tab pointers on hydration.
- Updated the renderer to use the resolver for tab rendering and group selection.
- Updated `TabView` to resolve `worktreePath` from `tab.workspaceId`.
- Prevented moving panes across workspaces.

Validation:

    bun run typecheck --filter=@superset/desktop
    bun run lint
    bun test apps/desktop/src/renderer/stores/tabs/utils.test.ts

Note: `bun test` (repo-wide) currently fails due to `apps/cli/src/lib/storage/lowdb-adapter.test.ts` (unrelated to this change).

Manual QA:

Not yet run in the desktop UI. Follow the checklist in “Validation and Acceptance”.

## Context and Orientation

This change affects only the desktop app renderer (`apps/desktop/src/renderer`).

Key concepts:

- Workspace: A Superset concept representing a git worktree. The UI routes to `/workspace/$workspaceId`.
- Tab: A container for one or more panes. In state, a tab has `workspaceId`, `layout`, and `id`. Defined in `apps/desktop/src/shared/tabs-types.ts` and extended in `apps/desktop/src/renderer/stores/tabs/types.ts`.
- Pane: A leaf in a tab’s mosaic layout. Panes can be `terminal`, `webview`, or `file-viewer`. File viewers store `fileViewer` state (`filePath`, `viewMode`, etc.).
- Tabs Store: A global Zustand store (`apps/desktop/src/renderer/stores/tabs/store.ts`) persisted via a tRPC storage adapter (`apps/desktop/src/renderer/lib/trpc-storage.ts`). It stores all tabs across all workspaces.

Current rendering pipeline:

1. The route component `apps/desktop/src/renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/page.tsx` renders `ContentView`.
2. `ContentView` renders `TabsContent` and the changes sidebar.
3. `TabsContent` reads `activeTabIds[workspaceId]` and renders `TabView` for the corresponding tab.
4. `TabView` renders a Mosaic layout of panes and routes file-viewer panes to `FileViewerPane`, which reads file contents via tRPC (`changes.readWorkingFile` / `changes.getFileContents`) using a `worktreePath`.

Failure mode this plan addresses:

If `activeTabIds[workspaceId]` points to a tab in a different workspace (or a missing tab), `TabsContent` can render the wrong tab. When combined with `TabView` using the route workspaceId to obtain `worktreePath`, file viewer panes can appear blank or inconsistent after switching workspaces.

## Plan of Work

### Milestone 1: Add a workspace-scoped active tab resolver (pure utility)

Create a pure helper function that determines the “best” active tab ID for a workspace without mutating state. It must only ever return a tab ID whose `Tab.workspaceId === workspaceId`.

File: `apps/desktop/src/renderer/stores/tabs/utils.ts`

Add a new exported function:

    export function resolveActiveTabIdForWorkspace({
        workspaceId,
        tabs,
        activeTabIds,
        tabHistoryStacks,
    }: {
        workspaceId: string;
        tabs: Tab[];
        activeTabIds: Record<string, string | null | undefined>;
        tabHistoryStacks: Record<string, string[] | undefined>;
    }): string | null

Algorithm:

1. If `activeTabIds[workspaceId]` is set and refers to an existing tab in this workspace, return it.
2. Otherwise, consult `tabHistoryStacks[workspaceId]` (MRU list) and return the first tab ID that exists and belongs to the workspace.
3. Otherwise, return the first tab in `tabs` for that workspace (preserve existing order).
4. If no tabs exist for workspace, return null.

This utility is the single source of truth for “which tab should render for workspace X”.

### Milestone 2: Sanitize and self-heal invalid workspace tab pointers in the store

Update the tabs store so it never uses a cross-workspace tab as the “active tab” for a workspace.

File: `apps/desktop/src/renderer/stores/tabs/store.ts`

Changes:

1. In `addFileViewerPane(workspaceId, options)`, replace the direct lookup:

    const activeTabId = state.activeTabIds[workspaceId];
    const activeTab = state.tabs.find((t) => t.id === activeTabId);

   with a call to `resolveActiveTabIdForWorkspace(...)`, and ensure `activeTab.workspaceId === workspaceId`. If no valid tab is found, fall back to creating a new tab as the code already does.

2. In `getActiveTab(workspaceId)`, return null if the resolved tab does not belong to the requested workspace (or update it to use the resolver).

3. In the Zustand persist `merge` function (the one that currently resets stale `pane.status`), add a lightweight state sanitization step after merging:

   - For each workspace that appears in `tabs`, ensure `activeTabIds[workspaceId]` resolves to a tab in that workspace (or is null).
   - Filter each `tabHistoryStacks[workspaceId]` to remove tab IDs that no longer exist or belong to other workspaces.
   - Remove `focusedPaneIds` entries for tabs that no longer exist.

This makes persisted corruption non-fatal and prevents it from reappearing after restart.

### Milestone 3: Make tab rendering explicitly workspace-scoped

File: `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/index.tsx`

Replace the current selection logic that finds the tab by ID in the global tab list with workspace-scoped selection:

- Use `resolveActiveTabIdForWorkspace` with the current state and `activeWorkspaceId`.
- Ensure the resulting tab is looked up from `workspaceTabs` (filtered to `tab.workspaceId === activeWorkspaceId`).
- If no valid tab exists, render `EmptyTabView`.

This ensures the rendering boundary cannot render cross-workspace tabs even if the store is in a bad state.

### Milestone 4: Decouple TabView worktreePath from route params

File: `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/index.tsx`

Replace the `useParams()` usage for worktree path resolution with `tab.workspaceId`:

- Query `trpc.workspaces.get` with `{ id: tab.workspaceId }`.
- Use `workspace?.worktreePath` from that query as `worktreePath`.

This makes TabView’s dependencies explicit and prevents worktree mismatches.

### Milestone 5: Add regression tests

File: `apps/desktop/src/renderer/stores/tabs/utils.test.ts`

Add tests for `resolveActiveTabIdForWorkspace`:

1. Returns the active tab when valid for the workspace.
2. Falls back to MRU history when the active tab is invalid.
3. Ignores history entries from other workspaces.
4. Falls back to the first tab in the workspace when history is empty or invalid.
5. Returns null when the workspace has no tabs.

If store sanitization logic is implemented as a pure helper (recommended), add unit tests for it as well.

## Concrete Steps

1. Implement Milestone 1 edits in `apps/desktop/src/renderer/stores/tabs/utils.ts`.
2. Update store logic per Milestone 2 in `apps/desktop/src/renderer/stores/tabs/store.ts`.
3. Update rendering per Milestone 3 in `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/index.tsx`.
4. Update worktreePath lookup per Milestone 4 in `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/index.tsx`.
5. Add tests per Milestone 5.
6. Run validation commands from repo root:

    bun run typecheck
    bun run lint
    bun test

Expected results: no type errors, no lint errors, all tests pass.

## Validation and Acceptance

Manual repro steps (desktop app):

1. Start the desktop app dev environment:

    bun dev

2. Open workspace A.
3. Open the changes sidebar and single-click a file to open the preview file viewer pane.
4. Navigate to workspace B (which already has a terminal tab open).
5. Expected after fix: workspace B shows its own active tab and panes (for example, its terminal). No blank file viewer pane appears.
6. Switch back to workspace A. The file viewer is still present in workspace A and behaves normally.
7. Repeat the switch several times. No blank pane should appear.

Acceptance criteria:

- `TabsContent` never renders a tab whose `tab.workspaceId` differs from the current route `workspaceId`.
- File viewer panes always read file content using the worktree path of the tab’s workspace.
- If `activeTabIds` or `tabHistoryStacks` contain stale or cross-workspace IDs, the app selects a valid tab instead of rendering a blank pane.

## Idempotence and Recovery

All steps are safe to re-run. The resolver and sanitization code must be idempotent: applying it multiple times produces the same results and does not delete user data.

If tests fail due to unrelated issues, revert only the minimal change that introduced the failure and re-run `bun test` to isolate.

## Artifacts and Notes

During implementation, capture:

- The exact persisted state shape that reproduces the bug (if found) as a test fixture, so the regression test encodes the failure mode.
- A brief note in `Surprises & Discoveries` if there is a concrete mutation path that corrupts `activeTabIds` beyond persisted state.
