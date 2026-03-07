# Desktop Ghostty Phase 0 Baseline

This file is the fixed checklist for every later Ghostty phase.

Phase 0 does not change terminal rendering, tab lifecycle, or transport semantics.
It only establishes:

- the current manual baseline
- the debug switches to use during later phases
- the current test inventory and obvious gaps

## Current Baseline

Renderer and lifecycle today:

- renderer: `xterm.js`
- tab behavior: current mount/unmount behavior unchanged
- restore path: existing snapshot/scrollback restore path unchanged
- transport: existing daemon attach/write/resize/detach semantics unchanged

## Debug Switches

Use the renderer DevTools console.

Enable all terminal logs:

```js
localStorage.setItem("SUPERSET_TERMINAL_DEBUG", "1");
```

Enable only selected channels:

```js
localStorage.setItem("SUPERSET_TERMINAL_DEBUG", "attach,restore,stream,focus");
```

Limit logs to one pane:

```js
localStorage.setItem("SUPERSET_TERMINAL_DEBUG_PANE", "<pane-id>");
```

Disable logging:

```js
localStorage.removeItem("SUPERSET_TERMINAL_DEBUG");
localStorage.removeItem("SUPERSET_TERMINAL_DEBUG_PANE");
```

Current channels:

- `lifecycle`
- `attach`
- `restore`
- `stream`
- `focus`
- `resize`
- `connection`

What to look for:

- duplicate `createOrAttach:start` for one user action
- pending stream events that never flush after restore
- repeated focus churn on one pane
- resize bursts during simple tab switches
- unexpected detach during routine visibility changes

## Manual Baseline Matrix

Run this before and after every later phase.

| Area | Scenario | Expected |
| --- | --- | --- |
| Typing | Open a fresh terminal and type immediately | Characters appear without delay |
| Typing | Split pane, focus new terminal, type | New pane accepts input immediately |
| Cursor | Click inside terminal, type on multiple lines | Cursor appears on the clicked cell and stays aligned |
| Tab switching | Switch terminal tab -> browser/chat tab -> terminal tab | Terminal remains usable, no stuck blank region |
| Split pane | Split active terminal with keyboard shortcut | New pane opens, focus moves once, no focus loop |
| Noisy output | Run `bun i` or another noisy command, switch tabs repeatedly | App stays responsive, terminal output continues |
| Restore | Relaunch desktop app or reconnect daemon if applicable | Session restores or fails clearly, never hangs forever |
| TUI repaint | Run a TUI app and switch away/back | Screen repaints correctly and input still works |
| Hotkeys | Use pane split and app-level shortcuts while terminal is focused | App shortcut fires, terminal input is not corrupted |
| Fonts/glyphs | Open prompt with Nerd Font icons | Text is sharp and prompt glyphs render correctly |
| Clipboard | Copy and paste multiline text | Copy trims padded spaces, paste behaves normally |
| Links | Cmd/Ctrl-click file path and URL | Correct target opens |

Record for each run:

- pass/fail
- exact pane and tab IDs if debug logging is enabled
- whether failure required noisy output or TUI mode
- first suspicious debug event before visible breakage

## Existing Terminal Tests

Current renderer-side tests cover:

- theme/default background helpers
- keyboard mappings
- copy and paste helpers
- command-buffer title sanitization
- pane-destroy guards
- file-path link provider
- URL link provider
- reattach-throttle behavior model

Current test files:

- `Terminal/helpers.test.ts`
- `Terminal/commandBuffer.test.ts`
- `Terminal/pane-guards.test.ts`
- `Terminal/debug.test.ts`
- `Terminal/link-providers/file-path-link-provider.test.ts`
- `Terminal/link-providers/url-link-provider.test.ts`
- `Terminal/hooks/useTerminalLifecycle.test.ts`

## Gaps To Fill In Later Phases

These are the important gaps. Do not try to solve all of them in Phase 0.

- no integration test for fresh terminal mount and typing
- no integration test for split-pane focus handoff
- no integration test for stream queueing and restore flush order
- no integration test for tab switch behavior under noisy output
- no integration test for cursor click-to-cell positioning
- no integration test for app hotkey forwarding from terminal focus
- no integration test for font application and remeasure behavior
- no integration test for TUI repaint after visibility changes
- no transport/session test proving stale events cannot bleed between sessions

## Phase 0 Acceptance

Phase 0 is done when:

- the baseline matrix exists and is usable
- terminal debug logging can be enabled without code edits
- the current test inventory and gaps are documented
- no terminal renderer or lifecycle behavior has changed
