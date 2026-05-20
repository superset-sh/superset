# Deferred Follow-ups for SUPER-794

Bigger improvements noticed during investigation that are explicitly NOT included in any of the three scope options.

## Follow-up 1: Central Accelerator Registry
**Description:** The desktop app has accelerators defined in multiple places:
- `menu.ts` (application menu accelerators)
- `registry.ts` (renderer hotkeys)
- Implicit `role` accelerators (not visible in code)

**Impact:** When adding new accelerators, it's unclear where to define them or whether they'll work in webviews.

**Proposed work:** Create a central registry that maps each accelerator to its:
- Owner (menu vs renderer vs IPC)
- Webview-compatibility flag
- Intended scope (pane-level vs window-level vs tab-level)

**Why deferred:** This is an architectural improvement that would benefit from a dedicated refactor sprint. All three bug-fix options work without it.

---

## Follow-up 2: Webview Accelerator Testing Gap
**Description:** No automated tests verify that accelerators work correctly when a `<webview>` has focus.

**Impact:** Bugs like SUPER-794 can slip through because tests only cover renderer-DOM focus scenarios.

**Proposed work:** Add integration tests that:
1. Create a browser pane with a real `<webview>`
2. Send synthetic keyboard events to the guest webContents
3. Verify the correct action occurs (pane-close, not window-close)

**Why deferred:** Requires test infrastructure work (Electron test environment setup). The bug fix can be verified manually in the interim.

---

## Follow-up 3: Close Accelerator Inconsistency Across Platforms
**Description:** The registry defines different close accelerators for Windows/Linux vs Mac:
- Mac: `meta+w` (Cmd+W) for close pane
- Windows/Linux: `ctrl+shift+w` for close pane (not `ctrl+w`)

**Impact:** Windows/Linux users may expect `Ctrl+W` to close the current pane (browser standard), but it's not bound.

**Proposed work:** Audit and standardize close accelerators across platforms. Consider whether `Ctrl+W` should close pane on Windows/Linux (web browser convention) or remain `Ctrl+Shift+W`.

**Why deferred:** This is a UX decision that requires product input. The bug fix only addresses Mac behavior (the reported issue).

---

## Follow-up 4: Browser Manager Listener Cleanup
**Description:** `browser-manager.ts:32-44` has a listener cleanup pattern that only handles `consoleListeners` and `contextMenuListeners`. If we add a `beforeInputListener`, it must be included in the cleanup maps.

**Current code:**
```typescript
for (const map of [this.consoleListeners, this.contextMenuListeners]) {
  const cleanup = map.get(paneId);
  if (cleanup) {
    cleanup();
    map.delete(paneId);
  }
}
```

**Impact:** If we forget to add the new listener to this cleanup loop, we'll leak listeners on webContents reparenting.

**Proposed work:** Refactor to a single `listeners` map that tracks all cleanup functions by type, eliminating the risk of forgetting to add new listeners to the cleanup loop.

**Why deferred:** The fix can correctly add the new listener to the existing pattern. This refactor is about reducing future maintenance burden, not fixing the current bug.
