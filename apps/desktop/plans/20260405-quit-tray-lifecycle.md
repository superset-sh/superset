# macOS Quit & Tray Lifecycle

## Decision (2025-04-05)

All quit paths fully exit the app. No background-to-tray behavior for now.

The tray exists while the app is running and provides host-service management and explicit quit actions. When the app quits, the tray goes away.

### What shipped

- **Lifecycle intents** (`exit_release`, `exit_stop`, `restart`) replace the overloaded `QuitMode` (`"release" | "stop"`). Explicit intents skip the confirm-on-quit dialog and route directly to the exit path.
- **Updater fix**: `installUpdate()` uses `prepareIntent("exit_release")` so `before-quit` skips the confirm dialog and exits cleanly. The old `prepareQuit("release")` was intercepted by the macOS background-to-tray block when services were active, preventing updates from installing.
- **Tray menu rename**: "Quit (Keep Services Running)" is now "Quit Superset" for clarity.
- **Restart consolidation**: `restartApp` tRPC endpoint uses `requestExit("restart")` instead of manual `app.relaunch()` + `app.exit(0)`.
- **Removed macOS background-to-tray block** from `before-quit`. The old block prevented quit and kept tray alive when `hasActiveInstances()` was true, but left the dock icon visible (confusing UX).

### What was deferred

Background-to-tray on macOS (Cmd+Q destroys windows but keeps tray alive) is the ideal target but was deferred because:

1. **Dock icon stays visible** — macOS shows the dock icon as long as the Electron process is alive. Backgrounding to tray looks like the app is still running, which is confusing.
2. **Solving the dock icon requires a process split** — hiding the dock icon via `app.dock.hide()` has side effects (loses menu bar, loses Cmd+Tab). A clean solution requires a separate lightweight tray-host process, which is significant work.

## Current behavior

### Quit paths

| Action | Behavior |
|--------|----------|
| Cmd+Q | Full exit (release services, dispose tray, exit) |
| Dock right-click Quit | Same |
| App menu Quit | Same |
| Window close (red-X / Cmd+W) | macOS: hide window (standard behavior). Non-macOS: close window, then app quits. |
| Tray "Quit Superset" | `requestExit("exit_release")` — release services, full exit |
| Tray "Quit & Stop Services" | `requestExit("exit_stop")` — stop services, full exit |
| Tray host-service "Stop" | Stops individual service, app stays running |
| Settings "Restart App" | `requestExit("restart")` — release services, relaunch, exit |
| Update install | `prepareIntent("exit_release")` + `quitAndInstall()` — full exit, updater handles install |

### Host-service lifecycle on quit

- **Release** (`exit_release`, implicit quit): services keep running as detached processes. On next app launch, they are re-adopted via manifest files.
- **Stop** (`exit_stop`): services are terminated via `SIGTERM`.

### Key files

- `src/main/lib/lifecycle.ts` — lifecycle intent model
- `src/main/index.ts` — `before-quit` handler
- `src/main/windows/main.ts` — window close behavior
- `src/main/lib/tray/index.ts` — tray menu and actions
- `src/main/lib/auto-updater.ts` — update install flow
- `src/lib/electron-app/factories/app/setup.ts` — `activate` / `window-all-closed` handlers

## Future: tray-resident background

If we want the tray to persist after quit (like Docker Desktop), there are two viable architectures:

### Option A: Electron tray host + separate UI Electron

A small Electron process owns the tray and spawns the main UI Electron app on demand.

- Pros: shared JS/TS stack, easiest evolution from current code
- Cons: two Electron runtimes, packaging/update complexity

### Option B: Native Swift tray host + Electron UI

A native macOS menu bar app owns the tray. The Electron app is launched/attached on demand.

- Pros: smallest memory footprint, cleanest separation
- Cons: native code, signing, IPC complexity

Either option requires:
1. A separate long-lived process that owns the tray icon
2. Socket/named-pipe IPC between tray host and UI
3. A launch-on-login mechanism (launchd)
4. Update coordination between two processes

This is medium-term work and not needed for the current product requirements.
