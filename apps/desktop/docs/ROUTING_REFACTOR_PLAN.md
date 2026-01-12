# Desktop App Routing Refactor

**Status:** In Progress (Implementation Started)
**Date:** 2026-01-09 (updated 2026-01-12)
**Author:** Team Discussion
**Last Update:** Added expanded TasksView structure (40+ files added since initial plan)

## Reference Point

**Original Repo State (Pre-Refactor):**
- **Git Tag:** `pre-router-refactor-20260112`
- **Commit Hash:** `7eb652e6ee54f6f79d570de97ff6dc3c93f773ba`
- **Physical Copy:** `/tmp/superset-desktop-pre-refactor` (cloned at pre-refactor state for easy cross-reference)
- **Original Structure:** `/tmp/superset-desktop-pre-refactor/apps/desktop/src/renderer/screens/main/`
- **Compare Command:** `git diff pre-router-refactor-20260112 HEAD`
- **Checkout Original:** `git checkout pre-router-refactor-20260112` (or reference `/tmp/superset-desktop-pre-refactor`)

## Acceptance Criteria

✅ **Functionality Parity:** All features from original repo work identically (or are improved using the new router)
✅ **Router-Based Navigation:** Uses TanStack Router for all navigation (no view switching)
✅ **File-Based Routing:** Routes defined by folder structure in `routes/`
✅ **Proper Co-location:** All components follow AGENTS.md co-location rules
✅ **No Breaking Changes:** Existing workflows, hotkeys, and user flows unchanged
✅ **Test Coverage:** All routes navigable, deep linking works, back/forward buttons work

## Problem Statement

The desktop app currently uses a view-switching pattern with global state (`currentView: "workspace" | "settings" | "tasks" | "workspaces-list"`), which creates several issues:

1. ❌ **Everything is coupled** - Can't change one view without affecting others
2. ❌ **No code splitting** - All 4 views load even if you only use workspace
3. ❌ **Custom navigation** - Reinventing what React Router does
4. ❌ **No URL-based navigation** - Can't deep link, share URLs, or use browser back/forward
5. ❌ **Hard to test** - Everything depends on global state
6. ❌ **Provider bloat** - Providers wrap everything even when not needed (e.g., CollectionsProvider blocking sign-in page)
7. ❌ **Hard to reason about** - What renders when? What state is needed where?
8. ❌ **Violates repo conventions** - Desktop app is the only app not following co-location rules from AGENTS.md

**Current usage:** `app-state.ts` navigation helpers used in **121 locations across 25 files**.

## Solution: TanStack Router with Next.js App Router Conventions

Migrate to **TanStack Router** with file-based routing using **Next.js app router conventions**:
- Route groups `_authenticated/` for layout co-location (underscore prefix = no URL segment)
- `page.tsx` for route components (via `indexToken: 'page'`)
- `layout.tsx` for nested layouts (via `routeToken: 'layout'`)
- Auto code splitting via Vite plugin
- Generated route tree with full TypeScript safety
- Co-located components following repo rules

## Proposed Folder Structure (Following Strict Co-location)

```
src/renderer/
├── routes/                                 # TanStack Router file-based routes
│   ├── __root.tsx                          # Root layout (required by TanStack)
│   │
│   ├── index/
│   │   └── page.tsx                        # "/" - root redirect
│   │
│   ├── sign-in/
│   │   ├── page.tsx                        # "/sign-in" route
│   │   └── components/                     # Used ONLY in sign-in
│   │       └── SignInForm/
│   │           ├── SignInForm.tsx
│   │           └── index.ts
│   │
│   └── _authenticated/                     # Route group (underscore = NOT in URL path)
│       ├── layout.tsx                      # AuthenticatedLayout wraps ALL children
│       │
│       ├── components/                     # Shared by 2+ authenticated routes
│       │   ├── Background/
│       │   │   ├── Background.tsx
│       │   │   └── index.ts
│       │   ├── AppFrame/
│       │   │   ├── AppFrame.tsx
│       │   │   └── index.ts
│       │   ├── WorkspaceInitEffects/       # Used in layout
│       │   │   ├── WorkspaceInitEffects.tsx
│       │   │   └── index.ts
│       │   ├── SetupConfigModal/           # Modal rendered in layout
│       │   │   ├── SetupConfigModal.tsx
│       │   │   ├── index.ts
│       │   │   └── stores/
│       │   │       └── config-modal.ts
│       │   └── NewWorkspaceModal/          # Modal rendered in layout
│       │       ├── NewWorkspaceModal.tsx
│       │       ├── index.ts
│       │       └── stores/
│       │           └── new-workspace-modal.ts
│       │
│       ├── providers/                      # Used ONLY in _authenticated/layout.tsx
│       │   ├── CollectionsProvider/
│       │   │   ├── CollectionsProvider.tsx
│       │   │   ├── collections.ts
│       │   │   └── index.ts
│       │   └── OrganizationsProvider/
│       │       ├── OrganizationsProvider.tsx
│       │       └── index.ts
│       │
│       ├── stores/                         # Shared by 2+ authenticated routes
│       │   └── workspace-init.ts           # Used by layout + WorkspaceView
│       │
│       ├── workspace/
│       │   ├── page.tsx                    # "/workspace" - selector (shows StartView)
│       │   │
│       │   ├── components/                 # Used by /workspace selector page
│       │   │   └── StartView/
│       │   │       ├── StartView.tsx
│       │   │       ├── index.ts
│       │   │       └── components/         # StartView children
│       │   │           ├── CloneRepoDialog/
│       │   │           └── InitGitDialog/
│       │   │
│       │   └── $id/                        # "/workspace/:id" - specific workspace ($ = dynamic)
│       │       ├── page.tsx
│       │       │
│       │       ├── components/             # Used ONLY by this workspace page
│       │       │   ├── TopBar/
│       │       │   │   ├── TopBar.tsx
│       │       │   │   ├── index.ts
│       │       │   │   └── components/     # Used ONLY by TopBar
│       │       │   │       ├── WorkspaceSelector/
│       │       │   │       ├── TabStrip/
│       │       │   │       └── SidebarControl/
│       │       │   ├── WorkspaceSidebar/
│       │       │   │   ├── WorkspaceSidebar.tsx
│       │       │   │   ├── index.ts
│       │       │   │   └── components/     # Used ONLY by WorkspaceSidebar
│       │       │   │       ├── WorkspaceListItem/
│       │       │   │       ├── ProjectSection/
│       │       │   │       └── PortsList/
│       │       │   ├── WorkspaceContent/
│       │       │   │   ├── WorkspaceContent.tsx
│       │       │   │   ├── index.ts
│       │       │   │   └── components/
│       │       │   │       ├── Sidebar/
│       │       │   │   │   └── ContentView/
│       │       │   └── ResizablePanel/
│       │       │       ├── ResizablePanel.tsx
│       │       │       └── index.ts
│       │       │
│       │       ├── stores/                 # Used ONLY in workspace page
│       │       │   ├── tabs/               # Tab/pane management
│       │       │   │   ├── store.ts
│       │       │   │   ├── types.ts
│       │       │   │   └── utils.ts
│       │       │   ├── sidebar-state.ts    # Workspace left sidebar (changes)
│       │       │   ├── workspace-sidebar-state.ts  # Workspace right sidebar
│       │       │   └── chat-panel-state.ts
│       │       │
│       │       └── hooks/                  # Used ONLY in workspace page
│       │           └── useWorkspaceHotkeys/
│       │
│       ├── tasks/
│       │   ├── page.tsx                    # "/tasks" route (TasksView.tsx)
│       │   │
│       │   ├── components/                 # Used ONLY in tasks
│       │   │   ├── TasksTableView/
│       │   │   │   ├── TasksTableView.tsx
│       │   │   │   ├── index.ts
│       │   │   │   └── components/
│       │   │   │       └── TaskContextMenu/
│       │   │   │           ├── TaskContextMenu.tsx
│       │   │   │           └── index.ts
│       │   │   ├── TasksTopBar/
│       │   │   │   ├── TasksTopBar.tsx
│       │   │   │   └── index.ts
│       │   │   └── shared/                 # Shared by TasksTableView components
│       │   │       ├── AssigneeMenuItems.tsx
│       │   │       ├── PriorityMenuItems.tsx
│       │   │       ├── StatusMenuItems.tsx
│       │   │       ├── PriorityIcon/
│       │   │       │   ├── PriorityIcon.tsx
│       │   │       │   └── index.ts
│       │   │       ├── StatusIcon/
│       │   │       │   ├── StatusIcon.tsx
│       │   │       │   ├── constants.ts
│       │   │       │   └── index.ts
│       │   │       └── icons/
│       │   │           ├── ActiveIcon/
│       │   │           │   ├── ActiveIcon.tsx
│       │   │           │   └── index.ts
│       │   │           ├── AllIssuesIcon/
│       │   │           │   ├── AllIssuesIcon.tsx
│       │   │           │   └── index.ts
│       │   │           ├── AssigneeMenuIcon/
│       │   │           │   ├── AssigneeMenuIcon.tsx
│       │   │           │   └── index.ts
│       │   │           ├── BacklogIcon/
│       │   │           │   ├── BacklogIcon.tsx
│       │   │           │   └── index.ts
│       │   │           └── PriorityMenuIcon/
│       │   │               ├── PriorityMenuIcon.tsx
│       │   │               └── index.ts
│       │   │
│       │   ├── hooks/                      # Used ONLY in tasks
│       │   │   ├── useHybridSearch/
│       │   │   │   ├── useHybridSearch.ts
│       │   │   │   └── index.ts
│       │   │   └── useTasksTable/
│       │   │       ├── useTasksTable.tsx
│       │   │       ├── index.ts
│       │   │       └── components/         # Table cell components
│       │   │           ├── AssigneeCell/
│       │   │           │   ├── AssigneeCell.tsx
│       │   │           │   └── index.ts
│       │   │           ├── LabelsCell/
│       │   │           │   ├── LabelsCell.tsx
│       │   │           │   └── index.ts
│       │   │           ├── PriorityCell/
│       │   │           │   ├── PriorityCell.tsx
│       │   │           │   └── index.ts
│       │   │           └── StatusCell/
│       │   │               ├── StatusCell.tsx
│       │   │               └── index.ts
│       │   │
│       │   └── utils/                      # Used ONLY in tasks
│       │       └── sorting/
│       │           ├── sorting.ts
│       │           └── index.ts
│       │
│       ├── workspaces/
│       │   ├── page.tsx                    # "/workspaces" route (list view)
│       │   └── components/                 # Used ONLY in workspaces list
│       │       └── WorkspaceCard/
│       │
│       └── settings/
│           ├── layout.tsx                  # SettingsLayout (nested inside authenticated)
│           ├── page.tsx                    # "/settings" - redirects to /settings/account
│           │
│           ├── components/                 # Shared by ALL settings pages
│           │   ├── SettingsSidebar/
│           │   │   ├── SettingsSidebar.tsx
│           │   │   └── index.ts
│           │   └── SettingsSection/
│           │       ├── SettingsSection.tsx
│           │       └── index.ts
│           │
│           ├── account/
│           │   └── page.tsx                # "/settings/account"
│           ├── workspace/
│           │   └── page.tsx                # "/settings/workspace"
│           ├── keyboard/
│           │   └── page.tsx                # "/settings/keyboard"
│           ├── appearance/
│           │   └── page.tsx                # "/settings/appearance"
│           ├── behavior/
│           │   └── page.tsx                # "/settings/behavior"
│           └── presets/
│               └── page.tsx                # "/settings/presets"

├── components/                             # TRULY global (used at root level)
│   ├── PostHogUserIdentifier/              # Used in index.tsx
│   ├── UpdateToast/                        # Rendered at root
│   └── ThemedToaster/                      # Rendered at root

├── contexts/                               # Root-level providers (composed in index.tsx)
│   ├── TRPCProvider/
│   ├── PostHogProvider/
│   └── MonacoProvider/

├── stores/                                 # TRULY global stores (used across multiple routes)
│   └── hotkeys/                            # Global hotkeys (used in 27+ places)
│       ├── store.ts
│       └── constants.ts

├── hooks/                                  # TRULY global hooks (used at root level)
│   ├── useVersionCheck/                    # Used in root routes check
│   └── useUpdateListener/                  # Used at root level

└── lib/                                    # Shared utilities
    ├── trpc.ts                             # Used everywhere
    ├── dnd.ts                              # DragDropManager (used in root index.tsx)
    └── sentry.ts                           # Used in index.tsx
```

### Key Co-location Changes

**What Moved:**
1. ✅ **CollectionsProvider & OrganizationsProvider** → `routes/_authenticated/providers/` (used ONLY in authenticated layout)
2. ✅ **SetupConfigModal & NewWorkspaceModal** → `routes/_authenticated/components/` (rendered ONLY in authenticated layout)
3. ✅ **Modal stores** → Next to their respective modal components in `components/*/stores/`
4. ✅ **StartView** → `routes/_authenticated/workspace/components/` (used ONLY by `/workspace` selector page)
5. ✅ **TopBar, WorkspaceSidebar, WorkspaceContent, etc** → `routes/_authenticated/workspace/$id/components/` (used ONLY by specific workspace page)
6. ✅ **TabsStore** → `routes/_authenticated/workspace/$id/stores/tabs/` (used ONLY in workspace page)
7. ✅ **sidebar-state.ts, workspace-sidebar-state.ts, chat-panel-state.ts** → `routes/_authenticated/workspace/$id/stores/` (workspace page specific)
8. ✅ **workspace-init.ts** → `routes/_authenticated/stores/` (shared by layout + workspace, not workspace-only)

**What Stayed Global:**
- ✅ **stores/hotkeys/** - Used in 27+ places across all routes
- ✅ **hooks/useVersionCheck** - Used at root level for version blocking
- ✅ **hooks/useUpdateListener** - Used at root level
- ✅ **PostHogProvider, TRPCProvider, MonacoProvider, DndProvider** - Root-level providers (composed in index.tsx)
- ✅ **lib/** utilities - Shared infrastructure (trpc, dnd, sentry)

**What Got Deleted:**
- ❌ **contexts/AppProviders/** - No longer needed, compose providers directly in index.tsx instead
- ❌ **routes.tsx** - No longer needed, TanStack Router auto-generates route tree
- ❌ **lib/electron-router-dom.ts** - No longer needed, using TanStack Router directly

## Route Groups & File-Based Routing

**`_authenticated/`** is a **route group** (underscore prefix):
- ✅ **Not in URL path** - `/workspace` not `/_authenticated/workspace`
- ✅ **Co-locates layout** - `layout.tsx` wraps all children
- ✅ **Shares components** - `components/` folder shared by all routes in group
- ✅ **Clear boundaries** - Everything inside needs auth

**Dynamic routes** use `$` prefix:
- `$id/page.tsx` → `/workspace/:id` route with `params.id` available

**File naming via plugin config:**
- `indexToken: 'page'` → Use `page.tsx` instead of `index.tsx`
- `routeToken: 'layout'` → Use `layout.tsx` instead of `route.tsx`
- This matches Next.js conventions exactly!

## Layout Hierarchy

```
index.tsx (root entry)
  └─ PostHogProvider
      └─ TRPCProvider
          └─ MonacoProvider
              └─ DndProvider
                  └─ <RouterProvider router={router}>
                      │
                      └─ routes/__root.tsx (app shell)
                          │
                          ├─ "/" → routes/index/page.tsx (redirect)
                          │
                          ├─ "/sign-in" → routes/sign-in/page.tsx
                          │
                          └─ routes/_authenticated/layout.tsx
                              └─ CollectionsProvider
                                  └─ OrganizationsProvider
                                      └─ Background + AppFrame
                                          │
                                          ├─ "/workspace" → workspace/page.tsx (selector)
                                          │
                                          ├─ "/workspace/:id" → workspace/$id/page.tsx
                                          │
                                          ├─ "/tasks" → tasks/page.tsx
                                          │
                                          ├─ "/workspaces" → workspaces/page.tsx
                                          │
                                          └─ settings/layout.tsx
                                              └─ SettingsSidebar wrapper
                                                  │
                                                  ├─ "/settings/account" → account/page.tsx
                                                  ├─ "/settings/workspace" → workspace/page.tsx
                                                  ├─ "/settings/keyboard" → keyboard/page.tsx
                                                  ├─ "/settings/appearance" → appearance/page.tsx
                                                  ├─ "/settings/behavior" → behavior/page.tsx
                                                  └─ "/settings/presets" → presets/page.tsx
```

## Example Implementation

### index.tsx (Root Entry)

```tsx
import { initSentry } from "./lib/sentry";
initSentry();

import ReactDom from "react-dom/client";
import { StrictMode } from "react";
import { RouterProvider, createHashHistory, createRouter } from "@tanstack/react-router";
import { DndProvider } from "react-dnd";
import { dragDropManager } from "./lib/dnd";
import { PostHogProvider } from "./contexts/PostHogProvider";
import { TRPCProvider } from "./contexts/TRPCProvider";
import { MonacoProvider } from "./contexts/MonacoProvider";
import { PostHogUserIdentifier } from "./components/PostHogUserIdentifier";
import { ThemedToaster } from "./components/ThemedToaster";
import { routeTree } from "./routeTree.gen"; // Auto-generated by Vite plugin
import "./globals.css";

// Create hash history for Electron file:// protocol compatibility
const hashHistory = createHashHistory();
const router = createRouter({ routeTree, history: hashHistory });

// Register router for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.querySelector("app")!;
ReactDom.createRoot(rootElement).render(
  <StrictMode>
    <PostHogProvider>
      <TRPCProvider>
        <PostHogUserIdentifier />
        <MonacoProvider>
          <DndProvider manager={dragDropManager}>
            <RouterProvider router={router} />
            <ThemedToaster />
          </DndProvider>
        </MonacoProvider>
      </TRPCProvider>
    </PostHogProvider>
  </StrictMode>
);
```

### routes/__root.tsx (Required Root Layout)

```tsx
import { createRootRoute, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: () => <Outlet />, // All routes render through here
});
```

### routes/_authenticated/layout.tsx

```tsx
import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
import { trpc } from "renderer/lib/trpc";
import { CollectionsProvider } from "./providers/CollectionsProvider";
import { OrganizationsProvider } from "./providers/OrganizationsProvider";
import { Background } from "./components/Background";
import { AppFrame } from "./components/AppFrame";
import { WorkspaceInitEffects } from "./components/WorkspaceInitEffects";
import { SetupConfigModal } from "./components/SetupConfigModal";
import { NewWorkspaceModal } from "./components/NewWorkspaceModal";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { data: authState } = trpc.auth.getState.useQuery();
  const isSignedIn = !!process.env.SKIP_ENV_VALIDATION || (authState?.isSignedIn ?? false);

  if (!isSignedIn) {
    return <Navigate to="/sign-in" replace />;
  }

  return (
    <CollectionsProvider>
      <OrganizationsProvider>
        <Background />
        <AppFrame>
          <Outlet /> {/* workspace, tasks, workspaces, settings render here */}
        </AppFrame>
        <SetupConfigModal />
        <NewWorkspaceModal />
        <WorkspaceInitEffects />
      </OrganizationsProvider>
    </CollectionsProvider>
  );
}
```

### routes/_authenticated/workspace/page.tsx (Selector)

```tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { trpc } from "renderer/lib/trpc";
import { StartView } from "./components/StartView";

export const Route = createFileRoute("/_authenticated/workspace/")({
  component: WorkspaceSelectorPage,
});

function WorkspaceSelectorPage() {
  const navigate = useNavigate();
  const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();

  useEffect(() => {
    if (activeWorkspace?.id) {
      navigate({ to: "/workspace/$id", params: { id: activeWorkspace.id }, replace: true });
    }
  }, [activeWorkspace?.id, navigate]);

  return activeWorkspace ? <LoadingSpinner /> : <StartView />;
}
```

### routes/_authenticated/workspace/$id/page.tsx

```tsx
import { createFileRoute, Navigate, useParams } from "@tanstack/react-router";
import { trpc } from "renderer/lib/trpc";
import { TopBar } from "./components/TopBar";
import { WorkspaceSidebar } from "./components/WorkspaceSidebar";
import { WorkspaceContent } from "./components/WorkspaceContent";
import { ResizablePanel } from "./components/ResizablePanel";
import { useWorkspaceSidebarStore } from "./stores/workspace-sidebar-state";

export const Route = createFileRoute("/_authenticated/workspace/$id")({
  component: WorkspacePage,
});

function WorkspacePage() {
  const { id } = Route.useParams(); // Type-safe params!
  const { data: workspace } = trpc.workspaces.getById.useQuery({ id });
  const { isOpen, width, setWidth } = useWorkspaceSidebarStore();

  if (!workspace) return <Navigate to="/workspace" replace />;

  return (
    <>
      <TopBar />
      {isOpen && <ResizablePanel><WorkspaceSidebar /></ResizablePanel>}
      <WorkspaceContent />
    </>
  );
}
```

### routes/_authenticated/settings/layout.tsx

```tsx
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SettingsSidebar } from "./components/SettingsSidebar";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsLayout,
});

function SettingsLayout() {
  return (
    <div className="flex h-full">
      <SettingsSidebar />
      <div className="flex-1">
        <Outlet /> {/* account, workspace, keyboard sections render here */}
      </div>
    </div>
  );
}
```

## Route Tree Generation

**No manual route file needed!** TanStack Router's Vite plugin auto-generates `routeTree.gen.ts` from your `routes/` folder structure.

The plugin watches your file structure:
```
routes/
├── __root.tsx              → Root route
├── index/page.tsx          → "/" route
├── sign-in/page.tsx        → "/sign-in" route
└── _authenticated/
    ├── layout.tsx          → Layout wrapper (no URL segment)
    ├── workspace/
    │   ├── page.tsx        → "/workspace" route
    │   └── $id/page.tsx    → "/workspace/:id" route
    └── settings/
        ├── layout.tsx      → Nested layout
        └── account/page.tsx → "/settings/account" route
```

And generates a fully typed route tree in `routeTree.gen.ts`:
```typescript
// Auto-generated - DO NOT EDIT
export const routeTree = rootRoute.addChildren([
  indexRoute,
  signInRoute,
  authenticatedRoute.addChildren([
    workspaceRoute,
    workspaceIdRoute,
    settingsRoute.addChildren([
      settingsAccountRoute,
      // ...
    ])
  ])
])
```

**Benefits:**
- ✅ Full TypeScript autocomplete for routes
- ✅ Type-safe params extraction (`Route.useParams()`)
- ✅ Automatic code splitting per route
- ✅ No manual route registration needed

## Workspace Routing Behavior

### Routes

1. **`/workspace`** (Workspace Selector Page)
   - Queries for last active workspace
   - If workspace exists → auto-navigates to `/workspace/:id`
   - If no workspace → shows StartView (create/clone UI)
   - This is where users land when opening app without deep link

2. **`/workspace/:id`** (Specific Workspace Page)
   - Shows the full workspace UI (TopBar, Sidebar, Content)
   - If workspace ID invalid → redirects back to `/workspace`
   - This is the main workspace view

### Workspace Switching

Clicking a workspace in sidebar:
```tsx
// Before: Updates global state
setActiveWorkspace(workspaceId);

// After: Type-safe navigation
navigate({ to: "/workspace/$id", params: { id: workspaceId } });
```

Browser back/forward now works to switch between workspaces!

## Navigation Changes

### Before (View Switching)

```tsx
import { useOpenSettings, useOpenTasks } from "renderer/stores/app-state";

const openSettings = useOpenSettings();
openSettings("keyboard");

const openTasks = useOpenTasks();
openTasks();
```

### After (TanStack Router - Type-Safe!)

```tsx
import { useNavigate } from "@tanstack/react-router";

const navigate = useNavigate();

// Navigate to routes (type-checked!)
navigate({ to: "/settings/keyboard" });
navigate({ to: "/tasks" });

// Navigate with params (also type-checked!)
navigate({ to: "/workspace/$id", params: { id: workspaceId } });

// Or use the simpler string syntax for parameterless routes
navigate({ to: "/settings/keyboard" });
```

## State Changes

### stores/app-state.ts

**REMOVE** (or heavily reduce):
- `currentView: AppView`
- `isSettingsTabOpen: boolean`
- `isTasksTabOpen: boolean`
- `isWorkspacesListOpen: boolean`
- `setView: (view: AppView) => void`
- `openSettings: (section?: SettingsSection) => void`
- `closeSettings: () => void`
- `openTasks: () => void`
- `closeTasks: () => void`
- All view navigation methods

**KEEP** (or delete entirely if not needed):
- Potentially nothing - URL is source of truth

### What Gets Co-located (No Longer Global)

**Moved to `routes/_authenticated/workspace/$id/stores/`:**
- ❌ `stores/tabs/` → Workspace page only (tab/pane management)
- ❌ `stores/sidebar-state.ts` → Workspace page only (left sidebar UI)
- ❌ `stores/workspace-sidebar-state.ts` → Workspace page only (right sidebar UI)
- ❌ `stores/chat-panel-state.ts` → Workspace page only

**Moved to `routes/_authenticated/stores/`:**
- ❌ `stores/workspace-init.ts` → Shared by authenticated layout + workspace

**Moved to `routes/_authenticated/components/SetupConfigModal/stores/`:**
- ❌ `stores/config-modal.ts` → Used only by SetupConfigModal

**Moved to `routes/_authenticated/components/NewWorkspaceModal/stores/`:**
- ❌ `stores/new-workspace-modal.ts` → Used only by NewWorkspaceModal

**Moved to `routes/_authenticated/providers/`:**
- ❌ `contexts/CollectionsProvider/` → Used only in authenticated layout
- ❌ `contexts/OrganizationsProvider/` → Used only in authenticated layout

### What Actually Stays Global

- ✅ `stores/hotkeys/` - Global hotkeys (used in 27+ places across all routes)
- ✅ `hooks/useVersionCheck/` - Root-level version blocking
- ✅ `hooks/useUpdateListener/` - Root-level update notifications
- ✅ `contexts/TRPCProvider/` - Root-level API client (composed in index.tsx)
- ✅ `contexts/PostHogProvider/` - Root-level analytics (composed in index.tsx)
- ✅ `contexts/MonacoProvider/` - Root-level editor engine (composed in index.tsx)
- ✅ `lib/` - Shared utilities (trpc, dnd, electron-router-dom)

### Important: Store Lifecycle

**All stores moved to route folders remain global Zustand singletons.**

Moving stores like `tabs/`, `sidebar-state.ts`, etc. to `routes/_authenticated/workspace/$id/stores/` is **purely for co-location** - it doesn't change their behavior:

- ✅ Stores persist across route changes (combined with zustand persist middleware)
- ✅ Tabs for workspace A remain in memory when navigating to workspace B
- ✅ Store imports work from any route (not route-scoped)
- ✅ State survives component unmounting

The file movement is about organizing code near its primary usage location, not functional scoping.

**Deleted:**
- ❌ `contexts/AppProviders/` - No longer needed, compose providers directly in index.tsx
- ❌ `routes.tsx` - No longer needed, TanStack Router auto-generates route tree
- ❌ `lib/electron-router-dom.ts` - No longer needed, using TanStack Router directly

## Critical Migration Items

### 1. Agent Hook Listener Navigation

**File:** `stores/tabs/useAgentHookListener.ts`

**What it does:** Listens for agent lifecycle events (start/stop/permission) and notification clicks. When you click a notification toast to focus a tab, it navigates you to that workspace and focuses the correct tab/pane.

**Migration required (lines 101-103):**

```typescript
// Before:
if (appState.currentView !== "workspace") {
  appState.setView("workspace");
}
setActiveWorkspace.mutate({ id: workspaceId }, { /* ... */ });

// After:
import { useNavigate } from "@tanstack/react-router";

const navigate = useNavigate();
// Navigate to workspace, setActiveWorkspace.mutate handles the rest
navigate({ to: "/workspace/$id", params: { id: workspaceId } });
setActiveWorkspace.mutate({ id: workspaceId }, { /* ... */ });
```

**Where to call:** Move hook call from `screens/main/index.tsx` to `routes/_authenticated/layout.tsx` (needs to listen regardless of which route you're on).

### 2. Workspace Hotkeys

**File:** `screens/main/index.tsx` (lines 128-253)

**What they do:** 5 workspace-specific hotkeys for splitting panes and toggling sidebars:
- `TOGGLE_SIDEBAR` - Toggle changes panel (left sidebar)
- `TOGGLE_WORKSPACE_SIDEBAR` - Toggle workspace sidebar (right)
- `SPLIT_AUTO` - Smart split based on pane dimensions
- `SPLIT_RIGHT` - Split pane vertically
- `SPLIT_DOWN` - Split pane horizontally

**Migration:** Extract to `routes/_authenticated/workspace/$id/hooks/useWorkspaceHotkeys.ts` and call from `WorkspacePage` component. Hotkeys automatically become scoped to workspace route (only active when route is mounted).

```typescript
// routes/_authenticated/workspace/$id/hooks/useWorkspaceHotkeys.ts
export function useWorkspaceHotkeys() {
  const toggleSidebar = useSidebarStore((s) => s.toggleSidebar);
  const { isOpen, setOpen, toggleCollapsed } = useWorkspaceSidebarStore();
  // ... get state from stores

  const resolveSplitTarget = useCallback(/* ... helper for split ops */);

  useAppHotkey("TOGGLE_SIDEBAR", () => toggleSidebar());
  useAppHotkey("TOGGLE_WORKSPACE_SIDEBAR", () => {
    if (!isOpen) setOpen(true);
    else toggleCollapsed();
  });
  useAppHotkey("SPLIT_AUTO", () => { /* uses resolveSplitTarget */ });
  useAppHotkey("SPLIT_RIGHT", () => { /* ... */ });
  useAppHotkey("SPLIT_DOWN", () => { /* ... */ });
}

// routes/_authenticated/workspace/$id/page.tsx
function WorkspacePage() {
  useWorkspaceHotkeys(); // ← Automatically scoped to this route
  // ... rest of page
}
```

## Migration Steps

### Phase 0: Install Dependencies (15 min)
1. Install TanStack Router: `bun add @tanstack/react-router`
2. Install Vite plugin: `bun add -D @tanstack/router-plugin`
3. Remove old deps: `bun remove electron-router-dom react-router-dom`
4. Configure Vite plugin in `electron.vite.config.ts`:
   ```ts
   import { TanStackRouterVite } from "@tanstack/router-plugin/vite";

   renderer: {
     plugins: [
       TanStackRouterVite({
         routesDirectory: "./src/renderer/routes",
         generatedRouteTree: "./src/renderer/routeTree.gen.ts",
         indexToken: "page",      // Use page.tsx
         routeToken: "layout",    // Use layout.tsx
         autoCodeSplitting: true, // Auto lazy load routes
       }),
       react(),
     ]
   }
   ```

### Phase 1: Create Route Structure (1-2 hours)
1. Create `routes/` folder
2. Create `routes/__root.tsx` (required)
3. Create route group `routes/_authenticated/`
4. Create `page.tsx` and `layout.tsx` files (empty shells)
5. Run dev server to generate `routeTree.gen.ts`

### Phase 2: Extract Components (3-4 hours)
1. Move `screens/main/components/` to appropriate `routes/` locations
2. Special attention to TasksView (40+ files):
   - Preserve the existing folder structure (components/, hooks/, utils/)
   - Move entire tree to `routes/_authenticated/tasks/`
   - Update all 40+ import statements within TasksView files
3. Update imports within other moved components
4. Co-locate components following repo rules

### Phase 3: Update Route Files (1-2 hours)
1. Add `createFileRoute()` exports to all `page.tsx` files
2. Add `createFileRoute()` exports to all `layout.tsx` files
3. Test that route tree generates correctly

### Phase 4: Replace Navigation (2-3 hours)
1. Find all `useOpenSettings`, `useSetView`, etc. calls (~121 usages)
2. Replace with `useNavigate()` from `@tanstack/react-router`
3. Update hotkey handlers to navigate
4. Update menu handlers to navigate

### Phase 5: Update Root Entry (30 min)
1. Update `index.tsx` to use `RouterProvider`
2. Create hash router for Electron compatibility
3. Delete old `routes.tsx` file
4. Delete `lib/electron-router-dom.ts`

### Phase 6: Cleanup (1 hour)
1. Delete `screens/main/`
2. Delete `stores/app-state.ts` entirely
3. Remove unused imports
4. Add `routeTree.gen.ts` to `.gitignore`

### Phase 7: Testing (1-2 hours)
1. Test all route navigation
2. Test deep linking (open app to `#/settings/keyboard`)
3. Test browser back/forward
4. Test auth redirects
5. Test provider hierarchy (CollectionsProvider working correctly)
6. Test dynamic routes (`/workspace/:id`)

**Total estimated time: 9-15 hours** (updated to account for expanded TasksView with 40+ files)

## Benefits

1. ✅ **Perfect co-location** - `layout.tsx` lives exactly where it's used
2. ✅ **Route groups** - `_authenticated/` wraps routes without affecting URL
3. ✅ **Clear hierarchy** - Folder structure = component nesting = route tree
4. ✅ **Shared components** - `_authenticated/components/` for Background, AppFrame
5. ✅ **Nested layouts** - Settings layout inside authenticated layout
6. ✅ **Exact Next.js conventions** - `page.tsx`, `layout.tsx`, `$id/` dynamic params
7. ✅ **Auto code splitting** - Built into TanStack Router plugin, no manual `React.lazy()`
8. ✅ **Type-safe navigation** - Generated route tree with full TypeScript autocomplete
9. ✅ **URL-based navigation** - Deep linking, sharable URLs, browser back/forward
10. ✅ **Provider scoping** - CollectionsProvider only wraps authenticated routes
11. ✅ **Follows repo conventions** - Co-location rules from AGENTS.md
12. ✅ **File-based routing** - No manual `<Route>` components, folder structure defines routes
13. ✅ **Hash routing** - Works with Electron's `file://` protocol out of the box

## Risks & Mitigations

| Risk                         | Mitigation                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Breaking existing navigation | See "Critical Migration Items" above - only 2 items require updates (agent hook listener, workspace hotkeys) |
| Missing navigation calls     | Grep for all `app-state` usages (~121 locations), update systematically                                      |
| Provider hierarchy issues    | Test auth flows thoroughly, verify CollectionsProvider scoping                                               |
| Route generation issues      | Run dev server frequently, check `routeTree.gen.ts` for errors                                               |
| Store lifecycle confusion    | Documented: stores remain global singletons despite folder moves                                             |
| Learning curve for team      | TanStack Router docs are excellent, syntax similar to Next.js                                                |

## Configuration Reference

### Vite Plugin Config

```typescript
// electron.vite.config.ts
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";

export default defineConfig({
  renderer: {
    plugins: [
      TanStackRouterVite({
        routesDirectory: "./src/renderer/routes",
        generatedRouteTree: "./src/renderer/routeTree.gen.ts",
        indexToken: "page",      // Use page.tsx instead of index.tsx
        routeToken: "layout",    // Use layout.tsx instead of route.tsx
        autoCodeSplitting: true, // Enable automatic code splitting
      }),
      react(),
    ],
  },
});
```

### Route File Patterns

| File Pattern                                       | Route                | Description                     |
| -------------------------------------------------- | -------------------- | ------------------------------- |
| `routes/__root.tsx`                                | -                    | Required root layout            |
| `routes/index/page.tsx`                            | `/`                  | Home page                       |
| `routes/sign-in/page.tsx`                          | `/sign-in`           | Sign-in page                    |
| `routes/_authenticated/layout.tsx`                 | -                    | Layout wrapper (no URL segment) |
| `routes/_authenticated/workspace/page.tsx`         | `/workspace`         | Workspace selector              |
| `routes/_authenticated/workspace/$id/page.tsx`     | `/workspace/:id`     | Dynamic workspace route         |
| `routes/_authenticated/settings/layout.tsx`        | `/settings`          | Settings layout                 |
| `routes/_authenticated/settings/keyboard/page.tsx` | `/settings/keyboard` | Settings page                   |

### .gitignore

```
# TanStack Router generated file
routeTree.gen.ts
```

## Decision: Approved / Needs Discussion

- [ ] Approved - proceed with implementation
- [ ] Needs discussion - questions below:
  -
  -
