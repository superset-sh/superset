---
source: ticket
improvement_id: SUPER-794
ticket_id: SUPER-794
ticket_url: https://linear.app/superset-sh/issue/SUPER-794/cmdw-in-a-browser-pane-closes-the-whole-window-instead-of-the-focused
tracker: linear
title: "Cmd+W in a browser pane closes the whole window instead of the focused pane (v2 — re-fix after revert; add focus-aware Cmd+R)"
labels: []
fetched_at: 2026-05-22T17:10:00Z
linear_status_at_fetch: Done
prior_pr: https://github.com/superset-sh/superset/pull/4783
revert_pr: https://github.com/superset-sh/superset/pull/4844
---

# Brief

This is the **second investigation cycle** for SUPER-794. The first cycle (PR #4783) merged on 2026-05-21 but was reverted on 2026-05-22 (PR #4844) because the fix removed `CmdOrCtrl+R` from the View→Reload menu accelerator to let the focused webview intercept Cmd+R — which broke Cmd+R reload everywhere outside a browser pane (the app could no longer be refreshed).

The Linear ticket auto-completed when the original PR merged and has **not been reopened**; treat this brief as authoritative for the v2 attempt.

---

## §1 — Original Linear ticket (verbatim, v1 scope)

> **Title:** Cmd+W in a browser pane closes the whole window instead of the focused pane
> **Created by:** Satya Patel, 2026-05-18
> **Priority:** High
> **Project:** Justin
> **Assignee:** Justin Rich
>
> ### Context
>
> When focus is inside a browser pane in the desktop app, pressing Cmd+W closes the entire window instead of just the focused pane. Everywhere else in the app Cmd+W correctly closes the focused pane/terminal. Browser panes render content in an Electron `<webview>`, which runs in a separate web contents, so the keystroke never reaches the renderer's `react-hotkeys-hook` handlers — the Electron application-menu accelerator wins and closes the `BrowserWindow`.
>
> ### Implementation notes (HINTS only — not constraints)
>
> #### Files
> - `apps/desktop/src/main/lib/menu.ts:31` — File menu `{ label: "Close Window", role: "close" }`. Electron's `role: "close"` defaults its accelerator to `CmdOrCtrl+W`. This is the menu item that captures Cmd+W when a `<webview>` has focus.
> - `apps/desktop/src/main/lib/menu.ts:72` — Window menu `{ role: "close", accelerator: closeAccelerator }` already overrides the Window-menu close to `CmdOrCtrl+Shift+Q`, but the File-menu `role: "close"` at line 31 still carries the implicit `CmdOrCtrl+W`.
> - `apps/desktop/src/renderer/hotkeys/registry.ts:341` (`CLOSE_PANE`, `meta+w`) and `:419` (`CLOSE_TERMINAL`, `meta+w`) — the renderer-side close hotkeys. These fire correctly when focus is in renderer DOM but are bypassed when focus is in a `<webview>`.
> - `apps/desktop/src/main/lib/browser/browser-manager.ts:32` — `BrowserManager.register(paneId, webContentsId)` already holds each browser pane's `webContents`. This is the natural place to attach a `before-input-event` listener.
> - `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/BrowserPane/hooks/usePersistentWebview/usePersistentWebview.ts:118` — existing tRPC subscription pattern (`browser.onNewWindow`) the renderer uses to react to main-process browser events; a pane-close event can follow the same pattern.
>
> #### Approach
>
> Stop the application menu from owning `Cmd+W` and instead route it to the focused browser pane. Either remove the implicit accelerator from the File-menu `role: "close"` item (`menu.ts:31`) so `CmdOrCtrl+W` is no longer a menu accelerator, or intercept the keystroke before the menu sees it. The cleanest scoped fix: in `browserManager.register`, add a `webContents.on("before-input-event", ...)` listener that detects Cmd/Ctrl+W, calls `event.preventDefault()`, and emits a per-pane event (mirroring `new-window:${paneId}` / `context-menu-action:${paneId}`). `usePersistentWebview` subscribes to that event and triggers the existing pane-close path — `requestPaneClose(focusedPaneId)` for v1 (`workspace/$workspaceId/page.tsx:227-231`) or `closePane` for v2 (`v2-workspace/.../useWorkspaceHotkeys/useWorkspaceHotkeys.ts:113-129`). Confirm `Cmd+Shift+W` (`CLOSE_TAB`) still closes the whole tab.
>
> #### Related code
> - `apps/desktop/src/renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/page.tsx:227` — v1 `CLOSE_TERMINAL` handler that calls `requestPaneClose`.
> - `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useWorkspaceHotkeys/useWorkspaceHotkeys.ts:113` — v2 `CLOSE_PANE` handler that calls `closePane` (and runs `paneRegistry[kind].onBeforeClose`).
>
> #### Gotchas
>
> - The `<webview>` runs guest web contents in a separate process; renderer keyboard hooks never see its keystrokes — this is why the menu accelerator wins. The fix must live in the main process (`before-input-event` on the guest `webContents`) or remove the menu accelerator.
> - Browser panes use a persistent-webview registry that reparents the `<webview>` between visible and hidden containers; the `webContentsId` can change after reparenting (`browser-manager.ts:32-43` re-registers on change). Any `before-input-event` listener must be (re)attached on every `register` call, not just the first.
> - Don't break the menu's "Close Window" affordance — keep the File-menu item, just drop or reassign its `CmdOrCtrl+W` accelerator. `Cmd+Shift+Q` already maps to window close via the Window menu.
> - v1 and v2 workspaces close panes through different code paths (`requestPaneClose` vs `closePane`); verify the fix covers both.

---

## §2 — v1 attempt + regression (PR #4783 → reverted by PR #4844)

**What PR #4783 shipped** (5 source files + bun.lock, +475/-5):
- Removed `role: "close"` from File→Close Window menu item (line 31) → stopped the menu from owning Cmd+W
- Removed `CmdOrCtrl+R` accelerator from View→Reload menu item → **this broke Cmd+R everywhere outside browser panes**
- Added `webContents.on("before-input-event", ...)` listener in `browser-manager.ts` that intercepted **both** Cmd+W and Cmd+R when a webview was focused
- Added tRPC subscriptions `onClosePane` and `onReloadPane` (later named differently — see diff)
- Renderer-side `usePersistentWebview` (v1 + v2 variants) subscribed to both events and called `requestPaneClose` / `closePane` (close) and the webview's `.reload()` method (reload)

**Why it was reverted** (PR #4844, merged 2026-05-22T15:12:05Z, deletions: -475):
- Outside a focused browser pane there is no longer ANY Cmd+R handler — the menu accelerator was the source, and the PR stripped it. Result: **the entire desktop app became unrefreshable.** A reviewer/user discovered this almost immediately after merge and full-reverted.
- The revert was scoped to "restore Cmd+R refresh." A side-effect of the full revert: the legitimate Cmd+W → close-pane fix (the original SUPER-794) is undone too. Cmd+W in a browser pane once again closes the whole window. The revert PR explicitly says: *"SUPER-794 should be reopened and re-fixed in a way that doesn't remove the Reload accelerator."*

**Prior artifacts** (deleted from `main` by revert PR #4844, but accessible via `gh pr diff 4783`):
- `.spec/improvements/SUPER-794/SCOPE.md` (v1) — binding scope chosen for the v1 attempt
- `.spec/improvements/SUPER-794/TICKET.md` (v1) — Linear ticket snapshot (superseded by this BRIEF.md)
- `.spec/improvements/SUPER-794/reproduction-trace.md` (v1) — static code-path analysis proving the Cmd+W bug
- `.spec/improvements/SUPER-794/follow-ups.md` (v1) — four deferred follow-ups, still relevant to v2:
  1. Central Accelerator Registry (architectural)
  2. Webview accelerator testing gap (test infra)
  3. Close accelerator inconsistency Mac vs Win/Linux (UX decision)
  4. Browser-manager listener cleanup refactor (maintainability)

Investigator MUST consult the v1 SCOPE.md and reproduction-trace.md (via `gh pr diff 4783 -- .spec/improvements/SUPER-794/` from the worktree) as prior art to avoid re-doing the static-analysis work. The v1 root-cause analysis for Cmd+W stands; the v1 binding scope's mistake was bundling unscoped Cmd+R work that broke a separate, working accelerator.

---

## §3 — v2 requirements (from the user, 2026-05-22)

The user's framing, verbatim:

> we just had to revert this PR because it bricked the ability to do a hard reload of the entire site. Our changes prevent window level actions for cmd W which is ok but cmd R for NON webview focus pains [panes] need to reload the window. When a webview is the focus it needs to reload the webview

Interpretation (subject to investigator validation):

### Cmd+W (original ticket — re-fix)
- **Window focus / non-webview pane focus / no pane focus:** Cmd+W must NOT close the entire BrowserWindow. (User: *"prevent window level actions for cmd W which is ok"* — the v1 approach of removing the implicit menu accelerator is acceptable.)
- **Webview pane focus:** Cmd+W must close that webview's pane (the original SUPER-794 requirement).

### Cmd+R (NEW requirement — not in original Linear ticket)
- **Window focus / non-webview pane focus / no pane focus:** Cmd+R MUST reload the entire BrowserWindow (the standard Chromium/Electron View→Reload behavior). **This is the behavior PR #4783 broke and must be preserved/restored.**
- **Webview pane focus:** Cmd+R must reload only that webview, not the whole window.

### Out-of-scope confirmation
- Cmd+Shift+W (CLOSE_TAB) — already working; preserve.
- Cmd+Shift+Q (window close) — already mapped from the Window menu; preserve.
- Cmd+Shift+R (hard-reload variant) — not in this scope unless investigator surfaces a regression risk.
- Devtools shortcuts — out of scope.

---

## §4 — Architectural seam (investigator hint, not a constraint)

The v1 failure mode reveals a **focus-routing seam**: for any accelerator that has both a window-level meaning (BrowserWindow.reload, BrowserWindow.close) AND a pane-level meaning (webview.reload, pane.close), the menu accelerator system + the webview interception system must **cooperate** instead of one stripping the other. Possible directions (investigator to evaluate, not prescribed):

- **Direction A — preserve menu accelerators; webview only previews/blocks:** Keep `CmdOrCtrl+R` on View→Reload AND keep the menu's window-close affordance; webview's `before-input-event` listener detects keystroke, calls `event.preventDefault()` (which Chromium-side stops the menu from firing too), and dispatches the pane-level action. Risk: `preventDefault` on `before-input-event` for menu-accelerator keystrokes — does Electron actually honor it? Needs verification.
- **Direction B — route everything through the renderer:** Move pane-level Cmd+R and Cmd+W into renderer hotkeys + a focus-determining helper; webview's `before-input-event` forwards keystrokes to renderer via tRPC; the renderer is the only place that decides "window action or pane action?". Risk: re-introduces the v1 round-trip via tRPC for a keystroke that should feel instant.
- **Direction C — declarative accelerator registry:** A single table maps `{ keystroke, focus-context } → handler`. The menu, the renderer hotkeys, and the webview interceptor all consult it. Heavier; matches deferred follow-up #1.

The investigator decides which direction(s) the three scope options reflect. Direction A (preserve-and-preview) is the most surgical and should be one of the options; the others are open to investigator judgment.

---

## §5 — Non-negotiables for v2

1. **`CmdOrCtrl+R` MUST reload the BrowserWindow** when focus is not in a webview pane. The v1 mistake — stripping this accelerator — cannot recur. This is the hard regression line.
2. **The fix MUST cover both v1 and v2 workspace code paths** (`workspace/$workspaceId/` and `v2-workspace/$workspaceId/`) — see Gotcha 4 in §1.
3. **The fix MUST tolerate webview reparenting** — `before-input-event` listeners need re-attachment on `webContentsId` change (Gotcha 2 in §1).
4. **The fix MUST NOT touch auth, secrets, IPC security boundaries, or any package outside `apps/desktop/`** unless the investigator surfaces an explicit reason and flags it.
5. **The Linear ticket SUPER-794 is currently `Done`.** When the v2 PR merges, the implementer/PR-creator should reopen + re-resolve the ticket (or open a follow-up). The scope mirror at the end of this skill will post a comment to SUPER-794 with the v2 binding scope.
