# Routing Refactor: Specific Wins & Losses

**Date:** 2026-01-09
**Status:** Analysis Complete
**Related:** ROUTING_REFACTOR_PLAN.md

This document analyzes the concrete, specific benefits and tradeoffs of migrating from the current view-switching pattern to **TanStack Router with Next.js conventions**, based on the actual codebase.

---

## 🎯 WINS (Cleaning up actual messes)

### 1. **CollectionsProvider blocking the sign-in page gets fixed**
**Current mess:** `CollectionsProvider.tsx:29-34` requires `token` and `activeOrgId` to render children, showing a loading spinner when missing. It's rendered in `MainScreen` (line 394-428) which wraps everything including sign-in.

**What changes:** Moves to `(authenticated)/layout.tsx`, so sign-in page never hits it.

**Impact:** Sign-in page no longer blocks waiting for auth state it doesn't need.

---

### 2. **Delete 80 lines of view switching state that reimplements React Router**
**Current mess:** `app-state.ts` lines 15-100 - entire file is just tracking `currentView` with manual setters like `openSettings()`, `closeSettings()`, `openTasks()`.

**What changes:** Entire file can be deleted. Replace with `useNavigate()`.

**Impact:** -80 lines of custom routing logic. One less state management file to maintain.

---

### 3. **Delete the view switching conditional in main render**
**Current mess:** `main/index.tsx:322-333` - `renderContent()` function with if/else checking `currentView === "settings"`, `currentView === "tasks"`, etc.

```tsx
const renderContent = () => {
  if (currentView === "settings") return <SettingsView />;
  if (currentView === "tasks" && hasTasksAccess) return <TasksView />;
  if (currentView === "workspaces-list") return <WorkspacesListView />;
  return <WorkspaceView />;
};
```

**What changes:** React Router `<Outlet />` handles this. Conditional logic deleted.

**Impact:** Declarative routing instead of imperative conditionals.

---

### 4. **97 component files all loaded upfront, no code splitting**
**Current mess:** All components in `screens/main/components/` load immediately. SettingsView, TasksView, WorkspacesListView, WorkspaceView all loaded even if you only use workspace.

**What changes:** TanStack Router plugin handles code splitting automatically. Just enable `autoCodeSplitting: true` in the Vite config.

```typescript
// electron.vite.config.ts
TanStackRouterVite({
  autoCodeSplitting: true, // That's it!
})
```

**Impact:** Faster initial load. Pay-as-you-go bundle loading. Zero manual `React.lazy()` calls needed.

---

### 5. **Settings section switching via global Zustand state**
**Current mess:** `SettingsView/index.tsx:9-10` pulls `activeSection` from Zustand. `SettingsSidebar.tsx:15` has `closeSettings()` that sets `currentView: "workspace"`.

```tsx
const activeSection = useSettingsSection();
const closeSettings = useCloseSettings();
```

**What changes:** Section becomes URL (`/settings/keyboard`). Back button is `navigate(-1)` instead of custom `closeSettings()`. Can deep link, browser back/forward works.

**Impact:** Settings section is stateless, URL-driven. Browser back button works correctly.

---

### 6. **No way to deep link or share specific views**
**Current mess:** Can't open app to `/settings/keyboard` directly. Always starts at workspace, then user must click through.

**What changes:** URL-based routing enables deep linking. Can open specific settings page directly.

```tsx
// Electron can open app to:
electron://app/settings/keyboard
```

**Impact:** Better UX. Can bookmark, deep link, share specific views.

---

### 7. **Menu handlers use custom navigation system**
**Current mess:** `main/index.tsx:121-127` - menu subscription calls `openSettings(event.data.section)` which does Zustand `setState`.

```tsx
trpc.menu.subscribe.useSubscription(undefined, {
  onData: (event) => {
    if (event.type === "open-settings") {
      openSettings(event.data.section);
    }
  },
});
```

**What changes:** Becomes type-safe navigation with TanStack Router.

```tsx
navigate({ to: "/settings/$section", params: { section: event.data.section } });
```

**Impact:** Standard navigation API. Type-checked params. No custom abstractions.

---

### 8. **Hotkeys checking view state before executing**
**Current mess:** `main/index.tsx:141-148` - split pane hotkeys check `if (isWorkspaceView)` before running because they shouldn't work in settings.

```tsx
useAppHotkey("TOGGLE_SIDEBAR", () => {
  if (isWorkspaceView) toggleSidebar();
}, undefined, [toggleSidebar, isWorkspaceView]);
```

**What changes:** Hotkeys can check `location.pathname.startsWith('/workspace')` or register conditionally per route component.

**Impact:** Hotkeys scoped to routes automatically. Less global state checks.

---

### 9. **DndProvider wraps everything unnecessarily**
**Current mess:** `main/index.tsx:337, 358, 394` - DndProvider wraps sign-in, loading states, error states even though only workspace needs drag-drop.

```tsx
return (
  <DndProvider manager={dragDropManager}>
    <Background />
    <AppFrame>
      <SignInScreen /> {/* Doesn't need DnD! */}
    </AppFrame>
  </DndProvider>
);
```

**What changes:** Moves to `(authenticated)/layout.tsx`, only wraps workspace/tasks/settings where it's actually used.

**Impact:** Smaller React tree for sign-in. Providers only where needed.

---

### 10. **"isTasksTabOpen", "isSettingsTabOpen" flags that do nothing**
**Current mess:** `app-state.ts:17-19, 36-38` - these flags are set but **never used for any logic**. They just mirror `currentView`. The only "usage" is checking `isWorkspacesListOpen` in WorkspaceSidebarHeader but it's just comparing `currentView === "workspaces-list"` (line 32).

```tsx
isSettingsTabOpen: boolean;
isTasksTabOpen: boolean;
isWorkspacesListOpen: boolean;
```

**What changes:** Flags deleted. View state comes from URL.

**Impact:** Less dead code. URL is single source of truth.

---

### 11. **Unclear provider hierarchy**
**Current mess:** Reading `main/index.tsx` doesn't show you that CollectionsProvider/OrganizationsProvider are required for workspace but not settings. Everything is flat in one 430-line file.

**What changes:** `(authenticated)/layout.tsx` makes it explicit - these providers wrap all authenticated routes.

```tsx
// app/(authenticated)/layout.tsx
<CollectionsProvider>
  <OrganizationsProvider>
    <DndProvider>
      <Outlet /> {/* workspace, tasks, settings */}
    </DndProvider>
  </OrganizationsProvider>
</CollectionsProvider>
```

**Impact:** Explicit provider scoping. Clear what requires what.

---

## 💔 LOSSES (Things that were nice)

### 1. **Atomic "open settings to specific section" in one call**
**Current:** `openSettings("keyboard")` sets both view=settings AND section=keyboard atomically in one call.

**After:** `navigate("/settings/keyboard")` - same outcome but feels like you're just passing a path string.

**Verdict:** Not really a loss, just different. Actually **simpler** and more standard.

---

### 2. **Simple programmatic view switching**
**Current:** `useAppStore.setState({ currentView: "tasks" })` in DevTools console for debugging.

**After:** Need `navigate("/tasks")` or `window.history.pushState(null, '', '/tasks')`.

**Verdict:** Slightly more verbose in console, but tooling like React DevTools + React Router devtools makes this fine.

---

### 3. **"Back to workspace" from any view**
**Current:** Every close function (`closeSettings()`, `closeTasks()`) explicitly sets `currentView: "workspace"` as a known landing spot.

```tsx
closeSettings: () => {
  set({ currentView: "workspace" });
}
```

**After:** `navigate(-1)` goes to previous route in history, or need `navigate("/workspace")` explicitly. If you want "always back to workspace", need wrapper.

**Verdict:** **Slight loss** - requires either accepting browser back behavior or making a `navigateBackToWorkspace()` helper.

**Mitigation:** Create helper:
```tsx
export const useNavigateToWorkspace = () => {
  const navigate = useNavigate();
  return () => navigate("/workspace");
};
```

---

### 4. **View conditionals for feature gating**
**Current:** `main/index.tsx:326` - `if (currentView === "tasks" && hasTasksAccess)` prevents rendering TasksView if feature flag is off.

```tsx
if (currentView === "tasks" && hasTasksAccess) {
  return <TasksView />;
}
```

**After:** Need route guards or conditional route registration. More boilerplate.

```tsx
// Option 1: Conditional route registration
{hasTasksAccess && <Route path="/tasks" element={<TasksPage />} />}

// Option 2: Route guard in layout
function TasksGuard() {
  if (!hasTasksAccess) return <Navigate to="/workspace" />;
  return <Outlet />;
}
```

**Verdict:** Slight loss in simplicity, but route guards are more standard and explicit.

---

### 5. **All components in one flat folder**
**Current:** Everything in `screens/main/components/` regardless of which view uses it. Easy to grep and find.

**After:** Components co-located under `app/(authenticated)/workspace/components`, `app/(authenticated)/settings/components`. Need to know which route it belongs to.

**Verdict:** Loss for discoverability via flat search, but **gain for co-location** (which is a repo convention per AGENTS.md). Co-location wins because:
- Clear boundaries (what's used where)
- Easier to delete entire features
- Follows repo standards
- Better tree-shaking

---

## ⚖️ VERDICT

**Pros vastly outweigh cons.**

Most "losses" are just "different patterns" that are actually more standard (URL-based nav). The wins are cleaning up:

✅ An entire reimplementation of routing (app-state.ts)
✅ Provider hierarchy bugs (CollectionsProvider blocking sign-in)
✅ No code splitting (97 components loaded immediately)
✅ No deep linking
✅ Hotkeys checking global view state
✅ Settings section switching via Zustand
✅ Dead code (isTasksTabOpen flags)
✅ 430-line main screen file

The only real loss is **#3 (back behavior)** - may need a `navigateBackToWorkspace()` helper if always-back-to-workspace is desired behavior. Everything else is either neutral or better.

---

## Recommendation

**Proceed with migration using TanStack Router.** The refactor:
- Deletes ~80 lines of custom routing logic (entire app-state.ts)
- Enables **automatic** code splitting for faster startup
- Fixes provider scoping issues
- Uses **exact Next.js conventions** (`page.tsx`, `layout.tsx`, file-based routing)
- **Type-safe navigation** with generated route tree
- Aligns perfectly with repo co-location conventions (AGENTS.md)
- Zero manual route registration - folder structure = routes

**Why TanStack Router over React Router:**
- File-based routing (folder structure defines routes)
- Auto code splitting via Vite plugin
- Type-safe params and navigation
- Next.js-style conventions via `indexToken` and `routeToken`
- Better DX, more modern

Estimated effort: 8-13 hours (per ROUTING_REFACTOR_PLAN.md)
Risk: Low - incremental migration possible, comprehensive testing at each phase
