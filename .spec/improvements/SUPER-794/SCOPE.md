---
ticket_id: SUPER-794
ticket_url: https://linear.app/superset-sh/issue/SUPER-794/cmdw-in-a-browser-pane-closes-the-whole-window-instead-of-the-focused
tracker: linear
branch: improvement/SUPER-794-cmdw-browser-pane-closes-window
status: proposal
---

# SUPER-794: CmdW in a browser pane closes the whole window instead of the focused pane

## Defect
**Symptom:** When keyboard focus is inside a browser pane (Electron `<webview>`), pressing Cmd+W closes the entire application window instead of just the focused pane.
**Observed:** Cmd+W triggers the File menu's "Close Window" action, terminating the entire BrowserWindow.
**Expected:** Cmd+W should close only the focused browser pane, matching the behavior when focus is in terminal or other pane types.

## Reproduction
1. Open the desktop app and create a browser pane (Cmd+Shift+B)
2. Click inside the browser pane to give it keyboard focus
3. Press Cmd+W
4. **Observed:** Entire window closes
5. **Expected:** Only the browser pane closes, other panes remain open

**Evidence:** Static code-path analysis at `.spec/improvements/SUPER-794/reproduction-trace.md`

## Root cause
The Electron `<webview>` tag runs guest web contents in a separate renderer process. When the guest has keyboard focus:
- Renderer-side `react-hotkeys-hook` handlers (CLOSE_PANE, CLOSE_TERMINAL) do not receive keystrokes
- Application-menu accelerators still fire at the BrowserWindow level
- `apps/desktop/src/main/lib/menu.ts:31` defines `{ label: "Close Window", role: "close" }`, which implicitly assigns `CmdOrCtrl+W` as the accelerator
- This accelerator triggers window-close instead of pane-close

**Root cause location:** `apps/desktop/src/main/lib/menu.ts:31` — implicit `CmdOrCtrl+W` accelerator on File menu's "Close Window" item.

## Specialist consultation
None required — all files in scope are within desktop app main/renderer process, no cross-domain concerns.

## Scope options

### Option 1: Minimum (Surgical)
**One-line:** Remove the implicit Cmd+W accelerator from the File menu and intercept keystrokes at the webview level.

**Files in scope:**
- `apps/desktop/src/main/lib/menu.ts` (remove implicit accelerator from File menu close item)
- `apps/desktop/src/main/lib/browser/browser-manager.ts` (add before-input-event listener)
- `apps/desktop/src/main/lib/trpc/routers/browser.ts` (emit pane-close event via tRPC)

**LOC budget:** ~60 LOC

**Acceptance criteria:**
- AC-1: Cmd+W pressed while focus is in a browser pane closes only that pane, not the entire window
- AC-2: Cmd+Shift+W still closes the entire tab (CLOSE_TAB behavior preserved)
- AC-3: Cmd+W pressed while focus is in terminal/other panes still closes the pane (no regression)
- AC-4: The File menu "Close Window" item remains visible but no longer captures Cmd+W

**Out of scope:**
- Removing the "Close Window" menu item (it stays, just without the accelerator)
- Modifying the Window menu's close accelerator (already Cmd+Shift+Q, unchanged)
- Changes to workspace hotkey registration or renderer hotkey infrastructure
- Refactoring browser-manager's listener cleanup patterns

**Risks:**
- Menu accelerator removal affects all panes globally — must verify terminal/other panes still close correctly
- before-input-event listener must be re-attached on webContents reparenting (browser-manager already re-registers)
- V1 and V2 workspaces use different close APIs (requestPaneClose vs closePane) — must emit generic event

**Mitigations:**
- Manual test: verify terminal/other panes still close with Cmd+W
- Emit tRPC event; let each workspace version subscribe and call its own close API
- Re-attach listener on every `register()` call (browser-manager already handles this pattern)

---

### Option 2: Moderate
**One-line:** Minimum + centralize all close accelerators to prevent similar webview-related accelerator bugs.

**Files in scope:**
- All files from Option 1
- `apps/desktop/src/main/lib/menu.ts` (add explicit accelerators for all window-level operations)
- `apps/desktop/src/renderer/hotkeys/registry.ts` (audit and document accelerator ownership)

**LOC budget:** ~120 LOC

**Acceptance criteria:**
- All AC from Option 1
- AC-5: All accelerators that should work in webviews are documented in a central registry
- AC-6: Window-level accelerators (close, minimize, zoom) use explicit keys, not implicit role defaults

**Out of scope:**
- Refactoring the entire menu system
- Changing non-close-related accelerators
- Modifying the renderer hotkey infrastructure

**Risks:**
- Scope creep into other menu items — risk of introducing regressions
- Documentation maintenance burden

**Mitigations:**
- Limit changes to close-related accelerators only
- Add inline comments explaining which accelerators are webview-safe

---

### Option 3: Strategic
**One-line:** Minimum + migrate from implicit menu-role accelerators to explicit IPC-routed hotkey system for all webview-aware operations.

**Files in scope:**
- All files from Option 1
- `apps/desktop/src/main/lib/menu.ts` (comprehensive explicit accelerator audit)
- `apps/desktop/src/main/lib/hotkey-router.ts` (NEW: central IPC hotkey router)
- `apps/desktop/src/renderer/hotkeys/registry.ts` (migrate webview-aware hotkeys to IPC routing)

**LOC budget:** ~300 LOC

**Acceptance criteria:**
- All AC from Option 1
- AC-7: All accelerators that must work in webviews route through IPC, not menu accelerators
- AC-8: Menu accelerators are documented as "host-renderer only" — never used for guest-webview operations
- AC-9: New accelerators that need webview support have clear pattern to follow

**Out of scope:**
- Removing menu accelerators entirely (they remain for non-webview contexts)
- Modifying Electron's core accelerator behavior

**Risks:**
- Large surface area — high regression risk
- Architectural change requires thorough testing across all pane types
- May be better suited for a dedicated refactor sprint

**Mitigations:**
- Treat as separate sprint — don't bundle with bug fix
- Comprehensive test coverage for all hotkey paths

---

## Considered alternatives
- **Remove "Close Window" menu item entirely** — Rejected because users expect a menu affordance for window close. The item can stay without the accelerator (Cmd+Shift+Q already handles window-close via Window menu).
- **Add Cmd+W handler in webview preload script** — Rejected because preload scripts run in guest context and cannot directly close panes in host renderer. Would require complex guest→host messaging anyway.
- **Use `webContents.on("before-input-event")` in browser-manager without tRPC** — Rejected because existing pattern uses tRPC subscriptions (`browser.onNewWindow`). Consistency matters; mixing tRPC and raw IPC for same feature is confusing.

## Deferred follow-ups
See `.spec/improvements/SUPER-794/follow-ups.md` for related improvements noticed during investigation but deliberately excluded from all three options.

## File-overlap pre-flight
No overlaps detected:
- No active `improvement-*` worktrees found
- No active `sprint-*` branches found
- All proposed files are specific to this bug fix

## Task chunks
1 — All options fit within a single implementation task. Option 3's architectural changes, while larger, are cohesive enough to be implemented together.
