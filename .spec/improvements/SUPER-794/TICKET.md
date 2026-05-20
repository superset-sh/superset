---
ticket_id: SUPER-794
ticket_url: https://linear.app/superset-sh/issue/SUPER-794/cmdw-in-a-browser-pane-closes-the-whole-window-instead-of-the-focused
tracker: linear
title: "CmdW in a browser pane closes the whole window instead of the focused pane"
labels: []
fetched_at: 2026-05-20
---

## Context

When focus is inside a browser pane in the desktop app, pressing Cmd+W closes the entire window instead of just the focused pane. Everywhere else in the app Cmd+W correctly closes the focused pane/terminal. Browser panes render content in an Electron `<webview>`, which runs in a separate web contents, so the keystroke never reaches the renderer's react-hotkeys-hook handlers — the Electron application-menu accelerator wins and closes the BrowserWindow.

## References

Internal — Satya Patel, created 2026-05-18.

## Implementation notes

### Files

- `apps/desktop/src/main/lib/menu.ts:31` — File menu `{ label: "Close Window", role: "close" }`. Electron's `role: "close"` defaults its accelerator to `CmdOrCtrl+W`. This is the menu item that captures Cmd+W when a `<webview>` has focus.
- `apps/desktop/src/main/lib/menu.ts:72` — Window menu `{ role: "close", accelerator: closeAccelerator }` already overrides the Window-menu close to `CmdOrCtrl+Shift+Q`, but the File-menu `role: "close"` at line 31 still carries the implicit `CmdOrCtrl+W`.
- `apps/desktop/src/renderer/hotkeys/registry.ts:341` (`CLOSE_PANE`, `meta+w`) and `:419` (`CLOSE_TERMINAL`, `meta+w`) — the renderer-side close hotkeys. These fire correctly when focus is in renderer DOM but are bypassed when focus is in a `<webview>`.
- `apps/desktop/src/main/lib/browser/browser-manager.ts:32` — `BrowserManager.register(paneId, webContentsId)` already holds each browser pane's webContents. This is the natural place to attach a `before-input-event` listener.
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/BrowserPane/hooks/usePersistentWebview/usePersistentWebview.ts:118` — existing tRPC subscription pattern (`browser.onNewWindow`) the renderer uses to react to main-process browser events; a pane-close event can follow the same pattern.

### Approach

Stop the application menu from owning Cmd+W and instead route it to the focused browser pane. Either remove the implicit accelerator from the File-menu `role: "close"` item (`menu.ts:31`) so `CmdOrCtrl+W` is no longer a menu accelerator, or intercept the keystroke before the menu sees it. The cleanest scoped fix: in `browserManager.register`, add a `webContents.on("before-input-event", ...)` listener that detects Cmd/Ctrl+W, calls `event.preventDefault()`, and emits a per-pane event (mirroring `new-window:${paneId}` / `context-menu-action:${paneId}`). `usePersistentWebview` subscribes to that event and triggers the existing pane-close path — `requestPaneClose(focusedPaneId)` for v1 (`workspace/$workspaceId/page.tsx:227-231`) or `closePane` for v2 (`v2-workspace/.../useWorkspaceHotkeys/useWorkspaceHotkeys.ts:113-129`). Confirm Cmd+Shift+W (`CLOSE_TAB`) still closes the whole tab.

### Related code

- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/page.tsx:227` — v1 `CLOSE_TERMINAL` handler that calls `requestPaneClose`.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useWorkspaceHotkeys/useWorkspaceHotkeys.ts:113` — v2 `CLOSE_PANE` handler that calls `closePane` (and runs `paneRegistry[kind].onBeforeClose`).

### Gotchas

- The `<webview>` runs guest web contents in a separate process; renderer keyboard hooks never see its keystrokes — this is why the menu accelerator wins. The fix must live in the main process (`before-input-event` on the guest webContents) or remove the menu accelerator.
- Browser panes use a persistent-webview registry that reparents the `<webview>` between visible and hidden containers; the `webContentsId` can change after reparenting (`browser-manager.ts:32-43` re-registers on change). Any `before-input-event` listener must be (re)attached on every `register` call, not just the first.
- Don't break the menu's "Close Window" affordance — keep the File-menu item, just drop or reassign its `CmdOrCtrl+W` accelerator. `Cmd+Shift+Q` already maps to window close via the Window menu.
- v1 and v2 workspaces close panes through different code paths (`requestPaneClose` vs `closePane`); verify the fix covers both.
