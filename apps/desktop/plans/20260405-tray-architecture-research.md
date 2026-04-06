# Tray Architecture Research: Electron Patterns vs Docker-Style Split Runtime

## Question

What pattern should we use if we want a tray that outlives the current Electron UI/main lifecycle, in a way that feels closer to Docker Desktop than to a typical "hide window to tray" Electron app?

## Bottom line

There are three distinct patterns in the wild:

1. **Standard Electron tray app**
   - One Electron main process owns tray, app lifecycle, and windows.
   - Closing windows leaves the Electron app resident.
   - Tray does **not** outlive Electron main.

2. **Electron app with background worker/backend**
   - Electron main still owns tray and windows.
   - Long-lived work moves into a child Node/utility/backend process.
   - Tray still does **not** outlive Electron main.

3. **Docker-style split runtime**
   - Background runtime and UI are decoupled.
   - Tray belongs to the long-lived background runtime, not to the transient dashboard window flow.
   - If we want the tray to outlive the current Electron UI/main lifecycle, this is the right family of architecture.

The key implication is:

- a separate **module** for tray is useful
- but a separate module alone is **not** enough to make the tray outlive the current Electron main lifecycle in a Docker-like way
- for that, we need a separate **long-lived runtime/process boundary**, not just a file split

## What Electron itself supports

### Tray is a main-process concern

Electron's official tray guide creates the tray from `electron/main`, and its "minimizing to tray" pattern works by keeping the app alive when windows are closed.

Sources:

- Electron Tray guide: <https://www.electronjs.org/docs/latest/tutorial/tray>
- Electron Process Model: <https://www.electronjs.org/docs/latest/tutorial/process-model>

Relevant points from the docs:

- Tray is created from the main process API surface.
- To keep tray alive when all windows are closed, Electron recommends handling `window-all-closed` without quitting.
- Electron has a single main process that controls application lifecycle and native APIs such as tray, dialogs, and menus.

### Utility/background processes are supported, but they do not solve tray ownership

Electron also supports child/utility processes for background work.

Source:

- Electron utility process API: <https://www.electronjs.org/docs/latest/api/utility-process>

That is useful for:

- background services
- crash isolation
- expensive work

But it does **not** move tray ownership out of the main-process lifecycle. It only helps split background computation away from UI.

## Existing app patterns

## Pattern A: Standard Electron tray-first app

### Stretchly

Stretchly is a cross-platform Electron app that explicitly describes itself as living in the tray and only showing windows when needed.

Source:

- Stretchly README: <https://github.com/hovancik/stretchly>

Relevant behavior:

- "Stretchly itself lives in your tray"
- preferences are opened from tray
- the tray icon can even be disabled, which removes the graphical reopen path

This is the classic Electron tray-first pattern:

- keep Electron resident
- no requirement for a persistent main window
- spawn/show windows on demand

This is a good reference for:

- tray-owned app UX
- create-window-on-demand behavior

It is **not** a reference for "tray outlives Electron main", because the tray still belongs to the one Electron app process.

### Daily Electron Overlay demo

Daily's Electron overlay demo also describes the app as living in the system tray.

Source:

- Daily electron-overlay README: <https://github.com/daily-demos/electron-overlay>

This is the same family of design:

- tray-first
- UI windows are secondary / transient
- Electron process remains alive

Again: useful for tray-first UX, not for Docker-style runtime separation.

## Pattern B: Electron app plus background backend process

### `electron-with-server-example`

James Long's example demonstrates an Electron app that forks a background Node process and communicates with it directly over a local socket.

Source:

- Example repo: <https://github.com/jlongster/electron-with-server-example>

Why this matters:

- it is a clean example of separating durable backend work from Electron window lifecycle
- it shows a direct socket/named-pipe style IPC path instead of pushing everything through Electron IPC

This is very relevant for Superset because it matches the shape of:

- long-lived backend/runtime
- Electron shell as UI/controller

But it still leaves tray ownership in Electron main. So it solves backend durability, not tray-survives-main.

## Pattern C: Docker-style split runtime

Docker Desktop is the best product reference for the UX we want, but its public docs do **not** expose a detailed internal Electron process diagram. So the following is partly direct evidence and partly inference from the product docs.

Sources:

- Explore Docker Desktop: <https://docs.docker.com/desktop/use-desktop/>
- Docker Desktop CLI: <https://docs.docker.com/desktop/features/desktop-cli/>
- Docker Desktop settings: <https://docs.docker.com/desktop/settings-and-maintenance/settings/>
- Docker Desktop install/uninstall docs:
  - Windows install: <https://docs.docker.com/desktop/setup/install/windows-install/>
  - Uninstall: <https://docs.docker.com/desktop/uninstall/>

### Direct evidence from Docker docs

The docs show:

- Docker Desktop has a tray/menu entry point ("The Docker menu")
- the Docker menu has a "Dashboard" action, which implies the tray/menu is not the same thing as the dashboard window
- Docker Desktop has a setting for "Open Docker Dashboard when Docker Desktop starts", which means startup and dashboard display are intentionally decoupled
- Docker Desktop exposes `docker desktop start|stop|restart|status` CLI commands
- Docker installs/runs background helpers and services such as `com.docker.service` on Windows and privileged helper tools like `com.docker.vmnetd` on macOS

### Inference from those docs

This strongly suggests a **split-runtime product model**:

- long-lived desktop/background runtime
- optional/transient dashboard UI
- separate backend services/helpers

That is the right conceptual target for us.

What we should **not** infer without stronger evidence:

- that Docker's tray is literally outside Electron
- that Docker uses a second Electron executable rather than a native helper
- exact process boundaries inside Docker Desktop

But the docs are enough to support the larger architecture conclusion:

- Docker is not using the basic "single Electron main owns everything forever" pattern as the product boundary
- the product boundary is "desktop runtime" first, "dashboard window" second

## What this means for Superset

## Option 1: Improve current Electron structure only

We can:

- create a dedicated tray lifecycle module
- make windows disposable and recreated on demand
- keep Electron resident with no windows

This gets us to:

- tray-first app
- no hidden retained main window
- better lifecycle separation than today

This is a good incremental step.

But it is still Pattern A:

- tray survives window teardown
- tray does **not** survive Electron main exit

## Option 2: Docker-style split runtime

If the real requirement is:

- tray/background survives the current UI/main lifecycle
- the dashboard window is just an attachable client

then we need a real runtime split.

### Recommended shape

1. **Tray host runtime**
   - long-lived
   - owns tray/menu bar icon
   - owns reopen/create-window actions
   - receives quit/restart intents
   - decides whether to destroy windows or fully exit

2. **UI runtime**
   - dashboard/workspace windows
   - can be created/destroyed independently
   - talks to tray host and backend over socket/named pipe IPC

3. **Backend/service runtime**
   - host services
   - daemon/session/runtime management
   - background work that should survive UI churn

### Process model choices

There are two realistic ways to do this:

#### A. Small Electron tray host + separate UI Electron process

Pros:

- easiest if we want to reuse Electron for tray/menu APIs
- shared JS/TS stack
- simpler to evolve from current code

Cons:

- still more than one Electron runtime
- packaging/relaunch/update story becomes more complex

#### B. Native tray host + Electron UI app

Pros:

- closest to a true Docker-style helper/desktop-runtime split
- smallest long-lived resident footprint
- strongest separation between tray/runtime and UI app

Cons:

- highest engineering cost
- native code, packaging, signing, and IPC complexity

## Recommendation

### Short term

Do the structural cleanup inside the current app first:

- introduce a tray lifecycle owner
- stop retaining a hidden main window
- make reopen create a fresh window
- route close / `Cmd+Q` / Dock Quit into one "destroy windows, keep tray runtime alive" path

That gives us a cleaner tray-first architecture and removes the current lifecycle inconsistency.

### Medium term

If the product requirement remains "tray should outlive the current Electron main/UI lifecycle similar to Docker", plan for a process split:

- tray host runtime
- UI runtime
- socket/named pipe IPC between them

### Concrete recommendation for Superset

Treat "separate tray module" as a **preparatory refactor**, not the final architecture.

The final architecture should be described as:

- **separate tray owner**
- **separate window owner**
- **eventually separate tray host runtime/process if we want true Docker-style behavior**

## Decision guidance

If the goal is only:

- close/quit removes UI
- tray stays alive
- reopen creates a fresh window

then a single resident Electron process is enough.

If the goal is:

- tray/runtime survives shutdown of the current Electron UI/main process
- the UI is attach/detach only
- closer to Docker Desktop's product boundary

then we should design toward a separate tray host runtime/process.
