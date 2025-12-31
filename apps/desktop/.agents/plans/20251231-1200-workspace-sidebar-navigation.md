# Configurable Workspace Navigation: Sidebar Mode

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

## Purpose / Big Picture

Currently, workspaces are displayed as horizontal tabs in the TopBar, grouped by project. This change allows users to configure an alternative "sidebar" navigation style where workspaces appear in a dedicated left sidebar panel, matching designs from tools like Linear/GitHub Desktop.

After this change, users can:
1. Open Settings > Behavior and toggle "Navigation style" between "Top bar" and "Sidebar"
2. In sidebar mode, see a dedicated workspace sidebar with collapsible project sections
3. Switch between workspaces by clicking items in the sidebar
4. See PR status, diff stats, and keyboard shortcuts inline with workspace items
5. Continue using ⌘1-9 shortcuts to switch workspaces regardless of mode

## Design Reference

The target design (based on provided mockup):

    ┌─────────────────────────────────────────────────────────────────────┐
    │ [Sidebar Toggle] [Workbench|Review] [Branch ▾] [Open In ▾] [Avatar]│  <- TopBar (sidebar mode)
    ├──────────────────────┬──────────────────────────────────────────────┤
    │ ≡ Workspaces         │                                              │
    │                      │                                              │
    │ web                  │                                              │
    │ + New workspace  ... │            Main Content Area                 │
    │ ┃ andreasasprou/cebu │         (Workbench or Review mode)           │
    │   cebu · PR #144     │                                              │
    │   Ready to merge  ⌘1 │                                              │
    │   +1850 -301         │                                              │
    │                      │                                              │
    │ ▸ andreasasprou/feat │                                              │
    │   harare · PR #107   │                                              │
    │   Merge conflicts ⌘2 │                                              │
    │                      ├──────────────────────────────────────────────┤
    │ nova                 │                                              │
    │ + New workspace  ... │           Changes Sidebar                    │
    │ ┃ andreasasprou/pdf  │         (existing ResizableSidebar)          │
    │   la-paz-v2 · PR#720 │                                              │
    │   Uncommitted    ⌘3  │                                              │
    │   +23823 -5          │                                              │
    │                      │                                              │
    │ frontend             │                                              │
    │ + New workspace  ... │                                              │
    │                      │                                              │
    │────────────────────  │                                              │
    │ [+] Add project      │                                              │
    └──────────────────────┴──────────────────────────────────────────────┘
         Workspace            Changes           Content
         Sidebar              Sidebar           (Mosaic Panes)
         (NEW)                (existing)

Key visual elements:
- Active workspace: Green/project-colored left border (┃)
- Status badges: "Ready to merge", "Merge conflicts", "Uncommitted changes", "Archive"
- Diff stats: +insertions -deletions (always visible for active, hover for others)
- Keyboard shortcuts: ⌘1-9 displayed inline
- Collapsible project sections with header + "..." context menu
- "+ New workspace" per project section
- "Add project" at bottom footer

## Assumptions

1. The existing `WorkspaceHoverCard` already fetches PR status via `workspaces.getGitHubStatus` and can be reused
2. The `feat/desktop-workbench-review-mode` branch changes are the baseline (already rebased)
3. Users will primarily use one mode or the other, not switch frequently
4. The `packages/local-db` migration system handles schema changes on app startup

## Open Questions

(All questions resolved - see Decision Log)

## Progress

- [ ] Initial plan created and awaiting approval
- [ ] (Pending) Milestone 1: Add navigation style setting
- [ ] (Pending) Milestone 2: Create WorkspaceSidebar component
- [ ] (Pending) Milestone 3: Create sidebar-mode TopBar variant
- [ ] (Pending) Milestone 4: Wire up setting to conditionally render layouts
- [ ] (Pending) Milestone 5: Polish and validation

## Surprises & Discoveries

(To be filled during implementation)

## Decision Log

- **Decision**: Navigation style setting stored in SQLite settings table via existing tRPC pattern
  - Rationale: Matches existing "confirmOnQuit" behavior setting pattern, persists across sessions
  - Date: 2025-12-31 / Planning phase

- **Decision**: Workspace sidebar is a NEW dedicated sidebar, not a mode in existing ModeCarousel
  - Rationale: User preference for dedicated panel, keeps workspaces separate from terminal tabs/changes
  - Date: 2025-12-31 / Planning phase

- **Decision**: Both sidebars independently resizable
  - Rationale: User may want different widths for workspace nav vs file changes
  - Date: 2025-12-31 / Planning phase

- **Decision**: ⌘1-9 shortcuts work in both navigation modes
  - Rationale: Consistency for keyboard users regardless of UI layout preference
  - Date: 2025-12-31 / Planning phase

- **Decision**: Manual testing only, no automated tests for initial release
  - Rationale: Feature is primarily UI/layout, visual verification more appropriate
  - Date: 2025-12-31 / Planning phase

- **Decision**: Workspace sidebar width persisted independently from changes sidebar
  - Rationale: Users may want different widths for workspace nav vs file changes
  - Date: 2025-12-31 / Planning phase

- **Decision**: Workspace display format is "github-username/branch-name" (e.g., "andreasasprou/cebu")
  - Rationale: Matches GitHub PR branch naming, provides author context
  - Date: 2025-12-31 / Planning phase

- **Decision**: Skip "Archive" status badge for initial release
  - Rationale: Archive feature doesn't exist in app, can add later if needed
  - Date: 2025-12-31 / Planning phase

- **Decision**: Keep Workbench/Review toggle and Open In in WorkspaceActionBar, not TopBar
  - Rationale: Avoids duplicating components, maintains consistent location across navigation modes
  - Date: 2025-12-31 / Planning phase (review feedback)

- **Decision**: Sidebar toggles use distinct naming: "Workspaces" and "Files" with different icons
  - Rationale: With two sidebars, "Toggle sidebar" is ambiguous. Clear naming prevents confusion
  - Date: 2025-12-31 / Planning phase (review feedback)

- **Decision**: Workspace sidebar is toggleable (not always-on), default open on first use
  - Rationale: Matches changes sidebar pattern, provides flexibility for screen sizes
  - Date: 2025-12-31 / Planning phase (review feedback)

- **Decision**: Use `workspaces.getGitHubStatus` for diff stats, lazy-load on hover
  - Rationale: Reuses existing infrastructure, avoids N+1 queries, matches WorkspaceHoverCard
  - Date: 2025-12-31 / Planning phase (review feedback)

- **Decision**: Extract ⌘1-9 shortcuts and auto-create workspace logic into shared hook
  - Rationale: These behaviors must work in BOTH navigation modes, avoiding code duplication
  - Date: 2025-12-31 / Planning phase (review feedback)

## Outcomes & Retrospective

(To be filled at completion)

---

## Context and Orientation

### Current Architecture

The desktop app (`apps/desktop/`) uses:

**Layout Structure** (in `src/renderer/screens/main/`):
- `MainScreen` - Root component, manages view state (workspace/settings/tasks)
- `TopBar` - Contains `WorkspacesTabs` for horizontal workspace navigation
- `WorkspaceView` - Main content area with `ResizableSidebar` (changes) + `ContentView`

**State Management**:
- `sidebar-state.ts` - Zustand store for changes sidebar (width, visibility, mode)
- `workspace-view-mode.ts` - Zustand store for Workbench/Review mode per workspace
- `app-state.ts` - Current view, settings section, etc.

**Settings System**:
- Settings stored in SQLite via `packages/local-db/src/schema/schema.ts`
- tRPC routes in `src/lib/trpc/routers/settings/`
- UI in `src/renderer/screens/main/components/SettingsView/BehaviorSettings.tsx`

**Key Files**:
- `src/renderer/screens/main/components/TopBar/index.tsx` - Current TopBar
- `src/renderer/screens/main/components/TopBar/WorkspaceTabs/index.tsx` - Horizontal tabs
- `src/renderer/screens/main/components/WorkspaceView/index.tsx` - Main workspace layout
- `src/renderer/screens/main/components/WorkspaceView/ResizableSidebar/` - Existing sidebar

### Terminology

- **Navigation style**: User preference for workspace display location ("top-bar" or "sidebar")
- **Workspace sidebar**: NEW left panel showing workspaces grouped by project
- **Changes sidebar**: EXISTING left panel showing git changes (file tree)
- **Workbench mode**: Terminal panes + file viewers (mosaic layout)
- **Review mode**: Full-page changes/diff view

---

## Plan of Work

### Milestone 1: Add Navigation Style Setting

Add the setting infrastructure following the existing "confirmOnQuit" pattern.

**1.1 Add setting to database schema**

In `packages/local-db/src/schema/schema.ts`, add to settings table:

    navigationStyle: text("navigation_style").$type<"top-bar" | "sidebar">(),

**1.2 Generate local-db migration**

Run from `packages/local-db`:

    pnpm drizzle-kit generate --name="add_navigation_style"

This creates a migration file in `packages/local-db/drizzle/`. The migration runs automatically on app startup via `apps/desktop/src/main/lib/local-db/index.ts` migrate logic.

**IMPORTANT**: Do NOT use `bun run db:push` - that targets packages/db (Neon/Postgres), not local-db.

**1.3 Add default constant**

In `apps/desktop/src/shared/constants.ts`:

    export const DEFAULT_NAVIGATION_STYLE = "top-bar" as const;
    export type NavigationStyle = "top-bar" | "sidebar";

**1.4 Add tRPC routes**

In `apps/desktop/src/lib/trpc/routers/settings/index.ts`, add:

    getNavigationStyle: publicProcedure.query(async () => {
      const row = getSettings();
      return row.navigationStyle ?? DEFAULT_NAVIGATION_STYLE;
    }),

    setNavigationStyle: publicProcedure
      .input(z.object({ style: z.enum(["top-bar", "sidebar"]) }))
      .mutation(async ({ input }) => {
        localDb.insert(settings)
          .values({ id: 1, navigationStyle: input.style })
          .onConflictDoUpdate({
            target: settings.id,
            set: { navigationStyle: input.style }
          })
          .run();
        return { success: true };
      }),

**1.5 Add UI in BehaviorSettings**

In `apps/desktop/src/renderer/screens/main/components/SettingsView/BehaviorSettings.tsx`, add a toggle/select for "Navigation style" with options "Top bar" and "Sidebar".

### Milestone 2: Create WorkspaceSidebar Component

Create the new sidebar component matching the design.

**2.1 Create store for workspace sidebar state**

Create `apps/desktop/src/renderer/stores/workspace-sidebar-state.ts`:

    interface WorkspaceSidebarState {
      isOpen: boolean;
      width: number;
      // Use string[] instead of Set<string> for JSON serialization with Zustand persist
      collapsedProjectIds: string[];
      toggleOpen: () => void;
      setWidth: (width: number) => void;
      toggleProjectCollapsed: (projectId: string) => void;
      isProjectCollapsed: (projectId: string) => boolean;
    }

**NOTE**: Do NOT use `Set<string>` for `collapsedProjectIds` - Zustand persist uses JSON serialization which drops Sets. Use `string[]` and provide helper methods.

**2.2 Create component structure**

Create folder: `apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/`

Files to create:
- `index.tsx` - Main component
- `WorkspaceSidebarHeader.tsx` - "Workspaces" header with icon
- `ProjectSection/ProjectSection.tsx` - Collapsible project group
- `ProjectSection/ProjectHeader.tsx` - Project name + actions
- `WorkspaceListItem/WorkspaceListItem.tsx` - Individual workspace row
- `WorkspaceListItem/WorkspaceStatusBadge.tsx` - Status badges
- `WorkspaceListItem/WorkspaceDiffStats.tsx` - +/- diff display
- `WorkspaceSidebarFooter.tsx` - "Add project" button

**2.3 WorkspaceListItem design**

Each workspace item displays:
- Left border (project color when active)
- Branch icon (git-branch, git-pull-request, etc. based on type)
- Author/branch: "andreasasprou/feature-name"
- Worktree name + PR info: "worktree-city · PR #123"
- Status badge: "Ready to merge" / "Merge conflicts" / "Uncommitted changes" / "Archive"
- Keyboard shortcut badge: "⌘1"
- Diff stats (for active): "+1850 -301"

**2.4 Data fetching**

Reuse existing queries:
- `trpc.workspaces.getAllGrouped.useQuery()` for project/workspace list
- `trpc.workspaces.getActive.useQuery()` for active workspace

**Diff stats source**: Use `workspaces.getGitHubStatus` (already used by WorkspaceHoverCard) for PR additions/deletions. This is the authoritative source. Do NOT add a new git diff endpoint. For workspaces without PRs, show local uncommitted changes count from the changes router as fallback.

**Performance consideration**: Avoid N+1 `getGitHubStatus` calls per workspace row. Options:
1. Extend `getAllGrouped` to include a summary `githubStatus` field (batched)
2. Reuse cached data from `worktrees.githubStatus` if already fetched
3. Lazy-load status on hover only (simplest, matches current WorkspaceHoverCard behavior)

Recommended: Start with option 3 (lazy-load on hover) to match existing patterns, then optimize with batching if performance is an issue.

**2.5 Extract shared workspace behaviors**

Currently `WorkspacesTabs/index.tsx` owns critical behaviors that must work in BOTH navigation modes:
- ⌘1-9 workspace switching shortcuts
- Auto-create main workspace for new projects effect

Create a shared hook: `apps/desktop/src/renderer/hooks/useWorkspaceShortcuts.ts`

    export function useWorkspaceShortcuts() {
      const { data: groups = [] } = trpc.workspaces.getAllGrouped.useQuery();
      const setActiveWorkspace = useSetActiveWorkspace();
      const createBranchWorkspace = useCreateBranchWorkspace();

      // Flatten workspaces for ⌘1-9 navigation
      const allWorkspaces = groups.flatMap((group) => group.workspaces);

      // ⌘1-9 shortcuts
      useHotkeys(workspaceKeys, handleWorkspaceSwitch);
      useHotkeys(HOTKEYS.PREV_WORKSPACE.keys, handlePrevWorkspace);
      useHotkeys(HOTKEYS.NEXT_WORKSPACE.keys, handleNextWorkspace);

      // Auto-create main workspace for new projects
      useEffect(() => { /* existing logic */ }, [groups]);

      return { allWorkspaces };
    }

Then use this hook in BOTH:
- `WorkspaceSidebar/index.tsx` (sidebar mode)
- `WorkspacesTabs/index.tsx` (top-bar mode)

This ensures shortcuts work regardless of navigation style.

### Milestone 3: Create Sidebar-Mode TopBar Variant

When navigation style is "sidebar", the TopBar should show a unified bar without workspace tabs.

**3.1 Decide on control placement**

Currently, `WorkspaceActionBar` contains:
- ViewModeToggle (Workbench/Review)
- Branch selector
- Open In dropdown

**Decision needed**: In sidebar mode, do these controls:
A) Stay in WorkspaceActionBar (below TopBar) - no duplication, consistent location
B) Move to TopBarSidebarMode - more prominent, frees up vertical space

**Recommendation**: Keep controls in WorkspaceActionBar (option A). This:
- Avoids duplicating components
- Maintains consistent location across modes
- Keeps TopBar focused on navigation

TopBarSidebarMode then only needs:
- Changes sidebar toggle (existing SidebarControl, renamed for clarity)
- Workspace sidebar toggle (new)
- Avatar/user menu

**3.2 Sidebar toggle disambiguation**

With two sidebars, we need clear naming:
- **"Files" / file icon**: Toggle changes sidebar (existing, currently just "sidebar")
- **"Workspaces" / layers icon**: Toggle workspace sidebar (new)

Update tooltips and potentially add labels on hover. Both toggles live in TopBar.

**3.3 Create TopBarSidebarMode component**

Create `apps/desktop/src/renderer/screens/main/components/TopBar/TopBarSidebarMode.tsx`:

Layout (left to right):
- Workspace sidebar toggle (new, tooltip: "Toggle workspaces")
- Changes sidebar toggle (existing SidebarControl, tooltip: "Toggle files")
- [Spacer]
- [Right] Avatar dropdown

The Workbench/Review toggle, branch selector, and Open In dropdown remain in WorkspaceActionBar.

**3.4 Workspace sidebar always-on vs toggleable**

The workspace sidebar should be toggleable (not always-on) because:
- Users may want full-width content when not switching workspaces
- Matches the existing changes sidebar pattern
- Provides flexibility for different screen sizes

Default state: Open (on first use), then persisted via Zustand.

**3.5 Conditional rendering in TopBar**

Modify `apps/desktop/src/renderer/screens/main/components/TopBar/index.tsx`:

    const { data: navigationStyle } = trpc.settings.getNavigationStyle.useQuery();

    if (navigationStyle === "sidebar") {
      return <TopBarSidebarMode />;
    }

    return <TopBarDefault />; // Rename current implementation

### Milestone 4: Wire Up Layout Switching

Connect the setting to conditionally render the appropriate layout.

**4.1 Modify MainScreen layout**

In `apps/desktop/src/renderer/screens/main/index.tsx`, when rendering workspace view:

    const { data: navigationStyle } = trpc.settings.getNavigationStyle.useQuery();

    // In render:
    {navigationStyle === "sidebar" && <WorkspaceSidebar />}
    <WorkspaceView />

**4.2 Modify WorkspaceView**

The `WorkspaceView` component remains largely unchanged - it already has the ResizableSidebar (changes) and ContentView. The WorkspaceSidebar sits to its left.

**4.3 Layout structure in sidebar mode**

    <div className="flex h-full w-full">
      <WorkspaceSidebar />      {/* NEW - workspace navigation */}
      <WorkspaceView />          {/* EXISTING - contains changes sidebar + content */}
    </div>

### Milestone 5: Polish and Validation

**5.1 Keyboard shortcuts**

Ensure ⌘1-9 workspace switching works in both modes. The existing `useHotkeys` in `WorkspacesTabs/index.tsx` should be moved/shared.

**5.2 Hover preview**

Implement hover preview showing branch + PR status. Can reuse `WorkspaceHoverCard` component or adapt it.

**5.3 Animations**

- Smooth sidebar show/hide with Framer Motion
- Collapse/expand project sections with animation
- Active workspace indicator transition

**5.4 Persistence**

- Workspace sidebar width persists (Zustand + localStorage)
- Collapsed project sections persist
- Navigation style persists (SQLite)

---

## Concrete Steps

All commands run from repository root: `/Users/andreasasprou/.superset/worktrees/superset/workspace-sidebar`

**Step 1: Verify current state**

    cd apps/desktop
    bun run typecheck

Expected: No type errors (baseline)

**Step 2: Add database schema field and generate migration**

Edit `packages/local-db/src/schema/schema.ts` to add `navigationStyle` column.

    cd packages/local-db
    pnpm drizzle-kit generate --name="add_navigation_style"

Expected: Migration file created in `packages/local-db/drizzle/`

The migration runs automatically on app startup. Do NOT use `bun run db:push` (that's for Neon/Postgres).

**Step 3: Add setting routes**

Edit `apps/desktop/src/lib/trpc/routers/settings/index.ts`

    bun run typecheck

Expected: Types pass with new routes

**Step 4: Create WorkspaceSidebar component**

Create component files as specified in Milestone 2.

**Step 5: Add to layout**

Wire up conditional rendering in MainScreen.

    bun dev

Expected: App starts, can toggle setting, layout switches

**Step 6: Full validation**

    bun run lint:fix
    bun run typecheck
    bun test

Expected: All pass

---

## Validation and Acceptance

### Manual Testing Checklist

1. **Setting toggle works**
   - Open Settings > Behavior
   - See "Navigation style" option
   - Toggle between "Top bar" and "Sidebar"
   - Layout changes immediately (or after brief transition)

2. **Sidebar mode displays correctly**
   - WorkspaceSidebar appears on left
   - Projects shown as collapsible sections
   - Workspaces listed under each project
   - Active workspace has colored left border
   - Status badges visible
   - Diff stats visible for active workspace
   - ⌘1-9 shortcuts displayed

3. **Interactions work**
   - Click workspace to switch
   - Click project header to collapse/expand
   - Hover shows preview card
   - ⌘1-9 switches workspaces
   - "+ New workspace" opens creation dialog
   - "Add project" opens project creation

4. **TopBar adapts**
   - In sidebar mode: No workspace tabs, unified bar with Workbench/Review toggle
   - In top-bar mode: Original layout preserved

5. **Persistence**
   - Close and reopen app
   - Navigation style preserved
   - Sidebar widths preserved
   - Collapsed projects preserved

6. **Both sidebars coexist**
   - Workspace sidebar (left)
   - Changes sidebar (right of workspace sidebar)
   - Both independently resizable
   - Both can be toggled independently

---

## Idempotence and Recovery

- Database schema changes are additive (new nullable column)
- Running `db:push` multiple times is safe
- Component files are new additions, no destructive changes
- Setting defaults to "top-bar" if not set (backwards compatible)
- If implementation fails partway, the existing top-bar mode continues working

---

## Artifacts and Notes

### Component File Structure

    apps/desktop/src/renderer/
    ├── hooks/
    │   └── useWorkspaceShortcuts.ts (new - shared ⌘1-9 + auto-create logic)
    ├── screens/main/components/
    │   ├── WorkspaceSidebar/
    │   │   ├── index.tsx
    │   │   ├── WorkspaceSidebarHeader.tsx
    │   │   ├── WorkspaceSidebarFooter.tsx
    │   │   ├── ResizableWorkspaceSidebar.tsx (wrapper with resize handle)
    │   │   ├── ProjectSection/
    │   │   │   ├── ProjectSection.tsx
    │   │   │   ├── ProjectHeader.tsx
    │   │   │   └── index.ts
    │   │   └── WorkspaceListItem/
    │   │       ├── WorkspaceListItem.tsx
    │   │       ├── WorkspaceStatusBadge.tsx
    │   │       ├── WorkspaceDiffStats.tsx
    │   │       └── index.ts
    │   └── TopBar/
    │       ├── index.tsx (modified - conditional render)
    │       ├── TopBarSidebarMode.tsx (new)
    │       ├── TopBarDefault.tsx (renamed from inline JSX)
    │       ├── SidebarControl.tsx (updated tooltip: "Toggle files")
    │       ├── WorkspaceSidebarControl.tsx (new - "Toggle workspaces")
    │       └── ... (existing files)
    └── stores/
        └── workspace-sidebar-state.ts (new)

### State Structure

    // workspace-sidebar-state.ts (Zustand + persist)
    {
      isOpen: true,
      width: 280,  // pixels
      collapsedProjectIds: ["project-id-1", "project-id-2"],  // string[] NOT Set<string>
    }

    // settings table (SQLite via local-db)
    {
      navigationStyle: "sidebar" | "top-bar"
    }

**Important**: Use `string[]` for `collapsedProjectIds`, not `Set<string>`. Zustand persist uses JSON serialization which drops Sets.

---

## Interfaces and Dependencies

### New tRPC Routes

In `apps/desktop/src/lib/trpc/routers/settings/index.ts`:

    getNavigationStyle: publicProcedure.query(() => NavigationStyle)
    setNavigationStyle: publicProcedure.input({ style: NavigationStyle }).mutation()

### New Zustand Store

In `apps/desktop/src/renderer/stores/workspace-sidebar-state.ts`:

    export const useWorkspaceSidebarStore = create<WorkspaceSidebarState>()(
      devtools(
        persist(
          (set, get) => ({
            isOpen: true,
            width: 280,
            collapsedProjectIds: [],  // string[] for JSON serialization

            toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),

            setWidth: (width) => set({ width }),

            toggleProjectCollapsed: (projectId) =>
              set((s) => ({
                collapsedProjectIds: s.collapsedProjectIds.includes(projectId)
                  ? s.collapsedProjectIds.filter((id) => id !== projectId)
                  : [...s.collapsedProjectIds, projectId],
              })),

            isProjectCollapsed: (projectId) =>
              get().collapsedProjectIds.includes(projectId),
          }),
          { name: "workspace-sidebar-store" }
        )
      )
    );

### New Shared Hook

In `apps/desktop/src/renderer/hooks/useWorkspaceShortcuts.ts`:

    export function useWorkspaceShortcuts() {
      // Extract from WorkspacesTabs: ⌘1-9 shortcuts + auto-create logic
      // Used by BOTH WorkspaceSidebar and WorkspacesTabs
    }

### Component Props

    interface WorkspaceListItemProps {
      workspace: {
        id: string;
        name: string;
        branch: string;
        worktreePath: string;
        type: "worktree" | "branch";
        projectId: string;
      };
      project: {
        id: string;
        name: string;
        color: string;
      };
      isActive: boolean;
      index: number;  // for ⌘N shortcut display
      onSelect: () => void;
      onHover: () => void;
    }

---

## Dependencies on External Data

The following data is needed for full feature parity with the design:

1. **PR Status + Diff Stats** - Available via `workspaces.getGitHubStatus` (already used by WorkspaceHoverCard)
   - This is the authoritative source for PR additions/deletions
   - Do NOT add a new git diff endpoint

2. **Workspace Status** (uncommitted changes) - Available via changes router
   - Fallback for workspaces without PRs

3. **GitHub Author/Branch** - Extract from PR branch name or remote tracking branch
   - Already available in workspace data

**Performance strategy**: Lazy-load status on hover (matching WorkspaceHoverCard behavior). If batching is needed later, extend `getAllGrouped` to include summary status.
