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
- [x] **1.2 Drag regions** — the window moves by its top strip on every route
  without swallowing clicks on controls. (After, on the rebuilt AppImage: a
  press-drag on the strip moves the window 100,80 → 200,137; the board's
  Display / List / Board controls sit clear of the three overlay buttons —
  screenshot.) Found on the packaged build: views that hide the TopBar
  (workspaces board, tasks, pull requests, task detail, new workspace) put
  their own right-hand controls under the overlay — the workspaces board's
  "Create workspace" button was half covered. Each now ends its header row
  with the overlay inset.
- [x] **1.3 Maximize/restore and double-click** — the overlay's maximize
  toggles restore; the window remembers bounds across restarts. (Packaged
  build, xdotool + `_NET_WM_STATE`: overlay maximize → 1920×1108 at 0,29
  maximized; again → 1600×1000 at 100,80; double-click on the strip toggles
  the same; after a move + resize to 1400×900 at 200,137, quit → relaunch
  restores 1400×900 at 200,137 from `window-state.json`.)
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

- [ ] **1.6 Every screen clear of the overlay** — sampled the overlay area
  (`titlebar-area-*`, 96×40 here) for interactive elements on every screen
  of the packaged build: workspaces board, tasks, pull requests, pages,
  automations, search, settings, command palette, new workspace, and the
  workspace view with terminal, files, chat and browser panes. The only hit:
  with the workspace side panel open its header owns the corner and the Set
  Run cluster sat under the minimize button. Fix on this branch (the inset
  moves to whichever strip is rightmost). Satya then hit a second one on the
  woken sandbox's dev app: the create-organization screen's only exit, its
  Sign Out / Cancel button, sits at top-right under the controls, so the
  screen has no way out on Linux (on macOS the traffic lights are on the
  left and it is fine). Same fix, same branch. The packaged rebuild with
  either has not been run, so both are unverified.
- [ ] **1.7 Multiple windows** — New Window opens through the menu item, the
  `Ctrl+Alt+N` accelerator and the desktop entry's `--new-window` action.
  Two windows work. **A third window crashes one renderer every time** (3 of
  3 runs: `Renderer process gone { reason: 'crashed', exitCode: 5 }` the
  moment the third window loads, one window left blank, no Chromium FATAL
  line even with `--enable-logging=stderr`; `MaxListenersExceededWarning: 11
  … listeners` on the menu emitter lands at the same moment). A fourth window
  took the whole app down (every window gone, main process exited). Not yet
  established whether this is Linux-specific or the bench's software GL
  (`--disable-gpu` does not start at all here); macOS unverified. Open.

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
  Found on the packaged build: with the user's inotify instance limit reached
  (`fs.inotify.max_user_instances`, 128 by default, shared by every process
  of the user — the bench sat at 131), `@parcel/watcher`'s backend thread
  throws before signalling it started and the caller waits forever: a native
  stack put host-service's event loop in `Backend::run`, its health endpoint
  stopped answering, and every workspace showed "Connecting… restart the host
  service from the tray menu" (a menu Linux has no tray for). Fix on this
  branch: a throwaway `fs.watch` probe before the native subscribe fails
  cleanly with EMFILE. (After: same exhausted box, host-service answers, the
  log carries `Cannot watch path: inotify unavailable (EMFILE)`, and git
  views work without live updates — screenshot.)
- [x] **2.4 Notifications and sounds** — desktop notifications show through
  the freedesktop notification daemon; sounds play through `paplay` or are
  silently skipped when there is no audio server. (Packaged build: a
  renderer `new Notification(…)` draws the xfce4-notifyd bubble with the
  app's name, body and a View action — screenshot; `paplay` is present, no
  PulseAudio, and `play-sound.ts` already falls back to `aplay` and completes
  on failure.)
- [x] **2.5 Port forwarding and background processes** — a dev server started
  in a terminal is detected as a port and survives closing the pane. (cloud
  acceptance: the dev stack's api/web/Electron run detached under tmux on the
  sandbox and show in the ports pill; verified on ws-4427… and ws-1e35….)

## 3. Browser and system integration

- [x] **3.1 External links** open the system browser (`xdg-open`). (Packaged
  build: Help → Documentation opens a Chrome tab at the build's
  `NEXT_PUBLIC_DOCS_URL`; the app's stdout carries Chrome's "Opening in
  existing browser session." Sandbox quirk, not an app issue: the bare
  Chrome binary refuses to run as root, so the sandbox image ships a wrapper
  that `xdg-open` resolves to.)
- [x] **3.2 Downloads** land in the user's downloads directory. (Packaged
  build: an anchor with `download` clicked in the renderer writes
  `~/Downloads/ld-test.txt` with the expected body, no dialog.)
- [x] **3.3 Clipboard** copy/paste works in terminals and editors.
  (`navigator.clipboard.writeText` in the packaged renderer → `xclip -o`
  reads it back on the X server.)
- [x] **3.4 Deep links** — `superset://` registers via the desktop entry.
  (The AppImage's `superset.desktop` carries
  `MimeType=x-scheme-handler/superset;`; with it installed under
  `~/.local/share/applications` and the app running, `xdg-open
  superset://tasks` starts a second instance that hands the URL to the first
  — log `[main] Processing deep link: superset://tasks` — and the window
  comes to the front on the Tasks route — screenshot. Electron's own
  `setAsDefaultProtocolClient` logs `xdg-settings: default-url-scheme-handler
  not implemented for xfce` on this desktop; registration comes from the
  desktop entry, which is what AppImage integration installs.)
- [x] **3.5 Diff worker pool** — `@pierre/diffs` logs `Worker error` seven
  times right after sign-in on the sandbox desktop (dev server, root,
  `--no-sandbox`). Dev-only: the packaged build's renderer console, captured
  over CDP across five loads, has no worker error (only the dev relay's
  refused health checks), and diffs render: an untracked `README.md` (+2) and
  `ld-new.txt` (+1) in the workspace's Changes pane with their lines
  highlighted — screenshot.
- [x] **3.6 Dev renderer under Chromium's request budget** — on the sandbox
  the unbundled dev renderer loses a few random modules per load to
  `net::ERR_INSUFFICIENT_RESOURCES` (Chromium's per-renderer cap on
  outstanding request cost, hit by the large source-mapped modules the dev
  server serves), after which nothing mounts. The bench therefore runs the
  `electron-vite build` output. (Packaged build: the renderer mounted on
  every one of seven launches; no `ERR_INSUFFICIENT_RESOURCES` in the main
  log or the captured renderer console.)

- [x] **3.7 Browser pane under load** — five heavy sites typed into the
  address bar with real keyboard input (Wikipedia, GitHub, YouTube, Hacker
  News, MDN) all rendered; `window.open` from a page opened as a second
  browser pane beside it rather than a popup window; a 59 MB download started
  from the page landed in `~/Downloads`; ten rapid navigations followed by a
  heavy page: no renderer crash, largest process steady around 560 MB RSS.
  The terminal falls back to its DOM renderer (no WebGL2 on the bench).
  Screenshots.

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

- [x] **4.3 Bundled plugin skills in the asar** — the packaged app logs
  `ENOENT … templates/plugin/skills/<skill>/agents not found in app.asar` for
  every skill at boot, even after the full `prebuild`, and the skills' extra
  files never reach the agent directories. Not Linux-specific: the copy uses
  `fs.cp`, which walks directories with `opendir`, and Electron's asar shim
  has no `opendir` (probed inside the packaged Electron: `readdir`, `stat`,
  `copyFile` fine; `opendir` ENOTDIR; `cp`/`cpSync` the ENOENT above).
  macOS builds run the same path. Fix in #7429 (file-by-file copy). (After,
  packaged build rebuilt with #7429 applied: zero `Failed to provision skill`
  lines at boot; `~/.claude/skills/superset/skills/<skill>/agents/openai.yaml`
  and `10x/scripts/audit.sh` present.)

## 5. Platform audit

- [x] **5.1 Every `process.platform === "darwin"` branch** in
  `apps/desktop/src/main` and `packages/host-service` has a Linux counterpart
  or a deliberate no-op noted here (every non-test `darwin` match in both
  trees is a row below):

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
  | `index.ts` system font protocol | macOS font dirs only; Linux relies on fontconfig (2.x). The renderer still requests `superset-font://fonts/SF-Mono-Regular.otf` on Linux and logs `ERR_UNKNOWN_URL_SCHEME`; harmless, the `@font-face` should be macOS-only |
  | `index.ts` `window-all-closed` | macOS keeps running; Linux quits (1.5, this branch) |
  | `lib/terminal/env.ts`, host-service `terminal/env.ts` `SSL_CERT_FILE` | macOS keychain workaround for Go TLS; Linux uses the system CA bundle, nothing to add |
  | `lib/browser/chromium-profiles.ts` | per-platform profile dirs; Linux branch exists (`~/.config/google-chrome` …) |
  | host-service `terminal/clean-shell-env.ts` `augmentPathForMacOS` | Homebrew paths; no-op elsewhere by design |
  | host-service `usage/profiles.ts`, `agy-quota.ts`, `profile-remove.ts` | macOS keychain reads/deletes; Linux returns empty/no-op — quota panels for keychain-backed accounts stay empty on Linux (noted, not in scope) |
  | host-service `usage/history/cursor.ts` | keychain is the macOS branch; the `~/.cursor/auth.json` and `$XDG_CONFIG_HOME/cursor/auth.json` fallbacks are the Linux path |
  | host-service `ai-workspace-names.ts` shell | `/bin/bash` fallback exists |
  | host-service `spawn-failure-diagnostics.ts` | `/proc/self/fd` branch exists |
