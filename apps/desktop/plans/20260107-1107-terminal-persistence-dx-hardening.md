# Terminal Persistence DX Hardening (No Startup Freeze, Background Activity, Bounded Resources)


## Purpose

When “Terminal persistence” is enabled, Superset should never freeze or spin at startup, even if the user has accumulated dozens of terminal panes over time. The user should be able to switch between recent terminal tabs with near‑instant feedback, and they should still get clear signals (badges and optional notifications) when background terminals produce output or exit, without keeping every terminal renderer and stream active.

This work matters because today a user can get their desktop app into a broken state where a large restored terminal set causes 99% CPU usage and an infinite macOS spinner. The goal is to make persistence robust by default and to make failure modes recoverable from within the UI (no manual edits to `~/.superset/app-state.json`).


## Context

Superset Desktop (Electron) renders terminals in the renderer process using xterm.js. For persistence across app restarts, the Electron main process can delegate terminal ownership to a detached “terminal host daemon” (a Node process) that owns PTYs and maintains a headless xterm emulator for each session. The renderer talks to the main process via tRPC, and the main process talks to the daemon via a Unix domain socket using NDJSON messages.

On this branch, the daemon protocol was recently changed to split “control” (RPC) and “stream” (terminal output) sockets (see `apps/desktop/plans/done/20260106-1800-terminal-host-control-stream-sockets.md`). That fix addresses head‑of‑line blocking when one terminal spams output, but it does not address a different failure mode: restoring many sessions at once can still saturate CPU and freeze the UI.

The observed freeze happens because the renderer mounts far more terminal UIs than the user can see, and each mounted terminal immediately calls `terminal.createOrAttach`, which in daemon mode can cause disk I/O, snapshot generation, and (when sessions are missing) new PTY spawns. When this happens tens of times concurrently, startup becomes unresponsive.


## Definitions (Plain Language)

A “workspace” is a worktree-backed project environment shown in the left sidebar. A “tab” is a group within a workspace (the top “GroupStrip”). A “pane” is a tile within a tab’s Mosaic layout; a terminal pane is one pane type. In this codebase, a pane has a stable ID and the terminal session is keyed by that pane ID.

“Daemon mode” means terminal persistence is enabled; terminal sessions live in the detached daemon process and survive app restarts. “Attach” means connecting the app’s event stream to an existing daemon session. “Spawn” means starting a new PTY/shell process for a session.

An “activity signal” is a low‑volume event meaning “this background terminal has new output or exited” without delivering full terminal output.

“Cold restore” means: the daemon does not have a session (for example after reboot), but we have on-disk scrollback from a prior run that did not shut down cleanly. The UI should show the saved scrollback and let the user explicitly start a new shell.


## Repo Orientation (Where Things Live)

Renderer (browser environment, no Node imports):

    apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/index.tsx
    apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/Terminal.tsx
    apps/desktop/src/renderer/stores/tabs/store.ts
    apps/desktop/src/renderer/stores/tabs/useAgentHookListener.ts

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


## Problem Statement (What Breaks Today)

When terminal persistence is enabled, the renderer currently keeps every tab that contains a terminal mounted (even if hidden). This is implemented in `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/index.tsx` by rendering all “terminal tabs” and toggling visibility. Each terminal pane mounts a `Terminal` component, and each `Terminal` immediately calls `trpc.terminal.createOrAttach` and enables a stream subscription (`trpc.terminal.stream.useSubscription`).

If a user has accumulated many terminal panes in persisted state (for example `tabsState.panes` contains ~90 terminal panes), startup mounts and attaches all of them. In daemon mode, each attach also does disk work for cold-restore detection (`HistoryReader.read`) and can cause new PTY spawns if the daemon is missing sessions. The combined fan‑out can saturate CPU, fill logs, and freeze the UI.


## Goals

This work should deliver these user-visible outcomes:

1. App startup remains responsive with 50–100 persisted terminal panes; the UI shows quickly and does not beachball.
2. Switching to a recently used terminal tab feels “instant enough” (target: the user sees a correct terminal view within ~200ms in the common case).
3. Background terminals still surface activity (badge on the tab and workspace; optional system notification on exit or when the user opts in).
4. The daemon cannot be driven into unbounded resource usage by accident. There are clear limits, and the UI provides a way to manage sessions and recover from overload.
5. Cold restore does not spawn a new shell until the user explicitly starts one.


## Non-Goals

This plan does not attempt to replace xterm.js, node-pty, or rewrite the persistence architecture. It also does not attempt to perfectly summarize background output; it only needs a reliable “something happened” signal plus exit/error.


## Assumptions

Terminal persistence is a user setting that requires an app restart to take effect (`apps/desktop/src/main/lib/terminal/index.ts`). The renderer and main process can therefore treat “daemon mode enabled” as stable for the lifetime of a run.

The daemon and client are shipped together, but we must handle stale daemons because the daemon is detached and can outlive an app update. Any incompatible protocol changes must include an upgrade path that cleanly shuts down old daemons.


## Open Questions

These questions must be answered (or explicitly decided) before implementation is finalized:

1. Should background activity signals be enabled by default when terminal persistence is enabled, or should it be a separate setting?
2. What is the “warm” cache size for keeping a small number of terminal tabs fully mounted/streaming (suggestion: 2–3), and should it be configurable?
3. What is the default daemon resource policy: warn-only, or automatic cleanup (idle timeout, max sessions) enabled by default?
4. What should the product promise be for cold restore: always show saved scrollback first and require explicit “Start Shell”, or auto-start a shell in some cases?
5. What is the acceptable worst-case reattach latency, and do we treat alt-screen (TUI) sessions differently in UX (for example always show a short “Resuming…” overlay)?


## Decision Log (To Be Filled As Questions Are Resolved)

1. Decision for Open Question 1: TBD.
2. Decision for Open Question 2: TBD.
3. Decision for Open Question 3: TBD.
4. Decision for Open Question 4: TBD.
5. Decision for Open Question 5: TBD.


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


### Milestone 1: Stop Startup Fan-Out by Changing Renderer Mount Policy

This milestone removes the direct cause of “restore everything on startup”. At completion, terminal persistence no longer implies “mount all terminal tabs”. Instead, only the active tab is mounted, plus a small “warm” set of most-recently-used terminal tabs to keep common switching fast.

Work:

Update `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/index.tsx` so that when terminal persistence is enabled it does not render every terminal-containing tab. Compute a bounded warm set using `tabHistoryStacks` from the tabs store. Always include the active tab. Then include up to N previously active terminal tabs for the active workspace. Render only that warm set, still using `visibility: hidden` to preserve xterm dimensions for warm tabs.

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


### Milestone 3: Background Activity Signals and Badges for Hidden Terminals

This milestone restores a key piece of DX that “mount everything” previously provided: knowing when something happens in a background terminal. At completion, the app shows an activity badge for background terminals without subscribing to their full output stream.

Work:

Extend the daemon IPC to support “activity-only” subscriptions that do not stream full terminal output. Implement this by introducing a separate client set inside `apps/desktop/src/main/terminal-host/session.ts` so that “data” frames are not written to activity subscribers (avoiding backpressure and CPU churn). Activity events must be throttled and coalesced (for example at most one “activity” event per session every 250–500ms while output continues).

Ensure that exit and error are delivered to activity subscribers as high-signal events.

Expose a single renderer-level subscription for activity signals. This should be one subscription for the whole app, not one per pane. Implement it in the terminal tRPC router (`apps/desktop/src/lib/trpc/routers/terminal/terminal.ts`) as a subscription that streams `{ paneId, workspaceId, type, ts }` events. Then add a small renderer hook/component mounted once (for example alongside `useAgentHookListener`) that listens for these events and sets `pane.needsAttention = true` when the pane is not currently focused. The existing UI already renders attention indicators in the tab strip and workspace list via `needsAttention`.

Acceptance:

    bun run typecheck
    bun test apps/desktop/src/main/lib/terminal-host

Manual verification: run a command that produces output in a background terminal. Confirm the tab shows an attention indicator and that switching to the tab clears it.


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

Add a daemon-side policy for sessions with no attached UI clients. Track per-session timestamps (last attached, last output, last input). Implement an idle timeout and/or a maximum session cap, consistent with product decisions from Open Questions 2 and 3. Prefer conservative defaults and clear UI warnings over aggressive auto-eviction.

Add tRPC endpoints to list daemon sessions and to kill sessions (single and all). Expose them in the settings UI (`apps/desktop/src/renderer/screens/main/components/SettingsView/TerminalSettings.tsx`) as a “Manage sessions” surface with clear confirmations.

Acceptance:

    bun run typecheck
    bun run lint
    bun test

Manual verification: create many sessions, open the management UI, and kill idle sessions. Confirm the daemon process count decreases and the app remains stable.


### Milestone 7: Performance Validation and Regression Coverage

This milestone ensures the fixes stick. At completion, we have repeatable validation steps and automated tests for the most important invariants.

Work:

Add unit/integration tests around the daemon protocol additions (activity subscription, attach-only, spawn limiting). Add a renderer-level test if the repo’s test setup supports it; otherwise document a deterministic manual verification checklist that a reviewer can run in under five minutes.

Acceptance:

    bun run typecheck
    bun run lint
    bun test


### Milestone 8: PR Description Alignment and Closeout

This milestone ensures the PR description accurately reflects the shipped behavior and any changes made during implementation. At completion, a reviewer can read the PR description and understand exactly what the change does, what risks remain, and how it was validated.

Work:

Update the PR description to include:

    - A concise “what changed” summary tied to observable behavior (startup no longer restores everything, background activity badges, etc.).
    - The user-facing UX changes and any settings/flags involved (defaults and restart requirements).
    - The key technical changes (renderer mount policy, attach/spawn limits, activity channel, cold restore semantics, daemon resource policy).
    - Known risks and mitigations (reattach latency, noisy activity signals, resource limits).
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
2. Background activity: run a long build in one terminal, switch away, confirm the tab shows attention on output/exit, and the indicator clears on view.
3. Heavy tab: open a tab with many panes; confirm the UI remains responsive and panes connect progressively.
4. Cold restore: simulate daemon absence + existing history; confirm no shell starts until user clicks “Start Shell”.


## Idempotence and Safety

All changes should be safe to run repeatedly. Any cleanup tooling must require explicit user confirmation before deleting history or killing all sessions. Any daemon cleanup policy must avoid killing active sessions with attached clients and must be conservative by default.

Avoid importing Node.js modules in renderer code. Any new renderer components must remain browser-safe.


## Rollout Strategy

Gate the new behaviors behind the existing “Terminal persistence” setting. If additional settings are introduced (for example background activity signals or auto-cleanup), default them conservatively and document them in the Terminal settings UI.

Ensure protocol changes include a robust upgrade path for stale daemons that may remain running across app updates.


## Risks and Mitigations

The main DX risk is perceived latency when switching to a terminal that is not warm. Mitigate this by keeping a small warm set mounted, showing a fast “Resuming…” state when attaching, and ensuring attach is a fast path that avoids unnecessary disk I/O.

Another risk is that background activity signals become noisy for chatty terminals. Mitigate this by throttling, coalescing, and allowing the user to disable or narrow notifications to exit/error only.


## Progress

- [ ] Milestone 0: Baseline reproduction and instrumentation exists and is documented
- [ ] Milestone 1: Renderer mount policy limits terminal tab mounts to active + warm set
- [ ] Milestone 2: Main attach concurrency and daemon spawn concurrency limits added
- [ ] Milestone 3: Background activity signals implemented and UI badges wired
- [ ] Milestone 4: Progressive attach scheduler for heavy tabs implemented
- [ ] Milestone 5: Cold restore semantics fixed and disk I/O optimized
- [ ] Milestone 6: Daemon resource policy and session management UI shipped
- [ ] Milestone 7: Performance validation and regression coverage added
- [ ] Milestone 8: PR description updated and aligned


## Outcomes and Retrospective (Fill In After Implementation)

TBD.


## Surprises and Discoveries (Fill In During Implementation)

TBD.
