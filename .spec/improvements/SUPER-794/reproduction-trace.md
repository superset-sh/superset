# SUPER-794 Reproduction Trace

## Defect Statement
**Symptom:** When focus is inside a browser pane (Electron `<webview>`), pressing Cmd+W closes the entire window instead of just the focused pane.
**Observed:** Cmd+W triggers the File menu's "Close Window" action
**Expected:** Cmd+W should close only the focused browser pane (matching behavior when focus is in terminal/other panes)

## Static Code Path Analysis (Evidence)

### 1. Menu Accelerator Capture Point
**File:** `apps/desktop/src/main/lib/menu.ts:31`
```typescript
{ label: "Close Window", role: "close" }
```
**Evidence:** Electron's `role: "close"` implicitly assigns `CmdOrCtrl+W` as the accelerator. This menu item captures Cmd+W at the application-menu level, before renderer handlers see it.

### 2. Renderer Hotkey Registration (Bypassed by webview)
**File:** `apps/desktop/src/renderer/hotkeys/registry.ts:341-342`
```typescript
CLOSE_PANE: {
  key: { mac: L("meta+w"), ... },
  label: "Close Pane",
  ...
}
```
**File:** `apps/desktop/src/renderer/hotkeys/registry.ts:419-422`
```typescript
CLOSE_TERMINAL: {
  key: { mac: L("meta+w"), ... },
  label: "Close Terminal",
  ...
}
```
**Evidence:** Renderer registers `meta+w` for CLOSE_PANE and CLOSE_TERMINAL. These work when focus is in renderer DOM but are bypassed when focus is in a `<webview>` because webviews run in a separate process.

### 3. Workspace Close Handlers (Never Reached)
**V1 Workspace:** `apps/desktop/src/renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/page.tsx:227-231`
```typescript
useHotkey("CLOSE_TERMINAL", () => {
  if (focusedPaneId) {
    requestPaneClose(focusedPaneId);
  }
});
```

**V2 Workspace:** `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useWorkspaceHotkeys/useWorkspaceHotkeys.ts:113-129`
```typescript
useHotkey("CLOSE_PANE", async () => {
  const state = store.getState();
  const active = state.getActivePane();
  if (!active) return;
  const definition = paneRegistry[active.pane.kind];
  if (definition?.onBeforeClose) {
    const allowed = await definition.onBeforeClose(active.pane);
    if (!allowed) return;
  }
  state.closePane({ tabId: active.tabId, paneId: active.pane.id });
});
```
**Evidence:** Both workspace versions have correct pane-close handlers via `useHotkey()`. These never execute when focus is in a `<webview>` because the keystroke is intercepted by the menu accelerator before reaching the renderer.

### 4. Browser Manager Registration Point
**File:** `apps/desktop/src/main/lib/browser/browser-manager.ts:32-44`
```typescript
register(paneId: string, webContentsId: number): void {
  // Clean up previous listeners if re-registering
  const prevId = this.paneWebContentsIds.get(paneId);
  if (prevId != null && prevId !== webContentsId) {
    for (const map of [this.consoleListeners, this.contextMenuListeners]) {
      const cleanup = map.get(paneId);
      if (cleanup) {
        cleanup();
        map.delete(paneId);
      }
    }
  }
  this.paneWebContentsIds.set(paneId, webContentsId);
  const wc = webContents.fromId(webContentsId);
  if (wc) {
    wc.setBackgroundThrottling(true);
    wc.setWindowOpenHandler(({ url }) => {
      if (url && url !== "about:blank") {
        this.emit(`new-window:${paneId}`, url);
      }
      return { action: "deny" as const };
    });
    // ...
```
**Evidence:** This is where each browser pane's `webContents` is registered. The pattern shows attaching handlers to `wc` (webContents). This is the correct insertion point for a `before-input-event` listener.

### 5. Existing tRPC Subscription Pattern (for renderer communication)
**File:** `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/BrowserPane/hooks/usePersistentWebview/usePersistentWebview.ts:118-130`
```typescript
electronTrpc.browser.onNewWindow.useSubscription(
  { paneId },
  {
    onData: ({ url }: { url: string }) => {
      const state = useTabsStore.getState();
      const pane = state.panes[paneId];
      if (!pane) return;
      const tab = state.tabs.find((t) => t.id === pane.tabId);
      if (!tab) return;
      state.openInBrowserPane(tab.workspaceId, url);
    },
  },
);
```
**Evidence:** The renderer already uses tRPC subscriptions to receive main-process browser events (`new-window:${paneId}`). A pane-close event can follow the same pattern.

## Root Cause
The `<webview>` tag runs guest web contents in a separate renderer process. When the guest webContents has keyboard focus:
1. Keystrokes are NOT visible to the host renderer's `react-hotkeys-hook` handlers
2. The Electron application-menu accelerators still fire
3. `menu.ts:31`'s `role: "close"` carries an implicit `CmdOrCtrl+W` accelerator
4. This accelerator triggers "Close Window" on the BrowserWindow, not the focused pane

**Root cause location:** `apps/desktop/src/main/lib/menu.ts:31` — the implicit accelerator on the File menu's "Close Window" item.

## Why Renderer Handlers Fail
Electron's `<webview>` documentation states:
> "Inside a guest page, the input method is changed so that the user's keyboard input is not intercepted by the guest page."

The guest webContents runs in a separate process and does not share the host renderer's event listeners. Application-menu accelerators, however, operate at the BrowserWindow level and capture input regardless of which webContents (host or guest) has focus.
