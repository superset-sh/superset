# Confirm before closing a terminal with a running process

## Goal
When the user closes a v2 terminal pane (Cmd+W, close button, middle-click, context
menu) that has a **foreground command running**, show a confirm dialog with a
"Don't ask again" checkbox. Closing at an idle shell prompt stays instant.

## Detection: foreground process group
No "is running" signal exists today. We compute it on demand from the shell's
controlling-terminal foreground process group (`ps -o tpgid`):

- idle prompt → the pty's foreground pgrp == the shell's own pgrp
- running command → foreground pgrp is the command's group, != shell's pgrp

This is precise: it does NOT false-positive on suspended/background jobs (unlike a
"shell has descendants" check).

## Changes

1. **`packages/pty-daemon/src/process-tree.ts`** — add
   `hasRunningForegroundProcess(shellPid): boolean` via `ps -o tpgid= -o pgid= -p <pid>`;
   returns `tpgid > 0 && tpgid !== pgid`. Fails closed (`false`) on any ps error.

2. **`packages/host-service/src/terminal/terminal.ts`** — add
   `sessionHasRunningProcess(terminalId)`: look up the in-memory session, call
   `hasRunningForegroundProcess(session.pty.pid)`.

3. **`packages/host-service/src/trpc/router/terminal/terminal.ts`** — add
   `hasRunningProcess` query `{ terminalId, workspaceId } -> { running }`.

4. **`packages/ui/src/atoms/Alert/Alert.tsx`** — extend `alert()`:
   - optional `checkbox?: { label; defaultChecked? }` rendered above the footer;
   - action `onClick` receives `{ checkboxChecked }`;
   - optional `onDismiss?()` fired when the dialog is closed without an action
     (Escape / outside-click) so callers can resolve `false` instead of hanging.

5. **`apps/desktop/src/renderer/stores/terminal-close-confirm/store.ts`** — new
   persisted zustand store: `{ suppressed, suppress() }` (localStorage).

6. **`usePaneRegistry.tsx`** terminal entry — add `onBeforeClose`:
   - suppressed → `true`;
   - fetch `terminal.hasRunningProcess`; error or not running → `true`;
   - running → `alert(...)` with the checkbox; Close→(suppress if checked) resolve
     `true`, Cancel/dismiss→resolve `false`.

## Scope
Pane-level close only (covers Cmd+W / CLOSE_PANE, button, middle-click, context
menu, browser-pane Cmd+W — all route through `onBeforeClose`). Whole-tab close
(CLOSE_TAB) is a follow-up.
