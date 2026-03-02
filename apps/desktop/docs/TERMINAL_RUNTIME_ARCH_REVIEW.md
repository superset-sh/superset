# Architecture Review Packet: Terminal Runtime + Future Remote Runners

This doc is intended for an external architecture review. It provides enough context to understand the problem space and asks open-ended questions to help critique our current direction.

**How to use this:** please read the plan first, then use the questions below as prompts. Feel free to ignore our current approach and propose a better one — we’re explicitly trying to avoid narrowing you into our hypotheses.

## What we’re trying to build (big picture)

Superset Desktop is an Electron app that provides:

- A multi-pane terminal UI inside workspaces (think “IDE terminal panes”).
- Git worktree-based workspaces (multiple isolated working copies).
- “Changes” UX (diff/status/staging) tied to those workspaces.
- Agent/CLI integrations that surface lifecycle/status in the UI (e.g. completion events, indicators).

Today, terminals can run locally and (optionally) persist via a background “terminal host” daemon. In the future, we want to support executing terminals in the cloud / on a remote runner while keeping the same “Superset UX primitives” (worktrees, changes/diff, agent status, etc.).

## Why we’re asking for review now

We have a working implementation of terminal persistence, but it adds a lot of complexity and “mode branching” (daemon vs in-process) across layers (main process, tRPC router, renderer).

We’re planning a rewrite/refactor to:

- Centralize backend selection (so most code is backend-agnostic).
- Preserve current behavior (especially around session streaming, attach/detach, and restore).
- Create a foundation that won’t fight us when we introduce remote runners/cloud terminals.

## Current state (high-level)

- Electron main process owns terminal backends:
  - **In-process backend:** PTYs owned directly in main process.
  - **Daemon backend:** PTYs owned by a separate “terminal host” process; main connects via a local socket.
- Renderer talks to main via tRPC (IPC), including a terminal stream subscription.
- Terminals have “attach/detach” semantics and “cold restore” (disk-backed scrollback restore) for daemon persistence.

## Known constraints (technical + product)

These are constraints we currently operate under; if you think any should change, call it out.

- Renderer must not import Node.js modules (browser environment).
- IPC is via tRPC, and subscriptions must use an observable pattern (not async generators).
- The terminal UI must remain responsive under high output (performance/backpressure matters).
- We want to avoid regressions in tricky lifecycle/ordering behavior (attach timing, exit vs tail output, etc.).

## Critical behaviors we believe we must preserve (please challenge if wrong)

- The “terminal stream” must not permanently stop delivering data due to a session exit transition (exit is a state change, not the end of the subscription).
- Cold restore should be read-only until the user explicitly starts a new shell.
- Detach/reattach should preserve expected scroll position behavior (when supported).
- Workspace-level actions (delete workspace, refresh prompts, etc.) should affect all active terminal sessions regardless of backend choice.

## Future use cases we want to be compatible with

- **Remote runner / cloud terminals:** terminal sessions execute on a server (possibly while the laptop sleeps).
- **Multi-device access:** a backend session may outlive any single client, and multiple clients/panes may view the same session.
- **Provider model:** not just terminals — we likely need a workspace-scoped runtime that can also deliver:
  - agent lifecycle events (start/stop/permission requests, etc.)
  - git + “changes” functionality (status/diff/staging/commit/push/pull)
  - file read/write (or a sync layer)

We have a separate cloud plan doc that describes the intended product direction (cloud as source of truth, SSH terminals, tmux persistence, optional local sync for IDE users).

## What we want from you

1. A critique of our abstraction boundaries: what’s missing, what’s over-coupled, what’s in the wrong place.
2. Alternative architectures that could reduce complexity and improve long-term extensibility.
3. The biggest failure modes/risk areas you see (especially ordering/lifecycle bugs) and how you’d design to prevent them.
4. A suggested “migration plan” that minimizes regressions while moving from today’s implementation to a cleaner architecture.

## Questions (intentionally open-ended)

### 1) Abstraction boundaries / layering

- If you were designing this from scratch, what are the natural layers/modules you would define?
- Where should backend selection happen so it doesn’t leak across the codebase?
- How would you structure the “terminal runtime” so it can support local + daemon + future remote backends without constant branching?
- Should “terminal runtime” be its own concept, or should it be a sub-component of a broader “workspace runtime/provider”? Where should the seam be?

### 2) Contracts, identity, and lifecycle

- What should be the stable identities in the system?
  - UI pane IDs vs backend session IDs vs workspace IDs vs user IDs
  - multi-client / multi-pane viewing the same backend session
- What lifecycle state machine would you define for a session (running/exited/disposed/etc.) and for the output stream?
- How would you make operations idempotent and race-safe (double-create, attach-after-exit, exit-vs-tail-output, detach/reattach ordering)?
- What does a “clean” detach/reattach contract look like across local/daemon/remote backends?

### 3) Event delivery model (streaming)

- What is the right event delivery contract between backend and UI?
  - How do you avoid coupling to Node EventEmitter semantics while still supporting local implementations?
  - What delivery guarantees matter (at-most-once vs at-least-once, ordering, replay for late subscribers)?
- How would you handle “late subscribers” (UI attaches after output already started)?
- How would you represent backend connectivity issues (disconnects, auth expiration, retries) in a backend-agnostic way?

### 4) Persistence / scrollback / resource management

- What persistence strategy would you choose for scrollback and session restore?
  - What’s the “right” unit of persistence (raw PTY log, terminal emulator snapshot, both)?
  - What size limits / retention rules should exist to avoid disk fill and memory pressure?
- How should backpressure be handled end-to-end (PTY → persistence writer → IPC → renderer)?
- Where should truncation/compaction happen, and how should it be tested?

### 5) Remote runners: integrating “worktrees”, “changes”, and “agent status”

- If terminal execution moves remote, what should be the source of truth for:
  - workspace files
  - git operations and “changes” UX
  - agent lifecycle/status events
- What architecture patterns have you seen work for this (VSCode-like remote agents, SSH providers, etc.)?
- What’s the minimum viable set of primitives to expose from a remote runner so the desktop UI can remain mostly unchanged?
- How would you approach security/authentication for a remote agent channel?

### 6) Testing + rollout strategy

- What invariants would you codify as tests to prevent regressions?
- How would you structure integration vs unit tests to catch ordering/lifecycle bugs?
- If we expect a large refactor, how would you stage it to keep changes reviewable and safe?

## Reference docs + files to attach (copy/paste)

Below is a curated set of files you can paste into Slack for context. If you only read a few, start with the plan + the terminal router + the daemon manager.

### Primary

1. `apps/desktop/plans/20260109-2313-terminal-runtime-abstraction-rewrite.md`
   - The current refactor plan (milestones, invariants, proposed boundaries).
2. `docs/CLOUD_WORKSPACE_PLAN.md`
   - Product direction for cloud workspaces / remote execution (high level).

### Terminal runtime + daemon backend

3. `apps/desktop/src/main/lib/terminal/manager.ts`
   - In-process PTY backend (local).
4. `apps/desktop/src/main/lib/terminal/daemon-manager.ts`
   - Daemon-backed backend + cold restore logic (local persistence).
5. `apps/desktop/src/main/lib/terminal-host/client.ts`
   - Main-process client that talks to the terminal host daemon.
6. `apps/desktop/src/main/terminal-host/index.ts`
   - Terminal host daemon entry point.
7. `apps/desktop/docs/TERMINAL_HOST_EVENTS.md`
   - Event/protocol notes for terminal host interactions.

### IPC surface (tRPC) + renderer terminal

8. `apps/desktop/src/lib/trpc/routers/terminal/terminal.ts`
   - Terminal IPC API and stream subscription shape.
9. `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/Terminal.tsx`
   - Terminal UI component (current complexity hot-spot).

### “Changes” + agent lifecycle (related UX primitives to preserve)

10. `apps/desktop/src/lib/trpc/routers/changes/index.ts`
    - Git/status/diff-related IPC endpoints (local worktree-centric today). Key related files:
      - `apps/desktop/src/lib/trpc/routers/changes/status.ts`
      - `apps/desktop/src/lib/trpc/routers/changes/staging.ts`
      - `apps/desktop/src/lib/trpc/routers/changes/git-operations.ts`
      - `apps/desktop/src/lib/trpc/routers/changes/file-contents.ts`
      - `apps/desktop/src/lib/trpc/routers/changes/security/path-validation.ts`
11. `apps/desktop/src/main/lib/notifications/server.ts`
    - Main-process notifications server that feeds agent lifecycle events.
12. `apps/desktop/src/renderer/stores/tabs/useAgentHookListener.ts`
    - Renderer listener that consumes agent lifecycle notifications to drive UI state.
