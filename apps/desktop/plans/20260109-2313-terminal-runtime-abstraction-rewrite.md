# Terminal Runtime Abstraction (Daemon vs In-Process)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from `AGENTS.md`, `apps/desktop/AGENTS.md`, and the ExecPlan template in `.agents/commands/create-plan.md`.


## Purpose / Big Picture

After this change, the desktop app still supports terminal persistence (daemon mode with cold restore) exactly as it does today, but the codebase no longer leaks “daemon vs in-process” branching across the tRPC router and UI. The backend selection becomes a single responsibility owned by `apps/desktop/src/main/lib/terminal/`, making the feature easier to review, less fragile, and a better foundation for future “cloud terminal” backends.

Observable outcomes:

1. With terminal persistence disabled, terminals behave as before (no persistence across app restarts), and Settings → Terminal “Manage sessions” shows that daemon management is unavailable.
2. With terminal persistence enabled, terminals survive app restarts, cold restore works, and Settings → Terminal “Manage sessions” continues to list/kill sessions.
3. The tRPC `terminal.*` router no longer needs `instanceof DaemonTerminalManager` checks; daemon awareness is centralized in the terminal runtime layer.


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

Pane ID (`paneId`): a stable identifier for a terminal pane in the renderer’s tab layout. It is used as the session key across restarts and reattaches.

Terminal session: the running PTY process and its terminal emulator state.

Warm attach: reconnecting to a still-running session (daemon still has the PTY).

Cold restore: restoring scrollback from disk after an unclean shutdown or daemon session loss, before starting a new shell.

Terminal runtime: a single module-level API in `apps/desktop/src/main/lib/terminal/` that selects the active terminal backend (daemon or in-process) and exposes a unified surface to callers.

Capabilities: optional features that exist only for some backends (for example “list/manage persistent sessions”). Callers should not use `instanceof` checks. Capability presence must be represented structurally (for example `daemon: null` when unavailable) and via explicit capability flags, so “unsupported” cannot be confused with “success”.


## Non-Goals

This refactor is intentionally conservative to avoid regressions:

1. No protocol redesign between main and terminal-host.
2. No behavioral change to cold restore, attach scheduling, warm set mounting, or stream lifecycle.
3. No implementation of cloud terminals in this PR. The plan only ensures the abstraction boundary is compatible with adding a cloud backend later.


## Assumptions

1. Windows is not a supported desktop target right now, so Unix-domain socket constraints are acceptable.
2. The terminal persistence setting (`settings.terminalPersistence`) is treated as “requires restart” today; we keep that behavior for this refactor.
3. tRPC subscriptions must use `observable` (per `apps/desktop/AGENTS.md`); we will not introduce generator-based subscriptions.
4. The most important regression to prevent is the “listeners=0” cold-restore failure mode; specifically, the `terminal.stream` subscription must not complete on exit.


## Open Questions

1. Naming: should the abstraction be named `TerminalRuntime`, `TerminalService`, or keep `getActiveTerminalManager()` and add a new `getTerminalRuntime()` alongside it? (This plan assumes `getTerminalRuntime()` returning a `TerminalRuntime` facade exported from `apps/desktop/src/main/lib/terminal/index.ts`.)
2. Should we keep the existing tRPC endpoint names (`terminal.listDaemonSessions`, `terminal.killAllDaemonSessions`, etc.) for backwards compatibility in the renderer? (This plan assumes “yes” to minimize churn and risk.)
3. For future cloud terminals, do we want to preserve the current “`paneId` == `sessionId`” mapping, or introduce a distinct backend session identifier (for example `backendSessionId`) and map panes to backend sessions? (This plan assumes we do not change identity mapping in this PR to reduce regression risk, but we keep the runtime contract compatible with adding a distinct backend session identifier later.)


## Plan of Work

This work is a refactor, so milestones are organized to keep behavior stable and to validate frequently.


### Milestone 1: Establish a Backend Contract and Invariants

This milestone documents and codifies the contract we must preserve during the refactor. At completion, a reader can point to a single place in the codebase that defines “what the terminal backend must do”, and a single set of invariants that all implementations must satisfy.

Scope:

1. Identify the backend API surface currently used by callers outside `apps/desktop/src/main/lib/terminal/` by searching for usages of:
   - `getActiveTerminalManager()`
   - events `data:${paneId}`, `exit:${paneId}`, `disconnect:${paneId}`, `error:${paneId}`, and `terminalExit`
2. Write an explicit “TerminalSessionBackend contract” type in `apps/desktop/src/main/lib/terminal/` (likely in `apps/desktop/src/main/lib/terminal/types.ts` or a new `runtime.ts`). This contract should include:
   - The core operations used by the renderer (create/attach/write/resize/signal/kill/detach/clearScrollback).
   - The workspace operations used by other routers (killByWorkspaceId, getSessionCountByWorkspaceId, refreshPromptsForWorkspace).
   - The EventEmitter event names used by the tRPC stream and notifications bridge.
3. Record invariants in code comments near the contract:
   - `terminal.stream` must not complete on `exit`.
   - `exit` is a state transition, not an end-of-stream.
   - The output stream lifecycle is separate from session lifecycle: the stream completes only when the client unsubscribes (dispose), not when a session exits.
   - All backend operations must be normalized to async (Promise-returning) at the contract boundary, even if an implementation currently has a sync method (example: `clearScrollback`).
   - The terminal EventEmitter must be owned by the backend instance; the runtime facade must not introduce a shared/global EventEmitter or re-emit events in a way that can cause cross-talk or duplicate listeners.

Acceptance:

1. A developer can find the contract definition in one place and see the invariants described in plain language.
2. No runtime behavior changes yet.


### Milestone 2: Implement `TerminalRuntime` Facade + Capabilities

This milestone introduces a single runtime entry point that owns backend selection and exposes backend-specific capabilities in a consistent, no-branching way to callers.

Approach:

1. Create a small facade in `apps/desktop/src/main/lib/terminal/` (recommended: `apps/desktop/src/main/lib/terminal/runtime.ts`) that exports:
   - `getTerminalRuntime(): TerminalRuntime`
2. `TerminalRuntime` should have three parts:
   - `sessions: TerminalSessionBackend` (the active backend implementing the normalized async session contract)
   - `daemon: DaemonManagement | null` (nullable capability object; `null` when daemon management is not supported/active)
   - `capabilities: { persistent: boolean; coldRestore: boolean; remoteManagement: boolean }` (feature flags that do not encode implementation details and leave room for a future cloud backend)
3. Do not use “no-op admin methods”. The absence of daemon capabilities must be represented structurally (`daemon: null`) so callers cannot confuse “unsupported” with “success”.
4. Ensure the facade is process-scoped and constructed once. The tRPC router should capture the runtime once at router construction time (not per request) to avoid multiplying event listeners or daemon client connections.
5. Export the runtime from `apps/desktop/src/main/lib/terminal/index.ts` as the only supported way to reach daemon-specific functionality.

Acceptance:

1. The runtime and capabilities surface is defined in `apps/desktop/src/main/lib/terminal/` and is the only code that knows which backend is active.
2. In non-daemon mode, `runtime.daemon` is `null` and callers must handle that explicitly; unsupported operations are not silently treated as success.


### Milestone 3: Migrate tRPC `terminal.*` Router to the Runtime

This milestone removes daemon branching from the tRPC router by routing all terminal work through `getTerminalRuntime()`.

Scope:

1. Update `apps/desktop/src/lib/trpc/routers/terminal/terminal.ts` to use:
   - `const runtime = getTerminalRuntime()` (or equivalent)
   - Replace `instanceof DaemonTerminalManager` checks with checks on `runtime.daemon` capability presence.
2. Preserve the existing endpoint names and response shapes so the renderer does not need behavioral changes:
   - `listDaemonSessions` returns `{ daemonModeEnabled, sessions }`
   - `killAllDaemonSessions` returns `{ daemonModeEnabled, killedCount }`
   - `killDaemonSessionsForWorkspace` returns `{ daemonModeEnabled, killedCount }`
   - `clearTerminalHistory` returns `{ success: true }` but calls daemon history reset when the daemon capability is present
3. Ensure the `stream` subscription continues to use `observable` and continues to not complete on `exit`.
4. Error semantics must be explicit:
   - If daemon capability is absent, return `daemonModeEnabled: false` (UI will show “restart app after enabling persistence” messaging).
   - If daemon capability is present but the operation fails (daemon unreachable, request fails), surface the error (do not convert it into `daemonModeEnabled: false`).

Acceptance:

1. No usage of `instanceof DaemonTerminalManager` remains in `apps/desktop/src/lib/trpc/routers/terminal/terminal.ts`.
2. The renderer does not need to change its API calls.


### Milestone 4: Add Regression Coverage for the Abstraction Boundary

This milestone makes the new boundary hard to accidentally regress later.

Scope:

1. Add a unit test that asserts the non-daemon runtime returns `daemon: null` (capability absent) without requiring daemon availability. This test must not spawn a real daemon.
2. Keep and/or extend the existing “stream does not complete on exit” regression test in `apps/desktop/src/lib/trpc/routers/terminal/terminal.stream.test.ts`.
3. If we add any new helper modules, ensure they are covered by at least one focused unit test.
4. Add a test that ensures admin operations fail loudly on error (for example, simulate a daemon management call throwing and assert the error propagates), so we do not accidentally reintroduce silent “disabled” fallbacks for real failures.

Acceptance:

1. Tests fail if someone reintroduces daemon-specific branching in the router or reintroduces “complete on exit”.


### Milestone 5: Manual Verification (High-Coverage, Low Surprises)

This milestone uses the existing PR verification matrix (kept in the PR description) and focuses on the specific regressions most likely during a refactor: missing output, stuck exits, incorrect detach behavior, and workspace deletion behavior.

Validation should be run both with terminal persistence disabled and enabled.

Acceptance:

1. The matrix items for non-daemon, daemon warm attach, and daemon cold restore all pass.


## Validation

Run these commands from the repo root:

    bun run lint
    bun run typecheck --filter=@superset/desktop
    bun test --filter=@superset/desktop

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

Risk: The runtime facade changes event wiring in a way that causes missed output or duplicate listeners.

Mitigation: Keep the EventEmitter contract unchanged (`data:${paneId}`, `exit:${paneId}`), keep `terminal.stream` semantics unchanged, and use tests + manual matrix to confirm “output still flows after exit/cold restore”.

Risk: Output loss during attach if the stream subscription attaches after early PTY output (race between `createOrAttach` and `terminal.stream` subscribe).

Mitigation: Preserve the current renderer sequencing (subscription established while the component is mounted, initial state applied from snapshot/scrollback, and stream events queued until ready). During manual QA, include at least one “immediate output” command (example: `echo READY`) and confirm it is visible reliably. If a reproducible loss exists, add a small per-pane ring buffer (bounded bytes) at the backend boundary and flush it to the first subscriber as a targeted follow-up.

Risk: Admin capability handling masks real errors (a true daemon failure being reported as “disabled”).

Mitigation: Represent daemon management as a nullable capability object (`daemon: null` when unavailable). When `daemon` is present but calls fail, propagate errors (and test this explicitly).

Risk: A future cloud backend would require different identity mapping than `paneId == sessionId`.

Mitigation: Do not change identity mapping in this refactor, but ensure the runtime contract does not assume Unix sockets or local process ownership. The future cloud backend should implement the same contract behind `TerminalRuntime`.


## Progress

### Milestone 1

- [ ] Inventory terminal backend call sites and events
- [ ] Write TerminalBackend contract type and invariants comment
- [ ] Confirm no behavior change; run `bun run lint`

### Milestone 2

- [ ] Implement `getTerminalRuntime()` facade in `apps/desktop/src/main/lib/terminal/`
- [ ] Implement daemon management as `daemon: DaemonManagement | null` (no no-op admin methods)
- [ ] Run `bun run typecheck --filter=@superset/desktop`

### Milestone 3

- [ ] Migrate `apps/desktop/src/lib/trpc/routers/terminal/terminal.ts` to runtime
- [ ] Remove `instanceof DaemonTerminalManager` checks
- [ ] Run `bun test --filter=@superset/desktop`

### Milestone 4

- [ ] Add/adjust unit tests for capability presence (`daemon: null`) and error propagation
- [ ] Confirm stream exit regression test still covers “no complete on exit”
- [ ] Run full validation commands

### Milestone 5

- [ ] Manual verification with persistence disabled
- [ ] Manual verification with persistence enabled (warm attach)
- [ ] Manual verification for cold restore “Start Shell” path


## Surprises & Discoveries

(Fill this in during implementation with dates and short, factual notes.)


## Decision Log

(Move items from Open Questions here as they are resolved; include rationale and date.)


## Outcomes & Retrospective

(Fill this in at the end: what changed, how to verify, what follow-ups remain, what you would do differently.)
