---
name: computer
description: "Drive native desktop apps and system browser windows on macOS, Windows, or Linux with Cua Driver. Use when asked to open or operate a real app, click or type in a desktop UI, inspect a window, use a signed-in system-browser session, or verify an end-to-end GUI flow. Not for Superset's in-app browser pane, headless scraping, or tasks an API or CLI can complete directly."
---

# Superset Computer Control

Operate the user's real desktop with the `cua-driver` CLI. Cua Driver exposes
accessibility snapshots, exact window screenshots, native menu operations, and
targeted input without making the agent guess at stale screen coordinates.

## Choose the right surface

- Use this skill for native apps, OS UI, and browser windows outside Superset.
- Use `superset:browser` for Superset's in-app browser pane.
- Prefer an application API, purpose-built CLI, or direct filesystem operation
  when the requested result does not require GUI interaction.

## Set up Cua Driver

1. Require `command -v cua-driver` and inspect `cua-driver --version`. Do not
   silently install or upgrade it. If it is missing, ask the user to authorize
   an installer from the [Cua Driver installation guide](https://cua.ai/docs/how-to-guides/driver/install).
   On macOS or Linux, use:

   ```bash
   /bin/bash -c "$(curl -fsSL https://cua.ai/driver/install.sh)"
   ```

   On Windows, use PowerShell:

   ```powershell
   irm https://cua.ai/driver/install.ps1 | iex
   cua-driver autostart kick
   ```

2. Run `cua-driver doctor` and `cua-driver status`. On macOS, also run
   `cua-driver permissions status`. If Accessibility or Screen Recording is
   missing, ask the user to run `cua-driver permissions grant` and complete the
   OS prompts. Never work around missing OS permissions with AppleScript,
   synthetic shell input, or another GUI driver.
3. If the daemon is not running, start `cua-driver serve` in a long-lived
   terminal. Preserve an already-running daemon's permission mode; do not
   restart it merely to broaden permissions.
4. Inspect the installed tool surface instead of assuming a version-specific
   schema:

   ```bash
   cua-driver list-tools
   cua-driver describe get_window_state
   cua-driver describe click
   ```

Invoke tools with `cua-driver call <tool> '<json>'`. Use `describe` whenever an
argument is uncertain.

## Snapshot, act, verify

Follow this loop for every GUI action:

1. State the exact postcondition, such as "Settings shows Dark mode selected."
2. Discover the target with `get_accessibility_tree` or another semantic tool,
   then take a fresh `get_window_state` snapshot for the exact PID and window.
3. Prefer the snapshot's `element_token` over `element_index`, and prefer both
   over pixel coordinates. Tokens identify the control and fail closed when the
   snapshot becomes stale.
4. Perform one action. Default to background delivery; use foreground delivery
   only when fresh evidence shows the background action did not land.
5. Take a new snapshot and verify the postcondition before continuing. A
   successful tool response proves delivery, not the resulting UI state.

Minimal shape:

```bash
cua-driver call get_accessibility_tree '{}'
cua-driver call get_window_state '{"pid":844,"window_id":10725}'
cua-driver call click '{"pid":844,"element_token":"s0000002a:14"}'
cua-driver call verify_state '{"pid":844,"window_id":10725,"expect":[{"element":{"selector":{"label_contains":"Saved"},"exists":true}}]}'
```

Re-snapshot before every later action. Never reuse a token after a snapshot of
the same window, navigation, modal transition, or substantial repaint.

## Use semantic operations first

- Use `invoke_menu` for native application-menu paths.
- Use `set_value` or `type_text` for accessible fields and `press_key` or
  `hotkey` for non-text keys.
- Use `set_window_frame` for window geometry and verify it with `list_windows`.
- For Chromium or Electron page content, bind the exact native window with
  `get_browser_state`, then use `browser_click`, `browser_type`,
  `browser_navigate`, and `browser_pointer` with fresh page refs.
- Use pixel coordinates only for canvas, video, WebGL, or custom-drawn controls
  absent from the accessibility tree. Coordinates must come from the same fresh
  window snapshot used by the action.

## Handle failures conservatively

- If a control is absent, refresh the snapshot and inspect dialogs, sheets, and
  application menus before escalating.
- If an action has no verified effect, retry only the narrowest failed step:
  background accessibility, then background pixel input, then foreground input.
- If the target or resulting state is ambiguous, stop and report what is
  visible. Do not click through unknown dialogs or retry destructive actions.
- Leave the user's windows, focus, tabs, and clipboard as you found them unless
  changing them is part of the request.

## Safety

This skill reaches real apps and signed-in sessions. Limit inspection and
actions to the user's request; never extract credentials, cookies, tokens, or
unrelated private data. Obtain confirmation immediately before sending a
message, submitting a form that creates an external commitment, publishing,
purchasing, deleting data, changing an account, accepting legal terms, or
taking another consequential external action. Authentication prompts,
passkeys, passwords, and MFA stay with the user.
