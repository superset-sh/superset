# TUI hotkey forwarding

## Problem

App-level hotkeys (Cmd+T, Cmd+D, Ctrl+1, etc.) don't fire while focus is in a
v2 terminal running a TUI. The TUI swallows them — they reach the PTY but
never bubble to `react-hotkeys-hook`.

## Root cause

v2's `terminal-runtime.ts` never installed a `customKeyEventHandler` on xterm.
Without one, xterm's `_keyDown` runs to completion for every modifier chord:
it encodes the key, delivers it to the PTY, then calls `event.preventDefault();
event.stopPropagation();` (CoreBrowserTerminal.ts:925-928). The event dies at
target phase and `react-hotkeys-hook`'s document-bubble listener never sees it.

Confirmed via instrumentation: Cmd+D in a Codex TUI produced capture-phase
logs but zero bubble-phase logs — `stopPropagation` was the culprit.

## Fix (done)

Mirrors VSCode's pattern (terminalInstance.ts:1116-1175): install a
`customKeyEventHandler` that returns `false` for chords bound to app hotkeys.
Returning `false` makes xterm bail at the top of `_keyDown` (line 847-849),
skipping the `stopPropagation` at the bottom. The event bubbles normally and
`react-hotkeys-hook` fires the app action.

Implementation:

- **`renderer/hotkeys/utils/resolveHotkeyFromEvent.ts`** — reverse-indexes
  `HOTKEYS_REGISTRY` into a `Map<normalizedChord, HotkeyId>` at module load.
  Uses the same `event.code` normalization as react-hotkeys-hook's internal
  `K` function so the index can't drift from the matcher. Returns `HotkeyId |
  null`.
- **`renderer/lib/terminal/terminal-runtime.ts`** — one-liner handler:
  ```ts
  terminal.attachCustomKeyEventHandler((event) => !isAppHotkey(event));
  ```
  Registered chords bubble to the app. Unregistered chords (Ctrl+R, Ctrl+L,
  Alt+letter, etc.) still reach the TUI.

## Remaining work

### Migrate v1 to the same resolver

v1's handler in `Terminal/helpers.ts:677-679` takes the opposite approach: it
returns `false` for **all** `ctrl/meta` chords, starving TUIs of unbound
chords like Ctrl+R. Replacing that catch-all with `resolveHotkeyFromEvent`
would give v1 the same precision as v2 — only registered app hotkeys bubble,
everything else reaches the PTY.

### Escape hatches (optional, later)

- **`sendKeybindingsToShell`** user preference (VSCode pattern): disables
  every non-Meta skip entry so power users running tmux/emacs can forward
  everything to the shell.
- **Alt-buffer gate**: use `isAlternateScreenRef` from `useTerminalModes.ts`
  (or `xterm.buffer.onBufferChange`) to shrink the skip list while a TUI owns
  the alt screen, so chords like Cmd+F can reach nvim instead of triggering
  `FIND_IN_TERMINAL`.
