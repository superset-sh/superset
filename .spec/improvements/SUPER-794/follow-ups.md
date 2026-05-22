# Deferred Follow-ups for SUPER-794 v2

Items explicitly excluded from all three scope options. Bigger improvements or separate sprints.

Carried over from v1 follow-ups (recovered via `gh pr diff 4783 -- .spec/improvements/SUPER-794/follow-ups.md`), plus v2-specific additions.

---

## Follow-up 1: Central Accelerator Registry (v1 carry-over)

**Description:** The desktop app has accelerators defined in multiple places:
- `menu.ts` (application menu accelerators, including implicit `role`-based ones)
- `registry.ts` (renderer hotkeys)
- Implicit `role` accelerators (e.g., `role: "close"` → `CmdOrCtrl+W`) not visible in code

**Impact:** When adding new accelerators, it is unclear where to define them or whether they will work in webviews. This defect recurred because the Cmd+W implicit accelerator was invisible.

**Proposed work:** Create a central registry mapping each accelerator to: owner (menu vs renderer vs IPC), webview-compatibility flag, scope (pane vs window vs tab). A declarative table eliminates this class of surprise.

**Why deferred:** Sprint-sized architectural work. All bug-fix options work without it.

---

## Follow-up 2: Webview Accelerator Testing Gap (v1 carry-over)

**Description:** No automated tests verify accelerator behavior when a `<webview>` has focus.

**Impact:** Bugs like SUPER-794 can ship undetected because tests only cover renderer-DOM focus scenarios.

**Proposed work:** Integration tests that: (1) open a browser pane with a real `<webview>`, (2) send synthetic keyboard events to the guest webContents, (3) verify the correct action occurs (pane-close, not window-close; webview-reload, not window-reload).

**Why deferred:** Requires Electron test environment setup with real webContents. Manual verification is the interim gate.

---

## Follow-up 3: Close Accelerator Inconsistency Across Platforms (v1 carry-over)

**Description:** `registry.ts` maps CLOSE_PANE / CLOSE_TERMINAL to `meta+w` on macOS but `ctrl+shift+w` on Windows/Linux (not `ctrl+w`).

**Impact:** Windows/Linux users may expect `Ctrl+W` to close the current pane (web browser convention).

**Proposed work:** Audit and standardize close accelerators across platforms. Requires product decision on whether `Ctrl+W` should close a pane on Windows/Linux.

**Why deferred:** UX decision; out of bug-fix scope.

---

## Follow-up 4: Browser Manager Listener Cleanup Refactor (v1 carry-over)

**Description:** `browser-manager.ts` has a cleanup loop pattern that iterates explicit Maps (`consoleListeners`, `contextMenuListeners`). Adding `beforeInputListeners` requires touching this loop in three places (`register`, `unregister`, `unregisterAll`). This is a fragile pattern — future listener additions will again be easy to miss.

**Proposed work:** Refactor to a single `listeners` map keyed by `paneId` containing an array of cleanup functions, eliminating the need to update multiple loops.

**Why deferred:** The v2 fix correctly adds `beforeInputListeners` to all three loops. The refactor reduces future maintenance burden but does not fix the current bug.

---

## Follow-up 5 (v2-new): Stale SUPER-794-cmdw-browser-pane-closes-window Worktree Cleanup

**Description:** The worktree at `.claude/worktrees/SUPER-794-cmdw-browser-pane-closes-window` contains the reverted v1 code (ahead of main by several commits). It touches the same files as the v2 fix. It should be removed or force-reset to `origin/main` to avoid confusion.

**Proposed work:** `git worktree remove .claude/worktrees/SUPER-794-cmdw-browser-pane-closes-window` after confirming the branch is not needed.

**Why deferred:** Housekeeping; the implementer should verify the worktree can be safely removed before doing so.

---

## Follow-up 6 (v2-new): Cmd+Shift+R in Webview Focus

**Description:** `role: "forceReload"` maps to `CmdOrCtrl+Shift+R`. When a webview is focused, Cmd+Shift+R currently reloads the host BrowserWindow (same as the BRIEF §3 Cmd+R non-webview case). The user may expect Cmd+Shift+R to force-reload the webview instead.

**Proposed work:** Evaluate whether Cmd+Shift+R should also be intercepted for webview focus to call `wc.reloadIgnoringCache()`. This is a scope extension beyond the current non-negotiables.

**Why deferred:** BRIEF §3 explicitly excludes `Cmd+Shift+R` from v2 scope unless a regression risk is surfaced. No regression exists in the current proposal (Cmd+Shift+R is not in the `before-input-event` handler). Raising as a potential future enhancement only.
