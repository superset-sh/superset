# Terminal Persistence DX Hardening (No Startup Freeze, Smooth Switching, Bounded Resources)


## Purpose

When “Terminal persistence” is enabled, Superset should never freeze or spin at startup, even if the user has accumulated dozens of terminal panes over time. The user should be able to switch between recent terminal tabs with near‑instant feedback, without keeping every terminal renderer and stream active.

This work matters because today a user can get their desktop app into a broken state where a large restored terminal set causes 99% CPU usage and an infinite macOS spinner. The goal is to make persistence robust by default and to make failure modes recoverable from within the UI (no manual edits to `~/.superset/app-state.json`).


## Context

Superset Desktop (Electron) renders terminals in the renderer process using xterm.js. For persistence across app restarts, the Electron main process can delegate terminal ownership to a detached “terminal host daemon” (a Node process) that owns PTYs and maintains a headless xterm emulator for each session. The renderer talks to the main process via tRPC, and the main process talks to the daemon via a Unix domain socket using NDJSON messages.

On this branch, the daemon protocol was recently changed to split “control” (RPC) and “stream” (terminal output) sockets (see `apps/desktop/plans/done/20260106-1800-terminal-host-control-stream-sockets.md`). That fix addresses head‑of‑line blocking when one terminal spams output, but it does not address a different failure mode: restoring many sessions at once can still saturate CPU and freeze the UI.

The observed freeze happens because the renderer mounts far more terminal UIs than the user can see, and each mounted terminal immediately calls `terminal.createOrAttach`, which in daemon mode can cause disk I/O, snapshot generation, and (when sessions are missing) new PTY spawns. When this happens tens of times concurrently, startup becomes unresponsive.

Mount policy is therefore the primary lever for fixing the startup freeze. However, mount policy alone is not a complete robustness strategy: a single tab can still contain many terminal panes (splits), cold restore can otherwise spawn many shells quickly when sessions are missing, and future regressions could reintroduce large attach/spawn fan-out. This plan pairs the mount-policy fix with safety nets (concurrency limits, progressive attach) and clearer cold-restore semantics.


## Definitions (Plain Language)

A “workspace” is a worktree-backed project environment shown in the left sidebar. A “tab” is a group within a workspace (the top “GroupStrip”). A “pane” is a tile within a tab’s Mosaic layout; a terminal pane is one pane type. In this codebase, a pane has a stable ID and the terminal session is keyed by that pane ID.

“Daemon mode” means terminal persistence is enabled; terminal sessions live in the detached daemon process and survive app restarts. “Attach” means connecting the app’s event stream to an existing daemon session. “Spawn” means starting a new PTY/shell process for a session.

“tRPC” is the typed RPC layer used for renderer ↔ main-process calls in this repo. In the renderer, calls live under `apps/desktop/src/renderer/lib/trpc`. In the main process, handlers live under `apps/desktop/src/lib/trpc/routers/*`.

“NDJSON” means newline-delimited JSON (each message is a JSON object followed by `\n`). The main process and the daemon use NDJSON over Unix domain sockets for control messages and terminal event streaming.

“PTY” (pseudo-terminal) is the OS-backed terminal device used to run shells. In daemon mode, the daemon spawns PTYs (via node-pty) and streams their output.

“TUI” (text user interface) means full-screen terminal apps like `vim`, `htop`, or Codex/Claude Code UIs. These often use the “alternate screen” buffer (“alt-screen”), which is why unmount/remount must restore terminal state carefully.

“Pane status” is a persisted per-pane UI indicator used to surface agent lifecycle state across tabs/workspaces. It lives on `pane.status` and currently supports `idle`, `working`, `permission`, and `review`. The tab strip (`GroupStrip`) and workspace list aggregate pane statuses using shared priority logic in `apps/desktop/src/shared/tabs-types.ts` and render dots via `apps/desktop/src/renderer/screens/main/components/StatusIndicator/StatusIndicator.tsx`.

Separately, Superset Desktop can show macOS desktop notifications for agent lifecycle events (for example “Agent Complete” or “Input Needed”). Those notifications are triggered in the main process (`apps/desktop/src/main/windows/main.ts`) from the same agent lifecycle event stream, and they are not driven by general terminal output.

An “LRU warm set” is a small, bounded cache of most-recently-used terminal tabs that remain mounted to keep common tab switches fast. It is explicitly not persisted, so it cannot cause startup fan-out after restart.

A “session lifecycle signal” (in scope for this PR) is a low‑volume event such as “this terminal session exited” that exists only to keep existing UI state correct (for example clearing stuck agent lifecycle statuses) when terminal panes are not mounted.

“Cold restore” means: the daemon does not have a session (for example after reboot), but we have on-disk scrollback from a prior run that did not shut down cleanly. The UI should show the saved scrollback and let the user explicitly start a new shell.


## Repo Orientation (Where Things Live)

Renderer (browser environment, no Node imports):

    apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/index.tsx
    apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/Terminal.tsx
    apps/desktop/src/renderer/stores/tabs/store.ts
    apps/desktop/src/renderer/stores/tabs/useAgentHookListener.ts
    apps/desktop/src/renderer/screens/main/components/StatusIndicator/StatusIndicator.tsx

Main process (Node/Electron environment):

    apps/desktop/src/main/index.ts
    apps/desktop/src/main/lib/terminal/index.ts
    apps/desktop/src/main/lib/terminal/daemon-manager.ts
    apps/desktop/src/main/lib/terminal-host/client.ts

Daemon:

    apps/desktop/src/main/terminal-host/index.ts
    apps/desktop/src/main/terminal-host/terminal-host.ts
    apps/desktop/src/main/terminal-host/session.ts

Persisted UI state:

    apps/desktop/src/main/lib/app-state/index.ts
    apps/desktop/src/lib/trpc/routers/ui-state/index.ts
    apps/desktop/src/shared/tabs-types.ts


## Problem Statement (What Breaks Today)

When terminal persistence is enabled, the renderer currently keeps every tab that contains a terminal mounted (even if hidden), across all workspaces. This is implemented in `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/index.tsx` by rendering all “terminal tabs” and toggling visibility. Each terminal pane mounts a `Terminal` component, and each `Terminal` immediately calls `trpc.terminal.createOrAttach` and enables a stream subscription (`trpc.terminal.stream.useSubscription`).

If a user has accumulated many terminal panes in persisted state (for example `tabsState.panes` contains ~90 terminal panes), startup mounts and attaches all of them. In daemon mode, each attach also does disk work for cold-restore detection (`HistoryReader.read`) and can cause new PTY spawns if the daemon is missing sessions. The combined fan‑out can saturate CPU, fill logs, and freeze the UI.


## Goals

This work should deliver these user-visible outcomes:

1. App startup remains responsive with 50–100 persisted terminal panes; the UI shows quickly and does not beachball.
2. Switching to a recently used terminal tab feels “instant enough” (target: the user sees a correct terminal view within ~200ms in the common case).
3. Terminal persistence remains “real” (processes keep running in the daemon) even if their UI is not mounted, and the UI does not regress in correctness (for example, agent lifecycle `pane.status` does not get stuck forever because a terminal exited while hidden).
4. The daemon cannot be driven into unbounded resource usage by accident. There are clear limits, and the UI provides a way to manage sessions and recover from overload.
5. Cold restore does not spawn a new shell until the user explicitly starts one.


## Non-Goals

This plan does not attempt to replace xterm.js, node-pty, or rewrite the persistence architecture. It does not introduce any new user-facing “background terminal output” indicators or notifications; it only preserves correctness via low-volume session lifecycle signals (exit/error) needed to keep existing agent lifecycle `pane.status` state accurate.

This plan explicitly does not attempt to provide “notify me when an arbitrary command finishes” for normal terminal commands like `pnpm test`. Implementing that requires prompt-level hooks or explicit wrappers, and will be tracked as a separate DX follow-up PR.


## Assumptions

Terminal persistence is a user setting that requires an app restart to take effect (`apps/desktop/src/main/lib/terminal/index.ts`). The renderer and main process can therefore treat “daemon mode enabled” as stable for the lifetime of a run.

The daemon and client are shipped together, but we must handle stale daemons because the daemon is detached and can outlive an app update. Any incompatible protocol changes must include an upgrade path that cleanly shuts down old daemons.


## Open Questions

These questions must be answered (or explicitly decided) before implementation is finalized:

None (all previously open questions have been decided for this PR scope).


## Decision Log (To Be Filled As Questions Are Resolved)

1. Decision (Background indicators scope): This PR will not introduce any new background terminal activity indicators beyond the existing agent lifecycle `pane.status` updates driven by `apps/desktop/src/renderer/stores/tabs/useAgentHookListener.ts`. Any additional background terminal output indicators or “command finished” semantics will be explored in follow-up PRs based on user/team feedback.
2. Decision (Warm set size): Use a global per-run LRU warm set of 8 terminal tabs (across all workspaces), not persisted and not configurable in the first iteration. This matches the “I jump between up to ~8 workspaces” power-user workflow while keeping the resource cost bounded. Tradeoff: higher warm size increases steady-state renderer memory and can increase CPU under very chatty background terminals; Milestone 0 includes a concrete measurement step and we will reduce the default if the measured cost is too high.
3. Decision (Daemon resource policy): Warn-only by default + user-facing recovery tools. Do not enable automatic idle eviction / LRU eviction by default in this PR, because it can kill long-running user processes unexpectedly. If we add eviction later, it should be opt-in and clearly explained in settings.
4. Decision (Cold restore promise): Always show saved scrollback first and require an explicit user action (“Start Shell”) to spawn a new PTY after cold restore. Never auto-spawn on attach.
5. Decision (Reattach latency UX): Keep warm tabs effectively instant. For cold attaches, show a fast “Resuming…” UI state while attaching/snapshotting so the user never sees a blank terminal, and progressively attach panes in heavy tabs.
6. Deferred question (follow-up PR): If we ever add background terminal output indicators, decide whether to reuse `pane.status="review"` or introduce a separate “unread output” indicator. This is intentionally out of scope for this PR.


## Plan of Work

### Milestone 0: Baseline Reproduction and Instrumentation Spike

This milestone makes the failure mode easy to reproduce and makes improvements measurable. At completion, a developer can reproduce “mass restore” locally and can observe how many sessions are being attached/spawned and how long attaches take.

Work:

Create a small, dev-only reproduction procedure that does not require manual JSON edits. The simplest acceptable version is a documented set of UI steps to create many terminal panes and a “Reset terminal state” developer command that clears app-state and terminal history for quick iteration. If a UI or CLI seeding tool already exists, use it instead of inventing a new one.

Add minimal timing logs/metrics around `createOrAttach` calls in main and daemon mode. Prefer existing `track(...)` (analytics) or prefixed console logging. The key metrics are counts and durations, not full output.

Acceptance:

    bun run typecheck
    bun test

Manual verification: with terminal persistence enabled, create ~30 terminals, restart the app, and confirm logs show the number of `createOrAttach` calls and typical durations.

Manual verification (warm sizing): after the app is running, visit several terminal tabs across multiple workspaces until the warm set is full, then observe CPU and memory in Activity Monitor. This establishes whether the chosen warm set size is acceptable on typical developer machines.


### Milestone 1: Stop Startup Fan-Out by Changing Renderer Mount Policy

This milestone removes the direct cause of “restore everything on startup”. At completion, terminal persistence no longer implies “mount all terminal tabs”. Instead, only the active tab is mounted, plus a small “warm” set of most-recently-used terminal tabs to keep common switching fast.

Work:

Update `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/index.tsx` so that when terminal persistence is enabled it does not render every terminal-containing tab across all workspaces. Instead, render a bounded “warm” set so switching between recently used terminal tabs stays smooth without mounting everything.

Implement the warm set as a global per-run LRU list (not persisted), so it improves common navigation during a session but does not re-introduce startup fan-out after restart. The warm set should be capped by a small constant (recommended default: 8).

Note: This milestone addresses the bulk of the freeze by preventing “mount everything”. Milestones 2 and 4 are still required to prevent overload when a user opens a very heavy split tab or rapidly opens many new terminals.

Concrete behavior:

    - Always render the active tab for the active workspace (current behavior).
    - Additionally, render the most recently visited terminal tabs across all workspaces, up to a total of N mounted terminal tabs including the active tab (N = warm set size).
    - Use `visibility: hidden` (not `display: none`) for warm-but-not-active tabs to preserve xterm sizing and avoid resize bugs.
    - When a tab leaves the warm set, it should unmount, which triggers normal `Terminal` detach behavior (the daemon session continues running).

Do not change non-terminal tab behavior: non-terminal tabs should continue to mount only when active.

Acceptance:

    bun run typecheck
    bun run lint
    bun test

Manual verification: create a workspace with many terminal tabs and restart the app. Observe that only the active tab (and warm set) trigger `createOrAttach` and that the app becomes interactive quickly.


### Milestone 2: Add Safety Nets (Concurrency Limits and Spawn Limits)

This milestone ensures that even if the renderer or a future regression triggers many attaches/spawns, the system degrades gracefully instead of freezing. At completion, the main process limits concurrent attaches and the daemon limits concurrent spawns of new PTY sessions.

Work:

In `apps/desktop/src/main/lib/terminal/daemon-manager.ts`, add a small concurrency limiter around the expensive path of `createOrAttach`. The limiter should prioritize the focused pane (when known) and should not block the UI thread. Prefer a small custom semaphore implementation over adding new dependencies.

In `apps/desktop/src/main/terminal-host/terminal-host.ts`, add a spawn limiter that only applies when creating a brand new session (the “spawn PTY” path). Attaching to an existing session should remain fast and should not be queued behind spawns.

Acceptance:

    bun run typecheck
    bun test apps/desktop/src/main/terminal-host

Manual verification: create 10 new terminals quickly and confirm sessions are created progressively without UI lockups.


### Milestone 3: Session Lifecycle Signals for Hidden Terminals (Correctness Only)

This milestone prevents a subtle correctness regression once we stop mounting/attaching everything. Today, `Terminal.tsx` clears stuck agent lifecycle statuses on terminal exit (for example, if the user interrupts an agent and the hook doesn’t fire, exit clears `pane.status` from `working`/`permission` back to `idle`). If a terminal pane is not mounted, the renderer will not receive per-pane stream exit events, so those statuses can remain stuck indefinitely.

At completion, the app receives low-volume session lifecycle events (exit and error) even for daemon sessions that are not currently attached to a renderer terminal stream, and uses those events only to keep `pane.status` correct. This milestone does not attempt to signal “command finished” for arbitrary commands, and it does not stream background output.

Work:

Extend the daemon IPC to broadcast session lifecycle events (at minimum: exit; optionally: terminalError) to a global subscriber set that is not per-session attach. The key invariant is: session exit is observable even when no UI client is attached to the session’s stream.

Route those lifecycle events to the renderer in a single subscription (one per app), not one per pane. Prefer reusing the existing notifications subscription plumbing (`notificationsEmitter` + `trpc.notifications.subscribe`) to avoid introducing a parallel event system, but ensure these events do not trigger macOS notifications (agent lifecycle notifications remain unchanged).

In the renderer, add a small listener mounted once (near `useAgentHookListener`) that receives terminal exit events and applies only the following rule:

    If the affected `pane.status` is `working` or `permission`, set it to `idle`.

It must never modify `review` (completed agent work should remain visible), and it must never set new non-idle statuses.

Acceptance:

    bun run typecheck
    bun test apps/desktop/src/main/lib/terminal-host

Manual verification: start an agent so a pane is `working`, then force the underlying process to exit without a Stop hook (for example via a kill/crash scenario) while that pane is not mounted. Confirm the pane status does not remain stuck as `working`/`permission`.


### Milestone 4: Progressive Attach for Heavy Active Tabs (Split-Aware)

This milestone addresses the remaining fan-out case: a single active tab may contain many panes (splits). At completion, opening a heavy tab remains responsive and terminals attach progressively, prioritizing visible and focused panes.

Work:

Introduce a small “attach scheduler” in the renderer. Each `Terminal` registers a request to attach; the scheduler permits only K concurrent attaches. The focused pane is highest priority. Other visible panes in the active tab attach next. Non-visible panes (not in the active tab’s Mosaic layout) must not attach.

The scheduler must treat multi-way splits correctly: all panes in a 2–4 way split should be considered visible and should attach quickly; the concurrency cap is a safety net, not an excuse to starve visible panes.

Acceptance:

    bun run typecheck
    bun test

Manual verification: create a tab with a 4-way terminal split and confirm all 4 panes attach. Then create an artificially heavy layout (10+ panes) and confirm the UI remains responsive while panes progressively connect.


### Milestone 5: Cold Restore Semantics and Disk I/O Optimization

This milestone fixes two related issues: unnecessary disk reads for normal attaches, and cold restore spawning shells before the user opts in. At completion, disk reads only occur when needed, and cold restore shows scrollback without starting a new PTY until the user clicks “Start Shell”.

Work:

Change main/daemon interactions so that “attach to existing session” is a fast path that does not touch disk. Only when the daemon does not have a session should the main process consider cold restore. If cold restore is present, return the saved scrollback and do not create a daemon session yet.

If the daemon protocol needs a “attach-only” operation (fail if session doesn’t exist), add it. Ensure protocol upgrade logic in `apps/desktop/src/main/lib/terminal-host/client.ts` can shut down older daemons cleanly.

Update `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/Terminal.tsx` cold restore UX only as needed to match the new semantics. The “Start Shell” action should explicitly create a new session and should set `skipColdRestore` to avoid re-triggering the cold restore branch.

Acceptance:

    bun run typecheck
    bun test apps/desktop/src/main/lib/terminal

Manual verification: simulate a reboot/crash by ensuring the daemon is not running but on-disk scrollback exists. Confirm the UI shows restored content without spawning a new PTY until the user starts a shell.


### Milestone 6: Daemon Resource Policy and User-Facing Recovery Tools

This milestone bounds the daemon’s memory and process usage and gives the user in-product recovery options. At completion, the user can see how many sessions exist, can kill idle sessions, and can clear terminal state without editing files.

Work:

Add a daemon-side session inventory (list sessions + basic metadata like createdAt/lastAttachedAt/attachedClients) and expose it via tRPC so the renderer can display “how many sessions exist”. This PR should prefer manual recovery tools and warnings over automatic eviction.

Clarification: to distinguish “a terminal is still running in the daemon” vs “only old scrollback exists on disk”, use daemon session existence (`listSessions` / “does this sessionId exist”) as the source of truth. A PTY PID is useful metadata to display for debugging and to support port-scanning, but it must not be treated as a stable identity for a session (PIDs change/reuse and do not survive daemon restarts).

Implement user-facing recovery actions:

    - “Kill all sessions” (explicit confirmation)
    - “Kill sessions for this workspace” (optional, if low-risk to implement)
    - “Clear terminal history” (explicit confirmation)

Do not enable automatic idle eviction by default in this PR. If we add idle timeouts / LRU eviction later, it should be a follow-up decision with clear UX.

Add tRPC endpoints to list daemon sessions and to kill sessions (single and all). Expose them in the settings UI (`apps/desktop/src/renderer/screens/main/components/SettingsView/TerminalSettings.tsx`) as a “Manage sessions” surface with clear confirmations.

Acceptance:

    bun run typecheck
    bun run lint
    bun test

Manual verification: create many sessions, open the management UI, and kill idle sessions. Confirm the daemon process count decreases and the app remains stable.


### Milestone 7: Performance Validation and Regression Coverage

This milestone ensures the fixes stick. At completion, we have repeatable validation steps and automated tests for the most important invariants.

Work:

Add unit/integration tests around the daemon protocol additions (session lifecycle signals if introduced, attach-only, spawn limiting). Add a renderer-level test if the repo’s test setup supports it; otherwise document a deterministic manual verification checklist that a reviewer can run in under five minutes.

Acceptance:

    bun run typecheck
    bun run lint
    bun test


### Milestone 8: PR Description Alignment and Closeout

This milestone ensures the PR description accurately reflects the shipped behavior and any changes made during implementation. At completion, a reviewer can read the PR description and understand exactly what the change does, what risks remain, and how it was validated.

Work:

Update the PR description to include:

    - A concise “what changed” summary tied to observable behavior (startup no longer restores everything; warm set keeps up to 8 recent terminal tabs mounted per run for smooth switching; etc.).
    - The user-facing UX changes and any settings/flags involved (defaults and restart requirements).
    - The key technical changes (renderer mount policy, attach/spawn limits, session lifecycle signals for correctness, cold restore semantics, daemon recovery tools).
    - Known risks and mitigations (reattach latency, resource limits).
    - Exact validation steps run (commands and any manual scenarios).

Ensure the description matches the final implementation details and file paths in this plan. If scope changed during implementation, update this ExecPlan to match before updating the PR description.

Acceptance:

Manual verification: the PR description is up to date and reviewers can follow its validation steps to reproduce expected behavior.


## Validation (What to Run and What “Good” Looks Like)

Always run:

    bun run typecheck
    bun run lint
    bun test

Key manual scenarios:

1. Mass restore: create many terminal tabs/panes, restart app, confirm UI becomes interactive quickly and does not spawn dozens of shells at once.
2. Smooth switching: open several terminal tabs across multiple workspaces, switch between them repeatedly, confirm warm tabs switch without a noticeable attach delay.
3. Heavy tab: open a tab with many panes; confirm the UI remains responsive and panes connect progressively.
4. Agent status correctness: put a pane into `working`/`permission`, then force the underlying process to exit while the pane is not mounted; confirm status does not remain stuck.
5. Cold restore: simulate daemon absence + existing history; confirm no shell starts until user clicks “Start Shell”.


## Idempotence and Safety

All changes should be safe to run repeatedly. Any cleanup tooling must require explicit user confirmation before deleting history or killing all sessions. Any daemon cleanup policy must avoid killing active sessions with attached clients and must be conservative by default.

Avoid importing Node.js modules in renderer code. Any new renderer components must remain browser-safe.


## Rollout Strategy

Gate the new behaviors behind the existing “Terminal persistence” setting. If additional settings are introduced later (for example optional auto-cleanup, or future background output attention indicators), default them conservatively and document them in the Terminal settings UI.

Ensure protocol changes include a robust upgrade path for stale daemons that may remain running across app updates.


## Risks and Mitigations

The main DX risk is perceived latency when switching to a terminal that is not warm. Mitigate this by keeping a small warm set mounted, showing a fast “Resuming…” state when attaching, and ensuring attach is a fast path that avoids unnecessary disk I/O.

Warm set sizing is a tradeoff between “instant tab switches” and steady-state renderer resources. Each mounted terminal pane keeps a live xterm.js instance with large scrollback (`scrollback: 10000` in `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/config.ts`), plus a canvas/WebGL renderer and an active stream subscription. Idle warm terminals should cost little CPU, but memory scales with the number of mounted terminal panes and how much scrollback/output they have accumulated. As a rough order-of-magnitude estimate, a single mounted terminal pane can be on the order of ~10–30MB of renderer memory once it has meaningful scrollback; a warm set of 8 single-pane tabs is therefore plausibly ~80–240MB of renderer memory. Milestone 0 must validate this with real measurements (Activity Monitor + our attach/mount counters), and we should reduce the warm set size (or add a secondary pane-count cap) if the observed cost is too high.

If we choose to add background output attention indicators in a later PR, another risk is that they become noisy for chatty terminals. Mitigate this by throttling/coalescing, and making them opt-in and easy to disable.


## DX Follow-Ups (Separate PRs)

These are explicitly out of scope for this PR, but are natural next steps:

1. Command completion notifications for arbitrary non-agent commands (for example “notify when `pnpm test` finishes”). This likely requires prompt-level hooks or an explicit “run with notify” wrapper so we can detect “command finished” without parsing output.
2. Background output attention indicators (beyond correctness exit/error signals), such as “output after silence” badges for non-agent commands. This should not reuse `pane.status="review"` unless product agrees that “review” can mean “terminal has unread output”.


## Progress

- [ ] Milestone 0: Baseline reproduction and instrumentation exists and is documented
- [ ] Milestone 1: Renderer mount policy limits terminal tab mounts to active + warm set
- [ ] Milestone 2: Main attach concurrency and daemon spawn concurrency limits added
- [ ] Milestone 3: Hidden terminal lifecycle signals keep pane.status correct
- [ ] Milestone 4: Progressive attach scheduler for heavy tabs implemented
- [ ] Milestone 5: Cold restore semantics fixed and disk I/O optimized
- [ ] Milestone 6: Daemon resource policy and session management UI shipped
- [ ] Milestone 7: Performance validation and regression coverage added
- [ ] Milestone 8: PR description updated and aligned


## Outcomes and Retrospective (Fill In After Implementation)

TBD.


## Surprises and Discoveries (Fill In During Implementation)

TBD.
