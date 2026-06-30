# Multi-window per workspace

**Date:** 2026-05-17
**Branch:** `feat/desktop-multi-window`
**Goal:** Let users open multiple Superset windows simultaneously, each bound to a distinct workspace, so different projects can be viewed side-by-side.

---

## Why now

Today Superset enforces a single `BrowserWindow` and `requestSingleInstanceLock` (`apps/desktop/src/main/index.ts:276`), with `currentWindow` held in a module-scope singleton (`apps/desktop/src/main/windows/main.ts:63`). Users wanting parallel project views fall back to ugly workarounds (`open -n --args --user-data-dir=...`) which fork local SQLite state and cause divergence.

## Out of scope

- Removing the single-instance lock (we keep it: shared `packages/local-db` would corrupt under multi-process).
- Detaching individual panes to their own windows (different feature; tracked separately as V4 in the framing doc).
- Cross-window drag-and-drop of tabs.
- Cloud workspaces in separate windows (registry already supports it via `getForWorkspaceId`; nothing here blocks future work).

## Acceptance

- `Cmd/Ctrl+Shift+N` (and File → "New Window for Workspace…") opens a new `BrowserWindow` bound to a chosen workspace.
- Two windows showing distinct workspaces can run side-by-side. Each window's terminals, browser panes, notifications work independently.
- Closing one window does not break the other.
- App quits when the last window closes (macOS dock behavior preserved).
- Restarting restores the previously-open windows with their workspaces and bounds.
- `bun run typecheck` and `bun run lint` pass with zero warnings.

## Non-goals (parity rules)

- Single-window users see no UX change.
- No changes to the renderer's workspace switcher logic beyond accepting an init `workspaceId` from the URL.
- No changes to local DB schema.

---

## Architecture

### Module-level state — before vs after

| Concern | Before | After |
|---------|--------|-------|
| Window handle | `let currentWindow: BrowserWindow \| null` | `Map<string, ManagedWindow>` keyed by `windowId` (UUID) |
| Caller window in tRPC | `getWindow: () => BrowserWindow \| null` passed into router factories | `ctx.window: BrowserWindow \| null` from `createContext({ event })` using `BrowserWindow.fromWebContents(event.sender)` |
| IPC handler | Re-created on every `MainWindow()` call | Created once at app boot; `attachWindow` on each new window, `detachWindow` on each close |
| Notifications HTTP server | `notificationsApp.listen()` inside `MainWindow()` | Started once at app boot in `apps/desktop/src/main/index.ts` |
| `NotificationManager` | Constructed per `MainWindow()` call | One app-level instance; uses `windowId` from `extractWorkspaceIdFromUrl` to target the right window |
| `appState` workspace context | Tied to "the" window | Per-window: each window owns its current `workspaceId` (URL-derived) |
| `window-state` persisted JSON | Single key | Keyed by `windowId`, with a top-level `windowOrder: string[]` for restart |
| `browserManager.unregisterAll()` in close | Tears down all panes globally | `browserManager.unregisterForWindow(windowId)` |
| `notificationsEmitter.removeAllListeners()` in close | Wipes shared listeners | Detach only this window's handlers |
| `getWorkspaceRuntimeRegistry().getDefault().terminal.detachAllListeners()` in close | Detaches global listeners | Detach only the per-window forwarder registered earlier |
| `focusMainWindow()` | Focuses the singleton | Focuses last-active window; if none, opens new with last workspace |
| `app.on("activate")` (macOS) | Reopens single window | Focuses last-active; if all closed, restores last session |
| `app.on("second-instance")` deep link | Focuses singleton | Routes to window matching workspaceId, or spawns new |
| File menu | No "New Window" entry | "New Window for Workspace…" submenu listing workspaces |

### New types

```ts
// apps/desktop/src/main/windows/types.ts
export interface ManagedWindow {
  id: string;
  window: BrowserWindow;
  workspaceId: string | null;  // null = "last-active workspace selected in renderer"
}

// apps/desktop/src/lib/trpc/context.ts
export interface TrpcContext {
  window: BrowserWindow | null;     // derived from event.sender
  windowId: string | null;          // from window manager lookup
}
```

### Router migration

Every router in `apps/desktop/src/lib/trpc/routers/` currently typed as `createXRouter(getWindow: () => BrowserWindow | null)` becomes `createXRouter()` and reads `ctx.window` instead.

Files affected (from `grep getWindow`):
- `routers/index.ts`
- `routers/window.ts`
- `routers/projects/projects.ts`
- `routers/notifications.ts`
- `routers/ringtone.ts`

(Any router not in the grep does not need the change.)

### Window factory

Replace `MainWindow()` export with:

```ts
export interface CreateWorkspaceWindowOpts {
  workspaceId?: string;        // omitted = renderer picks last-active
  initialBounds?: Partial<Bounds>;
}

export async function createWorkspaceWindow(opts: CreateWorkspaceWindowOpts = {}): Promise<ManagedWindow>;
export function getManagedWindow(id: string): ManagedWindow | undefined;
export function getAllManagedWindows(): ManagedWindow[];
export function getFocusedManagedWindow(): ManagedWindow | undefined;
```

Renderer URL: `loadURL(rendererURL + '?windowId=<uuid>&workspaceId=<id>')`. Renderer reads `window.location.search` on boot, stores `windowId` in a module global, and uses `workspaceId` to skip the "last-active" rehydration.

### Window-state persistence (`apps/desktop/src/main/lib/window-state`)

Existing single-state JSON keyed under `"main"` after migration. New shape:

```json
{
  "version": 2,
  "windows": {
    "<windowId>": {
      "workspaceId": "...",
      "bounds": {...},
      "isMaximized": false,
      "zoomLevel": 0
    }
  },
  "lastSession": ["<windowId-A>", "<windowId-B>"]
}
```

On boot, if `lastSession` non-empty, restore those windows in order. Otherwise open a single "main" window with no `workspaceId` (renderer picks).

### Notifications

`NotificationManager` already takes `getVisibilityContext` and `onNotificationClick` per-window. Refactor to take a window-id-aware lookup:

```ts
new NotificationManager({
  getVisibilityContextFor: (windowId: string) => ({
    isFocused: getManagedWindow(windowId)?.window.isFocused() ?? false,
    currentWorkspaceId: getManagedWindow(windowId)?.workspaceId,
    tabsState: appState.data?.tabsState,
  }),
  onNotificationClick: (windowId: string, ids: string[]) => {
    const mw = getManagedWindow(windowId);
    if (!mw) return;
    mw.window.show();
    mw.window.focus();
    notificationsEmitter.emit(NOTIFICATION_EVENTS.FOCUS_TAB, { windowId, ids });
  },
  ...
});
```

Inside the manager, route incoming events to the window whose `workspaceId` matches the event's `workspaceId`. If no match, fall back to focused window.

### Terminal-exit forwarding

`getWorkspaceRuntimeRegistry().getDefault().terminal.on("terminalExit", ...)` is registered once per `MainWindow()` today. Move into app-boot section as a single forwarder; it already broadcasts via `notificationsEmitter` so renderer subscribers in each window pick it up correctly.

### Browser manager (`apps/desktop/src/main/lib/browser/browser-manager.ts`)

Currently exposes `unregisterAll()`. Add `unregisterForWindow(windowId)`. Audit `register` callsites to ensure they pass `windowId`. Existing per-pane mapping likely already keys by pane → window via WebContents.

### Menu (`apps/desktop/src/main/lib/menu.ts`)

Add under File (or app menu on macOS):

```
New Window for Workspace…    Cmd/Ctrl+Shift+N   →   shows picker dialog
└── <workspace-1>
└── <workspace-2>
└── ...
```

Workspaces sourced from `localDb.select().from(workspaces)`. Selecting one calls `createWorkspaceWindow({ workspaceId })`.

### Tray + deep links

- `focusMainWindow()` in `apps/desktop/src/main/index.ts` becomes: `(getAllManagedWindows().sort(by lastFocusedAt)[0] ?? createWorkspaceWindow()).window.focus()`.
- `app.on("activate")`: same logic.
- `app.on("second-instance")`: parse workspaceId from argv; if a managed window matches, focus it; else `createWorkspaceWindow({ workspaceId })`.

---

## Execution plan (ordered, by task)

Tasks tracked in TaskList (#1-#8). Dependency order:

```
#1 currentWindow → Map  +  ctx-based tRPC  (foundation, blocks all)
  ├─→ #2 lift notifications to app-level
  ├─→ #3 per-window window-state
  ├─→ #4 renderer ?workspaceId= routing
  │     └─→ #5 File menu "New Window"
  │         └─→ #7 activate + tray + deep-link routing
  └─→ #6 scope close-handler side effects
#8 smoke test + typecheck + lint  (blocks all)
```

Estimated effort: ~2-3 days of focused work. Suggested PR slicing:

- **PR 1 — Foundation**: tasks #1, #2, #3, #6 (no user-visible change; still single-window via auto-create on boot).
- **PR 2 — Multi-window UX**: tasks #4, #5, #7, #8 (visible feature).

This lets us merge the risky refactor first behind no-op behavior, then add the UI.

---

## Risks / weakest links

| Risk | Mitigation |
|------|-----------|
| Hidden singleton elsewhere I haven't grep'd | After foundation refactor, smoke test with 2 windows + intentionally exercise each pane type before declaring done |
| `browser-manager` pane lifecycle ties to window WebContents in ways I missed | Read `browser-manager.ts` in full before refactor; add `unregisterForWindow` first, switch close handler last |
| Renderer assumes a single workspace in module-level state | Audit renderer entry; the URL param gives us a clean handoff but stores must be window-scoped (already are: each renderer is its own React tree) |
| Notification routing edge cases (background workspace gets notification while user is focused on another window) | Visibility context per window is already on the table; verify in smoke test |
| Performance with 3+ windows | Acceptable target: 2-3 windows on modern hardware. Add a guard in factory (e.g., max 8) to prevent runaway. |

## Verify (per task #8)

```
# Lint + types
bun run typecheck
bun run lint

# Manual
bun dev
# Open workspace A. Cmd+Shift+N → pick workspace B. Verify:
#   - Two windows visible, distinct titles
#   - Each has its own terminal session running unaffected
#   - Open a browser pane in each; navigate independently
#   - Notification fired from B reaches B's window only (focus A first)
#   - Close window B; window A still functional
#   - Quit. Relaunch. Both windows restore.
```
