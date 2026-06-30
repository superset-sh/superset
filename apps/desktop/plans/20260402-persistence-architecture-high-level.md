# HostService Durability Architecture

This doc is about one thing:

- making `HostService` the durable owner of long-lived local services under a
  separate background supervisor

It is not a general document about all persistence in the app.

## Goal

Two boundaries matter:

- `BackgroundSupervisor` is the durable desktop shell
- `HostService` is the durable runtime boundary for long-lived local services

Examples of those long-lived local services:

- terminal
- local jobs
- indexing/search
- other service-like runtimes that should outlive renderer churn

## Roles

### BackgroundSupervisor

The supervisor should own:

- tray
- service discovery
- health checks
- restart/update orchestration
- UI relaunch/open-window behavior
- the authoritative `Quit` command

It should not own the runtime state of long-lived local services.

### HostService

`HostService` should be the headless durable local service host.

It should own:

- the lifecycle of long-lived local services
- their runtime state
- their control APIs
- reconnect/reattach boundaries
- later, any restore/checkpoint logic they need

The tray should not live inside `HostService`.

### UI Process

The UI process should own:

- windows
- visible menus tied to those windows
- renderer bootstrapping

It should be disposable.

### Renderer

The renderer is a client.

It should:

- attach to services
- detach from services
- render their state

It should not define service lifetime.

## Core Rule

Renderer, route, tab, workspace, and window churn should not redefine the
lifetime of a long-lived service.

If a service should survive that churn, it belongs behind `HostService`.

If tray and background UX should survive UI process exit, that belongs in the
supervisor, not in the renderer and not in `HostService`.

## Lifecycle Boundaries

Keep these separate:

- view lifetime
- model lifetime
- service runtime lifetime
- `HostService` process lifetime
- supervisor lifetime

Most bugs come from collapsing them.

## Transport

Transport can still be websocket.

The important rules are:

- streaming and control belong to `HostService`
- service identity must not depend on the current route or mounted tree
- control operations should not depend on an already-open stream
- tray and lifecycle control should not be implemented by the mounted UI alone

## Next Phase

### 1. Establish BackgroundSupervisor

The supervisor should become the durable desktop shell.

That means:

- tray ownership
- UI relaunch/open behavior
- authoritative `Quit`
- service discovery/adoption

### 2. Make HostService Discoverable And Durable

The supervisor should discover and supervise a durable `HostService`.

That means:

- stable discovery
- health checks
- restart semantics
- version/protocol handshake

### 3. Move Long-Lived Services Behind HostService

Each long-lived local service should live behind `HostService` with explicit
operations like:

- create
- attach
- detach
- dispose

### 4. Add Warm Reattach

Before cold restore, a live `HostService` should support clean reattach after:

- workspace switch
- tab switch
- renderer restart
- UI process relaunch
- service reconnect

### 5. Add Restore Later

After warm reattach works, add whatever restore/checkpoint behavior each service
needs.

### 6. Migrate v2 First

Use this architecture for v2 local workspaces first.

Keep v1 explicit as legacy behavior while it still exists rather than forcing
the supervisor to permanently own two unrelated runtime systems.
