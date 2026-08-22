---
name: computer
description: Operate the user's real desktop apps and windows on macOS, Windows, or Linux. Use when the user asks to open or drive a native app, click or type in a desktop UI, inspect or arrange a window, use their signed-in system browser, or verify an end-to-end GUI flow, including "open Settings and turn on dark mode", "click Save in that window", "what's on screen". Uses an accessibility-first driver (Cua Driver by default, Peekaboo on macOS). Not for Superset's in-app browser pane, headless scraping, or anything an API or CLI can do directly.
argument-hint: the app and what to do in it
allowed-tools: Bash(cua-driver:*) Bash(peekaboo:*)
---

# Superset Computer Control

Operate the user's real desktop through an accessibility-first driver: a local
CLI that exposes accessibility snapshots, exact window screenshots, native menu
operations, and targeted input without making the agent guess at stale screen
coordinates. The contract in this skill (preflight, task-scoped session,
snapshot, act, verify, semantic operations first, conservative failure
handling, clean teardown) is driver-agnostic. The command reference below is
for Cua Driver, the default.

## Choose the right surface

- Use this skill for native apps, OS UI, and browser windows outside Superset.
- Use `superset:browser` for Superset's in-app browser pane.
- Prefer an application API, purpose-built CLI, or direct filesystem operation
  when the requested result does not require GUI interaction.

## Choose a driver

- If the user names a driver, use that one.
- Otherwise use whichever supported driver is already installed:
  [Cua Driver](https://cua.ai/docs/cua-driver) (`cua-driver`, cross-platform,
  the default) or [Peekaboo](https://peekaboo.sh) (`peekaboo`, macOS only). If
  both are installed, use Cua Driver and mention the alternative once.
- If neither is installed, ask the user which to install before installing
  anything; recommend Cua Driver unless the user is macOS-only and prefers
  Peekaboo.
- With a driver other than Cua Driver, apply this skill's contract through that
  driver's own command surface; discover it with the driver's help output and
  documentation rather than assuming the Cua command shapes below.

## Set up Cua Driver (default)

1. Confirm the installed executable with `command -v cua-driver` on macOS or
   Linux, or `Get-Command cua-driver` in Windows PowerShell, then inspect
   `cua-driver --version`. Do not silently install or upgrade it. If it is
   missing, ask the user to authorize an installer from the [Cua Driver
   installation guide](https://cua.ai/docs/how-to-guides/driver/install). On
   macOS or Linux, use:

   ```bash
   /bin/bash -c "$(curl -fsSL https://cua.ai/driver/install.sh)"
   ```

   On Windows, use PowerShell:

   ```powershell
   irm https://cua.ai/driver/install.ps1 | iex
   cua-driver autostart enable
   cua-driver autostart kick
   ```

2. Run `cua-driver doctor` and `cua-driver status`. On macOS, also run
   `cua-driver permissions status`. If Accessibility or Screen Recording is
   missing, ask the user to run `cua-driver permissions grant` and complete the
   OS prompts. Never work around missing OS permissions with AppleScript,
   synthetic shell input, or another GUI driver.
3. Preserve an already-running daemon's permission mode; do not restart it
   merely to broaden permissions. If the environment needs explicit service
   setup, follow the platform-specific guidance reported by `doctor`.
4. Inspect the installed tool surface instead of assuming a version-specific
   schema:

   ```bash
   cua-driver list-tools
   cua-driver describe get_window_state
   cua-driver describe click
   ```

Invoke tools with `cua-driver call <tool> '<json>'`. Use `describe` whenever an
argument is uncertain.

## Declare a task session

Create a unique session before the first GUI observation:

```bash
cua-driver call start_session '{"session":"superset-computer-<unique>"}'
```

Pass the same `session` to every tool that accepts it. It owns this run's agent
cursor and lifecycle cleanup. It does not select the capture mode or grant
access beyond the daemon's fixed permission mode.

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
cua-driver call get_window_state '{"pid":844,"window_id":10725,"session":"superset-computer-<unique>"}'
cua-driver call click '{"pid":844,"element_token":"s0000002a:14","session":"superset-computer-<unique>"}'
cua-driver call verify_state '{"pid":844,"window_id":10725,"session":"superset-computer-<unique>","expect":[{"element":{"selector":{"label_contains":"Saved"},"exists":true}}]}'
```

Re-snapshot before every later action. Never reuse a token after a snapshot of
the same window, navigation, modal transition, or substantial repaint.

## Use semantic operations first

- Use `invoke_menu` for native application-menu paths.
- Use `set_value` or `type_text` for accessible fields and `press_key` or
  `hotkey` for non-text keys.
- Use `set_window_frame` for window geometry and verify it with `list_windows`.
- For Chromium or Electron page content, discover the exact browser PID and
  window ID, then call `get_browser_state`. If it reports
  `browser_requires_setup`, call `browser_prepare` under its approval rules.
  After preparation, use its returned PID to rediscover the window and call
  `get_browser_state` again. Use the returned `target_id` and `tab_id` with
  `browser_click`, `browser_type`, `browser_navigate`, and `browser_pointer`,
  refreshing the page snapshot before each later browser action.
- For browser pixel actions, `browser_click` and `browser_pointer` coordinates
  must be viewport CSS pixels from the latest `get_browser_state` page
  snapshot. For native pixel actions, use coordinates only for canvas, video,
  WebGL, or custom-drawn controls absent from the accessibility tree, and take
  them from the same fresh `get_window_state` snapshot used by the action.

## Handle failures conservatively

- If a control is absent, refresh the snapshot and inspect dialogs, sheets, and
  application menus before escalating.
- If an action has no verified effect, retry only the narrowest failed step:
  background accessibility, then background pixel input, then foreground input.
- Escalate to full-desktop control only after semantic, accessibility, pixel,
  and foreground-window routes are exhausted, and only through the mechanism
  advertised by the installed driver version.
- If the target or resulting state is ambiguous, stop and report what is
  visible. Do not click through unknown dialogs or retry destructive actions.
- Leave the user's windows, focus, tabs, and clipboard as you found them unless
  changing them is part of the request.

## Finish cleanly

Take a final fresh snapshot or semantic readback, report the observable result,
and end only the session created for this task:

```bash
cua-driver call end_session '{"session":"superset-computer-<unique>"}'
```

Do not stop a shared driver daemon or close unrelated windows when the task
ends.

## Safety

This skill reaches real apps and signed-in sessions. Limit inspection and
actions to the user's request; never extract credentials, cookies, tokens, or
unrelated private data. Obtain confirmation immediately before sending a
message, submitting a form that creates an external commitment, publishing,
purchasing, deleting data, changing an account, accepting legal terms, or
taking another consequential external action. Authentication prompts,
passkeys, passwords, and MFA stay with the user.
