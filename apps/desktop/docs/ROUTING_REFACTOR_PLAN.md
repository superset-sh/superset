# Desktop App Routing Refactor

**Status:** Planning
**Date:** 2026-01-09
**Author:** Team Discussion

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

## Solution: React Router with Next.js App Router Patterns

Migrate to **React Router v7** (already installed) using **Next.js app router conventions**:
- Route groups `(authenticated)` for layout co-location
- `page.tsx` for route components
- `layout.tsx` for nested layouts with `<Outlet />`
- Co-located components following repo rules

## Proposed Folder Structure (Following Strict Co-location)

```
src/renderer/
├── app/                                    # All routes co-located here
│   ├── page.tsx                            # "/" - root redirect
│   │
│   ├── sign-in/
│   │   ├── page.tsx                        # "/sign-in" route
│   │   └── components/                     # Used ONLY in sign-in
│   │       └── SignInForm/
│   │           ├── SignInForm.tsx
│   │           └── index.ts
│   │
│   └── (authenticated)/                    # Route group (NOT in URL path)
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
│       ├── providers/                      # Used ONLY in (authenticated)/layout.tsx
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
│       │   └── [workspaceId]/              # "/workspace/:workspaceId" - specific workspace
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
│       │   ├── page.tsx                    # "/tasks" route
│       │   └── components/                 # Used ONLY in tasks
│       │       └── OrganizationSwitcher/
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
│           │   ├── page.tsx                # "/settings/account"
│           │   └── components/             # Used ONLY in account settings
│           │       └── AccountForm/
│           ├── workspace/
│           │   ├── page.tsx                # "/settings/workspace"
│           │   └── components/
│           ├── keyboard/
│           │   ├── page.tsx                # "/settings/keyboard"
│           │   └── components/
│           │       └── HotkeyEditor/
│           ├── appearance/
│           │   ├── page.tsx                # "/settings/appearance"
│           │   └── components/
│           ├── behavior/
│           │   ├── page.tsx                # "/settings/behavior"
│           │   └── components/
│           └── presets/
│               ├── page.tsx                # "/settings/presets"
│               └── components/

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

├── lib/                                    # Shared utilities
│   ├── trpc.ts                             # Used everywhere
│   ├── dnd.ts                              # Used in (authenticated)/layout.tsx
│   ├── electron-router-dom.ts              # Used in routes.tsx
│   └── sentry.ts                           # Used in index.tsx

└── routes.tsx                              # Route registration (reads from app/)
```

### Key Co-location Changes

**What Moved:**
1. ✅ **CollectionsProvider & OrganizationsProvider** → `app/(authenticated)/providers/` (used ONLY in authenticated layout)
2. ✅ **SetupConfigModal & NewWorkspaceModal** → `app/(authenticated)/components/` (rendered ONLY in authenticated layout)
3. ✅ **Modal stores** → Next to their respective modal components in `components/*/stores/`
4. ✅ **StartView** → `app/(authenticated)/workspace/components/` (used ONLY by `/workspace` selector page)
5. ✅ **TopBar, WorkspaceSidebar, WorkspaceContent, etc** → `app/(authenticated)/workspace/[workspaceId]/components/` (used ONLY by specific workspace page)
6. ✅ **TabsStore** → `app/(authenticated)/workspace/[workspaceId]/stores/tabs/` (used ONLY in workspace page)
7. ✅ **sidebar-state.ts, workspace-sidebar-state.ts, chat-panel-state.ts** → `app/(authenticated)/workspace/[workspaceId]/stores/` (workspace page specific)
8. ✅ **workspace-init.ts** → `app/(authenticated)/stores/` (shared by layout + workspace, not workspace-only)

**What Stayed Global:**
- ✅ **stores/hotkeys/** - Used in 27+ places across all routes
- ✅ **hooks/useVersionCheck** - Used at root level for version blocking
- ✅ **hooks/useUpdateListener** - Used at root level
- ✅ **PostHogProvider, TRPCProvider, MonacoProvider** - Root-level providers (composed in index.tsx)
- ✅ **lib/** utilities - Shared infrastructure

**What Got Deleted:**
- ❌ **contexts/AppProviders/** - No longer needed, compose providers directly in index.tsx instead

## Route Groups Explained

**`(authenticated)`** is a **route group**:
- ✅ **Not in URL path** - `/workspace` not `/(authenticated)/workspace`
- ✅ **Co-locates layout** - `layout.tsx` wraps all children
- ✅ **Shares components** - `components/` folder shared by all routes in group
- ✅ **Clear boundaries** - Everything inside needs auth

This is a Next.js app router convention that React Router supports via nested routes.

## Layout Hierarchy

```
index.tsx (root composition)
  └─ PostHogProvider
      └─ TRPCProvider
          └─ MonacoProvider
              └─ <AppRoutes>
                  │
                  ├─ "/" → app/page.tsx (redirect)
                  │
                  ├─ "/sign-in" → app/sign-in/page.tsx
                  │
                  └─ app/(authenticated)/layout.tsx
                      └─ CollectionsProvider
                          └─ OrganizationsProvider
                              └─ DndProvider
                                  └─ Background + AppFrame
                                      │
                                      ├─ "/workspace" → workspace/page.tsx (selector)
                                      │
                                      ├─ "/workspace/:workspaceId" → workspace/[workspaceId]/page.tsx
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

### index.tsx (Root Composition)

```tsx
import { initSentry } from "./lib/sentry";
initSentry();

import ReactDom from "react-dom/client";
import { PostHogProvider } from "./contexts/PostHogProvider";
import { TRPCProvider } from "./contexts/TRPCProvider";
import { MonacoProvider } from "./contexts/MonacoProvider";
import { PostHogUserIdentifier } from "./components/PostHogUserIdentifier";
import { ThemedToaster } from "./components/ThemedToaster";
import { AppRoutes } from "./routes";
import "./globals.css";

ReactDom.createRoot(document.querySelector("app") as HTMLElement).render(
  <PostHogProvider>
    <TRPCProvider>
      <PostHogUserIdentifier />
      <MonacoProvider>
        <AppRoutes />
        <ThemedToaster />
      </MonacoProvider>
    </TRPCProvider>
  </PostHogProvider>
);
```

### app/(authenticated)/layout.tsx

```tsx
import { Outlet, Navigate } from "react-router-dom";
import { DndProvider } from "react-dnd";
import { trpc } from "renderer/lib/trpc";
import { dragDropManager } from "renderer/lib/dnd";
import { CollectionsProvider } from "./providers/CollectionsProvider";
import { OrganizationsProvider } from "./providers/OrganizationsProvider";
import { Background } from "./components/Background";
import { AppFrame } from "./components/AppFrame";
import { WorkspaceInitEffects } from "./components/WorkspaceInitEffects";
import { SetupConfigModal } from "./components/SetupConfigModal";
import { NewWorkspaceModal } from "./components/NewWorkspaceModal";

export default function AuthenticatedLayout() {
  const { data: authState } = trpc.auth.getState.useQuery();
  const isSignedIn = !!process.env.SKIP_ENV_VALIDATION || (authState?.isSignedIn ?? false);

  if (!isSignedIn) {
    return <Navigate to="/sign-in" replace />;
  }

  return (
    <CollectionsProvider>
      <OrganizationsProvider>
        <DndProvider manager={dragDropManager}>
          <Background />
          <AppFrame>
            <Outlet /> {/* workspace, tasks, workspaces, settings render here */}
          </AppFrame>
          <SetupConfigModal />
          <NewWorkspaceModal />
          <WorkspaceInitEffects />
        </DndProvider>
      </OrganizationsProvider>
    </CollectionsProvider>
  );
}
```

### app/(authenticated)/workspace/page.tsx (Selector)

```tsx
import { StartView } from "./components/StartView";

// Auto-navigates to last active workspace, or shows StartView if none
export default function WorkspaceSelectorPage() {
  const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
  useEffect(() => {
    if (activeWorkspace?.id) navigate(`/workspace/${activeWorkspace.id}`, { replace: true });
  }, [activeWorkspace?.id]);

  return activeWorkspace ? <LoadingSpinner /> : <StartView />;
}
```

### app/(authenticated)/workspace/[workspaceId]/page.tsx

```tsx
import { TopBar } from "./components/TopBar";
import { WorkspaceSidebar } from "./components/WorkspaceSidebar";
import { WorkspaceContent } from "./components/WorkspaceContent";
import { ResizablePanel } from "./components/ResizablePanel";
import { useWorkspaceSidebarStore } from "./stores/workspace-sidebar-state";

// Main workspace view - fetches workspace by ID from URL
export default function WorkspacePage() {
  const { workspaceId } = useParams();
  const { data: workspace } = trpc.workspaces.getById.useQuery({ id: workspaceId! });
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

### app/(authenticated)/settings/layout.tsx

```tsx
import { Outlet } from "react-router-dom";
import { SettingsSidebar } from "./components/SettingsSidebar";

export default function SettingsLayout() {
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

### routes.tsx

```tsx
import { Route } from "react-router-dom";
import { Router } from "lib/electron-router-dom";

// Root level
import RootPage from "./app/page";
import SignInPage from "./app/sign-in/page";

// Authenticated routes
import AuthenticatedLayout from "./app/(authenticated)/layout";
import WorkspaceSelectorPage from "./app/(authenticated)/workspace/page";
import WorkspacePage from "./app/(authenticated)/workspace/[workspaceId]/page";
import TasksPage from "./app/(authenticated)/tasks/page";
import WorkspacesPage from "./app/(authenticated)/workspaces/page";

// Settings (nested)
import SettingsLayout from "./app/(authenticated)/settings/layout";
import SettingsPage from "./app/(authenticated)/settings/page";
import AccountSettingsPage from "./app/(authenticated)/settings/account/page";
import WorkspaceSettingsPage from "./app/(authenticated)/settings/workspace/page";
import KeyboardSettingsPage from "./app/(authenticated)/settings/keyboard/page";
import AppearanceSettingsPage from "./app/(authenticated)/settings/appearance/page";
import BehaviorSettingsPage from "./app/(authenticated)/settings/behavior/page";
import PresetsSettingsPage from "./app/(authenticated)/settings/presets/page";

function ErrorPage() {
  const error = useRouteError() as Error;
  // ... existing error page implementation
}

export function AppRoutes() {
  return (
    <Router
      main={
        <>
          {/* Root */}
          <Route path="/" element={<RootPage />} />
          <Route path="/sign-in" element={<SignInPage />} />

          {/* Authenticated routes (route group - no path) */}
          <Route element={<AuthenticatedLayout />}>
            <Route path="/workspace" element={<WorkspaceSelectorPage />} />
            <Route path="/workspace/:workspaceId" element={<WorkspacePage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/workspaces" element={<WorkspacesPage />} />

            {/* Settings (nested layout) */}
            <Route path="/settings" element={<SettingsLayout />}>
              <Route index element={<SettingsPage />} />
              <Route path="account" element={<AccountSettingsPage />} />
              <Route path="workspace" element={<WorkspaceSettingsPage />} />
              <Route path="keyboard" element={<KeyboardSettingsPage />} />
              <Route path="appearance" element={<AppearanceSettingsPage />} />
              <Route path="behavior" element={<BehaviorSettingsPage />} />
              <Route path="presets" element={<PresetsSettingsPage />} />
            </Route>
          </Route>
        </>
      }
      errorElement={<ErrorPage />}
    />
  );
}
```

## Workspace Routing Behavior

### Routes

1. **`/workspace`** (Workspace Selector Page)
   - Queries for last active workspace
   - If workspace exists → auto-navigates to `/workspace/:workspaceId`
   - If no workspace → shows StartView (create/clone UI)
   - This is where users land when opening app without deep link

2. **`/workspace/:workspaceId`** (Specific Workspace Page)
   - Shows the full workspace UI (TopBar, Sidebar, Content)
   - If workspace ID invalid → redirects back to `/workspace`
   - This is the main workspace view

### Workspace Switching

Clicking a workspace in sidebar:
```tsx
// Before: Updates global state
setActiveWorkspace(workspaceId);

// After: Navigate to new workspace
navigate(`/workspace/${workspaceId}`);
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

### After (React Router)

```tsx
import { useNavigate } from "react-router-dom";

const navigate = useNavigate();
navigate("/settings/keyboard");
navigate("/tasks");
navigate(`/workspace/${workspaceId}`);  // Switch workspaces
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

**Moved to `app/(authenticated)/workspace/[workspaceId]/stores/`:**
- ❌ `stores/tabs/` → Workspace page only (tab/pane management)
- ❌ `stores/sidebar-state.ts` → Workspace page only (left sidebar UI)
- ❌ `stores/workspace-sidebar-state.ts` → Workspace page only (right sidebar UI)
- ❌ `stores/chat-panel-state.ts` → Workspace page only

**Moved to `app/(authenticated)/stores/`:**
- ❌ `stores/workspace-init.ts` → Shared by authenticated layout + workspace

**Moved to `app/(authenticated)/components/SetupConfigModal/stores/`:**
- ❌ `stores/config-modal.ts` → Used only by SetupConfigModal

**Moved to `app/(authenticated)/components/NewWorkspaceModal/stores/`:**
- ❌ `stores/new-workspace-modal.ts` → Used only by NewWorkspaceModal

**Moved to `app/(authenticated)/providers/`:**
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

**Deleted:**
- ❌ `contexts/AppProviders/` - No longer needed, compose providers directly in index.tsx

## Migration Steps

### Phase 1: Create Structure (1-2 hours)
1. Create `app/` folder structure
2. Create route group `app/(authenticated)/`
3. Create `page.tsx` files (empty shells)
4. Create `layout.tsx` files

### Phase 2: Extract Components (2-3 hours)
1. Move `screens/main/components/` to appropriate `app/` locations
2. Update imports within moved components
3. Co-locate components following repo rules

### Phase 3: Wire Routes (1 hour)
1. Update `routes.tsx` to register all routes
2. Test navigation between routes

### Phase 4: Replace Navigation (2-3 hours)
1. Find all `useOpenSettings`, `useSetView`, etc. calls (~121 usages)
2. Replace with `useNavigate()` calls
3. Update hotkey handlers to navigate
4. Update menu handlers to navigate

### Phase 5: Cleanup (1 hour)
1. Delete `screens/main/`
2. Delete or heavily reduce `stores/app-state.ts`
3. Remove unused imports
4. Update tests

### Phase 6: Testing (1-2 hours)
1. Test all route navigation
2. Test deep linking (open app to `/settings/keyboard`)
3. Test browser back/forward
4. Test auth redirects
5. Test provider hierarchy (CollectionsProvider working correctly)

**Total estimated time: 8-12 hours**

## Benefits

1. ✅ **Perfect co-location** - `layout.tsx` lives exactly where it's used
2. ✅ **Route groups** - `(authenticated)` wraps routes without affecting URL
3. ✅ **Clear hierarchy** - Folder structure = component nesting
4. ✅ **Shared components** - `(authenticated)/components/` for Background, AppFrame
5. ✅ **Nested layouts** - Settings layout inside authenticated layout
6. ✅ **Standard Next.js patterns** - Anyone familiar with Next.js understands this
7. ✅ **Code splitting** - Can lazy load routes for faster startup
8. ✅ **URL-based navigation** - Deep linking, sharable URLs
9. ✅ **Provider scoping** - CollectionsProvider only wraps authenticated routes
10. ✅ **Follows repo conventions** - Co-location rules from AGENTS.md

## Risks & Mitigations

| Risk                         | Mitigation                                                     |
| ---------------------------- | -------------------------------------------------------------- |
| Breaking existing navigation | Incremental migration, feature flag if needed                  |
| Missing navigation calls     | Grep for all `app-state` usages, comprehensive testing         |
| Provider hierarchy issues    | Test auth flows thoroughly, verify CollectionsProvider scoping |
| Hotkeys breaking             | Update all hotkey handlers to use navigate()                   |
| Deep refactor takes too long | Can pause after Phase 3, test incrementally                    |

## Open Questions

1. Should we lazy load routes with `React.lazy()`?
2. Do we need URL params for settings sections or just routes? Routes is fine
3. Should we delete `app-state.ts` entirely or keep minimal state?
4. Do we want a feature flag to toggle between old/new navigation during migration? No

## Decision: Approved / Needs Discussion

- [ ] Approved - proceed with implementation
- [ ] Needs discussion - questions below:
  -
  -
