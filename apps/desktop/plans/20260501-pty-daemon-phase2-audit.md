# Phase 2 Audit — Daemon-Upgrade FD-Handoff

**Date:** 2026-05-01
**Worktree audited:** `elastic-lens` (post Phase 1 / PR #3896 ship state)
**Goal:** survey the codebase before designing Phase 2 (preserve PTY sessions across daemon-binary upgrades via fd inheritance).

## Current Phase 1 baseline (just shipped)

- `DaemonSupervisor` (`packages/host-service/src/daemon/DaemonSupervisor.ts`) owns spawn/adopt/restart.
- `restart()` today: SIGTERMs old daemon → clears crash circuit → spawns fresh. **Sessions die in the gap.** The Settings UI tells the user.
- Manifest at `$SUPERSET_HOME_DIR/host/{orgId}/pty-daemon-manifest.json` lets a fresh host-service adopt a still-running daemon.
- Adopted-liveness polling (2s `process.kill(pid, 0)`) catches externally-killed adopted daemons.
- `EXPECTED_DAEMON_VERSION` in `expected-version.ts` drives the "update available" badge; mismatch never auto-kills.

## Phase 0 (harness) — what's already proven

Lives in `apps/desktop/plans/pty-handoff-experiment/` (design-doc branch).

- **fd inheritance survives parent exit** — kernel does not close inherited stdio fds when parent dies (test2-handoff.js, macOS arm64, Node 24, node-pty 1.1).
- **byte continuity** — counter workload showed no dropped output across handoff (test3-counter-handoff.js).
- **Node-only is sufficient** — no Go helper needed; node-pty's master fd works the same as creack/pty for handoff.
- **untested**: Linux, macOS x86_64, very high N (1000+), SIGKILL during handoff, SCM_RIGHTS from pure Node.

## What's ready, what's blocked

### Master fd access — already validated in Phase 0

- `Pty.ts` (`packages/pty-daemon/src/Pty/Pty.ts:24-84`) wraps `IPty` and exposes `pid`, `meta`, `write`, `resize`, `kill`, `onData`, `onExit` — but not the fd.
- node-pty's `IPty` typings have no public `fd` property. Phase 0 reached into **`term._fd`** (private property) and confirmed it works: process continuity, byte continuity, zero dropped output (test2-handoff.js, test3-counter-handoff.js, macOS arm64 / Node 24 / node-pty 1.1).
- Phase 0's explicit conclusion: "the daemon can be Node-only." Accepting the `_fd` private-property dependency is the chosen path. Pin node-pty in package.json + add a startup assert for `_fd` typeof "number" so we fail loudly if a future bump breaks it.
- Action item for Phase 2: expose `getMasterFd()` on `Pty.ts` that returns `(this.pty as unknown as { _fd: number })._fd`.

### Wire protocol — has room, no conflict

- `protocol/version.ts`: hardcoded `CURRENT_PROTOCOL_VERSION = 1`. `SUPPORTED_PROTOCOL_VERSIONS` exists for migration.
- `protocol/messages.ts`: union type covers hello/open/input/close/list/subscribe/unsubscribe. **No handoff message yet.** Adding one requires bumping protocol to 2.

### Supervisor lifecycle — clean integration point

- `restart(organizationId)` (lines 169-195) is the slot. Today: await pending → `stop()` → clear circuit → `ensure()`.
- Phase 2 forks here: replace `stop()` + `ensure()` with a new `handoffTo(newBinaryPath)`.
- No mutexes — relies on event loop. `pendingStarts` map already prevents concurrent spawns. `stopping` set prevents crash-respawn on expected exit. **`handoffInProgress` set probably needed** to mark "expected exit, don't crash-respawn" during the handoff window.
- Adopted-liveness check is compatible: spawned daemons fire `child.on("exit")`; no race with intentional exit.

### Server socket ownership — sequence-sensitive

- `Server.listen()` (`packages/pty-daemon/src/Server/Server.ts:50-68`) does `fs.unlinkSync` then `net.Server.listen()`. **Always creates a new socket.** No "take over from predecessor" mode.
- Implication: the old daemon must exit (or close its listener) **before** the new daemon's `listen()` call, or the new daemon hits `EADDRINUSE`.
- Sequence options:
  1. Old daemon `close()`s listener → unlinks socket → new daemon binds → old daemon exits after handing off in-memory session metadata. (Existing connections to old daemon stay alive on the inherited socket fd? — needs verification.)
  2. New daemon binds to a *temp* socket, manifest gets updated, clients reconnect. (Defeats the goal — visible disruption.)
  3. Pass the listening socket fd itself in the inherited stdio array. (More work, cleanest.)

### Manifest — extensible, no schema break needed for MVP

- `manifest.ts` parses leniently — extra fields ignored. A `handoffInProgress?` or `successorPid?` field is safe to add without versioning.

### Tests — clean split possible

- `terminal.daemon.test.ts` lines 103-121: tRPC `restart` delegation. Add a `restart({ handoff: true })` variant.
- `DaemonSupervisor.test.ts` + `.node-test.ts`: existing kill-respawn integration test stays. Add new `handoff survives daemon-binary swap with live sessions`.
- Phase 0 harness should also gain: Linux + high-N + SIGKILL-during-handoff before production ship.

## Open design questions (input to /decide)

In rough dependency order — D1 constrains everything else:

1. **D1: What does the new daemon inherit?** Just PTY master fds (and rebuild session metadata over wire from old daemon)? Or PTY fds + the listening socket fd?
2. **D2: How does the old daemon exit?** Graceful SIGTERM with confirmed-handoff-complete? Or hard exit once new daemon ack'd? What about in-flight wire requests?
3. **D3: Where does session metadata live during handoff?** Old daemon serializes via wire protocol → new daemon rehydrates? Or we promote the manifest into a richer "handoff snapshot" file?
4. **D4: Signal: opt-in or automatic?** Today "Restart and update" SIGTERMs. Phase 2 changes that semantic — do we add a separate "Update without disruption" path, or upgrade the default?
5. **D5: Failure mode if handoff fails?** Old daemon was about to exit, new daemon couldn't bind/inherit — do we (a) abort and keep old daemon running, (b) fall through to today's kill+respawn (sessions die), (c) leave both running and tell user?
6. **D6: Protocol version bump?** Add an `upgrade-init`/`upgrade-ack` message and bump `CURRENT_PROTOCOL_VERSION` to 2, with `SUPPORTED_PROTOCOL_VERSIONS=[1,2]` for one release?

## Recommendation for next step

Walk through D1-D7 via `/decide`, then write the implementation plan. Phase 0 already validated the kernel primitive — what's left is the elastic-lens-specific choreography.
