# Derive terminal agent status from the host binding

Shipped in PR #5449 (supersedes #5443). Status: implemented and CDP-verified; a short manual QA pass remains (see Validation).

## Problem

The desktop app tracked "which agent is doing what in which terminal" in two places that never reconciled:

1. **Host binding** — host-service keeps a `TerminalAgentBinding` per terminal (`agentId`, `lastEventType`, `lastEventAt`), fed directly by agent hook events and persisted in host SQLite.
2. **Renderer status map** — a localStorage-persisted zustand store replaying the same hook events (over WebSocket) into `working`/`permission`/`review` per terminal.

The renderer copy only updated while a window was open and connected, so any missed event became permanent drift: phantom "working" dots after restart, workspace indicators lit for dead terminals. Separately, bindings themselves leaked — nothing deleted them when a terminal died without an agent exit hook (kill -9, crash, host downtime).

## Design

**One source of truth: the host binding. The renderer stores facts about the user, never about agents.**

- `working` / `permission` / `idle` = pure function of `binding.lastEventType` (`deriveTerminalAgentStatus`). `mapEventType` already normalizes every vendor hook to `Start | Stop | PermissionRequest | Attached | Detached`, so the binding *is* the state machine.
- `review` = `lastEventType === "Stop" && lastEventAt > terminalSeenAt[terminalId]`. `terminalSeenAt` is the renderer's only persisted per-terminal state, written on pane focus, visible events, and mark-read.
- **Seen marks are host-clock only** (event `occurredAt` or `binding.lastEventAt`, never `Date.now()`). The mark is monotonic, so a single renderer-clock write can poison the comparison under clock skew — renderer-ahead hides real reviews forever. `markTerminalSeen` requires an explicit timestamp to make this unrepresentable.
- **Binding visibility derives from session liveness** (the #5443 root fix): `listByWorkspace`/`findActive` read via SQL join to `terminal_sessions` where `status = 'active'` and workspace-owned. Dead terminals are unrepresentable in reads regardless of how they died; no prune listeners, drains, or read guards. A best-effort `deleteDefunct()` at startup is table hygiene only.
- **Every liveness change broadcasts.** Dispose paths (pane close, workspace deletion, reaper) unsubscribe daemon callbacks before killing the pty, muting `onExit` — previously the only `terminal:lifecycle` broadcaster. Dispose now announces the exit itself, after the row flips to `disposed`.
- **Freshness**: lifecycle events invalidate the bindings query for instant updates; `staleTime: 30s` + window-focus refetch self-heal anything missed during a WS outage (host restart, sleep). Chosen over a bespoke bus `onReconnect` API, which was built and then removed.
- **Interrupt** (Esc/Ctrl+C): agents fire no Stop hook on interrupt, so the renderer POSTs a synthetic `Stop` to `notifications.hook`, gated on the binding being `Start`/`PermissionRequest` (Escape is high-frequency in terminals). It may derive as `review` for one cycle; the active-pane effect reconciles it against the recorded Stop time.
- **Adopted shells** with stale hook URLs hit the Electron fallback server; that path now forwards to the host's `notifications.hook` so the source of truth converges.

## Key files

- `packages/host-service/src/terminal-agents/persistence.ts` — `listLiveByWorkspace` / `findLiveActive` (liveness joins), `deleteDefunct`
- `packages/host-service/src/terminal/terminal.ts` — dispose broadcasts `terminal:lifecycle` exit
- `apps/desktop/src/renderer/hooks/host-service/useTerminalAgentStatuses/` — derivation (pure fn + hook)
- `apps/desktop/src/renderer/hooks/host-service/useV2NotificationStatus/` — composite status hooks incl. `useV2AttentionWorkspaceCount` (dock badge, ported from #5351 during merge)
- `apps/desktop/src/renderer/stores/v2-notifications/store.ts` — reduced to `manualUnread` + `terminalSeenAt`; persist v2 migration drops legacy statuses

## Decisions

- **Derive, don't reconcile.** Deleting the second projection beats adding a sync protocol: fewer states, no drift surface. Net production diff ~−215 lines.
- **Join, not pruning** (host). `terminal_sessions.status` is the already-maintained liveness source (pty onExit, dispose routes, reaper healing). Every review finding on #5443 was a failure mode of its compensating machinery.
- **`review` doesn't survive agent `Detached`.** Detach deletes the binding; keeping a tombstone for one green dot isn't worth the state. The chip disappears with the dot — self-explanatory. (Kiet-approved.)
- **"Clear status" can't wipe working/permission.** Those are live host state now — the point of the change. It clears manual-unread and marks bound terminals seen.
- **Skipped bot findings** (rationale on the PR): unconditional interrupt POST (Escape spam for plain shells; later Escapes retry naturally), seen-map rerender churn (few-entry map), synthetic-Stop retry (host-down at interrupt self-corrects on next interaction).

## Validation

Automated: 2045 desktop + 750 host-service tests, typecheck, lint. Derivation tests mutation-checked. Note: run `bun test` with cwd `apps/desktop` — the root skips `bunfig.toml`'s preload and fails ~83 tests spuriously.

CDP end-to-end (real hook POSTs, asserted at host SQLite + DOM + screenshots): binding transitions; working spinner / permission dot / review dot; **review survives full renderer reload** (the headline fix); review clears on workspace click with seen mark exactly equal to `binding.lastEventAt`; Detached deletes the binding; startup `deleteDefunct` clean.

Remaining manual pass (`bun dev`, real agent): visible-Stop → idle seen-marking, interrupt → synthetic Stop, pane delete → chip clears, dock badge sanity. Blocked from CDP by a dev-env pane-layout bug (below).

## Follow-ups

- **Pane-vanish dev bug** (ticket-worthy): freshly opened terminal panes disappear from the layout within seconds; smells like `v2WorkspaceLocalState` sync overwriting local pane layout. Session stays alive; xterm mounted but detached.
- **Worktree-missing zombies** (ticket-worthy): externally deleted worktrees leave sessions `active` and agents truthfully "working" but unreachable — no pane, no interrupt, reaper won't touch them. The worktree-missing screen should surface running terminals with a kill action.
- **Reboot residual**: pre-reboot `active` rows with a dead daemon keep bindings visible with stale `lastEventType` until pane attach. Host↔daemon reconciliation; belongs with the cold-restore work.
- Sidebar runs one bindings query + WS listeners per workspace row — watch for offline-host retry noise; gate `enabled` on host reachability if it shows up.
- Chat pane statuses (deleted as dead code) should be rebuilt on the derived model when they ship.
- If more event-invalidated queries (ports, git status) grow staleness bugs, that's the signal to invert to host-pushed snapshots rather than patch again.
