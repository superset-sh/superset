# PTY accumulation & terminal lifecycle cleanup

User report: M1 Max hits the macOS PTY-master limit (509/511) after 4–7 parallel workspaces. 16 daemon sessions with 103 descendant processes; largest 7hr old, 42 processes, 5.4 GB. Renderer crawls. Reproduces with Claude and Codex. v1 felt faster.

## Progress (2026-07-17)

- [x] **PR 1 — daemon kill hardening**: MERGED as #5748 (2026-07-17). Includes bot-review fixes (tty-reuse guard, ps-failure handling, killChain reset, desktop entrypoint drain) and the TreeKiller dedupe. Verified: unit, per-scenario kill-tree tests (mutation-checked), 54-test integration suite, end-to-end old-vs-new daemon repro (3 leaked → 0).
- [ ] **PR 2 — reliable dispose** (renderer awaits + `disposeRequestedAt` retry): not started.
- [ ] **Backstops** (liveness reaping, idle TTL + cap, renderer park=disconnect, registry reconcile): deferred until PR 1+2 are measured in the wild.

## Root cause (TLDR)

The per-terminal kill path is solid. Accumulation comes from everything around it:

1. **No idle/TTL reaping, no session cap** — a daemon session lives forever unless its DB row is explicitly marked dead.
2. **Reaper only kills on deleted-workspace FK set-null** — closed-but-not-deleted workspaces, or any missed dispose, leak forever.
3. **Workspace-close dispose is fire-and-forget** — a transient host-service failure silently leaks all sessions.
4. **Prod app-quit kills nothing by design** — detached daemon + all descendants survive.
5. **Daemonizing descendants (double-fork + setsid) escape the tree kill** — MCP servers, build daemons, watchers.
6. **Renderer: parked ≠ disconnected** — every visited terminal keeps a live WS, xterm instance, 5s timer, and live output parsing forever.

## Findings by area

### 1. Terminal close kill path (works, with escapes)

Tab close branches at `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/usePaneRegistry.tsx:342-351`:
- background intent → `release()` — park, no kill
- default → `dispose()` + tRPC `terminal.killSession`

Host-service `disposeSessionAndWait` (`packages/host-service/src/terminal/terminal.ts:738-826`) → daemon `{type:"close", signal:"SIGHUP"}` (`packages/pty-daemon/src/handlers/handlers.ts:116-130`; SIGHUP because `zsh -l` traps SIGTERM) → `NodePtyAdapter.kill` (`packages/pty-daemon/src/Pty/Pty.ts:93-101`):
- `signalProcessTreeAndGroups` (`packages/pty-daemon/src/process-tree.ts:34-90`): full ppid tree walk via `ps -axo pid,ppid,pgid`, signals every descendant pid AND `kill(-pgid)` per descendant group; SIGKILL escalation after 1s to the same target set (`Pty.ts:117-133`).

**Escapes:**
- Double-fork + setsid daemonizers: reparent to pid 1 + fresh pgid → invisible to both the ppid walk and the group set. Explains the 7hr orphan trees.
- Snapshot race: SIGKILL reuses the target set captured at SIGHUP time; anything forked in the 1s window slips through (agent MCP spawn bursts).
- `.unref()`'d escalation timer (`Pty.ts:132`): SIGHUP-trapping shell survives if the daemon is exiting.

### 2. Workspace close/delete cleanup (the weak link)

- `useCloseWorkspace.ts:114` / `useDeleteWorkspace.ts:94` fire `void disposeHostSessionsForWorkspace(...)` — fire-and-forget broadcast that swallows all errors (`renderer/lib/dispose-host-sessions.ts:24-43`).
- Electron `workspaces.close` (`apps/desktop/src/lib/trpc/routers/workspaces/procedures/delete.ts:345-369`) kills only main-process terminals; `deleteWorktree` (`delete.ts:456-556`) does no terminal kill at all — relies on the renderer broadcast.
- Worktree removal never kills by actual process cwd — disposal keyed on DB workspace→worktreePath mapping only (`terminal.ts:882-899`); `git worktree remove --force` deletes the dir under running shells.
- The enumerate-and-kill logic itself is correct when reached: `disposeSessionsByWorkspaceId` (`terminal.ts:835-875`).

### 3. Daemon orphan tracking: none

- `SessionStore` (`packages/pty-daemon/src/SessionStore/SessionStore.ts`): in-memory Map, no TTL, no idle tracking, no max-session limit. Zero-subscriber sessions indistinguishable from active.
- Reaper (`packages/host-service/src/terminal/reaper/reaper.ts`, 5 min): kills only if row is `disposed`/`exited`/null `originWorkspaceId`, or rowless (two-pass). "Workspace gone" reaches it only via FK `onDelete: "set null"` (`packages/host-service/src/db/schema.ts:20-22`) — i.e. only on actual local workspace row deletion. Active row + live workspace id = immortal session, re-adopted for port scanning forever.
- macOS ~511 PTY ceiling: no guard; surfaces as `ESPAWN` at next open (`handlers.ts:60-66`).

### 4. Renderer slowdown: parked ≠ disconnected

Registry is a module-level singleton outliving React (`terminal-runtime-registry.ts:467-470`). Pane unmount calls `detach` → parks DOM, keeps WS + xterm alive (`terminal-runtime.ts:319-331`). Per parked session, forever:
- Live WS + reconnect loop; 5s liveness `setInterval` (`terminal-ws-transport.ts:277,311-319`); 3 global focus/online/visibility listeners (`:321-331`). Focus fans out reconnects to all N transports, no jitter/cap (v1 capped at 3, `attach-scheduler.ts:11`) → Chromium WS handshake throttle bursts.
- Host keeps broadcasting live PTY output to hidden terminals (parked sockets stay in `sockets` set, `terminal.ts:221`); renderer parses it into xterm every RAF (`terminal-ws-transport.ts:513-530`). Chatty hidden agents = linear invisible CPU drain. The 8 MB `bufferedAmount` cap is a safety valve, not flow-hold.
- 5000-line scrollback per retained xterm (`shared/constants.ts:42`) — linear aggregate memory.
- Cleanup is layout-driven, no reconcile: registry entries whose pane vanished abnormally leak transport + timer (`useDashboardSidebarState.ts:180-187` vs `registry.getAllTerminalIds()`).

### 5. v1 vs v2

v1 PTYs were Electron children (`apps/desktop/src/main/lib/terminal/session.ts:70`): app quit = free SIGHUP reaping; one IPC hop. v2 = detached org daemon (`DaemonSupervisor.ts:1067`, `detached: !isDev`) via renderer → relay WS → host-service → unix socket → daemon. v2 replaced OS-level cleanup with "explicit kill + reaper", and the reaper's trigger condition is the missing half.

### 6. MCP/agent subprocess cleanup

No dedicated cleanup anywhere — agents run inside the PTY shell; cleanup relies 100% on the tree/group kill. Fine for well-behaved children; wrong for daemonizers and the snapshot race.

## Fix plan (kill-path-first, revised)

Direction: make the kill path airtight at kill time before adding any new reaping machinery. Sweeps stay as a later backstop only.

### PR 1 — daemon kill hardening (`Pty.ts`, `process-tree.ts`) — IMPLEMENTED

1. **Re-snapshot at SIGKILL escalation** ✓: every escalation round re-reads the process table (async) instead of replaying the SIGHUP-time target list — closes the fork-window race.
2. **Verify-and-repeat with backoff** ✓: rounds at 1s then +0.3/0.7/1.5/2.5s (~6s window for loaded machines); early-exit when clean so a normal kill pays one extra ps; stderr warning if survivors remain.
3. **Kill by controlling tty + durable pgids** ✓: `RootIdentity` per session (tty + every pgid ever observed, seeded async at spawn, refreshed from each volley's own table); volleys target tree ∪ known-group members ∪ same-tty rows. Also fixed: the `includeRoot:false` path never group-signaled the root's own pgid, so same-pgid orphans (`npm` grandchildren) leaked — now pid-targeted via knownPgids.
4. **No dropped escalations** ✓: kill-chain timers are ref'd, and `main.ts` shutdown awaits `drainPendingKills(2000)` before `process.exit`.

Perf constraint learned the hard way: all identity capture is **async** (`execFile`) — a spawnSync ps on the session-open path stalls the daemon's event loop and broke multi-client output delivery under load.

**Discovered residual**: when the session leader *exits*, the controlling tty dissolves (`ps` shows `??`) — a child forked into a new pgid around leader death is untraceable by any kill path (same class as setsid daemonizers). Backstop remains the TTL reaper (item 8).

Tests: `test/kill-tree.test.ts` (real-PTY node tests, one per escape class, each verified to fail on the old implementation) + `src/process-tree.test.ts` (parsing).

### PR 2 — reliable dispose (kill the fire-and-forget)

Host already awaits kills and returns `{terminated, failed}` (`disposeSessionsByWorkspaceId`, `terminal.ts:835-875`); the result is discarded at the renderer boundary.

5. **Renderer awaits and surfaces**: `disposeHostSessionsForWorkspace` returns aggregated counts + RPC errors; `useCloseWorkspace`/`useDeleteWorkspace` await it. Close still proceeds; failure → actionable toast with Retry.
6. **Durable retry via `disposeRequestedAt`**: stamp the row when dispose is requested; failed kills keep the stamp and the *existing* 5-min reaper retries them regardless of workspace liveness. Records intent-to-kill durably — no new sweep, no heuristics. (Today a failed kill on close leaves an `active` row the reaper never matches while the workspace row exists — immortal.)

### Later — backstops (only after 1–6 measured)

7. **Reap by liveness** (`reaper.ts` predicate widening): kill sessions whose workspace row is gone or worktreePath deleted. Covers renderer-crashed-before-broadcast and older-build leftovers — the one class PR 2 can't reach.
8. **Idle TTL + session cap in the daemon**: zero-subscriber idle > ~12h reaped; cap well below 511 with oldest-idle eviction. Covers true `daemon()` escapees (setsid + closed fds — invisible to any kill path).
9. **Renderer: park = disconnect** — close WS on detach, replay host 64 KB tail on reattach; jitter + concurrency cap (3) on resume-reconnect fan-out. Addresses the machine-wide slowdown.
10. **Registry reconcile pass**: diff `registry.getAllTerminalIds()` against live pane layouts; release orphans.
