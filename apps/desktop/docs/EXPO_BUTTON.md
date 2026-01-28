# Expo Button

The Expo button is an icon-only button in the TopBar that lets users run `npx expo run:ios --device` in a dedicated terminal tab. It appears only when an Expo project is detected in the workspace.

## Detection

The button queries `workspaces.detectExpo` with the current `worktreePath`. If no Expo project is found, the button is hidden entirely.

## States

The button uses the Expo chevron logo (`logo-type-a`) with color to communicate state:

| State | Color | Behavior |
|-------|-------|----------|
| Idle | `text-muted-foreground` | Click → starts build |
| Starting | `text-muted-foreground` + `opacity-50` | Disabled, waiting for session |
| Running | `text-green-500` | Build is active |
| Running + hover | `text-red-500` | Click → sends Ctrl+C to stop |

Tooltips provide textual context for each state.

## Terminal Session Management

On first click, the button creates a new terminal tab (named "Expo iOS") and runs the command via `createOrAttach` with `initialCommands`. Subsequent clicks reuse the same tab — if the tab still exists, it focuses it and re-runs the command (sending Ctrl+C first to kill any prior process).

Session tracking uses a ref (`sessionRef`) for imperative tab/pane access and a state (`activePaneId`) to reactively enable the stream subscription.

## Exit Detection

The button subscribes to `terminal.stream` for the active pane. When the PTY process emits an `exit` event (crash, shell exit, tab close), the button resets to idle.

The button also watches the tabs store — if the user closes the Expo tab, state resets to idle.

## Known Limitation: Child Process Exit

The terminal stream `exit` event fires when the **shell process** (bash/zsh) exits, not when a child command (`npx expo run:ios`) finishes or is interrupted. This means:

- **Covered**: Shell crash, PTY death, tab close → button resets to idle
- **Not covered**: User types Ctrl+C in the terminal, Expo command fails/finishes on its own → button stays green

The root cause is that the PTY layer only tracks the shell PID, not foreground child processes. The codebase does not implement OSC 133 (FinalTerm shell integration protocol), which could detect command completion via `\x1b]133;D` sequences. Adding OSC 133 support would require:

1. Shell init scripts that emit OSC 133 sequences (zsh/bash/fish)
2. Parsing OSC 133 in the terminal data pipeline (similar to existing OSC-7 CWD tracking in `headless-emulator.ts`)
3. Exposing a "command finished" signal to the renderer

This is a broader terminal infrastructure change not scoped to the Expo button. See also `plans/20260107-1107-terminal-persistence-dx-hardening.md` which identifies this same limitation for general command completion detection.

## Files

| File | Purpose |
|------|---------|
| `TopBar/ExpoButton.tsx` | Button component with state machine and stream subscription |
| `TopBar/index.tsx` | Mounts ExpoButton in the top bar |
| `lib/trpc/routers/workspaces/` | `detectExpo` procedure |
| `lib/trpc/routers/terminal/terminal.ts` | `createOrAttach`, `write`, `stream` procedures |
