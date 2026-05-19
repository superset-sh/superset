# Terminal Daemon Vs Host Service Vs Supervisor

This note is the short version of how the current desktop terminal persistence
works and what would actually be required to replace the daemon with
`host-service` under the chosen desktop UX.

## Core Point

We do not strictly need a thing named "daemon".

We do need:

- a long-lived terminal owner
- a long-lived desktop shell that owns tray and `Quit`

For v2 local, that should mean:

- `host-service` owns PTYs and terminal session state
- a background supervisor owns tray and lifecycle policy

If `host-service` is only tied to the current renderer or current window
process, it cannot replace the daemon behavior we care about.

If the tray is put into `host-service`, we collapse desktop shell concerns into
the runtime owner and lose a clean boundary.

## Current Desktop Daemon Shape

Today the old desktop stack works like this:

- renderer calls terminal tRPC
- tRPC calls `WorkspaceRuntime`
- `WorkspaceRuntime` calls `DaemonTerminalManager`
- `DaemonTerminalManager` talks to `TerminalHostClient`
- `TerminalHostClient` talks to a detached terminal daemon
- the daemon owns `Session` objects keyed by `paneId`
- each session owns a PTY subprocess, a headless emulator, and attached clients

Important files:

- `apps/desktop/src/lib/trpc/routers/terminal/terminal.ts`
- `apps/desktop/src/main/lib/workspace-runtime/local.ts`
- `apps/desktop/src/main/lib/terminal/daemon/daemon-manager.ts`
- `apps/desktop/src/main/lib/terminal-host/client.ts`
- `apps/desktop/src/main/terminal-host/index.ts`
- `apps/desktop/src/main/terminal-host/terminal-host.ts`
- `apps/desktop/src/main/terminal-host/session.ts`

## What The Daemon Actually Gives Us

The current daemon is not just "a PTY in the background".

It provides:

- stable session identity by `paneId`
- attach without recreation
- detach without kill
- snapshot on attach via headless xterm serialization
- mode and cwd tracking
- cold restore from disk history
- backpressure isolation
- PTY isolation in a subprocess
- a global process boundary that survives renderer churn

The most important contract is:

- attach returns terminal state
- unmount does not kill
- explicit kill/dispose kills

## What Is Essential Vs Incidental

Essential:

- global terminal runtime keyed by a stable session id
- `createOrAttach`
- `detach`
- `dispose`
- snapshot/restore
- cold restore
- terminal output/history persistence

Incidental:

- the word "daemon"
- NDJSON specifically
- the exact socket split
- whether the owner lives in a separate package or process

## Can Host Service Replace It

Yes, if `host-service` becomes the terminal owner.

That means `host-service` would need to own:

- the PTY map
- session identity by stable session id
- attach/detach semantics
- snapshot generation
- resize and mode state
- disk-backed history and cold restore
- disposal only when the pane is actually gone

In that model, the old daemon disappears as a separate concept and terminal
persistence becomes a `host-service` responsibility.

The tray still should not move into `host-service`.

## What Host Service Has Today

The current host-service terminal route is in:

- `packages/host-service/src/terminal/terminal.ts`

It already has some of the right direction:

- session map keyed by stable runtime id
- websocket attach
- detach on socket close
- explicit `dispose`

But it is still much thinner than the daemon stack. It does not currently
provide:

- `createOrAttach`
- snapshots on attach
- headless emulator state
- mode rehydration
- cold restore from disk
- history persistence
- subprocess isolation for PTY backpressure
- control/data channel split

So `host-service` is not yet a drop-in replacement for the old daemon behavior.

## The Real Decision

The real question is not "daemon or not".

The real question is which process owns:

- durable terminal state
- durable desktop shell behavior

There are 3 options:

1. Renderer-owned terminal
- Not acceptable for v2 persistence.

2. Window-process-owned background terminal host
- Good enough for tab switch, workspace switch, and renderer restart.
- Not enough for the chosen UX where tray survives UI process exit/relaunch.

3. Background supervisor + host-service
- supervisor owns tray, lifecycle, discovery, and `Quit`
- `host-service` owns durable terminal state
- closest fit for the chosen Docker-like UX

## Chosen Recommendation

For v2 local:

- move terminal semantics toward `createOrAttach` / `detach` / `dispose`
- key terminal ownership by a stable runtime id
- make the mounted pane component attach/detach only
- make `host-service` the terminal owner
- make a separate background supervisor own tray and lifecycle

That means:

- do not put the tray inside `host-service`
- do not keep durability coupled to the window-owning UI process
- do not force the supervisor to become a permanent owner of the old v1 daemon
  semantics if v1 is on the way out

## v1 / v2 Transition

v2 local is the primary target for this architecture.

Recommended transition:

- make the supervisor + `host-service` model correct for v2 local first
- keep v1 explicit as legacy behavior while it still exists
- remove or migrate v1 rather than deeply integrating the old daemon into the
  new supervisor model

## Bottom Line

We probably do not need the current daemon shape exactly.

But we do need the daemon's behavior, and we also need a durable desktop shell.

The clean split is:

- supervisor owns tray and `Quit`
- `host-service` owns PTYs, snapshots, and restore state
- UI attaches and detaches

That is the right boundary for the chosen desktop UX.
