# V2 Terminal Command Records and Bounded History

Last refined: 2026-04-30

## Goal

Bring the highest-leverage Warp terminal idea into Superset v2: lightweight
command records with bounded output retention.

The intent is not to replace xterm or port Warp's renderer. Superset should keep
the existing v2 terminal runtime and add a semantic layer that knows where
commands begin/end, captures useful metadata, and prevents long-running output
from growing unbounded in memory or durable storage.

## Current State

Superset v2 terminal already has:

- xterm.js runtime creation, attach/detach, resize, search, local buffer
  persistence, and renderer-side runtime registry:
  `apps/desktop/src/renderer/lib/terminal/terminal-runtime.ts`
  `apps/desktop/src/renderer/lib/terminal/terminal-runtime-registry.ts`
- host-service PTY sessions, WebSocket attach, reconnect/replay, title scanning,
  shell-ready gating, session list/kill:
  `packages/host-service/src/terminal/terminal.ts`
  `packages/host-service/src/trpc/router/terminal/terminal.ts`
- terminal link parsing/opening:
  `apps/desktop/src/renderer/lib/terminal/terminal-link-manager.ts`
  `packages/shared/src/terminal-link-parsing/`
- port ownership and kill actions:
  `packages/host-service/src/ports/`

Current gaps:

- no first-class command boundary model
- no persisted per-command metadata
- no command-specific actions such as rerun/copy output/send to chat
- initial commands are raw queued PTY writes, not tracked executions
- long output is mostly an xterm scrollback/replay concern, not a semantic
  command history concern

## Reference Ideas From Warp

Warp's useful patterns:

- each command becomes a record with command, output, cwd, git branch, exit code,
  start/end timestamps, and visibility metadata
- output retention is bounded by grid scroll limits and serialization limits
- durable command records are separate from full terminal scrollback
- AI/context workflows use summaries instead of full output
- block filtering/search operates on command output rather than one global
  terminal blob

Superset adaptation:

- store lightweight TypeScript records, not Warp's grid/block renderer
- use existing xterm as the source of terminal display
- capture bounded text summaries and metadata for features around the terminal
- expose command actions in compact UI outside/over xterm

## Proposed Data Model

Add a host-service in-memory command model first. Persist only after the behavior
is proven.

```ts
export interface TerminalCommandRecord {
	id: string;
	terminalId: string;
	workspaceId: string;
	sequence: number;
	command: string;
	cwd: string | null;
	gitBranch: string | null;
	startedAt: number;
	endedAt: number | null;
	exitCode: number | null;
	status: "running" | "succeeded" | "failed" | "unknown";
	outputHead: string;
	outputTail: string;
	outputLineCount: number;
	truncatedLineCount: number;
	byteCount: number;
	source: "user" | "initial-command" | "agent" | "system";
}
```

Retention constants should be explicit and conservative:

```ts
const COMMAND_OUTPUT_HEAD_LINES = 200;
const COMMAND_OUTPUT_TAIL_LINES = 400;
const COMMAND_OUTPUT_MAX_BYTES = 512 * 1024;
const COMMAND_RECORD_LIMIT = 500;
const COMMAND_RECORD_SNAPSHOT_LIMIT = 50;
```

Rules:

- keep metadata for the most recent `COMMAND_RECORD_LIMIT` records per
  terminal in memory
- keep bounded `head` and `tail`, never unbounded full output
- when retained output fits inside `HEAD_LINES + TAIL_LINES`, keep it all in
  `outputHead` and leave `outputTail` empty so callers never receive duplicates
- count dropped lines/bytes so UI can show that output was truncated
- keep xterm scrollback independent from command record summaries
- treat durable raw scrollback as cache only, not the source of truth for
  command history

## Shell Integration Strategy

Use shell integration markers, not output heuristics, as the primary source of
truth.

Extend the current shell integration that already emits shell-ready OSC 133
markers:

- command prompt ready: existing `OSC 133;A`
- command start / preexec: add scanner support for `OSC 133;C`, with an
  optional command-line payload when wrappers can provide it
- command finish / precmd: add scanner support for `OSC 133;D;<exitCode>`
- cwd: prefer an explicit Superset OSC marker if already available in wrappers;
  otherwise leave command-record `cwd` null until one lands
- git branch: compute asynchronously from command cwd after cwd markers land, not
  from prompt parsing

Add a shared scanner beside existing scanners:

- `packages/shared/src/terminal-command-scanner.ts`
- tests in `packages/shared/src/terminal-command-scanner.test.ts`

The scanner should be streaming-safe like the title/readiness scanners:

- handles OSC sequences split across PTY chunks
- strips Superset-only integration sequences from user-visible output
- leaves unknown OSC sequences alone unless explicitly handled elsewhere
- bounds internal buffers to avoid malicious/buggy shell output causing memory
  growth

## Host-Service Changes

Primary files:

- `packages/host-service/src/terminal/terminal.ts`
- `packages/host-service/src/trpc/router/terminal/terminal.ts`
- `packages/shared/src/terminal-command-scanner.ts`

Add a command-record manager inside the terminal module or colocated as:

- `packages/host-service/src/terminal/command-records.ts`

Responsibilities:

- maintain per-terminal record state
- start a record on command-start marker
- append visible plain-text output to current record using bounded head/tail
  retention after shell-integration OSC stripping
- finish a record on command-finish marker
- detect cancelled/unknown cases when PTY exits mid-command
- expose list/get summary APIs
- emit low-volume WebSocket messages when record state changes
- compact reconnect snapshots to the most recent 50 records and cap included
  output text; full older summaries should come from explicit list/get queries

New WebSocket server messages:

```ts
type TerminalServerMessage =
	| ExistingMessages
	| { type: "commandRecordsSnapshot"; records: TerminalCommandRecord[] }
	| { type: "commandRecordStarted"; record: TerminalCommandRecord }
	| { type: "commandRecordUpdated"; record: TerminalCommandRecord }
	| { type: "commandRecordFinished"; record: TerminalCommandRecord };
```

Avoid sending updates on every output chunk. Send:

- on record start
- on record finish
- throttled running updates every 500-1000 ms if visible UI needs live counts

New tRPC endpoints:

- `terminal.listCommandRecords({ workspaceId, terminalId, limit? })`
- `terminal.getCommandRecord({ workspaceId, terminalId, recordId })`
- `terminal.rerunCommand({ workspaceId, terminalId, recordId })`

`rerunCommand` should use the new command execution API described below.

Renderer caches should enforce the same command-record count cap as the host
service. Reconnect snapshots remain smaller and should only include the most
recent compacted records.

## First-Class Command Execution API

Add a safer command execution path instead of writing raw bytes everywhere.

```ts
type TerminalClientMessage =
	| ExistingMessages
	| {
			type: "runCommand";
			commandId?: string;
			command: string;
			source?: "user" | "initial-command" | "agent" | "system";
	  };
```

Host behavior:

- wait for shell-ready/prompt-ready when supported
- clear the current prompt buffer safely before injection once prompt-ready is
  known
- v1 requires shell-integration markers for semantic tracking; if a shell lacks
  support, fall back to raw write and do not fabricate command boundaries
- append shell-specific enter bytes
- associate the next command-start event with the provided command id/source via
  a FIFO expected-command queue and a 30s correlation window measured from the
  actual write after shell readiness
- if a queued command is stale when the next marker arrives, drop it with a warn
  log and treat the marker as a user command

Do this incrementally:

1. support zsh/fish shells already covered by reliable command markers
2. keep raw `input` untouched for normal typing/TUIs
3. route `initialCommand` through `runCommand`
4. later route agent/setup/rerun commands through it

## Renderer Changes

Primary files:

- `apps/desktop/src/renderer/lib/terminal/terminal-ws-transport.ts`
- `apps/desktop/src/renderer/lib/terminal/terminal-runtime-registry.ts`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/TerminalPane/TerminalPane.tsx`

Add command-record state to the terminal transport/registry:

- command record cache per terminal instance
- `onCommandRecordsChange`
- `getCommandRecords`
- `runCommand`

Initial UI should be intentionally small:

- command status chip in pane header or a collapsible side overlay
- command record list drawer/panel showing latest commands
- per-record actions:
  - copy command
  - copy output summary
  - rerun
  - send output to chat after a separate redaction design lands
  - open cwd in file tree

Do not attempt inline xterm block rendering in the first pass. It is high risk
because xterm owns layout, selection, scrollback, and hit testing.

## Bounded History Policy

Separate three concepts:

1. **Display scrollback**: xterm's configured scrollback. This is for terminal UX
   and can be cleared/recreated.
2. **Session replay buffer**: host-service short buffer used to catch detached
   renderers up. This must stay bounded and should remain byte-capped.
3. **Command history**: semantic command metadata plus bounded output summaries.
   This is the feature surface.

Recommended defaults:

- xterm scrollback: default to 50,000 lines and expose a bounded user setting
  for display scrollback so users can raise/lower live terminal history without
  changing semantic command-record retention
- host-service replay: keep existing byte cap, but do not rely on it for command
  history
- command record summaries: fixed head/tail line and byte caps
- command record count: recent 500 per terminal in memory on both host and
  renderer

If/when persistence is added:

- persist command metadata and bounded summaries only
- do not persist raw full output by default
- add a retention cleanup by workspace/session age
- keep migration in local/host-service DB only, not production DB

Potential persisted table:

```ts
terminalCommandRecords:
	id
	terminalId
	workspaceId
	sequence
	command
	cwd
	gitBranch
	startedAt
	endedAt
	exitCode
	status
	outputHead
	outputTail
	outputLineCount
	truncatedLineCount
	byteCount
	source
```

## Phased Rollout

### Phase 1: Scanner and In-Memory Records

- add streaming command scanner in `packages/shared`
- extend host-service terminal session state with current/completed records
- collect bounded plain-text output summaries from the PTY chunk pipeline after
  readiness/title scanning and shell-integration OSC stripping
- expose `terminal.listCommandRecords`
- add unit tests for chunk boundaries, malformed OSC, huge sequences, truncation

Deliverable: host-service knows command boundaries and can list recent records.

### Phase 2: Run Command API

- add `runCommand` WebSocket client message
- route `initialCommand` through `runCommand`
- use the expected-command queue for id/source correlation
- keep raw `input` behavior unchanged
- add tests around command queuing, shell readiness, and exited session behavior

Deliverable: commands launched by Superset are tracked and safer to inject.

### Phase 3: Minimal Renderer UI

- add command record transport/registry subscriptions
- add a compact command history drawer or popover in terminal header
- implement copy command, copy output summary, rerun
- include truncation notice when output summaries are incomplete

Deliverable: users can inspect and reuse command records without changing xterm
layout.

### Phase 4: Chat and Agent Integration

- after redaction is designed, add "Send output to chat" action
- include command/cwd/exit status/output summary in the message/context payload
- add "attach last failed command" convenience action
- route agent/setup command launches through `runCommand` where practical; this
  is the bridge from the host-service chat architecture into tracked terminal
  execution

Deliverable: failed tests/builds become one-click chat context.

### Phase 5: Persistence

- add host-service/local DB migration for command records
- persist bounded metadata/summaries on record finish
- prune by count/age
- restore recent command records when terminal session is reopened

Deliverable: command history survives app reloads without retaining unbounded
terminal output.

### Phase 6: Block Filtering

- add filter/search over command output summaries
- support regex/case/invert/context-line options later
- avoid full output assumptions when summaries are truncated

Deliverable: users can inspect noisy logs by command.

## Testing Plan

Unit tests:

- scanner handles OSC chunks split at every byte
- scanner strips only known integration sequences
- start/finish events create/update records correctly
- missing finish on PTY exit marks running record unknown
- output retention keeps head/tail and accurate truncation counters
- command list pruning drops oldest metadata after limit

Integration tests:

- create terminal, run command, observe record start/finish
- long output command does not exceed summary byte/line caps
- reconnecting renderer receives a `commandRecordsSnapshot` without replaying full
  output into semantic history
- `initialCommand` produces a tracked record

Manual QA:

- bash, zsh, fish
- long `yes | head -n 100000` style output
- failed test command
- cancelled command via Ctrl-C
- workspace switch/reconnect
- renderer reload/HMR during active command

## Risks and Mitigations

- **Shell marker reliability:** fall back to raw terminal behavior when markers
  are missing. Do not fabricate command boundaries from prompts in v1.
- **Pipeline ordering:** title scanning sees raw PTY bytes first, readiness
  scanning strips only the initial shell-ready marker while pending, then the
  command scanner strips OSC 133 command markers before xterm broadcast and
  command-summary retention.
- **Back-pressure:** command record management runs synchronously in the PTY
  chunk path but emits only start/finish and attach snapshots in P1. Running
  update messages must be throttled before UI subscribes to them.
- **Cross-platform parity:** zsh/fish are the first supported semantic shells.
  Bash and Windows ConPTY should degrade to normal terminal behavior until
  wrappers prove reliable command-start/finish markers there.
- **git branch timing:** compute branch at record start so it reflects where
  the command was issued, not where the command leaves the shell afterward.
  Leave it null until per-command cwd markers exist.
- **TUI/full-screen commands:** command record should track the command and final
  status, but output summaries may be less meaningful. Do not interfere with
  raw input.
- **Memory pressure from huge chunks:** enforce byte caps before appending to
  summaries and bound scanner buffers.
- **Duplicate command starts:** use command sequence/state machine guards and
  tests around malformed shell integration output.
- **UI/layout risk:** first UI is outside xterm, not inline block rendering.
- **Privacy:** do not send output summaries to chat until redaction has its own
  design; do not persist raw unlimited output.

## Open Decisions

- Should Phase 1 persist records immediately, or stay in-memory until UI proves
  useful?
- Should the default command record count stay fixed at 500, or become
  workspace-configured later?
- Should command records be scoped to terminal session only, or visible in a
  workspace-wide command history panel?

## Current Implementation Scope

The current implementation is broader than the original foundation-only PR and
spans phases 1-3:

1. `terminal-command-scanner` in `packages/shared`
2. in-memory command record manager in host-service
3. bounded head/tail output retention
4. `terminal.listCommandRecords`
5. `runCommand` plus tracked initial commands and rerun
6. renderer command-record subscriptions and compact header UI
7. configurable terminal scrollback setting wired into v1/v2 renderer xterm
   instances
8. host-side interactive input tracking so normally typed commands have titles
   instead of falling back to "Interactive command"; shell wrappers also include
   command text in start markers for stronger zsh/fish coverage
9. tests for scanner, retention, interactive input tracking, shell wrappers,
   shell launch args, and settings search

If this needs to be split before merge, keep items 1-4 as the foundation PR and
move items 5-8 into the renderer/API follow-up.
