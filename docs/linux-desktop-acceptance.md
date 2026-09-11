# Linux desktop acceptance

What the desktop app must do on Linux to count as supported, with the
evidence for each row. Verified on a cloud sandbox desktop (Debian 12, Xfce on
Xvnc, 1920×1200 @ 96 DPI) running the dev stack from `/workspace`, driven over
VNC screenshots and CDP. "Before" is `main` at cd331568d.

Rows are checked only with evidence in the app, never from a code read.

## 1. Window chrome

- [ ] **1.1 Window controls on every screen** — minimize, maximize/restore and
  close are reachable on the sign-in, onboarding, new-workspace, dashboard and
  workspace routes. Before: `frame: false` + `titleBarStyle: "hidden"` on all
  platforms; the React `WindowControls` render only in the TopBar / v2 tab
  bar, so the sign-in screen (first thing a new install shows) has no way to
  close the window.
- [ ] **1.2 Drag regions** — the window moves by its top strip on every route
  without swallowing clicks on controls.
- [ ] **1.3 Maximize/restore and double-click** — the overlay's maximize
  toggles restore; the window remembers bounds across restarts.
- [ ] **1.4 App menu** — File/Edit/View/Window/Resources/Help render with
  Ctrl-based accelerators; Settings and Check for Updates are reachable (on
  macOS they live in the app menu, which Linux has no equivalent of); the
  menu bar is reachable with Alt when auto-hidden.
- [ ] **1.5 Close and quit semantics** — closing the last window quits the app
  (no invisible process left behind); `Ctrl+Q` quits; the tray is either
  present with a sensible menu or absent, never half-initialised.

## 2. host-service on Linux

- [ ] **2.1 Start/stop** — host-service starts with the app, survives window
  close while the app runs, and stops on quit.
- [ ] **2.2 Terminals** — a PTY opens with the user's shell (`$SHELL`, falling
  back to `/bin/bash`), resize works, scrollback restores.
- [ ] **2.3 Git and files** — status, diff, branch switch, file tree and file
  watching (inotify) work in a workspace.
- [ ] **2.4 Notifications and sounds** — desktop notifications show through
  the freedesktop notification daemon; sounds play through `paplay` or are
  silently skipped when there is no audio server.
- [ ] **2.5 Port forwarding and background processes** — a dev server started
  in a terminal is detected as a port and survives closing the pane.

## 3. Browser and system integration

- [ ] **3.1 External links** open the system browser (`xdg-open`).
- [ ] **3.2 Downloads** land in the user's downloads directory.
- [ ] **3.3 Clipboard** copy/paste works in terminals and editors.
- [ ] **3.4 Deep links** — `superset://` registers via the desktop entry.

## 4. Packaging

- [ ] **4.1 AppImage builds** from `electron-builder.ts` on a Linux runner.
- [ ] **4.2 Desktop entry and icon** — the running app shows the Superset icon
  and name in the dock / task switcher (`WM_CLASS` matches the desktop entry).

## 5. Platform audit

- [ ] **5.1 Every `process.platform === "darwin"` branch** in
  `apps/desktop/src/main` and `packages/host-service` has a Linux counterpart
  or a deliberate no-op noted here.
