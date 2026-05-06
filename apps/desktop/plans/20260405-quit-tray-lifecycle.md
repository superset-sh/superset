# macOS Quit & Tray Lifecycle

## Decision (2026-04-05)

All quit paths fully exit the app. No background-to-tray behavior for now.

The tray exists while the app is running and provides host-service management and explicit quit actions. When the app quits, the tray goes away.

### What shipped

- **Removed macOS background-to-tray block** from `before-quit` (#3205). The old block prevented quit and kept tray alive when `hasActiveInstances()` was true, but left the dock icon visible (confusing UX).
- **Updater fix**: `installUpdate()` calls `quitAndInstall()` then `exitImmediately()`, bypassing the quit protocol entirely. The old `prepareQuit("release")` approach coupled the updater to the quit lifecycle unnecessarily.
- **Hardened `before-quit` cleanup**: host-service cleanup wrapped in try/catch so `app.exit(0)` always runs. Without this, an exception in cleanup would skip `app.exit(0)`, and the macOS window close handler (`event.preventDefault()` + `hide()`, added in #3157) would block the quit.

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
| Tray "Quit (Keep Services Running)" | `requestQuit("release")` — release services, full exit |
| Tray "Quit & Stop Services" | `requestQuit("stop")` — stop services, full exit |
| Tray host-service "Stop" | Stops individual service, app stays running |
| Update install | `quitAndInstall()` + `exitImmediately()` — bypasses quit protocol |

### Host-service lifecycle on quit

- **Release** (default): services keep running as detached processes. On next app launch, they are re-adopted via manifest files.
- **Stop** (`requestQuit("stop")`): services are terminated via `SIGTERM`.

### Key files

- `src/main/index.ts` — `before-quit` handler, `requestQuit`, `exitImmediately`
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
