# SUPER-794 v1 Prior Art Excerpt

Recovered from `gh pr diff 4783` on 2026-05-22. Full diff available via `gh pr diff 4783` from the repo root.

---

## v1 Root Cause (from reproduction-trace.md)

**Root cause location:** `apps/desktop/src/main/lib/menu.ts:31` — implicit `CmdOrCtrl+W` accelerator on File menu's "Close Window" item.

The causal chain:
1. Electron `<webview>` runs guest web contents in a separate renderer process.
2. When guest webContents has keyboard focus, renderer-side `react-hotkeys-hook` handlers do not receive keystrokes.
3. Application-menu accelerators still fire at the BrowserWindow level.
4. `menu.ts:31`'s `{ label: "Close Window", role: "close" }` implicitly assigns `CmdOrCtrl+W`.
5. This triggers window-close instead of pane-close.

---

## v1 File:Line References (all verified in post-revert code)

| Reference | Status | Note |
|-----------|--------|------|
| `menu.ts:31` — `{ label: "Close Window", role: "close" }` | CONFIRMED | Line 31 exactly |
| `menu.ts:14` — `reloadAccelerator = "CmdOrCtrl+R"` | CONFIRMED | Present (was deleted by v1, restored by revert) |
| `menu.ts:51` — `accelerator: reloadAccelerator` on View→Reload | CONFIRMED | Present (was deleted by v1, restored by revert) |
| `menu.ts:72` — `{ role: "close", accelerator: closeAccelerator }` Window menu | CONFIRMED | Line 72 exactly |
| `registry.ts:341` — `CLOSE_PANE: { key: { mac: L("meta+w"), ... } }` | CONFIRMED | Line 341 exactly |
| `registry.ts:419` — `CLOSE_TERMINAL: { key: { mac: L("meta+w"), ... } }` | CONFIRMED | Line 419 exactly |
| `browser-manager.ts:32` — `register(paneId, webContentsId)` | CONFIRMED | Line 32 exactly |
| `browser-manager.ts:36` — cleanup loop for `consoleListeners, contextMenuListeners` | CONFIRMED | Lines 36-43, no `beforeInputListeners` (reverted) |

---

## v1 Mistake: CmdOrCtrl+R Accelerator Removed

The v1 menu.ts diff (from `gh pr diff 4783`) shows the specific lines that caused the regression:

```diff
-const reloadAccelerator = "CmdOrCtrl+R";
 const closeAccelerator = "CmdOrCtrl+Shift+Q";

...

         {
           label: "Reload",
-          accelerator: reloadAccelerator,
+          // Note: no longer has CmdOrCtrl+R accelerator...
           click: () => {
             BrowserWindow.getFocusedWindow()?.reload();
           },
```

This removed `CmdOrCtrl+R` from `menu.ts` entirely, relying solely on the `before-input-event` listener to handle Cmd+R. But `before-input-event` only fires when a webview guest webContents is focused — so when no webview is focused, there was no Cmd+R handler at all.

---

## v1 What Worked (Cmd+W fix — correct approach, re-usable)

### browser-manager.ts additions (v1, from gh pr diff 4783):

```typescript
private beforeInputListeners = new Map<string, () => void>();

// In register():
for (const map of [this.consoleListeners, this.contextMenuListeners, this.beforeInputListeners]) { ... }
this.setupBeforeInput(paneId, wc);

// In unregister():
for (const map of [this.consoleListeners, this.contextMenuListeners, this.beforeInputListeners]) { ... }

private setupBeforeInput(paneId: string, wc: Electron.WebContents): void {
  const handler = (event: Electron.Event, input: Electron.Input): void => {
    const isCloseKey =
      input.type === "keyDown" &&
      (input.key === "w" || input.key === "W") &&
      (input.meta || input.control) &&
      !input.shift &&
      !input.alt;

    if (isCloseKey) {
      event.preventDefault();
      this.emit(`close-pane:${paneId}`);
    }

    const isReloadKey =
      (input.key === "r" || input.key === "R") &&
      (input.meta || input.control) &&
      !input.shift &&
      !input.alt;

    if (isReloadKey) {
      event.preventDefault();
      this.emit(`reload-pane:${paneId}`);
    }
  };
  wc.on("before-input-event", handler);
  this.beforeInputListeners.set(paneId, () => { ... wc.off("before-input-event", handler) ... });
}
```

### menu.ts change (v1 — CORRECT for Cmd+W, carry forward):

```diff
-{ label: "Close Window", role: "close" },
+{
+  label: "Close Window",
+  click: () => {
+    const focused = BrowserWindow.getFocusedWindow();
+    if (focused) focused.close();
+  },
+},
```

This removes the implicit `CmdOrCtrl+W` accelerator. The File menu still has a "Close Window" item but it is now click-only. Window close is still available via the Window menu's `CmdOrCtrl+Shift+Q`.

### menu.ts change (v1 — WRONG for Cmd+R, DO NOT carry forward):

```diff
-accelerator: reloadAccelerator,   // ← DO NOT REMOVE THIS IN v2
```

This line must be preserved in v2. The `CmdOrCtrl+R` accelerator on View→Reload must remain.

---

## v1 tRPC Router additions (browser.ts — correct pattern, re-usable):

```typescript
onClosePane: publicProcedure
  .input(z.object({ paneId: z.string() }))
  .subscription(({ input }) => {
    return observable<void>((emit) => {
      const handler = () => { emit.next(); };
      browserManager.on(`close-pane:${input.paneId}`, handler);
      return () => { browserManager.off(`close-pane:${input.paneId}`, handler); };
    });
  }),

onReloadPane: publicProcedure
  .input(z.object({ paneId: z.string() }))
  .subscription(({ input }) => {
    return observable<void>((emit) => {
      const handler = () => { emit.next(); };
      browserManager.on(`reload-pane:${input.paneId}`, handler);
      return () => { browserManager.off(`reload-pane:${input.paneId}`, handler); };
    });
  }),
```

---

## Electron before-input-event: Verified Behavior

**Source:** https://www.electronjs.org/docs/latest/api/web-contents (raw markdown: https://raw.githubusercontent.com/electron/electron/main/docs/api/web-contents.md)

**Canonical quote from Electron docs:**
> "Calling `event.preventDefault` will prevent the page `keydown`/`keyup` events **and the menu shortcuts**."

This means: `event.preventDefault()` in a `before-input-event` handler on the guest webContents DOES prevent the menu accelerator from firing. The v1 Cmd+R regression was not caused by `preventDefault` failing — it was caused by removing the accelerator from the menu, which meant Cmd+R had no handler when no webview was focused.

**Consequence for v2 minimum option:** Keep `CmdOrCtrl+R` in the menu. Add Cmd+R to the `before-input-event` handler with `event.preventDefault()`. When a webview is focused: the guest webContents fires `before-input-event`, `preventDefault()` stops the menu accelerator, and the pane reloads. When no webview is focused: no `before-input-event` fires on any registered webContents (they're not focused), so the menu's `CmdOrCtrl+R` fires normally. No regression.

---

## v1 Deferred Follow-ups (from follow-ups.md)

1. Central Accelerator Registry — architectural, deferred
2. Webview Accelerator Testing Gap — test infra, deferred  
3. Close Accelerator Inconsistency Across Platforms — UX decision, deferred
4. Browser Manager Listener Cleanup Refactor — maintainability, deferred
