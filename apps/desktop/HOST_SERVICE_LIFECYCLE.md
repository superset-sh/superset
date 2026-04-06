# Host Service Lifecycle

This document describes the current v2 host-service quit, tray, and adoption behavior as implemented in the Electron desktop app today.

## Scope

- v2 terminals and v2 workspace runtime go through host-service child processes.
- v1 terminals still use the separate `src/main/terminal-host/` daemon and do not follow this quit/tray path.
- The tray is macOS-only.

## Main pieces

```
Electron main
├── `src/main/index.ts`
│   ├── owns `pendingQuitMode`
│   ├── handles `before-quit`
│   ├── discovers/adopts existing host-services on startup
│   └── initializes the tray
├── `src/main/lib/tray/index.ts`
│   ├── renders tray menu from HostServiceManager state
│   └── calls `requestQuit("release" | "stop")`
├── `src/main/lib/host-service-manager.ts`
│   ├── spawn / adopt / restart / stop / release
│   └── emits `status-changed`
└── `src/main/windows/main.ts`
    └── macOS window close hides the window instead of destroying it
```

## Startup order

At app startup, the current sequence is:

1. `app.whenReady()`
2. `getHostServiceManager().discoverAndAdoptAll()`
3. `makeAppSetup(() => MainWindow())`
4. `initTray()`

That ordering matters: adopted services are loaded before tray init so the tray menu reflects already-running services immediately.

## Service survival model

Each host-service writes a manifest under `~/.superset/host/{orgId}/manifest.json` containing its pid, endpoint, auth token, version, and protocol version.

- Release path: the desktop detaches from the child and leaves the manifest on disk.
- Next launch: `discoverAndAdoptAll()` scans manifests, checks pid liveness and `/trpc/health.check`, then adopts healthy services.
- Stop path: the desktop sends `SIGTERM`; the service is expected to remove its manifest during shutdown.
- Adopted services are polled for liveness every 5 seconds. If an adopted pid dies, the manager marks it `degraded` and schedules a restart.

## Window lifecycle on macOS

There are two distinct macOS "stay alive" paths:

### 1. Window close (`Cmd+Shift+Q` in this app's menu, red close button)

`src/main/windows/main.ts` intercepts `window.close` and:

- saves window bounds
- calls `event.preventDefault()`
- hides the window

This keeps the existing window object, app process, tray, and services alive. `app.on("activate")` or "Open Superset" in the tray re-shows the hidden window.

### 2. App quit (`Cmd+Q`, app menu Quit, updater quit, tray quit)

`src/main/index.ts` handles this in `before-quit`. This path can destroy windows, release services, stop services, or exit immediately depending on state.

## Quit entry points

### Standard app quit

The normal app menu uses Electron's `role: "quit"`, so it calls `app.quit()` with no explicit quit mode.

- `pendingQuitMode === null`
- confirm-on-quit may run
- macOS special-case can keep the tray alive if services are active

### Tray quit

The tray menu calls:

- `requestQuit("release")` for "Quit (Keep Services Running)"
- `requestQuit("stop")` for "Quit & Stop Services"

This sets `pendingQuitMode` before calling `app.quit()`.

### Updater quit

`installUpdate()` calls `prepareQuit("release")` and then `autoUpdater.quitAndInstall(false, true)`.

This means updater installs currently reuse the same `"release"` `before-quit` path as tray release-quit.

### App restart

The settings router uses:

- `app.relaunch()`
- `exitImmediately()`

`exitImmediately()` calls `app.exit(0)` and bypasses `before-quit`, so it does not run `releaseAll()`, `stopAll()`, or `disposeTray()`.

## Current `before-quit` flow

`src/main/index.ts` is the single place that decides what app quit means.

### Step 1: consume pending mode

`before-quit` reads `pendingQuitMode` and immediately clears it so cancelled quits do not leave stale mode behind.

Possible values:

- `null`
- `"release"`
- `"stop"`

### Step 2: macOS special-case when services are active

If all of the following are true:

- platform is macOS
- quit mode is `null` or `"release"`
- `manager.hasActiveInstances()` is true

then the app does **not** exit. Instead it:

- calls `event.preventDefault()`
- destroys every `BrowserWindow`
- returns without disposing the tray

Result:

- app process stays alive
- tray stays alive
- host-services stay running
- there are no open windows left

This is different from the macOS window-close hide path:

- window close hides the window
- app quit destroys windows

### Step 3: quit confirmation

If quit mode is still `null`, the app is not in development, and the `confirmOnQuit` setting is enabled, a blocking confirm dialog is shown.

If the user cancels:

- `before-quit` returns
- the app remains running
- `pendingQuitMode` has already been cleared

Explicit tray quit modes skip this dialog.

### Step 4: final exit path

If the quit continues:

- set `isQuitting = true`
- `"stop"` -> `manager.stopAll()`
- `null` or `"release"` -> `manager.releaseAll()`
- `disposeTray()`
- `app.exit(0)`

Important detail: `app.exit(0)` bypasses window close handlers, so per-window cleanup in `src/main/windows/main.ts` does not run during this path.

## Non-macOS behavior

- The tray is never initialized on Windows or Linux.
- `window-all-closed` calls `app.quit()`.
- `before-quit` still decides between release and stop.
- Release quit exits the app and leaves services running for next-launch adoption.

## Tray behavior

The tray is initialized only on macOS and only if the tray icon loads successfully.

### Menu contents

The tray currently shows:

- Host Service (`N`)
- Open Superset
- Settings
- Check for Updates
- Quit actions

If there are active services:

- "Quit (Keep Services Running)"
- "Quit & Stop Services"

Otherwise:

- "Quit"

Each active org section can show:

- organization name
- status
- version
- uptime
- restart count
- update-required / update-available hints
- Restart action
- Stop action

### Refresh behavior

The tray menu refreshes from two sources:

- immediately on `HostServiceManager` `status-changed`
- every 5 seconds via polling as a fallback

## Current behavior that is easy to miss

### 1. "Release quit" does not always exit on macOS

On macOS, `"release"` plus active services does not go through `releaseAll() + app.exit(0)`. It hits the earlier `before-quit` branch that destroys windows and leaves the tray + app process alive.

### 2. Implicit quit and explicit release quit share the same macOS branch

Both of these hit the same branch when services are active:

- standard quit with `pendingQuitMode === null`
- explicit tray/update `"release"`

### 3. Tray release-quit and updater quit are coupled today

Because the updater uses `prepareQuit("release")`, an update install currently takes the same macOS branch as tray release-quit when services are active.

### 4. Restart bypasses the central quit logic

`restartApp` does not flow through `before-quit`. It exits immediately after scheduling a relaunch.

### 5. Window close and app quit are intentionally not the same thing

On macOS:

- close window -> hide current window
- quit app with active services -> destroy windows, keep tray alive
- final exit path -> dispose tray and `app.exit(0)`

## Related files

- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/main/lib/tray/index.ts`
- `apps/desktop/src/main/lib/host-service-manager.ts`
- `apps/desktop/src/main/windows/main.ts`
- `apps/desktop/src/lib/electron-app/factories/app/setup.ts`
- `apps/desktop/src/main/lib/auto-updater.ts`
- `apps/desktop/src/lib/trpc/routers/settings/index.ts`
