# V2 Workspace Setup Script Execution

## Current Model

V2 terminal startup commands are queued by host-service behind the terminal
shell readiness gate. The renderer should not wait on a tRPC terminal creation
call before mounting a pane.

There are two supported paths:

1. **Renderer-owned pane launch**: create a terminal pane with
   `TerminalPaneData.initialCommand`. `TerminalPane` opens the WebSocket
   immediately and sends `{ type: "initialCommand" }` after the socket opens.
   Host-service queues the command behind `shellReadyPromise`.
2. **Server-side launch**: call
   `terminal.launchSession({ workspaceId, terminalId?, initialCommand, themeType? })`.
   This is for server/relay callers such as automation dispatch that need a
   terminal session without a mounted renderer pane.

Plain V2 terminal panes do not pre-create sessions through tRPC. They open the
WebSocket with `workspaceId` and `themeType`; the WebSocket route creates or
attaches the terminal session on open.

## Shell Readiness

Shell wrappers emit OSC 133 A/C/D markers. Host-service scans terminal output
and resolves `shellReadyPromise` when the prompt is ready. If the marker never
arrives, the timeout unblocks queued commands so unsupported shells still work.

`createTerminalSessionInternal({ initialCommand })` and WebSocket
`initialCommand` frames both use the same queueing helper, so setup scripts,
automation launches, presets, and pending terminal launches share the same
shell-ready behavior.

## Setup Script Terminals

Workspace setup scripts are created server-side during workspace creation by
calling `createTerminalSessionInternal({ initialCommand })`. The renderer later
opens panes for the returned terminal IDs; buffered output replays on attach.

## Presets And Pending Launches

V2 presets and pending terminal launches create panes first:

```ts
const terminalId = crypto.randomUUID();
store.addTab({
	panes: [
		{
			kind: "terminal",
			data: { terminalId, initialCommand },
		},
	],
});
```

`TerminalPane` consumes the transient `initialCommand`, sends it over the
terminal WebSocket, then clears it from pane data after the socket opens.

## Automation

Automation dispatch uses the explicit launch API:

```ts
await terminal.launchSession({
	workspaceId,
	terminalId,
	initialCommand: command,
});
```

This API is launch semantics, not idempotent "ensure" semantics. Errors throw
through tRPC so dispatch can fail the automation run instead of marking a
terminal session as dispatched when the PTY could not be created.

## Attribution

Shell integration protocol vendored from:

- **WezTerm** (MIT License, Copyright 2018-Present Wez Furlong) —
  `assets/shell-integration/wezterm.sh`
- **FinalTerm semantic prompts spec** —
  https://gitlab.freedesktop.org/Per_Bothner/specifications/blob/master/proposals/semantic-prompts.md

Scanner pattern adapted from our v1 desktop terminal host
(`apps/desktop/src/main/terminal-host/session.ts`).
