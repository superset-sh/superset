# Desktop Workbench/Review + Groups + File Viewer Panes

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

No `PLANS.md` file was found in this repository at plan authoring time, so this plan follows the ExecPlan template requirements directly.


## Purpose / Big Picture

After this change, a user can keep a terminal visible while viewing code, diffs, and docs in the same window by using a **Workbench** view (Groups + Mosaic panes). They can also switch into a dedicated **Review** view for focused code review workflows (the existing Changes UI), without losing the Workbench layout they were working in.

The main observable outcomes are:

- In a workspace, the header shows a workspace-level view toggle: `Workbench | Review`.
- In `Workbench`, the UI shows a Groups strip above the Mosaic layout and a file-centric sidebar; clicking a changed file opens a **File Viewer pane** next to terminals (Rendered/Raw/Diff).
- In `Review`, the UI shows a dedicated Changes page optimized for focused review (no Groups strip).


## Assumptions

- The existing “tabs” model in code remains the source of truth for Groups in MVP (i.e., a “Group” is implemented by the current `Tab` object in `apps/desktop/src/renderer/stores/tabs/*`).
- The existing “changes” model in code remains the source of truth for Review mode (i.e., “Review” uses the current changes store + TRPC endpoints).
- We will not introduce a new “New Group” hotkey in MVP. Group creation is via UI.
- We will not do an internal rename (Tab → Group in code) in MVP. That is a follow-up to reduce churn and avoid persisted-state migration risk.
- The Workbench sidebar stays file-centric for MVP (Changes + Ports at minimum). We will not add a terminal list to the sidebar in MVP; “find terminal across Groups” is handled later (pane headers + quick-switch overlay).


## Open Questions

None currently. If implementation work surfaces new ambiguity, add it here as an acceptance-oriented question and pre-link it to a Decision Log entry.


## Progress

- [ ] (2025-12-29 13:36) Create baseline branch + ensure `bun dev` launches desktop app locally.
- [ ] Add `Workbench | Review` view state + toggle UI in `WorkspaceActionBar`.
- [ ] Implement `Review` mode rendering (dedicated Changes page behavior) and confirm it remains available.
- [ ] Implement Groups strip above Mosaic (Workbench), migrating Group switching away from sidebar.
- [ ] Refactor sidebar to file-centric stacked sections (Workbench).
- [ ] Implement `file-viewer` pane type and UI (Rendered/Raw/Diff) inside Mosaic.
- [ ] Make Workbench file clicks open/reuse File Viewer panes (and decide integration with changes-store selection).
- [ ] Update “New Terminal” behavior (UI + `Cmd+T`) to add a terminal pane to the active Group.
- [ ] Add/adjust tests and run repo quality gates (typecheck, lint, tests).
- [ ] Update RFC status/notes if needed after implementation decisions land.


## Surprises & Discoveries

- (empty; to be filled during implementation)


## Decision Log

- Decision: Use `Workbench | Review` as the workspace-level toggle labels.
  Rationale: “Workbench” describes the multi-pane working surface; “Review” describes the focused changes/diff workflow, and is future-proof for GitHub review comment support.
  Date/Author: 2025-12-29 / Andreas + agent

- Decision: Keep the dedicated Changes page as `Review` mode rather than removing it.
  Rationale: Some workflows need a focused, full-featured changes surface (staging, commit helpers, PR helpers) that is more than an in-flow file viewer pane.
  Date/Author: 2025-12-29 / Andreas + agent

- Decision (DL-001): Persist `Workbench | Review` per workspace.
  Rationale: It’s a workspace-local preference (some workspaces are “review-heavy”, others are “dev-heavy”), and avoids a jarring global toggle when multiple workspaces/windows are open.
  Date/Author: 2025-12-29 / Andreas

- Decision (DL-002): In `Review`, reuse the existing “Changes in sidebar + diff in content” layout.
  Rationale: Preserves the full existing focused-review feature set and reduces risk; Workbench/Review becomes a state/entrypoint change, not a rewrite of the Changes surface.
  Date/Author: 2025-12-29 / Andreas

- Decision (DL-003): File Viewer panes reuse policy is “reuse MRU unlocked pane in active Group; otherwise create a new pane via auto-split”.
  Rationale: Keeps behavior predictable (one “preview” pane by default) while still supporting multiple concurrent viewers via locking.
  Date/Author: 2025-12-29 / Andreas

- Decision (DL-004): Workbench “open from Changes list” updates the changes-store selection (for continuity when switching to Review).
  Rationale: Keeps selection/highlight consistent and makes Workbench → Review feel like “same context, more tools”. Avoid syncing selection for non-change files (e.g., pinned docs) unless the file is also present in Changes.
  Date/Author: 2025-12-29 / Agent recommendation (confirm during implementation)

- Decision (DL-005): Constrain file reads to the workspace worktree with explicit path validation and symlink-escape protection; use git-backed reads where possible.
  Rationale: Prevents accidental or hostile reads outside the worktree (e.g., `../.ssh/id_rsa` or symlink escapes) and keeps File Viewer behavior safe and predictable. Implement checks in the main/TRPC boundary, not in renderer code.
  Date/Author: 2025-12-29 / Agent recommendation (confirm during implementation)

- Decision (DL-006): `Cmd+T` / “New Terminal” from Review switches to Workbench and creates a terminal pane in the active Group (fallback: create first Group).
  Rationale: “New Terminal” is only meaningful when the Mosaic surface is visible; switching back makes the outcome observable and keeps the shortcut consistent across modes.
  Date/Author: 2025-12-29 / Agent recommendation (confirm during implementation)

- Decision (DL-007): Default File Viewer mode: Diff for changed files; Rendered for markdown; Raw for everything else.
  Rationale: Matches intent most of the time (review wants diffs, plans/docs want rendered markdown) while keeping the escape hatch (mode toggle) in the pane header.
  Date/Author: 2025-12-29 / Agent recommendation (confirm during implementation)


## Outcomes & Retrospective

- (empty; to be filled as milestones complete)


## Context and Orientation

This work lives entirely in the desktop app:

- UI entry point and view switching:
  - `apps/desktop/src/renderer/screens/main/index.tsx` renders `WorkspaceView` when the current app view is `"workspace"`.
  - `apps/desktop/src/renderer/stores/app-state.ts` controls the top-level app view (`"workspace" | "settings" | "tasks"`).
- Current workspace UI:
  - `apps/desktop/src/renderer/screens/main/components/WorkspaceView/index.tsx` is the main workspace layout and registers hotkeys like `Cmd+T`, `Cmd+W`, and pane navigation.
  - `apps/desktop/src/renderer/screens/main/components/WorkspaceView/WorkspaceActionBar/WorkspaceActionBar.tsx` renders the workspace header row.
  - `apps/desktop/src/renderer/screens/main/components/WorkspaceView/Sidebar/index.tsx` uses a mode carousel to switch the sidebar between “Tabs” and “Changes”.
  - `apps/desktop/src/renderer/stores/sidebar-state.ts` stores `SidebarMode` (`tabs` vs `changes`), sidebar width, and open/close state.
  - `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/index.tsx` currently swaps the main content between `TabsContent` and `ChangesContent` based on `SidebarMode`.
- Current “Groups” model (called “Tabs” in code today):
  - `apps/desktop/src/renderer/stores/tabs/*` contains the store and helpers for layout tabs (our “Groups”) and panes (Mosaic tiles).
  - `apps/desktop/src/shared/tabs-types.ts` contains shared pane types (currently `terminal` and `webview`).
  - `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/*` renders a Mosaic layout of panes.
- Current “Changes” model:
  - `apps/desktop/src/renderer/screens/main/components/WorkspaceView/Sidebar/ChangesView/ChangesView.tsx` renders the changes list and selects files in the changes store.
  - `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/ChangesContent/ChangesContent.tsx` renders the diff/editor for the selected file.
  - `apps/desktop/src/lib/trpc/routers/changes/file-contents.ts` provides `changes.getFileContents` and `changes.saveFile`.

Definitions used in this plan:

- A “Group” is the user-facing term for the current layout container that holds a Mosaic layout. In code today this is a `Tab` in `tabs/store`.
- A “Pane” is a Mosaic tile inside a Group. Today we have terminal panes and webview panes; we will add a file-viewer pane.
- “Workbench” is the workspace view where Groups and panes are used for in-flow work.
- “Review” is the workspace view where the dedicated Changes page is used for focused review.

Primary design reference:

- `apps/desktop/docs/RFC_SESSION_TAB_RENAME.md` (despite its filename, it is the RFC for Groups/Panes and Workbench/Review).


## Plan of Work

Milestone 1: Introduce workspace-level `Workbench | Review` mode and keep Review functional.

The first milestone establishes the new hierarchy: “Review” is a workspace-global mode, not a sidebar mode. Implement a new per-workspace state value (for example `workspaceViewModeByWorkspaceId: Record<string, "workbench" | "review">`) and render it as a toggle in the workspace header (`WorkspaceActionBar`). Then wire `WorkspaceView` / `ContentView` so that `Review` shows the existing Changes page experience (Changes list in sidebar + diff/actions in content). This milestone is complete when a user can toggle between Workbench and Review and still see the current Changes experience in Review.

Milestone 2: Add a Groups strip above Mosaic content in Workbench and migrate Group switching out of the sidebar.

Create a new UI component (for example `GroupStrip`) that is only visible in `Workbench`. It should read the current workspace and list all groups (tabs) from `useTabsStore`, allow switching active group, and include a `+` affordance to create a new group. If the current sidebar contains a “tabs list” for group switching, keep it temporarily but treat it as legacy; once the group strip works, remove or repurpose the sidebar tabs list.

Milestone 3: Refactor the Workbench sidebar into stacked, file-centric sections and stop using sidebar “mode” to drive main content.

Replace `Sidebar/ModeCarousel` with a sidebar that always shows stacked sections (at minimum: Changes and Ports; Pinned can be a follow-up). The Workbench sidebar should not drive the main content into a “changes” view; instead, in Workbench it should only trigger actions (open a file viewer pane, copy port, etc.). The Review entrypoint lives in the workspace header: the user switches to Review via the `Workbench | Review` toggle, not via the sidebar.

Milestone 4: Add a `file-viewer` pane type and render it inside Mosaic.

Extend the shared pane type (`apps/desktop/src/shared/tabs-types.ts`) to include `type: "file-viewer"`. Add the minimum state needed to support:

- `filePath` (worktree-relative)
- `viewMode` (`rendered` | `raw` | `diff`)
- `isLocked` (prevents replacement on subsequent file clicks)
- `diffLayout` (`inline` | `side-by-side`)
- Optional metadata to support diff source (against-main, staged, unstaged, committed + commit hash)

Then update `TabView/TabPane` rendering to route `pane.type === "file-viewer"` to a new `FileViewerPane` component. Reuse the existing `DiffViewer` and `MarkdownRenderer` where possible to avoid duplicating functionality.

Milestone 5: Wire Workbench file clicks to open/reuse File Viewer panes.

Update the Workbench “Changes” section so that clicking a file opens it in a file viewer pane in the active group (reusing an unlocked file viewer pane if one exists in that group; otherwise create a new pane via the existing split behavior). Also update the existing changes-store selection for that file so that switching to Review retains context.

Milestone 6: Update “New Terminal” behavior and confirm hotkeys remain intuitive.

Ensure the “New Terminal” action (UI button and `Cmd+T`) adds a terminal pane to the active group in Workbench. In Review, `Cmd+T` first switches to Workbench and then creates a terminal pane (fallback: create first Group). Keep the existing close/split/navigate pane hotkeys consistent.


## Concrete Steps

All commands below run from the repository root:

  cd /Users/andreasasprou/.superset/worktrees/superset/inline-diff-viewer

Quality gates (run early and often):

  bun run typecheck
  bun run lint
  bun run lint:check-node-imports

Local dev (to manually validate UI flows):

  bun dev

Manual verification checklist for Workbench/Review:

- Open the desktop app and ensure a workspace is active.
- In the workspace header, toggle `Workbench | Review` and confirm:
  - Workbench shows Groups strip + Mosaic content.
  - Review shows the existing Changes experience (focused review surface).
- In Workbench:
  - Click “New Terminal” or press `Cmd+T` and confirm a new terminal pane appears inside the current group.
  - Click a file in the Changes section and confirm a file viewer pane opens next to the terminal.
  - Toggle to Review and confirm the same file is selected in the Changes view.
  - Toggle the file viewer mode between Rendered/Raw/Diff and confirm it matches expected behavior.
- Switch to Review and confirm the focused diff workflow still works (staging, editing, etc.).
- While in Review, press `Cmd+T` and confirm it switches to Workbench and creates a terminal pane.


## Validation and Acceptance

Acceptance is satisfied when a human can verify the following behaviors in a running desktop app:

- The workspace header contains a `Workbench | Review` toggle, and it switches the workspace between two distinct surfaces.
- In Workbench, the Groups strip is the primary way to switch groups; the sidebar is file-centric and does not replace the main content with the Changes page.
- Clicking a file in Workbench opens or reuses a file viewer pane inside the Mosaic layout without leaving Workbench.
- Review mode still offers the dedicated Changes page for focused review workflows and remains fully functional.

Project validation:

- `bun run typecheck` succeeds.
- `bun run lint` succeeds.
- `bun run lint:check-node-imports` succeeds.
- Existing tests continue to pass via `bun test` (or at least the desktop-relevant subset, if the repo supports filtered tests).


## Idempotence and Recovery

This work should be implemented in small, additive commits. Each milestone should keep the app in a runnable state. If a milestone introduces a breaking refactor (e.g., sidebar restructuring), keep the old component available behind a temporary switch until the new version is demonstrably working, then remove the old path.

If UI work becomes unstable, the safe recovery strategy is to revert to the last commit where `bun run typecheck` and `bun dev` both work, then re-apply changes incrementally.


## Artifacts and Notes

Keep these artifacts up to date during implementation:

- RFC: `apps/desktop/docs/RFC_SESSION_TAB_RENAME.md`
- PR for tracking (if created): link it here.
- Any screenshots or short recordings should be attached to the PR, not embedded in this file.


## Interfaces and Dependencies

Renderer/UI dependencies:

- React components under `apps/desktop/src/renderer/screens/main/components/WorkspaceView/*`.
- State management is Zustand (see `apps/desktop/src/renderer/stores/*`).
- Hotkeys are registered via `react-hotkeys-hook` (see `WorkspaceView/index.tsx` and `shared/hotkeys.ts`).
- Mosaic layout is `react-mosaic-component` (see `TabView`).

Backend dependencies:

- TRPC routers under `apps/desktop/src/lib/trpc/routers/*`.
- Git/diff contents are provided by `changes.getFileContents` in `apps/desktop/src/lib/trpc/routers/changes/file-contents.ts`.

New/updated interfaces that must exist at the end of implementation (names are suggestions; keep final names consistent with repo conventions):

- A workspace view mode value: `"workbench" | "review"` stored somewhere renderer-accessible (either in `useAppStore` or a dedicated workspace-view store).
- A `GroupStrip` component that can switch/create groups for the active workspace via `useTabsStore`.
- A `FileViewerPane` Mosaic tile renderer for `pane.type === "file-viewer"`.
- A main-process file-read helper that accepts a worktree-relative path and refuses absolute paths, `..` traversal, and symlink escapes outside the worktree root.


Plan revision note (2025-12-29): Updated Open Questions and Decision Log with answers for DL-001..DL-003, and added recommended defaults for DL-004/DL-005 so the plan remains self-contained and implementable without further context.

Plan revision note (2025-12-29): Added MVP assumptions about the Workbench sidebar (no terminals list) and captured recommended defaults for `Cmd+T` behavior in Review and File Viewer default mode selection.
