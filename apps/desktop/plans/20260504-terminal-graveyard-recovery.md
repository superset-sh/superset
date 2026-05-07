# Killed terminals stay in the dropdown for resurrect

## Problem

Today the v2 terminal-pane dropdown
(`apps/desktop/src/renderer/.../TerminalSessionDropdown.tsx`) lists only
live host-service sessions. Statuses are `Current`, `Starting`,
`Attached`, `Detached`. When a terminal is killed — either via the trash
icon in the dropdown, the pane's close button, or a natural shell exit —
the entry vanishes:

- User-kill goes through `terminal.killSession` → `disposeSession`,
  which calls `sessions.delete(terminalId)` in
  `packages/host-service/src/terminal/terminal.ts`. Gone.
- Natural shell exit fires the daemon's `onExit` callback, which sets
  `session.exited = true` but leaves the entry in the map. The trpc
  `listSessions` then filtered with `includeExited: false`, so the entry
  was hidden anyway.

Result: a user who closes a terminal can't get back to "the terminal I
just had" without retyping its workspace context, environment, etc. They
also have no visibility into recently-dead sessions.

## What ships

The dropdown now lists killed terminals as `Killed` next to existing
statuses. Selecting one rebinds the current pane to that `terminalId`
and the host-service spawns a fresh shell on the same id — exactly what
the user clarified: "load in and just have a new terminal session". No
scrollback replay (that's a follow-up).

### Server (host-service)

- `markSessionKilled(terminalId, db)` — kills the PTY, closes sockets,
  drops the daemon subscription, but **keeps the session entry in the
  in-memory `sessions` map** with `exited = true`. Schedules a one-shot
  `disposeSession` after `KILLED_RETENTION_MS` (30 minutes). Calling
  `markSessionKilled` on an already-killed entry hard-disposes
  immediately, so the trash button removes a Killed entry from the list.
- The natural-exit path (`wireSession.onExit`) also schedules the same
  TTL timer, so a session that ends via the shell's own `exit` shows as
  Killed for 30 min before being pruned.
- `createTerminalSessionInternal` early-returns the existing session
  unless it's exited; an exited entry is wiped (timer cleared) so the
  rest of the function spawns a fresh PTY on the same id. The DB row's
  status is re-activated by the `onConflictDoUpdate` that already exists
  there.
- `terminal.killSession` trpc procedure swaps `disposeSession` for
  `markSessionKilled`. Other dispose callers (workspace teardown,
  daemon-disconnect cleanup, `__resetSessionsForTesting`) keep using
  `disposeSession` — they need to fully evict.
- `terminal.listSessions` trpc procedure swaps `includeExited: false`
  for `includeExited: true` so killed entries reach the renderer.
- The `KILLED_RETENTION_MS` timers are tracked in
  `killedRetentionTimers` and cleared on resurrect, hard-dispose, and
  daemon-disconnect.

### Renderer

`TerminalSessionDropdown.tsx`:

- Status renderer adds a `session.exited ? "Killed" : ...` branch.
- Sort prefers live entries above killed within the dropdown body.
- `handleSelectSession` skips the "switch to existing pane location"
  shortcut when the picked session is killed (it has no live pane to
  switch to). Falls through to the rebind path → host-service spawns a
  fresh shell on the same id.
- The trash-icon flow is unchanged from the user's perspective: first
  click marks killed (entry stays as "Killed"), second click hard-
  disposes (entry leaves the list).

## Out of scope (intentional follow-ups)

- **Scrollback replay.** Resurrect today gives a fresh shell with no
  prior output. Restoring scrollback would require persisting the host-
  service `session.buffer` to disk on kill — separate change.
- **Cross-restart persistence.** Killed sessions live only in the host-
  service's in-memory map. A host-service restart still loses them.
- **Per-pane TTL override / settings UI.** 30 minutes is hard-coded.
- **"Recently killed" sub-section header.** All entries flow through the
  same list; only the status text differentiates them.

## Risk

- **Resource pin until TTL.** The session entry holds a `TerminalSession`
  record with `buffer: Uint8Array[]` (capped at 64 KB) plus metadata.
  At 30 min and a 64 KB ceiling per entry, worst-case footprint is
  bounded; pruning races are handled because resurrect/hard-dispose
  always clear the timer first via `clearKilledRetention`.
- **DB row status.** Killed sessions sit in `terminalSessions` with
  status `exited` until the TTL fires `disposeSession`, which sets
  `disposed`. Existing consumers of that table look only at non-disposed
  rows, so the extra `exited` lifetime is harmless.

## Tests

- `terminal.adoption.node-test.ts`:
  - `markSessionKilled` keeps the entry visible as exited; resurrect
    spawns a fresh shell with a different pid.
  - Calling `markSessionKilled` twice on the same id removes the entry
    on the second call.
- Existing integration tests in
  `packages/host-service/test/integration/terminal.integration.test.ts`
  still pass (41/41).
