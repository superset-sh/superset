# Rebase PR #619 (Daemon Terminal Persistence) onto Main

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from AGENTS.md and the ExecPlan template.

## Purpose / Big Picture

After this change, users gain two terminal persistence levels:
1. **Default (PR #686 on main)**: Terminal state survives tab switches and renderer reloads via headless xterm in main process
2. **Opt-in Daemon Mode (PR #619)**: Terminal sessions survive app restarts via a background daemon process

The rebase aligns PR #619 with the architectural decisions made in PR #686 (headless xterm as source of truth), while preserving daemon-mode's unique value: app-restart persistence.

**Observable outcome**: After enabling "Persist terminals across restarts (beta)" in Settings, a user can:
1. Open a terminal, run a long command (e.g., `sleep 1000`)
2. Quit the app completely
3. Reopen the app and see the terminal still running with the command active

## Assumptions

1. PR #686's headless xterm approach is architecturally correct (validated by Oracle and Kiet's journey)
2. The daemon approach should implement the same "TerminalBackend contract" as the non-daemon path
3. Renderer should not know whether it's talking to daemon or in-process backend
4. Performance regression risks require telemetry before daemon-as-default

## Open Questions

1. **[RESOLVED]** Should daemon-manager.ts adopt main's headless xterm patterns?
   - **Decision**: Yes, for consistency. See Decision Log.

2. **[RESOLVED]** Should we keep PtyWriteQueue in daemon mode?
   - **Decision**: Yes, keep write serialization/backpressure at backend boundary. See Decision Log.

3. **[RESOLVED]** How to handle cold restore scrollback - use headless xterm or raw scrollback?
   - **Decision**: HYBRID (Option C) - append-only raw PTY log + periodic headless xterm checkpoints. See Decision Log.

4. **[RESOLVED]** Should Terminal.tsx start from PR #619 or main?
   - **Decision**: Start from main's Terminal.tsx and port daemon features incrementally. See Decision Log.

## Progress

### Phase 1: Contract + Conformance
- [ ] Finalize TerminalBackend interface + shared event semantics
- [ ] Document event ordering, delivery guarantees, "exit" meanings
- [x] Both backends compile with feature flag

### Phase 2: Non-Daemon Parity (Most Critical)
- [x] Resolve session.ts, manager.ts, types.ts conflicts (keep main's headless xterm)
- [x] Resolve terminal.ts router conflicts
- [x] Start from main's Terminal.tsx (merged SCROLL_TO_BOTTOM hotkey + daemon lint comment)
- [x] Run typecheck and lint ✅ Passes
- [ ] **Verify**: Non-daemon mode works identically to current main (tab switching, resize, paste, clear scrollback, exit)

### Phase 3: Daemon Attach (Warm)
- [x] Resolve daemon-manager.ts conflicts to match new TerminalBackend contract
- [x] Port daemon features to Terminal.tsx incrementally
- [x] Add getActiveTerminalManager() pattern
- [ ] **Verify**: Daemon mode works for fresh sessions + warm attaches

### Phase 4: Cold Restore
- [x] Implement cold restore with proper semantics
- [ ] Add history retention/caps (TTL/cleanup policies)
- [x] Add cold restore acknowledgment flow
- [x] **Verify**: Cold restore shows read-only view, "Start Shell" works

### Phase 5: Telemetry + Stability Gate
- [ ] Add terminal_attach event with all timings
- [ ] Add terminal_io_stats (sampled)
- [ ] Add terminal_error event
- [ ] Add write queue metrics to PtyWriteQueue
- [x] Resolve remaining conflicts (package.json, bun.lock, stores)
- [ ] Full manual QA both modes

### Exit Criteria for Daemon-as-Default Discussion
- [ ] 1-2 weeks of real telemetry (or N sessions defined)
- [ ] attach p95 comparable or better
- [ ] error rate acceptable
- [ ] no crash/orphan rate increase
- [ ] disk growth under control

## Surprises & Discoveries

### 2026-01-09: Rebase Completion

**Rebase Stats**: 25 commits rebased onto origin/main with ~17 conflicting files resolved.

**Key Conflict Resolutions**:
1. `types.ts`, `session.ts`, `manager.ts` - Kept main's headless xterm approach, added PtyWriteQueue
2. `port-manager.ts` - Kept daemon session methods, added missing `checkOutputForHint`, fixed async/await
3. `Terminal.tsx` - Merged main's SCROLL_TO_BOTTOM hotkey with daemon's lint comment
4. `workspaces.ts` - Accepted main's modular router refactoring (mergeRouters approach)
5. `terminal-history.ts` - Deleted (main removed disk-based history), then re-created (Phase 4) for cold restore

**Update (2026-01-09)**: Cold restore is implemented with disk-backed history via `HistoryWriter`/`HistoryReader` and a renderer acknowledgment flow (`ackColdRestore`).

### 2026-01-09: Cold Restore “listeners=0” Regression Fix

**Symptom**: After daemon restart/session loss, clicking **Start Shell** created a new session but terminal output never rendered; input went to the tab name. Daemon logs showed data flowing but `listeners=0` on the main-process EventEmitter.

**Root cause**: `terminal.write` can emit `exit:${paneId}` when the session is missing; the server-side `terminal.stream` observable used to call `emit.complete()` on `exit`. Since the renderer subscription key is stable (`paneId`), `@trpc/react-query` does not auto-resubscribe after completion, leaving the pane permanently detached from output.

**Fix**:
- Do **not** complete the `terminal.stream` observable on `exit` (treat exit as a state transition, not end-of-stream)
- In cold restore UI, drop any queued pre-restore events before starting the new shell and ignore terminal input while overlays are visible (prevents stale `exit` from triggering an unintended restart that clears the terminal)

**Oracle Review Flags** (2026-01-09):
- Daemon `signal()` is no-op (warn only) - potential divergence if UI relies on signals
- `kill` no longer takes `deleteHistory` at router boundary - needs privacy/retention story
- Some main-process logging not gated behind debug flag
- `TabView` takes `panes` prop but doesn't use it (lint hygiene)
- `sessionId` vs `paneId` naming inconsistency in daemon inventory

## Decision Log

- **Decision**: PR #619 should implement the same TerminalBackend contract as main's TerminalManager
  - **Rationale**: Oracle recommendation - "Define a single terminal backend contract...make the renderer talk only to that contract via existing IPC." Keeps both paths testable and allows easy switching.
  - **Date/Author**: 2026-01-09 / Andreas + Oracle consultation

- **Decision**: Keep PR #686 as default, gate daemon behind feature flag
  - **Rationale**: PR #686 already solves common pain (tab-switch persistence) with minimal complexity. Daemon adds new failure modes. Need soak time and telemetry before default.
  - **Date/Author**: 2026-01-09 / Andreas + Oracle consultation

- **Decision**: Keep PtyWriteQueue (or equivalent write serialization)
  - **Rationale**: Oracle: "Headless xterm being async doesn't guarantee ordered, bounded pty writes or safe shutdown behavior." Write serialization provides ordering, backpressure, and metrics at the backend boundary. Add queue depth metrics.
  - **Date/Author**: 2026-01-09 / Oracle review

- **Decision**: Start from main's Terminal.tsx, port daemon features incrementally
  - **Rationale**: Oracle: "Treating the Terminal.tsx rewrite as 'just a conflict' instead of a high-risk product refactor" is dangerous. Starting from main preserves recently-merged #686 behavior; daemon features can be added as guarded incremental changes with explicit verification of each behavior.
  - **Date/Author**: 2026-01-09 / Oracle review

- **Decision**: Cold restore uses HYBRID approach (Option C)
  - **Rationale**: Oracle recommendation: "Persist an append-only raw PTY output log as the durable source of truth, plus periodic headless-xterm serialized checkpoints (best-effort) to make cold restore fast, clean, and truncatable without rendering artifacts."
  - **Why not A-only (raw replay)**: Slow for big histories, truncation breaks terminal state, can re-trigger side-effects (clipboard/title queries)
  - **Why not B-only (serialized state)**: Fragile across xterm upgrades, crash-unfriendly (no clean snapshot), if B breaks = nothing works
  - **Why C (hybrid)**: Raw bytes guarantee reconstruction, checkpoints make it fast/clean, allows safe truncation via epochs
  - **Date/Author**: 2026-01-09 / Oracle review

## Risks Identified by Oracle Review

1. **Lifecycle races / orphan processes**: Attach/detach/kill during shutdown or daemon reconnect can orphan PTYs or leave sessions half-closed. Ensure "kill" is idempotent.

2. **Event ordering + replay**: Cold restore implies replaying buffered history + live stream. Without defined ordering, can double-append or interleave history/live chunks.

3. **clearScrollback semantics divergence**: Daemon mode has xterm buffer, persisted scrollback file, and renderer-side history. If clearScrollback doesn't clear all, behavior diverges by mode.

4. **Memory/disk growth**: Persisted history needs caps (bytes, lines, time) and cleanup policy. Otherwise accumulates GBs silently.

5. **Version handshake limitations**: Also need to handle stale daemon, multiple app versions, downgrade scenarios, schema migrations.

6. **Security boundary**: Daemon socket must be local-only, per-user isolation, auth token. Other local processes shouldn't read terminal output.

7. **Observability blind spots**: Without error-rate + retry telemetry, may only see "latency looks fine" while users experience silent failures.

## Additional Gaps Identified (Second Oracle Review)

8. **State machine not defined**: Need explicit session states (`new → running → detached → restored(readonly) → restarted → disposed`) and legal transitions per backend. Most orphan/race bugs disappear once explicit.

9. **On-disk format versioning**: Need `manifestVersion` evolution plan and upgrade behavior (e.g., "can't deserialize checkpoint → fallback to raw replay").

10. **Backend fallback policy**: Make deterministic and observable (e.g., "daemon requested but unhealthy → fallback to in-process with banner + telemetry").

11. **Crash consistency**: Chunk writes + atomic manifest updates (write temp → fsync → rename) so reboot doesn't corrupt history.

12. **Load testing targets**: Need explicit perf gate before phase 5 (large scrollback, high-throughput, long-lived sessions, sleep/resume).

13. **Privacy controls**: Persisted terminal output is sensitive. Need user-facing toggle + "Delete history" + retention defaults.

14. **DSR/queries on replay**: xterm may emit responses during replay; if wiring forwards them, creates loops/errors during cold restore. Need read-only mode that blocks these.

15. **Terminal size mismatch**: Checkpoints tied to cols/rows. Decide whether to restore at original size or reflow.

## Outcomes & Retrospective

(To be filled at completion)

---

## Context and Orientation

### Apps/Packages Affected

- **apps/desktop**: Primary - all terminal-related code
- **packages/local-db**: Schema for terminal persistence setting

### Key Files by Category

**Core Terminal Backend (Main Process)**:
- `apps/desktop/src/main/lib/terminal/session.ts` - PTY session creation and lifecycle
- `apps/desktop/src/main/lib/terminal/manager.ts` - TerminalManager class (non-daemon)
- `apps/desktop/src/main/lib/terminal/daemon-manager.ts` - DaemonTerminalManager class (PR #619)
- `apps/desktop/src/main/lib/terminal/types.ts` - TypeScript interfaces for sessions
- `apps/desktop/src/main/lib/terminal/index.ts` - Exports and getActiveTerminalManager()

**Terminal Router (IPC Bridge)**:
- `apps/desktop/src/lib/trpc/routers/terminal/terminal.ts` - tRPC procedures for renderer

**Renderer Terminal Component**:
- `apps/desktop/src/renderer/.../Terminal/Terminal.tsx` - Main terminal UI component
- `apps/desktop/src/renderer/.../Terminal/helpers.ts` - Terminal helper functions
- `apps/desktop/src/renderer/.../TabsContent/index.tsx` - Tab mounting logic

**Daemon Infrastructure (PR #619 only)**:
- `apps/desktop/src/main/terminal-host/` - Daemon process code
- `apps/desktop/src/main/lib/terminal-host/client.ts` - Client for main→daemon communication

### What Changed Where

| File | Main (PR #686) | PR #619 | Conflict Severity |
|------|----------------|---------|-------------------|
| session.ts | Added headless xterm, removed HistoryWriter | Added PtyWriteQueue, debug logging | **HIGH** |
| manager.ts | Uses headless.resize(), getSerializedScrollback() | Uses writeQueue, new events | **HIGH** |
| types.ts | Added headless, serializer; removed scrollback | Added writeQueue, kept scrollback | **HIGH** |
| terminal.ts | Removed deleteHistory param | Added daemon support, skipColdRestore | **MEDIUM** |
| Terminal.tsx | ~127 lines changed | ~1085 lines changed (major rewrite) | **HIGH** |
| helpers.ts | Minor changes | Significant changes for daemon | **MEDIUM** |
| TabsContent/index.tsx | Both modified | Both modified | **MEDIUM** |
| tabs/store.ts | Both modified | Both modified | **MEDIUM** |

### Terminology

- **Headless xterm**: `@xterm/headless` - Node.js terminal emulator that processes escape sequences without rendering. Used to maintain authoritative terminal state in main process.
- **SerializeAddon**: xterm addon that serializes terminal state to clean ANSI output
- **PTY**: Pseudo-terminal - the OS-level interface for terminal I/O
- **Daemon**: Background process that survives app restarts, owns PTY processes
- **Cold restore**: Recovery when daemon is missing but disk history exists (read-only view)
- **Warm attach**: Reconnecting to a live daemon session

---

## Plan of Work

### Milestone 1: Resolve Core Terminal Backend Conflicts

**Goal**: Get session.ts, manager.ts, types.ts compiling with both headless xterm (from main) and daemon support (from PR #619).

**Strategy**: The non-daemon path (TerminalManager) adopts main's headless xterm as-is. The daemon path (DaemonTerminalManager) is updated to match the same interface but delegates to daemon.

#### 1.1 session.ts

**Main's approach (keep)**:
```typescript
// Creates headless terminal for processing PTY output
export function createHeadlessTerminal(params: {
  cols: number;
  rows: number;
  scrollback?: number;
}): { headless: HeadlessTerminal; serializer: SerializeAddon }

// Serializes terminal state
export function getSerializedScrollback(session: TerminalSession): string

// Writes existing scrollback to headless terminal
export function recoverScrollback(params: {
  existingScrollback: string | null;
  headless: HeadlessTerminal;
}): boolean
```

**PR #619's additions to evaluate**:
- `PtyWriteQueue` - May not be needed with headless xterm's async writes
- Debug logging - Keep, useful for troubleshooting

**Resolution**: Accept main's headless xterm implementation. Evaluate if PtyWriteQueue is still needed (Q2).

#### 1.2 manager.ts

**Main's approach (keep)**:
- `getSerializedScrollback(session)` instead of `session.scrollback`
- `session.headless.resize(cols, rows)` on resize
- `createHeadlessTerminal()` on clearScrollback
- Removed `closeSessionHistory`, `reinitializeHistory`

**PR #619's additions to keep**:
- `terminalExit` event emission (useful for notifications router)
- `ackColdRestore()` method (no-op in non-daemon mode)
- `getSessionCountByWorkspaceId()` returning Promise (for daemon compatibility)

**Resolution**: Merge by taking main's headless xterm code, then adding PR #619's daemon-compatible interface additions.

#### 1.3 types.ts

**Main's types**:
```typescript
interface TerminalSession {
  // ... common fields
  headless: HeadlessTerminal;
  serializer: SerializeAddon;
  // removed: scrollback, historyWriter
}
```

**PR #619's types**:
```typescript
interface TerminalSession {
  // ... common fields
  scrollback: string;
  historyWriter: HistoryWriter;
  writeQueue: PtyWriteQueue;
}
```

**Resolution**: Use main's types for TerminalSession (headless-based). Keep separate SessionResult type that works for both backends.

### Milestone 2: Resolve Terminal Router Conflicts

**Goal**: terminal.ts works with both backends through `getActiveTerminalManager()`.

**Main's changes**:
- Removed `deleteHistory` parameter from kill mutation

**PR #619's changes**:
- Uses `getActiveTerminalManager()` to get either TerminalManager or DaemonTerminalManager
- Added `skipColdRestore` parameter
- Added `isColdRestore`, `previousCwd`, `snapshot` to response
- Added extensive debug logging

**Resolution**:
1. Keep main's removal of `deleteHistory` (disk history persistence is removed)
2. Keep PR #619's `getActiveTerminalManager()` pattern
3. Keep PR #619's cold restore fields (daemon-only)
4. Keep debug logging with DEBUG_TERMINAL flag

### Milestone 3: Resolve Renderer Conflicts (Terminal.tsx)

**This is the highest-risk area** - PR #619 has ~1085 lines of changes vs main's ~127.

**Main's changes**:
- Uses `serializedState` from backend
- Simplified reattach logic

**PR #619's changes**:
- Warm set mounting (CSS visibility)
- Progressive attach scheduling
- Cold restore UI (read-only until "Start Shell")
- Connection state management
- Daemon-specific lifecycle handling

**Resolution Strategy (UPDATED per Oracle review)**:
1. **Start from main's Terminal.tsx** (preserves #686 behavior)
2. Create a checklist of daemon features to port from PR #619
3. Port each feature incrementally with explicit verification
4. Guard daemon-specific features with response fields (not `isDaemonMode` global)

**Daemon Features to Port (in order)**:
- [ ] Connection state management (attach/detach lifecycle)
- [ ] Response field guards (`isColdRestore`, `snapshot`)
- [ ] Cold restore UI (read-only view with "Start Shell" button)
- [ ] Warm set mounting (CSS visibility) - may belong in TabsContent
- [ ] Progressive attach scheduling - may belong in attach-scheduler.ts

**Verification for each port**:
- Non-daemon mode still works identically to main
- No regressions in tab switching
- Feature is guarded and only activates with daemon response fields

### Milestone 4: Add Telemetry Instrumentation (EXPANDED per Oracle review)

**Goal**: Enable credible performance comparison between daemon and non-daemon modes before considering daemon-as-default.

**Oracle's minimum telemetry for "credible comparison"**:

**Event 1: `terminal_attach`** (single event, replaces duplicates)
```typescript
track("terminal_attach", {
  // Dimensions
  mode: "daemon" | "in-process",
  is_new: boolean,
  is_cold_restore: boolean,
  workspace_id_hash: string,  // Hashed for privacy
  pane_count: number,
  backend_version: string,
  daemon_version: string | null,
  app_version: string,

  // Timings (all in ms)
  attach_latency_ms: number,      // createOrAttach call → response
  ttfb_ms: number,                // Time to first data event
  ready_ms: number,               // Time to renderer "ready" state
  cold_restore_ms: number | null, // Cold restore duration if applicable
});
```

**Event 2: `terminal_io_stats`** (sampled, e.g., 1% sessions or once/minute)
```typescript
track("terminal_io_stats", {
  mode: "daemon" | "in-process",
  bytes_in: number,
  bytes_out: number,
  chunks_in: number,
  avg_chunk_size: number,
  write_queue_max_depth: number,
  write_queue_drain_ms_p95: number,
});
```

**Event 3: `terminal_error`** (on any failure)
```typescript
track("terminal_error", {
  mode: "daemon" | "in-process",
  stage: "spawn" | "handshake" | "attach" | "history" | "load" | "write",
  error_code: string,  // Normalized error type
  is_retryable: boolean,
});
```

**Implementation**:
1. Add timing instrumentation in terminal router's createOrAttach
2. Track `ttfb_ms` by measuring first `data` event after attach
3. Track `ready_ms` in renderer when terminal becomes interactive
4. Add write queue metrics to PtyWriteQueue
5. Add error tracking with normalized error codes

### Milestone 5: Integration Testing & QA

**Validation commands**:
```bash
cd apps/desktop
bun run typecheck   # No type errors
bun run lint        # No lint errors
bun test            # All tests pass
```

**Manual QA - Non-Daemon Mode**:
1. Start app with persistence disabled
2. Open terminal, run `echo "test"`
3. Switch tabs, come back - output preserved
4. Quit app, reopen - terminal is fresh (expected)

**Manual QA - Daemon Mode**:
1. Enable "Persist terminals across restarts (beta)" in Settings
2. Restart app
3. Open terminal, run `sleep 1000`
4. Quit app completely
5. Reopen app - terminal shows, `sleep` still running

---

## Concrete Steps

### Step 1: Create merge branch and identify conflicts

```bash
cd /Users/andreasasprou/projects/superset
git fetch origin
git checkout terminal-persistence-v2
git checkout -b terminal-persistence-v2-rebase
git merge origin/main --no-commit
# Review conflicts, then abort to start clean resolution
git merge --abort
```

### Step 2: Rebase approach (alternative - cleaner history)

```bash
git checkout terminal-persistence-v2
git checkout -b terminal-persistence-v2-rebase
git rebase origin/main
# Resolve conflicts commit-by-commit
```

### Step 3: After resolving all conflicts

```bash
cd apps/desktop
bun run typecheck
bun run lint
bun test
```

### Step 4: Run dev and test manually

```bash
bun dev
# Test both modes per QA checklist above
```

---

## Validation and Acceptance

**Typecheck passes**:
```bash
bun run typecheck
# Expected: No errors
```

**Lint passes**:
```bash
bun run lint
# Expected: No errors (or only pre-existing warnings)
```

**Tests pass**:
```bash
bun test
# Expected: All tests pass
```

**Non-daemon mode works**:
1. Disable persistence in Settings (or use default)
2. Open terminal, type commands, switch tabs, return
3. Terminal state preserved

**Daemon mode works**:
1. Enable "Persist terminals across restarts (beta)"
2. Restart app (required for daemon to start)
3. Open terminal, run long command
4. Quit app, reopen
5. Terminal still shows command running

---

## Idempotence and Recovery

**Rebase can be restarted**: If rebase fails partway, run:
```bash
git rebase --abort
git checkout terminal-persistence-v2
# Start fresh
```

**Branch is safe**: We work on `terminal-persistence-v2-rebase`, not the original branch.

**Conflicts are deterministic**: Same conflicts will appear each time since they're based on file history.

---

## Interfaces and Dependencies

### TerminalBackend Contract (EXPANDED per second Oracle review)

Both TerminalManager and DaemonTerminalManager must implement:

```typescript
interface TerminalBackend {
  // Capabilities (for negotiation)
  readonly capabilities: {
    supportsWarmAttach: boolean;
    supportsColdRestore: boolean;
    supportsSerialize: boolean;
    supportsReplay: boolean;
    supportsReadOnly: boolean;
  };

  // Create new session (spawns PTY)
  create(params: CreateSessionParams): Promise<SessionResult>;

  // Attach to existing session (with ordering handshake)
  attach(params: {
    paneId: string;
    mode?: 'normal' | 'readonly';  // readonly for cold restore
  }): Promise<AttachResult>;

  // Detach from session (keeps PTY alive in daemon mode)
  detach(params: { paneId: string }): void;

  // Write data to terminal
  write(params: { paneId: string; data: string }): void;

  // Resize terminal
  resize(params: { paneId: string; cols: number; rows: number }): void;

  // Kill terminal session
  kill(params: { paneId: string }): Promise<void>;

  // Clear scrollback (starts new "epoch" in hybrid storage)
  clearScrollback(params: { paneId: string }): void;

  // Acknowledge cold restore - converts readonly → start new shell
  ackColdRestore(paneId: string): void;

  // Set read-only mode (blocks onData wiring, DSR/OSC responses)
  setReadOnly(params: { paneId: string; enabled: boolean }): void;

  // Get session count for workspace
  getSessionCountByWorkspaceId(workspaceId: string): Promise<number>;

  // Events
  on(event: `data:${string}`, listener: (data: string) => void): this;
  on(event: `exit:${string}`, listener: (code: number, signal: number) => void): this;
  on(event: 'terminalExit', listener: (info: { paneId: string; exitCode: number; signal: number }) => void): this;
  on(event: `title:${string}`, listener: (title: string) => void): this;
  on(event: `cwd:${string}`, listener: (cwd: string) => void): this;
  on(event: `error:${string}`, listener: (error: Error) => void): this;
  on(event: 'backendFallback', listener: (info: { paneId: string; from: string; to: string; reason: string }) => void): this;
}

interface AttachResult {
  snapshot?: string;           // Serialized state if available
  snapshotSeq?: number;        // Sequence number of snapshot
  replayFromSeq?: number;      // Where to start replay from
  replayFromByteOffset?: number;
  mode: 'normal' | 'readonly';
}
```

### SessionResult (Response from createOrAttach)

```typescript
interface SessionResult {
  isNew: boolean;
  scrollback: string;         // Serialized terminal state
  wasRecovered: boolean;      // True if reattached to existing session

  // Daemon-only fields (undefined in non-daemon mode)
  isColdRestore?: boolean;    // True if restored from disk (no live session)
  previousCwd?: string;       // CWD from before restart
  snapshot?: string;          // Full terminal snapshot for renderer
}
```

### Dependencies

**Existing (no changes needed)**:
- `@xterm/headless` - Headless terminal emulator
- `@xterm/addon-serialize` - Serialization addon
- `node-pty` - PTY interface
- `posthog-node` - Analytics

**PR #619 additions (to keep)**:
- Daemon process infrastructure (already in PR #619)

---

## Telemetry Events to Add

```typescript
// In terminal router or manager
track("terminal_session_created", {
  pane_id: paneId,
  workspace_id: workspaceId,
  mode: isDaemonMode ? "daemon" : "in-process",
  is_cold_restore: result.isColdRestore ?? false,
  is_warm_attach: !result.isNew && !result.isColdRestore,
  attach_latency_ms: Date.now() - startTime,
});

// For performance comparison
track("terminal_attach_latency", {
  mode: isDaemonMode ? "daemon" : "in-process",
  latency_ms: attachLatency,
  is_new: result.isNew,
});
```

---

## Artifacts and Notes

### Conflict File List (17 files)

```
apps/desktop/package.json
apps/desktop/src/lib/trpc/routers/terminal/terminal.ts
apps/desktop/src/lib/trpc/routers/workspaces/workspaces.ts
apps/desktop/src/main/lib/terminal-history.ts
apps/desktop/src/main/lib/terminal/manager.test.ts
apps/desktop/src/main/lib/terminal/manager.ts
apps/desktop/src/main/lib/terminal/port-manager.ts
apps/desktop/src/main/lib/terminal/session.ts
apps/desktop/src/main/lib/terminal/types.ts
apps/desktop/src/main/lib/window-state/bounds-validation.test.ts
apps/desktop/src/renderer/.../TabsContent/index.tsx
apps/desktop/src/renderer/.../TabsContent/TabView/index.tsx
apps/desktop/src/renderer/.../TabsContent/TabView/TabPane.tsx
apps/desktop/src/renderer/.../Terminal/helpers.ts
apps/desktop/src/renderer/.../Terminal/Terminal.tsx
apps/desktop/src/renderer/stores/tabs/store.ts
bun.lock
```

### Key Insight from Oracle

> "Keep #686 as the default backend implementation; gate the daemon backend behind a feature flag. Add protocol/version handshake between app ↔ daemon and a hard rule: on mismatch, restart daemon or fall back to non-daemon."

### Risk Mitigation

1. **Feature flag**: Daemon mode is opt-in beta
2. **Fallback**: If daemon fails, can fall back to in-process mode
3. **Telemetry**: Compare performance before considering daemon-as-default
4. **Version handshake**: Prevent undefined behavior on app/daemon version mismatch

---

## Revision History

- **2026-01-09 11:00**: Second Oracle review (fresh context):
  - **Resolved Q3**: Cold restore uses HYBRID approach - append-only raw PTY log + periodic headless xterm checkpoints
  - Added 8 additional gaps/risks (state machine, on-disk versioning, fallback policy, crash consistency, load testing, privacy, DSR on replay, size mismatch)
  - Expanded TerminalBackend contract: capabilities negotiation, attach handshake with ordering, explicit read-only mode, additional events (title, cwd, error, backendFallback)
  - Defined AttachResult interface for proper ordering handshake
  - Effort estimate: Large (3d+) for full rebase; Short-Medium (1-2d) for cold-restore storage shape

- **2026-01-09 10:30**: Updated with Oracle review feedback:
  - Changed Terminal.tsx strategy: start from main, port daemon features incrementally (not start from PR #619)
  - Resolved PtyWriteQueue question: keep it for write serialization/backpressure
  - Expanded telemetry to Oracle's "credible comparison" spec (terminal_attach, terminal_io_stats, terminal_error)
  - Added Risks section from Oracle review
  - Restructured Progress into 5 phases with explicit verification gates
  - Added Exit Criteria for Daemon-as-Default discussion

- **2026-01-09 09:52**: Initial draft created based on conflict analysis and Oracle consultation
