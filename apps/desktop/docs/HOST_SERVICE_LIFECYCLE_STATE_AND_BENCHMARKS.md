# Host Service Lifecycle: Current State And Electron Benchmarks

Date: 2026-04-03

## Purpose

This document replaces the scattered plan notes with one view of:

- the current desktop lifecycle shape in this codebase
- the important gap between that shape and the desired tray UX
- how other Electron apps handle similar lifecycle boundaries
- the architectural consequence for Superset

The product requirement assumed here is:

- local services should keep running when the UI closes
- the tray should remain available while those local services are alive
- the tray should be able to reopen the UI
- `Quit` from the tray should stop all local services and exit everything

## Current State Of The Superset Desktop Codebase

### 1. Electron `main` still owns app lifecycle today

Today, app lifecycle is still centered in the window-owning Electron main
process.

- `apps/desktop/src/main/index.ts`
  - `before-quit` confirms quit, then calls `getHostServiceManager().stopAll()`,
    disposes the tray, and exits the app
- `apps/desktop/src/lib/electron-app/factories/app/setup.ts`
  - `window-all-closed` quits the app on non-macOS
  - on macOS, the app remains alive after the last window closes

That means the current app can already keep the process alive without windows on
macOS, but it is still one process owning:

- windows
- tray
- quit policy
- host-service startup and shutdown

It is not yet split into a durable desktop shell and a disposable UI process.

### 2. The current tray is daemon-oriented, not host-service-oriented

The tray implementation is still tied to the legacy terminal daemon model.

- `apps/desktop/src/main/lib/tray/index.ts`
  - polls daemon sessions with `tryListExistingDaemonSessions()`
  - shows "Keep Sessions" vs "Kill Sessions"
  - calls `restartDaemonShared()` to kill daemon-backed sessions
  - is only initialized on macOS

So the tray today is not a host-service control surface. It is a terminal daemon
control surface that happens to live in Electron main.

### 3. `HostService` is process-separated, but still parent-owned

`HostService` is a child process of Electron main, not an independently owned
background service.

- `apps/desktop/src/main/lib/host-service-manager.ts`
  - spawns `host-service.js` with stdio + IPC
  - waits for a `ready` IPC message containing the port
  - restarts crashed children
- `apps/desktop/src/main/host-service/index.ts`
  - reports the port back via `process.send`
  - exits on `SIGTERM` and `SIGINT`
  - polls `process.ppid` and shuts down when the parent dies

This is important: the code already has process separation, but it does not yet
have lifecycle separation. If Electron main exits, the tray dies and
`HostService` also dies.

### 4. The renderer eagerly starts host-service, but only v2 local really depends on it

The authenticated renderer currently starts host-service per organization:

- `apps/desktop/src/renderer/routes/_authenticated/providers/HostServiceProvider/HostServiceProvider.tsx`
  - calls `utils.hostServiceManager.getLocalPort.ensureData(...)` for every org
  - builds a map of org id to local host-service URL/client

That gives the renderer a host-service connection surface, but the user-facing
benefit is not uniform across the app.

### 5. v1 and v2 still have different runtime owners

This is the most important current-state fact.

#### v1

v1 terminals still run on the legacy Electron-owned stack.

- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/Terminal.tsx`
  - subscribes to `electronTrpc.terminal.stream`
- `apps/desktop/src/renderer/routes/_authenticated/settings/terminal/components/TerminalSettings/components/SessionsSection.tsx`
  - manages daemon sessions
  - exposes "Kill all sessions" and "Restart daemon"

The current tray and terminal settings UX still line up with v1.

#### v2 local

v2 local already treats host-service as the runtime boundary.

- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/layout.tsx`
  - resolves a local host URL from `useHostService()` for local workspaces
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/TerminalPane/TerminalPane.tsx`
  - attaches a terminal runtime to `/terminal/:terminalId` over websocket
  - detaches on unmount instead of immediately killing the runtime
- `apps/desktop/src/renderer/routes/_authenticated/components/GlobalTerminalLifecycle/hooks/useGlobalTerminalLifecycle/useGlobalTerminalLifecycle.ts`
  - disposes terminal runtimes only when their ids disappear from persisted pane
    state
- `packages/host-service/src/terminal/terminal.ts`
  - keeps PTY lifetime independent of socket lifetime
  - allows detach and reattach to an existing terminal id

This is much closer to the desired long-lived runtime model.

### 6. The current mismatch

Putting the pieces together:

- app lifecycle is still owned by Electron main
- tray still reflects the legacy daemon
- host-service is still parent-owned
- v1 and v2 use different runtime owners
- v2 local is the only place where host-service persistence is already paying
  off architecturally

So the codebase is currently between two architectures:

1. legacy app-owned runtime with daemon-oriented persistence
2. host-service-oriented runtime for v2 local

That is why lifecycle work feels tangled right now.

## What The Desired UX Actually Requires

The requested UX is stricter than "keep the app alive with no windows."

It requires:

- tray survives UI process exit
- local services survive UI process exit
- tray `Quit` is the authoritative "stop services and exit everything" action

That is not the same as the usual Electron pattern of:

- keep Electron main alive
- hide the last window
- show a tray icon

That simpler pattern is enough when the tray and background work are allowed to
die with the app process. It is not enough when the UI process is supposed to be
disposable while the tray and local services continue.

## How Other Electron Apps Handle Lifecycle

### 1. Electron Platform Baseline

Electron itself makes the core rule explicit:

- if you do not subscribe to `window-all-closed`, Electron quits by default
- if you do subscribe, you own the quit policy
- `Tray` is a main-process API

That gives two baseline implications:

1. a tray normally lives in the process that owns Electron main lifecycle
2. a tray does not outlive the process that owns Electron main lifecycle

Source:

- Electron `app` docs:
  `https://www.electronjs.org/docs/latest/api/app/`
- Electron `Tray` docs:
  `https://www.electronjs.org/docs/latest/api/tray/`

### 2. GitHub Desktop: Main Process Owns Everything

GitHub Desktop is an example of the classic Electron model:

- one main app process owns lifecycle
- it explicitly overrides `window-all-closed`
- it controls visibility and quit behavior from that process

In `app/src/main-process/main.ts`, GitHub Desktop subscribes to
`window-all-closed` specifically so Electron does not auto-quit before the app's
own window-close logic decides what to do.

This is a good example of:

- app-owned lifecycle
- no separate supervisor
- no durable tray/service owner outside the main app process

Takeaway for Superset:

- this is a good fit if "background mode" only means "keep the main app alive"
- it is not enough if we want the UI process to be disposable while tray and
  local services continue

Source:

- GitHub Desktop main process:
  `https://raw.githubusercontent.com/desktop/desktop/development/app/src/main-process/main.ts`

### 3. Element Desktop: Tray Works By Keeping The App Process Alive

Element Desktop is a useful tray example.

In `src/electron-main.ts`:

- when the user closes the main window and the app is not quitting, it hides
  the window if a tray exists
- `before-quit` marks that the app is really quitting
- `window-all-closed` then quits the app

This is the common tray pattern in Electron apps:

- close window -> hide to tray
- explicit quit -> actually exit

Takeaway for Superset:

- this pattern is good for "close window, keep running in tray"
- it still depends on the same long-lived Electron app process
- the tray does not survive app-process exit

Source:

- Element Desktop main process:
  `https://raw.githubusercontent.com/element-hq/element-desktop/develop/src/electron-main.ts`

### 4. VS Code: Main Lifecycle Plus Separate Helper Processes

VS Code does not use a tray-first UX, but it is still the most useful benchmark
for process boundaries.

VS Code keeps application lifecycle in the main Electron process, but moves
specific long-lived domains into helper processes:

- `SharedProcess`
  - a utility process for shared services used across windows
- `pty-host`
  - a dedicated process for terminal PTYs

Important detail: those helper processes are still under main-process lifecycle.
On shutdown, VS Code's lifecycle service tells them to exit.

This is not a supervisor architecture. It is:

- main process owns lifecycle
- helper processes own specific runtime domains
- windows connect to those processes through IPC/message ports

Takeaway for Superset:

- VS Code is a strong benchmark for separating runtime ownership from renderer
  ownership
- it is not a benchmark for "tray survives UI process exit"
- it shows the value of a dedicated runtime owner like `pty-host`, but not the
  value of putting shell UX into that runtime owner

Sources:

- VS Code lifecycle service:
  `https://raw.githubusercontent.com/microsoft/vscode/main/src/vs/platform/lifecycle/electron-main/lifecycleMainService.ts`
- VS Code shared process:
  `https://raw.githubusercontent.com/microsoft/vscode/main/src/vs/platform/sharedProcess/electron-main/sharedProcess.ts`
- VS Code pty host starter:
  `https://raw.githubusercontent.com/microsoft/vscode/main/src/vs/platform/terminal/electron-main/electronPtyHostStarter.ts`
- VS Code main app:
  `https://raw.githubusercontent.com/microsoft/vscode/main/src/vs/code/electron-main/app.ts`

## Pattern Summary

| Pattern | Example | What owns tray | What owns runtime helpers | What happens when app process exits |
| --- | --- | --- | --- | --- |
| Single main-process owner | GitHub Desktop | main process | main process or children | tray and helpers die |
| Tray hide/minimize pattern | Element Desktop | main process | main process or children | tray and helpers die |
| Main + helper processes | VS Code | no tray focus | helper processes for domains like shared services and PTYs | helpers are shut down by main |
| Separate supervisor + runtime service | not the common default Electron pattern | supervisor | separate runtime service | tray can survive UI process exit if supervisor stays alive |

The key point is that the first three patterns all keep tray ownership in the
desktop shell process, not inside the runtime helper.

## What This Means For Superset

### 1. Do Not Put The Tray Inside `HostService`

The external benchmarks do not support putting shell UX into the runtime owner.

Why:

- Electron tray APIs are main-process shell APIs
- tray behavior is about desktop lifecycle policy, not workspace runtime state
- runtime services should stay reusable and headless
- restarting the runtime service should not imply restarting the tray shell

So `HostService` should remain a headless runtime owner.

### 2. A Supervisor Process Is The Right Fit For The Desired UX

Given the stated requirement, the clean split is:

- `BackgroundSupervisor`
  - owns tray
  - owns `Quit`
  - owns `Open Superset`
  - owns host-service discovery/adoption/restart
- `HostService`
  - owns long-lived local runtime state
  - owns terminal and future local services
  - remains headless
- UI process
  - owns windows only
  - can exit and relaunch without changing service lifetime

This is different from the current codebase, where Electron main still owns all
three roles.

### 3. v2 Local Should Be The First-Class Migration Target

The current codebase already points in this direction:

- v2 local already depends on host-service as its runtime boundary
- v2 terminal panes already use attach/detach semantics
- global terminal disposal in v2 is already based on persisted pane state, not
  immediate React unmount

By contrast:

- v1 still uses Electron-owned terminal runtime and daemon-centric UX
- tray and settings still describe daemon sessions, not host-service services

So the least risky migration story is:

1. make supervisor + host-service correct for v2 local
2. keep v1 explicit as a compatibility path during migration
3. retire or migrate v1 instead of deeply coupling the supervisor to both models

## Proposed Target Lifecycle Contract

### Close last window

- closes the UI process only
- does not stop `HostService`
- does not remove the tray

### Open Superset from tray

- launches or focuses the UI process
- reattaches UI to already-running host-service state

### HostService crash

- supervisor detects failure
- tray reflects degraded state
- supervisor may restart host-service according to policy

### Quit from tray

- stop all hosted services
- stop `HostService`
- dispose tray
- exit supervisor

That contract matches the stated product requirement and avoids overloading
either the renderer or `HostService` with desktop-shell responsibilities.

## Bottom Line

The current codebase is halfway between an old Electron-owned terminal model and
a new host-service-owned v2 local model.

The external benchmarks point to a clean conclusion:

- tray ownership belongs in the desktop shell layer
- runtime ownership belongs in a headless service layer
- renderer/window lifetime should not define runtime lifetime

For Superset's requested UX, that means:

- do not move tray into `HostService`
- do not keep lifecycle centered in the current window-owning Electron main
  forever
- introduce a `BackgroundSupervisor` that owns tray and app lifecycle policy
- keep `HostService` as the headless runtime owner

That is the architecture that best matches both the current v2 direction and
the desired Docker-like tray behavior.
