# Terminal persistence via Superset-owned terminal host daemon (Desktop)
 
This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.
 
No `PLANS.md` file was found in this repository at the time of writing. Follow the ExecPlan template requirements embedded in the prompt for structure, idempotence, and validation.
 
## Purpose / Big Picture
 
After this change, a Superset Desktop user can enable “terminal session persistence” and then:
 
1. Open a terminal pane and start a long-running terminal UI (a “TUI”, e.g. `vim`, `htop`, `opencode`, `less`).
2. Quit Superset Desktop (including via auto-update install flow).
3. Reopen Superset Desktop and see the terminal come back exactly as it was (“perfect resume”): the screen contents match, the cursor/modes match, and interactive input works immediately (arrow keys, mouse, bracketed paste, etc.).
4. While the app was closed, the terminal continued running and its output was captured; reopening shows the up-to-date TUI state and recent scrollback.
 
The key implementation change is introducing a long-lived background “terminal host” process (a daemon) that owns the PTYs and maintains terminal emulation state while the Electron app is closed. The Electron main process becomes a client of this daemon and continues to expose the same TRPC terminal interface to the renderer.
 
## Assumptions
 
1. This work targets `origin/main` and will be implemented on a new branch created from `origin/main` (e.g. `feat/terminal-host-daemon`).
2. macOS is the primary supported platform today; Linux is secondary. Windows support is explicitly deferred but must be feasible with the chosen abstractions.
3. The project continues to use `node-pty` as the PTY implementation for macOS/Linux (current dependency in `apps/desktop/package.json`).
4. The renderer continues to use xterm.js (`@xterm/xterm`) as the visible terminal UI (current implementation under `apps/desktop/src/renderer/.../Terminal`).
5. “Survive app updates” means: installing an update (on macOS via `electron-updater`) does not kill terminal sessions; a newly-launched updated app can attach to the already-running sessions.
6. “Perfect TUI resume” is interpreted strictly: the user should not need to “press a key to redraw” or rely on application-specific repaint behavior; the terminal state must be restored deterministically from the daemon-maintained emulator state.
 
If any assumption is wrong, record the correction in `Decision Log` and update all impacted sections.
 
## Open Questions

**All questions resolved.** See Decision Log for details.

1. ~~Persistence default and UX~~ → **RESOLVED**: Opt-in setting in Behaviors page, default off.
2. ~~Update/version skew policy~~ → **RESOLVED**: (A) Old daemon continues; additive protocol changes only.
3. ~~Output retention bounds~~ → **RESOLVED**: Configurable settings; defaults 10k lines + 4 MB disk per session.
4. ~~Multi-window semantics~~ → **RESOLVED**: Not applicable; single client per session.
5. ~~Security posture~~ → **RESOLVED**: User-only socket + token file.
6. ~~"Perfect resume" acceptance set~~ → **RESOLVED**: Test opencode, claude code, codex.

## Progress
 
- [x] (2025-12-29 18:58 local) Create new branch from `origin/main` and add this ExecPlan.
- [x] (2025-12-29 19:30 local) Implement prototyping harness for headless emulation + snapshot round-trip. **Milestone 1 complete** - 29 tests pass.
- [x] (2025-12-29 19:45 local) Implement daemon entrypoint and IPC framing. **Milestone 2 complete** - 6 tests pass.
  - Created daemon entrypoint at `apps/desktop/src/main/terminal-host/index.ts`
  - Updated `electron.vite.config.ts` to build daemon as separate bundle
  - Implemented NDJSON protocol over Unix domain socket
  - Implemented token-based authentication
  - All hello/auth tests passing
- [x] (2025-12-29 20:00 local) Implement daemon session manager (PTY + headless emulator + capture). **Milestone 3 substantially complete** - 9 tests pass, 4 skipped (PTY tests).
  - Created `Session` class with PTY + HeadlessEmulator integration
  - Created `TerminalHost` class for session lifecycle management
  - Implemented all IPC handlers (createOrAttach, write, resize, detach, kill, killAll, listSessions, clearScrollback)
  - Data/exit event streaming to attached clients implemented
  - Note: Some integration tests skipped due to bun/node-pty compatibility issue (see Surprises)
  - Output capture to disk (ring buffer) deferred to later milestone
- [x] (2025-12-29 19:30 local) Integrate daemon client into Electron main process and preserve existing TRPC API. **Milestone 4 substantially complete**.
  - Created `TerminalHostClient` at `apps/desktop/src/main/lib/terminal-host/client.ts`
    - Manages connection to daemon socket
    - Spawns daemon if not running (detached process with ELECTRON_RUN_AS_NODE=1)
    - Handles authentication and request/response framing
    - Forwards data/exit events via EventEmitter
  - Created `DaemonTerminalManager` at `apps/desktop/src/main/lib/terminal/daemon-manager.ts`
    - Same interface as original `TerminalManager`
    - Delegates all operations to `TerminalHostClient`
    - Maintains EventEmitter compatibility for TRPC subscriptions
  - Updated `apps/desktop/src/main/lib/terminal/index.ts`
    - Added `getActiveTerminalManager()` function
    - Controlled by `SUPERSET_TERMINAL_DAEMON=1` env var for testing
  - Updated TRPC terminal router to:
    - Use `getActiveTerminalManager()` for manager selection
    - Return snapshot payload in `createOrAttach` response
  - Build passes, tests pass (362 pass, 4 skip, 1 fail - pre-existing)
  - Note: Manual testing pending - set `SUPERSET_TERMINAL_DAEMON=1` and run `bun dev`
- [ ] Update renderer terminal to apply daemon snapshot + mode rehydration before streaming.
- [ ] Add persistence setting + quit/update behavior changes; add "Stop background sessions" control.
- [ ] Add tests + manual acceptance checklist; document known limitations and recovery steps.
- [ ] Fill in Outcomes & Retrospective; move plan to `.agents/plans/done/` when PR is created.
 
## Surprises & Discoveries
 
- **bun/node-pty test compatibility issue** (2025-12-29): When running integration tests with real PTYs via bun, there's an internal node-pty error: `this._socket.write is not a function`. This affects PTY write operations in the test environment. The existing TerminalManager tests work around this by mocking node-pty entirely. For the daemon, we've skipped the PTY-dependent integration tests and will rely on manual testing until this is resolved. The core daemon infrastructure (socket, auth, NDJSON protocol) is fully tested.
 
## Decision Log

Add entries here as decisions are made and questions are resolved.

- **Decision (Q1): Persistence default and UX** — RESOLVED
  Setting added to Behaviors settings page with default **off**.
  Rationale: Lower risk for v1; users consciously opt-in to background daemon behavior. Can flip to default-on in future release once confidence is high.
  Date: 2025-12-29.

- **Decision (Q2): Update/version skew policy** — RESOLVED
  **(A) Old daemon continues running** when app updates. New app speaks old protocol.
  Protocol changes must be additive-only. If breaking change required, bump `protocolVersion` and show user prompt to restart terminals.
  Rationale: The whole point of persistence is surviving app restarts — updates are the primary restart trigger.
  Date: 2025-12-29.

- **Decision (Q3): Output retention bounds** — RESOLVED
  Configurable via Behaviors settings page. Defaults:
  - Emulator scrollback: **10,000 lines** (range: 1k–100k)
  - Disk ring buffer: **4 MB per session** (range: 1–32 MB)
  Rationale: Users may have 100+ terminals; conservative defaults (100 sessions × 4 MB = 400 MB disk) prevent resource exhaustion. Power users can increase via settings.
  Date: 2025-12-29.

- **Decision (Q4): Multi-window attach semantics** — RESOLVED
  **Not applicable.** The same terminal pane cannot be visible in multiple windows simultaneously due to app architecture. Implementation assumes single attached client per session — no fanout logic needed.
  Rationale: Simplifies protocol and eliminates race conditions.
  Date: 2025-12-29.

- **Decision (Q5): Security posture** — RESOLVED
  **User-only socket + token file** is sufficient.
  - `SUPERSET_HOME_DIR` created with mode `0700`
  - Socket at `~/.superset/terminal-host.sock` inherits directory permissions
  - Token file at `~/.superset/terminal-host.token` with mode `0600`
  - Token is 32+ bytes from `crypto.randomBytes`, hex-encoded
  - Token validated on every `hello` request
  Rationale: Local-only threat model; if attacker has same-user access, they can already kill the daemon or read process memory. Token prevents accidental cross-user access.
  Date: 2025-12-29.

- **Decision (Q6): "Perfect resume" acceptance set** — RESOLVED
  Test the following AI coding agents (primary use case for Superset users):
  - **opencode**
  - **claude code** (Anthropic's Claude CLI)
  - **codex** (OpenAI Codex CLI)
  These stress long-running sessions, bracketed paste, and complex terminal modes — the exact workflows being optimized.
  Date: 2025-12-29.

## Outcomes & Retrospective
 
(to be filled as milestones complete)
 
## Context and Orientation
 
This repository is a Bun + Turborepo monorepo. The Superset Desktop app lives under `apps/desktop/` and is built with Electron + `electron-vite`.
 
In Desktop, there are three relevant runtime “sides”:
 
1. Main process (Node.js/Electron environment): `apps/desktop/src/main/`
   This can use Node.js modules and is responsible for creating BrowserWindows, running the local SQLite DB, managing terminals, etc.
2. Renderer process (browser environment): `apps/desktop/src/renderer/`
   This cannot import Node.js modules. It renders the UI and hosts xterm.js terminal UI components.
3. Shared modules: `apps/desktop/src/shared/`
   These must not import Node.js modules; they’re used by both main and renderer.
 
Today’s terminal architecture (before this change):
 
1. Renderer terminal UI: `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/Terminal.tsx`
   - Creates a visible xterm.js instance.
   - Calls TRPC mutations to create/attach a session, write input, resize, detach, clear scrollback.
   - Subscribes to a TRPC stream of terminal output events.
2. TRPC terminal router: `apps/desktop/src/lib/trpc/routers/terminal/terminal.ts`
   - Exposes `createOrAttach`, `write`, `resize`, `kill`, `detach`, `clearScrollback`, and `stream`.
   - Delegates to `terminalManager` in the main process.
3. TerminalManager: `apps/desktop/src/main/lib/terminal/manager.ts`
   - Owns `node-pty` processes in-memory and emits `data:<paneId>` and `exit:<paneId>` events.
   - On app quit, the main process calls `terminalManager.cleanup()` from `apps/desktop/src/main/index.ts`, killing PTYs.
4. Terminal history: `apps/desktop/src/main/lib/terminal-history.ts`
   - Writes scrollback to disk under `~/.superset*/terminal-history/...` for recovery within a running app session.
 
Why this is insufficient for persistence:
 
- A PTY session cannot be “reattached” after the owning process exits. Today, the Electron main process owns the PTYs, so quitting the app necessarily kills sessions.
 
New architecture required:
 
- Introduce a persistent background process that owns PTYs and the “terminal emulator state” so sessions outlive app restarts and TUIs remain correct even when the renderer is closed.
 
Terminology used in this plan (definitions):
 
- PTY (pseudo-terminal): the OS interface that lets us run a shell/program as if it’s connected to a terminal. `node-pty` provides a cross-platform-ish API to spawn PTYs.
- TUI: a text-based interactive UI that relies on terminal modes, cursor addressing, alternate screen buffers, mouse tracking, etc.
- Terminal emulator: software that interprets control sequences (ANSI/VT) to maintain a screen buffer and state. xterm.js is one.
- Daemon (terminal host): a background process that continues running after the Electron app exits.
- Snapshot/rehydration: the daemon provides enough information (screen contents + mode state) for the renderer to recreate the exact terminal state on attach.
 
## Plan of Work
 
This work is intentionally milestone-driven. Each milestone must leave the repository in a runnable/testable state and must be independently verifiable. Do not attempt to “big bang” the whole daemon + UI rewrite in one pass.
 
### Milestone 1: Prototyping spike — prove “perfect resume” is achievable
 
Goal: demonstrate, in code checked into this repo, that we can:
 
1. Feed terminal output into a headless terminal emulator (in Node), keep it running while no UI exists, and
2. Produce a snapshot that can be applied to a fresh xterm.js instance such that interactive input behavior matches (application cursor keys, bracketed paste, mouse tracking).
 
Work to do:
 
1. Add a prototyping script + tests under `apps/desktop/src/main/lib/terminal-host/prototype/`:
   - `apps/desktop/src/main/lib/terminal-host/prototype/headless-roundtrip.test.ts`
   - The test should:
     - Create a headless emulator instance.
     - Apply a sequence of terminal bytes that:
       - Enters alternate screen, draws a screen, moves cursor.
       - Enables application cursor keys (`CSI ? 1 h`) and bracketed paste (`CSI ? 2004 h`).
       - Enables mouse mode (choose one: `CSI ? 1000 h` and SGR `CSI ? 1006 h`).
     - Produce a snapshot payload: `{ snapshotAnsi: string, modes: {...} }`.
     - Apply it into a fresh xterm.js instance in Node (or a second headless instance) and assert:
       - The visible buffer text matches expected lines.
       - The emulator’s mode flags are consistent (for flags we explicitly track).
2. Dependency choice:
   - Add `@xterm/headless` to `apps/desktop/package.json` (used only in main/daemon code).
   - Reuse `@xterm/addon-serialize` (already present) for snapshot generation.
3. Decide “source of truth” for query responses:
   - While *no renderer client is attached*, the daemon must send xterm-generated query responses back to the PTY.
   - While *a renderer client is attached*, the renderer continues sending xterm’s `onData` to backend (as today), and the daemon must not double-respond.
 
Exit criteria / proof:
 
- `cd apps/desktop && bun test` includes the new headless round-trip test and it passes.
 
If the spike fails (serialize cannot rehydrate required state), update this ExecPlan with a pivot: track mode state explicitly and reapply via control sequences on attach, even if the snapshot only contains screen text.
 
### Milestone 2: Add a terminal host daemon entrypoint and IPC framing
 
Goal: add a runnable daemon process that can start, accept a connection, and respond to a `hello` request. No PTYs yet.
 
Work to do:
 
1. Create a new daemon entrypoint:
   - `apps/desktop/src/main/terminal-host/index.ts`
   This file is executed in a Node context (via Electron with `ELECTRON_RUN_AS_NODE=1`) and must not import any renderer/shared browser-only modules.
2. Update build configuration to produce the daemon bundle:
   - In `apps/desktop/electron.vite.config.ts`, add an additional Rollup input for the main build so `dist/main/terminal-host.js` is built alongside `dist/main/index.js`.
3. Implement IPC message framing:
   - Use a newline-delimited JSON protocol (NDJSON) over a local socket:
     - request: `{ id: string, type: string, payload: object }`
     - response: `{ id: string, ok: true, payload: object }` or `{ id: string, ok: false, error: { code: string, message: string } }`
     - events: `{ type: "event", event: string, payload: object }`
   - This keeps early prototypes simple and debuggable.
4. Socket location:
   - macOS/Linux: Unix domain socket at `join(SUPERSET_HOME_DIR, "terminal-host.sock")`.
   - Ensure permissions by relying on existing `SUPERSET_HOME_DIR` mode `0700` (created by local-db initialization). If that’s not guaranteed early enough, explicitly `mkdir/chmod` within daemon.
5. Auth token:
   - Generate a random token on first run and write to `join(SUPERSET_HOME_DIR, "terminal-host.token")` with `0600`.
   - Require the client to send it in `hello`.
 
Exit criteria / proof:
 
- A small Node script in main can connect and get a valid `hello` response.
 
### Milestone 3: Daemon session manager (PTY + headless emulator + capture)
 
Goal: daemon can create sessions (spawn PTY), keep them running when no clients are attached, continuously capture output to disk, and provide attach snapshots.
 
Work to do:
 
1. Define daemon session identity and lifecycle:
   - Session ID should be stable across restarts and updates. Use `workspaceId` + `paneId` from existing TRPC inputs.
   - Store per-session metadata (cwd, createdAt, lastAttachedAt, cols/rows).
2. Implement a `TerminalHost` in `apps/desktop/src/main/lib/terminal-host/`:
   - `TerminalHost` holds a `Map<sessionId, Session>`.
   - Each `Session` owns:
     - the `node-pty` process
     - a headless xterm instance (“emulator of record”)
     - a bounded on-disk log (ring buffer) and minimal metadata file
     - a set of currently attached clients (0 or more) and their stream subscriptions
3. Emulator responsibilities:
   - All PTY output is fed into the headless emulator to maintain state.
   - The headless emulator’s `onData` is treated as “terminal-generated responses”.
     - If `attachedClients === 0`: write these responses to the PTY (so TUIs keep functioning while app closed).
     - If `attachedClients > 0`: do not write (renderer is responsible; avoids duplicate responses).
4. Snapshot API:
   - `attach(sessionId, cols, rows)` returns:
     - `snapshotAnsi`: serialized screen state string suitable to `xterm.write()`.
     - `rehydrateSequences`: a small set of control sequences to restore input-affecting modes (application cursor keys, bracketed paste, mouse reporting, focus reporting, alt-screen, cursor visibility).
     - `cwd` (best-effort, derived from OSC-7 parsing in output; see note below).
     - `meta` including `attachedAt`, `cols/rows`.
   - The daemon must keep mode state explicitly (don’t rely on private xterm internals).
     - Track DECSET/DECRST `CSI ? Pm h/l` for the specific mode numbers needed.
5. CWD tracking:
   - Move OSC-7 parsing to a shared module under `apps/desktop/src/shared/parse-cwd.ts` (no Node imports).
   - The daemon parses PTY output stream to update `session.cwd`.
6. Output capture while closed:
   - Write the raw output stream (post-clear-filtering if desired) to a bounded file (ring).
   - Also keep emulator scrollback bounded via xterm options.
 
Exit criteria / proof:
 
- Manual: start daemon, create session, run a TUI, detach client (simulate by closing app window), confirm process continues and output grows in ring file, then reattach and see correct screen.
- Automated: add at least one integration-style test that spawns a short-lived PTY program that uses alternate screen + cursor movement and validate snapshot round-trip.
 
### Milestone 4: Electron main integration (client + TRPC compatibility)
 
Goal: keep the renderer’s TRPC interface mostly unchanged, but route terminal operations through the daemon instead of owning PTYs in-process.
 
Work to do:
 
1. Add a `TerminalHostClient` in main:
   - `apps/desktop/src/main/lib/terminal-host/client.ts`
   - Responsibilities:
     - Ensure daemon is running (start if not).
     - Maintain a connection pool (or single connection) and reconnect logic.
     - Expose typed methods: `createOrAttach`, `write`, `resize`, `detach`, `kill`, `clearScrollback`, `subscribe`.
2. Start/ensure daemon:
   - Spawn detached `process.execPath` with `ELECTRON_RUN_AS_NODE=1` and script path pointing at `dist/main/terminal-host.js`.
   - In dev, use the built script path in the workspace; in prod, resolve via `app.getAppPath()` + `dist/main/terminal-host.js` equivalent.
3. Preserve `terminalManager` interface:
   - Refactor `apps/desktop/src/main/lib/terminal/manager.ts` into a thin adapter that:
     - keeps the existing EventEmitter (`data:<paneId>`, `exit:<paneId>`)
     - delegates operations to `TerminalHostClient`
     - no longer spawns `node-pty` directly (that code moves into daemon).
4. Update TRPC router:
   - `apps/desktop/src/lib/trpc/routers/terminal/terminal.ts` should continue to work with the same calls, but `createOrAttach` must return the daemon snapshot payload.
   - Add a backwards-compatible response shape by adding optional fields rather than breaking existing ones, then migrate renderer.
 
Exit criteria / proof:
 
- `bun dev` for Desktop works; opening a terminal shows output; basic typing works.
 
### Milestone 5: Renderer rehydration path (snapshot + mode restore + streaming)
 
Goal: on attach, the renderer restores a perfect terminal state before streaming live output.
 
Work to do:
 
1. Update `apps/desktop/src/renderer/.../Terminal/Terminal.tsx`:
   - Replace “write `result.scrollback`” with:
     - apply `result.rehydrateSequences` first (these are control sequences that update xterm mode state)
     - apply `result.snapshotAnsi` next
     - only then enable subscription consumption (`subscriptionEnabled = true`) and flush queued events.
2. Ensure user input is sent unchanged:
   - Keep using `xterm.onData` and send to backend via TRPC `write`.
   - This includes query responses; daemon must ignore responses while attached (per Milestone 3).
3. Handle resize:
   - On resize, send `resize` to daemon; daemon resizes PTY and also updates emulator dimensions.
4. Recovery UI:
   - If attach fails due to daemon mismatch or missing session, show a small UI affordance:
     - “Session ended” (if PTY exited)
     - “Restart terminal” (creates new session)
 
Exit criteria / proof:
 
- Manual acceptance: pick a TUI, quit app, reopen, resume and immediately interact with correct behavior.
 
### Milestone 6: Persistence setting + quit/update behavior + “stop daemon” control
 
Goal: make persistence user-controlled, safe by default, and compatible with auto-update install flow.
 
Work to do:
 
1. Local DB settings:
   - Add to local DB schema (`packages/local-db/src/schema/schema.ts`):
     - `terminalPersistenceEnabled` boolean (default: false)
     - `terminalScrollbackLines` integer (default: 10000, range: 1000–100000)
     - `terminalDiskBufferMb` integer (default: 4, range: 1–32)
   - Expose via settings TRPC router (`apps/desktop/src/lib/trpc/routers/settings/index.ts`) with optimistic UI patterns consistent with existing settings.
2. Behavior settings UI:
   - Add under behavior settings in the renderer:
     - Toggle: "Enable terminal persistence" (default off) — Keep terminal sessions alive when Superset is closed
     - Number input: "Scrollback lines" (default 10000) — Lines of history kept per terminal
     - Number input: "Disk buffer per terminal" (default 4 MB) — Output captured while app is closed
   - Add an explicit button: "Stop background terminal sessions":
     - Calls daemon `killAll` and stops daemon (or marks it idle and allows exit).
3. App quit behavior:
   - When persistence is enabled, do not kill sessions on quit. The app should simply detach/disconnect.
   - When persistence is disabled, keep the current behavior (cleanup kills PTYs).
4. Auto-update install behavior:
   - Ensure the “install update” path does not kill sessions even if it triggers a forced quit.
 
Exit criteria / proof:
 
- Toggle on → sessions survive quit/reopen.
- Toggle off → quitting kills sessions (existing behavior).
- Update install flow (manual) does not kill sessions.
 
### Milestone 7: Hardening, tests, and future-proofing (Windows)
 
Goal: reduce operational risk and lay groundwork for Windows.
 
Work to do:
 
1. Orphan cleanup:
   - On app start, compare current panes (from app state) with daemon sessions; kill sessions not referenced after a grace period.
2. Crash recovery:
   - If daemon crashes, main should detect and show “sessions lost; restart terminal” rather than hanging.
3. Protocol compatibility:
   - Establish a stable protocol version (`protocolVersion: 1`) and enforce additive changes only.
   - Add a compatibility test that simulates missing optional fields.
4. Windows groundwork (no implementation yet):
   - Abstract socket path selection so future named pipe support can be plugged in without rewriting the daemon.
   - Identify the Windows-specific risks (ConPTY differences, process detachment semantics) and document them in-code.
 
Exit criteria / proof:
 
- `cd apps/desktop && bun test` passes.
- Manual acceptance checklist completed and recorded in PR description (not in this ExecPlan).
 
## Concrete Steps
 
All commands are from repo root unless stated otherwise.
 
1. Create work branch:
 
   - `cd /Users/andreasasprou/Documents/superset`
   - `git checkout -b feat/terminal-host-daemon origin/main`
 
2. Run Desktop tests while iterating:
 
   - `cd apps/desktop`
   - `bun test`
 
   Expected: existing tests pass; new tests added by this plan should fail before their implementation and pass after.
 
3. Run Desktop dev build:
 
   - `cd /Users/andreasasprou/Documents/superset`
   - `bun dev`
 
   Expected: Electron app launches; terminals function.
 
4. Manual persistence demo (post-implementation):

   - Enable persistence toggle in Settings → Behavior.
   - Open a terminal pane and run one of the target AI agents: `opencode`, `claude`, or `codex`.
   - Interact with the agent (start a conversation, let it generate code).
   - Quit the app (Cmd+Q).
   - Reopen the app and verify:
     - Screen content matches pre-quit state exactly.
     - Cursor is in correct position.
     - Arrow keys work correctly (not printing escape codes).
     - Can immediately continue interacting without redraw.
   - While app is closed, optionally run a command that prints periodically (e.g. `watch date`) and confirm it progressed when reattached.
 
## Validation and Acceptance
 
Acceptance is met when all of the following are true:
 
1. Persistence disabled (default): quitting Superset kills terminal sessions (current behavior).
2. Persistence enabled: terminal sessions survive app quit/reopen; output continues to be captured while app is closed.
3. Perfect TUI resume: the following AI coding agents resume with correct screen state and correct interactive input semantics immediately on reopen:
   - **opencode**
   - **claude code** (Anthropic's Claude CLI)
   - **codex** (OpenAI Codex CLI)
4. Update survival: using the in-app update install flow does not kill persistent sessions; reopening the updated app can attach to existing sessions.
5. Automated tests exist for the headless snapshot round-trip and pass in CI-equivalent `bun test` runs.
 
## Idempotence and Recovery
 
This plan should be safe to apply incrementally:
 
- Each milestone adds functionality behind stable interfaces and can be rerun.
- Socket + token files under `SUPERSET_HOME_DIR` must be created with safe permissions and should not be overwritten unexpectedly. If regeneration is needed (e.g. token compromised), provide an explicit “reset daemon” action and document it.
- If the daemon fails to start or protocol mismatch occurs, the app must fail gracefully: show a recoverable error and allow “Restart terminal” (non-persistent) rather than hanging.
 
Rollback strategy (if needed):
 
- Keep the old in-process `TerminalManager` path behind a feature flag during migration (temporary).
- If daemon integration is unstable, disable the persistence toggle and fall back to in-process PTY ownership.
 
## Artifacts and Notes
 
When implementing, capture short evidence snippets here (examples, not code fences):
 
- Example of successful daemon handshake log output.
- Example of a snapshot payload size and attach timing.
- Example of a TUI resume manual checklist with timestamps.
 
## Interfaces and Dependencies
 
### New dependencies (Desktop app)
 
In `apps/desktop/package.json`, add:
 
- `@xterm/headless` (Node-only headless emulator in daemon)
 
Reuse existing:
 
- `@xterm/addon-serialize` (snapshot generation)
- `node-pty` (PTY spawning in daemon)
 
### Required modules and types
 
Create `apps/desktop/src/main/lib/terminal-host/types.ts` with stable protocol shapes:
 
    export interface TerminalHostHelloRequest { token: string; protocolVersion: 1 }
    export interface TerminalHostHelloResponse { protocolVersion: 1; daemonVersion: string }
 
    export interface AttachResult {
      snapshotAnsi: string;
      rehydrateSequences: string;
      cwd: string | null;
    }
 
    export type TerminalHostRequest =
      | { type: "hello"; payload: TerminalHostHelloRequest }
      | { type: "createOrAttach"; payload: { sessionId: string; cols: number; rows: number; cwd?: string; env?: Record<string,string> } }
      | { type: "write"; payload: { sessionId: string; data: string } }
      | { type: "resize"; payload: { sessionId: string; cols: number; rows: number } }
      | { type: "detach"; payload: { sessionId: string } }
      | { type: "kill"; payload: { sessionId: string } }
      | { type: "killAll"; payload: {} };
 
Daemon must implement these and keep them backwards compatible (additive changes only).
 
### Main process integration points
 
Files that will change:
 
- `apps/desktop/electron.vite.config.ts` (build daemon entry)
- `apps/desktop/src/main/index.ts` (quit behavior based on setting; ensure daemon survival on quit/update)
- `apps/desktop/src/main/lib/terminal/manager.ts` (delegate to daemon client)
- `apps/desktop/src/lib/trpc/routers/terminal/terminal.ts` (return snapshot payload; stream from daemon)
- `apps/desktop/src/renderer/.../Terminal/Terminal.tsx` (apply snapshot/rehydrate)
- `packages/local-db/src/schema/schema.ts` and migrations (new setting)
- `apps/desktop/src/lib/trpc/routers/settings/index.ts` + renderer settings UI (toggle + “stop daemon”)
 
Windows future:
 
- Design IPC so it can swap UDS for named pipes without changing higher-level interfaces.
 
