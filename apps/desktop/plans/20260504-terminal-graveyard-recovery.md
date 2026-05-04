# Terminal graveyard: recover scrollback after pty death

## Problem

Today scrollback recovery only works while the `Session` object is alive in
memory. The plumbing exists — `SerializeAddon` keeps a live snapshot
(`apps/desktop/src/main/lib/terminal/session.ts:35`) and `recoverScrollback`
replays an `existingScrollback` string into a fresh headless terminal
(`session.ts:48-58`) — but `handleSessionExit` →
`scheduleSessionCleanup` disposes the session 5s after the pty exits with
no clients attached
(`apps/desktop/src/main/terminal-host/terminal-host.ts:393-433`). Once
disposed, the buffer is gone. A user who closes a pane (or whose pty is
killed by `shutdownIfRunning({ killSessions: true })`) cannot reattach to
the same `paneId` and see prior output.

## Goal

Persist the serialized buffer at session death so a later
`createSession({ paneId })` can replay it via the existing
`existingScrollback` path. No protocol changes; no UI changes required.

## Design

### Storage

- One file per paneId at `app.getPath('userData')/terminal-graveyard/<paneId>.txt`.
- Plain text (the SerializeAddon output is already an ANSI-replayable
  string). No JSON wrapper — keep it cheap to read/write.
- Metadata (exitCode, exitedAt, byteSize) lives in a sidecar
  `index.json` updated atomically. Used for GC and diagnostics; never
  required to replay.

Why files instead of `local-db`: scrollbacks are large binary-ish blobs
(tens to hundreds of KB each), the access pattern is single-key
read/write, and we don't query across them. SQLite would just be
overhead.

### Write path

In `handleSessionExit` (`terminal-host.ts:393`), before scheduling
cleanup:

1. Call `getSerializedScrollback(session)`.
2. If non-empty and under the per-entry cap (e.g. 256 KB), write to
   `terminal-graveyard/<paneId>.txt` and update `index.json`.
3. Continue to `scheduleSessionCleanup` as today.

Also write opportunistically on a timer (every ~30s) for *attached* but
long-lived sessions, so a hard crash of the host process still leaves a
recent snapshot. Skip the timer write if the buffer hash is unchanged.

### Read path

In `createSession` (`session.ts:79`), if `existingScrollback` is null,
look up `terminal-graveyard/<paneId>.txt` and pass its contents. The
existing `recoverScrollback` call handles the rest. Delete the file
immediately after a successful read so we don't double-replay if the
session later exits and gets a new scrollback.

### Garbage collection

Run on app start, then daily:

- Drop entries older than **48 hours** (configurable).
- Cap total directory size at **50 MB**; evict oldest until under.
- Drop entries whose `paneId` no longer appears in any persisted
  workspace (cross-reference the pane store on app start).

Also: prune on settings change "clear terminal history" and on
`shutdownIfRunning({ killSessions: true })` when invoked by user-driven
quit (not by auto-update — see memory).

## Risks

**Secrets in scrollback.** Serialized output can include API keys,
`env` dumps, oauth flows the user expected to die with the process.
Mitigations:

- Default 48h TTL, not "forever".
- User-facing setting: "Recover terminal scrollback after close"
  (default on; off disables both write and read, and triggers a one-shot
  purge of the directory).
- File mode `0600`. Directory mode `0700`.
- No graveyard writes when `process.env.SUPERSET_TERMINAL_DEBUG` is
  unset *and* the user has opted out — but we always honor the
  per-pane size cap to bound exposure.

**Replay produces stale output.** The recovered buffer is a snapshot of
a dead pty. We should make this visually obvious — prepend a single
dim line like `── recovered from previous session (exited 2h ago) ──`
to the replayed bytes. The recovery flag (`session.wasRecovered`) is
already plumbed; surface it in the renderer.

**Disk write on the hot exit path.** Writing synchronously in
`handleSessionExit` adds latency. Use `fs.promises.writeFile` and don't
await it from the exit handler — fire-and-forget, log errors.

## Out of scope

- Cross-machine sync.
- Recovering the *cwd* / shell env of a dead pty (we can record it in
  the sidecar but we won't auto-restore the working directory; that's a
  bigger UX decision).
- v1 vs v2 — both code paths share `session.ts`, so this lands once.

## Test plan

- Unit: graveyard write/read round-trip; GC honors TTL and size cap;
  index.json stays consistent under concurrent writes.
- Integration: kill a pty, create a new session for the same paneId,
  assert `wasRecovered === true` and the headless buffer contains the
  pre-kill output.
- Manual: opt-out toggle wipes the directory; recovered banner renders;
  `shutdownIfRunning({ killSessions: true })` from auto-update path
  does *not* purge graveyard (memory: services survive Electron swaps).
