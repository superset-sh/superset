# Short-Term Migration: macOS Tray-Resident Lifecycle

## Objective

In the short term, we want a consistent macOS lifecycle where:

- closing the last window
- quitting from the Dock
- pressing `Cmd+Q`
- other normal app quit requests

all tear down the app UI and leave Superset resident in the tray.

At the same time, we must preserve a separate path for:

- explicit full exit
- explicit full exit + stop services
- install update
- restart app

because those paths need the process to actually terminate.

## Why this needs a migration

Today, Superset already has some tray-resident behavior, but it is inconsistent and it breaks update install.

### Current behavior summary

1. **Window close hides the existing window**
   - `apps/desktop/src/main/windows/main.ts`
   - On macOS, window close calls `window.hide()`, so the current `BrowserWindow` is retained.

2. **Implicit quit only backgrounds to tray when active host-services exist**
   - `apps/desktop/src/main/index.ts`
   - In `before-quit`, macOS returns early and keeps tray alive only when:
     - quit mode is `null` or `"release"`
     - `manager.hasActiveInstances()` is true

3. **Otherwise quit fully exits**
   - same file
   - The final branch calls:
     - `releaseAll()` or `stopAll()`
     - `disposeTray()`
     - `app.exit(0)`

4. **Updater install is currently broken by the quit interception**
   - `apps/desktop/src/main/lib/auto-updater.ts`
   - `installUpdate()` does:
     - `prepareQuit("release")`
     - `autoUpdater.quitAndInstall(false, true)`
   - But the macOS `before-quit` branch treats `"release"` as "destroy windows and keep tray alive" when services are active, so the app never fully quits for install.

## Short-term target

This migration stays within a **single Electron app/runtime**. It does **not** attempt the full Docker-style split-process architecture yet.

The short-term target is:

- introduce a long-lived tray owner inside the current Electron runtime
- separate tray lifetime from window lifetime
- destroy windows on background transitions instead of hiding them
- recreate windows on demand from tray / activate
- keep full-exit/update/restart as explicit separate flows

## Non-goals

- No separate native tray process yet
- No full Docker-style split runtime yet
- No host-service architecture rewrite
- No Windows/Linux tray behavior redesign in this phase

## Product model after migration

After this migration, we should have two categories of lifecycle action.

### 1. Background-to-tray actions

These should destroy windows and keep the tray alive:

- close last window
- Dock Quit
- `Cmd+Q`
- app menu Quit

### 2. Full-exit actions

These should terminate the process:

- explicit tray "Quit Superset"
- explicit tray "Quit & Stop Services"
- update install
- restart app

This is the key separation missing today.

## Architectural changes

## 1. Introduce a long-lived tray owner

Create a dedicated tray lifecycle module that is initialized once after `app.whenReady()` and remains alive until a true full exit.

Responsibilities:

- create and own the tray
- rebuild tray menu
- handle tray-driven actions
- expose "open/create window" action
- survive window teardown
- only dispose on true full exit

This is different from the current setup where tray init/dispose is implicitly tied to the central quit path.

## 2. Separate tray lifetime from window lifetime

Introduce a window lifecycle owner separate from the tray owner.

Responsibilities:

- create a fresh main window
- destroy all windows
- report whether any UI windows exist
- recreate UI on tray click / activate

Important behavioral change:

- backgrounding to tray should **destroy** windows
- it should **not** hide and retain the existing `BrowserWindow`

## 3. Introduce explicit lifecycle intents

The short-term migration should stop overloading `"release"` to mean both:

- "background to tray"
- "release services and fully exit"

We need explicit intents, for example:

- `background_to_tray`
- `exit_release`
- `exit_stop`
- `install_update`
- `restart`

The exact enum names are flexible, but the separation is required.

## Proposed control plane

Add a central lifecycle coordinator that translates intents into actions.

### Background path

For `background_to_tray`:

- prevent app quit
- destroy all windows
- keep tray alive
- keep process alive
- do not call `disposeTray()`
- do not call `app.exit(0)`

### Full exit path

For `exit_release`:

- release services
- dispose tray
- quit process

For `exit_stop`:

- stop services
- dispose tray
- quit process

For `install_update`:

- release services if needed
- dispose tray
- allow updater-managed shutdown/install to proceed
- do **not** convert to background-to-tray

For `restart`:

- relaunch app
- dispose tray
- fully exit

## Updater-specific migration

This needs to be treated as first-class scope, because the current update path is already broken.

## Current updater bug

Current code:

- `installUpdate()` sets `prepareQuit("release")`
- then calls `autoUpdater.quitAndInstall(false, true)`

Current macOS quit behavior:

- `"release"` can be intercepted and turned into "destroy windows, keep tray alive"

Result:

- update install requests can end up backgrounding the app instead of quitting it
- the downloaded update remains ready but does not install

## Official updater behavior we need to respect

Electron's auto-updater docs say:

- `quitAndInstall()` closes application windows first, then automatically calls `app.quit()`
- `before-quit-for-update` exists because `before-quit` does not run before windows close in the normal way during update shutdown

References:

- Electron autoUpdater docs: <https://www.electronjs.org/docs/latest/api/auto-updater/>
- electron-updater docs: <https://www.electron.build/electron-updater.class.appupdater>

This means our current "generic `before-quit` intercept everything" approach is the wrong shape for updates.

## Required updater changes

### 1. Stop using `"release"` as the update-install signal

Do not model update install as `"release"`.

It needs its own explicit lifecycle intent, e.g. `install_update`.

### 2. Skip background-to-tray logic for update install

When update install is in progress:

- do not hit the macOS background-to-tray branch
- do not leave tray resident
- do not prevent the process from actually terminating

### 3. Let the updater own the final quit/install sequence

For update install, the app should prepare state and cleanup, but it should not replace the updater's quit/install sequence with a generic `app.exit(0)` branch.

Short-term rule:

- updater path prepares for shutdown
- updater still owns `quitAndInstall()`

### 4. Add dedicated update-shutdown cleanup

We should add a dedicated update cleanup path, likely keyed off:

- explicit lifecycle intent `install_update`
- and, if surfaced cleanly through the current updater package, `before-quit-for-update`

That cleanup path should:

- release host services if they are meant to survive update/relaunch
- dispose tray
- mark the app as truly quitting
- avoid background fallback behavior

## Tray UX changes required

If macOS `Cmd+Q` / Dock Quit now background to tray, then we still need an explicit way for the user to fully exit.

Recommended tray actions after migration:

- `Open Superset`
- `Quit Superset`
- `Quit & Stop Services`

The current "Quit (Keep Services Running)" tray action becomes ambiguous once normal OS quit no longer exits. We should rename this to make the behavior explicit.

Recommended meaning:

- `Quit Superset` -> full exit, keep services running
- `Quit & Stop Services` -> full exit, stop services

## Migration phases

## Phase 1: Introduce lifecycle coordinator and separate owners

Goal:

- create the architectural seams without changing user-facing behavior yet

Work:

- add tray owner module
- add window owner module
- add lifecycle intent model
- route current tray actions through lifecycle coordinator

Output:

- tray lifecycle is no longer hard-coded directly into the generic quit branch

## Phase 2: Convert macOS close and implicit quit into background-to-tray

Goal:

- make close / Dock Quit / `Cmd+Q` destroy windows and leave tray alive

Work:

- replace `window.hide()` on macOS close with background-to-tray teardown
- remove `hasActiveInstances()` gating from implicit quit-to-tray behavior
- make reopen create a fresh window rather than re-showing a retained hidden one

Output:

- one consistent macOS background behavior

## Phase 3: Fix explicit full-exit paths

Goal:

- preserve true exit semantics where they are actually needed

Work:

- keep explicit tray full-exit action
- keep explicit tray full-exit-and-stop action
- route restart through full-exit lifecycle

Output:

- background and full-exit semantics are no longer mixed together

## Phase 4: Fix updater install path

Goal:

- make install update always perform a real quit/install sequence

Work:

- replace updater's current `"release"` quit preparation with dedicated `install_update` intent
- skip background-to-tray logic during update install
- add dedicated update cleanup path
- ensure tray is disposed on update install
- ensure host-service release/cleanup is deliberate and not inherited accidentally from generic quit

Output:

- clicking `Install` from update UI actually installs the update

## Phase 5: Verification and cleanup

Goal:

- lock behavior down with tests and a manual verification checklist

Work:

- unit/integration coverage around lifecycle coordinator
- updater install path verification
- tray reopen verification
- close/quit behavior verification with and without active services

## Acceptance criteria

The migration is done when all of the following are true on macOS:

1. Closing the last window leaves no open windows and the tray remains alive.
2. `Cmd+Q` leaves no open windows and the tray remains alive.
3. Dock Quit leaves no open windows and the tray remains alive.
4. Reopening from tray creates a fresh window successfully.
5. This behavior does not depend on `hasActiveInstances()`.
6. There is still an explicit tray action that fully exits the app.
7. There is still an explicit tray action that fully exits and stops services.
8. Clicking update install fully quits and installs the update.
9. Update install does not get stuck in a tray-resident state.

## Manual verification checklist

### Background-to-tray checks

- Launch app with no active services, close last window -> tray stays alive, no windows remain
- Launch app with active services, close last window -> same result
- Launch app with no active services, press `Cmd+Q` -> tray stays alive, no windows remain
- Launch app with active services, press `Cmd+Q` -> same result
- Use Dock Quit with and without active services -> same result
- Reopen from tray after each case -> fresh window appears

### Full-exit checks

- Use explicit tray full exit -> process terminates, tray disappears, services remain running if expected
- Use explicit tray full exit + stop -> process terminates, tray disappears, services stop

### Update checks

- Simulate update ready, click install -> app actually quits for install
- Verify update path does not leave the app sitting in tray-only state

## Risks

### 1. macOS convention risk

Making `Cmd+Q` background to tray is non-standard for many macOS apps. This is intentional here, but it is still a product decision and should be treated as such.

### 2. Regressions from switching hide -> destroy

Destroying windows instead of hiding them changes:

- window state retention behavior
- subscriptions/listeners tied to window instances
- assumptions in reopen flows

That is why the window owner split is important.

### 3. Updater lifecycle complexity

Update install is not just another quit path. It has distinct semantics and Electron explicitly documents that its event sequence differs from normal quit.

We should not keep treating it as a special case of `"release"`.

## Recommended implementation order

1. Introduce lifecycle intents and tray/window owners
2. Move implicit macOS close/quit to background-to-tray
3. Add explicit full-exit tray action naming
4. Fix updater install path with dedicated intent
5. Add tests and verification checklist

## References

- Electron autoUpdater docs: <https://www.electronjs.org/docs/latest/api/auto-updater/>
- electron-builder auto update docs: <https://www.electron.build/auto-update.html>
- electron-updater API docs: <https://www.electron.build/electron-updater.class.appupdater>
