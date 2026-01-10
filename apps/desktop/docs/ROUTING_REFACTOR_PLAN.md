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

├── lib/                                    # Shared utilities
│   ├── trpc.ts                             # Used everywhere
│   ├── dnd.ts                              # Used in (authenticated)/layout.tsx
│   ├── electron-router-dom.ts              # Used in routes.tsx
│   └── sentry.ts                           # Used in index.tsx

└── routes.tsx                              # Route registration (reads from app/)
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
- ✅ **PostHogProvider, TRPCProvider, MonacoProvider** - Root-level providers (composed in index.tsx)
- ✅ **lib/** utilities - Shared infrastructure

**What Got Deleted:**
- ❌ **contexts/AppProviders/** - No longer needed, compose providers directly in index.tsx instead

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
                                  └─ DndProvider
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
          <RouterProvider router={router} />
          <ThemedToaster />
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

**Deleted:**
- ❌ `contexts/AppProviders/` - No longer needed, compose providers directly in index.tsx
- ❌ `routes.tsx` - No longer needed, TanStack Router auto-generates route tree
- ❌ `lib/electron-router-dom.ts` - No longer needed, using TanStack Router directly

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

### Phase 2: Extract Components (2-3 hours)
1. Move `screens/main/components/` to appropriate `routes/` locations
2. Update imports within moved components
3. Co-locate components following repo rules

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

**Total estimated time: 8-13 hours**

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

| Risk                         | Mitigation                                                     |
| ---------------------------- | -------------------------------------------------------------- |
| Breaking existing navigation | Incremental migration, comprehensive testing at each phase     |
| Missing navigation calls     | Grep for all `app-state` usages, update systematically         |
| Provider hierarchy issues    | Test auth flows thoroughly, verify CollectionsProvider scoping |
| Hotkeys breaking             | Update all hotkey handlers to use navigate()                   |
| Route generation issues      | Run dev server frequently, check `routeTree.gen.ts` for errors |
| Learning curve for team      | TanStack Router docs are excellent, syntax similar to Next.js  |

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

| File Pattern | Route | Description |
|-------------|-------|-------------|
| `routes/__root.tsx` | - | Required root layout |
| `routes/index/page.tsx` | `/` | Home page |
| `routes/sign-in/page.tsx` | `/sign-in` | Sign-in page |
| `routes/_authenticated/layout.tsx` | - | Layout wrapper (no URL segment) |
| `routes/_authenticated/workspace/page.tsx` | `/workspace` | Workspace selector |
| `routes/_authenticated/workspace/$id/page.tsx` | `/workspace/:id` | Dynamic workspace route |
| `routes/_authenticated/settings/layout.tsx` | `/settings` | Settings layout |
| `routes/_authenticated/settings/keyboard/page.tsx` | `/settings/keyboard` | Settings page |

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
