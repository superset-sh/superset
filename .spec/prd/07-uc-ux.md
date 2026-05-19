---
stability: FEATURE_SPEC
last_validated: 2026-05-19
prd_version: 1.0.0
functional_group: UX
---

# Use Cases: Desktop UX Papercuts (UX)

| ID | Title | Linear |
|----|-------|--------|
| UC-UX-01 | Close the focused browser pane with Cmd+W instead of closing the whole window | [SUPER-794](https://linear.app/superset-sh/issue/SUPER-794) |
| UC-UX-02 | Display diff-viewer line numbers in correct sequential order | [SUPER-804](https://linear.app/superset-sh/issue/SUPER-804) |

---

## UC-UX-01 — Close the focused browser pane with Cmd+W instead of closing the whole window

**Linear:** [SUPER-794](https://linear.app/superset-sh/issue/SUPER-794) — High

When focus is inside a browser pane in the desktop app, pressing Cmd+W closes the entire `BrowserWindow` instead of just the focused pane. Everywhere else in the app Cmd+W correctly closes the focused pane / terminal. Browser panes render in an Electron `<webview>` (separate web contents), so the keystroke never reaches the renderer's `react-hotkeys-hook` handlers — the Electron File-menu `role: "close"` accelerator wins (`apps/desktop/src/main/lib/menu.ts:31`). This UC intercepts Cmd/Ctrl+W on the registered guest `webContents` (or removes the menu accelerator) and routes it to the existing pane-close handlers for v1 and v2 workspaces.

### Acceptance Criteria

- ☐ User can press Cmd+W while focus is inside a browser pane and have only that pane close
- ☐ System keeps the `BrowserWindow` open when Cmd+W is pressed inside a browser pane — no full-window close
- ☐ User can still close the whole window via Cmd+Shift+Q (existing Window-menu close accelerator preserved)
- ☐ User can still close the entire tab via Cmd+Shift+W (existing `CLOSE_TAB` hotkey preserved)
- ☐ User in a v1 workspace can close the focused browser pane via `requestPaneClose(focusedPaneId)` (`workspace/$workspaceId/page.tsx:227-231`)
- ☐ User in a v2 workspace can close the focused browser pane via `closePane` (`v2-workspace/.../useWorkspaceHotkeys/useWorkspaceHotkeys.ts:113-129`), and `paneRegistry[kind].onBeforeClose` runs as expected
- ☐ System keeps the File-menu "Close Window" affordance visible — only its implicit CmdOrCtrl+W accelerator is dropped or reassigned
- ☐ System (re)attaches the `before-input-event` listener on every `BrowserManager.register(paneId, webContentsId)` call so persistent-webview re-parenting (changing `webContentsId`) does not drop the listener

---

## UC-UX-02 — Display diff-viewer line numbers in correct sequential order

**Linear:** [SUPER-804](https://linear.app/superset-sh/issue/SUPER-804) — High

Line numbers in the desktop diff viewer render out of order, breaking the most basic reviewing affordance. The Linear ticket carries only the title — this UC scopes a numbering-correctness fix (no feature work). Old-side and new-side line numbers must render sequentially within each hunk and survive hunk boundaries without resetting incorrectly.

### Acceptance Criteria

- ☐ Reviewer can read the diff viewer with line numbers ordered sequentially within each hunk on both the old (removed-side) and new (added-side) gutters
- ☐ Diff viewer displays the correct original-file line number on every old-side row
- ☐ Diff viewer displays the correct new-file line number on every added/unchanged new-side row
- ☐ Line numbering survives hunk boundaries: a hunk starting at original line 312 continues counting up from 312 through its own rows, without resetting to 1 or jumping
- ☐ Reviewer can compare a multi-hunk diff and see no line-number duplication between adjacent rows on the same side
- ☐ System renders correct numbering for the edge cases of (a) pure additions (old-side blank), (b) pure deletions (new-side blank), and (c) replacement hunks (both sides populated)
- ☐ Integration / snapshot test covers a representative multi-hunk diff and locks the line-number output for both gutters
