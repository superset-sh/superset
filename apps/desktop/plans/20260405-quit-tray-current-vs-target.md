# macOS Quit / Tray Lifecycle: Current Behavior vs Target

## Goal

Align macOS behavior so that:

- closing the last window
- quitting from the Dock
- pressing `Cmd+Q`
- handling the normal quit path / quit signal

all remove the app UI while keeping the tray alive.

## Architectural direction

The fix is not just "change a few quit branches." We want to separate tray lifetime from window lifetime.

The target architecture is:

- a long-lived tray/background module owns tray lifecycle
- window lifecycle becomes separate from tray lifecycle
- closing or quitting tears down app UI windows
- tray/background runtime stays alive and can recreate windows later

In other words, the tray should not be treated as something owned by the current main-window lifecycle.

### Practical constraint

If "kill main" means "tear down the current app UI / window management flow", that is achievable with a long-lived tray/background module.

If "kill main" means "terminate the Electron process that owns the tray", then the tray still cannot survive that. A true tray-survives-process-exit design would require a separate background entrypoint/process, not just a module split.

For this note, the intended target is:

- destroy the main window(s) / app UI
- keep a long-lived tray/background runtime resident
- keep the tray alive

## Current behavior

### 1. Closing the last window on macOS hides it, it does not destroy it

In `apps/desktop/src/main/windows/main.ts`, the window `close` handler:

- saves window state
- calls `event.preventDefault()`
- calls `window.hide()`

Result:

- the existing `BrowserWindow` stays alive in memory
- the app process stays alive
- the tray stays alive
- re-open is effectively a re-show of the same hidden window

This is a hide-to-tray style behavior, not a destroy-window / background-only behavior.

### 2. Standard app quit (`Cmd+Q`, Dock Quit, app menu Quit) goes through `before-quit`

In `apps/desktop/src/main/index.ts`, standard quit calls `app.quit()`, which reaches the central `before-quit` handler.

That handler currently behaves differently depending on state.

#### Case A: macOS + active host-service instances + quit mode `null` or `"release"`

The quit is prevented and Electron:

- destroys all `BrowserWindow`s
- returns early
- leaves the tray alive
- leaves the app process alive
- leaves host-services alive

This is the one path that already matches the desired shape fairly closely.

#### Case B: no active instances, or a path that falls through the early return

The app continues through the final exit path:

- optional quit confirmation for implicit quit
- `releaseAll()` or `stopAll()`
- `disposeTray()`
- `app.exit(0)`

Result:

- app process exits
- tray dies

So today, standard quit only becomes "background to tray" when active host-service instances exist.

### 3. Tray quit uses explicit quit modes

The tray menu currently calls:

- `requestQuit("release")`
- `requestQuit("stop")`

Those modes still route into the same `before-quit` logic above.

So tray quit is not its own lifecycle model; it is just a different entry point into the central quit handler.

### 4. Some exit paths bypass `before-quit`

There are direct exit paths that currently do not align with a tray-resident target:

- dev `SIGTERM` / `SIGINT` handlers call `app.exit(0)` directly
- app restart calls `app.relaunch()` then `exitImmediately()`

Those paths terminate the Electron process instead of transitioning to tray.

## Desired target behavior

The desired macOS model is:

- closing the last window destroys the window UI instead of hiding it
- `Cmd+Q` destroys the window UI instead of exiting the whole app
- Dock Quit destroys the window UI instead of exiting the whole app
- the tray remains alive after any of those actions
- this behavior should not depend on `hasActiveInstances()`

Operationally, the target is:

- no visible app windows
- no hidden retained main window
- long-lived tray/background runtime still alive
- tray still alive
- app can be reopened from tray / activate flow by creating a fresh window when needed

### Structural implication

To get there cleanly, the tray should move behind a dedicated long-lived module that:

- owns tray creation and disposal
- survives window teardown
- handles re-open / create-window actions
- receives quit intents and decides whether they mean "destroy windows" or "full process exit"

That is the layer that should remain alive when the last window closes or when macOS quit is converted into "background to tray."

## Delta from current behavior

### Delta 1: window close path is wrong today

Current:

- close last window -> `window.hide()`

Target:

- close last window -> destroy the window and leave only tray/background process

### Delta 2: quit-to-tray is incorrectly gated on active services

Current:

- `Cmd+Q` / Dock Quit only stay alive if `manager.hasActiveInstances()` is true

Target:

- `Cmd+Q` / Dock Quit should background to tray regardless of host-service activity

### Delta 3: normal quit still disposes the tray in common cases

Current:

- quit often falls through to `disposeTray()` + `app.exit(0)`

Target:

- normal macOS quit path should destroy windows but not dispose the long-lived tray/background module

### Delta 4: current close path retains the existing window object

Current:

- the app keeps the existing hidden `BrowserWindow`

Target:

- the app should likely destroy window instances and recreate them on re-open

This is an important semantic difference because "hidden existing window" and "no windows, tray-only app" are not the same lifecycle.

### Delta 5: signal/direct-exit paths are not yet aligned

Current:

- some quit/exit paths call `app.exit(0)` directly

Target:

- any quit path that is supposed to behave like macOS quit-to-tray needs to route through the same tray/background lifecycle module instead of directly terminating Electron

### Delta 6: tray ownership is coupled to the current main lifecycle

Current:

- tray init/dispose is directly wired into the existing app startup and quit flow
- tray lifetime is effectively tied to the current main lifecycle branches

Target:

- tray ownership should live in a separate long-lived module
- window teardown should not imply tray teardown
- full process exit should be an explicit, narrower path than "close or quit to tray"

## Concrete summary

Today there are effectively three macOS behaviors:

1. window close -> hide existing window
2. quit with active services -> destroy windows, keep tray alive
3. quit without active services -> exit app and destroy tray

The target is one consistent behavior:

1. close or quit -> destroy windows, keep tray alive

## Likely implementation surface

The main files that define this behavior today are:

- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/main/windows/main.ts`
- `apps/desktop/src/lib/electron-app/factories/app/setup.ts`
- `apps/desktop/src/main/lib/tray/index.ts`

If we implement the target, those files are where the lifecycle consolidation will happen. The main architectural change is to introduce a longer-lived tray/background owner and make window teardown route through it instead of treating tray disposal as part of the default quit path.
