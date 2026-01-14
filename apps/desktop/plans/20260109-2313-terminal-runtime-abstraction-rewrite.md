# Workspace Runtime Abstraction (Terminals: Daemon vs In-Process)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from `AGENTS.md`, `apps/desktop/AGENTS.md`, and the ExecPlan template in `.agents/commands/create-plan.md`.


## Table of Contents

- [Purpose / Big Picture](#purpose--big-picture)
- [Context / Orientation (Repository Map)](#context--orientation-repository-map)
- [Problem Statement](#problem-statement)
- [Definitions (Plain Language)](#definitions-plain-language)
- [Non-Goals](#non-goals)
- [Assumptions](#assumptions)
- [Future Backend: Remote Runner / Cloud Terminals](#future-backend-remote-runner--cloud-terminals)
- [Open Questions](#open-questions)
- [Plan of Work](#plan-of-work)
- [PR1 Scope Lock (Runtime Abstraction Only)](#pr1-scope-lock-runtime-abstraction-only)
- [Decisions (Lock Before Implementing)](#decisions-lock-before-implementing)
- [Target Shape (After Refactor)](#target-shape-after-refactor)
  - [File Tree (Proposed)](#file-tree-proposed)
  - [Identity + Lifecycle (State Machines)](#identity--lifecycle-state-machines)
  - [Workspace Runtime Types (Main Process)](#workspace-runtime-types-main-process)
  - [tRPC Router Shape (No Daemon Type Checks)](#trpc-router-shape-no-daemon-type-checks)
  - [Renderer Decomposition (Reducing `Terminal.tsx` Branching)](#renderer-decomposition-reducing-terminaltsx-branching)
  - [Diagrams (Call Flow)](#diagrams-call-flow)
- [Milestones](#milestone-1-contract--invariants-workspaceruntime)
  - [Milestone 1](#milestone-1-contract--invariants-workspaceruntime)
  - [Milestone 2](#milestone-2-workspaceruntime-registry--capabilities)
  - [Milestone 3](#milestone-3-trpc-terminal-router-migration)
  - [Milestone 4](#milestone-4-identity--stream-contract-backendsessionidclientid)
  - [Milestone 5](#milestone-5-regression-coverage)
  - [Milestone 6a](#milestone-6a-build-a-terminal-init-plan-renderer)
  - [Milestone 6b](#milestone-6b-stream-subscription--buffering-hook-renderer)
  - [Milestone 6c](#milestone-6c-integrate-helpers-into-terminaltsx-ui-wiring-only)
  - [Milestone 7 (Cloud Readiness)](#milestone-7-cloud-readiness-workspaceruntime-skeleton)
- [Validation](#validation)
- [Idempotence / Safety](#idempotence--safety)
- [Risks and Mitigations](#risks-and-mitigations)
- [Progress](#progress)
- [Surprises & Discoveries](#surprises--discoveries)
- [Decision Log](#decision-log)
- [Outcomes & Retrospective](#outcomes--retrospective)


## Purpose / Big Picture

After this change, the desktop app still supports terminal persistence (daemon mode with cold restore) exactly as it does today, but the codebase no longer leaks “daemon vs in-process” branching across the tRPC router and UI.

The key change in this revised plan is that we **promote a workspace-scoped provider abstraction to be the primary seam**:

- `WorkspaceRuntime` (aka provider) becomes the long-term boundary for local vs daemon vs cloud/SSH backends.
- `TerminalRuntime` becomes a sub-component (`workspace.terminal`) rather than being “the” top-level runtime.

This avoids re-cutting seams when we later move “changes/files/agent status” into the same provider boundary for cloud workspaces.

Observable outcomes:

1. With terminal persistence disabled, terminals behave as before (no persistence across app restarts), and Settings → Terminal “Manage sessions” shows that session management is unavailable.
2. With terminal persistence enabled, terminals survive app restarts, cold restore works, and Settings → Terminal “Manage sessions” continues to list/kill sessions.
3. The tRPC `terminal.*` router no longer needs `instanceof DaemonTerminalManager` checks; daemon awareness is centralized in the main-process runtime/provider layer.
4. The renderer terminal component remains correct with minimal required changes for the core refactor. Optional follow-up: extract backend-agnostic “session initialization” and “stream event handling” logic into small, testable helpers to reduce `Terminal.tsx` branching.


## Context / Orientation (Repository Map)

Superset Desktop is an Electron app. In this repo:

1. “Main process” code runs in Node.js and can import Node modules. It lives under `apps/desktop/src/main/`.
2. “Renderer” code runs in a browser-like environment and must not import Node modules. It lives under `apps/desktop/src/renderer/`.
3. IPC between renderer and main is implemented using tRPC (“tRPC router” code lives under `apps/desktop/src/lib/trpc/routers/`). Subscriptions in this repo must use the `observable` pattern (`apps/desktop/AGENTS.md`), not async generators.

The terminal system currently has two possible backends:

1. In-process backend: `apps/desktop/src/main/lib/terminal/manager.ts` (`TerminalManager`). This owns PTYs directly in the Electron main process.
2. Daemon backend: `apps/desktop/src/main/lib/terminal/daemon-manager.ts` (`DaemonTerminalManager`). This delegates PTY ownership to a background “terminal host” process and communicates via a client (`apps/desktop/src/main/lib/terminal-host/client.ts`) over a Unix domain socket.

Terminal APIs exposed to the renderer are implemented in `apps/desktop/src/lib/trpc/routers/terminal/terminal.ts`.


## Problem Statement

The daemon persistence feature is working, but the PR is hard to review and maintain because “daemon vs non-daemon” concerns appear outside the terminal subsystem boundary. Examples include `instanceof DaemonTerminalManager` checks in the tRPC router and UI code paths that must reason about backend-specific behavior.

This plan refactors the code so backend selection and backend-specific capabilities live behind a single “terminal runtime” abstraction, while preserving current behavior and test coverage. This also positions us for a future backend that executes terminals in the cloud, without re-spreading backend-specific branching throughout the application.


## Definitions (Plain Language)

Pane ID (`paneId`): a stable identifier for a terminal pane in the renderer’s tab layout. Today it is also used as the backend session key, but the refactor should avoid assuming `paneId === backendSessionId` forever (cloud terminals will likely need a distinct backend identity).

Backend session ID (`backendSessionId`): an identifier assigned by the backend for the running session. For local backends, this may continue to equal `paneId`, but future backends (cloud/multi-device) should be free to assign their own IDs and map multiple panes/clients to the same backend session.

Client ID (`clientId`): a stable identifier for the viewer/client instance attaching to sessions. This is required for multi-device and also maps cleanly to how the daemon protocol already works (it ties a client’s control + stream sockets together).

Attachment ID (`attachmentId`): an ephemeral identifier for a specific attachment/subscription of a client to a session (a handle). This makes detach idempotent and is the cleanest path to supporting multiple panes viewing the same backend session.

Event cursor (`eventId` / `cursor`): a monotonic per-session counter used to support bounded replay for late subscribers (“subscribe since cursor”). This prevents the “late subscriber misses early output” class of bugs without requiring UI-level correctness buffering.

Terminal session: the running PTY process and its terminal emulator state.

Warm attach: reconnecting to a still-running session (daemon still has the PTY).

Cold restore: restoring scrollback from disk after an unclean shutdown or daemon session loss, before starting a new shell.

Terminal runtime: a backend-agnostic surface (session ops + events + capabilities) that callers use without knowing the implementation (local in-process, local daemon, cloud/SSH later).

Workspace runtime (provider): a workspace-scoped boundary that can supply terminal IO, “changes/files”, and agent lifecycle events. Cloud terminals require this broader abstraction if we want to preserve the current UX.

Workspace runtime registry: a process-scoped module in `apps/desktop/src/main/lib/workspace-runtime/` that selects the correct runtime/provider for a given workspace and caches instances so we don’t multiply event listeners or backend connections.

Capabilities: optional features that exist only for some backends (for example “list/manage persistent sessions”). Callers should not use `instanceof` checks. Capability presence must be represented structurally (for example `management: null` when unavailable) and via explicit capability flags, so “unsupported” cannot be confused with “success”.

Note: this plan focuses on the terminal portion first, but it intentionally introduces the provider boundary now to avoid creating parallel “runtime registries” for terminals vs changes/files/agentEvents later.


## Non-Goals

This refactor is intentionally conservative to avoid regressions:

1. No large protocol redesign between main and terminal-host. Additive fields (typed error codes, cursors/watermarks, capability bits) are acceptable if they preserve backwards compatibility.
2. No behavioral change to cold restore, attach scheduling, warm set mounting, or stream lifecycle.
3. No implementation of cloud terminals in this PR. The plan only ensures the abstraction boundary is compatible with adding a cloud backend later.
4. Keep renderer and identity changes optional: `streamV2`/identity decoupling and `Terminal.tsx` decomposition can be deferred to follow-up PRs if scope/review risk is high.


## Assumptions

1. Windows is not a supported desktop target right now, so Unix-domain socket constraints are acceptable.
2. The terminal persistence setting (`settings.terminalPersistence`) is treated as “requires restart” today; we keep that behavior for this refactor.
3. tRPC subscriptions must use `observable` (per `apps/desktop/AGENTS.md`); we will not introduce generator-based subscriptions.
4. The most important regression to prevent is the “listeners=0” cold-restore failure mode; specifically, the `terminal.stream` subscription must not complete on exit.
   - This applies to `streamV2` as well; session exit is a state transition, not stream completion.


## Future Backend: Remote Runner / Cloud Terminals

This plan intentionally does not implement cloud terminals, but the abstraction boundary should be compatible with adding a backend that runs terminal sessions inside a remote “runner” (a background agent on a server) while preserving Superset Desktop concepts like worktrees, “changes” (diff/status), and agent lifecycle indicators.

### Direction for this rewrite (so we don’t paint ourselves into a corner)

The cloud workspace plan (`docs/CLOUD_WORKSPACE_PLAN.md`) makes a few things explicit: multi-device access, cloud as source-of-truth, SSH terminals, tmux persistence, and optional local sync for IDE users. To align with that direction, this rewrite should:

1. Avoid a process-global “one runtime forever” assumption. Instead, capture a stable **registry** once, and select the appropriate runtime/provider per workspace or per session.
2. Treat backend session identity as separate from UI pane identity. Even if local stays `backendSessionId === paneId` initially, the contract should not assume it forever.
3. Avoid “daemon” naming at the abstraction boundary. Daemon is an implementation detail; cloud/SSH is another. Prefer provider-neutral naming (e.g. “management/admin capability object”).
4. Keep renderer behavior stable. Any `Terminal.tsx` work should be decomposition-only (init plan + applier + stream buffering), preserving the same attach/detach semantics and invariants (no-complete-on-exit, scroll restoration).

### What’s local-only today (current coupling)

1. **Terminal IO keys by `paneId` (client identity):** today `terminal.createOrAttach`, `terminal.write`, and `terminal.stream` treat `paneId` as the stable session key (`apps/desktop/src/lib/trpc/routers/terminal/terminal.ts`). This rewrite moves the boundary to `{ backendSessionId, clientId, attachmentId }` (via `streamV2`) so multi-device/cloud doesn’t require reworking every callsite later.
2. **Agent lifecycle events assume localhost hooks:** terminal env injects `SUPERSET_*` and `SUPERSET_PORT` (`apps/desktop/src/main/lib/terminal/env.ts`), and the notify hook script `curl`s `http://127.0.0.1:$SUPERSET_PORT/hook/complete` (`apps/desktop/src/main/lib/agent-setup/templates/notify-hook.template.sh`). This cannot work from a remote runner.
3. **“Changes” assumes local worktree filesystem:** git status/diff/staging/commit/push/pull operate against a local `worktreePath` using `simple-git`, and file reads/writes are guarded by secure path validation (`apps/desktop/src/lib/trpc/routers/changes/*`).

### How this plan enables remote terminals (what’s already aligned)

1. **Backend-agnostic event delivery:** `TerminalEventSource.subscribe…() => unsubscribe` is compatible with WebSocket/SSE backends and avoids leaking Node `EventEmitter` semantics.
2. **Capabilities over “mode strings”:** cloud backends can expose a capability surface without introducing a new `"cloud"` mode string that bleeds into callers.
3. **Identity decoupling is planned:** Milestone 4 introduces `backendSessionId` + `clientId` + `attachmentId`, which are required for cloud (server-assigned IDs, multi-device access).

### The key realization: cloud terminals need a Workspace Runtime, not just a Terminal Runtime

A remote runner cannot be “just a terminal backend” if we want to preserve the current UX. To retain worktrees, diffs, and agent status, the system needs a workspace-scoped runtime with at least these responsibilities:

1. **terminal:** interactive PTY sessions (create/attach/write/resize/kill/detach + stream events)
2. **agentEvents:** lifecycle signals (“Start/Stop/PermissionRequest”) delivered to the desktop UI
3. **git + files:** status/diff/staging/commit/push/pull + safe file read/write (or an explicit sync layer)
4. **sync (if local stays canonical):** bidirectional worktree synchronization when execution happens remotely

The `TerminalRuntime` abstraction created in this plan is one component of the broader `WorkspaceRuntime` provider boundary.

### Preserving “agent interactions” in a remote runner world

Today, pane statuses are driven by the notifications subscription (`apps/desktop/src/renderer/stores/tabs/useAgentHookListener.ts`), which consumes events emitted by a local notifications server (`apps/desktop/src/main/lib/notifications/server.ts`). For remote execution, we need a different source of lifecycle signals:

- **Hook proxy model (max compatibility):** keep the same CLI hook scripts, but point them to a hook receiver running inside the runner; the runner forwards lifecycle events to the desktop over an authenticated channel (then desktop re-emits to the renderer through the existing notifications subscription path).
- **Native runner events (long-term):** the runner emits lifecycle events directly (no `curl` hook required), still flowing into the same renderer contract (`NOTIFICATION_EVENTS.AGENT_LIFECYCLE`).

### “Changes” + worktrees: two viable architectures (must decide)

**A) Remote worktree is source-of-truth**
- Runner owns checkout, git operations, and file access.
- Desktop “changes” router becomes a façade that delegates to local or remote implementations.
- Tradeoff: “open in editor” and local tooling become harder unless we introduce a local mirror/remote FS integration.

**B) Local worktree is source-of-truth (desktop remains canonical)**
- Keep existing local worktrees and “changes” behavior.
- Runner is compute-only and requires explicit sync (local → remote before execution; remote → local after).
- Tradeoff: requires a real sync protocol (patch-based or git-based), conflict handling, and clear UX around divergence.

This decision materially changes the scope and correctness model of cloud terminals; we should not start implementing a cloud backend until this is chosen.

### Compatibility notes (naming + semantics)

1. This plan uses a **provider-neutral** capability object (`management: TerminalManagement | null`). In local persistence mode, the implementation is backed by the daemon manager, but callers should not depend on “daemon” as a concept.
2. Capability presence should mean “configured/available”, not “healthy right now”; mid-session disconnects should surface errors + explicit connection lifecycle events rather than silently flipping capabilities at runtime.


## Open Questions

1. **Multi-attach semantics:** do we want to allow multiple panes (or multiple devices) to attach to the same `backendSessionId` concurrently? If yes, we must make `clientId` + `attachmentId` first-class and define what “detach” means (viewer gone, not session stopped).
2. **Replay window defaults:** what bounded replay do we want to guarantee for late subscribers (events count + bytes)? (Local can start small; cloud may offer larger server-side replay.)
3. **Cloud terminal transport:** when cloud arrives, is the terminal data plane SSH-only, an authenticated WebSocket proxy, or a runner-native protocol? (This affects where replay/buffering lives and what connection/auth events look like.)
4. **Provider selection:** how do we decide whether a workspace uses the local provider vs a cloud/SSH provider? (Expected: workspace metadata such as `cloudWorkspaceId` / workspace type, not UI state.)
5. **tRPC compatibility:** do we keep legacy endpoint names like `listDaemonSessions` (yes) and add `*V2` endpoints for identity/cursor work, or do we accept a coordinated renderer+router update to evolve existing endpoints?


## Plan of Work

This work is a refactor, so milestones are organized to keep behavior stable and to validate frequently.

Shipping strategy (based on review feedback): default to keep the initial PR focused on Milestones 1–3 plus Milestone 5 (provider boundary + router migration + invariants/tests). Milestones 4, 6a–6c, and 7 are follow-ups unless a correctness gap forces pulling them forward.

## PR1 Scope Lock (Runtime Abstraction Only)

This plan can be executed across multiple PRs. To make handoff safe and reduce regression risk, treat PR1 as “runtime/provider abstraction only”: centralize backend selection + remove `instanceof` branching, while keeping renderer behavior and IPC shapes stable.

### In Scope (PR1)

1. Main process: introduce `WorkspaceRuntimeRegistry` + `LocalWorkspaceRuntime` and route daemon vs in-process selection through the provider boundary.
2. Main process: expose session management as `terminal.management: TerminalManagement | null` (capability presence, no “no-op admin methods”).
3. Routers: migrate the terminal router to use the registry/provider (remove `instanceof DaemonTerminalManager` checks) and preserve existing endpoint names/shapes.
4. Keep the legacy `terminal.stream(paneId)` subscription and semantics:
   - subscription must use `observable`
   - MUST NOT complete on `exit` (exit is a state transition)
   - completion happens only when the client unsubscribes/disposes
5. Update non-terminal call sites that currently reach around the boundary via `getActiveTerminalManager()` (examples in this repo today: `apps/desktop/src/main/index.ts`, `apps/desktop/src/main/windows/main.ts`, and workspace flows like `apps/desktop/src/lib/trpc/routers/workspaces/procedures/delete.ts`, plus other references found via ripgrep) to use the provider boundary instead.
6. Regression coverage: keep/extend the existing “stream does not complete on exit” test and add a capability presence test (`management === null` in non-daemon mode).
   - Also add/keep coverage that `disconnect`/`error` events do not complete the subscription (completion only on unsubscribe/dispose).

### Out of Scope (PR1)

1. Renderer changes (no `Terminal.tsx` refactors; no new hooks/modules in the renderer).
2. Identity separation (`backendSessionId/clientId/attachmentId`) and `streamV2` adoption in the renderer (Milestone 4).
3. Replay/cursor correctness upgrades (ring buffer, `watermarkEventId`, `since` replay), typed error-code normalization across daemon protocol, and resize `seq` enforcement (all follow-ups unless required to fix a real gap).
4. Cloud readiness skeleton/provider selection plumbing (Milestone 7).

### PR1 Acceptance Gates (Must Pass)

1. `bun run lint`, `bun run typecheck --filter=@superset/desktop`, and `bun test --filter=@superset/desktop` all pass.
2. Manual smoke (minimum):
   - persistence disabled: open terminal, type, exit; Settings “Manage sessions” shows unavailable
   - persistence enabled: warm attach + cold restore still works; Settings “Manage sessions” works
   - `terminal.stream` does not complete on exit (no “listeners=0” cold-restore regressions)
3. macOS window reopen behavior remains correct (no duplicated terminal lifecycle listeners after closing and reopening the window).

## Decisions (Lock Before Implementing)

These are the decisions that should be treated as locked for PR1 to avoid accidental scope creep. If any of these must change during implementation, update this plan explicitly before continuing.

1. **Renderer scope:** PR1 makes no behavior changes in the renderer. Any renderer decomposition (Milestones 6a–6c) is a follow-up PR.
2. **Identity:** PR1 keeps `paneId` as the session key at the IPC boundary. Do not introduce `backendSessionId/clientId/attachmentId` plumbing or `streamV2` in PR1.
3. **Stream contract:** PR1 preserves the existing `terminal.stream(paneId)` subscription (observable) and MUST NOT complete the stream on `exit` (or on disconnect/error). Only unsubscribe/dispose completes it.
4. **Replay/cursor correctness:** PR1 does not add ring buffers, `watermarkEventId`, or `since` replay semantics unless a concrete “lost first output” bug is demonstrated.
5. **Error semantics:** PR1 preserves existing error behavior and error codes. Do not redesign daemon protocol or require typed error codes end-to-end in PR1; treat that as a follow-up if desired.
6. **Resize sequencing (`seq`):** PR1 does not implement resize `seq` enforcement (the current renderer does not pass a `seq` today). If we want `seq`, include it as part of Milestone 4 when we touch renderer identity/state anyway.
7. **Listener lifecycle:** PR1 must preserve window-close cleanup behavior (no duplicate listeners on macOS reopen) and app-quit cleanup behavior. If the abstraction introduces new listener wiring, ensure the cleanup story is equally explicit (unsubscribe/remove listeners).
8. **tRPC input shapes:** PR1 keeps the existing paneId-only mutation inputs (`write`, `resize`, `signal`, `kill`, `detach`, `clearScrollback`, `ackColdRestore`, `stream`). Do not add `workspaceId` or new identity fields to these inputs in PR1; derive routing internally (local provider, or mapping populated during `createOrAttach`).
9. **Registry invalidation / settings:** terminal persistence remains “requires restart” (existing behavior). The runtime registry is process-scoped and does not reconfigure live if `settings.terminalPersistence` is toggled while the app is running.


## Target Shape (After Refactor)

This section is illustrative. It shows the intended file layout, key types, and call flows after the refactor. It is not a full implementation, but it should be concrete enough that a new contributor can “see” how responsibilities move out of the tRPC router and out of `Terminal.tsx`.


### File Tree (Proposed)

    apps/desktop/src/main/lib/workspace-runtime/
      index.ts                         # exports getWorkspaceRuntimeRegistry()
      registry.ts                      # per-workspace selection + caching (process-scoped registry)
      types.ts                         # WorkspaceRuntime contract + capability flags
      local.ts                         # local implementation (terminal + future changes/files/agentEvents)
      cloud.ts                         # (future) remote implementation skeleton (NOT_IMPLEMENTED)

    apps/desktop/src/main/lib/terminal/
      runtime.ts                        # TerminalRuntime contract + adapters (backend-agnostic surface)
      manager.ts                        # in-process backend (existing)
      daemon-manager.ts                 # daemon backend (existing)
      terminal-history.ts               # history persistence (existing)
      types.ts                          # existing shared terminal types (CreateSessionParams, SessionResult, events)

    apps/desktop/src/lib/trpc/routers/terminal/
      terminal.ts                       # uses getWorkspaceRuntimeRegistry(); no instanceof checks
      terminal.stream.test.ts           # stream invariants (exit does not complete)

    apps/desktop/src/renderer/.../Terminal/
      Terminal.tsx                      # UI wiring, minimal branching
      init-plan.ts                      # buildTerminalInitPlan(result) -> TerminalInitPlan
      apply-init-plan.ts                # applyTerminalInitPlan({ xterm, plan, ... })
      useTerminalStream.ts              # buffering + flush until ready (no UI)
      types.ts                          # TerminalInitPlan + stream event types (renderer-only)
      hooks/
        useTerminalConnection.ts         # tRPC mutations (existing)


### Identity + Lifecycle (State Machines)

The plan relies on **separating session lifecycle from subscription lifecycle**. This is the core invariant behind the “stream must not complete on exit” rule, and it becomes even more important for cloud/multi-device.

Session lifecycle (backend truth; per `backendSessionId`):

1. `spawning` (optional; cloud or tmux restore)
2. `running`
3. `exited` (PTY exited; session state remains queryable/attachable depending on backend semantics)
4. `terminated` (explicitly killed or deleted; no longer attachable)

Stream/subscription lifecycle (viewer truth; per `attachmentId`):

1. `subscribed` → `live` (receiving events)
2. `disconnected` (transport down; may reconnect; session may still be running)
3. `unsubscribed` (the only terminal stream completion trigger — client disposed)

Rule: **session exit must never transition the stream to “unsubscribed/completed”.** Exit is a state transition delivered as an event (and/or reflected via attach metadata), but the subscription remains open until the client explicitly unsubscribes.


### Workspace Runtime Types (Main Process)

The goal is to stop encoding backend choice as a “mode string” that callers branch on. Callers should see:

1. A workspace-scoped provider (`WorkspaceRuntime`) selected by a registry in main.
2. Provider-neutral capability flags + nullable capability objects (no `instanceof` branching outside the provider boundary).
3. Explicit identities and lifecycle semantics that are compatible with multi-device/cloud.

    export type WorkspaceRuntimeId = string;

    export interface WorkspaceRuntimeRegistry {
      getForWorkspaceId(workspaceId: string): WorkspaceRuntime;

      // Transitional: used only by legacy/global endpoints (settings screens).
      // Do not use this for per-session routing.
      getDefault(): WorkspaceRuntime;
    }

    export interface WorkspaceRuntime {
      id: WorkspaceRuntimeId;
      terminal: TerminalRuntime;
      // Future: changes/files/agentEvents become part of this provider boundary.
      // Keep these as stubs until cloud work demands them; avoid creating parallel registries.
      capabilities: {
        terminal: TerminalCapabilities;
        // changes/files/agentEvents capability flags will be added here later.
      };
    }

Terminal identities (first-class in contracts):

    export type TerminalClientId = string;
    export type TerminalAttachmentId = string;
    export type TerminalEventId = number; // monotonic per session (cursor)

    export type TerminalErrorCode =
      | "SESSION_NOT_FOUND"
      | "WRITE_QUEUE_FULL"
      | "WRITE_FAILED"
      | "PTY_NOT_SPAWNED"
      | "BACKEND_UNAVAILABLE"
      | "PROTOCOL_MISMATCH"
      | "REPLAY_UNAVAILABLE"
      | "NOT_IMPLEMENTED";

Note: In PR1, `TerminalErrorCode` is primarily documentation for the desired taxonomy. PR1 preserves existing error behavior; end-to-end typed error normalization is a follow-up.

Terminal capabilities and management:

    export interface TerminalCapabilities {
      persistent: boolean;          // sessions can survive app restarts
      coldRestore: boolean;         // cold restore is supported
      replay: boolean;              // stream supports bounded replay via `since` cursor
      multiAttach: boolean;         // multiple attachments can view one backend session
      remoteManagement: boolean;    // sessions can be managed remotely (future: cloud)
    }

    export interface TerminalManagement {
      listSessions(): Promise<ListSessionsResponse>;
      killAllSessions(): Promise<void>;
      resetHistoryPersistence(): Promise<void>;
    }

Terminal runtime surface:

    export interface CreateOrAttachResult extends SessionResult {
      backendSessionId: string;
      clientId: TerminalClientId;
      attachmentId: TerminalAttachmentId;
      /**
       * Watermark cursor: the snapshot/initial state returned by createOrAttach
       * includes all events up to (and including) this cursor.
       * Clients should subscribe with `since = watermark + 1` to avoid gaps.
       */
      watermarkEventId: TerminalEventId;
    }

    export interface TerminalSessionOperations {
      // Core lifecycle (normalized to async, even if an implementation is sync today)
      createOrAttach(params: CreateSessionParams & {
        clientId: TerminalClientId;
        attachmentId: TerminalAttachmentId;
      }): Promise<CreateOrAttachResult>;

      write(params: { backendSessionId: string; data: string }): Promise<void>;
      resize(params: { backendSessionId: string; cols: number; rows: number; seq?: number }): Promise<void>;
      signal(params: { backendSessionId: string; signal?: string }): Promise<void>;
      kill(params: { backendSessionId: string }): Promise<void>;

      detach(params: {
        backendSessionId: string;
        attachmentId: TerminalAttachmentId;
        viewportY?: number;
      }): Promise<void>;

      clearScrollback(params: { backendSessionId: string }): Promise<void>;
      ackColdRestore(params: { backendSessionId: string }): Promise<void>;
    }

    export interface TerminalWorkspaceOperations {
      killByWorkspaceId(workspaceId: string): Promise<{ killed: number; failed: number }>;
      getSessionCountByWorkspaceId(workspaceId: string): Promise<number>;
      refreshPromptsForWorkspace(workspaceId: string): Promise<void>;
    }

    export type TerminalSessionEvent =
      | { type: "data"; backendSessionId: string; eventId: TerminalEventId; data: string }
      | { type: "exit"; backendSessionId: string; eventId: TerminalEventId; exitCode: number; signal?: number }
      | { type: "disconnect"; backendSessionId: string; eventId: TerminalEventId; reason: string }
      | { type: "error"; backendSessionId: string; eventId: TerminalEventId; error: string; code?: TerminalErrorCode }
      | { type: "connection_state"; backendSessionId: string; eventId: TerminalEventId; state: "connected" | "disconnected" | "reconnecting"; reason?: string }
      | { type: "auth_state"; backendSessionId: string; eventId: TerminalEventId; state: "valid" | "expired"; reauthUrl?: string };

    export interface TerminalEventSource {
      /**
       * Backend-agnostic subscription API (do not expose Node EventEmitter semantics).
       * Must NOT complete on `exit`.
       *
       * Replay contract:
       * - If `since` is provided and the backend supports replay, it should replay a bounded window of events.
       * - If the replay window cannot satisfy `since`, the backend should still subscribe live but should
       *   surface `REPLAY_UNAVAILABLE` explicitly (error event or a typed meta event) so the UI can rely on snapshot.
       */
      subscribeSession(params: {
        backendSessionId: string;
        clientId: TerminalClientId;
        attachmentId: TerminalAttachmentId;
        since?: TerminalEventId;
        onEvent: (event: TerminalSessionEvent) => void;
      }): () => void;

      // Low-volume lifecycle events used for correctness when panes are unmounted.
      subscribeTerminalExit(params: {
        onExit: (event: { backendSessionId: string; exitCode: number; signal?: number }) => void;
      }): () => void;
    }

    export interface TerminalRuntime {
      sessions: TerminalSessionOperations;
      workspaces: TerminalWorkspaceOperations;
      events: TerminalEventSource;
      management: TerminalManagement | null;
      capabilities: TerminalCapabilities;
    }

Provider boundary invariants:

1. The registry must be process-scoped and cached (stable runtime objects; stable event wiring).
2. `management !== null` indicates feature availability, not “health right now”; mid-session disconnects surface as events/errors.
3. Backends must not require string-matching to classify errors. Normalize to `TerminalErrorCode` at the boundary and propagate codes unchanged through tRPC.
4. Backends should enforce resize sequencing (drop stale `seq`); the renderer already provides `seq` today.
5. Replay correctness belongs at the backend/provider boundary (bounded ring buffer + cursor), not in `Terminal.tsx`.


### tRPC Router Shape (No Daemon Type Checks)

The terminal router captures the **workspace runtime registry** once when the router is created. Each procedure then selects the correct provider (local vs cloud later) without using `instanceof` checks.

Key rule: capture the registry once, but do not assume there is only one runtime for the entire process forever.

    export const createTerminalRouter = () => {
      const registry = getWorkspaceRuntimeRegistry();

      return router({
        createOrAttach: publicProcedure
          .input(...)
          .mutation(async ({ input }) => {
            const workspace = registry.getForWorkspaceId(input.workspaceId);
            return workspace.terminal.sessions.createOrAttach(input);
          }),

        // Prefer a V2 stream contract that is explicit about identity + replay.
        // (Keep `stream(paneId)` temporarily only if needed for compatibility.)
        streamV2: publicProcedure
          .input(
            z.object({
              workspaceId: z.string(),
              backendSessionId: z.string(),
              clientId: z.string(),
              attachmentId: z.string(),
              since: z.number().optional(),
            }),
          )
          .subscription(({ input }) =>
            observable<TerminalSessionEvent>((emit) => {
              // IMPORTANT: do not complete on exit.
              // Exit is a state transition and must not terminate the subscription.
              const workspace = registry.getForWorkspaceId(input.workspaceId);
              return workspace.terminal.events.subscribeSession({
                backendSessionId: input.backendSessionId,
                clientId: input.clientId,
                attachmentId: input.attachmentId,
                since: input.since,
                onEvent: (event) => emit.next(event),
              });
            }),
          ),

        listDaemonSessions: publicProcedure.query(async () => {
          // Note: endpoint name kept for backwards compatibility; capability is provider-neutral.
          const runtime = registry.getDefault().terminal;
          if (!runtime.management) return { daemonModeEnabled: false, sessions: [] };
          const response = await runtime.management.listSessions();
          return { daemonModeEnabled: true, sessions: response.sessions };
        }),
      });
    };


### Renderer Decomposition (Reducing `Terminal.tsx` Branching)

The renderer still needs to implement UI behaviors (cold restore overlay, retry overlay, focus, hotkeys), but it should not be the place where we interleave protocol concerns and restoration sequencing. The refactor decomposes the terminal renderer into three small helpers and keeps `Terminal.tsx` as wiring.

`init-plan.ts` (pure adapter):

    export interface TerminalInitPlan {
      initialAnsi: string;
      rehydrateSequences: string;
      cwd: string | null;
      modes: { alternateScreen: boolean; bracketedPaste: boolean };
      restoreStrategy: "altScreenRedraw" | "snapshotReplay";
      isColdRestore: boolean;
      previousCwd: string | null;
      /** Used to restore scroll position on reattach (see upstream PR #698) */
      viewportY?: number;
    }

    // `CreateOrAttachOutput` here refers to the renderer-visible shape returned by
    // `trpc.terminal.createOrAttach` (which includes `snapshot` and/or `scrollback`).
    export function buildTerminalInitPlan(result: CreateOrAttachOutput): TerminalInitPlan {
      const initialAnsi = result.snapshot?.snapshotAnsi ?? result.scrollback ?? "";
      const viewportY = result.viewportY;
      ...
      return { ..., viewportY };
    }

`apply-init-plan.ts` (ordering guarantees):

    export async function applyTerminalInitPlan(params: {
      xterm: Terminal;
      fitAddon: FitAddon;
      plan: TerminalInitPlan;
      onReady: () => void; // marks stream ready + flushes pending events
    }): Promise<void> {
      // apply rehydrate → apply snapshot → then onReady
      // if altScreenRedraw: enter alt screen, then trigger redraw, then onReady
      // if plan.viewportY is set, restore scroll position after initial content is applied
    }

`useTerminalStream.ts` (buffering until ready):

    export function useTerminalStream(params: {
      paneId: string;
      backendSessionId: string;
      onEvent: (event: TerminalStreamEvent) => void;
      isReady: () => boolean;
      onBufferFlush: (events: TerminalStreamEvent[]) => void;
    }) {
      // subscribe via trpc.terminal.streamV2.useSubscription (with since cursor when available)
      // queue events while !isReady(), then flush deterministically when ready
    }

`Terminal.tsx` becomes composition:

    const plan = buildTerminalInitPlan(result);
    await applyTerminalInitPlan({ xterm, fitAddon, plan, onReady: () => setStreamReady(true) });

The critical invariants remain unchanged:

1. The stream subscription does not complete on exit.
2. Events arriving “too early” are buffered until restore is finished.
3. Cold restore remains read-only until Start Shell is clicked, and stale queued events are dropped before starting a new session (prevents “exit clears UI” regressions).
4. Reattaching restores the previous scroll position (`viewportY`) when available (upstream main behavior; see PR #698).


### Diagrams (Call Flow)

Main call flow (today and after refactor; the difference is where switching happens):

Note: PR1 keeps `trpc.terminal.stream(paneId)`; `streamV2` is introduced only if Milestone 4 is in scope.

    Renderer (Terminal.tsx + helpers)
      |
      | trpc.terminal.createOrAttach / trpc.terminal.streamV2
      v
    Electron Main (tRPC router)
      |
      | getWorkspaceRuntimeRegistry().getForWorkspaceId(...)  (no backend checks in router)
      v
    Terminal Backend (in-process OR daemon-manager)
      |
      | (daemon only) TerminalHostClient over unix socket
      v
    Terminal Host Daemon  --->  PTY subprocess per session

Renderer composition after Milestone 6c:

    Terminal.tsx
      ├─ useTerminalConnection()      (tRPC mutations)
      ├─ useTerminalStream()          (buffer until ready; never completes on exit)
      ├─ buildTerminalInitPlan()      (normalize snapshot vs scrollback, decide restore strategy)
      └─ applyTerminalInitPlan()      (rehydrate → snapshot or alt-screen redraw → mark ready)


### Milestone 1: Contract + Invariants (WorkspaceRuntime)

This milestone documents and codifies the contract we must preserve during the refactor, and makes identity + lifecycle explicit. At completion, a reader can point to a single place in the codebase that defines:

- what the provider boundary is (`WorkspaceRuntime`)
- what a terminal backend must do (`TerminalRuntime`)
- what identities exist (`paneId`, `workspaceId`, `backendSessionId`, `clientId`, `attachmentId`)
- what lifecycle/state machines exist (session vs subscription)
- what errors look like (typed codes, no string matching)

Scope:

1. Inventory current backend call sites and implicit contracts:
   - `getActiveTerminalManager()`
   - event names `data:*`, `exit:*`, `disconnect:*`, `error:*`, and `terminalExit`
   - any string-matching of errors (example: “session not found” heuristics)
2. Introduce provider boundary types in main:
   - `apps/desktop/src/main/lib/workspace-runtime/types.ts` for `WorkspaceRuntime` and registry types
   - `apps/desktop/src/main/lib/terminal/runtime.ts` for `TerminalRuntime` contract types
3. Codify invariants as comments adjacent to the contract:
   - stream must not complete on `exit` (completion only on unsubscribe)
   - exit is a state transition; must arrive after all data events
   - detach/reattach scroll restoration (`viewportY`) is preserved (PR #698 behavior)
   - all operations are Promise-returning at the boundary (normalize sync to async)
   - errors are classified and documented as `TerminalErrorCode` (PR1 preserves existing error behavior; typed codes can be a follow-up)
   - replay semantics are documented (`eventId` cursor + bounded replay) (follow-up if we adopt `streamV2`/identity separation)

Acceptance:

1. A developer can find the contract definition in one place and understand identity + lifecycle semantics.
2. No runtime behavior changes yet.


### Milestone 2: WorkspaceRuntime Registry + Capabilities

This milestone introduces a process-scoped **workspace runtime registry** entry point that owns backend selection and exposes provider-neutral capabilities in a consistent, no-branching way to callers.

Scope:

1. Implement `getWorkspaceRuntimeRegistry()` in `apps/desktop/src/main/lib/workspace-runtime/registry.ts`:
   - cached across process lifetime
   - returns stable provider instances (stable event wiring)
2. Implement a `LocalWorkspaceRuntime` (initially only `terminal` is real; other components are stubs):
   - backend selection is allowed to use `backend instanceof DaemonTerminalManager` internally (provider boundary only)
   - expose `terminal.management: TerminalManagement | null` (no no-op admin methods)
3. (Optional; required for `streamV2`/Milestone 4) Implement the “correctness upgrades” at the backend/provider boundary (so the renderer does not have to):
   - monotonic `eventId` per `backendSessionId`
   - bounded ring buffer of recent events per session (bytes + frames cap)
   - `subscribeSession({ since })` best-effort replay from the ring buffer
   - include `watermarkEventId` in `createOrAttach` responses so the renderer can subscribe without gaps
4. (Optional; follow-up) Normalize errors into `TerminalErrorCode`:
   - daemon client/host and local backend return typed codes (stop string-matching in routers/renderers)
5. (Optional; follow-up) Enforce resize sequencing:
   - honor `resize.seq` in both in-process and daemon implementations; drop stale resizes (requires renderer to send `seq`)

Acceptance:

1. Provider selection is centralized and callers can only reach it via the workspace runtime registry.
2. `management === null` correctly represents “unsupported/unavailable”, while real failures propagate as errors.
3. (Optional; follow-up) The terminal event contract supports cursor/replay (even if replay window is initially small).


### Milestone 3: tRPC Terminal Router Migration

This milestone removes daemon branching from the tRPC router by routing all terminal work through `getWorkspaceRuntimeRegistry()`.

Scope:

1. Update `apps/desktop/src/lib/trpc/routers/terminal/terminal.ts` to:
   - capture `const registry = getWorkspaceRuntimeRegistry()` once at router creation time
   - select `const terminal = registry.getForWorkspaceId(...)` for workspace-scoped calls (create/attach + workspace ops); keep paneId-only inputs unchanged in PR1 and route them via the local provider (or a `paneId -> workspaceId` mapping) rather than changing renderer inputs
   - remove `instanceof DaemonTerminalManager` checks (replace with `terminal.management` and capability flags)
2. (Optional; required for Milestone 4) Introduce/implement a V2 stream surface that is explicit about identity + replay:
   - `terminal.streamV2({ workspaceId, backendSessionId, clientId, attachmentId, since? })`
   - subscription uses `terminal.events.subscribeSession(...)` and must not complete on exit
   - keep legacy `stream(paneId)` for the initial PR if Milestone 4 is deferred; otherwise keep it only temporarily for incremental migration
3. Preserve legacy settings endpoints for session management (`listDaemonSessions`, etc.), but route them through `terminal.management` and propagate errors:
   - `daemonModeEnabled: false` only when capability is absent
   - failures when capability is present must throw (do not silently “disable”)
4. Update other call sites that depended on EventEmitter semantics (example: `terminalExit`) to use `terminal.events.subscribeTerminalExit(...)`.

Acceptance:

1. No daemon branching remains in the terminal router.
2. tRPC subscriptions remain observable-based and do not complete on exit.


### Milestone 4: Identity + Stream Contract (backendSessionId/clientId)

This milestone pulls forward what used to be “cloud readiness”: it decouples pane identity from backend session identity and makes viewer identity explicit.

Note: This is a good follow-up PR candidate if we want to keep the initial refactor smaller and easier to regression-test (the core runtime/provider abstraction can ship while still using the legacy `paneId`-based identity).

Scope:

1. Renderer generates and persists a stable `clientId` (per window/app instance) and a per-pane `attachmentId` (per mount/attach lifecycle).
2. Extend `createOrAttach` to return:
   - `backendSessionId` (local may equal `paneId`)
   - `watermarkEventId` for gap-free subscription
3. Store `{ paneId -> backendSessionId }` and `{ paneId -> lastSeenEventId }` in renderer state.
4. Update renderer calls to use backend identity:
   - write/resize/signal/kill/detach target `backendSessionId`
   - stream uses `streamV2` with `since = watermarkEventId + 1` initially, then `since = lastSeenEventId + 1` on resubscribe
5. Define detach/reattach semantics explicitly:
   - detach unregisters the attachment (viewer gone), not the session
   - detach is idempotent (safe to call even if session is already exited/terminated)

Acceptance:

1. The renderer no longer assumes `paneId === sessionId` at the IPC boundary.
2. Late subscribers do not lose early output (replay + snapshot + watermark semantics).


### Milestone 5: Regression Coverage

This milestone makes the boundary hard to accidentally regress and expands verification coverage (automated + manual matrix).

Scope (tests):

1. Keep and/or extend the “stream does not complete on exit” regression test (`terminal.stream.test.ts`).
2. Add/keep tests for capability presence and error propagation:
   - `management: null` in non-daemon mode
   - “management present but failing throws loudly” (do not silently “disable” on real failures)
3. Follow-up tests (only if Milestones 2/4 are pulled into scope):
   - exit arrives after all data (ordering)
   - cold restore + Start Shell does not replay stale exit into the new session
   - replay cursor semantics (late subscribe sees output; bounded replay emits `REPLAY_UNAVAILABLE` explicitly when needed)
   - resize sequencing (stale `seq` dropped)
   - error code propagation (no string matching in router/renderer paths)

Scope (manual):

4. Update the PR verification matrix (kept in PR description) to include:
   - non-daemon: tab switch persistence, resize, paste large, exit/restart, multi-pane
   - daemon warm attach and cold restore
   - detach/reattach scroll restoration (`viewportY`)
   - daemon disconnect/retry overlay (if applicable)

Acceptance:

1. Tests fail if someone reintroduces `emit.complete()` on exit. (If Milestones 2/4 are in scope: tests also fail if cursor/replay semantics regress.)
2. Manual matrix passes with persistence disabled and enabled.


### Milestone 6a: Build a Terminal Init Plan (Renderer)

This milestone reduces complexity in the renderer terminal component without changing behavior. The goal is not to “rewrite the terminal UI”, but to isolate protocol/state-machine logic (snapshot vs scrollback selection, restore sequencing, cold restore gating, and scroll restoration) into small units that can be tested.

Note: Optional follow-up. This is decomposition-only and can be deferred if we want to keep the initial refactor focused on the main-process runtime/provider boundary.

Scope:

1. Add a small “session init adapter” that converts the tRPC `createOrAttach` result into a single normalized “initialization plan”:
   - Canonical initial content (`initialAnsi`) is `snapshot.snapshotAnsi ?? scrollback`.
   - Rehydrate sequences and mode flags are always present in the plan (with fallbacks where snapshot modes are missing).
   - The plan contains a single restore strategy decision, for example “alt-screen redraw” vs “snapshot replay”, based on the same conditions `Terminal.tsx` uses today.
   - The plan carries `viewportY` (when provided) to preserve scroll restoration on reattach (upstream PR #698 behavior).
2. Add a “restore applier” helper that owns strict ordering guarantees during restore:
   - Apply rehydrate sequences, then snapshot replay, then mark the stream as ready and flush queued events.
   - Preserve the existing “alt-screen reattach” behavior where we enter alt-screen first and trigger a redraw via resize/SIGWINCH sequence (to avoid white screens).

Acceptance:

1. At least one unit test exists for the init adapter to lock in “snapshot vs scrollback” canonicalization, mode fallbacks, and `viewportY` plumbing.
2. No Node.js imports are introduced in renderer code as part of this refactor.


### Milestone 6b: Stream Subscription + Buffering Hook (Renderer)

Scope:

1. Add a small “stream handler” helper (or hook) that owns buffering until ready:
   - Subscribe to `terminal.streamV2` and queue incoming events until the terminal is ready, then flush deterministically.
   - Keep the important invariant that the subscription does not complete on `exit` (exit is a state transition).
   - Keep the buffering mechanism bounded (by event count or bytes) and drop/compact safely if needed (prefer bounded queues over unbounded arrays).
   - Note: buffering here is UI-readiness only (layout/restore ordering). Replay correctness belongs at the backend boundary.

Acceptance:

1. A focused unit test exists for “buffer until ready then flush in order”.
2. The stream still does not complete on exit.


### Milestone 6c: Integrate Helpers into `Terminal.tsx` (UI Wiring Only)

Scope:

1. Refactor `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/Terminal.tsx` to use the helpers from Milestones 6a/6b:
   - Keep UI concerns (overlays, buttons, focus) in `Terminal.tsx`.
   - Move protocol concerns (snapshot vs scrollback selection, restore sequencing, stream buffering) out of the component.
2. Preserve scroll restoration behavior on reattach:
   - Send `viewportY` during detach (when available).
   - Restore it during the next attach at the appropriate time in the restore ordering (after initial content is applied).
3. Clarify `useTerminalConnection` expectations:
   - `useTerminalConnection()` remains the tRPC mutation wrapper and is not a target for significant refactors in this milestone, beyond adapting call sites to the new helpers.

Acceptance:

1. `Terminal.tsx` still behaves identically (cold restore overlay, Start Shell flow, retry connection flow, exit prompt flow), but the core initialization/stream logic is exercised via helper functions that can be unit tested.
2. No Node.js imports are introduced in renderer code as part of this refactor.


### Milestone 7 (Cloud Readiness): WorkspaceRuntime Skeleton

This milestone ensures we are investing in the right direction for remote runners/cloud workspaces. It does not implement cloud terminals, but it makes the seams concrete so that adding a remote provider later does not require reworking router/UI contracts again.

Note: Optional follow-up. Defer this milestone if the goal is to keep the terminal refactor narrowly scoped and land it quickly.

Scope:

1. Implement a `CloudWorkspaceRuntime` skeleton behind the same `WorkspaceRuntime` interface:
   - returns capability flags that make “unsupported” explicit
   - all operations throw `NOT_IMPLEMENTED` (or equivalent) with clear error codes
2. Add provider selection plumbing (stubbed):
   - selection is driven by workspace metadata (ex: `cloudWorkspaceId`), not UI state
   - all existing workspaces continue to resolve to `LocalWorkspaceRuntime` in this PR
3. Ensure the terminal contract includes lifecycle events needed for remote:
   - connection lifecycle (`connection_state` events)
   - authentication lifecycle (`auth_state` events)
4. Add minimal capability negotiation at the provider boundary (not UI branching):
   - the provider surfaces `terminal.capabilities` (supportsReplay, supportsMultiAttach, etc.)
   - if the daemon protocol needs additive fields to expose these, keep it additive (no redesign), and gate on protocol version.

Acceptance:

1. A future remote provider can plug into the same registry without new `instanceof` checks in routers or renderer.
2. The UI can surface “not supported” vs “failed” distinctly via typed error codes and capability presence.


## Validation

Run these commands from the repo root:

    bun run lint
    bun run typecheck --filter=@superset/desktop
    bun run test --filter=@superset/desktop

Expected results:

1. `bun run lint` exits with code 0 (Biome check is strict in this repo).
2. Typecheck passes with no TypeScript errors.
3. Desktop tests pass (some terminal-host lifecycle tests may remain skipped; do not “fix” unrelated skips as part of this refactor).


## Idempotence / Safety

This plan is safe to apply iteratively:

1. Changes are limited to TypeScript source and tests; no production database access is required.
2. Each milestone should be merged/committed independently so failures can be bisected quickly.
3. If a milestone introduces a regression, revert the milestone commit and re-apply with a smaller diff.


## Risks and Mitigations

Risk: The runtime registry/adapters change event wiring in a way that causes missed output or duplicate listeners.

Mitigation: Keep event ownership scoped to the provider instance (no shared/global emitters), and gate changes with regression tests that confirm:
- stream does not complete on exit
- no duplicate listeners/cross-talk
- output still flows after exit/cold restore

Risk: Output loss during attach if the stream subscription attaches after early PTY output (race between `createOrAttach` and stream subscribe).

Mitigation (PR1): Preserve the current renderer sequencing and buffering (“buffer until ready”), and include an “immediate output” check in manual QA (example: run `echo READY` immediately after attach and confirm it reliably appears).

Mitigation (follow-up if a real gap is observed): Move replay correctness to the backend boundary (Milestone 2 + Milestone 4):
- `createOrAttach` returns `watermarkEventId`
- renderer subscribes with `since = watermark + 1`
- provider maintains a bounded ring buffer and replays gaps best-effort
Renderer buffering remains UI-readiness only (restore ordering).

Risk: Admin capability handling masks real errors (a true daemon failure being reported as “disabled”).

Mitigation: Represent persistence/session management as a nullable capability object (`management: null` when unavailable). When `management` is present but calls fail, propagate errors (and test this explicitly).

Risk: A future cloud backend would require different identity mapping than `paneId == sessionId`.

Mitigation: Introduce `backendSessionId` + `clientId` + `attachmentId` (Milestone 4) so the contract no longer implies `paneId === backendSessionId` (local can keep equality as an implementation detail). The future cloud backend should implement the same contract behind the provider boundary without changing the renderer again.

Risk: Process-global runtime assumptions block local + cloud workspaces from coexisting (forcing branching to leak back into routers/UI).

Mitigation: Make runtime selection workspace-/session-scoped via the registry. The router captures the registry, not a single global runtime.

Risk: Reattach scroll restoration regresses during refactor (missing `viewportY` plumbing or restoring at the wrong time).

Mitigation: Treat `viewportY` as part of the stable contract (detach includes it; init plan carries it; restore applier applies it after initial content). Add explicit verification to the PR matrix and (if needed) a focused unit test around the init plan adapter carrying `viewportY`.

Risk: A refactor accidentally calls `emit.complete()` on `exit` (observable completion is irreversible), reintroducing the cold-restore failure mode.

Mitigation: Keep the “stream does not complete on exit” regression test as P0 coverage and treat any adapter/hook changes to stream handling as test-gated.


## Progress

### Milestone 1

- [x] Inventory terminal backend call sites, events, and error string matching
- [x] Define `WorkspaceRuntime` + `TerminalRuntime` contracts (identities, lifecycle, error codes, replay)
- [x] Confirm no behavior change; run `bun run lint`

### Milestone 2

- [x] Implement `getWorkspaceRuntimeRegistry()` + `LocalWorkspaceRuntime` in `apps/desktop/src/main/lib/workspace-runtime/`
- [x] Implement session management as `terminal.management: TerminalManagement | null` (no no-op admin methods)
- [ ] (Follow-up) Add event cursor + bounded replay ring buffer at provider boundary
- [ ] (Follow-up) Normalize error codes (`TerminalErrorCode`) and enforce resize sequencing (`seq`)
- [x] Run `bun run typecheck --filter=@superset/desktop`

### Milestone 3

- [x] Migrate `apps/desktop/src/lib/trpc/routers/terminal/terminal.ts` to `getWorkspaceRuntimeRegistry()`
- [x] Remove `instanceof DaemonTerminalManager` checks
- [ ] (Follow-up / Milestone 4) Add `terminal.streamV2` (identity + since cursor) and migrate router internals to `subscribeSession`
- [x] Run `bun test --filter=@superset/desktop`

### Milestone 4

Optional follow-up PR (cloud prep / identity separation).

- [ ] Add renderer `clientId` + per-pane `attachmentId`
- [ ] Add `{ paneId -> backendSessionId }` + `{ paneId -> lastSeenEventId }` mapping
- [ ] Migrate renderer write/resize/signal/kill/detach/stream to backend identity + `streamV2`
- [ ] Confirm “no complete on exit” and “no lost first output” invariants end-to-end
- [ ] Run full validation commands

### Milestone 5

- [ ] (Follow-up) Add/adjust unit tests for replay/cursor semantics, error codes, and resize sequencing
- [x] Confirm stream exit regression test still covers “no complete on exit”
- [ ] Update PR verification matrix and run manual verification (non-daemon, warm attach, cold restore)

### Milestone 6a

Optional follow-up PR (renderer decomposition).

- [ ] Implement init plan adapter (normalize snapshot vs scrollback, modes, `viewportY`)
- [ ] Implement restore applier helper (rehydrate → snapshot → scroll restore → stream ready)
- [ ] Add focused unit tests for init plan invariants

### Milestone 6b

- [ ] Implement stream handler helper/hook (buffer until ready, flush deterministically)
- [ ] Add focused unit tests for buffering + no-complete-on-exit

### Milestone 6c

- [ ] Refactor `Terminal.tsx` to use helpers, preserving behavior
- [ ] Preserve detach/reattach scroll restoration (`viewportY`)

### Milestone 7 (Cloud Readiness)

Optional follow-up PR.

- [ ] Add `CloudWorkspaceRuntime` skeleton and selection plumbing (metadata-driven)
- [ ] Ensure terminal contract includes connection/auth lifecycle events
- [ ] Add minimal capability negotiation (feature flags) at provider boundary


## Surprises & Discoveries

- 2026-01-11: Reviewed `docs/CLOUD_WORKSPACE_PLAN.md` — cloud is source of truth with optional local sync; implies a workspace-scoped provider boundary (terminal + agentEvents + changes/files), not “terminal-only”.
- 2026-01-11: Upstream main includes detach/reattach scroll restoration (`viewportY`, PR #698); treat as a stable behavior invariant during refactor.


## Decision Log

- 2026-01-11: Promote `WorkspaceRuntime` (provider) to the primary abstraction; `TerminalRuntime` becomes `workspace.terminal` so future cloud work doesn’t re-cut seams for changes/files/agentEvents.
- 2026-01-11: Use a process-scoped **workspace runtime registry** (`getWorkspaceRuntimeRegistry()`), not a single global runtime; router captures the registry and selects runtimes per workspace so local + cloud can coexist later.
- 2026-01-11: Keep the abstraction boundary provider-neutral: expose `terminal.management: TerminalManagement | null` (capability object) while keeping legacy endpoint names like `listDaemonSessions` for UI compatibility.
- 2026-01-11: Make identity explicit at the boundary: `paneId` (UI) is distinct from `backendSessionId` (execution), and multi-device compatibility requires `clientId` + `attachmentId`.
- 2026-01-11: Move correctness buffering to the backend/provider boundary: add event cursor + bounded replay so late subscribers don’t lose output; renderer buffering becomes UI-readiness only.
- 2026-01-11: Preserve renderer behavior; any `Terminal.tsx` changes are decomposition-only (init plan + applier + stream buffering), preserving “no complete on exit” and `viewportY` scroll restoration.
- 2026-01-11: Standardize typed error codes and enforce resize sequencing (`seq`) to reduce lifecycle/race regressions and avoid string-matching.


## Outcomes & Retrospective

(Fill this in at the end: what changed, how to verify, what follow-ups remain, what you would do differently.)
