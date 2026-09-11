# Linux desktop acceptance

What the desktop app must do on Linux to count as supported, with the
evidence for each row. Verified on a cloud sandbox desktop (Debian 12, Xfce on
Xvnc, 1920×1200 @ 96 DPI) running the dev stack from `/workspace`, driven over
VNC screenshots and CDP. "Before" is `main` at cd331568d.

Rows are checked only with evidence in the app, never from a code read.

## 1. Window chrome

- [x] **1.1 Window controls on every screen** — minimize, maximize/restore and
  close are reachable on the sign-in, onboarding, new-workspace, dashboard and
  workspace routes. (After: Electron's window-controls overlay, coloured from
  the theme store; screenshots of sign-in, onboarding and the packaged build
  on the sandbox show the three buttons top-right where before there were
  none.) Before: `frame: false` + `titleBarStyle: "hidden"` on all
  platforms; the React `WindowControls` render only in the TopBar / v2 tab
  bar, so the sign-in screen (first thing a new install shows) has no way to
  close the window.
- [ ] **1.2 Drag regions** — the window moves by its top strip on every route
  without swallowing clicks on controls. Found on the packaged build: views
  that hide the TopBar (workspaces board, tasks, pull requests, task detail,
  new workspace) put their own right-hand controls under the overlay — the
  workspaces board's "Create workspace" button was half covered. Each now
  ends its header row with the overlay inset; needs a rebuild to verify.
- [ ] **1.3 Maximize/restore and double-click** — the overlay's maximize
  toggles restore; the window remembers bounds across restarts.
- [x] **1.4 App menu** — File/Edit/View/Window/Resources/Help render with
  Ctrl-based accelerators; Settings and Check for Updates are reachable (on
  macOS they live in the app menu, which Linux has no equivalent of). (After,
  on the rebuilt AppImage: the ≡ button at the start of the top strip pops
  File / Edit / View / Window / Resources / Help — screenshot; File carries
  Settings…, Check for Updates…, Quit and Quit Superset Completely.)
  Before: with `titleBarStyle: "hidden"` the menu bar is gone entirely — Alt
  reveals nothing (screenshot), so the menu is keyboard-only. Fix on this
  branch: an application-menu button in the top strip on Windows/Linux that
  pops the app menu, plus Settings / Check for Updates / Quit in File — needs
  a rebuild to verify.
- [x] **1.5 Close and quit semantics** — closing the last window quits the app
  (no invisible process left behind); `Ctrl+Q` quits; the tray is either
  present with a sensible menu or absent, never half-initialised. (After, on
  the rebuilt AppImage: close → "Quit Superset?" over the window → Cancel
  keeps it (1 window, app alive) → close → Quit → main process gone. The
  terminal host and pty-daemon deliberately outlive a plain quit, as on
  macOS, so terminals survive a relaunch; "Quit Superset Completely" in File
  tears them down. No tray on Linux.)
  Before: closing the last window left the process running with no window
  (no `window-all-closed` handler). Found on the packaged build: the close
  button destroys the window first and the quit confirmation then opens with
  no window behind it — two clicks stacked two dialogs, and a Cancel leaves an
  invisible process. Fix on this branch: confirm on the last window's close
  (Cancel keeps the window), quit without a second prompt once it is gone,
  and one dialog at a time.

## 2. host-service on Linux

- [x] **2.1 Start/stop** — host-service starts with the app, survives window
  close while the app runs, and stops on quit. (Packaged build log:
  `[host-service:…] listening on port 48503` at launch; after the confirmed
  quit only the sandbox's own host-service remains.)
- [x] **2.2 Terminals** — a PTY opens with the user's shell (`$SHELL`, falling
  back to `/bin/bash`), resize works, scrollback restores. (Every cloud
  workspace is host-service on Linux: `docs/cloud-sandbox-acceptance.md` 5.2
  — `echo hi`, resize, follow-up prompt — and the resume path in 5.5/6.x.)
- [x] **2.3 Git and files** — status, diff, branch switch, file tree and file
  watching (inotify) work in a workspace. (cloud acceptance 5.3: tree and
  Changes tab on a Linux host-service; branch switch via the fork bootstrap.)
- [ ] **2.4 Notifications and sounds** — desktop notifications show through
  the freedesktop notification daemon; sounds play through `paplay` or are
  silently skipped when there is no audio server. (Sandbox: `xfce4-notifyd`
  runs and `notify-send` draws a bubble — screenshot; `paplay` is present,
  no PulseAudio, and `play-sound.ts` already falls back to `aplay` and
  completes on failure. The app's own `Notification` path is still to be
  exercised on the packaged build.)
- [x] **2.5 Port forwarding and background processes** — a dev server started
  in a terminal is detected as a port and survives closing the pane. (cloud
  acceptance: the dev stack's api/web/Electron run detached under tmux on the
  sandbox and show in the ports pill; verified on ws-4427… and ws-1e35….)

## 3. Browser and system integration

- [ ] **3.1 External links** open the system browser (`xdg-open`). (Sandbox:
  `xdg-open https://…` reaches Chrome once the sandbox image's browser
  wrapper is in place — the bare binary refuses to run as root, a sandbox
  quirk fixed on the sandbox PR, not an app issue; the app's
  `shell.openExternal` path is still to be exercised on the packaged build.)
- [ ] **3.2 Downloads** land in the user's downloads directory.
- [x] **3.3 Clipboard** copy/paste works in terminals and editors.
  (`navigator.clipboard.writeText` in the packaged renderer → `xclip -o`
  reads it back on the X server.)
- [ ] **3.4 Deep links** — `superset://` registers via the desktop entry.
- [ ] **3.5 Diff worker pool** — `@pierre/diffs` logs `Worker error` seven
  times right after sign-in on the sandbox desktop (dev server, root,
  `--no-sandbox`); establish whether Linux-specific or dev-only and whether
  diffs still render.
- [ ] **3.6 Dev renderer under Chromium's request budget** — on the sandbox
  the unbundled dev renderer loses a few random modules per load to
  `net::ERR_INSUFFICIENT_RESOURCES` (Chromium's per-renderer cap on
  outstanding request cost, hit by the large source-mapped modules the dev
  server serves), after which nothing mounts. The bench therefore runs the
  `electron-vite build` output; confirm the packaged app never sees it.

## 4. Packaging

- [x] **4.1 AppImage builds** from `electron-builder.ts` on a Linux runner.
  (`electron-vite build` needs a 12 GB Node heap on the sandbox — the default
  4 GB dies on "Ineffective mark-compacts" — then `electron-builder --linux
  AppImage` produced `superset-1.28.0-x86_64.AppImage` (560 MB) and
  `linux-unpacked/`, which runs to the onboarding screen. Running the bare
  `dist/` without packaging is not a valid bench: its chunks fail to load over
  `file://`. `bun run build`'s `prebuild` step is what overlays the plugin
  templates; skipping it logs a `superset-standup` ENOENT at boot.)
- [x] **4.2 Desktop entry and icon** — the running app shows the Superset icon
  and name in the dock / task switcher (`WM_CLASS` matches the desktop entry).
  (After: the AppImage ships `superset.desktop` with `Icon=superset` and
  `StartupWMClass=superset`, the binary is `superset`, the window reports
  `WM_CLASS superset`, and the Plank dock shows the Superset mark for the
  running app — screenshot.)
  Before: the binary is `@supersetdesktop` (package name mangled), the
  desktop entry says `StartupWMClass=Superset` while the window reports
  `superset`, and the window carries no icon, so the dock shows a generic
  entry. Fix on this branch: `executableName: "superset"`,
  `StartupWMClass=superset`, `icon` on the window — needs a rebuild to verify.

- [ ] **4.3 Bundled plugin skills in the asar** — the packaged app logs
  `ENOENT … templates/plugin/skills/<skill>/agents not found in app.asar` for
  every skill at boot, even after the full `prebuild`; the folders exist in
  the repo (`plugins/superset/skills/*/agents/openai.yaml`) and the copy step
  is recursive. Establish whether this is Linux/asar-specific or also true of
  macOS builds.

## 5. Platform audit

- [ ] **5.1 Every `process.platform === "darwin"` branch** in
  `apps/desktop/src/main` and `packages/host-service` has a Linux counterpart
  or a deliberate no-op noted here:

  | Branch | Linux |
  | --- | --- |
  | `windows/main.ts` frameless + traffic lights | window-controls overlay (this branch) |
  | `lib/menu.ts` application menu (Settings, Updates, Quit) | added to File (this branch); `windowMenu` role is macOS-only, Window keeps minimize/zoom/close |
  | `lib/tray` | macOS-only by design; Linux quits on last window instead (this branch) |
  | `lib/dock-icon.ts` | macOS dock badge; Linux uses the desktop entry icon (4.2) |
  | `lib/play-sound.ts` | `paplay` branch exists; needs an audio server (2.4) |
  | `lib/host-service-coordinator.ts` spawn-helper launcher | macOS crash-port workaround; plain spawn elsewhere, by design |
  | `lib/local-network-permission.ts`, `lib/apple-events-permission.ts` | macOS permissions; no-ops elsewhere |
  | `lib/browser/chrome-cookie-import.ts` | macOS keychain; Linux cookie import unsupported (noted, not in scope) |
  | `index.ts` system font protocol | macOS font dirs only; Linux relies on fontconfig (2.x) |
  | host-service `usage/history/cursor.ts` | macOS path only; Linux path owed |
  | host-service `ai-workspace-names.ts` shell | `/bin/bash` fallback exists |
  | host-service `spawn-failure-diagnostics.ts` | `/proc/self/fd` branch exists |
